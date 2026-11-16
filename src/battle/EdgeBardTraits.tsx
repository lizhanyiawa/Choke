import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, armorPaint, at, circlesOf, ease, heading, mix, path, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { bardTraitArt } from "./edgeSkills/bardTraits"
import { along, areaPath, direction, edgeDistance, left, outward, type EdgeArea } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { bardTraitReadiness } from "./edgeSkills/runtime"
import { unitOf, type FieldEffect } from "./edgeSkills/state"

type Art = NonNullable<ReturnType<typeof bardTraitArt>>
type Beat = NonNullable<SkillVisual["passive"]>
type Layer = "floor" | "front"
type Scene = { fx: SkillVisual; beat: Beat; art: Art; paint: ArmorPaint; progress: number; to: EdgePoint }
const series = (count: number) => Array.from({ length: count }, (_, i) => i)
const pose = (p: EdgePoint, angle = 0, size = 1) => `${at(p)} rotate(${angle}) scale(${size})`
const shift = (p: EdgePoint, x: number, y: number) => ({ x: p.x + x, y: p.y + y })
const visible = (from: EdgePoint, to: EdgePoint) => edgeDistance(from, to) > 3

function Emblem({ where, art, paint, size, angle = art.angle }: {
  where: EdgePoint; art: Art; paint: ArmorPaint; size: number; angle?: number
}) {
  return <g transform={pose(where, angle, size)} strokeLinecap="round" strokeLinejoin="round">
    <path d={art.path} fill="none" stroke={paint.ink} strokeWidth="10" strokeOpacity=".76" />
    <path d={art.path} fill={paint.metal} fillOpacity=".10" stroke={paint.light} strokeWidth="3.2" />
  </g>
}

function Chord({ from, to, paint, progress = 1, bend = 0, tint, width = 3, dashed = false, tip = false }: {
  from: EdgePoint; to: EdgePoint; paint: ArmorPaint; progress?: number; bend?: number;
  tint?: string; width?: number; dashed?: boolean; tip?: boolean
}) {
  if (!visible(from, to) || progress <= 0) return null
  const pivot = along(mix(from, to, .48), left(direction(from, to)), bend)
  const control = mix(from, pivot, progress)
  const head = mix(control, mix(pivot, to, progress), progress)
  const d = `M${from.x} ${from.y}Q${control.x} ${control.y} ${head.x} ${head.y}`
  return <g fill="none" strokeLinecap="round">
    <path d={d} stroke={tint ?? paint.metal} strokeWidth={width * 3.1} strokeOpacity=".21" />
    <path d={d} stroke={tint ?? paint.metal} strokeWidth={width} strokeDasharray={dashed ? "7 8" : undefined} />
    {!dashed && <path d={d} stroke={paint.light} strokeWidth={width * .37} />}
    {tip && <path d="M-12-8 1 0-12 8m-4-8h11" transform={pose(head, heading(direction(control, head)))}
      stroke={paint.light} strokeWidth="2.4" />}
  </g>
}

function Staff({ from, to, paint, q, corner }: { from: EdgePoint; to: EdgePoint; paint: ArmorPaint; q: number; corner?: EdgePoint }) {
  const start = corner ?? from
  const span = edgeDistance(start, to)
  if (span < 3) return null
  const axis = heading(direction(start, to))
  const bars = Math.min(10, Math.max(3, Math.round(span / 30)))
  return <>
    {corner && <Chord from={from} to={corner} paint={paint} width={1.7} dashed />}
    <g transform={pose(start, axis)} fill="none" strokeLinecap="round">
      <path d={`M0-8h${span * q}m${-span * q} 16h${span * q}`} stroke={paint.metal} strokeWidth="2.6" />
      <path d="M0-22v44m-9-12h18" stroke={paint.accent} strokeWidth="3.1" />
      {series(bars).map(i => {
        const x = span * (i + 1) / bars
        return x <= span * q + 1 && <path key={i} d={`M${x} ${i % 2 ? -9 : -15}v${i % 2 ? 18 : 30}`}
          stroke={i % 2 ? paint.accent : paint.light} strokeWidth={i === bars - 1 ? 4.8 : 2.4} />
      })}
    </g>
  </>
}

