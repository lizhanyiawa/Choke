import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint, EdgeUnit } from "./edgeBattle"
import { arc, at, ease, heading, mix, path, polar, unit } from "./EdgeBulwarkFields"
import { along, areaOf, areaPath, direction, edgeDistance, left, point, rotate, type EdgeArea } from "./edgeSkills/geometry"
import { lifebringerChoreography, type LifebringerMotif } from "./edgeSkills/lifebringerChoreo"
import type { LifebringerBeat, SkillVisual } from "./edgeSkills/presentation"
import { battleFighters, unitOf, type FieldEffect } from "./edgeSkills/state"
import chronowheelOpal from "./edgeSkills/assets/chronowheel-opal.png"

const palette: Record<Rarity, { white: string; leaf: string; accent: string; shade: string }> = {
  C: { white: "#fff1e3", leaf: "#e8c2a1", accent: "#c8a6bc", shade: "#3d293c" },
  UC: { white: "#fff6e2", leaf: "#f3c589", accent: "#addbf3", shade: "#342646" },
  R: { white: "#f7f2ff", leaf: "#c5b0f6", accent: "#e8aad5", shade: "#352846" },
  E: { white: "#fff2ff", leaf: "#d8a1f4", accent: "#c1ceff", shade: "#40264c" },
  L: { white: "#fff7d7", leaf: "#f1c880", accent: "#f4adac", shade: "#443038" },
  Radiant: { white: "#fff3f3", leaf: "#ffb6d9", accent: "#ffd4af", shade: "#4c2944" },
  Prismatic: { white: "#fff8f2", leaf: "#e8bdff", accent: "#a8ddff", shade: "#423250" },
}
type Paint = (typeof palette)[Rarity]
type Scene = {
  battle: EdgeBattle
  fx: SkillVisual
  beat: LifebringerBeat
  motif: LifebringerMotif
  paint: Paint
  age: number
  t: number
  to: EdgePoint
  target?: EdgeUnit
}
const zero = { x: 0, y: 0 }
const opal = ["#ffe1b5", "#ffc0dd", "#cbbcff", "#b6dcfb"]
const leafPath = "M0 19C-21 8-25-18 0-37C17-21 25 4 0 19Z"
const petalPath = "M0 6C-15-6-19-29 0-46C18-32 19-6 0 6Z"
const pose = (p: EdgePoint, angle = 0, scale = 1) => at(p) + ` rotate(${angle}) scale(${scale})`
const circles = (area?: EdgeArea) => area?.parts.flatMap(part => part.kind === "circle" ? [part] : []) ?? []
const range = (s: Scene, fallback = 90) => circles(s.fx.area)[0]?.radius ?? fallback
const ordinal = (n: number) => Array.from({ length: n }, (_, i) => i)

function Leaf({ paint, where = zero, size = 1, angle = 0 }: { paint: Paint; where?: EdgePoint; size?: number; angle?: number }) {
  return <g transform={pose(where, angle, size)}>
    <path d={leafPath} fill={paint.leaf} fillOpacity=".29" stroke={paint.white} strokeWidth="2.3" />
    <path d="M0 19Q9-6 0-32M4-2-11-12M5-11 13-18" fill="none" stroke={paint.accent} strokeWidth="1.8" />
  </g>
}

function Drop({ paint, where = zero, size = 1, angle = 0 }: { paint: Paint; where?: EdgePoint; size?: number; angle?: number }) {
  return <g transform={pose(where, angle, size)}>
    <path d="M0-37Q12-12 18-4C31 24-27 30-19-1Q-13-15 0-37Z" fill={paint.accent} fillOpacity=".24"
      stroke={paint.white} strokeWidth="2.5" />
    <path d="M-10 2Q-9-7-3-13M3 14Q12 12 13 4" stroke={paint.white} strokeWidth="2.4" strokeLinecap="round" fill="none" />
  </g>
}

function Stem({ paint, where, length = 54, angle = 0, open = 1 }: { paint: Paint; where: EdgePoint; length?: number; angle?: number; open?: number }) {
  const q = Math.max(.04, open)
  return <g transform={pose(where, angle)}>
    <path d={`M0 0Q${9 * q} ${-length * .55 * q} 0 ${-length * q}M2 ${-length * .34 * q}q-16-3-22 ${-16 * q}`}
      fill="none" stroke={paint.white} strokeWidth="2.8" strokeLinecap="round" />
    <Leaf paint={paint} where={{ x: -14 * q, y: -length * .48 * q }} angle={-59 * q} size={.48 * q} />
    <Leaf paint={paint} where={{ x: 2 * q, y: -length * q }} angle={22 * q} size={.51 * q} />
  </g>
}

function Bloom({ paint, where = zero, petals = 5, size = 1, open = 1, twist = 0 }: {
  paint: Paint; where?: EdgePoint; petals?: number; size?: number; open?: number; twist?: number
}) {
  return <g transform={pose(where, twist, size)}>
    {ordinal(petals).map(i => <path key={i} d={petalPath} transform={`rotate(${i * 360 / petals}) scale(${.35 + .65 * open})`}
      fill={i % 2 ? paint.accent : paint.leaf} fillOpacity={.10 + open * .19}
      stroke={i % 2 ? paint.leaf : paint.white} strokeWidth={2.2 - open * .45} />)}
    <circle r={5 + 5 * open} fill={paint.white} fillOpacity=".8" />
  </g>
}

function ribbonCurve(from: EdgePoint, to: EdgePoint, bend: number, progress: number) {
  const control = along(mix(from, to, .5), left(direction(from, to)), bend)
  const corner = mix(from, control, progress)
  const head = mix(corner, mix(control, to, progress), progress)
  return { head, control: corner, d: `M${from.x} ${from.y}Q${corner.x} ${corner.y} ${head.x} ${head.y}` }
}

function Ribbon({ from, to, paint, bend = 35, width = 3, progress = 1, dashed = false }: {
  from: EdgePoint; to: EdgePoint; paint: Paint; bend?: number; width?: number; progress?: number; dashed?: boolean
}) {
  if (edgeDistance(from, to) < 3) return null
  const { d } = ribbonCurve(from, to, bend, progress)
  return <>
    <path d={d} fill="none" stroke={paint.leaf} strokeWidth={width * 4} opacity=".16" strokeLinecap="round" />
    <path d={d} fill="none" stroke={paint.white} strokeWidth={width}
      strokeDasharray={dashed ? "7 8" : undefined} strokeLinecap="round" opacity=".9" />
  </>
}

function AreaRim({ area, paint, weight = 1.8, fill = .035 }: {
  area?: EdgeArea; paint: Paint; weight?: number; fill?: number
}) {
  return area && <path d={areaPath(area)} fill={paint.leaf} fillOpacity={fill} stroke={paint.leaf}
    strokeOpacity=".76" strokeWidth={weight} strokeDasharray="7 9" />
}

function woodRing(radius: number, seed: number) {
  const points = ordinal(40).map(i => {
    const theta = i * 9
    const r = radius * (1 + Math.sin(i * 3 * Math.PI / 10 + seed) * .032 + Math.cos(i * Math.PI / 5 + seed) * .023)
    return polar(r, theta)
  })
  return path(points) + "Z"
}

function Lichen({ paint, where, radius, open, beat }: { paint: Paint; where: EdgePoint; radius: number; open: number; beat: number }) {
  return <g transform={at(where)}>
    {ordinal(4).map(i => {
      const angle = i * 90 - 29
      const offset = polar(radius * .40, angle)
      const scale = radius / 120 * (.63 + .34 * open)
      return <g key={i} transform={pose(offset, angle + 72, scale)} opacity={i < beat ? .84 : .28}>
        <path d="M-58 21Q-62-14-38-34Q-33-56-2-48Q28-51 36-28Q67-12 50 15Q39 43 12 42Q-28 54-58 21Z"
          fill={paint.leaf} fillOpacity=".16" stroke={paint.accent} strokeWidth="2.5" />
        <path d="M-39 19Q-31-16 4-28Q24-35 44-11M-32 27Q-10-5 25 1Q39 6 43 15M-8 32Q6 15 23 17"
          stroke={paint.white} strokeWidth="1.9" strokeOpacity=".68" fill="none" />
        <circle cx="-25" cy="11" r="3.2" fill={paint.white} />
        <circle cx="9" cy="-26" r="3.5" fill={paint.accent} />
      </g>
    })}
  </g>
}

