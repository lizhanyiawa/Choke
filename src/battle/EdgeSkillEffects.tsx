import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { along, clamp, direction, edgeDistance, left, rotate } from "./edgeSkills/geometry"
import type { Glyph, Mark, SkillVisual } from "./edgeSkills/presentation"
import { rangerChoreography } from "./edgeSkills/rangerChoreo"
import { battleFighters, unitOf, type FieldEffect } from "./edgeSkills/state"

const paths: Record<Glyph, string> = {
  anchor: "M0-19V13M-8-10H8M-19 4Q-15 18 0 18T19 4L13 9M-19 4l6 5M0-19a4 4 0 1 0 .1 0",
  arrow: "M-22 0H19M8-7 22 0 8 7 12 0ZM-15 0l-8-7m8 7-8 7",
  barb: "M-21 0H21L4-11l4 8-19-5 4 8-4 8L8 3 4 11 21 0",
  bell: "M-16 9Q-9 4-9-6a9 9 0 0 1 18 0q0 10 7 15ZM-4 15Q0 22 4 15M-3-17H3",
  blade: "M-21 5-10-5 23-9 9 4-10 9ZM-13 0l5 11m-15-1 8-4",
  bolt: "M3-22-15 3H-2l-3 19L17-6H3Z",
  bow: "M-12-22Q26 0-12 22L-4 0ZM-10 0H21l-7-5m7 5-7 5",
  branch: "M0 21V0l-11-12m11 12 9-16M-9-9l-8-1m26-6 8-4M0 6l12-6",
  chain: "M-19 5q-6-5 0-11l7-7q7-6 12 0l3 4m-6 18 3 4q5 6 12 0l7-7q6-6 0-11M-8 8 8-8",
  claw: "M-21 13q5-20 24-29L-9 14ZM-6 15q5-20 24-29L6 16ZM8 16Q12 1 23-6L17 17Z",
  clock: "M16-8A18 18 0 1 0 18 5M18-18v11H7M0-11V2l8 5",
  cross: "M-5-18H5V-5H18V5H5V18H-5V5H-18V-5H-5Z",
  crown: "M-21-11-11-4 0-17 11-4 21-11 16 12H-16ZM-13 17H13",
  drop: "M0-21Q-15-3-15 6a15 15 0 1 0 30 0Q15-3 0-21ZM-9 5q-2 6 3 9",
  dust: "M-21 10-12 0-6 3 0-14 7 4l7-5 8 12M-20 17l11-3m3 2 10-3m4 3 11-2",
  ember: "M-3-20Q9-12 8-3l7-4q6 16-5 24Q-6 27-15 12-20 1-7-7q-1 7 3 9Q2-6-3-20Z",
  eye: "M-21 0Q0-23 21 0 0 23-21 0ZM0-7a7 7 0 1 0 .1 0",
  feather: "M-19 19 16-17M-10 10Q-20-7 13-18L20-20 17-4Q12 10-10 10ZM-4 4 10 4m-5-10 11 1",
  fire: "M-19 9-10 2-19-1-6-5-10-14Q7-14 19 0 9 18-7 17l2-5Z",
  flag: "M-11 19V-20m1 2 28 3-9 9 9 7-28-3M-18 20H-4",
  flame: "M0-24Q14-12 11-3l8-6q6 25-19 30-24-3-19-21l8 5Q-12-6 0-24ZM1-6q-11 16 1 21 10-4-1-21",
  gate: "M-21 18V-17H-7v9h14v-9h14v35H9V4H-9v14Z",
  gear: "M-5-22H5l3 7 8-2 6 8-5 6 2 8 3 4-6 8-8-2-3 7H-5l-3-7-8 2-6-8 5-6-2-8-3-4 6-8 8 2ZM0-7a7 7 0 1 0 .1 0",
  heart: "M0 18-17 2Q-27-11-16-16-5-20 0-11 5-20 16-16 27-11 17 2Z",
  hammer: "M-8-17H18V-3H-8ZM1-2V21H-6V-2M-14-15H-8m26 10 5 5",
  hook: "M-22-5H6q15 0 15 10 0 12-14 12Q-5 17-5 9l6 3M-22-10v10",
  hour: "M-16-19H16M-16 19H16M-12-19Q-12-8 0 0q12-8 12-19M-12 19q0-11 12-19 12 8 12 19M-7 13 0 7l7 6",
  ice: "M0-23V23M-20-12 20 12M-20 12 20-12M-6-16 0-10l6-6M-6 16l6-6 6 6M-18-4l8-2-1-8m29 10-8-2 1-8",
  lantern: "M-10-13H10l6 8-4 19H-12l-4-19ZM-6-14q0-12 12 0M0-7Q9 3 0 8-9 3 0-7",
  leaf: "M-15 16Q-22-9 19-20 16 18-15 16ZM-17 19l24-28m-16 19V-3m4 10 14-1",
  loop: "M0 0Q-14-19-22-7T-12 10Q-6 9 0 0 14-19 22-7T12 10Q6 9 0 0Z",
  mask: "M-20-14-8-10 8-10 20-14 16 7 0 19-16 7ZM-12-4l7 2-6 4Zm24 0-7 2 6 4Z",
  meteor: "M-16-19-6-10-4-19 6-8 12-11 21 2 14 14 1 20-10 11-13-1-22-12-13-8Z",
  needle: "M-22-2 23 0-22 2ZM-16-6V6m-5-7v2",
  note: "M-4 9a8 6 0 1 1-1-1V-16l18-4v19a8 6 0 1 1-1-1V-11l-16 3Z",
  orb: "M0-18a18 18 0 1 0 .1 0M-18 0Q0-13 18 0 0 13-18 0M0-18Q13 0 0 18-13 0 0-18",
  petal: "M0 20Q-22 5-18-10-14-25 0-9 14-25 18-10 22 5 0 20Z",
  plate: "M-21-11-10-17H10l11 6v21l-9 7h-24l-9-7ZM-13-6H13M-12 6H12",
  prism: "M0-21 19-4 13 17H-13L-19-4ZM0-21-5-4-13 17M-19-4H19M-5-4l18 21",
  ribbon: "M-22-7Q-11-21 4-9t18 4l-4 13Q8 16-4 8T-22 7l5-7Z",
  rune: "M-14-18H9l5 9L-6 9l-1 10M-11-9H3M1 11h13l-4 8",
  seed: "M-17 11Q-19-8 18-20 22 14-7 17ZM-16 15l23-24",
  shard: "M-7-22 15-8 11 15-3 22-15 4ZM-7-22 3-3-3 22M-15 4 3-3 15-8",
  shield: "M0-22 19-15 17 5Q13 17 0 23-13 17-17 5l-2-20ZM0-13V11m-8-12H8",
  sickle: "M-23-10Q7-26 22-1 15 19-7 20 12 8 9-2 3-12-23-10Z",
  spark: "M0-23 4-6 20-13 10 0l12 8-16-2-6 17-5-17-16 5 12-11-10-12 15 7Z",
  star: "M0-22 6-7 22-7 10 3 14 20 0 10-14 20-10 3-22-7-6-7Z",
  step: "M-14 18q-7-2-3-12l7-13q5-9 10-3 5 5 1 13-7 17-15 15ZM8 6q-7-2-3-11l5-11q5-9 11-3 4 5 0 13-6 15-13 12Z",
  thorn: "M-22 13-7-17 1 1 9-23l5 23 9-8-5 22Z",
  wall: "M-21-15H21V15H-21ZM-21-5H21M-21 5H21M-6-15v10m12 0V5M-6 5v10",
  wing: "M-21-13Q-2-15 6-3l16-9Q14 14-14 17l3-9-8-1 6-6-8-3Z",
  banner: "M-18-17H18M-13-17v35l13-6 13 6v-35M0-8v13m-6-7H6",
  wave: "M-22 6Q-12 19 0 6T22 6M-22-6Q-12 7 0-6T22-6",
  sun: "M0-12a12 12 0 1 0 .1 0M0-22v5m0 34v5M-22 0h5m34 0h5M-16-16l4 4m24 24 4 4m-32 0 4-4m24-24 4-4",
  knot: "M-17-9Q6 15 16 9 27 1 12-7-7-19-18-9-27 2-12 7 4 15 17-11M-9-16l18 32",
  key: "M-8-12a9 9 0 1 0 .1 0M-3-3 17 17m-6-6 6-6m-1 11 6-6",
}

