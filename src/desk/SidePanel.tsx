import { useEffect, useRef, useState } from "react"

export interface PanelRow {
  label: string
  detail: string
  progress: number
}

interface Props {
  side: "left" | "right"
  title: string
  rows: PanelRow[]
}

const AUTO_HIDE_MS = 2000

/** 悬停展开、离开 2 秒后自动收起的侧栏；默认只留一条可悬停的边 */
export function SidePanel({ side, title, rows }: Props) {
  const [collapsed, setCollapsed] = useState(true)
  const closeTimer = useRef<number | null>(null)
  const arrow = side === "left" ? (collapsed ? "›" : "‹") : collapsed ? "‹" : "›"

  const clearTimer = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const open = () => {
    clearTimer()
    setCollapsed(false)
  }
  const scheduleClose = () => {
    clearTimer()
    closeTimer.current = window.setTimeout(() => setCollapsed(true), AUTO_HIDE_MS)
  }

  useEffect(() => clearTimer, [])

  return (
    <aside
      className={`side-panel side-panel--${side} ${collapsed ? "is-collapsed" : ""}`}
      aria-label={title}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocusCapture={open}
      onBlurCapture={scheduleClose}
    >
      <span className="side-panel__peek" aria-hidden>
        {title}
      </span>
      <header className="side-panel__head">
        <h2 className="side-panel__title">{title}</h2>
        <button
          type="button"
          className="side-panel__toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={(collapsed ? "展开" : "收起") + title}
          aria-expanded={!collapsed}
        >
          {arrow}
        </button>
      </header>
      <div className="side-panel__body">
        {rows.map((row, i) => {
          const pct = Math.max(0, Math.min(100, row.progress))
          return (
            <div className="side-row" key={i}>
              <div className="side-row__label">{row.label}</div>
              <div className="side-row__track">
                <div className="side-row__bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="side-row__detail">{row.detail}</div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
