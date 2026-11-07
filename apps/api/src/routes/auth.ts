import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"

import {
  COOKIE_NAME,
  authorizeUrl,
  consumeState,
  createState,
  exchangeCode,
  fetchMe,
  makeSession,
  readSession,
} from "../auth/osu"
import { WEB_BASE } from "../auth/env"
import { db } from "../db/client"
import { users } from "../db/schema"

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/osu", async (_request, reply) => {
    const state = createState()
    return reply.redirect(authorizeUrl(state))
  })

  app.get("/auth/osu/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string }
    if (!code || !consumeState(state)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "bad_callback", message: "state 或 code 无效" },
      })
    }

    try {
      const accessToken = await exchangeCode(code)
      const me = await fetchMe(accessToken)
      const userId = `osu-${me.id}`

      await db
        .insert(users)
        .values({ id: userId, username: me.username, osuId: me.id })
        .onConflictDoUpdate({ target: users.id, set: { username: me.username } })

      reply.setCookie(COOKIE_NAME, makeSession(userId), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      })

      return reply.redirect(`${WEB_BASE}/gacha`)
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({
        ok: false,
        error: {
          code: "oauth_failed",
          message: error instanceof Error ? error.message : "osu 登录失败",
        },
      })
    }
  })

  app.get("/auth/me", async (request, reply) => {
    const userId = readSession(request.cookies[COOKIE_NAME])
    if (!userId) {
      return reply.code(401).send({ ok: false, error: { code: "unauthorized", message: "未登录" } })
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) {
      return reply.code(401).send({ ok: false, error: { code: "unauthorized", message: "用户不存在" } })
    }
    return { ok: true, data: { id: user.id, username: user.username, osuId: user.osuId } }
  })

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" })
    return { ok: true, data: null }
  })
}
