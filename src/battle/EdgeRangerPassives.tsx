import { RARITY_COLOR } from "@/desk/rarity"
import type { EdgeBattle, EdgeUnitId } from "./edgeBattle"
import { along, areaHits, clamp, direction, edgeDistance, left, outward, type EdgePoint } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { rangerPassiveArt, type PassiveGesture } from "./edgeSkills/rangerPassives"
import { rangerPassiveReadiness } from "./edgeSkills/runtime"

const white = "#fff4fc"
const sky = "#b5e6ff"
const rose = "#ffb4dc"
const gold = "#ffdc9b"
const dark = "#35243f"
const textPoint = ({ x, y }: EdgePoint) => x + " " + y
const path = (...points: EdgePoint[]) => "M" + points.map(textPoint).join("L")
const at = (point: EdgePoint, axis?: EdgePoint) => "translate(" + textPoint(point) + ")" +
  (axis ? " rotate(" + Math.atan2(axis.y, axis.x) * 180 / Math.PI + ")" : "")
const mix = (a: EdgePoint, b: EdgePoint, n: number) => ({ x: a.x + (b.x - a.x) * n, y: a.y + (b.y - a.y) * n })

function Stroke({ d, tint, width = 3, dashed }: { d: string; tint: string; width?: number; dashed?: boolean }) {
  return <path d={d} fill="none" stroke={tint} strokeWidth={width} strokeLinecap="round"
    strokeLinejoin="round" strokeDasharray={dashed ? "6 7" : undefined} />
}

function Insignia({ d, at: where, axis, size, tint, closed = false }: {
  d: string; at: EdgePoint; axis?: EdgePoint; size: number; tint: string; closed?: boolean
}) {
  return <g transform={at(where, axis) + " scale(" + size + ")"} strokeLinejoin="round" strokeLinecap="round">
    <path d={d} fill="none" stroke={dark} strokeWidth="7" strokeOpacity=".73" />
    <path d={d} fill={closed ? tint : "none"} fillOpacity=".16" stroke={tint} strokeWidth="3.6" />
  </g>
}

function MoveEcho({ fx, progress: p, tint }: { fx: SkillVisual & { passive: NonNullable<SkillVisual["passive"]> }; progress: number; tint: string }) {
  const { from, to, passive } = fx
  const end = passive.landing ?? to
  const axis = direction(from, end)
  return <g>
    <Stroke d={path(from, end)} tint={tint} dashed width={2.7} />
    {[.2, .45, .7].map((step, i) => <path key={step} d="M-6-13 6-7 11 0 6 7-6 13 1 0Z"
      transform={at(mix(from, end, step + .16 * p), axis)} fill={i === 2 ? white : tint} opacity={.38 + i * .22} />)}
  </g>
}

