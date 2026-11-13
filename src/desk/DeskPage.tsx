import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { CardFace } from "@/card/CardFace"

import { cardFromDesk } from "./cardFace"

import { DeskObject, type DealButtonState } from "./DeskObject"
import { DeskBook, PANEL_IDS, type DeskBookHandle, type PanelId } from "./DeskBook"
import { DragGhost } from "./DragGhost"
import { toFace, type ApiUserCard } from "./api"
import {
  ALBUM_HOVER_EVENT,
  BACKPACK_HOVER_EVENT,
  DESK_ADD_CARDS_EVENT,
  DECK_ASSIGN_EVENT,
  DECK_HOVER_EVENT,
  PACKS_CHANGED_EVENT,
  CARD_POINTER_DROP_EVENT,
  type CardPointerDrop,
} from "./drag"
import { InviteLetter } from "./InviteLetter"
import { INVITE_OPEN_EVENT } from "./invite"
import { OBJECT_META, type DeskObjectId } from "./objects"
import { POOL_META } from "./rarity"
import { DEFAULT_SKIN } from "./skins"
import { publishDeskCardIds } from "./presence"
import { cardsToItems, ITEM_SIZE, newId, sizeOf, useDesk } from "./store"
import type { CardData, DeskItem, PackPool, Rarity } from "./types"
import { PackArt } from "./opening/PackArt"
import { PackOpener, type OriginRect } from "./opening/PackOpener"
import "./desk.css"

/** 卡牌域很重；桌面状态变化时复用同一张卡面。 */
const DeskCard = memo(function DeskCard({ card, hero }: { card: CardData; hero: ApiUserCard | null }) {
  return <CardFace card={card.isHero && hero ? toFace(hero) : cardFromDesk(card)} />
})

const DeskPack = memo(function DeskPack({ pool }: { pool: PackPool }) {
  return <div className="desk-pack"><PackArt pool={pool} /></div>
})


const POOL_KEY = "choke.pool"

/** 桌面卡池 → 服务端卡池 id（任务包在服务端叫 golden） */
const SERVER_POOL: Record<PackPool, string> = {
  normal: "normal",
  idle: "idle",
  quest: "golden",
  radiant: "radiant",
  sky: "sky",
  prism: "prism",
}

interface OpenResponse {
  ok: boolean
  data?: {
    results: { cardId: string; userCardId: number; foil: boolean }[]
    pity: { before: number; after: number }
    packs?: Record<string, number>
  }
  error?: { code?: string; message?: string }
}

interface CardRow {
  id: string
  name: string
  rarity: Rarity
  art: string | null
  banner: string | null
}

interface CardResponse {
  ok: boolean
  data?: CardRow
  error?: { message?: string }
}

interface DeskUser {
  id: string
  username: string
  publicId: number | null
  avatarUrl: string | null
  essence: number
  coins: number
  hero: ApiUserCard | null
  onboarded: boolean
}

/** 松手那一刻物件的位置和姿态，飞行动画从这里接手 */
interface FlightSource {
  left: number
  top: number
  viewportLeft: number
  viewportTop: number
  transform: string
  transformOrigin: string
}

/** 飞行落点：物件左上角在桌面里的坐标；scale 是落地时的缩放，fade 为 true 时边飞边淡出 */
interface FlightSlot {
  left: number
  top: number
  scale?: number
  fade?: boolean
}

/** 每个物件一个轻微的固定角度，让桌面看起来是随手摆放的 */
function tiltOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ((h % 7) - 3) * 0.8
}

/** 卡只能收进卡册，卡包只能放回纸盒 */
function acceptsDrop(target: DeskObjectId | undefined, item: DeskItem) {
  return (target === "album" && item.kind === "card") || (target === "backpack" && item.kind === "pack")
}

