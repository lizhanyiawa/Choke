import { skillSeed, subjobFor, type SubJobId } from "@/card/jobs"
import type { Job, Rarity } from "@/card/types"
import type { CombatVersion } from "@/card/combatRules"

import type { BattleInputCard } from "../engine"
import { artwork } from "./artwork"
import data from "./catalog.json"
import { readArtwork, readPassiveGlyphs, type Glyph, type SkillArtwork } from "./presentation"
import { compileCast, compileEffect, type CastProgram, type EffectProgram } from "./program"
import { recipes } from "./recipes"

export const EDGE_RARITIES = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"] as const satisfies readonly Rarity[]
interface Copy { name: string; description: string; art?: string }
interface GoldCopy extends Copy { active: number; passive: number }
interface PoolCopy { active: Copy[]; passive: Copy[]; gold: GoldCopy[] }
export interface EdgeActive extends Copy, CastProgram { id: string; artwork: SkillArtwork }
export interface EdgePassive extends Copy, EffectProgram { id: string; glyph: Glyph }
export interface EdgeGold extends GoldCopy, EffectProgram { id: string; artwork: SkillArtwork }
export interface EdgePool { active: EdgeActive[]; passive: EdgePassive[]; gold: EdgeGold[]; version?: 2 }
export interface EdgeLoadout { active: [number, number]; passive: [number, number]; gold: number | null }
export interface EdgeInputCard extends BattleInputCard {
  combatVersion?: CombatVersion
  edge?: EdgeLoadout; edgeSubjob?: SubJobId; edgePool?: "curated-v1" | "legacy-v1"
  cultivationRun?: { userId: string; id: string; seed: number }
}

const source: Record<SubJobId, Record<Rarity, PoolCopy>> = data
const compiled = new Map<string, EdgePool>()

export const edgeJobOf = ({ face, edgeSubjob }: EdgeInputCard): SubJobId => edgeSubjob ?? subjobFor(skillSeed(face.id), face.job).id

export function skillPool(job: SubJobId, rarity: Rarity): EdgePool {
  const id = job + "/" + rarity
  const existing = compiled.get(id)
  if (existing) return existing
  const pool = source[job][rarity]
  const blocks = recipes[job]?.trim().split(/\n---\n/)
  const rank = EDGE_RARITIES.indexOf(rarity)
  const lines = blocks?.[rank]?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines || lines.length !== 15 || blocks?.length !== 7) throw new Error(id + " is missing battle programs")
  const art = artwork[job]?.trim().split(/\n---\n/)[rank]?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!art || art.length !== 8) throw new Error(id + " is missing battle artwork")
  const passiveGlyphs = readPassiveGlyphs(art[7])
  function build<T, P>(entries: T[], offset: number, prefix: string, compile: (text: string) => P) {
    return entries.map((entry, index) => {
      const slot = id + "/" + prefix + (index + 1)
      try {
        return { ...entry, ...compile(lines![offset + index]), id: slot }
      } catch (error) {
        throw new Error(slot + ": " + String(error), { cause: error })
      }
    })
  }
  const result = {
    active: build(pool.active, 0, "A", compileCast).map((skill, i) => ({ ...skill, artwork: readArtwork(art[i], skill.name) })),
    passive: build(pool.passive, 5, "P", compileEffect).map((skill, i) => ({ ...skill, glyph: passiveGlyphs[i] })),
    gold: build(pool.gold, 13, "G", compileEffect).map((skill, i) => ({ ...skill, artwork: readArtwork(art[5 + i], skill.name) })),
  }
  compiled.set(id, result)
  return result
}

const CURATED_SOURCES: Record<Job, readonly [SubJobId, SubJobId]> = {
  warrior: ["berserker", "ranger"], tank: ["bulwark", "warden"],
  mage: ["warlock", "binder"], support: ["healer", "bard"],
}
const curated = new Map<string, EdgePool>()
/** Reuse actual skill IDs, programs, art and golden prerequisites. Assets remain intact. */
export function curatedPool(job: Job, rarity: Rarity): EdgePool {
  const key = job + "/" + rarity
  const existing = curated.get(key)
  if (existing) return existing
  const [main, partner] = CURATED_SOURCES[job]
  const base = skillPool(main, "C"), extra = skillPool(partner, "UC")
  const active = [...base.active, ...extra.active.slice(0, 2)]
  const passive = [...base.passive, ...extra.passive.slice(0, 2)]
  const gold = base.gold.map(g => ({ ...g }))
  // High rarities gain a complete signature interaction, not a numeric copy.
  const signatures: Rarity[] = EDGE_RARITIES.indexOf(rarity) >= 4 ? ["L"] : []
  if (rarity === "Prismatic") signatures.push("Prismatic")
  for (const rank of signatures) {
    const source = skillPool(main, rank), signature = source.gold[0]
    const a = active.length, p = passive.length
    active.push(source.active[signature.active]); passive.push(source.passive[signature.passive])
    gold.push({ ...signature, active: a, passive: p })
  }
  const pool: EdgePool = { active, passive, gold, version: 2 }
  curated.set(key, pool)
  return pool
}
export function hasLegacyLoadout(input: EdgeInputCard) {
  if (input.edgePool) return input.edgePool === "legacy-v1"
  if (input.edge) return true
  try {
    const choice = localStorage.getItem(poolChoiceKey(input))
    if (choice === "legacy-v1" || choice === "curated-v1") return choice === "legacy-v1"
    return localStorage.getItem(storageKey(input)) !== null
  } catch { return false }
}
export const poolForCard = (input: EdgeInputCard) => hasLegacyLoadout(input)
  ? skillPool(edgeJobOf(input), input.face.rarity) : curatedPool(input.face.job, input.face.rarity)

