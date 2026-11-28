import { useEffect, useRef, useState } from "react"

/**
 * 每隔 intervalMs 给一次本机现在的时间，倒计时用。
 * 页面在后台时浏览器会放慢计时器，所以回到前台立刻补一次。
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, intervalMs)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [intervalMs])
  return now
}

/** 到点重取却没换到新一轮：第一次隔这么久再取，之后每次翻倍，最长 RETRY_MAX_MS */
const RETRY_FIRST_MS = 30_000
const RETRY_MAX_MS = 10 * 60_000

/**
 * 倒计时走到头（dueAt，毫秒）就调一次 refetch，把过期的数据换成新一轮的。
 * 什么都不画：每秒走一格的秒表关在这个组件里，放它的页面不用跟着每秒重画。
 * 取回来的还是旧的一轮（请求失败了，或者本机的钟走快了）就隔一阵再取，一次比一次隔得久。
 * skew 是服务器的钟比本机快多少毫秒；接口不给服务器时间就不传。
 * refetch 要是不变的函数（模块里的函数，或者 useCallback 过的）。
 */
export function RefetchWhenDue({
  dueAt,
  refetch,
  skew = 0,
}: {
  dueAt: number
  refetch: () => void
  skew?: number
}): null {
  const now = useNow(1000)
  const due = dueAt <= now + skew
  /** 上一次是为哪个 dueAt 取的、什么时候取的、下一次要隔多久 */
  const asked = useRef({ dueAt: Number.NaN, at: 0, wait: RETRY_FIRST_MS })
  useEffect(() => {
    if (!due) return
    const last = asked.current
    const again = last.dueAt === dueAt
    if (again && now - last.at < last.wait) return
    asked.current = { dueAt, at: now, wait: again ? Math.min(last.wait * 2, RETRY_MAX_MS) : RETRY_FIRST_MS }
    refetch()
  }, [due, dueAt, now, refetch])
  return null
}

/** 还剩多久，大白话：3 天 5 小时 / 3 小时 12 分 / 12 分 5 秒 / 58 秒。不到 1 秒按 0 秒 */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`
  return `${seconds} 秒`
}

/** 分:秒，不足一秒向上取整（倒计时显示 00:01 而不是 00:00） */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}
