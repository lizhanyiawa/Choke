/**
 * 远征流程的服务端测试：开始校验、通关、到此结算、战败重试、挂起恢复、篡改操作被拒、
 * 卡池锁定、体力冻结与退回、到期结算发邮件。用临时 PGlite 数据库，不碰开发库。
 *
 *   pnpm test:expedition-run
 */
import assert from "node:assert/strict"

import { setupTestDb } from "./test-db"

const dropTestDb = await setupTestDb("expedition")

const { and, eq } = await import("drizzle-orm")
const { default: Fastify } = await import("fastify")
const { default: cookie } = await import("@fastify/cookie")
const { db } = await import("../src/db/client")
const { users, cards, userCards, ledgerEntries, mails, mapClears, bestiary, expeditions, expeditionBattles, questProgress } =
  await import("../src/db/schema")
const { COOKIE_NAME, makeSession } = await import("../src/auth/osu")
const { handleError } = await import("../src/error-handler")
const { expeditionRoutes } = await import("../src/routes/expeditions")
const { progressionRoutes } = await import("../src/routes/progression")
const { marketRoutes } = await import("../src/routes/market")
const { expireDue, expiryOf } = await import("../src/expedition/service")
const { lockedUserCardIds } = await import("../src/expedition/locks")
const { WORLD_CONTENT, BATTLE_CONTENT } = await import("../src/content")
const { pickMirrorCard, upsertMirrorCard } = await import("../src/mirror")
const { heroCardDef } = await import("../src/hero")
const { mulberry32 } = await import("../src/gacha/pools")
const { withAction, replayBattle } = await import("@choke/shared/battle/actions")
const { createBattle } = await import("@choke/shared/battle/engine")
const { isFightNode, unsupportedNode } = await import("@choke/shared/expedition/content")
const { dailyMapSeed, materializeMap } = await import("@choke/shared/expedition/generator")
const { nextReset } = await import("@choke/shared/reset")
const { playBot } = await import("./lib/battle-bot")

import type { BattleAction } from "@choke/shared/battle/actions"
import type { BattleInputCard } from "@choke/shared/battle/engine"
import type { ExpeditionView } from "@choke/shared/expedition/view"

const app = Fastify()
app.setErrorHandler(handleError)
await app.register(cookie)
for (const routes of [expeditionRoutes, progressionRoutes, marketRoutes]) await app.register(routes)
await app.ready()

let passed = 0
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    console.error(`FAIL  ${name}`)
    console.error(error)
    await cleanup()
    process.exit(1)
  }
}

async function cleanup() {
  await app.close().catch(() => {})
  await dropTestDb()
}

interface Reply {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}
const call = async (userId: string | null, method: "GET" | "POST", url: string, payload?: unknown): Promise<Reply> => {
  const res = await app.inject({
    method,
    url,
    payload: payload as never,
    headers: userId ? { cookie: `${COOKIE_NAME}=${makeSession(userId)}` } : {},
  })
  return { status: res.statusCode, body: res.json() }
}

// ---------- 造数据 ----------

const FULL = { slots: 4, apUpgrade: true, maxRarity: "Prismatic" }

const STRONG = [
  { id: "ex-tank", rarity: "Mythic", job: "tank", skills: ["warden_stun", "warden_bash", "warden_hold"], mods: ["HR"] },
  { id: "ex-war", rarity: "L", job: "warrior", skills: ["breaker_rift", "breaker_counter", "breaker_swift"], mods: ["DT"] },
  { id: "ex-mage", rarity: "Prismatic", job: "mage", skills: ["life_mass", "life_revive", "life_regen"], mods: ["HD", "DT"] },
  { id: "ex-sup", rarity: "L", job: "support", skills: ["bard_anthem", "bard_inspire", "bard_aura"], mods: [] },
]
const WEAK = ["ex-w1", "ex-w2", "ex-w3", "ex-w4"]

for (const card of STRONG) {
  await db.insert(cards).values({ id: card.id, name: card.id, rarity: card.rarity, job: card.job, no: 1, total: 1 })
}
for (const id of WEAK) await db.insert(cards).values({ id, name: id, rarity: "C", job: "warrior", no: 1, total: 1 })

let seq = 0
/** 前 4 张是满级强卡，后 4 张是 1 级弱卡 */
async function newPlayer(patch: Partial<typeof users.$inferInsert> = {}) {
  seq += 1
  const id = `exp-test-${seq}`
  await db.insert(users).values({
    id,
    username: id,
    email: `${id}@test.local`,
    osuId: 700_000 + seq,
    tutorialDone: true,
    playerLevel: 50,
    ...patch,
  })
  const ids: number[] = []
  for (const card of STRONG) {
    const [row] = await db
      .insert(userCards)
      .values({
        userId: id,
        cardId: card.id,
        level: 80,
        constellation: 6,
        skillRefs: card.skills.map((skillId) => ({ skillId })),
        mods: card.mods,
      })
      .returning({ id: userCards.id })
    ids.push(row!.id)
  }
  for (const cardId of WEAK) {
    const [row] = await db.insert(userCards).values({ userId: id, cardId }).returning({ id: userCards.id })
    ids.push(row!.id)
  }
  return { id, ids }
}

const userOf = async (userId: string) => (await db.select().from(users).where(eq(users.id, userId)))[0]!
const entriesOf = (userId: string) => db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId))
const sumOf = async (userId: string, kind: string, source?: string) =>
  (await entriesOf(userId))
    .filter((e) => e.kind === kind && (source === undefined || e.source === source))
    .reduce((sum, e) => sum + e.delta, 0)

