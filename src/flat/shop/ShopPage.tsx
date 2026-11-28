import { Fragment, useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react"

import { RARITY_COLOR } from "@/desk/lib/rarity"
import {
  ApiError,
  buyShopItem,
  fetchMe,
  fetchShop,
  type ItemWallet,
  type ShopItemView,
  type ShopReward,
  type ShopSection,
} from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { StackChips, itemName, packName, stackText } from "@/flat/ui/Rewards"
import { RefetchWhenDue, formatLeft, useNow } from "@/flat/ui/time"
import { SHARD_ITEMS } from "@choke/shared/items"

import "./shop.css"

/** 货架的顺序和标题。接口里没有商品的那一段整段不显示 */
const SHELVES: readonly { id: ShopSection; title: string }[] = [
  { id: "supply", title: "日常补给" },
  { id: "gamble", title: "碎片博弈" },
  { id: "pity", title: "碎片保底" },
]

type Period = ShopItemView["period"]

/** 限购什么时候重置（北京时间，服务端定的） */
const RESET_RULE: Record<Period, string> = {
  daily: "每天 4:00 重置",
  weekly: "每周一 4:00 重置",
  monthly: "每月 1 日 4:00 重置",
}
/** 限购前面的那个词：今日 1/2、本周 2/10 */
const PERIOD_WORD: Record<Period, string> = { daily: "今日", weekly: "本周", monthly: "本月" }

/** 购买接口一次最多收 10 件 */
const MAX_PER_BUY = 10

/** 服务端回这几种错，说明页面上的货架、限购、金币或碎片已经和它对不上了 */
const STALE_CODES: readonly string[] = [
  "shop_limit_reached",
  "not_enough_coins",
  "not_enough_items",
  "unknown_shop_item",
]


const num = (value: number) => value.toLocaleString("en-US")

type ShopState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ShopItemView[]; wallet: ItemWallet }

const LOADING: ShopState = { status: "loading" }

interface Gain {
  /** 「L 碎片 ×2」 */
  text: string
  /** 这件商品第几次买成。连着两次开出一样的东西时文字不变，靠它让结果行重新出现一遍 */
  nth: number
}

