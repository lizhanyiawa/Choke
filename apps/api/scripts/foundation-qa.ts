import assert from "node:assert/strict"
import cookie from "@fastify/cookie"
import Fastify from "fastify"
import { eq } from "drizzle-orm"

import { DEMO_CARDS } from "../../../src/card/data"
import { makeSession, COOKIE_NAME } from "../src/auth/osu"
import { client, db } from "../src/db/client"
import { cards, deckSlots, marketListings, userCards, users } from "../src/db/schema"
import { authRoutes } from "../src/routes/auth"
import { cardRoutes } from "../src/routes/cards"
import { deckRoutes } from "../src/routes/decks"
import { marketRoutes } from "../src/routes/market"
import { packRoutes } from "../src/routes/packs"
import { progressionRoutes } from "../src/routes/progression"

const serve = process.argv.includes("--serve")
const app = Fastify()
await app.register(cookie)
if (serve) {
  app.addHook("preHandler", async (request) => {
    request.cookies[COOKIE_NAME] ??= makeSession("qa-buyer-a")
  })
}
await app.register(authRoutes)
await app.register(cardRoutes)
await app.register(deckRoutes)
await app.register(marketRoutes)
await app.register(packRoutes)
await app.register(progressionRoutes)
app.get("/health", async () => ({ ok: true, data: { status: "up" } }))

const identities = ["qa-seller", "qa-buyer-a", "qa-buyer-b"]
await db.insert(users).values(identities.map((id) => ({
  id, username: id === "qa-buyer-a" ? "演练账号" : id, coins: 500, onboarded: true,
})))
const samples = DEMO_CARDS.slice(0, 5)
await db.insert(cards).values([
  ...samples.map((face) => ({
    id: face.id, name: face.name, rarity: face.rarity, job: face.job,
    no: face.no, total: face.total, country: face.country, art: face.art, skills: face.skills,
  })),
  { id: "qa-literal", name: "Search_100%", rarity: "L", job: "dps", no: 1, total: 1, skills: [] },
  { id: "qa-other", name: "SearchX1000", rarity: "L", job: "dps", no: 2, total: 2, skills: [] },
])
const listings = await db.insert(userCards).values(Array.from({ length: 90 }, (_, i) => ({
  userId: "qa-seller",
  cardId: i === 0 ? "qa-literal" : i === 1 ? "qa-other" : samples[(i - 2) % samples.length].id,
  level: 7 + i % 20,
}))).returning()
const offers = await db.insert(marketListings).values(listings.map((card, i) => ({
  sellerId: "qa-seller", userCardId: card.id, price: i + 20,
}))).returning()
const lineup = await db.insert(userCards).values(samples.slice(0, 4).map((face) => ({
  userId: "qa-buyer-a", cardId: face.id, level: face.level,
}))).returning()
await db.insert(deckSlots).values(lineup.map((card, slot) => ({ userId: "qa-buyer-a", slot, userCardId: card.id })))

const old = await app.inject("/market/listings")
assert.equal(old.json().data.length, 80)
const literal = await app.inject("/market/search?q=Search_100%25&rarity=L")
assert.equal(literal.statusCode, 200, literal.body)
assert.equal(literal.json().data.total, 1)
assert.equal(literal.json().data.rows[0].card.name, "Search_100%")
const page = await app.inject("/market/search?limit=2&offset=2&sort=price-asc")
assert.equal(page.json().data.total, 90)
assert.deepEqual(page.json().data.rows.map((row: { price: number }) => row.price), [22, 23])
assert.equal((await app.inject("/market/search?limit=0")).statusCode, 400)

const contenders = identities.slice(1)
const buys = await Promise.all(contenders.map((userId) => app.inject({
  method: "POST",
  url: `/users/${userId}/market/buy/${offers[0].id}`,
  cookies: { [COOKIE_NAME]: makeSession(userId) },
})))
assert.deepEqual(buys.map((response) => response.statusCode).sort(), [200, 404], buys.map((response) => response.body).join("\n"))
const winner = contenders[buys.findIndex((response) => response.statusCode === 200)]
const [seller] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, "qa-seller"))
const [buyer] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, winner))
assert.equal(seller.coins, 520)
assert.equal(buyer.coins, 480)

const relisted = await app.inject({
  method: "POST",
  url: `/users/${winner}/market/list`,
  cookies: { [COOKIE_NAME]: makeSession(winner) },
  payload: { userCardId: listings[0].id, price: 39 },
})
assert.equal(relisted.statusCode, 200, relisted.body)
assert.notEqual(relisted.json().data.id, offers[0].id)
const unlisted = await app.inject({
  method: "DELETE",
  url: `/users/${winner}/market/listings/${relisted.json().data.id}`,
  cookies: { [COOKIE_NAME]: makeSession(winner) },
})
assert.equal(unlisted.statusCode, 200, unlisted.body)
assert.equal((await app.inject("/market/search")).json().data.total, 89)
console.log("Verified search, pagination beyond 80 rows, one buyer per offer, balances, relisting, and unlisting.")

if (serve) {
  await app.listen({ port: 53100, host: "localhost" })
  console.log("QA API http://localhost:53100")
} else {
  await app.close()
  await client.close()
}
