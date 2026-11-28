import { randomBytes } from "node:crypto"

import { and, eq, getTableColumns, sql } from "drizzle-orm"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"

import {
  hashPassword,
  isEmail,
  newEmailUserId,
  normalizeEmail,
  verifyPassword,
} from "../auth/email"
import {
  COOKIE_NAME,
  authorizeUrl,
  createState,
  exchangeCode,
  fetchMe,
  isLegacySession,
  readSession,
  takeState,
} from "../auth/osu"
import { WEB_BASE } from "../auth/env"
import { setSessionCookie } from "../auth/guard"
import { rateLimit } from "../auth/rate-limit"
import { CARD_TYPES } from "../card-types"
import { db } from "../db/client"
import { isUniqueViolation } from "../db/errors"
import { cards, userCards, userPacks, users } from "../db/schema"
import { grantHeroCard } from "../gacha/open"
import { loadItems } from "../items"
import { invalidatePublicCardCache } from "./cards"
import { heroCardDef } from "../hero"
import { upsertMirrorCard } from "../mirror"
import { getPackCounts, grantPacks, grantStarterPacks } from "../packs/inventory"
import { STARTER_PACKS } from "../gacha/packs"
import { accountKind, beginBind } from "../account-binding"
import { recordBeat } from "../presence"

/** 登录时把 /me/osu 写成 hero-{id} 卡定义，并放进该用户的卡册 */
async function claimHeroCard(
  userId: string,
  me: Awaited<ReturnType<typeof fetchMe>>,
  grant: boolean,
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

  const def = heroCardDef(me, pool ?? null)
  const { id, ...rest } = def

  await db
    .insert(cards)
    .values({
      id,
      ...rest,
      cardType: CARD_TYPES.hero,
      // import --replace 会删掉本体定义；登录重建时补回仍存实例的最大号。
      pulled: sql<number>`coalesce((
        select max(${userCards.serial}) from ${userCards}
        where ${userCards.cardId} = ${id}
      ), 0)`,
    })
    .onConflictDoUpdate({
      target: cards.id,
      set: {
        ...rest,
        cardType: CARD_TYPES.hero,
        pulled: sql`greatest(${cards.pulled}, excluded.pulled)`,
      },
    })

  // 镜像卡定义跟着本体卡走：资料刷新时一起更新，但不发进卡册。
  await upsertMirrorCard(me.id, def)

  invalidatePublicCardCache()
  const [owned] = await db
    .select({ id: userCards.id })
    .from(userCards)
    .where(and(eq(userCards.userId, userId), eq(userCards.cardId, id)))
    .limit(1)

  if (grant && !owned) {
    await grantHeroCard(userId, id)
  }

}