function Dial({ paint, where, progress, large = false, count = 3, beat = 0 }: {
  paint: Paint; where: EdgePoint; progress: number; large?: boolean; count?: number; beat?: number
}) {
  const size = large ? 1.35 : .89
  return <g transform={pose(where, 0, size)}>
    {large && <image href={chronowheelOpal} x="-84" y="-84" width="168" height="168"
      transform={`rotate(${beat * 28 - progress * 36})`} opacity={.44 + progress * .25} />}
    <circle r="72" fill={paint.shade} fillOpacity=".24" />
    {[44, 58, 74].map((r, i) => <path key={r} d={woodRing(r, i + 1)} fill="none"
      stroke={large ? opal[(i + beat) % opal.length] : paint.leaf}
      strokeWidth={2.2 + i * .55} strokeOpacity={.44 + i * .16} />)}
    <g transform={`rotate(${-progress * (large ? 128 : 85) - beat * 18})`}>
      <path d={arc(67, -147, 47)} stroke={paint.white} strokeWidth={large ? 5 : 3.4} strokeLinecap="round" fill="none" />
      {ordinal(12).map(i => <path key={i} d={path([polar(61, i * 30), polar(i % 3 ? 66 : 70, i * 30)])}
        stroke={i % 3 ? paint.leaf : paint.white} strokeWidth={i % 3 ? 1.7 : 3.1} />)}
    </g>
    {large && beat > 0 && <g transform={`rotate(${beat * 29 - progress * 13})`}>
      {ordinal(beat === 1 ? 4 : beat === 2 ? 6 : 8).map(i => {
        const divisions = beat === 1 ? 4 : beat === 2 ? 6 : 8
        const rotation = i * 360 / divisions
        return <g key={i} transform={`rotate(${rotation})`}>
          {beat === 1 ? <path d={arc(87 - progress * 6, -110, -65)} stroke={opal[i % 4]} strokeWidth="4.8"
            fill="none" strokeLinecap="round" />
            : beat === 2 ? <path d="M0-91Q12-102 22-89L12-78Z" fill={opal[i % 4]} fillOpacity=".55" stroke={paint.white} strokeWidth="1.7" />
              : <path d={`M0 ${-81-progress*16}l7 11-7 13-7-13Z`} fill={opal[i % 4]} fillOpacity=".56"
                stroke={paint.white} strokeWidth="1.8" />}
        </g>
      })}
    </g>}
    {ordinal(Math.min(count, 4)).map(i => <Leaf key={i} paint={paint} where={polar(83, -104 + i * 32)}
      angle={-14 + i * 31} size={large ? .35 : .28} />)}
  </g>
}

function StemOrbits({ s, pulse = false }: { s: Scene; pulse?: boolean }) {
  const p = s.paint, r = range(s, 130), now = s.fx.beat ?? 1
  const open = pulse ? ease(s.t * 2) : .7
  return <g transform={at(s.to)}>
    {[.67, .83, 1].map((fraction, i) => <g key={i} transform={`rotate(${now * 37 + i * 107})`}>
      <path d={arc(r * fraction * open, -130, 124)} fill="none" stroke={i ? p.leaf : p.white}
        strokeWidth={i ? 2.8 : 4.2} opacity={.55 + i * .1} />
      <Leaf paint={p} where={polar(r * fraction * open, 124)} angle={-55} size={.42 + .1 * i} />
    </g>)}
  </g>
}

function lineEnds(fx: SkillVisual) {
  const band = fx.area?.parts.find(part => part.kind === "polygon")
  if (!band || band.kind !== "polygon") return [fx.from, fx.to] as const
  const { points } = band
  return [mix(points[0], points[3], .5), mix(points[1], points[2], .5)] as const
}

function Flight({ s }: { s: Scene }) {
  const { fx, beat, paint, motif, t } = s
  const bend = beat.kind === "needle" ? -15 : beat.kind === "bank" ? 44 : beat.kind === "relay" ? -47
    : motif === "sprig" ? -31 : motif === "dewneedle" ? 52 : 34
  const q = ribbonCurve(fx.from, s.to, bend, t)
  const axis = direction(q.control, q.head)
  const angle = heading(axis) + 90
  return <>
    <Ribbon from={fx.from} to={s.to} paint={paint} bend={bend} progress={t}
      width={beat.kind === "bank" ? 5.5 : beat.kind === "needle" ? 1.7 : 2.8} />
    {beat.kind === "needle" ? <g transform={pose(q.head, angle)}>
      <path d="M0-22 5-4 2 20-3 13-5-4Z" fill={paint.white} stroke={paint.leaf} strokeWidth="2" />
    </g> : beat.kind === "bank" ? <g transform={pose(q.head, angle)}>
      <path d="M0-33 22-10 15 21 0 29-15 21-22-10Z" fill={paint.accent} fillOpacity=".55" stroke={paint.white} strokeWidth="3" />
      <path d="M0-33 6-6 15 21M6-6-15 21M-22-10 6-6 22-10" stroke={paint.white} strokeWidth="2" fill="none" />
    </g> : beat.kind === "relay" ? <Stem paint={paint} where={q.head} length={36} angle={angle} open={.45 + t * .5} />
      : beat.kind === "return" ? <Drop paint={paint} where={q.head} size={motif === "dewneedle" ? .83 : .58} angle={angle} />
        : motif === "sprig" ? <Stem paint={paint} where={q.head} length={38} angle={angle + 24} />
          : <g transform={pose(q.head, angle)}>
            <Leaf paint={paint} size={.78} />
            <Leaf paint={paint} where={{ x: -12, y: 14 }} size={.43} angle={-40} />
            <Leaf paint={paint} where={{ x: 12, y: 10 }} size={.39} angle={41} />
          </g>}
  </>
}

function ShieldBody({ s, hit = false }: { s: Scene; hit?: boolean }) {
  const { paint: p, motif, fx, beat, to } = s
  const facing = hit ? heading(direction(to, fx.from)) + 90 : heading(beat.axis) - 90
  const count = motif === "mirrorbud" ? 4 : motif === "seed" || motif === "sapward" ? 3 : 2
  const pressure = s.target ? s.target.shield / Math.max(1, s.target.shieldStart ?? s.target.shield) : 1
  const open = hit ? 1 - ease(s.t) * .23 : .76 + .24 * ease(s.age / .24)
  const breakNow = hit && beat.kind === "break"
  return <g transform={pose(to, facing, open)}>
    {ordinal(count).map(i => {
      const angle = (i - (count - 1) / 2) * (motif === "mirrorbud" ? 74 : 56)
      const offset = breakNow ? 31 * ease(s.t) : 0
      return <g key={i} transform={`rotate(${angle}) translate(0 ${-offset}) rotate(${breakNow ? 16 * (i % 2 ? -1 : 1) * s.t : 0})`}>
        {motif === "seed" ? <path d="M-17-26Q-30-45 0-64Q32-44 16-26L0-34Z" fill={p.leaf}
          fillOpacity={.14 + pressure * .25} stroke={p.white} strokeWidth="2.7" />
          : motif === "mirrorbud" ? <path d="M-22-34-16-56 4-68 24-43 17-27-4-38Z" fill={p.accent}
            fillOpacity={.14 + pressure * .18} stroke={p.white} strokeWidth="2.6" />
            : motif === "sapward" ? <path d="M-15-29Q-31-50 0-73Q28-56 13-29L0-40Z" fill={p.leaf}
              fillOpacity=".22" stroke={p.white} strokeWidth="2.5" />
              : motif === "twinbud" ? <path d="M-25-28Q-22-63-1-63Q19-63 23-27L0-37Z" fill={p.leaf}
                fillOpacity=".21" stroke={p.white} strokeWidth="2.8" />
                : motif === "forestexit" ? <path d="M-32-23Q-22-55 8-60Q27-43 26-19Q6-42-32-23Z" fill={p.leaf}
                  fillOpacity=".22" stroke={p.white} strokeWidth="2.5" />
                  : <Leaf paint={p} where={{ x: 0, y: -36 }} angle={i ? 24 : -24} size={motif === "sharedbranch" ? .74 : .69} />}
        <path d="M-10-37 1-45 9-41 12-49" fill="none" stroke={p.accent}
          opacity={hit ? .96 : Math.max(0, .7 - pressure)} strokeWidth="2.7" />
      </g>
    })}
    {hit && !breakNow && <path d={arc(65, -147 - s.t * 6, -41 + s.t * 7)} fill="none" stroke={p.white}
      strokeWidth={5 * (1 - s.t) + 1} strokeLinecap="round" />}
  </g>
}

