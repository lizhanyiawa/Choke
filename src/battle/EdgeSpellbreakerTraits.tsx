import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, ease, heading, mix, path, spectrum, unit } from "./EdgeBulwarkFields"
import { along, areaPath, direction, edgeDistance, left } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { spellbreakerTraitReadiness } from "./edgeSkills/runtime"
import { spellbreakerTraitArt } from "./edgeSkills/spellbreakerTraits"
import type { FieldEffect } from "./edgeSkills/state"

type Layer = "floor" | "front"
type Art = NonNullable<ReturnType<typeof spellbreakerTraitArt>>
type View = { fx: SkillVisual; art: Art; beat: NonNullable<SkillVisual["passive"]>; p: number; color: string; trim: string }
const inks: Record<Rarity, readonly [string, string]> = {
  C: ["#d3cee8", "#fff4fc"], UC: ["#98d9f4", "#d8c5ff"], R: ["#aabaff", "#e1b0ff"],
  E: ["#c5a0ff", "#ffc1ec"], L: ["#f6cc83", "#e7c6ff"], Radiant: ["#ffa9cd", "#fff0e1"], Prismatic: ["#c8ccff", "#c1f0ff"],
}
const facing = (a: EdgePoint, b: EdgePoint) => edgeDistance(a, b) < 3 ? { x: 1, y: 0 } : direction(a, b)
const pose = (p: EdgePoint, axis: EdgePoint, turn = 0) => at(p) + " rotate(" + (heading(axis) + turn) + ")"
const targets = ({ fx }: View) => fx.contacts?.length ? fx.contacts : [fx.to]

function Facet({ d, color, trim, opacity = .18 }: { d: string; color: string; trim: string; opacity?: number }) {
  return <>
    <path d={d} fill={color} fillOpacity={opacity} stroke="#21192e" strokeWidth="6.5" strokeLinejoin="bevel" />
    <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="bevel" />
    <path d={d} fill="none" stroke={trim} strokeWidth=".9" strokeDasharray="9 15" strokeLinejoin="bevel" />
  </>
}

function Razor({ view, from, to, width = 12, bend = 0 }: { view: View; from: EdgePoint; to: EdgePoint; width?: number; bend?: number }) {
  const gap = edgeDistance(from, to)
  if (gap < 5) return null
  const q = ease(unit(view.p * 1.7))
  return <g transform={pose(from, direction(from, to))}>
    <path d={`M0 0Q${gap * .52} ${bend} ${gap * q} 0`} fill="none" stroke={view.color} strokeWidth="2" strokeDasharray="8 5" />
    <path d={`M${gap * q - 21} ${-width} ${gap * q + 7} 0 ${gap * q - 21} ${width} ${gap * q - 10} 0Z`}
      fill={view.color} fillOpacity=".34" stroke={view.trim} strokeWidth="2" />
  </g>
}

