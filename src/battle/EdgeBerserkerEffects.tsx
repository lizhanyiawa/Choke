import type { Rarity } from "@/card/types"

import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, circlesOf, ease, heading, mix, path, Plating, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { WardStroke, WardenOutline, wardenStrip } from "./EdgeWardenFields"
import { along, direction, edgeDistance, fieldCrossing, isOutside, left, outward } from "./edgeSkills/geometry"
import { berserkerChoreography, type BerserkerMotif } from "./edgeSkills/berserkerChoreo"
import type { BerserkerBeat, SkillVisual } from "./edgeSkills/presentation"
import { battleFighters, unitOf } from "./edgeSkills/state"

type Layer = "floor" | "front"
type Shot = { fx: SkillVisual; beat: BerserkerBeat; motif: BerserkerMotif; paint: ArmorPaint; p: number }
type Contact = NonNullable<BerserkerBeat["paths"]>[number]

const hotPaint: Record<Rarity, ArmorPaint> = {
  C: { light: "#fff3e8", metal: "#efc1ab", accent: "#ff936f", ink: "#41292a" },
  UC: { light: "#fff1db", metal: "#ffad89", accent: "#f98eae", ink: "#482b35" },
  R: { light: "#ffece7", metal: "#ff858e", accent: "#d9aeff", ink: "#51263a" },
  E: { light: "#fcf0ff", metal: "#dba1ff", accent: "#ff849f", ink: "#402444" },
  L: { light: "#fff6d0", metal: "#ffbf7a", accent: "#ff876a", ink: "#4b2e31" },
  Radiant: { light: "#fff4e9", metal: "#ff795d", accent: "#ffe0a5", ink: "#5c2835" },
  Prismatic: { light: "#fff7fa", metal: "#ffc1de", accent: "#afebff", ink: "#402341" },
}

const aligned = (point: EdgePoint, axis: EdgePoint) => at(point) + " rotate(" + heading(axis) + ")"
const warmed = (paint: ArmorPaint, metal: string): ArmorPaint => ({ ...paint, metal })

const blades = {
  chop: "M-43-5H-8L10-23H27L49-7 39 19 5 15-6 6H-43Z",
  hack: "M-39-4H-2L9-25 38-16 46 3 27 20 3 15 12 1H-39Z",
  answer: "M-39-5H3L-4-20 24-19 49 0 24 19-4 20 3 5H-39Z",
  siphon: "M-34-3H5L17-25 39-21 52-4 44 20 17 27 32 10 30-7 13-11 8 5H-34Z",
  scar: "M-25-17H-4L35-22 18-10-12-8ZM-20-3H4L45-6 27 5-11 8ZM-19 12H1L31 11 16 24H-22Z",
  hook: "M-39-5H-5L1-23H21L49-11V13L32 27H11L22 14H31V2L16-8 4 7H-39Z",
  bloodprice: "M-44-6H-3L4-28H25L49-14 58 5 47 27H4L-7 7H-44Z",
  wound: "M-43-4H-9L9-28 46-23 55-7 29-1 43 9 10 22-9 6H-43Z",
  armorbreak: "M-48-7H-7L-4-29H33L52-12V12L33 29H-4L-7 7H-48Z",
  backedge: "M-44-4H-2L14-24H50L32 0 50 24H14L-2 4H-44Z",
  rimrage: "M-43-6H-9L1-30 26-25 51-12 39-1 54 10 29 27H0L-9 6H-43Z",
  furnace: "M-48 4-30-9-12-9-4-30 12-22 21-37 25-15 47-4 38 20 17 32-7 23-15 9-30 13Z",
} as const

function Blade({ d, where, axis, paint, size = 1, angle = 0 }: {
  d: string; where: EdgePoint; axis: EdgePoint; paint: ArmorPaint; size?: number; angle?: number
}) {
  return <g transform={aligned(where, axis) + " rotate(" + angle + ") scale(" + size + ")"}>
    <Plating d={d} paint={paint} weight={4.1} fill={.89} />
    <path d="M-25 0H5L20-6" fill="none" stroke={paint.light} strokeWidth="2.6" />
  </g>
}

function LaneGuide({ shot }: { shot: Shot }) {
  const { fx, motif, paint, p } = shot
  if (!fx.area) return null
  return <>{fx.area.parts.map((part, i) => {
    const line = wardenStrip(part)
    if (!line) return null
    const { from, to, width, length } = line
    const half = width / 2
    const q = ease(p)
    const color = motif === "crossfire" ? spectrum[i ? 3 : 1] : motif === "backedge" && fx.beat === 2 ? "#e0b4ff" : paint.metal
    const tip = (motif === "backedge" && fx.beat === 2 ? 1 - p : .12 + .76 * q) * length
    return <g key={i} transform={aligned(from, direction(from, to))}>
      {motif === "crossfire" ? <>
        <path d={`M0 ${-half}H${length}V${half}H0Z`} fill={color} fillOpacity=".09" stroke={color} strokeWidth="3.1" />
        <WardStroke d={`M0 0H${length * .49 * q}M${length} 0H${length * (1 - .49 * q)}`} color={color} width={5.1} />
        {[.16, .31, .68, .85].map((f) => <path key={f} transform={`translate(${length * f} 0)`}
          d={f < .5 ? "M-15-18 10 0-15 18" : "M15-18-10 0 15 18"} stroke={paint.light}
          fill="none" strokeWidth="3.5" opacity={.45 + .52 * q} />)}
      </> : <>
        <path d={`M0 ${-half}H${length}V${half}H0Z`} fill={color} fillOpacity=".075" stroke={color} strokeWidth="2.4" />
        <path d={`M0 0H${length}`} stroke={color} strokeWidth="2.8" strokeDasharray={motif === "redline" ? "7 6" : "16 10"} opacity=".66" />
        <path d={`M${Math.max(0, tip - 34)} ${-half * .73}L${tip} 0 ${Math.max(0, tip - 34)} ${half * .73}`}
          fill="none" stroke={paint.light} strokeWidth={motif === "needle" ? 4.4 : 3.1} />
      </>}
    </g>
  })}</>
}

