import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, armorPaint, at, circlesOf, ease, heading, mix, path, Plating, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { WardStroke, WardenOutline, wardenStrip } from "./EdgeWardenFields"
import { CENTER, along, direction, edgeDistance, isOutside, left, outward } from "./edgeSkills/geometry"
import type { SkillVisual, WardenBeat, WardenContact } from "./edgeSkills/presentation"
import { unitOf } from "./edgeSkills/state"
import { wardenChoreography, type WardenMotif } from "./edgeSkills/wardenChoreo"

type Shot = {
  fx: SkillVisual & { warden: WardenBeat }
  motif: WardenMotif
  paint: ArmorPaint
  p: number
}

const aiming = (point: EdgePoint, axis: EdgePoint) => at(point) + " rotate(" + heading(axis) + ")"
const cool = "#a2edff"
const warm = "#ffc5b5"
const corners = "M-36-18v-18h18M18-36h18v18M36 18v18H18M-18 36h-18V18"
const diamond = "M-23 0 0-23 23 0 0 23Z"
const reverse = (axis: EdgePoint) => ({ x: -axis.x, y: -axis.y })
const platePose = {
  knocker: "M-7-24 13-19 20-11V11L13 19-7 24-14 14V-14Z",
  rake: "M-17-31 9-24 22-6 17 28 6 33-6 6Z",
  spear: "M-32-5H8L23-13 42 0 23 13 8 5H-32Z",
  deflect: "M-14-27 5-27 26-8V19L13 26 13 1-14-10Z",
  winch: "M-22-19H7L21-10V10L7 19H-22L-12 8H7L10 0 7-8H-12Z",
  grapple: "M-13-27H9L22-12V23H1L-11 12 2 8H9V-5H-4Z",
  compass: "M-26-21 16-13 33 0 16 13-26 21-10 0Z",
  relay: "M-22-22H1L12-13H22V13H12L1 22H-22L-9 0Z",
} as const

function SwapArcs({ from, to, p, paint, parallel, resolved = false }: {
  from: EdgePoint; to: EdgePoint; p: number; paint: ArmorPaint; parallel: boolean; resolved?: boolean
}) {
  const axis = direction(from, to)
  const width = Math.min(parallel ? 154 : 61, edgeDistance(from, to) * (parallel ? .82 : .36))
  const side = left(axis)
  const end = resolved ? 1 : .38 + .62 * p
  return <g>
    {[from, to].map((origin, i) => {
      const goal = i ? from : to
      const bend = along(mix(origin, goal, .5), side, i ? -width : width)
      const control = mix(origin, bend, end)
      const tip = mix(control, mix(bend, goal, end), end)
      const line = `M${origin.x} ${origin.y}Q${control.x} ${control.y} ${tip.x} ${tip.y}`
      const color = parallel ? spectrum[i ? 3 : 1] : i ? paint.accent : paint.metal
      return <g key={i}>
        <WardStroke d={line} color={color} width={parallel ? resolved ? 6 : 4.2 : resolved ? 4 : 2.8} />
        {parallel && <>
          <path d={line} fill="none" stroke={paint.light} strokeWidth="2" strokeDasharray="3 16" />
          {!resolved && <path transform={aiming(tip, direction(control, tip))} d="M-13-10 7 0-13 10-7 0Z"
            fill={color} stroke={paint.light} strokeWidth="2.5" />}
        </>}
        <g transform={aiming(origin, i ? reverse(axis) : axis)}>
          <path d={parallel ? "M-32-34 6-46 36-23V23L6 46-32 34-44 0Z" : corners}
            fill="none" stroke={color} strokeWidth={parallel ? 3.5 : 2.8} />
          {parallel && <path d="M-38-12-46 0-38 12M29-30 46-19V19L29 30" fill="none" stroke={paint.light} strokeWidth="3" />}
        </g>
      </g>
    })}
  </g>
}

function LineUp({ shot }: { shot: Shot }) {
  const { fx, paint, p, motif } = shot
  const strip = wardenStrip(fx.area?.parts[0])
  if (!strip) return null
  const { from, to, width, length } = strip
  const half = width / 2
  const q = ease(p)
  return <g transform={aiming(from, direction(from, to))}>
    {motif === "rake" && <path d={`M0 0H${length * q}M${length - 16} -8l16 8-16 8`}
      fill="none" stroke={paint.light} strokeWidth="3" strokeDasharray="13 6" />}
    {motif === "divider" && <>
      <WardStroke color={paint.accent} d={`M4 0H${length * q}`} width={3.2} />
      {[.24, .5, .76].map((f) => <path key={f} opacity={unit((p - f * .47) * 5)}
        d={`M${length * f - 9} ${-half * .75}l9 9v${half * 1.5 - 18}l-9 9`} fill="none" stroke={paint.metal} strokeWidth="3.2" />)}
    </>}
    {motif === "bastionSweep" && <>
      {[-1, 1].map((n) => <path key={n} fill="none" stroke={n > 0 ? paint.light : paint.accent} strokeWidth="3.8"
        d={`M0 0L24 ${half * .72 * n}H${Math.max(24, length * q - 12)}L${length * q} 0`} />)}
      <path d={`M2 0H${length * q}`} stroke={paint.metal} strokeWidth="2.8" strokeDasharray="8 9" />
    </>}
    {motif === "twinlane" && <>
      {[-1, 1].map((n) => <g key={n}>
        <path d={`M0 0H${length * q}l-18 ${half * n}H28Z`} fill={n > 0 ? cool : warm} fillOpacity=".16"
          stroke={n > 0 ? cool : warm} strokeWidth="3.2" />
        <path d={`M${length * .37} ${half * .35 * n}h${length * .3 * q}`} stroke={paint.light} strokeWidth="2.6" />
      </g>)}
    </>}
  </g>
}