function Armed({ s }: { s: Scene }) {
  const { paint: p, motif, to, age, beat } = s
  const next = beat.count ?? 1
  const up = Math.sin(age * 4.2) * 3
  const leftFoot = { x: to.x - 44, y: to.y + 20 }
  const rightFoot = { x: to.x + 40, y: to.y + 16 }
  if (next < 1) return null
  switch (motif) {
    case "renew":
      return <>{ordinal(next).map(i => <Leaf key={i} paint={p} where={{ x: to.x + 35 + i * 12, y: to.y + 20 - i * 11 }}
        angle={58 + i * 19} size={.38} />)}</>
    case "sprig":
      return <Stem paint={p} where={leftFoot} length={37} angle={-57} open={.73 + Math.sin(age * 4) * .14} />
    case "bud":
      return <g transform={pose({ x: rightFoot.x, y: rightFoot.y + up }, 26)}>
        <path d="M0 13Q-25-7-7-26L1-38Q22-21 14 2Z" fill={p.leaf} fillOpacity=".55" stroke={p.white} strokeWidth="2.2" />
        <path d="M0 13-4-4 9-11" stroke={p.accent} strokeWidth="2.1" fill="none" />
      </g>
    case "stepdew": {
      const moving = s.target?.move
      const offset = moving ? along(to, direction(moving, to), 51) : { x: leftFoot.x, y: leftFoot.y + up }
      return <>
        <Drop paint={p} where={offset} size={.69} angle={moving ? -24 : 12} />
        {moving && <Ribbon paint={p} from={offset} to={to} bend={11} dashed />}
      </>
    }
    case "borrowroot":
      return <g transform={at(leftFoot)}><path d="M-14-15Q-19 10 0 12Q20 9 13-16M-9-4 10-5M0 12v16" stroke={p.white}
        strokeWidth="2.8" fill="none" /><circle cy="-14" r="4.5" fill={p.accent} /></g>
    case "cluster":
      return <Bloom paint={p} where={{ x: to.x - 39, y: to.y - 38 + up }} petals={3} size={.52} open={.68} twist={-30} />
    case "vine":
      return <Stem paint={p} where={rightFoot} angle={43} length={46} open={ease(s.t)} />
    case "rootline":
      return <g transform={at(leftFoot)}><path d="M-9-29Q9-12-6 11M0-26Q19-11 3 14" fill="none"
        stroke={p.white} strokeWidth="3.2" /><Leaf paint={p} where={{ x: -2, y: -20 }} size={.33} angle={-27} /></g>
    case "sapward":
      return <>{ordinal(next).map(i => <Drop key={i} paint={p} where={{ x: to.x - 26 + i * 26, y: to.y + 44 }} size={.34} />)}</>
    case "scarward":
      return <g transform={pose(rightFoot, 35)}><path d="M-12-24H10Q21 0 10 24H-12Q-22 0-12-24Z"
        fill={p.leaf} fillOpacity=".22" stroke={p.white} strokeWidth="2.5" />
        <path d="M-9-16 11-10M-13-4 13 4M-10 10 10 18" fill="none" stroke={p.accent} strokeWidth="2.2" /></g>
    case "rootbond":
      return <>{ordinal(next).map(i => <Leaf key={i} paint={p} where={along(to, rotate({ x: 1, y: 0 }, 138 + i * 23), 53)}
        size={.31} angle={-58 + i * 23} />)}</>
    case "rewind":
      return <g transform={at(to)}>{ordinal(next).map(i => <path key={i} d={arc(46 + 9 * i, 142 - age * 16, 224 - age * 16)}
        fill="none" stroke={i ? p.accent : p.white} strokeWidth="3.2" strokeLinecap="round" />)}</g>
    case "sharedbranch":
      return <Stem paint={p} where={rightFoot} length={31 + next * 9} angle={57} open={.81} />
    case "roamingroot":
      return <StemOrbits s={s} />
    case "dewneedle":
      return <Drop paint={p} where={{ x: rightFoot.x, y: rightFoot.y + up }} size={.64} angle={19} />
    case "chronowheel":
      return <Dial paint={p} where={to} large progress={s.t} count={next} beat={s.fx.beat ?? 0} />
    case "lifebud":
      return <g transform={pose({ x: to.x + 44, y: to.y + up }, 25)}>
        <path d="M0-43 14-18 18 4 0 22-19 5-12-21Z" fill={p.shade} fillOpacity=".8" stroke={p.white} strokeWidth="3" />
        <path d="M0-28Q19 0 0 13Q-17 1 0-28Z" fill={p.leaf} fillOpacity=".61" stroke={p.accent} strokeWidth="2" />
      </g>
    default:
      return null
  }
}

