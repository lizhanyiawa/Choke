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
  const [essence, setEssence] = useState<number | null>(null)
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
      tasks.push(fetchMe(controller.signal).then((data) => setEssence(data.essence)))
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
      setEssence(result.essence)
      setMessage(`买到了 ${result.card.name} · 花费 ${result.price} 精华`)
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
    <div className="market-panel">
      <div className="market-head">
        <div>
          <span>MARKET · ESSENCE</span>
          <b>交易行</b>
        </div>
        <div className="market-wallet">
          <span>精华</span>
          <b>{essence ?? "—"}</b>
        </div>
      </div>

      <div className="market-note">
        用精华买卖卡。闪卡分解会得到 3 倍精华；上架入口在卡册的卡牌详情里。
        <button type="button" onClick={onOpenAlbum}>
          去卡册
        </button>
      </div>

      {message && <div className="market-message">{message}</div>}

      {userId && ownListings.length > 0 && (
        <section className="market-section">
          <div className="market-section__title">
            <span>MY LISTINGS</span>
            <b>我的上架 · {ownListings.length}</b>
          </div>
          <div className="market-own">
            {ownListings.map((listing) => (
              <div className="market-own__item" key={listing.id}>
                <div className="market-own__face">
                  <CardFace card={toFace(listing.card)} />
                </div>
                <div className="market-own__meta">
                  <b>{listing.card.name}</b>
                  <em>{listing.price.toLocaleString("en-US")} 精华</em>
                  <button
                    type="button"
                    onClick={() => void unlist(listing)}
                    disabled={busy !== null}
                  >
                    {busy === listing.id ? "下架中…" : "下架"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="market-section">
        <div className="market-section__title">
          <span>ACTIVE LISTINGS</span>
          <b>正在出售</b>
        </div>
        {loading ? (
          <div className="market-empty">加载市场…</div>
        ) : listings.length === 0 ? (
          <div className="market-empty">
            <p>还没有人上架。</p>
            <button type="button" onClick={onOpenAlbum}>
              去卡册选一张卡上架
            </button>
          </div>
        ) : (
          <div className="market-grid">
            {listings.map((listing) => {
              const mine = listing.sellerId === userId
              return (
                <article className={`market-card ${mine ? "is-mine" : ""}`} key={listing.id}>
                  <div className="market-card__face">
                    <CardFace card={toFace(listing.card)} />
                  </div>
                  <div className="market-card__body">
                    <b>{listing.card.name}</b>
                    <em>
                      {RARITY_LABEL[listing.card.rarity]}
                      {listing.card.foil ? " · ✦ 闪" : ""} · Lv.{listing.card.level}
                    </em>
                    <span className="market-card__seller">
                      {listing.sellerName}
                      {listing.sellerPublicId != null
                        ? ` #${String(listing.sellerPublicId).padStart(6, "0")}`
                        : ""}
                    </span>
                    <div className="market-card__buy">
                      <strong>{listing.price.toLocaleString("en-US")}</strong>
                      <span>精华</span>
                      {mine ? (
                        <button type="button" disabled>
                          自己的
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void buy(listing)}
                          disabled={busy !== null || !userId}
                        >
                          {busy === listing.id ? "购买中…" : "购买"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
