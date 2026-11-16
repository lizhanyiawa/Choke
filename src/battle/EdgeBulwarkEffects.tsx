import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { FIELD, along, areaPath, direction, edgeDistance, left, point } from "./edgeSkills/geometry"
import { bulwarkChoreography, type BulwarkMotif } from "./edgeSkills/bulwarkChoreo"
import type { BulwarkBeat, SkillVisual } from "./edgeSkills/presentation"
import { unitOf } from "./edgeSkills/state"
import {
  Lash, Plating, WallRibs, arc, armorPaint, at, circlesOf, ease, heading, lineOf, mix, path, polar, spectrum, unit, type ArmorPaint,
} from "./EdgeBulwarkFields"

type Cue = SkillVisual & { bulwark: BulwarkBeat }
type Shot = { fx: Cue; motif: BulwarkMotif; paint: ArmorPaint; p: number }
const shieldFace = "M-32-14-19-27H19L32-14 26 15 0 31-26 15Z M-23-13H23M0-24v47"
const shoe = "M-21 9-9-12H7L21 9 10 16H-10Z M-13 7H13"
const chock = "M-17 10 1-17 18 10Z M-8 6 1-7l7 13"
const clampFace = "M-34-24H-20l8 10V9l-8 9h-14m68-42H20l-8 10V9l8 9h14M-6-4H6"
const rivet = "M0-7 6-3v6L0 7-6 3v-6Z M-3 0h6"
const sideOf = (sign: number) => sign === 1 ? 1 : -1

function Gleam({ d, color, width = 3, fade = 1 }: { d: string; color: string; width?: number; fade?: number }) {
  return <g opacity={fade} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={color} strokeWidth={width * 3.2} opacity=".16" />
    <path d={d} stroke={color} strokeWidth={width} opacity=".9" />
    <path d={d} stroke="#fff7f3" strokeWidth={Math.max(.9, width * .28)} opacity=".77" />
  </g>
}

function Pieces({ p, paint, r, count = 6, spin = 0, length = 22 }: {
  p: number; paint: ArmorPaint; r: number; count?: number; spin?: number; length?: number
}) {
  return <g fill="none" opacity={1 - p}>
    {Array.from({ length: count }, (_, i) => {
      const step = ease(p) * (30 + i % 3 * 10)
      return <path key={i} transform={`rotate(${spin + i * 360 / count}) translate(${r + step} 0)`}
        d={`M0 -3h${length * (1 - p * .72)}l-7 6H4Z`} fill={i % 2 ? paint.metal : paint.accent}
        fillOpacity=".25" stroke={paint.light} strokeWidth={i % 3 === 0 ? 2.6 : 1.45} />
    })}
  </g>
}

