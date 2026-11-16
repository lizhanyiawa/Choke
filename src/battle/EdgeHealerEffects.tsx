import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, armorPaint, at, circlesOf, ease, heading, mix, path, polar, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { FIELD, along, areaPath, direction, edgeDistance, left, outward, type EdgeArea } from "./edgeSkills/geometry"
import { healerChoreography, type HealerMotif } from "./edgeSkills/healerChoreo"
import type { HealerBeat, SkillVisual } from "./edgeSkills/presentation"
import { healerActiveReadiness } from "./edgeSkills/runtime"
import { unitOf, type FieldEffect } from "./edgeSkills/state"

type Layer = "floor" | "front"
type Art = NonNullable<ReturnType<typeof healerChoreography>>
type Scene = { fx: SkillVisual; beat: HealerBeat; art: Art; paint: ArmorPaint; t: number; to: EdgePoint; health?: number }
const sequence = (n: number) => Array.from({ length: n }, (_, i) => i)
const pose = (p: EdgePoint, angle = 0, scale = 1) => at(p) + ` rotate(${angle}) scale(${scale})`
const offset = (p: EdgePoint, x: number, y: number) => ({ x: p.x + x, y: p.y + y })
const heartbeat = "M-37 3H-22l7-14 8 27L4-24l9 32 7-10h17"
const corners = [
  { x: FIELD.left, y: FIELD.top }, { x: FIELD.right, y: FIELD.top },
  { x: FIELD.right, y: FIELD.bottom }, { x: FIELD.left, y: FIELD.bottom },
]

function Glyph({ where, art, paint, size = 1, angle = 0, bright = 1 }: {
  where: EdgePoint; art: Art; paint: ArmorPaint; size?: number; angle?: number; bright?: number
}) {
  return <g transform={pose(where, angle, size)} strokeLinejoin="round" strokeLinecap="round" opacity={bright}>
    <path d={art.path} fill="none" stroke={paint.metal} strokeWidth="8.5" strokeOpacity=".24" />
    <path d={art.path} fill={paint.ink} fillOpacity=".60" stroke={paint.light} strokeWidth="2.4" />
  </g>
}

function Ribbon({ from, to, paint, q = 1, bend = 0, width = 3, dashed = false, color }: {
  from: EdgePoint; to: EdgePoint; paint: ArmorPaint; q?: number; bend?: number; width?: number; dashed?: boolean; color?: string
}) {
  if (edgeDistance(from, to) < 4) return null
  const control = along(mix(from, to, .5), left(direction(from, to)), bend)
  const first = mix(from, control, q)
  const head = mix(first, mix(control, to, q), q)
  const d = `M${from.x} ${from.y}Q${first.x} ${first.y} ${head.x} ${head.y}`
  return <g fill="none" strokeLinecap="round">
    <path d={d} stroke={color ?? paint.metal} strokeWidth={width * 3} strokeOpacity={dashed ? ".08" : ".19"} />
    <path d={d} stroke={color ?? paint.metal} strokeWidth={width} strokeDasharray={dashed ? "7 7" : undefined} />
    {!dashed && <path d={d} stroke={paint.light} strokeWidth={width * .38} strokeOpacity=".85" />}
  </g>
}

function Vitals({ at: here, paint, before, amount, q, scale = 1 }: {
  at: EdgePoint; paint: ArmorPaint; before: number; amount?: number; q: number; scale?: number
}) {
  const w = 62, gate = -w / 2 + w * .45
  const start = -w / 2 + w * unit(before)
  const tail = Math.min(w / 2, start + w * (amount ?? 0) * q)
  return <g transform={pose(offset(here, 9, 52), 0, scale)}>
    <rect x={-w / 2 - 3} y="-6" width={w + 6} height="12" rx="3" fill={paint.ink} stroke={paint.metal} strokeWidth="1.4" />
    <path d={`M${-w / 2} 0H${start}`} stroke={paint.accent} strokeOpacity=".68" strokeWidth="3.1" />
    <path d={`M${start} 0H${tail}`} stroke={paint.light} strokeWidth="3.6" />
    <path d={`M${gate} -8V8`} stroke={paint.light} strokeWidth="1.5" />
  </g>
}

