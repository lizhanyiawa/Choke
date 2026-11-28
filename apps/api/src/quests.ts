import { and, eq, inArray, like } from "drizzle-orm"

import { ITEMS } from "@choke/shared/items"
import type { MailAttachment, MailAttachmentLine } from "@choke/shared/mail"
import {
  ONCE_KEY,
  SIGN_IN_ID,
  daysInMonthKey,
  mergeQuestRewards,
  signInRewardFor,
  type QuestReward,
  type QuestView,
  type QuestsOverview,
} from "@choke/shared/quests"
import { periodKey, resetMonthDay, resetMonthKey } from "@choke/shared/reset"

import { QUEST_CONTENT } from "./content"
import { db } from "./db/client"
import { questProgress, users } from "./db/schema"
import { MYSTERY_PACK, PACKS } from "./gacha/packs"
import type { LedgerSource } from "./ledger"
import { addPlayerExperience } from "./player-exp"
import { QUESTS, recordQuestEvent } from "./quest-events"
import { grantAttachment } from "./rewards"
import { TxAbort, lockUser, type Tx } from "./tx"

type Exec = Tx | typeof db

/** 奖励在 schema 里已经核对过物品和卡包都存在，这里只是换成发奖函数认的类型 */
const asAttachment = (reward: QuestReward) => reward as MailAttachment

/** 发奖励：玩家经验直接加到账号上（不进邮件附件和流水），其余走发奖函数 */
async function grantQuestReward(tx: Tx, userId: string, reward: QuestReward, origin: LedgerSource, now: number) {
  const { playerExp = 0, ...rest } = reward
  if (Object.keys(rest).length > 0) await grantAttachment(tx, userId, asAttachment(rest), origin)
  await addPlayerExperience(tx, userId, playerExp, now)
}

// ---------- 读取 ----------

type Row = typeof questProgress.$inferSelect

/** 成就的进度行（成就不重置，永远是同一个周期编号） */
async function achievementRows(exec: Exec, userId: string, lock = false): Promise<Row[]> {
  const ids = QUESTS.map(([questId]) => questId)
  if (ids.length === 0) return []
  const query = exec
    .select()
    .from(questProgress)
    .where(and(eq(questProgress.userId, userId), inArray(questProgress.questId, ids), eq(questProgress.periodKey, ONCE_KEY)))
  return lock ? query.for("update") : query
}

/**
 * 玩家等级升级的地方有好几处，不逐个埋点：读成就和领奖前，把当前等级补记一笔（等级只增不减，补记不会漏）。
 */
async function syncPlayerLevel(exec: Exec, userId: string, now: number): Promise<void> {
  if (!QUESTS.some(([, def]) => def.event === "player-level")) return
  const [row] = await exec.select({ level: users.playerLevel }).from(users).where(eq(users.id, userId)).limit(1)
  if (row) await recordQuestEvent(exec, userId, "player-level", { value: row.level, now })
}

function rewardLines(reward: QuestReward): MailAttachmentLine[] {
  const lines: MailAttachmentLine[] = []
  if (reward.coins) lines.push({ kind: "coins", label: "金币", count: reward.coins })
  if (reward.essence) lines.push({ kind: "essence", label: "闪卡精华", count: reward.essence })
  if (reward.playerExp) lines.push({ kind: "playerExp", label: "玩家经验", count: reward.playerExp })
  for (const { itemId, count } of reward.items ?? []) {
    lines.push({ kind: "item", label: ITEMS[itemId as keyof typeof ITEMS]?.name ?? itemId, count })
  }
  for (const { pool, count } of reward.packs ?? []) {
    const name = pool === MYSTERY_PACK.id ? MYSTERY_PACK.name : ((PACKS as Record<string, { name: string }>)[pool]?.name ?? pool)
    lines.push({ kind: "pack", label: name, count })
  }
  return lines
}

