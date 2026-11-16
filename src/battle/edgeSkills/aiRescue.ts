import { combatHasRole } from "../combatRules"
import { actionProblem, AI_THINK_INTERVAL, COOLDOWN, SPARRING_STEP, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { TeamAttack } from "./ai"
import { dodgeAreaDamage, entryDamageStep, future, shortAreaThreats, walkingPortal, warningContains, warningDamage, warningEscapeDirections } from "./aiMovement"
import { announcedCharges, announcedFieldErasures, announcedHit, announcedShift, announcedStrikes, displacementPoint, entryFieldContacts, immediateCircleWard, lifeThroughStrikes, positionAfterStrike, readyLockStrikes, rescueDeploymentAid, scheduledAid, summonDisruptsCast, type AnnouncedStrike, type ReservoirReplacement, type SummonChange, type TimedAid } from "./aiThreats"
import { BARD_SEAT_TRAVEL, bardChoreography, bardFlight, bardRecipientDelay, bardSeatDelay, overtureLanding, overtureSeats } from "./bardChoreo"
import { bulwarkChoreography } from "./bulwarkChoreo"
import type { EdgeActive } from "./catalog"
import { dancerChoreography, dancerPointAt, REVERSE_PRINT_TRAVEL } from "./dancerChoreo"
import { along, areaHits, areaOf, borderGap, clamp, direction, edgeDistance, inside, isOutside, left, type EdgeArea, type EdgePoint } from "./geometry"
import { healerChoreography, healerFlight } from "./healerChoreo"
import { lifebringerChoreography } from "./lifebringerChoreo"
import { paladinChoreography } from "./paladinChoreo"
import type { Step } from "./program"
import { DEBUFFS, matchesCleanse } from "./roles"
import { attackRange, chronowheelPulses, fixedSkillWindup, forecastDefeatGuard, forecastSkillCast, healFactors, movementStopped, predictSkillTargets, previewSkillDisplacements, reservoirFlight, skillCastProblem, targetable } from "./runtime"
import { spellbreakerChoreography } from "./spellbreakerChoreo"
import { battleUnits, isFighter, sameSide, sideOf, unitOf } from "./state"
import { activeDeployments, createSummonGroup, type SummonGroup } from "./summons"

type RescuePlan = { target?: EdgeFighter; at?: EdgePoint; beats: Map<EdgeFighter, TimedAid[]>;
  position?: (unit: EdgeUnit, time: number) => EdgePoint | undefined; replaces?: SummonGroup; deployment?: SummonChange;
  replacesReservoir?: ReservoirReplacement }

interface RescueThreat {
  unit: EdgeFighter
  contacts: AnnouncedStrike[]
  downAt: number
  predicted: boolean
  replies?: AnnouncedStrike[]
  readyLock?: AnnouncedStrike
}

function healingAt(battle: EdgeBattle, actor: EdgeFighter, target: EdgeUnit, amount: number, at: number): TimedAid {
  const { healingAmp, received, recovery } = healFactors(battle, actor, target, false, at)
  return { at, heal: Math.round(amount * (1 + healingAmp / 100) * (1 + received / 100) * recovery) }
}

export function aidFrom(battle: EdgeBattle, actor: EdgeFighter, target: EdgeUnit, skill: EdgeActive, step: Step, delay: number): TimedAid {
  const percent = step.operations.find(op => op.kind === "h")?.args[0]
  const ward = step.operations.find(op => op.kind === "b" && !op.style)
  const duration = ward?.args[1] ?? (actor.card.rarity === "Radiant" || actor.card.rarity === "Prismatic" ? 12 : 10)
  const guard = step.operations.find(op => op.kind === "guard")
  const at = battle.time + delay
  return {
    ...(percent ? healingAt(battle, actor, target, target.maxHp * percent / 100, at) : { at }),
    shield: Math.round(target.maxHp * (ward?.args[0] ?? 0) / 100),
    shieldUntil: ward && at + duration,
    guard: guard && { percent: guard.args[0], skillOnly: guard.style === "skill" },
    defy: step.operations.some(op => op.kind === "defy")
      ? forecastDefeatGuard(forecastSkillCast(actor, skill, target), target, step, at) : undefined,
  }
}

export function entryWards(battle: EdgeBattle, actor: EdgeFighter, skill: EdgeActive, allies: EdgeFighter[]) {
  const now = battle.time
  const [step] = skill.steps
  const [radius, span = 0] = step.selector.size
  const duration = step.zone!.duration
  const prior = battle.runtime.fields.find(field => field.cast.owner === actor.id && field.cast.skill?.id === skill.id && field.until > now)
  const erasures = announcedFieldErasures(battle, actor, now + 1.2)
  const samples = allies.map(unit => {
    const path: { delay: number; at: EdgePoint }[] = [{ delay: 0, at: unit }]
    if (unit !== actor && (unit.move || unit.force)) {
      for (let frame = 1; frame <= 12; frame++) {
        const delay = frame / 10
        path.push({ delay, at: future(battle, unit, delay) })
      }
    }
    return { unit, path }
  })
  const spots: EdgePoint[] = []
  for (const { path } of samples) for (const index of [0, 5, 12]) {
    const at = path[index]?.at
    if (at && spots.every(point => edgeDistance(point, at) > 18)) spots.push(at)
  }
  const centers = spots.flatMap((at, index) => {
    const lead = direction(actor, at)
    const centers = [at]
    const distance = edgeDistance(actor, at)
    const offset = span / 2
    if (span && distance > offset) {
      // The cast axis and the offset from its midpoint to either lobe are perpendicular.
      const depth = Math.sqrt(distance * distance - offset * offset)
      const nose = along(actor, lead, depth * depth / distance)
      const lateral = depth * offset / distance
      centers.push(along(nose, left(lead), lateral), along(nose, left(lead), -lateral))
    }
    return [...centers, ...spots.slice(index + 1)
      .filter(other => edgeDistance(at, other) <= radius * 2 + span)
      .map(other => ({ x: (at.x + other.x) / 2, y: (at.y + other.y) / 2 }))]
  })
  const aims: EdgePoint[] = []
  for (const center of centers) {
    const clipped = inside(center, 0)
    const at = edgeDistance(actor, clipped) > skill.aim.range
      ? along(actor, direction(actor, clipped), skill.aim.range - 1) : clipped
    if (aims.every(point => edgeDistance(point, at) > 8) && !skillCastProblem(battle, actor, skill, at)) aims.push(at)
  }
  const entries = (area: EdgeArea, until: number, seen?: ReadonlySet<EdgeUnit["id"]>) => {
    const expires = Math.min(until, ...erasures.filter(erase => areaHits(erase.area, area.center)).map(erase => erase.at))
    const beats = new Map<EdgeFighter, TimedAid>()
    for (const { unit, path } of samples) {
      if (seen?.has(unit.id)) continue
      const entry = path.find(({ delay, at }) => now + delay < expires && areaHits(area, at))
      if (entry) beats.set(unit, aidFrom(battle, actor, unit, skill, step, entry.delay))
    }
    return beats
  }
  const current = prior ? entries(prior.area, prior.until, prior.seen) : undefined
  const wards = (at: EdgePoint) => {
    const beats = entries(areaOf(step.selector.shape!, at, direction(actor, at), radius, span), now + duration)
    // Replacing the field also removes any shield that allies were about to collect.
    if (current && [...current].some(([unit, aid]) => (beats.get(unit)?.at ?? Infinity) > aid.at + SPARRING_STEP)) beats.clear()
    return beats
  }
  return { aims, wards, current }
}

export function forecastShieldHandoff(battle: EdgeBattle, actor: EdgeFighter, target: EdgeFighter, skill: EdgeActive) {
  const [step] = skill.steps
  const delay = paladinChoreography(skill.id)!.windup! + step.delay
  const release = battle.time + delay
  const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - battle.time)
  if (target === actor || skillCastProblem(battle, actor, skill, target, target) ||
    edgeDistance(actor, position(target, release)) > skill.aim.range) return
  const before = (unit: EdgeUnit) => lifeThroughStrikes(battle, unit, announcedStrikes(battle, unit, release, position),
    position, [], undefined, release)
  const source = before(actor)
  const patient = before(target)
  if (!source.hp || !patient.hp) return
  const amount = Math.floor(source.shield * step.operations.find(op => op.kind === "conserve")!.args[0] / 100)
  const aid = aidFrom(battle, actor, target, skill, step, delay)
  const transferred = amount > 0 && amount >= patient.shield ? amount : 0
  if (transferred) {
    aid.shield = transferred
    aid.shieldUntil = release + 10
  }
  return { aid, position, patient, debit: { at: release, shieldSpend: transferred } }
}