const rarityTints: Record<Rarity, string> = {
  C: "#f6dcf0", UC: "#7ee1ff", R: "#95a9ff", E: "#c695ff", L: "#ffcf83", Radiant: "#ffa5c8", Prismatic: "#f0bfff",
}
const glyphTints: Partial<Record<Glyph, string>> = {
  arrow: "#a9e7ff", fire: "#ff9d73", flame: "#ff926f", ember: "#ffc489", ice: "#98ecff", bolt: "#b2b9ff",
  leaf: "#a8ead6", seed: "#d1eebf", cross: "#d5f8f0", note: "#e7b9ff", blade: "#ffadc6", drop: "#ffc0b3",
}
const prism = ["#fff7fc", "#a7e7ff", "#f8a7cf", "#c3aeff", "#ffdda1"]
const bound = (p: number) => clamp(p, 0, 1)
const lerp = (a: EdgePoint, b: EdgePoint, p: number) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p })
const translate = ({ x, y }: EdgePoint) => `translate(${x} ${y})`
const polar = (radius: number, degrees: number) => rotate({ x: radius, y: 0 }, degrees)
const linePath = (points: readonly EdgePoint[]) => "M" + points.map(({ x, y }) => x + " " + y).join("L")
const angleTo = (from: EdgePoint, to: EdgePoint) => Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI

