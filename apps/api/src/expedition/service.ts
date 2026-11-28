import { and, asc, eq, gte, inArray } from "drizzle-orm"

import {
  MAX_ACTIONS_PER_BATTLE,
  replayBattle,
  type BattleAction,
  type ReplayInput,
} from "@choke/shared/battle/actions"
import { resolveEncounter } from "@choke/shared/battle/content"
import type { BattleInputCard } from "@choke/shared/battle/engine"
import { evaluateStars } from "@choke/shared/battle/stars"
import { faceFromDef, type CardDef } from "@choke/shared/card-def"
import {
  allocationError,
  apMaxOf,
  firstDisallowedCard,
  type ExpeditionAllocation,
} from "@choke/shared/expedition-points"
import {
  availableNext,
  countMapFights,
  isFightNode,
  isTerminal,
  mapFeature,
  maxMapStars,
  unsupportedNode,
  type MapDef,
  type MapNode,
  type Reward,
} from "@choke/shared/expedition/content"
import {
  clampThreat,
  difficultyOf,
  difficultyStatus,
  objectiveMet,
  objectiveText,
  scaleEncounterHp,
} from "@choke/shared/expedition/difficulty"
import { dailyMapSeed, materializeMap } from "@choke/shared/expedition/generator"
import { isRewardEmpty, mapStarTier, mergeRewards, rollRewardTable } from "@choke/shared/expedition/loot"
import type {
  ExpeditionBattleView,
  ExpeditionEnd,
  ExpeditionNodePreview,
  ExpeditionPoolCard,
  ExpeditionSettlement,
  ExpeditionView,
  ObjectiveResult,
} from "@choke/shared/expedition/view"
import { isAttachmentEmpty } from "@choke/shared/mail"
import { lockMessage, lockReason } from "@choke/shared/unlocks"
import { randomSeed } from "@choke/shared/rng"
import { nextReset } from "@choke/shared/reset"
import type { Job, Rarity } from "@choke/shared/types"

import { BATTLE_CONTENT, CONTENT_VERSION, WORLD_CONTENT } from "../content"
import { db } from "../db/client"
import {
  bestiary,
  cards,
  expeditionBattles,
  expeditions,
  mapClears,
  userCards,
  users,
} from "../db/schema"
import { recordQuestEvent } from "../quest-events"
import { sendMail } from "../mail"
import { addCardExperience, addExpPool } from "../card-exp"
import { addPlayerExperience } from "../player-exp"
import { grantAttachment } from "../rewards"
import { TxAbort, lockUser, type Tx } from "../tx"
import { assertFeature, loadUnlockContext } from "../unlocks"
import { listedUserCardIds } from "./locks"

type Exec = Tx | typeof db
type ExpRow = typeof expeditions.$inferSelect
type BattleRow = typeof expeditionBattles.$inferSelect

/** 一个出征最长保留 24 小时；日常图在每天 4:00、周常图在周一 4:00 换图时更早结束 */
export const EXPEDITION_TTL_MS = 24 * 60 * 60 * 1000

const OPEN = ["active", "suspended"] as const

// ---------- 小工具 ----------

/** 出征从 now 开始，最晚什么时候结束：24 小时和换图时间，先到者为准 */
export function expiryOf(map: MapDef, now: number): number {
  const limit = now + EXPEDITION_TTL_MS
  if (map.kind === "daily") return Math.min(limit, nextReset("daily", now))
  if (map.kind === "weekly") return Math.min(limit, nextReset("weekly", now))
  return limit
}

function rewardTable(id: string | undefined) {
  return id ? WORLD_CONTENT.rewards[id] : undefined
}

/** 这条出征当前档位的掉落倍率 */
function lootMultOf(exp: Pick<ExpRow, "map" | "threat">): number {
  return difficultyStatus(exp.map, exp.threat).lootMult
}

/** 事件选项扣血最多扣到剩这么多（不会直接打死），已经更低的不再扣 */
const EVENT_HP_FLOOR = 0.05

async function loadOpen(exec: Exec, userId: string, lock = false): Promise<ExpRow | null> {
  const query = exec
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.userId, userId), inArray(expeditions.status, [...OPEN])))
    .limit(1)
  const [row] = lock ? await query.for("update") : await query
  return row ?? null
}

async function loadBattles(exec: Exec, expeditionId: number): Promise<BattleRow[]> {
  return exec
    .select()
    .from(expeditionBattles)
    .where(eq(expeditionBattles.expeditionId, expeditionId))
    .orderBy(asc(expeditionBattles.id))
}

function totalStars(battles: BattleRow[]): number {
  return battles.reduce((sum, battle) => sum + (battle.status === "won" ? (battle.stars ?? 0) : 0), 0)
}

