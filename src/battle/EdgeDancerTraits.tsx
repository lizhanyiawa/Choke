import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, armorPaint, at, circlesOf, ease, heading, mix, path, polar, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { dancerTraitArt } from "./edgeSkills/dancerTraits"
import { along, areaPath, direction, edgeDistance, left, type EdgeArea } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { dancerTraitReadiness } from "./edgeSkills/runtime"
import { unitOf, type FieldEffect } from "./edgeSkills/state"

type Art = NonNullable<ReturnType<typeof dancerTraitArt>>
type Layer = "floor" | "front"
type Beat = NonNullable<SkillVisual["passive"]>
type Scene = { fx: SkillVisual; beat: Beat; art: Art; paint: ArmorPaint; t: number; to: EdgePoint }
const steps = (count: number) => Array.from({ length: count }, (_, i) => i)
const pose = (p: EdgePoint, angle = 0, scale = 1) => at(p) + ` rotate(${angle}) scale(${scale})`
const foot = (p: EdgePoint, dx = 0) => ({ x: p.x + dx, y: p.y + 34 })

function Badge({ where, art, paint, scale = 1, tilt = art.angle }: {
  where: EdgePoint; art: Art; paint: ArmorPaint; scale?: number; tilt?: number
}) {
  return <g transform={pose(where, tilt, scale)} strokeLinejoin="round">
    <path d={art.path} fill={paint.ink} fillOpacity=".68" stroke={paint.metal} strokeOpacity=".28" strokeWidth="8" />
    <path d={art.path} fill={paint.metal} fillOpacity=".19" stroke={paint.light} strokeWidth="2.4" />
  </g>
}

function Sash({ from, to, paint, bend = 0, q = 1, wide = 3, dotted = false, arrow = false }: {
  from: EdgePoint; to: EdgePoint; paint: ArmorPaint; bend?: number; q?: number; wide?: number; dotted?: boolean; arrow?: boolean
}) {
  if (edgeDistance(from, to) < 3) return null
  const control = along(mix(from, to, .49), left(direction(from, to)), bend)
  const leftHalf = mix(from, control, q)
  const head = mix(leftHalf, mix(control, to, q), q)
  const axis = direction(leftHalf, head)
  const d = `M${from.x} ${from.y}Q${leftHalf.x} ${leftHalf.y} ${head.x} ${head.y}`
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={paint.metal} strokeWidth={wide * 3.5} strokeOpacity={dotted ? ".10" : ".22"} />
    <path d={d} stroke={dotted ? paint.accent : paint.metal} strokeWidth={wide} strokeDasharray={dotted ? "7 9" : undefined} />
    {!dotted && <path d={d} stroke={paint.light} strokeWidth={wide * .45} />}
    {arrow && <path d="M-12-8 0 0-12 8" transform={pose(head, heading(axis), .66 + wide * .12)}
      stroke={paint.light} strokeWidth="2.3" />}
  </g>
}

function Footprints({ from, to, paint, q, measure = false }: {
  from: EdgePoint; to: EdgePoint; paint: ArmorPaint; q: number; measure?: boolean
}) {
  const distance = edgeDistance(from, to)
  if (distance < 7) return null
  const count = Math.max(2, Math.min(7, Math.ceil(distance / 27)))
  const axis = direction(from, to)
  return <g>
    {steps(count).map(i => {
      const portion = (i + 1) / count
      const here = mix(from, to, portion)
      const offset = i % 2 ? -9 : 9
      const visible = unit((q - portion + .27) * 4)
      return <g key={i} transform={pose(measure ? here : along(here, left(axis), offset), heading(axis))} opacity={visible * (.41 + portion * .59)}>
        {measure ? <path d={i === count - 1 ? "M0-17v34m-11-17h22" : "M0-10v20"} stroke={paint.light} strokeWidth={i === count - 1 ? 3.4 : 2.1} />
          : <path d="M-10 3-7-6 5-8 12-2 8 5-2 8Z" fill={paint.metal} fillOpacity=".32" stroke={paint.light} strokeWidth="1.8" />}
      </g>
    })}
  </g>
}

