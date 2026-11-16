import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, ease, heading, mix, path, spectrum, unit } from "./EdgeBulwarkFields"
import { along, areaPath, direction, edgeDistance, left } from "./edgeSkills/geometry"
import { assassinTraitArt } from "./edgeSkills/assassinTraits"
import { assassinTraitReadiness } from "./edgeSkills/runtime"
import { unitOf, type FieldEffect } from "./edgeSkills/state"
import type { SkillVisual } from "./edgeSkills/presentation"

type Layer = "floor" | "front"
type Art = NonNullable<ReturnType<typeof assassinTraitArt>>
type View = { fx: SkillVisual; art: Art; beat: NonNullable<SkillVisual["passive"]>; p: number; color: string; light: string }
const inks: Record<Rarity, readonly [string, string]> = {
  C: ["#d2d6e9", "#fff6fa"], UC: ["#91cbed", "#e8f5ff"], R: ["#b9b5ff", "#f2e4ff"],
  E: ["#c39aff", "#ffe1f6"], L: ["#f1cb85", "#fff5da"], Radiant: ["#ffa8d1", "#fff1ee"], Prismatic: ["#c9b9ff", "#e7f7ff"],
}
const axisOf = (a: EdgePoint, b: EdgePoint) => edgeDistance(a, b) > 3 ? direction(a, b) : { x: 1, y: 0 }
const pose = (point: EdgePoint, axis: EdgePoint, tilt = 0) => at(point) + " rotate(" + (heading(axis) + tilt) + ")"
const contacts = (v: View) => v.fx.contacts?.length ? v.fx.contacts : [v.fx.to]
const destinations = (v: View) => contacts(v).map((from, i) => ({ from, to: v.beat.landings?.[i] ?? v.beat.landing ?? from }))

function Ink({ d, color, light, fill = .22 }: { d: string; color: string; light: string; fill?: number }) {
  return <><path d={d} fill="#20162b" fillOpacity=".84" stroke="#171020" strokeWidth="5.8" />
    <path d={d} fill={color} fillOpacity={fill} stroke={color} strokeWidth="2.7" />
    <path d={d} fill="none" stroke={light} strokeWidth="1" strokeDasharray="12 19" /></>
}
function Thread({ v, from, to, bend = 17, knife = false }: { v: View; from: EdgePoint; to: EdgePoint; bend?: number; knife?: boolean }) {
  const span = edgeDistance(from, to)
  if (span < 4) return null
  const q = ease(unit(v.p * 1.6))
  return <g transform={pose(from, direction(from, to))}>
    <path d={`M0 0Q${span * .55} ${bend} ${span} 0`} pathLength="1" strokeDasharray={q + " 1"}
      fill="none" stroke={v.color} strokeWidth={v.fx.gold ? 3 : 2.1} />
    <path transform={`translate(${span * q} ${2 * bend * q * (1 - q)})`} d={knife ? "M-24-4 0-7 15 0-7 5-24 2Z" : "M-9-3 0-6 8 0 0 6Z"}
      fill={v.color} fillOpacity=".45" stroke={v.light} strokeWidth="1.8" />
  </g>
}
function Phantom({ v, where, flip = 1 }: { v: View; where: EdgePoint; flip?: number }) {
  return <g transform={`${at(where)} scale(${flip} 1)`}>
    <path d="M-19-41-6-51 22-37 29 8 10 37-23 30-29-7Z" fill="#21162c" fillOpacity=".54" stroke={v.color} strokeWidth="2.3" />
    <path d="M-14-24 7-30 21-16M-19 10-6 21 14 13M-8-11 26 3 47-9" fill="none" stroke={v.light} strokeWidth="1.8" />
  </g>
}
function Sickle({ v, where, turn = 0, width = 12, length = 93 }: { v: View; where: EdgePoint; turn?: number; width?: number; length?: number }) {
  const q = ease(unit(v.p * 1.7)), n = length / 2
  return <path transform={pose(where, axisOf(v.fx.from, v.fx.to), turn)}
    d={`M${-n} ${width}Q${-n * .25} ${-width - 13 * q} ${n} ${-width}Q0 ${width * .2} ${-n} ${width}Z`}
    fill={v.color} fillOpacity=".23" stroke={v.light} strokeWidth="2.5" />
}

