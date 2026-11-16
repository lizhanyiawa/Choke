import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, ease, heading, mix, unit } from "./EdgeBulwarkFields"
import { along, areaPath, direction, edgeDistance, left, rotate, type EdgeArea } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { lifebringerTraitArt } from "./edgeSkills/lifebringerTraits"
import { lifebringerTraitReadiness } from "./edgeSkills/runtime"
import { unitOf, type FieldEffect } from "./edgeSkills/state"
import chronowheel from "./edgeSkills/assets/chronowheel-opal.png"

const colors: Record<Rarity, readonly [string, string, string]> = {
  C: ["#e7c4a7", "#fff1df", "#d9afd0"],
  UC: ["#f4c393", "#fff6e3", "#a4dafa"],
  R: ["#c4b0fa", "#f8f2ff", "#e6a1d1"],
  E: ["#d6a1f4", "#fff1ff", "#bdd2ff"],
  L: ["#f4cd80", "#fff6d9", "#ffb4af"],
  Radiant: ["#ffabd3", "#fff4f5", "#ffdeba"],
  Prismatic: ["#e5b9ff", "#fff9f1", "#b1e3ff"],
}
const opal = ["#ffe3b2", "#ffc8e5", "#cebaff", "#b7e7ff"]
const zero = { x: 0, y: 0 }
const ordinal = (n: number) => Array.from({ length: n }, (_, i) => i)
const hueScale: Record<Rarity, number> = { C: .89, UC: .96, R: 1.03, E: 1.10, L: 1.2, Radiant: 1.32, Prismatic: 1.45 }
const pose = (p: EdgePoint, angle = 0, size = 1) => at(p) + ` rotate(${angle}) scale(${size})`
type Art = NonNullable<ReturnType<typeof lifebringerTraitArt>>
type Paint = (typeof colors)[Rarity]
type Beat = NonNullable<SkillVisual["passive"]>
type Draw = { fx: SkillVisual; art: Art; beat: Beat; t: number; from: EdgePoint; to: EdgePoint; paint: Paint; size: number }
type Layer = "floor" | "front"

function Petal({ paint, where = zero, size = 1, turn = 0 }: { paint: Paint; where?: EdgePoint; size?: number; turn?: number }) {
  return <g transform={pose(where, turn, size)}>
    <path d="M0-37Q26-19 18 4Q10 23 0 21Q-20 14-21-5Q-16-24 0-37Z" fill={paint[0]}
      fillOpacity=".28" stroke={paint[1]} strokeWidth="2.3" />
    <path d="M0-29Q8-5 0 18M3-3-11-13M5 3 13-7" fill="none" stroke={paint[2]} strokeWidth="1.9" />
  </g>
}

function Seal({ art, paint, where, size, progress = 1 }: { art: Art; paint: Paint; where: EdgePoint; size: number; progress?: number }) {
  return <g transform={pose(where, art.turn * (.55 + progress * .45), size)}>
    <path d={art.path} fill={paint[0]} fillOpacity=".22" stroke={paint[1]} strokeWidth="2.45" strokeLinejoin="round" />
    <path d={art.path} fill="none" stroke={paint[2]} strokeWidth="1.1" strokeDasharray="3 7" opacity=".65" />
  </g>
}

function Root({ from, to, paint, bend = 30, progress = 1, width = 3, dash = false }: {
  from: EdgePoint; to: EdgePoint; paint: Paint; bend?: number; progress?: number; width?: number; dash?: boolean;
}) {
  if (edgeDistance(from, to) < 4) return null
  const middle = along(mix(from, to, .5), left(direction(from, to)), bend)
  const first = mix(from, middle, progress)
  const head = mix(first, mix(middle, to, progress), progress)
  const shape = `M${from.x} ${from.y}Q${first.x} ${first.y} ${head.x} ${head.y}`
  return <>
    <path d={shape} fill="none" stroke={paint[0]} opacity=".17" strokeWidth={width * 4} strokeLinecap="round" />
    <path d={shape} fill="none" stroke={paint[1]} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash ? "5 7" : undefined} />
  </>
}

