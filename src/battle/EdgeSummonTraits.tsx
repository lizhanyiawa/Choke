import { RARITY_COLOR } from "@/desk/rarity"
import type { EdgeBattle, EdgeUnitId } from "./edgeBattle"
import { along, clamp, direction, edgeDistance, left, outward, rotate, type EdgePoint } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { summonTraitReadiness } from "./edgeSkills/runtime"
import { unitOf } from "./edgeSkills/state"
import { summonTraitArt, type SummonGesture } from "./edgeSkills/summonTraits"

const white = "#fff4fb"
const cyan = "#a9e0ff"
const pink = "#ffafd9"
const amber = "#ffda97"
const shadow = "#32253e"
const bright = "#ffe4aa"
const xy = ({ x, y }: EdgePoint) => x + " " + y
const line = (...points: EdgePoint[]) => "M" + points.map(xy).join("L")
const at = (point: EdgePoint, axis?: EdgePoint) => "translate(" + xy(point) + ")" +
  (axis ? " rotate(" + Math.atan2(axis.y, axis.x) * 180 / Math.PI + ")" : "")
const mix = (a: EdgePoint, b: EdgePoint, n: number) => ({ x: a.x + (b.x - a.x) * n, y: a.y + (b.y - a.y) * n })
const open = (p: number) => 1 - (1 - p) ** 3

function Stroke({ d, color, width = 3, dash }: { d: string; color: string; width?: number; dash?: string }) {
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
}

function Seal({ d, point, axis, scale, color }: { d: string; point: EdgePoint; axis?: EdgePoint; scale: number; color: string }) {
  return <g transform={at(point, axis) + " scale(" + scale + ")"} strokeLinejoin="round" strokeLinecap="round">
    <path d={d} stroke={shadow} strokeWidth="6.8" fill={shadow} fillOpacity=".45" />
    <path d={d} stroke={color} strokeWidth="3.4" fill={color} fillOpacity=".14" />
  </g>
}

type View = {
  fx: SkillVisual
  beat: NonNullable<SkillVisual["passive"]>
  gesture: SummonGesture
  d: string
  p: number
  tint: string
}

function motionLine(from: EdgePoint, to: EdgePoint, bend: number) {
  const mid = along(mix(from, to, .5), left(direction(from, to)), bend)
  return { d: "M" + xy(from) + "Q" + xy(mid) + " " + xy(to), mid }
}

function PaperTrail({ from, to, p, tint, bend = 21 }: {
  from: EdgePoint; to: EdgePoint; p: number; tint: string; bend?: number
}) {
  if (edgeDistance(from, to) < 13) return null
  const curve = motionLine(from, to, bend)
  return <g>
    <Stroke d={curve.d} color={tint} width={2.7} dash="7 6" />
    {[.05, .28, .51].map((start, i) => {
      const t = clamp(start + p * .47, 0, 1)
      const here = mix(mix(from, curve.mid, t), mix(curve.mid, to, t), t)
      return <path key={start} d="M-7-4 6-6 10 1-4 8Z" fill={i === 2 ? white : tint} opacity={.5 + i * .17}
        transform={at(here, direction(here, to))} />
    })}
  </g>
}

function LandingLine({ from, to, tint }: { from: EdgePoint; to: EdgePoint; tint: string }) {
  if (edgeDistance(from, to) < 3) return null
  return <g>
    <Stroke d={line(from, to)} color={tint} width={3.4} dash="5 6" />
    <path d="M-17-13-7-9 6 0-7 9-17 13-7 0Z" transform={at(to, direction(from, to))} fill={white} stroke={tint} strokeWidth="2" />
  </g>
}

