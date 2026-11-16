import { combatHasRole } from "../combatRules"
import { AI_THINK_INTERVAL, COOLDOWN, MOVE_REACH, SPARRING_STEP, moveLanding, moveProblem, type EdgeBattle, type EdgeFighter, type EdgeOrder, type EdgeUnit } from "../edgeBattle"
import { availablePortalExit, bestPortalAdvance, equippedReach, future, portalOpeningValue, returnAroundShore, returnWalk, walkAt, walksIntoAnnouncedArea, walksIntoShoreBeast, walksIntoWarning, type AdvancePath, type LineDefense } from "./aiMovement"
import { aidFrom } from "./aiRescue"
import { activeShadowFollowUp, basicAttackValue, liveEnsembleValue, liveLassoValue, liveMirrorValue, liveMirrorWeaveValue, livePaperValue, liveRoadBeastValue, liveRunnerValue, liveSpectrumValue, shadowRingHitAdjustment, tacticFor, type AiAim, type PartnerAction, type SkillUse, type SpectrumContact } from "./aiTactics"
import { addForecastGuard, aidBeforeHit, announcedHit, announcedShift, announcedStrikes, displacementPoint, entryFieldContacts, lifeThroughStrikes, positionAfterStrike, rescuePulse, roadBeastRisk, roadBeastThreats, scheduledAid, summonDisruptsCast, type AnnouncedStrike, type TimedAid } from "./aiThreats"
import { assassinChoreography } from "./assassinChoreo"
import { bardChoreography } from "./bardChoreo"
import type { EdgeActive } from "./catalog"
import { dancerChoreography } from "./dancerChoreo"
import { along, areaHits, areaOf, borderGap, clamp, direction, edgeDistance, fieldCrossing, inside, isOnBoard, isOutside, left, outward, rotate, type EdgeArea, type EdgePoint } from "./geometry"
import { paladinChoreography } from "./paladinChoreo"
import type { Operation, Step } from "./program"
import { damageScore, DEBUFFS, healingReceived, matchesCleanse, nearbyBulwark, roleDamageScale, WARDEN_CONTROL } from "./roles"
import { BASIC_PUSH, EXILE, assassinLockAttack, attackRange, basicTarget, chargeOf, dancerMovesBySkill, directHitForecast, estimateDirectHit, firstCrossing, fixedAreaFlight, fixedAreaStrike, fixedSkillWindup, flightTime, forecastBasicCast, forecastSkillCast, healFactors, movementSpeed, movementStopped, predictSkillTargets, previewAssassinLanding, previewContactShift, previewDirectedShove, previewSkillAreas, skillAreaContains, skillCastProblem, targetable, targetedFlight } from "./runtime"
import { isFighter, sameSide, sideOf, unitOf, type Buff } from "./state"
import { spellbreakerChoreography } from "./spellbreakerChoreo"
import { SUMMON_PLANS } from "./summonPlans"
import { activeDeployments, summonActionArea, summonSpawns, summonTerrainInPath, type SummonGroup } from "./summons"
import { wardenChoreography } from "./wardenChoreo"
import { warlockChoreography } from "./warlockChoreo"

export interface AiAttack {
  order: EdgeOrder
  target?: EdgeUnit
  at: EdgePoint
  value: number
}

export interface TeamAttack { actor: EdgeFighter; intent: AiAttack }
export type PressureMove = { actor: EdgeFighter; point: EdgePoint; value: number }

const heals = new Set(["h", "missing", "regen", "returnhp", "rewind", "poolheal", "shareheal"])
const protects = new Set(["b", "guard", "exguard", "res", "armor", "anti", "split", "reflect", "defy", "phase", "allyshield"])
const boosts = new Set(["q", "qp", "qr", "amp", "ampq", "choose", "range", "score", "add", "addp", "aimp", "glide"])
const controls = new Set(["slow", "root", "stall", "freeze", "weak", "vuln", "short", "tether", "taunt"])
type SkillPositions = ReadonlyMap<Step, (unit: EdgeUnit) => EdgePoint>
const fixedSteps = new WeakMap<EdgeActive, ReadonlyMap<Step, number>>()

function impactSteps(skill: EdgeActive) {
  const existing = fixedSteps.get(skill)
  if (existing) return existing
  const windup = fixedSkillWindup(skill)
  const times = new Map<Step, number>()
  if (windup !== undefined) for (const step of skill.steps) {
    const { units, shape, anchor, flags } = step.selector
    const delay = windup + step.delay
    if (delay < .14 || step.zone || step.watch || !shape || !"eaob".includes(units) ||
      anchor && anchor !== "p" && anchor !== "o" || flags.some(flag => flag !== "card")) continue
    times.set(step, delay)
  }
  fixedSteps.set(skill, times)
  return times
}

function forecastImpact({ battle, actor, skill, allies, enemies }: SkillUse, steps: ReadonlyMap<Step, number>) {
  if (!steps.size) return
  // Casting stops the caster's own walk. Keep the other known movement orders.
  const moving = [...allies, ...enemies].filter(unit => unit !== actor && (unit.force || unit.move))
  if (!moving.length) return
  const byDelay = new Map<number, (unit: EdgeUnit) => EdgePoint>()
  const positions = new Map<Step, (unit: EdgeUnit) => EdgePoint>()
  const aims: AiAim[] = []
  const groups = new Set<boolean>()
  for (const [step, delay] of steps) {
    let position = byDelay.get(delay)
    if (!position) {
      const known = new Map(moving.map(unit => [unit, future(battle, unit, delay)]))
      position = unit => known.get(unit) ?? unit
      byDelay.set(delay, position)
    }
    positions.set(step, position)
    const hostile = step.selector.units === "e"
    if (groups.has(hostile)) continue
    const group = hostile ? enemies : allies
    if (!group.some(unit => edgeDistance(unit, position(unit)) > 1)) continue
    groups.add(hostile)
    const predicted = group.map(position)
    const { shape, anchor } = step.selector
    const casterLine = skill.aim.mode === "point" && shape === "L" && (!anchor || anchor === "o")
    // A point-aimed line can stop at the cursor. Leave a little room beyond the
    // expected contact so a one-frame difference cannot put it past the tip.
    const leadAim = (at: EdgePoint) => ({ at: casterLine ? along(at, direction(actor, at), 22) : at })
    for (const [index, at] of predicted.entries()) {
      if (edgeDistance(at, group[index]) > 1) aims.push(leadAim(at))
      for (const other of predicted.slice(index + 1)) if (edgeDistance(at, other) < 370) {
        aims.push(leadAim({ x: (at.x + other.x) / 2, y: (at.y + other.y) / 2 }))
      }
    }
  }
  return { aims, positions }
}

function aimPoints({ actor, skill, allies, enemies }: SkillUse): AiAim[] {
  const { mode } = skill.aim
  if (mode === "self") return [{ at: actor, target: actor }]
  if (mode === "enemy" || mode === "outside") {
    return enemies.map((target) => ({ at: target, target }))
  }
  if (mode === "ally" || mode === "other") {
    return allies.filter((ally) => mode !== "other" || ally !== actor).map((target) => ({ at: target, target }))
  }
  const points: AiAim[] = [...enemies, ...allies].map((target) => ({ at: target, target }))
  for (const group of [enemies, allies]) {
    if (group.length < 2) continue
    const sum = group.reduce((total, unit) => ({ x: total.x + unit.x, y: total.y + unit.y }), { x: 0, y: 0 })
    points.push({ at: { x: sum.x / group.length, y: sum.y / group.length } })
  }
  return points
}

function fitAim(actor: EdgeFighter, skill: EdgeActive, { at, target }: AiAim): AiAim {
  const { mode, range, insideOnly } = skill.aim
  const distance = edgeDistance(actor, at)
  const aim = mode === "point" && distance > range ? along(actor, direction(actor, at), Math.max(0, range - 1)) : at
  return { at: insideOnly ? inside(aim, 0) : aim, target: aim === at ? target : undefined }
}

function lineAim(battle: EdgeBattle, actor: EdgeFighter, skill: EdgeActive, aim: AiAim, opponent?: EdgeUnit): AiAim {
  const art = paladinChoreography(skill.id)
  const sparring = battle.sparring
  const target = aim.target
  if (art?.motif !== "horizon" || !sparring || !target || sameSide(battle, actor.id, target.id) ||
    target !== opponent && (target.hp > actor.attack * .82 || target.shield > 0 && target.shieldUntil > battle.time + (art.windup ?? 0)) ||
    edgeDistance(actor, aim.at) < 3) return aim
  const clocks = sideOf(battle, target.id) === "ally" ? battle : sparring
  const response = Math.max(battle.time, clocks.moveAt, clocks.sharedAt)
  const timeToMove = battle.time + (art.windup ?? 0) - response
  if (timeToMove <= .1 || target.move || target.force || movementStopped(battle, target)) return aim
  // This line ends at the cursor. An opponent on the tip only needs to move
  // a pixel to escape, even if the rest of the line was aimed correctly.
  const extended = along(aim.at, direction(actor, aim.at), movementSpeed(battle, target) * timeToMove)
  return { at: isOutside(extended) ? fieldCrossing(actor, extended) : extended, target }
}

function threatened(battle: EdgeBattle, ally: EdgeUnit, enemies: EdgeUnit[]) {
  return enemies.some((enemy) => edgeDistance(enemy, ally) <= attackRange(battle, enemy, ally) + 72)
}

function effectValue(battle: EdgeBattle, actor: EdgeFighter, target: EdgeUnit, op: Operation, danger: boolean, delay: number) {
  const health = target.hp / target.maxHp
  const value = op.args[0] ?? 0
  if (!sameSide(battle, actor.id, target.id)) {
    if (op.kind === "d") return damageScore(battle, actor, target, value)
    if (op.kind === "dot") return Math.min(1.6, value * Math.max(1, op.args[2] ?? 1))
    if (op.kind === "p" || op.kind === "l") return Math.min(.8, value / 180) * (borderGap(target) < value ? 1.6 : 1)
    if (op.kind === "i") return (chargeOf(battle, target)?.until ?? 0) > battle.time + delay ? 1.6 : 0
    if (op.kind === "strip" || op.kind === "take") return target.shield > 0 ? .7 : .1
    return controls.has(op.kind) ? .42 : 0
  }
  const fullHealthShield = op.kind === "h" && op.style === "fullward" && health >= 1
  if (heals.has(op.kind) && !fullHealthShield) {
    const [, next, extra] = op.args
    const percent = op.kind === "missing" ? Math.min(next ?? 100, value * (1 - health) + (extra ?? 0))
      : (value || 15) + (op.style === "lowhealth" && health * 100 < (extra ?? 45) ? next ?? 0 : 0)
    return Math.min(1 - health, percent / 100 * healingReceived(battle, target)) * (health < .4 ? 10 : 6)
  }
  if (protects.has(op.kind) || fullHealthShield) {
    if (!danger || target.shieldUntil > battle.time && target.shield > .06 * target.maxHp) return 0
    return .38 + (1 - health) * .9
  }
  if (boosts.has(op.kind)) return danger && target.actionAt <= battle.time + 2.8 ? .56 : 0
  if (op.kind === "clean") {
    return battle.runtime.buffs.some((buff) => buff.target === target.id && buff.until > battle.time &&
      DEBUFFS.has(buff.kind) && matchesCleanse(buff.kind, op.style)) ? 1.25 : 0
  }
  if (op.kind === "swap" || op.kind === "back") return target !== actor && danger && health < .42 ? 1.1 : 0
  return 0
}

function keepsDeployment(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[]) {
  return activeDeployments(battle).find(({ group, deployment, plan }) => {
    if (group.owner !== actor.id || group.until - battle.time <= 1.25 ||
      !deployment.bodies.some((body) => body.hp > body.maxHp * .18)) return false
    const needsBothEnds = plan.gate || plan.guard?.type === "line" || plan.actions?.every(action => action.at === "link")
    if (needsBothEnds && deployment.bodies.some(body => !body.hp)) return false
    if (plan.gate) {
      const [entry, exit] = deployment.bodies
      const clocks = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring ?? battle
      const ready = Math.max(battle.time + COOLDOWN.shared, clocks.moveAt, entry.actionAt)
      if (ready >= group.start + plan.duration) return false
      return allies.some(ally => {
        if (ally.force || movementStopped(battle, ally)) return false
        if (ally.move && (edgeDistance(ally.move, entry) < plan.gate!.radius || edgeDistance(ally.move, exit) < plan.gate!.radius)) return true
        const delay = ready - battle.time
        const at = ally === actor ? actor : future(battle, ally, delay)
        if (ally.move && edgeDistance(ally.move, at) > 8) return false
        const traveler = { ...ally, ...at, move: null, actionAt: ally === actor ? battle.time + actor.actionCooldown : ally.actionAt }
        const route = bestPortalAdvance(battle, traveler, enemies, ready, actor.id)
        // Use the same minimum attack gain as the movement decision.
        return route && portalOpeningValue(route) > 0
      })
    }
    if (deployment.kind === "hexWard" || deployment.kind === "armorBeast") {
      const body = deployment.bodies[0]
      const radius = plan.aura!.radius + 48
      return body.phase === "out" || allies.some(ally =>
        edgeDistance(body, ally) <= radius || ally.move && edgeDistance(body, ally.move) <= radius)
    }
    if (deployment.kind === "bell") {
      const body = deployment.bodies[0]
      const radius = plan.actions![0].step.selector.size[0] + 38
      return enemies.some(enemy => edgeDistance(body, enemy) <= radius ||
        enemy.move && edgeDistance(body, enemy.move) <= radius)
    }
    if (deployment.kind === "paperBeat") return livePaperValue(battle, group, allies, enemies) >= .45
    if (deployment.kind === "twinBows" || deployment.kind === "rail") {
      const [body] = deployment.bodies
      const delay = Math.max(.35, body.actionsAt[0] - battle.time)
      const area = summonActionArea(battle, group, body, plan.actions![0])
      const units = deployment.kind === "twinBows" ? enemies : allies
      return !!area && delay + battle.time < group.start + plan.duration && units.some(unit =>
        areaHits(area, future(battle, unit, delay)) && (deployment.kind !== "rail" || unit.move ||
          enemies.some(enemy => edgeDistance(unit, enemy) > attackRange(battle, unit, enemy) + 50 && edgeDistance(unit, enemy) < 520)))
    }
    if (deployment.kind === "lasso" || deployment.kind === "runner" || deployment.kind === "mirror" || deployment.kind === "roadBeast" ||
      deployment.kind === "mirrorWeave" || deployment.kind === "ensemble") return false
    const followsTarget = plan.motion?.kind === "follow" || plan.motion?.kind === "chase"
    return !followsTarget || group.target !== undefined && !!unitOf(battle, group.target)?.hp
  })?.deployment.kind
}

function deploymentValue({ battle, actor, skill, allies, enemies }: SkillUse, { at, target }: AiAim) {
  const kind = skill.deployment!
  const plan = SUMMON_PLANS[kind]
  const spawns = summonSpawns(kind, actor, at)
  const actions = plan.actions ?? []
  const offensive = actions.filter(({ step }) => step.operations.some(({ kind }) => kind === "d" || kind === "p" || kind === "l" || controls.has(kind)))
  const threatRadius = Math.max(plan.terrain?.radius ?? 0, plan.lure ?? 0, ...offensive.map(({ step, reach }) =>
    Math.max(reach ?? 0, step.selector.size[0] ?? 0, 95)))
  const reach = plan.motion?.kind === "chase" || plan.motion?.kind === "leap" ? Math.max(threatRadius, 245) : threatRadius
  const hits = reach > 0 ? enemies.filter((enemy) => spawns.some((spawn) => edgeDistance(spawn, enemy) <= reach)).length : 0
  const friends = allies.filter((ally) => target === ally || spawns.some((spawn) => edgeDistance(spawn, ally) <= (plan.aura?.radius ?? 135)))
  const healing = actions.some(({ step }) => step.operations.some(({ kind }) => heals.has(kind)))
  const aid = friends.reduce((score, ally) => {
    const injured = ally.hp / ally.maxHp < .63
    const danger = threatened(battle, ally, enemies)
    return score + (healing && injured ? 1.4 : danger && (plan.guard || plan.aura?.side === "ally" || actions.length > offensive.length) ? .58 : 0)
  }, 0)
  return Math.max(hits ? .99 + .38 * hits : 0, aid)
}

function skillValue(use: SkillUse, aim: AiAim, times?: ReadonlyMap<Step, number>, positions?: SkillPositions,
  secured?: ReadonlySet<EdgeUnit>) {
  const { battle, actor, skill, enemies } = use
  if (skill.deployment) return deploymentValue(use, aim)
  let total = 0
  const steps = predictSkillTargets(battle, actor, skill, aim.at, aim.target, positions)
  for (const { step, targets } of steps) {
    // A follow-up centered on the first hit cannot happen if the first strike misses.
    if (step.selector.anchor === "f" && step !== steps[0].step && !steps[0].targets.length) continue
    const delay = times?.get(step) ?? step.delay
    let value = 0
    for (const target of targets) {
      if (secured?.has(target)) continue
      const friendly = sameSide(battle, actor.id, target.id)
      const danger = friendly && threatened(battle, target, enemies)
      for (const op of step.operations) value += effectValue(battle, actor, target, op, danger, delay)
    }
    total += value * (step.watch ? .75 : 1) / (1 + delay * .55)
  }
  return total
}

