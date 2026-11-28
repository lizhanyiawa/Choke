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

import { playReveal, playSfx } from "@/audio/sfx"
import { RARITY_LABEL } from "@/card/data"
import { GameCardFace } from "@/card/GameCardFace"
import { RARITIES } from "@/card/types"
import { useModal } from "@/ui/useModal"

import { cardFromDesk } from "@/desk/lib/cardFace"
import { CARD_POINTER_DROP_EVENT, startCardPointerDrag, type CardPointerDrop } from "@/desk/lib/drag"
import { CardDragLayer } from "@/desk/shell/DragGhost"
import { RARITY_COLOR } from "@/desk/lib/rarity"
import type { CardData, PackPool, Rarity } from "@/desk/lib/types"
import { PackArt } from "@/desk/opening/PackArt"
import "@/desk/opening/opener.css"
import "@/desk/opening/opener-fx.css"

export interface OriginRect {
  left: number
  top: number
  width: number
  height: number
}

interface CommonProps {
  cards: CardData[]
  pool: PackPool
  /** 桌上那个卡包的视口矩形，大包从这里放大出来 */
  origin?: OriginRect
  /** 背包里同等级卡包还剩几个 */
  remaining?: number
  /** 继续开下一个同等级卡包 */
  onOpenNext?: () => void
}

type Props = CommonProps & ({
  mode?: "desk"
  onDone: () => void
  onQuick: () => void
  onDropCard: (card: CardData) => void
} | {
  mode: "flat"
  skip?: boolean
  bonus?: CardData
  busy?: boolean
  error?: string | null
  onClose: () => void
})

const RARITY_ORDER = RARITIES
/** 未翻开就关掉时需要二次确认的最低档位 */
const CONFIRM_FROM = RARITY_ORDER.indexOf("E")
/** 结算时最高档达到它就换更隆重的音效 */
const FINALE_FROM = RARITY_ORDER.indexOf("L")
/** 翻开时桌面暗下来、扫一道光的档位 */
const BIG: Record<Rarity, boolean> = { C: false, UC: false, R: false, E: false, L: true, Mythic: true, Prismatic: true }
/** 翻牌前卡背边缘透出的光，越稀有越亮 */
const GLOW: Record<Rarity, number> = { C: 0, UC: 0.22, R: 0.38, E: 0.55, L: 0.75, Mythic: 0.9, Prismatic: 1 }
/** 蓄力、展示的时长（ms）；没列出的档位直接翻开 */
const RITUAL: Partial<Record<Rarity, { charge: number; show: number }>> = {
  E: { charge: 240, show: 420 },
  L: { charge: 550, show: 900 },
  Mythic: { charge: 600, show: 950 },
  Prismatic: { charge: 650, show: 1000 },
}
const REDUCED_RITUAL = { charge: 80, show: 260 }
/** 让翻转和放大先走完，防止连点直接收走手动亮相的卡。 */
const MANUAL_FLIP_MS = 600
/** 大包在开包层里的宽度（px），和 opener.css 的 .op__pack 一致 */
const PACK_W = 240
/** 撕开动画总长，和 opener.css 的 op-strip-off / op-pack-drop 对齐 */
const TEAR_MS = 1000

type Stage = "seal" | "torn" | "stack"
type CardPhase = "stack" | "charge" | "show" | "hold" | "slot"

const keyOf = (card: CardData) =>
  `${card.isBonus ? "bonus:" : ""}${card.userCardId ?? `${card.cardId}:${card.name}`}`
const OpenerFace = memo(function OpenerFace({ card }: { card: CardData }) {
  return <GameCardFace card={cardFromDesk(card)} eager />
})

/**
 * 开包：拖住撕条往左撕开（点一下也行）→ 5 张卡背朝上滑出叠成一摞 → 点最上面那张翻开（或全部翻开）。
 * 从低到高翻，最好的一张留到最后；E 以上翻开前先抬起蓄光，L 以上桌面还会暗下来、翻开时扫一道光。
 * 手动亮相后等玩家确认；全部翻开则自动归位。
 */
