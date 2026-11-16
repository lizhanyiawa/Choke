import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint, EdgeUnit } from "./edgeBattle"
import { arc, at, circlesOf, ease, heading, mix, path, polar, spectrum, unit } from "./EdgeBulwarkFields"
import { along, areaHits, areaPath, direction, edgeDistance, isOutside, left, movingOutward, outward, type EdgeArea } from "./edgeSkills/geometry"
import { binderChoreography, type BinderMotif } from "./edgeSkills/binderChoreo"
import type { SkillVisual } from "./edgeSkills/presentation"
import { battleFighters, battleUnits, unitOf, type FieldEffect, type SkillCast } from "./edgeSkills/state"

const paints = {
  C: { core: "#f3fbff", cord: "#bad5ec", edge: "#aac7ed", ink: "#2b354e" },
  UC: { core: "#eafaff", cord: "#7ed9ff", edge: "#b6b8ff", ink: "#23375a" },
  R: { core: "#eef5ff", cord: "#a0acff", edge: "#8de9fb", ink: "#272d58" },
  E: { core: "#fdf3ff", cord: "#d3a8ff", edge: "#a9d7ff", ink: "#352451" },
  L: { core: "#fff7d8", cord: "#ffc879", edge: "#f9a5b2", ink: "#4c2c33" },
  Radiant: { core: "#fff5ff", cord: "#ffa9dd", edge: "#b0e9ff", ink: "#4d244c" },
  Prismatic: { core: "#fffaf1", cord: "#e7b9ff", edge: "#9ce8ff", ink: "#392448" },
} satisfies Record<Rarity, { core: string; cord: string; edge: string; ink: string }>
type Paint = (typeof paints)[Rarity]
type Stage = "prepare" | "strike" | "hold"
type BinderFx = SkillVisual & { binder: NonNullable<SkillVisual["binder"]> }

const center = { x: 0, y: 0 }
const sequence = (n: number) => Array.from({ length: n }, (_, i) => i)
const pose = (p: EdgePoint, angle = 0, size = 1) => at(p) + ` rotate(${angle}) scale(${size})`
const diamond = (w: number, h: number) => `M${-w} 0L0 ${-h} ${w} 0 0 ${h}Z`
const rise = (t: number) => .22 + .78 * ease(t)

function Frame({ area, paint, stage }: { area: EdgeArea; paint: Paint; stage: Stage }) {
  return <g strokeLinejoin="round">
    {area.parts.map((part, i) => <path key={i} d={areaPath({ center: area.center, parts: [part] })}
      fill={paint.ink} fillOpacity={stage === "hold" ? .12 : .24} stroke={paint.cord}
      strokeOpacity={stage === "hold" ? .45 : .82} strokeWidth={stage === "prepare" ? 2 : 3.3}
      strokeDasharray={stage === "prepare" ? "12 10" : undefined} />)}
  </g>
}

function Pin({ where = center, paint, angle = 0, size = 1 }: { where?: EdgePoint; paint: Paint; angle?: number; size?: number }) {
  return <g transform={pose(where, angle, size)}>
    <path d="M-13 2-6-9H7L13 2 0 16Z" fill={paint.ink} stroke={paint.cord} strokeWidth="2.9" />
    <path d="M-7 2H7M0-8V9" stroke={paint.core} strokeWidth="1.8" strokeLinecap="round" />
  </g>
}

function Foot({ where, paint, angle, size = 1, weak = false }: { where: EdgePoint; paint: Paint; angle: number; size?: number; weak?: boolean }) {
  return <g transform={pose(where, angle, size)} stroke={weak ? paint.edge : paint.core} strokeWidth="2" fill={paint.ink}>
    <path d="M-10-9Q-13-16-4-20L4-18 5-7-4 1H-9Z" />
    <path d="M7 4Q8-6 16-3L19 3 18 15 7 20 3 13Z" />
  </g>
}

function TickRail({ length, width, t, paint }: { length: number; width: number; t: number; paint: Paint }) {
  return <g fill="none" strokeLinecap="round">
    {sequence(10).map(i => {
      const x = length * (.06 + i * .095)
      return <path key={i} d={`M${x} ${-width / 2 + 2}v${6 + (i % 3) * 3}m0 ${width - 19 - (i % 3) * 3}v8`}
        stroke={paint.edge} strokeWidth={i % 3 === 0 ? 2.5 : 1.3} opacity={t * .8} />
    })}
  </g>
}