function FieldFigure({ motif, paint: p, center, radius: r, age, charge = 0, pulses }: {
  motif: LifebringerMotif; paint: Paint; center: EdgePoint; radius: number; age: number; charge?: number; pulses?: number;
}) {
  const breathe = .5 + .5 * Math.sin(age * 3.6)
  switch (motif) {
    case "grove":
      return <g transform={at(center)} opacity={.55}>
        {ordinal(3).map(i => <Stem key={i} paint={p} where={polar(r * .79, 25 + i * 120)}
          length={29} angle={65 + i * 120} open={.58 + breathe * .16} />)}
      </g>
    case "dew":
      return <g transform={at(center)}>
        <ellipse rx="35" ry="17" fill={p.accent} fillOpacity=".11" stroke={p.leaf} strokeWidth="2" />
        <Drop paint={p} where={{ x: 0, y: -14 - breathe * 7 }} size={.96} />
        <path d={arc(r * .87, 23 + age * 13, 91 + age * 13)} fill="none" stroke={p.white} strokeOpacity=".7" strokeWidth="2.7" />
      </g>
    case "borrowroot":
      return <g transform={at(center)}>
        {ordinal(5).map(i => <g key={i} transform={`rotate(${i * 72 - 18})`}>
          <path d={`M${-r * .42} ${-r * .83}Q-13 ${-r * .54} 0 ${-r * .72}Q13 ${-r * .88} ${r * .34} ${-r * .78}`}
            fill="none" stroke={p.leaf} strokeWidth="4.6" strokeOpacity=".66" />
          <path d={`M0 ${-r * .72}q-13 17-18 33m18-33 16 16`} fill="none" stroke={p.white} strokeOpacity=".54" strokeWidth="1.9" />
        </g>)}
      </g>
    case "lichen":
      return <Lichen paint={p} where={center} radius={r} open={.83 + breathe * .1} beat={pulses ?? Math.min(4, Math.floor(age / .9))} />
    case "landingdew":
      return <g transform={at(center)}>
        {ordinal(7).map(i => <g key={i} transform={pose(polar(r * (i % 2 ? .60 : .81), i * 51.4), i * 18)}>
          <ellipse rx="17" ry="10" fill={p.accent} fillOpacity=".11" stroke={p.accent} strokeWidth="1.8" strokeOpacity=".6" />
          <Drop paint={p} where={{ x: 0, y: -10 + Math.sin(age * 3 + i) * 4 }} size={.43} />
        </g>)}
        <path d={woodRing(r * .47, 2)} stroke={p.white} fill="none" strokeOpacity=".35" strokeWidth="2" strokeDasharray="3 12" />
      </g>
    case "forestexit":
      return <g transform={at(center)}>
        {ordinal(6).map(i => <g key={i} transform={`rotate(${i * 60})`}>
          <path d={arc(r * .92, -113, -67)} stroke={p.leaf} strokeWidth="7" strokeOpacity=".42" fill="none" />
          <Stem paint={p} where={{ x: 0, y: -r * .9 }} length={r * .35} angle={180} open={.74 + breathe * .1} />
        </g>)}
        <path d={woodRing(r * .63, 5)} stroke={p.leaf} strokeOpacity=".21" fill={p.shade} fillOpacity=".17" strokeWidth="2.3" />
      </g>
    case "circuit":
      return <g transform={at(center)}>
        <path d={woodRing(r * .77, 2)} stroke={p.leaf} strokeOpacity=".57" fill="none" strokeWidth="2.4" />
        <path d={path(ordinal(4).map(i => polar(r * .73, i * 120 - 90)))} fill={p.leaf} fillOpacity=".04"
          stroke={p.white} strokeOpacity=".47" strokeWidth="2.1" />
        {ordinal(3).map(i => {
          const where = polar(r * .73, i * 120 - 90)
          return <g key={i} opacity={i < Math.floor(age) + 1 ? .36 : .9}>
            <ellipse cx={where.x} cy={where.y + 14} rx="23" ry="8" fill={p.leaf} fillOpacity=".19" />
            <Bloom paint={p} where={{ x: where.x, y: where.y - breathe * 9 }} petals={3} size={.69} open={.74} twist={i * 40} />
          </g>
        })}
      </g>
    case "soil":
      return <g transform={at(center)}>
        <path d={woodRing(r * .93, 2)} fill={p.shade} fillOpacity=".29" stroke={p.leaf} strokeWidth="5" strokeOpacity=".37" />
        <path d={woodRing(r * .76, 3)} fill={p.leaf} fillOpacity=".14" stroke={p.white} strokeOpacity=".5" strokeWidth="2.2" />
        <path d={woodRing(r * .53, 4)} fill={p.accent} fillOpacity=".14" stroke={p.accent} strokeOpacity=".56" strokeWidth="3.1" />
        {ordinal(7).map(i => <g key={i} transform={`rotate(${i * 360 / 7})`}>
          <path d={`M0 ${-r * .90}Q14 ${-r * .73} 4 ${-r * .56}L19 ${-r * .36}`} fill="none"
            stroke={i % 2 ? p.white : p.leaf} strokeWidth="2.7" strokeOpacity={.5 + breathe * .15} />
          <Leaf paint={p} where={{ x: 4, y: -r * .53 }} size={.44} angle={123} />
        </g>)}
      </g>
    case "reservoir": {
      const fill = unit(charge)
      const core = r * (.17 + .24 * fill)
      return <g transform={at(center)}>
        {ordinal(8).map(i => <g key={i} transform={`rotate(${i * 45})`}>
          <path d={arc(r * .94, -109, -71)} stroke={opal[i % 4]} strokeWidth="9" strokeOpacity=".45" fill="none" />
          <path d={`M0 ${-r * .9}Q-21 ${-r * .6} 0 ${-core}`} stroke={p.white} strokeOpacity={.26 + fill * .45} strokeWidth={2 + fill * 2.2} fill="none" />
          <path d={`M0 ${-r * .94 - 10}l8 9-8 9-8-9Z`} fill={opal[i % 4]} fillOpacity=".6" stroke={p.white} strokeWidth="1.6" />
        </g>)}
        <path d={woodRing(r * .70, 9)} fill={p.accent} fillOpacity={.06 + fill * .21}
          stroke={p.accent} strokeOpacity=".45" strokeWidth="2.8" />
        <circle r={core + 13 * breathe} fill={p.leaf} fillOpacity={.05 + fill * .11} />
        <path d={path(ordinal(7).map(i => polar(core, i * 60 - 90)))} fill={p.accent}
          fillOpacity={.19 + fill * .50} stroke={p.white} strokeWidth="3.5" />
        {ordinal(6).map(i => <path key={i} d={path([polar(core, i * 60 - 90), { x: core * .12, y: -core * .21 }])}
          stroke={opal[i % 4]} strokeWidth={2 + fill * 1.4} strokeOpacity=".84" />)}
      </g>
    }
    default:
      return null
  }
}