function Rim({ area, paint, fill = .07, opacity = 1 }: { area?: EdgeArea; paint: ArmorPaint; fill?: number; opacity?: number }) {
  return area && <path d={areaPath(area)} fill={paint.metal} fillOpacity={fill} stroke={paint.accent}
    strokeWidth="2.3" strokeDasharray="12 7" strokeLinejoin="round" opacity={opacity} />
}

function Hinge({ where, paint, angle, q, spread = 1 }: { where: EdgePoint; paint: ArmorPaint; angle: number; q: number; spread?: number }) {
  return <g transform={pose(where, angle, spread)} strokeLinejoin="round">
    {[-1, 1].map(side => <path key={side} transform={`scale(1 ${side}) translate(0 ${8 * q})`}
      d="M-22 12-4 23 16 13 32 28 14 38-18 29Z" fill={paint.metal} fillOpacity=".21" stroke={paint.light} strokeWidth="2.8" />)}
  </g>
}

function Pulse({ area, paint, q, pattern, travel = false }: {
  area?: EdgeArea; paint: ArmorPaint; q: number; pattern: "tap" | "twin" | "wedge" | "drum" | "canopy" | "reverse"; travel?: boolean
}) {
  return <g fill="none">
    <Rim area={area} paint={paint} fill={travel ? .025 : .095} opacity={travel ? .73 : .93} />
    {circlesOf(area).map(({ center, radius }, index) => {
      const r = radius * (travel ? 1 - .45 * q : .56 + .44 * q)
      const rotation = (index ? 35 : -40) + (pattern === "reverse" ? 36 - 68 * q : q * 19)
      const count = pattern === "tap" ? 3 : pattern === "drum" || pattern === "wedge" ? 4 : 5
      return <g key={index} transform={pose(center, rotation)}>
        {steps(count).map(i => {
          const angle = i * 360 / count
          const color = pattern === "canopy" || pattern === "reverse" ? spectrum[i] : i % 2 ? paint.accent : paint.metal
          if (pattern === "wedge") return <path key={i} d={path([polar(r * .67, angle - 16), polar(r, angle), polar(r * .67, angle + 16)])}
            stroke={color} strokeWidth="3.8" strokeLinejoin="round" />
          if (pattern === "drum") return <path key={i} d={path([polar(r * .70, angle - 11), polar(r, angle - 11), polar(r, angle + 11), polar(r * .70, angle + 11)])}
            stroke={color} strokeWidth="3.8" />
          return <path key={i} d={arc(r, angle, angle + (pattern === "twin" ? 53 : pattern === "tap" ? 30 : 56))}
            stroke={color} strokeWidth={pattern === "canopy" ? 5.2 : 3.3} strokeLinecap="round" />
        })}
        {pattern === "reverse" && <>
          <path d={path([polar(r * .72, 0), polar(r * .77, 137), polar(r * .72, 274)]) + "Z"}
            fill={paint.accent} fillOpacity=".13" stroke={paint.light} strokeWidth="3.4" />
          <path d={path([polar(r * .49, 180), polar(r * .57, 317), polar(r * .49, 94)]) + "Z"}
            transform={`rotate(${-26 * q})`} stroke={paint.accent} strokeWidth="2.1" strokeDasharray="8 5" />
        </>}
        {pattern === "canopy" && <g transform="rotate(-27)">
          <ellipse rx={r * .77} ry={r * .45} stroke={paint.light} strokeWidth="3.2" />
          {[-1, 1].map((side, i) => <path key={side}
            d={`M${-r * .77} 0Q0 ${side * r * (.60 + q * .36)} ${r * .77} 0`}
            stroke={spectrum[i + 1]} strokeWidth="4.2" strokeOpacity=".79" />)}
        </g>}
      </g>
    })}
  </g>
}

