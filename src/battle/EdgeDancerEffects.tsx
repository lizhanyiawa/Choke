import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, armorPaint, at, circlesOf, ease, heading, mix, path, polar, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { dancerChoreography, dancerPointAt, trimDancerPath, type DancerMotif, type DancerPath } from "./edgeSkills/dancerChoreo"
import { along, areaPath, direction, edgeDistance, isOutside, left, type EdgeArea } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { isFighter, unitOf, type FieldEffect } from "./edgeSkills/state"

type Fx = SkillVisual & { dancer: NonNullable<SkillVisual["dancer"]> }
type Layer = "floor" | "front"
type Paint = ArmorPaint

const shapes = {
  leadRibbon: "M-21 11Q-13-19-4-15L3-1Q11-17 20-14L23-5 10 16 2 15-4 7-10 18Z",
  heelStamp: "M-20-18H0V-8H18V15H-18V6H-23Z M-11-7H-3M-8 6H10",
  footCradle: "M-27 4Q-21-24-7-21L-1-6 6-21Q24-18 28 5L15 19-1 12-15 19Z",
  halfTurn: "M-27-3Q-9-26 17-13L27-2 8 0Q-11 1-13 17L-22 14Z",
  sideSweep: "M-27 8-16-13 26-20 19-5-5 8 23 8 11 21-23 20Z",
  leadSide: "M-25-11-6-21 20-9 25 2 11 17-14 20-23 12 6 8 11-1Z",
  braceSash: "M-27-9-13-23 16-20 25-7 15 8 25 15 7 25-10 14-21 18-16 4Z",
  landingLamp: "M-10-24H9L18-12 15 10 26 22H-26L-15 10-18-12Z M-8-7 0-13 8-7 0 8Z",
  threadCut: "M-30 20-14-13 27-22 17-7 10-2 24-1-8 15Z",
  lightPost: "M-8-28H9L15-13 5 3 9 16 26 23-26 23-9 16-6 4-16-12Z",
  longMeter: "M-30 13-15-12H-5V-19H8V-24H23V-12H29V4L9 13-9 12-18 23Z",
  entryLace: "M-29 5-15-21-4-17 5-8 17-23 30-16 19 6 7 16-1 8-13 25Z",
  oldStep: "M-27 15-16-18-3-23 9-6 25-20 31-6 22 17 10 25 1 9-11 21Z",
  clearLane: "M-32-14-19-24-2-9 15-22 30-13 23 1 34 12 17 24 2 8-16 24-30 11Z",
  stopDrum: "M-27-13Q-2-29 27-13L23 12Q-1 27-24 12Z M-21-10Q-2 7 21-10",
  pairedRibbon: "M-33-19-14-25-1-10 13-24 33-15 20 3 31 19 11 25 0 11-15 24-33 16-21 1Z",
  reboundAnchor: "M-9-29H11L16-18 10-4H23L31 11 18 27 0 21-18 27-32 12-23-2H-9Z",
  wakeFan: "M-35 4Q-19-31 32-20L26-3 10 7 30 18-6 26Z M-17 1 15-13M-6 12 16 6",
  stillRing: "M-34-2-19-25-1-29 23-21 34 0 18 24-5 27-26 16Z M-17 3-4-13 7 8 18-6",
  partedLane: "M-32-17-14-27 14-20 34-3 14 5 29 20 12 28-13 21-34 5-13-4Z",
  hopNote: "M-36 14Q-18-31 19-28L33-16 17-11Q-7-4-14 20L-24 27Z",
  doubleJump: "M-37 16-23-28-6-21-11-3 9-8 17-28 35-22 28 8 14 27 0 19 4 6-19 20Z",
  goldRailPair: "M-35-24H-21V-14H-8L-2-4 6-18 16-19V-29H33V15L19 24H7L-4 10-19 22H-36Z",
  borrowStep: "M-37 13-24-17-9-10 3-27 17-13 36-10 28 5 13 11 7 26-6 21-22 29Z",
  guardRail: "M-37-20-22-28-10-17 8-17 22-29 37-18 24-1 39 16 20 28 7 16-10 17-26 29-38 15-24-1Z",
  quarterOrbit: "M-39 8Q-36-31-6-31Q21-34 39-6L24 6Q16-15-4-10Q-21-11-22 18Z",
  inwardFans: "M-39-17-18-32-6-7 12-33 37-21 30 0 8 15 1 28-13 14-29 6Z",
  retreatFlash: "M-38-20-16-27-4-11 23-29 39-16 22-2 31 12 9 28-11 15-32 24-22 4Z",
  threeBeat: "M-39 14-29-26-16-31-10-12-2-28 13-29 18-12 25-24 40-20 34 16 18 29 8 14-5 29-15 11-28 23Z",
  counterSwing: "M-39 5Q-21-31 10-30L36-16 24 5 4 1-15 17 4 21 20 9 35 18 20 30-10 31-28 19Z",
  finaleSlider: "M-42-7Q-35-32-12-26L8-18 29-28 42-12 35 9 16 19-2 12-20 29-39 15Z M-24 3-12-9 4 2 18-8 26-1",
  foldSlider: "M-43 17-23-18-6-30 7-12 22-29 43-15 25 5 30 25 11 31-4 15-21 29Z",
  reversePrint: "M-44-16-25-33-5-24 9-31 38-19 44 2 27 16 12 29-6 17-27 29-40 11-27-4Z M-27 6-8-9 8 1 24-12",
  rushCrests: "M-43 9-33-27-17-31-8-17 3-34 19-24 21-12 36-24 44-9 32 18 14 31 5 14-10 30-26 15-37 24Z",
  coastRelay: "M-45 11-34-25-13-35-5-17 12-34 37-25 45-5 26 9 29 22 9 33-5 21-28 31-41 22Z M-27 10 0-13 23 1",
} satisfies Record<DancerMotif, string>

