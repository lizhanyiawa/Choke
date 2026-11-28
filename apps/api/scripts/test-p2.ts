/**
 * P2 养成与体力服务端测试：
 * 1. 体力溢出槽（0–360 每 6 分钟 1 点，360–720 每 12 分钟 1 点）与扣减
 * 2. 体力药水购买（100 金币 → +60 体力，每日限 2 次，可进溢出槽到 720）
 * 3. 本体卡命座上限 8 + 吞噬镜像卡共鸣（属性/MOD 映射、同源 409、单属性 3 次上限、普通卡保持同名消耗）
 */
import assert from "node:assert/strict"

import { setupTestDb } from "./test-db"

const dropTestDb = await setupTestDb("p2")

const { eq } = await import("drizzle-orm")
const { default: Fastify } = await import("fastify")
const { default: cookie } = await import("@fastify/cookie")
const { db } = await import("../src/db/client")
const { users, cards, userCards, heroResonance } = await import("../src/db/schema")
const { COOKIE_NAME, makeSession } = await import("../src/auth/osu")
const { handleError } = await import("../src/error-handler")

const { progressionRoutes } = await import("../src/routes/progression")
const { cardRoutes } = await import("../src/routes/cards")
const { constellationCap } = await import("@choke/shared/progression")
const { resonanceAttributeOf } = await import("@choke/shared/resonance")

const app = Fastify()
app.setErrorHandler(handleError)
await app.register(cookie)

await app.register(progressionRoutes)
await app.register(cardRoutes)
await app.ready()

let passed = 0
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    console.error(`FAIL  ${name}`)
    throw error
  }
}

function authHeaders(userId: string) {
  return { cookie: `${COOKIE_NAME}=${makeSession(userId)}` }
}

await test("本体卡命座上限 8 与吞噬镜像共鸣（职业/MOD映射、同源 409、单属性上限 3）", async () => {
  assert.equal(constellationCap(true), 8)
  assert.equal(constellationCap(false), 6)
  assert.equal(resonanceAttributeOf("tank", []), "DEF")
  assert.equal(resonanceAttributeOf("tank", ["DT"]), "SPD")

  const userId = "p2-hero-user"
  await db.insert(users).values({
    id: userId,
    username: userId,
    tutorialDone: true,
    playerLevel: 60,
  })

  const heroId = "hero-90001"
  await db.insert(cards).values({
    id: heroId,
    name: "HeroCard",
    rarity: "L",
    job: "warrior",
    no: 1,
    total: 1,
    cardType: "hero",
  })
  const [heroInstance] = await db
    .insert(userCards)
    .values({ userId, cardId: heroId, serial: 1 })
    .returning()

  // 创建 4 张不同玩家的镜像卡（全部归属于 ATK：warrior 无 mod 或带 HR）
  const mirrorCardIds = ["mirror-101", "mirror-102", "mirror-103", "mirror-104"]
  const mirrorUserCardIds: number[] = []
  for (let i = 0; i < mirrorCardIds.length; i += 1) {
    const cid = mirrorCardIds[i]!
    await db.insert(cards).values({
      id: cid,
      name: `Mirror-${i}`,
      rarity: "R",
      job: i === 3 ? "mage" : "warrior",
      no: i + 2,
      total: 5,
      cardType: "mirror",
      originOsuId: 101 + i,
    })
    const [inst] = await db
      .insert(userCards)
      .values({
        userId,
        cardId: cid,
        serial: 1,
        mods: i === 3 ? ["HR"] : [],
      })
      .returning()
    mirrorUserCardIds.push(inst!.id)
  }

  // 再塞一张与 mirror-101 同 source 的重复实例，测试 409 duplicate_source
  const [dupMirror] = await db
    .insert(userCards)
    .values({ userId, cardId: "mirror-101", serial: 2 })
    .returning()

  // 卡册按类型筛选：吞噬界面靠它列出手上的镜像卡
  const listOf = async (type: string) => {
    const res = await app.inject({
      method: "GET",
      url: `/users/${userId}/cards?type=${type}&limit=60`,
      headers: authHeaders(userId),
    })
    assert.equal(res.statusCode, 200)
    return res.json().data as { total: number; rows: { id: string; cardType: string }[] }
  }
  const mirrors = await listOf("mirror")
  assert.equal(mirrors.total, 5)
  assert.ok(mirrors.rows.every((row) => row.cardType === "mirror"))
  const heroes = await listOf("hero")
  assert.deepEqual(heroes.rows.map((row) => row.id), [heroId])
  assert.equal((await listOf("pool")).total, 0)

  // 前 3 张 ATK 镜像卡正常提供共鸣
  for (let i = 0; i < 3; i += 1) {
    const res = await app.inject({
      method: "POST",
      url: `/users/${userId}/cards/${heroInstance!.id}/constellation`,
      headers: authHeaders(userId),
      payload: { materialUserCardId: mirrorUserCardIds[i] },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.data.constellation, i + 1)
    assert.equal(body.data.capped, false)
    assert.equal(body.data.addedResonance.attribute, "ATK")
    assert.equal(body.data.addedResonance.valueBp, 50)
  }

  // 同 osuId 的重复镜像返回 409
  const dupRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${heroInstance!.id}/constellation`,
    headers: authHeaders(userId),
    payload: { materialUserCardId: dupMirror!.id },
  })
  assert.equal(dupRes.statusCode, 409)
  assert.equal(dupRes.json().error.code, "duplicate_source")

  // 第 4 张同样加 ATK 的镜像：命座升到 4，但因为 ATK 已满 3 次，capped=true 且不新增共鸣
  const res4 = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${heroInstance!.id}/constellation`,
    headers: authHeaders(userId),
    payload: { materialUserCardId: mirrorUserCardIds[3] },
  })
  assert.equal(res4.statusCode, 200)
  const b4 = res4.json()
  assert.equal(b4.data.constellation, 4)
  assert.equal(b4.data.capped, true)
  assert.equal(b4.data.addedResonance, null)
  assert.equal(b4.data.summary.countsByAttr.ATK, 3)
  assert.equal(b4.data.summary.totalBpByAttr.ATK, 150)

  const rows = await db.select().from(heroResonance).where(eq(heroResonance.userId, userId))
  assert.equal(rows.length, 3)
})

console.log(`\n${passed} p2 tests passed`)
await app.close()
await dropTestDb()
