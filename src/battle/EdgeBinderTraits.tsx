import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, circlesOf, ease, heading, mix, path, polar, spectrum, unit } from "./EdgeBulwarkFields"
import { along, areaPath, direction, edgeDistance, left, type EdgeArea } from "./edgeSkills/geometry"
import { binderTraitArt } from "./edgeSkills/binderTraits"
import type { SkillVisual } from "./edgeSkills/presentation"
import { binderTraitReadiness } from "./edgeSkills/runtime"
import { unitOf, type FieldEffect } from "./edgeSkills/state"

const paints = {
  C: ["#f3fbff", "#bed6e7", "#a2c4f5", "#25344a", .86],
  UC: ["#eafaff", "#81dafa", "#bbbaff", "#243853", .96],
  R: ["#eff3ff", "#aab9ff", "#8dddf4", "#282f56", 1.0],
  E: ["#fdf4ff", "#d8a8ff", "#a9d5ff", "#392750", 1.08],
  L: ["#fff7dc", "#ffca7c", "#f4a3b2", "#49323d", 1.14],
  Radiant: ["#fff5ff", "#ffadde", "#b4eaff", "#4a284c", 1.23],
  Prismatic: ["#fff9f3", "#e9b6ff", "#a8eaff", "#392648", 1.30],
} as const satisfies Record<Rarity, readonly [string, string, string, string, number]>
type Paint = (typeof paints)[Rarity]
type Art = NonNullable<ReturnType<typeof binderTraitArt>>
type Layer = "floor" | "front"
type Beat = NonNullable<SkillVisual["passive"]>
type Scene = { fx: SkillVisual; beat: Beat; art: Art; paint: Paint; t: number; to: EdgePoint }
const list = (size: number) => Array.from({ length: size }, (_, i) => i)
const pose = (p: EdgePoint, angle = 0, scale = 1) => at(p) + ` rotate(${angle}) scale(${scale})`
const foot = (p: EdgePoint, dx = 0) => ({ x: p.x + dx, y: p.y + 31 })

function Seal({ art, paint, where, size = 1, angle = art.angle }: {
  art: Art; paint: Paint; where: EdgePoint; size?: number; angle?: number
}) {
  return <g transform={pose(where, angle, size * paint[4])} strokeLinejoin="round">
    <path d={art.path} fill={paint[3]} fillOpacity=".76" stroke={paint[1]} strokeWidth="6.5" strokeOpacity=".22" />
    <path d={art.path} fill="none" stroke={paint[2]} strokeWidth="2.5" />
    <path d={art.path} fill="none" stroke={paint[0]} strokeWidth="1.1" />
  </g>
}

function Line({ from, to, paint, bend = 0, progress = 1, dashed = false, thickness = 2.9, pointer = false }: {
  from: EdgePoint; to: EdgePoint; paint: Paint; bend?: number; progress?: number; dashed?: boolean; thickness?: number; pointer?: boolean
}) {
  const distance = edgeDistance(from, to)
  if (distance < 3) return null
  const normal = left(direction(from, to))
  const middle = along(mix(from, to, .5), normal, bend)
  const a = mix(from, middle, progress), head = mix(a, mix(middle, to, progress), progress)
  const facing = direction(a, head)
  const stem = along(head, facing, -Math.min(16, distance * .23))
  const side = left(facing)
  const shape = `M${from.x} ${from.y}Q${a.x} ${a.y} ${head.x} ${head.y}`
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={shape} stroke={paint[1]} strokeWidth={thickness * 3.4} opacity={dashed ? .10 : .23} />
    <path d={shape} stroke={dashed ? paint[2] : paint[1]} strokeWidth={thickness} strokeDasharray={dashed ? "8 7" : undefined} />
    {!dashed && <path d={shape} stroke={paint[0]} strokeWidth={thickness * .43} />}
    {pointer && <path d={path([along(stem, side, 6.8), head, along(stem, side, -6.8)])}
      stroke={dashed ? paint[2] : paint[0]} strokeWidth={thickness} />}
  </g>
}

function Rim({ area, paint, fill = .1, dash = "11 8" }: { area?: EdgeArea; paint: Paint; fill?: number; dash?: string }) {
  return area && <path d={areaPath(area)} fill={paint[3]} fillOpacity={fill} stroke={paint[2]}
    strokeWidth="2.8" strokeDasharray={dash} strokeLinejoin="round" />
}