function Wedges({ from, to, paint, q, count = 4 }: { from: EdgePoint; to: EdgePoint; paint: ArmorPaint; q: number; count?: number }) {
  const axis = direction(from, to)
  const span = edgeDistance(from, to)
  if (span < 4) return null
  return <g fill={paint.metal} fillOpacity=".23" stroke={paint.light} strokeWidth="2.5">
    {series(count).map(i => {
      const step = (i + .55) / count
      const where = along(mix(from, to, step), left(axis), i % 2 ? -10 : 10)
      return <path key={i} d="M-8-8 5-6 11 0 5 6-8 8-4 0Z"
        transform={pose(where, heading(axis), .85 + step * .25)} opacity={unit((q - step + .26) * 4.5)} />
    })}
  </g>
}

function RoundPhrase({ where, paint, q, turns = 3, close = false }: {
  where: EdgePoint; paint: ArmorPaint; q: number; turns?: number; close?: boolean
}) {
  const radius = close ? 65 - q * 23 : 32 + q * 29
  const span = 360 / turns
  return <g transform={pose(where, q * (close ? -27 : 26))} fill="none" strokeLinecap="round">
    {series(turns).map(i => <g key={i} stroke={i % 2 ? paint.accent : paint.metal}>
      <path d={arc(radius, i * span + 7, i * span + span - 21)} strokeWidth="3.9" />
      <path d={arc(radius + 9, i * span + 19, i * span + span - 31)} strokeWidth="1.7" opacity=".74" />
    </g>)}
  </g>
}

function AreaPhrase({ area, paint, q, rainbow = false }: { area: EdgeArea; paint: ArmorPaint; q: number; rainbow?: boolean }) {
  return <g fill="none">
    <path d={areaPath(area)} fill={paint.metal} fillOpacity=".085" stroke={paint.accent} strokeWidth="2.4" strokeDasharray="7 7" />
    {circlesOf(area).map(({ center, radius }, i) => <g key={i} transform={pose(center, q * 45)}>
      {series(rainbow ? 5 : 3).map(index => {
        const angle = index * (rainbow ? 72 : 120)
        return <path key={index} d={arc(radius * (.62 + .34 * q), angle - 16, angle + 27)}
          stroke={rainbow ? spectrum[index] : index % 2 ? paint.light : paint.metal} strokeWidth="4.4" strokeLinecap="round" />
      })}
    </g>)}
  </g>
}

