import { faceFromDef } from "@/card/def"
import type { CardFaceData, CardSkill, Job, Rarity } from "@/card/types"

/** `/users/:id/cards` 和 `/users/:id/deck` 共用的卡行 */
export interface ApiUserCard {
  id: string
  name: string
  rarity: Rarity
  job: Job
  no: number
  total: number
  country: string | null
  globalRank: number | null
  pp: string | null
  profileUrl: string | null
  art: string | null
  banner: string | null
  skills: CardSkill[]
  version: number
  userCardId: number
  level: number
  constellation: number
  exp: number
  obtainedAt?: string
}

export type CardSort = "recent" | "rarity" | "pp" | "name"

export interface CardPage {
  rows: ApiUserCard[]
  total: number
  limit: number
  offset: number
}

export interface DeckSlot {
  slot: number
  card: ApiUserCard | null
}

export interface ApiDeck {
  name: string
  slots: DeckSlot[]
  updatedAt: string | null
}

export function toFace(row: ApiUserCard): CardFaceData {
  return faceFromDef(
    {
      id: row.id,
      osuId: null,
      name: row.name,
      rarity: row.rarity,
      job: row.job,
      no: row.no,
      total: row.total,
      country: row.country ?? undefined,
      globalRank: row.globalRank,
      pp: row.pp == null ? null : Number(row.pp),
      profileUrl: row.profileUrl ?? undefined,
      art: row.art ?? undefined,
      banner: row.banner ?? undefined,
      skills: row.skills,
      version: row.version ?? 1,
    },
    { level: row.level, constellation: row.constellation },
  )
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message ?? "请求失败")
  return data.data as T
}

export function fetchUserCards(
  userId: string,
  params: {
    rarity?: string
    q?: string
    sort?: CardSort
    page?: number
    limit?: number
    signal?: AbortSignal
  } = {},
): Promise<CardPage> {
  const { rarity, q, sort = "recent", page = 0, limit = 24, signal } = params
  const search = new URLSearchParams({
    sort,
    limit: String(limit),
    offset: String(page * limit),
  })
  if (rarity) search.set("rarity", rarity)
  if (q) search.set("q", q)
  return request<CardPage>(`/api/users/${userId}/cards?${search.toString()}`, { signal })
}

export function fetchDeck(userId: string, signal?: AbortSignal): Promise<ApiDeck> {
  return request<ApiDeck>(`/api/users/${userId}/deck`, { signal })
}

export function saveDeck(
  userId: string,
  slots: (number | null)[],
): Promise<ApiDeck> {
  return request<ApiDeck>(`/api/users/${userId}/deck`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slots }),
  })
}

export function fetchFuel(
  userId: string,
  userCardId: number,
  signal?: AbortSignal,
): Promise<{ rows: ApiUserCard[] }> {
  return request<{ rows: ApiUserCard[] }>(
    `/api/users/${userId}/cards/${userCardId}/fuel`,
    { signal },
  )
}

export function levelUpCard(
  userId: string,
  userCardId: number,
): Promise<{ card: ApiUserCard; spent: number }> {
  return request<{ card: ApiUserCard; spent: number }>(
    `/api/users/${userId}/cards/${userCardId}/level`,
    { method: "POST" },
  )
}

export function ascendCard(
  userId: string,
  userCardId: number,
): Promise<{ card: ApiUserCard; consumedUserCardId: number }> {
  return request<{ card: ApiUserCard; consumedUserCardId: number }>(
    `/api/users/${userId}/cards/${userCardId}/constellation`,
    { method: "POST" },
  )
}

export function meltCard(
  userId: string,
  userCardId: number,
  sourceUserCardId: number,
): Promise<{ card: ApiUserCard; gained: number; consumedUserCardId: number }> {
  return request<{ card: ApiUserCard; gained: number; consumedUserCardId: number }>(
    `/api/users/${userId}/cards/${userCardId}/melt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUserCardId }),
    },
  )
}
