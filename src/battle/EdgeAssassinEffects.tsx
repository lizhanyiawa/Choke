import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, circlesOf, ease, heading, mix, path, polar, spectrum, unit } from "./EdgeBulwarkFields"
import { along, areaPath, direction, edgeDistance, fieldCrossing, isOutside, left, type EdgeArea } from "./edgeSkills/geometry"
import { assassinChoreography, type AssassinMotif } from "./edgeSkills/assassinChoreo"
import type { AssassinBeat, SkillVisual } from "./edgeSkills/presentation"
import { battleFighters, unitOf, type FieldEffect } from "./edgeSkills/state"

type Layer = "floor" | "front"
type Shot = { fx: SkillVisual; beat: AssassinBeat; motif: AssassinMotif; p: number; color: string; light: string }
const colors: Record<Rarity, readonly [string, string]> = {
  C: ["#c9cfdf", "#fff6fb"], UC: ["#86c9ef", "#e9f5ff"], R: ["#b3adff", "#e7e2ff"],
  E: ["#c199ff", "#ffe0f5"], L: ["#efc777", "#fff6d5"], Radiant: ["#ffa5d0", "#fff1ec"], Prismatic: ["#ccb4ff", "#f7faff"],
}
const pose = (point: EdgePoint, axis: EdgePoint, turn = 0) => at(point) + " rotate(" + (heading(axis) + turn) + ")"
const crests: Record<AssassinMotif, string> = {
  backstab: "M-28 13Q-27-17 13-22L2-9-8-5-7 7Z",
  thrust: "M-31-4H3L29 0 3 4H-31M-13-12V12",
  scar: "M-23-16 17 12M-8-16-2 3-17 12M13-2 9 15 22 21",
  sidestep: "M-28 11Q-7-20 22-13L6 1-6 3M5 18H26",
  retreat: "M27-15-4-7-28 9-4 4 20 11M-14-14-28-7-14 0",
  sideflash: "M-28-12-9-20 7-4 28 12 9 20-7 4ZM-26 18 25-17",
  shadowrush: "M-31-11 5-3 29 0 5 3-31 11-18 0ZM-29 19H-4",
  foldedknife: "M-28-15 2-7 26 16 6 5-8 11-3 0Z",
  stopneedle: "M-31 0H19M19-24V24M10-10 20 0 10 10",
  mask: "M-28-16 0-7 28-16 21 12 0 23-21 12ZM-17-2-7 3M7 3 17-2",
  brokenbeat: "M-28-13H-4L4-4-5 4H-28M7-13H28M-21 17H28M14-5V21",
  returningdagger: "M-28-8 9-16 28 0 9 16-28 8-2 0ZM-15-23-24-15-14-12",
  crossshadow: "M-26-20-4-12 26 17 4 10ZM26-20 4-12-26 17-4 10Z",
  sightmark: "M-28-18H-11M-28-18V-1M28 18H11M28 18V1M-15 7 1-10 18 6 2 19Z",
  windreveal: "M-28-14 0-6 28-14M-28 9-3 1 24 20M-3-22V21",
  shimmer: "M-28 15Q-15-16 12-20L-1-6 28 10 1 4Z",
  shadowpin: "M-27 15-18-18-9 15M-7 18 0-26 7 18M9 15 18-18 27 15",
  seamrun: "M-31-7H13L30 0 13 7H-31M-3 7 4 23 25 23",
  conceal: "M-27-18 0-8 27-18 19 16 0 24-19 16ZM-17 2 1-5 20 3",
  offhand: "M-29-11 1-5 25 17 8 6-7 9ZM-21 18H-4M15-20V-7",
  deathchase: "M-30-20-2-10 29 19 5 9ZM-24-25 2-16 31 11M-9 14H14",
  chasecircle: "M-27 10Q-39-19 5-23L23-16 29 1M17-18 24-7 13-4M-12 13 18 3",
  fallingneedle: "M-24-20-15 18-7-20M-7-27 0 25 7-27M7-20 15 18 24-20",
  backmark: "M-28 12Q-7-23 20-18L9-3 27 10 7 7-6 19ZM-26-13H-8",
  wrappedstep: "M-28-8-7-22 17-13 29 6 9 22-15 16ZM-17-3 4-12 18 6",
  turnaround: "M-31-9H10L25 0 10 9H-3M-11 9-24 20-31 9M-24 20H14",
  mirroredge: "M-30-18 0-9 30 18 0 9ZM30-18 0-9-30 18 0 9Z",
  bordercut: "M-31-12H31L18 1H-18ZM-27 10H27M-17 18H17",
  borrowstep: "M-29-13-8-20 11-7 28-13 25 11 5 23-16 13ZM-17-5 6 2-5 13",
  blankstep: "M-28-18-3-10 26 17 4 10ZM28-18 4-11-26 17-4 10ZM-10-26H10",
  boundaryexec: "M-33-20-6-11 31 19 6 11ZM33-20 6-11-31 19-6 11ZM-21 27H21",
  doubleedge: "M-34-17 10-9 32 5 6 2-17 10ZM34 17-10 9-32-5-6-2 17-10Z",
  windshear: "M-32-20 0-9 32-20 17 2 0 23-17 2ZM-23-13 0 14 23-13",
  shadowpit: "M-29-20H29L21 12 0 26-21 12ZM-15-9H15L0 9ZM-32 25H32",
  shoreward: "M-33-17 0-8 33-17 18 8 0 25-18 8ZM-20-4 0 13 20-4",
}
const outlines = (area?: EdgeArea) => area ? areaPath(area) : ""

