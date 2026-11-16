import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import Fastify from "fastify"

import "./auth/env"
import { client } from "./db/client"
import { registerGameRoutes } from "./game-routes"

export async function createGameApi() {
  const app = Fastify({ logger: true })
  app.addHook("onClose", () => client.close())
  try {
    await app.register(cors, { origin: true, credentials: true })
    await app.register(cookie)
    await registerGameRoutes(app)
    return app
  } catch (error) {
    await app.close()
    throw error
  }
}