function LanePattern({ motif, area, paint, t, stage }: { motif: BinderMotif; area: EdgeArea; paint: Paint; t: number; stage: Stage }) {
  const part = area.parts[0]
  if (part?.kind !== "polygon" || part.points.length !== 4) return null
  const [a, b, c, d] = part.points
  const from = mix(a, d, .5), to = mix(b, c, .5), length = edgeDistance(from, to), width = edgeDistance(a, d), h = width / 2
  const axis = direction(from, to)
  const q = stage === "prepare" ? rise(t) : 1
  const transform = pose(from, heading(axis))
  return <g transform={transform} fill="none" strokeLinecap="round" strokeLinejoin="round">
    {motif === "zipLine" && <>
      <path d={`M3 ${-h * .83}L${length * q} ${-h * .83}M3 ${h * .83}L${length * q} ${h * .83}M0 0H${length}`}
        stroke={paint.cord} strokeWidth="3" strokeDasharray="13 8" />
      {sequence(8).map(i => <path key={i} d={`M${i * length / 8 + 10} ${-h * .87}l15 ${h * .87} -15 ${h * .87}`}
        stroke={paint.core} strokeWidth="2.7" opacity={unit(q * 8 - i)} />)}
    </>}
    {motif === "shear" && <>
      <path d={`M0 ${-h * .55}Q${length * .30} ${h * .73} ${length * .56} ${-h * .47}T${length} 0`}
        stroke={paint.ink} strokeWidth="19" opacity=".65" />
      <path d={`M0 ${-h * .55}Q${length * .30} ${h * .73} ${length * .56} ${-h * .47}T${length} 0`}
        stroke={paint.edge} strokeWidth="4" strokeDasharray={`${length * q} ${length}`} />
      <path d={`M${length * .21} ${h * .65}L${length * .46} ${-h * .38}M${length * .53} ${h * .67}L${length * .72} ${-h * .39}`}
        stroke={paint.core} strokeWidth="2.3" opacity=".82" />
    </>}
    {motif === "paperFold" && <>
      <path d={`M0 ${-h * .96}L${length * .48} 0 ${length} ${-h * .96}L${length * .48} ${-h * .48}ZM0 ${h * .96}L${length * .48} 0 ${length} ${h * .96}L${length * .48} ${h * .48}Z`}
        fill={paint.cord} fillOpacity={.10 + .15 * q} stroke={paint.edge} strokeWidth="2.1" />
      <path d={`M0 0H${length * q}`} stroke={paint.core} strokeWidth="4" strokeDasharray="19 5 6 5" />
    </>}
    {motif === "inwardRail" && <>
      <path d={`M6 ${-h * .78}H${length * q}M6 ${h * .78}H${length * q}`} stroke={paint.cord} strokeWidth="3.1" />
      {sequence(6).map(i => <g key={i} transform={`translate(${length * (.08 + i * .15)} 0)`} opacity={unit(q * 6 - i)}>
        <path d={`M0 ${-h * .70}l18 ${h * .7} -18 ${h * .7}m26 ${-h * 1.4}-18 ${h * .7} 18 ${h * .7}`}
          stroke={i % 2 ? paint.edge : paint.core} strokeWidth="2.8" />
      </g>)}
    </>}
    {motif === "foldPlate" && sequence(7).map(i => {
      const x = length * (.03 + i * .14), lift = stage === "prepare" ? unit(q * 7 - i) : 1
      return <g key={i} transform={`translate(${x} 0) scale(1 ${.25 + .75 * lift})`}>
        <path d={`M0 ${h * .80}L${length * .095} ${h * .88} ${length * .14} ${-h * .84} ${length * .042} ${-h * .90}Z`}
          fill={paint.cord} fillOpacity=".21" stroke={i % 2 ? paint.edge : paint.cord} strokeWidth="2.6" />
        <path d={`M10 ${h * .18}L${length * .071} ${-h * .55}`} stroke={paint.core} strokeWidth="2.7" />
      </g>
    })}
    {motif === "pressurePin" && <>
      <TickRail length={length} width={width} paint={paint} t={q} />
      {stage === "strike" && <path d={`M0 ${-h * .83}L${length} 0 0 ${h * .83} ${length * .24} 0Z`}
        fill={paint.cord} fillOpacity={.27 + .24 * (1 - t)} stroke={paint.edge} strokeWidth="3.2" />}
      <path d={`M0 ${-h * .66}L${length * q} 0 0 ${h * .66}`}
        stroke={paint.cord} strokeWidth="13" opacity={stage === "strike" ? .31 : .13} />
      <path d={`M0 ${-h * .62}L${length * q} 0 0 ${h * .62}M0 0H${length * q}`}
        stroke={paint.core} strokeWidth={stage === "strike" ? 5.2 : 2.6} />
      <Pin where={{ x: length * q, y: 0 }} angle={-90} paint={paint} size={1.28} />
    </>}
  </g>
}

function Funnel({ r, t, paint, stage, polarity = 1 }: { r: number; t: number; paint: Paint; stage: Stage; polarity?: number }) {
  const collapse = stage === "strike" ? 1 - ease(t) : stage === "prepare" ? 1 - .68 * ease(t) : 1
  return <g transform={`rotate(${-12 * polarity})`}>
    {sequence(6).map(i => {
      const span = r * (.13 + .128 * i + .055 * collapse)
      return <ellipse key={i} cy={(i - 2.8) * (stage === "hold" ? 5 : 8) * polarity}
        rx={span} ry={span * (.47 + i * .047)} fill={i === 0 ? paint.ink : "none"}
        stroke={spectrum[i % spectrum.length]} strokeWidth={i === 0 ? 3.9 : 2.4} opacity={stage === "hold" ? .43 : .82} />
    })}
    <path d={`M${-r * .76} ${r * .25}Q${-r * .33} ${r * .53} 0 0T${r * .74} ${-r * .28}`}
      fill="none" stroke={paint.core} strokeWidth="2.7" opacity=".72" />
    <path d={diamond(r * .10, r * .06)} fill={paint.core} />
  </g>
}

function FacetedWell({ r, paint, t, stage, polarity }: { r: number; paint: Paint; t: number; stage: Stage; polarity: number }) {
  const q = stage === "prepare" ? .68 + .32 * rise(t) : 1
  return <g transform={`rotate(${polarity * (16 + 28 * t)}) scale(${q} ${.82 + .18 * q})`}>
    {sequence(6).map(i => {
      const angle = i * 60
      const outer = polar(r * .84, angle), next = polar(r * .84, angle + 60)
      const inset = polar(r * .24, angle + 12 * polarity), insetNext = polar(r * .24, angle + 60 + 12 * polarity)
      return <path key={i} d={path([outer, next, insetNext, inset]) + "Z"}
        fill={spectrum[(i + (polarity > 0 ? 0 : 2)) % spectrum.length]} fillOpacity={i % 2 ? .29 : .14}
        stroke={i % 2 ? paint.core : paint.edge} strokeWidth={i % 2 ? 2.5 : 2} />
    })}
    <path d={diamond(r * .13, r * .30)} fill={paint.ink} stroke={paint.core} strokeWidth="3.2" />
    <path d={diamond(r * .05, r * .16)} fill={paint.core} opacity={stage === "strike" ? 1 : .59} />
  </g>
}

