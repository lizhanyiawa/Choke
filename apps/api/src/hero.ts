import { JOB_ORDER, hashOf, skillsFor } from "../../../src/card/data"
import type { Rarity } from "../../../src/card/types"
import { heroIndex, heroStatsFromOsu } from "../../../src/pool/hero"
import { fanCap, lowerRarity, rankCap } from "../../../src/pool/score"

import type { OsuMe } from "./auth/osu"

export interface PoolCardSeed {
  no: number
  total: number
  globalRank: number | null
  pp: string | null
  rarity: string
}

/**
 * 把 osu! 的 /me/osu 变成本人卡定义。
 * 稀有度取公开池卡；osu! 数据只给个人加成（basis point），不影响稀有度。
 */
export function heroCardDef(
  me: OsuMe,
  pool?: PoolCardSeed | null,
  onboarded = false,
  personalBonusBp = 0,
) {
  const hero = heroIndex(heroStatsFromOsu(me))
  const seed = `${me.id}|${me.username}`
  const job = JOB_ORDER[hashOf(seed) % JOB_ORDER.length]
  const pp = pool?.pp ?? (me.statistics?.pp == null ? null : String(me.statistics.pp))
  const poolRarity = (pool?.rarity as Rarity | undefined) ?? "C"
  const rankLimited = rankCap(pool?.globalRank)
  const fanLimited = fanCap(me.follower_count)
  const cappedByRank = rankLimited ? lowerRarity(poolRarity, rankLimited) : poolRarity
  const rarity = fanLimited ? lowerRarity(cappedByRank, fanLimited) : cappedByRank

  return {
    id: `hero-${me.id}`,
    osuId: null,
    name: me.username,
    rarity,
    job,
    no: pool?.no ?? 1,
    total: pool?.total ?? 1,
    country: me.country_code || null,
    globalRank: pool?.globalRank ?? null,
    pp,
    profileUrl: `https://osu.ppy.sh/users/${me.id}`,
    art: me.avatar_url,
    banner: me.cover?.url ?? null,
    skills: skillsFor(job, rarity, false, String(me.id)),
    version: 1,
    heroBonus: onboarded ? personalBonusBp : -2000,
    heroIndex: hero.index,
    heroPower: hero.power,
  }
}