function tintOf(fx: SkillVisual) {
  return fx.gold ? "#ffda95" : fx.rarity === "C" || fx.rarity === "UC" ? glyphTints[fx.mark.glyph] ?? rarityTints[fx.rarity]
    : rarityTints[fx.rarity]
}

function GlyphShape({ glyph, tint, size = 1, angle = 0, x = 0, y = 0 }: {
  glyph: Glyph; tint: string; size?: number; angle?: number; x?: number; y?: number
}) {
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
    <path d={paths[glyph]} stroke="#22132e" strokeWidth="8" fill={tint} fillOpacity=".32" />
    <path d={paths[glyph]} stroke={tint} strokeWidth="5.5" opacity=".72" fill="none" />
    <path d={paths[glyph]} stroke="#fff4fd" strokeWidth="2.15" fill={tint} fillOpacity=".20" />
  </g>
}

function Stroke({ points, tint, width = 7 }: { points: readonly EdgePoint[]; tint: string; width?: number }) {
  const d = linePath(points)
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={tint} strokeWidth={width * 3.1} opacity=".16" />
    <path d={d} stroke={tint} strokeWidth={width} opacity=".74" />
    <path d={d} stroke="#fff5fc" strokeWidth={width * .30} opacity=".86" />
  </g>
}

function Projectile({ at, progress, glyph, tint, scale = 1 }: {
  at: (progress: number) => EdgePoint; progress: number; glyph: Glyph; tint: string; scale?: number
}) {
  const head = at(progress)
  const tail = [0.29, 0.21, 0.13, 0.065, 0].map((offset) => at(bound(progress - offset)))
  const angle = angleTo(at(bound(progress - 0.035)), at(bound(progress + 0.035)))
  return <g data-edge-projectile={glyph}>
    <Stroke points={tail} tint={tint} width={6 * scale} />
    <g className="edge-fx-detail" fill={tint}>
      {tail.slice(1, -1).map(({ x, y }, i) => <circle key={i} cx={x + (i - 1) * 9} cy={y - 10 + 7 * i} r={(1.7 + i * 1.4) * scale} opacity={.35 + i * .22} />)}
    </g>
    <g className="edge-vfx-glow"><GlyphShape glyph={glyph} x={head.x} y={head.y} tint={tint} size={scale} angle={angle} /></g>
  </g>
}

function StarRun({ fx, progress, tint }: { fx: SkillVisual; progress: number; tint: string }) {
  const star = fx.area?.star
  if (!star) return null
  const corners = [...star, star[0]]
  const position = (t: number) => {
    const step = Math.min(4, Math.floor(t * 5))
    return lerp(corners[step], corners[step + 1], t * 5 - step)
  }
  return <g>
    {star.map(({ x, y }, i) => {
      const local = bound((i + 1) / 5 - progress)
      const landed = progress * 5 >= i
      return <g key={i} transform={translate({ x, y })} stroke={prism[i]} fill="none">
        <circle r={24} strokeWidth="3" fill={prism[i]} fillOpacity={landed ? ".26" : ".06"} />
        <circle r={24 + local * 52} strokeWidth="2.6" opacity={landed ? ".70" : ".45"} />
        {landed && <path d="M-12 0H12M0-12V12" stroke="#fff5fc" strokeWidth="2.5" />}
      </g>
    })}
    <Stroke points={[...corners.slice(0, Math.floor(progress * 5) + 1), position(progress)]} tint={tint} width={4} />
    <Projectile at={position} progress={progress} glyph="star" tint={prism[Math.min(4, Math.floor(progress * 5))]} scale={.77} />
  </g>
}