const pose = (p: EdgePoint, angle = 0, scale = 1) => at(p) + " rotate(" + angle + ") scale(" + scale + ")"
const foot = (p: EdgePoint, side = 0) => ({ x: p.x + side, y: p.y + 33 })
const series = (n: number) => Array.from({ length: n }, (_, i) => i)

function Seal({ at: where, motif, paint, size = 1, angle = 0 }: {
  at: EdgePoint; motif: DancerMotif; paint: Paint; size?: number; angle?: number
}) {
  const d = shapes[motif]
  return <g transform={pose(where, angle, size)} strokeLinejoin="round" strokeLinecap="round">
    <path d={d} stroke={paint.metal} strokeWidth="7" strokeOpacity=".23" fill={paint.ink} fillOpacity=".56" />
    <path d={d} stroke={paint.light} strokeWidth="1.8" fill={paint.metal} fillOpacity=".17" />
  </g>
}

function Note({ at: where, radius, paint, charge = 1, quiet = false }: {
  at: EdgePoint; radius: number; paint: Paint; charge?: number; quiet?: boolean
}) {
  return <g transform={at(where)} fill="none" stroke={paint.light}>
    <circle r={radius} strokeWidth={quiet ? 1.5 : 3.1} strokeOpacity={quiet ? .60 : .9} />
    <circle r={radius * .73} pathLength="100" strokeDasharray={Math.max(.1, charge * 100) + " 100"}
      strokeWidth="2.6" stroke={paint.accent} transform="rotate(-90)" />
    {!quiet && <path d={arc(radius + 8, -114, -37) + " " + arc(radius + 8, 59, 136)} stroke={paint.metal} strokeWidth="2.1" />}
  </g>
}

function Ribbon({ route, paint, progress = 1, width = 5, dashed = false, iridescent = false }: {
  route: DancerPath; paint: Paint; progress?: number; width?: number; dashed?: boolean; iridescent?: boolean
}) {
  if (route.length < .1) return null
  const walked = trimDancerPath(route, Math.max(.001, unit(progress) * route.length))
  const d = path(walked.points)
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={paint.metal} strokeOpacity={dashed ? .07 : .21} strokeWidth={width * 4.1} />
    <path d={d} stroke={paint.accent} strokeDasharray={dashed ? "8 9" : undefined} strokeWidth={width} strokeOpacity={dashed ? .72 : .91} />
    {iridescent && walked.points.slice(1).map((to, i) => <path key={i} d={path([walked.points[i], to])}
      stroke={spectrum[i % spectrum.length]} strokeWidth={width * .76} />)}
    {!dashed && <path d={d} stroke={paint.light} strokeWidth={width * .31} />}
  </g>
}