function PassiveBeat({ fx, gesture, d, p }: {
  fx: SkillVisual & { passive: NonNullable<SkillVisual["passive"]> }; gesture: PassiveGesture; d: string; p: number
}) {
  const { from, to, passive } = fx
  const { owner, receiver, landing, mode } = passive
  const spent = mode === "consume"
  const stance = mode === "stance"
  const axis = direction(from, to)
  const strength = Math.sin(Math.PI * clamp(p * 1.18 + .14, 0, 1))
  const rare = fx.rarity === "Prismatic"
  const size = (rare ? 1.22 : fx.rarity === "Radiant" ? 1.11 : .91) * (.78 + strength * .29)
  const tint = rare ? (spent ? sky : "#edc5ff") : RARITY_COLOR[fx.rarity]
  const aim = gesture === "sight" || gesture === "footwork" || gesture === "edge" || gesture === "shift" ? axis : undefined
  const glyph = (where: EdgePoint, scale = size, color = tint, vector = aim, closed = false) =>
    <Insignia d={d} at={where} axis={vector} size={scale} tint={color} closed={closed} />
  switch (gesture) {
    case "sight": {
      const distance = edgeDistance(from, to)
      const vector = direction(from, to)
      const y = fx.skill === "ranger/R/P7" ? 0 : 7
      const track = fx.skill === "ranger/R/P7" ? to : along(from, vector, distance * (.73 + .27 * p))
      return <>
        {distance > 30 && <g>
          <Stroke d={path(along(from, left(vector), y), along(track, left(vector), y))} tint={tint} dashed width={2.5} />
          <Stroke d={path(along(from, left(vector), -11), along(track, left(vector), -11))} tint={white} width={spent || stance ? 3.4 : 2.2} />
        </g>}
        {glyph(spent || stance || fx.skill === "ranger/C/P6" || fx.skill === "ranger/UC/P7" ? to : receiver, size, white)}
      </>
    }
    case "return": {
      const start = spent ? from : to
      const end = spent ? to : receiver
      const bend = along(mix(start, end, .5), left(direction(start, end)), Math.min(41, edgeDistance(start, end) / 3))
      const where = mix(mix(start, bend, p), mix(bend, end, p), p)
      return <>
        {edgeDistance(start, end) > 20 && <Stroke d={"M" + textPoint(start) + "Q" + textPoint(bend) + " " + textPoint(end)}
          tint={tint} dashed width={2.7} />}
        {glyph(where, size * .88, white, direction(start, end))}
        {spent && fx.skill === "ranger/Prismatic/P8" && <g transform={at(to, direction(start, end))}>
          <path d="M-48-33-13-44 16-34-4-24-32-25Z" fill={sky} transform={"translate(0 " + -p * 20 + ")"} />
          <path d="M-43 29-17 20 17 32-9 43-33 39Z" fill={rose} transform={"translate(0 " + p * 20 + ")"} />
        </g>}
        <g transform={at(end)}>
          <Stroke d="M-22 24Q0 35 22 24" tint={rose} width={3.1} />
        </g>
      </>
    }
    case "pin": {
      const marked = fx.skill === "ranger/Prismatic/P7" && !spent ? landing ?? to : to
      const where = along(marked, { x: 0, y: -1 }, spent ? -19 * p : 37 * (1 - p))
      return <>
        {glyph(where, size, spent ? white : tint, undefined, true)}
        <g transform={at(marked)}>
          <Stroke d={spent ? "M-30 14l12-9m36 0 12 9M-5 30l5-10 5 10" : "M-27 13-16 19H16l11-6M0 19v12"}
            tint={spent ? gold : tint} width={3.1} />
        </g>
        {landing && spent && <Stroke d={path(to, landing)} tint={gold} width={3.1} dashed />}
      </>
    }
    case "guard": {
      const where = spent ? to : receiver
      const offset = spent ? p * 19 : (1 - p) * 19
      if (fx.skill === "ranger/Radiant/P8") return <>
        {fx.contacts?.map((threat, i) => {
          const axis = direction(owner, threat)
          return <g key={i} transform={at(along(owner, axis, 35 + offset), axis)}>
            <path d="M9-25-13-15-18 0-13 15 9 25 1 0Z" fill={i ? sky : rose} fillOpacity=".44" stroke={white} strokeWidth="3.6" />
            <Stroke d="M-11-9-19 0-11 9" tint={gold} />
          </g>
        })}
        {glyph(where, size, white, undefined, true)}
      </>
      return <>
        {edgeDistance(to, where) > 36 && <Stroke d={path(to, where)} tint={sky} width={2.5} dashed />}
        <g transform={at(where)} fill={sky} fillOpacity=".24" stroke={sky} strokeWidth="3.2">
          <path d="M-36-12-21-24-16 8-27 18-37 7Z" transform={"translate(" + -offset + " 0)"} />
          <path d="M36-12 21-24 16 8 27 18 37 7Z" transform={"translate(" + offset + " 0)"} />
        </g>
        {glyph(where, size, spent ? white : tint, undefined, true)}
      </>
    }
    case "footwork":
      if (fx.skill === "ranger/C/P7" && stance) return <g transform={at(to, axis)}>
        <Stroke d="M-30-27-17-14v28l-13 13M-23-29-7-18v36l-16 11" tint={sky} width={3.8} />
      </g>
      return <>
        <MoveEcho fx={fx} progress={p} tint={tint} />
        {glyph(landing ?? to, size, stance ? sky : white)}
      </>
    case "cut":
      return <>
        <g transform={at(to, axis)}>
          <Stroke d="M-26-24-2-9 15-18m-34 45L3 9l21 8" tint={rose} width={4.2} />
        </g>
        {glyph(to, size, white)}
      </>
    case "bow": {
      const settled = fx.skill === "ranger/C/P3"
      const span = (settled ? 32 : 19) + 17 * (1 - p)
      return <>
        <g transform={at(to, axis)} fill="none" stroke={white} strokeWidth="3.2">
          <path d={"M-26 " + -span + " 10 " + -span * .42 + " 25 0M-26 " + span + " 10 " + span * .42 + " 25 0"} />
        </g>
        {glyph(settled ? { x: to.x, y: to.y + 25 } : spent ? to : receiver, size * .92, tint)}
      </>
    }
    case "shift": {
      const bend = along(mix(from, to, .53), left(axis), 32)
      return <>
        <Stroke d={path(from, bend, to)} tint={tint} width={3.3} dashed />
        {glyph(bend, size * .64, tint)}
        {glyph(to, size, white)}
        {landing && <Stroke d={path(to, landing)} tint={white} width={2.5} dashed />}
      </>
    }
    case "split": {
      if (fx.skill === "ranger/Prismatic/P4" && fx.area) {
        const mirror = fx.area.center
        const angle = direction(from, mirror)
        return <>
          <Stroke d={path(from, to, mirror)} tint={white} width={3.5} dashed />
          <g transform={at(from, angle)}>
            <Stroke d="M-5-28-31 0-5 28 15 14" tint={rose} width={4.2} />
          </g>
          <g transform={at(mirror, angle)}>
            <Stroke d="M5-28 31 0 5 28-15 14" tint={sky} width={4.2} />
          </g>
          {glyph(to, size, white, angle)}
        </>
      }
      const area = fx.skill === "ranger/Prismatic/P5" ? fx.area : undefined
      const rail = area?.parts.find((part) => areaHits({ center: area.center, parts: [part] }, to))
      if (rail?.kind === "polygon" && rail.points.length === 4) {
        const [a, b, c, d] = rail.points
        const head = mix(mix(a, b, .5), mix(c, d, .5), .38 + p * .62)
        return <>
          <path d={path(a, b, c, d) + "Z"} fill={sky} fillOpacity=".19" stroke={sky} strokeWidth="4" strokeDasharray="13 7" />
          <Stroke d={path(mix(a, b, .5), head)} tint={white} width={5.2} />
          {glyph(to, size, white)}
        </>
      }
      return <>
        <g transform={at(to, axis)} fill={tint} fillOpacity=".3" stroke={tint} strokeWidth="3">
          <path d="M-20-15-4-21 16-9 4-1Z" transform={"translate(" + -p * 25 + " " + -p * 22 + ")"} />
          <path d="M20 15 4 21-16 9-4 1Z" transform={"translate(" + p * 25 + " " + p * 22 + ")"} />
        </g>
        {glyph(to, size, white, axis)}
      </>
    }
    case "edge": {
      const position = fx.skill === "ranger/UC/P3" && !spent ? receiver : landing ?? to
      const vector = landing ? direction(to, landing) : stance ? outward(owner) : axis
      return <>
        {landing && edgeDistance(to, landing) > 4 && <Stroke d={path(to, landing)} tint={tint} width={3.4} dashed />}
        {glyph(position, size, stance ? sky : white, vector, true)}
        <g transform={at(position, vector)}>
          <Stroke d="M-12-22 8-12m-20 34 20-10" tint={gold} width={3.2} />
        </g>
      </>
    }
  }
}

