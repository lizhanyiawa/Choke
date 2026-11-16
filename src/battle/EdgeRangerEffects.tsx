import type { ReactNode } from "react"
import type { Rarity } from "@/card/types"

import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { FIELD, along, areaPath, clamp, direction, edgeDistance, left, rotate, type AreaPart, type EdgeArea } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { rangerChoreography, type RangerMotif } from "./edgeSkills/rangerChoreo"
import { battleFighters, unitOf, type FieldEffect } from "./edgeSkills/state"
import starburst from "./edgeSkills/assets/five-point-shatter.png"

type Paint = { core: string; hot: string; cool: string; ink: string }
const colors: Record<Rarity, Paint> = {
  C: { core: "#fff1eb", hot: "#f2b8cf", cool: "#b8cbf3", ink: "#45263f" },
  UC: { core: "#effbff", hot: "#9cdeff", cool: "#b9abfa", ink: "#222a4a" },
  R: { core: "#f4f9ff", hot: "#c5b7ff", cool: "#93d6ff", ink: "#2a234c" },
  E: { core: "#fcf0ff", hot: "#ceadff", cool: "#a2c9ff", ink: "#372044" },
  L: { core: "#fff4ce", hot: "#ffd486", cool: "#ffa0b7", ink: "#3a2338" },
  Radiant: { core: "#fff4fb", hot: "#ffa9d9", cool: "#adddff", ink: "#482141" },
  Prismatic: { core: "#fff8fd", hot: "#f7afe9", cool: "#a1e5ff", ink: "#302449" },
}
const rainbow = ["#ffd88e", "#fba9d8", "#f6cdff", "#a0e6ff", "#bcb4ff"]
const unit = (n: number) => clamp(n, 0, 1)
const ease = (n: number) => 1 - (1 - unit(n)) ** 3
const mix = (a: EdgePoint, b: EdgePoint, p: number): EdgePoint => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p })
const at = ({ x, y }: EdgePoint) => "translate(" + x + " " + y + ")"
const angle = (a: EdgePoint, b: EdgePoint) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
const path = (points: readonly EdgePoint[]) => "M" + points.map(({ x, y }) => x + " " + y).join("L")
const circle = (area?: EdgeArea) => area?.parts.find((part) => part.kind === "circle")
const radial = (center: EdgePoint, radius: number, heading: number) => along(center, rotate({ x: 1, y: 0 }, heading), radius)
const center = { x: 0, y: 0 }

function arc(r: number, start: number, end: number) {
  const a = radial(center, r, start)
  const b = radial(center, r, end)
  return `M${a.x} ${a.y}A${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y}`
}

function rails(area?: EdgeArea) {
  return area?.parts.flatMap((part) => {
    if (part.kind !== "polygon" || part.points.length !== 4) return []
    const [a, b, c, d] = part.points
    return [{ from: mix(a, b, .5), to: mix(c, d, .5), width: edgeDistance(a, b), points: part.points }]
  }) ?? []
}

function Line({ d, color, width = 4 }: { d: string; color: string; width?: number }) {
  return <g fill="none">
    <path d={d} stroke={color} strokeWidth={width * 3.2} opacity=".14" />
    <path d={d} stroke={color} strokeWidth={width} opacity=".86" />
    <path d={d} stroke="#fff7fc" strokeWidth={Math.max(1.1, width * .28)} opacity=".84" />
  </g>
}

function Ring({ p, r, paint, ticks = 4, diagonal = false }: { p: number; r: number; paint: Paint; ticks?: number; diagonal?: boolean }) {
  return <g fill="none">
    <circle r={r} stroke={paint.hot} strokeWidth="1.9" opacity=".55" />
    <circle r={r * (1 + .58 * (1 - p))} stroke={paint.core} strokeWidth="2.8" opacity={.30 + p * .54}
      strokeDasharray={diagonal ? "13 5" : undefined} />
    {Array.from({ length: ticks }, (_, i) => <path key={i} d={`M${r - 8} 0h12`}
      transform={`rotate(${i * 360 / ticks + (diagonal ? 45 : 0)})`} stroke={paint.hot} strokeWidth="3" />)}
  </g>
}

function Arrow({ from, to, p, paint, bow = 0, height = 0, weight = 1, barbed = false, trail = .29 }: {
  from: EdgePoint; to: EdgePoint; p: number; paint: Paint; bow?: number; height?: number; weight?: number; barbed?: boolean; trail?: number
}) {
  const side = left(direction(from, to))
  const position = (t: number) => {
    const base = along(mix(from, to, t), side, Math.sin(t * Math.PI) * bow)
    return { x: base.x, y: base.y - Math.sin(t * Math.PI) * height }
  }
  const head = position(p)
  const tail = Array.from({ length: 5 }, (_, i) => position(unit(p - trail * (1 - i / 4))))
  const heading = angle(position(unit(p - .016)), position(unit(p + .016)))
  return <g data-edge-projectile={barbed ? "barb" : "arrow"}>
    <Line d={path(tail)} color={paint.hot} width={4.6 * weight} />
    <g transform={`${at(head)} rotate(${heading}) scale(${weight})`}>
      <path d={barbed ? "M-34 0-9-9-12-16 21 0-12 16-9 9Z" : "M-42 0-18-4-21-10 19 0-21 10-18 4Z"}
        stroke={paint.ink} strokeWidth="4" fill={paint.core} />
      <path d="M-34 0H9M-26-3l-8-5m8 11-8 5" stroke={paint.cool} strokeWidth="2.6" fill="none" />
    </g>
  </g>
}

function Fan({ p, paint, count, radius, turn = 0, shards = false }: {
  p: number; paint: Paint; count: number; radius: number; turn?: number; shards?: boolean
}) {
  return <g className="edge-fx-detail" opacity={1 - p}>
    {Array.from({ length: count }, (_, i) => {
      const heading = turn + 360 * i / count + 7 * (i % 3)
      const distance = 12 + ease(p) * radius * (.48 + .14 * (i % 4))
      return <g key={i} transform={`rotate(${heading}) translate(${distance} 0) rotate(${shards ? p * (44 + i * 7) : 0})`}>
        {shards ? <path d={i % 2 ? "M-16-4 13-8 5 7Z" : "M-14 5 13-8 17 3-4 10Z"}
          fill={i % 2 ? paint.cool : paint.hot} fillOpacity=".52" stroke={paint.core} strokeWidth="2" />
          : <path d="M-12 0H15m-2-1 5 1-5 1" fill="none" stroke={i % 2 ? paint.hot : paint.core} strokeWidth={2 + i % 3} />}
      </g>
    })}
  </g>
}

