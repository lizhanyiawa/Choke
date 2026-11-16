import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, ease, heading, mix, path, unit } from "./EdgeBulwarkFields"
import { along, areaPath, direction, edgeDistance, left, point, rotate, type EdgeArea } from "./edgeSkills/geometry"
import { warlockChoreography, type WarlockMotif } from "./edgeSkills/warlockChoreo"
import type { SkillVisual, WarlockBeat } from "./edgeSkills/presentation"
import { battleUnits, unitOf, type FieldEffect } from "./edgeSkills/state"
import faultRupture from "./edgeSkills/assets/fault-rupture.png"
import meteorBody from "./edgeSkills/assets/meteor-body.png"
import stellarFirestorm from "./edgeSkills/assets/stellar-firestorm.png"

type Layer = "floor" | "front"
type Shot = { fx: SkillVisual; beat: WarlockBeat; motif: WarlockMotif; p: number; color: string; light: string; accent: string }
const palette: Record<Rarity, readonly [string, string, string]> = {
  C: ["#f2c9b2", "#fff6ea", "#baadcf"], UC: ["#91d5ef", "#effcff", "#d2b0fa"],
  R: ["#adbcff", "#f2f0ff", "#efbedb"], E: ["#c394f7", "#ffebf4", "#ffb588"],
  L: ["#f4ce83", "#fff5d1", "#e6a2bd"], Radiant: ["#ffb2d2", "#fff4f2", "#b9baff"],
  Prismatic: ["#d1b6ff", "#fbfaff", "#91d7f3"],
}
const prism = ["#f8bfcb", "#b8aeff", "#a2dcf7", "#ffe3ac"]
const pose = (p: EdgePoint, axis: EdgePoint, turn = 0) => at(p) + " rotate(" + (heading(axis) + turn) + ")"
const rings = (area?: EdgeArea) => area?.parts.flatMap(part => part.kind === "circle" ? [part] : []) ?? []
const radius = (s: Shot) => rings(s.fx.area)[0]?.radius ?? 74
const outline = (s: Shot) => s.fx.area && <path d={areaPath(s.fx.area)} fill={s.color} fillOpacity=".025"
  stroke={s.color} strokeWidth="2" strokeDasharray="7 10" />
const lineEnds = (s: Shot) => {
  const box = s.fx.area?.parts.find(part => part.kind === "polygon")
  if (!box || box.kind !== "polygon") return [s.fx.from, s.fx.to] as const
  return [mix(box.points[0], box.points[3], .5), mix(box.points[1], box.points[2], .5)] as const
}
function Flame({ shot: s, where, size = 1, turn = 0 }: { shot: Shot; where: EdgePoint; size?: number; turn?: number }) {
  return <g transform={at(where) + " rotate(" + turn + ") scale(" + size + ")"}>
    <path d="M0-37C17-25 11-13 26-7C40 9 14 31 0 32C-29 29-37 7-18-11C-20 7-3 4-5-8C1-18 8-16 0-37Z"
      fill="#211622" fillOpacity=".75" stroke={s.color} strokeWidth="3" />
    <path d="M0-17C3-3 16 0 13 13C10 26-10 27-14 14C-18 6-2-1 0-17Z"
      fill={s.color} fillOpacity=".6" stroke={s.light} strokeWidth="2" />
  </g>
}
function Crystal({ shot: s, where, size = 1, turn = 0 }: { shot: Shot; where: EdgePoint; size?: number; turn?: number }) {
  return <g transform={at(where) + " rotate(" + turn + ") scale(" + size + ")"}>
    <path d="M0-49 17-22 13 19 0 37-15 13-18-24Z" fill="#241a37" fillOpacity=".74" stroke={s.light} strokeWidth="2.3" />
    <path d="M0-49 3-13 13 19 0 37-3-10-18-24ZM3-13 17-22" fill={s.color} fillOpacity=".38" stroke={s.accent} strokeWidth="1.8" />
  </g>
}
function Bolt({ shot: s, from, to, seed = 0, width = 4, progress = 1 }: { shot: Shot; from: EdgePoint; to: EdgePoint; seed?: number; width?: number; progress?: number }) {
  const axis = direction(from, to), span = edgeDistance(from, to), count = Math.max(4, Math.ceil(span / 36))
  const points = Array.from({ length: count + 1 }, (_, i) => along(mix(from, to, i / count), left(axis),
    i && i < count ? Math.sin(i * 5.7 + seed) * 12 + (i % 2 ? 6 : -6) : 0))
  return <g>
    <path d={path(points)} fill="none" stroke={s.color} strokeOpacity=".22" strokeWidth={width * 3} pathLength="1" strokeDasharray={progress + " 1"} />
    <path d={path(points)} fill="none" stroke={s.light} strokeWidth={width} pathLength="1" strokeDasharray={progress + " 1"} />
    {points.filter((_, i) => i % 3 === 2).map((p, i) => <path key={i} d={path([p, along(p, rotate(axis, i % 2 ? 65 : -68), 27)])}
      fill="none" stroke={s.accent} strokeWidth={width * .5} opacity={progress} />)}
  </g>
}
function Debris({ shot: s, where, reach, count = 9, ice = false }: { shot: Shot; where: EdgePoint; reach: number; count?: number; ice?: boolean }) {
  const q = ease(s.p)
  return <>{Array.from({ length: count }, (_, i) => {
    const theta = i * 360 / count + (s.fx.beat ?? 1) * 19, axis = rotate({ x: 1, y: 0 }, theta)
    const atPoint = along(where, axis, (14 + reach * q) * (.5 + .5 * ((i * 7 % 11) / 10)))
    return <path key={i} transform={at(atPoint) + " rotate(" + (theta + q * 47) + ")"}
      d={ice ? "M-3-19 5-7 3 11-5 6Z" : "M-9-4 5-7 10 3-3 8Z"} fill={s.fx.rarity === "Prismatic" ? prism[i % 4] : s.color}
      fillOpacity=".35" stroke={i % 3 ? s.color : s.light} strokeWidth="1.8" opacity={1 - s.p * .65} />
  })}</>
}
function Ring({ shot: s, where, r, inner = 0, progress = s.p }: { shot: Shot; where: EdgePoint; r: number; inner?: number; progress?: number }) {
  const q = ease(unit(progress))
  return <g transform={at(where)}>
    <ellipse rx={r * (.72 + .28 * q)} ry={r * (.72 + .28 * q)} fill="none" stroke={s.color} strokeWidth={4.5 * (1 - q) + 1.2} strokeOpacity=".6" />
    <path d={arc(r * .91, -31, 112)} transform={"rotate(" + q * 68 + ")"} fill="none" stroke={s.light} strokeWidth="2.4" />
    {inner > 0 && <circle r={inner} fill="none" stroke={s.accent} strokeWidth="2" strokeDasharray="12 7" />}
  </g>
}
function Plates({ shot: s, where, count = 6, spread = 66, lift = 0 }: { shot: Shot; where: EdgePoint; count?: number; spread?: number; lift?: number }) {
  return <g transform={at(where)}>{Array.from({ length: count }, (_, i) => {
    const angle = i * 360 / count, p = along({ x: 0, y: -lift }, rotate({ x: 0, y: -1 }, angle), spread)
    return <path key={i} transform={at(p) + " rotate(" + angle + ")"} d="M-19 11-25-13-7-23 20-17 26 7 7 24Z"
      fill={i % 2 ? "#271c38" : s.color} fillOpacity={i % 2 ? .8 : .19} stroke={s.fx.rarity === "Prismatic" ? prism[i % 4] : s.light} strokeWidth="2.3" />
  })}</g>
}
function Furnace({ shot: s, where, open = false }: { shot: Shot; where: EdgePoint; open?: boolean }) {
  return <g transform={at(where)}>
    <path d="M-48 17-36-24 0-42 39-26 51 13 17 36-19 34Z" fill="#26172f" fillOpacity=".85" stroke={s.color} strokeWidth="3" />
    <path d="M-36-24 1-7 39-26M1-7 17 36M-48 17 1-7 51 13" fill="none" stroke={s.light} strokeWidth="2" />
    <path d="M-24-10 2-27 27-12 3 3Z" fill={s.accent} fillOpacity={open ? .42 : .14} stroke={s.light} strokeWidth="1.8" />
    {open && <Flame shot={s} where={{ x: 2, y: -33 }} size={1.1} />}
  </g>
}

