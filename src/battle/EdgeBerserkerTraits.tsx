import type { Rarity } from "@/card/types"

import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, ease, heading, mix, path, Plating, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { WardStroke } from "./EdgeWardenFields"
import { along, areaPath, direction, edgeDistance, fieldCrossing, isOutside, left, outward } from "./edgeSkills/geometry"
import { berserkerTraitArt } from "./edgeSkills/berserkerTraits"
import type { SkillVisual } from "./edgeSkills/presentation"
import { berserkerTraitReadiness } from "./edgeSkills/runtime"

type Layer = "floor" | "front"
type Trait = NonNullable<ReturnType<typeof berserkerTraitArt>>
type View = {
  fx: SkillVisual
  beat: NonNullable<SkillVisual["passive"]>
  art: Trait
  paint: ArmorPaint
  p: number
}
type Contact = { from: EdgePoint; end?: EdgePoint }

const colors: Record<Rarity, ArmorPaint> = {
  C: { light: "#fff4e7", metal: "#eec8b9", accent: "#ff9a7f", ink: "#4a3034" },
  UC: { light: "#fff2eb", metal: "#ffbc9f", accent: "#fca1b6", ink: "#503039" },
  R: { light: "#fff0eb", metal: "#ff9a9e", accent: "#ffd1bd", ink: "#512635" },
  E: { light: "#fff4fa", metal: "#e0b4ff", accent: "#ff91af", ink: "#48263e" },
  L: { light: "#fff7df", metal: "#ffc482", accent: "#ffa080", ink: "#4a2936" },
  Radiant: { light: "#fff7ed", metal: "#ff9578", accent: "#ffd1aa", ink: "#552a36" },
  Prismatic: { light: "#fff8f1", metal: "#ffd0ef", accent: "#a4e6ff", ink: "#452342" },
}

function pose(p: EdgePoint, axis: EdgePoint, scale = 1, angle = 0) {
  return at(p) + " rotate(" + (heading(axis) + angle) + ") scale(" + scale + ")"
}

function local(contact: EdgePoint, source: EdgePoint, fallback = { x: 1, y: 0 }) {
  return edgeDistance(source, contact) > 4 ? direction(source, contact) : fallback
}

function contacts({ fx, beat }: View): Contact[] {
  return (fx.contacts?.length ? fx.contacts : [beat.trigger ?? fx.to]).map((from, i) => ({
    from, end: beat.landings?.[i] ?? (i === 0 ? beat.landing : undefined),
  }))
}

function CutMark({ view, where, axis, scale = 1, angle = 0, open = false }: {
  view: View; where: EdgePoint; axis: EdgePoint; scale?: number; angle?: number; open?: boolean
}) {
  const { art, p, paint } = view
  return <g transform={pose(where, axis, scale, angle)}>
    <Plating d={art.shape} paint={paint} weight={2.8 + (1 - ease(p)) * 1.1} fill={open ? .10 : .54} />
    {open && <path d={art.shape} fill="none" stroke={paint.light} strokeWidth="3.4" pathLength="1"
      strokeDasharray={.18 + .72 * ease(p * 1.6) + " 1"} />}
  </g>
}

function TraceCut({ from, to, view, rail = false, reverse = false }: {
  from: EdgePoint; to: EdgePoint; view: View; rail?: boolean; reverse?: boolean
}) {
  const { paint, p } = view
  const gap = edgeDistance(from, to)
  if (gap < 7) return null
  const q = ease(p * 1.18)
  const head = (reverse ? 1 - q : q) * gap
  const lower = -9 - 7 * Math.sin(p * Math.PI)
  const upper = 8 + 5 * q
  return <g transform={pose(from, direction(from, to))}>
    {rail ? <>
      <path d={`M0 ${lower}H${gap}L${gap - 17} 0 ${gap} ${upper}H0L10 0Z`}
        fill={paint.metal} fillOpacity=".13" stroke={paint.metal} strokeWidth="2.7" />
      <path d={`M${gap * .22} 0H${gap - 6}`} stroke={paint.accent} strokeWidth="3.2" strokeDasharray="9 9" />
    </> : <path d={`M0 2Q${gap * .32} ${-27 - 16 * q} ${gap * .62} -6T${gap} 0`}
      fill="none" stroke={paint.metal} strokeOpacity=".72" strokeWidth="3.2" pathLength="1" strokeDasharray={q + " 1"} />}
    <path transform={`translate(${head} 0)`} d={reverse ? "M8-8-8 0 8 8" : "M-9-9 9 0-9 9"}
      fill="none" stroke={paint.light} strokeWidth={rail ? 4.6 : 3} strokeLinecap="round" />
  </g>
}