function atEnd(exp: Pick<ExpRow, "map" | "position" | "nodeDone">): boolean {
  return exp.nodeDone && isTerminal(exp.map, exp.position)
}

function battleView(row: BattleRow): ExpeditionBattleView {
  return {
    nodeId: row.nodeId,
    status: row.status,
    encounter: row.encounter,
    seed: row.seed,
    apMax: row.apMax,
    hpRatioStart: row.hpRatioStart,
    lineup: row.lineup,
    bench: row.bench,
    actions: row.actions,
    retries: row.retries,
    stars: row.stars,
  }
}

const NODE_TITLE: Record<MapNode["type"], string> = {
  battle: "战斗",
  boss: "首领",
  story: "剧情",
  treasure: "宝箱",
  rest: "休息",
  branch: "分叉",
  event: "事件",
  slot: "槽位",
  empty: "空地",
}

function nodePreview(nodeId: string, node: MapNode): ExpeditionNodePreview {
  const preview: ExpeditionNodePreview = {
    nodeId,
    title: node.title ?? NODE_TITLE[node.type],
    type: node.type,
    hint: node.hint ?? (node.type === "branch" ? node.prompt : undefined),
    threat: node.threat,
  }

  if (isFightNode(node)) {
    const encounter = BATTLE_CONTENT.encounters[node.encounter]
    const enemy = encounter && BATTLE_CONTENT.enemies[encounter.enemy]
    if (encounter && enemy) {
      preview.encounter = {
        name: enemy.name,
        title: enemy.title,
        tier: enemy.tier,
        element: enemy.element,
        weaknesses: enemy.weaknesses,
        hp: enemy.stats.hp,
        summary: encounter.summary,
      }
    }
    preview.rewardHint = node.rewards ? "战斗胜利后确定掉落。" : "战斗奖励将在胜利后结算。"
  } else if (node.type === "treasure") {
    preview.rewardHint = "进入宝箱格时确定掉落。"
  } else if (node.type === "rest") {
    preview.hint ??= "抵达后恢复队伍血量。"
  } else if (node.type === "story") {
    const def = WORLD_CONTENT.stories[node.story]
    if (def) {
      preview.title = node.title ?? def.title
      preview.story = { nodeId, title: def.title, lines: def.lines }
    }
  } else if (node.type === "event") {
    const def = WORLD_CONTENT.events[node.event]
    if (def) {
      preview.title = node.title ?? def.title
      preview.event = { nodeId, title: def.title, text: def.text, options: def.options }
    }
  }

  return preview
}

/** 玩家现在看得见详情的格子：当前格、前方一步、身后一步。更远的不下发，免得从接口里提前看到 */
function previewWindow(nodes: Record<string, MapNode>, position: string): Set<string> {
  const visible = new Set<string>([position])
  for (const next of nodes[position]?.next ?? []) visible.add(next)
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.next.includes(position)) visible.add(nodeId)
  }
  return visible
}

async function buildView(exec: Exec, exp: ExpRow): Promise<ExpeditionView> {
  const battles = await loadBattles(exec, exp.id)
  const node = exp.map.nodes[exp.position]
  const current = battles.find((battle) => battle.nodeId === exp.position)

  const nodePreviews: ExpeditionView["nodePreviews"] = {}
  for (const nodeId of previewWindow(exp.map.nodes, exp.position)) {
    const mapNode = exp.map.nodes[nodeId]
    if (mapNode) nodePreviews[nodeId] = nodePreview(nodeId, mapNode)
  }
  const currentPreview = nodePreviews[exp.position]

  return {
    id: exp.id,
    status: exp.status,
    mapId: exp.mapId,
    map: exp.map,
    nodePreviews,
    seed: exp.seed,
    allocation: exp.allocation,
    pool: exp.pool,
    position: exp.position,
    nodeDone: exp.nodeDone,
    availableNext: exp.nodeDone ? availableNext(exp.map, exp.position, exp.flags) : [],
    atEnd: atEnd(exp),
    flags: exp.flags,
    hpRatio: exp.hpRatio,
    pending: mergeRewards(...exp.drops.map((drop) => drop.reward)),
    stars: totalStars(battles),
    maxStars: maxMapStars(exp.map),
    startedAt: exp.startedAt.toISOString(),
    expiresAt: exp.expiresAt.toISOString(),
    battle: current && isFightNode(node) ? battleView(current) : null,
    story: exp.nodeDone ? null : (currentPreview?.story ?? null),
    event: exp.nodeDone ? null : (currentPreview?.event ?? null),
    difficulty: difficultyStatus(exp.map, exp.threat),
    settlement: exp.settlement ?? null,
  }
}

