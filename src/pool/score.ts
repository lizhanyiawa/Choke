import type { Rarity } from "@/card/types"

/**
 * 稀有度打分。五项各自 0–100，加权求和。
 * 缺项时按剩余权重重新归一化，所以只有排行榜数据时也不会被系统性压低。
 */
export interface ScoreInput {
  pp?: number | null
  globalRank?: number | null
  countryRank?: number | null
  countrySize?: number | null
  followerCount?: number | null
  /** ranked / qualified 谱面集数量，作图总量 */
  rankedMaps?: number | null
  /** guest difficulty 数量 */
  guestMaps?: number | null
}

export interface ScoreParts {
  pp: number | null
  rank: number | null
  fans: number | null
  /** 谱面 + GD 合成一项，只做附加分 */
  creation: number | null
}

export interface ScoreResult {
  total: number
  parts: ScoreParts
}

/**
 * pp 降权，排名升权；创作分合并成一项，只做附加分。
 */
export const WEIGHTS = {
  pp: 30,
  rank: 38,
  fans: 24,
  creation: 8,
} as const

/** 高分档的门槛：分数不够就不给这一档 */
export const RARITY_MIN_SCORE: Record<Rarity, number> = {
  C: 0,
  UC: 25,
  R: 38,
  E: 52,
  L: 65,
  Radiant: 75,
  Prismatic: 85,
}

/**
 * 国内前列但 pp 不够的人，最高只能到 L。
 * 这条压过国榜下限，是硬上限。
 */
export const PP_CAP = {
  maxPp: 8000,
  maxCountryRank: 10,
  rarity: "L" as Rarity,
}

const RARITY_ORDER: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

/** pp：2000 以下压平，往上按 log 拉开，9600 ≈ 86，13000 ≈ 100 */
export function ppScore(pp: number | null | undefined): number | null {
  if (pp == null || pp <= 0) return null
  if (pp < 2000) return clamp((15 * Math.log10(1 + pp)) / Math.log10(2001))
  const t = (Math.log10(pp) - Math.log10(2000)) / (Math.log10(13000) - Math.log10(2000))
  return clamp(15 + 85 * t)
}

/**
 * 粉丝：100 / 300 / 500 / 1000 是档位边界，档内线性，档间留 15–20 分台阶。
 * 1000 以上继续用 log 涨，10000 ≈ 100。
 */
export function fanScore(followers: number | null | undefined): number | null {
  if (followers == null || followers < 0) return null
  if (followers >= 1000) return clamp(75 + 25 * Math.log10(followers / 1000))
  if (followers >= 500) return 55 + 20 * ((followers - 500) / 500)
  if (followers >= 300) return 40 + 15 * ((followers - 300) / 200)
  if (followers >= 100) return 20 + 20 * ((followers - 100) / 200)
  return clamp((20 * Math.log10(1 + followers)) / Math.log10(101))
}

/** GD：无 0，1–2 起步 30，3–4 是 60 档，5+ 是 90 档 */
export function gdScore(gd: number | null | undefined): number | null {
  if (gd == null || gd < 0) return null
  if (gd >= 5) return clamp(90 + (gd - 5) * 2)
  if (gd >= 3) return 60 + (gd - 3) * 15
  if (gd >= 1) return 30 + (gd - 1) * 15
  return 0
}

/** 作图总量：只做小幅加分，10 张 ≈ 30，100 张 ≈ 60，500 张 ≈ 90 */
export function mapScore(maps: number | null | undefined): number | null {
  if (maps == null || maps < 0) return null
  if (maps === 0) return 0
  return clamp((100 * Math.log10(1 + maps)) / Math.log10(501))
}

/**
 * 创作分：谱面数量和 GD 数量合成一项，GD 权重 1.5 倍。
 * 两项都没有时返回 null，不参与归一化。
 */
export function creationScore(
  rankedMaps: number | null | undefined,
  guestMaps: number | null | undefined,
): number | null {
  if (rankedMaps == null && guestMaps == null) return null
  const maps = Math.max(0, rankedMaps ?? 0)
  const gd = Math.max(0, guestMaps ?? 0)
  const total = maps + gd * 1.5
  if (total <= 0) return 0
  return clamp((100 * Math.log10(1 + total)) / Math.log10(501))
}

/** 国家规模越小，国内名次的含金量越低 */
export function countryFactor(size: number | null | undefined): number {
  if (size == null) return 0.4
  if (size >= 1000) return 1
  if (size >= 500) return 0.85
  if (size >= 200) return 0.7
  if (size >= 50) return 0.55
  return 0.4
}