function ShieldPanels({ where, paint, angle, q, broken = false, size = 1 }: {
  where: EdgePoint; paint: ArmorPaint; angle: number; q: number; broken?: boolean; size?: number
}) {
  return <g transform={pose(where, angle, size)} strokeLinejoin="round">
    {[-1, 1].map(side => <g key={side} transform={`scale(1 ${side}) translate(0 ${broken ? q * 22 : 13 * (1 - q)}) rotate(${broken ? q * 23 : -18 * (1 - q)})`}>
      <path d="M-49 0-33 31-6 43 13 25 42 33 50 0 27 19 4 11-22 25Z" fill={paint.accent}
        fillOpacity={broken ? .11 : .21} stroke={paint.metal} strokeWidth="3" />
      <path d="M-46 3-31 27-8 37 11 20 38 29" fill="none" stroke={paint.light} strokeWidth="2.2" />
    </g>)}
  </g>
}

function Stitch({ where, paint, angle, q, torn = false }: {
  where: EdgePoint; paint: ArmorPaint; angle: number; q: number; torn?: boolean
}) {
  return <g transform={pose(where, angle + 17)} fill="none" strokeLinecap="round">
    <path d="M-48-10Q0 7 47-9M-48 11Q0 28 47 10" stroke={paint.metal} strokeWidth="3.8" strokeOpacity=".68" />
    {[-30, -13, 4, 21, 37].map((x, i) => <path key={x}
      d={torn ? "M-4-8 0 0 6-4m-4 7 2 4 5-2" : "M-5-11 5 9M-5 8 5-10"}
      transform={`translate(${x} ${torn ? Math.sin(i * 2.4) * q * 14 : 1 + q * 4})`}
      stroke={paint.light} strokeWidth="2.5" />)}
  </g>
}

function Angles({ where, paint, r, q }: { where: EdgePoint; paint: ArmorPaint; r: number; q: number }) {
  return <g transform={at(where)} fill="none" strokeLinejoin="round">
    {sequence(4).map(i => <path key={i} d={`M${r - 21} -22H${r}V22H${r - 21}`}
      transform={`rotate(${i * 90 + q * 21})`} stroke={i % 2 ? paint.metal : paint.light} strokeWidth="3.7" />)}
  </g>
}