export function reservoirPlacements(battle: EdgeBattle, actor: EdgeFighter, skill: EdgeActive, allies: EdgeFighter[]) {
  const now = battle.time
  const opens = now + lifebringerChoreography(skill.id)!.windup
  const [field, ...healSteps] = skill.steps
  const [capture, storage, payout] = field.operations[0].args.map(value => value / 100)
  const radius = field.selector.size[0]
  const expires = opens + field.zone!.duration
  const limit = actor.maxHp * storage
  const pulseTimes = healSteps.map(step => opens + step.delay)
  const current = battle.runtime.fields.find(entry => entry.cast.owner === actor.id && entry.cast.skill?.id === skill.id && entry.until > opens)
  const replacesReservoir = current && { cast: current.cast, at: opens }
  const clears = announcedFieldErasures(battle, actor, expires).filter(erase => erase.at > opens)
  const priorFields = battle.runtime.fields.filter(entry => entry.mode === "reservoir" && entry !== current &&
    entry.until > opens && sameSide(battle, actor.id, entry.cast.owner))
  if (!allies.some(unit => unit.hp < unit.maxHp) && !battle.runtime.pending.some(job => job.strike) && !battle.telegraph) return
  const standing = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const casterHits = announcedStrikes(battle, actor, opens, standing)
  if (!lifeThroughStrikes(battle, actor, casterHits, standing).hp ||
    casterHits.some(hit => announcedShift(battle, hit, actor, standing)) ||
    summonDisruptsCast(battle, actor, opens, standing)) return
  const patients = allies.filter(unit => unit.hp).map(unit => {
    const announced = announcedStrikes(battle, unit, now + 3.0, standing)
    const path = positionAfterStrike(battle, unit, announced, standing)?.position ?? standing
    const incoming = announcedStrikes(battle, unit, now + 3.0, path)
    const scheduled = scheduledAid(battle, unit, now + 4, path, undefined, replacesReservoir)
    const pulses = pulseTimes.map((at, index) => aidFrom(battle, actor, unit, skill, healSteps[index], at - now))
    const places = [...pulseTimes, ...scheduled.filter(aid => !aid.noBank && aid.heal > 0 && aid.at >= opens).map(aid => aid.at)].map(at => path(unit, at))
    return { unit, path, incoming, scheduled, pulses, places }
  })
  const spotList: EdgePoint[] = []
  for (const point of patients.flatMap(row => row.places)) {
    if (edgeDistance(actor, point) <= skill.aim.range + radius + 2 &&
      spotList.every(spot => edgeDistance(point, spot) > 16)) spotList.push(point)
  }
  const positions = [...spotList, ...spotList.flatMap((at, index) => spotList.slice(index + 1)
    .filter(other => edgeDistance(at, other) < radius * 2)
    .map(other => ({ x: (at.x + other.x) / 2, y: (at.y + other.y) / 2 })))]
  const aims: EdgePoint[] = []
  for (const point of positions) {
    const clamped = inside(point, 0)
    const at = edgeDistance(actor, clamped) > skill.aim.range
      ? along(actor, direction(actor, clamped), skill.aim.range - 1) : clamped
    if (aims.every(spot => edgeDistance(spot, at) > 11) && !skillCastProblem(battle, actor, skill, at)) aims.push(at)
  }
  let oldRelease = 0
  if (current?.capacity) {
    const horizon = Math.min(current.until, now + 4)
    const injured = patients.map(row => ({ ...row, hp: lifeThroughStrikes(battle, row.unit,
      row.incoming.filter(hit => hit.at <= horizon), row.path, [], undefined, horizon).hp }))
      .filter(row => row.hp && row.hp < row.unit.maxHp).sort((a, b) => a.hp / a.unit.maxHp - b.hp / b.unit.maxHp)[0]
    if (injured) oldRelease = Math.min(current.capacity, injured.unit.maxHp * payout, injured.unit.maxHp - injured.hp) /
      injured.unit.maxHp * 3.1 / (1 + .24 * (current.until - now))
  }
  const trait = actor.passives.find(passive => passive.id === "lifebringer/Prismatic/P3")
  const baseline = new Map(patients.map(({ unit, incoming, path }) =>
    [unit, lifeThroughStrikes(battle, unit, incoming, path, [], undefined, now + 3.0)]))
  return { aims, replacesReservoir, position: (unit: EdgeUnit, at: number) => patients.find(row => row.unit === unit)?.path(unit, at) ?? standing(unit, at),
    evaluate(at: EdgePoint, cutoff = now + 4) {
      const area = areaOf("C", at, direction(actor, at), radius)
      let end = Math.min(expires, ...clears.filter(erase => areaHits(erase.area, at)).map(erase => erase.at))
      const beats = new Map<EdgeFighter, TimedAid[]>()
      let capacity = 0
      let shielded = false
      let value = -oldRelease
      const events = patients.flatMap(patient => [
        ...patient.pulses.filter(aid => aid.at <= cutoff && areaHits(area, patient.path(patient.unit, aid.at)))
          .map(aid => ({ patient, aid, own: true })),
        ...patient.scheduled.filter(aid => !aid.noBank && aid.heal > 0 && aid.at > opens + 1e-6 && aid.at <= cutoff &&
          areaHits(area, patient.path(patient.unit, aid.at))).map(aid => ({ patient, aid, own: false })),
      ]).sort((a, b) => a.aid.at - b.aid.at || Number(a.own) - Number(b.own))
      for (const { patient, aid, own } of events) {
        const { unit, path, incoming } = patient
        if (aid.at >= end) continue
        const prior = beats.get(unit) ?? []
        const life = lifeThroughStrikes(battle, unit, incoming.filter(hit => hit.at < aid.at - SPARRING_STEP), path,
          prior, undefined, aid.at, undefined, replacesReservoir)
        if (!life.hp || aid.below !== undefined && life.hp >= aid.below) continue
        const restore = Math.min(unit.maxHp - life.hp, aid.heal ?? 0)
        if (own) {
          beats.set(unit, [...prior, aid])
          value += restore / unit.maxHp * (life.hp / unit.maxHp < .45 ? 7.8 : 5.2) / (1 + .46 * (aid.at - opens))
        }
        const overflow = (aid.heal ?? 0) - restore
        if (!overflow || priorFields.some(other => other.until > aid.at && areaHits(other.area, path(unit, aid.at)) &&
          !clears.some(erase => erase.at < aid.at && areaHits(erase.area, other.area.center)))) continue
        capacity += overflow * capture
        if (trait && !shielded && (actor.passiveAt[trait.id] ?? 0) <= aid.at) {
          const caster = patients.find(row => row.unit === actor)
          if (caster && lifeThroughStrikes(battle, actor, caster.incoming.filter(hit => hit.at < aid.at), caster.path,
            beats.get(actor), undefined, aid.at, undefined, replacesReservoir).hp > 0) {
            const ward = aidFrom(battle, actor, actor, skill, trait.steps[0], aid.at - now)
            beats.set(actor, [...(beats.get(actor) ?? []), ward])
            shielded = true
            const danger = caster.incoming.some(hit => hit.at > aid.at && hit.at <= aid.at + 1.3)
            if (danger) value += Math.max(0, (ward.shield ?? 0) - (actor.shieldUntil > aid.at ? actor.shield : 0)) / actor.maxHp * 3
          }
        }
        if (capacity >= limit) {
          capacity = limit
          end = aid.at
        }
      }
      if (capacity > 0) {
        const recipient = patients.map(row => {
          const horizon = Math.min(end, cutoff)
          const life = lifeThroughStrikes(battle, row.unit, row.incoming.filter(hit => hit.at <= horizon), row.path,
            beats.get(row.unit), undefined, horizon, undefined, replacesReservoir)
          return { ...row, hp: life.hp }
        }).filter(row => row.hp).sort((a, b) => a.hp / a.unit.maxHp - b.hp / b.unit.maxHp)[0]
        if (recipient && recipient.hp < recipient.unit.maxHp) {
          const arrival = end + reservoirFlight(at, recipient.path(recipient.unit, end))
          const amount = Math.min(capacity, recipient.unit.maxHp * payout)
          const aid = healingAt(battle, actor, recipient.unit, amount, arrival)
          const prior = beats.get(recipient.unit) ?? []
          const life = lifeThroughStrikes(battle, recipient.unit, recipient.incoming.filter(hit => hit.at < arrival), recipient.path,
            prior, undefined, arrival, undefined, replacesReservoir)
          const gain = life.hp > 0 ? Math.min(recipient.unit.maxHp - life.hp, aid.heal ?? 0) : 0
          if (gain > 0 && arrival <= cutoff) beats.set(recipient.unit, [...prior, aid])
          value += gain / recipient.unit.maxHp * (arrival <= cutoff ? 5.1 : 4.0) / (1 + .24 * (arrival - opens))
        }
      }
      for (const { unit, path, incoming } of patients) {
        const effects = beats.get(unit)
        if (!effects && !current) continue
        const before = baseline.get(unit)!
        if (before.hp && !current) continue
        const after = lifeThroughStrikes(battle, unit, incoming, path, effects, undefined, now + 4, undefined, replacesReservoir)
        if (before.hp && !after.hp) return { beats: new Map<EdgeFighter, TimedAid[]>(), value: 0 }
        if (!before.hp && after.hp) value += 2.55 + Math.min(.7, after.hp / unit.maxHp)
        if (current) value -= Math.max(0, before.hp - after.hp) / unit.maxHp * 4.6
      }
      return { beats, value: Math.max(0, value) }
    },
  }
}