function Ground({ view }: { view: View }) {
  const { fx, beat, art, p, color, trim } = view
  const from = beat.anchor ?? fx.from
  const q = ease(unit(p * 1.6))
  const to = fx.to
  const axis = facing(from, to)
  switch (art.gesture) {
    case "shard": return <>{targets(view).map((contact, i) => <g key={i} transform={pose(contact, axis, art.turn)}>
      {[-1, 0, 1].map((side) => <path key={side} d={`M${6 + q * 14} ${side * 14}l${16 + q * 13} -8-5 12-11-4Z`}
        transform={`rotate(${side * 41})`} fill={color} fillOpacity=".42" stroke={trim} strokeWidth="1.6" />)}
    </g>)}<Razor view={view} from={from} to={to} width={5} /></>
    case "point": return <>{targets(view).map((contact, i) => <g key={i} transform={pose(contact, axis, art.turn * (1 - q))}>
      <path d={`M${-56 + q * 33} -7 17 0 ${-56 + q * 33} 7-14 0Z`} fill={color} fillOpacity=".45" stroke={trim} strokeWidth="2.1" />
      <path d={`M${24 + q * 12} -13v26M${30 + q * 12} -8v16`} fill="none" stroke={color} strokeWidth="2.3" />
    </g>)}</>
    case "score": return <g transform={pose(to, axis, art.turn * .2)}>
      {[-1, 0, 1].map((line) => <path key={line} d={`M-40 ${line * 12}H${-40 + q * 80}`} stroke={color} strokeWidth="2" />)}
      <path d={`M-23-22V22M-8-17V7H8V-9H23V24`} fill="none" stroke={trim} strokeWidth="3.5" strokeDasharray={`${12 + q * 30} 9`} />
    </g>
    case "file": return <>{targets(view).map((contact, i) => <g key={i} transform={pose(contact, axis, art.turn)}>
      {[0, 1, 2].map((j) => <path key={j} d={`M${-46 + 26 * q} ${-20 + j * 15}L${22 + 23 * q} ${-33 + j * 15}`}
        stroke={j === 1 ? trim : color} strokeWidth={j === 1 ? 4 : 1.7} />)}
    </g>)}</>
    case "veil": return <>{targets(view).map((contact, i) => <g key={i} transform={pose(contact, axis)}>
      <path d={`M-28 ${-34 - 8 * q}Q${-13 + 15 * q} 0-28 ${34 + 8 * q}L-17 18Q${-3 + 11 * q} 0-17-18Z`}
        fill={color} fillOpacity=".23" stroke={trim} strokeWidth="2.6" />
      <path d="M-37-23-29-13M-40 0h10M-37 23l8-10" stroke={color} strokeWidth="2" />
    </g>)}</>
    case "measure": return <g transform={pose(to, axis, art.turn * .25)}>
      <path d={`M-43 23H${-43 + q * 86}M-43-20V23`} stroke={color} strokeWidth="2.7" fill="none" />
      {[-2, -1, 0, 1, 2].map((i) => <path key={i} d={`M${i * 16} 23v${i % 2 ? -12 : -22}`} stroke={trim} strokeWidth="2" opacity={unit(q * 3 - (i + 2) * .32)} />)}
    </g>
    case "heel": {
      const landing = beat.landing ?? to
      const length = edgeDistance(from, landing)
      return <g transform={pose(from, facing(from, landing))}>
        <path d={`M0-9H${length * q}M0 9H${length * q}`} fill="none" stroke={color} strokeWidth="2" strokeDasharray="13 8" />
        <path transform={`translate(${length} 0)`} d="M-17-24H1L18-12V12L1 24H-17M18-12H28v24H18"
          fill="none" stroke={trim} strokeWidth="3" />
      </g>
    }
    case "shell": return <>{targets(view).map((contact, i) => <g key={i} transform={pose(contact, axis)}>
      {[-1, 1].map((side) => <path key={side} transform={`translate(0 ${side * (17 + 21 * (1 - q))}) scale(1 ${side})`}
        d="M-32-15H-5L26 1 4 9H-21Z" fill={color} fillOpacity=".23" stroke={trim} strokeWidth="2.2" />)}
    </g>)}<Razor view={view} from={from} to={to} width={7} /></>
    case "chisel": return <g transform={pose(to, axis, art.turn)}>
      <path d={`M${-47 + 31 * q} -15 20-5 31 9-5 16Z`} fill={color} fillOpacity=".37" stroke={trim} strokeWidth="2.3" />
      <path d={`M${30 + q * 7} -17l-6 14 14 10-8 14`} fill="none" stroke={color} strokeWidth="3" />
    </g>
    case "echo": return <>{targets(view).map((contact, i) => <g key={i}>
      <Razor view={view} from={from} to={contact} width={6} bend={art.turn * .25} />
      <g transform={at(contact)}>{[0, 1, 2].map((j) => <path key={j} d={`M${-25 + j * 6} ${20 - j * 14 - q * 11}h${48 - j * 12}l-6-7h-${36 - j * 12}Z`}
        fill={color} fillOpacity={.1 + j * .1} stroke={j === 2 ? trim : color} strokeWidth="2" />)}</g>
    </g>)}</>
    case "hook": return <>{targets(view).map((contact, i) => {
      const end = beat.landings?.[i] ?? beat.landing ?? contact
      return <g key={i}>
        <Razor view={view} from={contact} to={end} width={13} />
        <path transform={pose(end, facing(contact, end), art.turn * (1 - q))} d="M-34-17H-6L17 0-6 17H-34M17 0H29l-9-10"
          fill="none" stroke={trim} strokeWidth="3.2" />
      </g>
    })}</>
    case "etch": return <>{targets(view).map((contact, i) => <g key={i} transform={pose(contact, axis, art.turn * .35)}>
      <path d={`M-32-18H-12L${-7 + 9 * q} -4-13 16H-31M32 18H12L${7 - 9 * q} 4 13-16H31`}
        fill="none" stroke={color} strokeWidth="3" />
      <path d="M-7-26 5-10-4 3 7 21" fill="none" stroke={trim} strokeWidth="2.2" />
    </g>)}</>
    case "ribbon": return <>{(beat.partners?.length ? beat.partners : [from]).map((partner, i) => <g key={i}>
      <path d={path([partner, mix(partner, to, .32), along(mix(partner, to, .62), left(axis), 16 * q), to])}
        fill="none" stroke={color} strokeWidth="3" strokeDasharray="19 6" />
      <path transform={pose(to, axis)} d="M-21-27-9-12-18 0-9 12-21 27" fill="none" stroke={trim} strokeWidth="3" />
    </g>)}</>
    case "bracket": return <g transform={pose(to, axis)}>
      {[-1, 1].map((sign) => <path key={sign} transform={`scale(1 ${sign}) translate(0 ${16 + 17 * (1 - q)})`}
        d="M-29 12V-4H29V12M-13-4V3H13V-4" fill="none" stroke={color} strokeWidth="3.2" />)}
      <Razor view={view} from={{ x: -40, y: 0 }} to={{ x: 36, y: 0 }} width={4} />
    </g>
  }
}

