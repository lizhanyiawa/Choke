import { ApiError } from "@/desk/session/api"

export function errorText(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return "出了点问题，请稍后再试"
}

/** 离某个时刻还有多久，大白话：2 天 3 小时 / 5 小时 20 分 / 12 分钟 */
export function remainingText(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return "已结束"
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes % 60} 分`
  return `${Math.max(1, minutes)} 分钟`
}

export const HOUR_MS = 3_600_000
export const endsWithinHour = (iso: string, now = Date.now()) => {
  const ms = new Date(iso).getTime() - now
  return ms > 0 && ms < HOUR_MS
}
