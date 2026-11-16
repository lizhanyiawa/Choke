import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, at, circlesOf, ease, heading, mix, path, Plating, polar, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { WardStroke, wardenStrip } from "./EdgeWardenFields"
import { along, areaPath, direction, edgeDistance, left } from "./edgeSkills/geometry"
import { spellbreakerChoreography, type SpellbreakerMotif } from "./edgeSkills/spellbreakerChoreo"
import type { SkillVisual, SpellbreakerBeat } from "./edgeSkills/presentation"
import { battleFighters, unitOf, type FieldEffect } from "./edgeSkills/state"

type Layer = "floor" | "front"
type Shot = { fx: SkillVisual; beat: SpellbreakerBeat; motif: SpellbreakerMotif; paint: ArmorPaint; p: number }
const inks: Record<Rarity, ArmorPaint> = {
  C: { light: "#fffaff", metal: "#d2cfec", accent: "#adbacd", ink: "#322b40" },
  UC: { light: "#edfdff", metal: "#96d8f2", accent: "#beafff", ink: "#263347" },
  R: { light: "#f3f5ff", metal: "#afbbff", accent: "#c797ff", ink: "#34304e" },
  E: { light: "#fff0ff", metal: "#c8a1ff", accent: "#fba5dc", ink: "#3a2849" },
  L: { light: "#fff8e7", metal: "#f2cd8c", accent: "#ddb6ff", ink: "#493542" },
  Radiant: { light: "#fff6fc", metal: "#ffb2d3", accent: "#bed2ff", ink: "#4a2b45" },
  Prismatic: { light: "#fffbff", metal: "#c6c9ff", accent: "#a3e6ff", ink: "#342742" },
}
const forms: Record<SpellbreakerMotif, string> = {
  shieldpick: "M-29 10-14-13 2-12 12-5 3 2 25-1 32 5 7 13-8 8-19 16Z",
  pinpoint: "M-28 0-8-5 0-23 7-6 28 0 7 6 0 23-8 5ZM0-8V8M-10 0H10",
  crosscut: "M-31-7H-7L0-14 7-7H31V4H7L0 13-7 4H-31ZM-18 12H17",
  chisel: "M-26 11-16-10-3-14 8-3 26-9 19 4 5 16-7 9ZM-13 6 10-6",
  waveglass: "M-27-13Q0-4 27-13L21 13 0 23-21 13ZM-17-1Q0 8 17-1",
  sunderchant: "M-30-14H-11L-4-3 5-13H29V-4H9L0 8-9-4H-30ZM-22 13H22",
  cutoff: "M-30 2H30M-21-12H18M-15 12H23M-7-19V18M13-16V15",
  blademark: "M-27 13-14-11-5-16 4-4 26-9 15 8 2 15-8 4ZM-15 7 11-4",
  returnveil: "M-26-13H-8L0-2 8-13H26L19 11 0 20-19 11ZM-13-2H13",
  wedgejump: "M-30 9-8-16 1-10 11-17 30 8 13 14 0 5-13 15ZM-12 20H12",
  etch: "M-27-4-16-19-3-10 7-18 27-2 15 10 4 5-5 19-21 10ZM-15-2 10 4",
  rivets: "M-25-9H-15L-10 7-20 17ZM-6-19H6L0 11ZM15-9H25L20 17 10 7Z",
  refraction: "M-26-9-7-21 22-13 28 9 4 22-24 12ZM-16 10 17-10M-9 15 24-4",
  delayseal: "M-27-13H27V13H-27ZM-19-6H-4V6H-19M8-6H19M8 5H19",
  foldblade: "M-31-12-9-7 0 1 9-7 31-12 22 9 0 18-22 9ZM-16-1 0 8 16-1",
  curtain: "M-29 18V-17H29V18M-20-13V9L-9 14V-13M1-13V14L12 9V-13M22-13V16",
  cutanchor: "M-26-12-10-8-5-19 0-7 5-19 10-8 26-12 17 9 0 19-17 9ZM-14-1H14",
  hollow: "M-28-14H28L22 14 0 23-22 14ZM-14-6H14L11 6 0 11-11 6Z",
  misprint: "M-29-12H-4L2-5-9 5H-29ZM8-11H29V1H17L8 15H-4L8 2M-20 13H-8",
  unspool: "M-30-7Q-5-21 19-9L29 2 20 15Q-3 1-26 13L-30 2Q-4-11 22 4",
  padlock: "M-23-1V-11L-13-22 0-14 13-22 23-11V-1M-27-1H27V15L0 24-27 15ZM-5 4H5V14H-5Z",
  pressmat: "M-30 10-14-15 0-8 14-15 30 10H-30ZM-21 17H21M-11-3H11",
  deflector: "M-29-13 10-22 28-9 22 15-9 22-27 9ZM-17 11 18-13M-10 17 25-7",
  armorlane: "M-32-11H32L22 1H-22ZM-27 9H5L12 17 29 8M-11-18V17M13-17V3",
  sidestep: "M-30 7-17-14-5-8 0 4 17-9H30L17 12H4L-7-1-17 15ZM-24 20H-9",
  reverseScore: "M-31-13H31M-31 0H18M-31 13H31M-19-21-8-12-18-3M14-7 24 1 14 9",
  clearcut: "M-30-12-13-19 0-5 13-19 30-12 12 4 23 18 7 13 0 5-7 13-23 18-12 4Z",
  doubleRebuttal: "M-31-10-18-23 0-13 18-23 31-10 20 16 0 24-20 16ZM-16-5 0 7 16-5M-10 12H10",
  offbeat: "M-30-13H30M-30 2H30M-19-20V14H-6V-6H7V18H20V-19M-27 20H27",
  borrowScore: "M-30-7H-13L-5-18 4-12-3 3H-19ZM9-10H28L30 7 14 18 3 9ZM-13 14H3",
  blankbeat: "M-28-11-16-24H16L28-11V11L16 24H-16L-28 11ZM-13-8H13V8H-13Z",
  erasure: "M-34-13H34V-5H8L-2 5H-34ZM-34 8H-8L2-2H34V14H-34Z",
  antiphase: "M-31-9-16-25 3-20 21-24 32-6 22 17 0 26-23 16ZM-17-4 0-14 17-4 11 12H-11Z",
  scorelock: "M-31 17V-15L-19-25H19L31-15V17M-22 9V-11H22V9M-12 18V1H12V18M-3-8H3",
  scatterseals: "M-32 0-16-9-20-24-3-15 7-27 14-11 32-4 17 9 23 23 4 17-6 28-13 11Z",
}
const pose = (where: EdgePoint, axis: EdgePoint) => at(where) + " rotate(" + heading(axis) + ")"
const wardMotifs = new Set<SpellbreakerMotif>(["waveglass", "returnveil", "refraction", "hollow", "deflector", "doubleRebuttal", "antiphase"])