function Forecast({ shot, battle }: { shot: Shot; battle: EdgeBattle }) {
  const { fx, paint, p, motif } = shot
  const actor = unitOf(battle, fx.warden.owner)
  const target = unitOf(battle, fx.target)
  const q = ease(p)
  if (motif === "exchange" || motif === "parallel") {
    if (!actor?.hp || !target?.hp || isOutside(actor) || isOutside(target)) return null
    return <g opacity={.42 + .34 * q}>
      <SwapArcs from={actor} to={target} p={p} paint={paint} parallel={motif === "parallel"} />
    </g>
  }
  if (motif === "pincer") return null
  const circle = circlesOf(fx.area)[0]
  const prepareColor = motif === "hammer" ? spectrum[4] : paint.metal
  return <>
    {fx.area && <g opacity={.48 + .36 * q}>
      <WardenOutline area={fx.area} color={prepareColor} />
      <LineUp shot={shot} />
    </g>}
    {fx.warden.other && motif !== "rewind" && edgeDistance(fx.from, fx.warden.other) > 4 &&
      <path d={path([fx.from, fx.warden.other])} fill="none" stroke={paint.metal} strokeWidth="2.2" strokeDasharray="6 10" opacity=".58" />}
    {circle && (motif === "hammer" || motif === "boundary" || motif === "gather" || motif === "rewind") &&
      <g transform={at(circle.center)}>
        {[0, 1, 2, 3].map((i) => <g key={i} transform={`rotate(${45 + 90 * i}) translate(${circle.radius * (.86 + .14 * (1 - q))} 0)`}>
          <path d={motif === "gather" ? "M7-11-7 0 7 11" : motif === "rewind" ? "M-3-13 9 0-3 13M-9-7-3 0-9 7" : "M3-21v12l-10 9 10 9v12"}
            stroke={motif === "hammer" || motif === "boundary" ? spectrum[i] : paint.accent} strokeWidth={motif === "hammer" ? 5 : 3}
            fill="none" opacity={.48 + .46 * q} />
        </g>)}
      </g>}
  </>
}

function Hammer({ center, p, paint }: { center: EdgePoint; p: number; paint: ArmorPaint }) {
  const fall = ease((p - .18) / .82)
  const gap = 160 * (1 - fall)
  const head = "M-108-26-72-53H68L108-26V26L68 54H-72L-108 26Z"
  return <g transform={at(center)}>
    <path d={`M-84 ${-gap} -64 0M84 ${-gap} 64 0`} fill="none" stroke={spectrum[3]} strokeWidth="3.5" opacity={.52 * (1 - fall)} />
    <g transform={`translate(0 ${-gap})`} opacity={.24 + .75 * ease(p * 2.6)}>
      <Plating d="M-15-48-10-103H10L15-48Z" paint={paint} weight={4.7} fill={.83} />
      <path d="M-11-84H11M-11-75H11M-13-66H13" stroke={spectrum[3]} strokeWidth="3.2" />
      <Plating d={head} paint={paint} weight={6.2} fill={.89} />
      <path d="M-106-24H105M-106 26H105M-71-51v103M70-51v103" stroke={paint.light} strokeWidth="3.5" />
      {[-2, -1, 0, 1, 2].map((i) => <g key={i} transform={`translate(${i * 30} 0)`}>
        <path d="M-13 0 0-19 13 0 0 19Z" fill={spectrum[i + 2]} fillOpacity=".23" stroke={spectrum[i + 2]} strokeWidth="3.4" />
      </g>)}
    </g>
  </g>
}

function Windup({ shot, battle }: { shot: Shot; battle: EdgeBattle }) {
  const { fx, paint, p, motif } = shot
  if (motif === "hammer") return <Hammer center={fx.to} p={p} paint={paint} />
  const q = ease(p)
  const actor = unitOf(battle, fx.warden.owner)
  const live = unitOf(battle, fx.target)
  if (motif in platePose) {
    const figure = platePose[motif as keyof typeof platePose]
    const to = live?.hp ? live : fx.to
    const from = actor ?? fx.from
    const axis = edgeDistance(from, to) > 1 ? direction(from, to) : fx.warden.axis
    const angle = motif === "deflect" ? 78 * q : motif === "rake" ? -65 + 80 * q : motif === "compass" ? -28 * (1 - q) : 0
    const body = along(from, axis, 39 + 13 * q)
    const distance = edgeDistance(body, to)
    const tether = (motif === "grapple" || motif === "winch") && distance > 38
    const tip = tether && along(body, axis, Math.max(20, distance - 28) * q)
    const elbow = tip && along(mix(body, tip, .55), left(axis), motif === "grapple" ? 13 * (1 - q) : 3)
    return <>
      {tip && elbow && <WardStroke d={path([body, elbow, tip])} color={paint.accent} width={motif === "grapple" ? 4.1 : 3} />}
      {motif === "compass" && <g transform={aiming(along(to, direction(CENTER, to), 41), direction(to, CENTER))} opacity={.45 + .4 * q}>
        <WardStroke d="M-13-13 0 0-13 13M-24-9-15 0-24 9" color={paint.accent} width={3.8} />
      </g>}
      <g transform={aiming(body, axis) + " rotate(" + angle + ")"} opacity={.65 + .35 * q}>
        <Plating d={figure} paint={paint} weight={motif === "grapple" ? 4.5 : 3.6} fill={.9} />
        <path d={motif === "spear" ? "M-24 0H28" : motif === "grapple" ? "M-8-14H9V2" : "M-3-12 8 0-3 12"}
          fill="none" stroke={paint.light} strokeWidth="2.6" />
      </g>
    </>
  }
  if (motif === "spring") {
    const center = fx.beat === 2 && live?.hp ? live : fx.to
    return <g transform={aiming(center, fx.warden.axis)} opacity={.59 + .41 * q}>
      <WardStroke d={`M${-43 - 15 * (1 - q)} 30l10-13 12 18 12-18 12 18 12-18 11 13`} color={paint.metal} width={3.7} />
      <path d="M33 14v27l13-13Z" fill={paint.accent} />
    </g>
  }
  if (motif === "rewind" && fx.warden.paths?.length) return <g opacity={.68 + .32 * q}>
    {fx.warden.paths.map(({ at: hit, past }, i) => {
      if (!past) return <g key={i} transform={at(hit)}>
        <path d="M-37-13v26M37-13v26M-13-36h26M-13 36h26" stroke={paint.accent} strokeWidth="3.1" opacity={.55 + .45 * q} />
      </g>
      return <g key={i}>
        <path d={path([past, hit])} fill="none" stroke={paint.accent} strokeWidth="3.2" strokeDasharray="5 7" />
        <g transform={aiming(mix(hit, past, .16 + .84 * q), direction(hit, past))}>
          <WardStroke d="M-14-13 0 0-14 13M-28-9-17 0-28 9" color={paint.light} />
        </g>
      </g>
    })}
  </g>
  if (motif === "gather" && fx.beat === 2) return <g transform={aiming(fx.to, fx.warden.axis)}>
    <Plating d={`M-42-39-20-48H${28 + 22 * q}L${49 + 22 * q} 0 ${28 + 22 * q} 48H-20L-42 39Z`}
      paint={paint} weight={4.2} fill={.54} />
    <path d="M-18-26H16L37 0 16 26H-18" fill="none" stroke={paint.light} strokeWidth="3.6" />
  </g>
  return null
}