function Opening({ shot: s }: { shot: Shot }) {
  const { fx, beat, motif, color, light, accent, p } = s, q = ease(p), r = radius(s)
  const [a, b] = lineEnds(s), span = edgeDistance(a, b)
  switch (motif) {
    case "spark": return <g><Flame shot={s} where={along(fx.from, beat.axis, 26)} size={.43 + .2 * q} />
      <path transform={at(fx.from)} d={arc(38 - 12 * q, -144, 72)} fill="none" stroke={accent} strokeWidth="2" /></g>
    case "ember": return <g transform={at(along(fx.from, beat.axis, 25))}>
      <path d="M-21-8-7-21 19-12 24 8 6 23-22 11ZM-9-15 1 4 17 13M-16 3 7-4" fill="#211526" stroke={color} strokeWidth="3" />
      {[-1, 1].map(n => <path key={n} transform={"rotate(" + (n * 35 + q * 36) + ")"} d="M-31 6Q-39-18-15-30" fill="none" stroke={light} strokeWidth="2" />)}
    </g>
    case "frost": return <Crystal shot={s} where={along(fx.from, beat.axis, 27)} size={.52 + q * .16} turn={heading(beat.axis) + 90} />
    case "arc": return <>{[0, 1, 2].map(i => <g key={i} transform={at(along(fx.from, rotate(beat.axis, (i - 1) * 30), 24 + q * 12))}>
      <path d="M0-9 8-4 8 4 0 9-8 4-8-4Z" fill={color} fillOpacity=".3" stroke={light} strokeWidth="2" /></g>)}</>
    case "twinspark": return <>{[-1, 1].map((n, i) => <Flame key={n} shot={s}
      where={along(fx.from, rotate(beat.axis, n * (49 - q * 15)), 36 + i * 8)} size={.53 + i * .15} turn={n * 21} />)}</>
    case "closeflame": return <g transform={at(fx.to)}>{Array.from({ length: 6 }, (_, i) => <path key={i}
      transform={"rotate(" + i * 60 + ")"} d={"M-10-12Q-24 " + (-27 - q * 20) + " 0 " + (-42 - q * 15) + "Q19-23 10-12"}
      fill={color} fillOpacity=".13" stroke={light} strokeWidth="2" />)}</g>
    case "cinderfall": return <g>
      {[0, 1, 2].map(i => <path key={i} transform={at({ x: fx.to.x + (i - 1) * 23, y: fx.to.y - 85 * (1 - q) - 17 })}
        d="M-8-15 11-9 5 9-7 17-13-1Z" fill={color} fillOpacity=".35" stroke={light} strokeWidth="2" />)}
      <path d={path([{ x: fx.to.x, y: fx.to.y - 90 }, fx.to])} fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="4 8" />
    </g>
    case "firestep": return <g transform={pose(fx.from, beat.axis)}>
      <path d="M-20-13H4L18 1 0 14H-20ZM-12-7 1 1-12 9" fill={color} fillOpacity=".25" stroke={light} strokeWidth="2.4" />
      <path d="M19-18 33 0 19 18" fill="none" stroke={accent} strokeWidth="2" />
    </g>
    case "heatline": return <g transform={pose(a, direction(a, b))}>
      {[-1, 1].map(n => <path key={n} d={"M0 " + n * (20 - q * 13) + "L" + span + " " + n * 4}
        fill="none" stroke={n > 0 ? light : color} strokeWidth="2.3" strokeDasharray="15 9" />)}
    </g>
    case "thunder": return <Bolt shot={s} from={a} to={b} progress={q * .95} width={1.8} seed={2} />
    case "icecrown": return <>{Array.from({ length: 5 }, (_, i) => {
      const where = along(fx.to, rotate({ x: 1, y: 0 }, i * 72 - 40), r * .8)
      return <Crystal key={i} shot={s} where={{ x: where.x, y: where.y + 24 * (1 - q) }} size={.38 + q * .21} turn={i * 72 - 40} />
    })}</>
    case "flameward": case "firecoat": return <Plates shot={s} where={fx.from} spread={63 - q * 17} count={motif === "flameward" ? 4 : 3} />
    case "frostburst": return <g transform={at(fx.to)}>
      <path d={"M" + -r + " 0Q0 " + (-r * (1.1 + q * .6)) + " " + r + " 0"} fill={color} fillOpacity=".08" stroke={light} strokeWidth="2.5" />
      {[-1, 0, 1].map(n => <path key={n} d={"M" + n * r * .65 + " 0L" + n * r * .24 + " " + -r * .65 + " 0 " + -r * .91}
        fill="none" stroke={color} strokeWidth="2" />)}
    </g>
    case "stormmine": return <g transform={at(fx.to)}>{[0, 1, 2].map(i => <path key={i} transform={"rotate(" + i * 120 + ")"}
      d={"M-9 " + (-r * .72) + "L0 " + (-r * (.9 - q * .08)) + " 9 " + -r * .72 + " 0 " + -r * .58 + "Z"}
      fill="#20172f" stroke={light} strokeWidth="2.4" />)}</g>
    case "hotscythe": return <g transform={pose(a, direction(a, b))}>
      <path d={"M0 18Q" + span * .65 + " -49 " + span + " -13L" + span * .78 + " 8Q" + span * .41 + " -14 0 18"}
        fill={color} fillOpacity=".15" stroke={light} strokeWidth="2.6" />
    </g>
    case "meteor": return <g transform={at({ x: fx.to.x + 25 * (1 - q), y: fx.to.y - 126 * (1 - q) - 26 })}>
      <image href={meteorBody} x="-87" y="-111" width="190" height="190" />
    </g>
    case "firering": return <g transform={at(fx.to)}>
      <path d={arc(r, -148 + q * 48, 142)} fill="none" stroke={light} strokeWidth="5" />
      <path d={arc(r - 42, -12, 281 - q * 43)} fill="none" stroke={accent} strokeWidth="2" />
      {Array.from({ length: 7 }, (_, i) => <Flame key={i} shot={s} where={along({ x: 0, y: 0 }, rotate({ x: 1, y: 0 }, i * 51), r - 8)}
        size={.25 + q * .15} turn={i * 51 + 90} />)}
    </g>
    case "crossbolt": return <g>{fx.area?.parts.map((part, i) => part.kind === "polygon" ? <Bolt key={i} shot={s}
      from={mix(part.points[0], part.points[3], .5)} to={mix(part.points[1], part.points[2], .5)}
      progress={q} seed={i + 5} width={1.9} /> : null)}</g>
    case "movingash": return <Furnace shot={s} where={fx.to} />
    case "lattice": return <g>
      {fx.area?.parts.flatMap((part, i) => part.kind !== "polygon" ? [] : [-1, 1].map(n => {
        const end = n === -1 ? mix(part.points[0], part.points[3], .5) : mix(part.points[1], part.points[2], .5)
        return <Bolt key={i + "/" + n} shot={s} from={end} to={mix(end, fx.to, .3 + .7 * q)} seed={i * 7 + n} width={2.5} />
      }))}
      <Crystal shot={s} where={{ x: fx.to.x, y: fx.to.y - 79 + q * 22 }} size={.85} turn={45} />
    </g>
    case "comet": return <g><Flame shot={s} where={fx.from} size={.85} turn={heading(beat.axis) + 90} />
      <path transform={at(fx.from)} d={arc(54 - q * 15, -128, 99)} fill="none" stroke={light} strokeWidth="3" /></g>
    case "boundaryfire": return <g transform={at(fx.to)}>{[-1, 0, 1].map(n => <path key={n}
      transform={"translate(" + n * r * .62 + " " + (Math.abs(n) * 19 - q * 18) + ") rotate(" + n * 17 + ")"}
      d="M-19 32-27-18-7-59 18-33 25 13 6 38Z" fill={color} fillOpacity=".15" stroke={light} strokeWidth="2.3" />)}</g>
    case "reflectionbolt": return <g transform={at({ x: fx.to.x, y: fx.to.y - 76 })}>
      <path d="M0-32 36-10 28 20 0 35-29 18-37-9Z" fill="#24192b" fillOpacity=".7" stroke={light} strokeWidth="3" />
      <path d="M-24-7 0 23 23-7M0-19V23" fill="none" stroke={color} strokeWidth="2.4" />
      <path d="M-16 45 0 61 16 45" fill="none" stroke={accent} strokeWidth="2" />
    </g>
    case "goldtrap": return <Plates shot={s} where={fx.to} count={6} spread={r * (.65 + .15 * q)} />
    case "firestorm": return <g transform={at(fx.to)}>{[0, 1, 2].map(i => <g key={i} transform={"translate(0 " + (-108 + i * 29 + q * 25) + ") rotate(" + (i * 22 + q * 35) + ")"}>
      <ellipse rx={r * (.85 - i * .14)} ry={r * (.24 - i * .035)} fill="none" stroke={i ? color : light} strokeWidth={i === 3 - (fx.beat ?? 1) ? 3.5 : 1.9} opacity={i < 4 - (fx.beat ?? 1) ? .85 : .18} />
      <path d="M-15 0H15M0-15V15" stroke={accent} strokeWidth="1.7" /></g>)}</g>
    case "sandwheel": return <g transform={at(fx.to) + " rotate(" + q * 38 + ")"}>{Array.from({ length: 12 }, (_, i) => <path key={i}
      transform={"rotate(" + i * 30 + ")"} d={"M-11 " + -r + "L12 " + (-r + 4) + " 30 " + (-r + 47) + " 3 " + (-r + 31) + "Z"}
      fill={color} fillOpacity=".16" stroke={light} strokeWidth="2" />)}</g>
    case "starcloud": return <g transform={at(fx.to)}>{Array.from({ length: 7 }, (_, i) => <ellipse key={i}
      transform={"rotate(" + (i * 51 + q * 28) + ")"} cx={r * .35} rx={r * .58} ry={r * .22}
      fill={color} fillOpacity=".035" stroke={i % 2 ? accent : light} strokeWidth="1.8" />)}</g>
    case "roadbreak": return <g transform={pose(a, direction(a, b))}>{Array.from({ length: 8 }, (_, i) => <g key={i} transform={"translate(" + span * (i + .5) / 8 + " 0)"}>
      <path d="M-9-34V-13L2 0-9 13V34M10-34V-15L-1 0 10 15V34" fill="none" stroke={i % 2 ? color : light} strokeWidth="2.3" opacity={.3 + .7 * unit(q * 2 - i / 8)} />
    </g>)}</g>
    case "flamecurtain": case "riftcurtain": return <g transform={at(fx.to)}>{Array.from({ length: motif === "riftcurtain" ? 7 : 5 }, (_, i) => {
      const count = motif === "riftcurtain" ? 7 : 5, x = (i / (count - 1) - .5) * r * 1.7, y = Math.abs(i - (count - 1) / 2) * 13
      return <path key={i} transform={"translate(" + x + " " + (y - q * 28) + ")"} d="M-17 44-23-21-5-75 16-47 23 29 4 54Z"
        fill="#291b36" fillOpacity=".48" stroke={motif === "riftcurtain" ? prism[i % 4] : light} strokeWidth="2.6" />
    })}</g>
    case "fault": return <g>
      {(beat.kind === "fissures" ? rings(fx.area).map(c => c.center) : [fx.to]).map((t, k) => <g key={k} transform={at(t)}>
        {Array.from({ length: beat.kind === "fissures" ? 4 : 6 }, (_, i) => <path key={i} transform={"rotate(" + (i * (beat.kind === "fissures" ? 90 : 60) + 17) + ")"}
          d={beat.kind === "fissures" ? "M-5-13-18-36-7-57 9-39 8-17Z" : "M-11-29-41-57-24-99 27-118 47-65 12-32Z"}
          fill="#241930" fillOpacity=".74" stroke={prism[i % 4]} strokeWidth={2.5 + q} />)}
      </g>)}
    </g>
    case "starfallring": return <g transform={at(fx.to)}>
      {[-1, 1].map(n => <ellipse key={n} transform={"translate(0 " + (-110 * (1 - q) - 27) + ") rotate(" + n * 29 + ")"}
        rx={r * (n > 0 ? .9 : .55)} ry={r * (n > 0 ? .33 : .23)} fill="none" stroke={n > 0 ? light : accent} strokeWidth="4" />)}
      <path d="M0-134V-23M-8-40 0-22 8-40" fill="none" stroke={color} strokeWidth="2" />
    </g>
    case "horizonline": return <g>
      {[a, b].map((where, i) => <g key={i} transform={pose(where, direction(a, b))}>
        <path d="M0-58H-26V-18M0 58H-26V18M-8-47H-17M-8 47H-17" fill="none" stroke={prism[i]} strokeWidth="4" />
      </g>)}
      <Bolt shot={s} from={a} to={b} progress={q} width={1.3 + q * 1.8} seed={8} />
    </g>
    case "dualfrequency": return <g>
      {beat.paths?.map((v, i) => <path key={i} d={path([v.at, fx.to])} fill="none" stroke={prism[i % 4]} strokeWidth="1.8" strokeDasharray="6 9" />)}
      <g transform={at({ x: fx.to.x, y: fx.to.y - 75 * (1 - q) })}>
        {[0, 1, 2].map(i => <path key={i} transform={"rotate(" + (i * 120 + q * 24) + ")"} d="M0-105 36-33 13-8-10-25-29-45Z"
          fill="#251b34" fillOpacity=".75" stroke={prism[i]} strokeWidth="3" />)}
      </g>
    </g>
  }
}