function AreaMotion({ area, motif, paint, t, waiting = false, lit = 0 }: {
  area?: EdgeArea; motif: HealerMotif; paint: ArmorPaint; t: number; waiting?: boolean; lit?: number
}) {
  if (!area) return null
  const q = ease(t)
  if (motif === "sutureLane") {
    const shape = area.parts[0]
    if (shape?.kind !== "polygon" || shape.points.length !== 4) return null
    const [a, b, c, d] = shape.points
    const from = mix(a, d, .5), to = mix(b, c, .5)
    const travel = Math.max(.17, waiting ? q : 1)
    const seams = sequence(10).map(i => mix(i % 2 ? a : d, i % 2 ? b : c, i / 9 * travel))
    return <g fill="none" strokeLinejoin="round">
      <path d={areaPath(area)} fill={paint.metal} fillOpacity=".065" stroke={paint.accent} strokeOpacity=".8" strokeWidth="2.4" />
      <path d={path(seams)} stroke={paint.light} strokeWidth="3.4" />
      <Ribbon from={from} to={to} paint={paint} q={travel} dashed width={2.7} />
    </g>
  }
  return <g fill="none">
    <path d={areaPath(area)} stroke={paint.accent} strokeWidth="2.6" strokeOpacity=".85" strokeDasharray={waiting ? "10 8" : undefined}
      fill={paint.metal} fillOpacity={waiting ? .045 : .077} />
    {circlesOf(area).map(({ center, radius }, j) => <g key={j} transform={at(center)}>
      {motif === "samePoint" && sequence(3).map(i => {
        const r = radius * (waiting ? 1 - .62 * q : .44 + .51 * q)
        return <path key={i} d={path([polar(r, -115), polar(r * .71, -90), polar(r, -65)])}
          transform={`rotate(${i * 120 + 12 * q})`} stroke={paint.light} strokeWidth="5" />
      })}
      {motif === "areaTriage" && sequence(4).map(i =>
        <path key={i} d={path([polar(radius * .62, -28), polar(radius * .92, -29), polar(radius * .92, 27), polar(radius * .58, 30)]) + "Z"}
          transform={`rotate(${i * 90 + 28 + q * 17})`} fill={paint.metal} fillOpacity={.15 + .12 * q}
          stroke={i % 2 ? paint.accent : paint.light} strokeWidth="3.1" />)}
      {motif === "priority" && <path d={arc(radius * .78, 16, 163) + arc(radius * .78, 211, 318) + "M-20 8 0-15 20 8M-29 20h58"}
        stroke={paint.light} strokeWidth="3.2" strokeLinejoin="round" />}
      {motif === "triage" && <path d={arc(radius * .90, 43, 112) + arc(radius * .90, 193, 242) + arc(radius * .90, 306, 339)}
        stroke={paint.light} strokeWidth="3.2" strokeOpacity=".57" />}
      {motif === "compress" && [-1, 1].map(side => <path key={side}
        d={arc(radius * (.88 - .34 * q), 28, 152) + arc(radius * (.93 - .27 * q), 49, 131)}
        transform={`scale(1 ${side}) rotate(${11 + 18 * q})`} stroke={side > 0 ? paint.light : paint.metal} strokeWidth="4.8" />)}
      {motif === "aidStation" && <>
        {sequence(6).map(i => <path key={i} d={arc(radius * .91, i * 60 + 7, i * 60 + 37)} stroke={i < lit ? paint.light : paint.metal} strokeWidth={i < lit ? 6.2 : 2.9} />)}
        {[-26, 0, 26].map((x, i) => <path key={x} d={`M${x - 7} 14V-21h14v35Z`}
          fill={i < lit ? paint.light : paint.ink} fillOpacity={i < lit ? .66 : .49} stroke={paint.metal} strokeWidth="2.4" />)}
        <path d="M-48 23H48M-40 30h80" stroke={paint.light} strokeWidth="3.0" />
      </>}
      {motif === "urgentCorners" && <Angles where={{ x: 0, y: 0 }} paint={paint} r={radius * .87} q={q} />}
      {motif === "net" && sequence(6).map(i => <path key={i}
        d={path([polar(radius * (.77 + q * .16), i * 60), polar(radius * .28, i * 60 + 30), polar(radius * (.77 + q * .16), i * 60 + 60)])}
        stroke={spectrum[i % spectrum.length]} strokeWidth={waiting ? 2.1 : 3.2} strokeOpacity=".79" />)}
      {motif === "sanctuary" && sequence(6).map(i => <g key={i} transform={`rotate(${i * 60 + 10 - 32 * q})`}>
        <path d={arc(radius * (waiting ? .93 - .29 * q : .51 + .39 * q), -24, 16)} stroke={spectrum[i % spectrum.length]}
          strokeWidth={waiting ? 5 : 7.5} />
        <path d={path([polar(radius * .36, -5), polar(radius * .62, -12), polar(radius * .72, 4)])} stroke={paint.light} strokeWidth="2.6" />
      </g>)}
    </g>)}
  </g>
}

function Rally({ paint, t, receivers }: { paint: ArmorPaint; t: number; receivers?: readonly EdgePoint[] }) {
  const q = ease(t)
  return <g fill="none" strokeLinecap="round">
    {corners.map((corner, i) => {
      const other = corners[(i + 1) % 4], previous = corners[(i + 3) % 4]
      const size = (receivers ? 85 : 48) + q * (receivers ? 84 : 58)
      const b = along(corner, direction(corner, other), size), a = along(corner, direction(corner, previous), size)
      return <g key={i}>
        <path d={path([a, corner, b])} stroke={spectrum[i]} strokeWidth={receivers ? "17" : "10"} strokeOpacity={receivers ? ".55" : ".38"} />
        <path d={path([a, corner, b])} stroke={paint.light} strokeWidth={receivers ? "4.6" : "2.8"} />
        <circle cx={corner.x} cy={corner.y} r={7 + 12 * t} stroke={spectrum[i]} strokeWidth="4.1" />
      </g>
    })}
    {receivers?.map((where, i) => {
      const origin = corners.reduce((closest, corner) => edgeDistance(corner, where) < edgeDistance(closest, where) ? corner : closest)
      return <g key={i}>
        <Ribbon from={origin} to={where} paint={paint} q={unit(q * 1.37)} bend={i % 2 ? -57 : 52} width={5.7} color={spectrum[corners.indexOf(origin)]} />
        <Angles where={where} paint={paint} r={52 + q * 17} q={q} />
      </g>
    })}
  </g>
}