function RingPattern({ motif, area, paint, t, stage, kind, from }: {
  motif: BinderMotif; area: EdgeArea; paint: Paint; t: number; stage: Stage; kind?: string; from: EdgePoint
}) {
  return circlesOf(area).map(({ center: where, radius: r }, index) => {
    const q = stage === "prepare" ? rise(t) : 1
    let pattern
    switch (motif) {
      case "iceTiles":
        pattern = <g transform={`scale(${q})`} stroke={paint.core} strokeWidth="1.8">
          <path d={path([polar(r * .88, -106), polar(r * .91, 20), polar(r * .86, 144)]) + "Z"}
            fill={paint.cord} fillOpacity=".18" />
          <path d={path([polar(r * .86, -46), polar(r * .94, 78), polar(r * .77, 201)]) + "Z"}
            fill={paint.edge} fillOpacity=".11" strokeDasharray="12 4" />
          <path d={`M${-r * .62} ${-r * .24}Q0 ${r * .19} ${r * .62} ${-r * .08}M${-r * .18} ${r * .58} ${r * .07} ${-r * .64}`} fill="none" />
        </g>
        break
      case "printLock":
        pattern = <>{[0, 1, 2, 3].map(i => {
          const a = i * 90 + 26
          return <g key={i} transform={pose(polar(r * (.72 + (1 - q) * .16), a), a + 90, r / 100)}>
            <path d="M-22 3-13-14-2-12 0 2 9-13 22-10 18 6 3 20Z" fill={paint.ink} stroke={paint.cord} strokeWidth="3" />
          </g>
        })}<Foot where={center} angle={-16} paint={paint} size={.8} weak /></>
        break
      case "mistPane":
        pattern = sequence(6).map(i => <g key={i} transform={`rotate(${i * 60 + t * 18}) scale(${q})`}>
          <path d={path([polar(r * .22, -13), polar(r * .95, -26), polar(r * .91, 21), polar(r * .56, 13)]) + "Z"}
            fill={i % 2 ? paint.edge : paint.cord} fillOpacity={i % 2 ? ".18" : ".28"} stroke={paint.core}
            strokeOpacity=".56" strokeWidth="2.0" />
        </g>)
        break
      case "windSpool":
        pattern = sequence(4).map(i => <g key={i} transform={`rotate(${i * 90 - t * 64})`} strokeLinecap="round">
          <path d={`M${r * .92} ${-r * .19}Q${r * .69} ${-r * .69} ${r * .39} ${-r * .28}T${r * .14} 0`}
            fill="none" stroke={paint.edge} strokeWidth="4" opacity=".73" />
          <path d={`M${r * .33} ${-r * .03}L${r * .14} 0 ${r * .29} ${r * .14}`}
            fill="none" stroke={paint.core} strokeWidth="2.7" />
          <path d={arc(r * (.54 + .24 * q), -43, 4)} fill="none" stroke={paint.cord} strokeWidth="2" />
        </g>)
        break
      case "burstWheel":
        pattern = sequence(4).map(i => <g key={i} transform={`rotate(${i * 90 + 16 + t * 76}) scale(${.53 + (stage === "strike" ? ease(t) : q) * .47})`}>
          <path d={`M${r * .15} ${-r * .17}Q${r * .51} ${-r * .49} ${r * .91} ${-r * .24}L${r * .72} ${r * .29}Q${r * .48} ${r * .42} ${r * .40} 0Z`}
            fill={paint.cord} fillOpacity=".34" stroke={paint.core} strokeWidth="2.8" />
          <path d={`M${r * .44} ${-r * .17}Q${r * .71} ${-r * .30} ${r * .87} ${-r * .12}M${r * .63} ${r * .16}L${r * .85} ${r * .02}`}
            fill="none" stroke={paint.edge} strokeWidth="3.4" />
        </g>)
        break
      case "splitReins":
        pattern = [-1, 1].map(side => <g key={side} transform={`scale(${side} 1)`}>
          <path d={`M0 ${-r * .48}Q${r * .81} ${-r * .71} ${r * .76} ${r * .12}Q${r * .51} ${r * .61} 0 ${r * .19}`}
            stroke={side > 0 ? paint.core : paint.edge} fill="none" strokeWidth="4" opacity={q * .78} />
          <Pin where={{ x: r * .40, y: 0 }} paint={paint} angle={side * 90} />
        </g>)
        break
      case "lostStep":
      case "turnstile":
        pattern = sequence(8).map(i => {
          const angle = i * 45 + (motif === "turnstile" ? 7 : 22)
          return motif === "lostStep"
            ? <Foot key={i} where={polar(r * .86, angle)} paint={paint} angle={angle + 69} size={.64} weak={i % 2 === 0} />
            : <g key={i} transform={pose(polar(r * .88, angle), angle + 90, .76 + q * .24)}>
              <path d="M-22-7-16-19H16L22-7V10H12V-3H-12V10H-22Z" fill={paint.ink}
                stroke={paint.cord} strokeWidth="2.3" />
              <path d="M-14-12H14" stroke={paint.core} strokeWidth="2.4" />
            </g>
        })
        break
      case "iceJaws":
        pattern = [-1, 1].map(side => <g key={side} transform={`translate(${side * r * (.84 - .51 * q)} 0) scale(${side} 1)`}>
          <path d={`M${r * .27} ${-r * .59}L0 ${-r * .42} ${-r * .23} ${-r * .32} 0 ${-r * .20} ${-r * .23} 0 0 ${r * .21} ${-r * .20} ${r * .30} 0 ${r * .45} ${r * .27} ${r * .59}Z`}
            fill={paint.cord} fillOpacity=".32" stroke={paint.core} strokeWidth="3.2" />
          <path d={`M${r * .16} ${-r * .38}V${r * .42}`} stroke={paint.edge} strokeWidth="2.3" />
        </g>)
        break
      case "shadowPlate":
        pattern = <>
          <path d={diamond(r * .50, r * .46)} fill={paint.ink} fillOpacity=".53" stroke={paint.cord} strokeWidth="3" />
          {sequence(10).map(i => <path key={i} d={arc(r * .83, i * 36 + 2, i * 36 + 26)}
            stroke={i < Math.ceil(q * 10) ? paint.core : paint.cord} strokeWidth={i < q * 10 ? 5 : 2} opacity=".74" fill="none" />)}
          <Pin paint={paint} where={{ x: 0, y: -8 }} angle={0} size={1.15} />
        </>
        break
      case "oldAnchor":
        pattern = <>
          <path d={arc(r * .67, 19, 148) + arc(r * .67, 200, 325)} fill="none" stroke={paint.edge} strokeWidth="2.7" strokeDasharray="16 9" />
          <path d={`M0 ${-r * .31}v${r * .63}M${-r * .21} 0h${r * .42}`} stroke={paint.cord} strokeWidth="2.4" />
          <Pin paint={paint} size={1.3 + .1 * q} />
        </>
        break
      case "sinkBasin":
        pattern = <>
          {[.92, .69, .46].map((s, i) => <ellipse key={s} rx={r * s * q} ry={r * s * .64 * q} cy={i * 8}
            fill={i === 2 ? paint.ink : "none"} fillOpacity=".48" stroke={i === 2 ? paint.core : paint.cord} strokeWidth={i === 2 ? 4 : 2.5} />)}
          <path d={diamond(r * .16, r * .12)} fill={paint.core} opacity={q * .8} transform="translate(0 15)" />
        </>
        break
      case "crossWind":
      case "windExchange":
        pattern = [-1, 1].map(side => <g key={side} transform={`rotate(${side * (motif === "crossWind" ? 21 : 36)}) scale(1 ${side})`}>
          <path d={`M${-r * .91} 0Q${-r * .52} ${-r * .45} 0 ${-r * .28}T${r * .89} 0Q${r * .39} ${-r * .11} 0 ${-r * .08}T${-r * .91} 0Z`}
            fill={side > 0 ? paint.cord : paint.edge} fillOpacity=".28" stroke={side > 0 ? paint.cord : paint.edge}
            strokeWidth="2.5" strokeDasharray={stage === "hold" ? "29 8" : undefined} strokeDashoffset={t * side * 75} />
        </g>)
        break
      case "pivotGear":
        pattern = <g transform={`rotate(${stage === "hold" ? 0 : 25 * q})`}>
          <path d={path(sequence(48).map(i => polar(r * (i % 4 < 2 ? .89 : .78), i * 7.5))) + "Z"}
            fill={paint.ink} fillOpacity=".33" stroke={paint.cord} strokeWidth="3.4" />
          {sequence(8).map(i => <path key={i} d="M-6-16 0-28 6-16M0-28V-78" transform={`rotate(${i * 45}) scale(${r / 123})`}
            fill="none" stroke={paint.edge} strokeWidth="2.4" opacity=".7" />)}
          <Pin paint={paint} size={1.3} />
        </g>
        break
      case "slantTide":
        pattern = sequence(3).map(i => <g key={i} transform={`rotate(${i * 120 + 34 + t * 38})`}>
          <path d={`M${r * .16} 0Q${r * .76} ${-r * .84} ${r * .83} ${r * .15}Q${r * .48} ${-r * .20} ${r * .16} 0Z`}
            fill={i % 2 ? paint.edge : paint.cord} fillOpacity=".25" stroke={i % 2 ? paint.edge : paint.core} strokeWidth="2.8" />
        </g>)
        break
      case "gravityDisk":
        pattern = <Funnel r={r} t={t} stage={stage} paint={paint} polarity={index ? -1 : 1} />
        break
      case "binaryWell":
        pattern = <FacetedWell r={r} paint={paint} t={t} stage={stage} polarity={index ? -1 : 1} />
        break
      case "inverseField":
        pattern = sequence(4).map(i => <g key={i} transform={`rotate(${i * 90 + 34}) translate(${r * .60} 0) scale(${q})`}>
          <path d={`M${-r * .22} 0 0 ${-r * .46} ${r * .23} 0 0 ${r * .46}Z`}
            fill={spectrum[i]} fillOpacity=".28" stroke={paint.core} strokeWidth="3.4" />
          <path d={`M0 ${-r * .40}V${r * .40}M${-r * .18} 0H${r * .18}`} stroke={spectrum[(i + 2) % 4]} strokeWidth="2.8" />
        </g>)
        break
      case "retreatSeal":
        pattern = <>
          <path d={arc(r * .78, 16, 164)} fill="none" stroke={paint.edge} strokeWidth="12" strokeDasharray="16 8" opacity=".54" />
          <path d={arc(r * .78, 196, 344)} fill="none" stroke={paint.cord} strokeWidth="9" />
          <path d={`M${-r * .79} 0L${-r * .24} ${-r * .22} 0 ${r * .16} ${r * .28} ${-r * .19} ${r * .81} 0`}
            fill="none" stroke={paint.core} strokeWidth="3.5" />
          <Foot where={polar(r * .51, 258)} angle={28} paint={paint} size={1.0} />
          <Pin where={polar(r * .47, 76)} paint={paint} angle={0} size={1.26} />
        </>
        break
      case "pressurePin":
        pattern = kind === "head" || stage === "strike" ? <>
          <ellipse rx={r * (.45 + q * .30)} ry={r * (.30 + q * .23)} cy="10" fill={paint.cord} fillOpacity=".13" stroke={paint.edge} strokeWidth="3" />
          <path d={`M0 ${-r * .94}l${r * .13} ${r * .50}L0 6 ${-r * .13} ${-r * .44}Z`}
            fill={paint.core} stroke={paint.cord} strokeWidth="3" />
          <path d={diamond(r * .66, r * .48)} fill="none" stroke={paint.cord} strokeWidth="2.4" strokeDasharray="9 4" />
        </> : null
        break
    }
    const angle = motif === "splitReins" ? heading(left(direction(from, area.center))) : 0
    return <g key={index} transform={pose(where, angle)} strokeLinejoin="round">{pattern}</g>
  })
}

