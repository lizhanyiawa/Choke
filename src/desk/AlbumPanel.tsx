import { useEffect, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { faceFromDef } from "@/card/def"
import type { CardFaceData, CardSkill, Job, Rarity } from "@/card/types"

interface ApiUserCard {
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
  userCardId: number
  level: number
  constellation: number
}

function toFace(row: ApiUserCard): CardFaceData {
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
      version: 1,
    },
    { level: row.level, constellation: row.constellation },
  )
}

export function AlbumPanel({ userId }: { userId: string | null }) {
  const [result, setResult] = useState<{ userId: string; rows: ApiUserCard[]; error: string | null } | null>(
    null,
  )

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetch(`/api/users/${userId}/cards?limit=120`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setResult({
          userId,
          rows: d.ok ? (d.data.rows as ApiUserCard[]) : [],
          error: d.ok ? null : (d.error?.message ?? "加载失败"),
        })
      })
      .catch(() => {
        if (!cancelled) setResult({ userId, rows: [], error: "加载失败" })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!userId) {
    return (
      <div className="album-panel__empty">
        <p>登录后查看卡册</p>
        <a href="/auth/osu">用 osu! 登录</a>
      </div>
    )
  }

  if (!result || result.userId !== userId) return <div className="album-panel__empty">加载中…</div>
  if (result.error) return <div className="album-panel__empty">{result.error}</div>
  if (result.rows.length === 0) {
    return (
      <div className="album-panel__empty">
        <p>还没有卡</p>
        <a href="/gacha">去开包</a>
      </div>
    )
  }

  return (
    <div className="album-panel">
      <div className="album-panel__count">
        <span>已收集</span>
        <b>{result.rows.length}</b>
        <span>张</span>
      </div>
      <div className="album-panel__grid">
        {result.rows.map((row) => (
          <div className="album-panel__slot" key={row.userCardId}>
            <CardFace card={toFace(row)} />
          </div>
        ))}
      </div>
    </div>
  )
}