const dashHeads = {
  step: "M-14-24 14-18 26 0 14 18-14 24-7 0Z",
  ram: "M-16-42H12L43-19 54 0 43 19 12 42H-16L-7 0Z",
  stamp: "M-10-29H21V29H-10L-17 17V-17Z",
  escort: "M-7-31 25-21 35 0 25 21-7 31 8 0Z",
  stretcher: "M-48-26H35L45-13V13L35 26H-48L-37 0Z",
  breaker: "M-30-37 11-32 43 0 11 32-30 37-12 0Z",
  borrow: "M-24-20 12-24 35 0 12 24-24 20-7 0Z",
  carry: "M-46-36H18L44-18V18L18 36H-46V19H22V-19H-46Z",
  advance: "M-19-39 2-42 31-25 42 0 31 25 2 42-19 39-2 0Z",
  overlap: "M-8-40 26-34 48-17V17L26 34-8 40 5 0Z",
} as const

function Dash({ shot, battle, layer }: { shot: Shot; battle: EdgeBattle; layer: "floor" | "front" }) {
  const { fx, paint, motif } = shot
  const body = unitOf(battle, fx.target)
  if (!body?.hp || !body.force || body.force.cause?.id !== fx.cast) return null
  const axis = fx.warden.axis
  const span = edgeDistance(fx.from, body)
  const width = motif === "step" ? 15 : motif === "ram" || motif === "stretcher" || motif === "carry" ? 32 : 23
  if (layer === "front") {
    const shape = dashHeads[motif as keyof typeof dashHeads]
    if (!shape) return null
    const head = motif === "carry" || motif === "stretcher" ? body : along(body, axis, 37)
    return <g transform={aiming(head, axis)}>
      {motif === "overlap" && <g transform="translate(-16 -15)">
        <Plating d={shape} paint={{ ...paint, metal: paint.accent }} weight={3.5} fill={.74} />
      </g>}
      <Plating d={shape} paint={paint} weight={motif === "ram" || motif === "breaker" ? 5.1 : 3.5} fill={motif === "stretcher" ? .24 : .68} />
      {motif === "borrow" && <path d="M-14-16v9h14v7h15v8H0v8" fill="none" stroke={paint.light} strokeWidth="3.3" />}
      {motif === "stamp" && <path d="M-6-20H13V20H-6M3-17v34" fill="none" stroke={paint.light} strokeWidth="3.1" />}
      {motif === "escort" && <path d="M-5-22 15 0-5 22" fill="none" stroke={paint.accent} strokeWidth="3.2" />}
    </g>
  }
  const color = motif === "escort" ? paint.accent : paint.metal
  return <g transform={aiming(fx.from, axis)}>
    {motif === "stamp" && <g transform={`translate(${edgeDistance(fx.from, fx.to)} 0)`}>
      <WardStroke d={corners} color={paint.light} />
    </g>}
    {motif === "advance" && <path d="M0-42-24-25-29 0-24 25 0 42" fill="none" stroke={paint.accent} strokeWidth="4" />}
    {span > 2 && (motif === "step" ? <>
      {[.28, .64].map((f, i) => <path key={f} d="M-9-9v18h14" fill="none" stroke={color} strokeWidth="3.4"
        transform={`translate(${span * f} ${i ? -width : width})`} />)}
    </> : <>
      <path d={`M0 ${-width * .28}L${span} ${-width}v${width * 2}L0 ${width * .28}Z`} fill={color} opacity=".15" />
      {[-1, 1].map((n) => <WardStroke key={n} d={motif === "breaker"
        ? `M0 ${n * width * .25}L${span * .46} ${n * width * 1.25} ${span * .62} ${n * width * .55} ${span} ${n * width}`
        : motif === "escort" ? `M0 0Q${span * .52} ${n * width * 1.35} ${span} ${n * width * .68}`
          : `M0 ${n * width * .45}L${span} ${n * width}`} color={color} width={motif === "ram" ? 4.6 : 3.1} />)}
      {(motif === "stretcher" || motif === "carry" || motif === "borrow") && <path d={`M0 0H${span}`} stroke={paint.light}
        strokeDasharray={motif === "borrow" ? "3 9" : "12 8"} strokeWidth="3.1" />}
    </>)}
  </g>
}