function readyOvertureInterruption(battle: EdgeBattle, actor: EdgeFighter, allies: EdgeFighter[], enemies: EdgeUnit[],
  release: number, standing: (unit: EdgeUnit, at: number) => EdgePoint) {
  if (!battle.sparring) return false
  const now = battle.time
  const shared = sideOf(battle, actor.id) === "ally" ? battle.sparring.sharedAt : battle.sharedAt
  if (shared >= release) return false
  const threats = enemies.filter(enemy => isFighter(enemy) && enemy.actionAt < release && enemy.actives.some(active => {
    const step = active.steps[0]
    return step && !step.zone && !step.watch && step.operations.some(op => op.kind === "p" || op.kind === "l")
  }))
  if (!threats.length) return false
  const partners = allies.filter(unit => unit !== actor && unit.hp && edgeDistance(standing(unit, release), actor) < 265)
  const replies = [
    ...shortAreaThreats(battle, actor, threats, release, standing, now, undefined, "short-windup"),
    ...shortAreaThreats(battle, actor, threats, release, standing, now, undefined, true),
    ...(partners.length ? shortAreaThreats(battle, actor, threats, release, standing, now, partners, "short-windup") : []),
  ]
  return replies.some(reply => {
    const shift = announcedShift(battle, reply, actor, standing)
    if (!shift || reply.at + shift.duration < release - SPARRING_STEP) return false
    const hit = announcedHit(battle, reply, actor, actor, standing)
    if (!hit?.lethal && !partners.some(unit => announcedShift(battle, reply, unit, standing) ||
      (announcedHit(battle, reply, unit, standing(unit, reply.at), standing)?.hpLoss ?? 0) >= unit.maxHp * .12)) return false
    const source = unitOf(battle, reply.source.id)
    if (!source) return false
    const incoming = announcedStrikes(battle, source, reply.at, standing)
    return !!lifeThroughStrikes(battle, source, incoming, standing).hp && !incoming.some(contact => {
      const forced = announcedShift(battle, contact, source, standing)
      const starts = reply.strike.cast.issuedAt!
      return forced && contact.at < starts && contact.at + forced.duration >= starts
    })
  })
}

