import type { Job, Rarity } from "@/card/types"
import { SUBJOBS } from "@/card/jobs"
import { armorForDef, bounded, combatGrowth, composeAttributes, GROWTH, type CombatGrowth } from "@/card/cultivation"
import { growthCanCleanseMove, growthCast, growthMove, tickGrowth } from "./growthRuntime"
import { seededRandom, type GrowthCommand } from "./cultivationReplay"
import { combatVersionOf, commonSkills, FOUR_JOB_COMBAT, type CombatVersion } from "@/card/combatRules"
import { combatHasRole, kitRangeBonus } from "./combatRules"

import { createBattleCard, type BattleCard } from "./types"
import { answerRefreshingStrike, answerShieldExchange, attackBetweenShields, basicCanFinish, chooseAiAttack, clearReturnLane, followDuelHit, followUpApproach, interruptsLineAfterAdvance, pressAnOpening, pressureShieldFromAnAngle, projectedBasic, pursueDuelFinish, redirectShieldedAttack, replyAfterDodge, spectrumAdvanceScoring, waitForClearFinish, worthTradingForLine, type AiAttack, type TeamAttack } from "./edgeSkills/ai"
import { approachExposure, assistedLeap, availablePortalExit, bestPortalAdvance, bulwarkEscort, canReturnFromShieldedShove, clearShore, committedReturn, danceRailMove, defensiveThreat, delayCrowdedReturns, dodgeAreaDamage, dodgeBeforeNextThink, dodgeClosingField, dodgeEdgeShove, dodgePortalFollowUp, dodgeReturnStrike, duelFootwork, escapeToEntryWard, escapeToGuard, exposesToEdgePush, followUpRisk, future, hasLineCounterToCharge, imminentLineFinish, islandReturnCover, leaveConcentratedFire, leaveFiringLane, leaveLethalAreaReach, leaveLethalTargetRange, lethalClosingFieldOnPath, portalExitIsExposed, portalOpeningValue, reserveMoveForCircle, retreatFromDive, returnAroundShore, returnCounterRisk, sharedDodgeWindow, sharedLineExposure, shoreBeastStrikeValue, shoreThreats, sidestepBeforeEdgeLine, spreadFromEdgePush, teamAdvanceScoring, waitForAreaBeforeAdvance, walkAt, walkHitsWarning, walksIntoAnnouncedArea, walksIntoLethalReach, walksIntoReadyFinish, walksIntoShoreBeast, walksIntoWarning, walkTriggersLethalMark, warningContains, warningDamage, warningEscapeDirections, type AdvancePath, type AreaDodge } from "./edgeSkills/aiMovement"
import { rescueFromAnnouncedStrike } from "./edgeSkills/aiRescue"
import { aidBeforeHit, announcedHit, announcedShift, announcedStrikes, lifeThroughStrikes, rescuePulse, roadBeastRisk, roadBeastThreats, runnerBreakValue, runnerContact, wardsAlongPath } from "./edgeSkills/aiThreats"
import { ensembleBodyValue, mirrorThreatValue, paperBodyValue } from "./edgeSkills/aiTactics"
import { SUMMON_PLANS } from "./edgeSkills/summonPlans"
import { edgeJobOf, poolForCard, readLoadout, type EdgeActive, type EdgeGold, type EdgeInputCard, type EdgePassive, type EdgePool } from "./edgeSkills/catalog"
import { dancerPath, dancerPointAt, dancerRailContains, type DancerPath } from "./edgeSkills/dancerChoreo"
import { BOARD, FIELD, GRID_STEP, along, areaHits, clamp, direction, edgeDistance, inside, isOnBoard, isOutside, mirror, point, rotate, type EdgePoint } from "./edgeSkills/geometry"
import { BULWARK_COVER, WARDEN_CONTROL, damageScore, exposedBackline } from "./edgeSkills/roles"
import {
  BASIC_PUSH, attackRange, basicAttack, basicTarget, beforeBossCharge, binderWalkCrossing, bossTarget, castSkill, consumeTaunt, cue, damageUnit, dancerHop, dancerMovesBySkill, dancerWalkCrossing, emit,
  estimateDirectHit, finishEdgeBattle, finishForcedMovement, finishMovement, firstCrossing, fixedSkillWindup, forceTo, glideField, history, markWardenOrder, moveRecovery, movementAllowance, movementSpeed, movementStopped,
  newCast, positionUnit, previewBasicShove, previewDirectedShove, releaseBinderTether, shoveUnit,
  skillCastProblem, skillTravelEnd, startMovement, stopAtSummonTerrain, stopAtWardenGate, takePortal, targetable, tetherLanding, tickSkills,
} from "./edgeSkills/runtime"
import { alliesOf, battleUnits, blockedBasicWindow, createRuntime, createUnit, isFighter, isSummonId, sameSide, sideOf, unitOf, type EdgeSide, type SkillCast, type SkillEvent, type SkillRuntime } from "./edgeSkills/state"
import { activeDeployments, deployedUnits, pruneSummons, summonTerrainInPath, type SummonGroup } from "./edgeSkills/summons"

export { BOARD, FIELD, GRID_STEP, edgeDistance, isOutside }
export { EXILE } from "./edgeSkills/runtime"
export type { EdgePoint }
export const EDGE_LIMIT = 3
export const SPARRING_LIMIT = 4
export const SPARRING_DURATION = 300
export const SPARRING_STEP = 1 / 60
export const AI_THINK_INTERVAL = .22
export const BOSS_SPAWN = { x: BOARD.width / 2, y: FIELD.top + 144 }
export const CHARGE = { reach: 325, halfWidth: 48, windup: 3, push: 218, power: 1.48 }
export const COOLDOWN = { shared: 0.9, move: 2.6 }
export const FX_TIME = 0.86

export const MOVE_REACH = 190
const EDGE_RARITY_BASE: Record<Rarity, number> = {
  C: 760, UC: 779, R: 798, E: 818, L: 838, Radiant: 859, Prismatic: 960,
}
const EDGE_CONSTELLATION_BONUS = .03
const PRISMATIC_HP_SCALE = .94
const PALADIN_HP_SCALE = .90
const ROLES = {
  tank: { range: 116, speed: 161, actionCooldown: 7.5, power: 0.17 },
  warrior: { range: 158, speed: 196, actionCooldown: 5, power: 0.13 },
  mage: { range: 258, speed: 179, actionCooldown: 5.5, power: 0.105 },
  support: { range: 208, speed: 185, actionCooldown: 6, power: 0.09 },
} satisfies Record<Job, { range: number; speed: number; actionCooldown: number; power: number }>
const ACTION_COOLDOWNS: Partial<Record<keyof typeof SUBJOBS, number>> = {
  warden: WARDEN_CONTROL.cooldown,
  dancer: 4.5,
  bard: 4.8,
}

export type EdgeUnitId = number | "boss" | `dummy-${number}` | `summon-${number}-${number}`

export interface EdgeCue {
  id: number
  kind: "melee" | "shot" | "skill" | "charge" | "shield" | "heal" | "move" | "exit" | "return"
  actor: EdgeUnitId
  from: EdgePoint
  to: EdgePoint
  time: number
}

export interface EdgeImpact {
  id: number
  target: EdgeUnitId
  from: EdgePoint
  at: EdgePoint
  amount: number
  kind: "hit" | "heal" | "shield" | "block"
  critical?: boolean
  time: number
}

export interface EdgeUnit extends EdgePoint {
  id: EdgeUnitId
  hp: number
  maxHp: number
  attack: number
  armor: number
  range: number
  speed: number
  actionCooldown: number
  actionAt: number
  move: EdgePoint | null
  force: { start: EdgePoint; end: EdgePoint; since: number; duration: number; cause?: SkillCast; completed?: boolean; kind?: "push" | "pull"; route?: DancerPath } | null
  guardUntil: number
  shield: number
  shieldStart?: number
  shieldHalf?: boolean
  shieldUntil: number
  once: Set<string>
  telegraph?: Telegraph | null
}

export interface EdgeFighter extends EdgeUnit {
  combatVersion: CombatVersion
  legacySubjobId?: keyof typeof SUBJOBS
  growth?: CombatGrowth
  card: BattleCard
  pool: EdgePool
  actives: [EdgeActive, EdgeActive]
  passives: [EdgePassive, EdgePassive]
  gold: EdgeGold | null
  passiveAt: Record<string, number>
}

interface EdgeCooldowns {
  moveAt: number
  sharedAt: number
}

type EdgeBoss = EdgeUnit & EdgeCooldowns & { lastOrder?: "basic" | "charge" }

interface Telegraph {
  from: EdgePoint
  to: EdgePoint
  direction: EdgePoint
  until: number
}

export interface EdgeActionLog {
  time: number
  side: EdgeSide
  actorId: number
  actor: string
  name: string
}

export interface EdgeBattle extends EdgeCooldowns {
  commands?: GrowthCommand[]
  pveLimit?: number
  phase: "ready" | "running" | "paused" | "won" | "lost" | "draw"
  random: () => number
  time: number
  finishedAt: number | null
  team: EdgeFighter[]
  boss: EdgeBoss
  sparring?: EdgeCooldowns & { rivals: EdgeFighter[]; first: EdgeSide; actions: EdgeActionLog[] }
  nextThinkAt: number
  preview?: { targets: EdgeUnit[]; onEvent?: (event: SkillEvent) => void; loadoutFor?: EdgeUnitId; passiveOnly?: string }
  onSkillEvent?: (event: Readonly<SkillEvent>) => void
  telegraph: Telegraph | null
  cues: EdgeCue[]
  impacts: EdgeImpact[]
  nextFx: number
  notice: { text: string; until: number } | null
  runtime: SkillRuntime
}

export type SkillOrder = "skill" | "skill2"
export type EdgeOrder = "basic" | SkillOrder
type Preview = { error: string } | { end: EdgePoint | null; side?: EdgePoint }

function createFighters(lineup: readonly EdgeInputCard[], limit: number, side: EdgeSide, sparring: boolean) {
  const chosen = lineup.slice(0, limit)
  return chosen.map((input, index): EdgeFighter => {
    const { face, cardId } = input
    const combatVersion = combatVersionOf(input)
    const modern = combatVersion === "four-v2"
    const uid = sparring ? index + 1 + (side === "enemy" ? limit : 0) : input.uid
    const card = createBattleCard({ ...face, cultivation: undefined }, uid, cardId, {
      subjob: modern ? FOUR_JOB_COMBAT[face.job].template : input.edgeSubjob ? SUBJOBS[edgeJobOf(input)] : undefined,
      skills: modern ? commonSkills(face.job) : undefined,
      rarityBase: EDGE_RARITY_BASE[face.rarity],
      constellationBonus: EDGE_CONSTELLATION_BONUS,
    })
    if (!face.isHero && face.rarity === "Prismatic") {
      card.stats.hp = card.stats.hpMax = Math.round(card.stats.hpMax * PRISMATIC_HP_SCALE)
    }
    if (!modern && card.subjob.id === "paladin") {
      card.stats.hp = card.stats.hpMax = Math.round(card.stats.hpMax * PALADIN_HP_SCALE)
    }
    const composed = composeAttributes({ atk: card.stats.atk, def: card.stats.def, hp: card.stats.hpMax, int: card.stats.int }, face.cultivation?.mods ?? [])
    Object.assign(card.stats, { atk: composed.atk, def: composed.def, int: composed.int, hp: composed.hp, hpMax: composed.hp })
    card.face = face
    const pool = poolForCard(input)
    const picked = readLoadout(input, pool)
    const role = modern ? FOUR_JOB_COMBAT[card.job] : ROLES[card.job]
    const kit = { actives: [pool.active[picked.active[0]], pool.active[picked.active[1]]] as [EdgeActive, EdgeActive],
      passives: [pool.passive[picked.passive[0]], pool.passive[picked.passive[1]]] as [EdgePassive, EdgePassive],
      gold: picked.gold === null ? null : pool.gold[picked.gold] }
    const growth = combatGrowth(face.rarity, face.constellation, face.cultivation)
    card.stats.crit = bounded(card.stats.crit + growth.crit, 0, GROWTH.critCap)
    card.stats.critDamage = bounded(card.stats.critDamage + growth.critDamage, 1, GROWTH.critDamageCap)
    const actionCooldown = (modern ? role.actionCooldown : ACTION_COOLDOWNS[card.subjob.id] ?? role.actionCooldown) / (1 + growth.action)
    const range = modern ? role.range + kitRangeBonus(card.job, kit) : card.subjob.id === "ranger" ? 274 : role.range
    const attackStat = card.job === "mage" || card.job === "support" ? card.stats.int : card.stats.atk
    const attack = Math.max(1, Math.round(attackStat * role.power))
    const armor = armorForDef(card.stats.def)
    const at = {
      x: BOARD.width / 2 + (index - (chosen.length - 1) / 2) * (sparring ? 160 : 128),
      y: FIELD.bottom - (card.job === "tank" ? 144 : 104),
    }
    return {
      ...createUnit(uid, side === "enemy" ? mirror(at) : at, card.stats.hpMax, attack, armor, range, role.speed * (1 + growth.movement), actionCooldown),
      growth, combatVersion, legacySubjobId: edgeJobOf(input),
      card, pool, ...kit, passiveAt: {},
    }
  })
}

export function createEdgeBattle(lineup: readonly EdgeInputCard[], rivals?: readonly EdgeInputCard[], random = lineup[0]?.cultivationRun ? seededRandom(lineup[0].cultivationRun.seed) : Math.random): EdgeBattle {
  const team = createFighters(lineup, rivals ? SPARRING_LIMIT : EDGE_LIMIT, "ally", !!rivals)
  // Rewarded PvE uses a fixed level-one encounter reference. Growth must not buff the boss.
  const encounter = !rivals && lineup[0]?.cultivationRun ? createFighters(lineup.map(input => ({ ...input,
    face: { ...input.face, level: 1, constellation: 0, cultivation: undefined },
  })), EDGE_LIMIT, "ally", false) : team
  const totalAttack = encounter.reduce((sum, member) => sum + member.attack, 0)
  const averageHp = encounter.reduce((sum, member) => sum + member.maxHp, 0) / Math.max(1, encounter.length)
  const weakestHp = Math.min(...encounter.map((member) => member.maxHp))
  const hp = Math.max(275, Math.round(team.length * 310 + totalAttack * 3))
  const attack = Math.max(24, Math.round(Math.min(averageHp * 0.095, weakestHp * 0.17)))
  const boss = { ...createUnit("boss", BOSS_SPAWN, hp, attack, 0.08, 116, 94, 6), hp: rivals ? 0 : hp, moveAt: 0, sharedAt: 0 }
  const sparring = rivals ? {
    rivals: createFighters(rivals, SPARRING_LIMIT, "enemy", true), first: "ally" as const, actions: [],
    sharedAt: 0, moveAt: 0,
  } : undefined
  return { commands: lineup[0]?.cultivationRun && !rivals ? [] : undefined,
    pveLimit: lineup[0]?.cultivationRun && !rivals ? GROWTH.pveSeconds : undefined,
    phase: "ready", random, time: 0, finishedAt: null, team, boss, sparring, nextThinkAt: 0, sharedAt: 0, moveAt: 0,
    telegraph: null, cues: [], impacts: [], nextFx: 0, notice: null, runtime: createRuntime() }
}