function Plate({ part, p, paint, variant }: { part: AreaPart; p: number; paint: Paint; variant: "cut" | "core" | "recoil" | "rails" }) {
  if (part.kind !== "polygon" || part.points.length !== 4) return null
  const [a, b, c, d] = part.points
  const from = mix(a, b, .5)
  const to = mix(c, d, .5)
  return <g opacity={(1 - p) ** .85}>
    <path d={path(part.points) + "Z"} fill={paint.hot} fillOpacity={variant === "core" ? ".24" : ".15"} stroke={paint.hot} strokeWidth="2" />
    {variant === "core" && <path d={path([mix(a, b, .342), mix(a, b, .658), mix(d, c, .658), mix(d, c, .342)]) + "Z"}
      fill={paint.core} fillOpacity=".48" stroke={paint.core} strokeWidth="1.5" />}
    <Line d={path([from, to])} color={paint.hot} width={variant === "rails" ? 6 : variant === "cut" ? 4 : 9} />
    {(variant === "cut" || variant === "recoil") && <>
      <path d={path([mix(a, b, .10), mix(d, c, .10)])} transform={`translate(${p * -15} ${p * 11})`}
        stroke={paint.cool} strokeWidth="4" strokeDasharray="31 7 8 7" fill="none" />
      <path d={path([mix(a, b, .90), mix(d, c, .90)])} transform={`translate(${p * 15} ${-p * 11})`}
        stroke={paint.core} strokeWidth="3.2" strokeDasharray="17 11" fill="none" />
    </>}
  </g>
}

interface Stage { motif: RangerMotif; fx: SkillVisual; to: EdgePoint; p: number; paint: Paint }

function GoldOpening({ motif, fx, to, p, paint }: Stage) {
  const source = fx.from
  const local = (d: string, point: EdgePoint = source, turn = 0) =>
    <path d={d} transform={`${at(point)} rotate(${turn})`} fill={paint.ink} fillOpacity=".55" stroke={paint.hot} strokeWidth="3.1" />
  const aim = angle(source, to)
  const flare = (() => {
    switch (motif) {
      case "followThrough": return local("M-34-9-4-4 13 0-4 4-34 9-23 0Z", source, aim)
      case "kickback": return local("M-34 10-18-20-1 4 15-18 35 10 14 19-14 19Z", source, p * 27)
      case "piercingHook": return local("M-11-34C15-34 28-3 15 14L2 22-5 10 7 4C15-2 8-15-7-19Z", to, aim)
      case "sentryFeather": return local("M-31 3-16-13 0 3 17-13 31 3 15 17 0 8-15 17Z", source, aim)
      case "thirdKink": return local("M-26 15-1-18 22-8 11-3 1-6-17 20Z", source, aim)
      case "counterArc": return local("M-38 1Q-8-33 31-16-5-15-15 11 23 16-8 28-38 1Z", to, aim + 40 * p)
      case "rimWake": return <Line d={path([source, mix(source, to, ease(p))])} color={paint.hot} width={3.6} />
      case "detourSeal": return local("M-28-14 22-14 34 14-22 14ZM-23 8-8-8m-1 16L5-8m0 16 15-16", to, 23)
      case "wireLoop": return local("M-24 0C-24-27 22-25 22-4 22 12-10 13-10-1-10-10 5-12 6-2", source, aim)
      case "repriseMark": return local("M-30-9 8-20 23-3 8 0 23 4 8 21-30 9Z", to, aim)
      case "runoffRain": return local("M-25 11-18-24-7 4 0-37 8 3 21-19 26 11 0 22Z", source, aim)
      case "coverWing": return local("M-40 8-24-22-9 0 0 18 9 0 24-22 40 8 15 23 0 26-15 23Z", to)
      case "fifthRefraction": return local("M-32 19 0-39 32 19ZM0-39 2 6 32 19M-32 19 2 6", source, p * 21)
      case "mirrorWard": return <g>
        {local("M-24 15 0-24 24 15 0 26Z", source, p * 46)}
        <path d={path([source, to])} fill="none" stroke={paint.cool} strokeWidth="2.8" strokeDasharray="12 9" />
      </g>
      default: return null
    }
  })()
  return <g opacity={.97 - p * .66} data-ranger-gold-open={motif}>{flare}</g>
}

function Opening({ motif, fx, to, p, paint }: Stage) {
  if (fx.gold) return <GoldOpening motif={motif} fx={fx} to={to} p={p} paint={paint} />
  if (["pad", "tripwire", "beacon", "interruptLine", "offset", "hinge", "reflection", "landscape"].includes(motif)) {
    return <g transform={at(fx.area?.center ?? to)} opacity={1 - p * .75} fill="none" stroke={paint.hot}>
      <path d="M-59 14-34 5-16 9 0-2 16 9 34 5 59 14" strokeWidth="3.5" />
      {motif === "beacon" && <path d="M-15 13V-22l15-17 15 17V13M0-25V19" stroke={paint.core} strokeWidth="4" />}
    </g>
  }
  const large = ["longString", "pentagram", "sunset", "parallel", "heavyFall", "pressure", "bundle"].includes(motif)
  const draw = motif === "lowDraw" || motif === "skimmer" ? 24 : large ? 54 : 36
  const stretch = 12 + 22 * ease(p)
  return <g transform={`${at(fx.from)} rotate(${angle(fx.from, to)})`} opacity={.9 - .56 * p}>
    <path d={`M-20 ${-draw}Q26 0-20 ${draw}L${-stretch - 11} 0Z`}
      fill={paint.ink} fillOpacity=".22" stroke={paint.hot} strokeWidth={large ? 4.2 : 2.7} />
    <path d={`M-20 ${-draw}L${-stretch - 11} 0-20 ${draw}M${-stretch - 11} 0H28`}
      fill="none" stroke={paint.core} strokeWidth={large ? 2.7 : 1.7} />
    {motif === "pressure" && <path d="M6-19 14-11 6-3m8-9 8 8-8 8m8-8 8 8-8 8" stroke={paint.cool} strokeWidth="2" fill="none" />}
    {motif === "followShot" && <circle cx="33" r="13" fill="none" stroke={paint.cool} strokeWidth="3" />}
  </g>
}

