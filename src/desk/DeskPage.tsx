import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { CardFace } from "@/card/CardFace"

import { cardFromDesk } from "./cardFace"
import { CommandPanel, type PanelId, type PanelRequest } from "./CommandPanel"
import { toFace, type ApiUserCard } from "./api"
import {
  ALBUM_HOVER_EVENT,
  BACKPACK_HOVER_EVENT,
  CARD_MIME,
  DESK_ADD_CARDS_EVENT,
  DESK_ITEMS_EVENT,
  DECK_ASSIGN_EVENT,
  DECK_HOVER_EVENT,
  PACKS_CHANGED_EVENT,
  USER_CARD_MIME,
  readCardDrag,
  readUserCardDrag,
} from "./drag"
import { POOL_META, POOL_ORDER } from "./rarity"
import { DEFAULT_SKIN } from "./skins"
import { SidePanel } from "./SidePanel"
import { cardsToItems, ITEM_SIZE, newId, useDesk } from "./store"
import type { CardData, DeskItem, PackPool, Rarity } from "./types"
import { Pack2D } from "./opening/Pack2D"
import { Pack3D, type OriginRect } from "./opening/Pack3D"
import "./desk.css"

const QUALITY_KEY = "choke.quality"
const POOL_KEY = "choke.pool"
type Quality = "3d" | "light"

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

let webglSupport: boolean | null = null
function hasWebGL() {
  if (webglSupport !== null) return webglSupport
  try {
    const c = document.createElement("canvas")
    webglSupport = !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    webglSupport = false
  }
  return webglSupport
}

/** 每个物件一个轻微的固定角度，让桌面看起来是随手摆放的 */
function tiltOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ((h % 7) - 3) * 0.8
}