function Approach({ fx, paint, p, motif }: Shot) {
  const live = 1 - p
  const circle = circlesOf(fx.area)[0]
  const target = fx.to
  const r = circle?.radius ?? 50
  const flow = ease(p)
  const axis = fx.bulwark.axis
  const angle = heading(axis)
  const side = left(axis)
  const ground = fx.area && <path d={areaPath(fx.area)} fill={paint.metal} fillOpacity={.06 + flow * .04}
    stroke={paint.metal} strokeOpacity={.42 + .36 * p} strokeDasharray={p > .8 ? undefined : "10 8"} strokeWidth="2.6" />

  switch (motif) {
    case "lockplate": return <g transform={at(target)} opacity={.35 + .65 * live}>
      {[-1, 1].map((sign) => <g key={sign} transform={`translate(${sign * (32 + live * 39)} -39) scale(${sign} 1)`}>
        <Plating d="M-31 5-20-16H7l10 11-7 12h-30Z M-22-5H4" paint={paint} weight={3.2} />
      </g>)}
    </g>
    case "mantle": return <g transform={at(target)}>
      {[-1, 1].map((sign) => <g key={sign} transform={`translate(${sign * (41 + live * 21)} 0) scale(${sign} 1)`} opacity={.66 + live * .34}>
        <Plating d="M-9-30 8-24 14-11v22L8 23-9 30-3 8V-8Z M4-19v38" paint={paint} weight={2.7} fill={.4} />
      </g>)}
    </g>
    case "pauldron": return <g opacity={live}>
      <Lash from={fx.from} to={target} paint={paint} />
      <g transform={at(mix(fx.from, target, flow)) + " rotate(" + (angle + 80) + ")"}>
        <Plating d="M-29 4-12-22H10l19 25-10 12h-39Z M-13-8h27" paint={paint} weight={3.4} />
      </g>
    </g>
    case "rimstrike": return <g transform={at(fx.from) + " rotate(" + (angle - 54 * live) + ")"}>
      <Plating d="M34-50Q70-42 83 0 67 42 34 50L46 19 53 0 46-19Z M52-36 65-21 69 0 65 21 52 36" paint={paint} weight={4.6} />
    </g>
    case "rivets": return <g transform={at(target)} fill="none" stroke={paint.metal}>
      <path d={arc(61 - p * 8, 34, 146)} strokeWidth="3" opacity={live} />
      <path d="M-25 37h50" strokeDasharray="5 7" strokeWidth="2.1" opacity={.56 * live} />
    </g>
    case "wedges": case "twochocks": return <g transform={at(target)} opacity={.86 * live + .14}>
      {[-1, 1].map((sign) => <g key={sign} transform={`translate(${sign * (43 + 22 * live)} ${29 - 20 * live}) rotate(${sign * 19 * live})`}>
        <Plating d={chock} paint={paint} weight={3.2} />
      </g>)}
    </g>
    case "shieldstep": return <g transform={at(fx.from) + " rotate(" + angle + ")"} opacity={.8 * live}>
      <Gleam d="M15-25h42l13 13m-55 37h42l13-13M35-11l15 11-15 11" color={paint.metal} width={2.3} />
    </g>
    case "catchstrap": case "bracewire": case "twinhull": case "accord": {
      const end = mix(fx.from, target, flow)
      const grip = motif === "accord" ? "wire" : motif === "twinhull" ? "chain" : motif === "bracewire" ? "cable" : "strap"
      return <g opacity={.32 + live * .55}>
        <Lash from={fx.from} to={end} paint={paint} style={grip} width={motif === "accord" ? 2.4 : 4.2} />
        <g transform={at(along(target, side, 39)) + " rotate(" + (angle + 90) + ")"} opacity={flow}>
          <Plating d={motif === "twinhull" ? "M-27-20 26-20 22 5 2 19-20 6Z M-21-10h42" : shoe} paint={paint} weight={3.4} />
        </g>
      </g>
    }
    case "anvil": case "breach": {
      const line = lineOf(fx.area)
      if (!line) return null
      const span = edgeDistance(line.from, line.to)
      return <>{ground}<g transform={at(line.from) + " rotate(" + heading(direction(line.from, line.to)) + ")"}>
        {motif === "anvil" ? [0, 1, 2].map((i) => {
          const drop = ease((p - i * .24) * 3)
          return <g key={i} opacity={drop * .87 + .13} transform={`translate(${span * (.23 + i * .31)} ${-22 * (1 - drop)})`}>
            <Plating d="M-15-29H12L20-17V17L12 29H-15L-22 18V-18Z M-13-23v46 M12-19v38" paint={paint} weight={3.1} />
          </g>
        }) : <g transform={`translate(${span * (.15 + p * .69)} 0) rotate(${14 - p * 14})`}>
          <Plating d="M-26-48H13L31-30 22-8 31 29 13 48H-26L-15 21V-21Z M-12-37H12L20-27 M-12 37H12L20 27" paint={paint} weight={4.5} />
        </g>}
      </g></>
    }
    case "axle": return <g transform={at(target) + " rotate(" + (-100 * live) + ")"} opacity={.7 + .3 * live}>
      <Gleam d={arc(56, 20, 160) + " M0 44v20m-11-9h22"} color={paint.metal} width={4.1} />
    </g>
    case "barbs": return <g transform={at(target)}>
      {[-155, -124, -90, -55, -24].map((a, i) => <path key={a} transform={`rotate(${a}) translate(${35 + flow * 12} 0)`}
        d="M-8-10 21 0-8 10-3 0Z" fill={paint.ink} fillOpacity=".38" stroke={i % 2 ? paint.accent : paint.metal}
        strokeWidth="2.6" opacity={.34 + live * .62} />)}
    </g>
    case "stakes": case "portal": case "rampart": case "citadel": case "bastions": return <>
      {ground}
      {circlesOf(fx.area).map((part, index) => <g key={index} transform={at(part.center)} opacity={live * .82}>
        <Gleam d={motif === "stakes" ? "M-29-12h58M0-32v59m-10-46 10-13 10 13"
          : motif === "portal" ? "M-32 17V-12l16-20H16l16 20v29M-23 7V-9L-9-21H9L23-9V7"
          : motif === "rampart" ? "M-31 16v-34h13v9H-5v-9H8v9h12v-9h12v34"
          : motif === "citadel" ? "M-43 22v-46h16v12h14v-12h26v12h14v-12h16v46M-16 21V-3L0-15 16-3v24"
          : "M-38 14-22-24H22l16 38m-61-5 12-22H11l12 22"} color={paint.metal} width={motif === "citadel" ? 4 : 3} />
      </g>)}
    </>
    case "cracked": return <g transform={at(target) + " scale(" + (1.26 - .28 * flow) + ")"} opacity={.67 * live + .25}>
      <Plating d="M-56-14-42-43-16-50-7-31-17-14-7 12-24 35-45 26ZM56-14 42-43 16-50 7-31 17-14 7 12 24 35 45 26Z"
        paint={paint} weight={3.2} />
    </g>
    case "stomp": case "muffle": case "drum": return <>{ground}<g transform={at(target)} fill="none">
      {motif === "stomp" && [-135, -45, 45, 135].map((a) =>
        <path key={a} transform={`rotate(${a}) translate(${55 - 17 * flow} 0)`} d="M0-22 25-12 31 0 25 13 0 22-8 0Z"
          fill={paint.ink} fillOpacity=".47" stroke={paint.metal} strokeWidth="3.3" />)}
      {motif === "muffle" && <>
        <Gleam d="M-55 29 0-66 55 29-10 37Z M-26 14 0-34 26 14Z" color={paint.metal} width={3.2} />
        <circle r="70" stroke={paint.light} strokeWidth="1.9" strokeDasharray="9 9" opacity=".48" />
      </>}
      {motif === "drum" && <>
        <ellipse cx="0" cy="-46" rx="41" ry={13 + live * 10} fill={paint.ink} fillOpacity=".45" stroke={paint.accent} strokeWidth="3.2" />
        <path d={`M-47 ${-78 + p * 24}l18 19m76 ${-19 - p * 24}l-18 19M-40-46l8 28h64l8-28`} stroke={paint.light} strokeWidth="4.1" />
      </>}
    </g></>
    case "seal": return <g transform={at(target) + " rotate(" + angle + ") scale(" + (1.32 - .41 * flow) + ")"}>
      <Plating d={clampFace} paint={paint} weight={4} />
    </g>
    case "handoff": return <g>
      <Lash from={fx.from} to={target} paint={paint} style="strap" strength={.42} />
      <g transform={at(mix(fx.from, target, flow)) + " rotate(" + (angle - 28 * live) + ")"}>
        <Plating d="M-34-23-4-32 31-13 20 4 6 21-28 24-15 4Z M-13-17 15-7 0 9-18 12" paint={paint} weight={3.6} />
      </g>
    </g>
    case "spareplate": return <g transform={at(fx.from)} opacity={live}>
      {[28, 151, 261].map((a) => <g key={a} transform={`rotate(${a + flow * 54}) translate(51 0) rotate(90)`}>
        <Plating d="M-18-9H17L25 0 17 10H-17L-24 0Z" paint={paint} weight={2.4} />
      </g>)}
    </g>
    case "phalanx": case "shoulders": return <>{ground}<g transform={at(target)} opacity={.86 * live}>
      {[-145, -90, -35].map((a) => <g key={a} transform={`rotate(${a}) translate(${64 + p * 18} 0) rotate(90)`}>
        <Plating d={motif === "phalanx" ? "M-22-12 0-19 22-12 17 12H-17Z M-15-4H15" : shieldFace}
          paint={paint} weight={3.5} />
      </g>)}
    </g></>
    case "wake": return <g transform={at(target)} opacity={live}>
      <Gleam d="M-45 35-25 47 0 40 25 47 45 35M-34 49-15 61 0 56 15 61 34 49" color={paint.metal} width={3.6} />
    </g>
    case "overhead": return <>{ground}<g transform={at(target)}>
      {[-135, -45, 45, 135].map((a) => <path key={a} transform={`rotate(${a}) translate(${r - 12} 0)`}
        d="M-24-10-7 0-24 10M-15-14 7 0-15 14" fill="none" stroke={paint.light} strokeWidth="3.4" />)}
      <ellipse cy="5" rx={49 + 52 * flow} ry={15 + 19 * flow} fill={paint.ink} opacity={.26 + p * .27} />
      <g transform={`translate(0 ${-137 * live ** 1.18}) scale(${.78 + .53 * flow} ${.52 + .34 * flow})`}>
        <Plating d="M-75-30-43-52H43L75-30 69 13 45 38 0 52-45 38-69 13Z M-59-21H59M-37-40H37M0-39v70"
          paint={paint} fill={.69} weight={6} />
      </g>
    </g></>
    case "shore": {
      const cuts = [
        target.x < FIELD.left ? (FIELD.left - fx.from.x) / (target.x - fx.from.x) : 2,
        target.x > FIELD.right ? (FIELD.right - fx.from.x) / (target.x - fx.from.x) : 2,
        target.y < FIELD.top ? (FIELD.top - fx.from.y) / (target.y - fx.from.y) : 2,
        target.y > FIELD.bottom ? (FIELD.bottom - fx.from.y) / (target.y - fx.from.y) : 2,
      ]
      const crossing = Math.min(...cuts.filter((t) => t >= 0 && t <= 1))
      const ramp = Number.isFinite(crossing) ? mix(fx.from, target, crossing) : mix(fx.from, target, .76)
      return <g opacity={live}>
        <Lash from={along(ramp, axis, -102)} to={target} paint={paint} style="wire" />
        <g transform={at(ramp) + " rotate(" + angle + ")"}>
          <Gleam d="M-51-24H32M-51 24H32M-43-24v48m21-48v48m21-48v48m21-48v48" color={paint.accent} width={3} />
        </g>
      </g>
    }
    case "seawall": return <>{ground}<WallRibs area={fx.area} paint={paint} progress={p} /></>
    case "island": return <>{ground}<g transform={at(target)}>
      <path d={path(Array.from({ length: 10 }, (_, i) => polar(r * (.52 + p * .35) * (i % 2 ? .81 : 1), i * 36))) + "Z"}
        fill={paint.metal} fillOpacity=".1" stroke={paint.light} strokeWidth="3.6" opacity=".7" />
      {[-90, -18, 54, 126, 198].map((a, i) => <path key={a} d={arc(r - 12, a - 21, a + 21)}
        fill="none" stroke={spectrum[i]} strokeWidth={3 + 6 * flow} opacity={unit(p * 1.5 - i * .085)} />)}
    </g></>
  }
}