async function viewById(exec: Exec, id: number): Promise<ExpeditionView> {
  const [row] = await exec.select().from(expeditions).where(eq(expeditions.id, id)).limit(1)
  if (!row) throw new TxAbort(404, "no_expedition", "找不到这次出征，请刷新后重试")
  return buildView(exec, row)
}

/** 锁住用户和他的未结束出征；没有就报错。调用方已经开好了事务 */
async function requireOpen(tx: Tx, userId: string, now: number): Promise<ExpRow> {
  await lockUser(tx, userId)
  const exp = await loadOpen(tx, userId, true)
  if (!exp) throw new TxAbort(404, "no_expedition", "你现在没有进行中的出征")
  if (exp.expiresAt.getTime() <= now) {
    throw new TxAbort(410, "expedition_expired", "这次出征已经到期，请刷新后查看结算邮件")
  }
  return exp
}

function requireActive(exp: ExpRow) {
  if (exp.status === "suspended") throw new TxAbort(409, "suspended", "出征已保存并退出，请先继续出征")
}

// ---------- 开始出征 ----------

export interface StartInput {
  mapId: string
  cardIds: number[]
  allocation: ExpeditionAllocation
}

function cardDefOf(row: typeof cards.$inferSelect): CardDef {
  return {
    id: row.id,
    osuId: row.osuId,
    name: row.name,
    rarity: row.rarity as Rarity,
    job: row.job as Job,
    no: row.no,
    total: row.total,
    country: row.country ?? undefined,
    globalRank: row.globalRank,
    pp: row.pp == null ? null : Number(row.pp),
    profileUrl: row.profileUrl ?? undefined,
    art: row.art ?? undefined,
    banner: row.banner ?? undefined,
    version: row.version,
  }
}

export async function startExpedition(userId: string, input: StartInput, now = Date.now()): Promise<ExpeditionView> {
  await expireDue(userId, now)

  const rawMap = WORLD_CONTENT.maps[input.mapId]
  if (!rawMap) throw new TxAbort(404, "unknown_map", "没有这张地图")
  const feature = mapFeature(rawMap)
  if (feature) await assertFeature(userId, feature)

  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    if (await loadOpen(tx, userId, true)) {
      throw new TxAbort(409, "expedition_open", "你已经有一个未结束的出征，先继续或结算它")
    }

    const [user] = await tx
      .select({
        level: users.playerLevel,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) throw new TxAbort(404, "not_found", "用户不存在")

    if (rawMap.after) {
      const [prev] = await tx
        .select({ clears: mapClears.clears })
        .from(mapClears)
        .where(and(eq(mapClears.userId, userId), eq(mapClears.mapId, rawMap.after)))
        .limit(1)
      if (!prev || prev.clears <= 0) {
        const name = WORLD_CONTENT.maps[rawMap.after]?.name ?? rawMap.after
        throw new TxAbort(409, "map_locked", `先通关《${name}》才能开始这张图`)
      }
    }

    const problem = allocationError(input.allocation, user.level)
    if (problem) throw new TxAbort(400, "bad_allocation", problem)
    const { allocation } = input

    const ids = input.cardIds
    if (ids.length !== rawMap.deckSize) {
      throw new TxAbort(400, "bad_pool", `这张地图要带满 ${rawMap.deckSize} 张卡，你选了 ${ids.length} 张`)
    }
    if (new Set(ids).size !== ids.length) throw new TxAbort(400, "bad_pool", "同一张卡不能选两次")
    if (allocation.slots > rawMap.deckSize) {
      throw new TxAbort(400, "bad_allocation", `这张地图一共只带 ${rawMap.deckSize} 张卡，卡槽数不能超过它`)
    }

    const rows = await tx
      .select({ card: cards, owned: userCards })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(and(eq(userCards.userId, userId), inArray(userCards.id, ids)))
    if (rows.length !== ids.length) throw new TxAbort(400, "bad_pool", "有卡不在你的卡册里")

    const byId = new Map(rows.map((row) => [row.owned.id, row]))
    const pool: ExpeditionPoolCard[] = ids.map((userCardId) => {
      const { card, owned } = byId.get(userCardId)!
      return {
        userCardId,
        exp: owned.exp,
        face: faceFromDef(cardDefOf(card), {
          level: owned.level,
          constellation: owned.constellation,
          foil: owned.foil,
          rollBp: owned.rollBp,
          serial: owned.serial,
          pulled: card.pulled,
          skillRefs: owned.skillRefs,
        }),
      }
    })

    const blocked = firstDisallowedCard(allocation, pool.map((entry) => entry.face))
    if (blocked >= 0) {
      const face = pool[blocked]!.face
      throw new TxAbort(400, "rarity_locked", `${face.name}（${face.rarity}）超出了你分配的稀有度权限`)
    }
    const listed = await listedUserCardIds(tx, ids)
    if (listed.size > 0) throw new TxAbort(400, "card_listed", "有卡正在市场里挂着，先下架再出征")

    // 日常地图的种子按「玩家 + 地图 + 当天（北京时间 4:00 周期）」固定，放弃重进不换图；当天已通关后再打则推进序号
    let seed: string
    if (rawMap.kind === "daily") {
      const cycleStart = nextReset("daily", now) - EXPEDITION_TTL_MS
      const clearedToday = await tx
        .select({ id: expeditions.id })
        .from(expeditions)
        .where(
          and(
            eq(expeditions.userId, userId),
            eq(expeditions.mapId, input.mapId),
            eq(expeditions.endReason, "cleared"),
            gte(expeditions.startedAt, new Date(cycleStart)),
          ),
        )
      seed = dailyMapSeed(userId, input.mapId, now, clearedToday.length)
    } else {
      seed = randomSeed()
    }
    const map = materializeMap(rawMap, seed)
    const unsupported = unsupportedNode(map)
    if (unsupported) throw new TxAbort(400, "map_unavailable", `这张地图暂时不能出征：${unsupported}`)

    const [created] = await tx
      .insert(expeditions)
      .values({
        userId,
        mapId: input.mapId,
        seed,
        contentVersion: CONTENT_VERSION,
        map,
        pool,
        allocation,
        position: map.start,
        threat: difficultyOf(map).startThreat,
        startedAt: new Date(now),
        expiresAt: new Date(expiryOf(map, now)),
        updatedAt: new Date(now),
      })
      .returning()
    await enterNode(tx, created!, map.start)
    return viewById(tx, created!.id)
  })
}

