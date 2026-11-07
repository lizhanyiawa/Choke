import { CONSTELLATION_BONUS, RARITY_BASE } from "@/card/data"
import {
  ARCHETYPE_COEF,
  POISE_COEF,
  skillDefsFor,
  skillSeed,
  subjobFor,
  type SkillDef,
  type SubJob,
} from "@/card/jobs"
import type { CardFaceData, Job, Rarity } from "@/card/types"

export interface BattleStats {
  hpMax: number
  hp: number
  atk: number
  def: number
  int: number
  poiseMax: number
  poise: number
  hit: number
  crit: number
}

export interface StatusEffect {
  id: string
  name: string
  stat?: "atk" | "int" | "def"
  amount: number
  turns: number
}

export interface BattleCard {
  uid: number
  cardId: string
  name: string
  job: Job
  subjob: SubJob
  rarity: Rarity
  level: number
  constellation: number
  art?: string
  stats: BattleStats
  skills: SkillDef[]
  acted: boolean
  down: boolean
  usedOnce: string[]
  statuses: StatusEffect[]
  taunt: boolean
}

export type IntentKind = "attack" | "magic" | "heavy" | "debuff" | "buff"

export interface EnemyIntent {
  id: string
  kind: IntentKind
  label: string
  element: string
  power: number
  hits: number
}

export interface Enemy {
  name: string
  element: string
  hp: number
  hpMax: number
  atk: number
  int: number
  def: number
  intents: EnemyIntent[]
  statuses: StatusEffect[]
  stun: number
  buff: number
}

export interface SupportUnit {
  id: string
  name: string
  element: string
  atk: number
  power: number
  hits: number
}

export type BattlePhase = "player" | "won" | "lost"

export interface BattleState {
  turn: number
  phase: BattlePhase
  ap: number
  apMax: number
  combo: number
  defenseTier: number
  cards: BattleCard[]
  supports: SupportUnit[]
  enemy: Enemy
  log: string[]
  selectedCard: number | null
}

function heroLevelFactor(level: number): number {
  const lv = Math.min(Math.max(level, 1), 12)
  return lv <= 6 ? 1 + 0.03 * (lv - 1) : 1.18 * 1.2 ** (lv - 6)
}

function basePower(face: CardFaceData): number {
  if (face.isHero) return 400 * heroLevelFactor(face.level)
  const levelFactor = 1 + 0.06 * (Math.max(face.level, 1) - 1)
  const starFactor = 1 + CONSTELLATION_BONUS[face.rarity] * face.constellation
  return RARITY_BASE[face.rarity] * levelFactor * starFactor
}

export function statsFor(face: CardFaceData, subjob: SubJob): BattleStats {
  const base = basePower(face)
  const scaled = base * ARCHETYPE_COEF[face.job]
  const poiseMax = Math.round(base * POISE_COEF[face.job])
  const hpMax = Math.round(scaled * subjob.hp)
  return {
    hpMax,
    hp: hpMax,
    atk: Math.round(scaled * subjob.atk),
    def: Math.round(scaled * subjob.def),
    int: Math.round(scaled * subjob.int),
    poiseMax,
    poise: poiseMax,
    hit: 95 + (subjob.tags.includes("swift") ? 5 : 0),
    crit: 5,
  }
}

export function createBattleCard(face: CardFaceData, uid: number, cardId: string): BattleCard {
  const seed = skillSeed(face.id)
  const subjob = subjobFor(seed, face.job)
  return {
    uid,
    cardId,
    name: face.name,
    job: face.job,
    subjob,
    rarity: face.rarity,
    level: face.level,
    constellation: face.constellation,
    art: face.art,
    stats: statsFor(face, subjob),
    skills: skillDefsFor(seed, face.job, face.rarity),
    acted: false,
    down: false,
    usedOnce: [],
    statuses: [],
    taunt: false,
  }
}

export function teamHp(cards: BattleCard[]): { hp: number; max: number } {
  return cards.reduce(
    (sum, card) => ({ hp: sum.hp + Math.max(0, card.stats.hp), max: sum.max + card.stats.hpMax }),
    { hp: 0, max: 0 },
  )
}
