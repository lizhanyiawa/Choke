import { JOB_ORDER, hashOf, makeCard, skillsFor } from "@/card/data"
import type { CardFaceData } from "@/card/types"

import type { CardData } from "./types"

/** 优先使用服务端完整卡面；仅旧存档与本地原型卡使用恒定的补全结果。 */
export function cardFromDesk(card: CardData): CardFaceData {
  if (card.face) return card.face

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