function Landing({ shot, layer }: { shot: Shot; layer: "floor" | "front" }) {
  const { fx, paint, p, motif } = shot
  const q = ease(p)
  if (layer === "front") {
    if (motif === "stamp" || motif === "breaker") return <g transform={aiming(fx.to, fx.warden.axis)}>
      <WardStroke d={motif === "stamp" ? "M-47-22-36-36H-14M14 36H36L47 22M-16 49H16" : "M-50-26-35-39-14-45M-50 26-35 39-14 45M34-27 53 0 34 27"}
        color={paint.light} width={4.1} />
    </g>
    return null
  }
  return <g transform={aiming(fx.to, fx.warden.axis)}>
    {motif === "step" && <path d={`M-25-30H${9 + 12 * q}l11 15v30l-11 15H-25`}
      fill="none" stroke={paint.metal} strokeWidth="3.2" />}
    {motif === "ram" && <path d={arc(39 + 34 * q, -94, 94)} fill="none" stroke={paint.accent} strokeWidth="5.5" />}
    {motif === "stamp" && <g transform={`scale(${1.15 - .18 * q})`}><WardStroke d={corners} color={paint.metal} width={4.2} /></g>}
    {motif === "escort" && <path d="M-54-22-24-28-6-38M-54 22-24 28-6 38" fill="none" stroke={paint.accent} strokeWidth="3.2" />}
    {motif === "stretcher" && <path d="M-45-23H36L49-10V10L36 23H-45ZM-22-23v46M24-23v46" fill={paint.ink}
      fillOpacity=".45" stroke={paint.metal} strokeWidth="3.7" />}
    {motif === "breaker" && <WardStroke d={`M${-79 * q}-48-31-31-38-11 0 0-32 15-19 34 ${-72 * q} 57M0 0 33-17 54-16 ${91 * q} -37M0 0 23 25 53 26 ${77 * q} 49`}
      color={paint.metal} width={4.4} />}
    {motif === "borrow" && <path d="M-37-17H-20V-29H7V-17H25M-37 17H-20V29H7V17H25" fill="none" stroke={paint.light} strokeWidth="3.5" />}
    {motif === "carry" && <WardStroke d="M-51-31v62h21M-25-34v68M38-22 54 0 38 22" color={paint.metal} width={4} />}
    {motif === "advance" && <path d="M-21-36 5-42 39-23V23L5 42-21 36" fill="none" stroke={paint.light} strokeWidth="4" />}
    {motif === "overlap" && <>
      <path d={arc(34 + 52 * q, 219, 351)} fill="none" stroke={paint.accent} strokeWidth="5.5" />
      <path d={arc(42 + 51 * q, 26, 178)} fill="none" stroke={paint.metal} strokeWidth="6.1" />
    </>}
  </g>
}

const wardCaps = {
  step: "M-29 28-17 38H17L29 28 18 28 12 32H-12L-18 28Z",
  stamp: "M-38-15v-17h17M21-32h17v17M38 15v17H21M-21 32h-17V15",
  escort: "M-30-27-43-8V11L-30 24M31-17 39 0 31 17",
  stretcher: "M-27-39H27L40-21M-27 39H27L40 21M-35-31-45-20v40l10 11",
  exchange: "M-32 22v-51H-9L0-39 9-29H32V22L0 43Z",
  bastionSweep: "M-32-22H-24V22H-32ZM24-22H32V22H24Z",
  carry: "M-38-31v56l14 13h48l14-13v-56l-12 8v42l-10 9h-32l-10-9v-42Z",
  advance: "M-32-14-40 0-32 14h15l-8-14 8-14ZM17-14l8 14-8 14h15l8-14-8-14Z",
  overlap: "M-34-13-43 3-36 19-24 26M-25-27-29-10-20 5M35-25 43-11 38 10 27 23M24-6 32 5",
  boundary: "M-41-18v-16h18M23-34h18v16M-41 16v18h18M23 34h18V16",
  ricochet: "M-32-29-42-16V16L-32 29M32-29 42-16V16L32 29M-9-38 0-44 9-38",
  parallel: "M-41-16-31-35-10-42M10-42 31-35 41-16M41 16 31 35 10 42M-10 42-31 35-41 16",
} as const

function WardArrival({ shot }: { shot: Shot }) {
  const { fx, p, paint, motif } = shot
  const shape = wardCaps[motif as keyof typeof wardCaps]
  if (!shape) return null
  const close = ease(p * 2.7)
  const color = motif === "parallel" && fx.target === fx.warden.owner ? spectrum[3] : paint.metal
  return <>
    {(motif === "escort" || motif === "advance" || motif === "overlap" || motif === "bastionSweep") &&
      edgeDistance(fx.from, fx.to) > 40 && <path d={path([mix(fx.from, fx.to, .68), fx.to])} fill="none" stroke={paint.accent}
        strokeWidth="3.8" strokeDasharray={motif === "advance" ? "2 8" : undefined} opacity=".8" />}
    <g transform={at(fx.to) + " scale(" + (1.23 - .23 * close) + ")"}>
      <Plating d={shape} paint={{ ...paint, metal: color }} weight={motif === "exchange" || motif === "carry" ? 4.4 : 3.2} fill={.16} />
      {(motif === "boundary" || motif === "parallel") && <path d={arc(45 + p * 7, 48, 135) + arc(45 + p * 7, 228, 315)}
        fill="none" stroke={spectrum[0]} strokeWidth="2.8" />}
    </g>
  </>
}