function Windup({ motif, fx, to, p, paint }: Stage) {
  const { area, beat = 1 } = fx
  const lines = rails(area)
  const radius = circle(area)?.radius ?? 39
  if (area && lines.length) return <g opacity={.43 + p * .45}>
    <path d={areaPath(area)} fill={paint.hot} fillOpacity=".08" stroke={paint.hot} strokeWidth="2.3" strokeDasharray="9 7" />
    {lines.map(({ from, to, width }, i) => {
      const head = mix(from, to, ease(p))
      const side = left(direction(from, to))
      return <g key={i}>
        <path d={path([from, to])} stroke={i % 2 ? paint.hot : paint.cool} strokeWidth="2" strokeDasharray="11 8" fill="none" />
        <path d={path([along(head, side, -width * .47), along(head, side, width * .47)])} stroke={paint.core} strokeWidth="4.1" />
        {motif === "longString" && [from, to].map((point, j) => <g key={j} transform={at(point)}>
          <path d="M-25 16-15-11 0-26 15-11 25 16 0 11Z" fill={paint.ink} stroke={paint.core} strokeWidth="3.4" />
          <path d={`M0 ${-20 - 12 * (1 - p)}v29`} stroke={paint.cool} strokeWidth="5" />
        </g>)}
      </g>
    })}
  </g>
  return <g opacity=".85">
    {motif === "reflection" && beat > 1 && <g stroke={paint.cool} fill="none" opacity={.28 + .29 * p}>
      <path d={path([fx.from, to])} strokeWidth="2.4" strokeDasharray="7 11" />
      <path d="M-24-10-12-20 12-20 24-10M-24 10l12 10h24l12-10" transform={at(fx.from)} strokeWidth="2.9" />
    </g>}
    <g transform={at(to)}>
    <Ring p={p} r={radius} paint={paint} ticks={motif === "starRain" ? beat + 2 : motif === "sunset" ? 8 : 4}
      diagonal={motif === "reflection" || motif === "hinge"} />
    {motif === "singleBeat" && <path d="M-16 0H16M0-16V16" stroke={paint.core} opacity={.3 + p * .6} strokeWidth="2.1" />}
    {motif === "reprise" && beat > 1 && <path d={`M0-${radius}A${radius} ${radius} 0 ${p > .5 ? 1 : 0} 1 ${Math.sin(p * Math.PI * 2) * radius} ${-Math.cos(p * Math.PI * 2) * radius}`}
      stroke={paint.core} strokeWidth="6" fill="none" />}
    {motif === "sunset" && radius > 55 && <circle r={radius - 55} stroke={paint.cool} fill={paint.ink} fillOpacity=".17" strokeWidth="2" />}
    </g>
  </g>
}

function Pentagram({ fx, p, paint }: Stage) {
  const star = fx.area?.star
  if (!star?.length || !fx.area) return null
  const corners = [...star, star[0]]
  const step = Math.min(star.length - 1, Math.floor(p * star.length))
  const cursor = mix(corners[step], corners[step + 1], p * star.length - step)
  return <g>
    <path d={areaPath(fx.area)} stroke={paint.cool} fill={paint.ink} fillOpacity=".23" strokeWidth="2.5" strokeDasharray="13 5" opacity=".88" />
    <path d={path(corners)} stroke={paint.hot} fill="none" strokeWidth="2.8" opacity=".40" />
    {star.map((corner, i) => {
      const local = unit(p * star.length - i)
      const done = p * star.length > i + 1
      const hue = rainbow[i % rainbow.length]
      return <g key={i} transform={at(corner)} opacity={done ? .54 : .92}>
        <circle r={21} fill={paint.ink} fillOpacity=".78" stroke={hue} strokeWidth="3.7" />
        {!done && <circle r={22 + (1 - local) * 29} fill="none" stroke={hue} strokeWidth="3.1" />}
        {done ? <path d="M-11 2-3 10 13-10" stroke={paint.core} fill="none" strokeWidth="3.3" />
          : <circle r={3.3 + local * 4} fill={hue} />}
      </g>
    })}
    <Line d={path([...corners.slice(0, step + 1), cursor])} color={rainbow[step]} width={6.4} />
    <circle cx={cursor.x} cy={cursor.y} r="7.5" fill={paint.core} stroke={paint.hot} strokeWidth="4" />
  </g>
}

function Falling({ from, to, p, paint, count, width, height, weight }: {
  from: EdgePoint; to: EdgePoint; p: number; paint: Paint; count: number; width: number; height: number; weight: number
}) {
  return <g>{Array.from({ length: count }, (_, i) => {
    const side = count === 1 ? 0 : (i / (count - 1) - .5) * 2
    const end = { x: to.x + side * width, y: to.y + Math.abs(side) * width * .37 }
    const start = { x: end.x + (end.x - from.x) * .16 - side * 43, y: end.y - height + Math.abs(side) * 24 }
    const life = unit((p - Math.abs(side) * .14) / (1 - Math.abs(side) * .14))
    return life > 0 ? <Arrow key={i} from={start} to={end} p={life} paint={i % 2 ? paint : { ...paint, hot: paint.cool }}
      weight={weight * (side ? .71 : 1)} trail={.36} /> : null
  })}</g>
}

