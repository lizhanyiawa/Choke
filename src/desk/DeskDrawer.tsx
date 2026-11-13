import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react"

import { OBJECT_META, OBJECT_ORDER, type DeskObjectId } from "./objects"
import type { DeskItem } from "./types"
import "./desk-drawer.css"

export interface DeskDrawerHandle {
  open: () => void
  close: () => void
  isOpen: () => boolean
  /** 拖着能放进来的东西悬在抽屉上：把手亮一圈 */
  hint: (hot: boolean) => void
  /** 东西落进抽屉：抽屉面被砸得一沉再弹回 */
  bump: () => void
  /** 飞进抽屉的落点：开着时是这件物件的格子，合着时是把手 */
  targetRect: (object?: DeskObjectId) => DOMRect | null
}

interface Props {
  ref?: Ref<DeskDrawerHandle>
  /** 收在抽屉里的物件，按 OBJECT_ORDER 排进格子 */
  items: DeskItem[]
  /** 正拿在手里的那件，格子先空着 */
  liftedId: string | null
  render: (item: DeskItem) => ReactNode
  onItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, item: DeskItem) => void
  /** 键盘 Enter / 空格：和点一下一样 */
  onActivate: (item: DeskItem) => void
  /** 物件之外收着的东西（邀请函）有几件；它们自己经 portal 画进 slotRef 这一格 */
  extra: number
  slotRef: Ref<HTMLDivElement>
}

/** 格子里给物件留的地方，物件按比例缩进去 */
const CELL = { w: 104, h: 64 }

/** 原尺寸 w × h 的东西放进格子时的缩放 */
export function cellScale(w: number, h: number) {
  return Math.min(CELL.w / w, CELL.h / h, 0.62)
}

/** 抽屉合着时露在桌沿外的抽屉面高度，和 desk-drawer.css 的 --dr-front 一致 */
const FRONT = 30

/**
 * 桌子前沿的抽屉。合着只露出带拉手的抽屉面；点拉手或往上拉打开，露出一排格子，
 * 收起来的物件缩小躺在里面：点一下和桌上一样打开面板，拖出去放回桌面。
 */
export function DeskDrawer({ ref, items, liftedId, render, onItemPointerDown, onActivate, extra, slotRef }: Props) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  const rootRef = useRef<HTMLDivElement>(null)
  const frontRef = useRef<HTMLDivElement>(null)
  const pull = useRef<{ id: number; startY: number; from: number; travel: number; moved: boolean } | null>(null)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => openRef.current,
    // data-* 不归 React 管，拖着时抽屉自己拉开重渲染也不会把高亮冲掉
    hint: (hot) => rootRef.current?.toggleAttribute("data-hot", hot),
    bump: () => {
      const front = frontRef.current
      if (!front || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      front.animate(
        [{ translate: "0 0" }, { translate: "0 3px" }, { translate: "0 -1px" }, { translate: "0 0" }],
        { duration: 420, easing: "cubic-bezier(.3,.7,.4,1)" },
      )
    },
    targetRect: (object) => {
      const root = rootRef.current
      if (!root) return null
      const cell = openRef.current && object ? root.querySelector(`[data-stowed="${object}"]`) : null
      return (cell ?? frontRef.current)?.getBoundingClientRect() ?? null
    },
  }), [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // 抓住拉手往上拉 / 往下推；没拖动就是点一下，开合切换
  const onFrontDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) return
    const root = rootRef.current
    if (!root) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pull.current = {
      id: event.pointerId,
      startY: event.clientY,
      from: open ? 1 : 0,
      travel: Math.max(root.offsetHeight - FRONT, 1),
      moved: false,
    }
  }
  const onFrontMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const p = pull.current
    const root = rootRef.current
    if (!p || p.id !== event.pointerId || !root) return
    const dy = p.startY - event.clientY
    if (!p.moved && Math.abs(dy) < 4) return
    p.moved = true
    root.classList.add("is-pulling")
    root.style.setProperty("--pull", String(Math.min(Math.max(p.from + dy / p.travel, 0), 1)))
  }
  const onFrontUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const p = pull.current
    const root = rootRef.current
    if (!p || p.id !== event.pointerId || !root) return
    pull.current = null
    if (!p.moved) {
      if (event.type === "pointerup") setOpen((v) => !v)
      return
    }
    const at = Number(root.style.getPropertyValue("--pull")) || 0
    root.classList.remove("is-pulling")
    root.style.removeProperty("--pull")
    // 拉过三成就算拉开，推回三成就算合上
    setOpen(p.from === 0 ? at > 0.3 : at > 0.7)
  }

  const stowed = OBJECT_ORDER.flatMap((id) => {
    const item = items.find((it) => it.object === id)
    return item ? [item] : []
  })

  return (
    <div ref={rootRef} className={`desk-drawer ${open ? "is-open" : ""}`} data-count={stowed.length + extra}>
      <div className="desk-drawer__well" inert={!open} aria-hidden={!open || undefined}>
        {stowed.length + extra === 0 && <p className="desk-drawer__empty">把桌上的物件拖进来收好</p>}
        {stowed.map((item) => {
          const id = item.object!
          const meta = OBJECT_META[id]
          const scale = cellScale(meta.w, meta.h)
          return (
            <div
              key={item.id}
              className={`desk-drawer__cell ${liftedId === item.id ? "is-lifted" : ""}`}
              data-stowed={id}
              role="button"
              tabIndex={0}
              aria-label={`${meta.thing}（${meta.label}）：点开，拖回桌面`}
              onPointerDown={(event) => onItemPointerDown(event, item)}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                onActivate(item)
              }}
            >
              <div
                className="desk-drawer__thing"
                style={{ width: meta.w, height: meta.h, "--s": scale } as CSSProperties}
              >
                {render(item)}
              </div>
              <span className="desk-drawer__tag">{meta.label}</span>
            </div>
          )
        })}
        <div ref={slotRef} className="desk-drawer__slot" />
      </div>

      <div
        ref={frontRef}
        className="desk-drawer__front"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? "合上抽屉" : "拉开抽屉"}
        onPointerDown={onFrontDown}
        onPointerMove={onFrontMove}
        onPointerUp={onFrontUp}
        onPointerCancel={onFrontUp}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          setOpen((v) => !v)
        }}
      >
        <i className="desk-drawer__pull" />
        <span className="desk-drawer__label">
          抽屉{stowed.length + extra > 0 && <b>{stowed.length + extra}</b>}
        </span>
      </div>
    </div>
  )
}