function EtchedForm({ view, where, scale = 1, angle = 0 }: { view: Shot; where: EdgePoint; scale?: number; angle?: number }) {
  return <g transform={at(where) + ` rotate(${angle}) scale(${scale})`}>
    <Plating d={forms[view.motif]} paint={view.paint} weight={3.2} fill={.64} />
  </g>
}

function Blade({ from, to, view, bend = 0, broad = 1 }: { from: EdgePoint; to: EdgePoint; view: Shot; bend?: number; broad?: number }) {
  const length = Math.max(34, edgeDistance(from, to))
  const q = ease(view.p)
  return <g transform={pose(from, direction(from, to))}>
    <path d={`M-8 0Q${length * .46} ${bend - 13 * broad} ${length + 10} -3L${length + 26} 0 ${length - 3} ${9 * broad}Q${length * .44} ${bend + 13 * broad} -8 0Z`}
      fill={view.paint.metal} fillOpacity={.27 * (1 - view.p)} stroke={view.paint.metal} strokeWidth={3.4} />
    <WardStroke d={`M4 0Q${length * .44} ${bend} ${length + 14 * q} 0`} color={view.paint.light} width={3.8 + broad} />
  </g>
}

function Splinters({ view, where, total = 4 }: { view: Shot; where: EdgePoint; total?: number }) {
  return <g transform={at(where)}>
    {Array.from({ length: total }, (_, i) => {
      const q = ease((view.p - i * .022) * 1.35)
      const angle = 37 + i * 360 / total
      return <path key={i} transform={`rotate(${angle + q * 17}) translate(${23 + 49 * q} 0)`}
        d={i % 2 ? "M-11-5 14-2 4 8Z" : "M-15-3 10-8 16 2-7 6Z"}
        fill={view.fx.rarity === "Prismatic" ? spectrum[i % spectrum.length] : view.paint.metal} fillOpacity=".24"
        stroke={view.paint.light} strokeWidth="2.6" />
    })}
  </g>
}

