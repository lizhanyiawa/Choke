import type { Rarity } from "@/card/types"

import { avatarUrl, profileUrl } from "./art"
import { heroIndex, heroStatsFromOsu, type OsuSelf } from "./hero"
import {
  COUNTRY_FLOORS,
  countryFloor,
  higherRarity,
  quotas,
  RARITY_ORDER,
  sharesFromSeed,
} from "./rarity"
import { capRarity, fanCap, jitterOf, lowerRarity, ppCap, rankCap, scoreOf, type ScoreParts } from "./score"
import type { GradeCounts, MutualifyRow, PoolCard, PoolShares } from "./types"

export const POOL_SEED = 20261106

/**
 * L 及以上最多占总池的 8%。超出的部分从分数最低、且不是国榜下限抬上来的卡开始，
 * 直接降到 E。国榜下限优先，不会被这条压掉。
 */
export const MAX_TOP_SHARE = 0.08

export interface BuildOptions {
  /** 决定占比的那一个数字。不传就用 POOL_SEED。 */
  seed?: number
  /** 上次的库。下架、认领、banner 按 osuId 保留。 */
  previous?: readonly PoolCard[]
  floors?: readonly { maxRank: number; floor: Rarity }[]
}

export interface BuildResult {
  cards: PoolCard[]
  seed: number
  shares: PoolShares
  /** 下限抬档之后的实际张数 */
  assigned: PoolShares
  visible: number
}

interface Working extends MutualifyRow {
  signal: number
  parts: ScoreParts
  countryRank: number | null
  countrySize: number
}

function emptyShares(): PoolShares {
  return { C: 0, UC: 0, R: 0, E: 0, L: 0, Radiant: 0, Prismatic: 0 }
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asGrades(value: unknown): GradeCounts | null {
  if (!value || typeof value !== "object") return null
  const grades = value as Partial<GradeCounts>
  return {
    ssh: grades.ssh ?? 0,
    ss: grades.ss ?? 0,
    sh: grades.sh ?? 0,
    s: grades.s ?? 0,
    a: grades.a ?? 0,
  }
}

/** 同时吃控制台导出的扁平 JSON，和 /api/rankings 的原始 user。 */
export function normalizeMutualify(raw: unknown): MutualifyRow[] {
  if (!Array.isArray(raw)) return []
  const rows: MutualifyRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const osuId = asNumber(row.osuId) ?? asNumber(row.id)
    const username = row.username
    if (osuId == null || typeof username !== "string" || username.length === 0) continue
    const country = row.country ?? row.countryCode
    rows.push({
      osuId,
      username,
      country: typeof country === "string" && country.length > 0 ? country : "XX",
      title: typeof row.title === "string" ? row.title : null,
      followerCount: asNumber(row.followerCount),
      globalRank: asNumber(row.globalRank) ?? asNumber(row.rank),
      rankedSetCount: asNumber(row.rankedSetCount),
      grades: asGrades(row.grades),
      mappingFollowers: asNumber(row.mappingFollowerCount) ?? asNumber(row.mappingFollowers),
      rankedMaps: asNumber(row.rankedMaps),
      guestMaps: asNumber(row.guestMaps),
      lovedMaps: asNumber(row.lovedMaps),
      popularity: asNumber(row.popularity),
      pp: asNumber(row.pp),
      avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : null,
      coverUrl: typeof row.coverUrl === "string" ? row.coverUrl : null,
    })
  }
  return rows
}

function withCountryRank(rows: MutualifyRow[]): Working[] {
  const byCountry = new Map<string, Working[]>()
  const working: Working[] = rows.map((row) => ({
    ...row,
    signal: 0,
    parts: { pp: null, rank: null, fans: null, creation: null },
    countryRank: null,
    countrySize: 0,
  }))
  for (const row of working) {
    const list = byCountry.get(row.country) ?? []
    list.push(row)
    byCountry.set(row.country, list)
  }
  for (const list of byCountry.values()) {
    const ranked = list.filter((row) => row.globalRank != null)
    ranked.sort((a, b) => a.globalRank! - b.globalRank! || (b.followerCount ?? 0) - (a.followerCount ?? 0) || a.osuId - b.osuId)
    ranked.forEach((row, index) => {
      row.countryRank = index + 1
      row.countrySize = ranked.length
    })
  }
  for (const row of working) {
    const scored = scoreOf({
      pp: row.pp,
      globalRank: row.globalRank,
      countryRank: row.countryRank,
      countrySize: row.countrySize,
      followerCount: row.followerCount,
      rankedMaps: row.rankedMaps,
      guestMaps: row.guestMaps,
    })
    row.parts = scored.parts
    row.signal = scored.total + jitterOf(row.osuId)
  }
  return working
}