function Ground({ v }: { v: View }) {
  const { fx, art, beat, color, light, p } = v, q = ease(unit(p * 1.6))
  const anchor = beat.anchor ?? fx.from, to = fx.to, axis = axisOf(anchor, to)
  switch (art.gesture) {
    case "edge": return <><Thread v={v} from={anchor} to={to} bend={art.turn * .35} knife />
      <Sickle v={v} where={to} turn={art.turn} length={76} width={7} /></>
    case "spine": return <g transform={pose(to, axis, art.turn * .16)}>
      <path d={`M${-58 + 24 * q}-5H23L45 0 23 5H${-58 + 24 * q}ZM-21-14V14M-7-9V9`} fill={color} fillOpacity=".28" stroke={light} strokeWidth="2.4" />
    </g>
    case "wound": return <><Thread v={v} from={anchor} to={beat.receiver} bend={art.turn * .3} />
      <g transform={at(beat.receiver)}>{[0, 1, 2].map(i => <path key={i} d={`M${-24 + i * 5} ${28 - i * 10 - 11 * q}l${21 - i * 2}-8 17 4`}
        fill="none" stroke={i === 2 ? light : color} strokeWidth={2.6 - i * .3} />)}</g>
    </>
    case "ankle": return <>{destinations(v).map(({ from, to: landing }, i) => <g key={i}>
      <path d={path([from, landing])} fill="none" stroke={color} strokeWidth="2" strokeDasharray="8 8" />
      <g transform={pose(landing, axisOf(from, landing))}>{[-1, 1].map(s => <path key={s}
        transform={`scale(1 ${s}) translate(0 ${11 + 18 * (1 - q)})`} d="M-26 9V-8H17L28 5H9L0-1H-16"
        fill="none" stroke={light} strokeWidth="2.8" />)}</g>
    </g>)}</>
    case "palm": return <><Thread v={v} from={anchor} to={beat.receiver} bend={-22} />
      <g transform={pose(beat.receiver, axis)}>{[-1, 1].map(s => <path key={s} transform={`scale(${s} 1) translate(${9 + 20 * (1 - q)} 0)`}
        d="M0-34 26-24 34 5 11 27 0 35V-34Z" fill={color} fillOpacity=".18" stroke={light} strokeWidth="2.4" />)}</g>
    </>
    case "fang": return <>{contacts(v).map((t, i) => <g key={i} transform={pose(t, axis, art.turn)}>
      <path d={`M-41-22 4-9 ${31 + 12 * q} 20 2 6-14 17-4-1Z`} fill={color} fillOpacity=".36" stroke={light} strokeWidth="2.6" />
    </g>)}</>
    case "heel": case "stride": {
      const landing = beat.landing ?? to, length = edgeDistance(anchor, landing), count = Math.min(7, Math.max(2, Math.ceil(length / 36)))
      return <>{Array.from({ length: count }, (_, i) => {
        const where = along(mix(anchor, landing, (i + .5) / count), left(axisOf(anchor, landing)), i % 2 ? 8 : -8)
        return <path key={i} transform={pose(where, axisOf(anchor, landing), i % 2 ? 15 : -15)}
          d={art.gesture === "stride" ? "M-10-5 7-5 15 0 7 5H-10Z" : "M-11-7H4L10 1 1 8H-11Z"}
          fill={color} fillOpacity=".23" stroke={light} strokeWidth="2" opacity={unit(q * 3 - i / count)} />
      })}</>
    }
    case "neighbor": return <>{(beat.partners?.length ? beat.partners : [anchor]).map((t, i) => <g key={i}>
      <path d={path([t, along(mix(t, beat.receiver, .5), left(axisOf(t, beat.receiver)), 14), beat.receiver])}
        stroke={color} strokeWidth="2.2" fill="none" strokeDasharray="10 7" />
      <path transform={at(beat.receiver)} d="M-30 27-13 18 0 29 13 18 30 27" stroke={light} strokeWidth="2.4" fill="none" />
    </g>)}</>
    case "veil": return <g transform={pose(beat.receiver, axis)}>{[-1, 1].map(s => <path key={s} transform={`scale(1 ${s})`}
      d={`M-32 ${-32 - 9 * q}Q1 -18 32 ${-32 - 9 * q}L21-13Q0-22-21-13Z`}
      fill={color} fillOpacity=".15" stroke={light} strokeWidth="2.1" />)}</g>
    case "pin": return <>{contacts(v).map((t, i) => <g key={i} transform={pose(t, axis, art.turn)}>
      <path d={`M-5 ${-59 + 29 * q}H5L9 16 0 41-9 16ZM-28 21H28M-19 29H19`} fill={color} fillOpacity=".4" stroke={light} strokeWidth="2.1" />
    </g>)}</>
    case "rivet": return <g transform={pose(beat.receiver, axis)}>
      {[-1, 1].map(s => <path key={s} transform={`scale(${s} 1) translate(${28 * (1 - q)} 0)`}
        d="M-2-33 28-21 31 8 10 30-2 36ZM9-13V12H19V-13Z" fill={color} fillOpacity=".2" stroke={light} strokeWidth="2.1" />)}
    </g>
    case "fork": return <>{beat.partners?.map((t, i) => <Thread key={i} v={v} from={t} to={beat.owner} bend={-17} />)}
      <Thread v={v} from={beat.owner} to={to} bend={23} knife /><Sickle v={v} where={to} turn={art.turn} length={93} />
    </>
    case "wing": return <>{destinations(v).map(({ from, to: end }, i) => <g key={i}>
      <path d={path([from, end])} fill="none" stroke={color} strokeWidth="3" strokeDasharray="13 6" />
      <path transform={pose(end, axisOf(from, end))} d={`M-32-27Q${-12 + 11 * q}-8 9 0Q-12 8-32 27L-13 3Z`}
        fill={color} fillOpacity=".25" stroke={light} strokeWidth="2.4" />
    </g>)}</>
  }
}