function castTiming(battle: EdgeBattle, actor: EdgeFighter, skill: EdgeActive, target: EdgeUnit | undefined,
  standing: (unit: EdgeUnit, time: number) => EdgePoint, now = battle.time, aim?: EdgePoint) {
  const assassin = assassinChoreography(skill.id)
  const warlock = warlockChoreography(skill.id)
  const art = assassin ?? warlock
  if (!art) return
  const release = now + Math.max(.001, art.windup)
  const enemyLock = skill.aim.mode === "enemy" || assassin && skill.aim.mode === "outside"
  const atLock = enemyLock && target ? standing(target, release) : undefined
  if (enemyLock && (!target || !atLock || warlock && !targetable(battle, target, release) ||
    !(skill.aim.mode === "outside" && isOutside(atLock)) && edgeDistance(actor, atLock) > skill.aim.range)) return null
  if (art.delivery && atLock) {
    const flight = targetedFlight(assassin ? "assassin" : "warlock", edgeDistance(actor, atLock))
    const delay = assassin ? Math.max(SPARRING_STEP, skill.steps[0].delay) : 0
    return { release, impact: release + flight + delay, position: standing }
  }
  // A dash that only strikes on arrival needs the whole route to stay open.
  if (assassin?.travel && enemyLock && target && atLock && skill.steps[0].operations.some(op => op.kind === "dash")) {
    const landing = previewAssassinLanding(battle, actor, skill, target, atLock, aim)
    if (!landing && assassin.motif !== "sideflash") return null
    const end = landing ?? actor
    const travel = edgeDistance(actor, end) >= 3 ? assassin.travel : 0
    const arrival = release + travel
    if (edgeDistance(end, standing(target, arrival)) > Math.min(120, skill.aim.range)) return null
    const position = (unit: EdgeUnit, time: number) => {
      if (unit !== actor || time <= release) return standing(unit, time)
      if (time >= arrival) return end
      const progress = 1 - (1 - (time - release) / travel) ** 3
      return { x: actor.x + (end.x - actor.x) * progress, y: actor.y + (end.y - actor.y) * progress }
    }
    return { release: arrival, impact: arrival, position, dashAt: travel ? release : undefined }
  }
  const lock = assassin && assassinLockAttack(skill)
  const impact = lock ? release + Math.max(SPARRING_STEP, lock.delay) : undefined
  const delayedImpact = assassin?.motif === "boundaryexec" ? release + skill.steps[0].delay : undefined
  return { release: impact ?? release, impact: impact ?? delayedImpact, position: standing }
}

export function chooseAiAttack(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[],
  supportOnly = false): AiAttack | undefined {
  return pickAttack(battle, actor, allies, enemies, undefined, true, supportOnly)
}

function readyAreaStrike(battle: EdgeBattle, team: EdgeFighter[], opponents: EdgeUnit[]) {
  if (!battle.sparring) return
  const now = battle.time
  const foeShared = sideOf(battle, team[0].id) === "ally" ? battle.sparring.sharedAt : battle.sharedAt
  if (foeShared > now) return
  const targets = team.filter(unit => targetable(battle, unit))
  if (!targets.some(unit => unit.hp <= unit.maxHp * .58)) return
  const fighters = opponents.filter(isFighter)
  let chosen: TeamAttack | undefined
  for (const actor of fighters) {
    if (!actor.hp || actor.force || isOutside(actor) || actor.actionAt > now || actor.move && !movementStopped(battle, actor)) continue
    // Use the ordinary opponent scoring and the current board. Suppress its
    // own speculative support forecast so evaluating a reply cannot recurse.
    const intent = pickAttack(battle, actor, fighters, targets, undefined, false)
    if (intent && (!chosen || intent.value > chosen.intent.value)) chosen = { actor, intent }
  }
  if (!chosen || chosen.intent.order === "basic") return
  const { actor, intent } = chosen
  const skill = actor.actives[intent.order === "skill" ? 0 : 1]
  const [step] = skill.steps
  const windup = fixedSkillWindup(skill)
  if (!step || windup === undefined || windup + step.delay < .36) return
  const at = now + windup + step.delay
  const area = previewSkillAreas(battle, actor, skill, intent.at, intent.target)[0]
  const cast = { ...forecastSkillCast(actor, skill, actor), id: battle.runtime.sequence + 1, aim: intent.at, issuedAt: now }
  const strike = fixedAreaStrike(cast, step, area, true)
  if (!strike) return
  return { first: { at, source: actor, strike }, actor, skill, windup }
}

function forecastReadyAreaReply(battle: EdgeBattle, team: EdgeFighter[], opponents: EdgeUnit[]): SkillUse["pressureReply"] {
  const reply = readyAreaStrike(battle, team, opponents)
  if (!reply) return
  const { first, actor, skill, windup } = reply
  const { at, strike: { cast } } = first
  const art = warlockChoreography(skill.id)
  return (defender, until, position) => {
    const place = position(defender, at)
    if (at > until || !announcedHit(battle, first, defender, place, position)) return []
    const second = skill.steps[1]
    if (!second || art?.motif !== "fault" && art?.motif !== "starfallring") return [first]
    const followAt = battle.time + windup + second.delay
    if (followAt > until) return [first]
    // Fault places each fissure at a real first hit. Starfall's inner circle
    // has the same cast and timing as the outer ring.
    const center = art.motif === "fault" ? place : cast.aim
    const followArea = areaOf("C", center, direction(cast.from, center), second.selector.size[0])
    const follow = fixedAreaStrike(cast, { ...second, selector: { ...second.selector, anchor: undefined } }, followArea, false)
    return follow ? [first, { at: followAt, source: actor, strike: follow }] : [first]
  }
}

export function basicCanFinish(battle: EdgeBattle, actor: EdgeFighter, target: EdgeUnit,
  position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)) {
  if (!isFighter(target) || target.hp > actor.attack * 2 ||
    battle.runtime.buffs.some(buff => buff.kind === "choose" && buff.target === actor.id && buff.until > battle.time)) return false
  const impact = battle.time + (actor.range >= 200 ? flightTime(actor, target) : 0)
  const aid = aidBeforeHit(battle, target, impact, position)
  return estimateDirectHit(battle, actor, target, 1, "basic", position(target, impact), impact, aid.shield,
    { ...aid, cast: forecastBasicCast(actor, target) }).lethal
}

function pickAttack(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[],
  partnerBonus?: (enemy: EdgeUnit) => number, forecastPressure = true, supportOnly = false): AiAttack | undefined {
  const now = battle.time
  const pending = battle.runtime.pending.some(job => job.strike)
  const basicScores = new Map<EdgeUnit, number>()
  const confirmedFinishes = new Set<EdgeUnit>()
  const finishingBonus = 3.2
  const standing = (unit: EdgeUnit, time: number) => unit === actor ? actor : future(battle, unit, time - now)
  const reserved = new Map<EdgeUnit, number>()
  const fallsBefore = (target: EdgeUnit, impact: number) => {
    if (!pending) return false
    let downAt = reserved.get(target)
    if (downAt === undefined) {
      const defense = sideOf(battle, target.id) === "ally" ? battle : battle.sparring ?? battle.boss
      // A launched shot, or a committed area before a defensive order is
      // available, can already have secured this kill.
      const contacts = announcedStrikes(battle, target, now + 1, standing).filter(({ at, strike }) =>
        "area" in strike ? !strike.needsOwner && at < defense.sharedAt
          : strike.range === undefined && !strike.needsUnforcedOwner)
      const path = contacts.length && positionAfterStrike(battle, target, contacts, standing)
      downAt = path ? lifeThroughStrikes(battle, target, contacts, path.position).downAt : Infinity
      reserved.set(target, downAt)
    }
    return downAt + SPARRING_STEP * 2 < impact
  }
  const boostedBasic = actor.range >= 200 && battle.runtime.buffs.some(buff =>
    buff.target === actor.id && buff.kind === "choose" && buff.until > now)
  const shadowFields = battle.runtime.fields.filter(field => field.mode === "shadowpush" && field.until > now &&
    field.cast.owner !== actor.id && sameSide(battle, actor.id, field.cast.owner) && field.cast.target !== undefined &&
    !field.seen.has(field.cast.target))
  const comboBonus = (target: EdgeUnit, beat: AnnouncedStrike) => Math.max(0, ...shadowFields.flatMap(field =>
    field.cast.target === target.id ? [activeShadowFollowUp(battle, field, target, beat, standing)] : []))
  const upgradedBasic = shadowFields.length > 0 && battle.runtime.buffs.some(buff => buff.target === actor.id && buff.kind === "choose" && buff.until > now)
  const basicScore = (target: EdgeUnit) => {
    const known = basicScores.get(target)
    if (known !== undefined) return known
    const at = now + (actor.range >= 200 ? flightTime(actor, target) : 0)
    const base = actor.range >= 200 && !boostedBasic && fallsBefore(target, at)
      ? 0 : basicAttackValue(battle, actor, target, enemies, allies, !partnerBonus) + (partnerBonus?.(target) ?? 0)
    const value = base > 0 && shadowFields.some(field => field.cast.target === target.id) && !upgradedBasic ? base + comboBonus(target, {
      at, source: actor, strike: { cast: { ...forecastBasicCast(actor, target), id: battle.runtime.sequence + 1 },
        target: target.id, power: 1 },
    }) : base
    basicScores.set(target, value)
    if (value > 0 && basicCanFinish(battle, actor, target, standing)) confirmedFinishes.add(target)
    return value
  }
  const basic = supportOnly ? undefined
    : basicTarget(battle, actor, target => basicScore(target) + (confirmedFinishes.has(target) ? finishingBonus : 0))
  const basicValue = basic ? basicScore(basic) : 0
  const finishing = basic && confirmedFinishes.has(basic)
  // A lone melee card can finish now, before the enemy side can dodge or heal.
  if (finishing && actor.range < 200 && allies.length === 1) {
    return { order: "basic", at: basic, target: basic, value: basicValue + finishingBonus }
  }
  let choice: AiAttack | undefined = basic && basicValue > 0 ? { order: "basic", at: basic, target: basic, value: basicValue } : undefined
  const minimum = .48
  const partnerAction: PartnerAction | undefined = !supportOnly && !partnerBonus && actor.actives.some(skill => skill.deployment === "mirror")
    ? (partner, at, origin, bonus, deploying) => predictPartnerAction(battle, actor, partner, allies, enemies, at, origin, bonus, deploying) : undefined
  const planSummon = !supportOnly && !partnerBonus && !finishing && actor.actives.some(skill => skill.deployment)
  const keepSummon = planSummon && keepsDeployment(battle, actor, allies, enemies)
  const replacing = planSummon && actor.actives.some(skill =>
    skill.deployment === "lasso" || skill.deployment === "runner" || skill.deployment === "roadBeast" || skill.deployment === "mirrorWeave" ||
    skill.deployment === "mirror" || skill.deployment === "ensemble") &&
    activeDeployments(battle).find(({ group }) => group.owner === actor.id)
  let currentDeployment = 0
  if (replacing) {
    const { group, deployment } = replacing
    if (deployment.kind === "lasso") currentDeployment = liveLassoValue(battle, actor, allies, enemies, group)
    if (deployment.kind === "runner") currentDeployment = liveRunnerValue(battle, actor, group)
    if (deployment.kind === "roadBeast") currentDeployment = liveRoadBeastValue(battle, actor, allies, group)
    if (deployment.kind === "mirrorWeave") currentDeployment = liveMirrorWeaveValue(battle, actor, allies, enemies, group)
    if (deployment.kind === "mirror" && partnerAction) currentDeployment = liveMirrorValue(battle, actor, enemies, group, partnerAction)
    const skill = deployment.cast.skill
    if (deployment.kind === "ensemble" && skill) currentDeployment = liveEnsembleValue({ battle, actor, skill, allies, enemies }, group)
  }
  const gatesActive = planSummon && actor.actives.some(skill => skill.deployment === "gates") &&
    activeDeployments(battle).some(({ group, deployment, plan }) => plan.gate && group.owner === actor.id &&
      group.start + plan.duration > battle.time + COOLDOWN.shared &&
      deployment.bodies.every(body => body.hp > 0))
  const opponent = allies.length === 1 && enemies.length === 1 ? enemies[0] : undefined
  const healingNeeded = allies.some(unit => unit.hp < unit.maxHp * .97) || pending
  const spectra = healingNeeded && forecastPressure && !partnerBonus ? battle.runtime.fields.filter(field =>
    field.cast.skill?.id === "bard/Prismatic/A4" && sameSide(battle, field.cast.owner, actor.id) &&
    field.until > now && !field.seen.has(actor.id) && edgeDistance(field.area.center, actor) <= 340) : []
  for (const [index, skill] of actor.actives.entries()) {
    if (!skill.steps.length && !skill.deployment) continue
    if (supportOnly && (skill.deployment || skill.aim.mode === "enemy" || skill.aim.mode === "outside" ||
      !skill.steps.some(step => !step.watch && "staobgm".includes(step.selector.units) &&
        step.operations.some(({ kind }) => heals.has(kind) || protects.has(kind) || kind === "wall")))) continue
    if ((partnerBonus || finishing) && skill.deployment) continue
    const replacesMobility = keepSummon === "gates" && skill.deployment === "paperPack"
    const relocatesGuard = skill.deployment === keepSummon &&
      (skill.deployment === "paperPack" || skill.deployment === "bodyguard" || skill.deployment === "rescue")
    const relocatesPaper = keepSummon === "paperBeat" && skill.deployment === "paperBeat"
    const relocatesBell = keepSummon === "bell" && skill.deployment === "bell"
    if (skill.deployment && (keepSummon && !replacesMobility && !relocatesGuard && !relocatesPaper && !relocatesBell ||
      gatesActive && skill.deployment === "gates")) continue
    const pressureReply = forecastPressure && !partnerBonus && dancerChoreography(skill.id)?.motif === "reversePrint"
      ? forecastReadyAreaReply(battle, allies, enemies) : undefined
    const manualContact: SkillUse["manualContact"] = forecastPressure && !partnerBonus && paladinChoreography(skill.id)?.motif === "chorus"
      ? (fighter, window, useful) => firstManualContact(battle, fighter, enemies, window, standing, useful,
        start => predictPartnerAction(battle, actor, fighter, allies, enemies, start, standing(fighter, start), undefined, true))
      : undefined
    const spectrumPlans = forecastPressure && !partnerBonus && skill.id === "bard/Prismatic/A4"
      ? (opens: number, closes: number) => planSpectrumExchanges(battle, actor, allies, enemies, opens, closes, standing) : undefined
    const horizonImpact = pending && skill.id === "warlock/Prismatic/A3"
      ? now + fixedSkillWindup(skill)! + skill.steps[0].delay : undefined
    const secured = horizonImpact === undefined ? undefined : new Set(enemies.filter(target => fallsBefore(target, horizonImpact)))
    const use = { battle, actor, skill, allies,
      enemies: secured?.size ? enemies.filter(enemy => !secured.has(enemy)) : enemies,
      partnerAction, pressureReply, manualContact, spectrumPlans }
    const breaker = pending ? spellbreakerChoreography(skill.id) : undefined
    if (breaker && !breaker.travel) {
      const release = now + breaker.windup + skill.steps[0].delay
      const incoming = announcedStrikes(battle, actor, release - SPARRING_STEP, standing)
      if (incoming.length && !lifeThroughStrikes(battle, actor, incoming, standing).hp) continue
    }
    const tactic = tacticFor(skill)
    const prepared = tactic && "prepare" in tactic ? tactic.prepare(use) : undefined
    const adjustment = tactic && "adjust" in tactic ? tactic.adjust(use) : undefined
    if (relocatesBell && !adjustment) continue
    const direct = tactic && "score" in tactic ? tactic : undefined
    const times = !prepared && !direct ? impactSteps(skill) : undefined
    const forecast = times && forecastImpact(use, times)
    const aims = prepared?.aims ?? direct?.aims?.(use) ?? aimPoints(use)
    const pushLead = shadowFields.length ? fixedSkillWindup(skill) : undefined
    const first = skill.steps[0]
    const push = pushLead === undefined ? undefined : first?.operations.find(op => op.kind === "p" && op.style !== "pct")
    const pushAt = now + (pushLead ?? 0) + (first?.delay ?? 0)
    const shadowTargets = push ? shadowFields.flatMap(field => {
      const target = enemies.find(unit => unit.id === field.cast.target)
      if (!target || pushAt >= field.until) return []
      const contacts = announcedStrikes(battle, target, pushAt - SPARRING_STEP / 2, standing)
      const approach = positionAfterStrike(battle, target, contacts, standing)
      if (!approach) return []
      const place = approach.position(target, pushAt)
      const doomed = skill.id === "warlock/Prismatic/A2" && fallsBefore(target, pushAt)
      const canRelay = !doomed && !areaHits(field.area, place) &&
        edgeDistance(field.area.center, place) <= field.step.selector.size[0] + push.args[0] + 10
      if (!canRelay && !doomed) return []
      return [{ field, target, place, position: approach.position, canRelay, doomed }]
    }) : []
    const trapAims = first?.selector.shape === "C" ? shadowTargets.flatMap(({ place, field, canRelay }) => {
      if (!canRelay) return []
      const axis = direction(field.area.center, place)
      return [-25, 0, 25].map(angle => ({ at: along(place, rotate(axis, angle), first.selector.size[0] * .60) }))
    }) : []
    const candidates = forecast?.aims.length || trapAims.length ? [...(forecast?.aims ?? []), ...aims, ...trapAims] : aims
    for (const candidate of adjustment?.aims.length ? [...candidates, ...adjustment.aims] : candidates) {
      const aim = fitAim(actor, skill, lineAim(battle, actor, skill, candidate, opponent))
      if (!isOnBoard(aim.at) || skillCastProblem(battle, actor, skill, aim.at, aim.target)) continue
      const tacticalValue = adjustment?.score(aim) ?? 0
      if (relocatesBell && tacticalValue <= 0) continue
      const expected = prepared ? prepared.score(aim) : direct ? direct.score(use, aim)
        : skillValue(use, aim, times, forecast?.positions, secured)
      let combo = 0
      let ring = 0
      if (shadowTargets.length) {
        const adjusted = new Set<EdgeUnit>()
        const area = previewSkillAreas(battle, actor, skill, aim.at, aim.target)[0]
        const cast = { ...forecastSkillCast(actor, skill, actor), id: battle.runtime.sequence + 1,
          aim: aim.at, target: aim.target?.id, issuedAt: now }
        const strike = fixedAreaStrike(cast, first, area, true)
        if (area && strike) for (const { field, target, place, position, canRelay, doomed } of shadowTargets) {
          const contact = { at: pushAt, source: actor, strike }
          if (!adjusted.has(target)) {
            ring += shadowRingHitAdjustment(use, target, contact, standing, position, doomed)
            adjusted.add(target)
          }
          if (canRelay && skillAreaContains(cast, first.selector.shape, area, place))
            combo = Math.max(combo, activeShadowFollowUp(battle, field, target, contact, standing))
        }
      }
      const order = index ? "skill2" : "skill"
      let value = expected + combo + ring + tacticalValue - (skill.deployment ? currentDeployment : 0)
      if (spectra.length && value > .28 && value + 2.8 > (choice?.value ?? minimum) && skill.id !== "bard/Prismatic/A4") {
        const hit = spectrumSkillContact(battle, actor, enemies, { ...aim, order, value }, now, now + 1.85, standing)
        if (hit) for (const field of spectra) value += .9 * liveSpectrumValue(battle, field, allies, hit, standing)
      }
      if (value <= (choice?.value ?? minimum) || replacesMobility && value < 1.65) continue
      const contact = castTiming(battle, actor, skill, aim.target, standing, now, aim.at)
      if (contact === null) continue
      if (contact) {
        const { release, position, dashAt, impact } = contact
        if (summonDisruptsCast(battle, actor, release, position, dashAt)) continue
        const incoming = pending ? announcedStrikes(battle, actor, release + 1e-6, position) : []
        if (incoming.length && (!lifeThroughStrikes(battle, actor, incoming, position).hp || incoming.some(hit => {
          const shift = announcedShift(battle, hit, actor, position)
          return shift && hit.at + shift.duration > (dashAt ?? release)
        }))) continue
        if (impact !== undefined && aim.target && fallsBefore(aim.target, impact)) continue
      }
      choice = { ...aim, order, value }
    }
  }
  if (finishing && choice?.order === "basic") choice.value += finishingBonus
  return choice
}

