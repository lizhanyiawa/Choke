import { and, asc, count, desc, eq, getTableColumns, gt, gte, ilike, lte, sql, type SQL } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import {
  MARKET_LISTING_TTL_MS,
  MARKET_PRICE_BAND_RATIO,
  MARKET_TRADE_TAX_RATE,
  marketListingFees,
} from "@choke/shared/economy"
import { RARITIES } from "@choke/shared/types"

import { MARKET_MAX_PRICE } from "../shared/cards"
import { requireSelf, requireSession } from "../auth/guard"
import { CARD_TYPES } from "../card-types"
import { db } from "../db/client"
import { EXPEDITION_LOCK_MESSAGE, anyLocked } from "../expedition/locks"
import { cards, deckSlots, marketListings, userCards, users } from "../db/schema"
import { recordLedger } from "../ledger"
import { recordQuestEvent } from "../quest-events"
import { TxAbort, lockUser, runTx, type Tx } from "../tx"
import { requireFeature } from "../unlocks"

const instanceColumns = {
  userCardId: userCards.id,
  level: userCards.level,
  constellation: userCards.constellation,
  exp: userCards.exp,
  serial: userCards.serial,
  rollBp: userCards.rollBp,
  skillRefs: userCards.skillRefs,
  foil: userCards.foil,
}
const cardColumns = { ...getTableColumns(cards), ...instanceColumns }
const listingCardColumns = {
  id: cards.id,
  name: cards.name,
  rarity: cards.rarity,
  job: cards.job,
  no: cards.no,
  total: cards.total,
  country: cards.country,
  globalRank: cards.globalRank,
  pp: cards.pp,
  profileUrl: cards.profileUrl,
  art: cards.art,
  banner: cards.banner,
  version: cards.version,
  pulled: cards.pulled,
  ...instanceColumns,
}

const publicListingColumns = {
  id: marketListings.id,
  price: marketListings.price,
  sellerId: marketListings.sellerId,
  sellerName: users.username,
  sellerPublicId: users.publicId,
  createdAt: marketListings.createdAt,
  card: listingCardColumns,
}

function publicListingQuery(where: SQL | undefined) {
  return db.select(publicListingColumns)
    .from(marketListings)
    .innerJoin(userCards, eq(userCards.id, marketListings.userCardId))
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .innerJoin(users, eq(users.id, marketListings.sellerId))
    .where(where)
}

function listingExpiry(createdAt: Date) {
  return new Date(createdAt.getTime() + MARKET_LISTING_TTL_MS).toISOString()
}

function activeListingFilters() {
  return [eq(marketListings.status, "active"), gt(marketListings.createdAt, new Date(Date.now() - MARKET_LISTING_TTL_MS))]
}

const paramsSchema = z.object({ userId: z.string() })
const listingParams = z.object({ userId: z.string(), listingId: z.coerce.number().int().positive() })
const pageQuery = z.object({
  q: z.string().trim().max(64).optional(),
  rarity: z.enum(RARITIES).optional(),
  type: z.enum([CARD_TYPES.pool, CARD_TYPES.mirror]).optional(),
  sort: z.enum(["new", "asc", "desc"]).default("new"),
  limit: z.coerce.number().int().min(1).max(60).default(16),
  offset: z.coerce.number().int().min(0).default(0),
})

async function loadCard(userId: string, userCardId: number, executor: Tx | typeof db = db) {
  const [row] = await executor
    .select(cardColumns)
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(and(eq(userCards.userId, userId), eq(userCards.id, userCardId)))
    .limit(1)
  return row ?? null
}

let lastExpirySweepAt = 0
const EXPIRY_SWEEP_INTERVAL_MS = 60_000