function Lattice({ area, paint, q }: { area?: EdgeArea; paint: Paint; q: number }) {
  return area && <>
    <Rim area={area} paint={paint} fill={.21} />
    {circlesOf(area).map(({ center, radius: r }, index) => <g key={index} transform={pose(center, -16, .79 + .21 * q)}>
      <path d={path([polar(.89 * r, -96), polar(.84 * r, 28), polar(.91 * r, 143)]) + "Z"}
        fill={paint[1]} fillOpacity=".25" stroke={paint[0]} strokeWidth="2.5" />
      <path d={path([polar(.75 * r, -52), polar(.84 * r, 89), polar(.85 * r, 200)]) + "Z"}
        fill={paint[2]} fillOpacity=".14" stroke={paint[1]} strokeWidth="2.2" />
      <path d={`M${-.63 * r} ${.12 * r}L${-.16 * r} ${-.04 * r} ${.19 * r} ${.48 * r}M${-.16 * r} ${-.04 * r}l${.43 * r} ${-.47 * r}`}
        fill="none" stroke={paint[0]} strokeWidth="1.8" />
    </g>)}
  </>
}

function Catch({ where, paint, angle, q, broad = 1 }: { where: EdgePoint; paint: Paint; angle: number; q: number; broad?: number }) {
  return <g transform={pose(where, angle, broad)} fill="none" strokeLinejoin="round">
    {[-1, 1].map(side => <path key={side} transform={`scale(${side} 1)`}
      d={`M${26 + 8 * q} 23L${37 + q * 11} -3 24 -29 13 -20 23 -6 15 18Z`}
      fill={paint[1]} fillOpacity=".15" stroke={paint[0]} strokeWidth="3.15" />)}
    <path d={`M-22 30Q0 ${37 + q * 12} 22 30`} stroke={paint[2]} strokeWidth="2.2" />
  </g>
}

