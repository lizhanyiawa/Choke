import { combatHasRole } from "../combatRules"
import { DEMO_CARDS } from "@/card/data"
import { SUBJOBS, type SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { createEdgeBattle, issueEdgeOrder, moveEdgeFighter, stepEdgeBattle, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import { EDGE_RARITIES, skillPool, type EdgeActive, type EdgeGold, type EdgeInputCard, type EdgePassive } from "./catalog"
import { BOARD, CENTER, FIELD, along, areaHits, areaOf, clamp, direction, edgeDistance, inside, isOutside, point, rotate, type EdgePoint } from "./geometry"
import type { Rule, Step } from "./program"
import {
  basicAttack, castSkill, cue, damageUnit, emit, history, newCast, playPreviewEvent, playPreviewTrigger, playPreviewWatch,
  previewSkillAreas, shoveUnit, startMovement,
} from "./runtime"
import { battleUnits, isFighter, unitOf, type SkillCast, type SkillEvent } from "./state"
import { SUMMON_PLANS } from "./summonPlans"
import { arrangeSummonPreview, queueSummonPreview, summonPreviewDuration } from "./summonPreview"
import { rangerChoreography } from "./rangerChoreo"
import { arrangeRangerGold, queueRangerGold } from "./rangerPreview"
import { arrangeRangerPassive, rangerPassivePartner } from "./rangerPassivePreview"
import { queueSummonTrait, stageSummonTrait, summonPassivePartner, summonPassiveSlot, summonTraitCaster } from "./summonTraitPreview"
import { arrangeBulwarkPreview, bulwarkPreviewPartner } from "./bulwarkPreview"
import { arrangeBulwarkTraitPreview, bulwarkPassiveSlot, bulwarkTraitPartners } from "./bulwarkTraitPreview"
import { arrangeWardenPreview, wardenPreviewPartner } from "./wardenPreview"
import { arrangeWardenTraitPreview, wardenTraitPartners, wardenTraitSlot } from "./wardenTraitPreview"
import { arrangeBerserkerPreview } from "./berserkerPreview"
import { arrangePaladinPreview, paladinPreviewPartner } from "./paladinPreview"
import { arrangePaladinTraitPreview, paladinTraitPartners, paladinTraitSlot } from "./paladinTraitPreview"
import { arrangeSpellbreakerPreview, spellbreakerPartner } from "./spellbreakerPreview"
import { arrangeSpellbreakerTraitPreview, spellbreakerTraitPartners, spellbreakerTraitSlot } from "./spellbreakerTraitPreview"
import { arrangeAssassinPreview, assassinPreviewPartner } from "./assassinPreview"
import { arrangeWarlockPreview, warlockPreviewPartner } from "./warlockPreview"
import { arrangeLifebringerPreview, lifebringerPreviewPartners } from "./lifebringerPreview"
import { arrangeBinderPreview, binderPreviewPartner } from "./binderPreview"
import { arrangeDancerPreview, dancerPreviewPartner } from "./dancerPreview"
import { arrangeHealerPreview, healerPreviewPartners } from "./healerPreview"
import { arrangeBardPreview, bardPreviewPartners } from "./bardPreview"
import { arrangeBardTraitPreview, bardPassiveSlot, bardTraitLineup } from "./bardTraitPreview"
import { arrangeHealerTraitPreview, healerTraitLineup, healerTraitSlot } from "./healerTraitPreview"
import { arrangeDancerTraitPreview, dancerTraitPartners, dancerTraitSlot } from "./dancerTraitPreview"
import { arrangeBinderTraitPreview, binderTraitPartners, binderTraitSlot } from "./binderTraitPreview"
import { arrangeLifebringerTraitPreview, lifebringerTraitPartners, lifebringerTraitSlot } from "./lifebringerTraitPreview"
import { arrangeWarlockTraitPreview, warlockTraitPartners, warlockTraitSlot } from "./warlockTraitPreview"
import { arrangeAssassinTraitPreview, assassinTraitPartners, assassinTraitSlot } from "./assassinTraitPreview"
import { arrangeBerserkerTraitPreview, berserkerTraitPartners, berserkerTraitSlot } from "./berserkerTraitPreview"

type EntryInfo = { job: SubJobId; rarity: Rarity; index: number }
export type SkillPreviewEntry = EntryInfo & (
  | { kind: "active"; skill: EdgeActive }
  | { kind: "passive"; skill: EdgePassive }
  | { kind: "gold"; skill: EdgeGold }
)

export function listSkillPreviews(): SkillPreviewEntry[] {
  return Object.values(SUBJOBS).flatMap(({ id: job }) => EDGE_RARITIES.flatMap((rarity) => {
    const pool = skillPool(job, rarity)
    return [
      ...pool.active.map((skill, index) => ({ kind: "active" as const, skill, job, rarity, index })),
      ...pool.passive.map((skill, index) => ({ kind: "passive" as const, skill, job, rarity, index })),
      ...pool.gold.map((skill, index) => ({ kind: "gold" as const, skill, job, rarity, index })),
    ]
  }))
}

const fps = 60
const windup = .2
type Beat = { frame: number; play: () => void }

export interface SkillPreviewRun {
  battle: EdgeBattle
  viewBox: string
  duration: number
  frame: number
  beats: Beat[]
  next: number
}

export type SkillPreviewScene = "sample" | "squad"

function sampleCard(job: SubJobId, rarity: Rarity, uid: number, name: string): EdgeInputCard {
  return {
    uid, cardId: "edge-preview-" + uid, edgeSubjob: job, edge: { active: [0, 1], passive: [0, 1], gold: null },
    face: { ...DEMO_CARDS[0], id: "edge-preview-" + uid, art: undefined, name, job: SUBJOBS[job].archetype, rarity, level: 1, constellation: 0, mods: [] },
  }
}

const paired = (slot: number): [number, number] => [slot, slot === 0 ? 1 : 0]
const allOps = (steps: Step[]) => steps.flatMap(({ operations }) => operations)
const lastDelay = (steps: Step[]) => Math.max(0, ...steps.map(({ delay }) => delay))
const attackBoosts = new Set(["q", "qp", "qr", "range", "amp", "ampq", "choose", "score", "armor", "vuln", "aimp"])
const defenseBoosts = new Set(["res", "guard", "split", "defy", "reflect", "returnhp", "weak"])
const movementBoosts = new Set(["speed", "slow", "root", "extend", "short", "hop", "tether", "freeze"])
const healingBoosts = new Set(["healamp", "healrecv"])
const damageEvents = new Set(["strike", "receive", "hit", "hurt", "life", "break", "death", "protect", "redirect", "save"])
const assistEvents = new Set(["mend", "heal", "shield", "ward", "return", "move", "dash", "startMove", "save", "protect", "redirect", "cleanse"])
const motionEvents = new Set(["move", "startMove", "dash", "exit", "return"])
const eventStyles = new Set(["anti", "zone", "historic", "summon", "share", "reflect", "side", "swap", "guard", "exguard",
  "taunt", "stall", "dot", "short", "slow", "push", "root", "phase", "halt", "hop", "extend", "rot", "cost", "wall", "leech", "tether", "glide", "refund", "opposite", "borrowed"])

function playbackLength(steps: Step[]) {
  return Math.max(0, ...steps.map((step) => step.delay + Math.max(
    step.zone?.event === "reservoir" ? step.zone.duration : Math.min(step.zone?.duration ?? 0, 3),
    step.watch?.rule.event === "expire" ? step.watch.duration : 0,
    ...step.operations.map(({ kind, args, style }) => kind === "rewind" ? (args[4] ?? 3) * (args[5] ?? .7)
      : kind === "dot" || kind === "regen" ? (args[1] ?? 1) * (args[2] ?? 3)
        : kind === "bloom" ? args[2] ?? 0 : kind === "slow" && style === "extend" ? 2 + (args[0] ?? 0) : 0),
  )))
}

function setSample(unit: EdgeUnit, at: EdgePoint, hp: number, maxHp = 1100) {
  Object.assign(unit, at, { hp, maxHp, attack: 115, armor: 0 })
}

function stageTargets(battle: EdgeBattle, actor: EdgeFighter, active: EdgeActive | undefined, steps: Step[], aim: EdgePoint, picked: EdgeUnit, hostile: boolean) {
  if (!hostile || !battle.preview) return
  const shapeSteps = steps.filter((step) => step.selector.units === "e" && step.selector.shape)
  if (!shapeSteps.length && active?.artwork.path?.motion !== "chain") return
  const areas = active ? previewSkillAreas(battle, actor, { ...active, steps: shapeSteps }, aim, picked) : []
  const orbit = shapeSteps.find((step) => step.zone?.event === "orbit")?.operations.find((op) => op.kind === "orbit")
  if (orbit && picked !== battle.boss) {
    const patrol = along(aim, rotate(direction(aim, actor), 95), orbit.args[0])
    Object.assign(battle.boss, inside(patrol))
    const allyOrbit = steps.some((step) => step.zone?.event === "orbit" && step.selector.units === "a")
    const ally = battle.team[1]
    if (allyOrbit && ally) Object.assign(ally, inside(along(aim, rotate(direction(aim, actor), 240), orbit.args[0])))
  }
  const points = [...areas.flatMap((area) => [area.center, ...area.parts.flatMap((part) => part.kind === "circle" ? [part.center] : [])])]
  for (const center of [...points, point(battle.boss)]) {
    for (const dx of [0, -56, 56, -112, 112]) {
      for (const dy of [-56, 56, -112, 112, 0]) points.push({ x: center.x + dx, y: center.y + dy })
    }
  }
  const usable = (at: EdgePoint) => !isOutside(at) && battle.team.every((unit) => edgeDistance(at, unit) > 80)
  if (!orbit && areas.length && picked !== battle.boss && !areas.some((area) => areaHits(area, battle.boss))) {
    const insideArea = points.find((at) => usable(at) && areas.some((area) => areaHits(area, at)))
    if (insideArea) Object.assign(battle.boss, insideArea)
  }
  const targets = battle.preview.targets
  for (const at of points) {
    if (targets.length >= 2) break
    if (!usable(at) || [battle.boss, ...targets].some((unit) => edgeDistance(at, unit) < 98)) continue
    if (areas.length ? !areas.some((area) => areaHits(area, at)) : edgeDistance(at, battle.boss) > 142) continue
    targets.push({ ...battle.boss, ...at, id: `dummy-${targets.length + 1}`, once: new Set() })
  }
}

function frameScene(battle: EdgeBattle, actor: EdgeFighter, active: EdgeActive | undefined, aim: EdgePoint, picked?: EdgeUnit, close = false, focus: readonly EdgePoint[] = []) {
  const points: EdgePoint[] = [...battleUnits(battle), ...focus]
  if (active?.deployment === "runner") points.push({ x: aim.x, y: FIELD.top - 42 })
  if (active) {
    for (const { parts } of previewSkillAreas(battle, actor, active, aim, picked)) {
      for (const part of parts) {
        if (part.kind === "polygon") points.push(...part.points)
        else points.push(
          { x: part.center.x - part.radius, y: part.center.y - part.radius },
          { x: part.center.x + part.radius, y: part.center.y + part.radius },
        )
      }
    }
  }
  const xs = points.map(({ x }) => x)
  const ys = points.map(({ y }) => y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const ratio = BOARD.height / BOARD.width
  const bleed = ["assassin", "warlock", "lifebringer", "binder", "dancer", "healer", "bard"].some(role => combatHasRole(actor, role)) ? 128 : 0
  const width = Math.min(BOARD.width + 2 * bleed, Math.max(close ? 510 : 700, right - left + (close ? 225 : 255), (bottom - top + (close ? 244 : 285)) / ratio))
  const height = width * ratio
  const x = clamp((left + right - width) / 2, -bleed, BOARD.width + bleed - width)
  const y = clamp((top + bottom - height) / 2, -bleed, BOARD.height + bleed - height)
  return [x, y, width, height].map(Math.round).join(" ")
}

function exampleEvent(battle: EdgeBattle, cast: SkillCast, actor: EdgeFighter, rule: Rule, picked: EdgeUnit, holder?: EdgeUnit): SkillEvent {
  const friend = battle.team.find((unit) => unit !== actor && unit.hp) ?? actor
  const { flags, event: kind } = rule
  const ally = flags.includes("ally") || flags.includes("other") || !flags.includes("foe") && assistEvents.has(kind)
  const receiving = flags.includes("enemy") || !flags.includes("me") && ["receive", "hurt", "life", "redirect", "save", "protect"].includes(kind)
  const origin = flags.includes("from") ? holder : undefined
  const target = (flags.includes("to") ? holder : undefined) ??
    (flags.includes("on") || kind === "always" ? actor
      : ally || receiving || origin && !isFighter(origin) ? (isFighter(picked) && picked !== actor && picked.hp ? picked : friend)
        : (isFighter(picked) && damageEvents.has(kind) ? battle.boss : picked))
  const source = origin ?? (flags.includes("friend") ? friend : receiving || damageEvents.has(kind) && isFighter(target) ? battle.boss : actor)
  const axis = direction(source, target)
  const landing = kind === "exit" ? { x: target.x, y: FIELD.top - 52 }
    : kind === "return" ? inside({ x: target.x, y: FIELD.top + 76 })
      : motionEvents.has(kind) ? inside(along(target, { x: 1, y: 0 }, 118))
        : ["shove", "push", "pull"].includes(kind) ? along(target, axis, 85) : undefined
  const style = flags.find((flag) => eventStyles.has(flag))
  const pushed = kind === "push" || kind === "shove"
  const raw = kind === "heal" || kind === "mend" ? target.maxHp * .16
    : kind === "break" ? Math.max(165, target.shield + 80)
      : pushed && !flags.includes("q") && !flags.includes("skill") ? undefined : 115
  return {
    kind, cast, target: target.id, source: source.id, attacker: !isFighter(source) && isFighter(target) ? source.id : undefined, at: point(target),
    from: motionEvents.has(kind) ? point(target) : point(source), landing, axis: source === target ? { x: 1, y: 0 } : axis, style,
    area: flags.some((flag) => ["area", "zone", "rim", "core"].includes(flag)) ? areaOf("C", target, axis, 104) : undefined,
    amount: raw ?? 85, raw, push: pushed ? rule.flags.includes("q") ? 22 : 85 : undefined, distance: 92, direct: true, bonus: 0, scale: 1,
  }
}

function sampleFollowUp(battle: EdgeBattle, actor: EdgeFighter, cast: SkillCast, picked: EdgeUnit, steps: Step[]) {
  const watches = battle.runtime.watches.filter((watch) => watch.cast.id === cast.id && watch.uses > 0 && watch.rule.event !== "expire")
  watches.forEach((watch, i) => {
    const holder = unitOf(battle, watch.target)
    playPreviewWatch(battle, watch, exampleEvent(battle, watch.cast, actor, watch.rule, picked, holder), i * .26)
  })
  const fields = battle.runtime.fields.filter((field) => field.cast.id === cast.id)
  const buffs = battle.runtime.buffs.filter((buff) => buff.cast.id === cast.id && buff.until > battle.time)
  const ops = allOps(steps)
  const events = fields.map((field) => field.mode)
  const target = isFighter(picked) ? picked : actor
  if (events.includes("charge")) {
    emit(battle, { kind: "charge", cast: newCast(battle, battle.boss, "enemy"), source: "boss", target: "boss", at: point(battle.boss) })
  }
  const ward = fields.find((field) => field.step.operations.some((op) => op.kind === "exguard" || op.kind === "anti"))
  const brace = buffs.find(({ kind }) => kind === "exguard" || kind === "anti")
  if (ward || brace || events.includes("shove")) {
    const guardTarget = unitOf(battle, brace?.target) ??
      (ward && battle.team.find((member) => areaHits(ward.area, member))) ?? target
    const enemyCast = newCast(battle, battle.boss, "enemy", guardTarget, guardTarget)
    shoveUnit(battle, enemyCast, guardTarget, 125, "", undefined, false, { x: 0, y: -1 })
  }
  const defense = buffs.find(({ kind }) => defenseBoosts.has(kind))
  const barrier = fields.find((field) => field.mode === "guard" || field.mode === "wall" ||
    field.step.operations.some(({ kind }) => defenseBoosts.has(kind)))
  const shielded = battle.team.find((member) => battle.runtime.shieldCasts.get(member.id)?.id === cast.id)
  const watchedDamage = watches.some(({ rule }) => damageEvents.has(rule.event))
  if (!watchedDamage && (defense || barrier || shielded || events.includes("hurt"))) {
    const protectedUnit = (defense?.kind !== "weak" ? unitOf(battle, defense?.target) : undefined) ??
      shielded ?? (barrier && battle.team.find((member) => areaHits(barrier.area, member))) ?? target
    const defy = battle.runtime.buffs.some((buff) => buff.kind === "defy" && buff.target === protectedUnit.id)
    const raw = defy ? protectedUnit.hp + protectedUnit.shield + 80 : Math.min(protectedUnit.hp * .7, Math.max(115, protectedUnit.shield + 55))
    cue(battle, "melee", battle.boss, protectedUnit)
    damageUnit(battle, newCast(battle, battle.boss, "enemy", protectedUnit, protectedUnit), protectedUnit, raw)
  }
  const attack = buffs.find(({ kind }) => attackBoosts.has(kind))
  const attackField = fields.find((field) => field.step.operations.some(({ kind }) => attackBoosts.has(kind)))
  if (!watchedDamage && (attack || attackField || events.some((event) => ["strike", "hit", "push"].includes(event)))) {
    const boosted = unitOf(battle, attack?.target) ?? (attackField && battle.team.find((member) => areaHits(attackField.area, member)))
    const striker = boosted && isFighter(boosted) ? boosted : actor
    if (striker.hp && battle.boss.hp) basicAttack(battle, striker, battle.boss)
  }
  const healing = buffs.find(({ kind }) => healingBoosts.has(kind))
  const boosted = unitOf(battle, healing?.target)
  if (healing && boosted && isFighter(boosted) && !watches.some(({ rule }) => rule.event === "mend" || rule.event === "heal")) {
    const other = battle.team.find((unit) => unit !== boosted && unit.hp) ?? boosted
    const healer = healing.kind === "healamp" ? boosted : other
    const patient = healing.kind === "healamp" ? other : boosted
    playPreviewEvent(battle, { kind: "mend", cast, source: healer.id, target: patient.id, raw: 140 }, () => {})
  }
  const track = fields.find((field) => field.mode === "track")
  const strip = track?.area.parts.find((part) => part.kind === "polygon")
  if (strip?.points.length === 4) {
    const [a, b, c, d] = strip.points
    const head = { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 }
    const tail = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }
    const rider = battle.team[1] ?? actor
    Object.assign(rider, along(head, direction(head, tail), 12))
    const landing = along(tail, direction(tail, head), 12)
    if (!startMovement(battle, rider, landing, false)) rider.move = landing
  } else if (!watches.some(({ rule }) => motionEvents.has(rule.event))) {
    const movement = buffs.find(({ kind }) => movementBoosts.has(kind))
    const movementField = fields.find((field) => ["move", "leave", "startMove"].includes(field.mode) ||
      field.step.operations.some(({ kind }) => movementBoosts.has(kind)))
    if (movement || movementField || ops.some(({ kind }) => kind === "hop")) {
      const mover = unitOf(battle, movement?.target) ?? (movementField && battleUnits(battle).find((unit) => areaHits(movementField.area, unit))) ?? target
      const landing = inside(along(mover, { x: mover.x < CENTER.x ? 1 : -1, y: 0 }, 230))
      if (isFighter(mover)) moveEdgeFighter(battle, mover, landing)
      else if (!startMovement(battle, mover, landing, false)) mover.move = landing
    }
  }
}

export function createSkillPreview(entry: SkillPreviewEntry, scene: SkillPreviewScene = "sample"): SkillPreviewRun {
  const pool = skillPool(entry.job, entry.rarity)
  const summonTrait = entry.job === "summoner" && entry.kind !== "active" ? entry.skill.id : undefined
  const armorTrait = entry.job === "bulwark" && entry.kind !== "active" ? entry : undefined
  const wardenTrait = entry.job === "warden" && entry.kind !== "active" ? entry : undefined
  const rageTrait = entry.job === "berserker" && entry.kind !== "active" ? entry : undefined
  const holyTrait = entry.job === "paladin" && entry.kind !== "active" ? entry : undefined
  const breakerTrait = entry.job === "spellbreaker" && entry.kind !== "active" ? entry : undefined
  const shadowTrait = entry.job === "assassin" && entry.kind !== "active" ? entry : undefined
  const mageTrait = entry.job === "warlock" && entry.kind !== "active" ? entry : undefined
  const lifeTrait = entry.job === "lifebringer" && entry.kind !== "active" ? entry : undefined
  const binderTrait = entry.job === "binder" && entry.kind !== "active" ? entry : undefined
  const dancerTrait = entry.job === "dancer" && entry.kind !== "active" ? entry : undefined
  const healerTrait = entry.job === "healer" && entry.kind !== "active" ? entry : undefined
  const bardTrait = entry.job === "bard" && entry.kind !== "active" ? entry : undefined
  const bardSlot = bardTrait ? bardTrait.kind === "gold" ? bardTrait.skill.active : bardPassiveSlot(entry.rarity, entry.index) : -1
  const healerSlot = healerTrait ? healerTrait.kind === "gold" ? healerTrait.skill.active : healerTraitSlot(entry.rarity, entry.index) : -1
  const dancerSlot = dancerTrait ? dancerTrait.kind === "gold" ? dancerTrait.skill.active : dancerTraitSlot(entry.rarity, entry.index) : -1
  const binderSlot = binderTrait ? binderTrait.kind === "gold" ? binderTrait.skill.active : binderTraitSlot(entry.rarity, entry.index) : -1
  const lifeSlot = lifeTrait ? lifeTrait.kind === "gold" ? lifeTrait.skill.active : lifebringerTraitSlot(entry.rarity, entry.index) : -1
  const mageSlot = mageTrait ? mageTrait.kind === "gold" ? mageTrait.skill.active : warlockTraitSlot(entry.rarity, entry.index) : -1
  const shadowSlot = shadowTrait ? shadowTrait.kind === "gold" ? shadowTrait.skill.active : assassinTraitSlot(entry.rarity, entry.index) : -1
  const breakerSlot = breakerTrait ? breakerTrait.kind === "gold" ? breakerTrait.skill.active : spellbreakerTraitSlot(entry.rarity, entry.index) : -1
  const holySlot = holyTrait ? holyTrait.kind === "gold" ? holyTrait.skill.active : paladinTraitSlot(entry.rarity, entry.index) : -1
  const rageSlot = rageTrait ? rageTrait.kind === "gold" ? rageTrait.skill.active : berserkerTraitSlot(entry.rarity, entry.index) : -1
  const active = entry.kind === "active" ? entry.skill : entry.kind === "gold" ? pool.active[entry.skill.active]
    : summonTrait ? pool.active[summonPassiveSlot(entry.rarity, entry.index)] : undefined
  const triggered = entry.kind === "active" ? undefined : entry.skill
  const rangerPassive = entry.kind === "passive" && entry.job === "ranger" ? entry.skill : undefined
  const rangerGold = entry.kind === "gold" && entry.job === "ranger" ? entry.skill.id : undefined
  const bulwarkActive = entry.kind === "active" && entry.job === "bulwark" ? entry.skill : undefined
  const wardenActive = entry.kind === "active" && entry.job === "warden" ? entry.skill : undefined
  const berserkerActive = entry.kind === "active" && entry.job === "berserker" ? entry.skill : undefined
  const paladinActive = entry.kind === "active" && entry.job === "paladin" ? entry.skill : undefined
  const spellActive = entry.kind === "active" && entry.job === "spellbreaker" ? entry.skill : undefined
  const assassinActive = entry.kind === "active" && entry.job === "assassin" ? entry.skill : undefined
  const warlockActive = entry.kind === "active" && entry.job === "warlock" ? entry.skill : undefined
  const lifeActive = entry.kind === "active" && entry.job === "lifebringer" ? entry.skill : undefined
  const binderActive = entry.kind === "active" && entry.job === "binder" ? entry.skill : undefined
  const dancerActive = entry.kind === "active" && entry.job === "dancer" ? entry.skill : undefined
  const healerActive = entry.kind === "active" && entry.job === "healer" ? entry.skill : undefined
  const bardActive = entry.kind === "active" && entry.job === "bard" ? entry.skill : undefined
  const deployment = active?.deployment
  const motif = active && rangerChoreography(active.id)?.motif
  const plan = deployment ? SUMMON_PLANS[deployment] : undefined
  const steps = [...(active?.steps ?? []), ...(plan?.actions?.map(({ step }) => step) ?? []), ...(triggered?.steps ?? [])]
  const ops = allOps(steps)
  const flags = [...(triggered?.rule.flags ?? []), ...steps.flatMap(({ selector, watch }) => [...selector.flags, ...(watch?.holder.flags ?? [])])]
  const lineup = [sampleCard(entry.job, entry.rarity, -1, SUBJOBS[entry.job].label)]
  const needsTeam = scene === "squad" || entry.kind !== "active" || active?.aim.mode === "ally" || active?.aim.mode === "other" ||
    !!(plan?.guard || plan?.lure) || deployment === "returnBeast" ||
    steps.some(({ selector, watch }) => /^[abgo]$/.test(selector.units) || !!watch?.rule.flags.includes("friend")) ||
    ops.some(({ kind }) => ["score", "glide", "split"].includes(kind))
  if (bulwarkActive && scene === "sample") {
    if (bulwarkPreviewPartner(bulwarkActive)) lineup.push(sampleCard("warden", "C", -2, "队友"))
  } else if (wardenActive && scene === "sample") {
    if (wardenPreviewPartner(wardenActive)) lineup.push(sampleCard("warden", "C", -2, "队友"))
  } else if (paladinActive && scene === "sample") {
    if (paladinPreviewPartner(paladinActive)) lineup.push(sampleCard("warden", "C", -2, "队友"))
  } else if (spellActive && scene === "sample") {
    if (spellbreakerPartner(spellActive)) lineup.push(sampleCard("warden", "C", -2, "队友"))
  } else if (assassinActive && scene === "sample") {
    if (assassinPreviewPartner(assassinActive)) lineup.push(sampleCard("ranger", "C", -2, "队友"))
  } else if (bardActive) {
    bardPreviewPartners(bardActive, scene === "squad").forEach((job, i) => lineup.push(sampleCard(job, "C", -2 - i, "队友")))
  } else if (bardTrait) {
    bardTraitLineup(bardTrait.skill.id, pool.active[bardSlot], scene === "squad").forEach((job, i) =>
      lineup.push(sampleCard(job, "C", -2 - i, "队友")))
  } else if (healerActive) {
    for (let i = 0; i < healerPreviewPartners(healerActive, scene === "squad"); i++)
      lineup.push(sampleCard(i === 0 ? "warden" : "ranger", "C", -2 - i, "队友"))
  } else if (dancerActive) {
    if (scene === "squad" || dancerPreviewPartner(dancerActive)) lineup.push(sampleCard("warden", "C", -2, "队友"))
    if (scene === "squad") lineup.push(sampleCard("ranger", "C", -3, "队友"))
  } else if (binderActive) {
    const archer = binderActive.id === "binder/Prismatic/A3"
    if (scene === "squad" || binderPreviewPartner(binderActive))
      lineup.push(sampleCard(archer ? "ranger" : "bulwark", archer ? "UC" : "C", -2, "队友"))
    if (scene === "squad") lineup.push(sampleCard("warden", "C", -3, "队友"))
  } else if (lifeActive) {
    for (let i = 0; i < lifebringerPreviewPartners(lifeActive, scene === "squad"); i++) {
      const job = i === 0 && lifeActive.id === "lifebringer/R/A3" ? "healer" : "ranger"
      lineup.push(sampleCard(job, "C", -2 - i, "队友"))
    }
  } else if (warlockActive && scene === "sample") {
    if (warlockPreviewPartner(warlockActive)) lineup.push(sampleCard(warlockActive.id === "warlock/R/A5" ? "warlock" : "ranger", warlockActive.id === "warlock/R/A5" ? "UC" : "C", -2, "队友"))
  } else if (binderTrait) {
    binderTraitPartners(binderTrait.skill.id, scene === "squad").forEach(({ job, rarity }, i) =>
      lineup.push(sampleCard(job, rarity, -2 - i, "队友")))
  } else if (dancerTrait) {
    dancerTraitPartners(dancerTrait.skill.id, scene === "squad").forEach(({ job, rarity }, i) =>
      lineup.push(sampleCard(job, rarity, -2 - i, "队友")))
  } else if (healerTrait) {
    healerTraitLineup(healerTrait.skill.id, pool.active[healerSlot], scene === "squad").forEach((job, i) =>
      lineup.push(sampleCard(job, "C", -2 - i, "队友")))
  } else if (lifeTrait) {
    lifebringerTraitPartners(lifeTrait.skill.id, scene === "squad").forEach((job, i) =>
      lineup.push(sampleCard(job, "C", -2 - i, "队友")))
  } else if (mageTrait) {
    warlockTraitPartners(mageTrait.skill.id, scene === "squad").forEach(({ job, rarity, active }, i) => {
      const card = sampleCard(job, rarity, -2 - i, "队友")
      if (card.edge) card.edge.active = active
      lineup.push(card)
    })
  } else if (shadowTrait) {
    assassinTraitPartners(entry.skill.id, scene === "squad").forEach(({ job, rarity, active }, i) => {
      const card = sampleCard(job, rarity, -2 - i, "队友")
      card.edge = { active, passive: [0, 1], gold: null }
      lineup.push(card)
    })
  } else if (breakerTrait) {
    for (let i = 0; i < spellbreakerTraitPartners(entry.skill.id, scene === "squad"); i++) {
      const interrupter = i === 0 && ["spellbreaker/R/P8", "spellbreaker/E/G2", "spellbreaker/Radiant/P4"].includes(entry.skill.id)
      const card = sampleCard(interrupter ? "spellbreaker" : "healer", interrupter ? "UC" : "C", -2 - i, "队友")
      card.edge = { active: [0, 2], passive: [0, 1], gold: null }
      lineup.push(card)
    }
  } else if (holyTrait) {
    for (let i = 0; i < paladinTraitPartners(entry.skill.id, scene === "squad"); i++) {
      const firstPartner = entry.skill.id === "paladin/Prismatic/G2" ? "ranger" : "healer"
      const partner = i === 0 ? firstPartner : "warden"
      const card = sampleCard(partner, "C", -2 - i, "队友")
      card.edge = { active: [0, 2], passive: [0, 1], gold: null }
      lineup.push(card)
    }
  } else if (armorTrait && scene === "sample") {
    bulwarkTraitPartners(armorTrait.skill.id).forEach((job, i) => lineup.push(sampleCard(job, "C", -2 - i, "队友")))
  } else if (wardenTrait || rageTrait) {
    const partners = wardenTrait ? wardenTraitPartners(wardenTrait.skill.id, scene === "squad")
      : berserkerTraitPartners(rageTrait!.skill.id, scene === "squad")
    partners.forEach(({ job, rarity, active }, i) => {
      const card = sampleCard(job, rarity ?? "C", -2 - i, "队友")
      if (active && card.edge) card.edge.active = active
      lineup.push(card)
    })
  } else if (rangerPassive && scene === "sample") {
    const partner = rangerPassivePartner(rangerPassive)
    if (partner) lineup.push(sampleCard(partner, "C", -2, "队友"))
  } else if (summonTrait && entry.kind === "passive" && scene === "sample") {
    if (summonPassivePartner(summonTrait)) lineup.push(sampleCard("warden", "C", -2, "队友"))
  } else if (needsTeam) lineup.push(sampleCard("warden", "C", -2, "队友"), sampleCard("healer", "C", -3, "队友"))
  if (scene === "squad" && lineup[2]) lineup[2].edge = { active: [2, 0], passive: [0, 1], gold: null }
  lineup[0].edge = {
    active: paired(entry.kind === "active" ? entry.index : entry.kind === "gold" ? entry.skill.active
      : summonTrait ? summonPassiveSlot(entry.rarity, entry.index) : armorTrait ? Math.max(0, bulwarkPassiveSlot(entry.rarity, entry.index))
        : wardenTrait ? Math.max(0, wardenTraitSlot(entry.rarity, entry.index)) : Math.max(0, bardTrait ? bardSlot : healerTrait ? healerSlot : dancerTrait ? dancerSlot : binderTrait ? binderSlot
          : lifeTrait ? lifeSlot : mageTrait ? mageSlot : shadowTrait ? shadowSlot : breakerTrait ? breakerSlot : holyTrait ? holySlot : rageSlot)),
    passive: paired(entry.kind === "passive" ? entry.index : entry.kind === "gold" ? entry.skill.passive : 0),
    gold: entry.kind === "gold" ? entry.index : null,
  }
  const battle = createEdgeBattle(lineup, undefined, () => 1)
  if ((bardActive || bardTrait || lifeTrait?.skill.id === "lifebringer/Prismatic/P8") && lineup.length > battle.team.length)
    battle.team.push(...createEdgeBattle(lineup.slice(battle.team.length)).team)
  battle.preview = { targets: [] }
  battle.phase = "running"
  const actor = battle.team[0]
  if (bardActive || bardTrait) {
    const beats: Beat[] = []
    const at = (time: number, play: () => void) => beats.push({ frame: Math.round(time * fps), play })
    const active = bardActive ?? pool.active[bardSlot]
    if (bardTrait) {
      battle.preview.loadoutFor = actor.id
      battle.preview.passiveOnly = bardTrait.kind === "passive" ? bardTrait.skill.id : pool.passive[bardTrait.skill.passive].id
    }
    const { aim, picked, duration, focus } = bardTrait
      ? arrangeBardTraitPreview(battle, bardTrait.skill.id, active, scene === "squad", at)
      : arrangeBardPreview(battle, bardActive!, scene === "squad", at)
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (healerActive) {
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeHealerPreview(battle, healerActive,
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, healerActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (dancerActive) {
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeDancerPreview(battle, dancerActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, dancerActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (binderActive) {
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeBinderPreview(battle, binderActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, binderActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (bulwarkActive) {
    const beats: Beat[] = []
    const { aim, picked, duration } = arrangeBulwarkPreview(battle, bulwarkActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, bulwarkActive, aim, picked, true), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (wardenActive) {
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeWardenPreview(battle, wardenActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, wardenActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (berserkerActive) {
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeBerserkerPreview(battle, berserkerActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, berserkerActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (paladinActive) {
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangePaladinPreview(battle, paladinActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, paladinActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (spellActive) {
    const beats: Beat[] = []
    const { aim, picked, focus, duration } = arrangeSpellbreakerPreview(battle, spellActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, spellActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (lifeActive) {
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeLifebringerPreview(battle, lifeActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, lifeActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (warlockActive) {
    const beats: Beat[] = []
    actor.actives[0] = warlockActive
    if (warlockActive.id === "warlock/R/A5" && battle.team[1]) {
      const companion = sampleCard("warlock", "UC", -2, "队友")
      battle.team[1] = createEdgeBattle([companion]).team[0]
    }
    const { aim, picked, duration, focus } = arrangeWarlockPreview(battle, warlockActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, warlockActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (assassinActive) {
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeAssassinPreview(battle, assassinActive, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, assassinActive, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (healerTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = healerTrait.kind === "passive" ? healerTrait.skill.id : pool.passive[healerTrait.skill.passive].id
    const active = healerSlot >= 0 ? actor.actives[0] : undefined
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeHealerTraitPreview(battle, healerTrait.skill.id, active,
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (dancerTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = dancerTrait.kind === "passive" ? dancerTrait.skill.id : pool.passive[dancerTrait.skill.passive].id
    const active = dancerSlot >= 0 ? actor.actives[0] : undefined
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeDancerTraitPreview(battle, dancerTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (binderTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = binderTrait.kind === "passive" ? binderTrait.skill.id : pool.passive[binderTrait.skill.passive].id
    const active = binderSlot >= 0 ? actor.actives[0] : undefined
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeBinderTraitPreview(battle, binderTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (lifeTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = lifeTrait.kind === "passive" ? lifeTrait.skill.id : pool.passive[lifeTrait.skill.passive].id
    const active = lifeSlot >= 0 ? actor.actives[0] : undefined
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeLifebringerTraitPreview(battle, lifeTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (mageTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = mageTrait.kind === "passive" ? mageTrait.skill.id : pool.passive[mageTrait.skill.passive].id
    const active = pool.active[mageSlot]
    if (active) actor.actives[0] = active
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeWarlockTraitPreview(battle, mageTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (shadowTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = shadowTrait.kind === "passive" ? shadowTrait.skill.id : pool.passive[shadowTrait.skill.passive].id
    const active = pool.active[shadowSlot]
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeAssassinTraitPreview(battle, shadowTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (breakerTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = breakerTrait.kind === "passive" ? breakerTrait.skill.id : pool.passive[breakerTrait.skill.passive].id
    const active = pool.active[breakerSlot]
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeSpellbreakerTraitPreview(battle, breakerTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (holyTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = holyTrait.kind === "passive" ? holyTrait.skill.id : pool.passive[holyTrait.skill.passive].id
    const active = pool.active[holySlot]
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangePaladinTraitPreview(battle, holyTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (rageTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = rageTrait.kind === "passive" ? rageTrait.skill.id : pool.passive[rageTrait.skill.passive].id
    const active = pool.active[rageSlot]
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeBerserkerTraitPreview(battle, rageTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (armorTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = armorTrait.kind === "passive" ? armorTrait.skill.id : pool.passive[armorTrait.skill.passive].id
    const selected = armorTrait.kind === "gold" ? armorTrait.skill.active : bulwarkPassiveSlot(entry.rarity, entry.index)
    const active = pool.active[selected]
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeBulwarkTraitPreview(battle, armorTrait.skill.id, active,
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (wardenTrait) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = wardenTrait.kind === "passive" ? wardenTrait.skill.id : pool.passive[wardenTrait.skill.passive].id
    const selected = wardenTrait.kind === "gold" ? wardenTrait.skill.active : wardenTraitSlot(entry.rarity, entry.index)
    const active = pool.active[selected]
    const beats: Beat[] = []
    const { aim, picked, duration, focus } = arrangeWardenTraitPreview(battle, wardenTrait.skill.id, active, scene === "squad",
      (time, play) => beats.push({ frame: Math.round(time * fps), play }))
    return { battle, viewBox: frameScene(battle, actor, active, aim, picked, true, focus), duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (rangerPassive) {
    battle.preview.loadoutFor = actor.id
    battle.preview.passiveOnly = rangerPassive.id
    const beats: Beat[] = []
    const scenePlan = arrangeRangerPassive(battle, pool, rangerPassive,
      (time, play) => beats.push({ frame: Math.round(time * fps), play }), scene === "squad")
    return { battle, viewBox: frameScene(battle, actor, scenePlan.active, scenePlan.aim), duration: scenePlan.duration,
      frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
  }
  if (rangerGold || summonTrait || plan && entry.kind === "gold") battle.preview.loadoutFor = actor.id
  if (summonTrait && entry.kind !== "active")
    battle.preview.passiveOnly = entry.kind === "passive" ? entry.skill.id : pool.passive[entry.skill.passive].id
  const mode = active?.aim.mode
  const pairedTargets = triggered?.rule.event === "after" && flags.includes("multi") || flags.some((flag) => flag.startsWith("pushpair"))
  const hostile = mode === "enemy" || mode === "outside" || pairedTargets || steps.some((step) => step.selector.units === "e") ||
    ops.some(({ kind }) => kind === "d" || kind === "p" || kind === "l") ||
    triggered?.rule.event === "shove" || triggered?.rule.event === "push" ||
    triggered?.rule.event === "alter" && (flags.includes("slow") || flags.includes("push"))
  const protectsEdge = ops.some(({ kind }) => kind === "exguard") || triggered?.rule.event === "exit" || triggered?.rule.event === "return"
  const out = flags.includes("out") || flags.includes("pickedout")
  const nearEdge = motif === "edgePin" || motif === "edgeSweep" || rangerGold === "ranger/Radiant/G1" ? 55
    : rangerGold === "ranger/Prismatic/G1" ? 121 : deployment === "rescue" || deployment === "shoreBeast" ? 80
      : deployment === "returnBeast" || deployment === "bridge" ? 43 : 0
  const goal = motif === "reflection" ? { x: CENTER.x - 104, y: CENTER.y - 78 }
    : { x: CENTER.x, y: nearEdge ? FIELD.top + nearEdge : mode === "outside" ? FIELD.top - 72 : protectsEdge || out ? FIELD.top + 59 : CENTER.y - 38 }
  const selfCircle = active?.steps.find(({ selector }) => selector.units === "e" && selector.anchor === "s" && selector.shape === "C")
  const range = active?.aim.range ?? 255
  const near = flags.includes("melee") ? 120 : Number(flags.map((flag) => /^near(?:self)?(\d+)$/.exec(flag)).find((value) => value)?.[1])
  const gap = selfCircle && mode === "self" ? Math.max(58, selfCircle.selector.size[0] - 12)
    : Math.max(68, Math.min(280, (range || 260) * .8, near ? near - 17 : 280))
  const origin = summonTraitCaster(summonTrait, inside({ x: goal.x - (motif === "longString" ? 180 : 0),
    y: goal.y + (deployment === "gates" ? 116 : rangerGold === "ranger/Prismatic/G1" ? 468 : gap) }, 48), goal)
  const lowSelf = Number(flags.find((flag) => /^selflow\d+$/.test(flag))?.slice(7))
  setSample(actor, origin, lowSelf ? Math.round(11 * Math.max(8, lowSelf - 7)) : 730)
  if (flags.includes("shielded") || flags.includes("selfshield")) {
    actor.shield = 175
    actor.shieldUntil = 5
  }
  const friendlyGround = mode === "point" && steps.some(({ selector, watch }) => !watch && /^[abgo]$/.test(selector.units) &&
    selector.shape && !["s", "o"].includes(selector.anchor ?? ""))
  for (const [i, member] of battle.team.slice(1).entries()) {
    const nearAllies = mode === "self" && !hostile || flags.some((flag) => /^(nearally|lowally|twoallies)/.test(flag))
    const allyTargeted = !nearAllies && (mode === "ally" || mode === "other" || friendlyGround || !hostile)
    const anchor = allyTargeted ? goal : origin
    const side = i === 0 ? 1 : -1
    const centered = allyTargeted && i === 0 && (!hostile || mode === "ally" || mode === "other")
    const at = { x: anchor.x + (centered ? 0 : 92 * side), y: anchor.y + (i ? 22 : 0) }
    const position = out ? (i === 0 ? { x: goal.x, y: FIELD.top - 45 } : { x: goal.x - 72, y: FIELD.top + 37 }) : inside(at)
    const low = flags.some((flag) => flag.startsWith("lowally"))
    setSample(member, position, low && i === 0 ? 300 : 450 + i * 115)
  }
  setSample(battle.boss, hostile ? goal : { x: goal.x - 165, y: goal.y - 62 }, 1900, 1900)
  const picked = mode === "self" ? actor : mode === "ally" || mode === "other" ? battle.team[1] ?? actor
    : mode === "point" || mode === "direction" ? undefined : hostile ? battle.boss : battle.team[1] ?? actor
  const aim = point(picked ?? goal)
  const cast = newCast(battle, actor, "skill", aim, picked ?? (active ? undefined : battle.boss), active)
  const trapDistance = motif === "pad" ? 125 : motif === "tripwire" || motif === "interruptLine" ? 94 : motif === "beacon" ? 187 : 0
  if (deployment) arrangeSummonPreview(battle, actor, cast, deployment)
  else if (trapDistance) {
    Object.assign(battle.boss, inside({ x: aim.x + 16, y: aim.y - trapDistance }))
    if (motif === "beacon" && battle.team[1]) Object.assign(battle.team[1], inside({ x: aim.x + 180, y: aim.y + 25 }))
  }
  else stageTargets(battle, actor, active, steps, aim, picked ?? actor, hostile)
  if (summonTrait) stageSummonTrait(battle, actor, cast, summonTrait)
  if (motif === "slide") {
    Object.assign(battle.boss, inside({ x: aim.x + 96, y: aim.y - 101 }))
    battle.preview.targets = []
  }
  if (motif === "relay") {
    const next = inside({ x: battle.boss.x + 106, y: battle.boss.y - 63 })
    battle.preview.targets = [{ ...battle.boss, ...next, id: "dummy-1", once: new Set() }]
  }
  if (motif === "parallel" && active) {
    const [area] = previewSkillAreas(battle, actor, active, aim)
    const lanes = area.parts.flatMap((part, i) => {
      if (part.kind !== "polygon") return []
      const center = part.points.reduce((sum, p) => ({ x: sum.x + p.x / part.points.length, y: sum.y + p.y / part.points.length }), { x: 0, y: 0 })
      return [along(center, direction(actor, aim), (i - 1) * 64)]
    })
    Object.assign(battle.boss, lanes[1])
    battle.preview.targets = [lanes[0], lanes[2]].map((at, i) => ({ ...battle.boss, ...at, id: `dummy-${i + 1}`, once: new Set() }))
  }
  if (motif === "reflection") {
    const reach = edgeDistance(aim, CENTER)
    const overlap = along(aim, direction(aim, CENTER), reach * 1.11)
    battle.preview.targets.push({ ...battle.boss, ...overlap, id: "dummy-4", once: new Set() })
  }
  if (motif === "sunset") battle.preview.targets.push({
    ...battle.boss, ...inside({ x: aim.x + 151, y: aim.y + 19 }), id: "dummy-4", once: new Set(),
  })
  if (rangerGold && active) arrangeRangerGold(battle, actor, active, aim, rangerGold)
  if (scene === "squad" && edgeDistance(battle.team[2], actor) > 250) {
    Object.assign(battle.team[2], inside({ x: actor.x + 105, y: actor.y - 28 }))
  }
  const nextTarget = triggered?.steps.find(({ selector }) => selector.units === "e" && selector.exclude === "v" && selector.shape === "C")
  if (!rangerGold && (pairedTargets || nextTarget)) {
    const base = battle.boss
    const advance = nextTarget && active?.steps.find(({ operations }) => operations.some((op) => op.kind === "d"))
      ?.operations.find((op) => op.kind === "p")?.args[0]
    const center = advance ? along(base, direction(actor, base), advance) : base
    const distance = nextTarget ? Math.max(30, Math.min(94, nextTarget.selector.size[0] - 6)) : 96
    const nearby = inside({ x: center.x + distance, y: center.y })
    if (!battle.preview.targets.some((unit) => edgeDistance(unit, center) <= distance + 2)) {
      battle.preview.targets.unshift({ ...base, ...nearby, id: "dummy-3", once: new Set() })
    }
  }
  for (const [i, unit] of battle.team.entries()) {
    const record = history(battle, unit)
    record.wounds.push({ time: -.3, amount: 210 })
    record.positions.unshift({ time: -2.5, at: inside({ x: unit.x + (i ? 52 : -52), y: unit.y - 34 }) })
    const standing = flags.map((flag) => /^stand(\d+)$/.exec(flag)).find((value) => value)?.[1]
    if (standing) record.standAt = -(Number(standing) / 10 + .05)
  }
  const beats: Beat[] = []
  const at = (time: number, play: () => void) => beats.push({ frame: Math.round(time * fps), play })
  if (active) at(windup, () => {
    castSkill(battle, cast, active)
    if (summonTrait) actor.actionAt = battle.time + actor.actionCooldown
  })
  if (deployment) queueSummonPreview(battle, actor, cast, deployment, at)
  const traitEnd = summonTrait ? queueSummonTrait(battle, actor, cast, summonTrait, at) : 0
  if (rangerGold) queueRangerGold(battle, aim, rangerGold, at)
  if (trapDistance) at(.46, () => { battle.boss.move = inside(aim) })
  if (motif === "beacon" && battle.team[1]) at(.82, () => moveEdgeFighter(battle, battle.team[1], inside({ x: aim.x + 67, y: aim.y + 30 })))
  if (motif === "starRain") at(.38, () => { battle.boss.move = inside({ x: aim.x + 148, y: aim.y - 34 }) })
  if (scene === "squad" && summonTrait) {
    at(Math.max(3.14, traitEnd - .52), () => issueEdgeOrder(battle, battle.team[2], "skill2", actor))
  } else if (scene === "squad") {
    const [, warden, healer] = battle.team
    at(1.14, () => issueEdgeOrder(battle, healer, "skill", actor))
    const wardenAt = deployment === "paperPack" ? 6.95 : deployment === "rail" ? 3.87
      : deployment === "ensemble" || deployment === "bridge" ? 3.18 : 2.08
    at(wardenAt, () => {
      const nearest = [battle.boss, ...battle.preview!.targets].filter((unit) => unit.hp)
        .sort((a, b) => edgeDistance(warden, a) - edgeDistance(warden, b))[0]
      if (nearest && edgeDistance(warden, nearest) <= warden.actives[0].aim.range) issueEdgeOrder(battle, warden, "skill", nearest)
      else moveEdgeFighter(battle, warden, inside(along(warden, direction(warden, aim), 90)))
    })
  }
  const interrupt = !plan && ops.some(({ kind }) => kind === "i")
  if (interrupt) {
    const vector = direction(battle.boss, actor)
    battle.telegraph = { from: point(battle.boss), to: along(battle.boss, vector, 260), direction: vector, until: windup + lastDelay(steps) + 1.25 }
    at(battle.telegraph.until, () => { battle.telegraph = null })
  }
  const triggerAt = active ? windup + Math.max(.86, lastDelay(active.steps) + .46) : windup
  if (triggered && !plan && !rangerGold && !summonTrait) at(triggerAt, () => playPreviewTrigger(battle, actor, triggered, exampleEvent(battle, cast, actor, triggered.rule, picked ?? battle.boss)))
  const followAt = (triggered ? triggerAt + lastDelay(triggered.steps) : windup + lastDelay(steps)) + .94
  const hasFollowUp = steps.some(({ watch, zone }) => !!watch || !!zone) || ops.some(({ kind }) =>
    attackBoosts.has(kind) || defenseBoosts.has(kind) || movementBoosts.has(kind) || healingBoosts.has(kind) || ["b", "exguard", "anti"].includes(kind))
  const watchCount = steps.filter(({ watch }) => watch && watch.rule.event !== "expire").length
  if (hasFollowUp && !plan && !rangerGold && !trapDistance) at(followAt, () => sampleFollowUp(battle, actor, cast, picked ?? battle.boss, steps))
  const deploymentDemo = deployment ? windup + summonPreviewDuration(deployment) : 0
  const duration = Math.ceil(10 * Math.max(rangerGold === "ranger/E/G2" ? 3.8 : scene === "squad" ? 3.65 : 1.7, deploymentDemo, traitEnd, windup + playbackLength(active?.steps ?? []) + 1.25,
    triggered ? triggerAt + playbackLength(triggered.steps) + 1.4 : 0, hasFollowUp ? followAt + 1.45 + Math.max(0, watchCount - 1) * .26 : 0)) / 10
  return { battle, viewBox: frameScene(battle, actor, active, aim, picked), duration, frame: 0, beats: beats.sort((a, b) => a.frame - b.frame), next: 0 }
}

export function advanceSkillPreview(run: SkillPreviewRun, time: number) {
  const frame = Math.min(Math.round(time * fps), Math.round(run.duration * fps))
  while (run.frame < frame) {
    stepEdgeBattle(run.battle, 1 / fps)
    run.frame++
    let beat = run.beats[run.next]
    while (beat && beat.frame <= run.frame) {
      beat.play()
      beat = run.beats[++run.next]
    }
  }
}
