import { createContext, useContext } from "react"

import type { DeskUser } from "@/desk/lib/desk-page-model"
import type { PlayerProgress } from "@/tutorial/types"

export type Notify = (text: string, kind?: "info" | "success" | "error") => void

/** 外壳给每个页面的东西。能进到页面里说明已经登录、领过新手礼包、走完了新手引导 */
export interface FlatContextValue {
  user: DeskUser
  progress: PlayerProgress
  /** 各卡池的卡包库存；还没取回来是 null */
  packs: Record<string, number> | null
  packError: string | null
  /** 页面底部的提示条。kind 决定音效和停留时间；错误停得久一点 */
  notify: Notify
  /** 金币、精华、本体卡变了之后调：顶栏的数字跟着变 */
  refreshUser: () => void
  /** 卡包数量变了之后调 */
  refreshPacks: () => void
  /** 用领取或开包回包里的新库存，立即同步所有入口。 */
  setPacks: (counts: Record<string, number>) => void
  logout: () => void
}

export const FlatContext = createContext<FlatContextValue | null>(null)

export function useFlat(): FlatContextValue {
  const value = useContext(FlatContext)
  if (!value) throw new Error("useFlat 只能用在扁平界面的页面里")
  return value
}