function snapshotFighter(fighter: EdgeFighter) {
  return { ...fighter, passiveAt: { ...fighter.passiveAt }, telegraph: fighter.telegraph && { ...fighter.telegraph } }
}

export function snapshotEdgeBattle(battle: EdgeBattle): EdgeBattle {
  return {
    ...battle, team: battle.team.map(snapshotFighter), boss: { ...battle.boss },
    sparring: battle.sparring && {
      ...battle.sparring, rivals: battle.sparring.rivals.map(snapshotFighter), actions: battle.sparring.actions.slice(),
    },
    preview: battle.preview && {
      targets: battle.preview.targets.map((target) => ({ ...target, telegraph: target.telegraph && { ...target.telegraph } })),
      loadoutFor: battle.preview.loadoutFor, passiveOnly: battle.preview.passiveOnly,
    },
    telegraph: battle.telegraph ? { ...battle.telegraph } : null, cues: battle.cues.slice(), impacts: battle.impacts.slice(),
    runtime: {
      ...battle.runtime,
      histories: new Map([...battle.runtime.histories].map(([id, record]) => [id, {
        ...record, positions: record.positions.slice(), wounds: record.wounds.slice(), attackers: new Set(record.attackers),
        binderControl: record.binderControl && new Map(record.binderControl),
      }])),
      buffs: battle.runtime.buffs.slice(),
      watches: battle.runtime.watches.map((watch) => ({ ...watch })),
      shieldCasts: new Map(battle.runtime.shieldCasts),
      pendingLifeHeals: battle.runtime.pendingLifeHeals.slice(),
      fields: battle.runtime.fields.map((field) => field.danceRail || field.danceStill || field.mode.startsWith("dance")
        ? { ...field, seen: new Set(field.seen), danceStill: field.danceStill && new Map(field.danceStill) } : { ...field }),
      summons: battle.runtime.summons.map((summon) => ({
        ...summon,
        deployment: { ...summon.deployment, bodies: summon.deployment.bodies.map((body) => ({ ...body, actionsAt: body.actionsAt.slice() })) },
      })),
      visuals: battle.runtime.visuals.map((area) => ({ ...area })),
      effects: battle.runtime.effects.slice(),
      notices: battle.runtime.notices.slice(),
    },
  }
}

export function activeFor(actor: EdgeFighter, order: SkillOrder) {
  return actor.actives[order === "skill2" ? 1 : 0]
}

export function moveLanding(actor: EdgeUnit, destination: EdgePoint, battle?: EdgeBattle, previewTether = true): EdgePoint | null {
  if (isOutside(destination)) return null
  const returning = isOutside(actor)
  const end = inside(destination)
  const reach = returning ? MOVE_REACH + 50 : battle ? movementAllowance(battle, actor, MOVE_REACH, end) : MOVE_REACH
  const landing = edgeDistance(actor, end) > reach ? along(actor, direction(actor, end), reach) : end
  return returning ? inside(landing, 22)
    : battle && previewTether && !dancerMovesBySkill(battle, actor, end) ? tetherLanding(battle, actor, landing) : landing
}

function cooldownsFor(battle: EdgeBattle, actor: EdgeUnit): EdgeCooldowns {
  if (actor.id === "boss") return battle.boss
  return battle.sparring && sideOf(battle, actor.id) === "enemy" ? battle.sparring : battle
}

function recordAction(battle: EdgeBattle, actor: EdgeUnit, name: string) {
  if (!battle.sparring || !isFighter(actor)) return
  const { actions } = battle.sparring
  actions.push({ time: battle.time, side: sideOf(battle, actor.id), actorId: actor.card.uid, actor: actor.card.name, name })
  if (actions.length > 24) actions.shift()
}

export function moveProblem(battle: EdgeBattle, actor: EdgeUnit): string | null {
  if (!actor.hp) return "已下场"
  if (actor.force) return "正在被位移"
  if (movementStopped(battle, actor) && !growthCanCleanseMove(battle, actor)) return "定身中"
  if (isOutside(actor)) return null
  const { moveAt, sharedAt } = cooldownsFor(battle, actor)
  if (battle.time < moveAt) return "移动冷却中"
  return battle.time < sharedAt ? "共享冷却中" : null
}

function cueMove(battle: EdgeBattle, unit: EdgeUnit) {
  const end = unit.move ?? unit.force?.end
  if (end) cue(battle, "move", unit, end)
}

export function moveEdgeFighter(battle: EdgeBattle, actor: EdgeUnit, destination: EdgePoint): string | null {
  if (battle.phase !== "running") return "空格继续战斗"
  const problem = moveProblem(battle, actor)
  if (problem) return problem
  const landing = moveLanding(actor, destination, battle, false)
  if (!landing) return "选择场内落点"
  if (edgeDistance(actor, landing) < 7) return null
  const returning = isOutside(actor)
  if (!returning) {
    const clocks = cooldownsFor(battle, actor)
    clocks.moveAt = battle.time + COOLDOWN.move
    clocks.sharedAt = battle.time + COOLDOWN.shared
  }
  if (!startMovement(battle, actor, landing, returning, destination)) actor.move = landing
  growthMove(battle, actor)
  if (typeof actor.id === "number") battle.commands?.push({ frame: Math.round(battle.time / SPARRING_STEP), unit: actor.id, type: "move", at: { x: destination.x, y: destination.y } })
  cueMove(battle, actor)
  recordAction(battle, actor, returning ? "回场" : "移动")
  return null
}

export function actionProblem(battle: EdgeBattle, actor: EdgeUnit): string | null {
  if (!actor.hp) return "已下场"
  if (actor.force) return "正在被位移"
  if (battle.time < actor.actionAt) return "角色冷却中"
  return battle.time < cooldownsFor(battle, actor).sharedAt ? "共享冷却中" : null
}

export function orderPreview(battle: EdgeBattle, actor: EdgeFighter, order: EdgeOrder, target: EdgeUnit | null, at?: EdgePoint): Preview {
  const problem = actionProblem(battle, actor)
  if (problem) return { error: problem }
  if (order === "basic") {
    if (!target?.hp || sameSide(battle, actor.id, target.id) || unitOf(battle, target.id) !== target) return { error: "选择敌人" }
    if (edgeDistance(actor, target) > attackRange(battle, actor, target)) return { error: "超出射程" }
    return previewBasicShove(battle, actor, target)
  }
  const active = activeFor(actor, order)
  const location = active.aim.mode === "self" ? actor : at ?? target
  if (!location || !isOnBoard(location)) return { error: "选择落点" }
  const error = skillCastProblem(battle, actor, active, location, target ?? undefined)
  return error ? { error } : { end: null }
}

function spendAction(battle: EdgeBattle, actor: EdgeUnit) {
  if (actor.move) {
    const track = history(battle, actor)
    track.standAt = battle.time
    track.binderFold = undefined
    track.danceStep = undefined
  }
  actor.move = null
  actor.actionAt = battle.time + actor.actionCooldown
  if (actor === battle.boss || isFighter(actor)) cooldownsFor(battle, actor).sharedAt = battle.time + COOLDOWN.shared
}

export function issueEdgeOrder(battle: EdgeBattle, actor: EdgeFighter, order: EdgeOrder, target: EdgeUnit | null, at?: EdgePoint): string | null {
  if (battle.phase !== "running") return "空格继续战斗"
  const preview = orderPreview(battle, actor, order, target, at)
  if ("error" in preview) return preview.error
  battle.commands?.push({ frame: Math.round(battle.time / SPARRING_STEP), unit: actor.card.uid, type: order, target: target?.id, at: at && { x: at.x, y: at.y } })
  spendAction(battle, actor)
  if (order === "basic") {
    recordAction(battle, actor, "普攻")
    if (target) basicAttack(battle, actor, target, false, consumeTaunt(battle, actor, target), true)
  } else {
    const active = activeFor(actor, order)
    recordAction(battle, actor, active.name)
    const self = active.aim.mode === "self"
    const selected = self ? actor : target ?? undefined
    const cast = newCast(battle, actor, "skill", self ? actor : at ?? selected ?? actor, selected, active)
    cast.used.add("manual")
    growthCast(battle, actor)
    markWardenOrder(battle, actor, cast)
    castSkill(battle, cast, active)
  }
  return null
}

function moveUnit(battle: EdgeBattle, actor: EdgeUnit, dt: number) {
  if (!actor.hp) return
  if (actor.force) {
    const force = actor.force
    const { start, end, since, duration, cause, route } = force
    const complete = battle.time >= since + duration
    const progress = complete ? 1 : clamp((battle.time - since) / duration, 0, 1)
    const ease = 1 - (1 - progress) ** 3
    const next = route ? dancerPointAt(route, progress) : { x: start.x + (end.x - start.x) * ease, y: start.y + (end.y - start.y) * ease }
    positionUnit(battle, actor, next, cause)
    if (complete && actor.force === force) {
      force.completed = true
      actor.force = null
      finishForcedMovement(battle, actor, force)
    }
    return
  }
  if (!actor.move || movementStopped(battle, actor)) return
  const travel = movementSpeed(battle, actor) * dt
  const arrived = edgeDistance(actor, actor.move) <= travel
  const destination = actor.move
  const next = arrived ? destination : along(actor, direction(actor, destination), travel)
  const returning = history(battle, actor).moveReturning
  const bound = returning ? next : tetherLanding(battle, actor, next)
  const blocked = stopAtSummonTerrain(battle, actor, bound)
  if (!blocked && stopAtWardenGate(battle, actor, bound)) return
  const before = point(actor)
  positionUnit(battle, actor, blocked ?? bound)
  if (!returning) {
    binderWalkCrossing(battle, actor, before)
    dancerWalkCrossing(battle, actor, before)
  }
  const tethered = !blocked && bound !== next
  if (arrived || blocked || tethered) {
    actor.move = null
    finishMovement(battle, actor, arrived && !blocked && !tethered)
    if (tethered) releaseBinderTether(battle, actor, destination)
    else if (arrived && !blocked && !actor.force) takePortal(battle, actor)
  }
}

function resolveCharge(battle: EdgeBattle, telegraph: Telegraph, boss: EdgeUnit = battle.boss) {
  const { from, to, direction: vector } = telegraph
  if (boss === battle.boss) battle.telegraph = null
  else boss.telegraph = null
  const cast = newCast(battle, boss, "enemy", to)
  cast.used.add("bossCharge")
  cue(battle, "charge", boss, to, from)
  const targets = [...battleUnits(battle), ...deployedUnits(battle)].filter((target) =>
    target.hp && !sameSide(battle, boss.id, target.id) && withinCharge(from, vector, target))
  for (const target of targets) {
    damageUnit(battle, cast, target, boss.attack * CHARGE.power)
    if (!isSummonId(target.id)) shoveUnit(battle, cast, target, CHARGE.push, "", undefined, false, vector, 0.34)
  }
  if (battle.phase === "running") forceTo(battle, boss, skillTravelEnd(battle, cast, boss, inside(along(from, vector, 141)), true), 0.24, false, cast)
}

export function withinCharge(from: EdgePoint, vector: EdgePoint, target: EdgePoint) {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const forward = dx * vector.x + dy * vector.y
  const across = Math.abs(dx * vector.y - dy * vector.x)
  return forward >= -15 && forward <= CHARGE.reach + 15 && across <= CHARGE.halfWidth
}

export function startBossCharge(battle: EdgeBattle, target: EdgeUnit) {
  return startUnitCharge(battle, battle.boss, target)
}

export function startUnitCharge(battle: EdgeBattle, boss: EdgeUnit, target: EdgeUnit, aim: EdgePoint = target) {
  if (!boss.hp || !target.hp || !beforeBossCharge(battle, boss)) return false
  const vector = direction(boss, aim)
  spendAction(battle, boss)
  const telegraph = { from: point(boss), to: along(boss, vector, CHARGE.reach), direction: vector, until: battle.time + CHARGE.windup }
  if (boss === battle.boss) battle.telegraph = telegraph
  else boss.telegraph = telegraph
  emit(battle, { kind: "charge", cast: newCast(battle, boss, "enemy", aim, target), source: boss.id, target: boss.id, at: point(boss) })
  return true
}

export function finishBossCharge(battle: EdgeBattle) {
  const telegraph = battle.telegraph
  if (battle.phase !== "running" || !telegraph || battle.time < telegraph.until) return
  resolveCharge(battle, telegraph)
}

function busyMoving(battle: EdgeBattle, actor: EdgeUnit) {
  return actor.force || actor.move && !movementStopped(battle, actor)
}

function moveAiFighter(battle: EdgeBattle, actor: EdgeUnit, destination: EdgePoint) {
  return walkTriggersLethalMark(battle, actor, destination) ? "移动落点将触发致死标记" : moveEdgeFighter(battle, actor, destination)
}

function returnExiled(battle: EdgeBattle, actor: EdgeUnit) {
  if (!isOutside(actor) || moveProblem(battle, actor)) return
  const current = actor.move ?? returnAroundShore(battle, actor)
  const dodge = dodgeReturnStrike(battle, actor, current)
  if (dodge === "wait") return
  if (dodge || !actor.move) moveAiFighter(battle, actor, dodge ?? current)
}

interface Approach extends AdvancePath {
  point: EdgePoint
  value: number
}

type CoverLoss = NonNullable<ReturnType<typeof bulwarkEscort>>["loss"]

