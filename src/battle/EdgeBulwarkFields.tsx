import type { Rarity } from "@/card/types"

import type { EdgeBattle, EdgePoint, EdgeUnit } from "./edgeBattle"
import { along, areaPath, clamp, direction, edgeDistance, left, rotate, type EdgeArea } from "./edgeSkills/geometry"
import { bulwarkChoreography } from "./edgeSkills/bulwarkChoreo"
import { battleFighters, unitOf, type FieldEffect } from "./edgeSkills/state"

export const armorPaint: Record<Rarity, { light: string; metal: string; accent: string; ink: string }> = {
  C: { light: "#fff2ef", metal: "#cfbfd0", accent: "#ffd0a7", ink: "#382735" },
  UC: { light: "#eaf8ff", metal: "#82c9f5", accent: "#b6b7ff", ink: "#253252" },
  R: { light: "#faf2ff", metal: "#a5a9ff", accent: "#82e0ff", ink: "#302444" },
  E: { light: "#fff2ff", metal: "#d0a2ff", accent: "#ff93c9", ink: "#3f254b" },
  L: { light: "#fff5d5", metal: "#ffc879", accent: "#ffb0a6", ink: "#4c3034" },
  Radiant: { light: "#fff4f6", metal: "#ffaddb", accent: "#ffe0aa", ink: "#4b2540" },
  Prismatic: { light: "#fff7ee", metal: "#f4bdff", accent: "#a6e8ff", ink: "#362643" },
}
export type ArmorPaint = (typeof armorPaint)[Rarity]

const zero = { x: 0, y: 0 }
const right = { x: 1, y: 0 }
export const spectrum = ["#ffd8a1", "#ffa9d5", "#ddbcff", "#a8e5ff", "#f4d8ff"]
export const at = ({ x, y }: EdgePoint) => "translate(" + x + " " + y + ")"
export const path = (points: readonly EdgePoint[]) => "M" + points.map(({ x, y }) => x + " " + y).join("L")
export const heading = ({ x, y }: EdgePoint) => Math.atan2(y, x) * 180 / Math.PI
export const mix = (a: EdgePoint, b: EdgePoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const polar = (radius: number, angle: number) => along(zero, rotate(right, angle), radius)
export const unit = (n: number) => clamp(n, 0, 1)
export const ease = (n: number) => 1 - (1 - unit(n)) ** 3

export function arc(radius: number, start: number, end: number) {
  const a = polar(radius, start)
  const b = polar(radius, end)
  return "M" + a.x + " " + a.y + "A" + radius + " " + radius + " 0 " + (end - start > 180 ? 1 : 0) + " 1 " + b.x + " " + b.y
}

function sector(radius: number, width: number, start: number, size: number) {
  const a = polar(radius - width, start + 3)
  const b = polar(radius - width, start + size - 3)
  return arc(radius, start, start + size) + "L" + b.x + " " + b.y +
    "A" + (radius - width) + " " + (radius - width) + " 0 0 0 " + a.x + " " + a.y + "Z"
}

export const circlesOf = (area?: EdgeArea) => area?.parts.flatMap((part) => part.kind === "circle" ? [part] : []) ?? []
export function lineOf(area?: EdgeArea) {
  const shape = area?.parts[0]
  if (shape?.kind !== "polygon" || shape.points.length !== 4) return
  const [a, b, c, d] = shape.points
  return { from: mix(a, b, .5), to: mix(c, d, .5), width: edgeDistance(a, b), points: shape.points }
}

export function Plating({ d, paint, weight = 3, fill = .28 }: { d: string; paint: ArmorPaint; weight?: number; fill?: number }) {
  return <g strokeLinejoin="round" strokeLinecap="round">
    <path d={d} fill={paint.ink} fillOpacity={fill} stroke={paint.metal} strokeWidth={weight * 2.45} strokeOpacity=".24" />
    <path d={d} fill="none" stroke={paint.metal} strokeWidth={weight} />
    <path d={d} fill="none" stroke={paint.light} strokeWidth={Math.max(.8, weight * .36)} />
  </g>
}

export function Lash({ from, to, paint, style = "strap", width = 3, strength = .76 }: {
  from: EdgePoint; to: EdgePoint; paint: ArmorPaint; style?: "strap" | "cable" | "chain" | "wire"; width?: number; strength?: number
}) {
  const vector = direction(from, to)
  const across = left(vector)
  const length = edgeDistance(from, to)
  if (length < 21) return null
  const padding = Math.min(32, length * .24)
  const start = along(from, vector, padding)
  const end = along(to, vector, -padding)
  const mid = mix(start, end, .5)
  const elbow = along(mix(start, end, .38), across, Math.min(25, length * .12))
  const d = path(style === "strap" ? [start, elbow, end] : [start, end])
  return <g opacity={strength} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={paint.ink} strokeWidth={width + 4} opacity=".7" />
    <path d={d} stroke={paint.metal} strokeWidth={width} strokeDasharray={style === "chain" ? "16 9" : undefined} />
    {style === "cable" && <path d={path([along(start, across, 5), along(end, across, 5)])} stroke={paint.accent} strokeWidth="1.7" />}
    {style === "wire" && <path d={path([start, end])} stroke={paint.light} strokeWidth="1" strokeDasharray="3 18" />}
    <path d="M-9 0-4-7H4L9 0 4 7H-4Z" transform={at(style === "strap" ? elbow : mid) + " rotate(" + heading(vector) + ")"}
      stroke={paint.light} fill={paint.ink} strokeWidth="1.7" />
  </g>
}

export function WallRibs({ area, paint, progress = 1, fractured = false }: {
  area?: EdgeArea; paint: ArmorPaint; progress?: number; fractured?: boolean
}) {
  const line = lineOf(area)
  if (!line) return null
  const span = edgeDistance(line.from, line.to)
  const crest = (n: number) => (n % 2 ? 1 : -1) * Math.min(14, line.width * .22)
  return <g transform={at(line.from) + " rotate(" + heading(direction(line.from, line.to)) + ")"} fill="none">
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const lift = ease((progress - i * .066) / .58)
      const x = span * i / 6
      const w = span / 6 - 2
      const y = crest(i)
      return <g key={i} opacity={lift * (fractured ? .46 : 1)} transform={"translate(" + x + " " + ((1 - lift) * 15) + ")"}>
        <path d={`M0 ${y - 10}L${w * .58} ${y - 17} ${w} ${-y - 9}V${-y + 8}L${w * .62} ${y + 9} 0 ${y + 10}Z`}
          fill={spectrum[i % spectrum.length]} fillOpacity=".21" stroke={spectrum[i % spectrum.length]} strokeWidth="2.4" />
        <path d={`M0 ${y}L${w * .57} ${y - 4} ${w} ${-y}`} stroke={paint.light} strokeWidth="2.3" />
      </g>
    })}
  </g>
}

