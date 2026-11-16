import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import {
  RiArrowDownLine,
  RiArrowLeftLine,
  RiBook2Line,
  RiCloseLine,
  RiLayoutGridLine,
  RiRestartLine,
  RiSkipForwardLine,
} from "@remixicon/react"

import { CardFace } from "@/card/CardFace"
import { RARITY_LABEL } from "@/card/data"
import { cardFromDesk } from "../cardFace"
import { CARD_MIME, readCardDrag, setCardDrag } from "../drag"
import { RARITY_COLOR } from "../rarity"
import type { CardData } from "../types"
import { Pack2D } from "./Pack2D"
import { Pack3D, type OriginRect } from "./Pack3D"
import "./pack-opening.css"

interface OpeningBase {
  cards: CardData[]
  label: string
  accent: string
  useWebGL: boolean
  originRect?: OriginRect
  batch?: boolean
  notice?: string
  onCancel: () => void
  onFallback: () => void
}

type OpeningProps = OpeningBase & (
  | { onReplay?: never; onDone: () => void; onQuick: () => void; onDropCard: (card: CardData) => void }
  | { onReplay: () => void; onDone?: never; onQuick?: never; onDropCard?: never }
)

type Phase = "pull" | "impact" | "flip" | "result"
const RARITY_ORDER = Object.keys(RARITY_LABEL) as CardData["rarity"][]