function Delivery({ shot: s }: { shot: Shot }) {
  const { fx, beat, motif, color, light, accent, p } = s
  const from = fx.from, to = fx.to, span = edgeDistance(from, to), axis = direction(from, to)
  if (beat.kind === "field") {
    const center = mix(from, to, ease(p)), r = radius(s)
    return <g>
      <path d={path([from, to])} fill="none" stroke={accent} strokeWidth="3" strokeDasharray="6 9" />
      <circle cx={center.x} cy={center.y} r={r} fill={color} fillOpacity=".045" stroke={light} strokeWidth="2" />
      {motif === "movingash" ? <Furnace shot={s} where={center} open /> : <g transform={at(center)}>
        {[0, 1, 2, 3, 4].map(i => <ellipse key={i} transform={"rotate(" + (i * 72 + p * 97) + ")"} cx={r * .23} rx={r * .66} ry={r * .22}
          fill={color} fillOpacity=".065" stroke={i % 2 ? light : accent} strokeWidth="2" />)}
      </g>}
    </g>
  }
  if (fx.warlock?.cue === "travel") return <g transform={pose(from, axis)}>
    <path d={"M0-14Q" + span * .6 + " -22 " + span + " 0Q" + span * .4 + " 17 0 14"} fill={color} fillOpacity=".12" stroke={light} strokeWidth="2.2" />
    <Flame shot={s} where={{ x: span * ease(p), y: 0 }} size={.7} turn={90} />
  </g>
  if (motif === "arc") return <g>
    <Bolt shot={s} from={from} to={to} progress={p} seed={beat.kind === "chain" ? 6 : 1} width={2.8} />
    <circle cx={mix(from, to, p).x} cy={mix(from, to, p).y} r="7" fill={light} stroke={color} strokeWidth="3" />
  </g>
  const bend = motif === "spark" ? -26 : motif === "twinspark" ? (fx.beat === 1 ? -43 : 37) : motif === "ember" ? 19 : 0
  const moving = { x: span * p, y: 2 * bend * p * (1 - p) }
  return <g transform={pose(from, axis)}>
    {motif === "comet" ? <>{[-1, 0, 1].map(n => <path key={n} d={"M" + Math.max(0, span * p - 145) + " " + n * 24 + "Q" + (span * p - 52) + " " + n * 7 + " " + span * p + " 0"}
      fill="none" stroke={n ? color : light} strokeWidth={n ? 4 : 7} strokeOpacity={n ? .6 : .9} />)}</>
      : <path d={"M0 0Q" + span * .5 + " " + bend + " " + span + " 0"} fill="none" stroke={accent} strokeWidth="2" strokeDasharray="9 9" />}
    {motif === "frost" ? <Crystal shot={s} where={moving} size={.65} turn={90 + p * 38} />
      : motif === "ember" ? <g transform={at(moving) + " rotate(" + p * 120 + ")"}>
        <path d="M-25-8-9-20 17-11 22 9 3 25-23 12ZM-12-8 6 14M-19 5 14-3" fill="#201322" stroke={light} strokeWidth="2.6" />
        <path d="M-37-9-49 0-32 8" fill="none" stroke={color} strokeWidth="3" /></g>
      : <Flame shot={s} where={moving} turn={90} size={motif === "comet" ? 1.1 : motif === "twinspark" && fx.beat === 2 ? .73 : .57} />}
  </g>
}