function Gold({ view }: { view: View }) {
  const { fx, beat, art, p, color, trim } = view
  const anchor = beat.anchor ?? fx.from
  const q = ease(unit(p * 1.65))
  const axis = facing(anchor, fx.to)
  switch (art.pair) {
    case "aftersplinter": return <g>
      <Razor view={view} from={fx.from} to={fx.to} width={18} />
      <path transform={pose(fx.to, facing(fx.from, fx.to))} d={`M${-46 + q * 23} -22 20 0-46 22-18 0Z`}
        fill={color} fillOpacity=".26" stroke={trim} strokeWidth="2.5" />
    </g>
    case "thinmirror": return <>
      <path transform={pose(anchor, axis)} d={`M-10-44Q${23 * q} 0-10 44L15 24 25 0 15-24Z`} fill={color} fillOpacity=".24" stroke={trim} strokeWidth="2.5" />
      <Razor view={view} from={anchor} to={fx.to} width={11} />
    </>
    case "chantburst": return <>
      <path transform={at(anchor)} d={arc(32 + q * 48, -56, 56) + arc(32 + q * 48, 124, 236)} fill="none" stroke={color} strokeWidth="4" />
      {targets(view).map((t, i) => <Razor key={i} view={view} from={anchor} to={t} width={14} />)}
    </>
    case "footstamp": return <g transform={pose(fx.to, axis, -28 * (1 - q))}>
      <path d={`M-43-26H-17L-9-13H20L35 2 20 17H-9L-17 30H-43ZM-26-13V17M-18-7H15M-18 9H15`}
        fill={color} fillOpacity=".14" stroke={trim} strokeWidth="2.8" />
      <path d={`M${38 + q * 13} -25v51`} stroke={color} strokeWidth="3" />
    </g>
    case "sharedcrack": return <>
      <Razor view={view} from={fx.from} to={fx.to} width={10} bend={22} />
      <path transform={at(fx.to)} d={`M-27-40-5-22-13-4 16 13 8 36M22-31-5-22M-13-4-34 11M16 13 37 0`}
        fill="none" stroke={trim} strokeWidth="3.6" strokeDasharray={`${16 + q * 60} 7`} />
    </>
    case "remembrane": return <g transform={pose(fx.to, axis)}>
      {[-1, 1].map((s) => <g key={s} transform={`translate(${s * 36 * (1 - q)} 0) scale(${s} 1)`}>
        <Facet d="M-4-42 31-26 42 8 17 36-4 43V-42Z" color={color} trim={trim} />
      </g>)}
      <path d={`M-37 ${-28 + q * 57}H37`} stroke={trim} strokeWidth="2" />
    </g>
    case "curtainflip": return <g transform={pose(anchor, axis, art.turn * (q - .5))}>
      <path d={`M-7-83 47-61 ${15 + q * 53} 0 47 61-7 83 ${-24 - 34 * q} 0Z`}
        fill={color} fillOpacity=".17" stroke={trim} strokeWidth="2.8" />
      <path d={`M-7-83 9-24-7 0 9 24-7 83M47-61-7 0 47 61`} fill="none" stroke={color} strokeWidth="2" />
    </g>
    case "hangingrune": return <g transform={at(fx.to)}>
      <path d={`M-31-52H31V-33L22-26H-22L-31-33ZM-22-43H22M-12-51V-29M12-51V-29M0-26V${-10 + q * 38}`}
        fill={color} fillOpacity=".25" stroke={trim} strokeWidth="2.6" />
      <path transform={`translate(0 ${-25 + q * 56}) scale(1 -1)`} d={art.shape} fill="none" stroke={color} strokeWidth="2.1" />
    </g>
    case "lockpull": return <>{targets(view).map((t, i) => {
      const end = beat.landings?.[i] ?? beat.landing ?? fx.to
      const distance = edgeDistance(t, end)
      return <g key={i} transform={pose(t, facing(t, end))}>
        <path d={`M0-8H${distance}M0 8H${distance}`} stroke={color} strokeWidth="2" strokeDasharray="13 6" />
        <path transform={`translate(${distance * q} 0)`} d="M-22-20H16L26-10V10L16 20H-22V-20ZM-12-9H13V9H-12Z"
          fill={color} fillOpacity=".2" stroke={trim} strokeWidth="3" />
      </g>
    })}</>
    case "returnroad": return <>
      {fx.area && <path d={areaPath(fx.area)} fill={color} fillOpacity=".13" stroke={trim} strokeWidth="2.6" strokeDasharray="12 5" />}
      {targets(view).map((t, i) => <g key={i}>
        <Razor view={view} from={anchor} to={t} width={23} />
        <path transform={pose(t, axis, -55)} d={`M${-42 + q * 16} -11 37-5 8 16-31 7Z`} fill={color} fillOpacity=".4" stroke={trim} strokeWidth="2.3" />
      </g>)}
    </>
    case "stringreturn": return <>{targets(view).map((t, i) => {
      const end = beat.landings?.[i] ?? beat.landing ?? t
      return <g key={i} transform={pose(anchor, facing(anchor, end))}>
        {[-1, 0, 1].map((j) => <path key={j} d={`M-12 ${j * 14}Q${edgeDistance(anchor, t) * .5} ${j * (21 + q * 25)} ${edgeDistance(anchor, end)} ${j * 7}`}
          fill="none" stroke={j ? color : trim} strokeWidth={j ? 2.4 : 3.7} />)}
        <path transform={`translate(${edgeDistance(anchor, end) * q} 0)`} d="M-23-29 0 0-23 29M-11-29 12 0-11 29" fill="none" stroke={trim} strokeWidth="3" />
      </g>
    })}</>
    case "splitpage": return <>{targets(view).map((t, i) => <g key={i}>
      <Razor view={view} from={anchor} to={t} width={19} bend={-37} />
      <g transform={pose(t, axis)}><Facet d="M-4-38 31-25 40 2 17 31-4 41V-38ZM-14-33-36-16-30 16-14 29Z" color={color} trim={trim} /></g>
    </g>)}</>
    case "blankfall": return <>
      {fx.area && <path d={areaPath(fx.area)} fill={color} fillOpacity=".06" stroke={trim} strokeWidth="2" strokeDasharray="3 13" />}
      {targets(view).map((t, i) => <g key={i} transform={at(t)}>
        {[-1, 0, 1].map((j) => <g key={j} transform={`translate(${j * 31} ${-123 + q * (57 + j * 9)})`}>
          <path d="M-7-42H6V12L0 24-7 12Z" fill={spectrum[(i + j + 5) % spectrum.length]} fillOpacity=".18" stroke={trim} strokeWidth="1.5" />
          <path d="M-9 18 0 28 9 18" fill="none" stroke={color} strokeWidth="3" />
        </g>)}
        <path d={`M-42 26-13 ${32 - q * 12}H17L42 26`} fill="none" stroke={trim} strokeWidth="3" />
      </g>)}
    </>
    case "mirrorline": {
      const end = beat.landing ?? fx.to
      const distance = edgeDistance(anchor, end)
      return <>
        {fx.area && <path d={areaPath(fx.area)} fill={color} fillOpacity=".16" stroke={trim} strokeWidth="2.8" />}
        <g transform={pose(anchor, facing(anchor, end))}>
          {[-1, 0, 1].map((j) => <path key={j} d={`M0 ${j * 17}L${distance * q} ${-j * 17}`} stroke={spectrum[(j + 4) % spectrum.length]} strokeWidth="2.2" />)}
          <path transform={`translate(${distance * q} 0)`} d="M-19-28 6-20 20 0 6 20-19 28 0 0Z"
            fill={color} fillOpacity=".4" stroke={trim} strokeWidth="2" />
        </g>
      </>
    }
  }
}