function Lane({ area, motif, paint, time, progress, field = false }: {
  area: EdgeArea; motif: DancerMotif; paint: Paint; time: number; progress: number; field?: boolean
}) {
  const polygon = area.parts[0]
  if (polygon?.kind !== "polygon" || polygon.points.length !== 4) return null
  const [a, b, c, d] = polygon.points
  const from = mix(a, d, .5), to = mix(b, c, .5), length = edgeDistance(from, to)
  const width = edgeDistance(a, d)
  const z = field ? 1 : .2 + progress * .8
  const side = [-1, 1]
  return <g transform={pose(from, heading(direction(from, to)))} fill="none" strokeLinecap="round" strokeLinejoin="round">
    {motif === "sideSweep" ? side.map((n, i) => <path key={n} d={"M0 " + (n * width * .19) +
      " Q" + length * .46 * z + " " + n * width * .54 + " " + length * (i ? .92 : 1) * z + " " + n * width * .36}
      stroke={i ? paint.accent : paint.light} strokeWidth={i ? 3 : 5} />)
      : motif === "clearLane" ? series(8).map(i => <path key={i} transform={"translate(" + length * i / 8 * z + " 0)"}
        d={"M-8 " + (-width * .38) + "L17 0-8 " + width * .38} stroke={i % 3 ? paint.metal : paint.accent}
        strokeOpacity={.72} strokeWidth="2.8" />)
      : motif === "partedLane" ? side.map(n => <path key={n}
        d={"M0 0Q" + length * .43 * z + " " + n * width * .53 + " " + length * z + " " + n * width * .36 +
          "L" + length * z * .88 + " " + n * width * .1 + "Q" + length * .33 * z + " " + n * width * .32 + " 0 0Z"}
        stroke={n < 0 ? paint.accent : paint.light} strokeWidth="2.8" fill={paint.metal} fillOpacity=".22" />)
      : motif === "guardRail" ? side.map(n => <path key={n} d={"M0 " + n * width * .33 + "H" + length}
        stroke={paint.light} strokeWidth="3" strokeDasharray="18 8 4 8" strokeDashoffset={time * -26} />)
      : motif === "threeBeat" ? [-1, 0, 1].map(n => <path key={n} d={"M0 " + n * width * .27 + "H" + length}
        stroke={n ? paint.metal : paint.light} strokeWidth={n ? 2 : 2.7} strokeDasharray="6 13 18 9"
        strokeDashoffset={time * -42 + n * 9} />)
      : <path d={"M0 0H" + length * z} stroke={paint.light} strokeWidth="3.4" />}
  </g>
}

function RingPattern({ area, motif, paint, t, event }: {
  area: EdgeArea; motif: DancerMotif; paint: Paint; t: number; event?: string
}) {
  return <>{circlesOf(area).map(({ center, radius }, index) => {
    const relay = motif === "coastRelay"
    const fan = motif === "wakeFan" || motif === "counterSwing"
    const links = motif === "landingLamp" ? 8 : relay ? 6 : motif === "stillRing" || motif === "inwardFans" ? 3 : 4
    const rotation = motif === "counterSwing" ? -52 * t : relay ? 44 * t : t * 22
    return <g key={index} transform={pose(center, rotation)} fill="none" strokeLinecap="round">
      {series(links).map(i => {
        const angle = i * 360 / links
        const where = polar(radius * (fan ? .65 + .23 * t : .83), angle)
        const split = motif === "entryLace" ? "M-19-7Q-3 13 19-7M-14 0Q-2-13 14 0"
          : relay ? "M-20 10-11-14 13-12 20 4 9 16Z M-12 3 10-5"
          : motif === "stillRing" ? "M-12-8V7M0-12V10M12-7V6"
          : motif === "borrowStep" ? "M-20-8 0 12 20-8M-10-13 0-3 10-13"
          : fan ? "M-24 10Q-9-23 23-12L10-4 21 8Q-3 14-24 10Z"
          : motif === "landingLamp" ? "M-8-9 0-18 8-9 0 10Z" : "M-13-11 2-16 16-1 5 14-13 7Z"
        return <path key={i} d={split} transform={pose(where, angle + 90, event === "empty" ? .73 : .81 + .19 * t)}
          fill={relay ? spectrum[i % spectrum.length] : paint.metal} fillOpacity={fan ? ".23" : ".11"}
          stroke={i % 2 ? paint.accent : paint.light} strokeWidth={relay ? "3.2" : "2.1"} />
      })}
      {(motif === "quarterOrbit" || motif === "inwardFans" || motif === "stillRing") &&
        <path d={arc(radius * .71, -87, 31) + " " + arc(radius * .71, 93, 211)} stroke={paint.accent} strokeWidth="2.2" />}
      {relay && <circle r={radius * (.47 + t * .43)} stroke={paint.light} strokeDasharray="9 12" strokeWidth="3.2" />}
    </g>
  })}</>
}

