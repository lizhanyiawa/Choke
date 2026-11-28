import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"

import { GameCardFace } from "@/card/GameCardFace"
import { RARITY_LABEL } from "@/card/data"
import { RARITIES, type Rarity } from "@/card/types"

import { Pages, useBook, usePageCache } from "@/desk/shell/BookPages"
import { CardDetail } from "@/desk/panels/cards/CardDetail"
import {
  defToFace,
  fetchCardCountries,
  fetchCardStats,
  fetchCodexPage,
  fetchUserCodexStats,
  type ApiCardDef,
  type ApiUserCard,
  type CodexStats,
} from "@/desk/session/api"
import { RARITY_COLOR } from "@/desk/lib/rarity"
import { FitArea } from "@/desk/shell/FitArea"
import "@/desk/panels/cards/codex-panel.css"

/** 一个跨页 = 一次请求：左页筛选下面 2 排，右页整页 3 排，每排 4 张 */
const COLS = 4
const LEFT_ROWS = 2
const RIGHT_ROWS = 3
const LEFT_COUNT = COLS * LEFT_ROWS
const PAGE_SIZE = COLS * (LEFT_ROWS + RIGHT_ROWS)
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

interface Result {
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

function toPseudoCard(row: ApiCardDef): ApiUserCard {
  return {
    ...row,
    skillRefs: [],
    userCardId: 0,
    level: 1,
    constellation: 0,
    exp: 0,
  }
}

export const CodexPanel = memo(function CodexPanel({ userId }: { userId: string | null }) {
  const book = useBook()
  const [rarity, setRarity] = useState("")
  const [query, setQuery] = useState("")
  const [deferredQuery, setDeferredQuery] = useState("")
  const [sort, setSort] = useState<CodexSort>("rarity")
  const [country, setCountry] = useState("")
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all")
  const [page, setPage] = useState(0)
  const [dimUnseen, setDimUnseen] = useState(true)
  const [stats, setStats] = useState<CodexStats | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [statsReload, setStatsReload] = useState(0)
  const [detail, setDetail] = useState<ApiCardDef | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const onDone = () => setStatsError(null)
    const onFail = (reason: unknown) => {
      if (controller.signal.aborted) return
      setStatsError(reason instanceof Error ? reason.message : "加载统计失败")
    }

    if (!userId) {
      Promise.all([fetchCardStats(), fetchCardCountries(controller.signal)])
        .then(([statsData, countryData]) => {
          const byRarity: CodexStats["byRarity"] = {}
          for (const [key, value] of Object.entries(statsData.byRarity)) {
            byRarity[key] = { total: Number(value), owned: 0 }
          }
          setStats({
            total: Number(statsData.total),
            owned: 0,
            byRarity,
            countries: countryData.map((item) => ({
              code: item.code,
              total: Number(item.total),
              owned: 0,
            })),
          })
          onDone()
        })
        .catch(onFail)

      return () => controller.abort()
    }

    fetchUserCodexStats(userId, controller.signal)
      .then((data) => {
        setStats(data)
        onDone()
      })
      .catch(onFail)

    return () => controller.abort()
  }, [userId, book.revision, statsReload])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeferredQuery(query.trim())
      setPage(0)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [query])

  const effectiveOwned = userId ? ownedFilter : "all"
  const key = `${userId ?? "guest"}|${rarity}|${deferredQuery}|${country}|${effectiveOwned}|${sort}|${book.revision}`
  const loadPage = useCallback(async (index: number, signal: AbortSignal): Promise<Result> => {
    try {
      const pageData = await fetchCodexPage({
        userId,
        rarity,
        q: deferredQuery,
        country,
        sort,
        owned: effectiveOwned,
        limit: PAGE_SIZE,
        offset: index * PAGE_SIZE,
        signal,
      })
      return {
        rows: userId ? pageData.rows : pageData.rows.map((row) => ({ ...row, owned: false })),
        total: pageData.total,
        ownedTotal: userId ? (pageData.ownedTotal ?? 0) : 0,
        error: null,
      }
    } catch (reason) {
      if (signal.aborted) throw reason
      return { rows: [], total: 0, ownedTotal: 0, error: reason instanceof Error ? reason.message : "加载图鉴失败" }
    }
  }, [userId, rarity, deferredQuery, country, effectiveOwned, sort])
  const cachedPages = usePageCache(key, page, PAGE_SIZE, loadPage)
  const detailCard = useMemo(() => (detail ? toPseudoCard(detail) : null), [detail])

  const renderPage = (index: number, result: Result | null) => {
  const ready = result !== null
  const total = result?.total ?? 0
  const ownedTotal = result?.ownedTotal ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(index, totalPages - 1)
  const poolBase = effectiveOwned === "unseen" ? total + ownedTotal : total

  const num = (value: number) => value.toLocaleString("en-US")
  const filterLabel = rarity ? RARITY_LABEL[rarity as Rarity] : "全部品质"
  const rows = result && !result.error ? result.rows : []

  const renderGrid = (list: ApiCardDef[], gridRows: number, skeleton: number) => (
    <FitArea className="codex-fit" cols={COLS} rows={gridRows} gapX={10} gapY={12} slack={2} style={{ "--rows": gridRows } as CSSProperties}>
      <div className="bk-cards" style={{ "--cols": COLS, visibility: ready ? undefined : "hidden" } as CSSProperties} aria-busy={!ready}>
        {list.map((row) => (
          <CodexSlot
            key={row.id}
            row={row}
            unseen={!row.owned}
            dimmed={Boolean(userId) && !row.owned && dimUnseen}
            onDetail={setDetail}
          />
        ))}
      </div>
      <div className="bk-cards codex-fit__loading" style={{ "--cols": COLS, visibility: ready ? "hidden" : undefined } as CSSProperties} aria-hidden>
        {Array.from({ length: skeleton }, (_, i) => <div className="bk-slot" key={i} />)}
      </div>
    </FitArea>
  )

  return (
    <Pages
      key={index}
      preload={index !== page}
      className="codex-panel"
      ready={ready}
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
              {statsError && (
                <div className="codex-stats-error" role="alert">
                  <span className="bk-error">统计加载失败：{statsError}</span>
                  <button
                    type="button"
                    className="bk-btn bk-btn--sm"
                    onClick={() => {
                      setStatsError(null)
                      setStatsReload((value) => value + 1)
                    }}
                  >
                    重试
                  </button>
                </div>
              )}
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
              {userId && (
                <button
                  type="button"
                  className="bk-chip"
                  aria-pressed={dimUnseen}
                  onClick={() => setDimUnseen((value) => !value)}
                  title="未收集的卡以半透明暗化显示"
                >
                  暗化未见
                </button>
              )}
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
  return (
    <>
      {cachedPages.map(([index, result]) => renderPage(index, result))}
      {book.active && detailCard && (
        <CardDetail
          key={`codex-${detailCard.id}`}
          card={detailCard}
          userId={userId}
          readOnly
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
})

const CodexSlot = memo(function CodexSlot({
  row,
  unseen,
  dimmed,
  onDetail,
}: {
  row: ApiCardDef
  unseen: boolean
  dimmed: boolean
  onDetail: (row: ApiCardDef) => void
}) {
  return (
    <div
      className={`codex-slot ${unseen ? "is-unseen" : ""} ${dimmed ? "is-dimmed" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${row.name}，${RARITY_LABEL[row.rarity]}${unseen ? "，未收集" : ""}，查看图鉴详情`}
      onClick={() => onDetail(row)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onDetail(row)
        }
      }}
    >
      <GameCardFace card={defToFace(row)} eager />
    </div>
  )
})