function Blade({ shot, from, to, bend = 0, size = 1, progress }: { shot: Shot; from: EdgePoint; to: EdgePoint; bend?: number; size?: number; progress?: number }) {
  const p = progress ?? ease(unit(shot.p * 1.7))
  const length = edgeDistance(from, to)
  return <g transform={pose(from, direction(from, to))}>
    <path d={`M0 0Q${length * .52} ${bend} ${length} 0`} fill="none" stroke={shot.color} strokeWidth={2.2 * size} strokeOpacity=".48" />
    <g transform={`translate(${length * p} ${2 * bend * p * (1 - p)}) rotate(${heading({ x: 1, y: bend * (1 - 2 * p) / Math.max(1, length) })}) scale(${size})`}>
      <path d="M-37-5H-8L19 0-8 7-37 4-27 0Z" fill={shot.color} fillOpacity=".6" stroke={shot.light} strokeWidth="2" />
      <path d="M-17-12V11M-26 0H-6" stroke={shot.light} strokeWidth="2.4" />
    </g>
  </g>
}

function Slash({ shot, where, turn, length = 100, width = 15 }: { shot: Shot; where: EdgePoint; turn: number; length?: number; width?: number }) {
  const q = ease(unit(shot.p * 1.9)), n = length / 2
  return <g transform={pose(where, shot.beat.axis, turn)}>
    <path d={`M${-n} ${width}Q${-n * .2} ${-width - q * 13} ${n} ${-width}Q0 ${width * .7} ${-n} ${width}Z`}
      fill={shot.color} fillOpacity=".23" stroke={shot.light} strokeWidth="2.5" />
    <path d={`M${-n} ${width + 7}Q0 ${4 - q * 6} ${n * .8} ${-width + 5}`} fill="none" stroke={shot.color} strokeWidth="1.8" />
  </g>
}

function Ghost({ shot, where, tilt = 0, opacity = .4 }: { shot: Shot; where: EdgePoint; tilt?: number; opacity?: number }) {
  return <g transform={`${at(where)} rotate(${tilt})`} opacity={opacity}>
    <path d="M-24-39-8-49H18L28-36V27L11 39H-24Z" fill="#22152e" fillOpacity=".62" stroke={shot.color} strokeWidth="2" />
    <path d="M-16-26H13M-15-17H7M-13 25H17" stroke={shot.light} strokeWidth="1.4" />
  </g>
}

