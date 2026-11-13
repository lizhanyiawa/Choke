import { useEffect, useRef, useState, type CSSProperties } from "react"

import { OBJECT_META, type DeskObjectId } from "./objects"
import { POOL_META, POOL_ORDER } from "./rarity"
import type { PackPool } from "./types"
import { PackArt } from "./opening/PackArt"
import "./desk-objects.css"

export interface DealButtonState {
  pool: PackPool
  available: boolean
  pressing: boolean
  onPool: (pool: PackPool) => void
  onPressed: () => void
}

interface Props {
  id: DeskObjectId
  username: string | null
  avatarUrl: string | null
  /** 是否有卡正悬在它上面（卡册收卡 / 纸盒收卡包） */
  dropping: boolean
  deal: DealButtonState
}

/** 桌上的实物。全部用 CSS 画，光从左上来；点一下翻开对应面板，按钮例外。 */
export function DeskObject({ id, username, avatarUrl, dropping, deal }: Props) {
  const meta = OBJECT_META[id]
  return (
    <div className={`obj ${dropping ? "is-dropping" : ""}`} data-object={id}>
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
          className={`obj-deal ${deal.available ? "" : "is-empty"}`}
          style={{ "--pool": POOL_META[deal.pool].color } as CSSProperties}
        >
          <div
            className={`obj-deal__button ${deal.pressing ? "is-pressing" : ""}`}
            onAnimationEnd={deal.onPressed}
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
  const root = useRef<HTMLDivElement>(null)

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
        <div className="obj-pick__menu" role="menu" aria-label="切换卡池">
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
