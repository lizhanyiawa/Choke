import { useEffect, useMemo, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { faceFromDef } from "@/card/def"
import { RARITY_LABEL } from "@/card/data"
import type { CardFaceData, CardSkill, Job, Rarity } from "@/card/types"

import { CardDetail } from "./CardDetail"
import type { ApiUserCard } from "./api"
import { RARITY_COLOR } from "./rarity"
import "./codex-panel.css"

const PAGE_SIZES = [12, 24, 48, 96] as const
const PAGE_SIZE_KEY = "choke-codex-page-size"
const RARITIES: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]
const SORTS = [
  { id: "rarity", label: "稀有度" },
  { id: "pp", label: "pp" },
  { id: "name", label: "名字" },
] as const
const OWNED_FILTERS = [
  { id: "all", label: "全部" },
  { id: "owned", label: "已收集" },
  { id: "unseen", label: "未见" },
] as const

type CodexSort = (typeof SORTS)[number]["id"]
type OwnedFilter = (typeof OWNED_FILTERS)[number]["id"]
type PageSize = (typeof PAGE_SIZES)[number]

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
  owned?: boolean
}

interface CardPage {
  rows: ApiCardDef[]
  total: number
  ownedTotal?: number
  limit: number
  offset: number
}

interface RarityStat {
  total: number
  owned: number
}

interface CodexStats {
  total: number
  owned: number
  byRarity: Record<string, RarityStat>
  countries: { code: string; total: number; owned: number }[]
}

interface Result {
  key: string
  rows: ApiCardDef[]
  total: number
  ownedTotal: number
  error: string | null
}

function readPageSize(): PageSize {
  const stored = Number(window.localStorage.getItem(PAGE_SIZE_KEY))
  return (PAGE_SIZES as readonly number[]).includes(stored) ? (stored as PageSize) : 24
}

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["zh-CN"], { type: "region" })
    : null