const base = (userId: string) => `/users/${userId}/expeditions`
const start = (userId: string, mapId: string, cardIds: number[], allocation: object = FULL) =>
  call(userId, "POST", base(userId), { mapId, cardIds, allocation })
const current = async (userId: string): Promise<ExpeditionView | null> =>
  (await call(userId, "GET", `${base(userId)}/current`)).body.data

async function must(reply: Promise<Reply>): Promise<ExpeditionView> {
  const res = await reply
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body.data
}

const inputsOf = (view: ExpeditionView, ids: number[]): BattleInputCard[] =>
  ids.map((uid) => {
    const entry = view.pool.find((p) => p.userCardId === uid)!
    return { uid, cardId: entry.face.id, face: entry.face }
  })

const pickLineup = (userId: string, lineup: number[]) =>
  call(userId, "POST", `${base(userId)}/current/battle/lineup`, { lineup })
const uploadActions = (userId: string, from: number, actions: unknown[]) =>
  call(userId, "POST", `${base(userId)}/current/battle/actions`, { base: from, actions })

/** 选阵容并用机器人把当前战斗打完；返回结束后的视图 */
async function fight(userId: string, lineupIds: number[], expect: "won" | "lost" = "won"): Promise<ExpeditionView> {
  let view = await must(pickLineup(userId, lineupIds))
  const battle = view.battle!
  const { actions } = playBot(battle.encounter, inputsOf(view, battle.lineup), battle.seed, inputsOf(view, battle.bench), {
    apMax: battle.apMax,
    hpRatio: battle.hpRatioStart,
  })
  view = await must(uploadActions(userId, 0, actions))
  assert.equal(view.battle!.status, expect, `期望 ${expect}，实际 ${view.battle!.status}`)
  return view
}

/** 故意什么都不做，一直结束回合直到战败 */
async function loseOn(userId: string, lineupIds: number[]): Promise<ExpeditionView> {
  let view = await must(pickLineup(userId, lineupIds))
  const battle = view.battle!
  let state = createBattle(battle.encounter, inputsOf(view, battle.lineup), {
    seed: battle.seed,
    bench: inputsOf(view, battle.bench),
    apMax: battle.apMax,
    hpRatio: battle.hpRatioStart,
  })
  const actions: BattleAction[] = []
  for (let i = 0; i < 300 && state.phase === "player"; i += 1) {
    const result = withAction(state, { type: "endTurn" })
    assert.equal(result.error, null)
    state = result.state
    actions.push({ type: "endTurn" })
  }
  assert.equal(state.phase, "lost", "空过回合应该会输")
  view = await must(uploadActions(userId, 0, actions))
  assert.equal(view.battle!.status, "lost")
  return view
}

const strongIds = (ids: number[]) => ids.slice(0, 4)
const weakIds = (ids: number[]) => ids.slice(4, 8)

const move = (userId: string, to: string) => call(userId, "POST", `${base(userId)}/current/node`, { to })
const story = (userId: string, choices: number[]) => call(userId, "POST", `${base(userId)}/current/story`, { choices })
const settle = (userId: string) => call(userId, "POST", `${base(userId)}/current/settle`, {})
const abandon = (userId: string) => call(userId, "POST", `${base(userId)}/current/abandon`, {})
const suspend = (userId: string) => call(userId, "POST", `${base(userId)}/current/suspend`, {})
const resume = (userId: string) => call(userId, "POST", `${base(userId)}/current/resume`, {})
const retry = (userId: string) => call(userId, "POST", `${base(userId)}/current/battle/retry`, {})

/** 把 test-trial 一路打通到终点（不结算）。takeKey：剧情里选不选钥匙，决定走宝箱还是篝火 */
async function walkTrial(userId: string, ids: number[], takeKey: boolean): Promise<ExpeditionView> {
  const afterStory = await must(story(userId, [takeKey ? 0 : 1]))
  assert.equal(afterStory.nodeDone, true)
  await must(move(userId, "n2"))
  await fight(userId, strongIds(ids))
  await must(move(userId, "n3"))
  await must(move(userId, takeKey ? "n4b" : "n4a"))
  await must(move(userId, "n5"))
  const end = await fight(userId, strongIds(ids))
  assert.equal(end.atEnd, true)
  return end
}

console.log("expedition run tests")

// ---------- 开始出征的校验 ----------

await test("开始出征：数量、重复、别人的卡、权限都在服务端校验", async () => {
  const me = await newPlayer()
  const other = await newPlayer()

  let res = await start(me.id, "test-trial", me.ids.slice(0, 5))
  assert.equal(res.status, 400, "数量不对")
  res = await start(me.id, "test-trial", [...me.ids.slice(0, 7), me.ids[0]!])
  assert.equal(res.status, 400, "重复")
  res = await start(me.id, "test-trial", [...me.ids.slice(0, 7), other.ids[0]!])
  assert.equal(res.status, 400, "别人的卡")
  res = await start(me.id, "no-such-map", me.ids)
  assert.equal(res.status, 404)
  res = await start(me.id, "test-trial", me.ids, { slots: 4, apUpgrade: false, maxRarity: "E" })
  assert.equal(res.status, 400, "带了 Mythic 却没点稀有度")
  assert.match(res.body.error.message, /稀有度/)
  res = await start(me.id, "test-trial", me.ids, { slots: 9, apUpgrade: true, maxRarity: "Prismatic" })
  assert.equal(res.status, 400, "点数超出")
  res = await start(me.id, "test-trial", me.ids, { slots: 4, apUpgrade: false, maxRarity: "Mythic" })
  assert.equal(res.status, 400, "只点到 Mythic，带 Prismatic 卡不行")
  res = await call(null, "POST", base(me.id), { mapId: "test-trial", cardIds: me.ids, allocation: FULL })
  assert.equal(res.status, 401)
  res = await call(other.id, "POST", base(me.id), { mapId: "test-trial", cardIds: me.ids, allocation: FULL })
  assert.equal(res.status, 403)
  assert.equal(await current(me.id), null)
  assert.equal((await db.select().from(expeditions).where(eq(expeditions.userId, me.id))).length, 0)
})