function PassivePaper({ view }: { view: View }) {
  const { fx, beat, gesture, d, p, tint } = view
  const source = beat.anchor ?? fx.from
  const receiver = beat.receiver
  const { to } = fx
  const used = beat.mode === "consume"
  const steady = beat.mode === "stance"
  const primary = fx.rarity === "Prismatic" ? 1.14 : fx.rarity === "Radiant" ? 1.05 : .92
  const size = primary * (.82 + Math.sin(Math.PI * clamp(p + .08, 0, 1)) * .27)
  const seal = (point: EdgePoint, scale = size, color = tint, axis?: EdgePoint) =>
    <Seal d={d} point={point} axis={axis} scale={scale} color={color} />
  const axis = direction(source, to)
  switch (gesture) {
    case "echo": {
      const start = used ? fx.from : source
      const end = used ? to : receiver
      const aim = direction(start, end)
      return <>
        <PaperTrail from={start} to={end} p={p} tint={tint} bend={-18} />
        <g transform={at(end, aim)}>
          <Stroke d="M-31-16Q-8 0-31 16m-9-20q13 4 0 8" color={white} width={3.4} />
        </g>
        {seal(end, size, used ? white : tint, aim)}
      </>
    }
    case "band": {
      const end = beat.landing ?? to
      const rim = fx.skill === "summoner/UC/P7" ? outward(end) : edgeDistance(to, end) > 4 ? direction(to, end) : axis
      return <>
        {beat.landing && <LandingLine from={to} to={end} tint={tint} />}
        {seal(end, size, white, rim)}
        <g transform={at(end, rim)}>
          <Stroke d="M-36-17-15-17l17 8m-38 26h21l17-8" color={tint} width={4.1} />
        </g>
        {edgeDistance(receiver, to) > 42 && <PaperTrail from={to} to={receiver} p={p} tint={tint} />}
      </>
    }
    case "brace": case "shell": {
      const place = used ? to : receiver
      const aim = direction(source, place)
      const shift = (used ? p : 1 - p) * 19
      return <>
        <PaperTrail from={source} to={place} p={p} tint={cyan} bend={-14} />
        <g transform={at(place, gesture === "shell" ? aim : undefined)} fill={tint} fillOpacity=".34" stroke={white} strokeWidth="3">
          <path d={gesture === "shell" ? "M-37-13-20-32-5-17-12 13-30 21Z" : "M-34-19-16-25-12 8-25 18-36 6Z"}
            transform={"translate(" + -shift + " 0)"} />
          <path d={gesture === "shell" ? "M37-13 20-32 5-17 12 13 30 21Z" : "M34-19 16-25 12 8 25 18 36 6Z"}
            transform={"translate(" + shift + " 0)"} />
        </g>
        {seal(place, size * .92, used ? white : cyan)}
        {used && beat.landing && <LandingLine from={place} to={beat.landing} tint={tint} />}
      </>
    }
    case "scar": {
      const end = used ? to : beat.landing ?? to
      return <>
        <PaperTrail from={used ? fx.from : source} to={end} p={p} tint={tint} />
        {beat.partners?.length === 2 && !used && <Stroke d={line(beat.partners[0], end, beat.partners[1])} color={cyan} width={3.2} dash="9 5" />}
        {seal(along(end, { x: 0, y: -1 }, used ? -17 * p : 31 * (1 - p)), size, used ? white : tint)}
        <g transform={at(end)}>
          <Stroke d={used ? "M-34 14l16-7m36 0 16 7M-8 33l8-11 8 11" : "M-28 17-15 25H15l13-8M0 25v10"} color={pink} width={3.5} />
        </g>
      </>
    }
    case "thread": {
      const end = used ? to : receiver
      const a = motionLine(source, end, 27)
      const b = motionLine(source, end, -15)
      return <>
        {edgeDistance(source, end) > 12 && <>
          <Stroke d={a.d} color={steady ? white : tint} width={steady ? 4.3 : 3.2} />
          <Stroke d={b.d} color={cyan} dash="5 7" />
        </>}
        {seal(end, size, steady ? white : tint)}
        {used && beat.landing && <LandingLine from={to} to={beat.landing} tint={tint} />}
      </>
    }
    case "step": {
      const end = beat.landing ?? to
      const aim = direction(fx.from, end)
      return <>
        <Stroke d={line(fx.from, end)} color={tint} dash="6 8" />
        {[.27, .52, .78].map((spot, i) => <path key={spot} d="M-9-10 6-6 12 0 6 6-9 10-2 0Z"
          transform={at(mix(fx.from, end, Math.min(1, spot + p * .13)), aim)} fill={i === 2 ? white : tint}
          opacity={i === 2 ? .86 : .44} />)}
        {seal(end, size, white, aim)}
      </>
    }
    case "fold": {
      const start = used ? fx.from : source
      const end = used ? to : receiver
      const tip = mix(start, end, open(p))
      return <>
        <PaperTrail from={start} to={end} p={p} tint={tint} bend={33} />
        <g transform={at(tip, direction(start, end))}>
          <path d="M-30-21-7-15 14-2-4 1-21-8Z M-30 21-7 15 14 2-4-1-21 8Z" fill={tint} fillOpacity=".52" stroke={white} strokeWidth="2.8" />
        </g>
        {seal(end, size, used ? white : tint)}
      </>
    }
    case "seed": {
      const aim = direction(source, receiver)
      return <>
        <PaperTrail from={source} to={receiver} p={p} tint={pink} bend={-29} />
        <g transform={at(receiver, aim)} fill={tint} fillOpacity=".31" stroke={white} strokeWidth="3.4">
          <path d="M-20 23Q-33 1-17-14-6-2-3 9-7 21Z" transform={"rotate(" + -p * 24 + ")"} />
          <path d="M20-23Q33-1 17 14 6 2 3-9 7-21Z" transform={"rotate(" + p * 24 + ")"} />
        </g>
        {seal(receiver, size * .9, white)}
      </>
    }
    case "toll":
      return <>
        <PaperTrail from={source} to={used ? to : receiver} p={p} tint={tint} bend={14} />
        {[.62, 1.09].map((n) => <ellipse key={n} cx={to.x} cy={to.y + 16} rx={n * (25 + p * 24)} ry={n * (9 + p * 10)}
          fill="none" stroke={n > 1 ? cyan : tint} strokeWidth="3" strokeDasharray={n > 1 ? "8 5" : undefined} />)}
        {seal(used ? to : receiver, size, white)}
      </>
  }
}