function TraitMotion({ s, layer }: { s: Scene; layer: Layer }) {
  const { fx, beat, art, paint, t, to } = s
  const q = ease(t), contact = beat.receiver, approach = direction(fx.from, to)
  const faces = fx.contacts?.length ? fx.contacts : [contact]
  const endpoint = beat.landing ?? beat.landings?.find(p => p) ?? to
  const angle = heading(approach)
  const origin = edgeDistance(fx.from, to) >= 7 ? fx.from : beat.owner
  const mode = beat.mode
  if (layer === "floor") return <>
    {beat.partners?.map((p, i) => <Line key={i} from={p} to={contact} paint={paint} thickness={2.7}
      bend={i % 2 ? -22 : 19} progress={.28 + q * .72} dashed={mode === "stance"} />)}
    {["thread", "trail", "fork", "hinge", "coil", "shear"].includes(art.motion) &&
      <Line from={origin} to={endpoint} paint={paint} bend={art.motion === "coil" ? 34 : art.angle * .18}
        dashed={art.motion === "trail" && mode === "proc"} progress={.25 + .75 * q} pointer={art.motion === "hinge"} />}
    {(art.motion === "seam" || art.motion === "gate") && fx.area && <Rim area={fx.area} paint={paint} fill={.05} />}
  </>

  return <>
    {faces.map((where, i) => {
      const mark = foot(where, mode === "stance" ? 23 : art.motion === "thread" ? -21 : 14)
      const swing = art.angle + (1 - q) * (art.angle > 0 ? -48 : 38)
      const glyph = <Seal art={art} paint={paint} where={mark} angle={swing} size={.78 + q * .23} />
      let accent
      switch (art.motion) {
        case "etch":
          accent = <path d="M-30 0-17-9-6 2M6 6 17-6 29 0M-8 19 0 10 10 19"
            transform={pose(mark, angle + art.angle * .24, .65 + .38 * q)} fill="none" stroke={paint[0]} strokeWidth="2.9" />
          break
        case "thread":
          accent = <Line from={origin} to={mix(origin, mark, .5 + .5 * q)} paint={paint}
            bend={art.angle * .22} thickness={2.3} />
          break
        case "seam":
          accent = <path d="M-39 9-12-25 15 2 34-18 39 16 11 24-13 14Z"
            transform={pose(mark, art.angle + 26, .63 + .4 * q)} fill={paint[2]} fillOpacity=".18" stroke={paint[0]} strokeWidth="2.3" />
          break
        case "shear":
          accent = <path d="M-42 16-13-12 18-6 43-19M-36 24-12 2 19 4 35-6"
            transform={pose(mark, angle + art.angle * .3, .55 + .50 * q)} fill="none" stroke={paint[0]} strokeWidth="2.7" />
          break
        case "brace":
          accent = <Catch where={where} paint={paint} angle={angle + art.angle * .25} q={q} broad={.83 + .16 * q} />
          break
        case "aperture":
          accent = <g transform={pose(where, angle + art.angle * .32)}>
            <path d={arc(51 + 12 * q, -61, 43) + arc(43, -35, 14)} fill="none" stroke={paint[2]} strokeWidth="3.2" />
            <path d="M45-17 52 0 46 17" fill="none" stroke={paint[0]} strokeWidth="2.5" />
          </g>
          break
        case "tick":
          accent = <g transform={pose(mark, art.angle * .24)}>
            {list(3 + (fx.rarity === "L" ? 1 : 0)).map(j => <path key={j} d="M0 5v-17l6 6"
              transform={`translate(${-30 + 18 * j} ${8 + (j % 2) * 7})`} opacity={unit(q * 3.7 - j)}
              stroke={j % 2 ? paint[2] : paint[0]} strokeWidth="3" fill="none" />)}
          </g>
          break
        case "trail":
          accent = <g transform={pose(mark, angle)}>
            {list(3).map(j => <path key={j} d="M-6-7 7-9 9 3-4 9Z"
              transform={`translate(${-j * 18 - 14} ${j % 2 ? 11 : -2})`} fill={paint[1]} fillOpacity=".26"
              stroke={paint[2]} strokeWidth="2.1" opacity={1 - j * .21} />)}
          </g>
          break
        case "fork":
          accent = <g transform={pose(mark, angle)}>
            <path d={`M${-42 * q} 13-15-6 1 7 14-8 ${42 * q} 13M-15-6l-3-11m32 9 5-12`}
              fill="none" stroke={paint[0]} strokeWidth="3.2" />
          </g>
          break
        case "hinge":
          accent = <g transform={pose(mark, angle)}>
            <path d={`M${-43 * q} -18-18 6 2-5 22 7 ${43 * q} -13`} fill="none" stroke={paint[0]} strokeWidth="3.4" />
            <path d="M-16 5 2-5 22 7 12 19-9 19Z" fill={paint[2]} fillOpacity=".24" stroke={paint[1]} strokeWidth="2.6" />
          </g>
          break
        case "coil":
          accent = <path d={arc(36 + 13 * q, -126, 109) + arc(24, 31, 227)} transform={pose(mark, swing)}
            stroke={paint[2]} strokeWidth="3.1" fill="none" />
          break
        case "gate":
          accent = <path d="M-46 17-40-22-26-35H26L40-22 46 17M-46 17h15m62 0h15M-28-27H28"
            transform={pose(where, angle * .3 + art.angle * .12, .79 + .20 * q)} fill="none" stroke={paint[0]} strokeWidth="3.4" />
          break
      }
      return <g key={i}>{accent}{glyph}</g>
    })}
  </>
}

function BrokenHalo({ s, flavor }: { s: Scene; flavor: "spool" | "teeth" | "mirror" | "shatter" }) {
  const { fx, to, paint, t } = s
  const q = ease(t), center = fx.area?.center ?? to
  const r = circlesOf(fx.area)[0]?.radius ?? 66
  const count = flavor === "mirror" || flavor === "spool" ? 4 : 6
  return <g transform={pose(center, (flavor === "mirror" ? -52 : 39) * q)}>
    {list(count).map(i => {
      const angle = i * 360 / count
      const where = polar(r * (.59 + q * .25), angle)
      const part = flavor === "spool" ? "M-24 5Q-17-18 14-16L23-8 5-7-14 8Z"
        : flavor === "teeth" ? "M-19 12-15-9-4-22 8-21 17-4 22 8 4 17Z"
          : flavor === "mirror" ? "M-19-2-6-27 21-12 15 20-10 26Z" : "M-22-6-5-25 21-8 12 17-7 10Z"
      return <path key={i} d={part} transform={pose(where, angle + 55 + q * 36, .77 + .17 * q)}
        fill={flavor === "mirror" ? spectrum[i] : i % 2 ? paint[1] : paint[2]}
        fillOpacity={.22 + q * .12} stroke={paint[0]} strokeWidth="2.8" />
    })}
  </g>
}