export function EdgeDancerField({ field, battle }: { field: FieldEffect; battle: EdgeBattle }) {
  const id = field.cast.skill?.id, art = dancerChoreography(id)
  const owner = unitOf(battle, field.cast.owner)
  if (!art || !owner || !isFighter(owner) || field.until <= battle.time) return null
  const { motif } = art, paint = armorPaint[owner.card.rarity]
  const time = battle.time - field.time
  const remaining = unit((field.until - battle.time) / .32)
  const open = unit(time / .24)
  const rail = field.danceRail
  const used = field.seen.size
  return <g pointerEvents="none" aria-hidden="true" data-dancer-field={id} data-dancer-mode={field.mode} opacity={remaining * (.53 + .36 * open)}>
    {field.area.parts.map((part, i) => <path key={i} d={areaPath({ center: field.area.center, parts: [part] })}
      fill={paint.metal} fillOpacity={motif === "finaleSlider" ? ".11" : ".06"} fillRule="evenodd"
      stroke={paint.accent} strokeWidth="1.8" strokeDasharray="8 10" opacity=".73" />)}
    {rail && (motif === "finaleSlider" || motif === "foldSlider") ? <>
      <Ribbon route={rail.path} paint={paint} progress={.11 + .89 * ease(open)} width={motif === "finaleSlider" ? 11 : 7} iridescent />
      <Note at={rail.path.points[0]} radius={38} paint={paint} quiet={motif === "foldSlider"} />
      <Note at={rail.path.points.at(-1)!} radius={38} paint={paint} quiet={motif === "foldSlider"} />
      {rail.corner && <>
        <Note at={rail.corner} radius={36} paint={paint} charge={1} />
        <Seal at={rail.corner} motif={motif} paint={paint} size={.55} angle={time * 18} />
      </>}
      {!rail.corner && <circle cx={dancerPointAt(rail.path, (time * .52) % 1).x} cy={dancerPointAt(rail.path, (time * .52) % 1).y}
        r="8" fill={paint.light} opacity=".74" />}
    </> : <>
      <Lane area={field.area} motif={motif} paint={paint} time={time} progress={open} field />
      <RingPattern area={field.area} motif={motif} paint={paint} t={open * .62} />
    </>}
    {motif === "landingLamp" && <Seal at={field.area.center} motif={motif} paint={paint} size={.83 + .06 * Math.sin(time * 6)} />}
    {motif === "threeBeat" && rail && [0, 1].map(i => <circle key={i} cx={dancerPointAt(rail.path, .22 + .11 * i).x}
      cy={dancerPointAt(rail.path, .22 + .11 * i).y} r="8.5" fill={i < used ? "none" : paint.light}
      stroke={paint.metal} opacity={i < used ? .36 : .94} strokeWidth="2.4" />)}
    {field.danceStill && [...field.danceStill].map(([id, since]) => {
      const holder = unitOf(battle, id)
      return holder?.hp && <Note key={id} at={foot(holder)} radius={29} paint={paint} charge={unit((battle.time - since) / .9)} quiet />
    })}
  </g>
}

