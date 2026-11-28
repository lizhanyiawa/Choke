import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError, fetchMe, fetchPackInventory, logout as apiLogout } from "@/desk/session/api"
import { onDeskData } from "@/desk/session/events"
import type { DeskUser } from "@/desk/lib/desk-page-model"

export interface DeskPackState {
  userId: string
  data: Record<string, number>
}

/** 非「未登录」的失败（断网 / 超时 / 5xx）自动重试：间隔和次数 */
const RETRY_MS = 4000
const MAX_RETRIES = 3

/**
 * 桌面会话：账号、钱包、卡包库存。
 * 只负责「谁登录了 / 他有多少卡包」，不碰桌面布局和拖拽。
 */
export function useDeskSession() {
  const [user, setUser] = useState<DeskUser | null>(null)
  /** /auth/me 回来过一次（登没登录都算），邀请函等它再决定要不要弹 */
  const [userReady, setUserReady] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [packState, setPackState] = useState<DeskPackState | null>(null)
  const [packError, setPackError] = useState<string | null>(null)
  /** 只采纳最新一次请求的结果 */
  const meSeq = useRef(0)
  const packSeq = useRef(0)
  const retryTimer = useRef<number | null>(null)
  const retries = useRef(0)
  const refreshRef = useRef<() => void>(() => {})

  const refreshUser = useCallback(() => {
    const seq = ++meSeq.current
    if (retryTimer.current) window.clearTimeout(retryTimer.current)
    retryTimer.current = null
    fetchMe()
      .then((d) => {
        if (seq !== meSeq.current) return
        retries.current = 0
        setUserError(null)
        setUser({
          id: d.id,
          username: d.username,
          publicId: d.publicId ?? null,
          avatarUrl: d.avatarUrl ?? null,
          essence: Number(d.essence ?? 0),
          coins: Number(d.coins ?? 0),
          expPool: Number(d.expPool ?? 0),
          items: d.items,
          hero: d.hero ?? null,
          onboarded: !!d.onboarded,
        })
      })
      .catch((reason: unknown) => {
        if (seq !== meSeq.current) return
        // 只有服务端明说没登录才清用户；网络抖动保留旧用户，稍后重试
        if (reason instanceof ApiError && reason.code === "unauthorized") {
          setUserError(null)
          setUser(null)
          return
        }
        setUserError(reason instanceof Error ? reason.message : "账号读取失败")
        if (retries.current < MAX_RETRIES) {
          retries.current += 1
          retryTimer.current = window.setTimeout(() => refreshRef.current(), RETRY_MS)
        }
      })
      .finally(() => {
        if (seq === meSeq.current) setUserReady(true)
      })
  }, [])

  useEffect(() => {
    refreshRef.current = refreshUser
    refreshUser()
    return () => {
      meSeq.current += 1
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
    }
  }, [refreshUser])

  const userId = user?.id ?? null
  const refreshPacks = useCallback(() => {
    if (!userId) return
    const seq = ++packSeq.current
    fetchPackInventory(userId)
      .then((d) => {
        if (seq !== packSeq.current) return
        setPackError(null)
        setPackState({ userId, data: d.packs })
      })
      .catch((reason: unknown) => {
        if (seq === packSeq.current) {
          setPackError(reason instanceof Error ? reason.message : "卡包库存读取失败")
        }
      })
  }, [userId])

  useEffect(() => {
    refreshPacks()
    return () => { packSeq.current += 1 }
  }, [refreshPacks])

  useEffect(() => {
    return onDeskData("packs", () => refreshPacks())
  }, [refreshPacks])

  useEffect(() => {
    return onDeskData("user", () => refreshUser())
  }, [refreshUser])

  /** 取包 / 还包 / 开包的响应比进行中的库存刷新新：直接写入并让旧请求作废 */
  const applyPackState = useCallback((next: DeskPackState | null) => {
    packSeq.current += 1
    setPackError(null)
    setPackState(next)
  }, [])

  const logout = useCallback(() => {
    apiLogout()
      .catch(() => {})
      .finally(() => {
        meSeq.current += 1
        packSeq.current += 1
        if (retryTimer.current) window.clearTimeout(retryTimer.current)
        setUserError(null)
        setPackError(null)
        setPackState(null)
        setUser(null)
      })
  }, [])

  return {
    user,
    setUser,
    userReady,
    userError,
    packError,
    packState,
    setPackState: applyPackState,
    refreshUser,
    refreshPacks,
    logout,
  }
}