const rings = (area?: EdgeArea) => area?.parts.flatMap(part => part.kind === "circle" ? [part] : []) ?? []
function Rim({ area, paint, opacity = .5 }: { area?: EdgeArea; paint: Paint; opacity?: number }) {
  return area && <path d={areaPath(area)} fill={paint[0]} fillOpacity=".035" stroke={paint[2]} strokeWidth="2"
    strokeOpacity={opacity} strokeDasharray="7 9" />
}

function Growth({ s, layer }: { s: Draw; layer: Layer }) {
  const { art, fx, beat, to, from, t, paint, size } = s
  const q = ease(t * 1.33)
  const target = beat.receiver
  const angle = heading(direction(from, target))
  const rise = { x: target.x + 37, y: target.y + 11 - q * (22 + size * 11) }
  const feet = { x: target.x, y: target.y + 39 }
  const lift = 21 + q * 35
  const guard = beat.mode === "consume" || beat.mode === "stance"
  if (layer === "floor") {
    switch (art.gesture) {
      case "flow":
        return <>
          <Root from={from} to={target} paint={paint} bend={22 + art.turn / 5} progress={q} width={2.8 * size} />
          <Root from={from} to={target} paint={paint} bend={-29} progress={q * .92} width={1.3 * size} />
        </>
      case "trail": case "rim":
        return <>
          <Root from={beat.anchor ?? from} to={beat.landing ?? target} paint={paint} bend={art.turn * .20} progress={q} dash />
          <path d={arc(37 + q * 29, angle - 79, angle + 34)} transform={at(feet)} stroke={paint[0]} strokeWidth="3.3" fill="none" />
        </>
      case "root": case "fork":
        return <>
          {beat.partners?.map((p, i) => <Root key={i} from={p} to={target} paint={paint} bend={i % 2 ? -27 : 24} progress={q} />)}
          <Rim area={fx.area} paint={paint} opacity={.31} />
        </>
      case "count":
        return <g transform={pose(target, art.turn * q)}>
          {ordinal(3).map(i => <path key={i} d={arc((36 + i * 11 + q * 13) * size, -166 + i * 54, 19 + i * 60)}
            fill="none" stroke={fx.rarity === "Prismatic" ? opal[i] : paint[i % 3]} strokeWidth={i ? 2.3 : 3.3} />)}
        </g>
      case "return": case "bank":
        return <Root from={from} to={to} paint={paint} bend={art.turn * .35} width={3.1 * size} progress={q} />
      case "brace":
        return guard ? <>
          <Root from={target} to={beat.landing ?? to} paint={paint} bend={11} width={2.6} />
          <path d={arc(45 + 14 * q, angle - 42, angle + 42)} transform={at(target)} stroke={paint[0]} strokeWidth="3.4" fill="none" />
        </> : null
      default:
        return null
    }
  }
  switch (art.gesture) {
    case "leaf":
      return <>
        <Seal art={art} paint={paint} where={rise} size={size * (.83 + q * .20)} progress={q} />
        <Petal paint={paint} where={{ x: rise.x - 20, y: rise.y + 24 }} size={.43 + q * .13} turn={art.turn + q * 44} />
      </>
    case "fork":
      return <g transform={pose(rise, art.turn * .34)}>
        <path d={`M-20 33Q1 11 0 ${-lift}M-3 9Q16 2 30 ${-lift*.68}M-7 14Q-22 5-29 ${-lift*.37}`}
          stroke={paint[1]} strokeWidth={3 * size} fill="none" strokeLinecap="round" />
        <Seal art={art} paint={paint} where={{ x: 9, y: -lift * .53 }} size={size * .67} progress={q} />
      </g>
    case "droplet":
      return <>
        {ordinal(3).map(i => <ellipse key={i} cx={feet.x + (i - 1) * q * 26} cy={feet.y - Math.sin(i * 1.7 + 1) * lift * .37}
          rx={8 + q * 5} ry={11 + q * 5} fill={paint[2]} fillOpacity=".24" stroke={paint[1]} strokeWidth="2" />)}
        <Seal art={art} paint={paint} where={{ x: rise.x, y: rise.y - 14 }} size={size * .73} progress={q} />
      </>
    case "brace":
      return <g transform={pose(guard ? mix(target, beat.landing ?? target, q * .65) : feet, angle + 90)}>
        <path d={`M${-31*size} 11L0 ${-lift*.64} ${31*size} 11M-18 18H18`} stroke={paint[0]} strokeWidth="4" fill="none" />
        <Seal art={art} paint={paint} where={{ x: 0, y: -lift * .28 }} size={size * .70} progress={q} />
      </g>
    case "return":
      return <><Seal art={art} paint={paint} where={rise} size={size * .83} progress={q} />
        <Petal paint={paint} where={mix(from, to, q)} size={.47 + .17 * q} turn={art.turn + 85 * q} /></>
    case "flow":
      return <g transform={pose(rise, -33)}>
        <path d={`M-21 18Q5 11-2 ${-lift*.55}M-6 23Q22 9 12 ${-lift*.50}`} stroke={paint[2]} strokeWidth="3.6" fill="none" />
        <Seal art={art} paint={paint} where={{ x: 16, y: -13 }} size={size * .71} progress={q} />
      </g>
    case "trail":
      return <>
        {ordinal(3).map(i => <Petal key={i} paint={paint} where={along(feet, rotate({ x: 1, y: 0 }, 195 + i * 29 + art.turn * .25), 15 + (i + 1) * 13 * q)}
          size={(.35 + i * .06) * size} turn={art.turn + i * 30} />)}
        <Seal art={art} paint={paint} where={rise} size={size * .68} progress={q} />
      </>
    case "shell":
      return <g transform={pose(target, angle + 90)}>
        <path d={arc((40 + q * 15) * size, -133, -43)} stroke={paint[2]} strokeWidth="3.8" fill="none" />
        <Seal art={art} paint={paint} where={{ x: 0, y: -39 * size }} size={size * .91} progress={q} />
      </g>
    case "root":
      return <g transform={pose(feet, art.turn * .23)}>
        <path d={`M-45 13Q-28 3-17 ${-lift*.67}M43 11Q23 0 20 ${-lift*.64}M-17-8 1-4 19-11`}
          stroke={paint[1]} strokeWidth="3.3" fill="none" />
        <Seal art={art} paint={paint} where={{ x: 0, y: -lift * .58 }} size={size * .70} progress={q} />
      </g>
    case "fold":
      return <g transform={pose(rise, art.turn * q * .48)}>
        {ordinal(3).map(i => <path key={i} transform={`rotate(${i * 120})`}
          d={`M0 ${-lift}L18 ${-lift*.55} 3-9-12 ${-lift*.48}Z`} fill={paint[i % 3]}
          fillOpacity=".31" stroke={paint[1]} strokeWidth="2.6" />)}
        <Seal art={art} paint={paint} where={zero} size={size * .57} progress={q} />
      </g>
    case "canopy":
      return <g transform={pose({ x: target.x, y: target.y - 47 }, art.turn * .23)}>
        <path d={`M-46 0Q-19 ${-lift} 0-12Q27 ${-lift} 47 0L24 18 0 5-26 17Z`}
          fill={paint[0]} fillOpacity=".15" stroke={paint[1]} strokeWidth="3.3" />
        <Seal art={art} paint={paint} where={{ x: 7, y: -10 }} size={size * .69} progress={q} />
      </g>
    case "count":
      return <>
        {ordinal(3).map(i => <Petal key={i} paint={paint} where={along(target, rotate({ x: 1, y: 0 }, i * 120 + art.turn * q), lift * size)}
          size={(i ? .43 : .54) * size} turn={i * 120 + art.turn} />)}
        <Seal art={art} paint={paint} where={rise} size={size * .73} progress={q} />
      </>
    case "rim":
      return <><path d={arc(43 + q * 20, angle - 46, angle + 82)} transform={at(feet)} stroke={paint[1]} strokeWidth="4.1" fill="none" />
        <Seal art={art} paint={paint} where={rise} size={size * .81} progress={q} /></>
    case "bank":
      return <g transform={pose(rise, art.turn * .51)}>
        <path d="M0-42 28-16 23 17 0 37-27 15-26-17Z" fill={paint[2]} fillOpacity=".29" stroke={paint[1]} strokeWidth="3.5" />
        <path d="M0-42 7 2 23 17M7 2-27 15M7 2 28-16" stroke={paint[0]} strokeWidth="2.6" fill="none" />
        <Seal art={art} paint={paint} where={zero} size={size * .55} progress={q} />
      </g>
  }
}