function Traverse({ fx, battle, motif, paint, t, layer }: {
  fx: Fx; battle: EdgeBattle; motif: DancerMotif; paint: Paint; t: number; layer: Layer
}) {
  const { cue, kind, paths = [] } = fx.dancer
  const travel = cue === "travel"
  const ready = cue === "prepare"
  const orbit = kind === "orbit" || ["quarterOrbit", "counterSwing", "coastRelay"].includes(motif)
  const simultaneous = paths.length >= 2 && (motif === "pairedRibbon" || motif === "goldRailPair")
  const points = paths.map(({ unit: id, route }) => {
    const target = unitOf(battle, id)
    const moving = kind === "walk" ? !!target?.move && battle.runtime.histories.get(target.id)?.danceStep?.cast.id === fx.cast
      : !!target?.hp && target.force?.route === route
    const progress = ready ? 1 : travel ? kind === "walk" && target ? unit(edgeDistance(route.points[0], target) / route.length) : t : 1
    return { id, route, progress, moving, at: dancerPointAt(route, progress) }
  }).filter(row => !travel || row.moving)
  if (layer === "floor") return <>
    {points.map(({ id, route, progress, at: head }) => {
      const old = route.points[0], end = route.points.at(-1)!
      const jump = kind === "hop" || motif === "doubleJump"
      const steps = motif === "reversePrint" ? Math.min(13, route.points.length) : orbit ? 5
        : ["heelStamp", "longMeter", "rushCrests", "borrowStep"].includes(motif) ? 6 : 0
      return <g key={id ?? route.length} opacity={ready ? .67 : cue === "land" ? .58 : 1}>
        <Ribbon route={route} paint={paint} progress={ready ? 1 : Math.max(.08, progress)}
          width={kind === "glide" ? 11 : motif === "threadCut" ? 7 : motif === "goldRailPair" ? 7 : 4.2}
          dashed={ready} iridescent={["coastRelay", "finaleSlider", "reversePrint", "rushCrests"].includes(motif)} />
        {travel && <path d={path(route.points)} fill="none" stroke={paint.accent} strokeOpacity=".44" strokeWidth="2.3" strokeDasharray="6 10" />}
        {jump && !ready && <path d={"M" + old.x + " " + old.y + "Q" + ((old.x + end.x) / 2) + " " +
          (Math.min(old.y, end.y) - 95) + " " + end.x + " " + end.y} stroke={paint.metal} strokeWidth="2.8"
          fill="none" strokeOpacity={travel ? .83 : .36} strokeDasharray="15 8" />}
        {series(steps).map(i => {
          const q = (i + .55) / steps, p = dancerPointAt(route, q)
          const angle = heading(direction(dancerPointAt(route, Math.max(0, q - .06)), p))
          return <Seal key={i} at={p} motif={motif} paint={paint} size={q < progress ? .40 : .30} angle={angle + (i % 2 ? -9 : 10)} />
        })}
        {["heelStamp", "longMeter", "rushCrests"].includes(motif) && route.length > 190 && <Note at={dancerPointAt(route, 190 / route.length)}
          radius={18} paint={paint} quiet />}
        <Note at={end} radius={kind === "glide" || jump ? 37 : 25} paint={paint} charge={progress} quiet={ready} />
        {travel && (orbit || kind === "glide" || motif === "reversePrint") && <Note at={head} radius={kind === "glide" ? 41 : 28} paint={paint} />}
      </g>
    })}
    {simultaneous && points.length >= 2 && <path d={path(points.map(p => p.at))} fill="none"
      stroke={paint.light} strokeWidth={motif === "goldRailPair" ? 5 : 3.4} strokeDasharray={motif === "goldRailPair" ? "14 7 4 7" : undefined} />}
  </>
  return <>{points.map(({ id, at: head, route }) => <Seal key={id ?? route.length} at={foot(head, 16)} motif={motif} paint={paint}
    size={ready ? .40 : travel ? .72 : .86 + .15 * t} angle={heading(direction(route.points[0], route.points.at(-1)!)) + (orbit ? 46 * t : 9 * t)} />)}</>
}

