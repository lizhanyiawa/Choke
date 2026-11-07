import { useEffect, useState } from "react"

import { CardFace } from "@/card/CardFace"
import type { Rarity } from "@/card/types"

import { fetchUserCards, toFace, type ApiUserCard, type CardSort } from "./api"
import { CardDetail } from "./CardDetail"
import { RARITY_COLOR } from "./rarity"

const PAGE_SIZE = 16

const RARITIES: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]

interface Result {
  key: string
  rows: ApiUserCard[]
  total: number
  error: string | null
}

export function AlbumPanel({ userId }: { userId: string | null }) {
  const [rarity, setRarity] = useState("")
  const [query, setQuery] = useState("")
  const [deferredQuery, setDeferredQuery] = useState("")
  const [sort, setSort] = useState<CardSort>("recent")
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [detail, setDetail] = useState<ApiUserCard | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeferredQuery(query.trim())
      setPage(0)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [query])

  const key = userId ? `${userId}|${rarity}|${deferredQuery}|${sort}|${page}|${refresh}` : ""

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    fetchUserCards(userId, {
      rarity: rarity || undefined,
      q: deferredQuery || undefined,
      sort,
      page,
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
      .then((data) => {
        setResult({ key, rows: data.rows, total: data.total, error: null })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setResult({ key, rows: [], total: 0, error: error instanceof Error ? error.message : "加载失败" })
      })
    return () => controller.abort()
  }, [userId, rarity, deferredQuery, sort, page, key])

  if (!userId) {
    return (
      <div className="album-panel__empty">
        <p>登录后查看卡册</p>
        <a href="/auth/osu">用 osu! 登录</a>
      </div>
    )
  }

  const ready = result?.key === key
  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="album-panel">
      <div className="album-toolbar">
        <input
          className="album-toolbar__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索玩家名"
          aria-label="搜索玩家名"
        />
        <select
          className="album-toolbar__sort"
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

      <div className="album-filters" role="group" aria-label="稀有度筛选">
        <button
          type="button"
          className={`album-filter ${rarity === "" ? "is-active" : ""}`}
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
            className={`album-filter ${rarity === item ? "is-active" : ""}`}
            onClick={() => {
              setRarity(item)
              setPage(0)
            }}
          >
            <i style={{ background: RARITY_COLOR[item] }} aria-hidden />
            {item}
          </button>
        ))}
      </div>

      <div className="album-panel__count">
        <span>已收集</span>
        <b>{ready ? total : "—"}</b>
        <span>张{rarity || deferredQuery ? "（筛选后）" : ""}</span>
      </div>

      {!ready ? (
        <div className="album-panel__grid" aria-label="加载中">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="album-panel__skeleton" key={i} />
          ))}
        </div>
      ) : result.error ? (
        <div className="album-panel__empty">{result.error}</div>
      ) : result.rows.length === 0 ? (
        <div className="album-panel__empty">
          <p>{rarity || deferredQuery ? "没有符合条件的卡" : "还没有卡"}</p>
          {!rarity && !deferredQuery && <a href="/gacha">去开包</a>}
        </div>
      ) : (
        <div className="album-panel__grid">
          {result.rows.map((row) => (
            <div
              className="album-panel__slot"
              key={row.userCardId}
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
        <div className="album-pager">
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

      {detail && (
        <CardDetail
          key={detail.userCardId}
          card={detail}
          userId={userId}
          onClose={() => setDetail(null)}
          onChanged={() => setRefresh((value) => value + 1)}
        />
      )}
    </div>
  )
}
