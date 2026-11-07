import cors from "@fastify/cors"
import Fastify from "fastify"

import { cardRoutes } from "./routes/cards"
import { packRoutes } from "./routes/packs"

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(packRoutes)
await app.register(cardRoutes)

app.get("/health", async () => ({ ok: true, data: { status: "up" } }))

const port = Number(process.env.PORT ?? 3100)
await app.listen({ port, host: "0.0.0.0" })