function StrikeFloor({ fx, motif, p, paint }: Shot) {
  const area = fx.area
  if (!area) return null
  const [circle] = circlesOf(area)
  const r = circle?.radius ?? 0
  const wave = ease(p)
  const fade = 1 - p
  const pivot = at(area.center)
  if (motif === "seawall") return <g opacity={fade * .75}><WallRibs area={area} paint={paint} /></g>
  if (motif === "anvil" || motif === "breach") {
    const line = lineOf(area)
    if (!line) return null
    const step = edgeDistance(line.from, line.to)
    const width = line.width / 2
    return <g transform={at(line.from) + " rotate(" + heading(direction(line.from, line.to)) + ")"} opacity={fade}>
      <path d={`M0-${width}H${step}V${width}H0Z`} fill={paint.metal} fillOpacity={.17 * fade} stroke={paint.metal} strokeWidth="2.3" />
      {motif === "anvil" ? [.18, .43, .68, .93].map((t, i) =>
        <path key={t} d={`M${step * t - 18}-${width - 8}l12 8v${width * 2 - 32}l-12 8`}
          fill="none" stroke={i === 3 ? paint.light : paint.metal} opacity={unit(p * 8 - i * .7) * fade} strokeWidth="4.4" />)
        : <Gleam d={`M0 0${step * .25} -${width * .33} ${step * .52} ${width * .34} ${step * .75} -${width * .27} ${step} 0`}
          color={paint.accent} width={5.2} />}
    </g>
  }
  if (!circle) return null
  switch (motif) {
    case "stomp": return <g transform={pivot} opacity={fade}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = 45 * i
        const shape = path([polar(r * (.66 + wave * .32), a - 16), polar(r * (.72 + wave * .28), a),
          polar(r * (.66 + wave * .32), a + 16), polar(r * .68, a + 11), polar(r * .56, a - 7)]) + "Z"
        return <path key={i} d={shape} fill={paint.metal} fillOpacity=".16" stroke={paint.light} strokeWidth="2.6" />
      })}
      <path d={arc(r * .7, 18, 333)} fill="none" stroke={paint.accent} strokeWidth="2.3" strokeDasharray="22 11" />
    </g>
    case "muffle": return <g transform={pivot} opacity={fade}>
      <path d={path([polar(r * wave, -90), polar(r * wave, 30), polar(r * wave, 150)]) + "Z"}
        fill={paint.ink} fillOpacity=".15" stroke={paint.metal} strokeWidth="5" />
      <path d="M-42 29-5 16 16 26 41 13M-3 16-15-21 3-43" fill="none" stroke={paint.accent} strokeWidth="3.4" />
      <Pieces p={p} paint={paint} r={r * .68} count={6} spin={30} />
    </g>
    case "drum": return <g transform={pivot} opacity={fade}>
      <path d={arc(r * (.42 + wave * .58), -156, 166)} fill="none" stroke={paint.metal} strokeWidth={3 + fade * 6} />
      <path d={arc(r * (.27 + wave * .66), -133, 191)} fill="none" stroke={paint.accent} strokeWidth="2.8" strokeDasharray="12 8" />
      <path d={arc(r * (.22 + wave * .57), -98, 223)} fill="none" stroke={paint.light} strokeWidth="1.7" />
    </g>
    case "stakes": return <g opacity={fade}>
      {(fx.contacts ?? []).map((target, i) => <g key={i} transform={at(target) + " rotate(" + heading(direction(area.center, target)) + ")"}>
        <Gleam d="M42-33 25-12 41-6 22 5 38 15 19 32M49-26 52-10 47 8 49 26" color={paint.accent} width={3.4} />
        <path d="M-19-47h37m-46 83h58" stroke={paint.metal} fill="none" strokeWidth="2.2" strokeDasharray="8 5" />
      </g>)}
    </g>
    case "cracked": return <g transform={pivot} opacity={fade}>
      <path d={path(Array.from({ length: 20 }, (_, i) => polar(r * (.54 + wave * .46) * (i % 2 ? .77 : 1), i * 18))) + "Z"}
        fill={paint.metal} fillOpacity=".10" stroke={paint.light} strokeWidth="3.4" />
      <Pieces p={p} paint={paint} r={55} count={9} spin={22} length={29} />
    </g>
    case "overhead": return <g transform={pivot} opacity={fade}>
      <ellipse rx={r * (.53 + wave * .47)} ry={r * (.40 + wave * .60)} fill={paint.metal} fillOpacity=".15"
        stroke={paint.light} strokeWidth={2 + fade * 6} strokeDasharray="46 12" />
      <path d="M-68-22-25-11-11 4-33 29-79 39M-11 4 22-18 61-28m-39 10 26 21 31 2M-11 4 12 46 3 62" fill="none"
        stroke={paint.accent} strokeWidth="3.8" opacity=".83" />
      <Pieces p={p} paint={paint} r={r * .58} count={10} spin={12} length={34} />
    </g>
    case "island": return <g transform={pivot} opacity={fade}>
      <path d={path(Array.from({ length: 16 }, (_, i) => polar(r * (.66 + wave * .34) * (i % 2 ? .91 : 1), i * 22.5))) + "Z"}
        fill={paint.metal} fillOpacity=".08" stroke={paint.light} strokeWidth="3.7" />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} d={arc(r * (.55 + wave * .44), i * 72 - 38, i * 72 + 26)}
        fill="none" stroke={spectrum[i]} strokeWidth={7 * fade + 2} />)}
      <Pieces p={p} paint={paint} r={r * .78} count={10} length={27} />
    </g>
    default: return null
  }
}