export function overturePlacements(battle: EdgeBattle, actor: EdgeFighter, skill: EdgeActive, allies: EdgeFighter[], enemies: EdgeUnit[]) {
  const now = battle.time
  const release = now + bardChoreography(skill.id)!.windup + SPARRING_STEP
  const until = release + bardSeatDelay(allies.length - 1) + BARD_SEAT_TRAVEL + .6
  const [step] = skill.steps
  const reach = step.operations[0].args[0]
  const standing = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - now)
  const charges = announcedCharges(battle, enemies, until)
  const armed = battle.runtime.fields.some(field => field.mode === "enter" && !sameSide(battle, field.cast.owner, actor.id))
  const contactsBy = (unit: EdgeUnit, at: number, position = standing) => {
    const impacts = announcedStrikes(battle, unit, at, position)
    const entries = armed ? entryFieldContacts(battle, unit, at, position) : []
    return entries.length || charges.length ? [...impacts, ...entries, ...charges.filter(hit => hit.at <= at)].sort((a, b) => a.at - b.at) : impacts
  }
  const opening = contactsBy(actor, release)
  if (!lifeThroughStrikes(battle, actor, opening, standing).hp || opening.some(hit => announcedShift(battle, hit, actor, standing)) ||
    summonDisruptsCast(battle, actor, release, standing) || readyOvertureInterruption(battle, actor, allies, enemies, release, standing)) return
  const forecasts = new Map(allies.filter(unit => unit.hp).map(unit => {
    const incoming = contactsBy(unit, until)
    const known = positionAfterStrike(battle, unit, incoming, standing)
    const path = known?.position ?? standing
    const before = lifeThroughStrikes(battle, unit, contactsBy(unit, until, path), path, [], undefined, until)
    const atRelease = lifeThroughStrikes(battle, unit, contactsBy(unit, release, path), path, [], undefined, release)
    return [unit, { incoming, path, before, atRelease }]
  }))
  const recipients = [...forecasts].filter(([unit, row]) => row.atRelease.hp && !isOutside(row.path(unit, release))).map(([unit]) => unit)
  if (!recipients.length) return
  const warnings = battle.runtime.visuals.filter(warning => warning.phase === "warning" && warning.effect === "damage" &&
    warning.until > release && warning.until <= until && !sameSide(battle, warning.owner, actor.id))
  const friends = recipients.map(unit => forecasts.get(unit)!.path(unit, release))
  const foes = enemies.filter(unit => unit.hp).map(unit => standing(unit, release + BARD_SEAT_TRAVEL))
  const points = [...friends, ...foes]
  for (const [index, unit] of recipients.entries()) {
    const { incoming, path } = forecasts.get(unit)!
    const from = friends[index]
    for (const hit of incoming) if (hit.at > release && "area" in hit.strike && areaHits(hit.strike.area, path(unit, hit.at))) {
      const area = hit.strike.area
      const away = direction(area.center, from)
      for (const axis of [away, left(away), left({ x: -away.x, y: -away.y })]) points.push(along(from, axis, reach * 1.4))
    }
    for (const warning of warnings) if (warningContains(warning, path(unit, warning.until))) {
      for (const axis of warningEscapeDirections(warning.area, from).slice(0, 5)) points.push(along(from, axis, reach * 1.4))
    }
  }
  points.push({ x: friends.reduce((sum, at) => sum + at.x, 0) / friends.length,
    y: friends.reduce((sum, at) => sum + at.y, 0) / friends.length })
  const aims: EdgePoint[] = []
  for (const point of points) {
    const at = inside(point, 0)
    if (aims.every(previous => edgeDistance(at, previous) > 28) && !skillCastProblem(battle, actor, skill, at)) aims.push(at)
  }
  return { aims, evaluate(at: EdgePoint) {
    const seats = overtureSeats(actor, at, recipients, unit => forecasts.get(unit)!.path(unit, release))
    const beats = new Map<EdgeFighter, TimedAid[]>()
    const routes = new Map<EdgeUnit, (unit: EdgeUnit, time: number) => EdgePoint>()
    let value = 0
    let improved = false
    for (const { unit, index, seat } of seats) {
      const { before, path, incoming } = forecasts.get(unit)!
      const start = release + bardSeatDelay(index)
      const previous = incoming.filter(hit => hit.at <= start)
      const from = path(unit, start)
      const lastShift = previous.map(hit => ({ at: hit.at, move: announcedShift(battle, hit, unit, standing) })).findLast(row => row.move)
      if (isOutside(from) || unit.force && unit.force.since + unit.force.duration >= start ||
        lastShift?.move && lastShift.at + lastShift.move.duration >= start ||
        !lifeThroughStrikes(battle, unit, previous, path).hp) continue
      const end = overtureLanding(from, seat, reach)
      const distance = edgeDistance(from, end)
      const settles = start + (distance >= 3 ? BARD_SEAT_TRAVEL + SPARRING_STEP : 0)
      const route = (other: EdgeUnit, time: number) => other !== unit || time <= start || distance < 3 ? path(other, time)
        : displacementPoint({ from, end, start, duration: BARD_SEAT_TRAVEL }, time)
      const contacts = contactsBy(unit, until, route)
      const during = contacts.filter(hit => hit.at > start && hit.at <= settles && announcedShift(battle, hit, unit, route))
      const traveled = during.length ? positionAfterStrike(battle, unit, during, route)?.position : route
      if (!traveled) return
      const ward = aidFrom(battle, actor, unit, skill, step, settles - now)
      const aids = during.length ? [] : [ward]
      const after = lifeThroughStrikes(battle, unit, contactsBy(unit, until, traveled), traveled, aids, undefined, until)
      if (before.hp && !after.hp) return
      if (!after.hp) continue
      if (aids.length) beats.set(unit, aids)
      routes.set(unit, traveled)
      const rescued = !before.hp
      const hpGain = (after.hp - before.hp) / unit.maxHp
      value += hpGain * (hpGain > 0 ? 6.4 : 10.5) + (rescued ? 2.65 : 0)
      improved ||= rescued || hpGain > .045
      for (const warning of warnings) {
        if (contacts.some(hit => Math.abs(hit.at - warning.until) <= 2 * SPARRING_STEP && hit.source.id === warning.owner)) continue
        const original = warningContains(warning, path(unit, warning.until))
        const moved = traveled(unit, warning.until)
        if (original === warningContains(warning, moved)) continue
        const risk = warningDamage(battle, warning, unit, moved) / unit.maxHp
        if (!original && risk * unit.maxHp >= after.hp + (warning.until > settles ? after.shield : unit.shield)) return
        value += (original ? 2.6 : -7) * risk
        improved ||= original && risk > .15
      }
      const ready = Math.max(settles, now + COOLDOWN.shared, unit === actor ? now + unit.actionCooldown : unit.actionAt)
      const stop = traveled(unit, ready)
      const base = path(unit, ready)
      let gap = Infinity, previousGap = Infinity, danger = 0, addedDanger = 0
      for (const enemy of enemies) {
        if (!targetable(battle, enemy, ready)) continue
        const position = standing(enemy, Math.min(ready, until + COOLDOWN.move))
        const range = attackRange(battle, unit, enemy, ready)
        gap = Math.min(gap, edgeDistance(stop, position) - range)
        previousGap = Math.min(previousGap, edgeDistance(base, position) - range)
        if (enemy.actionAt > settles + 1.6 || isOutside(position)) continue
        const threatReach = attackRange(battle, enemy, unit, settles) + 24
        if (edgeDistance(stop, position) < threatReach) danger++
        if (edgeDistance(base, position) < threatReach) addedDanger--
      }
      addedDanger += danger
      if (addedDanger > 0) value -= addedDanger * (after.hp < unit.maxHp * .5 ? 1.15 : .36)
      const shield = Math.max(0, after.shield - before.shield) / unit.maxHp
      if (danger && shield) value += shield * (1.9 + Math.min(2, danger) + 1.5 * (1 - after.hp / unit.maxHp))
      if (previousGap > 4 && gap <= 0 && ready < now + 4.2) {
        value += 1.03 / (1 + .19 * (ready - now))
        improved = true
      } else if (previousGap <= 0 && gap > 18 && ready < now + 3) value -= .8
      else if (unit.range < 200 && gap < 130 && previousGap - gap >= 65 && ready < now + 3.4) value += .3
      if (gap <= 0 && aids.length && ready < settles + 4 && !battle.runtime.buffs.some(buff =>
        buff.cast.owner === actor.id && buff.target === unit.id && buff.kind === "q" && buff.until > ready &&
        buff.cast.skill?.id === skill.id)) value += .31 / (1 + .22 * (ready - now))
      const shelter = !isOutside(stop) && borderGap(stop) > borderGap(base) + 40 && borderGap(base) < 80
      if (shelter && (danger || incoming.some(hit => announcedShift(battle, hit, unit, path)))) value += .28
      if (unit.move && unit !== actor && distance >= 3 && walkingPortal(battle, unit, until) && edgeDistance(path(unit, until), stop) > 80) value -= 1.15
    }
    return { beats, position: (unit: EdgeUnit, time: number) => routes.get(unit)?.(unit, time),
      value: Math.max(0, value - (improved ? .16 : .46)) }
  } }
}