function predictPartnerAction(battle: EdgeBattle, caster: EdgeFighter, partner: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[],
  at: number, origin: EdgePoint, basicBonus: ((enemy: EdgeUnit) => number) | undefined, holdCaster: boolean,
  position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)) {
  const estimate = <T extends EdgeUnit>(unit: T): T => {
    const following = unit.id === partner.id
    const holding = holdCaster && unit.id === caster.id
    const place = following ? origin : holding ? unit : position(unit, at)
    const forced = unit.force && unit.force.since + unit.force.duration > at ? unit.force : null
    const move = following || holding || forced || unit.move && edgeDistance(unit.move, place) < 3 ? null : unit.move
    return { ...unit, ...place, force: forced, move }
  }
  const team = allies.map(estimate)
  const lower = sideOf(battle, caster.id) === "ally"
  const opposingTeam = battle.sparring && (lower ? battle.sparring.rivals : battle.team).map(estimate)
  const projected: EdgeBattle = {
    ...battle,
    time: at,
    team: lower ? team : opposingTeam!,
    sparring: battle.sparring && { ...battle.sparring, rivals: lower ? opposingTeam! : team },
    boss: battle.sparring ? battle.boss : estimate(battle.boss),
    runtime: { ...battle.runtime, pending: battle.runtime.pending.filter(job => job.due > at) },
  }
  const fighter = team.find(unit => unit.id === partner.id)
  if (!fighter) return
  const legal = (opposingTeam ?? enemies.map(estimate)).filter(unit => targetable(projected, unit))
  return pickAttack(projected, fighter, team, legal, basicBonus && (unit => {
    const actual = unitOf(battle, unit.id)
    return actual ? basicBonus(actual) : 0
  }), basicBonus !== undefined)
}

interface PressureOptions {
  order?: EdgeOrder
  intent?: AiAttack
  lockedTarget?: boolean
  exchange?: boolean
  partner?: EdgePoint
  position?: (unit: EdgeUnit, time: number) => EdgePoint
  choreography?: boolean
  bardContact?: boolean
}

interface PressureStrike {
  intent: AiAttack
  power: number
  impact: number
  at: EdgePoint
  origin: EdgeFighter
  sourceAtImpact?: EdgePoint
  skill?: EdgeActive
  step?: Step
  area?: EdgeArea
}

function directAreaContacts(battle: EdgeBattle, { skill, area, step, origin, intent, impact }: PressureStrike,
  position: (unit: EdgeUnit, at: number) => EdgePoint) {
  if (!skill || !area || !step) return
  const recipients = predictSkillTargets(battle, origin, skill, intent.at, intent.target,
    new Map([[step, unit => position(unit, impact)]]))
  return recipients.find(row => row.step === step)?.targets.filter(unit => targetable(battle, unit, impact) &&
    skillAreaContains({ skill }, step.selector.shape, area, position(unit, impact)))
}

function firstManualContact(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeUnit[],
  { opens, ready, closes }: { opens: number; ready: number; closes: number },
  position: (unit: EdgeUnit, at: number) => EdgePoint, useful: (point: EdgePoint, at: number) => boolean,
  choose: (at: number) => AiAttack | undefined) {
  const now = battle.time
  const foes = enemies.filter(isFighter)
  let queued: { issuedAt: number; impact: number; at: EdgePoint } | undefined
  if (battle.runtime.pending.length) for (const foe of foes) {
    for (const hit of announcedStrikes(battle, foe, closes, position)) {
      const { cast } = hit.strike
      if (cast.owner !== actor.id || !cast.used.has("manual") || cast.summon || hit.zone ||
        hit.at <= opens || hit.at >= Math.min(closes, queued?.impact ?? Infinity) || !targetable(battle, foe, hit.at)) continue
      const at = position(foe, hit.at)
      const aid = aidBeforeHit(battle, foe, hit.at, position)
      const damage = announcedHit(battle, hit, foe, at, position, aid.hp, aid.shield, 0, undefined, aid.defy)
      if (damage && damage.hpLoss + damage.shieldLoss > 0) queued = { issuedAt: cast.issuedAt ?? now - SPARRING_STEP, impact: hit.at, at }
    }
  }
  const motion = actor.force ? actor.force.since + actor.force.duration : now
  const walk = actor.move && !movementStopped(battle, actor) ? now + edgeDistance(actor, actor.move) / movementSpeed(battle, actor) : now
  const step = decisionFrame()
  const start = now + Math.ceil((Math.max(ready, motion, walk) - now) / step - 1e-6) * step
  const until = Math.min(closes, queued?.impact ?? Infinity)
  // Forecast the next exchange. Later movement and action choices can be
  // reassessed when the paladin is deciding whether to use the skill again.
  if (start >= until || start > now + COOLDOWN.move) return queued
  const incoming = announcedStrikes(battle, actor, start, position)
  if (incoming.length && !lifeThroughStrikes(battle, actor, incoming, position).hp) return queued
  const options = { position, lockedTarget: true, choreography: true }
  if (!foes.some(foe => pressureStrikes(battle, actor, foe, start, until, options).some(strike => useful(strike.at, strike.impact)))) return queued
  const intent = choose(start)
  if (!intent) return queued
  for (const foe of foes) {
    for (const strike of pressureStrikes(battle, actor, foe, start, until, { ...options, intent })) {
      // Each mark triggers on the first effective contact of an area attack.
      const participants = directAreaContacts(battle, strike, position) ?? [foe]
      const positionOnContact = (unit: EdgeUnit, at: number) => unit === actor ? strike.sourceAtImpact ?? strike.origin : position(unit, at)
      for (const unit of participants) {
        if (!isFighter(unit) || !targetable(battle, unit, strike.impact)) continue
        const at = position(unit, strike.impact)
        const hit = landedDamage(battle, unit, { ...strike, at }, positionOnContact, contactCast(strike, unit))
        if (hit.hpLoss + hit.shieldLoss > 0) return { issuedAt: start, impact: strike.impact, at }
      }
    }
  }
  return queued
}

function spectrumSkillContact(battle: EdgeBattle, source: EdgeFighter, enemies: EdgeUnit[], intent: AiAttack,
  start: number, until: number, position: (unit: EdgeUnit, at: number) => EdgePoint): SpectrumContact | undefined {
  if (intent.order === "basic") return
  let contact: SpectrumContact | undefined
  for (const target of enemies) {
    const [strike] = pressureStrikes(battle, source, target, start, Math.min(until, (contact?.impact ?? Infinity) + SPARRING_STEP),
      { intent, position, lockedTarget: true, choreography: true, bardContact: true })
    if (!strike || !targetable(battle, target, strike.impact)) continue
    const from = strike.sourceAtImpact ?? strike.origin
    const path = (unit: EdgeUnit, at: number) => unit === source && at >= start ? (at >= strike.impact ? from : strike.origin) : position(unit, at)
    const incoming = announcedStrikes(battle, source, strike.impact - SPARRING_STEP, path)
    if (!lifeThroughStrikes(battle, source, incoming, path).hp ||
      incoming.some(hit => hit.at >= start && announcedShift(battle, hit, source, path))) continue
    const prior = announcedStrikes(battle, target, strike.impact - SPARRING_STEP, path)
    const life = lifeThroughStrikes(battle, target, prior, path, [], undefined, strike.impact)
    if (!life.hp) continue
    const damage = estimateDirectHit(battle, { ...strike.origin, ...from }, target, strike.power, "skill", strike.at, strike.impact,
      life.shield, { hp: life.hp, guard: life.guard?.percent, spent: life.spent, defy: life.defy,
        cast: { ...contactCast(strike, target), id: battle.runtime.sequence + 1 } })
    if (damage.hpLoss + damage.shieldLoss <= 0) continue
    if (contact?.impact === strike.impact) contact.targets.push(target)
    else if (!contact || strike.impact < contact.impact) contact = { source, from, impact: strike.impact, issuedAt: start, fixed: false, targets: [target] }
  }
  return contact
}

function planSpectrumContacts(battle: EdgeBattle, bard: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[], opens: number, closes: number,
  position: (unit: EdgeUnit, at: number) => EdgePoint, recovered?: ReadonlyMap<EdgeFighter, number>, reply?: AnnouncedStrike) {
  const now = battle.time
  const maxReach = bard.actives.find(skill => skill.id === "bard/Prismatic/A4")!
  const reach = maxReach.aim.range + maxReach.steps[1].selector.size[0]
  const result: SpectrumContact[] = []
  if (battle.runtime.pending.length) for (const target of enemies) {
    const incoming = announcedStrikes(battle, target, closes, position)
    for (const hit of incoming) {
      const { cast } = hit.strike
      if (hit.at <= opens || hit.zone || cast.order !== "skill" || cast.summon || !cast.used.has("manual")) continue
      const source = allies.find(unit => unit.id === hit.source.id)
      if (!source || !source.hp) continue
      const prior = announcedStrikes(battle, source, hit.at - SPARRING_STEP, position)
      const path = positionAfterStrike(battle, source, prior, position)?.position ?? position
      const from = path(source, hit.at)
      if (edgeDistance(bard, from) > reach || !lifeThroughStrikes(battle, source, prior, path).hp ||
        hit.strike.needsUnforcedOwner && prior.some(threat => announcedShift(battle, threat, source, path))) continue
      const life = lifeThroughStrikes(battle, target, incoming.filter(earlier => earlier.at < hit.at - SPARRING_STEP / 2),
        position, [], undefined, hit.at)
      if (!life.hp) continue
      const damage = announcedHit(battle, hit, target, position(target, hit.at), path, life.hp, life.shield, life.guard?.percent, life.spent, life.defy)
      if (!damage || damage.hpLoss + damage.shieldLoss <= 0) continue
      const same = result.find(row => row.source === source && row.impact === hit.at)
      if (same) same.targets.push(target)
      else result.push({ source, from, impact: hit.at, fixed: true, targets: [target], issuedAt: cast.issuedAt ?? now - SPARRING_STEP })
    }
  }
  const frame = decisionFrame()
  const partners = allies.filter(unit => unit.hp && unit !== bard).map(source => {
    const walk = source.move && !movementStopped(battle, source) ? edgeDistance(source, source.move) / movementSpeed(battle, source) : 0
    const start = Math.max(now + COOLDOWN.shared, source.actionAt, now + walk, recovered?.get(source) ?? 0,
      source.force ? source.force.since + source.force.duration + SPARRING_STEP : now)
    return { source, start: now + Math.ceil((start - now) / frame - 1e-6) * frame }
  }).filter(row => row.start < closes).sort((a, b) => a.start - b.start)
  const moveClock = sideOf(battle, bard.id) === "ally" ? battle : battle.sparring!
  const moveAt = Math.max(now + COOLDOWN.shared, moveClock.moveAt)
  const stopsBefore = (source: EdgeFighter, start: number, path = position) => {
    const hurt = announcedStrikes(battle, source, start, path)
    return !!lifeThroughStrikes(battle, source, hurt, path).hp && !hurt.some(hit =>
      !(hit.strike === reply?.strike && recovered?.has(source)) && announcedShift(battle, hit, source, path))
  }
  const nextSkill = (source: EdgeFighter, start: number, origin: EdgePoint, path = position) => {
    if (!enemies.some(unit => pressureStrikes(battle, source, unit, start, closes,
      { position: path, lockedTarget: true, choreography: true, bardContact: true }).some(hit => hit.intent.order !== "basic"))) return
    const choice = predictPartnerAction(battle, bard, source, allies, enemies, start, origin, undefined, true, path)
    if (!choice || choice.order === "basic") return
    const target = choice.target && unitOf(battle, choice.target.id)
    return spectrumSkillContact(battle, source, enemies, { ...choice, target }, start, closes, path)
  }
  for (const { source, start } of partners) {
    const origin = position(source, start)
    if (isOutside(origin) || edgeDistance(bard, origin) > reach + 120) continue
    if (!stopsBefore(source, start)) continue
    const hit = nextSkill(source, start, origin)
    if (hit) { result.push(hit); continue }
    if (source.move || source.force || recovered?.has(source) || movementStopped(battle, source) || moveAt + COOLDOWN.shared >= closes) continue
    const nearest = enemies.filter(enemy => enemy.hp).sort((a, b) => edgeDistance(source, a) - edgeDistance(source, b))[0]
    if (!nearest) continue
    const enemy = position(nearest, moveAt + 1)
    const atMove = position(source, moveAt)
    const axis = direction(atMove, enemy)
    for (const turn of [0, -24, 24]) {
      const goal = inside(along(atMove, rotate(axis, turn), Math.min(MOVE_REACH, edgeDistance(atMove, enemy))))
      const landing = moveLanding({ ...source, ...atMove }, goal, battle)
      if (!landing || edgeDistance(bard, landing) > reach || edgeDistance(atMove, landing) < 30) continue
      const arrival = moveAt + edgeDistance(atMove, landing) / movementSpeed(battle, source)
      const ready = Math.max(start, arrival + SPARRING_STEP, moveAt + COOLDOWN.shared)
      if (ready >= closes || summonTerrainInPath(battle, source, landing) || walksIntoShoreBeast(battle, source, landing, arrival, undefined, moveAt) ||
        walksIntoAnnouncedArea(battle, source, landing, arrival, undefined, moveAt) ||
        walksIntoWarning(battle, source, landing, arrival, undefined, moveAt)) continue
      const path = (unit: EdgeUnit, at: number) => unit === source && at >= moveAt ? walkAt(atMove, landing, moveAt, arrival, at) : position(unit, at)
      if (!stopsBefore(source, ready, path)) continue
      const afterWalk = nextSkill(source, ready, landing, path)
      if (afterWalk) { result.push({ ...afterWalk, walkAt: moveAt }); break }
    }
  }
  return result.sort((a, b) => a.impact - b.impact || Number(b.fixed) - Number(a.fixed))
}

function spectrumUnderReply(battle: EdgeBattle, bard: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[], opens: number, closes: number,
  position: (unit: EdgeUnit, at: number) => EdgePoint, reply: AnnouncedStrike) {
  const projected: EdgeBattle = { ...battle, runtime: { ...battle.runtime, pending: [...battle.runtime.pending,
    { due: reply.at, order: reply.strike.cast.id, strike: reply.strike, run: () => {} }] } }
  const routes = new Map<EdgeUnit, (at: number) => EdgePoint>()
  const recovered = new Map<EdgeFighter, number>()
  for (const unit of allies) {
    if (unit === bard) continue
    const from = position(unit, reply.at)
    const shift = announcedShift(battle, reply, unit, position)
    if (!shift || !lifeThroughStrikes(projected, unit, announcedStrikes(projected, unit, reply.at, position), position).hp) continue
    const settles = reply.at + shift.duration
    const shunted = (at: number) => displacementPoint({ ...shift, from, start: reply.at }, at)
    const displaced = { ...unit, ...shift.end, move: null, force: null }
    const returnAt = battle.time + Math.ceil((settles + SPARRING_STEP - battle.time) / decisionFrame()) * decisionFrame()
    const snapshot = { ...battle, time: returnAt }
    const landing = isOutside(displaced) && moveLanding(displaced, returnAroundShore(snapshot, displaced), snapshot)
    const walk = landing ? returnWalk(snapshot, displaced, landing) : undefined
    const path = (at: number) => at <= reply.at ? position(unit, at) : walk && at >= returnAt ? walk.at(at) : shunted(at)
    if (walk && (summonTerrainInPath(snapshot, displaced, walk.landing, false) ||
      entryFieldContacts(snapshot, displaced, walk.arrival, (_, at) => path(at)).length)) continue
    routes.set(unit, path)
    recovered.set(unit, walk?.arrival ?? settles)
  }
  const shifted = (unit: EdgeUnit, at: number) => routes.get(unit)?.(at) ?? position(unit, at)
  const contacts = planSpectrumContacts(projected, bard, allies, enemies, opens, closes, shifted, recovered, reply)
  return { battle: projected, position: shifted, contacts }
}