function CinderCuts({ view, where, axis, count = 5 }: { view: View; where: EdgePoint; axis: EdgePoint; count?: number }) {
  const { paint, p, fx } = view
  return <g transform={pose(where, axis)}>
    {Array.from({ length: count }, (_, i) => {
      const q = ease((p - i * .028) * 1.5)
      const radius = 21 + 55 * q
      const angle = -112 + (i * 245) / Math.max(1, count - 1)
      return <path key={i} transform={`rotate(${angle + 9 * q}) translate(${radius} 0)`}
        d={i % 2 ? "M-10-3 9-5 4 7-4 5Z" : "M-16 2 5-7 15-2 6 5Z"} fill={paint.light} fillOpacity={.26 + .36 * (1 - q)}
        stroke={fx.rarity === "Prismatic" ? spectrum[i % spectrum.length] : paint.metal} strokeWidth="2.5" />
    })}
  </g>
}

function Front({ view }: { view: View }) {
  const { fx, beat, art, paint, p } = view
  const { gesture } = art
  const q = ease(p)
  const from = fx.from
  const target = fx.to
  const marks = fx.contacts?.length ? fx.contacts : [target]
  const axis = local(target, from)
  const upward = { x: 1, y: 0 }
  const shove = gesture === "wedge" || gesture === "recoil" || (gesture === "arc" && !!beat.landings?.some(Boolean))
  if (shove) return <>
    {contacts(view).map(({ from: at, end }, i) => {
      const face = end ? local(end, at, axis) : axis
      const near = end ? mix(at, end, Math.min(.85, .27 + .57 * q)) : along(at, face, 31)
      return <CutMark key={i} view={view} where={near} axis={face} scale={.72 + .22 * (1 - q)} angle={i % 2 ? 14 : -9} />
    })}
  </>
  if (gesture === "stitch" || gesture === "riser") return <>
    {marks.map((mark, i) => <g key={i} transform={at({ x: mark.x - 26, y: mark.y + 22 - 58 * q })}>
      <CutMark view={view} where={{ x: 0, y: 0 }} axis={upward} scale={.82 + .24 * q} open />
      <path d={`M-25 ${19 + 16 * q}h12l6-6h16l8-8h11`} fill="none" stroke={paint.accent}
        strokeWidth="3" strokeDasharray={`${7 + 9 * q} 6`} />
    </g>)}
  </>
  if (gesture === "forge" || gesture === "latch") return <>
    {marks.map((mark, i) => <g key={i} transform={at(mark)}>
      <path d={`M${-54 + q * 7} -24l-8 19 8 31 15 12M${54 - q * 7} -24l8 19-8 31-15 12`}
        fill="none" stroke={paint.metal} strokeWidth={fx.gold ? 5 : 3.4} />
      <CutMark view={view} where={{ x: 28, y: -32 - 6 * (1 - q) }} axis={upward} scale={fx.gold ? 1.08 : .91} angle={9 * (1 - q)} />
    </g>)}
  </>
  if (gesture === "foot") return <>
    <CutMark view={view} where={along(target, left(axis), 34)} axis={axis} scale={.91 - .12 * q} angle={-36 + 21 * q} />
    {beat.mode === "consume" && <CutMark view={view} where={along(target, axis, 29)} axis={axis} scale={.64} />}
  </>
  if (gesture === "link") return <>
    {marks.map((mark, i) => <CutMark key={i} view={view} where={{ x: mark.x + 29, y: mark.y - 38 + 10 * q }}
      axis={local(mark, from, upward)} angle={-9 + 29 * q} scale={.86} open />)}
  </>
  if (gesture === "border") return <>
    {marks.map((mark, i) => <CutMark key={i} view={view} where={along(mark, left(local(mark, from, axis)), 36)}
      axis={local(mark, from, axis)} scale={.92} />)}
  </>
  const spin = gesture === "arc" ? -48 + 99 * q : gesture === "wound" ? -25 + 32 * q
    : gesture === "blade" ? -23 + 56 * q : gesture === "echo" ? -31 - 40 * q : 0
  return <>
    {marks.map((mark, i) => <g key={i}>
      <CutMark view={view} where={along(mark, local(mark, from, axis), 29 - 8 * q)}
        axis={local(mark, from, axis)} angle={spin + 8 * i} scale={fx.gold ? 1.17 : .91 + .16 * q}
        open={gesture === "ember" || gesture === "echo"} />
      {(gesture === "crack" || gesture === "cross") && <CinderCuts view={view} where={mark} axis={axis} count={fx.gold ? 6 : 3} />}
    </g>)}
  </>
}