function Chorus({ scene, layer }: { scene: Scene; layer: Layer }) {
  const { fx, beat, art, paint, progress, to } = scene
  const q = ease(progress), from = fx.from
  const where = fx.contacts?.[0] ?? to
  const gold = !!fx.gold
  const rainbow = fx.rarity === "Prismatic"
  const axis = direction(from, where)
  const angle = heading(axis)
  const contacts = fx.contacts?.length ? fx.contacts : [where]
  const partners = beat.partners ?? []
  const opening = beat.mode === "travel"
  const bend = art.angle * .35
  const stage = opening ? q : .57 + .43 * q
  const rail = (source = from, end = where, offset = bend, width = 3, tint?: string, tip = false) =>
    <Chord from={source} to={end} paint={paint} progress={stage} bend={offset} width={width} tint={tint} tip={tip} />

  if (layer === "floor") {
    switch (art.gesture) {
      case "relay":
        return <>{rail()}{rail(from, where, -bend * .6, 1.6, paint.accent)}{!opening && <RoundPhrase where={where} paint={paint} q={q} turns={2} />}</>
      case "reach":
        return <Staff from={from} to={where} corner={beat.corner} paint={paint} q={stage} />
      case "plate":
        return <>{rail(from, where, 0, 2.4)}<RoundPhrase where={where} paint={paint} q={q} close turns={3} /></>
      case "foot":
        return <><Wedges from={from} to={beat.landing ?? where} paint={paint} q={q} />
          <path d="M-36 22h72m-53-9 8 9-8 8m17-17 8 9-8 8" transform={pose(where, angle)}
            fill="none" stroke={paint.accent} strokeWidth="3.5" /></>
      case "hush":
        return <>{fx.area && <AreaPhrase area={fx.area} paint={paint} q={q} />}<RoundPhrase where={where} paint={paint} q={q} turns={4} close /></>
      case "mark":
        return <>{rail(from, where, bend * 1.2, 2.4)}<RoundPhrase where={where} paint={paint} q={q} turns={3} close /></>
      case "duet":
        return <>{(partners.length ? partners : [from]).map((partner, i) =>
          <g key={i}>{rail(partner, where, i % 2 ? -bend : bend, 2.7, rainbow ? spectrum[(i + 2) % spectrum.length] : undefined)}</g>)}
          <RoundPhrase where={where} paint={paint} q={q} turns={2} close /></>
      case "empty":
        return <><path d="M-32-22h22m-22 0v44h22m42-44H10m22 0v44H10" transform={pose(from, 0, 1.24 - .4 * q)}
          fill="none" stroke={paint.accent} strokeWidth="3.3" strokeDasharray={q > .7 ? "5 6" : undefined} />
          {contacts.map((target, i) => <g key={i}>{rail(from, target, i % 2 ? -bend : bend, 3.3, rainbow ? spectrum[i % spectrum.length] : undefined)}</g>)}</>
      case "bounce": {
        const loop = fx.skill === "bard/R/G1" || edgeDistance(from, where) < 24
        return loop ? <RoundPhrase where={where} paint={paint} q={q} turns={gold ? 2 : 3} close /> : <>
          {rail(from, where, bend, 3.7, paint.accent, opening)}
          {rail(where, from, bend * .61, 2.1)}
        </>
      }
      case "wind":
        return <>{fx.area && <AreaPhrase area={fx.area} paint={paint} q={q} />}
          {rail(from, where, bend, 4.1, paint.accent, true)}<Wedges from={from} to={where} paint={paint} q={q} count={6} /></>
      case "cross": {
        const endpoint = beat.landing ?? where
        return <>{partners.map((partner, i) => <g key={i}>{rail(partner, fx.skill === "bard/R/G2" ? from : endpoint, 0, 2.1, paint.accent)}</g>)}
          {rail(from, endpoint, gold ? 0 : bend * .45, gold ? 5 : 3.6, undefined, true)}
          <Wedges from={from} to={endpoint} paint={paint} q={stage} /></>
      }
      case "score":
        return <>{(partners.length ? partners : [from]).map((partner, i) => <g key={i}>
          {rail(partner, where, i % 2 ? -bend : bend, 3.5, rainbow ? spectrum[i % spectrum.length] : undefined)}
        </g>)}<RoundPhrase where={where} paint={paint} q={q} turns={rainbow ? 5 : 2} /></>
      case "gate": {
        const crossing = beat.landing ?? beat.trigger ?? where
        return <>{rail(crossing, where, bend * .43, 3.6, paint.accent)}
          <path d="M-10-48h20M-10 48h20M0-48v27m0 42v27M-18-22-4-13l-14 13m0 4 14 10-14 10"
            transform={pose(crossing, heading(outward(crossing)), .68 + .39 * q)}
            fill="none" stroke={rainbow ? spectrum[3] : paint.metal} strokeWidth="4" /></>
      }
      case "fan":
        return <>{fx.area && <AreaPhrase area={fx.area} paint={paint} q={q} rainbow={rainbow} />}
          {contacts.map((target, i) => <g key={i}>{rail(from, target, i % 2 ? -bend : bend, 4.2, rainbow ? spectrum[(i + 1) % spectrum.length] : undefined, opening)}</g>)}</>
      case "field":
        return fx.area ? <AreaPhrase area={fx.area} paint={paint} q={q} /> : <RoundPhrase where={where} paint={paint} q={q} turns={4} />
    }
  }
  const localSize = gold ? .88 + q * .28 : .69 + q * (rainbow ? .37 : .26)
  const mark = opening ? mix(from, where, q) : shift(where, art.angle < 0 ? -24 : 24, 31)
  const turn = art.angle * .33 + (art.gesture === "cross" || art.gesture === "reach" ? angle * .23 : 0)
  const color = rainbow && gold ? spectrum[Math.floor(q * 4)] : paint.accent
  return <>
    {!opening && ["plate", "score", "fan"].includes(art.gesture) && contacts.map((target, i) =>
      <path key={i} d={art.gesture === "plate" ? "M-42-15-17-24 0-16 17-24 42-15v14L0 25-42-1Z"
        : "M-40 16-30 3-10 9 0-7 10 9 30 3 40 16"}
        transform={pose(shift(target, 0, 13), turn * .44, .78 + q * .22)}
        fill={paint.ink} fillOpacity=".19" stroke={color} strokeWidth={gold ? "3.9" : "2.9"} strokeLinejoin="round" />)}
    <Emblem where={mark} art={art} paint={paint} size={opening ? .55 + q * .20 : localSize} angle={turn + (opening ? q * 31 : -q * 9)} />
    {gold && !opening && rainbow && <g transform={pose(mark, q * 30)} fill="none">
      {spectrum.map((tint, i) => <path key={tint} d={arc(51 + q * 12, i * 72 - 10, i * 72 + 18)}
        stroke={tint} strokeWidth={i === 3 ? "4.8" : "3.1"} strokeLinecap="round" />)}
    </g>}
  </>
}