function planSpectrumExchanges(battle: EdgeBattle, bard: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[], opens: number, closes: number,
  position: (unit: EdgeUnit, at: number) => EdgePoint) {
  const current = { battle, position, contacts: planSpectrumContacts(battle, bard, allies, enemies, opens, closes, position), weight: 1 }
  const prediction = readyAreaStrike(battle, allies, enemies)
  if (!prediction || prediction.first.at >= opens + .45) return [current]
  const { first, skill, actor } = prediction
  const step = first.strike.step!
  const extra = skill.steps.find(other => other !== step && other.delay === step.delay && other.selector.limit === 1 &&
    other.selector.shape === step.selector.shape && other.selector.size.every((value, index) => value === step.selector.size[index]) &&
    other.operations.some(op => op.kind === "p"))
  const reply = { ...first, strike: { ...first.strike, limitedPush: extra } }
  if (!allies.some(unit => announcedHit(battle, reply, unit, position(unit, reply.at), position))) return [current]
  let ringOut: AnnouncedStrike | undefined
  if (extra || step.operations.some(op => op.kind === "p")) for (const unit of allies) {
    const place = position(unit, reply.at)
    if (isOutside(place) || announcedShift(battle, reply, unit, position)) continue
    const aim = fitAim(actor, skill, { at: place }).at
    if (!isOnBoard(aim) || skillCastProblem(battle, actor, skill, aim)) continue
    const area = previewSkillAreas(battle, actor, skill, aim)[0]
    if (!area) continue
    const alternative = { ...reply, strike: { ...reply.strike, area, cast: { ...reply.strike.cast, aim } } }
    const shift = announcedShift(battle, alternative, unit, position)
    const guard = aidBeforeHit(battle, unit, reply.at, position)
    const hit = shift && isOutside(shift.end) && announcedHit(battle, alternative, unit, place, position, guard.hp, guard.shield, 0, undefined, guard.defy)
    if (hit && !hit.lethal) {
      ringOut = alternative
      break
    }
  }
  const likely = spectrumUnderReply(battle, bard, allies, enemies, opens, closes, position, reply)
  if (!ringOut) return [{ ...current, weight: .45 }, { ...likely, weight: .55 }]
  const displaced = spectrumUnderReply(battle, bard, allies, enemies, opens, closes, position, ringOut)
  return [{ ...current, weight: .35 }, { ...likely, weight: .20 }, { ...displaced, weight: .45 }]
}

export function spectrumAdvanceScoring(battle: EdgeBattle, team: EdgeFighter[]) {
  if (!team.some(unit => unit.hp < unit.maxHp * .88)) return
  const now = battle.time
  const fields = battle.runtime.fields.filter(field => field.cast.skill?.id === "bard/Prismatic/A4" &&
    field.until > now + COOLDOWN.shared && sameSide(battle, team[0]?.id, field.cast.owner))
  if (!fields.length) return
  return (actor: EdgeFighter, target: EdgeFighter, { stop, landing, arrival }: AdvancePath) => {
    const ready = Math.max(now + COOLDOWN.shared, actor.actionAt, arrival + SPARRING_STEP)
    const reachable = fields.filter(field => field.until > ready + .35 && !field.seen.has(actor.id) &&
      !areaHits(field.area, actor) && areaHits(field.area, stop))
    if (!reachable.length) return 0
    const position = (unit: EdgeUnit, at: number) => unit === actor
      ? walkAt(actor, landing, now, arrival, at, stop) : future(battle, unit, at - now)
    const strikes = pressureStrikes(battle, actor, target, ready, Math.min(now + COOLDOWN.move + .55, ...reachable.map(field => field.until)),
      { position, lockedTarget: true, choreography: true, bardContact: true }).filter(strike => strike.intent.order !== "basic")
    let benefit = 0
    for (const { intent } of strikes) {
      const contact = spectrumSkillContact(battle, actor, [target], intent, ready, now + COOLDOWN.move + .55, position)
      if (!contact) continue
      for (const field of reachable) benefit = Math.max(benefit, liveSpectrumValue(battle, field, team, contact, position))
    }
    return Math.min(50, benefit * 29) / (1 + .26 * (ready - now))
  }
}

export function projectedBasic(battle: EdgeBattle, actor: EdgeFighter, target: EdgeFighter, start: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint) {
  const [strike] = pressureStrikes(battle, actor, target, start, start + .6, { order: "basic", position })
  if (!strike) return
  const aid = aidBeforeHit(battle, target, strike.impact, position)
  const hit = estimateDirectHit(battle, strike.origin, target, strike.power, "basic", strike.at, strike.impact, aid.shield, aid)
  return { at: strike.impact, position: strike.at, shield: aid.shield, hit }
}

export function replyAfterDodge(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[], { landing, arrival, stop }: AdvancePath) {
  const now = battle.time
  const ready = Math.max(actor.actionAt, arrival + SPARRING_STEP, now + COOLDOWN.shared)
  const tick = decisionFrame()
  const start = now + Math.ceil((ready - now) / tick - 1e-6) * tick
  const end = now + COOLDOWN.move
  if (start >= end || isOutside(stop)) return 0
  const position = (unit: EdgeUnit, at: number) => unit === actor ? walkAt(actor, landing, now, arrival, at, stop) : future(battle, unit, at - now)
  const incoming = announcedStrikes(battle, actor, end, position)
  let value = 0
  for (const enemy of enemies) {
    if (!lifeThroughStrikes(battle, enemy, announcedStrikes(battle, enemy, start, position), position).hp) continue
    for (const strike of pressureStrikes(battle, actor, enemy, start, end, { position, lockedTarget: true, exchange: true, choreography: true })) {
      const before = incoming.filter(contact => contact.at <= strike.impact)
      if (before.length && (!lifeThroughStrikes(battle, actor, before, position).hp ||
        before.some(contact => announcedShift(battle, contact, actor, position)))) continue
      const hit = landedDamage(battle, enemy, strike, position, contactCast(strike, enemy))
      const damage = Math.max(0, hit.hpLoss - hit.saveHeal) / enemy.maxHp
      if (!hit.lethal && damage < .09) continue
      const shift = attackShift(battle, strike, enemy)
      const ejects = shift && !isOutside(strike.at) && isOutside(shift.end)
      const timing = 1 - (strike.impact - now - COOLDOWN.shared) * .27
      value = Math.max(value, timing * (.18 + Math.min(.5, damage * 1.35) + (hit.lethal ? .55 : ejects ? .27 : 0)))
    }
  }
  return value
}

export function clearReturnLane(battle: EdgeBattle, actor: EdgeFighter, target: EdgeFighter, start: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint) {
  const horizon = start + 1.05
  return pressureStrikes(battle, actor, target, start, horizon, { exchange: true, position }).some(strike => {
    if (!strike.area) return false
    const result = landedDamage(battle, target, strike, position, contactCast(strike, target))
    return result.lethal || result.hpLoss >= actor.attack * .55
  })
}

function chosenContact(battle: EdgeBattle, { actor, intent }: TeamAttack, target: EdgeFighter, by: number) {
  const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - battle.time)
  const [strike] = pressureStrikes(battle, actor, target, battle.time, by,
    { intent, position, lockedTarget: true, choreography: true, exchange: true })
  if (!strike || !targetable(battle, target, strike.impact)) return
  return { strike, hit: landedDamage(battle, target, strike, position, contactCast(strike, target)) }
}

function contactCast(strike: PressureStrike, target: EdgeUnit) {
  const cast = strike.skill ? forecastSkillCast(strike.origin, strike.skill, target) : forecastBasicCast(strike.origin, target)
  return { ...cast, aim: strike.intent.at }
}

export function worthTradingForLine(battle: EdgeBattle, attack: TeamAttack, enemies: EdgeFighter[], threat: LineDefense) {
  const { actor, intent } = attack
  const skill = intent.order !== "basic" ? actor.actives[intent.order === "skill" ? 0 : 1] : undefined
  if (enemies.length === 1 && skill?.id === "warlock/Prismatic/A5" && threat.patient) {
    const { unit, impacts } = threat.patient
    const delay = fixedSkillWindup(skill)!
    const before = impacts.filter(contact => contact.at < battle.time + delay)
    const standing = (unit: EdgeUnit, time: number) => unit === actor ? actor : future(battle, unit, time - battle.time)
    const path = positionAfterStrike(battle, unit, before, standing)
    const ward = aidFrom(battle, actor, unit, skill, skill.steps[1], delay)
    const area = previewSkillAreas(battle, actor, skill, intent.at, intent.target)[1]
    if (path && area && areaHits(area, path.position(unit, ward.at)) &&
      lifeThroughStrikes(battle, unit, impacts, path.position, [ward]).hp) return true
  }
  let finishes = 0
  let hurt = 0
  let health = 0
  for (const enemy of enemies) {
    const contact = chosenContact(battle, attack, enemy, threat.at - SPARRING_STEP)
    if (!contact) continue
    const { strike, hit } = contact
    if (hit.lethal) {
      if (enemies.length === 1 || enemy === threat.enemy && strike.impact + SPARRING_STEP < threat.castAt) return true
      finishes++
    }
    const loss = (hit.hpLoss - hit.saveHeal) / enemy.maxHp
    if (loss >= .12) hurt++
    health += loss
  }
  // Shared movement buys one escape. Keep a hit that can secure multiple
  // finishes or take substantial health from several opponents first.
  return finishes >= 2 || hurt >= 3 && health >= .85
}

export function interruptsLineAfterAdvance(battle: EdgeBattle, team: EdgeFighter[], enemy: EdgeFighter,
  route: AdvancePath & { actor: EdgeFighter }, castAt: number) {
  const now = battle.time
  const frame = decisionFrame()
  const position = (unit: EdgeUnit, at: number) => unit === route.actor
    ? walkAt(unit, route.landing, now, route.arrival, at, route.stop) : future(battle, unit, at - now)
  return team.some(actor => {
    const walking = actor === route.actor ? route.arrival
      : actor.move && !movementStopped(battle, actor) ? returnWalk(battle, actor, actor.move).arrival : now
    const standing = actor.force ? actor.force.since + actor.force.duration + SPARRING_STEP : now
    const ready = Math.max(now + COOLDOWN.shared, actor.actionAt, walking, standing)
    const start = now + Math.ceil((ready - now) / frame - 1e-6) * frame
    if (start >= castAt) return false
    const options = { position, lockedTarget: true, choreography: true, exchange: true,
      partner: actor === route.actor ? undefined : route.stop }
    return pressureStrikes(battle, actor, enemy, start, castAt, options).some(strike => {
      const incoming = announcedStrikes(battle, actor, strike.impact, position)
      if (incoming.length && (!lifeThroughStrikes(battle, actor, incoming, position).hp ||
        incoming.some(hit => announcedShift(battle, hit, actor, position)))) return false
      if (landedDamage(battle, enemy, strike, position, contactCast(strike, enemy)).lethal) return true
      const shift = attackShift(battle, strike, enemy)
      if (!shift) return false
      const lands = strike.impact + shift.duration
      if (lands >= castAt) return true
      if (!isOutside(shift.end)) return false
      const distanceBack = edgeDistance(shift.end, inside(shift.end, 0))
      return lands + distanceBack / movementSpeed(battle, { ...enemy, ...shift.end }) >= castAt
    })
  })
}

function rescueBreak(battle: EdgeBattle, team: EdgeFighter[], enemies: EdgeUnit[], current: TeamAttack): TeamAttack | undefined {
  const now = battle.time
  const { actor, intent } = current
  if (!battle.runtime.summons.length || intent.order !== "basic" ||
    battle.runtime.buffs.some(buff => buff.target === actor.id && buff.until > now && buff.kind === "choose")) return
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  let best: TeamAttack | undefined
  for (const group of battle.runtime.summons) {
    if (group.deployment.kind !== "rescue" || sameSide(battle, group.owner, actor.id)) continue
    const patient = enemies.find(enemy => enemy.id === group.target)
    const [body] = group.deployment.bodies
    if (!patient || !isFighter(patient) || body.hp > actor.attack * 2 ||
      basicTarget(battle, actor, target => Number(target === body)) !== body) continue
    const pulse = rescuePulse(battle, group, patient, now + 2.15, position)
    if (!pulse || pulse.at <= now + SPARRING_STEP) continue
    const impact = now + (actor.range >= 200 ? flightTime(actor, body) : 0)
    if (impact + SPARRING_STEP >= pulse.at) continue
    const hit = estimateDirectHit(battle, actor, body, 1, "basic", body, impact)
    if (!hit.lethal) continue

    const original = intent.target
    if (original && isFighter(original)) {
      const lands = now + (actor.range >= 200 ? flightTime(actor, original) : 0)
      const at = position(original, lands)
      const ward = aidBeforeHit(battle, original, lands, position)
      const result = estimateDirectHit(battle, actor, original, 1, "basic", at, lands, ward.shield, ward)
      if (result.lethal || result.hpLoss - result.saveHeal >= actor.attack * .5 ||
        !isOutside(at) && isOutside(previewDirectedShove(battle, original, at, direction(actor, at), BASIC_PUSH, lands))) continue
    }

    const deadline = Math.min(now + 2.55, pulse.at + 1.35)
    for (const ally of team) {
      if (ally === actor) continue
      const start = followAt(battle, ally)
      if (start >= deadline || !pressable(battle, ally, position(ally, start))) continue
      const strikes = pressureStrikes(battle, ally, patient, start, deadline, { lockedTarget: true, exchange: true })
      for (const strike of strikes) {
        if (strike.impact < pulse.at + SPARRING_STEP) continue
        const withAid = contactPlan(battle, patient, [strike], strike.impact, position)
        const withoutAid = contactPlan(battle, patient, [strike], strike.impact, position, { blockedRescue: group })
        if (withAid.hp <= 0 || withoutAid.downAt < strike.impact - .02 ||
          withoutAid.hp > 0 && (withoutAid.hp > patient.maxHp * .16 || withAid.hp - withoutAid.hp < patient.maxHp * .11)) continue
        const value = 2.65 + (withoutAid.hp === 0 ? .75 : 0) - .24 * (strike.impact - now)
        if (value > Math.max(best?.intent.value ?? 0, intent.value)) {
          best = { actor, intent: { order: "basic", target: body, at: body, value } }
        }
      }
    }
  }
  return best
}

function offensiveSwap(skill: EdgeActive) {
  if (skill.aim.mode !== "other" || !skill.steps[0]?.operations.some(op => op.kind === "swap")) return
  const windup = wardenChoreography(skill.id)?.windup ?? paladinChoreography(skill.id)?.windup
  const step = skill.steps.find(step => step.selector.units === "e" && !step.watch && !step.zone &&
    (step.selector.shape === "D" || step.selector.shape === "C" && step.selector.anchor === "s") &&
    !step.selector.flags.length && !step.selector.limit && !step.selector.exclude && step.operations.some(op => op.kind === "d" && !op.style))
  if (windup === undefined || !step) return
  return { delay: windup + step.delay, radius: step.selector.size[0], bothEnds: step.selector.shape === "D",
    power: step.operations.find(op => op.kind === "d" && !op.style)!.args[0], step }
}

function swapFinishStrikes(battle: EdgeBattle, actor: EdgeFighter, target: EdgeFighter, team: EdgeFighter[], start: number, end: number,
  position: (unit: EdgeUnit, at: number) => EdgePoint) {
  const strikes: PressureStrike[] = []
  const origin = { ...actor, ...position(actor, start) }
  if (isOutside(origin)) return strikes
  for (const [index, skill] of actor.actives.entries()) {
    const swap = offensiveSwap(skill)
    if (!swap) continue
    const impact = start + swap.delay
    if (impact >= end || !targetable(battle, target, impact)) continue
    const at = position(target, impact)
    for (const ally of team) {
      if (ally === actor || !ally.hp || ally.force || isOutside(ally)) continue
      const landing = position(ally, impact)
      const aim = position(ally, start)
      if (isOutside(aim) || isOutside(landing) || edgeDistance(origin, landing) > skill.aim.range ||
        skillCastProblem(battle, origin, skill, aim, ally, start) ||
        edgeDistance(landing, at) > swap.radius && (!swap.bothEnds || edgeDistance(origin, at) > swap.radius)) continue
      const hits = announcedStrikes(battle, ally, impact, position)
      if (hits.length && (hits.some(hit => announcedShift(battle, hit, ally, position)) ||
        !lifeThroughStrikes(battle, ally, hits, position).hp)) continue
      strikes.push({ intent: { order: index ? "skill2" : "skill", target: ally, at: aim, value: swap.power }, origin,
        power: swap.power, at, impact, sourceAtImpact: landing, skill, step: swap.step })
    }
  }
  return strikes
}