export function PackOpener(props: Props) {
  const { cards, pool, origin, remaining = 0, onOpenNext } = props
  const isFlat = props.mode === "flat"
  const flat = isFlat ? props : null
  const onDropCard = isFlat ? undefined : props.onDropCard
  const [skipToResult, setSkipToResult] = useState(!!flat?.skip)
  const [finishAnimation, setFinishAnimation] = useState(false)
  const [resultEntered, setResultEntered] = useState(false)
  const [stage, setStage] = useState<Stage>("seal")
  const [progress, setProgress] = useState(0)
  const [snapping, setSnapping] = useState(false)
  const [entered, setEntered] = useState(!origin)
  const [phases, setPhases] = useState<Record<string, CardPhase>>({})
  const [auto, setAuto] = useState(false)
  const [draggingCard, setDraggingCard] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [said, setSaid] = useState("")
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  /** L 以上翻开那一下的全屏演出；id 每次加一，连着两张大卡时各播各的 */
  const [burst, setBurst] = useState<{ id: number; rarity: Rarity } | null>(null)
  const [shattering, setShattering] = useState(false)
  const burstId = useRef(0)
  const tear = useRef<{ x: number; width: number; moved: boolean; tick: number; p: number } | null>(null)
  const torn = useRef(false)
  const timers = useRef<number[]>([])
  const revealTimers = useRef<number[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const live = useRef({ skip: () => {}, canSkip: false })
  const dropRef = useRef(onDropCard)
  const settlementRef = useRef<HTMLHeadingElement>(null)
  const finale = useRef(RARITY_ORDER.length - 1)

  useEffect(() => {
    dropRef.current = onDropCard
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root || isFlat) return
    const onDrop = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-card-drop]")) return
      const { payload } = (event as CustomEvent<CardPointerDrop>).detail
      if (!payload.card) return
      event.preventDefault()
      dropRef.current?.(payload.card)
    }
    root.addEventListener(CARD_POINTER_DROP_EVENT, onDrop)
    return () => root.removeEventListener(CARD_POINTER_DROP_EVENT, onDrop)
  }, [isFlat])

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
    return id
  }

  useEffect(() => {
    // 大包从桌上飞到面前
    if (!flat?.skip) playSfx("whoosh")
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [flat?.skip])

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
        .sort(
          (a, b) =>
            (a.card.isBonus ? 1 : 0) - (b.card.isBonus ? 1 : 0) ||
            RARITY_ORDER.indexOf(a.card.rarity) - RARITY_ORDER.indexOf(b.card.rarity) ||
            a.index - b.index,
        )
        .map(({ card }) => card),
    [cards],
  )

  const phaseOf = (card: CardData): CardPhase => phases[keyOf(card)] ?? "stack"
  const unrevealed = sorted.filter((card) => phaseOf(card) === "stack")
  const next = stage === "stack" ? unrevealed[0] : undefined
  const spotlight = sorted.find((card) => {
    const phase = phaseOf(card)
    return phase === "charge" || phase === "show" || phase === "hold"
  })
  const spotlightPhase = spotlight && phaseOf(spotlight)
  const waitingForFlip = !auto && spotlightPhase === "show"
  const allOpen = skipToResult || (stage === "stack" && unrevealed.length === 0 && !spotlight)
  const flatSettled = isFlat && (skipToResult || finishAnimation)
  const crossfade = isFlat && finishAnimation && !skipToResult && !reduced
  const handoff = crossfade && !resultEntered
  const canOpenNext = remaining > 0 && onOpenNext !== undefined
  const pendingHigh = sorted.filter((card) => {
    const phase = phaseOf(card)
    return (phase === "stack" || phase === "charge") && RARITY_ORDER.indexOf(card.rarity) >= CONFIRM_FROM
  }).length
  const asking = confirming && pendingHigh > 0 && !allOpen
  const tally = useMemo(
    () =>
      [...RARITY_ORDER]
        .reverse()
        .map((rarity) => ({ rarity, count: sorted.filter((card) => card.rarity === rarity).length }))
        .filter((entry) => entry.count > 0),
    [sorted],
  )

  const setPhase = (card: CardData, phase: CardPhase) =>
    setPhases((prev) => ({ ...prev, [keyOf(card)]: phase }))

  const ritualOf = (rarity: Rarity) => (RITUAL[rarity] ? (reduced ? REDUCED_RITUAL : RITUAL[rarity]) : undefined)

  const clearReveal = () => {
    revealTimers.current.forEach((id) => window.clearTimeout(id))
    revealTimers.current = []
  }

  const settle = (card: CardData) => {
    clearReveal()
    playSfx("drop")
    setPhase(card, "slot")
  }

  /** 闪卡翻开后补一串亮音，和翻牌声错开一点 */
  const sparkle = (card: CardData) => {
    if (card.foil) later(140, () => playSfx("shine"))
  }

  const show = (card: CardData) => {
    clearReveal()
    playReveal(card.rarity)
    sparkle(card)
    setPhase(card, "show")
    if (BIG[card.rarity] && !reduced) {
      const id = ++burstId.current
      setBurst({ id, rarity: card.rarity })
      later(1100, () => setBurst((cur) => (cur?.id === id ? null : cur)))
    }
    if (auto) {
      revealTimers.current.push(later(ritualOf(card.rarity)?.show ?? 0, () => settle(card)))
    } else {
      revealTimers.current.push(later(reduced ? 10 : MANUAL_FLIP_MS, () => setPhase(card, "hold")))
    }
  }

  const reveal = (card: CardData) => {
    if (phaseOf(card) !== "stack" || spotlight) return
    if (card.isBonus) {
      setSaid(`额外获得：${card.name} 的镜像，${RARITY_LABEL[card.rarity]}`)
      playSfx("shatter")
      if (!reduced) {
        setShattering(true)
        later(550, () => setShattering(false))
      }
      setPhase(card, "charge")
      const waitMs = reduced ? 40 : (ritualOf(card.rarity)?.charge ?? 260)
      revealTimers.current.push(later(waitMs, () => show(card)))
      return
    }
    setSaid(`${card.name}，${RARITY_LABEL[card.rarity]}，还剩 ${unrevealed.length - 1} 张`)
    const ritual = ritualOf(card.rarity)
    if (!ritual) {
      // 连着翻的普通卡一张比一张高一点，听得出「在往上走」
      playReveal(card.rarity, 1 + (sorted.length - unrevealed.length) * 0.05)
      sparkle(card)
      setPhase(card, "slot")
      return
    }
    playSfx("charge")
    setPhase(card, "charge")
    revealTimers.current.push(later(ritual.charge, () => show(card)))
  }

  /** 蓄力可跳过；手动翻牌要等卡面翻正才可归位。 */
  const skipReveal = () => {
    if (!spotlight || waitingForFlip) return
    if (spotlightPhase === "charge") show(spotlight)
    else settle(spotlight)
  }

  // 全部翻开：低档几乎即翻，高档等上一张落定再翻
  useEffect(() => {
    if (!auto || !next || spotlight) return
    const id = window.setTimeout(() => reveal(next), ritualOf(next.rarity) ? 160 : 70)
    return () => window.clearTimeout(id)
  })

  useEffect(() => {
    live.current = { skip: skipReveal, canSkip: !flatSettled && !!spotlight && !waitingForFlip }
    finale.current = Math.max(...sorted.map((card) => RARITY_ORDER.indexOf(card.rarity)), flat?.bonus ? RARITY_ORDER.indexOf(flat.bonus.rarity) : -1)
  })

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.repeat || (event.key !== " " && event.key !== "Enter")) return
      if (event.target instanceof Element && event.target.closest("button, [role=button]")) return
      if (!live.current.canSkip) return
      event.preventDefault()
      live.current.skip()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (allOpen) playSfx(finale.current >= FINALE_FROM ? "levelup" : "success")
  }, [allOpen])

  useEffect(() => {
    if (!isFlat || !allOpen || skipToResult) return
    const timer = window.setTimeout(() => setFinishAnimation(true), reduced ? 0 : MANUAL_FLIP_MS)
    return () => window.clearTimeout(timer)
  }, [allOpen, isFlat, reduced, skipToResult])

  useEffect(() => {
    if (flatSettled) settlementRef.current?.focus({ preventScroll: true })
  }, [flatSettled])

  const tearOpen = () => {
    if (torn.current) return
    torn.current = true
    tear.current = null
    playSfx("tear")
    setProgress(1)
    setStage("torn")
    if (reduced) {
      later(80, () => setStage("stack"))
      return
    }
    // 卡一张张从撕口抽出来（和 cardStyle 里每张 70ms 的错开对上），最后落成一摞
    sorted.forEach((_, order) =>
      later(180 + order * 70, () => playSfx("deal", { rate: 0.92 + order * 0.05, volume: 0.7 })),
    )
    later(TEAR_MS, () => {
      playSfx("thud", { volume: 0.6 })
      setStage("stack")
    })
  }

  const onTearDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (stage !== "seal") return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pack = event.currentTarget.closest(".op__pack")
    tear.current = {
      x: event.clientX,
      width: (pack?.getBoundingClientRect().width ?? PACK_W) * 0.75,
      moved: false,
      tick: 0,
      p: 0,
    }
    setSnapping(false)
  }

  const onTearMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = tear.current
    if (!drag) return
    const p = Math.min(Math.max((drag.x - event.clientX) / drag.width, 0), 1)
    if (p > 0.03) drag.moved = true
    drag.p = p
    // 每拖过约 8% 的进度响一下
    const tick = Math.floor(p / 0.08)
    if (tick !== drag.tick) {
      drag.tick = tick
      if (tick > 0 && p < 1) playSfx("tick")
    }
    setProgress(p)
    if (p >= 1) tearOpen()
  }

  const onTearUp = (cancelled: boolean) => {
    const drag = tear.current
    if (!drag) return
    tear.current = null
    // 只是点了一下，或者已经拖过大半：直接撕开
    if (!cancelled && (!drag.moved || drag.p >= 0.85)) {
      tearOpen()
      return
    }
    setSnapping(true)
    setProgress(0)
    if (drag.moved) playSfx("lift")
  }

  const onTearKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      tearOpen()
    }
  }

  const quickClose = () => {
    if (props.mode !== "flat") props.onQuick()
    else if (flatSettled) props.onClose()
    else {
      timers.current.forEach((id) => window.clearTimeout(id))
      setAuto(false)
      setConfirming(false)
      setSkipToResult(true)
    }
  }

  /** Esc 和 × 共用：还有 E 以上的卡没翻开时先问一句 */
  const requestClose = () => {
    if (flat?.busy) return
    if (asking) {
      setConfirming(false)
      return
    }
    playSfx("close")
    if (!allOpen && pendingHigh > 0) setConfirming(true)
    else quickClose()
  }

  useModal(rootRef, { onClose: requestClose })

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
    } else if (phase === "show" || phase === "hold") {
      scale = 1.32
      z = 300
    } else {
      x = `calc(${order - (sorted.length - 1) / 2} * var(--pitch))`
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
      ? "拖住右上角的撕条往左撕开，也可以直接点一下"
      : stage === "torn"
        ? ""
        : spotlightPhase === "hold"
          ? "点击卡面或按空格收起"
          : spotlight
            ? waitingForFlip ? "" : "点击或按空格跳过"
            : next
              ? `点最上面那张翻开 · 还剩 ${unrevealed.length} 张`
              : allOpen
                ? isFlat ? "本包已收入卡册" : "把卡拖到下面的框里单张放到桌面，或者一次处理全部"
                : ""
  const announce = stage === "stack" && !allOpen && said ? said : hint
  const dim = !!spotlight && BIG[spotlight.rarity]

  return (
    <div
      ref={rootRef}
      className={`op ${(!isFlat && allOpen) || flatSettled ? "is-done" : ""}${flat ? " op--flat" : ""}`}
      data-stage={stage}
      data-dim={dim && !flatSettled ? "" : undefined}
      data-handoff={handoff ? "" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={flatSettled ? "开包结算" : "开包"}
      style={
        {
          "--gaps": Math.max(1, sorted.length - 1),
          ...(dim && spotlight ? { "--burst": RARITY_COLOR[spotlight.rarity] } : {}),
        } as CSSProperties
      }
    >
      <div className="op__backdrop" onClick={flatSettled ? undefined : skipReveal} />
      {!flatSettled && <i className="op__burst" data-rarity={dim ? spotlight?.rarity : undefined} aria-hidden />}
      {burst && !flatSettled && (
        <div
          key={burst.id}
          className="op__boom"
          data-rarity={burst.rarity}
          style={{ "--c": burst.rarity === "Prismatic" ? "#ffffff" : RARITY_COLOR[burst.rarity] } as CSSProperties}
          aria-hidden
        >
          <i className="op__boom-flash" />
          <i className="op__boom-ring" />
          {Array.from({ length: 14 }, (_, i) => (
            <i
              key={i}
              className="op__boom-spark"
              style={{ "--a": `${i * (360 / 14)}deg`, "--i": i, "--far": `${-30 - (i % 2) * 14}vmin` } as CSSProperties}
            />
          ))}
        </div>
      )}
      {shattering && <div className="op__shatter" aria-hidden />}
      {/* E 以上亮相时在卡下方报出稀有度；额外镜像卡标出「额外获得」 */}
      {!flatSettled && spotlight && (spotlightPhase === "show" || spotlightPhase === "hold") && (
        <div
          key={keyOf(spotlight)}
          className="op__title"
          data-rarity={spotlight.rarity}
          data-bonus={spotlight.isBonus ? "" : undefined}
          style={{ "--c": RARITY_COLOR[spotlight.rarity] } as CSSProperties}
          aria-hidden
        >
          {spotlight.isBonus
            ? `额外获得：${spotlight.name} 的镜像 · ${RARITY_LABEL[spotlight.rarity]}`
            : RARITY_LABEL[spotlight.rarity]}
        </div>
      )}

      {(!flatSettled || handoff) && (
      <div className="op__table" inert={handoff} aria-hidden={handoff || undefined}>
        {sorted.map((card, order) => {
          const phase = phaseOf(card)
          const flipped = phase === "show" || phase === "hold" || phase === "slot"
          const isTop = card === next && !spotlight
          return (
            <div
              key={keyOf(card)}
              className={`op-card ${isTop ? "is-top" : ""}`}
              data-phase={stage === "stack" ? (phase === "hold" ? "show" : phase) : stage}
              data-rarity={card.rarity}
              data-bonus={card.isBonus ? "" : undefined}
              style={cardStyle(card, order)}
              onPointerDown={(event) => {
                if (!isFlat && phase === "slot") startCardPointerDrag(event, { card }, {
                  onStart: () => setDraggingCard(true),
                  onFinish: () => setDraggingCard(false),
                })
              }}
              onClick={() => {
                if (isTop) reveal(card)
                else if (card === spotlight) skipReveal()
              }}
              role={isTop ? "button" : flipped ? "group" : undefined}
              tabIndex={isTop ? 0 : undefined}
              aria-label={isTop ? "翻开这张卡" : flipped ? `${card.name}，${RARITY_LABEL[card.rarity]}` : undefined}
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
                  {flipped && card.isBonus && (
                    <span className="op-card__bonus-tag">额外镜像</span>
                  )}
                  <i className="op-card__sweep" aria-hidden />
                </div>
              </div>
            </div>
          )
        })}

        {stage !== "stack" && (
          <div className="op__pack" style={{ ...enterStyle, "--tear-p": progress } as CSSProperties}>
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
                onPointerUp={() => onTearUp(false)}
                onPointerCancel={() => onTearUp(true)}
                onClick={(event) => { if (isFlat && event.detail === 0) tearOpen() }}
                onKeyDown={onTearKey}
              />
            )}
          </div>
        )}
      </div>
      )}

      {allOpen && !isFlat && (
        <ul className="op__tally" aria-label="本包稀有度汇总">
          {tally.map(({ rarity, count }) => (
            <li key={rarity} style={{ "--c": RARITY_COLOR[rarity] } as CSSProperties}>
              <i aria-hidden />
              {RARITY_LABEL[rarity]}
              <b>×{count}</b>
            </li>
          ))}
        </ul>
      )}

      {allOpen && !isFlat && (
        <div
          className={`op__drop ${draggingCard ? "is-active" : ""}`}
          data-card-drop
        >
          <b>拖到这里</b>
          <span>单张放到桌面</span>
        </div>
      )}

      {flatSettled && flat && (
        <section
          className="op__settlement"
          aria-busy={flat.busy}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setResultEntered(true)
          }}
        >
          <header className="op__settlement-head">
            <h2 ref={settlementRef} tabIndex={-1}>本包已收入卡册</h2>
            <span>获得 {cards.length + (flat.bonus ? 1 : 0)} 张卡</span>
          </header>
          <ul className="op__settlement-cards" aria-label="本包卡牌">
            {sorted.map((card) => (
              <li key={keyOf(card)}><OpenerFace card={card} /></li>
            ))}
            {flat.bonus && <li key={keyOf(flat.bonus)}><OpenerFace card={flat.bonus} /><span className="op__bonus">镜像奖励</span></li>}
          </ul>
          {flat.error && <p role="alert" className="op__settlement-error">{flat.error}</p>}
          <div className="op__actions">
            <button type="button" className={`op__btn${canOpenNext ? "" : " op__btn--main"}`} disabled={flat.busy} onClick={requestClose}>
              关闭
            </button>
            {canOpenNext && (
              <button type="button" className="op__btn op__btn--main" disabled={flat.busy} onClick={onOpenNext}>
                {flat.busy ? "开启中…" : `继续开包（剩 ${remaining}）`}
              </button>
            )}
          </div>
        </section>
      )}
      {!flatSettled && (
      <div className="op__foot">
        {hint && (
          // key 用提示本身：换了一句就重新淡入
          <p className="op__hint" key={hint} aria-hidden>
            {hint}
          </p>
        )}
        {stage === "stack" && !allOpen && (spotlight ? null : (
          <button
            type="button"
            className="op__btn op__btn--main"
            onClick={() => {
              playSfx("deal")
              setAuto(true)
            }}
            disabled={auto}
          >
            全部翻开
          </button>
        ))}
        {allOpen && props.mode !== "flat" && (
          <div className="op__actions">
            <button
              type="button"
              className="op__btn"
              onClick={() => {
                playSfx("slide")
                props.onQuick()
              }}
            >
              存入卡册
            </button>
            <button
              type="button"
              className="op__btn op__btn--main"
              onClick={() => {
                playSfx("whoosh")
                props.onDone()
              }}
            >
              全部放到桌面
            </button>
            {remaining > 0 && onOpenNext && (
              <button
                type="button"
                className="op__btn op__btn--main"
                onClick={() => {
                  playSfx("open")
                  onOpenNext()
                }}
              >
                继续开包（剩 {remaining}）
              </button>
            )}
          </div>
        )}
      </div>
      )}

      <p className="op__sr" role="status" aria-live="polite" hidden={flatSettled}>
        {announce}
      </p>

      {asking && (
        <div className="op__confirm" role="alert">
          <span>还有 {pendingHigh} 张 E 及以上的卡没翻开，确定跳过？</span>
          <button type="button" className="op__btn" onClick={() => setConfirming(false)}>
            继续翻
          </button>
          <button
            type="button"
            className="op__btn op__btn--main"
            onClick={() => {
              playSfx("close")
              quickClose()
            }}
          >
            确定跳过
          </button>
        </div>
      )}

      {!flatSettled && (
        <button type="button" className="op__close" onClick={requestClose} aria-label={flat ? "关闭开包" : "关闭开包，卡牌收进卡册"}>
          ×
        </button>
      )}
      {!isFlat && <CardDragLayer root={rootRef} />}
    </div>
  )
}
