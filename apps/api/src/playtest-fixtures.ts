import { and, count, eq, inArray, sql } from "drizzle-orm"

import sampleCards from "../samples/sample-cards.json" with { type: "json" }
import { db } from "./db/client"
import { cards, deckSlots, marketListings, userCards, userPacks, users } from "./db/schema"
import { getPackCounts, PACK_POOLS } from "./packs/inventory"

export const PLAYTEST_PLAYER = "playtest-player"
const SELLER = "playtest-seller"
const sampleIds = sampleCards.map((card) => card.id)
type FixtureTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function fillResources(tx: FixtureTransaction) {
  await tx.update(users)
    .set({
      coins: sql`greatest(${users.coins}, 10000)`,
      essence: sql`greatest(${users.essence}, 500)`,
    })
    .where(eq(users.id, PLAYTEST_PLAYER))
  await tx.insert(userPacks)
    .values(PACK_POOLS.filter((pool) => pool !== "mystery").map((pool) => ({
      userId: PLAYTEST_PLAYER, pool, count: 5,
    })))
    .onConflictDoUpdate({
      target: [userPacks.userId, userPacks.pool],
      set: { count: sql`greatest(${userPacks.count}, excluded.count)` },
    })
}

async function fillDeck(tx: FixtureTransaction) {
  const occupied = await tx.select().from(deckSlots).where(eq(deckSlots.userId, PLAYTEST_PLAYER))
  const used = new Set(occupied.map((slot) => slot.userCardId))
  const filled = new Set(occupied.map((slot) => slot.slot))
  const vacancies = Array.from({ length: 7 }, (_, index) => index + 1).filter((slot) => !filled.has(slot))
  if (vacancies.length === 0) return

  const listings = await tx.select({ id: marketListings.userCardId })
    .from(marketListings)
    .where(and(eq(marketListings.sellerId, PLAYTEST_PLAYER), eq(marketListings.status, "active")))
  const listed = new Set(listings.map((offer) => offer.id))
  const owned = await tx.select({ id: userCards.id, cardId: userCards.cardId })
    .from(userCards)
    .where(and(eq(userCards.userId, PLAYTEST_PLAYER), inArray(userCards.cardId, sampleIds)))
  const alreadyInDeck = new Set(owned.filter((card) => used.has(card.id)).map((card) => card.cardId))
  const assignments = []
  for (const cardId of sampleIds) {
    if (assignments.length >= vacancies.length) break
    if (alreadyInDeck.has(cardId)) continue
    const available = owned.find((card) => card.cardId === cardId && !listed.has(card.id))
    const [card] = available
      ? [available]
      : await tx.insert(userCards)
        .values({ userId: PLAYTEST_PLAYER, cardId, level: 18 })
        .returning({ id: userCards.id })
    assignments.push({ userId: PLAYTEST_PLAYER, slot: vacancies[assignments.length], userCardId: card.id })
  }
  if (assignments.length > 0) await tx.insert(deckSlots).values(assignments).onConflictDoNothing()
}

async function fillMarket(tx: FixtureTransaction) {
  const listings = await tx.select({ cardId: userCards.cardId })
    .from(marketListings)
    .innerJoin(userCards, eq(userCards.id, marketListings.userCardId))
    .where(and(eq(marketListings.sellerId, SELLER), eq(marketListings.status, "active")))
  const listed = new Set(listings.map((offer) => offer.cardId))
  const missing = sampleIds.filter((cardId) => !listed.has(cardId))
  if (missing.length === 0) return

  const stock = await tx.insert(userCards)
    .values(missing.map((cardId) => ({ userId: SELLER, cardId })))
    .returning({ id: userCards.id, cardId: userCards.cardId })
  await tx.insert(marketListings).values(stock.map((card) => ({
    sellerId: SELLER,
    userCardId: card.id,
    price: 80 + sampleIds.indexOf(card.cardId) * 30,
  })))
}

export async function seedPlaytest() {
  await db.transaction(async (tx) => {
    await tx.insert(cards).values(sampleCards.map((card) => ({
      ...card,
      pp: card.pp == null ? null : String(card.pp),
    }))).onConflictDoNothing()
    const [player] = await tx.insert(users).values({ id: PLAYTEST_PLAYER, username: "测试账号", onboarded: true })
      .onConflictDoNothing().returning({ id: users.id })
    await tx.insert(users).values({ id: SELLER, username: "样例卖家", onboarded: true }).onConflictDoNothing()
    if (player) {
      await fillResources(tx)
      await fillDeck(tx)
      await fillMarket(tx)
    }
  })
}

export async function readPlaytest() {
  const [[player], packs, [collection], [deck], [market]] = await Promise.all([
    db.select({ coins: users.coins, essence: users.essence }).from(users).where(eq(users.id, PLAYTEST_PLAYER)),
    getPackCounts(PLAYTEST_PLAYER),
    db.select({ total: count() }).from(userCards).where(eq(userCards.userId, PLAYTEST_PLAYER)),
    db.select({ total: count() }).from(deckSlots).where(eq(deckSlots.userId, PLAYTEST_PLAYER)),
    db.select({ total: count() }).from(marketListings)
      .where(and(eq(marketListings.sellerId, SELLER), eq(marketListings.status, "active"))),
  ])
  return {
    playtest: true,
    ...player,
    packs: Object.values(packs).reduce((sum, value) => sum + value, 0),
    cards: collection.total,
    deck: deck.total,
    listings: market.total,
  }
}

export async function replenishPlaytest(action: "resources" | "deck" | "market") {
  const fill = { resources: fillResources, deck: fillDeck, market: fillMarket }[action]
  await db.transaction(fill)
  return readPlaytest()
}
