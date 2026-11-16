import { combatHasRole } from "../combatRules"
import { AI_THINK_INTERVAL, CHARGE, COOLDOWN, MOVE_REACH, SPARRING_STEP, withinCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import { bestPortalAdvance, committedReturn, danceRailMove, dancerHingeEntry, defensiveThreat, dodgeAreaDamage, future, portalAdvance, portalOpeningValue, possiblePortalClearAt, shoreBeastStrikeValue, shortAreaThreats, walkingPortal, walkHitsWarning, walksIntoWarning, warningDamage, warningEjection } from "./aiMovement"
import { aidBeforeHit, announcedFieldErasures, announcedHit, announcedShift, announcedStrikes, displacementPoint, lifeThroughStrikes, positionAfterStrike, readyLockStrikes, runnerBreakValue, runnerContact, summonDisruptsCast, targetedFollowUps, type AnnouncedStrike, type TimedAid } from "./aiThreats"
import { aidFrom, entryWards, forecastShieldHandoff, overturePlacements, reservoirPlacements } from "./aiRescue"
import { assassinChoreography } from "./assassinChoreo"
import { BARD_SPECTRUM_FLIGHT, bardChoreography, bardFlight, spectrumRecipient } from "./bardChoreo"
import { berserkerChoreography } from "./berserkerChoreo"
import { bulwarkChoreography } from "./bulwarkChoreo"
import type { EdgeActive } from "./catalog"
import { dancerChoreography, dancerPointAt, dancerRail, REVERSE_PRINT_TRAVEL } from "./dancerChoreo"
import { CENTER, along, areaHits, areaOf, borderGap, clamp, direction, edgeDistance, fieldCrossing, inside, isOutside, left, mirror, outward, rotate, type EdgeArea, type EdgePoint } from "./geometry"
import { healerChoreography, healerFlight } from "./healerChoreo"
import { lifebringerChoreography } from "./lifebringerChoreo"
import { paladinChoreography } from "./paladinChoreo"
import type { DeploymentKind, Step } from "./program"
import { BULWARK_COVER, DEBUFFS, HEAL_CUT, attackFocus, damageScore, healingReceived, matchesCleanse, nearbyBulwark, roleDamageScale } from "./roles"
import { EXILE, assassinLockAttack, attackRange, basicTarget, berserkerMotionEnd, binderHead, binderWindupOrigin, chargeOf, chronowheelBudget, chronowheelPulses, directHitForecast, estimateDirectHit, firstCrossing, fixedAreaStrike, fixedSkillWindup, flightTime, forecastBasicCast, forecastSkillCast, furnaceFlight, healFactors, movementAllowance, movementSpeed, movementStopped, predictSkillTargets, previewContactShift, previewDirectedShove, previewInverseShove, previewSkillAreas, previewSkillDisplacements, projectedContactShift, removableBuffs, shadowPushCrossing, skillAreaContains, skillCastProblem, targetable, targetedFlight } from "./runtime"
import { alliesOf, battleUnits, isFighter, isSummonId, sameSide, sideOf, unitOf, type Buff, type FieldEffect, type SkillCast } from "./state"
import { wardenChoreography } from "./wardenChoreo"
import { spellbreakerChoreography } from "./spellbreakerChoreo"
import { SUMMON_PLANS, type SummonAction } from "./summonPlans"
import { SUMMON_DISMISS_TIME, activeDeployments, portalRoute, summonLink, summonPatrolPosition, summonSpawns, summonTerrainInPath, type SummonGroup } from "./summons"
import { warlockChoreography } from "./warlockChoreo"

export interface AiAim {
  at: EdgePoint
  target?: EdgeUnit
}

export interface SkillUse {
  battle: EdgeBattle
  actor: EdgeFighter
  skill: EdgeActive
  allies: EdgeFighter[]
  enemies: EdgeUnit[]
  partnerAction?: PartnerAction
  pressureReply?: (defender: EdgeUnit, until: number, position: (unit: EdgeUnit, time: number) => EdgePoint) => readonly AnnouncedStrike[]
  manualContact?: (fighter: EdgeFighter, window: { opens: number; ready: number; closes: number },
    useful: (point: EdgePoint, at: number) => boolean) => { issuedAt: number; impact: number; at: EdgePoint } | undefined
  spectrumPlans?: (opens: number, closes: number) => SpectrumPlan[]
}

export type PartnerAction = (fighter: EdgeFighter, at: number, origin: EdgePoint,
  basicBonus: (enemy: EdgeUnit) => number, deploying: boolean) => { order: "basic" | "skill" | "skill2"; target?: EdgeUnit } | undefined

type PositionAt = (unit: EdgeUnit, time: number) => EdgePoint

type SkillTactic = {
  aims?: (use: SkillUse) => AiAim[]
  score: (use: SkillUse, aim: AiAim) => number
} | {
  prepare: (use: SkillUse) => { aims: AiAim[]; score: (aim: AiAim) => number }
} | {
  adjust: (use: SkillUse) => { aims: AiAim[]; score: (aim: AiAim) => number } | undefined
}

const health = (unit: EdgeUnit) => unit.hp / unit.maxHp
const stepAmount = (skill: EdgeActive, kind: string, step = 0) =>
  skill.steps[step].operations.find((operation) => operation.kind === kind)?.args[0] ?? 0
const stepPower = (skill: EdgeActive, step = 0) => stepAmount(skill, "d", step)
const stepHeal = (skill: EdgeActive, step = 0) => stepAmount(skill, "h", step) / 100
const midpoint = (a: EdgePoint, b: EdgePoint): EdgePoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const centerOf = (points: EdgePoint[]): EdgePoint => ({
  x: points.reduce((sum, at) => sum + at.x, 0) / points.length,
  y: points.reduce((sum, at) => sum + at.y, 0) / points.length,
})

function clusterAims(points: EdgePoint[], pairGap: number): AiAim[] {
  const aims = points.map((at) => ({ at }))
  for (const [index, at] of points.entries()) {
    for (const other of points.slice(index + 1)) {
      if (edgeDistance(at, other) <= pairGap) aims.push({ at: midpoint(at, other) })
    }
  }
  if (points.length > 2) aims.push({ at: centerOf(points) })
  return aims
}

function contacts(use: SkillUse, area: EdgeArea, seconds: number) {
  return use.enemies.map((unit) => ({ unit, at: future(use.battle, unit, seconds) }))
    .filter(({ at }) => areaHits(area, at))
}

function hitScore({ battle, actor }: SkillUse, unit: EdgeUnit, power: number) {
  return damageScore(battle, actor, unit, power)
}

const mirrorPlan = SUMMON_PLANS.mirror
const [mirrorShot] = mirrorPlan.actions!

interface MirrorPosition {
  from: EdgePoint
  axis: EdgePoint
  ready: number
  expires: number
  cast: SkillCast
}

function mirrorPosition(group: SummonGroup): MirrorPosition | undefined {
  const [body] = group.deployment.bodies
  if (body.hp) return { from: body, axis: group.axis, ready: body.actionsAt[0], expires: group.until - SUMMON_DISMISS_TIME, cast: group.deployment.cast }
}

function mirrorBody(battle: EdgeBattle, mirror: MirrorPosition, partnerAt: (time: number) => EdgePoint, trigger: number) {
  const follow = mirrorPlan.motion!
  if (follow.kind !== "follow" || trigger < battle.time || trigger + 1e-6 < mirror.ready || trigger >= mirror.expires) return
  let from = mirror.from
  let at = battle.time
  const end = Math.max(at, trigger - SPARRING_STEP)
  // Queued attacks resolve before that frame's follower movement.
  while (at < end - 1e-6) {
    const next = Math.min(end, at + .08)
    const perch = inside(along(partnerAt(next), left(mirror.axis), follow.gap))
    from = along(from, direction(from, perch), Math.min(edgeDistance(from, perch), follow.speed * (next - at)))
    at = next
  }
  if (edgeDistance(from, partnerAt(trigger)) <= mirrorShot.reaction!.reach) return from
}

function mirrorShotValue(battle: EdgeBattle, owner: EdgeUnit, mirror: MirrorPosition, from: EdgePoint, enemy: EdgeUnit,
  trigger: number, position: (unit: EdgeUnit, time: number) => EdgePoint, basic: SkillCast) {
  const target = position(enemy, trigger)
  if (edgeDistance(from, target) > mirrorShot.reach!) return 0
  const impact = trigger + flightTime(from, target)
  const partner = unitOf(battle, basic.owner)
  if (!partner) return 0
  const contacts = announcedStrikes(battle, enemy, impact, position)
  if (!contacts.some(contact => contact.strike.cast === basic)) {
    contacts.push({ at: trigger, source: { ...partner, ...position(partner, trigger) },
      strike: { cast: basic, target: enemy.id, power: 1 } })
    contacts.sort((a, b) => a.at - b.at)
  }
  const { hp, shield, guard, spent } = lifeThroughStrikes(battle, enemy, contacts, position, [], undefined, impact)
  if (!hp) return 0
  const enemyAt = position(enemy, impact)
  const cast = { ...mirror.cast, from, outside: isOutside(from) }
  const shot = estimateDirectHit(battle, owner, enemy, mirrorShot.step.operations[0].args[0], "skill", enemyAt, impact,
    shield, { hp, cast, guard: guard?.percent, spent })
  const focus = 1 + .3 * (1 - health(enemy))
  return (shot.hpLoss + .35 * shot.shieldLoss) / owner.attack * focus + (shot.lethal ? .55 : 0)
}

export function mirrorThreatValue(battle: EdgeBattle, group: SummonGroup, defender: EdgeUnit, breakAt = battle.time) {
  const owner = unitOf(battle, group.owner)
  const partner = unitOf(battle, group.target)
  const mirror = mirrorPosition(group)
  if (!owner || !partner?.hp || !isFighter(partner) || !mirror) return 0
  const now = battle.time
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  for (const { due, strike } of battle.runtime.pending) {
    if (due <= breakAt || !strike || strike.cast.owner !== partner.id || strike.cast.order !== "basic" || "area" in strike || strike.target !== defender.id) continue
    const body = mirrorBody(battle, mirror, at => position(partner, at), due)
    if (body) return mirrorShotValue(battle, owner, mirror, body, defender, due, position, strike.cast)
  }
  const sharedAt = sideOf(battle, partner.id) === "ally" ? battle.sharedAt : battle.sparring?.sharedAt ?? now
  const fire = Math.max(now + SPARRING_STEP, partner.actionAt, sharedAt, partner.force ? partner.force.since + partner.force.duration : now)
  if (fire > now + 1.45 || fire >= mirror.expires || !targetable(battle, defender, fire) ||
    battle.runtime.buffs.some(buff => buff.kind === "choose" && buff.target === partner.id && buff.until > fire)) return 0
  const origin = position(partner, fire)
  const target = position(defender, fire)
  const shooter = { ...partner, ...origin }
  if (isOutside(origin) || partner.move && edgeDistance(origin, partner.move) > 5 ||
    edgeDistance(origin, target) > attackRange(battle, shooter, defender, fire) ||
    basicTarget(battle, shooter, unit => Number(unit === defender), fire, unit => position(unit, fire)) !== defender) return 0
  const trigger = fire + (partner.range >= 200 ? flightTime(origin, target) : 0)
  if (trigger <= breakAt) return 0
  const path = (unit: EdgeUnit, at: number) => unit === partner && at >= fire ? origin : position(unit, at)
  const body = mirrorBody(battle, mirror, at => path(partner, at), trigger)
  if (!body) return 0
  const value = mirrorShotValue(battle, owner, mirror, body, defender, trigger, path, forecastBasicCast(shooter, defender))
  return value * .65 / (1 + (trigger - now) * .4)
}

function mirrorFollowBonus(battle: EdgeBattle, actor: EdgeFighter, target: EdgeUnit, delay: number) {
  let total = 0
  const trigger = battle.time + delay
  const position = (unit: EdgeUnit, time: number) => unit.id === actor.id ? actor : future(battle, unit, time - battle.time)
  let basic: SkillCast | undefined
  for (const { group, deployment } of activeDeployments(battle)) {
    if (group.target !== actor.id || deployment.kind !== "mirror") continue
    const owner = unitOf(battle, group.owner)
    const mirror = mirrorPosition(group)
    if (!owner || !isFighter(owner) || !mirror) continue
    const body = mirrorBody(battle, mirror, () => actor, trigger)
    if (!body) continue
    basic ??= forecastBasicCast(actor, target)
    total += mirrorShotValue(battle, owner, mirror, body, target, trigger, position, basic) * owner.attack / actor.attack
  }
  return total
}

type PaperPulse = { at: EdgePoint; ready: number; action: SummonAction; slot: number }

function paperPulseValue(battle: EdgeBattle, owner: EdgeUnit, allies: readonly EdgeUnit[], enemies: readonly EdgeUnit[],
  { at, ready, action, slot }: PaperPulse, expires: number, castId?: number) {
  if (ready >= expires) return 0
  const [operation] = action.step.operations
  const radius = action.step.selector.size[0]
  const [power, duration = 0] = operation.args
  const sameTeam = sideOf(battle, owner.id) === "ally"
  const friendlyClock = sameTeam ? battle : battle.sparring ?? battle
  const hostileClock = sameTeam ? battle.sparring ?? battle.boss : battle
  const units = slot === 0 ? allies : enemies
  let total = 0
  for (const unit of units) {
    const position = unit === owner && castId === undefined ? owner : future(battle, unit, ready - battle.time)
    if (!unit.hp || isOutside(position) || edgeDistance(position, at) > radius - 3) continue
    if (slot === 0) {
      if (unit.force || movementStopped(battle, unit)) continue
      const moveAt = Math.max(ready, friendlyClock.moveAt, friendlyClock.sharedAt, battle.time + COOLDOWN.shared)
      const moving = !!unit.move && (unit !== owner || castId !== undefined) && edgeDistance(position, unit.move) > 22
      if (!moving && moveAt >= ready + duration - .35) continue
      const usesAt = moving ? ready : moveAt
      if (battle.runtime.buffs.some(buff => buff.kind === "speed" && buff.target === unit.id &&
        (castId === undefined || buff.cast.id !== castId) && buff.until >= usesAt + .35 && buff.values[0] >= power)) continue
      if (moving) total += .34 + Math.min(.35, edgeDistance(position, unit.move!) / 220)
      else if (enemies.some(enemy => {
        const gap = edgeDistance(position, future(battle, enemy, moveAt - battle.time)) - attackRange(battle, unit, enemy)
        return gap > 12 && gap <= MOVE_REACH + 35 && unit.actionAt < moveAt + 1.6
      })) total += .29
      continue
    }
    if (slot === 1) {
      const fire = Math.max(ready, hostileClock.sharedAt, unit.actionAt)
      if (fire >= ready + duration - .08 || battle.runtime.buffs.some(buff => buff.kind === "weak" && buff.style !== "other" &&
        buff.target === unit.id && (castId === undefined || buff.cast.id !== castId) && buff.until >= fire && buff.values[0] >= power)) continue
      const origin = future(battle, unit, fire - battle.time)
      if (isOutside(origin)) continue
      const window = (ally: EdgeUnit) => future(battle, ally, fire - battle.time)
      const exposed = allies.filter(ally => !isOutside(window(ally)) && edgeDistance(origin, window(ally)) <= attackRange(battle, unit, ally) + 12)
      if (exposed.length) total += .38 + (exposed.some(ally => health(ally) < .50) ? .23 : 0)
      else if (isFighter(unit) && unit.actives.some(skill => !skill.deployment && skill.steps[0]?.operations.some(op => op.kind === "d") &&
        allies.some(ally => edgeDistance(origin, window(ally)) <= Math.min(skill.aim.range, 525)))) total += .24
      continue
    }
    const end = previewDirectedShove(battle, unit, position, direction(at, position), power, ready)
    if (edgeDistance(position, end) < 12) continue
    if (isOutside(end)) {
      total += 1.46
      continue
    }
    const denies = allies.some(ally => {
      const place = future(battle, ally, ready - battle.time)
      const reach = attackRange(battle, unit, ally)
      return health(ally) < .66 && !isOutside(place) && edgeDistance(position, place) <= reach && edgeDistance(end, place) > reach + 10
    })
    const opens = allies.some(ally => {
      const place = future(battle, ally, ready - battle.time)
      const reach = attackRange(battle, ally, unit)
      return !isOutside(place) && ally.actionAt < ready + 1.15 && edgeDistance(position, place) > reach && edgeDistance(end, place) <= reach - 8
    })
    total += denies || opens ? .78 : .21
  }
  return Math.min(1.8, total) / (1 + (ready - battle.time) * .18)
}

function livePaperPulse(battle: EdgeBattle, group: SummonGroup, action: SummonAction, index: number, after: number) {
  const body = group.deployment.bodies[action.slot!]
  const ready = Math.max(battle.time + after, body.actionsAt[index])
  if (body.hp && ready < Math.min(battle.time + 3.2, group.until - SUMMON_DISMISS_TIME)) {
    return { at: body, ready, action, slot: body.slot }
  }
}

export function livePaperValue(battle: EdgeBattle, group: SummonGroup, allies: readonly EdgeUnit[], enemies: readonly EdgeUnit[]) {
  const owner = unitOf(battle, group.owner)
  if (!owner) return 0
  const expires = group.until - SUMMON_DISMISS_TIME
  return SUMMON_PLANS.paperBeat.actions!.reduce((sum, action, i) => {
    const pulse = livePaperPulse(battle, group, action, i, 0)
    return sum + (pulse ? paperPulseValue(battle, owner, allies, enemies, pulse, expires, group.id) : 0)
  }, 0)
}

export function paperBodyValue(battle: EdgeBattle, group: SummonGroup, body: EdgeUnit, protectedTeam: readonly EdgeUnit[],
  threatenedTeam: readonly EdgeUnit[], after: number) {
  const owner = unitOf(battle, group.owner)
  if (!owner) return 0
  const index = group.deployment.bodies.findIndex(unit => unit === body)
  const action = SUMMON_PLANS.paperBeat.actions![index]
  if (!action) return 0
  const pulse = livePaperPulse(battle, group, action, index, after)
  return pulse ? paperPulseValue(battle, owner, protectedTeam, threatenedTeam, pulse, group.until - SUMMON_DISMISS_TIME, group.id) : 0
}

export function basicAttackValue(battle: EdgeBattle, actor: EdgeFighter, target: EdgeUnit, enemies: EdgeUnit[], allies: EdgeFighter[],
  includeMirror = true) {
  const delay = actor.range >= 200 ? flightTime(actor, target) : 0
  const arrival = battle.time + delay
  let boost: Buff | undefined
  let note: Buff | undefined
  let amplification = 0
  for (const buff of battle.runtime.buffs) {
    if (buff.target !== actor.id || buff.until <= battle.time) continue
    if (buff.kind === "choose" && (!boost || buff.values[0] > boost.values[0])) boost = buff
    if (buff.until <= arrival) continue
    if (buff.kind === "q" && (!note || buff.values[0] > note.values[0])) note = buff
    if (buff.kind === "ampq") amplification = Math.max(amplification, buff.values[0])
  }
  const stage = battle.runtime.fields.reduce((sum, field) => {
    if (field.cast.skill?.id !== "bard/E/A2" || field.until <= arrival || field.seen.has(actor.id) ||
      !sameSide(battle, actor.id, field.cast.owner) || !areaHits(field.area, actor)) return sum
    return sum + field.step.operations[0].args[0] * field.cast.basis
  }, 0)
  const bonus = ((note ? note.values[0] * note.cast.basis : 0) + stage) / actor.attack
  const scale = 1 + amplification / 100
  if (!boost) {
    const value = damageScore(battle, actor, target, (1 + bonus) * scale)
    if (!isSummonId(target.id)) return value + (includeMirror && battle.runtime.summons.length ? mirrorFollowBonus(battle, actor, target, delay) : 0)
    const deployment = activeDeployments(battle).find(({ deployment }) => deployment.bodies.some(body => body === target))
    if (!deployment) return value
    const { plan, group } = deployment
    if (deployment.deployment.kind === "runner") {
      const damage = actor.attack * (1 + bonus) * scale * roleDamageScale(battle, actor, target) * (1 - target.armor)
      if (damage < target.hp + existingShield(battle, target, delay)) return value * .40
      const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
      return Math.max(value * .72, runnerBreakValue(battle, group, actor, arrival, position))
    }
    if (deployment.deployment.kind === "ensemble") {
      const damage = actor.attack * (1 + bonus) * scale * roleDamageScale(battle, actor, target)
      const threat = ensembleBodyValue(battle, group, target, enemies.filter(isFighter), allies, delay)
      return Math.max(.12, threat * (damage >= target.hp + existingShield(battle, target, delay) ? 1.85 : .45))
    }
    if (deployment.deployment.kind === "mirror") {
      const damage = (1 + bonus) * scale * actor.attack * roleDamageScale(battle, actor, target) * (1 - target.armor)
      const threat = Math.max(0, ...allies.filter(ally => ally.hp && edgeDistance(ally, target) <= mirrorShot.reach! + 45)
        .map(ally => mirrorThreatValue(battle, group, ally, arrival)))
      return value * (threat >= .35 ? damage >= target.hp ? 1.05 : .52 : .18)
    }
    if (deployment.deployment.kind === "shoreBeast") {
      const damage = (1 + bonus) * scale * actor.attack * roleDamageScale(battle, actor, target) * (1 - target.armor)
      return Math.max(value * .4, shoreBeastStrikeValue(battle, actor, target, allies, delay, damage))
    }
    if (deployment.deployment.kind === "paperBeat") {
      const damage = (1 + bonus) * scale * actor.attack * roleDamageScale(battle, actor, target) * (1 - target.armor)
      const threat = paperBodyValue(battle, group, target, enemies, allies, delay)
      const lethal = damage >= target.hp + existingShield(battle, target, delay)
      return Math.max(.30, threat * (lethal ? 1.1 : .28))
    }
    if (deployment.deployment.kind === "rescue") return value * .22
    const hasLink = plan.gate || plan.guard?.type === "line" || plan.actions?.some(action => action.at === "link")
    const liveEnds = deployment.deployment.bodies.every(body => body.hp)
    const linkedTarget = enemies.find(enemy => enemy.id === group.target)
    const guardsAlly = plan.guard && linkedTarget && edgeDistance(target, linkedTarget) <= plan.guard.reach
    const threatening = (hasLink && liveEnds || plan.terrain || guardsAlly) && group.until > arrival + .6
    const canBreak = (1 + bonus) * scale * actor.attack * roleDamageScale(battle, actor, target) >= target.hp + existingShield(battle, target)
    const priority = threatening ? (canBreak ? 1.15 : .85) : canBreak && plan.actions?.length ? .72 : .40
    return value * priority
  }
  const [length, , angle = 90, damage = 1.76] = boost.values
  const cone = areaOf("F", actor, direction(actor, target), length, angle)
  const hits = enemies.filter(enemy => areaHits(cone, future(battle, enemy, .14)))
  return hits.reduce((value, enemy, index) =>
    value + damageScore(battle, actor, enemy, index ? damage : (damage + bonus) * scale) + .2, 0)
}

function canFinish(use: SkillUse, unit: EdgeUnit, power: number) {
  const shield = unit.shieldUntil > use.battle.time ? unit.shield : 0
  const damage = use.actor.attack * power * roleDamageScale(use.battle, use.actor, unit) *
    (1 - unit.armor) * (isOutside(unit) ? EXILE.received : 1)
  return damage >= unit.hp + shield
}

function hasBuff(battle: EdgeBattle, unit: EdgeUnit, kind: string) {
  return battle.runtime.buffs.some((buff) => buff.target === unit.id && buff.kind === kind && buff.until > battle.time)
}

function pressure(use: SkillUse, unit: EdgeUnit, at: EdgePoint = unit) {
  const { battle, enemies } = use
  const near = enemies.reduce((total, enemy) => {
    const reach = attackRange(battle, enemy, unit)
    const gap = edgeDistance(future(battle, enemy, .45), at)
    if (gap > reach + 65 || enemy.actionAt > battle.time + 3) return total
    return total + (gap <= reach && enemy.actionAt <= battle.time + 1.35 ? 1 : .4)
  }, 0)
  const charge = enemies.some((enemy) => {
    const warning = chargeOf(battle, enemy)
    if (!warning) return false
    return !!areaHits(areaOf("L", warning.from, warning.direction, edgeDistance(warning.from, warning.to), 96), at)
  })
  const warned = battle.runtime.visuals.some((visual) => visual.phase === "warning" && visual.until > battle.time &&
    visual.effect !== "heal" && visual.effect !== "shield" && !sameSide(battle, unit.id, visual.owner) && areaHits(visual.area, at))
  return near + (charge || warned ? 1.7 : 0)
}

function pendingThreat({ battle, enemies }: SkillUse, target: EdgeUnit, from: number, until: number, at?: EdgePoint) {
  return battle.runtime.visuals.reduce((sum, warning) => {
    const delay = warning.until - battle.time
    if (warning.phase !== "warning" || warning.effect !== "damage" || delay < from || delay > until ||
      !enemies.some(enemy => enemy.id === warning.owner)) return sum
    const position = at ?? future(battle, target, delay)
    return areaHits(warning.area, position) ? sum + warningDamage(battle, warning, target, position) : sum
  }, 0)
}

function healScore(battle: EdgeBattle, unit: EdgeUnit, fraction: number) {
  const hp = health(unit)
  return Math.min(1 - hp, fraction * healingReceived(battle, unit)) * (hp < .4 ? 9 : 6)
}

function wardValue(danger: number, gain: number, hp: number) {
  return gain * (2.4 + Math.min(3, danger) * 2 + 2 * (1 - hp))
}

function protection(use: SkillUse, unit: EdgeUnit, fraction: number) {
  const danger = pressure(use, unit)
  if (!danger) return 0
  const shield = unit.shieldUntil > use.battle.time + .5 ? unit.shield / unit.maxHp : 0
  return wardValue(danger, Math.max(0, fraction - shield), health(unit))
}

function attackShape(battle: EdgeBattle, enemy: EdgeFighter, active: EdgeActive, target: EdgeUnit, at: EdgePoint) {
  if (active.deployment || active.aim.mode === "ally" || active.aim.mode === "other") return
  let power = 0
  for (const step of active.steps) {
    if (step.watch || step.zone || step.delay > .95) continue
    for (const op of step.operations) if (op.kind === "d") power = Math.max(power, op.args[0])
  }
  if (!power) return
  const mode = active.aim.mode
  const picked = mode === "enemy" || mode === "outside" ? target : undefined
  const gap = edgeDistance(enemy, at)
  const aim = mode === "self" ? enemy : mode === "point" && gap > active.aim.range
    ? along(enemy, direction(enemy, at), active.aim.range - 1) : at
  if (skillCastProblem(battle, enemy, active, aim, picked)) return
  if (picked) return { power, area: undefined }
  const area = previewSkillAreas(battle, enemy, active, aim).find(area => areaHits(area, at))
  return area && { power, area }
}

function attackPower(battle: EdgeBattle, enemy: EdgeFighter, active: EdgeActive, target: EdgeUnit, at: EdgePoint) {
  return attackShape(battle, enemy, active, target, at)?.power ?? 0
}

function incomingHits({ battle, enemies }: SkillUse, target: EdgeUnit, from: number, until: number, at?: EdgePoint) {
  let damage = 0
  let spell = 0
  let ranged = 0
  let telegraphed = false
  const when = (after: number) => at ?? future(battle, target, after)
  for (const enemy of enemies) {
    const warning = battle.runtime.visuals.some((visual) => {
      const arrival = visual.until - battle.time
      return visual.owner === enemy.id && visual.phase === "warning" && visual.effect === "damage" &&
        arrival >= from && arrival <= until && areaHits(visual.area, when(arrival))
    })
    const charge = chargeOf(battle, enemy)
    const charging = charge && charge.until >= battle.time + from && charge.until <= battle.time + until &&
      areaHits(areaOf("L", charge.from, charge.direction, edgeDistance(charge.from, charge.to), 96),
        when(charge.until - battle.time))
    const clocks = enemy === battle.boss ? battle.boss
      : sideOf(battle, enemy.id) === "enemy" ? battle.sparring ?? battle : battle
    const freeAt = enemy.force ? enemy.force.since + enemy.force.duration : battle.time
    const next = Math.max(from, enemy.actionAt - battle.time, clocks.sharedAt - battle.time, freeAt - battle.time, .2)
    const canAct = next + .45 < until
    const position = when(next)
    const origin = future(battle, enemy, next)
    const gap = edgeDistance(origin, position)
    const scale = enemy.attack * (1 - target.armor) * (isOutside(position) ? EXILE.received : 1) *
      (isOutside(origin) ? EXILE.damage : 1)
    const basic = canAct && gap <= attackRange(battle, enemy, target) ? .8 : 0
    const active = canAct && isFighter(enemy) ? .75 * Math.max(...enemy.actives.map(skill =>
      attackPower(battle, { ...enemy, ...origin }, skill, target, position))) : 0
    const strike = warning || charging ? 1.5 : active
    if (warning || charging) telegraphed = true
    const incoming = Math.max(strike, basic) * scale
    damage += incoming
    spell += strike * scale
    if (enemy.range >= 200) ranged += incoming
  }
  return { damage, spell, ranged, telegraphed }
}

const existingShield = (battle: EdgeBattle, unit: EdgeUnit, after = 0) =>
  unit.shieldUntil > battle.time + after ? unit.shield : 0

const bastions: SkillTactic = { prepare(use) {
  const { battle, actor, skill, allies, enemies } = use
  const { aims, wards, current } = entryWards(battle, actor, skill, allies)
  const now = battle.time
  const until = now + 1.9
  const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const clocks = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring ?? battle
  const canMoveAt = Math.max(clocks.moveAt, now + COOLDOWN.shared)
  const pending = battle.runtime.pending.some(job => job.strike && !sameSide(battle, job.strike.cast.owner, actor.id))
  const forecasts = new Map(allies.map(unit => {
    const announced = pending ? announcedStrikes(battle, unit, until, position) : []
    const path = announced.length ? positionAfterStrike(battle, unit, announced, position)?.position ?? position : position
    const existing = current?.get(unit)
    const life = lifeThroughStrikes(battle, unit, announced, path, existing ? [existing] : [], undefined, until)
    const replies = life.hp > 0 && life.hp <= unit.maxHp * .44 && battle.sparring
      ? shortAreaThreats(battle, unit, enemies, until, path,
        Math.max(now, (announced.at(-1)?.at ?? now) + SPARRING_STEP), undefined, "after-displacement") : []
    const lethalReplies = replies.filter(reply => !lifeThroughStrikes(battle, unit, [...announced, reply], path,
      existing ? [existing] : []).hp)
    const { damage } = life.hp > 0 && !lethalReplies.length ? incomingHits(use, unit, .25, 2.5, position(unit, now + .65)) : { damage: 0 }
    const valueAt = new Map<number, number>()
    return [unit, { announced, lethalReplies, path, life, damage, valueAt }] as const
  }))
  return { aims: aims.map(at => ({ at })), score({ at }) {
    const incoming = wards(at)
    let total = 0
    for (const [unit, aid] of incoming) {
      if ((current?.get(unit)?.at ?? Infinity) <= aid.at) continue
      const forecast = forecasts.get(unit)!
      let value = forecast.valueAt.get(aid.at)
      if (value === undefined) {
        const { announced, lethalReplies, path, life, damage } = forecast
        // A forced displacement before entry changes which lobe the card will reach.
        if (aid.at > now && announced.some(contact => contact.at < aid.at && announcedShift(battle, contact, unit, path))) continue
        const protectedLife = lifeThroughStrikes(battle, unit, announced, path, [aid], undefined, until)
        if (!protectedLife.hp) continue
        const healthSaved = Math.max(0, protectedLife.hp - life.hp) / unit.maxHp
        const preventive = Math.max(0, Math.min(protectedLife.shield - life.shield, damage - life.shield)) / unit.maxHp
        const coveredReplies = lethalReplies.filter(reply => lifeThroughStrikes(battle, unit, [...announced, reply], path, [aid]).hp > 0)
        // These are alternative first shots. A shield that covers both gives a
        // critically injured ally room to react once the enemy chooses an aim.
        const crossfire = unit.hp <= unit.maxHp * .13 && new Set(coveredReplies.filter(reply => reply.at > canMoveAt + .28)
          .map(reply => reply.source.id)).size > 1
        const survival = !life.hp ? 2 + 4 * protectedLife.hp / unit.maxHp
          : lethalReplies.length ? (crossfire ? 5.45 : 2.65) * coveredReplies.length / lethalReplies.length : 0
        const delay = aid.at - now
        value = (healthSaved * 5.4 + preventive * 1.9 + survival) / (1 + delay)
        forecast.valueAt.set(aid.at, value)
      }
      total += value
    }
    return total
  } }
} }

const citadel: SkillTactic = { prepare(use) {
  const { battle, actor, allies, skill } = use
  const radius = skill.steps[0].selector.size[0]
  const capacity = actor.maxHp * stepAmount(skill, "wall") / 100
  const warnings = battle.runtime.visuals.filter(visual => visual.phase === "warning" && visual.effect === "damage" &&
    visual.until > battle.time && visual.until < battle.time + 2.25 && !sameSide(battle, actor.id, visual.owner))
  const protectedBy = (at: EdgePoint, after: number) => battle.runtime.fields.reduce((sum, field) =>
    field.mode === "guard" && field.until > battle.time + after && sameSide(battle, actor.id, field.cast.owner) &&
    areaHits(field.area, at) ? sum + field.capacity : sum, 0)
  const forecasts = allies.map(ally => {
    const next = future(battle, ally, .45)
    const { damage } = incomingHits(use, ally, .30, 3)
    return { ally, at: next, damage }
  }).sort((a, b) => health(a.ally) - health(b.ally))
  const hits = warnings.flatMap(warning => forecasts.flatMap(({ ally }) => {
    const after = warning.until - battle.time
    const at = future(battle, ally, after)
    if (!areaHits(warning.area, at)) return []
    const damage = Math.max(0, warningDamage(battle, warning, ally, at) - protectedBy(at, after))
    return damage > 0 ? [{ ally, after, at, damage }] : []
  })).sort((a, b) => a.after - b.after || a.ally.card.uid - b.ally.card.uid)
  const byAlly = new Map<EdgeFighter, number>()
  for (const hit of hits) byAlly.set(hit.ally, (byAlly.get(hit.ally) ?? 0) + hit.damage)
  const erases = announcedFieldErasures(battle, actor, battle.time + 2.25)
  const positions = forecasts.map(row => row.at)
  for (const hit of hits) if (positions.every(at => edgeDistance(at, hit.at) > 8)) positions.push(hit.at)
  return { aims: clusterAims(positions, radius * 2 - 20), score({ at }) {
    let remaining = capacity
    let value = 0
    const cleared = Math.min(Infinity, ...erases.filter(erase => areaHits(erase.area, at)).map(erase => erase.at - battle.time))
    const handled = new Map<EdgeFighter, number>()
    for (const hit of hits) {
      const { ally, after, damage } = hit
      if (remaining <= 0 || after > cleared + SPARRING_STEP / 2 || edgeDistance(at, hit.at) > radius) continue
      const absorbed = Math.min(remaining, damage)
      remaining -= absorbed
      const prior = handled.get(ally) ?? 0
      handled.set(ally, prior + damage - absorbed)
      const shield = existingShield(battle, ally, after)
      const life = Math.max(0, ally.hp + shield - prior)
      const saves = damage >= life && damage - absorbed < life
      const excess = Math.max(0, damage - Math.max(0, shield - prior))
      const useful = Math.min(absorbed, excess) + Math.max(0, absorbed - excess) * .22
      const losesCover = after >= cleared - SPARRING_STEP && hits.some(other => other.ally === ally && other.after > cleared + SPARRING_STEP / 2)
      value += useful / ally.maxHp * (4.6 + 2.5 * (1 - health(ally))) + (saves ? losesCover ? .7 : 2.2 : 0)
    }
    if (cleared < 2.25) return value
    for (const { ally, at: next, damage } of forecasts) {
      if (edgeDistance(at, next) > radius - 10 || remaining <= 0) continue
      const pressure = Math.max(0, damage - (byAlly.get(ally) ?? 0) - protectedBy(next, .7) - existingShield(battle, ally, .7))
      const absorbed = Math.min(remaining, pressure)
      remaining -= absorbed
      value += absorbed / ally.maxHp * (4.6 + 2.5 * (1 - health(ally))) +
        (absorbed > 0 && pressure > ally.hp ? .65 : 0)
    }
    return value
  } }
} }

const seawall: SkillTactic = { prepare(use) {
  const { battle, actor, allies, enemies, skill } = use
  const delay = bulwarkChoreography(skill.id)!.windup!
  const [length, width] = skill.steps[0].selector.size
  const power = stepPower(skill)
  const capacity = actor.maxHp * stepAmount(skill, "wall", 1) / 100
  const contacts = enemies.map(unit => ({ unit, at: future(battle, unit, delay) }))
  const threats: { from: EdgePoint; at: EdgePoint; ally: EdgeFighter; impact: number; damage: number; announced: boolean }[] = []
  for (const warning of battle.runtime.visuals) {
    const impact = warning.until - battle.time
    if (warning.phase !== "warning" || warning.effect !== "damage" || impact <= delay + .015) continue
    const source = enemies.find(enemy => enemy.id === warning.owner)
    if (!source) continue
    for (const ally of allies) {
      const at = ally === actor ? actor : future(battle, ally, impact)
      if (areaHits(warning.area, at)) {
        threats.push({ from: future(battle, source, impact), at, ally, impact,
          damage: warningDamage(battle, warning, ally, at), announced: true })
      }
    }
  }
  for (const enemy of enemies) {
    const ready = Math.max(.2, enemy.actionAt - battle.time)
    if (ready > 1.8 || isOutside(enemy) || enemy.force) continue
    const from = future(battle, enemy, ready)
    for (const ally of allies) {
      const impact = ready + (enemy.range >= 200 ? flightTime(from, ally) : 0)
      if (impact <= delay + .015) continue
      const at = ally === actor ? actor : future(battle, ally, impact)
      if (edgeDistance(from, at) > attackRange(battle, enemy, ally)) continue
      threats.push({ from, at, ally, impact,
        damage: enemy.attack * roleDamageScale(battle, enemy, ally) * (1 - ally.armor), announced: false })
    }
  }
  // The wall disappears on the first impact. Simultaneous area hits normally
  // resolve in lineup order, so an earlier ally can use up the only block.
  threats.sort((a, b) => a.impact - b.impact || Number(b.announced) - Number(a.announced) || a.ally.card.uid - b.ally.card.uid)
  const aims = clusterAims(contacts.map(({ at }) => at), length)
  for (const { from, at } of threats) {
    aims.push({ at: midpoint(from, at) }, { at: along(at, direction(at, from), Math.min(width, edgeDistance(at, from) / 2)) })
    const edge = left(direction(actor, at))
    for (const side of [-1, 1]) aims.push({ at: along(at, edge, (length / 2 - 18) * side) })
  }
  return { aims, score({ at }) {
    const area = areaOf("B", at, direction(actor, at), length, width)
    const strike = contacts.reduce((value, enemy) => value + (areaHits(area, enemy.at) ?
      hitScore(use, enemy.unit, power) + .24 : 0), 0)
    const threat = threats.find(({ from, at }) => firstCrossing(area, from, at))
    if (!threat) return strike
    const { ally, impact, damage, announced } = threat
    const covered = battle.runtime.fields.some(field => field.mode === "wall" && field.capacity > 0 &&
      field.until > battle.time + impact && sameSide(battle, actor.id, field.cast.owner) && firstCrossing(field.area, threat.from, threat.at))
    if (covered) return strike
    const life = ally.hp + existingShield(battle, ally, impact)
    const blocked = Math.min(damage, capacity)
    const saves = damage >= life && damage - blocked < life
    const value = blocked / ally.maxHp * (4.8 + 2.6 * (1 - health(ally))) + (saves ? 1.5 : 0)
    return strike + value * (announced ? 1 : .63)
  } }
} }

function dawnAccord(use: SkillUse) {
  const { battle, skill, allies, enemies } = use
  const delay = paladinChoreography(skill.id)!.windup!
  const [rate, , cap, reply] = skill.steps[0].operations[0].args
  let score = 0
  let retorts = 0
  for (const ally of allies) {
    if (battle.runtime.buffs.some(buff => buff.target === ally.id && buff.style === "accord" && buff.until > battle.time + delay)) continue
    const prior = pendingThreat(use, ally, 0, delay - .01)
    const life = ally.hp + existingShield(battle, ally, delay) - prior
    if (life <= 0) continue
    const warning = battle.runtime.visuals.find(visual => {
      const impact = visual.until - battle.time
      return visual.phase === "warning" && visual.effect === "damage" && impact >= delay + .015 && impact < delay + 1.1 &&
        enemies.some(enemy => enemy.id === visual.owner) && areaHits(visual.area, future(battle, ally, impact))
    })
    const impact = warning ? warning.until - battle.time : delay
    const damage = warning ? warningDamage(battle, warning, ally, future(battle, ally, impact))
      : Math.min(ally.maxHp * .23, incomingHits(use, ally, delay + .015, 2.45).damage)
    if (damage <= 0) continue
    const blocked = Math.min(damage * rate / 100, ally.maxHp * cap / 100)
    const saved = warning && damage >= life && damage - blocked < life
    const confidence = warning ? 1 : .60
    score += (blocked / ally.maxHp * (4.2 + 3.3 * (1 - health(ally))) + (saved ? 1.45 : 0)) * confidence
    retorts += confidence
  }
  return score + Math.min(3, retorts) * reply * .62
}

const dawnOath: SkillTactic = { adjust(use) {
  const { battle, actor, allies, skill } = use
  if (!battle.runtime.pending.some(job => job.strike && !sameSide(battle, actor.id, job.strike.cast.owner))) return
  const delay = fixedSkillWindup(skill)!
  const release = battle.time + delay
  const until = release + COOLDOWN.shared
  const [ward, counter] = skill.steps
  const radius = ward.selector.size[0]
  const power = counter.operations[0].args[0]
  const position = (unit: EdgeUnit, time: number) => unit === actor ? actor : future(battle, unit, time - battle.time)
  const casterThreats = announcedStrikes(battle, actor, until, position)
  if (!lifeThroughStrikes(battle, actor, casterThreats.filter(hit => hit.at <= release), position).hp) return
  const wards = allies.flatMap(unit => {
    const contacts = unit === actor ? casterThreats : announcedStrikes(battle, unit, until, position)
    const before = contacts.filter(hit => hit.at <= release + SPARRING_STEP)
    if (before.length === contacts.length) return []
    const path = before.length ? positionAfterStrike(battle, unit, before, position)?.position : position
    if (!path || before.length && !lifeThroughStrikes(battle, unit, before, path).hp) return []
    const aid = aidFrom(battle, actor, unit, skill, ward, delay)
    const later = contacts.slice(before.length)
    const first = later.find(hit => {
      const forecast = announcedHit(battle, hit, unit, path(unit, hit.at), path)
      return forecast && forecast.hpLoss + forecast.shieldLoss > 0
    })
    if (!first) return []
    const sequence = announcedShift(battle, first, unit, path)
      ? contacts.filter(hit => hit.at <= first.at) : contacts
    const without = lifeThroughStrikes(battle, unit, sequence, path)
    const withWard = lifeThroughStrikes(battle, unit, sequence, path, [aid])
    if (!withWard.hp) return []
    const at = path(unit, release)
    const healthSaved = (withWard.hp - without.hp) / unit.maxHp
    const trigger = later.find(hit => {
      if (hit.zone || hit.strike.cast.signature) return false
      const forecast = announcedHit(battle, hit, unit, path(unit, hit.at), path)
      return forecast && forecast.hpLoss + forecast.shieldLoss > 0
    })
    const response = trigger && targetable(battle, trigger.source, trigger.at)
      ? estimateDirectHit(battle, actor, trigger.source, power, "skill", path(trigger.source, trigger.at), trigger.at,
        aidBeforeHit(battle, trigger.source, trigger.at, path).shield) : undefined
    const reply = response ? (response.hpLoss + .2 * response.shieldLoss) / trigger!.source.maxHp * 2.1 + (response.lethal ? 1.1 : 0) : 0
    return [{ unit, at, value: Math.max(0, healthSaved) * 3.4 + (!without.hp ? 2.6 : 0), triggerAt: trigger?.at ?? Infinity, reply }]
  })
  if (!wards.length) return
  wards.sort((a, b) => a.triggerAt - b.triggerAt || a.unit.card.uid - b.unit.card.uid)
  return { aims: clusterAims(wards.map(row => row.at), radius * 2), score({ at }) {
    const covered = wards.filter(ward => edgeDistance(at, ward.at) <= radius)
    return covered.reduce((value, ward) => value + ward.value, covered[0]?.reply ?? 0)
  } }
} }

function lastStand(use: SkillUse) {
  const { battle, actor, skill } = use
  const operation = skill.steps[0].operations.find((op) => op.kind === "defy")!
  const floor = Math.round(actor.maxHp * operation.args[0] / 100)
  if (actor.hp < floor || actor.hp > actor.maxHp * .56 || hasBuff(battle, actor, "defy")) return 0
  const { damage, telegraphed } = incomingHits(use, actor, .03, 2.4)
  const projectedHp = actor.hp + existingShield(battle, actor, .25) - damage
  if (projectedHp >= floor) return 0
  const retaliation = use.enemies.filter((enemy) => edgeDistance(actor, future(battle, enemy, .7)) <= 130).length
  return .8 + Math.min(1.8, (floor - projectedHp) / Math.max(1, floor) * 1.7) +
    Math.min(3, retaliation) * operation.args[3] * .75 + (telegraphed ? .25 : 0)
}

function reflectionShield(use: SkillUse, { target }: AiAim) {
  if (!target) return 0
  const { battle, actor, skill } = use
  const windup = spellbreakerChoreography(skill.id)?.windup ?? 0
  const shield = target.maxHp * stepAmount(skill, "b") / 100
  const prior = existingShield(battle, target, windup)
  if (prior > shield || battle.runtime.buffs.some((buff) => buff.target === target.id && buff.style === "spellshield" &&
    buff.until > battle.time + windup)) return 0
  const { damage, spell, telegraphed } = incomingHits(use, target, windup + .01, 2.8)
  if (!damage) return 0
  const [reflect, , cap] = skill.steps[0].operations.find((op) => op.kind === "reflect")!.args
  const protection = Math.min(shield - prior, damage) / target.maxHp * (4 + 4 * (1 - health(target)))
  const reply = Math.min(spell * reflect / 100, shield * reflect / 100, actor.attack * cap) / actor.attack
  return protection + reply * (telegraphed ? 1.65 : 1.15) +
    (damage > target.hp + prior && shield > prior ? .75 : 0)
}

function counterWard(source: "spell" | "ranged"): SkillTactic {
  return { score(use, { target }) {
    const { battle, actor, skill } = use
    if (!target || battle.runtime.buffs.some((buff) => buff.target === target.id && buff.cast.skill?.id === skill.id &&
      buff.kind === "guard" && buff.until > battle.time)) return 0
    const windup = spellbreakerChoreography(skill.id)?.windup ?? 0
    const forecast = incomingHits(use, target, windup + .02, 2.6)
    const hit = Math.min(target.maxHp * .30, forecast[source])
    if (!hit) return 0
    const [mitigate, , reply] = skill.steps[0].operations.find((op) => op.kind === "guard")!.args
    const prevented = hit * mitigate / 100
    return prevented / target.maxHp * (5 + 3 * (1 - health(target))) + reply +
      (hit >= target.hp + existingShield(battle, target, windup) && actor !== target ? .8 : 0)
  } }
}

const sidestep: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { battle, actor, skill } = use
  const { windup, travel } = spellbreakerChoreography(skill.id)!
  const position = future(battle, target, windup)
  if (edgeDistance(actor, position) > skill.aim.range) return 0
  const power = stepPower(skill)
  const damage = actor.attack * power * roleDamageScale(battle, actor, target) *
    (1 - target.armor) * (isOutside(position) ? EXILE.received : 1)
  const shield = existingShield(battle, target, windup)
  const landing = previewSkillDisplacements(battle, actor, skill, position, { ...target, ...position })[0]?.to ?? actor
  const blocked = battle.runtime.fields.reduce((total, field) => total + (field.mode === "guard" && field.capacity > 0 &&
    field.until > battle.time + windup && sameSide(battle, target.id, field.cast.owner) && areaHits(field.area, position)
    ? field.capacity : 0), 0)
  const loss = Math.max(0, damage - shield - blocked)
  const staysInReach = edgeDistance(landing, position) <= attackRange(battle, actor, target)
  const shieldPressure = staysInReach ? .62 : .45
  const hit = hitScore(use, target, power) * (shieldPressure + (1 - shieldPressure) * loss / damage)
  const interrupt = (chargeOf(battle, target)?.until ?? 0) > battle.time + windup ? 1.6 : 0
  if (loss >= target.hp || interrupt) return hit + interrupt
  const contact = windup + travel
  const prior = existingShield(battle, actor, contact)
  const ward = Math.max(0, actor.maxHp * stepAmount(skill, "b", 2) / 100 - prior)
  const { damage: incoming } = incomingHits(use, actor, contact, contact + 2.2, landing)
  const protectedHp = Math.min(ward, Math.max(0, incoming - prior))
  const saved = pendingThreat(use, actor, windup, contact + .35) -
    pendingThreat(use, actor, windup, contact + .35, landing)
  return hit + (protectedHp * .65 + Math.max(0, saved)) / actor.attack
} }