function Opening({ shot }: { shot: Shot }) {
  const { fx, beat, motif, color, light, p } = shot
  const q = ease(p), circle = circlesOf(fx.area)[0]
  if (motif === "fallingneedle" || motif === "windshear") return <g>
    {fx.area && <path d={outlines(fx.area)} fill={color} fillOpacity=".035" stroke={color} strokeWidth="2.3" strokeDasharray="6 10" />}
    {(motif === "windshear" ? [-1, 1] : [-1, 0, 1]).map((s, i) => <g key={s} transform={at({ x: fx.to.x + s * (circle?.radius ?? 92) * (.79 - .13 * q), y: fx.to.y - (motif === "windshear" ? 22 : 112) })}>
      <path transform={`rotate(${motif === "windshear" ? s * (39 - 13 * q) : s * -12})`} d={motif === "windshear" ? "M-17-92H17L28-5 0 82-28-5Z" : "M-7-52H7L14 18 0 62-14 18Z"}
        fill={color} fillOpacity=".13" stroke={fx.rarity === "Prismatic" ? spectrum[i * 2] : light} strokeWidth="2.7" />
    </g>)}
  </g>
  if (motif === "boundaryexec" || motif === "doubleedge") return <g>
    {[-1, 1].map((s) => <path key={s} transform={pose(along(fx.to, left(beat.axis), s * (87 - q * 26)), beat.axis, s * 27)}
      d="M-72-10 0-2 61 7 4 12-46 5Z" fill={color} fillOpacity=".15" stroke={s === 1 ? light : spectrum[1]} strokeWidth="2.8" />)}
    <path transform={at(fx.to)} d={arc(52 - 10 * q, -59, 58) + arc(52 - 10 * q, 122, 239)} fill="none" stroke={color} strokeWidth="2" />
  </g>
  if (motif === "deathchase") return <g transform={pose(fx.to, beat.axis, 52)}>
    <path d={`M-81 8Q-9 ${-25 + 12 * q} 72-13`} fill="none" stroke={light} strokeWidth="2.5" />
    {beat.kind === "execute" && <path d="M-69 27Q-2-4 83 7M-13-36V-20M13 35V51" fill="none" stroke={color} strokeWidth="3.7" />}
  </g>
  return <g>
    {fx.area && <path d={outlines(fx.area)} fill={color} fillOpacity=".025" stroke={color} strokeWidth="2" strokeDasharray="7 9" />}
    {beat.other && <><Ghost shot={shot} where={beat.other} opacity={.25 + q * .35} />
      <path d={path([fx.from, beat.other])} stroke={color} strokeWidth="2" strokeDasharray="4 10" /></>}
    <path transform={`${at({ x: fx.to.x + 35, y: fx.to.y - 42 })} rotate(${-18 + 18 * q}) scale(${.64 + .18 * q})`}
      d={crests[motif]} fill={color} fillOpacity=".17" stroke={light} strokeWidth="2.1" />
    {beat.kind === "follow" && <path transform={at(fx.to)} d={`M-38-48H-17M17-48H38M-38 39H-17M17 39H38`} fill="none" stroke={color} strokeWidth="2" />}
  </g>
}