export function DeskPage() {
  const { items, move, front, spawn, remove, reset } = useDesk()
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 1200, h: 700 })
  const [lifted, setLifted] = useState<{ item: DeskItem; grab: { u: number; v: number } } | null>(null)
  const liftPointer = useRef({ x: 0, y: 0 })
  const [settling, setSettling] = useState<string | null>(null)
  const [opening, setOpening] = useState<{ pack: DeskItem; cards: CardData[]; pool: PackPool; rect?: OriginRect } | null>(null)
  const [pool, setPool] = useState<PackPool>(() => {
    const saved = localStorage.getItem(POOL_KEY) as PackPool | null
    return saved && saved in POOL_META ? saved : "normal"
  })
  const [pressing, setPressing] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [collecting, setCollecting] = useState<{
    id: string
    left: number
    top: number
    viewportLeft: number
    viewportTop: number
    toLeft: number
    toTop: number
    scale: number
    fade: boolean
    transform: string
    transformOrigin: string
  } | null>(null)
  const collectionRef = useRef<HTMLDivElement>(null)
  /** 正在飞的那一件的收尾函数；新的飞行开始时先让上一件落定 */
  const flightDone = useRef<(() => void) | null>(null)
  /** 卡包正飞过来、翻盖先掀开等着的物件 */
  const [awaiting, setAwaiting] = useState<DeskObjectId | null>(null)
  /** 刚接住东西、正在回弹的物件 */
  const [receiving, setReceiving] = useState<DeskObjectId | null>(null)
  const receiveTimer = useRef<number | null>(null)
  const [quickTargets, setQuickTargets] = useState<Record<string, { dx: number; dy: number; index: number }> | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [user, setUser] = useState<DeskUser | null>(null)
  /** /auth/me 回来过一次（登没登录都算），邀请函等它再决定要不要弹 */
  const [userReady, setUserReady] = useState(false)
  const [packState, setPackState] = useState<{
    userId: string
    data: Record<string, number>
  } | null>(null)
  const [book, setBook] = useState<{ panel: PanelId; origin: { x: number; y: number } | null } | null>(() => {
    const query = new URLSearchParams(window.location.search).get("panel") as PanelId | null
    return query && PANEL_IDS.includes(query) ? { panel: query, origin: null } : null
  })
  const bookRef = useRef<DeskBookHandle>(null)
  const collectTimer = useRef<number | null>(null)
  const quickTimer = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)
  const openingBusy = useRef(false)
  useEffect(() => {
    localStorage.setItem(POOL_KEY, pool)
  }, [pool])

  const refreshUser = useCallback(() => {
    fetch("/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok)
          setUser({
            id: d.data.id,
            username: d.data.username,
            publicId: d.data.publicId ?? null,
            avatarUrl: d.data.avatarUrl ?? null,
            essence: Number(d.data.essence ?? 0),
            coins: Number(d.data.coins ?? 0),
            hero: d.data.hero ?? null,
            onboarded: !!d.data.onboarded,
          })
        else setUser(null)
      })
      .catch(() => {})
      .finally(() => setUserReady(true))
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const refreshPacks = useCallback(() => {
    if (!user) return
    fetch(`/api/users/${user.id}/packs`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setPackState({ userId: user.id, data: d.data.packs })
      })
      .catch(() => {})
  }, [user])

  useEffect(() => {
    refreshPacks()
  }, [refreshPacks])

  useEffect(() => {
    const handler = () => refreshPacks()
    window.addEventListener(PACKS_CHANGED_EVENT, handler)
    return () => window.removeEventListener(PACKS_CHANGED_EVENT, handler)
  }, [refreshPacks])

  // 背包里点「打开邀请函」：先合上书，让信封从桌面底边弹上来时看得见
  useEffect(() => {
    const handler = () => bookRef.current?.close()
    window.addEventListener(INVITE_OPEN_EVENT, handler)
    return () => window.removeEventListener(INVITE_OPEN_EVENT, handler)
  }, [])

  const onInviteClaimed = useCallback(() => {
    refreshUser()
    window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
  }, [refreshUser])

  const logout = () => {
    fetch("/auth/logout", { method: "POST", credentials: "include" })
      .catch(() => {})
      .finally(() => setUser(null))
  }

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      for (const timer of [collectTimer, quickTimer, toastTimer, settleTimer, receiveTimer]) {
        if (timer.current) window.clearTimeout(timer.current)
      }
    }
  }, [])

  const showToast = useCallback((text: string) => {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1600)
  }, [])

  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    const ids = items.flatMap((item) =>
      item.kind === "card" && typeof item.card?.userCardId === "number"
        ? [item.card.userCardId]
        : [],
    )
    publishDeskCardIds(ids)
  }, [items])

  const spawnCards = useCallback(
    (cards: CardData[], clientX?: number, clientY?: number) => {
      if (!cards.length) return
      const stage = stageRef.current
      if (!stage) return
      const existing = new Set(
        itemsRef.current.flatMap((item) =>
          item.kind === "card" && typeof item.card?.userCardId === "number"
            ? [item.card.userCardId]
            : [],
        ),
      )
      const fresh = cards.filter(
        (card) => card.userCardId == null || !existing.has(card.userCardId),
      )
      if (fresh.length === 0) return
      const rect = stage.getBoundingClientRect()
      const size = ITEM_SIZE.card
      const originX = clientX == null ? rect.width * 0.5 : clientX - rect.left
      const originY = clientY == null ? rect.height * 0.42 : clientY - rect.top
      const step = 0.06
      const startX =
        (originX - size.w / 2 - ((fresh.length - 1) * step * rect.width) / 2) / rect.width
      const topZ = Math.max(0, ...itemsRef.current.map((item) => item.z)) + 1
      const next = fresh.map((card, index) => {
        const x = Math.min(
          Math.max(startX + index * step, 0.02),
          0.98 - size.w / rect.width,
        )
        const y = Math.min(
          Math.max((originY - size.h / 2) / rect.height + (index % 2) * 0.012, 0.02),
          0.98 - size.h / rect.height,
        )
        return {
          id: newId("card"),
          kind: "card" as const,
          x,
          y,
          z: topZ + index,
          card,
        }
      })
      spawn(next)
    },
    [spawn],
  )

  useEffect(() => {
    const onAddCards = (event: Event) => {
      const cards = (event as CustomEvent<CardData[]>).detail
      if (!Array.isArray(cards) || cards.length === 0) return
      spawnCards(cards)
      showToast(`已发到桌面 ×${cards.length}`)
    }
    window.addEventListener(DESK_ADD_CARDS_EVENT, onAddCards)
    return () => window.removeEventListener(DESK_ADD_CARDS_EVENT, onAddCards)
  }, [spawnCards, showToast])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onDrop = (event: Event) => {
      if (event.defaultPrevented || event.target !== stage) return
      const { payload, x, y } = (event as CustomEvent<CardPointerDrop>).detail
      if (!payload.card) return
      event.preventDefault()
      spawnCards([payload.card], x, y)
      showToast(`${payload.card.name} · 已放到桌面`)
    }
    stage.addEventListener(CARD_POINTER_DROP_EVENT, onDrop)
    return () => stage.removeEventListener(CARD_POINTER_DROP_EVENT, onDrop)
  }, [spawnCards, showToast])

  const album = items.find((it) => it.object === "album")
  const backpack = items.find((it) => it.object === "backpack")

  /** 卡飞进活页夹中心时的左上角 */
  const albumSlot = (): FlightSlot | null => {
    if (!album) return null
    const size = OBJECT_META.album
    return {
      left: album.x * stageSize.w + size.w / 2 - ITEM_SIZE.card.w / 2,
      top: album.y * stageSize.h + size.h / 2 - ITEM_SIZE.card.h / 2,
    }
  }

  /** 卡包飞进卡盒翻盖下沿时的左上角（翻盖高度见 desk-objects.css 的 .obj-box__lid） */
  const backpackSlot = (): FlightSlot | null => {
    if (!backpack) return null
    const size = OBJECT_META.backpack
    return {
      left: backpack.x * stageSize.w + size.w / 2 - ITEM_SIZE.pack.w / 2,
      top: backpack.y * stageSize.h + size.h * 0.46 - ITEM_SIZE.pack.h / 2,
    }
  }

  /** 东西落进 receiver：翻盖扣回去（过冲），物件被砸得一沉再弹回 */
  const land = (receiver: DeskObjectId) => {
    setAwaiting(null)
    setReceiving(receiver)
    if (receiveTimer.current) window.clearTimeout(receiveTimer.current)
    receiveTimer.current = window.setTimeout(() => setReceiving(null), 540)
  }

  /**
   * 从松手的位置缩小飞到 slot，落地后把物件从桌面拿走。
   * 返回的 Promise 在落地时完成；receiver 是接住它的桌面物件：起飞时先掀开翻盖，落地时扣回并弹一下。
   */
  const flyInto = (item: DeskItem, source: FlightSource, slot: FlightSlot, receiver?: DeskObjectId) =>
    new Promise<void>((resolve) => {
      // 上一件还在飞：让它立刻落定，不然会被这一件顶掉、永远留在桌上
      flightDone.current?.()
      setDropTarget(null)
      setCollecting({ id: item.id, ...source, toLeft: slot.left, toTop: slot.top, scale: slot.scale ?? 0.16, fade: slot.fade ?? true })
      if (receiver) setAwaiting(receiver)
      const done = () => {
        if (flightDone.current !== done) return
        flightDone.current = null
        if (collectTimer.current) window.clearTimeout(collectTimer.current)
        collectTimer.current = null
        remove(item.id)
        setCollecting((current) => (current?.id === item.id ? null : current))
        if (receiver) land(receiver)
        resolve()
      }
      flightDone.current = done
      collectTimer.current = window.setTimeout(done, 430)
    })

  const collectCard = (item: DeskItem, source: FlightSource, destination = albumSlot()) => {
    if (!destination) return
    void flyInto(item, source, destination).then(() => showToast("已收入卡册"))
  }

  /**
   * 拖进翻开的卡册：这张卡在卡册里本来就有一格（压暗、标着"在桌面"）。
   * 那格在当前页就缩到格子大小、不透明地落进去，落地后那格亮起来弹一下；
   * 不在当前页就飞向右下角页码，像塞进后面的书页。
   */
  const collectIntoAlbum = (item: DeskItem, source: FlightSource, stage: DOMRect) => {
    const size = sizeOf(item)
    const spread = document.querySelector<HTMLElement>(".book__spread.album-panel:not([data-preload])")
    const userCardId = item.card?.userCardId
    const slotEl = userCardId == null ? null : spread?.querySelector<HTMLElement>(`.album-slot[data-user-card="${userCardId}"]`)
    const target = slotEl ?? spread?.querySelector<HTMLElement>(".book__folio") ?? spread
    if (!target) return collectCard(item, source)
    const box = target.getBoundingClientRect()
    const slot: FlightSlot = {
      left: box.left - stage.left + box.width / 2 - size.w / 2,
      top: box.top - stage.top + box.height / 2 - size.h / 2,
      ...(slotEl ? { scale: box.width / size.w, fade: false } : {}),
    }
    void flyInto(item, source, slot).then(() => {
      if (slotEl?.isConnected) {
        // data-* 不归 React 管，卡位重渲染（去掉 is-on-desk）时不会被冲掉
        delete slotEl.dataset.landing
        void slotEl.offsetWidth
        slotEl.dataset.landing = ""
        window.setTimeout(() => delete slotEl.dataset.landing, 480)
      }
      showToast("已收入卡册")
    })
  }

  useLayoutEffect(() => {
    if (!collecting) return
    const item = collectionRef.current?.querySelector<HTMLElement>(".desk-body")
    if (!item) return
    const { left, top, toLeft, toTop, transform, transformOrigin, scale, fade } = collecting
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // 缩小是绕抓取点（transformOrigin）做的，抓得越偏，缩完的中心离落点越远；把这段偏移补回来
    const originPx = (part: string | undefined, full: number) => {
      const value = Number.parseFloat(part ?? "")
      if (!Number.isFinite(value)) return full / 2
      return part?.endsWith("%") ? (value / 100) * full : value
    }
    const parts = transformOrigin.split(" ")
    const w = item.offsetWidth
    const h = item.offsetHeight
    const dx = toLeft - left - (1 - scale) * (originPx(parts[0], w) - w / 2)
    const dy = toTop - top - (1 - scale) * (originPx(parts[1], h) - h / 2)
    const animation = item.animate([
      { transform, transformOrigin, opacity: 1 },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        transformOrigin, opacity: fade ? 0 : 1,
      },
    ], { duration: reduced ? 1 : 420, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" })
    return () => animation.cancel()
  }, [collecting])

  /** 把一个桌面卡包的 token 还给服务端。null = 请求没送到或回来的不是 JSON，这时 token 在服务端还有效 */
  const postPackReturn = (userId: string, token: string) =>
    fetch(`/api/users/${userId}/packs/return`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(
        async (res) =>
          (await res.json().catch(() => null)) as
            | { ok: boolean; data?: { packs: Record<string, number> } }
            | null,
      )
      .catch(() => null)

  /** 快速收卡：卡飞进卡册，卡包飞进卡盒并还给背包 */
  const quickCollectAll = () => {
    const cardSlot = albumSlot()
    const packSlot = backpackSlot()
    const cards = cardSlot ? items.filter((it) => it.kind === "card") : []
    const packs = packSlot ? items.filter((it) => it.kind === "pack") : []
    const flying = [...cards, ...packs]
    if (!flying.length) return
    setQuickTargets(Object.fromEntries(flying.map((it, index) => {
      const slot = (it.kind === "pack" ? packSlot : cardSlot)!
      return [it.id, { dx: slot.left - it.x * stageSize.w, dy: slot.top - it.y * stageSize.h, index }]
    })))
    if (packs.length) {
      // 第一个卡包起飞时掀开翻盖（卡包排在卡后面起飞），全部落地时扣回
      if (receiveTimer.current) window.clearTimeout(receiveTimer.current)
      receiveTimer.current = window.setTimeout(() => setAwaiting("backpack"), cards.length * 24)
    }
    if (quickTimer.current) window.clearTimeout(quickTimer.current)
    quickTimer.current = window.setTimeout(async () => {
      flying.forEach((it) => remove(it.id))
      if (packs.length) land("backpack")
      setQuickTargets(null)
      const parts: string[] = []
      if (cards.length) parts.push(`${cards.length} 张卡收入卡册`)
      if (!packs.length) {
        showToast(parts.join("，"))
        return
      }
      const userId = user?.id
      const results = await Promise.all(
        packs.map((pack) => (pack.token && userId ? postPackReturn(userId, pack.token) : Promise.resolve(undefined))),
      )
      // 没送到的卡包摆回原位；服务端拒绝或本地卡包直接收走
      const failed = packs.filter((_, index) => results[index] === null)
      if (failed.length) {
        const topZ = Math.max(0, ...itemsRef.current.map((it) => it.z)) + 1
        spawn(failed.map((pack, index) => ({ ...pack, z: topZ + index })))
      }
      const latest = [...results].reverse().find((payload) => payload?.ok && payload.data)
      if (latest?.data && userId) {
        setPackState({ userId, data: latest.data.packs })
        window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
      } else {
        refreshPacks()
      }
      const returned = packs.length - failed.length
      if (returned) parts.push(`${returned} 个卡包放回背包`)
      if (failed.length) parts.push(`${failed.length} 个卡包放回失败，留在桌面`)
      showToast(parts.join("，"))
    }, 440 + flying.length * 24)
  }

  /** 快速收卡：每件从原位缩小飞向目标，依次错开 24ms */
  useLayoutEffect(() => {
    if (!quickTargets) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const animations = Object.entries(quickTargets).flatMap(([id, { dx, dy, index }]) => {
      const body = stageRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] > .desk-body`)
      if (!body) return []
      return [body.animate([
        { transform: "none", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.16)`, opacity: 0 },
      ], {
        duration: reduced ? 1 : 420,
        delay: reduced ? 0 : index * 24,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "both",
      })]
    })
    return () => animations.forEach((animation) => animation.cancel())
  }, [quickTargets])

  const spawnPack = async () => {
    const meta = POOL_META[pool]
    if (!user) {
      showToast("请先用 osu! 登录")
      return
    }
    try {
      const res = await fetch(
        `/api/users/${user.id}/packs/${SERVER_POOL[pool]}/take`,
        { method: "POST", credentials: "include" },
      )
      const payload = (await res.json().catch(() => null)) as
        | { ok: boolean; data?: { token: string; packs: Record<string, number> }; error?: { message?: string } }
        | null
      if (!res.ok || !payload?.ok || !payload.data) {
        showToast(payload?.error?.message ?? `背包里没有${meta.label}`)
        refreshPacks()
        return
      }
      setPackState({ userId: user.id, data: payload.data.packs })
      window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
      const topZ = Math.max(0, ...items.map((it) => it.z)) + 1
      const packCount = items.filter((it) => it.kind === "pack").length
      const offset = ((packCount % 3) - 1) * 0.045
      const pack: DeskItem = {
        id: newId("pack"),
        kind: "pack",
        x: 0.3 + offset,
        y: 0.3,
        z: topZ,
        pool,
        token: payload.data.token,
      }
      spawn([pack])
      showToast(`${meta.label} · 卡包已发到桌面`)
    } catch {
      showToast("发牌失败")
    }
  }

  /**
   * 卡包放回背包。给了 flight 就从松手的位置飞进去，请求和飞行同时进行；
   * 不给（找不到落点）就直接拿走。item 要传拖起之前的那份：放回失败时按它的位置摆回桌面。
   */
  const returnPack = async (
    item: DeskItem,
    flight?: { source: FlightSource; slot: FlightSlot; receiver?: DeskObjectId },
  ) => {
    let landed: Promise<void>
    if (flight) {
      landed = flyInto(item, flight.source, flight.slot, flight.receiver)
    } else {
      remove(item.id)
      landed = Promise.resolve()
    }

    // 本地卡包（没有 token）或没登录：没有库存可还，拿走就行
    if (!item.token || !user) {
      await landed
      refreshPacks()
      showToast("卡包已从桌面收回")
      return
    }

    const userId = user.id
    const request = postPackReturn(userId, item.token)

    const [payload] = await Promise.all([request, landed])
    if (payload?.ok && payload.data) {
      setPackState({ userId, data: payload.data.packs })
      window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
      showToast("卡包已放回背包")
      return
    }
    if (payload) {
      // 服务端明确拒绝：这个包已经失效，留在桌上也开不了
      refreshPacks()
      showToast("卡包已从桌面收回")
      return
    }
    // 没还成：把包摆回拖起之前的位置，放到最上面
    const topZ = Math.max(0, ...itemsRef.current.map((it) => it.z)) + 1
    spawn([{ ...item, z: topZ }])
    refreshPacks()
    showToast("放回失败，卡包留在桌面")
  }

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, item: DeskItem) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const size = sizeOf(item)
    const originX = item.x * rect.width
    const originY = item.y * rect.height
    const startX = e.clientX
    const startY = e.clientY
    const grab = {
      u: Math.min(Math.max((startX - rect.left - originX) / size.w - 0.5, -0.5), 0.5),
      v: Math.min(Math.max((startY - rect.top - originY) / size.h - 0.5, -0.5), 0.5),
    }
    let moved = false
    let nx = originX
    let ny = originY
    let target: DeskObjectId | undefined
    let deckSlot: number | null = null
    let albumPanelHover = false
    let backpackPanelHover = false
    const assignId =
      item.card?.userCardId ??
      (item.card?.isHero ? user?.hero?.userCardId : undefined)
    const canAssign = item.kind === "card" && assignId != null
    front(item.id)

    let hitFrame = 0
    let hitX = startX
    let hitY = startY
    const updateTarget = () => {
      hitFrame = 0
      const elements = document.elementsFromPoint(hitX, hitY)
      let slotEl: HTMLElement | null = null
      let overAlbum = false
      let overBackpack = false
      let hovered: DeskObjectId | undefined
      for (const el of elements) {
        if (canAssign && !slotEl) slotEl = el.closest<HTMLElement>("[data-slot]")
        if (item.kind === "card" && !overAlbum) overAlbum = !!el.closest(".album-panel")
        if (item.kind === "pack" && !overBackpack) overBackpack = !!el.closest(".backpack-panel")
        if (!hovered) {
          const object = el.closest<HTMLElement>(".desk-item[data-object]")
          if (object && object.dataset.id !== item.id) hovered = object.dataset.object as DeskObjectId
        }
      }
      const parsed = slotEl ? Number(slotEl.dataset.slot) : Number.NaN
      const nextSlot = Number.isInteger(parsed) ? parsed : null
      if (nextSlot !== deckSlot) {
        deckSlot = nextSlot
        window.dispatchEvent(new CustomEvent(DECK_HOVER_EVENT, { detail: nextSlot }))
      }
      if (overAlbum !== albumPanelHover) {
        albumPanelHover = overAlbum
        window.dispatchEvent(new CustomEvent(ALBUM_HOVER_EVENT, { detail: overAlbum }))
      }
      if (overBackpack !== backpackPanelHover) {
        backpackPanelHover = overBackpack
        window.dispatchEvent(new CustomEvent(BACKPACK_HOVER_EVENT, { detail: overBackpack }))
      }
      const next = acceptsDrop(hovered, item) ? hovered : undefined
      if (next !== target) {
        target = next
        setDropTarget(next ?? null)
      }
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return
      if (!moved) {
        moved = true
        liftPointer.current = { x: rect.left + originX, y: rect.top + originY }
        setLifted({ item, grab })
      }
      nx = Math.min(Math.max(originX + dx, 0), rect.width - size.w)
      ny = Math.min(Math.max(originY + dy, 0), rect.height - size.h)
      liftPointer.current = { x: rect.left + nx, y: rect.top + ny }

      hitX = ev.clientX
      hitY = ev.clientY
      if (!hitFrame) hitFrame = requestAnimationFrame(updateTarget)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      if (ev.type === "pointerup") onMove(ev)
      if (hitFrame) cancelAnimationFrame(hitFrame)
      if (moved && ev.type === "pointerup") updateTarget()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      const ghost = document.querySelector<HTMLElement>(".desk-ghost__body")
      const pose = ghost ? getComputedStyle(ghost) : null
      const source = {
        left: nx, top: ny,
        viewportLeft: rect.left + nx, viewportTop: rect.top + ny,
        transform: pose?.transform ?? `rotate(${tiltOf(item.id)}deg)`,
        transformOrigin: pose?.transformOrigin ?? "50% 50%",
      }
      setLifted(null)
      if (deckSlot != null) window.dispatchEvent(new CustomEvent(DECK_HOVER_EVENT, { detail: null }))
      if (albumPanelHover) window.dispatchEvent(new CustomEvent(ALBUM_HOVER_EVENT, { detail: false }))
      if (backpackPanelHover) window.dispatchEvent(new CustomEvent(BACKPACK_HOVER_EVENT, { detail: false }))
      setDropTarget(null)
      if (!moved) {
        if (ev.type === "pointerup") void onTap(item)
        return
      }
      if (ev.type === "pointercancel") {
        move(item.id, nx / rect.width, ny / rect.height)
        return
      }
      if (albumPanelHover && item.kind === "card") {
        collectIntoAlbum(item, source, rect)
        return
      }
      if (backpackPanelHover && item.kind === "pack") {
        const panel = document.querySelector(".backpack-panel")?.getBoundingClientRect()
        const slot = panel
          ? {
              left: panel.left - rect.left + panel.width / 2 - size.w / 2,
              top: panel.top - rect.top + Math.min(panel.height / 2, 180) - size.h / 2,
            }
          : backpackSlot()
        void returnPack(item, slot ? { source, slot } : undefined)
        return
      }
      if (deckSlot != null && assignId != null) {
        window.dispatchEvent(
          new CustomEvent(DECK_ASSIGN_EVENT, {
            detail: { userCardId: assignId, slot: deckSlot },
          }),
        )
        remove(item.id)
        showToast(`已放入卡组第 ${deckSlot + 1} 槽`)
        return
      }
      if (target === "album") {
        collectCard(item, source)
        return
      }
      if (target === "backpack") {
        const slot = backpackSlot()
        void returnPack(item, slot ? { source, slot, receiver: "backpack" } : undefined)
        return
      }
      // 落桌：轻轻弹一下，影子收紧
      move(item.id, nx / rect.width, ny / rect.height)
      setSettling(item.id)
      if (settleTimer.current) window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => setSettling(null), 460)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  const openBook = (panel: PanelId, item: DeskItem) => {
    const stage = stageRef.current
    const size = sizeOf(item)
    const rect = stage?.getBoundingClientRect()
    setBook({
      panel,
      origin: rect
        ? { x: rect.left + item.x * rect.width + size.w / 2, y: rect.top + item.y * rect.height + size.h / 2 }
        : null,
    })
  }

  const onTap = async (item: DeskItem) => {
    if (item.kind === "object" && item.object) {
      if (item.object === "button") setPressing(true)
      else openBook(item.object, item)
      return
    }

    if (item.kind === "pack") {
      if (openingBusy.current) return
      if (!user) {
        showToast("请先用 osu! 登录")
        return
      }

      const stage = stageRef.current
      let rect: OriginRect | undefined
      if (stage) {
        const r = stage.getBoundingClientRect()
        const size = ITEM_SIZE.pack
        rect = {
          left: r.left + item.x * r.width,
          top: r.top + item.y * r.height,
          width: size.w,
          height: size.h,
        }
      }
      const packPool = item.pool ?? "normal"

      openingBusy.current = true
      showToast("开包中…")
      try {
        const res = await fetch(`/api/packs/${SERVER_POOL[packPool]}/open`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 5, token: item.token }),
        })
        const payload = (await res.json()) as OpenResponse
        if (!res.ok || !payload.ok || !payload.data) {
          if (
            payload.error?.code === "no_packs" ||
            payload.error?.code === "invalid_token"
          ) {
            remove(item.id)
            refreshPacks()
            showToast("这个桌面卡包已经失效，已移除")
          } else {
            showToast(payload.error?.message ?? "开包失败")
          }
          return
        }
        if (payload.data.packs && user) {
          setPackState({ userId: user.id, data: payload.data.packs })
          window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
        }

        const cards: CardData[] = await Promise.all(
          payload.data.results.map(async (result) => {
            const detailRes = await fetch(`/api/cards/${result.cardId}`, { credentials: "include" })
            const detail = (await detailRes.json()) as CardResponse
            if (!detailRes.ok || !detail.ok || !detail.data) {
              throw new Error(detail.error?.message ?? "卡牌详情加载失败")
            }
            const row = detail.data
            return {
              cardId: row.id,
              userCardId: result.userCardId,
              name: row.name,
              mapper: row.name,
              rarity: row.rarity,
              art: row.art ?? undefined,
              banner: row.banner ?? undefined,
              foil: result.foil,
            }
          }),
        )

        // 抽卡已成功落库，立刻消耗桌面上的卡包，避免取消后重复开同一包
        remove(item.id)
        setOpening({ pack: item, cards, pool: packPool, rect })
      } catch (err) {
        showToast(err instanceof Error ? err.message : "开包失败")
      } finally {
        openingBusy.current = false
      }
    }
  }

  const finishOpening = () => {
    if (!opening) return
    spawn(cardsToItems(opening.cards, opening.pack.x + 0.01, opening.pack.y + 0.02))
    setOpening(null)
  }

  const dropOpeningCard = (card: CardData) => {
    if (!opening) return
    const left = opening.cards.filter(
      (item) => !(item.cardId === card.cardId && item.userCardId === card.userCardId),
    )
    spawnCards([card])
    showToast(`${card.name} · 已放到桌面`)
    setOpening(left.length === 0 ? null : { ...opening, cards: left })
  }

  const quickFinishOpening = () => {
    if (!opening) return
    setOpening(null)
    showToast(`已收入卡册 ×${opening.cards.length}`)
  }

  const visibleItems = items.filter((item) => !(item.card?.isHero && !user?.hero))
  const poolPacks =
    packState && packState.userId === user?.id
      ? (packState.data[SERVER_POOL[pool]] ?? 0)
      : 0
  const deal: DealButtonState = {
    pool,
    available: !!user && poolPacks > 0,
    pressing,
    onPool: setPool,
    onPressed: () => {
      setPressing(false)
      void spawnPack()
    },
  }

  const renderItem = (item: DeskItem) => {
    if (item.kind === "object" && item.object) {
      return (
        <DeskObject
          id={item.object}
          username={user?.username ?? null}
          avatarUrl={user?.avatarUrl ?? null}
          dropping={dropTarget === item.object}
          deal={deal}
        />
      )
    }
    if (item.kind === "pack") return <DeskPack pool={item.pool ?? "normal"} />
    return item.card ? <DeskCard card={item.card} hero={item.card.isHero ? user?.hero ?? null : null} /> : null
  }

  const labelOf = (item: DeskItem) => {
    if (item.kind === "object" && item.object) return OBJECT_META[item.object].thing
    if (item.kind === "pack") return POOL_META[item.pool ?? "normal"].label
    return item.card?.name ?? "卡牌"
  }

  return (
    <div className="desk-root">
      <header className="desk-topbar">
        <div className="desk-topbar__main">
          <img className="desk-topbar__brand" src="/brand/choke-lockup-horizontal-light.svg" alt="Choke!" />
          <div className="desk-topbar__actions">
            <button
              type="button"
              className="desk-button"
              onClick={quickCollectAll}
              disabled={!items.some((it) => it.kind === "card" || it.kind === "pack")}
            >
              快速收卡
            </button>
            <button type="button" className="desk-button" onClick={reset}>
              重置桌面
            </button>
          </div>
        </div>
      </header>

      <main
        ref={stageRef}
        className="desk-stage"
        style={{
          "--desk-bg": DEFAULT_SKIN.background,
          "--desk-blend": DEFAULT_SKIN.blend,
          "--desk-edge": DEFAULT_SKIN.edge,
        } as CSSProperties}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest(".desk-item, .book")) return
          bookRef.current?.close()
        }}
      >
        <div className="desk-layer">
          {visibleItems.map((item, index) => {
            const size = sizeOf(item)
            const isCollecting = collecting?.id === item.id
            const quickTarget = quickTargets?.[item.id]
            const flying = isCollecting || !!quickTarget
            const dealX = stageSize.w / 2 - (item.x * stageSize.w + size.w / 2)
            const tilt = tiltOf(item.id)
            const style = {
              left: isCollecting ? collecting.left : item.x * stageSize.w,
              top: isCollecting ? collecting.top : item.y * stageSize.h,
              width: size.w,
              height: size.h,
              zIndex: flying ? 100000 : item.z,
              transform: isCollecting ? "none" : `rotate(${tilt}deg)`,
              pointerEvents: flying ? "none" : undefined,
              "--deal-x": `${dealX}px`,
              animationDelay: `${index * 40}ms`,
            } as CSSProperties
            const classes = [
              "desk-item",
              (lifted?.item.id === item.id || isCollecting) && "is-lifted",
              settling === item.id && "is-settling",
              flying && "is-collecting",
              awaiting != null && awaiting === item.object && "is-opening",
              receiving != null && receiving === item.object && "is-receiving",
            ]
              .filter(Boolean)
              .join(" ")
            return (
              <div
                key={item.id}
                className={classes}
                style={style}
                data-id={item.id}
                data-object={item.object}
                onPointerDown={(e) => {
                  if (e.button !== 0 || flying) return
                  e.preventDefault()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  startDrag(e, item)
                }}
                role="group"
                aria-label={labelOf(item)}
              >
                <div className="desk-body">{renderItem(item)}</div>
              </div>
            )
          })}
        </div>

        <InviteLetter
          user={user ? { username: user.username, onboarded: user.onboarded } : null}
          ready={userReady}
          stageSize={stageSize}
          stageRef={stageRef}
          onToast={showToast}
          onClaimed={onInviteClaimed}
          onOpenBackpack={() => setBook({ panel: "backpack", origin: null })}
        />

        <div className="desk-card-drop" aria-hidden>
          <span>松开</span>
          <b>放到桌面</b>
        </div>

        {book && (
          <DeskBook
            ref={bookRef}
            panel={book.panel}
            origin={book.origin}
            userId={user?.id ?? null}
            username={user?.username ?? null}
            publicId={user?.publicId ?? null}
            avatarUrl={user?.avatarUrl ?? null}
            essence={user?.essence ?? 0}
            coins={user?.coins ?? 0}
            hero={user?.hero ?? null}
            onSelect={(panel) => setBook((prev) => ({ panel, origin: prev?.origin ?? null }))}
            onClose={() => setBook(null)}
            onLogout={logout}
            onHeroClaimed={refreshUser}
          />
        )}
      </main>

      {opening && (
        <PackOpener
          key={opening.pack.id}
          cards={opening.cards}
          pool={opening.pool}
          origin={opening.rect}
          onDone={finishOpening}
          onQuick={quickFinishOpening}
          onDropCard={dropOpeningCard}
        />
      )}

      {lifted && (
        <DragGhost
          w={sizeOf(lifted.item).w}
          h={sizeOf(lifted.item).h}
          pointer={liftPointer}
          grab={lifted.grab}
          tilt={tiltOf(lifted.item.id)}
        >
          {renderItem(lifted.item)}
        </DragGhost>
      )}

      {collecting && (() => {
        const item = items.find((entry) => entry.id === collecting.id)
        if (!item) return null
        const size = sizeOf(item)
        return (
          <div ref={collectionRef} className="desk-collection" style={{
            left: collecting.viewportLeft,
            top: collecting.viewportTop,
            width: size.w, height: size.h,
          }}>
            <div className="desk-body">{renderItem(item)}</div>
          </div>
        )
      })()}

      {toast && (
        <div className="desk-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