function Travel(props: Stage) {
  const { motif, fx: { from, area, beat = 1 }, to, p, paint } = props
  const arrow = (options: Partial<Parameters<typeof Arrow>[0]> = {}) =>
    <Arrow from={from} to={to} p={p} paint={paint} {...options} />
  switch (motif) {
    case "followThrough": return arrow({ weight: .64, trail: .58 })
    case "sentryFeather": return arrow({ bow: 21, height: 34, weight: .79, trail: .40 })
    case "thirdKink": {
      const corner = along(mix(from, to, .40), left(direction(from, to)), 35)
      const end = p < .4 ? mix(from, corner, p / .4) : mix(corner, to, (p - .4) / .6)
      return <g>
        <Line d={path(p < .4 ? [from, end] : [from, corner, end])} color={paint.hot} width={5.7} />
        <path d="M0-10 9 0 0 10-9 0Z" transform={at(end)} fill={paint.core} stroke={paint.cool} strokeWidth="2.6" />
      </g>
    }
    case "rimWake": return <g transform={`${at(mix(from, to, p))} rotate(${angle(from, to)})`}>
      <path d="M-36-26Q23 0-36 26M-52-21Q-4 0-52 21M-66-15Q-26 0-66 15"
        stroke={paint.hot} strokeWidth="4.4" fill="none" />
      <path d="M-22-18 6 0-22 18" stroke={paint.core} strokeWidth="3.4" fill="none" />
    </g>
    case "wireLoop": {
      const side = left(direction(from, to))
      const coil = Array.from({ length: 13 }, (_, i) =>
        along(mix(from, to, p * i / 12), side, Math.sin(i / 2) * (5 + 13 * p) * Math.sin(i * Math.PI / 12)))
      return <g><Line d={path(coil)} color={paint.hot} width={4.4} />
        <circle cx={coil[12].x} cy={coil[12].y} r="12" fill={paint.ink} stroke={paint.core} strokeWidth="3" /></g>
    }
    case "fifthRefraction": return <g>
      {[-1, 0, 1].map((side, i) => <g key={side}>{arrow({
        bow: side * 33, p: unit(p * 1.06 - Math.abs(side) * .06), weight: side ? .65 : 1.32,
        paint: { ...paint, hot: rainbow[i + 1] }, trail: .52, barbed: true,
      })}</g>)}
    </g>
    case "feather": return arrow({ weight: .74, trail: .24 })
    case "lowDraw": return arrow({ weight: .91, barbed: true, bow: -13, trail: .28 })
    case "singleBeat": return arrow({ weight: .54, trail: .45 })
    case "skimmer": return arrow({ weight: .63, bow: 4, trail: .40 })
    case "retreat": return arrow({ weight: .77, height: 14 })
    case "pierce": return arrow({ weight: .94, trail: .48 })
    case "fork": return arrow({ weight: .78, paint: beat > 1 ? { ...paint, hot: paint.cool } : paint })
    case "pressure": return arrow({ weight: 1.24, barbed: true, trail: .32 })
    case "slide": return arrow({ weight: .79, height: 25, trail: .22 })
    case "relay": return arrow({ weight: beat > 1 ? .75 : .91, bow: beat > 1 ? 22 : 0, trail: .37 })
    case "hinge": return <g transform={`${at(to)} rotate(${45 + (1 - p) * 80}) scale(${.56 + .44 * p} 1)`} opacity=".86">
      <path d="M0-53 36 0 0 53-36 0ZM0-53V53M-36 0H36" fill={paint.ink} fillOpacity=".51" stroke={paint.cool} strokeWidth="3" />
      <path d="M0-47 32 0 0-5-32 0Z" fill={paint.hot} fillOpacity=".27" stroke={paint.core} strokeWidth="2.2" />
    </g>
    case "boomerang": return arrow({ bow: beat > 1 ? 29 : 43, weight: beat > 1 ? .69 : .98, trail: .48 })
    case "edgePin": return arrow({ weight: 1.04, barbed: true, trail: .36 })
    case "footMark": return arrow({ weight: .61, bow: -16, trail: .25 })
    case "bomb": return arrow({ height: 118, weight: 1.21, barbed: true, trail: .39 })
    case "bundle": return <g>{[-1, 0, 1].map((i) => <g key={i}>
      {arrow({ from: along(from, left(direction(from, to)), i * 27), to: along(to, left(direction(from, to)), i * 23),
        weight: i ? .62 : 1.09, p: unit(p * 1.1 - Math.abs(i) * .10), paint: i ? { ...paint, hot: paint.cool } : paint })}
    </g>)}</g>
    case "crater": return <Falling from={from} to={to} p={p} paint={paint} count={1} width={0} height={180} weight={1.58} />
    case "offset": return arrow({ bow: beat > 1 ? -74 : 53, height: 52, weight: .92 })
    case "suspended": return arrow({ bow: 34, height: 57, weight: .76, trail: .31 })
    case "shear": return arrow({ weight: 1.18, barbed: true, trail: .41 })
    case "heavyFall": return <Falling from={from} to={to} p={p} paint={paint} count={3} width={65} height={206} weight={1.58} />
    case "reprise": return arrow({ from: beat > 1 ? { x: to.x + 42, y: to.y - 139 } : from, height: beat > 1 ? 42 : 110, weight: 1.11 })
    case "starRain": return <Falling from={from} to={to} p={p} paint={paint} count={beat === 1 ? 1 : beat === 2 ? 3 : 5}
      width={61} height={145 + beat * 15} weight={beat === 3 ? 1.12 : .91} />
    case "landscape": return <g>{[-1, 1].map((side) => <g key={side}>
      {arrow({ bow: side * 98, height: 73 + 20 * side, weight: 1.12, paint: side > 0 ? paint : { ...paint, hot: paint.cool } })}
    </g>)}</g>
    case "followShot": return arrow({ weight: .82, bow: 29, trail: .49 })
    case "edgeSweep": return <g>
      {[-2, -1, 0, 1, 2].map((lane) => {
        const side = left(direction(from, to))
        const border = lane === 2 || lane === -2
        return <g key={lane}>{arrow({
          from: along(from, side, lane * 20), to: along(to, side, lane * 20),
          p: unit(p * 1.18 - Math.abs(lane) * .09), weight: border ? .84 : 1.04, trail: .56,
          paint: lane < 0 ? { ...paint, hot: paint.cool } : paint,
        })}</g>
      })}
    </g>
    case "pentagram": return <Pentagram {...props} />
    case "longString": return <g opacity={.62 + .38 * p}>
      <Line d={path([from, to])} color={paint.cool} width={2 + 7 * p} />
      {arrow({ p: ease(p), weight: 1.45, barbed: true, trail: .51 })}
    </g>
    case "sunset": {
      const crown = { x: to.x + 23 * (1 - p), y: to.y - 161 * (1 - p) ** .76 }
      return <g transform={at(crown)}>
        <circle r={24 + 29 * p} fill={paint.ink} stroke={paint.hot} strokeWidth="5" />
        <path d="M-46 3Q0-51 46 3 0-17-46 3Z" fill={paint.core} />
        <ellipse rx={43 + 18 * p} ry="14" fill="none" stroke={paint.cool} strokeWidth="3.5" transform={`rotate(${-23 + p * 14})`} />
        <path d="M-52 6H52" stroke={paint.core} strokeWidth="3" />
      </g>
    }
    case "reflection": return arrow({
      from: beat > 1 ? { x: to.x - 88, y: to.y - 125 } : from, bow: beat > 1 ? -88 : 67, height: beat > 1 ? 48 : 84,
      weight: 1.18, paint: beat > 1 ? { ...paint, hot: paint.cool } : paint,
    })
    case "parallel": return <g>{rails(area).map((rail, i) => <g key={i}>
      <Line d={path([rail.from, rail.to])} color={rainbow[i + 1]} width={3.2} />
      <Arrow from={rail.from} to={rail.to} p={unit((p - i * .06) / (1 - i * .06))} paint={{ ...paint, hot: rainbow[i + 1] }} weight={1.03} trail={.42} />
    </g>)}</g>
    default: return null
  }
}

function TensionBreak({ fx, p, paint }: Stage) {
  const rail = rails(fx.area)[0]
  if (!rail) return null
  const { from, to, width, points } = rail
  const axis = direction(from, to)
  const side = left(axis)
  const alpha = (1 - p) ** 1.25
  return <g opacity={alpha}>
    <path d={path(points) + "Z"} fill={paint.ink} fillOpacity=".37" stroke={paint.cool} strokeWidth="2.8" />
    <Line d={path([from, to])} color={paint.core} width={15 * (1 - p) + 5} />
    {[-1, 1].map((sign, i) => {
      const edge = sign * (width * .39 + 12 * p)
      const begin = along(from, side, edge)
      const end = along(to, side, edge)
      const knots = [0, .19, .39, .61, .82, 1].map((step, j) => along(mix(begin, end, step), side, sign * (j % 2) * (5 + 11 * p)))
      return <g key={sign}>
        <Line d={path(knots)} color={rainbow[i * 3 + 1]} width={5.3 - p * 2.2} />
        <path d={path([begin, end])} stroke={paint.core} strokeWidth="1.9" strokeDasharray="4 14" fill="none" opacity={.87 - .48 * p} />
      </g>
    })}
    {[from, to].map((point, i) => <g key={i} transform={`${at(point)} rotate(${angle(from, to) + i * 180})`}>
      <path d="M-21-35-4-24 9-12V12L-4 24-21 35 2 6 19 0 2-6Z" fill={i ? paint.cool : paint.hot}
        fillOpacity=".64" stroke={paint.core} strokeWidth="3.2" />
      <Fan p={p} paint={paint} count={8} radius={76} turn={i * 180} shards />
    </g>)}
  </g>
}

