import { and, asc, count, desc, eq, getTableColumns, gte, ilike, sql, type SQL } from "drizzle-orm"
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
const browseParams = z.object({
  q: z.string().trim().max(100).optional(),
  rarity: z.enum(["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]).optional(),
  sort: z.enum(["recent", "price-asc", "price-desc"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(80).default(24),
  offset: z.coerce.number().int().min(0).max(2_147_483_647).default(0),
})

async function loadCard(connection: Pick<typeof db, "select">, userId: string, userCardId: number) {
  const [row] = await connection
    .select(cardColumns)
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(and(eq(userCards.userId, userId), eq(userCards.id, userCardId)))
    .limit(1)
    .for("update", { of: userCards })
  return row ?? null
}

function marketError(status: number, code: string, message: string) {
  return { ok: false as const, status, error: { code, message } }
}

const listedCard = and(
  eq(userCards.id, marketListings.userCardId),
  eq(userCards.userId, marketListings.sellerId),
)

async function readListings(where: SQL | undefined, order: SQL[], limit: number, offset = 0) {
  const rows = await db.select({
    listingId: marketListings.id,
    price: marketListings.price,
    sellerId: marketListings.sellerId,
    sellerName: users.username,
    sellerPublicId: users.publicId,
    ...cardColumns,
  })
    .from(marketListings)
    .innerJoin(userCards, listedCard)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .innerJoin(users, eq(users.id, marketListings.sellerId))
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset)

  return rows.map((row) => ({
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
  }))
}

export async function marketRoutes(app: FastifyInstance) {
  app.get("/market/listings", async () => ({
    ok: true,
    data: await readListings(eq(marketListings.status, "active"), [desc(marketListings.id)], 80),
  }))

  app.get("/market/search", async (request, reply) => {
    const query = browseParams.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: "bad_request", message: "市场筛选无效" },
      })
    }
    const { q, rarity, sort, limit, offset } = query.data
    const where = and(
      eq(marketListings.status, "active"),
      q ? ilike(cards.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
      rarity ? eq(cards.rarity, rarity) : undefined,
    )
    const order = [desc(marketListings.id)]
    if (sort === "price-asc") order.unshift(asc(marketListings.price))
    if (sort === "price-desc") order.unshift(desc(marketListings.price))

    const [rows, totals] = await Promise.all([
      readListings(where, order, limit, offset),
      db.select({ total: count() })
        .from(marketListings)
        .innerJoin(userCards, listedCard)
        .innerJoin(cards, eq(cards.id, userCards.cardId))
        .innerJoin(users, eq(users.id, marketListings.sellerId))
        .where(where),
    ])
    return { ok: true, data: { rows, total: totals[0]?.total ?? 0 } }
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
      .innerJoin(userCards, listedCard)
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

    const { userCardId, price } = body.data
    const outcome = await db.transaction(async (tx) => {
      const card = await loadCard(tx, userId, userCardId)
      if (!card) return marketError(404, "not_found", "卡不在这个账号的卡册里")
      if (card.id.startsWith("hero-")) return marketError(400, "hero_not_tradable", "本体卡不能上架")

      const [inDeck] = await tx
        .select({ id: deckSlots.userCardId })
        .from(deckSlots)
        .where(and(eq(deckSlots.userId, userId), eq(deckSlots.userCardId, userCardId)))
        .limit(1)
      if (inDeck) return marketError(400, "in_deck", "先从卡组里移出再上架")

      const [created] = await tx.insert(marketListings)
        .values({ sellerId: userId, userCardId, price })
        .onConflictDoNothing()
        .returning({ id: marketListings.id, price: marketListings.price })
      if (!created) return marketError(400, "already_listed", "这张卡已经在市场里")
      return { ok: true as const, data: { ...created, card } }
    })

    if (!outcome.ok) return reply.code(outcome.status).send({ ok: false, error: outcome.error })
    return outcome
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

    const outcome = await db.transaction(async (tx) => {
      const [listing] = await tx.select().from(marketListings)
        .where(eq(marketListings.id, params.listingId))
        .limit(1)
        .for("update")
      if (!listing || listing.status !== "active") return marketError(404, "not_found", "这条上架已经不存在")
      if (listing.sellerId === userId) return marketError(400, "own_listing", "不能买自己的卡")

      const card = await loadCard(tx, listing.sellerId, listing.userCardId)
      if (!card) return marketError(409, "card_moved", "卖家已经不再持有这张卡")

      const [wallet] = await tx
        .update(users)
        .set({ coins: sql`${users.coins} - ${listing.price}` })
        .where(and(eq(users.id, userId), gte(users.coins, listing.price)))
        .returning({ coins: users.coins })
      if (!wallet) {
        const [buyer] = await tx.select({ coins: users.coins }).from(users).where(eq(users.id, userId))
        const coins = buyer?.coins ?? 0
        return {
          ok: false as const,
          status: 400,
          error: { code: "not_enough_coins", message: `金币不足：${coins} / ${listing.price}`, need: listing.price, coins },
        }
      }
      await tx
        .update(users)
        .set({ coins: sql`${users.coins} + ${listing.price}` })
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
      return { ok: true as const, data: { card, price: listing.price, coins: wallet.coins } }
    })

    if (!outcome.ok) return reply.code(outcome.status).send({ ok: false, error: outcome.error })
    return outcome
  })
}
