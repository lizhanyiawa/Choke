import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { CardFace } from "@/card/CardFace"

import { cardFromDesk } from "./cardFace"

import { DEAL_PRESS_MS, DeskObject, type DealButtonState } from "./DeskObject"
import { DeskDrawer, type DeskDrawerHandle } from "./DeskDrawer"
import { DeskBook, PANEL_IDS, type DeskBookHandle, type PanelId } from "./DeskBook"
import { DragGhost } from "./DragGhost"
import { fetchCard, toFace, type ApiUserCard } from "./api"
import {
  ALBUM_HOVER_EVENT,
  BACKPACK_HOVER_EVENT,
  DESK_ADD_CARDS_EVENT,
  DECK_ASSIGN_EVENT,
  DECK_HOVER_EVENT,
  PACKS_CHANGED_EVENT,
  CARD_POINTER_DROP_EVENT,
  type CardPointerDrop,
  type DeckAssignment,
  toDeskCard,
} from "./drag"
import { InviteLetter } from "./InviteLetter"
import { INVITE_OPEN_EVENT, readInviteStowed, saveInviteStowed } from "./invite"
import { OBJECT_META, type DeskObjectId } from "./objects"
import { placeDeskItems, randomNear, scatterPackCards, stagePosition } from "./placement"
import { POOL_META, RARITY_COLOR, SERVER_POOL } from "./rarity"
import { DEFAULT_SKIN } from "./skins"
import { publishDeskCardIds } from "./presence"
import { ITEM_INSET, ITEM_SIZE, newId, sizeOf, useDesk } from "./store"
import type { CardData, DeskItem, PackPool } from "./types"
import { PackArt } from "./opening/PackArt"
import { CARD_FLIGHT_MS, PACK_BURST_MS, TabletopCard, TabletopPackBurst } from "./opening/TabletopReveal"
import "./desk.css"

/** 卡牌域很重；桌面状态变化时复用同一张卡面。 */
const DeskCard = memo(function DeskCard({ card, hero }: { card: CardData; hero: ApiUserCard | null }) {
  return <CardFace card={card.isHero && hero ? toFace(hero) : cardFromDesk(card)} />
})

const DeskPack = memo(function DeskPack({ pool }: { pool: PackPool }) {
  return <div className="desk-pack"><PackArt pool={pool} /></div>
})


const POOL_KEY = "choke.pool"
const CARD_RELEASE_OFFSETS = [0, 47, 103, 154, 223]

interface OpenResponse {
  ok: boolean
  data?: {
    results: { cardId: string; userCardId: number; foil: boolean }[]
    pity: { before: number; after: number }
    packs?: Record<string, number>
  }
  error?: { code?: string; message?: string }
}

interface PackBurst {
  pack: DeskItem
  delay: number
}

interface DeskReveal {
  bursts: PackBurst[]
  flights: Map<string, PackBurst>
  zIndex: number
  duration: number
}