function SolarCrown({ r, rim, p, paint }: { r: number; rim?: number; p: number; paint: Paint }) {
  const spread = ease(p) * (rim ? 25 : 13)
  return <g>
    {!rim && <circle r={r * (.45 + .51 * ease(p))} fill={paint.ink} fillOpacity=".48" stroke={paint.hot} strokeWidth="4.7" />}
    <path d={arc(r - 7, -160, -25)} stroke={paint.core} strokeWidth={5 + 4 * (1 - p)} fill="none" />
    <path d={arc(r - 3, 21, 158)} stroke={paint.hot} strokeWidth="6.2" fill="none" />
    {rim && <circle r={rim} stroke={paint.cool} strokeWidth="3" strokeDasharray="7 9" fill="none" />}
    {Array.from({ length: 10 }, (_, i) => {
      const a = i * 36 + (rim ? 11 : 0) + p * 15
      const b = a + (rim ? 27 : 15)
      const color = rainbow[i % rainbow.length]
      return <g key={i}>
        <path d={arc(r + spread, a, b)} stroke={color} strokeWidth={rim ? 7 : 4} fill="none" opacity=".81" />
        {rim && <path d={path([radial(center, r - 14, a + 3), radial(center, r + spread + 16, a + 10),
          radial(center, r + spread + 5, a + 16)])} stroke={paint.core} strokeWidth="2.4" fill="none" className="edge-fx-detail" />}
      </g>
    })}
    {!rim && <path d={`M${-r * .62} 8Q0 ${-r * .66} ${r * .62} 8Q0 ${-r * .23} ${-r * .62} 8Z`}
      stroke={paint.core} strokeWidth="4.2" fill={paint.hot} fillOpacity=".35" />}
  </g>
}

function GoldFloor({ motif, fx, to, p, paint }: Stage) {
  const radius = circle(fx.area)?.radius ?? 46
  const turn = angle(fx.from, to)
  const plates = fx.area?.parts.filter((part) => part.kind === "polygon")
  if (motif === "followThrough" && plates?.length) return <g>
    {plates.map((part, i) => <Plate key={i} part={part} p={p} paint={paint} variant="cut" />)}
  </g>
  const local = (shape: ReactNode, point = to, rotateBy = 0) =>
    <g transform={`${at(point)} rotate(${rotateBy})`} opacity={(1 - p) ** 1.04}>{shape}</g>
  switch (motif) {
    case "kickback": return local(<g transform={`scale(${.62 + .51 * ease(p)})`}>
      <path d="M-66-8-31-35 0-17 31-35 66-8 30 34 0 22-30 34Z"
        fill={paint.ink} fillOpacity=".43" stroke={paint.hot} strokeWidth="3.8" />
      <path d="M-50-7-24-22 0-8 24-22 50-7M-32 13 0 6 32 13" stroke={paint.core} fill="none" strokeWidth="3" />
    </g>)
    case "piercingHook": return local(<g><path d={arc(37 + p * 13, -124, 157)} stroke={paint.hot} strokeWidth="5" fill="none" />
      <path d="M-30-26-17-42-7-22" stroke={paint.core} strokeWidth="3" fill="none" /></g>, to, turn)
    case "sentryFeather": return local(<g><path d="M-46 21 0-33 41 20 8 8-8 8Z"
      fill={paint.hot} fillOpacity=".24" stroke={paint.core} strokeWidth="3.7" /><Fan p={p} paint={paint} count={5} radius={61} /></g>)
    case "thirdKink": return local(<path d="M-31 13-12-9-3 7 15-18 31-3M-26 22-8 4 1 15 18-10"
      stroke={paint.hot} strokeWidth="4.4" fill="none" />, to, turn)
    case "counterArc": return local(<g fill="none">
      <path d={arc(37 + 12 * p, -88, 81)} stroke={paint.hot} strokeWidth="6.4" />
      <path d="M18-21 36 0 18 21" stroke={paint.core} strokeWidth="4.4" />
    </g>, to, turn)
    case "rimWake": return local(<g fill="none">
      <circle r={radius * (.48 + .52 * ease(p))} stroke={paint.hot} strokeWidth="5.4" />
      {[-1, 1].map((s) => <path key={s} d={arc(radius + 11 * p, s * 90 - 55, s * 90 + 55)} stroke={paint.core} strokeWidth="3.6" />)}
    </g>, to, turn)
    case "wireLoop": return local(<g fill="none">
      <path d={arc(radius * (.66 + .34 * p), -146 + 62 * p, 146 + 62 * p)} stroke={paint.hot} strokeWidth="5.9" />
      <path d={arc(radius * .55, 26, 320)} stroke={paint.core} strokeWidth="3.5" strokeDasharray="11 6" />
      <path d="M-48 12C-35-43 37-42 47-5" stroke={paint.cool} strokeWidth="2.6" />
    </g>, to, turn)
    case "repriseMark": return local(<path d="M-35-20 7-10 28 0 7 10-35 20-17 0Z M-27-12 6 0-27 12"
      stroke={paint.hot} strokeWidth="4" fill={paint.ink} fillOpacity=".5" />, to, turn)
    case "runoffRain": return local(<g>
      <path d={arc(radius, -85, 85)} stroke={paint.hot} strokeWidth="5.7" fill="none" />
      {[-2, -1, 0, 1, 2].map((i) => <path key={i} transform={`rotate(${i * 32})`} d={`M4-7 ${radius * ease(p + .28)} 0 4 7 15 0Z`}
        fill={rainbow[i + 2]} fillOpacity=".66" stroke={paint.core} strokeWidth="1.7" />)}
    </g>, to, angle({ x: (FIELD.left + FIELD.right) / 2, y: (FIELD.top + FIELD.bottom) / 2 }, to))
    case "coverWing": return local(<g>
      <path d="M-50 5-32-32-15-9 0 21 15-9 32-32 50 5 27 34 0 39-27 34Z"
        fill={paint.cool} fillOpacity=".22" stroke={paint.core} strokeWidth="4" />
      <path d="M-35-16-18 15-33 10m68-26-17 31 15-5" fill="none" stroke={paint.hot} strokeWidth="3" />
    </g>)
    case "fifthRefraction": return local(<g>
      <path d="M-48 22 0-51 48 22 0 39ZM-48 22 0 9 48 22M0-51V39" stroke={paint.core} strokeWidth="4" fill={paint.ink} fillOpacity=".46" />
      <Fan p={p} paint={paint} count={9} radius={82} shards />
    </g>, to, turn)
    case "mirrorWard": return <g opacity={(1 - p) ** .9}>
      <path d={path([fx.from, mix(fx.from, to, .53), to])} stroke={paint.cool} strokeWidth="5.7" fill="none" strokeDasharray="8 8" />
      <g transform={at(fx.from)}><path d={arc(radius * .93, -140, 80)} stroke={paint.hot} strokeWidth="3.4" fill="none" /></g>
      <g transform={at(to)}><path d={arc(radius, 30, 280)} stroke={paint.cool} strokeWidth="5" fill="none" /></g>
    </g>
    default: return null
  }
}

