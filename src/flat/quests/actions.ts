import { useRef, useState } from "react"

import {
  ApiError,
  claimAllQuests,
  claimQuest as apiClaimQuest,
  signIn as apiSignIn,
} from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { rewardText } from "@/flat/ui/Rewards"
import { refreshProgress } from "@/tutorial/store"
import type { MailAttachmentLine } from "@choke/shared/mail"

import { refreshQuests } from "./store"

export type QuestBusy = "sign-in" | "claim-all" | `quest:${string}` | null

export interface QuestActions {
  /** 正在进行的动作；有值时所有领取 / 签到按钮都禁用 */
  busy: QuestBusy
  signIn: () => Promise<void>
  claimAll: () => Promise<void>
  claimQuest: (questId: string) => Promise<void>
}

/** 服务端这样拒绝，说明界面上的状态已经过时了：多开了页面，或者页面开着跨过了重置点 */
const STALE_CODES: Record<string, true> = {
  already_claimed: true,
  not_done: true,
  already_signed: true,
  not_found: true,
}

/** 四个接口回来的东西里，这里用得到的部分 */
interface Granted {
  rewards: MailAttachmentLine[]
  /** 一键领取时一样都没领到：不是错误，只是没有可领的 */
  nothing?: boolean
}

/**
 * 领任务、领宝箱、一键领取、签到。任务页和首页的「今日」卡共用。
 * 四个动作走同一条流程、共用一个 busy：同一时间只做一件事，结果用提示条说，
 * 做完把任务总览和顶栏上的数字一起对一遍。
 */
export function useQuestActions(): QuestActions {
  const { user, notify, refreshUser, refreshPacks } = useFlat()
  const [busy, setBusy] = useState<QuestBusy>(null)
  // busy 要到下一次渲染才看得到新值；拦连点得用当场生效的 ref
  const running = useRef(false)

  const run = async (key: NonNullable<QuestBusy>, call: () => Promise<Granted>) => {
    if (running.current) return
    running.current = true
    setBusy(key)
    try {
      const { rewards, nothing } = await call()
      if (nothing) notify("现在没有可以领的", "info")
      else notify(rewards.length > 0 ? `获得：${rewardText(rewards)}` : "已领取", "success")
      // 顶栏的数字不用排在任务总览后面等，一起发出去
      refreshUser()
      refreshPacks()
      void refreshProgress()
      // 等总览回来再松开按钮：不然旧的「领取」还亮着，能再点一次
      await refreshQuests()
    } catch (error) {
      notify(error instanceof Error ? error.message : "出了点问题，请稍后再试", "error")
      // hasOwn：错误码是服务端给的字符串，直接下标取会把 constructor 这类原型上的名字也当成命中
      if (error instanceof ApiError && error.code && Object.hasOwn(STALE_CODES, error.code)) await refreshQuests()
    } finally {
      running.current = false
      setBusy(null)
    }
  }

  return {
    busy,
    signIn: () => run("sign-in", () => apiSignIn(user.id)),
    claimAll: () =>
      run("claim-all", async () => {
        const { claimed, rewards } = await claimAllQuests(user.id)
        return { rewards, nothing: claimed.length === 0 }
      }),
    claimQuest: (questId) => run(`quest:${questId}`, () => apiClaimQuest(user.id, questId)),
  }
}
