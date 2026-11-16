import type { EdgeBattle, EdgePoint, EdgeUnitId } from "./edgeBattle"
import { arc, armorPaint, at, circlesOf, ease, heading, mix, path, Plating, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { WardStroke, WardenOutline, wardenStrip } from "./EdgeWardenFields"
import { FIELD, along, clamp, direction, edgeDistance, fieldCrossing, isOutside, left, outward } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { wardenTraitReadiness } from "./edgeSkills/runtime"
import { battleFighters, unitOf, type FieldEffect } from "./edgeSkills/state"
import { wardenTraitArt } from "./edgeSkills/wardenTraits"

type Beat = NonNullable<SkillVisual["passive"]>
type View = { fx: SkillVisual; beat: Beat; art: NonNullable<ReturnType<typeof wardenTraitArt>>; paint: ArmorPaint; p: number }
type Layer = "floor" | "front"

const aimed = (point: EdgePoint, axis: EdgePoint) => at(point) + " rotate(" + heading(axis) + ")"
const across = { x: 1, y: 0 }

function nearestEdge(point: EdgePoint): EdgePoint {
  const rim = outward(point)
  return {
    x: rim.x ? rim.x > 0 ? FIELD.right : FIELD.left : clamp(point.x, FIELD.left, FIELD.right),
    y: rim.y ? rim.y > 0 ? FIELD.bottom : FIELD.top : clamp(point.y, FIELD.top, FIELD.bottom),
  }
}

function Mark({ view, where, axis, size = 1 }: { view: View; where: EdgePoint; axis?: EdgePoint; size?: number }) {
  const { fx, art, paint, p } = view
  const scale = size * (.79 + .24 * ease(p * 2.9))
  return <g transform={(axis ? aimed(where, axis) : at(where)) + " scale(" + scale + ")"}>
    <Plating d={art.path} paint={paint} weight={fx.gold ? 3.8 : 3.15} fill={.72} />
  </g>
}

function Braid({ from, to, view, kind = "fold" }: {
  from: EdgePoint; to: EdgePoint; view: View; kind?: "fold" | "rails" | "teeth" | "wire"
}) {
  const { p, paint, fx } = view
  const distance = edgeDistance(from, to)
  if (distance < 11) return null
  const axis = direction(from, to)
  const span = distance * (.27 + .73 * ease(p * 2.65))
  const color = fx.gold ? paint.accent : paint.metal
  const elbow = Math.min(18, span * .18)
  return <g transform={aimed(from, axis)} fill="none" strokeLinecap="round" strokeLinejoin="round">
    {kind === "fold" && <WardStroke d={`M0 0 ${span * .44} ${elbow} ${span * .55} ${elbow} ${span} 0`} color={color} width={3.8} />}
    {kind === "rails" && <>
      <WardStroke d={`M0-5 ${span * .24} -9H${span}M0 5 ${span * .24} 9H${span}`} color={color} width={3.35} />
      <path d={`M${span - 7}-13v26`} stroke={paint.light} strokeWidth="2.6" />
    </>}
    {kind === "teeth" && <>
      <path d={`M0 0H${span}`} stroke={color} strokeWidth="3" strokeDasharray="4 8" />
      {[.36, .66, .91].map((f) => <path key={f} transform={`translate(${span * f} 0)`} d="M-10-7 0 0-10 7"
        stroke={paint.light} strokeWidth="3.4" />)}
    </>}
    {kind === "wire" && <path d={`M0 0Q${span * .54} ${-elbow} ${span} 0`} stroke={color} strokeWidth="2.8" strokeDasharray="9 5 2 5" />}
  </g>
}

function EffectPaths({ view, kind = "rails" }: { view: View; kind?: "rails" | "teeth" | "fold" | "wire" }) {
  const { fx, beat } = view
  const list = (fx.contacts ?? []).flatMap((point, i) => beat.landings?.[i] ? [{ from: point, to: beat.landings[i]! }] : [])
  if (!list.length && beat.landing) list.push({ from: beat.receiver, to: beat.landing })
  return <>{list.map(({ from, to }, i) => <Braid key={i} from={from} to={to} view={view} kind={kind} />)}</>
}

function HeelSteps({ from, to, view }: { from: EdgePoint; to: EdgePoint; view: View }) {
  const { p, paint } = view
  const length = edgeDistance(from, to)
  if (length < 12) return null
  const axis = direction(from, to)
  const stride = length * ease(p * 2.35)
  const count = Math.min(7, Math.max(2, Math.ceil(length / 28)))
  return <g transform={aimed(from, axis)}>
    <path d={`M0 0H${stride}`} stroke={paint.accent} strokeWidth="2.4" strokeDasharray="4 7" />
    {Array.from({ length: count }, (_, i) => {
      const x = stride * (i + 1) / count
      return <path key={i} transform={`translate(${x} ${i % 2 ? 9 : -9})`}
        d="M-11-6H-1L7 0-1 6H-11L-6 0Z" fill={paint.ink} fillOpacity=".55" stroke={paint.metal} strokeWidth="2.6" />
    })}
  </g>
}

function RimLatch({ view, where, stop }: { view: View; where: EdgePoint; stop?: EdgePoint }) {
  const { fx, p, paint } = view
  const rim = nearestEdge(where)
  const axis = outward(rim)
  const spread = (fx.gold ? 58 : 38) + 17 * ease(p)
  const color = fx.rarity === "Prismatic" ? spectrum[3] : paint.metal
  return <>
    <g transform={aimed(rim, axis)}>
      <WardStroke d={`M0 ${-spread}v${spread * 2}M-11 ${-spread * .67}v${spread * 1.34}`} color={color} width={fx.gold ? 4.9 : 3.4} />
      <path d="M-18-22-6-13M-21 0H-5M-18 22-6 13" stroke={paint.light} strokeWidth="2.8" />
    </g>
    {stop && <Braid from={rim} to={stop} view={view} kind="wire" />}
  </>
}

function WardArrival({ view }: { view: View }) {
  const { fx, beat, paint, p } = view
  const points = fx.skill === "warden/E/P1" ? [beat.receiver] : fx.contacts?.length ? fx.contacts : [beat.receiver]
  const stacked = fx.skill === "warden/Prismatic/P1"
  const rim = fx.skill === "warden/C/P1" ? 39 : stacked ? 47 : 36
  return <>
    {points.map((point, i) => <g key={i} transform={at(point)}>
      <path d={arc(rim + 12 * ease(p), 21 + i * 12, 145 + i * 12)} fill="none" stroke={paint.metal} strokeWidth={stacked ? 4.8 : 3.3} />
      {stacked && <path d={arc(51 + 8 * ease(p), 202, 319)} fill="none" stroke={spectrum[1]} strokeWidth="3.2" />}
      {fx.skill === "warden/Prismatic/P8" && <path d="M-42-17-32-32H-20M20-32H32L42-17" fill="none" stroke={spectrum[(i + 2) % spectrum.length]} strokeWidth="3.4" />}
      <Mark view={view} where={{ x: 0, y: 46 }} size={stacked ? 1.08 : .84} />
    </g>)}
  </>
}

function Recovery({ view }: { view: View }) {
  const { fx, beat, paint, p } = view
  const where = beat.receiver
  const ascent = ease(p * 1.62)
  const flag = fx.skill === "warden/C/P8"
  const stairs = fx.skill === "warden/L/P3"
  return <g transform={at(where)}>
    <path d={stairs ? `M-44 40h10v${-12 * ascent}h9v${-16 * ascent}h12`
      : `M-40 ${40 - 12 * ascent}l9-7h9l7 ${-18 * ascent}`}
      stroke={paint.accent} fill="none" strokeWidth={stairs ? 4 : 3.2} />
    {flag && <path d="M-49 37V-7l11 6-11 8" stroke={paint.metal} fill="none" strokeWidth="3.2" />}
    <Mark view={view} where={{ x: -35, y: 37 - 18 * ascent }} size={.84} />
  </g>
}

function StanceLayers({ view, layer }: { view: View; layer: Layer }) {
  const { fx, beat, paint, p } = view
  const where = beat.receiver
  const axis = edgeDistance(fx.from, where) > 3 ? direction(fx.from, where) : across
  const q = ease(p * 2.1)
  if (layer === "floor") {
    return <>
      {beat.partners?.map((partner, i) => <Braid key={i} from={partner} to={where} view={view}
        kind={fx.skill === "warden/R/P6" ? "fold" : "wire"} />)}
      {fx.skill === "warden/C/P6" && <RimLatch view={view} where={where} stop={beat.landing} />}
      <EffectPaths view={view} kind={fx.skill === "warden/UC/P3" ? "teeth" : "rails"} />
    </>
  }
  const tip = along(where, axis, -42 - 7 * q)
  return <>
    <Mark view={view} where={tip} axis={axis} />
    <g transform={aimed(where, axis)} fill="none" stroke={paint.light} strokeWidth="3">
      <path d={`M-37 ${-24 - 9 * q}-47 ${-17 - 5 * q}M-37 ${24 + 9 * q}-47 ${17 + 5 * q}`} />
    </g>
  </>
}

function PassiveMotion({ view, layer }: { view: View; layer: Layer }) {
  const { fx, beat, art, paint, p } = view
  const { receiver, owner, landing, trigger } = beat
  const used = beat.mode === "consume"
  const start = beat.anchor ?? fx.from
  const focus = used && edgeDistance(fx.from, fx.to) > 9 ? fx.to : receiver
  const axis = edgeDistance(start, focus) > 2 ? direction(start, focus) : across
  const floor = layer === "floor"
  if (beat.mode === "stance") return <StanceLayers view={view} layer={layer} />
  switch (art.gesture) {
    case "shield":
      return floor ? <>
        <EffectPaths view={view} kind={fx.skill === "warden/E/P1" ? "fold" : "wire"} />
        <Braid from={start} to={receiver} view={view} kind={fx.skill === "warden/UC/P8" ? "fold" : "wire"} />
      </> : <WardArrival view={view} />
    case "brace": case "guard":
      return <StanceLayers view={view} layer={layer} />
    case "rip":
      return floor ? <EffectPaths view={view} kind={fx.skill === "warden/R/P2" ? "teeth" : "rails"} />
        : <Mark view={view} where={along(receiver, landing ? direction(receiver, landing) : axis, 40 + 11 * ease(p))} axis={axis} />
    case "edge": {
      const anchor = fx.skill === "warden/Prismatic/P1" ? start : receiver
      return floor ? <>
        <RimLatch view={view} where={anchor} stop={landing ?? receiver} />
        <EffectPaths view={view} kind="teeth" />
      </> : fx.skill === "warden/Prismatic/P1" || fx.skill === "warden/R/P8" ? <WardArrival view={view} />
        : <Mark view={view} where={along(nearestEdge(anchor), outward(anchor), -22)} axis={outward(anchor)} />
    }
    case "heal": {
      const border = fx.skill === "warden/Prismatic/P6" && trigger ? nearestEdge(trigger) : start
      return floor ? <Braid from={border} to={receiver} view={view} kind={fx.skill === "warden/UC/P5" ? "rails" : "fold"} />
        : <Recovery view={view} />
    }
    case "rhythm":
      return floor ? <Braid from={used ? fx.from : start} to={used ? fx.to : owner} view={view} kind={used ? "teeth" : "wire"} />
        : <Mark view={view} where={{ x: focus.x - (used ? 30 : 48), y: focus.y + 27 }} size={.87} />
    case "relay":
      return floor ? <Braid from={fx.skill === "warden/Radiant/P6" && used ? fx.from : owner}
        to={fx.skill === "warden/Radiant/P6" && !used ? receiver : fx.to} view={view} kind={used ? "fold" : "teeth"} />
        : <Mark view={view} where={along(focus, axis, -35)} axis={axis} size={.89} />
    case "stride":
      return floor ? <HeelSteps from={used ? fx.from : start} to={used ? fx.to : landing ?? receiver} view={view} />
        : <Mark view={view} where={{ x: focus.x + 26, y: focus.y + 37 }} axis={axis} />
    case "tether":
      return floor ? <Braid from={used ? fx.from : start} to={landing ?? receiver} view={view} kind={used ? "teeth" : "rails"} />
        : <Mark view={view} where={{ x: receiver.x, y: receiver.y + 46 }} axis={axis} />
    case "signal":
      return floor ? <Braid from={used ? fx.from : start} to={fx.to} view={view} kind="wire" />
        : <Mark view={view} where={{ x: focus.x + 45, y: focus.y - 17 }} size={.9} />
    case "pivot":
      return floor ? <Braid from={start} to={receiver} view={view} kind="rails" />
        : <WardArrival view={view} />
    case "pair":
      return floor ? <Braid from={used ? fx.from : owner} to={fx.to} view={view} kind={used ? "teeth" : "fold"} />
        : <>{(fx.contacts?.length ? fx.contacts : [focus]).map((point, i) => <Mark key={i} view={view}
          where={{ x: point.x + (i % 2 ? 41 : -41), y: point.y + 14 }} size={.89} />)}</>
    case "gate":
      return floor ? <>
        {fx.area && <WardenOutline area={fx.area} color={paint.metal} fill={.025} />}
        <EffectPaths view={view} kind="teeth" />
      </> : <Mark view={view} where={along(receiver, axis, 37)} axis={axis} />
    case "return": {
      const border = nearestEdge(start)
      return floor ? <RimLatch view={view} where={border} stop={receiver} />
        : <WardArrival view={view} />
    }
    case "gather":
      return floor ? <EffectPaths view={view} kind="fold" /> : <WardArrival view={view} />
    case "impact":
      return floor ? <EffectPaths view={view} kind="teeth" /> : <Mark view={view} where={focus} size={1.06} />
  }
}

function GoldMotion({ view, layer, battle }: { view: View; layer: Layer; battle: EdgeBattle }) {
  const { fx, beat, paint, p } = view
  const { receiver, owner, trigger, landing } = beat
  const start = beat.anchor ?? fx.from
  const center = fx.area?.center ?? start
  const floor = layer === "floor"
  const points = fx.contacts?.length ? fx.contacts : [receiver]
  const axis = edgeDistance(start, receiver) > 2 ? direction(start, receiver) : across
  const q = ease(p)
  const nearbyShards = (where: EdgePoint, radius: number, cut: number) => <g transform={at(where)}>
    {[0, 1, 2, 3, 4].map((i) => <path key={i} transform={`rotate(${cut + i * 72}) translate(${radius * (.38 + .61 * q)} 0)`}
      d={i % 2 ? "M-11-8 13 0 0 11Z" : "M-10-12 8-9 15 0-2 8Z"} fill={paint.metal} fillOpacity=".26"
      stroke={i % 2 ? paint.accent : paint.light} strokeWidth="2.7" />)}
  </g>
  switch (fx.skill) {
    case "warden/C/G1":
      return floor ? <>
        {nearbyShards(start, 65, 16)}
        <EffectPaths view={view} kind="teeth" />
      </> : <Mark view={view} where={along(start, axis, 29)} axis={axis} />
    case "warden/C/G2":
      return floor ? <>
        <EffectPaths view={view} />
        <g transform={at(landing ?? receiver)}><path d={arc(38 + q * 17, 28, 158)} fill="none" stroke={paint.light} strokeWidth="4.1" /></g>
      </> : <Mark view={view} where={along(receiver, direction(start, landing ?? receiver), 25 + q * 14)} />
    case "warden/UC/G1":
      return floor ? <>
        <Braid from={owner} to={start} view={view} kind="rails" />
        <Braid from={start} to={receiver} view={view} kind="fold" />
      </> : <>
        <Mark view={view} where={{ x: start.x - 12, y: start.y + 36 }} axis={direction(owner, start)} />
        <WardArrival view={view} />
      </>
    case "warden/UC/G2": {
      const moving = battleFighters(battle).find((member) => member.force?.cause?.signature?.id === fx.skill && member.force.cause.id === fx.cast)
      if (beat.mode === "travel" && !moving) return null
      const end = moving ?? receiver
      return floor ? <Braid from={fx.from} to={end} view={view} kind="rails" />
        : <Mark view={view} where={along(end, direction(fx.from, fx.to), 38)} axis={direction(fx.from, fx.to)} />
    }
    case "warden/R/G1":
      return floor ? <>
        {beat.mode === "consume" && <HeelSteps from={fx.from} to={fx.to} view={view} />}
        {beat.mode === "consume" && trigger && <path d={path([fx.to, trigger])} fill="none" stroke={paint.metal}
          strokeWidth="2.7" strokeDasharray="4 8" opacity=".62" />}
        <g transform={at(center)}><path d={arc(43 + 25 * q, 2, 173)} fill="none" stroke={paint.accent} strokeWidth="4" /></g>
      </> : <Mark view={view} where={beat.mode === "consume" ? fx.to : center} axis={direction(fx.from, fx.to)} />
    case "warden/R/G2":
      return floor ? <>
        <RimLatch view={view} where={owner} stop={owner} />
        {points.map((point, i) => <Braid key={i} from={owner} to={point} view={view} kind="fold" />)}
        <EffectPaths view={view} kind="teeth" />
      </> : <Mark view={view} where={along(receiver, outward(owner), -41)} axis={direction(owner, receiver)} />
    case "warden/E/G1":
      return floor ? <EffectPaths view={view} kind="rails" />
        : <>{points.map((point, i) => {
          const end = beat.landings?.[i] ?? receiver
          const heading = direction(point, end)
          return <Mark key={i} view={view} where={along(point, heading, 26 + q * 22)} axis={heading} />
        })}</>
    case "warden/E/G2":
      return floor ? <>
        {nearbyShards(center, 70, 28)}
        <EffectPaths view={view} kind="teeth" />
      </> : <Mark view={view} where={center} size={1.16} />
    case "warden/L/G1":
      return floor ? <>
        <Braid from={start} to={owner} view={view} kind={fx.area ? "rails" : "wire"} />
        <EffectPaths view={view} kind="teeth" />
      </> : fx.area ? <>{points.map((point, i) => <Mark key={i} view={view}
        where={along(point, direction(owner, point), 46)} axis={direction(owner, point)} />)}</>
        : <Mark view={view} where={{ x: receiver.x, y: receiver.y + 47 }} />
    case "warden/L/G2": {
      const strip = wardenStrip(fx.area?.parts[0])
      if (!strip) return null
      const progress = strip.length * (.2 + .8 * q)
      const vector = direction(strip.from, strip.to)
      const sign = left(vector)
      return floor ? <g transform={aimed(strip.from, vector)}>
        <path d={`M0 ${-strip.width / 2}H${progress}V${strip.width / 2}H0Z`} fill={paint.metal}
          fillOpacity=".17" stroke={paint.metal} strokeWidth="3.7" />
        <path d={`M0 0H${progress}`} fill="none" stroke={paint.light} strokeWidth="3.4" strokeDasharray="6 5" />
      </g> : <Mark view={view} where={along(along(strip.from, vector, progress), sign, 14)} axis={vector} size={1.16} />
    }
    case "warden/Radiant/G1":
      return floor ? <>
        {fx.area && <WardenOutline area={fx.area} color={paint.accent} fill={.1} />}
        <EffectPaths view={view} kind={beat.mode === "consume" ? "rails" : "fold"} />
      </> : <>{points.map((point, i) => {
        const end = beat.landings?.[i] ?? point
        const axis = direction(point, end)
        return <Mark key={i} view={view} where={along(mix(point, end, .28 + .62 * q), left(axis), 27)} axis={axis} />
      })}</>
    case "warden/Radiant/G2":
      return floor ? <>
        {fx.area && <WardenOutline area={fx.area} color={paint.accent} fill={.04} />}
        {points.map((point, i) => <Braid key={i} from={center} to={point} view={view} kind={beat.mode === "consume" ? "rails" : "fold"} />)}
        <EffectPaths view={view} kind="fold" />
      </> : <>{points.map((point, i) => <Mark key={i} view={view} where={{ x: point.x, y: point.y + 49 }} />)}</>
    case "warden/Prismatic/G1": {
      const edge = nearestEdge(start)
      const from = trigger && !isOutside(trigger) && isOutside(start) ? fieldCrossing(trigger, start) : edge
      return floor ? <>
        <RimLatch view={view} where={from} stop={landing} />
        {points.map((point, i) => {
          const axis = direction(from, point)
          const corner = along(mix(from, point, .46), left(axis), 17)
          const tip = mix(corner, point, ease(p * 2.3))
          return <g key={i}>
            <WardStroke d={path([from, corner, tip])} color={spectrum[3]} width={5.8} />
            <path d={path([along(from, left(axis), -8), along(corner, left(axis), -8), tip])}
              fill="none" stroke={spectrum[1]} strokeWidth="3" strokeDasharray="7 5" />
            <path transform={aimed(tip, axis)} d="M-19-13 3 0-19 13-10 0Z"
              fill={spectrum[3]} fillOpacity=".46" stroke={paint.light} strokeWidth="3.1" />
          </g>
        })}
        <EffectPaths view={view} kind="teeth" />
      </> : <>
        <Mark view={view} where={from} axis={outward(from)} size={1.24} />
        <Mark view={view} where={along(receiver, direction(receiver, from), 39)} size={.92} />
      </>
    }
    case "warden/Prismatic/G2":
      return floor ? <>
        {fx.area && <WardenOutline area={fx.area} color={spectrum[4]} fill={.09} />}
        <Braid from={center} to={receiver} view={view} kind={beat.mode === "stance" ? "rails" : "fold"} />
      </> : <Mark view={view} where={beat.mode === "stance" ? along(receiver, direction(fx.from, receiver), -42) : { x: center.x, y: center.y + 45 }} size={1.18} />
  }
}

export function EdgeWardenTraitField({ field, battle }: { field: FieldEffect; battle: EdgeBattle }) {
  const id = field.cast.signature?.id
  if (id !== "warden/R/G1" && id !== "warden/Prismatic/G2") return null
  const part = circlesOf(field.area)[0]
  if (!part) return null
  const { center, radius } = part
  const { time } = battle
  const p = ease((time - field.time) / .28)
  const alpha = unit((field.until - time) * 3)
  const two = id === "warden/Prismatic/G2"
  const other = two && battle.runtime.fields.find((entry) =>
    entry.id > field.id && entry.cast.id === field.cast.id && entry.cast.signature?.id === id)
  const hue = other ? spectrum[1] : spectrum[3]
  return <g data-warden-trait-field={id} opacity={alpha * (.45 + .55 * p)}>
    {other && <path d={path([center, other.area.center])} stroke={spectrum[3]} strokeWidth="4" strokeDasharray="4 9" opacity=".6" />}
    <g transform={at(center)}>
      <circle r={radius} fill={two ? hue : "#a5a9ff"} fillOpacity={two ? .10 : .12}
        stroke={two ? hue : "#b4c3ff"} strokeWidth="2.8" strokeDasharray={two ? undefined : "5 9"} />
      {two && <WardStroke d={arc(radius - 8, 15, 159) + arc(radius - 8, 195, 339)} color={hue} width={4.5} />}
      {two ? [15, 135, 255].map((angle, i) => <g key={angle} transform={`rotate(${angle}) translate(${radius * .84} 0)`}>
        <path d="M-10-19H5L14-10V10L5 19H-10L-17 10V-10Z" fill="#352243" stroke={spectrum[i + 1]} strokeWidth="3.8" />
        <path d="M-7-10H3L8 0 3 10H-7" fill="none" stroke="#fff1fa" strokeWidth="2.2" />
      </g>) : <>
        <WardStroke d="M-18 17H18M-14 11-7-9H7L14 11M-8-5V-18H8V-5" color="#d7d3ff" width={3.7} />
        {[0, 1, 2].map((i) => <path key={i} d={arc(radius - 7, i * 120 + 12, i * 120 + 54)}
          fill="none" stroke="#a3e2ff" strokeWidth="3.4" />)}
      </>}
    </g>
  </g>
}

function ReadyTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  const readiness = wardenTraitReadiness(battle)
  const marks = new Map<EdgeUnitId, number>()
  const pairs = new Map<string, EdgePoint[]>()
  if (layer === "floor" && battle.finishedAt === null) for (const watch of battle.runtime.watches) {
    if (watch.cast.signature?.id !== "warden/Prismatic/P2" || watch.until <= battle.time || watch.uses <= 0) continue
    const card = unitOf(battle, watch.target)
    if (!card?.hp) continue
    const key = watch.cast.owner + "/" + watch.cast.id
    const members = pairs.get(key) ?? []
    members.push(card)
    pairs.set(key, members)
  }
  return <>
    {[...pairs].map(([key, cards]) => cards.length === 2 && <path key={key} d={path(cards)}
      stroke={spectrum[3]} strokeWidth="3.1" strokeDasharray="4 8" opacity=".64" />)}
    {readiness.map(({ id, unit: card, until, kind, partners }) => {
      const art = wardenTraitArt(id)!
      const [, rarity] = id.split("/")
      const paint = armorPaint[rarity as SkillVisual["rarity"]]
      const alpha = until === undefined ? .71 : clamp((until - battle.time) * 2.8, .12, .84)
      if (layer === "floor") {
        const rim = id === "warden/C/P6" ? nearestEdge(card) : undefined
        if (!rim && !partners?.length) return null
        return <g key={id + "/" + card.id} data-warden-trait-ready={id} opacity={alpha}>
          {rim && <path d={path([along(rim, left(outward(rim)), -34), along(rim, left(outward(rim)), 34)])}
            stroke={paint.accent} strokeWidth="4" strokeDasharray="8 4" />}
          {partners?.map((point, i) => <path key={i} d={path([point, mix(point, card, .6), card])}
            fill="none" stroke={paint.accent} strokeWidth="2.7" strokeDasharray="5 8" />)}
        </g>
      }
      const i = marks.get(card.id) ?? 0
      marks.set(card.id, i + 1)
      const pos = { x: card.x + (kind === "watch" ? 47 : -47) + Math.floor(i / 3) * 15, y: card.y + 23 - i % 3 * 18 }
      return <g key={id + "/" + card.id} data-warden-trait-ready={id} opacity={alpha}
        transform={at(pos) + " scale(" + (kind === "stance" ? .57 : .49) + ")"}>
        <Plating d={art.path} paint={paint} weight={3.3} fill={.88} />
      </g>
    })}
  </>
}

export function EdgeWardenTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g className="edge-skill-vfx" aria-hidden="true">
    <ReadyTraits battle={battle} layer={layer} />
    {battle.runtime.effects.map((fx) => {
      const art = fx.passive && wardenTraitArt(fx.skill)
      if (!fx.passive || !art || battle.time < fx.start || battle.time >= fx.end) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const view = { fx, beat: fx.passive, art, paint: armorPaint[fx.rarity], p }
      const alpha = 1 - .91 * unit((p - .2) / .8) ** 1.15
      return <g key={fx.id} data-warden-trait={fx.skill} data-warden-trait-beat={fx.passive.mode} opacity={alpha}>
        {fx.gold ? <GoldMotion view={view} layer={layer} battle={battle} /> : <PassiveMotion view={view} layer={layer} />}
      </g>
    })}
  </g>
}