function ImpactFloor({ motif, fx, to, p, paint }: Stage) {
  if (fx.gold) return <GoldFloor motif={motif} fx={fx} to={to} p={p} paint={paint} />
  const { area, contacts = [], beat = 1, outcome } = fx
  const part = circle(area)
  const r = part?.radius ?? 56
  const rim = part?.inner
  const alpha = (1 - p) ** .84
  const local = (effect: ReactNode) => <g transform={at(to)} opacity={alpha}>{effect}</g>
  const plate = (variant: Parameters<typeof Plate>[0]["variant"]) => <g>
    {area?.parts.map((part, i) => <Plate key={i} part={part} p={p}
      paint={motif === "parallel" ? { ...paint, hot: rainbow[i + 1] } : paint} variant={variant} />)}
  </g>
  switch (motif) {
    case "skimmer": return plate("cut")
    case "pierce": return plate("rails")
    case "fork": return plate(beat === 1 ? "cut" : "rails")
    case "pad": return local(<path d="M-36-10 0-27 36-10 24 20-24 20Z M-22 7 0-13 22 7"
      fill={paint.ink} stroke={paint.cool} strokeWidth="3.7" />)
    case "hinge": return local(<g transform={`rotate(${45 + ease(p) * (beat === 1 ? 20 : -32)})`}>
      <path d={`M0-${r} ${r * .82} 0 0 ${r} ${-r * .82} 0Z`} fill={paint.ink} fillOpacity=".5" stroke={paint.hot} strokeWidth="4" />
      <path d={`M0-${r}V${r}M${-r * .76} 0H${r * .76}`} stroke={paint.core} strokeWidth="2.6" />
      <Fan p={p} paint={paint} count={5} radius={r} shards />
    </g>)
    case "boomerang": return plate(beat > 1 ? "recoil" : "cut")
    case "bomb": return local(<g>
      <circle r={r} fill={paint.hot} fillOpacity=".16" stroke={paint.cool} strokeWidth="3" />
      <circle r={10 + ease(p) * (r - 10)} fill="none" stroke={paint.core} strokeWidth="4.4" />
      <Fan p={p} paint={paint} count={8} radius={r} />
    </g>)
    case "bundle": return plate(beat > 1 ? "rails" : "core")
    case "crater": case "heavyFall": return local(<g>
      <ellipse rx={r} ry={r * .73} fill={paint.ink} fillOpacity=".54" stroke={paint.hot} strokeWidth={motif === "heavyFall" ? 6 : 4} />
      <path d="M-74 12-30-9-18 15 11-18 32-8 73-36M-18 15-12 50M11-18l-8-30M32-8l21 24" stroke={paint.core} strokeWidth="4" fill="none" />
      <Fan p={p} paint={paint} count={motif === "heavyFall" ? 12 : 9} radius={r * 1.10} shards />
    </g>)
    case "offset": return local(<g transform={`rotate(${(beat > 1 ? -1 : 1) * (27 + 35 * p)})`}>
      <path d={`M${-r} 0Q0-${r * 1.03} ${r} 0Q0 ${r * .74} ${-r} 0Z`} fill={paint.hot} fillOpacity=".14" stroke={beat > 1 ? paint.cool : paint.hot} strokeWidth="4" />
      <path d="M-49 3Q-9-30 41-6-2 22-49 3Z" stroke={paint.core} strokeWidth="3.7" fill="none" />
    </g>)
    case "suspended": return beat > 1 ? local(<g>
      <ellipse rx={r} ry={r * .68} stroke={paint.core} strokeWidth="4" fill={paint.ink} fillOpacity=".38" />
      <Fan p={p} paint={paint} count={7} radius={r} shards />
    </g>) : null
    case "tripwire": case "interruptLine": return plate("recoil")
    case "shear": return plate("cut")
    case "reprise": return local(<g>
      <circle r={r * (.87 + .13 * p)} fill="none" stroke={paint.hot} strokeWidth="3.8" strokeDasharray={beat > 1 ? "5 7" : "19 5"} />
      <path d={beat > 1 ? "M-69-24-35 8 0-29 35 8 69-24" : "M-69 24-35-8 0 29 35-8 69 24"}
        fill="none" stroke={paint.core} strokeWidth="4.1" />
    </g>)
    case "beacon": return outcome === "shield"
      ? <g opacity={alpha}>{contacts.map((point, i) => <g key={i} transform={at(point)}>
        <path d="M0-52 41-33 36 17 0 53-36 17-41-33Z" fill={paint.cool} fillOpacity=".18" stroke={paint.core} strokeWidth="4" />
      </g>)}</g>
      : local(<g><circle r={r} fill={paint.hot} fillOpacity=".10" stroke={paint.hot} strokeWidth="4" />
        <Fan p={p} paint={paint} count={7} radius={r} /></g>)
    case "starRain": return local(<g>
      <circle r={r} fill={paint.hot} fillOpacity=".10" stroke={paint.cool} strokeWidth={3 + beat} />
      <circle r={r * (.25 + .68 * ease(p))} fill="none" stroke={paint.core} strokeWidth="3.3" strokeDasharray={beat === 3 ? "13 3" : undefined} />
      <Fan p={p} paint={paint} count={3 + 2 * beat} radius={r} shards={beat === 3} />
    </g>)
    case "landscape": return beat > 1 && area ? <g opacity={alpha}>
      {area.parts.flatMap((part, i) => part.kind === "circle" ? [<g key={i} transform={at(part.center)}>
        <circle r={part.radius} fill={paint.cool} fillOpacity=".18" stroke={paint.core} strokeWidth="3.8" />
        <path d="M-30 15-8-7 2 6 26-24M2 6l9 16" stroke={paint.hot} strokeWidth="4" fill="none" />
        <Fan p={p} paint={paint} count={6} radius={part.radius + 25} shards />
      </g>] : [])}
    </g> : local(<g>
      <path d={areaPath({ center: { x: 0, y: 0 }, parts: [{ kind: "circle", center: { x: 0, y: 0 }, radius: r, inner: rim }] })}
        fill={rim ? paint.cool : paint.hot} fillRule="evenodd" fillOpacity=".17" stroke={rim ? paint.cool : paint.hot} strokeWidth={rim ? 5 : 3} />
      <Fan p={p} paint={paint} count={rim ? 12 : 7} radius={r * (rim ? 1.34 : .83)} shards />
    </g>)
    case "edgeSweep": return plate("recoil")
    case "pentagram": return area?.star ? <g opacity={alpha}>
      <path d={areaPath(area)} stroke={paint.core} strokeWidth={5 + 5 * (1 - p)} fill={paint.hot} fillOpacity={.18 + .24 * (1 - p)} />
      <image href={starburst} x={-196} y={-196} width={392} height={392} transform={`${at(to)} scale(${.79 + p * .32})`}
        opacity={.46 * (1 - p) ** 1.4} className="edge-vfx-keyframe edge-fx-detail" />
      <Line d={path([...area.star, area.star[0]])} color={paint.cool} width={5 + 2 * (1 - p)} />
      {area.star.map((point, i) => <g key={i} transform={at(point)}>
        <Fan p={p} paint={{ ...paint, hot: rainbow[i] }} count={4} radius={69} turn={i * 30} shards />
      </g>)}
    </g> : null
    case "longString": return beat > 1 ? null : <TensionBreak motif={motif} fx={fx} to={to} p={p} paint={paint} />
    case "sunset": return local(<SolarCrown r={r} rim={rim} p={p} paint={paint} />)
    case "reflection": return local(<g>
      <ellipse rx={r} ry={r * .72} fill={beat > 1 ? paint.cool : paint.hot} fillOpacity=".16" stroke={beat > 1 ? paint.cool : paint.hot} strokeWidth="4.6" />
      <path d={`M${-r * .82} 8 ${-r * .24} -20 0 11 ${r * .27} -16 ${r * .82} 9`}
        stroke={paint.core} fill="none" strokeWidth="3.9" transform={beat > 1 ? "scale(-1 1)" : undefined} />
      <Fan p={p} paint={paint} count={7} radius={r} shards />
    </g>)
    case "parallel": return <g>
      {plate("rails")}
      {rails(area).map(({ from, to, width }, i) => <g key={i} opacity={alpha} fill="none" stroke={rainbow[i + 1]}>
        {[.07, .23, .39, .55, .71, .87].map((step, j) => <path key={step}
          d={`M-20 ${-width * .42}L0 0-20 ${width * .42}`}
          transform={`${at(mix(from, to, unit(step + p * .15)))} rotate(${angle(from, to)})`}
          strokeWidth={j % 2 ? 2.4 : 4.1} opacity={j % 2 ? .62 : .87} />)}
      </g>)}
    </g>
    default: return null
  }
}