function Prepare({ scene, layer }: { scene: Scene; layer: Layer }) {
  const { fx, beat, to, art, paint, t } = scene
  const q = ease(t)
  if (layer === "floor") {
    if (art.motif === "rally") return <Rally paint={paint} t={q} />
    if (fx.area) return <AreaMotion area={fx.area} motif={art.motif} paint={paint} t={t} waiting />
    if (art.motif === "reverseTriage") return <>{fx.contacts?.map((where, i) =>
      <Angles key={i} where={where} paint={paint} r={54 + 12 * (1 - q)} q={q} />)}</>
    if (art.motif === "farBeam") return <path d={arc(47 + 17 * (1 - q), -143, 139)} transform={at(to)}
      fill="none" stroke={paint.metal} strokeWidth="3.5" strokeDasharray="8 6" />
    return <Ribbon from={fx.from} to={to} paint={paint} q={.35 + .65 * q} bend={art.motif === "partition" ? 35 : 0} width={2} dashed />
  }
  if (art.motif === "assessment" || art.motif === "cardiacNeedle")
    return <Vitals at={to} paint={paint} before={scene.health ?? beat.before ?? 1} q={q} />
  const where = fx.area || art.motif === "rally" || art.motif === "reverseTriage" ? fx.from : to
  return <Glyph where={offset(where, 20, 32)} art={art} paint={paint} size={.53 + q * .30} angle={-17 + q * 17} />
}

