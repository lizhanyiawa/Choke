import type { PanelId } from "@/desk/shell/DeskBook"
import {
  lockMessage,
  lockReason,
  unlockLevelOf as featureLevel,
  type FeatureId,
} from "@choke/shared/unlocks"

import type { PlayerProgress } from "./types"

/** 桌面上会出现锁的模块：九个书本章节 + 发牌按钮 + 邀请函；每个都是 content/unlocks.json 里的一个功能 */
export type ModuleId = PanelId | "button" | "invite"

/**
 * 解锁条件不在前端写：等级、是否要完成引导、是否要绑定 osu! 都在 content/unlocks.json，
 * 服务端校验用的是同一份。教程流程只负责把等级推到 2 / 3。
 */
export type UnlockProgress = Pick<PlayerProgress, "level" | "tutorialDone" | "linkedAccount">

const contextOf = (progress: UnlockProgress) => ({
  level: progress.level,
  tutorialDone: progress.tutorialDone,
  linkedAccount: progress.linkedAccount,
})

export function unlockLevelOf(id: ModuleId): number {
  return featureLevel(id)
}

export function isModuleUnlocked(id: ModuleId, progress: UnlockProgress): boolean {
  return lockReason(id, contextOf(progress)) === null
}

/** 桌面上是否画出这个物件；市场例外：永远画出，但呈锁定态 */
export function isModuleVisibleOnDesk(id: ModuleId, progress: UnlockProgress): boolean {
  if (id === "market") return true
  return isModuleUnlocked(id, progress)
}

export function lockHintOf(id: ModuleId, progress: UnlockProgress): string {
  const need = featureLevel(id)
  const reason = lockReason(id, contextOf(progress))
  switch (reason?.kind) {
    case "account":
      return "绑定 osu! 账号后才能使用，游客和邮箱号只能看"
    case "tutorial":
      return progress.level < need ? `需要 Lv.${need} + 完成新手教程` : "先完成新手教程解锁"
    case "level":
      return `需要 Lv.${need} 解锁，还差 ${need - progress.level} 级`
    default:
      return `需要 Lv.${need} 解锁`
  }
}

/**
 * 任意功能的锁提示（不限于桌面上的模块：喂养、融合、镀闪、分解、NPC 回收、体力药水……）。
 * 解锁了返回 null；文案和服务端拒绝时给的是同一句。
 */
export function featureLockHint(id: FeatureId, progress: UnlockProgress): string | null {
  const reason = lockReason(id, contextOf(progress))
  return reason ? lockMessage(id, reason) : null
}

/** 锁的短标记，给放不下一句话的地方用（导航项的角标）。解锁了返回 null */
export function featureLockTag(id: FeatureId, progress: UnlockProgress): string | null {
  const reason = lockReason(id, contextOf(progress))
  switch (reason?.kind) {
    case "level":
      return `Lv.${reason.level}`
    case "account":
      return "未绑定"
    case "tutorial":
      return "未解锁"
    default:
      return null
  }
}