// ---------- 节点 ----------

/**
 * 走进一个节点：先结算这个格子的威胁加减（档位随之变），再按新档位处理——
 * 战斗节点存遭遇快照（敌人血量按档位放大，之后重放和重试都用这份），宝箱当场掷好，休息回满血。
 */
async function enterNode(tx: Tx, exp: ExpRow, nodeId: string): Promise<void> {
  const node = exp.map.nodes[nodeId]!
  const threat = clampThreat(exp.threat + (node.threat ?? 0))
  const status = difficultyStatus(exp.map, threat)
  const set: Partial<typeof expeditions.$inferInsert> = { position: nodeId, nodeDone: false, threat, updatedAt: new Date() }

  switch (node.type) {
    case "battle":
    case "boss": {
      const encounter = resolveEncounter(BATTLE_CONTENT, node.encounter)
      if (!encounter) throw new TxAbort(500, "content_missing", `遭遇 ${node.encounter} 不存在`)
      await tx
        .insert(expeditionBattles)
        .values({
          expeditionId: exp.id,
          nodeId,
          encounter: scaleEncounterHp(encounter, status.hpMult),
          seed: `${exp.seed}/battle-${nodeId}`,
          apMax: apMaxOf(exp.allocation),
          hpRatioStart: exp.hpRatio,
        })
        // 同一节点已经开过战斗（重试 / 重复请求）就复用旧快照，别把操作记录覆盖掉
        .onConflictDoNothing()
      break
    }
    case "story":
      if (!WORLD_CONTENT.stories[node.story]) set.nodeDone = true
      break
    case "event":
      if (!WORLD_CONTENT.events[node.event]) set.nodeDone = true
      break
    case "treasure": {
      const table = rewardTable(node.rewards)
      if (table) {
        const reward = rollRewardTable(table, { seed: exp.seed, stream: `treasure-${nodeId}`, lootMult: status.lootMult })
        if (!isRewardEmpty(reward)) set.drops = [...exp.drops, { node: nodeId, reward }]
      }
      set.nodeDone = true
      break
    }
    case "rest":
      set.hpRatio = 1
      set.nodeDone = true
      break
    case "branch":
    case "empty":
      set.nodeDone = true
      break
    default:
      throw new TxAbort(400, "map_unavailable", `节点 ${nodeId} 的类型还不能执行`)
  }
  await tx.update(expeditions).set(set).where(eq(expeditions.id, exp.id))
}

export async function moveTo(userId: string, to: string, now = Date.now()): Promise<ExpeditionView> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    requireActive(exp)
    if (!exp.nodeDone) throw new TxAbort(400, "node_unfinished", "这个节点还没处理完，不能往下走")
    if (!availableNext(exp.map, exp.position, exp.flags).includes(to)) {
      throw new TxAbort(400, "bad_move", "从这里走不到那个节点")
    }
    await enterNode(tx, exp, to)
    return viewById(tx, exp.id)
  })
}