function Skid({ from, to, p, paint, motif }: { from: EdgePoint; to: EdgePoint; p: number; paint: ArmorPaint; motif: BulwarkMotif }) {
  const length = edgeDistance(from, to)
  if (length < 3) return null
  const angle = heading(direction(from, to))
  const progress = Math.min(length, 20 + ease(p * 2.3) * length)
  return <g transform={at(from) + " rotate(" + angle + ")"} opacity={1 - p}>
    <path d={`M10 -13l${progress * .73} 7 ${progress * .27} 6L${progress * .7} 7l-${progress * .55} 9`}
      fill={paint.metal} fillOpacity=".12" stroke={paint.metal} strokeWidth="2.6" strokeDasharray={motif === "rimstrike" ? "13 9" : undefined} />
    <path d={`M${length - 11} -12l11 12-11 12`} fill="none" stroke={paint.light} opacity={ease(p * 3)} strokeWidth="2.6" />
  </g>
}

function StrikeFront({ fx, motif, p, paint }: Shot) {
  const fade = 1 - p
  return <g opacity={fade}>
    {(fx.contacts ?? []).map((to, i) => {
      const end = fx.bulwark.landings?.[i]
      const vector = direction(fx.from, to)
      const angle = heading(end ? direction(to, end) : vector)
      const icon = motif === "rimstrike" ? "M-19-38Q14-25 19 0 15 28-19 38L-5 11V-11Z M-10-31 8-14 11 0 8 14-10 31"
        : motif === "barbs" ? "M-39-24 13-8-8-6 23 1-11 10 11 17-37 21-19 3Z M-33-12-5 0-30 12"
        : motif === "seal" ? clampFace : motif === "shoulders" ? "M-35-15-15-28 21-9 31 0 14 12-14 10-16 25-32 9-18-6"
        : motif === "rampart" ? "M-43-20-12-12 8-23 17-9 33 0 17 9 8 23-12 12-43 20"
        : motif === "breach" ? "M-26-38-8-24 10-39 21-28 6-7 27 3 8 17 18 32 4 39-23 22-13 0Z"
        : motif === "stakes" ? "M-18 21-3-25 5-11 12-27 22 23Z" : motif === "drum" ? "M-22-19v26l22 12L22 7v-26M0 19v12"
        : motif === "overhead" ? "M-32-24-12-32 17-31 34-10 24 15 4 29-19 22-34 6Z M-27-8H27"
        : motif === "island" ? "M-29 2-11-19 9-15 30 0 11 15-10 18Z M-13-2H13"
        : motif === "anvil" ? "M-25-23h40l13 12v22L15 23h-40Z M-13-23v46m24-46v46"
        : "M-22-15-5-30 16-18 33 2 12 18-9 27-29 12Z";
      const slash = at(along(to, vector, -24 + 25 * ease(p))) + " rotate(" + angle + ")";
      return <g key={i}>
        {end && <Skid from={to} to={end} p={p} paint={paint} motif={motif} />}
        {(motif === "barbs" || motif === "shoulders" || motif === "rampart") &&
          <Gleam d={path([along(fx.from, vector, 40), along(to, vector, -16)])} color={paint.accent}
            width={motif === "shoulders" ? 4 : 3.1} fade={fade} />}
        <g transform={slash + " scale(" + (.88 + ease(p) * .27) + ")"}>
          <Plating d={icon} paint={paint} weight={motif === "overhead" || motif === "breach" ? 4.2 : 3} fill={.26} />
        </g>
      </g>
    })}
  </g>
}