function Strike({ shot: s }: { shot: Shot }) {
  const { fx, beat, motif, color, light, accent, p } = s, q = ease(unit(p * 1.65)), r = radius(s)
  const [a, b] = lineEnds(s), span = edgeDistance(a, b), contacts = beat.paths?.map(row => row.at) ?? [fx.to]
  switch (motif) {
    case "spark": return <g transform={at(fx.to)}>{[0, 1, 2].map(i => <path key={i} transform={"rotate(" + (i * 120 + q * 24) + ")"}
      d={"M0-7Q" + (-23 - q * 17) + " -27 0 " + (-34 - q * 25) + "Q26-25 0-7Z"}
      fill={color} fillOpacity=".23" stroke={light} strokeWidth="2.5" />)}</g>
    case "closeflame": case "firestep": return <g><Ring shot={s} where={fx.to} r={r} />
      {Array.from({ length: motif === "firestep" ? 4 : 6 }, (_, i) => <Flame key={i} shot={s}
        where={along(fx.to, rotate({ x: 1, y: 0 }, i * (motif === "firestep" ? 90 : 60)), r * q * .68)} size={.45} turn={i * 60 + 90} />)}</g>
    case "frost": return <><Debris shot={s} where={fx.to} reach={72} ice count={7} />
      <path transform={at(fx.to)} d="M-34 13-15-21 7-13 23-32 37 16 5 32Z" fill={color} fillOpacity=".08" stroke={light} strokeWidth="2" /></>
    case "cinderfall": return <><Ring shot={s} where={fx.to} r={r} /><Debris shot={s} where={fx.to} reach={r + 21} count={11} />
      <path transform={at(fx.to)} d="M-43 4-17-18 9-11 39-22 46 13 9 26-29 18Z" fill="#261b2c" fillOpacity=".45" stroke={color} strokeWidth="2.4" /></>
    case "ember": return <g>{beat.kind === "dot" ? <><Flame shot={s} where={fx.to} size={.58 + q * .23} />
      <path transform={at(fx.to)} d={arc(41 + q * 17, -131, 112)} fill="none" stroke={light} strokeWidth="2.5" /></>
      : <><Flame shot={s} where={fx.to} size={.95} /><Debris shot={s} where={fx.to} reach={65} count={6} /></>}</g>
    case "heatline": return <g transform={pose(a, direction(a, b))}>
      <path d={"M0-8H" + span + "L" + (span - 29) + " 13H0Z"} fill={color} fillOpacity=".22" stroke={light} strokeWidth="3" />
      <path d={"M19 0H" + (span - 13)} stroke={light} strokeWidth={5 * (1 - q) + 1} />
    </g>
    case "icecrown": return <>{Array.from({ length: 7 }, (_, i) => <Crystal key={i} shot={s}
      where={along(fx.to, rotate({ x: 1, y: 0 }, i * 51), r * (.64 + .2 * q))} size={.61} turn={i * 51 + 90} />)}
      <Ring shot={s} where={fx.to} r={r} /></>
    case "arc": return <><Bolt shot={s} from={fx.from} to={fx.to} seed={fx.beat ?? 1} width={4.5 * (1 - q) + 1.5} />
      <g transform={at(fx.to)}>{[0, 1, 2, 3].map(i => <path key={i} transform={"rotate(" + i * 90 + ")"} d="M4-15 17-33 8-35 29-57"
        fill="none" stroke={light} strokeWidth="2.4" />)}</g></>
    case "flameward": return <><Ring shot={s} where={fx.to} r={75} /><Debris shot={s} where={fx.to} reach={93} count={8} />
      <Plates shot={s} where={fx.to} spread={48 + q * 39} count={4} /></>
    case "thunder": return <><Bolt shot={s} from={a} to={b} seed={4} width={6.5 * (1 - q) + 2} />
      {contacts.map((where, i) => <g key={i} transform={pose(where, beat.axis)}>
        <path d="M-23-21 0-9 23-21 8 1 26 21 0 12-24 23-9 1Z" fill={color} fillOpacity=".25" stroke={light} strokeWidth="2" /></g>)}</>
    case "frostburst": return <><Ring shot={s} where={fx.to} r={r} /><Debris shot={s} where={fx.to} reach={r + 42} count={15} ice />
      <g transform={at(fx.to)}>{[-1, 1].map(n => <path key={n} transform={"scale(" + n + " 1)"}
        d={"M7-17 37-42 " + (39 + q * 59) + " -3 41 31 9 14Z"} fill={color} fillOpacity=".12" stroke={light} strokeWidth="2.3" />)}</g></>
    case "twinspark": return <g transform={at(fx.to)}>{[0, 1, 2, 3].map(i => <path key={i} transform={"rotate(" + (i * 90 + (fx.beat === 1 ? 18 : 63)) + ")"}
      d={"M-4-9-15-" + (37 + q * 25) + " 6-36 14-13Z"} fill={color} fillOpacity=".27" stroke={light} strokeWidth="2.4" />)}</g>
    case "stormmine": return <>{contacts.map((where, i) => <g key={i}><Bolt shot={s} from={{ x: where.x, y: where.y - 110 }} to={where} seed={i + 9} />
      <g transform={at(where)}><path d="M-39 23-17-28 0 1 19-33 42 23M-39 23H42" fill={color} fillOpacity=".12" stroke={light} strokeWidth="2.4" /></g></g>)}</>
    case "hotscythe": return <g transform={pose(a, direction(a, b))}>
      <path d={"M0 26Q" + span * .42 + " -66 " + span + " -21Q" + span * .65 + " 12 " + span * .75 + " 37Q" + span * .36 + " -17 0 26Z"}
        fill={color} fillOpacity={fx.beat === 2 ? .25 : .15} stroke={fx.beat === 2 ? light : color} strokeWidth={fx.beat === 2 ? 4 : 3} />
    </g>
    case "meteor": return <><Ring shot={s} where={fx.to} r={r} /><Debris shot={s} where={fx.to} reach={r + 59} count={17} />
      <g transform={at(fx.to)}><path d="M-81-13-47-46 3-55 64-33 83 18 33 51-27 43-73 22Z"
        fill="#201727" fillOpacity=".72" stroke={accent} strokeWidth="4" /><path d="M-47-46-18-9-73 22M-18-9 33 51M-18-9 64-33M-18-9 83 18"
        fill="none" stroke={light} strokeWidth={4 * (1 - q) + 1.5} /></g></>
    case "firering": case "sandwheel": return <g transform={at(fx.to)}>
      <Ring shot={s} where={{ x: 0, y: 0 }} r={r} inner={r - (motif === "firering" ? 42 : 58)} />
      {Array.from({ length: motif === "firering" ? 9 : 14 }, (_, i) => <path key={i}
        transform={"rotate(" + (i * (motif === "firering" ? 40 : 360 / 14) + q * 32) + ")"}
        d={"M-8 " + -r * .65 + "L-23 " + -r + " 12 " + (-r - q * 27) + " 24 " + -r * .72 + "Z"}
        fill={color} fillOpacity=".23" stroke={light} strokeWidth="2.4" />)}
    </g>
    case "crossbolt": case "lattice": return <>{fx.area?.parts.map((part, i) => part.kind !== "polygon" ? null : <Bolt key={i} shot={s}
      from={mix(part.points[0], part.points[3], .5)} to={mix(part.points[1], part.points[2], .5)} seed={i * 8 + 3} width={3.2 + 3 * (1 - q)} />)}
      {(fx.beat === 2 || motif === "lattice") && <Plates shot={s} where={fx.to} spread={21 + 18 * q} count={4} />}</>
    case "movingash": return <><Furnace shot={s} where={fx.to} open /><Ring shot={s} where={fx.to} r={r} /><Debris shot={s} where={fx.to} reach={r} count={8} /></>
    case "firecoat": return <>{Array.from({ length: 3 }, (_, i) => <path key={i} transform={at(fx.to) + " rotate(" + i * 120 + ")"}
      d={"M-15-23Q-76 " + (-55 - q * 26) + " 0 " + (-90 - q * 28) + "Q69-47 15-23Z"}
      fill={color} fillOpacity=".16" stroke={light} strokeWidth="3" />)}</>
    case "comet": return fx.beat === 1 ? <>{contacts.map((where, i) => <path key={i} transform={pose(where, beat.axis)}
      d="M-39-12 9-4 31 0 7 7-37 15-17 0Z" fill={color} fillOpacity=".35" stroke={light} strokeWidth="2.6" />)}</>
      : <><Ring shot={s} where={fx.to} r={r} /><Debris shot={s} where={fx.to} reach={r + 24} count={13} /><Flame shot={s} where={fx.to} size={1.2} /></>
    case "boundaryfire": return <><Ring shot={s} where={fx.to} r={r} />
      {beat.paths?.map((row, i) => <g key={i} transform={pose(row.at, row.end ? direction(row.at, row.end) : beat.axis)}>
        <path d={"M-16-32 22-19 " + (51 + 51 * q) + " 0 22 19-16 32 1 3Z"} fill={color} fillOpacity=".21" stroke={light} strokeWidth="3" />
      </g>)}</>
    case "reflectionbolt": return <><Bolt shot={s} from={{ x: fx.to.x + (fx.beat === 1 ? -39 : 28), y: fx.to.y - 138 }} to={fx.to} seed={fx.beat ?? 0} width={5} />
      <Ring shot={s} where={fx.to} r={r} /><Crystal shot={s} where={fx.to} size={.95} turn={fx.beat === 1 ? -25 : 26} /></>
    case "goldtrap": return <>{contacts.map((where, i) => <g key={i} transform={at(where)}>
      {[-1, 1].map(n => <path key={n} transform={"scale(" + n + " 1)"} d="M-7 29-32 7-36-32-12-51 0-23-16-8-7 29Z"
        fill={color} fillOpacity=".2" stroke={light} strokeWidth="2.6" />)}</g>)}</>
    case "firestorm": return <><Ring shot={s} where={fx.to} r={r} />
      <g transform={at(fx.to) + " rotate(" + ((fx.beat ?? 1) * 39 + q * 16) + ") scale(" + (.80 + .20 * q) + ")"}>
        <image href={stellarFirestorm} x={-r * 1.11} y={-r * 1.11} width={r * 2.22} height={r * 2.22} opacity={.82} />
      </g>
      <Debris shot={s} where={fx.to} reach={r + 18} count={11 + (fx.beat ?? 1) * 2} /></>
    case "starcloud": return <g transform={at(fx.to)}>{Array.from({ length: 7 }, (_, i) => <path key={i} transform={"rotate(" + (i * 51 + q * 39) + ")"}
      d={"M0-17Q" + -r * .72 + " " + -r * .53 + " 0 " + -r + "Q" + r * .45 + " " + -r * .45 + " 0-17Z"}
      fill={i % 2 ? color : accent} fillOpacity=".10" stroke={i % 2 ? light : color} strokeWidth="2.3" />)}</g>
    case "roadbreak": return <g transform={pose(a, direction(a, b))}>
      <path d={"M0-22H" + span + "L" + (span - 25) + " 24H21Z"} fill={color} fillOpacity=".12" stroke={light} strokeWidth="3" />
      {Array.from({ length: 8 }, (_, i) => <path key={i} transform={"translate(" + span * (i + .5) / 8 + " 0)"} d="M-10-42 9-11-9 7 13 43"
        stroke={accent} strokeWidth="3" fill="none" />)}
    </g>
    case "flamecurtain": case "riftcurtain": return <><Ring shot={s} where={fx.to} r={r} />
      {Array.from({ length: motif === "riftcurtain" ? 7 : 5 }, (_, i) => <path key={i}
        transform={at(fx.to) + " rotate(" + i * (motif === "riftcurtain" ? 360 / 7 : 72) + ")"}
        d={"M-17-29-38 " + -r * .7 + " 1 " + (-r - 18 * q) + " 27 " + -r * .57 + " 17-23Z"}
        fill={motif === "riftcurtain" ? prism[i % 4] : color} fillOpacity=".15" stroke={light} strokeWidth="2.5" />)}</>
    case "fault": return <>
      {beat.kind !== "fissures" && <g transform={at(fx.to) + " scale(" + (.84 + .20 * q) + ")"}>
        <image href={faultRupture} x={-r * 1.28} y={-r * 1.28} width={r * 2.56} height={r * 2.56} opacity={.96} />
      </g>}
      {(beat.kind === "fissures" ? rings(fx.area) : [{ center: fx.to, radius: r }]).map((c, i) => <g key={i}>
      <Ring shot={s} where={c.center} r={c.radius} />
      {beat.kind === "fissures" && <Plates shot={s} where={c.center} spread={c.radius * (.45 + q * .25)} count={4} />}
      <Debris shot={s} where={c.center} reach={c.radius} count={beat.kind === "fissures" ? 5 : 13} ice />
    </g>)}</>
    case "starfallring": return <><Ring shot={s} where={fx.to} r={r} inner={fx.beat === 1 ? 75 : 0} />
      <g transform={at(fx.to) + " rotate(" + (fx.beat === 1 ? -23 : 24) + ")"}>
        <ellipse rx={r * (.73 + q * .27)} ry={r * (.42 + q * .35)} fill="none" stroke={light} strokeWidth={fx.beat === 1 ? 6 : 4} />
        <ellipse rx={r * (.65 + q * .18)} ry={r * (.43 + q * .24)} fill="none" stroke={accent} strokeWidth="2" />
      </g><Debris shot={s} where={fx.to} reach={r + 19} count={12} /></>
    case "horizonline": return <g transform={pose(a, direction(a, b))}>
      <path d={"M0-35H" + span + "V35H0Z"} fill={color} fillOpacity=".10" stroke={accent} strokeWidth="2" />
      <path d={"M0-6H" + span + "V6H0Z"} fill={light} fillOpacity={.7 * (1 - q)} />
      {[0, 1, 2, 3].map(i => <path key={i} d={"M" + span * i / 4 + " -34L" + span * (i + .25) / 4 + " -68 " + span * (i + 1) / 4 + " -34"}
        fill="none" stroke={prism[i]} strokeWidth="3" />)}
    </g>
    case "dualfrequency": return <><Ring shot={s} where={fx.to} r={r} />
      <g transform={at(fx.to)}>{[0, 1, 2].map(i => <path key={i} transform={"rotate(" + (i * 120 + (fx.beat === 2 ? 60 : 0)) + ")"}
        d={"M0-14Q" + -r * .8 + " " + -r * .42 + " 0 " + -r + "Q" + r * .8 + " " + -r * .42 + " 0-14Z"}
        fill={prism[i]} fillOpacity=".10" stroke={light} strokeWidth={fx.beat === 1 ? 2.7 : 4} />)}</g>
      <Debris shot={s} where={fx.to} reach={r} count={fx.beat === 1 ? 7 : 13} ice />
    </>
  }
}

