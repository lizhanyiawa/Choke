import { and, asc, count, desc, eq, getTableColumns, inArray, ne, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import {
  constellationCap,
  expToNext,
  isHeroCardId,
  levelCap,
  meltExpOf,
} from "../../../../src/card/progression"
import {
  FOIL_COST,
  essenceOf,
} from "../../../../src/card/economy"
import type { Rarity } from "../../../../src/card/types"
import { requireSelf } from "../auth/guard"
import { db } from "../db/client"
import { cards, deckSlots, marketListings, userCards, users } from "../db/schema"

const cardColumns = {
  ...getTableColumns(cards),
  userCardId: userCards.id,
  level: userCards.level,
  constellation: userCards.constellation,
  exp: userCards.exp,
  foil: userCards.foil,
  obtainedAt: userCards.obtainedAt,
}

const paramsSchema = z.object({
  userId: z.string(),
  userCardId: z.coerce.number().int().positive(),
})

async function loadCard(userId: string, userCardId: number) {
  const [row] = await db
    .select(cardColumns)
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(and(eq(userCards.userId, userId), eq(userCards.id, userCardId)))
    .limit(1)
  return row ?? null
}

async function loadFuel(userId: string, excludeUserCardId: number) {
  const groups = await db
    .select({ cardId: userCards.cardId })
    .from(userCards)
    .where(eq(userCards.userId, userId))
    .groupBy(userCards.cardId)
    .having(sql`count(*) > 1`)

  const ids = groups.map((group) => group.cardId)
  if (ids.length === 0) return []

  return db
    .select(cardColumns)
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(
      and(
        eq(userCards.userId, userId),
        inArray(userCards.cardId, ids),
        ne(userCards.id, excludeUserCardId),
      ),
    )
    .orderBy(desc(cards.pp), asc(userCards.id))
    .limit(60)
}

export async function progressionRoutes(app: FastifyInstance) {
  /** 可作为熔卡/升命座材料的重复卡 */
  app.get("/users/:userId/cards/:userCardId/fuel", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    const { userCardId } = params
    const target = await loadCard(userId, userCardId)
    if (!target) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "卡不在这个账号的卡册里" },
      })
    }
    return { ok: true, data: { rows: await loadFuel(userId, userCardId) } }
  })

  app.post("/users/:userId/cards/:userCardId/level", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    const { userCardId } = params
    const target = await loadCard(userId, userCardId)
    if (!target) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "卡不在这个账号的卡册里" },
      })
    }

    const hero = isHeroCardId(target.id)
    const cap = levelCap(hero)
    if (target.level >= cap) {
      return reply.code(400).send({
        ok: false,
        error: { code: "max_level", message: "已经满级" },
      })
    }

    const need = expToNext(target.level, target.rarity as Rarity, hero)
    if (target.exp < need) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "not_enough_exp",
          message: `经验不足：${target.exp} / ${need}`,
          need,
          exp: target.exp,
        },
      })
    }

    await db
      .update(userCards)
      .set({ level: target.level + 1, exp: target.exp - need })
      .where(eq(userCards.id, userCardId))

    return {
      ok: true,
      data: { card: await loadCard(userId, userCardId), spent: need },
    }
  })

  app.post("/users/:userId/cards/:userCardId/constellation", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    const { userCardId } = params
    const target = await loadCard(userId, userCardId)
    if (!target) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "卡不在这个账号的卡册里" },
      })
    }

    const hero = isHeroCardId(target.id)
    const cap = constellationCap(hero)
    if (target.constellation >= cap) {
      return reply.code(400).send({
        ok: false,
        error: { code: "max_constellation", message: "已经满命座" },
      })
    }

    const [duplicate] = await db
      .select({ id: userCards.id })
      .from(userCards)
      .where(
        and(
          eq(userCards.userId, userId),
          eq(userCards.cardId, target.id),
          ne(userCards.id, userCardId),
        ),
      )
      .orderBy(asc(userCards.level), asc(userCards.id))
      .limit(1)

    if (!duplicate) {
      return reply.code(400).send({
        ok: false,
        error: { code: "no_duplicate", message: "没有同名卡可以消耗" },
      })
    }

    await db.transaction(async (tx) => {
      await tx.delete(deckSlots).where(eq(deckSlots.userCardId, duplicate.id))
      await tx
        .update(marketListings)
        .set({ status: "cancelled" })
        .where(eq(marketListings.userCardId, duplicate.id))
      await tx.delete(userCards).where(eq(userCards.id, duplicate.id))
      await tx
        .update(userCards)
        .set({ constellation: target.constellation + 1 })
        .where(eq(userCards.id, userCardId))
    })

    return {
      ok: true,
      data: {
        card: await loadCard(userId, userCardId),
        consumedUserCardId: duplicate.id,
      },
    }
  })

  app.post("/users/:userId/cards/:userCardId/melt", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    const { userCardId } = params
    const body = z
      .object({ sourceUserCardId: z.number().int().positive() })
      .parse(request.body)

    const target = await loadCard(userId, userCardId)
    if (!target) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "卡不在这个账号的卡册里" },
      })
    }
    if (body.sourceUserCardId === userCardId) {
      return reply.code(400).send({
        ok: false,
        error: { code: "melt_self", message: "不能把卡熔给它自己" },
      })
    }

    const [source] = await db
      .select({
        id: userCards.id,
        cardId: userCards.cardId,
        rarity: cards.rarity,
        foil: userCards.foil,
      })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(and(eq(userCards.userId, userId), eq(userCards.id, body.sourceUserCardId)))
      .limit(1)

    if (!source) {
      return reply.code(400).send({
        ok: false,
        error: { code: "source_not_found", message: "材料卡不在这个账号的卡册里" },
      })
    }

    const [{ value: copies }] = await db
      .select({ value: count() })
      .from(userCards)
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, source.cardId)))

    if (Number(copies) < 2) {
      return reply.code(400).send({
        ok: false,
        error: { code: "last_copy", message: "这是最后一张，不能熔" },
      })
    }

    const gained = meltExpOf(source.rarity as Rarity)
    const essenceGained = essenceOf(source.rarity as Rarity, source.foil)

    const [wallet] = await db.transaction(async (tx) => {
      await tx.delete(deckSlots).where(eq(deckSlots.userCardId, source.id))
      await tx
        .update(marketListings)
        .set({ status: "cancelled" })
        .where(eq(marketListings.userCardId, source.id))
      await tx.delete(userCards).where(eq(userCards.id, source.id))
      await tx
        .update(userCards)
        .set({ exp: target.exp + gained })
        .where(eq(userCards.id, userCardId))
      return tx
        .update(users)
        .set({ essence: sql`${users.essence} + ${essenceGained}` })
        .where(eq(users.id, userId))
        .returning({ essence: users.essence })
    })

    return {
      ok: true,
      data: {
        card: await loadCard(userId, userCardId),
        gained,
        essenceGained,
        essence: wallet?.essence ?? 0,
        consumedUserCardId: source.id,
      },
    }
  })

  app.post("/users/:userId/cards/:userCardId/enhance", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    const { userCardId } = params
    const body = z
      .object({ action: z.enum(["foil"]) })
      .parse(request.body)

    const target = await loadCard(userId, userCardId)
    if (!target) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "卡不在这个账号的卡册里" },
      })
    }

    if (target.foil) {
      return reply.code(400).send({
        ok: false,
        error: { code: "already_foil", message: "这张卡已经是闪卡" },
      })
    }

    const cost = FOIL_COST
    const [user] = await db
      .select({ essence: users.essence })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user || user.essence < cost) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "not_enough_essence",
          message: `精华不足：${user?.essence ?? 0} / ${cost}`,
          need: cost,
          essence: user?.essence ?? 0,
        },
      })
    }

    const [wallet] = await db.transaction(async (tx) => {
      await tx
        .update(userCards)
        .set({ foil: true })
        .where(eq(userCards.id, userCardId))
      return tx
        .update(users)
        .set({ essence: sql`${users.essence} - ${cost}` })
        .where(eq(users.id, userId))
        .returning({ essence: users.essence })
    })

    return {
      ok: true,
      data: {
        card: await loadCard(userId, userCardId),
        cost,
        essence: wallet?.essence ?? 0,
        action: body.action,
      },
    }
  })
}