async function expireStaleListings(force = false) {
  const now = Date.now()
  if (!force && now - lastExpirySweepAt < EXPIRY_SWEEP_INTERVAL_MS) return
  const expireBefore = new Date(now - MARKET_LISTING_TTL_MS)
  await db.transaction(async (tx) => {
    const expired = await tx
      .update(marketListings)
      .set({ status: "expired" })
      .where(and(eq(marketListings.status, "active"), lte(marketListings.createdAt, expireBefore)))
      .returning({
        id: marketListings.id,
        sellerId: marketListings.sellerId,
        deposit: marketListings.deposit,
      })
    for (const row of expired) {
      if (row.deposit > 0) {
        await tx
          .update(users)
          .set({ coins: sql`${users.coins} + ${row.deposit}` })
          .where(eq(users.id, row.sellerId))
        await recordLedger(tx, row.sellerId, [{ kind: "coins", delta: row.deposit }], {
          source: "market-deposit-refund",
          sourceRef: String(row.id),
        })
      }
    }
  })
  // 落库成功后才推进节流时间：事务失败时下一次请求还会重试
  lastExpirySweepAt = now
}

async function priceBandOf(cardId: string, executor: Tx | typeof db = db) {
  const sold = await executor
    .select({ price: marketListings.price })
    .from(marketListings)
    .innerJoin(userCards, eq(userCards.id, marketListings.userCardId))
    .where(and(eq(userCards.cardId, cardId), eq(marketListings.status, "sold")))
    .orderBy(desc(marketListings.id))
    .limit(20)
  if (sold.length === 0) return null
  const avgPrice = Math.round(sold.reduce((s, r) => s + r.price, 0) / sold.length)
  return {
    avgPrice,
    minPrice: Math.max(1, Math.floor(avgPrice * (1 - MARKET_PRICE_BAND_RATIO))),
    maxPrice: Math.min(MARKET_MAX_PRICE, Math.ceil(avgPrice * (1 + MARKET_PRICE_BAND_RATIO))),
    sampleCount: sold.length,
  }
}

