import type { ReactNode } from "react"
import { RARITY_COLOR } from "@/desk/rarity"

import type { EdgeBattle } from "./edgeBattle"
import {
  along, areaPath, clamp, direction, edgeDistance, left, outward, rotate, type EdgePoint,
} from "./edgeSkills/geometry"
import type { SkillVisual, SummonBeat } from "./edgeSkills/presentation"
import { unitOf } from "./edgeSkills/state"
import { SUMMON_CHOREOGRAPHY } from "./edgeSkills/summonChoreo"

const ivory = "#fff5fc"
const sky = "#a8deff"
const amber = "#ffd288"
const rose = "#ff92bf"
const violet = "#d7a9ff"
const ink = "#292039"
const prismatic = [rose, sky, violet]
const xy = ({ x, y }: EdgePoint) => x + " " + y
const at = (point: EdgePoint, axis?: EdgePoint) => "translate(" + xy(point) + ")" +
  (axis ? " rotate(" + Math.atan2(axis.y, axis.x) * 180 / Math.PI + ")" : "")
const line = (...points: EdgePoint[]) => "M" + points.map(xy).join("L")
const mix = (a: EdgePoint, b: EdgePoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const easing = (p: number) => 1 - (1 - p) ** 3

type View = {
  fx: SkillVisual
  beat: SummonBeat
  p: number
  color: string
  to: EdgePoint
}

function Stroke({ d, color, width = 3, dash }: { d: string; color: string; width?: number; dash?: string }) {
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
}

function OnContacts({ view, paint }: { view: View; paint: (at: EdgePoint, i: number) => ReactNode }) {
  return <>{(view.fx.contacts ?? [view.to]).map((target, i) => <g key={i}>{paint(target, i)}</g>)}</>
}

function Landing({ view, index, hit, size = 1 }: { view: View; index: number; hit: EdgePoint; size?: number }) {
  const landing = view.beat.landings?.[index]
  if (!landing || edgeDistance(hit, landing) < 3) return null
  const axis = direction(hit, landing)
  return <g>
    <Stroke d={line(hit, landing)} color={view.color} dash="7 6" width={2.5} />
    <path d="M-16-12-8-12 6 0-8 12-16 12-3 0Z" fill={ivory}
      transform={at(landing, axis) + " scale(" + size + ")"} />
  </g>
}

function Opening({ view }: { view: View }) {
  const { beat, p, color, fx } = view
  const scene = SUMMON_CHOREOGRAPHY[beat.kind]
  const amount = easing(clamp(p * 1.26, 0, 1))
  return <g transform={at(fx.from, beat.axis)}>
    <path d={scene.crest} fill="none" stroke={color} strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round"
      pathLength="1" strokeDasharray="1" strokeDashoffset={1 - amount}
      transform={"scale(" + (.58 + .57 * amount) + ")"} />
    {scene.entry === "plant" ? <g transform={"translate(0 " + (-31 * (1 - amount)) + ")"}>
      <Stroke d="M-35-5l-11-11M35-5l11-11M0-18v-18" color={ivory} width={2.5} />
    </g> : scene.entry === "fold" ? <g fill={color} fillOpacity=".48">
      <path d="M-38 19-4 8-26-21Z" transform={"translate(" + (-29 * (1 - amount)) + " 0)"} />
      <path d="M38 19 4 8 26-21Z" transform={"translate(" + (29 * (1 - amount)) + " 0)"} />
    </g> : scene.entry === "unwind" ? <Stroke d="M-51 14Q-59-27-22-33m74 18Q57 27 25 34" color={ivory} width={2.5} dash="6 8" />
      : scene.entry === "lift" ? <path d="M-40 20Q0-40 40 20M-23 25Q0-10 23 25" fill="none" stroke={ivory}
        strokeWidth="2.6" transform={"translate(0 " + (-35 * amount) + ")"} />
      : scene.entry === "doors" ? <g transform={"scale(" + (.12 + amount) + " 1)"}>
        <path d="M-24 28V-24l12-12v52ZM24 28V-24l-12-12v52Z" fill={color} fillOpacity=".38" stroke={ivory} strokeWidth="2.8" />
      </g> : <Stroke d="M-56-16-26-4-56 8M-43-25-12-12m-28 27 27-11" color={ivory} width={3} />}
  </g>
}

function Shot({ view }: { view: View }) {
  const { fx, p, to, beat, color } = view
  const mirror = beat.kind === "mirror"
  const head = mix(fx.from, to, p)
  const tail = mix(fx.from, to, Math.max(0, p - (mirror ? .36 : .19)))
  return <g>
    {mirror && <g transform={at(fx.from, direction(fx.from, to))} opacity={1 - p}>
      <path d="M-17-24 18-8 14 16-15 22-6 0Z" fill={ink} stroke={color} strokeWidth="3.1" />
      <Stroke d="M-14 17 14-8M-7 18 15-3" color={ivory} />
    </g>}
    <Stroke d={line(tail, head)} color={color} width={mirror ? 7 : 5} />
    <path transform={at(head, direction(fx.from, to))}
      d={mirror ? "M-22-8 0-12 15 0 0 12-12 2Z" : "M-14-5 13 0-14 5-8 0Z"}
      fill={ivory} stroke={color} strokeWidth={mirror ? 2.9 : 2} />
  </g>
}

function Portal({ view }: { view: View }) {
  const { fx, beat, to, p } = view
  const exit = beat.other ?? to
  const axis = direction(fx.from, exit)
  const seam = mix(fx.from, exit, easing(p))
  const doorway = (point: EdgePoint, color: string, vector: EdgePoint, width: number) =>
    <g transform={at(point, vector) + " scale(" + width + " 1)"}>
    <path d="M-12-42 8-31 17 0 8 31-12 42-2 13-2-13Z" fill={ink} stroke={color} strokeWidth="4.6" />
    <path d="M-8-33 10-18 13 0 10 18-8 33L1 0Z" fill={color} fillOpacity=".46" />
    <Stroke d="M-25-28-31 0-25 28M-34-16-39 0-34 16" color={ivory} width={3.1} />
  </g>
  return <>
    {doorway(fx.from, violet, axis, Math.max(.25, 1.28 - p * 2.2))}
    {doorway(exit, sky, direction(exit, fx.from), .26 + .94 * easing(p))}
    <Stroke d={line(fx.from, seam, exit)} color={violet} width={4} dash="6 8" />
    <Stroke d={line(seam, exit, to)} color={sky} width={2.8} />
    <path d="M-15-12-9-18H9L15-12V12L9 18H-9l-6-6Z" fill="none" stroke={ivory} strokeWidth="3.5"
      transform={at(to, axis) + " scale(" + (1 + p * .5) + ")"} />
  </>
}

function FanFire({ view }: { view: View }) {
  const { fx, beat, color, p } = view
  const part = fx.area?.parts[0]
  if (!fx.area || part?.kind !== "polygon") return null
  const radius = edgeDistance(fx.from, part.points[1])
  return <g>
    <path d={areaPath(fx.area)} fill="#f69668" fillOpacity=".19" stroke={color} strokeWidth="2.6" />
    <g transform={at(fx.from, beat.axis) + " scale(" + (.52 + .48 * easing(p)) + ")"}>
      {[-27, 0, 27].map((angle, i) => <path key={angle}
        d={"M7 0Q" + radius * .4 + " -27 " + radius * .72 + " -11L" + radius + " 0 " + radius * .72 + " 9Q" + radius * .39 + " 8 7 0Z"}
        transform={"rotate(" + angle + ")"} fill={i === 1 ? ivory : "#ffa977"} fillOpacity={i === 1 ? .85 : .64} />)}
    </g>
    <OnContacts view={view} paint={(hit) => <g transform={at(hit, beat.axis)}>
      <Stroke d="M-15-13l16 9-9 4 20 8m-21 6 11-5" color="#ffc597" width={3.5} />
    </g>} />
  </g>
}

function Contact({ view }: { view: View }) {
  const { fx, beat, color, p, to } = view
  const { from } = fx
  const { other, kind } = beat
  const axis = direction(from, to)
  const amount = easing(p)
  switch (kind) {
    case "sentry":
      return <g transform={at(to, axis)}>
        <Stroke d="M-28 0h18M-9-13 0-5 12-10M-9 13 0 5 12 10" color={ivory} width={3.4} />
        <path d="M-7 0 0-6 9 0 0 6Z" fill={color} />
      </g>
    case "kiln": return <FanFire view={view} />
    case "escort": {
      const touch = mix(from, to, Math.min(1, amount * 1.7))
      return <>
        <Stroke d={line(from, touch, to)} color={sky} width={2.6} dash="4 7" />
        <g transform={at(to)} stroke={ivory} fill={sky} fillOpacity=".24" strokeWidth="3.5">
          <path d="M-34-20-9-28V20L-32 11Z" transform={"translate(" + (-18 * (1 - amount)) + " 0)"} />
          <path d="M34-20 9-28V20L32 11Z" transform={"translate(" + (18 * (1 - amount)) + " 0)"} />
          <path d="M-9-29 0-34 9-29V20L0 27-9 20Z" fill={ivory} />
        </g>
      </>
    }
    case "barricade":
      return <g transform={at(to, axis)}>
        {[-1, 0, 1].map((i) => <path key={i} d="M5-13-7-6-8 7 5 14 13 6 13-5Z"
          transform={"translate(" + (-p * 13) + " " + (i * (27 + p * 9)) + ")"} fill={ink} stroke={ivory} strokeWidth="3.6" />)}
        <Stroke d="M19-29v58m12-43v28" color={color} width={3} />
      </g>
    case "kite":
      return <>
        <Stroke d={"M" + xy(from) + "Q" + xy(along(mix(from, to, .5), left(axis), 31)) + " " + xy(to)} color={violet} width={3} dash="11 7" />
        <g transform={at(to)} fill={color} stroke={ivory} strokeWidth="2">
          <path d="M-30-29-15-19-22 0-5-8-14 15-28 3Z M-5-30 11-18 5 1 21-7 11 14-3 1Z M20-28 36-17 30 1 44-7 36 14 23 1Z" />
        </g>
      </>
    case "decoy":
      return <>
        {Array.from({ length: 8 }, (_, i) => {
          const radial = rotate({ x: 1, y: 0 }, i * 45 + 12)
          return <path key={i} transform={at(along(from, radial, 22 + amount * (i % 3 ? 49 : 68)), radial)}
            d={i % 2 ? "M-12-4 8-9 15 6-3 7Z" : "M-14-8 16 0 1 11Z"} fill={i % 3 ? color : ivory} />
        })}
        <OnContacts view={view} paint={(hit) => <g>
          <Stroke d={line(from, hit)} color={color} width={2.6} dash="4 8" />
          <path d="M-25 12-23-12-10-19-3-7 1-19 19-12 26 6 0 24Z" fill={ink} fillOpacity=".75" stroke={ivory} strokeWidth="3.1" transform={at(hit)} />
        </g>} />
      </>
    case "lantern":
      return <OnContacts view={view} paint={(hit) => <g>
        <Stroke d={"M" + xy(from) + "Q" + xy(along(mix(from, hit, .5), left(beat.axis), 30)) + " " + xy(hit)} color={amber} width={4} />
        <g transform={at(hit, beat.axis)}>
          <Stroke d="M-40-21Q-21-3 6-8L26-17M-42 15Q-18 32 3 15L25 12M-18 0 14 0" color={ivory} width={3.4} />
          <circle cx={7 + p * 27} cy="0" r="6" fill={amber} />
        </g>
      </g>} />
    case "twinBirds": {
      const end = other ?? to
      return <>
        <Stroke d={line(from, end)} color={sky} width={3.6} />
        <Stroke d={line(from, along(to, left(direction(from, end)), -15), end)} color={ivory} width={2.6} />
        <path transform={at(to, direction(from, end))} fill={sky} fillOpacity=".43" stroke={ivory} strokeWidth="3.4"
          d="M-35-25-10-12 0-5 12-14 35-25 16-4 9 0 16 5 35 25 11 14 0 6-13 14-35 25-17 5-10 0-17-5Z" />
      </>
    }
    case "medic":
      return <g>
        <Stroke d={line(from, { x: from.x, y: to.y }, to)} color={color} width={3.4} dash="4 6" />
        <g transform={at(along(to, { x: 0, y: -1 }, p * 16))} fill={ivory}>
          <path d="M-7-34H7v12h12v14H7V4H-7V-8h-12v-14h12Z" />
          <path d="M-27 19h15v-8h13v-8h15v-8h11v10H17v8H3v9h-16v7h-14Z" fill={sky} fillOpacity=".76" />
        </g>
      </g>
    case "mist": {
      const pool = fx.area?.parts[0]
      const radius = pool?.kind === "circle" ? pool.radius : 96
      return <>
        <ellipse cx={from.x} cy={from.y} rx={radius * (.55 + .45 * amount)} ry={radius * .57} fill={color} fillOpacity=".23" />
        <OnContacts view={view} paint={(hit) => <g transform={at(hit)}>
          <Stroke d="M-36 14q10-19 23-6t24 0 22-1M-32 25q13-10 27-1t28-3M-26 34q15-6 27 1t20-1" color={sky} width={3.4} />
        </g>} />
      </>
    }
  }
  return <AdvancedContact view={view} />
}

function AdvancedContact({ view }: { view: View }) {
  const { fx, beat, color, p, to } = view
  const { from } = fx
  const { other, intercept, kind } = beat
  const axis = direction(from, to)
  const amount = easing(p)
  switch (kind) {
    case "runner":
      return <g>
        <g transform={at(to, axis)} fill={color}>
          <path d="M-62-13-18-11 5 0-18 11-62 13-36 0Z" fillOpacity=".49" />
          <path d="M-19-19 9-12 19 0 9 12-19 19-4 0Z" stroke={ivory} strokeWidth="3" />
        </g>
        <Landing view={view} index={0} hit={to} />
      </g>
    case "lasso": {
      const center = along(mix(from, to, .5), left(axis), 28 * (p - .28) ** 2)
      return <g>
        <Stroke d={"M" + xy(from) + "Q" + xy(center) + " " + xy(to)} color={color} width={6} />
        <Stroke d={line(from, to)} color={ivory} dash="3 9" width={2.5} />
        <g transform={at(to, axis)}>
          <Stroke d="M-20-9Q-4-22 15-11L21-2 15 11Q-4 22-20 9m27-4 13 6-5-13" color={ivory} width={3.4} />
        </g>
      </g>
    }
    case "ambush": {
      const chargeAxis = direction(to, other ?? along(to, axis, 70))
      const sever = along(to, chargeAxis, 36)
      return <g transform={at(sever, chargeAxis)}>
        <Stroke d="M-27-15H-9L-3-6M9 6l11 9h40m-25-30h29" color={rose} dash="9 6" width={4} />
        <path d="M-26-29-8-18 13 7 34 24 17 28-9 8ZM-28 28-9 8 17-28 34-24 13-7-8 18Z"
          fill={color} stroke={ivory} strokeWidth="2.8" />
      </g>
    }
    case "shadow": {
      const facing = direction(other ?? from, to)
      return <g>
        <Stroke d={"M" + xy(from) + "Q" + xy(along(to, facing, -61)) + " " + xy(to)} color={violet} width={4} />
        <g transform={at(to, facing)} fill={color}>
          <path d="M-53-21-7-14 15 0-7 14-53 21-28 0Z" fillOpacity=".62" />
          <path d="M-32-17 6-8 26 0 6 8-32 17-10 0Z" fill={ivory} />
        </g>
        <Landing view={view} index={0} hit={to} />
      </g>
    }
    case "plate":
      return <g>
        <Stroke d={line(from, to)} color={amber} dash="3 7" />
        <g transform={at(to)} fill={ink} stroke={color} strokeWidth="3.7">
          <path d="M-37-15-24-22-24 16-37 8ZM37-15 24-22 24 16 37 8Z" />
          <path d="M-17-20H17v24L0 19-17 4Z" fill={sky} fillOpacity=".43" />
          <circle r="4" cx="0" cy="-11" fill={ivory} stroke="none" />
        </g>
      </g>
    case "twinBows": {
      const end = other ?? to
      const bowAxis = direction(from, end)
      const mid = mix(from, end, .5)
      return <g>
        {fx.area && <path d={areaPath(fx.area)} fill={color} fillOpacity=".17" stroke={color} strokeWidth="2" />}
        {[-1, 1].map((sign) => <Stroke key={sign} d={"M" + xy(from) + "Q" +
          xy(along(mid, left(bowAxis), sign * (31 - p * 26))) + " " + xy(end)} color={sign > 0 ? ivory : color} width={4.2} />)}
        <OnContacts view={view} paint={(hit) => <g transform={at(hit, bowAxis)}>
          <path d="M-15-21 8-9-6 0 18 9 8 25-17 8-2-1-25-9Z" fill={ivory} />
        </g>} />
      </g>
    }
    case "rail": {
      const end = fx.area ? mix(from, fx.area.center, 2) : other ?? to
      const railAxis = direction(from, end)
      const length = edgeDistance(from, end)
      return <g>
        <g transform={at(from, railAxis)}>
          <Stroke d={"M0-12H" + length + "M0 12H" + length} color={color} width={3.5} />
          {[.2, .4, .6, .8].map((step) => <path key={step} transform={"translate(" + (step * length) + " 0)"} d="M-9-8 3 0-9 8-3 0Z" fill={ivory} />)}
          <path transform={at({ x: length * amount, y: 0 })} d="M0-20 11 0 0 20-11 0Z" fill={sky} />
        </g>
        <OnContacts view={view} paint={(hit) => <g transform={at(hit, railAxis)}>
          <Stroke d="M-27-31-10-26 6-32m-33 63 17-5 16 6" color={ivory} width={3.4} />
        </g>} />
      </g>
    }
    case "bell": {
      const field = fx.area?.parts[0]
      const radius = field?.kind === "circle" ? field.radius : 118
      const toll = fx.beat === 2
      const r = radius * (.43 + amount * .57)
      return <>
        <g transform={at(from)} fill="none" stroke={toll ? amber : color} strokeWidth={toll ? 7 : 3.6}>
          <circle r={r} strokeDasharray={toll ? "25 11 6 9" : "10 5"} />
          {toll ? <circle r={r * .83} strokeWidth="2.8" strokeDasharray="4 7" />
            : <path d={"M" + (-r * .65) + " 0Q0 " + (r * .76) + " " + (r * .65) + " 0"} stroke={ivory} />}
        </g>
        <OnContacts view={view} paint={(hit, i) => toll ? <Landing view={view} index={i} hit={hit} /> :
          <g transform={at(hit)}><Stroke d="M-17-15q17 18 34 0m-34 12q17 18 34 0" color={ivory} width={3.2} /></g>} />
      </>
    }
    case "paperGuard":
      return <g>
        <path d={"M" + xy(from) + "L" + xy(along(to, left(axis), -31)) + " " + xy(to) + " " + xy(along(to, left(axis), 31)) + "Z"}
          fill={color} fillOpacity=".28" />
        <g transform={at(to, axis)} stroke={ivory} strokeWidth="3.5">
          <path d="M-20-39 17-25 33 0 17 25-20 39-4 0Z" fill={color} fillOpacity=".43" />
          <path d="M-8-16 8 0-8 16 25 0Z" fill={ink} />
        </g>
      </g>
    case "frostHook": {
      const grip = mix(to, beat.landings?.[0] ?? to, amount)
      return <g>
        <Stroke d={"M" + xy(from) + "Q" + xy(along(mix(from, grip, .5), left(axis), 19)) + " " + xy(grip)} color={sky} width={4.9} />
        <path d="M-22-13 8-22 23-5 19 16-2 26-8 16 10 6 9-5-14 1Z" transform={at(grip, axis)} fill={sky} stroke={ivory} strokeWidth="2.6" />
        <g transform={at(from, axis)}><Stroke d="M-21 5 0-25 21 5M-18 5H18" color={ivory} width={2.8} /></g>
        <Landing view={view} index={0} hit={to} />
      </g>
    }
    case "mirror":
      return <g transform={at(to, axis)} fill={color} stroke={ivory} strokeWidth="2.8">
        <path d="M0-29 13-12-1 3-18-4ZM12 0 30-6 23 17 4 12ZM-20 3-8 12-15 25-33 18Z" />
      </g>
    case "roadBeast":
      return beat.cue === "stop" ? <g transform={at(to, axis)}>
        <Stroke d="M-21-27-8-10-18 0-8 10-21 27M2-33 12-12 4 0 12 12 2 33" color={amber} width={4.7} />
      </g> : <OnContacts view={view} paint={(hit, i) => <g>
        <g transform={at(hit, direction(hit, beat.landings?.[i] ?? to))}>
          <Stroke d="M-31-21q23 0 43 9m-44-1q24 3 45 13m-44-4q21 5 40 16" color={amber} width={5} />
        </g>
        <Landing view={view} index={i} hit={hit} />
      </g>} />
    case "bodyguard":
      return <g>
        <Stroke d={line(to, from)} color={sky} width={6.3} />
        <path d="M-31-20-10-26 14-9 31-17 17 8-2 23-22 17Z" fill={ink} stroke={ivory} strokeWidth="4.1" transform={at(from, axis)} />
        <g transform={at(to)}>
          <Stroke d="M-30-25q-12 26 2 42 9 13 28 18" color={sky} width={3.3} />
        </g>
      </g>
    case "hexWard":
      return <g>
        <g transform={at(from)} fill={color} fillOpacity=".42" stroke={color} strokeWidth="2.8">
          {[0, 60, 120, 180, 240, 300].map((angle) =>
            <path key={angle} transform={"rotate(" + angle + ")"} d="M22-10 41-15 52 0 41 15 22 10Z" />)}
        </g>
        <Stroke d={line(from, to)} color={amber} dash="11 5" width={4.1} />
        <path d="M0-34 28-17 28 17 0 34-28 17-28-17Z M0-19 16-10v20L0 19-16 10v-20Z" fill={color}
          fillOpacity=".45" fillRule="evenodd" stroke={ivory} strokeWidth="3.3" transform={at(to)} />
      </g>
    case "mirrorWeave": {
      const catchAt = intercept ?? from
      return <g>
        {other && <Stroke d={line(other, catchAt)} color={rose} dash="10 6" width={3.6} />}
        <Stroke d={line(catchAt, from)} color={ivory} width={6.4} />
        <path d="M0-32 17 0 0 32-17 0Z" fill={sky} fillOpacity=".62" stroke={ivory} strokeWidth="3.3" transform={at(catchAt, direction(catchAt, from))} />
        <path d="M-19-20-8-6-18 0 0 10-4 20 13 29m-4-51 2 11 14 8" fill="none" stroke={ivory} strokeWidth="3.6" transform={at(from)} />
      </g>
    }
  }
  return <FinalContact view={view} />
}

function FinalContact({ view }: { view: View }) {
  const { fx, beat, color, p, to } = view
  const { from } = fx
  const { other, intercept, slot, kind } = beat
  const axis = direction(from, to)
  const amount = easing(p)
  switch (kind) {
    case "orbitBeast":
      return <OnContacts view={view} paint={(hit, i) => <g>
        <g transform={at(hit, beat.axis)}>
          <path d="M-53-32Q-32-22 8-21L40-6 1-12-33-8-52 0-33-14Z M-51 22-27 10 16 4 35 14-12 16Z" fill={rose} fillOpacity=".57" />
          <Stroke d="M-53-12Q-29-28 4-14 22-7 41 4M-38 19-21 11 5 8 29 14" color={ivory} width={4.8} />
        </g>
        <Landing view={view} index={i} hit={hit} size={1.3} />
      </g>} />
    case "shoreBeast":
      return <OnContacts view={view} paint={(hit, i) => {
        const push = direction(hit, beat.landings?.[i] ?? along(hit, outward(hit), 1))
        return <g>
          <g transform={at(hit, push) + " translate(" + (amount * 13) + " 0)"}>
            {[-1, 0, 1].map((n) => <path key={n} transform={"translate(0 " + n * 24 + ")"} d="M-38 3Q-7-19 34 0-8-2-29 14Z"
              fill={n ? color : ivory} stroke={rose} strokeWidth="2.7" />)}
            <Stroke d="M-37-40q-18 41 0 80" color={color} width={3.5} dash="6 6" />
          </g>
          <Landing view={view} index={i} hit={hit} size={1.4} />
        </g>
      }} />
    case "paperBeat":
      return slot === 0 ? <g>
        <path d="M0-24 19-6 0 18-19-6Z" transform={at(from)} fill={amber} stroke={ivory} strokeWidth="3" />
        <OnContacts view={view} paint={(hit) => <g>
          <Stroke d={line(from, hit)} color={amber} dash="3 7" />
          <g transform={at(hit)}>
            <Stroke d="M-43 25q18-20 44-12l24-9m-41 25 21-5 16 2m-43 11 32-7" color={ivory} width={4} />
          </g>
        </g>} />
      </g> : slot === 1 ? <OnContacts view={view} paint={(hit) => <g transform={at(hit)}>
        <path d="M-34-39-13-27 0-34 13-27 34-39 22-14 0 5-22-14Z" fill={violet} fillOpacity=".5" stroke={ivory} strokeWidth="3.8" />
        <Stroke d="M-19 17 0 29 19 17M-12 28 0 40 12 28" color={color} width={4} />
      </g>} /> : <OnContacts view={view} paint={(hit, i) => <g>
        <g transform={at(hit, direction(hit, beat.landings?.[i] ?? along(hit, axis, 1)))}>
          <path d="M-35-31-3-21 30 0-3 21-35 31-22 0Z M-12-20 0-11 18 0 0 11-12 20-5 0Z" fill={rose}
            fillOpacity=".51" stroke={ivory} strokeWidth="3.6" fillRule="evenodd" />
        </g>
        <Landing view={view} index={i} hit={hit} />
      </g>} />
    case "rescue": {
      const returned = fx.beat === 2
      return returned ? <g>
        <Stroke d={line(along(to, outward(to), 53), other ?? to, to, from)} color={rose} width={5} dash="9 6" />
        <path d="M-37-7-26 1-15 17-26 32-37 24ZM37-7 26 1 15 17 26 32 37 24Z"
          fill={sky} fillOpacity=".58" stroke={ivory} strokeWidth="3.6" transform={at(to, outward(to))} />
      </g> : <g>
        <Stroke d={"M" + xy(from) + "Q" + xy(along(mix(from, to, .5), left(axis), 47)) + " " + xy(to)} color={rose} width={6} />
        <g transform={at(to)} stroke={ivory} strokeWidth="3.4">
          <path d="M-45 12-38-15-15-25-6-7-11 13-29 24Z M45 12 38-15 15-25 6-7 11 13 29 24Z"
            fill={rose} fillOpacity=".58" />
          <path d="M-7-37H7v10h10v12H7v10H-7v-10h-10v-12h10Z" fill={ivory} />
        </g>
      </g>
    }
    case "bridge": {
      const start = fx.beat === 2 ? along(to, outward(to), 54) : from
      const alongBridge = direction(start, to)
      return <g>
        <Stroke d={line(along(start, left(alongBridge), 13), along(to, left(alongBridge), 13))} color={rose} width={3.1} />
        <Stroke d={line(along(start, left(alongBridge), -13), along(to, left(alongBridge), -13))} color={sky} width={3.1} />
        {[.16, .33, .5, .67, .84].map((ratio, i) => <path key={ratio} d="M-4-16H5V16H-4Z"
          transform={at(mix(start, to, ratio), alongBridge)} fill={i / 5 <= amount ? ivory : color}
          opacity={i / 5 <= amount ? 1 : .3} />)}
        <path d="M-19 12V-8l9-9 10 8 10-8 9 9v20" transform={at(to, alongBridge)} fill="none" stroke={ivory} strokeWidth="3.5" />
      </g>
    }
    case "ensemble": {
      const part = fx.area?.parts[0]
      const radius = part?.kind === "circle" ? part.radius : 144
      return slot === 0 ? <>
        <g transform={at(from)} fill={rose} stroke={ivory} strokeWidth="3.3" fillOpacity=".32">
          {[0, 72, 144, 216, 288].map((angle) => <path key={angle} transform={"rotate(" + angle + ") scale(" + (.54 + amount * .54) + ")"}
            d={"M4-10 " + radius + " 0 4 10 24 0Z"} />)}
        </g>
        <OnContacts view={view} paint={(hit) => <path d="M0-32 7-7 30 0 7 7 0 32-7 7-30 0-7-7Z"
          fill={ivory} transform={at(hit) + " rotate(" + (p * 19) + ")"} />} />
      </> : slot === 1 ? <OnContacts view={view} paint={(hit) => <g>
        <Stroke d={line(from, hit)} color={sky} width={3.7} dash="5 7" />
        <g transform={at(hit)} stroke={ivory} strokeWidth="3.5" fill={sky} fillOpacity=".39">
          <path d="M-46 8-31-25-16-31-5-12-17 20-38 25Z M46 8 31-25 16-31 5-12 17 20 38 25Z" />
          <path d="M0-35 9-9 26 0 9 9 0 29-9 9-26 0-9-9Z" fill={ivory} />
        </g>
      </g>} /> : <OnContacts view={view} paint={(hit, i) => <g>
        <g transform={at(from, direction(from, hit)) + " scale(" + (.53 + .5 * amount) + ")"}>
          <Stroke d={"M" + (radius * .55) + " " + -radius * .7 + "Q" + (radius * 1.42) + " 0 " +
            (radius * .55) + " " + radius * .7} color={violet} width={6.7} />
          <Stroke d={"M" + (radius * .64) + " " + -radius * .56 + "Q" + (radius * 1.32) + " 0 " +
            (radius * .64) + " " + radius * .56} color={sky} width={3.1} dash="12 8" />
        </g>
        <g transform={at(hit, direction(hit, beat.landings?.[i] ?? along(hit, axis, 1)))}>
          <path d="M-55-37-19-22 16-24 49 0 16 24-19 22-55 37-28 0Z" fill={violet} fillOpacity=".47"
            stroke={ivory} strokeWidth="4.5" />
          <Stroke d="M-27-12 0 0-27 12M3-18 23 0 3 18" color={sky} width={5} />
        </g>
        <Landing view={view} index={i} hit={hit} size={1.65} />
      </g>} />
    }
    case "gates": return <Portal view={view} />
    case "paperPack":
      return <g>
        {other && <Stroke d={line(other, from)} color={rose} width={3.7} dash="9 7" />}
        <Stroke d={line(from, to)} color={prismatic[slot]} width={4.2} />
        <g transform={at(from, axis)} stroke={ivory} fill={prismatic[slot]} fillOpacity=".54" strokeWidth="3.6">
          <path d={slot === 0 ? "M-39-30-8-24 20 1 4 31-25 18-11 1Z"
            : slot === 1 ? "M-29-25 0-39 29-25 26 13 0 31-26 13Z"
              : "M-29-9-13-29 17-24 33 4 11 30-17 14Z"} />
          <path d="M-16-10-2-4-7 8 7 10 15 19" fill="none" />
        </g>
      </g>
    case "armorBeast": {
      const cover = beat.cue === "cover"
      const bend = intercept ?? from
      return <g>
        {cover && other && <g>
          <Stroke d={line(other, bend, from)} color={ivory} width={5.2} />
          <path d="M-15-25 6-15 12 0 6 15-15 25-5 0Z" transform={at(bend, direction(other, from))}
            fill={violet} stroke={ivory} strokeWidth="3" />
        </g>}
        <g transform={at(from, axis) + " scale(" + (.84 + .37 * amount) + ")"}>
          <path d="M-31-54 5-52 36-25 19-15-10-23-37-39Z" fill={violet} fillOpacity=".67" stroke={ivory} strokeWidth="3.3" />
          <path d="M-31 54 5 52 36 25 19 15-10 23-37 39Z" fill={sky} fillOpacity=".67" stroke={ivory} strokeWidth="3.3" />
          <Stroke d="M-9-30 16-16 32 0 16 16-9 30M-21-25-10 0-21 25" color={ivory} width={4.5} />
        </g>
        {cover ? <Stroke d={line(bend, to)} color={sky} width={2.7} dash="3 8" /> : <OnContacts view={view} paint={(hit) => <g>
          <Stroke d={line(from, hit)} color={sky} width={4.2} />
          <path d="M-31-16-17-25 0-15 17-25 31-16 25 12 0 23-25 12Z" fill={sky} fillOpacity=".4"
            stroke={ivory} strokeWidth="3.7" transform={at(hit)} />
        </g>} />}
      </g>
    }
    case "returnBeast":
      return <OnContacts view={view} paint={(hit, i) => {
        const landing = beat.landings?.[i] ?? hit
        const vector = direction(hit, landing)
        if (fx.beat === 1) return <g>
          <g transform={at(hit, vector)}>
            <path d="M-73-21-19-16 1-22 33 0 1 22-19 16-73 21-48 0Z" fill={rose} fillOpacity=".54"
              stroke={ivory} strokeWidth="3.8" />
            <Stroke d="M-44-13-20 0-44 13M-8-15 17 0-8 15" color={sky} width={4.5} />
          </g>
          <Landing view={view} index={i} hit={hit} size={1.55} />
        </g>
        const fold = mix(hit, landing, .5)
        return <g>
          <path d={"M" + xy(along(hit, left(vector), -24)) + "L" + xy(along(fold, left(vector), -17)) + " " +
            xy(along(landing, left(vector), -23)) + " " + xy(along(landing, left(vector), 23)) + " " +
            xy(along(fold, left(vector), 17)) + " " + xy(along(hit, left(vector), 24)) + "Z"}
          fill={violet} fillOpacity=".44" stroke={ivory} strokeWidth="3.4" />
          <Stroke d={line(from, landing)} color={sky} width={3.6} dash="6 7" />
          <path d="M-20-25-8-15 11-15 23 0 11 15-8 15-20 25-9 0Z" transform={at(mix(hit, landing, amount), vector)} fill={sky} stroke={ivory} strokeWidth="3.6" />
        </g>
      }} />
  }
}

export function EdgeSummonEffects({ battle, layer }: { battle: EdgeBattle; layer: "floor" | "front" }) {
  return <g className="edge-summon-vfx" pointerEvents="none" aria-hidden="true">
    {battle.runtime.effects.map((fx) => {
      const beat = fx.summon
      if (!beat || battle.time < fx.start || battle.time >= fx.end) return null
      const floor = beat.cue === "deploy" || beat.cue === "act" && ["kiln", "mist", "rail", "bell", "twinBows"].includes(beat.kind)
      if (floor !== (layer === "floor")) return null
      const p = clamp((battle.time - fx.start) / (fx.end - fx.start), 0, 1)
      const to = beat.cue === "shot" ? unitOf(battle, fx.target) ?? fx.to : fx.to
      const color = fx.rarity === "Prismatic" ? prismatic[beat.slot % prismatic.length] : RARITY_COLOR[fx.rarity]
      const view = { fx, beat, to, p, color }
      return <g key={fx.id} data-skill-vfx={fx.skill} data-summon-vfx={beat.kind} data-summon-cue={beat.cue}
        data-summon-beat={fx.beat} data-summon-slot={beat.slot} data-vfx-phase={fx.phase} opacity={1 - p ** 2.2}>
        {beat.cue === "deploy" ? <Opening view={view} /> : beat.cue === "shot" ? <Shot view={view} />
          : beat.cue === "warp" ? <Portal view={view} /> : <Contact view={view} />}
      </g>
    })}
  </g>
}