function TravelEffect({ fx, to, progress, tint }: { fx: SkillVisual; to: EdgePoint; progress: number; tint: string }) {
  const { from, mark: { motion, glyph }, area } = fx
  const axis = direction(from, to)
  const sideways = left(axis)
  const gap = edgeDistance(from, to)
  const span = Math.max(50, Math.min(143, gap * .28))
  const scale = fx.skill.startsWith("Q/") ? .68 : fx.gold || fx.rarity === "Prismatic" ? 1.16 : .99
  const strength = Math.sin(Math.PI * bound(progress * 1.09))
  const arc = (t: number, bend: number) => along(lerp(from, to, t), sideways, Math.sin(Math.PI * t) * bend)
  const trail = (at: (t: number) => EdgePoint, p = progress, factor = 1) =>
    <Projectile at={at} progress={p} glyph={glyph} tint={tint} scale={scale * factor} />

  switch (motion) {
    case "star": return <StarRun fx={fx} progress={progress} tint={tint} />
    case "shot": return trail((t) => lerp(from, to, t))
    case "lob": return trail((t) => {
      const p = lerp(from, to, t)
      return { x: p.x, y: p.y - Math.sin(t * Math.PI) * (span + 42) }
    }, progress, 1.12)
    case "bend": case "return": case "chase":
      return trail((t) => arc(t, motion === "bend" ? span : motion === "return" ? -span * .82 : 26 * Math.sin(t * 5)))
    case "rise": return trail((t) => ({ x: to.x + (from.x - to.x) * (1 - t) * .12, y: to.y + (1 - t) * 130 }), progress, .98)
    case "chain": {
      const joints = [from, along(lerp(from, to, .38), sideways, span * .28), along(lerp(from, to, .66), sideways, -span * .32), to]
      return trail((t) => {
        const i = Math.min(2, Math.floor(t * 3))
        return lerp(joints[i], joints[i + 1], t * 3 - i)
      })
    }
    case "rain": {
      const circle = area?.parts.find((part) => part.kind === "circle")
      const radius = circle?.radius ?? 53
      return <g>{[-1, 0, 1].map((side) => {
        const landing = { x: to.x + side * radius * .53, y: to.y + Math.abs(side) * radius * .27 }
        const at = (p: number) => ({ x: landing.x - (1 - p) * (50 - side * 32), y: landing.y - (1 - p) * (172 + Math.abs(side) * 30) })
        return <Projectile key={side} at={at} progress={bound((progress - .14 * Math.abs(side)) / (1 - .14 * Math.abs(side)))}
          glyph={glyph} tint={side ? tint : "#fff0fc"} scale={scale * (side ? .64 : 1.12)} />
      })}</g>
    }
    case "orbit": {
      const center = area?.center ?? to
      const circle = area?.parts.find((part) => part.kind === "circle")
      const radius = circle?.radius ?? Math.max(46, span)
      return <g>
        <ellipse cx={center.x} cy={center.y} rx={radius} ry={radius * .72} stroke={tint} strokeWidth="2.4" fill="none" strokeDasharray="3 12" opacity=".56" />
        {trail((t) => {
          const pos = polar(radius, -90 + t * 360)
          return { x: center.x + pos.x, y: center.y + pos.y * .72 }
        })}
      </g>
    }
    case "split": return <g>{[-1, 1].map((side) =>
      <Projectile key={side} at={(p) => along(lerp(from, to, p), sideways, side * span * p * p)} progress={progress}
        glyph={glyph} tint={tint} scale={scale * .83} />)}</g>
    case "beam": case "lanes": case "cross": {
      const cross = motion === "cross"
      const center = area?.center ?? to
      const end = lerp(from, to, Math.min(1, progress * 1.63))
      const pathsToDraw = cross ? [-1, 1] : motion === "lanes" ? [-1, 0, 1] : [0]
      return <g opacity={.95 - .55 * progress}>{pathsToDraw.map((i) => {
        const start = cross ? along(along(center, sideways, i * 120), axis, -span) : along(from, sideways, i * 43)
        const finish = cross ? along(along(center, sideways, -i * 120), axis, span) : along(end, sideways, i * 43)
        return <g key={i}>
          <Stroke points={[start, finish]} tint={i === 0 ? tint : prism[i + 2]} width={(8 + 11 * strength) * scale} />
          <GlyphShape glyph={glyph} tint={tint} x={finish.x} y={finish.y} angle={angleTo(start, finish)} size={scale * .86} />
        </g>
      })}</g>
    }
    case "wave": {
      const center = lerp(from, to, progress)
      const width = (42 + progress * 96) * scale
      return <g transform={`${translate(center)} rotate(${angleTo(from, to)})`} opacity={.95 - progress * .65}>
        <path d={`M-34 ${-width}Q72 0-34 ${width}Q33 0-34 ${-width}Z`} stroke={tint} strokeWidth="3" fill={tint} fillOpacity=".38" />
        <path d={`M-27 ${-width * .88}Q71 0-27 ${width * .88}`} stroke="#fff3fb" fill="none" strokeWidth="5" />
        <GlyphShape glyph={glyph} tint={tint} size={scale * .74} />
      </g>
    }
    case "tether": {
      const pulse = lerp(from, to, progress)
      return <g opacity={.88 - progress * .41}>
        <path d={linePath([from, to])} fill="none" stroke={tint} strokeWidth="3.5" strokeDasharray="9 6" />
        <Stroke points={[lerp(from, to, Math.max(0, progress - .18)), pulse]} tint={tint} width={9} />
        <GlyphShape glyph={glyph} tint={tint} x={pulse.x} y={pulse.y} size={scale * .76} angle={angleTo(from, to)} />
      </g>
    }
    case "dash": case "blink": case "swap": {
      const swap = motion === "swap"
      const bend = motion === "blink" ? span * .46 : 0
      return <g opacity={.92 - .72 * progress}>
        {Array.from({ length: 5 }, (_, i) => {
          const p = bound(progress + (i - 2) * .16)
          const at = arc(p, bend)
          const mirror = lerp(to, from, p)
          return <g key={i} opacity={.32 + i * .13}>
            <GlyphShape glyph={glyph} tint={tint} x={at.x} y={at.y} angle={angleTo(from, to)} size={scale * (.55 + i * .1)} />
            {swap && <GlyphShape glyph={glyph} tint="#9fdbff" x={mirror.x} y={mirror.y - 14} size={scale * .7} />}
          </g>
        })}
        {motion !== "blink" && <Stroke points={[from, arc(progress, bend)]} tint={tint} width={6} />}
      </g>
    }
  }
}