function BandImpact({ shot }: { shot: Shot }) {
  const { fx, p, paint, motif } = shot
  const strip = wardenStrip(fx.area?.parts[0])
  if (!strip) return null
  const { from, to, width, length } = strip
  const half = width * .5
  const q = ease(p)
  if (motif === "borrow") return <g transform={aiming(from, direction(from, to))}>
    <path d={`M0 ${-half}H${length}V${half}H0Z`} fill={paint.metal} fillOpacity=".16" stroke={paint.metal} strokeWidth="2.8" />
    <path d={`M0 0H${length}`} fill="none" stroke={paint.light} strokeWidth="4.5" strokeDasharray="4 9" />
    <path d={`M${Math.max(0, length - 82)} ${-half - 10}v${width + 20}`} stroke={paint.accent} strokeWidth="3.8" />
  </g>
  return <g transform={aiming(from, direction(from, to))}>
    {[-1, 1].map((n) => {
      const c = motif === "twinlane" ? (n > 0 ? cool : warm) : n > 0 ? paint.metal : paint.accent
      const spread = (half * .7 + 35 * q) * n
      const d = motif === "rake" ? `M6 ${-half * .3} ${length * .33} ${spread} ${length * .78} ${spread * .65} ${length} 0`
        : `M0 0 ${length * .16} ${spread * .63} ${length * .56} ${spread} ${length * .9} ${spread * .72} ${length} 0Z`
      return <g key={n}>
        <path d={d} fill={c} fillOpacity=".13" stroke={c} strokeWidth={motif === "rake" ? 2.8 : 4.4} />
        {motif !== "rake" && [.24, .45, .66, .87].map((f) => <path key={f} transform={`translate(${length * f} ${spread * .55})`}
          d={motif === "bastionSweep" ? `M-12 ${-9 * n}h17l13 ${12 * n}h-21Z` : `M-10 0h20l-10 ${16 * n}Z`}
          fill={c} fillOpacity=".22" stroke={c} strokeWidth="2.6" />)}
      </g>
    })}
    {motif !== "rake" && <WardStroke d={`M0 0H${length}`} color={paint.light} width={motif === "bastionSweep" ? 4.8 : 3.3} />}
  </g>
}

function AreaImpact({ shot }: { shot: Shot }) {
  const { fx, p, paint, motif } = shot
  if (!fx.area) return null
  if (motif === "rake" || motif === "divider" || motif === "bastionSweep" || motif === "twinlane" || motif === "borrow")
    return <BandImpact shot={shot} />
  if (motif === "pincer" || motif === "gate") return null
  const q = ease(p)
  return <>
    {circlesOf(fx.area).map(({ center, radius }, i) => {
      if (motif === "parallel") return <g key={i} transform={at(center)}>
        {[0, 1, 2, 3, 4, 5].map((n) => <g key={n} transform={`rotate(${n * 60 + i * 30})`}>
          <path d={arc(radius * (.66 + .34 * q), 5, 52)} fill="none" stroke={spectrum[(n + i * 2) % spectrum.length]} strokeWidth="5" />
          <path d={`M${radius - 28} -9 ${radius - 12} 0 ${radius - 28} 9`} fill="none" stroke={paint.light} strokeWidth="2.8" />
        </g>)}
      </g>
      if (motif === "hammer") return <g key={i} transform={aiming(center, fx.warden.axis)}>
        <circle r={radius * (.54 + .46 * q)} fill={paint.metal} fillOpacity=".14" stroke={paint.light} strokeWidth="4" />
        {[0, 1, 2, 3, 4, 5].map((n) => <g key={n} transform={`rotate(${n * 60 + (n % 2 ? 14 : -8)})`}>
          <WardStroke d={`M22 0 ${radius * .35} -14 ${radius * .51} 9 ${radius * (.51 + .43 * q)} ${n % 2 ? -16 : 16}`}
            color={spectrum[n % spectrum.length]} width={5.3} />
          <path d={arc(radius, 13, 46)} fill="none" stroke={spectrum[n % spectrum.length]} strokeWidth="4" />
        </g>)}
      </g>
      if (motif === "gather" && fx.beat === 1 || motif === "rewind" && fx.beat === 1) return <g key={i} transform={at(center)}>
        <path d={arc(radius * (.97 - q * .24), 21, 186) + arc(radius * (.97 - q * .24), 206, 369)}
          fill="none" stroke={paint.metal} strokeWidth="3.6" strokeDasharray={motif === "rewind" ? "4 9" : undefined} />
      </g>
      if (motif === "tripwire" || motif === "beacon") return <g key={i} transform={at(center)}>
        <path d={arc(radius * (.8 + q * .2), 3, 159) + arc(radius * (.8 + q * .2), 183, 341)}
          fill="none" stroke={paint.accent} strokeWidth={motif === "tripwire" ? 4.8 : 3.2} strokeDasharray="10 5 3 5" />
      </g>
      const axis = fx.warden.axis
      const facing = motif === "exchange" ? direction(fx.from, fx.to) : axis
      return <g key={i} transform={aiming(center, facing)}>
        <path d={arc(radius * (.5 + .5 * q), motif === "breaker" ? -149 : -82, motif === "overlap" ? 144 : 82)}
          stroke={paint.metal} fill="none" strokeWidth={motif === "gather" || motif === "overlap" ? 6.8 : 4.1} />
        {motif !== "rewind" && [-68, -29, 31, 68].map((angle, n) => <path key={angle}
          transform={`rotate(${angle}) translate(${radius * (.38 + .56 * q)} 0)`}
          d={n % 2 ? "M-14-8 12-3 6 10-7 4Z" : "M-10-13 13 0-10 12-3 0Z"} fill={paint.metal} fillOpacity=".35"
          stroke={paint.light} strokeWidth="2.1" />)}
      </g>
    })}
  </>
}