function rescuePlans(battle: EdgeBattle, actor: EdgeFighter, skill: EdgeActive, team: EdgeFighter[], patients: EdgeFighter[]): RescuePlan[] {
  const medic = healerChoreography(skill.id)
  const bard = bardChoreography(skill.id)
  const dance = dancerChoreography(skill.id)
  const life = lifebringerChoreography(skill.id)
  const holy = paladinChoreography(skill.id)
  const [first, second] = skill.steps
  const plan = (target?: EdgeFighter): RescuePlan => ({ target, beats: new Map() })
  const add = (option: RescuePlan, target: EdgeFighter, step: Step, delay: number) => {
    const effects = option.beats.get(target) ?? []
    effects.push(aidFrom(battle, actor, target, skill, step, delay))
    option.beats.set(target, effects)
  }
  if (skill.deployment === "paperPack" || skill.deployment === "bodyguard") {
    if (actor.move || isOutside(actor)) return []
    const kind = skill.deployment
    const removed = activeDeployments(battle).find(({ group }) => group.owner === actor.id)?.group
    return patients.flatMap(target => {
      if (skillCastProblem(battle, actor, skill, target, target)) return []
      const cast = { ...forecastSkillCast(actor, skill, target), id: battle.runtime.sequence + 1, issuedAt: battle.time }
      const added = createSummonGroup(battle.time, cast, actor, kind, skill.name, actor.card.rarity)
      return [{ ...plan(target), replaces: removed, deployment: { added, removed } }]
    })
  }
  if (skill.deployment === "rescue") {
    const current = activeDeployments(battle).find(({ group }) => group.owner === actor.id)?.group
    const position = (unit: EdgeUnit, time: number) => unit === actor ? actor : future(battle, unit, time - battle.time)
    return patients.flatMap(target => {
      if (skillCastProblem(battle, actor, skill, target, target)) return []
      const aid = rescueDeploymentAid(battle, actor, target, battle.time + 1.28, position)
      return aid ? [{ target, beats: new Map([[target, [aid]]]), replaces: current }] : []
    })
  }
  if (medic?.motif === "rally" || medic?.motif === "reverseTriage") {
    const choice = plan()
    const [opening, priority] = predictSkillTargets(battle, actor, skill, actor)
    for (const target of patients) {
      if (opening.targets.includes(target)) add(choice, target, first, medic.windup)
      if (priority.targets.includes(target)) add(choice, target, second, medic.windup + (medic.motif === "rally" ? 0 : .34))
    }
    return [choice]
  }
  if (bard?.motif === "rescueSymphony") {
    const choice = plan()
    const order = [...team].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
    for (const target of patients) {
      const delay = bard.windup + bardRecipientDelay(order.indexOf(target))
      add(choice, target, first, delay)
      if (target.hp / target.maxHp < .45) add(choice, target, second, delay)
    }
    return [choice]
  }
  if (bard?.motif === "overture") {
    const enemies = battleUnits(battle).filter(unit => unit.hp && !sameSide(battle, actor.id, unit.id))
    const options = overturePlacements(battle, actor, skill, team, enemies)
    return options?.aims.flatMap(at => {
      const action = options.evaluate(at)
      return action && patients.some(unit => action.beats.has(unit)) ? [{ at, beats: action.beats, position: action.position }] : []
    }) ?? []
  }
  if (life?.motif === "chronowheel" || life?.motif === "lifebud") {
    const release = battle.time + life.windup
    const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - battle.time)
    if (announcedStrikes(battle, actor, release, position).some(hit => announcedShift(battle, hit, actor, position))) return []
    if (life.motif === "lifebud") return patients.flatMap(target => {
      if (skillCastProblem(battle, actor, skill, target, target) || edgeDistance(actor, position(target, release)) > skill.aim.range) return []
      const choice = plan(target)
      add(choice, target, first, life.windup)
      return [choice]
    })
    const choice = plan()
    for (const target of patients) {
      const { beats } = chronowheelPulses(battle, skill, target)
      choice.beats.set(target, beats.map(({ amount, delay }) => healingAt(battle, actor, target, amount, release + delay)))
    }
    return [choice]
  }
  if (life?.motif === "reservoir") {
    const placements = reservoirPlacements(battle, actor, skill, team)
    return placements?.aims.flatMap(at => {
      const { beats } = placements.evaluate(at, battle.time + 1.85)
      return patients.some(unit => beats.has(unit)) ? [{ at, beats, position: placements.position,
        replacesReservoir: placements.replacesReservoir }] : []
    }) ?? []
  }
  if (dance?.pairedTravel) {
    const now = battle.time
    const tick = (duration: number) => battle.sparring ? Math.ceil(duration / SPARRING_STEP - 1e-6) * SPARRING_STEP : duration
    const launch = now + tick(dance.windup)
    const delay = tick(dance.windup) + tick(dance.pairedTravel)
    const landing = now + delay
    const standing = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
    return team.flatMap(target => {
      if (target === actor || target.move || skillCastProblem(battle, actor, skill, target, target) ||
        !patients.includes(target) && !patients.includes(actor)) return []
      const routes = previewSkillDisplacements(battle, actor, skill, target, target, launch)
      if (routes.length !== 2 || routes.some(route => !route.path)) return []
      const path: NonNullable<RescuePlan["position"]> = (unit, at) => {
        if (at < launch) return
        const route = routes.find(move => move.unit === unit.id)?.path
        if (route) return dancerPointAt(route, (at - launch) / dance.pairedTravel)
      }
      const position = (unit: EdgeUnit, at: number) => path(unit, at) ?? standing(unit, at)
      const choice = { ...plan(target), position: path }
      for (const member of [actor, target]) {
        const contacts = announcedStrikes(battle, member, now + 1.45, position)
        const beforeLanding = contacts.filter(contact => contact.at <= landing)
        if (!lifeThroughStrikes(battle, member, beforeLanding, position).hp ||
          beforeLanding.some(contact => announcedShift(battle, contact, member, position))) return []
        add(choice, member, first, delay)
        if (!lifeThroughStrikes(battle, member, contacts, position, choice.beats.get(member)).hp &&
          lifeThroughStrikes(battle, member, contacts, standing).hp) return []
      }
      return [choice]
    })
  }
  if (dance?.motif === "reversePrint") return patients.flatMap(target => {
    if (target.move || skillCastProblem(battle, actor, skill, target, target)) return []
    const launch = battle.time + dance.windup
    const route = previewSkillDisplacements(battle, actor, skill, target, target, launch)[0]?.path
    const delay = dance.windup + (route ? REVERSE_PRINT_TRAVEL : 0)
    const position = (unit: EdgeUnit, at: number) => unit === actor ? actor : future(battle, unit, at - battle.time)
    const shiftsBefore = (unit: EdgeUnit, by: number, path = position) =>
      announcedStrikes(battle, unit, by, path).some(hit => announcedShift(battle, hit, unit, path))
    if (shiftsBefore(actor, launch) || target !== actor && shiftsBefore(target, launch)) return []
    const choice = plan(target)
    add(choice, target, first, delay)
    if (route) {
      const rewind: NonNullable<RescuePlan["position"]> = (unit, at) => unit === target && at > launch
        ? dancerPointAt(route, clamp((at - launch) / REVERSE_PRINT_TRAVEL, 0, 1)) : undefined
      if (shiftsBefore(target, battle.time + delay, (unit, at) => rewind(unit, at) ?? position(unit, at))) return []
      choice.position = rewind
    }
    return [choice]
  })
  if (bulwarkChoreography(skill.id)?.motif === "bastions" || immediateCircleWard(skill)) {
    const { aims, wards, current } = entryWards(battle, actor, skill, team)
    return aims.flatMap(at => {
      const incoming = wards(at)
      const beats = new Map<EdgeFighter, TimedAid[]>()
      for (const [target, aid] of incoming) {
        if (current?.has(target)) continue
        beats.set(target, [aid])
      }
      return patients.some(unit => beats.has(unit)) ? [{ at, beats }] : []
    })
  }
  const areaWard = spellbreakerChoreography(skill.id)?.motif === "scatterseals" ? second : undefined
  if (medic?.motif === "urgentCorners" || medic?.motif === "sanctuary" || holy?.motif === "dawn" || skill.id === "warden/Prismatic/A1" || areaWard) {
    const windup = medic?.windup ?? holy?.windup ?? fixedSkillWindup(skill)!
    const place = (unit: EdgeUnit) => unit === actor ? actor : future(battle, unit, windup)
    const spots = patients.map(place)
    const aims = spots.flatMap((spot, index) => [spot, ...spots.slice(index + 1)
      .filter(other => edgeDistance(spot, other) <= (areaWard ?? first).selector.size[0] * 2)
      .map(other => ({ x: (spot.x + other.x) / 2, y: (spot.y + other.y) / 2 }))])
    const points: EdgePoint[] = []
    for (const spot of aims) {
      const at = inside(edgeDistance(actor, spot) > skill.aim.range
        ? along(actor, direction(actor, spot), skill.aim.range - 1) : spot, 0)
      if (points.every(point => edgeDistance(point, at) > 6)) points.push(at)
    }
    return points.flatMap(at => {
      if (skillCastProblem(battle, actor, skill, at)) return []
      const choice = { ...plan(), at }
      const steps = predictSkillTargets(battle, actor, skill, at, undefined, new Map(skill.steps.map(step => [step, place])))
      for (const target of areaWard || holy?.motif === "dawn" ? team : patients) {
        if (!areaWard && steps[0].targets.includes(target)) add(choice, target, first, windup)
        if (!second || second.watch || second.zone || !steps[1].targets.includes(target)) continue
        if (medic?.motif === "sanctuary" && !battle.runtime.buffs.some(buff => buff.target === target.id &&
          buff.until > battle.time + windup && DEBUFFS.has(buff.kind) && matchesCleanse(buff.kind, ""))) continue
        add(choice, target, second, windup)
      }
      return [choice]
    })
  }
  if (skill.steps.some(step => step.operations.some(op => op.kind === "split"))) return []
  if (holy?.motif === "handoff") return patients.flatMap(target => {
    const result = forecastShieldHandoff(battle, actor, target, skill)
    if (!result) return []
    const choice = plan(target)
    choice.beats.set(target, [result.aid])
    if (result.debit.shieldSpend) choice.beats.set(actor, [result.debit])
    return [choice]
  })
  const armor = bulwarkChoreography(skill.id)
  const shoreCoda = bard?.motif === "shoreCoda"
  const lifeWard = skill.id.startsWith("lifebringer/") && fixedSkillWindup(skill, true)
  const reflects = spellbreakerChoreography(skill.id)?.motif === "antiphase"
  const personalWard = (armor || reflects || typeof lifeWard === "number" || skill.id === "warden/Prismatic/A3" ||
    skill.id === "paladin/Radiant/A5" || bard?.motif === "shieldRelay") && ["ally", "other"].includes(skill.aim.mode) &&
    first.selector.units === "t" && !first.selector.shape &&
    !first.watch && !first.zone && first.operations.some(op => op.kind === "b" && !op.style) &&
    first.operations.every(op => ["h", "b", "anti", "guard", "regen", "exguard", "returnhp", "reflect"].includes(op.kind))
  const singleHeal = medic && skill.aim.mode === "ally" && first.selector.units === "t" &&
    first.operations.some(op => op.kind === "h" && !op.style)
  if (!shoreCoda && !singleHeal && !personalWard) return []
  return patients.flatMap(target => {
    if (skillCastProblem(battle, actor, skill, target, target)) return []
    const choice = plan(target)
    const windup = (medic?.windup ?? bard?.windup ?? armor?.windup ?? holy?.windup ??
      fixedSkillWindup(skill, true) ?? 0) + first.delay
    const gap = edgeDistance(actor, target === actor ? actor : future(battle, target, windup))
    if ((typeof lifeWard === "number" || reflects) && gap > skill.aim.range) return []
    const arrival = windup + (medic?.delivery ? healerFlight(gap) : bard ? bardFlight(bard.motif, bard.delivery, gap) : 0)
    if (shoreCoda && !isOutside(target === actor ? actor : future(battle, target, arrival))) return []
    add(choice, target, first, arrival)
    return [choice]
  })
}

