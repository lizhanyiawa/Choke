import { JOB_ORDER, hashOf, makeCard, skillsFor } from "@/card/data"
import type { CardFaceData } from "@/card/types"

import type { PoolCard } from "./types"

/** 卡面立绘用头像地址，banner 有才挂。渲染时浏览器自己去拉。 */
export function faceFromPool(card: PoolCard, personal = false): CardFaceData {
  const hero = personal ? card.hero : null
  const rarity = hero?.band ?? card.rarity
  const seed = `${card.osuId}|${card.username}`
  const job = JOB_ORDER[hashOf(seed) % JOB_ORDER.length]
  return makeCard({
    id: personal ? `hero-${card.osuId}` : `pool-${card.osuId}`,
    name: card.username,
    rarity,
    job,
    level: 1,
    mods: [],
    constellation: 0,
    no: card.countryRank ?? 1,
    total: Math.max(card.countrySize, 1),
    isHero: personal,
    art: card.avatarUrl,
    banner: card.coverUrl ?? undefined,
    profileUrl: card.profileUrl,
    country: card.country,
    globalRank: card.globalRank,
    pp: card.pp,
    skills: skillsFor(job, rarity),
  })
}
