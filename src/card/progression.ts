import type { Rarity } from "./types"

export const LEVEL_CAP = { normal: 80, hero: 12 } as const
export const CONSTELLATION_CAP = { normal: 6, hero: 12 } as const

/** 分解值 × 1.2（设计文档 §6.3） */
export const MELT_EXP: Record<Rarity, number> = {
  C: 5,
  UC: 10,
  R: 24,
  E: 60,
  L: 144,
  Radiant: 360,
  Prismatic: 960,
}

/** lv1 → 满级累计经验（设计文档 §7.1） */
export const LEVEL_EXP_TOTAL: Record<Rarity, number> = {
  C: 2800,
  UC: 4200,
  R: 6200,
  E: 8500,
  L: 13000,
  Radiant: 19000,
  Prismatic: 28000,
}

export function isHeroCardId(id: string): boolean {
  return id.startsWith("hero-")
}

export function levelCap(isHero: boolean): number {
  return isHero ? LEVEL_CAP.hero : LEVEL_CAP.normal
}

export function constellationCap(isHero: boolean): number {
  return isHero ? CONSTELLATION_CAP.hero : CONSTELLATION_CAP.normal
}

/**
 * 1 → 满级的累计经验比例。
 * 普通卡按设计文档的 30% / 35% / 35% 三段分布；本体卡 1–12 线性。
 */
function expFraction(level: number, isHero: boolean): number {
  if (isHero) return (level - 1) / 11
  if (level <= 40) return 0.3 * ((level - 1) / 39)
  if (level <= 60) return 0.3 + 0.35 * ((level - 40) / 20)
  return 0.65 + 0.35 * ((level - 60) / 20)
}

export function totalExpAtLevel(level: number, rarity: Rarity, isHero: boolean): number {
  const cap = levelCap(isHero)
  const clamped = Math.min(Math.max(level, 1), cap)
  return Math.round(LEVEL_EXP_TOTAL[rarity] * expFraction(clamped, isHero))
}

/** 升到下一级还需要的经验；满级为 0 */
export function expToNext(level: number, rarity: Rarity, isHero: boolean): number {
  if (level >= levelCap(isHero)) return 0
  return Math.max(1, totalExpAtLevel(level + 1, rarity, isHero) - totalExpAtLevel(level, rarity, isHero))
}

export function meltExpOf(rarity: Rarity): number {
  return MELT_EXP[rarity]
}