function GoldPaper({ view }: { view: View }) {
  const { fx, beat, d, p } = view
  const source = fx.from
  const target = fx.to
  const contact = beat.trigger ?? target
  const targets = fx.contacts ?? [target]
  const axis = direction(source, target)
  const emblem = (point: EdgePoint, size = 1) => <Seal d={d} point={point} scale={size} color={bright} />
  const receives = (color: string) => targets.map((to, i) =>
    <g key={i}><PaperTrail from={source} to={to} p={p} tint={color} />{emblem(to, 1.04)}</g>)
  if (beat.mode === "consume") return <PassivePaper view={{ ...view, tint: bright }} />
  switch (fx.skill) {
    case "summoner/C/G1":
      return <>
        <g transform={at(target, axis)}>
          <Stroke d="M-25-18-8-8M-25 18-8 8M13-16 25-8m-12 24 12-8" color={amber} width={4.2} />
        </g>
        {emblem(target, .9 + p * .22)}
      </>
    case "summoner/C/G2":
      return <>
        <PaperTrail from={source} to={target} p={p} tint={cyan} bend={-16} />
        <g transform={at(target)} fill={amber} fillOpacity=".48" stroke={white} strokeWidth="3">
          <path d="M-25 15-14-13 0-26 4-5-7 16Z" transform={"translate(0 " + -p * 21 + ")"} />
          <path d="M25 15 14-13 0-26-4-5 7 16Z" transform={"translate(0 " + -p * 21 + ")"} />
        </g>
        {emblem(target, 1.12)}
      </>
    case "summoner/UC/G1":
      return <>
        {[0, 72, 144, 216, 288].map((angle) => {
          const axis = rotate({ x: 1, y: 0 }, angle)
          return <path key={angle} d="M-10-8 13-4 9 10-12 5Z"
            transform={at(along(source, axis, 27 + p * 46), axis)} fill={angle % 144 ? cyan : amber} />
        })}
        {receives(amber)}
      </>
    case "summoner/UC/G2":
      return <>
        <PaperTrail from={source} to={target} p={p} tint={cyan} bend={-12} />
        <g transform={at(target)}><Stroke d="M-32 22-20 29-6 25m38-3-12 7-14-4M-17 31v12m34-12v12" color={white} width={4.8} /></g>
        {emblem(target)}
      </>
    case "summoner/R/G1": case "summoner/Radiant/G1":
      return targets.map((to, i) => {
        const hit = fx.area?.center ?? contact
        const end = beat.landings?.[i] ?? to
        const push = direction(to, end)
        const brightShadow = fx.skill === "summoner/Radiant/G1"
        return <g key={i}>
          <g transform={at(hit, push)}>
            <path d={brightShadow ? "M-25-28-9-22 15-30 41-15 25-3 43 4 18 20-12 15-36 22-21 0Z"
              : "M-18-25Q9-29 40 0 9 29-18 25-4 0Z"} fill={brightShadow ? pink : amber} fillOpacity=".45"
              stroke={bright} strokeWidth="3.5" transform={"translate(" + p * 41 + " 0)"} />
          </g>
          <LandingLine from={to} to={end} tint={bright} />
          {emblem(end, .94)}
        </g>
      })
    case "summoner/R/G2":
      return <>
        <Stroke d={line(source, target)} color={cyan} dash="9 5" width={3.8} />
        <path d="M-25 20H25L9 30H-9Z M-10 19-4-18H4l6 37Z" transform={at(target)}
          fill={amber} stroke={white} strokeWidth="3.2" />
        {emblem(target, .96)}
      </>
    case "summoner/E/G1": {
      const part = fx.area?.parts[0]
      const radius = part?.kind === "circle" ? part.radius : 68
      return <g>
        <circle cx={source.x} cy={source.y} r={radius * (.43 + .57 * open(p))} fill={cyan} fillOpacity=".14"
          stroke={bright} strokeWidth="5" strokeDasharray="11 7 5 7" />
        <g transform={at(source)}>
          <Stroke d="M-31-12 0-34 31-12M-31 12 0 34 31 12" color={white} width={4.7} />
        </g>
        {targets.map((to, i) => <g key={i}>{emblem(to, .87)}</g>)}
      </g>
    }
    case "summoner/E/G2":
      return <g transform={at(target)}>
        <path d="M-45 16-28-15Q0-45 28-15L45 16 22 26H-22Z" fill={shadow} fillOpacity=".6"
          stroke={amber} strokeWidth="4.3" transform={"translate(0 " + -21 * (1 - p) + ")"} />
        <Stroke d="M-36 17H36M-30 23h60M-21 17v18M0 17v21m21-21v18" color={white} width={3.3} />
      </g>
    case "summoner/L/G1": {
      const end = beat.landings?.[0] ?? target
      return <>
        <Stroke d={line(source, target, end)} color={bright} width={4.8} dash="9 6" />
        <path d="M-24-14 5-22 27-7 14 17-15 23-28 7Z" transform={at(target, axis) + " rotate(" + p * 26 + ")"}
          fill={cyan} fillOpacity=".41" stroke={white} strokeWidth="3.5" />
        <LandingLine from={target} to={end} tint={bright} />
        {emblem(end, .86)}
      </>
    }
    case "summoner/L/G2":
      return <>
        <PaperTrail from={source} to={target} p={p} tint={bright} />
        <g transform={at(target) + " rotate(" + p * 16 + ")"}>
          {[0, 60, 120, 180, 240, 300].map((angle) =>
            <path key={angle} d="M-11-36 0-44 11-36 6-23H-6Z" transform={"rotate(" + angle + ")"} fill={amber}
              fillOpacity=".51" stroke={white} strokeWidth="2.7" />)}
        </g>
        {emblem(target, 1.01)}
      </>
    case "summoner/Radiant/G2":
      return <>
        <Stroke d={motionLine(source, contact, -17).d} color={pink} width={4.3} />
        <PaperTrail from={contact} to={target} p={p} tint={bright} bend={34} />
        <path d="M-31-15-13-25 2-9 15-23 32-13 20 15 1 22-19 14Z"
          transform={at(target, direction(contact, target))} fill={pink} fillOpacity=".45" stroke={white} strokeWidth="3.6" />
        {emblem(target, 1.14)}
      </>
    case "summoner/Prismatic/G1":
      return <>
        {(beat.partners ?? []).filter((p) => edgeDistance(p, source) > 5).map((partner, i) =>
          <Stroke key={i} d={motionLine(partner, source, i ? 28 : -28).d} color={i ? pink : cyan} width={4.4} dash="11 5" />)}
        {targets.map((to, i) => <g key={i}>
          <PaperTrail from={source} to={to} p={p} tint={i % 2 ? cyan : pink} />
          <path d="M0-42 38-17 38 18 0 42-38 18-38-17Z M0-31 28-12v24L0 31-28 12v-24Z"
            transform={at(to) + " rotate(" + p * 23 + ")"} fill={cyan} fillOpacity=".25" fillRule="evenodd" stroke={bright} strokeWidth="3.5" />
          {emblem(to, 1.07)}
        </g>)}
      </>
    case "summoner/Prismatic/G2": {
      const apex = along(mix(contact, target, .52), left(direction(contact, target)), 33)
      return <>
        <Stroke d={line(source, contact, apex, target)} color={pink} width={6.3} />
        <Stroke d={line(contact, along(apex, left(direction(contact, target)), -18), target)} color={cyan} width={5.3} />
        <path d="M-21-16 0-24 21-16 13 10 0 19-13 10Z" transform={at(contact)} fill={pink} fillOpacity=".5" stroke={white} strokeWidth="3.1" />
        {emblem(target, 1.22)}
      </>
    }
    default: return <PassivePaper view={view} />
  }
}

