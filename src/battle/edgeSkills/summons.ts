import type { Rarity } from "@/card/types"

import type { EdgeBattle, EdgeUnit, EdgeUnitId } from "../edgeBattle"
import { FIELD, along, areaOf, clamp, direction, edgeDistance, inside, left, point, rotate, type EdgePoint } from "./geometry"
import type { DeploymentKind } from "./program"
import { createUnit, sameSide, unitOf, type SkillCast } from "./state"
import { SUMMON_PLANS, type SummonAction, type SummonForm, type SummonMotion, type SummonPlan } from "./summonPlans"

export interface SummonBody extends EdgeUnit {
  slot: number
  form: SummonForm
  origin: EdgePoint
  facing: EdgePoint
  phase: "out" | "back" | "landed"
  actionsAt: number[]
  pulseAt?: number
  trail?: readonly EdgePoint[]
  movingAt?: number
  destroyedAt?: number
}

interface Deployment {
  kind: DeploymentKind
  cast: SkillCast
  bodies: SummonBody[]
}

export interface SummonGroup {
  id: number
  owner: EdgeUnitId
  target?: EdgeUnitId
  name: string
  rarity: Rarity
  from: EdgePoint
  aim: EdgePoint
  axis: EdgePoint
  start: number
  until: number
  dismissedAt?: number
  deployment: Deployment
}

export const SUMMON_DISMISS_TIME = .36

export function dismissSummon(group: SummonGroup, time: number) {
  if (group.dismissedAt !== undefined) return
  group.dismissedAt = time
  group.until = time + SUMMON_DISMISS_TIME
}

function formationOffsets(plan: SummonPlan, axis: EdgePoint): EdgePoint[] {
  const formation = plan.formation
  if (!formation) return [{ x: 0, y: 0 }]
  const side = left(axis)
  const angles = formation.forms.length === 2 ? [0, 180] : [0, 120, 240]
  return angles.map((angle) => along({ x: 0, y: 0 }, rotate(side, angle), formation.spacing))
}

export function summonSpawns(kind: DeploymentKind, from: EdgePoint, aim: EdgePoint) {
  const plan = SUMMON_PLANS[kind]
  const axis = direction(from, aim)
  if (plan.motion?.kind === "orbit") {
    const radius = plan.motion.radius
    return [along(inside(aim, radius + 14), axis, -radius)]
  }
  const offsets = formationOffsets(plan, axis)
  const margin = plan.gate?.radius ?? 14
  const base = plan.spawn === "caster"
    ? along(from, plan.motion?.kind === "follow" ? left(axis) : axis, plan.motion?.kind === "follow" ? 47 : 24)
    : along(aim, left(axis), plan.offset ?? 0)
  const center = {
    x: clamp(base.x, FIELD.left + margin - Math.min(...offsets.map(({ x }) => x)), FIELD.right - margin - Math.max(...offsets.map(({ x }) => x))),
    y: clamp(base.y, FIELD.top + margin - Math.min(...offsets.map(({ y }) => y)), FIELD.bottom - margin - Math.max(...offsets.map(({ y }) => y))),
  }
  return offsets.map(({ x, y }) => ({ x: center.x + x, y: center.y + y }))
}

export function summonPlacementAreas(kind: DeploymentKind, from: EdgePoint, aim: EdgePoint) {
  const plan = SUMMON_PLANS[kind]
  const spawns = summonSpawns(kind, from, aim)
  const [first, second] = spawns
  const axis = direction(from, aim)
  const motion = plan.motion
  const radius = plan.gate?.radius ?? plan.terrain?.radius ?? 31
  const areas = spawns.map((at) => areaOf("C", at, axis, radius))
  const link = plan.actions?.find((action) => action.at === "link")
  if (second && (link || plan.guard?.type === "line")) {
    const width = link?.step.selector.size[1] ?? (plan.guard?.reach ?? 32) * 2
    areas.push(areaOf("L", first, direction(first, second), edgeDistance(first, second), width))
  }
  if (motion?.kind === "orbit") {
    const center = inside(aim, motion.radius + 14)
    areas.push(areaOf("N", center, axis, motion.radius + 4, 8))
  }
  if (motion?.kind === "patrol" || motion?.kind === "outBack" || motion?.kind === "leap") {
    const end = inside(motion.reach ? along(from, axis, motion.reach) : aim)
    areas.push(areaOf("L", first, direction(first, end), edgeDistance(first, end), 26))
  }
  if (!motion || motion.kind === "leap") for (const action of plan.actions ?? []) {
    if (action.at === "link" || action.reaction) continue
    const { shape, size: [a, b, c] } = action.step.selector
    const origin = motion?.kind === "leap" ? inside(aim) : spawns[action.slot ?? 0]
    if (action.at === "ownerLine") areas.push(areaOf("L", first, direction(first, from), Math.min(a, edgeDistance(first, from)), b))
    else if (shape) areas.push(areaOf(shape, origin, axis, a, b, c))
  }
  if (plan.aura) areas.push(areaOf("C", motion?.kind === "leap" ? inside(aim) : first, axis, plan.aura.radius))
  return areas
}