function Opening({ view }: { view: Shot }) {
  const { fx, motif, beat, paint, p } = view
  const q = ease(p)
  const circle = circlesOf(fx.area)[0]
  const strip = wardenStrip(fx.area?.parts[0])
  if (wardMotifs.has(motif)) return <g transform={at(fx.to)}>
    <path d={`M${-66 + 27 * q}-36L-41 27-13 48M${66 - 27 * q}-36L41 27 13 48`}
      stroke={paint.metal} strokeWidth="3.7" fill="none" />
    <EtchedForm view={view} where={{ x: 0, y: -60 + 17 * q }} scale={.7 + .27 * q} angle={(1 - q) * (motif === "antiphase" ? 66 : -24)} />
  </g>
  if (circle) return <g transform={at(circle.center)}>
    <circle r={circle.radius} stroke={paint.metal} strokeWidth="2" strokeOpacity=".5" strokeDasharray="5 10" fill="none" />
    <circle r={circle.radius * (1.26 - .26 * q)} stroke={paint.light} strokeWidth={motif === "blankbeat" ? 4 : 2.3}
      fill="none" opacity={.39 + .4 * q} />
    {motif === "rivets" ? [-1, 0, 1].map((side, i) => <path key={side}
      transform={`translate(${side * 39} ${-52 - 62 * (1 - ease(p - .055 * i))})`} d="M-7-42H7V-4L0 13-7-4Z"
      fill={paint.ink} stroke={paint.metal} strokeWidth="3" />)
      : <EtchedForm view={view} where={{ x: 0, y: -56 * (1 - q) }} scale={motif === "blankbeat" ? 1.5 + .8 * q : 1 + .5 * q} />}
    {["clearcut", "scatterseals"].includes(motif) && [0, 120, 240].map((angle, i) => <path key={angle}
      transform={`rotate(${angle + 30 * q})`} d={`M${circle.radius * .7} -6L${circle.radius * (1.1 - .25 * q)} 0 ${circle.radius * .7} 6`}
      fill="none" stroke={fx.rarity === "Prismatic" ? spectrum[i + 1] : paint.accent} strokeWidth="4" />)}
  </g>
  if (strip) return <g transform={pose(strip.from, direction(strip.from, strip.to))}>
    <path d={`M0 ${-strip.width / 2}H${strip.length}M0 ${strip.width / 2}H${strip.length}`}
      fill="none" stroke={paint.metal} strokeWidth="2.5" strokeDasharray="10 8" opacity=".65" />
    <path d={`M${strip.length * q} ${-strip.width / 2 - 8}V${strip.width / 2 + 8}`}
      stroke={paint.light} strokeWidth={motif === "erasure" ? 6 : 3.8} />
    <path d={`M0 0H${strip.length * q}`} stroke={paint.accent} strokeWidth="3.2" />
  </g>
  return <g transform={pose(fx.to, beat.axis)}>
    <path d={`M${-55 + 17 * q}-24H-22L-9-9M${-55 + 17 * q}24H-22L-9 9`}
      stroke={paint.metal} fill="none" strokeWidth="3.2" />
    <EtchedForm view={view} where={{ x: 20 - q * 17, y: -33 - 6 * q }} scale={.84 + .16 * q} angle={-38 * (1 - q)} />
    {beat.kind === "second" && <path d="M-33-13 12 13M-25-21 20 5" stroke={paint.light} strokeWidth="3" />}
  </g>
}