function TraitMotion({ s, layer }: { s: Scene; layer: Layer }) {
  const { fx, beat, art, paint, t, to } = s
  const q = ease(t)
  const from = fx.from
  const contact = fx.contacts?.[0] ?? beat.receiver
  const endpoint = beat.landings?.find(p => p) ?? beat.landing ?? to
  const facing = heading(direction(from, endpoint))
  const saved = beat.mode === "proc" && ["slash", "lens", "echo"].includes(art.motion) && edgeDistance(from, to) < 14
  const mark = foot(contact, beat.mode === "stance" ? 35 : 12)
  const glyph = <Badge where={mark} art={art} paint={paint} tilt={art.angle + (1 - q) * (art.angle > 0 ? -31 : 31)}
    scale={(fx.rarity === "C" ? .78 : .90) + .15 * q} />
  if (layer === "floor") {
    return <>
      {["toe", "trail", "ruler"].includes(art.motion) &&
        <Footprints from={from} to={endpoint} paint={paint} q={q} measure={art.motion === "ruler"} />}
      {beat.partners?.map((partner, i) => <Sash key={i} from={partner} to={contact} paint={paint}
        bend={i % 2 ? 20 : -17} q={.56 + .44 * q} wide={2.2} dotted={beat.mode === "stance"} />)}
      {["ribbon", "echo", "wing"].includes(art.motion) &&
        <Sash from={from} to={to} paint={paint} bend={art.angle * .23} q={.28 + .72 * q}
          wide={art.motion === "ribbon" ? 5.5 : 2.7} dotted={art.motion === "echo" && beat.mode === "proc"} />}
      {art.motion === "slash" && !saved && <Sash from={contact} to={endpoint} paint={paint} q={.5 + .5 * q} wide={3.2} arrow />}
      {art.motion === "lace" && <path d={arc(40 + 11 * q, -153, 101)} transform={pose(from, facing)} stroke={paint.accent}
        strokeDasharray="6 6" strokeWidth="2.4" fill="none" />}
    </>
  }
  let shape
  switch (art.motion) {
    case "toe":
      shape = <path d="M-31-4-17-16-7-10-20 1M10 13 22 1 33 8 19 21" transform={pose(mark, facing + 20, .65 + q * .47)}
        fill="none" stroke={paint.light} strokeWidth="3.2" />
      break
    case "ruler":
      shape = <path d="M-32-18v12m16-18v18m16-25v25m16-15v15m16-12v12M-37-6h74"
        transform={pose(mark, facing, .65 + .39 * q)} fill="none" stroke={paint.accent} strokeWidth="2.8" />
      break
    case "wing":
      shape = <path d="M-46 9-33-25-17-24-21-2 0-13 21-2 17-24 33-25 46 9 22 21 0 7-22 21Z"
        transform={pose(contact, 90 + facing * .28, .66 + .46 * q)} fill={paint.metal} fillOpacity=".14" stroke={paint.accent} strokeWidth="2.6" />
      break
    case "brace":
      shape = <Hinge where={contact} paint={paint} angle={facing + (beat.mode === "proc" ? art.angle * .29 : 0)} q={q} spread={.78 + .24 * q} />
      break
    case "slash":
      shape = <path d={saved ? "M-18 1 0-18 17 0M-17 10 1-6 18 10" : "M-44 22-12-13 34-26M-34 29-5-7 46-17"}
        transform={pose(mark, facing + art.angle * .17, .70 + q * .41)} fill="none" stroke={paint.light} strokeWidth="3.6" />
      break
    case "link":
      shape = <path d="M-42 6-28-14-13-14-3 0 12 0 23-13 39-7 45 9M-34 15-21 1-12 12 2 13 15-1 31 4"
        transform={pose(mark, art.angle * .31, .66 + q * .42)} fill="none" stroke={paint.accent} strokeWidth="3" />
      break
    case "stamp":
      shape = <path d="M-32-6v-16h17m30 0h17v16m0 22v15H15m-30 0h-17V16M-8 10 0 17 12 6"
        transform={pose(mark, art.angle * .29, 1.19 - q * .27)} fill="none" stroke={paint.light} strokeWidth="3.4" />
      break
    case "drum":
      shape = <path d={arc(41 + 9 * q, 12, 139) + arc(44 + 13 * q, 189, 288) + arc(32 + 4 * q, -54, 25)}
        transform={pose(contact, art.angle * .34)} fill="none" stroke={paint.metal} strokeWidth="4.6" />
      break
    case "ribbon":
      shape = <path d="M-34-8C-18-31 18 16 33-10M-34 12C-13 34 18-12 33 14"
        transform={pose(mark, facing + art.angle * .29, .76 + .29 * q)} fill="none" stroke={paint.light} strokeWidth="3.2" />
      break
    case "lens":
      shape = <path d={arc(48 + 8 * q, -57, 47) + arc(56 + 11 * q, -42, 35) + "M35-15 56 0 37 16"}
        transform={pose(contact, facing + art.angle * .10)} fill="none" stroke={paint.light} strokeWidth="3.0" />
      break
    case "lace":
      shape = <path d="M-39 3-21-14-2 6 16-14 37 3 17 20-2 2-21 19Z"
        transform={pose(mark, art.angle * .41, .71 + .41 * q)} fill="none" stroke={paint.accent} strokeWidth="3.1" />
      break
    case "echo":
      shape = <path d="M-38 12-16-20 3-3 19-21 38 9M-29 22-15 7 2 17 19 2 30 15"
        transform={pose(mark, facing + art.angle * .19, .74 + q * .32)} fill="none" stroke={paint.accent} strokeWidth="2.9" />
      break
    case "trail":
      shape = <path d="M-33 6-20-10-6-4M-21 19-9 2 4 8M-1 23 14 4 29 11"
        transform={pose(mark, facing, .67 + .49 * q)} fill="none" stroke={paint.light} strokeWidth="3.1" />
      break
  }
  return <>
    {shape}{glyph}
    {fx.contacts?.slice(1).map((where, i) => <g key={i} opacity={.67 + .30 * q}>
      {art.motion === "drum" && <path d={arc(38 + q * 13, 15, 141)} transform={at(where)}
        fill="none" stroke={paint.metal} strokeWidth="3.8" />}
      <Badge where={foot(where, 12)} art={art} paint={paint} scale={.65 + .23 * q} tilt={art.angle * -.57} />
    </g>)}
  </>
}

