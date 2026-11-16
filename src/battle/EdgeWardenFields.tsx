import type { Rarity } from "@/card/types"

import type { EdgeBattle } from "./edgeBattle"
import { arc, armorPaint, at, ease, heading, mix, Plating, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { areaPath, direction, edgeDistance, type AreaPart, type EdgeArea } from "./edgeSkills/geometry"
import { battleFighters, unitOf, type FieldEffect } from "./edgeSkills/state"
import { wardenChoreography } from "./edgeSkills/wardenChoreo"

export function wardenStrip(part?: AreaPart) {
  if (part?.kind !== "polygon" || part.points.length !== 4) return
  const [a, b, c, d] = part.points
  const from = mix(a, d, .5)
  const to = mix(b, c, .5)
  return { from, to, length: edgeDistance(from, to), width: edgeDistance(a, d) }
}

export function WardStroke({ d, color, width = 3 }: { d: string; color: string; width?: number }) {
  return <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} strokeWidth={width * 3.4} strokeOpacity=".14" />
    <path d={d} strokeWidth={width} />
  </g>
}

export function WardenOutline({ area, color, fill = .07 }: { area: EdgeArea; color: string; fill?: number }) {
  return <g fill={color} stroke={color} fillOpacity={fill} strokeWidth="2.4" strokeLinejoin="round">
    {area.parts.map((part, i) => <path key={i} fillRule="evenodd" d={areaPath({ center: area.center, parts: [part] })} />)}
  </g>
}

function ClosingRails({ field, paint }: { field: FieldEffect; paint: ArmorPaint }) {
  return field.area.parts.map((part, side) => {
    const strip = wardenStrip(part)
    if (!strip) return null
    const { from, to, length, width } = strip
    const sign = side ? 1 : -1
    const y = width * .5 * sign
    const color = side ? spectrum[3] : spectrum[1]
    const joint = length / 6
    return <g key={side} transform={at(from) + " rotate(" + heading(direction(from, to)) + ")"} data-warden-rail={side}>
      <path d={`M0 ${-y}H${length}V${y}H0Z`} fill={color} fillOpacity=".22" stroke={color} strokeWidth="2" />
      <WardStroke d={`M16 ${y}H${length - 16}`} color={color} width={5} />
      {[0, 1, 2, 3, 4, 5].map((i) => <g key={i} transform={`translate(${(i + .5) * joint} 0)`}>
        <path d={`M-16 ${-y * .48}L0 ${y * .38} 16 ${-y * .48}`} fill="none" stroke={paint.light} strokeWidth="3" />
        <path d={`M${joint / 2} ${-y * .85}v${y * 1.55}`} stroke={color} strokeWidth="2" opacity=".7" />
      </g>)}
    </g>
  })
}