/** 总览：成就 + 签到 */
export async function getQuests(userId: string, now = Date.now()): Promise<QuestsOverview> {
  await syncPlayerLevel(db, userId, now)

  const rows = await achievementRows(db, userId)
  const byQuest = new Map(rows.map((row) => [row.questId, row]))

  const quests: QuestView[] = QUESTS.map(([questId, def]) => {
    const row = byQuest.get(questId)
    const progress = Math.min(def.target, row?.progress ?? 0)
    const claimed = row?.claimedAt != null
    return {
      id: questId,
      name: def.name,
      desc: def.desc,
      event: def.event,
      ...(def.group ? { group: def.group } : {}),
      target: def.target,
      progress,
      claimable: !claimed && progress >= def.target,
      claimed,
      rewards: rewardLines(def.rewards),
    }
  })

  const monthKey = resetMonthKey(now)
  const today = resetMonthDay(now)
  const signed = await db
    .select({ periodKey: questProgress.periodKey })
    .from(questProgress)
    .where(and(eq(questProgress.userId, userId), eq(questProgress.questId, SIGN_IN_ID), like(questProgress.periodKey, `${monthKey}-%`)))
  const signedSet = new Set(signed.map((row) => Number(row.periodKey.slice(8))))

  return {
    now: new Date(now).toISOString(),
    quests,
    claimable: quests.filter((quest) => quest.claimable).length,
    signIn: {
      monthKey,
      today,
      signedToday: signedSet.has(today),
      signedDays: signedSet.size,
      days: Array.from({ length: daysInMonthKey(monthKey) }, (_, i) => {
        const day = i + 1
        return {
          day,
          rewards: rewardLines(signInRewardFor(QUEST_CONTENT.signIn, day)),
          signed: signedSet.has(day),
          special: Object.hasOwn(QUEST_CONTENT.signIn.bonus, String(day)),
        }
      }),
    },
  }
}

// ---------- 领奖 ----------

function questOrThrow(questId: string) {
  const def = QUEST_CONTENT.quests[questId]
  if (!def) throw new TxAbort(404, "not_found", "没有这个成就")
  return def
}

async function claimRow(tx: Tx, userId: string, questId: string, row: Row, now: number): Promise<QuestReward> {
  const def = QUEST_CONTENT.quests[questId]!
  await grantQuestReward(tx, userId, def.rewards, { source: "quest", sourceRef: `${questId}@${row.periodKey}` }, now)
  await tx
    .update(questProgress)
    .set({ claimedAt: new Date(now), updatedAt: new Date(now) })
    .where(and(eq(questProgress.userId, userId), eq(questProgress.questId, questId), eq(questProgress.periodKey, row.periodKey)))
  return def.rewards
}

/** 领一条成就的奖励：事务里先锁用户再查进度，重复点、同时点都只会发一次 */
export async function claimQuest(userId: string, questId: string, now = Date.now()) {
  const def = questOrThrow(questId)
  await syncPlayerLevel(db, userId, now)
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    const [row] = await tx
      .select()
      .from(questProgress)
      .where(and(eq(questProgress.userId, userId), eq(questProgress.questId, questId), eq(questProgress.periodKey, ONCE_KEY)))
      .for("update")
    if (!row || row.progress < def.target) throw new TxAbort(400, "not_done", "这个成就还没完成")
    if (row.claimedAt) throw new TxAbort(400, "already_claimed", "这个成就的奖励已经领过了")
    const reward = await claimRow(tx, userId, questId, row, now)
    return { questId, rewards: rewardLines(reward) }
  })
}

/** 一键全领：领完所有完成了没领的成就；任何一条失败整批回滚 */
export async function claimAllQuests(userId: string, now = Date.now()) {
  await syncPlayerLevel(db, userId, now)
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    const claimed: string[] = []
    const rewards: QuestReward[] = []
    for (const row of await achievementRows(tx, userId, true)) {
      const def = QUEST_CONTENT.quests[row.questId]
      if (!def || row.claimedAt || row.progress < def.target) continue
      rewards.push(await claimRow(tx, userId, row.questId, row, now))
      claimed.push(row.questId)
    }
    return { claimed, rewards: rewardLines(mergeQuestRewards(rewards)) }
  })
}

// ---------- 签到 ----------

/** 签到：每天 4:00 换日，一天一次，不补签。奖励按「本月第几天」查表 */
export async function signIn(userId: string, now = Date.now()) {
  const dayKey = periodKey("daily", now)
  const day = resetMonthDay(now)
  const reward = signInRewardFor(QUEST_CONTENT.signIn, day)
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    const inserted = await tx
      .insert(questProgress)
      .values({ userId, questId: SIGN_IN_ID, periodKey: dayKey, progress: 1, claimedAt: new Date(now) })
      .onConflictDoNothing()
      .returning({ periodKey: questProgress.periodKey })
    if (inserted.length === 0) throw new TxAbort(400, "already_signed", "今天已经签到过了")
    await grantQuestReward(tx, userId, reward, { source: "sign-in", sourceRef: dayKey }, now)
    await recordQuestEvent(tx, userId, "sign-in", { now })
    return { day, rewards: rewardLines(reward) }
  })
}