function Lantern({ where, paint, q }: { where: EdgePoint; paint: ArmorPaint; q: number }) {
  return <g transform={at(where)} strokeLinejoin="round">
    <path d="M-24 19-18 3 18 3 24 19ZM-9 3-12-23 0-33 12-23 9 3M0-39v-7"
      fill={paint.ink} fillOpacity=".57" stroke={paint.light} strokeWidth="2.9" />
    <path d="M0-27 7-17 0-4-7-17Z" fill={paint.accent} fillOpacity={.50 + q * .40} stroke={paint.light} strokeWidth="2" />
  </g>
}

function Band({ area, paint, q }: { area?: EdgeArea; paint: ArmorPaint; q: number }) {
  const strip = area?.parts[0]
  if (strip?.kind !== "polygon" || strip.points.length !== 4) return null
  const [a, b, c, d] = strip.points
  const rim = (first: EdgePoint, last: EdgePoint, fill: string) => <path d={path([first, last])}
    fill="none" stroke={fill} strokeWidth="3.4" strokeLinecap="round" />
  return <g>
    <Rim area={area} paint={paint} fill={.21} />
    {rim(a, b, paint.metal)}{rim(d, c, paint.accent)}
    {steps(7).map(i => {
      const portion = (i + .6) / 7.3, aSide = mix(a, b, portion), dSide = mix(d, c, portion)
      return <path key={i} d={path([mix(aSide, dSide, .17), mix(aSide, dSide, .50), mix(aSide, dSide, .83)])}
        stroke={paint.light} strokeWidth={i % 3 === 0 ? 3.7 : 1.9}
        opacity={.24 + .51 * (1 - Math.abs(portion - q))} fill="none" />
    })}
  </g>
}