const deflector: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { battle, actor, skill, enemies } = use
  const windup = spellbreakerChoreography(skill.id)!.windup
  const [rate, , push, reach] = skill.steps[0].operations[0].args
  const existing = battle.runtime.buffs.find(buff => buff.kind === "guard" && buff.target === target.id && buff.style === "spellpush")
  const at = (after: number) => target === actor ? actor : future(battle, target, after)
  let best = 0
  for (const warning of battle.runtime.visuals) {
    const delay = warning.until - battle.time
    if (warning.phase !== "warning" || warning.effect !== "damage" || delay < windup + .025 || delay > windup + 2 ||
      (existing?.until ?? 0) > warning.until) continue
    const enemy = enemies.find(unit => unit.id === warning.owner)
    if (!enemy || !areaHits(warning.area, at(delay))) continue
    const hit = warningDamage(battle, warning, target, at(delay))
    const blocked = hit * rate / 100
    const life = target.hp + existingShield(battle, target, delay)
    const saves = hit >= life && hit - blocked < life
    const inReach = edgeDistance(future(battle, enemy, delay), at(delay)) <= reach
    best = Math.max(best, blocked / actor.attack + (inReach ? push / 300 : 0) + (saves ? 2.15 : 0))
  }
  if (best || (existing?.until ?? 0) > battle.time + windup) return best
  const { spell } = incomingHits(use, target, windup + .025, 2.7)
  const blocked = Math.min(spell, target.maxHp * .35) * rate / 100
  const counter = blocked > 0 && enemies.some(enemy => enemy.actionAt <= battle.time + 2.2 &&
    edgeDistance(at(windup), future(battle, enemy, windup)) <= reach)
  return blocked / actor.attack * 1.25 + (counter ? push / 300 : 0)
} }

function nextApproach(use: SkillUse, ally: EdgeUnit, lead: number) {
  const { battle, enemies } = use
  if (ally.force || isOutside(ally) || movementStopped(battle, ally)) return
  const at = future(battle, ally, lead)
  const { enemy, gap } = enemies.reduce<{ enemy?: EdgeUnit; gap: number }>((nearest, unit) => {
    const distance = edgeDistance(at, future(battle, unit, lead))
    return distance < nearest.gap ? { enemy: unit, gap: distance } : nearest
  }, { gap: Infinity })
  if (!enemy) return
  const reach = attackRange(battle, ally, enemy)
  if (gap <= reach + 8 || gap > reach + 460) return
  return { at, enemy, gap, reach }
}

function stepValue(use: SkillUse, ally: EdgeUnit, distance: number, heal: number, lead: number) {
  const { battle } = use
  if (hasBuff(battle, ally, "extend") || hasBuff(battle, ally, "hop")) return 0
  const plan = nextApproach(use, ally, lead)
  if (!plan) return 0
  const base = movementAllowance(battle, ally, MOVE_REACH, plan.enemy)
  const room = Math.max(0, plan.gap - plan.reach * .75 - base)
  const extension = Math.min(distance, room)
  const reaches = plan.gap - plan.reach - base
  const actionAt = ally === use.actor ? battle.time + use.actor.actionCooldown : ally.actionAt
  const arrival = lead + (base + extension) / movementSpeed(battle, ally)
  const readyOnArrival = actionAt <= battle.time + arrival + .7
  const closing = (extension / 100 + (reaches > 0 && reaches <= extension ? .35 : 0)) * (readyOnArrival ? 1 : .48)
  const incoming = pendingThreat(use, ally, 0, arrival)
  if (incoming >= ally.hp + existingShield(battle, ally, arrival)) return 0
  const aid = plan.gap - plan.reach >= 45 && extension > 0 ? healScore(battle, ally, heal) * .85 : 0
  return closing + aid
}

const longerStep: SkillTactic = {
  score(use, { target }) {
    if (!target) return 0
    const [distance, , heal = 0] = use.skill.steps[0].operations[0].args
    return stepValue(use, target, distance, heal / 100, COOLDOWN.shared)
  },
}

const rushSteps: SkillTactic = {
  aims: (use) => clusterAims(use.allies.map((ally) => future(use.battle, ally, .5)), 310),
  score(use, { at }) {
    const { battle, actor, allies } = use
    const [length, duration, heal] = use.skill.steps[0].operations[0].args
    const radius = use.skill.steps[0].selector.size[0]
    const moveAt = sideOf(battle, actor.id) === "ally" ? battle.moveAt : battle.sparring!.moveAt
    const ready = Math.max(COOLDOWN.shared, moveAt - battle.time)
    const values = allies.flatMap(ally => {
      const atApplication = ally === actor ? actor : future(battle, ally, .5)
      if (edgeDistance(at, atApplication) > radius || isOutside(atApplication)) return []
      const incoming = pendingThreat(use, ally, 0, ready)
      if (incoming > ally.hp * .34) return []
      return [stepValue(use, ally, length, heal / 100, ready)]
    }).sort((a, b) => b - a)
    // Each long step competes for the same movement cooldown.
    return values.reduce((score, value, index) => ready + index * COOLDOWN.move < .5 + duration ? score + value * .62 ** index : score, 0) /
      (1 + (ready - COOLDOWN.shared) * .55)
  },
}

function railPlacement(folded: boolean): SkillTactic {
  return { prepare(use) {
    const { battle, actor, allies, enemies, skill } = use
    const step = skill.steps[0]
    const [length, width] = step.selector.size
    const lead = dancerChoreography(skill.id)!.windup
    const duration = step.zone!.duration
    const clocks = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring ?? battle
    const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
    const delay = Math.max(COOLDOWN.shared, clocks.moveAt - battle.time)
    const start = battle.time + Math.ceil(delay / frame - 1e-6) * frame
    const atStart = start - battle.time
    const sameRail = battle.runtime.fields.find(field => field.cast.owner === actor.id &&
      field.cast.skill?.id === skill.id && field.until > start + .7)
    const plans = allies.flatMap(ally => {
      if (isOutside(ally) || ally.force || movementStopped(battle, ally)) return []
      const at = ally === actor ? ally : future(battle, ally, atStart)
      if (isOutside(at)) return []
      const traveler = { ...ally, ...at, move: null, actionAt: ally === actor ? battle.time + actor.actionCooldown : ally.actionAt }
      return [{ ally, traveler }]
    })
    const aims = clusterAims(enemies.map(unit => future(battle, unit, atStart + .6)), 260)
    for (const { traveler } of plans) {
      if (traveler.id === actor.id || edgeDistance(actor, traveler) < 42) continue
      const axis = direction(actor, traveler)
      for (const turn of folded ? [0, -26, 26, -48, 48] : [0, -8, 8]) {
        const extent = folded ? Math.min(length, Math.max(175, edgeDistance(actor, traveler) * 2 + 100)) : length
        aims.push({ at: inside(along(actor, rotate(axis, turn), extent)) })
      }
    }
    if (plans.length && enemies.length) {
      const nearest = enemies.reduce((a, b) => edgeDistance(a, actor) < edgeDistance(b, actor) ? a : b)
      const axis = direction(actor, nearest)
      for (const turn of folded ? [0, -40, 40] : [0, -20, 20]) {
        aims.push({ at: inside(along(actor, rotate(axis, turn), length)) })
      }
      if (folded && plans.some(({ traveler }) => traveler.hp <= traveler.maxHp * .25)) {
        const escape = direction(nearest, actor)
        for (const turn of [-90, -72, -48, -24, 0, 24, 48, 72, 90]) {
          aims.push({ at: inside(along(actor, rotate(escape, turn), 286)) })
        }
      }
    }
    const expiry = battle.time + lead + duration
    const kept = sameRail ? Math.max(0, ...plans.filter(({ ally }) => !sameRail.seen.has(ally.id)).map(({ traveler }) =>
      danceRailMove(battle, traveler, enemies, sameRail, start)?.value ?? 0)) : 0
    return { aims, score({ at }) {
      const rail = dancerRail(actor, at, length, width, folded)
      if (rail.path.length < 85) return 0
      let best = 0
      let supporting = 0
      for (const { ally, traveler } of plans) {
        if (folded && ally !== actor && ally.move) {
          const from = future(battle, ally, lead)
          const contact = dancerHingeEntry(rail, from, ally.move)
          if (contact && !summonTerrainInPath(battle, { ...ally, ...from }, contact)) {
            const atContact = lead + edgeDistance(from, contact) / movementSpeed(battle, ally)
            const expected = pendingThreat(use, ally, 0, atContact)
            if (expected < ally.hp + existingShield(battle, ally, atContact)) {
              const ward = Math.max(0, stepAmount(skill, "b") / 100 - existingShield(battle, ally, atContact) / ally.maxHp)
              const near = enemies.some(enemy => edgeDistance(contact, future(battle, enemy, atContact)) < attackRange(battle, enemy, ally) + 135)
              if (ward && (expected > 0 || near)) best = Math.max(best, ward * 7.5 + .32)
            }
          }
        }
        if (ally.move && ally !== actor && edgeDistance(traveler, ally.move) > 8) continue
        const route = danceRailMove(battle, traveler, enemies, { danceRail: rail, step, until: expiry }, start)
        if (!route || route.value < .64) continue
        best = Math.max(best, route.value * (ally === actor && !route.rescue ? .72 : 1))
        supporting++
      }
      if (best <= kept + .12) return 0
      return (best * .95 + Math.min(2, Math.max(0, supporting - 1)) * .17) / (1 + Math.max(0, atStart - COOLDOWN.shared) * .42)
    } }
  } }
}

const hopStep: SkillTactic = { score(use, { target }) {
  if (!target || hasBuff(use.battle, target, "hop")) return 0
  const plan = nextApproach(use, target, COOLDOWN.shared)
  if (!plan) return 0
  const [reach, , travel, power, radius, , ward] = use.skill.steps[0].operations[0].args
  const enemyAt = future(use.battle, plan.enemy, COOLDOWN.shared + travel)
  const landingRange = Math.min(plan.reach * .75, radius * .78)
  const end = inside(along(plan.at, direction(plan.at, enemyAt), Math.min(reach, plan.gap - landingRange)), 32)
  const hits = use.enemies.filter(enemy => edgeDistance(end, future(use.battle, enemy, COOLDOWN.shared + travel)) <= radius)
  return stepValue(use, target, reach - MOVE_REACH, 0, COOLDOWN.shared) + protection(use, target, ward / 100) * .6 +
    hits.reduce((value, enemy) => value + hitScore(use, enemy, power) * .8, 0)
} }

const coastRelay: SkillTactic = {
  aims: (use) => clusterAims(use.allies.map(ally => future(use.battle, ally, .52)), 310),
  score(use, { at }) {
    const { battle, actor, skill, allies, enemies } = use
    const radius = skill.steps[1].selector.size[0]
    const hits = new Set<EdgeUnit>()
    let value = 0
    for (const [index, route] of previewSkillDisplacements(battle, actor, skill, at).entries()) {
      const ally = allies.find(member => member.id === route.unit)
      if (!ally) continue
      const threatBefore = pressure(use, ally, route.from)
      const threatAfter = pressure(use, ally, route.to)
      const rescue = threatBefore - threatAfter
      value += protection(use, ally, stepAmount(skill, "b") / 100) + rescue * (health(ally) < .55 ? .65 : .22)
      const delay = .90 + index * .18
      for (const enemy of enemies) {
        if (edgeDistance(route.to, future(battle, enemy, delay)) <= radius) hits.add(enemy)
      }
    }
    return value + [...hits].reduce((score, enemy) => score + hitScore(use, enemy, stepPower(skill, 1)), 0)
  },
}

function shiftAlly(use: SkillUse, { target }: AiAim) {
  if (!target || isOutside(target)) return 0
  const { battle, actor, skill, enemies } = use
  const route = previewSkillDisplacements(battle, actor, skill, target, target)[0]
  const shield = protection(use, target, Math.max(...skill.steps.map((_, index) => stepAmount(skill, "b", index))) / 100)
  if (!route) return shield
  const lead = dancerChoreography(skill.id)?.windup ?? 0
  const from = future(battle, target, lead)
  const to = route.to
  const before = pressure(use, target, from)
  const after = pressure(use, target, to)
  if (after > before + .3 && health(target) < .62) return 0
  const nearest = (at: EdgePoint) => Math.min(...enemies.map((enemy) => edgeDistance(future(battle, enemy, lead), at) -
    attackRange(battle, target, enemy)))
  const oldGap = nearest(from)
  const newGap = nearest(to)
  const advance = oldGap > 12 && Number.isFinite(newGap) ? Math.max(0, oldGap - newGap) / 135 : 0
  const retreat = (before - after) * (health(target) < .65 ? .86 : .36)
  const lostAttack = oldGap <= 0 && newGap > 32 && health(target) > .60 ? .7 : 0
  const unsafe = borderGap(to) < 55 && borderGap(to) < borderGap(from) && after > .3 ? .72 : 0
  return Math.max(0, shield + advance + retreat - lostAttack - unsafe)
}

const rewindAlly: SkillTactic = {
  score(use, { target }) {
    if (!target || target.force) return 0
    const { battle, actor, skill } = use
    const delay = dancerChoreography(skill.id)!.windup
    const launch = battle.time + delay
    const route = previewSkillDisplacements(battle, actor, skill, target, target, launch)[0]
    const path = route?.path
    const end = route?.to ?? (target === actor ? actor : future(battle, target, delay))
    const arrive = path ? delay + REVERSE_PRINT_TRAVEL : delay
    const before = pendingThreat(use, target, delay, 1.8)
    const after = pendingThreat(use, target, delay, 1.8, end)
    if (after > before && target.hp / target.maxHp < .65) return 0
    const current = existingShield(battle, target, arrive)
    const hp = target.hp + current
    const saved = Math.max(0, before - after)
    const survival = before >= hp && after < hp ? 1.9 : 0
    const wardStep = skill.steps[0].operations.find(op => op.kind === "b")!
    const wardSize = Math.round(target.maxHp * wardStep.args[0] / 100)
    const shield = Math.max(0, wardSize - current)
    const earlyHit = pendingThreat(use, target, 0, arrive)
    const canWard = route ? earlyHit < hp : earlyHit < hp || before > 0
    if (!canWard) return 0
    const incoming = health(target) < .65 ? incomingHits(use, target, arrive, 2.65, end).damage : 0
    const wardValue = Math.min(shield, Math.max(0, incoming - current)) / target.maxHp
    const cover = Math.max(protection(use, target, shield / target.maxHp), wardValue * (4.8 + 4 * (1 - health(target))))
    const buysSurvival = after > hp && after < hp + shield ? .85 : 0
    const standing = (unit: EdgeUnit, time: number) => unit === actor ? actor : future(battle, unit, time - battle.time)
    const backed = (unit: EdgeUnit, time: number) => {
      if (unit !== target || time < launch) return standing(unit, time)
      return path ? dancerPointAt(path, clamp((time - launch) / REVERSE_PRINT_TRAVEL, 0, 1)) : end
    }
    let timelyWard = 0
    if (use.pressureReply && shield > 0 && health(target) <= .58) {
      const wardAt = battle.time + arrive
      const until = battle.time + 1.35
      const threat = use.pressureReply(target, until, backed)
      const impact = threat.at(-1)?.at ?? 0
      if (impact > wardAt + SPARRING_STEP) {
        const ward = { at: wardAt, shield: wardSize, shieldUntil: wardAt + wardStep.args[1] }
        const result = lifeThroughStrikes(battle, target, threat, backed)
        const saved = lifeThroughStrikes(battle, target, threat, backed, [ward])
        if (saved.hp > result.hp) {
          const loss = Math.max(0, target.hp - result.hp) / target.maxHp
          const follow = target.actionAt <= impact + COOLDOWN.move && !isOutside(end)
          const benefit = (saved.hp - result.hp) / target.maxHp * 4.6 + loss * 1.4
          const critical = !result.hp ? 1.45 : follow && result.hp <= target.maxHp * .22 ? 1.2 : 0
          timelyWard = (benefit + critical) * Math.max(.55, 1 - (impact - battle.time - .55) * .35)
        }
      }
    }
    return Math.max(shiftAlly(use, { at: target, target }), cover + saved / Math.max(1, hp) * 1.5 + survival + buysSurvival + timelyWard)
  },
}

const pairStep: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { battle, actor, skill, allies, enemies } = use
  const { windup: start, pairedTravel } = dancerChoreography(skill.id)!
  const end = start + pairedTravel
  const fraction = stepAmount(skill, "b") / 100
  const routes = previewSkillDisplacements(battle, actor, skill, target, target)
  if (routes.length !== 2) return 0
  let value = 0
  for (const route of routes) {
    const ally = allies.find(unit => unit.id === route.unit)
    if (!ally) return 0
    const life = ally.hp + existingShield(battle, ally, end)
    if (pendingThreat(use, ally, 0, start) >= life) return 0
    const from = ally === actor ? actor : future(battle, ally, start)
    let before = 0
    let after = 0
    for (const warning of battle.runtime.visuals) {
      if (warning.phase !== "warning" || warning.effect !== "damage" || warning.until <= battle.time + start ||
        warning.until > battle.time + end + .55 || !enemies.some(enemy => enemy.id === warning.owner)) continue
      const at = ally === actor ? actor : future(battle, ally, warning.until - battle.time)
      const damage = warningDamage(battle, warning, ally, at)
      if (areaHits(warning.area, at)) before += damage
      if (walkHitsWarning(from, route.to, battle.time + start, battle.time + end, warning)) after += damage
    }
    if (after >= life && before < life) return 0
    const saves = before >= life && after < life
    const watch = pressure(use, ally, from) - pressure(use, ally, route.to)
    const shield = protection(use, ally, fraction)
    const losesAttack = ally !== actor && health(ally) > .60 && ally.actionAt <= battle.time + end + .3 &&
      enemies.some(enemy => edgeDistance(from, enemy) <= attackRange(battle, ally, enemy)) &&
      enemies.every(enemy => edgeDistance(route.to, enemy) > attackRange(battle, ally, enemy) + 24)
    value += shield + (before - after) / ally.maxHp * 2 + watch * .24 + (saves ? 1.6 : 0) - (losesAttack ? .65 : 0)
  }
  return Math.max(0, value)
} }

function watchMovement(use: SkillUse, target: EdgeUnit, distance: number) {
  const { battle, skill } = use
  if (battle.runtime.watches.some((watch) => watch.target === target.id && watch.cast.skill?.id === skill.id &&
    watch.until > battle.time && watch.uses > 0)) return false
  const plan = nextApproach(use, target, COOLDOWN.shared)
  return !!plan && plan.gap - plan.reach * .75 >= distance
}