export async function authRoutes(app: FastifyInstance) {
  /** 登录 / 注册除了按 IP，也按邮箱单独计数，避免一个出口 IP 下互相拖累或单账号被狂试 */
  const emailAccount = (request: FastifyRequest) => {
    const body = request.body as { email?: unknown } | null
    return typeof body?.email === "string" ? normalizeEmail(body.email) : null
  }
  const loginLimit = rateLimit({ max: 10, windowMs: 60_000, accountOf: emailAccount })
  const registerLimit = rateLimit({ max: 5, windowMs: 10 * 60_000, accountOf: emailAccount })
  const guestLimit = rateLimit({ max: 10, windowMs: 60_000 })

  app.get("/auth/osu", async (_request, reply) => {
    const state = createState()
    return reply.redirect(authorizeUrl(state))
  })

  const emailAuthSchema = z.object({
    email: z.string(),
    password: z.string().min(8).max(200),
    username: z.string().trim().min(1).max(24).optional(),
  })

  /** 邮箱注册：建号后与 osu 用户一样走 onboard（领新手包）。 */
  app.post("/auth/email/register", { preHandler: registerLimit }, async (request, reply) => {
    const body = emailAuthSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: "invalid_input", message: "邮箱或密码格式不正确（密码至少 8 位）" },
      })
    }
    const email = normalizeEmail(body.data.email)
    if (!isEmail(email)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "invalid_email", message: "邮箱格式不正确" },
      })
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1)
    if (existing) {
      return reply.code(409).send({
        ok: false,
        error: { code: "email_taken", message: "这个邮箱已经注册过了" },
      })
    }

    const userId = newEmailUserId()
    const username = body.data.username || email.split("@")[0]!.slice(0, 24)
    let user: typeof users.$inferSelect | undefined
    try {
      ;[user] = await db
        .insert(users)
        .values({
          id: userId,
          username,
          email,
          passwordHash: await hashPassword(body.data.password),
          onboarded: false,
        })
        .returning()
    } catch (error) {
      // 并发注册同一邮箱：唯一索引兜底，别让玩家看到 500
      if (!isUniqueViolation(error)) throw error
      return reply.code(409).send({
        ok: false,
        error: { code: "email_taken", message: "这个邮箱已经注册过了" },
      })
    }

    if (!user) throw new Error("邮箱账号写入失败")
    request.log.info({ userId }, "email account created")
    setSessionCookie(reply, userId)

    return {
      ok: true,
      data: { id: user.id, username: user.username, email: user.email, onboarded: user.onboarded },
    }
  })

  app.post("/auth/email/login", { preHandler: loginLimit }, async (request, reply) => {
    const body = emailAuthSchema.pick({ email: true, password: true }).safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: "invalid_input", message: "请输入邮箱和密码" },
      })
    }
    const email = normalizeEmail(body.data.email)
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        passwordHash: users.passwordHash,
        onboarded: users.onboarded,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1)

    if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
      return reply.code(401).send({
        ok: false,
        error: { code: "bad_credentials", message: "邮箱或密码不正确" },
      })
    }

    setSessionCookie(reply, user.id)
    return {
      ok: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        onboarded: user.onboarded,
      },
    }
  })

  /**
   * 游客账号：跳过 osu! OAuth，直接创建一个 guest-xxxx 用户并进入桌面。
   * 没有 osuId，所以没有本体卡；只发普通卡包，神秘卡包依赖 osu! 数据，不发放。
   * 用 POST：GET 会被预取 / 跨站导航触发，等于替访问者切换登录态。
   */
  app.post("/auth/guest", { preHandler: guestLimit }, async (request, reply) => {
    const suffix = randomBytes(6).toString("hex")
    const userId = `guest-${suffix}`

    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        username: `游客 ${suffix.slice(0, 4).toUpperCase()}`,
        onboarded: true,
      })
      .returning()

    if (!user) throw new Error("游客账号写入失败")

    await grantPacks(userId, { starter: STARTER_PACKS.starter }, { source: "starter" })
    request.log.info({ userId }, "guest account created")

    setSessionCookie(reply, userId)
    return { ok: true, data: { id: userId } }
  })

  app.get("/auth/osu/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string }
    const entry = takeState(state)
    if (!code || !entry) {
      return reply.code(400).send({
        ok: false,
        error: { code: "bad_callback", message: "state 或 code 无效" },
      })
    }

    try {
      const accessToken = await exchangeCode(code)
      const me = await fetchMe(accessToken)

      if (entry.bindUserId) {
        // 绑定：回来的必须还是发起绑定的那个登录态，防止别人把自己的 state 塞给你
        if (readSession(request.cookies[COOKIE_NAME]) !== entry.bindUserId) {
          return reply.redirect(`${WEB_BASE}/home?bind=error&reason=session_changed`)
        }
        try {
          await claimHeroCard(entry.bindUserId, me, false)
        } catch (error) {
          request.log.warn({ err: error }, "claim hero card failed")
        }
        const result = await beginBind(entry.bindUserId, me)
        const outcome = result.kind === "rejected" ? `error&reason=${result.reason}` : result.kind
        return reply.redirect(`${WEB_BASE}/home?bind=${outcome}`)
      }

      // 按 osu! id 找人（邮箱号绑定过 osu! 之后，id 不再是 osu-xxx）；没有才建新号
      let [user] = await db.select().from(users).where(eq(users.osuId, me.id)).limit(1)
      if (user) {
        await db.update(users).set({ username: me.username }).where(eq(users.id, user.id))
      } else {
        const [clash] = await db.select({ id: users.id }).from(users).where(eq(users.id, `osu-${me.id}`)).limit(1)
        await db
          .insert(users)
          .values({
            id: clash ? `osu-${me.id}-${randomBytes(3).toString("hex")}` : `osu-${me.id}`,
            username: me.username,
            osuId: me.id,
            onboarded: false,
          })
          .onConflictDoNothing()
        ;[user] = await db.select().from(users).where(eq(users.osuId, me.id)).limit(1)
      }
      if (!user) throw new Error("用户写入失败")
      const userId = user.id

      try {
        await claimHeroCard(userId, me, false)
      } catch (error) {
        // 认领失败不能挡住登录
        request.log.warn({ err: error }, "claim hero card failed")
      }

      setSessionCookie(reply, userId)

      return reply.redirect(`${WEB_BASE}/`)
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
    const rawSession = request.cookies[COOKIE_NAME]
    const userId = readSession(rawSession)
    if (!userId) {
      return reply.code(401).send({ ok: false, error: { code: "unauthorized", message: "未登录" } })
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) {
      return reply.code(401).send({ ok: false, error: { code: "unauthorized", message: "用户不存在" } })
    }
    if (isLegacySession(rawSession)) setSessionCookie(reply, userId)

    // 镜像池按最近活跃筛选；/auth/me 是每次进桌面的必经请求，顺便当一次心跳。
    await recordBeat(userId)

    let hero = null
    if (user.osuId != null) {
      const [row] = await db
        .select({
          ...getTableColumns(cards),
          userCardId: userCards.id,
          level: userCards.level,
          constellation: userCards.constellation,
          exp: userCards.exp,
          serial: userCards.serial,
          rollBp: userCards.rollBp,
          skillRefs: userCards.skillRefs,
          foil: userCards.foil,
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
        publicId: user.publicId,
        username: user.username,
        osuId: user.osuId,
        email: user.email ?? null,
        /** 账号类型：osu（绑定了 osu!，可能同时有邮箱）/ email / guest */
        kind: accountKind(user),
        hasEmail: !!user.email,
        /** 游客：既没有 osu! 也没有邮箱 */
        isGuest: user.osuId == null && !user.email,
        avatarUrl: user.osuId == null ? null : `https://a.ppy.sh/${user.osuId}`,
        profileUrl: user.osuId == null ? null : `https://osu.ppy.sh/users/${user.osuId}`,
        onboarded: user.onboarded,
        /** 只用来决定要不要显示后台入口；真正的权限每次请求都在服务端查 */
        isAdmin: user.isAdmin,
        essence: user.essence,
        expPool: user.expPool,
        items: await loadItems(user.id),
        coins: user.coins,
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

    // 条件更新 + 发新手包在同一个事务里：发包失败会回滚 onboarded，用户可以重试补领
    const { starterGranted } = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(users)
        .set({ onboarded: true })
        .where(and(eq(users.id, userId), eq(users.onboarded, false)))
        .returning({ id: users.id })
      if (claimed.length === 0) return { starterGranted: false }
      await grantStarterPacks(userId, tx)
      return { starterGranted: true }
    })

    return {
      ok: true,
      data: { onboarded: true, starterGranted },
    }
  })

  /**
   * 回归玩家补包：已经领过 30 包但已经花完时，教程第一步会卡住。
   * 只在“普通包为 0 且从未补发过”时发 1 包，避免无限刷包。
   */
  app.post("/auth/tutorial-pack", async (request, reply) => {
    const userId = readSession(request.cookies[COOKIE_NAME])
    if (!userId) {
      return reply
        .code(401)
        .send({ ok: false, error: { code: "unauthorized", message: "未登录" } })
    }
    const [user] = await db
      .select({
        onboarded: users.onboarded,
        tutorialPackClaimed: users.tutorialPackClaimed,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) {
      return reply
        .code(401)
        .send({ ok: false, error: { code: "unauthorized", message: "用户不存在" } })
    }
    if (!user.onboarded) {
      return reply.code(400).send({
        ok: false,
        error: { code: "onboarding_required", message: "先完成账号引导" },
      })
    }

    const counts = await getPackCounts(userId)
    if (counts.normal > 0 || user.tutorialPackClaimed) {
      return { ok: true, data: { granted: false, packs: counts } }
    }

    let granted = false
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(users)
        .set({
          tutorialPackClaimed: true,
          expPool: sql`${users.expPool} + 300`,
          coins: sql`${users.coins} + 200`,
        })
        .where(
          and(
            eq(users.id, userId),
            eq(users.tutorialPackClaimed, false),
          ),
        )
        .returning({ id: users.id })
      if (claimed.length === 0) return

      granted = true
      await tx
        .insert(userPacks)
        .values({ userId, pool: "normal", count: 1 })
        .onConflictDoUpdate({
          target: [userPacks.userId, userPacks.pool],
          set: { count: sql`${userPacks.count} + 1` },
        })
    })

    return {
      ok: true,
      data: { granted, packs: await getPackCounts(userId) },
    }
  })

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" })
    return { ok: true, data: null }
  })
}