export async function playStory(userId: string, choices: number[], now = Date.now()): Promise<ExpeditionView> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    requireActive(exp)
    const node = exp.map.nodes[exp.position]
    if (node?.type !== "story" || exp.nodeDone) throw new TxAbort(400, "no_story", "现在没有要看的剧情")
    const story = WORLD_CONTENT.stories[node.story]

    const flags = new Set(exp.flags)
    const menus = (story?.lines ?? []).flatMap((line) => ("choice" in line ? [line.choice] : []))
    if (choices.length !== menus.length) {
      throw new TxAbort(400, "bad_choices", `这段剧情有 ${menus.length} 个选项，你提交了 ${choices.length} 个`)
    }
    for (const [i, menu] of menus.entries()) {
      const picked = menu[choices[i]!]
      if (!picked) throw new TxAbort(400, "bad_choices", "选项不存在")
      picked.set.forEach((flag) => flags.add(flag))
    }
    await tx
      .update(expeditions)
      .set({ flags: [...flags], nodeDone: true, updatedAt: new Date() })
      .where(eq(expeditions.id, exp.id))
    return viewById(tx, exp.id)
  })
}

// ---------- 战斗 ----------

/** 事件：玩家选一个选项，服务端只执行白名单里的四种效果（威胁、扣血比例、奖励、标记） */
export async function playEvent(userId: string, choice: number, now = Date.now()): Promise<ExpeditionView> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    requireActive(exp)
    const node = exp.map.nodes[exp.position]
    if (node?.type !== "event" || exp.nodeDone) throw new TxAbort(400, "no_event", "现在没有要处理的事件")
    const option = WORLD_CONTENT.events[node.event]?.options[choice]
    if (!option) throw new TxAbort(400, "bad_choice", "选项不存在")

    const set: Partial<typeof expeditions.$inferInsert> = { nodeDone: true, updatedAt: new Date() }
    if (option.threat) set.threat = clampThreat(exp.threat + option.threat)
    if (option.hpLossPct) {
      set.hpRatio = Math.min(exp.hpRatio, Math.max(EVENT_HP_FLOOR, exp.hpRatio - option.hpLossPct))
    }
    if (option.set.length > 0) set.flags = [...new Set([...exp.flags, ...option.set])]
    if (option.reward && !isRewardEmpty(option.reward)) {
      set.drops = [...exp.drops, { node: exp.position, reward: option.reward }]
    }
    await tx.update(expeditions).set(set).where(eq(expeditions.id, exp.id))
    return viewById(tx, exp.id)
  })
}

// ---------- 战斗 ----------

async function requireBattle(tx: Tx, exp: ExpRow): Promise<BattleRow> {
  const node = exp.map.nodes[exp.position]
  if (!isFightNode(node)) throw new TxAbort(400, "no_battle", "现在不在战斗节点上")
  const [battle] = await tx
    .select()
    .from(expeditionBattles)
    .where(and(eq(expeditionBattles.expeditionId, exp.id), eq(expeditionBattles.nodeId, exp.position)))
    .limit(1)
  if (!battle) throw new TxAbort(409, "battle_missing", "这场战斗已经不在了，请返回地图重新进入")
  return battle
}

function inputsOf(exp: ExpRow, ids: number[]): BattleInputCard[] {
  const byId = new Map(exp.pool.map((entry) => [entry.userCardId, entry.face]))
  return ids.map((uid) => {
    const face = byId.get(uid)
    if (!face) throw new TxAbort(409, "pool_mismatch", "出征卡池和阵容对不上，请刷新后重新进入")
    return { uid, cardId: face.id, face }
  })
}

function replayInput(exp: ExpRow, battle: BattleRow): ReplayInput {
  return {
    encounter: battle.encounter,
    cards: inputsOf(exp, battle.lineup),
    bench: inputsOf(exp, battle.bench),
    seed: battle.seed,
    apMax: battle.apMax,
    hpRatio: battle.hpRatioStart,
  }
}

export async function chooseLineup(userId: string, lineup: number[], now = Date.now()): Promise<ExpeditionView> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    requireActive(exp)
    const battle = await requireBattle(tx, exp)
    if (battle.status !== "preparing") throw new TxAbort(400, "already_started", "这场战斗已经开始，不能再换阵容")

    if (lineup.length !== exp.allocation.slots) {
      throw new TxAbort(400, "bad_lineup", `要选满 ${exp.allocation.slots} 张上场卡，你选了 ${lineup.length} 张`)
    }
    const inPool = new Set(exp.pool.map((entry) => entry.userCardId))
    if (new Set(lineup).size !== lineup.length || lineup.some((id) => !inPool.has(id))) {
      throw new TxAbort(400, "bad_lineup", "上场的卡必须来自出征卡池，且不能重复")
    }
    const chosen = new Set(lineup)
    const bench = exp.pool.map((entry) => entry.userCardId).filter((id) => !chosen.has(id))
    await tx
      .update(expeditionBattles)
      .set({ lineup, bench, actions: [], status: "fighting", updatedAt: new Date() })
      .where(eq(expeditionBattles.id, battle.id))
    await tx.update(expeditions).set({ updatedAt: new Date() }).where(eq(expeditions.id, exp.id))
    return viewById(tx, exp.id)
  })
}

