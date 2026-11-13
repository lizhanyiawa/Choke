import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react"

import { CardFace } from "@/card/CardFace"
import { RARITY_LABEL } from "@/card/data"
import { expToNext, isHeroCardId, levelCap } from "@/card/progression"
import type { Rarity } from "@/card/types"

import { fetchUserCards, toFace, type ApiUserCard, type CardSort } from "./api"
import { Pages, useBook, usePageCache } from "./BookPages"
import { CardDetail } from "./CardDetail"
import { FitArea } from "./FitArea"
import { ALBUM_HOVER_EVENT, startCardPointerDrag, toDeskCard } from "./drag"
import { useDeskCardIds } from "./presence"
import { RARITY_COLOR } from "./rarity"
import "./album-panel.css"

/** 一个跨页：左页筛选下面两排，右页三排；放不下时卡按页高缩小，不出滚动条 */
const COLS = 4
const LEFT_SIZE = COLS * 2
const RIGHT_ROWS = 3
const PAGE_SIZE = LEFT_SIZE + COLS * RIGHT_ROWS
/** 和 album-panel.css 的 .album-sheet__grid gap 一致 */
const SHEET_GAP = 10

const RARITIES: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]

interface Result {
  rows: ApiUserCard[]
  total: number
  error: string | null
}

