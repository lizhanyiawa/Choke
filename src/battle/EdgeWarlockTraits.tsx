import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, ease, heading, mix, path, unit } from "./EdgeBulwarkFields"
import { along, areaPath, direction, edgeDistance, rotate } from "./edgeSkills/geometry"
import { warlockTraitArt } from "./edgeSkills/warlockTraits"
import { warlockTraitReadiness } from "./edgeSkills/runtime"
import { unitOf, type FieldEffect } from "./edgeSkills/state"
import type { SkillVisual } from "./edgeSkills/presentation"
import faultRupture from "./edgeSkills/assets/fault-rupture.png"

type Layer = "floor" | "front"
type Art = NonNullable<ReturnType<typeof warlockTraitArt>>
type View = { fx: SkillVisual; art: Art; beat: NonNullable<SkillVisual["passive"]>; p: number; color: string; light: string; accent: string }
const palette: Record<Rarity, readonly [string, string, string]> = {
  C: ["#edcab4", "#fff6eb", "#c2b8df"], UC: ["#8fd0ef", "#edfaff", "#d2b0f1"], R: ["#afaaff", "#f2eaff", "#a4d6f3"],
  E: ["#c294f6", "#ffe6f3", "#ffbb98"], L: ["#f0cc80", "#fff3d0", "#e3a7c4"],
  Radiant: ["#ffaed3", "#fff3f0", "#bbb8ff"], Prismatic: ["#cfb6ff", "#f9f6ff", "#9cdcf5"],
}
const prism = ["#ffc0d6", "#bcb4ff", "#a5ddf7", "#ffe1ac"]
const axis = (from: EdgePoint, to: EdgePoint) => edgeDistance(from, to) > 2 ? direction(from, to) : { x: 1, y: 0 }
const pose = (point: EdgePoint, dir: EdgePoint, turn = 0) => at(point) + " rotate(" + (heading(dir) + turn) + ")"
const points = (v: View) => v.fx.contacts?.length ? v.fx.contacts : [v.beat.receiver]
const trips = (v: View) => points(v).map((from, i) => ({ from, to: v.beat.landings?.[i] ?? v.beat.landing ?? v.fx.to }))

function Inlay({ v, shape, fill = .25 }: { v: View; shape: string; fill?: number }) {
  return <><path d={shape} fill="#25192f" fillOpacity=".75" stroke="#18101f" strokeWidth="5.8" />
    <path d={shape} fill={v.color} fillOpacity={fill} stroke={v.color} strokeWidth="2.7" />
    <path d={shape} fill="none" stroke={v.light} strokeWidth="1" strokeDasharray="17 13" /></>
}
function Spark({ v, where, size = 1, turn = 0 }: { v: View; where: EdgePoint; size?: number; turn?: number }) {
  return <g transform={at(where) + " rotate(" + turn + ") scale(" + size + ")"}>
    <path d="M0-25 9-8 24-3 12 10 3 25-10 13-24 18-16-1-25-13-7-12Z" fill={v.color} fillOpacity=".29" stroke={v.light} strokeWidth="2.2" />
    <path d="M0-9 7 0 0 11-7 0Z" fill={v.light} fillOpacity=".62" />
  </g>
}
function Filament({ v, from, to, bend = 23, electric = false }: { v: View; from: EdgePoint; to: EdgePoint; bend?: number; electric?: boolean }) {
  const span = edgeDistance(from, to)
  if (span < 3) return null
  const q = v.beat.mode === "travel" ? v.p : ease(unit(v.p * 2))
  const shape = electric ? "M0 0L" + span * .22 + " -9 " + span * .35 + " 7 " + span * .63 + " -10 " + span * .78 + " 6 " + span + " 0"
    : "M0 0Q" + span * .5 + " " + bend + " " + span + " 0"
  return <g transform={pose(from, direction(from, to))}>
    <path d={shape} fill="none" stroke={v.color} strokeOpacity=".22" strokeWidth="6" pathLength="1" strokeDasharray={q + " 1"} />
    <path d={shape} fill="none" stroke={v.light} strokeWidth="2.1" pathLength="1" strokeDasharray={q + " 1"} />
    <Spark v={v} where={{ x: span * q, y: electric ? Math.sin(q * 13) * 6 : 2 * bend * q * (1 - q) }} size={v.fx.gold ? .54 : .35} turn={q * 83} />
  </g>
}
function Cinders({ v, where, count = 7, reach = 59 }: { v: View; where: EdgePoint; count?: number; reach?: number }) {
  const q = ease(v.p)
  return <>{Array.from({ length: count }, (_, i) => {
    const p = along(where, rotate({ x: 1, y: 0 }, i * 360 / count + v.art.turn), reach * (.3 + .7 * q))
    return <path key={i} transform={at(p) + " rotate(" + (i * 31 + q * 67) + ")"} d="M-5-9 7-5 9 3-2 10-9 2Z"
      fill={v.fx.rarity === "Prismatic" ? prism[i % 4] : v.color} fillOpacity=".3" stroke={i % 2 ? v.color : v.light} strokeWidth="1.8" />
  })}</>
}
function ShieldPieces({ v, where, count = 4, spread = 44 }: { v: View; where: EdgePoint; count?: number; spread?: number }) {
  const q = ease(unit(v.p * 1.8))
  return <g transform={at(where)}>{Array.from({ length: count }, (_, i) => {
    const p = along({ x: 0, y: 0 }, rotate({ x: 0, y: -1 }, i * 360 / count + v.art.turn * .3), spread + 19 * (1 - q))
    return <path key={i} transform={at(p) + " rotate(" + (i * 360 / count + v.art.turn * .3) + ")"}
      d="M-16 11-21-13-5-22 18-15 22 6 6 24Z" fill={v.color} fillOpacity=".16" stroke={i % 2 ? v.light : v.accent} strokeWidth="2.4" />
  })}</g>
}

