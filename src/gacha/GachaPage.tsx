import { useEffect, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { faceFromDef } from "@/card/def"
import type { CardFaceData, CardSkill, Job, Rarity } from "@/card/types"

import "./gacha.css"

const API = "/api"

const POOLS = [
  { id: "normal", name: "普通", note: "日常主力" },
  { id: "idle", name: "挂机", note: "无 L 以上" },
  { id: "golden", name: "黄金", note: "任务产出" },
  { id: "radiant", name: "璀璨", note: "周常" },
  { id: "sky", name: "天穹", note: "月常" },
  { id: "prism", name: "棱彩", note: "赛季" },
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
    version: 1,
  })
}

export function GachaPage() {
  const [pool, setPool] = useState("normal")
  const [cards, setCards] = useState<CardFaceData[]>([])
  const [pity, setPity] = useState<{ before: number; after: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; username: string } | null>(null)

  useEffect(() => {
    fetch("/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setUser(d.data)
      })
      .catch(() => {})
  }, [])

  async function openPack() {
    if (!user) {
      setError("请先用 osu! 登录")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/packs/${pool}/open`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, count: 5 }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message ?? "抽卡失败")

      const details: ApiCard[] = await Promise.all(
        data.data.results.map((item: { cardId: string }) =>
          fetch(`${API}/cards/${item.cardId}`)
            .then((r) => r.json())
            .then((d) => d.data as ApiCard),
        ),
      )

      setCards(details.map(toFace))
      setPity(data.data.pity)
    } catch (err) {
      setError(err instanceof Error ? err.message : "抽卡失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="gacha">
      <header className="gacha__head">
        <div>
          <div className="gacha__eyebrow">CHOKE! · GACHA</div>
          <h1>开包</h1>
          <p>服务端 RNG · 60 抽保底 L · 一次 5 张</p>
        </div>
        <div className="gacha__account">
          {user ? (
            <>
              <span>{user.username}</span>
              <button
                type="button"
                onClick={() =>
                  fetch("/auth/logout", { method: "POST", credentials: "include" }).then(() =>
                    setUser(null),
                  )
                }
              >
                退出
              </button>
            </>
          ) : (
            <a href="/auth/osu">用 osu! 登录</a>
          )}
        </div>
        <div className="gacha__pity">
          <span>保底进度</span>
          <b>{pity ? `${pity.after} / 60` : "—"}</b>
        </div>
      </header>

      <div className="gacha__pools">
        {POOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={pool === item.id || undefined}
            onClick={() => setPool(item.id)}
          >
            <b>{item.name}</b>
            <small>{item.note}</small>
          </button>
        ))}
      </div>

      <div className="gacha__actions">
        <button
          type="button"
          className="gacha__open"
          onClick={openPack}
          disabled={loading || !user}
        >
          {!user ? "先登录" : loading ? "开启中…" : "开启 5 张"}
        </button>
        {!user && <span className="gacha__error">请先用 osu! 登录后再开包</span>}
        {error && <span className="gacha__error">{error}</span>}
      </div>

      <div className="gacha__result">
        {cards.length === 0
          ? Array.from({ length: 5 }, (_, i) => (
              <div className="gacha__slot" data-empty key={i}>
                <span>?</span>
              </div>
            ))
          : cards.map((card, i) => (
              <div className="gacha__slot" key={`${card.id}-${i}`}>
                <CardFace card={card} />
              </div>
            ))}
      </div>
    </div>
  )
}