function BorderCut({ view }: { view: View }) {
  const { fx, beat, paint, p } = view
  const motion = contacts(view).find(({ from, end }) => end && isOutside(from) !== isOutside(end))
  const end = motion?.end
  const start = motion?.from ?? fx.from
  const other = end ?? fx.to
  const crossing = isOutside(start) !== isOutside(other)
    ? isOutside(start) ? fieldCrossing(other, start) : fieldCrossing(start, other) : beat.anchor ?? beat.trigger ?? fx.to
  const length = (fx.gold ? 66 : 44) + 17 * ease(p)
  return <g transform={pose(crossing, outward(crossing))}>
    <WardStroke d={`M0 ${-length}V-17L-11-6 8 4 0 17V${length}`}
      color={fx.rarity === "Prismatic" ? spectrum[3] : paint.metal} width={fx.gold ? 5.3 : 3.7} />
    <path d={`M-17 ${-length * .68}-8-12-19 0-8 12-17 ${length * .68}`} fill="none" stroke={paint.light} strokeWidth="3" />
  </g>
}

function Ground({ view }: { view: View }) {
  const { fx, beat, art, paint, p } = view
  const q = ease(p)
  const paths = contacts(view).filter(({ from, end }) => end && edgeDistance(from, end) > 5)
  const links = [...(beat.partners ?? []), ...(fx.contacts?.length ? fx.contacts : [fx.to])]
  const from = fx.from
  const target = fx.to
  const foot = art.gesture === "foot" && edgeDistance(from, target) > 24
  const linked = ["stitch", "link", "ember", "latch", "echo", "blade", "border", "riser"].includes(art.gesture) || beat.mode === "consume"
  const joining = fx.skill === "berserker/R/G2" && beat.mode === "proc"
  return <>
    {paths.map(({ from, end }, i) => end ? <TraceCut key={i} from={from} to={end} view={view} rail /> : null)}
    {foot && [0.28, .51, .74, .97].map((f, i) => <g key={f} transform={pose(mix(from, target, f), direction(from, target))}
      opacity={unit((p + .25 - f * .25) * 2.4)}>
      <path transform={`translate(0 ${i % 2 ? 12 : -12})`} d="M-12-5H1L12 2 7 8H-12Z"
        fill={paint.ink} stroke={paint.metal} strokeWidth="3.1" />
    </g>)}
    {(linked || joining) && !paths.length && links.map((to, i) => <TraceCut key={i} from={joining ? target : from}
      to={to} view={view} reverse={art.gesture === "echo" && beat.mode === "proc"} />)}
    {art.gesture === "border" && <BorderCut view={view} />}
    {(art.gesture === "cross" || art.gesture === "crack" || art.gesture === "arc") && !paths.length && !fx.gold &&
      <g transform={pose(target, local(target, from), 1, 30 + q * 74)}>
        <path d={arc(30 + 40 * q, 22, art.gesture === "arc" ? 251 : 174)} fill="none" stroke={paint.accent} strokeWidth="4.2"
          strokeDasharray={art.gesture === "crack" ? "10 6" : undefined} />
      </g>}
  </>
}