function Seals({ view }: { view: View }) {
  const { art, beat, p, color, trim, fx } = view
  const q = ease(unit(p * 1.9))
  const receiving = ["shell", "veil", "bracket", "echo", "measure", "heel"].includes(art.gesture)
  const places = receiving ? [beat.receiver] : targets(view)
  return <>{places.map((t, i) => <g key={i} transform={`${at({ x: t.x + (receiving ? -43 : 43), y: t.y + 30 - 13 * q })} rotate(${art.turn * (1 - q)}) scale(${(fx.gold ? 1.04 : .77) * (.66 + .34 * q)})`}>
    <Facet d={art.shape} color={color} trim={trim} opacity={.48} />
    {fx.rarity === "Prismatic" && <path d={art.shape} fill="none" stroke={spectrum[2]} strokeWidth="1.5" strokeDasharray="7 27" strokeDashoffset={-q * 90} />}
  </g>)}</>
}

function Ready({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  const ready = spellbreakerTraitReadiness(battle)
  return <>{ready.map(({ id, unit: holder, kind, until, anchor, partners }, i) => {
    const art = spellbreakerTraitArt(id)!
    const [color, trim] = inks[id.split("/")[1] as Rarity]
    const opacity = until === undefined ? .8 : .8 * unit((until - battle.time) / .32)
    if (layer === "floor") return kind === "stance" ? <g key={id + holder.id} data-spellbreaker-trait-ready={id} opacity={opacity * .7}>
      {(partners?.length ? partners : anchor ? [anchor] : []).map((t, j) => <path key={j} d={path([holder, t])}
        fill="none" stroke={color} strokeWidth="2" strokeDasharray="7 9" />)}
      <path transform={at(holder)} d="M-33 27h16l8 8h18l8-8h16" fill="none" stroke={trim} strokeWidth="2.2" />
    </g> : null
    const order = ready.slice(0, i).filter((entry) => entry.unit.id === holder.id).length
    return <g key={id + holder.id} data-spellbreaker-trait-ready={id} opacity={opacity}
      transform={`${at({ x: holder.x + (kind === "watch" ? 43 : -44), y: holder.y + 37 - order * 21 })} scale(.52)`}>
      <Facet d={art.shape} color={color} trim={trim} opacity={.55} />
      {until !== undefined && <path d={`M-25 27H${-25 + 50 * unit((until - battle.time) / 8)}`} stroke={trim} strokeWidth="3" />}
    </g>
  })}</>
}

export function EdgeSpellbreakerTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>
    {battle.runtime.effects.map((fx) => {
      const art = fx.passive && spellbreakerTraitArt(fx.skill)
      if (!art || !fx.passive || battle.time < fx.start || battle.time >= fx.end) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const [color, trim] = inks[fx.rarity]
      const view = { fx, art, beat: fx.passive, p, color, trim }
      return <g key={fx.id} data-spellbreaker-trait={fx.skill} data-spellbreaker-trait-mode={fx.passive.mode}
        opacity={Math.min(1, p * 16) * (1 - unit((p - .42) / .58))}>
        {layer === "front" ? <>{art.pair === "blankfall" && <Gold view={view} />}<Seals view={view} /></>
          : art.pair ? art.pair !== "blankfall" && <Gold view={view} /> : <Ground view={view} />}
      </g>
    })}
    <Ready battle={battle} layer={layer} />
  </g>
}

export function EdgeSpellbreakerTraitField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  if (field.cast.signature?.id !== "spellbreaker/Prismatic/P6") return null
  const opacity = Math.min(unit((battle.time - field.time) / .18), unit((field.until - battle.time) / .4))
  return <g data-spellbreaker-trait-field={field.cast.signature.id} opacity={opacity}>
    <path d={areaPath(field.area)} fill="#b8b4e7" fillOpacity=".075" stroke="#d6d0ff" strokeWidth="2.7" strokeDasharray="18 8 3 8" />
    <path d={areaPath(field.area)} fill="none" stroke="#addaff" strokeWidth="1.2" strokeDasharray="3 37" strokeDashoffset={-battle.time * 13} />
    <path transform={at(field.area.center)} d="M-23-12H-13V-22M13-22V-12H23M23 12H13V22M-13 22V12H-23"
      fill="none" stroke="#eee4ff" strokeWidth="2.2" />
  </g>
}
