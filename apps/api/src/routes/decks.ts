import { and, eq, getTableColumns, inArray } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { requireSelf } from "../auth/guard"
import { db } from "../db/client"
import { cards, decks, deckSlots, userCards } from "../db/schema"

const DECK_SIZE = 7

type DeckCardRow = Record<string, unknown>

async function loadDeck(userId: string) {
  const [deck] = await db.select().from(decks).where(eq(decks.userId, userId)).limit(1)

  const rows = await db
    .select({
      slot: deckSlots.slot,
      ...getTableColumns(cards),
      userCardId: userCards.id,
      level: userCards.level,
      constellation: userCards.constellation,
      exp: userCards.exp,
      obtainedAt: userCards.obtainedAt,
    })
    .from(deckSlots)
    .innerJoin(
      userCards,
      and(eq(userCards.id, deckSlots.userCardId), eq(userCards.userId, userId)),
    )
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(eq(deckSlots.userId, userId))

  const slots = Array.from({ length: DECK_SIZE }, (_, i) => ({
    slot: i + 1,
    card: null as DeckCardRow | null,
  }))

  for (const row of rows) {
    const { slot, ...card } = row
    if (slot >= 1 && slot <= DECK_SIZE) {
      slots[slot - 1] = { slot, card }
    }
  }

  return {
    name: deck?.name ?? "主卡组",
    slots,
    updatedAt: deck?.updatedAt ?? null,
  }
}

export async function deckRoutes(app: FastifyInstance) {
  app.get("/users/:userId/deck", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    return { ok: true, data: await loadDeck(userId) }
  })

  app.put("/users/:userId/deck", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return
    const body = z
      .object({
        slots: z.array(z.number().int().positive().nullable()).length(DECK_SIZE),
      })
      .parse(request.body)

    const ids = body.slots.filter((value): value is number => value !== null)
    if (new Set(ids).size !== ids.length) {
      return reply.code(400).send({
        ok: false,
        error: { code: "duplicate_card", message: "同一张卡不能放进两个槽位" },
      })
    }

    if (ids.length > 0) {
      const owned = await db
        .select({ id: userCards.id })
        .from(userCards)
        .where(and(eq(userCards.userId, userId), inArray(userCards.id, ids)))

      if (owned.length !== ids.length) {
        return reply.code(400).send({
          ok: false,
          error: { code: "card_not_owned", message: "有卡不在这个账号的卡册里" },
        })
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(decks)
        .values({ userId, name: "主卡组" })
        .onConflictDoUpdate({
          target: decks.userId,
          set: { updatedAt: new Date() },
        })

      await tx.delete(deckSlots).where(eq(deckSlots.userId, userId))

      const rows = body.slots.flatMap((id, index) =>
        id === null ? [] : [{ userId, slot: index + 1, userCardId: id }],
      )
      if (rows.length > 0) {
        await tx.insert(deckSlots).values(rows)
      }
    })

    return { ok: true, data: await loadDeck(userId) }
  })
}