function approach(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit, detour = false,
  coverLoss?: CoverLoss, score?: (path: AdvancePath, exposure: number) => number, finishingRange?: number) {
  if (moveProblem(battle, actor)) return
  const gap = edgeDistance(actor, target)
  const facing = direction(target, actor)
  const reach = attackRange(battle, actor, target)
  const healthy = actor.hp >= actor.maxHp * .8 || actor.range < 200
  const attackDistance = reach * (healthy ? .75 : .91)
  const hopRadius = dancerHop(battle, actor)?.values[4]
  const range = finishingRange ?? (hopRadius ? Math.min(attackDistance, hopRadius * .78) : attackDistance)
  const allies = alliesOf(battle, actor.id)
  const turns = healthy ? [0, -38, 38] : [0, -38, 38, -72, 72]
  const opponents = isFighter(actor) && actor.hp <= actor.maxHp * .56 && battle.sparring
    ? sideOf(battle, actor.id) === "ally" ? battle.sparring.rivals : battle.team : undefined
  const requests = turns.map(turn => inside(along(target, rotate(facing, turn), range), 32))
  if (score && isFighter(actor) && actor.range >= 200 && actor.hp <= actor.maxHp * .65 &&
    actor.actionAt <= battle.time + COOLDOWN.move && moveRecovery(battle, actor)) {
    const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
    const step = frame * movementSpeed(battle, actor)
    for (const request of requests.slice()) {
      const landing = moveLanding(actor, request, battle)
      if (!landing) continue
      const length = edgeDistance(actor, landing)
      if (length > MOVE_REACH + step) requests.push(along(actor, direction(actor, landing), length - step))
    }
  }
  if (actor === battle.boss) requests.push(inside(along(target, facing, reach * .90), 32))
  const patrols = roadBeastThreats(battle, actor)
  if (detour || patrols.length && actor === battle.boss) for (const turn of [-50, 50, -76, 76]) {
    requests.push(inside(along(actor, rotate(direction(actor, target), turn), Math.min(gap, MOVE_REACH)), 32))
  }
  let best: Approach | undefined
  for (const request of requests) {
    if (finishingRange !== undefined && dancerMovesBySkill(battle, actor, request)) continue
    const landing = moveLanding(actor, request, battle)
    if (!landing) continue
    const block = summonTerrainInPath(battle, actor, landing, false)
    if (detour && block) continue
    const pathEnd = block?.at ?? landing
    const arrival = battle.time + edgeDistance(actor, pathEnd) / movementSpeed(battle, actor)
    const exit = !block && isFighter(actor) ? availablePortalExit(battle, actor, landing, arrival) : undefined
    if (finishingRange !== undefined && (exit || block || battle.runtime.fields.some(field => field.mode === "cross" &&
      field.until > battle.time && !sameSide(battle, field.cast.owner, actor.id) && !field.seen.has(actor.id) &&
      !areaHits(field.area, actor) && firstCrossing(field.area, actor, pathEnd, 4)))) continue
    const stop = block?.at ?? exit ?? landing
    if (isFighter(actor) && walksIntoWarning(battle, actor, pathEnd, arrival, exit)) continue
    if (walksIntoAnnouncedArea(battle, actor, pathEnd, arrival, exit)) continue
    if (walksIntoShoreBeast(battle, actor, pathEnd, arrival, exit)) continue
    if (exposesToEdgePush(battle, actor, pathEnd, arrival) ||
      exit && portalExitIsExposed(battle, actor, exit, arrival, battle.time, false, true, pathEnd)) continue
    const gain = gap - edgeDistance(stop, target)
    if (gain < 10) continue
    const occupied = allies.some((ally) => ally !== actor && ally.hp && edgeDistance(ally.move ?? ally, stop) < 66)
    if (patrols.length && roadBeastRisk(battle, actor, (unit, at) => unit === actor
      ? walkAt(actor, pathEnd, battle.time, arrival, at, exit) : future(battle, unit, at - battle.time),
      Math.max(arrival, battle.time + COOLDOWN.shared), patrols, true) > 0) continue
    const path = { landing: pathEnd, stop, arrival }
    if (lethalClosingFieldOnPath(battle, actor, path)) continue
    if (opponents && !dancerMovesBySkill(battle, actor, request) && walksIntoLethalReach(battle, actor, opponents, path)) continue
    const exposure = approachExposure(battle, actor, stop, arrival)
    const value = gain - (occupied ? 65 : 0) - exposure -
      Math.max(0, coverLoss?.(pathEnd, arrival, exit) ?? 0) * MOVE_REACH + (score?.(path, exposure) ?? 0)
    if (!best || best.value < value) best = { point: request, ...path, value }
  }
  if (finishingRange === undefined && isFighter(actor) && battle.sparring && battle.runtime.summons.length) {
    const route = bestPortalAdvance(battle, actor, [target])
    if (route) {
      const value = route.value - Math.max(0, coverLoss?.(route.landing, route.arrival, route.stop) ?? 0) * MOVE_REACH + (score?.(route, 0) ?? 0)
      if (!best || value + route.opening * 45 >= best.value + 18) best = { ...route, value }
    }
  }
  return best && best.value > 0 ? best : undefined
}

function bossAdvance(battle: EdgeBattle, hasTerrain: boolean, needContact = false, chargeBlockers: readonly { body: EdgeUnit; reach: number }[] = []) {
  const { boss, time: now } = battle
  if (moveProblem(battle, boss)) return
  const ready = Math.max(now, boss.actionAt)
  const alive = battle.team.filter(unit => unit.hp)
  const lethalApproach = (path: AdvancePath) => walksIntoReadyFinish(battle, boss, alive, path)
  const gapAt = (target: EdgeFighter, from: EdgePoint, time: number) =>
    edgeDistance(from, future(battle, target, time - now)) - attackRange(battle, boss, target, time)
  // A walk spends the shared cooldown. Let the card already walking into
  // melee come the last few pixels if the hit will be available anyway.
  const response = Math.max(ready, now + COOLDOWN.shared) + SPARRING_STEP
  const available = alive.filter(unit => targetable(battle, unit, response))
  const targets = available.length ? available : alive
  const returns = alive.flatMap(unit => {
    const route = committedReturn(battle, unit)
    return route && route.arrival < ready ? [{ unit, route }] : []
  })
  if (available.some(target => gapAt(target, boss, response) <= 0 &&
    gapAt(target, boss, response + AI_THINK_INTERVAL) <= 0 && targetable(battle, target, response + AI_THINK_INTERVAL))) return
  const leavesTrap = (at: EdgePoint) => chargeBlockers.every(({ body, reach }) => edgeDistance(body, at) > reach + 6)
  let best: Approach | undefined
  for (const target of targets) {
    const lead = future(battle, target, COOLDOWN.shared)
    const reach = attackRange(battle, boss, target)
    const length = Math.min(MOVE_REACH, Math.max(0, edgeDistance(boss, lead) - reach * .75))
    const predicted = future(battle, target, Math.max(COOLDOWN.shared, length / movementSpeed(battle, boss)))
    if (needContact && isOutside(predicted)) continue
    const detour = hasTerrain && !!summonTerrainInPath(battle, boss, predicted, false)
    const route = approach(battle, boss, { ...target, ...predicted }, detour, undefined, path => {
      if (lethalApproach(path)) return -Infinity
      const hitAt = Math.max(ready, now + COOLDOWN.shared, path.arrival)
      const gap = gapAt(target, path.stop, hitAt)
      const inReach = targetable(battle, target, hitAt) && gap <= -4
      if (needContact && !inReach) return -Infinity
      if (!inReach && !leavesTrap(path.stop)) return -Infinity
      const risk = returns.reduce((risk, { unit, route }) =>
        Math.max(risk, returnCounterRisk(battle, boss, unit, route, battle.sharedAt, path)), 0)
      if (inReach) return 230 - 125 * (hitAt - Math.max(ready, now + COOLDOWN.shared)) - 32 * (path.arrival - now) - risk
      return -Math.min(125, Math.max(0, gap) * .5) - risk
    })
    if (route && (!best || route.value > best.value)) best = route
  }
  if (!best && !needContact && chargeBlockers.length) {
    // A durable trap can gate the direct route. Step just outside its
    // reaction radius while keeping the following charge in reach.
    const options = chargeBlockers.flatMap(({ body, reach }) =>
      [0, -45, 45, -90, 90].map(turn => inside(along(body, rotate(direction(body, boss), turn), reach + 20), 20)))
    for (const point of options) {
      const landing = moveLanding(boss, point, battle)
      if (!landing || !leavesTrap(landing) || summonTerrainInPath(battle, boss, landing)) continue
      const length = edgeDistance(boss, landing)
      if (length < 8) continue
      const arrival = now + length / movementSpeed(battle, boss)
      const fireAt = Math.max(ready, now + COOLDOWN.shared, arrival + SPARRING_STEP)
      const gain = available.some(target => targetable(battle, target, fireAt) &&
        edgeDistance(landing, future(battle, target, fireAt + CHARGE.windup - now)) <= CHARGE.reach - 26)
      const returnRisk = returns.reduce((risk, { unit, route }) => Math.max(risk,
        returnCounterRisk(battle, boss, unit, route, battle.sharedAt, { landing, stop: landing, arrival })), 0)
      if (!gain || walksIntoAnnouncedArea(battle, boss, landing, arrival) ||
        walksIntoShoreBeast(battle, boss, landing, arrival) ||
        lethalClosingFieldOnPath(battle, boss, { landing, stop: landing, arrival }) ||
        lethalApproach({ landing, stop: landing, arrival })) continue
      const value = 100 - length * .25 - returnRisk
      if (value > (best?.value ?? 0)) best = { point, landing, stop: landing, arrival, value }
    }
  }
  return best
}

function bossFlankForCharge(battle: EdgeBattle, target: EdgeFighter, enemies: EdgeFighter[]) {
  const { boss, time: now } = battle
  const limit = CHARGE.reach - 26
  const gap = edgeDistance(boss, target)
  if (gap >= limit || moveProblem(battle, boss)) return
  const away = direction(target, boss)
  const before = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  let best: { point: EdgePoint; value: number } | undefined
  for (const turn of [-25, 25, -43, 43, -68, 68]) {
    const point = inside(along(target, rotate(away, turn), Math.min(limit - 8, gap)), 20)
    const landing = moveLanding(boss, point, battle)
    if (!landing) continue
    const distance = edgeDistance(boss, landing)
    const arrival = now + distance / movementSpeed(battle, boss)
    const chargeAt = Math.max(arrival, now + COOLDOWN.shared, boss.actionAt)
    const release = chargeAt + CHARGE.windup
    const aim = before(target, release)
    const path = { landing, arrival, stop: landing }
    if (distance < 25 || edgeDistance(landing, aim) > limit ||
      !targetable(battle, target, release) ||
      summonTerrainInPath(battle, boss, landing) || walksIntoAnnouncedArea(battle, boss, landing, arrival) ||
      walksIntoShoreBeast(battle, boss, landing, arrival) || exposesToEdgePush(battle, boss, landing, arrival) ||
      lethalClosingFieldOnPath(battle, boss, path) || walksIntoReadyFinish(battle, boss, enemies, path) ||
      hasLineCounterToCharge(battle, boss, enemies, release, path)) continue
    const walk = (unit: EdgeUnit, at: number) => unit === boss ? walkAt(boss, landing, now, arrival, at) : before(unit, at)
    const pending = announcedStrikes(battle, boss, release, walk)
    if (!lifeThroughStrikes(battle, boss, pending, walk).hp || pending.some(contact =>
      contact.at >= chargeAt && !!announcedHit(battle, contact, boss, walk(boss, contact.at), walk) &&
      (contact.strike.step?.operations.some(op => op.kind === "i") ||
        isOutside(announcedShift(battle, contact, boss, walk)?.end ?? landing)))) continue
    const value = 250 - distance - edgeDistance(landing, aim) * .12
    if (!best || value > best.value) best = { point, value }
  }
  return best
}

function lastCardFinish(battle: EdgeBattle) {
  const { boss } = battle
  const living = battle.team.filter(unit => unit.hp)
  const [last] = living
  return living.length === 1 && last.hp <= boss.attack * 1.5 &&
    basicTarget(battle, boss, unit => Number(unit === last)) === last &&
    estimateDirectHit(battle, boss, last, 1, "basic", last, battle.time).lethal ? last : undefined
}

function canRepeatDirectInterrupt(battle: EdgeBattle, release: number) {
  const { boss, time } = battle
  const previous = battle.runtime.histories.get(boss.id)
  const skill = previous?.interruptSkill
  const caster = unitOf(battle, previous?.interruptBy)
  if (!skill || skill.aim.mode !== "enemy" || !caster?.hp || !isFighter(caster) || sameSide(battle, caster.id, boss.id)) return false
  const [first] = skill.steps
  if (first.selector.units !== "t" || first.selector.shape || first.selector.flags.length ||
    first.zone || first.watch || !first.operations.some(op => op.kind === "i")) return false
  const windup = fixedSkillWindup(skill, true)
  if (windup === undefined) return false
  const standing = caster.force ? caster.force.since + caster.force.duration + SPARRING_STEP : time
  const firstReady = Math.max(time, battle.sharedAt, caster.actionAt, standing)
  const lastReady = release - windup - first.delay - 2 * SPARRING_STEP
  if (firstReady > lastReady) return false
  return [firstReady, lastReady].some(at => {
    const source = { ...caster, ...future(battle, caster, at - time) }
    return !isOutside(source) && !skillCastProblem(battle, source, skill, boss, boss, at)
  })
}