function MarkEffect({ fx, to, progress: p, tint }: { fx: SkillVisual; to: EdgePoint; progress: number; tint: string }) {
  const { mark: { motion, glyph }, phase, area, from } = fx
  const before = phase === "start"
  const passive = phase === "passive"
  const onTarget = ["lock", "stamp", "pin", "grid"].includes(motion)
  const at = before && !onTarget ? from : to
  const angle = angleTo(from, to)
  const radius = area?.parts.find((part) => part.kind === "circle")?.radius ??
    (area?.star ? edgeDistance(area.center, area.star[0]) : 63)
  const size = passive ? .59 : before ? .91 : clamp(radius / 86, 1, 1.62)
  const fade = 1 - p ** 1.56
  const out = 1 - (1 - p) ** 3
  const icon = (s = 1, spin = 0) => <GlyphShape glyph={glyph} tint={tint} size={s} angle={spin} />
  const band = (r: number, width = 3, dash?: string) =>
    <circle r={r} fill="none" stroke={tint} strokeWidth={width} strokeDasharray={dash} />

  let content
  switch (motion) {
    case "draw": case "bend":
      content = <g transform={`rotate(${angle})`}>
        <path d={`M${-29 - 28 * (1 - p)} -46Q28 0 ${-29 - 28 * (1 - p)} 46`} stroke={tint} strokeWidth="6" fill="none" />
        <path d="M-34-36 10 0-34 36" stroke="#fff1fa" fill="none" strokeWidth="2.7" />
        {icon(.77 + out * .35, motion === "bend" ? -26 * (1 - p) : 0)}
      </g>
      break
    case "lock": case "pin": {
      const r = motion === "lock" ? 33 + (1 - p) * 29 : 26 + out * 15
      content = <g fill="none" stroke={tint} strokeWidth="4">
        {[0, 90, 180, 270].map((a) => <path key={a} transform={`rotate(${a})`} d={`M${-r} ${-r + 17}V${-r}h17`} />)}
        {motion === "pin" && <path d="M0-62V-22m-8-9 8 9 8-9" strokeWidth="3" />}
        {icon(.68 + out * .23)}
      </g>
      break
    }
    case "slash": case "shove": case "fan": {
      const sweep = motion === "slash" ? [-21, 8] : motion === "shove" ? [-10, 14] : [-31, 0, 31]
      content = <g transform={`rotate(${angle + (motion === "slash" ? -32 + out * 52 : 0)})`}>
        {sweep.map((a, i) => <g key={a} transform={`translate(${motion === "shove" ? out * 40 + 21 * i : 0} 0) rotate(${a})`}>
          <path d={motion === "shove" ? "M-54-23 2-23 28 0 2 23-54 23-19 0Z" : "M-57-38Q11-51 57 0 22 37-53 39 7 16 15 0-8-22-57-38Z"}
            stroke={tint} strokeWidth="3" fill={tint} fillOpacity={i ? ".20" : ".54"} />
          <path d="M-38-23Q21-23 41 0 14 28-38 27" stroke="#fff2fa" fill="none" strokeWidth="3.7" />
        </g>)}
        {icon(.80, 8)}
      </g>
      break
    }
    case "shatter": case "crack": {
      const count = motion === "shatter" ? 10 : 6
      content = <g>
        <path d="M-64 11-22-3-13 14 7-13 19-6 51-35M-13 14-4 40M7-13l-2-25" stroke={tint} strokeWidth="4" fill="none" transform={`rotate(${angle + out * 17})`} />
        {Array.from({ length: count }, (_, i) => {
          const heading = i * 360 / count + angle + (i % 3) * 9
          const pos = polar(16 + out * (49 + i % 4 * 13), heading)
          return <path className="edge-fx-detail" key={i} transform={`${translate(pos)} rotate(${heading + 38 * p})`}
            d={i % 3 ? "M-12-5 17 0-4 8Z" : "M-9-11 13-4 4 11-5 6Z"}
            fill={prism[i % prism.length]} fillOpacity=".54" stroke="#fff6fb" strokeWidth="1.9" />
        })}
        {icon(1.21 - p * .49, 26 * p)}
      </g>
      break
    }
    case "grid": case "gate": case "wall": {
      const gate = motion === "gate"
      const wall = motion === "wall"
      const tiles = gate ? [-1, 1] : [-2, -1, 0, 1, 2]
      content = <g transform={`rotate(${gate ? angle : 0})`}>
        {tiles.map((i) => <g key={i} transform={`translate(${i * (gate ? 55 - out * 22 : 31)} ${(1 - out) * (wall ? 51 : 19)})`}>
          <path d={wall ? "M-14 19v-47l7-9h14l7 9v47Z" : "M-13-25 12-19 14 23-12 29Z"}
            stroke={tint} strokeWidth="3.5" fill={tint} fillOpacity={wall ? ".29" : ".17"} />
          <path d="M-8-12H8M-8 1H8M-8 14H8" stroke="#fff5fb" strokeWidth="2.2" opacity=".64" />
        </g>)}
        {icon(.71)}
      </g>
      break
    }
    case "shield": case "veil":
      content = <g>
        <path d="M0-48 42-27 36 17 0 47-36 17-42-27Z" stroke={tint} fill={tint} fillOpacity={motion === "veil" ? ".11" : ".28"}
          strokeWidth={motion === "veil" ? 2.7 : 5} strokeDasharray={motion === "veil" ? "10 5" : undefined} />
        <path d="M0-48V47M-42-27 36 17M42-27-36 17" stroke={tint} strokeWidth="1.9" opacity=".48" />
        {icon(.87)}
      </g>
      break
    case "bloom": case "rise": case "drop": case "wash": {
      const count = motion === "bloom" ? 6 : 4
      content = <g>
        {Array.from({ length: count }, (_, i) => {
          const pos = motion === "bloom" ? polar(13 + out * 51, i * 60 - 90 + p * 26)
            : { x: (i - 1.5) * 24, y: motion === "drop" ? -65 + out * 77 - i * 8 : 28 - out * 83 + i * 7 }
          return <g key={i} opacity={i % 2 ? .72 : .93}>
            <GlyphShape glyph={glyph} tint={tint} x={pos.x} y={pos.y} size={.35 + (1 - p) * .26} angle={motion === "bloom" ? 30 * i : 0} />
          </g>
        })}
        {motion === "wash" ? <path d="M-52 10Q-22-32 18-7T58-5" stroke={tint} strokeWidth="9" fill="none" strokeLinecap="round" />
          : band(21 + out * 32, 2.8, motion === "rise" ? "5 9" : undefined)}
        {icon(.78)}
      </g>
      break
    }
    case "fold": case "flip": case "split": {
      const sign = motion === "fold" ? 1 - out : motion === "split" ? out : Math.abs(Math.cos(p * Math.PI))
      content = <g transform={`rotate(${angle})`}>
        {[-1, 1].map((i) => <g key={i} transform={`translate(${i * (18 + 52 * sign)} 0) scale(${i} 1)`}>
          <path d="M-23-35 21-20 21 20-23 35Z" stroke={tint} strokeWidth="3.7" fill={tint} fillOpacity=".21" />
          {icon(.79, i * out * 18)}
        </g>)}
      </g>
      break
    }
    case "tick": case "orbit": case "coil": case "weave": {
      const inward = motion === "coil"
      const r = inward ? 65 - out * 39 : 29 + out * 22
      const count = motion === "tick" ? 8 : motion === "weave" ? 5 : 4
      content = <g>
        <ellipse rx={r + 9} ry={r * .68} transform={`rotate(${p * 99})`} stroke={tint} strokeWidth="3" fill="none" strokeDasharray={motion === "tick" ? "4 7" : "20 11"} />
        {Array.from({ length: count }, (_, i) => {
          const { x, y } = polar(r, i * 360 / count + (motion === "tick" ? -90 : 145 * p))
          return <g key={i} opacity={motion === "tick" && i > p * count ? .30 : .92}><GlyphShape glyph={glyph}
            tint={tint} x={x} y={y * .76} size={motion === "tick" ? .34 : .55} angle={i * 25} /></g>
        })}
        {icon(.76, p * (inward ? -40 : 12))}
      </g>
      break
    }
    case "tether": case "trail": case "step": {
      const step = motion === "step"
      const far = Math.min(98, edgeDistance(from, to))
      content = <g transform={`rotate(${angle})`}>
        <path d={`M${-far} 0Q-31 ${step ? -31 : 19} 0 0`} stroke={tint} strokeWidth={step ? 2.8 : 5} fill="none" strokeDasharray={step ? "6 8" : "18 7"} />
        {[1, 2, 3].map((i) => <GlyphShape key={i} glyph={glyph} tint={tint} size={.78 - i * .09}
          x={-i * (13 + out * 9)} y={step ? (i % 2 ? -9 : 9) : 0} />)}
        {icon(.91)}
      </g>
      break
    }
    case "cross":
      content = <g transform={`rotate(${angle + 27 + p * 24})`}>
        <path d="M-64 0H64M0-57V57" stroke={tint} strokeWidth={12 - p * 8} strokeLinecap="round" />
        <path d="M-55 0H55M0-49V49" stroke="#fff4f9" strokeWidth="3.5" />
        {icon(.89, -27)}
      </g>
      break
    case "ripple": case "pulse": case "echo": case "snap": case "stamp": case "flash": {
      const count = motion === "echo" ? 3 : motion === "ripple" || motion === "pulse" ? 2 : 1
      content = <g>
        {Array.from({ length: count }, (_, i) => {
          const t = bound(p * (motion === "pulse" ? 2.4 : 1.55) - i * .31)
          const r = motion === "snap" ? 50 - t * 33 : 14 + t * (motion === "ripple" ? 69 : 49)
          return <g key={i} opacity={t === 0 && i ? 0 : 1 - t * .77}>
            {motion === "stamp" ? <path d={`M${-r} ${-r * .55}H${r}V${r * .55}H${-r}Z`} stroke={tint} strokeWidth="4" fill="none" />
              : band(r, i === 0 ? 4.5 : 2.8, motion === "echo" ? "11 6" : undefined)}
          </g>
        })}
        {motion === "flash" && <path d="M-55 0H55M0-32V32" stroke="#fff5fa" strokeWidth="3" transform={`rotate(${angle + 30})`} />}
        {icon(.77 + (1 - p) * .36, motion === "echo" ? p * 21 : 0)}
      </g>
      break
    }
  }
  return <g transform={`${translate(at)} scale(${size})`} opacity={fade}
    className={passive ? "edge-vfx-passive" : "edge-vfx-mark"}>{content}</g>
}