function GoldMotion({ s, layer }: { s: Scene; layer: Layer }) {
  const { fx, beat, art, paint, t, to } = s
  const q = ease(t), mode = beat.mode, pair = art.pair
  const stamp = (where: EdgePoint, size = 1) => <Seal art={art} paint={paint} where={foot(where, 16)} size={size} angle={art.angle + 42 * (q - 1)} />
  const paths = (fx.contacts ?? [beat.receiver]).flatMap((from, i) => {
    const end = beat.landings?.[i] ?? (i === 0 ? beat.landing : undefined)
    return end ? [{ from, end }] : []
  })
  const move = (from: EdgePoint, end: EdgePoint, bend = 0, weight = 3.6) =>
    <Line from={from} to={end} paint={paint} bend={bend} thickness={weight} progress={.36 + .64 * q} pointer />
  const actualRoutes = (bend = 0) => paths.map(({ from, end }, i) => <g key={i}>{move(from, end, bend)}</g>)
  if (layer === "floor") {
    if (pair === "thinIce") return <Line from={fx.from} to={to} paint={paint} bend={-22} progress={.22 + q * .78} />
    if (pair === "frostRelay" || pair === "ballastSide" || pair === "lineExtension") return actualRoutes(pair === "lineExtension" ? 13 : 0)
    if (pair === "gravityStep" && mode === "consume") return <>
      {beat.trigger && <Line from={to} to={beat.trigger} paint={paint} dashed thickness={3.6} pointer />}
      {move(fx.from, to, 10, 4.0)}
    </>
    if (pair === "gearTail" || pair === "spoolEcho" || pair === "inverseHook" || pair === "secondPin" || pair === "foldBurst")
      return <><Rim area={fx.area} paint={paint} fill={mode === "travel" ? .07 : .19} />{actualRoutes(pair === "inverseHook" ? -13 : 9)}</>
    if (pair === "tetherRecoil" || pair === "shadowHook" || pair === "tideHarbor" || pair === "basinLift")
      return <>{actualRoutes(18)}<Line from={fx.from} to={to} paint={paint} bend={pair === "tideHarbor" ? 38 : -24}
        dashed={mode === "travel"} progress={.36 + .64 * q} /></>
    return null
  }

  switch (pair) {
    case "frostRelay": return <>
      {stamp(beat.receiver, .79)}
      {mode === "consume" && paths.map(({ from, end }, i) => <g key={i}>
        <Line from={mix(from, end, .45)} to={end} paint={paint} bend={14} thickness={2.6} progress={q} pointer />
        {stamp(end, .83)}
      </g>)}
    </>
    case "thinIce": return stamp(to, .86 + q * .16)
    case "tetherRecoil": return <>
      <Catch where={to} paint={paint} angle={heading(direction(fx.from, to))} q={q} broad={.76} />
      {stamp(paths[0]?.end ?? to, mode === "travel" ? .76 : .95)}
    </>
    case "secondPin": return <>
      <BrokenHalo s={s} flavor="teeth" />
      {(fx.contacts ?? [to]).map((p, i) => <g key={i}>{stamp(p, .79)}</g>)}
    </>
    case "spoolEcho": return <>
      <BrokenHalo s={s} flavor="spool" />
      {stamp(to, .94)}
    </>
    case "ballastSide": return <>
      <path d="M-46 10-19 10-5-14 20-14 44-4M-12 7 0 26 13 7" transform={pose(beat.receiver, heading(direction(fx.from, to)))}
        fill="none" stroke={paint[0]} strokeWidth="4.2" />
      {stamp(to, .87)}
    </>
    case "foldBurst": return <><BrokenHalo s={s} flavor="shatter" />{stamp(to, .98)}</>
    case "lineExtension": return <>
      {stamp(to, .88)}
      <Line from={mix(fx.from, to, .51)} to={to} paint={paint} bend={-12} thickness={5.2} progress={q} pointer />
    </>
    case "shadowHook": return <>
      <path d={arc(44 + q * 22, -154, 137)} transform={pose(fx.from, -24)} fill="none" stroke={paint[1]} strokeWidth="4.4" />
      {stamp(to, .93)}
    </>
    case "basinLift": return <>
      <path d="M-47 15Q-34-28 0-26Q37-21 47 16L26 23 0 6-26 24Z"
        transform={pose(to, art.angle + q * 72, .76 + q * .28)} fill={paint[1]} fillOpacity=".21" stroke={paint[0]} strokeWidth="3.6" />
      {stamp(to, .87)}
    </>
    case "gearTail": return <><BrokenHalo s={s} flavor="teeth" />{stamp(to, .91)}</>
    case "tideHarbor": return <>
      <Catch where={to} paint={paint} angle={heading(direction(fx.from, to)) - 90} q={q} broad={1.14} />
      {stamp(to, 1.02)}
    </>
    case "gravityStep": return <>
      {stamp(to, mode === "consume" ? 1.08 : .77)}
      {mode === "consume" && <path d="M-43 11-20-16-5 1 15-20 44-7 21 19 0 11-19 23Z"
        transform={pose(to, heading(direction(fx.from, to)) + 90)} fill={paint[2]} fillOpacity=".2" stroke={paint[0]} strokeWidth="3.4" />}
    </>
    case "inverseHook": return <><BrokenHalo s={s} flavor="mirror" />{stamp(to, .99)}</>
    default: return null
  }
}