function PushTrace({ shot, contact }: { shot: Shot; contact: WardenContact }) {
  const { fx, motif, paint, p } = shot
  const { at: start, end, past } = contact
  if (!end || edgeDistance(start, end) < 3) return null
  const axis = direction(start, end)
  const span = edgeDistance(start, end)
  const q = ease(p * 2.1)
  const len = span * (.1 + .9 * q)
  const color = motif === "twinlane" ? ((start.x - fx.to.x) * left(fx.warden.axis).x +
    (start.y - fx.to.y) * left(fx.warden.axis).y < 0 ? cool : warm) : motif === "pincer" ? spectrum[3] : paint.metal
  const tug = motif === "winch" || motif === "grapple" || motif === "borrow" || motif === "spring" && fx.beat === 1 || motif === "gather" && fx.beat === 1
  const cracked = motif === "hammer" || motif === "breaker"
  const width = motif === "compass" ? 18 : cracked ? 15 : motif === "pincer" ? 13 : 11
  return <>
    {past && motif === "rewind" && <path d={path([past, start])} fill="none" stroke={paint.accent} strokeWidth="3" strokeDasharray="3 8" opacity=".68" />}
    <g transform={aiming(start, axis)}>
      {tug ? <>
        <path d={`M0-9L${len * .28} -5H${len}M0 9L${len * .28} 5H${len}`} fill="none"
          stroke={color} strokeWidth={motif === "grapple" ? 4.4 : 3.1} strokeDasharray={motif === "winch" ? "12 5" : undefined} />
        <path d={`M${len - 7}-12h10v24h-10`} fill="none" stroke={paint.light} strokeWidth="3.4" />
      </> : <>
        <path d={cracked ? `M0 0 ${len * .24} -14 ${len * .48} 7 ${len * .63} -5 ${len} 0` : `M0 0H${len}`}
          fill="none" stroke={color} strokeWidth={cracked ? 5.2 : 3.5} strokeDasharray={motif === "rewind" ? "12 5" : undefined} />
        <path d={`M${len - 13} ${-width} ${len} 0 ${len - 13} ${width}`}
          fill="none" stroke={paint.light} strokeWidth={motif === "compass" || motif === "pincer" ? 4 : 2.8} />
        {(motif === "deflect" || motif === "compass" || motif === "pincer" || motif === "rewind") &&
          <path d={`M${len * .5 - 9} ${-width * .68} ${len * .5} 0 ${len * .5 - 9} ${width * .68}`}
            fill="none" stroke={color} strokeWidth="3.5" />}
      </>}
    </g>
  </>
}

const contactMarks: Partial<Record<WardenMotif, string>> = {
  knocker: "M-16-27-30-15V15L-16 27M-27 0H-44",
  rake: "M-25-19-10-33M-32-2-8-25M-31 17-13-6",
  spear: "M-37 0H-12M-27-11-11 0-27 11M8-16 18 0 8 16",
  deflect: "M-30-26V-8H-11M-39-17V0H-20",
  winch: "M-26-24h12v14h-6v9h-11M-28 18h9v12",
  grapple: "M-34-27h14v-10h14v14M-32 22h13v9H-6V17",
  compass: "M-38-24-17-16-26-8M-38 24-17 16-26 8",
  beacon: "M-38-13-25-21-13-13M-38 13-25 21-13 13M-33 0h17",
  relay: "M-31-26-22-33-11-25V-15M-31 26-22 33-11 25V15",
  gate: "M-23-39v21l9 8-9 9v21M-32-31v43",
  pincer: "M-42-20H-29L-12 0-29 20H-42M-31 0H-22",
  rewind: "M-35-18-21-5-35 8M-24-18-10-5-24 8",
  hammer: "M-42-31-23-26-14-34M-42 31-23 26-14 34M30-29 44-20 31-13M30 29 44 20 31 13",
  ricochet: "M-38-14-25-25H-12M-38 14-25 25H-12M-33 0-22-9-11 0-22 9Z",
}

function ContactFlash({ shot, contact }: { shot: Shot; contact: WardenContact }) {
  const { fx, p, motif, paint } = shot
  const { at: spot, end } = contact
  const axis = end && edgeDistance(spot, end) > 2 ? direction(spot, end) : fx.warden.axis
  const q = ease(p)
  const opening = 22 + 13 * q
  const c = motif === "pincer" ? cool : paint.light
  const spring = fx.beat === 1 ? "M-40-15H-27l5 8h10M-40 15h13l5-8h10" : "M-37-26-22-11H-9M-37 26-22 11H-9"
  const mark = motif === "spring" ? spring : contactMarks[motif] ??
    `M-12 ${-opening} -27 ${-opening * .49} -34 0 -27 ${opening * .49} -12 ${opening}`
  return <g transform={aiming(spot, axis)}>
    <WardStroke d={mark} color={c} width={motif === "hammer" || motif === "pincer" ? 4.6 : 3.4} />
  </g>
}

