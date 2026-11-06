import { useMemo, useRef, useState, type PointerEvent } from "react"
import { CardFace } from "@/card/CardFace"
import { cardFromDesk } from "../cardFace"
import { RARITY_COLOR } from "../rarity"
import type { CardData, Rarity } from "../types"

interface Props {
  cards: CardData[]
  onDone: () => void
  onQuick: () => void
  onCancel: () => void
  label?: string
  accent?: string
}

const RARITY_ORDER: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]

/** 轻量模式：纯 DOM + CSS 撕包，不加载 three.js */
export function Pack2D({ cards, onDone, onQuick, onCancel, label = "卡包", accent }: Props) {
  const packRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; width: number } | null>(null)
  const [progress, setProgress] = useState(0)
  const [opened, setOpened] = useState(false)

  const best = useMemo(
    () =>
      cards.reduce<Rarity>(
        (acc, c) => (RARITY_ORDER.indexOf(c.rarity) > RARITY_ORDER.indexOf(acc) ? c.rarity : acc),
        "C"
      ),
    [cards]
  )

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (opened || !packRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, width: packRef.current.getBoundingClientRect().width * 0.8 }
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const p = Math.min(1, Math.max(0, (e.clientX - drag.current.startX) / drag.current.width))
    setProgress(p)
    if (p >= 1) finish()
  }

  const onUp = () => {
    drag.current = null
    if (progress >= 0.8) finish()
    else setProgress(0)
  }

  const finish = () => {
    drag.current = null
    setProgress(1)
    setOpened(true)
  }

  const n = cards.length
  const mid = (n - 1) / 2

  return (
    <div className="opener-2d">
      <button type="button" className="opener-2d__close" onClick={onCancel} aria-label="返回桌面">
        ×
      </button>
      {!opened && (
        <div className="opener-2d__pack-stage">
          <div
            ref={packRef}
            className="opener-2d__pack"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div className="desk-pack" style={{ position: "absolute", inset: 0, borderColor: accent }}>
              <div
                className="desk-pack__strip"
                style={{
                  transform: `translate(${progress * 96}px, ${-progress * 14}px) rotate(${-progress * 16}deg)`,
                  opacity: 1 - progress * 0.35,
                }}
              />
              <img className="desk-pack__art" src="/brand/choke-icon.svg" alt="" draggable={false} />
              <div className="desk-pack__label">{label}</div>
            </div>

            <div
              className="opener-2d__tab"
              style={{
                transform: `translate(${progress * 78}px, ${-progress * 18}px) rotate(${-progress * 22}deg)`,
                opacity: 1 - progress * 0.55,
              }}
            >
              PULL →
            </div>

            <div className="opener-2d__seam" style={{ opacity: 0.28 + progress * 0.72 }} />

            <div className="opener-2d__gauge">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <div className="opener-2d__hint">按住卡包向右拖动，撕开拉片</div>
        </div>
      )}

      {opened && (
        <div className="opener-2d__reveal">
          <div className="opener-2d__eyebrow">YOU PULLED</div>
          <div className="opener-2d__best" style={{ color: RARITY_COLOR[best] }}>
            {best}
          </div>
          <div className="opener-2d__cards">
            {cards.map((card, i) => {
              const angle = (i - mid) * 4.5
              const lift = Math.abs(i - mid) * 7
              return (
                <div
                  key={i}
                  className="opener-2d__card-slot"
                  style={{
                    zIndex: i,
                    marginLeft: i === 0 ? 0 : -22,
                    transform: `rotate(${angle}deg) translateY(${lift}px)`,
                  }}
                >
                  <div className="opener-2d__card-inner" style={{ animationDelay: `${i * 90}ms` }}>
                    <div style={{ width: 140 }}>
                      <CardFace card={cardFromDesk(card)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="opener-2d__hint">收入桌面后，卡会以卡包为中心落在桌上</div>
        </div>
      )}

      {opened && (
        <div className="opener-2d__actions">
          <button type="button" className="desk-button opener-2d__quick" onClick={onQuick}>
            快速存入卡册
          </button>
          <button type="button" className="desk-button" onClick={onDone}>
            收入桌面
          </button>
        </div>
      )}
    </div>
  )
}