function Preparation({ s, layer }: { s: Scene; layer: "floor" | "front" }) {
  const { motif, fx, paint: p, to, t, beat } = s
  const q = ease(t)
  const wide = fx.area !== undefined
  const [from, end] = lineEnds(fx)
  const r = range(s)
  const center = fx.area?.center ?? to
  const pointByCaster = { x: fx.from.x + 21, y: fx.from.y - 38 }
  if (layer === "floor") {
    if (motif === "oldrings") return <>
      <AreaRim paint={p} area={fx.area} />
      {beat.paths?.map((link, i) => <g key={i}>
        {link.end && <Ribbon paint={p} from={link.at} to={link.end} width={2.4} bend={i % 2 ? -31 : 25} dashed />}
        {link.end && <Dial paint={p} where={link.end} progress={q} count={0} beat={i} />}
      </g>)}
      {fx.beat === 2 && <Bloom paint={p} where={center} petals={8} size={1.48} open={q * .67} twist={-23 * q} />}
    </>
    if (!wide) {
      if (motif === "chronowheel") return <Dial paint={p} where={to} large progress={q} count={3} />
      if (motif === "rootbond" || motif === "lifebud") return <>
        <Ribbon from={fx.from} to={to} paint={p} bend={motif === "rootbond" ? -43 : 66} progress={q} width={3.6} />
        <Ribbon from={fx.from} to={to} paint={p} bend={motif === "rootbond" ? 43 : 81} progress={q} width={1.6} />
      </>
      return null
    }
    switch (motif) {
      case "dew": case "borrowroot": case "lichen": case "landingdew": case "forestexit": case "circuit": case "soil": case "reservoir":
        return <><AreaRim area={fx.area} paint={p} weight={2.2} />
          <g opacity={.34 + q * .42}><FieldFigure motif={motif} paint={p} center={center}
            radius={r * (.91 + q * .08)} age={s.age} /></g></>
      case "rootline":
        return <>
          <AreaRim area={fx.area} paint={p} />
          <Ribbon from={from} to={end} paint={p} width={3.6} bend={-24} progress={q} />
          <Ribbon from={from} to={end} paint={p} width={2.1} bend={22} progress={q} />
        </>
      case "budblade":
        return <>
          <AreaRim area={fx.area} paint={p} />
          <Ribbon from={from} to={end} paint={p} width={3.8} bend={4} progress={q} />
          <Leaf paint={p} where={mix(from, end, q)} size={.83} angle={heading(direction(from, end)) + 90} />
        </>
      case "branchshot":
        return <>
          <AreaRim area={fx.area} paint={p} />
          {(fx.beat ?? 0) === 2 && <g transform={at(center)}>
            {ordinal(6).map(i => <g key={i} transform={`rotate(${i * 60})`}>
              <path d={`M0 8Q12 ${-r * q * .56} -9 ${-r * q * .86}`} fill="none"
                stroke={p.white} strokeWidth="2.3" strokeOpacity=".69" />
              <Drop paint={p} where={{ x: -9, y: -r * q * .86 }} size={.33} />
            </g>)}
          </g>}
        </>
      case "footleaf":
        return <>
          <AreaRim area={fx.area} paint={p} />
          <Leaf paint={p} where={center} size={1.3 + q * .24} angle={-50 + 8 * q} />
          <path d={arc(r * .86, -136, -136 + q * 255)} transform={at(center)} fill="none" stroke={p.white}
            strokeWidth="2.6" strokeLinecap="round" />
        </>
      case "roamingroot": case "grove":
        return <><AreaRim area={fx.area} paint={p} /><StemOrbits s={{ ...s, to: center }} /></>
      case "starbranch":
        return <>
          <AreaRim area={fx.area} paint={p} fill={.07} />
          <Bloom paint={p} where={center} petals={fx.beat === 2 ? 6 : 9} size={r / 64} open={.3 + q * .67} twist={t * 24} />
        </>
      case "scarward":
        return <><AreaRim area={fx.area} paint={p} /><path d={`M${center.x-r*.66} ${center.y-r*.55}q${r*.62} ${r*.23} ${r*1.43} ${r*1.06}`}
          stroke={p.accent} strokeWidth={4 + q * 4} fill="none" strokeDasharray="15 10" /></>
      default:
        return <><AreaRim area={fx.area} paint={p} /><path d={arc(r * .87, -120, -120 + q * 220)} transform={at(center)} stroke={p.white}
          strokeWidth="2.7" fill="none" strokeLinecap="round" /></>
    }
  }
  const centerAbove = { x: center.x, y: center.y - 48 - (1 - q) * 26 }
  switch (motif) {
    case "renew":
      return <>{ordinal(3).map(i => <Leaf key={i} paint={p} where={along(pointByCaster, rotate({ x: 1, y: 0 }, i * 120 + t * 61), 16)}
        angle={i * 120 + 90} size={.34 + q * .11} />)}</>
    case "sprig":
      return <Stem paint={p} where={pointByCaster} length={40} angle={-44} open={.4 + q * .6} />
    case "needle":
      return <g transform={pose(pointByCaster, heading(beat.axis) + 90)}>
        <path d={`M0 ${-29 - q * 12} 5-3 0 20-4-2Z`} fill={p.white} stroke={p.leaf} strokeWidth="2.7" />
        <path d="M-10 11H10M-7 18H7" stroke={p.leaf} strokeWidth="2.1" />
      </g>
    case "leafward": case "seed": case "sapward": case "twinbud": case "mirrorbud":
      return <g opacity={.26 + q * .5}><ShieldBody s={s} /></g>
    case "bud":
      return <Bloom paint={p} where={centerAbove} petals={3} size={.78} open={q * .52} twist={-16} />
    case "stepdew":
      return <Drop paint={p} where={centerAbove} size={.54 + q * .24} angle={18} />
    case "branchshot": case "dewneedle": {
      if (motif === "branchshot" && fx.beat === 2) return null
      const body = { x: centerAbove.x - 29, y: centerAbove.y - 22 }
      return <g transform={pose(body, -41)}>
        <path d="M0-43 10-6 0 22-10-6Z" fill={p.leaf} fillOpacity=".41" stroke={p.white} strokeWidth="3.3" />
        <path d="M0 13-15 29M0 13 16 25" stroke={p.accent} strokeWidth="3.3" fill="none" />
      </g>
    }
    case "vine":
      return <Ribbon paint={p} from={fx.from} to={to} bend={-43} width={3.2} progress={q * .78} />
    case "cluster":
      return <Bloom paint={p} where={centerAbove} petals={3} size={.99} open={.38 + q * .49} twist={-27} />
    case "rewind":
      return <Dial paint={p} where={to} progress={q} count={2} />
    case "sharedbranch":
      return <Stem paint={p} where={centerAbove} length={55} angle={-63} open={.45 + q * .55} />
    case "starbranch":
      return <g transform={pose(centerAbove, 0, (fx.beat === 2 ? .65 : 1.25) + q * .18)}>
        <path d="M0-55 12-13 53-15 20 7 34 44 0 24-35 43-19 7-55-15-13-13Z"
          fill={p.leaf} fillOpacity=".24" stroke={p.white} strokeWidth="2.7" />
        <path d="M0-55V24M-55-15 20 7M53-15-19 7" stroke={p.accent} strokeWidth="2.3" />
      </g>
    case "lifebud":
      return <Bloom paint={p} where={centerAbove} petals={7} size={.91} open={q * .69} twist={23} />
    default:
      return null
  }
}

function DamageBranches({ s }: { s: Scene }) {
  const { fx, beat, paint: p, motif, t, to } = s
  const [start, end] = lineEnds(fx)
  const q = ease(t)
  const center = fx.area?.center ?? to
  return <>
    {motif === "budblade" && <g transform={pose(start, heading(direction(start, end)))}>
      <path d={`M0 0Q${edgeDistance(start,end)*.47} -55 ${edgeDistance(start,end)} 0Q${edgeDistance(start,end)*.52} 36 0 0Z`}
        fill={p.leaf} fillOpacity=".25" stroke={p.white} strokeWidth="4.8" />
      <path d={`M0 0H${edgeDistance(start,end)}`} stroke={p.accent} strokeWidth="3.1" />
    </g>}
    {motif === "branchshot" && <g transform={pose(center, -42)}>
      <path d="M0-80 9-34 3 26-6 16-9-35Z" fill={p.leaf} fillOpacity=".5" stroke={p.white} strokeWidth="3.1" />
      <path d="M-39 34Q-18 0-6 14M34 32Q19 2 3 14" stroke={p.accent} strokeWidth="3.7" fill="none" />
    </g>}
    {motif === "scarward" && <g transform={at(center)}>
      <path d="M-88-40Q-23-63 61 44M-65-51Q-16-51 85 25" stroke={p.white} strokeWidth="5.8" fill="none" />
      <path d="M-46-31-55-11M-17-34-18-5M12-24 6 5M41-4 24 20M66 19 46 41" stroke={p.accent} strokeWidth="3.1" fill="none" />
    </g>}
    {motif === "sharedbranch" && <g transform={pose(center, 44)}>
      <path d="M-7 88Q30-10 4-115Q-3-69-24-37Q-12-1-7 88Z" fill={p.leaf} fillOpacity=".32" stroke={p.white} strokeWidth="3.9" />
      <path d="M13-43 45-76M1-2-42-26M-5 43 29 18" stroke={p.accent} strokeWidth="3.3" fill="none" />
    </g>}
    {motif === "dewneedle" && <>{ordinal(5).map(i => <g key={i} transform={pose(along(center, rotate(beat.axis, i * 72), 47 + q * 17), i * 72 - 36)}>
      <path d="M0-69 12-24 4 23-4 20-12-24Z" fill={p.leaf} fillOpacity=".22" stroke={p.white} strokeWidth="3" />
      <Drop paint={p} where={{ x: 0, y: -22 }} size={.42} />
    </g>)}</>}
    {motif === "starbranch" && <g transform={pose(center, -10 + q * 29)}>
      {ordinal(8).map(i => <g key={i} transform={`rotate(${i * 45})`}>
        <path d={`M0 12Q18 ${-range(s,163)*.44} 2 ${-range(s,163)*(.55+.39*q)}Q-5-62-31-49Q-8-20 0 12Z`}
          fill={opal[i % 4]} fillOpacity=".19" stroke={i % 2 ? p.white : p.leaf} strokeWidth="4" />
        <path d="M5-48 27-74M-10-22-29-35" stroke={p.accent} strokeWidth="2.4" fill="none" />
      </g>)}
      <path d="M0-28 8-8 29 0 8 8 0 29-9 8-29 0-9-8Z" fill={p.white} />
    </g>}
    {beat.paths?.map((contact, i) => <g key={i} transform={pose(contact.at, heading(beat.axis) + 90)}>
      <path d={`M-16 ${4+q*9} 0 ${-19-q*16} 16 ${4+q*9}M-9 13 0 4 9 13`}
        stroke={motif === "needle" ? "#ffe1b9" : p.white} strokeWidth={3.8 - 1.2*q} strokeLinecap="round" fill="none" />
      {motif === "starbranch" && <Stem paint={p} where={zero} angle={118 + 42 * i} length={46} open={q} />}
    </g>)}
  </>
}