const gates: SkillTactic = { prepare(use) {
  const { battle, actor, allies, enemies } = use
  const clocks = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring ?? battle
  const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
  const decisionAt = (time: number) => battle.time + Math.ceil((time - battle.time) / frame - 1e-6) * frame
  const lead = Math.max(COOLDOWN.shared, clocks.moveAt - battle.time)
  const earliest = battle.time + lead
  const moveAt = decisionAt(earliest)
  const clearsAt = possiblePortalClearAt(battle, actor)
  // Even an entry underfoot takes a movement order. With no way to get
  // through before a ready clear, wait for the counter to be spent.
  if (clearsAt <= earliest + .11) return { aims: [], score: () => 0 }
  const stays = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const endangered = allies.flatMap(ally => {
    if (ally.hp > ally.maxHp * .25) return []
    const threat = defensiveThreat(battle, { ...ally, ...stays(ally, earliest) }, enemies, earliest, earliest + COOLDOWN.move)
    if (!threat) return []
    const aid = aidBeforeHit(battle, ally, threat.hitAt, stays)
    return threat.damage >= aid.hp + aid.shield
      ? [{ ally, threat, at: stays(ally, threat.hitAt), need: threat.damage - aid.hp - aid.shield }] : []
  })
  const travelers = allies.flatMap(ally => {
    const plan = nextApproach(use, ally, lead)
    if (!plan || ally.move && edgeDistance(plan.at, ally.move) > 8) return []
    const traveler = { ...ally, ...plan.at, move: null,
      actionAt: ally === actor ? battle.time + actor.actionCooldown : ally.actionAt }
    if (traveler.actionAt > earliest + 2.1) return []
    const targets = enemies.filter(enemy => {
      const distance = edgeDistance(traveler, future(battle, enemy, lead))
      const range = attackRange(battle, traveler, enemy)
      return distance > range + 12 && distance <= range + 570
    })
    // Reserve the shared action when the only useful traveler has a way to
    // keep a teammate alive from the current side of the portal.
    const ward = endangered.length ? ally.actives.find(skill => bulwarkChoreography(skill.id)?.motif === "citadel") : undefined
    const wardDelay = ward ? ward.steps[0].delay + (bulwarkChoreography(ward.id)?.windup ?? 0) + SPARRING_STEP : 0
    const coverRadius = ward ? ward.aim.range + ward.steps[0].selector.size[0] - 12 : 0
    const capacity = ward ? ally.maxHp * stepAmount(ward, "wall") / 100 : 0
    const rescues = endangered.filter(patient => patient.ally !== ally && patient.need < capacity &&
      decisionAt(Math.max(battle.time + COOLDOWN.shared, traveler.actionAt)) + wardDelay < patient.threat.hitAt &&
      edgeDistance(traveler, patient.at) < coverRadius)
    return [{ traveler, enemy: plan.enemy, targets, rescues, wardDelay, coverRadius }]
  })
  const aims = travelers.flatMap(({ traveler, enemy }) => {
    const axis = direction(traveler, future(battle, enemy, lead))
    return [70, 135, 190].flatMap(length => {
      const center = along(traveler, axis, length)
      return [-110, 0, 110].map(offset => ({ at: inside(along(center, left(axis), offset), 20) }))
    })
  })
  const { radius } = SUMMON_PLANS.gates.gate!
  return { aims, score({ at }) {
    const [first, second] = summonSpawns("gates", actor, at)
    const values = travelers.map(({ traveler, targets, rescues, wardDelay, coverRadius }) => {
      let value = 0
      for (const [entry, exit] of [[first, second], [second, first]]) {
        if (edgeDistance(traveler, entry) > movementAllowance(battle, traveler, MOVE_REACH, entry) + radius - 4) continue
        for (const enemy of targets) {
          const route = portalAdvance(battle, traveler, enemy, entry, exit, radius, earliest, clearsAt)
          if (!route || route.advantage < 32) continue
          if (Number.isFinite(clearsAt) && (!route.strike || traveler.actionAt > route.arrival + .5)) continue
          if (lead > COOLDOWN.shared + .4 && route.opening < .55) continue
          if (rescues.length) {
            const strikeAt = decisionAt(Math.max(moveAt + route.delay, traveler.actionAt, moveAt + COOLDOWN.shared))
            const wardAt = decisionAt(strikeAt + Math.max(traveler.actionCooldown, COOLDOWN.shared)) + wardDelay
            if (rescues.some(patient => wardAt >= patient.threat.hitAt || edgeDistance(route.stop, patient.at) > coverRadius)) continue
          }
          const opening = portalOpeningValue(route)
          const delay = route.arrival - battle.time - COOLDOWN.shared
          const access = (.34 + Math.min(1.32, route.advantage / 115) + (route.strike ? .25 : 0)) / (1 + .42 * delay)
          value = Math.max(value, access + opening * .53)
        }
      }
      return value
    }).filter(value => value > 0)
    return values.length ? Math.max(...values) + Math.min(2, values.length - 1) * .12 : 0
  } }
} }

function linkedGuardValue(use: SkillUse, target: EdgeUnit, share: number, delay: number, capacity: number) {
  if (delay > 2.3) return 0
  const { battle, actor } = use
  if (battle.runtime.buffs.some(buff => buff.target === target.id && buff.kind === "split" &&
    buff.until > battle.time + delay && unitOf(battle, buff.cast.owner)?.hp)) return 0
  const holdPosition = target === actor ? actor : undefined
  const { damage, telegraphed } = incomingHits(use, target, delay, delay + 2.6, holdPosition)
  const early = pendingThreat(use, target, 0, delay - .001, holdPosition)
  const shield = existingShield(battle, target, delay + .25)
  const hp = target.hp + shield
  if (early >= hp) return 0
  const block = Math.min(damage * share, capacity)
  const exposed = Math.min(block, Math.max(0, early + damage - shield))
  const saves = early + damage >= hp && early + damage - block < hp
  const forecast = exposed / target.maxHp * (4.5 + 3 * (1 - health(target))) / (1 + delay * .45)
  return forecast + (saves ? 1.65 : 0) + (telegraphed && exposed > 0 ? .32 : 0)
}

function linkedGuardian(kind: "bodyguard" | "paperPack"): SkillTactic {
  const plan = SUMMON_PLANS[kind]
  return { prepare(use) {
    const { battle, actor, allies } = use
    const guard = plan.guard!
    const prior = activeDeployments(battle).find(({ group, plan }) =>
      group.owner === actor.id && plan.guard?.type === "linked")
    const kept = prior ? existingLinkedGuard(use, prior.group) : 0
    const aims = allies.map(target => ({ at: target, target }))
    return { aims, score({ target }) {
      if (!target) return 0
      const gap = Math.min(...summonSpawns(kind, actor, target).map(body => edgeDistance(body, target)))
      const delay = plan.motion?.kind === "follow" ? Math.max(0, gap - guard.reach) / plan.motion.speed : 0
      const forecast = linkedGuardValue(use, target, guard.share, delay, Math.round(actor.maxHp * plan.health))
      if (prior) return Math.max(0, forecast - kept)
      const nearby = kind === "bodyguard" && !hasBuff(battle, target, "split")
        ? protection(use, target, guard.share * .61) * (health(target) < .6 ? 1.5 : 1) / (1 + delay * .45) : 0
      return Math.max(nearby, forecast)
    } }
  } }
}

function existingLinkedGuard(use: SkillUse, group: SummonGroup) {
  const { battle } = use
  const target = unitOf(battle, group.target)
  if (!target?.hp) return 0
  const plan = SUMMON_PLANS[group.deployment.kind]
  const guard = plan.guard!
  const ready = Math.max(0, group.deployment.bodies[0].actionAt - battle.time)
  const covers = group.deployment.bodies.filter(body => body.hp).map(body => {
    const gap = edgeDistance(body, target)
    const travel = plan.motion?.kind === "follow" ? Math.max(0, gap - guard.reach) / plan.motion.speed : 0
    const delay = Math.max(ready, travel)
    return { delay, hp: body.hp }
  })
  const values = covers.map(({ delay, hp }) => battle.time + delay >= group.start + plan.duration
    ? 0 : linkedGuardValue(use, target, guard.share, delay, hp))
  return Math.max(0, ...values)
}

function readyAreaWardValue(use: SkillUse, ally: EdgeFighter, ward: TimedAid, standing: PositionAt) {
  const { actor, allies, battle, enemies } = use
  const sparring = battle.sparring
  if (!sparring || ally.force || ally.move || isOutside(ally)) return 0
  const now = battle.time
  const until = now + 2 * COOLDOWN.shared + .5
  const contacts = announcedStrikes(battle, ally, until, standing)
  const path = positionAfterStrike(battle, ally, contacts, standing)
  if (!path || !lifeThroughStrikes(battle, ally, contacts, path.position).hp) return 0
  const { position } = path
  const clocks = sideOf(battle, ally.id) === "ally" ? battle : sparring
  const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
  const fatalReplies: AnnouncedStrike[][] = []
  for (const reply of shortAreaThreats(battle, ally, enemies, until, position, now, undefined, true)) {
    if (reply.at <= ward.at + SPARRING_STEP) continue
    const sequence = [...contacts.filter(hit => hit.at <= reply.at), reply]
    if (lifeThroughStrikes(battle, ally, sequence, position).hp) continue
    const declared = reply.strike.cast.issuedAt!
    const earliest = Math.max(now + COOLDOWN.shared, clocks.moveAt, declared)
    const start = now + Math.ceil((earliest - now) / frame - 1e-6) * frame
    const dodge = start < reply.at - .1 && !movementStopped(battle, ally) && dodgeAreaDamage(battle, ally, reply, start)
    if (dodge && !dodge.exposedToPursuit) continue
    const source = unitOf(battle, reply.source.id)
    if (source) {
      const incoming = announcedStrikes(battle, source, declared - SPARRING_STEP, standing)
      if (incoming.length && !lifeThroughStrikes(battle, source, incoming, standing).hp) continue
    }
    fatalReplies.push(sequence)
  }
  if (!fatalReplies.length) return 0
  // Alternative enemy orders share one action. Compare the protection kept
  // against the hardest reply, including what an available teammate can grant.
  const survivesWith = (aid: TimedAid) => Math.min(...fatalReplies.map(sequence =>
    lifeThroughStrikes(battle, ally, sequence, position, [aid]).hp))
  const remaining = survivesWith(ward)
  if (!remaining) return 0
  const strongerBastion = allies.some(guard => {
    if (guard === actor || guard.actionAt > now || guard.force || guard.move || isOutside(guard)) return false
    const skill = guard.actives.find(skill => bulwarkChoreography(skill.id)?.motif === "bastions")
    if (!skill) return false
    const { aims, wards, current } = entryWards(battle, guard, skill, allies)
    if (current?.has(ally)) return false
    return aims.some(at => {
      const aid = wards(at).get(ally)
      return aid && aid.at <= ward.at && (aid.shield ?? 0) > (ward.shield ?? 0) && survivesWith(aid) >= remaining
    })
  })
  return strongerBastion ? 0 : 4.3 + Math.min(.8, 3 * remaining / ally.maxHp)
}

const riftCurtain: SkillTactic = { prepare(use) {
    const { battle, actor, allies, enemies, skill } = use
    const delay = warlockContact(use)
    const release = battle.time + delay
    const radius = skill.steps[0].selector.size[0]
    const foes = enemies.map(unit => future(battle, unit, delay))
    const ward = skill.steps[1].operations[0]
    const mark = skill.steps[2].operations[0]
    const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - battle.time)
    const friends = allies.flatMap(ally => {
      const place = riftWardPosition(use, ally, delay)
      if (!place) return []
      const contacts = announcedStrikes(battle, ally, release + 1.2, position)
      const before = contacts.filter(contact => contact.at <= release)
      // Resolve the blows that land during the windup before valuing the new
      // ward. An intact shield now can be nearly gone by delivery.
      const fresh = lifeThroughStrikes(battle, ally, before, position, [], undefined, release)
      if (!fresh.hp || !before.length && pendingThreat(use, ally, 0, delay) >= ally.hp + fresh.shield) return []
      const nominal = Math.round(ally.maxHp * ward.args[0] / 100)
      const extra = Math.max(0, nominal - fresh.shield)
      const aid = { at: release, shield: nominal, shieldUntil: release + (ward.args[1] ?? 12) }
      const danger = pressure(use, ally)
      const coverage = danger ? wardValue(danger, extra / ally.maxHp, fresh.hp / ally.maxHp) : 0
      let survival = 0
      if (extra && contacts.length > before.length) {
        const without = lifeThroughStrikes(battle, ally, contacts, position)
        const withWard = lifeThroughStrikes(battle, ally, contacts, position, [aid])
        survival = !without.hp && withWard.hp ? 1.1 : 0
      }
      const saving = extra && fresh.hp <= ally.maxHp * .35
        ? readyAreaWardValue(use, ally, aid, position) : 0
      const canUseMark = ally !== actor && ally.actionAt <= battle.time + 2.5 &&
        enemies.some((enemy, index) => edgeDistance(place, foes[index]) <= attackRange(battle, ally, enemy))
      const value = coverage + survival + (canUseMark ? mark.args[0] * .7 : 0)
      return value > 0 || saving > 0 ? [{ place, value, saving }] : []
    })
    const places = friends.map(({ place }) => place)
    const mixed = places.flatMap(ally => foes.filter(foe => edgeDistance(ally, foe) <= radius * 2).map(foe => ({ at: midpoint(ally, foe) })))
    return {
      aims: [...clusterAims(foes, radius * 2), ...clusterAims(places, radius * 2), ...mixed],
      score: ({ at }) => {
        const area = areaOf("C", at, direction(actor, at), radius)
        const hit = enemies.reduce((sum, enemy, index) => areaHits(area, foes[index]) ? sum + hitScore(use, enemy, stepPower(skill)) : sum, 0)
        let aid = 0
        let saving = 0
        for (const ally of friends) {
          const gap = edgeDistance(at, ally.place)
          if (gap > radius) continue
          // Leave room for movement during the windup when aims cover the same allies.
          aid += ally.value * (1 - .12 * gap / radius)
          saving = Math.max(saving, ally.saving)
        }
        return (hit + aid) / (1 + delay * .55) + saving
      },
    }
} }

function riftWardPosition({ battle, actor, enemies }: SkillUse, ally: EdgeFighter, delay: number) {
  if (ally === actor) return actor
  const forced = ally.force && ally.force.since + ally.force.duration > battle.time + delay
  if (forced) return
  const at = future(battle, ally, delay)
  // A late, narrow ward aimed at a current walk is unlikely to land when
  // a visible displacement will change the ally's position first.
  const pushed = battle.runtime.visuals.some(warning => warning.phase === "warning" && warning.pushDistance &&
    warning.pushDistance >= 70 && warning.until > battle.time && warning.until < battle.time + delay &&
    enemies.some(enemy => enemy.id === warning.owner) && areaHits(warning.area, future(battle, ally, warning.until - battle.time)))
  return pushed ? undefined : at
}

function healForSurvival(use: SkillUse, target: EdgeUnit, fraction: number, arrival: number): number | undefined {
  const shield = existingShield(use.battle, target, arrival)
  const hp = target.hp + shield
  const before = pendingThreat(use, target, 0, arrival)
  if (before >= hp) return
  const healing = Math.min(target.maxHp - target.hp, fraction * target.maxHp * healingReceived(use.battle, target))
  const after = pendingThreat(use, target, arrival, arrival + 1.4)
  const wouldFall = before + after >= hp && before + after < hp + healing
  return healScore(use.battle, target, fraction) + (wouldFall ? 1.35 : 0)
}

const triage: SkillTactic = { score(use) {
  const { battle, actor, skill } = use
  const windup = healerChoreography(skill.id)!.windup
  const step = skill.steps[0]
  const [pool, cap] = step.operations[0].args
  const [selection] = predictSkillTargets(battle, actor, skill, actor, undefined,
    new Map([[step, ally => ally === actor ? actor : future(battle, ally, windup)]]))
  const patients = selection.targets.filter(ally => ally.hp < ally.maxHp).sort((a, b) => health(a) - health(b))
  let budget = Math.floor(actor.maxHp * pool / 100)
  let value = 0
  for (const [index, ally] of patients.entries()) {
    if (!budget) break
    const dose = Math.min(budget, Math.floor(ally.maxHp * cap / 100))
    const score = healForSurvival(use, ally, dose / ally.maxHp, windup + (index + 1) * .16)
    if (score === undefined) continue
    budget -= Math.min(dose, ally.maxHp - ally.hp, Math.round(dose * healingReceived(battle, ally)))
    value += score
  }
  return value
} }

const stopLoss: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { battle, actor, skill } = use
  const arrival = healerChoreography(skill.id)!.windup + Math.min(.28, Math.max(.105, edgeDistance(actor, target) / 1250))
  const recovery = healForSurvival(use, target, stepHeal(skill), arrival)
  if (recovery === undefined) return 0
  const guard = stepAmount(skill, "guard") / 100
  // The diagnosis only blocks a single direct skill hit. Basic attacks give its ward no value.
  const { spell } = incomingHits(use, target, arrival, arrival + 2.5)
  const covered = battle.runtime.buffs.some(buff => buff.kind === "guard" && buff.target === target.id &&
    buff.until > battle.time + arrival + 1.5 && (!buff.style || buff.style === "skill") && buff.values[0] / 100 >= guard)
  const protection = covered ? 0 : Math.min(.28, spell / target.maxHp) * guard * (health(target) < .4 ? 6 : 4)
  const landing = target === actor ? actor : future(battle, target, arrival)
  const life = target.hp + existingShield(battle, target, arrival)
  for (const warning of battle.runtime.visuals) {
    const delay = warning.until - battle.time
    if (warning.phase !== "warning" || warning.effect !== "damage" || delay <= arrival || delay > arrival + .65 ||
      !use.enemies.some(enemy => enemy.id === warning.owner)) continue
    const at = target === actor ? landing : future(battle, target, delay)
    if (!areaHits(warning.area, at)) continue
    const hit = warningDamage(battle, warning, target, at)
    const restored = Math.min(target.maxHp - target.hp, stepHeal(skill) * target.maxHp * healingReceived(battle, target))
    if (hit >= life && hit * (1 - (covered ? 0 : guard)) < life + restored) return recovery + protection + 1.4
  }
  return recovery + protection
} }

const shieldHandoff: SkillTactic = { score(use, { target }) {
  if (!target || !isFighter(target)) return 0
  const { battle, actor, enemies, skill } = use
  const forecast = forecastShieldHandoff(battle, actor, target, skill)
  if (!forecast) return 0
  const { aid, debit, position, patient } = forecast
  const ratio = patient.hp / target.maxHp
  const base = Math.min(1 - ratio, (aid.heal ?? 0) / target.maxHp) * (ratio < .4 ? 10 : 6)
  if (!battle.sparring) return base
  const through = aid.at + 1.25
  const urgent = ratio <= .24
  const replies = (unit: EdgeFighter, anticipate: boolean) => {
    const incoming = announcedStrikes(battle, unit, through, position)
    if (!anticipate) return [incoming]
    const strikes = [...shortAreaThreats(battle, unit, enemies, through, position, battle.time, undefined, true),
      ...shortAreaThreats(battle, unit, enemies, through, position, battle.time, undefined, "short-windup")]
    return [incoming, ...strikes
      .map(strike => [...incoming.filter(hit => hit.at <= strike.at), strike])]
  }
  if (debit.shieldSpend && replies(actor, urgent).some(hits => lifeThroughStrikes(battle, actor, hits, position).hp > 0 &&
    !lifeThroughStrikes(battle, actor, hits, position, [debit]).hp)) return 0
  if (!urgent) return base
  const savesAgainst = (sequence: AnnouncedStrike[]) => {
    const plain = lifeThroughStrikes(battle, target, sequence, position)
    if (plain.hp) return 0
    const saved = lifeThroughStrikes(battle, target, sequence, position, [aid])
    return saved.hp > 0 && plain.downAt > aid.at + SPARRING_STEP ? 2.4 + saved.hp / target.maxHp : 0
  }
  return base + Math.max(...replies(target, true).map(savesAgainst))
} }

const warlockContact = ({ skill }: SkillUse) => skill.steps[0].delay + (warlockChoreography(skill.id)?.windup ?? 0)

function groundAttack(impact: (use: SkillUse) => number, spread: number, follow?: "fissures" | "echo" | "repeat" | "pulses" | "core"): SkillTactic {
  return {
    aims: (use) => clusterAims(use.enemies.map((unit) => future(use.battle, unit, impact(use))), spread),
    score(use, { at }) {
      const area = previewSkillAreas(use.battle, use.actor, use.skill, at)[0]
      if (!area) return 0
      const time = impact(use)
      const first = contacts(use, area, time)
      let value = first.reduce((total, hit) => total + hitScore(use, hit.unit, stepPower(use.skill))
        + .07 / (1 + edgeDistance(hit.at, at) / 70), 0)
      if (!first.length || !follow) return value
      if (follow === "repeat") return value + stepPower(use.skill, 1)
      if (follow === "core") {
        const coreRadius = use.skill.steps[1].selector.size[0]
        return value + first.reduce((sum, hit) => sum + (edgeDistance(hit.at, area.center) <= coreRadius
          ? hitScore(use, hit.unit, stepPower(use.skill, 1)) : 0), 0)
      }
      if (follow === "pulses") {
        for (const [index, step] of use.skill.steps.entries()) {
          if (!index) continue
          value += contacts(use, area, time + step.delay - use.skill.steps[0].delay)
            .reduce((sum, { unit }) => sum + hitScore(use, unit, stepPower(use.skill, index)), 0) * .67 ** index
        }
        return value
      }
      const centers = follow === "fissures" ? first.map((hit) => hit.at)
        : [centerOf(first.map(({ unit }) => future(use.battle, unit, time + .3)))]
      const radius = follow === "fissures" ? 66 : 112
      const next = time + (follow === "fissures" ? .35 : .65)
      for (const unit of use.enemies) {
        const position = future(use.battle, unit, next)
        if (centers.some((center) => edgeDistance(center, position) <= radius)) value += hitScore(use, unit, stepPower(use.skill, 1)) * .8
      }
      return value
    },
  }
}

function fixedGroundContacts(use: SkillUse, windup = fixedSkillWindup(use.skill) ?? 0) {
  const { battle, actor, enemies, skill } = use
  const first = skill.steps[0]
  const delay = windup + first.delay
  const impact = battle.time + delay
  const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - battle.time)
  const hasStrikes = battle.runtime.pending.some(job => job.strike)
  const targets = enemies.flatMap(unit => {
    if (!targetable(battle, unit, impact)) return []
    const incoming = hasStrikes ? announcedStrikes(battle, unit, impact - SPARRING_STEP, position) : []
    const path = incoming.length ? positionAfterStrike(battle, unit, incoming, position)?.position ?? position : position
    const aid = aidBeforeHit(battle, unit, impact, path)
    const { hp, shield } = incoming.length ? lifeThroughStrikes(battle, unit, incoming, path, [], undefined, impact) : aid
    return hp > 0 ? [{ unit, at: path(unit, impact), hp, shield, defy: aid.defy, path, incoming }] : []
  })
  const power = stepPower(skill)
  const intersection = first.operations.find(op => op.kind === "d" && op.style === "crosscore")?.args[1] ?? 0
  const resolve = (aim: EdgePoint, aid?: ReadonlyMap<EdgeUnit, TimedAid>) => {
    const [area] = previewSkillAreas(battle, actor, skill, aim)
    const spent = directHitForecast()
    const cast = { ...forecastSkillCast(actor, skill, actor), target: undefined, aim, id: battle.runtime.sequence + 1 }
    const hits = targets.flatMap(row => {
      if (!area || !skillAreaContains(cast, first.selector.shape, area, row.at)) return []
      const { unit, at } = row
      const ward = aid?.get(unit)
      const { hp, shield, defy } = ward
        ? lifeThroughStrikes(battle, unit, row.incoming, row.path, [ward], undefined, impact) : row
      if (!hp) return []
      const strength = power + (intersection && areaHits(area, at) > 1 ? intersection : 0)
      const damage = estimateDirectHit(battle, actor, unit, strength, "skill", at, impact, shield, { hp, defy, cast, spent })
      return [{ ...row, damage }]
    })
    return { area, hits, cast, spent }
  }
  return { targets, resolve, position, impact }
}

const dawnLine: SkillTactic = { adjust(use) {
  const { battle, actor, allies, skill } = use
  if (allies.length < 2) return
  const [first, ward] = skill.steps
  const [length, width] = first.selector.size
  const push = stepAmount(skill, "p")
  const pending = battle.runtime.pending.some(job => job.strike && !sameSide(battle, actor.id, job.strike.cast.owner))
  if (!pending && !use.enemies.some(unit => unit.hp <= actor.attack * 1.7 || borderGap(unit) <= push)) return
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  const time = impact - battle.time
  const shields = allies.flatMap(unit => {
    const contacts = pending ? announcedStrikes(battle, unit, impact + COOLDOWN.shared, position) : []
    const before = contacts.filter(contact => contact.at <= impact + SPARRING_STEP)
    const path = before.length ? positionAfterStrike(battle, unit, before, position)?.position : position
    if (!path) return []
    const life = lifeThroughStrikes(battle, unit, before, path, [], undefined, impact + SPARRING_STEP)
    if (!life.hp) return []
    const aid = aidFrom(battle, actor, unit, skill, ward, time)
    const extra = Math.max(0, (aid.shield ?? 0) - life.shield)
    if (!extra) return []
    const place = path(unit, impact)
    const danger = pressure(use, unit, place)
    const prior = lifeThroughStrikes(battle, unit, contacts, path)
    const after = lifeThroughStrikes(battle, unit, contacts, path, [aid])
    const saved = prior.hp === 0 && after.hp > 0 ? 2.7 : 0
    const value = saved + 3.6 * Math.max(0, after.hp - prior.hp) / unit.maxHp +
      (danger > 0 ? extra / unit.maxHp * Math.min(2.3, danger + .55) : 0)
    return [{ unit, at: place, hp: life.hp, value }]
  })
  const points = [...targets.map(row => row.at), ...shields.filter(row => row.value > 0).map(row => row.at)]
    .filter(at => edgeDistance(actor, at) > 3 && edgeDistance(actor, at) <= length + width / 2)
  if (!points.length) return
  const directions = [...points]
  for (const [index, at] of points.entries()) for (const other of points.slice(index + 1)) {
    const apart = edgeDistance(at, other)
    if (apart <= width * 2.25) directions.push(midpoint(at, other))
    else if (edgeDistance(actor, at) > width && edgeDistance(actor, other) > width) {
      const one = direction(actor, at)
      const two = direction(actor, other)
      if (Math.abs(one.x * two.y - one.y * two.x) * Math.min(edgeDistance(actor, at), edgeDistance(actor, other)) <= width &&
        one.x * two.x + one.y * two.y > 0) directions.push(along(actor, midpoint(one, two), length))
    }
  }
  const horizontalLight = actor.passives.find(passive => passive.id === "paladin/Prismatic/P2" &&
    (actor.passiveAt[passive.id] ?? 0) <= impact)
  const aims = directions.map(point => {
    const end = along(actor, direction(actor, point), length)
    return { at: isOutside(end) ? fieldCrossing(actor, end) : end }
  })
  return { aims, score({ at }) {
    const { area, hits, cast } = resolve(at)
    if (!area) return 0
    const covered = shields.filter(row => skillAreaContains(cast, ward.selector.shape, area, row.at))
    let value = covered.reduce((sum, row) => sum + row.value, 0)
    for (const row of hits) {
      if (row.damage.lethal) {
        value += .95
        continue
      }
      if (borderGap(row.at) > push) continue
      const shift = previewContactShift(battle, actor, skill, first, at, area, row.unit, row.at, impact)
      if (shift) value += .60 * ejectionValue(row.unit, row.at, shift.end, impact)
    }
    if (horizontalLight && covered.length >= 2) {
      const recipient = covered[0]
      value += Math.min(1 - recipient.hp / recipient.unit.maxHp,
        horizontalLight.steps[0].operations[0].args[0] / 100 * healingReceived(battle, recipient.unit, impact)) * 3.6
    }
    return value
  } }
} }

function ejectionValue(target: EdgeUnit, at: EdgePoint, shifted: EdgePoint, impact: number) {
  if (!isOutside(at) && isOutside(shifted)) {
    const cooldown = Math.max(0, target.actionAt - impact)
    return 1.05 + Math.min(.45, borderGap(shifted) / 260) + (cooldown <= COOLDOWN.shared ? .22 : 0)
  }
  if (isOutside(at)) {
    if (!isOutside(shifted)) return -.55
    return clamp((borderGap(shifted) - borderGap(at)) / 200, -.55, .48)
  }
  return 0
}

function interruptCharge(use: SkillUse, target: EdgeUnit, impact: number, position: (unit: EdgeUnit, at: number) => EdgePoint) {
  const charge = chargeOf(use.battle, target)
  if (!charge || charge.until <= impact + SPARRING_STEP) return 0
  return chargeDamageValue(use, target, charge.from, charge.direction, charge.until, position)
}

function chargeDamageValue(use: SkillUse, target: EdgeUnit, from: EdgePoint, axis: EdgePoint, at: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint) {
  let value = 0
  for (const ally of use.allies) {
    const place = position(ally, at)
    if (!withinCharge(from, axis, place)) continue
    const aid = aidBeforeHit(use.battle, ally, at, position)
    const hit = estimateDirectHit(use.battle, target, ally, CHARGE.power, "enemy", place, at, aid.shield, aid)
    value += (hit.hpLoss + .3 * hit.shieldLoss) / ally.maxHp * 3.2 + (hit.lethal ? 1.8 : 0)
  }
  return value
}

function breakerDamage(use: SkillUse, target: EdgeUnit, damage: ReturnType<typeof estimateDirectHit>, impact: number) {
  const { battle, actor, skill } = use
  const power = stepPower(skill)
  const raw = actor.attack * power * (1 - target.armor)
  const direct = Math.min(1, (Math.max(0, damage.hpLoss - damage.saveHeal) + damage.shieldLoss * .40) / Math.max(1, raw))
  return hitScore(use, target, power) * (.22 + .78 * direct) / (1 + .55 * (impact - battle.time)) + (damage.lethal ? .85 : 0)
}

const scoreLock: SkillTactic = { prepare(use) {
  const { battle, actor, skill } = use
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  const [strike, seal] = skill.steps
  const radius = strike.selector.size[0]
  const spots = targets.map(row => row.at)
  let nextCharge: { point: EdgePoint; value: number } | undefined
  const boss = battle.boss
  if (!battle.sparring && boss.hp && use.enemies.includes(boss)) {
    const ready = Math.max(battle.time, boss.sharedAt, boss.actionAt, chargeOf(battle, boss)?.until ?? 0,
      boss.force ? boss.force.since + boss.force.duration : battle.time,
      boss.move && !movementStopped(battle, boss) ? battle.time + edgeDistance(boss, boss.move) / movementSpeed(battle, boss) : 0,
      ...battle.runtime.buffs.filter(buff => buff.target === boss.id && buff.kind === "block").map(buff => buff.until))
    if (ready > impact + SPARRING_STEP && ready < Math.min(impact + seal.zone!.duration, battle.time + 3.2)) {
      const place = position(boss, ready)
      const covered = battle.runtime.fields.some(field => field.mode === "precharge" && field.until > ready &&
        !field.seen.has(boss.id) && sameSide(battle, field.cast.owner, actor.id) && areaHits(field.area, place))
      const origin = { ...boss, ...place }
      const finishingBasic = use.allies.some(ally => {
        const at = position(ally, ready)
        if (edgeDistance(place, at) > attackRange(battle, origin, ally, ready) || !targetable(battle, ally, ready)) return false
        const aid = aidBeforeHit(battle, ally, ready, position)
        return estimateDirectHit(battle, origin, ally, 1, "basic", at, ready, aid.shield, aid).lethal
      })
      if (!isOutside(place) && !covered && !finishingBasic) {
        const ends = ready + CHARGE.windup
        const value = Math.max(0, ...use.allies.map(ally => {
          const aim = position(ally, ends)
          if (edgeDistance(place, aim) > CHARGE.reach - 26 || !targetable(battle, ally, ends)) return 0
          const gap = edgeDistance(place, position(ally, ready))
          return chargeDamageValue(use, origin, place, direction(place, aim), ends, position) *
            (gap > attackRange(battle, origin, ally, ready) ? .62 : .34)
        }))
        if (value > .25) {
          nextCharge = { point: place, value }
          spots.push(place)
        }
      }
    }
  }
  return { aims: clusterAims(spots, radius * 2), score({ at }) {
    const { hits, area } = resolve(at)
    const delay = nextCharge && area && areaHits(area, nextCharge.point) && !hits.some(row => row.unit === boss && row.damage.lethal)
      ? Math.min(1.9, nextCharge.value) : 0
    return hits.reduce((value, row) => value + breakerDamage(use, row.unit, row.damage, impact) +
      (row.damage.lethal ? 0 : interruptCharge(use, row.unit, impact, position)), delay)
  } }
} }

const scatterSeals: SkillTactic = { prepare(use) {
  const { battle, actor, skill, allies } = use
  const [, ward] = skill.steps
  const radius = ward.selector.size[0]
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  const delay = impact - battle.time
  const until = impact + COOLDOWN.shared + .3
  const pending = battle.runtime.pending.some(job => job.strike && !sameSide(battle, actor.id, job.strike.cast.owner))
  const nearby = allies.flatMap(unit => {
    const contacts = pending ? announcedStrikes(battle, unit, until, position) : []
    const opening = contacts.filter(hit => hit.at <= impact + SPARRING_STEP)
    const path = opening.length ? positionAfterStrike(battle, unit, opening, position)?.position : position
    if (!path) return []
    const before = lifeThroughStrikes(battle, unit, opening, path, [], undefined, impact + SPARRING_STEP)
    if (!before.hp) return []
    const at = path(unit, impact)
    const aid = aidFrom(battle, actor, unit, skill, ward, delay)
    const extra = Math.max(0, (aid.shield ?? 0) - before.shield)
    if (!extra) return [{ unit, at, hp: before.hp, value: 0 }]
    const firstPush = contacts.findIndex((hit, index) => index >= opening.length && announcedShift(battle, hit, unit, path))
    const sequence = firstPush < 0 ? contacts : contacts.slice(0, firstPush + 1)
    const without = lifeThroughStrikes(battle, unit, sequence, path)
    const shielded = lifeThroughStrikes(battle, unit, sequence, path, [aid])
    const saved = !without.hp && shielded.hp > 0 ? 2.45 : 0
    const near = pressure(use, unit, at)
    const value = saved + 3.8 * Math.max(0, shielded.hp - without.hp) / unit.maxHp +
      (without.hp && near > 0 ? extra / unit.maxHp * Math.min(2.2, near + .35) : 0)
    return [{ unit, at, hp: before.hp, value }]
  })
  const splinter = actor.passives.find(passive => passive.id === "spellbreaker/Prismatic/P5" &&
    (actor.passiveAt[passive.id] ?? 0) <= impact)
  const healStep = splinter?.steps[0]
  const patient = healStep && nearby.filter(row => row.unit !== actor && row.hp < row.unit.maxHp &&
    edgeDistance(actor, row.at) <= healStep.selector.size[0])
    .sort((a, b) => edgeDistance(actor, a.at) - edgeDistance(actor, b.at))[0]
  const healing = patient && healStep ? Math.min(1 - patient.hp / patient.unit.maxHp,
    healStep.operations[0].args[0] / 100 * healingReceived(battle, patient.unit, impact)) * 4.5 : 0
  const strip = new Map(targets.map(({ unit }) => [unit, removableBuffs(battle, unit, false, "", impact)]))
  const aims = clusterAims([...targets.map(row => row.at), ...nearby.filter(row => row.value > 0).map(row => row.at)], radius * 2)
  return { aims, score({ at }) {
    const { area, hits, cast, spent } = resolve(at)
    if (!area) return 0
    let removed = false
    let value = 0
    for (const row of hits) {
      value += breakerDamage(use, row.unit, row.damage, impact)
      if (row.damage.lethal) continue
      const buff = strip.get(row.unit)?.find(buff => !spent.guards.has(buff) && !spent.saves.has(buff.id))
      if (!buff) continue
      removed = true
      const consequential = ["amp", "ampq", "guard", "reflect", "split", "defy", "res", "anti", "returnhp", "exguard"].includes(buff.kind)
      value += Math.min(1, (buff.until - impact) / 2) * (consequential ? .81 : .28)
    }
    return value + (removed ? healing : 0) + nearby.reduce((total, row) =>
      skillAreaContains(cast, ward.selector.shape, area, row.at) ? total + row.value : total, 0)
  } }
} }

