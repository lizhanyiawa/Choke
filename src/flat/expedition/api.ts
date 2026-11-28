import type { BattleAction } from "@choke/shared/battle/actions"
import type { ExpeditionAllocation } from "@choke/shared/expedition-points"
import type { MapDef } from "@choke/shared/expedition/content"
import type { ExpeditionSettlement, ExpeditionView } from "@choke/shared/expedition/view"

import { request } from "@/desk/session/api"

/** 地图列表里的一项（和服务端 MapListing 一一对应） */
export interface MapListing {
  id: string
  kind: MapDef["kind"]
  name: string
  summary: string
  deckSize: number
  fights: number
  maxStars: number
  /** 现在开始的话，这次出征什么时候结束（ISO 时间） */
  endsAt: string
  startable: boolean
  lockedReason: string | null
  clears: number
  bestStars: number
  objectiveCount: number
  bestObjectives: number
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

const base = (userId: string) => `/api/users/${encodeURIComponent(userId)}/expeditions`

export const fetchExpeditionMaps = (userId: string, signal?: AbortSignal) =>
  request<MapListing[]>(`${base(userId)}/maps`, { signal })

/** 当前没结束的出征；没有返回 null。服务端读取时顺便做到期结算 */
export const fetchCurrentExpedition = (userId: string, signal?: AbortSignal) =>
  request<ExpeditionView | null>(`${base(userId)}/current`, { signal })

export const startExpedition = (userId: string, body: { mapId: string; cardIds: number[]; allocation: ExpeditionAllocation }) =>
  request<ExpeditionView>(base(userId), json(body))

export const moveExpedition = (userId: string, to: string) =>
  request<ExpeditionView>(`${base(userId)}/current/node`, json({ to }))

export const submitStory = (userId: string, choices: number[]) =>
  request<ExpeditionView>(`${base(userId)}/current/story`, json({ choices }))

export const submitEvent = (userId: string, choice: number) =>
  request<ExpeditionView>(`${base(userId)}/current/event`, json({ choice }))

export const submitLineup = (userId: string, lineup: number[]) =>
  request<ExpeditionView>(`${base(userId)}/current/battle/lineup`, json({ lineup }))

export const uploadBattleActions = (userId: string, body: { base: number; actions: BattleAction[] }) =>
  request<ExpeditionView>(`${base(userId)}/current/battle/actions`, json(body))

export const retryBattle = (userId: string) =>
  request<ExpeditionView>(`${base(userId)}/current/battle/retry`, { method: "POST" })

export const settleExpedition = (userId: string) =>
  request<ExpeditionSettlement>(`${base(userId)}/current/settle`, { method: "POST" })

export const abandonExpedition = (userId: string) =>
  request<ExpeditionSettlement>(`${base(userId)}/current/abandon`, { method: "POST" })

export const suspendExpedition = (userId: string) =>
  request<ExpeditionView>(`${base(userId)}/current/suspend`, { method: "POST" })

export const resumeExpedition = (userId: string) =>
  request<ExpeditionView>(`${base(userId)}/current/resume`, { method: "POST" })
