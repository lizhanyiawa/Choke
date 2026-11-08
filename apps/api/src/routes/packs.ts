import { and, eq, getTableColumns } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { requireSelf, requireSession } from "../auth/guard"
import { db } from "../db/client"
import { cards, userCards, users } from "../db/schema"
import { openPack } from "../gacha/open"
import { POOL_NAMES, POOL_WEIGHTS, type PoolId } from "../gacha/pools"
import { addPacks, consumePack, getPackCounts, type PackPoolId } from "../packs/inventory"

const poolIds = Object.keys(POOL_WEIGHTS) as [PoolId, ...PoolId[]]

async function loadHero(userId: string, heroId: string) {
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
    .where(and(eq(userCards.userId, userId), eq(userCards.cardId, heroId)))
    .limit(1)
  return row ?? null
}

export async function packRoutes(app: FastifyInstance) {
  app.get("/packs", async () => {
    return {
      ok: true,
      data: poolIds.map((id) => ({
        id,
        name: POOL_NAMES[id],
        weights: POOL_WEIGHTS[id],
      })),
    }
  })

  app.get("/users/:userId/packs", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const packs = await getPackCounts(userId)
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    let heroClaimed = false
    if (user?.osuId != null) {
      const [hero] = await db
        .select({ id: userCards.id })
        .from(userCards)
        .where(and(eq(userCards.userId, userId), eq(userCards.cardId, `hero-${user.osuId}`)))
        .limit(1)
      heroClaimed = !!hero
    }

    return { ok: true, data: { packs, heroClaimed } }
  })

  app.post("/users/:userId/packs/mystery/open", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const body = z
      .object({ answers: z.array(z.string()).max(10).optional() })
      .safeParse(request.body ?? {})
    if (!body.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: "bad_request", message: "问卷答案格式不合法" },
      })
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) {
      return reply.code(401).send({
        ok: false,
        error: { code: "unauthorized", message: "用户不存在" },
      })
    }
    if (!user.onboarded) {
      return reply.code(400).send({
        ok: false,
        error: { code: "onboarding_required", message: "先完成新手引导" },
      })
    }
    if (user.osuId == null) {
      return reply.code(400).send({
        ok: false,
        error: { code: "no_osu", message: "这个账号没有绑定 osu!" },
      })
    }

    const heroId = `hero-${user.osuId}`
    const [existing] = await db
      .select({ id: userCards.id })
      .from(userCards)
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, heroId)))
      .limit(1)
    if (existing) {
      return reply.code(400).send({
        ok: false,
        error: { code: "hero_claimed", message: "本体卡已经领取过了" },
      })
    }

    const [definition] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, heroId)).limit(1)
    if (!definition) {
      return reply.code(400).send({
        ok: false,
        error: { code: "hero_not_ready", message: "本体卡还没生成，请重新登录一次 osu!" },
      })
    }

    const consumed = await consumePack(userId, "mystery")
    if (!consumed) {
      return reply.code(400).send({
        ok: false,
        error: { code: "no_packs", message: "背包里没有神秘卡包" },
      })
    }

    await db.update(cards).set({ heroBonus: user.heroBonus }).where(eq(cards.id, heroId))
    await db.insert(userCards).values({ userId, cardId: heroId })

    return {
      ok: true,
      data: {
        hero: await loadHero(userId, heroId),
        answers: body.data.answers ?? [],
        packs: await getPackCounts(userId),
      },
    }
  })

  app.post("/packs/:pool/open", async (request, reply) => {
    // 只认 session，body.userId 仅为兼容旧前端而保留
    const userId = requireSession(request, reply)
    if (!userId) return

    const params = z.object({ pool: z.enum(poolIds) }).safeParse(request.params)
    const body = z
      .object({
        userId: z.string().min(1).max(64).optional(),
        count: z.number().int().min(1).max(10).optional(),
      })
      .safeParse(request.body ?? {})

    if (!params.success || !body.success) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "bad_request",
          message: params.success ? "body 不合法" : "pool 不合法",
          details: params.success
            ? body.success
              ? null
              : body.error.flatten()
            : params.error.flatten(),
        },
      })
    }

    const pool = params.data.pool as PackPoolId
    const consumed = await consumePack(userId, pool)
    if (!consumed) {
      return reply.code(400).send({
        ok: false,
        error: { code: "no_packs", message: "背包里没有这个卡包" },
      })
    }

    try {
      const result = await openPack(userId, params.data.pool, body.data.count ?? 5)
      return {
        ok: true,
        data: { ...result, packs: await getPackCounts(userId) },
      }
    } catch (error) {
      // 开包失败时把预扣的卡包还回去
      await addPacks(userId, { [pool]: 1 })
      request.log.error(error)
      return reply.code(500).send({
        ok: false,
        error: {
          code: "open_failed",
          message: error instanceof Error ? error.message : "抽卡失败",
        },
      })
    }
  })
}