function Gold({ v }: { v: View }) {
  const { fx, beat, art, color, light, p } = v, q = ease(unit(p * 1.5)), anchor = beat.anchor ?? fx.from
  switch (art.pair) {
    case "collect": case "sidebeat": return <>{destinations(v).map(({ from, to }, i) => {
      const corner = beat.corner ?? mix(from, to, .27), turn = direction(corner, to)
      return <g key={i}>
        <path d={path([from, corner, to])} fill="none" stroke={color} strokeWidth={art.pair === "sidebeat" ? 4 : 2.9} />
        <path transform={pose(to, turn)} d="M-24-14 0 0-24 14M-11-14 13 0-11 14" fill="none" stroke={light} strokeWidth="3" />
        {art.pair === "sidebeat" ? <g transform={pose(corner, turn)}>
          <path d="M-15-18V9H12M-7-23V1H20" fill="none" stroke={light} strokeWidth="2.7" />
          <path d={arc(25 + q * 6, -75, 12)} fill="none" stroke={color} strokeWidth="2" />
        </g> : <Sickle v={v} where={mix(corner, to, q)} turn={-48} length={72} width={10} />}
      </g>
    })}</>
    case "vacancy": return <g>
      {fx.area && <path d={areaPath(fx.area)} fill={color} fillOpacity=".06" stroke={light} strokeWidth="2" strokeDasharray="4 10" />}
      <Phantom v={v} where={fx.area?.center ?? anchor} />
      <path transform={pose(fx.to, axisOf(anchor, fx.to))} d="M-25 31H21M-18 24H9M-4 17H18" fill="none" stroke={light} strokeWidth="3" />
    </g>
    case "twins": return <>
      {fx.area && <path d={areaPath(fx.area)} fill={color} fillOpacity=".045" stroke={color} strokeWidth="2" strokeDasharray="13 9" />}
      <g opacity={beat.mode === "travel" ? .45 + .35 * q : 1 - q * .55}><Phantom v={v} where={fx.area?.center ?? fx.to} flip={-1} /></g>
      {beat.mode !== "travel" && contacts(v).map((t, i) => <g key={i}><Thread v={v} from={fx.area?.center ?? anchor} to={t} knife bend={-28} />
        <Sickle v={v} where={t} turn={-52} length={132} width={19} /></g>)}
    </>
    case "stopped": return <g transform={pose(fx.to, axisOf(anchor, fx.to), -19)}>
      <path d="M-41 28H34M-29 20H19M-17 12H29" stroke={color} strokeWidth="3" />
      {[0, 1, 2].map(i => <path key={i} d={`M${-21 + i * 17} 19l${10 - i * 3} ${-28 - 29 * q} 8 11`}
        fill="none" stroke={light} strokeWidth="2.3" />)}
    </g>
    case "rewind": return <>{destinations(v).map(({ from, to }, i) => {
      const span = edgeDistance(from, to)
      return <g key={i}>
        <g transform={pose(from, axisOf(from, to))}>
          <path d={`M0 0Q${span * .22} -23 ${span * .45} 0T${span} 0`} fill="none" stroke={color} strokeWidth="3.2" />
          <path transform={`translate(${span * q} 0)`} d="M17-18-4 0 17 18M-4 0H-17" fill="none" stroke={light} strokeWidth="3" />
        </g>
        {beat.partners?.[0] && <path transform={at(beat.partners[0])} d="M0-21 21 0 0 21-21 0Z" fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="4 5" />}
      </g>
    })}</>
    case "decoyblade": return <>{contacts(v).map((t, i) => <g key={i}>
      <g opacity={1 - q * .58}><Phantom v={v} where={along(t, axisOf(fx.from, t), 43)} flip={-1} /></g>
      <Sickle v={v} where={t} turn={121} length={136} width={20} />
    </g>)}</>
    case "pinrelay": return <>{contacts(v).map((t, i) => <g key={i}>
      <path d={path([anchor, along(mix(anchor, t, .42), left(axisOf(anchor, t)), 22), t])} fill="none" stroke={color} strokeWidth="3" />
      <path transform={at(t)} d={`M-21 25-12-17-3 25M3 25 12-${19 + 21 * q} 21 25`} fill="none" stroke={light} strokeWidth="2.9" />
    </g>)}</>
    case "afterslash": return <>
      {fx.area && <path d={areaPath(fx.area)} fill="none" stroke={color} strokeOpacity=".5" strokeWidth="1.8" strokeDasharray="14 8" />}
      <g transform={pose(anchor, axisOf(beat.owner, anchor), art.turn * .2)}>
        <path d={`M-11-81Q${72 + q * 32} 0-11 81Q${25 + q * 19} 0-11-81Z`} fill={color} fillOpacity=".18" stroke={light} strokeWidth="2.6" />
      </g>
      {contacts(v).map((t, i) => <Sickle key={i} v={v} where={t} turn={-35 + i * 13} length={92} width={13} />)}
    </>
    case "rimhand": return <>{destinations(v).map(({ from, to }, i) => <g key={i}>
      <Thread v={v} from={from} to={to} knife bend={0} />
      <path transform={pose(to, axisOf(from, to))} d="M-43-31-16-19 11 0-16 19-43 31-25 6ZM-24-10H-7V10H-24"
        fill={color} fillOpacity=".25" stroke={light} strokeWidth="2.6" />
    </g>)}</>
    case "returnfan": return <>{destinations(v).map(({ from, to }, i) => <g key={i} transform={pose(from, axisOf(from, to))}>
      {[-1, 0, 1].map(s => <path key={s} d={`M0 0Q${edgeDistance(from, to) * .45} ${s * (29 + 17 * q)} ${edgeDistance(from, to)} ${s * 12}`}
        fill="none" stroke={s ? color : light} strokeWidth={s ? 2.8 : 4} />)}
      <path transform={`translate(${edgeDistance(from, to) * q} 0)`} d="M-25-32 7-9 19 0 7 9-25 32-11 0Z"
        fill={color} fillOpacity=".21" stroke={light} strokeWidth="2.5" />
    </g>)}</>
    case "pairedguard": return <>
      <Thread v={v} from={anchor} to={beat.receiver} bend={-27} />
      <g transform={pose(beat.receiver, axisOf(anchor, beat.receiver))}>{[-1, 1].map(s => <path key={s}
        transform={`scale(${s} 1) translate(${10 + 27 * (1 - q)} 0)`} d="M0-42 34-28 43 7 20 31 0 42V-42ZM11-17V17H25V-17Z"
        fill={color} fillOpacity=".13" stroke={light} strokeWidth="2.4" />)}</g>
    </>
    case "gift": return beat.mode === "travel" ? <g transform={pose(fx.from, axisOf(fx.from, fx.to))}>
      <path d={`M0 0Q${edgeDistance(fx.from, fx.to) * .5} -66 ${edgeDistance(fx.from, fx.to)} 0`} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="15 8" />
      <g transform={`translate(${edgeDistance(fx.from, fx.to) * p} ${-132 * p * (1 - p)}) rotate(${art.turn * p})`}>
        <Ink d="M-24-7 0-17 23-3 8 19-9 11Z" color={color} light={light} fill={.35} />
      </g>
    </g> : <g transform={at(beat.receiver)}>
      {[-1, 0, 1].map((s, i) => <path key={s} transform={`translate(${s * 21} ${-27 - q * 32})`} d="M-8-32 8-24 5 15-2 29-10 10Z"
        fill={spectrum[i + 1]} fillOpacity=".2" stroke={light} strokeWidth="2" />)}
      <path d="M-37 31-14 21 0 30 14 21 37 31" fill="none" stroke={color} strokeWidth="3" />
    </g>
    case "shorebrace": return <>{destinations(v).map(({ from, to }, i) => <g key={i}>
      <path d={path([from, to])} fill="none" stroke={color} strokeWidth="3" strokeDasharray="9 8" />
      <g transform={pose(to, axisOf(from, to))}>{[-1, 1].map(s => <path key={s} transform={`scale(1 ${s})`}
        d={`M-39 ${-31 - 13 * (1 - q)}H-9L22-11 35 5H9L-7-8H-33Z`} fill={spectrum[s === 1 ? 1 : 3]} fillOpacity=".2" stroke={light} strokeWidth="2.6" />)}</g>
    </g>)}</>
  }
}

