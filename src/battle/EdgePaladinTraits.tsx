import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, circlesOf, ease, heading, mix, path, Plating, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { WardStroke, wardenStrip } from "./EdgeWardenFields"
import { along, direction, edgeDistance, left, outward } from "./edgeSkills/geometry"
import { paladinTraitArt } from "./edgeSkills/paladinTraits"
import type { SkillVisual } from "./edgeSkills/presentation"
import { paladinTraitReadiness } from "./edgeSkills/runtime"
import { unitOf, type FieldEffect } from "./edgeSkills/state"

type Layer = "floor" | "front"
type Art = NonNullable<ReturnType<typeof paladinTraitArt>>
type View = { fx: SkillVisual; beat: NonNullable<SkillVisual["passive"]>; art: Art; paint: ArmorPaint; p: number }

const colors: Record<Rarity, ArmorPaint> = {
  C: { light: "#fffdf0", metal: "#ead6b5", accent: "#ffe6a2", ink: "#382938" },
  UC: { light: "#f2ffff", metal: "#9ed8e8", accent: "#8ad9ec", ink: "#263748" },
  R: { light: "#fff4db", metal: "#ffc191", accent: "#ff9f80", ink: "#482f3a" },
  E: { light: "#f8eeff", metal: "#cdacff", accent: "#f7aade", ink: "#49334e" },
  L: { light: "#fff7d7", metal: "#ffd07d", accent: "#ffb568", ink: "#4e3336" },
  Radiant: { light: "#fff4e9", metal: "#ffc2d7", accent: "#ffaeab", ink: "#493049" },
  Prismatic: { light: "#fffaf1", metal: "#c6ccff", accent: "#a6e4ff", ink: "#39364f" },
}
const up = { x: 0, y: -1 }
const right = { x: 1, y: 0 }
const facing = (a: EdgePoint, b: EdgePoint, fallback = right) => edgeDistance(a, b) > 3 ? direction(a, b) : fallback
const pose = (point: EdgePoint, axis: EdgePoint, tilt = 0) => at(point) + " rotate(" + (heading(axis) + tilt) + ")"

function thread(view: View, from: EdgePoint, to: EdgePoint, bend: number, offset = 0) {
  const gap = edgeDistance(from, to)
  if (gap < 9) return null
  const q = ease(view.p * 1.35)
  return <g transform={pose(from, direction(from, to))}>
    <path d={`M0 ${offset}Q${gap * .54} ${bend} ${gap} ${offset}`} pathLength="1" fill="none" stroke={view.paint.metal}
      strokeWidth={view.fx.gold ? 4 : 2.7} strokeDasharray={q + " 1"} />
    <path d="M-11-4 0-8 9-3 0 4Z" transform={`translate(${gap * q} ${offset + bend * 2 * q * (1 - q)})`}
      fill={view.paint.light} opacity={1 - unit((view.p - .56) / .38)} />
  </g>
}