/** 商店：三个货架，全部限购，买到的都是绑定的。不做解锁检查（对接清单 §9 的要求） */
export function ShopPage() {
  const { user, notify, refreshUser, refreshPacks } = useFlat()
  const userId = user.id
  const [shop, setShop] = useState<ShopState>(LOADING)
  /** 正在买的商品 id。同一时间只放一笔购买出去，期间全页的购买按钮都停用 */
  const [buyingId, setBuyingId] = useState<string | null>(null)
  /** 每件商品最近一次买到了什么；留到它下一次购买或离开页面 */
  const [gains, setGains] = useState<Partial<Record<string, Gain>>>({})

  /** 页面还在不在：购买的回包可能在人离开之后才到 */
  const alive = useRef(false)
  /** buyingId 要到下一次渲染才看得到新值；拦连点用当场生效的 ref */
  const purchasing = useRef(false)
  /** 还没回来的那次读取 */
  const inFlight = useRef<AbortController | null>(null)

  // 货架和物品钱包一起取。state 只在回包里改，所以 effect 里可以直接调
  const load = useCallback(() => {
    // 上一次还没回来就作废：晚到的旧数据不能盖住新的
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    Promise.all([fetchShop(userId, controller.signal), fetchMe(controller.signal)])
      .then(([{ items }, me]) => {
        if (controller.signal.aborted) return
        setShop({ status: "ready", items, wallet: me.items ?? {} })
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        const message = reason instanceof Error ? reason.message : "货架取不回来，请稍后再试"
        // 手上已经有货架时（到点重取、对账重取）取不回来就先留着旧的，不把整页换成报错
        setShop((current) => (current.status === "ready" ? current : { status: "error", message }))
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null
      })
  }, [userId])

  useEffect(() => {
    alive.current = true
    load()
    return () => {
      alive.current = false
      inFlight.current?.abort()
    }
  }, [load])

  // 最早到点的那一件。到了点，服务端的限购就重置了，页面上的「已买几次」也就过期了
  const items = shop.status === "ready" ? shop.items : []
  const nextReset = items.length > 0 ? Math.min(...items.map((item) => item.nextResetAt)) : null


  const buy = (item: ShopItemView, count: number) => {
    if (purchasing.current) return
    purchasing.current = true
    setBuyingId(item.id)
    buyShopItem(userId, item.id, count)
      .then(({ used, remaining, items: wallet, granted }) => {
        const text = [
          ...(granted.items.length > 0 ? [stackText(granted.items)] : []),
          ...granted.packs.map((pack) => `${packName(pack.pool)} ×${num(pack.count)}`),
        ].join("、")
        // 钱已经花了：就算人离开了这一页，提示和顶栏的数字也要跟上
        notify(`买到了：${text}`, "success")
        refreshUser()
        if (granted.packs.length > 0) refreshPacks()
        if (!alive.current) return
        // 回包里就是最新的限购和钱包，直接换上，不重新取货架
        setShop((current) =>
          current.status === "ready"
            ? {
                ...current,
                items: current.items.map((each) => (each.id === item.id ? { ...each, used, remaining } : each)),
                wallet,
              }
            : current,
        )
        setGains((current) => ({ ...current, [item.id]: { text, nth: (current[item.id]?.nth ?? 0) + 1 } }))
        // 这时要是还有一次读取没回来，它多半是在这笔购买入账之前算的：作废，重新取
        if (inFlight.current) load()
      })
      .catch((reason: unknown) => {
        notify(reason instanceof Error ? reason.message : "出了点问题，请稍后再试", "error")
        const code = reason instanceof ApiError ? reason.code : undefined
        // 服务端说钱不够、体力满了，而页面还让点：外壳手里的数字过期了，各自对一次
        if (code === "not_enough_coins") refreshUser()
        if (!alive.current) return
        // 这一次没买成，上一次的结果不再留着
        setGains((current) => ({ ...current, [item.id]: undefined }))
        if (code && STALE_CODES.includes(code)) load()
      })
      .finally(() => {
        purchasing.current = false
        if (alive.current) setBuyingId(null)
      })
  }

  const shelves = SHELVES.map((shelf) => ({
    ...shelf,
    items: items.filter((item) => item.section === shelf.id),
  })).filter((shelf) => shelf.items.length > 0)

  return (
    <div className="fl-page shop-page">
      {/* 货架接口不带服务器时间，只能按本机的钟判断到没到点 */}
      {nextReset !== null && <RefetchWhenDue dueAt={nextReset} refetch={load} />}
      <div className="fl-page__head">
        <h1 className="fl-page__title">商店</h1>
        <p className="bk-note">买到的东西都是绑定的，不进市场。</p>
        <span className="fl-page__spacer" />
        {shop.status === "ready" && <WalletStrip items={shop.items} wallet={shop.wallet} />}
      </div>

      {shop.status === "loading" && (
        <div className="bk-empty" role="status">
          正在读取货架……
        </div>
      )}
      {shop.status === "error" && (
        <div className="bk-empty" role="alert">
          <span className="bk-error">{shop.message}</span>
          <button
            type="button"
            className="bk-btn"
            onClick={() => {
              setShop(LOADING)
              load()
            }}
          >
            重试
          </button>
        </div>
      )}
      {shop.status === "ready" && shelves.length === 0 && <div className="bk-empty">货架上现在没有东西。</div>}
      {shop.status === "ready" &&
        shelves.map((shelf) => (
          <section className={`shop-shelf shop-shelf--${shelf.id}`} key={shelf.id}>
            <div className="shop-shelf__head">
              <h2 className="shop-shelf__title">{shelf.title}</h2>
              {/* 一段货架是同一个周期，重置说明取第一件的 */}
              <ResetNote item={shelf.items[0]} />
            </div>
            <div className="shop-shelf__grid">
              {shelf.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  coins={user.coins}
                  wallet={shop.wallet}
                  buyingId={buyingId}
                  gain={gains[item.id]}
                  onBuy={buy}
                />
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}

/**
 * 货架标题右边的重置说明：「每天 4:00 重置 · 还有 3 小时 12 分」。
 * 数字单独换成等宽字体：倒计时每秒在变，不换的话整行跟着左右抖。
 * 秒表在这里面走，整页不用跟着每秒重画。货架接口不带服务器时间，倒计时只能按本机的钟走。
 */
function ResetNote({ item }: { item: ShopItemView }) {
  const now = useNow(1000)
  const left = item.nextResetAt - now
  // 到点了、新一轮还没取回来（请求慢，或者本机的钟走快了）：写在换，不停在「还有 0 秒」
  const text = `${RESET_RULE[item.period]} · ${left >= 1000 ? `还有 ${formatLeft(left)}` : "正在换新一轮"}`
  return (
    <span className="shop-shelf__reset">
      {text.split(/(\d[\d:]*)/).map((part, index) =>
        index % 2 === 1 ? (
          <span className="bk-num" key={index}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  )
}

/** 页头的钱包条：买东西要用到的碎片。金币在顶栏，这里不重复 */
function WalletStrip({ items, wallet }: { items: readonly ShopItemView[]; wallet: ItemWallet }) {
  const priced = new Set(items.flatMap((item) => item.cost.items ?? []).map((stack) => stack.itemId))
  const held = SHARD_ITEMS.filter((def) => (wallet[def.id] ?? 0) > 0 || priced.has(def.id))
  if (held.length === 0) return null
  return (
    <div className="fl-chips" role="group" aria-label="手上的碎片">
      {held.map((def) => (
        // 碎片只写品质缩写，全名放在悬停提示里
        <span className="fl-chip" key={def.id} title={def.name}>
          <i style={{ "--c": RARITY_COLOR[def.rarity] } as CSSProperties} aria-hidden />
          {def.rarity}
          <b className="bk-num">{num(wallet[def.id] ?? 0)}</b>
        </span>
      ))}
    </div>
  )
}

interface ItemCardProps {
  item: ShopItemView
  coins: number
  wallet: ItemWallet
  /** 全页正在买的那件商品；null = 没有购买在路上 */
  buyingId: string | null
  /** 这件商品最近一次买到了什么 */
  gain: Gain | undefined
  onBuy: (item: ShopItemView, count: number) => void
}

function ItemCard({ item, coins, wallet, buyingId, gain, onBuy }: ItemCardProps) {
  const nameId = useId()
  const [picked, setPicked] = useState(1)
  // 买完或重置之后 remaining 会变：每次渲染把数量夹回买得到的范围，不另外同步 state
  const max = Math.min(MAX_PER_BUY, item.remaining)
  const count = Math.max(1, Math.min(picked, max))
  const soldOut = item.remaining <= 0
  const { reward } = item

  // 选了几件，价格就是几件的总价
  const coinCost = (item.cost.coins ?? 0) * count
  const itemCosts = (item.cost.items ?? []).map((stack) => ({ ...stack, count: stack.count * count }))
  const lacking = itemCosts.find((stack) => (wallet[stack.itemId] ?? 0) < stack.count)
  // 买不了的原因：按这个顺序判断，只说第一条。售罄不在这里，它连按钮都不留
  const blocked = soldOut
    ? null
    : coins < coinCost
      ? { text: "金币不够", bad: true }
      : lacking
        ? { text: `${itemName(lacking.itemId)} 不够`, bad: true }
        : null

  return (
    <article className={`fl-card shop-item ${soldOut ? "is-sold-out" : ""}`} aria-labelledby={nameId}>
      <div className="fl-card__head">
        <h3 className="shop-item__name" id={nameId}>
          {item.name}
        </h3>
        <span className="fl-card__meta">
          {PERIOD_WORD[item.period]}{" "}
          <span className="bk-num">
            {num(item.used)}/{num(item.limit)}
          </span>
        </span>
      </div>
      <p className="bk-note">{item.summary}</p>

      {reward.kind === "fixed" ? (
        <div className="shop-item__reward fl-info">
          {reward.items && <StackChips stacks={reward.items} />}
          {reward.packs?.map((pack) => (
            <span className="fl-chip" key={pack.pool}>
              {packName(pack.pool)}
              <b className="bk-num">×{num(pack.count)}</b>
            </span>
          ))}
        </div>
      ) : (
        <Odds pool={reward.pool} />
      )}

      <hr className="bk-divider" />

      <div className="shop-item__tail">
        <div className="shop-item__foot">
          <span className="shop-item__price">
            {coinCost > 0 && (
              <span className="shop-item__term">
                金币 <span className="bk-num">{num(coinCost)}</span>
              </span>
            )}
            {itemCosts.map((stack, index) => (
              <Fragment key={stack.itemId}>
                {(coinCost > 0 || index > 0) && " + "}
                <span className="shop-item__term">
                  {itemName(stack.itemId)} <span className="bk-num">×{num(stack.count)}</span>
                </span>
              </Fragment>
            ))}
          </span>
          {soldOut ? (
            <span className="shop-item__sold">已售罄</span>
          ) : (
            <div className="shop-item__buy">
              {max > 1 && (
                <div className="shop-item__qty" role="group" aria-label="购买数量">
                  <button
                    type="button"
                    className="shop-item__step"
                    aria-label="减少数量"
                    disabled={count <= 1}
                    onClick={() => setPicked(count - 1)}
                  >
                    −
                  </button>
                  <span className="bk-num shop-item__count" aria-live="polite">
                    {count}
                  </span>
                  <button
                    type="button"
                    className="shop-item__step"
                    aria-label="增加数量"
                    disabled={count >= max}
                    onClick={() => setPicked(count + 1)}
                  >
                    +
                  </button>
                </div>
              )}
              <button
                type="button"
                className="bk-btn"
                aria-describedby={nameId}
                disabled={buyingId !== null || blocked !== null}
                onClick={() => onBuy(item, count)}
              >
                {buyingId === item.id ? "购买中…" : "购买"}
              </button>
            </div>
          )}
        </div>
        {/* 播报区一直留在页面上：原因和结果是后来才冒出来的，读屏靠它念 */}
        <div aria-live="polite">
          {blocked && <p className={`shop-item__why ${blocked.bad ? "is-bad" : ""}`}>{blocked.text}</p>}
          {gain && (
            <p className="shop-item__gain fl-good" key={gain.nth}>
              获得：{gain.text}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

/** 博弈商品的概率表。概率按权重现算，条目顺序照接口给的 */
function Odds({ pool }: { pool: Extract<ShopReward, { kind: "gamble" }>["pool"] }) {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
  return (
    <div className="shop-odds">
      <p className="shop-odds__hint">每次随机开出下面其中一项</p>
      <ul className="shop-odds__list">
        {pool.map((entry, index) => (
          <li key={index}>
            <span>{stackText(entry.items)}</span>
            <span className="bk-num">{((entry.weight / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
