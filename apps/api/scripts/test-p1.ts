/**
 * P1 经济闭环服务端测试：
 * 1. NPC 回收（价格表、日限 20 张、本体卡拦截、记账）
 * 2. 卡牌 40+ 突破金币消耗（300/500/500/700）
 * 3. 商店（周限购、碎片赌箱、限量兑换）
 * 4. 市场 2% 上架税 + 5% 成交税 + ±40% 价格带 + 7 天过期 + 成交历史
 */
import assert from "node:assert/strict"

import { setupTestDb } from "./test-db"

const dropTestDb = await setupTestDb("p1")

const { eq } = await import("drizzle-orm")
const { default: Fastify } = await import("fastify")
const { default: cookie } = await import("@fastify/cookie")
const { db } = await import("../src/db/client")
const { users, cards, userCards, userItems, marketListings } = await import("../src/db/schema")
const { COOKIE_NAME, makeSession } = await import("../src/auth/osu")
const { handleError } = await import("../src/error-handler")
const { packRoutes } = await import("../src/routes/packs")
const { progressionRoutes } = await import("../src/routes/progression")
const { marketRoutes } = await import("../src/routes/market")
const { shopRoutes } = await import("../src/routes/shop")
const { breakthroughCoinCost } = await import("@choke/shared/progression")

const app = Fastify()
app.setErrorHandler(handleError)
await app.register(cookie)
await app.register(packRoutes)
await app.register(progressionRoutes)
await app.register(marketRoutes)
await app.register(shopRoutes)
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

function auth(userId: string) {
  return { cookie: `${COOKIE_NAME}=${makeSession(userId)}` }
}