/** 更新图鉴：击败数 + 这场揭开的隐藏弱点（败北的战斗也记发现） */
async function recordBestiary(tx: Tx, userId: string, enemyId: string, won: boolean, found: string[]) {
  const [row] = await tx
    .select()
    .from(bestiary)
    .where(and(eq(bestiary.userId, userId), eq(bestiary.enemyId, enemyId)))
    .limit(1)
  const hiddenFound = [...new Set([...(row?.hiddenFound ?? []), ...found])]
  const defeated = (row?.defeated ?? 0) + (won ? 1 : 0)
  await tx
    .insert(bestiary)
    .values({ userId, enemyId, defeated, hiddenFound })
    .onConflictDoUpdate({ target: [bestiary.userId, bestiary.enemyId], set: { defeated, hiddenFound } })
}

/**
 * 追加操作：服务端拿快照里的遭遇、卡池、种子，把整场战斗从头复算一遍。
 * base 是客户端以为服务器已经有的操作条数，对不上就拒绝（防止重复提交）。
 */
export async function appendActions(
  userId: string,
  base: number,
  actions: BattleAction[],
  now = Date.now(),
): Promise<ExpeditionView> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    requireActive(exp)
    const battle = await requireBattle(tx, exp)
    if (battle.status !== "fighting") {
      throw new TxAbort(400, "not_fighting", battle.status === "preparing" ? "先选好上场阵容" : "这场战斗已经结束")
    }
    if (base !== battle.actions.length) {
      throw new TxAbort(409, "out_of_sync", "操作记录和服务器对不上，请刷新后继续", { have: battle.actions.length })
    }
    const all = [...battle.actions, ...actions]
    if (all.length > MAX_ACTIONS_PER_BATTLE) throw new TxAbort(400, "too_many_actions", "这场战斗的操作太多了")

    const result = replayBattle(replayInput(exp, battle), all)
    if (result.invalidAt !== null) {
      throw new TxAbort(400, "invalid_action", result.error ?? "操作不合法", {
        index: result.invalidAt - battle.actions.length,
      })
    }

    const state = result.state
    const patch: Partial<typeof expeditionBattles.$inferInsert> = { actions: all, updatedAt: new Date() }

    if (state.phase === "won" || state.phase === "lost") {
      const won = state.phase === "won"
      patch.status = state.phase
      await recordBestiary(tx, userId, battle.encounter.enemy.id, won, state.hiddenFound)

      if (won) {
        const stars = evaluateStars(state).count
        patch.stars = stars
        await recordQuestEvent(tx, userId, "expedition-win", { mapKind: exp.map.kind, mapId: exp.mapId, now })
        const node = exp.map.nodes[exp.position]
        const table = isFightNode(node) ? rewardTable(node.rewards) : undefined
        const reward = table
          ? rollRewardTable(table, { seed: exp.seed, stream: `loot-${exp.position}`, stars, lootMult: lootMultOf(exp) })
          : undefined
        await tx
          .update(expeditions)
          .set({
            nodeDone: true,
            hpRatio: Math.min(1, Math.max(0, state.teamHp / state.teamHpMax)),
            drops: reward && !isRewardEmpty(reward) ? [...exp.drops, { node: exp.position, reward }] : exp.drops,
            updatedAt: new Date(),
          })
          .where(eq(expeditions.id, exp.id))
      }
    }
    await tx.update(expeditionBattles).set(patch).where(eq(expeditionBattles.id, battle.id))
    return viewById(tx, exp.id)
  })
}

/** 战败后同种子重试：卡组和队伍血量回到进入节点时的样子，没有惩罚，次数只记统计 */
export async function retryBattle(userId: string, now = Date.now()): Promise<ExpeditionView> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    requireActive(exp)
    const battle = await requireBattle(tx, exp)
    if (battle.status !== "lost") throw new TxAbort(400, "not_lost", "只有战败的战斗才能重试")
    await tx
      .update(expeditionBattles)
      .set({
        status: "preparing",
        lineup: [],
        bench: [],
        actions: [],
        stars: null,
        retries: battle.retries + 1,
        updatedAt: new Date(),
      })
      .where(eq(expeditionBattles.id, battle.id))
    await tx.update(expeditions).set({ updatedAt: new Date() }).where(eq(expeditions.id, exp.id))
    return viewById(tx, exp.id)
  })
}