export const AlbumPanel = memo(function AlbumPanel({ userId }: { userId: string | null }) {
  const book = useBook()
  const [rarity, setRarity] = useState("")
  const [query, setQuery] = useState("")
  const [deferredQuery, setDeferredQuery] = useState("")
  const [sort, setSort] = useState<CardSort>("recent")
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<ApiUserCard | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const deskIds = useDeskCardIds()
  const openDetail = useCallback((row: ApiUserCard) => setDetail(row), [])

  useEffect(() => {
    const onHover = (event: Event) => {
      rootRef.current?.classList.toggle("is-drop-target", !!(event as CustomEvent<boolean>).detail)
    }
    window.addEventListener(ALBUM_HOVER_EVENT, onHover)
    return () => window.removeEventListener(ALBUM_HOVER_EVENT, onHover)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeferredQuery(query.trim())
      setPage(0)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [query])

  const key = userId ? `${userId}|${rarity}|${deferredQuery}|${sort}|${book.revision}` : ""
  const loadPage = useCallback(async (index: number, signal: AbortSignal): Promise<Result> => {
    try {
      const data = await fetchUserCards(userId!, {
        rarity: rarity || undefined,
        q: deferredQuery || undefined,
        sort,
        page: index,
        limit: PAGE_SIZE,
        signal,
      })
      return { rows: data.rows, total: data.total, error: null }
    } catch (error) {
      if (signal.aborted) throw error
      return { rows: [], total: 0, error: error instanceof Error ? error.message : "加载失败" }
    }
  }, [userId, rarity, deferredQuery, sort])
  const cachedPages = usePageCache(key, page, PAGE_SIZE, loadPage)
  const currentResult = cachedPages.find(([index]) => index === page)?.[1]
  if (currentResult && !currentResult.error) {
    const lastPage = Math.max(0, Math.ceil(currentResult.total / PAGE_SIZE) - 1)
    if (page > lastPage) setPage(lastPage)
  }

  const rootClass = "album-panel"

  if (!userId) {
    return (
      <Pages
        className={rootClass}
        left={
          <>
            <p className="bk-note">登录后查看卡册。</p>
            <a className="bk-btn bk-btn--main album-login" href="/auth/osu">
              用 osu! 登录
            </a>
          </>
        }
        right={<div className="bk-empty album-fill">还没有登录</div>}
      />
    )
  }

  const renderPage = (index: number, result: Result | null) => {
  const ready = result !== null
  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = !!(rarity || deferredQuery)
  const rows = result && !result.error ? result.rows : null
  const empty = ready && rows !== null && rows.length === 0

  const slot = (row: ApiUserCard) => (
    <AlbumSlot key={row.userCardId} row={row} onDesk={deskIds.has(row.userCardId)} onDetail={openDetail} />
  )

  /** 一页卡位：有卡放卡，剩下的补空位；items 为 null 时（加载中）全是空位 */
  const sheet = (items: ApiUserCard[] | null, size: number, label: string) => (
    <FitArea
      className="album-sheet"
      cols={COLS}
      rows={size / COLS}
      gapX={SHEET_GAP}
      gapY={SHEET_GAP}
      style={{ "--cols": COLS, "--rows": size / COLS } as CSSProperties}
    >
      <div
        className="album-sheet__grid"
        style={{ visibility: ready ? undefined : "hidden" }}
        aria-label={ready && items ? label : "加载中"}
        aria-busy={ready ? undefined : true}
      >
        {items?.map(slot)}
        {Array.from({ length: size - (items?.length ?? 0) }, (_, i) => (
          <div className="bk-slot" key={`empty-${i}`} aria-hidden />
        ))}
      </div>
      <div className="album-sheet__grid album-sheet__loading" style={{ visibility: ready ? "hidden" : undefined }} aria-hidden>
        {Array.from({ length: size }, (_, i) => <div className="bk-slot" key={i} />)}
      </div>
    </FitArea>
  )

  return (
    <Pages
      key={index}
      rootRef={index === page ? rootRef : undefined}
      preload={index !== page}
      className={rootClass}
      ready={ready}
      pager={
        totalPages > 1
          ? { page: Math.min(index + 1, totalPages), pages: totalPages, onPage: (next) => setPage(next - 1) }
          : undefined
      }
      left={
        <>
          <div className="album-head">
            <div className="bk-stat">
              <b>{ready ? total : "—"}</b>
              <span>{filtered ? "张符合筛选" : "张已收集"}</span>
            </div>
            <input
              className="bk-input album-head__search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索玩家名"
              aria-label="搜索玩家名"
            />
            <select
              className="bk-select"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as CardSort)
                setPage(0)
              }}
              aria-label="排序"
            >
              <option value="recent">最近获得</option>
              <option value="rarity">稀有度</option>
              <option value="pp">pp</option>
              <option value="name">名字</option>
            </select>
          </div>

          <div className="bk-chips" role="group" aria-label="稀有度筛选">
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
            {RARITIES.map((item) => (
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
              </button>
            ))}
          </div>

          {!empty && !(ready && result.error) && sheet(rows && rows.slice(0, LEFT_SIZE), LEFT_SIZE, "卡册左页")}
        </>
      }
      right={
        <>
          {ready && result.error ? (
            <div className="bk-empty bk-error album-fill">{result.error}</div>
          ) : empty ? (
            <div className="bk-empty album-fill">
              <span>{filtered ? "没有符合条件的卡" : "还没有卡"}</span>
              {!filtered && (
                <a className="bk-btn bk-btn--main" href="/?panel=packs">
                  去开包
                </a>
              )}
            </div>
          ) : (
            sheet(rows && rows.slice(LEFT_SIZE), PAGE_SIZE - LEFT_SIZE, "卡册右页")
          )}

          {book.active && index === page && detail && (
            <CardDetail
              key={detail.userCardId}
              card={detail}
              userId={userId}
              onClose={() => setDetail(null)}
              onChanged={book.invalidate}
            />
          )}
        </>
      }
    />
  )
  }
  return cachedPages.map(([index, result]) => renderPage(index, result))
})

const AlbumSlot = memo(function AlbumSlot({
  row,
  onDesk,
  onDetail,
}: {
  row: ApiUserCard
  onDesk: boolean
  onDetail: (row: ApiUserCard) => void
}) {
  const face = toFace(row)
  return (
    <div
      className={`album-slot ${onDesk ? "is-on-desk" : ""}`}
      data-user-card={row.userCardId}
      role="button"
      tabIndex={0}
      onPointerDown={(event) => startCardPointerDrag(event, {
        card: toDeskCard(face, row.userCardId),
        userCardId: row.userCardId,
      })}
      onClick={() => onDetail(row)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onDetail(row)
        }
      }}
    >
      <CardFace card={face} eager />
      <div className="album-slot__tags">
        {onDesk && <span className="bk-tag album-slot__on-desk">在桌面</span>}
        {row.level < levelCap(isHeroCardId(row.id)) && <ReadyBadge row={row} />}
      </div>
    </div>
  )
})

function ReadyBadge({ row }: { row: ApiUserCard }) {
  const need = expToNext(row.level, row.rarity, isHeroCardId(row.id))
  if (need <= 0 || row.exp < need) return null
  return <span className="bk-tag album-slot__ready">可升级</span>
}
