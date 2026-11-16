import type { EdgeBattle, EdgePoint, EdgeUnitId } from "./edgeBattle"
import { FIELD, along, areaPath, direction, edgeDistance, left, outward } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { bulwarkTraitReadiness } from "./edgeSkills/runtime"
import { bulwarkTraitArt, type ArmorGesture } from "./edgeSkills/bulwarkTraits"
import type { FieldEffect } from "./edgeSkills/state"
import { Lash, Plating, arc, armorPaint, at, circlesOf, ease, heading, mix, path, polar, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"

type ArmorView = {
  fx: SkillVisual
  beat: NonNullable<SkillVisual["passive"]>
  d: string
  gesture: ArmorGesture
  paint: ArmorPaint
  p: number
}

function Line({ d, paint, width = 3, dash, fade = 1 }: { d: string; paint: ArmorPaint; width?: number; dash?: string; fade?: number }) {
  return <g fill="none" opacity={fade} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={paint.metal} strokeWidth={width * 2.6} opacity=".19" />
    <path d={d} stroke={paint.metal} strokeWidth={width} strokeDasharray={dash} />
    <path d={d} stroke={paint.light} strokeWidth={Math.max(1, width * .30)} strokeDasharray={dash} opacity=".87" />
  </g>
}

function PlateAt({ d, to, paint, p, axis, size = 1 }: { d: string; to: EdgePoint; paint: ArmorPaint; p: number; axis?: EdgePoint; size?: number }) {
  return <g transform={at(to) + " rotate(" + (axis ? heading(axis) : 0) + ") scale(" + (size * (.86 + .27 * ease(p))) + ")"}>
    <Plating d={d} paint={paint} weight={3.1} fill={.44} />
  </g>
}

function Crosspiece({ from, to, paint, p, bend = 12 }: { from: EdgePoint; to: EdgePoint; paint: ArmorPaint; p: number; bend?: number }) {
  const length = edgeDistance(from, to)
  if (length < 30) return null
  const axis = direction(from, to)
  const a = along(from, axis, Math.min(26, length * .24))
  const b = along(to, axis, -Math.min(22, length * .21))
  const elbow = along(mix(a, b, .57), left(axis), Math.min(bend, length * .17))
  const tip = p < .44 ? mix(a, elbow, ease(p / .44)) : mix(elbow, b, ease((p - .44) / .37))
  const corner = p < .44 ? tip : elbow
  return <g>
    <Line d={path([a, elbow, b])} paint={paint} width={1.7} dash="8 6" fade={.6} />
    <Line d={path([a, corner, tip])} paint={paint} width={3.6} />
    <path d="M-12 0-5-6H3L10 0 3 6H-5Z" transform={at(tip) + " rotate(" + heading(axis) + ")"}
      fill={paint.accent} stroke={paint.light} strokeWidth="1.7" />
  </g>
}

function Rails({ from, to, paint, p, fork = false }: { from: EdgePoint; to: EdgePoint; paint: ArmorPaint; p: number; fork?: boolean }) {
  const n = edgeDistance(from, to)
  if (n < 3) return null
  return <g transform={at(from) + " rotate(" + heading(direction(from, to)) + ")"} opacity={.76 + .24 * (1 - p)}>
    <Line d={`M8-11 ${n * .63}-5 ${n} 0 ${n * .63} 5 8 11`} paint={paint} width={fork ? 3.9 : 2.9} />
    <path d={`M${n - 16}-14l16 14-16 14`} stroke={paint.accent} strokeWidth="3.1" fill="none" />
  </g>
}

function Impulses({ view, fork }: { view: ArmorView; fork?: boolean }) {
  const { fx, beat, paint, p } = view
  const end = beat.landing
  const paths = (fx.contacts ?? []).flatMap((at, i) => beat.landings?.[i] ? [{ at, end: beat.landings[i]! }] : [])
  if (!paths.length && end) paths.push({ at: beat.trigger ?? fx.to, end })
  return paths.map(({ at: start, end: landing }, i) => <Rails key={i} from={start} to={landing} paint={paint} p={p} fork={fork} />)
}

function rimCrossing(from: EdgePoint, to: EdgePoint) {
  const end = { x: to.x - from.x, y: to.y - from.y }
  const x = end.x === 0 ? Infinity : ((end.x < 0 ? FIELD.left : FIELD.right) - from.x) / end.x
  const y = end.y === 0 ? Infinity : ((end.y < 0 ? FIELD.top : FIELD.bottom) - from.y) / end.y
  return mix(from, to, unit(Math.min(x, y)))
}

function Rivets({ to, radius, count, paint, p, offset = 0 }: { to: EdgePoint; radius: number; count: number; paint: ArmorPaint; p: number; offset?: number }) {
  return <g transform={at(to)}>
    {Array.from({ length: count }, (_, i) => {
      const angle = offset + i * 360 / count
      return <path key={i} transform={`rotate(${angle}) translate(${radius + ease(p) * (14 + i % 3 * 5)} 0)`}
        d={i % 2 ? "M-3-4 12-2 9 5-6 6Z" : "M-5-3 8-6 14 0 1 5Z"}
        fill={i % 2 ? paint.metal : paint.accent} fillOpacity=".64" stroke={paint.light} strokeWidth="1.7"
        opacity={unit(1 - p * 1.04 + i * .011)} />
    })}
  </g>
}

function TraitMotion({ view }: { view: ArmorView }) {
  const { fx, beat, gesture, d, p, paint } = view
  const used = beat.mode === "consume"
  const steady = beat.mode === "stance"
  const point = beat.receiver
  const source = beat.anchor ?? fx.from
  const origin = steady ? fx.from : source
  const aim = direction(origin, fx.to)
  const edge = beat.landing ?? beat.landings?.find(Boolean)
  const size = fx.rarity === "Prismatic" ? 1.19 : fx.rarity === "Radiant" || fx.rarity === "L" ? 1.08 : .94
  const stamp = (to: EdgePoint, axis?: EdgePoint, scale = size) => <PlateAt to={to} d={d} paint={paint} p={p} axis={axis} size={scale} />

  switch (gesture) {
    case "shard": return <>
      <Crosspiece from={origin} to={point} paint={paint} p={p} bend={-20} />
      <Rivets to={point} radius={29} count={6} p={p} paint={paint} offset={17} />
      {stamp(point, aim)}
    </>
    case "brake": return <>
      <Impulses view={view} />
      <g transform={at(along(point, aim, -24 + 19 * ease(p))) + " rotate(" + heading(aim) + ")"}>
        <Line d="M-34-29-15-18-27-8M-34 29-15 18-27 8M-9-16V16" paint={paint} width={3.3} />
      </g>
      {stamp(edge ?? point, edge ? direction(point, edge) : aim, size * .86)}
    </>
    case "yoke": {
      const partners = beat.partners?.length ? beat.partners : [beat.owner]
      return <>
        {partners.filter((partner) => edgeDistance(partner, point) > 29).map((partner, i) =>
          <Lash key={i} from={partner} to={point} paint={paint} style={i ? "wire" : "cable"} width={2.3} strength={.52} />)}
        <Impulses view={view} />
        {stamp({ x: point.x, y: point.y + 28 }, edge ? direction(point, edge) : undefined)}
        <g transform={at(point)}><Line d="M-43-24l-7 20 7 17M43-24l7 20-7 17" paint={paint} width={2.8} /></g>
      </>
    }
    case "forge": return <>
      <Crosspiece from={origin} to={point} paint={paint} p={p} />
      {[-1, 1].map((side) => <g key={side} transform={at(point) + ` translate(${side * (45 - ease(p) * 16)} -13) scale(${side} 1)`}>
        <Line d="M-17-12 4-21 14-6 4 12-12 7" paint={paint} width={3.3} />
      </g>)}
      {stamp({ x: point.x, y: point.y - 18 })}
    </>
    case "stitch": return <>
      <Crosspiece from={origin} to={point} paint={paint} p={p} bend={-14} />
      <g transform={at(point)}>
        <Line d={`M-32 32q32 ${-37 * ease(p)} 64-12M-20 16v13m20-18v13m20-15v11`} paint={paint} width={2.4} />
      </g>
      {stamp({ x: point.x, y: point.y + 21 }, undefined, size * .79)}
    </>
    case "measure": return <>
      {used || fx.skill === "bulwark/Radiant/P7" ? <Crosspiece from={fx.from} to={fx.to} paint={paint} p={p} bend={0} /> : null}
      <Impulses view={view} />
      {stamp(used ? fx.to : point, used ? direction(fx.from, fx.to) : undefined)}
      <g transform={at(used ? fx.to : point)}>
        <Line d="M-37 34h74m-58-5v10m21-12v14m21-12v10" paint={paint} width={2.6} />
      </g>
    </>
    case "track": {
      const tail = used ? fx.from : origin
      const land = edge ?? fx.to
      const border = fx.skill === "bulwark/Prismatic/P6" && edge ? rimCrossing(point, edge) : undefined
      return <>
        <Rails from={border ?? tail} to={land} paint={paint} p={p} />
        {border && <g transform={at(border) + " rotate(" + (heading(outward(border)) + 90) + ")"}>
          <Line d="M-58 0h116M-42-8l9 8-9 8m84-16-9 8 9 8" paint={paint} width={3.1} />
        </g>}
        {stamp(land, direction(border ?? tail, land))}
      </>
    }
    case "stamp": return <>
      <Crosspiece from={origin} to={point} paint={paint} p={p} bend={11} />
      <g transform={at({ x: point.x, y: point.y + 24 })}>
        <Line d={arc(40 + ease(p) * 18, 16, 171)} paint={paint} width={3.2} dash={steady ? "8 6" : undefined} />
      </g>
      {stamp(point)}
    </>
    case "bastion": return <>
      <Crosspiece from={origin} to={point} paint={paint} p={p} bend={18} />
      <g transform={at(point)}>
        <Line d={arc(46 + ease(p) * 20, -153, -28) + "M-44 25l10 13m78-13-10 13"} paint={paint} width={3.9} />
      </g>
      {stamp(point)}
      {(fx.contacts ?? []).filter((target) => edgeDistance(target, point) > 3).map((target, i) => <g key={i}>{stamp(target, direction(origin, target), size * .78)}</g>)}
    </>
    case "fuse": return <>
      <Crosspiece from={origin} to={point} paint={paint} p={p} bend={-16} />
      <Rivets to={point} radius={35} count={fx.rarity === "Prismatic" ? 8 : 5} p={p} paint={paint} offset={-40} />
      {stamp({ x: point.x, y: point.y - 14 })}
    </>
  }
}

function GoldenMotion({ view }: { view: ArmorView }) {
  const { fx, beat, d, p, paint } = view
  const origin = beat.anchor ?? fx.from
  const target = beat.receiver
  const used = beat.mode === "consume"
  const directionTo = direction(origin, fx.to)
  const points = fx.contacts?.length ? fx.contacts : [target]
  const [circle] = circlesOf(fx.area)
  const base = circle?.center ?? target
  const mark = (to: EdgePoint, axis?: EdgePoint, size = 1.11) => <PlateAt d={d} to={to} paint={paint} p={p} axis={axis} size={size} />
  const castName = fx.skill.slice("bulwark/".length)
  switch (castName) {
    case "C/G1": return <>
      <g transform={at(base)}>
        <Line d={arc(40 + 55 * ease(p), 10, 162) + arc(40 + 55 * ease(p), 192, 350)} paint={paint} width={3.8} />
      </g>
      <Rivets to={base} radius={44} count={9} p={p} paint={paint} offset={14} />
      <Impulses view={view} fork />
      {points.map((point, i) => <g key={i}>{mark(point, direction(base, point), .86)}</g>)}
    </>
    case "C/G2": return <>
      <Lash from={beat.owner} to={target} paint={paint} style="strap" strength={.69} />
      <g transform={at(target)}>
        {[-1, 1].map((sign) => <g key={sign} transform={`translate(${sign * (48 - ease(p) * 18)} -8) scale(${sign} 1)`}>
          <Plating d="M-21-30 3-35 13-22 7 12-10 23-23 5Z M-14-17 6-23" paint={paint} weight={3.3} />
        </g>)}
      </g>
      {mark({ x: target.x, y: target.y + 16 }, undefined, .86)}
    </>
    case "UC/G1": return <>
      {!used && <Crosspiece from={beat.owner} to={target} paint={paint} p={p} bend={-25} />}
      {used && <Impulses view={view} />}
      <g transform={at(target) + " rotate(" + (used ? heading(direction(fx.from, target)) : 0) + ")"}>
        <Line d="M-47 32-26 11-16 30M47 32 26 11 16 30M-16 22H16" paint={paint} width={4.2} />
      </g>
      {mark(beat.landing ?? target, undefined, used ? .93 : 1.06)}
    </>
    case "UC/G2": return <>
      <Lash from={beat.owner} to={target} paint={paint} style="cable" width={3.8} />
      <g transform={at(target)}>
        {[-1, 1].map((sign) => <g key={sign} transform={`translate(${sign * 37} 0) rotate(${sign * (26 - 34 * ease(p))}) scale(${sign} 1)`}>
          <Plating d="M-15-24 3-29 22-9 12 22-12 18-7 2Z M-8 8 13-5" paint={paint} weight={3.4} />
        </g>)}
      </g>
      {mark(target, undefined, .92)}
    </>
    case "R/G1": {
      const center = mix(origin, target, .46)
      return <>
        <Crosspiece from={origin} to={target} paint={paint} p={p} bend={-34} />
        <g transform={at(center) + " rotate(" + heading(directionTo) + ")"}>
          <Line d="M-27-11-17 9-7-10 3 10 13-10 23 9 31-10" paint={paint} width={3.2} />
        </g>
        <Rivets to={target} radius={31} count={5} p={p} paint={paint} offset={-31} />
        {mark(target)}
      </>
    }
    case "R/G2": {
      const land = beat.landing ?? target
      return <>
        {beat.trigger && <Rails from={beat.trigger} to={land} paint={paint} p={p} />}
        <g transform={at(land) + " rotate(" + (heading(outward(land)) + 90) + ")"}>
          <Line d="M-55 32H55M-43 32V2l7-14 7 14v30M29 32V2l7-14 7 14v30" paint={paint} width={3.4} />
        </g>
        {mark(land)}
      </>
    }
    case "E/G1": return <>
      <g transform={at(base)}>
        <Line d={arc(22 + 63 * ease(p), -145, 168)} paint={paint} width={6.2} />
        <Line d={arc(16 + 62 * ease(p), -115, 174)} paint={paint} width={2.8} dash="13 7" />
        <path d="M-38-51-18-28M38-51 18-28" stroke={paint.accent} strokeWidth="4.2" />
      </g>
      {points.map((point, i) => <g key={i}>{mark(point, undefined, .82)}</g>)}
    </>
    case "E/G2": return <>
      <Impulses view={view} />
      <g transform={at(target)}>
        {[-1, 1].map((sign) => <g key={sign} transform={`translate(${sign * (38 + (used ? -12 : 14) * ease(p))} -6) scale(${sign} 1)`}>
          <Plating d="M-17 29V-20l13-12h21v61ZM-8-14H7v31H-8Z" paint={paint} weight={3.4} />
        </g>)}
      </g>
      {mark(beat.landing ?? target, undefined, .91)}
    </>
    case "L/G1": return <>
      {used && <Impulses view={view} fork />}
      <g transform={at(fx.area?.center ?? fx.to)}>
        <Line d={arc((used ? 55 : 40) + 29 * ease(p), -160, -24) + arc((used ? 55 : 40) + 29 * ease(p), 25, 151)}
          paint={paint} width={4.8} dash={used ? undefined : "13 6"} />
      </g>
      {mark(used ? fx.to : target, used ? direction(fx.from, fx.to) : undefined, 1.11)}
    </>
    case "L/G2": return <>
      <Crosspiece from={origin} to={fx.to} paint={paint} p={p} bend={29} />
      {beat.landing && <Rails from={fx.to} to={beat.landing} paint={paint} p={p} fork />}
      {mark(beat.landing ?? fx.to, beat.landing ? direction(fx.to, beat.landing) : directionTo)}
    </>
    case "Radiant/G1": return <>
      {circle && <g transform={at(circle.center)}>
        <Line d={arc(circle.radius, -149 + p * 32, -46 + p * 32) + arc(circle.radius - 13, 10, 147)} paint={paint} width={4.2} />
      </g>}
      {mark(target, undefined, 1.23)}
    </>
    case "Radiant/G2": return <>
      {(used || fx.contacts?.length) && <g transform={at(beat.trigger ?? target) + " rotate(" + (heading(outward(beat.trigger ?? target)) + 90) + ")"}>
        <Line d="M-76 8-43-4-24 8-6-10 15 6 37-5 74 8M-51 23H51" paint={paint} width={4.8} />
      </g>}
      {points.map((point, i) => <g key={i}><Crosspiece from={beat.trigger ?? origin} to={point} paint={paint} p={p} bend={22} />{mark(point, undefined, 1.03)}</g>)}
    </>
    case "Prismatic/G1": return <>
      <g transform={at(base)}>
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={arc(48 + ease(p) * 41, i * 72 - 43, i * 72 + 24)}
          fill="none" stroke={spectrum[i]} strokeWidth={6 - p * 2} />)}
      </g>
      <Rivets to={base} radius={63} count={10} p={p} paint={paint} offset={18} />
      <Impulses view={view} fork />
      {points.map((point, i) => <g key={i}>{mark(point, direction(base, point), .94)}</g>)}
    </>
    case "Prismatic/G2": return <>
      {circle && <g transform={at(circle.center)}>
        {[0, 1, 2, 3].map((i) => <path key={i} d={arc(circle.radius - 16 + ease(p) * 16, i * 90 - 36, i * 90 + 27)}
          stroke={spectrum[i + 1]} fill="none" strokeWidth="5.4" />)}
      </g>}
      <Impulses view={view} />
      {mark(target, undefined, 1.2)}
    </>
  }
}