export function buildPool(raw: unknown, options: BuildOptions = {}): BuildResult {
  const seed = options.seed ?? POOL_SEED
  const floors = options.floors ?? COUNTRY_FLOORS
  const previous = new Map((options.previous ?? []).map((card) => [card.osuId, card]))
  const shares = sharesFromSeed(seed)
  const working = withCountryRank(normalizeMutualify(raw))
  working.sort((a, b) => b.signal - a.signal || a.osuId - b.osuId)

  const slots = quotas(working.length, shares)
  const rarityOf = new Map<number, Rarity>()
  let cursor = 0
  for (const rarity of [...RARITY_ORDER].reverse()) {
    const count = slots[rarity]
    for (let i = 0; i < count && cursor < working.length; i += 1, cursor += 1) {
      rarityOf.set(working[cursor].osuId, rarity)
    }
  }

  const assigned = emptyShares()
  const cards = working.map((row) => {
    const kept = previous.get(row.osuId)
    const rolled = rarityOf.get(row.osuId) ?? "C"
    const capped = capRarity(rolled, row.signal)
    const floor = countryFloor(row.countryRank, row.countrySize, floors)
    const lifted = floor ? higherRarity(capped, floor) : capped
    const harderCap = ppCap(row.pp, row.countryRank)
    const rankLimited = rankCap(row.globalRank)
    const fanLimited = fanCap(row.followerCount)
    const ppLimited = harderCap ? lowerRarity(lifted, harderCap) : lifted
    const rankLimitedRarity = rankLimited ? lowerRarity(ppLimited, rankLimited) : ppLimited
    const rarity = fanLimited ? lowerRarity(rankLimitedRarity, fanLimited) : rankLimitedRarity
    assigned[rarity] += 1
    return {
      osuId: row.osuId,
      username: row.username,
      country: row.country,
      title: row.title,
      followerCount: row.followerCount,
      globalRank: row.globalRank,
      countryRank: row.countryRank,
      countrySize: row.countrySize,
      rankedSetCount: row.rankedSetCount ?? kept?.rankedSetCount ?? null,
      grades: row.grades ?? kept?.grades ?? null,
      mappingFollowers: row.mappingFollowers ?? kept?.mappingFollowers ?? null,
      rankedMaps: row.rankedMaps ?? kept?.rankedMaps ?? null,
      guestMaps: row.guestMaps ?? kept?.guestMaps ?? null,
      lovedMaps: row.lovedMaps ?? kept?.lovedMaps ?? null,
      popularity: row.popularity ?? kept?.popularity ?? null,
      pp: row.pp ?? kept?.pp ?? null,
      signal: row.signal,
      scoreParts: row.parts,
      rarity,
      floor: floor && floor !== capped && higherRarity(floor, capped) === floor ? floor : null,      avatarUrl: row.avatarUrl ?? avatarUrl(row.osuId),
      profileUrl: profileUrl(row.osuId),
      coverUrl: row.coverUrl ?? kept?.coverUrl ?? null,
      hidden: kept?.hidden ?? false,
      claimed: kept?.claimed ?? false,
      hero: kept?.hero ?? null,
    } satisfies PoolCard
  })

  return {
    cards: enforceTopShare(cards, MAX_TOP_SHARE),
    seed,
    shares,
    assigned,
    visible: cards.filter((card) => !card.hidden).length,
  }
}

const TOP_RARITIES = new Set<Rarity>(["L", "Radiant", "Prismatic"])

function enforceTopShare(cards: PoolCard[], maxShare: number): PoolCard[] {
  const limit = Math.floor(cards.length * maxShare)
  let excess = cards.filter((card) => TOP_RARITIES.has(card.rarity)).length - limit
  if (excess <= 0) return cards

  const candidates = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => TOP_RARITIES.has(card.rarity) && card.floor == null)
    .sort((a, b) => a.card.signal - b.card.signal)

  const next = [...cards]
  for (const { index, card } of candidates) {
    if (excess <= 0) break
    next[index] = { ...card, rarity: "E" }
    excess -= 1
  }
  return next
}

export function pullable(cards: readonly PoolCard[]): PoolCard[] {
  return cards.filter((card) => !card.hidden)
}

/** 玩家取消自己的收录。行还在，重新导入不会把人放回来。 */
export function revoke(card: PoolCard): PoolCard {
  return { ...card, hidden: true, claimed: false, hero: null }
}

export function claim(card: PoolCard, user: OsuSelf): PoolCard {
  const stats = heroStatsFromOsu(user)
  return {
    ...card,
    username: user.username || card.username,
    claimed: true,
    hidden: false,
    coverUrl: user.cover?.url || card.coverUrl,
    rankedSetCount: stats.rankedSetCount ?? card.rankedSetCount,
    grades: stats.grades ?? card.grades,
    hero: heroIndex(stats),
  }
}