function pressureStrikes(battle: EdgeBattle, actor: EdgeFighter, enemy: EdgeUnit, start: number, end: number,
  { order: requested, intent, lockedTarget, exchange, partner, choreography, bardContact,
    position = (unit, time) => future(battle, unit, time - battle.time) }: PressureOptions = {}) {
  const origin = { ...actor, ...position(actor, start) }
  const target = position(enemy, start)
  if (isOutside(origin) || start >= end || !targetable(battle, enemy, start)) return []
  const orderAt = requested ?? intent?.order
  const hasBasicModifier = battle.runtime.buffs.some(buff => buff.target === actor.id && buff.until > start &&
    (buff.kind === "choose" || buff.kind === "q" || buff.kind === "ampq"))
  const strikes: PressureStrike[] = []
  const arrival = start + (actor.range >= 200 ? flightTime(origin, target) : 0)
  if ((!orderAt || orderAt === "basic") && !hasBasicModifier && (!intent || intent.target === enemy) && arrival < end &&
    basicTarget(battle, origin, unit => Number(unit === enemy), start, unit => position(unit, start)) === enemy) {
    strikes.push({ intent: { order: "basic", target: enemy, at: target, value: 1 }, origin,
      power: 1, at: position(enemy, arrival), impact: arrival })
  }
  for (const [index, skill] of actor.actives.entries()) {
    const order = index ? "skill2" : "skill"
    if (orderAt && orderAt !== order) continue
    const step = choreography && skill.aim.mode === "enemy" && skill.steps[0]?.operations.some(op => op.kind === "dash")
      ? skill.steps[1] : skill.steps[0]
    if (choreography && (skill.aim.mode === "enemy" || skill.aim.mode === "outside") && step?.selector.units === "t") {
      if (intent && intent.target !== enemy) continue
      if (skillCastProblem(battle, origin, skill, target, enemy, start)) continue
      const contact = castTiming(battle, origin, skill, enemy, (unit, time) => unit.id === actor.id ? origin : position(unit, time), start, target)
      const power = step.operations.find(op => op.kind === "d" && !op.style && op.args.length === 1)?.args[0]
      if (power && contact?.impact !== undefined && contact.impact < end) {
        const { impact } = contact
        strikes.push({ intent: { order, at: target, target: enemy, value: power }, origin, power, at: position(enemy, impact),
          impact, sourceAtImpact: contact.position(origin, impact), skill, step })
      }
      if (contact !== undefined) continue
    }
    const bard = bardContact && bardChoreography(skill.id)
    const flight = bardContact && fixedAreaFlight(skill)
    const windup = fixedSkillWindup(skill, lockedTarget) ?? (bard && bard.delivery === "none" ? bard.windup : flight ? 0 : undefined)
    if (windup === undefined || !step || step.watch || step.zone || step.selector.limit ||
      step.selector.flags.some(flag => flag !== "card")) continue
    if (exchange && step.selector.anchor && !["p", "o", "s", "m", "c"].includes(step.selector.anchor)) continue
    const locked = step.selector.units === "t" && skill.aim.mode === "enemy"
    if (!locked && (step.selector.units !== "e" || !step.selector.shape)) continue
    const power = step.operations.find(op => op.kind === "d" && (!exchange || !op.style && op.args.length === 1))?.args[0]
    const impact = start + windup + step.delay + (flight ? flightTime(origin, intent?.at ?? target) : 0)
    if (!power || impact >= end) continue
    const at = position(enemy, impact)
    if (locked) {
      if ((!intent || intent.target === enemy) && edgeDistance(origin, target) <= skill.aim.range &&
        edgeDistance(origin, at) <= skill.aim.range && targetable(battle, enemy, impact)) {
        strikes.push({ intent: { order, at: target, target: enemy, value: power }, origin, power, at, impact, skill, step })
      }
      continue
    }
    const extended = skill.aim.mode === "point" && step.selector.shape === "L" ? along(at, direction(origin, at), 18) : at
    const centers = [extended]
    if (exchange && partner && !intent && skill.aim.mode === "point" && step.selector.shape === "C" && !step.selector.anchor &&
      step.operations.some(op => op.kind === "p")) {
      const axis = direction(origin, at)
      const span = step.selector.size[0] * .57
      centers.push(along(at, left(axis), span), along(at, left(axis), -span), along(at, axis, span), along(at, axis, -span))
      centers.push(along(at, direction(partner, at), span))
    }
    const seen = new Set<string>()
    for (const center of centers) {
      const aim = intent?.at ?? fitAim(origin, skill, { at: center }).at
      const key = Math.round(aim.x) + "/" + Math.round(aim.y)
      if (seen.has(key) || !isOnBoard(aim) || skillCastProblem(battle, origin, skill, aim)) continue
      seen.add(key)
      const area = previewSkillAreas(battle, origin, skill, aim)[0]
      if (!area || !skillAreaContains({ skill }, step.selector.shape, area, at)) continue
      const intersection = bardContact && areaHits(area, at) > 1
        ? step.operations.find(op => op.kind === "d" && op.style === "crosscore")?.args[1] ?? 0 : 0
      strikes.push({ intent: { order, at: aim, value: power }, origin, power: power + intersection, at, impact, skill, step, area })
    }
  }
  return strikes
}

function shieldForecast(battle: EdgeBattle, target: EdgeFighter, until: number) {
  let announced = Infinity
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
  const pulses = scheduledAid(battle, target, until, position).filter(aid => aid.shield > 0)
  for (const warning of battle.runtime.visuals) {
    if (warning.phase === "warning" && warning.effect === "shield" && warning.until > battle.time && warning.until < announced &&
      sameSide(battle, warning.owner, target.id) && areaHits(warning.area, future(battle, target, warning.until - battle.time))) announced = warning.until
  }
  return Math.min(announced, ...pulses.map(pulse => pulse.at), shieldRefreshReady(battle, target))
}

function landedDamage(battle: EdgeBattle, target: EdgeUnit, strike: PressureStrike,
  position: (unit: EdgeUnit, at: number) => EdgePoint, cast?: ReturnType<typeof forecastSkillCast>, refresh = 0) {
  const aid = aidBeforeHit(battle, target, strike.impact, position)
  const source = strike.sourceAtImpact ? { ...strike.origin, ...strike.sourceAtImpact } : strike.origin
  return estimateDirectHit(battle, source, target, strike.power, strike.intent.order === "basic" ? "basic" : "skill",
    strike.at, strike.impact, Math.max(aid.shield, refresh), { ...aid, cast })
}

function refreshingShield(battle: EdgeBattle, strike: PressureStrike, projectCaster = false) {
  const { origin, skill, step, impact, intent } = strike
  if (!skill || !step) return 0
  const wardSteps = skill.steps.filter(next => next.delay === step.delay && !next.watch && !next.zone &&
    next.operations.some(op => op.kind === "b" && !op.style))
  if (!wardSteps.length) return 0
  const positions = projectCaster ? new Map(wardSteps.map(next => [next, (unit: EdgeUnit) => unit.id === origin.id
    ? strike.sourceAtImpact ?? origin : unit])) : undefined
  let shield = 0
  for (const { step: next, targets } of predictSkillTargets(battle, origin, skill, intent.at, intent.target, positions)) {
    if (!wardSteps.includes(next) || !targets.some(unit => unit.id === origin.id)) continue
    for (const op of next.operations) if (op.kind === "b" && !op.style)
      shield = Math.max(shield, Math.round(origin.maxHp * op.args[0] / 100))
  }
  return origin.shieldUntil <= impact || shield + 1 >= origin.shield ? shield : 0
}

function duelShieldTiming(battle: EdgeBattle, enemy: EdgeFighter, { actor, intent }: TeamAttack, refresh: number):
  TeamAttack | "wait" | undefined {
  const now = battle.time
  if (actor.move || actor.force || isOutside(actor) || enemy.shieldUntil > now + 1.35) return
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const end = now + 1.45
  const options = { lockedTarget: true, choreography: true, position }
  const immediate = pressureStrikes(battle, actor, enemy, now, end, { ...options, intent })[0]
  if (!immediate || immediate.skill?.steps.some(step => step.operations.some(op =>
    op.kind === "strip" || op.kind === "take" || op.kind === "erase" || op.kind === "i" && !!chargeOf(battle, enemy)))) return
  const standing = landedDamage(battle, enemy, immediate, position)
  if (standing.lethal || standing.hpLoss >= actor.attack * .35) return
  const shift = attackShift(battle, immediate, enemy)
  if (shift && isOutside(shift.end)) return
  const incoming = announcedStrikes(battle, actor, end, position)
  if (incoming.length && (lifeThroughStrikes(battle, actor, incoming, position).hp < actor.hp - actor.attack * .25 ||
    incoming.some(contact => announcedShift(battle, contact, actor, position)))) return
  const step = decisionFrame()
  const clocks = sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring!
  // Stop waiting before the defender is free to choose another attack or ward.
  const counterAt = Math.max(clocks.sharedAt, Math.min(enemy.actionAt, clocks.moveAt))
  const latest = Math.min(end, refresh - .05, counterAt - .05)
  for (let start = now; start < latest && start <= now + step * 4 + .001; start += step) {
    let best: { strike: PressureStrike; damage: number } | undefined
    for (const strike of pressureStrikes(battle, actor, enemy, start, latest, options)) {
      if (strike.impact < enemy.shieldUntil + .02) continue
      const result = landedDamage(battle, enemy, strike, position)
      if (!result.lethal && result.hpLoss < standing.hpLoss + actor.attack * .65) continue
      const damage = result.hpLoss + (result.lethal ? enemy.maxHp : 0)
      if (!best || damage > best.damage) best = { strike, damage }
    }
    if (!best) continue
    if (start > now) return "wait"
    return { actor, intent: { ...best.strike.intent, value: intent.value } }
  }
}

function shieldRefreshReady(battle: EdgeBattle, target: EdgeFighter) {
  const cast = battle.runtime.shieldCasts.get(target.id)
  const caster = unitOf(battle, cast?.owner)
  const skill = cast?.skill
  if (!cast?.used.has("manual") || !caster?.hp || !isFighter(caster) || !skill || !caster.actives.includes(skill)) return Infinity
  const ward = skill.steps.find(step => !step.zone && !step.watch && step.selector.units !== "e" &&
    step.operations.some(op => op.kind === "b" && op.args[0] * target.maxHp / 100 >= target.shield * .45))
  if (!ward) return Infinity
  const clock = sideOf(battle, target.id) === "ally" ? battle : battle.sparring!
  const ready = Math.max(caster.actionAt, clock.sharedAt, battle.time, caster.force ? caster.force.since + caster.force.duration : 0)
  if (!Number.isFinite(ready)) return Infinity
  const from = future(battle, caster, ready - battle.time)
  if (isOutside(from)) return Infinity
  const targeted = skill.aim.mode === "ally" || skill.aim.mode === "other"
  if (targeted && edgeDistance(from, future(battle, target, ready - battle.time)) > skill.aim.range) return Infinity
  return ready + (fixedSkillWindup(skill, true) ?? 0) + ward.delay
}

function attackShift(battle: EdgeBattle, strike: PressureStrike, target: EdgeUnit) {
  if (strike.skill && strike.step) return previewContactShift(battle, strike.origin, strike.skill, strike.step,
    strike.intent.at, strike.area, target, strike.at, strike.impact, strike.intent.target)
  if (strike.intent.order !== "basic") return
  const end = previewDirectedShove(battle, target, strike.at, direction(strike.origin, strike.at), BASIC_PUSH, strike.impact)
  if (edgeDistance(strike.at, end) < 3) return
  return { end, push: true, duration: .14 + (!isOutside(strike.at) && isOutside(end) ? .14 : 0) }
}

export function pressureShieldFromAnAngle(battle: EdgeBattle, actor: EdgeFighter, enemy: EdgeFighter, current?: AiAttack) {
  const now = battle.time
  if (actor.force || actor.move || isOutside(actor) || isOutside(enemy) || enemy.force) return
  const origin = battle.runtime.shieldCasts.get(enemy.id)
  if (!origin?.skill || origin.owner !== enemy.id || !origin.used.has("manual") ||
    enemy.shield <= 0 || enemy.shieldUntil <= now + COOLDOWN.shared) return
  const clocks = sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring!
  const enemyReady = Math.max(enemy.actionAt, clocks.sharedAt)
  const walkReady = Math.max(actor.actionAt, now + COOLDOWN.shared)
  if (walkReady > enemyReady - .12 || walkReady > now + COOLDOWN.move) return
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const target = position(enemy, walkReady)
  const range = attackRange(battle, actor, enemy, walkReady)
  const gap = edgeDistance(actor, target)
  if (gap < 14 || gap > range + MOVE_REACH || borderGap(target) > MOVE_REACH + 110) return
  const options = { lockedTarget: true, choreography: true, position }
  const staysAt = Math.max(now, actor.actionAt)
  const direct = pressureStrikes(battle, actor, enemy, staysAt, staysAt + .9, options)
  if (!direct.length || direct.some(strike => {
    const hit = landedDamage(battle, enemy, strike, position)
    return hit.lethal || hit.hpLoss >= actor.attack * .32 ||
      !isOutside(strike.at) && isOutside(attackShift(battle, strike, enemy)?.end ?? strike.at)
  })) return
  if (current && !direct.some(strike => strike.intent.order === current.order)) return
  if (!direct.some(strike => (strike.step?.operations.find(op => op.kind === "p")?.args[0] ?? 0) >= 70)) return
  const normal = outward(target)
  const axis = { x: -normal.x, y: -normal.y }
  const bearings = [0, -42, 42, -78, 78]
  const requests = bearings.flatMap(turn => {
    const heading = rotate(axis, turn)
    return [Math.min(range * .55, 90), Math.min(range * .32, 53)].map(distance => inside(along(target, heading, distance), 25))
  })
  const patrols = roadBeastThreats(battle, actor)
  const horizon = enemyReady - .08
  let best: { point: EdgePoint; value: number } | undefined
  for (const request of requests) {
    const landing = moveLanding(actor, request, battle)
    if (!landing || dancerMovesBySkill(battle, actor, request) || summonTerrainInPath(battle, actor, landing, false)) continue
    const length = edgeDistance(actor, landing)
    if (length < 30) continue
    const arrival = now + length / movementSpeed(battle, actor)
    if (arrival + .45 > horizon || availablePortalExit(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, now, true) || walksIntoAnnouncedArea(battle, actor, landing, arrival) ||
      walksIntoShoreBeast(battle, actor, landing, arrival) || battle.runtime.fields.some(field => field.mode === "cross" &&
        field.until > now && !sameSide(battle, field.cast.owner, actor.id) && !field.seen.has(actor.id) &&
        !areaHits(field.area, actor) && firstCrossing(field.area, actor, landing))) continue
    const after = Math.max(walkReady, arrival) + decisionFrame()
    const placed = (unit: EdgeUnit, at: number) => unit === actor ? walkAt(actor, landing, now, arrival, at) : position(unit, at)
    if (patrols.length && roadBeastRisk(battle, actor, placed, after, patrols, true) > 0) continue
    const estimate = pressureStrikes(battle, actor, enemy, after, Math.min(horizon, after + 1), { ...options, position: placed })
    for (const strike of estimate) {
      const shift = attackShift(battle, strike, enemy)
      if (!shift || isOutside(strike.at) || !isOutside(shift.end)) continue
      const incoming = announcedStrikes(battle, actor, strike.impact, placed)
      if (incoming.length && (!lifeThroughStrikes(battle, actor, incoming, placed).hp ||
        incoming.some(hit => announcedShift(battle, hit, actor, placed)))) continue
      const value = 2.85 + Math.min(.75, borderGap(shift.end) / 150) - (after - now) * .22
      if (!best || value > best.value) best = { point: request, value }
    }
  }
  return best
}

export function followDuelHit(battle: EdgeBattle, actor: EdgeFighter, enemy: EdgeFighter) {
  const now = battle.time
  if (actor.move || actor.force || isOutside(actor) || isOutside(enemy) || enemy.hp > actor.attack * .85 ||
    enemy.shield <= 0 || actor.hp <= enemy.attack * 2.1) return
  const ward = battle.runtime.shieldCasts.get(enemy.id)
  if (!ward?.skill || ward.owner !== enemy.id || !ward.used.has("manual")) return
  const ready = Math.max(now + COOLDOWN.shared, actor.actionAt)
  if (ready > now + COOLDOWN.move) return
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const contacts = announcedStrikes(battle, enemy, now + 1, position)
  const hit = contacts.find(contact => contact.source === actor && "area" in contact.strike &&
    announcedHit(battle, contact, enemy, position(enemy, contact.at), position))
  if (!hit) return
  const shift = announcedShift(battle, hit, enemy, position)
  if (!shift?.push || isOutside(shift.end)) return
  const clocks = sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring!
  const ends = hit.at + shift.duration
  const responds = Math.max(ends, clocks.sharedAt, Math.min(clocks.moveAt, enemy.actionAt))
  const deadline = responds - .05
  if (ready >= deadline) return
  const afterPush = (unit: EdgeUnit, at: number) => unit === enemy && at >= ends ? shift.end : position(unit, at)
  const range = attackRange(battle, actor, enemy, ready)
  if (edgeDistance(actor, shift.end) <= range + 6) return
  const speed = movementSpeed(battle, actor)
  const axis = direction(shift.end, actor)
  let best: { point: EdgePoint; value: number } | undefined
  for (const turn of [0, -42, 42, -76, 76]) {
    const point = inside(along(shift.end, rotate(axis, turn), range * .62), 30)
    const landing = moveLanding(actor, point, battle)
    if (!landing || dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing, false)) continue
    const length = edgeDistance(actor, landing)
    const arrival = now + length / speed
    const attackAt = now + Math.ceil((Math.max(ready, arrival, ends) - now) / decisionFrame() - 1e-6) * decisionFrame()
    if (length < 25 || attackAt >= deadline || edgeDistance(landing, shift.end) > range - 7 ||
      availablePortalExit(battle, actor, landing, arrival) || walksIntoAnnouncedArea(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival) || walksIntoShoreBeast(battle, actor, landing, arrival)) continue
    if (battle.runtime.fields.some(field => field.mode === "cross" && field.until > now &&
      !sameSide(battle, field.cast.owner, actor.id) && !field.seen.has(actor.id) &&
      !areaHits(field.area, actor) && firstCrossing(field.area, actor, landing, 4))) continue
    const path = (unit: EdgeUnit, at: number) => unit === actor ? walkAt(actor, landing, now, arrival, at) : afterPush(unit, at)
    const [basic] = pressureStrikes(battle, actor, enemy, attackAt, deadline, { order: "basic", position: path })
    if (!basic || contactPlan(battle, enemy, [], basic.impact, path, { announced: contacts }).hp === 0 ||
      contactPlan(battle, enemy, [basic], basic.impact, path, { announced: contacts }).hp > 0) continue
    const reply = announcedStrikes(battle, actor, basic.impact, path)
    if (reply.length && (!lifeThroughStrikes(battle, actor, reply, path).hp ||
      reply.some(contact => announcedShift(battle, contact, actor, path)))) continue
    const value = 4.1 - (attackAt - now) * .25 - length / 680
    if (!best || value > best.value) best = { point, value }
  }
  return best
}

