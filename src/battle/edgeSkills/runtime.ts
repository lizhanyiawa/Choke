import { combatHasRole } from "../combatRules"
import type { EdgeBattle, EdgeFighter, EdgeUnit, EdgeUnitId } from "../edgeBattle"
import { growthHeal, growthHit, growthHurt, growthRetaliate, growthSurvive } from "../growthRuntime"
import { CHARGE, MOVE_REACH } from "../edgeBattle"
import type { EdgeActive, EdgeGold, EdgePassive } from "./catalog"
import {
  BOARD, CENTER, along, areaHits, areaOf, borderGap, clamp, direction, edgeDistance, fieldCrossing, inside, isOnBoard, isOutside,
  left, mirror, movingOutward, outward, point, rotate, type EdgeArea, type EdgePoint,
} from "./geometry"
import { parseSelector, type Operation, type Rule, type Selector, type Step } from "./program"
import { BULWARK_COVER, DEBUFFS, HEAL_CUT, WARDEN_CONTROL, healingReceived, matchesCleanse, nearbyBulwark, roleDamageScale } from "./roles"
import type { BardBeat, BinderBeat, DancerBeat, HealerBeat, LifebringerBeat } from "./presentation"
import { BARD_SEAT_TRAVEL, BARD_SPECTRUM_FLIGHT, bardChoreography, bardFlight, bardRecipientDelay, bardSeatDelay, overtureLanding, overtureSeats, spectrumRecipient } from "./bardChoreo"
import { bardTraitArt } from "./bardTraits"
import { binderChoreography } from "./binderChoreo"
import { binderTraitArt } from "./binderTraits"
import { dancerChoreography, dancerClippedEnd, dancerHistory, dancerOrbit, dancerPath, dancerRail, dancerRailContains, REVERSE_PRINT_TRAVEL, trimDancerPath, type DancerPath } from "./dancerChoreo"
import { dancerTraitArt } from "./dancerTraits"
import { healerChoreography, healerFlight } from "./healerChoreo"
import { healerTraitArt } from "./healerTraits"
import { lifebringerChoreography } from "./lifebringerChoreo"
import { lifebringerTraitArt } from "./lifebringerTraits"
import { isShot, type AssassinBeat, type BerserkerBeat, type BulwarkBeat, type Gesture, type Glyph, type PaladinBeat, type SkillArtwork, type SkillVisual, type SpellbreakerBeat, type SummonBeat, type WardenBeat, type WarlockBeat } from "./presentation"
import { alliesOf, battleFighters, battleUnits as nodes, blockedBasicWindow, isFighter, isSummonId, sameSide as friendly, unitOf, type AreaVisual, type Buff, type FieldEffect, type PendingHealing, type PendingStrike, type PendingSupport, type PendingTargetStrike, type SkillCast, type SkillEvent, type UnitHistory, type Watch } from "./state"
import {
  SUMMON_DISMISS_TIME, activeDeployments, deploySummon, deployedUnits, dismissSummon, markSummonDestroyed, moveSummonBody, portalRoute, summonActionArea, summonLink,
  summonPlacementAreas, summonTerrainInPath, tickSummons, type SummonBody, type SummonGroup,
} from "./summons"
import { SUMMON_PLANS } from "./summonPlans"
import { SUMMON_CHOREOGRAPHY } from "./summonChoreo"
import { rangerChoreography, type RangerChoreography } from "./rangerChoreo"
import { passiveCooldown, rangerPassiveArt } from "./rangerPassives"
import { summonTraitArt } from "./summonTraits"
import { bulwarkChoreography } from "./bulwarkChoreo"
import { bulwarkTraitArt } from "./bulwarkTraits"
import { wardenChoreography } from "./wardenChoreo"
import { wardenTraitArt } from "./wardenTraits"
import { berserkerChoreography } from "./berserkerChoreo"
import { berserkerTraitArt } from "./berserkerTraits"
import { paladinChoreography } from "./paladinChoreo"
import { paladinTraitArt } from "./paladinTraits"
import { spellbreakerChoreography } from "./spellbreakerChoreo"
import { spellbreakerTraitArt } from "./spellbreakerTraits"
import { assassinChoreography } from "./assassinChoreo"
import { assassinTraitArt } from "./assassinTraits"
import { warlockChoreography } from "./warlockChoreo"
import { warlockTraitArt } from "./warlockTraits"

export const EXILE = { damage: 0.25, received: 1.35, speed: 0.6, carry: 148, guard: 2.8, push: 0.75 }
export const BASIC_PUSH = 22
const ratio = (n: number) => n / 100
const hpPct = (unit?: EdgeUnit) => unit ? 100 * unit.hp / unit.maxHp : 100
const shielded = (battle: EdgeBattle, unit: EdgeUnit) => unit.shield > 0 && unit.shieldUntil > battle.time
const blank = { x: 0, y: 0 }
export const chargeOf = (battle: EdgeBattle, unit: EdgeUnit) => unit === battle.boss ? battle.telegraph : unit.telegraph
const notice = (battle: EdgeBattle, text: string) => { battle.notice = { text, until: battle.time + 1.15 } }

export function cue(battle: EdgeBattle, kind: EdgeBattle["cues"][number]["kind"], actor: EdgeUnit, to: EdgePoint, from: EdgePoint = actor) {
  battle.cues.push({ id: ++battle.nextFx, kind, actor: actor.id, from: point(from), to: point(to), time: battle.time })
}

function impact(battle: EdgeBattle, from: EdgePoint, target: EdgeUnit, amount: number, kind: EdgeBattle["impacts"][number]["kind"], critical?: boolean) {
  if (amount > 0) battle.impacts.push({
    id: ++battle.nextFx, target: target.id, from: point(from), at: point(target), amount: Math.round(amount), kind, critical, time: battle.time,
  })
}

function showSkillVisual(battle: EdgeBattle, actor: EdgeFighter, skill: string, visual: Omit<SkillVisual, "id" | "skill" | "rarity">) {
  battle.runtime.effects.push({ ...visual, from: point(visual.from), to: point(visual.to), id: ++battle.nextFx, skill, rarity: actor.card.rarity })
}

const wardenArt = (cast: SkillCast) => cast.signature ? undefined : wardenChoreography(cast.skill?.id)
const berserkerSkill = (cast: SkillCast) => cast.signature ? undefined : cast.berserkerFollow ?? cast.skill
const berserkerArt = (cast: SkillCast) => berserkerChoreography(berserkerSkill(cast)?.id)
const paladinArt = (cast: SkillCast) => cast.signature ? undefined : paladinChoreography(cast.skill?.id)
const spellArt = (cast: SkillCast) => cast.signature ? undefined : spellbreakerChoreography(cast.skill?.id)
const assassinArt = (cast: SkillCast) => cast.signature ? undefined : assassinChoreography(cast.skill?.id)
const warlockArt = (cast: SkillCast) => cast.signature ? undefined : warlockChoreography(cast.skill?.id)
const lifeArt = (cast: SkillCast) => cast.signature ? undefined : lifebringerChoreography(cast.skill?.id)
const binderArt = (cast: SkillCast) => cast.signature ? undefined : binderChoreography(cast.skill?.id)
const dancerArt = (cast: SkillCast) => cast.signature ? undefined : dancerChoreography(cast.skill?.id)
const healerArt = (cast: SkillCast) => cast.signature ? undefined : healerChoreography(cast.skill?.id)
const bardArt = (cast: SkillCast) => cast.signature ? undefined : bardChoreography(cast.skill?.id)

function showBardBeat(
  battle: EdgeBattle, cast: SkillCast, cue: BardBeat["cue"], to: EdgePoint,
  { from = cast.from, target, area, contacts, duration, ...details }: Omit<BardBeat, "cue"> & {
    from?: EdgePoint; target?: EdgeUnitId; area?: EdgeArea; contacts?: readonly EdgePoint[]; duration?: number
  } = {},
) {
  const owner = unitOf(battle, cast.owner)
  if (!cast.skill || !bardArt(cast) || !owner || !isFighter(owner)) return
  const rarity = owner.card.rarity
  const length = duration ?? (rarity === "Prismatic" ? 1.20 : rarity === "Radiant" ? 1.02 : rarity === "L" ? .91 : .66)
  showSkillVisual(battle, owner, cast.skill.id, {
    phase: cue === "prepare" ? "windup" : cue === "flight" ? "travel" : cue === "arm" || cue === "land" ? "motion" : "impact",
    mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end,
    from, to, target, area, contacts: contacts?.map(point), cast: cast.id, beat: cast.stage,
    start: battle.time, end: battle.time + length, bard: { cue, ...details, other: details.other && point(details.other) },
  })
}

function showHealerBeat(
  battle: EdgeBattle, cast: SkillCast, cue: HealerBeat["cue"], to: EdgePoint,
  { from = cast.from, target, area, contacts, duration, ...details }: Omit<HealerBeat, "cue"> & {
    from?: EdgePoint; target?: EdgeUnitId; area?: EdgeArea; contacts?: readonly EdgePoint[]; duration?: number
  } = {},
) {
  const active = cast.skill
  if (!active || !healerArt(cast)) return
  const owner = unitOf(battle, cast.owner)
  if (!owner || !isFighter(owner)) return
  if (cue === "pool") battle.runtime.effects = battle.runtime.effects.filter(fx => fx.cast !== cast.id || fx.healer?.cue !== "pool")
  const rarity = owner.card.rarity
  const length = duration ?? (rarity === "Prismatic" ? 1.04 : rarity === "Radiant" ? .89 : .68)
  showSkillVisual(battle, owner, active.id, {
    phase: cue === "prepare" ? "windup" : cue === "flight" ? "travel" : cue === "arm" ? "motion" : "impact",
    mark: cue === "prepare" ? active.artwork.start : active.artwork.end,
    from, to, target, area, contacts: contacts?.map(point), cast: cast.id, beat: cast.stage,
    start: battle.time, end: battle.time + length, healer: { cue, ...details, other: details.other && point(details.other) },
  })
}
const danceSourceMotifs = {
  danceCradle: "footCradle", danceLeadSide: "leadSide", danceSash: "braceSash", danceFinish: "landingLamp",
  danceCut: "threadCut", danceLight: "lightPost", danceEntry: "entryLace", danceOld: "oldStep", danceDrum: "stopDrum",
  dancePair: "pairedRibbon", danceAnchor: "reboundAnchor", danceWake: "wakeFan", danceStill: "stillRing", danceSplit: "partedLane",
  danceDouble: "doubleJump", danceEscort: "goldRailPair", danceBorrow: "borrowStep", danceRetreat: "retreatFlash",
  dancePasses: "threeBeat", danceSwing: "counterSwing", danceHinge: "foldSlider", danceReverse: "reversePrint",
} as const
const defenderTraitArt = (id?: string) => bulwarkTraitArt(id) ?? wardenTraitArt(id)
const resolvedTraitArt = (id?: string) => defenderTraitArt(id) ?? berserkerTraitArt(id) ?? paladinTraitArt(id) ?? spellbreakerTraitArt(id) ??
  assassinTraitArt(id) ?? warlockTraitArt(id) ?? lifebringerTraitArt(id) ?? binderTraitArt(id) ?? dancerTraitArt(id) ??
  healerTraitArt(id) ?? bardTraitArt(id)

function healerStillReady(battle: EdgeBattle, owner: EdgeUnit) {
  const track = battle.runtime.histories.get(owner.id), since = track?.standAt ?? 0
  return !owner.move && !owner.force && battle.time - since >= 1.5 && track?.healerStandingSpent !== since
}

function healerMoveTarget(battle: EdgeBattle, owner: EdgeUnit, event: SkillEvent, reach: number, enter: boolean) {
  const { from, landing } = event
  if (!from || !landing || !event.danceWalk) return
  return alliesOf(battle, owner.id).filter(unit => {
    if (unit === owner || !unit.hp || unit.hp >= unit.maxHp) return false
    const before = edgeDistance(unit, from), after = edgeDistance(unit, landing)
    return enter ? before > reach && after <= reach : before - after >= reach
  }).sort((a, b) => edgeDistance(a, landing) - edgeDistance(b, landing))[0]
}

function binderTraitReady(battle: EdgeBattle, owner: EdgeUnit | undefined, id: string) {
  return !!owner?.hp && isFighter(owner) && owner.passives.some(passive => passive.id === id) &&
    (owner.passiveAt[id] ?? 0) <= battle.time &&
    (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === id))
}

function showBinderBeat(battle: EdgeBattle, cast: SkillCast, cue: BinderBeat["cue"], to: EdgePoint, details: {
  from?: EdgePoint; area?: EdgeArea; target?: EdgeUnitId; duration?: number; kind?: string
  other?: EdgePoint; paths?: BinderBeat["paths"]
} = {}) {
  const owner = unitOf(battle, cast.owner)
  if (!cast.skill || !binderArt(cast) || !owner || !isFighter(owner)) return
  const { from = cast.from, area, target, duration = .56, kind, other, paths } = details
  showSkillVisual(battle, owner, cast.skill.id, {
    phase: cue === "prepare" ? "windup" : cue === "flight" ? "travel" : "impact",
    mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end,
    start: battle.time, end: battle.time + duration, from, to, area, target, cast: cast.id,
    binder: { cue, kind, other: other && point(other), paths },
  })
}

function showDancerBeat(battle: EdgeBattle, cast: SkillCast, cue: DancerBeat["cue"], to: EdgePoint, details: {
  from?: EdgePoint; area?: EdgeArea; target?: EdgeUnitId; duration?: number; contacts?: readonly EdgePoint[]
  kind?: string; other?: EdgePoint; amount?: number; paths?: DancerBeat["paths"]
} = {}) {
  const owner = unitOf(battle, cast.owner)
  if (!cast.skill || !dancerArt(cast) || !owner || !isFighter(owner)) return
  const { from = cast.from, target, area, duration = .57, contacts, kind, other, amount, paths } = details
  showSkillVisual(battle, owner, cast.skill.id, {
    phase: cue === "prepare" ? "windup" : cue === "travel" ? "travel" : "impact",
    mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end,
    start: battle.time, end: battle.time + duration, from, to, area, target, contacts, cast: cast.id,
    dancer: { cue, kind, other, amount, paths },
  })
}

type WardenDetails = Pick<WardenBeat, "axis" | "paths" | "other"> &
  Partial<Pick<SkillVisual, "from" | "area" | "target" | "beat">> & { duration?: number; windup?: boolean }

function showWardenBeat(battle: EdgeBattle, cast: SkillCast, cue: WardenBeat["cue"], to: EdgePoint, details: Partial<WardenDetails> = {}) {
  if (!cast.skill || !wardenArt(cast)) return
  const owner = unitOf(battle, cast.owner)
  if (!owner || !isFighter(owner)) return
  const { from = owner, area, target, duration, windup, other, paths, axis = direction(cast.from, cast.aim), beat = cast.stage } = details
  const phase = cue === "travel" ? "motion" : cue === "prepare" ? windup ? "windup" : "start" : "impact"
  const span = owner.card.rarity === "Prismatic" ? 1.02 : owner.card.rarity === "Radiant" || owner.card.rarity === "L" ? .85 : .68
  showSkillVisual(battle, owner, cast.skill.id, {
    phase, mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end,
    from, to, target, area, cast: cast.id, beat, start: battle.time, end: battle.time + (duration ?? span),
    warden: { cue, owner: owner.id, axis: point(axis), paths, other: other && point(other) },
  })
}

type BerserkerDetails = Partial<Pick<BerserkerBeat, "axis" | "paths" | "other" | "amount" | "kind"> &
  Pick<SkillVisual, "from" | "area" | "target" | "beat">> & { duration?: number }

function showBerserkerBeat(battle: EdgeBattle, cast: SkillCast, cue: BerserkerBeat["cue"], to: EdgePoint, details: BerserkerDetails = {}) {
  const active = berserkerSkill(cast)
  if (!active || !berserkerChoreography(active.id)) return
  const owner = unitOf(battle, cast.owner)
  if (!owner || !isFighter(owner)) return
  const {
    from = owner, axis = direction(from, to), area, target, paths, other, amount, kind, duration, beat = cast.berserkerLeg ?? 1,
  } = details
  const phase = cue === "prepare" ? "windup" : cue === "flight" ? "travel" : cue === "travel" ? "motion" : "impact"
  const span = owner.card.rarity === "Prismatic" ? .98 : ["L", "Radiant"].includes(owner.card.rarity) ? .80 : .62
  showSkillVisual(battle, owner, active.id, {
    phase, mark: cue === "prepare" ? active.artwork.start : active.artwork.end,
    from, to, target, area, cast: cast.id, beat, start: battle.time, end: battle.time + (duration ?? span),
    berserker: { cue, owner: owner.id, axis: point(axis), paths, other: other && point(other), amount, kind },
  })
}

type PaladinDetails = Partial<Pick<PaladinBeat, "axis" | "other" | "amount" | "reach" | "kind" | "paths"> &
  Pick<SkillVisual, "from" | "area" | "target">> & { duration?: number }

function showPaladinBeat(battle: EdgeBattle, cast: SkillCast, cue: PaladinBeat["cue"], to: EdgePoint, details: PaladinDetails = {}) {
  const owner = unitOf(battle, cast.owner)
  if (!cast.skill || !paladinArt(cast) || !owner || !isFighter(owner)) return
  const { from = owner, axis = direction(from, to), other, amount, reach, kind, paths, duration, area, target } = details
  const phase = cue === "prepare" ? "windup" : cue === "flight" ? "travel" : cue === "travel" ? "motion" : "impact"
  const span = owner.card.rarity === "Prismatic" ? 1.08 : ["L", "Radiant"].includes(owner.card.rarity) ? .86 : .68
  showSkillVisual(battle, owner, cast.skill.id, {
    phase, mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end,
    from, to, target, area, cast: cast.id, beat: cast.stage, start: battle.time, end: battle.time + (duration ?? span),
    paladin: { cue, owner: owner.id, axis: point(axis), other: other && point(other), amount, reach, kind, paths },
  })
}

function showSpellBeat(battle: EdgeBattle, cast: SkillCast, cue: SpellbreakerBeat["cue"], to: EdgePoint,
  details: Partial<Pick<SpellbreakerBeat, "axis" | "kind" | "amount" | "other" | "paths" | "fragments"> &
    Pick<SkillVisual, "from" | "area" | "target">> & { duration?: number } = {}) {
  const owner = unitOf(battle, cast.owner)
  if (!cast.skill || !spellArt(cast) || !owner || !isFighter(owner)) return
  const { from = owner, axis = direction(from, to), kind, amount, other, paths, fragments, area, target, duration } = details
  const span = owner.card.rarity === "Prismatic" ? 1.18 : ["L", "Radiant"].includes(owner.card.rarity) ? .92 : .68
  showSkillVisual(battle, owner, cast.skill.id, {
    phase: cue === "prepare" ? "windup" : cue === "travel" ? "motion" : "impact",
    mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end,
    from, to, area, target, cast: cast.id, beat: cast.stage, start: battle.time, end: battle.time + (duration ?? span),
    spellbreaker: { cue, owner: owner.id, axis: point(axis), kind, amount, other: other && point(other), paths, fragments },
  })
}

function showAssassinBeat(battle: EdgeBattle, cast: SkillCast, cue: AssassinBeat["cue"], to: EdgePoint,
  details: Partial<Pick<AssassinBeat, "axis" | "other" | "kind" | "amount" | "paths"> &
    Pick<SkillVisual, "from" | "area" | "target" | "beat">> & { duration?: number } = {}) {
  const owner = unitOf(battle, cast.owner)
  if (!cast.skill || !assassinArt(cast) || !owner || !isFighter(owner)) return
  const { from = owner, axis = direction(from, to), other, kind, amount, paths, area, target, beat = cast.stage, duration } = details
  const span = owner.card.rarity === "Prismatic" ? 1.12 : ["L", "Radiant"].includes(owner.card.rarity) ? .88 : .62
  showSkillVisual(battle, owner, cast.skill.id, {
    phase: cue === "prepare" ? "windup" : cue === "flight" ? "travel" : cue === "travel" ? "motion" : "impact",
    mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end, cast: cast.id, beat,
    from, to, area, target, start: battle.time, end: battle.time + (duration ?? span),
    assassin: { cue, owner: owner.id, axis: point(axis), other: other && point(other), kind, amount, paths },
  })
}

function showWarlockBeat(battle: EdgeBattle, cast: SkillCast, cue: WarlockBeat["cue"], to: EdgePoint,
  details: Partial<Pick<WarlockBeat, "axis" | "other" | "kind" | "amount" | "paths"> &
    Pick<SkillVisual, "from" | "area" | "target" | "beat">> & { duration?: number } = {}) {
  const owner = unitOf(battle, cast.owner)
  if (!cast.skill || !warlockArt(cast) || !owner || !isFighter(owner)) return
  const { from = owner, axis = direction(from, to), other, kind, amount, paths, area, target, beat = cast.stage, duration } = details
  const span = owner.card.rarity === "Prismatic" ? 1.24 : ["L", "Radiant"].includes(owner.card.rarity) ? 1.02 : .70
  showSkillVisual(battle, owner, cast.skill.id, {
    phase: cue === "prepare" ? "windup" : cue === "flight" ? "travel" : cue === "travel" ? "motion" : "impact",
    mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end, cast: cast.id, beat,
    from, to, area, target, start: battle.time, end: battle.time + (duration ?? span),
    warlock: { cue, owner: owner.id, axis: point(axis), other: other && point(other), kind, amount, paths },
  })
}

type BulwarkDetails = Pick<BulwarkBeat, "amount" | "remaining" | "landings" | "other" | "count"> &
  Partial<Pick<SkillVisual, "from" | "area" | "contacts" | "target">> & { duration?: number; windup?: boolean }

function bulwarkArt(cast: SkillCast) {
  return cast.signature ? undefined : bulwarkChoreography(cast.skill?.id)
}

function showBulwarkBeat(battle: EdgeBattle, cast: SkillCast, cue: BulwarkBeat["cue"], to: EdgePoint, details: BulwarkDetails = {}) {
  if (!cast.skill || !bulwarkArt(cast)) return
  const owner = unitOf(battle, cast.owner)
  if (!owner || !isFighter(owner)) return
  const { from = owner, area, contacts, target, duration, windup, ...beat } = details
  const focus = cue === "setup" ? cast.aim : to
  const axis = edgeDistance(from, focus) > 3 ? direction(from, focus) : { x: 0, y: -1 }
  const phase = cue === "setup" ? windup ? "windup" : "start" : cue === "step" ? "motion" : "impact"
  const size = ["C", "UC"].includes(owner.card.rarity) ? .64 : owner.card.rarity === "Prismatic" ? .96 : .78
  showSkillVisual(battle, owner, cast.skill.id, {
    phase, mark: cue === "setup" ? cast.skill.artwork.start : cast.skill.artwork.end, from, to, target, area, contacts,
    cast: cast.id, beat: cast.stage, start: battle.time, end: battle.time + (duration ?? size),
    bulwark: { cue, owner: owner.id, axis, ...beat, other: beat.other && point(beat.other) },
  })
}

type SummonBeatDetails = Partial<Pick<SkillVisual, "from" | "to" | "target" | "area" | "contacts" | "outcome" | "beat">> &
  Pick<SummonBeat, "other" | "intercept" | "landings"> & { duration?: number }

function showSummonBeat(
  battle: EdgeBattle, group: SummonGroup, body: SummonBody, cue: SummonBeat["cue"],
  { from = body, to = body, other, intercept, landings, duration, ...detail }: SummonBeatDetails = {},
) {
  const { kind, cast } = group.deployment
  if (!cast.skill) return
  const scene = SUMMON_CHOREOGRAPHY[kind]
  const { start, path, end } = cast.skill.artwork
  const mark = cue === "deploy" ? start : cue === "shot" ? { motion: "shot" as const, glyph: path?.glyph ?? end.glyph }
    : cue === "warp" ? { motion: "dash" as const, glyph: end.glyph } : end
  battle.runtime.effects.push({
    ...detail, id: ++battle.nextFx, skill: cast.skill.id, rarity: group.rarity, cast: cast.id,
    phase: cue === "deploy" ? "start" : cue === "shot" || cue === "warp" ? "travel" : "impact", mark,
    from: point(from), to: point(to), start: battle.time, end: battle.time + (duration ?? (cue === "deploy" ? scene.opening : scene.settle)),
    summon: { kind, cue, slot: body.slot, axis: point(body.facing), other: other && point(other), intercept: intercept && point(intercept), landings },
  })
}

function passiveMotion(passive: EdgePassive): Gesture {
  if (passive.steps.some((step) => step.watch)) return "pin"
  const benefits = passive.steps.flatMap((step) => step.operations.map((op) => op.kind))
  if (benefits.includes("h")) return "bloom"
  if (benefits.includes("p") || benefits.includes("addp")) return "shove"
  if (benefits.includes("b") || benefits.includes("guard")) return "shield"
  if (benefits.includes("dash")) return "trail"
  if (passive.rule.event === "move" || passive.rule.event === "return" || passive.rule.event === "dash") return "step"
  if (passive.rule.event === "break" || passive.rule.event === "interrupt") return "shatter"
  if (passive.rule.event === "death" || passive.rule.event === "life") return "rise"
  return benefits.includes("d") ? "slash" : "flash"
}

export const flightTime = (from: EdgePoint, to: EdgePoint) => clamp(0.15 + edgeDistance(from, to) / 1080, 0.20, 0.52)

export function history(battle: EdgeBattle, unit: EdgeUnit): UnitHistory {
  const prior = battle.runtime.histories.get(unit.id)
  if (prior) return prior
  const result: UnitHistory = {
    pushAt: -Infinity, pullAt: -Infinity, interruptAt: -Infinity, hitAt: -Infinity, movedAt: -Infinity,
    from: point(unit), standAt: 0, wounds: [], positions: [{ time: 0, at: point(unit) }], attackers: new Set(),
  }
  battle.runtime.histories.set(unit.id, result)
  return result
}

function makeCast(id: number, owner: EdgeUnit, order: SkillCast["order"], aim: EdgePoint, target?: EdgeUnit, skill?: EdgeActive, issuedAt?: number): SkillCast {
  return {
    id, owner: owner.id, target: target?.id, skill, order, issuedAt, from: point(owner), aim: point(aim),
    basis: owner.attack, outside: isOutside(owner), trace: new Map(), hitStages: new Set(),
    extraPush: new Map(), used: new Set(), damage: 0, heals: 0, stage: 0, pending: 0,
  }
}

export function newCast(battle: EdgeBattle, owner: EdgeUnit, order: SkillCast["order"], aim: EdgePoint = owner, target?: EdgeUnit, skill?: EdgeActive) {
  return makeCast(++battle.runtime.sequence, owner, order, aim, target, skill, battle.time)
}

function ownedCast(cast: SkillCast, owner: EdgeUnit): SkillCast {
  if (cast.owner === owner.id) return cast
  return { ...cast, owner: owner.id, target: cast.target, from: point(owner), basis: owner.attack, outside: isOutside(owner) }
}

function traceAt(cast: SkillCast, target: EdgeUnit) {
  let record = cast.trace.get(target.id)
  if (!record) {
    record = { at: point(target), hits: 0, damage: 0, heal: 0, shield: false }
    cast.trace.set(target.id, record)
  }
  return record
}

const recent = (battle: EdgeBattle, time: number, seconds = 2) => battle.time - time <= seconds
const activeBuffs = (battle: EdgeBattle, id: EdgeUnitId, kind?: string, at = battle.time) =>
  battle.runtime.buffs.filter((buff) => buff.target === id && buff.until > at && (!kind || buff.kind === kind))

function binderSlowing(battle: EdgeBattle, owner: EdgeUnit, target: EdgeUnit) {
  return activeBuffs(battle, target.id, "slow").some(buff => buff.cast.owner === owner.id) ||
    battle.runtime.fields.some(field => field.mode === "hold" && field.cast.owner === owner.id && field.until > battle.time &&
      !!areaHits(field.area, target) && field.step.selector.units === "e" && field.step.operations.some(op =>
        op.kind === "slow" && (op.style !== "out" || !target.force && !!target.move && movingOutward(target, target.move, field.area.center))))
}

function binderControlled(battle: EdgeBattle, owner: EdgeUnit, target: EdgeUnit) {
  return binderSlowing(battle, owner, target) || activeBuffs(battle, target.id).some(buff =>
    buff.cast.owner === owner.id && ["root", "tether", "short", "aimp"].includes(buff.kind))
}

function recordBinderControl(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit) {
  const track = history(battle, target)
  const controls = track.binderControl ??= new Map()
  controls.set(cast.owner, battle.time)
}

function refUnit(battle: EdgeBattle, cast: SkillCast, key: string, event?: SkillEvent): EdgeUnit | undefined {
  const id = key === "s" ? cast.owner : key === "t" ? cast.target : key === "v" || key === "w" ? event?.target : event?.attacker ?? event?.source
  return unitOf(battle, id)
}

function anchor(battle: EdgeBattle, cast: SkillCast, key?: string, event?: SkillEvent): EdgePoint {
  switch (key) {
    case "s": return refUnit(battle, cast, "s", event) ?? cast.from
    case "o": return cast.from
    case "t": {
      const target = refUnit(battle, cast, "t", event)
      if (cast.skill?.id === "ranger/Radiant/A1") return target ?? cast.aim
      return target?.hp ? target : target && cast.trace.get(target.id)?.at || target || cast.aim
    }
    case "v": return event?.at ?? refUnit(battle, cast, "v", event) ?? cast.aim
    case "u": return refUnit(battle, cast, "u", event) ?? cast.from
    case "w": return refUnit(battle, cast, "w", event) ?? cast.aim
    case "l": return event?.landing ?? event?.at ?? cast.aim
    case "f": return cast.trace.values().next().value?.at ?? cast.aim
    case "h": {
      const hits = [...cast.trace.values()].filter((trace) => trace.hits > 0)
      if (!hits.length) return cast.aim
      const sum = hits.reduce((p, hit) => ({ x: p.x + hit.at.x, y: p.y + hit.at.y }), blank)
      return { x: sum.x / hits.length, y: sum.y / hits.length }
    }
    case "m": return mirror(cast.aim)
    case "c": return CENTER
    case "j": return nodes(battle).filter((unit) => unit.hp && !friendly(battle, cast.owner, unit.id))
      .sort((a, b) => edgeDistance(a, cast.aim) - edgeDistance(b, cast.aim))[0] ?? cast.aim
    case "y": return cast.summon?.deployment.bodies[1] ?? cast.aim
    case "r": return event?.from ?? cast.from
    case "z": return event?.area?.center ?? cast.aim
    default: return cast.aim
  }
}

export function selectionArea(battle: EdgeBattle, cast: SkillCast, selection: Selector, event?: SkillEvent): EdgeArea | undefined {
  if (!selection.shape) return undefined
  if (cast.signature?.id === "warlock/Radiant/G2" && selection.shape === "L" && cast.warlockSecond)
    return areaOf("L", along(cast.aim, direction(cast.aim, cast.warlockSecond), -.01), direction(cast.aim, cast.warlockSecond), Math.max(1, edgeDistance(cast.aim, cast.warlockSecond)) + .02, 60)
  const mage = warlockArt(cast)
  if (mage?.motif === "comet" && selection.shape === "C")
    return areaOf("C", along(cast.from, direction(cast.from, cast.aim), 395), direction(cast.from, cast.aim), selection.size[0])
  if (mage?.motif === "movingash" && selection.offset === 70)
    return areaOf("C", along(cast.aim, direction(cast.aim, CENTER), Math.min(70, edgeDistance(cast.aim, CENTER))), direction(cast.from, cast.aim), selection.size[0])
  if ((mage || cast.skill?.id === "warlock/L/A4") && cast.warlockSecond && ["j", "h"].includes(selection.anchor ?? ""))
    return areaOf("C", cast.warlockSecond, direction(cast.from, cast.aim), selection.size[0])
  const shadow = assassinArt(cast)
  if (shadow?.motif === "turnaround" && selection.shape === "L" && cast.assassinRoute) {
    const { from, to } = cast.assassinRoute
    const blade = cast.assassinReturnEdge ?? unitOf(battle, cast.target) ?? to
    return areaOf("L", blade, direction(blade, from), Math.max(1, edgeDistance(blade, from)), selection.size[1])
  }
  if (shadow && ["offhand", "shadowpit"].includes(shadow.motif) && selection.shape === "C" && cast.assassinContact)
    return areaOf("C", cast.assassinContact, direction(cast.from, cast.aim), selection.size[0])
  if (cast.signature?.id === "spellbreaker/L/G2" && cast.spellRoute) {
    const { from, to } = cast.spellRoute
    return areaOf("L", from, direction(from, to), Math.max(1, edgeDistance(from, to)), selection.size[1])
  }
  if (cast.signature?.id === "spellbreaker/Prismatic/G2" && event?.from && event.landing)
    return areaOf("L", event.from, direction(event.from, event.landing), Math.max(1, edgeDistance(event.from, event.landing)), selection.size[1])
  if (cast.signature?.id === "paladin/Prismatic/G2" && event?.at && event.from) {
    const span = edgeDistance(event.at, event.from)
    return areaOf("L", event.at, direction(event.at, event.from), Math.max(1, span), selection.size[1])
  }
  const paladin = paladinArt(cast)
  const exchange = cast.paladinRoute
  if (exchange?.swap && selection.shape === "D")
    return areaOf("D", exchange.from, direction(exchange.from, exchange.to), selection.size[0], edgeDistance(exchange.from, exchange.to))
  if (paladin?.motif === "horizon" && selection.shape === "L")
    return areaOf("L", cast.from, direction(cast.from, cast.aim), Math.min(selection.size[0], edgeDistance(cast.from, cast.aim)), selection.size[1])
  const route = cast.wardenRoute
  if (route && selection.shape === "D") return areaOf("D", route.from, direction(route.from, route.to), selection.size[0], edgeDistance(route.from, route.to))
  if (route && selection.shape === "L" && wardenArt(cast)?.motif === "borrow")
    return areaOf("L", route.from, direction(route.from, route.to), edgeDistance(route.from, route.to), selection.size[1])
  const slash = cast.berserkerRoute
  if (slash && selection.shape === "L" && berserkerArt(cast)?.line)
    return areaOf("L", slash.from, direction(slash.from, slash.to), edgeDistance(slash.from, slash.to), selection.size[1])
  const axis = rotate(direction(cast.from, cast.aim), selection.turn ?? 0)
  if (selection.shape === "D") return areaOf("D", cast.from, axis, selection.size[0], edgeDistance(cast.from, cast.aim))
  const center = anchor(battle, cast, selection.anchor ?? (selection.shape === "L" || selection.shape === "F" ? "o" : "p"), event)
  return areaOf(selection.shape, along(center, left(axis), selection.offset), axis, selection.size[0], selection.size[1], selection.size[2])
}

function rangerGroupTarget(event: SkillEvent, mode: "flank" | "farthest" | "lane") {
  const group = event.hitGroup
  const area = event.area
  if (!group?.length || !area) return
  const axis = direction(event.cast.from, event.cast.aim)
  const depth = ({ x, y }: EdgePoint) => (x - event.cast.from.x) * axis.x + (y - event.cast.from.y) * axis.y
  if (mode === "lane") {
    const lanes = area.parts.slice().reverse().map((part) => group
      .filter(({ at }) => areaHits({ center: area.center, parts: [part] }, at))
      .sort((a, b) => depth(a.at) - depth(b.at))[0]).filter(Boolean)
    return lanes[1]?.id
  }
  const measure = (at: EdgePoint) => mode === "flank"
    ? Math.abs((at.x - area.center.x) * axis.y - (at.y - area.center.y) * axis.x) : depth(at)
  return group.reduce((best, candidate) => measure(candidate.at) > measure(best.at) ? candidate : best).id
}

function bardProtection(battle: EdgeBattle, owner: EdgeUnit, ally: EdgeUnit) {
  const shield = shielded(battle, ally) ? battle.runtime.shieldCasts.get(ally.id) : undefined
  return shield?.owner === owner.id ? shield
    : activeBuffs(battle, ally.id, "guard").find(buff => buff.cast.owner === owner.id)?.cast
}

function bardStage(battle: EdgeBattle, owner: EdgeUnit) {
  return battle.runtime.fields.find(field => field.cast.owner === owner.id && !field.derived && bardArt(field.cast) &&
    field.until > battle.time && areaHits(field.area, owner))
}

function bardNearby(battle: EdgeBattle, owner: EdgeUnit, reach: number, state?: "protected" | "empowered") {
  return alliesOf(battle, owner.id).filter(ally => {
    if (!ally.hp || ally === owner || edgeDistance(ally, owner) > reach) return false
    if (!state || bardProtection(battle, owner, ally)) return true
    return state === "empowered" && battle.runtime.buffs.some(buff => buff.target === ally.id && buff.cast.owner === owner.id &&
      !!bardArt(buff.cast) && buff.until > battle.time && ["ampq", "qr", "qp", "q", "score"].includes(buff.kind))
  }).sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner))
}

function bardCondition(battle: EdgeBattle, name: string, value: number, owner: EdgeUnit, event: SkillEvent, target?: EdgeUnit) {
  const motif = bardArt(event.cast)?.motif
  const actor = unitOf(battle, event.attacker)
  switch (name) {
    case "bardActive": return !!motif
    case "bardAllyActor": return !!actor && isFighter(actor) && actor !== owner && friendly(battle, owner.id, actor.id)
    case "bardRally": case "bardBowPush": case "bardLoneEcho": case "bardFieldRange":
    case "bardOverture": case "bardRefrain": return event.style === name
    case "bardShore": return event.style === "bardShore" || event.style === "bardSafeReturn"
    case "bardCodaCrossing": return event.style === "bardShore"
    case "bardGuided": return event.bardGuide?.owner === owner.id && bardArt(event.bardGuide)?.motif === "tuningFork" &&
      event.source !== owner.id
    case "bardFieldGuided": return event.cast.bardRange?.cast.owner === owner.id && event.source !== owner.id
    case "bardEarnedRange": return event.attackCast?.used.has("applied/bard/E/P1") ?? false
    case "bardMuted": return motif === "mutedDrum"
    case "bardSlow": return motif === "triplet"
    case "bardVerse": return motif === "returnVerse" && event.release === "hit"
    case "bardWarDrum": return motif === "warDrum"
    case "bardDownbeat": return event.style === "downbeat"
    case "bardCurtain": return motif === "bassCurtain" && event.release === "entry"
    case "bardRetreat": return motif === "retreatBeat" && event.release === "move"
    case "bardHarmony": return motif === "harmonyNeedle" && event.release === "harmony"
    case "bardNearCard": return bardNearby(battle, owner, value).length > 0
    case "bardTwoCards": return bardNearby(battle, owner, value).length >= 2
    case "bardProtected": return bardNearby(battle, owner, value, "protected").length > 0
    case "bardEmpowered": return bardNearby(battle, owner, value, "empowered").length > 0
    case "bardAccent": return event.style === "bardEcho" || event.style === "bardLoneEcho" || event.style === "bowString"
    case "bardTurned": return !!event.bardTurned
    case "bardFork": return event.style === "tuningMark"
    case "bardPassing": return motif === "passingHeal" && event.release === "hit" && event.target !== event.cast.target
    case "bardCross": return motif === "crossMeter" && [...event.cast.trace.values()].some(trace => (trace.effectiveHits ?? 0) > 0)
    case "bardNearHeal": return !!target?.hp && target !== owner && isFighter(target) &&
      friendly(battle, owner.id, target.id) && edgeDistance(owner, target) <= value
    case "bardStage": return event.style === "echoStage"
    case "bardCloak": return motif === "restCloak" && event.release === "move"
    case "bardStopped": return event.style === "stoppedString"
    case "bardDuet": return motif === "duet" && event.release === "hit"
    case "bardOwnField": return !!bardStage(battle, owner)
    case "bardSecondVoice": return event.style === "bardEnsemble" && event.total === 2
    case "bardStaff": return motif === "battleStaff" && [...event.cast.trace.values()].some(trace =>
      !!trace.effectiveHits && !!trace.pushedTo)
    case "bardLead": return event.style === "longLead"
    case "bardLong": return !!actor && edgeDistance(owner,
      (event.style === "bardGuard" || event.style === "bardShore" ? event.at : event.attackCast?.from) ?? actor) >= value
    case "bardCorner": return motif === "silenceCorner"
    case "bardCoda": return motif === "coda" && event.release === "hit"
    case "bardTwoAttackers": {
      const attackers = target && battle.runtime.histories.get(target.id)?.handAttackers
      return !!attackers && alliesOf(battle, owner.id).filter(ally => ally !== owner && attackers.has(ally.id)).length >= 2
    }
    case "bardShieldRelay": return motif === "shieldRelay" && event.release === "hit" && event.target !== event.cast.target
    case "bardHandoff": return (motif === "shieldRelay" || motif === "threeVoices") && event.release === "hit" && event.target !== event.cast.target
    case "bardLane": return motif === "timingLane" && event.zone && event.release === "move"
    case "bardAntiphon": return motif === "antiphon" && event.release === "hit"
    case "bardFirstScore": return event.style === "score" && event.index === 0
    case "bardSymphony": return motif === "rescueSymphony"
    case "bardHostileSkill": return !!actor && !friendly(battle, owner.id, actor.id) && !!event.attackCast && event.attackCast.order !== "basic"
    case "bardSpectrum": return motif === "spectrumDuel" && event.release === "spectrum"
    case "bardDistant": return ["score", "bardGuard", "bardNote", "bardSpectrum", "bardShore"].includes(event.style ?? "")
    default: throw new Error("Unknown bard condition " + name)
  }
}

function flag(battle: EdgeBattle, key: string, owner: EdgeUnit, event: SkillEvent, holder?: EdgeUnitId): boolean {
  if (key.startsWith("not") && key.length > 3) {
    const name = key.slice(3)
    return !flag(battle, name.charAt(0).toLowerCase() + name.slice(1), owner, event, holder)
  }
  const target = unitOf(battle, event.target)
  const source = unitOf(battle, event.source)
  const trace = target && event.cast.trace.get(target.id)
  const [name, digits] = /^([a-zA-Z]+)(\d+)?$/.exec(key)?.slice(1) ?? []
  const value = Number(digits)
  if (name?.startsWith("bard")) return !!bardCondition(battle, name, value, owner, event, target)
  if (Object.hasOwn(SUMMON_PLANS, name)) return event.style === name || !!event.summon && event.cast.skill?.deployment === name
  const destination = event.landing ?? target ?? event.at ?? event.cast.aim
  const gap = edgeDistance(event.cast.from, target ?? event.at ?? event.cast.aim)
  const targetHistory = target && battle.runtime.histories.get(target.id)
  if (name && Object.hasOwn(danceSourceMotifs, name)) return dancerArt(event.cast)?.motif === danceSourceMotifs[name as keyof typeof danceSourceMotifs]
  switch (name) {
    case "me": return event.source === owner.id
    case "on": return event.target === owner.id
    case "team": return friendly(battle, owner.id, event.source)
    case "friend": return event.source !== owner.id && friendly(battle, owner.id, event.source)
    case "ally": return friendly(battle, owner.id, event.target)
    case "other": return event.target !== owner.id && friendly(battle, owner.id, event.target)
    case "card": return !!target && isFighter(target)
    case "foe": return event.target !== undefined && !friendly(battle, owner.id, event.target)
    case "enemy": return event.source !== undefined && !friendly(battle, owner.id, event.source)
    case "to": return event.target === holder
    case "from": return event.source === holder
    case "picked": return event.target === event.cast.target
    case "q": return event.cast.order === "basic"
    case "skill": return event.cast.order !== "basic"
    case "singleactive": return !!event.cast.skill && ["enemy", "ally", "other"].includes(event.cast.skill.aim.mode)
    case "direct": return !!event.direct
    case "healContact": return (event.amount ?? 0) + (event.absorbed ?? 0) > 0
    case "unbound": return !event.cast.paladinVow
    case "unreversed": return !event.cast.spellReversal
    case "spellfirst": case "spellsecond": return [...event.cast.trace].filter(([, entry]) => entry.hits > 0)[name === "spellfirst" ? 0 : 1]?.[0] === event.target
    case "handattack": return event.cast.used.has("manual") && !event.summon && !event.zone && !event.release && event.style !== "zone"
    case "ranged": return source ? source.range >= 200 : gap >= 200
    case "switchq": {
      const last = battle.runtime.histories.get(owner.id)?.lastBasicTarget
      return last !== undefined && event.target !== undefined && last !== event.target
    }
    case "recede": case "noapproach": case "forward": {
      if (!event.from || !event.landing) return false
      const enemies = nodes(battle).filter((unit) => unit.hp && !friendly(battle, owner.id, unit.id))
      const near = (at: EdgePoint) => Math.min(Infinity, ...enemies.map((unit) => edgeDistance(unit, at)))
      const gain = near(event.landing) - near(event.from)
      return enemies.length > 0 && (name === "forward" ? gain < -.01
        : name === "recede" ? gain >= (value || .01) : gain >= -.01)
    }
    case "approach": {
      if (!event.from || !event.landing) return false
      const enemies = nodes(battle).filter((unit) => unit.hp && !friendly(battle, owner.id, unit.id))
      const nearest = (at: EdgePoint) => Math.min(Infinity, ...enemies.map((unit) => edgeDistance(unit, at)))
      return nearest(event.from) - nearest(event.landing) >= value
    }
    case "melee": return gap <= 120
    case "near": return gap <= (value || 120)
    case "nearfrom": return !!source && edgeDistance(source, owner) <= value
    case "far": return gap >= (value || 260)
    case "aimfar": return edgeDistance(event.cast.from, event.cast.aim) >= (value || 260)
    case "nearself": return !!target && edgeDistance(owner, target) <= (value || 120)
    case "farself": return !!target && edgeDistance(owner, target) >= (value || 260)
    case "farally": return !!source && edgeDistance(owner, source) >= (value || 260)
    case "edge": return borderGap(destination) <= (value || 100)
    case "edgeAt": return borderGap(event.at ?? destination) <= value
    case "selfedge": return borderGap(owner) <= (value || 100)
    case "out": return isOutside(destination)
    case "outself": return isOutside(owner)
    case "inside": return !isOutside(destination)
    case "selfin": return !isOutside(owner)
    case "low": return (event.kind === "life" || event.kind === "hurt" ? hpPct(target) : event.lowBefore ?? hpPct(target)) < (value || 45)
    case "nowlow": return hpPct(target) < value
    case "pickedout": return isOutside(unitOf(battle, event.cast.target) ?? event.cast.aim)
    case "high": return hpPct(target) >= (value || 65)
    case "selflow": return hpPct(owner) < (value || 45)
    case "selfhigh": return hpPct(owner) >= (value || 65)
    case "selfabove": return hpPct(owner) > value
    case "crossed": return !!target?.hp && (event.lowBefore ?? hpPct(target)) >= value && hpPct(target) < value
    case "rise": return !!target?.hp && (event.lowBefore ?? hpPct(target)) < value && hpPct(target) >= value
    case "full": return hpPct(target) >= 100
    case "alive": return !!target?.hp
    case "selfshield": return owner.shield > 0 && owner.shieldUntil > battle.time
    case "shielded": return !!target?.shield && target.shieldUntil > battle.time
    case "pushed": return !!targetHistory && recent(battle, targetHistory.pushAt, value || 2)
    case "ownpush": return !!targetHistory && targetHistory.pushBy === owner.id && recent(battle, targetHistory.pushAt, value || 2)
    case "otherpush": return !!targetHistory && targetHistory.pushBy !== owner.id && friendly(battle, owner.id, targetHistory.pushBy) && recent(battle, targetHistory.pushAt, value || 2)
    case "pulled": return !!targetHistory && recent(battle, targetHistory.pullAt, value || 2)
    case "ownpull": return !!targetHistory && targetHistory.pullBy === owner.id && recent(battle, targetHistory.pullAt, value || 2)
    case "otherpull": return !!targetHistory && targetHistory.pullBy !== owner.id && friendly(battle, owner.id, targetHistory.pullBy) && recent(battle, targetHistory.pullAt, value || 2)
    case "owninterrupt": return !!targetHistory && targetHistory.interruptBy === owner.id && recent(battle, targetHistory.interruptAt, value || 2)
    case "otherinterrupt": return !!targetHistory && targetHistory.interruptBy !== owner.id && friendly(battle, owner.id, targetHistory.interruptBy) && recent(battle, targetHistory.interruptAt, value || 2)
    case "ownhit": return !!targetHistory && targetHistory.hitBy === owner.id && recent(battle, targetHistory.hitAt, value || 2)
    case "ownshield": return !!target && (event.shieldOwner ?? battle.runtime.shieldCasts.get(target.id)?.owner) === owner.id
    case "moved": return event.style === "dancewalk" || !!targetHistory && recent(battle, targetHistory.movedAt, value || 2)
    case "skillmoved": return !!targetHistory && friendly(battle, owner.id, targetHistory.dashBy) && recent(battle, targetHistory.dashAt ?? -Infinity)
    case "recentwalk": return wardenWalkers(battle, owner, value).length > 0
    case "nearwindup": return wardenWindupNear(battle, owner, value, event.cast)
    case "enteredge": return !!event.from && !!event.landing && event.style !== "return" &&
      !isOutside(event.landing) && borderGap(event.from) > value && borderGap(event.landing) <= value
    case "nearlanding": return !!event.landing && edgeDistance(owner, event.landing) <= value
    case "partner": case "partneredge": {
      const ally = unitOf(battle, event.cast.target)
      return !!ally?.hp && ally.id !== owner.id && friendly(battle, owner.id, ally.id) && !isOutside(ally) &&
        (name === "partner" ? edgeDistance(owner, ally) <= value : borderGap(ally) <= value)
    }
    case "centerward": {
      if (!target || !event.axis || edgeDistance(target, CENTER) < 1) return false
      const toward = direction(target, CENTER)
      return toward.x * event.axis.x + toward.y * event.axis.y > .99
    }
    case "relayowner": return event.wardenRelay?.owner === owner.id
    case "effectivehit": return (event.amount ?? 0) + (event.absorbed ?? 0) > 0
    case "effectiveContact": return (trace?.effectiveHits ?? 0) > 0
    case "sweptshield": return event.cast.firstWard !== undefined && [...event.cast.trace.values()].some(({ pushedTo }) => !!pushedTo)
    case "retraced": return event.style === "rewind" && !!trace?.approach
    case "wardchain": return event.cast.used.has("wardenChain") && !isOutside(owner)
    case "wardpair": return target !== undefined && (event.wardPair?.includes(target.id) ?? false)
    case "opposed": {
      const cross = left(direction(event.cast.from, event.cast.aim))
      const sides = event.pushGroup?.map(({ from, motion }) => (motion.end.x - from.x) * cross.x + (motion.end.y - from.y) * cross.y)
      return !!sides?.some((side) => side < -.1) && sides.some((side) => side > .1)
    }
    case "moving": return !!target?.move
    case "walking": return !!target?.move && !target.force && !history(battle, target).moveReturning
    case "stand": return !owner.move && !owner.force && battle.time - history(battle, owner).standAt >= (value || 15) / 10
    case "setbrace": return bulwarkSetBrace(battle, owner)
    case "selfhurt": return history(battle, owner).wounds.some(({ time }) => recent(battle, time, value || 4))
    case "nearally": return nodes(battle).some((unit) => unit.hp && unit !== owner && friendly(battle, owner.id, unit.id) && edgeDistance(owner, unit) <= (value || 120))
    case "nearcard": return alliesOf(battle, owner.id).some((unit) => unit.hp && unit !== owner && edgeDistance(owner, unit) <= value)
    case "targetnearally": return !!target && alliesOf(battle, owner.id).some((unit) => unit.hp && unit !== owner && edgeDistance(unit, target) <= value)
    case "twowarded": return alliesOf(battle, owner.id).filter((unit) => unit.hp && unit !== owner && shielded(battle, unit) && edgeDistance(unit, owner) <= value).length >= 2
    case "ownwardmate": return alliesOf(battle, owner.id).some((unit) => unit.hp && unit !== owner && shielded(battle, unit) && battle.runtime.shieldCasts.get(unit.id)?.owner === owner.id)
    case "banneranti": return !!target && !!paladinBanner(battle, owner, target)
    case "twoallies": return nodes(battle).filter((unit) => unit.hp && unit !== owner && friendly(battle, owner.id, unit.id) && edgeDistance(owner, unit) <= (value || 140)).length >= 2
    case "nearenemy": return nodes(battle).some((unit) => unit.hp && !friendly(battle, owner.id, unit.id) && edgeDistance(owner, unit) <= (value || 120))
    case "twoenemies": return nodes(battle).filter((unit) => unit.hp && !friendly(battle, owner.id, unit.id) && edgeDistance(owner, unit) <= (value || 130)).length >= 2
    case "nootherenemy": return !nodes(battle).some((unit) => unit.hp && unit !== target && !friendly(battle, owner.id, unit.id) && edgeDistance(event.at ?? event.cast.aim, unit) <= (value || 120))
    case "lowally": return nodes(battle).some((unit) => unit.hp && unit !== owner && friendly(battle, owner.id, unit.id) && hpPct(unit) < 45 && edgeDistance(owner, unit) <= (value || 145))
    case "faraway": return !nodes(battle).some((unit) => unit.hp && !friendly(battle, owner.id, unit.id) && edgeDistance(owner, unit) < (value || 250))
    case "insidezone": return battle.runtime.fields.some((zone) => zone.cast.owner === owner.id && areaHits(zone.area, owner))
    case "overlapzone": return battle.runtime.fields.some((zone) =>
      zone.cast.owner === owner.id && zone.cast.skill?.id === "bulwark/Prismatic/A2" && zone.until > battle.time && areaHits(zone.area, owner) > 1)
    case "shieldmate": return alliesOf(battle, owner.id).some((unit) => unit !== owner && unit.hp && shielded(battle, unit))
    case "antiup": return modifier(battle, owner, "anti") > 0
    case "nearsummon": return activeDeployments(battle).some(({ group, deployment }) =>
      group.owner === owner.id && deployment.bodies.some((body) => body.hp && edgeDistance(body, owner) <= value))
    case "farsummon": return activeDeployments(battle).some(({ group, deployment }) =>
      group.owner === owner.id && deployment.bodies.some((body) => body.hp && edgeDistance(body, owner) >= value))
    case "awaysummon": {
      const nearest = nearestSummon(battle, owner)
      return !!nearest && edgeDistance(owner, nearest) >= value
    }
    case "leavesummon": case "entersummon": {
      if (!event.from || !event.landing || event.style === "return") return false
      const start = nearestSummon(battle, owner, event.from)
      const end = nearestSummon(battle, owner, event.landing)
      if (!start || !end) return false
      const insideStart = edgeDistance(event.from, start) <= value
      const insideEnd = edgeDistance(event.landing, end) <= value
      return name === "entersummon" ? !insideStart && insideEnd : insideStart && !insideEnd
    }
    case "portal": case "broken": return event.style === name
    case "deployed": return !!event.cast.summon
    case "body": return isSummonId(event.summon) && Number(event.summon.split("-").at(-1)) + 1 === value
    case "zone": return !!event.zone || event.style === "zone"
    case "relay": return event.relay !== undefined
    case "ricochet": return event.cast.skill?.id === "ranger/R/A1" && event.cast.stage === 2 && event.target !== event.cast.target
    case "footfall": return event.release === "move"
    case "timed": return (event.stepDelay ?? 0) > 0
    case "edgepush": return event.style === "edge"
    case "centerlane": {
      if (!event.area || !target || event.selector?.shape !== "L") return false
      const axis = direction(event.cast.from, event.cast.aim)
      const center = event.area.center
      return Math.abs((target.x - center.x) * axis.y - (target.y - center.y) * axis.x) <= 12
    }
    case "laneFirst": {
      const axis = direction(event.cast.from, event.cast.aim)
      const lane = (at: EdgePoint) => at.x * axis.x + at.y * axis.y
      return !!target && !!event.hitGroup && !event.hitGroup.some(({ at }) => lane(at) < lane(target) - .01)
    }
    case "edgeHit": {
      if (!event.area || !target) return false
      return event.area.parts.some((part) => {
        if (part.kind === "circle") return edgeDistance(part.center, target) >= part.radius * .65
        if (event.selector?.shape !== "L") return false
        const axis = direction(event.cast.from, event.cast.aim)
        const start = event.cast.from
        return Math.abs((target.x - start.x) * axis.y - (target.y - start.y) * axis.x) >= event.selector.size[1] * .30
      })
    }
    case "woundBonus": return berserkerArt(event.cast)?.motif === "wound" &&
      history(battle, owner).wounds.some(({ time }) => recent(battle, time, 4))
    case "flankStrike": return berserkerArt(event.cast)?.motif === "flank" && event.cast.used.has("dash")
    case "chargeLine": return !!event.cast.berserkerRoute && !!berserkerArt(event.cast)?.line && event.cast.used.has("dash") && !!event.area
    case "twohits": return [...event.cast.trace].filter(([id, hit]) => !friendly(battle, owner.id, id) && (hit.effectiveHits ?? 0) > 0).length >= 2
    case "twoDraws": return [...event.cast.trace.values()].filter(({ pulledTo }) => !!pulledTo).length >= 2
    case "knocked": return !!trace?.pushedTo && isOutside(trace.pushedTo)
    case "rageProc": {
      const id = isFighter(owner) && owner.passives.find((passive) => passive.id.endsWith("/P" + value))?.id
      return !!id && event.cast.used.has(id + "@" + owner.id)
    }
    case "rageSecond": case "rageThird": {
      const hits = name === "rageSecond" ? 2 : 3
      return (trace?.effectiveHits ?? 0) === hits - (event.kind === "strike" ? 1 : 0)
    }
    case "flankhit": return event.target !== undefined && event.target === rangerGroupTarget(event, "flank")
    case "longhit": return event.target !== undefined && event.target === rangerGroupTarget(event, "farthest")
    case "secondlane": return event.target !== undefined && event.target === rangerGroupTarget(event, "lane")
    case "mirrorhit": return event.selector?.anchor === "m"
    case "summon": return event.style === "summon" || !!event.summon
    case "historic": return event.style === "historic"
    case "borrowed": return event.style === "borrowed"
    case "spellabsorb": case "spellbasic": case "spellreverse": case "skillshort": case "countergroup": case "armor": case "bindercatch":
      return event.style === name
    case "ownarmor": return !!target && activeBuffs(battle, target.id, "armor").some((buff) => buff.cast.owner === owner.id)
    case "linecast": return event.cast.skill?.aim.mode === "direction"
    case "nearcast": return nodes(battle).some((unit) => unit.hp && !friendly(battle, owner.id, unit.id) &&
      edgeDistance(owner, unit) <= value && (!!chargeOf(battle, unit) || event.cast.used.has("bossCharge") && unit.id === event.cast.target))
    case "hostileSkill": return !!event.attackCast && event.attackCast.order !== "basic" && !friendly(battle, owner.id, event.attackCast.owner)
    case "spellwedge": return spellArt(event.cast)?.motif === "wedgejump" && event.cast.used.has("dasharrived")
    case "spellrepel": return spellArt(event.cast)?.motif === "deflector"
    case "retreatcut": return spellArt(event.cast)?.motif === "sidestep" && event.cast.used.has("dasharrived") && !!event.cast.interrupted?.size
    case "doubleinterrupt": return (event.cast.interrupted?.size ?? 0) >= 2
    case "differentcut": return event.previousInterrupt !== undefined && event.previousInterrupt !== event.target
    case "foedash": return !!targetHistory && recent(battle, targetHistory.skillMovedAt ?? -Infinity, (value || 20) / 10)
    case "hostilezone": return battle.runtime.fields.some((field) => field.until > battle.time && !friendly(battle, field.cast.owner, owner.id) && !!areaHits(field.area, owner))
    case "spellcut": return nodes(battle).some((unit) => unit.hp && !friendly(battle, owner.id, unit.id) && edgeDistance(owner, unit) <= value &&
      history(battle, unit).interruptBy === owner.id && recent(battle, history(battle, unit).interruptAt, 3))
    case "clearedZone": return !!event.clearedAreas?.length
    case "assassinLow": return !!event.cast.assassinHitLow
    case "assassinPushed": return !!event.cast.assassinHitPushed
    case "assassinOutsideHit": return !!event.cast.assassinHitOutside && !!event.cast.hitStages.size
    case "shadowrelay": case "shadowmark": case "shadowchase": case "shadowpit": case "shadowclear": return event.style === name
    case "shadowSide": return ["side", "left", "right"].includes(event.assassinMove ?? "")
    case "shadowBack": return event.assassinMove === "away" || event.assassinMove === "back"
    case "shadowLanding": return event.cast.used.has("dasharrived") && !!event.cast.assassinRoute
    case "shadowMarkMove": return assassinArt(event.cast)?.motif === "foldedknife" && event.release === "move"
    case "shadowCross": {
      const enemy = unitOf(battle, event.cast.target)
      return event.assassinMove === "far" && !!enemy && !!event.from && !!event.landing &&
        (event.from.x - enemy.x) * (event.landing.x - enemy.x) + (event.from.y - enemy.y) * (event.landing.y - enemy.y) < 0
    }
    case "shadowEdgeLoaded": return event.cast.used.has("spent/assassin/C/P1@" + owner.id)
    case "shadowPushLoaded": return event.cast.used.has("spent/assassin/E/P1@" + owner.id)
    case "shadowPin": return assassinArt(event.cast)?.motif === "shadowpin"
    case "shadowDelay": return (event.stepDelay ?? 0) > 0
    case "shadowPhase": return activeBuffs(battle, owner.id, "phase").length > 0
    case "shadowOffhandNew": return assassinArt(event.cast)?.motif === "offhand" && (event.stepDelay ?? 0) > 0 &&
      event.target !== event.cast.target && !trace?.hits
    case "shadowWrap": {
      const shield = battle.runtime.shieldCasts.get(owner.id)
      return shielded(battle, owner) && shield?.owner === owner.id && shield.skill?.id === "assassin/L/A5" &&
        shield.used.has("dasharrived") && nearestFoeGap(battle, owner, owner) <= 120
    }
    case "shadowSwitch": return event.cast.previousHandTarget !== undefined && event.cast.previousHandTarget !== event.target && !event.cast.used.has("handSettled")
    case "escapedWarning": return !!event.escapedWarning
    case "shadowExecute": return assassinArt(event.cast)?.motif === "deathchase" && !!event.cast.assassinHitLow
    case "shadowReturnBoth": return assassinArt(event.cast)?.motif === "turnaround" && (trace?.effectiveHits ?? 0) >= 2
    case "shadowTwoSides": {
      const motif = assassinArt(event.cast)?.motif
      if (!target || !trace?.firstAxis || (trace.effectiveHits ?? 0) < 2 || !["mirroredge", "doubleedge"].includes(motif ?? "")) return false
      const axis = direction(event.from ?? event.cast.from, target)
      return trace.firstAxis.x * axis.x + trace.firstAxis.y * axis.y < 0
    }
    case "shadowEdgePush": return event.style === "edge"
    case "shadowBorrow": return assassinArt(event.cast)?.motif === "borrowstep" && event.cast.used.has("dasharrived") && event.target === event.cast.target
    case "shadowCut": return assassinArt(event.cast)?.motif === "blankstep" && !!event.cast.interrupted?.size
    case "shadowLandingNear": {
      const ally = unitOf(battle, holder)
      return !!ally?.hp && !!target?.hp && friendly(battle, owner.id, ally.id) && !friendly(battle, owner.id, target.id) && edgeDistance(ally, target) <= value
    }
    case "shadowShore": return assassinArt(event.cast)?.motif === "shoreward" && !!event.cast.assassinHitOutside && !!event.cast.hitStages.size
    case "mageDelay": return (event.stepDelay ?? 0) > 0
    case "mageStep": return warlockArt(event.cast)?.motif === "firestep" && event.cast.used.has("dasharrived")
    case "mageSteady": return !owner.move && !owner.force && battle.time - history(battle, owner).standAt >= 1.5
    case "mageStill": return mageStillReady(battle, owner)
    case "mageLastBurn": return warlockArt(event.cast)?.motif === "ember" && event.style === "dot" && !!event.dotCount && event.dotTick === event.dotCount
    case "mageTwoSlow": return (event.cast.warlockSlowed?.size ?? 0) >= 2
    case "mageFirstSlow": return warlockArt(event.cast)?.motif === "goldtrap" && event.cast.warlockSlowed?.size === 1
    case "mageArc": return warlockArt(event.cast)?.motif === "arc" && event.style === "chain" && event.target !== event.cast.target
    case "mageRetort": return warlockArt(event.cast)?.motif === "flameward" && event.release === "break"
    case "mageChilled": return mageSlowUntil(battle, owner) > battle.time
    case "mageRepeat": return (trace?.effectiveHits ?? 0) >= 2 && !!event.cast.skill
    case "mageCross": return warlockArt(event.cast)?.motif === "crossbolt" && event.style === "cross" && (trace?.effectiveHits ?? 0) >= 2
    case "mageMovingNew": return warlockArt(event.cast)?.motif === "movingash" && event.cast.stage === 2 && !trace?.hits
    case "mageMulti": return [...event.cast.trace.values()].filter(row => row.hits > 0).length >= 2
    case "mageCometBoth": return warlockArt(event.cast)?.motif === "comet" && event.cast.stage === 2 && (trace?.effectiveHits ?? 0) >= 2
    case "mageReflection": return warlockArt(event.cast)?.motif === "reflectionbolt" && event.cast.stage === 2 && !!event.cast.warlockSecond
    case "mageFieldNear": return !!mageFieldNear(battle, owner, value)
    case "mageStormLast": return warlockArt(event.cast)?.motif === "firestorm" && event.cast.stage === 3
    case "mageRimPaid": return event.cast.warlockRim === event.target && event.cast.used.has("applied/warlock/E/P2")
    case "mageStarPaid": return event.cast.used.has("applied/warlock/Radiant/P1")
    case "mageCloudShift": return warlockArt(event.cast)?.motif === "starcloud" && event.cast.stage >= 2 && !!event.cast.warlockSecond && edgeDistance(event.cast.aim, event.cast.warlockSecond) > 3
    case "mageFlameFirst": return warlockArt(event.cast)?.motif === "flamecurtain" && event.cast.damage > 0 && (event.cast.firstWard === undefined || event.cast.firstWard === event.target)
    case "mageFissure": return warlockArt(event.cast)?.motif === "fault" && event.style === "fissures"
    case "mageStarCore": return warlockArt(event.cast)?.motif === "starfallring" && !!target && edgeDistance(event.at ?? target, event.cast.aim) <= 75
    case "mageFrequencyRepeat": return warlockArt(event.cast)?.motif === "dualfrequency" && event.cast.stage === 2 && !!trace?.hits
    case "mageAid": return event.style === "mageAid"
    case "shadowEscape": return !!event.landing && (event.cast.assassinNeighbors ?? []).some(({ id, gap }) => {
      const enemy = unitOf(battle, id)
      return !!enemy?.hp && edgeDistance(event.landing!, enemy) - gap >= value
    })
    case "splitpartner": return [...event.cast.trace].filter(([, record]) => record.hits > 0).slice(0, 2).some(([id]) => id === event.target)
    case "splitetch": {
      const [first, second] = [...event.cast.trace].filter(([, record]) => record.hits > 0)
      return !!first && !!second?.[1].pushedTo && activeBuffs(battle, first[0], "armor").some((buff) => buff.cast.id === event.cast.id)
    }
    case "vow": case "burning": case "bond": case "chorus": return event.style === name
    case "normalwalk": return event.style !== "return" && (event.distance ?? 0) >= 3
    case "healroom": return !!target && target.maxHp - target.hp > Math.round(((event.raw ?? 0) + (event.bonus ?? 0)) * (event.scale ?? 1))
    case "palhit": return [...event.cast.trace.values()].some((record) => (record.effectiveHits ?? 0) > 0)
    case "palhealed": return event.cast.heals > 0
    case "palhealedtarget": return (trace?.heal ?? 0) > 0
    case "chainheal": return paladinArt(event.cast)?.motif === "chain" && !!event.area
    case "sanctuary": return paladinArt(event.cast)?.motif === "sanctuary"
    case "sanctuaryrim": return edgeDistance(owner, target ?? destination) > 125
    case "escortdash": return paladinArt(event.cast)?.motif === "approach" && event.cast.used.has("dasharrived")
    case "pallineheal": return event.cast.skill?.aim.mode === "direction" && event.cast.heals > 0 &&
      [...event.cast.trace.values()].some((record) => (record.effectiveHits ?? 0) > 0)
    case "horizonward": return paladinArt(event.cast)?.motif === "horizon" &&
      [...event.cast.trace.values()].filter((record) => record.shield).length >= 2
    case "closerswap": {
      const route = event.cast.paladinRoute
      return !!route?.swap && nodes(battle).some((unit) => unit.hp && !friendly(battle, owner.id, unit.id)) &&
        nearestFoeGap(battle, owner, route.to) + .01 < nearestFoeGap(battle, owner, route.from)
    }
    case "paltouched": return (trace?.effectiveHits ?? 0) > 0
    case "paltwinwound": return (event.cast.trace.get(owner.id)?.effectiveHits ?? 0) > 0 &&
      alliesOf(battle, owner.id).some((unit) => unit.hp && unit !== owner && edgeDistance(unit, owner) <= 145 &&
        (event.cast.trace.get(unit.id)?.effectiveHits ?? 0) > 0)
    case "palpushed": return !!target?.force && target.force.cause === event.cast && targetHistory?.pushBy === event.cast.owner &&
      targetHistory.pushAt === target.force.since
    case "share": return event.style === "share"
    case "reflect": return event.style === "reflect"
    case "side": return event.style === "side"
    case "fall": return event.style === "dash" || event.style === "hop" || event.cast.used.has("dash")
    case "swap": return event.style === "swap"
    case "returning": return event.style === "return"
    case "line": return !!event.selector?.shape && "LBXMK".includes(event.selector.shape)
    case "ground": return event.cast.skill?.aim.mode === "point"
    case "deployfield": return event.cast.skill?.steps.some((step) => !!step.zone) ?? false
    case "march": return event.cast.skill?.id === "bulwark/Radiant/A1"
    case "citadel": return event.cast.skill?.id === "bulwark/Prismatic/A1" && event.style === "guard"
    case "cohit": return event.cast.trace.get(owner.id)?.hitAt === battle.time &&
      [...event.cast.trace].some(([id, hit]) => id !== owner.id && friendly(battle, owner.id, id) && hit.hitAt === battle.time)
    case "absorbed": return (event.absorbed ?? 0) > 0
    case "primarybreak": return !event.guardBreak
    case "guardbreak": return !!event.guardBreak
    case "firstbrace": return event.braceUses === 2
    case "provoked": return event.cast.used.has("provoked")
    case "area": return !!event.area
    case "cross": return warlockArt(event.cast)?.motif === "crossbolt" && event.style === "cross" || !!event.area && !!target && areaHits(event.area, target) > 1
    case "rim": return !!event.area && !!target && event.area.parts.some((p) => p.kind === "circle" && edgeDistance(p.center, target) >= p.radius / 2)
    case "core": return !!event.area && !!target && edgeDistance(event.area.center, target) <= (value || 65)
    case "first": return (event.index ?? 0) === 0
    case "last": return (event.index ?? 0) === (event.total ?? 1) - 1
    case "multi": return (event.total ?? 0) >= 2 || [...event.cast.trace.values()].filter((t) => t.hits || t.heal > 0 || t.shield).length >= 2
    case "pairedshield": return !!event.cast.trace.get(owner.id)?.shield &&
      [...event.cast.trace].some(([id, record]) => id !== owner.id && record.shield)
    case "pushpair": {
      const landing = event.landing
      return !!landing && [...event.cast.trace].some(([id, record]) =>
        id !== event.target && record.pushedTo && edgeDistance(record.pushedTo, landing) <= value)
    }
    case "pushnear": return !!event.landing && !!trace?.pushedTo && edgeDistance(trace.pushedTo, event.landing) <= value
    case "landed": return event.cast.hitStages.size > 0
    case "both": return event.cast.hitStages.size >= 2
    case "repeat": return event.kind === "strike" ? (trace?.hits ?? 0) >= 1 : (trace?.hits ?? 0) >= 2
    case "repeatgap": return trace?.hitAt !== undefined && battle.time - trace.hitAt >= value / 10
    case "second": return (trace?.hits ?? 0) === (event.kind === "strike" ? 1 : 2)
    case "secondtotal": return [...event.cast.trace.values()].reduce((count, record) => count + record.hits, 0) === 2
    case "third": return (trace?.hits ?? 0) === (event.kind === "strike" ? 2 : 3)
    case "stage": return event.cast.stage === value
    case "delayed": return event.cast.stage > 1
    case "charge": return !!target?.hp && !!chargeOf(battle, target)
    case "slow": return !!target && activeBuffs(battle, target.id, "slow").length > 0
    case "armored": return !!target && activeBuffs(battle, target.id, "armor").length > 0
    case "burned": return !!target && activeBuffs(battle, target.id, "dot").length > 0
    case "over": return (event.overheal ?? 0) > 0
    case "loss": case "effective": return (event.amount ?? 0) > 0
    case "amount": return !!target && (event.amount ?? 0) >= target.maxHp * ratio(value)
    case "totalheal": return !!target && (trace?.heal ?? 0) >= target.maxHp * ratio(value)
    case "renewFinal": return event.cast.skill?.id === "lifebringer/C/A1" && event.healTick === 3 && event.healCount === 3
    case "historicHealed": return !!target && (event.historicHealed ?? 0) >= target.maxHp * ratio(value)
    case "lifeActive": return event.cast.order === "skill" && !!lifeArt(event.cast)
    case "healerActive": return !!healerArt(event.cast)
    case "healerSingle": return !!healerArt(event.cast) && ["ally", "other"].includes(event.cast.skill!.aim.mode)
    case "healerWound": return !!healerArt(event.cast) && event.release === "hurt"
    case "healerSteady": return healerArt(event.cast)?.motif === "steadyStep"
    case "healerShortClean": return !!event.cleansed?.includes("short")
    case "healerRelay": return !!healerArt(event.cast) && event.healerRole === "relay"
    case "healerWalkHeal": return healerArt(event.cast)?.motif === "retreatKit" && event.release === "move"
    case "healerWalkWard": return healerArt(event.cast)?.motif === "quickStep" && event.release === "move"
    case "healerApproach": case "healerEnter": return !!healerMoveTarget(battle, owner, event, value, name === "healerEnter")
    case "healerStill": return healerStillReady(battle, owner)
    case "healerOver": return !!target && (event.amount ?? 0) > target.maxHp * ratio(value)
    case "healerPriority": return healerArt(event.cast)?.motif === "priority" && event.healerRole === "priority"
    case "healerReciprocal": return healerArt(event.cast)?.motif === "twoWay" &&
      !!event.cast.healerHeals?.has(owner.id) && target !== owner
    case "healerCrossLow": return !!target?.hp && (event.lowBefore ?? 100) >= value && hpPct(target) < value
    case "healerAreaGroup": return !!healerArt(event.cast) && !!event.area && (event.healedGroup?.length ?? 0) >= 2
    case "healerPoolGroup": return healerArt(event.cast)?.motif === "triage" && (event.healedGroup?.length ?? 0) >= 2
    case "healerDualGroup": return healerArt(event.cast)?.motif === "dualRoute" && (event.healedGroup?.length ?? 0) === 2
    case "healerLineFront": return healerArt(event.cast)?.motif === "sutureLane" && event.cast.healerPrimary === event.target
    case "healerWardAfterHeal": return !!healerArt(event.cast) && (trace?.heal ?? 0) > 0
    case "healerCleanWard": return !!target && !!healerArt(event.cast) && !!event.cast.healerCleaned?.has(target.id)
    case "healerStation": return healerArt(event.cast)?.motif === "aidStation" && !!event.zone
    case "healerUrgentWard": return healerArt(event.cast)?.motif === "urgentCorners" && event.healerRole === "priority" && (trace?.heal ?? 0) > 0
    case "healerCleanCount": return (event.cleansed?.length ?? 0) >= value
    case "healerRally": return healerArt(event.cast)?.motif === "rally" && event.healerRole === "rally" && (trace?.heal ?? 0) > 0
    case "healerNet": return healerArt(event.cast)?.motif === "net" && !!event.zone
    case "healerWindLock": case "healerRallyDone": return event.style === name
    case "manualReturn": case "healerManualReturn": return event.kind === "return" && targetHistory?.danceReturnedAt === battle.time
    case "healerBloodLamp": return alliesOf(battle, owner.id).some(unit => unit !== owner && unit.hp > 0 && hpPct(unit) < 35 && edgeDistance(unit, owner) <= 170)
    case "lifeMulti": return (event.total ?? 0) >= 2
    case "lifeOther": return !!target && target.id !== owner.id && friendly(battle, owner.id, target.id)
    case "lifewounded": return !!target?.hp && target.hp < target.maxHp
    case "lifeFirst": return event.cast.lifeFirstHeal === event.target && (event.healCountBefore ?? 0) === 0
    case "lifeDamageHeal": return event.cast.damage > 0 && event.cast.heals > 0
    case "lifeSprigFirst": return lifeArt(event.cast)?.motif === "sprig" && event.healTick === 1
    case "lifeDew": return lifeArt(event.cast)?.motif === "dew" && !!event.zone
    case "lifeGuard": return !!target?.hp && !!event.guardBreak && event.brokenShield === event.cast && friendly(battle, owner.id, target.id)
    case "lifeBud": return lifeArt(event.cast)?.motif === "bud" && event.release === "hurt"
    case "lifeStep": return lifeArt(event.cast)?.motif === "stepdew" && event.release === "move"
    case "lifeGrove": return lifeArt(event.cast)?.motif === "grove"
    case "lifeConvert": return event.style === "shieldconvert" && lifeArt(event.cast)?.motif === "seed"
    case "lifeArrowHeal": return lifeArt(event.cast)?.motif === "branchshot" && event.healTick === 2
    case "lifeGroveNear": return !!lifeHealingField(battle, owner, value || 100, true)
    case "lifeVineSecond": return lifeArt(event.cast)?.motif === "vine" && event.healTick === 2 && event.target !== event.cast.target
    case "lifeCluster": return lifeArt(event.cast)?.motif === "cluster" && event.cast.stage === 2
    case "lifeBorrow": return lifeArt(event.cast)?.motif === "borrowroot" && event.release === "hurt"
    case "lifeFootleaf": return lifeArt(event.cast)?.motif === "footleaf" && event.healTick === 2
    case "lifeBlade": return lifeArt(event.cast)?.motif === "budblade"
    case "lifeLichenThird": return lifeArt(event.cast)?.motif === "lichen" && event.healCountBefore === 2
    case "lifeLichenFourth": return lifeArt(event.cast)?.motif === "lichen" && event.healTick === 4
    case "lifeLanding": return lifeArt(event.cast)?.motif === "landingdew" && event.release === "move"
    case "lifeLineSecond": return lifeArt(event.cast)?.motif === "rootline" && event.healTick === 2
    case "lifeRootWard": return !!target && (lifeArt(event.cast)?.motif === "sapward" || lifeHotRecipients(battle, owner, target).length > 0)
    case "lifeScar": return lifeArt(event.cast)?.motif === "scarward" && event.style === "historic"
    case "lifeTwinBreak": return lifeArt(event.cast)?.motif === "twinbud" && !!event.guardBreak && event.brokenShield === event.cast
    case "lifeForest": return lifeArt(event.cast)?.motif === "forestexit" && !!event.zone
    case "lifeSharedBranch": return lifeArt(event.cast)?.motif === "sharedbranch" && event.healTick === 2
    case "lifeGrantedWard": return !!trace?.shield
    case "lifeOwnHealingArea": return !!lifeHealingField(battle, owner)
    case "lifeCircuitRepeat": return lifeArt(event.cast)?.motif === "circuit" && event.healTick === 2 &&
      event.cast.lifePrimary === event.target && (event.healCountBefore ?? 0) > 0
    case "lifeCircuitThird": return lifeArt(event.cast)?.motif === "circuit" && event.healTick === 3 &&
      event.cast.used.has("applied/lifebringer/Radiant/P1")
    case "lifeRoamOther": return lifeArt(event.cast)?.motif === "roamingroot" && event.target !== event.cast.target &&
      !!event.area && !!event.cast.lifeFollowFrom && edgeDistance(event.area.center, event.cast.lifeFollowFrom) > 3
    case "lifeSoilAgain": return lifeArt(event.cast)?.motif === "soil" && event.healTick === 2 && (event.healCountBefore ?? 0) > 0
    case "lifeMirror": return lifeArt(event.cast)?.motif === "mirrorbud" && event.release === "break"
    case "lifeDewneedle": return lifeArt(event.cast)?.motif === "dewneedle" && event.healTick === 2 && event.cast.damage > 0
    case "lifeHasHot": return lifeHotRecipients(battle, owner).length > 0
    case "lifeStarbranch": return lifeArt(event.cast)?.motif === "starbranch" && event.healTick === 2 && event.cast.damage > 0
    case "crossheal": return !!target && (trace?.heal ?? 0) >= target.maxHp * ratio(value) &&
      (trace?.heal ?? 0) - (event.amount ?? 0) < target.maxHp * ratio(value)
    case "dist": return (event.distance ?? 0) >= value
    case "attackedby": return (targetHistory?.attackers.size ?? 0) >= value
    case "marked": return !!target && battle.runtime.watches.some((watch) => watch.target === target.id && watch.cast.owner === owner.id && watch.until > battle.time)
    case "binderActive": return !!binderArt(event.cast)
    case "binderArea": return !!event.area && !!binderArt(event.cast)
    case "binderAbsorb": return event.style === "binderAbsorb" && (event.amount ?? 0) > 0
    case "binderShore": case "binderSpread": case "binderEntry": case "binderWind": case "binderTide": return event.style === name
    case "binderMist": return binderArt(event.cast)?.motif === "mistPane"
    case "binderOwnedSlow": return !!target?.hp && !friendly(battle, owner.id, target.id) && binderSlowing(battle, owner, target)
    case "binderMulti": return !!binderArt(event.cast) && [...event.cast.trace.values()].filter(row => row.pulledTo).length >= 2
    case "binderLeave": return event.style === "zone" && binderArt(event.cast)?.motif === "lostStep"
    case "binderRail": return event.binderBend === "rail"
    case "binderJaws": return binderArt(event.cast)?.motif === "iceJaws"
    case "binderCounter": return binderArt(event.cast)?.motif === "relayCuff"
    case "binderControl": return nodes(battle).some(unit => unit.hp && !friendly(battle, owner.id, unit.id) &&
      edgeDistance(owner, unit) <= value && binderControlled(battle, owner, unit))
    case "binderControlTarget": return !!target?.hp && binderControlled(battle, owner, target)
    case "binderTangent": return !!event.binderTangent
    case "danceActive": return !!dancerArt(event.cast)
    case "danceLead": case "danceExtraPush": case "danceRailWalk": case "danceOrbitGroup": case "danceGather": return event.style === name
    case "danceWalk": return !!event.danceWalk
    case "danceAllySkill": return !!event.cast.skill && !event.cast.signature && friendly(battle, owner.id, event.source) && (event.distance ?? 0) >= 3
    case "danceHeal": return (event.amount ?? 0) > 0
    case "danceHit": return (event.amount ?? 0) + (event.absorbed ?? 0) > 0
    case "danceWounded": return !!target && target.hp < target.maxHp
    case "danceFirstWard": return event.cast.firstWard === event.target
    case "danceFirstHit": return event.cast.danceFirstHit === event.target
    case "dancePushed": return [...event.cast.trace.values()].some(row => row.pushedTo)
    case "danceGroup": return (event.danceGroup?.length ?? 0) >= value
    case "danceDoublePair": return (trace?.effectiveHits ?? 0) === 2
    case "danceRail": case "danceSlider": return !!dancerTraitRail(battle, owner, name === "danceSlider")
    case "danceProtected": return target === owner || !!target && shielded(battle, target) && battle.runtime.shieldCasts.get(target.id)?.owner === owner.id
    case "danceFirstReturn": return event.kind === "return" && targetHistory?.danceReturns === 1 && targetHistory.danceReturnedAt === battle.time
    case "danceRecentReturn": return recent(battle, targetHistory?.danceReturnedAt ?? -Infinity, 4)
    case "danceFirstGlide": return dancerArt(event.cast)?.motif === "finaleSlider" && !event.cast.used.has("danceFirstGlide")
    case "danceCoast": return dancerArt(event.cast)?.motif === "coastRelay" && event.cast.used.has("dash") &&
      event.cast.firstWard !== undefined && [...event.cast.trace.values()].some(row => (row.effectiveHits ?? 0) > 0)
    case "binderLongRail": return !!event.binderLongRail
    case "binderOld": return binderArt(event.cast)?.motif === "oldAnchor"
    case "binderGate": return binderArt(event.cast)?.motif === "turnstile"
    case "binderBasin": return binderArt(event.cast)?.motif === "sinkBasin" && !!trace?.pulledTo
    case "binderCross": return binderArt(event.cast)?.motif === "crossWind" && event.cast.firstWard !== undefined &&
      [...event.cast.trace.values()].some(row => row.pushedTo)
    case "binderChanged": return (event.binderBend === "axis" || event.binderBend === "tide") && !!event.binderChanged
    case "binderInverse": return event.binderBend === "inverse"
    case "binderLink": return binderArt(event.cast)?.motif === "coupled" && !!event.cast.binderLink?.includes(event.target!)
    case "binderFold": return binderArt(event.cast)?.motif === "foldPlate" && event.cast.used.has("binderShortMark") &&
      [...event.cast.trace.values()].some(row => row.pushedTo)
    case "binderFieldHit": return !!event.area && !!binderArt(event.cast) && !!event.cast.skill?.steps.some(step => step.zone)
    case "binderFar": return !!event.area && !!binderArt(event.cast) && edgeDistance(owner, event.area.center) >= value
    case "binderGravity": return binderArt(event.cast)?.motif === "gravityDisk" || binderArt(event.cast)?.motif === "binaryWell"
    case "binderWells": return (event.cast.binderWells?.size ?? 0) === 2
    case "binderRetreat": return binderArt(event.cast)?.motif === "retreatSeal" && event.cast.binderBrace !== undefined &&
      event.cast.used.has("binderShortMark")
    case "binderHeadTail": return binderArt(event.cast)?.motif === "pressurePin" && !!binderPressureEnds(event.cast)
    case "binderOverlap": return !!target?.hp && !friendly(battle, owner.id, target.id) &&
      (recent(battle, targetHistory?.binderControl?.get(owner.id) ?? -Infinity) || binderSlowing(battle, owner, target)) &&
      battle.runtime.fields.some(field => field.cast.owner === owner.id && binderArt(field.cast) && field.until > battle.time && areaHits(field.area, target))
    case "proc": return event.proc?.endsWith("/P" + value) ?? false
    case "protect": return event.cast.heals > 0 || event.cast.used.has("shield")
    case "damage": return event.cast.damage > 0
    case "arrived": return event.cast.used.has("dasharrived")
    case "rightlane": {
      if (!target) return false
      const side = left(direction(event.cast.from, event.cast.aim))
      const center = event.area?.center ?? event.cast.from
      return (target.x - center.x) * side.x + (target.y - center.y) * side.y <= 0
    }
    case "pushprepared": return (event.push ?? 0) > 0
    case "return": return event.style === "return"
    case "once": case "perally": case "owncast": case "oncecast": case "attackonce": case "sameShield": return true
    case "guard": case "exguard": case "taunt": case "stall": case "dot": case "short": case "root":
    case "phase": case "halt": case "hop": case "extend": case "rot": case "cost": case "wall": case "leech":
    case "tether": case "glide": case "scorehit": case "push": case "oldstep": case "bank": case "refund": case "anti": case "opposite":
    case "shoulder": case "halfshield": case "weak": case "wallafter":
      return event.style === name
    default: throw new Error("Unknown edge condition " + key)
  }
}

function matches(battle: EdgeBattle, rule: Rule, owner: EdgeUnit, event: SkillEvent, holder?: EdgeUnitId) {
  return rule.event === event.kind && rule.flags.every((key) => flag(battle, key, owner, event, holder))
}

const unitPosition = (unit: EdgeUnit): EdgePoint => unit

export function skillAreaContains(cast: Pick<SkillCast, "skill" | "signature">, shape: string | undefined, area: EdgeArea, at: EdgePoint) {
  const id = !cast.signature ? cast.skill?.id : undefined
  const lane = shape === "L" && (paladinChoreography(id) || spellbreakerChoreography(id) || healerChoreography(id)) ? area.parts[0] : undefined
  if (lane?.kind !== "polygon" || lane.points.length !== 4) return areaHits(area, at) > 0
  const [start, end, , side] = lane.points
  const within = (edge: EdgePoint) => {
    const axis = direction(start, edge)
    const projection = (at.x - start.x) * axis.x + (at.y - start.y) * axis.y
    return projection >= -.001 && projection <= edgeDistance(start, edge) + .001
  }
  return within(end) && within(side)
}

function select(battle: EdgeBattle, cast: SkillCast, selection: Selector, event?: SkillEvent, area?: EdgeArea,
  position = unitPosition) {
  const center = area?.center ?? anchor(battle, cast, selection.anchor, event)
  let found: EdgeUnit[]
  switch (selection.units) {
    case "e": found = nodes(battle).filter((unit) => !friendly(battle, cast.owner, unit.id)); break
    case "a": found = nodes(battle).filter((unit) => friendly(battle, cast.owner, unit.id)); break
    case "o": found = nodes(battle).filter((unit) => friendly(battle, cast.owner, unit.id) && unit.id !== cast.owner); break
    case "b": found = nodes(battle).filter((unit) => friendly(battle, cast.owner, unit.id) && unit.id !== cast.target); break
    case "g": {
      const self = unitOf(battle, cast.owner)
      const picked = unitOf(battle, cast.target)
      if (cast.skill?.id === "lifebringer/L/A2") {
        found = [self, picked].filter((unit): unit is EdgeUnit => !!unit)
        break
      }
      if (cast.skill?.id === "lifebringer/L/A1" && cast.lifeRecipients) {
        found = cast.lifeRecipients.flatMap(row => unitOf(battle, row.id) ?? [])
        break
      }
      const other = paladinArt(cast)?.motif === "bond" || picked !== self && picked?.hp ? picked
        : nodes(battle).filter((unit) => unit !== self && unit.hp && friendly(battle, cast.owner, unit.id)).sort((a, b) => hpPct(a) - hpPct(b))[0]
      found = [self, other].filter((unit): unit is EdgeUnit => !!unit)
      break
    }
    case "k": found = nodes(battle).filter((unit) => (cast.trace.get(unit.id)?.hits ?? 0) > 0); break
    case "m": found = nodes(battle).filter((unit) => cast.trace.get(unit.id)?.shield); break
    default: {
      const single = refUnit(battle, cast, selection.units, event)
      found = single ? [single] : []
    }
  }
  const ignored = selection.exclude && refUnit(battle, cast, selection.exclude, event)?.id
  const owner = unitOf(battle, cast.owner)
  found = found.filter((unit) => unit.hp && unit.id !== ignored && (!area || skillAreaContains(cast, selection.shape, area, position(unit))) &&
    (!owner || selection.flags.every((key) => flag(battle, key, owner, { ...event, kind: event?.kind ?? "cast", cast, target: unit.id, at: position(unit), area }))))
  if (spellArt(cast) && selection.shape === "L") {
    const axis = direction(cast.from, cast.aim)
    const depth = (unit: EdgeUnit) => { const at = position(unit); return at.x * axis.x + at.y * axis.y }
    found.sort((a, b) => depth(a) - depth(b))
    if (selection.order === "farthest") found.reverse()
    return selection.limit ? found.slice(0, selection.limit) : found
  }
  if ((binderArt(cast) || dancerArt(cast)) && selection.shape === "L") {
    const axis = direction(cast.from, cast.aim)
    const projection = (at: EdgePoint) => at.x * axis.x + at.y * axis.y
    found.sort((a, b) => (projection(position(a)) - projection(position(b))) * (selection.order === "farthest" ? -1 : 1))
    return selection.limit ? found.slice(0, selection.limit) : found
  }
  if (!selection.limit) return found
  if (paladinArt(cast)?.motif === "lightline" && selection.shape === "L") {
    const axis = direction(cast.from, cast.aim)
    const depth = (unit: EdgeUnit) => { const at = position(unit); return at.x * axis.x + at.y * axis.y }
    found.sort((a, b) => depth(a) - depth(b))
    return found.slice(0, selection.limit)
  }
  if (bardArt(cast)?.motif === "crossMeter" && selection.shape === "L") {
    const axis = direction(cast.from, cast.aim)
    found.sort((a, b) => (a.x - b.x) * axis.x + (a.y - b.y) * axis.y)
    return found.slice(0, selection.limit)
  }
  if (cast.wardenRoute && selection.shape === "L" && wardenArt(cast)?.motif === "borrow") {
    const { from, to } = cast.wardenRoute
    const axis = direction(from, to)
    found.sort((a, b) => (a.x - b.x) * axis.x + (a.y - b.y) * axis.y)
    return found.slice(0, selection.limit)
  }
  const line = selection.shape === "L" && cast.skill?.id.startsWith("ranger/") ? area?.parts[0] : undefined
  const origin = line?.kind === "polygon" && line.points.length === 4
    ? along(line.points[0], direction(line.points[0], line.points[1]), edgeDistance(line.points[0], line.points[1]) / 2) : center
  found.sort((a, b) => {
    if (selection.order === "low") return hpPct(a) - hpPct(b)
    if (selection.order === "edge") return borderGap(position(a)) - borderGap(position(b))
    return (edgeDistance(position(a), origin) - edgeDistance(position(b), origin)) * (selection.order === "farthest" ? -1 : 1)
  })
  return found.slice(0, selection.limit)
}

function flash(battle: EdgeBattle, owner: EdgeUnitId, name: string, gold: boolean) {
  battle.runtime.notices.push({ id: ++battle.nextFx, owner, name, gold, until: battle.time + 1.1 })
}

function effectKey(cast: SkillCast, rule: string) {
  return (cast.signature && (summonTraitArt(cast.signature.id) || resolvedTraitArt(cast.signature.id)) ? cast.signature.id : cast.skill?.id ?? cast.order) + ":" + rule
}

function attach(battle: EdgeBattle, watch: Watch) {
  battle.runtime.watches = battle.runtime.watches.filter((prior) =>
    prior.id !== watch.id || prior.target !== watch.target || prior.cast.owner !== watch.cast.owner)
  battle.runtime.watches.push(watch)
}

function queueWardenPair(battle: EdgeBattle, cast: SkillCast, event: SkillEvent, settled: (event: SkillEvent) => void) {
  const first = unitOf(battle, event.target)
  const travel = first && cast.trace.get(first.id)?.pushMotion
  if (!first?.hp || !travel) return
  for (const [id, trace] of cast.trace) {
    const second = id !== first.id ? unitOf(battle, id) : undefined
    const prior = trace.pushMotion
    if (!second?.hp || !prior || edgeDistance(prior.end, travel.end) > 110) continue
    const deadline = Math.max(travel.since + travel.duration, prior.since + prior.duration)
    later(battle, Math.max(0, deadline - battle.time), () => {
      if (!first.hp || !second.hp || !travel.completed || !prior.completed ||
        edgeDistance(first, travel.end) > 2 || edgeDistance(second, prior.end) > 2 || edgeDistance(first, second) > 110) return
      settled({ ...event, at: point(first), wardPair: [second.id, first.id] })
    })
  }
}

export function emit(battle: EdgeBattle, event: SkillEvent) {
  battle.onSkillEvent?.(event)
  if (event.derived) return
  if (event.kind === "dash" && (event.distance ?? 0) > 0) {
    const unit = unitOf(battle, event.target)
    if (unit) {
      const record = history(battle, unit)
      record.dashAt = battle.time
      record.dashBy = event.source
      if (event.source === unit.id && event.cast.order !== "basic") record.skillMovedAt = battle.time
    }
  }
  battle.preview?.onEvent?.(event)
  if (event.kind === "mend" && event.cast.lifeLegacy && event.target !== event.cast.owner) {
    const { cast, paid } = event.cast.lifeLegacy
    const target = unitOf(battle, event.target)
    if (target?.hp && target.hp < target.maxHp && !paid.has(target.id)) {
      event.bonus = (event.bonus ?? 0) + target.maxHp * .06
      const confirmations = event.mendConfirmed ??= []
      confirmations.push(() => {
        paid.add(target.id)
        showDefenderTrait(battle, cast, "consume", target, event, { target: target.id })
      })
    }
  }
  reactSummons(battle, event)
  for (const watch of [...battle.runtime.watches]) {
    if (watch.until <= battle.time || watch.uses <= 0) continue
    const owner = unitOf(battle, watch.cast.owner)
    if (!owner || !matches(battle, watch.rule, owner, event, watch.target)) continue
    if (!watch.derived && bardArt(watch.cast)) {
      releaseBardWatch(battle, watch, event)
      continue
    }
    if (!watch.derived && dancerArt(watch.cast) && releaseDancerWatch(battle, watch, event)) continue
    const binding = binderArt(watch.cast)
    if (binding?.motif === "ballast") continue
    if (binding?.motif === "coupled") {
      releaseBinderLink(battle, watch, event)
      continue
    }
    if (binding?.motif === "cuffWard" || binding?.motif === "relayCuff") {
      releaseBinderWard(battle, watch, event)
      continue
    }
    if (watch.cast.signature?.id === "binder/E/P8") {
      const recipient = unitOf(battle, event.target)
      const slow = recipient && activeBuffs(battle, recipient.id, "slow").find(buff => buff.cast === event.cast)
      if (recipient && slow) {
        const extension = watch.step.operations[0].args[0]
        slow.until += extension
        event.cast.binderSlowBonus = extension
        watch.uses = 0
        showDefenderTrait(battle, watch.cast, "consume", recipient, event, {
          from: watch.cast.signature.origin, area: event.area, contacts: [point(recipient)],
        })
      }
      continue
    }
    const { flags } = watch.rule
    if (flags.includes("owncast") && event.cast.id !== watch.cast.id) continue
    if (flags.includes("sameShield") && event.brokenShield !== watch.cast) continue
    const healWatch = watch.cast.signature?.id
    if (healWatch === "bard/L/P4" || healWatch === "bard/Radiant/G2") {
      releaseBardTraitWatch(battle, watch, event)
      continue
    }
    if (event.kind === "mend" && healWatch && (healerTraitArt(healWatch) ||
      ["lifebringer/C/P7", "lifebringer/L/P8", "lifebringer/Prismatic/P8", "bard/L/P8"].includes(healWatch))) {
      const recipient = unitOf(battle, event.target)
      if (!recipient?.hp || recipient.hp >= recipient.maxHp) continue
      const extra = watch.step.operations.find(op => op.kind === "addh")?.args[0] ?? 0
      event.bonus = (event.bonus ?? 0) + recipient.maxHp * ratio(extra)
      const confirmations = event.mendConfirmed ??= []
      confirmations.push(() => {
        watch.uses--
        if (healWatch === "lifebringer/Prismatic/P8") event.cast.lifeLegacy = { cast: watch.cast, paid: new Set([recipient.id]) }
        showDefenderTrait(battle, watch.cast, "consume", recipient, event, { target: recipient.id })
      })
      continue
    }
    if (healWatch === "healer/Prismatic/G1" && event.kind === "return") {
      releaseHealerReturn(battle, watch, event)
      continue
    }
    const life = lifeArt(watch.cast)
    if (life?.motif === "seed") {
      const holder = unitOf(battle, watch.target)
      if (!holder || battle.runtime.shieldCasts.get(holder.id) !== watch.cast || !shielded(battle, holder)) continue
    }
    const once = "watch/" + watch.rule.event
    const attack = once + "/" + watch.cast.id
    if (flags.includes("oncecast") && watch.cast.used.has(once) || flags.includes("attackonce") && event.cast.used.has(attack)) continue
    if (flags.includes("oncecast")) watch.cast.used.add(once)
    if (flags.includes("oncecast") && life?.motif === "twinbud") {
      for (const linked of battle.runtime.watches)
        if (linked !== watch && linked.cast === watch.cast && linked.rule.event === watch.rule.event) linked.uses = 0
    }
    if (flags.includes("attackonce")) event.cast.used.add(attack)
    watch.uses--
    if (assassinArt(watch.cast) && event.kind !== "strike") showAssassinBeat(battle, watch.cast, "release", event.at ?? owner, {
      from: event.from ?? event.cast.from, other: owner, target: event.target, kind: event.kind,
    })
    const paladin = paladinArt(watch.cast)
    if (paladin && ["oathshield", "burning", "bond", "dawn", "chorus"].includes(paladin.motif)) {
      const contact = unitOf(battle, event.target) ?? owner
      const from = event.kind === "hit" ? unitOf(battle, event.source) : unitOf(battle, watch.target)
      showPaladinBeat(battle, watch.cast, "release", event.at ?? contact, {
        from, other: owner, target: event.target, kind: event.kind,
      })
    }
    if (!defenderWatchImpact(watch.cast, event)) consumeTrait(battle, watch.cast, unitOf(battle, watch.target) ?? owner, event.at, event.cast.from, event)
    if (berserkerArt(watch.cast)?.motif === "frontier" && event.kind === "exit" && event.intercept) {
      showBerserkerBeat(battle, watch.cast, "boundary", event.intercept, {
        from: event.from, other: event.landing, target: event.target,
      })
    }
    const rage = berserkerArt(watch.cast)?.motif
    if (rage === "answer" || rage === "emberwatch") watch.cast.outside = isOutside(owner)
    const previousPush = event.push ?? 0
    const previousBonus = event.bonus ?? 0
    const previousShadowHits = watch.cast.trace.get(event.target!)?.effectiveHits ?? 0
    const trigger = paladin && ["burning", "spear", "dawn"].includes(paladin.motif) ? { ...event, attacker: event.source } : event
    if (!watch.derived && healerArt(watch.cast)) {
      const holder = unitOf(battle, watch.target)
      if (holder?.hp) {
        watch.cast.stage++
        showHealerBeat(battle, watch.cast, "release", holder, {
          from: event.from ?? event.cast.from, target: holder.id, kind: event.kind,
        })
      }
    }
    applyStep(battle, watch.cast, watch.step, trigger, watch.derived, undefined, undefined, watch.gold)
    if (warlockArt(watch.cast)?.motif === "riftcurtain" && event.kind === "strike" && (event.bonus ?? 0) > previousBonus &&
      event.source !== undefined && event.source !== watch.cast.owner && event.target !== undefined && friendly(battle, watch.cast.owner, event.source)) {
      (event.cast.warlockAid ??= []).push({ cast: watch.cast, recipient: event.source, target: event.target })
    }
    if (warlockArt(watch.cast)) showWarlockBeat(battle, watch.cast, "release", event.at ?? owner, {
      from: event.from ?? event.cast.from, target: event.target, kind: event.kind,
    })
    if (life && life.motif !== "seed") {
      const receiver = unitOf(battle, watch.target)
      if (receiver?.hp) showLifeBeat(battle, watch.cast, "release", receiver, {
        from: event.at ?? receiver, target: receiver.id, kind: event.kind,
      })
    }
    const shadowMark = assassinArt(watch.cast)?.motif
    if ((shadowMark === "sightmark" || shadowMark === "backmark") && event.source !== watch.cast.owner &&
      (watch.cast.trace.get(event.target!)?.effectiveHits ?? 0) > previousShadowHits) {
      const partner = unitOf(battle, event.source)
      if (partner?.hp && isFighter(partner) && friendly(battle, watch.cast.owner, partner.id)) emit(battle, {
        ...eventFor(watch.cast, "assist", partner), attackCast: event.cast, assassinEnemy: event.target,
        from: event.at, landing: event.landing, amount: 1, style: shadowMark === "sightmark" ? "shadowmark" : "shadowchase",
      })
    }
    if (spellArt(watch.cast)) showSpellBeat(battle, watch.cast, "release", event.at ?? owner, {
      from: event.from ?? event.cast.from, target: event.target, kind: event.kind,
    })
    if (paladin && (paladin.motif === "chorus" || paladin.motif === "burning" || paladin.motif === "bond")) {
      const recipient = unitOf(battle, paladin.motif === "bond" ? watch.target : event.source)
      if (recipient?.hp) emit(battle, {
        ...eventFor(watch.cast, "assist", recipient, event), style: paladin.motif, attackCast: event.cast,
        from: paladin.motif === "bond" ? event.from ?? event.cast.from : event.at, derived: false,
      })
    }
    if (wardenArt(watch.cast)?.motif === "relay" && event.kind === "strike" && (event.push ?? 0) > previousPush) event.wardenRelay = watch.cast
    if ((assassinArt(watch.cast)?.motif === "brokenbeat" || watch.cast.signature?.id === "assassin/R/G1") &&
      event.kind === "strike" && (event.push ?? 0) > previousPush) event.assassinRelay = watch.cast
  }
  for (const field of [...battle.runtime.fields]) {
    if (field.until <= battle.time || field.mode !== event.kind || event.target === undefined) continue
    if (!field.derived && bardArt(field.cast)) {
      releaseBardField(battle, field, event)
      continue
    }
    if (field.seen.has(event.target)) continue
    if (field.mode === "shove" && binderArt(field.cast)) continue
    const target = unitOf(battle, event.target)
    if (!target?.hp || !select(battle, field.cast, field.step.zone?.holder ?? field.step.selector, event, field.area).includes(target)) continue
    const tripwire = field.mode === "charge" && wardenArt(field.cast)?.motif === "tripwire"
    if (tripwire && (target !== battle.boss || !battle.telegraph)) continue
    const life = lifeArt(field.cast)
    if (life?.motif === "borrowroot" && (!event.direct || (event.amount ?? 0) <= 0)) continue
    if (life?.motif === "landingdew" && (event.style === "return" || (event.distance ?? 0) < 3)) continue
    field.seen.add(target.id)
    if (tripwire) field.until = battle.time
    const activation = tripwire || life ? { ...event, zone: true, style: "zone" } : event
    if (field.step.zone?.holder) applyStep(battle, field.cast, field.step, activation, field.derived, undefined, undefined, field.gold)
    else applyStep(battle, field.cast, field.step, activation, field.derived, field.area, [target], field.gold)
    if (life?.motif === "borrowroot") {
      field.until = battle.time
      register(battle, field.cast, { delay: 0, selector: parseSelector("v"), operations: [{ kind: "addh", args: [8], style: "" }],
        watch: { duration: 6, uses: 1, holder: parseSelector("v"), rule: { event: "mend", flags: ["to"] } } }, activation)
    }
    if (event.kind === "shove") emit(battle, { ...eventFor(field.cast, "alter", target, event), style: "push", derived: field.derived })
  }
  if (event.kind === "return") {
    const returned = unitOf(battle, event.target)
    if (returned && isFighter(returned) && flag(battle, "manualReturn", returned, event)) {
      for (const owner of alliesOf(battle, returned.id)) {
        if (owner === returned || !owner.hp || !combatHasRole(owner, "bard") ||
          owner.card.rarity !== "Prismatic" || event.cast.used.has("bardReturned/" + owner.id)) continue
        const protection = bardProtection(battle, owner, returned)
        if (protection) emitBardReturn(battle, protection, returned, event, "bardSafeReturn")
      }
    }
  }
  if (battle.preview && battle.preview.loadoutFor === undefined) return
  for (const owner of battleFighters(battle)) {
    const committedAid = event.cast.owner === owner.id && (event.style === "mageAid" ||
      event.kind === "redirect" && healerArt(event.cast)?.motif === "partition" && (event.amount ?? 0) > 0)
    if (!owner.hp && !committedAid || battle.preview && battle.preview.loadoutFor !== owner.id) continue
    const cast = ownedCast(event.cast, owner)
    for (const passive of owner.passives) {
      if (battle.preview?.passiveOnly && battle.preview.passiveOnly !== passive.id) continue
      if (passive.rule.event === "always") {
        showTraitStance(battle, owner, passive, event)
        continue
      }
      const repeat = summonTraitArt(passive.id)?.repeat
      const beat = repeat === "action" && event.summon ? "/" + cast.stage
        : repeat === "body" && event.summon ? "/" + event.summon : ""
      const armor = resolvedTraitArt(passive.id)
      const life = lifebringerTraitArt(passive.id)
      const binding = binderTraitArt(passive.id)
      const dance = dancerTraitArt(passive.id)
      const medic = healerTraitArt(passive.id)
      const bard = bardTraitArt(passive.id)
      const continuous = life?.cooldown === 0 && event.kind === "mend" || binding?.cooldown === 0 && event.kind === "assist"
      const once = passive.rule.flags.includes("perally") ? passive.id + ":" + event.target : passive.id
      const key = once + "@" + owner.id + beat
      if ((owner.passiveAt[passive.id] ?? 0) > battle.time || !continuous && cast.used.has(key) ||
        passive.rule.flags.includes("once") && owner.once.has(once) || !matches(battle, passive.rule, owner, event)) continue
      const commit = () => {
        if (!continuous) cast.used.add(key)
        owner.passiveAt[passive.id] = battle.time + (armor?.cooldown ?? passiveCooldown(passive.id))
        if (passive.rule.flags.includes("once")) owner.once.add(once)
      }
      if (passive.id === "warden/Prismatic/P2") {
        queueWardenPair(battle, cast, event, (settled) => {
          if (!owner.hp || cast.used.has(key) || (owner.passiveAt[passive.id] ?? 0) > battle.time) return
          commit()
          applyPassive(battle, cast, owner, passive, settled)
        })
        continue
      }
      if (life || binding || dance || medic || bard) {
        const applied = "applied/" + passive.id
        cast.used.delete(applied)
        applyPassive(battle, cast, owner, passive, event)
        const settle = () => {
          if (!cast.used.has(applied)) {
            if ((dance || medic || bard) && event.kind === "death" && passive.rule.flags.includes("once")) commit()
            return
          }
          commit()
          if (passive.id === "healer/UC/P7") {
            const track = history(battle, owner)
            track.healerStandingSpent = track.standAt
          }
          runGold(battle, owner, { ...event, kind: "proc", proc: passive.id,
            wardConfirmed: undefined, mendConfirmed: undefined, strikeConfirmed: undefined })
        }
        if (event.kind === "ward") (event.wardConfirmed ??= []).push(settle)
        else if (event.kind === "mend") (event.mendConfirmed ??= []).push(settle)
        else if (bard && event.kind === "strike") (event.strikeConfirmed ??= []).push(settle)
        else settle()
        continue
      }
      if (armor && event.kind === "ward") {
        applyPassive(battle, cast, owner, passive, event)
        const confirmations = event.wardConfirmed ??= []
        confirmations.push(() => {
          commit()
          runGold(battle, owner, { ...event, kind: "proc", proc: passive.id, wardConfirmed: undefined })
        })
      } else if (paladinTraitArt(passive.id) && event.kind === "mend") {
        applyPassive(battle, cast, owner, passive, event)
        const confirmations = event.mendConfirmed ??= []
        confirmations.push(() => {
          commit()
          runGold(battle, owner, { ...event, kind: "proc", proc: passive.id, mendConfirmed: undefined })
        })
      } else {
        commit()
        applyPassive(battle, cast, owner, passive, event)
        runGold(battle, owner, { ...event, kind: "proc", proc: passive.id }, event)
      }
    }
    runGold(battle, owner, event)
  }
}

function runGold(battle: EdgeBattle, owner: EdgeFighter, event: SkillEvent, trigger = event) {
  const gold = owner.gold
  const cast = event.cast
  const paired = gold?.id === "berserker/Radiant/G1" && cast.berserkerFollowCast || cast
  const key = gold?.id === "warlock/Prismatic/G2" && event.style === "mageAid" ? gold.id + "@" + event.target : gold?.id ?? ""
  if (!gold || paired.owner !== owner.id || paired.skill?.id !== owner.pool.active[gold.active]?.id ||
    paired.used.has(key) || !matches(battle, gold.rule, owner, event)) return
  if (gold.id === "bard/R/G1" || gold.id === "bard/R/G2") return
  if (["berserker/C/G2", "berserker/R/G1", "berserker/L/G1", "berserker/Radiant/G2"].includes(gold.id) &&
    !cast.used.has("applied/" + owner.pool.passive[gold.passive].id)) return
  if (["paladin/C/G1", "paladin/UC/G1", "paladin/E/G1", "paladin/E/G2", "paladin/Radiant/G1",
    "paladin/Radiant/G2", "paladin/Prismatic/G1", "paladin/Prismatic/G2"].includes(gold.id) &&
    !cast.used.has("applied/" + owner.pool.passive[gold.passive].id)) return
  if (gold.id === "dancer/E/G1" && (event.danceGroup?.filter(row => cast.trace.get(row.id)?.shield).length ?? 0) < 2) return
  if (gold.id === "healer/C/G2" && !cast.used.has("healer/C/P3@" + owner.id)) return
  paired.used.add(key)
  const recipient = gold.id === "paladin/C/G1" ? unitOf(battle, event.paladinRecipient) : undefined
  applyGold(battle, owner, gold, recipient ? { ...event, target: recipient.id, at: point(recipient), from: event.at } :
    gold.id === "berserker/C/G1" ? trigger : event)
}

export function passiveStance(battle: EdgeBattle, owner: EdgeFighter, passive: EdgePassive, target?: EdgeUnit, incoming?: SkillCast) {
  if (passive.rule.event !== "always" || !owner.hp || battle.preview && battle.preview.loadoutFor !== owner.id) return false
  if (battle.preview?.passiveOnly && battle.preview.passiveOnly !== passive.id) return false
  const cast = makeCast(0, owner, "basic", target ?? owner, target)
  if (incoming?.used.has("bossCharge")) cast.used.add("bossCharge")
  return matches(battle, passive.rule, owner, { kind: "always", source: owner.id, target: target?.id ?? owner.id, cast })
}

function nearestFoeGap(battle: EdgeBattle, owner: EdgeUnit, at: EdgePoint) {
  return Math.min(Infinity, ...nodes(battle).filter((unit) => unit.hp && !friendly(battle, unit.id, owner.id)).map((unit) => edgeDistance(at, unit)))
}

function paladinBanner(battle: EdgeBattle, owner: EdgeUnit, recipient: EdgeUnit) {
  return isFighter(recipient) && recipient !== owner && battle.runtime.fields.find((field) =>
    field.cast.owner === owner.id && field.mode === "hold" && field.until > battle.time && paladinArt(field.cast)?.motif === "banner" &&
    !!areaHits(field.area, recipient))
}

function paladinFrontFlag(battle: EdgeBattle, recipient: EdgeUnit) {
  return alliesOf(battle, recipient.id).find((owner) => owner.passives.some((passive) =>
    passive.id === "paladin/C/P5" && passiveStance(battle, owner, passive, recipient)))
}

function paladinPartners(battle: EdgeBattle, owner: EdgeUnit, id: string) {
  const limit = id === "paladin/Radiant/P6" ? 125 : id === "paladin/UC/P6" ? 115 : 105
  const linked = ["paladin/C/P8", "paladin/UC/P6", "paladin/E/P7", "paladin/L/P6", "paladin/Radiant/P6"]
  if (!linked.includes(id)) return []
  return alliesOf(battle, owner.id).filter((unit) => unit !== owner && unit.hp && (id === "paladin/E/P7"
    ? shielded(battle, unit) && battle.runtime.shieldCasts.get(unit.id)?.owner === owner.id
    : edgeDistance(unit, owner) <= limit && (id !== "paladin/Radiant/P6" || shielded(battle, unit))))
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, id === "paladin/Radiant/P6" ? 2 : 1)
}

function wardenWalkers(battle: EdgeBattle, owner: EdgeUnit, reach: number) {
  return alliesOf(battle, owner.id).filter((unit) => unit !== owner && unit.hp && !isOutside(unit) &&
    edgeDistance(unit, owner) <= reach && recent(battle, battle.runtime.histories.get(unit.id)?.walkedAt ?? -Infinity))
    .sort((a, b) => edgeDistance(owner, a) - edgeDistance(owner, b))
}

function wardenWindupNear(battle: EdgeBattle, owner: EdgeUnit, reach: number, incoming?: SkillCast) {
  return !!battle.boss.hp && edgeDistance(owner, battle.boss) <= reach && (!!battle.telegraph || !!incoming?.used.has("bossCharge"))
}

function wardenPartners(battle: EdgeBattle, owner: EdgeUnit, id: string) {
  if (id === "warden/UC/P6") return wardenWalkers(battle, owner, 105).slice(0, 1)
  if (id === "warden/R/P6") return nodes(battle).filter((unit) => unit.hp && !friendly(battle, unit.id, owner.id) && edgeDistance(unit, owner) <= 130)
    .sort((a, b) => edgeDistance(owner, a) - edgeDistance(owner, b)).slice(0, 2)
  if (id === "warden/Radiant/P7" && wardenWindupNear(battle, owner, 145)) return [battle.boss]
  return []
}

function nearestSummon(battle: EdgeBattle, owner: EdgeUnit, at: EdgePoint = owner) {
  const live = activeDeployments(battle).find(({ group }) => group.owner === owner.id)
  return live?.deployment.bodies.filter((body) => body.hp).sort((a, b) => edgeDistance(a, at) - edgeDistance(b, at))[0]
}

function bulwarkSetBrace(battle: EdgeBattle, owner: EdgeUnit) {
  const { standAt } = history(battle, owner)
  return isFighter(owner) && !owner.move && !owner.force && battle.time - standAt >= 1.5 &&
    (owner.passiveAt["bulwark/C/P6"] ?? -Infinity) < standAt
}

const bulwarkPartnerReach: Record<string, number> = {
  "bulwark/C/P3": 100, "bulwark/UC/P5": 95, "bulwark/R/P8": 115,
  "bulwark/E/P6": 120, "bulwark/L/P2": Infinity, "bulwark/Radiant/P3": 120,
}

function bulwarkPartners(battle: EdgeBattle, owner: EdgeUnit, id: string) {
  const reach = bulwarkPartnerReach[id]
  if (reach === undefined) return []
  return alliesOf(battle, owner.id).filter((unit) => unit !== owner && unit.hp && edgeDistance(owner, unit) <= reach &&
    (id !== "bulwark/L/P2" || shielded(battle, unit))).sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner))
    .slice(0, id === "bulwark/E/P6" ? 2 : 1)
}

function berserkerPartners(battle: EdgeBattle, owner: EdgeUnit, id: string) {
  if (id === "berserker/C/P7") return alliesOf(battle, owner.id).filter((unit) => unit !== owner && unit.hp && edgeDistance(unit, owner) <= 110)
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 1)
  if (id === "berserker/E/P6") return nodes(battle).filter((unit) => unit.hp && !friendly(battle, owner.id, unit.id) && edgeDistance(unit, owner) <= 130)
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 2)
  return []
}

function bulwarkStance(battle: EdgeBattle, owner: EdgeUnit, id: string) {
  const passive = isFighter(owner) && owner.passives.find((entry) => entry.id === id)
  return !!passive && passiveStance(battle, owner, passive)
}

function ragePassiveEnabled(battle: EdgeBattle, owner: EdgeUnit, id: string) {
  return isFighter(owner) && owner.passives.some((passive) => passive.id === id) &&
    (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === id))
}


function mageStillReady(battle: EdgeBattle, owner: EdgeUnit) {
  const track = history(battle, owner)
  return !owner.move && !owner.force && battle.time - track.standAt >= 1.5 && track.warlockStillSpent !== track.standAt
}

function mageSlowUntil(battle: EdgeBattle, owner: EdgeUnit) {
  const buffs = activeBuffs(battle, owner.id, "slow").filter(buff => buff.values[0] > 0).map(buff => buff.until)
  const fields = battle.runtime.fields.filter(field => field.until > battle.time && field.mode === "hold" &&
    field.step.operations.some(op => op.kind === "slow" && op.args[0] > 0) &&
    select(battle, field.cast, field.step.selector, field.event, field.area).some(unit => unit.id === owner.id)).map(field => field.until)
  return Math.max(0, ...buffs, ...fields)
}

function mageFieldNear(battle: EdgeBattle, owner: EdgeUnit, reach: number) {
  const distance = (field: FieldEffect) => areaHits(field.area, owner) ? 0 : Math.min(...field.area.parts.map(part =>
    part.kind === "circle" ? Math.max(0, edgeDistance(part.center, owner) - part.radius) : edgeDistance(field.area.center, owner)))
  return battle.runtime.fields.filter(field => field.cast.owner === owner.id && field.until > battle.time && distance(field) <= reach)
    .sort((a, b) => distance(a) - distance(b))[0]
}

function warlockPartners(battle: EdgeBattle, owner: EdgeUnit, id: string): EdgePoint[] {
  const reach = id === "warlock/C/P8" ? 110 : id === "warlock/UC/P6" ? 135 : id === "warlock/Radiant/P7" ? 125 : 0
  if (reach) return alliesOf(battle, owner.id).filter(unit => unit.hp && unit !== owner && edgeDistance(unit, owner) <= reach)
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 1).map(point)
  if (id === "warlock/E/P5" || id === "warlock/R/P8") return nodes(battle).filter(unit => unit.hp && !friendly(battle, unit.id, owner.id) && edgeDistance(unit, owner) <= (id === "warlock/E/P5" ? 120 : 100))
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 1).map(point)
  const field = id === "warlock/L/P6" ? mageFieldNear(battle, owner, 115) : undefined
  return field ? [field.area.center] : []
}

function lifeHealingField(battle: EdgeBattle, owner: EdgeUnit, reach = 0, grove = false) {
  return battle.runtime.fields.find(field => field.cast.owner === owner.id && field.until > battle.time &&
    !!lifeArt(field.cast) && (grove ? lifeArt(field.cast)?.motif === "grove" && edgeDistance(field.area.center, owner) <= reach :
      !!areaHits(field.area, owner)))
}

function lifeHotRecipients(battle: EdgeBattle, owner: EdgeUnit, recipient?: EdgeUnit) {
  return battle.runtime.pendingLifeHeals.flatMap(pulse => {
    if (pulse.owner !== owner.id || pulse.remaining <= 0 || pulse.until <= battle.time) return []
    const target = unitOf(battle, pulse.target)
    return target?.hp && (recipient ? target === recipient : target !== owner) ? [target] : []
  })
}

function lifePartners(battle: EdgeBattle, owner: EdgeUnit, id: string): EdgePoint[] {
  if (id === "lifebringer/UC/P6" || id === "lifebringer/L/P6") {
    const field = lifeHealingField(battle, owner, 100, id === "lifebringer/UC/P6")
    return field ? [field.area.center] : []
  }
  if (id === "lifebringer/Radiant/P6") return lifeHotRecipients(battle, owner).slice(0, 2).map(point)
  if (id === "lifebringer/Prismatic/P7") return alliesOf(battle, owner.id).filter(unit =>
    unit !== owner && unit.hp > 0 && hpPct(unit) < 45 && edgeDistance(unit, owner) <= 145)
    .sort((a,b) => edgeDistance(a,owner)-edgeDistance(b,owner)).slice(0,1).map(point)
  return []
}

function traitReadiness(battle: EdgeBattle, job: "ranger" | "summoner" | "bulwark" | "warden" | "berserker" | "paladin" | "spellbreaker" | "assassin" | "warlock" | "lifebringer" | "binder" | "dancer" | "healer" | "bard", skill?: string) {
  type Kind = "buff" | "watch" | "shield" | "stance"
  const known = job === "ranger" ? rangerPassiveArt : job === "summoner" ? summonTraitArt : job === "warden" ? wardenTraitArt
    : job === "berserker" ? berserkerTraitArt : job === "paladin" ? paladinTraitArt : job === "spellbreaker" ? spellbreakerTraitArt
      : job === "assassin" ? assassinTraitArt : job === "warlock" ? warlockTraitArt : job === "lifebringer" ? lifebringerTraitArt
        : job === "binder" ? binderTraitArt : job === "dancer" ? dancerTraitArt : job === "healer" ? healerTraitArt
          : job === "bard" ? bardTraitArt : bulwarkTraitArt
  const ready = new Map<string, { id: string; unit: EdgeUnit; until?: number; kind: Kind; anchor?: EdgePoint; partners?: readonly EdgePoint[] }>()
  if (battle.finishedAt !== null) return []
  const mark = (id: string | undefined, uid: EdgeUnitId, kind: Kind, until?: number, anchor?: EdgePoint, partners?: readonly EdgePoint[]) => {
    if (!id || (skill && skill !== id) || !known(id) || (until !== undefined && until <= battle.time)) return
    const unit = unitOf(battle, uid)
    if (unit?.hp) ready.set(id + "@" + uid, { id, unit, kind, until, anchor, partners })
  }
  for (const buff of battle.runtime.buffs)
    mark(buff.cast.signature?.id, buff.target, "buff", buff.until, job === "healer" || job === "bard" ? buff.cast.signature?.origin : undefined)
  for (const watch of battle.runtime.watches) if (watch.uses > 0)
    mark(watch.cast.signature?.id, watch.target, "watch", watch.until, job === "healer" || job === "bard" ? watch.cast.signature?.origin : undefined)
  for (const [target, cast] of battle.runtime.shieldCasts) {
    const unit = unitOf(battle, target)
    if (unit?.shield) mark(cast.signature?.id, target, "shield", unit.shieldUntil)
  }
  if (job === "binder") for (const [id, track] of battle.runtime.histories) {
    if (track.binderFold && unitOf(battle, id)?.move) mark(track.binderFold.cast.signature?.id, id, "watch", undefined, track.binderFold.end)
  }
  if (job === "spellbreaker") for (const field of battle.runtime.fields) {
    const owner = unitOf(battle, field.cast.owner)
    if (field.cast.signature?.id === "spellbreaker/Prismatic/P6" && owner?.hp && areaHits(field.area, owner))
      mark(field.cast.signature.id, owner.id, "stance", field.until, field.area.center)
  }
  for (const owner of battleFighters(battle)) for (const passive of owner.passives) {
    if (!known(passive.id) || skill && skill !== passive.id) continue
    if (job === "paladin" && passive.id === "paladin/C/P5") {
      for (const unit of alliesOf(battle, owner.id)) {
        const banner = unit.hp && paladinBanner(battle, owner, unit)
        if (banner && passiveStance(battle, owner, passive, unit)) mark(passive.id, unit.id, "stance", banner.until, banner.area.center)
      }
      continue
    }
    if (job === "paladin" && passive.id === "paladin/C/P6" && owner.hp &&
      (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === passive.id)) &&
      (owner.passiveAt[passive.id] ?? 0) <= battle.time && !owner.move && !owner.force && battle.time - history(battle, owner).standAt >= 1.5) {
      mark(passive.id, owner.id, "stance")
    }
    if (job === "berserker" && passive.id === "berserker/UC/P5" && owner.hp && shielded(battle, owner) &&
      (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === passive.id))) {
      mark(passive.id, owner.id, "stance", owner.shieldUntil)
    }
    if (passive.id === "warden/L/P7" && owner.hp && battle.runtime.histories.get(owner.id)?.wardenInside &&
      (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === passive.id))) {
      mark(passive.id, owner.id, "stance")
    }
    if (passive.id === "bulwark/C/P6" && owner.hp && bulwarkSetBrace(battle, owner) &&
      (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === passive.id))) {
      mark(passive.id, owner.id, "stance")
      continue
    }
    if (job === "warlock" && ["warlock/C/P6", "warlock/R/P6"].includes(passive.id) && owner.hp &&
      (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === passive.id)) &&
      (owner.passiveAt[passive.id] ?? 0) <= battle.time && !owner.move && !owner.force && battle.time - history(battle, owner).standAt >= 1.5 &&
      (passive.id !== "warlock/R/P6" || mageStillReady(battle, owner))) mark(passive.id, owner.id, "stance")
    if (passive.id === "binder/C/P7" && binderTraitReady(battle, owner, passive.id) &&
      !owner.move && !owner.force && battle.time - history(battle, owner).standAt >= 1.5) mark(passive.id, owner.id, "stance")
    if (passive.id === "healer/UC/P7" && owner.hp && healerStillReady(battle, owner) &&
      (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === passive.id)))
      mark(passive.id, owner.id, "stance")
    if (passive.rule.event !== "always") continue
    const outsideTarget = passive.id === "ranger/R/P7" || passive.id === "assassin/L/P8" ? nodes(battle).find((unit) => unit.hp &&
      !friendly(battle, owner.id, unit.id) && isOutside(unit) && edgeDistance(owner, unit) <= owner.range + 40) : undefined
    const closeTarget = passive.id === "warlock/E/P5" ? nodes(battle).find(unit => unit.hp && !friendly(battle, unit.id, owner.id) && edgeDistance(unit, owner) <= 120)
      : passive.id === "binder/UC/P6" ? nodes(battle).find(unit => unit.hp && !friendly(battle, owner.id, unit.id) && binderSlowing(battle, owner, unit))
        : passive.id === "healer/R/P6" ? alliesOf(battle, owner.id).find(unit => unit !== owner && unit.hp)
          : passive.id === "bard/R/P6" ? bardNearby(battle, owner, 120)[0] : undefined
    if (passive.id === "warlock/E/P5" && !closeTarget) continue
    if (passiveStance(battle, owner, passive, closeTarget ?? outsideTarget)) {
      const body = job === "summoner" && passive.id !== "summoner/UC/P7" ? nearestSummon(battle, owner) : undefined
      const partners = job === "bulwark" ? bulwarkPartners(battle, owner, passive.id)
        : job === "warden" ? wardenPartners(battle, owner, passive.id) : job === "berserker" ? berserkerPartners(battle, owner, passive.id)
          : job === "paladin" ? paladinPartners(battle, owner, passive.id) : job === "spellbreaker" ? spellTraitPartners(battle, owner, passive.id)
            : job === "assassin" ? assassinPartners(battle, owner, passive.id) : job === "warlock" ? warlockPartners(battle, owner, passive.id)
              : job === "lifebringer" ? lifePartners(battle, owner, passive.id) : job === "binder" ? binderPartners(battle, owner, passive.id)
                : job === "dancer" ? dancerPartners(battle, owner, passive.id) : job === "healer" ? healerTraitPartners(battle, owner, passive.id)
                  : job === "bard" ? bardTraitPartners(battle, owner, passive.id) : []
      if (passive.id === "bulwark/UC/P5") {
        const partner = bulwarkPartners(battle, owner, passive.id)[0]
        if (partner) mark(passive.id, partner.id, "stance", undefined, owner)
      } else {
        const reclaimed = passive.id === "spellbreaker/L/P7" ? battle.runtime.fields.find((field) => field.until > battle.time &&
          !friendly(battle, field.cast.owner, owner.id) && areaHits(field.area, owner))?.area.center : undefined
        const field = passive.id === "warlock/L/P6" ? mageFieldNear(battle, owner, 115)
          : passive.id === "bard/E/P6" ? bardStage(battle, owner) : undefined
        const until = field ? field.until : passive.id === "warlock/UC/P8" ? mageSlowUntil(battle, owner) : passive.id === "spellbreaker/Radiant/P6" && partners.length
          ? Math.max(...spellTraitPartners(battle, owner, passive.id).map((partner) => history(battle, partner).interruptAt + 3))
          : passive.id === "assassin/E/P4" ? Math.max(...activeBuffs(battle, owner.id, "phase").map((buff) => buff.until)) : undefined
        mark(passive.id, owner.id, "stance", until, reclaimed ?? body ?? field?.area.center ?? partners[0], partners.length ? partners : undefined)
      }
    }
  }
  return [...ready.values()]
}

export const rangerPassiveReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "ranger", skill)
export const summonTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "summoner", skill)
export const bulwarkTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "bulwark", skill)
export const wardenTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "warden", skill)
export const berserkerTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "berserker", skill)
export const paladinTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "paladin", skill)
export const spellbreakerTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "spellbreaker", skill)
export const assassinTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "assassin", skill)
export const warlockTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "warlock", skill)
export const lifebringerTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "lifebringer", skill)
export const binderTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "binder", skill)
export const dancerTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "dancer", skill)
export const bardTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "bard", skill)
export const healerTraitReadiness = (battle: EdgeBattle, skill?: string) => traitReadiness(battle, "healer", skill).map(mark => {
  const unit = mark.unit
  const movingFaster = !!unit.move && !unit.force && !isOutside(unit) && activeBuffs(battle, unit.id, "speed").some(buff =>
    buff.cast.signature?.id === mark.id && buff.values[0] === modifier(battle, unit, "speed"))
  return { ...mark, movingFaster }
})

function healerTraitPartners(battle: EdgeBattle, owner: EdgeUnit, id: string, event?: SkillEvent) {
  if (event?.healedGroup) return event.healedGroup.filter(row => row.id !== event.target).map(row => row.at)
  if (event?.kind === "redirect" || event?.style === "share" && id === "healer/Prismatic/G2") {
    const recipient = unitOf(battle, event.target)
    return recipient ? [point(owner), point(recipient)] : []
  }
  if (event?.kind === "move" && (id === "healer/UC/P6" || id === "healer/E/P7")) {
    const friend = healerMoveTarget(battle, owner, event, id === "healer/UC/P6" ? 90 : 115, id === "healer/E/P7")
    return friend ? [point(friend)] : []
  }
  const range = id === "healer/E/P6" ? 115 : id === "healer/Radiant/P7" ? 145 : id === "healer/Prismatic/P7" ? 170 : 0
  const threshold = id === "healer/Prismatic/P7" ? 35 : id === "healer/Radiant/P7" ? 45 : 101
  const near = range && alliesOf(battle, owner.id).filter(unit => unit !== owner && unit.hp > 0 && hpPct(unit) < threshold && edgeDistance(unit, owner) <= range)
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner))[0]
  return near ? [point(near)] : []
}

function dancerPartners(battle: EdgeBattle, owner: EdgeUnit, id: string, event?: SkillEvent): EdgePoint[] {
  if (event?.danceGroup) return event.danceGroup.filter(row => row.id !== event.target).map(row => row.landing)
  if (id === "dancer/Radiant/P6" || id === "dancer/Prismatic/P6") {
    const rail = dancerTraitRail(battle, owner, id === "dancer/Prismatic/P6")
    return rail?.danceRail ? [rail.danceRail.path.points[0], rail.danceRail.path.points.at(-1)!] : []
  }
  const distance = id === "dancer/C/P6" ? 100 : id === "dancer/L/P6" ? 135
    : id === "dancer/UC/P6" || id === "dancer/R/P7" ? 105 : 0
  return distance ? alliesOf(battle, owner.id).filter(unit => unit !== owner && unit.hp && edgeDistance(owner, unit) <= distance)
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 1).map(point) : []
}

function binderPartners(battle: EdgeBattle, owner: EdgeUnit, id: string, cast?: SkillCast): EdgePoint[] {
  if (id === "binder/Prismatic/P2") return [...(cast?.binderWells ?? [])]
  if (id === "binder/R/P2") return [...(cast?.trace.values() ?? [])].flatMap(row => row.pulledTo ? [row.pulledTo] : []).slice(0, 2)
  if (id === "binder/Radiant/P7") return alliesOf(battle, owner.id).filter(unit => unit.hp && unit !== owner && edgeDistance(unit, owner) <= 155)
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 2)
  if (id === "binder/UC/P6" || id === "binder/E/P6") return nodes(battle).filter(unit => unit.hp && !friendly(battle, unit.id, owner.id) &&
    (id === "binder/UC/P6" ? binderSlowing(battle, owner, unit) : edgeDistance(unit, owner) <= 130 && binderControlled(battle, owner, unit)))
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 1)
  return []
}

function assassinPartners(battle: EdgeBattle, owner: EdgeUnit, id: string): EdgeUnit[] {
  if (id === "assassin/C/P8") return alliesOf(battle, owner.id).filter((unit) => unit.hp && unit !== owner && edgeDistance(unit, owner) <= 105)
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 2)
  if (id === "assassin/L/P5") return nodes(battle).filter((unit) => unit.hp && !friendly(battle, unit.id, owner.id) && edgeDistance(unit, owner) <= 120).slice(0, 1)
  if (id === "assassin/E/P7") return nodes(battle).filter((unit) => unit.hp && !friendly(battle, unit.id, owner.id) &&
    edgeDistance(unit, history(battle, owner).from) <= 120 && edgeDistance(unit, owner) - edgeDistance(unit, history(battle, owner).from) >= 100).slice(0, 1)
  return []
}

function spellTraitPartners(battle: EdgeBattle, owner: EdgeUnit, id: string): EdgeUnit[] {
  if (id !== "spellbreaker/E/P6" && id !== "spellbreaker/Radiant/P6") return []
  return nodes(battle).filter((unit) => unit.hp && !friendly(battle, owner.id, unit.id) &&
    edgeDistance(owner, unit) <= (id === "spellbreaker/E/P6" ? 135 : 140) &&
    (id === "spellbreaker/E/P6" ? !!chargeOf(battle, unit)
      : history(battle, unit).interruptBy === owner.id && recent(battle, history(battle, unit).interruptAt, 3)))
    .sort((a, b) => edgeDistance(owner, a) - edgeDistance(owner, b)).slice(0, 2)
}

function showRangerPassive(
  battle: EdgeBattle, owner: EdgeFighter, id: string, mark: SkillVisual["mark"], mode: NonNullable<SkillVisual["passive"]>["mode"],
  from: EdgePoint, to: EdgePoint, receiver: EdgePoint, event?: SkillEvent,
) {
  const beat = { mode, owner: point(owner), receiver: point(receiver), landing: event?.landing && point(event.landing) }
  if (event?.kind === "shove") (event.passiveBeats ??= []).push(beat)
  const contacts = id === "ranger/Radiant/P8" ? nodes(battle)
    .filter((unit) => unit.hp && !friendly(battle, owner.id, unit.id) && edgeDistance(unit, owner) <= 160)
    .sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 2).map(point) : undefined
  showSkillVisual(battle, owner, id, {
    phase: mode === "proc" ? "passive" : "impact", mark,
    from, to, area: event?.area, contacts, start: battle.time, end: battle.time + (mode === "proc" ? .58 : .49), passive: beat,
  })
  return beat
}

function summonTraitOrigin(battle: EdgeBattle, cast: SkillCast, event?: SkillEvent) {
  const body = unitOf(battle, event?.summon)
  const bodies = cast.summon?.deployment.bodies
  return (event?.summon && event.from) || body || cast.signature?.origin || bodies?.find(({ hp }) => hp > 0)
    || bodies?.at(-1) || event?.at || cast.from
}

function showSummonTrait(
  battle: EdgeBattle, owner: EdgeFighter, cast: SkillCast, mode: NonNullable<SkillVisual["passive"]>["mode"],
  contact: EdgePoint, receiver: EdgePoint, event?: SkillEvent,
  options: { from?: EdgePoint; area?: EdgeArea; contacts?: readonly EdgePoint[]; target?: EdgeUnitId } = {},
) {
  if (!cast.signature) return
  const { id, mark } = cast.signature
  const anchor = (mode === "consume" || mode === "stance") && cast.signature.origin || summonTraitOrigin(battle, cast, event)
  const gold = id.split("/").at(-1)?.startsWith("G")
  const beat: NonNullable<SkillVisual["passive"]> = {
    mode, owner: point(owner), receiver: point(receiver), anchor: point(anchor), landing: event?.landing && point(event.landing),
    trigger: event?.at && point(event.at),
    partners: cast.summon?.deployment.bodies.filter((body) => body.hp).map(point),
  }
  if (event?.kind === "shove") (event.passiveBeats ??= []).push(beat)
  showSkillVisual(battle, owner, id, {
    phase: mode === "travel" ? "travel" : mode === "proc" ? "passive" : "impact", mark, gold,
    from: options.from ?? anchor, to: contact, target: options.target, area: options.area, contacts: options.contacts,
    start: battle.time, end: battle.time + (mode === "travel" ? .20 : gold ? .81 : mode === "consume" ? .51 : .63),
    passive: beat,
  })
  return beat
}

type ArmorContact = {
  from?: EdgePoint; to?: EdgePoint; area?: EdgeArea; contacts?: readonly EdgePoint[]
  landings?: readonly (EdgePoint | undefined)[]
  duration?: number
  target?: EdgeUnitId
}

function defenderWatchImpact(cast: SkillCast, event?: SkillEvent) {
  const id = cast.signature?.id
  if (binderTraitArt(id)) return event?.kind === "strike"
  return id === "bulwark/R/P2" && event?.kind === "strike" ||
    id === "bulwark/L/G1" && (event?.kind === "shove" || event?.kind === "hit") ||
    (id === "warden/E/P5" || id === "warden/Prismatic/P2") && event?.kind === "strike" ||
    id === "warden/Radiant/P6" && event?.kind === "hit" ||
    (id === "berserker/UC/P4" || id === "berserker/L/P3") && event?.kind === "strike" ||
    id === "berserker/R/G2" && event?.kind === "hit" ||
    id === "paladin/C/P4" && event?.kind === "strike" ||
    id === "paladin/R/P6" && event?.kind === "shove" ||
    id === "paladin/R/P8" && event?.kind === "mend" ||
    id === "warlock/R/P6" && event?.kind === "receive" ||
    !!id && ["spellbreaker/C/G1", "spellbreaker/R/G1", "spellbreaker/E/G2", "spellbreaker/L/P4", "spellbreaker/Radiant/P4", "spellbreaker/Prismatic/P4",
      "assassin/UC/P4", "assassin/UC/P7", "assassin/R/G1", "assassin/L/P3", "assassin/Radiant/P7"].includes(id) && event?.kind === "strike"
}

function armorOrigin(owner: EdgeUnit, event?: SkillEvent) {
  if (!event) return owner
  if (event.intercept) return event.intercept
  if (event.kind === "move" || event.kind === "return" || event.kind === "receive") return event.from ?? event.cast.from
  if (event.kind === "ward") return event.area?.center ?? event.cast.from
  return event.at ?? owner
}

function berserkerTraitOrigin(battle: EdgeBattle, owner: EdgeUnit, id: string, event: SkillEvent) {
  if (id === "berserker/UC/P8") {
    const target = unitOf(battle, event.target)
    return target && unitOf(battle, history(battle, target).pushBy) || event.cast.from
  }
  if (["receive", "hurt", "heal", "shield", "pushland", "pullland", "dash"].includes(event.kind)) {
    return event.from ?? event.cast.from
  }
  return armorOrigin(owner, event)
}

function paladinTraitOrigin(owner: EdgeUnit, event: SkillEvent) {
  if (event.intercept) return event.intercept
  if (event.kind === "proc" || event.kind === "assist" || event.kind === "protect") return event.from ?? event.at ?? owner
  if (event.kind === "dash" && event.style === "swap") return event.cast.paladinRoute?.from ?? owner
  if (["move", "dash", "receive", "hurt", "strike", "shove"].includes(event.kind)) return event.from ?? event.cast.from
  if (event.kind === "heal" || event.kind === "ward" || event.kind === "shield") return event.area?.center ?? event.cast.from
  return event.at ?? owner
}

function spellTraitOrigin(owner: EdgeUnit, event: SkillEvent) {
  if (event.intercept) return event.intercept
  if (event.style === "reflect" && event.landing) return event.landing
  if (event.style === "skillshort" && event.landing) return event.landing
  if (event.kind === "after" && event.cast.spellRoute) return event.cast.spellRoute.from
  if (["move", "forcedland", "receive", "strike", "shove"].includes(event.kind)) return event.from ?? event.cast.from
  return event.at ?? owner
}

function assassinTraitOrigin(owner: EdgeUnit, event: SkillEvent) {
  if (event.kind === "assist") return event.from ?? event.at ?? owner
  if (["dash", "move", "return", "receive", "shove", "strike"].includes(event.kind)) return event.from ?? event.cast.from
  if (event.kind === "ward" || event.kind === "shield") return event.cast.assassinContact ?? event.cast.from
  return event.at ?? owner
}

function lifeTraitOrigin(battle: EdgeBattle, owner: EdgeUnit, id: string, event: SkillEvent) {
  if (id === "lifebringer/C/P5" || id === "lifebringer/R/P5")
    return event.cast.trace.get(event.cast.lifeFirstHeal ?? owner.id)?.at ?? owner
  if (event.kind === "return" || event.kind === "move" || event.kind === "shove") return event.from ?? event.cast.from
  if (event.kind === "mend" || event.kind === "ward") return event.from ?? owner
  if (id === "lifebringer/L/P1") return event.from ?? event.at ?? owner
  if (event.intercept) return event.intercept
  if (id === "lifebringer/Prismatic/P3") return event.area?.center ?? event.at ?? owner
  if (id === "lifebringer/Radiant/P2" || id === "lifebringer/R/P4" || id === "lifebringer/Prismatic/P5")
    return event.area?.center ?? event.from ?? event.at ?? owner
  if (event.kind === "heal" && event.source !== owner.id) return unitOf(battle, event.source) ?? event.from ?? owner
  return event.at ?? owner
}

function bardTraitPartners(battle: EdgeBattle, owner: EdgeUnit, id: string, event?: SkillEvent) {
  if (event?.bardPartners) return event.bardPartners
  switch (id) {
    case "bard/C/P6": return bardNearby(battle, owner, 110).slice(0, 1)
    case "bard/UC/P8": return bardNearby(battle, owner, 110, "protected").slice(0, 1)
    case "bard/R/P6": case "bard/E/P7": return bardNearby(battle, owner, 120).slice(0, 1)
    case "bard/L/P6": return bardNearby(battle, owner, 140).slice(0, 2)
    case "bard/L/P7": {
      const attacks = event?.target === undefined ? undefined : battle.runtime.histories.get(event.target)?.handAttackers
      return alliesOf(battle, owner.id).flatMap(ally => ally === owner ? [] : attacks?.get(ally.id) ?? []).slice(0, 2)
    }
    case "bard/Radiant/P6": return bardNearby(battle, owner, 140, "protected").slice(0, 1)
    case "bard/Prismatic/P6": return bardNearby(battle, owner, 145, "empowered").slice(0, 1)
  }
  const shooter = unitOf(battle, event?.attacker)
  return shooter && shooter !== owner && friendly(battle, owner.id, shooter.id) ? [shooter] : []
}

function bardTraitOrigin(owner: EdgeUnit, event: SkillEvent) {
  if (event.kind === "death") return event.at ?? owner
  if (event.kind === "strike") return event.cast.bardRange?.at ?? event.cast.from
  return event.intercept ?? event.from ?? event.landing ?? event.at ?? owner
}

function showDefenderTrait(
  battle: EdgeBattle, cast: SkillCast, mode: NonNullable<SkillVisual["passive"]>["mode"], receiver: EdgePoint,
  event?: SkillEvent, { from, to = receiver, area, contacts, landings, duration, target }: ArmorContact = {},
) {
  const signature = cast.signature
  const owner = unitOf(battle, cast.owner)
  if (!signature || !owner || !isFighter(owner)) return
  const id = signature.id
  const gold = id.includes("/G")
  const warden = wardenTraitArt(id)
  const rage = berserkerTraitArt(id)
  const holy = paladinTraitArt(id)
  const breaker = spellbreakerTraitArt(id)
  const shadow = assassinTraitArt(id)
  const mage = warlockTraitArt(id)
  const life = lifebringerTraitArt(id)
  const binding = binderTraitArt(id)
  const dance = dancerTraitArt(id)
  const medic = healerTraitArt(id)
  const bard = bardTraitArt(id)
  const lastHand = id === "assassin/L/P6" ? unitOf(battle, event?.cast.previousHandTarget) : undefined
  const partners = lastHand ? [lastHand] : rage ? berserkerPartners(battle, owner, id)
    : warden ? wardenPartners(battle, owner, id) : holy ? paladinPartners(battle, owner, id)
      : breaker ? spellTraitPartners(battle, owner, id) : shadow ? assassinPartners(battle, owner, id) : mage ? warlockPartners(battle, owner, id)
        : binding ? binderPartners(battle, owner, id, cast)
          : dance ? dancerPartners(battle, owner, id, event)
          : medic ? healerTraitPartners(battle, owner, id, event)
          : bard ? bardTraitPartners(battle, owner, id, event)
          : life ? event?.healedGroup?.filter(row => row.id !== event.target).map(row => row.at) ?? lifePartners(battle, owner, id)
          : bulwarkPartners(battle, owner, id)
  const draws = id === "berserker/R/G2" && event?.kind === "pullland"
    ? [...cast.trace.values()].flatMap(({ pulledTo }) => pulledTo ? [pulledTo] : []) : undefined
  const beat: NonNullable<SkillVisual["passive"]> = {
    mode, owner: point(owner), receiver: point(receiver), anchor: point(signature.origin ?? owner),
    trigger: event?.at && point(event.at), landing: event?.landing && point(event.landing), landings,
    partners: id === "assassin/R/G2" ? [point(cast.assassinContact ?? cast.aim)] : partners.map(point),
    amount: medic || bard ? event?.amount : undefined, statuses: medic ? event?.cleansed : undefined,
  }
  const holySpan = owner.card.rarity === "Prismatic" ? 1.52 : owner.card.rarity === "Radiant" ? 1.32 : owner.card.rarity === "L" ? 1.16 : .94
  if (event?.kind === "shove" || event?.kind === "protect" && event.push !== undefined ||
    ["assassin/C/G1", "assassin/R/G1", "binder/C/G1"].includes(id) && event?.kind === "strike") {
    const pushed = event.passiveBeats ??= []
    pushed.push(beat)
  }
  if (mode === "proc" && !cast.used.has(id + "/notice")) {
    cast.used.add(id + "/notice")
    const effect = (gold ? owner.pool.gold : owner.passives).find((entry) => entry.id === id)
    if (effect) flash(battle, owner.id, effect.name, gold)
  }
  showSkillVisual(battle, owner, id, {
    phase: mode === "travel" ? "travel" : mode === "proc" ? "passive" : "impact", mark: signature.mark, gold, cast: cast.id,
    from: from ?? signature.origin ?? owner, to, target, area, contacts: contacts ?? draws, passive: beat, start: battle.time,
    end: battle.time + (duration ?? (gold ? holy || breaker || shadow || mage || life || binding || dance || medic || bard ? holySpan : rage ? 1.06 : .92
      : mode === "consume" ? .56 : life || binding || dance || medic || bard ? .82 : .68)),
  })
  return beat
}

function showDefenderStance(battle: EdgeBattle, owner: EdgeUnit, id: string, recipient: EdgePoint, event: SkillEvent) {
  if (!isFighter(owner)) return
  const passive = owner.passives.find((entry) => entry.id === id)
  if (!passive) return
  const cast = { ...event.cast, owner: owner.id, signature: {
    id, mark: { motion: passiveMotion(passive), glyph: passive.glyph }, origin: point(owner),
  } }
  const field = id === "bard/E/P6" ? bardStage(battle, owner)?.area : undefined
  return showDefenderTrait(battle, cast, "stance", recipient, event, { from: event.from ?? event.cast.from, area: field })
}

function consumeTrait(battle: EdgeBattle, cast: SkillCast, holder: EdgeUnit, at?: EdgePoint, from?: EdgePoint, event?: SkillEvent) {
  if (warlockArt(cast)?.motif === "roadbreak") showWarlockBeat(battle, cast, "release", at ?? holder, {
    from: from ?? holder, kind: "move", other: at,
  })
  const signature = cast.signature
  if (!signature && assassinArt(cast)?.motif === "conceal" && event?.kind === "strike") showAssassinBeat(battle, cast, "release", at ?? holder, {
    from: from ?? holder, target: event?.target, kind: "stored", other: holder,
  })
  if (!signature) return
  const owner = unitOf(battle, cast.owner)
  if (!owner || !isFighter(owner)) return
  if (summonTraitArt(signature.id)) showSummonTrait(battle, owner, cast, "consume", at ?? holder, holder, event, { from: from ?? holder })
  else if (resolvedTraitArt(signature.id)) showDefenderTrait(battle, cast, "consume", holder, event, { from: from ?? holder, to: at ?? holder })
  else if (rangerPassiveArt(signature.id)) showRangerPassive(battle, owner, signature.id, signature.mark,
    "consume", from ?? holder, at ?? holder, holder, event)
}

function showTraitStance(battle: EdgeBattle, owner: EdgeFighter, passive: EdgePassive, event: SkillEvent) {
  if (dancerTraitArt(passive.id)) {
    const speed = passive.steps[0]?.operations.find(op => op.kind === "speed")
    if (speed && event.kind === "startMove" && event.target === owner.id && event.style !== "return" &&
      passiveStance(battle, owner, passive) && modifier(battle, owner, "speed") === speed.args[0])
      showDefenderStance(battle, owner, passive.id, owner, event)
    return
  }
  if (binderTraitArt(passive.id)) {
    if (passive.id !== "binder/UC/P6" || event.kind !== "strike" || event.source !== owner.id || event.cast.order !== "basic") return
    const target = unitOf(battle, event.target)
    if (target?.hp && edgeDistance(owner, target) > owner.range && passiveStance(battle, owner, passive, target))
      showDefenderStance(battle, owner, passive.id, target, event)
    return
  }
  if (lifebringerTraitArt(passive.id)) {
    if (passive.id === "lifebringer/UC/P6" && event.kind === "startMove" && event.target === owner.id &&
      passiveStance(battle, owner, passive) && modifier(battle, owner, "speed") === 13) showDefenderStance(battle, owner, passive.id, owner, event)
    return
  }
  if (warlockTraitArt(passive.id)) {
    if (passive.steps[0]?.operations[0]?.kind === "ampq" && event.kind === "strike" && event.source === owner.id &&
      event.cast.order === "basic" && passiveStance(battle, owner, passive, unitOf(battle, event.target)))
      showDefenderStance(battle, owner, passive.id, unitOf(battle, event.target) ?? owner, event)
    return
  }
  if (assassinTraitArt(passive.id)) {
    const kind = passive.steps[0]?.operations[0]?.kind
    const moving = kind === "speed" && event.kind === "startMove" && event.target === owner.id
    const ranged = kind === "range" && event.kind === "strike" && event.cast.order === "basic" && event.source === owner.id
    const target = ranged ? unitOf(battle, event.target) : undefined
    if ((moving || ranged) && passiveStance(battle, owner, passive, target)) showDefenderStance(battle, owner, passive.id, target ?? owner, event)
    return
  }
  if (spellbreakerTraitArt(passive.id)) {
    if (passive.rule.event === "always" && passive.steps[0]?.operations[0]?.kind === "speed" && event.kind === "startMove" &&
      event.target === owner.id && passiveStance(battle, owner, passive)) showDefenderStance(battle, owner, passive.id, owner, event)
    return
  }
  const summon = summonTraitArt(passive.id)
  if (!summon && !rangerPassiveArt(passive.id)) return
  const op = passive.steps[0]?.operations[0]
  const kind = op?.kind
  const attack = (kind === "qr" || kind === "ampq") && event.kind === "strike" && event.cast.order === "basic" && event.source === owner.id
  const moving = kind === "speed" && event.kind === "startMove" && event.target === owner.id
  const brace = kind === "anti" && event.kind === "shove" && event.target === owner.id &&
    (!summon || modifier(battle, owner, "anti") === op?.args[0])
  const protect = summon && kind === "res" && event.kind === "receive" && event.target === owner.id &&
    modifier(battle, owner, "res", unitOf(battle, event.source)) === op?.args[0]
  if ((!attack && !moving && !brace && !protect) || !passiveStance(battle, owner, passive, attack ? unitOf(battle, event.target) : undefined)) return
  if (summon) {
    const origin = nearestSummon(battle, owner) ?? owner
    const cast = { ...event.cast, signature: { id: passive.id, mark: { motion: passiveMotion(passive), glyph: passive.glyph }, origin: point(origin) } }
    showSummonTrait(battle, owner, cast, "stance", event.at ?? owner, owner, event, { from: origin })
    return
  }
  showRangerPassive(battle, owner, passive.id, { motion: passiveMotion(passive), glyph: passive.glyph },
    "stance", event.from ?? event.cast.from, event.at ?? owner, owner, event)
}

function applyPassive(battle: EdgeBattle, cast: SkillCast, owner: EdgeFighter, passive: EdgePassive, event: SkillEvent) {
  const rage = berserkerTraitArt(passive.id)
  const holy = paladinTraitArt(passive.id)
  const breaker = spellbreakerTraitArt(passive.id)
  const shadow = assassinTraitArt(passive.id)
  const mage = warlockTraitArt(passive.id)
  const life = lifebringerTraitArt(passive.id)
  const binding = binderTraitArt(passive.id)
  const dance = dancerTraitArt(passive.id)
  const medic = healerTraitArt(passive.id)
  const bard = bardTraitArt(passive.id)
  if (resolvedTraitArt(passive.id)) {
    if (passive.id === "bulwark/C/P1" && owner.gold?.id === "bulwark/C/G1" &&
      event.brokenShield?.owner === owner.id && event.brokenShield.skill?.id === "bulwark/C/A1") return
    if (passive.id === "berserker/L/P4" && owner.gold?.id === "berserker/L/G2" && cast.skill?.id === "berserker/L/A4") return
    const source = { ...cast, signature: {
      id: passive.id, mark: { motion: passiveMotion(passive), glyph: passive.glyph },
      origin: point(rage ? berserkerTraitOrigin(battle, owner, passive.id, event) : holy ? paladinTraitOrigin(owner, event)
        : breaker ? spellTraitOrigin(owner, event) : shadow || mage ? assassinTraitOrigin(owner, event)
          : life ? lifeTraitOrigin(battle, owner, passive.id, event)
            : medic ? event.intercept ?? (["death", "save", "redirect", "heals"].includes(event.kind) ? event.at : event.from) ??
              unitOf(battle, event.attacker) ?? event.at ?? owner
              : bard ? bardTraitOrigin(owner, event)
                : binding || dance ? event.intercept ?? event.from ?? event.at ?? owner : armorOrigin(owner, event)),
    } }
    if (binding) {
      const target = unitOf(battle, event.target)
      if (passive.id === "binder/L/P5") source.target = cast.firstWard
      if (passive.id === "binder/Prismatic/P4") source.target = cast.binderBrace
      if (passive.id === "binder/Prismatic/P5") {
        const head = binderPressureEnds(cast)
        source.target = head?.id
        if (head) source.signature.origin = point(head.at)
      }
      if (passive.id === "binder/C/P7" && target) {
        const slow = activeBuffs(battle, target.id, "slow").find(buff => buff.cast === event.cast)
        if (slow) {
          slow.until += passive.steps[0].operations[0].args[0]
          cast.used.add("applied/" + passive.id)
          showDefenderTrait(battle, source, "proc", target, event, { target: target.id, area: event.area })
        }
        return
      }
      if ((passive.id === "binder/UC/P2" || passive.id === "binder/R/P4") && target && event.landing) {
        cast.used.add("applied/" + passive.id)
        showDefenderTrait(battle, source, "proc", target, event, {
          from: event.at ?? target, to: event.landing, landings: [point(event.landing)], target: target.id,
        })
        return
      }
    }
    if (dance) {
      if (passive.id === "dancer/Prismatic/P5") source.target = cast.firstWard
      if (passive.id === "dancer/R/P4" && event.at && event.landing) {
        cast.used.add("applied/" + passive.id)
        showDefenderTrait(battle, source, "proc", event.at, event, { from: event.at, to: event.landing, landings: [event.landing] })
        return
      }
      if (passive.id === "dancer/Radiant/P1") {
        const group = event.danceGroup?.flatMap(row => unitOf(battle, row.id) ?? []) ?? []
        applyStep(battle, source, passive.steps[0], event, true, undefined, group.filter(unit => unit.hp))
        return
      }
      if (passive.id === "dancer/L/P2") {
        applyStep(battle, source, passive.steps[0], event, true, event.area)
        return
      }
    }
    if (passive.id === "healer/UC/P8") {
      const clinician = unitOf(battle, event.source)
      if (clinician?.hp && isFighter(clinician)) {
        source.signature.origin = point(owner)
        applyStep(battle, source, passive.steps[0], event, true, undefined, [clinician])
      }
      return
    }
    if (passive.id === "lifebringer/R/P7" || passive.id === "healer/C/P7") {
      const target = unitOf(battle, event.target)
      const cap = passive.id === "healer/C/P7" ? passive.steps[0].operations[0].args[0] / 100 : .05
      const spent = target && Math.round(Math.min(event.overheal ?? 0, target.maxHp * cap))
      if (target && spent && shield(battle, source, target, spent, 10, event, true)) {
        event.overheal = Math.max(0, (event.overheal ?? 0) - spent)
        cast.used.add("applied/" + passive.id)
        showDefenderTrait(battle, source, "proc", target, medic ? { ...event, amount: spent } : event)
      }
      return
    }
    if (passive.id === "warlock/C/P6") {
      event.cast.warlockSteady = { cast: source, value: 9 }
      showDefenderTrait(battle, source, "proc", owner, event)
      return
    }
    if (passive.id === "warlock/R/P6") history(battle, owner).warlockStillSpent = history(battle, owner).standAt
    if (passive.id === "warlock/E/P2") event.cast.warlockRim = event.target
    if (passive.id === "assassin/Radiant/P7") battle.runtime.watches = battle.runtime.watches.filter((watch) =>
      watch.cast.owner !== owner.id || watch.cast.signature?.id !== passive.id)
    if (passive.id === "spellbreaker/Prismatic/P7") history(battle, owner).lastInterruptTarget = undefined
    if (passive.id === "spellbreaker/Prismatic/P6") {
      for (const area of event.clearedAreas ?? []) {
        battle.runtime.fields.push({ id: ++battle.nextFx, cast: source, area, step: passive.steps[0], mode: "hold",
          seen: new Set(), previous: new Set(), time: battle.time, until: battle.time + 4, next: battle.time,
          capacity: 0, derived: true, event })
        showDefenderTrait(battle, source, "proc", owner, event, { from: area.center, to: area.center, area })
      }
      return
    }
    if (passive.id === "warden/L/P3") source.target = cast.firstWard
    if (passive.id === "paladin/L/P2" || passive.id === "paladin/Prismatic/P2") source.target = cast.firstWard
    if (passive.id === "paladin/L/P4") source.target = [...cast.trace].find(([, record]) => (record.effectiveHits ?? 0) > 0)?.[0]
    runSteps(battle, source, passive.steps, event, true)
    return
  }
  flash(battle, owner.id, passive.name, false)
  const selector = passive.steps[0].watch?.holder ?? passive.steps[0].selector
  const area = selectionArea(battle, cast, selector, event)
  const summon = summonTraitArt(passive.id)
  const target = (!summon ? area?.center : undefined) ?? select(battle, cast, selector, event, area)[0] ?? event.at ?? owner
  const mark = { motion: passiveMotion(passive), glyph: passive.glyph }
  const origin = summon ? point(summonTraitOrigin(battle, cast, event)) : undefined
  const source = { ...cast, signature: { id: passive.id, mark, origin } }
  const previous = passive.id === "ranger/R/P6" ? unitOf(battle, battle.runtime.histories.get(owner.id)?.lastBasicTarget) : undefined
  const from = passive.id === "ranger/Prismatic/P4" ? event.cast.aim : previous ?? event.from ?? event.cast.from
  const beat = summon ? showSummonTrait(battle, owner, source, "proc", event.at ?? target, target, event, { area: event.area })
    : rangerPassiveArt(passive.id)
    ? showRangerPassive(battle, owner, passive.id, mark, "proc", from, event.at ?? target, target, event)
    : undefined
  if (!beat) {
    showSkillVisual(battle, owner, passive.id, {
      phase: "passive", mark,
      from: owner, to: target, start: battle.time, end: battle.time + 0.47,
    })
  }
  // 反弧拒近 changes the return push. The proc still opens the paired gold effect.
  if (passive.id === "ranger/R/P3" && owner.gold?.id === "ranger/R/G2" && cast.skill?.id === "ranger/R/A3" &&
    !cast.used.has(owner.gold.id)) return
  runSteps(battle, source, passive.steps, event, true)
  if (beat && event.kind === "hit" && passive.steps.some((step) => step.operations.some((op) => op.kind === "p"))) {
    const force = unitOf(battle, event.target)?.force
    if (force?.cause?.id === cast.id) beat.landing = point(force.end)
  }
}

function applyLifebringerGold(battle: EdgeBattle, owner: EdgeFighter, gold: EdgeGold, cast: SkillCast, event: SkillEvent) {
  const receiver = unitOf(battle, event.target)
  const source: SkillCast = { ...cast, signature: {
    id: gold.id, mark: gold.artwork.end, origin: point(event.at ?? receiver ?? owner),
  } }
  const signature = source.signature!
  const step = gold.steps[0]
  const injured = (at: EdgePoint, reach: number, excluded?: EdgeUnitId) => alliesOf(battle, owner.id).filter(unit =>
    unit.hp > 0 && unit.hp < unit.maxHp && unit.id !== excluded && edgeDistance(unit, at) <= reach)
    .sort((a, b) => edgeDistance(a, at) - edgeDistance(b, at))
  const deliver = (from: EdgePoint, target: EdgeUnit, duration: number) => {
    signature.origin = point(from)
    showDefenderTrait(battle, source, "travel", target, event, { from, target: target.id, duration })
    later(battle, duration, () => {
      if (target.hp) applyStep(battle, source, step, { ...event, target: target.id, at: point(target) }, true, undefined, [target], gold.name)
    })
  }
  switch (gold.id) {
    case "lifebringer/UC/G1": {
      if (!receiver?.hp) return
      const start = point(event.at ?? receiver)
      const plant = (at: EdgePoint) => {
        if (!receiver.hp) return
        source.aim = point(at)
        signature.origin = point(at)
        register(battle, source, { ...step, selector: { ...step.selector, anchor: "p" } },
          { ...event, at: point(at), target: receiver.id }, true, gold.name)
      }
      later(battle, .035, () => {
        const motion = receiver.force
        if (!receiver.hp) return
        if (!motion || motion.cause?.id !== event.healTrigger?.id || motion.kind !== "push") {
          plant(start)
          return
        }
        showDefenderTrait(battle, source, "travel", motion.end, event, {
          from: motion.start, duration: Math.max(.02, motion.since + motion.duration - battle.time),
        })
        later(battle, Math.max(.02, motion.since + motion.duration - battle.time), () => {
          if (motion.completed && !receiver.force && edgeDistance(receiver, motion.end) < 3) plant(motion.end)
        })
      })
      return
    }
    case "lifebringer/UC/G2": {
      const partner = unitOf(battle, event.lifeSecondary)
      if (!partner?.hp) return
      applyStep(battle, source, step, { ...event, target: partner.id, at: point(partner) }, true, undefined, [partner], gold.name)
      return
    }
    case "lifebringer/R/G1": {
      if (!receiver?.hp || !event.from) return
      const from = event.from
      const length = edgeDistance(from, receiver)
      if (length < 3) return
      const area = areaOf("L", from, direction(from, receiver), length, 50)
      const third = alliesOf(battle, owner.id).filter(unit => unit.hp > 0 && unit.hp < unit.maxHp &&
        unit !== receiver && unit.id !== cast.target && areaHits(area, unit))
        .sort((a, b) => edgeDistance(from, a) - edgeDistance(from, b))[0]
      if (!third) return
      signature.origin = point(from)
      applyStep(battle, source, step, { ...event, from, target: third.id, at: point(third) }, true, area, [third], gold.name)
      return
    }
    case "lifebringer/R/G2": {
      const picked = unitOf(battle, cast.target), origin = event.area?.center
      if (picked?.hp && origin && edgeDistance(picked, origin) <= 285) deliver(origin, picked, .25)
      return
    }
    case "lifebringer/E/G1": {
      if (!receiver?.hp || !event.area) return
      const third = injured(receiver, 100, receiver.id).find(unit => !areaHits(event.area!, unit))
      if (third) deliver(receiver, third, .23)
      return
    }
    case "lifebringer/Radiant/G1": {
      const repeat = unitOf(battle, cast.lifePrimary)
      if (!repeat?.hp) return
      const partner = injured(repeat, 115, repeat.id)[0]
      if (partner) deliver(repeat, partner, .22)
      return
    }
    case "lifebringer/Prismatic/G1": {
      if (!receiver?.hp) return
      const partner = injured(receiver, 110, receiver.id)[0]
      if (partner) deliver(receiver, partner, .24)
      return
    }
    default:
      runSteps(battle, source, gold.steps, event, true, gold.name)
  }
}

function applyBinderGold(battle: EdgeBattle, owner: EdgeFighter, gold: EdgeGold, cast: SkillCast, event: SkillEvent) {
  const target = unitOf(battle, event.target)
  const source: SkillCast = { ...cast, signature: {
    id: gold.id, mark: gold.artwork.end, origin: point(event.intercept ?? event.at ?? owner),
  } }
  const signature = source.signature!
  const step = gold.steps[0]
  const motion = event.binderMotion
  const mark = (at: EdgePoint, delay: number, area?: EdgeArea) => showDefenderTrait(battle, source, "travel", at, event, {
    from: signature.origin, to: at, duration: delay, area,
  })
  const apply = (incoming = event, area?: EdgeArea, only?: EdgeUnit[]) =>
    applyStep(battle, source, step, incoming, true, area, only, gold.name)
  const landed = (run: (at: EdgePoint) => void) => {
    if (!target?.hp || !motion) return
    const remaining = Math.max(.01, motion.since + motion.duration - battle.time)
    mark(motion.end, remaining, event.area)
    later(battle, remaining, () => {
      if (target.hp && motion.completed && !target.force && edgeDistance(target, motion.end) < 3) run(point(target))
    })
  }
  const secondArea = (center: EdgePoint, delay: number) => {
    source.aim = point(center)
    signature.origin = point(center)
    const incoming = { ...event, at: center, landing: center }
    const area = selectionArea(battle, source, step.selector, incoming)
    if (!area) return
    mark(center, delay, area)
    visual(battle, source, area, "warning", delay, gold.name, "control").custom = true
    later(battle, delay, () => apply(incoming, area))
  }
  switch (gold.id) {
    case "binder/C/G2": {
      if (!target?.hp) return
      const landing = !target.force && target.move ? point(target.move) : point(target)
      register(battle, source, step, { ...event, landing }, true, gold.name)
      return
    }
    case "binder/UC/G1": {
      if (!target?.hp) return
      const at = point(target)
      signature.origin = point(cast.aim)
      mark(at, .16)
      later(battle, .16, () => {
        if (target.hp && !target.force && edgeDistance(at, target) < 3) apply(event, undefined, [target])
      })
      return
    }
    case "binder/R/G1":
      landed(at => { if (edgeDistance(at, cast.aim) <= 45) secondArea(cast.aim, .45) })
      return
    case "binder/R/G2": case "binder/E/G2":
      if (target && motion) showDefenderTrait(battle, source, "proc", target, event, {
        from: motion.start, to: motion.end, landings: [point(motion.end)], target: target.id,
      })
      return
    case "binder/E/G1": {
      if (!target?.hp || !event.landing) return
      const track = history(battle, target)
      track.binderFold = { cast: source, end: point(event.landing) }
      mark(event.landing, .34)
      return
    }
    case "binder/L/G1": {
      const area = selectionArea(battle, source, step.selector, event)
      const next = area && select(battle, source, step.selector, event, area)[0]
      if (!next?.hp || !area) return
      signature.origin = point(area.center)
      mark(next, .18, area)
      later(battle, .18, () => { if (next.hp && areaHits(area, next)) apply(event, area, [next]) })
      return
    }
    case "binder/L/G2": {
      if (!target?.hp) return
      signature.origin = point(cast.aim)
      mark(target, .55)
      later(battle, .55, () => {
        if (!target.hp) return
        const at = edgeDistance(cast.aim, target) >= 3 ? target : cast.trace.get(target.id)?.at ?? target
        const axis = direction(cast.aim, at)
        applyStep(battle, source, { ...step, operations: [{ ...step.operations[0], style: "eventaxis" }] },
          { ...event, axis, at: point(target) }, true, undefined, [target], gold.name)
      })
      return
    }
    case "binder/Radiant/G1":
      landed(at => secondArea(at, .16))
      return
    case "binder/Radiant/G2": {
      if (!motion) return
      const crossing = fieldCrossing(motion.start, motion.end)
      signature.origin = crossing
      apply({ ...event, from: crossing })
      return
    }
    case "binder/Prismatic/G2":
      landed(at => secondArea(at, .19))
      return
    default:
      runSteps(battle, source, gold.steps, event, true, gold.name)
  }
}

function applyDancerGold(battle: EdgeBattle, owner: EdgeFighter, gold: EdgeGold, cast: SkillCast, event: SkillEvent) {
  const landing = event.landing ?? event.at ?? owner
  const source: SkillCast = { ...cast, signature: {
    id: gold.id, mark: gold.artwork.end, origin: point(event.intercept ?? landing),
  } }
  const signature = source.signature!
  const step = gold.steps[0]
  const centered = (at: EdgePoint) => ({ ...event, at, from: at, landing: at, intercept: at })
  const group = event.danceGroup ?? []
  const wait = (seconds: number, at: EdgePoint, area: EdgeArea | undefined, run: () => void) => {
    showDefenderTrait(battle, source, "travel", at, event, { from: signature.origin, to: at, area, duration: seconds })
    if (area) visual(battle, source, area, "warning", seconds, gold.name, stepOutcome(step)).custom = true
    later(battle, seconds, run)
  }
  const relay = (seconds: number) => {
    const incoming = centered(landing)
    const area = selectionArea(battle, source, step.selector, incoming)
    const target = select(battle, source, step.selector, incoming, area)[0]
    if (!target?.hp) return
    signature.origin = point(landing)
    showDefenderTrait(battle, source, "travel", target, incoming, { from: landing, target: target.id, duration: seconds })
    later(battle, seconds, () => {
      if (target.hp) applyStep(battle, source, step, incoming, true, area, [target], gold.name)
    })
  }
  const pulse = (at: EdgePoint, delay: number) => {
    signature.origin = point(at)
    const incoming = centered(at)
    const area = selectionArea(battle, source, step.selector, incoming)
    wait(delay, at, area, () => {
      for (const beat of gold.steps) applyStep(battle, source, beat, incoming, true, undefined, undefined, gold.name)
    })
  }
  switch (gold.id) {
    case "dancer/C/G1": relay(.18); return
    case "dancer/UC/G2": relay(.20); return
    case "dancer/R/G1": relay(.22); return
    case "dancer/C/G2":
      if (event.from) {
        signature.origin = point(event.from)
        register(battle, source, step, centered(event.from), true, gold.name)
      }
      return
    case "dancer/UC/G1": {
      if (!event.from || !dancerCanShift(owner) || edgeDistance(event.from, landing) < 3) return
      const from = point(owner), axis = direction(event.from, landing)
      const end = dancerClippedEnd(from, along(from, axis, step.operations[0].args[0]))
      const motion = forceTo(battle, owner, end, .23, false, source, dancerPath([from, end]))
      if (!motion) return
      signature.origin = from
      showDefenderTrait(battle, source, "travel", end, event, {
        from, target: owner.id, duration: .23, landings: [end], contacts: [from],
      })
      later(battle, .23, () => {
        if (owner.hp && motion.completed && !owner.force && edgeDistance(owner, end) < 3)
          showDefenderTrait(battle, source, "proc", owner, event, { from, target: owner.id, landings: [end], contacts: [from] })
      })
      return
    }
    case "dancer/R/G2": pulse(event.intercept ?? landing, .21); return
    case "dancer/E/G2": pulse(landing, .16); return
    case "dancer/L/G1": if (event.from) pulse(event.from, .21); return
    case "dancer/Prismatic/G2": if (event.from) pulse(event.from, .24); return
    case "dancer/Prismatic/G1": pulse(landing, .18); return
    case "dancer/E/G1": {
      const radius = step.selector.size[0]
      const area = { center: point(landing), parts: group.map(row => ({ kind: "circle" as const, center: row.landing, radius })) }
      if (area.parts.length !== 2) return
      wait(.16, landing, area, () => {
        const allies = alliesOf(battle, owner.id).filter(unit => unit.hp && !group.some(row => row.id === unit.id) && areaHits(area, unit))
        applyStep(battle, source, step, event, true, area, allies, gold.name)
      })
      return
    }
    case "dancer/L/G2": {
      const allies = group.flatMap(row => unitOf(battle, row.id) ?? []).filter(unit => unit.hp)
      applyStep(battle, source, step, event, true, undefined, allies, gold.name)
      return
    }
    case "dancer/Radiant/G1": {
      const longest = group.flatMap((a, i) => group.slice(i + 1).map(b => ({ a, b, length: edgeDistance(a.landing, b.landing) })))
        .sort((a, b) => b.length - a.length)[0]
      if (!longest || longest.length < 3) return
      // Include both landing centers in the polygon despite boundary rounding.
      source.from = along(longest.a.landing, direction(longest.a.landing, longest.b.landing), -.01)
      source.aim = point(longest.b.landing)
      signature.origin = point(longest.a.landing)
      register(battle, source, { ...step, selector: { ...step.selector, size: [longest.length + .02, step.selector.size[1]] } }, event, true, gold.name)
      return
    }
    case "dancer/Radiant/G2": {
      const target = unitOf(battle, event.target)
      if (!target?.hp || !event.landing) return
      const axis = rotate(direction(cast.aim, event.landing), -90)
      signature.origin = point(event.landing)
      applyStep(battle, source, step, { ...event, axis }, true, undefined, [target], gold.name)
    }
  }
}

function healerGoldRelay(battle: EdgeBattle, cast: SkillCast, step: Step, event: SkillEvent, seconds: number, name: string) {
  const origin = cast.signature?.origin ?? cast.from
  const incoming = { ...event, at: origin, from: origin }
  const area = selectionArea(battle, cast, step.selector, incoming)
  const target = select(battle, cast, step.selector, incoming, area)[0]
  if (!target?.hp) return
  showDefenderTrait(battle, cast, "travel", target, incoming, { target: target.id, duration: seconds })
  later(battle, seconds, () => {
    if (!target.hp) return
    const operation = step.operations[0]
    if (operation.kind === "clean") {
      const count = cleanse(battle, cast, target, operation.args[0], true, operation.style, incoming, true)
      if (count) showDefenderTrait(battle, cast, "proc", target,
        { ...incoming, amount: count, cleansed: [operation.style] }, { target: target.id })
    } else applyStep(battle, cast, step, incoming, true, area, [target], name)
  })
}

function releaseHealerReturn(battle: EdgeBattle, watch: Watch, event: SkillEvent) {
  const owner = unitOf(battle, watch.cast.owner)
  const recipient = unitOf(battle, watch.target)
  if (!owner || !isFighter(owner) || !recipient?.hp || !watch.cast.signature) return
  const gold = owner.pool.gold.find(skill => skill.id === watch.cast.signature?.id)
  if (!gold) return
  watch.uses--
  const origin = point(event.intercept ?? recipient)
  const source = { ...watch.cast, signature: { ...watch.cast.signature, origin } }
  showDefenderTrait(battle, source, "consume", recipient, event, { from: event.from ?? origin, to: origin, target: recipient.id })
  applyStep(battle, source, watch.step, event, true, undefined, [recipient], gold.name)
  healerGoldRelay(battle, source, gold.steps[1], event, .20, gold.name)
}

function applyHealerGold(battle: EdgeBattle, owner: EdgeFighter, gold: EdgeGold, event: SkillEvent, cast: SkillCast) {
  const [first] = gold.steps
  const origin = point(gold.id === "healer/Prismatic/G2" ? owner : event.intercept ?? event.at ?? owner)
  const source = { ...cast, signature: { id: gold.id, mark: gold.artwork.end, origin } }
  switch (gold.id) {
    case "healer/UC/G1": healerGoldRelay(battle, source, first, event, .18, gold.name); return
    case "healer/R/G2": healerGoldRelay(battle, source, first, event, .17, gold.name); return
    case "healer/L/G2": healerGoldRelay(battle, source, first, event, .19, gold.name); return
    case "healer/E/G1": case "healer/Radiant/G1": {
      const area = selectionArea(battle, source, first.selector, event)
      if (!area) return
      const delay = gold.id === "healer/E/G1" ? .18 : .23
      showDefenderTrait(battle, source, "travel", origin, event, { from: origin, area, duration: delay })
      later(battle, delay, () => applyStep(battle, source, first, event, true, area, undefined, gold.name))
      return
    }
    case "healer/Prismatic/G1":
      for (const row of event.healedGroup ?? []) {
        const unit = unitOf(battle, row.id)
        if (!unit?.hp) continue
        const armed = { ...source, signature: { ...source.signature, origin: row.at } }
        register(battle, armed, first, eventFor(cast, "cast", unit), true, gold.name)
      }
      return
    default:
      runSteps(battle, source, gold.steps, event, true, gold.name)
  }
}

function bardSignedCast(cast: SkillCast, gold: EdgeGold, origin: EdgePoint): SkillCast {
  return { ...cast, aim: point(origin), signature: { id: gold.id, mark: gold.artwork.end, origin: point(origin) } }
}

function queueBardGold(
  battle: EdgeBattle, cast: SkillCast, step: Step, event: SkillEvent, name: string, delay: number,
  area?: EdgeArea, recipients?: EdgeUnit[],
) {
  const from = cast.signature?.origin ?? cast.from
  const to = recipients?.[0] ?? area?.center ?? from
  if (recipients && !recipients.length) return
  showDefenderTrait(battle, cast, "travel", to, event, {
    from, area, duration: delay, target: recipients?.length === 1 ? recipients[0].id : undefined,
    contacts: recipients && recipients.length > 1 ? recipients.map(point) : undefined,
  })
  later(battle, delay, () => {
    const units = (recipients ?? select(battle, cast, step.selector, event, area)).filter(unit => unit.hp &&
      (friendly(battle, cast.owner, unit.id) || !activeBuffs(battle, unit.id, "phase").length))
    applyStep(battle, cast, step, event, true, area, units, name)
  })
}

function applyBardGold(battle: EdgeBattle, owner: EdgeFighter, gold: EdgeGold, event: SkillEvent, cast: SkillCast) {
  const [step] = gold.steps
  const actor = unitOf(battle, event.attacker)
  const recipient = unitOf(battle, event.target)
  const actorCentered = ["bard/C/G1", "bard/L/G1", "bard/Prismatic/G1"].includes(gold.id)
  const from = point((actorCentered ? actor : undefined) ?? event.intercept ?? event.at ?? recipient ?? owner)
  const signed = bardSignedCast(cast, gold, from)
  const incoming = { ...event, at: from, from }
  if (step.watch || step.zone) {
    register(battle, signed, step, incoming, true, gold.name)
    return
  }
  const area = selectionArea(battle, signed, step.selector, incoming)
  const targets = select(battle, signed, step.selector, incoming, area)
  switch (gold.id) {
    case "bard/C/G2":
      if (actor?.hp && !friendly(battle, owner.id, actor.id) && edgeDistance(from, actor) <= 225)
        queueBardGold(battle, signed, step, incoming, gold.name, .18, undefined, [actor])
      return
    case "bard/Radiant/G1": {
      const third = targets.filter(unit => unit !== recipient && unit.id !== cast.target)
        .sort((a, b) => edgeDistance(from, a) - edgeDistance(from, b))[0]
      if (third) queueBardGold(battle, signed, step, incoming, gold.name, .23, area, [third])
      return
    }
    case "bard/E/G1":
    case "bard/Prismatic/G1":
      if (targets.length) queueBardGold(battle, signed, step, incoming, gold.name, gold.id === "bard/E/G1" ? .17 : .24, area)
      return
    default:
      queueBardGold(battle, signed, step, incoming, gold.name, gold.id === "bard/UC/G1" ? .14 : .18, area, targets)
  }
}

function releaseBardTraitWatch(battle: EdgeBattle, watch: Watch, event: SkillEvent) {
  const { cast, step } = watch
  const target = unitOf(battle, event.target)
  if (!target || friendly(battle, cast.owner, target.id)) return
  if (cast.signature?.id === "bard/L/P4") {
    event.bonus = (event.bonus ?? 0) + cast.basis * step.operations[0].args[0]
    const confirmations = event.strikeConfirmed ??= []
    confirmations.push(() => {
      watch.uses--
      showDefenderTrait(battle, cast, "consume", target, event, { from: event.cast.from, target: target.id })
    })
    return
  }
  watch.uses--
  const contact = point(event.at ?? target)
  const signed = { ...cast, signature: cast.signature && { ...cast.signature, origin: contact } }
  const area = selectionArea(battle, signed, step.selector, event)
  showDefenderTrait(battle, signed, "consume", target, event, { from: event.cast.from, target: target.id, area })
  if (area && select(battle, signed, step.selector, event, area).length)
    queueBardGold(battle, signed, step, event, watch.gold ?? "", .20, area)
}

function applyGold(battle: EdgeBattle, owner: EdgeFighter, gold: EdgeGold, event: SkillEvent, cast = event.cast) {
  if (bardTraitArt(gold.id)) {
    applyBardGold(battle, owner, gold, event, cast)
    return
  }
  if (healerTraitArt(gold.id)) {
    applyHealerGold(battle, owner, gold, event, cast)
    return
  }
  if (dancerTraitArt(gold.id)) {
    applyDancerGold(battle, owner, gold, cast, event)
    return
  }
  if (binderTraitArt(gold.id)) {
    applyBinderGold(battle, owner, gold, cast, event)
    return
  }
  if (lifebringerTraitArt(gold.id)) {
    applyLifebringerGold(battle, owner, gold, cast, event)
    return
  }
  if (warlockTraitArt(gold.id)) {
    const origin = point(assassinTraitOrigin(owner, event))
    const source = { ...cast, signature: { id: gold.id, mark: gold.artwork.end, origin } }
    const flight = (incoming: SkillEvent, duration: number) => {
      const step = gold.steps[0]
      const target = select(battle, source, step.selector, incoming, selectionArea(battle, source, step.selector, incoming))[0]
      if (!target?.hp) return
      showDefenderTrait(battle, source, "travel", target, incoming, { from: source.signature.origin, to: target, target: target.id, duration })
      later(battle, duration, () => {
        if (target.hp) applyStep(battle, source, step, { ...incoming, from: source.signature.origin }, true, undefined, [target], gold.name)
      })
    }
    if (gold.id === "warlock/UC/G1") { flight(event, .22); return }
    if (gold.id === "warlock/R/G1") {
      const target = unitOf(battle, event.target), motion = target?.force
      if (!target?.hp || !motion || motion.kind !== "push" || motion.cause?.id !== cast.id) return
      later(battle, Math.max(.001, motion.since + motion.duration - battle.time) + .01, () => {
        if (!target.hp || !motion.completed || target.force || edgeDistance(target, motion.end) > 3) return
        source.signature.origin = point(target)
        source.from = point(target)
        flight({ ...event, at: point(target), landing: point(target), area: undefined }, .20)
      })
      return
    }
    if (gold.id === "warlock/E/G1") {
      const area = selectionArea(battle, source, gold.steps[0].selector, event)
      showDefenderTrait(battle, source, "travel", cast.aim, event, { area, to: cast.aim, duration: .55 })
    }
    if (gold.id === "warlock/E/G2") {
      later(battle, .001, () => {
        const motions = [...cast.trace].flatMap(([id, trace]) => trace.pushMotion ? [{ id, motion: trace.pushMotion }] : [])
        const empowered = motions.find(row => row.id === cast.warlockRim)?.motion
        if (!empowered || !motions.length) return
        const end = Math.max(...motions.map(row => row.motion.since + row.motion.duration))
        later(battle, Math.max(.001, end - battle.time) + .01, () => {
          if (!empowered.completed) return
          const landed = motions.flatMap(({ id, motion }) => {
            const unit = unitOf(battle, id)
            return unit?.hp && motion.completed && !unit.force && edgeDistance(unit, motion.end) <= 3
              ? [{ unit, motion, distance: edgeDistance(motion.start, motion.end) }] : []
          }).sort((a, b) => b.distance - a.distance)[0]
          if (!landed || landed.distance < 3) return
          source.signature.origin = point(landed.unit)
          runSteps(battle, source, gold.steps, { ...event, target: landed.unit.id, at: point(landed.unit), landing: point(landed.unit), area: undefined }, true, gold.name)
        })
      })
      return
    }
    if (gold.id === "warlock/Prismatic/G1") {
      source.aim = point(cast.warlockHits?.[0]?.at ?? event.at ?? cast.aim)
      source.signature.origin = point(source.aim)
    }
    if (gold.id === "warlock/Prismatic/G2") {
      const target = unitOf(battle, event.target)
      if (!target?.hp || !isFighter(target) || target === owner) return
      const current = shielded(battle, target) ? target.shield : 0
      const amount = Math.min(target.maxHp * .33, current + target.maxHp * .10)
      if (amount <= current) return
      // The paired 23% shield is normally still present when the mark pays out.
      // This reinforcement adds to it, up to 33%, instead of replacing it with a weaker 10% shield.
      if (shield(battle, source, target, amount, 12, event, true)) showDefenderTrait(battle, source, "proc", target, event, {
        from: event.from ?? owner, to: target, contacts: [point(target)],
      })
      return
    }
    runSteps(battle, source, gold.steps, event, true, gold.name)
    return
  }
  if (assassinTraitArt(gold.id)) {
    const source = { ...cast, signature: { id: gold.id, mark: gold.artwork.end, origin: point(assassinTraitOrigin(owner, event)) } }
    if (gold.id === "assassin/C/G2") source.from = point(event.from ?? cast.from)
    if (gold.id === "assassin/UC/G1") {
      const target = unitOf(battle, cast.target)
      if (!target?.hp) return
      source.aim = along(target, direction(owner, target), 60)
      source.signature.origin = point(owner)
      const area = areaOf("C", source.aim, direction(owner, target), 70)
      showDefenderTrait(battle, source, "travel", source.aim, event, { area, to: source.aim, duration: .45 })
    }
    if (gold.id === "assassin/R/G1") battle.runtime.watches = battle.runtime.watches.filter((watch) =>
      watch.cast.id !== cast.id || watch.cast.owner !== owner.id || !!watch.cast.signature || watch.rule.event !== "strike")
    if (gold.id === "assassin/R/G2" || gold.id === "assassin/L/G2") {
      const target = unitOf(battle, gold.id === "assassin/L/G2" ? event.assassinEnemy : event.target)
      const motion = target?.force
      if (!target?.hp || !motion || motion.kind !== "push" || gold.id === "assassin/R/G2" && motion.cause?.signature?.id !== "assassin/R/P2") return
      if (gold.id === "assassin/R/G2") source.aim = point(cast.assassinContact ?? cast.aim)
      later(battle, Math.max(.001, motion.since + motion.duration - battle.time), () => {
        if (!target.hp || !motion.completed || target.force || edgeDistance(target, motion.end) > 3 || gold.id === "assassin/L/G2" && !isOutside(target)) return
        source.signature.origin = point(target)
        runSteps(battle, source, gold.steps, { ...event, target: target.id, at: point(target), area: undefined, landing: undefined }, true, gold.name)
      })
      return
    }
    if (gold.id === "assassin/Radiant/G1" && cast.assassinRoute) event = { ...event,
      axis: left(direction(cast.assassinReturnEdge ?? cast.assassinRoute.to, cast.assassinRoute.from)) }
    if (gold.id === "assassin/Radiant/G2") source.signature.origin = point(owner)
    if (gold.id === "assassin/Prismatic/G1") {
      const step = gold.steps[0]
      const target = select(battle, source, step.selector, event, selectionArea(battle, source, step.selector, event))[0]
      if (!target) return
      const duration = clamp(edgeDistance(source.signature.origin, target) / 1100, .22, .45)
      showDefenderTrait(battle, source, "travel", target, event, { to: target, target: target.id, duration })
      later(battle, duration, () => {
        if (target.hp) applyStep(battle, source, step, event, true, undefined, [target], gold.name)
      })
      return
    }
    runSteps(battle, source, gold.steps, event, true, gold.name)
    return
  }
  if (spellbreakerTraitArt(gold.id)) {
    const origin = gold.id === "spellbreaker/Prismatic/G2" ? event.from ?? owner : spellTraitOrigin(owner, event)
    const source = { ...cast, signature: { id: gold.id, mark: gold.artwork.end, origin: point(origin) } }
    if (gold.id === "spellbreaker/E/G1" && event.intercept) source.aim = point(event.intercept)
    if (gold.id === "spellbreaker/Radiant/G1") {
      const defender = unitOf(battle, event.target) ?? owner
      const attacker = unitOf(battle, event.attacker)
      source.signature.origin = point(defender)
      if (attacker) event = { ...event, axis: direction(defender, attacker) }
    }
    runSteps(battle, source, gold.steps, event, true, gold.name)
    return
  }
  if (gold.id === "ranger/C/G1" && event.at) {
    const contact = point(event.at)
    cast = { ...cast, from: contact, aim: along(contact, direction(event.from ?? cast.from, contact), 105) }
  }
  if (gold.id === "ranger/E/G1") {
    const force = unitOf(battle, event.target)?.force
    if (force?.cause?.id !== cast.id) return
    event = { ...event, landing: force.end }
  }
  if (wardenTraitArt(gold.id)) {
    applyWardenGold(battle, owner, gold, event, cast)
    return
  }
  if (paladinTraitArt(gold.id)) {
    const origin = gold.id === "paladin/R/G1" || gold.id === "paladin/Radiant/G2" ? event.at ?? owner
      : gold.id === "paladin/E/G2" ? event.area?.center ?? event.at ?? owner : paladinTraitOrigin(owner, event)
    const source = { ...cast, signature: { id: gold.id, mark: gold.artwork.end, origin: point(origin) } }
    if (gold.id === "paladin/Radiant/G1" && event.area) {
      source.aim = along(cast.from, direction(cast.from, event.area.center), edgeDistance(cast.from, event.area.center) * 2)
      source.signature.origin = source.aim
    }
    runSteps(battle, source, gold.steps, event, true, gold.name)
    return
  }
  if (berserkerTraitArt(gold.id)) {
    const origin = gold.id === "berserker/L/G1" ? cast.from
      : ["berserker/Radiant/G2", "berserker/Prismatic/G1", "berserker/Prismatic/G2"].includes(gold.id) ? owner
      : berserkerTraitOrigin(battle, owner, gold.id, event)
    const source = { ...cast, signature: { id: gold.id, mark: gold.artwork.end, origin: point(origin) } }
    if (gold.id === "berserker/R/G1") {
      const target = unitOf(battle, event.target)
      const motion = target?.force
      if (!target || !motion || motion.cause?.id !== cast.id) return
      later(battle, motion.duration, () => {
        if (!target.hp || !owner.hp || !motion.completed || edgeDistance(target, motion.end) > 3) return
        const at = point(target)
        source.signature.origin = at
        runSteps(battle, source, gold.steps, { ...event, at, landing: at }, true, gold.name)
      })
    } else runSteps(battle, source, gold.steps, event, true, gold.name)
    return
  }
  if (bulwarkTraitArt(gold.id)) {
    const source = { ...cast, signature: { id: gold.id, mark: gold.artwork.end, origin: point(armorOrigin(owner, event)) } }
    if (gold.id === "bulwark/R/G2" && event.landing) {
      const target = unitOf(battle, event.target)
      const landing = point(event.landing)
      later(battle, Math.max(.01, event.motionSeconds ?? 0), () => {
        if (!target?.hp || edgeDistance(target, landing) > 3) return
        runSteps(battle, source, gold.steps, { ...event, at: point(target) }, true, gold.name)
      })
    } else runSteps(battle, source, gold.steps, event, true, gold.name)
    return
  }
  if (summonTraitArt(gold.id)) {
    const origin = point(summonTraitOrigin(battle, cast, event))
    const source = { ...cast, from: origin, aim: gold.id === "summoner/L/G1" ? event.at ?? cast.aim : cast.aim,
      signature: { id: gold.id, mark: gold.artwork.end, origin } }
    if (gold.id === "summoner/C/G1") {
      const step = gold.steps[0]
      const area = selectionArea(battle, source, step.selector, event)
      const target = select(battle, source, step.selector, event, area)[0]
      if (!target) return
      flash(battle, owner.id, gold.name, true)
      source.used.add(gold.id + "/notice")
      showSummonTrait(battle, owner, source, "travel", target, target, event, { target: target.id })
      later(battle, .20, () => {
        if (target.hp) applyStep(battle, source, step, event, true, undefined, [target], gold.name)
      })
    } else {
      runSteps(battle, source, gold.steps, event, true, gold.name)
    }
    return
  }
  if (rangerChoreography(gold.id)) cast = { ...cast, signature: { id: gold.id, mark: gold.artwork.end } }
  flash(battle, owner.id, gold.name, true)
  playSkillArtwork(battle, cast, owner, gold, event, true)
  runSteps(battle, cast, gold.steps, event, true, gold.name)
}

function applyWardenGold(battle: EdgeBattle, owner: EdgeFighter, gold: EdgeGold, event: SkillEvent, cast: SkillCast) {
  const source = { ...cast, signature: { id: gold.id, mark: gold.artwork.end, origin: point(armorOrigin(owner, event)) } }
  switch (gold.id) {
    case "warden/UC/G1":
      if (cast.wardenRoute) source.signature.origin = point(cast.wardenRoute.from)
      break
    case "warden/UC/G2":
      if (!event.at || !event.landing) return
      source.aim = along(owner, direction(event.landing, event.at), 42)
      break
    case "warden/R/G1": case "warden/E/G2": {
      const unit = unitOf(battle, event.target)
      const motion = unit?.force
      if (!unit || !motion || motion.cause?.id !== cast.id) return
      later(battle, motion.duration, () => {
        if (!owner.hp || !unit.hp || !motion.completed || edgeDistance(unit, motion.end) > 2) return
        const at = point(unit)
        source.signature.origin = at
        runSteps(battle, source, gold.steps, { ...event, at, landing: at }, true, gold.name)
      })
      return
    }
    case "warden/E/G1": {
      const group = event.pushGroup
      if (!group?.length) return
      later(battle, Math.max(...group.map(({ motion }) => motion.duration)), () => {
        if (!owner.hp) return
        for (const { id, from, motion } of group) {
          const unit = unitOf(battle, id)
          if (!unit?.hp || !motion.completed || edgeDistance(unit, motion.end) > 2) continue
          const at = point(unit)
          applyStep(battle, source, gold.steps[0], { ...event, target: id, at, axis: direction(from, at), pushGroup: undefined },
            true, undefined, [unit], gold.name)
        }
      })
      return
    }
    case "warden/Radiant/G1":
      // The second beat spends this pairing as part of its one actual push.
      if (event.pushGroup?.length) showDefenderTrait(battle, source, "proc", owner, event, {
        from: event.area?.center, area: event.area,
        contacts: event.pushGroup.map(({ from }) => from), landings: event.pushGroup.map(({ motion }) => point(motion.end)),
      })
      return
    case "warden/Prismatic/G2":
      if (!cast.wardenRoute) return
      source.from = cast.wardenRoute.from
      source.aim = cast.wardenRoute.to
      break
  }
  runSteps(battle, source, gold.steps, event, true, gold.name)
}

export function playPreviewTrigger(battle: EdgeBattle, owner: EdgeFighter, effect: EdgePassive | EdgeGold, event: SkillEvent) {
  const resolve = (live: SkillEvent) => {
    if ("active" in effect) applyGold(battle, owner, effect, live, event.cast)
    else applyPassive(battle, event.cast, owner, effect, live)
  }
  const { cast } = event
  const { flags } = effect.rule
  if (flags.includes("pairedshield")) {
    const ally = alliesOf(battle, owner.id).find((unit) => unit.id !== owner.id && unit.hp)
    if (ally) {
      shield(battle, cast, owner, 110, 6)
      shield(battle, cast, ally, 110, 6)
      resolve({ ...event, target: ally.id, at: point(ally), amount: 110 })
      return
    }
  }
  if (event.kind === "after" && flags.includes("multi") || flags.some((flag) => flag.startsWith("pushpair"))) {
    const [first, second] = nodes(battle).filter((unit) => unit.hp && !friendly(battle, owner.id, unit.id))
    if (first && second) {
      for (const target of [first, second]) {
        if (event.kind === "push") shoveUnit(battle, cast, target, 85, "", undefined, false, { x: 0, y: -1 })
        else {
          cue(battle, "melee", owner, target)
          damageUnit(battle, cast, target, cast.basis)
        }
      }
      resolve({ ...event, target: second.id, at: point(second), landing: cast.trace.get(second.id)?.pushedTo, total: 2 })
      return
    }
  }
  if ("active" in effect && !["strike", "receive", "mend", "ward", "shove"].includes(event.kind)) resolve(event)
  else playPreviewEvent(battle, event, resolve, flags.includes("q"))
}

export function playPreviewWatch(battle: EdgeBattle, watch: Watch, event: SkillEvent, delay: number) {
  const run = () => {
    if (watch.uses <= 0 || watch.until <= battle.time) return
    playPreviewEvent(battle, event, (live) => {
      if (watch.uses <= 0) return
      watch.uses--
      applyStep(battle, watch.cast, watch.step, live, watch.derived, undefined, undefined, watch.gold)
    }, watch.rule.flags.includes("q"))
  }
  if (delay > 0) later(battle, delay, run)
  else run()
}

// Sample one input against the rehearsal units. Resolve modifiers on the same
// event that damage, healing or displacement will consume.
export function playPreviewEvent(
  battle: EdgeBattle, sample: SkillEvent, resolve: (event: SkillEvent) => void, basic = false,
) {
  const preview = battle.preview
  const source = unitOf(battle, sample.source)
  const target = unitOf(battle, sample.target)
  if (!preview || !source?.hp || !target?.hp) {
    resolve(sample)
    return
  }
  const { kind } = sample
  const cast = newCast(battle, source, basic ? "basic" : "skill", target, target)
  const capture = (action: () => void) => {
    const previous = preview.onEvent
    let fired = false
    preview.onEvent = (event) => {
      previous?.(event)
      if (fired || event.kind !== kind || event.target !== target.id) return
      fired = true
      event.area ??= sample.area
      event.landing ??= sample.landing
      event.from ??= sample.from
      event.distance ??= sample.distance
      resolve(event)
    }
    try { action() } finally { preview.onEvent = previous }
    if (!fired) resolve(sample)
  }
  if (["strike", "hit", "receive", "hurt", "life", "break", "death", "protect", "redirect", "save"].includes(kind)) {
    const raw = sample.raw ?? source.attack
    if (kind === "break" && target.shield <= 0) shield(battle, cast, target, 64, 4, undefined, true)
    const hit = () => capture(() => {
      damageUnit(battle, cast, target, kind === "death" ? (target.hp + target.shield) * 2 : raw, { ...sample, push: undefined, axis: undefined })
      if (basic && kind !== "death") shoveUnit(battle, cast, target, BASIC_PUSH)
    })
    if (isFighter(source) && source.range >= 200 && source.id !== target.id) launchBasicShot(battle, source, target, hit)
    else {
      cue(battle, "melee", source, target)
      hit()
    }
  } else if (kind === "heal" || kind === "mend") {
    capture(() => heal(battle, cast, target, sample.raw ?? 110, sample.style ?? "", sample))
  } else if (kind === "shield" || kind === "ward") {
    capture(() => shield(battle, cast, target, sample.raw ?? 95, 6, sample))
  } else if (kind === "shove" || kind === "push") {
    const shove = () => capture(() => {
      if (sample.raw && !friendly(battle, source.id, target.id)) {
        damageUnit(battle, cast, target, sample.raw, { ...sample, push: undefined, axis: undefined })
      }
      shoveUnit(battle, cast, target, sample.push ?? 80, sample.style, sample, false, sample.axis)
    })
    if (basic && isFighter(source) && source.range >= 200) launchBasicShot(battle, source, target, shove)
    else {
      if (sample.raw) cue(battle, "melee", source, target)
      shove()
    }
  } else if (kind === "pull") {
    capture(() => pullUnit(battle, cast, target, sample.distance ?? 80, 34, "self", sample))
  } else if (kind === "alter" && sample.style === "slow") {
    capture(() => act(battle, cast, target, { kind: "slow", args: [20, 2], style: "" }, sample))
  } else if (kind === "cleanse" || kind === "remove") {
    addBuff(battle, cast, target, kind === "cleanse" ? "slow" : "res", 4, [22])
    capture(() => cleanse(battle, cast, target, 1, kind === "cleanse", "", sample))
  } else if (kind === "interrupt") {
    const boss = battle.boss
    const axis = direction(boss, source)
    battle.telegraph = { from: point(boss), to: along(boss, axis, 260), direction: axis, until: battle.time + .36 }
    later(battle, .36, () => capture(() => interrupt(battle, cast, target, sample)))
  } else if (kind === "move" || kind === "startMove" || kind === "dash" || kind === "return" || kind === "exit") {
    const landing = sample.landing ?? inside(along(target, { x: 1, y: 0 }, 85))
    if (kind === "startMove") {
      capture(() => { if (!startMovement(battle, target, landing, isOutside(target))) target.move = landing })
    } else {
      cue(battle, "move", target, landing)
      forceTo(battle, target, landing, .29, false, cast)
      later(battle, .29, () => resolve({ ...sample, at: point(target), landing: point(target) }))
    }
  } else {
    resolve(sample)
  }
}

function tailProtector(battle: EdgeBattle, target: EdgeUnit) {
  if (!isFighter(target)) return undefined
  return alliesOf(battle, target.id).find((owner) => owner !== target && bulwarkStance(battle, owner, "bulwark/UC/P5") &&
    bulwarkPartners(battle, owner, "bulwark/UC/P5")[0] === target)
}

function modifier(battle: EdgeBattle, unit: EdgeUnit, kind: string, target?: EdgeUnit, attack?: SkillCast["order"], incoming?: SkillCast,
  at = battle.time) {
  let result = Math.max(0, ...activeBuffs(battle, unit.id, kind, at)
    .filter((buff) => kind !== "weak" || buff.style !== "other")
    .filter((buff) => kind !== "speed" || buff.style !== "inside" || !isOutside(unit))
    .filter((buff) => kind !== "res" || buff.style !== "ranged" || (target?.range ?? 0) >= 200)
    .map(({ values }) => values[0] ?? 0))
  if (isFighter(unit)) {
    for (const passive of unit.passives) {
      if (passive.rule.event !== "always") continue
      const operation = passive.steps.flatMap((step) => step.operations).filter((op) => op.kind === kind &&
        !["carry", "tail", "layer", "transfer"].includes(op.style) && (op.style !== "skill" || attack && attack !== "basic") &&
        (op.style !== "ranged" || (target?.range ?? 0) >= 200))
      if (operation.length && passiveStance(battle, unit, passive, target, incoming))
        for (const op of operation) result = Math.max(result, op.args[0] ?? 0)
    }
  }
  if (kind === "anti" && result < 12 && tailProtector(battle, unit)) result = 12
  if (kind === "anti" && result < 10 && isFighter(unit) && paladinFrontFlag(battle, unit)) result = 10
  for (const zone of battle.runtime.fields) {
    const danceTrack = kind === "speed" && (zone.mode === "dancerail" || zone.mode === "dancepasses") && !isOutside(unit)
    if ((zone.mode !== "hold" && !danceTrack) || zone.until <= at || !areaHits(zone.area, unit) ||
      !select(battle, zone.cast, zone.step.selector, undefined, zone.area, candidate => candidate.id === unit.id ? unit : candidate)
        .some(candidate => candidate.id === unit.id)) continue
    for (const op of zone.step.operations) {
      if (op.kind !== kind) continue
      if (op.style === "out") {
        if (!unit.move) continue
        const outward = binderArt(zone.cast)?.motif === "gravityDisk" ? movingOutward(unit, unit.move, zone.area.center)
          : edgeDistance(unit.move, zone.area.center) > edgeDistance(unit, zone.area.center)
        if (!outward) continue
      }
      result = Math.max(result, op.args[0] ?? 0)
    }
  }
  if (!isSummonId(unit.id)) for (const { group, deployment, plan } of activeDeployments(battle)) {
    const aura = plan.aura
    if (group.until <= at || aura?.stat !== kind || friendly(battle, group.owner, unit.id) !== (aura.side === "ally")) continue
    if (deployment.bodies.some((body) => body.hp && (!aura.phase || aura.phase === body.phase) && edgeDistance(body, unit) <= aura.radius)) {
      result = Math.max(result, aura.value)
    }
  }
  return result
}

export const movementSpeed = (battle: EdgeBattle, unit: EdgeUnit) =>
  unit.speed * (isOutside(unit) ? EXILE.speed : 1) * (1 + ratio(modifier(battle, unit, "speed"))) * (1 - ratio(modifier(battle, unit, "slow")))
export const movementStopped = (battle: EdgeBattle, unit: EdgeUnit, at = battle.time) => activeBuffs(battle, unit.id, "root", at).length > 0
export const attackRange = (battle: EdgeBattle, unit: EdgeUnit, target?: EdgeUnit, at = battle.time) =>
  Math.max(unit.range, ...activeBuffs(battle, unit.id, "choose", at).map((buff) => buff.values[0])) +
  modifier(battle, unit, "range", target, undefined, undefined, at) + modifier(battle, unit, "qr", target, undefined, undefined, at)
export function glideField(battle: EdgeBattle, unit: EdgeUnit, destination: EdgePoint) {
  return battle.runtime.fields.find((field) => field.mode === "track" && !field.seen.has(unit.id) &&
    isFighter(unit) && !isOutside(unit) && !isOutside(destination) && friendly(battle, field.cast.owner, unit.id) &&
    field.until > battle.time && field.danceRail &&
    dancerRailContains(field.danceRail, unit) && dancerRailContains(field.danceRail, destination))
}

function dancerTraitRail(battle: EdgeBattle, unit: EdgeUnit, slider: boolean) {
  if (isOutside(unit)) return
  return battle.runtime.fields.find(field => field.danceRail && field.until > battle.time &&
    (!slider || field.mode === "track" || field.mode === "dancehinge") && friendly(battle, field.cast.owner, unit.id) &&
    dancerRailContains(field.danceRail, unit))
}

export function dancerHop(battle: EdgeBattle, unit: EdgeUnit) {
  return activeBuffs(battle, unit.id, "hop").find(buff => dancerArt(buff.cast)?.motif === "hopNote")
}

export function dancerMovesBySkill(battle: EdgeBattle, unit: EdgeUnit, destination: EdgePoint) {
  return !!glideField(battle, unit, destination) || !!dancerHop(battle, unit)
}

const shortDistance = (buff: Buff, base: number) => buff.style === "pct" ? base * ratio(buff.values[0]) : buff.values[0]
function stepLimit(battle: EdgeBattle, unit: EdgeUnit, base: number) {
  return activeBuffs(battle, unit.id, "short").filter(buff => buff.style !== "spellmove" && buff.style !== "binderout")
    .sort((a, b) => shortDistance(b, base) - shortDistance(a, base))[0]
}

function gravityStepLimit(battle: EdgeBattle, unit: EdgeUnit, destination?: EdgePoint) {
  return destination && activeBuffs(battle, unit.id, "short").find(buff =>
    buff.style === "binderout" && movingOutward(unit, destination, buff.cast.aim))
}

export const movementAllowance = (battle: EdgeBattle, unit: EdgeUnit, base: number, destination?: EdgePoint, ignoreShort = false) => {
  base *= 1 + (isFighter(unit) ? unit.growth?.reach ?? 0 : 0)
  const more = activeBuffs(battle, unit.id, "extend")
  const less = !ignoreShort && stepLimit(battle, unit, base)
  const gravity = !ignoreShort && gravityStepLimit(battle, unit, destination)
  const glide = destination && glideField(battle, unit, destination)
  const length = glide ? glide.step.operations.find((op) => op.kind === "glide")?.args[0] ?? base : base
  const hop = activeBuffs(battle, unit.id, "hop").sort((a, b) => b.values[0] - a.values[0])[0]
  const reach = glide ? length : hop && dancerArt(hop.cast) ? hop.values[0]
    : Math.max(base, hop?.values[0] ?? base) + Math.max(0, ...more.map((buff) => buff.values[0]))
  return Math.max(20, reach - Math.max(0, less ? shortDistance(less, base) : 0) -
    (gravity ? shortDistance(gravity, base) : 0))
}

export function tetherLanding(battle: EdgeBattle, unit: EdgeUnit, destination: EdgePoint) {
  const tether = activeBuffs(battle, unit.id, "tether")[0]
  if (!tether) return destination
  const center = tether.cast.aim
  const radius = tether.values[0]
  if (edgeDistance(unit, center) > radius || edgeDistance(destination, center) <= radius) return destination
  const axis = direction(unit, destination)
  const x = unit.x - center.x
  const y = unit.y - center.y
  const dot = x * axis.x + y * axis.y
  const length = -dot + Math.sqrt(Math.max(0, dot * dot - x * x - y * y + radius * radius))
  return along(unit, axis, length)
}

function remove(battle: EdgeBattle, buff: Buff) {
  battle.runtime.buffs = battle.runtime.buffs.filter((item) => item !== buff)
}

function addBuff(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, kind: string, duration: number, values: number[], style = "") {
  const id = effectKey(cast, kind)
  const list = battle.runtime.buffs
  battle.runtime.buffs = list.filter((item) => item.target !== target.id || item.id !== id || item.cast.owner !== cast.owner)
  const buff: Buff = { id, cast, target: target.id, kind, values, style, until: battle.time + duration }
  battle.runtime.buffs.push(buff)
  return buff
}

export const statusNames = (battle: EdgeBattle, target: EdgeUnit) => {
  const names: Record<string, string> = { split: "分护", defy: "急救", slow: "减速", root: "定身", anti: "抗推", res: "减伤", amp: "增伤", phase: "掠影", armor: "破甲", dot: "灼烧", taunt: "挑衅", returnhp: "援护", q: "下次普攻", qp: "下次推击", qr: "射程加成", guard: "格挡", extend: "长步", hop: "跳点", speed: "加速", exguard: "压线", healcut: "重伤" }
  const buffs = activeBuffs(battle, target.id).flatMap((buff) => buff.kind === "slow" && buff.style === WARDEN_CONTROL.style
    ? ["战坦压制"] : names[buff.kind] ? [names[buff.kind]] : [])
  const marked = battle.runtime.watches.some((watch) => watch.target === target.id && watch.until > battle.time && watch.uses > 0)
  return [...new Set(marked ? [...buffs, "待用"] : buffs)]
}

export function healerActiveReadiness(battle: EdgeBattle) {
  if (battle.finishedAt !== null) return []
  const marks: { skill: string; target: EdgeUnit; kind: string; until: number; amount?: number; from?: EdgeUnit; movingFaster?: boolean }[] = []
  const mark = (cast: SkillCast, id: EdgeUnitId, kind: string, until: number, amount?: number) => {
    if (!healerArt(cast) || until <= battle.time) return
    const target = unitOf(battle, id)
    const from = kind === "split" ? unitOf(battle, cast.owner) : undefined
    if (target?.hp && (kind !== "split" || from?.hp))
      marks.push({ skill: cast.skill!.id, target, kind, until, amount, from,
        movingFaster: kind === "speed" && !isOutside(target) && !!target.move && !target.force && amount === modifier(battle, target, "speed"),
      })
  }
  for (const buff of battle.runtime.buffs) if (["guard", "defy", "split", "returnhp", "speed", "anti"].includes(buff.kind))
    mark(buff.cast, buff.target, buff.kind, buff.until, buff.values[0])
  for (const watch of battle.runtime.watches) if (!watch.derived && watch.uses > 0)
    mark(watch.cast, watch.target, watch.rule.event, watch.until)
  for (const [id, cast] of battle.runtime.shieldCasts) {
    const target = unitOf(battle, id)
    if (target?.shield) mark(cast, id, "shield", target.shieldUntil, target.shield / Math.max(1, target.shieldStart ?? target.shield))
  }
  return marks
}

export function bardActiveReadiness(battle: EdgeBattle) {
  const marks = new Map<string, { id: string; skill: string; target: EdgeUnit; kind: string; until: number; count: number; other?: EdgeUnit }>()
  if (battle.finishedAt !== null) return []
  const note = (cast: SkillCast, id: EdgeUnitId, kind: string, until: number, count = 1) => {
    const art = bardArt(cast)
    if (!art || until <= battle.time) return
    const target = unitOf(battle, id)
    if (!target?.hp) return
    const key = cast.id + "@" + id
    const prior = marks.get(key)
    if (prior && (kind === "shield" || prior.until >= until)) return
    const other = art.motif === "duet" ? unitOf(battle, id === cast.owner ? cast.target : cast.owner) : undefined
    if (art.motif === "duet" && !other?.hp) return
    marks.set(key, { id: key, skill: cast.skill!.id, target, kind, until, count, other })
  }
  for (const buff of battle.runtime.buffs)
    if (["ampq", "qp", "qr", "guard", "q", "score", "slow"].includes(buff.kind)) note(buff.cast, buff.target, buff.kind, buff.until)
  for (const watch of battle.runtime.watches)
    if (!watch.derived && watch.uses > 0) note(watch.cast, watch.target, watch.rule.event, watch.until, watch.uses)
  for (const [id, cast] of battle.runtime.shieldCasts) {
    const holder = unitOf(battle, id)
    if (holder?.shield && ["restCloak", "shieldRelay", "coda", "shoreCoda"].includes(bardArt(cast)?.motif ?? ""))
      note(cast, id, "shield", holder.shieldUntil)
  }
  return [...marks.values()]
}

function spendBuff(battle: EdgeBattle, unit: EdgeUnit, kind: string, at?: EdgePoint, from?: EdgePoint, event?: SkillEvent, allowed?: (buff: Buff) => boolean) {
  const buffs = activeBuffs(battle, unit.id, kind)
  const largest = (allowed ? buffs.filter(allowed) : buffs).sort((a, b) => b.values[0] - a.values[0])[0]
  if (largest) {
    remove(battle, largest)
    if (event && largest.cast.signature?.id && (kind === "q" || kind === "qp"))
      event.cast.used.add("spent/" + largest.cast.signature.id + "@" + unit.id)
    consumeTrait(battle, largest.cast, unit, at, from, event)
  }
  return largest
}

function visual(battle: EdgeBattle, cast: SkillCast, area: EdgeArea, phase: "warning" | "impact" | "zone", duration: number, gold?: string, effect?: "damage" | "heal" | "shield" | "control") {
  const v: AreaVisual = { id: ++battle.nextFx, owner: cast.owner, area, phase, time: battle.time, until: battle.time + duration, gold: !!gold, name: gold, effect }
  battle.runtime.visuals.push(v)
  return v
}

function later(battle: EdgeBattle, delay: number, run: () => void, strike?: PendingStrike, support?: PendingSupport, heals?: PendingHealing[],
  following?: readonly PendingTargetStrike[]) {
  if (battle.finishedAt !== null) return
  battle.runtime.pending.push({ due: battle.time + delay, order: ++battle.runtime.sequence, run, strike, following, support, heals })
}

function scheduledSupport(cast: SkillCast, step: Step, ownerRequired: boolean, area?: EdgeArea, target?: EdgeUnitId, range?: number): PendingSupport | undefined {
  if (step.watch || step.zone || !step.operations.some(op => (op.kind === "h" || op.kind === "b") && !op.style)) return
  if (target === undefined && (step.selector.units !== "a" || !area)) return
  return { cast, step, ownerRequired, area, target, range }
}

export function forecastDefeatGuard(cast: SkillCast, target: EdgeUnit, step: Step, at: number): Buff | undefined {
  const save = step.operations.find(op => op.kind === "defy" && !op.style)
  const id = effectKey(cast, "defy")
  if (!save || target.once.has(id)) return
  return { id, cast, target: target.id, kind: "defy", values: save.args, style: save.style, until: at + (save.args[1] ?? 8) }
}

export function estimateScheduledSupport(battle: EdgeBattle, support: PendingSupport, target: EdgeUnit, at: number,
  position: (unit: EdgeUnit) => EdgePoint) {
  const { cast, step, area, target: picked, range, ownerRequired, swap } = support
  const owner = unitOf(battle, cast.owner)
  if (!owner || ownerRequired && !owner.hp || !target.hp || !friendly(battle, cast.owner, target.id)) return
  if (support.reservoir === "opening" && (owner.force && owner.force.since + owner.force.duration >= at ||
    edgeDistance(cast.from, position(owner)) > 3)) return
  if (support.reservoir && support.reservoir !== "opening" &&
    (!battle.runtime.fields.includes(support.reservoir) || support.reservoir.until <= at)) return
  if (support.landing && (target.force !== support.landing && !support.landing.completed ||
    edgeDistance(position(target), support.landing.end) >= 2)) return
  if (picked === undefined) {
    if (!select(battle, cast, step.selector, undefined, area, position).includes(target)) return
  } else if (picked !== target.id || range !== undefined && edgeDistance(position(owner), position(target)) > range ||
    swap && (isOutside(position(owner)) || isOutside(position(target)))) return
  const heal = step.operations.find(op => op.kind === "h" && !op.style)
  const ward = step.operations.find(op => op.kind === "b" && !op.style)
  const { received, healingAmp, recovery } = heal ? healFactors(battle, owner, target, false, at)
    : { received: 0, healingAmp: 0, recovery: 1 }
  const duration = isFighter(owner) && (owner.card.rarity === "Radiant" || owner.card.rarity === "Prismatic") ? 12 : 10
  return {
    heal: heal ? Math.round(target.maxHp * ratio(heal.args[0]) * (1 + ratio(received)) * (1 + ratio(healingAmp)) * recovery) : 0,
    shield: ward ? Math.round(target.maxHp * ratio(ward.args[0])) : 0,
    shieldUntil: ward ? at + (ward.args[1] ?? duration) : 0,
    defy: forecastDefeatGuard(cast, target, step, at),
  }
}

function eventFor(cast: SkillCast, kind: string, target?: EdgeUnit, base?: SkillEvent): SkillEvent {
  return { ...base, kind, cast, source: cast.owner, target: target?.id, at: target ? point(target) : base?.at, critical: undefined }
}

export const reservoirFlight = (from: EdgePoint, to: EdgePoint) => clamp(edgeDistance(from, to) / 720, .2, .43)

function releaseReservoir(battle: EdgeBattle, field: FieldEffect) {
  const cap = field.step.operations.find((op) => op.kind === "bank")?.args[2] ?? 18
  const target = nodes(battle).filter((unit) => unit.hp && friendly(battle, field.cast.owner, unit.id))
    .sort((a, b) => hpPct(a) - hpPct(b))[0]
  const stored = field.capacity
  field.capacity = 0
  field.until = battle.time
  if (target && stored > 0 && lifeArt(field.cast)) {
    const amount = Math.min(stored, target.maxHp * ratio(cap)), from = point(field.area.center)
    const travel = reservoirFlight(from, target)
    showLifeBeat(battle, field.cast, "release", from, { area: field.area, amount: stored, kind: "bank" })
    showLifeBeat(battle, field.cast, "flight", target, { from, target: target.id, amount, duration: travel, kind: "bank" })
    field.cast.pending++
    later(battle, travel, () => {
      if (target.hp) heal(battle, field.cast, target, amount, "bank", { ...eventFor(field.cast, "mend", target, field.event), from }, field.derived)
      field.cast.pending--
      finishCast(battle, field.cast)
    }, undefined, undefined, [{ cast: field.cast, amount, target: target.id, reservoirPayout: true }])
  } else if (target && stored > 0) heal(battle, field.cast, target, Math.min(stored, target.maxHp * ratio(cap)), "bank", field.event, field.derived)
}

function storeOverheal(battle: EdgeBattle, target: EdgeUnit, overflow: number) {
  const field = battle.runtime.fields.find((area) => area.mode === "reservoir" && area.until > battle.time &&
    friendly(battle, area.cast.owner, target.id) && areaHits(area.area, target))
  const owner = field && unitOf(battle, field.cast.owner)
  const bank = field?.step.operations.find((op) => op.kind === "bank")
  if (!field || !owner || !owner.hp && !lifeArt(field.cast) || !bank) return
  const limit = owner.maxHp * ratio(bank.args[1])
  const stored = Math.min(limit - field.capacity, overflow * ratio(bank.args[0]))
  if (stored <= 0) return
  field.capacity += stored
  if (lifeArt(field.cast)) showLifeBeat(battle, field.cast, "transfer", field.area.center, {
    from: target, area: field.area, amount: stored, remaining: field.capacity / limit, kind: "bank",
  })
  emit(battle, { ...eventFor(field.cast, "assist", target), style: "bank", amount: stored, area: field.area,
    from: point(field.area.center), derived: field.derived })
  if (field.capacity >= limit) releaseReservoir(battle, field)
}

export function healFactors(battle: EdgeBattle, owner: EdgeUnit, target: EdgeUnit, forwarded = false, at = battle.time) {
  return {
    received: forwarded ? 0 : modifier(battle, target, "healrecv", owner, undefined, undefined, at),
    healingAmp: forwarded ? 0 : modifier(battle, owner, "healamp", target, undefined, undefined, at),
    recovery: healingReceived(battle, target, at),
  }
}

export function heal(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, amount: number, style: string, event?: SkillEvent, derived = false,
  overflowShield?: { cap: number; duration: number }, limit = Infinity) {
  if (!target.hp || amount <= 0) return 0
  const owner = unitOf(battle, cast.owner) ?? target
  const life = !derived ? lifeArt(cast) : undefined
  const forwarded = life?.motif === "rootbond" && style === "share"
  if (!derived && !forwarded && isFighter(owner) && owner.growth) amount = (amount + owner.growth.heal) * (1 + owner.growth.healPct)
  const { received, healingAmp, recovery } = healFactors(battle, owner, target, forwarded)
  const healingTrait = !derived && (healerArt(cast) || bardArt(cast)) && healingAmp > 0 && isFighter(owner)
    ? owner.passives.find(passive => (healerTraitArt(passive.id) || bardTraitArt(passive.id)) && passive.rule.event === "always" &&
      passive.steps[0].operations.some(op => op.kind === "healamp" && op.args[0] === healingAmp) && passiveStance(battle, owner, passive, target))
    : undefined
  const unamplified = amount * (1 + ratio(received)) * recovery
  const base = amount * (1 + ratio(healingAmp))
  amount = base * (1 + ratio(received)) * recovery
  const before: SkillEvent = { ...eventFor(cast, "mend", target, event), style, raw: amount, derived,
    healTrigger: event?.kind === "hurt" && event.cast.id !== cast.id ? event.cast : event?.healTrigger,
    lowBefore: hpPct(target), bonus: 0, scale: 1, mendConfirmed: undefined }
  emit(battle, before)
  const bonus = (before.bonus ?? 0) * recovery
  const total = Math.min(limit, Math.max(0, Math.round((amount + bonus) * (before.scale ?? 1))))
  const missing = target.maxHp - target.hp
  const gain = Math.min(target.maxHp - target.hp, total)
  const healTrait = received === 12 && gain > Math.min(missing, Math.round((base * recovery + bonus) * (before.scale ?? 1)))
    ? ["bulwark/C/P5", "berserker/C/P5"].find((id) => bulwarkStance(battle, target, id)) : undefined
  target.hp += gain
  growthHeal(battle, owner, target, gain, derived)
  if (!derived) {
    traceAt(cast, target).heal += gain
    cast.heals += gain
    if (gain > 0) cast.protection ??= { target: target.id, kind: "heal" }
    if (gain > 0 && healerArt(cast)) {
      const records = cast.healerHeals ??= new Map()
      if (!records.has(target.id)) records.set(target.id, { id: target.id, at: point(target), before: before.lowBefore ?? 100 })
      cast.healerArea ??= event?.area
    }
  }
  if (gain) {
    impact(battle, owner, target, gain, "heal")
    if (healTrait) showDefenderStance(battle, target, healTrait, target, { ...before, from: point(owner) })
    if (life && healingAmp === 8 && isFighter(owner) && gain > Math.min(missing,
      Math.round((unamplified + bonus) * (before.scale ?? 1)))) {
      const canopy = owner.passives.find(passive => passive.id === "lifebringer/UC/P7")
      if (canopy && passiveStance(battle, owner, canopy, target))
        showDefenderStance(battle, owner, canopy.id, target, { ...before, from: point(owner) })
    }
    const unboosted = Math.min(missing, limit, Math.round((unamplified + bonus) * (before.scale ?? 1)))
    if (healingTrait && gain > unboosted)
      showDefenderStance(battle, owner, healingTrait.id, target, { ...before, amount: gain - unboosted, from: point(owner) })
    if (!derived && bulwarkArt(cast)) showBulwarkBeat(battle, cast, "heal", target, {
      amount: gain, from: unitOf(battle, event?.target) ?? owner, count: style === "riveted" ? 2 : undefined,
    })
    else if (!derived && berserkerArt(cast)) {
      const contacts = [...cast.trace].filter(([id, record]) => !friendly(battle, id, cast.owner) && record.hits > 0 &&
        (style !== "leech" || record.damage > 0 || ["roar", "converge"].includes(berserkerArt(cast)?.motif ?? "")))
      const paths = contacts.map(([, { at }]) => ({ at: point(at) }))
      showBerserkerBeat(battle, cast, "heal", target, {
        from: event?.intercept ?? paths[0]?.at ?? owner, target: target.id, amount: gain, paths,
      })
    }
    else if (!derived && paladinArt(cast)) {
      const motif = paladinArt(cast)?.motif
      const from = event?.intercept ?? event?.from ?? cast.paladinLaunch ??
        (motif === "burning" || motif === "chorus" ? event?.at : event?.area?.center) ?? owner
      showPaladinBeat(battle, cast, "heal", target, { from, amount: gain, target: target.id, area: event?.area, kind: style })
    }
    else if (!derived && healerArt(cast)) showHealerBeat(battle, cast, "heal", target, {
      from: event?.intercept ?? event?.from ?? event?.area?.center ?? cast.from,
      target: target.id, area: event?.area, amount: gain, before: (before.lowBefore ?? 100) / 100,
      remaining: gain / target.maxHp, kind: style || event?.release || event?.style,
    })
    else if (!derived && bardArt(cast)) showBardBeat(battle, cast, "heal", target, {
      from: event?.from ?? event?.area?.center ?? cast.from, target: target.id, area: event?.area, amount: gain,
      kind: event?.release || style || event?.style,
    })
    else if (!derived && dancerArt(cast)) showDancerBeat(battle, cast, "benefit", target, {
      from: event?.intercept ?? event?.area?.center ?? event?.from ?? owner, target: target.id, amount: gain, kind: "heal", area: event?.area,
    })
    else if (!resolvedTraitArt(cast.signature?.id) && !life) cue(battle, "heal", owner, target)
  }
  const overheal = total - gain
  let historicHealed: number | undefined
  let healCountBefore: number | undefined
  if (life) {
    const counts = cast.lifeHealCounts ??= new Map<EdgeUnitId, number>()
    const previous = counts.get(target.id) ?? 0
    healCountBefore = previous
    if (gain > 0) {
      counts.set(target.id, previous + 1)
      cast.lifeFirstHeal ??= target.id
    }
    if (life.motif === "rootbond") (cast.lifeOverflow ??= new Map()).set(target.id, overheal)
    if (life.motif === "rewind" && style === "historic") {
      const historyGains = cast.lifeHistoric ??= new Map()
      historicHealed = (historyGains.get(target.id) ?? 0) + gain
      historyGains.set(target.id, historicHealed)
    }
    showLifeBeat(battle, cast, "heal", target, { from: event?.intercept ?? event?.area?.center ?? event?.from ?? cast.lifeLaunch,
      target: target.id, amount: gain, remaining: overheal, kind: style, area: event?.area,
      beat: event?.healTick ?? cast.stage, count: event?.healCount,
    })
  }
  const extra = gain - Math.min(missing, limit, Math.round(amount))
  if (extra > 0) {
    if (healerArt(cast) || bardArt(cast)) before.amount = extra
    for (const confirm of before.mendConfirmed ?? []) confirm()
  }
  const settled = { ...before, kind: "heal", amount: gain, overheal, historicHealed, healCountBefore }
  emit(battle, settled)
  if (style !== "bank" && settled.overheal > 0 && (life?.motif !== "rootbond" || style === "share"))
    storeOverheal(battle, target, settled.overheal)
  if (overflowShield && overheal > 0) shield(battle, cast, target, Math.min(overheal, overflowShield.cap), overflowShield.duration,
    healerArt(cast) ? { ...eventFor(cast, "ward", target, event), style: "overflow" } : event, derived)
  return gain
}

export function shield(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, amount: number, duration: number, event?: SkillEvent, derived = false) {
  if (!target.hp || amount <= 0) return false
  const owner = unitOf(battle, cast.owner) ?? target
  const incoming: SkillEvent = { ...eventFor(cast, "ward", target, event), raw: amount, derived, bonus: 0, scale: 1, wardConfirmed: undefined }
  emit(battle, incoming)
  const value = Math.round((amount + (incoming.bonus ?? 0)) * (incoming.scale ?? 1))
  if (target.shieldUntil > battle.time && target.shield > value) return false
  const previous = battle.runtime.shieldCasts.get(target.id)
  if (previous && previous !== cast && (paladinArt(previous)?.motif === "oathshield" || spellArt(previous)?.motif === "hollow" ||
    ["leafward", "seed", "twinbud", "mirrorbud"].includes(lifeArt(previous)?.motif ?? ""))) {
    for (const watch of battle.runtime.watches) if (watch.cast === previous && watch.target === target.id) watch.uses = 0
  }
  if (previous && previous !== cast && paladinArt(previous)?.motif === "bloomward") {
    battle.runtime.buffs = battle.runtime.buffs.filter((buff) => buff.cast !== previous || buff.target !== target.id || buff.style !== "ownabsorb")
  }
  if (previous && previous !== cast && spellArt(previous)?.motif === "antiphase")
    battle.runtime.buffs = battle.runtime.buffs.filter((buff) => buff.cast !== previous || buff.target !== target.id || buff.style !== "spellshield")
  target.shield = value
  target.shieldStart = value
  target.shieldHalf = false
  target.shieldUntil = battle.time + duration
  battle.runtime.shieldCasts.set(target.id, cast)
  cast.used.add("shield")
  if (!derived) {
    const record = traceAt(cast, target)
    record.shield = true
    record.shieldValue = value
    if (wardenArt(cast) || paladinArt(cast) || warlockArt(cast) || dancerArt(cast) || bardArt(cast) ||
      binderArt(cast)?.motif === "crossWind") cast.firstWard ??= target.id
    cast.protection ??= { target: target.id, kind: "shield", duration }
  }
  const from = event?.summon ? cast.from : owner
  impact(battle, from, target, value, "shield")
  if (!derived && bulwarkArt(cast)) showBulwarkBeat(battle, cast, "shield", target, {
    amount: value, from: event?.kind === "move" ? event.from : from, other: event?.at, area: event?.area, target: target.id,
  })
  else if (!derived && wardenArt(cast)) showWardenBeat(battle, cast, "shield", target, { from, target: target.id, area: event?.area })
  else if (!derived && berserkerArt(cast)) showBerserkerBeat(battle, cast, "shield", target, { from, target: target.id, amount: value })
  else if (!derived && paladinArt(cast)) showPaladinBeat(battle, cast, "shield", target, {
    from: event?.intercept ?? cast.paladinLaunch ?? event?.area?.center ?? from,
    target: target.id, amount: value, kind: event?.style, area: event?.area,
  })
  else if (!derived && spellArt(cast)) showSpellBeat(battle, cast, "shield", target, {
    from: event?.from ?? from, target: target.id, amount: value, kind: event?.style,
  })
  else if (!derived && warlockArt(cast)) showWarlockBeat(battle, cast, "shield", target, {
    from: event?.from ?? cast.from, target: target.id, amount: value,
  })
  else if (!derived && lifeArt(cast)) showLifeBeat(battle, cast, "shield", target, {
    from: event?.intercept ?? event?.area?.center ?? cast.lifeLaunch ?? owner, target: target.id, amount: value, duration,
  })
  else if (!derived && assassinArt(cast)) showAssassinBeat(battle, cast, "shield", target, {
    from: cast.assassinContact ?? owner, target: target.id, amount: value,
  })
  else if (!derived && healerArt(cast)) showHealerBeat(battle, cast, "shield", target, {
    from: event?.intercept ?? event?.from ?? event?.area?.center ?? cast.from,
    target: target.id, area: event?.area, amount: value, remaining: value / target.maxHp, kind: event?.style,
  })
  else if (!derived && bardArt(cast)) showBardBeat(battle, cast, "shield", target, {
    from: event?.from ?? event?.area?.center ?? cast.from, target: target.id, area: event?.area, amount: value,
    kind: event?.release || event?.style,
  })
  else if (!derived && dancerArt(cast)) showDancerBeat(battle, cast, "benefit", target, {
    from: event?.intercept ?? event?.area?.center ?? event?.from ?? owner, target: target.id, amount: value, kind: "shield", area: event?.area,
  })
  else if (!resolvedTraitArt(cast.signature?.id)) cue(battle, "shield", owner, target, from)
  if (healerArt(cast) || bardArt(cast)) incoming.amount = Math.max(0, value - Math.round(amount))
  for (const confirm of incoming.wardConfirmed ?? []) confirm()
  emit(battle, { ...eventFor(cast, "shield", target, event), amount: value, derived })
  return true
}

function strikeShield(
  battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, amount: number, event?: SkillEvent,
  derived = false, afterDamage?: (() => void)[],
) {
  if (!target.shield || target.shieldUntil <= battle.time || amount <= 0) return 0
  const before = target.shield
  const initial = target.shieldStart ?? before
  const guard = battle.runtime.shieldCasts.get(target.id)
  const absorbed = Math.min(before, amount)
  target.shield -= absorbed
  if (guard && absorbed) showBulwarkBeat(battle, guard, "absorb", target, {
    from: event?.from ?? cast.from, amount: absorbed, remaining: target.shield / (guard.trace.get(target.id)?.shieldValue || before),
  })
  if (guard && absorbed > 0) showPaladinBeat(battle, guard, "ward", target, {
    from: event?.from ?? cast.from, amount: absorbed, target: target.id, kind: target.shield > 0 ? "absorb" : "break",
  })
  if (guard && absorbed > 0) showSpellBeat(battle, guard, "ward", target, {
    from: event?.from ?? cast.from, amount: absorbed, target: target.id, kind: target.shield > 0 ? "absorb" : "break",
  })
  if (guard && absorbed > 0) showAssassinBeat(battle, guard, "ward", target, {
    from: event?.from ?? cast.from, amount: absorbed, target: target.id, kind: target.shield > 0 ? "absorb" : "break",
  })
  if (guard && absorbed > 0) showWarlockBeat(battle, guard, "ward", target, {
    from: event?.from ?? cast.from, amount: absorbed, target: target.id, kind: target.shield > 0 ? "absorb" : "break",
  })
  if (guard && absorbed > 0) showLifeBeat(battle, guard, "ward", target, {
    from: event?.from ?? cast.from, amount: absorbed, target: target.id,
    remaining: target.shield / Math.max(1, initial), kind: target.shield > 0 ? "absorb" : "break",
  })
  if (guard && absorbed > 0) showHealerBeat(battle, guard, "release", target, {
    from: event?.from ?? cast.from, amount: absorbed, target: target.id,
    remaining: target.shield / Math.max(1, initial), kind: target.shield > 0 ? "absorb" : "break",
  })
  const settled = (run: () => void) => {
    if (afterDamage) afterDamage.push(run)
    else run()
  }
  if (guard?.signature?.id === "berserker/E/P3" && absorbed > 0 && friendly(battle, guard.owner, target.id) && !friendly(battle, cast.owner, target.id)) {
    settled(() => {
      if (target.hp) emit(battle, { ...eventFor(guard, "absorbshield", target, event), from: event?.from ?? cast.from,
        amount: absorbed, attacker: cast.owner, derived: false })
    })
  }
  const spellOwned = guard && battleFighters(battle).some((unit) => unit.id === guard.owner && combatHasRole(unit, "spellbreaker"))
  if (guard && spellOwned && absorbed > 0 && event?.direct && cast.order !== "basic" && !friendly(battle, guard.owner, cast.owner)) {
    settled(() => emit(battle, { ...eventFor(guard, "absorbshield", target, event), attackCast: cast,
      amount: absorbed, attacker: cast.owner, style: "spellabsorb", derived: false }))
  }
  if (guard && absorbed > 0 && guard.owner === target.id && !friendly(battle, guard.owner, cast.owner) &&
    binderTraitReady(battle, target, "binder/C/P5")) {
    settled(() => {
      if (target.hp) emit(battle, { ...eventFor(guard, "absorbshield", target, event), attackCast: cast,
        amount: absorbed, attacker: cast.owner, from: event?.from ?? cast.from, style: "binderAbsorb", derived: false })
    })
  }
  if (!target.shieldHalf && before >= initial * .5 && target.shield < initial * .5) {
    target.shieldHalf = true
    settled(() => emit(battle, { ...eventFor(cast, "protect", target, event), style: "halfshield", amount: absorbed, derived }))
  }
  if (!target.shield) {
    battle.runtime.shieldCasts.delete(target.id)
    settled(() => {
      if (guard) consumeTrait(battle, guard, target, target, cast.from, event)
      emit(battle, { ...eventFor(cast, "break", target, event), amount: absorbed, shieldOwner: guard?.owner, brokenShield: guard, derived })
      if (guard && guard.id !== cast.id) {
        emit(battle, { ...eventFor(guard, "break", target, event), attacker: cast.owner, amount: absorbed, shieldOwner: guard.owner,
          guardBreak: true, brokenShield: guard, derived })
      }
    })
  }
  return absorbed
}

function down(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit) {
  target.move = null
  target.force = null
  const track = battle.runtime.histories.get(target.id)
  if (track) {
    track.binderFold = undefined
    track.danceStep = undefined
  }
  if (target === battle.boss) battle.telegraph = null
  else target.telegraph = null
  if (isSummonId(target.id)) {
    const fallen = markSummonDestroyed(battle, target)
    if (fallen && fallen.group.dismissedAt === undefined) {
      const { group, body, plan } = fallen
      const hit = eventFor(cast, "death", target)
      for (const [i, action] of (plan.actions ?? []).entries()) {
        if (action.reaction?.on === "destroy") runSummonAction(battle, group, body, i, hit)
      }
      emit(battle, { ...eventFor(group.deployment.cast, "assist"), at: point(body), summon: body.id, style: "broken" })
    }
    return
  }
  emit(battle, eventFor(cast, "death", target))
  if (battle.preview || battle.finishedAt !== null) return
  const allyAlive = battle.team.some((member) => member.hp)
  const enemyAlive = battle.sparring ? battle.sparring.rivals.some((member) => member.hp) : battle.boss.hp > 0
  if (!allyAlive || !enemyAlive) finishEdgeBattle(battle, !allyAlive && !enemyAlive ? "draw" : allyAlive ? "won" : "lost")
}

export function finishEdgeBattle(battle: EdgeBattle, phase: "won" | "lost" | "draw") {
  battle.phase = phase
  battle.finishedAt = battle.time
  battle.telegraph = null
  battle.runtime.pending = []
  battle.runtime.fields = []
  battle.runtime.watches = []
  battle.runtime.buffs = []
  battle.runtime.pendingLifeHeals = []
  for (const history of battle.runtime.histories.values()) {
    history.binderFold = undefined
    history.danceStep = undefined
  }
  for (const unit of nodes(battle)) {
    unit.move = null
    unit.force = null
    unit.telegraph = null
  }
  battle.runtime.effects = battle.runtime.effects.map(effect =>
    effect.lifebringer?.cue === "arm" || effect.lifebringer?.cue === "shield" || effect.dancer?.cue === "travel" ||
      effect.healer?.cue === "prepare" || effect.healer?.cue === "flight"
      ? { ...effect, end: Math.min(effect.end, battle.time + .36) } : effect)
  battle.runtime.visuals = battle.runtime.visuals.filter(area => area.phase === "impact")
  for (const group of battle.runtime.summons) dismissSummon(group, battle.time)
}

export function firstCrossing(area: EdgeArea, from: EdgePoint, to: EdgePoint, spacing = 15) {
  const axis = direction(from, to)
  const length = edgeDistance(from, to)
  const steps = Math.max(1, Math.ceil(length / spacing))
  for (let i = 0; i <= steps; i++) {
    const at = along(from, axis, i * length / steps)
    if (areaHits(area, at)) return at
  }
}

function paladinRetort(battle: EdgeBattle, cast: SkillCast, defender: EdgeUnit, attacker: EdgeUnit, multiplier: number, event: SkillEvent) {
  if (!attacker.hp || friendly(battle, defender.id, attacker.id) || activeBuffs(battle, attacker.id, "phase").length) return false
  const impacts = battle.impacts.length
  const raw = cast.basis * multiplier
  damageUnit(battle, cast, attacker, raw, { ...event, from: point(defender) }, true, "reflect")
  const amount = battle.impacts.slice(impacts).filter((hit) => hit.target === attacker.id && (hit.kind === "hit" || hit.kind === "block"))
    .reduce((sum, hit) => sum + hit.amount, 0)
  if (!amount) return false
  showPaladinBeat(battle, cast, "retort", attacker, { from: defender, target: attacker.id, amount, other: defender })
  emit(battle, { ...eventFor(cast, "assist", defender, event), attacker: attacker.id, amount, style: "reflect", derived: false })
  return true
}

function spellReply(battle: EdgeBattle, cast: SkillCast, defender: EdgeUnit, attacker: EdgeUnit, raw: number, event: SkillEvent) {
  if (!attacker.hp || friendly(battle, defender.id, attacker.id) || raw <= 0) return 0
  const start = battle.impacts.length
  damageUnit(battle, cast, attacker, raw, { ...event, from: point(defender) }, true, "reflect")
  const amount = battle.impacts.slice(start).filter((hit) => hit.target === attacker.id && (hit.kind === "hit" || hit.kind === "block"))
    .reduce((total, hit) => total + hit.amount, 0)
  if (amount <= 0) return 0
  showSpellBeat(battle, cast, "retort", attacker, { from: defender, target: attacker.id, amount, other: defender })
  emit(battle, { ...eventFor(cast, "assist", defender, event), attacker: attacker.id, from: point(defender),
    landing: point(attacker), amount, style: "reflect", derived: false })
  return amount
}

export interface DirectHitForecast {
  guards: Set<Buff>
  splits: Map<Buff, number>
  fields: Map<FieldEffect, number>
  summons: Map<EdgeUnitId, number>
  cover: Map<EdgeUnitId, number>
  saves: Set<string>
  contacts: Set<string>
  notes: Set<Buff>
  linkedGuard?: LinkedGuardForecast
}

export interface LinkedGuardForecast {
  added?: SummonGroup
  removed?: SummonGroup
  bodies: Map<EdgeUnitId, { at: EdgePoint; hp: number }>
}

export function directHitForecast(): DirectHitForecast {
  return { guards: new Set(), splits: new Map(), fields: new Map(), summons: new Map(), cover: new Map(), saves: new Set(),
    contacts: new Set(), notes: new Set() }
}

function directGuard(battle: EdgeBattle, source: EdgeUnit, target: EdgeUnit, order: SkillCast["order"], damage: number,
  at: EdgePoint = target, time = battle.time, spent?: DirectHitForecast) {
  const hostile = !friendly(battle, source.id, target.id)
  const stop = (buff: Buff) => Math.min(damage * ratio(buff.values[0]), buff.style === "accord" ? target.maxHp * ratio(buff.values[2]) : Infinity)
  const best = activeBuffs(battle, target.id, "guard", time).filter((b) => !spent?.guards.has(b) && (!b.style || b.style === "parapet" ||
    b.style === "skill" && order !== "basic" || b.style === "ranged" && source.range >= 200 ||
    (b.style === "votive" || b.style === "accord") && hostile ||
    b.style === "spellranged" && source.range >= 200 && hostile ||
    (b.style === "spellpush" || b.style === "spellburst") && order !== "basic" && hostile))
    .sort((a, b) => stop(b) - stop(a))[0]
  const cover = damage > 0 && hostile && isFighter(target) ? battle.runtime.fields.find((field) => {
    if (field.mode !== "cover" || field.until <= time || field.seen.has(target.id) || spent?.fields.has(field)) return false
    const owner = unitOf(battle, field.cast.owner)
    return !!owner?.hp && friendly(battle, owner.id, target.id) && edgeDistance(owner, at) <= field.step.selector.size[0]
  }) : undefined
  const covered = cover ? damage * ratio(cover.step.operations.find((op) => op.kind === "guard")?.args[0] ?? 0) : 0
  const guarded = best ? stop(best) : 0
  return cover && covered > guarded ? { cover, blocked: covered } : { best, blocked: guarded }
}

function damageScreen(battle: EdgeBattle, field: FieldEffect, source: EdgeUnit, target: EdgeUnit, from: EdgePoint,
  order: SkillCast["order"], direct: boolean, at: EdgePoint = target, time = battle.time) {
  if (field.until <= time || field.capacity <= 0 || !friendly(battle, field.cast.owner, target.id)) return
  if (field.mode === "guard" && areaHits(field.area, at)) return { percent: 100, crossing: undefined }
  if (field.mode !== "wall" || bulwarkArt(field.cast) && !direct ||
    spellArt(field.cast) && (!direct || order === "basic" || friendly(battle, source.id, target.id))) return
  const crossing = firstCrossing(field.area, bulwarkArt(field.cast) ? from : source, at)
  if (crossing) return { crossing, percent: field.step.operations.find((op) => op.kind === "guard")?.args[0] ?? 100 }
}

function armorDamage(battle: EdgeBattle, target: EdgeUnit, amount: number, resistance: number, time = battle.time) {
  const armor = Math.max(0, target.armor - ratio(modifier(battle, target, "armor", undefined, undefined, undefined, time)))
  return amount * (1 - armor) * (1 - ratio(resistance)) * (isOutside(target) ? EXILE.received : 1)
}

function damageShare(battle: EdgeBattle, target: EdgeUnit, damage: number, time = battle.time, spent?: ReadonlyMap<Buff, number>) {
  return activeBuffs(battle, target.id, "split", time).flatMap((buff) => {
    const protector = unitOf(battle, buff.cast.owner)
    if (!protector?.hp || protector.id === target.id) return []
    const cap = buff.values[2] ? protector.maxHp * ratio(buff.values[2]) : Infinity
    const share = Math.min(damage * ratio(spent?.get(buff) ?? buff.values[0]), cap)
    return share > 0 || !spent ? [{ buff, protector, share }] : []
  }).sort((a, b) => b.share - a.share)[0]
}

function defeatGuard(battle: EdgeBattle, target: EdgeUnit, after: number, time = battle.time, spent?: ReadonlySet<string>,
  planned?: readonly Buff[]) {
  const current = activeBuffs(battle, target.id, "defy", time)
  const available = planned?.length ? [...current.filter(buff => !planned.some(aid => aid.id === buff.id && aid.cast.owner === buff.cast.owner)),
    ...planned.filter(aid => aid.until > time)] : current
  const saves = available.flatMap(buff => {
    const floor = Math.max(1, Math.round(target.maxHp * ratio(buff.values[0])))
    return after < floor && target.hp >= floor && !target.once.has(buff.id) && !spent?.has(buff.id) ? [{ buff, floor }] : []
  })
  return saves.find(({ buff }) => healerArt(buff.cast)?.motif === "rescueWindow") ?? saves[0]
}

// Estimate a direct hit from defenses already on the board. Reactions still
// resolve in combat and the next order is chosen from the resulting state.
export function estimateDirectHit(battle: EdgeBattle, source: EdgeUnit, target: EdgeUnit, power: number,
  order: SkillCast["order"], at: EdgePoint, impact: number, shield = target.shieldUntil > impact ? target.shield : 0,
  { cast, hp = target.hp, guard = 0, spent, controlled = false, defy, zone = false }:
    { cast?: SkillCast; hp?: number; guard?: number; spent?: DirectHitForecast; controlled?: boolean;
      defy?: readonly Buff[]; zone?: boolean } = {}) {
  const stat = (unit: EdgeUnit, kind: string, other?: EdgeUnit) => modifier(battle, unit, kind, other, order, undefined, impact)
  const receiver = at === target ? target : { ...target, ...at }
  const key = cast && spent ? cast.id + "/" + target.id : undefined
  let scale = !cast || !zone && !cast.summon && cast.used.has("manual") && !cast.trace.get(target.id)?.effectiveHits && !(key && spent?.contacts.has(key))
    ? roleDamageScale(battle, source, receiver, impact) : 1
  if (controlled) scale = Math.max(scale, 1 + ratio(WARDEN_CONTROL.follow))
  const weakness = Math.max(stat(source, "weak"), ...activeBuffs(battle, source.id, "weak", impact).filter(buff =>
    buff.style === "other" && friendly(battle, buff.cast.owner, target.id) && buff.cast.owner !== target.id).map(buff => buff.values[0]))
  const note = cast && activeBuffs(battle, source.id, "q", impact).filter(buff => !spent?.notes.has(buff) &&
    (order === "basic" ? buff.style !== "manual" || cast.used.has("manual") : order === "skill" && !cast.summon && buff.style === "manual"))
    .sort((a, b) => b.values[0] - a.values[0])[0]
  if (note) spent?.notes.add(note)
  const counter = (cast ? [cast.paladinVow, cast.spellReversal, order === "basic" ? cast.spellBasic : undefined] : []).reduce((value, effect) =>
    effect && friendly(battle, effect.cast.owner, target.id) ? value * effect.scale : value, 1)
  const raw = ((cast?.basis ?? source.attack) * power + (note ? note.values[0] * note.cast.basis : 0)) *
    (cast && order === "basic" ? 1 + ratio(stat(source, "ampq", target)) : 1) * scale * counter *
    (1 + ratio(stat(source, "amp", target))) * (1 + ratio(stat(receiver, "vuln"))) * (1 - ratio(weakness)) *
    (1 + ratio(cast?.warlockSteady?.value ?? 0)) *
    ((cast?.outside ?? isOutside(source)) ? EXILE.damage : 1)
  const split = damageShare(battle, target, raw, impact, spent?.splits)
  if (split && spent) spent.splits.set(split.buff, split.buff.values[3] && !spent.splits.has(split.buff) ? split.buff.values[3] : 0)
  const forecast = spent?.linkedGuard
  const summon = !split && (battle.runtime.summons.length || forecast?.added)
    ? coveringSummon(battle, source, target, order, at, impact, spent?.summons, forecast) : undefined
  const intercepted = split?.share ?? (summon ? Math.min(summon.hp, raw * summon.guard.share) : 0)
  if (summon && spent && intercepted > 0) {
    spent.summons.set(summon.group.deployment.bodies[0].id, impact + summon.guard.cooldown)
    const projected = forecast?.bodies.get(summon.body.id)
    if (projected) projected.hp -= Math.round(armorDamage(battle, summon.body, intercepted, 0, impact))
  }
  let hit = armorDamage(battle, receiver, raw - intercepted, stat(receiver, "res", source), impact)
  if (bulwarkStance(battle, receiver, "bulwark/UC/P1")) hit *= .92
  const defense = directGuard(battle, source, target, order, hit, at, impact, spent)
  const blocked = defense.blocked
  const aidBlocked = hit * ratio(guard)
  let damage = hit - Math.max(blocked, aidBlocked)
  if (spent && blocked > 0 && blocked >= aidBlocked) {
    if (defense.cover) spent.fields.set(defense.cover, 0)
    else if (defense.best) spent.guards.add(defense.best)
  }
  for (const field of battle.runtime.fields) {
    const capacity = spent?.fields.get(field) ?? field.capacity
    if (damage <= 0 || capacity <= 0) continue
    const screen = damageScreen(battle, field, source, target, cast?.from ?? source, order, true, at, impact)
    if (!screen) continue
    const absorbed = Math.min(capacity, damage * ratio(screen.percent))
    if (spent) spent.fields.set(field, field.mode === "wall" ? 0 : capacity - absorbed)
    damage -= absorbed
  }
  damage = Math.max(0, Math.round(damage))
  const shieldLoss = Math.min(shield, damage)
  let hpLoss = damage - shieldLoss
  const protector = hpLoss && nearbyBulwark(battle, target, at, impact, spent?.cover)
  if (protector) {
    if (spent) spent.cover.set(protector.id, impact + BULWARK_COVER.cooldown)
    hpLoss -= Math.round(hpLoss * ratio(BULWARK_COVER.share))
  }
  let saveHeal = 0
  const save = hpLoss > 0 && defeatGuard(battle, hp === target.hp ? target : { ...target, hp }, hp - hpLoss, impact, spent?.saves, defy)
  if (save) {
    spent?.saves.add(save.buff.id)
    hpLoss = hp - save.floor
    const percent = save.buff.values[2] ?? 0
    if (percent > 0) {
      const owner = unitOf(battle, save.buff.cast.owner) ?? target
      const { received, healingAmp, recovery } = healFactors(battle, owner, target, false, impact)
      const healing = Math.round(target.maxHp * ratio(percent) * (1 + ratio(received)) * (1 + ratio(healingAmp)) * recovery)
      saveHeal = Math.max(0, Math.min(target.maxHp - save.floor, healing))
    }
  }
  if (key && (hpLoss > 0 || shieldLoss > 0)) spent?.contacts.add(key)
  return { hit, shieldLoss, hpLoss: Math.min(hp, hpLoss), lethal: hpLoss >= hp, saved: !!save, saveHeal, usedAidGuard: aidBlocked > blocked }
}

function healthDamage(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, amount: number, event: SkillEvent, transferred = false) {
  if (!target.hp || amount <= 0) return { lost: 0, absorbed: 0 }
  const source = unitOf(battle, cast.owner) ?? target
  const resistance = modifier(battle, target, "res", source, cast.order, cast)
  let damage = armorDamage(battle, target, amount, resistance) * (1 - (isFighter(target) ? target.growth?.reduction ?? 0 : 0))
  const incomingFrom = event.from ?? cast.from
  const afterDamage: (() => void)[] = []
  let backlash: (() => void) | undefined
  if (damage > 0 && isFighter(target)) {
    const buff = activeBuffs(battle, target.id, "res").find((entry) =>
      entry.values[0] === resistance && resolvedTraitArt(entry.cast.signature?.id))
    const field = !buff && battle.runtime.fields.find((entry) => entry.mode === "hold" && entry.until > battle.time &&
      friendly(battle, entry.cast.owner, target.id) && areaHits(entry.area, target) && resolvedTraitArt(entry.cast.signature?.id) &&
      entry.step.operations.some((op) => op.kind === "res" && op.args[0] === resistance))
    if (buff) showDefenderTrait(battle, buff.cast, "stance", target, event)
    else if (field) showDefenderTrait(battle, field.cast, "stance", target, event, { area: field.area, from: field.area.center })
    const current = !buff && target.passives.find((passive) => resolvedTraitArt(passive.id) &&
      passive.steps[0]?.operations.some((op) => op.kind === "res" && op.args[0] === resistance &&
        (!op.style || op.style === "skill" && cast.order !== "basic" || op.style === "ranged" && source.range >= 200)) &&
      passiveStance(battle, target, passive, source, cast))
    if (current) showDefenderStance(battle, target, current.id, target, event)
    if (bulwarkStance(battle, target, "bulwark/UC/P1")) {
      damage *= .92
      showDefenderStance(battle, target, "bulwark/UC/P1", target, event)
    }
    if (transferred && bulwarkStance(battle, target, "bulwark/L/P6")) {
      damage *= .90
      showDefenderStance(battle, target, "bulwark/L/P6", target, { ...event, from: unitOf(battle, event.target) ?? source })
    }
  }
  if (resistance > 0 && damage > 0 && event.direct && !transferred) {
    const buff = activeBuffs(battle, target.id, "res").find((item) => item.values[0] === resistance && bulwarkArt(item.cast))
    const march = !buff && battle.runtime.fields.find((field) => bulwarkArt(field.cast)?.motif === "phalanx" && field.mode === "hold" &&
      field.until > battle.time && friendly(battle, field.cast.owner, target.id) && areaHits(field.area, target) &&
      field.step.operations.some((op) => op.kind === "res" && op.args[0] === resistance))
    const protection = buff?.cast ?? (march ? march.cast : undefined)
    if (protection) {
      const blocked = damage * resistance / (100 - resistance)
      showBulwarkBeat(battle, protection, "brace", target, { from: incomingFrom, amount: blocked, area: march ? march.area : undefined })
      if (march && !march.seen.has(target.id)) {
        march.seen.add(target.id)
        emit(battle, { ...eventFor(march.cast, "protect", target, event), zone: true, style: "zone", amount: blocked, attacker: source.id })
      }
    }
    const flag = battle.runtime.fields.find((field) => paladinArt(field.cast)?.motif === "banner" && field.until > battle.time &&
      field.step.operations.some((op) => op.kind === "res" && op.args[0] === resistance) &&
      select(battle, field.cast, field.step.selector, undefined, field.area).includes(target))
    if (flag) showPaladinBeat(battle, flag.cast, "ward", target, { from: incomingFrom, area: flag.area,
      target: target.id, amount: damage * resistance / (100 - resistance), kind: "banner" })
  }
  if (resistance && isFighter(target) && source.range >= 200 && event.direct && !transferred) {
    const brace = activeBuffs(battle, target.id, "res").find((buff) =>
      buff.cast.signature?.id === "ranger/C/P7" && buff.values[0] === resistance)
    if (brace?.cast.signature) showRangerPassive(battle, target, brace.cast.signature.id, brace.cast.signature.mark,
      "stance", cast.from, target, target, event)
  }
  if (event.direct && !transferred) {
    const incoming: SkillEvent = { ...event, kind: "receive", target: target.id, bonus: 0, scale: 1, raw: damage }
    emit(battle, incoming)
    damage = Math.max(0, (damage + (incoming.bonus ?? 0)) * (incoming.scale ?? 1))
    const { best, cover, blocked } = directGuard(battle, source, target, cast.order, damage)
    if (cover) {
      damage -= blocked
      cover.seen.add(target.id)
      showBulwarkBeat(battle, cover.cast, "brace", target, { from: incomingFrom, amount: blocked, area: cover.area })
      emit(battle, { ...eventFor(cover.cast, "protect", target, event), amount: blocked, zone: true, style: "guard", attacker: source.id })
      const returnHit = cover.step.operations.find((op) => op.kind === "d")
      if (returnHit) backlash = () => {
        const aim = point(source)
        if (!source.hp) return
        damageUnit(battle, cover.cast, source, cover.cast.basis * returnHit.args[0], event, true, "reflect")
        showBulwarkBeat(battle, cover.cast, "strike", aim, { from: target, contacts: [aim] })
      }
    } else if (best && damage > 0) {
      damage -= blocked
      remove(battle, best)
      consumeTrait(battle, best.cast, target, target, source, incoming)
      const wall = best.style === "parapet"
      const counter = wall && !friendly(battle, source.id, target.id) && edgeDistance(source, target) <= 220
      const holy = paladinArt(best.cast)
      const breaker = spellArt(best.cast)
      const drum = dancerArt(best.cast)?.motif === "stopDrum"
      const medic = healerArt(best.cast)
      const bard = bardArt(best.cast)
      const protectedHit = { ...eventFor(best.cast, "protect", target, event), amount: bulwarkArt(best.cast) || wardenArt(best.cast) || holy || breaker || drum || medic || bard ? blocked : damage,
        style: "guard", attacker: source.id, attackCast: cast, from: bard ? incomingFrom : event.from,
        zone: wall || event.zone, push: counter ? best.values[2] : undefined, axis: counter ? direction(best.cast.aim, source) : undefined }
      showBulwarkBeat(battle, best.cast, "brace", target, { from: incomingFrom, amount: blocked, other: wall ? best.cast.aim : undefined })
      showWardenBeat(battle, best.cast, "brace", target, { from: incomingFrom, target: target.id, axis: direction(incomingFrom, target) })
      if (berserkerArt(best.cast)?.motif === "grit") showBerserkerBeat(battle, best.cast, "guard", target, {
        from: incomingFrom, target: target.id, amount: blocked,
      })
      if (dancerArt(best.cast)) showDancerBeat(battle, best.cast, "release", target, {
        from: incomingFrom, target: target.id, amount: blocked, kind: "guard",
      })
      if (medic) {
        impact(battle, source, target, blocked, "block")
        showHealerBeat(battle, best.cast, "release", target, { from: incomingFrom, target: target.id, amount: blocked, kind: "guard" })
      }
      if (bard) {
        impact(battle, source, target, blocked, "block")
        showBardBeat(battle, best.cast, "break", target, { from: incomingFrom, target: target.id, amount: blocked, kind: "guard" })
      }
      if (holy) {
        impact(battle, source, target, blocked, "block")
        showPaladinBeat(battle, best.cast, "ward", target, { from: incomingFrom, amount: blocked, target: target.id, kind: best.style })
        if (best.values[3] > 0) backlash = () => {
          if (best.style === "accord" && (cast.paladinReplies ?? 0) >= 3) return
          if (paladinRetort(battle, best.cast, target, source, best.values[3], event) && best.style === "accord")
            cast.paladinReplies = (cast.paladinReplies ?? 0) + 1
        }
      }
      if (breaker) {
        impact(battle, source, target, blocked, "block")
        showSpellBeat(battle, best.cast, "ward", target, { from: incomingFrom, target: target.id, amount: blocked, kind: best.style })
        if (best.style === "spellranged") backlash = () => spellReply(battle, best.cast, target, source, best.cast.basis * best.values[2], event)
        if (best.style === "spellpush") backlash = () => {
          if (!source.hp || edgeDistance(source, target) > best.values[3]) return
          const origin = point(source)
          shoveUnit(battle, best.cast, source, best.values[2], "", event, false, direction(target, source))
          if (source.force?.cause?.id === best.cast.id) showSpellBeat(battle, best.cast, "retort", origin, {
            from: target, paths: [{ at: origin, end: point(source.force.end) }], kind: "push",
          })
        }
        if (best.style === "spellburst") backlash = () => {
          const contacts = nodes(battle).filter((unit) => unit.hp && !friendly(battle, unit.id, best.cast.owner) && edgeDistance(unit, source) <= best.values[3])
            .flatMap((enemy) => spellReply(battle, best.cast, target, enemy, best.cast.basis * best.values[2], event) > 0
              ? [{ id: enemy.id, at: point(enemy) }] : [])
          emit(battle, { ...eventFor(best.cast, "assist", target, event), attacker: source.id, from: point(source),
            hitGroup: contacts, total: contacts.length, style: "countergroup", derived: false })
        }
      }
      if (holy || breaker || drum || medic || bard) afterDamage.push(() => {
        if (!target.hp) return
        emit(battle, protectedHit)
        if (bard?.motif === "rescueSymphony") emit(battle, {
          ...eventFor(best.cast, "assist", target), attacker: target.id, from: incomingFrom, style: "bardGuard", amount: blocked,
        })
      })
      else emit(battle, protectedHit)
      if (best.cast.skill?.id === "bulwark/C/A3") afterDamage.push(() => {
        if (target.hp) emit(battle, { ...protectedHit, style: "shoulder" })
      })
      if (counter) backlash = () => {
        const from = point(source)
        shoveUnit(battle, best.cast, source, protectedHit.push ?? 0, "", undefined, false, protectedHit.axis)
        if (source.force?.cause?.id === best.cast.id) {
          const end = point(source.force.end)
          for (const beat of protectedHit.passiveBeats ?? []) beat.landing = end
          showBulwarkBeat(battle, best.cast, "strike", from, { from: best.cast.aim, contacts: [from], landings: [end] })
        }
      }
    }
  }
  for (const field of battle.runtime.fields) {
    const screen = damageScreen(battle, field, source, target, incomingFrom, cast.order, !!event.direct)
    if (!screen) continue
    const { crossing, percent } = screen
    const isWall = field.mode === "wall"
    const blocked = Math.min(damage * ratio(percent), field.capacity)
    if (blocked <= 0) continue
    field.capacity -= blocked
    damage -= blocked
    impact(battle, source, target, blocked, "block")
    const initial = (unitOf(battle, field.cast.owner)?.maxHp ?? 1) * ratio(field.step.operations.find((op) => op.kind === "wall")?.args[0] ?? 100)
    showBulwarkBeat(battle, field.cast, "crossing", crossing ?? target, {
      from: incomingFrom, other: target, area: field.area, amount: blocked, remaining: isWall ? 0 : field.capacity / initial,
    })
    showSpellBeat(battle, field.cast, "ward", crossing ?? target, { from: incomingFrom, other: target, area: field.area, amount: blocked, kind: "curtain" })
    if (!field.seen.has(target.id)) {
      field.seen.add(target.id)
      const protectedHit = { ...eventFor(field.cast, "protect", target, event), amount: blocked, area: field.area,
        zone: true, style: field.mode, attacker: source.id, attackCast: cast, intercept: crossing }
      if (spellArt(field.cast)) afterDamage.push(() => { if (target.hp) emit(battle, protectedHit) })
      else emit(battle, protectedHit)
      if (field.cast.skill?.id === "bulwark/Prismatic/A3") afterDamage.push(() => {
        if (target.hp) emit(battle, { ...protectedHit, style: "wallafter" })
      })
    }
    if (field.mode === "wall" || field.capacity <= 0) field.until = battle.time
  }
  damage = Math.max(0, Math.round(damage))
  const before = target.hp
  const absorbed = strikeShield(battle, cast, target, damage, event, event.derived, afterDamage)
  const protector = event.direct && !transferred && damage > absorbed && !friendly(battle, source.id, target.id)
    ? nearbyBulwark(battle, target) : undefined
  const covered = protector ? Math.round((damage - absorbed) * ratio(BULWARK_COVER.share)) : 0
  let finalHp = Math.max(0, before - damage + absorbed + covered)
  const protection = !transferred && event.direct ? defeatGuard(battle, target, finalHp) : undefined
  const save = protection?.buff
  if (protection && save) {
    finalHp = protection.floor
    target.once.add(save.id)
    remove(battle, save)
  }
  target.hp = finalHp
  const lost = before - finalHp
  const critical = !transferred && event.critical
  if (absorbed) impact(battle, source, target, absorbed, "block", critical && lost <= 0)
  if (lost > 0) {
    const track = history(battle, target)
    track.wounds.push({ time: battle.time, amount: lost })
    impact(battle, event.summon ? cast.from : event.style === "reflect" && paladinArt(cast) ? incomingFrom : source, target, lost, "hit", critical)
  }
  if (protector && covered > 0) {
    protector.passiveAt[BULWARK_COVER.id] = battle.time + BULWARK_COVER.cooldown
    cue(battle, "shield", protector, target)
    impact(battle, protector, target, covered, "block")
    flash(battle, protector.id, BULWARK_COVER.name, false)
    const coverCast = newCast(battle, protector, "skill", target, target)
    healthDamage(battle, cast, protector, covered, event, true)
    emit(battle, { ...eventFor(coverCast, "protect", target), amount: covered, style: BULWARK_COVER.id, attacker: source.id, attackCast: cast })
  }
  for (const after of afterDamage) after()
  if (save) {
    const saved = { ...eventFor(save.cast, "save", target, event), amount: lost, attacker: source.id }
    if (berserkerArt(save.cast)?.motif === "laststand") showBerserkerBeat(battle, save.cast, "save", target, {
      from: incomingFrom, target: target.id, amount: target.hp, other: point(source),
    })
    showHealerBeat(battle, save.cast, "save", target, { from: incomingFrom, target: target.id, amount: lost, before: 1 / target.maxHp })
    emit(battle, saved)
    if (save.values[2] > 0) heal(battle, save.cast, target, target.maxHp * ratio(save.values[2]), "save", event)
    if (save.values[3] > 0) applyStep(battle, save.cast, {
      delay: 0, selector: parseSelector("eC130@v"), operations: [{ kind: "d", args: [save.values[3]], style: "reflect" }],
    }, saved, true)
  }
  growthSurvive(battle, target)
  growthHurt(battle, target, lost)
  if (!target.hp) down(battle, cast, target)
  if (battle.finishedAt === null) backlash?.()
  return { lost, absorbed }
}

export function damageUnit(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, raw: number, base?: SkillEvent, derived = false, style = "") {
  const source = unitOf(battle, cast.owner)
  if (!source || !target.hp || raw <= 0) return 0
  const event: SkillEvent = { ...eventFor(cast, "strike", target, base), raw, lowBefore: hpPct(target),
    direct: !derived && style !== "dot", derived, style: style || base?.style, zone: base?.zone || base?.style === "zone",
    bonus: 0, scale: 1, push: undefined, axis: undefined, strikeConfirmed: undefined }
  if (cast.warlockSteady && event.direct && !friendly(battle, source.id, target.id)) event.scale = 1 + ratio(cast.warlockSteady.value)
  const manualContact = event.direct && cast.used.has("manual") && !cast.summon && !event.zone && !event.release && !friendly(battle, source.id, target.id)
  if (manualContact && !cast.used.has("handStarted")) {
    cast.used.add("handStarted")
    cast.previousHandTarget = history(battle, source).lastHandTarget
  }
  let dose: Buff | undefined
  let guidance: Buff | undefined
  let note: Buff | undefined
  let ampq = 0
  if (cast.order === "basic" && !derived) {
    note = spendBuff(battle, source, "q", target, cast.from, event, (buff) => buff.style !== "manual" || cast.used.has("manual"))
    if (note) event.bonus = note.values[0] * note.cast.basis
    ampq = modifier(battle, source, "ampq", target)
    event.scale = 1 + ratio(ampq)
    dose = spendBuff(battle, source, "ampq", target, cast.from, undefined, (buff) => buff.style !== "lasting")
    guidance = spendBuff(battle, source, "qr", target, cast.from)
    if (guidance && cast.used.has("bardReach/" + guidance.cast.id)) event.bardGuide = guidance.cast
  } else if (event.direct && cast.skill && !cast.summon && cast.order === "skill" && !friendly(battle, source.id, target.id)) {
    const bonus = spendBuff(battle, source, "q", target, cast.from, event, (buff) => buff.style === "manual")
    if (bonus) event.bonus = bonus.values[0] * bonus.cast.basis
  }
  emit(battle, event)
  const pendingPush = () => {
    if (!event.push || event.push <= 0) return
    cast.extraPush.set(target.id, { length: event.push, axis: event.axis, wardenRelay: event.wardenRelay, assassinRelay: event.assassinRelay,
      berserkerPush: event.berserkerPush, bardPushes: event.bardPushes, passiveBeats: event.passiveBeats })
    later(battle, 0.01, () => {
      const extra = cast.extraPush.get(target.id)
      if (!extra) return
      cast.extraPush.delete(target.id)
      shoveUnit(battle, cast, target, extra.length, "", event, true, extra.axis)
    })
  }
  if (!event.berserkerPush?.length && !event.bardPushes?.length) pendingPush()
  let weakness = modifier(battle, source, "weak")
  const mark = event.direct && style !== "reflect" && !friendly(battle, source.id, target.id) && activeBuffs(battle, source.id, "weak")
    .filter((buff) => buff.style === "other" && friendly(battle, buff.cast.owner, target.id) && buff.cast.owner !== target.id)
    .sort((a, b) => b.values[0] - a.values[0])[0]
  if (mark && mark.values[0] >= weakness) {
    weakness = mark.values[0]
    remove(battle, mark)
    showBulwarkBeat(battle, mark.cast, "weak", target, { from: event.from ?? cast.from, amount: raw * ratio(weakness) })
  }
  const roleScale = manualContact && !cast.trace.get(target.id)?.effectiveHits ? roleDamageScale(battle, source, target) : 1
  let baseDamage = Math.max(0, (raw + (event.bonus ?? 0)) * (event.scale ?? 1) * roleScale *
    (1 + ratio(modifier(battle, source, "amp", target))) * (1 + ratio(modifier(battle, target, "vuln"))) *
    (1 - ratio(weakness)) * (cast.outside ? EXILE.damage : 1))
  const stats = manualContact && !cast.signature && isFighter(source) ? source.card.stats : undefined
  if (baseDamage > 0 && stats && battle.random() < stats.crit / 100) {
    event.critical = true
    baseDamage *= stats.critDamage
  }
  const vow = event.direct && cast.paladinVow && friendly(battle, cast.paladinVow.cast.owner, target.id) ? cast.paladinVow : undefined
  const reversed = event.direct && cast.spellReversal && friendly(battle, cast.spellReversal.cast.owner, target.id) ? cast.spellReversal : undefined
  const dulled = event.direct && cast.order === "basic" && cast.spellBasic && friendly(battle, cast.spellBasic.cast.owner, target.id) ? cast.spellBasic : undefined
  const real = baseDamage * (vow?.scale ?? 1) * (reversed?.scale ?? 1) * (dulled?.scale ?? 1)
  if (dulled && baseDamage > real) showSpellBeat(battle, dulled.cast, "ward", target, {
    from: cast.from, target: target.id, amount: baseDamage * (1 - dulled.scale), kind: "basic",
  })
  if (vow && baseDamage > real) showPaladinBeat(battle, vow.cast, "ward", target, {
    from: event.from ?? cast.from, amount: baseDamage * (1 - vow.scale), target: target.id, kind: "vow",
  })
  const eligible = event.direct ? damageShare(battle, target, real) : undefined
  const guardian = event.direct && !eligible && !isSummonId(target.id) ? coveringSummon(battle, source, target, cast.order) : undefined
  const guarded = guardian ? Math.min(real * guardian.guard.share, guardian.body.hp) : 0
  if (guardian && guarded > 0) {
    const { group, body, guard } = guardian
    group.deployment.bodies[0].actionAt = battle.time + guard.cooldown
    body.pulseAt = battle.time
    group.deployment.cast.stage++
    showSummonBeat(battle, group, body, "cover", {
      to: target, other: source, intercept: guardian.intercept, contacts: [point(target)], outcome: "shield",
      beat: group.deployment.cast.stage,
    })
    healthDamage(battle, cast, body, guarded, event, true)
  }
  const priorShield = battle.runtime.shieldCasts.get(target.id)
  const outcome = healthDamage(battle, cast, target, real - (eligible?.share ?? 0) - guarded, event)
  growthHit(battle, source, target, cast, outcome.lost, !!event.direct,
    (owner, victim, raw) => damageUnit(battle, owner === source ? cast : newCast(battle, owner, "skill", victim, victim), victim, raw, undefined, true, "growth"),
    amount => { if (target.hp) shoveUnit(battle, cast, target, amount, "", event, true) })
  const growthAttacker = cast.summon
    ? cast.summon.deployment.bodies.find(body => body.id === (cast.summonBody ?? event.summon)) : source
  growthRetaliate(battle, growthAttacker, target, outcome.lost, !!event.direct && event.style !== "reflect",
    (defender, attacker, raw) => damageUnit(battle, newCast(battle, defender, "skill", attacker, attacker), attacker, raw, undefined, true, "growth"))
  if ((event.berserkerPush?.length || event.bardPushes?.length) && outcome.lost + outcome.absorbed > 0) pendingPush()
  if (dose && berserkerArt(dose.cast)?.motif === "numb" && outcome.lost + outcome.absorbed > 0) {
    showBerserkerBeat(battle, dose.cast, "cash", target, { from: cast.from, target: target.id, beat: 2 })
  }
  if (guardian && guarded > 0) {
    const { group, body } = guardian
    emit(battle, { ...eventFor(group.deployment.cast, "assist", target), from: point(body), summon: body.id, amount: guarded, style: group.deployment.kind })
  }
  if (eligible && eligible.share > 0) {
    const [, duration, cap, secondShare] = eligible.buff.values
    if (secondShare) eligible.buff.values = [secondShare, duration, cap]
    else remove(battle, eligible.buff)
    showBulwarkBeat(battle, eligible.buff.cast, "share", target, { from: event.from ?? cast.from, other: eligible.protector,
      amount: eligible.share, remaining: eligible.share / real })
    healthDamage(battle, cast, eligible.protector, eligible.share, event, true)
    showHealerBeat(battle, eligible.buff.cast, "split", target, {
      from: event.from ?? cast.from, other: eligible.protector, target: target.id,
      amount: eligible.share, remaining: eligible.share / real,
    })
    emit(battle, { ...eventFor(eligible.buff.cast, "redirect", target, event), source: eligible.protector.id, amount: eligible.share, style: "share" })
  }
  if (!derived) {
    const trace = traceAt(cast, target)
    trace.hits++
    if (outcome.lost + outcome.absorbed > 0 && (event.direct || berserkerArt(cast) || paladinArt(cast))) trace.effectiveHits = (trace.effectiveHits ?? 0) + 1
    trace.at = point(target)
    trace.hitAt = battle.time
    trace.damage += outcome.lost
    cast.hitStages.add(cast.stage)
    cast.damage += outcome.lost
    const past = history(battle, target)
    past.hitAt = battle.time
    past.hitBy = source.id
    past.attackers.add(source.id)
    if (manualContact && isFighter(source) && outcome.lost + outcome.absorbed > 0) {
      const attackers = past.handAttackers ??= new Map()
      attackers.set(source.id, point(cast.from))
    }
    if (cast.order === "basic" && (outcome.lost || outcome.absorbed)) {
      const contact = history(battle, source)
      contact.lastBasicTarget = target.id
      if (battle.sparring && manualContact && isFighter(target)) {
        const prior = contact.blockedBasic
        const repeated = prior?.target === target.id && battle.time - prior.at <= blockedBasicWindow(source)
        contact.blockedBasic = outcome.lost ? undefined : { target: target.id, at: battle.time, count: repeated ? prior.count + 1 : 1 }
      }
    }
  }
  if (manualContact && isFighter(source) && combatHasRole(source, "spellbreaker") && isFighter(target) &&
    target.hp && battle.finishedAt === null && outcome.lost + outcome.absorbed > 0 && !cast.used.has("healcut")) {
    cast.used.add("healcut")
    addBuff(battle, cast, target, "healcut", HEAL_CUT.duration, [HEAL_CUT.amount])
  }
  const result: SkillEvent = { ...event, kind: "hit", amount: outcome.lost, absorbed: outcome.absorbed,
    critical: event.critical && outcome.lost + outcome.absorbed > 0 }
  if (vow && baseDamage > real) emit(battle, {
    ...eventFor(vow.cast, "protect", target, event), attacker: source.id, style: "vow", amount: baseDamage * (1 - vow.scale),
    from: event.from ?? cast.from,
  })
  if (reversed && baseDamage > real) {
    emit(battle, { ...eventFor(reversed.cast, "protect", target, event), attacker: source.id, attackCast: cast,
      amount: baseDamage * (vow?.scale ?? 1) * (1 - reversed.scale), style: "spellreverse", from: event.from ?? cast.from })
    showSpellBeat(battle, reversed.cast, "ward", target, { from: cast.from, target: target.id,
      amount: baseDamage * (vow?.scale ?? 1) * (1 - reversed.scale), kind: "reverse" })
    const key = "spellReply/" + reversed.cast.id
    if (!cast.used.has(key)) {
      cast.used.add(key)
      spellReply(battle, reversed.cast, target, source, reversed.cast.basis * .55, event)
    }
  }
  if (dulled && baseDamage > real) emit(battle, { ...eventFor(dulled.cast, "protect", target, event),
    attacker: source.id, attackCast: cast, amount: baseDamage * (1 - dulled.scale), style: "spellbasic" })
  if (cast.order === "basic" && !derived && outcome.lost + outcome.absorbed > 0) {
    const echo = activeBuffs(battle, source.id, "ampq").find((buff) =>
      buff.style === "lasting" && buff.values[0] === modifier(battle, source, "ampq", target))
    if (echo) showDefenderTrait(battle, echo.cast, "stance", target, result, { from: cast.from, contacts: [point(target)] })
  }
  if (!derived && outcome.lost + outcome.absorbed > 0) {
    const amount = outcome.lost + outcome.absorbed
    if (event.strikeConfirmed?.length) {
      event.amount = amount
      for (const confirm of event.strikeConfirmed) confirm()
    }
    if (bardArt(cast)) showBardBeat(battle, cast, "hit", target, {
      from: event.from ?? cast.from, area: event.area, target: target.id, amount, kind: event.release ?? event.style,
    })
    finishBardStrike(battle, result, target)
    if (cast.used.has("manual") && cast.order === "basic") {
      if (note && bardArt(note.cast)) {
        showBardBeat(battle, note.cast, "release", target, { from: cast.from, target: target.id, kind: "q", amount: note.values[0] * note.cast.basis })
        emit(battle, { ...eventFor(note.cast, "assist", target, result), attacker: source.id, attackCast: cast,
          from: cast.from, style: "bardNote", amount,
        })
      }
      if (dose && dose.values[0] === ampq && bardArt(dose.cast)) {
        showBardBeat(battle, dose.cast, "release", target, { from: cast.from, target: target.id, kind: "ampq", amount: ampq })
        emit(battle, { ...eventFor(dose.cast, "assist", source, result), attacker: source.id, attackCast: cast,
          from: point(target), style: "bardRally", amount })
      }
      if (guidance && bardArt(guidance.cast)) {
        const used = cast.used.has("bardReach/" + guidance.cast.id)
        showBardBeat(battle, guidance.cast, "release", target, { from: cast.from, target: target.id,
          kind: used ? "reach" : "qr", amount: used ? guidance.values[0] : 0, other: source,
        })
        if (used) emit(battle, { ...eventFor(guidance.cast, "assist", target, result), attacker: source.id,
          attackCast: cast, from: cast.from, style: "bardRange", amount: guidance.values[0],
        })
      }
      const range = cast.bardRange
      if (range) {
        showBardBeat(battle, range.cast, "release", target, { from: range.at, target: target.id, area: range.area,
          kind: "reach", amount: range.amount, other: source })
        emit(battle, { ...eventFor(range.cast, "assist", target, result), attacker: source.id, attackCast: cast,
          from: range.at, area: range.area, zone: true, style: "bardFieldRange", amount: range.amount,
        })
      }
    }
    if (dancerArt(cast)?.motif === "counterSwing") cast.danceFirstHit ??= target.id
    if (cast.warlockSteady && event.direct && !cast.used.has("mageSteadyShown")) {
      cast.used.add("mageSteadyShown")
      showDefenderTrait(battle, cast.warlockSteady.cast, "consume", source, result, { from: event.from ?? cast.from, to: target, contacts: [point(target)] })
    }
    for (const aid of cast.warlockAid ?? []) {
      const key = "mageAid/" + aid.cast.owner + "/" + aid.cast.id + "/" + aid.recipient + "/" + target.id
      const recipient = unitOf(battle, aid.recipient)
      if (aid.target !== target.id || cast.used.has(key) || !recipient?.hp) continue
      cast.used.add(key)
      emit(battle, { ...eventFor(aid.cast, "assist", recipient), from: point(target), attackCast: cast, style: "mageAid", amount: outcome.lost + outcome.absorbed })
    }
    const contact = cast.trace.get(target.id)
    if (contact && !contact.firstAxis) contact.firstAxis = direction(event.from ?? cast.from, target)
    if (manualContact && !cast.used.has("handSettled")) {
      cast.used.add("handSettled")
      history(battle, source).lastHandTarget = target.id
    }
  }
  emit(battle, result)
  emit(battle, { ...result, kind: "hurt" })
  if (outcome.lost) emit(battle, { ...result, kind: "life" })
  if (target.hp && event.direct) {
    const returned = (outcome.lost > 0 || outcome.absorbed > 0) && spendBuff(battle, target, "returnhp", undefined, undefined, event,
      (buff) => buff.style === "ownabsorb" ? priorShield === buff.cast && outcome.absorbed > 0 && !friendly(battle, source.id, target.id) : outcome.lost > 0)
    if (returned) {
      const warded = returned.style === "ownabsorb"
      const amount = Math.min((warded ? outcome.absorbed : outcome.lost) * ratio(returned.values[0]), target.maxHp * ratio(returned.values[2] ?? 100))
      showHealerBeat(battle, returned.cast, "release", target, {
        from: event.from ?? cast.from, target: target.id, amount: outcome.lost, remaining: amount / target.maxHp, kind: "refund",
      })
      heal(battle, returned.cast, target, amount, warded ? "historic" : returned.style || "historic",
        warded ? { ...event, from: point(target), attacker: source.id } : event)
    }
  }
  if (event.direct) {
    const reflected = spendBuff(battle, target, "reflect", undefined, undefined, event, (buff) =>
      buff.style === "spellshield" ? cast.order !== "basic" && priorShield === buff.cast && outcome.absorbed > 0 &&
        !friendly(battle, source.id, target.id) : target.hp > 0)
    if (reflected && source.hp) {
      const reflectAmount = reflected.style === "shield" || reflected.style === "spellshield" ? Math.min(outcome.absorbed * ratio(reflected.values[0]), (reflected.values[2] ?? Infinity) * reflected.cast.basis)
        : reflected.values[0] * reflected.cast.basis
      if (reflected.style === "spellshield") spellReply(battle, reflected.cast, target, source, reflectAmount, event)
      else {
        damageUnit(battle, reflected.cast, source, reflectAmount, event, true, "reflect")
        emit(battle, { ...eventFor(reflected.cast, "assist", target, event), source: reflected.cast.owner, style: "reflect", amount: reflectAmount })
      }
    }
  }
  return outcome.lost
}

export function positionUnit(battle: EdgeBattle, actor: EdgeUnit, position: EdgePoint, cause?: SkillCast) {
  const previous = point(actor)
  const wasOutside = isOutside(actor)
  const outside = isOutside(position)
  const from = wasOutside !== outside ? point(actor) : undefined
  Object.assign(actor, position)
  if (cause && actor.force?.cause === cause && actor.force.route && dancerArt(cause)?.motif === "threadCut")
    dancerSweep(battle, cause, previous, actor)
  if (cause?.used.has("manual") && actor.force?.cause === cause && actor.force.kind === "push") {
    for (const field of [...battle.runtime.fields]) {
      if (field.mode !== "shadowpush" || field.until <= battle.time || field.seen.has(actor.id) ||
        actor.id !== field.cast.target || cause.owner === field.cast.owner || !friendly(battle, cause.owner, field.cast.owner)) continue
      const intercept = shadowPushCrossing(field.area, previous, actor, 15)
      if (!intercept) continue
      field.seen.add(actor.id)
      field.until = Math.min(field.until, battle.time + .3)
      const beforeHits = field.cast.trace.get(actor.id)?.effectiveHits ?? 0
      applyStep(battle, field.cast, field.step, { ...eventFor(cause, "forcedland", actor),
        at: intercept, from: previous, attackCast: cause, zone: true, style: "zone" }, false, field.area, [actor])
      const partner = unitOf(battle, cause.owner)
      if (partner?.hp && (field.cast.trace.get(actor.id)?.effectiveHits ?? 0) > beforeHits) emit(battle, {
        ...eventFor(field.cast, "assist", partner), attackCast: cause, assassinEnemy: actor.id,
        from: intercept, amount: 1, style: "shadowpit",
      })
    }
  }
  if (wasOutside !== outside) {
    if (outside) {
      actor.guardUntil = battle.time + EXILE.guard
      const track = battle.runtime.histories.get(actor.id)
      if (track?.wardenInside) track.wardenInside = false
    }
    cue(battle, outside ? "exit" : "return", actor, actor)
    const cast = cause ?? newCast(battle, actor, "enemy")
    const intercept = from && (outside ? fieldCrossing(from, position) : fieldCrossing(position, from))
    if (!outside && isFighter(actor)) {
      const track = history(battle, actor)
      track.returnedAt = battle.time
      if (!cause && actor.move && !actor.force && track.moveReturning) {
        track.danceReturns = (track.danceReturns ?? 0) + 1
        track.danceReturnedAt = battle.time
      }
    }
    emit(battle, { ...eventFor(cast, outside ? "exit" : "return", actor), from, landing: point(position), intercept })
  }
  const charge = chargeOf(battle, actor)
  if (charge) {
    const length = edgeDistance(charge.from, charge.to)
    charge.from = point(actor)
    charge.to = along(actor, charge.direction, length)
  }
  if (cause && actor.force?.cause === cause && actor.force.kind === "push" && actor.hp) {
    for (const field of battle.runtime.fields) {
      const binder = unitOf(battle, field.cast.owner)
      if (!binderTraitReady(battle, binder, "binder/E/P7") || !binderArt(field.cast) || field.until <= battle.time ||
        field.cast.owner === cause.owner || !friendly(battle, field.cast.owner, cause.owner) || friendly(battle, field.cast.owner, actor.id) ||
        areaHits(field.area, previous) || !areaHits(field.area, actor)) continue
      const partner = unitOf(battle, cause.owner)
      if (!partner?.hp) continue
      const contact = firstCrossing(field.area, previous, actor, 1) ?? point(actor)
      emit(battle, { ...eventFor(field.cast, "assist", partner), style: "binderEntry", attackCast: cause,
        area: field.area, at: contact, intercept: contact })
    }
  }
}

export function forceTo(battle: EdgeBattle, target: EdgeUnit, end: EdgePoint, duration: number, keepDestination = false, cause?: SkillCast, route?: DancerPath): EdgeUnit["force"] {
  if (battle.finishedAt !== null || !target.hp || edgeDistance(target, end) < 3) return null
  const crossing = !isOutside(target) && isOutside(end)
  if (!keepDestination || crossing) target.move = null
  const travel = duration + (crossing ? 0.14 : 0)
  if (target.force?.route) {
    const prior = target.force.cause
    battle.runtime.buffs = battle.runtime.buffs.filter(buff => buff.target !== target.id || buff.cast !== prior || buff.style !== "danceglide")
  }
  target.force = { start: point(target), end, since: battle.time, duration: travel, cause, route }
  const track = history(battle, target)
  track.standAt = battle.time + travel
  track.binderFold = undefined
  if (!keepDestination || crossing || !target.move) track.danceStep = undefined
  return target.force
}

function interrupt(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, event?: SkillEvent, derived = false) {
  const charge = chargeOf(battle, target)
  if (!target.hp || !charge) return
  if (!derived) showBulwarkBeat(battle, cast, "interrupt", target, { from: charge.to })
  if (!derived) showWardenBeat(battle, cast, "interrupt", target, { from: charge.to, axis: charge.direction, target: target.id })
  if (!derived) showSpellBeat(battle, cast, "interrupt", target, { from: charge.to, target: target.id, axis: charge.direction })
  if (!derived) showAssassinBeat(battle, cast, "interrupt", target, { from: charge.to, target: target.id, axis: charge.direction })
  if (!derived) showWarlockBeat(battle, cast, "interrupt", target, { from: charge.to, target: target.id, axis: charge.direction })
  if (target === battle.boss) battle.telegraph = null
  else target.telegraph = null
  const track = history(battle, target)
  track.interruptAt = battle.time
  track.interruptBy = cast.owner
  track.interruptSkill = !derived && cast.used.has("manual") && !cast.signature ? cast.skill : undefined
  const owner = unitOf(battle, cast.owner)
  const prior = owner && history(battle, owner)
  const previousInterrupt = prior?.lastInterruptTarget
  if (!derived && prior) prior.lastInterruptTarget = target.id
  if (!derived) (cast.interrupted ??= new Set()).add(target.id)
  notice(battle, "冲撞打断")
  emit(battle, { ...eventFor(cast, "interrupt", target, event), derived, previousInterrupt })
}

export function finishForcedMovement(battle: EdgeBattle, unit: EdgeUnit, motion: NonNullable<EdgeUnit["force"]>) {
  const cast = motion.cause
  const distance = edgeDistance(motion.start, unit)
  if (!cast || !unit.hp || distance < 3) return
  if (cast.owner === unit.id && cast.order !== "basic") history(battle, unit).skillMovedAt = battle.time
  if (motion.kind === "push") dancerRailLanding(battle, unit, motion.start)
  emit(battle, { ...eventFor(cast, "forcedland", unit), from: motion.start, landing: point(unit), distance, style: motion.kind })
  const owner = unitOf(battle, cast.owner)
  if (owner && isFighter(owner) && combatHasRole(owner, "warden") && cast.order === "skill" && cast.used.has("manual") &&
    (motion.kind === "push" || motion.kind === "pull") && distance >= WARDEN_CONTROL.distance &&
    battle.finishedAt === null && unit.hp && !isSummonId(unit.id) && !friendly(battle, owner.id, unit.id)) {
    const control = newCast(battle, owner, "skill", unit, unit)
    addBuff(battle, control, unit, "slow", WARDEN_CONTROL.duration, [WARDEN_CONTROL.slow], WARDEN_CONTROL.style)
    emit(battle, { ...eventFor(control, "alter", unit), style: "slow", proc: WARDEN_CONTROL.style, amount: WARDEN_CONTROL.slow })
  }
  if (motion.kind === "push" && owner && isFighter(owner) && combatHasRole(owner, "assassin") && !friendly(battle, owner.id, unit.id)) {
    const partner = alliesOf(battle, owner.id).filter((ally) => ally.hp && ally !== owner &&
      edgeDistance(ally, unit) - edgeDistance(ally, motion.start) >= 100)
      .sort((a, b) => edgeDistance(a, motion.start) - edgeDistance(b, motion.start))[0]
    if (partner) emit(battle, { ...eventFor(cast, "assist", partner), assassinEnemy: unit.id, from: motion.start,
      landing: point(unit), amount: edgeDistance(partner, unit) - edgeDistance(partner, motion.start), style: "shadowclear" })
  }
}

function pushVector(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, style: string, event?: SkillEvent) {
  const lane = berserkerArt(cast)?.line ? cast.berserkerRoute : undefined
  const axis = direction(lane?.from ?? cast.from, lane?.to ?? cast.aim)
  const center = event?.area && event.selector?.shape && "CNSXJ".includes(event.selector.shape) ? event.area.center : cast.from
  switch (style) {
    case "in": return direction(target, CENTER)
    case "out": return direction(CENTER, target)
    case "edge": return outward(target)
    case "back": return along(blank, outward(target), -1)
    case "axis": return axis
    case "eventaxis": return event?.axis ?? axis
    case "rotate": return rotate(event?.axis ?? axis, 60)
    case "opposite": return along(blank, event?.axis ?? axis, -1)
    case "returnaxe": return along(blank, axis, -1)
    case "left": return left(axis)
    case "right": return along(blank, left(axis), -1)
    case "side": {
      const across = left(axis)
      const offset = (target.x - (event?.area?.center.x ?? cast.from.x)) * across.x + (target.y - (event?.area?.center.y ?? cast.from.y)) * across.y
      return along(blank, across, offset > 0 ? 1 : -1)
    }
    case "anchor": return direction(cast.aim, target)
    case "toward": return direction(target, cast.aim)
    case "circle": {
      const origins = event?.area?.parts.flatMap((part) => part.kind === "circle" ? [part.center] : []) ?? []
      const nearest = origins.sort((a, b) => edgeDistance(target, a) - edgeDistance(target, b))[0]
      return direction(nearest ?? center, target)
    }
    case "pull": return direction(target, center)
    case "trace": return direction(target, battle.runtime.histories.get(target.id)?.from ?? target)
    case "rewind": {
      const trace = cast.trace.get(target.id)
      return trace?.approach ? direction(trace.at, trace.approach) : direction(cast.from, target)
    }
    case "target": return direction(refUnit(battle, cast, "t", event) ?? center, target)
    case "event": return direction(event?.at ?? center, target)
    case "from": return direction(cast.berserkerRoute?.to ?? unitOf(battle, cast.owner) ?? center, target)
    case "avoidally": return direction(nearestDanceAlly(battle, cast.owner, target) ?? cast.from, target)
    default: return direction(center, target)
  }
}

function shoveEnd(battle: EdgeBattle, target: EdgeUnit, axis: EdgePoint, length: number, incoming?: SkillEvent, impactAt = battle.time, brace = 0) {
  let anti = Math.max(brace, modifier(battle, target, "anti", undefined, undefined, undefined, impactAt))
  let activeBrace: SkillCast | undefined
  let protection: SkillCast | undefined
  let sharedScreen: SkillCast | undefined
  let usesLeft: number | undefined
  if (incoming) {
    const bonded = incoming.cast.paladinBrace?.get(target.id)
    if (bonded && length > 0) {
      incoming.cast.paladinBrace?.delete(target.id)
      if (bonded.value > anti) {
        anti = bonded.value
        sharedScreen = bonded.cast
      }
    }
    const brace = activeBuffs(battle, target.id, "anti").find((buff) => buff.style === "once" && buff.values[0] === anti)
    if (brace) {
      remove(battle, brace)
      const uses = (brace.values[2] ?? 1) - 1
      if (uses > 0) battle.runtime.buffs.push({ ...brace, values: [brace.values[0], brace.values[1], uses] })
      activeBrace = brace.cast
      protection = brace.cast
      usesLeft = uses
      consumeTrait(battle, brace.cast, target, target, incoming.from ?? incoming.cast.from, incoming)
      if (dancerArt(brace.cast)) showDancerBeat(battle, brace.cast, "release", target, {
        from: incoming.from ?? incoming.cast.from, target: target.id, kind: "brace",
      })
      showHealerBeat(battle, brace.cast, "release", target, {
        from: incoming.from ?? incoming.cast.from, target: target.id, kind: "anti", amount: length * ratio(anti),
      })
    } else if (anti > 0 && !sharedScreen) {
      const buff = activeBuffs(battle, target.id, "anti").find((item) =>
        item.values[0] === anti && summonTraitArt(item.cast.signature?.id))
      const owner = buff && unitOf(battle, buff.cast.owner)
      if (buff && owner && isFighter(owner)) showSummonTrait(battle, owner, buff.cast, "stance", target, target, incoming)
      activeBrace = activeBuffs(battle, target.id, "anti").find((item) => item.values[0] === anti && bulwarkArt(item.cast))?.cast ??
        battle.runtime.fields.find((field) => field.mode === "hold" && bulwarkArt(field.cast)?.motif === "phalanx" &&
          field.until > battle.time && areaHits(field.area, target) && friendly(battle, field.cast.owner, target.id) &&
          field.step.operations.some((op) => op.kind === "anti" && op.args[0] === anti))?.cast
      if (bulwarkArt(activeBrace ?? incoming.cast)?.motif === "wedges" && activeBrace) protection = activeBrace
      const timedArmor = !activeBrace && activeBuffs(battle, target.id, "anti").find((item) =>
        item.values[0] === anti && resolvedTraitArt(item.cast.signature?.id))
      const ward = !activeBrace && !timedArmor && battle.runtime.fields.find((field) =>
        field.mode === "hold" && field.until > battle.time && friendly(battle, field.cast.owner, target.id) &&
        areaHits(field.area, target) && resolvedTraitArt(field.cast.signature?.id) &&
        field.step.operations.some((op) => op.kind === "anti" && op.args[0] === anti))
      if (timedArmor) showDefenderTrait(battle, timedArmor.cast, "stance", target, incoming)
      else if (ward) showDefenderTrait(battle, ward.cast, "stance", target, incoming, { area: ward.area, from: ward.area.center })
      else if (!activeBrace && isFighter(target)) {
        const passive = target.passives.find((entry) => resolvedTraitArt(entry.id) && entry.steps[0]?.operations.some((op) =>
          op.kind === "anti" && op.args[0] === anti && !op.style) && passiveStance(battle, target, entry))
        if (passive) showDefenderStance(battle, target, passive.id, target, incoming)
        else if (anti === 12) {
          const protector = tailProtector(battle, target)
          if (protector) showDefenderStance(battle, protector, "bulwark/UC/P5", target, incoming)
        } else if (anti === 10) {
          const owner = paladinFrontFlag(battle, target)
          if (owner) showDefenderStance(battle, owner, "paladin/C/P5", target, incoming)
        }
      }
    }
  }
  const scale = (target.guardUntil > impactAt ? EXILE.push : 1) * (1 - ratio(anti))
  const push = length * scale
  const crossing = !isOutside(target) && isOutside(along(target, axis, push))
  const carry = crossing && bulwarkStance(battle, target, "bulwark/Prismatic/P6")
  const travel = push + (crossing ? EXILE.carry * scale * (carry ? .7 : 1) : 0)
  const limitX = axis.x === 0 ? Infinity : ((axis.x < 0 ? 36 : BOARD.width - 36) - target.x) / axis.x
  const limitY = axis.y === 0 ? Infinity : ((axis.y < 0 ? 56 : BOARD.height - 56) - target.y) / axis.y
  const end = along(target, axis, Math.max(0, Math.min(travel, limitX, limitY)))
  const bracedLanding = (at: EdgePoint) => {
    if (incoming && activeBrace && binderArt(activeBrace)?.motif === "retreatSeal" && edgeDistance(target, at) >= 3)
      showBinderBeat(battle, activeBrace, "release", at, { from: target, target: target.id, kind: "brace" })
    if (sharedScreen && incoming && edgeDistance(target, at) >= 3)
      showDefenderTrait(battle, sharedScreen, "consume", target, incoming, { landings: [point(at)], contacts: [point(target)] })
    if (incoming && activeBrace) showBulwarkBeat(battle, activeBrace, "brace", target, {
      from: along(target, axis, -100), amount: length * ratio(anti), landings: [point(at)], count: usesLeft,
    })
    if (incoming && activeBrace) showWardenBeat(battle, activeBrace, "brace", target, {
      from: incoming.from ?? incoming.cast.from, axis, target: target.id, paths: [{ at: point(target), end: point(at) }],
    })
    if (incoming && activeBrace && edgeDistance(target, at) >= 3) showPaladinBeat(battle, activeBrace, "ward", target, {
      from: incoming.from ?? incoming.cast.from, axis, target: target.id, amount: length * ratio(anti), kind: "anti",
      paths: [{ at: point(target), end: point(at), unit: target.id }],
    })
    if (incoming && carry && isOutside(at)) showDefenderStance(battle, target, "bulwark/Prismatic/P6", target, incoming)
    if (incoming && protection) emit(battle, {
      ...eventFor(protection, "protect", target, incoming), attacker: incoming.source, style: "anti", amount: length * ratio(anti),
      landing: point(at), braceUses: usesLeft === undefined ? undefined : usesLeft + 1,
      motionSeconds: (incoming.motionSeconds ?? .26) + (!isOutside(target) && isOutside(at) ? .14 : 0),
    })
    return at
  }
  const ward = crossing && battle.runtime.fields.find((field) => field.mode === "hold" &&
    field.step.operations.some((op) => op.kind === "exguard") && friendly(battle, field.cast.owner, target.id) &&
    !field.seen.has(target.id) && field.until > impactAt && areaHits(field.area, target))
  const exileGuard = crossing && !ward ? activeBuffs(battle, target.id, "exguard", impactAt)[0] : undefined
  if (ward || exileGuard) {
    const op = ward ? ward.step.operations.find((effect) => effect.kind === "exguard") : undefined
    const safe = inside(end, op?.args[0] ?? exileGuard?.values[0] ?? 18)
    if (incoming) {
      if (ward) ward.seen.add(target.id)
      else if (exileGuard) remove(battle, exileGuard)
      const cast = ward ? ward.cast : exileGuard?.cast
      if (cast) {
        const intercept = fieldCrossing(target, end)
        showWardenBeat(battle, cast, "stop", intercept, {
          from: target, target: target.id, axis, other: end, paths: [{ at: point(target), end: point(safe) }],
        })
        emit(battle, { ...eventFor(cast, "protect", target, incoming), attacker: incoming.source, landing: safe, intercept, style: "exguard" })
      }
      notice(battle, "挡下出界")
    }
    return bracedLanding(safe)
  }
  return bracedLanding(end)
}

export function previewDirectedShove(battle: EdgeBattle, target: EdgeUnit, at: EdgePoint, axis: EdgePoint, length: number, impactAt: number, brace = 0) {
  return shoveEnd(battle, { ...target, ...at }, axis, length, undefined, impactAt, brace)
}

type BinderBend = { axis: EdgePoint; push: number; mode: NonNullable<SkillEvent["binderBend"]>; extra?: boolean } &
  ({ mark: Buff; field?: never } | { field: FieldEffect; mark?: never })

function inverseShoveAxis(center: EdgePoint, target: EdgePoint, axis: EdgePoint) {
  const x = target.x - center.x, y = target.y - center.y
  return x * axis.x + y * axis.y > .01 ? along(blank, axis, -1) : undefined
}

function binderShoveRules(battle: EdgeBattle, event: SkillEvent, target: EdgeUnit, axis: EdgePoint, push: number, at = battle.time) {
  const ballast = battle.runtime.watches.find(watch => watch.until > at && watch.uses > 0 &&
    watch.target === target.id && binderArt(watch.cast)?.motif === "ballast" && friendly(battle, watch.cast.owner, event.source))
  let tangent = false
  if (ballast) {
    const reduction = ballast.step.operations.find(op => op.kind === "addp")?.args[0] ?? 0
    push *= 1 + ratio(reduction)
    const owner = unitOf(battle, ballast.cast.owner)
    if (owner && isFighter(owner) && owner.gold?.id === "binder/R/G2" &&
      (!battle.preview || battle.preview.loadoutFor === owner.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === "binder/R/P3"))) {
      const side = left(outward(target))
      axis = along(blank, side, side.x * axis.x + side.y * axis.y >= 0 ? 1 : -1)
      tangent = true
    }
  }
  const mark = activeBuffs(battle, target.id, "aimp", at).find(buff =>
    binderArt(buff.cast)?.motif === "inwardRail" && friendly(battle, buff.cast.owner, event.source))
  let bend: BinderBend | undefined
  if (mark && edgeDistance(target, CENTER) >= 1) {
    const owner = unitOf(battle, mark.cast.owner)
    const attacker = unitOf(battle, event.source)
    const paired = owner && isFighter(owner) && owner.gold?.id === "binder/E/G2" && attacker?.hp && attacker.hp < attacker.maxHp &&
      binderTraitReady(battle, owner, "binder/E/P3")
    bend = { mark, axis: direction(target, CENTER), push: push + mark.values[0] + (paired ? 36 : 0), mode: "rail", extra: !!paired }
  } else if (event.cast.used.has("manual") && !event.cast.used.has("binderLinkRelay")) {
    for (const field of battle.runtime.fields) {
      if (field.mode !== "shove" || field.until <= at || field.seen.has(target.id) ||
        !friendly(battle, field.cast.owner, event.source) || !areaHits(field.area, target)) continue
      const modifier = field.step.operations.find(op => op.kind === "addp")
      if (!modifier) continue
      const motif = binderArt(field.cast)?.motif
      const center = field.area.center
      if (motif === "pivotGear" && edgeDistance(center, target) >= 1) {
        bend = { field, axis: direction(center, target), push: push + modifier.args[0], mode: "axis" }
      } else if (motif === "slantTide") {
        bend = { field, axis: rotate(axis, 60), push: push + modifier.args[0], mode: "tide" }
      } else if (motif === "inverseField") {
        const inward = inverseShoveAxis(center, target, axis)
        if (inward) bend = { field, axis: inward, push, mode: "inverse" }
      }
      if (bend) break
    }
  }
  return { ballast, bend, tangent: tangent && !bend, axis: bend?.axis ?? axis, push: bend?.push ?? push }
}

function commitBinderShove(battle: EdgeBattle, event: SkillEvent, target: EdgeUnit, motion: NonNullable<EdgeUnit["force"]>,
  oldEnd: EdgePoint, rules: ReturnType<typeof binderShoveRules>) {
  const { ballast, bend } = rules
  const impact = { ...event, landing: point(motion.end), distance: edgeDistance(motion.start, motion.end), binderMotion: motion }
  if (ballast) {
    ballast.uses = 0
    const { cast } = ballast
    showBinderBeat(battle, cast, "release", motion.end, {
      from: motion.start, other: oldEnd, target: target.id, kind: "ballast", duration: motion.duration + .22,
    })
    emit(battle, { ...eventFor(cast, "alter", target, impact), attacker: event.source, style: "bindercatch",
      attackCast: event.cast, binderTangent: rules.tangent })
    const damage = ballast.step.operations.find(op => op.kind === "d")
    if (damage) later(battle, motion.duration, () => {
      if (!target.hp || !motion.completed || target.force || edgeDistance(target, motion.end) >= 3) return
      damageUnit(battle, cast, target, damage.args[0] * cast.basis, undefined, false, "ballast")
      showBinderBeat(battle, cast, "strike", target, { from: motion.start, kind: "ballast" })
    })
  }
  if (bend) {
    const field = bend.field
    const cast = bend.mark?.cast ?? field?.cast
    if (!cast) return
    if (bend.mark) remove(battle, bend.mark)
    if (field) {
      field.seen.add(target.id)
      if (binderArt(cast)?.motif !== "pivotGear") field.until = battle.time
    }
    showBinderBeat(battle, cast, "release", motion.end, {
      from: motion.start, other: oldEnd, area: field?.area, target: target.id,
      kind: bend.mode === "inverse" ? "invert" : "bend", duration: motion.duration + .27,
    })
    const turned = { ...eventFor(cast, "alter", target, impact), attacker: event.source, style: "push", area: field?.area,
      attackCast: event.cast, motionSeconds: motion.duration, binderBend: bend.mode, binderLongRail: bend.extra,
      binderChanged: edgeDistance(direction(motion.start, oldEnd), direction(motion.start, motion.end)) > .04 }
    if (bend.mode === "inverse") recordBinderControl(battle, cast, target)
    emit(battle, turned)
    if (bend.mode === "tide" && !isOutside(motion.start) && isOutside(motion.end)) later(battle, motion.duration, () => {
      if (target.hp && motion.completed && !target.force && edgeDistance(target, motion.end) < 3)
        emit(battle, { ...turned, kind: "pushland", at: point(target), style: "binderTide" })
    })
  }
}

function binderScatterBonus(battle: EdgeBattle, cast: SkillCast) {
  return binderArt(cast)?.motif === "burstWheel" && binderTraitReady(battle, unitOf(battle, cast.owner), "binder/R/P4") ? 25 : 0
}

function dancerPushBonus(battle: EdgeBattle, cast: SkillCast, style: string) {
  if (style !== "avoidally" || dancerArt(cast)?.motif !== "clearLane") return 0
  const owner = unitOf(battle, cast.owner), id = "dancer/R/P4"
  if (!owner?.hp || !isFighter(owner) || battle.preview && (battle.preview.loadoutFor !== owner.id ||
    battle.preview.passiveOnly && battle.preview.passiveOnly !== id)) return 0
  return owner.passives.find(passive => passive.id === id)?.steps[0].operations[0].args[0] ?? 0
}

function areaShove(step: Step) {
  if (step.zone || step.watch || !step.selector.shape || !["e", "k"].includes(step.selector.units)) return
  return step.operations.find(op => op.kind === "p" && op.style !== "pct")
}

function scriptedPushLength(cast: SkillCast, target: EdgeUnit, operation: Operation, event?: SkillEvent) {
  const length = operation.args[0]
  if (operation.style === "pct") return (event?.distance ?? event?.push ?? 0) * ratio(length)
  if (cast.skill?.id === "warden/L/A1" && cast.used.has("warden/L/G1")) return length + 38
  if (cast.skill?.id === "warden/Radiant/A1" && cast.used.has("warden/Radiant/G1") && cast.trace.get(target.id)?.pulledTo) return length + 40
  return length
}

function attachShove(warning: AreaVisual, cast: SkillCast, step: Step, operation = areaShove(step)) {
  if (!operation) return
  warning.shove = { cast, step, operation }
  warning.pushDistance = operation.args[0]
}

function projectedAreaShove(battle: EdgeBattle, cast: SkillCast, step: Step | undefined, operation: Operation, area: EdgeArea | undefined,
  unit: EdgeUnit, at: EdgePoint, time: number, axisAtContact?: EdgePoint, brace = 0, inverse?: EdgePoint) {
  const target = { ...unit, ...at }
  const event = { ...eventFor(cast, "shove", unit), area, selector: step?.selector, axis: axisAtContact }
  let length = scriptedPushLength(cast, unit, operation)
  if (operation.style === "toward") length = Math.min(length, edgeDistance(at, cast.aim))
  length += binderScatterBonus(battle, cast) + dancerPushBonus(battle, cast, operation.style)
  const axis = pushVector(battle, cast, target, operation.style, event)
  const shove = binderShoveRules(battle, event, target, axis, length, time)
  const inward = inverse && !shove.bend && inverseShoveAxis(inverse, at, shove.axis)
  return { end: shoveEnd(battle, target, inward || shove.axis, shove.push, undefined, time, brace),
    push: !inward && shove.bend?.mode !== "inverse" }
}

const basicShove: Operation = { kind: "p", args: [BASIC_PUSH], style: "" }

export function projectedBasicShove(battle: EdgeBattle, cast: SkillCast, unit: EdgeUnit, at: EdgePoint, impact: number, brace = 0) {
  if (!cast.used.has("manual")) return { end: previewDirectedShove(battle, unit, at, direction(cast.from, at), BASIC_PUSH, impact, brace), push: true }
  return projectedAreaShove(battle, cast, undefined, basicShove, undefined, unit, at, impact, undefined, brace)
}

export function previewInverseShove(battle: EdgeBattle, strike: PendingStrike, unit: EdgeUnit, at: EdgePoint, impact: number, center: EdgePoint) {
  const { cast, step } = strike
  if (!cast.used.has("manual") || cast.summon || cast.signature || "area" in strike && strike.limitedPush) return
  const shove = cast.order === "basic" && !isSummonId(unit.id) ? basicShove : step?.operations.find(op => op.kind === "p" && op.style !== "pct")
  if (!shove) return
  const area = "area" in strike ? strike.area : undefined
  const { end: prior } = projectedAreaShove(battle, cast, step, shove, area, unit, at, impact)
  const { end } = projectedAreaShove(battle, cast, step, shove, area, unit, at, impact, undefined, 0, center)
  if (edgeDistance(prior, end) < 3 || edgeDistance(at, end) < 3) return
  return { prior, end, duration: (cast.order === "basic" ? .14 : .26) + (!isOutside(at) && isOutside(end) ? .14 : 0) }
}

export function previewContactShift(battle: EdgeBattle, source: EdgeUnit, skill: EdgeActive, step: Step, aim: EdgePoint,
  area: EdgeArea | undefined, unit: EdgeUnit, at: EdgePoint, impact: number, picked?: EdgeUnit) {
  return projectedContactShift(battle, makeCast(0, source, "skill", aim, picked, skill), step, area, unit, at, impact)
}

export function projectedContactShift(battle: EdgeBattle, cast: SkillCast, step: Step,
  area: EdgeArea | undefined, unit: EdgeUnit, at: EdgePoint, impact: number, axis?: EdgePoint, brace = 0) {
  const movement = step.operations.find(op => (op.kind === "p" || op.kind === "l") && op.style !== "pct")
  if (!movement) return
  const isShove = movement.kind === "p"
  const target = { ...unit, ...at }
  const event = { ...eventFor(cast, "shove", unit), area, selector: step.selector, axis }
  const { end, push } = isShove ? projectedAreaShove(battle, cast, step, movement, area, unit, at, impact, axis, brace)
    : { end: pullLanding(battle, cast, target, movement.args[0], movement.args[1] ?? 0, movement.style, event, impact), push: false }
  if (edgeDistance(at, end) < 3) return
  return { end, push, duration: (isShove ? .26 : .24) + (!isOutside(at) && isOutside(end) ? .14 : 0) }
}

export function shadowPushCrossing(area: EdgeArea, from: EdgePoint, end: EdgePoint, spacing = 4) {
  if (areaHits(area, from)) return
  return firstCrossing(area, from, end, spacing)
}

export function previewWarningShove(battle: EdgeBattle, warning: AreaVisual, unit: EdgeUnit, at: EdgePoint,
  position = unitPosition) {
  const shove = warning.shove
  if (!shove || !skillAreaContains(shove.cast, shove.step.selector.shape, warning.area, at)) return
  const { cast, step, operation } = shove
  const owner = unitOf(battle, cast.owner)
  if (!owner?.hp || assassinArt(cast) && owner.force && owner.force.since + owner.force.duration >= warning.until) return
  const { selector } = step
  if (selector.units === "k" && !cast.trace.get(unit.id)?.hits) return
  if ((selector.limit || selector.flags.length || selector.exclude) &&
    !select(battle, cast, selector, undefined, warning.area, candidate => candidate === unit ? at : position(candidate)).includes(unit)) return
  return projectedAreaShove(battle, cast, step, operation, warning.area, unit, at, warning.until).end
}

const fixedAreaShoves = new WeakMap<EdgeActive, { lead: number; step: Step; operation: Operation; reach: number } | null>()

function fixedAreaShove(skill: EdgeActive) {
  const cached = fixedAreaShoves.get(skill)
  if (cached !== undefined) return cached
  const lead = fixedSkillWindup(skill)
  let push = null
  if (lead !== undefined) for (const step of skill.steps) {
    const operation = areaShove(step)
    if (!operation || operation.args[0] < 100 || operation.style === "in" || operation.style === "back" ||
      step.selector.anchor && step.selector.anchor !== "o" && step.selector.anchor !== "p") continue
    const reach = step.selector.size[0] + (skill.aim.mode === "point" ? skill.aim.range : 0) + 12
    push = { lead, step, operation, reach }
    break
  }
  fixedAreaShoves.set(skill, push)
  return push
}

export const areaEjectionReach = (skill: EdgeActive) => fixedAreaShove(skill)?.reach ?? 0

export function previewAreaEjections(battle: EdgeBattle, owner: EdgeFighter, skill: EdgeActive, aim: EdgePoint,
  castAt: number, position: (unit: EdgeUnit, time: number) => EdgePoint) {
  const push = fixedAreaShove(skill)
  if (!push) return []
  const { lead, step: pushStep, operation } = push
  const origin = { ...owner, ...position(owner, castAt) }
  const aimed = skill.aim.mode === "point" && edgeDistance(origin, aim) > skill.aim.range
    ? along(origin, direction(origin, aim), Math.max(0, skill.aim.range - 1)) : aim
  const target = skill.aim.insideOnly ? inside(aimed, 0) : aimed
  if (isOutside(origin) || !isOnBoard(target) || skillCastProblem(battle, origin, skill, target)) return []
  const cast = makeCast(0, origin, "skill", target, undefined, skill, castAt)
  cast.used.add("manual")
  const area = stepArea(battle, cast, pushStep)
  if (!area) return []
  const first = skill.steps[0]
  const contactAt = castAt + lead + first.delay
  const impact = castAt + lead + pushStep.delay
  const rewind = pushStep.selector.units === "k"
  const pull = first !== pushStep && first.operations.find(op => op.kind === "l")
  if (rewind || pull) {
    const opening = stepArea(battle, cast, first)
    const contacts = select(battle, cast, first.selector, undefined, opening, unit => position(unit, contactAt))
    for (const unit of contacts) {
      const at = position(unit, contactAt)
      const row = traceAt(cast, unit)
      row.at = at
      row.hits = Number(rewind)
      if (rewind) row.approach = battle.runtime.histories.get(unit.id)?.positions.findLast(sample =>
        contactAt - sample.time <= 1 && edgeDistance(at, sample.at) > 12)?.at
      if (pull) row.pulledTo = pullLanding(battle, cast, { ...unit, ...at }, pull.args[0], pull.args[1] ?? 0, pull.style,
        { ...eventFor(cast, "cast", unit), area: opening, selector: first.selector }, contactAt)
    }
  }
  const atImpact = (unit: EdgeUnit) => cast.trace.get(unit.id)?.pulledTo ?? position(unit, impact)
  return select(battle, cast, pushStep.selector, undefined, area, atImpact).flatMap(unit => {
    if (friendly(battle, unit.id, owner.id)) return []
    const at = atImpact(unit)
    if (isOutside(at)) return []
    const { end } = projectedAreaShove(battle, cast, pushStep, operation, area, unit, at, impact)
    return isOutside(end) ? [{ unit, at, end, impact }] : []
  })
}

type BardPush = NonNullable<SkillEvent["bardPushes"]>[number]
type Force = NonNullable<EdgeUnit["force"]>

function bardTurnGold(battle: EdgeBattle, cast: SkillCast, attacker?: EdgeUnitId) {
  const owner = unitOf(battle, cast.owner)
  const id = "bard/R/P2"
  if (!owner?.hp || !isFighter(owner) || attacker === owner.id || owner.gold?.id !== "bard/R/G2" ||
    (owner.passiveAt[id] ?? 0) > battle.time || !owner.passives.some(passive => passive.id === id) ||
    battle.preview && (battle.preview.loadoutFor !== owner.id || battle.preview.passiveOnly && battle.preview.passiveOnly !== id)) return
  return owner.gold
}

function followBardPush(battle: EdgeBattle, part: BardPush, attack: SkillCast, target: EdgeUnit, motion: Force, signed?: SkillCast, next?: () => void) {
  const { cast } = part
  const paths = [{ from: motion.start, to: motion.end, unit: target.id }]
  const corner = signed && attack.trace.get(target.id)?.at
  const launch = { ...eventFor(cast, "assist", target), attacker: attack.owner, attackCast: attack,
    from: motion.start, landing: motion.end, bardTurned: !!signed, bardPartners: corner ? [corner] : undefined,
  }
  cast.stage++
  if (part.watch) part.watch.uses--
  showBardBeat(battle, cast, "flight", motion.end, { from: motion.start, duration: motion.duration, paths, kind: "push" })
  if (signed) showDefenderTrait(battle, signed, "travel", motion.end, launch, {
    from: motion.start, duration: motion.duration, landings: [motion.end], target: target.id,
  })
  later(battle, motion.duration, () => {
    if (!target.hp || !motion.completed || edgeDistance(target, motion.end) > 3) return
    const landing = point(target)
    const event = { ...launch, at: landing, landing, style: bardArt(cast)?.motif === "bowString" ? "bardBowPush" : bardArt(cast)?.motif,
      amount: edgeDistance(motion.start, landing),
    }
    showBardBeat(battle, cast, "land", landing, { from: motion.start, target: target.id, paths, kind: "push", amount: part.amount })
    if (signed) showDefenderTrait(battle, signed, "proc", landing, event, { from: motion.start, target: target.id, landings: [landing] })
    emit(battle, event)
    next?.()
  })
}

function turnBardPushes(battle: EdgeBattle, parts: BardPush[], attack: SkillCast, target: EdgeUnit, index = 0) {
  const part = parts[index]
  if (!part?.turn || !target.hp || target.force) return
  const from = point(target)
  const pivot = unitOf(battle, part.cast.owner) ?? part.cast.from
  const axis = direction(pivot, from)
  const signed = bardSignedCast(part.cast, part.turn, from)
  const motion = shoveUnit(battle, signed, target, part.amount, "", undefined, true, axis, .16)
  const next = () => turnBardPushes(battle, parts, attack, target, index + 1)
  if (motion?.cause === signed) followBardPush(battle, part, attack, target, motion, signed, next)
  else next()
}

export function previewBasicShove(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit) {
  const upgraded = activeBuffs(battle, actor.id, "choose")[0]
  const length = upgraded ? upgraded.values[4] ?? 90 : BASIC_PUSH
  const cast = makeCast(0, actor, "basic", target, target)
  cast.used.add("manual")
  const loaded = activeBuffs(battle, actor.id, "q").sort((a, b) => b.values[0] - a.values[0])[0]
  if (loaded?.cast.signature?.id) cast.used.add("spent/" + loaded.cast.signature.id + "@" + actor.id)
  const strike = { ...eventFor(cast, "strike", target), direct: true }
  const shove = eventFor(cast, "shove", target)
  let turn: { cast: SkillCast; length: number } | undefined
  for (const watch of battle.runtime.watches) {
    const event = watch.rule.event === "strike" ? strike
      : watch.rule.event === "shove" && watch.cast.signature?.id === "bulwark/L/G1" ? shove : undefined
    if (watch.until <= battle.time || !watch.uses || !event) continue
    const owner = unitOf(battle, watch.cast.owner)
    if (!owner || !matches(battle, watch.rule, owner, event, watch.target)) continue
    const area = selectionArea(battle, watch.cast, watch.step.selector, event)
    if (!select(battle, watch.cast, watch.step.selector, event, area).includes(target)) continue
    for (const op of watch.step.operations) if (op.kind === "addp") {
      if (!turn && bardArt(watch.cast)?.motif === "bowString" && bardTurnGold(battle, watch.cast, actor.id))
        turn = { cast: watch.cast, length: op.args[0] }
      else act(battle, watch.cast, target, op, event, true)
    }
  }
  const extra = Math.max(0, ...activeBuffs(battle, actor.id, "qp").map((buff) => buff.values[0]))
  const wing = isFighter(actor) && actor.passives.find((passive) => passive.id === "bulwark/Radiant/P7")
  const flank = wing && isFighter(actor) && (actor.passiveAt[wing.id] ?? 0) <= battle.time &&
    (!battle.preview || battle.preview.loadoutFor === actor.id && (!battle.preview.passiveOnly || battle.preview.passiveOnly === wing.id)) &&
    matches(battle, wing.rule, actor, shove) ? wing.steps[0].operations[0].args[0] : 0
  const rage = isFighter(actor) ? actor.passives.reduce((total, passive) => {
    if (!["berserker/UC/P5", "berserker/R/P7"].includes(passive.id) || !ragePassiveEnabled(battle, actor, passive.id) ||
      (actor.passiveAt[passive.id] ?? 0) > battle.time || !matches(battle, passive.rule, actor, shove)) return total
    return total + passive.steps[0].operations[0].args[0]
  }, 0) : 0
  const bonus = strike.push ?? 0
  const rules = binderShoveRules(battle, shove, target, direction(actor, target),
    length + extra + flank + rage + (shove.push ?? 0) + (strike.axis ? 0 : bonus))
  const end = shoveEnd(battle, target, rules.axis, rules.push)
  const side = turn ? shoveEnd(battle, { ...target, ...end }, direction(unitOf(battle, turn.cast.owner) ?? turn.cast.from, end), turn.length)
    : strike.axis && bonus > 0 ? shoveEnd(battle, { ...target, ...end }, strike.axis, bonus) : undefined
  return { end, side }
}

export function shoveUnit(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, length: number, style = "", base?: SkillEvent, derived = false, explicitAxis?: EdgePoint, duration = 0.26) {
  if (style === "toward") length = Math.min(length, edgeDistance(target, cast.aim))
  if (!target.hp || length <= 0) return
  const source = unitOf(battle, cast.owner)
  const spread = derived ? 0 : binderScatterBonus(battle, cast)
  const danceExtra = derived ? 0 : dancerPushBonus(battle, cast, style)
  length += spread + danceExtra
  const castAxis = explicitAxis ?? pushVector(battle, cast, target, style, base)
  const extra = derived ? undefined : cast.extraPush.get(target.id)
  if (extra) cast.extraPush.delete(target.id)
  if (extra && !extra.axis) length += extra.length
  const event: SkillEvent = { ...eventFor(cast, "shove", target, base), push: length, axis: castAxis, style, derived,
    zone: base?.zone || base?.style === "zone",
    landing: shoveEnd(battle, target, castAxis, length), passiveBeats: extra?.passiveBeats ?? (derived ? base?.passiveBeats : undefined), motionSeconds: duration,
    berserkerPush: extra?.berserkerPush?.slice() ?? (base?.kind === "strike" && base.target === target.id ? base.berserkerPush?.slice() : undefined),
    bardPushes: extra?.bardPushes?.slice() ?? (derived ? base?.bardPushes?.slice() : undefined),
  }
  const battering = cast.order === "basic" && source ? spendBuff(battle, source, "qp", target, cast.from, event) : undefined
  if (battering) event.push = length + battering.values[0]
  if (battering && bardArt(battering.cast)) (event.bardPushes ??= []).push({ cast: battering.cast, amount: battering.values[0] })
  const turns = event.bardPushes?.filter(part => part.turn) ?? []
  if (turns.length) event.push = Math.max(0, (event.push ?? length) - turns.reduce((sum, part) => sum + part.amount, 0))
  emit(battle, event)
  if (!target.hp) return
  const beforeAxis = event.axis ?? castAxis
  const beforeLength = event.push ?? length
  if (beforeLength <= 0) {
    if (turns.length) turnBardPushes(battle, turns, cast, target)
    return
  }
  const binding = !derived && binderShoveRules(battle, event, target, beforeAxis, beforeLength)
  const oldEnd = binding && (binding.ballast || binding.bend) ? shoveEnd(battle, target, beforeAxis, beforeLength) : undefined
  if (binding) {
    event.axis = binding.axis
    event.push = binding.push
  }
  const axis = event.axis ?? castAxis
  const total = event.push ?? length
  const pushParts = event.bardPushes?.filter(part => !part.turn) ?? []
  const projected = pushParts.length ? shoveEnd(battle, target, axis, total) : undefined
  const realized = projected ? pushParts.filter(part =>
    edgeDistance(projected, shoveEnd(battle, target, axis, Math.max(0, total - part.amount))) >= 1) : []
  const landing = shoveEnd(battle, target, axis, total, event)
  for (const beat of event.passiveBeats ?? []) {
    if (beat.landing && edgeDistance(beat.landing, landing) > 1) beat.corner = point(beat.landing)
    beat.landing = point(landing)
  }
  if (edgeDistance(target, landing) < 3) {
    if (turns.length) turnBardPushes(battle, turns, cast, target)
    return
  }
  if (!isOutside(target) && isOutside(landing)) interrupt(battle, cast, target, event, derived)
  rangerDisplacement(battle, cast, event, target, landing, duration)
  const motion = forceTo(battle, target, landing, duration, cast.order === "basic", cast)
  const converted = binding && binding.bend?.mode === "inverse"
  if (motion) {
    motion.kind = converted ? "pull" : "push"
    if (binding && oldEnd) commitBinderShove(battle, event, target, motion, oldEnd, binding)
    if (spread) emit(battle, { ...eventFor(cast, "assist", target, event), landing, binderMotion: motion, style: "binderSpread" })
    if (danceExtra) emit(battle, { ...eventFor(cast, "assist", target, event), landing, style: "danceExtraPush" })
    if (!derived && !converted && ["crossMeter", "battleStaff"].includes(bardArt(cast)?.motif ?? "")) {
      const paths = [{ from: motion.start, to: landing, unit: target.id }]
      showBardBeat(battle, cast, "flight", landing, { from: motion.start, duration: motion.duration, paths, kind: "push" })
      later(battle, motion.duration, () => {
        if (target.hp && motion.completed && edgeDistance(target, landing) <= 3)
          showBardBeat(battle, cast, "land", landing, { from: motion.start, target: target.id, paths, kind: "push" })
      })
    }
    if (!converted) for (const part of realized) followBardPush(battle, part, cast, target, motion)
    if (!converted && turns.length) later(battle, motion.duration, () => {
      if (target.hp && motion.completed && edgeDistance(target, motion.end) <= 3) turnBardPushes(battle, turns, cast, target)
    })
  }
  if (motion) for (const trait of event.berserkerPush ?? []) {
    showDefenderTrait(battle, trait, "proc", target, { ...event, landing }, {
      from: cast.from, contacts: [point(target)], landings: [point(landing)], area: event.area,
    })
  }
  const batteringArt = battering && berserkerArt(battering.cast)
  if (motion && battering && (batteringArt?.motif === "shoulder" || batteringArt?.motif === "triage")) {
    showBerserkerBeat(battle, battering.cast, "cash", target, {
      from: cast.from, target: target.id, axis: direction(target, landing), paths: [{ at: point(target), end: point(landing) }], beat: 2,
    })
  }
  const relay = extra?.wardenRelay ?? (derived ? base?.wardenRelay : undefined)
  const shadowRelay = extra?.assassinRelay ?? (derived ? base?.assassinRelay : undefined)
  if (shadowRelay) showAssassinBeat(battle, shadowRelay, "release", target, {
    from: source ?? cast.from, target: target.id, kind: "relay", axis: direction(target, landing),
    paths: [{ at: point(target), end: point(landing) }],
  })
  if (shadowRelay && motion) emit(battle, { ...eventFor(shadowRelay, "assist", target),
    attackCast: cast, from: point(target), landing: point(landing), amount: edgeDistance(target, landing), style: "shadowrelay" })
  if (relay) showWardenBeat(battle, relay, "relay", target, {
    from: source ?? cast.from, target: target.id, axis: direction(target, landing), paths: [{ at: point(target), end: point(landing) }],
  })
  const track = history(battle, target)
  if (converted && binding) {
    track.pullAt = battle.time
    track.pullBy = binding.bend?.field?.cast.owner
  } else {
    track.pushAt = battle.time
    track.pushBy = cast.owner
  }
  if (!derived) {
    const record = traceAt(cast, target)
    if (converted) record.pulledTo = landing
    else {
      record.pushedTo = landing
      if ((cast.skill?.id.startsWith("warden/Prismatic/") || warlockArt(cast)) && motion) record.pushMotion = motion
    }
  }
  emit(battle, { ...event, kind: converted ? "pull" : "push", landing, distance: edgeDistance(target, landing) })
  const landingCue = !derived && battle.runtime.watches.some(watch => watch.rule.event === "pushland" && watch.target === target.id &&
    watch.uses > 0 && watch.until > battle.time && bardArt(watch.cast)?.motif === "refrain")
  if (motion && !converted && !derived && !friendly(battle, cast.owner, target.id) &&
    (landingCue || ragePassiveEnabled(battle, target, "berserker/E/P8"))) {
    later(battle, motion.duration, () => {
      if (target.hp && motion.completed && edgeDistance(target, landing) <= 3) {
        emit(battle, { ...event, kind: "pushland", from: motion.start, at: point(target), landing, distance: edgeDistance(motion.start, landing) })
      }
    })
  }
  if (extra?.axis && motion) {
    later(battle, motion.duration + .01, () => {
      if (!target.hp || !motion.completed || target.force || edgeDistance(target, motion.end) > 3) return
      shoveUnit(battle, cast, target, extra.length, "", event, true, extra.axis)
    })
  }
  return motion
}

function binderNearestWell(target: EdgePoint, area?: EdgeArea) {
  const wells = area?.parts.filter(part => part.kind === "circle") ?? []
  return wells.sort((a, b) => edgeDistance(a.center, target) - edgeDistance(b.center, target))[0]?.center
}

function binderShoreBonus(battle: EdgeBattle, cast: SkillCast, style: string) {
  return style === "shore" && binderArt(cast)?.motif === "shoreHitch" &&
    binderTraitReady(battle, unitOf(battle, cast.owner), "binder/UC/P2") ? 20 : 0
}

function pullLanding(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, length: number, gap: number, style: string, event?: SkillEvent, time = battle.time) {
  length += binderShoreBonus(battle, cast, style)
  const route = style === "trail" ? cast.wardenRoute : undefined
  let center = route ? along(route.to, direction(route.to, route.from), Math.min(gap, edgeDistance(route.from, route.to)))
    : style === "in" ? CENTER : style === "self" ? unitOf(battle, cast.owner) ?? cast.from : event?.area?.center ?? cast.aim
  if (style === "oldself") center = cast.from
  else if (style === "shore") center = along(target, outward(target), -length)
  else if (style === "spine" || style === "banks") {
    const axis = direction(cast.from, cast.aim)
    const normal = style === "spine" ? axis : left(axis)
    const origin = style === "spine" ? cast.from : center
    const projected = (target.x - origin.x) * normal.x + (target.y - origin.y) * normal.y
    center = along(origin, normal, style === "spine" ? clamp(projected, 0, event?.selector?.size[0] ?? 270) : projected >= 0 ? 44 : -44)
  } else if (style === "well") center = binderNearestWell(target, event?.area) ?? center
  const distance = Math.min(length, Math.max(0, edgeDistance(target, center) - (route ? 0 : gap)))
  return along(target, direction(target, center), distance * (1 - ratio(modifier(battle, target, "anti", undefined, undefined, undefined, time))) * (target.guardUntil > time ? EXILE.push : 1))
}

function pullUnit(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, length: number, gap: number, style: string, event?: SkillEvent, derived = false) {
  if (!target.hp) return
  const landing = pullLanding(battle, cast, target, length, gap, style, event)
  const distance = edgeDistance(target, landing)
  if (distance < 3) return
  const motion = forceTo(battle, target, landing, 0.24, false, cast)
  if (motion) motion.kind = "pull"
  const track = history(battle, target)
  track.pullAt = battle.time
  track.pullBy = cast.owner
  if (!derived && (wardenArt(cast) || binderArt(cast))) traceAt(cast, target).pulledTo = point(landing)
  if (motion && !derived && binderArt(cast)) {
    recordBinderControl(battle, cast, target)
    const well = style === "well" && binderNearestWell(target, event?.area)
    if (well) {
      const wells = cast.binderWells ??= new Set()
      wells.add(well)
    }
    if (binderShoreBonus(battle, cast, style)) emit(battle, {
      ...eventFor(cast, "assist", target, event), landing, distance, binderMotion: motion, style: "binderShore",
    })
  }
  emit(battle, { ...eventFor(cast, "pull", target, event), landing, distance, binderMotion: motion ?? undefined, derived })
  const owner = unitOf(battle, cast.owner)
  if (motion && !derived && owner && (ragePassiveEnabled(battle, owner, "berserker/UC/P4") || ragePassiveEnabled(battle, owner, "berserker/R/P4"))) {
    later(battle, motion.duration, () => {
      if (!owner.hp || !target.hp || !motion.completed || edgeDistance(target, landing) > 3) return
      traceAt(cast, target).pulledTo = point(target)
      emit(battle, { ...eventFor(cast, "pullland", target, event), from: motion.start, landing, distance })
    })
  }
}

export function skillTravelEnd(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, destination: EdgePoint, commit = false) {
  if (cast.owner !== target.id || cast.order === "basic") return destination
  const mark = activeBuffs(battle, target.id, "short").find((buff) => buff.style === "spellmove" && buff.cast.id < cast.id)
  const scale = cast.spellTravelScale ?? (mark ? 1 - ratio(mark.values[0]) : 1)
  if (scale === 1) return destination
  const end = along(target, direction(target, destination), edgeDistance(target, destination) * scale)
  if (commit && mark && cast.spellTravelScale === undefined && edgeDistance(target, destination) >= 3) {
    cast.spellTravelScale = scale
    remove(battle, mark)
    showSpellBeat(battle, mark.cast, "release", target, { from: target, other: destination, paths: [{ at: point(target), end }], kind: "short" })
    emit(battle, { ...eventFor(mark.cast, "alter", target), from: point(target), landing: end,
      amount: edgeDistance(target, destination) - edgeDistance(target, end), style: "skillshort", attackCast: cast })
  }
  return end
}

function dashLanding(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, length: number, style: string, event?: SkillEvent, extra = 0, commit = false,
  selected = unitOf(battle, cast.target)) {
  if (isOutside(target)) return
  const owner = unitOf(battle, cast.owner)
  const base = selected ?? cast.aim
  const axis = direction(cast.from, cast.aim)
  let end: EdgePoint
  switch (style) {
    case "away": {
      const enemy = spellArt(cast)?.motif === "sidestep" || assassinArt(cast) ? selected : nodes(battle).filter((unit) => unit.hp && !friendly(battle, target.id, unit.id))
        .sort((a, b) => edgeDistance(a, target) - edgeDistance(b, target))[0]
      end = along(target, direction(enemy ?? selected ?? cast.aim, target), length)
      break
    }
    case "back": end = cast.from; break
    case "escort": {
      if (!selected?.hp || isOutside(selected)) return
      const lengthToAlly = Math.max(0, edgeDistance(target, selected) - extra)
      end = along(target, direction(target, selected), Math.min(length, lengthToAlly))
      break
    }
    case "side": {
      const candidate = along(base, left(axis), length)
      end = isOutside(candidate) ? along(base, left(axis), -length) : candidate
      if (isOutside(end)) return
      break
    }
    case "left": end = along(target, left(axis), length); break
    case "right": end = along(target, left(axis), -length); break
    case "near": end = along(base, direction(base, target), length); break
    case "far": end = along(base, direction(cast.from, base), length); break
    case "flip": end = along(base, direction(target, base), length); break
    case "out": end = along(target, direction(cast.from, target), length); break
    case "in": end = along(target, direction(target, owner ?? cast.from), Math.min(length, Math.max(0, edgeDistance(target, owner ?? cast.from) - (extra || 72)))); break
    case "rot": {
      const center = event?.area?.center ?? cast.aim
      end = along(center, rotate(direction(center, target), extra), edgeDistance(center, target))
      break
    }
    case "history": {
      const positions = history(battle, target).positions.filter((p) => !isOutside(p.at) && edgeDistance(p.at, target) > 5 && recent(battle, p.time, 2))
      const old = positions.at(0)?.at ?? target
      end = along(target, direction(target, old), Math.min(length, edgeDistance(target, old)))
      break
    }
    default: end = along(target, direction(target, cast.aim), Math.min(length, edgeDistance(target, cast.aim)))
  }
  if (berserkerArt(cast)?.motif === "trinity" && isOutside(end)) return
  return skillTravelEnd(battle, cast, target, inside(end), commit)
}

function dashUnit(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, length: number, style: string, event?: SkillEvent, derived = false, extra = 0) {
  const end = dashLanding(battle, cast, target, length, style, event, extra, true)
  if (!end) return
  const old = point(target)
  const holy = !derived && paladinArt(cast)
  const breaker = !derived && spellArt(cast)
  const travel = !derived && (wardenArt(cast)?.travel ?? (holy ? holy.travel : breaker ? breaker.travel : undefined))
  if (travel) {
    const distance = edgeDistance(old, end)
    if (breaker) cast.spellRoute = { from: old, to: point(end) }
    else if (holy) cast.paladinRoute = { from: old, to: point(end) }
    else cast.wardenRoute = { from: old, to: point(end) }
    const motion = forceTo(battle, target, end, travel, false, cast)
    if (motion) showWardenBeat(battle, cast, "travel", end, {
      from: old, target: target.id, duration: travel, axis: direction(old, end), other: unitOf(battle, cast.target),
    })
    if (holy) showPaladinBeat(battle, cast, "travel", end, { from: old, target: target.id, duration: travel, other: unitOf(battle, cast.target) })
    if (breaker) showSpellBeat(battle, cast, "travel", end, { from: old, target: target.id, duration: travel })
    later(battle, travel, () => {
      const other = unitOf(battle, cast.target)
      if (motion && !motion.completed || !unitOf(battle, cast.owner)?.hp || !target.hp || edgeDistance(target, end) > 3 || target.force ||
        !breaker && other && (!other.hp || isOutside(other))) return
      cast.used.add("dasharrived")
      if (distance >= 3) {
        cast.used.add("dash")
        history(battle, target).from = old
        emit(battle, { ...eventFor(cast, "dash", target, event), from: old, landing: point(target), distance, style: "dash", derived })
      }
      showWardenBeat(battle, cast, "arrival", target, { from: old, target: target.id, other, axis: direction(old, end) })
      if (holy) showPaladinBeat(battle, cast, "arrival", target, { from: old, target: target.id, other })
      if (breaker) showSpellBeat(battle, cast, "arrival", target, { from: old, target: target.id })
    })
    return
  }
  if (edgeDistance(old, end) < 3) {
    if (style === "slide") cast.used.add("dasharrived")
    return
  }
  if (style === "slide" && extra > 0) {
    const motion = forceTo(battle, target, end, extra, false, cast)
    if (!derived) showBulwarkBeat(battle, cast, "step", end, { from: old, target: target.id, duration: extra })
    later(battle, extra, () => {
      if (!target.hp || edgeDistance(target, end) > 1 || target.force && target.force.cause?.id !== cast.id) return
      if (wardenTraitArt(cast.signature?.id)) {
        if (!motion?.completed) return
        showDefenderTrait(battle, cast, "stance", target, event, { from: old, landings: [point(end)] })
      }
      cast.used.add("dash")
      cast.used.add("dasharrived")
      history(battle, target).from = old
      emit(battle, { ...eventFor(cast, "dash", target, event), from: old, landing: end, distance: edgeDistance(old, end), style: "dash", derived })
    })
    return
  }
  target.move = null
  target.force = null
  cast.used.add("dash")
  rangerDisplacement(battle, cast, event, old, end, .35)
  positionUnit(battle, target, end, cast)
  const track = history(battle, target)
  track.from = old
  track.standAt = battle.time
  track.danceStep = undefined
  cue(battle, "move", target, end, old)
  emit(battle, { ...eventFor(cast, "dash", target, event), from: old, landing: end, distance: edgeDistance(old, end), style: style === "rot" ? "rot" : "dash", derived })
}

const timed = new Set(["speed", "slow", "root", "anti", "res", "armor", "amp", "ampq", "guard", "split",
  "q", "qp", "qr", "extend", "hop", "phase", "taunt", "stall", "defy", "returnhp", "reflect", "exguard", "short", "aimp", "choose",
  "range", "weak", "vuln", "healamp", "healrecv", "tether", "score"])

function berserkerDamageBonus(battle: EdgeBattle, owner: EdgeUnit, target: EdgeUnit, style: string, area?: EdgeArea) {
  if (style === "wound") return history(battle, owner).wounds.some(({ time }) => recent(battle, time, 4))
  if (style === "crosscore") return !!area && areaHits(area, target) > 1
  return false
}

export function removableBuffs(battle: EdgeBattle, target: EdgeUnit, negative: boolean, style: string, at = battle.time) {
  return activeBuffs(battle, target.id, undefined, at)
    .filter(buff => negative === DEBUFFS.has(buff.kind) && matchesCleanse(buff.kind, style))
    .sort((a, b) => b.until - a.until)
}

function cleanse(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, count: number, negative: boolean, style: string, event?: SkillEvent, derived = false) {
  const removed = removableBuffs(battle, target, negative, style).slice(0, count)
  for (const buff of removed) remove(battle, buff)
  if (removed.length) {
    if (!derived) showSpellBeat(battle, cast, "remove", target, { target: target.id, amount: removed.length, kind: removed.map((buff) => buff.kind).join(" ") })
    if (!derived) showHealerBeat(battle, cast, "cleanse", target, {
      from: event?.from ?? event?.area?.center ?? cast.from, target: target.id, area: event?.area,
      amount: removed.length, statuses: removed.map(buff => buff.kind),
    })
    if (!derived && style === "borrowed") {
      const owner = unitOf(battle, cast.owner)
      const ally = owner && alliesOf(battle, owner.id).filter((unit) => unit.hp && edgeDistance(owner, unit) <= 190).sort((a, b) => hpPct(a) - hpPct(b))[0]
      if (ally) shield(battle, cast, ally, ally.maxHp * .15, 12, { ...eventFor(cast, "remove", target, event), style: "borrowed", from: point(target) })
    }
    const statuses = removed.map(buff => buff.kind)
    if (!derived && negative && healerArt(cast)) (cast.healerCleaned ??= new Set()).add(target.id)
    emit(battle, { ...eventFor(cast, negative ? "cleanse" : "remove", target, event), amount: removed.length, cleansed: statuses, derived })
  }
  return removed.length
}

function eraseSpellField(battle: EdgeBattle, cast: SkillCast, area: EdgeArea, remaining: number, event?: SkillEvent) {
  if (cast.used.has("erase")) return
  cast.used.add("erase")
  const fragments: EdgeArea[] = []
  const wards: FieldEffect[] = []
  for (const field of battle.runtime.fields) {
    if (field.until <= battle.time + remaining || friendly(battle, field.cast.owner, cast.owner) || !areaHits(area, field.area.center)) continue
    fragments.push(field.area)
    if (!remaining && field.capacity > 0 && (field.mode === "guard" || field.mode === "wall")) wards.push(field)
    field.until = battle.time + remaining
  }
  if (battle.sparring && wards.length) for (const unit of nodes(battle)) {
    if (!unit.hp || !isFighter(unit) || friendly(battle, cast.owner, unit.id)) continue
    const removed = wards.reduce((capacity, field) => {
      if (!friendly(battle, field.cast.owner, unit.id)) return capacity
      const covers = field.mode === "guard" ? areaHits(field.area, unit) : firstCrossing(field.area, cast.from, unit)
      return covers ? Math.max(capacity, field.capacity) : capacity
    }, 0)
    if (removed > unit.maxHp * .05) history(battle, unit).wardBroken = { at: battle.time, by: cast.owner, capacity: removed }
  }
  const clearedAreas = remaining ? [] : fragments.slice()
  if (!remaining && spellArt(cast)?.motif === "blankbeat") for (const group of battle.runtime.summons) {
    if (group.dismissedAt !== undefined || group.until <= battle.time || friendly(battle, group.owner, cast.owner) ||
      !group.deployment.bodies.some((body) => body.hp && areaHits(area, body))) continue
    fragments.push(...group.deployment.bodies.filter((body) => body.hp).map((body) => areaOf("C", point(body), { x: 1, y: 0 }, 42)))
    dismissSummon(group, battle.time)
  }
  if (!fragments.length) return
  showSpellBeat(battle, cast, "erase", area.center, { area, fragments, amount: fragments.length, kind: remaining ? "shorten" : "clear" })
  emit(battle, { ...eventFor(cast, "remove", unitOf(battle, cast.target), event), at: area.center, area,
    clearedAreas, style: "zone", amount: fragments.length })
}

function act(battle: EdgeBattle, cast: SkillCast, target: EdgeUnit, op: Operation, event?: SkillEvent, derived = false) {
  const owner = unitOf(battle, cast.owner)
  if (!owner || !target.hp && binderArt(cast)) return
  const [value = 0, next, extra, fourth, fifth, sixth] = op.args
  const style = op.style
  const defaultShieldTime = isFighter(owner) && (owner.card.rarity === "Radiant" || owner.card.rarity === "Prismatic") ? 12 : 10
  if (op.kind === "slow" && style === "extend") {
    const slow = activeBuffs(battle, target.id, "slow").find((buff) => buff.cast.id === event?.cast.id)
    if (slow) slow.until += value
    return
  }
  if (timed.has(op.kind)) {
    if (style === "bondpush") {
      const attack = event?.attackCast
      if (attack) {
        const wards = attack.paladinBrace ??= new Map()
        const prior = wards.get(target.id)
        if (!prior || value > prior.value) wards.set(target.id, { cast, value })
      }
      return
    }
    if (style === "ownabsorb" && battle.runtime.shieldCasts.get(target.id) !== cast) return
    if (style === "spellshield" && battle.runtime.shieldCasts.get(target.id) !== cast) return
    const medic = !derived && healerArt(cast)
    if (medic && op.kind === "defy" && target.once.has(effectKey(cast, "defy"))) return
    const binding = !derived && binderArt(cast)
    const duration = op.kind === "phase" || op.kind === "root" || op.kind === "score" ? value
      : (next ?? 8) + (binding && op.kind === "slow" ? cast.binderSlowBonus ?? 0 : 0)
    addBuff(battle, cast, target, op.kind, duration, op.args, style)
    if (binding) {
      if (op.kind === "slow" || op.kind === "root") recordBinderControl(battle, cast, target)
      if (op.kind === "short") cast.used.add("binderShortMark")
      if (op.kind === "anti" && binding.motif === "retreatSeal") cast.binderBrace ??= target.id
    }
    if (!derived && dancerArt(cast) && ["speed", "extend", "anti", "guard", "hop", "res"].includes(op.kind))
      showDancerBeat(battle, cast, "mark", target, { from: event?.from ?? owner, target: target.id, kind: op.kind, amount: value })
    if (medic && ["guard", "defy", "split", "returnhp", "speed", "anti"].includes(op.kind))
      showHealerBeat(battle, cast, "arm", target, { from: event?.from ?? owner, target: target.id, kind: op.kind, amount: value })
    if (!derived && bardArt(cast) && ["ampq", "qr", "qp", "q", "guard", "score", "slow"].includes(op.kind))
      showBardBeat(battle, cast, "arm", target, { from: event?.from ?? owner, target: target.id, kind: op.kind, amount: value })
    if (!derived && op.kind === "slow" && warlockArt(cast) && target.hp && !friendly(battle, owner.id, target.id))
      (cast.warlockSlowed ??= new Set()).add(target.id)
    if (!derived && wardenArt(cast)) {
      if (op.kind === "guard" || op.kind === "anti" || op.kind === "exguard")
        showWardenBeat(battle, cast, "arm", target, { from: owner, target: target.id })
      if (op.kind === "slow") showWardenBeat(battle, cast, "slow", target, { from: owner, target: target.id, area: event?.area })
    }
    if (!derived && berserkerArt(cast) && ["ampq", "qp", "guard", "choose", "defy"].includes(op.kind))
      showBerserkerBeat(battle, cast, "arm", target, { target: target.id, kind: op.kind })
    if (!derived && paladinArt(cast) && ["guard", "anti", "returnhp"].includes(op.kind))
      showPaladinBeat(battle, cast, "arm", target, { target: target.id, kind: op.kind, area: event?.area })
    if (!derived && lifeArt(cast) && op.kind === "returnhp")
      showLifeBeat(battle, cast, "arm", target, { target: target.id, duration, kind: "returnhp" })
    if (!derived && spellArt(cast)) showSpellBeat(battle, cast, op.kind === "slow" || op.kind === "root" ? "release" : "arm", target, {
      target: target.id, kind: op.kind, amount: value, area: event?.area,
    })
    if (!derived && assassinArt(cast)) showAssassinBeat(battle, cast, op.kind === "phase" ? "phase" : op.kind === "root" ? "release" : "arm", target, {
      target: target.id, kind: op.kind, amount: value, area: event?.area,
    })
    if (op.kind === "slow" || op.kind === "root" || op.kind === "short" && !binderArt(cast) || op.kind === "phase" || op.kind === "armor" && spellArt(cast) || op.kind === "weak" && style === "other") {
      emit(battle, { ...eventFor(cast, "alter", target, event), style: op.kind, amount: value, derived })
    }
    return
  }
  switch (op.kind) {
    case "d": {
      if (!derived && assassinArt(cast) && target.id === cast.target && !cast.trace.get(target.id)?.hits) {
        cast.assassinHitLow ??= hpPct(target) < 35
        cast.assassinHitPushed ??= recent(battle, history(battle, target).pushAt)
        cast.assassinHitOutside ??= isOutside(target)
        cast.assassinContact ??= point(target)
      }
      const bonusStyle = style === "wound" || style === "crosscore"
      const base = bonusStyle ? value + (berserkerDamageBonus(battle, owner, target, style, event?.area) ? next ?? 0 : 0)
        : op.args[Math.min(event?.index ?? 0, op.args.length - 1)] ?? value
      if (!derived && style === "reflect" && paladinArt(cast) && event) {
        const defender = unitOf(battle, event.target) ?? owner
        paladinRetort(battle, cast, defender, target, base, event)
      } else if (!derived && style === "reflect" && spellArt(cast) && event) {
        const defender = unitOf(battle, event.target) ?? owner
        spellReply(battle, cast, defender, target, cast.basis * base, event)
      } else damageUnit(battle, cast, target, cast.basis * base, event, derived, bonusStyle ? "" : style)
      break
    }
    case "h": {
      if (style === "fullward" && (event?.lowBefore ?? hpPct(target)) >= 100)
        shield(battle, cast, target, target.maxHp * ratio(next ?? 12), defaultShieldTime, event, derived)
      else {
        const bonus = style === "lowhealth" && hpPct(target) < (op.args[2] ?? 45) ? next ?? 0 : 0
        const overflow = style === "overflow" ? { cap: target.maxHp * ratio(next ?? 9), duration: defaultShieldTime } : undefined
        heal(battle, cast, target, target.maxHp * ratio(value + bonus), style, event, derived, overflow)
      }
      break
    }
    case "b": {
      const amount = target.maxHp * ratio(value)
      if (style === "stack" && shielded(battle, target)) {
        const layer = Math.round(amount)
        target.shieldStart = (target.shieldStart ?? target.shield) + layer
        target.shield += layer
        impact(battle, owner, target, layer, "shield")
      } else shield(battle, cast, target, amount, next ?? defaultShieldTime, event, derived)
      break
    }
    case "overshield": {
      const cap = Math.min(target.maxHp * ratio(value), next === undefined ? Infinity : owner.maxHp * ratio(next))
      shield(battle, cast, target, Math.min(event?.overheal ?? 0, cap), defaultShieldTime, event, derived)
      break
    }
    case "allyshield": shield(battle, cast, target, target.maxHp * ratio(value), next ?? defaultShieldTime, event, derived); break
    case "p": {
      const length = !derived || style === "pct" ? scriptedPushLength(cast, target, op, event) : value
      shoveUnit(battle, cast, target, length, style === "pct" ? "eventaxis" : style, event, derived)
      break
    }
    case "l": pullUnit(battle, cast, target, value, next ?? 0, style, event, derived); break
    case "i": {
      const motion = target.force
      if (!derived && spellArt(cast)?.motif === "cutanchor" && motion?.cause === cast) {
        cast.pending++
        later(battle, motion.duration, () => {
          if (target.hp && motion.completed && edgeDistance(target, motion.end) < 3) interrupt(battle, cast, target, event)
          cast.pending--
          finishCast(battle, cast)
        })
      } else interrupt(battle, cast, target, event, derived)
      break
    }
    case "dash": dashUnit(battle, cast, target, value, style, event, derived, next); break
    case "rot": dashUnit(battle, cast, target, 0, "rot", event, derived, value); break
    case "back": dashUnit(battle, cast, target, 0, "back", event, derived); break
    case "swap": {
      if (owner === target || isOutside(owner) || isOutside(target)) break
      const warden = !derived && wardenArt(cast)
      const holy = !derived && paladinArt(cast)
      if ((warden || holy) && cast.skill && edgeDistance(owner, target) > cast.skill.aim.range) break
      const from = point(owner)
      const to = point(target)
      positionUnit(battle, owner, to, cast)
      positionUnit(battle, target, from, cast)
      for (const unit of [owner, target]) {
        unit.move = null
        unit.force = null
      }
      if (warden) {
        cast.used.add("swapped")
        cast.wardenRoute = { from, to }
        showWardenBeat(battle, cast, "swap", to, { from, target: target.id, axis: direction(from, to),
          paths: [{ at: from, end: to }, { at: to, end: from }] })
      } else if (holy) {
        cast.paladinRoute = { from, to, swap: true }
        showPaladinBeat(battle, cast, "swap", to, { from, target: target.id, other: from,
          paths: [{ at: from, end: to, unit: owner.id }, { at: to, end: from, unit: target.id }] })
      } else {
        cue(battle, "move", owner, to, from)
        cue(battle, "move", target, from, to)
      }
      emit(battle, { ...eventFor(cast, "dash", target, event), from: to, landing: from, distance: edgeDistance(to, from), style: "swap", derived })
      break
    }
    case "add": if (event) event.bonus = (event.bonus ?? 0) + value * cast.basis; break
    case "addh": if (event) event.bonus = (event.bonus ?? 0) + value * target.maxHp / 100; break
    case "take": if (event) {
      if (style === "vow") event.cast.paladinVow = { cast, scale: 1 + ratio(value) }
      else if (style === "spellreverse") event.cast.spellReversal = { cast, scale: 1 + ratio(value) }
      else if (style === "spellbasic") event.cast.spellBasic = { cast, scale: 1 + ratio(value) }
      else event.scale = (event.scale ?? 1) * (1 + ratio(value))
    } break
    case "addp": if (event) {
      event.push = style === "pct" ? (event.push ?? 0) * (1 + ratio(value)) : (event.push ?? 0) + value
      if (event.kind === "strike" && style === "left") event.axis = left(direction(event.cast.from, target))
      else if (style && style !== "pct") event.axis = pushVector(battle, cast, target, style, event)
    } break
    case "halt": if (target.move) {
      if (!derived) showAssassinBeat(battle, cast, "stop", target, { other: target.move, target: target.id })
      target.move = null
      const track = history(battle, target)
      track.standAt = battle.time
      track.binderFold = undefined
      track.danceStep = undefined
      emit(battle, { ...eventFor(cast, "alter", target, event), style: "halt", derived })
    } break
    case "freeze": addBuff(battle, cast, target, "root", value, [value]); break
    case "clean": cleanse(battle, cast, target, value || 1, true, style, event, derived); break
    case "shed": cleanse(battle, cast, target, value || 1, false, style, event, derived); break
    case "strip": {
      const stripped = strikeShield(battle, cast, target, value * cast.basis, event, derived)
      if (!derived && stripped > 0 && berserkerArt(cast)) {
        impact(battle, owner, target, stripped, "block")
        showBerserkerBeat(battle, cast, "strip", target, { target: target.id, amount: stripped })
      }
      if (!derived && stripped > 0 && paladinArt(cast)) {
        impact(battle, owner, target, stripped, "block")
        showPaladinBeat(battle, cast, "strip", target, { from: owner, target: target.id, amount: stripped })
      }
      if (!derived && stripped > 0 && spellArt(cast)) {
        impact(battle, owner, target, stripped, "block")
        showSpellBeat(battle, cast, "strip", target, { from: owner, target: target.id, amount: stripped, area: event?.area })
      }
      break
    }
    case "erase": {
      if (spellArt(cast)) break
      const area = event?.area
      if (!area || cast.used.has("erase")) break
      cast.used.add("erase")
      for (const field of battle.runtime.fields) {
        if (!friendly(battle, field.cast.owner, cast.owner) && areaHits(area, field.area.center)) field.until = value ? Math.min(field.until, battle.time + value) : battle.time
      }
      emit(battle, { ...eventFor(cast, "remove", target, event), style: "zone", derived })
      break
    }
    case "cost": {
      const spent = Math.min(target.hp - 1, Math.round((style === "current" ? target.hp : target.maxHp) * ratio(value)))
      if (spent <= 0) break
      const lowBefore = hpPct(target)
      target.hp -= spent
      impact(battle, owner, target, spent, "hit")
      if (!derived && berserkerArt(cast)) showBerserkerBeat(battle, cast, "cost", target, { amount: spent, target: target.id })
      emit(battle, { ...eventFor(cast, "life", target, event), amount: spent, lowBefore, style: "cost", derived })
      break
    }
    case "missing": {
      const amount = (target.maxHp - target.hp) * ratio(value) + target.maxHp * ratio(extra ?? 0)
      const cap = target.maxHp * ratio(next ?? 100)
      heal(battle, cast, target, Math.min(cap, amount), style, event, derived, undefined, healerArt(cast) ? Math.round(cap) : Infinity)
      break
    }
    case "leech": {
      const basis = style === "perhit" ? target.maxHp * [...cast.trace].filter(([id, entry]) =>
        !friendly(battle, id, cast.owner) && (entry.effectiveHits ?? 0) > 0).length : cast.damage
      let amount = Math.min(basis * ratio(value), target.maxHp * ratio(next ?? 100))
      if (style === "each") {
        const total = Math.round(amount)
        amount = Math.max(0, total - (cast.berserkerLeech ?? 0))
        cast.berserkerLeech = total
      }
      const overflowShield = style === "overflow" ? { cap: target.maxHp * ratio(extra ?? 12), duration: defaultShieldTime } : undefined
      heal(battle, cast, target, amount, style === "perhit" ? "onhit" : "leech", event, derived, overflowShield)
      break
    }
    case "rewind": {
      const wounds = history(battle, target).wounds.filter(({ time }) => recent(battle, time, fourth ?? 3)).reduce((n, hit) => n + hit.amount, 0)
      const amount = Math.min(target.maxHp * ratio(extra ?? 34), target.maxHp * ratio(value) + wounds * ratio(next ?? 60))
      const pulses = fifth ?? 3
      for (let i = 0; i < pulses; i++) {
        const portion = Math.round(amount * (i + 1) / pulses) - Math.round(amount * i / pulses)
        const run = () => heal(battle, cast, target, portion, "historic", event, derived)
        if (!i) run()
        else later(battle, i * (sixth ?? 0.7), run)
      }
      break
    }
    case "regen": {
      for (let i = 0; i < (extra ?? 3); i++) {
        const run = () => heal(battle, cast, target, target.maxHp * ratio(value), style, event, derived)
        if (!i && style !== "after") run()
        else later(battle, (i + Number(style === "after")) * (next ?? 1), run)
      }
      break
    }
    case "dot": {
      const buff = addBuff(battle, cast, target, "dot", (next ?? 1) * (extra ?? 2) + 0.1, op.args)
      for (let i = 1; i <= (extra ?? 2); i++) {
        later(battle, i * (next ?? 1), () => {
          if (battle.runtime.buffs.includes(buff)) {
            const lost = damageUnit(battle, cast, target, value * cast.basis,
              { ...eventFor(cast, "hit", target, event), dotTick: i, dotCount: extra ?? 2 }, derived, "dot")
            if (lost > 0 && warlockArt(cast)) showWarlockBeat(battle, cast, "strike", target, { from: target, target: target.id, beat: i, kind: "dot" })
          }
        })
      }
      break
    }
    case "conserve": {
      if (style === "life") {
        if (!target.hp || !shielded(battle, target) || battle.runtime.shieldCasts.get(target.id) !== cast) break
        const remaining = target.shield
        target.shield = 0
        target.shieldUntil = battle.time
        battle.runtime.shieldCasts.delete(target.id)
        showLifeBeat(battle, cast, "release", target, { target: target.id, amount: remaining, kind: "convert" })
        const gained = heal(battle, cast, target, remaining * ratio(value), "shieldconvert", event, derived)
        emit(battle, { ...eventFor(cast, "assist", target, event), amount: gained, style: "share", derived })
        break
      }
      const holy = paladinArt(cast)?.motif === "handoff"
      const pool = owner.shieldUntil > battle.time ? owner.shield * ratio(value) : 0
      const amount = holy ? Math.floor(pool) : pool
      if (holy && amount <= 0) break
      owner.shield -= amount
      const passed = shield(battle, cast, target, amount + target.maxHp * ratio(next ?? 0), defaultShieldTime, event, derived)
      if (!passed && (bulwarkArt(cast)?.motif === "handoff" || holy)) {
        owner.shield += amount
        break
      }
      if (amount > 0 || bulwarkArt(cast)?.motif !== "handoff")
        emit(battle, { ...eventFor(cast, "assist", target, event), amount, style: "share", derived })
      if (holy && passed) showPaladinBeat(battle, cast, "share", target, { from: owner, target: target.id, amount })
      break
    }
    case "absorb": if (event) event.scale = (event.scale ?? 1) * (1 - ratio(value)); break
    case "signal": emit(battle, { ...eventFor(cast, "assist", target, event), amount: value, style, derived }); break
    // These operations are handled by their area or group rather than by individual targets.
    case "orbit": case "seek": case "wall": case "poolheal": case "shareheal": case "decoy": case "block": case "trace":
    case "change": case "glide": case "bloom": case "bank": break
    default: throw new Error("Unhandled edge effect " + op.kind)
  }
}

function showImpact(battle: EdgeBattle, cast: SkillCast, step: Step, area?: EdgeArea, gold?: string) {
  if (!area) return
  visual(battle, cast, area, "impact", area.star ? 0.8 : 0.48, gold, stepOutcome(step))
}

function stepOutcome(step: Step): NonNullable<SkillVisual["outcome"]> {
  return step.operations.some((op) => op.kind === "d") ? "damage"
    : step.operations.some((op) => op.kind === "b") ? "shield"
    : step.operations.some((op) => op.kind === "h") ? "heal" : "control"
}

function areaDamageContact(cast: SkillCast, step: Step, area: EdgeArea | undefined, needsOwner: boolean): PendingStrike | undefined {
  const { units, shape, limit, flags, exclude } = step.selector
  if (!area || !shape || step.watch || step.zone || units !== "e" || limit || flags.length || exclude) return
  const damage = step.operations.find(op => op.kind === "d" && (!op.style && op.args.length === 1 || op.style === "crosscore"))
  if (damage) return { cast, power: damage.args[0], area, step, needsOwner }
}

export function fixedAreaStrike(cast: SkillCast, step: Step, area: EdgeArea | undefined, needsOwner: boolean) {
  const { anchor } = step.selector
  if (!anchor || ["p", "o", "m", "c"].includes(anchor)) return areaDamageContact(cast, step, area, needsOwner)
}

export function closingFieldArea(cast: SkillCast, step: Step, remaining: number) {
  const [length, width, gap] = step.selector.size
  return areaOf("K", cast.aim, direction(cast.from, cast.aim), length, width, gap * remaining)
}

function bloom(battle: EdgeBattle, cast: SkillCast, targets: EdgeUnit[], op: Operation, event?: SkillEvent, derived = false) {
  const [radius, percent, delay, lookback = 0] = op.args
  const historical = op.style === "history"
  const centers = historical ? targets.map((target) => {
    const samples = history(battle, target).positions
    return samples.findLast((sample) => sample.time <= battle.time - lookback)?.at ?? samples[0]?.at ?? point(target)
  }) : [...cast.trace.values()].filter((hit) => hit.hits).map((hit) => hit.at)
  if (!centers.length) return
  const areas = centers.map((center) => areaOf("C", center, { x: 1, y: 0 }, radius))
  for (const area of areas) visual(battle, cast, area, "warning", delay, undefined, "heal")
  if (!derived) cast.pending++
  later(battle, delay, () => {
    for (const area of areas) visual(battle, cast, area, "impact", 0.48, undefined, "heal")
    for (const target of nodes(battle)) {
      const area = areas.find((circle) => areaHits(circle, target))
      if (area && target.hp && friendly(battle, cast.owner, target.id)) {
        heal(battle, cast, target, target.maxHp * ratio(percent), historical ? "oldstep" : "", { ...eventFor(cast, "mend", target, event), area }, derived)
      }
    }
    if (!derived) {
      cast.pending--
      finishCast(battle, cast)
    }
  })
}

function applyStep(battle: EdgeBattle, cast: SkillCast, step: Step, event?: SkillEvent, derived = false, area?: EdgeArea, only?: EdgeUnit[], gold?: string) {
  const shape = area ?? selectionArea(battle, cast, step.selector, event)
  const targets = only ?? select(battle, cast, step.selector, event, shape)
  const summonArt = summonTraitArt(cast.signature?.id)
  const summonGold = gold && summonArt
  const armor = resolvedTraitArt(cast.signature?.id)
  const binding = !derived && binderArt(cast)
  const rageTrait = berserkerTraitArt(cast.signature?.id)
  const wardTrait = wardenTraitArt(cast.signature?.id)
  const holyTrait = paladinTraitArt(cast.signature?.id)
  const shadowTrait = assassinTraitArt(cast.signature?.id)
  const mageTrait = warlockTraitArt(cast.signature?.id)
  const lifeTrait = lifebringerTraitArt(cast.signature?.id)
  const binderTrait = binderTraitArt(cast.signature?.id)
  const danceTrait = dancerTraitArt(cast.signature?.id)
  const healerTrait = healerTraitArt(cast.signature?.id)
  const bardTrait = bardTraitArt(cast.signature?.id)
  const bulwark = !derived && !gold && bulwarkArt(cast)
  const warden = !derived && !gold && wardenArt(cast)
  const berserker = !gold && (!derived || event?.kind === "save") ? berserkerArt(cast) : undefined
  const paladin = !derived && !gold ? paladinArt(cast) : undefined
  const breaker = !derived && !gold ? spellArt(cast) : undefined
  const shadow = !derived && !gold ? assassinArt(cast) : undefined
  const mage = !derived && !gold ? warlockArt(cast) : undefined
  const medic = !derived && !gold && healerArt(cast)
  const bard = !derived && !gold && bardArt(cast)
  const fracture = step.operations.find((op) => op.kind === "splinter")
  if (fracture) {
    const [radius, multiplier, delay] = fracture.args
    if (!targets.length) return
    // Resolve the secondary circles together so their overlap never doubles the bonus hit.
    const burst: EdgeArea = {
      center: shape?.center ?? cast.aim,
      parts: targets.map((target) => ({ kind: "circle", center: point(target), radius })),
    }
    const next: Step = { delay: 0, selector: parseSelector("e"), operations: [{ kind: "d", args: [multiplier], style: "" }] }
    visual(battle, cast, burst, "warning", delay, gold)
    if (!derived) cast.pending++
    later(battle, delay, () => {
      applyStep(battle, cast, next, event, derived, burst, undefined, gold)
      if (!derived) {
        cast.pending--
        finishCast(battle, cast)
      }
    }, !derived ? { cast, power: multiplier, area: burst, needsOwner: false } : undefined)
    return
  }
  if (!only && !summonGold && !bulwark && !warden && !berserker && !paladin && !breaker && !shadow && !mage && !medic && !bard && !armor && !lifeArt(cast) && !binding) showImpact(battle, cast, step, shape, gold)
  const owner = unitOf(battle, cast.owner)
  if (!owner) return
  const skill = gold && isFighter(owner) ? owner.gold : cast.skill
  const choreography = skill && (!derived || gold) ? rangerChoreography(skill.id) : undefined
  const visualSkill = choreography ? skill?.id : undefined
  if (!bulwark && !warden && !berserker && !paladin && !breaker && !shadow && !mage && !medic && !bard && isFighter(owner) && (!derived || gold || cast.signature) && (derived || !cast.summon) &&
    !rangerPassiveArt(cast.signature?.id) && !summonArt && !armor) {
    const look = gold || !cast.signature ? skill && { id: skill.id, mark: skill.artwork.end } : cast.signature
    if (look && choreography && (gold || step.operations.some((op) => ["d", "p", "l", "i", "h", "b"].includes(op.kind)))) {
      const isRelay = choreography.motif === "relay" && cast.stage > 1
      const isFollow = choreography.motif === "followShot"
      const from = gold ? rangerGoldOrigin(battle, cast, choreography, event)
        : isRelay ? cast.trace.get(cast.target!)?.at ?? unitOf(battle, cast.target) ?? cast.from
        : isFollow ? unitOf(battle, cast.target) ?? cast.from : event?.from ?? cast.from
      const shapeImpact = shape && !(isRelay || isFollow)
      const to = shapeImpact ? shape.center : targets[0]
      if (to) showSkillVisual(battle, owner, look.id, {
        phase: "impact", mark: look.mark, from, to, area: shape, beat: cast.stage, cast: cast.id, outcome: stepOutcome(step),
        contacts: targets.map(point), gold: !!gold, start: battle.time, end: battle.time + choreography.settle,
      })
    } else if (look && !choreography) {
      const push = look.mark.motion === "shove" && step.operations.find((op) => op.kind === "p")
      const locations = shape && !push ? [shape.center] : targets
      for (const to of locations) {
        if (battle.runtime.effects.some((fx) => fx.skill === look.id && fx.phase === "impact" && fx.start === battle.time &&
          fx.to.x === to.x && fx.to.y === to.y)) continue
        const unit = push ? targets.find((target) => target === to) : undefined
        const axis = push && unit
          ? pushVector(battle, cast, unit, push.style, { ...eventFor(cast, "shove", unit, event), area: shape, selector: step.selector }) : undefined
        showSkillVisual(battle, owner, look.id, {
          phase: "impact", mark: look.mark,
          from: axis ? along(to, axis, -80) : event?.from ?? cast.from,
          to, area: shape,
          gold: !!gold, start: battle.time, end: battle.time + (shape?.star ? 0.78 : battle.preview ? 0.78 : 0.59),
        })
      }
    }
  }
  const rings = step.operations.find((op) => op.kind === "bloom")
  if (rings) bloom(battle, cast, targets, rings, event, derived)
  const budget = step.operations.find((op) => op.kind === "poolheal")
  let capacity = budget ? owner.maxHp * ratio(budget.args[0]) : 0
  const transfers = step.operations.find((op) => op.kind === "shareheal")
  const excess: number[] = []
  const hitGroup = !derived && shape && (cast.skill?.id.startsWith("ranger/") || berserker?.motif === "redline")
    ? targets.map((target) => ({ id: target.id, at: point(target) })) : undefined
  const goldTargets = summonGold ? targets.map((unit) => ({ unit, at: point(unit), hp: unit.hp })) : undefined
  const attacks = bulwark && step.operations.some(({ kind }) => kind === "d" || kind === "p" || kind === "l")
  const contactPoints = attacks ? targets.map((unit) => ({ unit, at: point(unit) })) : undefined
  const wardenDamage = warden && step.operations.some((op) => op.kind === "d")
  const wardenMotion = warden && step.operations.some((op) => op.kind === "p" || op.kind === "l")
  const wardenContacts = wardenDamage || wardenMotion ? targets.map((unit) => ({ unit, at: point(unit), before: unit.force })) : undefined
  const blade = berserker && step.operations.find(({ kind }) => kind === "d")
  const bladeMoves = berserker && step.operations.some(({ kind }) => kind === "p" || kind === "l")
  const bladeContacts = blade || bladeMoves ? targets.map((unit) => ({
    unit, at: point(unit), before: unit.force, bonus: !!blade && berserkerDamageBonus(battle, owner, unit, blade.style, shape),
  })) : undefined
  const paladinContacts = paladin && step.operations.some((op) => op.kind === "p" || op.kind === "d" && op.style !== "reflect")
    ? targets.map((unit) => ({ unit, at: point(unit), before: unit.force, hits: cast.trace.get(unit.id)?.effectiveHits ?? 0 })) : undefined
  const healthAtStart = step.operations.some((op) => op.style === "fullward")
    ? new Map(targets.map((target) => [target.id, hpPct(target)])) : undefined
  const armorContacts: { at: EdgePoint; end?: EdgePoint }[] = []
  const spellContacts = breaker ? targets.map((unit) => ({ unit, at: point(unit), hits: cast.trace.get(unit.id)?.effectiveHits ?? 0, force: unit.force })) : undefined
  const shadowContacts = shadow && step.operations.some((op) => ["d", "p", "l"].includes(op.kind))
    ? targets.map((unit) => ({ unit, at: point(unit), hits: cast.trace.get(unit.id)?.effectiveHits ?? 0, force: unit.force })) : undefined
  const mageContacts = mage && step.operations.some((op) => ["d", "p", "l"].includes(op.kind))
    ? targets.map((unit) => ({ unit, at: point(unit), hits: cast.trace.get(unit.id)?.effectiveHits ?? 0, force: unit.force, shield: unit.shield })) : undefined
  const lifeContacts = !derived && lifeArt(cast) && step.operations.some(op => op.kind === "d")
    ? targets.map(unit => ({ unit, at: point(unit), hits: cast.trace.get(unit.id)?.hits ?? 0 })) : undefined
  const binderDamage = binding && step.operations.some(op => op.kind === "d")
  const binderHalt = binding && step.operations.some(op => op.kind === "halt")
  const binderGuard = binding && step.operations.some(op => op.kind === "b")
  const binderContacts = binding ? targets.map(unit => ({ unit, at: point(unit), force: unit.force,
    move: unit.move, hits: cast.trace.get(unit.id)?.effectiveHits ?? 0 })) : undefined
  const lifeGroup = !derived && ["grove", "cluster", "mirrorbud"].includes(lifeArt(cast)?.motif ?? "") &&
    step.operations.some(op => op.kind === "h") ? targets.map(unit => ({
      unit, ratioBefore: hpPct(unit), healedBefore: cast.trace.get(unit.id)?.heal ?? 0,
    })) : undefined
  for (const [index, target] of targets.entries()) {
    const nextEvent = event ?? eventFor(cast, "cast", target)
    // Strike/receive/shove operations adjust the live event before damage or displacement is committed.
    const live = step.operations.some((op) => ["add", "addh", "addp", "take", "absorb"].includes(op.kind))
    const relay = cast.skill?.id === "ranger/Radiant/A3" && event?.kind === "hit" &&
      event.cast.id !== cast.id && event.source === cast.target ? event.source : undefined
    const release = (bard && event?.release) || (event?.cast.id !== cast.id ? event?.kind : undefined)
    const detail = live ? nextEvent : { ...nextEvent, index, total: targets.length, selector: step.selector, area: shape,
      visualSkill, relay, stepDelay: step.delay, release, hitGroup, lowBefore: healthAtStart?.get(target.id) ?? nextEvent.lowBefore }
    const before = armor && { hp: target.hp, force: target.force, at: point(target), impacts: battle.impacts.length, shield: target.shield,
      bonus: detail.bonus, scale: detail.scale, push: detail.push }
    if (warden && warden.motif === "rewind" && wardenDamage) {
      const recentStep = history(battle, target).positions.findLast(({ time, at }) =>
        battle.time - time <= 1.0 && edgeDistance(at, target) > 12)
      if (recentStep) traceAt(cast, target).approach = point(recentStep.at)
    }
    for (const op of step.operations) act(battle, cast, target, op, detail, derived)
    if (before) {
      const force = target.force !== before.force && target.force?.cause === cast ? target.force : undefined
      const adjusted = live && (detail.bonus !== before.bonus || detail.scale !== before.scale || detail.push !== before.push)
      const accepted = force || adjusted || battle.runtime.shieldCasts.get(target.id) === cast || target.hp !== before.hp || target.shield !== before.shield ||
        activeBuffs(battle, target.id).some((buff) => buff.cast === cast) ||
        battle.impacts.slice(before.impacts).some((hit) => hit.target === target.id && hit.kind === "block")
      if (accepted) {
        if ((rageTrait || shadowTrait || mageTrait) && cast.signature) cast.used.add("applied/" + cast.signature.id)
        if ((lifeTrait || danceTrait || healerTrait || bardTrait) && cast.signature) {
          const signature = cast.signature.id
          const applied = "applied/" + signature
          if (adjusted && detail.kind === "mend") {
            const confirmations = detail.mendConfirmed ??= []
            confirmations.push(() => {
              cast.used.add(applied)
              showDefenderTrait(battle, cast, "proc", target, detail, { target: target.id })
            })
            continue
          }
          if (bardTrait && adjusted && detail.kind === "strike") {
            const confirmations = detail.strikeConfirmed ??= []
            confirmations.push(() => {
              cast.used.add(applied)
              const beat = showDefenderTrait(battle, cast, "proc", target, detail, {
                target: target.id, area: detail.cast.bardRange?.area, contacts: [point(target)],
              })
              const baseline = signature === "bard/C/P2" ? detail.cast.bardGuideLimit
                : signature === "bard/E/P1" ? detail.cast.bardRange?.baseline : undefined
              if (beat && baseline !== undefined) beat.corner = along(detail.cast.from, direction(detail.cast.from, target), baseline)
            })
            continue
          }
          if (detail.kind !== "ward") {
            cast.used.add(applied)
            if (event && signature === "lifebringer/UC/P2") event.lifeSecondary = target.id
          }
        }
        if (binderTrait && cast.signature && detail.kind !== "ward") cast.used.add("applied/" + cast.signature.id)
        if (holyTrait && cast.signature && detail.kind !== "ward") {
          cast.used.add("applied/" + cast.signature.id)
          if (event && cast.signature.id === "paladin/C/P1") event.paladinRecipient = target.id
        }
        if (rageTrait && adjusted && (detail.kind === "strike" || detail.kind === "shove") &&
          step.operations.some((op) => op.kind === "addp")) {
          (detail.berserkerPush ??= []).push(cast)
        } else if (adjusted && detail.kind === "ward") {
          const confirmations = detail.wardConfirmed ??= []
          confirmations.push(() => {
            if ((holyTrait || lifeTrait || binderTrait || danceTrait || healerTrait || bardTrait) && cast.signature)
              cast.used.add("applied/" + cast.signature.id)
            showDefenderTrait(battle, cast, "proc", target, detail, { area: detail.area, contacts: [point(target)] })
          })
        } else armorContacts.push({ at: before.at, end: force ? point(force.end) : undefined })
      }
    }
    if (budget && capacity > 0) {
      const amount = Math.min(capacity, target.maxHp * ratio(budget.args[1] ?? 28))
      capacity -= heal(battle, cast, target, amount, "", detail, derived)
    }
    if (transfers) {
      const amount = target.maxHp * ratio(transfers.args[0])
      excess[index] = amount - heal(battle, cast, target, amount, "share", detail, derived)
    }
  }
  if (binderContacts) {
    const paths = binderContacts.flatMap(({ unit, at, force, move, hits }) => {
      const motion = unit.force && unit.force !== force && unit.force.cause === cast ? unit.force : undefined
      const ward = binderGuard && battle.runtime.shieldCasts.get(unit.id) === cast
      const stopped = binderHalt && move && !unit.move
      const controlled = unit.hp && step.operations.some(op => ["slow", "root", "short", "aimp", "anti", "tether"].includes(op.kind) &&
        activeBuffs(battle, unit.id, op.kind).some(buff => buff.cast === cast))
      const hit = (cast.trace.get(unit.id)?.effectiveHits ?? 0) > hits
      return ward || stopped || controlled || hit || motion ? [{ at, end: motion?.end ?? (stopped ? move : undefined), unit: unit.id }] : []
    })
    const where = shape?.center ?? paths[0]?.at
    if (where && (paths.length || binderDamage && !only)) showBinderBeat(battle, cast, "strike", where, {
      from: event?.from ?? cast.from, area: shape, paths,
      kind: binderGuard ? "ward" : binderHalt ? "halt" : event?.style === "bindercross" ? "cross"
        : step.operations.some(op => op.kind === "root") ? "root" : step.operations.some(op => op.kind === "l") ? "pull" : undefined,
    })
  }
  if (lifeGroup?.length) {
    const healed = lifeGroup.filter(row => (cast.trace.get(row.unit.id)?.heal ?? 0) > row.healedBefore)
      .sort((a, b) => a.ratioBefore - b.ratioBefore)
    if (healed.length) {
      const target = healed[0].unit
      emit(battle, { ...eventFor(cast, "heals", target, event), area: shape, total: healed.length,
        healedGroup: healed.map(row => ({ id: row.unit.id, at: point(row.unit) })),
        release: event?.cast.id !== cast.id ? event?.kind : undefined })
    }
  }
  if (armorContacts.length) {
    const first = armorContacts[0]
    const consumed = defenderWatchImpact(cast, event)
    const slide = wardTrait && step.operations.find((op) => op.kind === "dash" && op.style === "slide")
    const group = wardTrait && event?.pushGroup
    showDefenderTrait(battle, cast, slide ? "travel" : consumed ? "consume" : "proc", first.at, event, {
      from: consumed ? event?.cast.from : slide ? first.at : holyTrait?.pair === "outerflag" ? shape?.center : undefined,
      to: slide ? first.end : undefined, duration: slide ? slide.args[1] : undefined,
      area: shape ?? (wardTrait || holyTrait || lifeTrait || binderTrait || danceTrait || healerTrait || bardTrait ? event?.area : undefined),
      contacts: group ? group.map(({ from }) => from) : armorContacts.map(({ at }) => at),
      landings: group ? group.map(({ motion }) => point(motion.end)) : armorContacts.map(({ end }) => end),
    })
  }
  if (!armorContacts.length && mageTrait && gold && shape && step.operations.some(op => op.kind === "d" || op.kind === "p"))
    showDefenderTrait(battle, cast, "proc", shape.center, event, { area: shape, contacts: [] })
  if (shadowContacts) {
    const paths = shadowContacts.filter(({ unit, hits, force }) => (cast.trace.get(unit.id)?.effectiveHits ?? 0) > hits ||
      unit.force !== force && unit.force?.cause?.id === cast.id).map(({ unit, at }) => ({ at,
      end: unit.force?.cause?.id === cast.id ? point(unit.force.end) : undefined,
      bonus: shadow?.motif === "deathchase" && !!cast.assassinHitLow || shadow?.motif === "chasecircle" && !!cast.assassinHitPushed,
    }))
    if (paths.length || shape && !(shadow?.motif === "windshear" && step.selector.limit === 1)) showAssassinBeat(battle, cast, "strike", shape?.center ?? paths[0].at, {
      from: event?.from ?? cast.assassinLaunch ?? owner, area: shape, paths, target: cast.target, kind: event?.style,
    })
  }
  if (lifeContacts) {
    const paths = lifeContacts.filter(row => (cast.trace.get(row.unit.id)?.hits ?? 0) > row.hits)
      .map(row => ({ at: row.at, unit: row.unit.id }))
    if (paths.length || shape) showLifeBeat(battle, cast, "strike", shape?.center ?? paths[0].at, {
      area: shape, paths, target: cast.target,
    })
  }
  if (mageContacts) {
    const paths = mageContacts.filter(({ unit, hits, force, shield }) => (cast.trace.get(unit.id)?.effectiveHits ?? 0) > hits || unit.shield < shield ||
      unit.force !== force && unit.force?.cause?.id === cast.id).map(({ unit, at }) => ({ at, unit: unit.id,
      end: unit.force?.cause?.id === cast.id ? point(unit.force.end) : undefined }))
    if (paths.length || shape && step.operations.some((op) => op.kind === "d")) showWarlockBeat(battle, cast, "strike", shape?.center ?? paths[0].at, {
      from: event?.from ?? cast.warlockLaunch ?? owner, area: shape, paths, target: cast.target, kind: event?.style,
    })
  }
  if (spellContacts) {
    const impact = step.operations.some((op) => op.kind === "d" || op.kind === "p" || op.kind === "l")
    const paths = spellContacts.filter(({ unit, hits, force }) => impact &&
      ((cast.trace.get(unit.id)?.effectiveHits ?? 0) > hits || unit.force !== force && unit.force?.cause === cast))
      .map(({ unit, at }) => ({ at, end: unit.force?.cause === cast ? point(unit.force.end) : undefined }))
    if (paths.length || shape && step.operations.some((op) => op.kind === "d")) showSpellBeat(battle, cast, "strike", shape?.center ?? paths[0].at, {
      from: breaker?.motif === "wedgejump" ? owner : cast.from, area: shape, paths, target: cast.target,
    })
    const eraser = shape && step.operations.find((op) => op.kind === "erase")
    if (shape && eraser) eraseSpellField(battle, cast, shape, eraser.args[0] ?? 0, event)
  }
  if (cast.signature?.id === "berserker/E/G1" && shape && !armorContacts.length)
    showDefenderTrait(battle, cast, "proc", shape.center, event, { area: shape })
  if (contactPoints) {
    const hasDamage = step.operations.some(({ kind }) => kind === "d")
    const affected = contactPoints.filter(({ unit }) => hasDamage || unit.force?.cause?.id === cast.id)
    const first = affected[0]
    const strike = shape?.center ?? first?.at
    if (strike) showBulwarkBeat(battle, cast, "strike", strike, {
      from: owner, area: shape, contacts: affected.map(({ at }) => at),
      landings: affected.map(({ unit }) => unit.force?.cause?.id === cast.id ? point(unit.force.end) : undefined),
    })
  }
  if (wardenContacts) {
    const motions = wardenContacts.flatMap(({ unit, at, before }) => unit.force && unit.force !== before && unit.force.cause?.id === cast.id
      ? [{ id: unit.id, from: at, motion: unit.force }] : [])
    const paths = wardenContacts.flatMap(({ unit, at, before }) => {
      const force = unit.force && unit.force !== before && unit.force.cause?.id === cast.id ? unit.force : undefined
      return wardenDamage || force ? [{ at, end: force ? point(force.end) : undefined, past: cast.trace.get(unit.id)?.approach }] : []
    })
    const where = wardenDamage || paths.length ? shape?.center ?? paths[0]?.at : undefined
    if (where) showWardenBeat(battle, cast, "hit", where, {
      from: warden && warden.motif === "borrow" ? cast.wardenRoute?.to : undefined,
      other: warden && warden.motif === "borrow" ? cast.wardenRoute?.from : event?.at, area: shape, paths,
    })
    const leading = motions[0]
    if (leading && motions.length >= 2 && (warden && warden.motif === "divider" || warden && warden.motif === "gather" && !wardenDamage)) {
      const side = warden && warden.motif === "divider"
      emit(battle, { ...eventFor(cast, side ? "sweep" : "drawgroup", unitOf(battle, leading.id), event),
        total: motions.length, area: shape, style: side ? "side" : "pull", pushGroup: motions })
    }
    if (leading && isFighter(owner) && owner.gold && where && (
      warden && warden.motif === "exchange" && cast.used.has("warden/L/G1") ||
      warden && warden.motif === "gather" && wardenDamage && cast.used.has("warden/Radiant/G1")
    )) {
      const bumped = warden && warden.motif === "gather" ? motions.filter(({ id }) => !!cast.trace.get(id)?.pulledTo) : motions
      if (bumped.length) {
        const source = { ...cast, signature: { id: owner.gold.id, mark: owner.gold.artwork.end, origin: point(where) } }
        showDefenderTrait(battle, source, "consume", where, event, { area: shape,
          contacts: bumped.map(({ from }) => from), landings: bumped.map(({ motion }) => point(motion.end)) })
      }
    }
  }
  if (bladeContacts) {
    const paths = bladeContacts.flatMap(({ unit, at, before, bonus }) => {
      const motion = unit.force && unit.force !== before && unit.force.cause?.id === cast.id ? unit.force : undefined
      return blade || motion ? [{ at, end: motion ? point(motion.end) : undefined, bonus }] : []
    })
    const where = blade ? shape?.center ?? paths[0]?.at : paths[0]?.at
    if (where) {
      const lane = berserker && berserker.line ? cast.berserkerRoute : undefined
      showBerserkerBeat(battle, cast, "strike", where, {
        from: berserker && berserker.motif === "furnace" ? cast.berserkerLaunch ?? owner
          : berserker && berserker.motif === "backedge" ? cast.from : owner,
        axis: berserker && ["trinity", "flank"].includes(berserker.motif) && paths.length
          ? direction(owner, paths[0].at) : direction(lane?.from ?? cast.from, lane?.to ?? cast.aim),
        area: shape, paths, target: cast.target, kind: blade ? cast.berserkerFollow ? "boost" : "cut" : "force",
        other: event?.at,
      })
    }
  }
  if (berserker?.motif === "wheel" && blade && step.delay > 0 && owner.hp)
    emit(battle, { ...eventFor(cast, "swing", owner), at: shape?.center ?? cast.from, area: shape, stepDelay: step.delay })
  if (paladinContacts) {
    const paths = paladinContacts.flatMap(({ unit, at, before, hits }) => {
      const motion = unit.force && unit.force !== before && unit.force.cause?.id === cast.id ? unit.force : undefined
      return (cast.trace.get(unit.id)?.effectiveHits ?? 0) > hits || motion ? [{ at, unit: unit.id, end: motion && point(motion.end) }] : []
    })
    const where = paths[0]?.at ?? (event?.style === "zone" ? undefined : shape?.center)
    if (where) showPaladinBeat(battle, cast, "strike", where, {
      from: event?.intercept ?? (step.selector.shape === "L" ? cast.from : shape?.center ?? owner),
      area: shape, paths, target: cast.target, other: cast.paladinRoute?.to, kind: event?.style,
      axis: direction(cast.from, cast.aim),
    })
  }
  if (gold && goldTargets && isFighter(owner) && cast.signature) {
    const kind = step.operations[0]?.kind
    const affected = goldTargets.filter(({ unit, hp }) => {
      if (kind === "h") return unit.hp > hp
      if (kind === "b") return battle.runtime.shieldCasts.get(unit.id) === cast
      if (kind === "p" || kind === "l") return unit.force?.cause === cast
      if (kind === "anti" || kind === "root" || kind === "speed")
        return activeBuffs(battle, unit.id, kind).some((buff) => buff.cast === cast)
      return true
    })
    const endpoint = cast.signature.id === "summoner/E/G1" ? shape?.center : undefined
    const contact = affected[0]?.at ?? endpoint
    if (contact) {
      const noticeKey = cast.signature.id + "/notice"
      if (!cast.used.has(noticeKey)) {
        cast.used.add(noticeKey)
        flash(battle, owner.id, gold, true)
      }
      const cue = showSummonTrait(battle, owner, cast, "proc", contact, affected[0]?.unit ?? owner, event,
        { from: endpoint, area: shape, contacts: affected.map(({ at }) => at) })
      if (cue && (kind === "p" || kind === "l")) cue.landings = affected.map(({ unit }) => unit.force ? point(unit.force.end) : undefined)
    }
  }
  if (transfers && targets.length === 2) targets.forEach((target, i) => heal(battle, cast, target, excess[1 - i] ?? 0, "share", event, derived))
}

function register(battle: EdgeBattle, cast: SkillCast, step: Step, event?: SkillEvent, derived = false, gold?: string) {
  const holy = !derived && paladinArt(cast)
  const breaker = !derived && spellArt(cast)
  const binding = derived ? undefined : binderArt(cast)
  const dance = derived ? undefined : dancerArt(cast)
  const medic = !derived && healerArt(cast)
  const bard = !derived && bardArt(cast)
  if (step.watch) {
    const { holder, rule, uses, duration } = step.watch
    const chosen = select(battle, cast, holder, event, selectionArea(battle, cast, holder, event))
    for (const target of chosen) {
      if (bard && !bardCanArm(cast, holder, target)) continue
      if ((binding?.motif === "cuffWard" || binding?.motif === "relayCuff") && battle.runtime.shieldCasts.get(target.id) !== cast) continue
      if (lifeArt(cast) && (rule.flags.includes("sameShield") || lifeArt(cast)?.motif === "seed") &&
        battle.runtime.shieldCasts.get(target.id) !== cast) continue
      if ((holy || breaker || warlockArt(cast)) && rule.flags.includes("sameShield") && battle.runtime.shieldCasts.get(target.id) !== cast) continue
      const armed = holy && !battle.runtime.watches.some((watch) => watch.cast === cast && watch.target === target.id && watch.uses > 0)
      if (resolvedTraitArt(cast.signature?.id) && !battle.runtime.watches.some((watch) =>
        watch.target === target.id && watch.cast.id === cast.id && watch.cast.signature?.id === cast.signature?.id)) {
        showDefenderTrait(battle, cast, "proc", target, event)
      }
      const markEvent = dance ? { ...eventFor(cast, "cast", target, event), from: point(target) } : event
      attach(battle, { id: effectKey(cast, rule.event + step.selector.units + step.operations.map((o) => o.kind).join("")),
        cast, rule, target: target.id, step: { ...step, watch: undefined }, event: markEvent, uses, until: battle.time + duration, derived, gold })
      if (dance) showDancerBeat(battle, cast, "mark", target, { target: target.id, kind: rule.event, other: markEvent?.from })
      if (medic) showHealerBeat(battle, cast, "arm", target, { target: target.id, kind: rule.event })
      if (bard && !(bard.motif === "longLead" && rule.event === "hit"))
        showBardBeat(battle, cast, "arm", target, {
          target: target.id, kind: rule.event, count: uses,
          other: bard.motif === "duet" ? unitOf(battle, target.id === cast.owner ? cast.target : cast.owner) : undefined,
        })
      if (lifebringerTraitArt(cast.signature?.id) || binderTraitArt(cast.signature?.id) || dancerTraitArt(cast.signature?.id) ||
        healerTraitArt(cast.signature?.id) || bardTraitArt(cast.signature?.id))
        cast.used.add("applied/" + cast.signature!.id)
      if (!derived && wardenArt(cast)?.motif === "relay") showWardenBeat(battle, cast, "arm", target, { target: target.id })
      const berserker = !derived && berserkerArt(cast)
      if (berserker && (berserker.motif === "answer" || berserker.motif === "emberwatch"))
        showBerserkerBeat(battle, cast, "arm", target, { target: target.id, kind: "watch" })
      if (armed) showPaladinBeat(battle, cast, "arm", target, { target: target.id, kind: rule.event })
      if (armed && holy?.motif === "vow") emit(battle, { ...eventFor(cast, "assist", target, event), style: "vow" })
      if (breaker) showSpellBeat(battle, cast, "arm", target, { target: target.id, kind: rule.event })
      if (!derived) showAssassinBeat(battle, cast, "arm", target, { target: target.id, kind: rule.event })
      if (!derived) showWarlockBeat(battle, cast, "arm", target, { target: target.id, kind: rule.event })
      if (!derived) showLifeBeat(battle, cast, "arm", target, { target: target.id, kind: "watch", duration })
    }
    return
  }
  if (step.zone) {
    const danceRail = dance && dancerFieldRail(cast, step)
    const area = danceRail?.area ?? stepArea(battle, cast, step, event)
    if (!area) return
    const owner = unitOf(battle, cast.owner)
    const pool = step.operations.find((op) => op.kind === "wall")
    const type = step.zone.event
    battle.runtime.fields = battle.runtime.fields.filter((field) => !(field.cast.owner === cast.owner &&
      field.cast.skill?.id === cast.skill?.id && field.step === step))
    const field: FieldEffect = {
      id: ++battle.nextFx, cast, area, step, mode: type, seen: new Set(), previous: new Set(), time: battle.time,
      until: battle.time + step.zone.duration, next: battle.time,
      capacity: pool && owner ? owner.maxHp * ratio(pool.args[0]) : type === "wall" ? Infinity : 0, derived, event, gold, danceRail,
    }
    battle.runtime.fields.push(field)
    if (bard && type === "bardentry")
      field.previous = new Set(select(battle, cast, step.selector, event, area).map(unit => unit.id))
    if (!derived) emit(battle, { ...eventFor(cast, "deploy", owner), area, at: area.center, zone: true })
    if (!derived && wardenArt(cast)) showWardenBeat(battle, cast, "deploy", area.center, { area })
    if (holy && !cast.used.has("paladinField")) {
      cast.used.add("paladinField")
      showPaladinBeat(battle, cast, "deploy", area.center, { area })
    }
    if (breaker) showSpellBeat(battle, cast, "deploy", area.center, { area })
    if (!derived) showAssassinBeat(battle, cast, "deploy", area.center, { area })
    if (!derived) showWarlockBeat(battle, cast, "deploy", area.center, { area })
    if (!derived) showLifeBeat(battle, cast, "deploy", area.center, { area })
    if (binding) showBinderBeat(battle, cast, "deploy", area.center, { area })
    if (dance) showDancerBeat(battle, cast, "deploy", area.center, {
      area, from: danceRail?.path.points[0], paths: danceRail && [{ route: danceRail.path }],
      other: danceRail?.corner, duration: .78,
    })
    if (medic) showHealerBeat(battle, cast, "field", area.center, { area, kind: type })
    if (bard) showBardBeat(battle, cast, "deploy", area.center, { area, kind: type })
    if (defenderTraitArt(cast.signature?.id) || paladinTraitArt(cast.signature?.id) || assassinTraitArt(cast.signature?.id) ||
      warlockTraitArt(cast.signature?.id) || lifebringerTraitArt(cast.signature?.id) || binderTraitArt(cast.signature?.id) ||
      dancerTraitArt(cast.signature?.id) || bardTraitArt(cast.signature?.id))
      showDefenderTrait(battle, cast, "proc", area.center, event, { area, contacts: [area.center] })
    if (type === "enter" || type === "first" || type === "tick" || type === "closing" ||
      type === "leave" && (holy || lifeArt(cast)?.motif === "forestexit")) tickField(battle, field, 0)
    return
  }
  applyStep(battle, cast, step, event, derived, undefined, undefined, gold)
}

function finishCast(battle: EdgeBattle, cast: SkillCast) {
  if (cast.pending || cast.used.has("after")) return
  cast.used.add("after")
  if (cast.used.has("wardenManual")) {
    const owner = unitOf(battle, cast.owner)
    if (owner) history(battle, owner).wardenInside = !!owner.hp && !cast.outside && !isOutside(owner) && !cast.used.has("wardenChain")
  }
  settleScore(battle, cast)
  if ((cast.bardSeats?.length ?? 0) >= 2) {
    const recipient = unitOf(battle, cast.firstWard)
    if (recipient?.hp && cast.bardSeats)
      emit(battle, { ...eventFor(cast, "assist", recipient), style: "bardOverture",
        from: cast.bardSeats[0].from, bardPartners: cast.bardSeats.map(row => row.from), landing: point(recipient),
        total: cast.bardSeats.length,
      })
  }
  if (cast.healerHeals && cast.healerHeals.size >= 2) {
    const group = [...cast.healerHeals.values()].filter(row => unitOf(battle, row.id)?.hp)
    const motif = healerArt(cast)?.motif
    const pivot = motif === "twoWay" ? cast.target : motif === "dualRoute" ? group[1]?.id
      : [...group].sort((a, b) => a.before - b.before)[0]?.id
    const recipient = unitOf(battle, pivot)
    if (group.length >= 2 && recipient?.hp) emit(battle, {
      ...eventFor(cast, "heals", recipient), healedGroup: group, total: group.length, area: cast.healerArea,
    })
  }
  const target = unitOf(battle, cast.target ?? [...cast.trace.keys()][0])
  emit(battle, eventFor(cast, "after", target))
}

function settleScore(battle: EdgeBattle, cast: SkillCast) {
  if (cast.order === "enemy" || cast.summon || !cast.used.has("manual") || cast.used.has("score")) return
  const actor = unitOf(battle, cast.owner)
  if (!actor || !isFighter(actor)) return
  const target = cast.protection && unitOf(battle, cast.protection.target)
  const struck = [...cast.trace].find(([id, trace]) => !friendly(battle, cast.owner, id) && (trace.effectiveHits ?? 0) > 0)
  if (!target?.hp && !struck) return
  const score = spendBuff(battle, actor, "score")
  if (!score) return
  cast.used.add("score")
  const own = score.cast
  const first = own.used.has("bardFirstScore") ? 1 : 0
  own.used.add("bardFirstScore")
  const activated = (contact: EdgePoint, amount: number) => emit(battle, { ...eventFor(own, "assist", actor), attacker: actor.id,
    attackCast: cast, at: point(contact), from: point(contact), style: "score", index: first, amount,
  })
  if (target?.hp && cast.protection) {
    const amount = Math.round(target.maxHp * ratio(score.values[1] ?? 10))
    let added = 0
    if (cast.protection.kind === "shield" && shielded(battle, target) && battle.runtime.shieldCasts.get(target.id) === cast) {
      target.shield += amount
      target.shieldStart = (target.shieldStart ?? target.shield - amount) + amount
      const trace = cast.trace.get(target.id)
      if (trace) trace.shieldValue = target.shield
      impact(battle, actor, target, amount, "shield")
      added = amount
    } else if (cast.protection.kind === "heal") added = heal(battle, own, target, amount, "score", undefined, true)
    showBardBeat(battle, own, "release", target, {
      from: actor, target: target.id, kind: cast.protection.kind, amount: added, other: actor,
    })
    activated(target, added)
  } else if (struck) {
    const contact = struck[1].at
    const incoming = { ...eventFor(cast, "hit", unitOf(battle, struck[0])), from: point(actor), at: contact }
    activated(contact, 1)
    bardCircleHit(battle, own, contact, score.values[3] ?? 90, score.values[2] ?? .62, .23, "scorehit", incoming, hits => {
      if (!hits.length) return
      emit(battle, { ...eventFor(own, "assist", actor), attacker: actor.id, attackCast: cast, at: contact,
        from: incoming.from, style: "scorehit", amount: hits.length,
      })
    })
  }
}

function stepArea(battle: EdgeBattle, cast: SkillCast, step: Step, event?: SkillEvent) {
  const selector = step.zone?.holder ?? step.selector
  const danceRail = dancerFieldRail(cast, step)
  if (danceRail) return danceRail.area
  if (step.zone?.event === "track" && selector.shape === "L") {
    const from = inside(cast.from)
    const length = Math.min(selector.size[0], edgeDistance(from, cast.aim))
    return areaOf("L", from, direction(from, cast.aim), length, selector.size[1])
  }
  return selectionArea(battle, cast, selector, event)
}

function projectedSkillRoute(battle: EdgeBattle, cast: SkillCast, picked = unitOf(battle, cast.target)) {
  const holy = paladinArt(cast)
  const breaker = spellArt(cast)
  const shadow = assassinArt(cast)
  const mage = warlockArt(cast)
  if ((!wardenArt(cast) && !berserkerArt(cast)?.travel && !holy?.travel && !holy?.swap && !breaker?.travel && !shadow?.travel && !mage?.travel) || !cast.skill) return
  const first = breaker || shadow || mage ? cast.skill.steps.find((step) => step.operations.some((op) => op.kind === "dash")) : cast.skill.steps[0]
  if (!first) return
  const owner = unitOf(battle, cast.owner)
  if (!owner) return
  const move = first.operations.find((op) => op.kind === "dash" || op.kind === "swap")
  if (!move) return
  if (move.kind === "swap") {
    if (picked?.hp && !isOutside(owner) && !isOutside(picked)) return { from: point(owner), to: point(picked), swap: true, movesOwner: true }
    return
  }
  const body = first.selector.units === "t" ? picked : owner
  const to = body && dashLanding(battle, cast, body, move.args[0], move.style, undefined, move.args[1], false, picked)
  if (body && to) return { from: point(body), to, swap: false, movesOwner: body === owner }
}

function routedSkillArea(battle: EdgeBattle, cast: SkillCast, step: Step, route?: ReturnType<typeof projectedSkillRoute>) {
  const selector = step.zone?.holder ?? step.selector
  if (route?.movesOwner && selector.shape === "C" && selector.anchor === "s") {
    return areaOf("C", route.to, direction(cast.from, cast.aim), selector.size[0])
  }
  const ranged = route ? assassinArt(cast) ? { ...cast, assassinRoute: route } : spellArt(cast) ? { ...cast, spellRoute: route } : paladinArt(cast) ? { ...cast, paladinRoute: route }
    : berserkerArt(cast) ? { ...cast, berserkerRoute: route } : { ...cast, wardenRoute: route } : cast
  return stepArea(battle, ranged, step)
}

function rangerDisplacement(battle: EdgeBattle, cast: SkillCast, event: SkillEvent | undefined, from: EdgePoint, to: EdgePoint, duration: number) {
  const skill = event?.visualSkill ?? (!event?.derived ? cast.skill?.id : undefined)
  if (!skill || !rangerChoreography(skill)) return
  const owner = unitOf(battle, cast.owner)
  if (!owner || !isFighter(owner)) return
  showSkillVisual(battle, owner, skill, {
    phase: "motion", mark: { motion: "step", glyph: "feather" }, from, to, beat: cast.stage, cast: cast.id,
    gold: skill.includes("/G"), start: battle.time, end: battle.time + duration + .16,
  })
}

function rangerGoldOrigin(battle: EdgeBattle, cast: SkillCast, scene: RangerChoreography, event?: SkillEvent): EdgePoint {
  switch (scene.motif) {
    case "followThrough": return cast.from
    case "sentryFeather": case "mirrorWard": return cast.aim
    case "kickback": return event?.from ?? cast.from
    case "fifthRefraction": return cast.skill && stepArea(battle, cast, cast.skill.steps[0])?.star?.at(-1) || cast.aim
    default: return event?.at ?? cast.from
  }
}

function queueRangerBeat(
  battle: EdgeBattle, cast: SkillCast, step: Step, beat: number, delay: number,
  skill: EdgeActive | EdgeGold, scene: RangerChoreography, event?: SkillEvent, gold?: string,
) {
  if (delay <= 0 || step.watch || step.zone || !step.operations.some((op) => ["d", "p", "i", "b", "h"].includes(op.kind))) return
  if ((scene.motif === "bundle" || scene.motif === "longString") && beat > 1) return
  const arrival = battle.time + delay
  const publish = (phase: "windup" | "travel", span: number) => {
    if (span <= 0) return
    const run = () => {
      const owner = unitOf(battle, cast.owner)
      if (!owner || !isFighter(owner)) return
      const area = stepArea(battle, cast, step, event)
      const following = step.selector.anchor === "t" ? unitOf(battle, cast.target) : undefined
      const direct = !area || scene.motif === "slide" || scene.motif === "followShot" || scene.motif === "relay" && beat > 1 ||
        scene.motif === "sentryFeather" || scene.motif === "thirdKink"
      const picked = direct ? select(battle, cast, step.selector, event, area)[0] : undefined
      if (direct && !picked) return
      const polygon = area?.parts[0]
      const ends = step.selector.shape === "L" && polygon?.kind === "polygon" && polygon.points.length === 4
        ? [along(polygon.points[0], direction(polygon.points[0], polygon.points[1]), edgeDistance(polygon.points[0], polygon.points[1]) / 2),
          along(polygon.points[2], direction(polygon.points[2], polygon.points[3]), edgeDistance(polygon.points[2], polygon.points[3]) / 2)]
        : undefined
      const prior = cast.target !== undefined ? cast.trace.get(cast.target)?.at : undefined
      const from = gold ? rangerGoldOrigin(battle, cast, scene, event)
        : scene.motif === "reflection" && beat > 1 ? cast.aim
        : scene.motif === "relay" && beat > 1 ? prior ?? cast.from
        : scene.motif === "slide" ? owner : scene.motif === "followShot" ? unitOf(battle, cast.target) ?? cast.from : ends?.[0] ?? cast.from
      const to = picked ?? area?.center ?? cast.aim
      const back = scene.motif === "boomerang" && beat > 1 && ends
      showSkillVisual(battle, owner, skill.id, {
        phase, mark: phase === "travel" ? skill.artwork.path ?? skill.artwork.start : skill.artwork.start,
        from: back ? back[1] : from, to: back ? back[0] : ends?.[1] ?? to,
        target: picked?.id ?? (following?.hp ? following.id : undefined), area, beat, cast: cast.id, gold: !!gold,
        outcome: stepOutcome(step), start: battle.time, end: arrival,
      })
    }
    const lead = delay - span
    if (lead > .001) later(battle, lead, run)
    else run()
  }
  const rim = step.selector.shape === "N"
  const relay = scene.motif === "relay" && beat > 1
  if (scene.motif !== "pentagram" && !relay) publish("windup", Math.min(delay, scene.windup))
  if (!rim) publish("travel", Math.min(delay, scene.flight, relay ? Math.max(0, step.delay - .02) : delay))
}

function berserkerTargetInReach(battle: EdgeBattle, cast: SkillCast, owner: EdgeUnit, from: EdgePoint = owner) {
  if (cast.skill?.aim.mode !== "enemy") return true
  const target = unitOf(battle, cast.target)
  return !!target?.hp && !activeBuffs(battle, target.id, "phase").length && edgeDistance(from, target) <= cast.skill.aim.range
}

export function berserkerMotionEnd(battle: EdgeBattle, cast: SkillCast, owner: EdgeUnit, step: Step,
  target = unitOf(battle, cast.target), commit = false) {
  const op = step.operations[0]
  return dashLanding(battle, cast, owner, op.args[0], op.style, undefined, 0, commit, target)
    ?? (berserkerArt(cast)?.motif === "trinity" ? point(owner) : undefined)
}

function runBerserkerMotion(battle: EdgeBattle, cast: SkillCast, owner: EdgeUnit, steps: Step[], duration: number, lead: number) {
  const groups = new Map<number, Step[]>()
  for (const step of steps) {
    const group = groups.get(step.delay) ?? []
    group.push(step)
    groups.set(step.delay, group)
  }
  const finish = () => {
    cast.pending--
    finishCast(battle, cast)
  }
  cast.pending += groups.size
  let leg = 0
  for (const [delay, [takeoff, ...arrival]] of groups) {
    const beat = ++leg
    const start = () => {
      if (!owner.hp || owner.force || cast.used.has("rageInterrupted") || !berserkerTargetInReach(battle, cast, owner)) {
        cast.used.add("rageInterrupted")
        finish()
        return
      }
      const before = point(owner)
      const end = berserkerMotionEnd(battle, cast, owner, takeoff, undefined, true)
      if (!end) {
        cast.used.add("rageInterrupted")
        finish()
        return
      }
      cast.berserkerLeg = beat
      cast.berserkerRoute = { from: before, to: point(end) }
      const axis = edgeDistance(before, end) > 3 ? direction(before, end) : direction(before, cast.aim)
      const motion = forceTo(battle, owner, end, duration, false, cast)
      if (motion) showBerserkerBeat(battle, cast, "travel", end, { from: before, axis, target: owner.id, duration })
      later(battle, duration, () => {
        if (!owner.hp || motion && !motion.completed || owner.force || edgeDistance(owner, end) > 3 ||
          !berserkerTargetInReach(battle, cast, owner)) {
          cast.used.add("rageInterrupted")
          finish()
          return
        }
        if (motion) {
          cast.used.add("dash")
          history(battle, owner).from = before
          emit(battle, { ...eventFor(cast, "dash", owner), from: before, landing: point(owner), distance: edgeDistance(before, owner), style: "dash" })
        }
        showBerserkerBeat(battle, cast, "arrival", owner, { from: before, axis, target: owner.id })
        cast.outside = isOutside(owner)
        for (const step of arrival) {
          cast.stage++
          register(battle, cast, step)
        }
        finish()
      })
    }
    if (delay + lead > 0) later(battle, delay + lead, start)
    else start()
  }
}

function paladinTargetReady(battle: EdgeBattle, cast: SkillCast, from: EdgePoint) {
  const aim = cast.skill?.aim
  if (!aim || aim.mode === "self" || aim.mode === "point" || aim.mode === "direction") return true
  const target = unitOf(battle, cast.target)
  if (!target?.hp || edgeDistance(from, target) > aim.range) return false
  if (aim.mode === "enemy") return !activeBuffs(battle, target.id, "phase").length
  return !paladinArt(cast)?.travel || !isOutside(target)
}

function spellTargetReady(battle: EdgeBattle, cast: SkillCast, owner: EdgeUnit) {
  if (!owner.hp || !cast.skill) return false
  if (!["enemy", "ally", "other"].includes(cast.skill.aim.mode)) return true
  const target = unitOf(battle, cast.target)
  return !!target?.hp && edgeDistance(owner, target) <= cast.skill.aim.range &&
    (cast.skill.aim.mode !== "enemy" || !activeBuffs(battle, target.id, "phase").length)
}

function runSpellMotion(battle: EdgeBattle, cast: SkillCast, steps: Step[], lead: number) {
  const owner = unitOf(battle, cast.owner)
  const art = spellArt(cast)
  if (!owner || !art) return
  const dash = steps.findIndex((step) => step.operations.some((op) => op.kind === "dash"))
  cast.pending++
  const finish = () => { cast.pending--; finishCast(battle, cast) }
  later(battle, lead, () => {
    if (owner.force || isOutside(owner) || !spellTargetReady(battle, cast, owner)) { finish(); return }
    for (const step of steps.slice(0, dash)) { cast.stage++; register(battle, cast, step) }
    if (dash > 0 && !cast.hitStages.size) { finish(); return }
    cast.stage++
    register(battle, cast, steps[dash])
    const motion = unitOf(battle, owner.id)?.force
    later(battle, art.travel, () => {
      if (owner.hp && cast.used.has("dasharrived") && (!motion || motion.completed) && !owner.force) {
        for (const step of steps.slice(dash + 1)) { cast.stage++; register(battle, cast, step) }
      }
      finish()
    })
  })
}

function relayPaladinHeal(battle: EdgeBattle, cast: SkillCast, step: Step) {
  const hit = cast.target === undefined ? undefined : cast.trace.get(cast.target)
  if (!hit?.effectiveHits) return
  const contact = point(hit.at)
  const area = areaOf("C", contact, { x: 1, y: 0 }, step.selector.size[0])
  const target = select(battle, cast, step.selector, undefined, area)[0]
  if (!target) return
  const span = clamp(edgeDistance(contact, target) / 550, .18, .32)
  cast.pending++
  showPaladinBeat(battle, cast, "flight", target, { from: contact, target: target.id, duration: span, kind: "chain", reach: step.selector.size[0] })
  later(battle, span, () => {
    if (target.hp && areaHits(area, target)) applyStep(battle, cast, step, {
      ...eventFor(cast, "cast", target), from: contact,
    }, false, area, [target])
    cast.pending--
    finishCast(battle, cast)
  })
}

export function runSteps(battle: EdgeBattle, cast: SkillCast, steps: Step[], event?: SkillEvent, derived = false, gold?: string, lead = 0) {
  const track = !derived
  const owner = unitOf(battle, cast.owner)
  const skill = gold && owner && isFighter(owner) ? owner.gold : track ? cast.skill : undefined
  const choreography = skill && rangerChoreography(skill.id)
  const bulwark = track ? bulwarkArt(cast) : undefined
  const warden = track ? wardenArt(cast) : undefined
  const berserker = track ? berserkerArt(cast) : undefined
  const paladin = track ? paladinArt(cast) : undefined
  const breaker = track ? spellArt(cast) : undefined
  if (breaker?.travel) {
    runSpellMotion(battle, cast, steps, lead)
    return
  }
  if (paladin?.travel && lead > 0) {
    cast.pending++
    later(battle, lead, () => {
      runSteps(battle, cast, steps, event, derived, gold)
      cast.pending--
      finishCast(battle, cast)
    })
    return
  }
  if (owner && berserker && berserker.travel) {
    runBerserkerMotion(battle, cast, owner, steps, berserker.travel, lead)
    return
  }
  const afterbeat = berserker && ["scar", "wheel", "armorbreak", "backedge", "pulseaxe"].includes(berserker.motif)
  if (track) cast.pending += steps.length
  for (const [i, step] of steps.entries()) {
    if (battle.finishedAt !== null) break
    const travel = i > 0 ? (warden ? warden.travel : paladin?.travel) ?? 0 : 0
    const pay = berserker && step.operations.some((op) => op.kind === "cost")
    const delay = step.delay + (pay ? 0 : lead) + travel
    const afterHit = warden && i > 0 && (warden.motif === "spring" || warden.motif === "relay")
    const afterSwap = warden && i > 0 && (warden.motif === "exchange" || warden.motif === "parallel")
    const run = () => {
      if (track) cast.stage++
      if (berserker) cast.berserkerLeg = cast.berserkerFollow || afterbeat && step.delay > 0 ? 2 : 1
      const target = (bulwark && bulwark.motif === "rimstrike" || warden && i === 0 && cast.skill?.aim.mode === "enemy") && unitOf(battle, cast.target)
      const inReach = !target || !!owner && edgeDistance(owner, target) <= (cast.skill?.aim.range ?? 0)
      const bleed = berserker && berserker.motif === "scar" && step.delay > 0
      const launched = berserker && berserker.motif === "furnace" && cast.berserkerLaunch
      const rageReady = !berserker || !!owner && (pay || (owner.hp || bleed || launched) &&
        (berserker.motif !== "furnace" || !!launched) &&
        (bleed ? cast.hitStages.size > 0 : step.selector.units === "t" ? berserkerTargetInReach(battle, cast, owner, launched || owner)
          : cast.skill?.aim.mode !== "enemy" || cast.hitStages.size > 0))
      const chain = paladin?.motif === "chain" && i > 0
      const mark = step.watch && paladin && ["vow", "burning", "spear"].includes(paladin.motif)
      const palReady = !paladin || !!owner && (!!owner.hp || !!cast.paladinLaunch || chain) &&
        (paladin.swap && i > 0 ? !!cast.paladinRoute?.swap : chain || paladinTargetReady(battle, cast, cast.paladinLaunch ?? owner)) &&
        (!paladin.travel || i > 0 || !owner.force && !isOutside(owner)) &&
        (!mark || cast.target !== undefined && !!cast.trace.get(cast.target)?.effectiveHits)
      const spellReady = !breaker || !!owner && spellTargetReady(battle, cast, owner) &&
        (!step.watch || cast.target === undefined || cast.trace.get(cast.target)?.hits ||
          ["hollow", "cutoff"].includes(breaker.motif))
      if (spellReady && rageReady && (!(bulwark || warden) || delay === 0 || owner?.hp) && inReach && (!travel || cast.used.has("dasharrived")) &&
        (!afterHit || cast.hitStages.size > 0) && (!afterSwap || cast.used.has("swapped")) && palReady) {
        if (chain) relayPaladinHeal(battle, cast, step)
        else register(battle, cast, step, event, derived, gold)
      }
      if (track) {
        cast.pending--
        finishCast(battle, cast)
      }
    }
    if (delay > 0) {
      if (skill && choreography) queueRangerBeat(battle, cast, step, i + 1, delay, skill, choreography, event, gold)
      const shape = step.watch ? undefined : stepArea(battle, cast, step, event)
      const follows = step.selector.anchor && ["t", "s", "j", "h"].includes(step.selector.anchor)
      const warning = shape && !bulwark && !warden && !berserker && !paladin && !breaker &&
        visual(battle, cast, shape, "warning", delay, gold, !step.zone && !follows ? stepOutcome(step) : undefined)
      if (warning && warning.effect === "damage") {
        warning.damagePower = step.operations.find(op => op.kind === "d")?.args[0]
        const pushed = areaShove(step) ? step : steps.find(other => other.delay === step.delay && areaShove(other) &&
          other.selector.shape === step.selector.shape && other.selector.anchor === step.selector.anchor &&
          other.selector.offset === step.selector.offset && other.selector.turn === step.selector.turn &&
          other.selector.size.length === step.selector.size.length && other.selector.size.every((size, index) => size === step.selector.size[index]))
        if (pushed) attachShove(warning, cast, pushed)
      }
      const power = step.operations.find(op => op.kind === "d")?.args[0]
      const fixedPush = !warning && !travel && !afterHit && !afterSwap &&
        (!step.selector.anchor || step.selector.anchor === "o" || step.selector.anchor === "p") && step.selector.units !== "k" &&
        (bulwark || warden || berserker || paladin || breaker) ? areaShove(step) : undefined
      if (shape && (fixedPush || power && (warden?.motif === "hammer" || berserker?.motif === "crossfire" ||
        paladin?.motif === "horizon" || breaker?.motif === "erasure"))) {
        const threat = visual(battle, cast, shape, "warning", delay, undefined, power ? "damage" : "control")
        threat.custom = true
        threat.damagePower = power
        if (fixedPush) attachShove(threat, cast, step, fixedPush)
      }
      if (breaker?.motif === "shieldpick" && i === 1) later(battle, lead, () => {
        const picked = unitOf(battle, cast.target)
        if (owner?.hp && picked?.hp) showSpellBeat(battle, cast, "prepare", picked, { from: owner, target: picked.id, kind: "second", duration: step.delay })
      })
      if (paladin?.motif === "cleanse" && i === 1 && step.delay > 0) later(battle, lead, () => {
        const picked = unitOf(battle, cast.target)
        if (owner?.hp && picked?.hp && paladinTargetReady(battle, cast, owner))
          showPaladinBeat(battle, cast, "prepare", picked, { from: owner, target: picked.id, kind: "afterstrip", duration: step.delay })
      })
      if (berserker && afterbeat && step.delay > 0 && owner) {
        const reprise = () => {
          if (berserker.motif === "scar" && cast.hitStages.size === 0) return
          const area = stepArea(battle, cast, step, event)
          const target = unitOf(battle, cast.target)
          showBerserkerBeat(battle, cast, "prepare", area?.center ?? target ?? cast.aim, {
            from: berserker.motif === "backedge" ? cast.from : owner, area, target: target?.id, duration: step.delay, beat: 2,
          })
        }
        if (lead > 0) later(battle, lead, reprise)
        else reprise()
      }
      if (warden && i > 0 && step.delay > 0 && !travel) {
        const brace = () => {
          if (warden.motif === "spring" && cast.hitStages.size === 0) return
          const target = unitOf(battle, cast.target)
          const paths = warden.motif === "rewind" ? [...cast.trace.values()].filter((record) => record.hits)
            .map((record) => ({ at: point(record.at), past: record.approach && point(record.approach) })) : undefined
          if (shape && warden.motif === "rewind" && paths?.length) {
            const threat = visual(battle, cast, shape, "warning", step.delay, undefined, "control")
            threat.custom = true
            attachShove(threat, cast, step)
          }
          showWardenBeat(battle, cast, "prepare", shape?.center ?? target ?? cast.aim, {
            area: shape, target: target?.id, from: cast.from, paths, beat: i + 1, duration: step.delay, windup: true,
          })
        }
        if (lead > 0) later(battle, lead, brace)
        else brace()
      }
      if (warning && follows) {
        const refresh = () => {
          const next = selectionArea(battle, cast, step.selector, event)
          if (next) warning.area = next
          if (warning.until - battle.time > 0.05) later(battle, 0.05, refresh)
        }
        later(battle, 0.05, refresh)
      }
      const { units, shape: code, anchor, flags, limit, exclude } = step.selector
      const plainDamage = track && cast.skill && !event && !step.watch && !step.zone && !flags.length && !limit && !exclude &&
        !travel && !afterHit && !afterSwap && !berserker && !paladin?.travel && !paladin?.swap && !paladin?.delivery &&
        step.operations.find(op => op.kind === "d" && !op.style && op.args.length === 1)
      let strike: PendingStrike | undefined
      // Only publish contacts with known geometry and no earlier-hit dependency.
      const fixedGeometry = code === "C" || code === "L" && !bulwark ||
        code === "B" && warden?.motif === "gate" || code === "S" && choreography?.motif === "pentagram"
      if (plainDamage && shape && fixedGeometry &&
        units === "e" && (!anchor || ["p", "o", "m", "c"].includes(anchor)) &&
        cast.skill && ["self", "point", "direction"].includes(cast.skill.aim.mode)) {
        const limitedPush = cast.skill.id === "ranger/Prismatic/A2" ? steps[i + 1] : undefined
        const rim = choreography?.motif === "sunset" && i === 0 ? steps[i + 1] : undefined
        const rimArea = rim && stepArea(battle, cast, rim, event)
        const rimPush = rim && rimArea ? { step: rim, area: rimArea } : undefined
        strike = { cast, power: plainDamage.args[0], area: shape, step, needsOwner: !!(warden || bulwark || breaker || paladin), limitedPush, rimPush }
      } else if (plainDamage && breaker && i === 0 && units === "t" && !shape && cast.target !== undefined && cast.skill?.aim.mode === "enemy") {
        strike = { cast, power: plainDamage.args[0], target: cast.target, range: cast.skill.aim.range }
      } else if (plainDamage && choreography && i === 0 && units === "t" && !shape && cast.target !== undefined && cast.skill?.aim.mode === "enemy") {
        strike = { cast, power: plainDamage.args[0], target: cast.target, step }
      } else if (track && !event && berserker?.motif === "crossfire" && i === 0 && shape) {
        strike = fixedAreaStrike(cast, step, shape, true)
      } else if (track && !event && berserker?.motif === "furnace" && i === 0 && power && cast.target !== undefined && cast.berserkerLaunch) {
        strike = { cast, power, step, target: cast.target, launchedFrom: cast.berserkerLaunch, deliveryRange: cast.skill!.aim.range }
      }
      if (warning && strike && "area" in strike && (!warning.shove || warning.shove.step === step)) warning.strike = strike
      const sameSwap = units === "t" && !!(warden?.motif === "parallel" || paladin?.swap) && step.delay === steps[0].delay
      const breakerWard = breaker?.motif === "antiphase" && i === 0
      const independent = track && cast.used.has("manual") && !event && !travel && !afterHit && !berserker && (!breaker || breakerWard) &&
        (!afterSwap && !paladin?.swap || sameSwap) && !paladin?.travel && !paladin?.delivery && !cast.skill?.deployment
      const wardTarget = units === "s" ? cast.owner : units === "t" && !flags.length ? cast.target : undefined
      const fixedSupportArea = shape && units === "a" && (!anchor || anchor === "p" || anchor === "o") ? shape : undefined
      const support = independent &&
        scheduledSupport(cast, step, !!(bulwark || warden || paladin || breaker), fixedSupportArea, wardTarget,
          units === "t" && (paladin || sameSwap || breakerWard) ? cast.skill?.aim.range : undefined)
      later(battle, delay, run, strike, support ? { ...support, swap: sameSwap } : undefined)
    } else run()
  }
}

function playSkillArtwork(
  battle: EdgeBattle, cast: SkillCast, actor: EdgeFighter,
  skill: { id: string; steps: Step[]; artwork: SkillArtwork },
  event?: SkillEvent, gold = false,
) {
  const { start, path } = skill.artwork
  const first = skill.steps.find((step) => !step.watch && !step.zone &&
    step.operations.some((op) => ["d", "p", "l", "h", "b"].includes(op.kind))) ?? skill.steps[0]
  const shape = stepArea(battle, cast, first, event)
  const choreography = rangerChoreography(skill.id)
  const from = gold && choreography ? rangerGoldOrigin(battle, cast, choreography, event) : gold ? event?.at ?? actor : cast.from
  const goldTarget = gold && choreography && !shape ? select(battle, cast, first.selector, event)[0] : undefined
  const aim = shape?.center ?? goldTarget ?? unitOf(battle, cast.target) ?? event?.at ?? cast.aim
  const bulwark = !gold && bulwarkChoreography(skill.id)
  if (bulwark) {
    const lead = bulwark.windup ?? 0
    const duration = first.delay + lead
    showBulwarkBeat(battle, cast, "setup", aim, { from: cast.from, area: shape, target: cast.target,
      duration: duration || .53, windup: duration > 0 })
    return lead
  }
  const warden = !gold && wardenChoreography(skill.id)
  if (warden) {
    const route = projectedSkillRoute(battle, cast)
    const lead = warden.windup ?? 0
    const duration = first.delay + lead
    const area = routedSkillArea(battle, cast, first, route)
    if (warden.motif === "pincer" && area && lead > 0) {
      const [length, width, gap] = first.selector.size
      const axis = direction(cast.from, cast.aim)
      const sweep = areaOf("L", along(area.center, axis, -length / 2), axis, length, width + gap)
      const warning = visual(battle, cast, sweep, "warning", duration, undefined, "damage")
      warning.damagePower = first.operations.find(op => op.kind === "d")?.args[0]
      warning.pushDistance = first.operations.find(op => op.kind === "p")?.args[0]
      warning.closing = { cast, step: first }
    }
    showWardenBeat(battle, cast, "prepare", area?.center ?? route?.to ?? aim, {
      from: route?.from ?? cast.from, area, target: cast.target, other: route?.to, beat: 1,
      duration: duration || warden.travel || .52, windup: duration > 0,
    })
    return lead
  }
  const berserker = !gold && berserkerChoreography(skill.id)
  if (berserker) {
    const route = projectedSkillRoute(battle, cast)
    const lead = berserker.windup ?? 0
    const area = routedSkillArea(battle, cast, first, route)
    const duration = lead || (berserker.travel ? Math.min(.17, berserker.travel) : first.delay || .40)
    showBerserkerBeat(battle, cast, "prepare", area?.center ?? route?.to ?? aim, {
      from: cast.from, area, target: cast.target, duration, other: route?.to,
    })
    return lead
  }
  const holy = !gold && paladinChoreography(skill.id)
  if (holy) {
    const route = projectedSkillRoute(battle, cast)
    const focus = skill.steps.find((step) => !step.watch && step.selector.shape) ?? first
    const area = routedSkillArea(battle, cast, focus, route)
    const lead = holy.windup ?? 0
    showPaladinBeat(battle, cast, "prepare", area?.center ?? aim, {
      from: cast.from, area, target: cast.target, other: route?.to, duration: lead + focus.delay || .42,
      axis: direction(cast.from, cast.aim),
    })
    return lead
  }
  const breaker = !gold && spellbreakerChoreography(skill.id)
  if (breaker) {
    const route = projectedSkillRoute(battle, cast)
    const focus = skill.steps.find((step) => !step.watch && step.selector.shape) ?? first
    const area = routedSkillArea(battle, cast, focus, route)
    if (area && breaker.motif === "blankbeat") {
      const warning = visual(battle, cast, area, "warning", breaker.windup, undefined, "damage")
      warning.custom = true
      warning.damagePower = focus.operations.find(op => op.kind === "d")?.args[0]
      warning.clearsSummons = true
    }
    showSpellBeat(battle, cast, "prepare", area?.center ?? aim, {
      from: cast.from, area, target: cast.target, other: route?.to, duration: breaker.windup,
    })
    return breaker.windup
  }
  const time = battle.time
  const speed = flightTime(from, aim)
  const delivery = !gold && !first.watch && !first.zone && !!path && (
    isShot(path) && first === skill.steps[0] && first.selector.units === "t" && !shape && !!cast.target && edgeDistance(from, aim) > 42 ||
    !!shape && fixedAreaFlight(skill)
  )
  const lead = delivery && first.delay === 0 ? speed : 0
  const opening = choreography?.opening ?? Math.max(0.29, Math.min(0.85, first.delay + lead))
  showSkillVisual(battle, actor, skill.id, {
    phase: "start", mark: start, from, to: aim, area: shape, gold,
    target: !shape ? goldTarget?.id ?? cast.target : undefined, cast: choreography ? cast.id : undefined, start: time, end: time + opening,
  })
  if (!path || choreography) return lead

  const repeat = ["lob", "rain", "return", "rise", "chase", "chain", "cross"].includes(path.motion)
  const stages = [first, ...skill.steps.filter((step, index, steps) => repeat && !step.watch && !step.zone &&
    step.delay > first.delay && step.operations.some((op) => op.kind === "d") &&
    steps.findIndex((other) => other.delay === step.delay && other.operations.some((op) => op.kind === "d")) === index)]
  let previousArrival = 0
  for (const [index, step] of stages.entries()) {
    const area = stepArea(battle, cast, step, event)
    const target = area ? undefined : select(battle, cast, step.selector, event)[0]
    const axis = direction(cast.from, cast.aim)
    const to = area && step.selector.shape === "L" ? along(area.center, axis, step.selector.size[0] / 2)
      : area?.center ?? target ?? aim
    const back = path.motion === "return" && index > 0
    const duration = path.motion === "star" ? Math.max(first.delay, 0.62) : flightTime(from, to)
    const moment = step.delay + lead || duration
    showSkillVisual(battle, actor, skill.id, {
      phase: "travel", mark: path, from: back ? to : from, to: back ? from : to, area, gold,
      target: !back && isShot(path) ? target?.id : undefined,
      start: time + (back ? previousArrival : Math.max(0, moment - duration)), end: time + moment,
    })
    previousArrival = moment
  }
  return lead
}


function showLifeBeat(battle: EdgeBattle, cast: SkillCast, cue: LifebringerBeat["cue"], to: EdgePoint,
  details: Partial<Pick<LifebringerBeat, "axis" | "other" | "kind" | "amount" | "remaining" | "count" | "paths"> &
    Pick<SkillVisual, "from" | "area" | "target" | "beat">> & { duration?: number } = {}) {
  const owner = unitOf(battle, cast.owner)
  if (!cast.skill || !lifeArt(cast) || !owner || !isFighter(owner)) return
  const { from = cast.lifeLaunch ?? owner, axis = direction(from, to), other, kind, amount, remaining, count, paths,
    area, target, beat = cast.stage, duration } = details
  const span = owner.card.rarity === "Prismatic" ? 1.2 : ["L", "Radiant"].includes(owner.card.rarity) ? .96 : .7
  showSkillVisual(battle, owner, cast.skill.id, {
    phase: cue === "prepare" ? "windup" : cue === "flight" ? "travel" : "impact",
    mark: cue === "prepare" ? cast.skill.artwork.start : cast.skill.artwork.end, cast: cast.id, beat,
    from, to, area, target, start: battle.time, end: battle.time + (duration ?? span),
    lifebringer: { cue, owner: owner.id, axis: point(axis), other: other && point(other), kind, amount, remaining, count, paths },
  })
}

export function chronowheelBudget(battle: EdgeBattle, args: number[], target: EdgeUnit) {
  const [base, conversion, cap, window] = args
  const wounds = battle.runtime.histories.get(target.id)?.wounds.reduce((sum, hit) =>
    sum + (recent(battle, hit.time, window) ? hit.amount : 0), 0) ?? 0
  return Math.min(target.maxHp * ratio(cap), target.maxHp * ratio(base) + wounds * ratio(conversion))
}

export function chronowheelPulses(battle: EdgeBattle, skill: EdgeActive, target: EdgeUnit) {
  const args = skill.steps[0].operations[0].args
  const [, , , , count, interval] = args
  const budget = chronowheelBudget(battle, args, target)
  return { budget, beats: Array.from({ length: count }, (_, index) => ({
    amount: Math.round(budget * (index + 1) / count) - Math.round(budget * index / count), delay: index * interval,
  })) }
}

function runLifeSkill(battle: EdgeBattle, cast: SkillCast, active: EdgeActive) {
  const owner = unitOf(battle, cast.owner), art = lifeArt(cast)
  if (!owner || !isFighter(owner) || !art) return
  const picked = () => unitOf(battle, cast.target)
  const allies = () => nodes(battle).filter(u => u.hp && friendly(battle, owner.id, u.id) && !isSummonId(u.id))
  const schedule = (delay: number, run: () => void, strike?: PendingStrike, heals?: PendingHealing[], support?: PendingSupport) => {
    if (battle.finishedAt !== null) return
    cast.pending++
    later(battle, Math.max(.001, delay), () => { run(); cast.pending--; finishCast(battle, cast) }, strike, support, heals)
  }
  const event = (target?: EdgeUnit, area?: EdgeArea, from?: EdgePoint, tick = cast.stage, count?: number): SkillEvent => ({
    ...eventFor(cast, "cast", target), area, from: from ?? cast.lifeLaunch ?? cast.from,
    healTick: tick, healCount: count,
  })
  const land = (step: Step, stage: number, only?: EdgeUnit[], area?: EdgeArea, from?: EdgePoint) => {
    cast.stage = stage
    if (step.watch || step.zone) register(battle, cast, step, event(picked(), area, from))
    else applyStep(battle, cast, step, event(picked(), area, from), false, area, only)
    if (step.operations.some(op => op.kind === "d")) cast.lifeHits ??= [...cast.trace]
      .filter(([, trace]) => trace.hits > 0).map(([id, trace]) => ({ id, at: point(trace.at) }))
  }
  const choose = (step: Step, area?: EdgeArea) => select(battle, cast, step.selector, undefined, area ?? selectionArea(battle, cast, step.selector))
  const circle = (center: EdgePoint, radius: number) => areaOf("C", point(center), direction(cast.from, cast.aim), radius)
  const spendPulse = (target: EdgeUnit, amount = 0) => {
    const pending = battle.runtime.pendingLifeHeals
    const tick = pending.findIndex(pulse => pulse.cast === cast.id && pulse.target === target.id && pulse.remaining > 0)
    if (tick >= 0) pending[tick] = { ...pending[tick], remaining: pending[tick].remaining - 1 }
    const index = battle.runtime.effects.findIndex(fx => fx.cast === cast.id && fx.target === target.id &&
      fx.lifebringer?.cue === "arm" && (fx.lifebringer.count ?? 0) > 0)
    const effect = battle.runtime.effects[index]
    if (effect?.lifebringer) {
      const count = (effect.lifebringer.count ?? 1) - 1
      const remaining = effect.lifebringer.amount === undefined ? undefined : Math.max(0, effect.lifebringer.amount - amount)
      battle.runtime.effects[index] = { ...effect, lifebringer: { ...effect.lifebringer, count, amount: remaining },
        end: count ? effect.end : Math.min(effect.end, battle.time + .16) }
    }
  }
  const pulse = (target: EdgeUnit, percent: number, delay: number, tick: number, count: number,
    from?: EdgePoint, area?: EdgeArea, style = "", amount?: number, forecast = false) => {
    const base = amount ?? target.maxHp * ratio(percent)
    const run = () => {
      cast.stage = tick
      heal(battle, cast, target, base, style, event(target, area, from, tick, count))
      spendPulse(target, amount)
    }
    if (delay) schedule(delay, run, undefined, forecast ? [{ cast, target: target.id, amount: base }] : undefined)
    else run()
  }
  const arm = (target: EdgeUnit, duration: number, count: number, kind = "regen", amount?: number) => {
    if (["regen", "bond", "grove", "rewind", "dewneedle", "chronowheel", "rootline"].includes(kind))
      battle.runtime.pendingLifeHeals.push({ cast: cast.id, owner: owner.id, target: target.id, until: battle.time + duration, remaining: count })
    showLifeBeat(battle, cast, "arm", target, { target: target.id, count, kind, duration, amount })
  }
  const cancel = () => {
    cast.used.add("after")
    showLifeBeat(battle, cast, "cancel", cast.aim, { duration: .3 })
  }
  const flight = (target: EdgeUnit, from: EdgePoint, run: () => void, kind = "heal", seconds?: number) => {
    if (battle.finishedAt !== null) return
    const origin = point(from), duration = seconds ?? clamp(edgeDistance(from, target) / 710, .18, .39)
    showLifeBeat(battle, cast, "flight", target, { from: origin, target: target.id, kind, duration })
    schedule(duration, () => {
      if (target.hp) run()
      else if (kind === "seed" || kind === "needle") cancel()
    })
  }
  const field = (step: Step, duration: number, fixed?: EdgePoint) => {
    const source = fixed ? { ...cast, aim: point(fixed) } : cast
    const selector = fixed ? { ...step.selector, anchor: "p" as const } : step.selector
    const shape = selectionArea(battle, source, selector)!
    const marker: Step = { ...step, selector, delay: 0, operations: [], zone: { duration, event: "hold", period: 0 } }
    register(battle, source, marker)
    return shape
  }
  const historical = art.motif === "rewind" || art.motif === "oldrings"
  const positionAge = art.motif === "oldrings" ? active.steps[0].operations[0].args[3] : 2.5
  const snapshots = new Map((historical ? allies() : []).map(target => [target.id, {
    wounds: history(battle, target).wounds.filter(hit => recent(battle, hit.time, 2))
      .reduce((sum, hit) => sum + hit.amount, 0),
    old: history(battle, target).positions.findLast(sample => sample.time <= battle.time - positionAge)?.at ??
      history(battle, target).positions[0]?.at ?? point(target),
  }]))
  const wheel = art.motif === "chronowheel" ? allies().map(target => ({ target, ...chronowheelPulses(battle, active, target) })) : undefined
  if (art.motif === "footleaf" && picked()) cast.aim = point(picked()!)
  if (art.motif === "oldrings") cast.lifePast = choose(active.steps[0]).map(target => ({
    id: target.id, at: point(snapshots.get(target.id)?.old ?? target),
  }))
  const prepare = (area?: EdgeArea, duration = art.windup, beat = 0, from = cast.from) =>
    showLifeBeat(battle, cast, "prepare", area?.center ?? picked() ?? cast.aim, {
      area, from, target: area ? undefined : cast.target, duration, beat,
      paths: cast.lifePast?.filter(row => beat === 0 || area && edgeDistance(area.center, row.at) < .01)
        .map(row => ({ at: point(unitOf(battle, row.id) ?? row.at), end: row.at, unit: row.id })),
    })
  const firstShape = stepArea(battle, cast, active.steps.find(s => !s.watch && s.selector.shape) ?? active.steps[0])
  if (wheel) {
    for (const { target, budget } of wheel) showLifeBeat(battle, cast, "prepare", target, {
      target: target.id, duration: art.windup, beat: 0, amount: Math.round(budget), kind: "chronoPlan",
    })
  } else prepare(firstShape)
  const start = point(owner)
  const first = active.steps[0]
  const opening = art.motif === "starbranch" ? fixedAreaStrike(cast, first, firstShape, true) : undefined
  const reservoir = art.motif === "reservoir" && firstShape
    ? scheduledSupport(cast, active.steps[1], true, firstShape) : undefined
  const seed = art.motif === "lifebud" && picked()
  const healing = wheel?.flatMap(({ target, beats }) => beats.map(beat => ({
    cast, target: target.id, stationary: true, ...beat,
  }))) ?? (seed ? [{
    cast, target: seed.id, stationary: true, amount: seed.maxHp * ratio(first.operations.find(op => op.kind === "h")!.args[0]),
  }] : undefined)
  schedule(art.windup, () => {
    const target = picked()
    if (!owner.hp || owner.force || edgeDistance(owner, start) > 3 ||
      ["ally", "other", "enemy"].includes(active.aim.mode) && (!target?.hp || edgeDistance(owner, target) > active.aim.range + .01)) {
      cancel()
      return
    }
    cast.lifeLaunch = point(owner)
    const steps = active.steps
    const commit = () => {
      switch (art.motif) {
        case "renew": {
          if (!target?.hp) return
          arm(target, 2.05, 3)
          for (let i = 0; i < 3; i++) pulse(target, 4, i, i + 1, 3)
          break
        }
        case "sprig":
          if (target?.hp) { arm(target, 1.45, 2); pulse(target, 8, 0, 1, 2); pulse(target, 5, 1.4, 2, 2) }
          break
        case "needle": {
          if (!target?.hp) return
          land(steps[0], 1, [target])
          const contact = cast.lifeHits?.[0]
          if (!contact) return
          const recipient = allies().filter(u => edgeDistance(u, contact.at) <= 105 && u.hp < u.maxHp)
            .sort((a, b) => edgeDistance(a, contact.at) - edgeDistance(b, contact.at))[0]
          if (recipient) flight(recipient, contact.at, () => pulse(recipient, 6, 0, 2, 2, contact.at), "return")
          break
        }
        case "vine": {
          if (!target?.hp) return
          pulse(target, 15, 0, 1, 2)
          arm(target, .72, 1, "relay")
          schedule(.7, () => {
            if (!target.hp) return
            const recipient = allies().filter(u => u !== target && edgeDistance(u, target) <= 165 && u.hp < u.maxHp)
              .sort((a, b) => hpPct(a) - hpPct(b))[0]
            if (recipient) {
              const origin = point(target)
              flight(recipient, origin, () => pulse(recipient, 10, 0, 2, 2, origin), "relay", .24)
            }
          })
          break
        }
        case "cluster":
          if (target?.hp) {
            pulse(target, 13, 0, 1, 2); arm(target, 2.02, 1, "cluster")
            schedule(2, () => {
              if (!target.hp) return
              const area = circle(target, 115)
              land(steps[1], 2, undefined, area, point(target))
            })
          }
          break
        case "grove":
          field(steps[0], 1.43, owner)
          land(steps[0], 1, undefined, circle(owner, 95), point(owner))
          schedule(1.4, () => land(steps[1], 2, undefined, circle(owner, 95), point(owner)))
          break
        case "footleaf": {
          const shape = circle(cast.aim, 105)
          prepare(shape, 1.8, 2); schedule(1.8, () => land(steps[0], 2, undefined, shape, shape.center))
          break
        }
        case "budblade": {
          const area = selectionArea(battle, cast, steps[0].selector)!
          land(steps[0], 1, undefined, area)
          const axis = direction(cast.from, cast.aim)
          const projection = (unit: EdgeUnit) => (unit.x - cast.from.x) * axis.x + (unit.y - cast.from.y) * axis.y
          const friends = choose({ ...steps[1], selector: { ...steps[1].selector, limit: undefined } }, area)
          const first = friends.sort((a, b) => projection(a) - projection(b))[0]
          if (first) land(steps[1], 2, [first], area)
          break
        }
        case "lichen": {
          const area = field(steps[0], 3.65)
          for (let i = 1; i <= 4; i++) schedule(i * .9, () => land(steps[i - 1], i, undefined, area, area.center))
          break
        }
        case "rootline": {
          const shape = selectionArea(battle, cast, steps[0].selector)!
          const group = choose(steps[0], shape)
          cast.lifeRecipients = group.map(u => ({ id: u.id, at: point(u) }))
          land(steps[0], 1, group, shape)
          for (const u of group) arm(u, 1.22, 1, "rootline")
          schedule(1.2, () => {
            const living = group.filter(u => u.hp)
            showLifeBeat(battle, cast, "transfer", shape.center, { area: shape,
              paths: cast.lifeRecipients?.filter(row => unitOf(battle, row.id)?.hp).map(row => ({
                at: row.at, end: point(unitOf(battle, row.id)!), unit: row.id,
              })) })
            land(steps[1], 2, living, shape)
            for (const u of living) spendPulse(u)
          })
          break
        }
        case "sapward":
          if (target?.hp) {
            land({ ...steps[0], operations: steps[0].operations.filter(op => op.kind === "b") }, 1, [target])
            arm(target, 2.72, 3)
            for (let i = 1; i <= 3; i++) pulse(target, 3, i * .9, i, 3)
          }
          break
        case "rootbond": {
          const partner = target && target !== owner ? target : allies()
            .filter(u => u !== owner && edgeDistance(owner, u) <= active.aim.range)
            .sort((a, b) => hpPct(a) - hpPct(b))[0]
          const group = partner ? [owner, partner] : [owner]
          cast.lifeRecipients = group.map(unit => ({ id: unit.id, at: point(unit) }))
          for (const u of group) arm(u, 4.05, 4, "bond")
          for (let i = 1; i <= 4; i++) schedule(i, () => {
            const living = group.filter(u => u.hp)
            for (const u of living) pulse(u, 5.5, 0, i, 4, u)
            const unused = living.map(unit => cast.lifeOverflow?.get(unit.id) ?? 0)
            for (const [index, from] of living.entries()) {
              const amount = unused[index]
              if (!amount) continue
              const receiver = living[1 - index]
              if (!receiver || receiver.hp === receiver.maxHp) {
                storeOverheal(battle, from, amount)
                continue
              }
              showLifeBeat(battle, cast, "transfer", receiver, { from, target: receiver.id, amount, kind: "overflow" })
              heal(battle, cast, receiver, amount, "share", event(receiver, undefined, from, i, 4))
            }
          })
          break
        }
        case "rewind": {
          if (!target?.hp) return
          const budget = Math.min(target.maxHp * .14, (snapshots.get(target.id)?.wounds ?? 0) * .35)
          pulse(target, 12, 0, 1, 3)
          if (budget > 0) {
            arm(target, 2.05, 2, "rewind")
            for (let i = 0; i < 2; i++) pulse(target, 0, i + 1, i + 2, 3, target, undefined, "historic",
              Math.round(budget * (i + 1) / 2) - Math.round(budget * i / 2))
          }
          break
        }
        case "sharedbranch": {
          land(steps[0], 1)
          const recipient = choose(steps[1])[0]
          if (recipient) {
            land({ ...steps[1], operations: steps[1].operations.filter(op => op.kind === "b") }, 1, [recipient])
            arm(recipient, 2.05, 2)
            pulse(recipient, 5, 1, 2, 3); pulse(recipient, 5, 2, 3, 3)
          }
          break
        }
        case "circuit": {
          const area = field(steps[0], 2.15)
          for (let i = 0; i < 3; i++) {
            const run = () => {
              const recipient = choose(steps[i], area)[0]
              if (recipient) {
                if (i === 0) cast.lifePrimary = recipient.id
                showLifeBeat(battle, cast, "transfer", recipient, {
                from: area.center, area, target: recipient.id, beat: i + 1, kind: "choose",
                })
                land(steps[i], i + 1, [recipient], area, area.center)
              }
            }
            if (i) schedule(i, run); else run()
          }
          break
        }
        case "roamingroot": {
          if (!target?.hp) return
          cast.lifeFollowFrom = point(target)
          arm(target, 2.42, 3, "grove")
          for (let i = 1; i <= 3; i++) schedule(i * .8, () => {
            if (target.hp) {
              land(steps[i - 1], i, undefined, circle(target, 130), point(target))
              spendPulse(target)
            }
          })
          break
        }
        case "dewneedle": {
          land(steps[0], 1)
          const from = cast.lifeHits?.[0]?.at, recipient = choose(steps[1])[0]
          if (from && recipient) flight(recipient, from, () => {
            pulse(recipient, 15, 0, 2, 3, from); arm(recipient, 1.22, 1, "dewneedle")
            pulse(recipient, 9, 1.2, 3, 3, from)
          }, "return", .27)
          break
        }
        case "chronowheel":
          for (const { target, budget, beats } of wheel!) {
            if (!target.hp) continue
            arm(target, (beats.at(-1)?.delay ?? 0) + .02, beats.length, "chronowheel", Math.round(budget))
            for (const [index, { amount, delay }] of beats.entries()) {
              pulse(target, 0, delay, index + 1, beats.length, target, undefined, "historic", amount, cast.used.has("manual"))
            }
          }
          break
        case "oldrings": {
          const [radius, amount, delay] = steps[0].operations[0].args
          const areas = (cast.lifePast ?? []).map(row => circle(row.at, radius))
          for (const area of areas) prepare(area, delay, 2, area.center)
          schedule(delay, () => {
            for (const area of areas) showLifeBeat(battle, cast, "release", area.center, { area, from: area.center, kind: "oldstep" })
            for (const u of allies()) {
              const area = areas.find(area => areaHits(area, u))
              if (area) pulse(u, amount, 0, 2, 2, area.center, area, "oldstep")
            }
          })
          break
        }
        case "reservoir": {
          land(steps[0], 1)
          const bank = battle.runtime.fields.find(field => field.cast === cast && field.mode === "reservoir")
          land(steps[1], 1)
          for (let i = 2; i <= 3; i++) {
            const support = bank && scheduledSupport(cast, steps[i], false, bank.area)
            schedule(steps[i].delay, () => {
              if (bank && battle.runtime.fields.includes(bank) && bank.until > battle.time) land(steps[i], i)
            }, undefined, undefined, support && { ...support, reservoir: bank })
          }
          break
        }
        case "starbranch": {
          const [radius, amount, delay] = steps[1].operations[0].args
          land(steps[0], 1)
          const areas = (cast.lifeHits ?? []).map(row => circle(row.at, radius))
          for (const area of areas) prepare(area, delay, 2, area.center)
          schedule(delay, () => {
            for (const area of areas) showLifeBeat(battle, cast, "release", area.center, { area, from: area.center, kind: "bloom" })
            for (const u of allies()) {
              const area = areas.find(area => areaHits(area, u))
              if (area) pulse(u, amount, 0, 2, 2, area.center, area)
            }
          })
          break
        }
        default:
          for (const [i, step] of steps.entries()) {
            if (step.delay) { const shape = stepArea(battle, cast, step); if (shape) prepare(shape, step.delay, i + 1)
              schedule(step.delay, () => land(step, i + 1)) }
            else land(step, i + 1)
          }
      }
    }
    if (art.delivery && target?.hp) flight(target, owner, commit, art.motif === "needle" ? "needle" : "seed")
    else commit()
  }, opening && { ...opening, needsUnforcedOwner: true, originLimit: { distance: 3 } },
  cast.used.has("manual") ? healing : undefined, reservoir && { ...reservoir, reservoir: "opening" })
}

export function targetedFlight(job: "assassin" | "warlock" | "berserker", distance: number) {
  if (job === "berserker") return furnaceFlight(distance)
  return job === "assassin" ? clamp(distance / 830, .16, .37) : clamp(distance / 680, .23, .48)
}

function plainTargetDamage(step: Step | undefined) {
  if (!step || step.watch || step.zone || step.selector.units !== "t" || step.selector.shape ||
    step.selector.flags.length || step.selector.exclude) return
  return step.operations.find(op => op.kind === "d" && !op.style && op.args.length === 1)?.args[0]
}

function runWarlockSkill(battle: EdgeBattle, cast: SkillCast, active: EdgeActive) {
  const owner = unitOf(battle, cast.owner), art = warlockArt(cast)
  if (!owner || !isFighter(owner) || !art) return
  const target = () => unitOf(battle, cast.target)
  const schedule = (delay: number, run: () => void, strike?: PendingStrike) => {
    cast.pending++
    later(battle, Math.max(.001, delay), () => { run(); cast.pending--; finishCast(battle, cast) }, strike)
  }
  const cancel = () => showWarlockBeat(battle, cast, "cancel", cast.aim, { from: cast.from, duration: .35 })
  const hits = () => (cast.warlockHits ?? []).flatMap(({ id, at }) => {
    const unit = unitOf(battle, id)
    return unit?.hp ? [{ unit, at }] : []
  })
  const land = (step: Step, beat: number, area?: EdgeArea, only?: EdgeUnit[], from?: EdgePoint, kind?: string) => {
    cast.stage = beat
    const event = { ...eventFor(cast, "cast", target()), from: from ?? cast.warlockLaunch ?? cast.from, style: kind }
    if (step.watch || step.zone) register(battle, cast, step, event)
    else applyStep(battle, cast, step, event, false, area, only)
    if (!cast.warlockHits && step.operations.some(op => op.kind === "d")) cast.warlockHits = [...cast.trace]
      .filter(([, trace]) => trace.hits > 0).map(([id, trace]) => ({ id, at: point(trace.at) }))
  }
  const prepare = (step: Step, delay: number, beat: number, area?: EdgeArea, kind?: string, to?: EdgePoint) => {
    const shape = area ?? stepArea(battle, cast, step)
    if (shape && delay > .45 && !step.zone && stepOutcome(step) === "damage" &&
      (area || active.aim.mode === "point" || active.aim.mode === "direction")) {
      const warning = visual(battle, cast, shape, "warning", delay, undefined, "damage")
      warning.custom = true
      warning.damagePower = step.operations.find(op => op.kind === "d")?.args[0]
      attachShove(warning, cast, step)
    }
    showWarlockBeat(battle, cast, "prepare", to ?? shape?.center ?? target() ?? cast.aim, {
      from: cast.warlockLaunch ?? cast.from, area: shape, target: shape ? undefined : cast.target, duration: delay, beat, kind,
    })
  }
  const ground = () => {
    if (art.motif === "firestep") {
      const end = dashLanding(battle, cast, owner, 70, "", undefined, 0, true), from = point(owner)
      if (!end || isOutside(owner)) { cancel(); return }
      cast.warlockRoute = { from, to: point(end) }
      const motion = forceTo(battle, owner, end, art.travel, false, cast)
      if (!motion) { cancel(); return }
      showWarlockBeat(battle, cast, "travel", end, { from, other: from, duration: art.travel })
      schedule(art.travel, () => {
        if (!owner.hp || !motion.completed || owner.force || edgeDistance(owner, end) > 3) { cancel(); return }
        history(battle, owner).from = from
        cast.used.add("dasharrived")
        emit(battle, { ...eventFor(cast, "dash", owner), from, landing: point(owner), distance: edgeDistance(from, owner), style: "side" })
        land(active.steps[1], 2, areaOf("C", from, direction(from, end), 65), undefined, from)
      })
      return
    }
    if (art.motif === "comet") {
      const from = point(cast.from), axis = direction(from, cast.aim), end = along(from, axis, 395)
      showWarlockBeat(battle, cast, "flight", end, { from, duration: art.travel, kind: "comet", beat: 1 })
      for (let i = 1; i <= 20; i++) schedule(i * art.travel / 20, () => {
        const band = areaOf("L", along(from, axis, (i - 1) * 395 / 20), axis, 395 / 20 + .01, 83)
        const fresh = select(battle, cast, active.steps[0].selector, undefined, band).filter(unit => !cast.trace.get(unit.id)?.hits)
        if (fresh.length) land(active.steps[0], 1, band, fresh, from, "comet")
      })
      schedule(art.travel + .015, () => land(active.steps[1], 2))
      return
    }
    if (art.motif === "crossbolt") {
      const shape = selectionArea(battle, cast, active.steps[0].selector)!
      land(active.steps[0], 1, { ...shape, parts: [shape.parts[0]] })
      const second = { ...shape, parts: [shape.parts[1]] }
      prepare(active.steps[0], .28, 2, second, "cross")
      schedule(.28, () => {
        const targets = select(battle, cast, active.steps[0].selector, undefined, second)
        const repeated = targets.filter(unit => !!cast.trace.get(unit.id)?.hits)
        const fresh = targets.filter(unit => !cast.trace.get(unit.id)?.hits)
        if (fresh.length) land(active.steps[0], 2, second, fresh, cast.from)
        if (repeated.length) land(active.steps[1], 2, shape, repeated, cast.from, "cross")
      })
      return
    }
    if (["movingash", "starcloud"].includes(art.motif)) {
      land(active.steps[0], 1)
      const nearest = hits().sort((a, b) => edgeDistance(a.unit, cast.aim) - edgeDistance(b.unit, cast.aim))[0]?.unit
      const next = art.motif === "movingash" ? along(cast.aim, direction(cast.aim, CENTER), Math.min(70, edgeDistance(cast.aim, CENTER)))
        : nearest ? along(cast.aim, direction(cast.aim, nearest), Math.min(90, edgeDistance(cast.aim, nearest))) : cast.aim
      cast.warlockSecond = point(next)
      const second = areaOf("C", next, direction(cast.from, cast.aim), active.steps[1].selector.size[0])
      showWarlockBeat(battle, cast, "travel", next, { from: cast.aim, other: cast.aim, area: second,
        duration: active.steps[1].delay, beat: 2, kind: "field" })
      schedule(active.steps[1].delay, () => land(active.steps[1], 2, second))
      return
    }
    if (art.motif === "reflectionbolt" || art.motif === "dualfrequency") {
      land(active.steps[0], 1)
      const chosen = hits().sort((a, b) => edgeDistance(b.at, cast.aim) - edgeDistance(a.at, cast.aim))[0]?.unit
      if (art.motif === "reflectionbolt" && chosen) showWarlockBeat(battle, cast, "arm", chosen, {
        target: chosen.id, kind: "mirror", duration: .72,
      })
      schedule(art.motif === "reflectionbolt" ? .72 : .30, () => {
        const group = hits()
        if (!group.length || art.motif === "reflectionbolt" && !chosen?.hp) { cancel(); return }
        const center = art.motif === "reflectionbolt" ? point(chosen!) : {
          x: group.reduce((sum, row) => sum + row.unit.x, 0) / group.length,
          y: group.reduce((sum, row) => sum + row.unit.y, 0) / group.length,
        }
        cast.warlockSecond = center
        const shape = areaOf("C", center, direction(cast.from, center), active.steps[1].selector.size[0])
        const delay = art.motif === "reflectionbolt" ? .28 : .35
        prepare(active.steps[1], delay, 2, shape, "follow")
        const gold = owner.gold
        if (art.motif === "reflectionbolt" && gold?.id === "warlock/L/G2" && (!battle.preview || battle.preview.loadoutFor === owner.id)) {
          cast.used.add(gold.id)
          applyGold(battle, owner, gold, { ...eventFor(cast, "after"), at: center, area: shape })
        }
        const step = active.steps[1]
        schedule(delay, () => land(step, 2, shape), areaDamageContact(cast, step, shape, false))
      })
      return
    }
    if (art.motif === "fault") {
      const [first, second] = active.steps
      schedule(active.steps[0].delay, () => {
        land(first, 1)
        if (!cast.warlockHits?.length) return
        const fissures: EdgeArea = { center: point(cast.aim), parts: cast.warlockHits.map(({ at }) => ({ kind: "circle", center: point(at), radius: 66 })) }
        prepare(second, .35, 2, fissures, "fissures")
        schedule(.35, () => land(second, 2, fissures, undefined, cast.from, "fissures"),
          areaDamageContact(cast, second, fissures, false))
      }, fixedAreaStrike(cast, first, stepArea(battle, cast, first), false))
      return
    }
    for (const [i, step] of active.steps.entries()) {
      const run = () => {
        let only: EdgeUnit[] | undefined
        if (i === 1 && ["heatline", "thunder"].includes(art.motif)) {
          const nearest = hits().sort((a, b) => edgeDistance(a.at, cast.from) - edgeDistance(b.at, cast.from))[0]?.unit
          only = nearest ? [nearest] : []
        }
        land(step, i + 1, undefined, only)
      }
      if (step.delay > 0) {
        if (i > 0 && step.delay > active.steps[0].delay) schedule(Math.max(.01, active.steps[i - 1].delay), () =>
          prepare(step, step.delay - active.steps[i - 1].delay, i + 1))
        const strike = art.motif === "starfallring" || art.motif === "horizonline"
          ? fixedAreaStrike(cast, step, stepArea(battle, cast, step), false) : undefined
        schedule(step.delay, run, strike)
      } else run()
    }
  }
  const delivered = () => {
    const picked = target()
    if (!picked?.hp) return
    land(active.steps[0], 1, undefined, [picked])
    if (art.motif === "arc" && cast.trace.get(picked.id)?.hits) {
      const next = select(battle, cast, active.steps[1].selector, undefined, selectionArea(battle, cast, active.steps[1].selector))[0]
      if (!next) return
      const from = point(picked), flight = .18
      showWarlockBeat(battle, cast, "flight", next, { from, target: next.id, duration: flight, beat: 2, kind: "chain" })
      const damage = active.steps[1].operations.find(op => op.kind === "d")
      schedule(flight, () => { if (next.hp) land(active.steps[1], 2, undefined, [next], from, "chain") },
        damage && { cast, power: damage.args[0], target: next.id, launchedFrom: from })
    } else if (art.motif === "twinspark") {
      const flight = .25, delay = active.steps[1].delay
      schedule(delay - flight, () => {
        if (!picked.hp) return
        showWarlockBeat(battle, cast, "flight", picked, { from: cast.warlockLaunch, target: picked.id, duration: flight, beat: 2 })
      })
      const power = plainTargetDamage(active.steps[1])
      schedule(delay, () => { if (picked.hp && cast.trace.get(picked.id)?.hits) land(active.steps[1], 2, undefined, [picked]) },
        power && cast.trace.get(picked.id)?.hits ? { cast, power, target: picked.id, launchedFrom: cast.warlockLaunch } : undefined)
    }
  }
  const first = active.steps.find(step => step.selector.shape) ?? active.steps[0]
  prepare(first, art.windup + active.steps[0].delay, 1)
  const power = art.delivery ? plainTargetDamage(active.steps[0]) : undefined
  const windup = Math.max(.001, art.windup)
  const opening = !art.delivery && !art.travel && art.motif !== "crossbolt" && first === active.steps[0] && !first.delay
    ? fixedAreaStrike(cast, first, stepArea(battle, cast, first), true) : undefined
  // The ring and the horizon cut have fixed geometry during the windup.
  const queuedArea = art.motif === "starfallring" || art.motif === "horizonline"
    ? fixedAreaStrike(cast, first, stepArea(battle, cast, first), true) : undefined
  const limitedPush = art.motif === "heatline" || art.motif === "thunder" ? active.steps[1] : undefined
  const announced: PendingStrike | undefined = power && cast.target !== undefined && active.aim.mode === "enemy"
    ? { cast, power, target: cast.target, range: active.aim.range, locksAt: battle.time + windup, projectile: "warlock", needsUnforcedOwner: true }
    : queuedArea ? { ...queuedArea, needsUnforcedOwner: true, releaseLead: first.delay }
    : opening && { ...opening, needsUnforcedOwner: true, limitedPush }
  schedule(art.windup, () => {
    const picked = target()
    if (!owner.hp || owner.force || active.aim.mode === "enemy" && (!picked?.hp || activeBuffs(battle, picked.id, "phase").length || edgeDistance(owner, picked) > active.aim.range)) { cancel(); return }
    cast.outside = isOutside(owner)
    cast.warlockLaunch = point(owner)
    if (!art.delivery) { ground(); return }
    if (!picked?.hp) return
    const flight = targetedFlight("warlock", edgeDistance(owner, picked))
    showWarlockBeat(battle, cast, "flight", picked, { from: owner, target: picked.id, duration: flight, beat: 1 })
    schedule(flight, delivered, power ? { cast, power, target: picked.id, launchedFrom: cast.warlockLaunch } : undefined)
  }, announced)
}

export function assassinLockAttack(active: EdgeActive) {
  const art = assassinChoreography(active.id)
  if (!art || art.travel || art.delivery || active.aim.mode !== "enemy") return
  const power = plainTargetDamage(active.steps[0])
  if (power) return { power, range: active.aim.range, windup: Math.max(.001, art.windup), delay: Math.max(.001, active.steps[0].delay) }
}

export function spellbreakerLockAttack(active: EdgeActive) {
  const art = spellbreakerChoreography(active.id)
  const first = active.steps[0]
  if (!art || art.travel || active.aim.mode !== "enemy" || !first || first.selector.limit) return
  const power = plainTargetDamage(first)
  const delay = (art.windup ?? 0) + first.delay
  if (power && delay > 0) return { power, range: active.aim.range, delay }
}

export function boundaryBladeStrikes(active: EdgeActive, cast: SkillCast, issuedAt: number): (PendingTargetStrike & {
  locksAt: number; afterLock: number
})[] {
  const art = assassinChoreography(active.id)
  const { target } = cast
  if (art?.motif !== "boundaryexec" || target === undefined) return []
  const locksAt = issuedAt + Math.max(.001, art.windup)
  return active.steps.flatMap(step => {
    const power = plainTargetDamage(step)
    return power ? [{ cast, power, target, step, range: active.aim.range, locksAt,
      afterLock: step.delay, outsideLock: true, needsUnforcedOwner: true }] : []
  })
}

export function forecastSkillCast(actor: EdgeFighter, skill: EdgeActive, target: EdgeUnit) {
  const cast = makeCast(0, actor, "skill", target, target, skill)
  cast.used.add("manual")
  return cast
}

export function forecastBasicCast(actor: EdgeUnit, target: EdgeUnit) {
  const cast = makeCast(0, actor, "basic", target, target)
  cast.used.add("manual")
  return cast
}

export function previewAssassinLanding(battle: EdgeBattle, actor: EdgeFighter, skill: EdgeActive, target: EdgeUnit, atLock: EdgePoint, aim: EdgePoint = target) {
  const dash = skill.steps[0].operations.find(op => op.kind === "dash")
  if (!dash) return
  const cast = makeCast(battle.runtime.sequence + 1, actor, "skill", aim, target, skill)
  return dashLanding(battle, cast, actor, dash.args[0], dash.style, undefined, dash.args[1], false, { ...target, ...atLock })
}

function runAssassinSkill(battle: EdgeBattle, cast: SkillCast, active: EdgeActive) {
  const owner = unitOf(battle, cast.owner)
  const art = assassinArt(cast)
  if (!owner || !art) return
  const lock = assassinLockAttack(active)
  const cut = art.motif === "windshear" ? active.steps[1] : undefined
  const lockedBlades = art.motif === "boundaryexec"
  const picked = () => unitOf(battle, cast.target)
  const targetReady = (close = false) => {
    const target = picked()
    if (!["enemy", "outside", "ally", "other"].includes(active.aim.mode)) return true
    if (!target?.hp) return false
    if (active.aim.mode === "outside" && isOutside(target)) return true
    return edgeDistance(owner, target) <= (close ? Math.min(120, active.aim.range) : active.aim.range)
  }
  const schedule = (delay: number, run: () => void, strike?: PendingStrike, following?: readonly PendingTargetStrike[]) => {
    cast.pending++
    later(battle, Math.max(.001, delay), () => { run(); cast.pending--; finishCast(battle, cast) }, strike, undefined, undefined, following)
  }
  const blades = boundaryBladeStrikes(active, cast, battle.time)
  const projectilePower = art.delivery && active.aim.mode === "enemy" ? plainTargetDamage(active.steps[0]) : undefined
  // Forecast the visible lock, then replace it with the actual queued hit if the lock succeeds.
  const windupStrike: PendingStrike | undefined = lock && cast.target !== undefined ? {
    cast, power: lock.power, target: cast.target, range: lock.range,
    locksAt: battle.time + lock.windup, afterLock: lock.delay, needsUnforcedOwner: true,
  } : projectilePower && cast.target !== undefined ? {
    cast, power: projectilePower, target: cast.target, range: active.aim.range,
    locksAt: battle.time + Math.max(.001, art.windup), projectile: "assassin",
    afterLock: Math.max(.001, active.steps[0].delay), needsUnforcedOwner: true,
  } : undefined
  const cancel = () => showAssassinBeat(battle, cast, "cancel", owner, { from: cast.from, other: cast.assassinRoute?.to, duration: .32 })
  const apply = (step: Step, from?: EdgePoint) => {
    cast.stage++
    if ((step.watch || art.motif === "shadowpit" && step.zone) && !cast.hitStages.size) return
    register(battle, cast, step, from ? { ...eventFor(cast, "cast", picked()), from } : undefined)
  }
  const move = (op: Operation, after: () => void, selected = cast, returning = false) => {
    if (!owner.hp || owner.force || isOutside(owner)) { cancel(); return }
    const from = point(owner)
    const end = returning ? skillTravelEnd(battle, cast, owner, cast.from, true)
      : dashLanding(battle, selected, owner, op.args[0], op.style, undefined, op.args[1], true)
    if (!end) {
      if (art.motif === "sideflash") after()
      else cancel()
      return
    }
    if (edgeDistance(from, end) < 3) { after(); return }
    if (!returning) cast.assassinRoute = { from, to: point(end) }
    cast.assassinNeighbors = nodes(battle).filter((enemy) => enemy.hp && !friendly(battle, owner.id, enemy.id) && edgeDistance(from, enemy) <= 120)
      .map((enemy) => ({ id: enemy.id, gap: edgeDistance(from, enemy) }))
    const motion = forceTo(battle, owner, end, art.travel, false, cast)
    showAssassinBeat(battle, cast, "travel", end, { from, other: picked(), duration: art.travel, kind: returning ? "return" : op.style })
    schedule(art.travel, () => {
      if (!owner.hp || !motion?.completed || owner.force || edgeDistance(owner, end) > 3) { cancel(); return }
      cast.used.add("dash"); cast.used.add("dasharrived")
      history(battle, owner).from = from
      cast.outside = isOutside(owner)
      emit(battle, { ...eventFor(cast, "dash", owner), from, landing: point(owner), distance: edgeDistance(from, owner),
        style: returning ? "back" : "dash", assassinMove: returning ? "back" : op.style || "dash" })
      showAssassinBeat(battle, cast, "arrival", owner, { from, other: picked(), kind: returning ? "return" : op.style })
      after()
    })
  }
  const perform = () => {
    const dashIndex = active.steps.findIndex((step) => step.operations.some((op) => op.kind === "dash"))
    if (art.travel && dashIndex >= 0) {
      for (const step of active.steps.slice(0, dashIndex)) apply(step)
      if (dashIndex > 0 && !cast.hitStages.size) return
      let movingCast = cast
      if (art.motif === "seamrun") {
        const axis = direction(cast.from, cast.aim)
        const first = [...cast.trace].filter(([, trace]) => trace.hits).sort((a, b) =>
          (a[1].at.x - b[1].at.x) * axis.x + (a[1].at.y - b[1].at.y) * axis.y)[0]
        if (!first) return
        movingCast = { ...cast, target: first[0], aim: first[1].at }
      }
      const op = active.steps[dashIndex].operations.find((op) => op.kind === "dash")!
      move(op, () => {
        if (art.motif === "turnaround") {
          if (targetReady(true)) apply(active.steps[1])
          const start = point(cast.from)
          showAssassinBeat(battle, cast, "arm", start, { from: owner, kind: "return", other: start, duration: .65 })
          schedule(.65, () => {
            if (!owner.hp) return
            cast.assassinRoute = { from: start, to: point(owner) }
            const from = point(owner)
            cast.assassinReturnEdge = !isOutside(owner) && cast.assassinContact && edgeDistance(owner, cast.assassinContact) <= 110
              ? point(cast.assassinContact) : from
            if (isOutside(owner)) {
              cast.outside = true
              apply(active.steps[2], from)
            } else move({ kind: "dash", args: [0], style: "back" }, () => apply(active.steps[2], from), cast, true)
          })
          return
        }
        for (const step of active.steps.slice(dashIndex + 1)) {
          if (step.selector.units === "t" && step.operations.some((op) => op.kind === "d") && !targetReady(true)) continue
          apply(step)
        }
      }, movingCast)
      return
    }
    for (const [index, step] of active.steps.entries()) {
      if (step.delay > 0) schedule(.02, () => {
        if (art.motif === "scar" && !cast.hitStages.size) return
        const target = picked()
        const area = stepArea(battle, cast, step)
        const from = target && ["returningdagger", "mirroredge", "doubleedge"].includes(art.motif)
          ? along(target, direction(cast.from, target), 83) : owner
        if (target && ["returningdagger", "mirroredge", "doubleedge"].includes(art.motif)) cast.assassinFollowFrom = point(from)
        showAssassinBeat(battle, cast, "prepare", area?.center ?? target ?? cast.aim, {
          from, other: cast.assassinContact, area, target: target?.id, beat: index + 1, kind: "follow", duration: Math.max(.08, step.delay - .02),
        })
        if (art.delivery && step.selector.units === "t" && target) schedule(Math.max(.01, step.delay - .25), () => {
          if (target.hp) showAssassinBeat(battle, cast, "flight", target, { from, target: target.id, beat: index + 1, duration: .22, kind: "return" })
        })
      })
      const power = art.delivery ? plainTargetDamage(step) : index === 0 ? lock?.power : undefined
      const targeted: PendingStrike | undefined = power && cast.target !== undefined ? {
        cast, power, target: cast.target, needsUnforcedOwner: !art.delivery, needsFirstHit: index > 0,
        step, launchedFrom: cast.assassinLaunch,
      } : undefined
      const windshear = cut && index === 0
        ? fixedAreaStrike(cast, step, stepArea(battle, cast, step), false) : undefined
      const blade = blades[index]
      const contact = windshear ? { ...windshear, limitedDamage: cut }
        : blade ? { cast, power: blade.power, target: blade.target, step } : targeted
      schedule(step.delay, () => {
        const lingering = cast.assassinLaunch || lockedBlades || art.motif === "windshear" ||
          art.motif === "fallingneedle" || art.motif === "scar" && cast.hitStages.size
        if ((!owner.hp && !lingering) || step.selector.units === "t" && !picked()?.hp) return
        if (index > 0 && ["scar", "returningdagger", "mirroredge", "doubleedge", "offhand"].includes(art.motif) && !cast.hitStages.size) return
        if (!lingering && owner.force && !step.watch && !step.zone) { cancel(); return }
        const reverse = index > 0 && picked() && ["returningdagger", "mirroredge", "doubleedge"].includes(art.motif)
        const from = reverse ? cast.assassinFollowFrom ?? along(picked()!, direction(cast.from, picked()!), 83) : cast.assassinLaunch ?? owner
        apply(step, from)
      }, contact)
    }
  }
  const route = projectedSkillRoute(battle, cast)
  const first = active.steps.find((step) => step.selector.shape) ?? active.steps[0]
  const shape = routedSkillArea(battle, cast, first, route)
  const windup = Math.max(.12, art.windup + active.steps[0].delay)
  const shove = !art.delivery && !art.travel && areaShove(active.steps[0])
  if (shape && (art.motif === "windshear" || shove)) {
    const threat = visual(battle, cast, shape, "warning", windup, undefined,
      first.operations.some(op => op.kind === "d") ? "damage" : "control")
    threat.custom = true
    threat.damagePower = active.steps.reduce((power, step) =>
      power + (step.operations.find(op => op.kind === "d")?.args[0] ?? 0), 0)
    if (shove) attachShove(threat, cast, active.steps[0], shove)
  }
  showAssassinBeat(battle, cast, "prepare", shape?.center ?? picked() ?? cast.aim, {
    from: cast.from, other: route?.to, area: shape, target: cast.target,
    kind: art.motif === "deathchase" && hpPct(picked()) < 35 ? "execute" : undefined,
    duration: windup,
  })
  const windshear = cut && fixedAreaStrike(cast, first, shape, true)
  const opening = windshear ? { ...windshear, releaseLead: first.delay, needsUnforcedOwner: true, limitedDamage: cut } : windupStrike
  // The release job announces both contacts. Once released each real hit job
  // retains its target independently of the assassin's later movement or HP.
  const [firstBlade, ...following] = blades
  schedule(art.windup, () => {
    if (!owner.hp || owner.force || !targetReady()) { cancel(); return }
    cast.outside = isOutside(owner)
    if (art.delivery) {
      const target = picked()
      if (!target?.hp) return
      cast.assassinLaunch = point(owner)
      const duration = targetedFlight("assassin", edgeDistance(owner, target))
      showAssassinBeat(battle, cast, "flight", target, { from: owner, target: target.id, duration, beat: 1 })
      schedule(duration, perform, projectilePower ? { cast, power: projectilePower, target: target.id,
        afterLock: Math.max(.001, active.steps[0].delay), launchedFrom: cast.assassinLaunch } : undefined)
    } else perform()
  }, firstBlade ?? opening, following.length ? following : undefined)
}

export function binderHead<T extends { at: EdgePoint }>(cast: Pick<SkillCast, "from" | "aim">, contacts: readonly T[]) {
  const axis = direction(cast.from, cast.aim)
  const projection = (at: EdgePoint) => (at.x - cast.from.x) * axis.x + (at.y - cast.from.y) * axis.y
  return contacts.reduce<T | undefined>((head, contact) =>
    !head || projection(contact.at) > projection(head.at) ? contact : head, undefined)
}

function binderPressureEnds(cast: SkillCast) {
  const axis = direction(cast.from, cast.aim)
  const hits = [...cast.trace].filter(([, row]) => (row.effectiveHits ?? 0) > 0)
    .map(([id, row]) => ({ id, at: row.at, depth: (row.at.x - cast.from.x) * axis.x + (row.at.y - cast.from.y) * axis.y }))
  const head = hits.reduce<typeof hits[number] | undefined>((best, hit) => !best || hit.depth > best.depth ? hit : best, undefined)
  return head && head.depth >= 520 * 2 / 3 && hits.some(hit => hit.depth <= 520 / 3) ? head : undefined
}

function binderWarning(battle: EdgeBattle, cast: SkillCast, to: EdgePoint, duration: number, area?: EdgeArea,
  details: { from?: EdgePoint; target?: EdgeUnitId; kind?: string } = {}, step?: Step) {
  let warning: AreaVisual | undefined
  if (area) {
    const damage = step?.operations.find(op => op.kind === "d")?.args[0]
    warning = visual(battle, cast, area, "warning", duration, undefined, damage ? "damage" : "control")
    warning.custom = true
    warning.damagePower = damage
    if (step) attachShove(warning, cast, step)
  }
  showBinderBeat(battle, cast, "prepare", to, { duration, area, ...details })
  return warning
}

function releaseBinderWard(battle: EdgeBattle, watch: Watch, event: SkillEvent) {
  const { cast } = watch
  const holder = unitOf(battle, watch.target)
  const attacker = unitOf(battle, event.source)
  const reach = binderArt(cast)?.motif === "cuffWard" ? 200 : 260
  if (!holder?.hp || !attacker?.hp || friendly(battle, holder.id, attacker.id) || edgeDistance(holder, attacker) > reach ||
    (event.amount ?? 0) + (event.absorbed ?? 0) <= 0) return
  watch.uses = 0
  const from = point(holder)
  const flight = clamp(edgeDistance(from, attacker) / 790, .14, .30)
  showBinderBeat(battle, cast, "flight", attacker, { from, target: attacker.id, duration: flight, kind: "counter" })
  later(battle, flight, () => {
    if (!attacker.hp) return
    applyStep(battle, cast, watch.step, { ...event, from, attacker: attacker.id, target: attacker.id, at: point(attacker) },
      false, undefined, [attacker])
    showBinderBeat(battle, cast, "release", attacker, { from, target: attacker.id, kind: "counter" })
  })
}

function releaseBinderLink(battle: EdgeBattle, watch: Watch, event: SkillEvent) {
  const { cast } = watch
  const lead = unitOf(battle, event.target)
  const partner = unitOf(battle, cast.binderLink?.find(id => id !== event.target))
  if (!lead?.hp || !partner?.hp || !event.landing || !event.axis || (event.distance ?? 0) < 3) return
  for (const linked of battle.runtime.watches) if (linked.cast === cast) linked.uses = 0
  const from = point(partner)
  const percent = watch.step.operations[0].args[0]
  cast.used.add("binderLinkRelay")
  shoveUnit(battle, cast, partner, (event.distance ?? 0) * ratio(percent), "eventaxis", event, false, event.axis)
  const end = partner.force?.cause === cast ? point(partner.force.end) : undefined
  showBinderBeat(battle, cast, "release", lead, { from, target: lead.id, kind: "link",
    paths: [{ at: point(lead), end: event.landing, unit: lead.id }, { at: from, end, unit: partner.id }] })
}

export function binderLockAttack(active: EdgeActive) {
  const art = binderChoreography(active.id)
  if (!art || art.motif === "cordDart" || active.aim.mode !== "enemy") return
  const power = plainTargetDamage(active.steps[0])
  if (power) return { power, range: active.aim.range, windup: art.windup, delay: 0 }
}

const binderOriginLimit = { distance: 6, exclusive: true }
export const binderWindupOrigin = { needsUnforcedOwner: true, originLimit: binderOriginLimit }

function runBinderSkill(battle: EdgeBattle, cast: SkillCast, active: EdgeActive) {
  const owner = unitOf(battle, cast.owner)
  const art = binderArt(cast)
  if (!owner || !art) return
  const { motif, windup } = art
  const first = active.steps[0]
  const openingArea = stepArea(battle, cast, first)
  const picked = () => unitOf(battle, cast.target)
  const target = picked()
  const opening = (active.aim.mode === "point" || active.aim.mode === "direction") && fixedAreaStrike(cast, first, openingArea, true)
  const strike = opening && { ...opening, ...binderWindupOrigin }
  const warning = binderWarning(battle, cast, openingArea?.center ?? target ?? cast.aim, windup, openingArea, { target: target?.id }, first)
  if (warning && strike) warning.strike = strike
  const schedule = (delay: number, work: () => void, strike?: PendingStrike) => {
    if (battle.finishedAt !== null) return
    cast.pending++
    later(battle, delay, () => {
      work()
      cast.pending--
      finishCast(battle, cast)
    }, strike)
  }
  const land = (step: Step, index: number, area?: EdgeArea, only?: EdgeUnit[]) => {
    if (battle.finishedAt !== null) return
    cast.stage = index
    const event = eventFor(cast, "cast", picked())
    if (step.zone || step.watch) register(battle, cast, step, event)
    else applyStep(battle, cast, step, event, false, area, only)
  }
  const apply = () => {
    const primary = picked()
    if (motif === "fixedTether" || motif === "shadowPlate") cast.aim = point(primary ?? cast.aim)
    const basin = motif === "sinkBasin" && openingArea ? select(battle, cast, first.selector, undefined, openingArea) : []
    land(first, 1, openingArea)
    if (motif === "coupled") {
      const partner = primary?.hp && nodes(battle).filter(unit => unit.hp && unit !== primary &&
        !friendly(battle, unit.id, owner.id) && edgeDistance(unit, primary) <= 150)
        .sort((a, b) => edgeDistance(a, primary) - edgeDistance(b, primary))[0]
      if (!primary || !partner) return
      cast.binderLink = [primary.id, partner.id]
      const reaction = active.steps[1]
      if (!reaction.watch) return
      const linked = { ...reaction, watch: { ...reaction.watch, holder: parseSelector("v") } }
      for (const unit of [primary, partner]) register(battle, cast, linked, eventFor(cast, "cast", unit))
      showBinderBeat(battle, cast, "deploy", primary, { from: partner, target: primary.id, kind: "link" })
      return
    }
    for (const [offset, step] of active.steps.slice(1).entries()) {
      const index = offset + 2
      if (motif === "sinkBasin") {
        const core = stepArea(battle, cast, step)
        if (!core) continue
        const tracked = basin.map(unit => ({ unit, motion: unit.force }))
        schedule(.24, () => {
          const arrived = tracked.filter(({ unit, motion }) => unit.hp && !unit.force && areaHits(core, unit) &&
            (!motion || motion.cause === cast && motion.completed && edgeDistance(unit, motion.end) < 3)).map(({ unit }) => unit)
          if (arrived.length) land(step, index, core, arrived)
        })
      } else if (motif === "pressurePin") {
        const head = binderHead(cast, [...cast.trace].filter(([, hit]) => (hit.effectiveHits ?? 0) > 0)
          .map(([id, hit]) => ({ id, at: point(hit.at) })))
        if (!head) continue
        const area = areaOf("C", head.at, direction(cast.from, cast.aim), step.selector.size[0])
        const warning = binderWarning(battle, cast, head.at, step.delay, area, { kind: "head" }, step)
        const follow: PendingStrike = { cast, area, needsOwner: false, power: 0, step, excludedTarget: head.id }
        if (warning) warning.strike = follow
        schedule(step.delay, () => land(step, index, area,
          select(battle, cast, step.selector, undefined, area).filter(unit => unit.id !== head.id)), follow)
      } else {
        const delay = step.delay - first.delay
        if (delay > 0) {
          const area = stepArea(battle, cast, step)
          binderWarning(battle, cast, area?.center ?? cast.aim, delay, area, { kind: "echo" }, step)
          schedule(delay, () => {
            if ((motif === "shadowPlate" || motif === "oldAnchor") && (!primary?.hp || !area || !areaHits(area, primary))) {
              showBinderBeat(battle, cast, "miss", area?.center ?? cast.aim, { area, kind: "escaped" })
              return
            }
            land(step, index, area)
          })
        } else land(step, index)
      }
    }
  }
  const lock = binderLockAttack(active)
  schedule(windup, () => {
    const primary = picked()
    const targeted = active.aim.mode === "enemy" || active.aim.mode === "ally"
    if (!owner.hp || owner.force || edgeDistance(owner, cast.from) >= binderOriginLimit.distance ||
      targeted && (!primary?.hp || skillCastProblem(battle, owner, active, primary, primary))) {
      showBinderBeat(battle, cast, "miss", openingArea?.center ?? cast.aim, { area: openingArea })
      return
    }
    if (motif === "cordDart" && primary) {
      const flight = clamp(edgeDistance(owner, primary) / 850, .15, .30)
      showBinderBeat(battle, cast, "flight", primary, { from: owner, target: primary.id, duration: flight })
      schedule(flight, () => {
        if (primary.hp) apply()
        else showBinderBeat(battle, cast, "miss", primary)
      })
    } else apply()
  }, lock && cast.target !== undefined ? {
    cast, power: lock.power, target: cast.target, range: lock.range, locksAt: battle.time + lock.windup,
    ...binderWindupOrigin,
  } : strike || undefined)
}

type DanceMove = { unit: EdgeFighter; route: DancerPath }

function dancerCanShift(unit: EdgeUnit | undefined): unit is EdgeFighter {
  return !!unit?.hp && isFighter(unit) && !isOutside(unit) && !unit.force
}

function nearestDanceAlly(battle: EdgeBattle, owner: EdgeUnitId, at: EdgePoint) {
  return alliesOf(battle, owner).filter(unit => unit.hp)
    .sort((a, b) => edgeDistance(a, at) - edgeDistance(b, at))[0]
}

function dancerFieldRail(cast: SkillCast, step: Step) {
  const motif = dancerArt(cast)?.motif
  if (!step.zone || step.selector.shape !== "L" ||
    !["finaleSlider", "foldSlider", "guardRail", "threeBeat"].includes(motif ?? "")) return
  const [length, width] = step.selector.size
  const aimed = motif === "finaleSlider" || motif === "foldSlider"
  const head = inside(cast.from, 0)
  const end = aimed ? cast.aim : along(head, direction(cast.from, cast.aim), length)
  return dancerRail(head, aimed ? end : dancerClippedEnd(head, end), length, width, motif === "foldSlider")
}

function dancerSkillRoutes(battle: EdgeBattle, cast: SkillCast, active: EdgeActive, commit = false, at = battle.time): DanceMove[] {
  const owner = unitOf(battle, cast.owner)
  const picked = unitOf(battle, cast.target)
  const move = active.steps[0].operations.find(op => op.kind === "dash" || op.kind === "rot")
  if (!move || !owner || !isFighter(owner)) return []
  const motif = dancerArt(cast)?.motif
  const length = move.args[0]
  const routeTo = (unit: EdgeFighter, end: EdgePoint) => ({ unit,
    route: dancerPath([unit, skillTravelEnd(battle, cast, unit, dancerClippedEnd(unit, end), commit)]) })
  if (motif === "pairedRibbon" || motif === "goldRailPair") {
    if (!dancerCanShift(owner) || !dancerCanShift(picked)) return []
    const axis = left(direction(owner, picked))
    const limits = [owner, picked].map(unit => edgeDistance(unit, dancerClippedEnd(unit, along(unit, axis, length))))
    const limit = Math.min(...limits)
    const first = routeTo(owner, along(owner, axis, limit))
    return [first, { unit: picked, route: dancerPath([picked, along(picked, axis, first.route.length)]) }]
  }
  if (motif === "quarterOrbit" || motif === "counterSwing" || motif === "coastRelay" || motif === "inwardFans") {
    const center = cast.aim
    const area = areaOf("C", center, { x: 1, y: 0 }, active.steps[0].selector.size[0])
    const group = alliesOf(battle, owner.id).filter(unit => dancerCanShift(unit) && areaHits(area, unit))
    if (motif === "coastRelay") group.sort((a, b) => edgeDistance(owner, a) - edgeDistance(owner, b))
    return group.map(unit => dancerOrbitMove(battle, cast, unit, move, commit))
  }
  if (motif === "reversePrint") {
    if (!dancerCanShift(picked)) return []
    const route = dancerHistory(picked, battle.runtime.histories.get(picked.id)?.positions ?? [], at, length)
    return [{ unit: picked, route: route ? shortenDancerPath(battle, cast, picked, route, commit) : dancerPath([picked]) }]
  }
  if (motif === "leadSide") {
    if (!dancerCanShift(picked)) return []
    return [routeTo(picked, along(picked, direction(owner, picked), length))]
  }
  if (!["halfTurn", "threadCut", "wakeFan", "doubleJump"].includes(motif ?? "") || !dancerCanShift(owner)) return []
  return [routeTo(owner, along(owner, direction(owner, cast.aim), Math.min(length, edgeDistance(owner, cast.aim))))]
}

function shortenDancerPath(battle: EdgeBattle, cast: SkillCast, unit: EdgeFighter, route: DancerPath, commit: boolean) {
  const end = route.points.at(-1)!
  const gap = edgeDistance(unit, end)
  if (gap < 3) return route
  return trimDancerPath(route, route.length * edgeDistance(unit, skillTravelEnd(battle, cast, unit, end, commit)) / gap)
}

function dancerOrbitMove(battle: EdgeBattle, cast: SkillCast, unit: EdgeFighter, move: Operation, commit: boolean): DanceMove {
  const center = cast.aim
  if (move.kind === "rot") return { unit, route: shortenDancerPath(battle, cast, unit, dancerOrbit(unit, center, move.args[0]), commit) }
  const reach = Math.min(move.args[0], Math.max(0, edgeDistance(unit, center) - 54))
  const end = along(unit, direction(unit, center), reach)
  return { unit, route: dancerPath([unit, skillTravelEnd(battle, cast, unit, end, commit)]) }
}

function scheduleDance(battle: EdgeBattle, cast: SkillCast, delay: number, run: () => void) {
  if (battle.finishedAt !== null) return
  cast.pending++
  later(battle, delay, () => {
    run()
    cast.pending--
    finishCast(battle, cast)
  })
}

function launchDancerPaths(battle: EdgeBattle, cast: SkillCast, moves: DanceMove[], duration: number, kind: string,
  settle: (unit: EdgeFighter, event: SkillEvent, motion: NonNullable<EdgeUnit["force"]> | null) => void) {
  const runs = moves.filter(({ unit }) => dancerCanShift(unit)).map(({ unit, route }) => {
    const end = route.points.at(-1)!
    return { unit, route, end, motion: forceTo(battle, unit, end, duration, false, cast, route) }
  })
  const travels = runs.filter(run => run.motion)
  if (travels.length) showDancerBeat(battle, cast, "travel", travels[0].end, {
    from: travels[0].route.points[0], duration, kind, paths: travels.map(({ unit, route }) => ({ unit: unit.id, route })),
    target: travels.length === 1 ? travels[0].unit.id : undefined,
  })
  const arrive = () => {
    const arrived = runs.filter(({ unit, end, motion }) => unit.hp && !unit.force &&
      (!motion || motion.completed) && edgeDistance(unit, end) < 3)
    const danceGroup = arrived.flatMap(({ unit, route, motion }) => motion
      ? [{ id: unit.id, from: route.points[0], landing: point(unit) }] : [])
    for (const { unit, route, end, motion } of arrived) {
      if (!unit.hp || unit.force || edgeDistance(unit, end) >= 3 || battle.finishedAt !== null) continue
      const from = route.points[0], landing = point(unit)
      const event = { ...eventFor(cast, "dash", unit), from, landing, distance: edgeDistance(from, landing), danceGroup,
        style: kind === "orbit" ? "rot" : "dash" }
      if (motion) {
        if (kind !== "glide" && kind !== "hop") {
          cast.used.add("dash")
          history(battle, unit).from = from
          emit(battle, event)
        }
        showDancerBeat(battle, cast, "land", landing, {
          from, target: unit.id, kind, paths: [{ unit: unit.id, route }], duration: .63,
        })
      }
      settle(unit, event, motion)
    }
    const motif = dancerArt(cast)?.motif
    if (battle.finishedAt !== null || !danceGroup.length) return
    const group = danceGroup.flatMap(row => unitOf(battle, row.id) ?? []).filter(unit => unit.hp)
    if (kind === "orbit" && group.length >= 2) emit(battle, { ...eventFor(cast, "assist", group[0]), from: cast.aim, danceGroup,
      style: "danceOrbitGroup" })
    if (motif === "inwardFans") {
      const injured = group.filter(unit => unit.hp < unit.maxHp).sort((a, b) => hpPct(a) - hpPct(b))[0]
      if (injured) emit(battle, { ...eventFor(cast, "assist", injured), from: cast.aim, danceGroup, style: "danceGather" })
    }
  }
  if (travels.length) scheduleDance(battle, cast, duration, arrive)
  else arrive()
}

function dancerHit(battle: EdgeBattle, cast: SkillCast, step: Step, area: EdgeArea, event: SkillEvent | undefined,
  kind: string, oncePerEnemy = false, showEmpty = true) {
  const candidates = select(battle, cast, step.selector, event, area)
    .filter(unit => !oncePerEnemy || !cast.used.has("danceHit/" + unit.id))
    .map(unit => ({ unit, at: point(unit), hits: cast.trace.get(unit.id)?.effectiveHits ?? 0, force: unit.force }))
  if (!showEmpty && !candidates.length) return
  cast.stage++
  applyStep(battle, cast, step, event, false, area, candidates.map(row => row.unit))
  const hit = candidates.filter(({ unit, hits, force }) => (cast.trace.get(unit.id)?.effectiveHits ?? 0) > hits || unit.force && unit.force !== force)
  if (oncePerEnemy) for (const { unit } of hit) cast.used.add("danceHit/" + unit.id)
  if (!showEmpty && !hit.length) return
  showDancerBeat(battle, cast, "strike", area.center, {
    from: event?.from ?? cast.from, area, contacts: hit.map(({ at }) => at), kind: hit.length ? kind : "empty",
    paths: hit.flatMap(({ unit, at, force }) => unit.force && unit.force !== force && unit.force.cause?.id === cast.id
      ? [{ unit: unit.id, route: dancerPath([at, unit.force.end]) }] : []),
  })
}

function dancerSweep(battle: EdgeBattle, cast: SkillCast, before: EdgePoint, unit: EdgeUnit) {
  const length = edgeDistance(before, unit)
  const step = cast.skill?.steps[1]
  if (length < .02 || !step) return
  const width = step.selector.size[1]
  const area = areaOf("L", before, direction(before, unit), length, width)
  area.parts.push({ kind: "circle", center: point(unit), radius: width / 2 })
  dancerHit(battle, cast, step, area, { ...eventFor(cast, "dash", unit), from: before }, "sweep", true, false)
}

function runDancerSkill(battle: EdgeBattle, cast: SkillCast, active: EdgeActive) {
  const art = dancerArt(cast)!
  const owner = unitOf(battle, cast.owner)
  if (!owner || !isFighter(owner)) return
  const target = unitOf(battle, cast.target)
  const first = active.steps[0], second = active.steps[1], third = active.steps[2]
  const initial = dancerSkillRoutes(battle, cast, active)
  const areas = dancerSkillAreas(battle, cast, active, initial)
  const windup = point(owner)
  const startedAt = battle.time
  showDancerBeat(battle, cast, "prepare", target ?? cast.aim, {
    duration: art.windup, target: target?.id, area: areas[0], paths: initial.map(({ unit, route }) => ({ unit: unit.id, route })),
  })
  scheduleDance(battle, cast, art.windup, () => {
    if (!owner.hp || owner.force || edgeDistance(owner, windup) >= 3 || history(battle, owner).standAt > startedAt + .001 ||
      target && skillCastProblem(battle, owner, active, target, target)) {
      showDancerBeat(battle, cast, "miss", target ?? cast.aim, { area: areas[0] })
      return
    }
    const motif = art.motif
    const moves = dancerSkillRoutes(battle, cast, active, motif !== "coastRelay")
    const put = (step: Step, unit: EdgeFighter, event: SkillEvent) => applyStep(battle, cast,
      { ...step, operations: step.operations.filter(op => op.kind !== "dash" && op.kind !== "rot") }, event, false, event.area, [unit])
    const strike = (step: Step, event?: SkillEvent, tag = "strike", once = false) => {
      const area = stepArea(battle, cast, step, event)
      if (area) dancerHit(battle, cast, step, area, event, tag, once)
    }
    switch (motif) {
      case "halfTurn": case "leadSide": case "threadCut": case "pairedRibbon": case "goldRailPair":
      case "quarterOrbit": case "inwardFans": case "reversePrint":
        launchDancerPaths(battle, cast, moves, motif === "reversePrint" ? REVERSE_PRINT_TRAVEL : motif === "quarterOrbit" ? .43
          : motif === "inwardFans" ? .34 : art.pairedTravel || .26,
          motif === "quarterOrbit" ? "orbit" : "dash", (unit, event) => put(first, unit, event))
        break
      case "wakeFan": case "doubleJump":
        if (!moves.length) break
        launchDancerPaths(battle, cast, moves, motif === "wakeFan" ? .32 : .37, "dash", (_, event, motion) => {
          if (third && motion) strike(third, event, "arrival")
        })
        strike(second, undefined, "departure")
        break
      case "sideSweep": case "clearLane": case "partedLane":
        strike(first)
        if (second) register(battle, cast, second)
        break
      case "counterSwing":
        launchDancerPaths(battle, cast, moves, .42, "orbit", (unit, event) => {
          put(first, unit, event)
          strike(second, event, "arrival", true)
        })
        break
      case "coastRelay": {
        const move = first.operations[0]
        const area = areas[0]
        for (const [index, { unit }] of moves.entries()) {
          const launch = () => {
            if (!dancerCanShift(unit) || !area || !areaHits(area, unit)) return
            launchDancerPaths(battle, cast, [dancerOrbitMove(battle, cast, unit, move, true)], .38, "orbit", (recipient, event) => {
              put(first, recipient, event)
              strike(second, event, "arrival", true)
            })
          }
          if (index === 0) launch()
          else scheduleDance(battle, cast, index * .18, launch)
        }
        break
      }
      default:
        for (const step of active.steps) register(battle, cast, step)
    }
  })
}

function dancerSkillAreas(battle: EdgeBattle, cast: SkillCast, active: EdgeActive, moves = dancerSkillRoutes(battle, cast, active)) {
  const first = active.steps[0], second = active.steps[1]
  const motif = dancerArt(cast)?.motif
  const circle = (at: EdgePoint, radius: number) => areaOf("C", at, { x: 1, y: 0 }, radius)
  const route = moves[0]?.route
  if (motif === "threadCut" && route && route.length > 0)
    return [areaOf("L", route.points[0], direction(route.points[0], route.points.at(-1)!), route.length, second.selector.size[1])]
  if (motif === "wakeFan") return [circle(cast.from, second.selector.size[0])]
  if (motif === "doubleJump" && route)
    return [circle(cast.from, second.selector.size[0]), circle(route.points.at(-1)!, active.steps[2].selector.size[0])]
  const area = stepArea(battle, cast, first)
  if (!area) return []
  if (motif === "coastRelay" || motif === "counterSwing")
    return [area, ...moves.map(({ route }) => circle(route.points.at(-1)!, second.selector.size[0]))]
  return [area]
}

function releaseDancerWatch(battle: EdgeBattle, watch: Watch, event: SkillEvent) {
  const { cast, step } = watch
  const motif = dancerArt(cast)?.motif
  const unit = unitOf(battle, watch.target)
  if (!unit?.hp || !isFighter(unit)) return true
  const origin = watch.event?.from ?? cast.from
  switch (motif) {
    case "lightPost": case "oldStep": case "stopDrum": {
      const manualShift = motif === "oldStep" && event.kind === "dash" && event.source === unit.id && event.cast.used.has("manual")
      if (!event.danceWalk && !manualShift || motif === "lightPost" && edgeDistance(origin, unit) < 95) return true
      for (const other of battle.runtime.watches) if (other.cast === cast && other.target === unit.id) other.uses = 0
      const settled = { ...event, from: origin, landing: point(unit), danceWalk: event.danceWalk }
      const area = selectionArea(battle, cast, step.selector, settled)
      applyStep(battle, cast, step, settled, false, area)
      showDancerBeat(battle, cast, "release", unit, { from: origin, area, target: unit.id, kind: "footprint" })
      return true
    }
    case "reboundAnchor": case "retreatFlash": {
      if (!dancerCanShift(unit) && (motif === "reboundAnchor" || isOutside(unit))) return true
      if (motif === "reboundAnchor" ? event.style !== "push"
        : !event.direct || friendly(battle, event.source, unit.id) || (event.amount ?? 0) + (event.absorbed ?? 0) <= 0) return true
      watch.uses = 0
      const attacker = event.from ?? event.cast.from
      const away = direction(attacker, unit)
      const [distance] = step.operations[0].args
      const launch = () => {
        if (!dancerCanShift(unit)) return
        const to = motif === "reboundAnchor"
          ? along(unit, direction(unit, origin), Math.min(distance, edgeDistance(unit, origin)))
          : along(unit, away, distance)
        const end = dancerClippedEnd(unit, to)
        launchDancerPaths(battle, cast, [{ unit, route: dancerPath([unit, end]) }], motif === "reboundAnchor" ? .30 : .29, "dash",
          (target, landed) => applyStep(battle, cast, { ...step, operations: step.operations.slice(1) }, landed, false, undefined, [target]))
      }
      if (motif === "reboundAnchor") launch()
      else {
        showDancerBeat(battle, cast, "release", unit, { from: attacker, target: unit.id, kind: "incoming", duration: .49 })
        scheduleDance(battle, cast, .034, () => {
          const hitMotion = unit.force
          if (!hitMotion) launch()
          else if (hitMotion.kind === "push" && !isOutside(hitMotion.end))
            scheduleDance(battle, cast, Math.max(.001, hitMotion.since + hitMotion.duration - battle.time) + .0001, () => {
              if (hitMotion.completed && !unit.force && edgeDistance(unit, hitMotion.end) < 3) launch()
            })
        })
      }
      return true
    }
    default: return false
  }
}

function dancerFieldBenefit(battle: EdgeBattle, field: FieldEffect, unit: EdgeFighter, at: EdgePoint, kind: string, from?: EdgePoint) {
  const cast = field.cast
  const event = { ...eventFor(cast, "assist", unit), intercept: point(at), from: from ?? field.area.center, area: field.area, zone: true, style: "zone" }
  field.seen.add(unit.id)
  const ops = field.step.operations.filter(op => op.kind !== "speed" || field.mode === "dancehinge")
  applyStep(battle, cast, { ...field.step, operations: ops }, event, field.derived, field.area, [unit], field.gold)
  showDancerBeat(battle, cast, "release", at, { from: event.from, target: unit.id, area: field.area, kind })
}

export function dancerWalkCrossing(battle: EdgeBattle, unit: EdgeUnit, before: EdgePoint) {
  if (!unit.hp || !isFighter(unit) || !unit.move || unit.force || edgeDistance(before, unit) < .01) return
  for (const field of battle.runtime.fields) {
    if (field.until <= battle.time || field.seen.has(unit.id) || !friendly(battle, unit.id, field.cast.owner) ||
      !["danceentry", "dancehinge", "dancepasses", "dancelamp"].includes(field.mode)) continue
    const corner = field.danceRail?.corner
    const gate = corner ? areaOf("C", corner, { x: 1, y: 0 }, 36) : field.area
    if (field.mode === "dancepasses" && field.seen.size >= 2 || field.mode === "dancelamp" && field.seen.size > 0 ||
      field.mode === "dancehinge" && !areaHits(field.area, before) || areaHits(gate, before)) continue
    const crossing = firstCrossing(gate, before, unit, 1)
    if (crossing) {
      dancerFieldBenefit(battle, field, unit, crossing, corner ? "hinge" : "entry", before)
      if (field.mode === "dancelamp") field.until = Math.min(field.until, battle.time + .24)
    }
  }
}

function dancerRailLanding(battle: EdgeBattle, unit: EdgeUnit, from: EdgePoint) {
  if (!unit.hp || !isFighter(unit) || isOutside(from)) return
  for (const field of battle.runtime.fields) {
    if (field.mode === "dancerail" && field.until > battle.time && friendly(battle, field.cast.owner, unit.id) &&
      !field.seen.has(unit.id) && areaHits(field.area, from))
      dancerFieldBenefit(battle, field, unit, unit, "rail", from)
  }
}

function dancerWalkFinish(battle: EdgeBattle, unit: EdgeFighter, event: SkillEvent) {
  for (const field of [...battle.runtime.fields]) {
    if (field.until <= battle.time || field.seen.has(unit.id) || !friendly(battle, unit.id, field.cast.owner)) continue
    const contains = field.danceRail ? dancerRailContains(field.danceRail, unit) : areaHits(field.area, unit)
    if (!contains) continue
    if (field.mode === "dancerail" && event.from && field.danceRail && dancerRailContains(field.danceRail, event.from) &&
      !field.cast.used.has("danceRailWalk")) {
      field.cast.used.add("danceRailWalk")
      emit(battle, { ...eventFor(field.cast, "assist", unit, event), area: field.area, style: "danceRailWalk" })
    } else if (field.mode === "dancefinish" && !field.seen.size || field.mode === "dancepasses" && field.seen.size < 2) {
      dancerFieldBenefit(battle, field, unit, unit, "footprint", event.from)
    } else if (field.mode === "danceborrow" && dancerCanShift(unit) && event.from) {
      const step = field.step
      const [distance] = step.operations[0].args
      const to = dancerClippedEnd(unit, along(unit, direction(event.from, unit), distance))
      if (edgeDistance(unit, to) < 3) continue
      field.seen.add(unit.id)
      launchDancerPaths(battle, field.cast, [{ unit, route: dancerPath([unit, to]) }], .23, "dash", (target, at) => {
        applyStep(battle, field.cast, { ...step, operations: step.operations.slice(1) },
          { ...at, area: field.area, zone: true }, false, field.area, [target])
      })
    }
  }
}

function tickDancerStill(battle: EdgeBattle, field: FieldEffect) {
  const still = field.danceStill ??= new Map()
  for (const unit of alliesOf(battle, field.cast.owner)) {
    if (!dancerCanShift(unit) || unit.move || field.seen.has(unit.id) || !areaHits(field.area, unit)) {
      still.delete(unit.id)
      continue
    }
    const since = still.get(unit.id) ?? battle.time
    still.set(unit.id, since)
    if (battle.time - since >= .9) {
      still.delete(unit.id)
      dancerFieldBenefit(battle, field, unit, unit, "still")
    }
  }
}

function runHealerSkill(battle: EdgeBattle, cast: SkillCast, active: EdgeActive, owner: EdgeFighter) {
  const art = healerArt(cast)!
  const [first, second] = active.steps
  const area = stepArea(battle, cast, first)
  const picked = unitOf(battle, cast.target)
  const rally = art.motif === "rally"
  const exiled = rally ? new Set(alliesOf(battle, owner.id).filter(unit => unit.hp && isOutside(unit)).map(unit => unit.id)) : undefined
  const selected = select(battle, cast, first.selector, undefined, area)
  const focus = area?.center ?? picked ?? (rally ? CENTER : cast.aim)
  showHealerBeat(battle, cast, "prepare", focus, {
    area, target: picked?.id, contacts: selected.map(point), duration: art.windup,
    before: picked ? hpPct(picked) / 100 : undefined, kind: rally ? "rally" : undefined,
  })
  const schedule = (delay: number, play: () => void, support?: PendingSupport) => {
    cast.pending++
    later(battle, delay, () => {
      play()
      cast.pending--
      finishCast(battle, cast)
    }, undefined, support)
  }
  const play = (step: Step, recipients?: EdgeUnit[], shape?: EdgeArea, from?: EdgePoint, style?: string) => {
    const event = { ...eventFor(cast, "cast", recipients?.[0] ?? picked), from: from && point(from), style, healerRole: style, zone: style === "zone" }
    if (step.watch || step.zone) register(battle, cast, step, event)
    else applyStep(battle, cast, step, event, false, shape, recipients)
  }
  const flight = (from: EdgePoint, target: EdgeUnit, duration: number, land: () => void, kind?: string, support?: PendingSupport) => {
    showHealerBeat(battle, cast, "flight", target, { from, target: target.id, duration, kind })
    schedule(duration, () => { if (target.hp) land() }, support)
  }
  const relay = (origin: EdgeUnit, delay: number, duration: number) => schedule(delay, () => {
    if (!origin.hp) return
    const shape = stepArea(battle, cast, second)
    const target = select(battle, cast, second.selector, undefined, shape)[0]
    if (!target) return
    const from = point(origin)
    cast.stage++
    flight(from, target, duration, () => play(second, [target], shape, from, "relay"), "relay")
  })
  const land = (launch = point(owner)) => {
    const recipients = select(battle, cast, first.selector, undefined, area)
    cast.stage = art.motif === "samePoint" ? 2 : 1
    switch (art.motif) {
      case "neighborNeedle": case "dualRoute": case "doubleNeedle":
        if (picked?.hp) {
          play(first, [picked], undefined, launch)
          relay(picked, art.motif === "doubleNeedle" ? .65 : .075, art.motif === "neighborNeedle" ? .14 : .22)
        }
        return
      case "twoWay":
        if (picked?.hp) {
          play(first, [picked], undefined, launch)
          const from = point(picked)
          cast.stage++
          flight(from, owner, .17, () => play(second, [owner], undefined, from, "relay"), "relay")
        }
        return
      case "priority": case "samePoint": {
        const priority = recipients[0]
        if (!priority) return
        const other = select(battle, cast, second.selector, undefined, area).filter(unit => unit !== priority)
        play(first, [priority], area, area?.center, "priority")
        play(second, other, area, area?.center, "support")
        return
      }
      case "sutureLane": {
        const axis = direction(cast.from, cast.aim)
        const projection = (unit: EdgeUnit) => unit.x * axis.x + unit.y * axis.y
        const ordered = recipients.sort((a, b) => projection(a) - projection(b))
        const low = ordered.find(unit => hpPct(unit) < 45)
        cast.healerPrimary = low?.id
        play(first, ordered, area, cast.from)
        if (low?.hp) play(second, [low], area, cast.from)
        return
      }
      case "triage": {
        const [budget, cap] = first.operations[0].args
        const pool = Math.floor(owner.maxHp * ratio(budget))
        let remaining = pool
        const ordered = recipients.filter(unit => unit.hp < unit.maxHp).sort((a, b) => hpPct(a) - hpPct(b))
        showHealerBeat(battle, cast, "pool", owner, { target: owner.id, amount: pool, remaining: 1 })
        const serve = (index: number) => {
          const target = ordered[index]
          if (!target || !owner.hp || remaining <= 0) return
          if (!target.hp || target.hp >= target.maxHp) { serve(index + 1); return }
          const from = point(owner)
          showHealerBeat(battle, cast, "flight", target, { from, target: target.id, duration: .16, kind: "pool" })
          schedule(.16, () => {
            if (target.hp) {
              const limit = Math.min(remaining, Math.floor(target.maxHp * ratio(cap)))
              const incoming = { ...eventFor(cast, "cast", target), area, from, index, total: ordered.length }
              remaining -= heal(battle, cast, target, limit, "pool", incoming, false, undefined, limit)
              showHealerBeat(battle, cast, "pool", owner, { target: owner.id, amount: remaining, remaining: remaining / pool })
            }
            cast.stage++
            serve(index + 1)
          })
        }
        serve(0)
        return
      }
      case "compress": case "sanctuary": {
        const clean = first.operations.find(op => op.kind === "clean")!
        play({ ...first, operations: first.operations.filter(op => op !== clean) }, recipients, area, area?.center)
        for (const [index, unit] of recipients.entries()) {
          const event = { ...eventFor(cast, "cast", unit), area, index, total: recipients.length, from: area?.center }
          if (unit.hp && cleanse(battle, cast, unit, clean.args[0], true, clean.style, event))
            play(second, [unit], area, area?.center, "cleanse")
        }
        return
      }
      case "aidStation":
        play(first)
        return
      case "urgentCorners": {
        const low = select(battle, cast, second.selector, undefined, area)
        play(first, recipients, area, area?.center)
        play(second, low.filter(unit => unit.hp), area, area?.center, "priority")
        return
      }
      case "rally": {
        play(first, recipients, undefined, CENTER)
        play(second, recipients.filter(unit => unit.hp && exiled?.has(unit.id)), undefined, CENTER, "rally")
        const reached = recipients.filter(unit => {
          const trace = cast.trace.get(unit.id)
          return trace && (trace.heal > 0 || trace.shield)
        })
        const returned = reached.filter(unit => exiled?.has(unit.id)).map(unit => ({ id: unit.id, at: point(unit) }))
        if (returned.length) emit(battle, { ...eventFor(cast, "assist", owner), style: "healerRallyDone", healedGroup: returned })
        showHealerBeat(battle, cast, "field", CENTER, { contacts: reached, kind: "rally" })
        return
      }
      case "reverseTriage": {
        const low = select(battle, cast, second.selector)[0]
        play(first, recipients, undefined, CENTER, "team")
        if (low?.hp) {
          if ((cast.trace.get(low.id)?.heal ?? 0) > 0) emit(battle, { ...eventFor(cast, "assist", low), style: "healerWindLock", from: point(low) })
          cast.stage++
          const from = { x: low.x, y: low.y - 123 }
          flight(from, low, .34, () => play(second, [low], undefined, from, "priority"), "priority")
        }
        return
      }
      case "net": {
        play(first, recipients, area, area?.center)
        const anchors = recipients.filter(unit => unit.hp && (cast.trace.get(unit.id)?.heal ?? 0) > 0)
        const outer = select(battle, cast, second.selector).filter(unit => !area || !areaHits(area, unit))
        cast.stage++
        for (const target of outer) {
          const linked = anchors.map(unit => ({ unit, gap: edgeDistance(unit, target) }))
            .filter(({ gap }) => gap <= 100).sort((a, b) => a.gap - b.gap)[0]
          if (!linked) continue
          const from = point(linked.unit)
          flight(from, target, .22, () => play(second, [target], area, from, "zone"), "net")
        }
        return
      }
      default:
        for (const step of active.steps) play(step, undefined, area, launch)
    }
  }
  const directSupport = picked && first.selector.units === "t" && !first.selector.flags.length ? picked.id : undefined
  const support = cast.used.has("manual") ? scheduledSupport(cast, first, true, area, directSupport) : undefined
  schedule(art.windup, () => {
    if (!owner.hp) return
    if (area && art.motif !== "aidStation")
      showHealerBeat(battle, cast, "field", area.center, { area, contacts: select(battle, cast, first.selector, undefined, area).map(point) })
    if (art.delivery && picked) {
      if (!picked.hp) return
      const from = point(owner)
      const span = healerFlight(edgeDistance(from, picked))
      flight(from, picked, span, () => land(from), undefined, support && { ...support, ownerRequired: false })
    } else land()
  }, support && art.motif !== "priority" && art.motif !== "samePoint"
    ? { ...support, delivery: art.delivery && picked ? "healer" : undefined } : undefined)
}

function bardCanArm(cast: SkillCast, holder: Selector, target: EdgeUnit) {
  const motif = bardArt(cast)?.motif
  const trace = cast.trace.get(target.id)
  if (holder.units === "k" || motif === "ensembleCall" || motif === "refrain") return (trace?.effectiveHits ?? 0) > 0
  if (motif === "restCloak" || motif === "shieldRelay" || motif === "coda") return !!trace?.shield
  if (motif === "shoreCoda") return !!trace?.shield || (trace?.heal ?? 0) > 0
  return motif !== "antiphon" || (trace?.heal ?? 0) > 0
}

function bardTravel(battle: EdgeBattle, cast: SkillCast, from: EdgePoint, target: EdgeUnit, duration: number, kind: string, arrive: () => void,
  support?: PendingSupport) {
  showBardBeat(battle, cast, "flight", target, { from, target: target.id, duration, kind })
  later(battle, duration, () => { if (target.hp) arrive() }, undefined, support)
}

function bardStrikeBonus(event: SkillEvent, cast: SkillCast, amount: number, watch?: Watch, field?: FieldEffect) {
  event.bonus = (event.bonus ?? 0) + amount
  const strikes = event.bardStrikes ??= []
  strikes.push({ cast, amount, watch, field })
}

function addBardPush(event: SkillEvent, cast: SkillCast, amount: number, watch?: Watch, turn?: EdgeGold) {
  event.push = (event.push ?? 0) + amount
  const pushes = event.bardPushes ??= []
  pushes.push({ cast, amount, watch, turn })
}

function finishBardStrike(battle: EdgeBattle, event: SkillEvent, target: EdgeUnit) {
  for (const { cast, amount, watch, field } of event.bardStrikes ?? []) {
    if (watch) watch.uses--
    if (field && event.source !== undefined) field.seen.add(event.source)
    event.cast.used.add("bardHit/" + cast.id + "/" + target.id)
    cast.stage++
    showBardBeat(battle, cast, "release", target, {
      from: event.from ?? event.cast.from, target: target.id, area: field?.area, amount,
      kind: "accent", count: field?.seen.size, other: unitOf(battle, event.source),
    })
    emit(battle, { ...eventFor(cast, "assist", target, event), attacker: event.source, attackCast: event.cast,
      from: event.from ?? event.cast.from, area: field?.area, style: bardArt(cast)?.motif, amount })
  }
}

function bardExtraHit(battle: EdgeBattle, cast: SkillCast, from: EdgePoint, target: EdgeUnit, multiplier: number, kind: string, event?: SkillEvent, count?: number) {
  if (!target.hp || activeBuffs(battle, target.id, "phase").length) return 0
  const shieldBefore = target.shield
  const lost = damageUnit(battle, cast, target, cast.basis * multiplier, { ...eventFor(cast, "cast", target, event), from }, true, kind)
  const amount = lost + Math.max(0, shieldBefore - target.shield)
  if (!amount) return 0
  showBardBeat(battle, cast, "hit", target, { from, target: target.id, amount, kind, count })
  return amount
}

function bardCircleHit(battle: EdgeBattle, cast: SkillCast, center: EdgePoint, radius: number, multiplier: number, delay: number, kind: string,
  event?: SkillEvent, settle?: (hits: readonly EdgeUnit[]) => void) {
  const area = areaOf("C", center, { x: 1, y: 0 }, radius)
  showBardBeat(battle, cast, "flight", center, { from: event?.from ?? center, area, duration: delay, kind,
    paths: event?.from && [{ from: event.from, to: center }],
  })
  later(battle, delay, () => {
    const hits = nodes(battle).filter(unit => unit.hp && !friendly(battle, cast.owner, unit.id) && areaHits(area, unit) &&
      bardExtraHit(battle, cast, center, unit, multiplier, kind, event))
    showBardBeat(battle, cast, hits.length ? "release" : "rest", center, { area, kind, contacts: hits })
    settle?.(hits)
  })
}

function emitBardReturn(battle: EdgeBattle, cast: SkillCast, holder: EdgeUnit, event: SkillEvent, style: string) {
  const contact = point(event.intercept ?? holder)
  event.cast.used.add("bardReturned/" + cast.owner)
  emit(battle, { ...eventFor(cast, "assist", holder), at: contact, from: event.from ?? contact, landing: contact,
    intercept: contact, attacker: holder.id, attackCast: event.cast, style,
  })
}

function releaseBardWatch(battle: EdgeBattle, watch: Watch, event: SkillEvent) {
  const { cast, step } = watch
  const motif = bardArt(cast)?.motif
  const holder = unitOf(battle, watch.target)
  const source = unitOf(battle, event.source)
  const enemy = unitOf(battle, event.target)
  if (!holder?.hp && motif !== "ensembleCall" || !motif) return
  if (event.kind === "strike" && enemy?.hp) {
    const addition = step.operations.find(op => op.kind === "add")?.args[0]
    if (addition === undefined || !source?.hp || friendly(battle, cast.owner, enemy.id)) return
    bardStrikeBonus(event, cast, addition * cast.basis, watch)
    if (motif === "bowString") {
      const turn = bardTurnGold(battle, cast, source.id)
      const push = turn?.steps[0].operations[0].args[0] ?? step.operations.find(op => op.kind === "addp")?.args[0] ?? 0
      addBardPush(event, cast, push, undefined, turn)
    }
    return
  }
  if (motif === "stoppedString" && event.kind === "shove" && enemy?.hp) {
    if (!(event.cast.trace.get(enemy.id)?.effectiveHits ?? 0)) return
    addBardPush(event, cast, step.operations[0].args[0], watch)
    return
  }
  const contact = point(event.at ?? holder ?? cast.aim)
  if (motif === "refrain" && event.kind === "pushland") {
    if (!enemy?.hp || !event.landing) return
    watch.uses--
    cast.stage++
    bardCircleHit(battle, cast, point(event.landing), step.selector.size[0], step.operations[0].args[0], .21, "refrain", event, hits => {
      if (hits.length) emit(battle, { ...eventFor(cast, "assist", source, event), style: "bardRefrain", at: event.landing,
        attacker: source?.id, attackCast: event.cast })
    })
    return
  }
  if (motif === "echoArrow" || motif === "ensembleCall") {
    if (!source?.hp || !isFighter(source) || !enemy || friendly(battle, cast.owner, enemy.id)) return
    const note = "bardVoice/" + source.id
    if (motif === "ensembleCall" && cast.used.has(note)) return
    cast.used.add(note)
    watch.uses--
    cast.stage++
    const area = motif === "echoArrow" ? selectionArea(battle, cast, step.selector, event) : undefined
    const alternative = motif === "echoArrow" && select(battle, cast, { ...step.selector, limit: undefined }, event, area)
      .filter(unit => !activeBuffs(battle, unit.id, "phase").length)
      .sort((a, b) => edgeDistance(a, contact) - edgeDistance(b, contact))[0]
    const next = alternative || (enemy.hp ? enemy : undefined)
    const count = motif === "ensembleCall" ? 2 - watch.uses : 1
    const from = motif === "ensembleCall" ? point(source) : contact
    showBardBeat(battle, cast, "release", contact, { from, count, kind: motif, other: source, target: enemy.id })
    if (!next) return
    const owner = unitOf(battle, cast.owner)
    const lone = motif === "echoArrow" && !alternative
    const gold = lone && owner && isFighter(owner) && owner.gold?.id === "bard/R/G1" ? owner.gold : undefined
    const signed = gold && bardSignedCast(cast, gold, from)
    const power = lone ? gold?.steps[0].operations[0].args[0] ?? .30 : step.operations[0].args[0]
    const delay = motif === "ensembleCall" ? .16 : .20
    if (signed) showDefenderTrait(battle, signed, "travel", next, event, { from, target: next.id, duration: delay })
    bardTravel(battle, cast, from, next, delay, alternative ? "echo" : motif, () => {
      const amount = bardExtraHit(battle, cast, from, next, power, motif, event, count)
      if (!amount) return
      let voices: Map<EdgeUnitId, EdgePoint> | undefined
      if (motif === "ensembleCall") {
        voices = cast.bardVoices ??= new Map()
        voices.set(source.id, from)
      }
      const outcome = { ...eventFor(cast, "assist", next),
        style: voices ? "bardEnsemble" : lone ? "bardLoneEcho" : "bardEcho",
        amount, attacker: source.id, attackCast: event.cast, from, total: voices?.size ?? 1,
        bardPartners: voices && [...voices.values()],
      }
      if (signed) showDefenderTrait(battle, signed, "proc", next, outcome, { from, target: next.id })
      emit(battle, outcome)
    })
    return
  }
  if (motif === "longLead" && !event.cast.used.has("bardHit/" + cast.id + "/" + event.target)) return
  const from = point(motif === "shoreCoda" ? event.intercept ?? contact
    : motif === "shieldRelay" || motif === "threeVoices" || motif === "passingHeal" || motif === "duet" ? source ?? contact : contact)
  const incoming = { ...event, from, release: event.kind, landing: motif === "shoreCoda" ? from : event.landing }
  const area = selectionArea(battle, cast, step.selector, incoming)
  const recipients = select(battle, cast, step.selector, incoming, area)
  watch.uses--
  cast.stage++
  showBardBeat(battle, cast, "release", from, {
    from: event.from ?? (event.kind === "move" || event.kind === "return" ? contact : event.cast.from), area,
    target: holder?.id, contacts: recipients, kind: event.kind, other: source,
    paths: event.from && event.landing ? [{ from: event.from, to: from, unit: holder?.id }] : undefined,
  })
  if (motif === "shoreCoda" && holder) emitBardReturn(battle, cast, holder, event, "bardShore")
  if (motif === "longLead") {
    later(battle, .19, () => applyStep(battle, cast, step, incoming, false, area))
    return
  }
  if (!recipients.length) return
  const arrive = () => applyStep(battle, cast, step, incoming, false, area, recipients.filter(unit => unit.hp))
  if (["returnVerse", "shieldRelay", "threeVoices", "passingHeal", "duet", "coda", "antiphon"].includes(motif) && recipients.length === 1) {
    const receiver = recipients[0]
    if (edgeDistance(from, receiver) > 22) {
      const time = motif === "shieldRelay" ? .24 : motif === "threeVoices" ? .27 : .17
      bardTravel(battle, cast, from, receiver, time, motif, arrive)
      return
    }
  }
  arrive()
}

function releaseBardField(battle: EdgeBattle, field: FieldEffect, event: SkillEvent) {
  const { cast, step, area } = field
  const motif = bardArt(cast)?.motif
  const target = unitOf(battle, event.target)
  const source = unitOf(battle, event.source)
  if (motif === "echoStage") {
    if (!source?.hp || !isFighter(source) || !friendly(battle, cast.owner, source.id) || !target?.hp || friendly(battle, cast.owner, target.id) ||
      field.seen.has(source.id) || !event.direct || !event.cast.used.has("manual") || event.summon || event.zone || event.release ||
      (event.cast.issuedAt ?? -Infinity) < field.time || !areaHits(area, event.cast.from)) return
    bardStrikeBonus(event, cast, step.operations[0].args[0] * cast.basis, undefined, field)
    return
  }
  if (motif === "timingLane") {
    if (!event.danceWalk || !target?.hp || !isFighter(target) || !friendly(battle, cast.owner, target.id) ||
      field.seen.has(target.id) || !areaHits(area, target)) return
    field.seen.add(target.id)
    cast.stage++
    const incoming = { ...event, zone: true, release: "move", from: event.from ?? point(target), area }
    showBardBeat(battle, cast, "land", target, { from: incoming.from, area, target: target.id, kind: "step", count: field.seen.size })
    applyStep(battle, cast, step, incoming, false, area, [target])
    return
  }
  if (motif === "silenceCorner") {
    if (!target?.hp || friendly(battle, cast.owner, target.id) || !areaHits(area, target) || !chargeOf(battle, target)) return
    field.until = battle.time
    cast.stage++
    const incoming = { ...event, zone: true, release: "charge", from: area.center }
    applyStep(battle, cast, step, incoming, false, area, [target])
    if (cast.interrupted?.has(target.id))
      showBardBeat(battle, cast, "break", target, { from: event.from ?? area.center, area, target: target.id, kind: "charge" })
    return
  }
  if (motif !== "spectrumDuel" || !source?.hp || !isFighter(source) || !friendly(battle, cast.owner, source.id) ||
    field.seen.has(source.id) || !areaHits(area, source) || !target || friendly(battle, source.id, target.id) || event.cast.order !== "skill" ||
    !event.direct || !event.cast.used.has("manual") || event.summon || event.zone || event.release ||
    (event.amount ?? 0) + (event.absorbed ?? 0) <= 0) return
  const receiver = spectrumRecipient(alliesOf(battle, source.id), source, unit => unit, unit => unit.hp > 0)
  if (!receiver) return
  field.seen.add(source.id)
  cast.stage++
  const from = point(source)
  showBardBeat(battle, cast, "release", source, { from: event.at ?? source, area, target: source.id, kind: "spectrum", count: field.seen.size })
  bardTravel(battle, cast, from, receiver, BARD_SPECTRUM_FLIGHT, "spectrum", () => {
    const incoming = { ...event, from, zone: true, area, release: "spectrum", attacker: source.id }
    const before = cast.trace.get(receiver.id)?.heal ?? 0
    applyStep(battle, cast, step, incoming, false, area, [receiver])
    const gain = (cast.trace.get(receiver.id)?.heal ?? 0) - before
    if (gain > 0) emit(battle, { ...eventFor(cast, "assist", receiver), style: "bardSpectrum", amount: gain,
      from, attacker: source.id, attackCast: event.cast, area,
    })
  }, { cast, step, target: receiver.id, ownerRequired: false })
}

function tickBardEntry(battle: EdgeBattle, field: FieldEffect) {
  const { cast, step, area } = field
  const entered = select(battle, cast, step.selector, field.event, area).filter(isFighter)
  const prior = field.previous
  field.previous = new Set(entered.map(unit => unit.id))
  for (const target of entered.filter(unit => !prior.has(unit.id)).sort((a, b) => edgeDistance(a, area.center) - edgeDistance(b, area.center))) {
    const from = history(battle, target).positions.at(-1)?.at ?? area.center
    const intercept = firstCrossing(area, from, target, 12) ?? point(target)
    const incoming = { ...eventFor(cast, "move", target, field.event), from: intercept, area, zone: true, release: "entry" }
    if (!shield(battle, cast, target, target.maxHp * ratio(step.operations[0].args[0]), 10, incoming)) continue
    cast.stage++
    field.until = battle.time
    showBardBeat(battle, cast, "release", target, { from: intercept, target: target.id, area, kind: "entry" })
    break
  }
}

function bardArmRange(battle: EdgeBattle, cast: SkillCast, actor: EdgeUnit, target: EdgeUnit) {
  const intrinsic = Math.max(actor.range, ...activeBuffs(battle, actor.id, "choose").map(buff => buff.values[0]))
  const reach = modifier(battle, actor, "range", target)
  const guide = modifier(battle, actor, "qr", target)
  const distance = edgeDistance(actor, target)
  if (distance > intrinsic + reach) {
    const extender = activeBuffs(battle, actor.id, "qr").sort((a, b) => b.values[0] - a.values[0])[0]
    if (extender && bardArt(extender.cast)) {
      cast.used.add("bardReach/" + extender.cast.id)
      cast.bardGuideLimit = intrinsic + reach
    }
  }
  if (distance <= intrinsic + guide) return
  const field = battle.runtime.fields.find(zone => bardArt(zone.cast)?.motif === "residency" && zone.until > battle.time &&
    select(battle, zone.cast, zone.step.selector, undefined, zone.area).includes(actor) && zone.step.operations[0].args[0] === reach)
  if (field) cast.bardRange = { cast: field.cast, at: point(actor), area: field.area, amount: reach, baseline: intrinsic + guide }
}

function runBardSkill(battle: EdgeBattle, cast: SkillCast, active: EdgeActive, owner: EdgeFighter) {
  const art = bardArt(cast)!
  const picked = unitOf(battle, cast.target)
  const shape = active.steps.find(step => !step.watch && (step.zone?.holder ?? step.selector).shape)
  const area = shape && stepArea(battle, cast, shape)
  const schedule = (time: number, work: () => void, strike?: PendingStrike, support?: PendingSupport) => {
    cast.pending++
    later(battle, time, () => {
      work()
      cast.pending--
      finishCast(battle, cast)
    }, strike, support)
  }
  showBardBeat(battle, cast, "prepare", picked ?? cast.aim, {
    from: owner, target: picked?.id, area, duration: art.windup,
  })
  const land = (from: EdgePoint) => {
    cast.stage++
    const [first, second] = active.steps
    const incoming = { ...eventFor(cast, "cast", picked), from }
    if (art.motif === "overture") {
      const seats = overtureSeats(cast.from, cast.aim, select(battle, cast, first.selector), unit => unit)
      const ward = { ...first, operations: first.operations.filter(op => op.kind !== "dash") }
      const reach = first.operations[0].args[0]
      for (const { unit, index, seat } of seats) {
        schedule(bardSeatDelay(index), () => {
          if (!unit.hp || unit.force || isOutside(unit)) return
          const start = point(unit)
          const end = overtureLanding(start, seat, reach)
          const arrive = () => {
            showBardBeat(battle, cast, "land", unit, { from: start, target: unit.id, count: index + 1, kind: "overture",
              paths: [{ from: start, to: point(unit), unit: unit.id }],
            })
            applyStep(battle, cast, ward, { ...incoming, from: start, landing: point(unit) }, false, undefined, [unit])
          }
          if (edgeDistance(start, end) < 3) { arrive(); return }
          const length = BARD_SEAT_TRAVEL
          const motion = forceTo(battle, unit, end, length, false, cast)
          if (!motion) return
          showBardBeat(battle, cast, "flight", end, { from: start, duration: length, kind: "overture", count: index + 1,
            paths: [{ from: start, to: point(end), unit: unit.id }],
          })
          schedule(length, () => {
            if (unit.hp && motion.completed && edgeDistance(unit, end) < 2) {
              const seats = cast.bardSeats ??= []
              seats.push({ id: unit.id, from: start, landing: point(unit) })
              emit(battle, { ...eventFor(cast, "dash", unit), from: start, landing: point(unit), distance: edgeDistance(unit, start), style: "overture" })
              arrive()
            }
          }, undefined, { cast, step: ward, target: unit.id, ownerRequired: false, landing: motion })
        })
      }
      return
    }
    if (art.motif === "rescueSymphony" || art.motif === "finalScore") {
      const recipients = select(battle, cast, first.selector).sort((a, b) => hpPct(a) - hpPct(b))
      const low = new Set(recipients.filter(unit => hpPct(unit) < 45).map(unit => unit.id))
      showBardBeat(battle, cast, "deploy", owner, { from, contacts: recipients, count: recipients.length, kind: art.motif })
      for (const [index, unit] of recipients.entries()) schedule(bardRecipientDelay(index), () => {
        if (!unit.hp) return
        cast.stage = index + 1
        const event = { ...incoming, from: point(owner), index, total: recipients.length }
        applyStep(battle, cast, first, event, false, undefined, [unit])
        if (second && low.has(unit.id)) applyStep(battle, cast, second, event, false, undefined, [unit])
      })
      return
    }
    if (art.motif === "harmonyNeedle" && picked) {
      applyStep(battle, cast, first, incoming, false, undefined, [picked])
      if (!(cast.trace.get(picked.id)?.effectiveHits ?? 0)) return
      const contact = cast.trace.get(picked.id)!.at
      const event = { ...incoming, from: contact, at: contact, release: "harmony" }
      const relayArea = selectionArea(battle, cast, second.selector, event)
      const receiver = select(battle, cast, second.selector, event, relayArea).find(isFighter)
      if (receiver) {
        showBardBeat(battle, cast, "flight", receiver, { from: contact, target: receiver.id, duration: .18, kind: "ward" })
        schedule(.18, () => { if (receiver.hp) applyStep(battle, cast, second, event, false, relayArea, [receiver]) })
      }
      return
    }
    for (const step of active.steps) register(battle, cast, step, incoming)
  }
  const opening = art.delivery === "none" && (active.aim.mode === "point" || active.aim.mode === "direction")
    ? fixedAreaStrike(cast, active.steps[0], area, true) : undefined
  schedule(art.windup, () => {
    if (!owner.hp || owner.force || cast.target !== undefined && (!picked?.hp || edgeDistance(owner, picked) > active.aim.range ||
      active.aim.mode === "enemy" && activeBuffs(battle, picked.id, "phase").length ||
      art.motif === "shoreCoda" && !isOutside(picked))) {
      showBardBeat(battle, cast, "rest", owner, { from: owner, kind: "cut", duration: .31 })
      return
    }
    const from = point(owner)
    const span = picked ? bardFlight(art.motif, art.delivery, edgeDistance(from, picked)) : 0
    if (!picked || !span) { land(from); return }
    showBardBeat(battle, cast, "flight", picked, { from, target: picked.id, duration: span, kind: art.delivery })
    schedule(span, () => {
      if (picked.hp && (active.aim.mode !== "enemy" || !activeBuffs(battle, picked.id, "phase").length) &&
        (art.motif !== "shoreCoda" || isOutside(picked))) land(from)
    })
  }, opening && { ...opening, needsUnforcedOwner: true })
}

export const furnaceFlight = (distance: number) => clamp(distance / 900, .24, .46)

export function castSkill(battle: EdgeBattle, cast: SkillCast, active: EdgeActive) {
  const owner = unitOf(battle, cast.owner)
  if (!owner || !isFighter(owner)) return
  cue(battle, "skill", owner, cast.aim)
  if (active.deployment) {
    const group = deploySummon(battle, cast, owner, active.deployment, active.name, owner.card.rarity)
    for (const body of group.deployment.bodies) showSummonBeat(battle, group, body, "deploy")
    emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
    return
  }
  if (bardArt(cast)) {
    emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
    runBardSkill(battle, cast, active, owner)
    return
  }
  if (healerArt(cast)) {
    emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
    runHealerSkill(battle, cast, active, owner)
    return
  }
  if (dancerArt(cast)) {
    emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
    runDancerSkill(battle, cast, active)
    return
  }
  if (binderArt(cast)) {
    emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
    runBinderSkill(battle, cast, active)
    return
  }
  if (lifeArt(cast)) {
    emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
    runLifeSkill(battle, cast, active)
    return
  }
  if (warlockArt(cast)) {
    emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
    runWarlockSkill(battle, cast, active)
    return
  }
  if (assassinArt(cast)) {
    emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
    runAssassinSkill(battle, cast, active)
    return
  }
  const lead = playSkillArtwork(battle, cast, owner, active)
  emit(battle, eventFor(cast, "cast", unitOf(battle, cast.target)))
  if (paladinArt(cast)?.delivery) {
    cast.pending++
    later(battle, lead, () => {
      const target = unitOf(battle, cast.target)
      if (owner.hp && target && paladinTargetReady(battle, cast, owner)) {
        const lamp = paladinArt(cast)?.motif === "lamp"
        const flight = clamp(edgeDistance(owner, target) / (lamp ? 650 : 710), lamp ? .16 : .19, lamp ? .31 : .36)
        cast.paladinLaunch = point(owner)
        showPaladinBeat(battle, cast, "flight", target, { from: owner, target: target.id, duration: flight, reach: active.aim.range })
        runSteps(battle, cast, active.steps, undefined, false, undefined, flight)
      }
      cast.pending--
      finishCast(battle, cast)
    })
    return
  }
  if (berserkerArt(cast)?.motif === "furnace") {
    const hit = active.steps[0]
    const power = plainTargetDamage(hit)
    const warning: PendingTargetStrike | undefined = power && cast.target !== undefined ? {
      cast, power, step: hit, target: cast.target, range: active.aim.range, deliveryRange: active.aim.range,
      locksAt: battle.time + lead, projectile: "berserker",
    } : undefined
    cast.pending++
    later(battle, lead, () => {
      const target = unitOf(battle, cast.target)
      if (owner.hp && target && berserkerTargetInReach(battle, cast, owner)) {
        cast.berserkerLaunch = point(owner)
        cast.outside = isOutside(owner)
        const flight = furnaceFlight(edgeDistance(owner, target))
        showBerserkerBeat(battle, cast, "flight", target, { from: owner, target: target.id, duration: flight })
        runSteps(battle, cast, active.steps, undefined, false, undefined, flight)
      }
      cast.pending--
      finishCast(battle, cast)
    }, warning)
    return
  }
  runSteps(battle, cast, active.steps, undefined, false, undefined, lead)
}

// Static area hits can be forecast without simulating a cast. Movement, delivery and
// areas that follow earlier hits need their own tactics instead of a fixed lead.
export function fixedSkillWindup(active: EdgeActive, targeted = false): number | undefined {
  const aimed = active.aim.mode === "point" || active.aim.mode === "direction"
  const locked = targeted && ["enemy", "ally", "other"].includes(active.aim.mode) && active.steps[0]?.selector.units === "t"
  if (!aimed && !locked || active.deployment ||
    active.steps.some(step => step.operations.some(op => op.kind === "dash" || op.kind === "swap"))) return
  const id = active.id
  const warden = wardenChoreography(id)
  if (warden) return warden.travel ? undefined : warden.windup ?? 0
  const berserker = berserkerChoreography(id)
  if (berserker) return berserker.travel || berserker.motif === "furnace" ? undefined : berserker.windup ?? 0
  const paladin = paladinChoreography(id)
  if (paladin) return paladin.travel || paladin.delivery || paladin.swap ? undefined : paladin.windup ?? 0
  const breaker = spellbreakerChoreography(id)
  if (breaker) return breaker.travel ? undefined : breaker.windup ?? 0
  const warlock = warlockChoreography(id)
  if (warlock) return !warlock.delivery && !warlock.travel &&
    !["crossbolt", "movingash", "starcloud", "dualfrequency"].includes(warlock.motif) ? warlock.windup : undefined
  const assassin = assassinChoreography(id)
  if (assassin) return assassin.travel || assassin.delivery ? undefined : assassin.windup ?? 0
  const life = lifebringerChoreography(id)
  if (locked) {
    if (life && !life.delivery && active.steps[0].operations.some(op => op.kind === "b")) return life.windup
    return bulwarkChoreography(id)?.windup
  }
  const binder = binderChoreography(id)
  if (binder) return binder.windup - active.steps[0].delay
  if (life) return life.motif === "starbranch" ? life.windup : undefined
  if (healerChoreography(id) || dancerChoreography(id) || bardChoreography(id)) return
  if (rangerChoreography(id) && !active.steps[0].delay) return
  return bulwarkChoreography(id)?.windup ?? 0
}

export function fixedAreaFlight(active: Pick<EdgeActive, "id" | "artwork" | "steps">) {
  const first = active.steps[0]
  const motion = active.artwork.path?.motion
  return rangerChoreography(active.id) && first?.selector.shape && !first.delay && !first.watch && !first.zone &&
    !!motion && ["lob", "return", "beam", "split"].includes(motion)
}

export function predictSkillTargets(battle: EdgeBattle, owner: EdgeFighter, active: EdgeActive, aim: EdgePoint, target?: EdgeUnit,
  positions?: ReadonlyMap<Step, (unit: EdgeUnit) => EdgePoint>) {
  const cast = makeCast(0, owner, "skill", aim, target, active)
  const route = projectedSkillRoute(battle, cast)
  return active.steps.map((step) => ({
    step,
    targets: step.watch
      ? select(battle, cast, step.watch.holder, undefined, selectionArea(battle, cast, step.watch.holder))
      : select(battle, cast, step.selector, undefined, routedSkillArea(battle, cast, step, route), positions?.get(step)),
  }))
}

export function previewSkillAreas(battle: EdgeBattle, owner: EdgeUnit, active: EdgeActive, aim: EdgePoint, target?: EdgeUnit) {
  if (active.deployment) return summonPlacementAreas(active.deployment, owner, aim)
  const cast = makeCast(dancerChoreography(active.id) ? battle.runtime.sequence + 1 : 0, owner, "skill", aim, target, active)
  if (dancerArt(cast)) return dancerSkillAreas(battle, cast, active)
  if (healerArt(cast)?.motif === "net") {
    const area = stepArea(battle, cast, active.steps[0])
    return area ? [area] : []
  }
  const route = projectedSkillRoute(battle, cast)
  const binding = binderArt(cast)
  if (binding && active.steps.length) {
    const first = active.steps[0]
    const area = stepArea(battle, cast, first)
    if (binding.motif === "fixedTether" && target) return [areaOf("C", target, direction(owner, target), 96)]
    if (binding.motif === "pressurePin" && area && active.steps[1]) {
      const head = binderHead(cast, select(battle, cast, first.selector, undefined, area).map(unit => ({ id: unit.id, at: unit })))
      return head ? [area, areaOf("C", head.at, direction(owner, aim), active.steps[1].selector.size[0])] : [area]
    }
    if (binding.motif !== "sinkBasin" && area) return [area]
  }
  const life = lifeArt(cast)
  if (life) {
    const first = active.steps[0]
    const area = stepArea(battle, cast, first)
    if (area && (life.motif === "oldrings" || life.motif === "starbranch")) {
      const historical = life.motif === "oldrings"
      const [radius, , , age] = active.steps[historical ? 0 : 1].operations[0].args
      const paths = select(battle, cast, first.selector, undefined, area).map(unit => {
        const positions = battle.runtime.histories.get(unit.id)?.positions
        const center = historical ?
          positions?.findLast(sample => sample.time <= battle.time - age)?.at ?? positions?.[0]?.at ?? unit : unit
        return { kind: "circle" as const, center: point(center), radius }
      })
      return paths.length ? [area, { center: point(aim), parts: paths }] : [area]
    }
    if (life.motif === "footleaf" && target) return [areaOf("C", target, direction(owner, target), 105)]
    if (area && ["grove", "branchshot", "budblade", "lichen", "rootline", "scarward", "sharedbranch",
      "circuit", "roamingroot", "soil", "dewneedle", "reservoir"].includes(life.motif)) return [area]
  }
  const mage = warlockArt(cast)
  if (mage && ["fault", "reflectionbolt", "starcloud", "dualfrequency"].includes(mage.motif)) {
    const first = active.steps[0], area = stepArea(battle, cast, first)
    const targets = select(battle, cast, first.selector, undefined, area)
    if (!area || !targets.length) return area ? [area] : []
    if (mage.motif === "fault") return [area, { center: aim, parts: targets.map(unit => ({ kind: "circle" as const, center: point(unit), radius: 66 })) }]
    const picked = targets.sort((a, b) => (mage.motif === "reflectionbolt" ? -1 : 1) * (edgeDistance(a, aim) - edgeDistance(b, aim)))[0]
    const center = mage.motif === "reflectionbolt" ? point(picked) : mage.motif === "starcloud"
      ? along(aim, direction(aim, picked), Math.min(90, edgeDistance(aim, picked)))
      : { x: targets.reduce((sum, unit) => sum + unit.x, 0) / targets.length, y: targets.reduce((sum, unit) => sum + unit.y, 0) / targets.length }
    return [area, areaOf("C", center, direction(cast.from, aim), active.steps[1].selector.size[0])]
  }
  return active.steps.filter((step) => !step.watch).flatMap((step) => routedSkillArea(battle, cast, step, route) ?? [])
}

export function previewSkillDisplacements(battle: EdgeBattle, owner: EdgeUnit, active: EdgeActive, aim: EdgePoint, target?: EdgeUnit, at = battle.time):
  { from: EdgePoint; to: EdgePoint; path?: DancerPath; unit?: EdgeUnitId }[] {
  const cast = makeCast(dancerChoreography(active.id) ? battle.runtime.sequence + 1 : 0, owner, "skill", aim, target, active)
  cast.used.add("manual")
  const dance = dancerArt(cast)
  if (dance) {
    const moves = dancerSkillRoutes(battle, cast, active, false, at)
    if (moves.length) return moves.filter(({ route }) => route.length >= 3)
      .map(({ unit, route }) => ({ from: route.points[0], to: route.points.at(-1)!, path: route, unit: unit.id }))
  }
  const route = projectedSkillRoute(battle, cast, target)
  if (route) {
    if (warlockArt(cast)) cast.warlockRoute = route
    else if (assassinArt(cast)) cast.assassinRoute = route
    else if (spellArt(cast)) cast.spellRoute = route
    else if (paladinArt(cast)) cast.paladinRoute = route
    else if (berserkerArt(cast)) cast.berserkerRoute = route
    else cast.wardenRoute = route
    if (route.swap) cast.used.add("swapped")
  }
  let heavy = 0
  if (target?.hp && isFighter(owner) && active.aim.mode === "enemy" &&
    ragePassiveEnabled(battle, owner, "berserker/C/P1") && (owner.passiveAt["berserker/C/P1"] ?? 0) <= battle.time) {
    const passive = owner.passives.find(({ id }) => id === "berserker/C/P1")!
    const strike = { ...eventFor(cast, "strike", target), direct: true }
    if (matches(battle, passive.rule, owner, strike)) {
      heavy = passive.steps[0].operations[0].args[0]
      const gold = owner.gold
      if (gold?.id === "berserker/C/G1" && owner.pool.active[gold.active]?.id === active.id &&
        matches(battle, gold.rule, owner, { ...strike, kind: "proc", proc: passive.id })) heavy += gold.steps[0].operations[0].args[0]
    }
  }
  let addedHeavy = false
  const paths = active.steps.filter((step) => !step.watch && !step.zone).flatMap((step) => {
    const movement = step.operations.find((op) => (op.kind === "p" || op.kind === "l") && op.style !== "pct")
    if (!movement) return []
    let area = routedSkillArea(battle, cast, step, route)
    const pin = binderArt(cast)?.motif === "pressurePin" && step !== active.steps[0] && active.steps[0]
    const pointOfImpact = pin ? binderHead(cast,
      select(battle, cast, pin.selector, undefined, stepArea(battle, cast, pin)).map(unit => ({ id: unit.id, at: unit }))) : undefined
    if (pin && !pointOfImpact) return []
    if (pointOfImpact) area = areaOf("C", pointOfImpact.at, direction(owner, aim), step.selector.size[0])
    const selector = berserkerArt(cast) && step.selector.units === "k" ? { ...step.selector, units: "e" } : step.selector
    const head = ["heatline", "thunder"].includes(warlockArt(cast)?.motif ?? "") && selector.limit === 1
    const candidates = select(battle, cast, head ? { ...selector, limit: undefined } : selector, undefined, area)
    const chosen = head ? candidates.sort((a, b) => edgeDistance(a, owner) - edgeDistance(b, owner)).slice(0, 1) : candidates
    return chosen.flatMap((unit) => {
      if (unit.id === pointOfImpact?.id) return []
      const event = { ...eventFor(cast, "cast", unit), area, selector: step.selector }
      let length = movement.style === "toward" ? Math.min(movement.args[0], edgeDistance(unit, cast.aim)) : movement.args[0]
      if (movement.kind === "p") length += binderScatterBonus(battle, cast) + dancerPushBonus(battle, cast, movement.style)
      if (heavy && movement.kind === "p" && unit === target && !addedHeavy) {
        length += heavy
        addedHeavy = true
      }
      const shove = movement.kind === "p" ? binderShoveRules(battle, event, unit, pushVector(battle, cast, unit, movement.style, event), length) : undefined
      const end = shove ? shoveEnd(battle, unit, shove.axis, shove.push)
        : pullLanding(battle, cast, unit, movement.args[0], movement.args[1] ?? 0, movement.style, event)
      return edgeDistance(unit, end) >= 3 ? [{ from: point(unit), to: end }] : []
    })
  })
  if (heavy && target && !addedHeavy) {
    const end = shoveEnd(battle, target, direction(owner, target), heavy)
    if (edgeDistance(target, end) >= 3) paths.push({ from: point(target), to: end })
  }
  if (route && edgeDistance(route.from, route.to) >= 3) {
    paths.unshift({ from: route.from, to: route.to })
    if (route.swap) paths.unshift({ from: route.to, to: route.from })
  }
  return paths
}
export function skillCastProblem(battle: EdgeBattle, unit: EdgeUnit, active: EdgeActive, at: EdgePoint, target?: EdgeUnit, time = battle.time) {
  const { mode, range, insideOnly } = active.aim
  if (mode === "enemy" || mode === "outside") {
    if (!target?.hp || friendly(battle, unit.id, target.id) || activeBuffs(battle, target.id, "phase", time).length) return "选择敌人"
  }
  if (mode === "ally" || mode === "other") {
    if (!target?.hp || !friendly(battle, unit.id, target.id) || mode === "other" && unit === target) return "选择队友"
  }
  if (active.id === "bulwark/Radiant/A5" && target && !isOutside(target)) return "选择界外队友"
  if (active.id === "bard/Prismatic/A5" && target && !isOutside(target)) return "选择界外友卡"
  if (insideOnly && isOutside(at)) return "选择场内落点"
  if (target && (isOutside(unit) || isOutside(target)) && active.steps.some((step) => step.operations.some((op) => op.kind === "swap"))) {
    return "只能交换场内卡牌"
  }
  if (wardenChoreography(active.id)?.travel && (isOutside(unit) || target && isOutside(target))) return "选择场内卡牌"
  const holy = paladinChoreography(active.id)
  if (holy?.travel && (isOutside(unit) || holy.motif === "approach" && target && isOutside(target))) return "选择场内卡牌"
  if (holy?.motif === "horizon" && edgeDistance(unit, at) < 3) return "选择另一个落点"
  if (spellbreakerChoreography(active.id)?.travel && isOutside(unit)) return "选择场内卡牌"
  const dance = dancerChoreography(active.id)?.motif
  if (dance) {
    if (["halfTurn", "threadCut", "wakeFan", "doubleJump", "pairedRibbon", "goldRailPair"].includes(dance) && isOutside(unit)) return "选择场内卡牌"
    if (["leadSide", "pairedRibbon", "goldRailPair", "reboundAnchor", "hopNote", "reversePrint", "retreatFlash"].includes(dance) &&
      (!target || isOutside(target))) return "选择场内友卡"
    if (["leadSide", "pairedRibbon", "goldRailPair", "reversePrint"].includes(dance) && target?.force) return "目标正在被位移"
    if (["halfTurn", "threadCut", "wakeFan", "doubleJump", "finaleSlider", "foldSlider"].includes(dance) &&
      edgeDistance(inside(unit, 0), at) < 7) return "选择另一个落点"
  }
  const rage = berserkerChoreography(active.id)
  if (rage?.travel && rage.motif !== "trinity" && isOutside(unit)) return "选择场内卡牌"
  if (rage?.line && edgeDistance(unit, inside(at)) < 3) return "选择另一个落点"
  if (rage?.motif === "laststand" && unit.once.has(active.id + ":defy")) return "本场已用过"
  if (mode !== "self" && mode !== "direction" && !(mode === "outside" && target && isOutside(target)) && edgeDistance(unit, at) > range) return "超出射程"
  const cost = active.steps.flatMap((step) => step.operations).find((op) => op.kind === "cost" && op.style !== "current")
  if (cost && hpPct(unit) <= cost.args[0]) return "生命不足"
  return null
}

function tickField(battle: EdgeBattle, field: FieldEffect, dt: number) {
  const owner = unitOf(battle, field.cast.owner)
  if (!owner) return
  const { step, cast, mode } = field
  if (mode === "bardentry" && bardArt(cast)) {
    tickBardEntry(battle, field)
    return
  }
  if (mode.startsWith("dance") && (dancerArt(cast) || dancerTraitArt(cast.signature?.id))) {
    if (mode === "dancestill") tickDancerStill(battle, field)
    return
  }
  const binding = !field.derived && binderArt(cast)
  if (binding && (mode === "leave" || mode === "shove")) return
  if (binding && mode === "hold" && binding.motif === "windExchange" && step.selector.units === "e" &&
    !cast.used.has("binderWind") && binderTraitReady(battle, owner, "binder/Radiant/P5")) {
    const nearest = alliesOf(battle, owner.id).filter(unit => unit.hp && !isOutside(unit) && areaHits(field.area, unit))
      .sort((a, b) => edgeDistance(a, field.area.center) - edgeDistance(b, field.area.center))[0]
    if (nearest && nodes(battle).some(unit => unit.hp && !friendly(battle, owner.id, unit.id) && areaHits(field.area, unit))) {
      cast.used.add("binderWind")
      emit(battle, { ...eventFor(cast, "assist", nearest), style: "binderWind", area: field.area, from: field.area.center })
    }
  }
  if (!owner.hp && (mode === "cover" || bulwarkArt(cast)?.motif === "phalanx")) { field.until = battle.time; return }
  if (mode === "decoy" || mode === "track" || mode === "reservoir" || mode === "cross" || mode === "anchor") return
  const previous = field.area.center
  const operations = step.operations
  const track = operations.find((op) => op.kind === "seek" || op.kind === "orbit")
  if (mode === "closing") {
    const duration = field.until - field.time
    const remaining = Math.max(0, (field.until - battle.time) / duration)
    field.area = closingFieldArea(cast, step, remaining)
  } else if (track && step.selector.shape) {
    let center = field.area.center
    if (track.kind === "seek") {
      const target = unitOf(battle, cast.target)
      if (!target?.hp) { field.until = battle.time; return }
      center = along(center, direction(center, target), Math.min(edgeDistance(center, target), track.args[0] * dt))
    } else {
      const distance = track.args[0]
      const loop = track.args[1]
      const age = battle.time - field.time
      const r = age <= loop ? distance : Math.max(0, distance * (1 - (age - loop) / (track.args[2] || 0.35)))
      center = along(cast.aim, rotate(direction(cast.aim, cast.from), Math.min(age / loop, 1) * 360), r)
    }
    field.area = areaOf(step.selector.shape, center, direction(cast.from, center), ...step.selector.size as [number, number?, number?])
  } else if ((step.selector.anchor === "s" || step.selector.anchor === "t") && paladinArt(cast)?.motif !== "banner") {
    field.area = selectionArea(battle, cast, step.selector, field.event) ?? field.area
  }
  const candidates = select(battle, cast, step.selector, field.event, field.area)
  if (mode === "hold" || mode === "guard" || mode === "wall" || mode === "cover") return
  const periodic = mode === "tick"
  if (periodic && battle.time < field.next) return
  if (periodic) field.next = battle.time + (step.zone?.period || 1)
  const entries = mode === "leave"
    ? [...field.previous].flatMap((id) => candidates.some((unit) => unit.id === id) ? [] : unitOf(battle, id) ?? [])
    : candidates
  field.previous = new Set(candidates.map((unit) => unit.id))
  const once = ["first", "seek", "decoy"].includes(mode)
  const outerFlag = cast.signature?.id === "paladin/L/G1"
  if (outerFlag && field.seen.size) return
  if (!periodic && !once && !["enter", "leave", "orbit", "closing"].includes(mode)) return
  const targets = entries.filter((target) => periodic || !field.seen.has(target.id)).slice(0, once ? 1 : undefined)
  if (!targets.length) return
  if (!field.derived && healerArt(cast)?.motif === "aidStation") {
    const ward = cast.skill!.steps[1]
    const low = cast.used.has("aidStationShield") ? undefined : select(battle, cast, ward.selector, undefined, field.area)
      .filter(unit => targets.includes(unit)).sort((a, b) => hpPct(a) - hpPct(b))[0]
    for (const target of targets) field.seen.add(target.id)
    const arriving = { ...eventFor(cast, "hit", targets[0]), style: "zone", zone: true, from: field.area.center }
    showHealerBeat(battle, cast, "release", field.area.center, {
      area: field.area, contacts: targets, kind: "enter", amount: targets.length,
    })
    applyStep(battle, cast, step, arriving, false, field.area, targets)
    if (low?.hp) {
      cast.used.add("aidStationShield")
      applyStep(battle, cast, ward, arriving, false, field.area, [low])
    }
    return
  }
  const holy = !field.derived && paladinArt(cast)
  if (!holy && !spellArt(cast) && !assassinArt(cast) && !warlockArt(cast) && !lifeArt(cast) && !binding &&
    !assassinTraitArt(cast.signature?.id) && !warlockTraitArt(cast.signature?.id) && !paladinTraitArt(cast.signature?.id) &&
    !lifebringerTraitArt(cast.signature?.id) && (field.derived || !(bulwarkArt(cast) || wardenArt(cast)))) showImpact(battle, cast, step, field.area)
  for (const target of targets) field.seen.add(target.id)
  const style = ["seek", "orbit", "decoy"].includes(mode) ? "summon" : "zone"
  const forestExit = lifeArt(cast)?.motif === "forestexit"
  if ((holy || forestExit) && (mode === "enter" || mode === "leave")) {
    for (const target of targets) {
      const positions = battle.runtime.histories.get(target.id)?.positions
      const last = forestExit ? positions?.findLast(sample => areaHits(field.area, sample.at))?.at ?? field.area.center
        : positions?.at(-1)?.at
      const crossed = last && !!areaHits(field.area, last) !== !!areaHits(field.area, target)
      const intercept = crossed ? mode === "leave" ? firstCrossing(field.area, target, last, forestExit ? 1 : 15)
        : firstCrossing(field.area, last, target) : undefined
      applyStep(battle, cast, step, { ...eventFor(cast, "hit", target, field.event), style, zone: true, intercept },
        false, field.area, [target], field.gold)
    }
  } else applyStep(battle, cast, step, { ...eventFor(cast, "hit", targets[0], field.event), style, zone: style === "zone", axis: direction(previous, field.area.center) }, field.derived, field.area, targets, field.gold)
  if (outerFlag) field.until = Math.min(field.until, battle.time + .32)
  if (once) field.until = battle.time
}

export function stopAtWardenGate(battle: EdgeBattle, unit: EdgeUnit, next: EdgePoint) {
  const entry = battle.runtime.fields.flatMap((field) => {
    if (field.mode !== "cross" || field.until <= battle.time || friendly(battle, field.cast.owner, unit.id) ||
      field.seen.has(unit.id) || areaHits(field.area, unit)) return []
    const contact = firstCrossing(field.area, unit, next)
    return contact ? [{ field, contact, distance: edgeDistance(unit, contact) }] : []
  }).sort((a, b) => a.distance - b.distance)[0]
  if (!entry) return false
  const { field, contact } = entry
  const from = point(unit)
  field.seen.add(unit.id)
  positionUnit(battle, unit, contact)
  applyStep(battle, field.cast, field.step, {
    ...eventFor(field.cast, "move", unit), from, intercept: contact, axis: direction(from, next), zone: true, style: "zone",
  }, field.derived, field.area, [unit], field.gold)
  unit.move = null
  history(battle, unit).danceStep = undefined
  return true
}

function runSummonAction(battle: EdgeBattle, group: SummonGroup, body: SummonBody, index: number, trigger?: SkillEvent) {
  const { kind, cast } = group.deployment
  const action = SUMMON_PLANS[kind].actions?.[index]
  const owner = unitOf(battle, group.owner)
  const active = cast.skill
  if (battle.phase !== "running" || !action || !owner || !isFighter(owner) || !active || body.actionsAt[index] > battle.time ||
    (action.slot !== undefined && action.slot !== body.slot) || action.phase && action.phase !== body.phase) return
  if (action.reaction) {
    if (!trigger) return
    const { who, reach, on } = action.reaction
    const subject = unitOf(battle, who === "foe" || who === "basic" ? trigger.source : trigger.target)
    if (!subject || edgeDistance(body, subject) > reach) return
    if (who === "foe" ? friendly(battle, group.owner, subject.id)
      : who === "ally" ? !isFighter(subject) || !friendly(battle, group.owner, subject.id)
        : subject.id !== group.target || who === "basic" && trigger.cast.order !== "basic") return
    if (on === "charge" && !battle.telegraph) return
  }
  const area = summonActionArea(battle, group, body, action)
  if (action.at === "link" && !area) return
  const from = point(body)
  const aim = area && edgeDistance(from, area.center) > 1 ? area.center : along(from, body.facing, 1)
  const selectionCast = { ...cast, from, aim }
  const targets = select(battle, selectionCast, action.step.selector, trigger, area)
    .filter((target) => action.reach === undefined || edgeDistance(from, target) <= action.reach)
  if (!targets.length) return
  body.actionsAt[index] = battle.time + action.cooldown
  body.pulseAt = battle.time
  const stage = ++cast.stage
  const axis = point(body.facing)
  const settle = (chosen: EdgeUnit[]) => {
    const local = { ...cast, from, aim, outside: isOutside(from), stage, summonBody: body.id }
    const base = { ...eventFor(local, "cast", chosen[0], trigger), from, axis, summon: body.id, style: "summon" }
    const contacts = chosen.map(point)
    const other = action.at === "link" ? group.deployment.bodies[1] : action.at === "ownerLine" ? owner
      : trigger?.kind === "charge" ? battle.telegraph?.to : trigger?.kind === "strike" ? trigger.cast.from : trigger?.from
    const remote = other && point(other)
    const step = action.shot ? { ...action.step, selector: { ...action.step.selector, shape: undefined } } : action.step
    applyStep(battle, local, step, trigger?.kind === "strike" ? trigger : base, false, action.shot ? undefined : area, chosen)
    const play = () => showSummonBeat(battle, group, body, "act", {
      from, to: contacts[0], other: remote, area: action.shot ? undefined : area, contacts, beat: index + 1,
      outcome: stepOutcome(step),
      landings: chosen.map((target) => target.force?.cause?.id === (trigger?.kind === "strike" ? trigger.cast.id : cast.id)
        ? point(target.force.end) : undefined),
    })
    const assist = () => emit(battle, { ...eventFor(local, "assist", chosen[0], base), style: kind })
    if (trigger?.kind === "strike") {
      later(battle, .01, () => {
        if (!chosen.some((target) => target.force?.cause?.id === trigger.cast.id)) return
        play()
        assist()
      })
    } else play()
    cast.damage = local.damage
    cast.heals = local.heals
    cast.protection ??= local.protection
    if (trigger?.kind !== "strike") assist()
  }
  if (action.shot) {
    const target = targets[0]
    const delay = flightTime(body, target)
    showSummonBeat(battle, group, body, "shot", { from, to: target, target: target.id, duration: delay })
    later(battle, delay, () => { if (target.hp) settle([target]) })
  } else settle(targets)
}

function tickDeployments(battle: EdgeBattle, dt: number) {
  for (const { group, deployment, plan } of activeDeployments(battle)) {
    for (const body of deployment.bodies) {
      if (!body.hp) continue
      moveSummonBody(battle, group, body, dt)
      for (const [i, action] of (plan.actions ?? []).entries()) {
        if (!action.reaction) runSummonAction(battle, group, body, i)
      }
    }
  }
}

function reactSummons(battle: EdgeBattle, event: SkillEvent) {
  if (event.summon || !["move", "hit", "strike", "charge", "return"].includes(event.kind)) return
  for (const { group, deployment, plan } of activeDeployments(battle)) {
    for (const [i, action] of (plan.actions ?? []).entries()) {
      if (action.reaction?.on !== event.kind) continue
      for (const body of deployment.bodies) if (body.hp) runSummonAction(battle, group, body, i, event)
    }
  }
}

function coveringSummon(battle: EdgeBattle, source: EdgeUnit, target: EdgeUnit, order: SkillCast["order"],
  at: EdgePoint = target, time = battle.time, spent?: ReadonlyMap<EdgeUnitId, number>, forecast?: LinkedGuardForecast) {
  if (!isFighter(target) || friendly(battle, source.id, target.id)) return
  const active = activeDeployments(battle)
  if (forecast?.added) {
    const { added } = forecast
    active.push({ group: added, deployment: added.deployment, plan: SUMMON_PLANS[added.deployment.kind] })
  }
  const candidates = active.flatMap(({ group, deployment, plan }) => {
    const guard = plan.guard
    if (!guard || group === forecast?.removed || !friendly(battle, group.owner, target.id) || group.until - SUMMON_DISMISS_TIME <= time ||
      Math.max(deployment.bodies[0].actionAt, spent?.get(deployment.bodies[0].id) ?? 0) > time || guard.basicOnly && order !== "basic") return []
    if (guard.type === "linked" && group.target !== target.id) return []
    let intercept: EdgePoint | undefined
    if (guard.type === "line") {
      const link = summonLink(deployment.bodies, guard.reach * 2)
      if (!link) return []
      intercept = firstCrossing(link, source, at)
      if (!intercept) return []
    }
    return deployment.bodies.flatMap((body) => {
      const projected = forecast?.bodies.get(body.id)
      if (!body.hp || projected && projected.hp <= 0) return []
      const place = projected?.at ?? body
      const gap = edgeDistance(place, at)
      if (guard.type === "linked" && gap > guard.reach ||
        guard.type === "dome" && (body.phase !== "landed" || gap > guard.reach || edgeDistance(body, source) <= guard.reach)) return []
      const contact = guard.type === "dome"
        ? firstCrossing(areaOf("C", body, body.facing, guard.reach), source, at) : intercept
      return [{ group, body, guard, intercept: contact, at: place, hp: projected?.hp ?? body.hp }]
    })
  })
  return candidates.sort((a, b) => edgeDistance(source, a.at) - edgeDistance(source, b.at))[0]
}

export function stopAtSummonTerrain(battle: EdgeBattle, actor: EdgeUnit, next: EdgePoint) {
  if ((!battle.sparring && actor !== battle.boss) || isOutside(actor)) return
  const block = summonTerrainInPath(battle, actor, next)
  if (!block) return
  const { cast, kind } = block.group.deployment
  block.body.pulseAt = battle.time
  showSummonBeat(battle, block.group, block.body, "stop", { to: block.at, contacts: [block.at], outcome: "control" })
  if (block.cooldown) block.body.actionAt = battle.time + block.cooldown
  if (block.cooldown || !cast.used.has("terrain")) {
    cast.used.add("terrain")
    emit(battle, { ...eventFor(cast, "assist", actor), from: point(block.body), at: block.at, summon: block.body.id, style: kind })
  }
  return block.at
}

export function takePortal(battle: EdgeBattle, actor: EdgeUnit) {
  if (!isFighter(actor) || !actor.hp) return
  const route = portalRoute(battle, actor, actor.id)
  if (!route) return
  const { group, entry, other, out, cooldown } = route
  const deployment = group.deployment
  deployment.bodies[0].actionAt = battle.time + cooldown
  positionUnit(battle, actor, out, deployment.cast)
  entry.pulseAt = other.pulseAt = battle.time
  emit(battle, { ...eventFor(deployment.cast, "assist", actor), from: point(entry), landing: out, summon: entry.id, style: "portal" })
  showSummonBeat(battle, group, entry, "warp", { to: out, other, contacts: [out], duration: .55 })
}

export function tickSkills(battle: EdgeBattle, dt: number) {
  if (battle.runtime.pendingLifeHeals.length) battle.runtime.pendingLifeHeals = battle.runtime.pendingLifeHeals.filter(pulse =>
    pulse.remaining > 0 && pulse.until > battle.time && !!unitOf(battle, pulse.target)?.hp)
  const runtime = battle.runtime
  for (const id of runtime.shieldCasts.keys()) {
    const unit = unitOf(battle, id)
    if (unit?.hp && shielded(battle, unit)) continue
    if (unit) unit.shield = 0
    runtime.shieldCasts.delete(id)
  }
  const ready = runtime.pending.filter((job) => job.due <= battle.time).sort((a, b) => a.due - b.due || a.order - b.order)
  runtime.pending = runtime.pending.filter((job) => job.due > battle.time)
  for (const job of ready) if (battle.phase === "running") job.run()
  for (const watch of [...runtime.watches]) {
    if (watch.until <= battle.time && watch.uses > 0 && watch.rule.event === "expire") {
      watch.uses = 0
      applyStep(battle, watch.cast, watch.step, eventFor(watch.cast, "expire", unitOf(battle, watch.target), watch.event), watch.derived, undefined, undefined, watch.gold)
    }
  }
  runtime.watches = runtime.watches.filter((watch) => watch.until > battle.time && watch.uses > 0)
  runtime.buffs = runtime.buffs.filter((buff) => {
    if (buff.until <= battle.time) return false
    if (buff.style !== "ownabsorb" && buff.style !== "spellshield") return true
    const wearer = unitOf(battle, buff.target)
    return !!wearer?.hp && shielded(battle, wearer) && runtime.shieldCasts.get(wearer.id) === buff.cast
  })
  runtime.visuals = runtime.visuals.filter((area) => area.until > battle.time)
  runtime.notices = runtime.notices.filter((item) => item.until > battle.time)
  for (const field of [...runtime.fields]) if (field.until > battle.time && battle.phase === "running") tickField(battle, field, dt)
  for (const field of runtime.fields.filter((f) => f.mode === "reservoir" && f.until <= battle.time)) releaseReservoir(battle, field)
  if (battle.phase === "running") tickDeployments(battle, dt)
  tickSummons(battle, (cast) => finishCast(battle, cast))
  runtime.fields = runtime.fields.filter((field) => field.until > battle.time)
  for (const unit of nodes(battle)) {
    const track = history(battle, unit)
    if (!recent(battle, track.positions.at(-1)?.time ?? -Infinity, 0.1)) {
      track.positions = track.positions.filter((record) => recent(battle, record.time, 3))
      track.positions.push({ time: battle.time, at: point(unit) })
      track.wounds = track.wounds.filter((record) => recent(battle, record.time, 4))
    }
  }
}

export function binderWalkCrossing(battle: EdgeBattle, unit: EdgeUnit, before: EdgePoint) {
  if (!unit.hp) return
  for (const field of battle.runtime.fields) {
    const binding = binderArt(field.cast)
    if (!binding || field.mode !== "leave" || field.until <= battle.time || field.seen.has(unit.id) ||
      friendly(battle, field.cast.owner, unit.id) || !areaHits(field.area, before) || areaHits(field.area, unit)) continue
    field.seen.add(unit.id)
    const contact = firstCrossing(field.area, unit, before, 1) ?? point(before)
    const event = { ...eventFor(field.cast, "alter", unit), intercept: contact, from: contact, zone: true, style: "bindercross", area: field.area }
    applyStep(battle, field.cast, field.step, event, false, field.area, [unit])
    emit(battle, { ...event, at: contact, style: "zone" })
  }
}

export function releaseBinderTether(battle: EdgeBattle, unit: EdgeUnit, requested: EdgePoint) {
  const tether = activeBuffs(battle, unit.id, "tether")[0]
  if (!tether || !unit.hp) return
  remove(battle, tether)
  recordBinderControl(battle, tether.cast, unit)
  const landing = point(unit)
  showBinderBeat(battle, tether.cast, "release", landing, {
    from: tether.cast.aim, other: requested, target: unit.id, kind: "tether",
  })
  emit(battle, { ...eventFor(tether.cast, "alter", unit), style: "tether", landing })
}

export function startMovement(battle: EdgeBattle, unit: EdgeUnit, landing: EdgePoint, returning: boolean, requested: EdgePoint = landing) {
  const anchor = !returning && battle.runtime.fields.find((field) => field.mode === "anchor" && field.until > battle.time &&
    !friendly(battle, field.cast.owner, unit.id) && areaHits(field.area, unit) && !areaHits(field.area, landing))
  if (anchor) {
    const reduction = anchor.step.operations.find(({ kind }) => kind === "short")?.args[0] ?? 55
    const wanted = point(landing)
    landing = along(unit, direction(unit, landing), Math.max(0, edgeDistance(unit, landing) - reduction))
    anchor.until = battle.time
    unit.move = null
    showDefenderTrait(battle, anchor.cast, "consume", unit, {
      ...eventFor(anchor.cast, "startMove", unit), at: wanted, from: point(unit), landing,
    }, { from: unit, to: landing, area: anchor.area })
    if (edgeDistance(unit, landing) < 3) return true
  }
  const cast = newCast(battle, unit, "enemy", landing)
  const track = history(battle, unit)
  track.from = point(unit)
  track.moveReturning = returning
  track.binderFold = undefined
  track.danceStep = undefined
  track.shadowWarnings = !returning ? [
    ...nodes(battle).flatMap((enemy) => {
      const charge = chargeOf(battle, enemy)
      if (!enemy.hp || friendly(battle, unit.id, enemy.id) || !charge) return []
      const area = areaOf("L", charge.from, charge.direction, edgeDistance(charge.from, charge.to), CHARGE.halfWidth * 2)
      return areaHits(area, unit) ? [{ area, until: charge.until, source: enemy.id }] : []
    }),
    ...battle.runtime.visuals.filter((v) => v.phase === "warning" && v.until > battle.time && !friendly(battle, v.owner, unit.id) && areaHits(v.area, unit))
      .map((v) => ({ area: v.area, until: v.until, visual: v.id })),
  ] : []
  track.standAt = battle.time
  if (!returning) {
    const shortened = stepLimit(battle, unit, MOVE_REACH)
    const destination = inside(requested)
    const slider = glideField(battle, unit, destination)
    const glide = slider?.danceRail && dancerRailContains(slider.danceRail, landing) &&
      slider.step.operations.find(op => op.kind === "glide")
    const danceHop = dancerHop(battle, unit)
    const gravity = gravityStepLimit(battle, unit, destination)
    const uncut = gravity || shortened && binderArt(shortened.cast) ? along(unit, direction(unit, destination),
      Math.min(edgeDistance(unit, destination), movementAllowance(battle, unit, MOVE_REACH, destination, true))) : undefined
    const extended = !glide && !danceHop ? spendBuff(battle, unit, "extend", landing, unit) : undefined
    if (extended && dancerArt(extended.cast)) {
      track.danceStep = { cast: extended.cast, end: point(landing) }
      showDancerBeat(battle, extended.cast, "travel", landing, {
        from: unit, target: unit.id, kind: "walk", duration: edgeDistance(unit, landing) / Math.max(35, movementSpeed(battle, unit)) + .18,
        paths: [{ unit: unit.id, route: dancerPath([unit, landing]) }],
      })
    } else if (extended && edgeDistance(unit, landing) > 190) {
      emit(battle, { ...eventFor(extended.cast, "assist", unit), style: "extend", landing, distance: edgeDistance(unit, landing) })
    }
    if (shortened) {
      remove(battle, shortened)
      consumeTrait(battle, shortened.cast, unit, landing, unit)
      if (uncut && edgeDistance(uncut, landing) >= 3) showBinderBeat(battle, shortened.cast, "release", landing, {
        from: unit, other: uncut, target: unit.id, kind: "short",
      })
      if (!uncut || edgeDistance(uncut, landing) >= 3) {
        if (binderArt(shortened.cast)) recordBinderControl(battle, shortened.cast, unit)
        emit(battle, { ...eventFor(shortened.cast, "alter", unit), style: "short", landing, from: point(unit) })
      }
    }
    if (gravity) {
      remove(battle, gravity)
      if (uncut && edgeDistance(uncut, landing) >= 3) {
        recordBinderControl(battle, gravity.cast, unit)
        showDefenderTrait(battle, gravity.cast, "consume", unit, {
          ...eventFor(gravity.cast, "startMove", unit), at: uncut, landing,
        }, { from: unit, to: landing, landings: [landing], target: unit.id })
      }
    }
    if (slider && glide && dancerCanShift(unit)) {
      slider.seen.add(unit.id)
      const duration = glide.args[1] ?? .55
      addBuff(battle, slider.cast, unit, "res", duration, [glide.args[2] ?? 40], "danceglide")
      launchDancerPaths(battle, slider.cast, [{ unit, route: dancerPath([unit, landing]) }], duration, "glide", (target, event, motion) => {
        if (!motion) return
        emit(battle, { ...eventFor(slider.cast, "assist", target, event), style: "glide" })
        slider.cast.used.add("danceFirstGlide")
        finishMovement(battle, target)
      })
      return true
    }
    const hop = spendBuff(battle, unit, "hop")
    if (hop) {
      const { cast: original, values } = hop
      if (dancerArt(original)?.motif === "hopNote" && dancerCanShift(unit)) {
        const [,,, damage, radius, push, ward] = values
        const step: Step = { delay: 0, selector: parseSelector("eC" + radius + "@l"), operations: [
          { kind: "d", args: [damage], style: "hop" }, { kind: "p", args: [push], style: "circle" },
        ] }
        launchDancerPaths(battle, original, [{ unit, route: dancerPath([unit, landing]) }], values[2], "hop", (target, event, motion) => {
          if (!motion) return
          if (ward) shield(battle, original, target, target.maxHp * ratio(ward), 10, event)
          const area = stepArea(battle, original, step, event)!
          dancerHit(battle, original, step, area, event, "hop")
          if ((original.trace.size && [...original.trace.values()].some(trace => (trace.effectiveHits ?? 0) > 0)) && battle.finishedAt === null)
            emit(battle, { ...eventFor(original, "assist", target, event), style: "hop" })
        })
        return true
      }
      const motion = forceTo(battle, unit, landing, values[2] ?? 0.25, false, original)
      later(battle, values[2] ?? 0.25, () => {
        if (!unit.hp || !motion?.completed || unit.force || edgeDistance(unit, motion.end) >= 3) return
        const [,,, damage = 0.95, radius = 90, push = 60] = values
        const follow = { ...original, aim: point(unit) }
        applyStep(battle, follow, { delay: 0, selector: parseSelector("eC" + radius), operations: [
          { kind: "d", args: [damage], style: "hop" }, { kind: "p", args: [push], style: "" },
        ] })
        emit(battle, { ...eventFor(original, "assist", unit), style: "hop", landing: point(unit) })
      })
      return true
    }
  }
  emit(battle, { ...eventFor(cast, "startMove", unit), landing, distance: edgeDistance(unit, landing), style: returning ? "return" : "" })
  if (anchor) unit.move = landing
  return !!anchor
}

function danceWalkRecovery(cast: SkillCast) {
  return dancerArt(cast) ? cast.skill?.steps[0].operations.find(op => op.kind === "extend")?.args[2] ?? 0 : 0
}

export function moveRecovery(battle: EdgeBattle, unit: EdgeUnit, end?: EdgePoint, arrival = battle.time) {
  if (isOutside(unit) || end && dancerMovesBySkill(battle, unit, end)) return 0
  const mark = activeBuffs(battle, unit.id, "extend").sort((a, b) => b.values[0] - a.values[0])[0]
  if (!mark) return 0
  const recovery = danceWalkRecovery(mark.cast)
  if (!recovery) return 0
  const owner = unitOf(battle, mark.cast.owner) ?? unit
  const factors = healFactors(battle, owner, unit, false, arrival)
  return Math.round(unit.maxHp * ratio(recovery) * (1 + ratio(factors.received)) *
    (1 + ratio(factors.healingAmp)) * factors.recovery)
}

export function finishMovement(battle: EdgeBattle, unit: EdgeUnit, reached = false) {
  const track = history(battle, unit)
  track.movedAt = battle.time
  if (!track.moveReturning && edgeDistance(track.from, unit) >= 3) track.walkedAt = battle.time
  track.standAt = battle.time
  const cast = newCast(battle, unit, "enemy", unit)
  const fold = track.binderFold
  track.binderFold = undefined
  if (fold && unit.hp && !track.moveReturning && edgeDistance(unit, fold.end) < 1.5 && borderGap(unit) <= 90) {
    const owner = unitOf(battle, fold.cast.owner)
    const gold = owner && isFighter(owner) ? owner.pool.gold.find(pair => pair.id === "binder/E/G1") : undefined
    if (gold) {
      const at = point(unit)
      applyStep(battle, fold.cast, gold.steps[0], { ...eventFor(fold.cast, "move", unit), at, landing: at },
        true, undefined, undefined, gold.name)
    }
  }
  const escapedWarning = !track.moveReturning && (track.shadowWarnings ?? []).some((warning) => {
    const source = warning.source !== undefined && unitOf(battle, warning.source)
    const live = source ? chargeOf(battle, source)?.until === warning.until
      : battle.runtime.visuals.some((v) => v.id === warning.visual && v.until > battle.time)
    return live && warning.until > battle.time && !areaHits(warning.area, unit)
  })
  track.shadowWarnings = []
  const distance = edgeDistance(track.from, unit)
  const danceWalk = reached && !track.moveReturning && distance >= 3
  const event = { ...eventFor(cast, "move", unit), from: track.from, landing: point(unit), distance,
    style: track.moveReturning ? "return" : "", escapedWarning, danceWalk }
  const step = track.danceStep
  track.danceStep = undefined
  if (danceWalk && isFighter(unit)) {
    if (step && edgeDistance(unit, step.end) < 1.5) {
      showDancerBeat(battle, step.cast, "land", unit, { from: track.from, target: unit.id, kind: "walk", amount: distance,
        paths: [{ unit: unit.id, route: dancerPath([track.from, unit]) }],
      })
      if (distance > MOVE_REACH) emit(battle, { ...eventFor(step.cast, "assist", unit, event), style: "extend" })
      const recovery = danceWalkRecovery(step.cast)
      if (recovery) heal(battle, step.cast, unit, unit.maxHp * ratio(recovery), "dancewalk", event)
    }
    const speeds = activeBuffs(battle, unit.id, "speed")
    const appliedSpeed = speeds.length ? modifier(battle, unit, "speed") : 0
    const provider = speeds.find(buff => buff.values[0] === appliedSpeed)
    for (const buff of speeds) {
      const motif = dancerArt(buff.cast)?.motif
      if (motif) showDancerBeat(battle, buff.cast, "land", unit, { from: track.from, target: unit.id, kind: "speed" })
      if (buff === provider && (motif === "leadRibbon" || motif === "footCradle"))
        emit(battle, { ...eventFor(buff.cast, "assist", unit, event), style: "danceLead" })
    }
  }
  emit(battle, event)
  if (danceWalk && isFighter(unit)) dancerWalkFinish(battle, unit, event)
}

function launchBasicShot(battle: EdgeBattle, actor: EdgeFighter, target: EdgeUnit, land: () => void, cast?: SkillCast) {
  const job = actor.combatVersion === "four-v2" ? ["ranger", "bard", "warlock", "healer", "binder", "lifebringer", "dancer"].find(role => combatHasRole(actor, role)) ?? actor.card.subjob.id : actor.card.subjob.id
  const glyph: Glyph = job === "ranger" ? "arrow" : job === "bard" ? "note" : job === "warlock" ? "fire"
    : job === "healer" ? "cross" : job === "binder" ? "chain" : job === "lifebringer" ? "seed" : job === "dancer" ? "ribbon" : "orb"
  const from = point(actor)
  const delay = flightTime(actor, target)
  cue(battle, "shot", actor, target)
  showSkillVisual(battle, actor, "Q/" + job, {
    phase: "travel", mark: { motion: "shot", glyph }, from, to: target, target: target.id,
    start: battle.time, end: battle.time + delay,
  })
  later(battle, delay, () => {
    if (!target.hp) return
    showSkillVisual(battle, actor, "Q/" + job, {
      phase: "impact", mark: { motion: "snap", glyph }, from, to: target,
      start: battle.time, end: battle.time + 0.35,
    })
    land()
  }, cast && { cast, power: 1, target: target.id })
}

export function markWardenOrder(battle: EdgeBattle, actor: EdgeFighter, cast: SkillCast) {
  const id = "warden/L/P7"
  if (!actor.passives.some((passive) => passive.id === id) ||
    battle.preview && (battle.preview.loadoutFor !== actor.id || battle.preview.passiveOnly && battle.preview.passiveOnly !== id)) return
  cast.used.add("wardenManual")
  if (!cast.outside && history(battle, actor).wardenInside) cast.used.add("wardenChain")
}

export function basicAttack(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit, enemy = false, provoked = false, manual = false) {
  if (!actor.hp || !target.hp || battle.finishedAt !== null) return
  const cast = newCast(battle, actor, "basic", target, target)
  if (manual && isFighter(actor)) {
    cast.used.add("manual")
    markWardenOrder(battle, actor, cast)
    bardArmRange(battle, cast, actor, target)
  }
  if (provoked) cast.used.add("provoked")
  const upgraded = spendBuff(battle, actor, "choose")
  if (upgraded) {
    const [length, , angle = 90, damage = 1.76, push = 90] = upgraded.values
    const step = { delay: 0, selector: parseSelector("eF" + length + "," + angle), operations: [
      { kind: "d", args: [damage], style: "" }, { kind: "p", args: [push], style: "" },
    ] }
    const boil = berserkerArt(upgraded.cast)?.motif === "boil"
    const lead = boil ? .14 : 0
    if (boil) {
      cast.berserkerFollow = upgraded.cast.skill
      cast.berserkerFollowCast = upgraded.cast
      const area = stepArea(battle, cast, step)
      showBerserkerBeat(battle, cast, "prepare", target, { area, duration: lead, beat: 2, kind: "boost" })
    }
    runSteps(battle, cast, [step], undefined, false, undefined, lead)
    return
  }
  const land = () => {
    damageUnit(battle, cast, target, cast.basis, undefined, false, enemy ? "enemy" : "")
    if (!isSummonId(target.id)) shoveUnit(battle, cast, target, BASIC_PUSH, "", undefined, false, undefined, 0.14)
    finishCast(battle, cast)
  }
  if (isFighter(actor) && actor.range >= 200) {
    launchBasicShot(battle, actor, target, land, cast)
    return
  }
  cue(battle, "melee", actor, target)
  land()
}

export const targetable = (battle: EdgeBattle, unit: EdgeUnit, at = battle.time) =>
  unit.hp > 0 && !activeBuffs(battle, unit.id, "phase", at).length

export function basicTarget(battle: EdgeBattle, actor: EdgeUnit, priority?: (target: EdgeUnit) => number,
  at = battle.time, position = unitPosition): EdgeUnit | undefined {
  const gap = (unit: EdgeUnit) => edgeDistance(actor, position(unit))
  const inRange = (unit: EdgeUnit) => !friendly(battle, actor.id, unit.id) && targetable(battle, unit, at) &&
    gap(unit) <= attackRange(battle, actor, unit, at)
  const taunted = activeBuffs(battle, actor.id, "taunt", at).map((buff) => unitOf(battle, buff.cast.owner))
    .find((unit) => unit && inRange(unit))
  if (taunted) return taunted
  for (const { group, deployment, plan } of activeDeployments(battle)) {
    const decoy = deployment.bodies[0]
    if (plan.lure && group.until - SUMMON_DISMISS_TIME > at && inRange(decoy) && gap(decoy) <= plan.lure) return decoy
  }
  return [...nodes(battle), ...deployedUnits(battle)].filter(inRange)
    .sort((a, b) => (priority ? priority(b) - priority(a) : 0) || gap(a) - gap(b))[0]
}

export function bossTarget(battle: EdgeBattle, allowTaunt = false): EdgeUnit | undefined {
  const available = battle.team.filter((unit) => targetable(battle, unit))
  const fighters = available.length ? available : battle.team.filter((unit) => unit.hp)
  const targets = allowTaunt ? [...fighters, ...deployedUnits(battle)] : fighters
  return (allowTaunt ? basicTarget(battle, battle.boss) : undefined) ??
    targets.sort((a, b) => edgeDistance(battle.boss, a) - edgeDistance(battle.boss, b))[0]
}

export function consumeTaunt(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit) {
  const taunt = activeBuffs(battle, actor.id, "taunt").find((buff) => buff.cast.owner === target.id)
  if (taunt) {
    remove(battle, taunt)
    showBulwarkBeat(battle, taunt.cast, "taunt", target, { from: actor })
    emit(battle, { ...eventFor(taunt.cast, "protect", target), attacker: actor.id, style: "taunt" })
  }
  return !!taunt
}

export const beforeBossBasic = (battle: EdgeBattle, target: EdgeUnit) => consumeTaunt(battle, battle.boss, target)

export function beforeBossCharge(battle: EdgeBattle, target: EdgeUnit = battle.boss) {
  if (activeBuffs(battle, target.id, "block").length) return false
  emit(battle, { ...eventFor(newCast(battle, target, "enemy"), "precharge", target) })
  const stall = spendBuff(battle, target, "stall")
  if (stall) {
    addBuff(battle, stall.cast, target, "block", stall.values[0], [1])
    showSpellBeat(battle, stall.cast, "delay", target, { target: target.id, amount: stall.values[0] })
    emit(battle, { ...eventFor(stall.cast, "alter", target), style: "stall" })
    return false
  }
  return true
}