export function PackOpening({
  cards,
  label,
  accent,
  useWebGL,
  originRect,
  batch = false,
  notice,
  onDone,
  onQuick,
  onCancel,
  onFallback,
  onDropCard,
  onReplay,
}: OpeningProps) {
  const [phase, setPhase] = useState<Phase>(batch ? "result" : "pull")
  const [armed, setArmed] = useState(false)
  const showingCards = phase === "flip" || phase === "result"
  const bestIndex = cards.reduce((best, card, index) => {
    const previous = cards[best]
    const rank = RARITY_ORDER.indexOf(card.rarity)
    const previousRank = RARITY_ORDER.indexOf(previous.rarity)
    return rank > previousRank ||
      (rank === previousRank && card.foil && !previous.foil)
      ? index
      : best
  }, 0)
  const best = cards[bestIndex]?.rarity ?? "C"

  const commit = useCallback(() => {
    setPhase((current) => (current === "pull" ? "impact" : current))
  }, [setPhase])

  const skip = useCallback(() => setPhase("result"), [setPhase])

  const fallback = useCallback(() => {
    setArmed(false)
    onFallback()
  }, [onFallback, setArmed])

  useEffect(() => {
    if (phase !== "impact") return
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    const timer = window.setTimeout(
      () => {
        setPhase((current) =>
          current === "impact" ? (reduceMotion ? "result" : "flip") : current
        )
      },
      reduceMotion ? 0 : 460
    )
    return () => window.clearTimeout(timer)
  }, [phase])

  return (
    <div
      className="pack-opening"
      data-phase={phase}
      data-armed={armed && phase === "pull"}
      style={
        {
          "--pack-accent": accent,
          "--hit-color": RARITY_COLOR[best],
        } as CSSProperties
      }
      role="dialog"
      aria-modal="true"
      aria-label={`开启${label}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.repeat) return
        event.preventDefault()
        if (phase === "result") onCancel()
        else skip()
      }}
    >
      <header className="pack-opening__head">
        <div className="pack-opening__tools">
          {phase !== "result" && (
            <button
              type="button"
              className="pack-opening__skip"
              aria-keyshortcuts="Escape"
              onClick={skip}
              autoFocus
            >
              <RiSkipForwardLine size={18} aria-hidden />
              跳过动画
            </button>
          )}
          <button
            type="button"
            className="desk-icon-button"
            aria-label={onReplay ? "关闭试开" : "返回桌面"}
            onClick={onCancel}
          >
            <RiCloseLine size={22} aria-hidden />
          </button>
        </div>
      </header>

      {showingCards ? (
        <PackResult
          cards={cards}
          bestIndex={bestIndex}
          animate={phase === "flip"}
          batch={batch}
          notice={notice}
          onFlipped={() =>
            setPhase((current) => (current === "flip" ? "result" : current))
          }
          onDone={onDone}
          onQuick={onQuick}
          onReplay={onReplay}
          onDropCard={useWebGL ? undefined : onDropCard}
        />
      ) : (
        <>
          {useWebGL ? (
            <Pack3D
              cards={cards}
              label={label}
              accent={accent}
              originRect={originRect}
              onCommit={commit}
              onArmed={setArmed}
              onSkip={skip}
              onFallback={fallback}
            />
          ) : (
            <Pack2D
              label={label}
              accent={accent}
              committed={phase === "impact"}
              onCommit={commit}
              onArmed={setArmed}
            />
          )}
          {phase === "impact" ? (
            <div className="pack-impact" aria-hidden>
              <span className="pack-impact__slash" />
              <svg viewBox="0 0 420 420">
                <circle cx="210" cy="210" r="125" />
                <circle cx="210" cy="210" r="147" strokeDasharray="8 17" />
                <path d="M210 42v27m0 282v27M42 210h27m282 0h27M90 90l17 17m206 206 17 17m0-240-17 17M107 313l-17 17" />
              </svg>
            </div>
          ) : (
            <div className="pack-opening__guide">
              <p>
                <RiArrowLeftLine size={17} aria-hidden />
                {armed ? "松手开包" : "向左撕开"}
              </p>
              {useWebGL && (
                <button
                  type="button"
                  className="desk-text-button"
                  onClick={fallback}
                >
                  切换轻量开包
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface ResultProps {
  cards: CardData[]
  bestIndex: number
  animate: boolean
  batch: boolean
  notice?: string
  onFlipped: () => void
  onDone?: () => void
  onQuick?: () => void
  onReplay?: () => void
  onDropCard?: (card: CardData) => void
}

function PackResult({
  cards,
  bestIndex,
  animate,
  batch,
  notice,
  onFlipped,
  onDone,
  onQuick,
  onReplay,
  onDropCard,
}: ResultProps) {
  const [dragging, setDragging] = useState(false)
  const tray = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (animate || document.activeElement === document.body) {
      tray.current?.focus({ preventScroll: true })
    }
  }, [animate])

  return (
    <div className="pack-result" data-animate={animate} data-batch={batch}>
      <div className="pack-result__content">
        {notice && <p className="pack-result__notice" role="status">{notice}</p>}

        <div
          ref={tray}
          className="pack-result__tray"
          role="region"
          tabIndex={0}
          aria-label="本次抽到的卡牌"
        >
          <div className="pack-result__cards">
            {cards.map((card, index) => {
              const featured = index === bestIndex
              const order = featured
                ? cards.length - 1
                : index > bestIndex
                  ? index - 1
                  : index
              return (
                <div
                  key={
                    card.userCardId ?? `${card.cardId ?? card.name}-${index}`
                  }
                  className="pack-result__card"
                  data-featured={featured}
                  style={
                    {
                      "--deal-delay": `${order * 53 + (featured ? 60 : 0)}ms`,
                    } as CSSProperties
                  }
                  draggable={!!onDropCard}
                  onDragStart={
                    onDropCard
                      ? (event) => {
                          setCardDrag(event.nativeEvent, card)
                          setDragging(true)
                        }
                      : undefined
                  }
                  onDragEnd={onDropCard ? () => setDragging(false) : undefined}
                >
                  <div
                    className="pack-result__flip"
                    onAnimationEnd={
                      featured && animate
                        ? (event) => {
                            if (event.target === event.currentTarget)
                              onFlipped()
                          }
                        : undefined
                    }
                  >
                    <CardFace card={cardFromDesk(card)} />
                    {animate && (
                      <span className="pack-result__back" aria-hidden>
                        <b>CHOKE!</b>
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <footer className="pack-result__actions">
          {onDropCard && (
            <div
              className={`pack-result__drop${dragging ? " is-active" : ""}`}
              onDragOver={(event) => {
                if (!Array.from(event.dataTransfer.types).includes(CARD_MIME))
                  return
                event.preventDefault()
                event.dataTransfer.dropEffect = "copy"
              }}
              onDrop={(event) => {
                event.preventDefault()
                const card = readCardDrag(event.nativeEvent)
                setDragging(false)
                if (card) onDropCard(card)
              }}
            >
              <RiArrowDownLine size={15} aria-hidden />
              拖单张卡到桌面
            </div>
          )}
          {onReplay ? (
            <button type="button" className="desk-button pack-result__primary" onClick={onReplay}>
              <RiRestartLine size={17} aria-hidden />
              重播
            </button>
          ) : (
            <>
              <button type="button" className="desk-button" onClick={onDone}>
                <RiLayoutGridLine size={17} aria-hidden />
                放到桌面
              </button>
              <button
                type="button"
                className="desk-button pack-result__primary"
                onClick={onQuick}
              >
                <RiBook2Line size={17} aria-hidden />
                存入卡册
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