export function BulwarkField({ field, battle, rarity }: { field: FieldEffect; battle: EdgeBattle; rarity: Rarity }) {
  const motif = bulwarkChoreography(field.cast.skill?.id)?.motif
  if (!motif || battle.finishedAt !== null || field.until <= battle.time) return null
  const paint = armorPaint[rarity]
  const age = battle.time - field.time
  const appear = ease(age / .48 + .14)
  const remaining = unit((field.until - battle.time) / .48)
  const [circle, other] = circlesOf(field.area)
  const owner = unitOf(battle, field.cast.owner)
  const r = circle?.radius ?? 1
  const budget = field.step.operations.find((op) => op.kind === "wall")?.args[0]
  const fraction = field.mode === "guard" && owner && budget ? unit(field.capacity / (owner.maxHp * budget / 100)) : 1
  return <g data-bulwark-field={motif} data-guard-ratio={field.mode === "guard" ? fraction.toFixed(3) : undefined}
    opacity={remaining} pointerEvents="none">
    <path d={areaPath(field.area)} fill={paint.metal} fillOpacity={motif === "citadel" ? ".048" : ".032"}
      stroke={paint.metal} strokeOpacity=".59" strokeWidth="2.8" strokeDasharray={motif === "citadel" ? undefined : "13 8"} />
    {circle && <g transform={at(circle.center)}>
      {motif === "stakes" && Array.from({ length: 12 }, (_, i) =>
        <path key={i} transform={`rotate(${i * 30}) translate(${r} 0)`} d="M3-6 8 0 3 6-14 0Z"
          fill={paint.ink} stroke={paint.accent} opacity={unit(appear * 1.9 - i * .05)} strokeWidth="2.4" />)}
      {motif === "portal" && [-90, 30, 150].map((angle) =>
        <g key={angle} transform={`rotate(${angle}) translate(${r - 1} 0)`} opacity={appear}>
          <path d="M-7-29H7L15-19V-9H7v18h8v10L7 29H-7M2-18V18" fill="none" stroke={paint.metal} strokeWidth="3.5" />
          <path d="M-13-15 0 0-13 15" fill="none" stroke={paint.accent} strokeWidth="2.3" />
        </g>)}
      {motif === "rampart" && Array.from({ length: 10 }, (_, i) =>
        <path key={i} transform={`rotate(${i * 36}) translate(${r - 3} 0)`}
          d="M-9-19H6v7h8v9H6v6h8v9H6v7H-9Z" fill={paint.metal} fillOpacity=".17"
          stroke={paint.accent} strokeWidth="2" opacity={unit(appear * 1.5 - i * .06)} />)}
      {motif === "phalanx" && <g transform={owner?.move ? "rotate(" + (heading(direction(owner, owner.move)) + 90) + ")" : undefined}>
        {[-166, -127, -88, -49, -10].map((a) =>
          <path key={a} d={sector(r, 15, a - 14, 28)} fill={paint.metal} fillOpacity=".21" stroke={paint.accent} strokeWidth="2.9" opacity={appear} />)}
        <path d={arc(r - 18, 33, 139)} fill="none" stroke={paint.metal} strokeDasharray="24 11" strokeWidth="3.2" />
      </g>}
      {motif === "shoulders" && [-90, 30, 150].map((angle, i) =>
        <g key={angle} transform={`rotate(${angle}) translate(${r - 5} 0)`}>
          <path d="M-13-30 5-27 15-14 10 14 4 27-13 31-4 7-4-7Z" fill={paint.ink} fillOpacity=".46"
            stroke={i === 1 ? paint.accent : paint.metal} strokeWidth="2.8" opacity={appear} />
          <path d="M1-20 8-9 2 11-2 18" fill="none" stroke={paint.light} strokeWidth="1.6" />
        </g>)}
      {motif === "citadel" && Array.from({ length: 12 }, (_, i) => {
        const a = -90 + i * 30
        const life = unit(fraction * 12 - i)
        const built = ease(age / .32 - i * .047 + .12)
        return <g key={i} transform={`rotate(${a}) translate(${r - 4} 0)`} opacity={built * (.17 + life * .83)} data-citadel-sector={life > 0 ? "lit" : "spent"}>
          <path d={i === 3 || i === 9 ? "M-14-41 5-37 14-25V25L5 37-14 41-6 17-6-17Z"
            : "M-22-39 5-35 5-24 16-24 16-11 5-11 5 11 16 11 16 24 5 24 5 35-22 39Z"}
            fill={life > 0 ? spectrum[i % spectrum.length] : paint.ink} fillOpacity={life > 0 ? .24 + life * .22 : .10}
            stroke={life > 0 ? paint.light : paint.metal} strokeWidth={i % 3 === 0 ? 5.2 : 3.8} />
          <path d={i === 3 || i === 9 ? "M-13-31H8m-16 8H12m-22 46H12m-25 8H8M-19-14-5-9V9l-14 5"
            : "M-12-34V-13M-12 13V34M-16-9l13 9-13 9"} fill="none"
            stroke={spectrum[(i + 3) % spectrum.length]} strokeWidth="3.9" />
        </g>
      })}
    </g>}
    {motif === "bastions" && [circle, other].map((part, i) => part && <g key={i} transform={at(part.center)} opacity={appear}>
      {[37, 127, 217, 307].map((a) =>
        <path key={a} d={sector(part.radius, 18, a - 14, 28)} fill={spectrum[(i + a) % spectrum.length]}
          fillOpacity=".26" stroke={i ? paint.accent : paint.light} strokeWidth="3" />)}
      <path d={arc(part.radius - 24, i ? 100 : -80, i ? 260 : 80)} fill="none" stroke={paint.accent}
        strokeWidth="1.8" strokeDasharray="10 8" />
    </g>)}
    {motif === "seawall" && <WallRibs area={field.area} paint={paint} progress={appear} />}
  </g>
}

