import { JOB_ORDER, hashOf, makeCard, skillsFor } from "@/card/data"
import type { CardFaceData } from "@/card/types"

import type { CardData } from "./types"

/** 把桌面原型里的极简 CardData 补成一张完整卡面；同一张卡结果恒定 */
export function cardFromDesk(card: CardData): CardFaceData {
  const seed = `${card.name}|${card.mapper}|${card.rarity}`
  const h = hashOf(seed)
  const job = JOB_ORDER[h % JOB_ORDER.length]
  const isHero = !!card.isHero
  const level = 1
  const constellation = 0
  const mods: CardFaceData["mods"] = []

  return makeCard({
    id: `desk-${seed}`,
    name: isHero ? "No.1" : card.mapper,
    rarity: card.rarity,
    job,
    level,
    mods,
    constellation,
    no: 1 + (h % 100000),
    total: 100000,
    isHero,
    foil: card.foil,
    art: card.art,
    banner: card.banner,
    skills: skillsFor(job, card.rarity, (h % 3) === 0, seed),
  })
}