export function BulwarkTraitField({ field, battle }: { field: FieldEffect; battle: EdgeBattle }) {
  const id = field.cast.signature?.id
  const art = bulwarkTraitArt(id)
  if (!id || !art || field.until <= battle.time || battle.finishedAt !== null) return null
  const shared = id === "bulwark/Prismatic/G2"
  const paint = armorPaint[shared ? "Prismatic" : "Radiant"]
  const twin = shared && battle.runtime.fields.find((item) => item.id > field.id && item.cast.id === field.cast.id &&
    item.cast.signature?.id === id && item.until > battle.time)
  const fade = unit((field.until - battle.time) * 3.3)
  return <g data-bulwark-trait-field={id} opacity={fade} pointerEvents="none">
    {twin && <Lash from={field.area.center} to={twin.area.center} paint={paint} style="wire" width={2.6} strength={.52} />}
    <path d={areaPath(field.area)} fill={paint.metal} fillOpacity=".045" stroke={paint.metal} strokeDasharray="9 7" strokeWidth="2.8" />
    {circlesOf(field.area).map(({ center, radius }, index) => <g key={index} transform={at(center)}>
      {(shared ? [-140, -50, 40, 130] : [-115, 5, 125]).map((a, i) =>
        <path key={a} d={arc(radius - 1, a - 23, a + 23)} stroke={shared ? spectrum[i] : paint.accent} fill="none" strokeWidth="4.2" />)}
      <g transform={at(polar(radius - 4, -92)) + " scale(.55)"}>
        <Plating d={art.path} paint={paint} weight={3.8} />
      </g>
    </g>)}
  </g>
}