const longString: SkillTactic = { adjust(use) {
  const { battle, actor, skill, enemies } = use
  const push = stepAmount(skill, "p", 1)
  const delay = skill.steps[0].delay
  // Only search extra angles when a substantial ring-out may be available.
  if (!enemies.some(enemy => borderGap(future(battle, enemy, delay)) <= push * .7)) return
  const { targets, resolve, impact } = fixedGroundContacts(use)
  const [length, width] = skill.steps[0].selector.size
  const reachable = targets.filter(row => edgeDistance(actor, row.at) < Math.hypot(length, width / 2))
  const aims = clusterAims(reachable.map(row => row.at), length).filter(({ at }) => edgeDistance(actor, at) > 3)
  const response = battle.time + Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
  const clocks = battle.sparring
    ? sideOf(battle, actor.id) === "ally" ? battle.sparring : battle
    : battle.boss
  return { aims, score({ at }) {
    const { area, hits } = resolve(at)
    const assuredFinish = clocks.moveAt > impact &&
      hits.some(row => row.damage.lethal && row.unit.actionAt > impact + COOLDOWN.shared)
    const finish = assuredFinish ? 1.20 : 0
    // The displacement step chooses its target after the damage.
    const outer = hits.filter(row => !row.damage.lethal).reduce<typeof hits[number] | undefined>((best, row) =>
      !best || edgeDistance(actor, row.at) > edgeDistance(actor, best.at) ? row : best, undefined)
    if (!outer || !area) return finish
    const shift = previewContactShift(battle, actor, skill, skill.steps[1], at, area, outer.unit, outer.at, impact)
    const value = shift ? ejectionValue(outer.unit, outer.at, shift.end, impact) : 0
    if (value <= 0 || isOutside(outer.at) || outer.unit.move || outer.unit.force || movementStopped(battle, outer.unit)) return finish + value
    const ready = Math.max(response, clocks.moveAt, clocks.sharedAt)
    const travel = Math.min(MOVE_REACH, (impact - ready - SPARRING_STEP) * movementSpeed(battle, outer.unit))
    if (travel < 15) return finish + value
    const perpendicular = left(direction(actor, at))
    // A lined-up target can still sidestep after the aim becomes visible.
    const canEscape = [-1, 1].some(side => {
      const landing = inside(along(outer.at, perpendicular, travel * side))
      const distance = edgeDistance(outer.at, landing)
      return distance >= 15 && distance <= travel + .01 &&
        !skillAreaContains({ skill }, skill.steps[0].selector.shape, area, landing) &&
        !summonTerrainInPath(battle, outer.unit, landing) &&
        !walksIntoWarning(battle, outer.unit, landing, impact, undefined, ready, false, true)
    })
    return finish + (canEscape ? 0 : value)
  } }
} }

const boundaryWard: SkillTactic = { adjust(use) {
  const { battle, actor, skill, allies } = use
  if (!battle.runtime.pending.some(job => job.strike && !sameSide(battle, actor.id, job.strike.cast.owner))) return
  const release = battle.time + fixedSkillWindup(skill)!
  const coveredAt = release + SPARRING_STEP
  const until = release + COOLDOWN.shared
  const [shieldStep, fieldStep] = skill.steps
  const radius = shieldStep.selector.size[0]
  const fieldRadius = fieldStep.selector.size[0]
  const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - battle.time)
  const casterThreats = announcedStrikes(battle, actor, until, position)
  const beforeRelease = casterThreats.filter(contact => contact.at <= coveredAt)
  if (beforeRelease.length && !lifeThroughStrikes(battle, actor, beforeRelease, position).hp) return
  const wards = allies.flatMap(unit => {
    const contacts = unit === actor ? casterThreats : announcedStrikes(battle, unit, until, position)
    const before = unit === actor ? beforeRelease : contacts.filter(contact => contact.at <= coveredAt)
    if (before.length === contacts.length) return []
    const path = before.length ? positionAfterStrike(battle, unit, before, position)?.position : position
    if (!path || before.length && !lifeThroughStrikes(battle, unit, before, path).hp) return []
    const place = path(unit, release)
    const shield = Math.round(unit.maxHp * stepAmount(skill, "b") / 100)
    const aid = [{ at: release, shield, shieldUntil: release + COOLDOWN.shared + SPARRING_STEP }]
    // A hit after the first displacement would need a new position forecast.
    let sequence = contacts
    let ejection: { at: EdgePoint; value: number } | undefined
    for (let index = before.length; index < contacts.length; index++) {
      const contact = contacts[index]
      const shove = announcedShift(battle, contact, unit, path)
      if (!shove) continue
      const at = path(unit, contact.at)
      sequence = contacts.slice(0, index + 1)
      if (!isOutside(at) && isOutside(shove.end)) ejection = { at, value: ejectionValue(unit, at, shove.end, contact.at) }
      break
    }
    const unprotected = lifeThroughStrikes(battle, unit, sequence, path).hp
    const protectedHp = lifeThroughStrikes(battle, unit, sequence, path, aid).hp
    const needsShield = !unprotected
    const shieldValue = Math.max(0, protectedHp - unprotected) / unit.maxHp * 3.6 + (needsShield && protectedHp ? 2.3 : 0)
    const catchPoint = protectedHp ? ejection?.at : undefined
    return shieldValue > 0 || catchPoint ? [{ place, shieldValue, catchPoint, catchValue: ejection?.value ?? 0, needsShield }] : []
  })
  if (!wards.length) return
  const points = wards.flatMap(({ place, catchPoint }) => catchPoint ? [place, catchPoint] : [place])
  return { aims: clusterAims(points, Math.min(radius, fieldRadius) * 2), score: ({ at }) => wards.reduce((total, ward) => {
    const receivesShield = edgeDistance(at, ward.place) <= radius
    const stopsEjection = ward.catchPoint && edgeDistance(at, ward.catchPoint) <= fieldRadius && (!ward.needsShield || receivesShield)
    return total + (receivesShield ? ward.shieldValue : 0) + (stopsEjection ? ward.catchValue : 0)
  }, 0) }
} }

const horizonLine: SkillTactic = { adjust(use) {
  const { battle, enemies } = use
  const delay = warlockContact(use)
  if (!enemies.some(enemy => (chargeOf(battle, enemy)?.until ?? 0) > battle.time + delay)) return
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  return { aims: targets.map(({ at }) => ({ at })), score({ at }) {
    return resolve(at).hits.reduce((sum, { unit }) => sum + interruptCharge(use, unit, impact, position), 0)
  } }
} }

const crossingHammer: SkillTactic = { adjust(use) {
  const { battle, actor, skill, enemies } = use
  const delay = skill.steps[0].delay
  const push = stepAmount(skill, "p")
  if (!enemies.some(enemy => (chargeOf(battle, enemy)?.until ?? 0) > battle.time + delay ||
      borderGap(future(battle, enemy, delay)) <= push)) return
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  const [radius] = skill.steps[0].selector.size
  const aims: AiAim[] = []
  for (const row of targets) {
    if (isOutside(row.at) || borderGap(row.at) > push) continue
    const towardEdge = outward(row.at)
    for (const angle of [-40, 0, 40]) aims.push({ at: along(row.at, rotate(towardEdge, angle), -radius * .47) })
  }
  return { aims, score({ at }) {
    const { area, hits } = resolve(at)
    let value = 0
    for (const row of hits) {
      value += interruptCharge(use, row.unit, impact, position)
      if (row.damage.lethal) continue
      const shift = previewContactShift(battle, actor, skill, skill.steps[0], at, area, row.unit, row.at, impact)
      if (shift) value += ejectionValue(row.unit, row.at, shift.end, impact)
    }
    return value
  } }
} }

const castIsland: SkillTactic = { adjust(use) {
  const { battle, actor, skill, allies, enemies } = use
  const delay = fixedSkillWindup(skill)!
  const push = stepAmount(skill, "p")
  const pending = battle.runtime.pending.some(job => job.strike && !sameSide(battle, actor.id, job.strike.cast.owner))
  const nearEdge = enemies.some(enemy => borderGap(future(battle, enemy, delay)) < push)
  if (!pending || !allies.some(unit => unit.hp <= unit.maxHp * .7 || borderGap(unit) < push)) return
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  const radius = skill.steps[0].selector.size[0]
  const shieldRate = stepAmount(skill, "b", 1) / 100
  const brace = stepAmount(skill, "anti", 1)
  const horizon = impact + COOLDOWN.shared
  const aims: AiAim[] = []
  const threatened = pending ? allies.flatMap(unit => {
    const contacts = announcedStrikes(battle, unit, horizon, position)
    const before = contacts.filter(contact => contact.at <= impact + SPARRING_STEP)
    if (before.length === contacts.length) return []
    const path = before.length ? positionAfterStrike(battle, unit, before, position)?.position : position
    if (!path || before.length && !lifeThroughStrikes(battle, unit, before, path).hp) return []
    const at = path(unit, impact)
    const shield = Math.round(unit.maxHp * shieldRate)
    let checked = contacts
    let retained = 0
    for (let index = before.length; index < contacts.length; index++) {
      const contact = contacts[index]
      const shove = announcedShift(battle, contact, unit, path)
      if (!shove) continue
      checked = contacts.slice(0, index + 1)
      if (!isOutside(path(unit, contact.at)) && isOutside(shove.end)) {
        const braced = announcedShift(battle, contact, unit, path, brace)
        if (!braced || !isOutside(braced.end)) retained = ejectionValue(unit, path(unit, contact.at), shove.end, contact.at)
      }
      // The next hit may have a different footprint after the first push.
      break
    }
    const baseline = lifeThroughStrikes(battle, unit, checked, path).hp
    const protectedLife = lifeThroughStrikes(battle, unit, checked, path, [{ at: impact, shield, shieldUntil: horizon + SPARRING_STEP }])
    if (!protectedLife.hp) return []
    const value = (protectedLife.hp - baseline) / unit.maxHp * 4.6 + (!baseline ? 2.35 : 0) + retained
    return value > 0 ? [{ at, value }] : []
  }) : []
  const contactPoints = targets.map(row => row.at)
  for (const ally of threatened) {
    aims.push({ at: ally.at })
    for (const enemy of contactPoints) if (edgeDistance(ally.at, enemy) <= radius * 2) aims.push({ at: midpoint(ally.at, enemy) })
  }
  if (!threatened.length) return
  for (const row of targets) {
    if (isOutside(row.at) || borderGap(row.at) >= push) continue
    const towardEdge = outward(row.at)
    for (const angle of [-40, 0, 40]) aims.push({ at: along(row.at, rotate(towardEdge, angle), -radius * .62) })
  }
  return { aims, score({ at }) {
    let value = threatened.reduce((total, ally) => edgeDistance(at, ally.at) <= radius ? total + ally.value : total, 0)
    if (!value || !nearEdge) return value
    const { area, hits } = resolve(at)
    for (const { unit, at: place, damage } of hits) {
      if (damage.lethal || isOutside(place) || borderGap(place) >= push) continue
      const shift = previewContactShift(battle, actor, skill, skill.steps[0], at, area, unit, place, impact)
      if (shift) value += .72 * ejectionValue(unit, place, shift.end, impact)
    }
    return value
  } }
} }

function mayReceiveDeathAid(battle: EdgeBattle, unit: EdgeUnit, fallen: ReadonlySet<EdgeUnit>, impact: number) {
  if (!fallen.size || !isFighter(unit)) return false
  for (const provider of alliesOf(battle, unit.id)) {
    if (!provider.hp || fallen.has(provider)) continue
    for (const passive of provider.passives) {
      if (passive.rule.event !== "death" || !passive.rule.flags.includes("ally") || provider.once.has(passive.id) ||
        (provider.passiveAt[passive.id] ?? 0) > impact) continue
      for (const step of passive.steps) {
        const { units } = step.selector
        if (step.watch || step.zone || step.delay > 0 ||
          !(units === "a" || units === "s" && provider === unit || units === "o" && provider !== unit)) continue
        if (step.operations.some(op => op.kind === "h" || op.kind === "b" || op.kind === "guard")) return true
      }
    }
  }
  return false
}

const windShear: SkillTactic = { adjust(use) {
  const { battle, actor, skill, enemies } = use
  if (!enemies.some(enemy => chargeOf(battle, enemy) || enemy.hp < actor.attack * 2)) return
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  const aims = targets.filter(row => row.hp < actor.attack * 2).map(({ at }) => ({ at }))
  return { aims, score({ at }) {
    const { hits, cast, spent } = resolve(at)
    let prevention = 0
    let closest: typeof hits[number] | undefined
    const fallen = new Set<EdgeUnit>()
    for (const row of hits) {
      const gap = edgeDistance(row.at, at)
      prevention += interruptCharge(use, row.unit, impact, position)
      if (row.damage.lethal) fallen.add(row.unit)
      else if (!closest || gap < edgeDistance(closest.at, at)) closest = row
    }
    if (closest) {
      const { unit, at: contact, hp, shield, damage, defy } = closest
      const power = stepPower(skill, 1)
      const second = estimateDirectHit(battle, actor, unit, power, "skill", contact, impact, shield - damage.shieldLoss,
        { cast, spent, defy, hp: hp - damage.hpLoss + damage.saveHeal })
      // Death can trigger a teammate's instant heal or ward between the cuts.
      if (second.lethal && !mayReceiveDeathAid(battle, unit, fallen, impact)) return prevention + 1.35
    }
    return prevention
  } }
} }

const reflectedArrows: SkillTactic = {
  aims: ({ battle, actor, skill, enemies }) => clusterAims([
    ...enemies.map((unit) => future(battle, unit, flightTime(actor, unit))),
    ...enemies.map((unit) => mirror(future(battle, unit, flightTime(actor, mirror(unit)) + skill.steps[1].delay))),
  ], 265),
  score(use, { at }) {
    const { battle, actor, skill } = use
    const [first, echo] = skill.steps
    const now = battle.time
    const arrival = flightTime(actor, at)
    const axis = direction(actor, at)
    const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
    const finished = new Set<EdgeUnit["id"]>()
    let score = 0
    for (const [step, center, delay] of [[first, at, arrival], [echo, mirror(at), arrival + echo.delay]] as const) {
      const radius = step.selector.size[0]
      const power = stepPower(skill, step === first ? 0 : 1)
      const impact = now + delay
      for (const { unit, at: contact } of contacts(use, areaOf("C", center, axis, radius), delay)) {
        if (finished.has(unit.id) || !targetable(battle, unit, impact)) continue
        const clocks = sideOf(battle, unit.id) === "ally" ? battle : battle.sparring
        const rootedUntil = movementStopped(battle, unit) ? Math.max(...battle.runtime.buffs.filter(buff =>
          buff.kind === "root" && buff.target === unit.id).map(buff => buff.until)) : now
        const landing = unit.force ? unit.force.since + unit.force.duration : now
        const movementReady = isOutside(unit) ? now : Math.max(clocks?.moveAt ?? now, clocks?.sharedAt ?? now)
        const mayWalk = Math.max(now, rootedUntil, landing, movementReady)
        const escape = Math.max(0, impact - mayWalk) * movementSpeed(battle, unit)
        const clearance = radius - edgeDistance(center, contact)
        // A card near the rim has time to leave an announced circle. Prefer
        // deeper contacts, especially when the first arrow can end the fight.
        const chance = 1 - .5 * clamp((escape - clearance) / radius, 0, 1)
        score += hitScore(use, unit, power) * chance + .06 * clearance / radius
        if (step !== first || clearance < escape + 4) continue
        const aid = aidBeforeHit(battle, unit, impact, position)
        if (estimateDirectHit(battle, actor, unit, power, "skill", contact, impact, aid.shield, aid).lethal) {
          finished.add(unit.id)
          score += 1.3 / (1 + arrival)
        }
      }
    }
    return score
  },
}

const closingLanes: SkillTactic = {
  aims(use) {
    const start = wardenChoreography(use.skill.id)?.windup ?? 0
    const duration = use.skill.steps[0].zone!.duration
    return clusterAims(use.enemies.map(enemy => future(use.battle, enemy, start + duration / 2)), 340)
  },
  score(use, { at }) {
    const { battle, actor, skill, enemies } = use
    const start = wardenChoreography(skill.id)?.windup ?? 0
    const { selector, zone } = skill.steps[0]
    const [length, width, gap] = selector.size
    const axis = direction(actor, at)
    const hit = new Set<EdgeUnit>()
    for (const progress of [0, .33, .66, 1]) {
      const delay = start + progress * zone!.duration
      const area = areaOf("K", at, axis, length, width, gap * (1 - progress))
      for (const enemy of enemies) if (!hit.has(enemy) && areaHits(area, future(battle, enemy, delay))) hit.add(enemy)
    }
    return [...hit].reduce((score, unit) => score + hitScore(use, unit, stepPower(skill)) + (isOutside(unit) ? 0 : .18), 0)
  },
}

function healerField(follow: "cleanse" | "link"): SkillTactic {
  const arrival = (use: SkillUse) => healerChoreography(use.skill.id)?.windup ?? 0
  return {
    aims: use => clusterAims(use.allies.map(ally => future(use.battle, ally, arrival(use))), use.skill.steps[0].selector.size[0] * 2),
    score(use, { at }) {
      const { allies, battle, skill } = use
      const delay = arrival(use)
      const [radius] = skill.steps[0].selector.size
      const aid = allies.map(unit => ({ unit, at: future(battle, unit, delay) }))
      const inner = aid.filter(ally => edgeDistance(ally.at, at) <= radius)
      const shield = stepAmount(skill, "b", 1) / 100
      let value = inner.reduce((sum, { unit }) => sum + healScore(battle, unit, stepHeal(skill)), 0)
      if (follow === "cleanse") {
        const clean = skill.steps[0].operations.find(op => op.kind === "clean")!
        for (const { unit } of inner) if (battle.runtime.buffs.some(buff => buff.target === unit.id &&
          buff.until > battle.time + delay && DEBUFFS.has(buff.kind) && matchesCleanse(buff.kind, clean.style))) {
          value += .75 + protection(use, unit, shield)
        }
      } else {
        const [outer, width] = skill.steps[1].selector.size
        const anchors = inner.filter(({ unit }) => healScore(battle, unit, stepHeal(skill)) > 0)
        for (const ally of aid) {
          const gap = edgeDistance(ally.at, at)
          if (gap > radius && gap <= outer && anchors.some(anchor => edgeDistance(anchor.at, ally.at) <= width)) {
            value += protection(use, ally.unit, shield)
          }
        }
      }
      return value
    },
  }
}

const starbranch: SkillTactic = {
  aims: use => clusterAims(use.enemies.map(enemy => future(use.battle, enemy, lifebringerChoreography(use.skill.id)!.windup)),
    use.skill.steps[0].selector.size[0] * 2),
  score(use, { at }) {
    const { battle, actor, skill, allies } = use
    const windup = lifebringerChoreography(skill.id)!.windup
    const [radius, heal, delay] = skill.steps[1].operations[0].args
    const area = areaOf("C", at, direction(actor, at), skill.steps[0].selector.size[0])
    const hits = contacts(use, area, windup)
    if (!hits.length) return 0
    const healing = allies.reduce((value, ally) => {
      const landing = future(battle, ally, windup + delay)
      return value + (hits.some(hit => edgeDistance(landing, hit.at) <= radius) ? healScore(battle, ally, heal / 100) * .75 : 0)
    }, 0)
    return hits.reduce((value, { unit }) => value + hitScore(use, unit, stepPower(skill)), healing)
  },
}

function rescueSwap(radius: number, delay: number, bothEnds: boolean, heal = 0): SkillTactic {
  return { score(use, { target }) {
    const { actor, battle, enemies, skill } = use
    if (!target || target.force || edgeDistance(actor, target) < 15) return 0
    const targetAt = future(battle, target, delay)
    if (isOutside(targetAt) || edgeDistance(actor, targetAt) > skill.aim.range) return 0
    const targetHp = target.hp + existingShield(battle, target, delay)
    const casterHp = actor.hp + existingShield(battle, actor, delay)
    const earlyTarget = pendingThreat(use, target, 0, delay - .001)
    const earlyCaster = pendingThreat(use, actor, 0, delay - .001, actor)
    if (earlyTarget >= targetHp || earlyCaster >= casterHp) return 0
    const lifeAfter = (unit: EdgeUnit, selector: "s" | "t", early: number) => {
      const ward = skill.steps.find(step => step.selector.units === selector && step.operations.some(op => op.kind === "b"))
      const amount = ward?.operations.find(op => op.kind === "b")?.args[0] ?? 0
      const current = existingShield(battle, unit, delay)
      const hp = unit.hp - Math.max(0, early - current)
      return hp + Math.min(unit.maxHp - hp, unit.maxHp * heal * healingReceived(battle, unit)) +
        Math.max(current - early, Math.round(unit.maxHp * amount / 100))
    }
    const imminent = pendingThreat(use, target, delay, 1.6)
    const remaining = pendingThreat(use, target, delay, 1.6, actor)
    const casterBefore = pendingThreat(use, actor, delay, 1.6, actor)
    const casterAfter = pendingThreat(use, actor, delay, 1.6, targetAt)
    if (remaining >= lifeAfter(target, "t", earlyTarget) || casterAfter >= lifeAfter(actor, "s", earlyCaster)) return 0
    const savedFromLethal = imminent >= targetHp - earlyTarget || casterBefore >= casterHp - earlyCaster
    const danger = pressure(use, target, targetAt)
    const saved = danger - pressure(use, target, actor)
    const actorDanger = pressure(use, actor, targetAt) - pressure(use, actor)
    const exposesAlly = saved < -.3 && health(target) < .65
    const exposesCaster = actorDanger > .3 && health(actor) < .34
    if (!savedFromLethal && (exposesAlly || exposesCaster)) return 0
    const savedHit = Math.max(0, imminent - remaining)
    const rescue = savedFromLethal || saved >= .35 && (health(target) < .7 || danger >= 1.6) || savedHit > target.maxHp * .16
    const hits = enemies.filter((enemy) => {
      const at = future(battle, enemy, delay)
      return edgeDistance(at, targetAt) <= radius || bothEnds && edgeDistance(at, actor) <= radius
    })
    const damage = skill.steps.find((step) => step.operations.some(({ kind }) => kind === "d"))!
    const power = damage.operations.find(({ kind }) => kind === "d")!.args[0]
    const atImpact = battle.time + delay
    const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
    const finishes = hits.filter(enemy => {
      if (!isFighter(enemy) || enemy.hp > actor.attack * power * 1.8 || !targetable(battle, enemy, atImpact)) return false
      const aid = aidBeforeHit(battle, enemy, atImpact, position)
      return estimateDirectHit(battle, { ...actor, ...targetAt }, enemy, power, "skill", position(enemy, atImpact), atImpact, aid.shield, aid).lethal
    }).length
    if (!rescue && hits.length < 2 && !finishes && !(heal && Math.min(health(actor), health(target)) < .56 && hits.length)) return 0
    return hits.length * power + 2.4 * finishes +
      (rescue ? 1 + Math.max(0, saved) * .8 + Math.min(2, savedHit / Math.max(1, target.hp)) : 0) +
      (savedFromLethal ? 2.4 : 0) +
      healScore(battle, actor, heal) + healScore(battle, target, heal)
  } }
}

function attraction(delay: number): SkillTactic {
  return {
    aims: (use) => {
      const positions = use.enemies.map((unit) => future(use.battle, unit, delay))
      return clusterAims(positions, 360)
    },
    score(use, { at }) {
      const area = previewSkillAreas(use.battle, use.actor, use.skill, at)[0]
      if (!area) return 0
      const [pull, gap = 0] = use.skill.steps[0].operations.find(({ kind }) => kind === "l")!.args
      return contacts(use, area, delay).reduce((sum, hit) => {
        const origin = area.parts.reduce((closest, part) => part.kind === "circle" &&
          edgeDistance(hit.at, part.center) < edgeDistance(hit.at, closest) ? part.center : closest, area.parts[0].kind === "circle"
            ? area.parts[0].center : area.center)
        const distance = Math.min(pull, Math.max(0, edgeDistance(hit.at, origin) - gap))
        const end = along(hit.at, direction(hit.at, origin), distance)
        const power = stepPower(use.skill)
        if (isOutside(hit.at) && !isOutside(end) && !canFinish(use, hit.unit, power)) return sum + .15
        const nearFriends = (at: EdgePoint) => use.allies.filter((ally) => edgeDistance(ally, at) <= attackRange(use.battle, ally, hit.unit)).length
        return sum + hitScore(use, hit.unit, power) + .18 * Math.max(0, nearFriends(end) - nearFriends(hit.at))
      }, 0)
    },
  }
}

function binderDamageValue({ actor }: SkillUse, unit: EdgeUnit, hit: ReturnType<typeof estimateDirectHit>) {
  const loss = Math.max(0, hit.hpLoss - hit.saveHeal)
  return (loss + .46 * hit.shieldLoss) / actor.attack * (1 + .35 * (1 - health(unit))) + (hit.lethal ? 1.25 : 0)
}

function binderWindupIsSafe(use: SkillUse, release: number, position: PositionAt) {
  const { battle, actor } = use
  const incoming = announcedStrikes(battle, actor, release, position)
  if (incoming.length && !lifeThroughStrikes(battle, actor, incoming, position).hp) return false
  if (incoming.some(contact => {
    const shift = announcedShift(battle, contact, actor, position)
    return shift && (contact.at + shift.duration >= release ||
      edgeDistance(actor, shift.end) >= binderWindupOrigin.originLimit.distance)
  }) || summonDisruptsCast(battle, actor, release, position)) return false
  const charges = binderChargeContacts(use, actor, release, position)
  return !charges.some(contact => announcedShift(battle, contact, actor, position) ||
    announcedHit(battle, contact, actor, actor, position)?.lethal)
}

function binderChargeContacts({ battle, enemies }: SkillUse, patient: EdgeUnit, until: number, position: PositionAt) {
  return enemies.flatMap(source => {
    const charge = chargeOf(battle, source)
    if (!charge || charge.until > until || !withinCharge(charge.from, charge.direction, position(patient, charge.until))) return []
    const incoming = announcedStrikes(battle, source, charge.until - SPARRING_STEP, position)
    if (incoming.length && !lifeThroughStrikes(battle, source, incoming, position).hp) return []
    const step: Step = {
      delay: 0,
      selector: { units: "t", size: [], offset: 0, flags: [] },
      operations: [{ kind: "p", args: [CHARGE.push], style: "axis" }],
    }
    const cast: SkillCast = {
      ...forecastBasicCast(source, patient),
      from: charge.from, aim: charge.to, order: "enemy",
    }
    cast.used.delete("manual")
    return [{ at: charge.until, source, strike: { cast, target: patient.id, power: CHARGE.power, step, displacementDuration: .34 } } satisfies AnnouncedStrike]
  })
}

function followUpShoves(use: SkillUse, unit: EdgeUnit, path: PositionAt, impact: number,
  trap?: { area: EdgeArea; radius: number; until: number }) {
  const { battle, actor, allies } = use
  const now = battle.time
  const ready = now + COOLDOWN.shared
  const end = trap ? Math.min(trap.until, Math.max(impact + 1.7, ready + COOLDOWN.move)) : impact + 1.7
  const existing = announcedStrikes(battle, unit, end, path).filter(({ at, strike }) =>
    at > impact + SPARRING_STEP && strike.cast.used.has("manual") && (!trap || strike.cast.owner !== actor.id) &&
    (strike.cast.order === "basic" || strike.step?.operations.some(op => op.kind === "p") ||
      trap && "area" in strike && (strike.limitedPush || strike.rimPush)))
  let exitsAt: number | undefined
  if (trap && (unit.move || unit.force || edgeDistance(path(unit, impact), path(unit, end)) > 3)) {
    for (let at = impact + SPARRING_STEP; at < end; at += SPARRING_STEP) {
      if (areaHits(trap.area, path(unit, at))) continue
      exitsAt = at
      break
    }
  }
  const forecast = allies.flatMap(source => {
    if (source === actor) return []
    const afterWalk = source.move && !movementStopped(battle, source)
      ? now + edgeDistance(source, source.move) / movementSpeed(battle, source) : now
    const firstReady = Math.max(ready, source.actionAt, afterWalk,
      source.force ? source.force.since + source.force.duration + SPARRING_STEP : now)
    if (firstReady >= end) return []
    // The teammate can wait for the target's already known movement to cross
    // the rim. A cast at the first free tick may land while it is still inside.
    const starts = exitsAt !== undefined && exitsAt > firstReady + SPARRING_STEP
      ? [firstReady, exitsAt] : [firstReady]
    return starts.flatMap(start => {
      if (!targetable(battle, unit, start)) return []
      const from = path(source, start)
      if (isOutside(from)) return []
      if (trap && announcedStrikes(battle, source, start, path).some(contact => announcedHit(battle, contact, source,
        path(source, contact.at), path)?.lethal)) return []
      const origin = { ...source, ...from, force: null, move: null }
      const spot = path(unit, start)
      const holds: PositionAt = (other, at) => other === source && at >= start ? from : path(other, at)
      const attacks: AnnouncedStrike[] = []
      const basicAt = start + (source.range >= 200 ? flightTime(from, spot) : 0)
      if (basicAt > impact + SPARRING_STEP && basicAt <= end &&
        basicTarget(battle, origin, target => Number(target === unit), start, target => path(target, start)) === unit &&
        !battle.runtime.buffs.some(buff => buff.kind === "choose" && buff.target === source.id && buff.until > start)) {
        const cast = forecastBasicCast(origin, { ...unit, ...spot })
        attacks.push({ at: basicAt, source: origin, strike: { cast, power: 1, target: unit.id } })
      }
      for (const skill of source.actives) {
        const first = skill.steps[0]
        const push = first?.operations.find(op => op.kind === "p" && op.args[0] >= 60)
        if (!push) continue
        const lead = fixedSkillWindup(skill)
        if (lead === undefined) continue
        const at = start + lead + first.delay
        if (at <= impact + SPARRING_STEP || at > end) continue
        const place = holds(unit, at)
        const aimPoints = [place]
        if (trap && first.selector.shape === "C" && !areaHits(trap.area, place) &&
          edgeDistance(trap.area.center, place) <= push.args[0] + trap.radius) {
          aimPoints.push(along(place, direction(trap.area.center, place), first.selector.size[0] * .6))
        }
        for (const point of aimPoints) {
          const aim = skill.aim.mode === "point" && edgeDistance(from, point) > skill.aim.range
            ? along(from, direction(from, point), skill.aim.range - 1) : point
          const aimed = skill.aim.insideOnly ? inside(aim, 0) : aim
          if (skillCastProblem(battle, origin, skill, aimed, undefined, start)) continue
          const cast = { ...forecastSkillCast(origin, skill, unit), aim: aimed, target: undefined, issuedAt: start }
          const area = previewSkillAreas(battle, origin, skill, aimed)[0]
          const strike = fixedAreaStrike(cast, first, area, true)
          if (strike && area && skillAreaContains(cast, first.selector.shape, area, place)) attacks.push({ at, source: origin, strike })
        }
      }
      return attacks.map(contact => ({ contact, path: holds, fixed: false }))
    })
  })
  return [...existing.map(contact => ({ contact, path, fixed: true })), ...forecast].flatMap(candidate => {
    const { contact, path } = candidate
    const place = path(unit, contact.at)
    const aid = aidBeforeHit(battle, unit, contact.at, path)
    const damage = announcedHit(battle, contact, unit, place, path, aid.hp, aid.shield, 0, undefined, aid.defy)
    return damage && !damage.lethal ? [{ ...candidate, unit, place, aid }] : []
  })
}

const inverseField: SkillTactic = { prepare(use) {
  const { battle, actor, skill, allies, enemies } = use
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  if (!binderWindupIsSafe(use, impact, position)) return { aims: [], score: () => 0 }
  const now = battle.time
  const radius = skill.steps[0].selector.size[0]
  const clears = announcedFieldErasures(battle, actor, impact + COOLDOWN.move + 1)
  const previous = battle.runtime.fields.find(field => field.cast.owner === actor.id && field.cast.skill?.id === skill.id && field.until > impact)
  const replacement = previous ? { ...battle, runtime: { ...battle.runtime, fields: battle.runtime.fields.filter(field => field !== previous) } } : battle
  const ready = now + COOLDOWN.shared
  const pivots = targets.flatMap(({ unit, path }) => followUpShoves(use, unit, path, impact)).sort((a, b) => a.contact.at - b.contact.at)
  const spots = targets.map(row => row.at)
  const extraSpots = pivots.flatMap(({ place, contact }) => [place, along(place, direction(place, contact.strike.cast.from), radius * .42)])
  for (const at of extraSpots) if (spots.every(spot => edgeDistance(spot, at) > 7)) spots.push(at)
  const shield = actor.passives.find(passive => passive.id === "binder/Prismatic/P3")
  const hook = actor.gold?.id === "binder/Prismatic/G2" ? actor.gold.steps[0] : undefined
  const pressureFrom = (unit: EdgeUnit, place: EdgePoint, at: number) => allies.reduce((total, ally) => {
    const start = Math.max(at, ally.actionAt, ally === actor ? now + actor.actionCooldown : ready)
    if (start > at + 1.40) return total
    const latest = ally.force ? ally.force.since + ally.force.duration : 0
    const from = position(ally, start)
    if (isOutside(from) || latest > start || ally.move && edgeDistance(from, ally.move) > 3) return total
    return total + Number(edgeDistance(from, place) <= attackRange(battle, { ...ally, ...from }, unit, start) + 10)
  }, 0)
  return { aims: clusterAims(spots, radius * 2), score({ at }) {
    const { area, hits } = resolve(at)
    if (!area) return 0
    const damageValue = hits.reduce((total, row) => total + binderDamageValue(use, row.unit, row.damage), 0) / 1.32
    let benefit = 0
    for (const { unit, place, contact, path, fixed, aid } of pivots) {
      if (!areaHits(area, place) || clears.some(erase => erase.at > impact && erase.at < contact.at && areaHits(erase.area, at))) continue
      const opening = hits.find(row => row.unit === unit)?.damage
      if (opening?.lethal) continue
      // The first hit and a queued partner strike can both finish the same card.
      const struck = announcedHit(battle, contact, unit, place, path, Math.max(1, aid.hp - (opening?.hpLoss ?? 0)),
        Math.max(0, aid.shield - (opening?.shieldLoss ?? 0)), 0, undefined, aid.defy)
      if (!struck || struck.lethal) continue
      const shift = previewInverseShove(replacement, contact.strike, unit, place, contact.at, at)
      if (!shift) continue
      const { end, prior } = shift
      let value = ejectionValue(unit, place, end, contact.at) - ejectionValue(unit, place, prior, contact.at)
      value += .48 * (pressureFrom(unit, end, contact.at + shift.duration) - pressureFrom(unit, prior, contact.at + shift.duration))
      if (shield && (actor.passiveAt[shield.id] ?? 0) <= contact.at) {
        const source = unitOf(battle, contact.strike.cast.owner)
        if (source?.hp) {
          const extra = shield.steps[0].operations[0].args[0] / 100 - existingShield(battle, source, contact.at - now) / source.maxHp
          value += Math.max(0, extra) * (pressure(use, source, path(source, contact.at)) ? 5.2 : 2.5)
        }
        if (hook) {
          const lands = contact.at + shift.duration + .19
          const radius = hook.selector.size[0]
          for (const other of enemies) {
            if (other === unit || !targetable(battle, other, lands)) continue
            const look = targets.find(row => row.unit === other)?.path ?? position
            const point = look(other, lands)
            if (edgeDistance(point, end) > radius || edgeDistance(point, end) < 12) continue
            const tug = projectedContactShift(battle, contact.strike.cast, hook, areaOf("C", end, direction(end, point), radius), other, point, lands)
            if (tug) value += .12 + .33 * (pressureFrom(other, tug.end, lands + .24) - pressureFrom(other, point, lands))
          }
        }
      }
      if (fixed) return Math.max(0, damageValue + 1.2 * value)
      benefit = Math.max(benefit, value * (fixed ? 1.2 : .57) / (1 + .4 * (contact.at - impact)))
    }
    // Refreshing a field consumes the existing placement.
    const renewal = previous && edgeDistance(previous.area.center, at) <= radius * .70 ? .27 : 0
    return Math.max(0, damageValue + benefit - renewal)
  } }
} }