export function EdgeBardTraitField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  const id = field.cast.signature?.id
  const art = bardTraitArt(id)
  if (!id || !art || field.until <= battle.time) return null
  const rarity = id.split("/")[1] as Rarity
  const paint = armorPaint[rarity]
  const { center } = field.area
  const elapsed = battle.time - field.time
  const live = Math.min(unit(elapsed / .18), unit((field.until - battle.time) / .28))
  const q = .5 + .5 * Math.sin(elapsed * 4.5)
  const shore = id === "bard/Prismatic/G2"
  const axis = outward(center)
  return <g data-bard-trait-field={id} opacity={live * .83} pointerEvents="none">
    <AreaPhrase area={field.area} paint={paint} q={q} rainbow={shore} />
    {shore ? <g transform={pose(center, heading(axis))} fill="none">
      {spectrum.map((tint, i) => <path key={tint} d={path([{ x: -86, y: (i - 2) * 18 },
        { x: -23 - q * 13, y: (i - 2) * 18 }, { x: -37 - q * 13, y: (i - 2) * 18 - 8 }])}
        stroke={tint} strokeWidth={i === 2 ? "5" : "3.2"} strokeLinecap="round" />)}
      <path d="M0-86v42m0 88v42m-7-124v76" stroke={paint.light} strokeWidth="4" />
    </g> : <>
      <Chord from={shift(center, -58, -34)} to={shift(center, 58, 34)} paint={paint} bend={26} />
      <Chord from={shift(center, -58, 34)} to={shift(center, 58, -34)} paint={paint} bend={-26} tint={paint.accent} />
    </>}
    <Emblem where={shore ? along(center, left(axis), -73) : shift(center, 0, 62)} art={art} paint={paint} size={.61 + .08 * q} />
  </g>
}

export function EdgeBardTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden="true" pointerEvents="none">
    {battle.runtime.effects.map(fx => {
      const beat = fx.passive
      const art = beat && bardTraitArt(fx.skill)
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const tracked = beat.mode === "travel" ? unitOf(battle, fx.target) : undefined
      if (tracked && !tracked.hp) return null
      const turning = fx.skill === "bard/R/G2" && beat.mode === "travel"
      if (turning && tracked && (!tracked.force || edgeDistance(tracked.force.end, fx.to) > 3)) return null
      const progress = turning && tracked ? unit(edgeDistance(fx.from, tracked) / Math.max(1, edgeDistance(fx.from, fx.to)))
        : unit((battle.time - fx.start) / (fx.end - fx.start))
      const opacity = beat.mode === "travel" ? .94 : Math.min(1, .52 + progress * 3) * (1 - progress ** 1.65)
      return <g key={fx.id} data-bard-trait={fx.skill} data-bard-trait-mode={beat.mode} opacity={opacity}>
        <Chorus scene={{ fx, beat, art, paint: armorPaint[fx.rarity], progress, to: tracked ?? fx.to }} layer={layer} />
      </g>
    })}
    {bardTraitReadiness(battle).map(({ id, unit: holder, kind, anchor, until, partners }) => {
      const art = bardTraitArt(id)
      if (!art) return null
      const paint = armorPaint[id.split("/")[1] as Rarity]
      const q = .5 + Math.sin(battle.time * 4 + holder.x * .016) * .5
      const fade = until === undefined ? 1 : unit((until - battle.time) / .24)
      return <g key={id + "@" + holder.id} data-bard-trait-ready={id} opacity={fade * (.59 + q * .15)}>
        {layer === "floor" ? <>
          {partners?.map((partner, i) => <Chord key={i} from={partner} to={holder} paint={paint} bend={i % 2 ? -16 : 16} width={2} dashed />)}
          {id === "bard/E/P6" && anchor && <Chord from={anchor} to={holder} paint={paint} bend={-14} width={2} dashed />}
          {kind === "stance" && !partners?.length && <RoundPhrase where={holder} paint={paint} q={q} turns={2} close />}
        </> : <Emblem where={shift(holder, -41, -22 - q * 4)} art={art} paint={paint}
          size={kind === "stance" ? .43 : .49 + q * .055} angle={art.angle * .29} />}
      </g>
    })}
  </g>
}