function Ground({ view }: { view: View }) {
  const { fx, beat, art, paint, p } = view
  const q = ease(p)
  const anchor = fx.from
  const to = fx.to
  const axis = facing(anchor, to)
  const marks = fx.contacts?.length ? fx.contacts : [to]
  const routes = marks.map((mark, i) => ({ from: mark, end: beat.landings?.[i] ?? beat.landing }))
  switch (art.gesture) {
    case "wick": return <>{marks.map((mark, i) => <g key={i}>
      {thread(view, anchor, mark, -18 - art.sweep / 3)}
      <path d={arc(22 + 23 * q, 16, 160)} transform={at(mark)} stroke={paint.accent} strokeWidth="2.6" fill="none" />
    </g>)}</>
    case "brace": return <>{routes.map(({ from, end }, i) => {
      const front = end ? facing(from, end, axis) : axis
      return <g key={i} transform={pose(from, front)} opacity=".79">
        <WardStroke d={`M-42 ${-37 - 7 * q}H-19L-7 -20M-42 ${37 + 7 * q}H-19L-7 20`} color={paint.metal} width={3.1} />
        {end && <path d={`M0-11H${edgeDistance(from, end)}M0 11H${edgeDistance(from, end)}`}
          fill="none" stroke={paint.accent} strokeWidth="2" strokeDasharray="8 7" />}
      </g>
    })}</>
    case "hinge": return <>{routes.map(({ from, end }, i) => <g key={i}>
      {thread(view, anchor, from, art.sweep / 2, -6)}
      {end && thread(view, from, end, 9, 9)}
      <path transform={pose(from, facing(anchor, from), 9 * q)} d={`M-38-17H-22L-12 0-22 17H-38M38-17H22L12 0 22 17H38`}
        fill="none" stroke={paint.metal} strokeWidth="2.9" strokeDasharray={`${4 + 8 * q} 5`} />
    </g>)}</>
    case "seal": return <>{thread(view, anchor, to, -19)}
      <path transform={pose(to, axis, art.sweep * q)} d={arc(39 + 7 * q, -95, 72) + arc(39 + 7 * q, 85, 251)}
        fill="none" stroke={paint.accent} strokeWidth="3.3" strokeDasharray="10 7" />
    </>
    case "flag": return <>{thread(view, anchor, to, 19)}
      <path transform={pose(to, axis)} d={`M-33 30H7L${25 + 14 * q} 16M-20 24H-2M-5 37H21`}
        fill="none" stroke={paint.metal} strokeWidth="3" />
    </>
    case "prayer": return <>{marks.map((mark, i) => <g key={i}>
      {thread(view, anchor, mark, art.sweep * .36, 5)}
      <path transform={at(mark)} d={arc(23 + q * 29, -25, 101) + arc(23 + q * 29, 126, 218)}
        fill="none" stroke={paint.accent} strokeWidth="2.6" />
    </g>)}</>
    case "step": {
      const gap = edgeDistance(anchor, to)
      const count = Math.min(6, Math.ceil(gap / 32))
      return <>{Array.from({ length: count }, (_, i) => {
        const place = along(mix(anchor, to, (i + .46) / count), left(axis), i % 2 ? 9 : -9)
        return <path key={i} transform={pose(place, axis, i % 2 ? 9 : -9)} d="M-9-6H5L11 0 5 6H-9L-12 0Z"
          fill={paint.ink} fillOpacity=".57" stroke={paint.metal} strokeWidth="2.1" opacity={unit((q - i / count) * 4)} />
      })}</>
    }
    case "link": return <>{(beat.partners?.length ? beat.partners : [anchor]).map((partner, i) => <g key={i}>
      {thread(view, partner, to, 10 + i * 6, 6)}
      <path d={path([along(partner, up, -28), along(to, up, -28)])} fill="none" stroke={paint.accent}
        strokeWidth="2.3" strokeDasharray="4 7" />
    </g>)}</>
    case "wing": return <>{thread(view, anchor, to, -22, -4)}
      <g transform={pose(to, axis)}>
        <path d={`M0 0Q-29 -18 ${-34 - q * 21} ${-31 - q * 11}Q-11 -39 14 -25M0 0Q-29 18 ${-34 - q * 21} ${31 + q * 11}Q-11 39 14 25`}
          fill="none" stroke={paint.metal} strokeWidth="3" />
      </g>
    </>
    case "mirror": {
      const other = beat.landing && edgeDistance(beat.landing, to) > 7 ? beat.landing : anchor
      return <>{thread(view, other, to, -22, -8)}{thread(view, to, other, -22, -8)}
        <path transform={pose(to, axis)} d="M-37-10-25-25-12-19M37 10 25 25 12 19"
          fill="none" stroke={paint.accent} strokeWidth="3.8" />
      </>
    }
    case "lance": return <>{routes.map(({ from, end }, i) => <g key={i}>
      {thread(view, end ? from : anchor, end ?? from, 0)}
      <path transform={pose(from, end ? facing(from, end, axis) : axis)} d={`M-24-13H2L${22 + 26 * q} 0 2 13H-24L-12 0Z`}
        fill={paint.metal} fillOpacity=".18" stroke={paint.metal} strokeWidth="2.5" />
    </g>)}</>
    case "echo": return <>{thread(view, anchor, to, 28, 4)}
      <g transform={pose(to, axis)}>
        {[0, 1, 2].map(i => <path key={i} d={arc(18 + 16 * i + q * 33, -66 + 16 * i, 81 + 8 * i)} stroke={paint.metal}
          strokeWidth={3.2 - .5 * i} fill="none" opacity={.82 - .19 * i} />)}
      </g>
    </>
    case "border": {
      const edge = outward(anchor)
      return <>{thread(view, anchor, to, 0)}
        <g transform={pose(anchor, left(edge))}>
          <WardStroke d={`M${-22 - 49 * q} 0H${22 + 49 * q}M-22 8H22`} color={paint.light} width={3.8} />
          <path d="M-44 6-36 17M-23 6-15 17M23 6 31 17M44 6 52 17" stroke={paint.accent} strokeWidth="2.7" />
        </g>
      </>
    }
    case "crown": return <>{thread(view, anchor, to, -31)}
      <path transform={at(to)} d={arc(35 + q * 15, 32, 149)} fill="none" stroke={paint.accent} strokeWidth="3.2" />
      {fx.skill === "paladin/Prismatic/P8" && <g transform={at(anchor)} opacity={.57 * (1 - p)}>
        <Plating d={art.shape} paint={paint} fill={.62} weight={2.3} />
      </g>}
    </>
  }
}

