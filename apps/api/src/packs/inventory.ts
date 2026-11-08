import { and, eq, gt, sql } from "drizzle-orm"

import { db } from "../db/client"
import { userPacks } from "../db/schema"

export const PACK_POOLS = [
  "normal",
  "idle",
  "golden",
  "radiant",
  "sky",
  "prism",
  "mystery",
] as const

export type PackPoolId = (typeof PACK_POOLS)[number]

export type PackCounts = Record<PackPoolId, number>

export async function getPackCounts(userId: string): Promise<PackCounts> {
  const rows = await db
    .select({ pool: userPacks.pool, count: userPacks.count })
    .from(userPacks)
    .where(eq(userPacks.userId, userId))

  const counts = Object.fromEntries(PACK_POOLS.map((pool) => [pool, 0])) as PackCounts
  for (const row of rows) {
    if (row.pool in counts) counts[row.pool as PackPoolId] = row.count
  }
  return counts
}

export async function addPacks(
  userId: string,
  grants: Partial<Record<PackPoolId, number>>,
): Promise<void> {
  for (const [pool, count] of Object.entries(grants)) {
    if (!count || count <= 0) continue
    await db
      .insert(userPacks)
      .values({ userId, pool, count })
      .onConflictDoUpdate({
        target: [userPacks.userId, userPacks.pool],
        set: { count: sql`${userPacks.count} + ${count}` },
      })
  }
}

export async function consumePack(userId: string, pool: PackPoolId): Promise<boolean> {
  const updated = await db
    .update(userPacks)
    .set({ count: sql`${userPacks.count} - 1` })
    .where(and(eq(userPacks.userId, userId), eq(userPacks.pool, pool), gt(userPacks.count, 0)))
    .returning({ count: userPacks.count })
  return updated.length > 0
}

/** 新号 OOBE 完成时发放：30 新手包 + 1 神秘卡包 */
export async function grantStarterPacks(userId: string): Promise<void> {
  await addPacks(userId, { normal: 30, mystery: 1 })
}