function GoldTravel({ s }: { s: Draw }) {
  const { art, from, to, paint, size, t } = s
  const axis = direction(from, to)
  const bend = art.pair === "landingBud" ? -12 : art.pair === "backTrace" ? 53 : art.pair === "outerLichen" ? -41
    : art.pair === "thirdCircuit" ? 34 : -57
  const middle = along(mix(from, to, .5), left(axis), bend)
  const head = mix(mix(from, middle, t), mix(middle, to, t), t)
  return <>
    <Root from={from} to={to} paint={paint} bend={bend} progress={t} width={3.6 + size} dash={art.pair === "backTrace"} />
    <Seal art={art} paint={paint} where={head} size={size * (.63 + .11 * t)} progress={t} />
    {art.pair === "chronoRelay" && <>
      <Root from={from} to={to} paint={paint} bend={bend * -.78} progress={t} width={2.2} />
      <path d={arc(23 + t * 12, -124, 61)} transform={pose(head, t * 194)} stroke={paint[2]} strokeWidth="3" fill="none" />
    </>}
    {art.pair === "thirdCircuit" && <Petal paint={paint} where={along(head, left(axis), 17)} size={.51} turn={38 + 112 * t} />}
  </>
}

function PairEffect({ s, layer }: { s: Draw; layer: Layer }) {
  const { art, beat, fx, from, to, paint, t, size } = s
  if (beat.mode === "travel") return layer === "front" ? <GoldTravel s={s} /> : null
  const q = ease(t * 1.3), contact = beat.receiver
  const stamp = { x: contact.x + 38, y: contact.y - 25 - q * 9 }
  const faces = fx.contacts?.length ? fx.contacts : [contact]
  const field = rings(fx.area)[0]
  const center = field?.center ?? contact
  const a = heading(direction(from, to))
  const core = (where: EdgePoint, ratio = .93) => <Seal art={art} paint={paint} where={where} size={size * ratio} progress={q} />
  if (layer === "floor") switch (art.pair) {
    case "splitLeaf":
      return <><Root from={from} to={to} paint={paint} bend={-28} width={4.5} progress={q} />
        <Root from={from} to={to} paint={paint} bend={36} width={1.9} progress={q} /></>
    case "leafBed": case "landingBud":
      return <><Rim area={fx.area} paint={paint} />
        <path d={arc((field?.radius ?? 65) * (.48 + .45 * q), -140, 201)} transform={pose(center, art.turn)} stroke={paint[0]}
          fill="none" strokeWidth={4.1 - q * 1.3} /></>
    case "dewBrace":
      return <Root from={from} to={contact} paint={paint} bend={-26} width={3.1} progress={q} />
    case "thirdVine": {
      const part = fx.area?.parts.find(part => part.kind === "polygon")
      const end = part?.kind === "polygon" ? mix(part.points[1], part.points[2], .5) : to
      return <>
        <Rim area={fx.area} paint={paint} opacity={.56} />
        <Root from={from} to={end} paint={paint} bend={16} width={4.1} progress={q} />
        <Root from={from} to={end} paint={paint} bend={-20} width={2.2} progress={q} />
      </>
    }
    case "backTrace":
      return <><Root from={from} to={to} paint={paint} bend={51} width={4.2} progress={q} dash />
        <Petal paint={paint} where={from} size={1.05} turn={-58 - q * 19} /></>
    case "outerLichen":
      return <><Root from={from} to={to} paint={paint} bend={-32} width={4.8} progress={q} />
        <path d={arc(35 + q * 18, -132, 57)} transform={pose(to, a)} stroke={paint[0]} strokeWidth="4.3" fill="none" /></>
    case "doubleDew":
      return <g transform={at(center)}>
        {[1, .72].map((f, i) => <ellipse key={i} rx={(28 + q * 51) * f} ry={(17 + q * 27) * f}
          transform={`rotate(${-28 + i * 53})`} fill={paint[2]} fillOpacity=".1" stroke={paint[i % 2]} strokeWidth="3.5" />)}
      </g>
    case "twinSteps":
      return faces.length > 1 ? <>
        <Root from={faces[0]} to={faces[1]} paint={paint} bend={-45} width={4.6} progress={q} />
        <Root from={faces[0]} to={faces[1]} paint={paint} bend={33} width={2.1} progress={q} />
      </> : null
    case "paleWard":
      return <g transform={pose(contact, 19 + t * 34)}>
        <path d={arc(58 * size, -147, 98)} stroke={paint[0]} strokeWidth="4.2" fill="none" />
        <path d={arc(66 * size, 42, 204)} stroke={paint[1]} strokeWidth="2.6" fill="none" />
      </g>
    case "thirdCircuit":
      return <><Root from={from} to={to} paint={paint} bend={29} width={5.1} progress={q} />
        <path d="M0-36 32 20-32 20Z" transform={pose(from, 24 + t * 70, 1.1)} stroke={paint[2]} fill="none" strokeWidth="3" /></>
    case "mirrorNest":
      return <g transform={pose(contact, t * 31)}>
        {[0,1,2,3].map(i => <path key={i} transform={`rotate(${i * 90})`} d={arc(62 + 17 * q, -126, -54)}
          stroke={paint[i % 3]} strokeWidth="4.1" fill="none" />)}
      </g>
    case "chronoRelay":
      return <>
        <image href={chronowheel} x={from.x - 81} y={from.y - 81} width="162" height="162" opacity=".35" />
        <Root from={from} to={to} paint={paint} bend={-60} width={5.1} progress={q} />
        <Root from={from} to={to} paint={paint} bend={40} width={2.6} progress={q} />
      </>
    case "edgeShell":
      return <g transform={pose(contact, a + 90)}>
        <path d={arc(72 + 13 * q, -158, -11)} stroke={paint[2]} strokeWidth="5.4" fill="none" />
        <path d={arc(58 + 8 * q, 24, 143)} stroke={paint[0]} strokeWidth="3.7" fill="none" />
      </g>
    default:
      return null
  }
  switch (art.pair) {
    case "splitLeaf":
      return <>{core(stamp)}<Petal paint={paint} where={mix(from, contact, q)} size={.66} turn={-42 + q * 81} /></>
    case "leafBed":
      return <>{core(stamp, .73)}<Petal paint={paint} where={{ x: center.x, y: center.y - 27 * q }} size={.83} turn={-33} /></>
    case "landingBud":
      return <g transform={pose({ x: center.x, y: center.y - 21 }, -24)}>
        <path d="M0 26Q-6-8-28-18M0 26Q14-5 28-17M0 26Q9 2 0-30" stroke={paint[1]} strokeWidth="3.2" fill="none" />
        {core({ x: 2, y: -13 - 18 * q }, .79)}
      </g>
    case "dewBrace":
      return <g transform={pose({ x: contact.x, y: contact.y + 36 }, a + 90)}>
        <path d={`M-36 17 0 ${-39*q} 36 17M-18 27H18`} stroke={paint[2]} strokeWidth="4.7" fill="none" />
        {core({ x: 0, y: -10 }, .80)}
      </g>
    case "thirdVine":
      return <>{core(stamp)}<Petal paint={paint} where={{ x: contact.x - 42, y: contact.y + 18 }} size={.61} turn={72 + t * 34} /></>
    case "backTrace":
      return <g transform={pose(stamp, -35)}>
        {core(zero)}<path d="M-26 31Q-16 19 2 20Q15 17 24 8" stroke={paint[2]} strokeWidth="4" fill="none" />
      </g>
    case "outerLichen":
      return <g transform={pose(stamp, -30 + t * 50)}>
        <path d="M-38-6Q-28-37 0-31Q28-34 38 1Q20 24-7 24Q-31 21-38-6Z" stroke={paint[2]}
          strokeWidth="3.3" fill={paint[0]} fillOpacity=".20" />
        {core(zero, .72)}
      </g>
    case "doubleDew":
      return <>{faces.map((p, i) => <g key={i}>
        {core({ x: p.x + 33, y: p.y - 23 - i * 7 }, .73)}
        <ellipse cx={p.x} cy={p.y + 33} rx={17 + q * 16} ry="11" fill={paint[2]} fillOpacity=".16" stroke={paint[1]} strokeWidth="3" />
      </g>)}</>
    case "twinSteps":
      return <>{faces.map((p, i) => <g key={i} transform={pose({ x: p.x, y: p.y + 41 }, i % 2 ? 41 : -41)}>
        <path d={`M-45 18 0 ${-36*q} 44 18M-23 25H24`} stroke={paint[0]} strokeWidth="4.5" fill="none" />
        {core({ x: 0, y: -8 }, .69)}
      </g>)}</>
    case "paleWard":
      return <g transform={pose(stamp, t * 26)}>
        {core(zero)}<path d="M-34-8Q0-32 34-8M-29 14Q0-11 29 14" stroke={paint[0]} strokeWidth="3.8" fill="none" />
      </g>
    case "thirdCircuit":
      return <g transform={pose(stamp, 17 + t * 36)}>
        {core(zero, .85)}
        <path d="M0-57 16-32 0-17-14-32Z" fill={paint[2]} fillOpacity=".42" stroke={paint[1]} strokeWidth="3" />
      </g>
    case "mirrorNest":
      return <g transform={pose(contact, 21 + t * 33)}>
        {ordinal(4).map(i => <path key={i} transform={`rotate(${i*90}) translate(0 ${-13 * q})`}
          d="M-21-41-8-66 22-57 28-34 6-31Z" fill={paint[i % 3]} fillOpacity=".32" stroke={paint[1]} strokeWidth="3.2" />)}
      </g>
    case "chronoRelay":
      return <>
        {core(stamp, 1.03)}
        {ordinal(4).map(i => <Petal key={i} paint={paint} where={along(contact, rotate({ x: 1, y: 0 }, i * 90 + t * 53), 43 + q * 34)}
          size={.65} turn={i * 90 + art.turn} />)}
      </>
    case "edgeShell":
      return <g transform={pose(contact, a + 90)}>
        <path d="M-62-17Q-42-71 0-75Q44-70 62-17L37 22 0 3-36 21Z" fill={paint[2]} fillOpacity=".17"
          stroke={paint[1]} strokeWidth="3.7" />
        <path d="M-51-16Q-32-54 0-59Q31-54 49-16M-36 1 0-18 37 2" fill="none" stroke={paint[0]} strokeWidth="3.2" />
        {core({ x: 0, y: -45 }, .64)}
      </g>
    default:
      return null
  }
}

