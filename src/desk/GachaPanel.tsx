import { useEffect, useState, type CSSProperties } from "react"

import { CardFace } from "@/card/CardFace"
import { faceFromDef } from "@/card/def"
import type { CardFaceData, CardSkill, Job, Rarity } from "@/card/types"

import { fetchPackInventory } from "./api"
import { Pages } from "./BookPages"
import { DESK_ADD_CARDS_EVENT, PACKS_CHANGED_EVENT, startCardPointerDrag, toDeskCard } from "./drag"
import { PackArt } from "./opening/PackArt"
import { POOL_META, RARITY_COLOR } from "./rarity"
import type { PackPool } from "./types"
import "./gacha-panel.css"

const API = "/api"

export type PoolId = "normal" | "idle" | "golden" | "radiant" | "sky" | "prism"

interface Pool {
  id: PoolId
  name: string
  note: string
  /** 卡包图和概率表用的桌面卡池（服务端的 golden 在桌面叫 quest） */
  art: PackPool
}

const POOLS: Pool[] = [
  { id: "normal", name: "普通", note: "日常主力", art: "normal" },
  { id: "idle", name: "挂机", note: "低成本", art: "idle" },
  { id: "golden", name: "黄金", note: "任务产出", art: "quest" },
  { id: "radiant", name: "璀璨", note: "周常奖励", art: "radiant" },
  { id: "sky", name: "天穹", note: "月常奖励", art: "sky" },
  { id: "prism", name: "棱彩", note: "赛季牌面", art: "prism" },
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
    results: { cardId: string; rarity: Rarity; fromPity: boolean; userCardId: number; foil: boolean }[]
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
  const odds = POOL_META[current.art].weights.filter(([, weight]) => weight > 0)
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
          return { ...toFace(detail.data), userCardId: item.userCardId, foil: item.foil }
        })
      )

      setCards(faces)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "开包失败")
    } finally {
      setLoading(false)
    }
  }

  const sendAllToDesk = () => {
    if (!cards.length) return
    const payload = cards.map((card) => toDeskCard(card, card.userCardId))
    window.dispatchEvent(new CustomEvent(DESK_ADD_CARDS_EVENT, { detail: payload }))
    setCards([])
  }

  const openButton = (
    <button
      type="button"
      className="bk-btn bk-btn--main bk-btn--block"
      disabled={loading || !userId || packCount <= 0}
      onClick={openPack}
    >
      {loading ? "开启中…" : packCount > 0 ? "开 5 张" : "没有卡包"}
    </button>
  )

  return (
    <Pages
      left={
        <>
          <div className="bk-list" role="group" aria-label="卡池选择">
            {POOLS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`bk-row gacha-pool ${pool === item.id ? "is-on" : ""}`}
                aria-pressed={pool === item.id}
                disabled={loading}
                onClick={() => selectPool(item.id)}
              >
                <span className="gacha-pool__art" aria-hidden>
                  <PackArt pool={item.art} />
                </span>
                <span className="gacha-pool__text">
                  <b>{item.name}</b>
                  <small>{item.note}</small>
                </span>
                <em className="bk-num">×{currentPacks?.[item.id] ?? 0}</em>
              </button>
            ))}
          </div>

          <div className="bk-box gacha-pity">
            <div className="gacha-pity__top">
              <span className="bk-label">保底进度</span>
              <b className="bk-num">{pity ? `${pity.after} / 60` : "— / 60"}</b>
            </div>
            <div
              className="bk-bar"
              style={{ "--p": pityPercent } as CSSProperties}
              role="progressbar"
              aria-label="保底进度"
              aria-valuemin={0}
              aria-valuemax={60}
              aria-valuenow={pity?.after ?? 0}
            >
              <i />
            </div>
            <p className="bk-note">60 抽未出 L 及以上时强制保底。</p>
          </div>
        </>
      }
      right={
        !userId ? (
          <div className="bk-empty">
            <b>登录后开包</b>
            <span>抽到的卡和保底进度会直接写入你的账号。</span>
            <a className="bk-btn bk-btn--main" href="/auth/osu">
              用 osu! 登录
            </a>
          </div>
        ) : loading || cards.length > 0 ? (
          <>
            <div className="bk-cards gacha-results" aria-busy={loading} aria-live="polite">
              {loading
                ? Array.from({ length: 5 }, (_, index) => (
                    <div className="bk-slot gacha-results__loading" key={index} aria-hidden>
                      …
                    </div>
                  ))
                : cards.map((card, index) => (
                    <div
                      className="gacha-results__card"
                      key={`${card.id}-${index}`}
                      onPointerDown={(event) => startCardPointerDrag(event, {
                        card: toDeskCard(card, card.userCardId),
                      }, {
                        onDrop: () => setCards((current) =>
                          current.filter((item) => item.userCardId !== card.userCardId),
                        ),
                      })}
                      title="拖到桌面"
                    >
                      <CardFace card={card} />
                    </div>
                  ))}
            </div>
            {error && (
              <p className="bk-note bk-error" role="alert">
                {error}
              </p>
            )}
            {cards.length > 0 && <p className="bk-note gacha-hint">把卡拖到桌面，或一次全部发过去。</p>}
            <div className="gacha-actions">
              <button
                type="button"
                className="bk-btn"
                disabled={cards.length === 0}
                onClick={sendAllToDesk}
              >
                全部发到桌面
              </button>
              {openButton}
            </div>
          </>
        ) : (
          <>
            <div className="gacha-current">
              <span className="gacha-current__art" aria-hidden>
                <PackArt pool={current.art} />
              </span>
              <div className="gacha-current__text">
                <span className="bk-label">{current.note}</span>
                <b className="gacha-current__name">{current.name}卡池</b>
                <p className="bk-note">一次开 5 张 · 库存 ×{packCount}</p>
              </div>
            </div>
            <div className="gacha-odds" aria-label="概率">
              {odds.map(([rarity, weight]) => (
                <span key={rarity} style={{ "--c": RARITY_COLOR[rarity] } as CSSProperties}>
                  <i aria-hidden />
                  {rarity}
                  <b className="bk-num">{weight}%</b>
                </span>
              ))}
            </div>
            {error && (
              <p className="bk-note bk-error" role="alert">
                {error}
              </p>
            )}
            {openButton}
          </>
        )
      }
    />
  )
}
