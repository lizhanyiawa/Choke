import { useEffect, useMemo, useState, type CSSProperties } from "react"

import { CardFace } from "@/card/CardFace"
import { faceFromDef } from "@/card/def"
import { RARITY_LABEL } from "@/card/data"
import type { CardFaceData, CardSkill, Job, Rarity } from "@/card/types"

import { Pages } from "./BookPages"
import { CardDetail } from "./CardDetail"
import type { ApiUserCard } from "./api"
import { RARITY_COLOR } from "./rarity"
import "./codex-panel.css"

/** 一个跨页 = 一次请求：左页筛选下面 2 排，右页整页 3 排，每排 4 张 */
const COLS = 4
const LEFT_ROWS = 2
const RIGHT_ROWS = 3
const LEFT_COUNT = COLS * LEFT_ROWS
const PAGE_SIZE = COLS * (LEFT_ROWS + RIGHT_ROWS)
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
  const [page, setPage] = useState(0)
  const [dimUnseen, setDimUnseen] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [stats, setStats] = useState<CodexStats | null>(null)
  const [detail, setDetail] = useState<ApiCardDef | null>(null)

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
  const key = `${userId ?? "guest"}|${rarity}|${deferredQuery}|${country}|${effectiveOwned}|${sort}|${page}`

  useEffect(() => {
    const controller = new AbortController()
    const search = new URLSearchParams({
      sort,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
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
  }, [key, userId, rarity, deferredQuery, country, effectiveOwned, sort, page])

  const ready = result?.key === key
  const total = result?.total ?? 0
  const ownedTotal = result?.ownedTotal ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const poolBase = effectiveOwned === "unseen" ? total + ownedTotal : total
  const detailCard = useMemo(() => (detail ? toPseudoCard(detail) : null), [detail])

  const num = (value: number) => value.toLocaleString("en-US")
  const filterLabel = rarity ? RARITY_LABEL[rarity as Rarity] : "全部品质"
  const rows = ready && !result.error ? result.rows : []

  const renderGrid = (list: ApiCardDef[], gridRows: number, skeleton: number) => (
    <div className="codex-fit" style={{ "--rows": gridRows } as CSSProperties}>
      <div className="bk-cards" style={{ "--cols": COLS } as CSSProperties} aria-busy={!ready}>
        {!ready
          ? Array.from({ length: skeleton }, (_, i) => <div className="bk-slot" key={i} aria-hidden />)
          : list.map((row) =>
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
                  className={`bk-slot codex-unknown ${dimUnseen ? "is-dimmed" : ""}`}
                  key={row.id}
                  aria-label="未收集的卡"
                >
                  ?
                </div>
              ),
            )}
      </div>
    </div>
  )

  return (
    <Pages
      className="codex-panel"
      pager={{ page: currentPage + 1, pages: totalPages, onPage: (next) => setPage(next - 1) }}
      left={
        <>
          <div className="codex-filters">
            <div className="codex-progress">
              <div className="codex-progress__line">
                <span className="bk-label">{userId ? "收集进度" : "全部卡牌"}</span>
                <span className="bk-num">
                  {!stats
                    ? "—"
                    : userId
                      ? `${num(stats.owned)} / ${num(stats.total)} · ${percent(stats.owned, stats.total)}%`
                      : `${num(stats.total)} 张`}
                </span>
              </div>
              <div
                className="bk-bar"
                style={{ "--p": stats ? percent(stats.owned, stats.total) : 0 } as CSSProperties}
              >
                <i />
              </div>
            </div>

            <div className="bk-chips codex-rarity" role="group" aria-label="品质筛选">
              <button
                type="button"
                className="bk-chip"
                aria-pressed={rarity === ""}
                onClick={() => {
                  setRarity("")
                  setPage(0)
                }}
              >
                全部
              </button>
              {RARITIES.map((item) => {
                const tier = stats?.byRarity[item]
                return (
                  <button
                    key={item}
                    type="button"
                    className="bk-chip"
                    aria-pressed={rarity === item}
                    onClick={() => {
                      setRarity(item)
                      setPage(0)
                    }}
                  >
                    <i style={{ "--c": RARITY_COLOR[item] } as CSSProperties} aria-hidden />
                    {RARITY_LABEL[item]}
                    {tier && <small>{userId ? `${num(tier.owned)}/${num(tier.total)}` : num(tier.total)}</small>}
                  </button>
                )
              })}
            </div>

            <div className="codex-toolbar">
              <input
                className="bk-input codex-toolbar__search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索玩家名"
                aria-label="搜索玩家名"
              />
              <select
                className="bk-select codex-toolbar__country"
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
                    {countryLabel(item.code)}（{item.code}） · {num(item.total)}
                  </option>
                ))}
              </select>
              <select
                className="bk-select"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as CodexSort)
                  setPage(0)
                }}
                aria-label="排序"
              >
                {SORTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    按{item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="codex-toolbar">
              {userId && (
                <div className="bk-seg" role="group" aria-label="收集筛选">
                  {OWNED_FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={ownedFilter === item.id}
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
              <button
                type="button"
                className="bk-chip"
                aria-pressed={dimUnseen}
                onClick={() => setDimUnseen((value) => !value)}
                title="未见卡只保留问号，并进一步压暗"
              >
                暗化未见
              </button>
              <p className="bk-note codex-count">
                {filterLabel} <b className="bk-num">{ready ? num(total) : "—"}</b> 张
                {userId && ready && total > 0 && (
                  <>
                    {" · 已收集 "}
                    <span className="bk-num">
                      {effectiveOwned === "owned"
                        ? num(ownedTotal)
                        : `${num(ownedTotal)} / ${num(poolBase)} · ${percent(ownedTotal, poolBase)}%`}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {renderGrid(rows.slice(0, LEFT_COUNT), LEFT_ROWS, LEFT_COUNT)}

          {detailCard && (
            <CardDetail
              key={`codex-${detailCard.id}`}
              card={detailCard}
              userId={null}
              readOnly
              onClose={() => setDetail(null)}
            />
          )}
        </>
      }
      right={
        ready && result.error ? (
          <div className="bk-empty bk-error">{result.error}</div>
        ) : ready && rows.length === 0 ? (
          <div className="bk-empty">没有符合条件的卡</div>
        ) : (
          renderGrid(rows.slice(LEFT_COUNT), RIGHT_ROWS, PAGE_SIZE - LEFT_COUNT)
        )
      }
    />
  )
}