function RingSweep({ view, teeth, radial = false }: { view: View; teeth: number; radial?: boolean }) {
  const { fx, paint, p } = view
  const circle = fx.area?.parts.find((part) => part.kind === "circle")
  if (!circle || circle.kind !== "circle") return null
  const q = ease(p * 1.7)
  const radius = circle.inner ? circle.inner + (circle.radius - circle.inner) * (.31 + .58 * q) : circle.radius * (.56 + .44 * q)
  return <g transform={at(circle.center)}>
    {Array.from({ length: teeth }, (_, i) => {
      const angle = 360 * i / teeth - 51 * q
      return <g key={i} transform={`rotate(${angle})`}>
        <WardStroke d={arc(radius, 6, 360 / teeth * .76)} color={i % 2 ? paint.metal : paint.light} width={radial ? 4.2 : 5.8} />
        {radial && <path d={`M${radius * .5} -5L${radius * .86} -11 ${radius + 7} 2 ${radius * .8} 13Z`}
          fill={paint.metal} fillOpacity=".23" stroke={paint.accent} strokeWidth="3.2" />}
      </g>
    })}
  </g>
}

function GoldGround({ view }: { view: View }) {
  const { fx, paint, beat, p } = view
  const q = ease(p)
  switch (fx.skill) {
    case "berserker/C/G1":
      return <g transform={pose(beat.landing ?? fx.to, outward(beat.landing ?? fx.to))}>
        <WardStroke d={`M-26-41H0L14-20 1-3 13 15 0 41H-26M-38-26-17-13-27 8-17 23`}
          color={paint.accent} width={4 + 1.9 * (1 - q)} />
      </g>
    case "berserker/C/G2":
      return <RingSweep view={view} teeth={2} />
    case "berserker/UC/G1":
      return <g transform={at(fx.to)}>
        <path d={`M-56 14Q-39 ${69 - 22 * q} -10 43L0 33M56 14Q39 ${69 - 22 * q} 10 43L0 33`}
          fill="none" stroke={paint.accent} strokeWidth="4.4" />
      </g>
    case "berserker/UC/G2":
      return <><RingSweep view={view} teeth={3} /><RingSweep view={{ ...view, p: p * .57 }} teeth={3} /></>
    case "berserker/R/G1":
      return <>{contacts(view).map(({ from, end }, i) => end ? <g key={i} transform={pose(from, direction(from, end))}>
        <path d={`M-26 0-14-13 3-10 11-4 34-20 42-15 32 0 42 15 34 20 11 4 3 10-14 13Z`}
          fill={paint.ink} stroke={paint.light} strokeWidth="4.2" />
      </g> : null)}</>
    case "berserker/L/G2":
      return <>{contacts(view).map(({ from, end }, i) => end ? <g key={i} transform={pose(from, direction(from, end))}>
        <WardStroke d={`M-37-16H-18L0 0H${34 + 19 * q}M-37 16H-18L0 0`} color={paint.light} width={5} />
        <path d="M-28-24-11-19-1-9M-28 24-11 19-1 9" fill="none" stroke={paint.accent} strokeWidth="3.8" />
      </g> : null)}</>
    case "berserker/R/G2":
      return beat.mode === "consume" ? <RingSweep view={view} teeth={4} radial /> : null
    case "berserker/E/G1":
      return <>{fx.area && <path d={areaPath(fx.area)} fill={paint.metal} fillOpacity=".12" fillRule="evenodd" />}
        <RingSweep view={view} teeth={4} /></>
    case "berserker/E/G2":
      return <RingSweep view={view} teeth={6} radial />
    case "berserker/L/G1": case "berserker/Radiant/G2":
      return <>{(fx.contacts ?? []).map((point, i) => <g key={i} transform={pose(point, local(point, fx.from))}>
        <path d="M-51-20-39-30-30-20H24L42 0 24 20H-30L-39 30-51 20Z"
          fill={paint.metal} fillOpacity=".20" stroke={paint.metal} strokeWidth="3.6" />
      </g>)}</>
    case "berserker/Radiant/G1":
      return <>{(fx.contacts ?? []).map((to, i) => {
        const length = edgeDistance(fx.from, to)
        return <g key={i} transform={pose(fx.from, local(to, fx.from))}>
          <path d={`M0 0Q${length * .41} -26 ${length + 12 * q} -17L${length + 19} 0 ${length * .62} 17Z`}
            fill={paint.accent} fillOpacity=".23" stroke={paint.metal} strokeWidth="3.5" />
          <WardStroke d={`M${length * .28} 1Q${length * .62} -13 ${length + 5} -9`} color={paint.light} width={4} />
        </g>
      })}</>
    case "berserker/Prismatic/G1":
      return <>{(fx.contacts ?? []).map((to, i) => {
        const length = edgeDistance(fx.from, to)
        return <g key={i} transform={pose(fx.from, local(to, fx.from))}>
          <path d={`M-9 0Q${length * .37} -48 ${length + 26 * q} -29L${length + 35} -12 ${length + 19} 8Q${length * .73} 39 ${length * .30} 18Z`}
            fill={spectrum[(i + 1) % spectrum.length]} fillOpacity=".29" stroke={spectrum[(i + 3) % spectrum.length]} strokeWidth="5.1" />
          <WardStroke d={`M-7 0Q${length * .43} -21 ${length + 17} -16M${length * .44} 18Q${length * .78} 19 ${length + 8} 4`}
            color={paint.light} width={5.9} />
        </g>
      })}</>
    case "berserker/Prismatic/G2":
      return <><g transform={pose(fx.from, local(fx.to, fx.from))}>
          <path d="M-39-27-14-38 0-20 14-38 39-27M-31 20-15 32 0 20 15 32 31 20" fill="none"
            stroke={spectrum[3]} strokeWidth="4.2" />
          <path d={`M6-8Q${edgeDistance(fx.from, fx.to) * .57} -36 ${edgeDistance(fx.from, fx.to)} -7`}
            pathLength="1" strokeDasharray={.26 + .73 * q + " 1"} stroke={paint.light} strokeWidth="5.5" fill="none" />
        </g>
        <g transform={pose(fx.to, local(fx.to, fx.from))}>
          <path d="M-37-27-22-41-7-38 2-25M-36 27-22 41-7 38 2 25M5-38 18-31 32-11V11L18 31 5 38" fill="none"
            stroke={spectrum[1]} strokeWidth="4.8" />
        </g>
      </>
  }
}