function Cut({ shot }: { shot: Shot }) {
  const { fx, beat, motif, p, color, light } = shot
  const q = ease(unit(p * 1.7))
  const hits = beat.paths?.length ? beat.paths : [{ at: fx.to, end: undefined, bonus: false }]
  const circle = circlesOf(fx.area)[0]
  if (["seamrun", "bordercut"].includes(motif) || motif === "turnaround" && fx.area) return <>
    {fx.area && <path d={outlines(fx.area)} fill={color} fillOpacity=".14" stroke={light} strokeWidth="2.5" />}
    <path d={path([fx.from, fx.to])} stroke={light} strokeWidth="3.5" strokeDasharray={motif === "seamrun" ? "18 7" : ""} />
    {hits.map((hit, i) => <Slash key={i} shot={shot} where={hit.at} turn={motif === "bordercut" ? 82 : 25} length={90} />)}
    <PushPaths shot={shot} />
  </>
  if (motif === "windshear" && (fx.beat ?? 1) > 1) return <>{hits.map((h, i) => <g key={i} transform={at(h.at)}>
    <path d={`M-5 ${-98 + q * 67}H5L12 19 0 61-12 19Z`} fill={spectrum[3]} fillOpacity=".34" stroke={light} strokeWidth="2.4" />
    <path d="M-21 30 0 46 21 30" fill="none" stroke={color} strokeWidth="3" />
  </g>)}</>
  if (motif === "windshear") return <>
    {[-1, 1].map((s, i) => <g key={s} transform={`${at(fx.to)} rotate(${s * (48 - 21 * q)})`}>
      <path d={`M${s * (110 - 67 * q)} -126 0-14 ${-s * 26} 91 ${s * 63} 1Z`}
        fill={spectrum[i * 2]} fillOpacity=".19" stroke={light} strokeWidth="3.5" />
      <path d={`M${s * 110} -126 0-14 ${-s * 26} 91`} fill="none" stroke={spectrum[3]} strokeWidth="1.5" />
    </g>)}
    {hits.map((h, i) => <Slash key={i} shot={shot} where={h.at} turn={fx.beat && fx.beat > 1 ? 88 : -32} length={fx.beat && fx.beat > 1 ? 104 : 69} width={8} />)}
  </>
  if (motif === "fallingneedle" || motif === "offhand" && fx.area) return <>
    {circle && <path transform={at(circle.center)} d={arc(circle.radius, -26, 73) + arc(circle.radius, 128, 232)} fill="none" stroke={color} strokeWidth="2" />}
    {hits.map((h, i) => <g key={i} transform={at(h.at)}>
      {[-1, 0, 1].map((s) => <path key={s} transform={`translate(${s * 25} ${-68 + q * 53}) rotate(${s * -9})`}
        d="M-5-51H5L11 12 0 43-11 12Z" fill={color} fillOpacity=".42" stroke={light} strokeWidth="2.3" />)}
      <path d={`M-32 32-13 23 0 34 13 23 32 32`} fill="none" stroke={color} strokeWidth="2.8" />
    </g>)}
  </>
  return <>{hits.map((hit, i) => {
    const t = hit.at, tilt = (fx.beat ?? 1) > 1 ? 180 : 0
    switch (motif) {
      case "backstab": return <g key={i}><Slash shot={shot} where={along(t, beat.axis, 17)} turn={118} length={77} width={14} />
        <path transform={pose(t, beat.axis)} d={`M32-30Q${52 - 13 * q} 0 25 31`} fill="none" stroke={color} strokeWidth="3" /></g>
      case "thrust": return <g key={i}><Blade shot={shot} from={along(t, beat.axis, -92)} to={along(t, beat.axis, 26)} size={.76} />
        <path transform={pose(t, beat.axis)} d="M34-14V14M43-7V7" stroke={light} strokeWidth="2.5" /></g>
      case "scar": return <g key={i} transform={pose(t, beat.axis, -36)}>
        <path d={`M-44-6-8 1 29-10M-6 1 10 ${8 + 21 * q}M5-2-3 ${-9 - 19 * q}`} stroke={light} strokeWidth={(fx.beat ?? 1) > 1 ? 3.8 : 2.2} fill="none" />
      </g>
      case "sidestep": return <g key={i}><Slash shot={shot} where={t} turn={-52} length={85} />
        <path transform={pose(t, beat.axis)} d="M-49-25Q-64 5-43 34" stroke={color} strokeWidth="2.6" fill="none" /></g>
      case "retreat": return <g key={i}><Blade shot={shot} from={along(t, beat.axis, 15)} to={along(t, beat.axis, -73)} size={.8} />
        <path transform={pose(t, beat.axis)} d="M-19-24 4-9 26-18M-19 24 4 9 26 18" stroke={color} strokeWidth="2.2" fill="none" /></g>
      case "sideflash": return <g key={i}><Slash shot={shot} where={t} turn={-75} length={112} width={19} /><Slash shot={shot} where={t} turn={27} length={54} width={5} /></g>
      case "shadowrush": return <g key={i} transform={pose(t, beat.axis)}>{[-1, 0, 1].map(s => <path key={s} transform={`rotate(${s * 37})`} d={`M-19-6 41 0-19 6-5 0Z`}
        fill={color} fillOpacity=".34" stroke={light} strokeWidth="2.4" />)}</g>
      case "foldedknife": return <g key={i} transform={pose(t, beat.axis, 40 * q)}><path d="M-47-21-5-6 31 23 3 10-18 18-6 0Z" fill={color} fillOpacity=".3" stroke={light} strokeWidth="2.4" /></g>
      case "stopneedle": return <g key={i}><Blade shot={shot} from={along(t, beat.axis, 45)} to={along(t, beat.axis, -35)} size={1.1} />
        <path transform={pose(t, beat.axis)} d="M-12-34V34M-22-23V23" stroke={color} strokeWidth="3" /></g>
      case "brokenbeat": return <g key={i} transform={pose(t, beat.axis, -19)}><path d="M-43-26H-9L2-14-11-3H-43M12-26H39M-34 17H38M21-3V31" fill="none" stroke={color} strokeWidth="2.8" />
        <path d="M-16-16 31 21" stroke={light} strokeWidth="3.5" /></g>
      case "returningdagger": return <g key={i}><Slash shot={shot} where={t} turn={tilt + 24} length={119} width={13} />
        <path transform={pose(t, beat.axis, tilt)} d={`M-40-30Q12-57 47-4L35-13M47-4 45-21`} stroke={color} strokeWidth="2.7" fill="none" /></g>
      case "crossshadow": return <g key={i}><Ghost shot={shot} where={along(t, left(beat.axis), -39)} opacity={.26} /><Slash shot={shot} where={t} turn={55} length={111} /><Slash shot={shot} where={t} turn={-35} length={83} width={8} /></g>
      case "sightmark": return <g key={i} transform={pose(t, beat.axis, -12)}><path d="M-39-32H-19M-39-32V-12M39 32H19M39 32V12M-21 5 3-19 26 5 3 24Z" fill="none" stroke={color} strokeWidth="2.7" />
        <path d="M-34 19 31-20" stroke={light} strokeWidth="3" /></g>
      case "windreveal": return <g key={i}><Slash shot={shot} where={t} turn={-19} length={128} /><path transform={at(t)} d="M-43-23-13-8-29 17M43-23 13-8 29 17" fill="none" stroke={color} strokeWidth="2.3" /></g>
      case "shimmer": return <g key={i}>{[-1, 0, 1].map(s => <Slash key={s} shot={shot} where={along(t, left(beat.axis), s * 12)} turn={-32 + s * 11} length={105 - Math.abs(s) * 19} width={8} />)}</g>
      case "shadowpin": return <g key={i} transform={at(t)}>{[-1, 0, 1].map(s => <path key={s} transform={`translate(${s * 33} ${21 - 29 * q}) rotate(${s * 26})`} d="M-7 24 0-51 7 24 0 13Z" fill={color} fillOpacity=".6" stroke={light} strokeWidth="2.2" />)}</g>
      case "deathchase": return <Slash key={i} shot={shot} where={(fx.beat ?? 1) > 1 ? along(t, left(beat.axis), 21) : t}
        turn={52} length={(fx.beat ?? 1) > 1 ? 126 : 143} width={(fx.beat ?? 1) > 1 ? 10 : 24} />
      case "chasecircle": return <g key={i}><path transform={at(t)} d={arc(51 + q * 12, -34, 221)} fill="none" stroke={color} strokeWidth="3.5" strokeDasharray="22 5" /><Slash shot={shot} where={t} turn={-39} length={128} width={hit.bonus ? 23 : 13} /></g>
      case "backmark": return <g key={i}><Slash shot={shot} where={t} turn={-116} length={128} width={18} /><path transform={pose(t, beat.axis)} d="M-54 19Q-12 58 39 28L23 21M39 28 31 43" fill="none" stroke={color} strokeWidth="3" /></g>
      case "wrappedstep": return <g key={i}><Slash shot={shot} where={t} turn={-67} length={114} width={23} /><Ghost shot={shot} where={fx.from} opacity={.22 * (1 - q)} /></g>
      case "turnaround": return <Slash key={i} shot={shot} where={t} turn={-26} length={102} width={13} />
      case "mirroredge": return <g key={i}><Slash shot={shot} where={t} turn={tilt + 37} length={157} width={20} /><path transform={pose(t, beat.axis, tilt)} d="M-64-31-22-20 46 32" fill="none" stroke={color} strokeWidth="3" /></g>
      case "borrowstep": return <g key={i}><Slash shot={shot} where={t} turn={81} length={97} width={20} /><path transform={at(t)} d="M-38 34-15 26 8 35 34 26" fill="none" stroke={light} strokeWidth="3" /></g>
      case "blankstep": return <g key={i}><Slash shot={shot} where={t} turn={36} length={141} width={21} /><Slash shot={shot} where={t} turn={-54} length={87} width={7} /></g>
      case "boundaryexec": return <g key={i}>
        <Slash shot={shot} where={t} turn={(fx.beat ?? 1) > 1 ? 42 : -49} length={(fx.beat ?? 1) > 1 ? 220 : 152} width={(fx.beat ?? 1) > 1 ? 31 : 18} />
        <path transform={pose(t, beat.axis, 42)} d="M-99-22-52-31 44 13 102 37" fill="none" stroke={spectrum[3]} strokeWidth="3" />
        <PushPaths shot={{ ...shot, beat: { ...beat, paths: [hit] } }} />
      </g>
      case "doubleedge": return <g key={i}><Slash shot={shot} where={t} turn={tilt + 22} length={196} width={30} />
        <path transform={pose(t, beat.axis, tilt + 22)} d="M-94 27-32 12 12 19 77-9" fill="none" stroke={spectrum[1]} strokeWidth="3" /><PushPaths shot={shot} /></g>
      case "shadowpit": return <g key={i} transform={at(t)}>{[-1, 1].map(s => <path key={s} transform={`scale(${s} 1)`} d={`M${53 - q * 28}-61 11-17 0 41 27 18 51-18Z`} fill={color} fillOpacity=".23" stroke={light} strokeWidth="3" />)}
        <path d="M-40 44H40" stroke={color} strokeWidth="3" /></g>
      case "shoreward": return <g key={i}><Slash shot={shot} where={t} turn={-31} length={187} width={26} />
        <path transform={pose(t, beat.axis)} d="M-79 27-30 39 27 22 78 32" fill="none" stroke={spectrum[3]} strokeWidth="2.4" /><PushPaths shot={shot} /></g>
      default: return <Slash key={i} shot={shot} where={t} turn={-42} length={94} />
    }
  })}</>
}

