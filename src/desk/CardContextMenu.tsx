import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"

import "./card-context-menu.css"

interface Action {
  label: string
  icon: ReactNode
  run: () => void
  restoreFocus?: boolean
}

interface Props {
  label: string
  x: number
  y: number
  actions: Action[]
  onClose: (restoreFocus: boolean) => void
}

export function CardContextMenu({ label, x, y, actions, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = menu.current
    if (!node) return
    node.style.left = `${Math.max(8, Math.min(x, window.innerWidth - node.offsetWidth - 8))}px`
    node.style.top = `${Math.max(8, Math.min(y, window.innerHeight - node.offsetHeight - 8))}px`
    node.querySelector("button")?.focus({ preventScroll: true })
  }, [x, y])

  useEffect(() => {
    const dismiss = () => onClose(false)
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) dismiss()
    }
    document.addEventListener("pointerdown", onOutside, true)
    document.addEventListener("scroll", dismiss, true)
    window.addEventListener("resize", dismiss)
    return () => {
      document.removeEventListener("pointerdown", onOutside, true)
      document.removeEventListener("scroll", dismiss, true)
      window.removeEventListener("resize", dismiss)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menu}
      className="card-context-menu"
      role="menu"
      aria-label={label}
      onContextMenu={(event) => event.preventDefault()}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) onClose(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault()
          onClose(true)
          return
        }
        const buttons = Array.from(event.currentTarget.querySelectorAll("button"))
        const current = buttons.findIndex((button) => button === document.activeElement)
        const last = buttons.length - 1
        const targets: Record<string, number> = {
          ArrowDown: (current + 1) % buttons.length,
          ArrowUp: current <= 0 ? last : current - 1,
          Home: 0,
          End: last,
        }
        const next = targets[event.key]
        if (typeof next !== "number") return
        event.preventDefault()
        buttons[next]?.focus({ preventScroll: true })
      }}
    >
      {actions.map(({ label, icon, run, restoreFocus }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => { onClose(restoreFocus ?? false); run() }}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
