import type { EdgeBattle, EdgeFighter, EdgeUnit, EdgeUnitId } from "../edgeBattle"
import type { EdgeActive, EdgeGold } from "./catalog"
import type { DancerRail } from "./dancerChoreo"
import type { EdgeArea, EdgePoint } from "./geometry"
import type { Mark, SkillVisual } from "./presentation"
import type { Rule, Selector, Step } from "./program"
import type { SummonGroup } from "./summons"

export interface Trace {
  at: EdgePoint
  hits: number
  effectiveHits?: number
  damage: number
  heal: number
  shield: boolean
  shieldValue?: number
  pulledTo?: EdgePoint
  approach?: EdgePoint
  pushedTo?: EdgePoint
  pushMotion?: NonNullable<EdgeUnit["force"]>
  hitAt?: number
  firstAxis?: EdgePoint
}

export interface SkillCast {
  id: number
  owner: EdgeUnitId
  target?: EdgeUnitId
  skill?: EdgeActive
  signature?: { id: string; mark: Mark; origin?: EdgePoint }
  summon?: SummonGroup
  /** Physical attacker of a deployment action; `owner` remains the caster for legacy skill semantics. */
  summonBody?: EdgeUnitId
  wardenRoute?: { from: EdgePoint; to: EdgePoint }
  berserkerRoute?: { from: EdgePoint; to: EdgePoint }
  berserkerFollow?: EdgeActive
  berserkerFollowCast?: SkillCast
  berserkerLeg?: number
  berserkerLaunch?: EdgePoint
  berserkerLeech?: number
  paladinRoute?: { from: EdgePoint; to: EdgePoint; swap?: boolean }
  paladinLaunch?: EdgePoint
  paladinVow?: { cast: SkillCast; scale: number }
  paladinReplies?: number
  paladinBrace?: Map<EdgeUnitId, { cast: SkillCast; value: number }>
  spellRoute?: { from: EdgePoint; to: EdgePoint }
  spellReversal?: { cast: SkillCast; scale: number }
  spellBasic?: { cast: SkillCast; scale: number }
  spellTravelScale?: number
  assassinRoute?: { from: EdgePoint; to: EdgePoint }
  warlockRoute?: { from: EdgePoint; to: EdgePoint }
  warlockLaunch?: EdgePoint
  lifeLaunch?: EdgePoint
  lifeRecipients?: { id: EdgeUnitId; at: EdgePoint }[]
  lifePast?: { id: EdgeUnitId; at: EdgePoint }[]
  lifeHits?: { id: EdgeUnitId; at: EdgePoint }[]
  lifeOverflow?: Map<EdgeUnitId, number>
  lifeHistoric?: Map<EdgeUnitId, number>
  lifeHealCounts?: Map<EdgeUnitId, number>
  lifeFirstHeal?: EdgeUnitId
  lifePrimary?: EdgeUnitId
  lifeFollowFrom?: EdgePoint
  lifeLegacy?: { cast: SkillCast; paid: Set<EdgeUnitId> }
  healerHeals?: Map<EdgeUnitId, { id: EdgeUnitId; at: EdgePoint; before: number }>
  healerArea?: EdgeArea
  healerPrimary?: EdgeUnitId
  healerCleaned?: Set<EdgeUnitId>
  bardRange?: { cast: SkillCast; at: EdgePoint; area: EdgeArea; amount: number; baseline: number }
  bardGuideLimit?: number
  bardVoices?: Map<EdgeUnitId, EdgePoint>
  bardSeats?: { id: EdgeUnitId; from: EdgePoint; landing: EdgePoint }[]
  binderLink?: [EdgeUnitId, EdgeUnitId]
  binderWells?: Set<EdgePoint>
  binderSlowBonus?: number
  binderBrace?: EdgeUnitId
  danceFirstHit?: EdgeUnitId
  warlockSecond?: EdgePoint
  warlockHits?: { id: EdgeUnitId; at: EdgePoint }[]
  warlockSlowed?: Set<EdgeUnitId>
  warlockSteady?: { cast: SkillCast; value: number }
  warlockRim?: EdgeUnitId
  warlockAid?: { cast: SkillCast; recipient: EdgeUnitId; target: EdgeUnitId }[]
  assassinNeighbors?: { id: EdgeUnitId; gap: number }[]
  assassinLaunch?: EdgePoint
  assassinContact?: EdgePoint
  assassinReturnEdge?: EdgePoint
  assassinFollowFrom?: EdgePoint
  previousHandTarget?: EdgeUnitId
  assassinHitLow?: boolean
  assassinHitPushed?: boolean
  assassinHitOutside?: boolean
  interrupted?: Set<EdgeUnitId>
  firstWard?: EdgeUnitId
  order: "basic" | "skill" | "enemy"
  issuedAt?: number
  from: EdgePoint
  aim: EdgePoint
  basis: number
  outside: boolean
  trace: Map<EdgeUnitId, Trace>
  hitStages: Set<number>
  extraPush: Map<EdgeUnitId, { length: number; axis?: EdgePoint; wardenRelay?: SkillCast; assassinRelay?: SkillCast; berserkerPush?: SkillCast[]; bardPushes?: SkillEvent["bardPushes"]; passiveBeats?: NonNullable<SkillVisual["passive"]>[] }>
  used: Set<string>
  damage: number
  heals: number
  protection?: { target: EdgeUnitId; kind: "heal" | "shield"; duration?: number }
  stage: number
  pending: number
}