function Ward({ view }: { view: Shot }) {
  const { fx, motif, paint, p, beat } = view
  const q = ease(p)
  const struck = beat.cue === "ward"
  const angle = motif === "deflector" ? -25 : motif === "refraction" ? 31 : 0
  const plates = motif === "antiphase" ? 6 : motif === "doubleRebuttal" ? 2 : 1
  return <g transform={pose(fx.to, struck ? direction(fx.from, fx.to) : { x: 1, y: 0 })}>
    {Array.from({ length: plates }, (_, i) => {
      const tilt = motif === "antiphase" ? i * 60 + 30 : angle + i * 23
      const d = motif === "hollow" ? "M-43-38H43L37 27 0 48-37 27ZM-23-18H23L17 12 0 24-17 12Z"
        : motif === "waveglass" ? "M-42-34Q-6-18 39-35L31 26 0 45-31 26Z"
          : motif === "antiphase" ? "M-17-56 17-56 25-31 0-23-25-31Z"
            : "M-44-32-12-44 39-31 33 24 0 44-35 25Z"
      return <g key={i} transform={`rotate(${tilt}) scale(${.84 + .16 * q})`} opacity={plates === 2 ? .75 : 1}>
        <path d={d} fill={paint.ink} fillOpacity={motif === "antiphase" ? .6 : .13} fillRule="evenodd"
          stroke={fx.rarity === "Prismatic" ? spectrum[i % spectrum.length] : paint.metal} strokeWidth={struck ? 4.2 : 3} />
        {struck && (motif !== "antiphase" || i === 4) && <path d={motif === "antiphase"
          ? "M-11-48-2-42-8-34 4-29M-2-42 9-45" : `M-44 -17L${-16 + 12 * q} -4-32 11-9 24M-36-2-13 12`}
          fill="none" stroke={paint.light} strokeWidth="4.2" />}
      </g>
    })}
    {beat.kind === "break" && <Splinters view={view} where={{ x: 0, y: 0 }} total={5} />}
  </g>
}

