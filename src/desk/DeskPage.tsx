import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { CardFace } from "@/card/CardFace"

import { cardFromDesk } from "./cardFace"
import { CommandPanel, type PanelId, type PanelRequest } from "./CommandPanel"
import { toFace, type ApiUserCard } from "./api"
import { POOL_META, POOL_ORDER, rollPack } from "./rarity"
import { DEFAULT_SKIN } from "./skins"
import { SidePanel } from "./SidePanel"
import { cardsToItems, ITEM_SIZE, newId, useDesk } from "./store"
import type { CardData, DeskItem, PackPool } from "./types"
import { Pack2D } from "./opening/Pack2D"
import { Pack3D, type OriginRect } from "./opening/Pack3D"
import "./desk.css"

const QUALITY_KEY = "choke.quality"
const POOL_KEY = "choke.pool"
type Quality = "3d" | "light"

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
  const [user, setUser] = useState<{ id: string; username: string; hero: ApiUserCard | null } | null>(null)
  const [panelRequest, setPanelRequest] = useState<PanelRequest | null>(null)
  const dropRef = useRef<string | null>(null)
  const collectTimer = useRef<number | null>(null)
  const quickTimer = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)
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

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setUser({ id: d.data.id, username: d.data.username, hero: d.data.hero ?? null })
      })
      .catch(() => {})
  }, [])

  const logout = () => {
    fetch("/auth/logout", { method: "POST" })
      .catch(() => {})
      .finally(() => setUser(null))
  }

  const requestPanel = (id: PanelId) => {
    setPanelRequest((prev) => ({ id, n: (prev?.n ?? 0) + 1 }))
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

  const showToast = (text: string) => {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1600)
  }

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

  const spawnPack = () => {
    const meta = POOL_META[pool]
    const topZ = Math.max(0, ...items.map((it) => it.z)) + 1
    const packCount = items.filter((it) => it.kind === "pack").length
    const offset = ((packCount % 3) - 1) * 0.045
    const pack: DeskItem = {
      id: newId("pack"),
      kind: "pack",
      x: Math.min(0.72, Math.max(0.28, 0.5 + offset)),
      y: 0.18,
      z: topZ,
      pool,
    }
    spawn([pack])
    showToast(`${meta.label} · 卡包已发到桌面`)
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
    front(item.id)
    setDragId(item.id)

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return
      moved = true
      const nx = Math.min(Math.max(originX + dx, 0), rect.width - size.w)
      const ny = Math.min(Math.max(originY + dy, 0), rect.height - size.h)
      move(item.id, nx / rect.width, ny / rect.height)

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
      const dropId = dropRef.current
      dropRef.current = null
      setDropTarget(null)
      if (dropId && album && item.kind === "card" && !item.card?.isHero) {
        collectCard(item, album)
        return
      }
      if (!moved) onTap(item)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const onTap = (item: DeskItem) => {
    if (item.kind === "pack") {
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
      setOpening({ pack: item, cards: rollPack(5, packPool), pool: packPool, rect })
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

  const quickFinishOpening = () => {
    if (!opening) return
    consumePack(opening.pack.id)
    setOpening(null)
    setAlbumPulse(true)
    window.setTimeout(() => setAlbumPulse(false), 520)
    showToast(`已收入卡册 ×${opening.cards.length}`)
  }

  const cardPx = useMemo(() => stageSize, [stageSize])

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
        className="desk-stage"
        style={{ "--desk-bg": DEFAULT_SKIN.background, "--desk-edge": DEFAULT_SKIN.edge } as CSSProperties}
      >
        {items.map((item, index) => {
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

        <SidePanel side="left" title="Choke!" rows={[]} />

        <CommandPanel
          key={panelRequest?.n ?? 0}
          initialStage={panelRequest ? "open" : "closed"}
          initialPanel={panelRequest?.id ?? "album"}
          userId={user?.id ?? null}
          username={user?.username ?? null}
          hero={user?.hero ?? null}
          onLogout={logout}
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
            />
          </div>
        ))}

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
          <img className="desk-pack__art" src="/brand/choke-icon.svg" alt="" draggable={false} />
          <div className="desk-pack__label">{meta.short}卡包</div>
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