function Contact({ shot: s }: { shot: Shot }) {
  const targets = s.beat.paths?.map(row => row.at) ?? (s.fx.area ? [] : [s.fx.to]), q = ease(unit(s.p * 2))
  return <>{targets.map((where, i) => s.motif === "fault" && s.beat.kind === "fissures"
    ? <Crystal key={i} shot={s} where={{ x: where.x, y: where.y - q * 26 }} size={1.05} turn={i % 2 ? -11 : 10} />
    : <g key={i} transform={at(where) + " rotate(" + (s.motif === "frost" ? 30 : s.motif === "thunder" ? 0 : i * 17 + 23) + ")"}>
      {[-1, 1].map(n => <path key={n} d={"M" + n * (8 + q * 6) + " 0H" + n * (25 + q * 24)}
        stroke={s.light} strokeWidth={s.fx.rarity === "Prismatic" ? 3.2 : 2.3} />)}
      <path d={"M0 " + (-12 - q * 5) + "V" + (-38 - q * 27) + "M0 " + (12 + q * 5) + "V" + (22 + q * 16)}
        fill="none" stroke={s.color} strokeWidth="2.4" />
      <path d="M-8-8 0-16 9-6 16 1 7 8-1 16-9 7-16-1Z" fill={s.color} fillOpacity={.2 * (1 - q)} stroke={s.light} strokeWidth="1.4" />
    </g>)}</>
}
function OtherCue({ shot: s }: { shot: Shot }) {
  const { fx, beat, motif, color, light, p } = s, q = ease(unit(p * 1.7))
  if (beat.cue === "cancel") return <g transform={at(fx.to)}>
    <path d="M-28-18-10-4M10 4 28 18M-25 19-8 7M8-7 24-19" fill="none" stroke={color} strokeWidth="2" />
  </g>
  if (beat.cue === "shield") return <Plates shot={s} where={fx.to} spread={48 + 18 * (1 - q)}
    count={motif === "riftcurtain" ? 7 : motif === "firecoat" ? 3 : 4} />
  if (beat.cue === "ward") return <g transform={pose(fx.to, direction(fx.from, fx.to))}>
    <path d={"M-35-" + (37 + q * 10) + "Q" + (-12 + q * 8) + " 0-35 " + (37 + q * 10)}
      fill="none" stroke={light} strokeWidth={4 * (1 - q) + 2} />
    <path d="M-35-31-20-13-32 0-17 18-35 34" fill="none" stroke={color} strokeWidth="3" />
    {beat.kind === "break" && <Debris shot={s} where={{ x: -24, y: 0 }} reach={72} count={7} />}
  </g>
  if (beat.cue === "interrupt") return <g transform={at(fx.to)}>
    <path d="M-42-33-13-8M11 8 43 34M-37 37-9 12M12-12 38-39" fill="none" stroke={light} strokeWidth="4" />
    <path d="M-19-34-25-54M25 28 36 45" fill="none" stroke={color} strokeWidth="2.5" />
  </g>
  if (beat.cue === "arm") {
    if (motif === "reflectionbolt") return <Opening shot={s} />
    if (motif === "riftcurtain") return <Flame shot={s} where={{ x: fx.to.x + 39, y: fx.to.y - 36 }} size={.7} turn={29} />
    return <Plates shot={s} where={fx.to} count={4} spread={54} />
  }
  if (beat.cue === "release") {
    if (motif === "roadbreak") return <g>
      <path d={path([fx.from, fx.to])} fill="none" stroke={color} strokeWidth="2.4" strokeDasharray="9 8" />
      <path transform={pose(fx.to, direction(fx.from, fx.to))} d="M0-24V-9L11 0 0 9V24M-13-19V-7M-13 7V19" fill="none" stroke={light} strokeWidth="3" />
    </g>
    if (motif === "riftcurtain") return <g>
      <Bolt shot={s} from={fx.from} to={fx.to} seed={10} width={2.1} />
      <Flame shot={s} where={fx.to} size={.9} /><Debris shot={s} where={fx.to} reach={64} count={7} />
    </g>
    return <Strike shot={s} />
  }
  if (beat.cue === "deploy") return <Ring shot={s} where={fx.to} r={radius(s)} />
  return null
}