function HealFigure({ s }: { s: Scene }) {
  const { paint: p, to, fx, motif, beat, t } = s
  const q = ease(t)
  const tap = fx.beat ?? 1
  const rise = { x: to.x + 36, y: to.y + 9 - q * 36 }
  const foot = { x: to.x, y: to.y + 34 }
  if (!beat.amount) return null
  switch (motif) {
    case "renew":
      return <Leaf paint={p} where={{ x: rise.x + tap * 5, y: rise.y }} size={.54 + q * .12} angle={-18 + tap * 23} />
    case "sprig":
      return <Stem paint={p} where={{ x: to.x + (tap === 1 ? -37 : 43), y: foot.y }} length={48} angle={tap === 1 ? -30 : 50} open={q} />
    case "dew":
      return <><Drop paint={p} where={{ x: to.x - 38, y: to.y - q * 41 }} size={.61} />
        <ellipse cx={foot.x} cy={foot.y} rx={17 + q * 29} ry={6 + q * 9} stroke={p.white} strokeWidth="2.5" fill="none" /></>
    case "leafward":
      return <><Leaf paint={p} where={{ x: to.x - 32, y: to.y - 12 - q * 22 }} size={.75} angle={-32 - q * 47} />
        <Leaf paint={p} where={{ x: to.x + 30, y: to.y - 8 - q * 20 }} size={.66} angle={42 + q * 31} /></>
    case "needle":
      return <g transform={pose(rise, 27)}>
        <path d="M0-39Q19-4 1 21Q-14 3 0-39Z" fill={p.leaf} fillOpacity=".24" stroke={p.white} strokeWidth="3.2" />
        <path d="M0-31-1 15" stroke={p.accent} strokeWidth="2.2" />
      </g>
    case "bud":
      return <Bloom paint={p} where={rise} petals={4} size={beat.kind === "" && tap < 2 ? .61 : .92} open={q} twist={18 + t * 29} />
    case "stepdew":
      return <>{ordinal(5).map(i => {
        const n = i - 2
        return <Drop key={i} paint={p} where={{ x: foot.x + n * q * 28, y: foot.y - (34 - Math.abs(n) * 6) * q }}
          size={.34 + (2 - Math.abs(n)) * .09} angle={n * 29} />
      })}</>
    case "grove":
      return <g transform={pose(foot, tap % 2 ? -31 : 38)}>
        <Stem paint={p} where={{ x: -30, y: 0 }} length={51} angle={-45} open={q} />
        <Stem paint={p} where={{ x: 22, y: -7 }} length={41} angle={41} open={q} />
      </g>
    case "seed":
      return <g transform={pose(rise, -11 + q * 37)}>
        <path d="M-16 26Q-29-21 0-32Q25-27 20-3Q9 12-11 4Q-17-10-2-15Q11-17 12-6"
          fill="none" stroke={p.white} strokeWidth="4" strokeLinecap="round" />
        <Leaf paint={p} where={{ x: 10, y: -13 }} size={.44} angle={55} />
      </g>
    case "branchshot":
      return <g transform={at(foot)}>
        <path d="M-48 9Q-11 11 0-24Q16-1 51 6M-34 8-28-8M26 0 37-16" stroke={p.white}
          strokeWidth={2 + q * 2} fill="none" />
        <Drop paint={p} where={{ x: 0, y: -32 - 17 * q }} size={.52} />
      </g>
    case "vine":
      return <><Stem paint={p} where={rise} length={53} angle={tap === 2 ? -43 : 26} open={q} />
        {tap === 2 && <Ribbon from={fx.from} to={to} paint={p} bend={-32} width={2.2} />}</>
    case "cluster":
      return <Bloom paint={p} where={rise} petals={3} size={tap === 2 ? .92 : 1.2} open={q} twist={-24 + q * 50} />
    case "borrowroot":
      return <g transform={at(foot)}>
        <path d="M-46 5Q-22 11-18-16L-25-38M45 7Q21 12 17-17L27-37M-17-17 0-10 19-20"
          stroke={p.white} strokeWidth={2.4 + q * 1.6} fill="none" />
        <path d="M-32 1-43-8M30 0 43-12" stroke={p.accent} strokeWidth="2.7" fill="none" />
      </g>
    case "footleaf":
      return <><Leaf paint={p} where={rise} size={.87} angle={-36 + q * 69} />
        <path d={arc(48 + q * 20, 22, 145)} transform={at(foot)} stroke={p.accent} strokeWidth="2.8" fill="none" /></>
    case "budblade":
      return <g transform={pose(foot, heading(beat.axis) + 90)}>
        <path d="M-46 0Q0-36 46 0Q0 9-46 0Z" fill={p.leaf} fillOpacity=".36" stroke={p.white} strokeWidth="3.1" />
        <Leaf paint={p} where={{ x: 0, y: -19 - q * 12 }} size={.55} />
      </g>
    case "lichen":
      return <>{ordinal(3).map(i => <g key={i} transform={pose(along(foot, rotate({ x: 1, y: 0 }, 37 + i * 112 + tap * 17), 40 + q * 17), i * 71)}>
        <path d="M-13 6-10-8 3-15 15-2 7 12Z" fill={p.leaf} fillOpacity=".5" stroke={p.white} strokeWidth="2.4" />
      </g>)}</>
    case "landingdew":
      return <g transform={at(foot)}>
        <ellipse rx={23 + 35 * q} ry={10 + 11 * q} stroke={p.accent} strokeWidth="3" fill={p.accent} fillOpacity=".14" />
        <Bloom paint={p} where={{ x: 0, y: -6 }} petals={5} size={.91} open={q} twist={20} />
        <Drop paint={p} where={{ x: 27, y: -16 - 22 * q }} size={.44} />
      </g>
    case "rootline":
      return <g transform={pose(foot, tap === 2 ? 49 : -43)}>
        <path d="M-13 21Q10-5-9-34M-1 21Q25-9 3-44" stroke={p.white} strokeWidth="3.2" fill="none" />
        <Leaf paint={p} where={{ x: 10, y: -33 }} size={.44} angle={35} />
      </g>
    case "sapward":
      return <g transform={pose({ x: foot.x + (tap - 2) * 27, y: foot.y }, 18 * (tap - 2))}>
        <path d="M0 12V-20M0-10-15-24M0-5 15-18" stroke={p.white} strokeWidth="3.5" fill="none" />
        <Drop paint={p} where={{ x: 0, y: -30 - 19 * q }} size={.59} />
      </g>
    case "scarward":
      return <g transform={pose(rise, -27 + q * 20)}>
        <path d="M-16-31Q-28 2-11 30Q0 37 17 23L16-26Q1-39-16-31Z" fill={p.leaf} fillOpacity=".17" stroke={p.white} strokeWidth="2.8" />
        <path d="M-14-19 15-10M-18-3 16 7M-14 13 16 22" stroke={p.accent} strokeWidth="3.1" fill="none" />
      </g>
    case "rootbond":
      return <g transform={pose(foot, beat.kind === "share" ? -38 : 38)}>
        <path d="M-41 7Q-13 2-4-22Q11-38 33-23M-42 17Q-15 14 7-8Q20-20 34-14" stroke={p.white} strokeWidth="3.3" fill="none" />
        <Leaf paint={p} where={{ x: 34, y: -21 }} size={.52} angle={57} />
      </g>
    case "twinbud":
      return <Bloom paint={p} where={{ x: rise.x, y: rise.y - 15 }} petals={6} size={1.18} open={q} twist={-34 + q * 33} />
    case "forestexit":
      return <>{ordinal(4).map(i => <Leaf key={i} paint={p} where={along(to, rotate({ x: 1, y: 0 }, 24 + i * 38), 49 + q * 24)}
        angle={58 + i * 38} size={.56 + q * .13} />)}</>
    case "rewind":
      return <Dial paint={p} where={to} progress={q} count={Math.max(0, 3 - tap)} beat={tap} />
    case "sharedbranch":
      return <><Stem paint={p} where={rise} length={51} angle={tap === 2 ? -24 : 56} open={q} />
        <Leaf paint={p} where={{ x: foot.x - 37, y: foot.y - q * 19 }} angle={-68} size={.67} /></>
    case "circuit":
      return <g transform={pose(rise, tap * 48)}>
        <path d="M0-32 25 17-25 17Z" fill={p.accent} fillOpacity=".27" stroke={p.white} strokeWidth="3" />
        <Bloom paint={p} petals={3} size={.68 + q * .18} open={q} />
      </g>
    case "roamingroot":
      return <g transform={pose(foot, tap * 66)}>
        <path d="M-42 0Q-18-41 17-20Q33-7 49-27" fill="none" stroke={p.white} strokeWidth="3.4" />
        <Leaf paint={p} where={{ x: 32, y: -19 }} size={.58 + q * .13} angle={63} />
      </g>
    case "soil":
      return <g transform={pose(foot, -15 + tap * 40)}>
        <path d="M-57 13Q-25-17 1-4Q29-10 59 8Q21 24-57 13Z" fill={p.accent} fillOpacity=".25"
          stroke={p.white} strokeWidth="3.3" />
        <Stem paint={p} where={{ x: 0, y: 0 }} length={62} angle={12} open={q} />
      </g>
    case "mirrorbud":
      return <>{ordinal(5).map(i => <g key={i} transform={pose(along(to, rotate({ x: 1, y: 0 }, 31 + i * 72), 51 + q * 27), i * 65 + q * 32)}>
        <path d="M0-23 13-6 8 15-13 9-11-10Z" fill={i % 2 ? p.leaf : p.accent} fillOpacity=".31" stroke={p.white} strokeWidth="2.6" />
        <path d="M0-23 3-2 8 15M3-2-13 9" stroke={p.accent} strokeWidth="1.9" fill="none" />
      </g>)}</>
    case "dewneedle":
      return <><Drop paint={p} where={rise} size={tap === 2 ? 1 : .73} angle={-18 + 22 * q} />
        <Leaf paint={p} where={{ x: rise.x + 17, y: rise.y + 19 }} size={.56} angle={67} /></>
    case "chronowheel":
      return <>{ordinal(3).map(i => <Leaf key={i} paint={{ ...p, leaf: opal[(i + tap) % 4] }}
        where={along(to, rotate({ x: 1, y: 0 }, tap * 46 + i * 120), 58 + q * 28)}
        angle={i * 120 + q * 49} size={.65 + q * .18} />)}</>
    case "oldrings":
      return <g transform={pose(foot, 29)}>
        <path d="M-40 0Q-30-28-6-18Q23-29 44-4Q18 21-12 17Q-32 12-40 0Z"
          fill={p.leaf} fillOpacity=".32" stroke={p.white} strokeWidth="3" />
        <path d="M-34 2Q5 2 35-7M-9 2-16-10M13-3 9 11" stroke={p.accent} strokeWidth="2.5" fill="none" />
      </g>
    case "reservoir":
      return <g transform={pose(rise, -36 + q * 46)}>
        <path d="M0-34 29-3 11 25-16 20-27-7Z" fill={p.accent} fillOpacity=".42" stroke={p.white} strokeWidth="3.1" />
        <path d="M0-34 1-3 11 25M1-3-27-7M1-3 29-3" stroke={p.leaf} strokeWidth="2.4" fill="none" />
      </g>
    case "lifebud":
      return <Bloom paint={p} where={rise} petals={beat.kind === "refund" ? 8 : 5}
        size={beat.kind === "refund" ? 1.41 : .94} open={q} twist={17 + t * 27} />
    case "starbranch":
      return <g transform={pose(foot, -9 + 28 * q)}>
        <path d="M0-47 12-9 45-6 13 9 22 42 0 21-26 43-15 10-46-5-12-9Z"
          fill={p.leaf} fillOpacity=".27" stroke={p.white} strokeWidth="3.3" />
        <Stem paint={p} where={zero} length={56} angle={32} open={q} />
      </g>
  }
}