function Sigils({ view }: { view: View }) {
  const { fx, beat, art, paint, p } = view
  const marks = fx.contacts?.length ? fx.contacts : [fx.to]
  const q = ease(p)
  return <>{marks.map((mark, i) => {
    const facingHit = art.gesture === "brace" || art.gesture === "lance" || art.gesture === "echo"
    const end = beat.landings?.[i] ?? beat.landing
    const axis = end ? facing(mark, end, facing(fx.from, mark)) : facing(fx.from, mark)
    const rise = art.gesture === "wick" || art.gesture === "prayer" || art.gesture === "crown"
    const offset = rise ? { x: -29, y: -35 - 27 * q } : along({ x: 29, y: -36 }, facingHit ? axis : right, 13 * q)
    const anchor = end && facingHit ? mix(mark, end, Math.min(.8, .34 + q * .56)) : mark
    const tilt = (1 - q) * art.sweep * (beat.mode === "consume" ? -1 : 1)
    const hue = fx.rarity === "Prismatic" ? spectrum[i % spectrum.length] : paint.metal
    return <g key={i} transform={pose({ x: anchor.x + offset.x, y: anchor.y + offset.y }, facingHit ? axis : right, tilt)}>
      <g transform={`scale(${(fx.gold ? 1.18 : .85) * (.79 + .21 * q)} ${.77 + .31 * q})`}>
        <Plating d={art.shape} paint={{ ...paint, metal: hue }} fill={.69} weight={fx.gold ? 4.1 : 3} />
        {rise && <path d={`M-18 ${18 + 8 * q}H17`} stroke={paint.accent} strokeWidth="2.5" strokeDasharray="5 3" />}
      </g>
    </g>
  })}</>
}