function ShieldArrival({ fx, motif, paint, p }: Shot) {
  const lift = ease(p * 2.7)
  const fade = 1 - p ** 1.2
  const to = fx.to
  const side = motif === "spareplate" && edgeDistance(fx.from, to) > 35
  const relay = motif === "wake" && fx.bulwark.other && edgeDistance(fx.from, fx.bulwark.other) > 10
  const entry = motif === "portal" || motif === "bastions"
    ? circlesOf(fx.area).sort((a, b) => edgeDistance(a.center, to) - edgeDistance(b.center, to))[0] : undefined
  const shapes: Partial<Record<BulwarkMotif, string>> = {
    lockplate: "M-35-28-23-37H23l12 9M-28-30H28M-24-41v13m48-13v13",
    catchstrap: "M-39-7-26-22-9-18-14 0-9 17-28 16Z M-31-10l17-4",
    shieldstep: "M-39-24-18-38H20l21 14-10 26-31 23-31-23Z M-28-24H29M-27 0l27 15L28 0",
    cracked: "M-38-27-15-38-3-24 7-41 37-28 28 17 6 31-8 17-22 26-33 13Z",
    portal: "M-34 19V-17l16-21h36l16 21v36M-22-14 0-28 22-14 13 16H-13Z",
    handoff: "M-31-18 5-30 33-16 23 8 4 22-29 18-17 4Z M-12-18l28 5-13 20",
    bracewire: "M-41-22-29-34H29l12 12-9 30-10 5-13 21H-9l-13-21-10-5Z",
    twinhull: "M-37-25 34-25 28 4 10 28H-12l-19-24Z M-29-18h56M-16 15h31",
    spareplate: "M-35-27 8-42 36-30 32-17 38-8 26 20-22 30-37 15-28-6Z M-25-22 7-33 25-25",
    breach: "M-36-29-13-36 2-23 20-36 35-25 28 5-2 31-27 10Z",
    phalanx: "M-46-27-30-42H30l16 15-8 21-38 31-38-31Z M-36-27h72M-19-28v41m38-41v41",
    wake: "M-37-24-17-12 0-25 17-12 37-24 32 8 16 29 0 18-16 29-32 8Z",
    overhead: "M-41-17-28-35H28l13 18-3 19-20 20H-18L-38 2Z M-34-11h68",
    shore: "M-41-36-23-43H23l18 7-2 40-21 23-18 8-18-8L-39 4Z M-38 3l19 13h38L38 3",
    bastions: "M-39-14-22-36-4-20 0-33 4-20 22-36 39-14 27 19 0 33-27 19Z",
    accord: "M-42-24-29-38-16-23H16l13-15 13 14-6 40-18 21H-18L-36 16Z M-26 11h52",
    island: "M-37-28-15-35 10-29 30-35 40-16 32 5 20 15 9 35-13 32-24 16-40 3Z",
  }
  const gate = entry && along(entry.center, direction(entry.center, to), entry.radius - 8)
  return <g opacity={fade}>
    {relay && fx.bulwark.other && <>
      <Lash from={fx.from} to={fx.bulwark.other} paint={paint} style="cable" width={3.3} />
      {edgeDistance(fx.bulwark.other, to) > 22 && <Lash from={fx.bulwark.other} to={to} paint={paint} style="wire" />}
    </>}
    {gate && <Lash from={gate} to={to} paint={paint} style={motif === "portal" ? "strap" : "wire"} />}
    {side && <Lash from={fx.from} to={to} paint={paint} style="chain" width={3.6} />}
    <g transform={at(to) + " scale(" + (.72 + lift * .57 - p * .10) + ")"}>
      <Plating d={shapes[motif] ?? shieldFace} paint={paint} weight={motif === "island" || motif === "accord" ? 4.3 : 3.4} fill={.22} />
      {(motif === "bastions" || motif === "island") && <path d={arc(46 + lift * 12, -142, -38)} fill="none"
        stroke={paint.accent} strokeWidth="2.6" strokeDasharray="12 7" />}
    </g>
  </g>
}