function Passive({ v }: { v: View }) {
  const { fx, art, beat, p, color, light, accent } = v, q = ease(unit(p * 1.8))
  const origin = beat.anchor ?? fx.from, receiver = beat.receiver, consumed = beat.mode === "consume", contact = consumed ? fx.to : receiver
  switch (art.gesture) {
    case "charge": return <><Filament v={v} from={consumed ? fx.from : origin} to={contact} bend={art.turn * .35} />
      <g transform={at(contact)}><path d={arc(27 + 13 * q, -167 + q * 66, 123 + q * 66)} fill="none" stroke={color} strokeWidth="2.5" />
        <Spark v={v} where={{ x: 0, y: 0 }} size={.72 + q * .25} turn={art.turn + q * 34} /></g></>
    case "return": return <><Filament v={v} from={origin} to={receiver} bend={-27} />
      <g transform={at(receiver)}>{[0, 1, 2].map(i => <path key={i} d={"M" + (-26 + i * 5) + " " + (24 - i * 10 - q * 12) + "q24-16 43-5"}
        fill="none" stroke={i === 2 ? light : color} strokeWidth={3 - i * .3} />)}</g></>
    case "ice": return <g transform={at(contact) + " rotate(" + art.turn * .12 + ")"}>
      {[-1, 1].map(n => <path key={n} transform={"scale(" + n + " 1) translate(" + (consumed ? 7 * (1 - q) : 12 + 9 * (1 - q)) + " 0)"}
        d="M-2-28 14-43 28-17 17 4 29 26 10 37-2 17 11 0Z" fill={color} fillOpacity=".19" stroke={light} strokeWidth="2.3" />)}
      <path d="M-27 37H27M-18 44H18" stroke={accent} strokeWidth="2" />
    </g>
    case "ashward": return <><Filament v={v} from={origin} to={receiver} bend={26} />
      <ShieldPieces v={v} where={receiver} count={fx.rarity === "Prismatic" ? 5 : 3} /></>
    case "brace": return <>{trips(v).map(({ from, to }, i) => <g key={i}>
      <path d={path([from, to])} fill="none" stroke={color} strokeWidth="2" strokeDasharray="7 8" />
      <g transform={pose(to, axis(from, to))}>{[-1, 1].map(n => <path key={n} transform={"scale(1 " + n + ")"}
        d={"M-29 " + (-25 - 11 * (1 - q)) + "H-6L22-8 31 7H11L-3-5H-26"} fill={color} fillOpacity=".16" stroke={light} strokeWidth="2.5" />)}</g>
    </g>)}</>
    case "focus": return <g transform={pose(contact, axis(fx.from, fx.to), art.turn * .12)}>
      <path d="M-36-25H-14M-36-25V-3M36 25H14M36 25V3M-25 36V14M25-36V-14" fill="none" stroke={color} strokeWidth="2.7" />
      <path d={"M-18 " + (-22 + 9 * q) + "H18L8 0 18 " + (22 - 9 * q) + "H-18L-8 0Z"}
        fill={color} fillOpacity=".18" stroke={light} strokeWidth="2.2" />
      {consumed && <path d="M-61 0H61" fill="none" stroke={accent} strokeWidth="3" />}
    </g>
    case "lamp": return <g transform={at(receiver)}>
      <path d="M-24 27H24M-16 21H16M-16-18H16L11-7 23 11 9 25H-9L-23 11-11-7Z"
        fill={color} fillOpacity=".14" stroke={light} strokeWidth="2.3" />
      <path d={"M0 " + (-37 - q * 10) + "Q17-17 10 0Q-4 13-9-1Q-13-14 0 " + (-37 - q * 10) + "Z"}
        fill={accent} fillOpacity=".24" stroke={light} strokeWidth="2" />
    </g>
    case "link": return <>{(beat.partners?.length ? beat.partners : [origin]).map((from, i) =>
      <Filament key={i} v={v} from={from} to={receiver} bend={i % 2 ? -17 : 17} />)}
      <path transform={at(receiver)} d="M-32 28-14 18 0 29 14 18 32 28M-24 36H24" fill="none" stroke={light} strokeWidth="2.5" />
    </>
    case "pin": return <>{trips(v).map(({ from, to }, i) => <g key={i} transform={pose(from, axis(from, to))}>
      <path d={"M-27-6H" + Math.max(12, edgeDistance(from, to)) + "L" + Math.max(25, edgeDistance(from, to) + 13) + " 0 " + Math.max(12, edgeDistance(from, to)) + " 6H-27"}
        fill={color} fillOpacity=".27" stroke={light} strokeWidth="2.5" />
      <path d="M-14-18V18M-2-11V11" stroke={accent} strokeWidth="2.3" />
    </g>)}</>
    case "arc": return <><Filament v={v} from={fx.from} to={fx.to} electric />
      <g transform={at(fx.to)}>{[0, 1, 2].map(i => <path key={i} transform={"rotate(" + (i * 120 + art.turn) + ")"}
        d="M-6-12 8-26-1-31 15-47" fill="none" stroke={light} strokeWidth="2.3" />)}</g></>
    case "veil": return <g transform={pose(receiver, axis(fx.from, receiver))}>
      {[-1, 1].map(n => <path key={n} transform={"scale(1 " + n + ")"}
        d={"M-33 " + (-35 - q * 7) + "Q0-18 33 " + (-35 - q * 7) + "L22-11Q0-23-22-11Z"}
        fill={color} fillOpacity=".11" stroke={light} strokeWidth="2.3" />)}
      {consumed && <Cinders v={v} where={{ x: 0, y: 0 }} reach={53} count={5} />}
    </g>
    case "tail": {
      const to = consumed ? fx.to : receiver, from = consumed ? fx.from : origin
      return <><path d={path([from, to])} fill="none" stroke={accent} strokeWidth="2.1" strokeDasharray="12 7" />
        {[.18, .43, .7].map((f, i) => <path key={f} transform={pose(mix(from, to, f), axis(from, to), i % 2 ? 13 : -13)}
          d="M-17-7 11-3 24 0 11 4-17 9-7 0Z" fill={color} fillOpacity=".22" stroke={light} strokeWidth="1.9" />)}
      </>
    }
    case "eye": return <g transform={at(receiver)}>
      <path d={"M-43 0Q0 " + (-42 - q * 12) + " 43 0Q0 " + (42 + q * 12) + "-43 0Z"} fill={color} fillOpacity=".08" stroke={light} strokeWidth="2.6" />
      <path d="M-12-13H12V13H-12ZM-31-22H-18M18 22H31" fill={color} fillOpacity=".26" stroke={accent} strokeWidth="2.2" />
    </g>
    case "echo": return <>{points(v).map((t, i) => <g key={i} transform={at(t) + " rotate(" + art.turn * .3 + ")"}>
      {[-1, 1].map(n => <path key={n} transform={"translate(" + n * (8 + q * 13) + " 0) rotate(" + n * 17 + ")"}
        d="M0-34 24-12 17 19-4 31-22 8-19-18Z" fill={color} fillOpacity=".12" stroke={n > 0 ? light : accent} strokeWidth="2.5" />)}
    </g>)}</>
  }
}