function WatchArm({ shot }: { shot: Shot }) {
  const { fx, motif, paint, p } = shot
  const q = ease(p * 2.5)
  const size = 1.27 - .27 * q
  const anchor = fx.to
  const mark = motif === "rearhook" ? "M-32 31H-15L-8 43H8L15 31H32L24 38H16L11 47H-11L-16 38H-24Z"
    : motif === "sling" ? "M-41-31-33-21v30l-7 13M41-31 33-21v30l7 13M-33 14-26 23M33 14 26 23"
    : motif === "relay" ? "M-24 35-16 46H-3L2 39H18L24 29M-11 36-7 40-3 36"
    : "M-39-27v-12h15M24-39h15v12M-39 27v12h15M24 39h15V27"
  return <>
    {(motif === "rearhook" || motif === "sling") && edgeDistance(fx.from, anchor) > 32 && <g opacity={1 - p}>
      <WardStroke d={path([fx.from, mix(fx.from, anchor, q)])} color={paint.accent} width={motif === "sling" ? 3.8 : 2.5} />
    </g>}
    <g transform={at(anchor) + " scale(" + size + ")"}>
      <Plating d={mark} paint={paint} weight={motif === "ricochet" ? 4.2 : 3.1} fill={.25} />
    </g>
  </>
}

function Brace({ shot }: { shot: Shot }) {
  const { fx, p, paint, motif } = shot
  const axis = fx.warden.axis
  if (motif === "rearhook") {
    const stop = fx.warden.paths?.[0]?.end ?? fx.to
    return <g transform={aiming(mix(fx.to, stop, ease(p * 1.8)), axis)}>
      <Plating d="M-46-26H-24L-9 0-24 26H-46L-28 0Z" paint={paint} weight={3.6} fill={.84} />
      <path d={`M${-35 - 18 * p}-15H-26M${-35 - 18 * p} 15H-26`} stroke={paint.accent} strokeWidth="3.6" />
    </g>
  }
  const angle = 23 * Math.sin(p * 10) * (1 - p)
  return <g transform={aiming(fx.to, axis)}>
    <path d="M-54-43-32-23M-54 43-32 23" stroke={paint.metal} strokeWidth="3.4" />
    <g transform={`translate(-43 0) rotate(${angle})`}>
      <Plating d="M-10-27H11L21-13V13L11 27H-10L-16 13V-13Z" paint={paint} weight={4.4} fill={.84} />
      <path d="M-6-14V14M2-18V18M11-13V13" stroke={paint.accent} strokeWidth="2.7" />
    </g>
    <path d={`M-54 -18 ${-63 - 13 * p} -29M-56 0H${-74 - 14 * p}M-54 18 ${-63 - 13 * p} 29`}
      stroke={paint.light} strokeWidth="3.1" />
  </g>
}

function ExileStop({ shot, layer }: { shot: Shot; layer: "floor" | "front" }) {
  const { fx, p, paint, motif } = shot
  const { paths, other } = fx.warden
  const stop = paths?.[0]?.end
  const axis = outward(fx.to)
  const q = ease(p)
  const size = 1 + .32 * q
  if (layer === "floor") return <>
    {stop && <WardStroke d={path([fx.from, stop])} color={paint.light} width={4.3} />}
    {other && <path d={path([fx.to, mix(fx.to, other, .35 + q * .4)])} fill="none" stroke={spectrum[1]}
      opacity=".59" strokeWidth="3.2" strokeDasharray="4 9" />}
    <g transform={aiming(fx.to, axis)}>
      <path d={`M0 ${-79 * size}v${158 * size}`} stroke={paint.light} strokeWidth="4.8" />
      <WardStroke color={spectrum[1]} width={4.5} d={`M${-13 - 8 * q} ${-66 * size}l${10 + 4 * q} 20V${46 * size}l${-10 - 4 * q} 20`} />
    </g>
  </>
  return <g transform={aiming(fx.to, axis)}>
    <Plating d={motif === "boundary" ? "M-16-59H0L10-39V39L0 59H-16V42H-7V-42H-16Z" : "M-20-43H-5L10-26V26L-5 43H-20L-11 30V-30Z"}
      paint={paint} weight={5.3} fill={.85} />
    <path d={motif === "boundary" ? "M-4-38v76M1-28v56" : "M-7-21-15-9 4 0-15 9-7 21"}
      fill="none" stroke={spectrum[motif === "boundary" ? 3 : 0]} strokeWidth="4.2" />
  </g>
}

function StopCharge({ shot }: { shot: Shot }) {
  const { fx, p, paint, motif } = shot
  const axis = direction(fx.to, fx.from)
  const span = edgeDistance(fx.to, fx.from)
  const focus = along(fx.to, axis, Math.min(span * .45, 83))
  const gap = 8 + 37 * ease(p)
  const cut = motif === "hammer" ? 49 : motif === "tripwire" ? 37 : 26
  return <g transform={aiming(focus, axis)}>
    <path d={`M${-cut - gap}-14h${cut}l-9 10 9 9H${-cut - gap}M${cut + gap}-14h${-cut}l9 10-9 9H${cut + gap}`}
      fill="none" stroke={paint.metal} strokeWidth="4.2" />
    <WardStroke d={motif === "hammer" || motif === "breaker" ? `M-17 ${-cut} 12-9-12 8 17 ${cut}`
      : motif === "stamp" ? "M-13-34v68M13-34v68" : `M-14 ${-cut} 12 ${cut}M12 ${-cut} -14 ${cut}`}
      color={paint.light} width={motif === "hammer" ? 6 : 4.4} />
  </g>
}