export function rescueFromAnnouncedStrike(battle: EdgeBattle, team: EdgeFighter[], opponents?: EdgeFighter[], moving?: EdgeFighter,
  nextOrder?: { attack: TeamAttack; afterOpponent: boolean }) {
  const pending = battle.runtime.pending.some(job => job.strike)
  const vulnerable = team.some(unit => unit.hp <= unit.maxHp * .35)
  const fieldCasters = vulnerable ? opponents?.filter(foe => foe.actives.some(entryDamageStep)) ?? [] : []
  const now = battle.time
  const entryHorizon = now + 2 * COOLDOWN.shared
  const warder = vulnerable ? nextOrder?.attack.actor : undefined
  const ward = warder?.actives.find(immediateCircleWard)
  const circles = ward && battle.sparring ? opponents?.filter(foe => foe.hp && foe.actives.some(skill =>
    skill.steps[0]?.selector.shape === "C" && !skill.steps[0].zone && skill.steps[0].operations.some(op => op.kind === "d"))) ?? [] : []
  if (!pending && (!vulnerable || !fieldCasters.length && !circles.length &&
    !opponents?.some(foe => ["assassin", "binder", "spellbreaker"].some(role => combatHasRole(foe, role))))) return
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const threats = team.flatMap((unit): RescueThreat[] => {
    const announced = pending ? announcedStrikes(battle, unit, undefined, position) : []
    const standing = lifeThroughStrikes(battle, unit, announced, position)
    const baseline = [{ unit, contacts: announced, downAt: standing.downAt, predicted: false }]
    if (!standing.hp || !opponents || unit.force) return announced.length ? baseline : []
    if (moving === unit && announced.some(contact => "area" in contact.strike) &&
      (standing.hp <= unit.maxHp * .4 && unit.hp - standing.hp >= unit.maxHp * .16 ||
        standing.hp <= unit.maxHp * .52 && announced.some(contact => announcedShift(battle, contact, unit, position)))) {
      const shifted = positionAfterStrike(battle, unit, announced, position)
      if (shifted) {
        const before = announced.at(-1)!.at
        const replies = shortAreaThreats(battle, unit, opponents, battle.time + 2, shifted.position, before, undefined, true)
          .filter(reply => !lifeThroughStrikes(battle, unit, [...announced, reply], shifted.position).hp)
        if (replies.length) return [{ unit, contacts: announced, downAt: Math.min(...replies.map(reply => reply.at)), predicted: true, replies }]
      }
    }
    // A prospective attack is one possible enemy action. Evaluate it separately
    // from the other ready skills, which compete for the same cooldowns.
    for (const strike of readyLockStrikes(battle, unit, opponents, position)) {
      const contacts = [...announced, strike].sort((a, b) => a.at - b.at)
      const { downAt } = lifeThroughStrikes(battle, unit, contacts, position)
      if (!Number.isFinite(downAt)) continue
      if (isFighter(strike.source) && combatHasRole(strike.source, "spellbreaker") &&
        strike.strike.cast.issuedAt! <= battle.time + COOLDOWN.shared / 2) {
        return [{ unit, contacts: announced, downAt, predicted: true, replies: [strike], readyLock: strike }]
      }
      return [{ unit, contacts, downAt, predicted: true, readyLock: strike }]
    }
    if (fieldCasters.length && unit.hp <= unit.maxHp * .32) {
      // An entry field can hit in the cast frame. Waiting for its visual
      // would miss the last legal chance to ward an exposed teammate.
      const contacts = pending ? announcedStrikes(battle, unit, entryHorizon, position) : announced
      const shifted = positionAfterStrike(battle, unit, contacts, position)
      if (shifted) {
        const replies = shortAreaThreats(battle, unit, fieldCasters, entryHorizon, shifted.position, battle.time, undefined, "entry")
          .filter(reply => reply.zone && !lifeThroughStrikes(battle, unit,
            [...contacts.filter(hit => hit.at <= reply.at), reply], shifted.position).hp)
        if (replies.length) return [{
          unit, contacts, downAt: Math.min(...replies.map(reply => reply.at)), predicted: true, replies,
        }]
      }
    }
    if (circles.length && ward && warder && unit.hp <= unit.maxHp * .32 && !unit.move && !isOutside(unit) &&
      edgeDistance(warder, unit) <= ward.aim.range + ward.steps[0].selector.size[0]) {
      const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
      const earliest = now + (nextOrder?.afterOpponent ? frame : 0)
      const until = now + COOLDOWN.shared + .5
      const contacts = pending ? announcedStrikes(battle, unit, until, position) : announced
      const shifted = positionAfterStrike(battle, unit, contacts, position)
      if (shifted && shifted.last <= now) {
        const clocks = sideOf(battle, unit.id) === "ally" ? battle : battle.sparring!
        const moveAt = Math.max(clocks.moveAt, now + COOLDOWN.shared) + SPARRING_STEP
        // Spending the warder's action now can close both the protective cast
        // and the move before a short warning settles.
        const replies = [
          ...shortAreaThreats(battle, unit, circles, until, position, earliest, undefined, "short-windup"),
          ...shortAreaThreats(battle, unit, circles, until, position, earliest, undefined, "circle-group"),
        ].filter(reply => {
          if (reply.strike.step?.selector.shape !== "C") return false
          const confirmed = contacts.filter(contact => contact.at <= reply.at)
          if (lifeThroughStrikes(battle, unit, [...confirmed, reply], position).hp) return false
          const start = Math.max(moveAt, reply.strike.cast.issuedAt ?? now)
          if (start < reply.at && !movementStopped(battle, unit, start) && dodgeAreaDamage(battle, unit, reply, start)) return false
          const castAt = reply.strike.cast.issuedAt ?? now
          const counters = announcedStrikes(battle, reply.source, castAt, position)
          return !counters.length || lifeThroughStrikes(battle, reply.source, counters, position).hp > 0
        })
        if (replies.length) return [{ unit, contacts, downAt: Math.min(...replies.map(reply => reply.at)), predicted: true, replies }]
      }
    }
    return announced.length ? baseline : []
  })
  const urgent = threats.filter(({ downAt }) => Number.isFinite(downAt))
  if (!urgent.length) return
  const patients = urgent.map(({ unit }) => unit)
  let best: TeamAttack | undefined
  for (const actor of team) {
    if (actionProblem(battle, actor)) continue
    const origin = (unit: EdgeUnit, time: number) => unit === actor ? actor : position(unit, time)
    const casterThreat = threats.find(({ unit }) => unit === actor)
    // A possible shot at the caster is an alternative to targeting its patient.
    const casterContacts = casterThreat?.contacts.filter(contact => contact !== casterThreat.readyLock)
    const recipients = casterThreat && !patients.includes(actor) ? [...patients, actor] : patients
    for (const [index, skill] of actor.actives.entries()) {
      const bastion = bulwarkChoreography(skill.id)?.motif === "bastions"
      const zoneShield = bastion || immediateCircleWard(skill)
      const fullThreats = zoneShield ? new Map(team.map(unit => [unit, announcedStrikes(battle, unit, battle.time + 1.9, origin)])) : undefined
      for (const { target, at, beats, position: movement, replaces, deployment, replacesReservoir } of rescuePlans(battle, actor, skill, team, recipients)) {
        const savedPosition = movement ? (unit: EdgeUnit, time: number) => movement(unit, time) ?? origin(unit, time) : origin
        let value = 0
        // Ready locks from one fighter are alternative targets for its next order.
        const lockSaves = new Map<EdgeUnit["id"], number>()
        for (const { unit, contacts, downAt, predicted, replies, readyLock } of urgent) {
          const effects = beats.get(unit)
          const entry = replies?.every(reply => reply.zone)
          const targetStrike = replies?.every(reply => "target" in reply.strike && reply.strike.range !== undefined)
          if (!effects?.length && (unit !== target || !deployment || predicted && !entry && !targetStrike)) continue
          const shifted = replies && positionAfterStrike(battle, unit, contacts, savedPosition)
          if (replies && !shifted) continue
          const path = shifted ? shifted.position : savedPosition
          const survives = (sequence: AnnouncedStrike[]) =>
            lifeThroughStrikes(battle, unit, sequence, path, effects, replaces, undefined, deployment, replacesReservoir).hp
          if (zoneShield && effects?.some(aid => aid.at > battle.time && contacts.some(contact =>
            contact.at < aid.at && announcedShift(battle, contact, unit, path)))) continue
          if (zoneShield && !survives(fullThreats!.get(unit)!)) continue
          // A foe that is still returning can aim at the new seat once it lands.
          const answers = entry && movement ? shortAreaThreats(battle, unit, fieldCasters, entryHorizon, path, battle.time, undefined, "entry")
            .filter(reply => reply.zone) : replies
          const hp = answers?.length ? Math.min(...answers.map(reply => survives([...contacts.filter(hit => hit.at <= reply.at), reply]))) : survives(contacts)
          const collateral = (replies || zoneShield) && hp > 0 ? threats.reduce((value, other) => {
            const aid = beats.get(other.unit)
            if (!aid?.length || other.unit === unit || Number.isFinite(other.downAt)) return value
            const before = lifeThroughStrikes(battle, other.unit, other.contacts, savedPosition)
            const after = lifeThroughStrikes(battle, other.unit, other.contacts, savedPosition, aid)
            return value + Math.max(0, after.hp - before.hp) / other.unit.maxHp
          }, 0) : 0
          if (hp > 0) {
            // Compare a field's immediate protection against wards that also stop the shot.
            const saved = bastion ? 2.35 + 7.2 * hp / unit.maxHp + Math.min(.65, collateral * 2)
              : (replies ? 4.25 + Math.min(.8, collateral * 2) : predicted ? 3.25 : 4.1) +
                Math.min(1, 1.3 * hp / unit.maxHp) + (isOutside(unit) ? .3 : 0) +
                .2 * (1 - (downAt - battle.time) / 1.3)
            if (readyLock) {
              const attacker = readyLock.source.id
              lockSaves.set(attacker, Math.max(saved, lockSaves.get(attacker) ?? 0))
            } else {
              value += saved
            }
          }
        }
        for (const saved of lockSaves.values()) value += saved
        if (!value || value <= (best?.intent.value ?? 0)) continue
        if (casterContacts?.length && !lifeThroughStrikes(battle, actor, casterContacts, savedPosition, beats.get(actor), replaces, undefined, deployment, replacesReservoir).hp) continue
        if (deployment && replaces?.deployment.kind === "gates" && threats.some(({ unit, contacts, downAt }) => {
          const walk = unit.move
          if (Number.isFinite(downAt) || !walk) return false
          const crossing = walkingPortal(battle, unit, contacts.at(-1)!.at)
          if (crossing?.group !== replaces) return false
          const noGate = (other: EdgeUnit, time: number) => other === unit && time >= crossing.arrival ? walk : savedPosition(other, time)
          return !lifeThroughStrikes(battle, unit, contacts, noGate, [], replaces, undefined, deployment).hp
        })) continue
        if (replaces && threats.some(({ unit, contacts, downAt }) => unit.id === replaces.target && !Number.isFinite(downAt) &&
          !lifeThroughStrikes(battle, unit, contacts, origin, beats.get(unit), replaces, undefined, deployment).hp)) continue
        best = { actor, intent: { order: index ? "skill2" : "skill", target, at: at ?? target ?? actor, value } }
      }
    }
  }
  return best
}