export interface SkillEvent {
  kind: string
  cast: SkillCast
  source?: EdgeUnitId
  attacker?: EdgeUnitId
  target?: EdgeUnitId
  shieldOwner?: EdgeUnitId
  brokenShield?: SkillCast
  guardBreak?: boolean
  wardConfirmed?: (() => void)[]
  mendConfirmed?: (() => void)[]
  strikeConfirmed?: (() => void)[]
  attackCast?: SkillCast
  paladinRecipient?: EdgeUnitId
  previousInterrupt?: EdgeUnitId
  clearedAreas?: readonly EdgeArea[]
  motionSeconds?: number
  danceWalk?: boolean
  danceGroup?: readonly { id: EdgeUnitId; from: EdgePoint; landing: EdgePoint }[]
  binderMotion?: NonNullable<EdgeUnit["force"]>
  binderBend?: "rail" | "axis" | "tide" | "inverse"
  binderTangent?: boolean
  binderLongRail?: boolean
  binderChanged?: boolean
  braceUses?: number
  intercept?: EdgePoint
  wardenRelay?: SkillCast
  assassinRelay?: SkillCast
  assassinMove?: string
  assassinEnemy?: EdgeUnitId
  escapedWarning?: boolean
  dotTick?: number
  dotCount?: number
  healTick?: number
  healCount?: number
  historicHealed?: number
  healCountBefore?: number
  healTrigger?: SkillCast
  lifeSecondary?: EdgeUnitId
  healedGroup?: readonly { id: EdgeUnitId; at: EdgePoint }[]
  healerRole?: string
  bardGuide?: SkillCast
  bardTurned?: boolean
  bardPartners?: readonly EdgePoint[]
  bardStrikes?: { cast: SkillCast; watch?: Watch; field?: FieldEffect; amount: number }[]
  bardPushes?: { cast: SkillCast; amount: number; watch?: Watch; turn?: EdgeGold }[]
  cleansed?: readonly string[]
  summon?: EdgeUnitId
  relay?: EdgeUnitId
  zone?: boolean
  visualSkill?: string
  at?: EdgePoint
  from?: EdgePoint
  landing?: EdgePoint
  area?: EdgeArea
  selector?: Selector
  stepDelay?: number
  release?: string
  hitGroup?: readonly { id: EdgeUnitId; at: EdgePoint }[]
  pushGroup?: readonly { id: EdgeUnitId; from: EdgePoint; motion: NonNullable<EdgeUnit["force"]> }[]
  wardPair?: readonly EdgeUnitId[]
  passiveBeats?: NonNullable<SkillVisual["passive"]>[]
  berserkerPush?: SkillCast[]
  index?: number
  total?: number
  amount?: number
  raw?: number
  absorbed?: number
  critical?: boolean
  lowBefore?: number
  distance?: number
  overheal?: number
  direct?: boolean
  derived?: boolean
  proc?: string
  style?: string
  bonus?: number
  scale?: number
  push?: number
  axis?: EdgePoint
  reflected?: boolean
}