export function pursueDuelFinish(battle: EdgeBattle, actor: EdgeFighter, enemy: EdgeFighter,
  routeTo: (enemy: EdgeFighter, range: number) => (AdvancePath & { point: EdgePoint }) | undefined) {
  if (!battle.sparring || actor.force || actor.move || isOutside(actor) || isOutside(enemy) || enemy.hp > actor.attack * 1.75) return
  const now = battle.time
  const step = decisionFrame()
  const frame = (at: number) => now + Math.max(0, Math.ceil((at - now) / step - 1e-6)) * step
  const own = frame(Math.max(now + COOLDOWN.shared, actor.actionAt))
  if (own >= now + 2.15) return
  const enemyClock = sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring
  const enemyReady = frame(Math.max(enemyClock.sharedAt, enemy.actionAt, enemy.force ? enemy.force.since + enemy.force.duration : now))
  const horizon = now + COOLDOWN.move + .5
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const target = stays(enemy, own)
  const basicRange = attackRange(battle, actor, enemy, own)
  const skillRange = equippedReach(actor).damage
  const reach = Math.max(basicRange, skillRange)
  if (edgeDistance(actor, target) > reach + MOVE_REACH || enemy.move && edgeDistance(target, enemy.move) > 4 ||
    pressureStrikes(battle, actor, enemy, own, horizon, { position: stays, choreography: true, lockedTarget: true })
      .some(strike => landedDamage(battle, enemy, strike, stays, contactCast(strike, enemy)).lethal)) return
  const announced = announcedStrikes(battle, actor, horizon, stays)
  let best: { point: EdgePoint; value: number } | undefined
  const ranges = [basicRange * .88, basicRange * .72]
  if (skillRange > basicRange * 1.10) ranges.unshift(skillRange * .90)
  for (const range of ranges) {
    const route = routeTo({ ...enemy, ...target }, range)
    if (!route || edgeDistance(route.stop, route.landing) > 5) continue
    const start = frame(Math.max(own, route.arrival + SPARRING_STEP))
    const path = (unit: EdgeUnit, at: number) => unit === actor ? walkAt(actor, route.landing, now, route.arrival, at) : stays(unit, at)
    const attacks = pressureStrikes(battle, actor, enemy, start, horizon, { position: path, choreography: true, lockedTarget: true })
    for (const strike of attacks) {
      if (!landedDamage(battle, enemy, strike, path, contactCast(strike, enemy)).lethal) continue
      const at = strike.impact
      const enemyStarts = frame(Math.max(enemyClock.sharedAt, enemyClock.moveAt, start))
      if (!enemy.move && canStepOutOfStrike(battle, enemy, strike, enemyStarts)) continue
      const queued = announced.filter(contact => contact.at <= at + SPARRING_STEP)
      if (queued.length && (!lifeThroughStrikes(battle, actor, queued, path).hp ||
        queued.some(contact => contact.at < start && (announcedShift(battle, contact, actor, path) ||
          contact.at < route.arrival && contact.strike.step?.operations.some(op => op.kind === "root") &&
          announcedHit(battle, contact, actor, path(actor, contact.at), path))))) continue
      const damageCast = contactCast(strike, enemy)
      const delivery = warlockChoreography(strike.skill?.id) ?? assassinChoreography(strike.skill?.id)
      const release = strike.intent.order === "basic" ? start : delivery?.delivery ? start + delivery.windup : at
      let unsafe = false
      // A ready opponent may let the walk enter range before committing its reply.
      for (let time = enemyReady; time <= at; time += step) {
        if (enemy.move && !movementStopped(battle, enemy) && edgeDistance(path(enemy, time), enemy.move) > 3) continue
        const replies = pressureStrikes(battle, enemy, actor, time, at + SPARRING_STEP,
          { position: path, choreography: true, lockedTarget: true })
        unsafe = replies.some(reply => {
          const shield = reply.impact <= at + SPARRING_STEP ? refreshingShield(battle, reply, true) : 0
          if (shield && !landedDamage(battle, enemy, strike, path, damageCast, shield).lethal) return true
          const taken = contactPlan(battle, actor, [reply], at + SPARRING_STEP, path, { announced: queued })
          if (!taken.hp) return true
          return disruptsFinishingWalk(battle, actor, reply, route, start, release)
        })
        if (unsafe) break
      }
      if (unsafe) continue
      const value = 3.85 - (at - now) * .31
      if (!best || value > best.value) best = { point: route.point, value }
    }
  }
  return best
}

function disruptsFinishingWalk(battle: EdgeBattle, actor: EdgeFighter, reply: PressureStrike, route: AdvancePath, start: number, release: number) {
  const shift = attackShift(battle, reply, actor)
  if (reply.impact >= start) {
    return !!shift && reply.impact + SPARRING_STEP < release
  }
  if (shift) {
    if (isOutside(shift.end) || shift.push && reply.intent.order !== "basic" && reply.impact < route.arrival) return true
    const remaining = reply.impact < route.arrival && reply.intent.order === "basic"
      ? edgeDistance(shift.end, route.stop) / movementSpeed(battle, actor) : 0
    // An ordinary shot can pause the remaining walk and cost one decision.
    return reply.impact + shift.duration + remaining > start + decisionFrame() + SPARRING_STEP
  }
  if (reply.impact >= route.arrival) return false
  return reply.step?.operations.some(op => op.kind === "root" && route.arrival + op.args[0] > start + decisionFrame() + SPARRING_STEP) ?? false
}

export function answerShieldExchange(battle: EdgeBattle, enemy: EdgeFighter, { actor, intent }: TeamAttack,
  timing?: "before-opponent" | "after-opponent"): TeamAttack | "wait" | "react" | undefined {
  if (!battle.sparring || actor.move || actor.force || isOutside(actor) || isOutside(enemy)) return
  const now = battle.time
  const ward = battle.runtime.shieldCasts.get(enemy.id)
  const ownWard = battle.runtime.shieldCasts.get(actor.id)
  const last = ownWard?.trace.get(enemy.id)
  const ownTrace = ownWard?.trace.get(actor.id)
  if (!ownWard?.skill || ownWard.owner !== actor.id || !ownWard.used.has("manual") ||
    !ownTrace?.shieldValue || (last?.damage ?? 0) > 0) return
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const options = { lockedTarget: true, choreography: true, position }
  const immediate = pressureStrikes(battle, actor, enemy, now, now + 1, { ...options, intent })[0]
  if (!immediate?.skill || immediate.skill !== ownWard.skill) return
  const enemyClock = sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring
  const issuedAt = ownWard.issuedAt
  const previousWindup = fixedSkillWindup(ownWard.skill) ?? 0
  const missed = issuedAt !== undefined && !last?.hits && !!immediate.area &&
    battle.sparring.actions.some(action => action.actorId === enemy.id && action.name === "移动" && action.time >= issuedAt &&
      action.time < issuedAt + previousWindup + (immediate.step?.delay ?? 0))
  const canEvade = missed && canStepOutOfStrike(battle, enemy, immediate, Math.max(now, enemyClock.sharedAt, enemyClock.moveAt))
  const activeShield = ward?.skill && ward.owner === enemy.id && ward.used.has("manual") && enemy.shield > 0 && enemy.shieldUntil > now + 1.4
  if (!canEvade && !activeShield) return
  const standing = landedDamage(battle, enemy, immediate, position)
  const shift = attackShift(battle, immediate, enemy)
  const tradingShields = !!activeShield && standing.shieldLoss > 0 && standing.hpLoss < actor.attack * .25 && !(shift && isOutside(shift.end))
  if (!canEvade && !tradingShields) return
  const danger = announcedStrikes(battle, actor, now + 1.7, position)
  const incoming = danger.find(contact => contact.at > now + SPARRING_STEP * 2 &&
    announcedHit(battle, contact, actor, position(actor, contact.at), position))
  if (incoming) {
    const recovery = counterBeforeImpact(battle, actor, enemy, incoming, danger, position)
    if (recovery) return { actor, intent: { ...recovery, value: intent.value } }
    return
  }
  const readyAt = Math.max(enemy.actionAt, enemyClock.sharedAt, enemy.force ? enemy.force.since + enemy.force.duration : 0)
  const lifeLoss = actor.hp - lifeThroughStrikes(battle, actor, danger, position).hp
  const next = Math.max(now, readyAt)
  if (!actor.shield || lifeLoss > 0 || actor.shieldUntil <= now + 1.4) return
  const wait = next - now
  if (canEvade && !enemy.move && !enemy.force && !standing.hpLoss &&
    actor.hp <= actor.maxHp * .35 && actor.shield < .7 * ownTrace.shieldValue) {
    const recovery = healDuringShieldExchange(battle, actor, enemy, immediate, next, position)
    if (recovery) return { actor, intent: { ...recovery, value: intent.value } }
  }
  if (canEvade && next > now + SPARRING_STEP && wait <= 1.4 && !enemy.move && !enemy.force && actor.shieldUntil > next + .9) {
    const quick = pressureStrikes(battle, actor, enemy, now, next - SPARRING_STEP, { order: "basic", position })[0]
    if (quick) {
      const hit = landedDamage(battle, enemy, quick, position, contactCast(quick, enemy))
      const push = attackShift(battle, quick, enemy)
      if (hit.lethal || push && isOutside(push.end)) return { actor, intent: { ...quick.intent, value: intent.value } }
      if (hit.hpLoss >= actor.attack * .28) {
        const displaced = afterContact(battle, enemy, quick, push)
        const response = Math.max(next, quick.impact + (push?.duration ?? 0))
        const replies = pressureStrikes(battle, enemy, actor, response, response + .95, { ...options, position: displaced })
        if (replies.every(reply => !landedDamage(battle, actor, reply, displaced, contactCast(reply, actor)).hpLoss &&
          !isOutside(attackShift(battle, reply, actor)?.end ?? actor))) return { actor, intent: { ...quick.intent, value: intent.value } }
      }
    }
  }
  // Once a real sidestep stopped a line, wait for one enemy action while the
  // current ward and the remaining response time make that trade affordable.
  if (canEvade && !enemy.move && !enemy.force && actor.shieldUntil > next + .95 && wait <= Math.min(2.8, actor.actionCooldown * .56) &&
    (wait > 0 || timing === "before-opponent" && now - readyAt <= decisionFrame())) {
    const replies = pressureStrikes(battle, enemy, actor, next, next + .95, options)
    const ownClock = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring
    const movementReady = Math.max(ownClock.moveAt, ownClock.sharedAt, next + decisionFrame())
    const canAnswer = replies.length > 0 && replies.every(reply => {
      const hit = landedDamage(battle, actor, reply, position, contactCast(reply, actor))
      const push = attackShift(battle, reply, actor)
      const landingInReach = !push || !isOutside(push.end) && edgeDistance(push.end, position(enemy, reply.impact)) <=
        attackRange(battle, actor, enemy, reply.impact) + 24
      if (landingInReach && hit.hpLoss === 0) return true
      return canStepOutOfStrike(battle, actor, reply, movementReady)
    })
    if (canAnswer) return wait > 0 ? "wait" : "react"
  }
  // Stop waiting when the enemy had a ready decision and took no action.
  if (!tradingShields || now - readyAt > decisionFrame() * 2 + .01 || next > now + 2.3 ||
    next > now + 1.25 && actor.shield < enemy.attack * 1.35 || !actor.actives.some(skill =>
      skill.aim.mode === "point" && reflection(skill) && fixedSkillWindup(skill) !== undefined && skill.steps.some(step => !step.watch &&
        step.operations.some(op => op.kind === "h") && step.operations.some(op => op.kind === "b")))) return
  const replies = pressureStrikes(battle, enemy, actor, next, next + .85, options)
  if (replies.some(reply => {
    const hit = landedDamage(battle, actor, reply, position)
    return hit.hpLoss > actor.maxHp * .06 || isOutside(attackShift(battle, reply, actor)?.end ?? actor)
  })) return
  if (replies.length && replies.every(reply => refreshingShield(battle, reply)) && actor.hp > actor.maxHp * .90) return
  return "wait"
}

function canStepOutOfStrike(battle: EdgeBattle, target: EdgeFighter, strike: PressureStrike, start: number) {
  const { area, step, skill, impact } = strike
  if (!area || !step || !skill || impact - start < .13 || target.force || target.move || isOutside(target) || movementStopped(battle, target)) return false
  const speed = movementSpeed(battle, target)
  const travel = Math.min(MOVE_REACH, speed * (impact - start - .04))
  const axis = direction(strike.origin, strike.intent.at)
  const bearings = [left(axis), rotate(axis, -90), axis, rotate(axis, 180)]
  const cast = contactCast(strike, target)
  return bearings.some(bearing => {
    const request = inside(along(target, bearing, travel), 15)
    const landing = moveLanding(target, request, battle)
    if (!landing || dancerMovesBySkill(battle, target, request)) return false
    const distance = edgeDistance(target, landing)
    const arrival = start + distance / speed
    return distance > 12 && distance <= travel + 1 && !skillAreaContains(cast, step.selector.shape, area, landing) &&
      !summonTerrainInPath(battle, target, landing) && !availablePortalExit(battle, target, landing, arrival) &&
      !walksIntoWarning(battle, target, landing, arrival, undefined, start) && !walksIntoShoreBeast(battle, target, landing, arrival, undefined, start)
  })
}

export function waitForClearFinish(battle: EdgeBattle, attack: TeamAttack, opponents: EdgeFighter[], beforeOpponent: boolean) {
  const { actor, intent } = attack
  const target = intent.target
  const sparring = battle.sparring
  if (!sparring || opponents.length < 2 || intent.order === "basic" || !target || !isFighter(target) ||
    target.hp > actor.attack * .88 || target.move || target.force || isOutside(target)) return
  const now = battle.time
  const theirs = sideOf(battle, actor.id) === "ally" ? sparring : battle
  const ableToAct = opponents.filter(unit => !unit.force && !unit.move && !isOutside(unit))
  const ready = Math.max(theirs.sharedAt, Math.min(...ableToAct.map(unit => unit.actionAt)))
  const frame = decisionFrame()
  if (ready > now + 1.25 || ready <= now && (!beforeOpponent || now - ready > frame)) return
  const deadline = now + COOLDOWN.shared
  const opening = chosenContact(battle, attack, target, deadline)
  if (!opening?.strike.area || !opening.hit.lethal ||
    !canStepOutOfStrike(battle, target, opening.strike, Math.max(now, theirs.moveAt, theirs.sharedAt))) return
  if (opponents.some(other => {
    if (other === target) return false
    const hit = chosenContact(battle, attack, other, deadline)
    return hit?.hit.lethal || (hit?.hit.hpLoss ?? 0) >= actor.attack * .55
  })) return

  const next = Math.max(now, ready)
  const until = next + frame + (opening.strike.impact - now) + SPARRING_STEP * 2
  const stance = (unit: EdgeUnit, at: number) => unit.id === actor.id ? actor : future(battle, unit, at - now)
  const queued = announcedStrikes(battle, actor, until, stance)
  if (queued.length && (lifeThroughStrikes(battle, actor, queued, stance).hp < Math.max(1, actor.hp - actor.attack * .25) ||
    queued.some(contact => announcedShift(battle, contact, actor, stance)))) return
  // Let a plausible enemy action spend shared cooldown before committing the
  // finishing shot. A defensive cast may close the window, so recheck it.
  const replies = ableToAct.flatMap(enemy => pressureStrikes(battle, enemy, actor, Math.max(next, enemy.actionAt), until,
    { position: stance, choreography: true, lockedTarget: true }))
  if (replies.some(reply => {
    const hit = landedDamage(battle, actor, reply, stance, contactCast(reply, actor))
    const push = attackShift(battle, reply, actor)
    return hit.lethal || hit.hpLoss >= actor.hp * .26 || push && isOutside(push.end)
  })) return
  return ready > now ? "wait" : "react"
}

function healDuringShieldExchange(battle: EdgeBattle, actor: EdgeFighter, enemy: EdgeFighter, immediate: PressureStrike,
  enemyAt: number, position: (unit: EdgeUnit, time: number) => EdgePoint) {
  const wardStep = immediate.skill?.steps.find(step => step.delay === immediate.step?.delay && !step.zone && !step.watch &&
    step.selector.units !== "e" && step.operations.some(op => op.kind === "b" && !op.style))
  const ward = wardStep?.operations.find(op => op.kind === "b" && !op.style)
  if (!ward || !refreshingShield(battle, immediate)) return
  const shield = Math.round(actor.maxHp * ward.args[0] / 100)
  const lineAid = { at: immediate.impact, shield, shieldUntil: immediate.impact + (ward.args[1] ?? 12) }
  const replies = pressureStrikes(battle, enemy, actor, enemyAt, enemyAt + .95, { position, lockedTarget: true, choreography: true })
  if (replies.some(reply => isOutside(attackShift(battle, reply, actor)?.end ?? actor))) return
  const lineLife = replies.map(reply => healthAfterReply(battle, actor, reply, position, lineAid))
  for (const { aid, intent } of reflectionWards(battle, actor)) {
    const minimumGain = actor.attack * .20
    if (aid.heal < minimumGain || aid.at > immediate.impact + .08) continue
    if (replies.every((reply, index) => healthAfterReply(battle, actor, reply, position, aid) >= lineLife[index] + minimumGain)) return intent
  }
}

function healthAfterReply(battle: EdgeBattle, actor: EdgeFighter, reply: PressureStrike,
  position: (unit: EdgeUnit, time: number) => EdgePoint, aid: TimedAid) {
  const existing = aidBeforeHit(battle, actor, reply.impact, position)
  const receives = aid.at + SPARRING_STEP < reply.impact
  const hp = Math.min(actor.maxHp, existing.hp + (receives ? aid.heal ?? 0 : 0))
  const shield = Math.max(existing.shield, receives ? aid.shield ?? 0 : 0)
  const source = reply.sourceAtImpact ? { ...reply.origin, ...reply.sourceAtImpact } : reply.origin
  const hit = estimateDirectHit(battle, source, actor, reply.power, reply.intent.order === "basic" ? "basic" : "skill",
    reply.at, reply.impact, shield, { ...existing, hp, cast: contactCast(reply, actor) })
  if (hit.lethal) return 0
  return Math.min(actor.maxHp, hp - hit.hpLoss + hit.saveHeal + (receives ? 0 : aid.heal ?? 0))
}

function reflection(skill: EdgeActive) {
  return skill.steps.find(step => step.watch?.rule.event === "hurt" && step.watch.rule.flags.includes("to") &&
    step.selector.units === "u")?.operations.find(op => op.kind === "d" && op.style === "reflect")?.args[0]
}