function Cut({ view }: { view: Shot }) {
  const { fx, beat, motif, paint, p } = view
  const q = ease(p)
  const locations = beat.paths?.length ? beat.paths : [{ at: fx.to }]
  const circle = circlesOf(fx.area)[0]
  const strip = wardenStrip(fx.area?.parts[0])
  if (strip) {
    const wide = motif === "erasure"
    return <g transform={pose(strip.from, direction(strip.from, strip.to))}>
      <path d={`M-8 0L26 ${-strip.width / 2}H${strip.length - 9}L${strip.length + 16} 0 ${strip.length - 9} ${strip.width / 2}H26Z`}
        fill={paint.metal} fillOpacity={.13 + .12 * (1 - q)} stroke={paint.metal} strokeWidth={wide ? 4.3 : 3} />
      <WardStroke d={`M-12 0H${strip.length + 10}`} color={paint.light} width={wide ? 7 : 4.2} />
      {wide ? Array.from({ length: 6 }, (_, i) => <path key={i}
        d={`M${i * strip.length / 6} -10l${strip.length / 7} ${-23 - 20 * q}M${i * strip.length / 6} 10l${strip.length / 7} ${23 + 20 * q}`}
        stroke={spectrum[i % spectrum.length]} strokeWidth="3.6" fill="none" />)
        : motif === "unspool" ? <path d={`M0 17Q${strip.length * .3} ${-31 - 20 * q} ${strip.length * .6} 7T${strip.length} -17`}
          stroke={paint.accent} strokeWidth="4.5" fill="none" />
          : motif === "foldblade" ? <path d={`M0 -22L${strip.length * .5} ${21 * q} ${strip.length} -22M0 22L${strip.length * .5} ${-21 * q} ${strip.length} 22`}
            stroke={paint.accent} strokeWidth="3" fill="none" /> : null}
    </g>
  }
  if (circle) {
    const high = fx.rarity === "Prismatic"
    const radius = circle.radius
    return <g transform={at(circle.center)}>
      <circle r={radius} fill={paint.metal} fillOpacity={high ? .08 : .05} stroke={paint.metal} strokeWidth={high ? 4.6 : 3} />
      {motif === "blankbeat" ? <>
        {[0, 120, 240].map((angle, i) => {
          const outer = radius * (.91 + .08 * q)
          const inner = radius * (.59 + .19 * q)
          const end = polar(inner, 59), start = polar(inner, -29)
          const band = arc(outer, -39, 67) + `L${end.x} ${end.y}A${inner} ${inner} 0 0 0 ${start.x} ${start.y}Z`
          return <g key={angle} transform={`rotate(${angle + q * 18})`}>
            <path d={band} fill={spectrum[i + 1]} fillOpacity=".17" stroke={spectrum[i + 1]} strokeWidth="3.6" />
            <WardStroke d={arc(outer, -39, 67)} color={paint.light} width={4.2} />
            <path d={path([polar(inner, 1), polar(outer, 13)])} stroke={paint.light} strokeWidth="2.3" />
          </g>
        })}
        <g transform={`rotate(${-24 - 18 * q}) scale(${1 + .45 * q})`} opacity={1 - .6 * q}>
          <path d="M-58 0-18-10 0-53 12-15 58 0 17 11 0 54-12 16Z" fill={paint.light} fillOpacity=".13" stroke={paint.light} strokeWidth="3.4" />
          <path d="M-46 0H46M0-40V40" stroke={paint.light} strokeWidth="4" />
        </g>
      </> : motif === "rivets" ? [-1, 0, 1].map((side, i) => <g key={side} transform={`translate(${side * 41} ${i % 2 ? -24 : 10})`}>
        <path d={`M-6 ${-43 + 26 * q}H6V12L0 21-6 12Z`} fill={paint.ink} stroke={paint.light} strokeWidth="3.4" />
        <ellipse rx={17 + q * 15} ry={9 + 5 * q} cy="20" fill="none" stroke={paint.accent} strokeWidth="2.6" />
      </g>) : motif === "pressmat" ? <>
        <path d={`M${-radius * .77} -18L0 -52 ${radius * .77} -18 0 48Z`} fill={paint.ink} fillOpacity=".49" stroke={paint.metal} strokeWidth="4.2" />
        <WardStroke d={`M${-radius * .7} 4L0 62 ${radius * .7} 4`} color={paint.light} width={4.2} />
      </> : motif === "clearcut" ? [27, -63].map((angle) => <g key={angle} transform={`rotate(${angle})`}>
        <path d={`M${-radius} -5Q0 ${-49 * (1 - q)} ${radius} 0Q0 28 ${-radius} -5`}
          fill={paint.metal} fillOpacity=".21" stroke={paint.light} strokeWidth="4" />
      </g>) : motif === "scatterseals" ? [0, 72, 144, 216, 288].map((angle, i) => <g key={angle} transform={`rotate(${angle})`}>
        <path d={`M0 0L${radius * .8} -15 ${radius} 0 ${radius * .55} 18Z`}
          fill={spectrum[i]} fillOpacity=".17" stroke={spectrum[i]} strokeWidth="3.9" />
      </g>) : <path d={`M${-radius * .7} 0L0 ${-radius * .65} ${radius * .7} 0 0 ${radius * .65}Z`}
        fill="none" stroke={paint.light} strokeWidth="3.4" transform={`rotate(${q * 22})`} />}
    </g>
  }
  return <>{locations.map(({ at: target, end }, i) => <g key={i}>
    {motif === "pinpoint" ? <g transform={at(target)}>
      {[0, 90, 180, 270].map(angle => <path key={angle} transform={`rotate(${angle})`}
        d={`M${17 + q * 16} -4L${46 + q * 8} 0 ${17 + q * 16} 4Z`} fill={paint.light} />)}
      <circle r={9 + 23 * q} fill="none" stroke={paint.accent} strokeWidth="2.2" />
    </g> : motif === "chisel" || motif === "etch" ? <g transform={at(target)}>
      <path d={arc(48, -116, -33) + arc(48, -11, 73) + arc(48, 102, 187)} fill="none" stroke={paint.metal} strokeWidth="4.4" />
      <path d="M-31-26 29 21M-21-33 35 10" stroke={paint.light} strokeWidth="3" />
    </g> : <Blade view={view} from={along(target, left(beat.axis), -51)} to={along(target, left(beat.axis), 51)}
      bend={motif === "sidestep" ? 24 : motif === "sunderchant" ? -31 : 0} broad={motif === "shieldpick" ? .75 : 1} />}
    {end && <path d={path([target, end])} fill="none" stroke={paint.accent} strokeWidth="3.1" strokeDasharray="7 6" />}
  </g>)}</>
}

