import { JOB_ORDER, hashOf, skillsFor } from "../../../src/card/data"
import { heroIndex, heroStatsFromOsu } from "../../../src/pool/hero"

import type { OsuMe } from "./auth/osu"

export interface PoolCardSeed {
  no: number
  total: number
  globalRank: number | null
  pp: string | null
}

/**
 * 把 osu! 的 /me/osu 变成本人卡定义。
 * 本人卡与池卡共用卡面公式，但 id 用 hero-{osuId}，且不占用 cards.osu_id 唯一键。
 */
export function heroCardDef(me: OsuMe, pool?: PoolCardSeed | null) {
  const hero = heroIndex(heroStatsFromOsu(me))
  const seed = `${me.id}|${me.username}`
  const job = JOB_ORDER[hashOf(seed) % JOB_ORDER.length]
  const pp = pool?.pp ?? (me.statistics?.pp == null ? null : String(me.statistics.pp))

  return {
    id: `hero-${me.id}`,
    osuId: null,
    name: me.username,
    rarity: hero.band,
    job,
    no: pool?.no ?? 1,
    total: pool?.total ?? 1,
    country: me.country_code || null,
    globalRank: pool?.globalRank ?? null,
    pp,
    profileUrl: `https://osu.ppy.sh/users/${me.id}`,
    art: me.avatar_url,
    banner: me.cover?.url ?? null,
    skills: skillsFor(job, hero.band),
    version: 1,
    heroIndex: hero.index,
    heroPower: hero.power,
  }
}
