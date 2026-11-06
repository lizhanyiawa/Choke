import type { Rarity } from "@/card/types"

import type { GradeCounts, MutualifyRow, PoolShares } from "./types"

export const RARITY_ORDER = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"] as const

/**
 * 基础卡池目标占比。一个 seed 只在这附近抖动，不改档位数。
 * 国榜下限会把一部分人抬上去，最终占比可以高于这里。
 */
export const BASE_SHARE: PoolShares = {
  C: 0.46,
  UC: 0.24,
  R: 0.14,
  E: 0.09,
  L: 0.045,
  Radiant: 0.02,
  Prismatic: 0.005,
}

/**
 * 全国前 N 名的稀有度下限。国家人数少于 N 时这一档不生效，
 * 避免 3 人小国整国变成 Radiant。
 */
export const COUNTRY_FLOORS: { maxRank: number; floor: Rarity }[] = [
  { maxRank: 10, floor: "Radiant" },
  { maxRank: 50, floor: "L" },
  { maxRank: 200, floor: "E" },
  { maxRank: 1000, floor: "R" },
]

const RANK: Record<Rarity, number> = {
  C: 0,
  UC: 1,
  R: 2,
  E: 3,
  L: 4,
  Radiant: 5,
  Prismatic: 6,
}

export function higherRarity(a: Rarity, b: Rarity): Rarity {
  return RANK[a] >= RANK[b] ? a : b
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 由一个整数决定本次导入的占比。换 seed 会重洗落档，下限规则不变。 */
export function sharesFromSeed(seed: number, base: PoolShares = BASE_SHARE): PoolShares {
  const rand = mulberry32(seed)
  const next = {} as PoolShares
  let sum = 0
  for (const rarity of RARITY_ORDER) {
    if (rarity === "C") continue
    const value = base[rarity] * (0.9 + rand() * 0.2)
    next[rarity] = value
    sum += value
  }
  if (sum > 0.95) {
    const scale = 0.95 / sum
    for (const rarity of RARITY_ORDER) {
      if (rarity === "C") continue
      next[rarity] *= scale
    }
    sum = 0.95
  }
  next.C = 1 - sum
  return next
}

export function quotas(total: number, shares: PoolShares): PoolShares {
  const rows = RARITY_ORDER.map((rarity) => {
    const exact = shares[rarity] * total
    return { rarity, exact, count: Math.floor(exact) }
  })
  let used = rows.reduce((sum, row) => sum + row.count, 0)
  const byFraction = [...rows].sort((a, b) => b.exact - b.count - (a.exact - a.count))
  for (const row of byFraction) {
    if (used >= total) break
    row.count += 1
    used += 1
  }
  return {
    C: rows[0].count,
    UC: rows[1].count,
    R: rows[2].count,
    E: rows[3].count,
    L: rows[4].count,
    Radiant: rows[5].count,
    Prismatic: rows[6].count,
  }
}

function log10p(value: number): number {
  return Math.log10(1 + Math.max(0, value))
}

export function gradePoints(grades: GradeCounts): number {
  return grades.ssh * 1.2 + grades.ss + grades.sh * 0.7 + grades.s * 0.55 + grades.a * 0.2
}

/**
 * 确认稀有程度的信号。粉丝数始终在。
 * mapping followers / ranked set / 等级 / pp 只有已知时才加分，未知不加不扣。
 */
export function signalOf(
  row: Pick<
    MutualifyRow,
    | "followerCount"
    | "rankedSetCount"
    | "grades"
    | "mappingFollowers"
    | "rankedMaps"
    | "guestMaps"
    | "lovedMaps"
    | "popularity"
    | "pp"
  >,
): number {
  let signal = 100 * log10p(row.followerCount)
  signal += 60 * log10p(row.mappingFollowers ?? 0)
  signal +=
    40 * log10p((row.rankedMaps ?? 0) + (row.guestMaps ?? 0) + (row.lovedMaps ?? 0))
  signal += 20 * log10p(row.popularity ?? 0)
  signal += 10 * log10p(row.pp ?? 0)
  if (row.rankedSetCount != null && row.rankedSetCount > 0) {
    signal += 40 * log10p(row.rankedSetCount)
  }
  if (row.grades) signal += 12 * log10p(gradePoints(row.grades))
  return signal
}

export function countryFloor(
  countryRank: number | null,
  countrySize: number,
  floors: readonly { maxRank: number; floor: Rarity }[] = COUNTRY_FLOORS,
): Rarity | null {
  if (countryRank == null) return null
  let floor: Rarity | null = null
  for (const rule of floors) {
    if (countrySize < rule.maxRank) continue
    if (countryRank > rule.maxRank) continue
    floor = floor == null ? rule.floor : higherRarity(floor, rule.floor)
  }
  return floor
}
