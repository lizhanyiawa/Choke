import type { Rarity } from "@/card/types"

/** osu! 成绩等级。Mutualify 没有这份数据，认领后从 /me 填入。 */
export interface GradeCounts {
  ssh: number
  ss: number
  sh: number
  s: number
  a: number
}

/** Mutualify 公开排行榜的一行。ranked set / 等级是可选确认项。 */
export interface MutualifyRow {
  osuId: number
  username: string
  country: string
  title: string | null
  followerCount: number
  /** 全球排名；没有排名则为 null，不参与国榜下限 */
  globalRank: number | null
  /** ranked 谱面数量。未知时不要填 0，留空表示「还没确认」。 */
  rankedSetCount?: number | null
  grades?: GradeCounts | null
  /** 关注该玩家谱面的人（mapping subscribers） */
  mappingFollowers?: number | null
  /** 作图的 ranked / guest / loved 谱面数 */
  rankedMaps?: number | null
  guestMaps?: number | null
  lovedMaps?: number | null
  /** 站点自己的热度分，有就用 */
  popularity?: number | null
  pp?: number | null
  /** 数据源已经带了地址就直接用，别再拼 */
  avatarUrl?: string | null
  coverUrl?: string | null
}

export interface HeroIndex {
  /** 由 PC、TTH、等级、成就等合成，只用于本人卡 */
  index: number
  /** 设计约束：初始强度落在 UC–L */
  band: "UC" | "R" | "E" | "L"
  /** 对应品质基础值上的强度，不是卡池抽卡权重 */
  power: number
}

export interface PoolCard {
  osuId: number
  username: string
  country: string
  title: string | null
  followerCount: number
  globalRank: number | null
  /** 在本次导入的同国有排名玩家中的名次，1 为最高。无全球排名则为 null。 */
  countryRank: number | null
  countrySize: number
  rankedSetCount: number | null
  grades: GradeCounts | null
  mappingFollowers: number | null
  rankedMaps: number | null
  guestMaps: number | null
  lovedMaps: number | null
  popularity: number | null
  pp: number | null
  signal: number
  rarity: Rarity
  /** 国榜下限实际抬上去的档；没触发则为 null */
  floor: Rarity | null
  avatarUrl: string
  profileUrl: string
  /** banner 地址带哈希，只有认领后才有。没有就不要请求。 */
  coverUrl: string | null
  hidden: boolean
  claimed: boolean
  hero: HeroIndex | null
}

export interface PoolShares {
  C: number
  UC: number
  R: number
  E: number
  L: number
  Radiant: number
  Prismatic: number
}