function PushPaths({ shot }: { shot: Shot }) {
  return <>{shot.beat.paths?.map(({ at: start, end }, i) => {
    if (!end) return null
    const cross = !isOutside(start) && isOutside(end) ? fieldCrossing(start, end) : undefined
    return <g key={i}>
      <path d={path([start, end])} fill="none" stroke={shot.color} strokeWidth="3" strokeDasharray="11 7" />
      <path transform={pose(end, direction(start, end))} d="M-19-12 0 0-19 12M-8-12 11 0-8 12" fill="none" stroke={shot.light} strokeWidth="2.9" />
      {cross && <path transform={pose(cross, direction(start, end))} d="M-7-48 5-16-6 8 7 48" fill="none" stroke={spectrum[3]} strokeWidth="3.2" />}
    </g>
  })}</>
}

function Status({ shot }: { shot: Shot }) {
  const { fx, beat, motif, p, color, light } = shot, q = ease(p)
  if (beat.cue === "phase" && motif === "shimmer") return <g transform={at(fx.to)}>
    {[-1, 0, 1].map(s => <path key={s} transform={`translate(${s * (15 + 11 * q)} ${s * -9}) rotate(-17)`}
      d="M-11-59 14-44 11 32-7 51 0 8Z" fill={color} fillOpacity=".09" stroke={color} strokeWidth="2" />)}
    <path d="M-9 49H9M0 44V54" stroke={light} strokeWidth="2.7" />
  </g>
  if (beat.cue === "phase" && motif === "conceal") return <g transform={at(fx.to)}>
    {[-1, 1].map(s => <path key={s} transform={`scale(${s} 1) translate(${16 * (1 - q)} 0)`}
      d="M-5-48 44-28 27 1 42 30 1 47 13 8Z" fill={color} fillOpacity=".1" stroke={light} strokeWidth="2.2" />)}
    <path d="M-27 47H27M21 42 31 47 21 52" stroke={color} strokeWidth="2" fill="none" />
  </g>
  if (beat.cue === "phase" && motif === "blankstep") return <g transform={at(fx.to)}>
    {[-1, 1].map(s => <g key={s} transform={`scale(${s} 1)`}>
      <path d={`M21-52 40-35 32-9 45 16 24 43 34 9 19-18Z`} fill={color} fillOpacity=".13" stroke={light} strokeWidth="2" />
      <path d={`M${40 + 12 * q} -43l13 9-9 12M${47 + 17 * q} 18l-9 13`} fill="none" stroke={color} strokeWidth="2.7" />
    </g>)}
  </g>
  if (beat.cue === "phase") return <g transform={at(fx.to)}>{[-1, 1].map(s => <g key={s} transform={`translate(${s * (8 + q * 18)} 0) scale(${s} 1)`}>
    <path d="M-5-53 35-35 30 30 4 47 10 10Z" fill={color} fillOpacity=".09" stroke={color} strokeWidth="2" />
    <path d="M13-22 27-14 13-5" fill="none" stroke={light} strokeWidth="2.2" />
  </g>)}<path d="M-10 49H10M0 44V54" stroke={light} strokeWidth="3" /></g>
  if (beat.cue === "shield" || beat.cue === "ward") return <g transform={pose(fx.to, beat.axis)}>
    {[-1, 1].map(s => <path key={s} transform={`scale(1 ${s}) translate(0 ${6 + 15 * (1 - q)})`} d="M-36-39 7-46 39-24 17-13-10-20-36-11Z"
      fill={color} fillOpacity=".15" stroke={light} strokeWidth={beat.cue === "ward" ? 3.2 : 2.4} />)}
    {beat.cue === "ward" && <path d="M-38-20-25-5-34 8-17 21" fill="none" stroke={color} strokeWidth="2.8" />}
  </g>
  if (beat.cue === "interrupt" || beat.cue === "stop") return <g transform={pose(fx.to, beat.axis)}>
    <path d="M-31-51-6-14-15 0 6 14 31 51M-35 25 35-25" fill="none" stroke={light} strokeWidth="3.3" />
    {beat.other && <path d={path([{ x: 0, y: 0 }, { x: edgeDistance(fx.to, beat.other), y: 0 }])} stroke={color} strokeDasharray="4 11" fill="none" />}
  </g>
  if (beat.cue === "release" && beat.paths) return <><PushPaths shot={shot} /><Slash shot={shot} where={fx.to} turn={32} length={100} /></>
  if (beat.cue === "release") return <><Blade shot={shot} from={fx.from} to={fx.to} size={1.1} bend={-22} /><Slash shot={shot} where={fx.to} turn={-62} length={108} /></>
  return <g transform={`${at({ x: fx.to.x + 39, y: fx.to.y - 38 })} rotate(${13 * (1 - q)})`}>
    <path d={crests[motif]} fill={color} fillOpacity=".24" stroke={light} strokeWidth="2.2" />
  </g>
}