export function createSummonGroup(time: number, cast: SkillCast, owner: EdgeUnit, kind: DeploymentKind, name: string, rarity: Rarity): SummonGroup {
  const plan = SUMMON_PLANS[kind]
  const facing = direction(cast.from, cast.aim)
  const bodies = summonSpawns(kind, cast.from, cast.aim).map((at, slot): SummonBody => ({
    ...createUnit(`summon-${cast.id}-${slot}`, at, Math.max(1, Math.round(owner.maxHp * plan.health)),
      owner.attack, 0, 0, plan.motion && "speed" in plan.motion ? plan.motion.speed : 0, 0),
    form: plan.formation?.forms[slot] ?? plan.form, origin: at, facing, slot,
    phase: plan.motion?.kind === "leap" || plan.motion?.kind === "outBack" ? "out" : "landed",
    actionsAt: (plan.actions ?? []).map((action) => time + (action.delay ?? 0)),
  }))
  return {
    id: cast.id, owner: owner.id, target: cast.target, name, rarity, from: cast.from, aim: cast.aim, axis: facing,
    start: time, until: time + plan.duration + SUMMON_DISMISS_TIME, deployment: { kind, cast, bodies },
  }
}

export function deploySummon(battle: EdgeBattle, cast: SkillCast, owner: EdgeUnit, kind: DeploymentKind, name: string, rarity: Rarity) {
  for (const prior of battle.runtime.summons) {
    if (prior.owner !== owner.id || prior.dismissedAt !== undefined || prior.until <= battle.time) continue
    dismissSummon(prior, battle.time)
  }
  const group = createSummonGroup(battle.time, cast, owner, kind, name, rarity)
  cast.summon = group
  battle.runtime.summons.push(group)
  return group
}

export function activeDeployments(battle: EdgeBattle) {
  return battle.runtime.summons.flatMap((group) => group.dismissedAt === undefined && group.until - SUMMON_DISMISS_TIME > battle.time
    ? [{ group, deployment: group.deployment, plan: SUMMON_PLANS[group.deployment.kind] }] : [])
}

export const deployedUnits = (battle: EdgeBattle) => activeDeployments(battle).flatMap(({ deployment }) => deployment.bodies.filter((body) => body.hp))

export function markSummonDestroyed(battle: EdgeBattle, unit: EdgeUnit) {
  for (const group of battle.runtime.summons) {
    const body = group.deployment.bodies.find((body) => body.id === unit.id)
    if (!body || body.destroyedAt !== undefined) continue
    body.destroyedAt = battle.time
    return { group, body, plan: SUMMON_PLANS[group.deployment.kind] }
  }
}

export function summonPatrolPosition(origin: EdgePoint, end: EdgePoint, speed: number, age: number, leap = false) {
  const distance = edgeDistance(origin, end)
  const duration = Math.max(.22, distance / speed)
  const progress = leap ? Math.min(age / duration, 1) : age / duration % 2
  const outbound = progress < 1
  return { at: along(origin, direction(origin, end), distance * (outbound ? progress : 2 - progress)), outbound }
}

export function summonRoutePosition(group: SummonGroup, body: SummonBody, motion: SummonMotion, time: number) {
  const age = time - group.start
  if (motion.kind === "orbit") return {
    at: along(inside(group.aim, motion.radius + 14), rotate(group.axis, 180 + age * 360 / motion.seconds), motion.radius),
    phase: body.phase,
  }
  if (motion.kind === "follow" || motion.kind === "chase") return
  const end = inside("reach" in motion && motion.reach ? along(group.from, group.axis, motion.reach) : group.aim)
  const { at, outbound } = summonPatrolPosition(body.origin, end, motion.speed, age, motion.kind === "leap")
  const phase = outbound ? "out" : motion.kind === "leap" ? "landed" : "back"
  return { at, phase } as const
}

export function summonChaseStep(from: EdgePoint, target: EdgePoint, motion: { speed: number; gap: number }, dt: number) {
  const facing = direction(from, target)
  const perch = inside(along(target, facing, -Math.min(motion.gap, edgeDistance(from, target))))
  return along(from, direction(from, perch), Math.min(edgeDistance(from, perch), motion.speed * dt))
}

export function summonFollowStep(group: SummonGroup, slot: number, from: EdgePoint, target: EdgePoint,
  motion: { speed: number; gap: number }, dt: number) {
  const plan = SUMMON_PLANS[group.deployment.kind]
  const perch = plan.formation ? summonSpawns(group.deployment.kind, group.from, target)[slot]
    : along(target, left(group.axis), motion.gap)
  const end = inside(perch)
  return along(from, direction(from, end), Math.min(edgeDistance(from, end), motion.speed * dt))
}

