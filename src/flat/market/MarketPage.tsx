import { useCallback, useEffect, useRef, useState } from "react"

import { GameCardFace } from "@/card/GameCardFace"
import { JOB_LABEL, RARITY_LABEL } from "@/card/data"
import { RARITIES, type Rarity } from "@/card/types"
import {
  ApiError,
  buyMarketListing,
  fetchMarketHistory,
  fetchMarketPage,
  fetchOwnListings,
  toFace,
  unlistMarketCard,
  type MarketCardType,
  type MarketListing,
  type MarketSort,
  type OwnMarketListing,
} from "@/desk/session/api"
import { featureLockHint } from "@/tutorial/unlocks"

import { CardPager, CardSearch, useCardPageSize, useCardSearch } from "../cards/CardPages"
import { useFlat } from "../context"
import { Link } from "../Link"
import { refreshQuests } from "../quests/store"
import { FLAT_ROUTES, OWN_LISTINGS_PATH, useRouteSearch } from "../router"
import { FlatDialog } from "../ui/FlatDialog"
import { FlatSelect } from "../ui/FlatSelect"
import { RefetchWhenDue } from "../ui/time"
import { useResource } from "../ui/useResource"
import "./market.css"

const KINDS: readonly (readonly [MarketCardType | "", string])[] = [["", "全部类型"], ["pool", "公共卡"], ["mirror", "镜像卡"]]
const GRADES: readonly (readonly [Rarity | "", string])[] = [["", "全部品质"], ...RARITIES.map((rarity) => [rarity, RARITY_LABEL[rarity]] as const)]
const SORTS: readonly (readonly [MarketSort, string])[] = [["new", "最新上架"], ["asc", "价格从低到高"], ["desc", "价格从高到低"]]
const COINS = new Intl.NumberFormat("en-US")
const EXPIRY = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
const SELL_PATH = `${FLAT_ROUTES.album}?mode=list`

type Selection = { kind: "public"; listing: MarketListing } | { kind: "own"; listing: OwnMarketListing }
type TradeError = { text: string; gone: boolean }