function HealReaction({ fx, motif, paint, p }: Shot) {
  const bits = fx.bulwark.count === 2 ? 4 : 3
  return <g opacity={1 - p}>
    {motif === "twinhull" && <Lash from={fx.from} to={fx.to} paint={paint} style="cable" width={4.5} />}
    <g transform={at(fx.to)}>
      {motif === "rivets" ? <>
        <Gleam d="M-34 33-20 47H20l14-14" color={paint.accent} width={3.4} />
        {Array.from({ length: bits }, (_, i) => <g key={i} transform={at(polar(52, 149 - i * 96 / (bits - 1)))} opacity={unit(p * 6.6 - i * .62 + .17)}>
          <Plating d={rivet} paint={paint} weight={2.1} />
        </g>)}
      </> : motif === "axle" ? <Gleam d={arc(53, 38 - 38 * p, 149 - 38 * p) + "M-6 52l6-11 6 11"} color={paint.accent} width={4} />
        : motif === "twinhull" ? <Gleam d="M-37 12l14 17h46l14-17-13 5h-48Zm9 31 12 9h32l12-9" color={paint.accent} width={4.1} />
        : <Gleam d={`M-34 42q17 ${-19 * ease(p)} 34-7 17 ${-19 * ease(p)} 34-7M-12 42h24m-12-7v14`} color={paint.accent} width={3.2} />}
    </g>
  </g>
}

function BraceReaction({ fx, motif, p, paint }: Shot) {
  const fade = 1 - p
  const end = fx.bulwark.landings?.[0]
  const angle = heading(fx.bulwark.axis)
  const shift = Math.sin(p * Math.PI) * (motif === "mantle" ? 12 : 20)
  const shape = motif === "mantle" ? "M-20-40-7-23V23L-20 40M-7-36 5-20v40L-7 36"
    : motif === "pauldron" ? "M-31-31-20-41 0-38 14-12 2 23-16 30-15 1Z M-19-27-3-18"
    : motif === "wedges" ? "M-11-45 4-38-14-19ZM-11 45 4 38-14 19Z M-9-14v28"
    : motif === "twochocks" ? fx.bulwark.count ? "M-47-44-18-36-32-24-45-29Z M-43-54-28-46" : "M-47 44-18 36-32 24-45 29Z M-43 54-28 46"
    : motif === "axle" ? "M-28-36Q-56 0-28 36M-36-19-46-21-39 3-55 13-36 12"
    : motif === "rampart" ? "M-34-49-6-36-11-21-2-13-12 2-3 16-11 30-6 39-34 50Z"
    : motif === "phalanx" ? "M-24-58-14-34-8 0-14 34-24 58M-33-48-21-24-19 0-21 24-33 48"
    : motif === "shoulders" ? "M-16-55-39-21-19-6-33 13-12 49 6 21 1 2 14-28Z"
    : motif === "shore" ? "M-38-44-18-36-10-16-20 0-10 16-18 36-38 44M-33-30-23-17-30 0-23 17-33 30"
    : "M-43-41-22-27-36-18-21 0-36 18-22 27-43 41";
  return <g opacity={fade}>
    {end && <Skid from={fx.to} to={end} p={p} paint={paint} motif={motif} />}
    {motif === "rampart" && fx.bulwark.other && <Lash from={fx.bulwark.other} to={fx.to} paint={paint} style="chain" />}
    <g transform={at(fx.to) + " rotate(" + angle + ") translate(" + shift + " 0)"}>
      <Plating d={shape} paint={paint} weight={motif === "phalanx" || motif === "shore" ? 4.4 : 3.1} />
      <path d={`M-49-11l${-18 * p} -6m${18 * p} 28l${-18 * p} 6`} fill="none" stroke={paint.accent} strokeWidth="2.4" />
    </g>
  </g>
}