function DancerStrike({ fx, motif, paint, t, layer }: { fx: Fx; motif: DancerMotif; paint: Paint; t: number; layer: Layer }) {
  const { area, contacts = [] } = fx
  const { kind, paths } = fx.dancer
  if (!area) return null
  if (layer === "floor") return <>
    <path d={areaPath(area)} fill={paint.metal} fillOpacity={kind === "empty" ? ".035" : ".10"} fillRule="evenodd"
      stroke={paint.accent} strokeWidth="2.4" strokeOpacity=".84" />
    <Lane area={area} motif={motif} paint={paint} time={t} progress={t} />
    <RingPattern area={area} motif={motif} paint={paint} t={t} event={kind} />
    {paths?.map(({ unit, route }) => <Ribbon key={unit} route={route} paint={paint} progress={.25 + .75 * ease(t)}
      width={motif === "coastRelay" ? 6.2 : 4.2} iridescent={motif === "coastRelay"} />)}
  </>
  return <>{contacts.map((p, i) => <Seal key={i} at={foot(p, i % 2 ? -22 : 19)} motif={motif}
    paint={paint} size={.71 + .22 * t} angle={i % 2 ? -23 * t : 32 * t} />)}</>
}

function SupportBeat({ fx, at: target, motif, paint, t, layer }: {
  fx: Fx; at: EdgePoint; motif: DancerMotif; paint: Paint; t: number; layer: Layer
}) {
  const { cue, kind } = fx.dancer
  const radius = motif === "coastRelay" || motif === "reversePrint" ? 49 : motif === "stopDrum" ? 38 : 31
  const open = ease(t)
  const start = fx.dancer.other ?? fx.from
  const gap = edgeDistance(start, target)
  if (layer === "floor") return <>
    {gap >= 8 && <path d={"M" + start.x + " " + start.y + "Q" + ((start.x + target.x) / 2 + 15) + " " +
      ((start.y + target.y) / 2 - 12) + " " + target.x + " " + target.y}
      pathLength="100" strokeDasharray={cue === "miss" ? "7 11" : (25 + 75 * open) + " 101"} fill="none"
      stroke={kind === "heal" ? paint.accent : paint.metal} strokeWidth={cue === "release" ? "3.4" : "2.4"} />}
    {cue === "release" && (kind === "entry" || kind === "hinge" || kind === "still") &&
      <Note at={fx.to} radius={radius + open * 17} paint={paint} charge={open} />}
    {cue === "prepare" && fx.area && <path d={areaPath(fx.area)} fill={paint.ink} fillOpacity=".2" fillRule="evenodd"
      stroke={paint.accent} strokeWidth="2.3" strokeDasharray="8 10" />}
    {cue === "prepare" && fx.area && <Lane area={fx.area} motif={motif} paint={paint} time={t} progress={open} />}
    {cue === "benefit" && kind === "shield" && <path d={arc(radius + 11 + open * 7, 12, 167)}
      transform={at(target)} fill="none" stroke={paint.accent} strokeWidth="3.1" />}
  </>
  return <>
    {cue !== "deploy" && <Seal at={foot(target, cue === "prepare" ? 24 : 16)} motif={motif} paint={paint}
      size={cue === "prepare" || cue === "mark" ? .50 + .12 * open : .71 + .23 * open} angle={cue === "release" ? 32 * t : -16 + 13 * t} />}
    {kind === "shield" && [-1, 1].map(side => <path key={side} transform={at(target) + " scale(" + side + " 1)"}
      d={"M" + radius * .62 + " 25Q" + (radius + open * 13) + " 2 " + radius * .76 + " -29L" + radius * .52 + " -20"}
      fill="none" stroke={paint.light} strokeWidth={motif === "goldRailPair" ? "4.8" : "3.1"} strokeLinecap="round" />)}
    {kind === "heal" && <path d="M-27 0Q-10 16 0-15Q9 11 27-8" transform={pose(foot(target), -14, .7 + .36 * open)}
      stroke={paint.light} fill="none" strokeWidth="2.7" />}
  </>
}