function Gold({ v }: { v: View }) {
  const { fx, art, beat, color, light, accent, p } = v, q = ease(unit(p * 1.6)), origin = beat.anchor ?? fx.from
  switch (art.pair) {
    case "splinters": return <>
      {points(v).map((t, i) => <g key={i}>
        <Filament v={v} from={origin} to={t} bend={i % 2 ? -18 : 21} />
        <g transform={pose(t, axis(origin, t))}>{[-1, 0, 1].map(n => <path key={n} transform={"rotate(" + n * 43 + ")"}
          d="M-11-8 3-24 34 0 3 21-11 8 2 0Z" fill={color} fillOpacity=".24" stroke={light} strokeWidth="2.3" />)}</g>
      </g>)}
    </>
    case "foothold": return <>
      <Filament v={v} from={beat.mode === "consume" ? fx.from : origin} to={fx.to} bend={11} />
      <g transform={pose(beat.mode === "consume" ? fx.to : beat.receiver, axis(fx.from, fx.to))}>
        <path d="M-27 23H27M-18 16H18M-10-19H5L15-4 4 8-9 2ZM-2 8V23" fill={color} fillOpacity=".23" stroke={light} strokeWidth="2.5" />
      </g>
    </>
    case "lastcoal": case "forklanding": return beat.mode === "travel"
      ? <Filament v={v} from={fx.from} to={fx.to} bend={art.pair === "lastcoal" ? -31 : 0} electric={art.pair === "forklanding"} />
      : <>{points(v).map((t, i) => <g key={i}><Spark v={v} where={t} size={1.12} turn={art.turn} />
        <Cinders v={v} where={t} reach={72} count={art.pair === "lastcoal" ? 7 : 5} />
        {art.pair === "forklanding" && <g transform={pose(t, axis(origin, t))}>
          <path d="M-19-16 9-27-2-37 24-56M-11 19 17 31 6 41 30 53" fill="none" stroke={light} strokeWidth="2.7" />
        </g>}
      </g>)}</>
    case "shellburst": return <>
      {fx.area && <path d={areaPath(fx.area)} fill={color} fillOpacity=".035" stroke={accent} strokeWidth="2.3" />}
      {trips(v).map(({ from, to }, i) => <g key={i}>
        <path d={path([from, to])} stroke={light} strokeWidth="3" fill="none" />
        <path transform={pose(to, axis(from, to))} d="M-27-26 4-10 18 0 4 10-27 26-13 0Z"
          fill={color} fillOpacity=".23" stroke={light} strokeWidth="2.6" />
      </g>)}
      <ShieldPieces v={v} where={origin} spread={39 + q * 28} count={4} />
    </>
    case "traprecoil": return <>
      {fx.area && <path d={areaPath(fx.area)} fill="none" stroke={color} strokeWidth="2.4" strokeDasharray="4 12" />}
      {trips(v).map(({ from, to }, i) => <g key={i} transform={pose(from, axis(from, to))}>
        <path d={"M-6-23 15-5 " + edgeDistance(from, to) + " -15L" + (edgeDistance(from, to) - 9) + " 0 " + edgeDistance(from, to) + " 15 15 5-6 23"}
          fill={color} fillOpacity=".17" stroke={light} strokeWidth="2.7" />
      </g>)}
    </>
    case "afterheat": return <g transform={at(fx.area?.center ?? fx.to)}>
      <path d="M-47 10-20-11-3 1 21-17 48-1M-20-11-26-35M21-17 35-38M-3 1 7 28"
        fill="none" stroke={beat.mode === "travel" ? accent : light} strokeWidth={beat.mode === "travel" ? 2.1 : 4} />
      {beat.mode !== "travel" && <>{[-1, 0, 1].map(n => <path key={n} transform={"translate(" + n * 23 + " 0) rotate(" + n * 19 + ")"}
        d={"M0 17Q-24-8 0 " + (-46 - q * 24) + "Q24-8 0 17Z"} fill={accent} fillOpacity=".22" stroke={light} strokeWidth="2.3" />)}
        <Cinders v={v} where={{ x: 0, y: 0 }} reach={71} count={9} /></>}
    </g>
    case "rimorb": return <g>
      {fx.area && <path d={areaPath(fx.area)} fill={color} fillOpacity=".045" stroke={light} strokeWidth={3.5 - 1.5 * q} />}
      <g transform={at(origin)}>{[0, 1, 2, 3, 4].map(i => <path key={i} transform={"rotate(" + (i * 72 + q * 36) + ")"}
        d="M-8-29-19-53 2-71 21-46 9-28Z" fill={color} fillOpacity=".20" stroke={accent} strokeWidth="2.6" />)}</g>
      {points(v).map((t, i) => <Spark key={i} v={v} where={t} size={.73} turn={i * 37} />)}
    </g>
    case "latticebase": return <g transform={at(fx.area?.center ?? origin)}>
      <path d="M-58-13H-13V-58H13V-13H58V13H13V58H-13V13H-58Z"
        fill={color} fillOpacity=".10" stroke={light} strokeWidth="3" />
      {[-1, 1].map(n => <path key={n} transform={"scale(" + n + " 1)"} d="M-63-43H-43V-63M-63 43H-43V63"
        fill="none" stroke={accent} strokeWidth="2.7" />)}
    </g>
    case "mirrorpull": return <>
      {trips(v).map(({ from, to }, i) => <g key={i}>
        <Filament v={v} from={from} to={to} bend={i % 2 ? -23 : 23} />
        <path transform={pose(to, axis(from, to))} d="M18-19-5 0 18 19M-5 0H-19" stroke={light} strokeWidth="2.8" fill="none" />
      </g>)}
      <g transform={at(fx.area?.center ?? origin)}>
        <path d="M0-53 36-22 24 24 0 41-25 22-36-21Z" fill={color} fillOpacity=".08" stroke={light} strokeWidth="2.4" />
        <path d="M-22-18 0 11 22-18M0-35V11" stroke={accent} strokeWidth="2" fill="none" />
      </g>
    </>
    case "lastpulse": return <>{trips(v).map(({ from, to }, i) => <g key={i} transform={pose(from, axis(from, to))}>
      {[-1, 0, 1].map(n => <path key={n} d={"M0 0Q" + edgeDistance(from, to) * .48 + " " + n * 35 + " " + edgeDistance(from, to) + " " + n * 11}
        fill="none" stroke={n ? color : light} strokeWidth={n ? 2.6 : 4} />)}
      <path transform={"translate(" + edgeDistance(from, to) * q + " 0)"} d="M-31-34 9-11 23 0 9 11-31 34-14 0Z"
        fill={color} fillOpacity=".22" stroke={light} strokeWidth="3" />
    </g>)}</>
    case "cloudtrail": {
      const polygon = fx.area?.parts.find(part => part.kind === "polygon")
      if (!polygon || polygon.kind !== "polygon") return null
      const from = mix(polygon.points[0], polygon.points[3], .5), to = mix(polygon.points[1], polygon.points[2], .5), span = edgeDistance(from, to)
      return <g>
        <path d={areaPath(fx.area!)} fill={color} fillOpacity=".10" stroke={light} strokeWidth="2.6" />
        <g transform={pose(from, axis(from, to))}>{[-1, 0, 1].map((n, i) => <path key={n}
          d={"M0 " + n * 17 + "Q" + span * .44 + " " + (n * 19 - 14 * q) + " " + span + " " + n * 17}
          fill="none" stroke={i === 1 ? light : accent} strokeWidth="3" />)}
          <Spark v={v} where={{ x: span * q, y: 0 }} size={.72} turn={q * 70} />
        </g>
      </g>
    }
    case "faultzone": return <>
      {fx.area && <path d={areaPath(fx.area)} fill="none" stroke={light} strokeWidth="2.5" strokeDasharray="11 9" />}
      {points(v).map((t, i) => <g key={i} transform={at(t)}>
        {[0, 1, 2].map(j => <path key={j} transform={"translate(" + (j - 1) * 16 + " " + -q * 19 + ")"}
          d="M-8 19-11-13 0-37 11-15 8 18 0 27Z" fill={prism[(i + j) % 4]} fillOpacity=".22" stroke={light} strokeWidth="2.3" />)}
      </g>)}
    </>
    case "aidplate": return <>
      <Filament v={v} from={origin} to={beat.receiver} bend={-31} />
      <ShieldPieces v={v} where={beat.receiver} count={6} spread={52} />
      <path transform={at(beat.receiver)} d="M-23 42H23M-15 49H15" stroke={light} strokeWidth="2.8" fill="none" />
    </>
  }
}