function RageCircleGuide({ shot, battle }: { shot: Shot; battle: EdgeBattle }) {
  const { fx, beat, motif, paint, p } = shot
  const circle = circlesOf(fx.area)[0]
  if (!circle) return null
  const { radius } = circle
  const owner = unitOf(battle, beat.owner)
  const center = motif === "pulseaxe" && fx.beat === 2 && owner?.hp ? owner : circle.center
  const q = ease(p)
  return <g transform={at(center)}>
    <circle r={radius} fill={paint.metal} fillOpacity=".064" stroke={paint.metal} strokeWidth="2.7"
      strokeDasharray={motif === "wheel" ? "21 9" : undefined} />
    {motif === "fracture" && <>
      <circle r="60" fill="none" stroke={paint.light} strokeWidth="2.5" opacity={.29 + .43 * q} />
      {[0, 1, 2, 3, 4, 5].map((i) => <g key={i} transform={`rotate(${i * 60 + 14 * p}) translate(${radius - 48 * q} 0)`}>
        <path d="M-13-16 9-10 17 0 9 10-13 16-5 0Z" fill={paint.ink} fillOpacity=".77"
          stroke={i % 2 ? paint.metal : paint.light} strokeWidth="3.4" />
      </g>)}
    </>}
    {(motif === "wheel" || motif === "pulseaxe") && <g transform={`rotate(${(fx.beat === 2 ? -1 : 1) * 185 * p})`}>
      <WardStroke d={arc(radius * .89, 7, 139)} color={paint.light} width={3.8} />
      {motif === "pulseaxe" && <path d={arc(radius * .68, 188, 312)} fill="none" stroke={paint.accent} strokeWidth="3.8" />}
    </g>}
    {motif === "roar" && <path d={arc(radius * (.55 + .25 * q), 198, 344)} stroke={paint.accent} strokeWidth="4"
      strokeDasharray="9 6" fill="none" />}
    {motif === "converge" && <path d={arc(radius - 15, 28 + p * 82, 228 + p * 82)} stroke={paint.light} strokeWidth="4.6" fill="none" />}
  </g>
}

function Windup({ shot, layer, battle }: { shot: Shot; layer: Layer; battle: EdgeBattle }) {
  const { fx, beat, motif, paint, p } = shot
  const owner = unitOf(battle, beat.owner)
  const picked = unitOf(battle, fx.target)
  const q = ease(p)
  const bleed = motif === "scar" && fx.beat === 2
  if (bleed) {
    if (!picked?.hp) return null
    return layer === "front" ? <g transform={at(picked)}>
      <path d={`M-39 ${-27 + 8 * q}-29-13-41 1M-31-30-22-18-31-8M-42 16h${14 + 12 * q}`}
        fill="none" stroke={paint.accent} strokeWidth="3.7" />
    </g> : null
  }
  if (!owner?.hp) return null
  const axis = picked?.hp ? direction(owner, picked) : beat.axis
  const core = along(owner, axis, 38 + 11 * q)
  if (layer === "floor") {
    if (motif === "rimrage" && picked?.hp && !isOutside(owner) && isOutside(picked)) {
      const crossing = fieldCrossing(owner, picked)
      return <g opacity={.46 + .34 * q}>
        <path d={path([owner, crossing, picked])} fill="none" stroke={paint.metal} strokeWidth="2.6" strokeDasharray="9 8" />
        <path transform={aligned(crossing, outward(crossing))} d="M-11-24-2-12-11 0-2 12-11 24"
          fill="none" stroke={paint.light} strokeWidth="3" />
      </g>
    }
    if (fx.area && (["redline", "needle", "backedge", "crossfire"].includes(motif))) return <LaneGuide shot={shot} />
    if (motif === "boil" && fx.area && fx.beat === 2) return <WardenOutline area={fx.area} color={paint.accent} fill={.15} />
    if (fx.area && !beat.other) return <RageCircleGuide shot={shot} battle={battle} />
    if (beat.other && edgeDistance(fx.from, beat.other) > 8) return <g opacity={.64}>
      <path d={path([fx.from, beat.other])} stroke={paint.accent} fill="none" strokeWidth="3" strokeDasharray="5 9" />
      <path d="M-22 0 0-18 22 0 0 18Z" transform={at(beat.other)} stroke={paint.metal} strokeWidth="3" fill="none" />
    </g>
    return null
  }
  if (motif === "crossfire") {
    const gap = 84 * (1 - ease((p - .21) / .79))
    return <g transform={at(fx.to) + " translate(0 " + -gap + ")"}>
      {fx.area?.parts.map((part, i) => {
        const lane = wardenStrip(part)
        if (!lane) return null
        return <g key={i} transform={`rotate(${heading(direction(lane.from, lane.to))})`}>
          <Plating d="M-104 0-69-13H70L104 0 70 13H-69Z" paint={warmed(paint, spectrum[i ? 3 : 1])} weight={4.5} fill={.74} />
          <path d="M-73 0H73" stroke={paint.light} strokeWidth="3.2" />
        </g>
      })}
    </g>
  }
  if (motif === "backedge" && fx.beat === 2) {
    const strip = wardenStrip(fx.area?.parts[0])
    return strip ? <Blade d={blades.backedge} where={mix(strip.to, strip.from, p)} axis={direction(strip.to, strip.from)}
      paint={warmed(paint, "#e0b4ff")} size={.84} angle={12 * Math.sin(p * Math.PI)} /> : null
  }
  if (motif === "boil" && fx.beat === 2) return <Blade d={blades.bloodprice} where={core} axis={axis} paint={paint} size={1.1} angle={-60 * (1 - q)} />
  const d = blades[motif as keyof typeof blades]
  if (!d) return null
  const rising = motif === "chop" ? -63 + 54 * q : motif === "hack" ? 43 - 65 * q
    : motif === "bloodprice" ? -94 + 59 * q : motif === "wound" ? 66 - 89 * q
      : motif === "rimrage" ? -57 + 74 * q : motif === "furnace" ? -27 : -28 + 34 * q
  const wounded = motif === "wound" && battle.runtime.histories.get(owner.id)?.wounds.some(({ time }) => battle.time - time <= 4)
  return <>
    {wounded && <g transform={aligned(owner, axis)}>
      <path d="M-42-14-30-22-19-12M-45 10-32 2-23 12" fill="none" stroke={paint.accent} strokeWidth="3.8" />
    </g>}
    <Blade d={d} where={core} axis={axis} paint={paint} angle={rising} size={motif === "furnace" ? .89 + .23 * q : .83 + .17 * q} />
  </>
}

