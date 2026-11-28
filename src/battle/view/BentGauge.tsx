import { useId } from "react"

interface Props {
  side: "boss" | "party"
  polygon: string
  pct: number
  fillX: number
  fillWidth: number
}

const TRACK_X = 4
const TRACK_W = 452

// 端盖每高 24 格横移 8 格。把填充区间映到斜切后的槽体两端，满血不留缝。
const FILL_MATRIX = {
  boss: `matrix(${(452 - 20 / 3) / 452} 0 ${-1 / 3} 1 ${4 + 26 / 3 - 4 * (452 - 20 / 3) / 452} 0)`,
  party: `matrix(${(452 - 20 / 3) / 452} 0 ${1 / 3} 1 ${4 - 6 / 3 - 4 * (452 - 20 / 3) / 452} 0)`,
}

const PALETTE = {
  boss: { from: "#9e1c3a", mid: "#e84568", to: "#ff8ab5", track: "#181014", glow: "#d9488a" },
  party: { from: "#7af4ff", mid: "#2b92e8", to: "#14458a", track: "#141016", glow: "#5cc8ff" },
}

/** 25/50/75% 刻度：x 为血量比例位置，y 为该位置所在台阶的上下沿 */
function ticks(side: "boss" | "party") {
  const at = (p: number) => (side === "boss" ? TRACK_X + TRACK_W * p : TRACK_X + TRACK_W * (1 - p))
  const low = [26, 50] as const
  const high = [6, 30] as const
  const band = (p: number) => {
    const x = at(p)
    if (side === "boss") return x < 250 ? low : x > 278 ? high : low
    return x < 182 ? high : x > 210 ? low : high
  }
  return [0.25, 0.5, 0.75].map((p) => ({ p, x: at(p), y: band(p) }))
}

export function BentGauge({ side, polygon, pct, fillX, fillWidth }: Props) {
  const uid = useId().replace(/:/g, "")
  const c = PALETTE[side]
  const clip = `clip-${uid}`
  const fillClip = `fill-${uid}`
  const hp = `hp-${uid}`
  const flash = `flash-${uid}`
  const tube = `tube-${uid}`
  const shine = `shine-${uid}`
  const low = pct > 0 && pct <= 25

  return (
    <svg
      className={`choke-bent-svg choke-bent-svg--${side}`}
      data-low={low ? "true" : undefined}
      viewBox="0 0 460 54"
      preserveAspectRatio="none"
    >
      <defs>
        <clipPath id={clip}>
          <polygon points={polygon} />
        </clipPath>
        <clipPath id={fillClip}>
          <rect x={fillX} y="0" width={fillWidth} height="54" />
        </clipPath>
        <linearGradient id={hp} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={c.from} />
          <stop offset="55%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.to} />
        </linearGradient>
        <linearGradient id={flash} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#ff94a8" />
          <stop offset="100%" stopColor="#ff2e4c" />
        </linearGradient>
        <linearGradient id={tube} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="22%" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={shine} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <polygon points={polygon} fill={c.track} />

      <g clipPath={`url(#${clip})`}>
        <g transform={FILL_MATRIX[side]}>
          <rect className="choke-bent-ghost" x={fillX} y="0" width={fillWidth} height="54" fill={`url(#${flash})`} />
          <rect className="choke-bent-fill" x={fillX} y="0" width={fillWidth} height="54" fill={`url(#${hp})`} />
          <rect className="choke-bent-tube" x={fillX} y="0" width={fillWidth} height="54" fill={`url(#${tube})`} />
          <g clipPath={`url(#${fillClip})`}>
            <rect className="choke-bent-shine" x="-60" y="0" width="60" height="54" fill={`url(#${shine})`} />
          </g>
        </g>
        {/* 槽内侧阴影，压出凹陷感 */}
        <polygon points={polygon} fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="7" />
      </g>

      {ticks(side).map((t) => {
        const reached = pct / 100 >= t.p
        return (
          <g key={t.p} className="choke-bent-tick" data-reached={reached ? "true" : undefined}>
            <line x1={t.x} x2={t.x} y1={t.y[0] + 1} y2={t.y[1] - 1} stroke="#000" strokeOpacity="0.6" strokeWidth="3" />
            <line x1={t.x} x2={t.x} y1={t.y[0] + 1} y2={t.y[1] - 1} stroke={reached ? "#ffe2ee" : "#6e5562"} strokeWidth="1.4" />
          </g>
        )
      })}

      {/* 平涂梅子色边框 + 细高光线 */}
      <polygon points={polygon} fill="none" stroke="#1c1216" strokeWidth="5" strokeLinejoin="bevel" />
      <polygon points={polygon} fill="none" stroke="#6e4b5b" strokeWidth="2.2" strokeLinejoin="bevel" />
      <polygon points={polygon} fill="none" stroke="#f09bc2" strokeOpacity="0.38" strokeWidth="0.8" strokeLinejoin="bevel" />
    </svg>
  )
}
