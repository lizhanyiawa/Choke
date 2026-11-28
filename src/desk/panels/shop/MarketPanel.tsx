import { useEffect, useMemo, useState } from "react"

import { playSfx } from "@/audio/sfx"
import { GameCardFace } from "@/card/GameCardFace"
import { RARITY_LABEL } from "@/card/data"
import { RARITIES, type Rarity } from "@/card/types"

import {
  ApiError,
  buyMarketListing,
  fetchMarketListings,
  fetchMe,
  fetchOwnListings,
  toFace,
  unlistMarketCard,
  type MarketListing,
  type OwnMarketListing,
} from "@/desk/session/api"
import { Pages, useBook } from "@/desk/shell/BookPages"
import { ConfirmBar } from "@/desk/shell/ConfirmBar"
import { emitDeskData } from "@/desk/session/events"
import { FLAT_ROUTES } from "@/flat/router"
import { useTutorialProgress } from "@/tutorial/store"
import { isModuleUnlocked, lockHintOf } from "@/tutorial/unlocks"
import "@/desk/panels/shop/market-panel.css"

/** 接口一次返回全部在售（服务端上限内），分页只在前端：每次多显示一批 */
const PAGE_SIZE = 24

type MarketSort = "new" | "asc" | "desc"
type MarketKindFilter = "all" | "normal" | "mirror"

const isMirrorCard = (card: { id: string; cardType?: string }) =>
  card.cardType === "mirror" || card.id.startsWith("mirror-")

interface Notice {
  text: string
  error?: boolean
}