function HealGround({ s }: { s: Scene }) {
  const { motif, fx, paint: p, to, t } = s
  const q = ease(t)
  const center = fx.area?.center ?? to
  if (motif === "chronowheel")
    return s.battle.runtime.effects.some(other => other.cast === fx.cast && other.target === fx.target &&
      other.id > fx.id && other.lifebringer?.cue === "heal") ? null
      : <Dial paint={p} where={to} large progress={q} count={Math.max(0, 3 - (fx.beat ?? 0))} beat={fx.beat} />
  if (!fx.area) return null
  const samePulse = s.battle.runtime.effects.some(other => other.id < fx.id && other.cast === fx.cast &&
    other.start === fx.start && other.area === fx.area && other.lifebringer?.cue === "heal")
  if (samePulse) return null
  switch (motif) {
    case "lichen":
      return <Lichen paint={p} where={center} radius={range(s, 125)} open={q} beat={fx.beat ?? 1} />
    case "roamingroot": case "grove":
      return <StemOrbits s={{ ...s, to: center }} pulse />
    case "branchshot":
      return <g transform={at(center)}>
        {ordinal(6).map(i => <g key={i} transform={`rotate(${i * 60})`}>
          <path d={`M0 0Q-17 ${-48*q} 0 ${-92*q}M-4 ${-53*q}q19 5 34-13`} fill="none" stroke={p.white}
            strokeWidth="2.7" strokeOpacity=".72" />
        </g>)}
      </g>
    case "footleaf":
      return <Bloom paint={p} where={center} petals={5} size={range(s, 105) / 48} open={q} twist={-33} />
    case "cluster":
      return <Bloom paint={p} where={center} petals={3} size={range(s, 115) / 53} open={q} twist={-12} />
    case "soil":
      return <path d={woodRing(range(s, 155) * (.7 + q * .22), fx.beat ?? 1)} transform={at(center)}
        fill={p.leaf} fillOpacity=".13" stroke={p.white} strokeWidth="4" />
    case "forestexit":
      return <Ribbon from={fx.from} to={to} paint={p} bend={-25} width={4} progress={q} />
    default:
      return null
  }
}

function Transfer({ s }: { s: Scene }) {
  const { motif, beat, fx, paint: p, t, to } = s
  const q = ease(t)
  if (motif === "rootline") return <>{beat.paths?.map((row, i) => row.end && <g key={i}>
    <Ribbon paint={p} from={row.at} to={row.end} bend={i % 2 ? -28 : 33} width={4.3} progress={q} />
    <Leaf paint={p} where={row.end} size={.42 + q * .19} angle={i % 2 ? 32 : -31} />
  </g>)}</>
  if (motif === "circuit") {
    const from = along(fx.from, rotate({ x: 0, y: -1 }, ((fx.beat ?? 1) - 1) * 120), range(s, 165) * .73)
    return <><Ribbon paint={p} from={from} to={to} bend={-43} width={4.8} progress={q} />
      <Bloom paint={p} where={from} petals={3} size={.79} open={q} twist={44} /></>
  }
  if (motif === "reservoir") return <>
    <Ribbon paint={p} from={fx.from} to={to} bend={-38} width={2.3 + (beat.remaining ?? 0) * 3} progress={q} />
    <path d={woodRing(24 + (beat.remaining ?? 0) * 36, 2)} transform={at(to)} fill={p.leaf}
      fillOpacity=".16" stroke={p.white} strokeWidth="3.3" />
  </>
  return <>
    <Ribbon paint={p} from={fx.from} to={to} bend={-38} width={4.5} progress={q} />
    <Ribbon paint={p} from={fx.from} to={to} bend={41} width={2.5} progress={q} />
    <Leaf paint={p} where={ribbonCurve(fx.from, to, -38, q).head} size={.67} angle={48} />
  </>
}