export function EdgeBinderTraitField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  const id = field.cast.signature?.id
  if (id !== "binder/C/G2" || field.until <= battle.time) return null
  const progress = unit((battle.time - field.time) / .26)
  return <g data-binder-trait-field={id} pointerEvents="none" aria-hidden="true"
    opacity={(.54 + .28 * progress) * unit((field.until - battle.time) / .24)}>
    <Lattice area={field.area} paint={paints.C} q={progress} />
  </g>
}

export function EdgeBinderTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g pointerEvents="none" aria-hidden="true">
    {battle.runtime.effects.map(fx => {
      const art = binderTraitArt(fx.skill), beat = fx.passive
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const t = unit((battle.time - fx.start) / Math.max(.001, fx.end - fx.start))
      const target = unitOf(battle, fx.target)
      const to = beat.mode === "travel" && target?.hp ? target : fx.to
      const s = { fx, beat, art, t, to, paint: paints[fx.rarity] }
      return <g key={fx.id} data-binder-trait={fx.skill} data-binder-trait-mode={beat.mode}
        opacity={beat.mode === "travel" ? .86 : 1 - t ** 1.48}>
        {art.pair ? <GoldMotion s={s} layer={layer} /> : <TraitMotion s={s} layer={layer} />}
      </g>
    })}
    {binderTraitReadiness(battle).map(({ id, unit: holder, kind, until, partners, anchor }) => {
      const art = binderTraitArt(id)
      if (!art) return null
      const rarity = id.split("/")[1] as Rarity
      const paint = paints[rarity], life = until === undefined ? 1 : unit((until - battle.time) / .22)
      const hover = Math.sin(battle.time * 3.5 + art.angle) * 3.3
      return <g key={id + "@" + holder.id} data-binder-trait-ready={id} opacity={life * (kind === "stance" ? .62 : .78)}>
        {layer === "floor" ? <>
          {partners?.map((partner, i) => <Line key={i} from={holder} to={partner} paint={paint}
            thickness={1.75} bend={i ? -17 : 15} dashed />)}
          {id === "binder/E/G1" && anchor && <Line from={holder} to={anchor} paint={paint} dashed thickness={2.7} />}
          {["brace", "gate"].includes(art.motion) && <path d={arc(47, 9, 151)} transform={at(holder)}
            stroke={paint[2]} strokeWidth="2.5" fill="none" />}
        </> : <>
          <Seal art={art} paint={paint} where={{ x: holder.x + 43, y: holder.y + 16 + hover }} angle={art.angle * .27} size={.52} />
          {kind === "shield" && <path d={arc(48, -59, 28)} transform={at(holder)} stroke={paint[0]} strokeWidth="2.1" fill="none" />}
        </>}
      </g>
    })}
  </g>
}