const retreatSeal: SkillTactic = { prepare(use) {
  const { battle, actor, skill, allies } = use
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  if (!binderWindupIsSafe(use, impact, position)) return { aims: [], score: () => 0 }
  const now = battle.time
  const radius = skill.steps[0].selector.size[0]
  const brace = stepAmount(skill, "anti", 1)
  const short = skill.steps[0].operations.find(op => op.kind === "short")!
  const shortExpires = impact + short.args[1]
  const passive = actor.passives.find(entry => entry.id === "binder/Prismatic/P4" && (actor.passiveAt[entry.id] ?? 0) <= impact)
  const healAt = (unit: EdgeFighter) => passive ? aidFrom(battle, actor, unit, skill, passive.steps[0], impact - now).heal ?? 0 : 0
  const wardEnds = impact + skill.steps[1].operations[0].args[1]
  const until = impact + COOLDOWN.move
  const foes = sideOf(battle, actor.id) === "ally" ? battle.sparring ?? battle.boss : battle
  const shortValues = new Map(targets.map(({ unit, path }) => {
    const forced = unit.force ? unit.force.since + unit.force.duration : now
    const walk = unit.move && !movementStopped(battle, unit)
      ? now + edgeDistance(unit, unit.move) / movementSpeed(battle, unit) : now
    const moveAt = Math.max(impact + SPARRING_STEP, foes.moveAt, foes.sharedAt, forced, walk)
    if (moveAt >= shortExpires || isOutside(path(unit, moveAt))) return [unit, 0]
    const known = battle.runtime.buffs.filter(buff => buff.kind === "short" && buff.style !== "binderout" &&
      buff.style !== "spellmove" && buff.target === unit.id && buff.until > moveAt)
    const lost = Math.max(0, MOVE_REACH * short.args[0] / 100 -
      Math.max(0, ...known.map(buff => buff.style === "pct" ? MOVE_REACH * buff.values[0] / 100 : buff.values[0])))
    const inCombat = allies.some(ally => {
      const from = position(ally, moveAt)
      const gap = edgeDistance(from, path(unit, moveAt))
      return gap <= attackRange(battle, ally, unit, moveAt) + MOVE_REACH || gap <= attackRange(battle, unit, ally, moveAt) + MOVE_REACH
    })
    return [unit, inCombat ? lost / MOVE_REACH * (health(unit) < .48 ? .9 : .52) /
      (1 + .45 * (moveAt - impact)) : 0]
  }))
  const friends = allies.flatMap(unit => {
    const pending = [...announcedStrikes(battle, unit, until, position), ...binderChargeContacts(use, unit, impact + SPARRING_STEP, position)]
      .sort((a, b) => a.at - b.at)
    const before = pending.filter(hit => hit.at <= impact + SPARRING_STEP)
    const path = positionAfterStrike(battle, unit, before, position)?.position
    if (!path) return []
    const life = lifeThroughStrikes(battle, unit, before, path, [], undefined, impact + SPARRING_STEP)
    if (!life.hp) return []
    const at = path(unit, impact)
    const late = [...pending.filter(hit => hit.at > impact + SPARRING_STEP), ...binderChargeContacts(use, unit, until, path)
      .filter(hit => hit.at > impact + SPARRING_STEP)].sort((a, b) => a.at - b.at)
    const all = [...before, ...late]
    const shove = late.find(hit => hit.at < wardEnds && announcedShift(battle, hit, unit, path)?.push)
    const valueFor = (heal: number) => {
      const healing = heal > 0 ? [{ at: impact, heal }] : []
      let value = Math.min(unit.maxHp - life.hp, heal) / unit.maxHp * (life.hp <= unit.maxHp * .5 ? 5 : 3)
      if (!shove) {
        const guarded = battle.runtime.buffs.some(buff => buff.target === unit.id && buff.kind === "anti" &&
          buff.values[0] >= brace && buff.until > impact + COOLDOWN.shared)
        return value + (guarded || borderGap(at) > 155 ? 0 : Math.min(.36, .17 * pressure(use, unit, at)))
      }
      const upToShove = all.filter(hit => hit.at <= shove.at)
      const previous = lifeThroughStrikes(battle, unit, upToShove, path)
      const saved = heal > 0 ? lifeThroughStrikes(battle, unit, upToShove, path, healing) : previous
      if (!saved.hp) return 0
      if (!previous.hp) value += 2.6
      const plain = announcedShift(battle, shove, unit, path)
      const kept = announcedShift(battle, shove, unit, path, brace)
      const from = path(unit, shove.at)
      if (!plain || isOutside(from)) return value
      const end = kept?.end ?? from
      const shortened = edgeDistance(from, plain.end) - edgeDistance(from, end)
      if (shortened <= 1) return value
      const staysIn = !isOutside(end) && isOutside(plain.end)
      const after = late.filter(hit => hit.at > shove.at)
      const displaced = (unitAt: EdgePoint, duration: number) => (other: EdgeUnit, time: number) =>
        other === unit && time > shove.at ? displacementPoint({ from, end: unitAt, start: shove.at, duration }, time) : path(other, time)
      const less = displaced(end, kept?.duration ?? SPARRING_STEP)
      const more = displaced(plain.end, plain.duration)
      if (after.length && !lifeThroughStrikes(battle, unit, all, more).hp &&
        lifeThroughStrikes(battle, unit, all, less, healing).hp) value += 2.1
      return value + (staysIn ? 2.4 - .23 * (shove.at - impact) : Math.min(.45, shortened / 120))
    }
    return [{ unit, at, ordinary: valueFor(0), healed: valueFor(healAt(unit)) }]
  })
  const enemySpots = targets.map(row => row.at)
  const friendSpots = friends.filter(row => row.healed > 0).map(row => row.at)
  const aims = [
    ...clusterAims([...enemySpots, ...friendSpots], radius * 2),
    ...friendSpots.flatMap(friend => enemySpots.filter(enemy => edgeDistance(friend, enemy) <= radius * 2)
      .map(enemy => ({ at: along(friend, direction(friend, enemy), Math.max(0, edgeDistance(friend, enemy) - radius + 3)) }))),
  ]
  return { aims, score({ at }) {
    const { area, hits } = resolve(at)
    if (!area) return 0
    const covered = friends.filter(row => areaHits(area, row.at))
    const enemyMarked = hits.some(row => !row.damage.lethal)
    const guard = covered.reduce((sum, row, index) => sum + (index === 0 && enemyMarked ? row.healed : row.ordinary), 0)
    return guard + hits.reduce((sum, { unit, damage }) => sum + (binderDamageValue(use, unit, damage) +
      (!damage.lethal ? shortValues.get(unit) ?? 0 : 0)) / 1.22, 0)
  } }
} }

const pressurePin: SkillTactic = { prepare(use) {
  const { battle, actor, skill } = use
  const { targets, resolve, impact, position } = fixedGroundContacts(use)
  if (!binderWindupIsSafe(use, impact, position)) return { aims: [], score: () => 0 }
  const [first, echo] = skill.steps
  const [length, width] = first.selector.size
  const detonation = impact + echo.delay
  const radius = echo.selector.size[0]
  const pool = targets.filter(row => edgeDistance(actor, row.at) <= Math.hypot(length, width / 2) + 1)
  const aimPoints = pool.map(row => row.at)
  for (const [i, row] of pool.entries()) for (const other of pool.slice(i + 1)) {
    // The angular overlap of two contacts can be off the positional midpoint.
    const axis = direction(actor, row.at), next = direction(actor, other.at)
    if (axis.x * next.x + axis.y * next.y < 0) continue
    const spread = Math.abs(axis.x * next.y - axis.y * next.x)
    const firstGap = edgeDistance(actor, row.at)
    const secondGap = edgeDistance(actor, other.at)
    if (Math.min(firstGap, secondGap) < 3 || spread * Math.min(firstGap, secondGap) > width * 1.1) continue
    aimPoints.push(along(actor, midpoint(axis, next), 120),
      along(actor, direction({ x: 0, y: 0 }, { x: axis.x / secondGap + next.x / firstGap, y: axis.y / secondGap + next.y / firstGap }), 120))
  }
  const aims = aimPoints.filter(at => edgeDistance(actor, at) > 3)
    .map(at => ({ at: along(actor, direction(actor, at), 125) }))
  const tail = actor.passives.find(passive => passive.id === "binder/Prismatic/P5" && (actor.passiveAt[passive.id] ?? 0) <= detonation)
  return { aims, score({ at }) {
    const { area, hits, cast } = resolve(at)
    if (!area || !hits.length) return 0
    const axis = direction(actor, at)
    let value = 0, control = 0
    const live = new Map<EdgeUnit, EdgePoint>()
    const contacts = hits.filter(({ damage }) => damage.hpLoss + damage.shieldLoss > 0)
    const head = binderHead(cast, contacts)
    for (const { unit, at: place, damage } of hits) {
      value += binderDamageValue(use, unit, damage)
      if (damage.lethal) continue
      const shift = projectedContactShift(battle, cast, first, area, unit, place, impact)
      if (!shift) continue
      const ending = displacementPoint({ from: place, end: shift.end, start: impact, duration: shift.duration }, detonation)
      live.set(unit, ending)
      control += ejectionValue(unit, place, shift.end, impact)
      if (!isOutside(place) && isOutside(shift.end) && chargeOf(battle, unit))
        control += interruptCharge(use, unit, impact, position)
    }
    if (!head) return Math.max(0, value / 1.26 + control)
    const depth = ({ at }: { at: EdgePoint }) => (at.x - actor.x) * axis.x + (at.y - actor.y) * axis.y
    if (tail && !head.damage.lethal && depth(head) >= length * 2 / 3 && contacts.some(row => depth(row) <= length / 3)) {
      const follow = estimateDirectHit(battle, actor, head.unit, tail.steps[0].operations[0].args[0], "skill",
        live.get(head.unit) ?? head.path(head.unit, detonation), detonation,
        Math.max(0, head.shield - head.damage.shieldLoss), { hp: head.hp - head.damage.hpLoss + head.damage.saveHeal, cast })
      control += binderDamageValue(use, head.unit, follow) * .88
    }
    const field = areaOf("C", head.at, axis, radius)
    for (const row of targets) {
      if (row.unit === head.unit || !targetable(battle, row.unit, detonation) || hits.some(hit => hit.unit === row.unit && hit.damage.lethal)) continue
      const place = live.get(row.unit) ?? row.path(row.unit, detonation)
      if (!areaHits(field, place)) continue
      const pull = projectedContactShift(battle, cast, echo, field, row.unit, place, detonation)
      if (!pull) continue
      const reachAt = (point: EdgePoint) => use.allies.filter(ally => ally !== actor &&
        ally.actionAt <= detonation + 1 && !isOutside(position(ally, detonation + .4)) &&
        edgeDistance(position(ally, detonation + .4), point) <= attackRange(battle, ally, row.unit)).length
      const access = reachAt(pull.end) - reachAt(place)
      control += ejectionValue(row.unit, place, pull.end, detonation) + .31 * access +
        (access >= 0 && !isOutside(pull.end) ? edgeDistance(place, pull.end) * .003 : 0)
    }
    return Math.max(0, value / 1.26 + control)
  } }
} }

function hostilePositions(use: SkillUse, delay: number) {
  const { battle, actor } = use
  const fields = battle.runtime.fields.filter((field) => field.until > battle.time + delay && !sameSide(battle, actor.id, field.cast.owner))
  const groups = activeDeployments(battle).filter(({ group }) => group.until > battle.time + delay && !sameSide(battle, actor.id, group.owner))
  return { fields, groups }
}

function threatenedGateCrossings({ battle, actor, allies, enemies }: SkillUse, impact: number) {
  const { sparring } = battle
  const patients = allies.flatMap(ally => {
    if (ally.hp > ally.maxHp * .34) return []
    const returnRoute = committedReturn(battle, ally)
    return !isOutside(ally) || returnRoute ? [{ ally, returnRoute }] : []
  })
  const stops = new Set<SummonGroup>()
  if (!sparring || !patients.length) return stops
  const now = battle.time
  const clearAt = impact + SPARRING_STEP
  const castWindow = impact + COOLDOWN.shared
  const horizon = impact + COOLDOWN.move
  const lower = sideOf(battle, actor.id) === "ally"
  const home = lower ? battle : sparring
  const foe = lower ? sparring : battle
  const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
  const start = now + Math.ceil((Math.max(now, foe.moveAt, foe.sharedAt) - now) / frame - 1e-6) * frame
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  for (const enemy of enemies) {
    if (!isFighter(enemy) || enemy.actionAt >= horizon) continue
    const fromRange = enemy.range >= 200
    if (!fromRange && !combatHasRole(enemy, "assassin") && !combatHasRole(enemy, "binder")) continue
    const walk = walkingPortal(battle, enemy, castWindow)
    if (walk && walk.arrival <= clearAt) continue
    for (const { ally, returnRoute } of patients) {
      // A known walk is stronger evidence. For an unused gate, only check
      // a walk the enemy can take on its next legal movement decision.
      const route = !walk && !enemy.move && start <= impact + .24 ? bestPortalAdvance(battle, enemy, [ally], start) : undefined
      const crossing = route && route.strike > 0 ? portalRoute(battle, route.landing, enemy.id, route.arrival) : undefined
      const gate = walk ?? (crossing && route && { group: crossing.group, arrival: route.arrival, out: route.stop })
      const entry = route?.landing ?? enemy.move
      if (!gate || !entry || stops.has(gate.group) || gate.arrival <= clearAt || gate.arrival > castWindow) continue
      const ready = Math.max(gate.arrival, foe.sharedAt, enemy.actionAt, route ? start + COOLDOWN.shared : now)
      // An exiled card can still steer its return before an announced shot.
      if (ready > castWindow + frame || returnRoute && returnRoute.crossAt > ready) continue
      const incoming = announcedStrikes(battle, enemy, ready, position)
      if (incoming.length && !lifeThroughStrikes(battle, enemy, incoming, position).hp) continue
      const pending = announcedStrikes(battle, ally, horizon, position)
      if (!lifeThroughStrikes(battle, ally, pending, position).hp) continue
      const afterCrossing = (place: EdgePoint) => {
        const traveler = { ...enemy, ...place, move: null }
        const path = (unit: EdgeUnit, time: number) =>
          unit.id === enemy.id && time >= ready ? traveler : position(unit, time)
        return { traveler, path }
      }
      const falls = (contacts: AnnouncedStrike[], path: typeof position) =>
        !lifeThroughStrikes(battle, ally, [...pending, ...contacts].sort((a, b) => a.at - b.at), path).hp
      const canLockDown = ({ traveler, path }: ReturnType<typeof afterCrossing>) =>
        targetedFollowUps(battle, ally, [traveler], ready, horizon, path)
          .some(reply => falls(reply.contacts, reply.position))
      const through = afterCrossing(gate.out)
      const areaExposure = ({ traveler, path }: ReturnType<typeof afterCrossing>, sharedAt: number) => {
        let uncertain = false
        for (const reply of shortAreaThreats(battle, ally, [traveler], horizon, path, ready, undefined, true)) {
          if (!falls([reply], path)) continue
          const begins = Math.max(home.moveAt, sharedAt, (reply.strike.cast.issuedAt ?? ready) + frame)
          if (begins >= reply.at) return "lethal"
          // A normal dodge from a future in-bounds position needs a fresh decision.
          if (returnRoute) uncertain = true
          else if (!dodgeAreaDamage(battle, ally, reply, begins)) return "lethal"
        }
        return uncertain ? "uncertain" : "safe"
      }
      if (!canLockDown(through) && (!fromRange || areaExposure(through, home.sharedAt) !== "lethal")) continue
      const stopped = afterCrossing(entry)
      if (canLockDown(stopped)) continue
      // An area reply can still reach the same ally on the near side.
      // Count the dispel as a rescue only if a legal reaction remains.
      if (areaExposure(stopped, now + COOLDOWN.shared) !== "safe") continue
      stops.add(gate.group)
    }
  }
  return stops
}

function dispelStrike(clearSummons: boolean): SkillTactic {
  return { prepare(use) {
    const { battle, actor, skill, enemies } = use
    const delay = spellbreakerChoreography(skill.id)?.windup ?? 0
    const impact = battle.time + delay
    const power = stepPower(skill)
    const { fields, groups } = hostilePositions(use, delay)
    const rescues = clearSummons && groups.some(({ plan }) => plan.gate) ? threatenedGateCrossings(use, impact) : undefined
    const positions = enemies.map(unit => ({ unit, at: future(battle, unit, delay) }))
    const spots = [...positions.map(({ at }) => at), ...fields.map(({ area }) => area.center)]
    if (clearSummons) spots.push(...groups.flatMap(({ deployment }) => deployment.bodies.filter(body => body.hp)))
    const aims = clusterAims(spots, 300)
    const radius = skill.steps[0].selector.size[0]
    // Area strikes apply the role's healing reduction to the first effective contact.
    // Include the rim of the area so the AI can choose which target gets it.
    if (clearSummons && positions.length > 1) for (const { unit, at } of positions) {
      if (health(unit) > .87) continue
      const closest = positions.reduce((near, candidate) => candidate.unit !== unit &&
        (!near || edgeDistance(at, candidate.at) < edgeDistance(at, near.at)) ? candidate : near,
      undefined as typeof positions[number] | undefined)
      if (!closest || edgeDistance(at, closest.at) > radius) continue
      const away = direction(closest.at, at)
      for (const angle of [0, -65, 65]) aims.push({ at: along(at, rotate(away, angle), radius - 14) })
    }
    const defense = positions.map(({ unit, at }) => {
      const hit = actor.attack * power * roleDamageScale(battle, actor, unit) * (1 - unit.armor) * (isOutside(at) ? EXILE.received : 1)
      const shield = existingShield(battle, unit, delay)
      const cover = nearbyBulwark(battle, unit)
      const coverInRange = cover && edgeDistance(future(battle, cover, delay), at) <= BULWARK_COVER.range ? cover : undefined
      const wounded = battle.runtime.buffs.some(buff => buff.kind === "healcut" && buff.target === unit.id && buff.until > impact + 1)
      const canHeal = alliesOf(battle, unit.id).some(healer => healer.hp &&
        (combatHasRole(healer, "healer") || combatHasRole(healer, "lifebringer")) &&
        healer.actionAt < impact + HEAL_CUT.duration && edgeDistance(future(battle, healer, delay), at) < 500)
      return { unit, at, hit, shield, cover: coverInRange, wounded, canHeal,
        base: hitScore(use, unit, power), interrupted: (chargeOf(battle, unit)?.until ?? 0) > impact }
    })
    const protectedFields = fields.filter(field => field.mode === "guard" && field.capacity > 0)
    return { aims, score({ at }) {
      const area = previewSkillAreas(battle, actor, skill, at)[0]
      if (!area) return 0
      const hits = defense.filter(contact => areaHits(area, contact.at))
      if (!clearSummons) {
        const axis = direction(actor, at)
        hits.sort((a, b) => (a.at.x - b.at.x) * axis.x + (a.at.y - b.at.y) * axis.y)
      }
      const guardCapacity = new Map(protectedFields.map(field => [field, field.capacity]))
      const covered = new Set<EdgeUnit>()
      let value = 0
      let firstContact = true
      for (const { unit, at, hit, shield, cover, wounded, canHeal, base, interrupted } of hits) {
        let damage = hit
        for (const [field, capacity] of guardCapacity) {
          if (!areaHits(field.area, at) || !sameSide(battle, field.cast.owner, unit.id)) continue
          const blocked = Math.min(damage, capacity)
          damage -= blocked
          guardCapacity.set(field, capacity - blocked)
        }
        let lost = Math.max(0, damage - shield)
        if (lost > 0 && cover && !covered.has(cover)) {
          covered.add(cover)
          lost *= 1 - BULWARK_COVER.share / 100
        }
        const lethal = lost >= unit.hp
        const fraction = Math.min(1, lost / Math.max(1, hit))
        value += base * (.26 + fraction * .74) + (lethal ? 1.2 : 0) + (interrupted ? 2.4 : 0)
        if (!firstContact || damage <= 0 || lethal || !isFighter(unit)) continue
        firstContact = false
        if (canHeal && !wounded) {
          const need = (unit.maxHp - unit.hp + lost) / unit.maxHp
          const follow = unit.hp - lost < .48 * unit.maxHp ? .4 : 0
          value += Math.min(1, need * 1.65) * (.64 + follow)
        }
      }
      for (const field of fields) {
        if (areaHits(area, field.area.center)) value += .55 + Math.min(1.45, (field.until - use.battle.time - delay) * .2)
      }
      if (clearSummons) for (const { group, deployment } of groups) {
        if (deployment.bodies.some((body) => body.hp && areaHits(area, body))) {
          value += 1.35 + .3 * deployment.bodies.filter((body) => body.hp).length + (rescues?.has(group) ? 2.85 : 0)
        }
      }
      return value
    } }
  } }
}

function chaseOutside(power: number, push: number): SkillTactic {
  return { score(use, { target }) {
    if (!target) return 0
    const at = future(use.battle, target, assassinChoreography(use.skill.id)?.windup ?? 0)
    const outside = isOutside(at)
    if (!outside && edgeDistance(use.actor, at) > use.skill.aim.range) return 0
    const end = along(at, direction(edgeDistance(CENTER, at) < 3 ? use.actor : CENTER, at), push)
    return hitScore(use, target, power) + (outside ? .8 : isOutside(end) ? .55 : 0) +
      (canFinish(use, target, power) ? .9 : 0)
  } }
}

const returningBlade: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { skill } = use
  const first = stepPower(skill)
  const second = stepPower(skill, 1)
  return hitScore(use, target, first + second * .86) + (stepAmount(skill, "p", 1) && borderGap(target) < 110 ? .35 : 0)
} }

const doubleEdge: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { battle, actor, skill } = use
  const now = battle.time
  const lockAt = now + assassinChoreography(skill.id)!.windup
  const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const lock = position(target, lockAt)
  if (edgeDistance(actor, lock) > skill.aim.range || !targetable(battle, target, lockAt) ||
    !targetable(battle, target, now)) return 0
  const firstAt = lockAt + targetedFlight("assassin", edgeDistance(actor, lock)) + SPARRING_STEP
  const at = firstAt + skill.steps[1].delay
  const stays = announcedStrikes(battle, target, at, position)
  const untilFirst = stays.filter(contact => contact.at <= firstAt)
  const firstLife = lifeThroughStrikes(battle, target, untilFirst, position, [], undefined, firstAt)
  if (!firstLife.hp || !targetable(battle, target, firstAt)) return 0
  const cast = { ...forecastSkillCast(actor, skill, target), id: battle.runtime.sequence + 1 }
  const first = { at: firstAt, source: actor, strike: { cast, target: target.id, power: stepPower(skill) } }
  const firstHit = lifeThroughStrikes(battle, target, [...untilFirst, first], position)
  if (!firstHit.hp) return hitScore(use, target, stepPower(skill)) + 1.35
  const opening = Math.max(0, firstLife.hp - firstHit.hp) + .36 * Math.max(0, firstLife.shield - firstHit.shield)
  const value = opening / actor.attack * 1.45
  if (opening <= 0) return 0
  const before = lifeThroughStrikes(battle, target, stays, position, [], undefined, at)
  const together = [...stays, first].sort((a, b) => a.at - b.at)
  const beforeReturn = lifeThroughStrikes(battle, target, together, position, [], undefined, at)
  if (!before.hp || !beforeReturn.hp || !targetable(battle, target, at)) return value
  const second = { at, source: actor, strike: { cast, target: target.id, power: stepPower(skill, 1), step: skill.steps[1] } }
  const after = lifeThroughStrikes(battle, target, [...together, second], position)
  const landing = after.hp && announcedShift(battle, second, target, position)?.end
  const ejects = !!landing && !isOutside(position(target, at)) && isOutside(landing)
  const follow = Math.max(0, beforeReturn.hp - after.hp) + .34 * Math.max(0, beforeReturn.shield - after.shield)
  return value + follow / actor.attack * 1.32 + (!after.hp ? 1.85 : ejects ? 1.45 : landing ? .16 : 0)
} }

function shadowFollowUp(battle: EdgeBattle, trap: { cast: SkillCast; area: EdgeArea; until: number; step: Step },
  target: EdgeUnit, contact: AnnouncedStrike, position: PositionAt, through: AnnouncedStrike[], planned: AnnouncedStrike[] = []) {
  const { cast, area, until, step } = trap
  const actor = unitOf(battle, cast.owner)
  const { strike, source, at } = contact
  if (!actor || strike.cast.owner === cast.owner || !sameSide(battle, cast.owner, source.id) ||
    !strike.cast.used.has("manual") || at >= until || isSummonId(target.id)) return
  const from = position(target, at)
  const shift = announcedShift(battle, contact, target, position)
  if (!shift?.push) return
  const crossing = shadowPushCrossing(area, from, shift.end)
  if (!crossing) return
  const progress = edgeDistance(from, crossing) / edgeDistance(from, shift.end)
  const arrival = at + Math.max(SPARRING_STEP, shift.duration * (1 - (1 - progress) ** (1 / 3)))
  if (arrival >= until || announcedFieldErasures(battle, actor, arrival).some(erase =>
    (cast.issuedAt ?? -Infinity) < erase.at && areaHits(erase.area, area.center))) return
  const path: PositionAt = (unit, time) => unit === target && time > at
    ? displacementPoint({ from, ...shift, start: at }, time) : position(unit, time)
  if (through.some(other => other !== contact && other.at > at && other.at < arrival && announcedShift(battle, other, target, path))) return
  const contacts = [...through.filter(other => other !== contact && other.at <= arrival), ...planned, contact]
    .sort((a, b) => a.at - b.at)
  const life = lifeThroughStrikes(battle, target, contacts, path, [], undefined, arrival)
  if (!life.hp) return
  const damage = estimateDirectHit(battle, actor, target, step.operations[0].args[0], "skill", path(target, arrival), arrival,
    life.shield, { hp: life.hp, cast, spent: life.spent, defy: life.defy, zone: true })
  if (damage.hpLoss + damage.shieldLoss <= 0) return
  const passive = isFighter(actor) && actor.passives.find(entry => entry.id === "assassin/Prismatic/P4" &&
    (actor.passiveAt[entry.id] ?? 0) <= arrival)
  const ownerThreats = passive ? announcedStrikes(battle, actor, arrival, position) : []
  const sourceThreats = passive ? announcedStrikes(battle, source, arrival, position) : []
  const sourceLife = passive && lifeThroughStrikes(battle, source, sourceThreats, position, [], undefined, arrival)
  const canWard = sourceLife && sourceLife.hp && (!ownerThreats.length || lifeThroughStrikes(battle, actor, ownerThreats, position).hp)
  const ward = canWard ? Math.max(0, source.maxHp * passive!.steps[0].operations[0].args[0] / 100 - sourceLife.shield) : 0
  return { damage, ward, arrival, value: (damage.hpLoss + .44 * damage.shieldLoss) / actor.attack +
    (damage.lethal ? 1.55 : 0) + ward / source.maxHp * (source.hp < source.maxHp * .55 ? 5 : 2.7) }
}

export function activeShadowFollowUp(battle: EdgeBattle, field: FieldEffect, target: EdgeUnit, contact: AnnouncedStrike,
  position: PositionAt) {
  const before = announcedStrikes(battle, target, contact.at + .42, position)
  const approach = positionAfterStrike(battle, target, before.filter(hit => hit.at < contact.at - SPARRING_STEP / 2), position)
  if (!approach) return 0
  const follow = shadowFollowUp(battle, field, target, contact, approach.position, before)
  if (!follow) return 0
  return follow.value
}

export function shadowRingHitAdjustment(use: SkillUse, target: EdgeUnit, contact: AnnouncedStrike,
  standing: PositionAt, position: PositionAt, doomed: boolean) {
  const { at, strike } = contact
  if (strike.cast.skill?.id !== "warlock/Prismatic/A2" || !("area" in strike)) return 0
  const { battle, actor, skill } = use
  const { area } = strike
  const previous = standing(target, at)
  const actual = position(target, at)
  // The regular ring tactic used the walk itself. Replace the marked card's
  // contribution when a visible shove changes its landing or the inner hit.
  const primary = (place: EdgePoint) => areaHits(area, place)
    ? hitScore(use, target, stepPower(skill)) + .07 / (1 + edgeDistance(place, area.center) / 70) : 0
  const main = primary(actual) - primary(previous)
  const radius = skill.steps[1].selector.size[0]
  const countedCore = edgeDistance(previous, area.center) <= radius ? hitScore(use, target, stepPower(skill, 1)) : 0
  if (doomed) return -primary(previous) - countedCore
  if (edgeDistance(actual, area.center) > radius) return main - countedCore
  const incoming = announcedStrikes(battle, target, at, position)
  const before = lifeThroughStrikes(battle, target, [...incoming, contact], position, [], undefined, at)
  const core: AnnouncedStrike = { at, source: actor, strike: {
    cast: strike.cast, power: stepPower(skill, 1), target: target.id,
  } }
  const after = lifeThroughStrikes(battle, target, [...incoming, contact, core], position, [], undefined, at)
  const lethal = before.hp > 0 && !after.hp
  const gain = Math.max(0, before.hp - after.hp) + .5 * Math.max(0, before.shield - after.shield)
  return main + gain / actor.attack + (lethal ? 1.3 : 0) - countedCore
}

const shadowPit: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { battle, actor, skill } = use
  const now = battle.time
  const lock = assassinLockAttack(skill)!
  const release = now + lock.windup
  const impact = release + Math.max(SPARRING_STEP, lock.delay)
  const standing: PositionAt = (unit, time) => unit === actor ? actor : future(battle, unit, time - now)
  const untilOpening = announcedStrikes(battle, target, impact - SPARRING_STEP / 2, standing)
  const path = positionAfterStrike(battle, target, untilOpening, standing)?.position ?? standing
  const place = path(target, impact)
  if (!targetable(battle, target, impact) || edgeDistance(actor, path(target, release)) > lock.range) return 0
  const incoming = announcedStrikes(battle, actor, impact, standing)
  if (!lifeThroughStrikes(battle, actor, incoming, standing).hp || incoming.some(hit => announcedShift(battle, hit, actor, standing)) ||
    summonDisruptsCast(battle, actor, impact, standing)) return 0
  const charge = chargeOf(battle, battle.boss)
  if (charge && charge.until <= impact && withinCharge(charge.from, charge.direction, actor)) return 0
  const cast = { ...forecastSkillCast(actor, skill, target), id: battle.runtime.sequence + 1, issuedAt: now }
  const hit: AnnouncedStrike = { at: impact, source: actor, strike: { cast, target: target.id, power: lock.power } }
  const before = lifeThroughStrikes(battle, target, untilOpening, path, [], undefined, impact)
  if (!before.hp) return 0
  const after = lifeThroughStrikes(battle, target, [...untilOpening, hit], path)
  const direct = (Math.max(0, before.hp - after.hp) + .66 * Math.max(0, before.shield - after.shield)) / actor.attack *
    (1 + .35 * (1 - health(target)) + attackFocus(battle, actor, target)) * (isOutside(place) ? 1.18 : 1)
  if (!after.hp) return direct + 1.95 + interruptCharge(use, target, impact, path) * .65
  if (!direct || isSummonId(target.id)) return direct
  const step = skill.steps[1]
  const area = areaOf("C", place, direction(actor, place), step.selector.size[0])
  const trap = { cast, area, radius: step.selector.size[0], step, until: impact + step.zone!.duration }
  const through = announcedStrikes(battle, target, impact + COOLDOWN.move + .55, path)
  const departure = positionAfterStrike(battle, target, through.filter(contact => contact.at > impact + SPARRING_STEP / 2), path)
  if (!departure) return direct
  let value = 0
  for (const { contact, path: positions, fixed } of followUpShoves(use, target, departure.position, impact, trap)) {
    const plan = shadowFollowUp(battle, trap, target, contact, positions, through, [hit])
    if (plan) value = Math.max(value, plan.value * (fixed ? 1.22 : .78) / (1 + .30 * (plan.arrival - impact)))
  }
  return direct + value
} }

function rageMotionSafety(use: SkillUse, from: EdgePoint, to: EdgePoint, starts: number, lands: number,
  aid: TimedAid[] = [], before?: (unit: EdgeUnit, at: number) => EdgePoint) {
  const { battle, actor } = use
  const position = (unit: EdgeUnit, at: number) => {
    if (unit !== actor) return future(battle, unit, at - battle.time)
    if (at <= starts) return before?.(unit, at) ?? from
    const progress = 1 - (1 - clamp((at - starts) / (lands - starts), 0, 1)) ** 3
    return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }
  }
  const contacts = announcedStrikes(battle, actor, lands, position)
  const life = lifeThroughStrikes(battle, actor, contacts, position, aid, undefined, lands)
  const interrupted = contacts.some(hit => {
    const shift = announcedShift(battle, hit, actor, position)
    return shift && hit.at + shift.duration >= starts && hit.at < lands
  }) ||
    summonDisruptsCast(battle, actor, lands, position, starts)
  const charge = chargeOf(battle, battle.boss)
  const charged = charge && charge.until >= starts - .34 && charge.until <= lands &&
    withinCharge(charge.from, charge.direction, position(actor, charge.until))
  return { position, hp: life.hp, interrupted: interrupted || !!charged }
}