// ---------- 结算 ----------

/**
 * 结束一次出征：算奖励、发奖励、写图鉴之外的记录。必须在事务里，且已经锁了用户和这条出征。
 */
async function finalize(tx: Tx, exp: ExpRow, end: ExpeditionEnd, now: number): Promise<ExpeditionSettlement> {
  const battles = await loadBattles(tx, exp.id)
  const stars = totalStars(battles)
  const maxStars = maxMapStars(exp.map)
  const cleared = end === "cleared" || (end === "expired" && atEnd(exp))
  const status = difficultyStatus(exp.map, exp.threat)
  const objectives: ObjectiveResult[] = (exp.map.objectives ?? []).map((objective) => ({
    text: objectiveText(objective),
    met: cleared && objectiveMet(objective, { tier: status.tier, flags: exp.flags }),
  }))
  const objectivesMet = objectives.filter((o) => o.met).length
  /** 写了通关目标的图，通关星数 = 达成的目标数；没写的还按战斗星数折算 */
  const clearTier = exp.map.objectives?.length ? objectivesMet : mapStarTier(stars, maxStars)
  let rewards: Reward = {}
  if (end !== "abandoned") {
    const parts: Reward[] = exp.drops.map((drop) => drop.reward)
    if (cleared) {
      const table = rewardTable(exp.map.rewards)
      if (table) {
        const [before] = await tx
          .select({ clears: mapClears.clears })
          .from(mapClears)
          .where(and(eq(mapClears.userId, exp.userId), eq(mapClears.mapId, exp.mapId)))
          .limit(1)
        parts.push(
          rollRewardTable(table, {
            seed: exp.seed,
            stream: "clear",
            stars: clearTier,
            firstClear: !before || before.clears === 0,
            lootMult: status.lootMult,
          }),
        )
      }
    }
    rewards = mergeRewards(...parts)
  }

  const { playerExp = 0, cardExp = 0, expPool = 0, ...attachment } = rewards
  const viaMail = end === "expired"
  if (viaMail && !isAttachmentEmpty(attachment)) {
    await sendMail(
      exp.userId,
      {
        kind: "expedition",
        title: `远征到期结算：${exp.map.name}`,
        body: `你在「${exp.map.name}」的出征到期了，已拿到的奖励随这封邮件发给你。`,
        attachment,
      },
      tx,
    )
  } else if (!viaMail && !isAttachmentEmpty(attachment)) {
    await grantAttachment(tx, exp.userId, attachment, { source: "expedition", sourceRef: String(exp.id) })
  }
  await addPlayerExperience(tx, exp.userId, playerExp, now)
  await addCardExperience(
    tx,
    exp.userId,
    exp.pool.map((entry) => entry.userCardId),
    cardExp,
  )
  if (expPool > 0) {
    await addExpPool(tx, exp.userId, expPool, { source: "expedition", sourceRef: String(exp.id) })
  }

  if (cleared) {
    const questContext = { mapKind: exp.map.kind, mapId: exp.mapId, now }
    await recordQuestEvent(tx, exp.userId, "expedition-clear", questContext)
    await recordQuestEvent(tx, exp.userId, "expedition-tier", { ...questContext, value: status.tier })
    const fullTier = exp.map.objectives?.length ?? 3
    if (clearTier >= fullTier) await recordQuestEvent(tx, exp.userId, "expedition-perfect", questContext)
    const date = new Date(now)
    const [row] = await tx
      .select()
      .from(mapClears)
      .where(and(eq(mapClears.userId, exp.userId), eq(mapClears.mapId, exp.mapId)))
      .limit(1)
    if (row) {
      await tx
        .update(mapClears)
        .set({
          bestStars: Math.max(row.bestStars, stars),
          bestObjectives: Math.max(row.bestObjectives, objectivesMet),
          clears: row.clears + 1,
          lastClearedAt: date,
        })
        .where(and(eq(mapClears.userId, exp.userId), eq(mapClears.mapId, exp.mapId)))
    } else {
      await tx.insert(mapClears).values({
        userId: exp.userId,
        mapId: exp.mapId,
        bestStars: stars,
        bestObjectives: objectivesMet,
        clears: 1,
        firstClearedAt: date,
        lastClearedAt: date,
      })
    }
  }

  const settlement: ExpeditionSettlement = {
    end,
    rewards,
    stars,
    maxStars,
    tier: status.tier,
    objectives,
    viaMail,
  }
  await tx
    .update(expeditions)
    .set({
      status: end === "abandoned" ? "abandoned" : end === "expired" ? "expired" : "settled",
      endReason: end,
      settlement,
      endedAt: new Date(now),
      updatedAt: new Date(now),
    })
    .where(eq(expeditions.id, exp.id))
  return settlement
}