function Interrupt({ view }: { view: Shot }) {
  const { fx, beat, paint, p } = view
  const q = ease(p)
  return <g transform={pose(fx.to, left(beat.axis))}>
    <WardStroke d={`M-68 ${-7 - q * 21}L-14 -4M14 4L68 ${7 + q * 21}`} color={paint.light} width={4.7} />
    <path d={`M-30-30 5 18M-8-29 30 29`} stroke={paint.metal} strokeWidth="4.5" />
    {[0, 1, 2].map(i => <path key={i} d={`M${-49 - i * 18} -9v-11M${49 + i * 18} 9v11`}
      stroke={paint.accent} strokeWidth="3" opacity={1 - q} />)}
  </g>
}

function Removal({ view }: { view: Shot }) {
  const { fx, beat, paint, p } = view
  const q = ease(p)
  if (beat.cue === "erase") return <>{beat.fragments?.map((area, i) => <g key={i}>
    <path d={areaPath(area)} fill="none" stroke={paint.metal} strokeOpacity={.68 * (1 - q)}
      strokeWidth="2.8" strokeDasharray="8 6" />
    {area.parts.flatMap((part, partIndex) => {
      const center = part.kind === "circle" ? part.center : area.center
      const points = part.kind === "circle" ? Array.from({ length: 6 }, (_, j) => {
        const radial = polar(part.radius, j * 60)
        return { x: center.x + radial.x, y: center.y + radial.y }
      }) : part.points
      return points.map((corner, j) => {
        const next = points[(j + 1) % points.length]
        const pivot = { x: (center.x + corner.x + next.x) / 3, y: (center.y + corner.y + next.y) / 3 }
        const alongBlast = direction(fx.to, pivot)
        const destination = along(pivot, alongBlast, 18 * q)
        const local = [center, corner, next].map(point => ({ x: point.x - pivot.x, y: point.y - pivot.y }))
        const tint = fx.rarity === "Prismatic" ? spectrum[(i + j) % spectrum.length] : paint.metal
        return <g key={partIndex + "-" + j} transform={at(destination) +
          ` rotate(${(j % 2 ? -1 : 1) * (12 + 54 * q)}) scale(${1 - .74 * q} ${1 - .45 * q})`}>
          <path d={path(local) + "Z"} fill={tint} fillOpacity=".28" stroke={tint} strokeWidth="3.4" />
          <path d={path([local[1], local[2]])} stroke={paint.light} strokeWidth="2.7" />
        </g>
      })
    })}
  </g>)}</>
  return <g transform={at(fx.to)}>
    <path d={`M-27 -29Q2 ${-51 - 27 * q} ${29 + 38 * q} ${-23 - 30 * q}L${20 + 36 * q} ${-10 - 26 * q}Q0 -20-27-29Z`}
      fill={paint.metal} fillOpacity=".25" stroke={paint.light} strokeWidth="3" />
    <Splinters view={view} where={{ x: 0, y: 0 }} total={beat.cue === "strip" ? 4 : 3} />
  </g>
}

