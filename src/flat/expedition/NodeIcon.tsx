import type { NodeKind } from "./layout"

/** 圆台格面上的符号与图例徽章；颜色由 run.css 的 xp-k-* 变量提供。 */
export function NodeIcon({ kind }: { kind: NodeKind }) {
  switch (kind) {
    case "battle":
      return (
        <g className="xp-ico__line">
          <path d="M-10 -11 L6 5 M10 -11 L-6 5" />
          <path d="M2 9 L9 2 M-2 9 L-9 2" />
          <path d="M6 5 L12 11 M-6 5 L-12 11" />
        </g>
      )
    case "danger":
      return (
        <g className="xp-ico__line xp-fx-flicker">
          <path d="M0 -13 L14 11 H-14 Z" className="xp-ico__soft" />
          <path d="M0 -4 V3" />
          <circle cx="0" cy="7.4" r="1.2" className="xp-ico__solid" />
        </g>
      )
    case "boss":
      return (
        <g>
          <path d="M-13 9 L-13 -5 L-6.5 1 L0 -10 L6.5 1 L13 -5 L13 9 Z" className="xp-ico__solid" />
          <path d="M-13 12.5 H13" className="xp-ico__line-only" />
          <circle cx="-13" cy="-6.5" r="2" className="xp-ico__solid" />
          <circle cx="0" cy="-11.5" r="2.2" className="xp-ico__solid" />
          <circle cx="13" cy="-6.5" r="2" className="xp-ico__solid" />
          <circle cx="0" cy="3" r="2.2" className="xp-ico__gem" />
        </g>
      )
    case "event":
      return (
        <g>
          <g className="xp-ico__line">
            <path d="M-5.5 -6 Q-5.5 -12.5 0 -12.5 Q5.5 -12.5 5.5 -7 Q5.5 -3 0 -0.5 V3" />
          </g>
          <circle cx="0" cy="8.5" r="1.7" className="xp-ico__solid" />
          <path className="xp-ico__solid xp-fx-spark" d="M11 -10 l1.3 3.2 3.2 1.3 -3.2 1.3 -1.3 3.2 -1.3 -3.2 -3.2 -1.3 3.2 -1.3z" />
          <path className="xp-ico__solid xp-fx-spark xp-fx-spark--late" d="M-12 6 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1z" />
        </g>
      )
    case "rest":
      return (
        <g>
          <path className="xp-ico__solid xp-fx-flame" d="M0 -13 C5 -7 10 -3 10 3 A10 10 0 0 1 -10 3 C-10 -2 -5 -5 -3.5 -10 C-2 -7 -1 -6 0 -6 C1 -9 0 -11 0 -13 Z" />
          <path className="xp-ico__gem xp-fx-flame xp-fx-flame--in" d="M0 -2 C3 1 5 3 5 6 A5 5 0 0 1 -5 6 C-5 3 -2 1 0 -2 Z" />
          <path className="xp-ico__line-only" d="M-10 12 L10 9 M-10 9 L10 12" />
        </g>
      )
    case "treasure":
      return (
        <g>
          <path d="M-12 -1 V-5 A12 8.5 0 0 1 12 -5 V-1 Z" className="xp-ico__solid" />
          <rect x="-12" y="-1" width="24" height="13" rx="2" className="xp-ico__solid" />
          <path d="M-12 -1 H12" className="xp-ico__seam" />
          <rect x="-3" y="-3" width="6" height="8" rx="1.5" className="xp-ico__gem" />
          <circle cx="0" cy="1" r="1.1" className="xp-ico__solid" />
        </g>
      )
    case "story":
      return (
        <g className="xp-fx-float">
          <path d="M0 -8 C-5 -11.5 -10 -11.5 -13.5 -9.5 V10 C-10 8 -5 8 0 11 C5 8 10 8 13.5 10 V-9.5 C10 -11.5 5 -11.5 0 -8 Z" className="xp-ico__solid" />
          <path d="M0 -8 V11" className="xp-ico__seam" />
          <path d="M-10 -4 H-4 M-10 0 H-4 M4 -4 H10 M4 0 H10" className="xp-ico__seam" />
        </g>
      )
    case "branch":
      return (
        <g className="xp-ico__line">
          <path d="M0 12 V0 M0 0 L-9 -9 M0 0 L9 -9" />
          <path d="M-3 -9 H-9 V-3 M3 -9 H9 V-3" />
        </g>
      )
    case "empty":
      return (
        <g className="xp-ico__line">
          <circle cx="0" cy="0" r="8" className="xp-ico__soft" />
          <circle cx="0" cy="0" r="2.6" className="xp-ico__solid" />
        </g>
      )
  }
}

/** 2.5D 椭圆圆台顶面的节点光效，遵循 prefers-reduced-motion。 */
export function NodeEffects({ kind, clipId, rx, ry }: { kind: NodeKind; clipId: string; rx: number; ry: number }) {
  switch (kind) {
    case "danger":
      return <ellipse className="xp-fx-danger" cx="0" cy="0" rx={rx} ry={ry} />
    case "boss":
      return (
        <>
          <ellipse className="xp-fx-bossglow" cx="0" cy="0" rx={rx} ry={ry} />
          <ellipse className="xp-fx-aura" cx="0" cy="0" rx={rx + 14} ry={ry + 8} />
        </>
      )
    case "treasure":
      return (
        <g clipPath={`url(#${clipId})`}>
          <polygon className="xp-fx-shine" points={`${-rx * 0.25},${-ry * 2} ${rx * 0.15},${-ry * 2} ${-rx * 0.1},${ry * 2} ${-rx * 0.5},${ry * 2}`} />
        </g>
      )
    case "rest":
      return (
        <>
          <circle className="xp-fx-mote" cx={-rx * 0.34} cy={-ry * 0.4} r="2.2" />
          <circle className="xp-fx-mote xp-fx-mote--b" cx={rx * 0.3} cy={-ry * 0.65} r="1.8" />
          <circle className="xp-fx-mote xp-fx-mote--c" cx={rx * 0.05} cy={-ry * 0.25} r="1.5" />
        </>
      )
    default:
      return null
  }
}

export function KindBadge({ kind }: { kind: NodeKind }) {
  return (
    <svg className={`xp-badge xp-k-${kind}`} viewBox="-16 -16 32 32" width="18" height="18" aria-hidden>
      <rect x="-15" y="-15" width="30" height="30" rx="9" className="xp-badge__bg" />
      <g className="xp-badge__icon" transform="scale(.78)">
        <NodeIcon kind={kind} />
      </g>
    </svg>
  )
}