function bossOrder(battle: EdgeBattle) {
  const boss = battle.boss
  if (!boss.hp || battle.telegraph || boss.force) return
  if (isOutside(boss)) {
    returnExiled(battle, boss)
    return
  }
  const strike = (target: EdgeUnit) => {
    const provoked = consumeTaunt(battle, boss, target)
    spendAction(battle, boss)
    boss.lastOrder = "basic"
    basicAttack(battle, boss, target, true, provoked)
  }
  if (!actionProblem(battle, boss)) {
    // A lethal basic on the last card resolves the battle before the next
    // projectile, field tick, or summon pulse.
    const last = lastCardFinish(battle)
    if (last) {
      strike(last)
      return
    }
  }
  if (!moveProblem(battle, boss)) {
    const dodge = dodgeEdgeShove(battle, boss)
    if (dodge && moveAiFighter(battle, boss, dodge.point) === null) return
    const escape = leaveLethalTargetRange(battle, boss, battle.team.filter(actor => actor.hp), "announced")
    if (escape && moveAiFighter(battle, boss, escape.point) === null) return
    const area = dodgeAreaDamage(battle, boss)
    const closing = dodgeClosingField(battle, boss)
    const escapeArea = closing && closing.value > (area?.value ?? 0) ? closing : area
    if (escapeArea && moveAiFighter(battle, boss, escapeArea.point) === null) return
    const pulse = avoidEnsemblePulse(battle, [boss])
    if (pulse && moveAiFighter(battle, boss, pulse.point) === null) return
  }
  if (!moveProblem(battle, boss) && (!boss.move || battle.runtime.histories.get(boss.id)?.moveReturning)) {
    const route = clearShore(battle, boss)
    if (route && moveAiFighter(battle, boss, route.point) === null) return
  }
  if (busyMoving(battle, boss)) return
  const target = bossTarget(battle)
  const predicted = target && future(battle, target, .85)
  const deployments = activeDeployments(battle)
  const blocker = predicted && deployments.length ? summonTerrainInPath(battle, boss, predicted) : undefined
  const terrain = deployments.filter(({ plan }) => plan.terrain?.type === "block").flatMap(({ deployment }) => deployment.bodies)
  const paper = deployments.filter(({ deployment }) => deployment.kind === "paperBeat")
  const ensembles = deployments.filter(({ deployment }) => deployment.kind === "ensemble")
  const runners = deployments.filter(({ deployment }) => deployment.kind === "runner")
  const ambushes = deployments.flatMap(({ deployment, plan }) => deployment.kind === "ambush"
    ? [{ body: deployment.bodies[0], reach: plan.actions![0].reaction!.reach }] : [])
  const chargeBlockers = ambushes.filter(({ body, reach }) => body.hp && body.actionsAt[0] <= battle.time && edgeDistance(boss, body) <= reach)
  const runnerThreats = new Map<EdgeUnit, number>()
  const shore = shoreThreats(battle, boss)
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const damageEstimate = (target: EdgeUnit, at: EdgePoint, charge = false, blockedRescue?: SummonGroup,
    impact = battle.time + (charge ? CHARGE.windup : 0)) => {
    const aid = impact > battle.time && aidBeforeHit(battle, target, impact, position, blockedRescue,
      target.move || target.force ? wardsAlongPath(battle, target, impact, position) : [])
    return estimateDirectHit(battle, boss, target, charge ? CHARGE.power : 1, charge ? "enemy" : "basic", at, impact,
      aid ? aid.shield : undefined, aid || undefined)
  }
  const rescueToBreak = deployments.find(({ group, deployment }) => {
    if (deployment.kind !== "rescue") return false
    const [body] = deployment.bodies
    if (!body.hp || edgeDistance(boss, body) > attackRange(battle, boss, body) || !damageEstimate(body, body).lethal) return false
    const patient = unitOf(battle, group.target)
    if (!patient?.hp) return false
    const until = battle.time + CHARGE.windup
    const at = position(patient, until)
    const pulse = rescuePulse(battle, group, patient, until, position)
    return pulse && pulse.at + SPARRING_STEP < until && edgeDistance(boss, at) <= CHARGE.reach - 26 &&
      !damageEstimate(patient, at, true).lethal && damageEstimate(patient, at, true, group).lethal
  })?.deployment.bodies[0]
  const rescueBodies = deployments.filter(({ deployment }) => deployment.kind === "rescue").map(({ deployment }) => deployment.bodies[0])
  const mirrors = deployments.filter(({ deployment }) => deployment.kind === "mirror")
  const mirrorThreat = new Map<EdgeUnit, number>()
  const basicScore = (target: EdgeUnit) => {
    const result = damageEstimate(target, target)
    if (ambushes.some(({ body }) => body === target)) {
      return chargeBlockers.some(({ body }) => body === target) && result.lethal ? .78 : .008
    }
    const runner = runners.find(({ deployment }) => deployment.bodies[0] === target)
    if (runner) {
      let threat = runnerThreats.get(target)
      if (threat === undefined) {
        threat = result.lethal ? runnerBreakValue(battle, runner.group, boss, battle.time, position) : 0
        runnerThreats.set(target, threat)
      }
      return threat > 0 ? .96 : .018
    }
    const mirror = mirrors.find(({ deployment }) => deployment.bodies[0] === target)
    if (mirror) {
      if (!result.lethal) return .008
      let value = mirrorThreat.get(target)
      if (value === undefined) {
        value = mirrorThreatValue(battle, mirror.group, boss)
        mirrorThreat.set(target, value)
      }
      return value >= .36 ? Math.min(.8, value * .48) : .008
    }
    if (shore.some(threat => threat.body === target)) {
      return result.lethal ? Math.max(.10, shoreBeastStrikeValue(battle, boss, target, [boss], 0, result.hit)) : .08
    }
    if (terrain.some(body => body === target)) {
      const opening = blocker?.body === target && result.lethal ? .14 : .025
      return result.hpLoss > 0 ? opening : 0
    }
    if (isSummonId(target.id) && paper.length) {
      const array = paper.find(({ deployment }) => deployment.bodies.some(body => body === target))
      if (array) return Math.max(.045, paperBodyValue(battle, array.group, target, battle.team, [boss], 0) * (result.lethal ? .7 : .15))
    }
    if (target === rescueToBreak) return .95
    if (rescueBodies.some(body => body === target)) return .008
    const ensemble = isSummonId(target.id) && ensembles.find(({ deployment }) => deployment.bodies.some(body => body === target))
    if (ensemble) {
      const threat = ensembleBodyValue(battle, ensemble.group, target, battle.team, [boss], 0)
      return Math.max(.008, threat * (result.lethal ? .90 : .15))
    }
    if (isFighter(target) && result.shieldLoss > 0) {
      return Number(result.lethal) + (result.hpLoss - result.saveHeal + .16 * result.shieldLoss) / target.maxHp
    }
    return Number(result.lethal) + (result.hpLoss - result.saveHeal) / target.maxHp
  }
  const basic = basicTarget(battle, boss, basicScore)
  const hittingBlocker = terrain.find(body => body === basic)
  const breaksBeastWithBasic = basic && shore.some(threat => threat.body === basic) && basicScore(basic) > 1
  const breaksMirror = !!basic && (mirrorThreat.get(basic) ?? 0) >= .36
  const chipMirror = !!basic && mirrors.some(({ deployment }) => deployment.bodies[0] === basic) && !breaksMirror
  const chipPaper = basic && isSummonId(basic.id) && paper.some(({ deployment }) => deployment.bodies.some(body => body === basic)) &&
    basicScore(basic) <= .12
  const chipRunner = !!basic && runners.some(({ deployment }) => deployment.bodies[0] === basic) && (runnerThreats.get(basic) ?? 0) <= 0
  const chipAmbush = !!basic && ambushes.some(({ body }) => body === basic) &&
    (!chargeBlockers.some(({ body }) => body === basic) || !damageEstimate(basic, basic).lethal)
  if (!actionProblem(battle, boss)) {
    const release = battle.time + CHARGE.windup
    const incoming = announcedStrikes(battle, boss, release, position)
    const interrupted = incoming.some(contact => {
      const shift = announcedShift(battle, contact, boss, position)
      return shift && isOutside(shift.end) ||
        contact.strike.step?.operations.some(op => op.kind === "i") &&
        !!announcedHit(battle, contact, boss, position(boss, contact.at), position)
    })
    const patrols = roadBeastThreats(battle, boss)
    const runnerHits = runners.flatMap(({ group, deployment }) => {
      const [body] = deployment.bodies
      const owner = unitOf(battle, group.owner)
      if (!body.hp || !owner || group.target !== boss.id || sameSide(battle, group.owner, boss.id)) return []
      const expires = group.start + SUMMON_PLANS.runner.duration - SPARRING_STEP
      const strike = runnerContact(battle, deployment.cast, owner, boss, body, body.actionsAt[0], Math.min(release, expires), position)
      return strike ? [strike] : []
    })
    const allIncoming = [...incoming, ...runnerHits].sort((a, b) => a.at - b.at)
    const chargeUnsafe = chargeBlockers.length > 0 || interrupted || runnerHits.some(contact => isOutside(announcedShift(battle, contact, boss, position)?.end ?? boss)) ||
      allIncoming.length && !lifeThroughStrikes(battle, boss, allIncoming, position).hp ||
      patrols.length && !Number.isFinite(roadBeastRisk(battle, boss, position, release, patrols, false))
    const deniesRescue = !!basic && basic === rescueToBreak
    const finishing = breaksBeastWithBasic || basic && isFighter(basic) && damageEstimate(basic, basic).lethal
    const enemies = battle.team.filter((unit) => targetable(battle, unit))
    const contacts = enemies.map(unit => {
      const at = position(unit, release)
      return { unit, at, result: damageEstimate(unit, at, true) }
    })
    const canIntercept = (unit: EdgeFighter) => {
      if (!unit.move || unit.force || movementStopped(battle, unit) || unit.hp > boss.attack * 1.35) return false
      const route = committedReturn(battle, unit)
      if (!route && isOutside(unit)) return false
      const now = battle.time
      const step = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
      const available = (hitAt: number) => {
        if (battle.team.some(other => other.hp && Math.max(battle.sharedAt, other.actionAt) <= hitAt)) return false
        const at = position(unit, hitAt)
        const reach = attackRange(battle, boss, unit, hitAt) - 8
        if (isOutside(at) || edgeDistance(boss, at) > reach ||
          edgeDistance(boss, position(unit, hitAt + SPARRING_STEP)) > reach) return false
        const target = basicTarget(battle, boss, other => Number(other === unit), hitAt, other => position(other, hitAt))
        if (target !== unit || !damageEstimate(unit, at, false, undefined, hitAt).lethal) return false
        const incoming = announcedStrikes(battle, boss, hitAt, position)
        return !incoming.length || lifeThroughStrikes(battle, boss, incoming, position).hp > 0 &&
          !incoming.some(contact => announcedShift(battle, contact, boss, position))
      }
      if (route) return route.arrival <= now + 1.8 && available(route.arrival + step + SPARRING_STEP)
      // A committed in-bounds walk can give the boss a lethal melee contact
      // while the player is still on movement's shared cooldown.
      const interceptUntil = Math.min(release - SPARRING_STEP, now + COOLDOWN.shared + SPARRING_STEP)
      for (let hitAt = now + step; hitAt <= interceptUntil; hitAt += step) {
        if (available(hitAt)) return true
      }
      return false
    }
    const intercept = finishing || chargeUnsafe ? undefined : enemies.find(canIntercept)
    const aims = finishing || chargeUnsafe ? [] : contacts.flatMap(({ unit, at }, index) => {
      const angle = direction(boss, at)
      return [{ unit, at }, ...contacts.slice(index + 1).flatMap(other => {
        const second = direction(boss, other.at)
        if (angle.x * second.x + angle.y * second.y < .65 || edgeDistance(at, other.at) < 18) return []
        return [{ unit, at: { x: (at.x + other.at.x) / 2, y: (at.y + other.at.y) / 2 } }]
      })]
    })
    let charge: { target: EdgeFighter; at: EdgePoint; value: number } | undefined
    const canClose = !moveProblem(battle, boss)
    for (const { unit, at } of aims) {
      const gap = edgeDistance(boss, at)
      if (gap > CHARGE.reach - 26 || gap < 8) continue
      const axis = direction(boss, at)
      const hits = contacts.filter(contact => withinCharge(boss, axis, contact.at))
      if (!hits.length) continue
      const exits = hits.filter(({ unit, at, result }) => !result.lethal && !isOutside(at) &&
        isOutside(previewDirectedShove(battle, unit, at, axis, CHARGE.push, battle.time + CHARGE.windup))).length
      const finishes = hits.filter(({ result }) => result.lethal).length
      // A wall stops a walk. The charge can hit the wall and the cards behind it.
      const throughBlock = hittingBlocker && (withinCharge(boss, axis, hittingBlocker) || blocker?.body === hittingBlocker)
      const breaksBeast = shore.some(threat => threat.until > battle.time + CHARGE.windup + .3 &&
        withinCharge(boss, axis, threat.center) && damageEstimate(threat.body, threat.center, true).lethal)
      if (intercept && !throughBlock && !breaksBeast && hits.every(({ unit }) => unit === intercept)) continue
      const directDamage = hits.reduce((total, { result }) => total + Math.max(0, result.hpLoss - result.saveHeal), 0)
      const meaningfulDamage = directDamage >= boss.attack * .6
      const onlyReachable = meaningfulDamage && (!basic || chipPaper || chipMirror || chipRunner) && hits.some(({ unit, at, result }) => {
        if (boss.lastOrder !== "charge") return true
        const meaningful = result.hpLoss - result.saveHeal >= boss.attack * .6
        const holdsLane = edgeDistance(unit, at) <= CHARGE.halfWidth && borderRisk(at) >= CHARGE.push
        return meaningful && holdsLane && (!canClose || edgeDistance(boss, at) > attackRange(battle, boss, unit) + MOVE_REACH - 20)
      })
      const worth = finishes > 0 || hits.length > 1 && meaningfulDamage || !deniesRescue &&
        (exits > 0 || throughBlock || breaksBeast || onlyReachable)
      const value = hits.reduce((total, { result }) => total + .55 +
        .45 * (result.hpLoss - result.saveHeal) / Math.max(1, result.hit), 0) + 2.2 * finishes + .5 * exits + Number(breaksBeast) * .5
      if (worth && (!charge || value > charge.value)) {
        charge = { target: hits.some(contact => contact.unit === unit) ? unit : hits[0].unit, at, value }
      }
    }
    if (charge) {
      const directCounter = canRepeatDirectInterrupt(battle, release)
      const lineCounter = !directCounter && hasLineCounterToCharge(battle, boss, enemies, release)
      if (!directCounter && !lineCounter && startUnitCharge(battle, boss, charge.target, charge.at)) {
        boss.lastOrder = "charge"
        return
      }
      const flank = lineCounter && bossFlankForCharge(battle, charge.target, enemies)
      if (flank && moveAiFighter(battle, boss, flank.point) === null) return
    }
    if (chipPaper || chipMirror || chipRunner || chipAmbush) {
      const route = bossAdvance(battle, !!terrain.length, true)
      if (route && moveAiFighter(battle, boss, route.point) === null) return
    }
    if (basic && !chipMirror && !chipAmbush) {
      const afterShield = basic.shieldUntil + SPARRING_STEP
      if (isFighter(basic) && basic.shield > 0 && basic.shieldUntil > battle.time && afterShield - battle.time < COOLDOWN.shared &&
        !damageEstimate(basic, basic).hpLoss && targetable(battle, basic, afterShield)) {
        const response = afterShield + AI_THINK_INTERVAL
        const at = position(basic, response)
        const inReach = edgeDistance(boss, at) <= attackRange(battle, boss, basic, response) - 5
        const soonReady = Math.max(battle.sharedAt, basic.actionAt) <= response
        const canEjectNow = !isOutside(basic) && isOutside(previewBasicShove(battle, boss, basic).end)
        const alternate = battle.team.some(unit => unit !== basic && targetable(battle, unit) &&
          edgeDistance(boss, unit) <= attackRange(battle, boss, unit) && damageEstimate(unit, unit).hpLoss > 0)
        const incoming = announcedStrikes(battle, boss, response, position)
        if (inReach && !soonReady && !canEjectNow && !alternate &&
          (!incoming.length || lifeThroughStrikes(battle, boss, incoming, position).hp >= boss.hp)) {
          const exposed = damageEstimate(basic, at, false, undefined, response)
          if (exposed.lethal || exposed.hpLoss >= boss.attack * .65) return
        }
      }
      strike(basic)
      return
    }
    if (intercept && !hittingBlocker) return
  }
  if (basic && !hittingBlocker && !chipMirror && !chipAmbush) return
  const move = bossAdvance(battle, !!terrain.length, false, chargeBlockers)
  if (move) moveAiFighter(battle, boss, move.point)
}