function slots(value: unknown, size: number): [number, number] {
  if (Array.isArray(value) && value.length === 2 && value[0] !== value[1] &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item < size)) return [value[0], value[1]]
  return [0, 1]
}

export function eligibleGold(pool: EdgePool, loadout: EdgeLoadout, index: number): boolean {
  const gold = pool.gold[index]
  return !!gold && loadout.active.includes(gold.active) && loadout.passive.includes(gold.passive)
}

export function normalizeLoadout(pool: EdgePool, raw: unknown): EdgeLoadout {
  const input = raw && typeof raw === "object" ? raw as Partial<EdgeLoadout> : undefined
  const result: EdgeLoadout = {
    active: slots(input?.active, pool.active.length),
    passive: slots(input?.passive, pool.passive.length),
    gold: null,
  }
  const gold = input?.gold
  if (typeof gold === "number" && Number.isInteger(gold) && eligibleGold(pool, result, gold)) result.gold = gold
  else if (gold === undefined) {
    const first = pool.gold.findIndex((_, index) => eligibleGold(pool, result, index))
    result.gold = first >= 0 ? first : null
  }
  return result
}

export function equipSlot(pool: EdgePool, current: EdgeLoadout, kind: "active" | "passive", slot: 0 | 1, index: number) {
  const chosen: [number, number] = [...current[kind]]
  if (chosen[1 - slot] === index) chosen[1 - slot] = chosen[slot]
  chosen[slot] = index
  return normalizeLoadout(pool, { ...current, [kind]: chosen })
}

export function storageKey(input: EdgeInputCard) {
  return ["choke-edge-v1", input.uid, input.cardId, edgeJobOf(input), input.face.rarity].join(":")
}

export const curatedStorageKey = (input: EdgeInputCard) => ["choke-edge-v2", input.uid, input.cardId, input.face.job, input.face.rarity].join(":")
const poolChoiceKey = (input: EdgeInputCard) => ["choke-edge-choice-v1", input.uid, input.cardId, input.face.rarity].join(":")

export function readLoadout(input: EdgeInputCard, pool: EdgePool): EdgeLoadout {
  if (input.edge) return normalizeLoadout(pool, input.edge)
  try {
    if (pool.version === 2) {
      const raw = JSON.parse(localStorage.getItem(curatedStorageKey(input)) ?? "null")
      if (!raw) return normalizeLoadout(pool, null)
      const indices = (kind: "active" | "passive") => raw[kind]?.map((id: string) => pool[kind].findIndex(skill => skill.id === id))
      return normalizeLoadout(pool, { active: indices("active"), passive: indices("passive"),
        gold: raw.gold === null ? null : pool.gold.findIndex(skill => skill.id === raw.gold) })
    }
    return normalizeLoadout(pool, JSON.parse(localStorage.getItem(storageKey(input)) ?? "null"))
  } catch {
    return normalizeLoadout(pool, null)
  }
}

export function saveLoadout(input: EdgeInputCard, loadout: EdgeLoadout) {
  try {
    const pool = poolForCard(input)
    localStorage.setItem(poolChoiceKey(input), pool.version === 2 ? "curated-v1" : "legacy-v1")
    if (pool.version === 2) {
      localStorage.setItem(curatedStorageKey(input), JSON.stringify({ version: 2,
        active: loadout.active.map(i => pool.active[i].id), passive: loadout.passive.map(i => pool.passive[i].id),
        gold: loadout.gold === null ? null : pool.gold[loadout.gold].id }))
      return
    }
    localStorage.setItem(storageKey(input), JSON.stringify(loadout))
  } catch {
    // The in-memory loadout remains usable if local storage is unavailable.
  }
}