await test("等级不够点数：服务端按玩家等级算，不信前端", async () => {
  const me = await newPlayer({ playerLevel: 5 })
  const res = await start(me.id, "test-trial", me.ids, FULL)
  assert.equal(res.status, 400)
  assert.equal(await current(me.id), null)
})

await test("同一时间只能有一个出征（含已挂起）", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  let res = await start(me.id, "test-trial", me.ids)
  assert.equal(res.status, 409)
  await must(suspend(me.id))
  res = await start(me.id, "test-trial", me.ids)
  assert.equal(res.status, 409, "挂起的也算")
  assert.equal((await abandon(me.id)).status, 200, "挂起的出征也能放弃")
})

await test("市场上架中的卡不能带出征", async () => {
  const me = await newPlayer()
  const listed = await call(me.id, "POST", `/users/${me.id}/market/list`, { userCardId: me.ids[7], price: 10 })
  assert.equal(listed.status, 200, JSON.stringify(listed.body))
  const res = await start(me.id, "test-trial", me.ids)
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, "card_listed")
})

// ---------- 通关与结算 ----------

await test("通关：剧情标记决定走哪条路，血量跨战斗保留，休息回满，通关奖励一次性发", async () => {
  const me = await newPlayer()
  const before = await userOf(me.id)
  let view = await must(start(me.id, "test-trial", me.ids))
  assert.equal(view.position, "n1")
  assert.equal(view.pool.length, 8)
  assert.equal(view.battle, null)
  assert.ok(view.story)
  assert.deepEqual(Object.keys(view.nodePreviews), ["n1", "n2"], "只下发当前格和前方一步的详情")

  assert.equal((await move(me.id, "n2")).status, 400, "剧情没看完不能走")
  assert.equal((await story(me.id, [])).status, 400, "选项数量对不上")
  assert.equal((await story(me.id, [5])).status, 400, "选项不存在")
  view = await must(story(me.id, [1]))
  assert.deepEqual(view.flags, [])
  assert.deepEqual(view.availableNext, ["n2"])
  assert.equal((await move(me.id, "n5")).status, 400, "不能跳节点")

  view = await must(move(me.id, "n2"))
  assert.equal(view.battle?.status, "preparing")
  assert.equal(view.battle?.seed, `${view.seed}/battle-n2`)
  assert.equal((await move(me.id, "n3")).status, 400, "没打完不能走")
  view = await fight(me.id, strongIds(me.ids))
  assert.equal(view.nodeDone, true)
  assert.ok(view.stars >= 1)
  assert.ok(view.pending.coins! >= 50)
  const afterFight = view.hpRatio

  view = await must(move(me.id, "n3"))
  assert.deepEqual(view.availableNext, ["n4a"], "没拿钥匙，宝箱那条路走不了")
  assert.equal((await move(me.id, "n4b")).status, 400)
  view = await must(move(me.id, "n4a"))
  assert.equal(view.hpRatio, 1, "休息回满血")
  assert.ok(afterFight <= 1)
  view = await must(move(me.id, "n5"))
  assert.equal(view.battle?.hpRatioStart, 1)
  view = await fight(me.id, strongIds(me.ids))
  assert.equal(view.atEnd, true)

  const res = await settle(me.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const result = res.body.data
  assert.equal(result.end, "cleared")
  // 战斗 50 + 首通 500 + Boss 200（战斗随机最多 +20 ×2）
  assert.ok(result.rewards.coins >= 750 && result.rewards.coins <= 790, `coins ${result.rewards.coins}`)
  assert.ok(result.rewards.packs.some((p: { pool: string }) => p.pool === "golden"))

  const after = await userOf(me.id)
  assert.equal(after.coins - before.coins, result.rewards.coins)
  assert.equal(await sumOf(me.id, "coins", "expedition"), result.rewards.coins)
  assert.equal(await current(me.id), null)
  assert.ok(after.playerExp > before.playerExp || after.playerLevel > before.playerLevel, "玩家经验随结算加上")

  const [clear] = await db.select().from(mapClears).where(eq(mapClears.userId, me.id))
  assert.equal(clear?.clears, 1)
  const seen = await db.select().from(bestiary).where(eq(bestiary.userId, me.id))
  assert.deepEqual(seen.map((row) => row.enemyId).sort(), ["colossus-metronome", "ghost"])

  // 成就进度：打赢 2 场战斗、主线通关 1 次；主线不算周常地图
  const quest = new Map((await db.select().from(questProgress).where(eq(questProgress.userId, me.id))).map((r) => [r.questId, r.progress]))
  assert.equal(quest.get("ach-win-50"), 2)
  assert.equal(quest.get("ach-main-1"), 1)
  assert.equal(quest.has("ach-patrol-10"), false)
})

await test("走宝箱那条路：需要剧情标记；首通奖励只发一次", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await walkTrial(me.id, me.ids, true)
  let res = await settle(me.id)
  assert.equal(res.status, 200)
  // 首通 500 + 战斗 50 + 宝箱 100 + Boss 200
  assert.ok(res.body.data.rewards.coins >= 850, `coins ${res.body.data.rewards.coins}`)
  assert.ok(res.body.data.rewards.packs.some((p: { pool: string }) => p.pool === "normal"), "宝箱里的卡包")
  const first = res.body.data.rewards.coins

  await must(start(me.id, "test-trial", me.ids))
  await walkTrial(me.id, me.ids, true)
  res = await settle(me.id)
  assert.equal(res.status, 200)
  assert.ok(res.body.data.rewards.coins <= first - 500 + 20, "第二次没有首通奖励")
  const [clear] = await db.select().from(mapClears).where(eq(mapClears.userId, me.id))
  assert.equal(clear?.clears, 2)
})