function Ready({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  const marks = berserkerTraitReadiness(battle)
  return <>{marks.map(({ id, unit: holder, kind, until, partners }, i) => {
    const art = berserkerTraitArt(id)!
    const rarity = id.split("/")[1] as Rarity
    const paint = colors[rarity]
    const alpha = until === undefined ? .77 : .82 * unit((until - battle.time) / .24)
    if (layer === "floor") {
      if (!partners?.length) return null
      return <g key={id + holder.id} data-rage-trait-ready={id} opacity={alpha}>
        {partners.map((partner, i) => <path key={i} d={path([holder, partner])} stroke={paint.metal}
          fill="none" strokeWidth="2.4" strokeDasharray="6 9" />)}
      </g>
    }
    const offset = marks.slice(0, i).filter((mark) => mark.unit === holder).length
    return <g key={id + holder.id} data-rage-trait-ready={id}
      transform={`translate(${holder.x + (kind === "watch" ? 47 : -47)} ${holder.y + 32 - offset * 20}) scale(.56)`} opacity={alpha}>
      <Plating d={art.shape} paint={paint} fill={.86} weight={3.6} />
    </g>
  })}</>
}

export function EdgeBerserkerTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>
    {battle.runtime.effects.map((fx) => {
      const beat = fx.passive
      const art = beat && berserkerTraitArt(fx.skill)
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const view = { fx, beat, art, paint: colors[fx.rarity], p }
      return <g key={fx.id} data-rage-trait={fx.skill} data-rage-mode={beat.mode} opacity={(1 - unit((p - .22) / .78)) ** 1.2}>
        {layer === "floor" ? <><Ground view={view} />{fx.gold && <GoldGround view={view} />}</>
          : <Front view={view} />}
      </g>
    })}
    <Ready battle={battle} layer={layer} />
  </g>
}