function PairGround({ view }: { view: View }) {
  const { fx, beat, art, paint, p } = view
  const q = ease(p)
  const source = fx.from
  const contacts = fx.contacts?.length ? fx.contacts : [fx.to]
  return <>{contacts.map((to, i) => {
    const gap = edgeDistance(source, to)
    const axis = facing(source, to)
    const transform = pose(source, axis)
    let display
    switch (art.pair) {
      case "crosslight": display = <g transform={transform}>
        <WardStroke d={`M0 0L${gap * .38} -21 ${gap * .68} -21 ${gap} 0M${gap - 20} 0H${gap + 20}M${gap} -20V20`}
          color={paint.light} width={4.3} />
      </g>; break
      case "twolamps": display = <>{thread(view, source, to, 32, -8)}{thread(view, to, source, 21, -8)}
        <path d={arc(25 + 13 * q, 8, 167)} transform={at(source)} stroke={paint.accent} strokeWidth="4" fill="none" />
      </>; break
      case "relayflag": display = beat.mode === "consume" || edgeDistance(source, to) < 5
        ? <g transform={at(to)}>
          <WardStroke d={`M-12 27V${-17 - 42 * q}L39 -31 15 -16-12 -22M-30 26H4`} color={paint.light} width={4.1} />
        </g> : thread(view, source, to, -30, 4); break
      case "shardshield": display = <g transform={pose(to, facing(to, beat.landings?.[i] ?? source))}>
        <path d={`M-7-28 15-23 7-12ZM14-6 ${41 + 22 * q}-14 38 4 20 10ZM-6 19 15 12 21 27Z`}
          fill={paint.accent} fillOpacity=".22" stroke={paint.light} strokeWidth="3" />
      </g>; break
      case "vowblade": display = <g transform={transform}>
        <path d={`M0-12 ${gap * .34}-22 ${gap} 0 ${gap * .44} 16 0 11 15 0Z`}
          fill={paint.accent} fillOpacity=".18" stroke={paint.metal} strokeWidth="3.8" />
        <WardStroke d={`M5 0H${gap * q}`} color={paint.light} width={5} />
      </g>; break
      case "footwall": display = <g transform={pose(to, facing(source, to))}>
        <WardStroke d={`M-49 -29H-28L-16-15M-49 29H-28L-16 15M31-26H${47 + 9 * q}M31 26H${47 + 9 * q}`}
          color={paint.light} width={4.4} />
      </g>; break
      case "sharedscreen": display = <>
        {thread(view, beat.owner, to, -13, -10)}
        <g transform={pose(to, facing(beat.owner, to))}>
          <path d={`M-9-48Q${-32 + 12 * q}-24-19 0Q${-32 + 12 * q}24-9 48M-18-47H11L19-34H3M-18 47H11L19 34H3`}
            fill="none" stroke={paint.metal} strokeWidth="4.7" />
          <WardStroke d="M-32-35-16-15M-32 35-16 15" color={paint.light} width={3.7} />
        </g>
      </>; break
      case "fringe": display = <g transform={transform}>
        <path d={arc(118 + 29 * q, -24, 26)} stroke={paint.metal} fill="none" strokeWidth="5" strokeDasharray="10 6" />
        <WardStroke d={`M56 0Q${gap * .58} -24 ${gap + 14 * q} -5`} color={paint.light} width={4.3} />
      </g>; break
      case "chainsweep": display = <g transform={transform}>
        <path d={`M0-9Q${gap * .41} -41 ${gap + 16 * q} -6Q${gap * .64} 29 0 12Z`}
          fill={paint.accent} fillOpacity=".17" stroke={paint.metal} strokeWidth="4" />
        <WardStroke d={`M12 1Q${gap * .61} -21 ${gap} -4`} color={paint.light} width={3.7} />
      </g>; break
      case "outerflag": display = <g transform={at(to)}>
        <path d={arc(26 + 18 * q, -63, 153)} stroke={paint.light} strokeWidth="3" fill="none" strokeDasharray="10 4" />
      </g>; break
      case "endwings": display = <g transform={transform}>
        {[1, -1].map(side => <path key={side}
          d={`M0 0Q${gap * .3} ${side * (44 + 13 * q)} ${gap + 15} ${side * 16}L${gap} 0 ${gap * .48} ${side * 9}Z`}
          fill={paint.accent} fillOpacity=".19" stroke={paint.metal} strokeWidth="4.1" />)}
        <WardStroke d={`M4 0H${gap * q}`} color={paint.light} width={3.9} />
      </g>; break
      case "reflectedbud": display = <g transform={transform}>
        <WardStroke d={`M0 -16Q${gap * .42} -33 ${gap} 0Q${gap * .42} 33 0 16M9 0H${gap * q}`}
          color={paint.light} width={4.4} />
        <path d="M-19 0-8-15 11-9 18 0 11 9-8 15Z" fill={paint.accent} fillOpacity=".23" stroke={paint.accent} strokeWidth="4" />
      </g>; break
      case "secondward": display = <g transform={transform}>
        {[-1, 0, 1].map((branch, j) => <path key={branch}
          d={`M0 0Q${gap * .42} ${branch * (32 + 15 * q)} ${gap + 13} ${branch * 23}`}
          fill="none" stroke={spectrum[j + 1]} strokeWidth={j === 1 ? 5.6 : 3.7} />)}
      </g>; break
      case "hall": display = beat.mode === "stance" ? <g transform={pose(to, facing(beat.trigger ?? source, to))}>
        <WardStroke d={`M-46 ${-24 - 4 * q}H-24L-12-14M-46 ${24 + 4 * q}H-24L-12 14`}
          color={spectrum[3]} width={5} />
      </g> : null; break
      default: display = null
    }
    return <g key={i}>{display}</g>
  })}</>
}

