import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type Ref,
} from "react"

import { AboutPanel } from "./AboutPanel"
import { AccountPanel } from "./AccountPanel"
import { AlbumPanel } from "./AlbumPanel"
import type { ApiUserCard } from "./api"
import { BackpackPanel } from "./BackpackPanel"
import { BattlePanel } from "./BattlePanel"
import { BookContext, type BookApi } from "./BookPages"
import { CodexPanel } from "./CodexPanel"
import { DeckPanel } from "./DeckPanel"
import { GachaPanel, type PoolId } from "./GachaPanel"
import { MarketPanel } from "./MarketPanel"
import { OBJECT_META } from "./objects"
import "./book.css"

export type PanelId = "codex" | "album" | "deck" | "backpack" | "battle" | "packs" | "market" | "about" | "account"

export const PANEL_IDS: PanelId[] = ["codex", "album", "deck", "backpack", "packs", "battle", "market", "account", "about"]

export interface DeskBookHandle {
  /** 播完合上动画再通知外面关掉 */
  close: () => void
}

interface Props {
  ref?: Ref<DeskBookHandle>
  panel: PanelId
  /** 打开时从哪里展开（视口坐标，通常是被点的物件中心） */
  origin?: { x: number; y: number } | null
  userId: string | null
  username: string | null
  publicId?: number | null
  avatarUrl?: string | null
  essence?: number
  coins?: number
  hero?: ApiUserCard | null
  onSelect: (id: PanelId) => void
  onClose: () => void
  onLogout?: () => void
  onHeroClaimed?: () => void
}

const POS_KEY = "choke-book-pos"
/** 拖书时至少留这么多在桌面里，免得拖丢 */
const KEEP = 120

function readPos(): { x: number; y: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) ?? "null") as { x?: unknown; y?: unknown } | null
    if (raw && typeof raw.x === "number" && typeof raw.y === "number") return { x: raw.x, y: raw.y }
  } catch {
    // 坏数据当没有
  }
  return { x: 0, y: 0 }
}

/**
 * 翻开的物件：一本悬浮在桌面中间的书，左右两页，九个章节靠书边的彩色索引签切换。
 * 签的高度固定；当前章节和它后面的签在右边，翻过去的在左边。切换章节、面板里翻页都会播翻页。
 * 书可以拖（标题栏、书皮边），位置存在本地。书和它的祖先不能有 transform / filter / contain，
 * 面板里的 position: fixed 弹窗（卡牌详情、选卡）要相对视口定位。
 */