function Contacts({ motif, fx, p, paint }: Stage) {
  const { from, beat = 1, contacts = [], outcome } = fx
  if (!contacts.length) return null
  const peak = (1 - p) ** 1.5
  return <g opacity={peak}>
    {contacts.map((point, i) => {
      const turn = angle(from, point)
      const pierce = motif === "pierce" || motif === "fork"
      const heavy = ["pressure", "lowDraw", "edgePin", "heavyFall", "crater", "longString"].includes(motif)
      const lock = motif === "singleBeat" || motif === "footMark" || motif === "suspended"
      const trail = motif === "relay" && beat > 1 || motif === "followShot"
      const ink = i % 2 ? paint.cool : paint.hot
      return <g key={i} transform={at(point)}>
        {trail && <Line d={path([{ x: from.x - point.x, y: from.y - point.y }, { x: 0, y: 0 }])} color={ink} width={4.7} />}
        {outcome === "shield" ? <path d="M0-41 33-24 29 12 0 41-29 12-33-24Z" fill="none" stroke={paint.cool} strokeWidth="3.1" />
          : <g transform={`rotate(${turn})`}>
            {lock ? <path d={motif === "singleBeat" ? "M-30 0H30M0-30V30M-10-10 10 10m0-20-20 20" : "M-22 14H23M2-38V19m-11-9 11 9 10-9"}
              stroke={paint.core} strokeWidth="3.3" fill="none" />
              : pierce ? <path d="M-32 0H-3L24-21M-3 0 27 20M-4-5 6 0-4 5Z" stroke={paint.core} strokeWidth="3.8" fill="none" />
                : heavy ? <path d="M-36-19-13-8 5-23 31 0 5 23-13 8-36 19-19 0Z" fill={ink} fillOpacity=".46" stroke={paint.core} strokeWidth="3.4" />
                  : <path d="M-27 0-9-4 0-20 7-5 26 0 7 5 0 20-9 4Z" fill={ink} stroke={paint.core} strokeWidth="2.6" />}
          </g>}
        {(heavy || motif === "starRain" && beat === 3 || motif === "pentagram") && <Fan p={p} paint={paint} count={6} radius={53} turn={turn} />}
        {motif === "skimmer" && <path d="M-25 24 20 17m-32 12 26-4" stroke={paint.cool} strokeWidth="3" fill="none" />}
      </g>
    })}
  </g>
}

function Motion({ motif, fx: { from }, to, p, paint }: Stage) {
  const swing = angle(from, to)
  const slide = motif === "slide" || motif === "retreat"
  const segment = mix(from, to, Math.min(1, p * 1.65))
  const side = left(direction(from, to))
  const edge = [
    { gap: Math.abs(to.y - FIELD.top), d: `M${to.x - 28} ${FIELD.top}h56` },
    { gap: Math.abs(to.y - FIELD.bottom), d: `M${to.x - 28} ${FIELD.bottom}h56` },
    { gap: Math.abs(to.x - FIELD.left), d: `M${FIELD.left} ${to.y - 28}v56` },
    { gap: Math.abs(to.x - FIELD.right), d: `M${FIELD.right} ${to.y - 28}v56` },
  ].sort((a, b) => a.gap - b.gap)[0]
  return <g opacity={(1 - p) ** 1.30}>
    <Line d={path([from, segment])} color={slide ? paint.cool : paint.hot} width={slide ? 6.4 : 3.1} />
    {slide && <g>
      <path d={path([along(from, side, -16), along(segment, side, -6)])} fill="none" stroke={paint.core} strokeWidth="2.8" />
      <path d={path([along(from, side, 16), along(segment, side, 6)])} fill="none" stroke={paint.hot} strokeWidth="3.5" />
      <g transform={`${at(from)} rotate(${swing})`}><path d="M-15-9 4-11 15-7 14 7 4 11-15 9Z" stroke={paint.hot} fill={paint.ink} strokeWidth="2" /></g>
    </g>}
    <g transform={`${at(to)} rotate(${swing})`} fill="none" stroke={paint.core} strokeWidth={slide ? 3.5 : 4.5}>
      <path d={slide ? "M-12-19 0-8V8L-12 19m12-20 11-10" : "M-18-14 6 0-18 14M-5-17 23 0-5 17"} />
    </g>
    {motif === "edgePin" && <path d={edge.d} fill="none" stroke={paint.hot} strokeWidth="3.1" opacity=".72" />}
  </g>
}