const trinity: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { battle, actor, skill, enemies } = use
  const now = battle.time
  const art = berserkerChoreography(skill.id)!
  const travel = art.travel ?? 0
  const lead = art.windup ?? 0
  const steps = [0, 3, 6]
  const until = now + lead + skill.steps[steps[2]].delay + travel + SPARRING_STEP
  const stays = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const queued = announcedStrikes(battle, target, until, stays)
  const position = positionAfterStrike(battle, target, queued, stays)?.position ?? stays
  const cast = { ...forecastSkillCast(actor, skill, target), id: battle.runtime.sequence + 1 }
  const earned: AnnouncedStrike[] = []
  const aid: TimedAid[] = []
  let done: EdgePoint = actor
  let ownerPath: ((unit: EdgeUnit, at: number) => EdgePoint) | undefined
  let last = now
  let value = 0
  let leechDamage = 0
  let leechPaid = 0
  let effectiveHits = 0
  for (const index of steps) {
    const move = skill.steps[index]
    const cut = skill.steps[index + 1]
    const [rate, cap] = skill.steps[index + 2].operations[0].args
    const start = now + lead + move.delay
    const impact = start + travel
    const reached = position(target, start)
    const local = { ...actor, ...done }
    if (!targetable(battle, target, start) || edgeDistance(local, reached) > skill.aim.range) break
    const end = berserkerMotionEnd(battle, cast, local, move, { ...target, ...reached })
    const contact = position(target, impact)
    if (!end || !targetable(battle, target, impact) || edgeDistance(end, contact) > skill.aim.range) break
    const safety = rageMotionSafety(use, done, end, start, impact, aid, ownerPath)
    if (!safety.hp) return value * .15
    if (safety.interrupted) return Math.max(0, value * .35 - .35)
    const prior = [...queued.filter(hit => hit.at < impact - 1e-6), ...earned].sort((a, b) => a.at - b.at)
    const hp = lifeThroughStrikes(battle, target, prior, position, [], undefined, impact)
    if (!hp.hp) break
    const from = { ...actor, ...end, hp: safety.hp }
    const leg = { ...cast, outside: isOutside(end), berserkerRoute: { from: done, to: end } }
    const hit: AnnouncedStrike = { at: impact, source: from,
      strike: { cast: leg, power: stepPower(skill, index + 1), target: target.id, step: cut } }
    const after = lifeThroughStrikes(battle, target, [...prior, hit], position)
    const damage = Math.max(0, hp.hp - after.hp)
    const shield = Math.max(0, hp.shield - after.shield)
    if (damage + shield > 0) effectiveHits++
    value += (damage + .42 * shield) / actor.attack * (1 + .35 * (1 - health(target))) / (1 + move.delay * .24)
    done = end
    ownerPath = safety.position
    last = impact
    if (!after.hp) return value + 1.35
    earned.push(hit)
    leechDamage += damage
    const gross = Math.round(Math.min(leechDamage * rate / 100, actor.maxHp * cap / 100))
    const { recovery, received, healingAmp } = healFactors(battle, actor, actor, false, impact)
    const heal = Math.min(actor.maxHp - safety.hp, Math.round((gross - leechPaid) * recovery *
      (1 + received / 100) * (1 + healingAmp / 100)))
    leechPaid = gross
    if (heal > 0) {
      aid.push({ at: impact, heal })
      value += heal / actor.maxHp * (health(actor) < .45 ? 4.6 : 2.55)
    }
    if (index !== steps[2]) continue
    const extra = actor.passives.find(passive => passive.id === "berserker/Prismatic/P1" &&
      (actor.passiveAt[passive.id] ?? 0) <= impact)
    const third = extra && effectiveHits === 3
    const push = third ? { ...cut, operations: cut.operations.map(op => op.kind === "p"
      ? { ...op, args: [op.args[0] + extra.steps[0].operations[0].args[0]] } : op) } : cut
    const shift = projectedContactShift(battle, leg, push, undefined, target, contact, impact)
    value += shift ? ejectionValue(target, contact, shift.end, impact) : 0
    if (third && actor.gold?.id === "berserker/Prismatic/G1") {
      const follow = actor.gold.steps[0]
      value += enemies.reduce((sum, enemy) => enemy !== target && edgeDistance(position(enemy, impact), end) <= follow.selector.size[0]
        ? sum + .6 * hitScore(use, enemy, follow.operations[0].args[0]) : sum, 0)
    }
  }
  return Math.max(0, value - rageLandingRisk(use, done, last))
} }

function rageLandingRisk(use: SkillUse, end: EdgePoint, lands: number) {
  const { battle, actor, enemies } = use
  if (edgeDistance(actor, end) <= 25 || health(actor) > .48) return 0
  const until = lands + COOLDOWN.shared
  const clocks = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring ?? battle
  if (clocks.moveAt < lands + .30) return 0
  const risk = (place: EdgePoint) => enemies.reduce((worst, enemy) => {
    const clock = enemy === battle.boss ? battle.boss : sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring ?? battle
    const ready = Math.max(lands, enemy.actionAt, clock.sharedAt)
    if (ready > until || edgeDistance(place, future(battle, enemy, ready - battle.time)) > attackRange(battle, enemy, actor, ready)) return worst
    const result = estimateDirectHit(battle, enemy, actor, 1, "basic", place, ready)
    return Math.max(worst, result.lethal ? 1.65 : result.hpLoss / actor.maxHp * 3)
  }, 0)
  return Math.max(0, risk(end) - risk(actor))
}

const bloodCross: SkillTactic = { prepare(use) {
  const { battle, actor, skill } = use
  const { targets, resolve, position, impact } = fixedGroundContacts(use)
  const [length, width] = skill.steps[0].selector.size
  const spots = targets.map(row => row.at)
  const aims = clusterAims(spots, length + width)
  for (const point of spots) {
    const axis = direction(actor, point)
    // The cross rotates with the cast direction. A small offset can keep a
    // priority target in the core and reach others with the perpendicular arm.
    for (const side of [-1, 1]) for (const offset of [width * .37, length * .43]) {
      aims.push({ at: along(point, left(axis), offset * side) })
    }
  }
  const trait = actor.passives.find(passive => passive.id === "berserker/Prismatic/P2" &&
    (actor.passiveAt[passive.id] ?? 0) <= impact)
  const incoming = announcedStrikes(battle, actor, impact, position)
  const life = lifeThroughStrikes(battle, actor, incoming, position, [], undefined, impact)
  const ward = trait ? Math.max(0, Math.round(actor.maxHp * trait.steps[0].operations[0].args[0] / 100) - life.shield) : 0
  return { aims, score({ at }) {
    if (!life.hp) return 0
    const { hits, area } = resolve(at)
    if (!area) return 0
    let value = 0
    let overlaps = false
    for (const row of hits) {
      const core = areaHits(area, row.at) > 1
      const lost = row.damage.hpLoss + .43 * row.damage.shieldLoss
      const worth = (1 + .33 * (1 - health(row.unit))) * lost / actor.attack
      value += worth + (row.damage.lethal ? 1.2 : 0) + (core && lost > 0 ? .16 : 0)
      overlaps ||= core && lost > 0
    }
    return value / (1 + .32 * skill.steps[0].delay) +
      (overlaps && ward && pressure(use, actor) > 0 ? 4 * ward / actor.maxHp : 0)
  } }
} }

const frontierCut: SkillTactic = { prepare(use) {
  const { battle, actor, skill, enemies } = use
  const now = battle.time
  const duration = berserkerChoreography(skill.id)!.travel!
  const impact = now + duration
  const [dash, recover, strike] = skill.steps
  const [range, width] = strike.selector.size
  const power = stepPower(skill, 2)
  const stays = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const targets = enemies.flatMap(unit => {
    if (!targetable(battle, unit, impact)) return []
    const prior = announcedStrikes(battle, unit, impact - SPARRING_STEP, stays)
    const path = positionAfterStrike(battle, unit, prior, stays)?.position ?? stays
    const life = lifeThroughStrikes(battle, unit, prior, path, [], undefined, impact)
    const place = path(unit, impact)
    return life.hp && edgeDistance(actor, place) <= Math.hypot(range, width / 2) + 2 ? [{ unit, place, life }] : []
  })
  const aims = clusterAims(targets.map(row => row.place), width * 1.8).flatMap(({ at }) => {
    const axis = direction(actor, at)
    return [Math.min(range, Math.max(24, edgeDistance(actor, at) + 7)), range].map(distance => ({ at: along(actor, axis, distance) }))
  })
  return { aims, score({ at }) {
    const cast = { ...forecastSkillCast(actor, skill, actor), target: undefined, aim: at, id: battle.runtime.sequence + 1 }
    const end = berserkerMotionEnd(battle, cast, actor, dash)
    if (!end || edgeDistance(actor, end) < 3) return 0
    const axis = direction(actor, end)
    const area = areaOf("L", actor, axis, edgeDistance(actor, end), width)
    const hits = targets.filter(row => areaHits(area, row.place))
    if (!hits.length) return 0
    const safety = rageMotionSafety(use, actor, end, now, impact)
    if (!safety.hp || safety.interrupted) return 0
    cast.berserkerRoute = { from: actor, to: end }
    const spent = directHitForecast()
    const source = { ...actor, ...end, hp: safety.hp }
    let value = 0
    let exitsAt = Infinity
    for (const { unit, place, life } of hits) {
      const damage = estimateDirectHit(battle, source, unit, power, "skill", place, impact,
        life.shield, { hp: life.hp, cast, spent })
      value += (damage.hpLoss + .36 * damage.shieldLoss) / actor.attack * (1 + .28 * (1 - health(unit)))
      if (damage.lethal) {
        value += 1.2
        continue
      }
      const shift = projectedContactShift(battle, cast, strike, area, unit, place, impact, axis)
      if (!shift) continue
      const ejection = ejectionValue(unit, place, shift.end, impact)
      value += ejection
      if (!isOutside(place) && isOutside(shift.end)) {
        const crossing = fieldCrossing(place, shift.end)
        const fraction = edgeDistance(place, crossing) / edgeDistance(place, shift.end)
        const time = shift.duration * (1 - (1 - fraction) ** (1 / 3))
        exitsAt = Math.min(exitsAt, impact + time)
      }
    }
    const heal = Number.isFinite(exitsAt) ? Math.round(actor.maxHp * recover.operations[0].args[0] / 100 *
      healingReceived(battle, actor, exitsAt)) : 0
    const beforeReply = announcedStrikes(battle, actor, impact + COOLDOWN.shared, safety.position)
    if (beforeReply.length && !lifeThroughStrikes(battle, actor, beforeReply, safety.position, heal ? [{ at: exitsAt, heal }] : []).hp &&
      lifeThroughStrikes(battle, actor, beforeReply, stays).hp) return value * .20
    const recovered = Math.min(actor.maxHp - safety.hp, heal)
    return Math.max(0, value + recovered / actor.maxHp * 4.4 - rageLandingRisk(use, end, impact) - edgeDistance(actor, end) / 1800)
  } }
} }

const furnace: SkillTactic = { score(use, { target }) {
  if (!target) return 0
  const { battle, actor, skill, allies } = use
  const now = battle.time
  const launch = now + berserkerChoreography(skill.id)!.windup!
  const stays = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const own = announcedStrikes(battle, actor, launch, stays)
  const position = positionAfterStrike(battle, actor, own, stays)?.position ?? stays
  if (!lifeThroughStrikes(battle, actor, own, position).hp) return 0
  const origin = position(actor, launch)
  const locked = position(target, launch)
  if (!targetable(battle, target, launch) || edgeDistance(origin, locked) > skill.aim.range) return 0
  const impact = launch + furnaceFlight(edgeDistance(origin, locked))
  const queued = announcedStrikes(battle, target, impact - SPARRING_STEP, position)
  const victimPath = positionAfterStrike(battle, target, queued, position)?.position ?? position
  const place = victimPath(target, impact)
  if (!targetable(battle, target, impact) || edgeDistance(origin, place) > skill.aim.range) return 0
  const prior = lifeThroughStrikes(battle, target, queued, victimPath, [], undefined, impact)
  if (!prior.hp) return 0
  const caster = { ...actor, ...origin }
  const cast = { ...forecastSkillCast(caster, skill, target), id: battle.runtime.sequence + 1 }
  const damage = estimateDirectHit(battle, caster, target, stepPower(skill), "skill", place, impact, prior.shield,
    { hp: prior.hp, cast, defy: aidBeforeHit(battle, target, impact, victimPath).defy })
  const defense = announcedStrikes(battle, actor, impact, stays)
  const ownerPath = positionAfterStrike(battle, actor, defense, stays)?.position ?? stays
  const owner = lifeThroughStrikes(battle, actor, defense, ownerPath, [], undefined, impact)
  const [rate, cap, shieldCap] = skill.steps[1].operations[0].args
  const { recovery: healingRate, healingAmp, received } = healFactors(battle, actor, actor, false, impact)
  const available = Math.round(Math.min(damage.hpLoss * rate / 100, actor.maxHp * cap / 100) *
    healingRate * (1 + received / 100) * (1 + healingAmp / 100))
  const healthGain = Math.min(actor.maxHp - owner.hp, available)
  const overflow = available - healthGain
  const ward = Math.max(0, Math.min(overflow, actor.maxHp * shieldCap / 100) - owner.shield)
  const buddy = actor.gold?.id === "berserker/Prismatic/G2" && allies.filter(ally => ally !== actor &&
    edgeDistance(ownerPath(ally, impact), ownerPath(actor, impact)) <= actor.gold!.steps[0].selector.size[0])
    .sort((a, b) => edgeDistance(ownerPath(a, impact), ownerPath(actor, impact)) - edgeDistance(ownerPath(b, impact), ownerPath(actor, impact)))[0]
  const shared = buddy ? Math.max(0, Math.min(overflow, actor.maxHp * shieldCap / 100, buddy.maxHp * shieldCap / 100) -
    existingShield(battle, buddy, impact - now)) : 0
  const recovery = owner.hp && (healthGain / actor.maxHp * (health(actor) < .44 ? 5.4 : 3.1) +
    ward / actor.maxHp * (pressure(use, actor) ? 3.3 : 1.5) + (buddy ? shared / buddy.maxHp * (pressure(use, buddy) ? 3.1 : 1.35) : 0))
  return (damage.hpLoss + .43 * damage.shieldLoss) / actor.attack * (1 + .35 * (1 - health(target))) +
    (damage.lethal ? 1.25 : 0) + recovery
} }

const linkedLight: SkillTactic = { score(use) {
  const { battle, actor, skill, allies, manualContact } = use
  if (!manualContact) return 0
  const now = battle.time
  const opens = now + paladinChoreography(skill.id)!.windup!
  const closes = opens + skill.steps[0].watch!.duration
  const radius = skill.steps[0].selector.size[0]
  const percent = stepHeal(skill)
  const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const missing = allies.filter(unit => unit.hp < unit.maxHp)
  if (!missing.length) return 0
  const beforeArm = announcedStrikes(battle, actor, opens, position)
  if (beforeArm.length && !lifeThroughStrikes(battle, actor, beforeArm, position).hp) return 0
  const healed = new Map<EdgeUnit, number>()
  let value = 0
  let shared = now + COOLDOWN.shared
  const remaining = allies.filter(unit => !battle.runtime.watches.some(watch => watch.cast.owner === actor.id &&
    watch.cast.skill?.id === skill.id && watch.target === unit.id && watch.uses > 0 && watch.until > opens))
    .sort((a, b) => (a === actor ? now + actor.actionCooldown : a.actionAt) - (b === actor ? now + actor.actionCooldown : b.actionAt))
  for (const fighter of remaining) {
    const ready = Math.max(shared, fighter === actor ? now + actor.actionCooldown : fighter.actionAt)
    const contact = manualContact(fighter, { opens, ready, closes },
      (point, at) => missing.some(patient => edgeDistance(position(patient, at), point) <= radius))
    if (!contact) continue
    if (contact.issuedAt >= now) shared = contact.issuedAt + COOLDOWN.shared
    for (const patient of missing) {
      if (edgeDistance(position(patient, contact.impact), contact.at) > radius) continue
      const incoming = announcedStrikes(battle, patient, contact.impact, position)
      const { hp } = lifeThroughStrikes(battle, patient, incoming, position, [], undefined, contact.impact)
      if (!hp) continue
      const room = patient.maxHp - hp - (healed.get(patient) ?? 0)
      const factors = healFactors(battle, actor, patient, false, contact.impact)
      const restored = Math.min(room, Math.round(patient.maxHp * percent * factors.recovery *
        (1 + factors.healingAmp / 100) * (1 + factors.received / 100)))
      if (restored <= 0) continue
      healed.set(patient, (healed.get(patient) ?? 0) + restored)
      value += restored / patient.maxHp * (hp < patient.maxHp * .4 ? 9 : 6) / (1 + .09 * (contact.impact - opens))
    }
  }
  return value
} }

const overture: SkillTactic = { prepare({ battle, actor, skill, allies, enemies }) {
  const options = overturePlacements(battle, actor, skill, allies, enemies)
  return { aims: options?.aims.map(at => ({ at })) ?? [], score: ({ at }) => options?.evaluate(at)?.value ?? 0 }
} }

export interface SpectrumContact {
  source: EdgeFighter
  from: EdgePoint
  impact: number
  issuedAt: number
  walkAt?: number
  fixed: boolean
  targets: EdgeUnit[]
}

interface SpectrumPlan {
  battle: EdgeBattle
  position: PositionAt
  contacts: SpectrumContact[]
  weight: number
}

function spectrumHeal(battle: EdgeBattle, owner: EdgeFighter, skill: EdgeActive, allies: EdgeFighter[], contact: SpectrumContact,
  position: PositionAt, planned: Map<EdgeFighter, TimedAid[]>, passiveAt: number) {
  const { source, from, impact } = contact
  const at = impact + BARD_SPECTRUM_FLIGHT
  const path = (unit: EdgeUnit, time: number) => unit === source && time === impact ? from : position(unit, time)
  const incoming = (unit: EdgeUnit, time: number) => announcedStrikes(battle, unit, time, path)
  const receiver = spectrumRecipient(allies, source, unit => path(unit, impact), unit =>
    !!lifeThroughStrikes(battle, unit, incoming(unit, impact), path, planned.get(unit), undefined, impact).hp)
  if (!receiver) return
  const hits = incoming(receiver, at)
  const { hp } = lifeThroughStrikes(battle, receiver, hits, path, planned.get(receiver), undefined, at)
  if (!hp || hp >= receiver.maxHp) return
  const trait = owner.passives.find(entry => entry.id === "bard/Prismatic/P4")
  const extra = trait && passiveAt <= at && lifeThroughStrikes(battle, owner, incoming(owner, at), path, [], undefined, at).hp
    ? trait.steps[0].operations[0].args[0] / 100 : 0
  const rate = stepHeal(skill, 1)
  const { received, recovery, healingAmp } = healFactors(battle, owner, receiver, false, at)
  const amount = Math.round(receiver.maxHp * (rate * (1 + received / 100) * (1 + healingAmp / 100) + extra) * recovery)
  const restored = Math.min(receiver.maxHp - hp, amount)
  const aid = { at, heal: restored }
  if (!restored) return
  const replies = incoming(receiver, at + .7)
  const prior = planned.get(receiver) ?? []
  const saved = !lifeThroughStrikes(battle, receiver, replies, path, prior).hp &&
    lifeThroughStrikes(battle, receiver, replies, path, [...prior, aid]).hp > 0
  const critical = hp < receiver.maxHp * .46
  const noRecovery = hp <= receiver.maxHp * .55 && !allies.some(healer => {
    if (healer === owner || !healer.hp) return false
    const ready = Math.max(battle.time + COOLDOWN.shared, healer.actionAt)
    if (ready >= at + .75 || healer.force && healer.force.since + healer.force.duration > ready) return false
    const from = path(healer, ready)
    if (isOutside(from) || healer.move && !movementStopped(battle, healer) && edgeDistance(from, healer.move) > 3) return false
    return healer.actives.some(active => {
      const life = lifebringerChoreography(active.id)
      const release = ready + (life?.windup ?? .55)
      if (release > at + .75 || isOutside(path(healer, release))) return false
      if (life?.motif === "chronowheel") {
        const { beats } = chronowheelPulses({ ...battle, time: ready }, active, receiver)
        return beats.filter(beat => release + beat.delay <= at + .75)
          .reduce((sum, beat) => sum + beat.amount, 0) >= receiver.maxHp * .045
      }
      return active.steps.some(beat => !beat.watch && !beat.zone && beat.operations.some(op => op.kind === "h" && op.args[0] >= 8) &&
        (healer === receiver || ["a", "o", "b"].includes(beat.selector.units) ||
          beat.selector.units === "t" && ["ally", "other"].includes(active.aim.mode)) &&
        edgeDistance(path(healer, release), path(receiver, release)) <= active.aim.range + (beat.selector.size[0] ?? 0))
    })
  })
  const urgency = (critical ? 8.3 : 5.8) + (noRecovery ? 4.9 : 0)
  const value = restored / receiver.maxHp * urgency + (saved ? 2.15 : 0)
  return { receiver, aid, extra, value }
}

export function liveSpectrumValue(battle: EdgeBattle, field: FieldEffect, allies: EdgeFighter[], contact: SpectrumContact, position: PositionAt) {
  const owner = unitOf(battle, field.cast.owner)
  const skill = field.cast.skill
  const { source, impact, from } = contact
  if (!owner || !isFighter(owner) || !skill || field.until <= impact || field.seen.has(source.id) || !areaHits(field.area, from) ||
    announcedFieldErasures(battle, owner, impact).some(erase => areaHits(erase.area, field.area.center))) return 0
  const passive = "bard/Prismatic/P4"
  const ready = field.cast.used.has(passive + "@" + owner.id) ? Infinity : owner.passiveAt[passive] ?? 0
  return spectrumHeal(battle, owner, skill, allies, contact, position, new Map(), ready)?.value ?? 0
}

function spectrumWardReplies({ battle, actor, enemies }: SkillUse, impact: number, position: PositionAt) {
  if (!battle.sparring) return []
  const now = battle.time
  const sharedAt = sideOf(battle, actor.id) === "ally" ? battle.sparring.sharedAt : battle.sharedAt
  if (sharedAt >= impact) return []
  const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
  const replies: { wards: Map<EdgeUnit, TimedAid>; retaliation: number }[] = []
  for (const source of enemies) {
    if (!isFighter(source) || !source.hp || source.force || isOutside(source)) continue
    const ready = Math.max(now, sharedAt, source.actionAt)
    const starts = now + Math.ceil((ready - now) / frame - 1e-6) * frame
    if (starts >= impact) continue
    const from = position(source, starts)
    if (isOutside(from) || source.move && edgeDistance(from, source.move) > 3 && !movementStopped(battle, source)) continue
    const caster = { ...source, ...from }
    const path = (unit: EdgeUnit, time: number) => unit === source && time >= starts ? from : position(unit, time)
    for (const active of source.actives) {
      const [step] = active.steps
      if (active.aim.mode !== "point" || !step || step.zone || step.watch || step.selector.shape !== "C" ||
        step.selector.units !== "a" || !step.operations.some(op => op.kind === "b" && !op.style)) continue
      const medic = healerChoreography(active.id)
      const lead = fixedSkillWindup(active) ?? (medic && !medic.delivery ? medic.windup : undefined)
      if (lead === undefined) continue
      const release = starts + lead + step.delay
      if (release + SPARRING_STEP >= impact) continue
      const projected = announcedStrikes(battle, source, release, path)
      if (projected.length && (!lifeThroughStrikes(battle, source, projected, path).hp ||
        projected.some(hit => announcedShift(battle, hit, source, path)))) continue
      const points = enemies.map(unit => path(unit, release))
      const radius = step.selector.size[0]
      const seen = new Set<string>()
      for (const aim of clusterAims(points, radius * 2)) {
        const fitted = edgeDistance(from, aim.at) > active.aim.range ? along(from, direction(from, aim.at), active.aim.range - 1) : aim.at
        const at = active.aim.insideOnly ? inside(fitted, 0) : fitted
        if (skillCastProblem(battle, caster, active, at, undefined, starts)) continue
        const hits = predictSkillTargets(battle, caster, active, at, undefined,
          new Map([[step, unit => path(unit, release)]])).find(row => row.step === step)?.targets ?? []
        const key = hits.map(unit => unit.id).join("/")
        if (!hits.length || seen.has(key)) continue
        seen.add(key)
        const wards = new Map(hits.map(unit => [unit, aidFrom(battle, source, unit, active, step, release - now)]))
        const retort = paladinChoreography(active.id)?.motif === "dawn" && active.steps[1]?.watch ? stepPower(active, 1) : 0
        const returnHit = retort ? estimateDirectHit(battle, caster, actor, retort, "skill", actor, impact) : undefined
        const retaliation = returnHit ? (returnHit.hpLoss + .25 * returnHit.shieldLoss) / actor.maxHp * 6.5 + (returnHit.lethal ? 2.3 : 0) : 0
        replies.push({ wards, retaliation })
      }
    }
  }
  return replies
}

const spectrumDuel: SkillTactic = { prepare(use) {
  const { battle, actor, skill, allies, enemies } = use
  const now = battle.time
  const { targets, resolve, position, impact } = fixedGroundContacts(use, bardChoreography(skill.id)!.windup)
  const incoming = announcedStrikes(battle, actor, impact, position)
  if (!lifeThroughStrikes(battle, actor, incoming, position).hp || incoming.some(hit => announcedShift(battle, hit, actor, position)) ||
    summonDisruptsCast(battle, actor, impact, position) || enemies.some(enemy => {
      const charge = chargeOf(battle, enemy)
      return charge && charge.until <= impact && withinCharge(charge.from, charge.direction, actor)
    })) return { aims: [], score: () => 0 }
  const radius = skill.steps[1].selector.size[0]
  const wards = targets.length > 1 ? spectrumWardReplies(use, impact, position) : []
  const closes = impact + skill.steps[1].zone!.duration
  const plans = allies.length >= 2 && (allies.some(unit => unit.hp < unit.maxHp * .95) ||
    battle.runtime.pending.some(job => job.strike && !sameSide(battle, actor.id, job.strike.cast.owner)))
    ? use.spectrumPlans?.(impact, Math.min(closes, now + 4.3)) ?? [] : []
  const prior = battle.runtime.fields.find(field => field.cast.owner === actor.id && field.cast.skill?.id === skill.id && field.until > impact)
  const relayWeight = (contact: SpectrumContact) => (contact.fixed ? 1 : contact.walkAt !== undefined ? .69 : .85) /
    (1 + .13 * (contact.impact - impact))
  const projections = plans.filter(plan => plan.contacts.length).map(plan => {
    const previous = new Map<EdgeFighter, number>()
    if (prior) for (const contact of plan.contacts) {
      if (previous.has(contact.source)) continue
      const value = liveSpectrumValue(plan.battle, prior, allies, contact, plan.position) * relayWeight(contact)
      if (value > 0) previous.set(contact.source, value)
    }
    const supportAt = Math.min(closes, now + 3.05)
    const members = allies.filter(unit => unit.hp && unit !== actor && unit.actionAt <= closes &&
      unit.actives.some(active => active.steps.some(step => !step.watch && !step.zone && step.operations.some(op => op.kind === "d"))))
    return { ...plan, support: members.map(unit => ({ unit, at: plan.position(unit, supportAt) })),
      replacementCost: [...previous.values()].reduce((sum, value) => sum + value, 0),
      clears: announcedFieldErasures(plan.battle, actor, closes) }
  })
  const points: EdgePoint[] = []
  for (const at of [...targets.map(row => row.at), ...projections.flatMap(plan => [...plan.contacts.map(row => row.from), ...plan.support.map(row => row.at)])]) {
    if (edgeDistance(actor, at) <= skill.aim.range + radius && points.every(point => edgeDistance(point, at) > 12)) points.push(at)
  }
  const aims = clusterAims(points, radius * 2)
  if (wards.length) for (const { at } of targets) {
    const distance = Math.min(skill.aim.range - 1, edgeDistance(actor, at))
    const axis = direction(actor, at)
    for (const angle of [-16, 16]) {
      const flank = inside(along(actor, rotate(axis, angle), distance), 0)
      if (edgeDistance(actor, flank) <= skill.aim.range && edgeDistance(flank, at) < radius - 8 &&
        aims.every(aim => edgeDistance(aim.at, flank) > 18)) aims.push({ at: flank })
    }
  }
  return { aims, score({ at }) {
    const { area, hits } = resolve(at)
    if (!area) return 0
    const fallen = new Set(hits.filter(row => row.damage.lethal).map(row => row.unit))
    const needsAid = projections.length > 0 && allies.some(unit => unit.hp <= unit.maxHp * .45)
    const strikeValue = (rows: typeof hits, ward?: ReadonlyMap<EdgeUnit, TimedAid>) => rows.reduce((total, { unit, damage, at: contact }) => {
      const loss = Math.max(0, damage.hpLoss - damage.saveHeal)
      const guarded = ward?.get(unit)?.shield
      const base = binderDamageValue(use, unit, damage) * 1.25
      const pressure = guarded ? (loss + .09 * damage.shieldLoss) / unit.maxHp * 8 + (damage.lethal ? 1.55 : 0)
        : needsAid && isFighter(unit) && unit.card.job === "tank" && health(unit) >= .72 && !damage.lethal
          ? Math.min(base, (loss + .18 * damage.shieldLoss) / unit.maxHp * 5.2) : base
      return total + pressure + (loss + damage.shieldLoss > 0 ? .07 * (1 - edgeDistance(at, contact) / radius) : 0)
    }, 0)
    const direct = strikeValue(hits)
    let reduction = 0
    for (const reply of wards) {
      const covered = hits.filter(row => reply.wards.has(row.unit) && row.damage.hpLoss > 0)
      if (covered.length < 2 && !covered.some(row => row.damage.lethal)) continue
      const guarded = resolve(at, reply.wards).hits
      const defended = strikeValue(guarded, reply.wards)
      if (direct - defended >= .24) reduction = Math.max(reduction, direct - defended + reply.retaliation)
    }
    let value = direct - .82 * reduction
    for (const plan of projections) {
      const used = new Set<EdgeFighter>()
      const planned = new Map<EdgeFighter, TimedAid[]>()
      let shared = -Infinity
      let moveUsed = false
      let passiveAt = actor.passiveAt["bard/Prismatic/P4"] ?? 0
      let benefit = -plan.replacementCost
      let healing = 0
      for (const contact of plan.contacts) {
        if (used.has(contact.source) || !contact.targets.some(unit => !fallen.has(unit)) || !areaHits(area, contact.from) ||
          plan.clears.some(erase => erase.at > impact && erase.at < contact.impact && areaHits(erase.area, at))) continue
        if (!contact.fixed && (contact.issuedAt < shared || contact.walkAt !== undefined && (moveUsed || contact.walkAt < shared))) continue
        const relay = spectrumHeal(plan.battle, actor, skill, allies, contact, plan.position, planned, passiveAt)
        // The first real hit consumes this card's turn in the field, even if it goes to a full-health ally.
        used.add(contact.source)
        if (!contact.fixed) {
          shared = contact.issuedAt + COOLDOWN.shared
          moveUsed ||= contact.walkAt !== undefined
        }
        if (!relay) continue
        if (relay.extra) passiveAt = Infinity
        planned.set(relay.receiver, [...(planned.get(relay.receiver) ?? []), relay.aid])
        const gain = relay.value * relayWeight(contact)
        healing += gain
        benefit += gain
      }
      if (healing > 0 && plan.support.some(row => !used.has(row.unit) && areaHits(area, row.at))) benefit += .14 * Math.min(1, healing)
      value += benefit * plan.weight
    }
    return value
  } }
} }