export function EdgeBulwarkTraits({ battle }: { battle: EdgeBattle }) {
  const seats = new Map<EdgeUnitId, number>()
  return <g aria-hidden="true" pointerEvents="none">
    {bulwarkTraitReadiness(battle).map(({ id, unit, until, kind, anchor, partners }) => {
      const art = bulwarkTraitArt(id)!
      const [, rarity] = id.split("/")
      const paint = armorPaint[rarity as SkillVisual["rarity"]]
      const opacity = until === undefined ? .69 : Math.max(.16, Math.min(.86, (until - battle.time) * 2.3))
      const index = seats.get(unit.id) ?? 0
      seats.set(unit.id, index + 1)
      const seat = { x: unit.x - 46 - Math.floor(index / 3) * 16, y: unit.y + 27 - (index % 3) * 19 }
      return <g key={id + ":" + unit.id} data-bulwark-trait-ready={id} data-trait-kind={kind} opacity={opacity}>
        {(partners ?? (anchor ? [anchor] : [])).filter((point) => edgeDistance(unit, point) > 23).map((point, index) =>
          <Lash key={index} from={point} to={unit} paint={paint} style="wire" width={1.75} strength={.53} />)}
        <PlateAt d={art.path} to={seat} paint={paint} p={.74} size={id.includes("/G") ? .52 : .44} />
      </g>
    })}
    {battle.runtime.effects.map((fx) => {
      const art = fx.passive && bulwarkTraitArt(fx.skill)
      if (!fx.passive || !art || battle.time < fx.start || battle.time >= fx.end) return null
      if (fx.skill === "bulwark/L/G2" && !fx.passive.landing) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const paint = armorPaint[fx.rarity]
      const view = { fx, beat: fx.passive, d: art.path, gesture: art.gesture, p, paint }
      return <g key={fx.id} data-bulwark-trait={fx.skill} data-armor-beat={fx.passive.mode} opacity={1 - p ** 1.22}>
        {fx.gold ? <GoldenMotion view={view} /> : <TraitMotion view={view} />}
      </g>
    })}
  </g>
}