export function MarketPage() {
  const { user, progress, notify, refreshUser } = useFlat()
  const view = new URLSearchParams(useRouteSearch()).get("view") === "own" ? "own" : "public"
  const lock = featureLockHint("market", progress)
  const [search, setSearch] = useState("")
  const [rarity, setRarity] = useState<Rarity | "">("")
  const [type, setType] = useState<MarketCardType | "">("")
  const [sort, setSort] = useState<MarketSort>("new")
  const [selected, setSelected] = useState<Selection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<TradeError | null>(null)
  const inFlight = useRef(false)
  const resultsRef = useRef<HTMLHeadingElement>(null)
  const limit = useCardPageSize(16, 8)
  const q = useCardSearch(search)
  const settling = search.trim() !== q
  const [paging, setPaging] = useState({ page: 0, limit })
  const page = paging.limit === limit ? paging.page : 0
  const loadPublic = useCallback((signal: AbortSignal) => fetchMarketPage({ q, rarity, type, sort, limit, offset: page * limit, signal }), [q, rarity, type, sort, limit, page])
  const loadOwn = useCallback((signal: AbortSignal) => fetchOwnListings(user.id, signal), [user.id])
  const listed = useResource(view === "public" && !settling ? loadPublic : null)
  const own = useResource(view === "own" ? loadOwn : null)
  const { reload: reloadPublic } = listed
  const { reload: reloadOwn } = own
  const current = view === "public" ? listed : own
  const visible = view === "public" ? listed.data?.rows : own.data
  const total = view === "public" ? listed.data?.total : own.data?.length
  const pageCount = Math.max(1, Math.ceil((listed.data?.total ?? 0) / limit))
  const nextExpiry = visible?.reduce((next, listing) => Math.min(next, Date.parse(listing.expiresAt)), Infinity) ?? Infinity
  const reloadCurrent = view === "public" ? reloadPublic : reloadOwn
  const resetPage = () => setPaging({ page: 0, limit })
  if (paging.limit !== limit) setPaging({ page: 0, limit })
  else if (listed.data && page >= pageCount) setPaging({ page: pageCount - 1, limit })

  // 「我的挂单」的查询也会处理到期退押金，钱包随后对账。
  useEffect(() => {
    if (own.data) refreshUser()
  }, [own.data, refreshUser])

  function inspect(selection: Selection) {
    setError(null)
    setSelected(selection)
  }

  async function transact(selection: Selection) {
    if (inFlight.current || error?.gone) return
    const { listing } = selection
    if (selection.kind === "public" && (lock || selection.listing.sellerId === user.id || user.coins < listing.price)) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    let changed = false
    try {
      let message: string
      if (selection.kind === "own") {
        const result = await unlistMarketCard(user.id, listing.id)
        message = `已下架 ${listing.card.name}，退回 ${COINS.format(result.depositRefunded)} 金币押金`
      } else {
        const result = await buyMarketListing(user.id, listing.id)
        message = `已购入 ${listing.card.name}，花费 ${COINS.format(result.price)} 金币`
        void refreshQuests()
      }
      changed = true
      setSelected(null)
      notify(message, "success")
    } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : undefined
      const gone = code === "not_found" || code === "listing_expired" || code === "card_moved"
      changed = gone || code === "network" || code === "timeout" || code === "bad_response"
      setError({ text: reason instanceof Error ? reason.message : "交易失败", gone })
    } finally {
      inFlight.current = false
      setBusy(false)
      if (changed) {
        reloadPublic()
        reloadOwn()
      }
      refreshUser()
    }
  }

  return (
    <div className="fl-page fl-market">
      <header className="fl-page__head">
        <h1 className="fl-page__title">市场</h1>
        <span className="fl-page__spacer" />
        {!lock && <Link to={SELL_PATH} className="bk-btn bk-btn--main">去卡册上架</Link>}
      </header>
      {lock && <p className="fl-market__locked" role="status">{lock}。当前仅可浏览。{" "}
        {!progress.linkedAccount && <a className="fl-link" href="/home?panel=account">去绑定</a>}
      </p>}
      <div className="bk-seg fl-market__views" role="group" aria-label="市场视图">
        <Link to={FLAT_ROUTES.market} aria-current={view === "public" ? "page" : undefined}>在售</Link>
        <Link to={OWN_LISTINGS_PATH} aria-current={view === "own" ? "page" : undefined}>我的挂单</Link>
      </div>
      {view === "public" && <div className="fl-market__filters">
        <CardSearch value={search} onChange={(next) => { if (next.trim() !== search.trim()) resetPage(); setSearch(next) }} />
        <FlatSelect label="卡牌类型" value={type} options={KINDS} onChange={(next) => { resetPage(); setType(next) }} />
        <FlatSelect label="品质" value={rarity} options={GRADES} onChange={(next) => { resetPage(); setRarity(next) }} />
        <FlatSelect label="排序" value={sort} options={SORTS} onChange={(next) => { resetPage(); setSort(next) }} />
      </div>}
      <section className="fl-market__results" aria-labelledby="market-results" aria-busy={!current.data && !current.error}>
        <h2 id="market-results" ref={resultsRef} tabIndex={-1}>
          {view === "public" ? "在售挂单" : "我的挂单"}{total !== undefined && ` · ${COINS.format(total)} 条`}
        </h2>
        {current.error ? (
          <p className="bk-empty" role="alert">{current.error} <button type="button" className="bk-btn bk-btn--ghost" onClick={reloadCurrent}>重试</button></p>
        ) : !visible ? <p className="bk-empty" role="status">正在加载挂单…</p> : !visible.length ? (
          <p className="bk-empty" role="status">{view === "own" ? "你还没有在售挂单。" : q || rarity || type ? "没有符合条件的挂单。" : "暂时没有在售挂单。"}</p>
        ) : view === "public" && listed.data ? (
          <div className="fl-market__grid">
            {listed.data.rows.map((listing) => (
              <ListingTile key={listing.id} listing={listing} mine={listing.sellerId === user.id} onOpen={() => inspect({ kind: "public", listing })} />
            ))}
          </div>
        ) : own.data && (
          <div className="fl-market__grid">
            {own.data.map((listing) => (
              <ListingTile key={listing.id} listing={listing} mine onOpen={() => inspect({ kind: "own", listing })} />
            ))}
          </div>
        )}
        {view === "public" && !!total && <CardPager page={page} pageCount={pageCount} onChange={(index) => {
          resultsRef.current?.focus()
          setPaging({ page: index, limit })
        }} />}
        <RefetchWhenDue dueAt={Number.isFinite(nextExpiry) ? nextExpiry : Infinity} refetch={reloadCurrent} />
      </section>
      {selected && <ListingDialog selection={selected} busy={busy} lock={lock} error={error} onClose={() => setSelected(null)} onConfirm={() => void transact(selected)} />}
    </div>
  )
}