function Seal({ v }: { v: View }) {
  const { beat, art, p } = v, q = ease(unit(p * 1.7))
  const x = ["pin", "arc", "echo"].includes(art.gesture) ? 43 : -43
  return <g transform={at({ x: beat.receiver.x + x, y: beat.receiver.y + 31 - 12 * q }) + " scale(" + (v.fx.gold ? .8 : .62) + ") rotate(" + art.turn * (1 - q) * .35 + ")"}>
    <Inlay v={v} shape={art.shape} fill={.38} />
  </g>
}
function Readiness({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  const entries = warlockTraitReadiness(battle)
  return <>{entries.map(({ id, unit: holder, until, kind, anchor, partners }, i) => {
    const art = warlockTraitArt(id)!, rank = id.split("/")[1] as Rarity, [color, light, accent] = palette[rank]
    const v: View = { art, color, light, accent, p: .4,
      beat: { mode: "stance", owner: holder, receiver: holder },
      fx: { id: 0, skill: id, rarity: rank, from: holder, to: holder, start: 0, end: 1, phase: "passive", mark: { motion: "flash", glyph: "fire" } } }
    const fade = until === undefined ? .82 : .82 * unit((until - battle.time) / .3)
    if (layer === "floor") return kind === "stance" ? <g key={id + holder.id} data-warlock-trait-ready={id} opacity={fade}>
      {(partners?.length ? partners : anchor ? [anchor] : []).map((p, j) => <path key={j} d={path([holder, p])} fill="none" stroke={color} strokeWidth="1.8" strokeDasharray="7 10" />)}
      <path transform={at(holder)} d="M-26 29-13 22 0 29 13 22 26 29" fill="none" stroke={light} strokeWidth="2.1" />
    </g> : null
    const index = entries.slice(0, i).filter(r => r.unit.id === holder.id).length
    return <g key={id + holder.id} data-warlock-trait-ready={id} opacity={fade}
      transform={at({ x: holder.x + (kind === "watch" ? 43 : -43), y: holder.y + 33 - index * 22 }) + " scale(.48)"}>
      <Inlay v={v} shape={art.shape} fill={.5} />
      {until !== undefined && <path d={"M-29 34H" + (-29 + 58 * unit((until - battle.time) / 8))} stroke={light} strokeWidth="3" />}
    </g>
  })}</>
}

export function EdgeWarlockTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>
    {battle.runtime.effects.map(fx => {
      const art = fx.passive && warlockTraitArt(fx.skill), beat = fx.passive
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start)), [color, light, accent] = palette[fx.rarity]
      const target = fx.target !== undefined && unitOf(battle, fx.target)
      const v = { art, beat, p, color, light, accent, fx: target && beat.mode === "travel" ? { ...fx, to: target } : fx }
      const raised = art.pair ? ["lastcoal", "forklanding", "afterheat", "faultzone", "aidplate"].includes(art.pair)
        : ["charge", "return", "focus", "arc", "echo"].includes(art.gesture)
      return <g key={fx.id} data-warlock-trait={fx.skill} data-warlock-trait-mode={beat.mode}
        opacity={beat.mode === "travel" ? 1 : Math.min(1, p * 18) * (1 - unit((p - .4) / .6))}>
        {layer === "front" ? <>{raised && (art.pair ? <Gold v={v} /> : <Passive v={v} />)}<Seal v={v} /></>
          : !raised && (art.pair ? <Gold v={v} /> : <Passive v={v} />)}
      </g>
    })}
    <Readiness battle={battle} layer={layer} />
  </g>
}