export interface Buff {
  id: string
  cast: SkillCast
  target: EdgeUnitId
  kind: string
  values: number[]
  style: string
  until: number
}

export interface Watch {
  id: string
  cast: SkillCast
  target: EdgeUnitId
  rule: Rule
  step: Step
  event?: SkillEvent
  uses: number
  until: number
  derived: boolean
  gold?: string
}

export interface FieldEffect {
  id: number
  cast: SkillCast
  area: EdgeArea
  step: Step
  mode: string
  seen: Set<EdgeUnitId>
  previous: Set<EdgeUnitId>
  time: number
  until: number
  next: number
  capacity: number
  derived: boolean
  gold?: string
  event?: SkillEvent
  danceRail?: DancerRail
  danceStill?: Map<EdgeUnitId, number>
}

export interface AreaVisual {
  id: number
  custom?: boolean
  owner: EdgeUnitId
  area: EdgeArea
  phase: "warning" | "impact" | "zone"
  time: number
  until: number
  gold?: boolean
  name?: string
  effect?: "damage" | "heal" | "shield" | "control"
  damagePower?: number
  pushDistance?: number
  shove?: { cast: SkillCast; step: Step; operation: Step["operations"][number] }
  closing?: { cast: SkillCast; step: Step }
  clearsSummons?: boolean
  strike?: PendingStrike
}

export interface UnitHistory {
  pushAt: number
  pushBy?: EdgeUnitId
  pullAt: number
  pullBy?: EdgeUnitId
  interruptAt: number
  interruptBy?: EdgeUnitId
  interruptSkill?: EdgeActive
  hitAt: number
  hitBy?: EdgeUnitId
  wardBroken?: { at: number; by: EdgeUnitId; capacity: number }
  movedAt: number
  returnedAt?: number
  walkedAt?: number
  dashAt?: number
  dashBy?: EdgeUnitId
  wardenInside?: boolean
  lastBasicTarget?: EdgeUnitId
  blockedBasic?: { target: EdgeUnitId; at: number; count: number }
  lastHandTarget?: EdgeUnitId
  shadowWarnings?: { area: EdgeArea; until: number; source?: EdgeUnitId; visual?: number }[]
  warlockStillSpent?: number
  lastInterruptTarget?: EdgeUnitId
  skillMovedAt?: number
  moveReturning?: boolean
  binderControl?: Map<EdgeUnitId, number>
  binderFold?: { cast: SkillCast; end: EdgePoint }
  danceStep?: { cast: SkillCast; end: EdgePoint }
  danceReturns?: number
  danceReturnedAt?: number
  from: EdgePoint
  standAt: number
  healerStandingSpent?: number
  wounds: { time: number; amount: number }[]
  positions: { time: number; at: EdgePoint }[]
  attackers: Set<EdgeUnitId>
  handAttackers?: Map<EdgeUnitId, EdgePoint>
}

export const blockedBasicWindow = (unit: EdgeUnit) => unit.actionCooldown * 2.5

export type PendingStrike = { cast: SkillCast; power: number; step?: Step; needsUnforcedOwner?: boolean; displacementDuration?: number;
  originLimit?: { distance: number; exclusive?: boolean } } & (
  { area: EdgeArea; needsOwner: boolean; limitedPush?: Step; rimPush?: { area: EdgeArea; step: Step };
    limitedDamage?: Step; releaseLead?: number; excludedTarget?: EdgeUnitId } |
  { target: EdgeUnitId; range?: number; locksAt?: number; afterLock?: number;
    outsideLock?: boolean; projectile?: "assassin" | "warlock" | "berserker"; launchedFrom?: EdgePoint;
    deliveryRange?: number; needsFirstHit?: boolean }
)

export type PendingTargetStrike = Extract<PendingStrike, { target: EdgeUnitId }>