function Flight({ scene, layer }: { scene: Scene; layer: Layer }) {
  const { fx, beat, art, paint, to, t } = scene
  const { motif } = art, relay = beat.kind === "relay"
  const bend = motif === "unwind" ? -45 : motif === "twoWay" ? relay ? -35 : 20
    : motif === "doubleNeedle" && relay ? -58 : motif === "dualRoute" && relay ? 42 : relay ? -26
      : motif === "partition" ? 34 : motif === "net" ? -28 : motif === "crossFold" ? 5 : -12
  const q = motif === "reverseTriage" ? t ** 1.6 : .09 + .91 * t
  const axis = direction(fx.from, to), side = left(axis)
  const control = along(mix(fx.from, to, .5), side, bend)
  const head = mix(mix(fx.from, control, q), mix(control, to, q), q)
  const angle = heading(direction(mix(fx.from, control, q), head))
  if (layer === "floor") return <>
    <Ribbon from={fx.from} to={to} paint={paint} q={q} bend={bend}
      width={motif === "partition" || motif === "net" ? 6.5 : relay ? 4 : motif === "unwind" ? 5.4 : 3.2} />
    {(motif === "partition" || motif === "net") && <Ribbon from={fx.from} to={to} paint={paint} q={q} bend={-bend * .52}
      width={2.7} dashed color={spectrum[motif === "net" ? 3 : 1]} />}
    {motif === "crossFold" && [-1, 1].map(sign => <Ribbon key={sign} from={along(fx.from, side, sign * 9)} to={to}
      paint={paint} q={q} bend={sign * 11} width={1.9} />)}
  </>
  if (motif === "reverseTriage") return <g transform={pose(head, 0, .79 + q * .25)} strokeLinejoin="round">
    {[-1, 0, 1].map((i, index) => <path key={i}
      d="M-11-42 5-34 14 4 0 24-14 6Z" transform={`translate(${i * (16 + q * 13)} 0) rotate(${i * (12 + 14 * q)})`}
      fill={spectrum[index + 1]} fillOpacity=".21" stroke={spectrum[index + 1]} strokeWidth="4.1" />)}
    <path d="M-14-6H14M0-21V14" stroke={paint.light} strokeWidth="4.6" />
  </g>
  if (motif === "cardiacNeedle") {
    const missing = 1 - (scene.health ?? 1)
    const dose = Math.min(missing, .08 + missing * .20, .26) / .26
    return <g transform={pose(head, angle)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M-28-9H10l8 9-8 9h-38Zm46 9h14m-60-12v24" fill={paint.ink} fillOpacity=".77" stroke={paint.light} strokeWidth="2.4" />
      <path d={`M-25 0H${-25 + 38 * unit(dose)}`} stroke={paint.accent} strokeWidth="6.5" />
      <path d="M-16-6v5m10-5v5m10-5v5" stroke={paint.light} strokeWidth="1.6" />
      <path d="M-33-3h-13m13 6h-19" stroke={paint.metal} strokeWidth="2.5" opacity={.25 + .75 * dose} />
    </g>
  }
  return <Glyph where={head} art={art} paint={paint} size={relay || motif === "partition" ? .78 : .55} angle={angle} />
}

function Cleanse({ scene }: { scene: Scene }) {
  const { beat, art, to, paint, t } = scene, q = ease(t)
  return <g transform={at(to)} fill="none" strokeLinecap="round" strokeLinejoin="round">
    {(beat.statuses ?? []).map((status, i) => {
      const side = i % 2 ? -1 : 1, x = side * (34 + 36 * q)
      const color = status === "dot" ? "#ffb596" : status === "short" ? "#9decff" : paint.accent
      return <g key={i} transform={`translate(${x} ${-24 - 16 * q}) rotate(${side * (18 + 67 * q)})`}>
        <path d={status === "dot" ? "M-16 4-7-13-3-5 7-14 15 1 5 13-8 14Z"
          : status === "short" ? "M-17-7-7-16 3-8m-17 19 7 5 13-8M8-13l9 4v18L7 14"
            : "M-17-9 5-14 16-3 6 12-17 5-5-5 9 3"} stroke={color} strokeWidth="3.1" strokeDasharray={t > .33 ? "7 5" : undefined} />
        <path d={`M${-9 - q * 9} -11 6 7M-4 13 12 -6`} stroke={paint.light} strokeWidth="2.3" />
      </g>
    })}
    <Glyph where={{ x: -21, y: 39 }} art={art} paint={paint} size={.70 + q * .20} angle={-20 + q * 19} />
  </g>
}

function Result({ scene, layer }: { scene: Scene; layer: Layer }) {
  const { fx, beat, to, art, paint, t } = scene, q = ease(t)
  const { motif } = art, cue = beat.cue
  const angle = heading(direction(fx.from, to))
  if (cue === "field" && motif === "rally") return layer === "floor" ? <Rally paint={paint} t={t} receivers={fx.contacts} /> : null
  if (cue === "field" || cue === "release" && beat.kind === "enter") return layer === "floor"
    ? <AreaMotion area={fx.area} motif={motif} paint={paint} t={t} lit={beat.amount} />
    : <Glyph where={fx.to} art={art} paint={paint} size={.69 + .45 * q} angle={-16 + q * 27} />
  if (cue === "split" && beat.other) {
    const amount = beat.remaining ?? .3
    const other = beat.other
    const axis = direction(fx.from, to), end = along(to, axis, 57 + 25 * (1 - amount))
    if (layer === "floor") return <>
      <Ribbon from={fx.from} to={to} paint={paint} q={Math.min(1, q * 1.9)} width={6.8} />
      <Ribbon from={to} to={other} paint={paint} q={unit(q * 1.7 - .32)} bend={32} width={4 + amount * 10} color={spectrum[3]} />
      <Ribbon from={to} to={end} paint={paint} q={unit(q * 1.8 - .33)} width={4 + (1 - amount) * 9} color={spectrum[1]} />
    </>
    return <>
      <ShieldPanels where={to} paint={paint} angle={angle + 90} q={q} size={1.04} />
      <Glyph where={offset(other, 17, 35)} art={art} paint={paint} size={.68 + q * .30} angle={heading(direction(to, other))} />
    </>
  }
  if (cue === "save") {
    if (layer === "floor") return <Angles where={to} paint={paint} r={51 + 36 * q} q={q} />
    return <g transform={pose(offset(to, 0, 49))} fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d="M-50 3h38m24 0h38" stroke={paint.accent} strokeWidth="3.5" />
      <path d={heartbeat} transform={`scale(${1.04 + .29 * q} ${.09 + .91 * unit(t * 3.4)})`} stroke={paint.metal} strokeWidth="10" strokeOpacity=".38" />
      <path d={heartbeat} transform={`scale(${1.04 + .29 * q} ${.09 + .91 * unit(t * 3.4)})`} stroke={paint.light} strokeWidth="4.3" />
      <path d="M-51-12v24m102-24v24" stroke={paint.light} strokeWidth="3" />
    </g>
  }
  if (cue === "cleanse") return layer === "front" ? <Cleanse scene={scene} /> : null
  if (cue === "pool") return layer === "floor" ? <g transform={at(offset(to, 0, 55))}>
    <path d="M-56 10-42-10H42l14 20Z" fill={paint.ink} fillOpacity=".76" stroke={paint.metal} strokeWidth="2.6" />
    {sequence(10).map(i => <path key={i} d={`M${-42 + i * 9} -5v10`} stroke={i / 10 < (beat.remaining ?? 1) ? paint.light : paint.metal}
      strokeOpacity={i / 10 < (beat.remaining ?? 1) ? 1 : .21} strokeWidth="4.4" />)}
  </g> : null
  if (layer === "floor") {
    if (motif === "rally" && cue === "shield") {
      const axis = outward(to), b = left(axis)
      return <g fill="none" strokeLinejoin="round">
        {sequence(3).map(i => {
          const where = along(to, axis, -51 - i * 17)
          return <path key={i} d={path([along(along(where, axis, 8), b, -15), where, along(along(where, axis, 8), b, 15)])}
            stroke={spectrum[i + 1]} strokeWidth={4.9 - i * .7} opacity={unit(q * 1.6 - i * .2)} />
        })}
      </g>
    }
    if (["retreatKit", "quickStep", "unclip", "steadyStep", "net", "priority", "samePoint", "dualRoute", "doubleNeedle"].includes(motif) &&
      (cue === "heal" || cue === "shield" || cue === "release"))
      return <Ribbon from={fx.from} to={to} paint={paint} q={.42 + .58 * q} bend={motif === "net" ? -30 : motif === "quickStep" ? 13 : -14}
        width={beat.kind === "priority" || beat.kind === "net" ? 6.2 : 3} dashed={cue === "release"} />
    return null
  }
  const mark = offset(to, 18, 34)
  if (cue === "arm") return <Glyph where={offset(to, 44, 15)} art={art} paint={paint} size={.52 + .18 * q} angle={15 - 15 * q} />
  if (cue === "release" && (beat.kind === "absorb" || beat.kind === "break" || beat.kind === "guard" || beat.kind === "anti"))
    return <><ShieldPanels where={to} paint={paint} angle={angle + 90} q={q} broken={beat.kind === "break"} size={.72 + .26 * q} />
      <Glyph where={mark} art={art} paint={paint} size={.73} angle={angle * .31} /></>
  let motion
  switch (motif) {
    case "crossFold":
      motion = <g transform={pose(mark, -9, .61 + .29 * q)} stroke={paint.light} strokeWidth="3.1" fill="none">
        <path d={`M-37 ${-13 + q * 10}H-9L0 0 9 ${13 - q * 10}H37M-37 ${13 - q * 10}H-9L0 0 9 ${-13 + q * 10}H37`} />
      </g>
      break
    case "stitches": case "underPatch":
      motion = <Stitch where={mark} paint={paint} angle={angle} q={q} torn={cue === "release" || beat.kind === "hurt"} />
      break
    case "gauze": case "overflowWard": case "compress": case "sanctuary": case "urgentCorners":
      motion = cue === "shield" ? <ShieldPanels where={to} paint={paint} angle={angle + 90} q={q}
        size={motif === "sanctuary" ? 1.17 : motif === "overflowWard" ? .76 + .32 * unit((beat.remaining ?? 0) / .09) : .92} />
        : <path d={arc(41 + q * 12, 26, 143)} transform={at(to)} fill="none" stroke={paint.accent} strokeWidth="3.2" />
      break
    case "assessment": case "cardiacNeedle":
      motion = <Vitals at={to} paint={paint} before={beat.before ?? 0} amount={beat.remaining} q={q} />
      break
    case "steadyStep": case "unclip": case "retreatKit": case "quickStep":
      motion = cue === "shield" ? <ShieldPanels where={to} paint={paint} angle={angle + 90} q={q} size={.83} />
        : <path d="M-36-8-23 6-8-9M-13-8 0 6 15-9M11-8 24 6 39-9"
          transform={pose(mark, angle + 90, .79 + .32 * q)} fill="none" stroke={paint.light} strokeWidth="3.2" />
      break
    case "unwind":
      motion = <path d={arc(38 + q * 14, -162, -16) + arc(45 + q * 12, 35, 151)}
        transform={pose(to, 48 - q * 55)} fill="none" stroke={paint.accent} strokeWidth="3.3" />
      break
    case "refund": case "recoilDose":
      motion = <g transform={pose(to, angle + 9, .82 + .31 * q)}>
        <path d={arc(48, 143, 240) + arc(57, 151, 211) + "M-49-18-58 2-46 21"}
          fill="none" stroke={beat.kind === "refund" || beat.kind === "historic" ? paint.light : paint.accent} strokeWidth="4" />
        {beat.kind === "historic" && <path d={`M-46 0H${-46 + Math.min(80, 333 * (beat.remaining ?? 0) * q)}`}
          fill="none" stroke={paint.light} strokeWidth="3" />}
      </g>
      break
    case "painPatch": case "stopLoss":
      motion = <path d={motif === "stopLoss" ? "M-38-17H14l23 13v20H-38Zm0 11h38m-32 12h48" : "M-40-3-20-23 39-8 25 18-35 12Z"}
        transform={pose(mark, angle - 13, .76 + .38 * q)} fill={paint.metal} fillOpacity=".14" stroke={paint.accent} strokeWidth="3.3" />
      break
    case "neighborNeedle": case "twoWay": case "dualRoute": case "doubleNeedle":
      motion = <path d={beat.kind === "relay" ? "M-37 19-14-11 2 3 19-13 38-7M-6 13 20-4 29 2" : "M-39 3-15-13 0 0 18-8 37-2M-15-13v16"}
        transform={pose(mark, angle * .66, .73 + .34 * q)} fill="none" stroke={paint.light} strokeWidth={beat.kind === "relay" ? "3.6" : "2.7"} />
      break
    case "priority": case "samePoint":
      motion = <Angles where={to} paint={paint} r={(beat.kind === "priority" ? 56 : 41) + q * 9} q={q} />
      break
    case "areaTriage":
      motion = <path d="M-41 4h21l9-12 11 22L14-7l10 11h18" transform={pose(mark, -19, .7 + q * .4)}
        stroke={paint.light} strokeWidth="3.7" fill="none" />
      break
    case "sutureLane":
      motion = <Stitch where={mark} paint={paint} angle={angle} q={q} />
      break
    case "aidStation":
      motion = <Angles where={to} paint={paint} r={46 + q * 19} q={q} />
      break
    case "rescueWindow":
      motion = beat.kind !== "save" && <path d={heartbeat} transform={pose(mark, -9, .75 + .32 * q)}
        fill="none" stroke={paint.light} strokeWidth="3.8" />
      break
    case "farBeam":
      motion = <g transform={at(to)} strokeLinecap="round">
        <path d="M-38 10-19-115M38 10 19-115" stroke={paint.metal} strokeWidth="11" strokeOpacity=".34" />
        <path d="M-36 10-18-115M36 10 18-115M-14-40h28" stroke={paint.light} strokeWidth="3.3" />
        <ellipse rx={38 + q * 15} ry={16 + q * 8} fill="none" stroke={paint.accent} strokeWidth="3.3" />
      </g>
      break
    case "rally":
      motion = cue === "shield" ? <ShieldPanels where={to} paint={paint} angle={heading(outward(to)) + 90} q={q} size={1.14} />
        : <Angles where={to} paint={paint} r={42 + q * 20} q={q} />
      break
    case "reverseTriage":
      motion = beat.kind === "priority" ? <g transform={at(to)} fill="none">
        {sequence(3).map(i => <path key={i} d={arc(43 + i * 8 + q * 8, 14, 123) + arc(44 + i * 8 + q * 8, 175, 282)}
          transform={`rotate(${i * 23 - 27 * q})`} stroke={spectrum[i + 1]} strokeWidth="4.4" />)}
      </g> : <Angles where={to} paint={paint} r={43 + q * 10} q={q} />
      break
    case "partition":
      motion = <ShieldPanels where={to} paint={paint} angle={angle + 90} q={q} size={.95} />
      break
    case "net":
      motion = <path d="M-42 0-23-26 19-31 43-4 23 27-21 29ZM-23-26 23 27M19-31-21 29M-42 0 43-4"
        transform={pose(mark, -25 + q * 22, .74 + .34 * q)} stroke={paint.accent} strokeWidth="3.2" fill={paint.accent} fillOpacity=".11" />
      break
  }
  return <>{motion}{(motif !== "rescueWindow" || beat.kind !== "save") &&
    <Glyph where={mark} art={art} paint={paint} size={(fx.rarity === "C" ? .61 : .72) + q * .20} angle={angle * .23 - 16 * (1 - q)} />}</>
}

export function EdgeHealerField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  if (field.cast.skill?.id !== "healer/L/A5" || field.derived || field.until <= battle.time) return null
  return <g data-healer-field={field.cast.skill.id} aria-hidden="true" pointerEvents="none"
    opacity={(.58 + .16 * unit((battle.time - field.time) / .20)) * unit((field.until - battle.time) / .36)}>
    <AreaMotion area={field.area} motif="aidStation" paint={armorPaint.L} t={.65} lit={field.seen.size} />
  </g>
}

