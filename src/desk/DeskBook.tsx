import {
  useCallback,
  useMemo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type Ref,
  type ReactNode,
} from "react"
import { flushSync } from "react-dom"

import { onIdle } from "@/lib/idle"

import { AboutPanel } from "./AboutPanel"
import { AccountPanel } from "./AccountPanel"
import { AlbumPanel } from "./AlbumPanel"
import type { ApiUserCard } from "./api"
import { BackpackPanel } from "./BackpackPanel"
import { BattlePanel } from "./BattlePanel"
import { BookContext, type BookApi } from "./BookPages"
import { CardDragLayer } from "./DragGhost"
import { CodexPanel } from "./CodexPanel"
import { DeckPanel } from "./DeckPanel"
import { GachaPanel, type PoolId } from "./GachaPanel"
import { MarketPanel } from "./MarketPanel"
import { OBJECT_META } from "./objects"
import { DESK_ADD_CARDS_EVENT, PACKS_CHANGED_EVENT } from "./drag"
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
/** 拖书时左右、下边至少留这么多在桌面里，免得拖丢；上边不许出去，标题栏是把手 */
const KEEP = 120

interface Box {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

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
 * 书可以拖（标题栏、书皮边），位置存在本地。书页使用 layout containment；
 * 面板的 fixed 弹窗必须 portal 到 body，保持视口定位和独立布局。
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
  // 初始位置交给 JSX，后续拖放 / 收边直接更新 DOM，避免重渲染整页卡。
  const [initialPos] = useState(readPos)
  const pos = useRef(initialPos)
  const drag = useRef<{
    id: number
    x: number
    y: number
    start: { x: number; y: number }
    next: { x: number; y: number }
    box: Box
    /** 按下时书左上角的视口坐标，拖动中用来对齐物理像素 */
    left: number
    top: number
  } | null>(null)
  const selectFaces = useRef<{ select: HTMLSelectElement; face: HTMLElement }[]>([])
  const restoreSelects = useCallback(() => {
    for (const { select, face } of selectFaces.current) {
      select.hidden = false
      face.remove()
    }
    selectFaces.current = []
  }, [])
  const commitPos = useCallback((next: { x: number; y: number }) => {
    pos.current = next
    bookRef.current?.style.setProperty("--bx", `${next.x}px`)
    bookRef.current?.style.setProperty("--by", `${next.y}px`)
  }, [])
  /** 当前面板内容是否加载好；翻页等它就绪再翻，翻过去的是加载好的页面 */
  const contentReady = useRef({ ready: true, waiters: [] as (() => void)[] })
  const activeTransition = useRef<ViewTransition | null>(null)
  const [warmed, setWarmed] = useState(false)
  const [revision, setRevision] = useState(0)
  const invalidate = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    window.addEventListener(DESK_ADD_CARDS_EVENT, invalidate)
    window.addEventListener(PACKS_CHANGED_EVENT, invalidate)
    return () => {
      window.removeEventListener(DESK_ADD_CARDS_EVENT, invalidate)
      window.removeEventListener(PACKS_CHANGED_EVENT, invalidate)
    }
  }, [invalidate])
  const whenIdle = useCallback(async () => {
    while (activeTransition.current) await activeTransition.current.finished.catch(() => {})
  }, [])
  useEffect(() => {
    let cancelled = false
    const cancel = onIdle(() => {
      void whenIdle().then(() => { if (!cancelled) setWarmed(true) })
    }, 500)
    return () => { cancelled = true; cancel() }
  }, [whenIdle])

  /**
   * 翻页：浏览器先把当前两页拍成快照，update 换成新内容，等新内容加载好后，
   * 用 View Transitions 让真实的旧页绕书脊翻过去、背面落下的是真实的新页（book.css 的 page-left / page-right）。
   * 新页的挂载和布局发生在动画开始之前，翻的过程只动合成层上的快照。
   */
  const turn = useCallback((dir: 1 | -1, update: () => void) => {
    const el = bookRef.current
    if (!el || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update()
      return
    }
    el.dataset.turn = dir > 0 ? "fwd" : "back"
    document.documentElement.dataset.bookTurn = el.dataset.turn
    const transition = document.startViewTransition(async () => {
      flushSync(update)
      const state = contentReady.current
      if (state.ready) return
      // 数据慢时最多等 1.5 秒，之后照常翻，新页先显示加载中的卡位
      await new Promise<void>((resolve) => {
        state.waiters.push(resolve)
        window.setTimeout(resolve, 1500)
      })
    })
    activeTransition.current = transition
    const finish = () => {
      if (activeTransition.current !== transition) return
      activeTransition.current = null
      delete el.dataset.turn
      delete document.documentElement.dataset.bookTurn
    }
    void transition.finished.then(finish, finish)
  }, [])

  const setReady = useCallback((ready: boolean) => {
    const state = contentReady.current
    state.ready = ready
    if (!ready) return
    for (const resolve of state.waiters.splice(0)) resolve()
  }, [])

  const selectPanel = (id: PanelId) => {
    if (id === panel) return
    turn(PANEL_IDS.indexOf(id) > PANEL_IDS.indexOf(panel) ? 1 : -1, () => onSelect(id))
  }

  const close = useCallback(() => {
    if (leaveTimer.current) return
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null
      onClose()
    }, 170)
  }, [onClose])

  useImperativeHandle(ref, () => ({ close }))

  useEffect(
    () => () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
      const transition = activeTransition.current
      activeTransition.current = null
      transition?.skipTransition()
      delete document.documentElement.dataset.bookTurn
      restoreSelects()
    },
    [restoreSelects],
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

  /** 书在桌面里能放的范围：按下时量一次，拖动中不再读布局 */
  const bounds = (): Box => {
    const el = bookRef.current
    const stage = el?.offsetParent as HTMLElement | null
    if (!el || !stage) return { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity }
    const x = (stage.clientWidth + el.offsetWidth) / 2 - KEEP
    return {
      minX: -x,
      maxX: x,
      // 书顶贴到桌面顶为止：再往上标题栏就出了画面，书就再也抓不回来了
      minY: -Math.max(0, (stage.clientHeight - el.offsetHeight) / 2),
      maxY: (stage.clientHeight + el.offsetHeight) / 2 - KEEP,
    }
  }

  // 以前存下的位置可能已经出界（旧版本允许拖出顶边、窗口变小），打开和窗口变化时收回来
  useLayoutEffect(() => {
    const fit = () => {
      if (drag.current) return
      const box = bounds()
      const prev = pos.current
      const x = Math.max(box.minX, Math.min(box.maxX, prev.x))
      const y = Math.max(box.minY, Math.min(box.maxY, prev.y))
      if (x !== prev.x || y !== prev.y) commitPos({ x, y })
    }
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [commitPos])

  const onGripDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    const onCover = target === event.currentTarget
    const onGrip = !!target.closest("[data-book-grip]") && !target.closest("button, a, input, select, textarea")
    if (!onCover && !onGrip) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: pos.current,
      next: pos.current,
      box: bounds(),
      left: rect.left,
      top: rect.top,
    }
    // Chromium 会把原生 select 的 picker / autofill 隐式锚点向祖先传播，
    // 祖先每改一次 translate 就触发完整布局和重绘，即使书已经是合成层。
    // 只在拖书时隐藏原控件，用同尺寸、同样式的文字面替代；松手恢复原 select。
    // 先批量读尺寸，再改 DOM，避免每个控件都让卡页同步布局一次。
    const faces = Array.from(
      event.currentTarget.querySelectorAll<HTMLSelectElement>("select")
    ).filter((select) => !select.hidden && select.getClientRects().length > 0)
      .map((select) => {
        const style = getComputedStyle(select)
        const face = document.createElement("span")
        face.className = `${select.className} book__select-face`
        face.style.cssText = select.style.cssText
        face.style.width = style.width
        face.style.height = style.height
        face.textContent = select.selectedOptions[0]?.label ?? ""
        face.setAttribute("aria-hidden", "true")
        return { select, face }
      })
    for (const { select, face } of faces) {
      select.before(face)
      select.hidden = true
    }
    selectFaces.current = faces
    event.currentTarget.classList.add("is-dragging")
  }
  // 每帧只写合成层的 translate；按下、松手也不因位置 / 拖动状态重渲染面板。
  const onGripMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    d.next = {
      x: Math.max(d.box.minX, Math.min(d.box.maxX, d.start.x + event.clientX - d.x)),
      y: Math.max(d.box.minY, Math.min(d.box.maxY, d.start.y + event.clientY - d.y)),
    }
    // 合成层落在半个物理像素上会被整张重采样，卡面细线和小字就糊了：把书的左上角对齐到物理像素
    const dpr = window.devicePixelRatio || 1
    const snap = (origin: number, delta: number) => Math.round((origin + delta) * dpr) / dpr - origin
    event.currentTarget.style.translate =
      `${snap(d.left, d.next.x - d.start.x)}px ${snap(d.top, d.next.y - d.start.y)}px`
  }
  const onGripUp = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    drag.current = null
    // 松手时把位移落回 left/top（书里有 fixed 弹窗，平时祖先不能带 transform）
    event.currentTarget.style.translate = ""
    commitPos(d.next)
    event.currentTarget.classList.remove("is-dragging")
    restoreSelects()
    localStorage.setItem(POS_KEY, JSON.stringify(d.next))
  }


  const meta = OBJECT_META[panel]
  const current = PANEL_IDS.indexOf(panel)
  const api = useMemo<BookApi>(() => ({
    eyebrow: meta.sub,
    title: meta.label,
    active: true,
    revision,
    invalidate,
    close,
    turn,
    setReady,
    whenIdle,
  }), [meta.sub, meta.label, close, turn, setReady, whenIdle, revision, invalidate])

  return (
    <aside
      ref={bookRef}
      className={`book ${leaving ? "is-leaving" : ""}`}
      data-object={panel}
      style={{ "--book-from": from, "--bx": `${initialPos.x}px`, "--by": `${initialPos.y}px` } as CSSProperties}
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
            onClick={() => selectPanel(id)}
          >
            {OBJECT_META[id].label}
          </button>
        ))}
      </nav>

      <BookContext value={api}>
        {(warmed || panel === "codex") && (
          <CachedPanel id="codex" active={panel === "codex"} api={api}>
            <CodexPanel userId={userId} />
          </CachedPanel>
        )}
        {(warmed || panel === "album") && (
          <CachedPanel id="album" active={panel === "album"} api={api}>
            <AlbumPanel userId={userId} />
          </CachedPanel>
        )}
        {(warmed || panel === "deck") && (
          <CachedPanel id="deck" active={panel === "deck"} api={api}>
            <DeckPanel userId={userId} />
          </CachedPanel>
        )}
        {panel === "backpack" && (
          <BackpackPanel
            userId={userId}
            onOpenGacha={(pool) => {
              setGachaPool(pool as PoolId)
              selectPanel("packs")
            }}
            onHeroClaimed={onHeroClaimed}
          />
        )}
        {panel === "battle" && <BattlePanel userId={userId} onOpenDeck={() => selectPanel("deck")} />}
        {panel === "packs" && <GachaPanel userId={userId} initialPool={gachaPool} />}
        {panel === "market" && <MarketPanel userId={userId} onOpenAlbum={() => selectPanel("album")} />}
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
            onOpenBackpack={() => selectPanel("backpack")}
          />
        )}
      </BookContext>

      <CardDragLayer root={bookRef} />
    </aside>
  )
}

/** opacity 不改变邻页的布局或继承样式；inert 把隐藏的控件、拖放目标和弹窗隔离。 */
function CachedPanel({ id, active, api, children }: { id: PanelId; active: boolean; api: BookApi; children: ReactNode }) {
  const ready = useRef(true)
  const reportReady = api.setReady
  const setReady = useCallback((value: boolean) => {
    ready.current = value
    if (active) reportReady(value)
  }, [active, reportReady])
  useLayoutEffect(() => {
    if (active) reportReady(ready.current)
  }, [active, reportReady])
  const context = useMemo<BookApi>(() => ({
    active,
    title: OBJECT_META[id].label,
    eyebrow: OBJECT_META[id].sub,
    close: api.close,
    turn: api.turn,
    whenIdle: api.whenIdle,
    revision: api.revision,
    invalidate: api.invalidate,
    setReady,
  }), [id, active, api.close, api.turn, api.whenIdle, api.revision, api.invalidate, setReady])
  return (
    <div className={`book__panel ${active ? "is-active" : ""}`} inert={!active} aria-hidden={!active || undefined}>
      <BookContext value={context}>{children}</BookContext>
    </div>
  )
}