export function DeskPage() {
  const { items, move, front, spawn, consumePack, collect, reset } = useDesk()
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 1200, h: 700 })
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragGhost, setDragGhost] = useState<{
    item: DeskItem
    x: number
    y: number
  } | null>(null)
  const [opening, setOpening] = useState<{ pack: DeskItem; cards: CardData[]; pool: PackPool; rect?: OriginRect } | null>(null)
  const [pool, setPool] = useState<PackPool>(() => {
    const saved = localStorage.getItem(POOL_KEY) as PackPool | null
    return saved && saved in POOL_META ? saved : "normal"
  })
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [collecting, setCollecting] = useState<{ id: string; left: number; top: number } | null>(null)
  const [quickTargets, setQuickTargets] = useState<Record<string, { left: number; top: number }> | null>(null)
  const [albumPulse, setAlbumPulse] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [user, setUser] = useState<{
    id: string
    username: string
    publicId: number | null
    avatarUrl: string | null
    essence: number
    coins: number
    hero: ApiUserCard | null
  } | null>(null)
  const [packState, setPackState] = useState<{
    userId: string
    data: Record<string, number>
  } | null>(null)
  const [panelRequest, setPanelRequest] = useState<PanelRequest | null>(null)
  const [panelEpoch, setPanelEpoch] = useState(0)
  const [deskClosed, setDeskClosed] = useState(false)
  const [deskDropActive, setDeskDropActive] = useState(false)
  const dropRef = useRef<string | null>(null)
  const collectTimer = useRef<number | null>(null)
  const quickTimer = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)
  const openingBusy = useRef(false)
  const [quality, setQuality] = useState<Quality>(() => {
    const saved = localStorage.getItem(QUALITY_KEY)
    return saved === "light" ? "light" : "3d"
  })

  useEffect(() => {
    localStorage.setItem(QUALITY_KEY, quality)
  }, [quality])

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
          })
        else setUser(null)
      })
      .catch(() => {})
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

  const logout = () => {
    fetch("/auth/logout", { method: "POST", credentials: "include" })
      .catch(() => {})
      .finally(() => setUser(null))
  }

  const requestPanel = (id: PanelId) => {
    setDeskClosed(false)
    setPanelRequest((prev) => ({ id, n: (prev?.n ?? 0) + 1 }))
  }

  const closeDrawer = () => {
    setDeskClosed(true)
    setPanelEpoch((value) => value + 1)
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

  const useWebGL = quality === "3d" && hasWebGL()

  useEffect(() => {
    return () => {
      if (collectTimer.current) window.clearTimeout(collectTimer.current)
      if (quickTimer.current) window.clearTimeout(quickTimer.current)
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
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
    window.dispatchEvent(new CustomEvent(DESK_ITEMS_EVENT, { detail: ids }))
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
      const originX = clientX == null ? rect.width * 0.12 : clientX - rect.left
      const originY = clientY == null ? rect.height * 0.32 : clientY - rect.top
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

  const collectCard = (item: DeskItem, album: DeskItem) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const cardSize = ITEM_SIZE.card
    const albumSize = ITEM_SIZE.album
    setDropTarget(null)
    setAlbumPulse(true)
    setCollecting({
      id: item.id,
      left: album.x * rect.width + albumSize.w / 2 - cardSize.w / 2,
      top: album.y * rect.height + albumSize.h / 2 - cardSize.h / 2,
    })
    if (collectTimer.current) window.clearTimeout(collectTimer.current)
    collectTimer.current = window.setTimeout(() => {
      collect(item.id)
      setCollecting(null)
      setAlbumPulse(false)
      showToast("已收入卡册")
    }, 430)
  }

  const quickCollectAll = () => {
    const stage = stageRef.current
    const album = items.find((it) => it.kind === "album")
    const cards = items.filter((it) => it.kind === "card" && !it.card?.isHero)
    if (!stage || !album || !cards.length) return
    const rect = stage.getBoundingClientRect()
    const left = album.x * rect.width + ITEM_SIZE.album.w / 2 - ITEM_SIZE.card.w / 2
    const top = album.y * rect.height + ITEM_SIZE.album.h / 2 - ITEM_SIZE.card.h / 2
    const targets: Record<string, { left: number; top: number }> = {}
    cards.forEach((card) => {
      targets[card.id] = { left, top }
    })
    setQuickTargets(targets)
    setAlbumPulse(true)
    if (quickTimer.current) window.clearTimeout(quickTimer.current)
    quickTimer.current = window.setTimeout(() => {
      cards.forEach((card) => collect(card.id))
      setQuickTargets(null)
      setAlbumPulse(false)
      showToast(`已收入卡册 ×${cards.length}`)
    }, 520)
  }

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
        x: Math.min(0.28, Math.max(0.12, 0.2 + offset)),
        y: 0.18,
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

  const returnPack = async (item: DeskItem) => {
    consumePack(item.id)
    if (!item.token || !user) {
      refreshPacks()
      showToast("卡包已从桌面收回")
      return
    }
    try {
      const res = await fetch(`/api/users/${user.id}/packs/return`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: item.token }),
      })
      const payload = (await res.json().catch(() => null)) as
        | { ok: boolean; data?: { packs: Record<string, number> } }
        | null
      if (payload?.ok && payload.data) {
        setPackState({ userId: user.id, data: payload.data.packs })
      window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
        showToast("卡包已放回背包")
      } else {
        refreshPacks()
        showToast("卡包已从桌面收回")
      }
    } catch {
      refreshPacks()
      showToast("卡包已从桌面收回")
    }
  }

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, item: DeskItem) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const size = ITEM_SIZE[item.kind]
    const originX = item.x * rect.width
    const originY = item.y * rect.height
    const startX = e.clientX
    const startY = e.clientY
    const album = items.find((it) => it.kind === "album")
    const albumHit = album
      ? {
          left: rect.left + album.x * rect.width,
          top: rect.top + album.y * rect.height,
          right: rect.left + album.x * rect.width + ITEM_SIZE.album.w,
          bottom: rect.top + album.y * rect.height + ITEM_SIZE.album.h,
        }
      : null
    let moved = false
    let deckSlot: number | null = null
    let albumPanelHover = false
    let backpackPanelHover = false
    const canAssign = item.kind === "card" && item.card?.userCardId != null
    front(item.id)
    setDragId(item.id)

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return
      if (!moved) {
        moved = true
        setDragGhost({ item, x: ev.clientX, y: ev.clientY })
      }
      setDragGhost((current) =>
        current ? { ...current, x: ev.clientX, y: ev.clientY } : current,
      )
      const nx = Math.min(Math.max(originX + dx, 0), rect.width - size.w)
      const ny = Math.min(Math.max(originY + dy, 0), rect.height - size.h)
      move(item.id, nx / rect.width, ny / rect.height)

      const elements = document.elementsFromPoint(ev.clientX, ev.clientY)

      if (canAssign) {
        const slotEl = elements
          .map((el) => el.closest<HTMLElement>("[data-slot]"))
          .find((el): el is HTMLElement => !!el)
        const parsed = slotEl ? Number(slotEl.dataset.slot) : Number.NaN
        const next = Number.isInteger(parsed) ? parsed : null
        if (next !== deckSlot) {
          deckSlot = next
          window.dispatchEvent(new CustomEvent(DECK_HOVER_EVENT, { detail: next }))
        }
      }

      const overAlbum = elements.some((el) => !!el.closest(".album-panel"))
      if (overAlbum !== albumPanelHover) {
        albumPanelHover = overAlbum
        window.dispatchEvent(new CustomEvent(ALBUM_HOVER_EVENT, { detail: overAlbum }))
      }

      const overBackpack = elements.some((el) => !!el.closest(".backpack-panel"))
      if (overBackpack !== backpackPanelHover) {
        backpackPanelHover = overBackpack
        window.dispatchEvent(
          new CustomEvent(BACKPACK_HOVER_EVENT, { detail: overBackpack }),
        )
      }

      if (item.kind === "card" && !item.card?.isHero && albumHit) {
        const hit =
          ev.clientX >= albumHit.left &&
          ev.clientX <= albumHit.right &&
          ev.clientY >= albumHit.top &&
          ev.clientY <= albumHit.bottom
        const next = hit ? album!.id : null
        if (dropRef.current !== next) {
          dropRef.current = next
          setDropTarget(next)
        }
      }
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setDragId(null)
      setDragGhost(null)
      window.dispatchEvent(new CustomEvent(DECK_HOVER_EVENT, { detail: null }))
      window.dispatchEvent(new CustomEvent(ALBUM_HOVER_EVENT, { detail: false }))
      window.dispatchEvent(new CustomEvent(BACKPACK_HOVER_EVENT, { detail: false }))
      const dropId = dropRef.current
      dropRef.current = null
      setDropTarget(null)
      if (albumPanelHover && item.kind === "card" && !item.card?.isHero) {
        collect(item.id)
        showToast("已放入卡册")
        return
      }
      if (backpackPanelHover && item.kind === "pack") {
        void returnPack(item)
        return
      }
      if (deckSlot != null && item.card?.userCardId != null) {
        window.dispatchEvent(
          new CustomEvent(DECK_ASSIGN_EVENT, {
            detail: { userCardId: item.card.userCardId, slot: deckSlot },
          }),
        )
        collect(item.id)
        showToast(`已放入卡组第 ${deckSlot + 1} 槽`)
        return
      }
      if (dropId && album && item.kind === "card" && !item.card?.isHero) {
        collectCard(item, album)
        return
      }
      if (!moved) onTap(item)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const onTap = async (item: DeskItem) => {
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
            consumePack(item.id)
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
        consumePack(item.id)
        setOpening({ pack: item, cards, pool: packPool, rect })
      } catch (err) {
        showToast(err instanceof Error ? err.message : "开包失败")
      } finally {
        openingBusy.current = false
      }
      return
    }

    if (item.kind === "album") showToast("双击卡册，翻开收藏")
    if (item.kind === "mainline") showToast("双击主线，查看章节")
    if (item.kind === "market") showToast("双击市场，查看交易行")
  }

  const finishOpening = () => {
    if (!opening) return
    spawn(cardsToItems(opening.cards, opening.pack.x + 0.01, opening.pack.y + 0.02))
    consumePack(opening.pack.id)
    setOpening(null)
  }

  const dropOpeningCard = (card: CardData) => {
    if (!opening) return
    const left = opening.cards.filter(
      (item) => !(item.cardId === card.cardId && item.userCardId === card.userCardId),
    )
    spawnCards([card])
    showToast(`${card.name} · 已放到桌面`)
    if (left.length === 0) {
      consumePack(opening.pack.id)
      setOpening(null)
      return
    }
    setOpening({ ...opening, cards: left })
  }

  const quickFinishOpening = () => {
    if (!opening) return
    consumePack(opening.pack.id)
    setOpening(null)
    setAlbumPulse(true)
    window.setTimeout(() => setAlbumPulse(false), 520)
    showToast(`已收入卡册 ×${opening.cards.length}`)
  }

  const cardPx = useMemo(() => stageSize, [stageSize])
  const visibleItems = items.filter((item) => !(item.card?.isHero && !user?.hero))
  const poolPacks =
    packState && packState.userId === user?.id
      ? (packState.data[SERVER_POOL[pool]] ?? 0)
      : 0
  const drawAvailable = !!user && poolPacks > 0
  const queryPanel = new URLSearchParams(window.location.search).get("panel") as PanelId | null
  const requestedPanel =
    queryPanel && (["codex", "album", "deck", "backpack", "battle", "packs", "mainline", "market", "account"] as PanelId[]).includes(queryPanel)
      ? queryPanel
      : null

  return (
    <div className="desk-root">
      <header className="desk-topbar">
        <div className="desk-topbar__main">
          <img className="desk-topbar__brand" src="/brand/choke-lockup-horizontal.svg" alt="Choke!" />
          <div className="desk-topbar__actions">
            <button
              type="button"
              className="desk-button"
              aria-pressed={quality === "light"}
              onClick={() => setQuality((q) => (q === "3d" ? "light" : "3d"))}
            >
              {quality === "3d" ? "3D 开包" : "轻量模式"}
            </button>
            <button
              type="button"
              className="desk-button"
              onClick={quickCollectAll}
              disabled={!items.some((it) => it.kind === "card" && !it.card?.isHero)}
            >
              快速收卡
            </button>
            <a className="desk-button desk-button--link" href="/card-lab">
              卡面
            </a>
            <a className="desk-button desk-button--link" href="/holo-lab.html" target="_blank" rel="noreferrer">
              全息参考
            </a>
            <button type="button" className="desk-button" onClick={reset}>
              重置桌面
            </button>
          </div>
        </div>
      </header>

      <main
        ref={stageRef}
        className={`desk-stage ${deskDropActive ? "is-card-drop" : ""}`}
        style={{ "--desk-bg": DEFAULT_SKIN.background, "--desk-edge": DEFAULT_SKIN.edge } as CSSProperties}
        onDragOver={(event) => {
          const types = Array.from(event.dataTransfer.types)
          if (!types.includes(CARD_MIME) && !types.includes(USER_CARD_MIME)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
          if (!deskDropActive) setDeskDropActive(true)
        }}
        onDragLeave={(event) => {
          if (event.target === event.currentTarget) setDeskDropActive(false)
        }}
        onDrop={(event) => {
          const deckCard = readUserCardDrag(event.nativeEvent)
          const card = deckCard?.card ?? readCardDrag(event.nativeEvent)
          if (!card) return
          event.preventDefault()
          setDeskDropActive(false)
          spawnCards([card], event.clientX, event.clientY)
          showToast(`${card.name} · 已放到桌面`)
        }}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest(".desk-item, .command-panel, .command-tab")) return
          closeDrawer()
        }}
      >
        {visibleItems.map((item, index) => {
          const size = ITEM_SIZE[item.kind]
          const isCollecting = collecting?.id === item.id
          const quickTarget = quickTargets?.[item.id]
          const isQuick = !!quickTarget
          const quickIndex = isQuick ? Object.keys(quickTargets ?? {}).indexOf(item.id) : 0
          const dealX = cardPx.w / 2 - (item.x * cardPx.w + size.w / 2)
          const style = {
            left: isCollecting ? collecting.left : quickTarget ? quickTarget.left : item.x * cardPx.w,
            top: isCollecting ? collecting.top : quickTarget ? quickTarget.top : item.y * cardPx.h,
            width: size.w,
            height: size.h,
            zIndex: isCollecting || isQuick ? 300 : item.z,
            transform: isCollecting || isQuick
              ? `rotate(${tiltOf(item.id)}deg) scale(0.16)`
              : `rotate(${tiltOf(item.id)}deg)`,
            opacity: isCollecting || isQuick ? 0 : 1,
            transition: isCollecting || isQuick
              ? `left .42s cubic-bezier(.2,.8,.2,1), top .42s cubic-bezier(.2,.8,.2,1), transform .42s cubic-bezier(.2,.8,.2,1), opacity .42s ease${isQuick ? ` ${quickIndex * 24}ms` : ""}`
              : undefined,
            pointerEvents: isCollecting || isQuick ? "none" : undefined,
            "--deal-x": `${dealX}px`,
            animationDelay: `${index * 70}ms`,
          } as CSSProperties
          const dragging = dragId === item.id
          const classes = [
            "desk-item",
            dragging && "is-dragging",
            (isCollecting || isQuick) && "is-collecting",
            dropTarget === item.id && "is-drop-target",
            albumPulse && item.kind === "album" && "is-pulsing",
          ]
            .filter(Boolean)
            .join(" ")
          return (
            <div
              key={item.id}
              className={classes}
              style={style}
              onPointerDown={(e) => {
                if (e.button !== 0 || isCollecting || isQuick) return
                e.currentTarget.setPointerCapture(e.pointerId)
                startDrag(e, item)
              }}
              onDoubleClick={() => {
                if (item.kind === "album") requestPanel("album")
                if (item.kind === "mainline") requestPanel("mainline")
                if (item.kind === "market") requestPanel("market")
              }}
              role="group"
              aria-label={labelOf(item)}
            >
              <ItemView item={item} hero={user?.hero ?? null} />
            </div>
          )
        })}

        {dropTarget &&
          (() => {
            const album = items.find((it) => it.id === dropTarget)
            if (!album) return null
            const size = ITEM_SIZE.album
            return (
              <div
                className="desk-drop-hint"
                style={{
                  left: album.x * cardPx.w,
                  top: album.y * cardPx.h,
                  width: size.w,
                  height: size.h,
                }}
              >
                松开 · 收入卡册
              </div>
            )
          })()}

        {deskDropActive && (
          <div className="desk-card-drop" aria-hidden>
            <span>松开</span>
            <b>放到桌面</b>
          </div>
        )}

        <SidePanel side="left" title="Choke!" rows={[]} />

        <CommandPanel
          key={`${panelRequest?.n ?? 0}-${panelEpoch}`}
          initialStage={deskClosed ? "closed" : panelRequest || requestedPanel ? "open" : "closed"}
          initialPanel={panelRequest?.id ?? requestedPanel ?? "album"}
          userId={user?.id ?? null}
          username={user?.username ?? null}
          publicId={user?.publicId ?? null}
          avatarUrl={user?.avatarUrl ?? null}
          essence={user?.essence ?? 0}
          coins={user?.coins ?? 0}
          hero={user?.hero ?? null}
          onLogout={logout}
          onHeroClaimed={refreshUser}
        />

        <div
          className="desk-draw"
          style={
            {
              "--pool-color": POOL_META[pool].color,
              "--pool-ink": pool === "prism" ? "#0b0d10" : "#f4f4f6",
            } as CSSProperties
          }
        >
          <button
            type="button"
            className="desk-draw__button"
            onClick={spawnPack}
            disabled={!drawAvailable}
            title={drawAvailable ? "从背包发一张卡包到桌面" : "背包里没有这个卡包"}
            aria-label={`发一张${POOL_META[pool].label}的卡包到桌面`}
          >
            <span className="desk-draw__shine" aria-hidden />
            <span className="desk-draw__word">发牌</span>
            <span className="desk-draw__pool">{POOL_META[pool].short}</span>
          </button>
          <div className="desk-draw__switch" role="group" aria-label="切换卡池">
            {POOL_ORDER.map((item) => (
              <button
                key={item}
                type="button"
                className={`desk-draw__dot ${item === pool ? "is-active" : ""}`}
                style={{ background: POOL_META[item].color }}
                onClick={() => setPool(item)}
                title={POOL_META[item].label}
                aria-label={`切换到${POOL_META[item].label}`}
                aria-pressed={item === pool}
              />
            ))}
            <span className="desk-draw__switch-label">{POOL_META[pool].short}</span>
          </div>
        </div>
      </main>

      {opening &&
        (useWebGL ? (
          <Pack3D
            key={opening.pack.id + opening.cards.length}
            cards={opening.cards}
            originRect={opening.rect}
            onDone={finishOpening}
            onQuick={quickFinishOpening}
            onCancel={() => setOpening(null)}
          />
        ) : (
          <div className="opener">
            <Pack2D
              cards={opening.cards}
              label={`${POOL_META[opening.pool].label} · 5 张`}
              accent={POOL_META[opening.pool].color}
              onDone={finishOpening}
              onQuick={quickFinishOpening}
              onCancel={() => setOpening(null)}
              onDropCard={dropOpeningCard}
            />
          </div>
        ))}

      {dragGhost && (
        <div
          className="desk-drag-ghost"
          style={{
            left: dragGhost.x,
            top: dragGhost.y,
            width: ITEM_SIZE[dragGhost.item.kind].w,
            height: ITEM_SIZE[dragGhost.item.kind].h,
          }}
        >
          <ItemView item={dragGhost.item} hero={user?.hero ?? null} />
        </div>
      )}

      {toast && (
        <div className="desk-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

function labelOf(item: DeskItem) {
  switch (item.kind) {
    case "pack":
      return POOL_META[item.pool ?? "normal"].label
    case "album":
      return "卡册"
    case "mainline":
      return "主线"
    case "market":
      return "市场"
    case "card":
      return item.card?.name ?? "卡牌"
  }
}

function ItemView({ item, hero }: { item: DeskItem; hero: ApiUserCard | null }) {
  switch (item.kind) {
    case "pack": {
      const meta = POOL_META[item.pool ?? "normal"]
      return (
        <div
          className="desk-pack"
          style={{ position: "absolute", inset: 0, "--pack-accent": meta.color } as CSSProperties}
        >
          <div className="desk-pack__strip" />
          <img className="desk-pack__art" src="/brand/choke-lockup-horizontal.svg" alt="" draggable={false} />
          <div className="desk-pack__series">TRADING CARD</div>
          <div className="desk-pack__label">{meta.short}卡包</div>
          <div className="desk-pack__count">5 CARDS / PACK</div>
        </div>
      )
    }
    case "album":
      return (
        <div className="desk-object desk-object--album" style={{ position: "absolute", inset: 0 }}>
          <div className="desk-object__tag">收藏</div>
          <div className="desk-object__title">卡册</div>
          <div className="desk-object__sub">双击翻开</div>
        </div>
      )
    case "mainline":
      return (
        <div className="desk-object desk-object--mainline" style={{ position: "absolute", inset: 0 }}>
          <div className="desk-object__tag">剧情 · 第 1 章</div>
          <div className="desk-object__title">主线</div>
          <div className="desk-object__sub">通关奖励仅限首次</div>
        </div>
      )
    case "market":
      return (
        <div className="desk-object desk-object--market" style={{ position: "absolute", inset: 0 }}>
          <div className="desk-object__tag">交易</div>
          <div className="desk-object__title">市场</div>
          <div className="desk-object__sub">即将开放</div>
        </div>
      )
    case "card":
      if (item.card?.isHero && hero) return <CardFace card={toFace(hero)} />
      return item.card ? <CardFace card={cardFromDesk(item.card)} /> : null
  }
}