function Readiness({ battle }: { battle: EdgeBattle }) {
  if (battle.finishedAt !== null) return null
  const marks = [...battle.runtime.buffs.map(b => ({ cast: b.cast, target: b.target, until: b.until, kind: b.kind })),
    ...battle.runtime.watches.filter(w => w.uses > 0).map(w => ({ cast: w.cast, target: w.target, until: w.until, kind: "watch" }))]
  const seen = new Set<string>()
  return <>{marks.map(({ cast, target, until, kind }) => {
    const art = !cast.signature && assassinChoreography(cast.skill?.id), holder = unitOf(battle, target)
    const id = cast.skill?.id, key = id + "@" + target + kind
    if (!art || !holder?.hp || !id || until <= battle.time || seen.has(key)) return null
    seen.add(key)
    const owner = battleFighters(battle).find(u => u.id === cast.owner)
    if (!owner) return null
    const [color, light] = colors[owner.card.rarity]
    return <g key={key} data-assassin-ready={id} opacity={.8 * unit((until - battle.time) / .25)}>
      {kind === "phase" ? <g transform={at(holder)}>
        {[-1, 1].map(s => <path key={s} transform={`scale(${s} 1)`} d="M39-44 51-25 46 30 32 43M42-15 35-7 43 1" fill="none" stroke={color} strokeWidth="2" strokeDasharray="12 5" />)}
        <path d="M-9 47H9M0 42V52" stroke={light} strokeWidth="2.7" />
      </g> : <path transform={`${at({ x: holder.x + (kind === "watch" ? 43 : -43), y: holder.y - 39 })} scale(.56)`} d={crests[art.motif]}
        fill="#21182d" stroke={color} strokeWidth="3" />}
    </g>
  })}</>
}