function countryLabel(code: string): string {
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

function percent(owned: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((owned / total) * 1000) / 10
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

export function CodexPanel({ userId }: { userId: string | null }) {
  const [rarity, setRarity] = useState("")
  const [query, setQuery] = useState("")
  const [deferredQuery, setDeferredQuery] = useState("")
  const [sort, setSort] = useState<CodexSort>("rarity")
  const [country, setCountry] = useState("")
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all")
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize)
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [stats, setStats] = useState<CodexStats | null>(null)
  const [detail, setDetail] = useState<ApiCardDef | null>(null)

  useEffect(() => {
    window.localStorage.setItem(PAGE_SIZE_KEY, String(pageSize))
  }, [pageSize])

  useEffect(() => {
    const controller = new AbortController()

    if (!userId) {
      Promise.all([
        fetch("/api/cards/stats", { credentials: "include", signal: controller.signal }).then(
          (response) => response.json(),
        ),
        fetch("/api/cards/countries", { credentials: "include", signal: controller.signal }).then(
          (response) => response.json(),
        ),
      ])
        .then(([statsData, countryData]) => {
          if (!statsData.ok || !countryData.ok) return
          const byRarity: Record<string, RarityStat> = {}
          for (const [key, value] of Object.entries(
            statsData.data.byRarity as Record<string, number>,
          )) {
            byRarity[key] = { total: Number(value), owned: 0 }
          }
          setStats({
            total: Number(statsData.data.total),
            owned: 0,
            byRarity,
            countries: (countryData.data as { code: string; total: number }[]).map((item) => ({
              code: item.code,
              total: Number(item.total),
              owned: 0,
            })),
          })
        })
        .catch(() => {})

      return () => controller.abort()
    }

    fetch(`/api/users/${userId}/codex/stats`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) setStats(data.data as CodexStats)
      })
      .catch(() => {})

    return () => controller.abort()
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeferredQuery(query.trim())
      setPage(0)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [query])

  const effectiveOwned = userId ? ownedFilter : "all"
  const key = `${userId ?? "guest"}|${rarity}|${deferredQuery}|${country}|${effectiveOwned}|${sort}|${pageSize}|${page}`

  useEffect(() => {
    const controller = new AbortController()
    const search = new URLSearchParams({
      sort,
      limit: String(pageSize),
      offset: String(page * pageSize),
    })
    if (rarity) search.set("rarity", rarity)
    if (deferredQuery) search.set("q", deferredQuery)
    if (country) search.set("country", country)

    const url = userId
      ? `/api/users/${userId}/codex?${new URLSearchParams({
          ...Object.fromEntries(search),
          owned: effectiveOwned,
        }).toString()}`
      : `/api/cards?${search.toString()}`

    fetch(url, { credentials: "include", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error?.message ?? "加载图鉴失败")
        const pageData = data.data as CardPage
        const rows = userId
          ? pageData.rows
          : pageData.rows.map((row) => ({ ...row, owned: false }))
        setResult({
          key,
          rows,
          total: pageData.total,
          ownedTotal: userId ? (pageData.ownedTotal ?? 0) : 0,
          error: null,
        })
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setResult({
          key,
          rows: [],
          total: 0,
          ownedTotal: 0,
          error: reason instanceof Error ? reason.message : "加载图鉴失败",
        })
      })
    return () => controller.abort()
  }, [key, userId, rarity, deferredQuery, country, effectiveOwned, sort, pageSize, page])

  const ready = result?.key === key
  const total = result?.total ?? 0
  const ownedTotal = result?.ownedTotal ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const poolBase = effectiveOwned === "unseen" ? total + ownedTotal : total
  const detailCard = useMemo(() => (detail ? toPseudoCard(detail) : null), [detail])

  const filterLabel = rarity ? RARITY_LABEL[rarity as Rarity] : "全部品质"

  return (
    <div className="codex-panel">
      <div className="codex-head">
        <div>
          <span>ALL CARDS · BESTIARY</span>
          <b>{stats ? stats.total.toLocaleString("en-US") : "—"} 张可查</b>
        </div>
        <div className="codex-ratio">
          <div className="codex-ratio__bar">
            <i
              style={{
                width: `${stats ? percent(stats.owned, stats.total) : 0}%`,
              }}
            />
          </div>
          <p>
            已收集 <b>{stats ? stats.owned.toLocaleString("en-US") : "—"}</b>
            <span> / {stats ? stats.total.toLocaleString("en-US") : "—"}</span>
            <em>{stats ? `${percent(stats.owned, stats.total)}%` : "—"}</em>
          </p>
        </div>
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
          <em>
            {stats
              ? `${stats.owned.toLocaleString("en-US")} / ${stats.total.toLocaleString("en-US")}`
              : "—"}
          </em>
        </button>
        {RARITIES.map((item) => {
          const tier = stats?.byRarity[item]
          return (
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
              <em>
                {tier
                  ? `${tier.owned.toLocaleString("en-US")} / ${tier.total.toLocaleString("en-US")}`
                  : "—"}
              </em>
            </button>
          )
        })}
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
          className="codex-toolbar__select codex-toolbar__country"
          value={country}
          onChange={(event) => {
            setCountry(event.target.value)
            setPage(0)
          }}
          aria-label="国家或地区"
        >
          <option value="">全部国家 / 地区</option>
          {stats?.countries.map((item) => (
            <option key={item.code} value={item.code}>
              {countryLabel(item.code)}（{item.code}） · {item.total.toLocaleString("en-US")}
            </option>
          ))}
        </select>
        <select
          className="codex-toolbar__select codex-toolbar__sort"
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
        <select
          className="codex-toolbar__select codex-toolbar__size"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value) as PageSize)
            setPage(0)
          }}
          aria-label="每页数量"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              每页 {size} 张
            </option>
          ))}
        </select>
      </div>

      {userId && (
        <div className="codex-owned" role="group" aria-label="收集筛选">
          {OWNED_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={ownedFilter === item.id ? "is-active" : ""}
              onClick={() => {
                setOwnedFilter(item.id)
                setPage(0)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="codex-count">
        <span>{filterLabel}</span>
        <b>{ready ? total.toLocaleString("en-US") : "—"}</b>
        <span>张</span>
        {userId && total > 0 && (
          <em className="codex-count__owned">
            {effectiveOwned === "owned"
              ? `已收集 ${ownedTotal.toLocaleString("en-US")} 张`
              : `已收集 ${ownedTotal.toLocaleString("en-US")} / ${poolBase.toLocaleString("en-US")} · ${percent(ownedTotal, poolBase)}%`}
          </em>
        )}
      </div>

      {!ready ? (
        <div className="codex-grid" aria-label="加载中">
          {Array.from({ length: Math.min(pageSize, 24) }, (_, i) => (
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
          {result.rows.map((row) =>
            row.owned ? (
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
            ) : (
              <div
                className="codex-slot codex-slot--unknown"
                key={row.id}
                aria-label="未收集的卡"
              >
                <span className="codex-unknown__mark">?</span>
              </div>
            ),
          )}
        </div>
      )}

      {ready && total > 0 && (
        <div className="codex-pager">
          <button type="button" onClick={() => setPage(0)} disabled={currentPage === 0}>
            «
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            ‹
          </button>
          <span>
            {currentPage + 1} / {totalPages.toLocaleString("en-US")}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setPage(totalPages - 1)}
            disabled={currentPage >= totalPages - 1}
          >
            »
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
