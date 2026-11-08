import { useEffect, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { faceFromDef } from "@/card/def"
import type { CardFaceData, CardSkill, Job, Rarity } from "@/card/types"

import { fetchPackInventory } from "./api"
import { DESK_ADD_CARDS_EVENT, PACKS_CHANGED_EVENT, setCardDrag, toDeskCard } from "./drag"
import "./gacha-panel.css"

const API = "/api"

export type PoolId = "normal" | "idle" | "golden" | "radiant" | "sky" | "prism"

interface Pool {
  id: PoolId
  name: string
  note: string
  color: string
}

const POOLS: Pool[] = [
  { id: "normal", name: "普通", note: "日常主力", color: "#e5484d" },
  { id: "idle", name: "挂机", note: "低成本", color: "#3cbadb" },
  { id: "golden", name: "黄金", note: "任务产出", color: "#ffc24b" },
  { id: "radiant", name: "璀璨", note: "周常奖励", color: "#b98cff" },
  { id: "sky", name: "天穹", note: "月常奖励", color: "#21e985" },
  { id: "prism", name: "棱彩", note: "赛季牌面", color: "#f4f4f6" },
]

interface ApiCard {
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
}

interface Pity {
  before: number
  after: number
}

interface OpenResponse {
  ok: boolean
  data?: {
    results: { cardId: string; rarity: Rarity; fromPity: boolean; userCardId: number }[]
    pity: Pity
    packs?: Record<string, number>
  }
  error?: { message?: string }
}

interface CardResponse {
  ok: boolean
  data?: ApiCard
  error?: { message?: string }
}

function toFace(row: ApiCard): CardFaceData {
  return faceFromDef({
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
  })
}

export function GachaPanel({
  userId,
  initialPool = "normal",
}: {
  userId: string | null
  initialPool?: PoolId
}) {
  const [pool, setPool] = useState<PoolId>(initialPool)
  const [cards, setCards] = useState<(CardFaceData & { userCardId: number })[]>([])
  const [pity, setPity] = useState<Pity | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [packs, setPacks] = useState<{ userId: string; data: Record<string, number> } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchPackInventory(userId)
      .then((data) => {
        if (!cancelled) setPacks({ userId, data: data.packs })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  const current = POOLS.find((item) => item.id === pool) ?? POOLS[0]
  const pityPercent = pity ? Math.min(100, (pity.after / 60) * 100) : 0
  const currentPacks = packs && packs.userId === userId ? packs.data : null
  const packCount = currentPacks?.[pool] ?? 0

  function selectPool(id: PoolId) {
    if (id === pool) return
    setPool(id)
    setCards([])
    setPity(null)
    setError(null)
  }

  async function openPack() {
    if (!userId || loading) return

    setLoading(true)
    setError(null)
    setCards([])

    try {
      const res = await fetch(`${API}/packs/${pool}/open`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      })
      const payload = (await res
        .json()
        .catch(() => null)) as OpenResponse | null

      if (!res.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "开包失败")
      }

      const result = payload.data
      setPity(result.pity)
      if (result.packs) setPacks({ userId: userId!, data: result.packs })
      window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))

      const faces = await Promise.all(
        result.results.map(async (item) => {
          const detailRes = await fetch(
            `${API}/cards/${encodeURIComponent(item.cardId)}`,
            {
              credentials: "include",
            }
          )
          const detail = (await detailRes
            .json()
            .catch(() => null)) as CardResponse | null

          if (!detailRes.ok || !detail?.ok || !detail.data) {
            throw new Error(detail?.error?.message ?? "卡详情加载失败")
          }
          return { ...toFace(detail.data), userCardId: item.userCardId }
        })
      )

      setCards(faces)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "开包失败")
    } finally {
      setLoading(false)
    }
  }

  const emptySlots = Array.from({ length: 5 }, (_, index) => index)

  const sendAllToDesk = () => {
    if (!cards.length) return
    const payload = cards.map((card) => toDeskCard(card, card.userCardId))
    window.dispatchEvent(new CustomEvent(DESK_ADD_CARDS_EVENT, { detail: payload }))
    setCards([])
  }

  return (
    <div className="gacha-panel">
      <header className="gacha-panel__head">
        <div>
          <span className="gacha-panel__eyebrow">
            PACK OPENING · SERVER RNG
          </span>
          <p className="gacha-panel__lead">
            六池任选，一次 5 张。60 抽未出 L 及以上时强制保底。
          </p>
        </div>
        <span className="gacha-panel__stamp">5 / PACK</span>
      </header>

      <div className="gacha-panel__pools" role="group" aria-label="卡池选择">
        {POOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="gacha-panel__pool"
            data-active={pool === item.id || undefined}
            aria-pressed={pool === item.id}
            disabled={loading}
            onClick={() => selectPool(item.id)}
          >
            <span
              className="gacha-panel__pool-dot"
              style={{ background: item.color }}
              aria-hidden
            />
            <span className="gacha-panel__pool-text">
              <b className="gacha-panel__pool-name">{item.name}</b>
              <small className="gacha-panel__pool-note">{item.note}</small>
            </span>
            <em className="gacha-panel__pool-count">×{currentPacks?.[item.id] ?? 0}</em>
          </button>
        ))}
      </div>

      {!userId && (
        <div className="gacha-panel__login">
          <div>
            <b className="gacha-panel__login-title">登录后开包</b>
            <p className="gacha-panel__login-note">
              抽到的卡和保底进度会直接写入你的账号。
            </p>
          </div>
          <a className="gacha-panel__login-link" href="/auth/osu">
            用 osu! 登录
          </a>
        </div>
      )}

      <div className="gacha-panel__bar">
        <div className="gacha-panel__current">
          <span className="gacha-panel__label">CURRENT POOL</span>
          <b className="gacha-panel__current-name">{current.name}</b>
        </div>

        <div className="gacha-panel__pity">
          <div className="gacha-panel__pity-top">
            <span className="gacha-panel__label">保底进度</span>
            <b className="gacha-panel__pity-value">
              {pity ? `${pity.after} / 60` : "— / 60"}
            </b>
          </div>
          <div
            className="gacha-panel__pity-track"
            role="progressbar"
            aria-label="保底进度"
            aria-valuemin={0}
            aria-valuemax={60}
            aria-valuenow={pity?.after ?? 0}
          >
            <span
              className="gacha-panel__pity-fill"
              style={{ width: `${pityPercent}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          className="gacha-panel__open"
          disabled={loading || !userId || packCount <= 0}
          onClick={openPack}
        >
          {loading ? "开启中…" : packCount > 0 ? "开 5 张" : "没有卡包"}
        </button>

        {error && (
          <p className="gacha-panel__error" role="alert">
            {error}
          </p>
        )}
      </div>

      {cards.length > 0 && (
        <div className="gacha-panel__result-bar">
          <span>把卡面拖到左侧桌面，或</span>
          <button type="button" onClick={sendAllToDesk}>
            全部发到桌面
          </button>
        </div>
      )}

      <div
        className="gacha-panel__results"
        aria-busy={loading}
        aria-live="polite"
      >
        {loading
          ? emptySlots.map((index) => (
              <div
                className="gacha-panel__slot"
                data-loading
                key={`loading-${index}`}
              >
                <div className="gacha-panel__placeholder" aria-hidden>
                  <span className="gacha-panel__skeleton-line" />
                  <span className="gacha-panel__skeleton-line" />
                  <span className="gacha-panel__skeleton-line" />
                </div>
              </div>
            ))
          : cards.length > 0
            ? cards.map((card, index) => (
                <div
                  className="gacha-panel__slot is-draggable"
                  key={`${card.id}-${index}`}
                  draggable
                  onDragStart={(event) => {
                    setCardDrag(
                      event.nativeEvent,
                      toDeskCard(card, card.userCardId),
                    )
                  }}
                  onDragEnd={(event) => {
                    if (event.dataTransfer.dropEffect === "copy") {
                      setCards((current) =>
                        current.filter((item) => item.userCardId !== card.userCardId),
                      )
                    }
                  }}
                  title="拖到桌面"
                >
                  <CardFace card={card} />
                  <span className="gacha-panel__drag-hint">拖到桌面</span>
                </div>
              ))
            : emptySlots.map((index) => (
                <div
                  className="gacha-panel__slot"
                  data-empty
                  key={`empty-${index}`}
                >
                  <div className="gacha-panel__placeholder" aria-hidden>
                    <span className="gacha-panel__question">?</span>
                  </div>
                </div>
              ))}
      </div>

      {!loading && cards.length === 0 && !pity && (
        <p className="gacha-panel__prompt">选一个卡池开始</p>
      )}
    </div>
  )
}