function ShieldWear({ fx, motif, paint, p }: Shot) {
  const fraction = fx.bulwark.remaining ?? 1
  const broken = fraction <= 0
  const angle = heading(fx.bulwark.axis) - 90
  const main = motif === "cracked" ? "M-35-30-15-39-7-25 6-40 33-27M-10-37-15-22 1-26-3-13 14-15 6 3"
    : motif === "lockplate" ? "M-36-35H34M-25-43-15-36-25-28m36-17-10 10 12 7-7 9"
    : "M-27-34-17-25-5-27-9-16 6-19 15-11 28-29";
  return <g opacity={1 - p} transform={at(fx.to) + " rotate(" + angle + ")"}>
    {broken ? <>
      {[-1, 1].map((sign) => <g key={sign} transform={`translate(${sign * ease(p) * 40} ${-ease(p) * 20}) rotate(${sign * p * 38}) scale(${sign} 1)`}>
        <Plating d="M-35-34-13-42-2-29-11-20-2-15-17-5-34-12Z" paint={paint} weight={3.2} />
      </g>)}
      <Pieces p={p} paint={paint} r={36} count={motif === "cracked" ? 7 : 4} spin={-30} length={18} />
    </> : <Gleam d={main} color={paint.accent} width={2.4 + (1 - fraction) * 2} />}
  </g>
}

function SharedImpact({ fx, motif, paint, p }: Shot) {
  const protector = fx.bulwark.other
  if (!protector) return null
  const original = fx.to
  const weight = fx.bulwark.remaining ?? .5
  const vector = direction(original, protector)
  const side = left(vector)
  const start = along(original, vector, 31)
  const stop = along(protector, vector, -31)
  const branch = along(mix(start, stop, .45), side, motif === "accord" ? 22 : motif === "bracewire" ? 16 : 9)
  const fill = ease(p * 2.1)
  const landing = mix(branch, stop, fill)
  const style = motif === "accord" ? "wire" : motif === "bracewire" ? "cable" : "strap"
  return <g opacity={1 - p ** 1.28}>
    <Lash from={original} to={protector} paint={paint} style={style} width={2.6 + weight * 2.3} />
    {motif === "accord" && <g opacity={1 - p}>
      {[-1, 1].map((sign, i) => {
        const arcAt = along(mix(start, stop, .31 + .30 * i), side, sign * 27)
        const wave = path([start, along(arcAt, vector, -23), arcAt, mix(arcAt, stop, fill)])
        return <Gleam key={sign} d={wave} color={spectrum[i * 3]} width={3.6} />
      })}
      {[.25, .53, .79].map((t, i) => <g key={t} transform={at(mix(start, stop, t)) + " rotate(" + heading(vector) + ")"}
        opacity={unit((fill - t) * 3 + .30)}>
        <Plating d="M-16 0-7-9H7L16 0 7 9H-7Z" paint={{ ...paint, metal: spectrum[i + 1] }} weight={2.1} />
      </g>)}
    </g>}
    <Gleam d={path([along(original, direction(original, fx.from), Math.min(edgeDistance(original, fx.from) * .53, 75)),
      along(original, direction(original, fx.from), 24)])} color={paint.light} width={3.2} />
    <Gleam d={path([start, branch, landing])} color={paint.accent} width={2.5 + weight * 4.7} />
    <g transform={at(original) + " rotate(" + heading(vector) + ")"}>
      <Plating d="M-37-20-20-11-7-16 8 0-7 16-20 11-37 20M-16-10v20" paint={paint} weight={2.6} />
    </g>
    <g transform={at(protector) + " rotate(" + heading(vector) + ")"}>
      <Plating d={motif === "accord" ? "M-43-29-26-16-16-29-4-17-20 0-4 17-16 29-26 16-43 29"
        : "M-38-29-19-16-9 0-19 16-38 29M-20-24l13 24-13 24"} paint={paint} weight={3.3} />
    </g>
  </g>
}