export interface PendingSupport {
  cast: SkillCast
  ownerRequired: boolean
  step: Step
  target?: EdgeUnitId
  area?: EdgeArea
  range?: number
  swap?: boolean
  delivery?: "healer"
  reservoir?: "opening" | FieldEffect
  landing?: NonNullable<EdgeUnit["force"]>
}

export interface PendingHealing {
  cast: SkillCast
  target: EdgeUnitId
  amount: number
  delay?: number
  stationary?: boolean
  reservoirPayout?: boolean
}

export interface SkillRuntime {
  sequence: number
  buffs: Buff[]
  watches: Watch[]
  fields: FieldEffect[]
  summons: SummonGroup[]
  pending: { due: number; order: number; run: () => void; strike?: PendingStrike; following?: readonly PendingTargetStrike[];
    support?: PendingSupport; heals?: PendingHealing[] }[]
  visuals: AreaVisual[]
  effects: SkillVisual[]
  histories: Map<EdgeUnitId, UnitHistory>
  shieldCasts: Map<EdgeUnitId, SkillCast>
  pendingLifeHeals: { cast: number; owner: EdgeUnitId; target: EdgeUnitId; until: number; remaining: number }[]
  notices: { id: number; owner: EdgeUnitId; name: string; gold: boolean; until: number }[]
}

export function createRuntime(): SkillRuntime {
  return { sequence: 0, buffs: [], watches: [], fields: [], summons: [], pending: [], visuals: [], effects: [],
    histories: new Map(), shieldCasts: new Map(), pendingLifeHeals: [], notices: [] }
}

export type EdgeSide = "ally" | "enemy"

export const battleFighters = (battle: EdgeBattle) => battle.sparring ? [...battle.team, ...battle.sparring.rivals] : battle.team
export const battleUnits = (battle: EdgeBattle) => battle.sparring
  ? battleFighters(battle) : [...battle.team, battle.boss, ...(battle.preview?.targets ?? [])]
export const isFighter = (unit: EdgeUnit): unit is EdgeFighter => typeof unit.id === "number"
export const isSummonId = (id: EdgeUnitId | undefined): id is `summon-${number}-${number}` => typeof id === "string" && id.startsWith("summon-")

export function sideOf(battle: EdgeBattle, id: EdgeUnitId): EdgeSide {
  if (!battle.sparring) return typeof id === "number" || isSummonId(id) ? "ally" : "enemy"
  if (isSummonId(id)) {
    const cast = Number(id.slice("summon-".length, id.lastIndexOf("-")))
    const owner = battle.runtime.summons.find((group) => group.id === cast)?.owner
    if (owner !== undefined) id = owner
  }
  return typeof id !== "number" || battle.sparring.rivals.some((unit) => unit.id === id) ? "enemy" : "ally"
}

export const sameSide = (battle: EdgeBattle, a?: EdgeUnitId, b?: EdgeUnitId) =>
  a !== undefined && b !== undefined && sideOf(battle, a) === sideOf(battle, b)

export const alliesOf = (battle: EdgeBattle, id: EdgeUnitId) =>
  sideOf(battle, id) === "ally" ? battle.team : battle.sparring?.rivals ?? []

export function createUnit(id: EdgeUnitId, at: EdgePoint, hp: number, attack: number, armor: number, range: number, speed: number, actionCooldown: number): EdgeUnit {
  return {
    id, ...at, hp, maxHp: hp, attack, armor, range, speed, actionCooldown, actionAt: 0,
    move: null, force: null, guardUntil: 0, shield: 0, shieldUntil: 0, once: new Set(),
  }
}

export function unitOf(battle: EdgeBattle, id?: EdgeUnitId): EdgeUnit | undefined {
  if (id === "boss") return battle.sparring ? undefined : battle.boss
  if (typeof id === "number") return battle.team.find((unit) => unit.id === id) ?? battle.sparring?.rivals.find((unit) => unit.id === id)
  if (isSummonId(id)) return battle.runtime.summons.flatMap((group) => group.deployment.bodies).find((body) => body.id === id)
  return battle.preview?.targets.find((unit) => unit.id === id)
}