const marks = {
  rimeCuff: "M-28 10-22-12-12-17-10 1 0-5 10 1 12-17 22-12 28 10 18 19H-18Z",
  cordDart: "M-29 3H8Q26 3 26-11L20-15 16-6H7L-12-5Z",
  iceTiles: "M-27-7-7-22 9-11 26 3 12 17-17 22-10 0ZM-10 0 9-11M-10 0 12 17",
  stepKnot: "M-25-12-8-9-4-2 8-4 23 7 14 19-5 14-10 4-27 1Z",
  cuffWard: "M-29-4-20-19-10-14-17 1-12 13-21 19ZM29-4 20-19 10-14 17 1 12 13 21 19Z",
  fixedTether: "M0-26 13-16 13-2 27 8 15 20 0 9-15 20-27 8-13-2-13-16ZM0-16V2",
  shoreHitch: "M-27-19-16-22 2-3-16 17-27 14-13-3ZM-5-19 6-22 25-3 6 17-5 14 9-3Z",
  printLock: "M-23-18-7-24 0-8 6-23 22-20 26-6 15 10 13 21H-13L-17 10-26-4Z",
  zipLine: "M-27-14-16-20-6-10-16 0-27-6ZM-10 1 0-9 10 1 0 11ZM7 11 17 1 28 9 19 22Z",
  mistPane: "M-28-7-5-25 25-12 18 15-5 21-24 10ZM-18-6 5-12 20-4",
  windSpool: "M-27 9Q-21-23 2-21L22-11 26 8 7 22-8 10 0-1 13 7",
  splitReins: "M-28-3Q-21-21-9-20L0-10 9-20Q21-21 28-3L14 12 0 3-14 12Z",
  ballast: "M-13-23H12L17-10 28 7 14 21H-14L-28 7-17-10ZM-9-10H9M0-6V13",
  burstWheel: "M-27-2-12-23 0-16 13-23 28-4 14 0 16 18 0 25-16 18-14 0Z",
  shear: "M-31-7-22-17 31 4 22 14ZM-9-18 3-22 15-4 6 0Z",
  paperFold: "M-28-10-12-21 0-12 16-23 31-5 15 16-2 9-17 19-28 6ZM0-12-2 9",
  lostStep: "M-27-13-11-20-9-7-15 0-28-3ZM6-11 27-5 22 18 10 21-2 10Z",
  inwardRail: "M-29-15-13-23 7-9 17-17 31-6 10 19-5 13-12 3-26 6Z",
  iceJaws: "M-31-16-14-20-1-9-9-1-3 8-13 18-28 14ZM31-16 14-20 1-9 9-1 3 8 13 18 28 14Z",
  relayCuff: "M-31-11-13-26 3-16 27-19 33-4 21 21 2 16-15 25-24 11ZM-10-5 16 6",
  shadowPlate: "M-31-2-14-22H15L31-2 16 20H-15ZM-9-4 0-15 9-4 5 11H-5Z",
  oldAnchor: "M0-27 11-18 8-8H25L23 6 0 24-24 7-26-8H-8L-11-18ZM0-8V12",
  turnstile: "M-30 16-28-16-18-23H19L29-15 30 16 18 11 16-6H-15L-18 11Z",
  sinkBasin: "M-30-8-18-23 0-12 17-23 30-8 18 7 0 26-18 7ZM-16-6 0 12 16-6",
  crossWind: "M-32-11-7-22 13-11 30-20 16 1 29 12 2 25-13 12-30 19-16 0Z",
  pivotGear: "M-32-9-19-22-7-18 0-27 12-18 24-22 33-6 24 3 29 16 13 25 0 17-15 25-29 14-22 3Z",
  slantTide: "M-33 10Q-19-31 13-22L11-13Q34-13 32 11L18 24 13 12-4 17-10 5Z",
  coupled: "M-31-11-20-22-3-15 0-6 4-15 20-22 31-9 26 8 10 18 0 8-11 18-27 8Z",
  foldPlate: "M-34-14-19-23-5-12-17 20-31 11ZM-13-13 2-24 18-12 8 21-8 13ZM8-14 25-24 34-11 27 20 13 11Z",
  windExchange: "M-33-6-17-25 1-16 15-25 32-9 8-2-10-6-22 7ZM-31 10-10 4 12 8 31-6 26 15 8 26-10 20-27 25Z",
  gravityDisk: "M-32-7Q-19-28 4-21Q25-29 33-6L25 10 8 28-9 22-24 11ZM-17-3 0-12 18-4 0 15Z",
  binaryWell: "M-35-11-18-24-2-11-7 6-19 18-32 6ZM3-11 19-24 35-11 31 8 19 18 7 8Z",
  inverseField: "M-33-11-10-27 12-16 29-23 33-2 18 24-6 16-24 25-15 1ZM-11-5 10-1 15 10",
  retreatSeal: "M-33 10-19-23 0-15 19-23 34 8 18 23 0 12-18 23ZM-20 7-5-4 7 1 21-11",
  pressurePin: "M-32 14-19-10 0-23 19-10 32 14 9 3 0 25-9 3ZM0-16V5",
} satisfies Record<BinderMotif, string>