type TeamMove = { actor: EdgeFighter; point: EdgePoint; value: number }

function evadeDamage(battle: EdgeBattle, side: EdgeSide, team: EdgeFighter[], enemies: EdgeFighter[], attack: AiAttack | undefined,
  dodges: (AreaDodge & { actor: EdgeFighter })[], lineTiming?: "before-opponent" | "after-opponent", wardMove?: TeamMove) {
  const warnings = battle.runtime.visuals.filter((visual) => visual.phase === "warning" &&
    visual.effect === "damage" && sideOf(battle, visual.owner) !== side && visual.until > battle.time + .23)
  const incomingShove = battle.runtime.visuals.some(warning => warning.phase === "warning" && warning.shove &&
    warning.until > battle.time && sideOf(battle, warning.owner) !== side)
  if (!warnings.length && !incomingShove) return false
  let best: { actor: EdgeFighter; at: EdgePoint; value: number; canWait?: boolean; ejection?: boolean; walk: (time: number) => EdgePoint } | undefined
  for (const actor of team) {
    if (isOutside(actor) || moveProblem(battle, actor)) continue
    const dodge = incomingShove && dodgeEdgeShove(battle, actor)
    if (dodge && dodge.value > Math.max(best?.value ?? 0, attack?.value ?? 0)) {
      const walk = (at: number) => walkAt(actor, dodge.landing, battle.time, dodge.arrival, at, dodge.stop)
      best = { actor, at: dodge.point, value: dodge.value, ejection: true, walk }
    }
    if (busyMoving(battle, actor)) continue
    const dangers = warnings.filter(warning => warningContains(warning, actor)).sort((a, b) => a.until - b.until)
    if (!dangers.length) continue
    const threat = dangers[0]
    const damage = dangers.reduce((sum, warning) => sum + warningDamage(battle, warning, actor), 0)
    const shield = actor.shieldUntil > threat.until ? actor.shield : 0
    // A harmless pull inside a live guard need not spend the team's movement.
    if (attack && dangers.every(warning => warning.strike)) {
      const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
      const contacts = announcedStrikes(battle, actor, dangers.at(-1)!.until, position)
      const defended = contacts.length && lifeThroughStrikes(battle, actor, contacts, position)
      if (defended && defended.hp >= actor.hp && defended.shield >= shield && !contacts.some(contact => {
        const shift = announcedShift(battle, contact, actor, position)
        if (!shift) return false
        const lands = contact.at + shift.duration
        return isOutside(shift.end) || actor.actionAt <= lands + .12 ||
          defensiveThreat(battle, { ...actor, ...shift.end }, enemies, lands) && !defensiveThreat(battle, actor, enemies, lands)
      })) continue
    }
    const remaining = actor.hp + shield - damage
    const critical = remaining <= actor.maxHp * .35
    const crisis = remaining <= 0 ? 3 : critical ? 1.25 : 0
    const exile = dangers.some(warning => !warning.shove && warning.pushDistance && borderRisk(actor) < warning.pushDistance)
    const value = crisis + damage / (actor.hp + shield) * 2.05 + .22 + (exile ? .75 : 0)
    const attackValue = attack?.value ?? 0
    if (value <= (best?.value ?? 0) || value <= attackValue && (!critical || attackValue >= 5)) continue
    const speed = movementSpeed(battle, actor)
    const reach = Math.min(MOVE_REACH, speed * (threat.until - battle.time - .035))
    let escape: { at: EdgePoint; safety: number; walk: (time: number) => EdgePoint } | undefined
    const tightEscape = remaining <= 0 && actor.hp <= actor.maxHp * .40
    const planningRetreat = tightEscape && actor.hp <= actor.maxHp * .25
    const directions = warningEscapeDirections(threat.area, actor)
    const paths = directions.map(axis => inside(along(actor, axis, reach), 18))
    if (tightEscape) {
      for (const ally of team) {
        if (actor === ally || isOutside(ally) || !combatHasRole(ally, "bulwark")) continue
        const at = future(battle, ally, .45)
        const path = inside(along(at, direction(at, actor), Math.min(95, edgeDistance(at, actor) * .42)), 22)
        if (edgeDistance(actor, path) <= MOVE_REACH) paths.push(path)
      }
      paths.push(...directions.map(axis => inside(along(actor, axis, MOVE_REACH), 26)))
    }
    for (const request of paths) {
      const landing = moveLanding(actor, request, battle)
      if (!landing) continue
      const distance = edgeDistance(actor, landing)
      if (distance < 12 || !tightEscape && distance > reach + 1 || summonTerrainInPath(battle, actor, landing)) continue
      const slider = glideField(battle, actor, request)
      const glide = slider?.danceRail && dancerRailContains(slider.danceRail, landing) && slider.step.operations.find(op => op.kind === "glide")
      const slide = glide ? dancerPath([actor, landing]) : undefined
      const walkSpeed = glide ? speed : movementSpeed(battle, { ...actor, move: landing })
      const arrival = battle.time + (glide ? glide.args[1] : distance / walkSpeed)
      const walkReach = Math.min(MOVE_REACH, walkSpeed * (threat.until - battle.time - .035))
      if (!glide && tightEscape && distance > walkReach + 1 && warningContains(threat, along(actor, direction(actor, landing), walkReach))) continue
      const out = glide ? undefined : availablePortalExit(battle, actor, landing, arrival)
      const route = (at: number) => slide ? dancerPointAt(slide, 1 - (1 - clamp((at - battle.time) / (arrival - battle.time), 0, 1)) ** 3)
        : walkAt(actor, landing, battle.time, arrival, at, out)
      if (warnings.some(warning => slide ? warningContains(warning, route(warning.until))
        : walkHitsWarning(actor, landing, battle.time, arrival, warning, out))) continue
      if (out && portalExitIsExposed(battle, actor, out, arrival)) continue
      if (!tightEscape && (!critical || actor.range < 200)) {
        escape = { at: request, safety: 0, walk: route }
        break
      }
      const position = out ?? landing
      const clearance = Math.min(600, ...enemies.map(unit => edgeDistance(position, future(battle, unit, arrival - battle.time))))
      const support = planningRetreat && team.some(ally => ally !== actor && combatHasRole(ally, "bulwark") &&
        !isOutside(ally) && edgeDistance(position, future(battle, ally, arrival - battle.time)) <= BULWARK_COVER.range) ? 130 : 0
      const exposed = planningRetreat && defensiveThreat(battle, { ...actor, ...position }, enemies, arrival,
        battle.time + COOLDOWN.move + COOLDOWN.shared)
      const linedUp = tightEscape ? sharedLineExposure(battle, actor, team, enemies, arrival,
        (unit, at) => unit === actor ? route(at) : future(battle, unit, at - battle.time)) : 0
      const safety = clearance + support - (exposed ? 260 : 0) - (out ? 38 : 0) - Math.max(0, 50 - borderRisk(position)) - 330 * linedUp
      if (!escape || safety > escape.safety) escape = { at: request, safety, walk: route }
    }
    if (escape) best = { actor, at: escape.at, value, canWait: !critical && !exile, walk: escape.walk }
  }
  if (!best) return false
  const { actor, at, canWait, walk } = best
  // The warning dodge should also clear the follow-up when the announced
  // opening has already been evaluated together with the enemy's next shot.
  const planned = dodges.find(dodge => dodge.actor === actor && dodge.risksFollowUp)
  if (planned?.risksFollowUp?.(walk))
    return planned.value > (attack?.value ?? 0) && moveAiFighter(battle, actor, planned.point) === null
  if (best.ejection && wardMove && wardMove.actor !== actor && wardMove.value > best.value &&
    canReturnFromShieldedShove(battle, actor, enemies) && moveAiFighter(battle, wardMove.actor, wardMove.point) === null) return true
  // Avoid spending the squad's only walk on chip damage when a teammate
  // needs it to dodge the next line after this shared opening.
  if (canWait && lineTiming && sharedDodgeWindow(battle, team.filter(unit => unit !== actor),
    enemies, "move", lineTiming === "after-opponent")) return false
  return moveAiFighter(battle, actor, at) === null
}

function borderRisk(at: EdgePoint) {
  return Math.min(at.x - FIELD.left, FIELD.right - at.x, at.y - FIELD.top, FIELD.bottom - at.y)
}

function expectsFollowUp(battle: EdgeBattle, actor: EdgeFighter, enemies: EdgeFighter[], reservingMove = false) {
  if (actor.range < 200 || actor.hp > actor.maxHp * .58) return 0
  const history = battle.runtime.histories.get(actor.id)
  const recent = reservingMove ? 1.7 : .52
  const readyWindow = reservingMove ? .95 : .28
  const horizon = reservingMove ? 1.75 : 1.12
  const wounds = history?.wounds
  const isolated = reservingMove && actor.hp <= actor.maxHp * .45 &&
    alliesOf(battle, actor.id).every(ally => ally.id === actor.id || !ally.hp || isOutside(ally) || edgeDistance(actor, ally) > 245)
  const wasHit = wounds?.some(wound => wound.time >= battle.time - (isolated ? COOLDOWN.move : recent) &&
    wound.amount >= actor.maxHp * .20)
  const incoming = isolated && battle.runtime.visuals.some(warning => warning.phase === "warning" && warning.effect === "damage" &&
    warning.until <= battle.time + 1.15 && warning.until > battle.time + .23 && !sameSide(battle, actor.id, warning.owner) &&
    areaHits(warning.area, actor) && warningDamage(battle, warning, actor) >= actor.hp * .42)
  if (!wasHit && !incoming) return 0
  const foeClock = sideOf(battle, actor.id) === "ally" ? battle.sparring!.sharedAt : battle.sharedAt
  if (foeClock > battle.time + readyWindow) return 0
  if (incoming) return .8
  return enemies.reduce((risk, enemy) => {
    const ready = Math.max(0, foeClock - battle.time, enemy.actionAt - battle.time)
    return ready <= readyWindow ? Math.max(risk, followUpRisk(battle, actor, enemy, ready, horizon, !!isolated)) : risk
  }, 0)
}

type Escort = NonNullable<ReturnType<typeof bulwarkEscort>>

function advancePastSummon(battle: EdgeBattle, enemies: EdgeFighter[], guard: Map<EdgeFighter, CoverLoss>, attack: TeamAttack) {
  const { actor, intent } = attack
  if (intent.order !== "basic" || !isSummonId(intent.target?.id) || intent.value >= .82 || moveProblem(battle, actor)) return false
  const deployment = activeDeployments(battle).find(({ deployment }) => deployment.bodies.some(body => body === intent.target))
  if (!deployment || deployment.plan.lure || deployment.plan.terrain || deployment.plan.gate || deployment.plan.guard) return false
  const candidates = enemies.filter(enemy => !isOutside(enemy))
  // A real card already in range is an alternative to walking. The chosen
  // summon may also be protecting it through a timed pulse.
  if (enemies.some(enemy => edgeDistance(actor, enemy) <= attackRange(battle, actor, enemy))) return false
  let best: { route: Approach; score: number } | undefined
  for (const target of candidates) {
    const route = approach(battle, actor, target, false, guard.get(actor))
    if (!route || route.value < 35 || dancerMovesBySkill(battle, actor, route.point)) continue
    const after = Math.max(COOLDOWN.shared + .08, route.arrival - battle.time)
    const position = future(battle, target, after)
    if (isOutside(position) || edgeDistance(route.stop, position) > attackRange(battle, actor, target) - 5) continue
    const finishing = target.hp + (target.shieldUntil > battle.time + after ? target.shield : 0) <= actor.attack * (1 - target.armor)
    const weak = actor.hp < actor.maxHp * .40 && !finishing
    if (weak && enemies.some(enemy => enemy.actionAt <= route.arrival + .25 &&
      edgeDistance(route.stop, future(battle, enemy, after)) <= attackRange(battle, enemy, actor))) continue
    const score = damageScore(battle, actor, target, 1) / (1 + after * .36)
    if (score > (best?.score ?? intent.value + .24)) best = { route, score }
  }
  return !!best && moveAiFighter(battle, actor, best.route.point) === null
}

function advanceOverBasic(battle: EdgeBattle, side: EdgeSide, front: EdgeFighter[], enemies: EdgeFighter[], guard: Map<EdgeFighter, CoverLoss>,
  attack: { actor: EdgeFighter; intent: AiAttack }) {
  // Trade a low-value backline basic for an immediate way into range. Preserve
  // finishing shots, buffs, heals and any melee unit that can already contribute.
  if (attack.intent.order !== "basic" || attack.actor.range < 200 || attack.intent.value >= 1.55) return false
  let best: { actor: EdgeFighter; point: EdgePoint; value: number } | undefined
  for (const actor of front) {
    if (moveProblem(battle, actor)) continue
    for (const target of enemies) {
      if (isOutside(target) || edgeDistance(actor, target) <= attackRange(battle, actor, target)) continue
      const route = approach(battle, actor, target, false, guard.get(actor))
      if (!route || route.value < 30) continue
      const delay = route.arrival - battle.time
      if (edgeDistance(route.stop, future(battle, target, delay)) > attackRange(battle, actor, target) * .93) continue
      if (battle.runtime.visuals.some(visual => visual.phase === "warning" && visual.effect === "damage" &&
        sideOf(battle, visual.owner) !== side && visual.until >= route.arrival && areaHits(visual.area, route.stop))) continue
      const value = .76 * actor.attack * damageScore(battle, actor, target, 1) / (1 + delay * .2)
      if (value > (best?.value ?? attack.actor.attack * attack.intent.value)) best = { actor, point: route.point, value }
    }
  }
  return !!best && moveAiFighter(battle, best.actor, best.point) === null
}