export function EdgeLifebringerTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden="true" pointerEvents="none">
    {battle.runtime.effects.map(fx => {
      const art = lifebringerTraitArt(fx.skill), beat = fx.passive
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const t = unit((battle.time - fx.start) / Math.max(.001, fx.end - fx.start))
      const target = unitOf(battle, fx.target)
      const to = beat.mode === "travel" && target?.hp ? target : fx.to
      const s = { fx, art, beat, t, from: fx.from, to, paint: colors[fx.rarity], size: hueScale[fx.rarity] }
      const opacity = beat.mode === "travel" ? .93 : Math.pow(1 - t, .52) * .98
      return <g key={fx.id} data-life-trait={fx.skill} data-life-trait-mode={beat.mode} opacity={opacity}>
        {art.pair ? <PairEffect s={s} layer={layer} /> : <Growth s={s} layer={layer} />}
      </g>
    })}
    {lifebringerTraitReadiness(battle).map(({ id, unit: target, until, partners, kind }) => {
      const art = lifebringerTraitArt(id)
      const rarity = id.split("/")[1] as Rarity
      if (!art) return null
      const paint = colors[rarity]
      const seed = battle.time * 4.4 + art.turn * .07
      const hover = Math.sin(seed) * 4
      const anchor = { x: target.x + 43, y: target.y + 15 + hover }
      const remaining = until === undefined ? 1 : unit((until - battle.time) / .23)
      const brace = art.gesture === "brace" || art.gesture === "trail"
      return <g key={id + "@" + target.id} data-life-trait-ready={id} opacity={(kind === "stance" ? .58 : .80) * remaining}>
        {layer === "floor" ? <>
          {partners?.map((p, i) => <Root key={i} from={target} to={p} paint={paint} bend={i % 2 ? -20 : 20} width={1.8} dash />)}
          {brace && <path d={arc(49, 12, 135)} transform={at(target)} fill="none" stroke={paint[0]} strokeWidth="2.6" />}
        </> : <>
          <Seal art={art} paint={paint} where={anchor} size={.52 * hueScale[rarity]} progress={.72 + Math.sin(seed) * .21} />
          {kind === "shield" && <path d={arc(47, -59, 34)} transform={at(target)} fill="none" stroke={paint[2]} strokeWidth="2.6" />}
        </>}
      </g>
    })}
  </g>
}