function Stamp({ motif, paint, where, size = 1, angle = 0, opacity = 1 }: {
  motif: BinderMotif; paint: Paint; where: EdgePoint; size?: number; angle?: number; opacity?: number
}) {
  return <g transform={pose(where, angle, size)} opacity={opacity} strokeLinejoin="round">
    <path d={marks[motif]} fill={paint.ink} fillOpacity=".63" stroke={paint.cord} strokeWidth="6.5" strokeOpacity=".22" />
    <path d={marks[motif]} fill="none" stroke={paint.cord} strokeWidth="2.65" />
    <path d={marks[motif]} fill="none" stroke={paint.core} strokeWidth="1" />
  </g>
}

function Thread({ from, to, paint, dashed = false, weight = 3, curve = 0, arrow = false }: {
  from: EdgePoint; to: EdgePoint; paint: Paint; dashed?: boolean; weight?: number; curve?: number; arrow?: boolean
}) {
  const length = edgeDistance(from, to)
  if (length < 2) return null
  const axis = direction(from, to), control = along(mix(from, to, .5), left(axis), curve)
  const endAxis = direction(control, to)
  const back = along(to, endAxis, -Math.min(15, length * .43)), side = left(endAxis)
  const d = `M${from.x} ${from.y}Q${control.x} ${control.y} ${to.x} ${to.y}`
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={paint.cord} strokeWidth={weight * 3.9} opacity={dashed ? .12 : .27} />
    <path d={d} stroke={dashed ? paint.edge : paint.cord} strokeWidth={weight} strokeDasharray={dashed ? "9 8" : undefined} />
    {!dashed && <path d={d} stroke={paint.core} strokeWidth={Math.max(1, weight * .43)} />}
    {arrow && <path d={path([along(back, side, 7), to, along(back, side, -7)])} stroke={dashed ? paint.edge : paint.core} strokeWidth={weight} />}
  </g>
}