function rejoinAfterBlockedShots(battle: EdgeBattle, team: EdgeFighter[], enemies: EdgeFighter[],
  guard: Map<EdgeFighter, CoverLoss>, attack: TeamAttack) {
  const { actor, intent } = attack
  const target = intent.target
  const now = battle.time
  if (intent.order !== "basic" || !target || !isFighter(target) || actor.range < 200 ||
    team.length < 2 || enemies.length < 2 || moveProblem(battle, actor) ||
    actor.hp < actor.maxHp * .32 || actor.move || actor.force) return false
  const prior = battle.runtime.histories.get(actor.id)?.blockedBasic
  if (!prior || prior.target !== target.id || prior.count < 2 || now - prior.at > blockedBasicWindow(actor)) return false

  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const shot = projectedBasic(battle, actor, target, now, position)
  if (!shot || shot.hit.lethal || shot.hit.hpLoss > actor.attack * .22 ||
    shot.hit.shieldLoss <= 0 && !isOutside(shot.position)) return false
  if (!isOutside(shot.position) && (shot.hit.hpLoss === 0 && shot.shield - shot.hit.shieldLoss < actor.attack * .35 ||
    isOutside(previewDirectedShove(battle, target, shot.position, direction(actor, shot.position), BASIC_PUSH, shot.at)))) return false
  // A teammate already working on this shield can use the chip. Otherwise seek the fight they can reach.
  if (team.some(ally => ally !== actor && ally.actionAt <= now + 2.1 && !ally.force && !isOutside(ally) &&
    edgeDistance(position(ally, now + 1), position(target, now + 1)) <= attackRange(battle, ally, target) + 32)) return false
  const targets = enemies.filter(enemy => enemy !== target && !isOutside(enemy) &&
    team.some(ally => ally !== actor && !isOutside(ally) &&
      edgeDistance(position(ally, now + 1.6), position(enemy, now + 1.6)) <= attackRange(battle, ally, enemy) + 80))
  if (!targets.length) return false
  const foeShared = sideOf(battle, actor.id) === "ally" ? battle.sparring!.sharedAt : battle.sharedAt
  const committed = announcedStrikes(battle, actor, now + 1.95)
  let best: { route: Approach; value: number } | undefined
  for (const enemy of targets) {
    const at = position(enemy, now + 1.45)
    const route = approach(battle, actor, { ...enemy, ...at }, false, guard.get(actor))
    if (!route || route.value < 52 || dancerMovesBySkill(battle, actor, route.point)) continue
    const landing = moveLanding(actor, route.point, battle)
    if (!landing || edgeDistance(landing, route.stop) > 5) continue
    const after = Math.max(route.arrival, now + COOLDOWN.shared)
    const alongRoute = (unit: EdgeUnit, time: number) => unit === actor
      ? walkAt(actor, route.stop, now, route.arrival, time) : position(unit, time)
    // Prefer an actual shot with a second card on the target. Longer joins need a clear path
    // into allied range and safe progress now, before spending another move on the same route.
    const next = projectedBasic(battle, actor, enemy, after, alongRoute)
    const alliesNear = team.some(ally => ally !== actor && edgeDistance(position(ally, after), route.stop) <= 245)
    const exitsDuel = edgeDistance(route.stop, position(target, after)) >= attackRange(battle, target, actor, after) + 10
    const progress = edgeDistance(actor, at) - edgeDistance(route.stop, at)
    if (next && next.hit.hpLoss < actor.attack * .25 && !next.hit.lethal) continue
    if (!next && (!exitsDuel || !alliesNear && progress < 150)) continue
    if (committed.length && lifeThroughStrikes(battle, actor, committed, alongRoute).hp <= actor.hp * .55) continue
    if (enemies.some(foe => {
      const ready = Math.max(now, foe.actionAt, foeShared, foe.force ? foe.force.since + foe.force.duration : 0)
      if (ready > after + .8) return false
      return [ready, Math.max(ready, after)].some(time => {
        const hit = projectedBasic(battle, foe, actor, time, alongRoute)?.hit
        return hit && (hit.lethal || hit.hpLoss > actor.hp * .40)
      })
    })) continue
    const value = route.value + (next ? 90 + next.hit.hpLoss : 0) + (alliesNear ? 35 : 0)
    if (!best || value > best.value) best = { route, value }
  }
  return !!best && moveAiFighter(battle, actor, best.route.point) === null
}

function finishingBasic(battle: EdgeBattle, attack?: TeamAttack) {
  const target = attack?.intent.target
  return !!target && attack?.intent.order === "basic" && basicCanFinish(battle, attack.actor, target)
}

function avoidEnsemblePulse<T extends EdgeUnit>(battle: EdgeBattle, team: readonly T[]) {
  const now = battle.time
  if (!battle.runtime.summons.length) return
  const horizon = now + COOLDOWN.shared + .7
  const stays = (unit: EdgeUnit, at: number) => future(battle, unit, at - now)
  let best: { actor: T; point: EdgePoint; value: number } | undefined
  for (const { group, deployment, plan } of activeDeployments(battle)) {
    if (deployment.kind !== "ensemble" || sameSide(battle, group.owner, team[0].id)) continue
    const [attackPulse] = plan.actions!
    const body = deployment.bodies[attackPulse.slot!]
    const radius = attackPulse.step.selector.size[0]
    const ready = Math.max(now + SPARRING_STEP, body.actionsAt[0])
    if (!body.hp || ready > horizon || ready >= group.start + plan.duration) continue
    const caster = unitOf(battle, group.owner)
    if (!caster) continue
    const power = attackPulse.step.operations[0].args[0]
    const source = { ...caster, x: body.x, y: body.y }
    for (const actor of team) {
      if (actor.hp > actor.maxHp * .70 || moveProblem(battle, actor) ||
        edgeDistance(body, stays(actor, ready)) > radius) continue
      const at = stays(actor, ready)
      const aid = aidBeforeHit(battle, actor, ready, stays)
      const damage = estimateDirectHit(battle, source, actor, power, "skill", at, ready, aid.shield, aid)
      const loss = damage.hpLoss - damage.saveHeal
      if (!damage.lethal && (loss < actor.maxHp * .09 || loss < aid.hp * .20)) continue
      const speed = movementSpeed(battle, actor)
      const travel = Math.min(MOVE_REACH, speed * (ready - now - SPARRING_STEP * 2))
      if (travel < 20) continue
      const away = direction(body, actor)
      for (const turn of [0, -35, 35, -70, 70]) {
        const point = inside(along(actor, rotate(away, turn), travel), 32)
        const landing = moveLanding(actor, point, battle)
        if (!landing || edgeDistance(actor, landing) < 12 || edgeDistance(landing, body) <= radius + 10 ||
          dancerMovesBySkill(battle, actor, point) || summonTerrainInPath(battle, actor, landing)) continue
        const distance = edgeDistance(actor, landing)
        const arrival = now + distance / speed
        if (arrival >= ready - SPARRING_STEP || availablePortalExit(battle, actor, landing, arrival) ||
          walksIntoWarning(battle, actor, landing, arrival) || walksIntoAnnouncedArea(battle, actor, landing, arrival) ||
          walksIntoShoreBeast(battle, actor, landing, arrival) || exposesToEdgePush(battle, actor, landing, arrival)) continue
        const incoming = announcedStrikes(battle, actor, ready, stays)
        if (incoming.length) {
          const path = (unit: EdgeUnit, time: number) => unit === actor ? walkAt(actor, landing, now, arrival, time) : stays(unit, time)
          if (!lifeThroughStrikes(battle, actor, incoming, path).hp) continue
        }
        const value = (damage.lethal ? 5.6 : 2.05 + loss / aid.hp) - distance / 600 -
          approachExposure(battle, actor, landing, arrival) / MOVE_REACH
        if (value > (best?.value ?? 0)) best = { actor, point, value }
      }
    }
  }
  return best
}

function usePortalOpening(battle: EdgeBattle, side: EdgeSide, team: EdgeFighter[], enemies: EdgeFighter[],
  guard: Map<EdgeFighter, CoverLoss>, finishing: boolean, attack?: TeamAttack) {
  if (!battle.runtime.summons.length || !activeDeployments(battle)
    .some(({ group, plan }) => plan.gate && sideOf(battle, group.owner) === side)) return false
  if (finishing) return false
  const active = attack && attack.intent.order !== "basic" ? activeFor(attack.actor, attack.intent.order) : undefined
  const extraStep = active?.id === "dancer/Prismatic/A4" && team.every(unit => unit.hp >= unit.maxHp * .93)
  const alternatives = (attack?.intent.value ?? 0) * (extraStep ? .78 : 1)
  let best: { actor: EdgeFighter; point: EdgePoint; value: number } | undefined
  for (const actor of team) {
    if (moveProblem(battle, actor)) continue
    const route = bestPortalAdvance(battle, actor, enemies)
    if (!route || actor.actionAt > route.arrival + .65) continue
    // Prefer a short walk into a real attack. A portal for a card already in
    // striking range does not preempt a direct attack or defensive skill.
    const loss = Math.max(0, guard.get(actor)?.(route.landing, route.arrival, route.stop) ?? 0)
    const value = portalOpeningValue(route) - loss
    if (value > (best?.value ?? alternatives)) best = { actor, point: route.point, value }
  }
  return !!best && moveAiFighter(battle, best.actor, best.point) === null
}

function preferAreaDodge(battle: EdgeBattle, dodges: (AreaDodge & { actor: EdgeFighter })[], enemies: EdgeFighter[]) {
  const lethal = dodges.filter(dodge => Number.isFinite(dodge.downAt))
  const choices = lethal.length ? lethal : dodges
  let best: typeof choices[number] | undefined
  for (const dodge of choices) {
    const reply = lethal.length > 1 ? replyAfterDodge(battle, dodge.actor, enemies, dodge) : 0
    const value = dodge.value + reply
    if (!best || value > best.value) best = { ...dodge, value }
  }
  return best
}