export function EdgeWardenField({ field, battle, rarity }: { field: FieldEffect; battle: EdgeBattle; rarity: Rarity }) {
  const motif = wardenChoreography(field.cast.skill?.id)?.motif
  const paint = armorPaint[rarity]
  const age = battle.time - field.time
  const rise = ease(age / .24)
  const fade = unit((field.until - battle.time) / .34)
  const part = field.area.parts[0]
  if (!motif || !part) return null
  if (motif === "pincer") return <g data-warden-field={motif} opacity={.72 + .28 * rise}>
    <ClosingRails field={field} paint={paint} />
  </g>
  if (motif === "gate") {
    const strip = wardenStrip(part)
    if (!strip) return null
    const { from, to, length, width } = strip
    const half = width * .5
    return <g data-warden-field={motif} opacity={fade}>
      <WardenOutline area={field.area} color={paint.metal} />
      <g transform={at(from) + " rotate(" + heading(direction(from, to)) + ")"}>
        <path d={`M0 0H${length}`} stroke={paint.accent} strokeOpacity=".6" strokeWidth="2" strokeDasharray="6 10" />
        {[0, 1, 2, 3, 4].map((i) => {
          const slot = length / 5
          const span = slot * .43
          const set = ease((age - i * .04) / .18)
          return <g key={i} opacity={set} transform={`translate(${slot * (i + .5)} ${(1 - set) * half})`}>
            <Plating paint={paint} d={`M${-span} ${half - 3}v-14L${span} ${-half + 3}v14Z`} weight={2.6} fill={.75} />
          </g>
        })}
      </g>
    </g>
  }
  if (part.kind !== "circle") return null
  const { center, radius } = part
  return <g data-warden-field={motif} transform={at(center)} opacity={fade * (.55 + .45 * rise)}>
    {motif === "beacon" && <>
      <circle r={radius} fill={paint.ink} fillOpacity=".25" stroke={paint.metal} strokeWidth="2.6" />
      {[30, 150, 270].map((angle, i) => <g key={angle} transform={`rotate(${angle}) translate(${radius} 0)`}>
        <Plating d="M-12 14v-28H-3L8 0-3 14Z" paint={paint} weight={3} fill={.9} />
        <path d="M-12-7H0M-12 0H4M-12 7H0" stroke={paint.accent} strokeWidth="2" opacity={.55 + .45 * Math.sin(age * 3 - i) ** 2} />
      </g>)}
      <path d="M-10 0 0-10 10 0 0 10Z" fill="none" stroke={paint.accent} strokeWidth="2.3" />
    </>}
    {motif === "advance" && <>
      <circle r={radius} fill={paint.metal} fillOpacity=".1" stroke={paint.metal} strokeWidth="2" strokeDasharray="8 6" />
      <g transform={`rotate(${heading(direction(field.cast.from, field.cast.aim))})`}>
        <Plating paint={paint} d="M-58-42-36-58H-17V58H-36L-58 42Z" weight={4} fill={.82} />
        <Plating paint={paint} d="M-9-48 15-32 26 0 15 32-9 48Z" weight={3.5} fill={.6} />
        <path d="M-44-31H-24M-44 0H14M-44 31H-24" stroke={paint.light} strokeWidth="2.4" />
      </g>
    </>}
    {motif === "tripwire" && <>
      <circle r={radius} fill={paint.ink} fillOpacity=".22" stroke={paint.accent} strokeWidth="2.8" strokeDasharray="4 10" />
      {[0, 120, 240].map((angle, i) => <g key={angle} transform={`rotate(${angle + 24}) translate(${radius * .76} 0)`}>
        <path d="M18 0 6-11H-17V11H6Z" fill={paint.ink} stroke={paint.accent} strokeWidth="2.8" />
        <path d={`M-17 0H${8 * ease(age * 2 - i * .15)}`} stroke={paint.light} strokeWidth="2.4" />
      </g>)}
      <path d="M-30-19H30L0 34Z" fill="none" stroke={paint.metal} strokeWidth="2.5" />
    </>}
    {motif === "boundary" && <>
      <circle r={radius} fill={paint.metal} fillOpacity=".075" />
      {Array.from({ length: 8 }, (_, i) => <g key={i} opacity={.45 + .55 * ease(age * 5 - i * .085)}>
        <WardStroke d={arc(radius, i * 45 + 4, i * 45 + 38)} color={spectrum[i % spectrum.length]} width={4} />
        <path transform={`rotate(${i * 45}) translate(${radius - 8} 0)`} d="M-11-11H5L13 0 5 11H-11"
          fill="none" stroke={paint.light} strokeWidth="2.3" />
      </g>)}
    </>}
  </g>
}

export function EdgeWardenReadiness({ battle }: { battle: EdgeBattle }) {
  const states = [...battle.runtime.buffs, ...battle.runtime.watches.filter(({ uses }) => uses > 0)]
  const shown = new Set<string>()
  const markers = []
  for (const state of states) {
    const id = state.cast.skill?.id
    const motif = !state.cast.signature && wardenChoreography(id)?.motif
    const kind = "kind" in state ? state.kind : "watch"
    if (state.until <= battle.time || !motif) continue
    const wearer = unitOf(battle, state.target)
    const owner = battleFighters(battle).find(({ id }) => id === state.cast.owner)
    if (!wearer?.hp || !owner) continue
    const key = state.target + "/" + motif
    if (shown.has(key)) continue
    const paint = armorPaint[owner.card.rarity]
    let d: string
    if (kind === "anti" && motif === "rearhook") d = "M-28 33H-17L-9 44H9L17 33H28"
    else if (kind === "guard" && motif === "sling") d = "M-32-18-42-7V17L-30 25M32-18 42-7V17L30 25"
    else if (kind === "exguard" && motif === "ricochet") d = "M-40-14v-17h17M23-31h17v17M-40 14v17h17M23 31h17V14"
    else if (kind === "watch" && motif === "relay") d = "M-20 36-13 45H-2L3 39H16L23 31"
    else if (kind === "slow" && motif === "spear") d = "M-19 32-29 43M0 32-10 43M19 32 9 43"
    else if (kind === "slow" && motif === "twinlane") d = "M-28 36H28M-23 31v14M0 31v14M23 31v14"
    else continue
    shown.add(key)
    markers.push(<g key={key} data-warden-ready={motif} transform={at(wearer)} opacity={.86 * unit((state.until - battle.time) / .24)}>
      <WardStroke d={d} color={motif === "twinlane" ? "#a2edff" : paint.accent} width={2.8} />
    </g>)
  }
  return <g className="edge-skill-vfx" aria-hidden="true">{markers}</g>
}
