import { randomBytes } from "node:crypto"
import path from "node:path"

import cookie from "@fastify/cookie"
import Fastify from "fastify"
import { z } from "zod"

const host = "127.0.0.1"
const fixtureAction = z.object({ action: z.enum(["resources", "deck", "market"]) })

export async function createPlaytestApi(profile = "pg", ports = { api: 3320, renderer: 5273 }) {
  const api = new URL(`http://${host}:${ports.api}`)
  const rendererOrigin = `http://${host}:${ports.renderer}`
  if (!/^[a-z][a-z0-9-]*$/.test(profile)) throw new Error("测试存档名称无效")

  // Set these before loading the database and authentication modules.
  process.env.PG_DATA_DIR = path.resolve(import.meta.dirname, "../../../.cache/developer", profile)
  process.env.SESSION_SECRET = randomBytes(32).toString("hex")
  process.env.WEB_BASE_URL = rendererOrigin
  process.env.API_BASE_URL = api.origin
  process.env.CHOKE_PLAYTEST = "1"

  const { registerGameRoutes } = await import("./game-routes")
  const { COOKIE_NAME, makeSession } = await import("./auth/osu")
  const { client } = await import("./db/client")
  const { PLAYTEST_PLAYER, seedPlaytest, readPlaytest, replenishPlaytest } = await import("./playtest-fixtures")
  await seedPlaytest()

  const app = Fastify({ logger: import.meta.main })
  await app.register(cookie)
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin
    if (request.headers.host !== api.host || (origin && origin !== rendererOrigin && origin !== api.origin)) {
      return reply.code(403).send({ ok: false, error: { code: "local_only", message: "仅限本机测试客户端" } })
    }
  })
  app.addHook("preHandler", async (request, reply) => {
    if (request.routeOptions.url?.startsWith("/auth/osu")) {
      return reply.code(404).send({ ok: false, error: { code: "playtest", message: "测试客户端使用本机账号" } })
    }
    request.cookies[COOKIE_NAME] = makeSession(PLAYTEST_PLAYER)
  })
  app.addHook("onClose", () => client.close())

  await registerGameRoutes(app)
  app.get("/developer/state", async () => ({ ok: true, data: await readPlaytest() }))
  app.post("/developer/fixtures", async (request, reply) => {
    const result = fixtureAction.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ ok: false, error: { code: "bad_fixture", message: "未知的测试数据" } })
    }
    return { ok: true, data: await replenishPlaytest(result.data.action) }
  })

  return app
}

if (import.meta.main) {
  const app = await createPlaytestApi()
  await app.listen({ host, port: 3320 })
}