function Knuckle({ unit: target, paint, d, width = 2.8 }: { unit: EdgeUnit; paint: ArmorPaint; d: string; width?: number }) {
  return <g transform={at(target)} fill="none" strokeLinejoin="round" strokeLinecap="round">
    <path d={d} stroke={paint.ink} strokeWidth={width + 4} />
    <path d={d} stroke={paint.metal} strokeWidth={width} />
  </g>
}

export function EdgeBulwarkReadiness({ battle }: { battle: EdgeBattle }) {
  if (battle.finishedAt !== null) return null
  return <g aria-hidden="true" pointerEvents="none">
    {[...battle.runtime.shieldCasts].map(([id, cast]) => {
      const motif = !cast.signature && bulwarkChoreography(cast.skill?.id)?.motif
      const target = unitOf(battle, id)
      const owner = battleFighters(battle).find((member) => member.id === cast.owner)
      if (!motif || !target?.hp || !target.shield || target.shieldUntil <= battle.time || !owner) return null
      const paint = armorPaint[owner.card.rarity]
      const charge = unit(target.shield / (cast.trace.get(id)?.shieldValue ?? target.shield))
      if (motif !== "lockplate" && motif !== "cracked" && motif !== "shore" && motif !== "spareplate") return null
      const seams = motif === "cracked" ? "M-34-45-11-53 1-41 21-53 36-42" : motif === "shore"
        ? "M-42-19-48 0-39 20M42-19 48 0 39 20" : "M-37-43-25-49H25l12 6"
      return <g key={id} data-bulwark-held={motif} opacity={.4 + charge * .58}>
        <Knuckle unit={target} paint={paint} d={seams} />
        {(motif === "lockplate" || motif === "cracked") && <g transform={at(target)} fill="none" stroke={paint.accent}>
          <path d={`M-28-48h${56 * charge}`} strokeWidth="3.4" />
          {charge < .75 && <path d={motif === "cracked" ? "M-9-52-13-45-2-47-7-38" : "M10-51 4-46 10-43 6-37"}
            strokeWidth="1.9" />}
        </g>}
      </g>
    })}
    {battle.runtime.buffs.map((buff) => {
      const motif = !buff.cast.signature && bulwarkChoreography(buff.cast.skill?.id)?.motif
      const target = unitOf(battle, buff.target)
      const owner = battleFighters(battle).find((member) => member.id === buff.cast.owner)
      if (!motif || !target?.hp || buff.until <= battle.time || !owner) return null
      const paint = armorPaint[owner.card.rarity]
      const key = buff.cast.id + ":" + buff.target + ":" + buff.kind
      if (buff.kind === "split" && owner.hp) return <g key={key} data-bulwark-held={motif}>
        <Lash from={owner} to={target} paint={paint} style={motif === "accord" ? "wire" : motif === "bracewire" ? "cable" : "strap"} />
      </g>
      if (buff.kind === "taunt" && owner.hp) return <g key={key} data-bulwark-held={motif} opacity=".65">
        <Lash from={target} to={owner} paint={{ ...paint, metal: "#fa8ebc" }} style="wire" width={1.9} />
        <Knuckle unit={target} paint={paint} d="M-14-43 0-50 14-43" width={2.5} />
      </g>
      const notch = buff.kind === "weak" && motif === "seal" ? "M-46-27v29l11 8m81-37v29l-11 8"
        : buff.kind === "anti" && motif === "twochocks" ? (buff.values[2] ?? 1) > 1
          ? "M-43 24l-9 15h17ZM43 24l-9 15h17Z" : "M43 24l-9 15h17Z"
        : buff.kind === "anti" && motif === "wedges" ? "M-51 16l-10 16h18ZM51 16l-10 16h18Z"
        : buff.kind === "anti" && motif === "axle" ? "M-36 36q36 22 72 0m-36 7v14"
        : buff.kind === "anti" && motif === "island" ? "M-40 20-46 31-31 44M40 20l6 11-15 13"
        : buff.kind === "guard" && motif === "pauldron" ? "M27-44h16l10 13v22"
        : buff.kind === "guard" && motif === "rampart" ? "M-30-39h13v-8h14v8H10v-8h14v8h9"
        : buff.kind === "res" && motif === "mantle" ? "M-39-29-47-12v25l8 14M39-29l8 17v25l-8 14"
        : undefined
      return notch && <g key={key} data-bulwark-held={motif}><Knuckle unit={target} paint={paint} d={notch} /></g>
    })}
    {battle.runtime.watches.map((watch) => {
      const motif = !watch.cast.signature && bulwarkChoreography(watch.cast.skill?.id)?.motif
      const target = unitOf(battle, watch.target)
      const owner = battleFighters(battle).find((member) => member.id === watch.cast.owner)
      if (!motif || !target?.hp || !owner || watch.until <= battle.time || !watch.uses) return null
      const paint = armorPaint[owner.card.rarity]
      const key = watch.cast.id + ":" + watch.target + ":" + watch.rule.event
      if (motif === "twinhull" && target.id === owner.id && !watch.cast.used.has("watch/break")) {
        const partner = unitOf(battle, watch.cast.target)
        if (!partner?.hp || [owner, partner].every((card) => battle.runtime.shieldCasts.get(card.id) !== watch.cast || !card.shield)) return null
        return <g key={key} data-bulwark-held={motif}><Lash from={owner} to={partner} paint={paint} style="cable" width={2.6} /></g>
      }
      const shape = motif === "barbs" ? watch.uses > 1 ? "M-43-14l-10-17 20 6m76 11 10-17-20 6" : "M43-14l10-17-20 6"
        : motif === "wake" ? "M-43 24-54 31-39 43M43 24l11 7-15 12" : undefined
      return shape && <g key={key} data-bulwark-held={motif}><Knuckle unit={target} paint={paint} d={shape} /></g>
    })}
  </g>
}