function Ready({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  const entries = paladinTraitReadiness(battle)
  return <>{entries.map(({ id, unit: holder, kind, until, anchor, partners }, i) => {
    const art = paladinTraitArt(id)!
    const paint = colors[id.split("/")[1] as Rarity]
    const opacity = until === undefined ? .78 : .82 * unit((until - battle.time) / .30)
    const links = partners ?? (anchor ? [anchor] : [])
    if (layer === "floor") return links.length ? <g key={id + holder.id} data-paladin-trait-ready={id} opacity={opacity * .7}>
      {links.map((other, j) => <path key={j} d={path([holder, other])} stroke={paint.metal} strokeWidth="2.6"
        strokeDasharray="5 9" fill="none" />)}
    </g> : null
    const order = entries.slice(0, i).filter((item) => item.unit === holder).length
    return <g key={id + holder.id} data-paladin-trait-ready={id} opacity={opacity}
      transform={`translate(${holder.x + (kind === "watch" ? 44 : -47)} ${holder.y + 33 - order * 21}) scale(.56)`}>
      <Plating d={art.shape} paint={paint} fill={.89} weight={4.1} />
    </g>
  })}</>
}

export function EdgePaladinTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>
    {battle.runtime.effects.map((fx) => {
      const beat = fx.passive
      const art = beat && paladinTraitArt(fx.skill)
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const view = { fx, beat, art, paint: colors[fx.rarity], p }
      return <g key={fx.id} data-paladin-trait={fx.skill} data-paladin-trait-mode={beat.mode} opacity={(1 - unit((p - .27) / .73)) ** 1.18}>
        {layer === "front" ? <Sigils view={view} /> : art.pair ? <PairGround view={view} /> : <Ground view={view} />}
      </g>
    })}
    <Ready battle={battle} layer={layer} />
  </g>
}

export function EdgePaladinTraitField({ field, battle }: { field: FieldEffect; battle: EdgeBattle }) {
  const id = field.cast.signature?.id
  const art = paladinTraitArt(id)
  const circle = circlesOf(field.area)[0]
  const strip = wardenStrip(field.area.parts[0])
  const age = battle.time - field.time
  const opacity = Math.min(unit(age / .12), unit((field.until - battle.time) / .34))
  const owner = unitOf(battle, field.cast.owner)
  if (!art || !owner?.hp && battle.finishedAt !== null) return null
  if (art.pair === "outerflag" && circle) return <g data-paladin-trait-field={id} transform={at(circle.center)} opacity={opacity}>
    <path d={arc(circle.radius, -127, 80) + arc(circle.radius, 101, 216)} fill="none" stroke="#ffc87a" strokeWidth="3.4" strokeDasharray="11 6" />
    <path d={`M-19 19V-40L18 ${-37 + 3 * Math.sin(age * 6)} 8-25 22-16H-19M-32 19H-4`}
      fill="#a96949" fillOpacity=".31" stroke="#ffdf9d" strokeWidth="3.3" />
  </g>
  if (art.pair !== "hall" || !strip) return null
  const { from, to, length, width } = strip
  const half = width / 2
  const beams = Math.min(6, Math.max(1, Math.floor(length / 26)))
  return <g data-paladin-trait-field={id} opacity={opacity} transform={pose(from, direction(from, to))}>
    <path d={`M0 ${-half}H${length}V${half}H0Z`} fill="#8581b3" fillOpacity=".19" />
    <WardStroke d={`M0 ${-half}H${length}M0 ${half}H${length}`} color={spectrum[3]} width={2.6} />
    {Array.from({ length: beams }, (_, i) => {
      const x = length * (i + .5) / beams
      const pulse = .56 + .25 * Math.cos(age * 5 - .79 * i)
      return <path key={i} d={`M${x - 6} ${-half}l10 12v${width - 24}l-10 12`} fill="none"
        stroke={spectrum[i % spectrum.length]} strokeOpacity={pulse} strokeWidth="3.5" />
    })}
  </g>
}
