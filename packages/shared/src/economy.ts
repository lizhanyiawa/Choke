import { CONTENT } from "./content"
import { refundExpOf } from "./progression"
import type { Rarity } from "./types"

/** 数值在 content/economy.json */
const ECONOMY = CONTENT.economy

/** 闪卡分解 / 被喂掉时的精华基数。非闪卡不产精华。 */
export const ESSENCE_OF: Record<Rarity, number> = ECONOMY.foilEssence

export function essenceOf(rarity: Rarity, foil = false): number {
  return foil ? ESSENCE_OF[rarity] * ECONOMY.foilEssenceMultiplier : 0
}

/** 精华镀闪：给已有卡加闪卡外观。精华只能用于闪卡。 */
export const FOIL_COST = ECONOMY.foilCost

/** 市场单卡价格上限（金币） */
export const MARKET_MAX_PRICE = ECONOMY.marketMaxPrice

/** NPC 回收单价（v0.3 §8.2） */
export const NPC_RECYCLE_PRICES: Record<Rarity, number> = {
  C: 2,
  UC: 5,
  R: 12,
  E: 30,
  L: 75,
  Mythic: 180,
  Prismatic: 450,
}

export const NPC_RECYCLE_DAILY_LIMIT = 20
export const NPC_RECYCLE_EXP_DIVISOR = 1000

export function npcRecyclePrice(rarity: Rarity): number {
  return NPC_RECYCLE_PRICES[rarity]
}

/** 培养过的卡按返还经验每 1,000 点额外 +1 金币（克制系数，防套利） */
export function npcRecycleValue(rarity: Rarity, level: number, exp: number, isHero: boolean): number {
  const base = NPC_RECYCLE_PRICES[rarity]
  const expBonus = Math.floor(refundExpOf(level, exp, rarity, isHero) / NPC_RECYCLE_EXP_DIVISOR)
  return base + expBonus
}

/** 市场税率与规则（v0.3 §8.1 + 押金防乱挂） */
export const MARKET_LIST_TAX_RATE = 0.02
export const MARKET_DEPOSIT_RATE = 0.05
export const MARKET_TRADE_TAX_RATE = 0.05
export const MARKET_LISTING_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MARKET_PRICE_BAND_RATIO = 0.4

/** 确认价格时的两笔预扣，和服务端实际结算使用同一套舍入规则。 */
export function marketListingFees(price: number) {
  const listTax = Math.max(1, Math.floor(price * MARKET_LIST_TAX_RATE))
  const deposit = Math.max(1, Math.floor(price * MARKET_DEPOSIT_RATE))
  return { listTax, deposit, upfrontTotal: listTax + deposit }
}
