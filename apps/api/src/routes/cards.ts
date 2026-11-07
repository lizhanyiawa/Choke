import { and, asc, count, desc, eq, getTableColumns, ilike, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

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
        sort: z.enum(SORTS).default("pp"),
        limit: z.coerce.number().int().min(1).max(200).default(48),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const filters = []
    if (query.rarity) filters.push(eq(cards.rarity, query.rarity))
    if (query.q) filters.push(ilike(cards.name, `%${query.q}%`))
    const where = filters.length > 0 ? and(...filters) : undefined

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

  app.get("/cards/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1)
    if (!row) {
      return reply.code(404).send({ ok: false, error: { code: "not_found", message: "卡不存在" } })
    }
    return { ok: true, data: row }
  })

  app.get("/users/:userId/cards", async (request) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params)
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