function autoTeam(battle: EdgeBattle, side: EdgeSide, lineTiming?: "before-opponent" | "after-opponent") {
  const sparring = battle.sparring!
  const team = (side === "ally" ? battle.team : sparring.rivals).filter((unit) => unit.hp)
  const opponents = side === "ally" ? sparring.rivals : battle.team
  const livingOpponents = opponents.filter(unit => unit.hp)
  const enemies = livingOpponents.filter(unit => targetable(battle, unit))
  const returnDelay = delayCrowdedReturns(battle, team, livingOpponents)
  for (const actor of team) if (!returnDelay?.has(actor)) returnExiled(battle, actor)
  let attack: TeamAttack | undefined
  let leap: TeamMove | undefined
  let railMove: { actor: EdgeFighter } & NonNullable<ReturnType<typeof danceRailMove>> | undefined
  let retreat: TeamMove | undefined
  const dodges: (AreaDodge & { actor: EdgeFighter })[] = []
  let railRescue: (TeamMove & { saves: boolean }) | undefined
  let escort: { actor: EdgeFighter } & NonNullable<Escort["route"]> | undefined
  const guard = new Map<EdgeFighter, CoverLoss>()
  let threatenedUnit: EdgeFighter | undefined
  let earliestThreat: ReturnType<typeof defensiveThreat>
  const rails = battle.runtime.fields.filter(field => field.danceRail && (field.mode === "track" || field.mode === "dancehinge") &&
    field.until > battle.time && sideOf(battle, field.cast.owner) === side)
  const front: EdgeFighter[] = []
  for (const actor of team) {
    if (actor.force) continue
    if (isOutside(actor)) {
      // A card waiting for a safer return can still heal or ward from here.
      if (returnDelay?.has(actor) && !actionProblem(battle, actor)) {
        const intent = chooseAiAttack(battle, actor, team, enemies, true)
        if (intent && (!attack || intent.value > attack.intent.value)) attack = { actor, intent }
      }
      continue
    }
    const moving = busyMoving(battle, actor)
    if ((!moving || battle.runtime.histories.get(actor.id)?.moveReturning) && !moveProblem(battle, actor)) {
      const exit = clearShore(battle, actor)
      if (exit && (!retreat || exit.value > retreat.value)) retreat = { actor, ...exit }
    }
    if (!moveProblem(battle, actor)) {
      const safeRange = (!moving && escapeToEntryWard(battle, actor, livingOpponents)) ||
        leaveLethalTargetRange(battle, actor, livingOpponents, moving ? "announced" : "all") ||
        (!moving && dodgePortalFollowUp(battle, actor, livingOpponents))
      if (safeRange && (!retreat || safeRange.value > retreat.value)) retreat = { actor, ...safeRange }
      const area = dodgeAreaDamage(battle, actor)
      const closing = dodgeClosingField(battle, actor)
      if (area) dodges.push({ actor, ...area })
      if (closing) dodges.push({ actor, ...closing })
    }
    if (moving) continue
    const covering = combatHasRole(actor, "bulwark") && !moveProblem(battle, actor) ? bulwarkEscort(battle, actor, team, enemies) : undefined
    if (covering) guard.set(actor, covering.loss)
    if (covering?.route && (!escort || covering.route.value > escort.value)) escort = { actor, ...covering.route }
    if (!actionProblem(battle, actor)) {
      let intent = chooseAiAttack(battle, actor, team, enemies)
      if (team.length === 1 && enemies.length === 1 && livingOpponents.length === 1) {
        intent = answerRefreshingStrike(battle, actor, enemies[0], intent) ?? intent
      }
      if (intent && (!attack || intent.value > attack.intent.value)) attack = { actor, intent }
      if (!intent && actor.range < 200) front.push(actor)
    }
    if (!moveProblem(battle, actor)) {
      const jump = assistedLeap(battle, actor, enemies)
      if (jump && (!leap || jump.value > leap.value)) leap = { actor, ...jump }
      const escape = retreatFromDive(battle, actor, team, enemies)
      if (escape && (!retreat || escape.value > retreat.value)) retreat = { actor, ...escape }
      const disengage = leaveFiringLane(battle, actor, team, enemies)
      if (disengage && (!retreat || disengage.value > retreat.value)) retreat = { actor, ...disengage }
      const threat = defensiveThreat(battle, actor, enemies)
      if (threat && (!earliestThreat || threat.castAt < earliestThreat.castAt)) {
        threatenedUnit = actor
        earliestThreat = threat
      }
      for (const rail of rails) {
        if (rail.seen.has(actor.id)) continue
        const route = danceRailMove(battle, actor, enemies, rail)
        if (route?.ward && threat && route.ward.at + .035 < threat.hitAt && route.ward.until > threat.hitAt &&
          (!threat.displaces || route.advance < 38) &&
          actor.hp + route.ward.amount > threat.damage) {
          const value = route.value + 2.7
          if (!railRescue || value > railRescue.value) railRescue = { actor, point: route.point, value, saves: route.rescue }
        }
        if (route && (!railMove || route.value > railMove.value)) railMove = { actor, ...route }
      }
    }
  }
  const area = preferAreaDodge(battle, dodges, enemies)
  if (area && (!retreat || area.value > retreat.value)) retreat = area
  const clocks = side === "ally" ? battle : sparring
  const rescue = clocks.sharedAt <= battle.time
    ? rescueFromAnnouncedStrike(battle, team, livingOpponents, area?.anticipatesFollowUp ? area.actor : undefined,
      attack && { attack, afterOpponent: lineTiming === "after-opponent" }) : undefined
  const urgent = rescue && rescue.intent.value > Math.max(attack?.intent.value ?? 0, retreat?.value ?? 0) ? rescue : undefined
  if (lineTiming && !attack && !rescue && area?.anticipatesFollowUp && !Number.isFinite(area.downAt)) {
    const castAt = reserveMoveForCircle(battle, team, livingOpponents, area, lineTiming === "after-opponent")
    if (castAt !== undefined) {
      if (lineTiming === "before-opponent" && castAt <= battle.time + 1e-6) return "wait-for-circle"
      return
    }
  }
  if (retreat && retreat.value >= 5 && !finishingBasic(battle, attack) &&
    retreat.value > Math.max(attack?.intent.value ?? 0, rescue?.intent.value ?? 0) &&
    moveAiFighter(battle, retreat.actor, retreat.point) === null) return
  if (!finishingBasic(battle, attack) && evadeDamage(battle, side, team, enemies, urgent?.intent ?? attack?.intent, dodges, lineTiming,
    railRescue?.saves ? railRescue : undefined)) return
  if (urgent && issueEdgeOrder(battle, urgent.actor, urgent.intent.order, urgent.intent.target ?? null, urgent.intent.at) === null) return
  if (Math.max(clocks.moveAt, clocks.sharedAt) <= battle.time && !finishingBasic(battle, attack)) {
    const dodge = avoidEnsemblePulse(battle, team)
    if (dodge && (!retreat || dodge.value > retreat.value)) retreat = dodge
  }
  const pressure = attack && enemies.length === 1 && opponents.every(unit => !unit.hp || unit === enemies[0]) &&
    attackBetweenShields(battle, team, enemies[0], attack)
  if (pressure === "wait") {
    attack = undefined
    leap = undefined
    railMove = undefined
  } else if (pressure) {
    attack = pressure
    attack.intent.value = Math.max(attack.intent.value, 2.25)
  }
  if (attack) attack = redirectShieldedAttack(battle, team, enemies, attack) ?? attack
  const finishesNow = finishingBasic(battle, attack)
  const opening = attack && !finishesNow && pressAnOpening(battle, team, enemies, attack)
  if (opening) attack = opening
  const finishing = finishesNow
  if (!finishing && !threatenedUnit && Math.max(clocks.moveAt, clocks.sharedAt) <= battle.time) {
    const spread = spreadFromEdgePush(battle, team, enemies, actor => !busyMoving(battle, actor) && !moveProblem(battle, actor),
      (actor, at, arrival) => Math.max(0, guard.get(actor)?.(at, arrival) ?? 0))
    if (spread && (!retreat || spread.value > retreat.value)) retreat = spread
  }
  const optionalAttack = !attack || (attack.intent.order === "basic" ? attack.intent.value < 1.6
    : activeFor(attack.actor, attack.intent.order).id === "dancer/Prismatic/A4")
  const sidestep = lineTiming && !finishing && optionalAttack && Math.max(clocks.moveAt, clocks.sharedAt) <= battle.time &&
    sidestepBeforeEdgeLine(battle, team, enemies, lineTiming === "before-opponent")
  let followUp = 0
  let castingRisk = 0
  for (const actor of team) {
    if (busyMoving(battle, actor) || isOutside(actor) || moveProblem(battle, actor)) continue
    const risk = expectsFollowUp(battle, actor, enemies)
    followUp = Math.max(risk, followUp)
    if (actor === attack?.actor) castingRisk = risk
  }
  // Even a strong area attack rarely pays for losing the caster to an
  // immediately available follow-up. Keep the shared action for the dodge.
  const committing = attack && attack.intent.order !== "basic" && attack.intent.value < (castingRisk >= 1 ? 4.5 : followUp >= 1 ? 2.9 : 2.15) &&
    activeFor(attack.actor, attack.intent.order).steps[0]?.operations.some(op => op.kind === "d")
  const cover = threatenedUnit && escapeToGuard(battle, threatenedUnit, team, enemies)
  if (railRescue && !finishing && railRescue.value > (attack?.intent.value ?? .5) &&
    moveAiFighter(battle, railRescue.actor, railRescue.point) === null) return
  if (cover && threatenedUnit && !finishing && cover.value > (attack?.intent.value ?? .5) &&
    moveAiFighter(battle, threatenedUnit, cover.point) === null) return
  if (retreat && (!threatenedUnit || retreat.actor === threatenedUnit) && !finishing &&
    retreat.value > (attack?.intent.value ?? .5) &&
    moveAiFighter(battle, retreat.actor, retreat.point) === null) return
  if (escort?.rescue && (!threatenedUnit || escort.rescue === threatenedUnit) &&
    escort.value > (attack?.intent.value ?? 0) && moveAiFighter(battle, escort.actor, escort.point) === null) return
  if (sidestep && sidestep.value > (attack?.intent.value ?? .5)) {
    const hold = sharedDodgeWindow(battle, team, livingOpponents, "move", lineTiming === "after-opponent", undefined, sidestep.actor)
    if (hold && lineTiming === "before-opponent" && hold.castAt === battle.time) return true
    if (!hold && moveAiFighter(battle, sidestep.actor, sidestep.point) === null) return
  }
  if (lineTiming && !finishing && attack && (attack.intent.order === "basic" || activeFor(attack.actor, attack.intent.order).steps[0]?.operations.some(op => op.kind === "d")) &&
    Math.max(clocks.moveAt, clocks.sharedAt) <= battle.time) {
    const line = imminentLineFinish(battle, team, livingOpponents, lineTiming === "before-opponent")
    if (line && !worthTradingForLine(battle, attack, livingOpponents, line)) {
      if (line.castAt === battle.time) return true
      return
    }
  }
  if (followUp > 0 && (optionalAttack || committing)) return
  const openMove = Math.max(clocks.moveAt, clocks.sharedAt) <= battle.time
  const canReserveDodge = !finishing && team.length > 1 && livingOpponents.length > 0 && clocks.sharedAt <= battle.time
  if (attack && canReserveDodge) {
    const threat = sharedDodgeWindow(battle, team, livingOpponents, "attack", lineTiming === "after-opponent")
    if (threat && !worthTradingForLine(battle, attack, livingOpponents, threat)) {
      if (lineTiming === "before-opponent" && threat.castAt === battle.time) return true
      return
    }
  }
  const railLanding = railMove?.ward && moveLanding(railMove.actor, railMove.point, battle)
  const railProtection = railMove?.ward && railLanding ? {
    actor: railMove.actor, landing: railLanding, stop: railLanding, arrival: railMove.arrival,
    ward: { at: railMove.ward.at, shield: railMove.ward.amount, shieldUntil: railMove.ward.until },
  } : undefined
  const moveWindow = canReserveDodge && livingOpponents.length > 1 && openMove && !attack &&
    sharedDodgeWindow(battle, team, livingOpponents, "move", lineTiming === "after-opponent", railProtection)
  if (lineTiming === "before-opponent" && moveWindow && moveWindow.castAt === battle.time) return true
  const saveAdvance = !!moveWindow
  const reserveForFollowUp = team.some(actor => !busyMoving(battle, actor) && !isOutside(actor) && !moveProblem(battle, actor) &&
    expectsFollowUp(battle, actor, enemies, true) > .55)
  const reserveMove = !!threatenedUnit || reserveForFollowUp
  if (!finishing && team.length > 1 && (attack?.intent.value ?? 0) < 4.6 && Math.max(clocks.moveAt, clocks.sharedAt) <= battle.time) {
    let withdrawal: ({ actor: EdgeFighter } & NonNullable<ReturnType<typeof leaveLethalAreaReach>>) | undefined
    for (const actor of team) {
      const route = leaveLethalAreaReach(battle, actor, enemies) ?? leaveConcentratedFire(battle, actor, team, enemies)
      if (!route || route.value <= (attack?.intent.value ?? 0)) continue
      if (!withdrawal || route.downAt < withdrawal.downAt - SPARRING_STEP ||
        route.downAt <= withdrawal.downAt + SPARRING_STEP && route.value > withdrawal.value) withdrawal = { actor, ...route }
    }
    if (withdrawal && moveAiFighter(battle, withdrawal.actor, withdrawal.point) === null) return
  }
  if (!reserveMove && !saveAdvance) {
    if (pressure !== "wait" && team.length === 1 && enemies.length === 1 && livingOpponents.length === 1) {
      const [actor] = team
      const [enemy] = enemies
      const route = !moveProblem(battle, actor) && (followDuelHit(battle, actor, enemy) ||
        pressureShieldFromAnAngle(battle, actor, enemy, attack?.intent))
      if (route && moveAiFighter(battle, actor, route.point) === null) return
    }
    if (!attack && enemies.length === 1 && livingOpponents.length === 1 && openMove) {
      const [enemy] = enemies
      let pursuit: TeamMove | undefined
      for (const actor of team) {
        if (moveProblem(battle, actor)) continue
        const route = pursueDuelFinish(battle, actor, enemy, (target, range) =>
          approach(battle, actor, target, false, guard.get(actor), undefined, range))
        if (route && (!pursuit || route.value > pursuit.value)) pursuit = { actor, ...route }
      }
      if (pursuit && moveAiFighter(battle, pursuit.actor, pursuit.point) === null) return
      if (team.length === 1 && pressure !== "wait") {
        const [actor] = team
        const route = !moveProblem(battle, actor) && duelFootwork(battle, actor, enemy, side === "ally" ? sparring.sharedAt : battle.sharedAt)
        if (route && moveAiFighter(battle, actor, route.point) === null) return
      }
    }
    if (leap && (!attack || leap.value > attack.intent.value + .12) && moveAiFighter(battle, leap.actor, leap.point) === null) return
    if (railMove && railMove.value > (attack?.intent.value ?? .52) + .12 && !finishing &&
      moveAiFighter(battle, railMove.actor, railMove.point) === null) return
    if (escort && (!attack || attack.intent.order === "basic" && !finishing && escort.value > attack.intent.value) &&
      moveAiFighter(battle, escort.actor, escort.point) === null) return
    if (!finishing && !retreat && openMove &&
      (!attack || attack.intent.value < 2.45)) {
      const pursuit = followUpApproach(battle, team, enemies, (actor, target, at, finishingRange) => {
        const route = approach(battle, actor, { ...target, ...at }, false, guard.get(actor), undefined, finishingRange)
        return route && route.value >= 35 ? route : undefined
      })
      if (pursuit && pursuit.value > (attack?.intent.value ?? .5) && moveAiFighter(battle, pursuit.actor, pursuit.point) === null) return
    }
    if (usePortalOpening(battle, side, team, enemies, guard, finishing, attack)) return
    if (attack && rejoinAfterBlockedShots(battle, team, enemies, guard, attack)) return
    if (attack && advancePastSummon(battle, enemies, guard, attack)) return
    if (attack && advanceOverBasic(battle, side, front, enemies, guard, attack)) return
    if (!attack && pressure !== "wait" && openMove &&
      prepareForReturn(battle, side, team, enemies, guard)) return
  }
  // A preparatory walk may leave time for a teammate to stop the last enemy's line.
  const lineToInterrupt = canReserveDodge && livingOpponents.length === 1 && earliestThreat?.line && !reserveForFollowUp &&
    earliestThreat.castAt >= battle.time + COOLDOWN.shared ? earliestThreat : undefined
  if ((!reserveMove || lineToInterrupt) && !attack && pressure !== "wait" && enemies.length && openMove) {
    const advance = findTeamAdvance(battle, side, team, enemies, guard)
    if (advance && (!lineToInterrupt || interruptsLineAfterAdvance(battle, team, enemies[0],
      { ...advance.route, actor: advance.actor }, lineToInterrupt.castAt)) &&
      (!saveAdvance || !dancerMovesBySkill(battle, advance.actor, advance.route.point) &&
      !sharedDodgeWindow(battle, team, livingOpponents, "move", lineTiming === "after-opponent", { ...advance.route, actor: advance.actor }))) {
      const startBy = advance.actor.actionAt - (advance.route.arrival - battle.time)
      // Hold a preparatory walk if the fighter can still arrive in time for
      // its next action after a teammate spends the move on a dodge.
      if (canReserveDodge && livingOpponents.length === 1 && startBy > battle.time + COOLDOWN.move) {
        const line = sharedDodgeWindow(battle, team, livingOpponents, "move", lineTiming === "after-opponent",
          { ...advance.route, actor: advance.actor })
        const frame = Math.ceil(AI_THINK_INTERVAL / SPARRING_STEP) * SPARRING_STEP
        const moveRecovery = Math.ceil(COOLDOWN.move / frame) * frame
        if (line && line.castAt + moveRecovery + SPARRING_STEP < startBy) {
          if (lineTiming === "before-opponent" && line.castAt === battle.time) return true
          return
        }
      }
      if (lineTiming === "before-opponent" && waitForAreaBeforeAdvance(battle, advance.actor, advance.route, team, livingOpponents))
        return "wait-for-circle"
      if (moveAiFighter(battle, advance.actor, advance.route.point) === null) return
    }
  }
  if (attack) {
    const duel = team.length === 1 && enemies.length === 1 && livingOpponents.length === 1
    const exchange = duel && answerShieldExchange(battle, enemies[0], attack, lineTiming)
    if (exchange === "react") return true
    if (exchange === "wait") return
    if (exchange) attack = exchange
    if (team.length === 1) {
      const finish = waitForClearFinish(battle, attack, enemies, lineTiming === "before-opponent")
      if (finish === "react") return true
      if (finish === "wait") return
    }
    const { actor, intent } = attack
    const cover = intent.order !== "basic" && islandReturnCover(battle, actor, activeFor(actor, intent.order), intent.at, team, livingOpponents)
    const at = cover && moveAiFighter(battle, cover.patient, cover.point) === null ? cover.aim : intent.at
    issueEdgeOrder(battle, actor, intent.order, intent.target ?? null, at)
  }
}