await test("到此结算：只发已经攒下的节点奖励，不发通关奖励，不记通关", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await must(story(me.id, [0]))
  await must(move(me.id, "n2"))
  await fight(me.id, strongIds(me.ids))
  const before = await userOf(me.id)
  const res = await settle(me.id)
  assert.equal(res.status, 200)
  assert.equal(res.body.data.end, "early")
  assert.ok(res.body.data.rewards.coins >= 50 && res.body.data.rewards.coins <= 70)
  assert.ok(!res.body.data.rewards.packs, "没有通关奖励的卡包")
  assert.equal((await userOf(me.id)).coins - before.coins, res.body.data.rewards.coins)
  assert.equal((await db.select().from(mapClears).where(eq(mapClears.userId, me.id))).length, 0)
  const quest = new Map((await db.select().from(questProgress).where(eq(questProgress.userId, me.id))).map((r) => [r.questId, r.progress]))
  assert.equal(quest.get("ach-win-50"), 1, "打赢的那一场算")
  assert.equal(quest.has("ach-main-1"), false, "到此结算不算通关")
})

await test("放弃：什么奖励都不要", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await must(story(me.id, [0]))
  await must(move(me.id, "n2"))
  await fight(me.id, strongIds(me.ids))
  const before = await userOf(me.id)
  const res = await abandon(me.id)
  assert.equal(res.status, 200)
  assert.equal(res.body.data.end, "abandoned")
  assert.deepEqual(res.body.data.rewards, {})
  assert.equal((await userOf(me.id)).coins, before.coins)
  assert.equal(await current(me.id), null)
  const [row] = await db.select().from(expeditions).where(eq(expeditions.userId, me.id))
  assert.equal(row?.status, "abandoned")
})

// ---------- 战斗与防作弊 ----------

await test("篡改操作被拒：形状不对、技能不存在、条数对不上、没选阵容就上传", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await must(story(me.id, [0]))
  await must(move(me.id, "n2"))

  let res = await uploadActions(me.id, 0, [{ type: "endTurn" }])
  assert.equal(res.status, 400, "没选阵容就上传")
  const lineup = await must(pickLineup(me.id, strongIds(me.ids)))
  assert.equal(lineup.battle?.status, "fighting")

  res = await pickLineup(me.id, weakIds(me.ids))
  assert.equal(res.status, 400, "开打后不能换阵容")
  res = await uploadActions(me.id, 0, [{ type: "cheat" }])
  assert.equal(res.status, 400, "形状不对")
  res = await uploadActions(me.id, 0, [{ type: "skill", card: 0, skill: "no-such-skill" }])
  assert.equal(res.status, 400, "技能不存在")
  assert.equal(res.body.error.code, "invalid_action")
  res = await uploadActions(me.id, 3, [{ type: "endTurn" }])
  assert.equal(res.status, 409, "条数对不上")
  assert.equal((await current(me.id))!.battle!.actions.length, 0, "被拒的操作一条都没存")
})

await test("战败：同种子重试，次数只记统计；通关照常；战败也记图鉴", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await must(story(me.id, [0]))
  await must(move(me.id, "n2"))
  let view = await loseOn(me.id, weakIds(me.ids))
  const seed = view.battle!.seed
  const hpStart = view.battle!.hpRatioStart
  assert.equal(view.nodeDone, false)
  assert.equal(view.battle!.stars, null)
  assert.deepEqual(view.pending, {})
  assert.equal((await move(me.id, "n3")).status, 400, "战败不算通过")
  assert.equal((await db.select().from(bestiary).where(eq(bestiary.userId, me.id))).length, 1, "败北也记图鉴")

  assert.equal((await retry(me.id)).status, 200)
  view = (await current(me.id))!
  assert.equal(view.battle!.status, "preparing")
  assert.equal(view.battle!.retries, 1)
  assert.equal(view.battle!.seed, seed)
  assert.equal(view.battle!.hpRatioStart, hpStart)
  assert.equal(view.battle!.actions.length, 0)
  assert.equal((await retry(me.id)).status, 400, "没输不能重试")

  view = await fight(me.id, strongIds(me.ids))
  assert.equal(view.battle!.retries, 1)
  assert.equal(view.nodeDone, true)
  const [row] = await db.select().from(expeditionBattles).where(eq(expeditionBattles.expeditionId, view.id))
  assert.equal(row?.retries, 1)
})

await test("服务端复算和客户端本地算出的结果一致", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await must(story(me.id, [0]))
  await must(move(me.id, "n2"))
  const done = await fight(me.id, strongIds(me.ids))
  const battle = done.battle!
  const result = replayBattle(
    {
      encounter: battle.encounter,
      cards: inputsOf(done, battle.lineup),
      bench: inputsOf(done, battle.bench),
      seed: battle.seed,
      apMax: battle.apMax,
      hpRatio: battle.hpRatioStart,
    },
    battle.actions,
  )
  assert.equal(result.invalidAt, null)
  assert.equal(result.state.phase, "won")
  assert.ok(Math.abs(result.state.teamHp / result.state.teamHpMax - done.hpRatio) < 1e-9)
})

await test("战败后直接退出：能放弃，不留下东西", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-patrol", me.ids.slice(0, 7)))
  await loseOn(me.id, [...weakIds(me.ids).slice(0, 3), me.ids[3]!])
  const res = await abandon(me.id)
  assert.equal(res.status, 200)
})