await test("NPC 回收：按稀有度给金币、每日限 20 张、本体卡禁止回收", async () => {
  const userId = "p1-recycle-user"
  await db.insert(users).values({ id: userId, username: userId, coins: 0, tutorialDone: true, playerLevel: 60 })
  await db.insert(cards).values([
    { id: "p1-c", name: "C卡", rarity: "C", job: "tank", no: 1, total: 1 },
    { id: "p1-l", name: "L卡", rarity: "L", job: "warrior", no: 2, total: 1 },
    { id: "hero-888", name: "本体", rarity: "L", job: "warrior", no: 3, total: 1, cardType: "hero" },
  ])

  const ids: number[] = []
  for (let i = 0; i < 19; i += 1) {
    const [uc] = await db.insert(userCards).values({ userId, cardId: "p1-c", serial: i + 1 }).returning()
    ids.push(uc!.id)
  }
  const [lCard] = await db.insert(userCards).values({ userId, cardId: "p1-l", serial: 1 }).returning()
  ids.push(lCard!.id)
  const [extra] = await db.insert(userCards).values({ userId, cardId: "p1-c", serial: 99 }).returning()
  const [hero] = await db.insert(userCards).values({ userId, cardId: "hero-888", serial: 1 }).returning()

  // 本体卡被拦截
  const heroRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/recycle`,
    headers: auth(userId),
    payload: { userCardIds: [hero!.id] },
  })
  assert.equal(heroRes.statusCode, 400)
  assert.equal(heroRes.json().error.code, "hero_protected")

  // 一次回收 20 张：19*2 + 75 = 113 金币
  const res = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/recycle`,
    headers: auth(userId),
    payload: { userCardIds: ids },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().data.coinsGained, 19 * 2 + 75)
  assert.equal(res.json().data.remaining, 0)

  // 超出日限 20 张被拦截
  const overRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/recycle`,
    headers: auth(userId),
    payload: { userCardIds: [extra!.id] },
  })
  assert.equal(overRes.statusCode, 400)
  assert.equal(overRes.json().error.code, "daily_limit_reached")

  // 培养过的卡回收时按返还经验每 1000 点 +1 金币
  const trainedUser = "p1-recycle-trained"
  await db.insert(users).values({ id: trainedUser, username: trainedUser, coins: 0, tutorialDone: true, playerLevel: 60 })
  const [trainedCard] = await db
    .insert(userCards)
    .values({ userId: trainedUser, cardId: "p1-c", level: 40, exp: 0, serial: 1 })
    .returning()
  const trainedRes = await app.inject({
    method: "POST",
    url: `/users/${trainedUser}/cards/recycle`,
    headers: auth(trainedUser),
    payload: { userCardIds: [trainedCard!.id] },
  })
  assert.equal(trainedRes.statusCode, 200)
  // C 卡 40 级累计经验 5000，75% 返还 = 3750，/ 1000 = +3 金币 => 基础 2 + 3 = 5
  assert.equal(trainedRes.json().data.coinsGained, 5)
})

await test("卡牌 40+ 突破只收金币：40→41 扣 300 金币，不再要碎片", async () => {
  assert.equal(breakthroughCoinCost(40, false), 300)
  assert.equal(breakthroughCoinCost(50, false), 500)
  assert.equal(breakthroughCoinCost(60, false), 500)
  assert.equal(breakthroughCoinCost(70, false), 700)
  assert.equal(breakthroughCoinCost(40, true), 0)

  const userId = "p1-bt-user"
  await db.insert(users).values({ id: userId, username: userId, coins: 200, tutorialDone: true, playerLevel: 60 })
  await db.insert(cards).values({ id: "p1-bt-c", name: "突破卡", rarity: "C", job: "tank", no: 1, total: 1 })
  const [uc] = await db
    .insert(userCards)
    .values({ userId, cardId: "p1-bt-c", level: 40, exp: 1000, serial: 1 })
    .returning()

  // 金币不足 300 时被拦截
  const failCoinRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${uc!.id}/level`,
    headers: auth(userId),
  })
  assert.equal(failCoinRes.statusCode, 400)
  assert.equal(failCoinRes.json().error.code, "not_enough_coins")

  // 补足金币后直接突破成功，不需要碎片
  await db.update(users).set({ coins: 500 }).where(eq(users.id, userId))
  const okRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${uc!.id}/level`,
    headers: auth(userId),
  })
  assert.equal(okRes.statusCode, 200)
  assert.equal(okRes.json().data.card.level, 41)
  assert.equal(okRes.json().data.coinsSpent, 300)
  assert.equal(okRes.json().data.coins, 200)

})

await test("商店：周限购、碎片赌箱、限量兑换，余额不够不误扣", async () => {
  const userId = "p1-shop-user"
  await db.insert(users).values({ id: userId, username: userId, coins: 2000, tutorialDone: true, playerLevel: 60 })
  await db.insert(userItems).values([
    { userId, itemId: "shard-C", count: 40 },
    { userId, itemId: "shard-E", count: 50 },
  ])

  const buy = (itemId: string, count: number) =>
    app.inject({ method: "POST", url: `/users/${userId}/shop/buy`, headers: auth(userId), payload: { itemId, count } })

  const list = await app.inject({ method: "GET", url: `/users/${userId}/shop`, headers: auth(userId) })
  assert.equal(list.statusCode, 200)
  const entries: { id: string; remaining: number }[] = list.json().data.items
  assert.ok(entries.some((i) => i.id === "shard-box-high" && i.remaining === 3))

  // 低阶赌箱：扣 20 个 C 碎片和 40 金币，产出随机碎片
  const low = await buy("shard-box-low", 1)
  assert.equal(low.statusCode, 200)
  assert.equal(low.json().data.items["shard-C"], 20)
  assert.equal(low.json().data.coins, 1960)
  assert.ok(low.json().data.granted.items.length > 0)
  const eAfterLow: number = low.json().data.items["shard-E"] ?? 0

  // 限量 L 碎片包：买 2 次后周限耗尽，共得 4 个 L 碎片
  const pity = await buy("shard-l-pity", 2)
  assert.equal(pity.statusCode, 200)
  assert.equal(pity.json().data.remaining, 0)
  assert.equal(pity.json().data.items["shard-E"], eAfterLow - 40)
  assert.ok((pity.json().data.items["shard-L"] ?? 0) >= 4)

  const over = await buy("shard-l-pity", 1)
  assert.equal(over.statusCode, 400)
  assert.equal(over.json().error.code, "shop_limit_reached")

  // 碎片不够买高阶赌箱：被拦截，金币不变
  const coinsBefore = pity.json().data.coins
  const fail = await buy("shard-box-high", 1)
  assert.equal(fail.statusCode, 400)
  assert.equal(fail.json().error.code, "not_enough_items")
  const [after] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, userId))
  assert.equal(after!.coins, coinsBefore)

  assert.equal((await buy("no-such-item", 1)).json().error.code, "unknown_shop_item")
})

await test("市场：±40% 价格带校验、7 天过期与成交历史", async () => {
  const seller = "p1-mkt-seller"
  const buyer = "p1-mkt-buyer"
  await db.insert(users).values([
    { id: seller, username: seller, osuId: 1001, playerLevel: 5, tutorialDone: true, coins: 500 },
    { id: buyer, username: buyer, osuId: 1002, playerLevel: 5, tutorialDone: true, coins: 2000 },
  ])
  await db.insert(cards).values({ id: "p1-mkt-card", name: "市场卡", rarity: "E", job: "mage", no: 1, total: 1 })
  const [c1] = await db.insert(userCards).values({ userId: seller, cardId: "p1-mkt-card", serial: 1 }).returning()
  const [c2] = await db.insert(userCards).values({ userId: seller, cardId: "p1-mkt-card", serial: 2 }).returning()
  const [c3] = await db.insert(userCards).values({ userId: seller, cardId: "p1-mkt-card", serial: 3 }).returning()

  // 首单成交 1000 金币，建立参考均价 1000（±40% => 600..1400）
  const l1 = await app.inject({
    method: "POST",
    url: `/users/${seller}/market/list`,
    headers: auth(seller),
    payload: { userCardId: c1!.id, price: 1000 },
  })
  assert.equal(l1.statusCode, 200)
  const b1 = await app.inject({
    method: "POST",
    url: `/users/${buyer}/market/buy/${l1.json().data.id}`,
    headers: auth(buyer),
  })
  assert.equal(b1.statusCode, 200)

  // 超出 ±40% 价格带（比如 2000）被拒
  const outBand = await app.inject({
    method: "POST",
    url: `/users/${seller}/market/list`,
    headers: auth(seller),
    payload: { userCardId: c2!.id, price: 2000 },
  })
  assert.equal(outBand.statusCode, 400)
  assert.equal(outBand.json().error.code, "price_out_of_band")

  // 查询成交历史接口
  const hist = await app.inject({ method: "GET", url: "/market/history?cardId=p1-mkt-card" })
  assert.equal(hist.statusCode, 200)
  assert.equal(hist.json().data.sales.length, 1)
  assert.equal(hist.json().data.priceBand.avgPrice, 1000)

  // 8 天前的挂单触发过期：自动取消、退还押金、上架税不退
  const [sellerBeforeExp] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, seller))
  const [expiredListing] = await db
    .insert(marketListings)
    .values({
      sellerId: seller,
      userCardId: c3!.id,
      price: 1000,
      deposit: 50,
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    })
    .returning()
  const buyExp = await app.inject({
    method: "POST",
    url: `/users/${buyer}/market/buy/${expiredListing!.id}`,
    headers: auth(buyer),
  })
  assert.equal(buyExp.statusCode, 400)
  assert.equal(buyExp.json().error.code, "listing_expired")
  const [expiredRow] = await db.select().from(marketListings).where(eq(marketListings.id, expiredListing!.id))
  assert.equal(expiredRow!.status, "expired")
  const [sellerAfterExp] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, seller))
  assert.equal(sellerAfterExp!.coins, sellerBeforeExp!.coins + 50)
})

await test("碎片+金币「逢 5 自选」洗技能：单卡独立计数、严格同品质碎片、第 5 次自选并归零", async () => {
  const userId = "p1-reroll-user"
  await db.insert(users).values({ id: userId, username: userId, coins: 100, tutorialDone: true, playerLevel: 60 })
  await db.insert(cards).values([
    { id: "p1-rr-l", name: "洗技能L卡", rarity: "L", job: "warrior", no: 1, total: 1 },
    { id: "hero-777", name: "本体卡", rarity: "L", job: "warrior", no: 2, total: 1, cardType: "hero" },
  ])
  const [lCard] = await db
    .insert(userCards)
    .values({
      userId,
      cardId: "p1-rr-l",
      serial: 1,
      skillRefs: [{ skillId: "ranger_volley" }, { skillId: "berserker_blood" }],
    })
    .returning()
  const [heroCard] = await db
    .insert(userCards)
    .values({
      userId,
      cardId: "hero-777",
      serial: 1,
      skillRefs: [{ skillId: "ranger_volley" }, { skillId: "berserker_blood" }],
    })
    .returning()

  // 本体卡被拦截
  const heroRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${heroCard!.id}/reroll-skill`,
    headers: auth(userId),
    payload: { slot: 0 },
  })
  assert.equal(heroRes.statusCode, 400)
  assert.equal(heroRes.json().error.code, "hero_protected")

  // 金币不足 150 时被拦截
  const noCoin = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${lCard!.id}/reroll-skill`,
    headers: auth(userId),
    payload: { slot: 0 },
  })
  assert.equal(noCoin.statusCode, 400)
  assert.equal(noCoin.json().error.code, "not_enough_coins")

  // 补足金币但缺 L 碎片时被拦截且不误扣金币
  await db.update(users).set({ coins: 1000 }).where(eq(users.id, userId))
  const noShard = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${lCard!.id}/reroll-skill`,
    headers: auth(userId),
    payload: { slot: 0 },
  })
  assert.equal(noShard.statusCode, 400)
  assert.equal(noShard.json().error.code, "not_enough_items")

  // 未满 5 次不能提前自选
  await db.insert(userItems).values({ userId, itemId: "shard-L", count: 24 })
  const earlySelect = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${lCard!.id}/reroll-skill`,
    headers: auth(userId),
    payload: { slot: 0, skillId: "breaker_rend" },
  })
  assert.equal(earlySelect.statusCode, 400)
  assert.equal(earlySelect.json().error.code, "select_not_ready")

  // 连续 4 次随机重洗：每次都不与原技能或另一槽重复，计数递增到 4
  for (let i = 1; i <= 4; i += 1) {
    const r = await app.inject({
      method: "POST",
      url: `/users/${userId}/cards/${lCard!.id}/reroll-skill`,
      headers: auth(userId),
      payload: { slot: 0 },
    })
    assert.equal(r.statusCode, 200)
    const d = r.json().data
    assert.equal(d.mode, "random")
    assert.equal(d.skillRerollCount, i)
    assert.equal(d.coinsSpent, 150)
    assert.equal(d.shardsSpent, 4)
    assert.notEqual(d.newSkillId, d.previousSkillId)
    assert.notEqual(d.newSkillId, d.card.skillRefs[1].skillId)
  }

  // 查询状态：已触发自选
  const infoRes = await app.inject({
    method: "GET",
    url: `/users/${userId}/cards/${lCard!.id}/reroll-skill`,
    headers: auth(userId),
  })
  assert.equal(infoRes.statusCode, 200)
  assert.equal(infoRes.json().data.selectReady, true)
  const candidates: { id: string }[] = infoRes.json().data.candidates
  assert.ok(candidates.length > 0)

  // 第 5 次不传 skillId 被拦截
  const missingSelect = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${lCard!.id}/reroll-skill`,
    headers: auth(userId),
    payload: { slot: 0 },
  })
  assert.equal(missingSelect.statusCode, 400)
  assert.equal(missingSelect.json().error.code, "skill_id_required")

  // 第 5 次传入候选池中的技能：自选成功且计数归零
  const targetSkillId = candidates[0]!.id
  const selectRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/${lCard!.id}/reroll-skill`,
    headers: auth(userId),
    payload: { slot: 0, skillId: targetSkillId },
  })
  assert.equal(selectRes.statusCode, 200)
  const sd = selectRes.json().data
  assert.equal(sd.mode, "select")
  assert.equal(sd.newSkillId, targetSkillId)
  assert.equal(sd.card.skillRefs[0].skillId, targetSkillId)
  assert.equal(sd.skillRerollCount, 0)
  assert.equal(sd.selectReady, false)
  assert.equal(sd.coins, 1000 - 150 * 5)
  assert.equal(sd.items["shard-L"], 24 - 4 * 5)
})

await test("市场列表需登录才能查看", async () => {
  const anon = await app.inject({ method: "GET", url: "/market/listings" })
  assert.equal(anon.statusCode, 401)
  const anonPage = await app.inject({ method: "GET", url: "/market/listings/page" })
  assert.equal(anonPage.statusCode, 401, "分页接口和整表接口一样要登录")
})

await test("批量分解：合并产出同品质碎片与闪卡精华、拦截本体卡", async () => {
  const userId = "p1-batch-dismantle"
  await db.insert(users).values({
    id: userId,
    username: userId,
    coins: 0,
    essence: 0,
    tutorialDone: true,
    playerLevel: 60,
  })
  await db.insert(cards).values([
    { id: "p1-bd-c", name: "批量C", rarity: "C", job: "tank", no: 1, total: 1 },
    { id: "p1-bd-e", name: "批量E", rarity: "E", job: "mage", no: 2, total: 1 },
    { id: "hero-999", name: "本体999", rarity: "L", job: "warrior", no: 3, total: 1, cardType: "hero" },
  ])
  const [c1] = await db.insert(userCards).values({ userId, cardId: "p1-bd-c", serial: 1, foil: false }).returning()
  const [c2] = await db.insert(userCards).values({ userId, cardId: "p1-bd-c", serial: 2, foil: true }).returning()
  const [e1] = await db.insert(userCards).values({ userId, cardId: "p1-bd-e", serial: 1, foil: false }).returning()
  const [hero] = await db.insert(userCards).values({ userId, cardId: "hero-999", serial: 1 }).returning()

  // 含本体卡整批拦截
  const heroRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/dismantle`,
    headers: auth(userId),
    payload: { userCardIds: [c1!.id, hero!.id] },
  })
  assert.equal(heroRes.statusCode, 400)
  assert.equal(heroRes.json().error.code, "hero_protected")

  // 一次分解 2 张 C（其中 1 张闪卡）+ 1 张 E → 8 片 C 碎片 + 4 片 E 碎片 + 3 精华
  const okRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/dismantle`,
    headers: auth(userId),
    payload: { userCardIds: [c1!.id, c2!.id, e1!.id] },
  })
  assert.equal(okRes.statusCode, 200)
  const d = okRes.json().data
  assert.equal(d.removedUserCardIds.length, 3)
  assert.equal(d.skipped.length, 0)
  assert.equal(d.items["shard-C"], 8)
  assert.equal(d.items["shard-E"], 4)
  assert.equal(d.essenceGained, 3)
  assert.equal(d.essence, 3)

  // 批量分解遇到在售挂单卡：跳过在售卡并记录 skipped，其余照常分解
  const [cKeep] = await db.insert(userCards).values({ userId, cardId: "p1-bd-c", serial: 3 }).returning()
  const [cSell] = await db.insert(userCards).values({ userId, cardId: "p1-bd-c", serial: 4 }).returning()
  await db.insert(marketListings).values({ sellerId: userId, userCardId: cSell!.id, price: 100, deposit: 5 })
  const skipRes = await app.inject({
    method: "POST",
    url: `/users/${userId}/cards/dismantle`,
    headers: auth(userId),
    payload: { userCardIds: [cKeep!.id, cSell!.id] },
  })
  assert.equal(skipRes.statusCode, 200)
  const sd2 = skipRes.json().data
  assert.deepEqual(sd2.removedUserCardIds, [cKeep!.id])
  assert.deepEqual(sd2.skipped, [{ userCardId: cSell!.id, reason: "card_listed" }])
  assert.equal(sd2.items["shard-C"], 12)
})

console.log(`\n${passed} p1 tests passed`)
await app.close()
await dropTestDb()