function Seals({ v }: { v: View }) {
  const { art, beat, color, light, p } = v, q = ease(unit(p * 1.8))
  const defensive = ["palm", "ankle", "veil", "rivet", "wound", "neighbor", "stride"].includes(art.gesture)
  const points = defensive ? [beat.receiver] : contacts(v)
  return <>{points.map((point, i) => <g key={i} transform={`${at({ x: point.x + (defensive ? -43 : 43), y: point.y + 32 - 13 * q })} rotate(${art.turn * (1 - q)}) scale(${v.fx.gold ? .92 : .73})`}>
    <Ink d={art.shape} color={color} light={light} fill={.37} />
    {v.fx.rarity === "Prismatic" && <path d={art.shape} fill="none" stroke={spectrum[3]} strokeWidth="1.5" strokeDasharray="9 25" strokeDashoffset={-57 * q} />}
  </g>)}</>
}

function Readiness({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  const entries = assassinTraitReadiness(battle)
  return <>{entries.map(({ id, unit: holder, kind, until, anchor, partners }, i) => {
    const art = assassinTraitArt(id)!, [color, light] = inks[id.split("/")[1] as Rarity]
    const fade = until === undefined ? .8 : .8 * unit((until - battle.time) / .3)
    if (layer === "floor") return kind === "stance" ? <g key={id + holder.id} data-assassin-trait-ready={id} opacity={fade}>
      {(partners?.length ? partners : anchor ? [anchor] : []).map((point, j) => <path key={j} d={path([holder, point])} fill="none" stroke={color} strokeWidth="1.9" strokeDasharray="7 9" />)}
      <path transform={at(holder)} d="M-27 31-10 25 0 32 10 25 27 31" stroke={light} strokeWidth="2" fill="none" />
    </g> : null
    const index = entries.slice(0, i).filter(r => r.unit.id === holder.id).length
    return <g key={id + holder.id} data-assassin-trait-ready={id} opacity={fade}
      transform={`${at({ x: holder.x + (kind === "watch" ? 44 : -44), y: holder.y + 34 - index * 22 })} scale(.54)`}>
      <Ink d={art.shape} color={color} light={light} fill={.5} />
      {until !== undefined && <path d={`M-26 29H${-26 + 52 * unit((until - battle.time) / 8)}`} stroke={light} strokeWidth="3" />}
    </g>
  })}</>
}

export function EdgeAssassinTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>{battle.runtime.effects.map((fx) => {
    const art = fx.passive && assassinTraitArt(fx.skill), beat = fx.passive
    if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
    const p = unit((battle.time - fx.start) / (fx.end - fx.start)), [color, light] = inks[fx.rarity]
    const receiver = fx.target !== undefined && unitOf(battle, fx.target)
    const v = { fx: receiver ? { ...fx, to: receiver } : fx, beat, art, p, color, light }
    const contact = ["edge", "spine", "fang", "pin", "fork"].includes(art.gesture)
    const raised = art.pair ? ["twins", "stopped", "decoyblade", "afterslash", "gift"].includes(art.pair) : contact
    return <g key={fx.id} data-assassin-trait={fx.skill} data-assassin-trait-mode={beat.mode}
      opacity={beat.mode === "travel" ? 1 : Math.min(1, p * 18) * (1 - unit((p - .39) / .61))}>
      {layer === "front" ? <>
        {raised && (art.pair ? <Gold v={v} /> : <Ground v={v} />)}<Seals v={v} />
      </> : !raised && (art.pair ? <Gold v={v} /> : <Ground v={v} />)}
    </g>
  })}<Readiness battle={battle} layer={layer} /></g>
}

export function EdgeAssassinTraitField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  if (field.cast.signature?.id !== "assassin/C/G2") return null
  const opacity = Math.min(unit((battle.time - field.time) / .18), unit((field.until - battle.time) / .32))
  return <g data-assassin-trait-field={field.cast.signature.id} opacity={opacity}>
    <path d={areaPath(field.area)} fill="#b5b6d8" fillOpacity=".035" stroke="#d7d9eb" strokeWidth="2" strokeDasharray="5 11" />
    <g transform={at(field.area.center)}>
      <path d="M-17-32-5-43 20-31 24 6 8 31-20 23-24-6Z" fill="#241b32" fillOpacity=".23" stroke="#c1c7dc" strokeWidth="1.7" strokeDasharray="10 5" />
      <path d="M-4-16H4L7 25 0 39-7 25ZM-28 39H28" fill="none" stroke="#f4eafa" strokeWidth="2.3" />
    </g>
  </g>
}
