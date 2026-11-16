import type { Rarity } from "@/card/types"

import type { EdgeBattle, EdgePoint, EdgeUnitId } from "./edgeBattle"
import { arc, at, circlesOf, ease, heading, mix, path, Plating, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { WardStroke, wardenStrip } from "./EdgeWardenFields"
import { along, areaPath, direction, edgeDistance, left, point } from "./edgeSkills/geometry"
import { paladinChoreography, type PaladinMotif } from "./edgeSkills/paladinChoreo"
import type { PaladinBeat, SkillVisual } from "./edgeSkills/presentation"
import { alliesOf, unitOf, type FieldEffect } from "./edgeSkills/state"

type Layer = "floor" | "front"
type Shot = { fx: SkillVisual; beat: PaladinBeat; motif: PaladinMotif; paint: ArmorPaint; p: number }
type Contact = NonNullable<PaladinBeat["paths"]>[number]

const pearl: Record<Rarity, ArmorPaint> = {
  C: { light: "#fffdf1", metal: "#f4dec1", accent: "#ffe8a7", ink: "#474044" },
  UC: { light: "#f2ffff", metal: "#b9e7ec", accent: "#8fe0e9", ink: "#29434e" },
  R: { light: "#fff7df", metal: "#ffd099", accent: "#ff9d8b", ink: "#4c363c" },
  E: { light: "#f9eeff", metal: "#d5afff", accent: "#ffc1dd", ink: "#493454" },
  L: { light: "#fff9d9", metal: "#ffc269", accent: "#ffe69d", ink: "#583e37" },
  Radiant: { light: "#fff6ef", metal: "#ffaecf", accent: "#ffd4aa", ink: "#532f4b" },
  Prismatic: { light: "#fffdf4", metal: "#d6d4ff", accent: "#9deaff", ink: "#403756" },
}

const sigils: Record<PaladinMotif, string> = {
  sunedge: "M-32 4-13-3-7-23 3-10 20-8 32-1 8 12-7 8-21 16ZM-11-4 7 10",
  lamp: "M-15-10H15L10 15 0 22-10 15ZM-11-15H11M-6-7 0-21 6-7 0 3Z",
  smallguard: "M-25-13H-3V19L-22 9ZM3-13H25L22 9 3 19ZM-10-2H10V7H-10Z",
  swordpress: "M-35-5H-12L-6-17 26-10 40 0 25 12-6 17-12 5H-35ZM2 0H26",
  banner: "M-12 24V-24M-11-22H24L15-11 24 0H-11M-24 24H5",
  vigil: "M-30-14-18-22H19L30-12 23 11 0 22-23 11ZM-20-2H20M-14 7H14",
  lightline: "M-34 10-17-10H35L17 5H-16ZM-28 16H15L31 5M-9-14H27",
  cleanse: "M-31-10H-15L-9-18 4-6-5 4-22 11H-32ZM10-14 32-7 22 12H3L10 1Z",
  shoulder: "M-26 11H26M-17 9-11-13-3-8 1-22 7-8 16-12 20 9M-8 3H10",
  oathshield: "M-31-11-18-21 0-12 18-21 31-11 24 13 0 25-24 13ZM-19-3-8 6 0-1 8 6 19-3",
  vow: "M-30-7-20-19-8-9 0-22 8-9 20-19 30-7 18 10 0 18-18 10ZM-9 0H9L0 11Z",
  burning: "M-28 10-19-10-12-4-2-22 7-9 17-17 28-4 23 11 8 20-12 17ZM-8 8-1-5 6 8",
  approach: "M-28 15-20-9-11-13-9 7 5-11 13-11 28 3 15 18H-7ZM-23 19H10",
  prayer: "M-7-26H7V-9H26V5H7V24H-7V5H-26V-9H-7ZM-13 15H13",
  mirrorward: "M-30 6-15-19 13-24 29-6 14 20-14 24ZM-20 11 19-11M-13 16 22-4",
  sanctuary: "M-33 12-22-16-11-5 0-21 11-5 22-16 33 12H-33ZM-20 6H20",
  chain: "M-30-4-18-18-5-14 1-3-11 8-23 6ZM-1 6 10-9 25-8 31 6 19 19 5 16Z",
  gate: "M-29 20V-14L-18-24-7-14V20ZM7 20V-14L18-24 29-14V20ZM-7 3H7",
  uplift: "M-32 10-18-7-6-4 0-23 6-4 18-7 32 10 17 17H-17ZM-14 7H14",
  handoff: "M-31-12H-11L-3-3-10 14H-31ZM5-17H26L33-3 22 18H8L1 5Z",
  circle: "M-28 0-14-19 0-14 14-19 28 0 14 19 0 14-14 19ZM-11 0 0-9 11 0 0 9Z",
  verdict: "M-7-33H7V-15H27V-5H7V17L0 34-7 17V-5H-27V-15H-7Z",
  bond: "M-32-11-20-19-7-7-14 2-7 11-20 19-32 11ZM32-11 20-19 7-7 14 2 7 11 20 19 32 11Z",
  sideline: "M-34-4H34M-28 5H20L7 18M-20-17-7-4M11-17 25-4M-30 7-21 17",
  rally: "M-31 3-20-11-11-7 0-23 11-7 20-11 31 3 13 17H-13ZM-16 8H16",
  twinbeam: "M-34-14H12L34-7 12 0H-34ZM-34 2H12L34 9 12 16H-34Z",
  wings: "M-39 1-28-16-13-20-6-10 0 3-15 15-23 7-31 12ZM39 1 28-16 13-20 6-10 0 3 15 15 23 7 31 12Z",
  swapwing: "M-34 13-16-13-4-10 9 11 23-9H34L17 17H6L-9-4-23 13ZM-25-14H-11M12 15H25",
  spear: "M-39-5H-9L4-14 39-4 47 0 39 5 4 14-9 5H-39ZM-6 0H30",
  bloomward: "M-32-9-17-22-6-13 0-25 6-13 17-22 32-9 25 12 0 25-25 12ZM-15-4 0 12 15-4 0-12Z",
  accord: "M-34-10-19-24-9-14 0-28 9-14 19-24 34-10 23 16 0 28-23 16ZM-16-4 0-15 16-4 9 11H-9Z",
  horizon: "M-42-14H25L43 0 25 14H-42L-27 0ZM-31-7H23L33 0 23 7H-31Z",
  dawn: "M-37-11-24-21-14-10-18 10-29 18-37 7ZM-13-12 0-27 13-12 10 15 0 27-10 15ZM37-11 24-21 14-10 18 10 29 18 37 7Z",
  doublehalo: "M-38 2-22-20-9-13-18-2-10 11-24 18ZM38-2 22 20 9 13 18 2 10-11 24-18ZM-7 0 0-11 7 0 0 11Z",
  chorus: "M-37-7-26-18-16-7-26 4ZM-11 2 0-16 11 2 0 17ZM16-7 26-18 37-7 26 4ZM-29 17H29",
}

const lines = new Set<PaladinMotif>(["lightline", "sideline", "twinbeam", "horizon"])
const fields = new Set<PaladinMotif>(["banner", "gate", "circle"])
const followCaster = new Set<PaladinMotif>(["banner", "uplift", "rally"])
const axes = { up: { x: 0, y: -1 }, east: { x: 1, y: 0 } }

function pose(spot: EdgePoint, axis: EdgePoint, scale = 1, angle = 0) {
  return at(spot) + " rotate(" + (heading(axis) + angle) + ") scale(" + scale + ")"
}

function Seal({ shot, spot, axis = axes.east, scale = 1, angle = 0, fill = .67 }: {
  shot: Shot; spot: EdgePoint; axis?: EdgePoint; scale?: number; angle?: number; fill?: number
}) {
  return <g transform={pose(spot, axis, scale, angle)}>
    <Plating d={sigils[shot.motif]} paint={shot.paint} weight={3.4 + (1 - ease(shot.p)) * 1.35} fill={fill} />
  </g>
}

function lanternPath(from: EdgePoint, to: EdgePoint, bend: number, t: number) {
  const side = left(direction(from, to))
  return along(mix(from, to, t), side, Math.sin(t * Math.PI) * bend)
}

function Wisps({ shot, from, to, bend = 22, charge = false }: {
  shot: Shot; from: EdgePoint; to: EdgePoint; bend?: number; charge?: boolean
}) {
  const { paint, p } = shot
  if (edgeDistance(from, to) < 7) return null
  const q = charge ? .9 : .3 + .7 * ease(p)
  const points = [0, .22, .48, .76, 1].map((t) => lanternPath(from, to, bend, t * q))
  return <g opacity={charge ? .60 : .88}>
    <WardStroke d={path(points)} color={paint.metal} width={charge ? 3.4 : 4.3} />
    <path d={path(points.map((spot, i) => ({ ...spot, y: spot.y + Math.sin(i * Math.PI / 4) * 8 })))} fill="none"
      stroke={paint.light} strokeWidth="2.4" strokeDasharray={charge ? "7 8" : "10 5"} />
  </g>
}

function Lane({ shot, prepare }: { shot: Shot; prepare: boolean }) {
  const { fx, motif, paint, p } = shot
  const lane = wardenStrip(fx.area?.parts[0])
  if (!lane) return null
  const { from, to, width, length } = lane
  const h = width / 2
  const q = ease(p * (prepare ? 1 : 1.45))
  const thin = motif === "lightline"
  const wide = motif === "horizon"
  return <g transform={pose(from, direction(from, to))}>
    <path d={`M0 ${-h}H${length}V${h}H0Z`} fill={paint.metal} fillOpacity={prepare ? .075 : .17}
      stroke={paint.metal} strokeWidth={wide ? 3.2 : 2.5} />
    {motif === "sideline" ? <>
      <path d={`M0 0H${length}`} fill="none" stroke={paint.light} strokeWidth="4.3" strokeDasharray="12 6" />
      {[.18, .39, .61, .82].map((step) => <path key={step} transform={`translate(${step * length} 0)`}
        d={`M-17 ${-h + 7} 0-12 17 ${-h + 7}M-17 ${h - 7} 0 12 17 ${h - 7}`}
        fill="none" stroke={paint.accent} strokeWidth={prepare ? 2.9 : 5.6} />)}
    </> : <>
      <path d={`M0 ${-h * .63}H${length * (.16 + .84 * q)}M0 ${h * .63}H${length * (.16 + .84 * q)}`}
        fill="none" stroke={wide ? spectrum[3] : paint.accent} strokeWidth={thin ? 2.9 : 5.1}
        strokeDasharray={prepare ? "18 12" : undefined} />
      {!prepare && (thin
        ? <WardStroke d={`M0 -7Q${length * .44} -31 ${length} -7M0 7Q${length * .63} 34 ${length} 7`} color={paint.light} width={4.5} />
        : <path d={`M0 ${-h * .45}L${length * .81} ${-h * .58} ${length} 0 ${length * .81} ${h * .58} 0 ${h * .45}Z`}
          fill={paint.light} fillOpacity={wide ? .66 : .43} stroke={paint.light} strokeWidth={wide ? 5.4 : 4.6} />)}
      {(wide || motif === "twinbeam") && [1, -1].map((side) => <path key={side} d={`M${length * q * .77} ${side * h * .82}l-28 ${-side * h * .42} 24 ${-side * 5}`}
        fill="none" stroke={wide && side < 0 ? spectrum[1] : paint.light} strokeWidth={wide ? 5.4 : 3.8} />)}
    </>}
  </g>
}

function Halo({ shot, prepare }: { shot: Shot; prepare: boolean }) {
  const { fx, motif, paint, p } = shot
  const q = ease(p)
  return <>{circlesOf(fx.area).map(({ center, radius }, i) => {
    const ring = radius * (prepare ? 1 : .67 + .33 * q)
    const parts = motif === "verdict" ? 4 : motif === "prayer" ? 4 : motif === "rally" ? 5
      : motif === "dawn" ? 3 : motif === "wings" || motif === "swapwing" || motif === "doublehalo" ? 2 : 3
    const spectral = motif === "doublehalo" || motif === "dawn"
    return <g key={i} transform={at(center)}>
      <circle r={radius} fill={paint.metal} fillOpacity={prepare ? ".065" : ".12"} stroke={paint.metal} strokeWidth={prepare ? 2.9 : 3.7} />
      {Array.from({ length: parts }, (_, side) => <g key={side} transform={`rotate(${side * 360 / parts + i * 33 + q * (motif === "doublehalo" ? 84 : 26)})`}>
        <WardStroke d={arc(ring, 7, 360 / parts * .73)} color={spectral ? spectrum[(side + i * 2) % spectrum.length] : paint.light}
          width={prepare ? 3.3 : spectral ? 6.8 : 5.2} />
        {["verdict", "prayer", "dawn", "rally"].includes(motif) && <path d={`M${radius * .37}-7 ${radius * .73}-14 ${ring} 0 ${radius * .73} 14 ${radius * .37} 7Z`}
          fill={paint.metal} fillOpacity=".18" stroke={paint.accent} strokeWidth="3.1" />}
        {(motif === "sanctuary" || motif === "uplift") && <path d={`M${radius * .41} -9Q${radius * .72} -34 ${ring} -17`}
          fill="none" stroke={paint.accent} strokeWidth="4.4" />}
      </g>)}
      {motif === "doublehalo" && <path d={arc(radius * .68, 16, 205) + arc(radius * .68, 214, 352)} fill="none"
        stroke={paint.light} strokeWidth="3.6" strokeDasharray={i ? "8 6" : undefined} />}
    </g>
  })}</>
}

function FieldArt({ motif, center, radius, paint, q }: {
  motif: PaladinMotif; center: EdgePoint; radius: number; paint: ArmorPaint; q: number
}) {
  if (motif === "banner") return <g transform={at(center)}>
    <circle r={radius} fill={paint.ink} fillOpacity=".26" stroke={paint.metal} strokeWidth="2.8" strokeDasharray="12 7" />
    <path d={`M-7 23V-52H33L${22 + q * 7} -39 33-26H-7M-23 23H11`}
      fill={paint.metal} fillOpacity=".32" stroke={paint.light} strokeWidth="3.4" />
    <path d={arc(radius * .72, 39, 154)} fill="none" stroke={paint.accent} strokeWidth="3.2" opacity=".74" />
  </g>
  if (motif === "gate") return <g transform={at(center)}>
    <circle r={radius} fill={paint.ink} fillOpacity=".37" stroke={paint.metal} strokeWidth="3.1" strokeDasharray="14 6" />
    <path d={arc(radius - 13, 16, 164) + arc(radius - 13, 196, 344)} fill="none" stroke={paint.accent} strokeWidth="3.4" />
    {[-1, 1].map((side) => <g key={side} transform={`translate(${side * (radius - 12)} 0)`}>
      <Plating d="M-13 21V-23L0-36 13-23V21L0 30Z" paint={paint} weight={3.8} fill={.66} />
      <path d="M0-22V17M-8-5H8" stroke={paint.light} strokeWidth="2.7" />
    </g>)}
  </g>
  return <g transform={at(center)}>
    <circle r={radius} fill={paint.ink} fillOpacity=".30" stroke={paint.metal} strokeWidth="3.8" />
    {[0, 1, 2, 3].map((side) => <g key={side} transform={`rotate(${side * 90 + 20})`}>
      <path d={`M${radius - 18} -19L${radius + 11} 0 ${radius - 18} 19 ${radius - 9} 0Z`}
        fill={paint.metal} stroke={paint.light} fillOpacity=".54" strokeWidth="3.2" />
      <path d={arc(radius - 12, 13 + q * 8, 72)} fill="none" stroke={paint.accent} strokeWidth="3.7" />
    </g>)}
  </g>
}

function Prepare({ shot, layer, battle }: { shot: Shot; layer: Layer; battle: EdgeBattle }) {
  const { fx, beat, motif, paint, p } = shot
  const owner = unitOf(battle, beat.owner)
  if (!owner?.hp) return null
  const target = unitOf(battle, fx.target)
  const aim = target?.hp ? target : fx.to
  const q = ease(p)
  const actual = followCaster.has(motif) && fx.area
    ? { ...shot, fx: { ...fx, area: { ...fx.area, center: point(owner),
      parts: fx.area.parts.map((part) => part.kind === "circle" ? { ...part, center: point(owner) } : part) } } } : shot
  if (layer === "floor") {
    if (lines.has(motif)) return <Lane shot={shot} prepare />
    if (fx.area && fields.has(motif)) return <g opacity={.34 + .39 * q}>
      <FieldArt motif={motif} center={actual.fx.area!.center} radius={circlesOf(fx.area)[0].radius} paint={paint} q={q} />
    </g>
    if (fx.area) return <Halo shot={actual} prepare />
    if (edgeDistance(owner, aim) > 18) return <Wisps shot={shot} from={owner} to={aim} charge bend={motif === "spear" ? 6 : 25} />
    return null
  }
  if (motif === "verdict" || motif === "prayer" || motif === "dawn" || motif === "wings") {
    const height = motif === "verdict" ? 155 : motif === "dawn" ? 116 : motif === "wings" ? 99 : 77
    const origin = { x: fx.to.x, y: fx.to.y - height * (.92 - .72 * q) }
    return <Seal shot={shot} spot={origin} scale={motif === "verdict" ? 1.16 + .6 * q : .96 + .73 * q}
      angle={motif === "prayer" ? -37 + 37 * q : 0} />
  }
  if (motif === "accord" || motif === "chorus") return <g transform={at(owner)}>
    <path d={arc(54 + 17 * q, 15, 168) + arc(54 + 17 * q, 192, 339)} fill="none" stroke={paint.light} strokeWidth="4.8" />
    <Seal shot={shot} spot={{ x: 0, y: -43 - 28 * q }} scale={.88 + .44 * q} />
  </g>
  if (motif === "swapwing" || motif === "doublehalo") return <>
    <Seal shot={shot} spot={owner} angle={-57 * q} scale={.76 + .4 * q} />
    <Seal shot={shot} spot={aim} angle={57 * q} scale={.76 + .4 * q} />
  </>
  if (motif === "smallguard" || motif === "shoulder" || motif === "mirrorward" || motif === "bloomward" || motif === "bond" || motif === "handoff")
    return <Seal shot={shot} spot={{ x: aim.x + 25 + 13 * (1 - q), y: aim.y - 38 }} scale={.68 + .36 * q} angle={18 * (1 - q)} />
  const axis = edgeDistance(owner, aim) > 4 ? direction(owner, aim) : beat.axis
  return <Seal shot={shot} spot={along(owner, axis, 37 + 12 * q)} axis={axis}
    angle={beat.kind === "afterstrip" ? 53 - 68 * q : motif === "swordpress" ? -6 + 11 * q : -42 + 46 * q}
    scale={motif === "horizon" || motif === "twinbeam" ? 1.19 : .78 + .26 * q} />
}

function Flight({ shot, layer, battle }: { shot: Shot; layer: Layer; battle: EdgeBattle }) {
  const { fx, beat, motif, paint, p } = shot
  const picked = unitOf(battle, fx.target)
  if (!picked?.hp) return null
  const bend = motif === "chain" ? -29 : motif === "vigil" ? 29 : 41
  const to = beat.reach && edgeDistance(fx.from, picked) > beat.reach
    ? along(fx.from, direction(fx.from, picked), beat.reach) : point(picked)
  const head = lanternPath(fx.from, to, bend, p)
  const tail = lanternPath(fx.from, to, bend, Math.max(0, p - .23))
  if (layer === "floor") return <Wisps shot={shot} from={fx.from} to={to} charge bend={bend} />
  const axis = direction(tail, head)
  return <>
    <WardStroke d={path([tail, lanternPath(fx.from, to, bend, Math.max(0, p - .11)), head])} color={paint.accent} width={motif === "chain" ? 7.2 : 4.6} />
    {motif === "lamp" ? <g transform={pose(head, axis)}>
      <Plating d="M-17 0-6-10 9-8 16 0 9 8-6 10Z" paint={paint} weight={3.8} fill={.81} />
      <circle cx="3" r="4.8" fill={paint.light} />
    </g> : <Seal shot={shot} spot={head} axis={axis} scale={motif === "chain" ? .55 : .68} angle={18 * Math.sin(p * Math.PI)} />}
  </>
}

function PushTrace({ shot, contact }: { shot: Shot; contact: Contact }) {
  const { at: start, end } = contact
  if (!end || edgeDistance(start, end) < 5) return null
  const length = edgeDistance(start, end)
  const q = ease(shot.p)
  const h = shot.motif === "swordpress" ? 17 : 12
  return <g transform={pose(start, direction(start, end))}>
    <path d={`M0 ${-h}H${length - 11}L${length} 0 ${length - 11} ${h}H0Z`}
      fill={shot.paint.metal} fillOpacity=".17" stroke={shot.paint.metal} strokeWidth="2.8" />
    <path d={`M${length * q - 12} -9l16 9-16 9`} fill="none" stroke={shot.paint.light} strokeWidth="4" />
  </g>
}

function Strike({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, motif, beat, paint, p } = shot
  const q = ease(p)
  const paths = beat.paths ?? []
  if (layer === "floor") return <>
    {fx.area && lines.has(motif) ? <Lane shot={shot} prepare={false} />
      : fx.area && beat.kind !== "zone" ? <Halo shot={shot} prepare={false} /> : null}
    {paths.map((contact, i) => <PushTrace key={i} shot={shot} contact={contact} />)}
  </>
  return <>
    {(motif === "verdict" || motif === "wings" || motif === "dawn") && fx.area && <Seal shot={shot}
      spot={fx.area.center} scale={1.35 + .6 * q} fill={.18} />}
    {paths.map(({ at: spot, end }, i) => {
      const axis = end ? direction(spot, end) : edgeDistance(fx.from, spot) > 3 ? direction(fx.from, spot) : beat.axis
      return <g key={i}>
        <Seal shot={shot} spot={along(spot, axis, 17 + 12 * q)} axis={axis}
          angle={motif === "sunedge" ? 19 + 58 * q : motif === "cleanse" ? -49 + 27 * q : i * 8 + 14 * q}
          scale={motif === "horizon" || motif === "doublehalo" ? 1.02 : .82 + .16 * q} />
        {motif === "sunedge" && <path transform={at(spot)} d="M-21 0H21M0-21V21" stroke={paint.light} strokeWidth="4.4" />}
        {(motif === "horizon" || motif === "doublehalo") && <path transform={pose(spot, axis)}
          d={`M-38-18Q-5 ${-34 + q * 17} 34-17M-34 18Q6 ${37 - q * 17} 38 17`}
          fill="none" stroke={spectrum[(i + 1) % spectrum.length]} strokeWidth="4.6" />}
      </g>
    })}
  </>
}

function Motion({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  const q = ease(p)
  if (beat.cue === "swap") {
    const other = beat.other ?? fx.from
    if (layer === "floor") return <><Wisps shot={shot} from={fx.from} to={fx.to} bend={49} />
      <Wisps shot={shot} from={fx.to} to={other} bend={49} /></>
    return <>{[fx.from, fx.to].map((spot, i) => <g key={i} transform={at(spot)}>
      <path d={arc(44 + 27 * q, 11, 151) + arc(44 + 27 * q, 192, 335)}
        fill="none" stroke={motif === "doublehalo" ? spectrum[i + 2] : paint.accent} strokeWidth="5.8" />
      <Seal shot={shot} spot={{ x: 0, y: -43 }} angle={(i ? -1 : 1) * 108 * q} scale={.86 + .21 * q} />
    </g>)}</>
  }
  if (layer === "floor") return <>
    <PushTrace shot={shot} contact={{ at: fx.from, end: fx.to }} />
    {[.17, .39, .62, .86].map((f, i) => <path key={f} transform={pose(mix(fx.from, fx.to, f), beat.axis)}
      d={i % 2 ? "M-14 2H2L11 11H-7Z" : "M-14-13H5L12-4H-6Z"} fill={paint.metal}
      opacity={p >= f || beat.cue === "arrival" ? .71 : .16} stroke={paint.light} strokeWidth="2.9" />)}
  </>
  return <Seal shot={shot} spot={beat.cue === "arrival" ? fx.to : mix(fx.from, fx.to, 1 - (1 - p) ** 3)}
    axis={beat.axis} angle={motif === "sanctuary" ? -42 + 56 * q : -23} scale={.79 + .18 * q} />
}

function Mend({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  const q = ease(p)
  const from = fx.from
  if (layer === "floor") {
    if (motif === "chorus" && fx.area) return <g opacity={.79}><Halo shot={shot} prepare={false} /></g>
    return <Wisps shot={shot} from={from} to={fx.to} bend={motif === "chain" ? -27 : 19} />
  }
  const height = 24 + 47 * q
  const open = motif === "wings" || motif === "rally" || motif === "dawn"
  return <g transform={at(fx.to)}>
    <path d={`M-31 ${-height * .49}Q-14 ${-height} 0 ${-height * .73}T31 ${-height * .49}`}
      fill="none" stroke={motif === "bloomward" ? "#ffccbf" : paint.light} strokeWidth={open ? 5.2 : 3.9} />
    <Seal shot={shot} spot={{ x: motif === "lamp" ? -23 : -29, y: -height * .69 }} scale={open ? .72 + .37 * q : .68 + .17 * q}
      angle={beat.kind === "historic" ? -20 + 39 * q : -11} fill={.4} />
    {open && <path d={`M-46 13-27 6-18 ${-height * .48}M46 13 27 6 18 ${-height * .48}`}
      fill="none" stroke={paint.accent} strokeWidth="3.7" />}
  </g>
}

function Ward({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  const q = ease(p)
  const spot = fx.to
  const guarded = beat.cue === "ward"
  if (layer === "floor") {
    if (beat.kind === "anti" && beat.paths?.length) return <>{beat.paths.map((contact, i) => <PushTrace key={i} shot={shot} contact={contact} />)}</>
    if (guarded && beat.kind === "banner" && fx.area) return <Wisps shot={shot} from={fx.area.center} to={spot} bend={-17} />
    return <Wisps shot={shot} from={fx.from} to={spot} bend={beat.cue === "share" ? -29 : 17} charge={beat.cue === "arm"} />
  }
  if (beat.cue === "arm") {
    return <g transform={at(spot)}>
      <Seal shot={shot} spot={{ x: 34, y: -47 - 18 * (1 - q) }} scale={motif === "accord" ? 1.02 : .78 + .16 * q}
        angle={motif === "chorus" ? 30 - 30 * q : 0} />
      {(motif === "accord" || motif === "chorus") && <path d={arc(47 + 13 * q, 12, 147)} fill="none"
        stroke={spectrum[2]} strokeWidth="3.6" strokeDasharray={motif === "chorus" ? "6 7" : undefined} />}
    </g>
  }
  const axis = guarded ? direction(spot, fx.from) : axes.east
  const panel = guarded ? along(spot, axis, 26 + 9 * (1 - q)) : { x: spot.x + 30, y: spot.y - 25 }
  const wide = motif === "accord" || motif === "bloomward" || motif === "dawn" || motif === "horizon"
  return <g>
    {guarded && <g transform={pose(spot, axis)}>
      <path d={`M25 ${-30 - 12 * q}Q${66 - 22 * q} 0 25 ${30 + 12 * q}L37 20Q48 0 37-20Z`}
        fill={paint.metal} fillOpacity={wide ? .38 : .27} stroke={paint.light} strokeWidth={wide ? 5.7 : 4.2} />
      {beat.kind === "break" && <path d="M39-29 54-39M49-8 65-8M40 21 58 32" fill="none" stroke={paint.accent} strokeWidth="4.4" />}
    </g>}
    {!guarded && <path transform={at(spot)} d={`M-50 ${-16 + 11 * (1 - q)}V15L-30 34M50 ${-16 + 11 * (1 - q)}V15L30 34`}
      fill="none" stroke={paint.metal} strokeWidth={wide ? 5 : 3.7} />}
    <Seal shot={shot} spot={panel} axis={axis} scale={wide ? .95 + .27 * q : .76 + .22 * q}
      angle={guarded ? -8 + 13 * q : 0} fill={beat.cue === "share" ? .91 : .56} />
  </g>
}

function Reversal({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, beat, motif, paint, p } = shot
  const length = edgeDistance(fx.from, fx.to)
  const q = ease(p * 1.33)
  const axis = length > 4 ? direction(fx.from, fx.to) : beat.axis
  const tip = motif === "accord" ? Math.max(12, length - 28) : length
  if (layer === "floor") return <g transform={pose(fx.from, axis)}>
    {motif === "accord" || motif === "dawn" ? <>
      <path d={`M0-6Q${tip * .38}-37 ${tip} -4M0 6Q${tip * .56} 33 ${tip} 4`}
        fill="none" stroke={spectrum[motif === "accord" ? 3 : 1]} strokeWidth="6.3" opacity=".81" />
      <WardStroke d={`M0 0H${tip}`} color={paint.light} width={7.1} />
    </> : motif === "spear" ? <path d={`M0-8H${length - 15}L${length} 0 ${length - 15} 8H0L15 0Z`}
      fill={paint.accent} fillOpacity=".56" stroke={paint.light} strokeWidth="4.7" />
      : <WardStroke d={`M0 0 ${length * .32} -22 ${length * .56} 12 ${length} 0`} color={paint.light} width={4.3} />}
  </g>
  return <Seal shot={shot} spot={along(fx.from, axis, tip * (.42 + .58 * q))} axis={axis}
    scale={motif === "accord" || motif === "dawn" ? 1.06 : .82} angle={-15 * (1 - q)} />
}

function FieldPulse({ shot, layer }: { shot: Shot; layer: Layer }) {
  const { fx, motif, paint, p } = shot
  const shape = fx.area
  const q = ease(p)
  if (layer === "floor") {
    if (shape && fields.has(motif)) return <g opacity={.73 * (1 - q)}>
      <path d={areaPath(shape)} fill={paint.metal} fillOpacity=".13" stroke={paint.light} strokeWidth="4.6" />
    </g>
    return null
  }
  return <Seal shot={shot} spot={{ x: fx.to.x, y: fx.to.y - 20 - 23 * q }} scale={.74 + .31 * q} />
}

function LayerArt({ shot, layer, battle }: { shot: Shot; layer: Layer; battle: EdgeBattle }) {
  switch (shot.beat.cue) {
    case "prepare": return <Prepare shot={shot} layer={layer} battle={battle} />
    case "flight": return <Flight shot={shot} layer={layer} battle={battle} />
    case "travel": case "arrival": case "swap": return <Motion shot={shot} layer={layer} />
    case "strike": return <Strike shot={shot} layer={layer} />
    case "heal": return <Mend shot={shot} layer={layer} />
    case "ward": case "shield": case "arm": case "share": return <Ward shot={shot} layer={layer} />
    case "retort": return <Reversal shot={shot} layer={layer} />
    case "deploy": case "release": return <FieldPulse shot={shot} layer={layer} />
    case "strip":
      return layer === "front" ? <g transform={pose(shot.fx.to, shot.beat.axis)}>
        <path d={`M-24-33H-9L6-17 24-27M-21 19 0 8 21 29M-7-1 11-1 ${28 + 23 * ease(shot.p)} -12`}
          fill="none" stroke={shot.paint.light} strokeWidth="4.6" />
        <Seal shot={shot} spot={{ x: 26, y: -22 }} scale={.77} />
      </g> : null
  }
}

export function EdgePaladinField({ field, battle, rarity }: { field: FieldEffect; battle: EdgeBattle; rarity: Rarity }) {
  const id = field.cast.skill?.id
  const art = paladinChoreography(id)
  const circle = circlesOf(field.area)[0]
  if (!art || !fields.has(art.motif) || field.mode === "leave" || !circle || field.mode === "enter" && field.step.selector.units === "e") return null
  const fade = unit((field.until - battle.time) / .64)
  const q = .5 + .5 * Math.sin((battle.time - field.time) * 3.8)
  return <g data-paladin-field={id} opacity={fade * (.82 + .12 * q)}>
    <FieldArt motif={art.motif} center={circle.center} radius={circle.radius} paint={pearl[rarity]} q={q} />
    {art.motif === "circle" && alliesOf(battle, field.cast.owner).filter((unit) => unit.hp && field.seen.has(unit.id) && field.cast.trace.get(unit.id)?.shield).map((unit) =>
      <path key={unit.id} transform={at({ x: unit.x + 33, y: unit.y + 32 })} d="M-8 0 0-8 8 0 0 8Z"
        fill={pearl[rarity].metal} fillOpacity=".36" stroke={pearl[rarity].accent} strokeWidth="2.4" />)}
  </g>
}

function Seals({ battle }: { battle: EdgeBattle }) {
  if (battle.finishedAt !== null) return null
  const pending = new Map<string, { id: string; who: NonNullable<ReturnType<typeof unitOf>>; until: number }>()
  const add = (id: string | undefined, key: EdgeUnitId, until: number) => {
    if (!id || until <= battle.time || !paladinChoreography(id)) return
    const who = unitOf(battle, key)
    if (who?.hp) pending.set(id + "/" + key, { id, who, until })
  }
  for (const buff of battle.runtime.buffs) {
    if (["guard", "anti", "returnhp"].includes(buff.kind)) add(buff.cast.skill?.id, buff.target, buff.until)
  }
  for (const watch of battle.runtime.watches) {
    if (watch.uses > 0 && (!watch.rule.flags.includes("oncecast") || !watch.cast.used.has("watch/" + watch.rule.event)))
      add(watch.cast.skill?.id, watch.target, watch.until)
  }
  const levels = new Map<number | string, number>()
  return <>{[...pending].map(([key, { id, who, until }]) => {
    const rank = id.split("/")[1] as Rarity
    const y = levels.get(who.id) ?? 0
    levels.set(who.id, y + 1)
    return <g key={key} data-paladin-ready={id} transform={`translate(${who.x + 40} ${who.y - 33 - 24 * y}) scale(.51)`}
      opacity={.84 * unit((until - battle.time) / .25)}>
      <Plating d={sigils[paladinChoreography(id)!.motif]} paint={pearl[rank]} weight={4.2} fill={.83} />
    </g>
  })}</>
}

export function EdgePaladinEffects({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>
    {battle.runtime.effects.map((fx) => {
      const beat = fx.paladin
      const art = beat && paladinChoreography(fx.skill)
      if (!beat || !art || battle.time < fx.start || battle.time >= fx.end) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const opacity = ["prepare", "flight", "travel"].includes(beat.cue) ? 1 : (1 - unit((p - .2) / .8)) ** 1.27
      return <g key={fx.id} data-paladin-cue={beat.cue} data-paladin-skill={fx.skill} opacity={opacity}>
        <LayerArt shot={{ fx, beat, motif: art.motif, paint: pearl[fx.rarity], p }} layer={layer} battle={battle} />
      </g>
    })}
    {layer === "front" && <Seals battle={battle} />}
  </g>
}