export function RangerField({ field, battle, skill }: { field: FieldEffect; battle: EdgeBattle; skill: string }) {
  const owner = battleFighters(battle).find(({ id }) => id === field.cast.owner)
  const scene = rangerChoreography(skill)
  if (!scene) return null
  const { area } = field
  const alive = unit((field.until - battle.time) / .32)
  const age = battle.time - field.time
  const paint = colors[owner?.card.rarity ?? "C"]
  const rail = rails(area)[0]
  const r = circle(area)?.radius ?? 59
  if (scene.motif === "detourSeal") return <g transform={at(area.center)} opacity={alive} data-ranger-field={scene.motif} data-skill-vfx={skill}>
    <circle r={r} fill="#332148" fillOpacity=".29" stroke="#e9c28e" strokeWidth="2.8" strokeDasharray="10 6" />
    <g stroke="#c4a4ea" fill="none" strokeWidth="3.2" opacity={.56 + .24 * Math.sin(age * 7)}>
      {[-42, -21, 0, 21, 42].map((y) => <path key={y} d={`M-42 ${y + 10}l36-23 32 15 15-9`} />)}
    </g>
  </g>
  if (rail && (scene.motif === "tripwire" || scene.motif === "interruptLine")) {
    const high = scene.motif === "interruptLine"
    const tip = mix(rail.from, rail.to, (age % 1.9) / 1.9)
    return <g opacity={alive} data-ranger-field={scene.motif}>
      <path d={path(rail.points) + "Z"} fill={paint.hot} fillOpacity=".11" stroke={paint.hot} strokeWidth="2" strokeDasharray="8 6" />
      <Line d={path([rail.from, rail.to])} color={paint.hot} width={high ? 5.2 : 3.9} />
      {high && <path d={path([rail.from, rail.to])} transform="translate(0 -17)" fill="none" stroke={paint.cool} strokeWidth="3.1" opacity=".78" />}
      {[rail.from, rail.to].map((point, i) => <g key={i} transform={at(point)}>
        <path d={high ? "M-11 12-12-28 0-44 12-28 11 12Z" : "M-12 11 0-19 12 11 0 17Z"} fill={paint.ink} stroke={paint.core} strokeWidth="3" />
      </g>)}
      <circle cx={tip.x} cy={tip.y} r={high ? 7 : 5} fill={paint.core} />
    </g>
  }
  if (scene.motif === "pad" || scene.motif === "beacon") return <g transform={at(area.center)} opacity={alive} data-ranger-field={scene.motif}>
    <circle r={r} fill={paint.ink} fillOpacity=".25" stroke={paint.hot} strokeWidth="2.1" strokeDasharray={scene.motif === "pad" ? "3 7" : "11 5"} />
    {scene.motif === "pad" ? <path d="M-31 14-18-7 0-19 18-7 31 14 16 26H-16ZM0-29V15m-8-26 8-12 8 12"
      fill={paint.ink} stroke={paint.cool} strokeWidth="3.2" />
      : <g>
        <path d="M-18 27V-21L0-59 18-21V27L0 13Z" fill={paint.ink} stroke={paint.hot} strokeWidth="4" />
        <path d="M0-47 10-20 0 1-10-20Z" fill={paint.core} fillOpacity={.71 + Math.sin(age * 4) * .18} />
        <ellipse rx={49 + Math.sin(age * 4) * 6} ry="18" cy="19" fill="none" stroke={paint.cool} strokeWidth="2.6" />
      </g>}
  </g>
  return null
}

export function RangerGoldBuffs({ battle }: { battle: EdgeBattle }) {
  return <g pointerEvents="none" aria-hidden="true">
    {battle.runtime.buffs.map((buff) => {
      const id = buff.cast.signature?.id
      if (id !== "ranger/Radiant/G2" || buff.kind !== "anti" || buff.until <= battle.time) return null
      const target = unitOf(battle, buff.target)
      if (!target?.hp) return null
      return <g key={buff.id} transform={at(target)} opacity={unit((buff.until - battle.time) / .32) * .8}
        data-ranger-gold-buff="coverWing" data-skill-vfx={id} fill="none" stroke="#ffd7a8" strokeWidth="2.8">
        <path d="M-34 15-45 32-34 45-17 46-26 34M34 15 45 32 34 45 17 46 26 34" />
        <path d="M-35 35-27 41M35 35 27 41" stroke="#fff1d2" />
      </g>
    })}
  </g>
}

export function RangerWatchMarks({ battle }: { battle: EdgeBattle }) {
  return <g pointerEvents="none" aria-hidden="true">
    {battle.runtime.watches.map((watch) => {
      const motif = watch.cast.skill && rangerChoreography(watch.cast.skill.id)?.motif
      if (watch.derived || watch.uses <= 0 || !motif || !["footMark", "suspended", "followShot"].includes(motif)) return null
      const target = unitOf(battle, watch.target)
      if (!target?.hp) return null
      const opacity = unit((watch.until - battle.time) / .32)
      return <g key={watch.cast.id + "-" + watch.id} transform={at(target)} opacity={opacity} data-ranger-watch={motif}>
        {motif === "footMark" ? <path d="M-30 27-14 38H14l16-11M0 47v14" stroke="#c1b8ff" strokeWidth="3.2" fill="none" />
          : motif === "followShot" ? <path d="M-32-38-18-51 0-39 18-51 32-38M0-39v-16" stroke="#ffb8dd" strokeWidth="3.2" fill="none" />
            : <g transform={`translate(0 ${Math.sin(battle.time * 6) * 5})`}>
              <path d="M0-77 9-65 0-45-9-65ZM0-42v9" fill="#edbcff" stroke="#fff1fc" strokeWidth="2.6" />
              <path d="M-20-51Q0-36 20-51" stroke="#c4b4ff" strokeWidth="2.4" fill="none" />
            </g>}
      </g>
    })}
  </g>
}

export function EdgeRangerEffects({ battle, layer }: { battle: EdgeBattle; layer: "floor" | "front" }) {
  return <g className="edge-skill-vfx edge-ranger-vfx" aria-hidden="true">
    {layer === "floor" && <image href={starburst} width="1" height="1" opacity="0" />}
    {battle.runtime.effects.map((fx) => {
      const scene = rangerChoreography(fx.skill)
      if (!scene || battle.time < fx.start || battle.time >= fx.end) return null
      const floor = layer === "floor"
      if (floor && (fx.phase === "travel" || fx.phase === "motion") || !floor && (fx.phase === "start" || fx.phase === "windup")) return null
      const to = unitOf(battle, fx.target) ?? fx.to
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const palette = colors[fx.rarity]
      const paint = fx.gold ? { ...palette, hot: "#ffd18e", core: "#fff5d5" } : palette
      const props = { motif: scene.motif, fx, to, p, paint }
      return <g key={fx.id} data-skill-vfx={fx.skill} data-ranger-motif={scene.motif}
        data-vfx-phase={fx.phase} data-vfx-layer={layer} data-vfx-beat={fx.beat} data-vfx-contacts={fx.contacts?.length}>
        {fx.phase === "start" ? <Opening {...props} /> : fx.phase === "windup" ? <Windup {...props} />
          : fx.phase === "travel" ? <Travel {...props} /> : fx.phase === "motion" ? <Motion {...props} />
            : floor ? <ImpactFloor {...props} /> : <Contacts {...props} />}
      </g>
    })}
  </g>
}