function DancerReadiness({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  const marks = new Set<string>()
  return <>
    {battle.runtime.buffs.map(buff => {
      const id = buff.cast.signature ? undefined : buff.cast.skill?.id
      const art = dancerChoreography(id), holder = unitOf(battle, buff.target), owner = unitOf(battle, buff.cast.owner)
      if (!art || !holder?.hp || !owner || !isFighter(owner) || buff.until <= battle.time) return null
      const paint = armorPaint[owner.card.rarity], kind = buff.kind, motif = art.motif
      const remaining = unit((buff.until - battle.time) / .24)
      const key = buff.id + "/" + buff.target + "/" + buff.cast.owner
      if (layer === "floor") {
        if (kind !== "speed" || !holder.move || holder.force || isOutside(holder)) return null
        const from = along(holder, direction(holder.move, holder), 57 + 12 * Math.sin(battle.time * 16))
        const across = left(direction(from, holder))
        return <g key={key} data-dancer-ready={id} opacity={remaining * .72}>
          {[-1, 1].map(n => <path key={n} d={path([along(from, across, n * 17), along(holder, across, n * 9)])}
            stroke={n > 0 ? paint.light : paint.metal} strokeWidth={motif === "footCradle" ? "2.1" : "3.5"}
            strokeDasharray={motif === "footCradle" ? undefined : "12 10"} strokeDashoffset={battle.time * -26 + n * 5} />)}
        </g>
      }
      return <g key={key} data-dancer-ready={id} opacity={remaining * .75}>
        <Seal at={foot(holder, kind === "anti" ? -28 : 24)} motif={motif} paint={paint} size={kind === "res" ? .51 : .41} />
        {kind === "res" && motif === "quarterOrbit" && <path d={arc(49, -141, 19)} transform={at(holder)} stroke={paint.light} strokeWidth="3.1" fill="none" />}
      </g>
    })}
    {battle.runtime.watches.map(watch => {
      const id = watch.cast.signature ? undefined : watch.cast.skill?.id
      const art = dancerChoreography(id), holder = unitOf(battle, watch.target), owner = unitOf(battle, watch.cast.owner)
      const key = id + "@" + watch.cast.owner + "/" + watch.target
      if (!art || !holder?.hp || !owner || !isFighter(owner) || watch.until <= battle.time || watch.uses <= 0 || marks.has(key)) return null
      marks.add(key)
      const old = watch.event?.from
      const fixed = ["oldStep", "reboundAnchor", "lightPost"].includes(art.motif) && old
      const paint = armorPaint[owner.card.rarity]
      return <g key={key} data-dancer-ready={id} opacity={.67 * unit((watch.until - battle.time) / .30)}>
        {layer === "floor" && fixed && <>
          <Note at={fixed} radius={art.motif === "oldStep" ? 78 : 26} paint={paint} quiet />
          <line x1={fixed.x} y1={fixed.y} x2={holder.x} y2={holder.y} stroke={paint.metal} strokeWidth="2.3" strokeDasharray="6 8" />
        </>}
        {layer === "front" && <Seal at={foot(fixed || holder, 18)} motif={art.motif} paint={paint} size={.51} />}
      </g>
    })}
  </>
}

export function EdgeDancerEffects({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g pointerEvents="none" aria-hidden="true">
    {battle.runtime.effects.map((effect) => {
      const art = dancerChoreography(effect.skill), dancer = effect.dancer
      if (!art || !dancer || effect.start > battle.time || effect.end <= battle.time) return null
      const fx = { ...effect, dancer }
      const { motif } = art
      const t = unit((battle.time - fx.start) / Math.max(.001, fx.end - fx.start))
      const paint = armorPaint[fx.rarity], target = unitOf(battle, fx.target)
      const to: EdgePoint = dancer.cue === "prepare" && target?.hp ? target : fx.to
      return <g key={fx.id} data-dancer-active={fx.skill} data-dancer-cue={dancer.cue}
        opacity={dancer.cue === "prepare" ? .75 : dancer.cue === "travel" ? .9 : 1 - t ** 1.46}>
        {dancer.paths?.length && (dancer.cue === "travel" || dancer.cue === "prepare" || dancer.cue === "land")
          ? <Traverse fx={fx} battle={battle} motif={motif} paint={paint} t={t} layer={layer} /> : null}
        {dancer.cue === "strike" ? <DancerStrike fx={fx} motif={motif} paint={paint} t={t} layer={layer} />
          : dancer.cue !== "travel" && <SupportBeat fx={fx} at={to} motif={motif} paint={paint} t={t} layer={layer} />}
      </g>
    })}
    <DancerReadiness battle={battle} layer={layer} />
  </g>
}