export function FieldSignature({ field, mark, battle }: { field: FieldEffect; mark: Mark; battle: EdgeBattle }) {
  const { area, mode } = field
  const age = battle.time - field.time
  const tint = field.gold ? "#ffd68f" : "#d4b4f2"
  const polygon = area.parts.find((part) => part.kind === "polygon")
  if (mode === "track" && polygon?.points.length === 4) {
    const [a, b, c, d] = polygon.points
    const head = lerp(a, d, .5)
    const tail = lerp(b, c, .5)
    const rider = battleFighters(battle).find((unit) => unit.force?.cause?.id === field.cast.id)
    const width = Math.max(6, edgeDistance(a, d) * .21)
    return <g opacity=".72">
      <Stroke points={[head, tail]} tint={tint} width={width} />
      {[head, tail].map((pos, i) => <g key={i} transform={translate(pos)} fill="none" stroke={prism[i + 1]}>
        <circle r={32} strokeWidth="3.2" fill="#2d2147" fillOpacity=".55" />
        <circle r={32 + (1 - (age + i * .3) % 1) * 24} strokeWidth="2.4" opacity=".65" />
        <GlyphShape glyph={mark.glyph} tint={tint} size={.64} />
      </g>)}
      {rider && <circle cx={rider.x} cy={rider.y} r={40} fill="#ffedf8" fillOpacity=".18" stroke="#fff5fc" strokeWidth="4" />}
    </g>
  }

  const circle = area.parts.find((part) => part.kind === "circle")
  const plates = ["wall", "grid", "gate", "shield"].includes(mark.motion)
  const beat = ["tick", "echo", "ripple", "pulse"].includes(mark.motion)
  const count = plates ? 12 : 8
  const capacity = battle.preview && mode === "guard" && field.capacity > 0 ? Math.round(field.capacity) : null
  return <g transform={translate(area.center)} opacity=".76">
    {circle && (plates || beat) && Array.from({ length: count }, (_, i) => {
      const angle = i * 360 / count
      const position = polar(circle.radius * (plates ? .96 : .90), angle)
      return <g key={i} transform={`${translate(position)} rotate(${angle + 90})`}
        opacity={.37 + .43 * (.5 + .5 * Math.cos(age * (beat ? 6.8 : 2.5) - i * .81))}>
        {plates ? <path d="M-16 5-12-9 12-9 16 5 10 11H-10Z M-7 0H7" stroke={tint} strokeWidth="2.2" fill="#513c65" />
          : <path d="M0-9 6 0 0 9-6 0Z" fill={prism[i % prism.length]} stroke={tint} strokeWidth="1.6" />}
      </g>
    })}
    <circle r="26" fill="#231832" fillOpacity=".73" stroke={tint} strokeWidth="2.5" strokeDasharray={plates ? "13 4" : "5 9"}
      transform={`rotate(${age * 34})`} />
    <GlyphShape glyph={mark.glyph} tint={tint} size={.64} />
    {capacity !== null && <g data-preview-capacity={capacity} transform="translate(0 39)">
      <rect x="-53" y="-13" width="106" height="23" rx="5" fill="#2a1d35" stroke="#a7e7ff" strokeOpacity=".72" />
      <text textAnchor="middle" y="3" fill="#c8efff" fontSize="16" fontWeight="700">城防 {capacity}</text>
    </g>}
  </g>
}

export function EdgeSkillEffects({ battle }: { battle: EdgeBattle }) {
  return <g className="edge-skill-vfx" aria-hidden="true">
    {battle.runtime.effects.map((fx) => {
      if (battle.time < fx.start || battle.time >= fx.end || fx.summon || fx.passive || fx.bulwark || fx.warden || fx.berserker || fx.paladin || fx.spellbreaker || fx.assassin || fx.warlock || fx.lifebringer || fx.binder || fx.dancer || fx.healer || fx.bard || rangerChoreography(fx.skill)) return null
      const to = unitOf(battle, fx.target) ?? fx.to
      const progress = bound((battle.time - fx.start) / (fx.end - fx.start))
      const tint = tintOf(fx)
      return <g key={fx.id} data-skill-vfx={fx.skill} data-vfx-phase={fx.phase} data-vfx-motion={fx.mark.motion} style={{ color: tint }}>
        {fx.phase === "travel" ? <TravelEffect fx={fx} to={to} progress={progress} tint={tint} />
          : <MarkEffect fx={fx} to={to} progress={progress} tint={tint} />}
      </g>
    })}
  </g>
}
