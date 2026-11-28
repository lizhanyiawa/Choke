import { z } from "zod"

import type { MailAttachmentLine } from "./mail"
import { RARITIES } from "./types"

/**
 * 成就与签到的内容格式和纯规则。内容写在 content/quests.json，进度由服务端在各个动作里记账。
 * 这里不 import 内容（items / packs），引用是否存在由 content/schema.ts 统一核对。
 * 日常 / 周常 / 月常任务和活跃度宝箱已经砍掉，只剩一次性成就和每日签到。
 */

/** 进度表里成就统一用的周期编号（成就不重置，永远是同一行） */
export const ONCE_KEY = "once"

/** 服务端会记账的事件；新增事件要同时在对应的服务端动作里加一行 recordQuestEvent */
export const QUEST_EVENTS = [
  "sign-in",
  "pack-open",
  "fuse",
  "dismantle",
  "market-buy",
  "market-sell",
  "expedition-win",
  "expedition-clear",
  "expedition-perfect",
  "expedition-tier",
  "card-obtain",
  "card-level",
  "constellation",
  "player-level",
  "osu-daily-pass",
] as const
export type QuestEvent = (typeof QUEST_EVENTS)[number]

/**
 * 「取最大值」的事件：进度不是累加，而是记到目前为止达到过的最高值（等级、命座、难度档位）。
 * 记账时传 value；进度 = max(原进度, value)。
 */
export const QUEST_MAX_EVENTS = [
  "expedition-tier",
  "card-level",
  "constellation",
  "player-level",
] as const satisfies readonly QuestEvent[]

export function isMaxEvent(event: QuestEvent): boolean {
  return (QUEST_MAX_EVENTS as readonly string[]).includes(event)
}

export const QUEST_EVENT_LABEL: Record<QuestEvent, string> = {
  "sign-in": "签到",
  "pack-open": "开卡包（每包 1 次）",
  fuse: "融合（每次 1 次）",
  dismantle: "分解（每张卡 1 次）",
  "market-buy": "市场买入",
  "market-sell": "市场卖出",
  "expedition-win": "远征里打赢一场战斗",
  "expedition-clear": "远征走到终点通关（到此结算不算）",
  "expedition-perfect": "远征通关且拿到最高星级",
  "expedition-tier": "远征通关时的难度档位（取最高，1–5）",
  "card-obtain": "获得一张卡（可限定稀有度）",
  "card-level": "一张卡的等级（取最高）",
  constellation: "一张卡的命座（取最高）",
  "player-level": "玩家等级（取最高）",
  "osu-daily-pass": "在 osu! 里通过今天的推荐谱面",
}

/** 只有远征类事件可以限定地图种类。和 expedition/content.ts 的 MAP_KINDS 一致，测试里核对 */
export const QUEST_MAP_KINDS = ["main", "season", "weekly", "daily"] as const
export type QuestMapKind = (typeof QUEST_MAP_KINDS)[number]

/** 签到固定用的任务 id：进度表里用它存签到记录，所以不能被普通任务占用 */
export const SIGN_IN_ID = "sign-in"

const amount = z.number().int().min(1).max(1_000_000)
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "id 只能用字母、数字和连字符")

/** 奖励：和邮件附件同一套字段（不含卡牌），领取时直接走发奖函数 */
export const questRewardSchema = z
  .strictObject({
    coins: amount.optional(),
    essence: amount.optional(),
    /** 玩家经验：直接加到账号上，不走邮件附件和流水 */
    playerExp: amount.optional(),
    items: z.array(z.strictObject({ itemId: z.string(), count: amount })).min(1).max(20).optional(),
    packs: z.array(z.strictObject({ pool: z.string(), count: amount })).min(1).max(20).optional(),
  })
  .refine((reward) => Object.keys(reward).length > 0, "奖励不能是空的")

export type QuestReward = z.infer<typeof questRewardSchema>