function prepareForReturn(battle: EdgeBattle, side: EdgeSide, team: EdgeFighter[], enemies: EdgeFighter[], guard: Map<EdgeFighter, CoverLoss>) {
  if (enemies.length !== 1 || !isOutside(enemies[0])) return false
  const [target] = enemies
  const walk = committedReturn(battle, target)
  const now = battle.time
  if (!walk || walk.arrival > now + COOLDOWN.move || target.hp > target.maxHp * .38) return false
  const foeClock = side === "ally" ? battle.sparring! : battle
  const response = Math.max(walk.arrival, foeClock.sharedAt, target.actionAt)
  if (response > now + COOLDOWN.move + .4) return false
  const aim = walk.landing
  const stands = (unit: EdgeUnit, time: number) => future(battle, unit, time - now)
  const score = teamAdvanceScoring(battle, side, team, enemies)
  let best: { actor: EdgeFighter; request: EdgePoint; value: number } | undefined
  for (const actor of team) {
    if (moveProblem(battle, actor) || busyMoving(battle, actor) || isOutside(actor) ||
      actor.actionAt < response + .45 || actor.actionAt > response + COOLDOWN.move ||
      !clearReturnLane(battle, actor, target, actor.actionAt, stands)) continue
    const danger = attackRange(battle, target, actor, response) + 15
    const vector = direction(aim, inside(aim, 210))
    const line = announcedStrikes(battle, actor, Math.min(actor.actionAt, now + COOLDOWN.move + .35))
    // Leave room to react to the returning card while keeping a shot available.
    for (const angle of [0, -50, 50, -82, 82]) {
      const request = inside(along(aim, rotate(vector, angle), danger + 48), 34)
      const landing = moveLanding(actor, request, battle)
      if (!landing || dancerMovesBySkill(battle, actor, request) || summonTerrainInPath(battle, actor, landing)) continue
      const length = edgeDistance(actor, landing)
      const arrival = now + length / movementSpeed(battle, actor)
      if (length < 35 || arrival > response - .1 || edgeDistance(landing, aim) < danger + 22 ||
        borderRisk(landing) < borderRisk(actor) + 35 ||
        availablePortalExit(battle, actor, landing, arrival) ||
        walksIntoAnnouncedArea(battle, actor, landing, arrival) ||
        walksIntoWarning(battle, actor, landing, arrival) ||
        walksIntoShoreBeast(battle, actor, landing, arrival)) continue
      const path = { landing, stop: landing, arrival }
      const reduction = Math.max(0, guard.get(actor)?.(landing, arrival) ?? 0) * MOVE_REACH
      const projected = (unit: EdgeUnit, time: number) => unit === actor ? walkAt(actor, landing, now, arrival, time) : stands(unit, time)
      if (!clearReturnLane(battle, actor, target, actor.actionAt, projected)) continue
      if (line.length && (lifeThroughStrikes(battle, actor, line, projected).hp < actor.hp ||
        line.some(contact => announcedShift(battle, contact, actor, projected)))) continue
      const value = 75 + Math.min(90, borderRisk(landing) - borderRisk(actor)) -
        Math.max(0, edgeDistance(landing, aim) - edgeDistance(actor, aim)) * .32 - length * .22 -
        reduction + score(actor, target, path)
      if (value > (best?.value ?? 82)) best = { actor, request, value }
    }
  }
  return !!best && moveAiFighter(battle, best.actor, best.request) === null
}

function findTeamAdvance(battle: EdgeBattle, side: EdgeSide, team: EdgeFighter[], enemies: EdgeFighter[], guard: Map<EdgeFighter, CoverLoss>) {
  const score = teamAdvanceScoring(battle, side, team, enemies)
  const spectrumAdvance = spectrumAdvanceScoring(battle, team)
  let move: { actor: EdgeFighter; route: Approach } | undefined
  for (const actor of team) {
    if (busyMoving(battle, actor) || isOutside(actor) || moveProblem(battle, actor) || basicTarget(battle, actor)) continue
    if (actor.hp <= actor.maxHp * .20 && actor.actionAt > battle.time + 1.2 &&
      enemies.some(enemy => edgeDistance(actor, enemy) <= attackRange(battle, enemy, actor) + MOVE_REACH)) continue
    const lead = Math.min(COOLDOWN.move, Math.max(COOLDOWN.shared, actor.actionAt - battle.time))
    const goals = enemies.map(target => {
      const at = future(battle, target, lead)
      return { target, at, distance: edgeDistance(actor, at) }
    })
    const nearest = Math.min(...goals.map(goal => goal.distance))
    for (const { target, at, distance } of goals) {
      const flank = combatHasRole(actor, "assassin") && exposedBackline(battle, target)
      const gap = distance - nearest
      if (gap > MOVE_REACH + (flank ? 130 : 60)) continue
      const route = approach(battle, actor, { ...target, ...at }, false, guard.get(actor), (path, exposure) =>
        score(actor, target, path, exposure) + (spectrumAdvance?.(actor, target, path) ?? 0) - gap * .26 + (flank ? 25 : 0))
      if (!route || route.value <= (move?.route.value ?? 0)) continue
      if (actor.hp <= actor.maxHp * .25 && actor.actionAt > route.arrival + .7 &&
        defensiveThreat(battle, { ...actor, ...route.stop }, enemies, route.arrival)) continue
      move = { actor, route }
    }
  }
  return move
}

function respondToAnnouncedStrike(battle: EdgeBattle, side: EdgeSide, nextDecision?: number) {
  const sparring = battle.sparring!
  const clocks = side === "ally" ? battle : sparring
  if (clocks.sharedAt > battle.time) return false
  const team = (side === "ally" ? battle.team : sparring.rivals).filter(unit => unit.hp)
  const opponents = (side === "ally" ? sparring.rivals : battle.team).filter(unit => unit.hp)
  const enemies = opponents.filter(unit => targetable(battle, unit))
  const spendUntil = battle.time + COOLDOWN.shared
  let escape: { actor: EdgeFighter; point: EdgePoint; value: number } | undefined
  const dodges: (AreaDodge & { actor: EdgeFighter })[] = []
  for (const actor of team) {
    if (moveProblem(battle, actor)) continue
    if (nextDecision === undefined) {
      const step = leaveLethalTargetRange(battle, actor, enemies, "announced")
      if (step && step.value > (escape?.value ?? 0)) escape = { actor, ...step }
    }
    const canRiskPursuit = nextDecision !== undefined && !team.some(other => other !== actor && other.actionAt < spendUntil &&
      (!other.force || other.force.since + other.force.duration < spendUntil))
    const area = nextDecision === undefined ? dodgeAreaDamage(battle, actor)
      : dodgeBeforeNextThink(battle, actor, nextDecision, canRiskPursuit)
    if (area) dodges.push({ actor, ...area })
  }
  const safe = nextDecision === undefined ? dodges : dodges.filter(dodge => !dodge.exposedToPursuit)
  const area = preferAreaDodge(battle, safe.length ? safe : dodges, enemies)
  if (nextDecision !== undefined) {
    if (!area) return false
    const [last] = opponents
    if (opponents.length === 1) {
      const winner = team.find(actor => actor.range < 200 && !isOutside(actor) && !actionProblem(battle, actor) &&
        basicTarget(battle, actor) === last && basicCanFinish(battle, actor, last))
      if (winner && issueEdgeOrder(battle, winner, "basic", last) === null) return true
    }
  }
  if (area && area.value > (escape?.value ?? 0)) escape = area
  const anticipatesFollowUp = area?.anticipatesFollowUp
  const rescue = rescueFromAnnouncedStrike(battle, team, anticipatesFollowUp ? opponents : undefined, anticipatesFollowUp ? area.actor : undefined)
  if (escape && escape.value > (rescue?.intent.value ?? 0) && moveAiFighter(battle, escape.actor, escape.point) === null) return true
  if (nextDecision === undefined && rescue && evadeDamage(battle, side, team, enemies, rescue.intent, dodges)) return true
  return !!rescue && issueEdgeOrder(battle, rescue.actor, rescue.intent.order, rescue.intent.target ?? null, rescue.intent.at) === null
}

function reactWhenMoveUnlocks(battle: EdgeBattle, previous: number) {
  if (!Number.isFinite(battle.nextThinkAt)) return
  const now = battle.time
  const sparring = battle.sparring
  const nextDecision = sparring ? now + Math.ceil((battle.nextThinkAt - now) / SPARRING_STEP - 1e-6) * SPARRING_STEP
    : battle.nextThinkAt
  const canReact = (side: EdgeSide, clocks: EdgeCooldowns) => {
    const ready = Math.max(clocks.moveAt, clocks.sharedAt)
    return ready <= now && (ready > previous || !sparring) && battle.runtime.pending.some(({ strike, due }) =>
      strike && "area" in strike && sideOf(battle, strike.cast.owner) !== side &&
      (ready > previous || (strike.cast.issuedAt ?? -Infinity) >= previous) &&
      due + (strike.releaseLead ?? 0) <= nextDecision + COOLDOWN.shared)
  }
  // Movement's shared cooldown can end between ordinary AI decisions.
  // Only act early when the extra travel time makes an escape possible.
  if (sparring) {
    const first = sparring.first
    const second = first === "ally" ? "enemy" : "ally"
    if (canReact(first, first === "ally" ? battle : sparring)) respondToAnnouncedStrike(battle, first, nextDecision)
    if (battle.phase === "running" && canReact(second, second === "ally" ? battle : sparring))
      respondToAnnouncedStrike(battle, second, nextDecision)
  } else if (!battle.telegraph && canReact("enemy", battle.boss) && !moveProblem(battle, battle.boss)) {
    const dodge = dodgeBeforeNextThink(battle, battle.boss, nextDecision)
    if (!dodge) return
    const finish = !actionProblem(battle, battle.boss) && lastCardFinish(battle)
    if (finish) bossOrder(battle)
    else moveAiFighter(battle, battle.boss, dodge.point)
  }
}

function stepAi(battle: EdgeBattle, previous: number) {
  if (battle.preview || battle.phase !== "running") return
  if (battle.sparring && battle.time >= SPARRING_DURATION) {
    finishEdgeBattle(battle, "draw")
    return
  }
  finishBossCharge(battle)
  if (battle.phase !== "running") return
  if (battle.time < battle.nextThinkAt) {
    reactWhenMoveUnlocks(battle, previous)
    return
  }
  battle.nextThinkAt = battle.time + AI_THINK_INTERVAL
  const sparring = battle.sparring
  if (!sparring) {
    bossOrder(battle)
    return
  }
  const first = sparring.first
  sparring.first = first === "ally" ? "enemy" : "ally"
  const waiting = autoTeam(battle, first, "before-opponent")
  if (battle.phase !== "running") return
  autoTeam(battle, sparring.first, "after-opponent")
  // Either side can answer a newly committed shot in the same decision frame.
  // Score all reactions before spending the team's shared movement.
  const committed = battle.phase === "running" && battle.runtime.pending.find(({ strike }) =>
    strike?.cast.issuedAt === battle.time && sideOf(battle, strike.cast.owner) !== first)
  if (committed) {
    const returning = first === "ally" ? battle.team : sparring.rivals
    for (const actor of returning) if (actor.move) returnExiled(battle, actor)
    if (respondToAnnouncedStrike(battle, first)) return
  }
  // If the enemy used the window for something else, continue this same frame.
  if (waiting && battle.phase === "running" &&
    (waiting !== "wait-for-circle" || !committed || committed.strike?.step?.selector.shape !== "C")) autoTeam(battle, first)
}

export function stepEdgeBattle(battle: EdgeBattle, dt: number) {
  if (battle.phase === "running") {
    if (battle.sparring) dt = Math.min(dt, Math.max(0, SPARRING_DURATION - battle.time))
    if (battle.pveLimit) dt = Math.min(dt, Math.max(0, battle.pveLimit - battle.time))
    const previous = battle.time
    battle.time += dt
    for (const unit of battleUnits(battle)) moveUnit(battle, unit, dt)
    tickSkills(battle, dt)
    if (battle.phase === "running" && !battle.preview) tickGrowth(battle, dt)
    for (const target of battle.preview?.targets ?? []) {
      if (target.hp && target.telegraph && battle.phase === "running" && battle.time >= target.telegraph.until)
        resolveCharge(battle, target.telegraph, target)
    }
    stepAi(battle, previous)
    if (battle.pveLimit && battle.phase === "running" && battle.time >= battle.pveLimit - 1e-6) finishEdgeBattle(battle, "lost")
  } else {
    const finished = battle.finishedAt
    if (finished === null) return false
    const runtime = battle.runtime
    const ending = runtime.effects.filter(effect => effect.start <= finished && effect.phase !== "windup")
    const until = Math.max(finished + FX_TIME, ...ending.map(effect => effect.end),
      ...runtime.visuals.map(area => area.until), ...runtime.notices.map(notice => notice.until), battle.notice?.until ?? finished)
    if (battle.time >= until) return false
    runtime.effects = ending
    battle.time = Math.min(battle.time + dt, until)
    pruneSummons(battle)
    runtime.visuals = runtime.visuals.filter(area => area.until > battle.time)
    runtime.notices = runtime.notices.filter(notice => notice.until > battle.time)
    if (battle.time >= until) {
      runtime.shieldCasts.clear()
      for (const unit of battleUnits(battle)) {
        unit.shield = 0
        unit.shieldStart = 0
        unit.shieldUntil = 0
        unit.shieldHalf = false
        unit.guardUntil = 0
      }
    }
  }
  if (battle.cues.length && battle.cues[0].time + FX_TIME <= battle.time) battle.cues = battle.cues.filter(({ time }) => time + FX_TIME > battle.time)
  if (battle.impacts.length && battle.impacts[0].time + FX_TIME <= battle.time) battle.impacts = battle.impacts.filter(({ time }) => time + FX_TIME > battle.time)
  if (battle.runtime.effects.length) battle.runtime.effects = battle.runtime.effects.filter(({ end }) => end > battle.time)
  if (battle.notice && battle.notice.until <= battle.time) battle.notice = null
  return true
}
