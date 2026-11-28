import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { JOB_ORDER } from "@choke/shared/skills"

import { requireSelf } from "../auth/guard"
import { CARD_TYPES } from "../card-types"
import { db } from "../db/client"
import { cards, userCards } from "../db/schema"
import { listedUserCardIds, lockedUserCardIds } from "../expedition/locks"

const RARITY_RANK = sql`CASE ${cards.rarity}
  WHEN 'C' THEN 0
  WHEN 'UC' THEN 1
  WHEN 'R' THEN 2
  WHEN 'E' THEN 3
  WHEN 'L' THEN 4
  WHEN 'Mythic' THEN 5
  WHEN 'Prismatic' THEN 6
  ELSE -1
END`

const SORTS = ["recent", "rarity", "pp", "name"] as const
const USER_CARD_SORTS = ["recent", "rarity", "pp", "level", "name"] as const

/** 玩家名按字面包含查找，不把名字里的下划线当通配符。 */
function namePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`
}

interface PublicCardsPayload {
  rows: (typeof cards.$inferSelect)[]
  total: number
  limit: number
  offset: number
}
const publicCardsCache = new Map<string, PublicCardsPayload>()
const publicCountCache = new Map<string, number>()
const PUBLIC_CACHE_LIMIT = 64
let publicStats: { total: number; byRarity: Record<string, number> } | null = null
let publicCountries: { code: string; total: number }[] | null = null
let publicCardsRevision = 0

/** 图鉴分母（卡池按稀有度 / 国家的总数）与用户无关，进程内缓存即可。 */
interface CodexPoolStats {
  total: number
  byRarity: Record<string, number>
  countries: Record<string, number>
}
let codexPoolStats: CodexPoolStats | null = null

/** 发行数变化只失效卡行；卡定义总数、稀有度统计仍可复用。 */
export function invalidatePublicCardRows() {
  publicCardsCache.clear()
  publicCardsRevision += 1
}
export function invalidatePublicCardCache() {
  invalidatePublicCardRows()
  publicCountCache.clear()
  publicStats = null
  publicCountries = null
  codexPoolStats = null
}

async function queryPublicCards(query: {
  rarity?: string
  q?: string
  country?: string
  sort: (typeof SORTS)[number]
  limit: number
  offset: number
}) {
  const filters = [eq(cards.cardType, CARD_TYPES.pool)]
  if (query.rarity) filters.push(eq(cards.rarity, query.rarity))
  if (query.country) filters.push(eq(cards.country, query.country))
  if (query.q) filters.push(ilike(cards.name, `%${query.q}%`))
  const where = and(...filters)
  const countKey = JSON.stringify({ rarity: query.rarity, q: query.q, country: query.country })
  const cachedTotal = publicCountCache.get(countKey)
    ?? (!query.rarity && !query.country && !query.q ? publicStats?.total : undefined)
  const orderBy =
    query.sort === "rarity"
      ? [desc(RARITY_RANK), sql`${cards.pp} desc nulls last`]
      : query.sort === "name"
        ? [asc(cards.name)]
        : [sql`${cards.pp} desc nulls last`]
  orderBy.push(asc(cards.id))
  const rowsPromise = db
    .select()
    .from(cards)
    .where(where)
    .orderBy(...orderBy)
    .limit(query.limit)
    .offset(query.offset)
  const totalPromise = cachedTotal == null
    ? db.select({ value: count() }).from(cards).where(where)
    : Promise.resolve([{ value: cachedTotal }])
  const [rows, totalRows] = await Promise.all([rowsPromise, totalPromise])
  const total = Number(totalRows[0]?.value ?? 0)
  if (cachedTotal == null) {
    if (publicCountCache.size >= PUBLIC_CACHE_LIMIT) {
      publicCountCache.delete(publicCountCache.keys().next().value!)
    }
    publicCountCache.set(countKey, total)
  }
  return { rows, total, limit: query.limit, offset: query.offset }
}

async function loadCodexPoolStats(): Promise<CodexPoolStats> {
  if (codexPoolStats) return codexPoolStats
  const rows = await db
    .select({ rarity: cards.rarity, country: cards.country, total: count() })
    .from(cards)
    .where(eq(cards.cardType, CARD_TYPES.pool))
    .groupBy(cards.rarity, cards.country)

  const byRarity: Record<string, number> = {}
  const countries: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const value = Number(row.total)
    total += value
    byRarity[row.rarity] = (byRarity[row.rarity] ?? 0) + value
    if (row.country) countries[row.country] = (countries[row.country] ?? 0) + value
  }
  codexPoolStats = { total, byRarity, countries }
  return codexPoolStats
}

export async function cardRoutes(app: FastifyInstance) {
  app.get("/cards", async (request) => {
    const query = z
      .object({
        rarity: z.string().optional(),
        q: z.string().optional(),
        country: z.string().max(8).optional(),
        sort: z.enum(SORTS).default("pp"),
        limit: z.coerce.number().int().min(1).max(200).default(48),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const key = JSON.stringify(query)
    let data = publicCardsCache.get(key)
    if (!data) {
      const revision = publicCardsRevision
      data = await queryPublicCards(query)
      // 发卡可能在查询期间提交，不能把发卡前的累计数重新写回缓存。
      if (revision === publicCardsRevision) {
        if (publicCardsCache.size >= PUBLIC_CACHE_LIMIT) {
          publicCardsCache.delete(publicCardsCache.keys().next().value!)
        }
        publicCardsCache.set(key, data)
      }
    }
    return { ok: true, data }
  })

  app.get("/cards/stats", async () => {
    if (publicStats) return { ok: true, data: publicStats }
    const rows = await db
      .select({ rarity: cards.rarity, value: count() })
      .from(cards)
      .where(eq(cards.cardType, CARD_TYPES.pool))
      .groupBy(cards.rarity)

    const byRarity: Record<string, number> = {}
    let total = 0
    for (const row of rows) {
      const value = Number(row.value)
      byRarity[row.rarity] = value
      total += value
    }
    publicStats = { total, byRarity }
    return { ok: true, data: publicStats }
  })

  app.get("/cards/countries", async () => {
    if (publicCountries) return { ok: true, data: publicCountries }

    const rows = await db
      .select({ code: cards.country, value: count() })
      .from(cards)
      .where(eq(cards.cardType, CARD_TYPES.pool))
      .groupBy(cards.country)

    publicCountries = rows
      .filter((row): row is { code: string; value: number } => !!row.code)
      .map((row) => ({ code: row.code, total: Number(row.value) }))
      .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))

    return { ok: true, data: publicCountries }
  })

  app.get("/users/:userId/codex/stats", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const [pool, ownedRows] = await Promise.all([
      loadCodexPoolStats(),
      db
        .select({
          rarity: cards.rarity,
          country: cards.country,
          owned: countDistinct(userCards.cardId),
        })
        .from(userCards)
        .innerJoin(cards, eq(cards.id, userCards.cardId))
        .where(and(eq(userCards.userId, userId), eq(cards.cardType, CARD_TYPES.pool)))
        .groupBy(cards.rarity, cards.country),
    ])

    const byRarity: Record<string, { total: number; owned: number }> = {}
    for (const [rarity, value] of Object.entries(pool.byRarity)) {
      byRarity[rarity] = { total: value, owned: 0 }
    }
    const countries = new Map<string, { code: string; total: number; owned: number }>()
    for (const [code, value] of Object.entries(pool.countries)) {
      countries.set(code, { code, total: value, owned: 0 })
    }

    let owned = 0
    for (const row of ownedRows) {
      const rowOwned = Number(row.owned)
      owned += rowOwned
      const rarity = (byRarity[row.rarity] ??= { total: 0, owned: 0 })
      rarity.owned += rowOwned
      if (row.country) {
        const country = countries.get(row.country) ?? { code: row.country, total: 0, owned: 0 }
        country.owned += rowOwned
        countries.set(row.country, country)
      }
    }

    return {
      ok: true,
      data: {
        total: pool.total,
        owned,
        byRarity,
        countries: [...countries.values()].sort(
          (a, b) => b.total - a.total || a.code.localeCompare(b.code),
        ),
      },
    }
  })

  app.get("/users/:userId/codex", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const query = z
      .object({
        rarity: z.string().optional(),
        q: z.string().optional(),
        country: z.string().max(8).optional(),
        owned: z.enum(["all", "owned", "unseen"]).default("all"),
        sort: z.enum(SORTS).default("rarity"),
        limit: z.coerce.number().int().min(1).max(200).default(24),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const ownedCards = db
      .selectDistinct({ cardId: userCards.cardId })
      .from(userCards)
      .where(eq(userCards.userId, userId))
      .as("owned_cards")

    const baseFilters = [eq(cards.cardType, CARD_TYPES.pool)]
    if (query.rarity) baseFilters.push(eq(cards.rarity, query.rarity))
    if (query.country) baseFilters.push(eq(cards.country, query.country))
    if (query.q) baseFilters.push(ilike(cards.name, namePattern(query.q)))

    const filters = [...baseFilters]
    if (query.owned === "owned") filters.push(isNotNull(ownedCards.cardId))
    if (query.owned === "unseen") filters.push(isNull(ownedCards.cardId))
    const where = and(...filters)

    const orderBy =
      query.sort === "rarity"
        ? [desc(RARITY_RANK), sql`${cards.pp} desc nulls last`]
        : query.sort === "name"
          ? [asc(cards.name)]
          : [sql`${cards.pp} desc nulls last`]
    orderBy.push(asc(cards.id))

    // 三条查询互不依赖，一次并发发出去，避免三次串行往返。
    const [rows, [{ value: total }], [{ value: ownedTotal }]] = await Promise.all([
      db
        .select({
          ...getTableColumns(cards),
          owned: sql<boolean>`(${ownedCards.cardId} is not null)`,
        })
        .from(cards)
        .leftJoin(ownedCards, eq(ownedCards.cardId, cards.id))
        .where(where)
        .orderBy(...orderBy, asc(cards.id))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ value: count() })
        .from(cards)
        .leftJoin(ownedCards, eq(ownedCards.cardId, cards.id))
        .where(where),
      db
        .select({ value: count() })
        .from(cards)
        .leftJoin(ownedCards, eq(ownedCards.cardId, cards.id))
        .where(and(...baseFilters, isNotNull(ownedCards.cardId))),
    ])

    // 技能属于实例：只给本页已收集的卡取一份实际技能，不把多张同名卡算进图鉴。
    const ownedIds = rows.filter((row) => row.owned).map((row) => row.id)
    const previews = ownedIds.length ? await db
      .selectDistinctOn([userCards.cardId], {
        cardId: userCards.cardId,
        skillRefs: userCards.skillRefs,
        serial: userCards.serial,
      })
      .from(userCards)
      .where(and(eq(userCards.userId, userId), inArray(userCards.cardId, ownedIds)))
      .orderBy(asc(userCards.cardId), desc(userCards.obtainedAt), desc(userCards.id)) : []
    const previewById = new Map(previews.map(({ cardId, skillRefs, serial }) => [cardId, { skillRefs, serial }]))

    return {
      ok: true,
      data: {
        rows: rows.map((row) => ({ ...row, ownedPreview: previewById.get(row.id) ?? null })),
        total: Number(total),
        ownedTotal: Number(ownedTotal),
        limit: query.limit,
        offset: query.offset,
      },
    }
  })

  app.get("/cards/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1)
    if (!row) {
      return reply.code(404).send({ ok: false, error: { code: "not_found", message: "卡不存在" } })
    }
    return { ok: true, data: row }
  })

  app.get("/users/:userId/cards", async (request, reply) => {
    const params = z.object({ userId: z.string() }).parse(request.params)
    const userId = requireSelf(request, reply, params.userId)
    if (!userId) return

    const parsed = z
      .object({
        rarity: z.string().optional(),
        q: z.string().trim().max(64).optional(),
        country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
        job: z.enum(JOB_ORDER).optional(),
        minLevel: z.coerce.number().int().min(1).max(200).optional(),
        foil: z.enum(["1", "0", "true", "false"]).optional(),
        sort: z.enum(USER_CARD_SORTS).default("recent"),
        order: z.enum(["asc", "desc"]).optional(),
        limit: z.coerce.number().int().min(1).max(60).default(24),
        offset: z.coerce.number().int().min(0).default(0),
        ids: z.string().optional(),
        cardType: z.enum([CARD_TYPES.pool, CARD_TYPES.hero, CARD_TYPES.mirror]).optional(),
        type: z.enum([CARD_TYPES.pool, CARD_TYPES.hero, CARD_TYPES.mirror]).optional(),
      })
      .safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: "bad_request", message: "卡册筛选参数不合法", details: parsed.error.flatten() },
      })
    }
    const query = parsed.data

    const filters = [eq(userCards.userId, userId)]
    if (query.rarity) filters.push(eq(cards.rarity, query.rarity))
    if (query.q) filters.push(ilike(cards.name, namePattern(query.q)))
    if (query.country) filters.push(eq(cards.country, query.country))
    if (query.job) filters.push(eq(cards.job, query.job))
    if (query.minLevel) filters.push(gte(userCards.level, query.minLevel))
    if (query.cardType ?? query.type) filters.push(eq(cards.cardType, (query.cardType ?? query.type)!))
    if (query.foil !== undefined) filters.push(eq(userCards.foil, query.foil === "1" || query.foil === "true"))
    // 按实例 id 刷新桌面卡面快照；所有筛选仍限制在当前用户名下。
    if (query.ids) {
      const ids = query.ids.split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
      filters.push(inArray(userCards.id, ids.length ? ids : [0]))
    }
    const where = and(...filters)

    const dir = query.order ?? (query.sort === "name" ? "asc" : "desc")
    const isAsc = dir === "asc"
    const orderBy =
      query.sort === "rarity"
        ? [
            isAsc ? asc(RARITY_RANK) : desc(RARITY_RANK),
            isAsc ? sql`${cards.pp} asc nulls last` : sql`${cards.pp} desc nulls last`,
          ]
        : query.sort === "pp"
          ? [isAsc ? sql`${cards.pp} asc nulls last` : sql`${cards.pp} desc nulls last`]
          : query.sort === "level"
            ? [
                isAsc ? asc(userCards.level) : desc(userCards.level),
                desc(RARITY_RANK),
              ]
            : query.sort === "name"
              ? [isAsc ? asc(cards.name) : desc(cards.name)]
              : [isAsc ? asc(userCards.obtainedAt) : desc(userCards.obtainedAt)]
    orderBy.push(isAsc ? asc(userCards.id) : desc(userCards.id))

    const rows = await db
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
        obtainedAt: userCards.obtainedAt,
      })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(where)
      .orderBy(...orderBy, desc(userCards.id))
      .limit(query.limit)
      .offset(query.offset)

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(where)

    const ids = rows.map((row) => row.userCardId)
    const listed = await listedUserCardIds(db, ids)
    const locked = await lockedUserCardIds(db, userId)

    return {
      ok: true,
      data: {
        // 编队页要据此标出「已上架 / 出征中」，避免一键编队后才在开战时被拒
        rows: rows.map((row) => ({
          ...row,
          listed: listed.has(row.userCardId),
          locked: locked.has(row.userCardId),
        })),
        total: Number(total),
        limit: query.limit,
        offset: query.offset,
      },
    }
  })
}
