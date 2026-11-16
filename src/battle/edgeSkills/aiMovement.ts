import { combatHasRole } from "../combatRules"
import { AI_THINK_INTERVAL, COOLDOWN, MOVE_REACH, SPARRING_STEP, moveLanding, moveProblem, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import { aidBeforeHit, announcedClosingFields, announcedHit, announcedShift, announcedStrikes, closingFieldContact, displacementPoint, entryFieldContacts, entryWardFields, lifeThroughStrikes, moveEndStrikes, positionAfterStrike, targetedFollowUps, wardsAlongPath, type AnnouncedStrike, type ClosingField, type TimedAid } from "./aiThreats"
import { bardChoreography } from "./bardChoreo"
import { berserkerChoreography } from "./berserkerChoreo"
import { dancerPointAt, dancerRailContains, type DancerRail } from "./dancerChoreo"
import { along, areaHits, areaOf, borderGap, clamp, direction, edgeDistance, fieldCrossing, inside, isOnBoard, isOutside, outward, rotate, type EdgePoint } from "./geometry"
import type { EdgeActive } from "./catalog"
import { BULWARK_COVER, GUARD_REACH, damageScore, roleDamageScale } from "./roles"
import { BASIC_PUSH, EXILE, areaEjectionReach, assassinLockAttack, attackRange, basicTarget, berserkerMotionEnd, binderLockAttack, boundaryBladeStrikes, dancerHop, dancerMovesBySkill, estimateDirectHit, estimateScheduledSupport, firstCrossing, fixedAreaFlight, fixedAreaStrike, fixedSkillWindup, flightTime, forecastBasicCast, forecastSkillCast, glideField, moveRecovery, movementAllowance, movementSpeed, movementStopped, previewAreaEjections, previewBasicShove, previewDirectedShove, previewSkillAreas, previewWarningShove, skillAreaContains, skillCastProblem, spellbreakerLockAttack, targetable, tetherLanding } from "./runtime"
import { spellbreakerChoreography } from "./spellbreakerChoreo"
import { alliesOf, battleUnits, isFighter, sameSide, sideOf, unitOf, type AreaVisual, type EdgeSide, type FieldEffect } from "./state"
import { SUMMON_DISMISS_TIME, activeDeployments, portalExit, portalRoute, type SummonBody, summonActionArea, summonTerrainInPath } from "./summons"

function crossesHostileGate(battle: EdgeBattle, unit: EdgeUnit, destination: EdgePoint, start: number, arrival: number) {
  const length = edgeDistance(unit, destination)
  return length >= 3 && battle.runtime.fields.some(field => {
    if (field.mode !== "cross" || field.until <= start || field.seen.has(unit.id) ||
      sameSide(battle, field.cast.owner, unit.id) || areaHits(field.area, unit)) return false
    const contact = firstCrossing(field.area, unit, destination, 4)
    return !!contact && start + (arrival - start) * edgeDistance(unit, contact) / length < field.until
  })
}

export function walkingPortal(battle: EdgeBattle, unit: EdgeUnit, until = Infinity) {
  const destination = unit.move
  if (!destination || !battle.runtime.summons.length || !isFighter(unit) ||
    unit.force || movementStopped(battle, unit) || battle.runtime.histories.get(unit.id)?.moveReturning) return
  const steps = edgeDistance(unit, destination) / movementSpeed(battle, unit) / SPARRING_STEP
  const arrival = battle.time + Math.max(1, Math.ceil(steps - 1e-6)) * SPARRING_STEP
  if (arrival > until + 1e-6) return
  const route = availablePortalRoute(battle, unit, destination, arrival)
  if (!route || tetherLanding(battle, unit, destination) !== destination || summonTerrainInPath(battle, unit, destination)) return
  if (!crossesHostileGate(battle, unit, destination, battle.time, arrival)) return { arrival, out: route.out, group: route.group }
}

export function future(battle: EdgeBattle, unit: EdgeUnit, seconds: number): EdgePoint {
  if (unit.force) {
    const { start, end, since, duration, route } = unit.force
    const progress = clamp((battle.time + seconds - since) / duration, 0, 1)
    if (route) return dancerPointAt(route, progress)
    const ease = 1 - (1 - progress) ** 3
    return { x: start.x + (end.x - start.x) * ease, y: start.y + (end.y - start.y) * ease }
  }
  if (!unit.move || movementStopped(battle, unit)) return unit
  if (isOutside(unit) && !isOutside(unit.move)) return returnWalk(battle, unit, unit.move).at(battle.time + seconds)
  const gap = edgeDistance(unit, unit.move)
  const speed = movementSpeed(battle, unit)
  const travel = speed * seconds
  const length = Math.min(gap, travel)
  const portal = travel + 1e-6 >= gap ? walkingPortal(battle, unit, battle.time + seconds) : undefined
  if (portal) return portal.out
  return along(unit, direction(unit, unit.move), length)
}

export function committedReturn(battle: EdgeBattle, unit: EdgeUnit) {
  if (unit.force || !unit.move || isOutside(unit.move) || movementStopped(battle, unit) ||
    !battle.runtime.histories.get(unit.id)?.moveReturning) return
  const route = returnWalk(battle, unit, unit.move)
  if (summonTerrainInPath(battle, unit, route.landing, false) ||
    crossesHostileGate(battle, unit, route.landing, battle.time, route.arrival)) return
  return route
}

export function returnWalk(battle: EdgeBattle, actor: EdgeUnit, landing: EdgePoint) {
  const now = battle.time
  const speed = movementSpeed(battle, actor)
  const length = edgeDistance(actor, landing)
  const axis = direction(actor, landing)
  const crossing = fieldCrossing(landing, actor)
  const edge = edgeDistance(actor, crossing)
  const crossAt = now + edge / speed
  const fieldSpeed = isOutside(actor) ? speed / EXILE.speed : speed
  const timeAt = (distance: number) => distance <= edge ? now + distance / speed : crossAt + (distance - edge) / fieldSpeed
  const distanceAt = (time: number) => {
    const distance = Math.max(0, time - now) * speed
    return time <= crossAt ? Math.min(edge, distance) : edge + (time - crossAt) * fieldSpeed
  }
  return { landing, crossing, crossAt, length, timeAt, distanceAt, arrival: timeAt(length),
    at: (time: number) => along(actor, axis, Math.min(length, distanceAt(time))) }
}

export function walkAt(actor: EdgePoint, landing: EdgePoint, start: number, arrival: number, time: number, exit = landing) {
  if (time >= arrival) return exit
  const progress = clamp((time - start) / (arrival - start), 0, 1)
  return { x: actor.x + (landing.x - actor.x) * progress, y: actor.y + (landing.y - actor.y) * progress }
}

export interface AdvancePath {
  landing: EdgePoint
  stop: EdgePoint
  arrival: number
}

type PositionAt = (unit: EdgeUnit, time: number) => EdgePoint

export interface LineDefense {
  enemy: EdgeFighter
  castAt: number
  at: number
  patient?: { unit: EdgeFighter; impacts: AnnouncedStrike[] }
}

const decisionStep = () => Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP

function readyReply(battle: EdgeBattle, unit: EdgeFighter, ready: number, until: number, position: PositionAt, onFrame = false) {
  if (ready > until + 1e-6) return
  const gate = walkingPortal(battle, unit, until)
  const earliest = Math.max(ready, gate?.arrival ?? ready)
  const frame = decisionStep()
  const at = onFrame || gate ? battle.time + Math.ceil((earliest - battle.time) / frame - 1e-6) * frame : earliest
  if (at > until + 1e-6) return
  const from = gate?.out ?? position(unit, at)
  if (isOutside(from) || !gate && unit.move && edgeDistance(from, unit.move) > 3 && !movementStopped(battle, unit)) return
  return { at, caster: { ...unit, ...from } }
}

function pressureReply(battle: EdgeBattle, unit: EdgeFighter, ready: number, until: number, position: PositionAt) {
  if (!battle.sparring) return readyReply(battle, unit, ready, until, position)
  const returning = committedReturn(battle, unit)
  const walking = unit.move && !movementStopped(battle, unit)
    ? battle.time + edgeDistance(unit, unit.move) / movementSpeed(battle, unit) : ready
  const afterWalk = returning?.arrival ?? walking
  return readyReply(battle, unit, Math.max(ready, afterWalk), until, position, true)
}

export function entryDamageStep(skill: EdgeActive) {
  const first = skill.steps[0]
  return first?.zone?.event === "enter" && (first.selector.shape === "C" || first.selector.shape === "B") &&
    first.selector.units === "e" && (!first.selector.anchor || first.selector.anchor === "p") && skill.aim.mode === "point" &&
    first.operations.some(op => op.kind === "d" && !op.style)
}

const firstDamageShape = (skill: EdgeActive, includeEntry = false) => {
  const first = skill.steps[0]
  if (!first || first.zone && !(includeEntry && entryDamageStep(skill)) || first.watch || first.selector.units !== "e" ||
    !first.operations.some(op => op.kind === "d")) return
  return first.selector.shape
}

const advanceAid = new Set(["b", "h", "guard", "split", "poolheal", "missing", "regen", "shareheal"])

export function equippedReach(actor: EdgeFighter) {
  let damage = 0
  let aid = 0
  for (const { aim, steps } of actor.actives) {
    const dash = aim.mode === "point" ? steps[0]?.operations.find(op => op.kind === "dash") : undefined
    for (const { delay, selector, operations, watch, zone } of steps) {
      if (watch || delay > 1.2) continue
      if (!zone && (aim.mode === "ally" || aim.mode === "other") && selector.units === "t" &&
        operations.some(op => advanceAid.has(op.kind))) aid = Math.max(aid, aim.range)
      if (!zone && aim.mode === "self" && "aob".includes(selector.units) && selector.shape === "C" &&
        operations.some(op => advanceAid.has(op.kind))) aid = Math.max(aid, selector.size[0])
      if (zone && zone.event !== "enter" && zone.event !== "tick") continue
      if (!operations.some(op => op.kind === "d")) continue
      if ((aim.mode === "enemy" || aim.mode === "outside") && selector.units === "t") {
        damage = Math.max(damage, aim.range)
      } else if (selector.units === "e" && !selector.offset && !selector.turn) {
        const shape = selector.shape
        const source = selector.anchor === "s" || selector.anchor === "o" || !selector.anchor && (shape === "L" || shape === "F")
        if (source && (shape === "L" || shape === "F" || shape === "C")) {
          const travel = dash && shape === "C" ? Math.min(aim.range, dash.args[0]) : 0
          damage = Math.max(damage, selector.size[0] + travel)
        } else if (aim.mode === "point" && (!selector.anchor || selector.anchor === "p")) {
          if (shape === "C" || shape === "N" || shape === "S") damage = Math.max(damage, aim.range + selector.size[0] * .7)
          if (shape === "B") damage = Math.max(damage, aim.range + selector.size[1] * .45)
        }
      }
    }
  }
  return { damage, aid }
}

function walkForecast(battle: EdgeBattle, actor: EdgeUnit, path: AdvancePath): PositionAt {
  const now = battle.time
  return (unit, at) => unit === actor ? walkAt(actor, path.landing, now, path.arrival, at, path.stop) : future(battle, unit, at - now)
}

export function walkTriggersLethalMark(battle: EdgeBattle, actor: EdgeUnit, request: EdgePoint) {
  const now = battle.time
  if (!battle.runtime.watches.some(watch => watch.target === actor.id && watch.uses > 0 &&
    watch.until > now && watch.rule.event === "move" && !sameSide(battle, actor.id, watch.cast.owner)) ||
    dancerMovesBySkill(battle, actor, request)) return false
  const landing = moveLanding(actor, request, battle)
  if (!landing || edgeDistance(actor, landing) < 7) return false
  const stop = summonTerrainInPath(battle, actor, landing, false)?.at ?? landing
  const returning = isOutside(actor) ? returnWalk(battle, actor, stop) : undefined
  const travel = returning ? returning.arrival - now : edgeDistance(actor, stop) / movementSpeed(battle, actor)
  const arrives = now + Math.max(SPARRING_STEP, Math.ceil(travel / SPARRING_STEP - 1e-6) * SPARRING_STEP)
  const marks = moveEndStrikes(battle, actor, stop, arrives)
  if (!marks.length) return false
  const standing: PositionAt = (unit, at) => future(battle, unit, at - now)
  const path: PositionAt = (unit, at) => unit === actor ? returning?.at(at) ?? walkAt(actor, stop, now, arrives, at) : standing(unit, at)
  const recovery = stop === landing ? moveRecovery(battle, actor, landing, arrives) : 0
  for (const unit of [actor, ...alliesOf(battle, actor.id).filter(ally => ally !== actor && ally.hp)]) {
    if (!marks.some(mark => announcedHit(battle, mark, unit, path(unit, arrives), path))) continue
    const contacts = announcedStrikes(battle, unit, arrives, path)
    const wards = wardsAlongPath(battle, unit, arrives, path)
    if (unit === actor && recovery) wards.push({ at: arrives - SPARRING_STEP - 1e-6, heal: recovery, shield: 0, shieldUntil: 0 })
    if (!lifeThroughStrikes(battle, unit, contacts, path, wards, undefined, arrives).hp ||
      lifeThroughStrikes(battle, unit, [...contacts, ...marks], path, wards).hp) continue
    if (lifeThroughStrikes(battle, unit, announcedStrikes(battle, unit, arrives, standing), standing).hp) return true
  }
  return false
}

function fitReplyAim(source: EdgePoint, skill: EdgeActive, point: EdgePoint) {
  const at = edgeDistance(source, point) > skill.aim.range
    ? along(source, direction(source, point), skill.aim.range - 1) : point
  return skill.aim.insideOnly ? inside(at, 0) : at
}

function circleAims(radius: number, targets: EdgePoint[]) {
  const aims = targets.slice()
  for (const [index, target] of targets.entries()) for (const other of targets.slice(index + 1)) {
    if (edgeDistance(target, other) <= radius * 2) {
      aims.push({ x: (target.x + other.x) / 2, y: (target.y + other.y) / 2 })
    }
  }
  return aims
}

function closingAnswerRisk(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[], team: EdgeFighter[], foeShared: number) {
  const now = battle.time
  const until = now + COOLDOWN.move
  const stays = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const friends = team.filter(unit => unit !== actor && unit.hp && !isOutside(unit))
  const sources = enemies.flatMap(enemy => {
    if (isOutside(enemy) || enemy.force) return []
    const reply = readyReply(battle, enemy, Math.max(foeShared, enemy.actionAt, now), until, stays, true)
    if (!reply) return []
    const { at: issued, caster } = reply
    return enemy.actives.flatMap(skill => {
      const step = skill.steps[0]
      if (step?.zone?.event !== "closing") return []
      const start = issued + (fixedSkillWindup(skill) ?? 0) + step.delay
      return start < until ? [{ enemy: caster, skill, start, step, issued }] : []
    })
  })
  const declared = announcedClosingFields(battle, actor, until)
  if (!sources.length && !declared.length) return

  const contacts = (position: PositionAt, fields: { source: EdgeUnit; field: ClosingField }[]) => {
    const forecast = (unit: EdgeFighter, source: EdgeUnit, field: ClosingField) => {
      const contact = closingFieldContact(battle, field, source, unit, position, until)
      const before = position(unit, until)
      if (!contact) return { before, after: before, loss: 0 }
      const at = position(unit, contact.at)
      const aid = aidBeforeHit(battle, unit, contact.at, position)
      const hit = announcedHit(battle, contact, unit, at, position, aid.hp, aid.shield, 0, undefined, aid.defy)
      const shift = hit && !hit.lethal ? announcedShift(battle, contact, unit, position) : undefined
      const loss = !hit ? 0 : hit.lethal ? 2.45 : (hit.hpLoss + hit.shieldLoss * .2) / unit.maxHp
      return { before, after: shift?.end ?? before, loss }
    }
    const before = position(actor, until)
    let highest = 0
    for (const { source, field } of fields) {
      const moved = forecast(actor, source, field)
      if (!moved.loss && moved.before === moved.after) continue
      const close = friends.map(friend => forecast(friend, source, field))
      const alliesAfter = close.filter(friend => edgeDistance(friend.after, moved.after) < 165)
      const alreadyClose = close.filter(friend => edgeDistance(friend.before, before) < 165).length
      // A route that gets pulled back loses its approach and gives later
      // area attacks more targets, even if shields absorb the first hit.
      const grouping = alliesAfter.length * 42 + Math.max(0, alliesAfter.length - alreadyClose) * 20
      highest = Math.max(highest, 122 * (moved.loss + close.reduce((sum, friend) => sum + friend.loss, 0)) +
        grouping + Math.min(90, edgeDistance(moved.before, moved.after) * .58))
    }
    return highest
  }

  const fromDeclared = declared.flatMap(field => {
    const source = unitOf(battle, field.cast.owner)
    return source ? [{ source, field }] : []
  })
  function available(position: PositionAt) {
    return sources.flatMap(({ enemy, skill, start, step, issued }) => {
      const contactAt = start + step.zone!.duration * .55
      const candidate = position(actor, contactAt)
      const alternatives = friends.map(unit => position(unit, contactAt))
        .filter(place => edgeDistance(candidate, place) > 16 && edgeDistance(candidate, place) < 310)
      const aims = [candidate, ...alternatives, ...alternatives.map(place => ({ x: (candidate.x + place.x) / 2, y: (candidate.y + place.y) / 2 }))]
      return aims.flatMap(aim => {
        const at = fitReplyAim(enemy, skill, aim)
        if (skillCastProblem(battle, enemy, skill, at, undefined, issued)) return []
        const cast = { ...forecastSkillCast(enemy, skill, actor), aim: at, issuedAt: issued }
        return [{ source: enemy, field: { cast, step, start } }]
      })
    })
  }
  const baseFields = available(stays)
  const original = contacts(stays, [...fromDeclared, ...baseFields])
  return (path: AdvancePath) => {
    const move = walkForecast(battle, actor, path)
    return contacts(move, [...fromDeclared, ...baseFields, ...available(move)]) - original
  }
}

function circleDamage(skill: EdgeActive) {
  if (skill.aim.mode !== "point" || !Number.isFinite(skill.aim.range)) return
  const windup = fixedSkillWindup(skill)
  if (windup === undefined) return
  const beats = skill.steps.flatMap(step => {
    const { units, shape, anchor, flags, limit, exclude, offset, turn } = step.selector
    const delay = windup + step.delay
    if (step.zone || step.watch || units !== "e" || shape !== "C" || anchor && anchor !== "p" ||
      flags.length || limit || exclude || offset || turn || delay < .35 || delay > 1) return []
    const power = step.operations.find(op => op.kind === "d" && !op.style)
    return power ? [{ step, power: power.args[0], radius: step.selector.size[0], delay }] : []
  })
  const largest = beats.reduce<typeof beats[number] | undefined>((max, beat) =>
    !max || beat.radius > max.radius ? beat : max, undefined)
  if (largest) return { ...largest, beats: beats.filter(beat => Math.abs(beat.delay - largest.delay) < SPARRING_STEP) }
}

function incomingCircleRisk(battle: EdgeBattle, actor: EdgeFighter, team: EdgeFighter[], enemies: EdgeFighter[], foeShared: number,
  escorting = false) {
  const now = battle.time
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const units = team.filter(unit => unit.hp && !isOutside(unit))
  if (units.length < 2 || !escorting && !units.some(unit => unit !== actor && edgeDistance(actor, unit) < 145)) return
  const replies = enemies.flatMap(enemy => {
    if (enemy.force || isOutside(enemy)) return []
    const reply = readyReply(battle, enemy, Math.max(now, foeShared, enemy.actionAt), now + .95, stays, true)
    if (!reply) return []
    const { at: issued, caster } = reply
    return enemy.actives.flatMap(skill => {
      const circle = circleDamage(skill)
      const at = issued + (circle?.delay ?? 0)
      return circle && (!escorting || units.some(unit => unit !== actor &&
        edgeDistance(actor, stays(unit, at)) <= MOVE_REACH + 2 * circle.radius))
        ? [{ caster, skill, at, ...circle }] : []
    })
  })
  if (!replies.length) return
  const pressure = (position: PositionAt) => {
    let worst = 0
    for (const { caster, skill, radius, at, beats } of replies) {
      const positions = units.map(unit => position(unit, at))
      for (const aim of circleAims(radius, positions)) {
        const used = fitReplyAim(caster, skill, aim)
        const victims = units.filter((_, index) => edgeDistance(positions[index], used) <= radius)
        if (victims.length < (escorting ? 3 : 2)) continue
        const axis = direction(caster, used)
        const cast = { ...forecastSkillCast(caster, skill, actor), aim: used }
        const hits = beats.map(({ step, power, radius }): AnnouncedStrike => ({
          at, source: caster, strike: { cast, step, power, area: areaOf("C", used, axis, radius), needsOwner: true },
        }))
        const total = victims.reduce((sum, unit) => {
          const before = aidBeforeHit(battle, unit, at, position)
          const after = lifeThroughStrikes(battle, unit, hits, position)
          const loss = Math.max(0, before.hp - after.hp + .18 * (before.shield - after.shield))
          return sum + (!after.hp ? 2.2 : loss / unit.maxHp)
        }, 0)
        worst = Math.max(worst, total)
      }
    }
    return worst
  }
  let original: number | undefined
  return (path: AdvancePath) => (pressure(walkForecast(battle, actor, path)) - (original ??= pressure(stays))) * 205
}

function advanceShoveRisk(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[], foeShared: number) {
  const now = battle.time
  const until = Math.min(actor.actionAt, now + COOLDOWN.move)
  if (actor.range < 200 || actor.hp > actor.maxHp * .45 || until <= now + COOLDOWN.shared) return
  const canShove = (step: EdgeActive["steps"][number]) => step.selector.shape === "C" &&
    step.operations.some(op => op.kind === "p" && op.args[0] >= 70)
  const pushers = enemies.filter(enemy => enemy.hp && !enemy.force &&
    enemy.actives.some(skill => {
      const windup = fixedSkillWindup(skill)
      const first = skill.steps[0]
      return windup !== undefined && first && canShove(first) &&
        Math.max(now, foeShared, enemy.actionAt) + windup + first.delay < until
    }))
  if (!pushers.length) return
  const threats = (position: PositionAt) => shortAreaThreats(battle, actor, pushers, until, position, now, undefined, true)
    .filter(({ strike }) => strike.step && canShove(strike.step))
  const loss = (contact: AnnouncedStrike, position: PositionAt) => {
    const aid = aidBeforeHit(battle, actor, contact.at, position)
    const hit = announcedHit(battle, contact, actor, position(actor, contact.at), position, aid.hp, aid.shield, 0, undefined, aid.defy)
    if (!hit) return 0
    if (hit.lethal) return 1.4
    const shift = announcedShift(battle, contact, actor, position)
    return shift ? Math.max(0, hit.hpLoss - hit.saveHeal) / Math.max(aid.hp, 1) + (isOutside(shift.end) ? .4 : 0) : 0
  }
  const key = (contact: AnnouncedStrike) => contact.source.id + "/" + contact.strike.cast.skill?.id
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const standing = new Map(threats(stays).map(contact => [key(contact), loss(contact, stays)]))
  const foe = sideOf(battle, actor.id) === "ally" ? battle.sparring! : battle
  const frame = decisionStep()
  const nextFrame = (at: number) => now + Math.ceil((at - now) / frame - 1e-6) * frame
  const starts = nextFrame(Math.max(now, foeShared, foe.moveAt))
  const movingReplies = pushers.flatMap(enemy => {
    if (enemy.move || isOutside(enemy) || movementStopped(battle, enemy)) return []
    return enemy.actives.flatMap(skill => {
      const step = skill.steps[0]
      const circle = step && canShove(step) && circleDamage(skill)?.beats.find(beat => beat.step === step)
      return circle && nextFrame(Math.max(starts + COOLDOWN.shared, enemy.actionAt)) + circle.delay < until
        ? [{ enemy, skill, step, radius: circle.radius, delay: circle.delay }] : []
    })
  })
  const afterEnemyMove = (position: PositionAt) => {
    let risk = 0
    for (const { enemy, skill, step, radius, delay } of movingReplies) {
      const anchor = position(actor, until)
      const landing = moveLanding(enemy, anchor, battle)
      if (!landing || edgeDistance(enemy, landing) < 7 || summonTerrainInPath(battle, enemy, landing) ||
        dancerMovesBySkill(battle, enemy, anchor)) continue
      const arrival = starts + edgeDistance(enemy, landing) / movementSpeed(battle, { ...enemy, move: landing })
      const issuedAt = nextFrame(Math.max(arrival + SPARRING_STEP, starts + COOLDOWN.shared, enemy.actionAt))
      const at = issuedAt + delay
      if (at >= until || crossesHostileGate(battle, enemy, landing, starts, arrival) ||
        availablePortalExit(battle, enemy, landing, arrival)) continue
      const from = { ...enemy, ...landing }
      const patient = position(actor, at)
      // A closer target gives the enemy more room to aim after committing a walk.
      const depth = clamp((skill.aim.range + radius - edgeDistance(from, patient)) / radius, 0, 1)
      if (!depth) continue
      const aim = fitReplyAim(from, skill, patient)
      if (skillCastProblem(battle, from, skill, aim, undefined, issuedAt)) continue
      const [area] = previewSkillAreas(battle, from, skill, aim)
      const cast = { ...forecastSkillCast(from, skill, actor), aim, issuedAt }
      const strike = fixedAreaStrike(cast, step, area, true)
      if (strike) risk = Math.max(risk, depth * loss({ at, source: from, strike }, position))
    }
    return risk
  }
  const standingAfterEnemyMove = movingReplies.length ? afterEnemyMove(stays) : 0
  return (path: AdvancePath) => {
    if (path.arrival >= until) return 0
    const walk = walkForecast(battle, actor, path)
    // Landing finishes the walk, but the fighter still needs time to act or move again.
    const replies = threats(walk).filter(contact => contact.at > path.arrival)
    const increase = Math.max(0, ...replies.map(contact => loss(contact, walk) - (standing.get(key(contact)) ?? 0)))
    const afterMove = movingReplies.length ? Math.max(0, afterEnemyMove(walk) - standingAfterEnemyMove) : 0
    return Math.max(increase, afterMove * .55) * (MOVE_REACH + edgeDistance(actor, path.landing))
  }
}

function movingIntoCircleRange(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[]) {
  const now = battle.time
  const nextMove = now + COOLDOWN.move
  if (actor.actionAt > nextMove || actor.range < 200 || enemies.length < 2 || actor.hp > actor.maxHp * .65 ||
    !moveRecovery(battle, actor)) return
  const circles = actor.actives.flatMap(skill => {
    const circle = circleDamage(skill)
    return circle ? [{ skill, ...circle }] : []
  })
  if (!circles.length) return
  const windup = Math.max(...circles.map(circle => circle.delay - circle.beats[0].step.delay))
  const contactDelay = Math.max(...circles.map(circle => circle.delay))
  const pointValue = (from: EdgePoint, ready: number) => {
    const caster = { ...actor, ...from }
    const position = (unit: EdgeUnit, at: number) => unit === actor ? from : future(battle, unit, at - now)
    let best = 0
    for (const { skill, delay, radius, beats } of circles) {
      const at = ready + delay
      const targets = enemies.filter(enemy => targetable(battle, enemy, at)).map(unit => ({ unit, at: position(unit, at) }))
      for (const aim of circleAims(radius, targets.map(target => target.at))) {
        const used = fitReplyAim(caster, skill, aim)
        if (skillCastProblem(battle, caster, skill, used, undefined, ready)) continue
        const targetsInRange = targets.filter(target => edgeDistance(target.at, used) <= radius)
        if (targetsInRange.length < 2) continue
        const cast = { ...forecastSkillCast(caster, skill, caster), aim: used, issuedAt: ready }
        const hits = beats.map(({ step, power, radius }): AnnouncedStrike => ({
          at, source: caster, strike: { cast, step, power, area: areaOf("C", used, direction(from, used), radius), needsOwner: true },
        }))
        const value = targetsInRange.reduce((total, { unit }) => {
          const before = aidBeforeHit(battle, unit, at, position)
          const after = lifeThroughStrikes(battle, unit, hits, position)
          return total + Math.max(0, before.hp - after.hp + (before.shield - after.shield) * .15) / unit.maxHp +
            (after.hp ? 0 : .5)
        }, 0)
        best = Math.max(best, value)
      }
    }
    return best
  }
  const stationary = pointValue(actor, Math.max(now + COOLDOWN.shared, actor.actionAt))
  const values = new Map<string, { gain: number; exposure: number } | undefined>()
  const assess = (path: AdvancePath) => {
    const earliest = Math.max(path.arrival + SPARRING_STEP, now + COOLDOWN.shared, actor.actionAt)
    const ready = now + Math.ceil((earliest - now) / decisionStep() - 1e-6) * decisionStep()
    const healing = Math.min(actor.maxHp - actor.hp, moveRecovery(battle, actor, path.landing, path.arrival))
    if (ready > nextMove || !healing || path.landing !== path.stop) return
    const value = pointValue(path.stop, ready) - stationary
    if (value < .2) return
    const moving = walkForecast(battle, actor, path)
    const through = ready + contactDelay
    const queued = announcedStrikes(battle, actor, through, moving)
    const hostile = readyAdvanceReplies(battle, actor, enemies, through, moving)
    // A large cast is only worth setting up when the walk and the cast can
    // finish. A heal after reaching the destination cannot save a cut-off walk.
    const heal: TimedAid = { at: path.arrival, heal: healing }
    const remaining = (contacts: AnnouncedStrike[]) => lifeThroughStrikes(battle, actor, contacts, moving, [heal],
      undefined, through + SPARRING_STEP * 2).hp
    const afterQueued = remaining(queued)
    if (!afterQueued) return
    const interrupts = (contact: AnnouncedStrike) => {
      const shift = announcedShift(battle, contact, actor, moving)
      return !!shift && (isOutside(shift.end) || contact.at < ready && contact.at + shift.duration >= ready ||
        contact.at < path.arrival || contact.at >= ready && contact.at < ready + windup)
    }
    if (queued.some(interrupts)) return
    let exposure = Math.max(0, (actor.hp + healing - afterQueued) * 200 / actor.maxHp)
    for (const contact of hostile) {
      const result = remaining([...queued, contact].sort((a, b) => a.at - b.at))
      if (!result || interrupts(contact)) return
      exposure = Math.max(exposure, 200 * (actor.hp + healing - result) / actor.maxHp)
    }
    return { gain: (value * 143 + healing / actor.maxHp * 185) / (1 + .17 * (ready - now)) -
      Math.max(0, edgeDistance(actor, path.stop) - MOVE_REACH) * .74, exposure }
  }
  return (path: AdvancePath) => {
    const key = `${path.landing.x}/${path.landing.y}/${path.arrival}`
    if (!values.has(key)) values.set(key, assess(path))
    return values.get(key)
  }
}

// These ranges rank routes. The attack planner still verifies its chosen aim,
// the contact time, and any defenses after the walk has finished.
export function teamAdvanceScoring(battle: EdgeBattle, side: EdgeSide, team: EdgeFighter[], enemies: EdgeFighter[]) {
  const now = battle.time
  const foeShared = side === "ally" ? battle.sparring!.sharedAt : battle.sharedAt
  const nextMove = now + COOLDOWN.move
  const at = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const readyAt = (unit: EdgeUnit, shared: number) => Math.max(shared, unit.actionAt, unit.force ? unit.force.since + unit.force.duration : now)
  const kits = new Map([...team, ...enemies].map(unit => [unit, equippedReach(unit)]))
  const reach = (unit: EdgeFighter, target: EdgeFighter, time: number) =>
    Math.max(attackRange(battle, unit, target, time), kits.get(unit)!.damage)
  const aidReach = (unit: EdgeFighter, time: number) => Math.max(
    readyAt(unit, now + COOLDOWN.shared) <= time ? kits.get(unit)!.aid : 0,
    combatHasRole(unit, "bulwark") && (unit.passiveAt[BULWARK_COVER.id] ?? 0) <= time ? BULWARK_COVER.range : 0,
  )
  const replies = enemies.map(enemy => ({ enemy, response: readyAt(enemy, foeShared) }))
  const returns = enemies.flatMap(enemy => {
    const route = committedReturn(battle, enemy)
    const until = Math.max(now, route?.arrival ?? Infinity, foeShared, enemy.actionAt) + SPARRING_STEP
    return route && until < nextMove + .2 ? [{ enemy, route }] : []
  })
  const risks = new Map<EdgeFighter, { closing: ReturnType<typeof closingAnswerRisk>; circle: ReturnType<typeof incomingCircleRisk>;
    reachCircle: ReturnType<typeof movingIntoCircleRange>; shove: ReturnType<typeof advanceShoveRisk> }>()
  const castValues = new Map<EdgeFighter, number>()
  const shots = new Map<string, number>()
  const confined = battle.runtime.fields.some(field => field.mode === "enter" && field.until > now &&
    sideOf(battle, field.cast.owner) !== side && field.step.selector.units === "e" &&
    field.step.operations.some(op => op.kind === "d" && !op.style) && team.some(unit => !field.seen.has(unit.id) &&
      edgeDistance(unit, field.area.center) <= MOVE_REACH + Math.max(...field.step.selector.size)))
  const scouted = enemies.filter(enemy => readyAt(enemy, foeShared) < now + COOLDOWN.shared &&
    enemy.actives.some(skill => skill.steps[0]?.selector.shape === "L" &&
      skill.steps[0].operations.some(op => op.kind === "p" && op.args[0] >= 70)))
  const beforePush = new Map<EdgeFighter, AnnouncedStrike[]>()
  return (actor: EdgeFighter, target: EdgeFighter, path: AdvancePath, exposureOnApproach = 0) => {
    const ready = readyAt(actor, Math.max(now + COOLDOWN.shared, path.arrival))
    const forecast = Math.min(nextMove, ready)
    const targetAt = at(target, forecast)
    const range = reach(actor, target, forecast)
    const before = edgeDistance(actor, targetAt) - range
    const after = edgeDistance(path.stop, targetAt) - range
    const contact = ready <= nextMove && before > 8 && after <= -8 && targetable(battle, target, ready)
    const progress = clamp((Math.max(0, before) - Math.max(0, after)) / MOVE_REACH, 0, 1)
    const history = battle.runtime.histories.get(target.id)
    const linked = history && history.hitBy !== actor.id && sameSide(battle, actor.id, history.hitBy) && now - history.hitAt < 2.8
    let support = 0
    let cover = 0
    let bringCover = 0
    let lostCover = 0
    const actorAid = aidReach(actor, Math.min(nextMove, path.arrival + .7))
    for (const partner of team) {
      if (partner === actor) continue
      const supportAt = readyAt(partner, now + COOLDOWN.shared)
      const time = Math.min(nextMove, Math.max(supportAt, forecast))
      const from = at(partner, time)
      if (isOutside(from)) continue
      const gap = edgeDistance(from, at(target, time))
      if (supportAt <= nextMove && gap <= reach(partner, target, time) - 8) support = Math.max(support, supportAt <= forecast + .6 ? 1 : .65)
      const afterGap = edgeDistance(from, path.stop)
      const beforeGap = edgeDistance(from, actor)
      const partnerAid = aidReach(partner, Math.min(time, path.arrival + .6))
      if (afterGap <= partnerAid - 8) cover = Math.max(cover, .35)
      if (afterGap <= GUARD_REACH - 8 && (partner.card.job === "tank" || combatHasRole(partner, "paladin"))) cover = Math.max(cover, .18)
      if (actorAid && gap <= reach(partner, target, time) + 45) {
        if (beforeGap > actorAid && afterGap <= actorAid - 8) bringCover = Math.max(bringCover, 42)
        if (beforeGap <= actorAid - 8 && afterGap > actorAid + 18) lostCover = Math.max(lostCover, 42)
      }
    }
    let risk = 0
    let highest = 0
    for (const { enemy, response } of replies) {
      const time = Math.max(path.arrival, response)
      if (time > Math.min(nextMove, path.arrival + 1) || !targetable(battle, actor, time)) continue
      const from = at(enemy, time)
      if (isOutside(from)) continue
      const range = reach(enemy, actor, time)
      const was = edgeDistance(from, actor)
      const will = edgeDistance(from, path.stop)
      if (will > range - 8 || was - will < 28) continue
      const shield = actor.shieldUntil > time ? actor.shield : 0
      const basic = attackRange(battle, enemy, actor, time)
      const increase = was > range + 8 ? 1 : was > basic + 8 && will <= basic ? .72 : .20
      const damage = enemy.attack * (1 - actor.armor) * increase / Math.max(1, actor.hp + shield)
      highest = Math.max(highest, damage)
      risk += damage
    }
    // The other team shares an action clock too. Prefer routes with an answer to
    // the first reply instead of assuming every enemy fires at once.
    const danger = (highest + (risk - highest) * .35) * (1 - cover)
    const isolation = 1 - support * .45
    const hitValue = contact ? 45 * (1 - .22 * (ready - now - COOLDOWN.shared)) : 0
    const joinValue = (support * 56 + (linked ? 18 : 0)) * progress
    const exposure = Math.min(205, danger * 670) * isolation
    const returnRisk = returns.reduce((risk, { enemy, route }) =>
      Math.max(risk, returnCounterRisk(battle, actor, enemy, route, foeShared, path)), 0)
    let assess = risks.get(actor)
    if (!assess) {
      assess = { closing: closingAnswerRisk(battle, actor, enemies, team, foeShared), circle: incomingCircleRisk(battle, actor, team, enemies, foeShared),
        reachCircle: movingIntoCircleRange(battle, actor, enemies), shove: advanceShoveRisk(battle, actor, enemies, foeShared) }
      risks.set(actor, assess)
    }
    const opening = assess.reachCircle?.(path)
    const heldAt = readyAt(actor, Math.max(now, side === "ally" ? battle.sharedAt : battle.sparring!.sharedAt))
    const delay = ready - heldAt
    let castCost = 0
    if (actor.range >= 200 && kits.get(actor)!.damage > 0 && delay >= decisionStep() &&
      heldAt < now + COOLDOWN.shared && ready < nextMove) {
      let held = castValues.get(actor)
      if (held === undefined) {
        held = Math.max(0, ...enemies.map(enemy => reachableStrike(battle, actor, enemy, actor, heldAt, false)))
        castValues.set(actor, held)
      }
      // Movement spends the shared action and a walking card cannot cast.
      // Keep an imminent shot when another member can make comparable ground.
      if (held >= 1.15) castCost = MOVE_REACH * Math.min(.27, delay * held * .18)
    }
    let addedShot = 0
    if (confined && !opening && actor.range >= 200 && kits.get(actor)!.damage > 0 && ready <= nextMove + 2 * COOLDOWN.shared) {
      const frame = decisionStep()
      const fires = now + Math.ceil((ready - now) / frame - 1e-6) * frame
      const key = actor.id + "/" + target.id + "/" + fires
      let standing = shots.get(key)
      if (standing === undefined) {
        standing = reachableStrike(battle, actor, target, actor, fires, false)
        shots.set(key, standing)
      }
      const moving = reachableStrike(battle, actor, target, path.stop, fires, false)
      addedShot = Math.min(30, Math.max(0, moving - standing) * 32) / (1 + .2 * (fires - now))
    }
    if (scouted.length && !beforePush.has(actor)) {
      beforePush.set(actor, pushLineReplies(battle, actor, scouted, now + COOLDOWN.shared + .1, at)
        .filter(hit => announcedShift(battle, hit, actor, at)))
    }
    const lateShove = Math.max(0, (assess.shove?.(path) ?? 0) - (opening?.exposure ?? exposureOnApproach))
    return hitValue + joinValue + bringCover - lostCover - Math.max(exposure, returnRisk) -
      (assess.closing?.(path) ?? 0) - (assess.circle?.(path) ?? 0) - lateShove - castCost -
      joiningPushLine(battle, actor, team, scouted, path, beforePush.get(actor) ?? []) + addedShot +
      (opening ? opening.gain + exposureOnApproach - opening.exposure : 0)
  }
}

function pushLineReplies(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeFighter[], until: number, position: PositionAt,
  partners?: EdgeFighter[], after = battle.time) {
  return [...shortAreaThreats(battle, actor, enemies, until, position, after, partners, "short-windup"),
    ...shortAreaThreats(battle, actor, enemies, until, position, after, partners, true)]
    .filter(hit => hit.strike.step?.selector.shape === "L" && hit.strike.step.operations.some(op => op.kind === "p"))
}

function sidePushAims(battle: EdgeBattle, contact: AnnouncedStrike): AnnouncedStrike[] {
  const { source, strike } = contact
  const { skill, aim, issuedAt } = strike.cast
  if (!("area" in strike) || !skill || !isFighter(source) ||
    !strike.step?.operations.some(op => op.kind === "p" && op.style === "side")) return [contact]
  const across = rotate(direction(source, aim), 90)
  const span = Math.min(24, strike.step.selector.size[1] * .24)
  const alternatives = [-span, span].flatMap(offset => {
    const at = fitReplyAim(source, skill, along(aim, across, offset))
    if (skillCastProblem(battle, source, skill, at, undefined, issuedAt)) return []
    const [area] = previewSkillAreas(battle, source, skill, at)
    return area ? [{ ...contact, strike: { ...strike, area, cast: { ...strike.cast, aim: at } } }] : []
  })
  return [contact, ...alternatives]
}

function joiningPushLine(battle: EdgeBattle, actor: EdgeFighter, team: EdgeFighter[], enemies: EdgeFighter[],
  path: AdvancePath, standing: AnnouncedStrike[]) {
  if (!enemies.length) return 0
  const partners = team.filter(ally => ally !== actor && !isOutside(ally) && edgeDistance(path.stop, ally) <= 240)
  if (!partners.length) return 0
  const now = battle.time
  const until = Math.min(now + COOLDOWN.shared + .1, path.arrival + .12)
  const walking = walkForecast(battle, actor, path)
  const threats = pushLineReplies(battle, actor, enemies, until, walking, partners)
  let cost = 0
  for (const hit of threats) {
    const displacement = announcedShift(battle, hit, actor, walking)
    if (!displacement || standing.some(prior => prior.source.id === hit.source.id && prior.strike.cast.skill === hit.strike.cast.skill &&
      prior.at <= hit.at + SPARRING_STEP)) continue
    const touched = partners.filter(ally => announcedHit(battle, hit, ally, walking(ally, hit.at), walking))
    if (!touched.length) continue
    const struck = announcedHit(battle, hit, actor, walking(actor, hit.at), walking)
    if (!struck) continue
    const harm = (struck.hpLoss + .35 * struck.shieldLoss) / actor.maxHp
    // Being pushed on the way in can cancel the walk even through a shield.
    const interruption = hit.at < path.arrival - .03 ? .26 : .11
    const exile = isOutside(displacement.end) ? .38 : 0
    cost = Math.max(cost, MOVE_REACH * (interruption + exile + .17 * touched.length + harm))
  }
  return cost
}

export function walkHitsWarning(actor: EdgePoint, landing: EdgePoint, now: number, arrival: number, warning: AreaVisual, exit = landing) {
  return warningContains(warning, walkAt(actor, landing, now, arrival, warning.until, exit))
}

export function warningContains(warning: AreaVisual, at: EdgePoint) {
  const { area, shove } = warning
  return shove ? skillAreaContains(shove.cast, shove.step.selector.shape, area, at) : areaHits(area, at) > 0
}

export function warningEscapeDirections(area: AreaVisual["area"], actor: EdgePoint) {
  const away = direction(area.center, actor)
  const directions = [0, -45, 45, -90, 90, 180].map(turn => rotate(away, turn))
  for (const part of area.parts) {
    if (part.kind === "circle") directions.push(direction(part.center, actor))
    else for (let i = 0; i < part.points.length; i++) {
      const edge = direction(part.points[i], part.points[(i + 1) % part.points.length])
      directions.push(rotate(edge, 90), rotate(edge, -90))
    }
  }
  return directions
}

export function warningDamage(battle: EdgeBattle, warning: AreaVisual, target: EdgeUnit, at: EdgePoint = target) {
  const source = unitOf(battle, warning.owner)
  if (!source) return 0
  return source.attack * (warning.damagePower ?? 1.4) * roleDamageScale(battle, source, target) * (1 - target.armor) *
    (isOutside(source) ? EXILE.damage : 1) * (isOutside(at) ? EXILE.received : 1)
}

export interface AreaDodge extends AdvancePath {
  point: EdgePoint
  value: number
  downAt: number
  anticipatesFollowUp?: boolean
  exposedToPursuit?: boolean
  risksFollowUp?: (walk: (time: number) => EdgePoint) => boolean
}

function ensemblePushRisk(battle: EdgeBattle, actor: EdgeUnit, until: number) {
  if (!battle.runtime.summons.length) return
  const rams = activeDeployments(battle).flatMap(({ group, deployment, plan }) => {
    if (deployment.kind !== "ensemble" || sameSide(battle, group.owner, actor.id)) return []
    const [,, action] = plan.actions!
    const body = deployment.bodies[action.slot!]
    const radius = action.step.selector.size[0]
    const frames = Math.max(1, Math.ceil((body.actionsAt[2] - battle.time) / SPARRING_STEP - 1e-6))
    const ready = battle.time + frames * SPARRING_STEP
    const expires = group.until - SUMMON_DISMISS_TIME
    return body.hp && ready <= until && ready < expires && edgeDistance(actor, body) <= radius + MOVE_REACH
      ? [{ body, area: summonActionArea(battle, group, body, action)!, ready, expires,
        push: action.step.operations[0].args[0] }]
      : []
  })
  if (!rams.length) return
  const others = battleUnits(battle).filter(unit => unit !== actor && unit.hp && sameSide(battle, unit.id, actor.id))
  return (position: PositionAt, deadline: number) => {
    let first: number | undefined
    for (const { body, area, ready, expires, push } of rams) {
      const inReach = (unit: EdgeUnit, time: number) => areaHits(area, position(unit, time))
      for (let at = ready; at <= Math.min(deadline, first ?? Infinity) + 1e-6 && at < expires; at += SPARRING_STEP) {
        if (inReach(actor, at)) {
          const place = position(actor, at)
          const end = previewDirectedShove(battle, actor, place, direction(body, place), push, at)
          if (edgeDistance(place, end) >= 3) first = at
          break
        }
        // The ram can spend its pulse on another target before
        // the card arrives. It only spends the pulse on actual contact.
        if (others.some(unit => inReach(unit, at))) break
      }
    }
    return first
  }
}

function closingContacts(battle: EdgeBattle, actor: EdgeUnit, fields: ClosingField[], position: PositionAt, until: number) {
  return fields.flatMap(field => {
    const source = unitOf(battle, field.cast.owner)
    const contact = source && closingFieldContact(battle, field, source, actor, position, until)
    return contact ? [contact] : []
  })
}

export function lethalClosingFieldOnPath(battle: EdgeBattle, actor: EdgeUnit, path: AdvancePath) {
  const now = battle.time
  const until = Math.max(path.arrival, now + COOLDOWN.move)
  const fields = announcedClosingFields(battle, actor, until)
  if (!fields.length) return false
  const moving = walkForecast(battle, actor, path)
  const contacts = closingContacts(battle, actor, fields, moving, until)
  return contacts.length > 0 && !lifeThroughStrikes(battle, actor, contacts.sort((a, b) => a.at - b.at), moving).hp
}

export function dodgeClosingField(battle: EdgeBattle, actor: EdgeUnit): AreaDodge | undefined {
  const now = battle.time
  const until = now + COOLDOWN.move
  const fields = announcedClosingFields(battle, actor, until)
  if (!fields.length) return
  const staying = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const contacts = closingContacts(battle, actor, fields, staying, until).sort((a, b) => a.at - b.at)
  if (!contacts.length) return
  const combined = [...contacts, ...announcedStrikes(battle, actor, until, staying)].sort((a, b) => a.at - b.at)
  const current = lifeThroughStrikes(battle, actor, combined, staying)
  if (current.hp || current.downAt - now <= .08 || !contacts.some(contact => contact.at <= current.downAt)) return

  const { cast } = contacts[0].strike
  const axis = direction(cast.from, cast.aim)
  const speed = movementSpeed(battle, actor)
  const directions = [axis, rotate(axis, 180), ...warningEscapeDirections(contacts[0].strike.area, actor)]
  let best: AreaDodge | undefined
  for (const heading of directions) {
    const point = inside(along(actor, heading, MOVE_REACH), 14)
    const landing = moveLanding(actor, point, battle)
    if (!landing || dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
    const distance = edgeDistance(actor, landing)
    const arrival = now + distance / speed
    if (distance < 12 || availablePortalExit(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, now, false, true, true) ||
      walksIntoShoreBeast(battle, actor, landing, arrival) || exposesToEdgePush(battle, actor, landing, arrival)) continue
    const path = { landing, arrival, stop: landing }
    const moving = walkForecast(battle, actor, path)
    if (closingContacts(battle, actor, fields, moving, until).length) continue
    const after = lifeThroughStrikes(battle, actor, announcedStrikes(battle, actor, until, moving), moving)
    if (!after.hp) continue
    const value = 5.3 + after.hp / actor.maxHp + Math.min(70, borderGap(landing)) / 350 - distance / 650 -
      approachExposure(battle, actor, landing, arrival) / MOVE_REACH
    if (value > (best?.value ?? 0)) best = { ...path, point, value, downAt: current.downAt }
  }
  return best
}

function repeatedAreaSpacing(battle: EdgeBattle, actor: EdgeUnit, opening: AnnouncedStrike, contacts: AnnouncedStrike[],
  until: number, position: PositionAt) {
  const { source, strike } = opening
  const skill = strike.cast.skill
  if (!skill || !("area" in strike) || strike.step?.selector.shape !== "C" ||
    opening.zone || !source.hp || source.force) return []
  const gap = strike.step.selector.size[0] * 2 + 2
  return alliesOf(battle, actor.id).flatMap(ally => {
    if (ally === actor || !ally.hp || ally.force || isOutside(ally) ||
      !announcedHit(battle, opening, ally, position(ally, opening.at), position)) return []
    const incoming = announcedStrikes(battle, ally, opening.at, position)
    const after = lifeThroughStrikes(battle, ally, incoming, position)
    if (!after.hp || after.hp >= ally.hp || after.hp > ally.maxHp * .38) return []
    const repeat = shortAreaThreats(battle, actor, [source], until, position, opening.at + SPARRING_STEP, [ally], "circle-group")
      .find(reply => {
        if (reply.strike.cast.skill?.id !== skill.id) return false
        const next = lifeThroughStrikes(battle, ally, [...incoming, reply], position)
        return next.hp < after.hp && next.hp <= ally.maxHp * .15 &&
          !lifeThroughStrikes(battle, actor, [...contacts.filter(hit => hit.at <= reply.at), reply], position).hp
      })
    return repeat ? [{ ally, gap, at: repeat.at }] : []
  })
}

export function dodgeAreaDamage(battle: EdgeBattle, actor: EdgeUnit, expected?: AnnouncedStrike,
  start = expected?.strike.cast.issuedAt ?? battle.time, opener?: AnnouncedStrike): AreaDodge | undefined {
  const now = battle.time
  if (isOutside(actor) || actor.force || actor.hp > actor.maxHp * .65 || !expected && !battle.runtime.pending.some(({ strike }) =>
    strike && "area" in strike && !sameSide(battle, actor.id, strike.cast.owner))) return
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const contacts = announcedStrikes(battle, actor, Math.max(now + 1.45, expected?.at ?? now), stays)
  if (expected) {
    contacts.push(expected)
    if (opener) contacts.push(opener)
    contacts.sort((a, b) => a.at - b.at)
  }
  const checkPressure = !expected && start === now
  const fragile = checkPressure && actor.hp <= actor.maxHp * .35
  const risks = contacts.flatMap(contact => {
    if (!("area" in contact.strike) || contact.at <= now + .1) return []
    const hit = announcedHit(battle, contact, actor, stays(actor, contact.at), stays)
    const displaced = hit?.shieldLoss && actor.hp <= actor.maxHp * .52 && announcedShift(battle, contact, actor, stays)
    const shieldDamage = hit?.shieldLoss ?? 0
    // A shield-only contact can leave a wounded card open to the next shot.
    return hit?.hpLoss || displaced || fragile && shieldDamage >= actor.maxHp * .08
      ? [{ contact, area: contact.strike.area, shieldDamage }] : []
  })
  const foes = battle.sparring ? (sideOf(battle, actor.id) === "ally" ? battle.sparring.rivals : battle.team) : []
  const projected = !expected && foes.length ? positionAfterStrike(battle, actor, contacts, stays) : undefined
  const incoming = lifeThroughStrikes(battle, actor, contacts, projected?.position ?? stays)
  const lethal = incoming.lethalContact
  if (!risks.length && lethal && "area" in lethal.strike && lethal.at > now + .1) {
    risks.push({ contact: lethal, area: lethal.strike.area, shieldDamage: 0 })
  }
  if (!risks.length) return
  const loss = actor.hp - incoming.hp
  const wardLoss = fragile ? Math.min(Math.max(0, actor.shield - incoming.shield),
    risks.reduce((total, risk) => total + risk.shieldDamage, 0)) : 0
  // A visible hit can break enough protection that a waiting enemy can
  // finish the target before the next shared movement. Test each legal reply
  // separately and keep the earlier contacts in its health forecast.
  const vulnerable = checkPressure && !!projected && incoming.hp > 0 &&
    (loss + wardLoss >= actor.maxHp * .08 && incoming.hp <= actor.maxHp * .35 ||
      projected.last > now && incoming.hp <= actor.maxHp * .52 && (loss > 0 || incoming.shield < actor.shield))
  const deadline = start + COOLDOWN.move
  const afterHit = risks[0].contact.at + SPARRING_STEP
  const afterDisplacement = (last: number) => Math.max(afterHit, last + SPARRING_STEP)
  const checkFollowUp = checkPressure && foes.some(foe => foe.hp && !foe.force &&
    Math.max(foe.actionAt, afterHit, sideOf(battle, foe.id) === "ally" ? battle.sharedAt : battle.sparring!.sharedAt) < deadline - .2)
  const canFinishBeforeMove = (position: PositionAt, repliesAt: number, withoutOpener = false) => {
    if (repliesAt >= deadline - .20) return false
    const falls = (reply: AnnouncedStrike[], path: PositionAt) =>
      !lifeThroughStrikes(battle, actor, withoutOpener ? reply : [...contacts, ...reply].sort((a, b) => a.at - b.at), path).hp
    return targetedFollowUps(battle, actor, foes, repliesAt, deadline, position).some(reply => falls(reply.contacts, reply.position)) ||
      shortAreaThreats(battle, actor, foes, deadline, position, repliesAt, undefined, true).some(contact => falls([contact], position))
  }
  const exposedToFollowUp = vulnerable && projected && canFinishBeforeMove(projected.position, afterDisplacement(projected.last)) &&
    (projected.last <= now || !canFinishBeforeMove(stays, afterHit, true))
  if (incoming.hp > 0 && !exposedToFollowUp && (loss < actor.maxHp * .20 || incoming.hp > actor.maxHp * .4)) return
  const risksFollowUp: AreaDodge["risksFollowUp"] = exposedToFollowUp ? walk => {
    const position = (unit: EdgeUnit, at: number) => unit === actor ? walk(at) : stays(unit, at)
    const path = positionAfterStrike(battle, actor, contacts, position)
    return !!path && (!lifeThroughStrikes(battle, actor, contacts, path.position).hp ||
      canFinishBeforeMove(path.position, afterDisplacement(path.last)))
  } : undefined
  const speed = movementSpeed(battle, actor)
  const routes: { point: EdgePoint; throughGate?: boolean; extended?: boolean; tight?: boolean; shortLineStep?: boolean }[] = []
  const dangers = risks.filter(({ contact }) => contact.at <= incoming.downAt).slice(0, 3)
  if (!dangers.length) return
  const travelAt = (at: number) => Math.min(MOVE_REACH, speed * (at - start - .035))
  const narrowEscapes: typeof routes = []
  const spacing = exposedToFollowUp && battle.sparring ? repeatedAreaSpacing(battle, actor, dangers[0].contact,
    contacts, deadline + COOLDOWN.move + decisionStep(), stays) : []
  // A short step can deny the immediate finisher while leaving the same two
  // wounded cards in reach of one cast. Try separating them on that walk.
  for (const { ally, gap, at } of spacing) {
    const from = stays(ally, at)
    const point = inside(along(from, direction(from, stays(actor, at)), gap), 12)
    if (edgeDistance(actor, point) <= MOVE_REACH) routes.push({ point, extended: true })
  }
  for (const { contact, area } of dangers) {
    const travel = travelAt(contact.at)
    const committedLine = checkPressure && !incoming.hp && contact.strike.step?.selector.shape === "L"
    if (travel < 16 && !committedLine) continue
    const away = direction(area.center, actor)
    const directions = [away, ...[-28, 28, -58, 58].map(angle => rotate(away, angle)), ...warningEscapeDirections(area, actor)]
    if (travel >= 16) for (const axis of directions) {
      const point = inside(along(actor, axis, Math.max(26, travel)), 14)
      if (!routes.some(route => edgeDistance(route.point, point) < 2)) routes.push({ point })
      if (exposedToFollowUp || checkFollowUp && !incoming.hp) {
        const farther = inside(along(actor, axis, MOVE_REACH), 24)
        if (routes.every(route => edgeDistance(route.point, farther) >= 2)) routes.push({ point: farther, extended: true })
      }
    }
    if (!incoming.hp && (committedLine || area.parts.some(part => part.kind === "circle"))) {
      const contains = (at: EdgePoint) => committedLine
        ? skillAreaContains(contact.strike.cast, "L", area, at) : areaHits(area, at) > 0
      if (routes.some(route => !route.extended && !contains(route.point))) continue
      // The normal timing margin can hide an escape past the edge of a hit.
      // Use the exact stride for a line when moving now. Keep the timing
      // margin when deciding whether the card can wait another turn.
      const exactTravel = Math.min(MOVE_REACH, speed * (contact.at - start))
      const usual = inside(along(actor, away, exactTravel), 14)
      const usualAvailable = routes.every(route => contains(route.point))
      for (const axis of directions) {
        const point = inside(along(actor, axis, exactTravel), 14)
        if (!contains(point) && narrowEscapes.every(route => edgeDistance(route.point, point) >= 2))
          narrowEscapes.push({ point, tight: committedLine || !usualAvailable || edgeDistance(point, usual) >= 2, shortLineStep: committedLine })
      }
    }
  }
  const lastDanger = dangers.at(-1)
  if (lastDanger && isFighter(actor) && battle.runtime.summons.length) {
    const travel = travelAt(lastDanger.contact.at)
    for (const { group, deployment, plan } of activeDeployments(battle)) {
      if (!plan.gate || !sameSide(battle, group.owner, actor.id) || deployment.bodies.some(body => !body.hp)) continue
      const [first, second] = deployment.bodies
      for (const [entry, other] of [[first, second], [second, first]]) {
        const point = portalEntryRequest(actor, entry, other, plan.gate.radius)
        if (edgeDistance(actor, point) <= travel) routes.push({ point, throughGate: true })
      }
    }
  }
  const ramRisk = lastDanger && ensemblePushRisk(battle, actor, lastDanger.contact.at + .8)
  const escapes: (AreaDodge & { gate: boolean; extended?: boolean; tight?: boolean; pushed?: boolean })[] = []
  for (const { point, throughGate, extended, tight, shortLineStep } of [...routes, ...narrowEscapes]) {
    const request = moveLanding(actor, point, battle, false)
    if (!request || dancerMovesBySkill(battle, actor, point)) continue
    const landing = tetherLanding(battle, actor, request)
    if (summonTerrainInPath(battle, actor, landing)) continue
    const distance = edgeDistance(actor, landing)
    // Effects such as Gravity Disk slow an outward walk once it starts.
    const arrival = start + distance / movementSpeed(battle, { ...actor, move: landing })
    if (crossesHostileGate(battle, actor, landing, start, arrival)) continue
    const exit = landing === request ? availablePortalExit(battle, actor, landing, arrival) : undefined
    const checksExit = exit && portalExitIsExposed(battle, actor, exit, arrival, start)
    if (throughGate && !exit || distance < (exit || shortLineStep ? 7 : 15) || checksExit ||
      walksIntoShoreBeast(battle, actor, landing, arrival, exit, start) ||
      walksIntoWarning(battle, actor, landing, arrival, exit, start, false, true)) continue
    const position = (unit: EdgeUnit, time: number) => unit === actor && time >= start
      ? walkAt(actor, landing, start, arrival, time, exit) : stays(unit, time)
    if (start > now && contacts.some(contact => contact.at <= start && announcedShift(battle, contact, actor, stays))) continue
    // A move can avoid one part of a strike, such as the inner ring. If an
    // earlier hit knocks the card off its path, later clearance is uncertain.
    const avoided = dangers.filter(({ contact }) => !announcedHit(battle, contact, actor, position(actor, contact.at), position))
    const lastEscape = avoided.at(-1)?.contact.at ?? (exposedToFollowUp ? deadline : undefined)
    if (lastEscape === undefined || contacts.some(contact => {
      const shift = announcedShift(battle, contact, actor, position)
      return shift && (isOutside(shift.end) || contact.at < lastEscape - SPARRING_STEP)
    })) continue
    const ram = ramRisk?.(position, lastEscape + .8)
    if (ram !== undefined && ram < lastEscape - SPARRING_STEP) continue
    const carried = checkFollowUp ? positionAfterStrike(battle, actor, contacts, position) : undefined
    const after = lifeThroughStrikes(battle, actor, contacts, carried?.position ?? position)
    if (!after.hp || !exposedToFollowUp && incoming.hp > 0 && after.hp - incoming.hp < Math.min(actor.hp, actor.maxHp * .12)) continue
    const exposed = carried && canFinishBeforeMove(carried.position, afterDisplacement(carried.last))
    if (exposed && (exposedToFollowUp || shortLineStep)) continue
    const urgency = incoming.hp === 0 ? 5.3 : exposedToFollowUp ? 4.25 : 2.65 + Math.min(1, (after.hp - incoming.hp) / actor.hp)
    const afterWalk = carried?.position ?? position
    const separated = spacing.length > 0 && spacing.every(({ ally, gap, at }) =>
      edgeDistance(afterWalk(actor, at), afterWalk(ally, at)) >= gap - .1)
    const preservedWard = exposedToFollowUp ? Math.min(wardLoss, Math.max(0, after.shield - incoming.shield)) : 0
    const value = urgency + (after.hp - incoming.hp + preservedWard) / actor.maxHp - distance / 650 +
      (separated ? .38 : 0) +
      Math.min(70, borderGap(exit ?? landing)) / 350 - approachExposure(battle, actor, exit ?? landing, arrival) / MOVE_REACH
    escapes.push({ point, value, arrival, landing, stop: exit ?? landing, downAt: incoming.downAt, gate: !!exit, exposedToPursuit: !!exposed, extended, tight,
      pushed: ram !== undefined, anticipatesFollowUp: !!exposedToFollowUp, risksFollowUp })
  }
  const unexposed = escapes.filter(route => !route.exposedToPursuit)
  const unpushed = unexposed.filter(route => !route.pushed)
  const safe = unpushed.length ? unpushed : unexposed
  const available = safe.length ? safe : exposedToFollowUp ? [] : escapes.filter(route => !route.extended)
  // Use the last-tick boundary routes when the ordinary routes cannot keep
  // the actor as safe. The longer escape can get the actor out of follow-up range.
  const ordinary = available.filter(route => !route.tight)
  const preferred = ordinary.length ? ordinary : available
  const short = preferred.filter(route => !route.extended)
  const viable = exposedToFollowUp || !short.length ? preferred : short
  const best = viable.reduce<AreaDodge | undefined>((choice, route) => !choice || route.value > choice.value ? route : choice, undefined)
  if (!best || !battle.sparring || !isFighter(actor) ||
    !exposedToFollowUp && (!viable.some(route => route.gate) || !viable.some(route => !route.gate))) return best
  const ready = Math.max(now + COOLDOWN.shared, actor.actionAt)
  // A safe endpoint should leave the next attack available. Use a short
  // forecast even if the fighter's own cooldown extends past the next move.
  const followUp = (route: AdvancePath) => {
    const fireAt = Math.max(ready, route.arrival + SPARRING_STEP)
    if (fireAt > now + COOLDOWN.move + .9) return 0
    const options = foes.filter(enemy => enemy.hp).map(enemy => reachableStrike(battle, actor, enemy, route.stop, fireAt))
    const primary = Math.max(0, ...options)
    const others = options.reduce((sum, value) => sum + value, 0) - primary
    return Math.min(.52, .19 * primary + .045 * others)
  }
  // Only break ties between otherwise comparable escapes. A gate can be the
  // right choice if it buys more health or provides the only legal exit.
  let choice = best
  let score = -Infinity
  for (const route of viable) {
    if (route.value < best.value - .24) continue
    const value = route.value + followUp(route)
    if (value > score) {
      choice = route
      score = value
    }
  }
  return choice
}

export function dodgeBeforeNextThink(battle: EdgeBattle, actor: EdgeUnit, nextDecision: number, canRiskPursuit = false) {
  if (actor.move) return
  const immediate = dodgeAreaDamage(battle, actor)
  if (immediate && Number.isFinite(immediate.downAt) && (canRiskPursuit || !immediate.exposedToPursuit) &&
    !dodgeAreaDamage(battle, actor, undefined, nextDecision)) return immediate
}

export function waitForAreaBeforeAdvance(battle: EdgeBattle, actor: EdgeFighter, path: AdvancePath,
  team: EdgeFighter[], opponents: EdgeFighter[]) {
  const now = battle.time
  const opponentClock = sideOf(battle, actor.id) === "ally" ? battle.sparring : battle
  // Waiting one decision still leaves the planned cast time available.
  if (path.landing !== path.stop || actor.actionAt <= now + COOLDOWN.shared || path.arrival + decisionStep() > actor.actionAt ||
    !opponentClock || opponentClock.sharedAt > now || actor.hp > actor.maxHp * .5) return false
  const partners = team.filter(unit => unit !== actor && !unit.force && !isOutside(unit) && unit.hp < unit.maxHp * .5)
  if (!partners.length) return false
  const ready = opponents.filter(enemy => enemy.actionAt <= now && !enemy.force && !isOutside(enemy))
  if (!ready.length) return false
  const position = walkForecast(battle, actor, path)
  const replies = shortAreaThreats(battle, actor, ready, now + COOLDOWN.shared, position, now, partners, "circle-group")
  const recovery = path.arrival < now + COOLDOWN.shared ? moveRecovery(battle, actor, path.landing, path.arrival) : 0
  return replies.some(reply => {
    if (reply.strike.cast.issuedAt! > now + SPARRING_STEP / 2) return false
    const takesHeavyHit = (unit: EdgeFighter) => {
      const pending = announcedStrikes(battle, unit, reply.at, position)
      const aid = unit === actor && recovery ? [{ at: path.arrival, heal: recovery }] : []
      const before = lifeThroughStrikes(battle, unit, pending, position, aid, undefined, reply.at)
      const after = lifeThroughStrikes(battle, unit, [...pending, reply], position, aid)
      const remaining = after.hp + after.shield
      return before.hp > 0 && remaining < unit.maxHp * .4 && remaining <= (before.hp + before.shield) * .75
    }
    return takesHeavyHit(actor) && partners.some(takesHeavyHit)
  })
}

export function sharedDodgeWindow(battle: EdgeBattle, team: EdgeFighter[], opponents: EdgeFighter[],
  spending: "attack" | "move", afterOpponent: boolean, route?: AdvancePath & { actor: EdgeFighter; ward?: TimedAid },
  sidestepping?: EdgeFighter): LineDefense | undefined {
  if (!team.length || !battle.sparring) return
  const makingAttack = spending === "attack"
  const cooldown = makingAttack ? COOLDOWN.shared : COOLDOWN.move
  const lines = opponents.filter(unit => unit.hp && unit.actives.some(skill => firstDamageShape(skill) === "L"))
  if (!lines.length) return
  const now = battle.time
  const frame = decisionStep()
  const clocks = sideOf(battle, team[0].id) === "ally" ? battle : battle.sparring
  const foe = clocks === battle ? battle.sparring : battle
  const reactionAt = (ready: number) => now + Math.ceil(Math.max(0, ready - now) / frame - 1e-6) * frame
  const free = reactionAt(clocks.moveAt)
  const next = reactionAt(Math.max(clocks.moveAt, now + cooldown))
  if (!Number.isFinite(next) || free >= next || foe.sharedAt >= next) return
  const earliest = afterOpponent ? now + frame : now
  const circles = makingAttack ? [] : opponents.filter(unit => unit.hp &&
    unit.actives.some(skill => firstDamageShape(skill) === "C"))
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  let first: LineDefense | undefined
  for (const actor of team) {
    if (actor.move || actor.force || actor.hp > actor.maxHp * .65 || isOutside(actor) || movementStopped(battle, actor)) continue
    const queued = announcedStrikes(battle, actor, next + .8, stays)
    const health = lifeThroughStrikes(battle, actor, queued, stays)
    if (!health.hp) continue
    const protectedRoute = route?.actor === actor ? route : undefined
    const walk = protectedRoute && walkForecast(battle, actor, protectedRoute)
    const ward = protectedRoute?.ward
    const lethalLine = (after: number, opener?: AnnouncedStrike) => {
      const sources = opener ? lines.filter(enemy => enemy.id !== opener.source.id) : lines
      for (const contact of shortAreaThreats(battle, actor, sources, next + .8, stays, after, undefined, true)) {
        const castAt = contact.strike.cast.issuedAt
        if (castAt === undefined || contact.strike.step?.selector.shape !== "L" ||
          contact.at >= (first?.at ?? Infinity)) continue
        const response = Math.max(free, castAt)
        if (response >= next) continue
        const impacts = opener ? [opener, contact] :
          [...queued.filter(queuedContact => queuedContact.at <= contact.at), contact]
        if (lifeThroughStrikes(battle, actor, impacts, stays).hp) continue
        const escape = dodgeAreaDamage(battle, actor, contact, response, opener)
        if (!escape || dodgeAreaDamage(battle, actor, contact, next, opener)) continue
        const enemy = sources.find(unit => unit.id === contact.source.id)!
        // Don't reserve a dodge for a line if the same action can place a
        // lethal entry field that the card cannot clear in time.
        if (enemy.actives.some(entryDamageStep)) {
          const entries = shortAreaThreats(battle, actor, [enemy], contact.at, stays, after, undefined, "entry")
          if (entries.some(reply => {
            if (!reply.zone || reply.strike.cast.issuedAt! > castAt) return false
            const opening = opener ? [opener] : queued.filter(hit => hit.at <= reply.at)
            return !lifeThroughStrikes(battle, actor, [...opening, reply], stays).hp &&
              !dodgeAreaDamage(battle, actor, reply, Math.max(free, reply.strike.cast.issuedAt!), opener)
          })) continue
        }
        if (walk && (!ward || ward.at + SPARRING_STEP < contact.at)) {
          // Give the enemy a chance to re-aim after the walk starts.
          const replies = ward
            ? shortAreaThreats(battle, actor, sources, contact.at + frame, walk, after, undefined, true)
            : shortAreaThreats(battle, actor, opponents, next + .8, walk, earliest, undefined, "entry")
          const openers = opener ? shortAreaThreats(battle, actor, circles, after, walk, earliest, undefined, true)
            .filter(hit => hit.source.id === opener.source.id && hit.strike.cast.skill?.id === opener.strike.cast.skill?.id) : queued
          const aid = ward ? [ward] : []
          const shots = [contact, ...replies.filter(reply => reply.strike.cast.issuedAt! < next &&
            (!ward || reply.strike.step?.selector.shape === "L"))]
          const survives = shots.every(reply => {
            const exit = announcedShift(battle, reply, actor, walk)?.end
            if (exit && isOutside(exit)) return false
            const before = openers.filter(hit => hit.at <= reply.at && (!opener || hit.source.id !== reply.source.id &&
              hit.strike.cast.issuedAt! + COOLDOWN.shared <= reply.strike.cast.issuedAt! + 1e-6))
            const chains = opener ? [[], ...before.map(hit => [hit])] : [before]
            return chains.every(chain => {
              if (chain.some(hit => announcedShift(battle, hit, actor, walk))) return false
              const after = lifeThroughStrikes(battle, actor, [...chain, reply], walk, aid)
              return after.hp > 0 && (!ward || after.hp + after.shield >= actor.maxHp * .12)
            })
          })
          if (survives) continue
        }
        // Compare this delay with the attack we could take now. The saved
        // card needs to be able to contribute from its escape route.
        if (makingAttack) {
          const ready = Math.max(actor.actionAt, response + COOLDOWN.shared, escape.arrival)
          if (ready >= contact.at + COOLDOWN.move ||
            !opponents.some(unit => unit.hp && reachableStrike(battle, actor, unit, escape.stop, ready) > 0)) continue
        }
        first = { enemy, castAt, at: contact.at, patient: { unit: actor, impacts } }
      }
    }
    // An announced setup only justifies pausing a walk when it actually
    // weakens the patient. A late contact on other cards must not count.
    // Giving the move to a different ally costs the chance to react this frame.
    const protectsBackline = sidestepping && sidestepping !== actor && actor.range >= 200 &&
      !afterOpponent && foe.sharedAt <= now
    const wardSpent = queued.length > 0 && actor.shieldUntil > queued.at(-1)!.at &&
      actor.shield - health.shield >= actor.maxHp * .12
    if (health.hp <= actor.maxHp * (protectsBackline ? .52 : .35) &&
      (makingAttack || !queued.length || health.hp < actor.hp || wardSpent)) lethalLine(earliest)
    if (!circles.length || queued.length) continue
    // Check one possible opener, then a line on the next legal shared action.
    for (const opener of shortAreaThreats(battle, actor, circles, next, stays, earliest, undefined, true)) {
      if (opener.strike.step?.selector.shape !== "C" || announcedShift(battle, opener, actor, stays)) continue
      const after = Math.max(opener.at + SPARRING_STEP, opener.strike.cast.issuedAt! + COOLDOWN.shared)
      if (after >= next) continue
      const survives = lifeThroughStrikes(battle, actor, [opener], stays)
      if (!survives.hp || survives.hp > actor.maxHp * .35 ||
        health.hp - survives.hp + Math.max(0, health.shield - survives.shield) < actor.maxHp * .18) continue
      lethalLine(after, opener)
    }
  }
  return first
}

export function reserveMoveForCircle(battle: EdgeBattle, team: EdgeFighter[], opponents: EdgeFighter[],
  dodge: AreaDodge & { actor: EdgeFighter }, afterOpponent: boolean) {
  const now = battle.time
  const next = now + decisionStep()
  const earliest = afterOpponent ? next : now
  const stay = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const walk = walkForecast(battle, dodge.actor, dodge)
  const patients = team.filter(unit => unit.hp <= unit.maxHp * .37 && !unit.move && !unit.force && !isOutside(unit))
  const casters = opponents.filter(unit => unit.actionAt <= next && unit.actives.some(skill => firstDamageShape(skill) === "C"))
  if (!casters.length || patients.length < 2) return

  for (const [index, patient] of patients.entries()) {
    for (const partner of patients.slice(index + 1)) {
      const replies = shortAreaThreats(battle, patient, casters, next + 1.05, walk, earliest, [partner], "circle-group")
      for (const reply of replies) {
        const castAt = reply.strike.cast.issuedAt!
        if (castAt > next + 1e-6 || reply.at >= now + COOLDOWN.move) continue
        const falls = (unit: EdgeFighter) => {
          const queued = announcedStrikes(battle, unit, reply.at, walk)
          return lifeThroughStrikes(battle, unit, queued, walk).hp > 0 &&
            !lifeThroughStrikes(battle, unit, [...queued, reply], walk).hp
        }
        if (!falls(patient) || !falls(partner)) continue
        // The team can absorb the earlier strike and react to the actual
        // aim next turn. Spending its walk here could lose both patients.
        const queued = announcedStrikes(battle, dodge.actor, castAt, stay)
        if (!lifeThroughStrikes(battle, dodge.actor, queued, stay).hp) continue
        if ([patient, partner].some(unit => dodgeAreaDamage(battle, unit, reply, castAt))) return castAt
      }
    }
  }
}

export function imminentLineFinish(battle: EdgeBattle, team: EdgeFighter[], opponents: EdgeFighter[], beforeOpponent: boolean) {
  if (team.length < 2 || !battle.sparring) return
  const now = battle.time
  const enemyClock = sideOf(battle, team[0].id) === "ally" ? battle.sparring : battle
  if (enemyClock.sharedAt >= now + COOLDOWN.shared) return
  const exposed = team.filter(unit => unit.hp > 0 && unit.hp <= unit.maxHp * .26 && !isOutside(unit) && !unit.move && !unit.force)
  if (exposed.length < 2) return
  const nextFrame = now + decisionStep()
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  for (const enemy of opponents) {
    if (!enemy.hp) continue
    const ready = Math.max(now, enemyClock.sharedAt, enemy.actionAt, enemy.force ? enemy.force.since + enemy.force.duration : now)
    const reply = readyReply(battle, enemy, ready, nextFrame, position, true)
    if (!reply || reply.at === now && !beforeOpponent) continue
    const { at: castAt, caster } = reply
    for (const skill of enemy.actives) {
      const first = skill.steps[0]
      if (!first || first.selector.shape !== "L" || first.selector.units !== "e" || first.watch || first.zone ||
        first.selector.limit || first.selector.flags.length || first.selector.exclude || first.selector.anchor && first.selector.anchor !== "o") continue
      if (skill.aim.mode !== "point" && skill.aim.mode !== "direction") continue
      const windup = fixedSkillWindup(skill)
      const damage = first.operations.find(op => op.kind === "d" && !op.style && op.args.length === 1)
      if (!damage || windup === undefined) continue
      const delay = windup + first.delay
      if (delay < .34 || delay > .90 || castAt + delay >= now + COOLDOWN.shared + .06) continue
      const at = castAt + delay
      for (const target of exposed) {
        let aim = position(target, at)
        if (skill.aim.mode === "point" && edgeDistance(caster, aim) > skill.aim.range) aim = along(caster, direction(caster, aim), skill.aim.range - 1)
        if (skill.aim.insideOnly) aim = inside(aim, 0)
        if (skillCastProblem(battle, caster, skill, aim, undefined, castAt)) continue
        const area = previewSkillAreas(battle, caster, skill, aim)[0]
        if (!area) continue
        const cast = { ...forecastSkillCast(caster, skill, target), aim, issuedAt: castAt }
        const contact: AnnouncedStrike = { at, source: caster, strike: { cast, power: damage.args[0], area, step: first, needsOwner: true } }
        const threatened = exposed.filter(unit => {
          const aid = aidBeforeHit(battle, unit, at, position)
          return announcedHit(battle, contact, unit, position(unit, at), position, aid.hp, aid.shield, 0, undefined, aid.defy)?.lethal
        })
        if (threatened.length < 2) continue
        const escape = threatened.some(unit => !moveProblem(battle, unit) && dodgeAreaDamage(battle, unit, contact))
        if (escape) return { enemy, castAt, at }
      }
    }
  }
}

export function sidestepBeforeEdgeLine(battle: EdgeBattle, team: EdgeFighter[], opponents: EdgeFighter[], beforeOpponent: boolean) {
  if (!battle.sparring || team.length < 2) return
  const now = battle.time
  const nextFrame = now + decisionStep()
  const opponent = sideOf(battle, team[0].id) === "ally" ? battle.sparring : battle
  if (opponent.sharedAt > nextFrame + 1e-6) return
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const replies = opponents.flatMap(enemy => {
    if (!enemy.hp || enemy.force || isOutside(enemy)) return []
    const reply = readyReply(battle, enemy, Math.max(now, opponent.sharedAt, enemy.actionAt), nextFrame, position, true)
    return reply && (reply.at > now || beforeOpponent) ? [reply] : []
  })
  if (!replies.length) return
  let best: { actor: EdgeFighter; point: EdgePoint; value: number } | undefined
  for (const actor of team) {
    if (actor.move || moveProblem(battle, actor) || isOutside(actor) || borderGap(actor) > 150) continue
    const companions = team.filter(ally => ally !== actor && ally.hp && !isOutside(ally) && edgeDistance(actor, ally) <= 160)
    if (!companions.length) continue
    const neededAid = team.filter(ally => ally !== actor && ally.hp && !isOutside(ally) &&
      ally.hp < ally.maxHp * .48 && ally.actionAt < now + 4)
    const wardReach = neededAid.length ? actor.actives.reduce((range, aid) => ["ally", "other"].includes(aid.aim.mode) &&
      aid.steps.some(step => step.operations.some(op => op.kind === "b" || op.kind === "h")) ? Math.max(range, aid.aim.range) : range, 0) : 0
    const speed = movementSpeed(battle, actor)
    for (const { at: castAt, caster } of replies) {
      for (const skill of caster.actives) {
        const [step, push] = skill.steps
        const lead = fixedSkillWindup(skill)
        if (lead === undefined || !step || !push || step.selector.shape !== "L" || step.selector.units !== "e" ||
          push.selector.shape !== "L" || push.selector.units !== "e" || push.selector.order !== "farthest" ||
          push.selector.limit !== 1 || push.selector.anchor !== step.selector.anchor || push.selector.offset !== step.selector.offset ||
          push.selector.size.some((size, index) => size !== step.selector.size[index]) ||
          !push.operations.some(op => op.kind === "p") || Math.abs(step.delay - push.delay) >= SPARRING_STEP) continue
        const at = castAt + lead + step.delay
        if (at <= now + .25 || at >= now + COOLDOWN.shared + .025) continue
        const contact = position(actor, at)
        const line = (aim: EdgePoint) => {
          const location = fitReplyAim(caster, skill, aim)
          if (skillCastProblem(battle, caster, skill, location, undefined, castAt)) return
          const area = previewSkillAreas(battle, caster, skill, location)[0]
          const cast = { ...forecastSkillCast(caster, skill, actor), aim: location, issuedAt: castAt }
          const strike = fixedAreaStrike(cast, step, area, true)
          return strike && { at, source: caster, strike: { ...strike, limitedPush: push } }
        }
        const sites = companions.map(ally => position(ally, at))
        const lanes = [contact, ...sites, ...sites.map(other => ({ x: (contact.x + other.x) / 2, y: (contact.y + other.y) / 2 }))]
          .flatMap(aim => line(aim) ?? [])
        const ejection = (lane: AnnouncedStrike, forecast: PositionAt) => {
          const shift = announcedShift(battle, lane, actor, forecast)
          if (shift && isOutside(shift.end)) return shift
        }
        const incoming = lanes.filter(lane => companions.some(ally => announcedHit(battle, lane, ally, position(ally, at), position)))
          .map(lane => ejection(lane, position)).find(shift => shift !== undefined)
        if (!incoming) continue
        const { end } = incoming
        const outTime = edgeDistance(end, inside(end, 0)) / (actor.speed * EXILE.speed)
        const benefit = 2.2 + Math.min(1.4, outTime * .67) + (actor.actionAt < now + 1.4 ? .72 : 0)
        const axis = direction(caster, contact)
        const reach = Math.min(MOVE_REACH, speed * (at - now - .035))
        const busy = announcedStrikes(battle, actor, now + .95, position)
        for (const turn of [-90, 90, -70, 70, -110, 110]) {
          const heading = rotate(axis, turn)
          const length = Math.min(MOVE_REACH, reach + speed * decisionStep() * .6)
          const point = inside(along(actor, heading, length), 19)
          const landing = moveLanding(actor, point, battle)
          if (!landing || dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
          const gap = edgeDistance(actor, landing)
          const arrival = now + gap / speed
          if (gap < 24 || availablePortalExit(battle, actor, landing, arrival) ||
            walksIntoWarning(battle, actor, landing, arrival) || walksIntoAnnouncedArea(battle, actor, landing, arrival) ||
            walksIntoShoreBeast(battle, actor, landing, arrival) || exposesToEdgePush(battle, actor, landing, arrival)) continue
          const path = walkForecast(battle, actor, { landing, stop: landing, arrival })
          if (!lifeThroughStrikes(battle, actor, busy, path).hp ||
            busy.some(threat => threat.at < arrival && announcedShift(battle, threat, actor, path))) continue
          // The enemy can retarget the move. Get out of the joint lane even
          // when it is aimed at the position reached before the cast.
          const revised = line(path(actor, castAt))
          const contacts = revised ? [...lanes, revised] : lanes
          if (contacts.some(lane => ejection(lane, path) ||
            !lifeThroughStrikes(battle, actor, [...busy, lane].sort((a, b) => a.at - b.at), path).hp)) continue
          const support = neededAid.some(ally => edgeDistance(path(ally, arrival), landing) <= wardReach - 8) ? .20 : 0
          const value = benefit + support + (borderGap(landing) - borderGap(actor)) / 160 - gap / 620
          if (!best || value > best.value) best = { actor, point, value }
        }
      }
    }
  }
  return best
}

export function walksIntoAnnouncedArea(battle: EdgeBattle, actor: EdgeUnit, landing: EdgePoint, arrival: number, exit?: EdgePoint,
  start = battle.time, shieldWeight = .45) {
  const armed = battle.runtime.fields.some(field => field.mode === "enter" && !field.seen.has(actor.id) &&
    !sameSide(battle, actor.id, field.cast.owner))
  if (!armed && !battle.runtime.pending.some(({ strike }) => strike && "area" in strike && !sameSide(battle, actor.id, strike.cast.owner))) return false
  const now = battle.time
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const walk = (unit: EdgeUnit, at: number) => unit === actor && at >= start
    ? walkAt(actor, landing, start, arrival, at, exit) : position(unit, at)
  const until = Math.max(arrival, start + COOLDOWN.shared)
  const areas = announcedStrikes(battle, actor, until, walk)
    .filter(({ strike, at }) => "area" in strike && at > now + SPARRING_STEP &&
      skillAreaContains(strike.cast, strike.step?.selector.shape, strike.area, walk(actor, at)))
  const entries = armed ? entryFieldContacts(battle, actor, until, walk) : []
  if (!areas.length && !entries.length) return false
  const alongside = (fieldHits: AnnouncedStrike[]) => fieldHits.length ? [...areas, ...fieldHits].sort((a, b) => a.at - b.at) : areas
  const contacts = alongside(entries)
  const moved = lifeThroughStrikes(battle, actor, contacts, walk, [], undefined, entries.length ? until : undefined)
  if (!moved.hp) return true
  const still = entries.length ? alongside(entryFieldContacts(battle, actor, until, position)) : areas
  const base = lifeThroughStrikes(battle, actor, still, position, [], undefined, entries.length ? until : undefined)
  if (base.hp - moved.hp > actor.maxHp * .12 || entries.length &&
    base.hp - moved.hp + shieldWeight * (base.shield - moved.shield) > actor.maxHp * .09) return true
  return contacts.some(contact => {
    const shift = announcedShift(battle, contact, actor, walk)
    if (!shift) return false
    const before = entries.includes(contact) ? still.find(hit => hit.strike.cast === contact.strike.cast && hit.zone) : contact
    const prior = before && announcedShift(battle, before, actor, position)
    const ejected = isOutside(shift.end) && (!prior || !isOutside(prior.end))
    const interrupted = contact.at < arrival - .03 && (!prior || moved.hp <= base.hp)
    return ejected || interrupted
  })
}

export function walksIntoReadyFinish(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeFighter[], path: AdvancePath) {
  if (actor.hp > actor.maxHp * .4) return false
  const now = battle.time
  const ready = Math.max(actor.actionAt, path.arrival, now + COOLDOWN.shared)
  const frame = decisionStep()
  const until = Math.min(now + COOLDOWN.move, now + Math.ceil((ready - now) / frame - 1e-6) * frame)
  const walk = walkForecast(battle, actor, path)
  const pending = announcedStrikes(battle, actor, until, walk)
  const standing = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const exposed = lifeThroughStrikes(battle, actor, pending, walk)
  const staying = lifeThroughStrikes(battle, actor, pending, standing).hp
  if (staying > 0 && !exposed.hp) return true
  // A player can wait for the boss to enter range, then aim at that position.
  const falls = (reply: AnnouncedStrike[], position: PositionAt) =>
    !lifeThroughStrikes(battle, actor, [...pending, ...reply].sort((a, b) => a.at - b.at), position).hp
  const locked = (position: PositionAt) => targetedFollowUps(battle, actor, enemies, now, until, position)
    .some(reply => falls(reply.contacts, reply.position))
  if (locked(walk) && !locked(standing)) return true
  if (walkExposesToPushFinish(battle, actor, enemies, walk, standing, until)) return true
  // A long line may land after the basic becomes ready. The boss still
  // cannot change course until its movement cooldown ends.
  const areaUntil = now + COOLDOWN.move
  const areaThreats = (position: PositionAt) => {
    const threats = new Map<string, AnnouncedStrike>()
    for (const fraction of [0, .35, .65]) {
      const after = now + (until - now) * fraction
      for (const contact of shortAreaThreats(battle, actor, enemies, areaUntil, position, after, undefined, true)) {
        if (contact.at > until + SPARRING_STEP && contact.strike.step?.selector.shape !== "L") continue
        const id = contact.strike.cast.skill?.id
        if (!id || !falls([contact], position)) continue
        const key = contact.source.id + "/" + id
        if (contact.at < (threats.get(key)?.at ?? Infinity)) threats.set(key, contact)
      }
    }
    return threats
  }
  const approachThreats = areaThreats(walk)
  if (!approachThreats.size) return false
  const standingThreats = areaThreats(standing)
  return [...approachThreats].some(([threat, contact]) => {
    const original = standingThreats.get(threat)
    if (!original || contact.at + SPARRING_STEP < original.at) return true
    const castAt = original.strike.cast.issuedAt
    if (castAt === undefined || actor.move) return false
    // Standing in range can be safe if the boss keeps its movement ready
    // until the enemy fixes an aim. Approaching spends that escape.
    const replyAt = now + Math.ceil((castAt - now + SPARRING_STEP) / frame - 1e-6) * frame
    return !!dodgeAreaDamage(battle, actor, original, replyAt)
  })
}

export function hasLineCounterToCharge(battle: EdgeBattle, boss: EdgeUnit, enemies: EdgeFighter[], release: number,
  path?: AdvancePath) {
  if (boss.hp > boss.maxHp * .4) return false
  const position = path ? walkForecast(battle, boss, path)
    : (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
  const canStop = (castAt: number) => shortAreaThreats(battle, boss, enemies, release, position, castAt, undefined, true).some(contact =>
    contact.at + SPARRING_STEP < release && contact.strike.step?.selector.shape === "L" &&
    (contact.strike.step.operations.some(op => op.kind === "i") || fatalArea(battle, boss, contact, position)))
  return canStop(battle.time) || !!path && canStop(path.arrival)
}

export function warningEjection(battle: EdgeBattle, warning: AreaVisual, actor: EdgeUnit, at: EdgePoint) {
  if (isOutside(at)) return
  const end = previewWarningShove(battle, warning, actor, at, unit => future(battle, unit, warning.until - battle.time))
  return end && isOutside(end) ? end : undefined
}

export function dodgeEdgeShove(battle: EdgeBattle, actor: EdgeUnit) {
  const now = battle.time
  const hostile = battle.runtime.visuals.filter(warning => warning.phase === "warning" && warning.until > now + .07 &&
    (warning.shove || warning.effect === "damage") && !sameSide(battle, actor.id, warning.owner))
  const threats = hostile.flatMap(warning => {
    if (!warning.shove) return []
    const end = warningEjection(battle, warning, actor, future(battle, actor, warning.until - now))
    return end ? [{ warning, end }] : []
  }).sort((a, b) => a.warning.until - b.warning.until)
  const first = threats[0]
  if (!first) return
  const speed = movementSpeed(battle, actor)
  const reach = Math.min(MOVE_REACH, speed * (first.warning.until - now - .026))
  if (reach < 11) return
  const inward = direction(first.end, inside(first.end, 100))
  const directions = [inward, rotate(inward, -40), rotate(inward, 40), ...warningEscapeDirections(first.warning.area, actor)]
  let best: (AdvancePath & { point: EdgePoint; value: number }) | undefined
  for (const axis of directions) {
    const point = inside(along(actor, axis, reach), 14)
    const landing = moveLanding(actor, point, battle)
    if (!landing || dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
    const distance = edgeDistance(actor, landing)
    if (distance < 10 || distance > reach + 1) continue
    const arrival = now + distance / speed
    const exit = availablePortalExit(battle, actor, landing, arrival)
    if (exit && portalExitIsExposed(battle, actor, exit, arrival) || walksIntoShoreBeast(battle, actor, landing, arrival, exit)) continue
    const after = (warning: AreaVisual) => walkAt(actor, landing, now, arrival, warning.until, exit)
    if (hostile.some(warning => warningEjection(battle, warning, actor, after(warning)))) continue
    const damage = hostile.reduce((sum, warning) => {
      const at = after(warning)
      return sum + (warning.effect === "damage" && areaHits(warning.area, at) ? warningDamage(battle, warning, actor, at) : 0)
    }, 0)
    const health = actor.hp + (actor.shieldUntil > first.warning.until ? actor.shield : 0)
    if (damage >= health || walksIntoWarning(battle, actor, landing, arrival, exit)) continue
    const drift = edgeDistance(first.end, inside(first.end, 0)) / (actor.speed * EXILE.speed)
    const loss = 1 - actor.hp / actor.maxHp
    const value = 1.05 + Math.min(2.4, drift) * .78 + loss * 1.25 +
      Math.min(.28, (borderGap(exit ?? landing) - borderGap(actor)) / 300) - damage / health
    if (!best || value > best.value) best = { point, value, landing, arrival, stop: exit ?? landing }
  }
  return best
}

export function canReturnFromShieldedShove(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[]) {
  if (!actor.shield) return false
  const now = battle.time
  const until = Math.min(actor.actionAt, now + COOLDOWN.move + COOLDOWN.shared)
  const holds = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const announced = announcedStrikes(battle, actor, until, holds)
  const ejection = announced.flatMap(contact => {
    const shift = announcedShift(battle, contact, actor, holds)
    return shift && isOutside(shift.end) ? [{ contact, shift }] : []
  })[0]
  if (!ejection) return false
  const { contact, shift } = ejection
  const throughShove = announced.filter(hit => hit.at <= contact.at)
  if (lifeThroughStrikes(battle, actor, throughShove, holds).hp < actor.hp) return false

  const frame = decisionStep()
  const recovery = (at: number, { end, duration }: typeof shift) => {
    const knocked = { ...actor, ...end, force: null, move: null }
    const landing = moveLanding(knocked, returnAroundShore(battle, knocked), battle)
    if (!landing || summonTerrainInPath(battle, knocked, landing)) return
    const starts = now + Math.ceil((at + duration + SPARRING_STEP - now) / frame - 1e-6) * frame
    const route = returnWalk(battle, knocked, landing)
    const arrives = route.arrival + starts - now
    if (arrives + SPARRING_STEP >= until || crossesHostileGate(battle, knocked, landing, starts, arrives) ||
      availablePortalExit(battle, knocked, landing, arrives) || walksIntoShoreBeast(battle, knocked, landing, arrives, undefined, starts)) return
    return { starts, route, arrives }
  }
  const firstReturn = recovery(contact.at, shift)
  if (!firstReturn) return false
  const { starts, route, arrives } = firstReturn
  const motion = { ...shift, from: holds(actor, contact.at), start: contact.at }
  const returning = (unit: EdgeUnit, at: number) => unit !== actor || at <= contact.at ? holds(unit, at)
    : at <= starts ? displacementPoint(motion, at) : route.at(at - starts + now)
  const incoming = announcedStrikes(battle, actor, arrives, returning)
  const survives = (hits: AnnouncedStrike[], position: PositionAt) =>
    lifeThroughStrikes(battle, actor, [...incoming, ...hits].sort((a, b) => a.at - b.at), position).hp > 0
  if (!survives([], returning) || incoming.some(hit => hit.at > contact.at && announcedShift(battle, hit, actor, returning))) return false

  const keepsAction = (hits: AnnouncedStrike[], position: PositionAt) => {
    if (!survives(hits, position)) return false
    // A later shove can cancel the return and spend the next action window.
    return hits.every(hit => {
      const next = announcedShift(battle, hit, actor, position)
      if (!next) return true
      return isOutside(next.end) ? !!recovery(hit.at, next) : hit.at + next.duration + SPARRING_STEP < until
    })
  }
  const after = contact.at + SPARRING_STEP
  const replies = readyAdvanceReplies(battle, actor, enemies, arrives, returning, after)
  return replies.every(reply => keepsAction([reply], returning)) &&
    targetedFollowUps(battle, actor, enemies, after, arrives, returning).every(reply => keepsAction(reply.contacts, reply.position))
}

export function spreadFromEdgePush(battle: EdgeBattle, team: EdgeFighter[], enemies: EdgeFighter[],
  canMove: (unit: EdgeFighter) => boolean, coverLoss: (unit: EdgeFighter, at: EdgePoint, arrival: number) => number) {
  if (!battle.sparring || team.length < 2) return
  const now = battle.time
  const opponent = sideOf(battle, team[0].id) === "ally" ? battle.sparring : battle
  if (opponent.sharedAt > now + 1.25) return
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const nearEdge = team.filter(unit => !isOutside(unit) && borderGap(unit) <= 185)
  const group = nearEdge.filter(unit => nearEdge.some(ally => ally !== unit && edgeDistance(unit, ally) <= 290))
  if (group.length < 2) return
  const movers = group.filter(canMove)
  if (!movers.length) return
  const ejectionValue = (unit: EdgeUnit, end: EdgePoint, impact: number) => {
    const returnTime = edgeDistance(end, inside(end, 0)) / (unit.speed * EXILE.speed)
    const ready = unit.actionAt <= impact + returnTime + .4
    const life = unit.hp + (unit.shieldUntil > impact ? unit.shield : 0)
    return .63 + Math.min(2.1, returnTime) * .56 + Math.max(0, 1 - life / unit.maxHp) * .72 + (ready ? .29 : 0)
  }
  let best: { actor: EdgeFighter; point: EdgePoint; value: number } | undefined
  for (const enemy of enemies) {
    const forceUntil = enemy.force ? enemy.force.since + enemy.force.duration : 0
    const readyAt = Math.max(now + .12, opponent.sharedAt, enemy.actionAt, forceUntil)
    if (readyAt > now + 1.25) continue
    const from = position(enemy, readyAt)
    if (isOutside(from)) continue
    const positions = group.map(unit => position(unit, readyAt))
    const aims = positions.slice()
    for (const [i, at] of positions.entries()) for (const other of positions.slice(i + 1)) {
      aims.push({ x: (at.x + other.x) / 2, y: (at.y + other.y) / 2 })
    }
    for (const skill of enemy.actives) {
      const reach = areaEjectionReach(skill)
      if (!reach || positions.filter(at => edgeDistance(from, at) <= reach).length < 2) continue
      const threats = aims.map(at => previewAreaEjections(battle, enemy, skill, at, readyAt, position))
      const biggest = Math.max(...threats.map(exits => exits.length))
      if (biggest < 2) continue
      const affected = new Set(threats.filter(exits => exits.length === biggest).flatMap(exits => exits.map(exit => exit.unit)))
      // The opponent may wait one decision tick and aim at the path, as well as either end.
      const laterAt = readyAt + AI_THINK_INTERVAL + SPARRING_STEP
      const laterPositions = group.map(unit => position(unit, laterAt))
      for (const actor of movers) {
        if (!affected.has(actor)) continue
        const original = Math.max(...threats.flatMap(exits => exits.filter(exit => exit.unit === actor)
          .map(exit => ejectionValue(actor, exit.end, exit.impact))))
        const speed = movementSpeed(battle, actor)
        const reach = Math.min(MOVE_REACH, speed * (readyAt - now + .48))
        const inward = direction(actor, inside(actor, 220))
        for (const axis of [inward, rotate(inward, -48), rotate(inward, 48), rotate(inward, -84), rotate(inward, 84)]) {
          const point = inside(along(actor, axis, reach), 22)
          const landing = moveLanding(actor, point, battle)
          if (!landing || dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
          const distance = edgeDistance(actor, landing)
          if (distance < 22) continue
          const arrival = now + distance / speed
          const exit = availablePortalExit(battle, actor, landing, arrival)
          if (exit || walksIntoWarning(battle, actor, landing, arrival, undefined, now, true) ||
            walksIntoShoreBeast(battle, actor, landing, arrival) || exposesToEdgePush(battle, actor, landing, arrival)) continue
          const forecast = (unit: EdgeUnit, time: number) => unit === actor ? walkAt(actor, landing, now, arrival, time) : position(unit, time)
          const replies = (time: number, sites: EdgePoint[]) => {
            const newAt = forecast(actor, time)
            const targets = [newAt, ...sites.map(at => ({ x: (at.x + newAt.x) / 2, y: (at.y + newAt.y) / 2 }))]
            return targets.map(at => previewAreaEjections(battle, enemy, skill, at, time, forecast))
          }
          const immediate = [...aims.map(at => previewAreaEjections(battle, enemy, skill, at, readyAt, forecast)), ...replies(readyAt, positions)]
          if (immediate.some(exits => exits.length >= biggest || exits.some(exit => exit.unit === actor))) continue
          const delayed = replies(laterAt, laterPositions)
          if (delayed.some(exits => exits.length >= biggest || exits.some(exit => exit.unit === actor))) continue
          const remaining = Math.max(...immediate.map(exits => exits.length), ...delayed.map(exits => exits.length))
          const guarded = coverLoss(actor, landing, arrival)
          const exposure = approachExposure(battle, actor, landing, arrival) / MOVE_REACH
          const value = .47 + original + (biggest - remaining) * .27 - guarded - exposure - distance / 760
          if (value > (best?.value ?? .55)) best = { actor, point, value }
        }
      }
    }
  }
  return best
}

export function defensiveThreat(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeUnit[],
  arrival = battle.time, until = battle.time + COOLDOWN.move) {
  if (!battle.sparring || !actor.hp || actor.hp > actor.maxHp * .25) return
  const sharedAt = sideOf(battle, actor.id) === "ally" ? battle.sparring.sharedAt : battle.sharedAt
  let threat: { castAt: number; hitAt: number; damage: number; displaces: boolean; line: boolean } | undefined
  for (const enemy of enemies) {
    if (!isFighter(enemy) || enemy.force) continue
    const castAt = Math.max(arrival, sharedAt, enemy.actionAt)
    if (castAt + .4 >= until || threat && castAt > threat.castAt) continue
    const from = future(battle, enemy, castAt - battle.time)
    if (isOutside(from)) continue
    const caster = { ...enemy, ...from }
    const scale = caster.attack * roleDamageScale(battle, caster, actor) * (1 - actor.armor)
    for (const skill of caster.actives) {
      const windup = fixedSkillWindup(skill)
      const first = skill.steps[0]
      const damage = first?.operations.find(op => op.kind === "d")?.args[0]
      if (windup === undefined || !damage || !first.selector.shape || first.watch ||
        first.zone && first.zone.event !== "closing") continue
      const delay = windup + first.delay
      const hitAt = castAt + delay
      if (delay < .4 || hitAt >= until || threat && castAt === threat.castAt && hitAt >= threat.hitAt) continue
      const shield = actor.shieldUntil > hitAt ? actor.shield : 0
      const ward = battle.runtime.fields.some(field => field.mode === "guard" && field.until > hitAt &&
        field.capacity + actor.hp + shield > damage * scale && sameSide(battle, actor.id, field.cast.owner) && areaHits(field.area, actor))
      if (ward || damage * scale < actor.hp + shield) continue
      const aimPoint = skill.aim.mode === "point" && edgeDistance(from, actor) > skill.aim.range
        ? along(from, direction(from, actor), skill.aim.range - 1) : actor
      const aim = skill.aim.insideOnly ? inside(aimPoint, 0) : aimPoint
      if (skillCastProblem(battle, caster, skill, aim)) continue
      let canHit
      if (first.zone?.event === "closing") {
        const [length, width, gap] = first.selector.size
        const axis = direction(from, aim)
        canHit = areaHits(areaOf("L", along(aim, axis, -length / 2), axis, length, width + gap), actor)
      } else {
        const aims = [aim]
        // Two-circle skills can reach farther when the caster places a lobe on the target.
        if (first.selector.shape === "J") {
          const distance = edgeDistance(from, actor)
          const offset = first.selector.size[1] / 2
          if (distance > offset) for (const sign of [-1, 1]) {
            const axis = rotate(direction(from, actor), sign * Math.asin(offset / distance) * 180 / Math.PI)
            const depth = Math.min(Math.sqrt(distance ** 2 - offset ** 2), skill.aim.range - 1)
            const alternative = along(from, axis, depth)
            aims.push(skill.aim.insideOnly ? inside(alternative, 0) : alternative)
          }
        }
        canHit = aims.some(point => {
          if (skillCastProblem(battle, caster, skill, point)) return false
          const areas = previewSkillAreas(battle, caster, skill, point)
          if (first.selector.shape !== "L") return areas.some(area => areaHits(area, actor))
          return !!areas[0] && skillAreaContains({ skill }, "L", areas[0], actor)
        })
      }
      if (canHit) threat = { castAt, hitAt, damage: damage * scale, line: first.selector.shape === "L", displaces: first.operations.some(op =>
        (op.kind === "p" || op.kind === "l") && op.args[0] >= 70) }
    }
  }
  return threat
}

export function shortAreaThreats(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeUnit[], until: number,
  position: PositionAt, after = battle.time, aimsAlongside?: EdgeUnit[],
  retarget: boolean | "entry" | "short-windup" | "after-displacement" | "circle-group" = false) {
  const now = battle.time
  const shortWindup = retarget === "short-windup"
  const entryForecast = retarget === "entry"
  const circleGroup = retarget === "circle-group"
  const minimum = shortWindup || entryForecast ? SPARRING_STEP : retarget ? .20 : .36
  const threats: AnnouncedStrike[] = []
  const shared = sideOf(battle, actor.id) === "ally" ? battle.sparring?.sharedAt ?? battle.sharedAt : battle.sharedAt
  for (const enemy of enemies) {
    if (!isFighter(enemy) || !enemy.hp || enemy.force && retarget !== "after-displacement") continue
    const standingAt = enemy.force ? enemy.force.since + enemy.force.duration + SPARRING_STEP : now
    const ready = Math.max(after, now, shared, enemy.actionAt, standingAt)
    const reply = shortWindup || entryForecast ? pressureReply(battle, enemy, ready, until - minimum, position)
      : retarget && !battle.sparring && enemy.move && ready < until - minimum
        ? { at: ready, caster: { ...enemy, ...position(enemy, ready) } }
        : readyReply(battle, enemy, ready, until - minimum, position, !!retarget)
    if (!reply) continue
    const { at: issuedAt, caster } = reply
    if (isOutside(caster)) continue
    for (const skill of enemy.actives) {
      const first = skill.steps[0]
      const entry = entryForecast && entryDamageStep(skill)
      const shape = firstDamageShape(skill, entry)
      if (!shape || aimsAlongside && shape !== (circleGroup ? "C" : "L") || !["point", "direction"].includes(skill.aim.mode)) continue
      const flight = !!retarget && !shortWindup && fixedAreaFlight(skill)
      const bard = shortWindup && bardChoreography(skill.id)
      const instantEntry = entry && skill.id.startsWith("ranger/") && !first.delay
      const windup = fixedSkillWindup(skill) ?? (flight ? flightTime(caster, position(actor, issuedAt + .52)) :
        bard && bard.delivery === "none" ? bard.windup : instantEntry ? 0 : undefined)
      if (windup === undefined) continue
      const delay = windup + first.delay
      const at = issuedAt + (entry ? Math.max(delay, SPARRING_STEP) : delay)
      const window = until + (retarget && !battle.sparring ? SPARRING_STEP : 0)
      if ((!entry && delay < (flight ? .20 : shortWindup ? SPARRING_STEP : .36)) || delay > 1.05 || !flight && at > window) continue
      if (shortWindup && delay >= .36) continue
      const contact = position(actor, at)
      if (!targetable(battle, actor, at)) continue
      const axis = direction(caster, contact)
      const range = skill.aim.mode === "point" ? skill.aim.range : Infinity
      const aimFor = (point: EdgePoint) => {
        const aimed = edgeDistance(caster, point) > range ? along(caster, direction(caster, point), range - .1) : point
        if (skill.aim.insideOnly) return inside(aimed, 0)
        if (!isOnBoard(aimed) && skill.aim.mode === "direction" && first.selector.shape === "L") {
          return along(caster, direction(caster, aimed), 24)
        }
        return aimed
      }
      const aims = [aimFor(first.selector.shape === "L" ? along(contact, axis, 12) : contact)]
      if (aimsAlongside) for (const ally of aimsAlongside) {
        const other = position(ally, at)
        const center = { x: (contact.x + other.x) / 2, y: (contact.y + other.y) / 2 }
        const grouped = circleGroup ? center
          : along(caster, direction(caster, center), Math.max(edgeDistance(caster, contact), edgeDistance(caster, other)) + 12)
        aims.push(aimFor(grouped))
      }
      if (first.selector.shape === "J") {
        const gap = edgeDistance(caster, contact)
        const offset = first.selector.size[1] / 2
        if (gap > offset) for (const turn of [-1, 1]) {
          const angle = Math.asin(offset / gap) * 180 / Math.PI
          aims.push(aimFor(along(caster, rotate(axis, turn * angle), Math.sqrt(gap ** 2 - offset ** 2))))
        }
      }
      for (const aim of aims) {
        if (!isOnBoard(aim) || skillCastProblem(battle, caster, skill, aim, undefined, issuedAt)) continue
        const area = previewSkillAreas(battle, caster, skill, aim)[0]
        if (!area) continue
        const impact = flight ? issuedAt + flightTime(caster, area.center) + first.delay : at
        if (impact > window || !skillAreaContains({ skill }, first.selector.shape, area, position(actor, impact))) continue
        const cast = { ...forecastSkillCast(caster, skill, actor), aim, issuedAt }
        const strike = fixedAreaStrike(cast, entry ? { ...first, zone: undefined } : first, area, !flight)
        const cut = retarget && skill.id === "assassin/Prismatic/A3" ? skill.steps[1] : undefined
        if (strike) threats.push({ source: caster, strike: cut ? { ...strike, limitedDamage: cut } : strike, at: impact, zone: entry })
      }
    }
  }
  return threats
}

function readyAdvanceReplies(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[], until: number, position: PositionAt,
  after?: number) {
  const strikes = shortAreaThreats(battle, actor, enemies, until, position, after, undefined, after !== undefined)
  const now = battle.time
  const shared = sideOf(battle, actor.id) === "ally" ? battle.sparring!.sharedAt : battle.sharedAt
  for (const enemy of enemies) {
    if (!enemy.hp || enemy.force) continue
    const reply = readyReply(battle, enemy, Math.max(after ?? now, shared, enemy.actionAt), until, position)
    if (!reply) continue
    const { at: ready, caster: source } = reply
    const target = position(actor, ready)
    const gap = edgeDistance(source, target)
    const at = ready + (enemy.range >= 200 ? flightTime(source, target) : 0)
    if (at <= until && gap <= attackRange(battle, source, actor, ready) && targetable(battle, actor, ready))
      strikes.push({ at, source, strike: { cast: forecastBasicCast(source, actor), power: 1, target: actor.id } })
  }
  return strikes
}

function fatalArea(battle: EdgeBattle, actor: EdgeUnit, threat: AnnouncedStrike, position: PositionAt) {
  const aid = aidBeforeHit(battle, actor, threat.at, position)
  return announcedHit(battle, threat, actor, position(actor, threat.at), position, aid.hp, aid.shield, 0, undefined, aid.defy)?.lethal ?? false
}

function lethalAreaOnPath(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[], until: number,
  position: PositionAt) {
  let best = shortAreaThreats(battle, actor, enemies, until, position).filter(threat => fatalArea(battle, actor, threat, position))
    .reduce<AnnouncedStrike | undefined>((first, threat) => !first || threat.at < first.at ? threat : first, undefined)
  const horizon = best?.at ?? until
  const fieldCasters = enemies.filter(enemy => enemy.actives.some(entryDamageStep))
  const replies = [...shortAreaThreats(battle, actor, enemies, horizon, position, battle.time, undefined, "short-windup"),
    ...shortAreaThreats(battle, actor, fieldCasters, horizon, position, battle.time, undefined, "entry").filter(hit => hit.zone)]
  if (!replies.length) return best
  const contacts = announcedStrikes(battle, actor, best?.at ?? until, position)
  for (const threat of replies) {
    if (best && threat.at >= best.at) continue
    const before = contacts.filter(hit => hit.at <= threat.at)
    const lethal = before.length ? !lifeThroughStrikes(battle, actor, [...before, threat], position).hp
      : fatalArea(battle, actor, threat, position)
    if (lethal) best = threat
  }
  return best
}

export function sharedLineExposure(battle: EdgeBattle, actor: EdgeFighter, team: EdgeFighter[], enemies: EdgeUnit[],
  arrival: number, position: PositionAt) {
  if (!battle.sparring || actor.hp > actor.maxHp * .4) return 0
  const partners = team.filter(unit => unit !== actor && unit.hp > 0 && unit.hp <= unit.maxHp * .65 && !isOutside(unit))
  if (!partners.length) return 0
  const contacts = shortAreaThreats(battle, actor, enemies, battle.time + COOLDOWN.move, position, arrival, partners)
  // Compare the team cost of each legal enemy line after this move, since an
  // opponent only gets one of these shots before its next shared cooldown.
  let value = 0
  for (const contact of contacts) {
    if (!fatalArea(battle, actor, contact, position)) continue
    for (const ally of partners) {
      const after = lifeThroughStrikes(battle, ally, [contact], position).hp
      const loss = (ally.hp - after) / ally.maxHp
      if (loss >= .17) value = Math.max(value, loss + (after < ally.maxHp * .34 ? .55 : .15))
    }
  }
  return value
}

type CommittedReturn = NonNullable<ReturnType<typeof committedReturn>>

export function returnCounterRisk(battle: EdgeBattle, actor: EdgeUnit, enemy: EdgeFighter, route: CommittedReturn,
  foeShared: number, path: AdvancePath) {
  const now = battle.time
  const ready = Math.max(actor.actionAt, now + COOLDOWN.shared, path.arrival)
  const first = Math.max(now, route.arrival + SPARRING_STEP, foeShared, enemy.actionAt)
  const step = decisionStep()
  const start = now + Math.ceil((first - now) / step - 1e-6) * step
  const until = Math.min(now + COOLDOWN.move + .2, ready) - SPARRING_STEP
  if (start >= until || !targetable(battle, actor, start) || edgeDistance(path.stop, route.landing) > edgeDistance(actor, route.landing) - 32) return 0
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const advances = (unit: EdgeUnit, at: number) => unit === actor ? walkAt(actor, path.landing, now, path.arrival, at, path.stop) : stays(unit, at)
  const threat = (position: PositionAt) => {
    const strikes = shortAreaThreats(battle, actor, [enemy], until, position, start)
    const origin = { ...enemy, ...route.landing }
    const at = start + (enemy.range >= 200 ? flightTime(origin, position(actor, start)) : 0)
    if (at < until && targetable(battle, actor, at) && !battle.runtime.buffs.some(buff => buff.target === enemy.id &&
      buff.until > start && (buff.kind === "choose" || buff.kind === "ampq" || buff.kind === "q")) &&
      basicTarget(battle, origin, unit => Number(unit.id === actor.id), start, unit => position(unit, start)) === actor) {
      strikes.push({ at, source: enemy, strike: { cast: forecastBasicCast(origin, actor), power: 1, target: actor.id } })
    }
    return strikes.reduce((highest, strike) => {
      const aid = aidBeforeHit(battle, actor, strike.at, position)
      const hit = announcedHit(battle, strike, actor, position(actor, strike.at), position, aid.hp, aid.shield, 0, undefined, aid.defy)
      if (!hit) return highest
      const end = announcedShift(battle, strike, actor, position)?.end
      const loss = Math.max(0, hit.hpLoss - hit.saveHeal) / actor.maxHp
      return Math.max(highest, hit.lethal ? 1.4 : loss + (end && isOutside(end) ? .4 : 0))
    }, 0)
  }
  const increased = threat(advances) - threat(stays)
  // Compare actual retaliation before this card can respond. A possible strike
  // already in reach at the old position rarely justifies cancelling a walk.
  return increased >= .075 ? Math.min(265, 45 + 600 * increased) : 0
}

export function walksIntoLethalReach(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeUnit[], path: AdvancePath, start = battle.time) {
  if (!isFighter(actor) || actor.hp > actor.maxHp * .56 || !enemies.length) return false
  const now = battle.time
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const position = (unit: EdgeUnit, at: number) => unit.id === actor.id && at >= start
    ? walkAt(actor, path.landing, start, path.arrival, at, path.stop) : stays(unit, at)
  const ready = Math.max(actor.actionAt, start + COOLDOWN.shared, path.arrival)
  const until = Math.min(ready + .08, start + COOLDOWN.move)
  if (shortAreaThreats(battle, actor, enemies, until, position).some(threat =>
    fatalArea(battle, actor, threat, position) && !fatalArea(battle, actor, threat, stays))) return true
  if (actor.hp <= actor.maxHp * .35 && lateCircleFinish(battle, actor, enemies, position, start, until)) return true
  return actor.hp <= actor.maxHp * .4 && walkExposesToPushFinish(battle, actor, enemies.filter(isFighter), position, stays, until)
}

function lateCircleFinish(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeUnit[], position: PositionAt, start: number,
  checkedThrough: number) {
  const unlock = start + COOLDOWN.move
  const casters = enemies.filter(enemy => isFighter(enemy) && enemy.actionAt < unlock &&
    enemy.actives.some(skill => firstDamageShape(skill) === "C"))
  if (!casters.length) return false
  const after = Math.max(start, checkedThrough - 1.05)
  const replies = shortAreaThreats(battle, actor, casters, unlock + .65, position, after, undefined, "circle-group")
  return replies.some(reply => {
    const castAt = reply.strike.cast.issuedAt!
    if (castAt >= unlock || reply.at <= checkedThrough || !fatalArea(battle, actor, reply, position)) return false
    const source = casters.find(enemy => enemy.id === reply.source.id)!
    const incoming = announcedStrikes(battle, source, castAt, position)
    if (incoming.length && !lifeThroughStrikes(battle, source, incoming, position).hp) return false
    // The next move can be ready before impact while the fighter still
    // cannot walk far enough from its settled position to clear the area.
    const reaction = unlock + SPARRING_STEP
    const atUnlock = { ...actor, ...position(actor, reaction), move: null, force: null }
    return reaction >= reply.at || !dodgeAreaDamage(battle, atUnlock, reply, reaction)
  })
}

export function leaveLethalAreaReach(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[]) {
  if (!battle.sparring || !enemies.length || actor.hp > actor.maxHp * .24 ||
    actor.move || actor.force || isOutside(actor) || moveProblem(battle, actor)) return
  const now = battle.time
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const until = now + COOLDOWN.move
  const danger = lethalAreaOnPath(battle, actor, enemies, until, stays)
  if (!danger) return
  const speed = movementSpeed(battle, actor)
  const incoming = announcedStrikes(battle, actor, until, stays)
  const closest = enemies.reduce((nearest, unit) => edgeDistance(actor, unit) < edgeDistance(actor, nearest) ? unit : nearest)
  const away = direction(danger.strike.cast.from, actor)
  let best: { point: EdgePoint; value: number } | undefined
  const directions = [0, -30, 30, -60, 60, -90, 90].map(turn => rotate(away, turn))
  if (borderGap(actor) < 100) {
    const inward = rotate(outward(actor), 180)
    directions.push(...[0, -62, 62, -83, 83].map(turn => rotate(inward, turn)))
  }
  for (const axis of directions) {
    const point = inside(along(actor, axis, MOVE_REACH), 26)
    if (dancerMovesBySkill(battle, actor, point)) continue
    const landing = moveLanding(actor, point, battle)
    if (!landing || edgeDistance(actor, landing) < 42 || summonTerrainInPath(battle, actor, landing)) continue
    const travel = edgeDistance(actor, landing) / speed
    const arrival = now + travel
    if (availablePortalExit(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, now, true) ||
      walksIntoAnnouncedArea(battle, actor, landing, arrival) ||
      walksIntoShoreBeast(battle, actor, landing, arrival)) continue
    const position = (unit: EdgeUnit, at: number) => unit === actor ? walkAt(actor, landing, now, arrival, at) : stays(unit, at)
    if (!lifeThroughStrikes(battle, actor, incoming, position).hp || incoming.some(contact => announcedShift(battle, contact, actor, position))) continue
    const crossesTrap = battle.runtime.fields.some(field => field.mode === "cross" && field.until > now &&
      !sameSide(battle, field.cast.owner, actor.id) && !field.seen.has(actor.id) &&
      !areaHits(field.area, actor) && firstCrossing(field.area, actor, landing))
    if (crossesTrap) continue
    // Re-aim from the projected enemy position. Sidestepping only helps once
    // the target leaves reach or the opponent has already fixed an aim.
    if (lethalAreaOnPath(battle, actor, enemies, until, position)) continue
    const value = 4.2 + Math.min(.6, (edgeDistance(landing, closest) - edgeDistance(actor, closest)) / 200) -
      .28 * (arrival - now) - Math.max(0, 46 - borderGap(landing)) / 95
    if (!best || value > best.value) best = { point, value }
  }
  return best && { ...best, downAt: danger.at }
}

function lockFinishers(enemies: EdgeFighter[], until: number) {
  return enemies.filter(enemy => enemy.hp && enemy.actionAt < until && enemy.actives.some(skill =>
    spellbreakerLockAttack(skill) || assassinLockAttack(skill) || binderLockAttack(skill) || skill.aim.mode === "outside"))
}

function lockedFinishAfterPush(battle: EdgeBattle, actor: EdgeUnit, opener: AnnouncedStrike, finishers: EdgeFighter[],
  pending: AnnouncedStrike[], position: PositionAt, until: number) {
  const castAt = opener.strike.cast.issuedAt!
  const next = Math.max(opener.at + SPARRING_STEP, castAt + COOLDOWN.shared)
  if (next >= until) return Infinity
  const before = pending.filter(contact => contact.at <= opener.at)
  const shift = positionAfterStrike(battle, actor, [...before, opener], position)
  if (shift?.last !== opener.at) return Infinity
  // A shove cancels the walk. Evaluate the later lock from the forced
  // position once the other enemy can spend the team's shared action.
  let downAt = Infinity
  for (const reply of targetedFollowUps(battle, actor, finishers.filter(enemy => enemy.id !== opener.source.id), next, until, shift.position)) {
    const contacts = [...pending.filter(contact => contact.at <= reply.contacts.at(-1)!.at), opener, ...reply.contacts]
      .sort((a, b) => a.at - b.at)
    const life = lifeThroughStrikes(battle, actor, contacts, reply.position)
    if (!life.hp && life.downAt > opener.at) downAt = Math.min(downAt, life.downAt)
  }
  return downAt
}

function walkExposesToPushFinish(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeFighter[],
  walking: PositionAt, staying: PositionAt, until: number) {
  if (enemies.length < 2) return false
  const finishers = lockFinishers(enemies, until)
  if (!finishers.length) return false
  const pushers = enemies.filter(enemy => enemy.hp && enemy.actionAt + COOLDOWN.shared < until && enemy.actives.some(skill =>
    skill.steps[0]?.selector.shape === "L" && skill.steps[0].operations.some(op => op.kind === "p")))
  if (!pushers.length) return false
  const now = battle.time
  const samples = battle.sparring ? [now, now + decisionStep()] : [0, .35, .65].map(fraction => now + (until - now) * fraction)
  const fatal = (position: PositionAt) => {
    const pending = announcedStrikes(battle, actor, until, position)
    return samples.some(after => {
      const lines = pushLineReplies(battle, actor, pushers, until, position, undefined, after)
      const aims = battle.sparring ? lines : lines.flatMap(line => sidePushAims(battle, line))
      return aims.some(line => Number.isFinite(lockedFinishAfterPush(battle, actor, line, finishers, pending, position, until)))
    })
  }
  return fatal(walking) && !fatal(staying)
}

export function leaveConcentratedFire(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeFighter[]) {
  if (!battle.sparring || enemies.length < 2 || actor.range < 200 || actor.hp > actor.maxHp * .52 || actor.move || actor.force ||
    isOutside(actor) || moveProblem(battle, actor)) return
  const partners = allies.filter(unit => unit !== actor && unit.hp && !isOutside(unit) && edgeDistance(actor, unit) < 120)
  if (!partners.length) return
  const now = battle.time
  const until = now + COOLDOWN.move
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const pending = announcedStrikes(battle, actor, until, stays)
  const finishers = lockFinishers(enemies, until)
  const incoming = (position: PositionAt) => {
    const firstUntil = now + 1.35
    const areas = shortAreaThreats(battle, actor, enemies, firstUntil, position, now, undefined, true)
    const pushLines = finishers.length ? pushLineReplies(battle, actor, enemies, firstUntil, position, partners).filter(push =>
      !areas.some(hit => hit.strike.cast.skill === push.strike.cast.skill && hit.source.id === push.source.id &&
        edgeDistance(hit.strike.cast.aim, push.strike.cast.aim) < .01)) : []
    const openers = [
      ...[...areas, ...pushLines]
        .map(hit => ({ hit, position, locked: false })),
      ...targetedFollowUps(battle, actor, enemies, now, firstUntil, position)
        .flatMap(reply => reply.contacts.length === 1 ? [{ hit: reply.contacts[0], position: reply.position, locked: true }] : []),
    ]
    let danger: { at: number; cost: number; opener: AnnouncedStrike; locked: boolean; pushed?: boolean } | undefined
    for (const { hit, position, locked } of openers) {
      if (locked && !announcedHit(battle, hit, actor, position(actor, hit.at), position)) continue
      const before = pending.filter(contact => contact.at <= hit.at)
      const opening = lifeThroughStrikes(battle, actor, [...before, hit], position)
      if (!opening.hp) {
        if (!danger || hit.at < danger.at) danger = { at: hit.at, cost: 1.6, opener: hit, locked }
        continue
      }
      const shift = announcedShift(battle, hit, actor, position)
      const pushed = shift && hit.strike.step?.selector.shape === "L" && finishers.length > 0
      const wardSpent = (locked || pushed) && actor.shieldUntil > hit.at ? Math.max(0, actor.shield - opening.shield) : 0
      if (opening.hp > actor.maxHp * .41 || actor.hp + wardSpent - opening.hp < actor.maxHp * .11) continue
      // Other cards must wait for the same team action clock. A second hit
      // that lands earlier than this opener is a separate decision.
      const next = Math.max(hit.at + SPARRING_STEP, hit.strike.cast.issuedAt! + COOLDOWN.shared)
      if (shift) {
        if (!pushed) continue
        const downAt = lockedFinishAfterPush(battle, actor, hit, finishers, pending, position, until)
        if (downAt < (danger?.at ?? Infinity)) danger = { at: downAt, cost: 1.4, opener: hit, locked, pushed: true }
        continue
      }
      const others = enemies.filter(enemy => enemy.id !== hit.source.id)
      const replies = shortAreaThreats(battle, actor, others, until, position, next, undefined, true)
      if (locked) replies.push(...shortAreaThreats(battle, actor, others, until, position, next, undefined, "short-windup"))
      for (const reply of replies) {
        const contacts = [...pending.filter(contact => contact.at <= reply.at), hit, reply].sort((a, b) => a.at - b.at)
        const life = lifeThroughStrikes(battle, actor, contacts, position)
        if (!life.hp && (!danger || reply.at < danger.at)) danger = { at: reply.at, cost: 1.4, opener: hit, locked }
      }
    }
    return danger
  }
  const standing = incoming(stays)
  if (!standing) return
  const nearest = enemies.reduce((a, b) => edgeDistance(actor, a) < edgeDistance(actor, b) ? a : b)
  const axis = direction(nearest, actor)
  const directions = [-115, -90, -65, 65, 90, 115, 0].map(turn => rotate(axis, turn))
  if (borderGap(actor) < 150) {
    const out = outward(actor)
    directions.push(rotate(out, -87), rotate(out, 87), rotate(out, 180))
  }
  const points = directions.map(heading => inside(along(actor, heading, MOVE_REACH), 24))
  if (standing.locked) {
    const away = direction(standing.opener.strike.cast.from, actor)
    for (const turn of [0, -22, 22]) {
      const heading = rotate(away, turn)
      points.push(inside(along(actor, heading, MOVE_REACH), 24), inside(along(actor, heading, MOVE_REACH * .82), 24))
    }
  }
  if (standing.pushed) {
    const away = direction(standing.opener.strike.cast.from, actor)
    const length = Math.min(MOVE_REACH, movementSpeed(battle, actor) * (standing.opener.at - now + .1))
    points.push(...[0, -22, 22, -42, 42].map(turn => inside(along(actor, rotate(away, turn), length), 24)))
  }
  let best: { point: EdgePoint; value: number; downAt: number } | undefined
  for (const point of points) {
    const landing = moveLanding(actor, point, battle)
    if (!landing || edgeDistance(actor, landing) < (standing.pushed ? 32 : 78) ||
      dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
    const arrival = now + edgeDistance(actor, landing) / movementSpeed(battle, { ...actor, move: landing })
    if (availablePortalExit(battle, actor, landing, arrival) || crossesHostileGate(battle, actor, landing, now, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, now, true, true) ||
      walksIntoAnnouncedArea(battle, actor, landing, arrival) || walksIntoShoreBeast(battle, actor, landing, arrival)) continue
    const path = walkForecast(battle, actor, { landing, arrival, stop: landing })
    if (!lifeThroughStrikes(battle, actor, pending, path).hp ||
      pending.some(contact => announcedShift(battle, contact, actor, path)) || incoming(path)) continue
    const ready = Math.max(actor.actionAt, now + COOLDOWN.shared, arrival + SPARRING_STEP)
    const reply = Math.max(0, ...enemies.map(enemy => reachableStrike(battle, actor, enemy, landing, ready)))
    const separation = Math.min(180, ...partners.map(unit => edgeDistance(landing, stays(unit, arrival))))
    // Keeping the shield for the next attack also covers replies the enemy
    // can set up after seeing the withdrawal.
    const avoidsOpening = (standing.locked || standing.pushed) && !announcedHit(battle, standing.opener, actor, path(actor, standing.opener.at), path)
    const value = 3.45 + standing.cost + (avoidsOpening ? .85 : 0) + Math.min(.48, .22 * reply) + separation / 500 -
      (arrival - now) * (standing.pushed ? .5 : .18) - Math.max(0, 34 - borderGap(landing)) / 105
    if (!best || value > best.value) best = { point, value, downAt: standing.at }
  }
  return best
}

export function escapeToGuard(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeFighter[]) {
  if (actor.hp > actor.maxHp * .25 || !enemies.length) return
  const speed = movementSpeed(battle, actor)
  const fields = battle.runtime.fields.filter(field => field.mode === "guard" && field.until > battle.time + COOLDOWN.shared &&
    field.capacity >= actor.maxHp * .25 && sameSide(battle, actor.id, field.cast.owner) && !areaHits(field.area, actor))
  let best: { point: EdgePoint; value: number } | undefined
  for (const field of fields) {
    const point = inside(field.area.center, 25)
    const landing = moveLanding(actor, point, battle)
    if (!landing || !areaHits(field.area, landing) || edgeDistance(actor, landing) < 24 ||
      dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
    const arrival = battle.time + edgeDistance(actor, landing) / speed
    if (field.until < arrival + .65 || availablePortalExit(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, battle.time, true) ||
      defensiveThreat(battle, { ...actor, ...landing }, enemies, arrival)) continue
    const value = 3.3 + Math.min(.65, field.capacity / actor.maxHp) - .34 * (arrival - battle.time)
    if (!best || value > best.value) best = { point, value }
  }
  if (best) return best
  const guard = allies.find(ally => ally.id !== actor.id && ally.hp && !isOutside(ally) &&
    combatHasRole(ally, "bulwark") && (ally.passiveAt[BULWARK_COVER.id] ?? 0) <= battle.time + .8)
  if (!guard) return
  const center = future(battle, guard, .7)
  if (edgeDistance(actor, center) <= BULWARK_COVER.range * .75) return
  const nearest = enemies.reduce((a, b) => edgeDistance(a, center) < edgeDistance(b, center) ? a : b)
  const point = inside(along(center, direction(nearest, center), 70), 25)
  const landing = moveLanding(actor, point, battle)
  if (!landing || edgeDistance(actor, landing) < 32 || edgeDistance(landing, center) > BULWARK_COVER.range - 12 ||
    dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) return
  const arrival = battle.time + edgeDistance(actor, landing) / speed
  if (availablePortalExit(battle, actor, landing, arrival) ||
    walksIntoWarning(battle, actor, landing, arrival, undefined, battle.time, true)) return
  const threat = defensiveThreat(battle, { ...actor, ...landing }, enemies, arrival)
  if (threat) {
    // A stationary escort can share one hit. With multiple attackers keep
    // the stricter retreat check, since an earlier hit could spend its cover.
    if (enemies.length !== 1 || !threat.line || guard.move || guard.force) return
    const until = battle.time + COOLDOWN.move
    const walk = walkForecast(battle, actor, { landing, stop: landing, arrival })
    const pending = announcedStrikes(battle, actor, until, walk)
    if (!lifeThroughStrikes(battle, actor, pending, walk).hp ||
      pending.some(contact => announcedShift(battle, contact, actor, walk)) ||
      lethalAreaOnPath(battle, actor, enemies, until, walk)) return
    // Don't walk into the escort's own line of fire just to share the hit.
    if (shortAreaThreats(battle, actor, enemies, until, walk).some(contact =>
      contact.strike.step?.selector.shape === "L" && announcedHit(battle, contact, guard, guard, walk)?.hit)) return
  }
  return { point, value: 3.4 - .32 * (arrival - battle.time) }
}

export function escapeToEntryWard(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[]) {
  if (!battle.sparring || !actor.hp || actor.hp > actor.maxHp * .25 || actor.force || actor.move || isOutside(actor)) return
  const fields = entryWardFields(battle, actor).filter(field => field.area.parts.some(part =>
    part.kind === "circle" && edgeDistance(actor, part.center) <= part.radius + MOVE_REACH))
  if (!fields.length) return
  const now = battle.time
  const until = now + COOLDOWN.move
  const foeShared = sideOf(battle, actor.id) === "ally" ? battle.sparring.sharedAt : battle.sharedAt
  const standing: PositionAt = (unit, at) => future(battle, unit, at - now)
  const basics = enemies.flatMap(enemy => {
    if (!enemy.hp || enemy.force || enemy.range < 200 || isOutside(enemy)) return []
    const reply = pressureReply(battle, enemy, Math.max(now, foeShared, enemy.actionAt), until, standing)
    return reply ? [reply] : []
  })
  const committedHits = (position: PositionAt) => [...announcedStrikes(battle, actor, until, position),
    ...entryFieldContacts(battle, actor, until, position)].sort((a, b) => a.at - b.at)
  const threats = (position: PositionAt, wards: ReturnType<typeof wardsAlongPath> = []) => {
    const incoming = committedHits(position)
    const life = lifeThroughStrikes(battle, actor, incoming, position, wards)
    if (!life.hp) return life.downAt
    let downAt = Infinity
    for (const { at: locks, caster } of basics) {
      if (!targetable(battle, actor, locks) ||
        basicTarget(battle, caster, unit => Number(unit === actor), locks, unit => position(unit, locks)) !== actor) continue
      const at = locks + flightTime(caster, position(actor, locks))
      if (at >= Math.min(until, downAt)) continue
      const reply = { at, source: caster, strike: { cast: forecastBasicCast(caster, actor), target: actor.id, power: 1 } }
      const prior = incoming.filter(hit => hit.at <= at)
      if (!lifeThroughStrikes(battle, actor, [...prior, reply], position, wards).hp) downAt = at
    }
    return downAt
  }
  const downAt = threats(standing, wardsAlongPath(battle, actor, until, standing, fields))
  if (!Number.isFinite(downAt)) return
  let best: { point: EdgePoint; value: number; downAt: number } | undefined
  const speed = movementSpeed(battle, actor)
  for (const field of fields) for (const part of field.area.parts) {
    if (part.kind !== "circle") continue
    const point = inside(part.center, 16)
    const landing = moveLanding(actor, point, battle)
    if (!landing || edgeDistance(actor, landing) < 20 || dancerMovesBySkill(battle, actor, point) ||
      summonTerrainInPath(battle, actor, landing) || walkTriggersLethalMark(battle, actor, point)) continue
    const arrival = now + edgeDistance(actor, landing) / speed
    if (availablePortalExit(battle, actor, landing, arrival) || crossesHostileGate(battle, actor, landing, now, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, now, true) ||
      walksIntoShoreBeast(battle, actor, landing, arrival) || exposesToEdgePush(battle, actor, landing, arrival)) continue
    const path = walkForecast(battle, actor, { landing, arrival, stop: landing })
    const wards = wardsAlongPath(battle, actor, downAt, path, fields)
    if (!wards.length || !areaHits(field.area, landing) || Number.isFinite(threats(path, wards))) continue
    const areas = shortAreaThreats(battle, actor, enemies, until, path, now, undefined, true)
    const pending = committedHits(path)
    if (areas.some(reply => !lifeThroughStrikes(battle, actor, [...pending.filter(hit => hit.at <= reply.at), reply], path, wards).hp) ||
      pending.some(hit => hit.at < arrival && announcedShift(battle, hit, actor, path))) continue
    const firstWard = Math.min(...wards.map(aid => aid.at))
    const value = 4.45 + Math.min(.45, (downAt - firstWard) * .65) -
      Math.max(0, 38 - borderGap(landing)) / 95
    if (value > (best?.value ?? 0)) best = { point, value, downAt }
  }
  return best
}

export function bulwarkEscort(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeFighter[]) {
  const now = battle.time
  const until = now + COOLDOWN.move
  const available = Math.max(now, actor.passiveAt[BULWARK_COVER.id] ?? 0)
  const formations = battle.runtime.fields.filter(field => field.cast.owner === actor.id && field.until > now &&
    field.step.selector.anchor === "s" && field.step.selector.shape === "C" && (field.mode === "hold" || field.mode === "cover"))
    .map(field => {
      const operation = field.mode === "hold" ? "res" : "guard"
      const share = (field.step.operations.find(op => op.kind === operation)?.args[0] ?? 0) / 100
      return { field, share }
    })
    .filter(formation => formation.share > 0)
  if (available >= until && !formations.length) return
  const opponentReady = sideOf(battle, actor.id) === "ally" ? battle.sparring!.sharedAt : battle.sharedAt
  const warnings = battle.runtime.visuals.filter(warning => warning.phase === "warning" && warning.effect === "damage" &&
    warning.until > now && warning.until < until && !sameSide(battle, actor.id, warning.owner))
  const hits: { ally: EdgeFighter; at: EdgePoint; time: number; radius: number; value: number; saves: boolean }[] = []
  for (const ally of allies) {
    if (ally === actor || !targetable(battle, ally)) continue
    const consider = (at: EdgePoint, time: number, damage: number, confirmed: boolean) => {
      if (isOutside(at) || edgeDistance(actor, at) > MOVE_REACH + BULWARK_COVER.range) return
      const shield = ally.shieldUntil > time ? ally.shield : 0
      const ward = battle.runtime.fields.reduce((total, field) => total + (field.mode === "guard" && field.until > time &&
        sameSide(battle, field.cast.owner, ally.id) && areaHits(field.area, at) ? field.capacity : 0), 0)
      const exposed = Math.max(0, damage - shield - ward)
      if (!exposed) return
      const selfShield = actor.shieldUntil > time ? actor.shield : 0
      const ready = time >= available && !allies.some(other => {
        if (other === actor || other === ally || !combatHasRole(other, "bulwark") || (other.passiveAt[BULWARK_COVER.id] ?? 0) > time) return false
        const position = future(battle, other, time - now)
        return !isOutside(position) && edgeDistance(position, at) <= BULWARK_COVER.range
      })
      const shared = ready ? exposed * BULWARK_COVER.share / 100 : 0
      const transfer = shared * (1 - actor.armor) < actor.hp + selfShield ? shared : 0
      const note = (radius: number, blocked: number) => {
        if (blocked <= 0) return
        const saves = confirmed && exposed >= ally.hp && exposed - blocked < ally.hp
        const urgency = 1 - ally.hp / ally.maxHp
        const value = blocked / ally.maxHp * (4 + 4 * urgency) * (confirmed ? 1 : .7) + (saves ? 4 : 0)
        hits.push({ ally, at, time, radius, value, saves })
      }
      note(BULWARK_COVER.range, transfer)
      for (const { field, share } of formations) {
        if (field.until <= time || field.mode === "cover" && field.seen.has(ally.id)) continue
        const blocked = Math.min(exposed, damage * share)
        note(field.step.selector.size[0], blocked + transfer * (exposed - blocked) / exposed)
      }
    }
    const announced = new Set<EdgeUnit["id"]>()
    for (const warning of warnings) {
      const at = future(battle, ally, warning.until - now)
      if (!areaHits(warning.area, at)) continue
      consider(at, warning.until, warningDamage(battle, warning, ally, at), true)
      announced.add(warning.owner)
    }
    for (const enemy of enemies) {
      if (announced.has(enemy.id)) continue
      const ready = Math.max(now + .22, opponentReady, enemy.actionAt, enemy.force ? enemy.force.since + enemy.force.duration : now)
      if (ready >= until - .15) continue
      const origin = future(battle, enemy, ready - now)
      const target = future(battle, ally, ready - now)
      if (isOutside(origin) || isOutside(target)) continue
      const scale = enemy.attack * roleDamageScale(battle, enemy, ally) * (1 - ally.armor)
      if (edgeDistance(origin, target) <= attackRange(battle, enemy, ally)) {
        const time = ready + (enemy.range >= 200 ? flightTime(origin, target) : 0)
        if (time < until) consider(future(battle, ally, time - now), time, scale, false)
      }
      if (!isFighter(enemy)) continue
      for (const skill of enemy.actives) {
        const lead = fixedSkillWindup(skill)
        const first = skill.steps[0]
        const power = first?.operations.find(op => op.kind === "d")?.args[0]
        if (lead === undefined || !power || first.zone || first.watch || first.selector.units !== "e") continue
        const time = ready + lead + first.delay
        if (time >= until) continue
        const at = future(battle, ally, time - now)
        const caster = { ...enemy, ...origin }
        const maxRange = skill.aim.range - 1
        const point = skill.aim.mode === "point" && edgeDistance(origin, at) > maxRange
          ? along(origin, direction(origin, at), maxRange) : at
        const aim = skill.aim.insideOnly ? inside(point, 0) : point
        if (skillCastProblem(battle, caster, skill, aim) || !previewSkillAreas(battle, caster, skill, aim).some(area => areaHits(area, at))) continue
        consider(at, time, scale * power, false)
      }
    }
  }
  if (!hits.length) return
  const cover = (landing: EdgePoint, arrival: number, exit?: EdgePoint, margin = 0) => {
    let best: typeof hits[number] | undefined
    for (const hit of hits) {
      const progress = clamp((hit.time - now) / Math.max(.001, arrival - now), 0, 1)
      const at = exit && hit.time >= arrival ? exit : along(actor, direction(actor, landing), edgeDistance(actor, landing) * progress)
      if (edgeDistance(at, hit.at) <= hit.radius - margin && (!best || hit.value > best.value)) best = hit
    }
    return best
  }
  const existing = cover(actor, now)
  const loss = (landing: EdgePoint, arrival: number, exit?: EdgePoint) =>
    (existing?.value ?? 0) - (cover(landing, arrival, exit)?.value ?? 0)
  const circleRisk = incomingCircleRisk(battle, actor, allies, enemies, opponentReady, true)
  let route: { point: EdgePoint; value: number; rescue?: EdgeFighter } | undefined
  for (const hit of hits) {
    if (edgeDistance(actor, hit.at) <= hit.radius || hit.value <= (existing?.value ?? 0)) continue
    const point = inside(along(hit.at, direction(hit.at, actor), hit.radius - 31), 23)
    const landing = moveLanding(actor, point, battle)
    if (!landing || dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
    const distance = edgeDistance(actor, landing)
    const arrival = now + distance / movementSpeed(battle, actor)
    if (distance < 7 || availablePortalExit(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, now, true) ||
      walksIntoShoreBeast(battle, actor, landing, arrival)) continue
    const guarded = cover(landing, arrival, undefined, 4)
    const addedExposure = guarded?.saves ? 0 : Math.max(0, circleRisk?.({ landing, arrival, stop: landing }) ?? 0)
    const value = (guarded?.value ?? 0) - (existing?.value ?? 0) - distance / 800 - addedExposure / 55
    if (value > (route?.value ?? .17)) route = { point, value, rescue: guarded?.saves ? guarded.ally : undefined }
  }
  return { route, loss }
}

export function followUpRisk(battle: EdgeBattle, actor: EdgeUnit, enemy: EdgeUnit, ready: number, horizon = 1.12,
  allowEarlyStep = false) {
  if (!isFighter(enemy) || isOutside(enemy) || enemy.force || enemy.move && !movementStopped(battle, enemy)) return 0
  let risk = 0
  for (const skill of enemy.actives) {
    const first = skill.steps[0]
    const lead = fixedSkillWindup(skill)
    if (lead === undefined || !first?.selector.shape || first.zone || first.watch) continue
    const delay = lead + first.delay
    if (delay < .37 || ready + delay > horizon) continue
    const power = first.operations.find(op => op.kind === "d")?.args[0]
    if (!power) continue
    const aimAt = (at: EdgePoint) => skill.aim.mode === "point" && edgeDistance(enemy, at) > skill.aim.range
      ? inside(along(enemy, direction(enemy, at), skill.aim.range - 1), 0) : at
    const at = aimAt(actor)
    if (skillCastProblem(battle, enemy, skill, at)) continue
    const area = previewSkillAreas(battle, enemy, skill, at)[0]
    if (!area || !areaHits(area, actor)) continue
    const shield = actor.shieldUntil > battle.time + ready + delay ? actor.shield : 0
    const damage = enemy.attack * power * roleDamageScale(battle, enemy, actor) * (1 - actor.armor)
    const loss = Math.max(0, damage - shield)
    if (actor.hp - loss > actor.maxHp * .35 || loss < actor.maxHp * .17) continue
    const speed = movementSpeed(battle, actor)
    const preparation = allowEarlyStep ? 0 : ready + .21
    const reach = Math.min(MOVE_REACH, speed * (ready + delay - preparation - (allowEarlyStep ? .08 : 0)))
    const directions = warningEscapeDirections(area, actor)
    if (allowEarlyStep) directions.push(direction(enemy, actor))
    const canEvade = directions.some(axis => {
      const landing = moveLanding(actor, inside(along(actor, axis, reach), 18), battle)
      if (!landing || summonTerrainInPath(battle, actor, landing)) return false
      const distance = edgeDistance(actor, landing)
      if (distance < 7 || distance > reach + 1 || areaHits(area, landing)) return false
      if (allowEarlyStep) {
        const prior = along(actor, axis, Math.min(distance, speed * ready))
        const aimedAgain = previewSkillAreas(battle, enemy, skill, aimAt(prior))[0]
        if (aimedAgain && areaHits(aimedAgain, landing)) return false
      }
      const arrival = battle.time + preparation + distance / speed
      const exit = availablePortalExit(battle, actor, landing, arrival)
      return !exit || !areaHits(area, exit) && !portalExitIsExposed(battle, actor, exit, arrival, battle.time + preparation)
    })
    if (canEvade) risk = Math.max(risk, loss / actor.hp)
  }
  return risk
}

export function leaveFiringLane(battle: EdgeBattle, actor: EdgeUnit, allies: EdgeUnit[], enemies: EdgeUnit[]) {
  if (actor.range < 200 || actor.hp > actor.maxHp * .5 || !battle.runtime.histories.get(actor.id)?.wounds.some(wound =>
    wound.time >= battle.time - 2.25 && wound.amount >= actor.maxHp * .25)) return
  const support = allies.filter(ally => ally.id !== actor.id && ally.hp && !isOutside(ally))
  const nearest = Math.min(...support.map(ally => edgeDistance(actor, ally)))
  if (nearest <= 235 || !support.length || !battle.sparring) return
  const allySide = sideOf(battle, actor.id) === "ally"
  const foeShared = allySide ? battle.sparring.sharedAt : battle.sharedAt
  const lane = enemies.flatMap(enemy => {
    if (!isFighter(enemy) || enemy.force || isOutside(enemy)) return []
    const ready = Math.max(0, foeShared - battle.time, enemy.actionAt - battle.time)
    if (ready > 1.65) return []
    return enemy.actives.flatMap(skill => {
      const step = skill.steps[0]
      const lead = fixedSkillWindup(skill)
      if (lead === undefined || step?.selector.shape !== "L" || step.zone || step.watch) return []
      const hit = step.operations.find(op => op.kind === "d")
      if (!hit) return []
      const after = ready + lead + step.delay
      if (after > 2.25) return []
      const origin = { ...enemy, ...future(battle, enemy, ready) }
      if (skillCastProblem(battle, origin, skill, actor) ||
        !previewSkillAreas(battle, origin, skill, actor).some(area => areaHits(area, actor))) return []
      const damage = enemy.attack * hit.args[0] * (1 - actor.armor)
      const shield = actor.shieldUntil > battle.time + after ? actor.shield : 0
      return damage >= actor.maxHp * .2 && actor.hp + shield - damage <= actor.maxHp * .18
        ? [{ origin, reach: step.selector.size[0], after, damage }] : []
    })
  }).sort((a, b) => a.after - b.after)[0]
  if (!lane) return
  const fallback = support.reduce((a, b) => edgeDistance(a, actor) < edgeDistance(b, actor) ? a : b)
  const away = direction(lane.origin, actor)
  const speed = movementSpeed(battle, actor)
  let best: { point: EdgePoint; value: number } | undefined
  for (const axis of [away, ...[35, -35, 65, -65].map(angle => rotate(away, angle)), direction(actor, fallback)]) {
    const request = inside(along(actor, axis, MOVE_REACH), 26)
    const landing = moveLanding(actor, request, battle)
    if (!landing || summonTerrainInPath(battle, actor, landing)) continue
    const travel = edgeDistance(actor, landing)
    if (travel < 36) continue
    const arrival = battle.time + travel / speed
    if (walksIntoWarning(battle, actor, landing, arrival, undefined, battle.time, true) ||
      availablePortalExit(battle, actor, landing, arrival)) continue
    const at = along(actor, direction(actor, landing), Math.min(travel, speed * lane.after))
    if (edgeDistance(lane.origin, at) <= lane.reach + 14) continue
    const join = nearest - Math.min(...support.map(ally => edgeDistance(landing, ally)))
    const value = 2.4 + lane.damage / actor.hp + Math.max(0, join) / 130
    if (!best || value > best.value) best = { point: request, value }
  }
  return best
}

export function walksIntoWarning(battle: EdgeBattle, actor: EdgeUnit, landing: EdgePoint, arrival: number, exit?: EdgePoint,
  start = battle.time, avoidLingering = false, skipAnnounced = false, skipClosing = false) {
  return battle.runtime.visuals.some(warning => {
    if (warning.phase !== "warning" || warning.until <= start || sameSide(battle, actor.id, warning.owner)) return false
    if (skipClosing && warning.closing) return false
    if (skipAnnounced && warning.strike && battle.runtime.pending.some(job => job.strike === warning.strike)) return false
    const at = walkAt(actor, landing, start, arrival, warning.until, exit)
    if (warning.shove && warningEjection(battle, warning, actor, at) &&
      (avoidLingering || exit && warning.until >= arrival || !warningEjection(battle, warning, actor, actor))) return true
    return warning.effect === "damage" && warningContains(warning, at) &&
      (avoidLingering || exit && warning.until >= arrival || !warningContains(warning, actor))
  })
}

interface ShoreThreat {
  body: SummonBody
  center: EdgePoint
  radius: number
  push: number
  ready: number
  until: number
  cooldown: number
}

export function shoreThreats(battle: EdgeBattle, actor: EdgeUnit): ShoreThreat[] {
  if (!battle.runtime.summons.length) return []
  return activeDeployments(battle).flatMap(({ group, deployment, plan }) => {
    if (deployment.kind !== "shoreBeast" || sameSide(battle, actor.id, group.owner)) return []
    const [body] = deployment.bodies
    if (!body.hp || plan.motion?.kind !== "leap") return []
    const [action] = plan.actions!
    const center = inside(group.aim)
    const lands = group.start + Math.max(.22, edgeDistance(body.origin, center) / plan.motion.speed)
    const ready = Math.max(battle.time, body.actionsAt[0], lands)
    const until = group.until - SUMMON_DISMISS_TIME
    if (ready >= until) return []
    return [{ body, center, radius: action.step.selector.size[0], push: action.step.operations[0].args[0], ready, until, cooldown: action.cooldown }]
  })
}

function shoreContact(battle: EdgeBattle, actor: EdgeUnit, landing: EdgePoint, threat: ShoreThreat, arrival: number,
  atDistance: (distance: number) => number, afterDistance: (time: number) => number, teleports = false) {
  const length = edgeDistance(actor, landing)
  if (length < .01) return
  const axis = direction(actor, landing)
  const dx = threat.center.x - actor.x, dy = threat.center.y - actor.y
  const forward = dx * axis.x + dy * axis.y
  const across = dx * axis.y - dy * axis.x
  const radius = threat.radius + 4
  if (Math.abs(across) >= radius) return
  const span = Math.sqrt(radius ** 2 - across ** 2)
  const entry = Math.max(0, forward - span)
  const exit = Math.min(length, forward + span)
  if (entry > exit) return
  const until = exit >= length - .01 ? arrival + (teleports ? 0 : COOLDOWN.move) : atDistance(exit)
  const first = Math.max(threat.ready, atDistance(entry))
  for (let hitAt = first; hitAt <= until && hitAt < threat.until; hitAt += threat.cooldown) {
    const contact = along(actor, axis, clamp(afterDistance(hitAt), entry, exit))
    const end = previewDirectedShove(battle, actor, contact, outward(contact), threat.push, hitAt)
    if (isOutside(end) && edgeDistance(end, contact) >= 3) return hitAt
  }
}

export function walksIntoShoreBeast(battle: EdgeBattle, actor: EdgeUnit, landing: EdgePoint, arrival: number,
  exit?: EdgePoint, start = battle.time) {
  const threats = shoreThreats(battle, actor)
  if (!threats.length || isOutside(actor)) return false
  const speed = edgeDistance(actor, landing) / Math.max(.001, arrival - start)
  return threats.some(threat => {
    if (shoreContact(battle, actor, landing, threat, arrival,
      distance => start + distance / speed, time => speed * (time - start), !!exit) !== undefined) return true
    if (!exit || edgeDistance(exit, threat.center) > threat.radius + 4) return false
    const hitAt = Math.max(threat.ready, arrival)
    return hitAt < threat.until && hitAt <= Math.max(start + COOLDOWN.move, arrival + .22) &&
      isOutside(previewDirectedShove(battle, actor, exit, outward(exit), threat.push, hitAt))
  })
}

export function returnAroundShore(battle: EdgeBattle, actor: EdgeUnit): EdgePoint {
  const direct = inside(actor, 55)
  const threats = shoreThreats(battle, actor)
  if (!threats.length) return direct
  const now = battle.time
  const lower = sideOf(battle, actor.id) === "ally"
  const opponents = lower ? battle.sparring?.rivals ?? [] : battle.team
  const clocks = lower ? battle.sparring : battle
  const moveAt = Math.max(now, clocks?.moveAt ?? 0, clocks?.sharedAt ?? 0)
  const pursuers = opponents.filter(enemy => enemy.hp && !isOutside(enemy)).map(enemy => {
    const ready = Math.max(now, clocks?.sharedAt ?? 0, enemy.actionAt, enemy.force ? enemy.force.since + enemy.force.duration : now)
    const walk = enemy.move || enemy.force || movementStopped(battle, enemy) ? 0 :
      Math.min(MOVE_REACH, movementSpeed(battle, enemy) * Math.max(0, ready - moveAt))
    return { ready, origin: future(battle, enemy, ready - now), reach: attackRange(battle, enemy, actor) + walk }
  })
  const test = (request: EdgePoint) => {
    const landing = moveLanding(actor, request, battle)!
    const walk = returnWalk(battle, actor, landing)
    const exposed = threats.some(threat => shoreContact(battle, actor, landing, threat, walk.arrival, walk.timeAt, walk.distanceAt) !== undefined)
    return { request, ...walk, exposed }
  }
  const straight = test(direct)
  // Normal hits can nudge a legal return back into the beast's next push.
  // Leave extra room only when a visible enemy can actually take that shot.
  const followUp = (route: ReturnType<typeof test>) => threats.some(threat => {
    const when = Math.max(threat.ready, route.arrival)
    if (when >= threat.until || when > route.arrival + COOLDOWN.move + COOLDOWN.shared) return false
    const at = route.at(when)
    const boundary = borderGap(at) <= threat.push + BASIC_PUSH + 4
    if (!boundary || edgeDistance(threat.center, at) > threat.radius + BASIC_PUSH + 4) return false
    return pursuers.some(({ ready, origin, reach }) => ready < Math.min(threat.until, route.arrival + COOLDOWN.move + COOLDOWN.shared) &&
      !isOutside(origin) && edgeDistance(origin, route.at(Math.min(ready, when))) <= reach)
  })
  if (!straight.exposed && !followUp(straight)) return direct
  const across = rotate(outward(straight.crossing), 90)
  const alternatives = [inside(actor, 105), ...[145, 220, 310].flatMap(distance => [-1, 1].map(side =>
    inside(along(direct, across, distance * side), 42)))]
  let best: ReturnType<typeof test> | undefined
  for (const request of alternatives) {
    const route = test(request)
    if (route.exposed || route.length < 7 || followUp(route) || summonTerrainInPath(battle, { ...actor, ...route.crossing }, route.landing) ||
      availablePortalExit(battle, actor, route.landing, route.arrival) ||
      walksIntoWarning(battle, actor, route.landing, route.arrival, undefined, now, true)) continue
    if (!best || route.arrival < best.arrival) best = route
  }
  if (best) return best.request
  if (!straight.exposed) return direct
  // If a return order alone cannot get around the beast, leave room for an
  // ordinary walk before its pulse. Pick the route by its position at the pulse.
  const margin = (route: ReturnType<typeof test>) => Math.min(...threats.map(threat =>
    edgeDistance(route.at(threat.ready), threat.center) - threat.radius))
  let fallback = straight
  for (const request of [-1, 1].map(side => inside(along(direct, across, 270 * side), 42))) {
    const route = test(request)
    if (margin(route) > margin(fallback) + 12) fallback = route
  }
  return fallback.request
}

export function dodgeReturnStrike(battle: EdgeBattle, actor: EdgeUnit, request: EdgePoint) {
  const now = battle.time
  const until = now + COOLDOWN.shared + .4
  const contacts = announcedStrikes(battle, actor, until)
  const armed = battle.runtime.fields.some(field => field.mode === "enter" && field.until > now &&
    !field.seen.has(actor.id) && !sameSide(battle, field.cast.owner, actor.id))
  if (!armed && !contacts.length) return
  const landing = moveLanding(actor, request, battle)
  if (!landing) return
  const straight = returnWalk(battle, actor, landing)
  const afterStrikes = (position: PositionAt, horizon: number) => {
    const strikes = armed ? [...contacts, ...entryFieldContacts(battle, actor, horizon, position)].sort((a, b) => a.at - b.at) : contacts
    return lifeThroughStrikes(battle, actor, strikes, position).hp
  }
  const routePosition = (walk: typeof straight): PositionAt =>
    (unit, time) => unit === actor ? walk.at(time) : future(battle, unit, time - now)
  const remaining = (walk: typeof straight) => {
    // A slow outside walk can meet an armed field well after the next
    // decision. Verify the entire return before redirecting the fighter.
    return afterStrikes(routePosition(walk), Math.max(until, walk.arrival + SPARRING_STEP))
  }
  if (remaining(straight) > 0) return
  const shore = shoreThreats(battle, actor)
  const across = rotate(outward(straight.crossing), 90)
  const nearbyReturns = battle.sparring ? alliesOf(battle, actor.id).filter(unit =>
    unit !== actor && unit.hp > 0 && isOutside(unit) && edgeDistance(unit, actor) < 270 && committedReturn(battle, unit)) : []
  const enemies = battle.sparring && nearbyReturns.length
    ? sideOf(battle, actor.id) === "ally" ? battle.sparring.rivals : battle.team : []
  const followThrough = now + 2 * COOLDOWN.shared + .75
  const crossfire = (position: PositionAt) => {
    if (!enemies.length) return 0
    let risk = 0
    const team = [actor, ...nearbyReturns]
    for (const target of team) {
      const partners = team.filter(unit => unit !== target)
      for (const reply of shortAreaThreats(battle, target, enemies, followThrough, position, now, partners, "circle-group")) {
        let loss = 0
        for (const unit of team) {
          const hits = announcedStrikes(battle, unit, reply.at, position)
          const before = lifeThroughStrikes(battle, unit, hits, position)
          if (!before.hp) continue
          hits.push(reply)
          const after = lifeThroughStrikes(battle, unit, hits, position)
          const damage = Math.max(0, before.hp - after.hp) / unit.maxHp
          loss += (after.hp ? 0 : 1) + damage * (3 - 2 * after.hp / unit.maxHp)
        }
        risk = Math.max(risk, loss)
      }
    }
    return risk
  }
  let best: { point: EdgePoint; value: number } | undefined
  for (const span of [90, -90, 175, -175, 275, -275, 350, -350]) {
    const point = inside(along(straight.crossing, across, span), 22)
    const end = moveLanding(actor, point, battle)
    if (!end) continue
    const walk = returnWalk(battle, actor, end)
    if (walk.length < 7) continue
    const hp = remaining(walk)
    if (hp <= 0 || summonTerrainInPath(battle, { ...actor, ...walk.crossing }, end) ||
      availablePortalExit(battle, actor, end, walk.arrival) ||
      shore.some(threat => shoreContact(battle, actor, end, threat, walk.arrival, walk.timeAt, walk.distanceAt) !== undefined)) continue
    const value = hp / actor.maxHp - .38 * (walk.crossAt - straight.crossAt) - .75 * crossfire(routePosition(walk))
    if (!best || value > best.value) best = { point, value }
  }
  if (best) return best.point
  // A fighter who has not started back can wait for a legal opening.
  if (!actor.move && afterStrikes((unit, at) => future(battle, unit, at - now), until) > 0) return "wait"
}

export function delayCrowdedReturns(battle: EdgeBattle, team: EdgeFighter[], enemies: EdgeFighter[]) {
  if (!battle.sparring) return
  const outside = team.filter(unit => isOutside(unit) && !moveProblem(battle, unit))
  if (outside.length < 2 || !outside.some(unit => !unit.move && unit.hp < unit.maxHp * .52)) return
  const now = battle.time
  const until = now + COOLDOWN.shared * 2 + .12
  const frame = decisionStep()
  const clocks = sideOf(battle, outside[0].id) === "ally" ? battle.sparring : battle
  const moves = new Map<EdgeUnit, ReturnType<typeof returnWalk>>()
  for (const unit of outside) {
    const landing = unit.move ?? moveLanding(unit, returnAroundShore(battle, unit), battle)
    if (landing) moves.set(unit, returnWalk(battle, unit, landing))
  }
  const position: PositionAt = (unit, at) => moves.get(unit)?.at(at) ?? future(battle, unit, at - now)
  const patients = outside.filter(unit => !unit.move && unit.hp < unit.maxHp * .52)
    .sort((a, b) => (moves.get(a)?.crossAt ?? Infinity) - (moves.get(b)?.crossAt ?? Infinity))
  const held = new Set<EdgeFighter>()
  const starts = Math.max(now, clocks.moveAt, clocks.sharedAt)
  const center = outside.reduce((at, unit) => ({
    x: at.x + unit.x / outside.length, y: at.y + unit.y / outside.length,
  }), { x: 0, y: 0 })

  for (const enemy of enemies) {
    if (!enemy.hp || enemy.force || isOutside(enemy)) continue
    const ready = Math.max(now, clocks.sharedAt, enemy.actionAt)
    const attacks = enemy.actives.flatMap(skill => {
      const step = skill.steps[0]
      if (skill.aim.mode !== "point" || firstDamageShape(skill) !== "C") return []
      const lead = fixedSkillWindup(skill)
      const delay = lead === undefined ? Infinity : lead + step.delay
      return delay > SPARRING_STEP && delay <= .85 && ready + delay < until ? [{ skill, step, delay }] : []
    })
    if (!attacks.length) continue
    const standing = pressureReply(battle, enemy, ready, until, position)
    const setups = standing ? [standing] : []
    if (starts <= now + frame && !enemy.move && !movementStopped(battle, enemy)) {
      // Only project an advance that the opponent could issue with its
      // current clocks and terrain. The next decision rechecks its real path.
      const destination = inside(center, 34)
      const landing = moveLanding(enemy, destination, battle)
      if (landing && edgeDistance(enemy, landing) >= 30 && !dancerMovesBySkill(battle, enemy, destination) &&
        !summonTerrainInPath(battle, enemy, landing)) {
        const arrival = starts + edgeDistance(enemy, landing) / movementSpeed(battle, enemy)
        const after = Math.max(arrival + SPARRING_STEP, starts + COOLDOWN.shared, ready)
        const at = now + Math.ceil((after - now) / frame - 1e-6) * frame
        if (at < until && !availablePortalExit(battle, enemy, landing, arrival) &&
          !crossesHostileGate(battle, enemy, landing, starts, arrival) &&
          !walksIntoWarning(battle, enemy, landing, arrival, undefined, starts) &&
          !walksIntoAnnouncedArea(battle, enemy, landing, arrival, undefined, starts))
          setups.push({ at, caster: { ...enemy, ...landing } })
      }
    }

    for (const { at: castAt, caster } of setups) for (const { skill, step, delay } of attacks) {
      const at = castAt + delay
      if (at > until) continue
      const radius = step.selector.size[0]
      const pairAims = outside.length === 2 ? circleAims(radius, outside.map(unit => position(unit, at))) : undefined
      for (const patient of patients) {
        if (held.size === outside.length - 1) return held
        if (held.has(patient)) continue
        // Waiting helps only when the opponent cannot re-aim at the
        // stationary card. The rest of the group can continue to return.
        const outOfReach = edgeDistance(caster, patient) > skill.aim.range + radius ||
          skill.aim.insideOnly && edgeDistance(patient, inside(patient, 0)) > radius
        if (!outOfReach) continue
        const pending = announcedStrikes(battle, patient, at, position)
        const resting: PositionAt = (unit, time) => unit === patient ? patient : position(unit, time)
        const together = entryFieldContacts(battle, patient, at, position)
        const waiting = [...announcedStrikes(battle, patient, at, resting), ...entryFieldContacts(battle, patient, at, resting)]
        const saferToWait = (pairAims ?? [position(patient, at)]).some(point => {
          const aim = fitReplyAim(caster, skill, point)
          if (skillCastProblem(battle, caster, skill, aim, undefined, castAt)) return false
          const [area] = previewSkillAreas(battle, caster, skill, aim)
          if (!area || !areaHits(area, position(patient, at)) ||
            outside.filter(unit => targetable(battle, unit, at) && areaHits(area, position(unit, at))).length < 2) return false
          const cast = { ...forecastSkillCast(caster, skill, patient), aim, issuedAt: castAt }
          const strike = fixedAreaStrike(cast, step, area, true)
          if (!strike) return false
          const attack = { at, source: caster, strike }
          const contacts = [...pending, ...together, attack].sort((a, b) => a.at - b.at)
          const advancing = lifeThroughStrikes(battle, patient, contacts, position)
          if (advancing.hp && (castAt > now + COOLDOWN.shared || advancing.hp + advancing.shield > patient.maxHp * .4)) return false
          // Stagger a pair before a two-beat hit can finish a returning survivor.
          if (!advancing.hp && pairAims && !lifeThroughStrikes(battle, patient, contacts, position, [], undefined, at).hp) return false
          const whileWaiting = [...waiting, attack].sort((a, b) => a.at - b.at)
          const holding = lifeThroughStrikes(battle, patient, whileWaiting, resting)
          // Carry a usable ward into the next exchange when this shot would
          // strip it and still reach health that the fighter can preserve.
          return holding.hp > 0 && (!advancing.hp || holding.hp > advancing.hp &&
            holding.shield - advancing.shield >= patient.maxHp * .14)
        })
        if (saferToWait) held.add(patient)
      }
    }
  }
  return held.size ? held : undefined
}

export function islandReturnCover(battle: EdgeBattle, caster: EdgeFighter, skill: EdgeActive, aim: EdgePoint,
  allies: EdgeFighter[], enemies: EdgeFighter[]) {
  if (skill.id !== "bulwark/Prismatic/A5" || !battle.sparring) return
  const returning = allies.flatMap(unit => unit.hp <= unit.maxHp * .30 && isOutside(unit) && unit.move && !moveProblem(battle, unit)
    ? [{ patient: unit, landing: unit.move }] : [])
  if (!returning.length) return
  const now = battle.time
  const frame = decisionStep()
  const [strikeStep, wardStep] = skill.steps
  const impact = now + fixedSkillWindup(skill)! + strikeStep.delay
  const radius = strikeStep.selector.size[0]
  const until = now + COOLDOWN.shared + .65
  const theirShared = sideOf(battle, caster.id) === "ally" ? battle.sparring.sharedAt : battle.sharedAt
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  const actionFrame = (time: number) => now + Math.ceil(Math.max(0, time - now) / frame - 1e-6) * frame
  const breakers = enemies.flatMap(enemy => {
    const ready = Math.max(now, theirShared, enemy.actionAt, enemy.force ? enemy.force.since + enemy.force.duration : now)
    if (!enemy.hp || ready >= until) return []
    const spells = enemy.actives.flatMap(skill => {
      const attack = spellbreakerLockAttack(skill)
      return attack ? [{ skill, ...attack }] : []
    })
    return spells.length ? [{ enemy, spells, ready, standing: pressureReply(battle, enemy, ready, until, position)?.at ?? Infinity }] : []
  })
  if (!breakers.length) return
  const contact = (point: EdgePoint) => {
    const area = previewSkillAreas(battle, caster, skill, point)[0]
    const cast = { ...forecastSkillCast(caster, skill, caster), aim: point, target: undefined, issuedAt: now }
    const strike = fixedAreaStrike(cast, strikeStep, area, true)
    return strike && area && { area, cast, strike, source: caster, at: impact }
  }
  const original = contact(aim)
  if (!original) return
  const enemiesHit = enemies.filter(unit => targetable(battle, unit, impact) && areaHits(original.area, position(unit, impact)))
  const alliesCovered = allies.filter(unit => areaHits(original.area, position(unit, impact)))
  type Island = NonNullable<ReturnType<typeof contact>>
  type ReturnWalk = ReturnType<typeof returnWalk>
  const danger = (patient: EdgeFighter, walk: ReturnWalk, island: Island) => {
    const path: PositionAt = (unit, at) => unit.id === patient.id ? walk.at(at) : position(unit, at)
    const pending = [...announcedStrikes(battle, patient, until, path), ...entryFieldContacts(battle, patient, until, path)]
      .sort((a, b) => a.at - b.at)
    const support = estimateScheduledSupport(battle, { cast: island.cast, step: wardStep, ownerRequired: true, area: island.area },
      patient, impact, unit => path(unit, impact))
    const aid = support ? [{ at: impact, ...support }] : []
    const known = lifeThroughStrikes(battle, patient, pending, path, aid)
    let downAt = known.downAt
    let threat: EdgeFighter | undefined
    for (const { enemy, spells, ready, standing } of breakers) {
      const defense = aidBeforeHit(battle, enemy, impact, path)
      const hit = announcedHit(battle, island, enemy, path(enemy, impact), path, defense.hp, defense.shield, 0, undefined, defense.defy)
      const forced = hit && !hit.lethal ? announcedShift(battle, island, enemy, path) : undefined
      const motion = forced && { ...forced, start: impact, from: path(enemy, impact) }
      const placed: PositionAt = (unit, at) => unit.id === enemy.id && motion && at > impact ? displacementPoint(motion, at) : path(unit, at)
      const afterPush = motion ? actionFrame(Math.max(ready, impact + motion.duration + SPARRING_STEP)) : standing
      const first = standing < impact ? standing : afterPush
      for (let start = first; start < Math.min(until, downAt); start += frame) {
        if (start >= impact && (hit?.lethal || start < afterPush - 1e-6)) continue
        const from = placed(enemy, start)
        if (isOutside(from) || !targetable(battle, patient, start)) continue
        const at = placed(patient, start)
        for (const { skill, power, range, delay } of spells) {
          const lands = start + delay
          if (lands >= downAt || lands > until || edgeDistance(from, at) > range || hit?.lethal && lands > impact) continue
          const source = { ...enemy, ...from }
          const cast = { ...forecastSkillCast(source, skill, patient), aim: at, issuedAt: start }
          const reply: AnnouncedStrike = { at: lands, source, strike: { cast, target: patient.id, power, range } }
          const strikes = [...pending.filter(contact => contact.at <= lands), reply].sort((a, b) => a.at - b.at)
          if (lifeThroughStrikes(battle, patient, strikes, placed, aid).hp) continue
          downAt = lands
          threat = enemy
        }
      }
    }
    return { downAt, threat, stopped: pending.some(hit => announcedShift(battle, hit, patient, path)) }
  }
  let best: { patient: EdgeFighter; point: EdgePoint; aim: EdgePoint; value: number; downAt: number } | undefined
  for (const { patient, landing } of returning) {
    const current = returnWalk(battle, patient, landing)
    const baseline = danger(patient, current, original)
    if (!baseline.threat || baseline.stopped || baseline.downAt >= (best?.downAt ?? Infinity)) continue
    const pursuer = position(baseline.threat, impact)
    const across = rotate(outward(current.crossing), 90)
    const shore = shoreThreats(battle, patient)
    for (const span of [-300, -220, -140, 140, 220, 300]) {
      const point = inside(along(current.landing, across, span), 22)
      const landing = moveLanding(patient, point, battle)
      if (!landing || edgeDistance(landing, current.landing) < 25) continue
      const walk = returnWalk(battle, patient, landing)
      if (walk.crossAt > current.crossAt + .9 || summonTerrainInPath(battle, patient, landing) ||
        crossesHostileGate(battle, patient, landing, now, walk.arrival) ||
        shore.some(threat => shoreContact(battle, patient, landing, threat, walk.arrival, walk.timeAt, walk.distanceAt) !== undefined)) continue
      const at = walk.at(impact)
      for (const scale of [.86, .97]) {
        // Push the pursuer away from the new crossing without dropping the
        // original targets or allies from the island.
        const center = inside(along(pursuer, direction(pursuer, at), radius * scale), 0)
        if (skillCastProblem(battle, caster, skill, center)) continue
        const island = contact(center)
        if (!island || !areaHits(island.area, at) ||
          enemiesHit.some(unit => !areaHits(island.area, position(unit, impact))) ||
          alliesCovered.some(unit => unit !== patient && !areaHits(island.area, position(unit, impact)))) continue
        const route = danger(patient, walk, island)
        if (route.stopped || route.downAt < baseline.downAt + frame - SPARRING_STEP) continue
        const delay = Math.min(until + frame, route.downAt) - baseline.downAt
        const value = delay - .35 * (walk.crossAt - current.crossAt)
        if (!best || baseline.downAt < best.downAt || value > best.value)
          best = { patient, point, aim: center, value, downAt: baseline.downAt }
      }
    }
  }
  return best
}

export function clearShore(battle: EdgeBattle, actor: EdgeUnit) {
  const threats = shoreThreats(battle, actor)
  if (!threats.length || borderGap(actor) > Math.max(...threats.map(threat => threat.push))) return
  const speed = movementSpeed(battle, actor)
  const now = battle.time
  const risk = threats.find(threat => {
    if (threat.ready >= now + 1.25) return false
    const at = future(battle, actor, threat.ready - now)
    return edgeDistance(at, threat.center) <= threat.radius + 4 &&
      isOutside(previewDirectedShove(battle, actor, at, outward(at), threat.push, threat.ready))
  })
  if (!risk) return
  const inward = rotate(outward(actor), 180)
  const away = direction(risk.center, actor)
  const directions = [inward, rotate(inward, 45), rotate(inward, -45), rotate(inward, 82), rotate(inward, -82), away]
  let best: { point: EdgePoint; value: number } | undefined
  for (const axis of directions) {
    const point = inside(along(actor, axis, MOVE_REACH), 24)
    const landing = moveLanding(actor, point, battle)
    if (!landing || summonTerrainInPath(battle, actor, landing) || dancerMovesBySkill(battle, actor, point)) continue
    const distance = edgeDistance(actor, landing)
    const arrival = now + distance / speed
    if (distance < 35 || availablePortalExit(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, now, true) ||
      threats.some(threat => shoreContact(battle, actor, landing, threat, arrival,
        span => now + span / speed, time => speed * (time - now)) !== undefined)) continue
    const room = Math.min(165, borderGap(landing)) - borderGap(actor)
    const clearance = Math.min(185, edgeDistance(risk.center, landing)) - edgeDistance(risk.center, actor)
    const value = 2.7 + Math.max(room, clearance) / 170 - .18 * (arrival - now)
    if (!best || value > best.value) best = { point, value }
  }
  return best
}

export function shoreBeastStrikeValue(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit, allies: readonly EdgeUnit[], delay: number, damage: number) {
  const threat = shoreThreats(battle, actor).find(item => item.body === target)
  const hitAt = battle.time + delay
  if (!threat || threat.until <= hitAt + .25) return 0
  const hold = Math.max(threat.ready, hitAt + .035)
  if (hold >= threat.until) return 0
  const victims = allies.filter(ally => {
    if (!ally.hp) return false
    if (isOutside(ally) && !ally.move && !ally.force) return false
    const at = future(battle, ally, hold - battle.time)
    return edgeDistance(at, threat.center) <= threat.radius + 8 &&
      isOutside(previewDirectedShove(battle, ally, at, outward(at), threat.push, hold))
  })
  if (!victims.length) return 0
  const shield = target.shieldUntil > hitAt ? target.shield : 0
  const finish = target.hp + shield <= damage + .5
  // Slow chip only pays when another attack can finish the beast while it
  // still has a push left. A single killing shot can replace routine chip.
  if (finish) return (hitAt <= threat.ready + .02 ? 2.65 : 2.35) + .22 * Math.min(2, victims.length)
  const clocks = sideOf(battle, actor.id) === "ally" ? battle : battle.sparring ?? battle
  const support = allies.reduce((largest, ally) => {
    if (ally === actor || !ally.hp || isOutside(ally)) return largest
    const fire = Math.max(Math.max(battle.time, clocks.sharedAt) + COOLDOWN.shared + .09, ally.actionAt,
      ally.force ? ally.force.since + ally.force.duration : battle.time)
    const at = future(battle, ally, fire - battle.time)
    const land = fire + (ally.range >= 200 ? flightTime(at, target) : 0)
    const inRange = edgeDistance(at, threat.center) <= attackRange(battle, ally, target) - 8
    return land < threat.until - .15 && land <= hold + 1.45 && inRange && !isOutside(at)
      ? Math.max(largest, ally.attack * roleDamageScale(battle, ally, target) * (1 - target.armor)) : largest
  }, 0)
  return damage + support >= target.hp + shield ? 1.95 + Math.min(.48, .24 * victims.length) : .85
}

export function duelFootwork(battle: EdgeBattle, actor: EdgeUnit, enemy: EdgeUnit, enemySharedAt: number) {
  const now = battle.time
  const ready = actor.actionAt - now
  if (ready < 1.12 || ready > 2.8 || actor.force || actor.move || isOutside(actor) || isOutside(enemy) ||
    enemy.force || enemy.move || enemy.hp <= 0 || !targetable(battle, enemy)) return
  const range = attackRange(battle, actor, enemy)
  const gap = edgeDistance(actor, enemy)
  if (gap < 18 || gap > range + 15) return
  const ownBorder = borderGap(actor)
  const enemyBorder = borderGap(enemy)
  if (ownBorder > 38 && enemyBorder > 62) return
  const enemyReady = Math.max(0, enemy.actionAt - now, enemySharedAt - now)
  const enemyRange = attackRange(battle, enemy, actor)
  const speed = movementSpeed(battle, actor)
  const end = previewBasicShove(battle, actor, enemy).end
  const oldMargin = borderGap(end)
  const oldPush = isOutside(end)
  const incoming = previewBasicShove(battle, enemy, actor).end
  const danger = enemyReady < ready + 1.05 && gap <= enemyRange + 12
  const needsSafety = danger && (isOutside(incoming) || ownBorder <= 38 && actor.hp <= actor.maxHp * .55)
  const priority = battle.runtime.summons.length ? basicTarget(battle, actor, target => Number(target === enemy)) : undefined
  const canPressure = !oldPush && enemyBorder <= 62 && actor.hp > enemy.attack * (1 - actor.armor) * 1.1 &&
    (!priority || priority === enemy)
  if (!needsSafety && !canPressure) return
  const lengths = [Math.min(range * .63, 135), Math.min(range * .37, 74)]
  const normal = outward(enemy)
  const towardField = { x: -normal.x, y: -normal.y }
  const contactAt = enemyReady + (enemy.range >= 200 ? flightTime(enemy, actor) : 0)
  let best: { point: EdgePoint; value: number } | undefined
  for (const angle of [0, 35, -35, 72, -72]) for (const length of lengths) {
    const point = inside(along(enemy, rotate(towardField, angle), length), 35)
    const landing = moveLanding(actor, point, battle)
    if (!landing || dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
    const travel = edgeDistance(actor, landing)
    const duration = travel / speed
    if (travel < 30 || duration > ready - .14 || edgeDistance(landing, enemy) > range - 8 ||
      availablePortalExit(battle, actor, landing, now + duration) ||
      walksIntoWarning(battle, actor, landing, now + duration, undefined, now, true)) continue
    const from = { ...actor, ...landing }
    const next = previewBasicShove(battle, from, enemy).end
    const exits = isOutside(next)
    const margin = borderGap(next)
    const pushGain = oldMargin - margin
    const edgeThreat = canPressure && (exits || pushGain >= 10 && margin < 23)
    const contact = along(actor, direction(actor, landing), Math.min(travel, speed * contactAt))
    const safer = needsSafety && borderGap(landing) >= ownBorder + 22 && borderGap(landing) >= 48 &&
      !isOutside(previewBasicShove(battle, enemy, { ...actor, ...contact }).end)
    if (needsSafety ? !safer : !edgeThreat) continue
    const pressure = exits ? 2.2 : 1 + Math.min(.65, pushGain / 36)
    const safety = 1.4 + Math.min(.6, (borderGap(landing) - ownBorder) / 130)
    const value = (edgeThreat ? pressure : 0) + (safer ? safety : 0) - .16 * duration
    if (!best || value > best.value) best = { point, value }
  }
  return best
}

export function retreatFromDive(battle: EdgeBattle, actor: EdgeUnit, allies: EdgeUnit[], enemies: EdgeUnit[]) {
  if (!isFighter(actor) || actor.range < 200 || actor.hp > actor.maxHp * .72 || isOutside(actor)) return
  const chasers = enemies.filter(enemy => enemy.range < 200 && !isOutside(enemy) &&
    enemy.actionAt <= battle.time + 1.8 && edgeDistance(actor, enemy) <= attackRange(battle, enemy, actor) + 100)
  if (!chasers.length) return
  const riskAt = (at: EdgePoint, after: number) => chasers.reduce((risk, enemy) => {
    const gap = edgeDistance(at, future(battle, enemy, after))
    const reach = attackRange(battle, enemy, actor)
    return risk + Math.max(0, 1 + (reach - gap) / 100) * enemy.attack / actor.maxHp
  }, 0)
  const oldRisk = riskAt(actor, .5)
  const chaser = chasers.reduce((a, b) => edgeDistance(actor, a) < edgeDistance(actor, b) ? a : b)
  let best: { point: EdgePoint; value: number } | undefined
  for (const guard of allies) {
    if (!isFighter(guard) || guard === actor || !guard.hp || isOutside(guard) ||
      (guard.card.job !== "tank" && !combatHasRole(guard, "paladin"))) continue
    const at = future(battle, guard, .65)
    const away = direction(chaser, at)
    for (const turn of [0, -55, 55]) {
      const request = inside(along(at, rotate(away, turn), 65), 48)
      const landing = moveLanding(actor, request, battle)
      if (!landing || edgeDistance(actor, landing) < 32 || edgeDistance(landing, at) > BULWARK_COVER.range * .79 ||
        summonTerrainInPath(battle, actor, landing)) continue
      const delay = edgeDistance(actor, landing) / movementSpeed(battle, actor)
      const arrival = battle.time + delay
      // A protected fighter can spend its ward to regroup behind the tank.
      // Avoid routes that expose health or interrupt the retreat on the way.
      if (walksIntoWarning(battle, actor, landing, arrival) || walksIntoAnnouncedArea(battle, actor, landing, arrival, undefined, battle.time, 0) ||
        exposesToEdgePush(battle, actor, landing, arrival) || portalRoute(battle, landing, actor.id, arrival)) continue
      const cover = combatHasRole(guard, "bulwark") && edgeDistance(actor, guard) > BULWARK_COVER.range ? .12 : 0
      const benefit = oldRisk - riskAt(landing, delay) + cover
      if (benefit < .15) continue
      const value = benefit * (3 + 2.2 * (1 - actor.hp / actor.maxHp))
      if (!best || value > best.value) best = { point: request, value }
    }
  }
  return best
}

export function leaveLethalTargetRange(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeFighter[],
  scope: "all" | "announced" | "portal" = "all") {
  const now = battle.time
  const committedOnly = scope === "announced"
  const portalOnly = scope === "portal"
  if (actor.force || isOutside(actor) || actor.move && movementStopped(battle, actor)) return
  const hasTargetedThreat = battle.runtime.pending.some(({ strike }) =>
    strike && "target" in strike && strike.target === actor.id &&
    (strike.locksAt !== undefined || strike.range !== undefined || strike.deliveryRange !== undefined))
  if (!hasTargetedThreat && (committedOnly || actor.hp > actor.maxHp * .34)) return
  const stays = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const contacts = announcedStrikes(battle, actor, now + 1.95, stays)
  const pending = contacts.flatMap(({ at, source, strike }) => {
    if (portalOnly || "area" in strike) return []
    const range = strike.deliveryRange ?? strike.range
    if (range === undefined) return []
    const ready = strike.deliveryRange === undefined ? strike.locksAt ?? at : at
    const origin = strike.deliveryRange === undefined ? undefined : strike.launchedFrom ?? stays(source, strike.locksAt ?? at)
    return [{ enemy: source, ready, range, committedAt: at, origin }]
  })
  if (committedOnly && !pending.length) return
  const foeShared = sideOf(battle, actor.id) === "ally" ? battle.sparring?.sharedAt ?? battle.boss.sharedAt : battle.sharedAt
  const decisionStep = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
  const actionFrame = (earliest: number) => now + Math.max(0, Math.ceil((earliest - now) / decisionStep - 1e-6)) * decisionStep
  const possible = committedOnly ? [] : enemies.flatMap(enemy => {
    if (enemy.force || isOutside(enemy)) return []
    const walking = walkingPortal(battle, enemy)
    let portal = walking && { arrival: walking.arrival, out: walking.out, shared: foeShared }
    if (portalOnly && !portal && !enemy.move && battle.sparring && !movementStopped(battle, enemy)) {
      const clocks = sideOf(battle, enemy.id) === "ally" ? battle : battle.sparring
      const start = actionFrame(Math.max(now, clocks.moveAt, clocks.sharedAt))
      if (start < now + .82) {
        const route = bestPortalAdvance(battle, enemy, [actor], start)
        if (route?.strike && route.arrival < now + 1.45)
          portal = { arrival: route.arrival, out: route.stop, shared: start + COOLDOWN.shared }
      }
    }
    if (portalOnly && !portal) return []
    if (enemy.move && !portal) return []
    const earliest = Math.max(now, portal?.shared ?? foeShared, enemy.actionAt, portal?.arrival ?? now)
    const ready = portal ? actionFrame(earliest) : earliest
    if (ready > now + COOLDOWN.move + AI_THINK_INTERVAL) return []
    const origin = portal ? { ...enemy, ...portal.out } : enemy
    const range = attackRange(battle, origin, actor, ready)
    const gap = edgeDistance(origin, actor)
    const basic = actor.hp <= actor.maxHp * .25 && ready <= now + 1.65 && battle.sparring && enemy.range >= 200 && gap <= range + MOVE_REACH &&
      targetable(battle, enemy, ready) &&
      !battle.runtime.buffs.some(buff => buff.target === enemy.id && buff.kind === "choose" && buff.until > ready)
    const locks = enemy.actives.flatMap(skill => {
      const lock = assassinLockAttack(skill) ?? binderLockAttack(skill)
      const release = spellbreakerLockAttack(skill)
      const blade = portal && skill.aim.mode === "outside" && gap <= skill.aim.range + MOVE_REACH
        ? boundaryBladeStrikes(skill, { ...forecastSkillCast(origin, skill, actor), issuedAt: ready }, ready) : []
      const [first] = blade
      const ranged = lock ?? (release && { ...release, windup: release.delay, delay: 0 }) ??
        (first && { range: skill.aim.range, windup: first.locksAt - ready, delay: blade.at(-1)!.afterLock, power: 0 })
      return ranged && gap <= ranged.range + MOVE_REACH
        ? [{ enemy: origin, ready, range: ranged.range, lock: ranged, blade: first ? blade : undefined,
          delayedAt: undefined as number | undefined, portal: !!portal }] : []
    })
    return [...(basic ? [{ enemy: origin, ready, range, lock: undefined, blade: undefined,
      delayedAt: undefined, portal: !!portal }] : []), ...locks]
  })
  const dangerAt = (attack: typeof possible[number], ready: number, position: (unit: EdgeUnit, time: number) => EdgePoint) => {
    const { enemy, range, lock, blade } = attack
    const at = position(actor, ready)
    if (!targetable(battle, actor, ready) || edgeDistance(enemy, at) > range && !(blade && isOutside(at))) return 0
    if (blade) {
      const fixed = (unit: EdgeUnit, time: number) => unit.id === enemy.id && time >= ready ? enemy : position(unit, time)
      const sequence = blade.map(strike => {
        const locksAt = strike.locksAt + (ready - attack.ready)
        return { source: enemy, at: locksAt + strike.afterLock, strike: { ...strike, locksAt } }
      })
      return lifeThroughStrikes(battle, actor, sequence, fixed).hp ? 0 : 2
    }
    if (!lock && basicTarget(battle, enemy, target => Number(target.id === actor.id), ready, unit => position(unit, ready))?.id !== actor.id) return 0
    const locksAt = ready + (lock?.windup ?? 0)
    if (lock && edgeDistance(enemy, position(actor, locksAt)) > range) return 0
    const impact = locksAt + (lock?.delay ?? flightTime(enemy, at))
    const aid = aidBeforeHit(battle, actor, impact, position)
    const hit = estimateDirectHit(battle, enemy, actor, lock?.power ?? 1, lock ? "skill" : "basic",
      position(actor, impact), impact, aid.shield, aid)
    const hitByEnemy = lock && battle.runtime.histories.get(actor.id)?.hitBy === enemy.id
    if (hit.lethal) return 2
    return hitByEnemy && hit.hpLoss >= actor.maxHp * .12 && aid.hp + hit.saveHeal - hit.hpLoss <= actor.maxHp * .12 ? 1 : 0
  }
  // A ward about to expire can make a slightly delayed cast lethal even when
  // the first legal frame is safe. Check that window while a move can still help.
  for (const attack of possible) {
    const { lock, ready } = attack
    if (!lock || actor.shield <= 0 || actor.shieldUntil <= ready + lock.windup + lock.delay ||
      actor.shieldUntil > ready + lock.windup + lock.delay + .55) continue
    attack.delayedAt = actor.shieldUntil - lock.windup - lock.delay + SPARRING_STEP
  }
  const incoming = pending.length ? lifeThroughStrikes(battle, actor, contacts, stays) : undefined
  const doomed = incoming?.hp === 0
  const committed = doomed && pending.find(attack => attack.committedAt === incoming.downAt)
  const forecast = possible.flatMap(attack => {
    const early = dangerAt(attack, attack.ready, stays)
    if (early && attack.ready >= now + .09) return [{ ...attack, danger: early }]
    if (attack.delayedAt === undefined || attack.delayedAt < now + .09) return []
    const late = dangerAt(attack, attack.delayedAt, stays)
    return late ? [{ ...attack, ready: attack.delayedAt, danger: late }] : []
  }).sort((a, b) => a.ready - b.ready || b.danger - a.danger)[0]
  const first = committed || forecast
  if (!first || actor.move && !committed) return

  const speed = movementSpeed(battle, actor)
  const origin = committed ? committed.origin ?? stays(first.enemy, first.ready) : first.enemy
  const away = direction(origin, actor)
  const activeLock = "lock" in first && !!first.lock
  const fromPortal = "portal" in first && first.portal
  const bladeLock = "blade" in first && first.blade && first.lock
  const lockAt = bladeLock ? first.ready + bladeLock.windup : first.ready
  if (lockAt < now + (bladeLock ? SPARRING_STEP : .09)) return
  const portalAttacker = bladeLock && isFighter(first.enemy) ? { ...first.enemy, move: null } : undefined
  const turns = [0, -38, 38, -68, 68, -98, 98]
  if (borderGap(actor) < MOVE_REACH && (committed || activeLock)) turns.splice(1, 0, -20, 20)
  if (fromPortal) turns.push(-135, 135, 180)
  const projectile = committed && (committed.origin !== undefined ||
    contacts.some(({ strike, at }) => at === committed.committedAt && "projectile" in strike && strike.projectile))
  const minDodge = 18
  const beforeLock = speed * Math.max(0, lockAt - now - .04)
  // For a short committed lock, issue a usable movement order and test where
  // it actually gets the card by the lock time below.
  const travel = fromPortal ? MOVE_REACH : Math.min(MOVE_REACH,
    projectile || committed && beforeLock < minDodge ? Math.max(28, speed * (first.ready - now)) : beforeLock)
  const route = (axis: EdgePoint, reach: number) => {
    const point = inside(along(actor, axis, reach), 19)
    const landing = moveLanding(actor, point, battle)
    if (!landing || dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) return
    const distance = edgeDistance(actor, landing)
    if (distance < minDodge) return
    const arrival = now + distance / speed
    if (isFighter(actor) && availablePortalExit(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, now, true) ||
      walksIntoShoreBeast(battle, actor, landing, arrival) || exposesToEdgePush(battle, actor, landing, arrival)) return
    const position = (unit: EdgeUnit, time: number) => unit === actor
      ? walkAt(actor, landing, now, arrival, time) : stays(unit, time)
    const clearance = edgeDistance(origin, position(actor, lockAt)) - first.range
    if (clearance < (projectile ? 5 : committed ? 3 : activeLock ? 7 : fromPortal ? 3 : 10) || possible.some(attack =>
      dangerAt(attack, attack.ready, position) || attack.delayedAt !== undefined && dangerAt(attack, attack.delayedAt, position)) ||
      contacts.length && !lifeThroughStrikes(battle, actor, contacts, position).hp) return
    if (portalAttacker) {
      // The attacker can choose an area attack from the same exit instead.
      // Keep that alternative in the same enemy action window.
      const afterGate = (unit: EdgeUnit, at: number) => unit.id === first.enemy.id && at >= first.ready
        ? portalAttacker : position(unit, at)
      const nextMove = now + Math.ceil(COOLDOWN.move / decisionStep - 1e-6) * decisionStep
      const replies = shortAreaThreats(battle, actor, [portalAttacker], nextMove, afterGate, first.ready, undefined, true)
      if (replies.some(reply => !lifeThroughStrikes(battle, actor, [...contacts, reply].sort((a, b) => a.at - b.at), afterGate).hp)) return
    }
    const exposure = approachExposure(battle, actor, landing, arrival) / MOVE_REACH
    // A card at a gate can still walk toward the same target instead.
    const direct = fromPortal ? Math.min(0, ...enemies.filter(enemy => enemy.hp && enemy.range >= 200 &&
      !enemy.force && !isOutside(enemy) && enemy.actionAt <= first.ready + .8 && foeShared <= first.ready + .8 &&
      estimateDirectHit(battle, enemy, actor, 1, "basic", landing, first.ready + .4).lethal)
      .map(enemy => edgeDistance(stays(enemy, arrival), landing) - attackRange(battle, enemy, actor, first.ready) - MOVE_REACH)) : 0
    const value = (committed ? 5.3 : fromPortal ? 4.20 : activeLock && forecast?.danger === 2 ? 4.15 : 3.45) +
      Math.min(.44, clearance / 140) - exposure - distance / 800 + Math.max(-1, direct / 150)
    return { point, value, position, landing, arrival }
  }
  const directions = turns.map(turn => rotate(away, turn))
  const short = directions.flatMap(axis => route(axis, travel) ?? [])
  const best = short.reduce<(typeof short)[number] | undefined>((choice, path) => !choice || path.value > choice.value ? path : choice, undefined)
  if (!best) return
  const shortStep = { point: best.point, value: best.value }
  if (!battle.sparring || !isFighter(actor) || committedOnly || fromPortal) return shortStep
  const safe = (path: typeof best) => !crossesHostileGate(battle, actor, path.landing, now, path.arrival) &&
    !lethalAreaOnPath(battle, actor, enemies, now + COOLDOWN.move, path.position)
  if (safe(best)) return shortStep
  // The fast step clears the initial lock. Check longer routes when it
  // still leaves the card within reach of a lethal area skill.
  const extended = travel < MOVE_REACH - 6 ? directions.flatMap(axis => route(axis, MOVE_REACH) ?? []) : []
  const safer = [...short, ...extended].sort((a, b) => b.value - a.value).find(path => path !== best && safe(path))
  if (safer) return { point: safer.point, value: safer.value }
  return committed ? shortStep : undefined
}

export function dodgePortalFollowUp(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[]) {
  if (!battle.runtime.summons.length || actor.hp > actor.maxHp * .25 || moveProblem(battle, actor) || isOutside(actor) ||
    !activeDeployments(battle).some(({ group, plan }) => plan.gate && !sameSide(battle, group.owner, actor.id))) return
  return leaveLethalTargetRange(battle, actor, enemies, "portal")
}

export function assistedLeap(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeUnit[]) {
  const hop = dancerHop(battle, actor)
  if (!hop) return
  const dancer = unitOf(battle, hop.cast.owner)
  if (!dancer) return
  const [, , duration, power, radius, , ward] = hop.values
  const positions = enemies.map(enemy => ({ enemy, at: future(battle, enemy, duration) }))
  let best: { point: EdgePoint; value: number } | undefined
  for (const { enemy, at } of positions) {
    const range = Math.min(radius * .78, attackRange(battle, actor, enemy) * .75)
    const request = inside(along(at, direction(at, actor), range), 32)
    const landing = moveLanding(actor, request, battle)
    if (!landing || edgeDistance(actor, landing) < 16 || summonTerrainInPath(battle, actor, landing)) continue
    const hits = positions.filter(target => edgeDistance(landing, target.at) <= radius)
    if (!hits.length) continue
    if (walksIntoWarning(battle, actor, landing, battle.time + duration)) continue
    const shield = (ward ?? 0) / 100 * (1 - actor.hp / actor.maxHp) * 2
    const value = hits.reduce((total, hit) => total + damageScore(battle, dancer, hit.enemy, power), 0) + shield
    if (!best || value > best.value) best = { point: request, value }
  }
  return best
}

export function dancerHingeEntry(rail: DancerRail, from: EdgePoint, to: EdgePoint) {
  if (!rail.corner || edgeDistance(from, rail.corner) <= 36) return
  const gate = areaOf("C", rail.corner, { x: 1, y: 0 }, 36)
  const contact = firstCrossing(gate, from, to, 4)
  if (!contact) return
  // A walk needs to enter the hinge from the rail, including when it starts off the rail.
  const before = along(contact, direction(contact, from), Math.min(8, edgeDistance(contact, from)))
  return dancerRailContains(rail, before) ? contact : undefined
}

export function danceRailMove(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeUnit[],
  field: Pick<FieldEffect, "danceRail" | "step" | "until"> & { id?: number }, start = battle.time) {
  const rail = field.danceRail
  if (!rail || !enemies.length || actor.force || actor.move || isOutside(actor) || movementStopped(battle, actor)) return
  const glide = field.step.operations.find(op => op.kind === "glide")
  if (glide && !dancerRailContains(rail, actor)) return
  if (!glide && !rail.corner) return
  const requests = glide ? [.04, .24, .46, .68, .88, .99].map(progress => dancerPointAt(rail.path, progress))
    : [rail.corner!, along(rail.corner!, direction(actor, rail.corner!), 45)]
  const speed = movementSpeed(battle, actor)
  const activeAt = Math.max(start + COOLDOWN.shared, actor.actionAt)
  const fragile = !glide && actor.hp <= actor.maxHp * .25
  const hasFrontline = !!glide && actor.range >= 200 && alliesOf(battle, actor.id).some(unit =>
    unit.id !== actor.id && unit.hp && !isOutside(unit) && (unit.card.job === "tank" || combatHasRole(unit, "paladin")))
  const foeSide = sideOf(battle, actor.id) === "ally" ? battle.sparring : battle
  const arrivalFoes = enemies.map(unit => ({
    unit, at: future(battle, unit, Math.min(2.8, start - battle.time + 1)),
    reach: attackRange(battle, actor, unit),
  }))
  const oldGap = Math.min(...arrivalFoes.map(({ at, reach }) => edgeDistance(actor, at) - reach))
  const oldClearance = Math.min(...arrivalFoes.map(({ at }) => edgeDistance(actor, at)))
  let best: { point: EdgePoint; value: number; arrival: number;
    ward?: { at: number; amount: number; until: number }; advance: number; rescue: boolean } | undefined
  for (const point of requests) {
    const request = inside(point)
    const distance = edgeDistance(actor, request)
    if (distance < 22) continue
    if (glide && field.id !== undefined && glideField(battle, actor, request)?.id !== field.id) continue
    const landing = glide && field.id === undefined
      ? along(actor, direction(actor, request), Math.min(distance, glide.args[0]))
      : moveLanding(actor, request, battle)
    if (!landing || !glide && (dancerMovesBySkill(battle, actor, request) || summonTerrainInPath(battle, actor, landing))) continue
    const trigger = glide
      ? dancerRailContains(rail, request) && dancerRailContains(rail, landing) && actor
      : dancerHingeEntry(rail, actor, landing)
    if (!trigger) continue
    const arrival = start + (glide ? glide.args[1] : edgeDistance(actor, landing) / speed)
    if (start >= field.until - .08 || !glide && start + edgeDistance(actor, trigger) / speed >= field.until - .08) continue
    const exit = !glide && availablePortalExit(battle, actor, landing, arrival)
    if (exit || exposesToEdgePush(battle, actor, landing, arrival) ||
      walksIntoWarning(battle, actor, landing, arrival, undefined, start, true)) continue
    const nextGap = Math.min(...arrivalFoes.map(({ at, reach }) => edgeDistance(landing, at) - reach))
    const clearance = Math.min(...arrivalFoes.map(({ at }) => edgeDistance(landing, at)))
    const gain = oldGap - nextGap
    const safeRetreat = actor.hp < actor.maxHp * .65 && oldClearance < 330 && clearance - oldClearance > 75
    if (glide && portalExitIsExposed(battle, actor, landing, arrival, start, actor.hp < actor.maxHp * .7, true)) continue
    const shield = actor.shieldUntil > arrival ? actor.shield : 0
    const [ward = 0, wardDuration = 12] = field.step.operations.find(op => op.kind === "b")?.args ?? []
    const addsWard = Math.max(0, ward / 100 - shield / actor.maxHp)
    const threatened = arrivalFoes.some(({ unit, at }) => unit.actionAt <= arrival + 2 &&
      edgeDistance(landing, at) <= attackRange(battle, unit, actor) + 135)
    const nearStrike = gain > 34 && nextGap < 140
    if (nearStrike && hasFrontline && oldClearance > 255 && clearance < 345 && nearestSupport(battle, actor, landing, arrival - battle.time) > 210 &&
      enemies.filter(unit => unit.actionAt <= arrival + 1.6 && !isOutside(unit) &&
        edgeDistance(landing, unit) <= nearbyThreatRange(battle, unit, actor)).length >= 2 &&
      (foeSide?.sharedAt ?? 0) <= arrival + 1.15) continue
    const opens = nearStrike && oldGap > 8 && activeAt <= arrival + 1.5 && (nextGap <= 0 || glide &&
      arrivalFoes.some(({ unit }) => reachableStrike(battle, actor, unit, landing, Math.max(arrival, activeAt)) > 0))
    const wardCapacity = glide ? 0 : Math.round(ward / 100 * actor.maxHp)
    const contactAt = glide ? arrival : start + edgeDistance(actor, trigger) / speed
    const newWard = wardCapacity > 0 && (actor.shieldUntil <= contactAt || wardCapacity >= actor.shield)
      ? { at: contactAt, amount: wardCapacity, until: contactAt + wardDuration } : undefined
    let rescue: ReturnType<typeof railSavesWalk>
    if (fragile && newWard) {
      const [speedBonus = 0, speedDuration = 0] = field.step.operations.find(op => op.kind === "speed")?.args ?? []
      const boostedTime = Math.min((arrival - contactAt) / (1 + speedBonus / 100), speedDuration)
      const boostedArrival = arrival - boostedTime * speedBonus / 100
      const position = (unit: EdgeUnit, at: number) => {
        if (unit.id !== actor.id || at < start) return future(battle, unit, at - battle.time)
        return at < contactAt ? walkAt(actor, landing, start, arrival, at) : walkAt(trigger, landing, contactAt, boostedArrival, at)
      }
      rescue = railSavesWalk(battle, actor, enemies, position, start, boostedArrival, newWard)
    }
    if (fragile && !rescue && walksIntoLethalReach(battle, actor, enemies, { landing, stop: landing, arrival }, start)) continue
    if (gain > 48 && actor.hp <= actor.maxHp * .25 && activeAt > arrival + .7) {
      const traveler = { ...actor, ...landing, shield: newWard?.amount ?? shield,
        shieldUntil: newWard?.until ?? actor.shieldUntil }
      if (defensiveThreat(battle, traveler, enemies, arrival)) continue
    }
    if (glide && nearStrike && !opens && actor.range >= 200 && !safeRetreat) continue
    if (!rescue && !nearStrike && !safeRetreat && (!addsWard || !threatened || gain < -40)) continue
    const advance = nearStrike ? Math.min(1.4, gain / (glide ? 245 : 180)) + (opens ? .7 : .2) : 0
    const defense = threatened ? addsWard * (actor.hp < actor.maxHp * .65 ? 6.8 : 4.4) : 0
    const retreat = safeRetreat ? 1.28 + Math.min(.75, (clearance - oldClearance) / 200) : 0
    const value = rescue ? 4.8 - rescue.risk - .40 * (arrival - start) + clamp((clearance - oldClearance) / 140, -.65, .65)
      : (advance + defense + retreat) / (1 + .36 * (arrival - start))
    if (!best || value > best.value) best = { point: request, value, arrival, ward: newWard, advance: oldClearance - clearance, rescue: !!rescue }
  }
  return best
}

function railSavesWalk(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeUnit[], position: PositionAt,
  start: number, arrival: number, ward: { at: number; amount: number; until: number }) {
  const now = battle.time
  const until = Math.min(start + COOLDOWN.move, ward.at + 1.75)
  if (ward.at > now + 2.15) return
  const stays = (unit: EdgeUnit, at: number) => unit.id === actor.id && at >= start ? actor : future(battle, unit, at - now)
  const beforeWard = (at: number) => at <= ward.at + SPARRING_STEP
  const aid = { at: ward.at, shield: ward.amount, shieldUntil: ward.until }
  const strikes = announcedStrikes(battle, actor, until, position)
  if (strikes.length && lifeThroughStrikes(battle, actor, strikes, position, [aid]).hp === 0) return
  const standing = strikes.length ? lifeThroughStrikes(battle, actor, strikes, stays) : undefined
  if (standing?.hp === 0 && standing.downAt > ward.at + SPARRING_STEP && lifeThroughStrikes(battle, actor, strikes, position).hp === 0 &&
    !strikes.some(strike => {
      const shift = announcedShift(battle, strike, actor, position)
      return shift && (beforeWard(strike.at) || isOutside(shift.end))
    })) return { risk: 0 }
  const original = shortAreaThreats(battle, actor, enemies, until, stays).filter(threat => fatalArea(battle, actor, threat, stays))
  if (!original.length) return
  const threats = shortAreaThreats(battle, actor, enemies, until, position)
  let firstSave: AnnouncedStrike | undefined
  for (const threat of threats.sort((a, b) => a.at - b.at)) {
    if (!fatalArea(battle, actor, threat, position)) continue
    const shift = announcedShift(battle, threat, actor, position)
    if (beforeWard(threat.at) || shift && (threat.at + SPARRING_STEP < arrival || isOutside(shift.end)) ||
      !lifeThroughStrikes(battle, actor, [threat], position, [aid]).hp) {
      if (!firstSave || threat.at <= firstSave.at + .18) return
      continue
    }
    if (!firstSave && original.some(other => other.source.id === threat.source.id && other.strike.cast.skill === threat.strike.cast.skill)) {
      firstSave = threat
    }
  }
  if (!firstSave) return
  return { risk: railReplyRisk(battle, actor, enemies, position, stays, firstSave, threats, start, arrival, aid, until) }
}

function railReplyRisk(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeUnit[], position: PositionAt, stays: PositionAt,
  firstSave: AnnouncedStrike, threats: AnnouncedStrike[], start: number, arrival: number,
  aid: { at: number; shield: number; shieldUntil: number }, until: number) {
  const companions = alliesOf(battle, actor.id).filter(unit => unit.hp && unit.id !== actor.id)
  const earlierPushes = threats.filter(threat => threat.at < firstSave.at && threat.at > aid.at + SPARRING_STEP &&
    threat.source.id !== firstSave.source.id && announcedShift(battle, threat, actor, position))
  let risk = 0
  for (const opener of [firstSave, ...earlierPushes]) {
    const displacements = new Map([actor, ...companions].flatMap(unit => {
      const shift = announcedShift(battle, opener, unit, position)
      return shift ? [[unit.id, { ...shift, from: position(unit, opener.at) }]] as const : []
    }))
    const actorShift = displacements.get(actor.id)
    if (actorShift && !isOutside(actorShift.from) && isOutside(actorShift.end)) {
      risk = Math.max(risk, 1.85)
      continue
    }
    const settled = (unit: EdgeUnit, at: number) => {
      const motion = displacements.get(unit.id)
      if (!motion || at <= opener.at) return position(unit, at)
      const { from, end, duration } = motion
      const ease = 1 - (1 - clamp((at - opener.at) / duration, 0, 1)) ** 3
      return { x: from.x + (end.x - from.x) * ease, y: from.y + (end.y - from.y) * ease }
    }
    const actorLife = lifeThroughStrikes(battle, actor, [opener], position, [aid])
    if (!actorLife.hp) continue
    const reply = (opener.strike.cast.issuedAt ?? opener.at) + COOLDOWN.shared
    const late = shortAreaThreats(battle, actor, enemies.filter(enemy => enemy.id !== opener.source.id), until, settled, reply)
    for (const threat of late) {
      const { at } = threat
      if (at <= opener.at || !announcedHit(battle, threat, actor, settled(actor, at), settled)) continue
      const life = lifeThroughStrikes(battle, actor, [opener, threat], settled, [aid])
      // A weaker pull can set up a later hit on the walker and nearby allies.
      const alreadyShared = announcedHit(battle, threat, actor, stays(actor, at), stays)
      let spill = 0
      for (const ally of companions) {
        if (alreadyShared && announcedHit(battle, threat, ally, stays(ally, at), stays)) continue
      const before = lifeThroughStrikes(battle, ally, [opener], settled, [], undefined, at)
        if (!before.hp) continue
        const after = lifeThroughStrikes(battle, ally, [opener, threat], settled)
        spill += Math.max(0, before.hp - after.hp + .22 * (before.shield - after.shield)) / ally.maxHp
      }
      const loss = Math.max(0, (actorLife.hp - life.hp) / actorLife.hp)
      const noReply = at <= Math.max(actor.actionAt, start + COOLDOWN.shared, arrival)
      const danger = !life.hp ? (noReply ? 1.85 : 1.12) : loss * .92
      risk = Math.max(risk, danger + Math.min(1.30, 4.6 * spill))
    }
  }
  return risk
}

export function portalClearAt(battle: EdgeBattle, owner: EdgeUnit["id"], entry: EdgePoint, exit: EdgePoint) {
  return battle.runtime.visuals.reduce((soonest, warning) => {
    if (warning.phase !== "warning" || !warning.clearsSummons || warning.until <= battle.time ||
      sameSide(battle, owner, warning.owner)) return soonest
    return areaHits(warning.area, entry) || areaHits(warning.area, exit) ? Math.min(soonest, warning.until) : soonest
  }, Infinity)
}

function availablePortalRoute(battle: EdgeBattle, actor: EdgeUnit, landing: EdgePoint, arrival: number) {
  const portal = portalRoute(battle, landing, actor.id, arrival)
  if (portal && portalClearAt(battle, actor.id, portal.entry, portal.other) > arrival + .06) return portal
}

export function availablePortalExit(battle: EdgeBattle, actor: EdgeUnit, landing: EdgePoint, arrival: number) {
  return availablePortalRoute(battle, actor, landing, arrival)?.out
}

export function possiblePortalClearAt(battle: EdgeBattle, actor: EdgeUnit) {
  const sparring = battle.sparring
  if (!sparring) return Infinity
  const ours = sideOf(battle, actor.id) === "ally"
  const opponents = ours ? sparring.rivals : battle.team
  const sharedAt = ours ? sparring.sharedAt : battle.sharedAt
  let soonest = Infinity
  for (const opponent of opponents) {
    if (!opponent.hp) continue
    const counter = opponent.actives.map(skill => spellbreakerChoreography(skill.id)).find(art => art?.motif === "blankbeat")
    if (!counter) continue
    const forceEnd = opponent.force ? opponent.force.since + opponent.force.duration : 0
    const ready = Math.max(battle.time, sharedAt, opponent.actionAt, forceEnd)
    if (Number.isFinite(ready) && !isOutside(future(battle, opponent, ready - battle.time))) {
      soonest = Math.min(soonest, ready + counter.windup)
    }
  }
  return soonest
}

function nearestSupport(battle: EdgeBattle, actor: EdgeUnit, at: EdgePoint, after: number) {
  const team = sideOf(battle, actor.id) === "ally" ? battle.team : battle.sparring?.rivals ?? []
  return team.reduce((nearest, unit) => {
    if (!unit.hp || unit.id === actor.id) return nearest
    const projected = future(battle, unit, after)
    return isOutside(projected) ? nearest : Math.min(nearest, edgeDistance(at, projected))
  }, Infinity)
}

function reachableStrike(battle: EdgeBattle, actor: EdgeUnit, enemy: EdgeUnit, from: EdgePoint, ready: number, includeBasic = true) {
  if (!isFighter(actor) || !targetable(battle, enemy)) return 0
  const caster = { ...actor, ...from }
  const target = { ...enemy, ...future(battle, enemy, ready - battle.time) }
  const gap = edgeDistance(from, target)
  let value = includeBasic && gap <= attackRange(battle, caster, target) ? damageScore(battle, caster, target, 1) : 0
  for (const skill of actor.actives) {
    const mode = skill.aim.mode
    const first = skill.steps[0]
    if (!first || first.zone || first.watch) continue
    if (mode === "enemy" || mode === "outside") {
      if (skillCastProblem(battle, caster, skill, target, target)) continue
      const power = skill.steps.reduce((sum, step) => sum + (step.selector.units === "t" && !step.zone && !step.watch &&
        step.delay <= .75 ? step.operations.find(op => op.kind === "d")?.args[0] ?? 0 : 0), 0)
      if (power) value = Math.max(value, damageScore(battle, caster, target, power))
      continue
    }
    const lead = fixedSkillWindup(skill)
    const power = first.operations.find(op => op.kind === "d")?.args[0]
    if (!power || lead === undefined || !first.selector.shape || first.selector.units !== "e") continue
    const delay = lead + first.delay
    const contact = future(battle, enemy, ready + delay - battle.time)
    const at = mode === "point" && edgeDistance(from, contact) > skill.aim.range
      ? along(from, direction(from, contact), skill.aim.range - 1) : contact
    const aim = skill.aim.insideOnly ? inside(at, 0) : at
    if (skillCastProblem(battle, caster, skill, aim)) continue
    const area = previewSkillAreas(battle, caster, skill, aim)[0]
    if (area && areaHits(area, contact)) {
      value = Math.max(value, damageScore(battle, caster, { ...target, ...contact }, power) / (1 + .25 * delay))
    }
  }
  return value
}

function portalEntryRequest(actor: EdgePoint, entry: EdgePoint, other: EdgePoint, radius: number) {
  return edgeDistance(actor, entry) <= radius - 14 ? inside(along(actor, direction(entry, other), 12))
    : along(entry, direction(entry, actor), radius - 13)
}

export function portalAdvance(battle: EdgeBattle, actor: EdgeUnit, enemy: EdgeUnit, entry: EdgePoint, other: EdgePoint, radius: number,
  earliest = battle.time, closesAt = Infinity, opensAt = -Infinity) {
  if (isOutside(actor) || actor.force || actor.move || movementStopped(battle, actor)) return
  const gap = edgeDistance(actor, enemy)
  const reach = attackRange(battle, actor, enemy)

  const request = portalEntryRequest(actor, entry, other, radius)
  if (edgeDistance(request, entry) > radius - 4 || edgeDistance(actor, request) < 7) return
  if (dancerMovesBySkill(battle, actor, request)) return
  const landing = moveLanding(actor, request, battle, false)
  if (!landing || edgeDistance(actor, landing) < 7 || edgeDistance(landing, entry) > radius - 4 ||
    tetherLanding(battle, actor, landing) !== landing || summonTerrainInPath(battle, actor, landing)) return

  const out = portalExit(entry, other, radius)
  const walk = edgeDistance(actor, landing)
  const delay = walk / movementSpeed(battle, actor)
  const arrival = earliest + delay
  if (arrival < opensAt || arrival + .06 >= closesAt || arrival + .06 >= portalClearAt(battle, actor.id, entry, other) ||
    crossesHostileGate(battle, actor, landing, earliest, arrival)) return
  if (exposesToEdgePush(battle, actor, landing, arrival) || exposesToEdgePush(battle, actor, out, arrival)) return
  if (walksIntoWarning(battle, actor, landing, arrival, out, earliest) || walksIntoAnnouncedArea(battle, actor, landing, arrival, out, earliest) ||
    walksIntoShoreBeast(battle, actor, landing, arrival, out, earliest) || actor.actionAt > arrival + 1.2) return
  const enemyAt = future(battle, enemy, arrival - battle.time)
  const gain = edgeDistance(actor, enemyAt) - edgeDistance(out, enemyAt)
  if (gain < 80 || edgeDistance(actor, enemyAt) <= reach + 12) return
  const ordinary = Math.max(0, Math.min(gap - reach * .75, movementAllowance(battle, actor, MOVE_REACH, enemy)))
  const value = gain + Math.max(0, ordinary - walk) * .42
  const advantage = value - ordinary
  const ready = Math.max(arrival, actor.actionAt, earliest + COOLDOWN.shared) + .12
  const support = nearestSupport(battle, actor, out, arrival + COOLDOWN.shared - battle.time)
  const vulnerable = actor.range >= 200 && actor.hp + (actor.shieldUntil > ready ? actor.shield : 0) <= actor.maxHp * .82 &&
    support > GUARD_REACH + 35
  if (advantage < 24 || portalExitIsExposed(battle, actor, out, arrival, earliest, vulnerable, true, landing)) return
  const strike = reachableStrike(battle, actor, enemy, out, ready)
  const endGap = edgeDistance(out, enemyAt)
  const responseRange = attackRange(battle, enemy, actor)
  if (!strike && endGap > reach + MOVE_REACH ||
    actor.hp < actor.maxHp * .72 && endGap <= responseRange + 48 &&
    (!strike || actor.actionAt > arrival + .25)) return
  const unsupported = actor.range >= 200 && support > 245 && endGap < responseRange + 130
  const unshielded = actor.hp + (actor.shieldUntil > ready ? actor.shield : 0) < actor.maxHp * .84
  if (unsupported && unshielded && endGap < responseRange + 75 && actor.hp < actor.maxHp * .62) return
  const safety = unsupported ? unshielded ? .61 : .82 : 1
  const opening = strike ? Math.max(0, strike * safety - reachableStrike(battle, actor, enemy, actor, ready)) : 0
  return { point: request, landing, stop: out, value, advantage, arrival, delay, opening, strike }
}

export function portalOpeningValue(route: NonNullable<ReturnType<typeof portalAdvance>>) {
  if (route.opening < .55) return 0
  return (route.opening * 1.12 + Math.min(.7, route.advantage / 145)) / (1 + route.delay * .45)
}

export function bestPortalAdvance(battle: EdgeBattle, actor: EdgeUnit, enemies: EdgeUnit[],
  earliest = battle.time, owner?: EdgeUnit["id"]) {
  let best: ReturnType<typeof portalAdvance>
  for (const { group, deployment, plan } of activeDeployments(battle)) {
    if (!plan.gate || owner !== undefined && group.owner !== owner || !sameSide(battle, actor.id, group.owner)) continue
    const [first, second] = deployment.bodies
    if (!first.hp || !second.hp) continue
    const closesAt = group.start + plan.duration
    if (earliest >= closesAt) continue
    for (const [entry, exit] of [[first, second], [second, first]]) for (const enemy of enemies) {
      const route = portalAdvance(battle, actor, enemy, entry, exit, plan.gate.radius, earliest, closesAt, first.actionAt)
      if (!route || portalRoute(battle, route.landing, actor.id, route.arrival)?.entry !== entry) continue
      if (!best || route.value + 55 * route.opening > best.value + 55 * best.opening) best = route
    }
  }
  return best
}

export function portalExitIsExposed(battle: EdgeBattle, actor: EdgeUnit, exit: EdgePoint, arrival: number, start = battle.time,
  vulnerableTraveler = false, checkFollowUp = false, entry: EdgePoint = actor) {
  if (!battle.sparring || !isFighter(actor)) return false
  const after = arrival - battle.time
  const ally = sideOf(battle, actor.id) === "ally"
  const enemies = ally ? battle.sparring.rivals : battle.team
  const friends = ally ? battle.team : battle.sparring.rivals
  const ready = ally ? battle.sparring.sharedAt : battle.sharedAt
  const actionAt = Math.max(arrival, actor.actionAt, start + COOLDOWN.shared)
  const reply = actionAt + (vulnerableTraveler ? .55 : .17)
  const disengage = Math.max(start + COOLDOWN.move, reply)
  let earlyDamage = 0
  let lateDamage = 0
  const hostileOpeners: { from: EdgeUnit; damage: number; castAt: number; latest: number; lands: number }[] = []
  const watchOpening = checkFollowUp && actor.range >= 200 &&
    nearestSupport(battle, actor, exit, after + .9) > 235
  // Compare the entry position with the exit at the enemy's next legal cast.
  // A dangerous exit is one that adds a lethal hit before movement comes back,
  // or a heavy hit while the traveler still cannot answer.
  for (const enemy of enemies) {
    const castAt = Math.max(arrival, ready, enemy.actionAt, enemy.force ? enemy.force.since + enemy.force.duration : 0)
    if (!enemy.hp || castAt >= disengage) continue
    const origin = future(battle, enemy, castAt - battle.time)
    if (isOutside(origin)) continue
    const caster = { ...enemy, ...origin }
    const damageScale = enemy.attack * (1 - actor.armor)
    const basicRange = attackRange(battle, enemy, actor)
    const gap = edgeDistance(origin, exit)
    const oldGap = edgeDistance(origin, actor)
    const basicShield = actor.shieldUntil > castAt + .4 ? actor.shield : 0
    const basicHits = gap <= basicRange && castAt + .4 < disengage
    if (basicHits && oldGap > basicRange && actor.hp + basicShield <= damageScale) return true
    let earlyHit = basicHits && castAt + .4 < reply ? damageScale : 0
    let possibleHit = basicHits ? damageScale : 0
    for (const skill of enemy.actives) {
      if (skill.aim.mode === "enemy" || skill.aim.mode === "outside") {
        if (gap > skill.aim.range || castAt + .9 >= disengage) continue
        const immediate = skill.steps.filter(step => !step.watch && !step.zone && step.selector.units === "t" && step.delay <= .75)
          .reduce((power, step) => power + (step.operations.find(op => op.kind === "d")?.args[0] ?? 0), 0)
        const shieldAtImpact = actor.shieldUntil > castAt + .9 ? actor.shield : 0
        const damage = immediate * damageScale
        if (oldGap > skill.aim.range && damage >= actor.hp + shieldAtImpact) return true
        if (vulnerableTraveler) {
          possibleHit = Math.max(possibleHit, damage)
          if (castAt + .9 < reply) earlyHit = Math.max(earlyHit, damage)
        }
        continue
      }
      const lead = fixedSkillWindup(skill)
      const first = skill.steps[0]
      if (lead === undefined || !first?.selector.shape || first.zone || first.watch) continue
      const impact = castAt + lead + first.delay
      if (impact >= disengage) continue
      const hit = first.operations.find(op => op.kind === "d")
      if (!hit) continue
      const breaksOpening = vulnerableTraveler && impact <= actionAt + .36 && first.operations.some(op =>
        op.kind === "i" || op.kind === "p" && op.args[0] >= 90)
      const shieldAtImpact = actor.shieldUntil > impact ? actor.shield : 0
      const extra = hit.style === "crosscore" ? hit.args[1] ?? 0 : 0
      const maximum = (hit.args[0] + extra) * damageScale
      const minimumRemaining = impact < reply ? actor.maxHp * .38 : 0
      if (maximum < actor.maxHp * (breaksOpening ? .12 : .15) ||
        !watchOpening && !vulnerableTraveler && actor.hp + shieldAtImpact - maximum > minimumRemaining) continue
      const aimAt = (at: EdgePoint) => skill.aim.mode === "point" && edgeDistance(origin, at) > skill.aim.range
        ? inside(along(origin, direction(origin, at), skill.aim.range - 1), 0) : at
      const aim = aimAt(exit)
      if (skillCastProblem(battle, caster, skill, aim)) continue
      const area = previewSkillAreas(battle, caster, skill, aim)[0]
      const hits = area && areaHits(area, exit)
      if (!hits) continue
      const damage = (hit.args[0] + (hits > 1 ? extra : 0)) * damageScale
      if (breaksOpening) return true
      if (vulnerableTraveler) {
        possibleHit = Math.max(possibleHit, damage)
        if (impact < reply) earlyHit = Math.max(earlyHit, damage)
      }
      const priorAim = aimAt(actor)
      const exposedAtStart = !skillCastProblem(battle, caster, skill, priorAim) &&
        previewSkillAreas(battle, caster, skill, priorAim).some(area => areaHits(area, actor))
      if (watchOpening && !exposedAtStart) {
        hostileOpeners.push({ from: enemy, damage, castAt, latest: disengage - (lead + first.delay), lands: impact })
      }
      if (exposedAtStart) continue
      if (actor.hp + shieldAtImpact - damage <= minimumRemaining) return true
    }
    earlyDamage = Math.max(earlyDamage, earlyHit)
    lateDamage = Math.max(lateDamage, possibleHit)
  }
  // A teammate can use the next shared window. Only count a second hit if its
  // own windup still fits before the traveler can move again.
  if (watchOpening && hostileOpeners.some(first => hostileOpeners.some(second => {
    if (first.from === second.from) return false
    const secondCastAt = Math.max(second.castAt, first.castAt + COOLDOWN.shared)
    if (secondCastAt >= second.latest) return false
    const secondImpact = second.lands + secondCastAt - second.castAt
    const firstImpact = Math.min(first.lands, secondImpact)
    const firstDamage = first.lands <= secondImpact ? first.damage : second.damage
    const shield = actor.shieldUntil <= firstImpact ? 0 :
      actor.shieldUntil > Math.max(first.lands, secondImpact) ? actor.shield : Math.min(actor.shield, firstDamage)
    return first.damage + second.damage >= actor.hp + shield - actor.maxHp * .14
  }))) return true
  // The opponent also has one shared cooldown. Treat one fast spell as an
  // interruption risk, rather than combining several simultaneous responses.
  const openingShield = actor.shieldUntil > reply ? actor.shield : 0
  if (vulnerableTraveler && (earlyDamage >= Math.max(actor.maxHp * .20, actor.hp + openingShield - actor.maxHp * .48) ||
    lateDamage >= actor.hp + openingShield)) return true
  if (watchOpening && actor.hp + openingShield < actor.maxHp * .90 &&
    trinityAtPortalExit(battle, actor, entry, exit, arrival, Math.max(start + COOLDOWN.move, actionAt) + .15, ready, enemies)) return true
  if (actor.range < 200 || actor.hp > actor.maxHp * .8) return false
  const threatened = enemies.filter(enemy => enemy.hp && enemy.actionAt <= arrival + 1 && !isOutside(future(battle, enemy, after)) &&
    edgeDistance(exit, future(battle, enemy, after)) <= nearbyThreatRange(battle, enemy, actor))
  if (threatened.length < 2) return false
  return !friends.some(unit => unit.id !== actor.id && unit.hp && (unit.card.job === "tank" || combatHasRole(unit, "paladin")) &&
    !isOutside(future(battle, unit, after)) && edgeDistance(exit, future(battle, unit, after)) <= GUARD_REACH)
}

function trinityAtPortalExit(battle: EdgeBattle, actor: EdgeFighter, entry: EdgePoint, exit: EdgePoint, arrival: number, deadline: number,
  sharedAt: number, enemies: EdgeFighter[]) {
  const now = battle.time
  const stance = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  for (const enemy of enemies) {
    if (!enemy.hp || !combatHasRole(enemy, "berserker")) continue
    const trinity = enemy.actives.find(skill => berserkerChoreography(skill.id)?.motif === "trinity")
    if (!trinity) continue
    const walk = enemy.move && !movementStopped(battle, enemy) ? edgeDistance(enemy, enemy.move) / movementSpeed(battle, enemy) : 0
    const earliest = Math.max(arrival, sharedAt, enemy.actionAt, now + walk,
      enemy.force ? enemy.force.since + enemy.force.duration + SPARRING_STEP : 0)
    const frame = decisionStep()
    const starts = now + Math.ceil((earliest - now) / frame - 1e-6) * frame
    const travel = berserkerChoreography(trinity.id)!.travel!
    const third = starts + trinity.steps[6].delay + travel
    if (starts + travel >= deadline || !targetable(battle, actor, starts)) continue
    const placed = stance(enemy, starts)
    if (isOutside(placed) || edgeDistance(placed, exit) > trinity.aim.range ||
        edgeDistance(placed, entry) <= trinity.aim.range) continue
    const target = { ...actor, ...exit }
    let fighter: EdgeFighter = { ...enemy, ...placed, move: null, force: null }
    const cast = { ...forecastSkillCast(fighter, trinity, target), id: battle.runtime.sequence + 1 }
    const strikes: AnnouncedStrike[] = []
    for (const index of [0, 3, 6]) {
      const dash = trinity.steps[index], slash = trinity.steps[index + 1]
      const impact = starts + travel + dash.delay
      if (impact >= deadline || !targetable(battle, actor, impact) || edgeDistance(fighter, exit) > trinity.aim.range) break
      const land = berserkerMotionEnd(battle, cast, fighter, dash, target)
      if (!land || edgeDistance(land, exit) > trinity.aim.range) break
      const from = fighter
      fighter = { ...fighter, ...land }
      const thirdPush = index === 6 && enemy.passives.find(passive => passive.id === "berserker/Prismatic/P1" &&
        (enemy.passiveAt[passive.id] ?? 0) <= impact && strikes.length === 2)
      const step = thirdPush ? { ...slash, operations: slash.operations.map(op => op.kind === "p"
        ? { ...op, args: [op.args[0] + thirdPush.steps[0].operations[0].args[0]] } : op) } : slash
      const strikeCast = { ...cast, outside: isOutside(land), berserkerRoute: { from, to: land } }
      strikes.push({ at: impact, source: fighter, strike: { cast: strikeCast, step, power: slash.operations[0].args[0], target: actor.id } })
    }
    const standing = (unit: EdgeUnit, at: number) => unit === actor ? (at >= arrival ? exit : entry) : stance(unit, at)
    const after = lifeThroughStrikes(battle, actor, strikes, standing)
    if (!after.hp) return true
    const last = strikes[2]
    const shift = last && announcedShift(battle, last, actor, standing)
    if (!shift) continue
    const delivered = (unit: EdgeUnit, at: number) => unit === actor && at > third
      ? displacementPoint({ from: exit, ...shift, start: third }, at) : standing(unit, at)
    const firstReply = Math.max(starts + COOLDOWN.shared, third)
    const replies = shortAreaThreats(battle, actor, enemies.filter(unit => unit !== enemy), deadline, delivered, firstReply, undefined, true)
    const remaining = Math.min(after.hp, ...replies.map(hit => lifeThroughStrikes(battle, actor, [...strikes, hit], delivered).hp))
    if (!remaining) return true
    if (remaining < actor.maxHp * .18 || isOutside(shift.end) && remaining < actor.maxHp * .34) return true
  }
  return false
}

function nearbyThreatRange(battle: EdgeBattle, enemy: EdgeUnit, actor: EdgeUnit) {
  let reach = attackRange(battle, enemy, actor) + 65
  if (!isFighter(enemy)) return reach
  for (const skill of enemy.actives) {
    if (skill.aim.mode !== "point" && skill.aim.mode !== "enemy" && skill.aim.mode !== "outside" || !Number.isFinite(skill.aim.range)) continue
    const damage = skill.steps.find(step => !step.watch && !step.zone && step.operations.some(op => op.kind === "d"))
    if (!damage) continue
    const extension = damage.selector.shape === "C" && skill.aim.mode === "point" ? Math.min(100, damage.selector.size[0] * .65) : 0
    reach = Math.max(reach, skill.aim.range + extension)
  }
  return reach
}

export function exposesToEdgePush(battle: EdgeBattle, actor: EdgeUnit, landing: EdgePoint, arrival: number) {
  if (!battle.sparring || !isFighter(actor) || actor.hp > actor.maxHp * .76 || actor.range < 200 || borderGap(landing) > 175) return false
  const ally = sideOf(battle, actor.id) === "ally"
  const enemies = ally ? battle.sparring.rivals : battle.team
  return enemies.some(enemy => {
    if (!enemy.hp || enemy.actionAt > arrival + .55 || isOutside(enemy)) return false
    const toward = edgeDistance(landing, enemy)
    if (edgeDistance(actor, enemy) - toward < 60) return false
    return enemy.actives.some(skill => {
      const opening = skill.steps[0]
      return skill.aim.mode === "point" && Number.isFinite(skill.aim.range) && opening?.selector.shape === "C" &&
        toward <= skill.aim.range + opening.selector.size[0] * .8 && opening.operations.some(op => op.kind === "d") &&
        opening.operations.some(op => op.kind === "p" && op.args[0] + 25 >= borderGap(landing))
    })
  })
}

export function approachExposure(battle: EdgeBattle, actor: EdgeUnit, at: EdgePoint, arrival: number) {
  if (!battle.sparring || !isFighter(actor) || actor.range < 200 || actor.hp >= actor.maxHp * .8) return 0
  const ally = sideOf(battle, actor.id) === "ally"
  const enemies = ally ? battle.sparring.rivals : battle.team
  const opponentReady = ally ? battle.sparring.sharedAt : battle.sharedAt
  const shield = actor.shieldUntil > arrival ? actor.shield : 0
  const walk = edgeDistance(actor, at)
  if (walk < 45) return 0
  const exposure = enemies.reduce((risk, enemy) => {
    const ready = Math.max(battle.time, opponentReady, enemy.actionAt)
    const windup = arrival - ready
    if (!enemy.hp || enemy.force || isOutside(enemy) || windup < .35) return risk
    const start = future(battle, enemy, ready - battle.time)
    const oldRange = edgeDistance(start, actor)
    const newRange = edgeDistance(start, at)
    if (oldRange - newRange < 45) return risk
    let damage = 0
    for (const skill of enemy.actives) {
      const delay = fixedSkillWindup(skill)
      const first = skill.steps[0]
      if (delay === undefined || !first || first.zone || first.watch || !first.selector.shape || windup + .26 < delay + first.delay) continue
      const multiplier = first.operations.find(op => op.kind === "d")?.args[0]
      if (!multiplier) continue
      if (skill.aim.mode === "point" && first.selector.shape === "C" && Number.isFinite(skill.aim.range)) {
        const radius = first.selector.size[0]
        if (oldRange <= skill.aim.range + radius || newRange > skill.aim.range + radius * .85) continue
        damage = Math.max(damage, enemy.attack * multiplier * (1 - actor.armor))
      } else if (skill.aim.mode === "direction" && newRange <= first.selector.size[0] && oldRange > first.selector.size[0] &&
        first.selector.shape === "L") {
        const caster = { ...enemy, ...start }
        if (skillCastProblem(battle, caster, skill, at)) continue
        if (previewSkillAreas(battle, caster, skill, at).some(area => areaHits(area, at))) {
          damage = Math.max(damage, enemy.attack * multiplier * (1 - actor.armor))
        }
      }
    }
    return risk + damage
  }, 0)
  // A longer exposed walk also leaves more of the team's movement cooldown
  // spent before the front line can follow or the walker can retreat.
  return Math.max(0, exposure - shield) / actor.hp * Math.max(210, walk * 2)
}