/** 世界排名只做上限，不直接给分 */
function worldCeiling(rank: number): number {
  if (rank <= 10) return 100
  if (rank <= 50) return 95
  if (rank <= 100) return 90
  if (rank <= 500) return 82
  if (rank <= 1000) return 74
  if (rank <= 2000) return 66
  if (rank <= 5000) return 56
  if (rank <= 10000) return 46
  if (rank <= 20000) return 36
  if (rank <= 50000) return 26
  if (rank <= 100000) return 16
  return 8
}

/** 国内排名给基准分，越大国分得越细 */
function countryRankScore(rank: number): number {
  if (rank <= 5) return 100
  if (rank <= 10) return 92
  if (rank <= 20) return 84
  if (rank <= 50) return 76
  if (rank <= 100) return 68
  if (rank <= 300) return 60
  if (rank <= 500) return 52
  if (rank <= 1000) return 44
  if (rank <= 1500) return 36
  if (rank <= 2000) return 28
  if (rank <= 5000) return 18
  return 8
}

/**
 * 国内排名保底，世界排名封顶：
 *
 *   基准 = 国内分 × 国家系数
 *   上限 = 世界分档
 *   排名分 = min(基准, 上限)
 *
 * 小国第 1 会被国家系数和世界上限一起压住；大国第 500 仍然有 52 分。
 */
export function rankScore(
  globalRank: number | null | undefined,
  countryRank: number | null | undefined,
  countrySize: number | null | undefined,
): number | null {
  if (globalRank == null && countryRank == null) return null
  if (countryRank == null) return worldCeiling(globalRank!)
  const local = countryRankScore(countryRank) * countryFactor(countrySize)
  if (globalRank == null) return clamp(local)
  return clamp(Math.min(local, worldCeiling(globalRank)))
}

export function scoreOf(input: ScoreInput): ScoreResult {
  const parts: ScoreParts = {
    pp: ppScore(input.pp),
    rank: rankScore(input.globalRank, input.countryRank, input.countrySize),
    fans: fanScore(input.followerCount),
    creation: creationScore(input.rankedMaps, input.guestMaps),
  }

  let weighted = 0
  let weightSum = 0
  for (const key of ["pp", "rank", "fans", "creation"] as const) {
    const value = parts[key]
    if (value == null) continue
    weighted += value * WEIGHTS[key]
    weightSum += WEIGHTS[key]
  }

  return {
    total: weightSum === 0 ? 0 : Math.round((weighted / weightSum) * 10) / 10,
    parts,
  }
}

/** 确定性抖动，让档位边界附近的人散开，同一玩家每次结果相同 */
export function jitterOf(osuId: number, amount = 1.5): number {
  let h = osuId >>> 0
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967296 - 0.5) * 2 * amount
}

/** 分数不够就往下压一档，直到够门槛或到 C */
export function capRarity(rarity: Rarity, score: number): Rarity {
  let index = RARITY_ORDER.indexOf(rarity)
  while (index > 0 && score < RARITY_MIN_SCORE[RARITY_ORDER[index]]) index -= 1
  return RARITY_ORDER[index]
}

/** 取较低的那一档 */
export function lowerRarity(a: Rarity, b: Rarity): Rarity {
  return RARITY_ORDER.indexOf(a) <= RARITY_ORDER.indexOf(b) ? a : b
}

/**
 * 国内前 10 且 pp ≤ 8000 的人不能进 Radiant 及以上。
 * 这是硬上限，优先于国榜下限。
 */
export function ppCap(
  pp: number | null | undefined,
  countryRank: number | null | undefined,
): Rarity | null {
  if (pp == null || countryRank == null) return null
  if (countryRank <= PP_CAP.maxCountryRank && pp <= PP_CAP.maxPp) return PP_CAP.rarity
  return null
}

/**
 * 世界排名 5000 之后最多 Epic。
 * 公开榜单数据里没有稳定的粉丝数时，这是防止“纯排名”把冷门高排名玩家抬得过高。
 */
export const RANK_CAP = { maxRank: 5000, rarity: "E" as Rarity }

export function rankCap(globalRank: number | null | undefined): Rarity | null {
  if (globalRank == null) return null
  return globalRank > RANK_CAP.maxRank ? RANK_CAP.rarity : null
}

/**
 * 粉丝数少于 500 的玩家最高 Epic。
 * 好友/粉丝数未知时返回 null，不做额外惩罚。
 */
export const FAN_CAP = { minFollowers: 500, rarity: "E" as Rarity }

export function fanCap(followers: number | null | undefined): Rarity | null {
  if (followers == null) return null
  return followers < FAN_CAP.minFollowers ? FAN_CAP.rarity : null
}