export async function marketRoutes(app: FastifyInstance) {
  app.get("/market/history", async (request) => {
    const query = z.object({ cardId: z.string().optional() }).parse(request.query)
    const whereClause = query.cardId
      ? and(eq(marketListings.status, "sold"), eq(userCards.cardId, query.cardId))
      : eq(marketListings.status, "sold")
    const rows = await db
      .select({
        id: marketListings.id,
        price: marketListings.price,
        cardId: userCards.cardId,
        cardName: cards.name,
        rarity: cards.rarity,
        createdAt: marketListings.createdAt,
      })
      .from(marketListings)
      .innerJoin(userCards, eq(userCards.id, marketListings.userCardId))
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(whereClause)
      .orderBy(desc(marketListings.id))
      .limit(30)

    const band = query.cardId ? await priceBandOf(query.cardId) : null
    return { ok: true, data: { sales: rows, priceBand: band } }
  })

  app.get("/market/listings", async (request, reply) => {
    const viewer = requireSession(request, reply)
    if (!viewer) return
    await expireStaleListings()
    const rows = await publicListingQuery(and(...activeListingFilters())).orderBy(desc(marketListings.id)).limit(80)
    return { ok: true, data: rows.map(({ createdAt, ...listing }) => ({ ...listing, expiresAt: listingExpiry(createdAt) })) }
  })

  app.get("/market/listings/page", async (request, reply) => {
    if (!requireSession(request, reply)) return
    const parsed = pageQuery.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: "bad_request", message: "市场筛选参数不合法" } })
    }
    const { q, rarity, type, sort, limit, offset } = parsed.data
    await expireStaleListings()
    const filters = activeListingFilters()
    if (q) filters.push(ilike(cards.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`))
    if (rarity) filters.push(eq(cards.rarity, rarity))
    if (type) filters.push(eq(cards.cardType, type))
    const where = and(...filters)
    const stable = desc(marketListings.id)
    const order = sort === "asc" ? [asc(marketListings.price), stable] : sort === "desc" ? [desc(marketListings.price), stable] : [stable]
    const [rows, [totals]] = await Promise.all([
      publicListingQuery(where).orderBy(...order).limit(limit).offset(offset),
      db.select({ total: count() }).from(marketListings)
        .innerJoin(userCards, eq(userCards.id, marketListings.userCardId))
        .innerJoin(cards, eq(cards.id, userCards.cardId))
        .innerJoin(users, eq(users.id, marketListings.sellerId))
        .where(where),
    ])
    return { ok: true, data: {
      rows: rows.map(({ createdAt, ...listing }) => ({ ...listing, expiresAt: listingExpiry(createdAt) })),
      total: totals?.total ?? 0,
      limit,
      offset,
    } }
  })

  app.get("/users/:userId/market/listings", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    await expireStaleListings()
    const rows = await db
      .select({
        id: marketListings.id,
        price: marketListings.price,
        deposit: marketListings.deposit,
        createdAt: marketListings.createdAt,
        card: listingCardColumns,
      })
      .from(marketListings)
      .innerJoin(userCards, eq(userCards.id, marketListings.userCardId))
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(and(eq(marketListings.sellerId, userId), ...activeListingFilters()))
      .orderBy(desc(marketListings.id))

    return {
      ok: true,
      data: rows.map(({ createdAt, ...listing }) => ({ ...listing, expiresAt: listingExpiry(createdAt) })),
    }
  })

  app.post("/users/:userId/market/list", async (request, reply) => {
    const params = paramsSchema.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    if (!(await requireFeature(reply, userId, "market"))) return
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

    const { listTax, deposit, upfrontTotal } = marketListingFees(body.data.price)
    const listedResult = await runTx(reply, async (tx) => {
      await lockUser(tx, userId)

      const card = await loadCard(userId, body.data.userCardId, tx)
      if (!card) {
        throw new TxAbort(404, "not_found", "卡不在这个账号的卡册里")
      }
      if (card.id.startsWith("hero-")) {
        throw new TxAbort(400, "hero_not_tradable", "本体卡不能上架")
      }

      const [inDeck] = await tx
        .select({ id: deckSlots.userCardId })
        .from(deckSlots)
        .where(and(eq(deckSlots.userId, userId), eq(deckSlots.userCardId, body.data.userCardId)))
        .limit(1)
      if (inDeck) {
        throw new TxAbort(400, "in_deck", "先从卡组里移出再上架")
      }
      if (await anyLocked(tx, userId, [body.data.userCardId])) {
        throw new TxAbort(400, "in_expedition", EXPEDITION_LOCK_MESSAGE)
      }

      const [listed] = await tx
        .select({ id: marketListings.id })
        .from(marketListings)
        .where(and(eq(marketListings.userCardId, body.data.userCardId), eq(marketListings.status, "active")))
        .limit(1)
      if (listed) {
        throw new TxAbort(400, "already_listed", "这张卡已经在市场里")
      }

      const band = await priceBandOf(card.id, tx)
      if (band && (body.data.price < band.minPrice || body.data.price > band.maxPrice)) {
        throw new TxAbort(
          400,
          "price_out_of_band",
          `定价需在近期均价（${band.avgPrice}）的 ±40% 范围内（${band.minPrice}–${band.maxPrice}）`,
          band,
        )
      }

      const [wallet] = await tx
        .update(users)
        .set({ coins: sql`${users.coins} - ${upfrontTotal}` })
        .where(and(eq(users.id, userId), gte(users.coins, upfrontTotal)))
        .returning({ coins: users.coins })
      if (!wallet) {
        const [u] = await tx.select({ coins: users.coins }).from(users).where(eq(users.id, userId)).limit(1)
        const coins = u?.coins ?? 0
        throw new TxAbort(
          400,
          "not_enough_coins",
          `上架税与押金不足：需要 ${upfrontTotal} 金币（税 ${listTax} + 押金 ${deposit}），当前 ${coins}`,
          {
            need: upfrontTotal,
            listTax,
            deposit,
            coins,
          },
        )
      }

      let created: typeof marketListings.$inferSelect | undefined
      try {
        ;[created] = await tx
          .insert(marketListings)
          .values({
            sellerId: userId,
            userCardId: body.data.userCardId,
            price: body.data.price,
            deposit,
          })
          .returning()
      } catch (err) {
        if ((err as { code?: string })?.code === "23505") {
          throw new TxAbort(400, "already_listed", "这张卡已经在市场里")
        }
        throw err
      }

      await recordLedger(tx, userId, [{ kind: "coins", delta: -listTax }], {
        source: "market-tax",
        sourceRef: String(created!.id),
      })
      await recordLedger(tx, userId, [{ kind: "coins", delta: -deposit }], {
        source: "market-deposit",
        sourceRef: String(created!.id),
      })

      return { created: created!, coins: wallet.coins, card }
    })
    if (!listedResult) return

    return {
      ok: true,
      data: {
        id: listedResult.created.id,
        price: listedResult.created.price,
        listTax,
        deposit,
        coins: listedResult.coins,
        card: listedResult.card,
      },
    }
  })

  app.delete("/users/:userId/market/listings/:listingId", async (request, reply) => {
    const params = listingParams.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const removed = await runTx(reply, async (tx) => {
      const [cancelled] = await tx
        .update(marketListings)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(marketListings.id, params.listingId),
            eq(marketListings.sellerId, userId),
            eq(marketListings.status, "active"),
          ),
        )
        .returning({ id: marketListings.id, deposit: marketListings.deposit })
      if (!cancelled) {
        throw new TxAbort(404, "not_found", "没有这条上架记录")
      }
      let coins: number | undefined
      if (cancelled.deposit > 0) {
        const [wallet] = await tx
          .update(users)
          .set({ coins: sql`${users.coins} + ${cancelled.deposit}` })
          .where(eq(users.id, userId))
          .returning({ coins: users.coins })
        coins = wallet?.coins
        await recordLedger(tx, userId, [{ kind: "coins", delta: cancelled.deposit }], {
          source: "market-deposit-refund",
          sourceRef: String(cancelled.id),
        })
      }
      return { id: cancelled.id, depositRefunded: cancelled.deposit, coins }
    })
    if (!removed) return
    return { ok: true, data: removed }
  })

  app.post("/users/:userId/market/buy/:listingId", async (request, reply) => {
    const params = listingParams.parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    if (!(await requireFeature(reply, userId, "market"))) return

    // 过期清扫由列表请求按 60 秒节流触发；这里不强制全表扫描，目标挂单在事务内单独判断
    await expireStaleListings()

    // 先在事务里把上架从 active 抢成 sold，再按序锁买卖双方、扣款、过户；任何一步失败都整体回滚，
    // 并发购买只有一个能抢到这条上架，金币也不会被扣成负数。
    const bought = await runTx(reply, async (tx) => {
      const [listing] = await tx
        .update(marketListings)
        .set({ status: "sold" })
        .where(and(eq(marketListings.id, params.listingId), eq(marketListings.status, "active")))
        .returning({
          sellerId: marketListings.sellerId,
          userCardId: marketListings.userCardId,
          price: marketListings.price,
          deposit: marketListings.deposit,
          createdAt: marketListings.createdAt,
        })
      if (!listing) {
        const [stale] = await tx
          .select({ status: marketListings.status })
          .from(marketListings)
          .where(eq(marketListings.id, params.listingId))
          .limit(1)
        if (stale?.status === "expired") {
          throw new TxAbort(400, "listing_expired", "这条上架已超过 7 天，已自动取消")
        }
        throw new TxAbort(404, "not_found", "这条上架已经不存在")
      }
      if (Date.now() - listing.createdAt.getTime() > MARKET_LISTING_TTL_MS) {
        // 目标挂单自己过期了：在同一个事务里取消并退押金（和列表清扫效果一致，但不做全表扫描）。
        // 返回哨兵让事务先提交，再在事务外回错误，否则这里抛错会把退还押金一起回滚。
        await lockUser(tx, listing.sellerId)
        await tx
          .update(marketListings)
          .set({ status: "expired" })
          .where(eq(marketListings.id, params.listingId))
        if (listing.deposit > 0) {
          await tx
            .update(users)
            .set({ coins: sql`${users.coins} + ${listing.deposit}` })
            .where(eq(users.id, listing.sellerId))
          await recordLedger(tx, listing.sellerId, [{ kind: "coins", delta: listing.deposit }], {
            source: "market-deposit-refund",
            sourceRef: String(params.listingId),
          })
        }
        return { expired: true as const }
      }
      if (listing.sellerId === userId) {
        throw new TxAbort(400, "own_listing", "不能买自己的卡")
      }

      // 按 userId 字典序依次加锁，避免买家与卖家互买时死锁
      for (const lockId of [userId, listing.sellerId].sort()) {
        await lockUser(tx, lockId)
      }

      const [buyerWallet] = await tx
        .update(users)
        .set({ coins: sql`${users.coins} - ${listing.price}` })
        .where(and(eq(users.id, userId), gte(users.coins, listing.price)))
        .returning({ coins: users.coins })
      if (!buyerWallet) {
        const [buyer] = await tx
          .select({ coins: users.coins })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
        const coins = buyer?.coins ?? 0
        throw new TxAbort(400, "not_enough_coins", `金币不足：${coins} / ${listing.price}`, {
          need: listing.price,
          coins,
        })
      }

      const moved = await tx
        .update(userCards)
        .set({ userId })
        .where(and(eq(userCards.id, listing.userCardId), eq(userCards.userId, listing.sellerId)))
        .returning({ id: userCards.id, cardId: userCards.cardId })
      if (moved.length === 0) {
        throw new TxAbort(409, "card_moved", "卖家已经不再持有这张卡")
      }

      const tradeTax = Math.floor(listing.price * MARKET_TRADE_TAX_RATE)
      const sellerProceeds = Math.max(0, listing.price - tradeTax)
      const sellerTotalCredit = sellerProceeds + listing.deposit

      await tx
        .update(users)
        .set({ coins: sql`${users.coins} + ${sellerTotalCredit}` })
        .where(eq(users.id, listing.sellerId))
      await tx.delete(deckSlots).where(eq(deckSlots.userCardId, listing.userCardId))
      const origin = { source: "market-buy", sourceRef: String(params.listingId) }
      await recordLedger(
        tx,
        userId,
        [
          { kind: "coins", delta: -listing.price },
          { kind: "card", ref: moved[0]!.cardId, delta: 1, userCardId: listing.userCardId },
        ],
        origin,
      )
      await recordLedger(
        tx,
        listing.sellerId,
        [
          { kind: "coins", delta: sellerProceeds },
          { kind: "card", ref: moved[0]!.cardId, delta: -1, userCardId: listing.userCardId },
        ],
        { ...origin, source: "market-sell" },
      )
      if (listing.deposit > 0) {
        await recordLedger(tx, listing.sellerId, [{ kind: "coins", delta: listing.deposit }], {
          source: "market-deposit-refund",
          sourceRef: String(params.listingId),
        })
      }
      await recordQuestEvent(tx, userId, "market-buy")
      await recordQuestEvent(tx, listing.sellerId, "market-sell")
      return {
        expired: false as const,
        coins: buyerWallet.coins,
        price: listing.price,
        tradeTax,
        sellerProceeds,
        userCardId: listing.userCardId,
      }
    })
    if (!bought) return
    if (bought.expired) {
      return reply.code(400).send({
        ok: false,
        error: { code: "listing_expired", message: "这条上架已超过 7 天，已自动取消" },
      })
    }

    return {
      ok: true,
      data: {
        card: await loadCard(userId, bought.userCardId),
        price: bought.price,
        tradeTax: bought.tradeTax,
        coins: bought.coins,
      },
    }
  })
}