function GoldMotion({ s, layer }: { s: Scene; layer: Layer }) {
  const { fx, beat, art, paint, t, to } = s
  const q = ease(t), travel = beat.mode === "travel"
  const from = fx.from
  const front = layer === "front"
  const mark = (where: EdgePoint, scale = .90, angle = art.angle) =>
    <Badge where={foot(where, 13)} art={art} paint={paint} scale={scale} tilt={angle} />
  const pulse = (pattern: Parameters<typeof Pulse>[0]["pattern"]) =>
    <Pulse area={fx.area} paint={paint} q={q} pattern={pattern} travel={travel} />
  switch (art.pair) {
    case "secondHeel":
      return front ? mark(travel ? mix(from, to, q) : to, travel ? .61 : .94, 33 + q * 38) : <>
        <Sash from={from} to={to} paint={paint} bend={-34} q={travel ? q : 1} wide={4.1} />
        {!travel && <Footprints from={from} to={to} paint={paint} q={q} />}
      </>
    case "lantern":
      return front ? edgeDistance(from, to) > 4 ? <Hinge where={to} paint={paint} angle={68} q={q} spread={.85} />
        : <Lantern where={from} paint={paint} q={q} /> : <>
        <Rim area={fx.area} paint={paint} />
        <Sash from={from} to={to} paint={paint} bend={21} q={q} wide={3.1} />
      </>
    case "sideRibbon": {
      const end = beat.landings?.[0] ?? to
      return front ? mark(travel ? to : end, travel ? .66 : .94, heading(direction(from, end))) : <>
        <Sash from={from} to={travel ? to : end} paint={paint} bend={12} wide={5.3} />
        <Sash from={from} to={end} paint={paint} bend={-13} q={travel ? q : 1} wide={2.4} dotted />
      </>
    }
    case "doubleLamp":
      return front ? <>{travel ? <Lantern where={mix(from, to, q)} paint={paint} q={q} /> : mark(to, .98)}</>
        : <Sash from={from} to={to} paint={paint} bend={-54} q={travel ? q : 1} wide={5} />
    case "meterHeal":
      return front ? mark(travel ? mix(from, to, q) : to, travel ? .58 : 1.0)
        : <Footprints from={from} to={to} paint={paint} q={travel ? q : 1} measure />
    case "entryStrike":
      return front ? travel ? mark(from, .77) : <path d="M-22-23 0 19 23-23M-14-10 0 14 14-10"
        transform={pose(to, art.angle * .37, .65 + q * .40)} fill="none" stroke={paint.light} strokeWidth="3.6" /> : pulse("tap")
    case "pairWard":
      return front ? travel ? <>{circlesOf(fx.area).map(({ center }, i) => <g key={i}>{mark(center, .72, i ? 59 : -59)}</g>)}</>
        : <Hinge where={to} paint={paint} angle={-18} q={q} /> : pulse("twin")
    case "anchorEcho":
      return front ? mark(travel ? from : to, .88 + q * .16) : <>
        {pulse("wedge")}
        {fx.contacts?.map((at, i) => <Sash key={i} from={at} to={beat.landings?.[i] ?? at} paint={paint}
          bend={-5} q={q} wide={4.4} arrow />)}
      </>
    case "doubleBeat":
      return front ? mark(travel ? from : to, 1.08, 37 + q * 39) : <>
        {pulse("drum")}
        {beat.landing && <Sash from={beat.landing} to={from} paint={paint} bend={34} q={q} wide={2.8} dotted />}
      </>
    case "guardPair":
      return front ? <Hinge where={to} paint={paint} angle={heading(direction(from, to))} q={q} spread={1.14} />
        : <>{beat.partners?.map((partner, i) => <Sash key={i} from={to} to={partner} paint={paint} bend={i ? -16 : 16} wide={4} />)}</>
    case "orbitBand":
      return front ? beat.mode === "stance" ? <Hinge where={to} paint={paint} angle={90} q={q} spread={1.14} />
        : mark(to, .86) : <Band area={fx.area} paint={paint} q={q} />
    case "tangent": {
      const contact = fx.contacts?.[0] ?? to
      const end = beat.landings?.[0] ?? to
      return front ? mark(contact, 1.01, heading(direction(contact, end))) : <>
        <Sash from={from} to={contact} paint={paint} bend={40} q={q} wide={4.3} />
        <Sash from={contact} to={end} paint={paint} bend={0} q={.38 + .62 * q} wide={5.5} arrow />
      </>
    }
    case "tailCanopy":
      return front ? travel ? mark(from, .80 + q * .26) : <Hinge where={to} paint={paint} angle={87} q={q} spread={1.25} /> : pulse("canopy")
    case "rewindScreen":
      return front ? mark(travel ? from : to, 1.14, 120 - q * 90) : <>
        {pulse("reverse")}
        {fx.contacts?.map((at, i) => <Sash key={i} from={at} to={beat.landings?.[i] ?? at} paint={paint}
          bend={-7} q={q} wide={4.7} arrow />)}
      </>
    default: return null
  }
}