export function EdgeHealerEffects({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden="true" pointerEvents="none">
    {battle.runtime.effects.map(fx => {
      const beat = fx.healer, art = healerChoreography(fx.skill)
      if (!beat || !art || battle.time < fx.start || battle.time >= fx.end) return null
      const t = unit((battle.time - fx.start) / (fx.end - fx.start))
      const tracked = beat.cue === "prepare" || beat.cue === "flight" || beat.cue === "arm"
      const target = tracked && unitOf(battle, fx.target)
      if (target && !target.hp && beat.cue !== "arm") return null
      const to = target || fx.to
      const scene = { fx, beat, art, t, to, paint: armorPaint[fx.rarity], health: target ? target.hp / target.maxHp : undefined }
      const opacity = beat.cue === "prepare" || beat.cue === "flight" ? .92 : 1 - t ** 1.48
      return <g key={fx.id} opacity={opacity} data-healer-skill={fx.skill} data-healer-cue={beat.cue}>
        {beat.cue === "prepare" ? <Prepare scene={scene} layer={layer} /> : beat.cue === "flight"
          ? <Flight scene={scene} layer={layer} /> : <Result scene={scene} layer={layer} />}
      </g>
    })}
    {healerActiveReadiness(battle).map(({ skill, target, kind, until, amount, from, movingFaster }) => {
      const art = healerChoreography(skill)!
      const paint = armorPaint[skill.split("/")[1] as Rarity]
      const q = .5 + .5 * Math.sin(battle.time * 6.7 + target.x * .017)
      const angle = kind === "move" ? -15 : kind === "anti" ? 29 : 0
      const mark = offset(target, 43, (kind === "shield" ? 26 : 0) + q * 4)
      return <g key={skill + target.id + kind} data-healer-ready={skill} data-healer-status={kind}
        opacity={.66 * unit((until - battle.time) / .28)}>
        {layer === "floor" ? <>
          {from && <Ribbon from={from} to={target} paint={paint} bend={28} width={3.2} dashed />}
          {movingFaster && target.move && <path d="M-32-8-19 0-32 8M-47-9-34 0-47 9M-62-10-49 0-62 10"
            transform={pose(target, heading(direction(target, target.move)), .91 + q * .19)}
            fill="none" stroke={paint.light} strokeWidth="3.1" />}
          {kind === "shield" && <path d={arc(48, -72, -72 + (amount ?? 1) * 196)} transform={at(target)}
            fill="none" stroke={paint.accent} strokeWidth="3.4" strokeDasharray={art.motif === "gauze" ? "10 4" : undefined} />}
        </> : kind === "defy" ? <path d={heartbeat} transform={pose(offset(target, 3, 53), 0, .75 + .12 * q)}
          fill="none" stroke={paint.light} strokeWidth="3.4" /> : <Glyph where={mark} art={art} paint={paint} size={.43} angle={angle} />}
      </g>
    })}
  </g>
}
