import { and, desc, eq, getTableColumns, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { MARKET_MAX_PRICE } from "../../../../src/card/economy"
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
}

const paramsSchema = z.object({ userId: z.string() })
const listingParams = z.object({ userId: z.string(), listingId: z.coerce.number().int().positive() })

async function loadCard(userId: string, userCardId: number) {
  const [row] = await db
    .select(cardColumns)
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(and(eq(userCards.userId, userId), eq(userCards.id, userCardId)))
    .limit(1)
  return row ?? null
}

export async function marketRoutes(app: FastifyInstance) {
  app.get("/market/listings", async () => {
    const rows = await db
      .select({
        listingId: marketListings.id,
        price: marketListings.price,
        sellerId: marketListings.sellerId,
        sellerName: users.username,
        sellerPublicId: users.publicId,
        ...cardColumns,
      })
      .from(marketListings)
      .innerJoin(userCards, eq(userCards.id, marketListings.userCardId))
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .innerJoin(users, eq(users.id, marketListings.sellerId))
      .where(eq(marketListings.status, "active"))
      .orderBy(desc(marketListings.id))
      .limit(80)

    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.listingId,
        price: row.price,
        sellerId: row.sellerId,
        sellerName: row.sellerName,
        sellerPublicId: row.sellerPublicId,
        card: {
          id: row.id,
          name: row.name,
          rarity: row.rarity,
          job: row.job,
          no: row.no,
          total: row.total,
          country: row.country,
          globalRank: row.globalRank,
          pp: row.pp,
          profileUrl: row.profileUrl,
          art: row.art,
          banner: row.banner,
          skills: row.skills,
          version: row.version,
          heroBonus: row.heroBonus,
          userCardId: row.userCardId,
          level: row.level,
          constellation: row.constellation,
          exp: row.exp,
          foil: row.foil,
        },
      })),
    }
  })

  app.get("/users/:userId/market/listings", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const rows = await db
      .select({
        listingId: marketListings.id,
        price: marketListings.price,
        ...cardColumns,
      })
      .from(marketListings)
      .innerJoin(userCards, eq(userCards.id, marketListings.userCardId))
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(and(eq(marketListings.sellerId, userId), eq(marketListings.status, "active")))
      .orderBy(desc(marketListings.id))

    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.listingId,
        price: row.price,
        card: {
          id: row.id,
          name: row.name,
          rarity: row.rarity,
          job: row.job,
          no: row.no,
          total: row.total,
          country: row.country,
          globalRank: row.globalRank,
          pp: row.pp,
          profileUrl: row.profileUrl,
          art: row.art,
          banner: row.banner,
          skills: row.skills,
          version: row.version,
          heroBonus: row.heroBonus,
          userCardId: row.userCardId,
          level: row.level,
          constellation: row.constellation,
          exp: row.exp,
          foil: row.foil,
        },
      })),
    }
  })

  app.post("/users/:userId/market/list", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    const body = z
      .object({
        userCardId: z.number().int().positive(),
        price: z.number().int().min(1).max(MARKET_MAX_PRICE),
      })
      .safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: "bad_request", message: "价格或卡 id 不合法" },
      })
    }

    const card = await loadCard(userId, body.data.userCardId)
    if (!card) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "卡不在这个账号的卡册里" },
      })
    }
    if (card.id.startsWith("hero-")) {
      return reply.code(400).send({
        ok: false,
        error: { code: "hero_not_tradable", message: "本体卡不能上架" },
      })
    }

    const [inDeck] = await db
      .select({ id: deckSlots.userCardId })
      .from(deckSlots)
      .where(and(eq(deckSlots.userId, userId), eq(deckSlots.userCardId, body.data.userCardId)))
      .limit(1)
    if (inDeck) {
      return reply.code(400).send({
        ok: false,
        error: { code: "in_deck", message: "先从卡组里移出再上架" },
      })
    }

    const [listed] = await db
      .select({ id: marketListings.id })
      .from(marketListings)
      .where(
        and(
          eq(marketListings.userCardId, body.data.userCardId),
          eq(marketListings.status, "active"),
        ),
      )
      .limit(1)
    if (listed) {
      return reply.code(400).send({
        ok: false,
        error: { code: "already_listed", message: "这张卡已经在市场里" },
      })
    }

    const [created] = await db
      .insert(marketListings)
      .values({
        sellerId: userId,
        userCardId: body.data.userCardId,
        price: body.data.price,
      })
      .returning()

    return {
      ok: true,
      data: {
        id: created!.id,
        price: created!.price,
        card,
      },
    }
  })

  app.delete("/users/:userId/market/listings/:listingId", async (request, reply) => {
    const params = listingParams.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const removed = await db
      .delete(marketListings)
      .where(
        and(
          eq(marketListings.id, params.listingId),
          eq(marketListings.sellerId, userId),
          eq(marketListings.status, "active"),
        ),
      )
      .returning({ id: marketListings.id })

    if (removed.length === 0) {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "没有这条上架记录" },
      })
    }
    return { ok: true, data: { id: removed[0]!.id } }
  })

  app.post("/users/:userId/market/buy/:listingId", async (request, reply) => {
    const params = listingParams.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const [listing] = await db
      .select({
        id: marketListings.id,
        sellerId: marketListings.sellerId,
        userCardId: marketListings.userCardId,
        price: marketListings.price,
        status: marketListings.status,
      })
      .from(marketListings)
      .where(eq(marketListings.id, params.listingId))
      .limit(1)

    if (!listing || listing.status !== "active") {
      return reply.code(404).send({
        ok: false,
        error: { code: "not_found", message: "这条上架已经不存在" },
      })
    }
    if (listing.sellerId === userId) {
      return reply.code(400).send({
        ok: false,
        error: { code: "own_listing", message: "不能买自己的卡" },
      })
    }

    const [buyer] = await db
      .select({ essence: users.essence })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!buyer || buyer.essence < listing.price) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "not_enough_essence",
          message: `精华不足：${buyer?.essence ?? 0} / ${listing.price}`,
          need: listing.price,
          essence: buyer?.essence ?? 0,
        },
      })
    }

    const [owner] = await db
      .select({ id: userCards.id })
      .from(userCards)
      .where(and(eq(userCards.id, listing.userCardId), eq(userCards.userId, listing.sellerId)))
      .limit(1)
    if (!owner) {
      return reply.code(409).send({
        ok: false,
        error: { code: "card_moved", message: "卖家已经不再持有这张卡" },
      })
    }

    const [wallet] = await db.transaction(async (tx) => {
      const buyerWallet = await tx
        .update(users)
        .set({ essence: sql`${users.essence} - ${listing.price}` })
        .where(eq(users.id, userId))
        .returning({ essence: users.essence })
      await tx
        .update(users)
        .set({ essence: sql`${users.essence} + ${listing.price}` })
        .where(eq(users.id, listing.sellerId))
      await tx.delete(deckSlots).where(eq(deckSlots.userCardId, listing.userCardId))
      await tx
        .update(userCards)
        .set({ userId })
        .where(eq(userCards.id, listing.userCardId))
      await tx
        .update(marketListings)
        .set({ status: "sold" })
        .where(eq(marketListings.id, listing.id))
      return buyerWallet
    })

    return {
      ok: true,
      data: {
        card: await loadCard(userId, listing.userCardId),
        price: listing.price,
        essence: wallet?.essence ?? 0,
      },
    }
  })
}