// ---------- 存档 ----------

await test("保存并退出：挂起期间不能操作，继续后进度原样", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await must(story(me.id, [0]))
  await must(move(me.id, "n2"))
  await must(pickLineup(me.id, strongIds(me.ids)))

  const suspended = await must(suspend(me.id))
  assert.equal(suspended.status, "suspended")
  const res = await uploadActions(me.id, 0, [{ type: "endTurn" }])
  assert.equal(res.status, 409, "挂起时不能操作")
  assert.equal((await current(me.id))!.status, "suspended", "刷新后还能读到")

  const resumed = await must(resume(me.id))
  assert.equal(resumed.status, "active")
  assert.equal(resumed.position, "n2")
  assert.deepEqual(resumed.battle!.lineup, strongIds(me.ids))
})

await test("断线恢复：每次上传都存在服务端，半场战斗能接着打", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await must(story(me.id, [0]))
  await must(move(me.id, "n2"))
  let view = await must(pickLineup(me.id, strongIds(me.ids)))
  const battle = view.battle!
  const { actions } = playBot(battle.encounter, inputsOf(view, battle.lineup), battle.seed, inputsOf(view, battle.bench), {
    apMax: battle.apMax,
    hpRatio: battle.hpRatioStart,
  })
  // 机器人偶尔在第一回合结束前就打赢了：这时改成留最后一步到第二段上传
  const firstTurn = actions.findIndex((a) => a.type === "endTurn") + 1
  const half = firstTurn > 0 ? Math.min(firstTurn, actions.length - 1) : actions.length - 1
  assert.ok(half > 0 && half < actions.length)
  view = await must(uploadActions(me.id, 0, actions.slice(0, half)))
  assert.equal(view.battle!.status, "fighting")

  const reloaded = (await current(me.id))!
  assert.equal(reloaded.battle!.actions.length, half)
  view = await must(uploadActions(me.id, half, actions.slice(half)))
  assert.equal(view.battle!.status, "won")
})

// ---------- 卡池锁定 ----------

await test("出征期间参战的卡不能出售、分解、被融合吃掉", async () => {
  const me = await newPlayer()
  const pooled = me.ids[1]! // ex-war，在卡池里
  await db.update(userCards).set({ level: 50 }).where(eq(userCards.id, pooled))
  // 再来两张同名卡，不在卡池里
  const extra: number[] = []
  for (let i = 0; i < 2; i += 1) {
    const [row] = await db
      .insert(userCards)
      .values({ userId: me.id, cardId: "ex-war", level: 10, skillRefs: [{ skillId: "breaker_rift" }] })
      .returning({ id: userCards.id })
    extra.push(row!.id)
  }
  const view = await must(start(me.id, "test-trial", me.ids))
  const locked = await lockedUserCardIds(db, me.id)
  assert.deepEqual([...locked].sort(), [...me.ids].sort())

  const card = (id: number, action: string) => `/users/${me.id}/cards/${id}/${action}`
  let res = await call(me.id, "POST", `/users/${me.id}/market/list`, { userCardId: pooled, price: 10 })
  assert.equal(res.body.error?.code, "in_expedition", "出售")
  res = await call(me.id, "POST", card(pooled, "dismantle"))
  assert.equal(res.body.error?.code, "in_expedition", "分解")

  // 融合：被吃的会跳过卡池里的卡，挑那张没入池的
  res = await call(me.id, "POST", card(extra[0]!, "constellation"))
  assert.equal(res.status, 200, JSON.stringify(res.body))
  res = await call(me.id, "POST", card(extra[0]!, "constellation"))
  assert.equal(res.status, 400)
  assert.equal(res.body.error?.code, "in_expedition", "剩下的同名卡都在卡池里，不能被吃")

  const still = (await current(me.id))!.pool.find((p) => p.userCardId === pooled)!
  assert.equal(still.face.level, view.pool.find((p) => p.userCardId === pooled)!.face.level, "快照里的等级不变")
  assert.equal(still.face.level, 50)
})

await test("出征结束后卡解锁", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  assert.equal((await lockedUserCardIds(db, me.id)).size, 8)
  await abandon(me.id)
  assert.equal((await lockedUserCardIds(db, me.id)).size, 0)
  const res = await call(me.id, "POST", `/users/${me.id}/cards/${me.ids[7]}/dismantle`)
  assert.equal(res.status, 200, JSON.stringify(res.body))
})

// ---------- 体力 ----------

// ---------- 到期 ----------

await test("到期：奖励以邮件发到邮箱，玩家经验直接加，卡解锁，出征读不到了", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await must(story(me.id, [0]))
  await must(move(me.id, "n2"))
  await fight(me.id, strongIds(me.ids))
  const before = await userOf(me.id)

  const done = await expireDue(me.id, Date.now() + 25 * 3_600_000)
  assert.equal(done, 1)
  const [row] = await db.select().from(expeditions).where(eq(expeditions.userId, me.id))
  assert.equal(row?.status, "expired")
  assert.equal(row?.endReason, "expired")
  assert.equal(row?.settlement?.viaMail, true)

  const sent = await db.select().from(mails).where(and(eq(mails.userId, me.id), eq(mails.kind, "expedition")))
  assert.equal(sent.length, 1)
  assert.ok(sent[0]!.attachment!.coins! >= 50)
  const after = await userOf(me.id)
  assert.equal(after.coins, before.coins, "金币还在邮件里，没直接到账")
  assert.ok(after.playerExp > before.playerExp, "玩家经验直接加")
  assert.equal(await current(me.id), null)
  assert.equal((await lockedUserCardIds(db, me.id)).size, 0)
})

