import type { FastifyInstance } from "fastify"

import { authRoutes } from "./routes/auth"
import { cardRoutes } from "./routes/cards"
import { deckRoutes } from "./routes/decks"
import { marketRoutes } from "./routes/market"
import { packRoutes } from "./routes/packs"
import { progressionRoutes } from "./routes/progression"
import { cultivationRoutes } from "./routes/cultivation"

export async function registerGameRoutes(app: FastifyInstance) {
  await app.register(authRoutes)
  await app.register(packRoutes)
  await app.register(cardRoutes)
  await app.register(deckRoutes)
  await app.register(marketRoutes)
  await app.register(progressionRoutes)
  await app.register(cultivationRoutes)
  app.get("/health", async () => ({ ok: true, data: { status: "up" } }))
}