function ListingTile({ listing, mine, onOpen }: { listing: MarketListing | OwnMarketListing; mine: boolean; onOpen: () => void }) {
  const { card } = listing
  const kind = card.id.startsWith("mirror-") ? "镜像卡" : "公共卡"
  return (
    <button type="button" className="fl-library-tile fl-market__tile" aria-haspopup="dialog" aria-label={`${card.name}，${kind}，${COINS.format(listing.price)} 金币，查看挂单`} onClick={onOpen}>
      <GameCardFace card={toFace(card)} />
      <span className="fl-market__tile-info">
        <strong title={card.name}>{card.name}</strong>
        <span className="fl-market__price"><b>{COINS.format(listing.price)}</b> 金币</span>
        <small>{kind}{mine && " · 我的挂单"}</small>
      </span>
    </button>
  )
}

function ListingDialog({ selection, busy, lock, error, onClose, onConfirm }: {
  selection: Selection
  busy: boolean
  lock: string | null
  error: TradeError | null
  onClose: () => void
  onConfirm: () => void
}) {
  const { user } = useFlat()
  const { listing } = selection
  const { card, price } = listing
  const isMirror = card.id.startsWith("mirror-")
  const publicListing = selection.kind === "public" ? selection.listing : null
  const mine = publicListing?.sellerId === user.id
  const missing = price - user.coins
  const expiry = Date.parse(listing.expiresAt)
  const loadHistory = useCallback((signal: AbortSignal) => fetchMarketHistory(card.id, signal), [card.id])
  const history = useResource(loadHistory)
  const band = history.data?.priceBand

  return (
    <FlatDialog title={card.name} busy={busy} onClose={onClose}>
      <div className="fl-market-trade">
        <div className="fl-market-trade__face"><GameCardFace card={toFace(card)} /></div>
        <div className="fl-market-trade__info">
          <p className="bk-note">{isMirror ? "镜像卡" : "公共卡"} · {RARITY_LABEL[card.rarity]} · {JOB_LABEL[card.job]} · Lv.{card.level}{card.foil && " · 闪卡"}</p>
          <p className="fl-market__price"><b>{COINS.format(price)}</b> 金币</p>
          {publicListing && <p className="bk-note">卖家：{publicListing.sellerName}{publicListing.sellerPublicId !== null && ` #${String(publicListing.sellerPublicId).padStart(6, "0")}`}</p>}
          {Number.isFinite(expiry) && <p className="bk-note">到期时间：<time dateTime={listing.expiresAt}>{EXPIRY.format(expiry)}</time></p>}
          {isMirror && <p className="bk-note">镜像可作为本体卡的共鸣材料，与同名公共卡分开定价。</p>}
        </div>
      </div>
      <section className="fl-market-history" aria-label="成交参考">
        {history.error ? <p className="bk-note" role="alert">参考价读取失败 <button type="button" className="bk-btn bk-btn--ghost" onClick={history.reload}>重试</button></p>
          : !history.data ? <p className="bk-note" role="status">正在读取成交参考…</p>
          : band ? <>
            <p>参考均价 <b>{COINS.format(band.avgPrice)}</b> 金币 <span className="bk-note">（{band.sampleCount} 笔）</span></p>
            <p className="bk-note">上架价格带：{COINS.format(band.minPrice)}–{COINS.format(band.maxPrice)} 金币</p>
            <details>
              <summary>成交记录</summary>
              <ul>{history.data.sales.map((sale) => <li key={sale.id}>{COINS.format(sale.price)} 金币</li>)}</ul>
            </details>
          </> : <p className="bk-note">这张卡暂无成交记录。</p>}
      </section>
      {error && <p className="bk-error" role="alert">{error.text}</p>}
      {selection.kind === "own" ? <p className="bk-note">下架将退回 {COINS.format(selection.listing.deposit)} 金币押金，上架税不退。</p>
        : mine ? <p className="bk-note">这是你的挂单。</p>
          : lock ? <p className="bk-note">{lock}</p>
            : missing > 0 ? <p className="bk-error">还差 {COINS.format(missing)} 金币。</p>
              : <p className="bk-note">购买后余额 {COINS.format(user.coins - price)} 金币，卡牌收入你的卡册。</p>}
      <div className="fl-market-trade__actions">
        <button type="button" className="bk-btn" disabled={busy} onClick={onClose}>关闭</button>
        {!error?.gone && (selection.kind === "own" ? (
          <button type="button" className="bk-btn bk-btn--danger" disabled={busy} onClick={onConfirm}>{busy ? "下架中…" : "确认下架"}</button>
        ) : mine ? (
          <Link className="bk-btn" to={OWN_LISTINGS_PATH} onClick={onClose}>管理挂单</Link>
        ) : !lock && (
          <button type="button" className="bk-btn bk-btn--main" disabled={busy || missing > 0} onClick={onConfirm}>
            {busy ? "购买中…" : `花 ${COINS.format(price)} 金币购买`}
          </button>
        ))}
      </div>
    </FlatDialog>
  )
}