export function EdgeDancerTraitField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  const id = field.cast.signature?.id
  if (field.until <= battle.time || id !== "dancer/C/G2" && id !== "dancer/Radiant/G1") return null
  const progress = unit((battle.time - field.time) / .22)
  const time = unit((battle.time - field.time) / (field.until - field.time))
  const alpha = (.42 + .31 * progress) * unit((field.until - battle.time) / .24)
  return <g data-dancer-trait-field={id} opacity={alpha} pointerEvents="none" aria-hidden="true">
    {id === "dancer/C/G2" ? <>
      <Rim area={field.area} paint={armorPaint.C} fill={.095} />
      <Lantern where={field.area.center} paint={armorPaint.C} q={.5 + .5 * Math.sin(battle.time * 6)} />
    </> : <Band area={field.area} paint={armorPaint.Radiant} q={time} />}
  </g>
}

export function EdgeDancerTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g pointerEvents="none" aria-hidden="true">
    {battle.runtime.effects.map(fx => {
      const art = dancerTraitArt(fx.skill), beat = fx.passive
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const t = unit((battle.time - fx.start) / (fx.end - fx.start))
      const target = unitOf(battle, fx.target)
      const to = beat.mode === "travel" && target?.hp ? target : fx.to
      const s = { fx, beat, art, t, to, paint: armorPaint[fx.rarity] }
      return <g key={fx.id} data-dancer-trait={fx.skill} data-dancer-trait-mode={beat.mode}
        opacity={beat.mode === "travel" ? .92 : 1 - t ** 1.38}>
        {art.pair ? <GoldMotion s={s} layer={layer} /> : <TraitMotion s={s} layer={layer} />}
      </g>
    })}
    {dancerTraitReadiness(battle).map(({ id, unit: holder, kind, until, partners }) => {
      const art = dancerTraitArt(id)
      if (!art) return null
      const paint = armorPaint[id.split("/")[1] as Rarity]
      const remaining = until === undefined ? 1 : unit((until - battle.time) / .24)
      const hover = Math.sin(battle.time * 4 + art.angle) * 2.7
      const mark = { x: holder.x + 44, y: holder.y + 13 + hover }
      return <g key={id + "@" + holder.id} data-dancer-trait-ready={id} opacity={remaining * (kind === "stance" ? .62 : .80)}>
        {layer === "floor" ? <>
          {partners?.map((partner, i) => <Sash key={i} from={holder} to={partner} paint={paint} bend={i ? -10 : 10} wide={1.8} dotted />)}
          {kind === "stance" && <path d={arc(38, 31, 143)} transform={at(holder)} stroke={paint.metal} strokeWidth="2.2" fill="none" />}
        </> : <>
          <Badge where={mark} art={art} paint={paint} scale={.49} tilt={art.angle * .24} />
          {kind === "shield" && <path d={arc(47, -69, 15)} transform={at(holder)} stroke={paint.accent} strokeWidth="2.5" fill="none" />}
        </>}
      </g>
    })}
  </g>
}