function Release({ s, layer }: { s: Scene; layer: "floor" | "front" }) {
  const { motif, paint: p, to, t, beat } = s
  const q = ease(t)
  if (layer === "floor") {
    if (motif === "oldrings") return <>
      <Dial paint={p} where={to} progress={q} count={0} />
      <Bloom paint={p} where={to} petals={8} size={1.8} open={q} twist={-27 * q} />
    </>
    if (motif === "starbranch") return <g transform={at(to)}>
      <Bloom paint={p} petals={7} size={1.52} open={q} twist={29} />
      <path d={woodRing(range(s, 78) * (.53 + q * .47), 3)} stroke={p.white} strokeWidth="4" fill="none" />
    </g>
    if (motif === "reservoir") return <g transform={at(to)}>
      {[.31, .55, .83].map((scale, i) => <path key={i} d={woodRing(range(s, 175) * scale * (.55 + q * .45), i)}
        stroke={opal[i]} strokeWidth={4.4 - i * .65} fill={p.accent} fillOpacity=".05" />)}
    </g>
    return null
  }
  if (motif === "seed" && beat.kind === "convert") return <g transform={pose(to, -28 - q * 40)}>
    {ordinal(3).map(i => <path key={i} transform={`rotate(${i * 120}) scale(${1 - q * .35})`}
      d="M-18-35Q-29-56 0-68Q30-53 17-35Q0-46-18-35Z" fill={p.leaf} fillOpacity=".31" stroke={p.white} strokeWidth="3" />)}
  </g>
  if (motif === "stepdew") return <path d="M-33 2Q-13 16 0-1Q15 14 35 1" transform={at({ x: to.x, y: to.y + 42 })}
    stroke={p.white} strokeWidth={2 + 3 * q} fill="none" />
  if (motif === "borrowroot") return <Leaf paint={p} where={{ x: to.x - 38, y: to.y + 9 - q * 36 }}
    angle={-29 - q * 28} size={.58} />
  return null
}

function Effect({ s, layer }: { s: Scene; layer: "floor" | "front" }) {
  const { fx, beat, motif, paint: p, to } = s
  const cue = beat.cue
  if (cue === "prepare") return <Preparation s={s} layer={layer} />
  if (cue === "flight") return layer === "front" ? <Flight s={s} /> : null
  if (cue === "heal") return layer === "floor" ? <HealGround s={s} /> : <HealFigure s={s} />
  if (cue === "strike") return layer === (motif === "needle" ? "front" : "floor") ? <DamageBranches s={s} /> : null
  if (cue === "ward") return layer === "front" ? <ShieldBody s={s} hit /> : null
  if (cue === "release") return <Release s={s} layer={layer} />
  if (cue === "transfer") return layer === "floor" ? <Transfer s={s} /> : null
  if (cue === "shield") {
    if (layer === "front") return <ShieldBody s={s} />
    if (motif !== "twinbud") return null
    const other = s.battle.runtime.effects.find(other => other.id > fx.id && other.cast === fx.cast && other.lifebringer?.cue === "shield")
    const partner = unitOf(s.battle, other?.target)
    if (!partner?.hp || s.battle.runtime.shieldCasts.get(partner.id)?.id !== fx.cast) return null
    return <Ribbon paint={p} from={to} to={partner} bend={34} width={2.6} dashed />
  }
  if (cue === "arm") {
    if (motif === "chronowheel") {
      const pulsing = s.battle.runtime.effects.some(other => other.cast === fx.cast && other.target === fx.target && other.lifebringer?.cue === "heal")
      return !pulsing && layer === "floor" ? <Armed s={s} /> : null
    }
    if (motif === "roamingroot") return layer === "floor" ? <Armed s={s} /> : null
    if (layer === "front") return <Armed s={s} />
    if (motif === "rootbond") {
      const other = s.battle.runtime.effects.find(other => other.id > fx.id && other.cast === fx.cast && other.lifebringer?.kind === "bond")
      const partner = unitOf(s.battle, other?.target)
      if (partner?.hp) return <>
        <Ribbon paint={p} from={to} to={partner} bend={-39} width={2.4} />
        <Ribbon paint={p} from={to} to={partner} bend={42} width={1.9} />
      </>
    }
    return null
  }
  if (cue === "deploy" && layer === "floor") return <AreaRim paint={p} area={fx.area} weight={2 + 3 * (1 - s.t)} fill={.03} />
  if (cue === "cancel" && layer === "front") return <Leaf paint={p} where={fx.from} angle={-63 + s.t * 50} size={.6 - s.t * .3} />
  return null
}

export function EdgeLifebringerEffects({ battle, layer }: { battle: EdgeBattle; layer: "floor" | "front" }) {
  return <g aria-hidden="true" pointerEvents="none">
    {battle.runtime.effects.map(fx => {
      const beat = fx.lifebringer
      const art = lifebringerChoreography(fx.skill)
      if (!beat || !art || battle.time < fx.start || battle.time >= fx.end) return null
      const target = unitOf(battle, fx.target)
      const age = battle.time - fx.start
      const t = unit(age / Math.max(.001, fx.end - fx.start))
      const stable = beat.cue === "arm" || beat.cue === "shield"
      if ((stable || beat.kind === "chronoPlan") && !target?.hp) return null
      if (beat.cue === "shield" && (!target || target.shield <= 0 || target.shieldUntil <= battle.time ||
        battle.runtime.shieldCasts.get(target.id)?.id !== fx.cast)) return null
      if (beat.cue === "arm" && beat.kind === "watch" && !battle.runtime.watches.some(watch =>
        watch.cast.id === fx.cast && watch.target === fx.target && watch.uses > 0 && watch.until > battle.time)) return null
      if (beat.cue === "arm" && beat.kind === "returnhp" && !battle.runtime.buffs.some(buff =>
        buff.cast.id === fx.cast && buff.target === fx.target && buff.kind === "returnhp" && buff.until > battle.time)) return null
      const follows = stable || beat.cue === "flight" || beat.cue === "prepare" && !fx.area
      const to = follows && target?.hp ? target : fx.to
      const caster = art.motif === "grove" && beat.cue === "prepare" ? unitOf(battle, beat.owner) : undefined
      const shown = caster ? { ...fx, to: point(caster), area: areaOf("C", point(caster), beat.axis, 95) } : fx
      const opacity = stable ? .78 * Math.min(1, (fx.end - battle.time) / .18)
        : beat.cue === "prepare" ? .62 + t * .34 : beat.cue === "flight" ? .98 : .96 * (1 - t) ** .53
      return <g key={fx.id} data-lifebringer={fx.skill} data-life-cue={beat.cue} opacity={opacity}>
        <Effect s={{ battle, fx: shown, beat, motif: art.motif, paint: palette[fx.rarity], age, t, to, target }} layer={layer} />
      </g>
    })}
  </g>
}

export function EdgeLifebringerField({ field, battle }: { field: FieldEffect; battle: EdgeBattle }) {
  const art = lifebringerChoreography(field.cast.skill?.id)
  const owner = battleFighters(battle).find(unit => unit.id === field.cast.owner)
  if (!art || !owner || field.until <= battle.time) return null
  const paint = palette[owner.card.rarity]
  const age = battle.time - field.time
  const remaining = field.until - battle.time
  const capacity = (field.step.operations.find(op => op.kind === "bank")?.args[1] ?? 35) * owner.maxHp / 100
  return <g aria-hidden="true" pointerEvents="none" data-lifebringer-field={field.cast.skill?.id}
    opacity={Math.min(.92, .55 + age * 2, remaining * 3 + .09)}>
    <AreaRim area={field.area} paint={paint} fill={art.motif === "reservoir" ? .092 : .045} />
    {circles(field.area).map(({ center, radius }, i) => <FieldFigure key={i} motif={art.motif} paint={paint}
      center={center} radius={radius} age={age} charge={field.capacity / Math.max(1, capacity)} />)}
  </g>
}