/** 结算：走到终点是「通关结算」，中途是「到此结算」（只给已经攒下的奖励） */
export async function settleExpedition(userId: string, now = Date.now()): Promise<ExpeditionSettlement> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    return finalize(tx, exp, atEnd(exp) ? "cleared" : "early", now)
  })
}

/** 放弃：什么奖励都不要 */
export async function abandonExpedition(userId: string, now = Date.now()): Promise<ExpeditionSettlement> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    return finalize(tx, exp, "abandoned", now)
  })
}

export async function suspendExpedition(userId: string, now = Date.now()): Promise<ExpeditionView> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    await tx.update(expeditions).set({ status: "suspended", updatedAt: new Date(now) }).where(eq(expeditions.id, exp.id))
    return viewById(tx, exp.id)
  })
}

export async function resumeExpedition(userId: string, now = Date.now()): Promise<ExpeditionView> {
  await expireDue(userId, now)
  return db.transaction(async (tx) => {
    const exp = await requireOpen(tx, userId, now)
    await tx.update(expeditions).set({ status: "active", updatedAt: new Date(now) }).where(eq(expeditions.id, exp.id))
    return viewById(tx, exp.id)
  })
}

/**
 * 到期检查（读取远征时顺便做，不用定时任务）：超过 24 小时或换图了的出征，
 * 已经拿到的奖励以邮件发到邮箱。每条单独一个事务；失败的保留，下次再试。
 */
export async function expireDue(userId: string, now = Date.now()): Promise<number> {
  const open = await db
    .select({ id: expeditions.id, expiresAt: expeditions.expiresAt })
    .from(expeditions)
    .where(and(eq(expeditions.userId, userId), inArray(expeditions.status, [...OPEN])))
  let done = 0
  for (const { id, expiresAt } of open) {
    if (expiresAt.getTime() > now) continue
    try {
      await db.transaction(async (tx) => {
        await lockUser(tx, userId)
        const [exp] = await tx.select().from(expeditions).where(eq(expeditions.id, id)).for("update")
        if (!exp || !(OPEN as readonly string[]).includes(exp.status)) return
        await finalize(tx, exp, "expired", now)
        done += 1
      })
    } catch (error) {
      console.warn(`[expedition] 到期结算 ${id} 失败，保留：`, error)
    }
  }
  return done
}

// ---------- 读取 ----------

export async function getCurrentExpedition(userId: string, now = Date.now()): Promise<ExpeditionView | null> {
  await expireDue(userId, now)
  const exp = await loadOpen(db, userId)
  return exp ? buildView(db, exp) : null
}

export interface MapListing {
  id: string
  kind: MapDef["kind"]
  name: string
  summary: string
  deckSize: number
  fights: number
  maxStars: number
  /** 现在开始的话，这次出征什么时候结束；离换图不足一小时前端要提示 */
  endsAt: string
  startable: boolean
  /** 没解锁时的原因（一句话）；可以开始时是 null */
  lockedReason: string | null
  clears: number
  bestStars: number
  /** 这张图有几个通关目标、历史最多达成几个（没写目标是 0 / 0） */
  objectiveCount: number
  bestObjectives: number
}

export async function listMaps(userId: string, now = Date.now()): Promise<MapListing[]> {
  const records = await db.select().from(mapClears).where(eq(mapClears.userId, userId))
  const byMap = new Map(records.map((row) => [row.mapId, row]))
  const unlockCtx = await loadUnlockContext(userId)
  const ordered = Object.entries(WORLD_CONTENT.maps).sort(([aId, a], [bId, b]) => {
    const diff = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    return diff !== 0 ? diff : aId.localeCompare(bId)
  })
  return ordered.map(([id, map]) => {
    const feature = mapFeature(map)
    const reason = feature && unlockCtx ? lockReason(feature, unlockCtx) : null
    const chapterLock =
      map.after && (byMap.get(map.after)?.clears ?? 0) <= 0
        ? `先通关《${WORLD_CONTENT.maps[map.after]?.name ?? map.after}》`
        : null
    return {
      id,
      kind: map.kind,
      name: map.name,
      summary: map.summary,
      deckSize: map.deckSize,
      fights: countMapFights(map),
      maxStars: maxMapStars(map),
      endsAt: new Date(expiryOf(map, now)).toISOString(),
      startable: reason === null && chapterLock === null,
      lockedReason: feature && reason ? lockMessage(feature, reason) : chapterLock,
      clears: byMap.get(id)?.clears ?? 0,
      bestStars: byMap.get(id)?.bestStars ?? 0,
      objectiveCount: map.objectives?.length ?? 0,
      bestObjectives: byMap.get(id)?.bestObjectives ?? 0,
    }
  })
}