export function EdgeRangerPassives({ battle }: { battle: EdgeBattle }) {
  const offsets = new Map<EdgeUnitId, number>()
  return <g pointerEvents="none" aria-hidden="true" className="edge-ranger-passives">
    {rangerPassiveReadiness(battle).map(({ id, unit, until, kind }) => {
      const art = rangerPassiveArt(id)!
      const index = offsets.get(unit.id) ?? 0
      offsets.set(unit.id, index + 1)
      const color = kind === "watch" ? rose : kind === "shield" ? sky : gold
      const point = { x: unit.x - 28 + index * 24, y: unit.y + 32 }
      const fade = until === undefined ? .84 : clamp((until - battle.time) / .42, 0, .88)
      return <g key={id + "@" + unit.id} data-ranger-passive-ready={kind} data-skill-vfx={id} opacity={fade}>
        <Insignia d={art.path} at={point} size={.49} tint={color} closed />
      </g>
    })}
    {battle.runtime.effects.map((fx) => {
      const art = rangerPassiveArt(fx.skill)
      if (!art || !fx.passive || battle.time < fx.start || battle.time >= fx.end) return null
      const progress = clamp((battle.time - fx.start) / (fx.end - fx.start), 0, 1)
      return <g key={fx.id} data-skill-vfx={fx.skill} data-ranger-passive-beat={fx.passive.mode}
        data-passive-gesture={art.gesture} opacity={1 - progress ** 1.72}>
        <PassiveBeat fx={{ ...fx, passive: fx.passive }} gesture={art.gesture} d={art.path} p={progress} />
      </g>
    })}
  </g>
}
