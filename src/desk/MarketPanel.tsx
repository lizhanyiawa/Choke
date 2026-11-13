import { useEffect, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { RARITY_LABEL } from "@/card/data"

import {
  buyMarketListing,
  fetchMarketListings,
  fetchMe,
  fetchOwnListings,
  toFace,
  unlistMarketCard,
  type MarketListing,
  type OwnMarketListing,
} from "./api"
import { Pages } from "./BookPages"
import "./market-panel.css"

export function MarketPanel({
  userId,
  onOpenAlbum,
}: {
  userId: string | null
  onOpenAlbum: () => void
}) {
  const [listings, setListings] = useState<MarketListing[]>([])
  const [own, setOwn] = useState<OwnMarketListing[]>([])
  const [coins, setCoins] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const tasks: Promise<unknown>[] = [
      fetchMarketListings(controller.signal).then((data) => setListings(data)),
    ]
    if (userId) {
      tasks.push(fetchMe(controller.signal).then((data) => setCoins(data.coins)))
      tasks.push(
        fetchOwnListings(userId, controller.signal).then((data) => setOwn(data)),
      )
    }
    Promise.all(tasks)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setMessage(reason instanceof Error ? reason.message : "加载市场失败")
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [userId, refresh])

  const buy = async (listing: MarketListing) => {
    if (!userId || busy !== null) return
    setBusy(listing.id)
    setMessage(null)
    try {
      const result = await buyMarketListing(userId, listing.id)
      setCoins(result.coins)
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
      setMessage(`${listing.card.name} 已下架`)
      setRefresh((value) => value + 1)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "下架失败")
    } finally {
      setBusy(null)
    }
  }

  const ownListings = userId ? own : []

  return (
    <Pages
      className="market-panel"
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

          <p className="bk-note">
            用金币买卖卡。上架入口在卡册的卡牌详情里。精华只用于给卡镀闪，分解闪卡会得到 3 倍精华。
            {!userId && " 登录后才能买卖。"}
          </p>

          {message && <div className="bk-box market-message">{message}</div>}

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
          <span className="bk-label">正在出售{loading ? "" : ` · ${listings.length}`}</span>
          {loading ? (
            <div className="bk-empty">加载市场…</div>
          ) : listings.length === 0 ? (
            <div className="bk-empty">还没有人上架。去卡册选一张卡上架吧。</div>
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
                        disabled={busy !== null || !userId}
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
