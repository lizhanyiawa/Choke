import { and, eq, getTableColumns } from "drizzle-orm"
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
import { cards, userCards, users } from "../db/schema"
import { invalidateCardCache } from "../gacha/open"
import { heroCardDef } from "../hero"
import { heroIndex, heroPersonalBonus, heroStatsFromOsu } from "../../../../src/pool/hero"

/** 登录时把 /me/osu 写成 hero-{id} 卡定义，并放进该用户的卡册 */
async function claimHeroCard(
  userId: string,
  me: Awaited<ReturnType<typeof fetchMe>>,
  onboarded: boolean,
  personalBonusBp: number,
) {
  const [pool] = await db
    .select({
      no: cards.no,
      total: cards.total,
      globalRank: cards.globalRank,
      pp: cards.pp,
      rarity: cards.rarity,
    })
    .from(cards)
    .where(eq(cards.id, `pool-${me.id}`))
    .limit(1)

  const def = heroCardDef(me, pool ?? null, onboarded, personalBonusBp)
  const { id, heroIndex: _index, heroPower: _power, ...rest } = def

  await db
    .insert(cards)
    .values({ id, ...rest })
    .onConflictDoUpdate({ target: cards.id, set: rest })

  const [owned] = await db
    .select({ id: userCards.id })
    .from(userCards)
    .where(and(eq(userCards.userId, userId), eq(userCards.cardId, id)))
    .limit(1)

  if (!owned) {
    await db.insert(userCards).values({ userId, cardId: id })
  }

  invalidateCardCache()
}

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
      const hero = heroIndex(heroStatsFromOsu(me))
      const personalBonusBp = Math.round(heroPersonalBonus(hero.index) * 10000)

      const [user] = await db
        .insert(users)
        .values({
          id: userId,
          username: me.username,
          osuId: me.id,
          onboarded: false,
          heroBonus: personalBonusBp,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { username: me.username, heroBonus: personalBonusBp },
        })
        .returning()

      if (!user) throw new Error("用户写入失败")

      try {
        await claimHeroCard(userId, me, user.onboarded, user.heroBonus)
      } catch (error) {
        // 认领失败不能挡住登录
        request.log.warn({ err: error }, "claim hero card failed")
      }

      reply.setCookie(COOKIE_NAME, makeSession(userId), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      })

      return reply.redirect(`${WEB_BASE}${user.onboarded ? "/gacha" : "/intro"}`)
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

    let hero = null
    if (user.osuId != null) {
      const [row] = await db
        .select({
          ...getTableColumns(cards),
          userCardId: userCards.id,
          level: userCards.level,
          constellation: userCards.constellation,
          exp: userCards.exp,
        })
        .from(userCards)
        .innerJoin(cards, eq(cards.id, userCards.cardId))
        .where(and(eq(userCards.userId, user.id), eq(userCards.cardId, `hero-${user.osuId}`)))
        .limit(1)
      hero = row ?? null
    }

    return {
      ok: true,
      data: {
        id: user.id,
        username: user.username,
        osuId: user.osuId,
        onboarded: user.onboarded,
        heroBonus: user.heroBonus,
        hero,
      },
    }
  })

  app.post("/auth/onboard", async (request, reply) => {
    const userId = readSession(request.cookies[COOKIE_NAME])
    if (!userId) {
      return reply.code(401).send({ ok: false, error: { code: "unauthorized", message: "未登录" } })
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) {
      return reply.code(401).send({ ok: false, error: { code: "unauthorized", message: "用户不存在" } })
    }

    await db.update(users).set({ onboarded: true }).where(eq(users.id, userId))
    if (user.osuId != null) {
      await db
        .update(cards)
        .set({ heroBonus: user.heroBonus })
        .where(eq(cards.id, `hero-${user.osuId}`))
    }

    return {
      ok: true,
      data: { onboarded: true, heroBonus: user.heroBonus },
    }
  })

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" })
    return { ok: true, data: null }
  })
}