function* reflectionWards(battle: EdgeBattle, actor: EdgeFighter) {
  const now = battle.time
  for (const [slot, skill] of actor.actives.entries()) {
    const power = reflection(skill)
    if (!power || skill.aim.mode !== "point" || skillCastProblem(battle, actor, skill, actor)) continue
    const windup = fixedSkillWindup(skill, true)
    const ward = skill.steps.find(step => !step.watch && !step.zone && step.selector.units !== "e" &&
      step.operations.some(op => op.kind === "h" && !op.style) && step.operations.some(op => op.kind === "b" && !op.style))
    if (windup === undefined || !ward) continue
    const recipients = predictSkillTargets(battle, actor, skill, actor)
    if (!recipients.find(row => row.step === ward)?.targets.includes(actor)) continue
    const at = now + windup + ward.delay
    const shield = ward.operations.find(op => op.kind === "b")!
    const { received, healingAmp, recovery } = healFactors(battle, actor, actor, false, at)
    const heal = Math.min(actor.maxHp - actor.hp, Math.round(actor.maxHp * ward.operations.find(op => op.kind === "h")!.args[0] / 100 *
      (1 + received / 100) * (1 + healingAmp / 100) * recovery))
    const aid = { at, shield: Math.round(actor.maxHp * shield.args[0] / 100), heal, shieldUntil: at + (shield.args[1] ?? 12) }
    yield { intent: { order: slot ? "skill2" : "skill", at: actor, value: 0 } satisfies AiAttack, aid, power,
      watchesAt: (hit: number) => recipients.some(({ step, targets }) => step.watch?.rule.event === "hurt" &&
        now + windup + step.delay + SPARRING_STEP < hit && now + windup + step.delay + step.watch.duration > hit && targets.includes(actor)) }
  }
}

function counterBeforeImpact(battle: EdgeBattle, actor: EdgeFighter, enemy: EdgeFighter, incoming: AnnouncedStrike,
  danger: AnnouncedStrike[], position: (unit: EdgeUnit, time: number) => EdgePoint) {
  const now = battle.time
  if (incoming.source !== enemy || incoming.at > now + 1.1) return
  const existing = lifeThroughStrikes(battle, actor, danger, position)
  let best: { intent: AiAttack; gain: number } | undefined
  for (const { intent, aid, power, watchesAt } of reflectionWards(battle, actor)) {
    if (aid.at + SPARRING_STEP >= incoming.at || !watchesAt(incoming.at)) continue
    const protectedLife = lifeThroughStrikes(battle, actor, danger, position, [aid])
    if (!protectedLife.hp) continue
    const hit = targetable(battle, enemy, incoming.at)
      ? estimateDirectHit(battle, actor, enemy, power, "skill", position(enemy, incoming.at), incoming.at) : undefined
    const healthSaved = protectedLife.hp - existing.hp
    const alreadyRefills = scheduledAid(battle, enemy, incoming.at + .10, position)
      .some(aid => Math.abs(aid.at - incoming.at) < .10 && aid.shield >= enemy.shield)
    const chip = alreadyRefills ? 0 : (hit?.shieldLoss ?? 0) * .26
    const hpLoss = hit?.hpLoss ?? 0
    if (healthSaved <= 0 && !hpLoss && !chip) continue
    // A smaller ward with a reaction is worthwhile when the heal sticks or
    // the counter reaches health before the attacking shield is refreshed.
    if (!hit?.lethal && hpLoss + healthSaved + chip < actor.attack * .52) continue
    const gain = (hit?.lethal ? enemy.maxHp : 0) + hpLoss + healthSaved + chip
    if (!best || gain > best.gain) best = { intent, gain }
  }
  return best?.intent
}

export function answerRefreshingStrike(battle: EdgeBattle, actor: EdgeFighter, enemy: EdgeFighter, intent?: AiAttack) {
  if (actor.move || actor.force || isOutside(actor) || actor.hp >= actor.maxHp * .84 ||
    !actor.actives.some(skill => reflection(skill)) ||
    intent?.order === "basic" && actor.range < 200 && basicCanFinish(battle, actor, enemy)) return
  const now = battle.time
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const contacts = announcedStrikes(battle, actor, now + 1, position)
  const hit = contacts.find(contact => contact.source === enemy && contact.at > now + SPARRING_STEP &&
    announcedHit(battle, contact, actor, actor, position)?.hpLoss && scheduledAid(battle, enemy, contact.at + .03, position)
      .some(aid => aid.shield > 0 && Math.abs(aid.at - contact.at) < .035))
  if (!hit) return
  const attack = intent && chosenContact(battle, { actor, intent }, enemy, hit.at - SPARRING_STEP)
  if (attack) {
    const stillHits = "area" in hit.strike ? !hit.strike.needsOwner : !!hit.strike.launchedFrom
    const shift = attackShift(battle, attack.strike, enemy)
    if (attack.hit.lethal && !stillHits || attack.hit.hpLoss - attack.hit.saveHeal >= actor.attack * .5 ||
      shift && !isOutside(attack.strike.at) && isOutside(shift.end)) return
  }
  const reply = counterBeforeImpact(battle, actor, enemy, hit, contacts, position)
  return reply && { ...reply, value: 3.1 }
}

function afterContact(battle: EdgeBattle, target: EdgeFighter, strike: PressureStrike, shift: ReturnType<typeof attackShift>) {
  const now = battle.time
  return (unit: EdgeUnit, at: number): EdgePoint => {
    if (!shift || unit !== target || at <= strike.impact) return future(battle, unit, at - now)
    const { end, duration, push } = shift
    const elapsed = at - strike.impact
    const crossed = !isOutside(strike.at) && isOutside(end)
    if (elapsed >= duration && (!push || !target.move || strike.skill || crossed || movementStopped(battle, target))) return end
    if (elapsed >= duration && target.move) {
      const distance = Math.min(edgeDistance(end, target.move), (elapsed - duration) * movementSpeed(battle, { ...target, ...end }))
      return along(end, direction(end, target.move), distance)
    }
    const fraction = 1 - (1 - clamp(elapsed / duration, 0, 1)) ** 3
    return { x: strike.at.x + (end.x - strike.at.x) * fraction, y: strike.at.y + (end.y - strike.at.y) * fraction }
  }
}

const decisionFrame = () => Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
function followAt(battle: EdgeBattle, actor: EdgeFighter) {
  const decisionStep = decisionFrame()
  const force = actor.force ? actor.force.since + actor.force.duration - battle.time + SPARRING_STEP : 0
  const wait = Math.max(actor.actionAt - battle.time, COOLDOWN.shared, force)
  return battle.time + Math.ceil(wait / decisionStep - 1e-6) * decisionStep
}

function pressable(battle: EdgeBattle, actor: EdgeFighter, place: EdgePoint) {
  return actor.hp > actor.maxHp * .25 && !isOutside(place) &&
    (!actor.move || movementStopped(battle, actor) || edgeDistance(actor.move, place) <= 5)
}

function contactPlan(battle: EdgeBattle, target: EdgeFighter, strikes: PressureStrike[], end: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint,
  { controlled, announced = announcedStrikes(battle, target, end), blockedRescue }:
    { controlled?: PressureStrike; announced?: AnnouncedStrike[]; blockedRescue?: SummonGroup } = {}) {
  const pulses = scheduledAid(battle, target, end, position, blockedRescue)
  let { hp, shield, shieldUntil } = target
  let aidIndex = 0
  const spent = directHitForecast()
  const defy: Buff[] = []
  const hits = [
    ...announced.filter(contact => contact.at <= end).map(contact => ({ at: contact.at, contact })),
    ...strikes.map(strike => ({ at: strike.impact, strike })),
  ].sort((a, b) => a.at - b.at)
  for (const beat of hits) {
    while (aidIndex < pulses.length && pulses[aidIndex].at <= beat.at + 1e-6) {
      const aid = pulses[aidIndex++]
      if (aid.below !== undefined && (hp >= aid.below || aid.at + SPARRING_STEP > beat.at)) continue
      hp = Math.min(target.maxHp, hp + aid.heal)
      if (aid.shield > 0 && (aid.at >= shieldUntil || aid.shield >= shield)) {
        shield = aid.shield
        shieldUntil = aid.shieldUntil
      }
      if (aid.defy && aid.at + SPARRING_STEP < beat.at) addForecastGuard(defy, aid.defy)
    }
    if (shieldUntil <= beat.at) shield = 0
    const hit = "contact" in beat
      ? announcedHit(battle, beat.contact, target, position(target, beat.at), position, hp, shield, 0, spent, defy)
      : estimateDirectHit(battle, beat.strike.sourceAtImpact ? { ...beat.strike.origin, ...beat.strike.sourceAtImpact } : beat.strike.origin,
        target, beat.strike.power, beat.strike.intent.order === "basic" ? "basic" : "skill",
        beat.strike.at, beat.at, shield, { hp, spent, defy, controlled: beat.strike === controlled })
    if (!hit) continue
    hp += hit.saveHeal - hit.hpLoss
    shield -= hit.shieldLoss
    if (hp <= 0) return { hp: 0, downAt: beat.at }
  }
  while (aidIndex < pulses.length) {
    const aid = pulses[aidIndex++]
    if (aid.below !== undefined && hp >= aid.below) continue
    hp = Math.min(target.maxHp, hp + aid.heal)
  }
  return { hp, downAt: Infinity }
}

function impendingShove(battle: EdgeBattle, target: EdgeFighter, until: number) {
  return announcedStrikes(battle, target, until).flatMap(contact => {
    const { at, source, strike } = contact
    if (!isFighter(source) || !strike.cast.skill || !("area" in strike) || !strike.step || target.force) return []
    const position = future(battle, target, at - battle.time)
    if (!skillAreaContains(strike.cast, strike.step.selector.shape, strike.area, position)) return []
    const first = { origin: { ...source, ...strike.cast.from }, skill: strike.cast.skill, step: strike.step, area: strike.area, at: position,
      impact: at, power: strike.power, intent: { order: "skill" as const, at: strike.cast.aim, value: 0 } }
    const shift = attackShift(battle, first, target)
    return shift ? [{ contact, strike: first, shift }] : []
  })[0]
}

function pursuitPosition(battle: EdgeBattle, target: EdgeFighter, at: EdgePoint, start: number, time: number) {
  if (time <= start) return at
  const goal = inside(at, 55)
  const edge = edgeDistance(at, fieldCrossing(goal, at))
  const outside = movementSpeed(battle, { ...target, ...at })
  const elapsed = time - start
  const distance = Math.min(edge, elapsed * outside) + Math.max(0, elapsed - edge / outside) * outside / EXILE.speed
  return along(at, direction(at, goal), Math.min(distance, edgeDistance(at, goal)))
}

export function followUpApproach(battle: EdgeBattle, team: EdgeFighter[], enemies: EdgeFighter[],
  routeTo: (actor: EdgeFighter, target: EdgeFighter, at: EdgePoint, finishingRange?: number) =>
    { point: EdgePoint; stop: EdgePoint; arrival: number } | undefined):
  PressureMove | undefined {
  const now = battle.time
  const until = now + 2.55
  let best: PressureMove | undefined
  for (const target of enemies) {
    if (target.hp > target.maxHp * .28) continue
    const track = battle.runtime.histories.get(target.id)
    const pending = impendingShove(battle, target, now + .75)
    const recent = track && (now - track.pushAt <= 1 && sameSide(battle, track.pushBy, team[0]?.id) ||
      now - track.pullAt <= 1 && sameSide(battle, track.pullBy, team[0]?.id))
    const returned = !isOutside(target) && track?.returnedAt !== undefined && now - track.returnedAt < COOLDOWN.move &&
      track.pushAt <= track.returnedAt && track.returnedAt - track.pushAt < 3 && sameSide(battle, track.pushBy, team[0]?.id)
    if (!pending && !recent && !returned) continue
    const end = pending?.shift.end ?? target.force?.end ?? target.move ?? target
    const landAt = pending ? pending.strike.impact + pending.shift.duration :
      target.force ? target.force.since + target.force.duration : now
    const leave = isOutside(end)
    const projected = pending && afterContact(battle, target, pending.strike, pending.shift)
    const position = (unit: EdgeUnit, time: number) => {
      if (unit !== target) return future(battle, unit, time - now)
      if (leave && time > landAt && (pending || target.force || !target.move)) return pursuitPosition(battle, target, end, landAt, time)
      return projected?.(unit, time) ?? future(battle, unit, time - now)
    }
    const announced = pending && announcedStrikes(battle, target, until).filter(contact => contact.strike !== pending.contact.strike)
    const opening = pending ? [pending.strike] : []
    const response = Math.max(target.actionAt, sideOf(battle, target.id) === "ally" ? battle.sharedAt : battle.sparring?.sharedAt ?? now)
    const horizon = Math.min(until, shieldForecast(battle, target, until), returned ? response - .005 : Infinity)
    for (const actor of team) {
      if (actor === pending?.strike.origin || actor.hp <= actor.maxHp * .40 || isOutside(actor) || moveProblem(battle, actor) || actor.move ||
        actor.actionAt >= horizon - .25 || target.hp > actor.attack * 2.6) continue
      const start = now + Math.max(COOLDOWN.shared, actor.actionAt - now)
      const options = { lockedTarget: true, exchange: true, position }
      const strikesAt = (start: number, place: typeof position) => {
        const strikes = pressureStrikes(battle, actor, target, start, horizon, { ...options, position: place })
        if (returned) strikes.push(...swapFinishStrikes(battle, actor, target, team, start, horizon, place))
        return strikes
      }
      const canFinish = (strike: PressureStrike, projected: typeof position) => {
        const result = contactPlan(battle, target, [...opening, strike], strike.impact, projected, { announced })
        return result.hp <= 0 && result.downAt >= strike.impact - .02
      }
      const standing = strikesAt(start, position)
      if (returned ? standing.some(strike => canFinish(strike, position)) : standing.length) continue
      const aim = position(target, Math.max(start, landAt) + .32)
      const swapRange = returned ? Math.max(0, ...actor.actives.map(skill => {
        const swap = offensiveSwap(skill)
        return swap?.bothEnds ? swap.radius : 0
      })) : 0
      const routes = [routeTo(actor, target, aim)]
      if (swapRange > 0) routes.push(routeTo(actor, target, aim, swapRange - 5))
      for (const route of routes) {
        if (!route || route.arrival > horizon - .24) continue
        const arrival = route.arrival + (returned ? SPARRING_STEP : 0)
        const ready = now + Math.ceil((Math.max(start, arrival) - now) / decisionFrame() - 1e-6) * decisionFrame()
        const withMove = (unit: EdgeUnit, time: number) => unit !== actor ? position(unit, time) :
          time >= route.arrival ? route.stop : returned ? walkAt(actor, route.stop, now, route.arrival, time) : position(unit, time)
        for (const strike of strikesAt(ready, withMove)) {
          if (!canFinish(strike, withMove)) continue
          const hits = returned ? announcedStrikes(battle, actor, strike.impact, withMove) : []
          if (hits.length && (hits.some(hit => announcedShift(battle, hit, actor, withMove)) ||
            !lifeThroughStrikes(battle, actor, hits, withMove).hp)) continue
          const value = 3.25 - .44 * (strike.impact - now)
          if (!best || value > best.value) best = { actor, point: route.point, value }
        }
      }
    }
  }
  return best
}

export function pressAnOpening(battle: EdgeBattle, team: EdgeFighter[], enemies: EdgeFighter[], current: TeamAttack):
  TeamAttack | undefined {
  if (team.length < 2 || enemies.length < 2) return
  const now = battle.time
  const horizon = now + 2.35
  const { actor, intent } = current
  if (actor.hp <= actor.maxHp * .25 || actor.force || isOutside(actor) ||
    actor.move && !movementStopped(battle, actor) || actor.actionAt > now) return
  const follow = team.filter(ally => ally !== actor).map(actor => ({ actor, start: followAt(battle, actor) }))
    .filter(({ actor, start }) => start + .06 < horizon && pressable(battle, actor, future(battle, actor, start - now)))
  if (!follow.length) return
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const center = follow.reduce((point, { actor, start }) => {
    const at = position(actor, start)
    return { x: point.x + at.x / follow.length, y: point.y + at.y / follow.length }
  }, { x: 0, y: 0 })
  let best: { strike: PressureStrike; value: number } | undefined
  for (const target of enemies) {
    if (target.hp > target.maxHp * .48 || (chargeOf(battle, target)?.until ?? 0) > now) continue
    const targetHistory = battle.runtime.histories.get(target.id)
    if (!targetHistory || targetHistory.hitBy === actor.id || !sameSide(battle, targetHistory.hitBy, actor.id) ||
      targetHistory.hitAt < now - 2.3) continue
    const defense = shieldForecast(battle, target, horizon)
    const baseline = pressureStrikes(battle, actor, target, now, horizon, { intent, lockedTarget: true, exchange: true })[0]
    if (!baseline) continue
    const already = contactPlan(battle, target, [baseline], baseline.impact, position)
    if (already.hp <= 0) return
    const deadline = Math.min(horizon, defense)
    const baselineShift = attackShift(battle, baseline, target)
    const baselinePosition = afterContact(battle, target, baseline, baselineShift)
    const warden = combatHasRole(actor, "warden") && intent.order !== "basic"
    const controlAt = (strike: PressureStrike, shift: ReturnType<typeof attackShift>) =>
      warden && shift && edgeDistance(strike.at, shift.end) >= WARDEN_CONTROL.distance ? strike.impact + shift.duration : Infinity
    const baselineControl = controlAt(baseline, baselineShift)
    const baselineFollow = new Map<EdgeFighter, PressureStrike[]>()
    const originalFollow = (partner: EdgeFighter, start: number) => {
      let strikes = baselineFollow.get(partner)
      if (!strikes) {
        strikes = pressureStrikes(battle, partner, target, start, deadline,
          { lockedTarget: true, exchange: true, position: baselinePosition })
          .filter(strike => strike.impact > baseline.impact + .07)
        baselineFollow.set(partner, strikes)
      }
      return strikes
    }
    for (const first of pressureStrikes(battle, actor, target, now, deadline,
      { order: intent.order, lockedTarget: true, exchange: true, partner: center })) {
      if (edgeDistance(first.intent.at, intent.at) < 3) continue
      const shift = attackShift(battle, first, target)
      const projected = afterContact(battle, target, first, shift)
      const controlsAt = controlAt(first, shift)
      for (const { actor: partner, start } of follow) {
        for (const second of pressureStrikes(battle, partner, target, start, deadline,
          { lockedTarget: true, exchange: true, position: projected })) {
          if (second.impact <= first.impact + .07) continue
          const result = contactPlan(battle, target, [first, second], second.impact, projected,
            { controlled: second.impact > controlsAt ? second : undefined })
          if (result.downAt < second.impact - .02) continue
          // Keep the original area if it already gives this ally the same opening.
          const prior = originalFollow(partner, start)
          if (prior.some(strike => strike.impact <= second.impact + .12 &&
            contactPlan(battle, target, [baseline, strike], strike.impact, baselinePosition, {
              controlled: strike.impact > baselineControl ? strike : undefined,
            }).hp <= result.hp + 6)) continue
          const plain = contactPlan(battle, target, [baseline], second.impact, baselinePosition)
          const gain = (plain.hp - result.hp) / target.maxHp
          const pushedAway = baselineShift && !isOutside(baseline.at) && isOutside(baselineShift.end) &&
            !isOutside(shift?.end ?? first.at)
          const keepsReach = pushedAway && prior.length === 0
          const significant = gain >= .10 && (result.hp <= target.maxHp * .18 && plain.hp > target.maxHp * .19 ||
            keepsReach && result.hp <= target.maxHp * .15 && result.hp < plain.hp * .56)
          if (result.hp > 0 && (!significant || !shift)) continue
          if (result.hp > 0 && !keepsReach && first.area && baseline.area && enemies.some(enemy => enemy !== target &&
            areaHits(baseline.area!, position(enemy, first.impact)) && !areaHits(first.area!, position(enemy, first.impact)))) continue
          const value = 4.55 + gain * 2 + (result.hp <= 0 ? .7 : 0) - .4 * (second.impact - now)
          if (value > (best?.value ?? 0)) best = { strike: first, value }
        }
      }
    }
  }
  if (!best) return
  const { strike, value } = best
  return { actor, intent: { ...strike.intent, value: Math.max(current.intent.value, value) } }
}