function IceWake({ target, paint, size = 1, inward = false }: { target: EdgeUnit; paint: Paint; size?: number; inward?: boolean }) {
  if (!target.move || target.force) return null
  const dir = direction(target, target.move)
  const start = { x: target.x, y: target.y + 24 }
  return <g transform={pose(start, heading(dir), size)} opacity=".72" strokeWidth="2.1">
    {sequence(inward ? 4 : 3).map(i => <path key={i} transform={`translate(${-29 - i * 16} ${i % 2 ? 10 : -4})`}
      d={inward ? "M9-8-2 0 9 8-11 4-14-1-11-5Z" : "M-9-7 9-4 3 7-10 4Z"}
      fill={paint.edge} fillOpacity={.24} stroke={i % 2 ? paint.cord : paint.core} opacity={1 - i * .16} />)}
  </g>
}

function ShieldSides({ unit: holder, paint, motif, opacity }: { unit: EdgeUnit; paint: Paint; motif: BinderMotif; opacity: number }) {
  const width = motif === "relayCuff" || motif === "crossWind" ? 47 : 39
  return <g transform={at(holder)} opacity={opacity} fill={paint.ink} fillOpacity=".32" strokeLinejoin="round">
    {[-1, 1].map(sign => <g key={sign} transform={`scale(${sign} 1)`}>
      <path d={`M${width - 4} -27l10 8 1 23 -8 14 -4 -9 3-9 -3-15Z`} stroke={paint.cord} strokeWidth="3.0" />
      <path d={`M${width + 3} -15l3 16 -5 9`} stroke={paint.core} strokeWidth="1.65" fill="none" />
    </g>)}
  </g>
}

function BinderGround({ motif, area, paint, stage, t, kind, from }: {
  motif: BinderMotif; area: EdgeArea; paint: Paint; stage: Stage; t: number; kind?: string; from: EdgePoint
}) {
  return <>
    <Frame area={area} paint={paint} stage={stage} />
    <LanePattern motif={motif} area={area} paint={paint} stage={stage} t={t} />
    <RingPattern motif={motif} area={area} paint={paint} stage={stage} t={t} kind={kind} from={from} />
  </>
}

export function EdgeBinderField({ field, battle }: { field: FieldEffect; battle: EdgeBattle }) {
  const skill = field.cast.skill?.id
  const motif = binderChoreography(skill)?.motif
  const owner = battleFighters(battle).find(unit => unit.id === field.cast.owner)
  if (!motif || !owner || field.until <= battle.time || motif === "windExchange" && field.step.selector.units === "a") return null
  const age = Math.max(0, battle.time - field.time)
  const paint = paints[owner.card.rarity]
  const faded = unit((field.until - battle.time) / .36)
  return <g data-binder-field={skill} opacity={faded * .69}>
    <BinderGround motif={motif} area={field.area} paint={paint} stage="hold" t={age} from={field.cast.from} />
    {motif === "pivotGear" && battleUnits(battle).filter(unit => unit.hp && typeof unit.id === "string" &&
      !field.seen.has(unit.id) && areaHits(field.area, unit)).map(unit => {
        const radial = direction(field.area.center, unit)
        return <Pin key={unit.id} paint={paint} size={.55} where={along(unit, radial, 50)} angle={heading(radial) - 90} />
      })}
  </g>
}

function BinderFlight({ fx, to, paint, t, motif }: { fx: BinderFx; to: EdgePoint; paint: Paint; t: number; motif: BinderMotif }) {
  const axis = direction(fx.from, to)
  const head = along(mix(fx.from, to, t), left(axis), Math.sin(t * Math.PI) * (fx.binder.kind === "counter" ? 28 : 18))
  return <>
    <Thread from={fx.from} to={head} paint={paint} curve={t * (fx.binder.kind === "counter" ? 32 : 14)} weight={3.6} />
    <g transform={pose(head, heading(axis), fx.binder.kind === "counter" ? .77 : .86)}>
      <path d="M-15 3 11-5 14-16 25-12 24 2 11 12-8 9Z" fill={paint.ink} stroke={paint.cord} strokeWidth="6.2" strokeOpacity=".42" />
      <path d="M-15 3 11-5 14-16 25-12 24 2 11 12-8 9Z" fill={paint.edge} stroke={paint.core} strokeWidth="2.5" />
      {motif === "relayCuff" && <path d="M-19-6-5-5-12 8" fill="none" stroke={paint.cord} strokeWidth="3.4" />}
    </g>
  </>
}