export function EdgeWarlockTraitField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  const id = field.cast.signature?.id
  if (id !== "warlock/L/G1" && id !== "warlock/Prismatic/G1") return null
  const center = field.area.center, fade = Math.min(unit((battle.time - field.time) / .18), unit((field.until - battle.time) / .35))
  return <g data-warlock-trait-field={id} opacity={fade}>
    {id === "warlock/Prismatic/G1" ? <>
      <image href={faultRupture} x={center.x - 83} y={center.y - 83} width="166" height="166" opacity=".40" />
      <path d={areaPath(field.area)} fill="#cfb9ff" fillOpacity=".025" stroke="#e5dcff" strokeWidth="2" strokeDasharray="11 9" />
    </> : <g transform={at(center)}>
      <path d="M-54-12H-12V-54H12V-12H54V12H12V54H-12V12H-54Z" fill="#e6c277" fillOpacity=".045" stroke="#f6dd9f" strokeWidth="1.9" />
      {[-1, 1].map(n => <g key={n} transform={"scale(" + n + " 1)"}>
        <path d="M-61-39V-61H-39M-61 39V61H-39" fill="none" stroke="#e5bb82" strokeWidth="2.2" />
      </g>)}
      <circle r="85" fill="none" stroke="#f2d58c" strokeOpacity=".54" strokeWidth="1.6" strokeDasharray="5 10" />
    </g>}
  </g>
}