function HeldStates({ battle }: { battle: EdgeBattle }) {
  const nodes = battleUnits(battle)
  const shot = (id: string, to: EdgePoint): Shot => {
    const rank = id.split("/")[1] as Rarity, [color, light, accent] = palette[rank], art = warlockChoreography(id)!
    return { motif: art.motif, p: .3, color, light, accent,
      beat: { cue: "arm", owner: 0, axis: { x: 1, y: 0 } },
      fx: { id: 0, skill: id, rarity: rank, phase: "impact", mark: { motion: "shield", glyph: "fire" }, from: to, to, start: 0, end: 1 } }
  }
  return <g aria-hidden>
    {nodes.map(holder => {
      const cast = battle.runtime.shieldCasts.get(holder.id), id = !cast?.signature && cast?.skill?.id
      if (!id || !warlockChoreography(id) || !holder.hp || !holder.shield || holder.shieldUntil <= battle.time) return null
      const s = shot(id, holder), fade = Math.min(1, (holder.shieldUntil - battle.time) / .3)
      return <g key={"shield/" + holder.id} data-warlock-state={id} opacity={fade * .65}>
        <path transform={at(holder)} d={s.motif === "riftcurtain" ? "M-31-38-43-24-40 19-29 31M29-38 43-24 40 19 29 31M-22 39H22" :
          "M-29-36-40-19-37 21-24 34M29-36 40-19 37 21 24 34"} fill="none" stroke={s.color} strokeWidth="2.3" />
      </g>
    })}
    {battle.runtime.buffs.map(buff => {
      const id = !buff.cast.signature && buff.cast.skill?.id, holder = unitOf(battle, buff.target)
      if (!id || !warlockChoreography(id) || !holder?.hp || buff.until <= battle.time || !["dot", "slow", "short"].includes(buff.kind)) return null
      const s = shot(id, holder), fade = Math.min(1, (buff.until - battle.time) / .25)
      const count = buff.kind === "dot" ? Math.max(0, Math.ceil((buff.until - battle.time - .1) / (buff.values[1] || 1))) : 1
      return <g key={buff.id + "/" + buff.target} data-warlock-state={id} opacity={fade}>
        {buff.kind === "dot" ? Array.from({ length: count }, (_, i) => <path key={i} transform={at({ x: holder.x + 38, y: holder.y - 8 - i * 19 })}
          d="M-7-8 8-5 9 5-2 10-9 2ZM-4-4 4 5" fill="#2a1826" stroke={s.light} strokeWidth="2" />)
          : <path transform={at({ x: holder.x, y: holder.y + 31 })} d={buff.kind === "short" ? "M-27 5H-8L0-6 8 5H27M-17-1V10M17-1V10" :
            "M-24 4-15-4-6 5 3-6 13 5 24-1M-17 12H17"} fill="none" stroke={s.color} strokeWidth="2.2" />}
      </g>
    })}
    {battle.runtime.watches.map(watch => {
      const id = watch.cast.signature ? undefined : watch.cast.skill?.id, holder = unitOf(battle, watch.target)
      if (id !== "warlock/Prismatic/A5" || !holder?.hp || watch.until <= battle.time || watch.uses <= 0) return null
      const s = shot(id, holder)
      return <g key={watch.id + "/" + watch.target} data-warlock-state={id} opacity={Math.min(1, (watch.until - battle.time) / .3)}>
        <Flame shot={s} where={{ x: holder.x + 39, y: holder.y - 31 }} size={.38} turn={28} />
      </g>
    })}
  </g>
}