function CutRoute({ fx, paint, motif, t }: { fx: BinderFx; paint: Paint; motif: BinderMotif; t: number }) {
  const { from, to, binder } = fx
  const q = ease(t), angle = heading(direction(from, to))
  const isTether = binder.kind === "tether"
  const folded = binder.kind === "short" || binder.kind === "ballast"
  return <>
    {binder.other && <g opacity={(1 - t) * .78}>
      <Thread from={isTether || folded ? to : from} to={binder.other} paint={paint} dashed weight={2.7} arrow />
    </g>}
    <Thread from={from} to={mix(from, to, .30 + .70 * q)} paint={paint}
      weight={binder.kind === "invert" ? 5.2 : 3.6} curve={binder.kind === "bend" ? 21 * (1 - q) : binder.kind === "invert" ? -38 * (1 - q) : 0}
      arrow={!isTether} />
    {folded && binder.kind === "short"
      ? <Foot where={to} paint={paint} angle={angle + 85} size={1.05 + t * .12} />
      : <Stamp motif={motif} where={to} paint={paint} angle={angle + 8 + t * (binder.kind === "invert" ? 48 : 18)} size={.80 + .35 * t} />}
    {isTether && <Pin where={from} paint={paint} size={1.06} />}
    {binder.kind === "invert" && <>
      <path d={diamond(45 + q * 31, 23 + q * 17)} transform={pose(to, angle)}
        fill={paint.cord} fillOpacity=".14" stroke={paint.core} strokeWidth="2.5" />
      {sequence(4).map(i => {
        const side = i % 2 ? 1 : -1
        const axis = i < 2 ? direction(from, to) : left(direction(from, to))
        const panel = along(from, axis, side * (24 + q * 49))
        return <path key={i} d="M-13 7-9-16 16-8 9 17Z"
          transform={pose(panel, angle + side * (19 + t * 81), 1.22 - .38 * t)}
          fill={spectrum[i]} fillOpacity={.46 - .24 * t} stroke={paint.core} strokeWidth="2.4" opacity={1 - t * .72} />
      })}
    </>}
  </>
}

function BinderMarks({ battle, fx, paint, motif, t, to }: { battle: EdgeBattle; fx: BinderFx; paint: Paint; motif: BinderMotif; t: number; to: EdgePoint }) {
  const { binder: beat } = fx
  if (beat.cue === "flight") return <BinderFlight fx={fx} to={to} paint={paint} t={t} motif={motif} />
  if (beat.cue === "prepare") {
    if (fx.area && beat.kind !== "echo" && beat.kind !== "head") return null
    const q = rise(t), angle = heading(direction(fx.from, to))
    return <>
      {beat.kind === "echo" && motif === "oldAnchor" && <Pin where={fx.from} paint={paint} size={1.05} />}
      {motif === "shoreHitch" ? sequence(3).map(i => {
        const step = along(to, outward(to), (i + 1) * (17 + 8 * (1 - q)))
        return <Stamp key={i} motif={motif} where={step} paint={paint} angle={heading(outward(to)) + 180} size={.44} opacity={q} />
      }) : <>
        <Stamp motif={motif} where={to} paint={paint} size={.43 + .32 * q} angle={angle * .17} opacity={q} />
        {(motif === "cordDart" || motif === "oldAnchor") && <Thread from={fx.from} to={mix(fx.from, to, .28 + .61 * q)}
          paint={paint} dashed weight={2.5} />}
      </>}
    </>
  }
  if (beat.cue === "release" && ["short", "tether", "ballast", "bend", "invert", "brace"].includes(beat.kind ?? ""))
    return <CutRoute fx={fx} paint={paint} motif={motif} t={t} />
  if (beat.kind === "link" && beat.cue === "deploy") return <Thread from={fx.from} to={to} paint={paint} curve={-24} weight={4} />
  if (beat.cue === "miss") return <g transform={at(to)} fill="none" stroke={paint.edge} strokeWidth="3">
    <path d={arc(24 + 31 * t, -160, -25) + arc(24 + 31 * t, 25, 160)} strokeDasharray="6 7" />
  </g>
  if (beat.kind === "counter") return <Stamp motif={motif} where={to} paint={paint} size={1.14 + .25 * t} angle={heading(direction(fx.from, to))} />
  if (beat.cue === "deploy") return null

  const paths: NonNullable<BinderFx["binder"]["paths"]> = beat.paths?.length ? beat.paths : beat.kind === "ballast" ? [{ at: to }] : []
  return paths.map(({ at: contact, end, unit: id }, i) => {
    const target = unitOf(battle, id)
    if (beat.kind === "ward") return target && <ShieldSides key={i} unit={target} paint={paint} motif={motif} opacity={.82} />
    const bottom = { x: contact.x, y: contact.y + (target && "card" in target ? 23 : 29) }
    const axis = end ? direction(contact, end) : direction(fx.from, contact)
    const q = ease(t)
    return <g key={i} data-binder-path={end ? beat.kind ?? "force" : undefined}>
      {end && <Thread from={contact} to={beat.kind === "halt" ? end : mix(contact, end, .48 + q * .52)}
        paint={paint} dashed={beat.kind === "halt"} weight={motif === "pressurePin" || motif === "gravityDisk" ? 4.1 : 3}
        curve={motif === "windSpool" || motif === "burstWheel" ? 14 * (1 - q) : 0} arrow={beat.kind !== "halt"} />}
      <Stamp motif={motif} where={bottom} paint={paint} angle={beat.kind === "halt" ? heading(axis) + 90 : heading(axis) * .17}
        size={beat.kind === "root" ? 1.14 : .74 + q * .30} />
      {end && beat.kind !== "halt" && <Pin where={end} paint={paint} angle={heading(axis) - 90} size={.54 + .20 * q} />}
    </g>
  })
}

function liveBinder(battle: EdgeBattle, cast: SkillCast) {
  const skill = cast.signature ? undefined : cast.skill?.id
  const motif = binderChoreography(skill)?.motif
  const owner = motif && battleFighters(battle).find(unit => unit.id === cast.owner)
  return skill && motif && owner ? { skill, motif, paint: paints[owner.card.rarity] } : undefined
}