await test("过期的出征：什么都没拿到不发邮件", async () => {
  const me = await newPlayer()
  await must(start(me.id, "test-patrol", me.ids.slice(0, 7)))
  await expireDue(me.id, Date.now() + 25 * 3_600_000)
  assert.equal((await db.select().from(mails).where(eq(mails.userId, me.id))).length, 0, "没有奖励就不发邮件")
})

await test("到期时间：24 小时和换图时间先到者为准；已过期但没处理的不锁卡", async () => {
  const now = Date.parse("2026-11-23T10:00:00+08:00")
  const daily = { ...WORLD_CONTENT.maps["test-patrol"]!, kind: "daily" as const }
  const weekly = { ...WORLD_CONTENT.maps["test-patrol"]!, kind: "weekly" as const }
  const main = WORLD_CONTENT.maps["test-trial"]!
  assert.equal(expiryOf(main, now), now + 24 * 3_600_000)
  assert.equal(expiryOf(daily, now), nextReset("daily", now), "日常图换图在次日 4:00")
  assert.equal(expiryOf(daily, now), Date.parse("2026-11-24T04:00:00+08:00"))
  assert.equal(expiryOf(weekly, now), now + 24 * 3_600_000, "周一 4:00 还远，24 小时先到")
  const lateSunday = Date.parse("2026-11-29T23:00:00+08:00")
  assert.equal(expiryOf(weekly, lateSunday), Date.parse("2026-11-30T04:00:00+08:00"), "周日深夜，换图先到")

  const me = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  await db.update(expeditions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(expeditions.userId, me.id))
  assert.equal((await lockedUserCardIds(db, me.id)).size, 0)
  assert.equal(await current(me.id), null, "读取时顺便结算")
})

await test("别人的出征看不到也动不了", async () => {
  const me = await newPlayer()
  const other = await newPlayer()
  await must(start(me.id, "test-trial", me.ids))
  assert.equal(await current(other.id), null)
  const res = await call(other.id, "POST", `${base(other.id)}/current/node`, { to: "n2" })
  assert.equal(res.status, 404)
  assert.equal((await call(other.id, "GET", `${base(me.id)}/current`)).status, 403)
})

// ---------- 4B：周常随机槽位 + 日常随机地图生成 ----------

await test("周常随机槽位：开始出征时 slot 已展开成具体节点并写进快照，不同种子能抽到不同候选", async () => {
  const me = await newPlayer()
  const ids = me.ids.slice(0, 7)
  const view = await must(start(me.id, "test-patrol", ids))
  assert.equal(unsupportedNode(view.map), null, "快照里不再有 slot 节点")
  const p2 = view.map.nodes["p2"]!
  assert.ok(p2.type === "battle" || p2.type === "rest", `p2 已展开为 ${p2.type}`)
  assert.deepEqual(p2.next, ["p3"], "原槽位的 next 连线保留")
  assert.deepEqual(p2.pos, [1, 0], "原槽位的坐标保留")

  // 把这趟周常一路走完（p1 战斗 → p2 槽位展开后的战斗或休息 → p3 宝箱）
  await fight(me.id, strongIds(me.ids))
  const atP2 = await must(move(me.id, "p2"))
  if (isFightNode(atP2.map.nodes["p2"])) {
    await fight(me.id, strongIds(me.ids))
  } else {
    assert.equal(atP2.nodeDone, true, "抽到休息节点时自动完成")
  }
  const atP3 = await must(move(me.id, "p3"))
  assert.equal(atP3.atEnd, true)
  assert.equal((await settle(me.id)).body.data.end, "cleared")

  // 纯函数验证：多换几个种子，池里 3 个候选都能抽到，且同种子结果完全一致
  const raw = WORLD_CONTENT.maps["test-patrol"]!
  const seen = new Set<string>()
  for (let i = 0; i < 40; i += 1) {
    const m1 = materializeMap(raw, `slot-seed-${i}`)
    const m2 = materializeMap(raw, `slot-seed-${i}`)
    assert.deepEqual(m1, m2, "同种子展开结果完全一致")
    const node = m1.nodes["p2"]!
    seen.add(node.type === "battle" ? `battle:${node.encounter}` : node.type)
  }
  assert.deepEqual([...seen].sort(), ["battle:rock-drummer", "battle:wind-chime", "rest"])
})

await test("日常随机地图：按玩家+地图+当天固定种子，放弃重进还是同一张图；通关后再进推进种子；换日或换人不同图", async () => {
  const me = await newPlayer()
  const other = await newPlayer()
  const ids = me.ids.slice(0, 7)

  const v1 = await must(start(me.id, "test-daily", ids))
  assert.equal(unsupportedNode(v1.map), null)
  assert.equal(v1.map.generate, undefined, "快照里已去掉 generate 模板")
  const firstSeed = v1.seed
  const firstNodes = v1.map.nodes
  await abandon(me.id)

  const v2 = await must(start(me.id, "test-daily", ids))
  assert.equal(v2.seed, firstSeed, "放弃后当天重进，种子不变，防重开刷图")
  assert.deepEqual(v2.map.nodes, firstNodes, "生成的整张地图一模一样")

  // 另一个玩家同一天进同一张日常图，种子不同
  const vOther = await must(start(other.id, "test-daily", other.ids.slice(0, 7)))
  assert.notEqual(vOther.seed, firstSeed)
  await abandon(other.id)

  // 一路打通这张日常随机图
  let cur = v2
  for (let step = 0; step < 10 && !cur.atEnd; step += 1) {
    if (!cur.nodeDone && isFightNode(cur.map.nodes[cur.position])) {
      cur = await fight(me.id, strongIds(me.ids))
    }
    assert.equal(cur.nodeDone, true)
    if (cur.atEnd) break
    assert.ok(cur.availableNext.length >= 1)
    cur = await must(move(me.id, cur.availableNext[0]!))
  }
  if (!cur.nodeDone && isFightNode(cur.map.nodes[cur.position])) {
    cur = await fight(me.id, strongIds(me.ids))
  }
  assert.equal(cur.atEnd, true)
  const settled = await settle(me.id)
  assert.equal(settled.body.data.end, "cleared")

  // 当天通关后再开第二次，种子推进（带 #1），不会完全复刻上一局
  const v3 = await must(start(me.id, "test-daily", ids))
  assert.equal(v3.seed, `${firstSeed}#1`)
  await abandon(me.id)

  // 第二天（过北京时间 4:00）种子变化
  const d1 = Date.parse("2026-11-24T10:00:00+08:00")
  const d2 = Date.parse("2026-11-25T04:01:00+08:00")
  assert.notEqual(dailyMapSeed(me.id, "test-daily", d1), dailyMapSeed(me.id, "test-daily", d2))
})