export function redirectShieldedAttack(battle: EdgeBattle, team: EdgeFighter[], enemies: EdgeFighter[], current: TeamAttack): TeamAttack | undefined {
  const breakRescue = rescueBreak(battle, team, enemies, current)
  if (breakRescue) return breakRescue
  const { actor, intent } = current
  const currentTarget = intent.target
  const now = battle.time
  if (intent.order !== "basic") {
    const skill = actor.actives[intent.order === "skill" ? 0 : 1]
    if (skill.aim.mode === "point" || skill.aim.mode === "direction") return redirectShieldedArea(battle, team, enemies, current, skill)
  }
  if (enemies.length < 2 || !currentTarget || !isFighter(currentTarget)) return
  const shielded = currentTarget.shield > 0 && currentTarget.shieldUntil > now
  if (!shielded && !nearbyBulwark(battle, currentTarget) && !battle.runtime.fields.some(field =>
    (field.mode === "guard" || field.mode === "cover") && sameSide(battle, field.cast.owner, currentTarget.id) &&
    field.until > now && areaHits(field.area, currentTarget)) &&
    !battle.runtime.summons.some(group => group.target === currentTarget.id && group.deployment.kind === "rescue" &&
      group.dismissedAt === undefined && group.deployment.bodies[0].hp > 0 && currentTarget.hp < currentTarget.maxHp * .4)) return
  if (intent.order !== "basic") {
    const skill = actor.actives[intent.order === "skill" ? 0 : 1]
    // Keep attacks with independent effects on other cards or the board at their original aim.
    if (skill.aim.mode !== "enemy" || skill.steps[0]?.selector.units !== "t" ||
      skill.steps[0].operations.some(op => op.kind !== "d" && op.kind !== "i") ||
      skill.steps.slice(1).some(step => step.selector.units !== "s" || step.operations.some(op => op.kind !== "b" && op.kind !== "phase")) ||
      (chargeOf(battle, currentTarget)?.until ?? 0) > now) return
  }
  const end = now + 2.2
  const original = pressureStrikes(battle, actor, currentTarget, now, end, { intent, lockedTarget: true })[0]
  if (!original) return
  const evaluate = (first: typeof original, target: EdgeFighter, refresh: number, hit: ReturnType<typeof landedDamage>) => {
    const hpValue = (loss: number) => loss / target.maxHp * (1 + .5 * (1 - target.hp / target.maxHp))
    const push = intent.order === "basic" ? previewDirectedShove(battle, target, first.at, direction(first.origin, first.at), BASIC_PUSH, first.impact) : first.at
    const ejects = !isOutside(first.at) && isOutside(push)
    const score = hpValue(hit.hpLoss - hit.saveHeal) + .16 * hit.shieldLoss / target.maxHp + (hit.lethal ? .55 : ejects ? .26 : 0)
    if (!hit.shieldLoss || hit.lethal) return score
    const deadline = Math.min(end, refresh - .06)
    if (deadline <= now + COOLDOWN.shared) return score
    let followValue = 0
    const position = afterContact(battle, target, first, attackShift(battle, first, target))
    for (const ally of team) {
      if (ally === actor) continue
      const start = followAt(battle, ally)
      if (start >= deadline) continue
      if (ally.move && !movementStopped(battle, ally) && edgeDistance(position(ally, start), ally.move) > 5) continue
      for (const follow of pressureStrikes(battle, ally, target, start, deadline, { lockedTarget: true, position })) {
        if (follow.impact <= first.impact + .06) continue
        const surviving = contactPlan(battle, target, [first, follow], follow.impact, position)
        const alone = contactPlan(battle, target, [follow], follow.impact, position)
        const opened = contactPlan(battle, target, [first], follow.impact, position)
        const extra = Math.max(0, opened.hp - surviving.hp - Math.max(0, target.hp - alone.hp))
        const opensFinish = surviving.hp <= 0 && surviving.downAt >= follow.impact - .02 && alone.hp > 0
        followValue = Math.max(followValue, hpValue(extra) + (opensFinish ? .40 : 0))
      }
    }
    return score + .85 * followValue
  }
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const hit = landedDamage(battle, currentTarget, original, position)
  if (hit.lethal) return
  if (!shielded && hit.shieldLoss === 0 && hit.hpLoss - hit.saveHeal > actor.attack * original.power * .52) return
  let best: typeof original | undefined
  let value = evaluate(original, currentTarget, shieldForecast(battle, currentTarget, end), hit) + .04
  for (const enemy of enemies) {
    if (enemy === currentTarget) continue
    const candidate = pressureStrikes(battle, actor, enemy, now, end, { order: intent.order, lockedTarget: true })[0]
    if (!candidate) continue
    const score = evaluate(candidate, enemy, shieldForecast(battle, enemy, end), landedDamage(battle, enemy, candidate, position))
    if (score > value) {
      best = candidate
      value = score
    }
  }
  return best && { actor, intent: { ...best.intent, value: intent.value } }
}

function redirectShieldedArea(battle: EdgeBattle, team: EdgeFighter[], enemies: EdgeFighter[], current: TeamAttack, skill: EdgeActive) {
  const { actor, intent } = current
  const now = battle.time
  if (enemies.length < 2 || isOutside(actor)) return
  const [first, ...support] = skill.steps
  if (!first || first.zone || first.watch || first.selector.units !== "e" || first.selector.limit || first.selector.flags.length ||
    first.selector.exclude || first.selector.anchor && !["p", "o"].includes(first.selector.anchor) ||
    first.selector.shape !== "C" && first.selector.shape !== "L") return
  const windup = fixedSkillWindup(skill)
  const power = first.operations.find(op => op.kind === "d" && !op.style && op.args.length === 1)?.args[0]
  if (!power || windup === undefined || windup + first.delay > 1.1 ||
    first.operations.some(op => !["d", "p", "l", "i"].includes(op.kind) || op.kind === "i" && enemies.some(unit => chargeOf(battle, unit))) ||
    support.some(step => step.watch || step.zone || !["s", "a"].includes(step.selector.units) ||
      step.operations.some(op => !["b", "h"].includes(op.kind) || op.style))) return
  const impact = now + windup + first.delay
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const enemyAid = battle.runtime.pending.some(({ due, support }) =>
    support && due + SPARRING_STEP < impact && !sameSide(battle, actor.id, support.cast.owner))
  if (!enemyAid && !enemies.some(enemy => enemy.shield > 0 && enemy.shieldUntil > now + .2 || nearbyBulwark(battle, enemy))) return
  const options = { order: intent.order, position }
  const until = now + 2.55
  const contactsFor = (aim: AiAim) => enemies.flatMap(enemy => {
    const strike = pressureStrikes(battle, actor, enemy, now, until, { ...options, intent: { ...intent, ...aim } })[0]
    return strike ? [{ enemy, strike, hit: landedDamage(battle, enemy, strike, position, contactCast(strike, enemy)) }] : []
  })
  const baseline = contactsFor(intent)
  if (!baseline.length) return
  if (baseline.some(({ hit }) => hit.lethal) || baseline.every(({ hit }) => hit.hpLoss >= actor.attack * .38 ||
    !hit.shieldLoss && hit.hpLoss >= actor.attack * .20)) return
  const partners = team.filter(ally => ally !== actor && followAt(battle, ally) < until - .2)
  const benefit = (aim: AiAim, contacts: typeof baseline) => {
    const spent = directHitForecast()
    let value = 0
    for (const { enemy, strike, hit: isolated } of contacts) {
      const aid = contacts.length > 1 && aidBeforeHit(battle, enemy, strike.impact, position)
      const hit = aid ? estimateDirectHit(battle, strike.origin, enemy, strike.power, "skill", strike.at, strike.impact, aid.shield,
        { ...aid, spent, cast: contactCast(strike, enemy) }) : isolated
      const shift = attackShift(battle, strike, enemy)
      const ejects = !isOutside(strike.at) && shift && isOutside(shift.end)
      value += (hit.hpLoss - hit.saveHeal) * (1 + .35 * (1 - enemy.hp / enemy.maxHp)) + hit.shieldLoss * .20 +
        (hit.lethal ? 72 : ejects ? 32 : 0)
      if (!hit.lethal && partners.length && hit.shieldLoss > 0 && enemy.hp <= enemy.maxHp * .6) {
        const projected = afterContact(battle, enemy, strike, shift)
        const deadline = Math.min(until, shieldForecast(battle, enemy, until))
        let follow = 0
        for (const ally of partners) {
          const start = followAt(battle, ally)
          if (start >= deadline || !pressable(battle, ally, projected(ally, start))) continue
          for (const next of pressureStrikes(battle, ally, enemy, start, deadline, { lockedTarget: true, position: projected })) {
            if (next.impact < strike.impact + .06) continue
            const together = contactPlan(battle, enemy, [strike, next], next.impact, projected)
            const alone = contactPlan(battle, enemy, [next], next.impact, projected)
            follow = Math.max(follow, Math.max(0, alone.hp - together.hp - hit.hpLoss) * .55 +
              (together.downAt >= next.impact - .04 && together.hp === 0 && alone.hp > 0 ? 35 : 0))
          }
        }
        value += follow
      }
    }
    if (support.length) {
      const wards = new Map(support.map(step => [step, (unit: EdgeUnit) =>
        unit === actor ? actor : position(unit, now + windup + step.delay)]))
      for (const { step, targets } of predictSkillTargets(battle, actor, skill, aim.at, aim.target, wards)) {
        for (const unit of targets) {
          if (!sameSide(battle, actor.id, unit.id)) continue
          const time = now + windup + step.delay
          for (const op of step.operations) {
            if (op.kind === "b") value += Math.max(0, unit.maxHp * op.args[0] / 100 - (unit.shieldUntil > time ? unit.shield : 0)) *
              (unit.hp < unit.maxHp * .3 ? .72 : .38)
            if (op.kind === "h") value += Math.min(unit.maxHp - unit.hp, unit.maxHp * op.args[0] / 100 * healingReceived(battle, unit, time))
          }
        }
      }
    }
    return value
  }
  const baselineValue = benefit(intent, baseline)
  let best: { aim: AiAim; value: number } | undefined
  for (const target of enemies) {
    const at = position(target, impact)
    const targetAim = first.selector.shape === "L" && skill.aim.mode === "point" ? along(at, direction(actor, at), 18) : at
    const aim = fitAim(actor, skill, { at: targetAim, target })
    if (edgeDistance(aim.at, intent.at) < 4 || !isOnBoard(aim.at) || skillCastProblem(battle, actor, skill, aim.at, aim.target)) continue
    const contacts = contactsFor(aim)
    if (!contacts.length) continue
    const value = benefit(aim, contacts)
    if (value > (best?.value ?? baselineValue + actor.attack * .26)) best = { aim, value }
  }
  return best && { actor, intent: { ...intent, ...best.aim } }
}

export function attackBetweenShields(battle: EdgeBattle, team: EdgeFighter[], enemy: EdgeFighter, current: TeamAttack): TeamAttack | "wait" | undefined {
  if (!battle.sparring || isOutside(enemy) || enemy.shieldUntil <= battle.time || enemy.shield <= 0) return
  const source = battle.runtime.shieldCasts.get(enemy.id)
  if (source?.owner !== enemy.id || !source.used.has("manual") || !source.skill || source.issuedAt === undefined ||
    !enemy.actives.includes(source.skill)) return
  const lead = fixedSkillWindup(source.skill, team.length === 1)
  const ward = source.skill.steps.find(step => !step.watch && !step.zone && step.selector.units !== "e" &&
    step.operations.some(op => op.kind === "b" && op.style !== "stack"))
  if (lead === undefined || !ward) return
  const now = battle.time
  if (current.intent.order === "basic" && current.intent.target?.id !== enemy.id) return
  if (current.intent.order !== "basic") {
    const skill = current.actor.actives[current.intent.order === "skill" ? 0 : 1]
    const damage = team.length === 1 ? skill.steps.some(step => !step.watch && !step.zone && step.operations.some(op => op.kind === "d"))
      : skill.steps[0]?.operations.some(op => op.kind === "d")
    if (!damage) return
    if (skill.steps.some(step => step.operations.some(op => op.kind === "erase")) && (
      battle.runtime.fields.some(field => field.until > now && !sameSide(battle, field.cast.owner, current.actor.id)) ||
      activeDeployments(battle).some(({ group }) => !sameSide(battle, group.owner, current.actor.id))
    )) return
  }
  // Use the observed shield and the next legal refresh from its caster.
  const clocks = sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring
  const last = battle.sparring.actions.findLast(order => order.actorId === enemy.id)
  const pending = last?.name === source.skill.name && last.time > source.issuedAt
  const readyAt = Math.max(enemy.actionAt, clocks.sharedAt,
    enemy.force ? enemy.force.since + enemy.force.duration : 0)
  // A ready opponent can choose a different action. Stop waiting on an unannounced refresh.
  if (!pending && readyAt < now - COOLDOWN.shared) return
  const next = pending ? last.time : Math.max(now, readyAt)
  const refresh = next + lead + ward.delay
  if (refresh < now - .04) return
  if (team.length === 1) return duelShieldTiming(battle, enemy, current, refresh)
  if (!Number.isFinite(refresh)) return

  const ready = team.filter(actor => !actor.move && !actor.force && !isOutside(actor) && actor.hp > actor.maxHp * .25)
  if (ready.length < 2) return
  const damage = ({ origin, power, at }: ReturnType<typeof pressureStrikes>[number]) => origin.attack * power *
    roleDamageScale(battle, origin, enemy) * (1 - enemy.armor) * (isOutside(at) ? EXILE.received : 1)
  const immediate = pressureStrikes(battle, current.actor, enemy, now, refresh - .03, { intent: current.intent })
    .reduce((loss, strike) => Math.max(loss, damage(strike) - (enemy.shieldUntil > strike.impact ? enemy.shield : 0)), 0)
  if (immediate >= enemy.hp) return
  const horizon = now + 3.1
  let best: { attack: TeamAttack; start: number; benefit: number } | undefined
  for (const window of [{ from: now, to: refresh - .05, shield: enemy.shield },
    { from: refresh + .05, to: refresh + enemy.actionCooldown - .05, shield: enemy.shieldStart ?? enemy.shield }]) {
    if (window.from > horizon) break
    for (const actor of ready) {
      const start = Math.max(window.from, actor.actionAt)
      if (start > horizon) continue
      const opening = pressureStrikes(battle, actor, enemy, start, window.to)
      if (!opening.length) continue
      for (const ally of ready) {
        if (ally === actor) continue
        const secondAt = Math.max(ally.actionAt, start + COOLDOWN.shared + .04)
        if (secondAt > horizon + .5) continue
        const followUp = pressureStrikes(battle, ally, enemy, secondAt, window.to)
        for (const first of opening) {
          for (const second of followUp) {
            const lastHit = Math.max(first.impact, second.impact)
            const firstHit = Math.min(first.impact, second.impact)
            const firstDamage = damage(first.impact <= second.impact ? first : second)
            const buffer = window.from > now || enemy.shieldUntil > lastHit ? window.shield :
              enemy.shieldUntil > firstHit ? Math.min(window.shield, firstDamage) : 0
            const loss = damage(first) + damage(second) - buffer
            const benefit = Math.min(enemy.hp, loss) - (lastHit - now) * 14
            if (loss < 30 || benefit <= (best?.benefit ?? 0)) continue
            best = { attack: { actor, intent: first.intent }, start, benefit }
          }
        }
      }
    }
  }
  if (!best || immediate > 25 && best.start > now + .2) return
  return best.start <= now + .02 ? best.attack : "wait"
}