export function EdgeLifebringerTraitField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  const id = field.cast.signature?.id
  const art = lifebringerTraitArt(id)
  if (!art || field.until <= battle.time) return null
  const rarity = id!.split("/")[1] as Rarity
  const paint = colors[rarity]
  const age = battle.time - field.time
  const first = art.pair === "leafBed"
  return <g aria-hidden="true" pointerEvents="none" data-life-trait-field={id}
    opacity={Math.min(.87, .55 + age * 3, (field.until - battle.time) * 4)}>
    <Rim area={field.area} paint={paint} />
    {rings(field.area).map(({ center, radius }, i) => <g key={i} transform={at(center)}>
      {ordinal(first ? 4 : 6).map(j => <g key={j} transform={`rotate(${j * (first ? 90 : 60)})`}>
        <path d={`M0 ${-radius*.17}Q-14 ${-radius*.44} 0 ${-radius*.8}`} stroke={paint[0]} strokeWidth="3.1" fill="none" />
        <Petal paint={paint} where={{ x: 0, y: -radius * .64 }} size={.36 + .05 * Math.sin(age * 4 + j)} turn={first ? 61 : 35} />
      </g>)}
      <Seal art={art} paint={paint} where={{ x: 0, y: -12 - Math.sin(age * 3.1) * 5 }} size={.73} />
    </g>)}
  </g>
}

