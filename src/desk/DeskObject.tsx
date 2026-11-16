import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { preload } from "react-dom"

import { OBJECT_META, type DeskObjectId } from "./objects"
import { POOL_META, POOL_ORDER } from "./rarity"
import type { PackPool } from "./types"
import { PackArt } from "./opening/PackArt"
import pressSprite from "./tex/button-press.png"
import "./desk-objects.css"

export const DEAL_PRESS_MS = 340

export interface DealButtonState {
  pool: PackPool
  empty: boolean
  disabled: boolean
  pressing: boolean
  onPool: (pool: PackPool) => void
  onActivate: () => void
}

interface Props {
  id: DeskObjectId
  username: string | null
  avatarUrl: string | null
  /** 是否有卡正悬在它上面（卡册收卡 / 纸盒收卡包） */
  dropping: boolean
  open: boolean
  deal: DealButtonState
}

/** 桌上的实物。全部用 CSS 画，光从左上来；点一下翻开对应面板，按钮例外。 */
export function DeskObject({ id, username, avatarUrl, dropping, open, deal }: Props) {
  const meta = OBJECT_META[id]
  if (id === "button") preload(pressSprite, { as: "image" })
  return (
    <div className={`obj${dropping ? " is-dropping" : ""}${open ? " is-open" : ""}`} data-object={id}>
      {id === "codex" && (
        <div className="obj-book">
          <i className="obj-book__pages" />
          <div className="obj-book__cover">
            <i className="obj-book__band" />
            <b>{meta.label}</b>
            <em>{meta.sub}</em>
          </div>
        </div>
      )}

      {id === "album" && (
        <div className="obj-binder">
          <div className="obj-binder__tabs">
            <i />
            <i />
            <i />
          </div>
          <div className="obj-binder__cover">
            <div className="obj-binder__spine">
              <i />
              <i />
              <i />
            </div>
            <div className="obj-binder__label">
              <b>{meta.label}</b>
              <em>{meta.sub}</em>
            </div>
          </div>
        </div>
      )}

      {id === "about" && (
        <div className="obj-note">
          <div className="obj-note__paper">
            <b>
              Choke<i>!</i>
            </b>
            <span>关于 · 工具</span>
          </div>
          <i className="obj-note__tape" />
        </div>
      )}

      {id === "account" && (
        <div className="obj-badge">
          <i className="obj-badge__strap" />
          <i className="obj-badge__clip" />
          <div className="obj-badge__card">
            <em>CHOKE STAFF</em>
            <div className="obj-badge__photo">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" draggable={false} referrerPolicy="no-referrer" />
              ) : (
                (username ?? "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <b>{username ?? "未登录"}</b>
            <i className="obj-badge__code" />
          </div>
        </div>
      )}

      {id === "market" && (
        <div className="obj-crate">
          <div className="obj-crate__front">
            <i />
            <i />
            <i />
          </div>
          <div className="obj-tag">
            <i />
            <b>{meta.label}</b>
            <em>¥ {meta.sub}</em>
          </div>
        </div>
      )}

      {id === "backpack" && (
        <div className="obj-box">
          <i className="obj-box__lid" />
          <i className="obj-box__clasp" />
          <div className="obj-box__label">
            <b>{meta.label}</b>
            <em>{meta.sub}</em>
          </div>
        </div>
      )}

      {id === "packs" && (
        <div className="obj-stand">
          <i className="obj-stand__back" />
          <div className="obj-stand__row">
            {POOL_ORDER.slice(0, 3).map((pool) => (
              <div key={pool} className="obj-stand__pack">
                <PackArt pool={pool} />
              </div>
            ))}
          </div>
          <div className="obj-stand__front">
            <b>{meta.label}</b>
            <em>{meta.sub}</em>
          </div>
        </div>
      )}

      {id === "deck" && (
        <div className="obj-tray">
          {Array.from({ length: 7 }, (_, index) => (
            <i key={index} className="obj-tray__slot" />
          ))}
          <b className="obj-tray__label">{meta.label}</b>
        </div>
      )}

      {id === "battle" && (
        <div className="obj-mat">
          <i className="obj-mat__zone" />
          <i className="obj-mat__zone" />
          <span>VS</span>
          <b>{meta.label}</b>
        </div>
      )}

      {id === "button" && (
        <div
          className={`obj-deal ${deal.empty ? "is-empty" : ""}`}
        >
          <button
            type="button"
            className={`obj-deal__button ${deal.pressing ? "is-pressing" : ""}`}
            style={{ "--deal-press-time": `${DEAL_PRESS_MS}ms` } as CSSProperties}
            aria-label="发卡包"
            aria-disabled={deal.disabled || undefined}
            data-custom-press
            onKeyDown={(event) => {
              if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault()
            }}
            onClick={(event) => {
              // 指针使用桌面的点击 / 拖动判断。键盘和辅助技术直接激活这个按钮。
              if (event.detail === 0) deal.onActivate()
            }}
          />
          <PoolPicker pool={deal.pool} onPool={deal.onPool} />
        </div>
      )}
    </div>
  )
}

/** 发牌按钮下的卡池下拉框：平时只显示当前卡池，点开向下展开六个卡池。 */
function PoolPicker({ pool, onPool }: { pool: PackPool; onPool: (pool: PackPool) => void }) {
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const picker = root.current
      const list = menu.current
      if (!picker || !list) return
      const bounds = picker.closest(".desk-stage")?.getBoundingClientRect()
      const anchor = picker.getBoundingClientRect()
      const roomBelow = (bounds?.bottom ?? window.innerHeight) - anchor.bottom
      const roomAbove = anchor.top - (bounds?.top ?? 0)
      setAbove(roomBelow < list.offsetHeight + 10 && roomAbove > roomBelow)
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div
      ref={root}
      className={`obj-pick ${open ? "is-open" : ""}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="obj-pick__box"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`当前${POOL_META[pool].label}，切换卡池`}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="obj-pick__dot" style={{ background: POOL_META[pool].color }} />
        <span>{POOL_META[pool].label}</span>
        <i className="obj-pick__arrow" />
      </button>
      {open && (
        <div ref={menu} className="obj-pick__menu" data-side={above ? "above" : "below"} role="menu" aria-label="切换卡池">
          {POOL_ORDER.map((it) => (
            <button
              key={it}
              type="button"
              role="menuitemradio"
              aria-checked={it === pool}
              className="obj-pick__item"
              onClick={() => {
                onPool(it)
                setOpen(false)
              }}
            >
              <i className="obj-pick__dot" style={{ background: POOL_META[it].color }} />
              <span>{POOL_META[it].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