function FieldClick({ shot }: { shot: Shot }) {
  const { fx, motif, p, paint } = shot
  const q = ease(p)
  if (motif === "pincer") return null
  if (motif === "gate") {
    const strip = wardenStrip(fx.area?.parts[0])
    if (!strip) return null
    const { from, to } = strip
    return <g transform={aiming(mix(from, to, .5), direction(from, to))}>
      <WardStroke d={`M${-100 * q} 0H${100 * q}`} color={paint.light} width={5.1} />
    </g>
  }
  if (motif === "boundary") return <g transform={at(fx.to) + " rotate(" + (45 * q) + ")"}>
    <Plating d={diamond} paint={paint} weight={4} fill={.64} />
    <path d="M-16-16 16 16M16-16-16 16" stroke={spectrum[3]} strokeWidth="3" />
  </g>
  if (motif === "advance") return <g transform={aiming(fx.to, fx.warden.axis)}>
    <path d={`M-16 ${-52 * q} 2 ${-35 * q}V${35 * q}L-16 ${52 * q}`} fill="none" stroke={paint.light} strokeWidth="4.8" />
  </g>
  return <g transform={at(fx.to)}>
    <Plating d={motif === "tripwire" ? "M-37 18H37L0-34Z" : "M-24-20H24L30-8 0 25-30-8Z"} paint={paint} weight={4} fill={.73} />
    {motif === "beacon" && <path d="M-20-8H20M-13 1H13M-7 11H7" stroke={paint.light} strokeWidth="2.8" />}
  </g>
}

function LandedHit({ shot, layer }: { shot: Shot; layer: "floor" | "front" }) {
  const { fx, paint, p, motif } = shot
  const paths = fx.warden.paths ?? []
  if (layer === "floor") return <>
    <AreaImpact shot={shot} />
    {paths.map((contact, i) => <PushTrace key={i} shot={shot} contact={contact} />)}
  </>
  const cut = motif === "tripwire" && fx.warden.other
    ? path([fx.area?.center ?? fx.from, mix(fx.area?.center ?? fx.from, fx.warden.other, .56), fx.warden.other]) : undefined
  return <>
    {cut && <WardStroke d={cut} color={paint.accent} width={5.4} />}
    {motif === "hammer" && p < .45 && <g opacity={1 - p / .45}><Hammer center={fx.to} p={1} paint={paint} /></g>}
    {motif === "ricochet" && paths.length > 0 && fx.warden.other && <WardStroke
      d={path([fx.warden.other, mix(fx.warden.other, paths[0].at, .35), paths[0].at])} color={spectrum[0]} width={3.4} />}
    {paths.map((contact, i) => <ContactFlash key={i} shot={shot} contact={contact} />)}
  </>
}

function DragMark({ shot }: { shot: Shot }) {
  const { fx, motif, p, paint } = shot
  return <g transform={at(fx.to)}>
    {[-1, 0, 1].map((n) => <path key={n} transform={`translate(${n * (16 + 7 * ease(p))} 0)`}
      d={motif === "twinlane" ? "M-6 30V44H4M-6 37H6" : "M-8 31 1 36-7 42"}
      fill="none" stroke={motif === "twinlane" ? cool : paint.accent} strokeWidth="3.4" />)}
  </g>
}

function WardenBeatArt({ shot, battle, layer }: { shot: Shot; battle: EdgeBattle; layer: "floor" | "front" }) {
  const { fx, paint, motif, p } = shot
  const { cue, paths } = fx.warden
  const floor = layer === "floor"
  switch (cue) {
    case "prepare": return floor ? <Forecast shot={shot} battle={battle} /> : <Windup shot={shot} battle={battle} />
    case "travel": return <Dash shot={shot} battle={battle} layer={layer} />
    case "arrival": return <Landing shot={shot} layer={layer} />
    case "swap": {
      const route = paths?.[0]
      return floor && route?.end ? <SwapArcs from={route.at} to={route.end} p={p} paint={paint} parallel={motif === "parallel"} resolved /> : null
    }
    case "shield": return floor ? null : <WardArrival shot={shot} />
    case "arm": return floor ? null : <WatchArm shot={shot} />
    case "brace": return floor ? null : <Brace shot={shot} />
    case "deploy": return floor ? <FieldClick shot={shot} /> : null
    case "interrupt": return floor ? null : <StopCharge shot={shot} />
    case "stop": return <ExileStop shot={shot} layer={layer} />
    case "slow": return floor ? null : <DragMark shot={shot} />
    case "relay": return floor
      ? <>{paths?.map((contact, i) => <PushTrace key={i} shot={shot} contact={contact} />)}</>
      : <g transform={aiming(fx.to, fx.warden.axis)}>
        <Plating d="M-54-24-33-18-18 0-33 18-54 24-41 0Z" paint={paint} weight={4.3} fill={.8} />
        <path d="M-50-10-36 0-50 10M-27-19-15-28M-27 19-15 28" fill="none" stroke={paint.light} strokeWidth="3.4" />
      </g>
    case "hit": return <LandedHit shot={shot} layer={layer} />
  }
}

export function EdgeWardenEffects({ battle, layer }: { battle: EdgeBattle; layer: "floor" | "front" }) {
  return <g className="edge-skill-vfx" aria-hidden="true">
    {battle.runtime.effects.map((fx) => {
      if (!fx.warden || battle.time < fx.start || battle.time >= fx.end) return null
      const art = wardenChoreography(fx.skill)
      if (!art) return null
      const p = unit((battle.time - fx.start) / (fx.end - fx.start))
      const { cue } = fx.warden
      const opacity = cue === "prepare" || cue === "travel" ? 1 : (1 - unit((p - .16) / .84)) ** 1.34
      return <g key={fx.id} data-warden-cue={cue} data-warden-motif={art.motif} opacity={opacity}>
        <WardenBeatArt shot={{ fx: { ...fx, warden: fx.warden }, motif: art.motif, paint: armorPaint[fx.rarity], p }}
          battle={battle} layer={layer} />
      </g>
    })}
  </g>
}