export function MarketPanel({ userId }: { userId: string | null }) {
  const book = useBook()
  const [listings, setListings] = useState<MarketListing[]>([])
  const [own, setOwn] = useState<OwnMarketListing[]>([])
  const [coins, setCoins] = useState<number | null>(null)
  const progress = useTutorialProgress(userId)
  /** 能看不能买：游客、邮箱号（没绑 osu!）、没完成引导的账号；规则在 content/unlocks.json，服务端同一份 */
  const tradeLocked = userId != null && !isModuleUnlocked("market", progress)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [pendingBuy, setPendingBuy] = useState<MarketListing | null>(null)
  const [sort, setSort] = useState<MarketSort>("new")
  const [rarity, setRarity] = useState<Rarity | "">("")
  const [kindFilter, setKindFilter] = useState<MarketKindFilter>("all")
  const [search, setSearch] = useState("")
  const [shown, setShown] = useState(PAGE_SIZE)

  const requestKey = `${userId ?? ""}|${refresh}`
  const loaded = loadedKey !== null
  const refreshing = loaded && loadedKey !== requestKey

  useEffect(() => {
    const controller = new AbortController()
    const tasks: Promise<unknown>[] = [
      fetchMarketListings(controller.signal).then((data) => setListings(data)),
    ]
    if (userId) {
      tasks.push(
        fetchMe(controller.signal)
          .then((data) => {
            setCoins(data.coins)
          })
          .catch(() => {}),
      )
      tasks.push(
        fetchOwnListings(userId, controller.signal).then((data) => setOwn(data)),
      )
    }
    Promise.all(tasks)
      .then(() => {
        if (!controller.signal.aborted) setLoadError(null)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(reason instanceof Error ? reason.message : "加载市场失败")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedKey(requestKey)
      })
    return () => controller.abort()
  }, [userId, refresh, requestKey])

  const reload = () => setRefresh((value) => value + 1)

  const buy = async (listing: MarketListing) => {
    if (!userId || busy !== null) return
    setPendingBuy(null)
    setBusy(listing.id)
    setNotice(null)
    try {
      const result = await buyMarketListing(userId, listing.id)
      playSfx("coin")
      book.invalidate()
      emitDeskData("packs")
      setCoins(result.coins)
      setNotice({ text: `买到了 ${result.card.name} · 花费 ${result.price} 金币` })
    } catch (reason) {
      playSfx("error")
      const code = reason instanceof ApiError ? reason.code : undefined
      if (code === "not_enough_coins") {
        fetchMe()
          .then((me) => setCoins(me.coins))
          .catch(() => {})
      }
      let text: string
      if (code === "feature_locked") {
        text = reason instanceof ApiError ? reason.message : "市场交易暂未解锁"
      } else if (code === "not_enough_coins") {
        text = "金币不足，已刷新列表"
      } else if (code === "not_found" || code === "already_sold" || code === "listing_not_active") {
        text = "该挂单已被买走或下架，已刷新列表"
      } else {
        text = `${reason instanceof Error ? reason.message : "购买失败"}，已刷新列表`
      }
      setNotice({ text, error: true })
    } finally {
      setBusy(null)
      reload()
    }
  }

  const unlist = async (listing: OwnMarketListing) => {
    if (!userId || busy !== null) return
    setBusy(listing.id)
    setNotice(null)
    try {
      await unlistMarketCard(userId, listing.id)
      playSfx("pick")
      setNotice({ text: `${listing.card.name} 已下架` })
    } catch (reason) {
      playSfx("error")
      const code = reason instanceof ApiError ? reason.code : undefined
      const text =
        code === "not_found" || code === "listing_not_active"
          ? "该挂单已不在架上，已刷新列表"
          : reason instanceof Error
            ? reason.message
            : "下架失败"
      setNotice({ text, error: true })
    } finally {
      setBusy(null)
      reload()
    }
  }

  const ownListings = userId ? own : []

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = listings.filter((listing) => {
      if (rarity && listing.card.rarity !== rarity) return false
      const mirror = isMirrorCard(listing.card)
      if (kindFilter === "mirror" && !mirror) return false
      if (kindFilter === "normal" && mirror) return false
      if (q && !listing.card.name.toLowerCase().includes(q)) return false
      return true
    })
    if (sort === "new") return [...filtered].sort((a, b) => b.id - a.id)
    const dir = sort === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => (a.price - b.price) * dir || b.id - a.id)
  }, [listings, rarity, kindFilter, search, sort])
  const page = visible.slice(0, shown)

  const canAfford = (listing: MarketListing) => coins == null || coins >= listing.price
  const pendingFace = pendingBuy?.card

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
            {userId && !tradeLocked && <a className="bk-btn bk-btn--main" href={`${FLAT_ROUTES.album}?mode=list`}>去卡册上架</a>}
          </div>

          <p className="bk-note">
            用金币买卖卡。要上架，请从「去卡册上架」选择卡牌。
            {!userId && " 登录后才能买卖。"}
          </p>

          {tradeLocked && (
            <div className="bk-box market-message">
              {lockHintOf("market", progress)}。现在只能浏览。
            </div>
          )}

          {pendingBuy && pendingFace && (
            <ConfirmBar
              confirmLabel={`花 ${pendingBuy.price.toLocaleString("en-US")} 金币买下`}
              confirmDisabled={!canAfford(pendingBuy)}
              onCancel={() => setPendingBuy(null)}
              onConfirm={() => void buy(pendingBuy)}
              message={
                <>
                  买下 {isMirrorCard(pendingFace) ? "【镜像】" : ""}
                  {pendingFace.name}（{RARITY_LABEL[pendingFace.rarity]}
                  {pendingFace.foil ? " · 闪" : ""} · Lv.{pendingFace.level}）？将花费{" "}
                  <b className="bk-num">{pendingBuy.price.toLocaleString("en-US")}</b> 金币
                  {coins != null && (
                    <>
                      ，余额 <span className="bk-num">{coins.toLocaleString("en-US")}</span> →{" "}
                      <span className="bk-num">
                        {(coins - pendingBuy.price).toLocaleString("en-US")}
                      </span>
                    </>
                  )}
                  。买下后不能退款。
                </>
              }
            />
          )}

          {notice && (
            <div
              className={`bk-box market-message ${notice.error ? "bk-error" : ""}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.text}
            </div>
          )}

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
                        <GameCardFace card={toFace(listing.card)} />
                      </div>
                      <div className="market-own__text">
                        <b>
                          {isMirrorCard(listing.card) ? "【镜像】" : ""}
                          {listing.card.name}
                        </b>
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
          <div className="market-toolbar">
            <span className="bk-label" aria-live="polite">
              正在出售
              {loaded &&
                ` · ${rarity || kindFilter !== "all" || search.trim() ? `${visible.length} / ${listings.length}` : listings.length}`}
              {refreshing && " · 刷新中…"}
            </span>
            <div className="market-toolbar__filters">
              <input
                className="bk-input"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setShown(PAGE_SIZE)
                }}
                placeholder="搜卡名…"
                aria-label="搜索市场卡牌名称"
              />
              <select
                className="bk-select"
                value={kindFilter}
                onChange={(event) => {
                  setKindFilter(event.target.value as MarketKindFilter)
                  setShown(PAGE_SIZE)
                }}
                aria-label="按类型筛选"
              >
                <option value="all">全部类型</option>
                <option value="normal">普通卡</option>
                <option value="mirror">只看镜像</option>
              </select>
              <select
                className="bk-select"
                value={rarity}
                onChange={(event) => {
                  setRarity(event.target.value as Rarity | "")
                  setShown(PAGE_SIZE)
                }}
                aria-label="按品质筛选"
              >
                <option value="">全部品质</option>
                {RARITIES.map((item) => (
                  <option key={item} value={item}>
                    {RARITY_LABEL[item]}
                  </option>
                ))}
              </select>
              <select
                className="bk-select"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as MarketSort)
                  setShown(PAGE_SIZE)
                }}
                aria-label="排序"
              >
                <option value="new">最新上架</option>
                <option value="asc">价格从低到高</option>
                <option value="desc">价格从高到低</option>
              </select>
            </div>
          </div>

          {loadError && (
            <div className="bk-box market-message bk-error market-retry" role="alert">
              <span>{loadError}</span>
              <button
                type="button"
                className="bk-btn bk-btn--sm"
                onClick={reload}
                disabled={refreshing || !loaded}
              >
                重试
              </button>
            </div>
          )}

          {!loaded ? (
            <div className="bk-empty" role="status">
              加载市场…
            </div>
          ) : listings.length === 0 ? (
            !loadError && (
              <div className="bk-empty">还没有人上架。去卡册选一张卡上架吧。</div>
            )
          ) : visible.length === 0 ? (
            <div className="bk-empty">没有符合筛选的卡</div>
          ) : (
            <>
              <div className="market-grid" aria-busy={refreshing}>
                {page.map((listing) => {
                  const mine = listing.sellerId === userId
                  const afford = canAfford(listing)
                  return (
                    <article className="market-card" key={listing.id}>
                      <div className="market-card__face">
                        <GameCardFace card={toFace(listing.card)} />
                      </div>
                      <b className="market-card__name">{listing.card.name}</b>
                      <span className="market-card__meta">
                        {isMirrorCard(listing.card) ? "镜像 · " : ""}
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
                          onClick={() => setPendingBuy(listing)}
                          disabled={busy !== null || refreshing || !userId || tradeLocked || !afford}
                          title={!afford ? `金币不足：${coins} / ${listing.price}` : undefined}
                        >
                          {busy === listing.id
                            ? "购买中…"
                            : tradeLocked
                              ? "未解锁交易"
                              : !afford
                                ? "金币不足"
                                : "购买"}
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
              {visible.length > page.length && (
                <button
                  type="button"
                  className="bk-btn bk-btn--ghost market-more"
                  onClick={() => setShown((value) => value + PAGE_SIZE)}
                >
                  显示更多（{page.length} / {visible.length}）
                </button>
              )}
            </>
          )}
        </>
      }
    />
  )
}