const cardTactics: Readonly<Partial<Record<string, SkillTactic>>> = {
  "ranger/R/A1": { score(use, { target }) {
    if (!target) return 0
    const after = flightTime(use.actor, target) + .18
    const anchor = future(use.battle, target, after)
    const second = use.enemies.filter((unit) => unit !== target)
      .sort((a, b) => edgeDistance(anchor, future(use.battle, a, after)) - edgeDistance(anchor, future(use.battle, b, after)))[0]
    return hitScore(use, target, 1.34) + (second && edgeDistance(anchor, future(use.battle, second, after)) <= 140 ? hitScore(use, second, .8) : 0)
  } },
  "ranger/R/A2": groundAttack(() => 0, 180, "repeat"),
  "ranger/E/A1": groundAttack(({ skill }) => skill.steps[0].delay, 170),
  "ranger/Prismatic/A1": groundAttack(({ skill }) => skill.steps[0].delay, 305),
  "ranger/Prismatic/A2": longString,
  "ranger/Prismatic/A3": groundAttack(({ skill }) => skill.steps[0].delay, 340),
  "ranger/Prismatic/A4": reflectedArrows,
  "ranger/Prismatic/A5": groundAttack(({ skill }) => skill.steps[0].delay, 340),
  "warlock/C/A4": groundAttack(warlockContact, 125),
  "warlock/R/A2": groundAttack(warlockContact, 175),
  "warlock/E/A1": groundAttack(warlockContact, 230),
  "warlock/Radiant/A1": groundAttack(warlockContact, 285, "pulses"),
  "warlock/Prismatic/A1": groundAttack(warlockContact, 315, "fissures"),
  "warlock/Prismatic/A2": groundAttack(warlockContact, 340, "core"),
  "warlock/Prismatic/A3": horizonLine,
  "warlock/Prismatic/A4": groundAttack(warlockContact, 295, "echo"),
  "warlock/Prismatic/A5": riftCurtain,

  "warden/E/A2": {
    aims: (use) => clusterAims(use.enemies.map((enemy) => future(use.battle, enemy, .26)), 170),
    score(use, { at }) {
      const [gate] = previewSkillAreas(use.battle, use.actor, use.skill, at)
      if (!gate) return 0
      return use.enemies.reduce((value, enemy) => {
        if (areaHits(gate, future(use.battle, enemy, .26))) return value + hitScore(use, enemy, .90) + .55
        return value + (enemy.move && areaHits(gate, future(use.battle, enemy, 1.1)) ? .85 : 0)
      }, 0)
    },
  },
  "warden/E/A4": { score: shiftAlly },
  "warden/L/A1": rescueSwap(100, .32, false),
  "warden/Prismatic/A1": boundaryWard,
  "warden/Prismatic/A2": closingLanes,
  "warden/Prismatic/A3": { score(use, { target }) {
    if (!target || isOutside(target) || hasBuff(use.battle, target, "exguard")) return 0
    const { battle, skill, enemies } = use
    const fraction = stepAmount(skill, "b") / 100
    const knownPush = battle.runtime.visuals.some(warning => {
      if (warning.phase !== "warning" || warning.until <= battle.time || !warning.pushDistance ||
        !enemies.some(enemy => enemy.id === warning.owner)) return false
      const at = future(battle, target, warning.until - battle.time)
      return warning.shove ? !!warningEjection(battle, warning, target, at) :
        warning.effect === "damage" && warning.pushDistance >= borderGap(at) && !!areaHits(warning.area, at)
    })
    const incoming = pendingThreat(use, target, 0, 1.2)
    const current = existingShield(battle, target)
    const life = target.hp + current
    const survival = incoming >= life && incoming < target.hp + Math.max(current, target.maxHp * fraction)
    return protection(use, target, fraction) + (knownPush ? 1.3 : 0) + (survival ? 1.1 : 0)
  } },
  "warden/Prismatic/A4": crossingHammer,
  "warden/Prismatic/A5": rescueSwap(108, .38, true),
  "paladin/E/A5": shieldHandoff,
  "paladin/Radiant/A3": rescueSwap(95, .39, true),
  "paladin/Prismatic/A1": { score: dawnAccord },
  "paladin/Prismatic/A2": dawnLine,
  "paladin/Prismatic/A3": dawnOath,
  "paladin/Prismatic/A4": rescueSwap(128, .48, true, .13),
  "paladin/Prismatic/A5": linkedLight,
  "bulwark/C/A1": { score: (use) => protection(use, use.actor, .18) },
  "bulwark/UC/A2": {
    aims: (use) => use.allies.filter((ally) => ally !== use.actor && !isOutside(ally)).map((ally) => {
      const destination = future(use.battle, ally, .22)
      return { at: inside(along(destination, direction(destination, use.actor), 55), 14) }
    }),
    score(use, { at }) {
      if (edgeDistance(use.actor, at) < 24) return 0
      const partner = use.allies.filter((ally) => ally !== use.actor)
        .map((ally) => ({ ally, gap: edgeDistance(future(use.battle, ally, .22), at) }))
        .filter(({ gap }) => gap <= 145).sort((a, b) => a.gap - b.gap)[0]?.ally
      if (!partner) return 0
      const shield = protection(use, partner, .19)
      return shield ? shield + .55 * protection(use, use.actor, .15) +
        (edgeDistance(use.actor, partner) > BULWARK_COVER.range ? .45 : 0) : 0
    },
  },
  "bulwark/Prismatic/A1": citadel,
  "bulwark/Prismatic/A2": bastions,
  "bulwark/Prismatic/A3": seawall,
  "bulwark/Prismatic/A4": { score(use, { target }) {
    const { battle, actor, skill } = use
    if (!target || health(actor) < .38 || hasBuff(battle, target, "split")) return 0
    const shield = protection(use, target, stepAmount(skill, "b") / 100)
    if (!shield) return 0
    const { damage, telegraphed } = incomingHits(use, target, 0, 2.5)
    const lethal = damage > target.hp + existingShield(battle, target)
    return shield * (health(target) < .55 ? 1.55 : 1.1) + (lethal ? .75 : telegraphed ? .25 : 0)
  } },
  "bulwark/Prismatic/A5": castIsland,

  "healer/UC/A4": { score(use, { target }) {
    if (!target) return 0
    const at = future(use.battle, target, .48)
    const next = use.allies.filter((unit) => unit !== target)
      .sort((a, b) => edgeDistance(at, future(use.battle, a, .48)) - edgeDistance(at, future(use.battle, b, .48)))[0]
    return healScore(use.battle, target, .13) + (next && edgeDistance(at, future(use.battle, next, .48)) <= 95 ? healScore(use.battle, next, .06) : 0)
  } },
  "healer/E/A1": {
    aims: (use) => clusterAims(use.allies.map((ally) => future(use.battle, ally, .27)), 220),
    score: (use, { at }) => use.allies.reduce((value, ally) =>
      value + (edgeDistance(future(use.battle, ally, .27), at) <= 112 ? healScore(use.battle, ally, .17) : 0), 0),
  },
  "healer/L/A1": triage,
  "healer/L/A2": stopLoss,
  "healer/L/A4": healerField("cleanse"),
  "healer/Radiant/A2": { score(use, { target }) {
    if (!target) return 0
    const { battle, actor, allies, skill } = use
    const { windup } = healerChoreography(skill.id)!
    const atWindup = target === actor ? actor : future(battle, target, windup)
    const arrival = windup + healerFlight(edgeDistance(actor, atWindup))
    const first = healScore(battle, target, stepHeal(skill))
    const anchor = future(battle, target, arrival + .65)
    const second = allies.filter((ally) => ally !== target &&
      edgeDistance(anchor, future(battle, ally, arrival + .65)) <= 135).sort((a, b) => health(a) - health(b))[0]
    return first + (second ? healScore(battle, second, stepHeal(skill, 1)) * .74 : 0)
  } },
  "healer/Prismatic/A1": { score: (use) => use.allies.reduce((value, ally) => {
    const outside = isOutside(ally)
    const heal = stepHeal(use.skill) + (outside ? stepHeal(use.skill, 1) : 0)
    return value + healScore(use.battle, ally, heal) + (outside ? protection(use, ally, stepAmount(use.skill, "b", 1) / 100) : 0)
  }, 0) },
  "healer/Prismatic/A2": { score(use) {
    const { battle, actor, skill } = use
    const firstArrival = healerChoreography(skill.id)!.windup
    const secondArrival = firstArrival + .34
    const [first, second] = predictSkillTargets(battle, actor, skill, actor)
    const priority = second.targets[0]
    return first.targets.reduce((value, ally) => {
      const firstHeal = healForSurvival(use, ally, stepHeal(skill), firstArrival)
      if (firstHeal === undefined) return value
      if (ally !== priority) return value + firstHeal
      const shield = existingShield(battle, ally, secondArrival)
      const beforeSecond = pendingThreat(use, ally, 0, secondArrival)
      const restored = Math.min(ally.maxHp - ally.hp, stepHeal(skill) * ally.maxHp * healingReceived(battle, ally))
      if (beforeSecond >= ally.hp + shield + restored) return value + firstHeal
      const fullHeal = stepHeal(skill) + stepHeal(skill, 1)
      const fullValue = healForSurvival(use, ally, fullHeal, secondArrival) ?? healScore(battle, ally, fullHeal)
      return value + Math.max(firstHeal, fullValue) + protection(use, ally, stepAmount(skill, "b", 1) / 100)
    }, 0)
  } },
  "healer/Prismatic/A3": { score(use, { target }) {
    if (!target) return 0
    const { battle, actor, skill } = use
    const { windup } = healerChoreography(skill.id)!
    const atWindup = target === actor ? actor : future(battle, target, windup)
    const arrival = windup + healerFlight(edgeDistance(actor, atWindup))
    const benefit = healForSurvival(use, target, stepHeal(skill), arrival)
    if (benefit === undefined) return 0
    if (target === use.actor) return benefit
    const danger = pressure(use, target)
    if (health(use.actor) < .28 && danger >= 1 && health(target) > health(use.actor)) return 0
    return benefit + (danger > 0 && !hasBuff(use.battle, target, "split") ? .40 * Math.min(2, danger) : 0)
  } },
  "healer/Prismatic/A4": healerField("link"),
  "healer/Prismatic/A5": healerField("cleanse"),
  "lifebringer/Prismatic/A1": { score: ({ battle, allies, skill }) => {
    const arrival = battle.time + lifebringerChoreography(skill.id)!.windup
    const threatened = battle.runtime.pending.some(job => job.strike)
    const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
    const args = skill.steps[0].operations[0].args
    return allies.reduce((value, ally) => {
      if (threatened && !lifeThroughStrikes(battle, ally, announcedStrikes(battle, ally, arrival, position), position).hp) return value
      const pending = battle.runtime.pendingLifeHeals.some((pulse) => pulse.target === ally.id && pulse.until > battle.time && pulse.remaining > 0)
      const heal = chronowheelBudget(battle, args, ally) / ally.maxHp
      return value + healScore(battle, ally, heal) * (pending ? .45 : 1)
    }, 0)
  } },
  "lifebringer/Prismatic/A2": {
    aims: ({ allies }) => clusterAims(allies, 345),
    score(use, { at }) {
      const { battle, allies, skill } = use
      const { operations, selector } = skill.steps[0]
      const [radius, heal, delay, age] = operations[0].args
      const arrival = (lifebringerChoreography(skill.id)?.windup ?? 0) + delay
      const flowers = allies.filter((unit) => edgeDistance(unit, at) <= selector.size[0]).map((unit) => {
        const past = battle.runtime.histories.get(unit.id)?.positions
        return past?.findLast((sample) => sample.time <= battle.time - age)?.at ?? past?.[0]?.at ?? unit
      })
      return allies.reduce((score, ally) => score + (flowers.some((old) => edgeDistance(old, future(battle, ally, arrival)) <= radius)
        ? healScore(battle, ally, heal / 100) : 0), 0)
    },
  },
  "lifebringer/Prismatic/A3": { prepare({ battle, actor, skill, allies }) {
    const placements = reservoirPlacements(battle, actor, skill, allies)
    return placements ? { aims: placements.aims.map(at => ({ at })), score: ({ at }) => placements.evaluate(at).value } :
      { aims: [], score: () => 0 }
  } },
  "lifebringer/Prismatic/A4": { score(use, { target }) {
    if (!target) return 0
    const { battle, skill } = use
    const arrival = lifebringerChoreography(skill.id)!.windup
    const at = battle.time + arrival
    const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
    const contacts = announcedStrikes(battle, target, at, position)
    if (contacts.length && !lifeThroughStrikes(battle, target, contacts, position).hp) return 0
    const heal = healScore(battle, target, stepHeal(skill))
    const { damage } = incomingHits(use, target, arrival, arrival + 2.4)
    const shield = existingShield(battle, target, arrival)
    if (damage >= target.hp + shield + target.maxHp * stepHeal(skill)) return heal
    const [refund, , cap] = skill.steps[0].operations.find(op => op.kind === "returnhp")!.args
    const expected = Math.min(target.maxHp * cap / 100, Math.max(0, damage - shield) * refund / 100)
    return heal + expected / target.maxHp * 3
  } },
  "lifebringer/Prismatic/A5": starbranch,
  "bard/C/A1": { score(use, { target }) {
    if (!target || hasBuff(use.battle, target, "ampq")) return 0
    const { battle, actor, enemies, skill } = use
    const ready = (target === actor ? actor.actionCooldown : target.actionAt - battle.time) <= 4
    const canAttack = ready && enemies.some(enemy => edgeDistance(target, future(battle, enemy, .35)) <= attackRange(battle, target, enemy))
    return protection(use, target, stepAmount(skill, "b") / 100) +
      (canAttack ? target.attack / actor.attack * stepAmount(skill, "ampq") / 100 : 0)
  } },
  "bard/E/A2": {
    aims: (use) => clusterAims(use.allies.map(ally => future(use.battle, ally, .35)), 245),
    score(use, { at }) {
      const { battle, actor, skill, allies, enemies } = use
      const { selector } = skill.steps[0]
      const shield = stepAmount(skill, "b") / 100
      const recent = battle.runtime.fields.filter(field => field.cast.owner === actor.id && field.cast.skill?.id === skill.id &&
        field.until > battle.time + .8)
      return allies.reduce((value, ally) => {
        const place = future(battle, ally, .35)
        const ready = ally === actor ? actor.actionCooldown : ally.actionAt - battle.time
        if (isOutside(place) || edgeDistance(place, at) > selector.size[0]) return value
        const ward = protection(use, ally, shield)
        if (ready > 6 || recent.some(field => !field.seen.has(ally.id) && areaHits(field.area, place))) return value + ward
        const canAttack = enemies.some(enemy => edgeDistance(place, enemy) <= attackRange(battle, ally, enemy) ||
          ally.actives.some(active => attackPower(battle, ally, active, enemy, enemy) > 0))
        return value + ward + (canAttack ? stepAmount(skill, "add", 1) * (ready <= 3 ? 1.25 : .7) : 0)
      }, 0)
    },
  },
  "bard/L/A1": { score(use, { target }) {
    if (!target) return 0
    const { battle, actor, skill, allies } = use
    const followers = allies.filter(ally => ally !== actor && !isOutside(ally) && ally.actionAt <= battle.time + 5 &&
      (edgeDistance(ally, target) <= attackRange(battle, ally, target) ||
        ally.actives.some(active => attackPower(battle, ally, active, target, target) > 0)))
    return hitScore(use, target, stepPower(skill)) + Math.min(2, followers.length) * stepPower(skill, 1) * .76
  } },
  "bard/L/A2": {
    aims(use) {
      const { battle, allies, enemies } = use
      const friends = allies.map(ally => future(battle, ally, .39))
      const foes = enemies.map(enemy => future(battle, enemy, .39))
      return clusterAims([...foes, ...friends], 140)
    },
    score(use, { at }) {
      const { battle, actor, skill, allies } = use
      const [attack, ward] = previewSkillAreas(battle, actor, skill, at)
      if (!attack || !ward) return 0
      const damage = contacts(use, attack, .39).reduce((total, { unit, at: position }) =>
        total + hitScore(use, unit, stepPower(skill)) + (borderGap(position) <= stepAmount(skill, "p") ? .3 : .1), 0)
      return allies.reduce((total, ally) => total + (areaHits(ward, future(battle, ally, .39))
        ? protection(use, ally, stepAmount(skill, "b", 1) / 100) : 0), damage)
    },
  },
  "bard/L/A3": { score(use, { target }) {
    if (!target || !isFighter(target) || isOutside(target)) return 0
    const { battle, actor, skill, enemies, allies } = use
    const ready = target === actor ? actor.actionCooldown : target.actionAt - battle.time
    if (ready > 3 || battle.runtime.watches.some(watch => watch.target === target.id && watch.cast.skill?.id === skill.id &&
      watch.until > battle.time && watch.uses > 0)) return 0
    let best = 0
    for (const enemy of enemies) {
      const canHit = edgeDistance(target, enemy) <= attackRange(battle, target, enemy) ||
        target.actives.some(active => attackPower(battle, target, active, enemy, enemy) > 0)
      if (!canHit) continue
      const nearby = allies.filter(ally => edgeDistance(ally, enemy) <= skill.steps[1].selector.size[0])
      const recovery = nearby.reduce((value, ally) => value + healScore(battle, ally, stepHeal(skill, 1)), 0)
      best = Math.max(best, stepAmount(skill, "add") + .8 * recovery)
    }
    return best
  } },
  "bard/L/A5": { score(use, { target }) {
    if (!target || !isFighter(target)) return 0
    const { battle, skill, enemies } = use
    const canFollow = target.actionAt <= battle.time + 4 && enemies.some(enemy =>
      target.actives.some(active => attackPower(battle, target, active, enemy, enemy) > 0))
    return protection(use, target, stepAmount(skill, "b") / 100) +
      (canFollow ? healScore(battle, target, stepHeal(skill, 1)) * .7 : 0)
  } },
  "bard/Prismatic/A1": { score: (use) => use.allies.reduce((value, ally) => {
    const engaged = use.enemies.some((enemy) => edgeDistance(ally, enemy) <= attackRange(use.battle, ally, enemy) + 90)
    return value + (engaged && !isOutside(ally) && ally.actionAt <= use.battle.time + 4 && !hasBuff(use.battle, ally, "score") ? .73 : 0)
  }, 0) },
  "bard/Prismatic/A2": { score: (use) => use.allies.reduce((value, ally) => value + healScore(use.battle, ally, stepHeal(use.skill)) +
    (health(ally) < .45 ? protection(use, ally, stepAmount(use.skill, "b", 1) / 100) : 0), 0) },
  "bard/Prismatic/A3": overture,
  "bard/Prismatic/A4": spectrumDuel,
  "bard/Prismatic/A5": { score(use, { target }) {
    if (!target) return 0
    const { battle, actor, skill } = use
    const art = bardChoreography(skill.id)!
    const atWindup = target === actor ? actor : future(battle, target, art.windup)
    const arrival = art.windup + bardFlight(art.motif, art.delivery, edgeDistance(actor, atWindup))
    if (!isOutside(target === actor ? actor : future(battle, target, arrival))) return 0
    return healScore(battle, target, stepHeal(skill)) + protection(use, target, stepAmount(skill, "b") / 100)
  } },

  "binder/R/A1": attraction(.34),
  "binder/Prismatic/A1": attraction(.45),
  "binder/Prismatic/A2": attraction(.55),
  "binder/Prismatic/A3": inverseField,
  "binder/Prismatic/A4": retreatSeal,
  "binder/Prismatic/A5": pressurePin,
  "assassin/R/A2": returningBlade,
  "assassin/L/A1": { score: (use, { target }) => target ?
    hitScore(use, target, health(target) < .35 ? 1.90 : 1.52) + (canFinish(use, target, health(target) < .35 ? 1.90 : 1.52) ? .85 : 0) : 0 },
  "assassin/Prismatic/A1": chaseOutside(2, 135),
  "assassin/Prismatic/A2": doubleEdge,
  "assassin/Prismatic/A3": windShear,
  "assassin/Prismatic/A4": shadowPit,
  "assassin/Prismatic/A5": chaseOutside(1.7, 114),
  "berserker/R/A1": { score(use, { target }) {
    if (!target || health(use.actor) < .24 && !canFinish(use, target, 1.58)) return 0
    return hitScore(use, target, 1.58) + (borderGap(target) < 82 ? .40 : .1) - (health(use.actor) < .4 ? .55 : .2)
  } },
  "berserker/Radiant/A1": { score(use) {
    const { actor, battle, enemies } = use
    if (hasBuff(battle, actor, "choose")) return 0
    const push = enemies.filter((enemy) => edgeDistance(actor, enemy) <= 105).length
    const follow = actor.actionCooldown < 8 && enemies.some((enemy) => edgeDistance(actor, enemy) <= 245)
    return healScore(battle, actor, .14) + push * .56 + (follow ? .74 : 0)
  } },
  "berserker/Prismatic/A1": trinity,
  "berserker/Prismatic/A2": bloodCross,
  "berserker/Prismatic/A3": frontierCut,
  "berserker/Prismatic/A4": furnace,
  "berserker/Prismatic/A5": { score: lastStand },
  "dancer/C/A1": { score(use, { target }) {
    if (!target || isOutside(target) || hasBuff(use.battle, target, "speed")) return 0
    const travel = target.move && !target.force && !movementStopped(use.battle, target) ? edgeDistance(target, target.move) : 0
    return travel > 95 ? .55 + Math.min(.65, travel / 270) : nextApproach(use, target, COOLDOWN.shared) ? .61 : 0
  } },
  "dancer/C/A2": longerStep,
  "dancer/UC/A1": { score: shiftAlly },
  "dancer/UC/A5": { score(use, { target }) {
    return target && watchMovement(use, target, 95) ? .65 + protection(use, target, .14) * .55 : 0
  } },
  "dancer/R/A1": longerStep,
  "dancer/R/A3": { score(use, { target }) {
    if (!target || !watchMovement(use, target, 42)) return 0
    const at = future(use.battle, target, .28)
    return use.allies.reduce((score, ally) => score + (ally !== target && edgeDistance(at, future(use.battle, ally, .8)) <= 78
      ? protection(use, ally, .12) : 0), 0)
  } },
  "dancer/E/A1": pairStep,
  "dancer/L/A1": hopStep,
  "dancer/L/A2": {
    aims: (use) => clusterAims(use.enemies.map((unit) => future(use.battle, unit, .71)), 155),
    score(use, { at }) {
      const route = previewSkillDisplacements(use.battle, use.actor, use.skill, at)[0]
      if (!route) return 0
      const origin = areaOf("C", route.from, direction(route.from, route.to), 80)
      const end = areaOf("C", route.to, direction(route.from, route.to), 80)
      const hits = contacts(use, origin, .34).length + contacts(use, end, .71).length
      if (!hits) return 0
      const safer = pressure(use, use.actor, route.from) - pressure(use, use.actor, route.to)
      return Math.max(0, .76 * hits + (health(use.actor) < .6 ? .35 * safer : .1 * safer))
    },
  },
  "dancer/L/A3": pairStep,
  "dancer/Prismatic/A1": railPlacement(false),
  "dancer/Prismatic/A2": railPlacement(true),
  "dancer/Prismatic/A3": rewindAlly,
  "dancer/Prismatic/A4": rushSteps,
  "dancer/Prismatic/A5": coastRelay,
  "spellbreaker/C/A1": { score: (use, { target }) => target ?
    hitScore(use, target, 1.12) + (target.shieldUntil > use.battle.time ? Math.min(.4, target.shield / use.actor.attack) : 0) : 0 },
  "spellbreaker/R/A3": counterWard("ranged"),
  "spellbreaker/L/A3": deflector,
  "spellbreaker/L/A5": sidestep,
  "spellbreaker/Radiant/A3": counterWard("spell"),
  "spellbreaker/Prismatic/A1": dispelStrike(true),
  "spellbreaker/Prismatic/A2": dispelStrike(false),
  "spellbreaker/Prismatic/A3": { score: reflectionShield },
  "spellbreaker/Prismatic/A4": scoreLock,
  "spellbreaker/Prismatic/A5": scatterSeals,
}

function summonWard(kind: "hexWard" | "armorBeast"): SkillTactic {
  const plan = SUMMON_PLANS[kind]
  const radius = plan.aura!.radius
  const shield = plan.actions![0].step.operations.find(op => op.kind === "b")!.args[0] / 100
  return {
    aims: (use) => clusterAims(use.allies.map(ally => future(use.battle, ally, .45)), radius * 2),
    score(use, { at }) {
      const { battle, actor, allies, enemies } = use
      const origin = summonSpawns(kind, actor, at)[0]
      const landing = plan.motion?.kind === "leap" ? inside(at) : origin
      const delay = plan.motion?.kind === "leap" ? Math.max(.22, edgeDistance(origin, landing) / plan.motion.speed) : 0
      const values = allies.flatMap(ally => {
        const place = future(battle, ally, delay)
        if (edgeDistance(landing, place) > radius) return []
        const canIntercept = plan.guard && enemies.some(enemy => edgeDistance(landing, enemy) > radius &&
          edgeDistance(place, enemy) <= attackRange(battle, enemy, ally) + 80)
        return [protection(use, ally, shield) + (canIntercept ? .25 : 0)]
      })
      const total = values.reduce((sum, value) => sum + value, 0)
      return kind === "armorBeast" ? total : Math.max(0, ...values) * .7 + total * .3
    },
  }
}

const twinBows: SkillTactic = { prepare(use) {
  const { actor, battle, enemies } = use
  const [sweep] = SUMMON_PLANS.twinBows.actions!
  const delay = sweep.delay!
  const power = sweep.step.operations[0].args[0]
  const positions = enemies.map(unit => ({ at: future(battle, unit, delay), later: future(battle, unit, delay + sweep.cooldown),
    value: hitScore(use, unit, power) }))
  const aims = clusterAims(positions.map(({ at }) => at), 180)
  return { aims, score({ at }) {
    const [first, second] = summonSpawns("twinBows", actor, at)
    const line = areaOf("L", first, direction(first, second), edgeDistance(first, second), sweep.step.selector.size[1])
    const hit = positions.reduce((score, { at, value }) => score + (areaHits(line, at) ? value : 0), 0)
    if (!hit) return 0
    const repeat = positions.reduce((score, { later, value }) => score + (areaHits(line, later) ? value : 0), 0)
    return .42 + hit * .82 + repeat * .45
  } }
} }

const summonRail: SkillTactic = { prepare(use) {
  const { actor, battle, allies, skill } = use
  const [pulse] = SUMMON_PLANS.rail.actions!
  const [length, width] = pulse.step.selector.size
  const extension = pulse.step.operations.find(op => op.kind === "extend")!.args[0]
  const moveAt = sideOf(battle, actor.id) === "ally" ? battle.moveAt : battle.sparring!.moveAt
  const ready = Math.max(COOLDOWN.shared, moveAt - battle.time)
  const recipients = allies.flatMap(ally => {
    if (isOutside(ally) || ally.force || movementStopped(battle, ally)) return []
    const value = stepValue(use, ally, extension, 0, ready)
    const remaining = ally !== actor && ally.move ? edgeDistance(ally, ally.move) : 0
    if (value <= 0 && remaining < 80) return []
    return [{ ally, value, remaining }]
  })
  const aims = recipients.flatMap(({ ally }) => {
    const axis = direction(actor, ally)
    const span = Math.min(skill.aim.range - 1, Math.max(100, edgeDistance(actor, ally) + 32))
    return [{ at: along(actor, axis, span) }, ...(ally.move ? [{ at: midpoint(ally, ally.move) }] : [])]
  })
  return { aims, score({ at }) {
    const [spawn] = summonSpawns("rail", actor, at)
    if (edgeDistance(spawn, actor) < 45) return 0
    const line = areaOf("L", spawn, direction(spawn, actor), Math.min(length, edgeDistance(spawn, actor)), width)
    const gains = recipients.filter(({ ally }) => areaHits(line, ally))
      .map(({ remaining, value }) => .20 + value * .75 + Math.min(.48, remaining / 380)).sort((a, b) => b - a)
    return (gains[0] ?? 0) + (gains[1] ?? 0) * .45
  } }
} }

const roadBeastPlan = SUMMON_PLANS.roadBeast
const [roadBeastPush] = roadBeastPlan.actions!
const roadBeastRadius = roadBeastPush.step.selector.size[0]

function roadBeastForecast({ battle, actor, allies, skill }: Omit<SkillUse, "enemies">, ready: number, horizon: number, fresh: boolean) {
  const now = battle.time
  const friends = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring!
  const foes = battleUnits(battle).filter(unit => unit.hp && !sameSide(battle, unit.id, actor.id))
  const position = (unit: EdgeUnit, time: number) => fresh && unit === actor ? actor : future(battle, unit, time - now)
  const firstTick = Math.max(1, Math.ceil(ready / SPARRING_STEP - 1e-6))
  const tickCount = Math.max(0, Math.floor(horizon / SPARRING_STEP) - firstTick + 1)
  const frames = Array.from({ length: tickCount }, (_, index) => {
    const delay = (firstTick + index) * SPARRING_STEP
    return { delay, targets: foes.map(unit => ({ unit, at: position(unit, now + delay) })) }
  })
  const pending = new Map([...allies, ...foes].map(unit =>
    [unit, announcedStrikes(battle, unit, now + horizon + .5, position)]))

  const scorePush = (unit: EdgeUnit, at: EdgePoint, end: EdgePoint, impact: number, duration: number) => {
    const lands = impact + duration
    const ejected = !isOutside(at) && isOutside(end)
    const after = (target: EdgeUnit, time: number) => {
      if (target !== unit || time < impact) return position(target, time)
      const progress = 1 - (1 - clamp((time - impact) / duration, 0, 1)) ** 3
      return along(at, direction(at, end), edgeDistance(at, end) * progress)
    }
    let relief = 0
    let pursuit = 0
    let dangerBefore = 0
    let dangerAfter = 0
    const hostileClock = unit.id === "boss" ? battle.boss : friends === battle ? battle.sparring : battle
    const enemyReady = Math.max(lands, unit.actionAt, hostileClock?.sharedAt ?? now)
    // The shove cancels the current move. Use only the time the clock
    // actually prevents the enemy from issuing a replacement.
    const moveAt = Math.min(lands + 1.2, Math.max(lands, hostileClock?.moveAt ?? now, hostileClock?.sharedAt ?? now))
    const unimpeded = position(unit, moveAt)
    const deniedWalk = unit.move && !unit.force && edgeDistance(at, unit.move) > 28 &&
      edgeDistance(unimpeded, end) > 30
    const basicAccess = (source: EdgeUnit, target: EdgeUnit, from: EdgePoint, to: EdgePoint, time: number) =>
      clamp((attackRange(battle, source, target, time) + 8 - edgeDistance(from, to)) / 34, 0, 1) *
        (isOutside(from) ? EXILE.damage : 1) * (isOutside(to) ? EXILE.received : 1)
    for (const ally of allies) {
      const fire = Math.max(lands, ally.actionAt, friends.sharedAt, fresh ? now + (ally === actor ? actor.actionCooldown : COOLDOWN.shared) : now)
      if (fire <= lands + 1.15 && targetable(battle, unit, fire)) {
        const from = position(ally, fire)
        const before = basicAccess(ally, unit, from, position(unit, fire), fire)
        const after = basicAccess(ally, unit, from, end, fire)
        pursuit += (after - before) * (.87 + .55 * (1 - health(unit))) / (1 + fire - lands)
      }
      if (enemyReady <= lands + 1.15 && targetable(battle, ally, enemyReady)) {
        const to = position(ally, enemyReady)
        const weight = .9 + .85 * (1 - health(ally))
        dangerBefore = Math.max(dangerBefore, basicAccess(unit, ally, position(unit, enemyReady), to, enemyReady) * weight)
        dangerAfter = Math.max(dangerAfter, basicAccess(unit, ally, end, to, enemyReady) * weight)
      }
      if (deniedWalk) {
        const to = position(ally, moveAt)
        const before = edgeDistance(unimpeded, to)
        const after = edgeDistance(end, to)
        const reach = attackRange(battle, unit, ally, moveAt)
        const loss = before <= reach + 35 && after >= reach + 18 ? Math.min(.85, (after - before) / 95) : 0
        relief = Math.max(relief, loss)
      }
      for (const hit of pending.get(ally) ?? []) {
        if (hit.source !== unit || !hit.strike.needsUnforcedOwner) continue
        const lock = "area" in hit.strike ? hit.at : hit.strike.locksAt ?? hit.at
        if (lock <= impact || lock >= lands) continue
        const damage = announcedHit(battle, hit, ally, position(ally, hit.at), position)
        if (damage) relief = Math.max(relief, (damage.lethal ? 1.9 : 0) + 4 * (damage.hpLoss + damage.shieldLoss * .35) / ally.maxHp)
      }
    }
    let scheduled = 0
    for (const hit of pending.get(unit) ?? []) {
      if (hit.at < impact || hit.at > lands + .25) continue
      const previous = announcedHit(battle, hit, unit, position(unit, hit.at), position)
      const displaced = announcedHit(battle, hit, unit, after(unit, hit.at), after)
      scheduled += (Number(!!displaced?.lethal) - Number(!!previous?.lethal)) * 1.3 +
        ((displaced?.hpLoss ?? 0) - (previous?.hpLoss ?? 0)) / unit.maxHp * 3
    }
    const charge = chargeOf(battle, unit)
    const edge = ejected ? 1.18 + Math.min(.38, borderGap(end) / 180) + (charge && charge.until > impact ? 1 : 0)
      : isOutside(at) && !isOutside(end) ? -1.35 : 0
    return (edge + clamp(pursuit, -1.35, 1.6) + (dangerBefore - dangerAfter) + relief + scheduled) /
      (1 + (impact - now) * .32)
  }

  return { foes, position, score(origin: EdgePoint, end: EdgePoint, facing: EdgePoint, age: number) {
    const motion = roadBeastPlan.motion
    if (motion?.kind !== "patrol") return 0
    for (const { delay, targets } of frames) {
      const { at: body } = summonPatrolPosition(origin, end, motion.speed, age + delay)
      let nearest: typeof targets[number] | undefined
      let gap = Infinity
      for (const target of targets) {
        const distance = edgeDistance(body, target.at)
        if (distance <= roadBeastRadius && distance < gap) {
          nearest = target
          gap = distance
        }
      }
      if (!nearest) continue
      const previous = summonPatrolPosition(origin, end, motion.speed, age + delay - SPARRING_STEP).at
      const axis = edgeDistance(previous, body) > .001 ? direction(previous, body) : facing
      const { unit, at } = nearest
      const impact = now + delay
      const area = areaOf("C", body, axis, roadBeastRadius)
      const shift = previewContactShift(battle, { ...actor, ...body }, skill, roadBeastPush.step,
        along(body, axis, 1), area, unit, at, impact)
      // The first contact spends the pulse, even if the shove achieves nothing.
      return shift ? scorePush(unit, at, shift.end, impact, shift.duration) : 0
    }
    return 0
  } }
}

export function liveRoadBeastValue(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], group: SummonGroup) {
  const [body] = group.deployment.bodies
  const motion = roadBeastPlan.motion
  const skill = group.deployment.cast.skill
  if (!body.hp || motion?.kind !== "patrol" || !skill) return 0
  const until = Math.min(2.65, group.until - SUMMON_DISMISS_TIME - battle.time - SPARRING_STEP)
  const ready = body.actionsAt[0] - battle.time
  if (ready > until) return 0
  const forecast = roadBeastForecast({ battle, actor, allies, skill }, ready, until, false)
  const end = inside(along(group.from, group.axis, motion.reach!))
  return Math.max(0, forecast.score(body.origin, end, body.facing, battle.time - group.start))
}

const roadBeast: SkillTactic = { prepare(use) {
  const { battle, actor, skill } = use
  const motion = roadBeastPlan.motion
  if (motion?.kind !== "patrol") return { aims: [], score: () => 0 }
  const horizon = 2.25
  const forecast = roadBeastForecast(use, roadBeastPush.delay ?? 0, horizon, true)
  const aims: AiAim[] = []
  const headings = new Set<number>()
  for (const delay of [.35, .85, 1.4, 2]) for (const enemy of forecast.foes) {
    const at = forecast.position(enemy, battle.time + delay)
    const gap = edgeDistance(actor, at)
    if (gap > motion.reach! + roadBeastRadius) continue
    const axis = direction(actor, at)
    const flank = Math.atan2(roadBeastRadius * .68, Math.max(45, gap)) * 180 / Math.PI
    for (const turn of [0, -flank, flank]) {
      const heading = rotate(axis, turn)
      const key = Math.round(Math.atan2(heading.y, heading.x) * 90 / Math.PI)
      if (headings.has(key)) continue
      headings.add(key)
      aims.push({ at: along(actor, heading, Math.min(skill.aim.range - 1, 80)) })
    }
  }
  return { aims, score({ at }) {
    const axis = direction(actor, at)
    const [origin] = summonSpawns("roadBeast", actor, at)
    const end = inside(along(actor, axis, motion.reach!))
    return forecast.score(origin, end, axis, 0)
  } }
} }