export function EdgeAssassinEffects({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>{battle.runtime.effects.map(fx => {
    const beat = fx.assassin, art = beat && assassinChoreography(fx.skill)
    if (!beat || !art || battle.time < fx.start || battle.time >= fx.end) return null
    const p = unit((battle.time - fx.start) / (fx.end - fx.start)), [color, light] = colors[fx.rarity]
    const tracked = fx.target !== undefined && (beat.cue === "arm" || beat.cue === "prepare" && beat.kind === "follow") &&
      !["offhand", "shadowpit"].includes(art.motif) ? unitOf(battle, fx.target) : undefined
    const shot = { fx: tracked ? { ...fx, to: tracked } : fx, beat, motif: art.motif, p, color, light }
    const front = ["flight", "strike", "release", "interrupt", "stop", "shield", "ward", "arm", "phase"].includes(beat.cue)
    if ((layer === "front") !== front) return null
    return <g key={fx.id} data-assassin-skill={fx.skill} data-assassin-cue={beat.cue}
      opacity={beat.cue === "prepare" || beat.cue === "travel" || beat.cue === "flight" ? 1 : (1 - unit((p - .34) / .66)) ** 1.1}>
      {beat.cue === "prepare" ? <Opening shot={shot} /> : beat.cue === "strike" ? <Cut shot={shot} />
        : beat.cue === "flight" ? <Blade shot={shot} from={fx.from} to={unitOf(battle, fx.target) ?? fx.to} progress={p} bend={beat.kind === "return" ? -37 : art.motif === "backmark" ? 43 : 13} size={fx.rarity === "Prismatic" ? 1.7 : 1} />
          : beat.cue === "travel" ? <>
            <path d={path([fx.from, mix(fx.from, fx.to, p)])} stroke={color} strokeWidth="15" strokeOpacity=".16" fill="none" />
            {[.18, .44, .72].filter(t => t < p).map(t => <Ghost key={t} shot={shot} where={mix(fx.from, fx.to, t)} tilt={-8 + 16 * t} opacity={.35 * (1 - p + t * .2)} />)}
            <path transform={pose(fx.to, direction(fx.from, fx.to))} d="M-16-19 5 0-16 19" fill="none" stroke={light} strokeWidth="2" />
          </> : beat.cue === "cancel" ? <path d={path([fx.from, fx.to])} stroke={color} strokeWidth="2.3" strokeDasharray="3 13" fill="none" />
            : beat.cue === "arrival" ? <path transform={pose(fx.to, beat.axis)} d="M-30-13H-7L8 0-7 13H-30M-25 20H3" fill="none" stroke={light} strokeWidth="2.7" />
              : beat.cue === "deploy" ? fx.area && <path d={outlines(fx.area)} fill={color} fillOpacity=".05" stroke={light} strokeWidth="3" strokeDasharray="17 9" />
                : <Status shot={shot} />}
    </g>
  })}{layer === "front" && <Readiness battle={battle} />}</g>
}

export function EdgeAssassinField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  const art = assassinChoreography(field.cast.skill?.id), owner = battleFighters(battle).find(u => u.id === field.cast.owner)
  const circle = circlesOf(field.area)[0]
  if (!art || !owner || !circle) return null
  const [color, light] = colors[owner.card.rarity], p = unit((battle.time - field.time) / .25)
  return <g data-assassin-field={field.cast.skill?.id} opacity={Math.min(p, unit((field.until - battle.time) / .35))}>
    <path d={areaPath(field.area)} fill={color} fillOpacity=".04" stroke={color} strokeWidth="2.2" strokeDasharray={art.motif === "shadowpit" ? "21 7 3 7" : "3 11"} />
    {(art.motif === "shadowpin" ? [0, 120, 240] : [0, 60, 120, 180, 240, 300]).map((angle, i) => {
      const radial = polar(circle.radius * .78, angle)
      return <path key={i} transform={`${at({ x: circle.center.x + radial.x, y: circle.center.y + radial.y })} rotate(${angle + 90})`}
        d={art.motif === "shadowpin" ? "M-6 15 0-24 6 15 0 8Z" : "M-13-12H13L9 9 0 17-9 9Z"}
        fill={color} fillOpacity=".19" stroke={art.motif === "shadowpit" ? spectrum[i % spectrum.length] : light} strokeWidth="2" />
    })}
  </g>
}
