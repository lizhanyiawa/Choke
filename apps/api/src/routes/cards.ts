import { and, count, desc, eq, getTableColumns, ilike } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { db } from "../db/client"
import { cards, userCards } from "../db/schema"

export async function cardRoutes(app: FastifyInstance) {
  app.get("/cards", async (request) => {
    const query = z
      .object({
        rarity: z.string().optional(),
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(48),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const filters = []
    if (query.rarity) filters.push(eq(cards.rarity, query.rarity))
    if (query.q) filters.push(ilike(cards.name, `%${query.q}%`))
    const where = filters.length > 0 ? and(...filters) : undefined

    const rows = await db
      .select()
      .from(cards)
      .where(where)
      .orderBy(desc(cards.pp))
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
        limit: z.coerce.number().int().min(1).max(200).default(48),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const rows = await db
      .select({
        ...getTableColumns(cards),
        userCardId: userCards.id,
        level: userCards.level,
        constellation: userCards.constellation,
        obtainedAt: userCards.obtainedAt,
      })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(eq(userCards.userId, userId))
      .orderBy(desc(userCards.obtainedAt))
      .limit(query.limit)
      .offset(query.offset)

    return { ok: true, data: { rows, limit: query.limit, offset: query.offset } }
  })
}