function Trigger({ view }: { view: Shot }) {
  const { fx, beat, paint, motif, p } = view
  const q = ease(p)
  if (beat.cue === "retort") return <>
    <Blade view={view} from={fx.from} to={fx.to} bend={motif === "refraction" ? -34 : motif === "doubleRebuttal" ? 26 : 0}
      broad={motif === "antiphase" ? 1.35 : .75} />
    {motif === "doubleRebuttal" && <path transform={at(fx.to)} d={arc(24 + 41 * q, -38, 216)} fill="none" stroke={paint.accent} strokeWidth="3.8" />}
    {beat.paths?.map(({ at: start, end }, i) => end && <path key={i} d={path([start, end])} stroke={paint.light} strokeWidth="4" strokeDasharray="9 5" />)}
  </>
  if (beat.cue === "delay") return <g transform={at(fx.to)}>
    <path d="M-69-53H69M-69-39H69" stroke={paint.metal} strokeWidth="2.6" />
    {[-2, -1, 0, 1, 2].map(i => <path key={i} transform={`translate(${i * 24 + 15 * q} -46)`}
      d="M-6-12H6V12H-6Z" fill={paint.ink} stroke={i === 0 ? paint.light : paint.accent} strokeWidth={i === 0 ? 3.8 : 2.4} />)}
    <EtchedForm view={view} where={{ x: 0, y: -47 }} scale={.81} angle={motif === "padlock" ? -20 * (1 - q) : 0} />
  </g>
  if (beat.kind === "short") return <>{beat.paths?.map(({ at: from, end }, i) => end && <g key={i}>
    {beat.other && <path d={path([end, beat.other])} stroke={paint.metal} strokeOpacity=".5" strokeWidth="2.3" strokeDasharray="6 7" />}
    <Blade view={view} from={from} to={end} broad={.65} />
    <path transform={pose(end, direction(from, end))} d="M-9-20 7-6-6 7 9 20" stroke={paint.light} strokeWidth="4.4" fill="none" />
  </g>)}</>
  return <g transform={at(fx.to)}>
    <EtchedForm view={view} where={{ x: 29, y: -47 - 8 * q }} scale={.95} angle={motif === "blademark" ? 31 * q : -15 * q} />
    {motif === "offbeat" || motif === "cutoff" ? <path d={arc(50 + 8 * q, 15, 153) + arc(50 + 8 * q, 193, 319)}
      fill="none" stroke={paint.metal} strokeWidth="3.5" strokeDasharray="6 5" /> : null}
  </g>
}

