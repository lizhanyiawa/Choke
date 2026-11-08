import { useEffect, useMemo, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { faceFromDef } from "@/card/def"
import { RARITY_LABEL } from "@/card/data"
import type { CardFaceData, CardSkill, Job, Rarity } from "@/card/types"

import { CardDetail } from "./CardDetail"
import type { ApiUserCard } from "./api"
import { RARITY_COLOR } from "./rarity"
import "./codex-panel.css"

const PAGE_SIZE = 24
const RARITIES: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]
const SORTS = [
  { id: "rarity", label: "稀有度" },
  { id: "pp", label: "pp" },
  { id: "name", label: "名字" },
] as const

type CodexSort = (typeof SORTS)[number]["id"]

interface ApiCardDef {
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

interface CardPage {
  rows: ApiCardDef[]
  total: number
  limit: number
  offset: number
}

interface Stats {
  total: number
  byRarity: Record<string, number>
}

interface Result {
  key: string
  rows: ApiCardDef[]
  total: number
  error: string | null
}

function toFace(row: ApiCardDef): CardFaceData {
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

function toPseudoCard(row: ApiCardDef): ApiUserCard {
  return {
    ...row,
    userCardId: 0,
    level: 1,
    constellation: 0,
    exp: 0,
  }
}

export function CodexPanel() {
  const [rarity, setRarity] = useState("")
  const [query, setQuery] = useState("")
  const [deferredQuery, setDeferredQuery] = useState("")
  const [sort, setSort] = useState<CodexSort>("rarity")
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [detail, setDetail] = useState<ApiCardDef | null>(null)

  useEffect(() => {
    fetch("/api/cards/stats", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) setStats(data.data as Stats)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeferredQuery(query.trim())
      setPage(0)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [query])

  const key = `${rarity}|${deferredQuery}|${sort}|${page}`

  useEffect(() => {
    const controller = new AbortController()
    const search = new URLSearchParams({
      sort,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    })
    if (rarity) search.set("rarity", rarity)
    if (deferredQuery) search.set("q", deferredQuery)

    fetch(`/api/cards?${search.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error?.message ?? "加载图鉴失败")
        const pageData = data.data as CardPage
        setResult({ key, rows: pageData.rows, total: pageData.total, error: null })
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setResult({
          key,
          rows: [],
          total: 0,
          error: reason instanceof Error ? reason.message : "加载图鉴失败",
        })
      })
    return () => controller.abort()
  }, [key, rarity, deferredQuery, sort, page])

  const ready = result?.key === key
  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const detailCard = useMemo(() => (detail ? toPseudoCard(detail) : null), [detail])

  return (
    <div className="codex-panel">
      <div className="codex-head">
        <div>
          <span>ALL CARDS · BESTIARY</span>
          <b>{stats ? stats.total.toLocaleString("en-US") : "—"} 张可查</b>
        </div>
        <p>全卡池按品质浏览；图鉴只读，实际养成的卡以卡册为准。</p>
      </div>

      <div className="codex-tiers" role="group" aria-label="品质筛选">
        <button
          type="button"
          className={`codex-tier ${rarity === "" ? "is-active" : ""}`}
          onClick={() => {
            setRarity("")
            setPage(0)
          }}
        >
          <span className="codex-tier__dot codex-tier__dot--all" aria-hidden />
          <b>全部</b>
          <em>{stats ? stats.total.toLocaleString("en-US") : "—"}</em>
        </button>
        {RARITIES.map((item) => (
          <button
            key={item}
            type="button"
            className={`codex-tier ${rarity === item ? "is-active" : ""}`}
            onClick={() => {
              setRarity(item)
              setPage(0)
            }}
          >
            <span
              className="codex-tier__dot"
              style={{ background: RARITY_COLOR[item] }}
              aria-hidden
            />
            <b>{item}</b>
            <em>{stats ? (stats.byRarity[item] ?? 0).toLocaleString("en-US") : "—"}</em>
          </button>
        ))}
      </div>

      <div className="codex-toolbar">
        <input
          className="codex-toolbar__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索玩家名"
          aria-label="搜索玩家名"
        />
        <select
          className="codex-toolbar__sort"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as CodexSort)
            setPage(0)
          }}
          aria-label="排序"
        >
          {SORTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="codex-count">
        <span>{rarity ? RARITY_LABEL[rarity as Rarity] : "全部品质"}</span>
        <b>{ready ? total.toLocaleString("en-US") : "—"}</b>
        <span>张</span>
      </div>

      {!ready ? (
        <div className="codex-grid" aria-label="加载中">
          {Array.from({ length: 12 }, (_, i) => (
            <div className="codex-skeleton" key={i} />
          ))}
        </div>
      ) : result.error ? (
        <div className="codex-empty">{result.error}</div>
      ) : result.rows.length === 0 ? (
        <div className="codex-empty">
          <p>没有符合条件的卡</p>
        </div>
      ) : (
        <div className="codex-grid">
          {result.rows.map((row) => (
            <div
              className="codex-slot"
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetail(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  setDetail(row)
                }
              }}
            >
              <CardFace card={toFace(row)} />
            </div>
          ))}
        </div>
      )}

      {ready && total > 0 && (
        <div className="codex-pager">
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            ‹
          </button>
          <span>
            {Math.min(page + 1, totalPages)} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            ›
          </button>
        </div>
      )}

      {detailCard && (
        <CardDetail
          key={`codex-${detailCard.id}`}
          card={detailCard}
          userId={null}
          readOnly
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
