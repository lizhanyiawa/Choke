import { combatHasRole } from "../combatRules"
import { AI_THINK_INTERVAL, CHARGE, COOLDOWN, MOVE_REACH, SPARRING_STEP, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import { dancerChoreography } from "./dancerChoreo"
import type { EdgeActive } from "./catalog"
import { along, areaHits, areaOf, clamp, direction, edgeDistance, inside, isOutside, left, type EdgeArea, type EdgePoint } from "./geometry"
import { healerFlight } from "./healerChoreo"
import { lifebringerChoreography } from "./lifebringerChoreo"
import { assassinLockAttack, binderLockAttack, boundaryBladeStrikes, chargeOf, closingFieldArea, directHitForecast, estimateDirectHit, estimateScheduledSupport, fixedSkillWindup,
  forecastBasicCast, forecastSkillCast, healFactors, movementStopped, projectedBasicShove, projectedContactShift, selectionArea, skillAreaContains, spellbreakerLockAttack, targetable,
  targetedFlight, type DirectHitForecast } from "./runtime"
import { battleUnits, isFighter, isSummonId, sameSide, sideOf, unitOf, type Buff, type PendingStrike, type PendingSupport, type SkillCast } from "./state"
import { SUMMON_PLANS } from "./summonPlans"
import { SUMMON_DISMISS_TIME, activeDeployments, summonChaseStep, summonFollowStep, summonRoutePosition, summonSpawns, type SummonGroup } from "./summons"

export interface AnnouncedStrike {
  at: number
  source: EdgeUnit
  strike: PendingStrike
  zone?: boolean
}

export function moveEndStrikes(battle: EdgeBattle, mover: EdgeUnit, end: EdgePoint, at: number): AnnouncedStrike[] {
  return battle.runtime.watches.flatMap<AnnouncedStrike>(({ cast, step, rule, target, until, uses, derived }) => {
    if (target !== mover.id || until <= at || uses <= 0 || rule.event !== "move" ||
      rule.flags.length !== 1 || rule.flags[0] !== "to" || derived || cast.signature || sameSide(battle, cast.owner, mover.id)) return []
    const source = unitOf(battle, cast.owner)
    const { units, shape, anchor, flags, limit, exclude, offset, turn } = step.selector
    const damage = step.operations.find(op => op.kind === "d" && !op.style && op.args.length === 1)
    if (!source || !damage || flags.length || limit || exclude || offset || turn) return []
    const power = damage.args[0]
    if (units === "v" && !shape) return [{ at, source, strike: { cast, power, target: mover.id } }]
    if (units === "e" && shape === "C" && anchor === "v") {
      const area = areaOf("C", end, direction(cast.from, end), step.selector.size[0])
      return [{ at, source, strike: { cast, power, step, area, needsOwner: false } }]
    }
    return []
  })
}

export function announcedFieldErasures(battle: EdgeBattle, owner: EdgeUnit, until: number) {
  return battle.runtime.pending.flatMap(({ due, strike }) =>
    due > battle.time && due <= until && strike && "area" in strike && (!strike.needsOwner || unitOf(battle, strike.cast.owner)?.hp) &&
    strike.step?.operations.some(op => op.kind === "erase" && !op.args[0]) && !sameSide(battle, strike.cast.owner, owner.id)
    ? [{ at: due, area: strike.area }] : [])
}

type AreaStrike = Extract<PendingStrike, { area: EdgeArea }>

type PositionAt = (unit: EdgeUnit, time: number) => EdgePoint

export function entryFieldContacts(battle: EdgeBattle, unit: EdgeUnit, until: number, position: PositionAt): AnnouncedStrike[] {
  const erasures = new Map<EdgeUnit, ReturnType<typeof announcedFieldErasures>>()
  return battle.runtime.fields.flatMap(field => {
    const { cast, step, area } = field
    const { selector } = step
    if (field.mode !== "enter" || field.derived || field.until <= battle.time || field.seen.has(unit.id) ||
      sameSide(battle, unit.id, cast.owner) || selector.units !== "e" || selector.limit || selector.exclude ||
      selector.flags.some(flag => flag !== "card") || selector.flags.includes("card") && !isFighter(unit) ||
      selector.anchor && !["o", "p"].includes(selector.anchor) || step.operations.some(op => op.kind === "seek" || op.kind === "orbit")) return []
    const damage = step.operations.find(op => op.kind === "d" && !op.style)
    const source = damage && unitOf(battle, cast.owner)
    if (!damage || !source) return []
    let clears = erasures.get(source)
    if (!clears) {
      clears = announcedFieldErasures(battle, source, until)
      erasures.set(source, clears)
    }
    const expires = Math.min(field.until, ...clears.filter(entry => areaHits(entry.area, area.center)).map(entry => entry.at))
    for (let at = battle.time + SPARRING_STEP; at < expires && at <= until + 1e-6; at += SPARRING_STEP) {
      if (skillAreaContains(cast, selector.shape, area, position(unit, at))) return [{ at, source, zone: true,
        strike: { cast, area, power: damage.args[0], step, needsOwner: false } }]
    }
    return []
  })
}

export function announcedCharges(battle: EdgeBattle, enemies: readonly EdgeUnit[], until: number): AnnouncedStrike[] {
  return enemies.flatMap(source => {
    const charge = chargeOf(battle, source)
    if (!source.hp || !charge || charge.until > until) return []
    const cast = { ...forecastBasicCast(source, source), order: "enemy" as const, from: charge.from, aim: charge.to }
    cast.used.delete("manual")
    cast.used.add("bossCharge")
    const area = areaOf("L", along(charge.from, charge.direction, -15), charge.direction, CHARGE.reach + 30, CHARGE.halfWidth * 2)
    const step = { delay: 0, selector: { units: "e" as const, size: [], offset: 0, flags: [] },
      operations: [{ kind: "p", args: [CHARGE.push], style: "axis" }] }
    return [{ at: charge.until, source, strike: { cast, area, step, needsOwner: true, power: CHARGE.power, displacementDuration: .34 } }]
  })
}

interface TargetedFollowUp {
  contacts: AnnouncedStrike[]
  position: PositionAt
}

export interface ClosingField {
  cast: PendingStrike["cast"]
  step: NonNullable<PendingStrike["step"]>
  start: number
  seen?: ReadonlySet<EdgeUnit["id"]>
}

export function closingFieldContact(battle: EdgeBattle, { cast, step, start, seen }: ClosingField, source: EdgeUnit,
  target: EdgeUnit, position: PositionAt, until = Infinity) {
  const duration = step.zone?.duration
  const damage = step.operations.find(op => op.kind === "d")
  if (!duration || !damage || seen?.has(target.id)) return
  const axis = direction(cast.from, cast.aim)
  const across = left(axis)
  const [length, width, gap] = step.selector.size
  const initial = Math.max(battle.time + SPARRING_STEP, start)
  const end = Math.min(until, start + duration - SPARRING_STEP * .5)
  for (let at = initial; at <= end + 1e-6; at += SPARRING_STEP) {
    const place = position(target, at)
    const x = place.x - cast.aim.x
    const y = place.y - cast.aim.y
    const side = gap / 2 * (1 - (at - start) / duration)
    if (Math.abs(x * axis.x + y * axis.y) > length / 2 ||
      Math.abs(Math.abs(x * across.x + y * across.y) - side) > width / 2) continue
    const area = closingFieldArea(cast, step, 1 - (at - start) / duration)
    if (areaHits(area, place)) return { at, source, zone: true, strike: { cast, step, area, power: damage.args[0], needsOwner: false } } satisfies AnnouncedStrike
  }
}

export function announcedClosingFields(battle: EdgeBattle, unit: EdgeUnit, until: number): ClosingField[] {
  const seen = new Set<number>()
  const fields: ClosingField[] = []
  for (const field of battle.runtime.fields) {
    if (field.mode !== "closing" || field.until <= battle.time || sameSide(battle, unit.id, field.cast.owner)) continue
    fields.push({ cast: field.cast, step: field.step, start: field.time, seen: field.seen })
    seen.add(field.cast.id)
  }
  for (const warning of battle.runtime.visuals) {
    const closing = warning.closing
    if (!closing || warning.until <= battle.time || warning.until > until || seen.has(closing.cast.id) ||
      sameSide(battle, unit.id, warning.owner) || !unitOf(battle, warning.owner)?.hp) continue
    fields.push({ ...closing, start: warning.until })
  }
  return fields
}

export function runnerContact(battle: EdgeBattle, cast: PendingStrike["cast"], source: EdgeUnit, target: EdgeUnit,
  body: EdgePoint, ready: number, until: number, position: PositionAt, start = battle.time): AnnouncedStrike | undefined {
  const { motion, actions } = SUMMON_PLANS.runner
  const action = actions?.[0]
  if (motion?.kind !== "chase" || !action?.reach || ready > until || !target.hp) return
  let from = body
  for (let at = start + SPARRING_STEP; at <= until + 1e-6; at += SPARRING_STEP) {
    const place = position(target, at)
    from = summonChaseStep(from, place, motion, SPARRING_STEP)
    if (at + 1e-6 < ready || edgeDistance(from, place) > action.reach) continue
    const aim = along(from, direction(from, place), 1)
    return { at, source, strike: {
      cast: { ...cast, from, aim, outside: isOutside(from) }, target: target.id,
      step: action.step, power: action.step.operations[0].args[0],
    } }
  }
}

export function announcedStrikes(battle: EdgeBattle, unit: EdgeUnit, until = battle.time + COOLDOWN.shared + .4,
  position: PositionAt = unit => unit) {
  const result: AnnouncedStrike[] = []
  const append = (due: number, strike: PendingStrike) => {
    if (sameSide(battle, unit.id, strike.cast.owner)) return
    const source = unitOf(battle, strike.cast.owner)
    if (!source || ("area" in strike ? strike.needsOwner && !source.hp
      : strike.target !== unit.id || (strike.range !== undefined || strike.needsUnforcedOwner) && !source.hp)) return
    let at = due
    if ("area" in strike) {
      at += strike.releaseLead ?? 0
    } else {
      if (strike.projectile) at += targetedFlight(strike.projectile, edgeDistance(position(source, due), position(unit, due)))
      if (strike.afterLock !== undefined) at += Math.max(SPARRING_STEP, strike.afterLock)
    }
    if (at <= until) result.push({ at, source, strike })
  }
  for (const { due, strike, following } of battle.runtime.pending) {
    if (!strike || due > until) continue
    append(due, strike)
    if (following) for (const beat of following) append(due, beat)
  }
  return result.sort((a, b) => a.at - b.at)
}

export function readyLockStrikes(battle: EdgeBattle, target: EdgeFighter, enemies: EdgeFighter[],
  position: (unit: EdgeUnit, time: number) => EdgePoint) {
  if (target.hp > target.maxHp * .35 || !battle.sparring) return []
  const now = battle.time
  const shared = sideOf(battle, target.id) === "ally" ? battle.sparring.sharedAt : battle.sharedAt
  const breakers = enemies.filter(enemy => combatHasRole(enemy, "spellbreaker"))
  const result = targetedFollowUps(battle, target, breakers, now, now + 1.2, position).flatMap(reply => reply.contacts)
  for (const enemy of enemies) {
    const ready = Math.max(now, shared, enemy.actionAt)
    if (enemy.force || enemy.move || isOutside(enemy) || ready > now + 1.2 || !targetable(battle, target, ready)) continue
    const gap = edgeDistance(enemy, position(target, ready))
    for (const skill of enemy.actives) {
      const binder = binderLockAttack(skill)
      const attack = binder ?? assassinLockAttack(skill)
      if (!attack || gap > attack.range) continue
      const locksAt = ready + attack.windup
      const at = locksAt + (binder ? 0 : Math.max(SPARRING_STEP, attack.delay))
      const cast = forecastSkillCast(enemy, skill, target)
      result.push({ at, source: enemy, strike: {
        cast, power: attack.power, target: target.id, range: attack.range, locksAt,
        needsUnforcedOwner: true, originLimit: binder ? { distance: 6, exclusive: true } : undefined,
      } })
    }
  }
  return result.sort((a, b) => a.at - b.at)
}

export function targetedFollowUps(battle: EdgeBattle, target: EdgeUnit, enemies: EdgeFighter[],
  after: number, until: number, position: PositionAt): TargetedFollowUp[] {
  const now = battle.time
  const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
  const shared = sideOf(battle, target.id) === "ally" ? battle.sparring?.sharedAt ?? battle.boss.sharedAt : battle.sharedAt
  return enemies.flatMap(enemy => {
    if (!enemy.hp || enemy.force || !["assassin", "binder", "spellbreaker"].some(role => combatHasRole(enemy, role))) return []
    const ready = Math.max(now, after, shared, enemy.actionAt)
    const first = battle.sparring ? now + Math.ceil((ready - now) / frame - 1e-6) * frame : ready
    if (first >= until) return []
    return enemy.actives.flatMap<TargetedFollowUp>(skill => {
      const binder = binderLockAttack(skill)
      const attack = binder ?? assassinLockAttack(skill)
      const breaker = spellbreakerLockAttack(skill)
      if (!attack && !breaker && skill.aim.mode !== "outside") return []
      // In PvE a player can aim once the boss comes into range mid-walk.
      // Sparring only forecasts the first ready decision on each candidate path.
      const interval = battle.sparring ? until - first : .1
      for (let issuedAt = first; issuedAt < until - 1e-6; issuedAt += interval) {
        const source = { ...enemy, ...position(enemy, issuedAt) }
        const at = position(target, issuedAt)
        const outside = skill.aim.mode === "outside" && isOutside(at)
        if ((!outside && edgeDistance(source, at) > skill.aim.range) || !targetable(battle, target, issuedAt) || isOutside(source) ||
          battle.sparring && enemy.move && !movementStopped(battle, enemy) && edgeDistance(source, enemy.move) > 3) continue
        const holds = (unit: EdgeUnit, time: number) => unit.id === source.id && time >= issuedAt ? source : position(unit, time)
        const cast = { ...forecastSkillCast(source, skill, target), aim: at, issuedAt }
        if (breaker) {
          const impact = issuedAt + breaker.delay
          return impact <= until ? [{ contacts: [{ at: impact, source, strike: {
            cast, power: breaker.power, target: target.id, range: breaker.range,
          } }], position: holds }] : []
        }
        if (!attack) {
          const contacts = boundaryBladeStrikes(skill, cast, issuedAt).map(strike => ({
            at: strike.locksAt + strike.afterLock, strike, source,
          })).filter(contact => contact.at <= until)
          return contacts.length ? [{ contacts, position: holds }] : []
        }
        const locksAt = issuedAt + attack.windup
        const impact = locksAt + (binder ? 0 : Math.max(SPARRING_STEP, attack.delay))
        return impact <= until ? [{ contacts: [{ at: impact, source, strike: {
          cast, power: attack.power, target: target.id, locksAt, range: attack.range, needsUnforcedOwner: true,
          originLimit: binder ? { distance: 6, exclusive: true } : undefined,
        } } satisfies AnnouncedStrike], position: holds }] : []
      }
      return []
    })
  })
}

function strikeReaches(battle: EdgeBattle, contact: AnnouncedStrike, target: EdgeUnit, at: EdgePoint, position: PositionAt) {
  const { source, strike } = contact
  if (!source.hp && ("area" in strike ? strike.needsOwner : strike.range !== undefined || strike.needsUnforcedOwner)) return false
  const lock = "area" in strike ? contact.at - (strike.releaseLead ?? 0) : strike.locksAt ?? contact.at
  if (strike.needsUnforcedOwner && source.force && source.force.since + source.force.duration > lock) return false
  if (strike.originLimit) {
    const drift = edgeDistance(position(source, lock), strike.cast.from)
    if (drift > strike.originLimit.distance || strike.originLimit.exclusive && drift === strike.originLimit.distance) return false
  }
  if ("area" in strike) {
    if (strike.excludedTarget === target.id) return false
    return strike.step ? skillAreaContains(strike.cast, strike.step.selector.shape, strike.area, at) : areaHits(strike.area, at) > 0
  }
  if (strike.target !== target.id || strike.needsFirstHit && !strike.cast.trace.get(target.id)?.hits) return false
  const reach = strike.deliveryRange ?? strike.range
  if (reach === undefined) return true
  const landing = position(target, lock)
  if (strike.outsideLock && isOutside(landing)) return true
  if (strike.deliveryRange !== undefined) {
    const from = strike.launchedFrom ?? position(source, lock)
    return targetable(battle, target, contact.at) && edgeDistance(from, at) <= reach &&
      (strike.launchedFrom !== undefined || targetable(battle, target, lock) && edgeDistance(from, landing) <= reach)
  }
  const rechecksPhase = strike.originLimit !== undefined || strike.projectile === "warlock" || strike.locksAt === undefined
  return (!rechecksPhase || targetable(battle, target, lock)) && edgeDistance(position(source, lock), landing) <= reach
}

export function announcedHit(battle: EdgeBattle, contact: AnnouncedStrike, target: EdgeUnit, at: EdgePoint, position: PositionAt,
  hp = target.hp, shield = target.shieldUntil > contact.at ? target.shield : 0, guard = 0, spent?: DirectHitForecast,
  defy?: readonly Buff[]) {
  if (contact.strike.power <= 0 || !strikeReaches(battle, contact, target, at, position)) return
  const { source, strike } = contact
  let { cast } = strike
  if ("area" in strike) {
    if (strike.needsUnforcedOwner && source.force) cast = { ...cast, outside: isOutside(position(source, contact.at)) }
  } else {
    if (strike.locksAt !== undefined) {
      const from = position(source, strike.locksAt)
      cast = { ...cast, from: strike.projectile ? from : cast.from, outside: isOutside(from) }
    } else if (strike.launchedFrom) {
      cast = { ...cast, from: strike.needsFirstHit ? cast.assassinFollowFrom ?? strike.launchedFrom : strike.launchedFrom }
    }
  }
  const centerBonus = "area" in strike && areaHits(strike.area, at) > 1
    ? strike.step?.operations.find(op => op.kind === "d" && op.style === "crosscore")?.args[1] ?? 0 : 0
  const damage = { cast, hp, guard, spent: spent ?? ("area" in strike && strike.limitedDamage ? directHitForecast() : undefined),
    defy, zone: contact.zone }
  const hit = estimateDirectHit(battle, source, target, strike.power + centerBonus, cast.order, at, contact.at, shield, damage)
  if (hit.lethal || !("area" in strike) || !strike.limitedDamage) return hit
  if (earlierAreaTarget(battle, contact, strike, strike.area.center, target, position, false)) return hit
  const power = strike.limitedDamage.operations.find(op => op.kind === "d")!.args[0]
  const follow = estimateDirectHit(battle, source, target, power, cast.order, at, contact.at, shield - hit.shieldLoss,
    { ...damage, hp: hp - hit.hpLoss + hit.saveHeal, guard: hit.usedAidGuard ? 0 : guard })
  return {
    hit: hit.hit + follow.hit,
    shieldLoss: hit.shieldLoss + follow.shieldLoss,
    hpLoss: hit.hpLoss + follow.hpLoss,
    lethal: follow.lethal,
    saved: hit.saved || follow.saved,
    saveHeal: hit.saveHeal + follow.saveHeal,
    usedAidGuard: hit.usedAidGuard || follow.usedAidGuard,
  }
}

function earlierAreaTarget(battle: EdgeBattle, contact: AnnouncedStrike, strike: AreaStrike, center: EdgePoint, target: EdgeUnit,
  position: PositionAt, farthest: boolean) {
  const gap = edgeDistance(center, position(target, contact.at))
  const firstBeat = { ...contact, strike: { ...strike, limitedDamage: undefined } }
  return battleUnits(battle).some(other => {
    if (other === target || !other.hp || !sameSide(battle, other.id, target.id)) return false
    const near = position(other, contact.at)
    const distance = edgeDistance(center, near)
    if (distance === gap ? Number(other.id) >= Number(target.id) : farthest ? distance <= gap : distance >= gap) return false
    const aid = aidBeforeHit(battle, other, contact.at, position)
    const hit = announcedHit(battle, firstBeat, other, near, position, aid.hp, aid.shield, 0, undefined, aid.defy)
    return !!hit && !hit.lethal
  })
}

export function announcedShift(battle: EdgeBattle, contact: AnnouncedStrike, target: EdgeUnit, position: PositionAt, brace = 0) {
  const { at, strike } = contact
  const place = position(target, at)
  if (!strikeReaches(battle, contact, target, place, position)) return
  const area = "area" in strike ? strike.area : undefined
  if (strike.cast.order === "basic" && !isSummonId(target.id)) {
    const shift = projectedBasicShove(battle, strike.cast, target, place, at, brace)
    if (edgeDistance(place, shift.end) >= 3) return { ...shift, duration: .14 + (!isOutside(place) && isOutside(shift.end) ? .14 : 0) }
  }
  if ("area" in strike && strike.rimPush && areaHits(strike.rimPush.area, place)) {
    const aid = aidBeforeHit(battle, target, at, position)
    if (announcedHit(battle, contact, target, place, position, aid.hp, aid.shield, 0, undefined, aid.defy)?.lethal) return
    return projectedContactShift(battle, strike.cast, strike.rimPush.step, strike.rimPush.area, target, place, at, undefined, brace)
  }
  if ("area" in strike && strike.limitedPush) {
    const aid = aidBeforeHit(battle, target, at, position)
    if (announcedHit(battle, contact, target, place, position, aid.hp, aid.shield, 0, undefined, aid.defy)?.lethal) return
    const rank = strike.limitedPush.selector.order
    const lane = strike.area.parts[0]
    const center = rank === "farthest" && lane?.kind === "polygon" && lane.points.length === 4
      ? along(lane.points[0], direction(lane.points[0], lane.points[1]), edgeDistance(lane.points[0], lane.points[1]) / 2)
      : strike.cast.from
    if (earlierAreaTarget(battle, contact, strike, center, target, position, rank === "farthest")) return
    return projectedContactShift(battle, strike.cast, strike.limitedPush, area, target, place, at, undefined, brace)
  }
  if (strike.step) {
    const shift = projectedContactShift(battle, strike.cast, strike.step, area, target, place, at, undefined, brace)
    return shift && strike.displacementDuration !== undefined
      ? { ...shift, duration: strike.displacementDuration + (!isOutside(place) && isOutside(shift.end) ? .14 : 0) }
      : shift
  }
}

export function positionAfterStrike(battle: EdgeBattle, target: EdgeUnit, contacts: AnnouncedStrike[], before: PositionAt) {
  let motion: { start: number; from: EdgePoint; end: EdgePoint; duration: number } | undefined
  const position: PositionAt = (unit, time) => {
    if (unit !== target || !motion || time <= motion.start) return before(unit, time)
    return displacementPoint(motion, time)
  }
  for (const contact of contacts) {
    const shift = announcedShift(battle, contact, target, position)
    if (!shift) continue
    if (motion) return
    motion = { ...shift, start: contact.at, from: before(target, contact.at) }
  }
  return { position, last: motion?.start ?? -Infinity }
}

export function displacementPoint({ from, end, start, duration }: { from: EdgePoint; end: EdgePoint; start: number; duration: number }, time: number) {
  const ease = 1 - (1 - clamp((time - start) / duration, 0, 1)) ** 3
  return { x: from.x + (end.x - from.x) * ease, y: from.y + (end.y - from.y) * ease }
}

export function roadBeastThreats(battle: EdgeBattle, actor: EdgeUnit) {
  if (!battle.runtime.summons.length) return []
  return activeDeployments(battle).flatMap(({ group, deployment, plan }) => {
    if (deployment.kind !== "roadBeast" || sameSide(battle, actor.id, group.owner)) return []
    const [body] = deployment.bodies
    const motion = plan.motion
    if (!body.hp || motion?.kind !== "patrol") return []
    const reach = Math.max(motion.reach ?? 0, edgeDistance(group.from, body.origin))
    return edgeDistance(actor, group.from) <= MOVE_REACH + reach + plan.actions![0].step.selector.size[0]
      ? [{ group, body, plan, motion }] : []
  })
}

export function roadBeastRisk(battle: EdgeBattle, actor: EdgeUnit, path: PositionAt, until: number,
  threats: ReturnType<typeof roadBeastThreats>, walking: boolean) {
  const now = battle.time
  const targets = battleUnits(battle).filter(unit => unit.hp && sameSide(battle, unit.id, actor.id))
  let risk = 0
  for (const { group, body, plan, motion } of threats) {
    const [pulse] = plan.actions!
    const radius = pulse.step.selector.size[0]
    const last = Math.min(until, group.until - SUMMON_DISMISS_TIME - SPARRING_STEP)
    let ready = body.actionsAt[0]
    let previous: EdgePoint = body
    let facing = body.facing
    let foot: EdgePoint = actor
    // For a moving body, check the issued route at the same time as the walk.
    for (let at = now + SPARRING_STEP; at <= last + 1e-6; at += SPARRING_STEP) {
      const route = summonRoutePosition(group, body, motion, at)!
      const place = path(actor, at)
      const gap = edgeDistance(route.at, place)
      const axis = edgeDistance(previous, route.at) > .001 ? direction(previous, route.at) : facing
      if (walking && body.actionAt <= at && edgeDistance(previous, place) < plan.terrain!.radius) {
        const toward = (previous.x - foot.x) * (place.x - foot.x) + (previous.y - foot.y) * (place.y - foot.y)
        if (toward > 0) risk = Math.max(risk, 55)
      }
      if (at + 1e-6 >= ready) {
        let nearest: EdgeUnit | undefined
        let closest = radius
        for (const unit of targets) {
          const distance = unit === actor ? gap : edgeDistance(path(unit, at), route.at)
          if (distance > closest || nearest && distance === closest) continue
          nearest = unit
          closest = distance
        }
        if (nearest) {
          ready = at + pulse.cooldown
          if (nearest === actor) {
            const cast = { ...group.deployment.cast, from: route.at, aim: along(route.at, axis, 1) }
            const area = areaOf("C", route.at, axis, radius)
            const shift = projectedContactShift(battle, cast, pulse.step, area, actor, place, at, axis)
            if (shift) {
              if (!isOutside(place) && isOutside(shift.end)) return Infinity
              if (walking && edgeDistance(foot, place) > .001) risk = Math.max(risk, 125)
              break
            }
          }
        }
      }
      previous = route.at
      facing = axis
      foot = place
    }
  }
  return risk
}

export function summonDisruptsCast(battle: EdgeBattle, target: EdgeUnit, release: number, position: PositionAt, dashAt?: number) {
  if (!battle.runtime.summons.length || isSummonId(target.id)) return false
  const hostile = activeDeployments(battle).filter(({ group }) => !sameSide(battle, group.owner, target.id))
  if (!hostile.length) return false
  const enemies = battleUnits(battle).filter(unit => unit.hp && sameSide(battle, unit.id, target.id))
  const now = battle.time
  for (const { group, deployment, plan } of hostile) for (const [index, action] of (plan.actions ?? []).entries()) {
    if (deployment.kind === "runner" && group.target === target.id) {
      const [body] = deployment.bodies
      const source = unitOf(battle, group.owner)
      const until = Math.min(release, group.until - SUMMON_DISMISS_TIME) - 1e-6
      const contact = body.hp && source && runnerContact(battle, deployment.cast, source, target, body, body.actionsAt[0], until, position)
      if (contact) {
        const shift = announcedShift(battle, contact, target, position)
        const interrupts = shift && contact.at + shift.duration > (dashAt ?? release)
        if (interrupts || !lifeThroughStrikes(battle, target, [contact], position).hp) return true
      }
      continue
    }
    const { step } = action
    const { selector } = step
    if (action.reaction || action.shot || action.at || action.reach || selector.units !== "e" || selector.shape !== "C" ||
      selector.flags.length || selector.order || selector.exclude || !step.operations.some(op => op.kind === "p" || op.kind === "l")) continue
    for (const body of deployment.bodies) {
      if (!body.hp || body.actionsAt[index] > release || action.slot !== undefined && action.slot !== body.slot) continue
      const until = Math.min(release - 1e-6, group.until - SUMMON_DISMISS_TIME - 1e-6)
      const firstTick = Math.max(1, Math.ceil((body.actionsAt[index] - now) / SPARRING_STEP - 1e-6))
      const motion = plan.motion
      if (motion?.kind === "follow" || motion?.kind === "chase") continue
      for (let at = now + firstTick * SPARRING_STEP; at <= until + 1e-6; at += SPARRING_STEP) {
        const route = motion && summonRoutePosition(group, body, motion, at)
        if (action.phase && action.phase !== (route?.phase ?? body.phase)) continue
        const from = route?.at ?? body
        const place = position(target, at)
        const gap = edgeDistance(from, place)
        if (gap > selector.size[0]) {
          // A pulse that goes to another card also consumes this summon action.
          if (enemies.some(unit => unit !== target && edgeDistance(from, position(unit, at)) <= selector.size[0])) break
          continue
        }
        if (selector.limit) {
          let earlier = 0
          let beforeTarget = true
          for (const unit of enemies) {
            if (unit === target) { beforeTarget = false; continue }
            const distance = edgeDistance(from, position(unit, at))
            if (distance < gap || distance === gap && beforeTarget) earlier++
          }
          if (earlier >= selector.limit) break
        }
        const prev = motion && summonRoutePosition(group, body, motion, at - SPARRING_STEP)
        const axis = prev && edgeDistance(prev.at, from) > .001 ? direction(prev.at, from) : body.facing
        const cast = { ...deployment.cast, from, aim: along(from, axis, 1) }
        const shift = projectedContactShift(battle, cast, step, undefined, target, place, at, axis)
        if (shift && at + shift.duration > (dashAt ?? release)) return true
        break
      }
    }
  }
  return false
}

export function runnerBreakValue(battle: EdgeBattle, group: SummonGroup, defender: EdgeUnit, impact: number, position: PositionAt) {
  if (group.deployment.kind !== "runner" || group.target !== defender.id || group.dismissedAt !== undefined) return 0
  const [body] = group.deployment.bodies
  const source = unitOf(battle, group.owner)
  if (!body.hp || !source) return 0
  const expires = group.until - SUMMON_DISMISS_TIME - SPARRING_STEP
  const first = runnerContact(battle, group.deployment.cast, source, defender, body, body.actionsAt[0],
    Math.min(impact + .95, expires), position)
  if (!first || first.at < impact + SPARRING_STEP) return 0
  const at = position(defender, first.at)
  const aid = aidBeforeHit(battle, defender, first.at, position)
  const hit = announcedHit(battle, first, defender, at, position, aid.hp, aid.shield, 0, undefined, aid.defy)
  const shift = announcedShift(battle, first, defender, position)
  return hit?.lethal || shift && !isOutside(at) && isOutside(shift.end) ? 2.05 : 0
}

export interface SummonChange {
  added?: SummonGroup
  removed?: SummonGroup
}

function linkedGuardForecast(battle: EdgeBattle, target: EdgeUnit, contacts: readonly AnnouncedStrike[], position: PositionAt, change: SummonChange) {
  const { added, removed } = change
  const groups = activeDeployments(battle).filter(({ group, plan }) => group !== removed &&
    group.target === target.id && plan.guard?.type === "linked" && sameSide(battle, group.owner, target.id))
  if (added?.target === target.id) groups.push({ group: added, deployment: added.deployment, plan: SUMMON_PLANS[added.deployment.kind] })
  const bodies: NonNullable<DirectHitForecast["linkedGuard"]>["bodies"] = new Map()
  const followers = groups.flatMap(({ group, deployment, plan }) => {
    const motion = plan.motion
    return motion?.kind === "follow" ? deployment.bodies.map(body => {
      const state = { at: body as EdgePoint, hp: body.hp }
      bodies.set(body.id, state)
      return { group, slot: body.slot, motion, state }
    }) : []
  })
  const warnings = battle.runtime.visuals.filter(warning => warning.phase === "warning" && warning.clearsSummons &&
    warning.until <= (contacts.at(-1)?.at ?? battle.time) && !sameSide(battle, target.id, warning.owner))
  const erasures = contacts.flatMap(({ at, strike }) => "area" in strike && strike.cast.skill &&
    strike.step?.operations.some(op => op.kind === "erase") && warnings.some(warning => warning.owner === strike.cast.owner &&
      Math.abs(warning.until - at) < SPARRING_STEP && edgeDistance(warning.area.center, strike.area.center) < .01)
    ? [{ at, area: strike.area }] : [])
  let sampled = battle.time
  let nextErase = 0
  const followThrough = (at: number) => {
    // Due hits land before the summons move in that frame.
    for (let tick = sampled + SPARRING_STEP; tick < at - 1e-6; tick += SPARRING_STEP) {
      const patient = position(target, tick)
      for (const { group, slot, motion, state } of followers) {
        if (state.hp > 0) state.at = summonFollowStep(group, slot, state.at, patient, motion, SPARRING_STEP)
      }
      sampled = tick
    }
  }
  const advance = (at: number) => {
    while (nextErase < erasures.length && erasures[nextErase].at < at - 1e-6) {
      const erase = erasures[nextErase++]
      followThrough(erase.at)
      const erased = new Set(followers.filter(({ state }) => state.hp > 0 && areaHits(erase.area, state.at)).map(({ group }) => group))
      for (const { group, state } of followers) if (erased.has(group)) state.hp = 0
    }
    followThrough(at)
  }
  return { forecast: { added, removed, bodies }, advance }
}

export interface TimedAid {
  at: number
  heal?: number
  shield?: number
  shieldUntil?: number
  shieldSpend?: number
  guard?: { percent: number; skillOnly: boolean }
  defy?: Buff
  below?: number
}

export interface ReservoirReplacement {
  cast: SkillCast
  at: number
}

interface ScheduledAid extends TimedAid {
  heal: number
  shield: number
  shieldUntil: number
  noBank?: boolean
}

export function immediateCircleWard(skill: EdgeActive) {
  const [step] = skill.steps
  if (skill.aim.mode !== "point" || skill.steps.length !== 1 || !step || step.delay || step.zone?.event !== "enter") return
  const { units, shape, anchor, flags, limit, exclude, offset, turn } = step.selector
  if (units !== "a" || shape !== "C" || anchor && anchor !== "p" || flags.length || limit || exclude || offset || turn ||
    step.operations.length !== 1 || step.operations[0].kind !== "b" || step.operations[0].style || fixedSkillWindup(skill) !== 0) return
  return step
}

export function entryWardFields(battle: EdgeBattle, unit: EdgeUnit) {
  return battle.runtime.fields.filter(({ cast, step, mode, derived, until, seen }) => {
    if (mode !== "enter" || derived || until <= battle.time || seen.has(unit.id) ||
      !cast.skill || !sameSide(battle, cast.owner, unit.id)) return false
    const ward = cast.skill.id === "bulwark/Prismatic/A2" ? cast.skill.steps[0] : immediateCircleWard(cast.skill)
    return ward === step
  })
}

export function wardsAlongPath(battle: EdgeBattle, unit: EdgeUnit, impact: number, position: PositionAt,
  fields = entryWardFields(battle, unit)): ScheduledAid[] {
  if (!unit.hp || impact <= battle.time + SPARRING_STEP) return []
  const wards: ScheduledAid[] = []
  for (const field of fields) {
    const { cast, step, area } = field
    const owner = unitOf(battle, cast.owner)
    if (!owner) continue
    const clears = announcedFieldErasures(battle, owner, impact).filter(erase => areaHits(erase.area, area.center))
    const expires = Math.min(field.until, ...clears.map(erase => erase.at))
    for (let at = battle.time + SPARRING_STEP; at < expires && at + SPARRING_STEP < impact; at += SPARRING_STEP) {
      if (!areaHits(area, position(unit, at))) continue
      const benefit = estimateScheduledSupport(battle, { cast, step, target: unit.id, ownerRequired: false }, unit, at, unit => position(unit, at))
      if (benefit) wards.push({ at, ...benefit })
      break
    }
  }
  return wards
}

function rescueArrival(battle: EdgeBattle, target: EdgeUnit, from: EdgePoint, axis: EdgePoint, ready: number, last: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint) {
  const { motion, actions } = SUMMON_PLANS.rescue
  const [pulse] = actions!
  const below = target.maxHp * Number(pulse.step.selector.flags[0].slice("low".length)) / 100
  if (!target.hp || target.hp >= below || motion?.kind !== "follow" || ready > last) return
  const reach = pulse.reach!
  let at = from
  let time = battle.time
  // The body follows the patient, so a push or a return walk can separate them.
  while (time < last) {
    const next = Math.min(last, time + .12, time < ready ? ready : Infinity)
    const patient = position(target, next)
    const perch = inside(along(patient, left(axis), motion.gap))
    at = along(at, direction(at, perch), Math.min(edgeDistance(at, perch), (next - time) * motion.speed))
    time = next
    if (time < ready || edgeDistance(at, patient) > reach) continue
    return { at: time, below }
  }
}

export function rescuePulse(battle: EdgeBattle, group: SummonGroup, target: EdgeUnit, until: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint): ScheduledAid | undefined {
  if (group.deployment.kind !== "rescue" || group.target !== target.id || group.dismissedAt !== undefined) return
  const [body] = group.deployment.bodies
  if (!body.hp) return
  const ready = Math.max(body.actionsAt[0], battle.time + SPARRING_STEP)
  const last = Math.min(until, group.until - SUMMON_DISMISS_TIME - SPARRING_STEP)
  const landing = rescueArrival(battle, target, body, group.axis, ready, last, position)
  if (!landing) return
  const aid = estimateScheduledSupport(battle, {
    cast: group.deployment.cast, step: SUMMON_PLANS.rescue.actions![0].step, ownerRequired: false, target: target.id,
  }, target, landing.at, unit => position(unit, landing.at))
  return aid && { ...landing, ...aid }
}

export function rescueDeploymentAid(battle: EdgeBattle, caster: EdgeUnit, target: EdgeUnit, until: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint): TimedAid | undefined {
  const [spawn] = summonSpawns("rescue", caster, target)
  const landing = rescueArrival(battle, target, spawn, direction(caster, target), battle.time + SPARRING_STEP, until, position)
  if (!landing) return
  const [heal, ward] = SUMMON_PLANS.rescue.actions![0].step.operations
  const { received, healingAmp, recovery } = healFactors(battle, caster, target, false, landing.at)
  return {
    ...landing,
    heal: Math.round(target.maxHp * heal.args[0] / 100 * (1 + received / 100) * (1 + healingAmp / 100) * recovery),
    shield: Math.round(target.maxHp * ward.args[0] / 100),
    shieldUntil: landing.at + ward.args[1],
  }
}

export function scheduledAid(battle: EdgeBattle, unit: EdgeUnit, until: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint, blockedRescue?: SummonGroup,
  replacedReservoir?: ReservoirReplacement) {
  const queued: ScheduledAid[] = []
  const motion = unit.force
  const cast = motion?.cause
  const landingAt = motion ? motion.since + motion.duration : Infinity
  const step = cast?.skill?.steps[0]
  // A paired slide commits a separate landing ward for each participant.
  const landingWard: PendingSupport | undefined = motion?.route && landingAt <= until && cast && step && !cast.signature &&
    (cast.owner === unit.id || cast.target === unit.id) && dancerChoreography(cast.skill?.id)?.pairedTravel
    ? { cast, step, target: unit.id, ownerRequired: false, landing: motion } : undefined
  const pending = landingWard ? [...battle.runtime.pending, { due: landingAt, heals: undefined, support: landingWard }] : battle.runtime.pending
  for (const { due, support, heals } of pending) {
    if (due > until) continue
    if (heals) for (const { cast, amount, target, delay = 0, stationary, reservoirPayout } of heals) {
      const at = due + delay
      if (unit.id !== target || at > until || !sameSide(battle, unit.id, cast.owner)) continue
      const owner = unitOf(battle, cast.owner)
      if (!owner) continue
      if (stationary) {
        const from = position(owner, due)
        if (!owner.hp || owner.force && owner.force.since + owner.force.duration >= due || edgeDistance(cast.from, from) > 3) continue
        const aim = cast.skill?.aim
        if (aim?.mode === "ally" && edgeDistance(from, position(unit, due)) > aim.range + .01) continue
      }
      const { received, healingAmp, recovery } = healFactors(battle, owner, unit, false, at)
      const heal = Math.round(amount * (1 + received / 100) * (1 + healingAmp / 100) * recovery)
      if (heal > 0) queued.push({ at, heal, shield: 0, shieldUntil: 0, noBank: reservoirPayout })
    }
    if (!support || !sameSide(battle, unit.id, support.cast.owner)) continue
    if (support.reservoir && support.cast === replacedReservoir?.cast && due >= replacedReservoir.at) continue
    const owner = unitOf(battle, support.cast.owner)
    if (!owner || support.target !== undefined && support.target !== unit.id) continue
    const bank = support.reservoir
    if (bank && bank !== "opening" && announcedFieldErasures(battle, owner, due - SPARRING_STEP / 2).some(erase =>
      areaHits(erase.area, bank.area.center))) continue
    const at = support.delivery === "healer" ? due + healerFlight(edgeDistance(position(owner, due), position(unit, due))) : due
    if (at > until) continue
    const benefit = estimateScheduledSupport(battle, support, unit, at, target => position(target, at))
    if (!benefit) continue
    if (bank === "opening" || support.landing) {
      // Forecast earlier hits only, so forecasting earlier aid cannot
      // include this arrival again.
      const untilOpen = due - SPARRING_STEP / 2
      const recipient = support.landing ? unit : owner
      const standing = (target: EdgeUnit, time: number) => bank === "opening" && target === owner && !owner.force ? owner : position(target, time)
      const threats = announcedStrikes(battle, recipient, untilOpen, standing)
      if (threats.length && (!lifeThroughStrikes(battle, recipient, threats, standing, [], undefined, untilOpen).hp ||
        threats.some(threat => announcedShift(battle, threat, recipient, standing)))) continue
    }
    queued.push({ at, ...benefit })
  }
  for (const effect of battle.runtime.effects) {
    const caster = effect.lifebringer && unitOf(battle, effect.lifebringer.owner)
    if (!caster?.hp || caster.force || effect.phase !== "windup" || effect.target !== unit.id ||
      effect.end <= battle.time || effect.end > until || !sameSide(battle, caster.id, unit.id) || !isFighter(caster)) continue
    const skill = caster.actives.find(active => active.id === effect.skill)
    const art = skill && lifebringerChoreography(skill.id)
    const step = skill?.steps[0]
    const ward = step?.operations.find(op => op.kind === "b" && !op.style)
    if (!skill || !art || art.delivery || fixedSkillWindup(skill, true) === undefined || !ward || !step || step.watch || step.zone || step.selector.units !== "t" ||
      edgeDistance(position(caster, effect.end), position(unit, effect.end)) > skill.aim.range) continue
    const at = effect.end + step.delay
    if (at <= until) queued.push({ at, heal: 0, shield: Math.round(unit.maxHp * ward.args[0] / 100), shieldUntil: at + (ward.args[1] ?? 12) })
  }
  for (const group of battle.runtime.summons) {
    if (group === blockedRescue) continue
    const pulse = rescuePulse(battle, group, unit, until, position)
    if (pulse) queued.push(pulse)
  }
  return queued.sort((a, b) => a.at - b.at)
}

export function aidBeforeHit(battle: EdgeBattle, unit: EdgeUnit, at: number,
  position: (unit: EdgeUnit, time: number) => EdgePoint, blockedRescue?: SummonGroup, onEntry: readonly ScheduledAid[] = []) {
  let { hp, shield, shieldUntil } = unit
  const defy: Buff[] = []
  const scheduled = scheduledAid(battle, unit, at, position, blockedRescue)
  if (onEntry.length) {
    scheduled.push(...onEntry)
    scheduled.sort((a, b) => a.at - b.at)
  }
  for (const aid of scheduled) {
    if (aid.below !== undefined && (hp >= aid.below || aid.at + SPARRING_STEP > at)) continue
    hp = Math.min(unit.maxHp, hp + aid.heal)
    if (aid.shield > 0 && (shieldUntil <= aid.at || aid.shield >= shield)) {
      shield = aid.shield
      shieldUntil = aid.shieldUntil
    }
    if (aid.defy && aid.at + SPARRING_STEP < at) addForecastGuard(defy, aid.defy)
  }
  return { hp, shield: shieldUntil > at ? shield : 0, defy }
}

export function addForecastGuard(list: Buff[], guard: Buff) {
  const prior = list.findIndex(item => item.cast.owner === guard.cast.owner && item.id === guard.id)
  if (prior >= 0) list.splice(prior, 1)
  list.push(guard)
}

function splintersAfter({ strike, at }: AnnouncedStrike, fixedStep: boolean) {
  const skill = strike.cast.skill
  if (!("area" in strike) || !skill || skill.steps.length < 2 || strike.step !== skill.steps[0]) return
  const [opening, fracture] = skill.steps
  if (fracture.delay !== opening.delay) return
  const splinter = fracture.operations.find(operation => operation.kind === "splinter")
  if (!splinter) return
  const [radius, power, delay] = splinter.args
  const wait = fixedStep ? Math.ceil(delay / SPARRING_STEP - 1e-6) * SPARRING_STEP : delay
  return { selector: fracture.selector, radius, power, at: at + wait }
}

function splinterContact(battle: EdgeBattle, opening: AnnouncedStrike, survivor: EdgeUnit, position: PositionAt,
  { selector, radius, power, at }: NonNullable<ReturnType<typeof splintersAfter>>): AnnouncedStrike | undefined {
  const { cast } = opening.strike
  const ring = selectionArea(battle, cast, selector)
  if (!ring) return
  const target = position(survivor, at)
  const parts: EdgeArea["parts"] = []
  for (const unit of battleUnits(battle)) {
    if (!unit.hp || sameSide(battle, cast.owner, unit.id)) continue
    const center = position(unit, opening.at)
    if (!areaHits(ring, center) || edgeDistance(center, target) > radius) continue
    // The second beat uses the living units still in the ring after impact.
    // The current patient has already survived in the simulated timeline.
    if (unit !== survivor) {
      const { hp, shield, defy } = aidBeforeHit(battle, unit, opening.at, position)
      if (announcedHit(battle, opening, unit, center, position, hp, shield, 0, undefined, defy)?.lethal) continue
    }
    parts.push({ kind: "circle", center, radius })
  }
  if (parts.length) return { at, source: opening.source, strike: { cast, power, needsOwner: false, area: { center: ring.center, parts } } }
}

export function lifeThroughStrikes(battle: EdgeBattle, unit: EdgeUnit, contacts: readonly AnnouncedStrike[],
  position: (unit: EdgeUnit, time: number) => EdgePoint, aid: readonly TimedAid[] = [], blockedRescue?: SummonGroup,
  through?: number, summonChange?: SummonChange, replacedReservoir?: ReservoirReplacement) {
  let { hp, shield, shieldUntil } = unit
  let guard: TimedAid["guard"]
  const defy: Buff[] = []
  let nextAid = 0
  let sequence = contacts
  let horizon = through ?? contacts.at(-1)?.at ?? battle.time
  let splinters: Map<AnnouncedStrike, NonNullable<ReturnType<typeof splintersAfter>>> | undefined
  for (const contact of contacts) {
    const burst = splintersAfter(contact, !!battle.sparring)
    if (!burst || through !== undefined && burst.at > through) continue
    splinters ??= new Map()
    splinters.set(contact, burst)
    horizon = Math.max(horizon, burst.at)
  }
  const spent = directHitForecast()
  const linked = summonChange && linkedGuardForecast(battle, unit, contacts, position, summonChange)
  if (linked) spent.linkedGuard = linked.forecast
  const committed = scheduledAid(battle, unit, horizon, position, blockedRescue, replacedReservoir)
  const support: TimedAid[] = [...committed, ...aid].sort((a, b) => a.at - b.at)
  const applyAid = (effect: TimedAid) => {
    if (effect.below !== undefined && hp >= effect.below) return
    hp = Math.min(unit.maxHp, hp + (effect.heal ?? 0))
    if (effect.shieldSpend && shieldUntil > effect.at) shield = Math.max(0, shield - effect.shieldSpend)
    if (effect.shield && (effect.shield >= shield || effect.at >= shieldUntil)) {
      shield = effect.shield
      shieldUntil = effect.shieldUntil ?? effect.at + 2
    }
    if (effect.guard) guard = effect.guard
    if (effect.defy) addForecastGuard(defy, effect.defy)
  }
  for (let index = 0; index < sequence.length; index++) {
    const contact = sequence[index]
    // Leave a tick between an aid's scheduled arrival and the incoming hit.
    while (nextAid < support.length && support[nextAid].at + SPARRING_STEP < contact.at) {
      applyAid(support[nextAid++])
    }
    if (shieldUntil <= contact.at) shield = 0
    linked?.advance(contact.at)
    const guardPercent = guard && (!guard.skillOnly || contact.strike.cast.order !== "basic") ? guard.percent : 0
    const hit = announcedHit(battle, contact, unit, position(unit, contact.at), position, hp, shield, guardPercent, spent, defy)
    if (hit) {
      if (hit.usedAidGuard) guard = undefined
      shield -= hit.shieldLoss
      hp += hit.saveHeal - hit.hpLoss
      if (hp <= 0) return { hp: 0, downAt: contact.at, shield: 0, guard, spent, defy, lethalContact: contact }
    }
    const plan = splinters?.get(contact)
    const burst = plan && splinterContact(battle, contact, unit, position, plan)
    if (burst) sequence = [...sequence, burst].sort((a, b) => a.at - b.at)
  }
  const last = sequence.at(-1)?.at ?? battle.time
  const end = through ?? last
  if (end > last) {
    while (nextAid < support.length && support[nextAid].at + SPARRING_STEP < end) applyAid(support[nextAid++])
  }
  return { hp, downAt: Infinity, shield: shieldUntil > end ? shield : 0, guard, spent, defy }
}