export function EdgeWarlockEffects({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>
    {battle.runtime.effects.map(fx => {
      const art = warlockChoreography(fx.skill), beat = fx.warlock
      if (!art || !beat || battle.time < fx.start || battle.time >= fx.end) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start)), [color, light, accent] = palette[fx.rarity]
      const followed = fx.target !== undefined && unitOf(battle, fx.target)
      const follows = beat.cue === "flight" || beat.cue === "arm" && beat.kind === "mirror"
      const s: Shot = { fx: followed && follows ? { ...fx, to: point(followed) } : fx, beat, motif: art.motif, p, color, light, accent }
      const open = beat.cue === "prepare", moving = beat.cue === "flight" || beat.cue === "travel"
      return <g key={fx.id} data-warlock-skill={fx.skill} data-warlock-cue={beat.cue} data-warlock-beat={fx.beat}
        opacity={open || moving ? 1 : Math.min(1, p * 18) * (1 - unit((p - .38) / .62))}>
        {layer === "floor" ? open ? outline(s) : beat.cue === "strike" ? <Strike shot={s} /> : null
          : open ? <Opening shot={s} /> : moving ? <Delivery shot={s} /> : beat.cue === "strike" ? <Contact shot={s} /> : <OtherCue shot={s} />}
      </g>
    })}
    {layer === "front" && <HeldStates battle={battle} />}
  </g>
}

