import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react"

import { CardFace } from "@/card/CardFace"

import { cardFromDesk } from "../cardFace"
import { CARD_POINTER_DROP_EVENT, startCardPointerDrag, type CardPointerDrop } from "../drag"
import { CardDragLayer } from "../DragGhost"
import { RARITY_COLOR } from "../rarity"
import type { CardData, PackPool, Rarity } from "../types"
import { PackArt } from "./PackArt"
import "./opener.css"

export interface OriginRect {
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  cards: CardData[]
  pool: PackPool
  /** 桌上那个卡包的视口矩形，大包从这里放大出来 */
  origin?: OriginRect
  /** 全部放到桌面 */
  onDone: () => void
  /** 直接收进卡册（卡已经落库，关掉开包层即可） */
  onQuick: () => void
  /** 单张拖到桌面 */
  onDropCard: (card: CardData) => void
}

const RARITY_ORDER: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]
/** 翻开时桌面暗下来、扫一道光的档位 */
const BIG: Record<Rarity, boolean> = { C: false, UC: false, R: false, E: false, L: true, Radiant: true, Prismatic: true }
/** 翻牌前卡背边缘透出的光，越稀有越亮 */
const GLOW: Record<Rarity, number> = { C: 0, UC: 0.22, R: 0.38, E: 0.55, L: 0.75, Radiant: 0.9, Prismatic: 1 }
/** 大包在开包层里的宽度（px），和 opener.css 的 .op__pack 一致 */
const PACK_W = 240
const CHARGE_MS = 650
const SHOW_MS = 1150

type Stage = "seal" | "torn" | "stack"
/** stack 背面朝上叠着 → charge 抬起蓄光 → show 翻开停在中间 → slot 落到结果排里 */
type CardPhase = "stack" | "charge" | "show" | "slot"

const keyOf = (card: CardData) => String(card.userCardId ?? `${card.cardId}:${card.name}`)
const OpenerFace = memo(function OpenerFace({ card }: { card: CardData }) {
  return <CardFace card={cardFromDesk(card)} />
})

/**
 * 开包：拖住撕条往左撕开 → 5 张卡背朝上滑出叠成一摞 → 点最上面那张翻开（或全部翻开）。
 * 从低到高翻，最好的一张留到最后；L 以上翻开前先抬起蓄光，桌面暗下来，翻开时扫一道光。
 */
