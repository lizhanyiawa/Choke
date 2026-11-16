import { useEffect, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { RARITY_LABEL } from "@/card/data"
import type { Rarity } from "@/card/types"

import {
  buyMarketListing,
  fetchMarketPage,
  fetchMe,
  fetchOwnListings,
  toFace,
  unlistMarketCard,
  type MarketListing,
  type MarketSort,
  type OwnMarketListing,
} from "./api"
import { Pages, useBook } from "./BookPages"
import "./market-panel.css"

const PAGE_SIZE = 9
const RARITIES = Object.keys(RARITY_LABEL) as Rarity[]

export function MarketPanel({
  userId,
  onOpenAlbum,
}: {
  userId: string | null
  onOpenAlbum: () => void
}) {
  const book = useBook()
  const [query, setQuery] = useState("")
  const [rarity, setRarity] = useState<Rarity | "">("")
  const [sort, setSort] = useState<MarketSort>("recent")
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<{ key: string; rows: MarketListing[]; total: number; error?: string } | null>(null)
  const [account, setAccount] = useState<{ id: string; coins: number; own: OwnMarketListing[] } | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const search = query.trim()
  const key = JSON.stringify([search, rarity, sort, page, refresh])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetchMarketPage({ query: search, rarity, sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE }, controller.signal)
        .then(({ rows, total }) => {
          if (controller.signal.aborted) return
          const last = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
          if (page > last) setPage(last)
          else setResult({ key, rows, total })
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setResult({ key, rows: [], total: 0, error: reason instanceof Error ? reason.message : "加载市场失败" })
          }
        })
    }, search ? 160 : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [key, page, rarity, search, sort])

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    Promise.all([fetchMe(controller.signal), fetchOwnListings(userId, controller.signal)])
      .then(([{ coins }, own]) => {
        if (!controller.signal.aborted) setAccount({ id: userId, coins, own })
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setMessage(reason instanceof Error ? reason.message : "加载挂单失败")
      })
    return () => controller.abort()
  }, [userId, refresh])

  const buy = async (listing: MarketListing) => {
    if (!userId || busy !== null) return
    setBusy(listing.id)
    setMessage(null)
    try {
      const result = await buyMarketListing(userId, listing.id)
      book.invalidate()
      setAccount((current) => current?.id === userId ? { ...current, coins: result.coins } : current)
      setMessage(`买到了 ${result.card.name} · 花费 ${result.price} 金币`)
      setRefresh((value) => value + 1)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "购买失败")
    } finally {
      setBusy(null)
    }
  }

  const unlist = async (listing: OwnMarketListing) => {
    if (!userId || busy !== null) return
    setBusy(listing.id)
    setMessage(null)
    try {
      await unlistMarketCard(userId, listing.id)
      book.invalidate()
      setMessage(`${listing.card.name} 已下架`)
      setRefresh((value) => value + 1)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "下架失败")
    } finally {
      setBusy(null)
    }
  }

  const current = result?.key === key ? result : null
  const listings = current?.rows ?? []
  const pages = Math.max(1, Math.ceil((current?.total ?? result?.total ?? 0) / PAGE_SIZE))
  const wallet = account?.id === userId ? account : null
  const coins = wallet?.coins
  const ownListings = wallet?.own ?? []

  return (
    <Pages
      className="market-panel"
      ready={!!current}
      pager={pages > 1 ? { page: page + 1, pages, onPage: (next) => setPage(next - 1) } : undefined}
      left={
        <>
          <div className="bk-box market-wallet">
            <div className="bk-stat">
              <b>{coins == null ? "—" : coins.toLocaleString("en-US")}</b>
              <span>我的金币</span>
            </div>
            <button type="button" className="bk-btn bk-btn--main" onClick={onOpenAlbum}>
              去卡册上架
            </button>
          </div>

          {message && <div className="bk-box market-message" role="status">{message}</div>}

          {userId && (
            <>
              <hr className="bk-divider" />
              <span className="bk-label">我的上架 · {ownListings.length}</span>
              {ownListings.length === 0 ? (
                <div className="bk-empty">你还没有上架的卡</div>
              ) : (
                <div className="bk-list">
                  {ownListings.map((listing) => (
                    <div className="bk-row" key={listing.id}>
                      <div className="market-own__face">
                        <CardFace card={toFace(listing.card)} />
                      </div>
                      <div className="market-own__text">
                        <b>{listing.card.name}</b>
                        <span className="bk-num">{listing.price.toLocaleString("en-US")} 金币</span>
                      </div>
                      <button
                        type="button"
                        className="bk-btn bk-btn--sm bk-btn--danger"
                        onClick={() => void unlist(listing)}
                        disabled={busy !== null}
                      >
                        {busy === listing.id ? "下架中…" : "下架"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      }
      right={
        <>
          <div className="market-filters">
            <input className="bk-input" placeholder="搜索玩家名" aria-label="搜索玩家名" value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
            <select className="bk-select" aria-label="稀有度筛选" value={rarity}
              onChange={(event) => { setRarity(event.target.value as Rarity | ""); setPage(0) }}>
              <option value="">全部稀有度</option>
              {RARITIES.map((tier) => <option key={tier} value={tier}>{RARITY_LABEL[tier]}</option>)}
            </select>
            <select className="bk-select" aria-label="排序" value={sort}
              onChange={(event) => { setSort(event.target.value as MarketSort); setPage(0) }}>
              <option value="recent">最近上架</option>
              <option value="price-asc">价格升序</option>
              <option value="price-desc">价格降序</option>
            </select>
          </div>
          {!current ? (
            <div className="bk-empty">加载市场…</div>
          ) : current.error ? (
            <div className="bk-empty bk-error" role="alert">{current.error}</div>
          ) : listings.length === 0 ? (
            <div className="bk-empty">{search || rarity ? "没有符合条件的挂单" : "暂无在售卡牌"}</div>
          ) : (
            <div className="market-grid">
              {listings.map((listing) => {
                const mine = listing.sellerId === userId
                return (
                  <article className="market-card" key={listing.id}>
                    <div className="market-card__face">
                      <CardFace card={toFace(listing.card)} />
                    </div>
                    <b className="market-card__name">{listing.card.name}</b>
                    <span className="market-card__meta">
                      {RARITY_LABEL[listing.card.rarity]}
                      {listing.card.foil ? " · ✦ 闪" : ""} · Lv.{listing.card.level}
                    </span>
                    <span className="market-card__meta">
                      {listing.sellerName}
                      {listing.sellerPublicId != null
                        ? ` #${String(listing.sellerPublicId).padStart(6, "0")}`
                        : ""}
                    </span>
                    <div className="market-card__price">
                      <b className="bk-num">{listing.price.toLocaleString("en-US")}</b>
                      <span>金币</span>
                    </div>
                    {mine ? (
                      <button type="button" className="bk-btn bk-btn--sm bk-btn--block" disabled>
                        自己的
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="bk-btn bk-btn--sm bk-btn--block"
                        onClick={() => void buy(listing)}
                        disabled={busy !== null || !userId || (coins != null && coins < listing.price)}
                      >
                        {busy === listing.id ? "购买中…" : "购买"}
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </>
      }
    />
  )
}
