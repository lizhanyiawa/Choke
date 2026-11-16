import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  notLike,
  sql,
} from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { requireSelf } from "../auth/guard"
import { db } from "../db/client"
import { cards, userCards } from "../db/schema"

const RARITY_RANK = sql`CASE ${cards.rarity}
  WHEN 'C' THEN 0
  WHEN 'UC' THEN 1
  WHEN 'R' THEN 2
  WHEN 'E' THEN 3
  WHEN 'L' THEN 4
  WHEN 'Radiant' THEN 5
  WHEN 'Prismatic' THEN 6
  ELSE -1
END`

const SORTS = ["recent", "rarity", "pp", "name"] as const

export async function cardRoutes(app: FastifyInstance) {
  app.get("/cards", async (request) => {
    const query = z
      .object({
        rarity: z.string().optional(),
        q: z.string().optional(),
        country: z.string().max(8).optional(),
        sort: z.enum(SORTS).default("pp"),
        limit: z.coerce.number().int().min(1).max(200).default(48),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const filters = [notLike(cards.id, "hero-%")]
    if (query.rarity) filters.push(eq(cards.rarity, query.rarity))
    if (query.country) filters.push(eq(cards.country, query.country))
    if (query.q) filters.push(ilike(cards.name, `%${query.q}%`))
    const where = and(...filters)

    const orderBy =
      query.sort === "rarity"
        ? [desc(RARITY_RANK), sql`${cards.pp} desc nulls last`]
        : query.sort === "name"
          ? [asc(cards.name)]
          : [sql`${cards.pp} desc nulls last`]

    const rows = await db
      .select()
      .from(cards)
      .where(where)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(query.offset)

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(cards)
      .where(where)

    return { ok: true, data: { rows, total: Number(total), limit: query.limit, offset: query.offset } }
  })

  app.get("/cards/stats", async () => {
    const rows = await db
      .select({ rarity: cards.rarity, value: count() })
      .from(cards)
      .where(notLike(cards.id, "hero-%"))
      .groupBy(cards.rarity)

    const byRarity: Record<string, number> = {}
    let total = 0
    for (const row of rows) {
      const value = Number(row.value)
      byRarity[row.rarity] = value
      total += value
    }
    return { ok: true, data: { total, byRarity } }
  })

  app.get("/cards/countries", async () => {
    const rows = await db
      .select({ code: cards.country, value: count() })
      .from(cards)
      .where(notLike(cards.id, "hero-%"))
      .groupBy(cards.country)

    return {
      ok: true,
      data: rows
        .filter((row): row is { code: string; value: number } => !!row.code)
        .map((row) => ({ code: row.code, total: Number(row.value) }))
        .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code)),
    }
  })

  app.get("/users/:userId/codex/stats", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const poolRows = await db
      .select({ rarity: cards.rarity, country: cards.country, total: count() })
      .from(cards)
      .where(notLike(cards.id, "hero-%"))
      .groupBy(cards.rarity, cards.country)

    const ownedRows = await db
      .select({
        rarity: cards.rarity,
        country: cards.country,
        owned: countDistinct(userCards.cardId),
      })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(eq(userCards.userId, userId))
      .groupBy(cards.rarity, cards.country)

    const byRarity: Record<string, { total: number; owned: number }> = {}
    const countries = new Map<string, { code: string; total: number; owned: number }>()
    let total = 0

    for (const row of poolRows) {
      const rowTotal = Number(row.total)
      total += rowTotal
      const rarity = (byRarity[row.rarity] ??= { total: 0, owned: 0 })
      rarity.total += rowTotal
      if (row.country) {
        const country = countries.get(row.country) ?? { code: row.country, total: 0, owned: 0 }
        country.total += rowTotal
        countries.set(row.country, country)
      }
    }

    let owned = 0
    for (const row of ownedRows) {
      const rowOwned = Number(row.owned)
      owned += rowOwned
      const rarity = (byRarity[row.rarity] ??= { total: 0, owned: 0 })
      rarity.owned += rowOwned
      if (row.country) {
        const country = countries.get(row.country) ?? { code: row.country, total: 0, owned: 0 }
        country.owned += rowOwned
        countries.set(row.country, country)
      }
    }

    return {
      ok: true,
      data: {
        total,
        owned,
        byRarity,
        countries: [...countries.values()].sort(
          (a, b) => b.total - a.total || a.code.localeCompare(b.code),
        ),
      },
    }
  })

  app.get("/users/:userId/codex", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const query = z
      .object({
        rarity: z.string().optional(),
        q: z.string().optional(),
        country: z.string().max(8).optional(),
        owned: z.enum(["all", "owned", "unseen"]).default("all"),
        sort: z.enum(SORTS).default("rarity"),
        limit: z.coerce.number().int().min(1).max(200).default(24),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const ownedCards = db
      .selectDistinct({ cardId: userCards.cardId })
      .from(userCards)
      .where(eq(userCards.userId, userId))
      .as("owned_cards")

    const baseFilters = [notLike(cards.id, "hero-%")]
    if (query.rarity) baseFilters.push(eq(cards.rarity, query.rarity))
    if (query.country) baseFilters.push(eq(cards.country, query.country))
    if (query.q) baseFilters.push(ilike(cards.name, `%${query.q}%`))

    const filters = [...baseFilters]
    if (query.owned === "owned") filters.push(isNotNull(ownedCards.cardId))
    if (query.owned === "unseen") filters.push(isNull(ownedCards.cardId))
    const where = and(...filters)

    const orderBy =
      query.sort === "rarity"
        ? [desc(RARITY_RANK), sql`${cards.pp} desc nulls last`]
        : query.sort === "name"
          ? [asc(cards.name)]
          : [sql`${cards.pp} desc nulls last`]

    const rows = await db
      .select({
        ...getTableColumns(cards),
        owned: sql<boolean>`(${ownedCards.cardId} is not null)`,
      })
      .from(cards)
      .leftJoin(ownedCards, eq(ownedCards.cardId, cards.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(query.offset)

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(cards)
      .leftJoin(ownedCards, eq(ownedCards.cardId, cards.id))
      .where(where)

    const [{ value: ownedTotal }] = await db
      .select({ value: count() })
      .from(cards)
      .leftJoin(ownedCards, eq(ownedCards.cardId, cards.id))
      .where(and(...baseFilters, isNotNull(ownedCards.cardId)))

    return {
      ok: true,
      data: {
        rows,
        total: Number(total),
        ownedTotal: Number(ownedTotal),
        limit: query.limit,
        offset: query.offset,
      },
    }
  })

  app.get("/cards/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1)
    if (!row) {
      return reply.code(404).send({ ok: false, error: { code: "not_found", message: "卡不存在" } })
    }
    return { ok: true, data: row }
  })

  app.get("/users/:userId/cards", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const query = z
      .object({
        rarity: z.string().optional(),
        q: z.string().optional(),
        sort: z.enum(SORTS).default("recent"),
        limit: z.coerce.number().int().min(1).max(60).default(24),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const filters = [eq(userCards.userId, userId)]
    if (query.rarity) filters.push(eq(cards.rarity, query.rarity))
    if (query.q) filters.push(ilike(cards.name, `%${query.q}%`))
    const where = and(...filters)

    const orderBy =
      query.sort === "rarity"
        ? [desc(RARITY_RANK), sql`${cards.pp} desc nulls last`]
        : query.sort === "pp"
          ? [sql`${cards.pp} desc nulls last`]
          : query.sort === "name"
            ? [asc(cards.name)]
            : [desc(userCards.obtainedAt)]

    const rows = await db
      .select({
        ...getTableColumns(cards),
        userCardId: userCards.id,
        level: userCards.level,
        constellation: userCards.constellation,
        exp: userCards.exp,
        foil: userCards.foil,
        obtainedAt: userCards.obtainedAt,
      })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(where)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(query.offset)

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(where)

    return {
      ok: true,
      data: { rows, total: Number(total), limit: query.limit, offset: query.offset },
    }
  })
}