export function EdgeSummonTraits({ battle }: { battle: EdgeBattle }) {
  const counts = new Map<EdgeUnitId, number>()
  return <g className="edge-summon-traits" pointerEvents="none" aria-hidden="true">
    {summonTraitReadiness(battle).map(({ id, unit, kind, until, anchor }) => {
      const art = summonTraitArt(id)!
      const index = counts.get(unit.id) ?? 0
      counts.set(unit.id, index + 1)
      const mark = { x: unit.x - 29 + 23 * index, y: unit.y + 35 }
      const tint = kind === "watch" ? pink : kind === "shield" ? cyan : amber
      return <g key={id + "@" + unit.id} data-summon-trait-ready={kind} data-skill-vfx={id}
        opacity={until === undefined ? .75 : clamp((until - battle.time) / .4, 0, .86)}>
        {anchor && <Stroke d={line(anchor, unit)} color={cyan} width={2.2} dash="4 8" />}
        <Seal d={art.path} point={mark} scale={.49} color={tint} />
      </g>
    })}
    {battle.runtime.effects.map((fx) => {
      const art = summonTraitArt(fx.skill)
      const beat = fx.passive
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const p = clamp((battle.time - fx.start) / (fx.end - fx.start), 0, 1)
      const tint = fx.gold ? bright : RARITY_COLOR[fx.rarity]
      const view = { fx, beat, gesture: art.gesture, d: art.path, p, tint }
      if (beat.mode === "travel") {
        const target = unitOf(battle, fx.target) ?? fx.to
        const tip = mix(fx.from, target, p)
        const tail = mix(fx.from, target, Math.max(0, p - .32))
        return <g key={fx.id} data-summon-trait-beat="travel" data-skill-vfx={fx.skill}>
          <Stroke d={line(tail, tip)} color={amber} width={5.2} />
          <path d="M-15-7 11 0-15 7-7 0Z" transform={at(tip, direction(fx.from, target))} fill={white} stroke={amber} strokeWidth="2.6" />
        </g>
      }
      return <g key={fx.id} data-summon-trait-beat={beat.mode} data-skill-vfx={fx.skill}
        data-trait-gesture={art.gesture} opacity={1 - p ** 1.7}>
        {fx.gold ? <GoldPaper view={view} /> : <PassivePaper view={view} />}
      </g>
    })}
  </g>
}