export function moveSummonBody(battle: EdgeBattle, group: SummonGroup, body: SummonBody, dt: number) {
  const plan = SUMMON_PLANS[group.deployment.kind]
  const motion = plan.motion
  if (!motion) return
  let next: EdgePoint
  if (motion.kind === "follow" || motion.kind === "chase") {
    const target = unitOf(battle, group.target)
    if (!target?.hp) return
    next = motion.kind === "chase" ? summonChaseStep(body, target, motion, dt)
      : summonFollowStep(group, body.slot, body, target, motion, dt)
  } else {
    const route = summonRoutePosition(group, body, motion, battle.time)!
    body.phase = route.phase
    next = route.at
  }
  if (edgeDistance(body, next) <= .001) return
  const tail = body.trail?.at(-1)
  if (!tail || edgeDistance(tail, body) >= 13) body.trail = [...(body.trail ?? []).slice(-4), point(body)]
  body.movingAt = battle.time
  body.facing = direction(body, next)
  Object.assign(body, next)
}

export function summonLink(bodies: readonly SummonBody[], width: number) {
  const [first, second] = bodies
  return first?.hp && second?.hp ? areaOf("L", first, direction(first, second), edgeDistance(first, second), width) : undefined
}

export function summonActionArea(battle: EdgeBattle, group: SummonGroup, body: SummonBody, action: SummonAction) {
  const { shape, size: [a, b, c] } = action.step.selector
  if (action.at === "link") return summonLink(group.deployment.bodies, b)
  if (action.at === "ownerLine") {
    const owner = unitOf(battle, group.owner)
    if (owner) return areaOf("L", body, direction(body, owner), Math.min(edgeDistance(body, owner), a), b)
  }
  return shape && areaOf(shape, body, body.facing, a, b, c) || undefined
}

export function summonTerrainInPath(battle: EdgeBattle, from: EdgeUnit, to: EdgePoint, includePatrols = true) {
  const axis = direction(from, to)
  const reach = edgeDistance(from, to)
  let closest: { body: SummonBody; group: SummonGroup; travel: number; cooldown: number } | undefined
  for (const { group, deployment, plan } of activeDeployments(battle)) {
    const { terrain } = plan
    if (!terrain || !includePatrols && plan.motion?.kind === "patrol" || sameSide(battle, group.owner, from.id)) continue
    const { radius, type, cooldown = 0 } = terrain
    for (const body of deployment.bodies) {
      if (!body.hp || body.actionAt > battle.time) continue
      const x = body.x - from.x
      const y = body.y - from.y
      const forward = x * axis.x + y * axis.y
      const across = x * axis.y - y * axis.x
      if (Math.abs(across) >= radius) continue
      const span = Math.sqrt(radius ** 2 - across ** 2)
      if (type === "block" ? forward <= 0 : edgeDistance(from, body) > radius || edgeDistance(to, body) <= radius) continue
      const travel = Math.max(0, type === "block" ? forward - span : forward + span)
      if (travel < reach && (!closest || travel < closest.travel)) closest = { body, group, travel, cooldown }
    }
  }
  return closest && { ...closest, at: along(from, axis, Math.max(0, closest.travel - 1)) }
}

export const portalExit = (entry: EdgePoint, other: EdgePoint, radius: number) =>
  inside(along(other, direction(entry, other), radius + 9))

export function portalRoute(battle: EdgeBattle, at: EdgePoint, actor?: EdgeUnitId, arrival = battle.time) {
  for (const { group, deployment, plan } of activeDeployments(battle)) {
    if (!plan.gate || arrival >= group.start + plan.duration || actor !== undefined && !sameSide(battle, group.owner, actor)) continue
    const [first, second] = deployment.bodies
    if (!first.hp || !second.hp || first.actionAt > arrival) continue
    const entry = edgeDistance(first, at) <= plan.gate.radius ? first : second
    if (edgeDistance(entry, at) > plan.gate.radius) continue
    const other = entry === first ? second : first
    const out = portalExit(entry, other, plan.gate.radius)
    return { group, entry, other, out, cooldown: plan.gate.cooldown }
  }
}

export function pruneSummons(battle: EdgeBattle) {
  const { runtime, time } = battle
  runtime.summons = runtime.summons.filter((group) => {
    if (group.until > time) return true
    for (const body of group.deployment.bodies) runtime.histories.delete(body.id)
    return false
  })
}

export function tickSummons(battle: EdgeBattle, finish: (cast: SkillCast) => void) {
  for (const group of battle.runtime.summons) {
    if (group.dismissedAt !== undefined) continue
    if (battle.time < group.until - SUMMON_DISMISS_TIME && group.deployment.bodies.some((body) => body.hp)) continue
    dismissSummon(group, battle.time)
    finish(group.deployment.cast)
  }
  pruneSummons(battle)
}