export function DeskBook({
  ref,
  panel,
  origin,
  userId,
  username,
  publicId = null,
  avatarUrl = null,
  essence = 0,
  coins = 0,
  hero,
  onSelect,
  onClose,
  onLogout,
  onHeroClaimed,
}: Props) {
  const [gachaPool, setGachaPool] = useState<PoolId>("normal")
  const [leaving, setLeaving] = useState(false)
  const bookRef = useRef<HTMLElement>(null)
  const leaveTimer = useRef<number | null>(null)
  const [from, setFrom] = useState("50% 50%")
  const [pos, setPos] = useState(readPos)
  const drag = useRef<{ id: number; x: number; y: number; start: { x: number; y: number } } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [turn, setTurn] = useState<{ dir: 1 | -1; n: number } | null>(null)
  const [shown, setShown] = useState(panel)

  // 换章节：在同一次渲染里起翻页，方向看签的先后
  if (panel !== shown) {
    setShown(panel)
    const dir = PANEL_IDS.indexOf(panel) > PANEL_IDS.indexOf(shown) ? 1 : -1
    setTurn((prev) => ({ dir, n: (prev?.n ?? 0) + 1 }))
  }

  const close = () => {
    if (leaveTimer.current) return
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null
      onClose()
    }, 170)
  }

  useImperativeHandle(ref, () => ({ close }))

  useEffect(
    () => () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    },
    [],
  )

  // 展开动画的原点放在物件上
  useLayoutEffect(() => {
    const el = bookRef.current
    if (!el || !origin) return
    const rect = el.getBoundingClientRect()
    setFrom(`${origin.x - rect.left}px ${origin.y - rect.top}px`)
  }, [origin])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".card-detail")) close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  /** 把偏移夹在桌面里：书至少留 KEEP px 在可见区域 */
  const clamp = (next: { x: number; y: number }) => {
    const el = bookRef.current
    const stage = el?.offsetParent as HTMLElement | null
    if (!el || !stage) return next
    const maxX = (stage.clientWidth + el.offsetWidth) / 2 - KEEP
    const maxY = (stage.clientHeight + el.offsetHeight) / 2 - KEEP
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }

  const onGripDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    const onCover = target === event.currentTarget
    const onGrip = !!target.closest("[data-book-grip]") && !target.closest("button, a, input, select, textarea")
    if (!onCover && !onGrip) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: pos }
    setDragging(true)
  }
  const onGripMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    setPos(clamp({ x: d.start.x + event.clientX - d.x, y: d.start.y + event.clientY - d.y }))
  }
  const onGripUp = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    drag.current = null
    setDragging(false)
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
  }

  const meta = OBJECT_META[panel]
  const current = PANEL_IDS.indexOf(panel)
  const api: BookApi = {
    eyebrow: meta.sub,
    title: meta.label,
    close,
    turn: (dir) => setTurn((prev) => ({ dir, n: (prev?.n ?? 0) + 1 })),
  }

  return (
    <aside
      ref={bookRef}
      className={`book ${leaving ? "is-leaving" : ""} ${dragging ? "is-dragging" : ""}`}
      data-object={panel}
      data-turn={turn ? `${turn.dir > 0 ? "fwd" : "back"}-${turn.n % 2}` : undefined}
      style={{ "--book-from": from, "--bx": `${pos.x}px`, "--by": `${pos.y}px` } as CSSProperties}
      aria-label={meta.label}
      onPointerDown={onGripDown}
      onPointerMove={onGripMove}
      onPointerUp={onGripUp}
      onPointerCancel={onGripUp}
    >
      <nav className="book__tabs" aria-label="切换">
        {PANEL_IDS.map((id, index) => (
          <button
            key={id}
            type="button"
            className="book__tab"
            data-object={id}
            data-side={index < current ? "left" : "right"}
            style={{ "--i": index } as CSSProperties}
            aria-current={panel === id ? "page" : undefined}
            onClick={() => onSelect(id)}
          >
            {OBJECT_META[id].label}
          </button>
        ))}
      </nav>

      <BookContext value={api}>
        {panel === "codex" && <CodexPanel userId={userId} />}
        {panel === "album" && <AlbumPanel userId={userId} />}
        {panel === "deck" && <DeckPanel userId={userId} />}
        {panel === "backpack" && (
          <BackpackPanel
            userId={userId}
            onOpenGacha={(pool) => {
              setGachaPool(pool as PoolId)
              onSelect("packs")
            }}
            onHeroClaimed={onHeroClaimed}
          />
        )}
        {panel === "battle" && <BattlePanel userId={userId} onOpenDeck={() => onSelect("deck")} />}
        {panel === "packs" && <GachaPanel userId={userId} initialPool={gachaPool} />}
        {panel === "market" && <MarketPanel userId={userId} onOpenAlbum={() => onSelect("album")} />}
        {panel === "about" && <AboutPanel />}
        {panel === "account" && (
          <AccountPanel
            userId={userId}
            username={username}
            publicId={publicId}
            avatarUrl={avatarUrl}
            essence={essence}
            coins={coins}
            hero={hero}
            onLogout={onLogout}
            onOpenBackpack={() => onSelect("backpack")}
          />
        )}
      </BookContext>

      {turn && (
        <i
          key={turn.n}
          className="book__leaf"
          data-dir={turn.dir > 0 ? "fwd" : "back"}
          aria-hidden
          onAnimationEnd={() => setTurn(null)}
        />
      )}
    </aside>
  )
}