function WallContact({ fx, motif, paint, p }: Shot) {
  const closed = (fx.bulwark.remaining ?? 0) <= 0
  const opacity = 1 - p
  const area = fx.area
  const [circle] = circlesOf(area)
  const toward = direction(fx.from, fx.to)
  const bearing = heading(toward)
  const hit = fx.to
  return <g opacity={opacity}>
    {motif === "citadel" && circle && <g transform={at(circle.center)}>
      <path d={arc(circle.radius - 9, bearing + 140 - 60 * p, bearing + 220 + 60 * p)} fill="none"
        stroke={paint.light} strokeWidth={3 + 6 * opacity} opacity=".82" />
      {closed && <Pieces p={p} paint={paint} r={circle.radius - 15} count={12} length={31} />}
    </g>}
    {motif === "seawall" && <WallRibs area={area} paint={paint} fractured />}
    <Gleam d={path([along(hit, toward, -Math.min(115, edgeDistance(hit, fx.from))), hit])}
      color={motif === "citadel" ? paint.accent : paint.metal} width={5.6} />
    <g transform={at(hit) + " rotate(" + (bearing + 90) + ")"}>
      <Plating d={motif === "citadel" ? "M-37-21H-23v-9h18v11H11v-11h18v10h11v31H-37ZM-29 1H32"
        : "M-51-8-24-17-3-6 10-20 21-2 43-14M-41 10-23 2-1 13 12 0 25 13 49 5"}
        paint={paint} weight={4.5} fill={.37} />
      {closed && <Pieces p={p} paint={paint} r={31} count={motif === "citadel" ? 7 : 6} spin={17} length={25} />}
    </g>
  </g>
}

function Deflect({ fx, paint, p }: Shot) {
  const vector = direction(fx.from, fx.to)
  const angle = heading(vector)
  const span = Math.min(edgeDistance(fx.from, fx.to), 120)
  const cue = fx.bulwark.cue
  return <g opacity={1 - p} transform={at(fx.to) + " rotate(" + angle + ")"}>
    {cue === "interrupt" ? <>
      {[-1, 1].map((sign) => <g key={sign} transform={`translate(${28 + p * 31} ${sign * (16 + p * 30)}) rotate(${sign * p * 40}) scale(1 ${sideOf(sign)})`}>
        <Plating d="M-48-6-22-9-11-25 8-16-5 6-29 17-20 2Z" paint={paint} weight={4.2} />
      </g>)}
      <Gleam d="M-41-44 38 45M-28 47 42-36" color={paint.light} width={3.9} />
    </> : cue === "taunt" ? <>
      <Gleam d={`M-${span} 0h${span - 20}m-27-19 24 19-24 19`} color={paint.accent} width={4.3} />
      <path d="M-42-40-26-30m-16 70 16-10" stroke={paint.light} fill="none" strokeWidth="3.1" />
    </> : <>
      <Gleam d={`M-${span} -13-${span * .55} -9 -51 11 -22 5`} color={paint.accent} width={3.8} />
      <Plating d="M-54-36-37-27-39-14-30-9M-52 34-39 25-40 12-28 4" paint={paint} weight={3.4} />
    </>}
  </g>
}

function Slide({ fx, paint, p, battle }: Shot & { battle: EdgeBattle }) {
  const rider = unitOf(battle, fx.target)
  if (!rider?.hp || rider.force?.cause?.id !== fx.cast) return null
  const current = point(rider)
  const face = heading(direction(fx.from, fx.to))
  const trail = edgeDistance(fx.from, current)
  return <g opacity={.9 - p * .36}>
    <g transform={at(fx.from) + " rotate(" + face + ")"}>
      <Gleam d={`M-9-26H${trail * .82}M-20 23H${trail * .79}M-18-15H${trail * .56}`} color={paint.metal} width={2.7} />
    </g>
    <g transform={at(current) + " rotate(" + face + ")"}>
      <Plating d="M23-36 43-24 48 0 43 24 23 36 29 0Z M34-23 41 0 34 23" paint={paint} weight={3.9} />
    </g>
  </g>
}

export function EdgeBulwarkEffects({ battle, layer }: { battle: EdgeBattle; layer: "floor" | "front" }) {
  return <g aria-hidden="true" pointerEvents="none">
    {battle.runtime.effects.map((effect) => {
      const beat = effect.bulwark
      const art = beat && bulwarkChoreography(effect.skill)
      if (!beat || !art || battle.time < effect.start || battle.time >= effect.end) return null
      if (effect.phase === "windup" && !unitOf(battle, beat.owner)?.hp) return null
      const fx = { ...effect, bulwark: beat }
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const paint = armorPaint[fx.rarity]
      const shot = { fx, p, paint, motif: art.motif }
      const { cue } = beat
      let frame
      if (layer === "floor") {
        if (cue === "setup") frame = <Approach {...shot} />
        if (cue === "strike" && fx.area) frame = <StrikeFloor {...shot} />
      } else switch (cue) {
        case "strike": if (fx.contacts?.length) frame = <StrikeFront {...shot} />; break
        case "shield": frame = <ShieldArrival {...shot} />; break
        case "heal": frame = <HealReaction {...shot} />; break
        case "brace": frame = <BraceReaction {...shot} />; break
        case "absorb": frame = <ShieldWear {...shot} />; break
        case "share": frame = <SharedImpact {...shot} />; break
        case "crossing": frame = <WallContact {...shot} />; break
        case "step": frame = <Slide {...shot} battle={battle} />; break
        case "taunt": case "interrupt": case "weak": frame = <Deflect {...shot} />; break
      }
      return frame && <g key={fx.id} data-bulwark-cue={cue} data-bulwark-motif={art.motif} data-bulwark-layer={layer}>{frame}</g>
    })}
  </g>
}