export function EdgeWarlockField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  const id = field.cast.skill?.id, art = warlockChoreography(id)
  if (!id || !art) return null
  const rank = id.split("/")[1] as Rarity, [color, light] = palette[rank], r = rings(field.area)[0]?.radius ?? 90, center = field.area.center
  const fade = Math.min(unit((battle.time - field.time) / .2), unit((field.until - battle.time) / .35))
  const count = art.motif === "stormmine" ? 3 : 6
  return <g data-warlock-field={id} opacity={fade}>
    <path d={areaPath(field.area)} fill={color} fillOpacity=".027" stroke={color} strokeWidth="1.8" strokeDasharray={art.motif === "stormmine" ? "4 11" : "17 8"} />
    <g transform={at(center)}>{Array.from({ length: count }, (_, i) => <g key={i} transform={"rotate(" + i * 360 / count + ")"}>
      <path d={art.motif === "stormmine" ? "M-8-" + r * .79 + "L0-" + r * .94 + " 8-" + r * .79 + " 0-" + r * .64 + "Z" :
        "M-17-" + r * .7 + "L-17-" + r * .87 + " 0-" + r * .94 + " 17-" + r * .87 + " 17-" + r * .7}
        fill="#211929" fillOpacity=".65" stroke={light} strokeWidth="2.1" />
      <path d={"M0-" + r * .64 + "L" + r * .2 + " -" + r * .2 + " 0 0"} fill="none" stroke={color} strokeWidth="1.5"
        strokeOpacity={.34 + .13 * Math.sin(battle.time * 1.4 + i)} strokeDasharray="5 8" />
    </g>)}</g>
  </g>
}