function deskCardId(item: DeskItem, heroId?: number) {
  if (!item.card || (item.card.isHero && heroId == null)) return undefined
  return item.card.userCardId ?? (item.card.isHero ? heroId : undefined)
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
function tiltOf({ id, tilt }: DeskItem) {
  if (typeof tilt === "number" && Number.isFinite(tilt)) return tilt
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ((h % 7) - 3) * 0.8
}

function animatePackDeal(element: HTMLDivElement, distance: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  element.animate({
    translate: [`0 ${-distance}px`, "0 7px", "0 0"],
    rotate: ["-4deg", "0.7deg", "0deg"],
    offset: [0, 0.86, 1],
    easing: ["cubic-bezier(.17,.55,.28,1)", "ease-out", "linear"],
  }, { duration: 460 })
}

/** 卡只能收进卡册，卡包只能放回纸盒 */
function acceptsDrop(target: DeskObjectId | undefined, item: DeskItem) {
  return (target === "album" && item.kind === "card") || (target === "backpack" && item.kind === "pack")
}

export function DeskPage() {
  const testAccount = (window as Window & {
    chokeDesktopTestAccount?: { enter?: string; exit?: string }
  }).chokeDesktopTestAccount
  const { items, move, front, spawn, remove, reset, stow, unstow } = useDesk()
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 1200, h: 700 })
  const [lifted, setLifted] = useState<{ item: DeskItem; grab: { u: number; v: number } } | null>(null)
  const liftPointer = useRef({ x: 0, y: 0 })
  const [settling, setSettling] = useState<string | null>(null)
  const [openingPacks, setOpeningPacks] = useState<DeskItem[]>([])
  const [reveal, setReveal] = useState<DeskReveal | null>(null)
  const [isDealing, setIsDealing] = useState(false)
  const dealingBusy = useRef(false)
  const pendingDeals = useRef(new Set<string>())
  const dealPressTimer = useRef<number | null>(null)
  const [pool, setPool] = useState<PackPool>(() => {
    const saved = localStorage.getItem(POOL_KEY) as PackPool | null
    return saved && Object.hasOwn(POOL_META, saved) ? saved : "normal"
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
  const quickLidTimer = useRef<number | null>(null)
  const [quickTargets, setQuickTargets] = useState<Record<string, { dx: number; dy: number; index: number }> | null>(null)
  const [returningPackIds, setReturningPackIds] = useState<ReadonlySet<string>>(() => new Set())
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
  const selectBook = useCallback((panel: PanelId | null, origin?: { x: number; y: number } | null) => {
    setBook((current) => panel ? { panel, origin: origin === undefined ? current?.origin ?? null : origin } : null)
    const url = new URL(window.location.href)
    if (panel) url.searchParams.set("panel", panel)
    else url.searchParams.delete("panel")
    window.history.replaceState(window.history.state, "", url)
  }, [])
  const focusSearch = useRef(false)
  const drawerRef = useRef<DeskDrawerHandle>(null)
  /** 抽屉里留给邀请函的位置；信收没收着由桌面持有，重置桌面时一起放回来 */
  const [inviteSlot, setInviteSlot] = useState<HTMLDivElement | null>(null)
  const [inviteStowed, setInviteStowed] = useState(readInviteStowed)
  const stowInvite = useCallback((stowed: boolean) => {
    saveInviteStowed(stowed)
    setInviteStowed(stowed)
  }, [])
  const collectTimer = useRef<number | null>(null)
  const quickTimer = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)
  const releasePointer = useRef<(() => void) | null>(null)
  const openingBusy = useRef(false)
  const userIdRef = useRef(user?.id)
  useLayoutEffect(() => { userIdRef.current = user?.id }, [user?.id])
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

  useEffect(() => {
    if (!reveal) return
    const timer = window.setTimeout(() => setReveal(null), reveal.duration)
    return () => window.clearTimeout(timer)
  }, [reveal])

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || openingPacks.length || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (event.key === "Escape" && reveal) {
        event.preventDefault()
        setReveal(null)
        return
      }
      if (reveal) return
      if (event.key === "F10" && !event.shiftKey) {
        event.preventDefault()
        if (!event.repeat) window.location.assign("/developer")
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault()
        const search = document.querySelector<HTMLInputElement>(".book input[data-client-search]:not([disabled])")
        if (search && !search.closest("[inert]")) { search.focus(); search.select() }
        else {
          focusSearch.current = true
          selectBook("codex")
        }
      }
    }
    window.addEventListener("keydown", shortcut)
    return () => window.removeEventListener("keydown", shortcut)
  }, [openingPacks.length, reveal, selectBook])

  useEffect(() => {
    if (book?.panel !== "codex" || !focusSearch.current) return
    focusSearch.current = false
    const frame = requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".book .codex-panel input[data-client-search]")?.focus())
    return () => cancelAnimationFrame(frame)
  }, [book?.panel])

  const onInviteClaimed = useCallback(() => {
    refreshUser()
    window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
  }, [refreshUser])

  const logout = () => {
    if (testAccount?.exit) {
      window.location.replace(testAccount.exit)
      return
    }
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
      releasePointer.current?.()
      for (const timer of [collectTimer, quickTimer, toastTimer, settleTimer, quickLidTimer, dealPressTimer]) {
        if (timer.current) window.clearTimeout(timer.current)
      }
    }
  }, [])

  const showToast = useCallback((text: string, duration = 1600) => {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), duration)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("login") !== "unavailable") return
    const frame = requestAnimationFrame(() => {
      url.searchParams.delete("login")
      window.history.replaceState(window.history.state, "", url)
      showToast("osu! 登录未配置", 4000)
    })
    return () => cancelAnimationFrame(frame)
  }, [showToast])

  const itemsRef = useRef(items)
  useLayoutEffect(() => {
    const before = itemsRef.current
    itemsRef.current = items
    if (before === items || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const existing = new Set(before.map(({ id }) => id))
    for (const item of items) {
      if (item.kind !== "card" || existing.has(item.id) || reveal?.flights.has(item.id)) continue
      const body = stageRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(item.id)}"] > .desk-body`)
      body?.animate([
        { translate: "8px -19px", scale: 1.05, opacity: 0 },
        { translate: "0 2px", scale: 0.987, opacity: 1, offset: 0.74 },
        { translate: "0 0", scale: 1, opacity: 1 },
      ], { duration: 240, easing: "cubic-bezier(.2,.8,.28,1)" })
    }
  }, [items, reveal])

  const heroId = user?.hero?.userCardId
  useEffect(() => {
    const ids = items.flatMap((item) => {
      const id = deskCardId(item, heroId)
      return id == null ? [] : [id]
    })
    publishDeskCardIds(ids)
  }, [items, heroId])

  const spawnCards = useCallback(
    (cards: CardData[], clientX?: number, clientY?: number) => {
      if (!cards.length) return
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const near = clientX != null && clientY != null
        ? { x: clientX - rect.left, y: clientY - rect.top }
        : randomNear({ x: rect.width * .43, y: rect.height * .44 }, rect.width * .12, rect.height * .10)
      const placements = cards.map((card) => ({ id: newId("card"), kind: "card" as const, card, near }))
      spawn((current) => {
        const existing = new Set(current.map((item) => deskCardId(item, heroId)))
        const fresh = placements.filter(({ card }) => {
          if (card.userCardId == null) return true
          if (existing.has(card.userCardId)) return false
          existing.add(card.userCardId)
          return true
        })
        return placeDeskItems(fresh, current.filter((item) => !item.card?.isHero || heroId != null),
          { w: rect.width, h: rect.height })
      })
    },
    [heroId, spawn],
  )

  useEffect(() => {
    const onAddCards = (event: Event) => {
      const cards = (event as CustomEvent<CardData[]>).detail
      if (!Array.isArray(cards) || cards.length === 0) return
      spawnCards(cards)
    }
    window.addEventListener(DESK_ADD_CARDS_EVENT, onAddCards)
    return () => window.removeEventListener(DESK_ADD_CARDS_EVENT, onAddCards)
  }, [spawnCards])

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

  // 收进抽屉的物件不在桌上：飞向它们的东西改落进抽屉
  const album = items.find((it) => it.object === "album" && !it.stowed)
  const backpack = items.find((it) => it.object === "backpack" && !it.stowed)

  /** 卡册 / 纸盒收在抽屉里时的落点：抽屉开着是它那一格，合着是抽屉面 */
  const drawerSlot = (object: DeskObjectId, size: { w: number; h: number }): FlightSlot | null => {
    const box = drawerRef.current?.targetRect(object)
    const stage = stageRef.current?.getBoundingClientRect()
    if (!box || !stage) return null
    return {
      left: box.left - stage.left + box.width / 2 - size.w / 2,
      top: box.top - stage.top + box.height / 2 - size.h / 2,
    }
  }

  /** 卡飞进活页夹中心时的左上角 */
  const albumSlot = (): FlightSlot | null => {
    if (!album) return drawerSlot("album", ITEM_SIZE.card)
    const size = OBJECT_META.album
    return {
      left: album.x * stageSize.w + size.w / 2 - ITEM_SIZE.card.w / 2,
      top: album.y * stageSize.h + size.h / 2 - ITEM_SIZE.card.h / 2,
    }
  }

  /** 卡包飞进卡盒翻盖下沿时的左上角（翻盖高度见 desk-objects.css 的 .obj-box__lid） */
  const backpackSlot = (): FlightSlot | null => {
    if (!backpack) return drawerSlot("backpack", ITEM_SIZE.pack)
    const size = OBJECT_META.backpack
    return {
      left: backpack.x * stageSize.w + size.w / 2 - ITEM_SIZE.pack.w / 2,
      top: backpack.y * stageSize.h + size.h * 0.46 - ITEM_SIZE.pack.h / 2,
    }
  }

  /** 东西落进 receiver：翻盖扣回去（过冲），物件被砸得一沉再弹回；receiver 收在抽屉里就是抽屉弹一下 */
  const land = (receiver: DeskObjectId) => {
    setAwaiting((current) => current === receiver ? null : current)
    const object = stageRef.current?.querySelector<HTMLElement>(`.desk-item[data-object="${receiver}"]:not(.is-stowed) > .desk-body`)
    if (!object) {
      drawerRef.current?.bump()
      return
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    object.animate([
      { scale: 1, translate: "0 0" },
      { scale: 0.978, translate: "0 3px", offset: 0.25 },
      { scale: 1.025, translate: "0 -1px", offset: 0.57 },
      { scale: 1, translate: "0 0" },
    ], { duration: 430, easing: "cubic-bezier(.3,.7,.4,1)" })
  }

  /**
   * 从松手的位置缩小飞到 slot。已领出的卡包等服务端确认归还再移除。
   * 返回的 Promise 在落地时完成；receiver 是接住它的桌面物件：起飞时先掀开翻盖，落地时扣回并弹一下。
   */
  const flyInto = (item: DeskItem, source: FlightSource, slot: FlightSlot, receiver?: DeskObjectId, onLand?: () => void) =>
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
        if (onLand) onLand()
        else if (!item.token) remove(item.id)
        setCollecting((current) => (current?.id === item.id ? null : current))
        if (receiver) land(receiver)
        resolve()
      }
      flightDone.current = done
      collectTimer.current = window.setTimeout(done, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 430)
    })

  const collectCard = (item: DeskItem, source: FlightSource, destination = albumSlot()) => {
    if (!destination) return
    void flyInto(item, source, destination, "album").then(() => showToast("已收入卡册"))
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
            | { ok: boolean; data?: { packs: Record<string, number> }; error?: { code?: string } }
            | null,
      )
      .catch(() => null)

  /** 快速收卡：卡飞进卡册，卡包飞进卡盒并还给背包 */
  const quickCollectAll = () => {
    const cardSlot = albumSlot()
    const packSlot = backpackSlot()
    const cards = cardSlot ? items.filter((it) => it.kind === "card" && (!it.card?.isHero || heroId != null)) : []
    const packs = packSlot ? items.filter((it) => it.kind === "pack" && !returningPackIds.has(it.id)) : []
    const flying = [...cards, ...packs]
    if (!flying.length) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setQuickTargets(Object.fromEntries(flying.map((it, index) => {
      const slot = (it.kind === "pack" ? packSlot : cardSlot)!
      const position = stagePosition(it, stageSize.w, stageSize.h)
      const x = slot.left - position.left
      const y = slot.top - position.top
      const angle = tiltOf(it) * Math.PI / 180
      return [it.id, { dx: x * Math.cos(angle) + y * Math.sin(angle), dy: y * Math.cos(angle) - x * Math.sin(angle), index }]
    })))
    if (packs.length) {
      // 第一个卡包起飞时掀开翻盖（卡包排在卡后面起飞），全部落地时扣回
      if (quickLidTimer.current) window.clearTimeout(quickLidTimer.current)
      if (!reduced) quickLidTimer.current = window.setTimeout(() => setAwaiting("backpack"), cards.length * 24)
    }
    if (quickTimer.current) window.clearTimeout(quickTimer.current)
    quickTimer.current = window.setTimeout(async () => {
      // 有 token 的卡包留到服务端确认归还后再删除，避免未登录或请求失败丢失凭证。
      flying.filter((it) => it.kind !== "pack" || !it.token).forEach((it) => remove(it.id))
      if (cards.length) land("album")
      if (packs.length) land("backpack")
      const parts: string[] = []
      if (cards.length) parts.push(`${cards.length} 张卡收入卡册`)
      if (!packs.length) {
        setQuickTargets(null)
        showToast(parts.join("，"))
        return
      }
      const userId = user?.id
      const results = await Promise.all(
        packs.map((pack) => (pack.token ? (userId ? postPackReturn(userId, pack.token) : Promise.resolve(null)) : Promise.resolve(undefined))),
      )
      const failed = packs.filter((_, index) => {
        const result = results[index]
        return result === null || (result && !(result.ok && result.data) && result.error?.code !== "invalid_token")
      })
      packs.filter((pack) => !failed.includes(pack)).forEach((pack) => remove(pack.id))
      setQuickTargets(null)
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
    }, reduced ? 0 : 440 + flying.length * 24)
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

  const spawnPack = async (selected: PackPool, userId: string) => {
    if (dealingBusy.current || openingBusy.current || userIdRef.current !== userId) return
    const meta = POOL_META[selected]
    dealingBusy.current = true
    setIsDealing(true)
    try {
      const res = await fetch(
        `/api/users/${userId}/packs/${SERVER_POOL[selected]}/take`,
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
      if (userIdRef.current !== userId) return
      setPackState({ userId, data: payload.data.packs })
      const id = newId("pack")
      const stage = stageRef.current
      const size = { w: stage?.clientWidth || stageSize.w, h: stage?.clientHeight || stageSize.h }
      const near = randomNear({ x: size.w * .5, y: size.h * .38 }, size.w * .18, size.h * .13)
      const { token } = payload.data
      pendingDeals.current.add(id)
      spawn((current) => placeDeskItems([{ id, kind: "pack", pool: selected, token, near }],
        current.filter((item) => !item.card?.isHero || heroId != null), size))
      window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
    } catch {
      showToast("发卡包失败")
    } finally {
      dealingBusy.current = false
      setIsDealing(false)
    }
  }

  /**
   * 请求和飞行动画同时进行，归还失败时让卡包重新显现在原处。
   */
  const returnPack = async (
    item: DeskItem,
    flight?: { source: FlightSource; slot: FlightSlot; receiver?: DeskObjectId },
  ) => {
    if (item.token && !user) {
      showToast("请先登录，卡包留在桌面")
      return
    }
    if (returningPackIds.has(item.id)) return
    if (item.token) setReturningPackIds((current) => new Set(current).add(item.id))
    const landed = flight ? flyInto(item, flight.source, flight.slot, flight.receiver) : Promise.resolve()

    // 本地原型卡包没有预扣库存，可以直接收走。
    if (!item.token) {
      if (flight) await landed
      else remove(item.id)
      refreshPacks()
      showToast("卡包已从桌面收回")
      return
    }

    const userId = user!.id
    const request = postPackReturn(userId, item.token)

    const [payload] = await Promise.all([request, landed])
    setReturningPackIds((current) => {
      const next = new Set(current)
      next.delete(item.id)
      return next
    })
    if (payload?.ok && payload.data) {
      remove(item.id)
      setPackState({ userId, data: payload.data.packs })
      window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
      showToast("卡包已放回背包")
      return
    }
    if (payload?.error?.code === "invalid_token") {
      remove(item.id)
      refreshPacks()
      showToast("卡包已从桌面收回")
      return
    }
    refreshPacks()
    showToast("放回失败，卡包留在桌面")
  }

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, item: DeskItem, allowTap = true) => {
    if (e.button !== 0 || !e.isPrimary || releasePointer.current || openingBusy.current || reveal) return
    const stage = stageRef.current
    if (!stage) return
    const handle = e.currentTarget
    const pointerId = e.pointerId
    e.preventDefault()
    handle.setPointerCapture(pointerId)
    handle.dataset.held = ""
    const rect = stage.getBoundingClientRect()
    const size = sizeOf(item)
    // 从抽屉里拿出来：按原尺寸抓在物件正中
    const fromDrawer = !!item.stowed
    const position = stagePosition(item, rect.width, rect.height)
    const originX = fromDrawer
      ? Math.min(Math.max(e.clientX - rect.left - size.w / 2, 0), rect.width - size.w)
      : position.left
    const originY = fromDrawer
      ? Math.min(Math.max(e.clientY - rect.top - size.h / 2, 0), rect.height - size.h)
      : position.top
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
    /** 抽屉收得下它：桌上的物件收进去；卡册 / 纸盒在抽屉里时，卡和卡包也算收进它们 */
    const stowedIds = new Set(itemsRef.current.flatMap((it) => (it.stowed && it.object ? [it.object] : [])))
    const drawerTakes =
      item.kind === "object" ? !fromDrawer : stowedIds.has(item.kind === "card" ? "album" : "backpack")
    let overDrawer = false
    let drawerHot = false
    let drawerTimer = 0

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
      // 抽屉压在物件层上面：指在抽屉上时不算悬在底下的桌面物件
      overDrawer = !!elements[0]?.closest(".desk-drawer")
      if (overDrawer) hovered = undefined
      const hot = overDrawer && drawerTakes
      if (hot !== drawerHot) {
        drawerHot = hot
        drawerRef.current?.hint(hot)
      }
      // 拖着物件停在合着的抽屉面上一会儿：抽屉自己拉开
      const onFront = hot && item.kind === "object" && !!elements[0]?.closest(".desk-drawer__front")
      if (onFront && !drawerRef.current?.isOpen()) {
        if (!drawerTimer) drawerTimer = window.setTimeout(() => drawerRef.current?.open(), 450)
      } else if (drawerTimer) {
        window.clearTimeout(drawerTimer)
        drawerTimer = 0
      }
      const next = acceptsDrop(hovered, item) ? hovered : undefined
      if (next !== target) {
        target = next
        setDropTarget(next ?? null)
      }
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return
      if (!moved) {
        moved = true
        liftPointer.current = { x: rect.left + originX, y: rect.top + originY }
        setLifted({ item, grab })
      }
      nx = Math.min(Math.max(originX + dx, 0), Math.max(0, rect.width - size.w))
      ny = Math.min(Math.max(originY + dy, 0), Math.max(0, rect.height - size.h))
      liftPointer.current = { x: rect.left + nx, y: rect.top + ny }

      hitX = ev.clientX
      hitY = ev.clientY
      if (!hitFrame) hitFrame = requestAnimationFrame(updateTarget)
    }
    const release = () => {
      releasePointer.current = null
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onCancel)
      window.removeEventListener("blur", cancelDrag)
      window.removeEventListener("keydown", onDragKey, true)
      handle.removeEventListener("lostpointercapture", onCancel)
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
      delete handle.dataset.held
      if (hitFrame) cancelAnimationFrame(hitFrame)
      if (drawerTimer) window.clearTimeout(drawerTimer)
      if (drawerHot) drawerRef.current?.hint(false)
      if (deckSlot != null) window.dispatchEvent(new CustomEvent(DECK_HOVER_EVENT, { detail: null }))
      if (albumPanelHover) window.dispatchEvent(new CustomEvent(ALBUM_HOVER_EVENT, { detail: false }))
      if (backpackPanelHover) window.dispatchEvent(new CustomEvent(BACKPACK_HOVER_EVENT, { detail: false }))
    }
    const cancelDrag = () => {
      release()
      setLifted(null)
      setDropTarget(null)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) cancelDrag()
    }
    const onDragKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !moved) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      cancelDrag()
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      onMove(ev)
      if (hitFrame) cancelAnimationFrame(hitFrame)
      if (moved) updateTarget()
      const ghost = document.querySelector<HTMLElement>(".desk-ghost__body")
      const pose = ghost ? getComputedStyle(ghost) : null
      const source = {
        left: nx, top: ny,
        viewportLeft: rect.left + nx, viewportTop: rect.top + ny,
        transform: pose?.transform ?? `rotate(${tiltOf(item)}deg)`,
        transformOrigin: pose?.transformOrigin ?? "50% 50%",
      }
      cancelDrag()
      if (!moved) {
        if (allowTap) onTap(item)
        return
      }
      if (drawerHot) {
        if (item.kind === "object" && item.object) {
          const object = item.object
          const slot = drawerSlot(object, size)
          const putAway = () => {
            stow(item.id)
            drawerRef.current?.bump()
            showToast(`${OBJECT_META[object].thing}收进了抽屉`)
          }
          if (slot) void flyInto(item, source, { ...slot, scale: 0.24 }, undefined, putAway)
          else putAway()
        } else if (item.kind === "card") {
          collectCard(item, source)
        } else {
          const slot = backpackSlot()
          void returnPack(item, slot ? { source, slot, receiver: "backpack" } : undefined)
        }
        return
      }
      // 从抽屉里拿起又放回抽屉上：原样收着
      if (fromDrawer && overDrawer) return
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
        const slot = deckSlot
        const cell = stage.querySelector<HTMLElement>(`.book__panel.is-active .book__spread:not([data-preload]) .deck-slot[data-slot="${slot}"]`)
        window.dispatchEvent(new CustomEvent<DeckAssignment>(DECK_ASSIGN_EVENT, {
          detail: {
            userCardId: assignId,
            slot,
            onSaved: () => {
              const destination = cell?.isConnected && !cell.closest("[inert]") ? cell.getBoundingClientRect() : null
              if (destination) {
                void flyInto(item, source, {
                  left: destination.left + (destination.width - size.w) / 2 - rect.left,
                  top: destination.top + (destination.height - size.h) / 2 - rect.top,
                  scale: Math.min(destination.width / size.w, destination.height / size.h),
                })
              } else remove(item.id)
              showToast(`已放入卡组第 ${slot + 1} 槽`)
            },
          },
        }))
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
      // 落桌：轻轻弹一下，影子收紧；从抽屉里拖出来的就落在松手的地方
      if (fromDrawer) unstow(item.id, nx / rect.width, ny / rect.height)
      else move(item.id, nx / rect.width, ny / rect.height)
      setSettling(item.id)
      if (settleTimer.current) window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => setSettling(null), 460)
    }
    releasePointer.current = release
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
    window.addEventListener("blur", cancelDrag)
    window.addEventListener("keydown", onDragKey, true)
    handle.addEventListener("lostpointercapture", onCancel)
  }

  const openBook = (panel: PanelId, item: DeskItem) => {
    const stage = stageRef.current
    const size = sizeOf(item)
    const rect = stage?.getBoundingClientRect()
    // 收在抽屉里的物件从它那一格翻开
    const cell = item.stowed && item.object ? drawerRef.current?.targetRect(item.object) : null
    selectBook(panel, cell
        ? { x: cell.left + cell.width / 2, y: cell.top + cell.height / 2 }
        : rect
          ? { x: rect.left + item.x * rect.width + size.w / 2, y: rect.top + item.y * rect.height + size.h / 2 }
          : null)
  }

  const openDeskPacks = async (packs: DeskItem[]) => {
    if (!packs.length || dealPressTimer.current != null || dealingBusy.current || openingBusy.current || reveal || quickTargets || collecting) return
    if (!user) {
      showToast("请先登录")
      return
    }

    openingBusy.current = true
    setToast(null)
    setOpeningPacks(packs)
    try {
      const opened: { pack: DeskItem; results: NonNullable<OpenResponse["data"]>["results"] }[] = []
      let inventory: Record<string, number> | undefined
      let failure: string | undefined

      for (const pack of packs) {
        const packPool = pack.pool ?? "normal"
        try {
          const res = await fetch(`/api/packs/${SERVER_POOL[packPool]}/open`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ count: 5, token: pack.token }),
          })
          const payload = (await res.json()) as OpenResponse
          if (!res.ok || !payload.ok || !payload.data) {
            const code = payload.error?.code
            if (code === "no_packs" || code === "invalid_token") {
              remove(pack.id)
              failure ??= "失效的桌面卡包已移除"
            } else {
              // 开包失败后服务端把卡包退回背包，原有 token 已经用掉。
              if (code === "open_failed" && pack.token) remove(pack.id)
              failure ??= payload.error?.message ?? "开包失败"
            }
            continue
          }

          remove(pack.id)
          opened.push({ pack, results: payload.data.results })
          inventory = payload.data.packs ?? inventory
        } catch {
          // 旧存档没有 token，请求未确认时移除桌面占位，避免再次扣库存。
          if (!pack.token) remove(pack.id)
          failure = "开包请求中断，可在卡册确认已获得的卡牌"
          break
        }
      }

      if (inventory) setPackState({ userId: user.id, data: inventory })
      window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
      if (!opened.length) {
        showToast(failure ?? "开包失败")
        return
      }

      const definitions = new Map<string, ReturnType<typeof fetchCard>>()
      const bursts = opened.map(({ pack }, index) => ({ pack, delay: Math.min(560, index * 140) }))
      const pulls = opened.flatMap(({ pack, results }, packIndex) =>
        results.map((result, index) => ({
          pack,
          result,
          delay: bursts[packIndex].delay + 235 + (CARD_RELEASE_OFFSETS[index] ?? index * 54),
        })),
      )
      const loaded = await Promise.allSettled(
        pulls.map(async ({ pack, result, delay }) => {
          let definition = definitions.get(result.cardId)
          if (!definition) {
            definition = fetchCard(result.cardId)
            definitions.set(result.cardId, definition)
          }
          const face = toFace({ ...(await definition), foil: result.foil })
          return { pack, delay, card: toDeskCard(face, result.userCardId) }
        }),
      )
      const cards = loaded.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
      if (userIdRef.current !== user.id) return
      if (!cards.length) {
        showToast(`已开启 ${opened.length} 包，可在卡册查看获得的卡牌`)
        return
      }

      const notices = []
      if (failure) notices.push(`有 ${packs.length - opened.length} 包未取得结果。${failure}。`)
      if (cards.length < pulls.length) {
        notices.push(`另有 ${pulls.length - cards.length} 张卡可在卡册查看。`)
      }
      if (notices.length) showToast(notices.join(" "), 4000)

      const stage = stageRef.current
      const size = { w: stage?.clientWidth || stageSize.w, h: stage?.clientHeight || stageSize.h }
      const openedIds = new Set(opened.map(({ pack }) => pack.id))
      const occupied = itemsRef.current.filter((item) => !openedIds.has(item.id) && (!item.card?.isHero || heroId != null))
      const burstZ = Math.max(0, ...itemsRef.current.map((item) => item.z)) + 1
      const cardsByPack = new Map<string, typeof cards>()
      for (const pull of cards) {
        const group = cardsByPack.get(pull.pack.id)
        if (group) group.push(pull)
        else cardsByPack.set(pull.pack.id, [pull])
      }
      const flights = new Map<string, PackBurst>()
      const landed: DeskItem[] = []
      for (const group of cardsByPack.values()) {
        const pack = group[0].pack
        const spill = scatterPackCards(group.map(({ card }) => card), pack, occupied, size, burstZ + 1 + landed.length)
        spill.forEach((item, index) => flights.set(item.id, { pack, delay: group[index].delay }))
        landed.push(...spill)
        occupied.push(...spill)
      }
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const duration = Math.max(
          ...bursts.map(({ delay }) => delay + PACK_BURST_MS),
          ...cards.map(({ delay }) => delay + CARD_FLIGHT_MS),
        )
        setReveal({ bursts, flights, duration, zIndex: burstZ })
      }
      spawn(landed)
    } finally {
      openingBusy.current = false
      setOpeningPacks([])
    }
  }

  const packCounts = packState && packState.userId === user?.id ? packState.data : undefined
  const deskBusy = pressing || isDealing || openingPacks.length > 0 || !!reveal || !!quickTargets || !!collecting || !!lifted
  const poolEmpty = !!user && (packCounts?.[SERVER_POOL[pool]] ?? 0) <= 0
  const dealDisabled = !userReady || deskBusy || poolEmpty
  const beginDeal = () => {
    if (dealDisabled || dealPressTimer.current != null || dealingBusy.current || openingBusy.current) return
    if (!user) {
      selectBook("account")
      return
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void spawnPack(pool, user.id)
      return
    }
    setPressing(true)
    dealPressTimer.current = window.setTimeout(() => {
      dealPressTimer.current = null
      setPressing(false)
      void spawnPack(pool, user.id)
    }, DEAL_PRESS_MS)
  }

  const onTap = (item: DeskItem) => {
    if (item.kind === "object" && item.object) {
      if (item.object === "button") beginDeal()
      else openBook(item.object, item)
      return
    }
    if (item.kind === "pack" && !returningPackIds.has(item.id)) void openDeskPacks([item])
  }

  const openingIds = new Set(openingPacks.map(({ id }) => id))
  const visibleItems = [...items.filter((item) => !openingIds.has(item.id)), ...openingPacks]
    .filter((item) => !item.card?.isHero || heroId != null)
  const stowedItems = items.filter((item) => item.stowed)
  const deskPacks = visibleItems.filter((item) => item.kind === "pack" && !returningPackIds.has(item.id))
  const deal: DealButtonState = {
    pool,
    empty: poolEmpty,
    disabled: dealDisabled,
    pressing,
    onPool: setPool,
    onActivate: beginDeal,
  }

  const renderItem = (item: DeskItem) => {
    if (item.kind === "object" && item.object) {
      return (
        <DeskObject
          id={item.object}
          username={user?.username ?? null}
          avatarUrl={user?.avatarUrl ?? null}
          dropping={dropTarget === item.object}
          open={book?.panel === item.object}
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
            {!user && testAccount?.enter && <a className="desk-button" href={testAccount.enter}>测试账号登录</a>}
            {deskPacks.length > 1 && (
              <button type="button" className="desk-button desk-button--open" disabled={!user || deskBusy}
                onClick={() => void openDeskPacks(deskPacks)}>
                开启所有
              </button>
            )}
            {reveal && (
              <button type="button" className="desk-button" onClick={() => setReveal(null)}>跳过动画</button>
            )}
            <button
              type="button"
              className="desk-button"
              onClick={quickCollectAll}
              disabled={deskBusy || (deskPacks.length === 0 && !visibleItems.some((it) => it.kind === "card"))}
            >
              快速收卡
            </button>
            <button
              type="button"
              className="desk-button"
              disabled={deskBusy}
              onClick={() => {
                reset()
                stowInvite(false)
              }}
            >
              重置布局
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
          // React portal 仍会冒泡到这里，只处理真正位于桌面 DOM 内的空白。
          if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return
          if (event.target.closest(".desk-item, .book, .desk-drawer, .invite-env, .invite-modal")) return
          bookRef.current?.close()
          drawerRef.current?.close()
        }}
      >
        <div className="desk-layer">
          {visibleItems.map((item, index) => {
            const isDealer = item.object === "button"
            const size = sizeOf(item)
            const position = stagePosition(item, stageSize.w, stageSize.h)
            const isCollecting = collecting?.id === item.id
            const isReturning = returningPackIds.has(item.id)
            const quickTarget = quickTargets?.[item.id]
            const flying = isCollecting || !!quickTarget
            const dealX = stageSize.w / 2 - (position.left + size.w / 2)
            const tilt = tiltOf(item)
            const angle = tilt * Math.PI / 180
            const flight = reveal?.flights.get(item.id)
            const launch = flight && stagePosition(flight.pack, stageSize.w, stageSize.h)
            const dx = launch ? launch.left + ITEM_SIZE.pack.w / 2 - position.left - size.w / 2 : 0
            const dy = launch ? launch.top + ITEM_SIZE.pack.h * .15 - position.top - size.h / 2 : 0
            const card = item.card
            const motion = flight && launch ? {
              x: dx * Math.cos(angle) + dy * Math.sin(angle),
              y: dy * Math.cos(angle) - dx * Math.sin(angle),
              rise: Math.min(72, 25 + Math.hypot(dx, dy) * .25, Math.max(8, launch.top - 16)),
              delay: flight.delay,
              shine: card && (card.foil || card.rarity === "Radiant" || card.rarity === "Prismatic")
                ? RARITY_COLOR[card.rarity] : undefined,
            } : undefined
            const style = {
              left: isCollecting ? collecting.left : position.left,
              top: isCollecting ? collecting.top : position.top,
              width: size.w,
              height: size.h,
              zIndex: flying ? 100000 : item.z,
              transform: isCollecting ? "none" : `rotate(${tilt}deg)`,
              pointerEvents: flying || !!motion || openingIds.has(item.id) ? "none" : undefined,
              "--deal-x": `${dealX}px`,
              animationDelay: `${index * 40}ms`,
            } as CSSProperties
            const classes = [
              "desk-item",
              item.kind !== "object" && "desk-item--loose",
              openingIds.has(item.id) && "is-priming",
              (lifted?.item.id === item.id || isCollecting) && "is-lifted",
              isReturning && "is-returning",
              item.stowed && "is-stowed",
              settling === item.id && "is-settling",
              flying && "is-collecting",
              awaiting != null && awaiting === item.object && "is-opening",
            ]
              .filter(Boolean)
              .join(" ")
            return (
              <div
                key={item.id}
                ref={item.kind === "pack" ? (node) => {
                  if (node && pendingDeals.current.delete(item.id)) {
                    animatePackDeal(node, position.top + size.h + ITEM_INSET)
                  }
                } : undefined}
                className={classes}
                style={style}
                data-id={item.id}
                data-kind={item.kind}
                data-object={item.object}
                onPointerDown={(e) => {
                  if (flying || item.stowed || isReturning) return
                  const button = isDealer && e.target instanceof Element
                    ? e.target.closest<HTMLButtonElement>(".obj-deal__button")
                    : null
                  if (button && e.button === 0) button.focus({ preventScroll: true })
                  startDrag(e, item, !isDealer || !!button)
                }}
                tabIndex={!isDealer && !item.stowed && !flying && !isReturning && item.kind !== "card" ? 0 : undefined}
                onKeyDown={(event) => {
                  if (isDealer || event.target !== event.currentTarget || item.stowed || flying || event.repeat) return
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  void onTap(item)
                }}
                role={isDealer || item.kind === "card" ? "group" : "button"}
                aria-label={isDealer ? "发包装置" : labelOf(item)}
                aria-hidden={item.stowed || undefined}
              >
                {/* 收进抽屉的物件留着空壳不卸载，拖回桌面时不会再播一遍落桌动画；物件本身画在抽屉里 */}
                <div className="desk-body">
                  {item.stowed ? null : item.kind === "card"
                    ? <TabletopCard motion={motion}>{renderItem(item)}</TabletopCard>
                    : renderItem(item)}
                </div>
              </div>
            )
          })}
          {reveal?.bursts.map(({ pack, delay }) => (
            <TabletopPackBurst
              key={pack.id}
              position={stagePosition(pack, stageSize.w, stageSize.h)}
              pool={pack.pool ?? "normal"}
              tilt={tiltOf(pack)}
              delay={delay}
              zIndex={reveal.zIndex}
            />
          ))}
        </div>

        <DeskDrawer
          ref={drawerRef}
          items={stowedItems}
          liftedId={lifted?.item.id ?? null}
          render={renderItem}
          onItemPointerDown={startDrag}
          onActivate={onTap}
          extra={inviteStowed ? 1 : 0}
          slotRef={setInviteSlot}
        />

        <InviteLetter
          user={user ? { username: user.username, onboarded: user.onboarded } : null}
          ready={userReady}
          stageSize={stageSize}
          stageRef={stageRef}
          onToast={showToast}
          onClaimed={onInviteClaimed}
          onOpenBackpack={() => selectBook("backpack", null)}
          stowed={inviteStowed}
          onStow={stowInvite}
          drawer={drawerRef}
          drawerSlot={inviteSlot}
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
            pool={pool}
            packCounts={packCounts}
            onPool={setPool}
            onCollectFromDesk={(userCardId) => {
              items.filter((item) => deskCardId(item, heroId) === userCardId).forEach((item) => remove(item.id))
            }}
            testLoginHref={testAccount?.enter}
            testExitHref={testAccount?.exit}
            onSelect={selectBook}
            onClose={() => selectBook(null)}
            onLogout={logout}
            onHeroClaimed={refreshUser}
          />
        )}
      </main>

      {lifted && (
        <DragGhost
          w={sizeOf(lifted.item).w}
          h={sizeOf(lifted.item).h}
          pointer={liftPointer}
          grab={lifted.grab}
          tilt={tiltOf(lifted.item)}
        >
          {renderItem(lifted.item)}
        </DragGhost>
      )}

      {collecting && (() => {
        const item = items.find((entry) => entry.id === collecting.id)
        if (!item) return null
        const size = sizeOf(item)
        return (
          <div ref={collectionRef} className="desk-collection" aria-hidden inert style={{
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