export function EdgeSpellbreakerEffects({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden>{battle.runtime.effects.map((fx) => {
    const beat = fx.spellbreaker
    const art = beat && spellbreakerChoreography(fx.skill)
    if (!beat || !art || battle.time < fx.start || battle.time >= fx.end) return null
    const p = unit((battle.time - fx.start) / (fx.end - fx.start))
    const view = { fx, beat, motif: art.motif, paint: inks[fx.rarity], p }
    const cue = beat.cue
    const front = ["shield", "ward", "arm", "delay", "release"].includes(cue)
    if ((layer === "front") !== front) return null
    return <g key={fx.id} data-spellbreaker-skill={fx.skill} data-spellbreaker-cue={cue}
      opacity={cue === "prepare" || cue === "travel" ? 1 : (1 - unit((p - .3) / .7)) ** 1.1}>
      {cue === "prepare" ? <Opening view={view} /> : cue === "strike" ? <Cut view={view} />
        : cue === "shield" || cue === "ward" ? <Ward view={view} />
          : cue === "interrupt" ? <Interrupt view={view} />
            : cue === "strip" || cue === "remove" || cue === "erase" ? <Removal view={view} />
              : cue === "travel" ? <g>
                <path d={path([fx.from, fx.to])} fill="none" stroke={view.paint.metal} strokeWidth="21" strokeOpacity=".14" />
                <Blade view={view} from={fx.from} to={mix(fx.from, fx.to, ease(p))} broad={.7} />
              </g>
                : cue === "arrival" ? <Splinters view={view} where={fx.to} total={3} />
                  : cue === "deploy" ? fx.area && <path d={areaPath(fx.area)} fill={view.paint.metal} fillOpacity=".07" stroke={view.paint.light} strokeWidth="3.8" />
                    : <Trigger view={view} />}
    </g>
  })}{layer === "front" && <Readiness battle={battle} />}</g>
}

function Readiness({ battle }: { battle: EdgeBattle }) {
  if (battle.finishedAt !== null) return null
  const active = [
    ...battle.runtime.buffs.filter(buff => buff.until > battle.time).map(buff => ({ cast: buff.cast, target: buff.target, until: buff.until })),
    ...battle.runtime.watches.filter(watch => watch.until > battle.time && watch.uses > 0).map(watch => ({ cast: watch.cast, target: watch.target, until: watch.until })),
  ]
  for (const [target, cast] of battle.runtime.shieldCasts) {
    const unit = unitOf(battle, target)
    if (unit?.shield && unit.shieldUntil > battle.time) active.push({ cast, target, until: unit.shieldUntil })
  }
  const seen = new Set<string>()
  return <>{active.map(({ cast, target, until }) => {
    const art = !cast.signature && spellbreakerChoreography(cast.skill?.id)
    const wearer = unitOf(battle, target)
    const owner = battleFighters(battle).find(unit => unit.id === cast.owner)
    const key = cast.id + "/" + target
    if (!art || !owner || !wearer?.hp || seen.has(key)) return null
    seen.add(key)
    const offset = [...seen].filter(id => id.endsWith("/" + target)).length - 1
    return <g key={key} data-spellbreaker-ready={cast.skill!.id} transform={`translate(${wearer.x + 47} ${wearer.y - 35 - 23 * offset}) scale(.57)`}
      opacity={.84 * unit((until - battle.time) / .3)}>
      <Plating d={forms[art.motif]} paint={inks[owner.card.rarity]} weight={3.7} fill={.76} />
    </g>
  })}</>
}

export function EdgeSpellbreakerField({ field, battle }: { field: FieldEffect; battle: EdgeBattle }) {
  const art = spellbreakerChoreography(field.cast.skill?.id)
  const owner = battleFighters(battle).find(unit => unit.id === field.cast.owner)
  if (!art || !owner) return null
  const paint = inks[owner.card.rarity]
  const age = battle.time - field.time
  const opacity = Math.min(ease(age / .2), unit((field.until - battle.time) / .3))
  const strip = wardenStrip(field.area.parts[0])
  const circle = circlesOf(field.area)[0]
  return <g data-spellbreaker-field={field.cast.skill!.id} opacity={opacity}>
    {strip && <g transform={pose(strip.from, direction(strip.from, strip.to))}>
      <path d={`M0 ${-strip.width / 2}H${strip.length}V${strip.width / 2}H0Z`}
        fill={paint.metal} fillOpacity=".10" stroke={paint.metal} strokeWidth="2.8" />
      {[.12, .35, .58, .81].map((where, i) => <path key={where}
        d={`M${strip.length * where} ${-strip.width / 2}l16 14v${strip.width - 28}l-16 14`}
        fill="none" stroke={paint.accent} strokeWidth="3.3" opacity={.47 + .14 * Math.cos(age * 3 - i)} />)}
    </g>}
    {circle && <g transform={at(circle.center)}>
      <circle r={circle.radius} fill={paint.metal} fillOpacity=".055" stroke={paint.metal} strokeWidth="3" strokeDasharray="13 8" />
      {Array.from({ length: art.motif === "scorelock" ? 8 : 6 }, (_, i) => <g key={i}
        transform={`rotate(${i * (art.motif === "scorelock" ? 45 : 60)}) translate(${circle.radius - 13} 0)`}>
        <path d={art.motif === "scorelock" ? "M-6-16H9V16H-6M-13-9H-6M-13 9H-6" : "M-7-14H7V14H-7Z"}
          fill={paint.ink} stroke={art.motif === "scorelock" ? spectrum[i % spectrum.length] : paint.accent} strokeWidth="2.5" />
      </g>)}
    </g>}
  </g>
}