function BinderStatus({ battle, layer }: { battle: EdgeBattle; layer: "floor" | "front" }) {
  return <>
    {battle.runtime.buffs.map(buff => {
      if (buff.until <= battle.time) return null
      const look = liveBinder(battle, buff.cast), target = unitOf(battle, buff.target)
      if (!look || !target?.hp) return null
      const { skill, motif, paint } = look
      const opacity = .84 * unit((buff.until - battle.time) / .26)
      if (buff.kind === "tether" && layer === "floor") {
        const anchor = buff.cast.aim
        const tension = unit(edgeDistance(anchor, target) / buff.values[0])
        return <g key={skill + buff.target} data-binder-status={skill} opacity={opacity}>
          <circle cx={anchor.x} cy={anchor.y} r={buff.values[0]} fill={paint.ink} fillOpacity=".12"
            stroke={paint.edge} strokeDasharray="11 10" strokeWidth="2.8" />
          <Pin where={anchor} paint={paint} size={.95} />
          <Thread from={anchor} to={target} paint={paint} curve={24 * (1 - tension)} weight={2.6 + 2 * tension} />
        </g>
      }
      if (layer !== "front" || !["slow", "root", "short", "aimp", "anti"].includes(buff.kind)) return null
      const foot = { x: target.x, y: target.y + 30 }
      return <g key={skill + buff.target + buff.kind} data-binder-status={skill} data-binder-status-kind={buff.kind} opacity={opacity}>
        {buff.kind === "slow" && <IceWake target={target} paint={paint} size={.94} />}
        <Stamp motif={motif} where={foot} paint={paint} size={buff.kind === "root" ? 1.08 : .75} />
      </g>
    })}
    {battle.runtime.watches.map((watch) => {
      if (watch.until <= battle.time || watch.uses <= 0) return null
      const look = liveBinder(battle, watch.cast), target = unitOf(battle, watch.target)
      if (!look || !target?.hp) return null
      const opacity = .78 * unit((watch.until - battle.time) / .27)
      if (look.motif === "coupled" && layer === "floor" && watch.cast.binderLink?.[0] === target.id) {
        const partner = unitOf(battle, watch.cast.binderLink[1])
        return partner?.hp ? <g key={watch.id + target.id} data-binder-status={look.skill} opacity={opacity}>
          <Thread from={target} to={partner} paint={look.paint} curve={20} weight={3.9} />
          <Thread from={partner} to={target} paint={look.paint} curve={15} weight={2.4} dashed />
          <Pin where={mix(target, partner, .5)} paint={look.paint} size={.76} />
        </g> : null
      }
      if (layer === "front" && (look.motif === "ballast" || look.motif === "cuffWard" || look.motif === "relayCuff")) {
        const foot = { x: target.x + (look.motif === "ballast" ? 31 : -37), y: target.y + 26 }
        return <g key={watch.id + target.id} data-binder-status={look.skill} opacity={opacity}>
          <Stamp motif={look.motif} where={foot} paint={look.paint} size={.77} angle={look.motif === "ballast" ? 0 : -25} />
        </g>
      }
      return null
    })}
    {layer === "front" && [...battle.runtime.shieldCasts].map(([id, cast]) => {
      const look = liveBinder(battle, cast), target = unitOf(battle, id)
      if (!look || !target?.hp || !target.shield || target.shieldUntil <= battle.time) return null
      return <g key={id} data-binder-status={look.skill}>
        <ShieldSides motif={look.motif} unit={target} paint={look.paint} opacity={unit((target.shieldUntil - battle.time) / .32) * .62} />
      </g>
    })}
    {layer === "front" && battle.runtime.fields.map(field => {
      const look = liveBinder(battle, field.cast)
      if (!look || field.mode !== "hold" || field.until <= battle.time || (look.motif !== "gravityDisk" && look.motif !== "windExchange")) return null
      const side = field.step.selector.units
      return <g key={field.id} data-binder-status={look.skill}>
        {battleUnits(battle).filter(target => target.hp && target.move && !target.force && areaHits(field.area, target) &&
          (side === "a") === (typeof target.id === "number") && (side !== "a" || !isOutside(target)) && (look.motif !== "gravityDisk" ||
            movingOutward(target, target.move, field.area.center))).map(target =>
          <IceWake key={target.id} target={target} paint={side === "a" ? { ...look.paint, edge: look.paint.cord } : look.paint}
            size={side === "a" ? 1.1 : .97} inward={side !== "a"} />)}
      </g>
    })}
  </>
}

export function EdgeBinderEffects({ battle, layer }: { battle: EdgeBattle; layer: "floor" | "front" }) {
  const painted = new Set<string>()
  return <g pointerEvents="none" aria-hidden="true">
    <BinderStatus battle={battle} layer={layer} />
    {battle.runtime.effects.map(effect => {
      if (!effect.binder || effect.start > battle.time || effect.end <= battle.time) return null
      const motif = binderChoreography(effect.skill)?.motif
      if (!motif) return null
      const fx = effect as BinderFx
      const { binder: beat } = fx
      const t = unit((battle.time - fx.start) / (fx.end - fx.start)), paint = paints[fx.rarity]
      const stage: Stage = beat.cue === "prepare" ? "prepare" : "strike"
      const target = unitOf(battle, fx.target)
      const to = (beat.cue === "flight" || stage === "prepare" && !fx.area) && target?.hp ? target : fx.to
      const fade = beat.cue === "prepare" || beat.cue === "flight" ? .66 + .34 * rise(t) : 1 - t ** 1.7
      if (layer === "floor") {
        if (!fx.area || beat.cue === "release" || beat.cue === "flight" || beat.kind === "ward" || beat.kind === "cross") return null
        const shape = fx.cast + ":" + fx.start + ":" + areaPath(fx.area)
        if (painted.has(shape)) return null
        painted.add(shape)
        return <g key={fx.id} data-binder-fx={fx.skill} data-binder-cue={beat.cue} opacity={fade * (beat.cue === "miss" ? .39 : .9)}>
          <BinderGround motif={motif} area={fx.area} paint={paint} t={t} stage={stage} kind={beat.kind} from={fx.from} />
        </g>
      }
      if (beat.cue === "deploy" && beat.kind !== "link" || beat.cue === "prepare" && fx.area && !beat.kind) return null
      return <g key={fx.id} data-binder-fx={fx.skill} data-binder-cue={beat.cue} opacity={fade}>
        <BinderMarks battle={battle} fx={fx} to={to} motif={motif} paint={paint} t={t} />
      </g>
    })}
  </g>
}