export function PackOpener({ cards, pool, origin, onDone, onQuick, onDropCard }: Props) {
  const [stage, setStage] = useState<Stage>("seal")
  const [progress, setProgress] = useState(0)
  const [snapping, setSnapping] = useState(false)
  const [nudge, setNudge] = useState(false)
  const [entered, setEntered] = useState(!origin)
  const [phases, setPhases] = useState<Record<string, CardPhase>>({})
  const [auto, setAuto] = useState(false)
  const [draggingCard, setDraggingCard] = useState(false)
  const tear = useRef<{ x: number; width: number; moved: boolean } | null>(null)
  const timers = useRef<number[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onDrop = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-card-drop]")) return
      const { payload } = (event as CustomEvent<CardPointerDrop>).detail
      if (!payload.card) return
      event.preventDefault()
      onDropCard(payload.card)
    }
    root.addEventListener(CARD_POINTER_DROP_EVENT, onDrop)
    return () => root.removeEventListener(CARD_POINTER_DROP_EVENT, onDrop)
  }, [onDropCard])

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  // 从桌上的小包原位放大
  useLayoutEffect(() => {
    if (entered) return
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    return () => cancelAnimationFrame(frame)
  }, [entered])

  const sorted = useMemo(
    () =>
      cards
        .map((card, index) => ({ card, index }))
        .sort((a, b) => RARITY_ORDER.indexOf(a.card.rarity) - RARITY_ORDER.indexOf(b.card.rarity) || a.index - b.index)
        .map(({ card }) => card),
    [cards],
  )

  const phaseOf = (card: CardData): CardPhase => phases[keyOf(card)] ?? "stack"
  const unrevealed = sorted.filter((card) => phaseOf(card) === "stack")
  const next = stage === "stack" ? unrevealed[0] : undefined
  const spotlight = sorted.find((card) => ["charge", "show"].includes(phaseOf(card)))
  const allOpen = stage === "stack" && unrevealed.length === 0 && !spotlight

  const setPhase = (card: CardData, phase: CardPhase) =>
    setPhases((prev) => ({ ...prev, [keyOf(card)]: phase }))

  const reveal = (card: CardData) => {
    if (phaseOf(card) !== "stack" || spotlight) return
    if (!BIG[card.rarity]) {
      setPhase(card, "slot")
      return
    }
    setPhase(card, "charge")
    later(CHARGE_MS, () => setPhase(card, "show"))
    later(CHARGE_MS + SHOW_MS, () => setPhase(card, "slot"))
  }

  // 全部翻开：一张落定再翻下一张
  useEffect(() => {
    if (!auto || !next || spotlight) return
    const id = window.setTimeout(() => reveal(next), 180)
    return () => window.clearTimeout(id)
  })

  const tearOpen = () => {
    tear.current = null
    setProgress(1)
    setStage("torn")
    later(950, () => setStage("stack"))
  }

  const onTearDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (stage !== "seal") return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pack = event.currentTarget.closest(".op__pack")
    tear.current = { x: event.clientX, width: (pack?.getBoundingClientRect().width ?? PACK_W) * 0.75, moved: false }
    setSnapping(false)
  }

  const onTearMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = tear.current
    if (!drag) return
    const p = Math.min(Math.max((drag.x - event.clientX) / drag.width, 0), 1)
    if (p > 0.03) drag.moved = true
    setProgress(p)
    if (p >= 1) tearOpen()
  }

  const onTearUp = () => {
    const drag = tear.current
    if (!drag) return
    tear.current = null
    if (progress >= 0.85) {
      tearOpen()
      return
    }
    // 没撕开就弹回去；只是点了一下的话晃一晃提示方向
    setSnapping(true)
    setProgress(0)
    if (!drag.moved) {
      setNudge(true)
      later(520, () => setNudge(false))
    }
  }

  const onTearKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      tearOpen()
    }
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onQuick()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onQuick])

  const enterStyle =
    !entered && origin
      ? {
          transform: `translate(${origin.left + origin.width / 2 - window.innerWidth / 2}px, ${
            origin.top + origin.height / 2 - window.innerHeight / 2
          }px) scale(${origin.width / PACK_W})`,
          transition: "none",
        }
      : undefined

  const cardStyle = (card: CardData, order: number): CSSProperties => {
    const phase = phaseOf(card)
    const depth = unrevealed.indexOf(card)
    const jitter = ((order * 37) % 7) - 3
    let x = "0px"
    let y = "0px"
    let scale = 1
    let rotate = 0
    let z = 10
    let delay = "0ms"
    if (stage === "seal") {
      y = "30px"
      scale = 0.92
    } else if (stage === "torn") {
      // 从撕口里抽出来，前面还挡着包身
      y = "calc(var(--ch) * -0.46)"
      delay = `${order * 70}ms`
      z = 10 + order
    } else if (phase === "stack") {
      x = `${depth * 1.5}px`
      y = `calc(var(--stack-y) - ${depth * 2}px)`
      rotate = jitter * 0.6
      z = 100 - depth
    } else if (phase === "charge") {
      scale = 1.12
      z = 300
    } else if (phase === "show") {
      scale = 1.32
      z = 300
    } else {
      x = `calc(${order - (sorted.length - 1) / 2} * (var(--cw) + 22px))`
      y = "var(--row-y)"
      z = 20 + order
    }
    return {
      transform: `translate(${x}, ${y}) rotate(${rotate}deg) scale(${scale})`,
      transitionDelay: delay,
      zIndex: z,
      "--glow": card.rarity === "Prismatic" ? "#ffffff" : RARITY_COLOR[card.rarity],
      "--glow-k": GLOW[card.rarity],
    } as CSSProperties
  }

  const hint =
    stage === "seal"
      ? "拖住右上角的撕条，往左撕开"
      : stage === "torn"
        ? ""
        : next
          ? `点最上面那张翻开 · 还剩 ${unrevealed.length} 张`
          : allOpen
            ? "把卡拖到下面的框里单张放到桌面，或者一次处理全部"
            : ""

  return (
    <div
      ref={rootRef}
      className={`op ${allOpen ? "is-done" : ""}`}
      data-stage={stage}
      data-dim={spotlight ? "" : undefined}
      style={spotlight ? ({ "--burst": RARITY_COLOR[spotlight.rarity] } as CSSProperties) : undefined}
    >
      <div className="op__backdrop" />
      <i className="op__burst" data-rarity={spotlight?.rarity} aria-hidden />

      <button type="button" className="op__close" onClick={onQuick} aria-label="收进卡册并回到桌面">
        ×
      </button>

      <div className="op__table">
        {sorted.map((card, order) => {
          const phase = phaseOf(card)
          const flipped = phase === "show" || phase === "slot"
          const isTop = card === next
          return (
            <div
              key={keyOf(card)}
              className={`op-card ${isTop ? "is-top" : ""}`}
              data-phase={stage === "stack" ? phase : stage}
              data-rarity={card.rarity}
              style={cardStyle(card, order)}
              onPointerDown={(event) => {
                if (phase === "slot") startCardPointerDrag(event, { card }, {
                  onStart: () => setDraggingCard(true),
                  onFinish: () => setDraggingCard(false),
                })
              }}
              onClick={() => isTop && reveal(card)}
              role={isTop ? "button" : undefined}
              tabIndex={isTop ? 0 : undefined}
              aria-label={isTop ? "翻开这张卡" : flipped ? card.name : undefined}
              onKeyDown={(event) => {
                if (isTop && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault()
                  reveal(card)
                }
              }}
            >
              <i className="op-card__glow" aria-hidden />
              <div className={`op-card__flip ${flipped ? "is-flipped" : ""}`}>
                <div className="op-card__back" aria-hidden>
                  <div className="cb">
                    <i className="cb__frame" />
                    <img className="cb__mark" src="/brand/choke-icon.svg" alt="" draggable={false} />
                    <span className="cb__word">CHOKE!</span>
                  </div>
                </div>
                <div className="op-card__front">
                  <OpenerFace card={card} />
                  <i className="op-card__sweep" aria-hidden />
                </div>
              </div>
            </div>
          )
        })}

        {stage !== "stack" && (
          <div
            className={`op__pack ${nudge ? "is-nudging" : ""}`}
            style={{ ...enterStyle, "--tear-p": progress } as CSSProperties}
          >
            <div className="op__pack-body">
              <PackArt pool={pool} />
            </div>
            <div className={`op__pack-strip ${snapping ? "is-snapping" : ""}`}>
              <PackArt pool={pool} />
            </div>
            <i className="op__pack-gash" aria-hidden />
            {stage === "seal" && (
              <button
                type="button"
                className="op__pack-tab"
                aria-label="撕开卡包"
                onPointerDown={onTearDown}
                onPointerMove={onTearMove}
                onPointerUp={onTearUp}
                onPointerCancel={onTearUp}
                onKeyDown={onTearKey}
              />
            )}
          </div>
        )}
      </div>

      {allOpen && (
        <div
          className={`op__drop ${draggingCard ? "is-active" : ""}`}
          data-card-drop
        >
          <b>拖到这里</b>
          <span>单张放到桌面</span>
        </div>
      )}

      <div className="op__foot">
        {hint && <p className="op__hint">{hint}</p>}
        {stage === "stack" && !allOpen && (
          <button type="button" className="op__btn op__btn--main" onClick={() => setAuto(true)} disabled={auto}>
            全部翻开
          </button>
        )}
        {allOpen && (
          <div className="op__actions">
            <button type="button" className="op__btn" onClick={onQuick}>
              存入卡册
            </button>
            <button type="button" className="op__btn op__btn--main" onClick={onDone}>
              全部放到桌面
            </button>
          </div>
        )}
      </div>
      <CardDragLayer root={rootRef} />
    </div>
  )
}