await test("难度：威胁值只在格子和事件上变，档位放大敌人血量和掉落主产，战败重试不变，通关目标与星级", async () => {
  const eventCall = (userId: string, choice: number) => call(userId, "POST", `${base(userId)}/current/event`, { choice })
  const ghostHp = BATTLE_CONTENT.enemies.ghost!.stats.hp
  const bossHp = BATTLE_CONTENT.enemies["colossus-metronome"]!.stats.hp
  const dropOf = async (userId: string, node: string) => {
    const [row] = await db.select().from(expeditions).where(eq(expeditions.userId, userId))
    return row!.drops.find((drop) => drop.node === node)?.reward
  }

  const me = await newPlayer()
  let view = await must(start(me.id, "test-threat", me.ids))
  assert.equal(view.difficulty.threat, 0)
  assert.equal(view.difficulty.tier, 1)
  assert.equal(view.difficulty.nextTierAt, 3)
  assert.equal(view.battle!.encounter.enemy.stats.hp, ghostHp, "1 档血量原样")

  // 普通战斗打赢不涨威胁
  view = await fight(me.id, strongIds(me.ids))
  assert.equal(view.difficulty.threat, 0, "杂鱼战斗不涨威胁")
  assert.equal((await dropOf(me.id, "n1"))!.playerExp, 30, "1 档掉落不放大")
  const hpBeforeEvent = view.hpRatio

  // 事件节点
  view = await must(move(me.id, "n2"))
  assert.equal(view.event?.options.length, 3)
  assert.equal(view.battle, null)
  assert.equal((await move(me.id, "n3a")).status, 400, "事件没处理不能往下走")
  assert.equal((await eventCall(me.id, 7)).status, 400, "选项不存在")
  assert.equal((await eventCall(me.id, -1)).status, 400)
  view = await must(eventCall(me.id, 0))
  assert.equal(view.event, null)
  assert.equal(view.nodeDone, true)
  assert.equal(view.difficulty.threat, 3)
  assert.equal(view.difficulty.tier, 2)
  assert.equal((await eventCall(me.id, 0)).status, 400, "事件不能选第二次")
  assert.equal((await dropOf(me.id, "n2"))!.coins, 100, "事件奖励进待结算，不放大")
  assert.equal(view.hpRatio, hpBeforeEvent)

  // 危险路线：威胁 +4，进入时就是 3 档，敌人血量 ×1.7
  view = await must(move(me.id, "n3a"))
  assert.equal(view.difficulty.threat, 7)
  assert.equal(view.difficulty.tier, 3)
  assert.equal(view.difficulty.hpMult, 1.7)
  const scaledGhost = Math.round(ghostHp * 1.7)
  assert.equal(view.battle!.encounter.enemy.stats.hp, scaledGhost)

  // 战败后同种子重试：血量、威胁、档位都和进入节点时一样
  const lost = await loseOn(me.id, weakIds(me.ids))
  assert.equal(lost.battle!.status, "lost")
  const seed = lost.battle!.seed
  view = await must(retry(me.id))
  assert.equal(view.battle!.retries, 1)
  assert.equal(view.battle!.seed, seed)
  assert.equal(view.battle!.encounter.enemy.stats.hp, scaledGhost)
  assert.equal(view.difficulty.threat, 7)

  await fight(me.id, strongIds(me.ids))
  const drop = (await dropOf(me.id, "n3a"))!
  assert.equal(drop.playerExp, 57, "30 × 1.9")
  assert.ok(drop.coins! >= 95 && drop.coins! <= 95 + 2 * 19, `coins ${drop.coins}`)

  // Boss 在 3 档，血量 ×1.7，固定掉落 ×1.9
  view = await must(move(me.id, "n4"))
  assert.equal(view.difficulty.tier, 3)
  assert.equal(view.battle!.encounter.enemy.stats.hp, Math.round(bossHp * 1.7))
  view = await fight(me.id, strongIds(me.ids))
  assert.equal(view.atEnd, true)
  assert.equal((await dropOf(me.id, "n4"))!.coins, 380)

  const [row] = await db.select().from(expeditions).where(eq(expeditions.userId, me.id))
  const dropCoins = row!.drops.reduce((sum, d) => sum + (d.reward.coins ?? 0), 0)
  const res = await settle(me.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const result = res.body.data
  assert.equal(result.tier, 3)
  assert.deepEqual(
    result.objectives.map((o: { text: string; met: boolean }) => [o.text, o.met]),
    [
      ["3 档及以上通关", true],
      ["得到祭坛的祝福", false],
    ],
  )
  assert.equal(result.rewards.coins, dropCoins + 500, "首通奖励不放大")
  const golden = result.rewards.packs.find((p: { pool: string }) => p.pool === "golden")
  assert.equal(golden.count, 2, "通关固定奖励 1 × 1.9 取整；达成 1 个目标没到 3 星加成")
  const [clear] = await db.select().from(mapClears).where(eq(mapClears.userId, me.id))
  assert.equal(clear?.bestObjectives, 1)
  assert.equal(
    (await call(me.id, "GET", `/users/${me.id}/expeditions/maps`)).body.data.find((m: { id: string }) => m.id === "test-threat").bestObjectives,
    1,
  )
})

await test("难度：事件的另一个选项扣血设标记，不涨威胁；1 档通关拿到祝福目标", async () => {
  const eventCall = (userId: string, choice: number) => call(userId, "POST", `${base(userId)}/current/event`, { choice })
  const me = await newPlayer()
  await must(start(me.id, "test-threat", me.ids))
  let view = await fight(me.id, strongIds(me.ids))
  const hpBefore = view.hpRatio
  await must(move(me.id, "n2"))
  view = await must(eventCall(me.id, 1))
  assert.deepEqual(view.flags, ["blessed"])
  assert.equal(view.difficulty.threat, 0)
  assert.ok(Math.abs(view.hpRatio - Math.max(0.05, hpBefore - 0.2)) < 1e-9, `hp ${hpBefore} → ${view.hpRatio}`)

  view = await must(move(me.id, "n3b"))
  assert.equal(view.hpRatio, 1, "篝火回满")
  assert.equal(view.difficulty.tier, 1)
  await must(move(me.id, "n4"))
  await fight(me.id, strongIds(me.ids))
  const result = (await settle(me.id)).body.data
  assert.equal(result.tier, 1)
  assert.deepEqual(result.objectives.map((o: { met: boolean }) => o.met), [false, true])
  assert.equal(result.rewards.packs.find((p: { pool: string }) => p.pool === "golden").count, 1, "1 档不放大")
})

await test("难度：不是事件节点时调事件接口被拒；别人的出征动不了", async () => {
  const me = await newPlayer()
  const other = await newPlayer()
  await must(start(me.id, "test-threat", me.ids))
  const res = await call(me.id, "POST", `${base(me.id)}/current/event`, { choice: 0 })
  assert.equal(res.status, 400, "站在战斗节点上")
  assert.equal((await call(other.id, "POST", `${base(me.id)}/current/event`, { choice: 0 })).status, 403)
  await abandon(me.id)
})

await test("镜像卡抽取：不排除自己，且候选池有活跃玩家时能正常抽出对应档位镜像卡", async () => {
  await newPlayer({ osuId: 990001, onboarded: true, lastSeenAt: new Date() })
  const def = heroCardDef(
    { id: 990001, username: "MirrorSelf", avatar_url: "", country_code: "CN", follower_count: 500 },
    { no: 1, total: 1, globalRank: 3000, pp: "9500", rarity: "R" },
  )
  assert.equal(def.rarity, "R")
  const mirrorId = await upsertMirrorCard(990001, def)
  assert.equal(mirrorId, "mirror-990001")

  const picked = await pickMirrorCard("normal", mulberry32(42))
  assert.ok(picked, "有活跃已引导账号时能抽到镜像卡（含自己）")
  assert.equal(picked!.id, "mirror-990001")
  assert.equal(picked!.rarity, "R")
})

await test("战斗行缺失：返回 409 battle_missing，而不是 500", async () => {
  const { id, ids } = await newPlayer()
  const started = await must(start(id, "test-trial", ids))
  await must(story(id, [0]))
  await must(move(id, "n2"))
  await db.delete(expeditionBattles).where(eq(expeditionBattles.expeditionId, started.id))
  const res = await pickLineup(id, strongIds(ids))
  assert.equal(res.status, 409, JSON.stringify(res.body))
  assert.equal(res.body.error.code, "battle_missing")
})

await test("重复进入同一战斗节点：复用旧战斗，不报唯一索引冲突", async () => {
  const { id, ids } = await newPlayer()
  const started = await must(start(id, "test-trial", ids))
  await must(story(id, [0]))
  const atBattle = await must(move(id, "n2"))
  // 模拟同一个移动请求被重放：退回上一个节点，再走一次 n2
  await db
    .update(expeditions)
    .set({ position: started.position, nodeDone: true })
    .where(eq(expeditions.id, atBattle.id))
  const again = await move(id, "n2")
  assert.equal(again.status, 200, JSON.stringify(again.body))
  const rows = await db.select().from(expeditionBattles).where(eq(expeditionBattles.expeditionId, atBattle.id))
  assert.equal(rows.filter((row) => row.nodeId === "n2").length, 1)
})

await test("卡池和阵容对不上：上传操作返回 409 pool_mismatch，不再 500", async () => {
  const { id, ids } = await newPlayer()
  await must(start(id, "test-trial", ids))
  await must(story(id, [0]))
  await must(move(id, "n2"))
  const view = await must(pickLineup(id, strongIds(ids)))
  const missing = view.battle!.lineup[0]!
  const [row] = await db.select().from(expeditions).where(eq(expeditions.id, view.id))
  const pool = row!.pool.filter((entry) => entry.userCardId !== missing)
  await db.update(expeditions).set({ pool }).where(eq(expeditions.id, view.id))

  const res = await uploadActions(id, 0, [{ type: "endTurn" }])
  assert.equal(res.status, 409, JSON.stringify(res.body))
  assert.equal(res.body.error.code, "pool_mismatch")
})

console.log(`${passed} 项通过`)
await cleanup()