const movingBlades = {
  pounce: "M-26-18H3L29 0 3 18H-26L-7 0Z",
  hookdrop: "M-43-6H-4L9-25 40-18 56 0 37 21 15 23 31 7H4L-6 6H-43Z",
  flank: "M-39 0-11-28 28-19 48 4 26 25 9 19 30 4-4-10Z",
  breach: "M-44-31 20-36 62 0 20 36-44 31-17 0Z",
  crater: "M-47-6H-11L-9-35H26L51-18V18L26 35H-9L-11 6H-47Z",
  wildfire: "M-62-18-27-37 10-18 29-35 65 0 28 27 5 20-35 36-13 5Z",
  frontier: "M-45-45-13-29 16-46 61 0 16 46-13 29-45 45-12 0Z",
  trinity: "M-49-18-10-15 16-32 56 0 16 32-10 15-49 18-24 0Z",
} as const

function Rush({ shot, battle, layer }: { shot: Shot; battle: EdgeBattle; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  const actor = unitOf(battle, beat.owner)
  const d = movingBlades[motif as keyof typeof movingBlades]
  if (!actor?.hp || actor.force?.cause?.id !== fx.cast || !d) return null
  const axis = beat.axis
  const distance = edgeDistance(fx.from, actor)
  const size = motif === "pounce" ? .75 : motif === "trinity" ? .68 + .15 * (fx.beat ?? 1) : 1
  const color = motif === "trinity" ? spectrum[((fx.beat ?? 1) * 2) % spectrum.length] : paint.metal
  if (layer === "front") {
    const lifted = motif === "crater" ? 73 * (1 - p ** 2) : motif === "hookdrop" ? Math.sin(p * Math.PI) * 34 : 0
    const lead = along(actor, axis, motif === "crater" ? 22 : 39)
    return <Blade d={d} where={{ x: lead.x, y: lead.y - lifted }} axis={axis} paint={warmed(paint, color)}
      size={size} angle={motif === "flank" ? 51 - 75 * p : motif === "hookdrop" ? 34 * (1 - p) : 0} />
  }
  const wide = motif === "breach" ? 39 : motif === "frontier" ? 43 : motif === "wildfire" ? 32 : 19
  return <g transform={aligned(fx.from, axis)}>
    {motif === "pounce" ? [.28, .62].map((f, i) => <path key={f}
      transform={`translate(${distance * f} ${i ? -13 : 13})`}
      d="M-13-7 5-9 13 0 5 9-13 7Z" fill={paint.ink} stroke={paint.light} strokeWidth="3.4" />) : <>
      <path d={`M0 0 ${distance} ${-wide}v${wide * 2}Z`} fill={color} fillOpacity=".16" />
      {[-1, 1].map((n) => <WardStroke key={n} color={n === 1 && motif === "frontier" ? spectrum[3] : color}
        width={motif === "frontier" ? 5.4 : 3.9}
        d={motif === "wildfire" ? `M0 0 ${distance * .32} ${n * 24} ${distance * .48} ${n * 13} ${distance} ${n * wide}`
          : motif === "flank" ? `M0 0Q${distance * .56} ${n * 52} ${distance} ${n * 13}`
            : `M0 ${n * 4}L${distance} ${n * wide}`} />)}
      {(motif === "breach" || motif === "frontier" || motif === "wildfire") && <path d={`M0 0H${distance}`}
        stroke={paint.light} strokeWidth="3.4" strokeDasharray={motif === "wildfire" ? "3 12" : undefined} />}
    </>}
    {motif === "crater" && <ellipse cx={distance} rx="49" ry="20" fill={paint.ink} opacity=".63" />}
  </g>
}

function Flakes({ where, shot, reach, angle = 0, count = 5 }: { where: EdgePoint; shot: Shot; reach: number; angle?: number; count?: number }) {
  const { paint, p, fx } = shot
  return <g transform={at(where)}>
    {Array.from({ length: count }, (_, i) => {
      const offset = angle + (i * 360 / count + i % 3 * 11)
      const distance = reach * (.38 + .59 * ease((p - i * .014) * 1.18))
      const color = fx.rarity === "Prismatic" ? spectrum[(i + (fx.beat ?? 1)) % spectrum.length] : i % 2 ? paint.metal : paint.accent
      return <path key={i} transform={`rotate(${offset}) translate(${distance} 0) rotate(${p * (i % 2 ? 31 : -27)})`}
        d={i % 2 ? "M-13-10 12-2-5 12Z" : "M-14-9 7-13 16 0 0 9-10 4Z"}
        fill={color} fillOpacity=".32" stroke={color} strokeWidth="2.7" />
    })}
  </g>
}

function Arrival({ shot }: { shot: Shot }) {
  const { fx, beat, motif, paint, p } = shot
  const q = ease(p)
  if (motif === "crater") return <g transform={aligned(fx.to, beat.axis)}>
    <path d="M-77-18-50-48-19-57 28-48 64-21 70 11 39 39 10 51-37 46-76 19Z"
      fill={paint.ink} fillOpacity=".48" stroke={paint.metal} strokeWidth="4.3" />
    <WardStroke d={`M0 0 31-14 47-11 ${65 + 34 * q}-31M0 0-17 17-13 28 ${-41 - 29 * q} 46M0 0-22-13-42-11-69-25`}
      color={paint.light} width={3.8} />
  </g>
  if (motif === "trinity") {
    const color = spectrum[((fx.beat ?? 1) * 2) % spectrum.length]
    return <g transform={aligned(fx.to, beat.axis)}>
      <path d="M-35 22 6 31 41 8M-26-29 9-36 36-24" fill="none" stroke={color} strokeWidth="3.9" />
      <path d={`M-22 ${39 + 5 * q}H15`} stroke={paint.light} strokeWidth="2.8" strokeDasharray="5 6" />
    </g>
  }
  if (motif === "breach" || motif === "frontier" || motif === "wildfire") {
    const length = edgeDistance(fx.from, fx.to)
    const d = motif === "wildfire" ? `M0 0 ${length * .32} 22 ${length * .47}-18 ${length * .66} 14 ${length} 0`
      : `M0 0H${length}M${length - 22}-31 ${length} 0 ${length - 22} 31`
    return <g transform={aligned(fx.from, beat.axis)}>
      <WardStroke d={d} color={motif === "frontier" ? spectrum[3] : paint.metal} width={motif === "wildfire" ? 6 : 4.7} />
    </g>
  }
  return <g transform={aligned(fx.to, beat.axis)}>
    {motif === "hookdrop" && <path d="M-41-23-23-35-11-19M-41 23-23 35-11 19M35-19 48 0 35 19"
      fill="none" stroke={paint.light} strokeWidth="4" />}
    {motif === "flank" && <WardStroke d="M-45-23-22-33 3-28M-48-5-36-14M16 23 37 7" color={paint.accent} width={4.1} />}
    {motif === "pounce" && <path d="M-37-20-12-27 19-19 29 0 19 19-12 27-37 20-26 0Z"
      stroke={paint.metal} strokeWidth="3.4" fill={paint.ink} fillOpacity=".52" />}
  </g>
}

function ImpactTrail({ shot, contact }: { shot: Shot; contact: Contact }) {
  const { fx, motif, paint, p } = shot
  const { at: from, end } = contact
  if (!end || edgeDistance(from, end) < 3) return null
  const span = edgeDistance(from, end) * (.16 + .84 * ease(p * 2.1))
  const axis = direction(from, end)
  const pull = motif === "hook" || motif === "hookdrop"
  const width = motif === "crater" || motif === "frontier" ? 16 : pull ? 12 : 9
  const jagged = motif === "crater" || motif === "bloodprice" || motif === "fracture"
  const d = jagged ? `M0 0 ${span * .28} -13 ${span * .49} 7 ${span * .66} -4 ${span} 0` : `M0 0H${span}`
  const color = motif === "frontier" ? spectrum[3] : motif === "trinity" ? spectrum[1] : paint.metal
  return <g transform={aligned(from, axis)} fill="none" strokeLinecap="round">
    {pull ? <>
      <path d={`M0 -${width} ${span * .28} -6H${span}M0 ${width} ${span * .28} 6H${span}`}
        stroke={color} strokeWidth="3.7" strokeDasharray={motif === "hook" ? "11 5" : undefined} />
      <path d={`M${span - 8}-14h11v28h-11`} stroke={paint.light} strokeWidth="3.2" />
    </> : <>
      <WardStroke d={d} color={color} width={fx.rarity === "Prismatic" ? 5.1 : motif === "hack" ? 2.9 : 3.8} />
      <path d={`M${span - 14} ${-width} ${span} 0 ${span - 14} ${width}`}
        stroke={paint.light} strokeWidth="3.3" />
      {motif === "hack" && <path d={`M${span * .3} 10H${span * .87}`} stroke={paint.accent} strokeDasharray="7 8" strokeWidth="3" />}
    </>}
  </g>
}

function LaneImpact({ shot }: { shot: Shot }) {
  const { fx, motif, p, paint } = shot
  const q = ease(p)
  return <>{fx.area?.parts.map((part, i) => {
    const lane = wardenStrip(part)
    if (!lane) return null
    const { from, to, length, width } = lane
    const half = width / 2
    const rewind = motif === "backedge" && fx.beat === 2
    const origin = rewind ? to : from
    const axis = rewind ? direction(to, from) : direction(from, to)
    const color = motif === "crossfire" ? spectrum[i ? 3 : 1] : rewind ? "#d9b2ff" : paint.metal
    const peak = motif === "needle" ? .92 : .65
    return <g key={i} transform={aligned(origin, axis)}>
      <path d={`M0 0 ${length * .18} ${-half * .66} ${length * peak} ${-half} ${length} 0 ${length * peak} ${half} ${length * .18} ${half * .66}Z`}
        fill={color} fillOpacity={.25 - .13 * q} stroke={color} strokeWidth={motif === "crossfire" ? 4.9 : 3.2} />
      <WardStroke d={`M3 0H${length}`} color={paint.light} width={motif === "needle" ? 5.2 : motif === "crossfire" ? 6.7 : 4.6} />
      {motif !== "needle" && [1, 2, 3, 4, 5].map((n) => <path key={n}
        transform={`translate(${length * (n / 6)} ${(n % 2 ? -1 : 1) * half * (.48 + .56 * q)})`}
        d={motif === "wildfire" ? "M-21 6-12-7 2 1 16-12 7 13Z" : "M-18-8 15 0-12 11-3 1Z"}
        fill={color} fillOpacity=".29" stroke={color} strokeWidth="3.2" />)}
    </g>
  })}</>
}

function SlashArea({ shot }: { shot: Shot }) {
  const { fx, motif, paint, p } = shot
  const { area } = fx
  if (!area) return null
  if (["redline", "needle", "breach", "wildfire", "frontier", "crossfire", "backedge"].includes(motif)) return <LaneImpact shot={shot} />
  const q = ease(p)
  const second = fx.beat === 2
  if (motif === "boil" && second) {
    const fan = area.parts[0]
    if (fan.kind !== "polygon") return null
    const origin = fan.points[0]
    const envelope = fan.points.map((v) => mix(origin, v, .45 + .55 * q))
    return <g>
      <path d={path(envelope) + "Z"} fill={paint.metal} fillOpacity=".23" stroke={paint.metal} strokeWidth="5.4" />
      <WardStroke d={path(envelope.slice(2, -1))} color={paint.light} width={5.6} />
      {[.49, .73].map((f) => <path key={f} d={path(envelope.slice(3, -2).map((v) => mix(origin, v, f)))}
        fill="none" stroke={paint.accent} strokeWidth="3.1" />)}
    </g>
  }
  return <>{circlesOf(area).map(({ center, radius }, i) => {
    const angle = (second ? -1 : 1) * (26 + 158 * q)
    if (motif === "fracture") return <g key={i}>
      <g transform={at(center)}>
        <circle r={radius * (.68 + .32 * q)} fill={paint.metal} fillOpacity=".13" stroke={paint.metal} strokeWidth="4.2" />
        <path d="M-48 0-22-12-12 5 4-13 24 4 49-7M0 0-16 26-8 44M4-13 19-35 40-43"
          fill="none" stroke={paint.light} strokeWidth="3.6" />
      </g>
      <Flakes where={center} reach={radius} shot={shot} count={6} angle={24} />
    </g>
    if (motif === "wheel" || motif === "pulseaxe") return <g key={i} transform={at(center) + " rotate(" + angle + ")"}>
      <WardStroke d={arc(radius * (.81 + .19 * q), 14, motif === "wheel" ? 246 : 151)}
        color={second ? paint.accent : paint.light} width={motif === "wheel" ? 6.2 : 7.6} />
      <path d={arc(radius * .67, 52, 194)} fill="none" stroke={paint.metal} strokeWidth="4.3" />
      {motif === "pulseaxe" && <WardStroke d={arc(radius * (.74 + .21 * q), 198, 333)} color={paint.light} width={5.4} />}
    </g>
    if (motif === "laststand" || motif === "emberwatch") return <g key={i}>
      <g transform={at(center)}>
        {[0, 1, 2, 3, 4, 5].map((n) => <path key={n} transform={`rotate(${n * 60}) translate(${radius * (.49 + .5 * q)} 0)`}
          d="M-19-28 9-16 17 0 9 16-19 28-4 0Z" fill={paint.metal} fillOpacity=".26"
          stroke={motif === "laststand" ? spectrum[n % spectrum.length] : paint.metal} strokeWidth="4.2" />)}
      </g>
      <Flakes where={center} reach={radius * 1.05} shot={shot} angle={34} />
    </g>
    return <g key={i}>
      <g transform={at(center) + " rotate(" + (motif === "converge" ? -64 + 112 * q : 0) + ")"}>
        <WardStroke d={arc(radius * (.56 + .44 * q), motif === "roar" ? 8 : -113, motif === "converge" ? 197 : 143)}
          color={motif === "boil" ? paint.accent : paint.metal} width={motif === "crater" ? 7 : 5.3} />
        {motif !== "pounce" && <path d={arc(radius * (.46 + .38 * q), 178, 335)}
          fill="none" stroke={paint.light} strokeWidth="3.5" strokeDasharray={motif === "roar" ? "10 6" : undefined} />}
      </g>
      {(motif === "crater" || motif === "boil" || motif === "hookdrop") && <Flakes where={center} reach={radius} shot={shot} angle={13} />}
    </g>
  })}</>
}

const scars: Partial<Record<BerserkerMotif, string>> = {
  chop: "M-49-29-13-14 4 6 35 28M-24-23-13-14-16 1M5 5 20 5 36 15",
  hack: "M-48 21Q-14 8 32 22M-30 29-8 19 29 30",
  answer: "M-54 32-29 4 10-23 40-29M-18 5-2 4 16-13",
  siphon: "M-47-19Q-17-39 18-17 42 6 27 28M-20 27-1 19 11 23",
  scar: "M-36-26-14-15 21-21M-48-7-16 1 29-4M-41 13-13 21 17 16",
  hook: "M-40-24H-13L1-12V13L-15 25H-30L-15 12H-8V-3H-20",
  bloodprice: "M-51-38-13-17-6-1 18 6 34 33M-13-17-8-36M18 6 37-2",
  wound: "M-45-29-15-4-27 8-2 21 26 16 40 30",
  needle: "M-49 0H36M-23-16 9 0-23 16",
  fracture: "M-42-21-19-14-15 3 9-2 34 17M-13 4-27 22",
  flank: "M-31 32Q-19-25 38-23M-44 18Q-27-21-3-20",
  armorbreak: "M-49-32-7-11 12 11 41 28M-29-23-11-31M-9-10 7-16 18-8",
  rimrage: "M-50-18-24-17-13-3H24L45 14M-42 14-26 24-12 11",
  crossfire: "M-45 0H45M0-39V39M-14 14 14-14",
  frontier: "M-50-23-27-7-17-13 14 7 29 1 50 20M-26 12 9 24 38 18",
  furnace: "M-49-23-36-36-17-29M-47 25-30 35-11 28M19-29 37-32 51-16M23 31 40 27 51 12",
}

function ContactFlash({ shot, contact }: { shot: Shot; contact: Contact }) {
  const { fx, beat, motif, paint, p } = shot
  const angle = edgeDistance(fx.from, contact.at) > 3 ? direction(fx.from, contact.at) : beat.axis
  const q = ease(p)
  const spin = motif === "trinity" ? (fx.beat === 2 ? 78 : fx.beat === 3 ? -29 : 25) : 0
  const d = motif === "trinity" ? ["M-48-27-17-8 11 0 47 13", "M-50 26-14 12 16-5 42-28", "M-53-29-14-18 8 1 50 32M-49-13-21-4 4 20 28 24"][(fx.beat ?? 1) - 1]
    : motif === "scar" && fx.beat === 2 ? "M-45-29-20-16-28-1 5 7 18 25M-22-13-11-25M-27-1-45 12M5 7 32 3" : scars[motif]
  const slash = d ?? `M-36 ${-29 - 13 * q}-16-17 9-5 36 11M-28 ${16 + 11 * q}-8 15 8 1`
  const color = motif === "trinity" ? spectrum[((fx.beat ?? 1) * 2) % spectrum.length]
    : motif === "crossfire" ? contact.bonus ? paint.light : spectrum[3] : paint.metal
  return <g transform={aligned(contact.at, angle) + " rotate(" + spin + ")"}>
    <WardStroke d={slash} color={color} width={motif === "trinity" && fx.beat === 3 ? 6.8 : contact.bonus ? 5.8 : 4} />
    {contact.bonus && <path d={motif === "crossfire" ? "M-27-18-16-30 0-17 16-30 27-18 15 0 27 18 16 30 0 17-16 30-27 18-15 0Z"
      : "M-42-12-23-21-5-8 13-15 33-3"} fill="none" stroke={paint.accent} strokeWidth="4.4" />}
    {motif === "furnace" && <path d={arc(40 + 24 * q, 15, 165) + arc(40 + 24 * q, 192, 339)}
      fill="none" stroke={paint.light} strokeWidth="4.9" />}
  </g>
}

function RimSplit({ shot, spot }: { shot: Shot; spot: EdgePoint }) {
  const { motif, paint, p } = shot
  const q = ease(p)
  const length = 44 + 40 * q
  const color = motif === "frontier" ? spectrum[3] : paint.accent
  return <g transform={aligned(spot, outward(spot))}>
    <WardStroke d={`M0 ${-length}V-17L-8-4 8 4 0 17V${length}`} color={color} width={motif === "frontier" ? 6.4 : 4.1} />
    <path d={`M-17 ${-length * .7}-9-14-21 0-9 14-17 ${length * .7}M14-22 24 0 14 22`}
      fill="none" stroke={paint.light} strokeWidth="3.7" />
  </g>
}

function TrinityEcho({ shot, contact }: { shot: Shot; contact: Contact }) {
  const { fx, beat, paint, p } = shot
  const strike = fx.beat ?? 1
  const q = ease(p)
  const where = contact.at
  const gap = Math.min(82, edgeDistance(fx.from, where))
  const axis = gap > 3 ? direction(fx.from, where) : beat.axis
  const color = spectrum[(strike * 2) % spectrum.length]
  return <g transform={aligned(where, axis)}>
    {strike === 1 && <path d={`M${-gap} 13Q-29-16 ${24 + 12 * q} -21Q2-9 ${-gap} 13Z`}
      fill={color} fillOpacity=".34" stroke={color} strokeWidth="2.6" />}
    {strike === 2 && <>
      <WardStroke d={`M${-gap} -13Q-19 37 ${30 + 16 * q} 23`} color={color} width={5.2} />
      <path d="M-29 33Q-2 43 34 19" fill="none" stroke={paint.light} strokeWidth="2.8" />
    </>}
    {strike === 3 && <>
      <path d={`M${-gap - 18} -34Q-8-46 ${51 + 32 * q} 10Q34 51 -33 63Q1 32 2 6Z`}
        fill={color} fillOpacity=".26" stroke={color} strokeWidth="4.6" />
      <WardStroke d={`M${-gap} -33Q4-34 ${54 + 24 * q} 12M${40 + 18 * q} 25Q20 51 -26 58`}
        color={paint.light} width={7.3} />
    </>}
  </g>
}

function Strike({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  const paths = beat.paths ?? []
  if (layer === "floor") return <>
    {beat.kind !== "force" || !["needle", "fracture"].includes(motif) ? <SlashArea shot={shot} /> : null}
    {paths.map((contact, i) => <ImpactTrail key={i} shot={shot} contact={contact} />)}
    {motif === "trinity" && paths[0] && <TrinityEcho shot={shot} contact={paths[0]} />}
    {motif === "rimrage" && paths[0] && !isOutside(fx.from) && isOutside(paths[0].at) &&
      <RimSplit shot={shot} spot={fieldCrossing(fx.from, paths[0].at)} />}
  </>
  return <>
    {paths.map((contact, i) => <ContactFlash key={i} shot={shot} contact={contact} />)}
    {motif === "trinity" && paths[0] && p < .67 && <Blade d={movingBlades.trinity} where={along(fx.from, beat.axis, 43)}
      axis={beat.axis} paint={warmed(paint, spectrum[((fx.beat ?? 1) * 2) % spectrum.length])}
      size={(fx.beat === 3 ? 1.31 : fx.beat === 2 ? .92 : .74) * (1 - .29 * p)} angle={-44 + 108 * ease(p * 2.1)} />}
    {motif === "trinity" && fx.beat === 3 && paths[0] && <Flakes where={paths[0].at} shot={shot} reach={81} count={6} angle={18} />}
    {motif === "furnace" && paths[0] && <Flakes where={paths[0].at} shot={shot} reach={89} count={8} angle={11} />}
    {motif === "crossfire" && paths.some(({ bonus }) => bonus) && <Flakes where={fx.to} shot={shot} reach={73} count={8} />}
  </>
}

function Fireball({ shot, battle, layer }: { shot: Shot; battle: EdgeBattle; layer: Layer }) {
  const { fx, p, paint } = shot
  const picked = unitOf(battle, fx.target)
  if (!picked?.hp) return null
  const to = edgeDistance(fx.from, picked) <= 390 ? picked : along(fx.from, direction(fx.from, picked), 390)
  const atFlight = (t: number) => {
    const line = mix(fx.from, to, t)
    return { x: line.x, y: line.y - Math.sin(t * Math.PI) * 77 }
  }
  const here = atFlight(p)
  if (layer === "floor") {
    const ground = mix(fx.from, to, p)
    return <g transform={at(ground)}>
      <ellipse rx={22 + p * 8} ry="12" fill={paint.ink} opacity=".65" />
      <path d="M-19 2Q0-10 19 2" fill="none" stroke={paint.metal} strokeWidth="2.8" />
    </g>
  }
  const prior = atFlight(Math.max(0, p - .18))
  const axis = direction(prior, here)
  return <>
    <WardStroke d={path([prior, atFlight(Math.max(0, p - .10)), here])} color="#ffa175" width={9.2} />
    <Blade d={blades.furnace} where={here} axis={axis} paint={warmed(paint, "#ff9978")} size={.86 + .24 * Math.sin(p * Math.PI)} />
    <path transform={aligned(here, axis)} d="M-13 0 4-17 28-8 31 6 12 19-7 13Z"
      fill={paint.light} fillOpacity=".38" stroke={paint.light} strokeWidth="3.8" />
  </>
}

function LifeReturn({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  const q = ease(p * 1.5)
  if (layer === "floor") {
    const paths = motif === "frontier" ? [fx.from] : beat.paths?.length ? beat.paths.map(({ at }) => at) : [fx.from]
    return <>{paths.map((from, i) => {
      const distance = edgeDistance(from, fx.to)
      if (distance < 13) return null
      const axis = direction(from, fx.to)
      const elbow = along(mix(from, fx.to, .51), left(axis), (i % 2 ? 1 : -1) * Math.min(37, distance * .21))
      const end = mix(from, fx.to, q)
      const steer = mix(from, elbow, q)
      return <g key={i}>
        <WardStroke d={`M${from.x} ${from.y}Q${steer.x} ${steer.y} ${end.x} ${end.y}`}
          color={motif === "furnace" ? "#ffc38e" : motif === "trinity" ? spectrum[((fx.beat ?? 1) * 2) % spectrum.length] : paint.accent}
          width={motif === "furnace" ? 5.8 : motif === "converge" ? 4.6 : 3.4} />
        <path transform={aligned(end, axis)} d={motif === "roar" ? "M-12-7H2L9 0 2 7H-12Z" : "M-12 0 0-8 12 0 0 8Z"}
          fill={paint.light} fillOpacity=".42" stroke={paint.light} strokeWidth="2.5" />
      </g>
    })}</>
  }
  const rise = 13 * q
  const width = 27 + (motif === "triage" ? 23 : 15) * q
  return <g transform={at(fx.to)} fill="none" strokeLinecap="round">
    <path d={motif === "triage" ? `M${-width} 44h16v-7h16v-7h16v-7h15`
      : motif === "grit" ? `M-41 35-20 23 2 43 26 ${32 - rise} 43 24`
        : `M${-width} 37-16 ${45 - rise} 2 ${37 - rise} 19 ${44 - rise} ${width} 34`}
      stroke={paint.accent} strokeWidth={fx.rarity === "Prismatic" ? 4.4 : 3.4} />
    <path d={`M-18 ${45 - rise}v-7M0 ${43 - rise}v-8M18 ${45 - rise}v-7`} stroke={paint.light} strokeWidth="3.2" />
  </g>
}

const seals = {
  answer: "M-25 12-10-8-1 1 13-15 25-10 9 12H-25Z",
  numb: "M-17 12v-13l10-12h14l10 12v13H-17ZM-7 2H7",
  shoulder: "M-24-14H-6L0 0 6-14H24V11L0 20-24 11Z",
  triage: "M-24 9H-11L-3 0-11-9H-24M3-15 21-9 27 0 21 9 3 15 12 0Z",
  grit: "M-22-16-8-19 22 13 8 18ZM22-16 8-19-22 13-8 18Z",
  boil: "M-25 16-16-12-4-4 7-22 16-7 27 16 9 7 0 20-11 7Z",
  emberwatch: "M-26 13-17-13-7 1 3-18 10-2 18-14 27 13Z",
  laststand: "M-28 14V-7l13-13 15 11 15-11 13 13v21H-28ZM-16 7H16",
} as const

function Readied({ shot }: { shot: Shot }) {
  const { fx, motif, paint, p } = shot
  const d = seals[motif as keyof typeof seals]
  if (!d) return null
  const rise = 8 * (1 - ease(p))
  return <g transform={`translate(${fx.to.x} ${fx.to.y + 45 + rise})`}>
    <Plating d={d} paint={paint} fill={.71} weight={motif === "laststand" ? 4.6 : 3.4} />
  </g>
}

function GuardMoment({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  const q = ease(p)
  if (layer === "floor") {
    if (beat.cue === "save") return <g transform={at(fx.to)}>
      {[0, 1, 2, 3].map((i) => <path key={i} transform={`rotate(${i * 90 + 45}) translate(${51 + 23 * q} 0)`}
        d="M-15-21H0L19 0 0 21H-15L-3 0Z" fill={paint.metal} fillOpacity=".23" stroke={spectrum[i]} strokeWidth="4.7" />)}
      <WardStroke d="M-56 46H56M-56 46v-12M56 46v-12" color={paint.light} width={5.1} />
    </g>
    return beat.cue === "strip" ? <Flakes where={fx.to} reach={73} count={7} shot={shot} angle={17} /> : null
  }
  if (beat.cue === "save") return <g transform={at(fx.to)}>
    <path d={`M${-60 - 12 * q} 20-36-9-27-44M${60 + 12 * q} 20 36-9 27-44`}
      fill="none" stroke={paint.light} strokeWidth="6.4" />
    <WardStroke d="M-27 38-13 50H13L27 38" color={spectrum[3]} width={4.7} />
  </g>
  if (beat.cue === "guard") return <g transform={aligned(fx.to, beat.axis)}>
    <Plating d={`M${-61 - 12 * q}-33-35-17-23 0-35 17 ${-61 - 12 * q} 33-50 0Z`} paint={paint} weight={4.3} fill={.79} />
    <path d="M-46-17-31 17M-46 17-31-17" stroke={paint.light} strokeWidth="3.6" />
  </g>
  if (beat.cue === "strip") return <g transform={aligned(fx.to, beat.axis)}>
    <WardStroke d="M-40-42-21-28-34-8-14 7-24 32M22-39 11-22 27-13M39 17 15 25 24 42"
      color={paint.accent} width={4.8} />
  </g>
  return <g transform={at(fx.to)}>
    <Plating d={motif === "furnace" ? "M-47 23-36-19-18-33-5-18M47 23 36-19 18-33 5-18"
      : "M-43-26-33-38-19-25V21L-32 32-43 20ZM43-26 33-38 19-25V21L32 32 43 20Z"}
      paint={paint} weight={motif === "furnace" ? 5 : 3.6} fill={.29} />
    {motif === "furnace" && <path d={arc(47 + 12 * q, 28, 151)} fill="none" stroke="#ffc590" strokeWidth="5.2" />}
  </g>
}

function Cash({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  if (layer === "floor") return <>
    {beat.paths?.map((contact, i) => <ImpactTrail key={i} shot={shot} contact={contact} />)}
    {motif === "numb" && <WardStroke d={path([fx.from, mix(fx.from, fx.to, .52), fx.to])}
      color={paint.accent} width={3.7} />}
  </>
  const q = ease(p)
  const d = motif === "numb" ? "M-32-18-21-12-28-5-16-3M-28 14-14 6-7 12"
    : motif === "triage" ? "M-34-26-19-12-31 0-17 12-34 26M-20-8-7 0-20 8"
      : "M-41-23-22-18-12 0-22 18-41 23-27 0Z"
  return <g transform={aligned(along(fx.to, beat.axis, 13 * q), beat.axis)}>
    <WardStroke d={d} color={paint.light} width={4.2} />
  </g>
}

function RageReadiness({ battle }: { battle: EdgeBattle }) {
  if (battle.finishedAt !== null) return null
  const marks = new Map<string, { unit: EdgePoint; paint: ArmorPaint; d: string; until: number }>()
  for (const state of [...battle.runtime.buffs, ...battle.runtime.watches.filter((watch) => watch.uses > 0)]) {
    if (state.cast.signature || state.until <= battle.time) continue
    const motif = berserkerChoreography(state.cast.skill?.id)?.motif
    if (!motif) continue
    const d = seals[motif as keyof typeof seals]
    if (!d) continue
    const owner = battleFighters(battle).find(({ id }) => id === state.cast.owner)
    const wearer = unitOf(battle, state.target)
    if (!owner?.hp || !wearer?.hp) continue
    marks.set(motif + "/" + wearer.id, { unit: wearer, paint: hotPaint[owner.card.rarity], d, until: state.until })
  }
  return <>{[...marks].map(([key, { unit: wearer, paint, d, until }]) =>
    <g key={key} data-berserker-ready={key.split("/")[0]} transform={`translate(${wearer.x - 46} ${wearer.y + 28}) scale(.56)`}
      opacity={.84 * unit((until - battle.time) / .25)}>
      <Plating d={d} paint={paint} weight={3.4} fill={.9} />
    </g>)}</>
}

function BerserkerArt({ shot, battle, layer }: { shot: Shot; battle: EdgeBattle; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  switch (beat.cue) {
    case "prepare": return <Windup shot={shot} battle={battle} layer={layer} />
    case "travel": return <Rush shot={shot} battle={battle} layer={layer} />
    case "flight": return <Fireball shot={shot} battle={battle} layer={layer} />
    case "arrival": return layer === "floor" ? <Arrival shot={shot} /> : null
    case "strike": return <Strike shot={shot} layer={layer} />
    case "heal": return <LifeReturn shot={shot} layer={layer} />
    case "arm": return layer === "front" ? <Readied shot={shot} /> : null
    case "guard": case "strip": case "shield": case "save": return <GuardMoment shot={shot} layer={layer} />
    case "cash": return <Cash shot={shot} layer={layer} />
    case "boundary": return layer === "floor" ? <RimSplit shot={shot} spot={fx.to} /> : <Flakes where={fx.to} shot={shot} reach={82} count={7} />
    case "cost":
      return layer === "front" ? <g transform={aligned(fx.to, direction(fx.to, fx.from))}>
        <path d={`M-39 35H-12L0 ${21 - 14 * ease(p)} 12 35H39M-18 42H18`} stroke={paint.accent} fill="none" strokeWidth="4.2" />
        <path d="M-6 30 0 18 6 30 0 38Z" fill={motif === "bloodprice" ? paint.metal : paint.accent} stroke={paint.light} strokeWidth="2.8" />
      </g> : null
  }
}

export function EdgeBerserkerEffects({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g className="edge-skill-vfx" aria-hidden="true">
    {layer === "front" && <RageReadiness battle={battle} />}
    {battle.runtime.effects.map((fx) => {
      const beat = fx.berserker
      if (!beat || battle.time < fx.start || battle.time >= fx.end) return null
      const art = berserkerChoreography(fx.skill)
      if (!art) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const opacity = ["prepare", "travel", "flight"].includes(beat.cue) ? 1 : (1 - unit((p - .14) / .86)) ** 1.25
      return <g key={fx.id} data-berserker-cue={beat.cue} data-berserker-motif={art.motif} opacity={opacity}>
        <BerserkerArt shot={{ fx, beat, motif: art.motif, paint: hotPaint[fx.rarity], p }} battle={battle} layer={layer} />
      </g>
    })}
  </g>
}
