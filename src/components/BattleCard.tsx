import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

import "./hero-card.css"
import "./battle-card.css"

export type BattleCardData = {
  id: string
  name: string
  nameEn: string
  cost: number
  atk: number
  bpm: number
  acc: string
  tint: string
  no: string
  trait: string
}

export type BattleCardStatus = "ready" | "acted"

type BattleCardProps = {
  data: BattleCardData
  status: BattleCardStatus
  striking: boolean
  shaking: boolean
  disabled?: boolean
  onPlay: () => void
  onStrikeEnd: () => void
}

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(Math.max(value, min), max)

const adjust = (
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
) => toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin)

export function BattleCard({
  data,
  status,
  striking,
  shaking,
  disabled,
  onPlay,
  onStrikeEnd,
}: BattleCardProps) {
  const holoRef = React.useRef<HTMLDivElement>(null)
  const acted = status === "acted"
  const inert = acted || disabled

  const paintFoil = (event: React.PointerEvent<HTMLButtonElement>) => {
    const el = holoRef.current
    if (!el || acted) return
    const rect = el.getBoundingClientRect()
    const px = clamp(((event.clientX - rect.left) / rect.width) * 100)
    const py = clamp(((event.clientY - rect.top) / rect.height) * 100)

    el.style.setProperty("--pointer-x", `${px}%`)
    el.style.setProperty("--pointer-y", `${py}%`)
    el.style.setProperty("--background-x", `${adjust(px, 0, 100, 37, 63)}%`)
    el.style.setProperty("--background-y", `${adjust(py, 0, 100, 33, 67)}%`)
  }

  const setFoil = (value: number) => {
    holoRef.current?.style.setProperty("--card-opacity", String(value))
  }

  /* 行动结束 / 冲刺时收回全息光，避免禁用后残留高光 */
  React.useEffect(() => {
    if (acted || striking) setFoil(0)
  }, [acted, striking])

  return (
    <motion.div
      className={cn(
        "battle-card",
        acted && "is-acted",
        striking && "is-striking",
        inert && "is-inert"
      )}
      animate={
        striking
          ? {
              y: [0, -252, -196, 0],
              scale: [1, 1.16, 1.1, 1],
              rotate: [0, -7, 5, 0],
            }
          : { y: 0, scale: 1, rotate: 0 }
      }
      transition={
        striking
          ? { duration: 0.92, times: [0, 0.34, 0.56, 1], ease: "easeInOut" }
          : { type: "spring", stiffness: 260, damping: 26 }
      }
      onAnimationComplete={() => {
        if (striking) onStrikeEnd()
      }}
    >
      <motion.div
        className="battle-card__shake"
        animate={shaking ? { x: [0, -7, 7, -5, 5, 0] } : { x: 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        <div ref={holoRef} className="holo-card" data-rarity="rare holo">
          <div className="holo-card__translater">
            <button
              type="button"
              className="holo-card__rotator"
              aria-label={`出牌 ${data.name}，消耗 ${data.cost} AP`}
              disabled={inert}
              onClick={onPlay}
              onPointerMove={paintFoil}
              onPointerDown={() => {
                if (!acted) setFoil(1)
              }}
              onPointerEnter={() => {
                if (!acted) setFoil(1)
              }}
              onPointerLeave={() => setFoil(0)}
            >
              <div className="holo-card__back" aria-hidden />

              <div className="holo-card__front">
                <div
                  className="battle-face"
                  style={{ "--tint": data.tint } as React.CSSProperties}
                >
                  <div className="battle-face__mat" aria-hidden />

                  <div className="battle-face__top">
                    <span className="battle-face__brand">CHOKE! TCG</span>
                    <span className="battle-face__pips">◆◆◇</span>
                  </div>

                  <div className="battle-face__art">
                    <BattleArt tint={data.tint} seed={data.id} />
                  </div>

                  <div className="battle-face__cost">
                    <b>{data.cost}</b>
                    <i>AP</i>
                  </div>

                  <div className="battle-face__name">{data.name}</div>
                  <div className="battle-face__en">{data.nameEn}</div>

                  <div className="battle-face__stats">
                    <span>
                      <i>BPM</i>
                      <b>{data.bpm}</b>
                    </span>
                    <span>
                      <i>ACC</i>
                      <b>{data.acc}</b>
                    </span>
                    <span>
                      <i>PWR</i>
                      <b>{data.atk.toLocaleString("en-US")}</b>
                    </span>
                  </div>

                  <div className="battle-face__trait">
                    <span className="battle-face__trait-dot" aria-hidden />
                    {data.trait}
                  </div>

                  <div className="battle-face__foot">
                    <span>NO. {data.no}</span>
                    <span>KIRARA</span>
                  </div>
                </div>

                <div className="holo-card__shine" aria-hidden />
                <div className="holo-card__glare" aria-hidden />

                {acted && (
                  <div className="battle-card__acted" aria-hidden>
                    <span>行动结束</span>
                    <span>STANDBY</span>
                  </div>
                )}
              </div>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------
   占位卡图：osu! 判定圈 + 滑条
   ------------------------------------------------------------------ */
function BattleArt({ tint, seed }: { tint: string; seed: string }) {
  const rawId = React.useId()
  const id = rawId.replace(/[:]/g, "")
  const g = (name: string) => `${name}-${id}`

  const drift = (seed.charCodeAt(0) % 5) * 6
  const cx = 34 + drift
  const cy = 42

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id={g("glow")} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tint} stopOpacity="0.75" />
          <stop offset="70%" stopColor={tint} stopOpacity="0.12" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g("slide")} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="60%" stopColor={tint} stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7cc4ff" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      <rect width="100" height="100" fill="#08070c" />
      <ellipse cx="42" cy="46" rx="56" ry="46" fill={`url(#${g("glow")})`} />

      <g stroke={tint} fill="none" opacity="0.32">
        <circle cx={cx} cy={cy} r="31" strokeWidth="0.4" strokeDasharray="1.5 4" />
        <circle cx={cx} cy={cy} r="21" strokeWidth="0.8" />
      </g>

      <g opacity="0.9">
        <circle cx={cx} cy={cy} r="15" fill={tint} fillOpacity="0.1" stroke={tint} strokeWidth="1.4" />
        <circle cx={cx} cy={cy} r="10.5" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="0.6" />
        <circle cx={cx} cy={cy} r="3.4" fill={tint} fillOpacity="0.85" />
        <text
          x={cx}
          y={cy + 3.4}
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill="#ffffff"
          fillOpacity="0.9"
          fontFamily="JetBrains Mono Variable, monospace"
        >
          {seed.length % 7}
        </text>
      </g>

      <path
        d="M12 86 C 34 62, 56 70, 88 24"
        fill="none"
        stroke={`url(#${g("slide")})`}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="88" cy="24" r="3.2" fill="#e8f6ff" fillOpacity="0.9" />
      <circle cx="12" cy="86" r="2.4" fill="#ffffff" fillOpacity="0.55" />

      <g fill="#ffffff" opacity="0.4">
        <circle cx="82" cy="80" r="0.9" />
        <circle cx="68" cy="14" r="0.8" />
        <circle cx="18" cy="26" r="0.7" />
      </g>

      <rect x="0" y="94" width="100" height="6" fill="#000" opacity="0.55" />
    </svg>
  )
}
