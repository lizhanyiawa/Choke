import type { Rarity } from "./types"

/** 分解一张卡得到的基础精华。闪卡 ×3。 */
export const ESSENCE_OF: Record<Rarity, number> = {
  C: 1,
  UC: 2,
  R: 4,
  E: 8,
  L: 16,
  Radiant: 32,
  Prismatic: 64,
}

export function essenceOf(rarity: Rarity, foil = false): number {
  return ESSENCE_OF[rarity] * (foil ? 3 : 1)
}

/** 精华镀闪：给已有卡加闪卡外观。精华只能用于闪卡。 */
export const FOIL_COST = 50

/** 市场单卡价格上限（金币） */
export const MARKET_MAX_PRICE = 100000
