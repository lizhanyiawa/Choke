import { and, eq, notLike } from "drizzle-orm"

import { db } from "../db/client"
import { cards, packOpenings, pity, userCards } from "../db/schema"
import { PITY_RARITY, PITY_THRESHOLD, mulberry32, rollRarity, type PoolId } from "./pools"

const RANK: Record<string, number> = {
  C: 0,
  UC: 1,
  R: 2,
  E: 3,
  L: 4,
  Radiant: 5,
  Prismatic: 6,
}

const idCache = new Map<string, string[]>()

async function idsFor(rarity: string): Promise<string[]> {
  const cached = idCache.get(rarity)
  if (cached) return cached
  // 本体卡 hero-* 是登录后写入的实例卡，不属于公共卡池
  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.rarity, rarity), notLike(cards.id, "hero-%")))
  const ids = rows.map((row) => row.id)
  idCache.set(rarity, ids)
  return ids
}

export interface DrawnCard {
  cardId: string
  rarity: string
  fromPity: boolean
  /** user_cards 实例 id，用于把这张卡直接拖进卡组 */
  userCardId: number
}

export async function openPack(userId: string, pool: PoolId, count = 5) {
  const seed = Math.floor(Math.random() * 2 ** 32)
  const random = mulberry32(seed)

  // PGlite 是单连接：事务内再查 cards 会死锁，先把各档 id 取到内存
  const pools = new Map<string, string[]>()
  for (const rarity of ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]) {
    pools.set(rarity, await idsFor(rarity))
  }

  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(pity)
      .where(and(eq(pity.userId, userId), eq(pity.pool, pool)))
    let counter = current[0]?.counter ?? 0
    const before = counter

    const results: DrawnCard[] = []

    for (let i = 0; i < count; i += 1) {
      counter += 1
      let rarity = rollRarity(pool, random)
      let fromPity = false

      if (RANK[rarity] < RANK[PITY_RARITY] && counter >= PITY_THRESHOLD) {
        rarity = PITY_RARITY
        fromPity = true
      }

      if (RANK[rarity] >= RANK[PITY_RARITY]) counter = 0

      const ids = pools.get(rarity) ?? []
      if (ids.length === 0) {
        throw new Error(`卡池里没有 ${rarity} 档的卡，先导入卡定义`)
      }
      const cardId = ids[Math.floor(random() * ids.length)]!

      const [inserted] = await tx
        .insert(userCards)
        .values({ userId, cardId })
        .returning({ id: userCards.id })
      results.push({ cardId, rarity, fromPity, userCardId: inserted!.id })
    }

    await tx
      .insert(pity)
      .values({ userId, pool, counter })
      .onConflictDoUpdate({
        target: [pity.userId, pity.pool],
        set: { counter },
      })

    await tx.insert(packOpenings).values({
      userId,
      pool,
      count,
      seed: String(seed),
      results,
      pityBefore: before,
      pityAfter: counter,
    })

    return {
      seed,
      results,
      pity: { before, after: counter },
    }
  })
}

export function invalidateCardCache() {
  idCache.clear()
}