const returnBeast: SkillTactic = { prepare(use) {
  const { battle, actor, allies, enemies, skill } = use
  const plan = SUMMON_PLANS.returnBeast
  const motion = plan.motion
  if (motion?.kind !== "outBack") return { aims: [], score: () => 0 }
  const [push, rescue] = plan.actions!
  const { speed } = motion
  const [pushRadius] = push.step.selector.size
  const [rescueRadius] = rescue.step.selector.size
  const [pullDistance, pullGap] = rescue.step.operations[0].args
  const exiled = allies.flatMap(unit => {
    if (unit === actor || !isOutside(unit.force?.end ?? unit)) return []
    const free = unit.force ? unit.force.since + unit.force.duration - battle.time : 0
    return [{ unit, returnAt: Math.max(0, free), end: unit.force?.end ?? unit }]
  })
  const windows = [.18, .26, .38, .6, .84, 1.08, 1.32, 1.58, 1.88, 2.18, 2.5, 2.84]
  const contacts = windows.map(delay => ({
    enemies: enemies.map(unit => ({ unit, at: future(battle, unit, delay) })),
    allies: exiled.map(({ unit, returnAt, end }) => {
      if (unit.move || delay <= returnAt || movementStopped(battle, unit)) return { unit, at: future(battle, unit, delay) }
      const destination = inside(end, 55)
      const advance = movementSpeed(battle, { ...unit, ...end }) * (delay - returnAt)
      return { unit, at: along(end, direction(end, destination), Math.min(edgeDistance(end, destination), advance)) }
    }),
  }))
  const aims = [2, 4, 6, 8].flatMap(index => clusterAims(contacts[index].enemies.map(({ at }) => at), pushRadius * 2))
  for (const { end } of exiled) {
    const edge = inside(end)
    const axis = direction(actor, edge)
    if (edgeDistance(actor, edge) > skill.aim.range + rescueRadius) continue
    for (const extend of [0, 40, 85]) aims.push({ at: inside(along(edge, axis, extend)) })
  }
  return { aims, score({ at }) {
    const [origin] = summonSpawns("returnBeast", actor, at)
    const end = inside(at)
    if (edgeDistance(origin, end) < 65) return 0
    const axis = direction(origin, end)
    let control = 0
    let recovery = 0
    for (const [index, delay] of windows.entries()) {
      const { at: body, outbound } = summonPatrolPosition(origin, end, speed, delay)
      if (outbound) {
        const hits = contacts[index].enemies.filter(({ at }) => !isOutside(at) && edgeDistance(at, body) <= pushRadius - 5)
        if (!hits.length) continue
        const exits = hits.filter(({ at }) => isOutside(along(at, axis, push.step.operations[0].args[0]))).length
        const pressure = hits.some(({ unit }) => unit.range < 200 && allies.some(ally =>
          ally.range >= 200 && ally.hp < ally.maxHp * .62 && edgeDistance(ally, unit) <= attackRange(battle, unit, ally) + 70))
        control = Math.max(control, (.72 + Math.min(3, hits.length) * .25 + Math.min(2, exits) * .55 +
          (pressure ? .55 : 0)) / (1 + delay * .27))
      } else {
        const candidate = contacts[index].allies.reduce<{ unit: EdgeFighter; at: EdgePoint; gap: number } | undefined>((nearest, { unit, at }) => {
          const gap = edgeDistance(at, body)
          return isOutside(at) && gap <= rescueRadius - 5 && (!nearest || gap < nearest.gap) ? { unit, at, gap } : nearest
        }, undefined)
        if (!candidate) continue
        const { unit, at, gap } = candidate
        const pull = Math.min(pullDistance, Math.max(0, gap - pullGap)) *
          (unit.guardUntil > battle.time + delay ? EXILE.push : 1)
        const to = along(at, direction(at, body), pull)
        const inward = outward(at)
        const gain = (at.x - to.x) * inward.x + (at.y - to.y) * inward.y
        if (gain < 18) continue
        const value = (isOutside(to) ? .45 + gain / 85 : 1.65 + (1 - health(unit)) * .85) / (1 + delay * .35)
        recovery = Math.max(recovery, value)
      }
    }
    return control + recovery
  } }
} }

const mirrorFollow: SkillTactic = {
  score(use, { target }) {
    if (!target || !isFighter(target)) return 0
    const { battle, actor, skill } = use
    const [from] = summonSpawns("mirror", actor, target)
    const cast = forecastSkillCast(actor, skill, target)
    cast.id = -1
    cast.used.delete("manual")
    return mirrorOpportunity(use, target, {
      from, axis: direction(actor, target), ready: battle.time, expires: battle.time + mirrorPlan.duration, cast,
    }, true)
  },
}

function mirrorOpportunity({ battle, actor, enemies, partnerAction }: Omit<SkillUse, "allies" | "skill">,
  partner: EdgeFighter, mirror: MirrorPosition, deploying: boolean) {
  const now = battle.time
  const stay = (unit: EdgeUnit, time: number) => deploying && unit === actor ? actor : future(battle, unit, time - now)
  let imminent = 0
  for (const { due, strike } of battle.runtime.pending) {
    if (!strike || "area" in strike || strike.cast.owner !== partner.id || strike.cast.order !== "basic" || due <= now) continue
    const enemy = unitOf(battle, strike.target)
    if (!enemy?.hp || isSummonId(enemy.id)) continue
    const body = mirrorBody(battle, mirror, time => stay(partner, time), due)
    if (!body) continue
    imminent = Math.max(imminent, mirrorShotValue(battle, actor, mirror, body, enemy, due, stay, strike.cast) * 1.8)
  }

  const clocks = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring ?? battle
  const personal = deploying && partner === actor ? now + actor.actionCooldown : partner.actionAt
  const free = partner.force ? partner.force.since + partner.force.duration + SPARRING_STEP : now
  const ready = Math.max(now, clocks.sharedAt, deploying ? now + COOLDOWN.shared : now, personal, free)
  if (!partner.hp || ready > now + 3.8 || ready >= mirror.expires) return imminent
  const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
  const fire = now + Math.ceil((ready - now) / frame - 1e-6) * frame
  const origin = stay(partner, fire)
  const walking = (!deploying || partner !== actor) && !movementStopped(battle, partner) ? partner.move : null
  if (isOutside(origin) || walking && edgeDistance(origin, walking) > 3) return imminent
  if (battle.runtime.buffs.some(buff => buff.target === partner.id && buff.kind === "choose" && buff.until > fire)) return imminent
  const position = (unit: EdgeUnit, time: number) => unit === partner && time >= fire ? origin : stay(unit, time)
  const announced = announcedStrikes(battle, partner, fire, position)
  if (announced.length && !lifeThroughStrikes(battle, partner, announced, position).hp) return imminent
  if (health(partner) < .35 && readyLockStrikes(battle, partner, enemies.filter(isFighter), position)
    .some(hit => hit.at < fire && !lifeThroughStrikes(battle, partner, [...announced, hit].sort((a, b) => a.at - b.at), position).hp)) return imminent
  const actorAtFire = { ...partner, ...origin }
  const outcomes = new Map<EdgeUnit, number>()
  for (const enemy of enemies) {
    const target = position(enemy, fire)
    if (!targetable(battle, enemy, fire) || edgeDistance(origin, target) > attackRange(battle, actorAtFire, enemy, fire)) continue
    const trigger = fire + (partner.range >= 200 ? flightTime(origin, target) : 0)
    if (trigger > fire && announcedStrikes(battle, partner, trigger, position).some(hit => {
      const shove = announcedShift(battle, hit, partner, position)
      return hit.at >= fire && shove && edgeDistance(shove.end, origin) > 32
    })) continue
    const body = mirrorBody(battle, mirror, time => position(partner, time), trigger)
    if (!body || edgeDistance(body, position(enemy, trigger)) > mirrorShot.reach!) continue
    const value = mirrorShotValue(battle, actor, mirror, body, enemy, trigger, position,
      forecastBasicCast(actorAtFire, enemy))
    if (value > 0) outcomes.set(enemy, value)
  }
  if (!outcomes.size) return imminent
  const bonus = (enemy: EdgeUnit) => (outcomes.get(enemy) ?? 0) * actor.attack / partner.attack
  const chosen = partnerAction?.(partner, fire, origin, bonus, deploying)
  const selected = chosen?.order === "basic" && unitOf(battle, chosen.target?.id)
  const value = selected ? outcomes.get(selected) ?? 0 : 0
  return Math.max(imminent, value * 2.05 / (1 + (fire - now) * .27))
}

export function liveMirrorValue(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeUnit[], group: SummonGroup, partnerAction: PartnerAction) {
  const partner = unitOf(battle, group.target)
  const mirror = mirrorPosition(group)
  return partner?.hp && isFighter(partner) && mirror ? mirrorOpportunity({ battle, actor, enemies, partnerAction }, partner, mirror, false) : 0
}

interface BasicLane {
  from: EdgePoint
  to: EdgePoint
  enemy: EdgeUnit
  weight: number
  impact: number
}

function basicLanes(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[],
  fresh: boolean, replaced?: SummonGroup): BasicLane[] {
  const now = battle.time
  const position = (unit: EdgeUnit, at: number) => fresh && unit === actor ? actor : future(battle, unit, at - now)
  const protections = () => {
    if (!replaced) return
    const spent = directHitForecast()
    spent.summons.set(replaced.deployment.bodies[0].id, Infinity)
    return spent
  }
  const announced = allies.flatMap(ally => announcedStrikes(battle, ally, now + 1.25, position).flatMap(contact => {
    if (contact.strike.cast.order !== "basic" || contact.at <= now + SPARRING_STEP) return []
    const to = position(ally, contact.at)
    const from = position(contact.source, contact.at)
    const aid = aidBeforeHit(battle, ally, contact.at, position)
    const damage = announcedHit(battle, { ...contact, source: { ...contact.source, ...from } },
      ally, to, position, aid.hp, aid.shield, 0, protections(), aid.defy)
    if (!damage || damage.hpLoss + damage.shieldLoss <= 0) return []
    const weight = (damage.lethal ? 3.3 : 0) + Math.max(0, damage.hpLoss - damage.saveHeal + damage.shieldLoss * .35) / ally.maxHp * 5.2
    return [{ from, to, enemy: contact.source, weight, impact: contact.at }]
  }))
  const expected = enemies.flatMap(enemy => {
    const shared = enemy.id === "boss" ? battle.boss.sharedAt
      : sideOf(battle, enemy.id) === "ally" ? battle.sharedAt : battle.sparring?.sharedAt ?? now
    const ready = Math.max(now + .03, enemy.actionAt, shared, enemy.force ? enemy.force.since + enemy.force.duration : now)
    if (ready > now + 2.65) return []
    const release = position(enemy, ready)
    return allies.flatMap(ally => {
      const aim = position(ally, ready)
      const gap = edgeDistance(release, aim)
      if (!targetable(battle, ally, ready) || gap > attackRange(battle, enemy, ally, ready) || gap < 16) return []
      const impact = ready + (isFighter(enemy) && enemy.range >= 200 ? flightTime(release, aim) : 0)
      const from = position(enemy, impact)
      const to = position(ally, impact)
      const aid = aidBeforeHit(battle, ally, impact, position)
      const damage = estimateDirectHit(battle, { ...enemy, ...from }, ally, 1, "basic", to, impact, aid.shield, { ...aid, spent: protections() })
      const canCast = isFighter(enemy) && enemy.actives.some(skill => attackPower(battle, { ...enemy, ...release }, skill, ally, aim) > 0)
      const likely = damage.lethal ? 1 : canCast ? .22 : .85
      const loss = (damage.hpLoss - damage.saveHeal + damage.shieldLoss * .16) / ally.maxHp
      const weight = likely * (Number(damage.lethal) * 1.9 + loss * (5.2 + .9 * (1 - health(ally)))) /
        (1 + (impact - now) * .4)
      return weight > 0 ? [{ from, to, enemy, weight, impact }] : []
    })
  })
  return [...announced, ...expected]
}

function mirrorLaneValue(line: EdgeArea, lanes: BasicLane[], ready: number, expires: number) {
  const blocked = new Map<EdgeUnit, number>()
  for (const lane of lanes) {
    if (lane.impact < ready || lane.impact >= expires || !firstCrossing(line, lane.from, lane.to)) continue
    blocked.set(lane.enemy, Math.max(lane.weight, blocked.get(lane.enemy) ?? 0))
  }
  const values = [...blocked.values()].sort((a, b) => b - a)
  return (values[0] ?? 0) + (values[1] ?? 0) * .18
}

export function liveMirrorWeaveValue(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[], group: SummonGroup) {
  const [body] = group.deployment.bodies
  const expires = group.until - SUMMON_DISMISS_TIME
  const line = summonLink(group.deployment.bodies, SUMMON_PLANS.mirrorWeave.guard!.reach * 2)
  if (!line || body.actionAt >= expires || body.actionAt > battle.time + 2.65) return 0
  // Score the lanes before applying this line's own protection.
  const lanes = basicLanes(battle, actor, allies, enemies, false, group)
  return mirrorLaneValue(line, lanes, body.actionAt, expires)
}

const mirrorWeave: SkillTactic = {
  prepare(use) {
    const { battle, actor, allies, enemies } = use
    const prior = activeDeployments(battle).find(({ group, deployment }) =>
      group.owner === actor.id && deployment.kind === "mirrorWeave")
    const lanes = basicLanes(battle, actor, allies, enemies, true, prior?.group)
    const aims = lanes.flatMap(({ from, to }) => [
      { at: midpoint(from, to) }, { at: along(to, direction(to, from), Math.min(55, edgeDistance(to, from) * .33)) },
    ])
    const score = ({ at }: AiAim) => {
      const [first, second] = summonSpawns("mirrorWeave", use.actor, at)
      const width = SUMMON_PLANS.mirrorWeave.guard!.reach * 2
      const line = areaOf("L", first, direction(first, second), edgeDistance(first, second), width)
      return mirrorLaneValue(line, lanes, battle.time + SPARRING_STEP, Infinity)
    }
    return { aims, score }
  },
}

function rescueValue(use: SkillUse, target: EdgeUnit, from: EdgePoint, axis: EdgePoint, ready: number, expires: number) {
  const { battle } = use
  const plan = SUMMON_PLANS.rescue
  const motion = plan.motion!
  if (motion.kind !== "follow" || !target.hp || health(target) >= .4) return 0
  const [aid] = plan.actions!
  const at = (after: number) => future(battle, target, after)
  const perch = (position: EdgePoint) => inside(along(position, left(axis), motion.gap))
  const gap = edgeDistance(from, perch(at(ready))) - Math.max(0, aid.reach! - motion.gap)
  const arrival = Math.max(ready, gap / motion.speed, 0)
  if (arrival + .08 >= expires) return 0
  const position = at(arrival)
  const late = edgeDistance(from, perch(position)) - Math.max(0, aid.reach! - motion.gap) > (arrival + .22) * motion.speed
  if (late || edgeDistance(perch(position), position) >= aid.reach!) return 0
  const known = announcedStrikes(battle, target, battle.time + arrival)
  if (known.length && !lifeThroughStrikes(battle, target, known,
    (unit, time) => unit === use.actor ? use.actor : future(battle, unit, time - battle.time)).hp) return 0
  const heal = healForSurvival(use, target, aid.step.operations[0].args[0] / 100, arrival)
  if (heal === undefined) return 0
  const shield = protection(use, target, aid.step.operations[1].args[0] / 100)
  return (.86 + heal + shield) / (1 + arrival * .38)
}

const rescue: SkillTactic = { prepare(use) {
  const { battle, actor, allies } = use
  const plan = SUMMON_PLANS.rescue
  const prior = activeDeployments(battle).find(({ group, deployment }) => group.owner === actor.id && deployment.kind === "rescue")
  const body = prior?.deployment.bodies[0]
  const partner = prior && unitOf(battle, prior.group.target)
  const kept = body?.hp && partner?.hp && prior ? rescueValue(use, partner, body, prior.group.axis,
    Math.max(0, body.actionsAt[0] - battle.time), prior.group.until - SUMMON_DISMISS_TIME - battle.time) : 0
  return { aims: allies.map(target => ({ at: target, target })), score({ target }) {
    if (!target || target === partner && body?.hp) return 0
    const [from] = summonSpawns("rescue", actor, target)
    const value = rescueValue(use, target, from, direction(actor, target), 0, plan.duration)
    return value > kept + .32 ? value - kept * .8 : 0
  } }
} }

const paperBeat: SkillTactic = { prepare(use) {
  const { battle, actor, allies, enemies, skill } = use
  const now = battle.time
  const plan = SUMMON_PLANS.paperBeat
  const prior = activeDeployments(battle).find(({ group, deployment }) => group.owner === actor.id && deployment.kind === "paperBeat")
  const kept = prior ? livePaperValue(battle, prior.group, allies, enemies) : 0
  const contacts = plan.actions!.map(action => ({ action, slot: action.slot!, ready: now + (action.delay ?? 0) }))
  const aims: AiAim[] = []
  const legal = (point: EdgePoint) => {
    const gap = edgeDistance(actor, point)
    return inside(gap > skill.aim.range ? along(actor, direction(actor, point), skill.aim.range - 1) : point, 0)
  }
  const add = (point: EdgePoint) => {
    const at = legal(point)
    if (aims.every(aim => edgeDistance(aim.at, at) >= 16)) aims.push({ at })
  }
  for (const pulse of contacts) {
    const group = pulse.slot === 0 ? allies : enemies
    const positions = group.filter(unit => unit.hp && (unit !== actor || pulse.slot !== 0 || !unit.move))
      .map(unit => future(battle, unit, pulse.ready - now)).filter(at => !isOutside(at))
    for (const { at } of clusterAims(positions, pulse.action.step.selector.size[0] * 1.5)) {
      add(at)
      const align = (desired: EdgePoint) => {
        let aim = desired
        // Formation facing and boundary clamping both depend on the cursor.
        for (let i = 0; i < 2; i++) {
          const spawn = summonSpawns("paperBeat", actor, aim)[pulse.slot]
          aim = legal({ x: aim.x + desired.x - spawn.x, y: aim.y + desired.y - spawn.y })
          add(aim)
        }
      }
      align(at)
      if (pulse.slot === 2 && borderGap(at) < pulse.action.step.operations[0].args[0] + 8) align(along(at, outward(at), -44))
    }
  }
  return { aims, score({ at }) {
    const bodies = summonSpawns("paperBeat", actor, at)
    const value = contacts.reduce((sum, pulse) => sum + paperPulseValue(battle, actor, allies, enemies,
      { ...pulse, at: bodies[pulse.slot] }, now + plan.duration), 0)
    return value > kept + .23 ? value - kept * .65 : 0
  } }
} }

const ensemblePlan = SUMMON_PLANS.ensemble

function ensemblePulse(use: SkillUse, action: SummonAction, body: EdgePoint, ready: number,
  expires: number, live: boolean) {
  const { battle, actor, allies, enemies } = use
  const now = battle.time
  const position = (unit: EdgeUnit, at: number) => unit === actor && !live ? actor : future(battle, unit, at - now)
  const [operation] = action.step.operations
  const radius = action.step.selector.size[0]
  const units = operation.kind === "b" ? allies : enemies
  const source = { ...actor, x: body.x, y: body.y }
  const cast = forecastSkillCast(source, use.skill, source)
  cast.used.delete("manual")
  // A pulse remains ready if its circle is empty. Once a card enters, that
  // first contact determines the value, even when it is already protected.
  for (const time of [ready, ready + .4, ready + .8]) {
    if (time >= expires) break
    const contacts = units.flatMap(unit => {
      if (!unit.hp) return []
      const at = position(unit, time)
      const gap = edgeDistance(body, at)
      return gap <= radius - 2 ? [{ unit, at, gap }] : []
    })
    if (!contacts.length) continue
    let value = 0
    for (const { unit, at, gap } of contacts) {
      const margin = 1 - .30 * (gap / radius) ** 3
      if (operation.kind === "d") {
        const aid = aidBeforeHit(battle, unit, time, position)
        const hit = estimateDirectHit(battle, source, unit, operation.args[0], "skill", at, time, aid.shield, { ...aid, cast })
        value += (hit.hpLoss - hit.saveHeal + .28 * hit.shieldLoss) / actor.attack * margin + (hit.lethal ? 1.5 * margin : 0)
      } else if (operation.kind === "b") {
        const danger = pressure(use, unit, at)
        const added = Math.max(0, unit.maxHp * operation.args[0] / 100 - existingShield(battle, unit, time - now))
        value += added / unit.maxHp * Math.min(6, 1.5 + danger * 2.0) * margin * (danger ? 1 : .12)
      } else {
        const end = previewDirectedShove(battle, unit, at, direction(body, at), operation.args[0], time)
        if (edgeDistance(at, end) <= 10) continue
        if (!isOutside(at) && isOutside(end)) value += 1.1 * margin
        else if (!isOutside(at) && allies.some(ally => {
          const from = position(ally, time)
          const reach = attackRange(battle, ally, unit, time)
          return ally.actionAt <= time + .9 && !isOutside(from) &&
            edgeDistance(from, at) > reach && edgeDistance(from, end) <= reach - 8
        })) value += .55 * margin
        else value += .14 * margin
      }
    }
    return Math.min(3, value) / (1 + .26 * (time - now))
  }
  return 0
}

export function liveEnsembleValue(use: SkillUse, group: SummonGroup) {
  const now = use.battle.time
  const expires = Math.min(now + 3.1, group.until - SUMMON_DISMISS_TIME)
  return ensemblePlan.actions!.reduce((sum, action, index) => {
    const body = group.deployment.bodies[action.slot!]
    return sum + (body.hp ? ensemblePulse(use, action, body, Math.max(now, body.actionsAt[index]), expires, true) : 0)
  }, 0)
}

export function ensembleBodyValue(battle: EdgeBattle, group: SummonGroup, body: EdgeUnit, allies: EdgeFighter[], enemies: EdgeUnit[], delay: number) {
  const owner = unitOf(battle, group.owner)
  const skill = group.deployment.cast.skill
  const index = group.deployment.bodies.findIndex(unit => unit === body)
  const live = group.deployment.bodies[index]
  if (!owner || !isFighter(owner) || !skill || !live?.hp) return 0
  const action = ensemblePlan.actions![index]
  return ensemblePulse({ battle, actor: owner, skill, allies, enemies }, action, body,
    Math.max(battle.time + delay, live.actionsAt[index]), Math.min(battle.time + 3.5, group.until - SUMMON_DISMISS_TIME), true)
}

const ensemble: SkillTactic = { prepare(use) {
  const { battle, actor, allies, enemies, skill } = use
  const now = battle.time
  const aims: AiAim[] = []
  const legal = (at: EdgePoint) => inside(edgeDistance(actor, at) > skill.aim.range
    ? along(actor, direction(actor, at), skill.aim.range - 1) : at, 0)
  for (const action of ensemblePlan.actions!) {
    const units = action.step.selector.units === "a" ? allies : enemies
    const spots = units.map(unit => unit === actor ? actor : future(battle, unit, action.delay ?? 0))
    for (const { at } of clusterAims(spots, action.step.selector.size[0] * 1.25)) {
      const spot = legal(at)
      const body = summonSpawns("ensemble", actor, spot)[action.slot!]
      const offset = legal({ x: spot.x + at.x - body.x, y: spot.y + at.y - body.y })
      for (const point of [spot, offset]) if (aims.every(aim => edgeDistance(aim.at, point) > 14)) aims.push({ at: point })
    }
  }
  return { aims, score({ at }) {
    const bodies = summonSpawns("ensemble", actor, at)
    return ensemblePlan.actions!.reduce((sum, action) =>
      sum + ensemblePulse(use, action, bodies[action.slot!], now + (action.delay ?? 0), now + 3.1, false), 0)
  } }
} }

const [bellSlow, bellPush] = SUMMON_PLANS.bell.actions!
const bellRadius = bellSlow.step.selector.size[0]
const bellSlowTime = bellSlow.delay!
const bellPushTime = bellPush.delay!
const bellSpeedFactor = 1 - bellSlow.step.operations.find(op => op.kind === "slow")!.args[0] / 100
const bellDamage = [bellSlow, bellPush].map(action => action.step.operations.find(op => op.kind === "d")!.args[0])

function liveBellContact(battle: EdgeBattle, group: SummonGroup, enemy: EdgeUnit) {
  const [body] = group.deployment.bodies
  if (!body.hp) return false
  const until = Math.min(group.until - SUMMON_DISMISS_TIME - battle.time, bellPushTime)
  return body.actionsAt.some(ready => {
    const delay = Math.max(SPARRING_STEP, ready - battle.time)
    if (delay >= until) return false
    // A ready pulse can wait for a target to enter the circle.
    for (let at = delay; at < until; at += .12) {
      if (edgeDistance(body, future(battle, enemy, at)) <= bellRadius) return true
    }
    return edgeDistance(body, future(battle, enemy, until)) <= bellRadius
  })
}

const bellFinish: SkillTactic = { adjust({ battle, actor, skill, enemies }) {
  const current = activeDeployments(battle).find(({ group, deployment }) => group.owner === actor.id && deployment.kind === "bell")
  if (!current || !battle.sparring) return
  const opens = battle.time + bellSlowTime + SPARRING_STEP
  const closes = battle.time + bellPushTime + SPARRING_STEP
  const targets = enemies.flatMap(enemy => {
    if (!isFighter(enemy) || !enemy.move || enemy.force || movementStopped(battle, enemy) || enemy.hp > actor.attack ||
      !targetable(battle, enemy, opens) || !targetable(battle, enemy, closes)) return []
    const clocks = sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring!
    if (Math.max(clocks.moveAt, clocks.sharedAt) <= closes || liveBellContact(battle, current.group, enemy)) return []
    const first = future(battle, enemy, opens - battle.time)
    const second = future(battle, enemy, closes - battle.time)
    const slowed = future(battle, enemy, opens - battle.time + (closes - opens) * bellSpeedFactor)
    if ([first, second, slowed].some(at => edgeDistance(actor, at) > skill.aim.range + bellRadius)) return []
    return [{ enemy, first, second, slowed }]
  })
  if (!targets.length) return
  const cast = forecastSkillCast(actor, skill, actor)
  cast.summon = current.group
  const aims = targets.flatMap(({ first, second }) => [{ at: midpoint(first, second) }, { at: second }, { at: first }])
  return { aims, score({ at }) {
    const [body] = summonSpawns("bell", actor, at)
    let value = 0
    for (const { enemy, first, second, slowed } of targets) {
      const reach = Math.max(...[first, second, slowed].map(place => edgeDistance(body, place)))
      if (reach > bellRadius) continue
      const position: PositionAt = (unit, time) => unit === enemy && time === closes ? slowed : future(battle, unit, time - battle.time)
      const summon = { ...cast, from: body, aim: at, outside: isOutside(body) }
      const contacts = [opens, closes].map((time, index): AnnouncedStrike => ({ at: time, source: actor,
        strike: { cast: summon, target: enemy.id, power: bellDamage[index] } }))
      if (!lifeThroughStrikes(battle, enemy, contacts, position).hp) {
        value += 2.4 + .35 * (1 - reach / bellRadius)
      }
    }
    return value
  } }
} }

const summonTactics: Partial<Record<DeploymentKind, SkillTactic>> = {
  gates,
  twinBows,
  rail: summonRail,
  roadBeast,
  returnBeast,
  paperPack: linkedGuardian("paperPack"),
  bodyguard: linkedGuardian("bodyguard"),
  mirror: mirrorFollow,
  mirrorWeave: mirrorWeave,
  paperBeat,
  ensemble,
  bell: bellFinish,
  hexWard: summonWard("hexWard"),
  armorBeast: summonWard("armorBeast"),
  sentry: {
    aims: (use) => clusterAims(use.enemies.map((enemy) => along(future(use.battle, enemy, .35), direction(enemy, use.actor), 145)), 280),
    score(use, { at }) {
      const [spawn] = summonSpawns("sentry", use.actor, at)
      const nearest = Math.min(...use.enemies.map((enemy) => edgeDistance(spawn, future(use.battle, enemy, .35))))
      if (nearest > 190) return 0
      return 1.42 - Math.abs(nearest - 145) / 320
    },
  },
  barricade: {
    aims: ({ enemies }) => enemies.flatMap((enemy) => enemy.move && !enemy.force ? [{ at: midpoint(enemy, enemy.move) }] : []),
    score(use, { at }) {
      const [spawn] = summonSpawns("barricade", use.actor, at)
      return use.enemies.reduce((value, enemy) => {
        if (!enemy.move || enemy.force || isOutside(enemy)) return value
        const axis = direction(enemy, enemy.move)
        const dx = spawn.x - enemy.x, dy = spawn.y - enemy.y
        const forward = dx * axis.x + dy * axis.y
        const across = Math.abs(dx * axis.y - dy * axis.x)
        return forward > 42 && forward <= edgeDistance(enemy, enemy.move) && across < 55 ? value + 1.28 - across / 100 : value
      }, 0)
    },
  },
  ambush: {
    aims: ({ battle, enemies }) => enemies.filter((enemy) => enemy.id === "boss" && !chargeOf(battle, enemy))
      .map((enemy) => ({ at: future(battle, enemy, .25) })),
    score(use, { at }) {
      const [spawn] = summonSpawns("ambush", use.actor, at)
      return use.enemies.some((enemy) => enemy.id === "boss" && edgeDistance(spawn, future(use.battle, enemy, .25)) <= 105) ? 1.5 : 0
    },
  },
  medic: { score: (use, { target }) => target && health(target) < .5 ? 1 + healScore(use.battle, target, .13) : 0 },
  rescue,
  runner: { score(use, { target }) {
    if (!target) return 0
    const { battle, actor, skill } = use
    const cast = forecastSkillCast(actor, skill, target)
    cast.used.delete("manual")
    const [body] = summonSpawns("runner", actor, target)
    return runnerValue(battle, actor, target, cast, body, battle.time, battle.time + SUMMON_PLANS.runner.duration)
  } },
  lasso: { score({ battle, actor, allies, enemies }, { at }) {
    const [body] = summonSpawns("lasso", actor, at)
    return lassoValue(battle, actor, allies, enemies, body)
  } },
  shoreBeast: {
    aims: (use) => clusterAims(use.enemies.map((unit) => future(use.battle, unit, .65)), 250),
    score: (use, { at }) => use.enemies.reduce((score, enemy) => {
      const place = future(use.battle, enemy, .65)
      return !isOutside(place) && edgeDistance(place, at) <= 137 && borderGap(place) <= 122 ?
        score + (borderGap(place) <= 96 ? 1.48 : .83) : score
    }, 0),
  },
}

function lassoValue(battle: EdgeBattle, actor: EdgeFighter, allies: readonly EdgeFighter[], enemies: readonly EdgeUnit[],
  body: EdgePoint, ready = battle.time, expires = battle.time + SUMMON_PLANS.lasso.duration) {
  const { radius } = SUMMON_PLANS.lasso.terrain!
  const now = battle.time
  let best = 0
  for (const enemy of enemies) {
    if (!enemy.hp || isOutside(enemy) || enemy.force || movementStopped(battle, enemy)) continue
    const position = future(battle, enemy, Math.max(0, ready - now))
    if (edgeDistance(body, position) >= radius - 4) continue
    if (enemy.move) {
      if (edgeDistance(body, enemy.move) <= radius + 4) continue
      const length = edgeDistance(position, enemy.move)
      const axis = direction(position, enemy.move)
      const forward = (body.x - position.x) * axis.x + (body.y - position.y) * axis.y
      const across = (body.x - position.x) * axis.y - (body.y - position.y) * axis.x
      const toRim = forward + Math.sqrt(Math.max(0, radius ** 2 - across ** 2))
      const at = Math.max(now, ready) + toRim / movementSpeed(battle, enemy)
      if (toRim > length || at + SPARRING_STEP >= expires) continue
      const stop = along(position, axis, toRim)
      const canFollow = allies.some(ally => {
        const after = Math.max(at, ally.actionAt, ally === actor ? now + actor.actionCooldown : now + COOLDOWN.shared)
        return !ally.force && !isOutside(ally) && after <= at + 1.1 &&
          edgeDistance(future(battle, ally, after - now), stop) <= attackRange(battle, ally, enemy, after) + 12
      })
      best = Math.max(best, (1.42 + (canFollow ? .46 : 0)) / (1 + .22 * (at - now)))
    } else if (enemy.range < 200 && enemy.actionAt <= expires - .4 &&
      allies.some(ally => edgeDistance(position, ally) > attackRange(battle, enemy, ally) + 20 &&
        edgeDistance(body, ally) > radius + 40)) {
      // A melee card still has to leave the ring to reach a target.
      if (!allies.some(ally => edgeDistance(position, ally) <= attackRange(battle, enemy, ally))) best = Math.max(best, .73)
    }
  }
  return best
}

function runnerValue(battle: EdgeBattle, actor: EdgeFighter, target: EdgeUnit, cast: SkillCast, body: EdgePoint, ready: number, expires: number) {
  const now = battle.time
  const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const end = Math.min(expires - SPARRING_STEP, now + 4.2)
  const first = runnerContact(battle, cast, actor, target, body, ready, Math.min(end, now + 1.9), position)
  if (!first) return 0
  const shift = announcedShift(battle, first, target, position)
  const pushedFrom = position(target, first.at)
  const aid = aidBeforeHit(battle, target, first.at, position)
  const direct = lifeThroughStrikes(battle, target, [first], position)
  const after = (unit: EdgeUnit, at: number) => {
    if (unit !== target || !shift || at <= first.at) return position(unit, at)
    const ease = 1 - (1 - clamp((at - first.at) / shift.duration, 0, 1)) ** 3
    return { x: pushedFrom.x + (shift.end.x - pushedFrom.x) * ease, y: pushedFrom.y + (shift.end.y - pushedFrom.y) * ease }
  }
  const later = first.at + SUMMON_PLANS.runner.actions![0].cooldown
  const second = direct.hp > 0 && runnerContact(battle, cast, actor, target, first.strike.cast.from, later, Math.min(end, later + .16), after, first.at)
  const life = second ? lifeThroughStrikes(battle, target, [first, second], after) : direct
  const shove = shift && !isOutside(pushedFrom) && isOutside(shift.end)
  const immediate = (aid.hp - direct.hp + .26 * Math.max(0, aid.shield - direct.shield)) / actor.attack
  const laterValue = Math.min(.65, Math.max(0, (direct.hp - life.hp) / actor.attack)) * .76
  const cooling = second && !life.hp && isFighter(target) &&
    (target.actionAt >= life.downAt || shift && edgeDistance(shift.end, actor) > attackRange(battle, target, actor) + 16)
  return (immediate * 1.48 + laterValue + (!direct.hp ? 2.05 : cooling ? 1.10 : 0) +
    (shove ? .86 : shift ? .30 : 0)) / (1 + .32 * (first.at - now))
}

export function liveRunnerValue(battle: EdgeBattle, actor: EdgeFighter, group: SummonGroup) {
  const [body] = group.deployment.bodies
  const target = unitOf(battle, group.target)
  return target?.hp && body.hp ? runnerValue(battle, actor, target, group.deployment.cast, body, body.actionsAt[0],
    group.until - SUMMON_DISMISS_TIME) : 0
}

export function liveLassoValue(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[], group: SummonGroup) {
  const [body] = group.deployment.bodies
  const expires = group.until - SUMMON_DISMISS_TIME
  return body.hp && body.actionAt < expires ? lassoValue(battle, actor, allies, enemies, body, body.actionAt, expires) : 0
}

export function tacticFor(skill: EdgeActive) {
  return skill.deployment ? summonTactics[skill.deployment] : cardTactics[skill.id]
}