export const questSchema = z.strictObject({
  name: z.string().min(1).max(20),
  desc: z.string().min(1).max(60),
  /** 前端分组用的小标题（成就页分栏），不影响规则 */
  group: z.string().min(1).max(10).optional(),
  event: z.enum(QUEST_EVENTS),
  target: z.number().int().min(1).max(100_000),
  /** 只记这种地图上的远征；只能配在 expedition-* 事件上 */
  mapKind: z.enum(QUEST_MAP_KINDS).optional(),
  /** 只记这张具体地图；只能配在 expedition-* 事件上，地图要存在 */
  mapId: id.optional(),
  /** 只记这个稀有度及以上的卡；只能配在 card-obtain 事件上 */
  minRarity: z.enum(RARITIES).optional(),
  rewards: questRewardSchema,
})

export type QuestDef = z.infer<typeof questSchema>

export const questsSchema = z.strictObject({
  signIn: z.strictObject({
    /** 平时每天的签到奖励 */
    base: questRewardSchema,
    /** 「本月第几天」的特别奖励：写了的那天用它，代替 base */
    bonus: z.record(z.string().regex(/^(?:[1-9]|[12]\d|3[01])$/, "键是 1–31 的日期"), questRewardSchema),
  }),
  quests: z.record(id, questSchema),
})

export type QuestsContent = z.infer<typeof questsSchema>

// ---------- 纯规则 ----------

/** 一次事件带的附加信息：用来匹配任务上的限定条件 */
export interface QuestEventContext {
  mapKind?: string
  mapId?: string
  rarity?: string
}

/** 这个事件（和地图、稀有度）算不算这条任务的进度 */
export function questCounts(def: QuestDef, event: QuestEvent, context: QuestEventContext = {}): boolean {
  if (def.event !== event) return false
  if (def.mapKind !== undefined && def.mapKind !== context.mapKind) return false
  if (def.mapId !== undefined && def.mapId !== context.mapId) return false
  if (def.minRarity !== undefined) {
    const rank = RARITIES.indexOf(context.rarity as (typeof RARITIES)[number])
    if (rank < RARITIES.indexOf(def.minRarity)) return false
  }
  return true
}

/** 某个月有几天；monthKey 形如 2026-11 */
export function daysInMonthKey(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number)
  return new Date(Date.UTC(year!, month!, 0)).getUTCDate()
}

/** 本月第 day 天的签到奖励 */
export function signInRewardFor(signIn: QuestsContent["signIn"], day: number): QuestReward {
  return signIn.bonus[String(day)] ?? signIn.base
}

/** 把多份奖励合成一份：同种道具、同种卡包数量相加 */
export function mergeQuestRewards(rewards: readonly QuestReward[]): QuestReward {
  const out: QuestReward = {}
  const items = new Map<string, number>()
  const packs = new Map<string, number>()
  for (const reward of rewards) {
    if (reward.coins) out.coins = (out.coins ?? 0) + reward.coins
    if (reward.essence) out.essence = (out.essence ?? 0) + reward.essence
    if (reward.playerExp) out.playerExp = (out.playerExp ?? 0) + reward.playerExp
    for (const { itemId, count } of reward.items ?? []) items.set(itemId, (items.get(itemId) ?? 0) + count)
    for (const { pool, count } of reward.packs ?? []) packs.set(pool, (packs.get(pool) ?? 0) + count)
  }
  if (items.size > 0) out.items = [...items].map(([itemId, count]) => ({ itemId, count }))
  if (packs.size > 0) out.packs = [...packs].map(([pool, count]) => ({ pool, count }))
  return out
}

// ---------- 给前端的视图 ----------

export interface QuestView {
  id: string
  name: string
  desc: string
  /** 这条任务数的是哪种事件；界面按它决定「前往」带玩家去哪 */
  event: QuestEvent
  /** 成就页的分栏小标题 */
  group?: string
  target: number
  progress: number
  /** 完成了、还没领 */
  claimable: boolean
  claimed: boolean
  rewards: MailAttachmentLine[]
}

export interface SignInDayView {
  day: number
  rewards: MailAttachmentLine[]
  /** 这一天签到了没有（只有本月已过的天数才可能为 true） */
  signed: boolean
  /** 是不是特别奖励的那几天 */
  special: boolean
}

export interface QuestsOverview {
  now: string
  quests: QuestView[]
  /** 可以领的成就条数，红点用 */
  claimable: number
  signIn: {
    monthKey: string
    /** 今天是本月第几天 */
    today: number
    signedToday: boolean
    signedDays: number
    days: SignInDayView[]
  }
}
