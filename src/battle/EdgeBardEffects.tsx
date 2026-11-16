import type { Rarity } from "@/card/types"

import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, armorPaint, at, circlesOf, ease, heading, lineOf, mix, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { bardChoreography } from "./edgeSkills/bardChoreo"
import { along, areaPath, direction, edgeDistance, inside, isOutside, left, outward, type EdgeArea } from "./edgeSkills/geometry"
import type { SkillVisual } from "./edgeSkills/presentation"
import { bardActiveReadiness } from "./edgeSkills/runtime"
import { alliesOf, isFighter, unitOf, type FieldEffect } from "./edgeSkills/state"

type Art = NonNullable<ReturnType<typeof bardChoreography>>
type Layer = "floor" | "front"
type Beat = NonNullable<SkillVisual["bard"]>
type Scene = { fx: SkillVisual; beat: Beat; art: Art; paint: ArmorPaint; to: EdgePoint; t: number; layer: Layer }
const steps = (n: number) => Array.from({ length: n }, (_, i) => i)
const pose = (p: EdgePoint, angle = 0, size = 1) => at(p) + " rotate(" + angle + ") scale(" + size + ")"
const offset = ({ x, y }: EdgePoint, dx: number, dy: number) => ({ x: x + dx, y: y + dy })
const codaShell = "M-40-15H40V3Q29 24 0 30-29 24-40 3ZM-29-6H29"
const bridgeGate = "M-13-54L0-42l13-12M-13 54L0 42l13 12M0-32V32M-6-23v46m12-46v46"

function Crest({ where, art, paint, size = 1, turn = 0 }: { where: EdgePoint; art: Art; paint: ArmorPaint; size?: number; turn?: number }) {
  return <g transform={pose(where, turn, size)} strokeLinecap="round" strokeLinejoin="round">
    <path d={art.crest} stroke={paint.metal} strokeWidth="9" strokeOpacity=".16" fill="none" />
    <path d={art.crest} stroke={paint.light} strokeWidth="2.6" fill={paint.ink} fillOpacity=".24" />
  </g>
}

function Rail({ from, to, bend = 0, end = 1, paint, width = 3, tint, dash, head = false }: {
  from: EdgePoint; to: EdgePoint; bend?: number; end?: number; paint: ArmorPaint; width?: number; tint?: string; dash?: string; head?: boolean
}) {
  if (edgeDistance(from, to) < 3 || end <= 0) return null
  const control = along(mix(from, to, .53), left(direction(from, to)), bend)
  const elbow = mix(from, control, end)
  const tip = mix(elbow, mix(control, to, end), end)
  const trace = "M" + from.x + " " + from.y + "Q" + elbow.x + " " + elbow.y + " " + tip.x + " " + tip.y
  return <g fill="none" strokeLinecap="round">
    <path d={trace} stroke={tint ?? paint.metal} strokeWidth={width * 3.3} strokeOpacity=".20" />
    <path d={trace} stroke={tint ?? paint.metal} strokeWidth={width} strokeDasharray={dash} />
    {!dash && <path d={trace} stroke={paint.light} strokeWidth={width * .42} />}
    {head && <path d="M-13-7 2 0-13 7m9-7h14" transform={pose(tip, heading(direction(elbow, tip)))}
      stroke={paint.light} strokeWidth="3" />}
  </g>
}

function Rings({ where, paint, radius, q, count = 2, turn = 0, gap = 18, rainbow = false, close = false }: {
  where: EdgePoint; paint: ArmorPaint; radius: number; q: number; count?: number; turn?: number; gap?: number; rainbow?: boolean; close?: boolean
}) {
  return <g transform={pose(where, turn)} fill="none" strokeLinecap="round">
    {steps(count).map(i => {
      const span = Math.min(164, 312 / count)
      const angle = i * 360 / count - span / 2
      const r = radius * (close ? 1.19 - q * .30 : .66 + q * .45)
      return <g key={i} stroke={rainbow ? spectrum[i % spectrum.length] : i % 2 ? paint.accent : paint.metal}>
        <path d={arc(r, angle, angle + span - gap)} strokeWidth="4.6" />
        <path d={arc(r + 8, angle + 6, angle + span - gap - 7)} strokeWidth="1.5" opacity=".75" />
      </g>
    })}
  </g>
}

function Bars({ area, paint, q, lines = 3, divisions = 6, rainbow = false }: {
  area?: EdgeArea; paint: ArmorPaint; q: number; lines?: number; divisions?: number; rainbow?: boolean
}) {
  const line = lineOf(area)
  if (!line) return null
  const span = edgeDistance(line.from, line.to)
  return <g transform={pose(line.from, heading(direction(line.from, line.to)))} fill="none" strokeLinecap="round">
    {steps(lines).map(i => {
      const y = ((i + .5) / lines - .5) * line.width
      return <path key={i} d={"M0 " + y + "H" + span * q} stroke={rainbow ? spectrum[i % spectrum.length] : i % 2 ? paint.light : paint.metal}
        strokeWidth={i === 0 || i === lines - 1 ? 3.1 : 1.9} />
    })}
    {steps(divisions).map(i => {
      const x = (i + .4) * span / divisions
      return x < q * span && <path key={i} d={"M" + x + " " + (-line.width * .39) + "v" + line.width * .78}
        stroke={i % 2 ? paint.accent : paint.metal} strokeWidth={i % 2 ? 1.4 : 2.6} opacity=".7" />
    })}
  </g>
}

function Fork({ where, paint, q, angle = 0 }: { where: EdgePoint; paint: ArmorPaint; q: number; angle?: number }) {
  return <g transform={pose(where, angle, .72 + .37 * q)} fill="none" strokeLinecap="round">
    <path d="M-39-36v34q0 32 39 32t39-32v-34M-29-28v28q0 23 29 23t29-23v-28"
      stroke={paint.metal} strokeWidth="3.6" />
    <path d="M0 27v14m-15 0h30M-39-36h11m56 0h11" stroke={paint.light} strokeWidth="2.2" />
  </g>
}

function ShieldFace({ where, paint, q, angle = 0, layers = 1, breakOpen = false }: {
  where: EdgePoint; paint: ArmorPaint; q: number; angle?: number; layers?: number; breakOpen?: boolean
}) {
  return <g transform={pose(where, angle)} strokeLinejoin="round">
    {steps(layers).map(i => <path key={i} d={codaShell} transform={"scale(" + ((breakOpen ? 1 - .30 * q : .86 + .20 * q) + i * .14) +
      ") translate(0 " + (i * 9 + (breakOpen ? -q * (i + 1) * 14 : 0)) + ")"}
      fill={paint.ink} fillOpacity={breakOpen ? ".14" : ".32"} stroke={i % 2 ? paint.accent : paint.light} strokeWidth={2.6 - i * .36} />)}
  </g>
}

function Notches({ from, to, paint, q, count = 5, size = 10, slant = 0 }: {
  from: EdgePoint; to: EdgePoint; paint: ArmorPaint; q: number; count?: number; size?: number; slant?: number
}) {
  if (edgeDistance(from, to) < 3) return null
  const axis = direction(from, to)
  return <g stroke={paint.light} strokeWidth="2.9" fill={paint.metal} fillOpacity=".19">
    {steps(count).map(i => {
      const x = (i + 1) / count
      return <path key={i} d="M-1-8 8 0-1 8H-7L0 0-7-8Z" opacity={unit((q - x + .26) * 3.1)}
        transform={pose(along(mix(from, to, x), left(axis), (i % 2 ? -1 : 1) * slant), heading(axis), size / 10)} />
    })}
  </g>
}

function Flight({ scene }: { scene: Scene }) {
  const { fx, to, t, art, paint, beat, layer } = scene
  const linear = beat.kind === "needle" || beat.kind === "push" || beat.kind === "overture"
  const q = linear ? t : unit(t * (1.12 + .15 * t))
  const from = fx.from
  if (fx.area && (beat.kind === "scorehit" || beat.kind === "refrain")) {
    if (layer === "front") return <Crest where={offset(to, 8, -30)} art={art} paint={paint} size={.72 + q * .24} />
    return <g>
      {circlesOf(fx.area).map(({ center, radius }, i) => <Rings key={i} where={center} paint={paint} radius={radius} q={q}
        count={beat.kind === "scorehit" ? 5 : 2} rainbow={beat.kind === "scorehit"} close />)}
      {beat.paths?.map((route, i) => <Rail key={i} {...route} paint={paint} width={3.6} dash="7 7" end={q} />)}
    </g>
  }
  if (beat.kind === "push" || beat.kind === "overture") {
    const pathEnd = mix(from, to, q)
    if (layer === "front") return <Crest where={pathEnd} art={art} paint={paint} size={beat.kind === "overture" ? .73 : .55}
      turn={heading(direction(from, to)) * .28} />
    return <g>
      <Rail from={from} to={to} paint={paint} width={beat.kind === "overture" ? 5.5 : 3.4} end={q}
        tint={beat.kind === "overture" ? spectrum[((beat.count ?? 1) - 1) % spectrum.length] : undefined} head />
      <Rail from={from} to={to} paint={paint} width={2.1} end={q} bend={beat.kind === "overture" ? 21 : -13} dash="11 7" />
      <Notches from={from} to={to} paint={paint} count={4} q={q} size={7.2} />
    </g>
  }
  const gap = edgeDistance(from, to)
  const curve = linear ? 0 : Math.min(beat.kind === "shieldRelay" ? 68 : beat.kind === "echo" ? 51 : 42, gap * .39)
  const bend = ["threeVoices", "echo", "duet", "antiphon"].includes(beat.kind ?? "") ? -curve : curve
  const center = along(mix(from, to, .53), left(direction(from, to)), bend)
  const tip = mix(mix(from, center, q), mix(center, to, q), q)
  if (layer === "floor") return <g>
    <Rail from={from} to={to} paint={paint} bend={bend} end={q} width={beat.kind === "needle" ? 2.8 : beat.kind === "spectrum" ? 5.8 : 4.5} />
    {["spectrum", "shieldRelay", "threeVoices", "ward", "duet", "antiphon"].includes(beat.kind ?? "") &&
      <Rail from={from} to={to} paint={paint} bend={-bend * .58} end={q} width={2.4}
        tint={beat.kind === "spectrum" ? spectrum[3] : paint.accent} dash={beat.kind === "ward" ? "4 5" : undefined} />}
  </g>
  if (beat.kind === "needle" || beat.kind === "echo") return <g transform={pose(tip, heading(direction(from, to)))}>
    <path d="M-24-4 4-8 19 0 4 8-24 4-12 0Z" fill={paint.metal} stroke={paint.light} strokeWidth="2.6" />
    <path d="M-36 0H5m-20-11 14 3m-14 19 14-3" fill="none" stroke={paint.accent} strokeWidth="2.1" />
  </g>
  return <Crest where={tip} art={art} paint={paint} size={beat.kind === "spectrum" ? .66 + .26 * q : .56 + .13 * q}
    turn={heading(direction(from, to)) * .37 + (1 - q) * 25} />
}

function Prelude({ scene }: { scene: Scene }) {
  const { fx, art, to, t, layer, paint } = scene
  const q = ease(t)
  const axis = heading(direction(fx.from, to))
  if (layer === "floor") return <g>
    {fx.area && <>
      <path d={areaPath(fx.area)} fill={paint.metal} fillOpacity=".085" stroke={paint.accent} strokeWidth="2.4" strokeDasharray="8 7" />
      <Bars area={fx.area} paint={paint} q={q} lines={art.motif === "battleStaff" ? 5 : 3} />
      {circlesOf(fx.area).map(({ center, radius }, i) => <Rings key={i} where={center} radius={radius} paint={paint} q={q}
        turn={axis + q * 24} count={art.motif === "spectrumDuel" ? 5 : art.motif === "silenceCorner" ? 4 : 3} close />)}
    </>}
    {!fx.area && <Rail from={fx.from} to={to} paint={paint} bend={art.delivery === "none" ? 7 : 18} width={2.5} end={q} dash="5 6" />}
    {["finalScore", "rescueSymphony", "overture"].includes(art.motif) && <Rings where={fx.from} radius={76} paint={paint} q={q} count={5} turn={q * 30} rainbow close />}
  </g>
  return <Crest where={offset(fx.from, 0, -39 - 14 * q)} art={art} paint={paint}
    size={(fx.rarity === "Prismatic" ? .95 : .68) * (.73 + .34 * q)} turn={(1 - q) * -19} />
}

function Resolving({ scene }: { scene: Scene }) {
  const { fx, art, to, t, layer, paint, beat } = scene
  const q = ease(t), front = layer === "front", from = fx.from
  const axis = heading(direction(from, to)), count = beat.count ?? 1
  const glyph = (where = offset(to, 13, 26), size = .77, angle = 0) => <Crest where={where} art={art} paint={paint} size={size} turn={angle} />
  const rim = (radius: number, parts: number, angle = axis, rainbow = false, close = false) =>
    <Rings where={to} paint={paint} radius={radius} q={q} count={parts} turn={angle} rainbow={rainbow} close={close} />
  const line = (bend: number, width: number, tint?: string, dash?: string) =>
    <Rail from={from} to={to} paint={paint} bend={bend} width={width} end={.49 + q * .51} tint={tint} dash={dash} />
  const burst = (pieces: number, rainbow = false) => circlesOf(fx.area).map(({ center, radius }, i) =>
    <Rings key={i} where={center} paint={paint} radius={radius} q={q} count={pieces} turn={q * 27 - 29} rainbow={rainbow} />)
  const shield = (layers = 1, shrinking = false) => <ShieldFace where={to} paint={paint} q={q} angle={axis + 90} layers={layers} breakOpen={shrinking} />
  if (beat.cue === "rest") return front ? glyph(offset(to, 18, 32), .51 + q * .16, -15) : rim(44, 2, axis, false, true)

  switch (art.motif) {
    case "pulseNote":
      return front ? <>{glyph(offset(to, 13, 28), .59 + .21 * q, axis * .24)}
        {beat.kind === "ampq" && <path d="M-30 10h15l8-15 9 25 11-25 9 15h15" transform={pose(to, axis, .72 + q * .36)}
          fill="none" stroke={paint.light} strokeWidth="3.6" />}</> : beat.kind === "ampq" ? line(-9, 4.8) : rim(39, 2, axis)
    case "tuningFork":
      return front ? <Fork where={offset(to, 6, 20)} paint={paint} q={q} angle={axis + 90} />
        : <>{line(13, 2.8, paint.accent, beat.kind === "reach" ? undefined : "5 7")}
          {beat.kind === "reach" && <Notches from={from} to={to} paint={paint} q={q} count={6} size={6} />}</>
    case "mutedDrum":
      return front ? <g transform={pose(to, axis + 90, .87 + .20 * q)} fill="none">
        <ellipse rx={37 - (beat.cue === "break" ? q * 12 : 0)} ry={22 + q * 11}
          stroke={paint.light} strokeWidth="3.2" fill={paint.ink} fillOpacity=".32" />
        <path d={"M-27 0Q0 " + (beat.cue === "break" ? q * 38 : -11) + " 27 0M-20 11Q0 24 20 11"}
          stroke={paint.accent} strokeWidth="2.7" />
      </g> : rim(beat.cue === "break" ? 58 : 41, 2, axis + 83, false, beat.cue === "break")
    case "triplet":
      return front ? <g transform={pose(offset(to, 0, 29))} fill={paint.metal} stroke={paint.light} strokeWidth="2.3">
        {steps(3).map(i => <rect key={i} x={i * 21 - 29} y={-5 + q * (2 - i) * 7} width="15" height={3 + q * (i + 2) * 3} rx="2" />)}
      </g> : <>{rim(49, 3, -90 + q * 25)}<path d="M-37 5h74" transform={pose(to, 0, .5 + q * .6)} stroke={paint.light} strokeWidth="2.1" /></>
    case "returnVerse":
      return front ? glyph(offset(to, -8 + 10 * q, 26), .67 + .24 * q, -25 + 30 * q)
        : <>{line(27, 3.9)}{beat.cue === "heal" && rim(46, 2, axis - 30)}</>
    case "warDrum":
      return front ? <>{shield(3, beat.cue === "break")}{glyph(offset(to, 28, 24), .66)}</>
        : <>{rim(beat.cue === "break" ? 70 : 51, 3, axis, false, beat.cue === "break")}
          {beat.cue === "break" && line(-17, 2.2, paint.accent, "5 4")}</>
    case "downbeat":
      return front ? glyph(offset(to, 10, 20), .86 + .16 * q, axis * .61)
        : <>{line(0, 4.1)}<Notches from={from} to={to} paint={paint} q={q} count={2} size={17} /></>
    case "bassCurtain":
      return front ? beat.cue === "deploy" ? glyph(to, 1.24) : shield(2)
        : <>{burst(7)}{beat.cue !== "deploy" && <Notches from={from} to={to} paint={paint} q={q} count={5} slant={12} />}</>
    case "retreatBeat":
      return front ? <>{glyph(offset(to, -6, 29), .85 + .13 * q, axis * .2)}
        {beat.cue === "heal" && <path d="M-26 9H25m-44 8h37m-29 8h19" transform={pose(to, axis + 90, 1.1 - .27 * q)}
          fill="none" stroke={paint.light} strokeWidth="3.2" />}</>
        : <>{rim(55, 2, axis + 90, false, true)}<Notches from={from} to={to} paint={paint} count={6} q={q} size={7} slant={8} /></>
    case "harmonyNeedle":
      return front ? beat.cue === "shield" ? <>{shield(1)}{glyph(offset(to, 15, 25), .65, 36)}</>
        : glyph(offset(to, 8, -21), .82, axis)
        : <>{line(beat.cue === "shield" ? -31 : 0, beat.cue === "shield" ? 4.4 : 2.6)}{rim(51, 2, axis + 38)}</>
    case "echoArrow":
      return front ? <>{glyph(offset(to, 19, 22), .89, axis)}
        {beat.cue === "hit" && glyph(offset(to, -17, 4), .52, axis + 162)}</>
        : <>{line(38, 3.4)}{line(-21, 2, paint.accent, "4 6")}{rim(57, 2, axis + q * 42)}</>
    case "bowString":
      return front ? glyph(offset(to, 14, 18), .89, axis + 14 - q * 28)
        : <>{line(31 * (1 - q), 3.7)}{line(-31 * (1 - q), 3.7, paint.accent)}
          {beat.kind === "push" && <Notches from={from} to={to} paint={paint} count={3} q={q} size={9} />}</>
    case "tuningMark":
      return front ? <Fork where={offset(to, 0, 16)} paint={paint} q={q} angle={beat.kind === "accent" ? axis - 90 : -12 + q * 18} />
        : <>{burst(2)}{beat.kind === "accent" ? line(13, 4.1) : rim(48, 2, q * 30)}</>
    case "passingHeal":
      return front ? <>{glyph(offset(to, -16, 22), .71, axis * .27)}
        {beat.kind === "hit" && glyph(offset(to, 21, 24), .51, -axis * .18)}</>
        : <>{line(25, 3.9)}{beat.kind === "hit" && line(-30, 2.3, paint.accent)}{rim(46, 3, axis)}</>
    case "crossMeter":
      return front ? beat.cue === "shield" ? shield(2) : glyph(offset(to, 14, 22), .82, axis + 65)
        : <><Bars area={fx.area} paint={paint} q={.72 + .28 * q} lines={3} divisions={5} />
          {beat.kind === "push" && <Notches from={from} to={to} paint={paint} q={q} count={3} size={9} />}
          {beat.cue === "hit" && rim(46, 2, axis + 90)}</>
    case "residency":
      return front ? glyph(offset(to, 7, beat.kind === "reach" ? 30 : 2), .94, axis * .34)
        : <>{burst(3)}{beat.kind === "reach" && <>{line(-16, 5.1)}<Notches from={from} to={to} paint={paint} q={q} count={7} size={6} /></>}</>
    case "echoStage":
      return front ? glyph(offset(to, 0, 21), .97, axis * .14)
        : <>{burst(4)}{beat.kind === "accent" && <><Rail from={fx.area?.center ?? from} to={to} paint={paint} bend={-37} width={5.2} end={q} />
          {rim(67, 4, q * 38)}</>}</>
    case "restCloak":
      return front ? beat.cue === "shield" ? shield(2) : glyph(offset(to, 15, 25), .86, axis + 16 * q)
        : <>{rim(61, 3, axis + 90, false, beat.kind === "move")}
          {beat.kind === "move" && <Notches from={from} to={to} paint={paint} q={q} size={7} slant={9} />}</>
    case "stoppedString":
      return front ? glyph(offset(to, 8, 25), .99, beat.kind === "push" ? axis : -10 + 13 * q)
        : <>{burst(2)}{beat.kind === "push" ? <>{line(-23, 5.5)}<Notches from={from} to={to} paint={paint} q={q} size={12} count={3} /></> : rim(47, 2, -90)}</>
    case "duet":
      return front ? glyph(offset(to, 12, 26), .88, -axis * .28)
        : <><Rail from={beat.other ?? from} to={to} paint={paint} bend={36} width={3.3} end={.55 + .45 * q} />
          <Rail from={beat.other ?? from} to={to} paint={paint} bend={-31} width={2.7} end={.55 + .45 * q} tint={paint.accent} /></>
    case "ensembleCall":
      return front ? <g transform={pose(offset(to, 0, 39), -8 + 12 * q)}>
        {steps(2).map(i => <path key={i} d="M-14-12H12l4 6v16h-30Z" transform={"translate(" + (i * 35 - 17) + " 0)"}
          fill={paint.metal} fillOpacity={beat.cue === "arm" ? ".11" : i < count ? ".68" : ".14"}
          stroke={i < count && beat.cue !== "arm" ? paint.light : paint.metal} strokeWidth="2.9" />)}
        <path d="M-33 19H32" fill="none" stroke={paint.accent} strokeWidth="2.1" />
      </g> : <>{line(count === 1 ? -27 : 27, 5.2)}{rim(60 + count * 6, count === 1 ? 2 : 4, axis + q * 22)}</>
    case "battleStaff":
      return front ? beat.cue === "shield" ? shield(3) : glyph(offset(to, 14, -10), 1.01, axis + 89)
        : <><Bars area={fx.area} paint={paint} q={.71 + q * .29} lines={5} divisions={9} />
          {beat.kind === "push" && line(-22, 5.6, paint.accent)}
          {beat.cue === "hit" && rim(63, 3, axis + 37)}</>
    case "longLead":
      return front ? glyph(offset(to, 16, 29), 1.08, axis * .34)
        : <>{line(-36, 5.8)}{line(28, 2.4, paint.accent)}
          {beat.cue === "heal" ? burst(4) : rim(66, 2, axis + 90)}</>
    case "silenceCorner":
      return front ? <g transform={pose(to, 0, beat.cue === "break" ? 1.26 - .30 * q : .85 + .17 * q)}>
        <path d={art.crest} fill={paint.ink} fillOpacity=".49" stroke={paint.light} strokeWidth={beat.cue === "break" ? 4.8 : 2.8} />
      </g> : <>{burst(4)}{beat.cue === "break" && <path d="M-58-42 57 42M-58 42 57-42" transform={pose(to, axis, .8 + .4 * q)}
        stroke={paint.accent} fill="none" strokeWidth="4.1" />}</>
    case "coda":
      return front ? beat.cue === "shield" ? shield(3) : glyph(offset(to, 21, 25), .97, -25 + 18 * q)
        : <>{line(-47, 5.3, paint.accent)}{rim(65, 2, axis + 50, false, beat.cue === "release")}</>
    case "shieldRelay":
      return front ? <>{shield(3)}{glyph(offset(to, 35, 20), .79, axis * .27)}</>
        : <>{line(-47, 5.9)}{line(37, 3.2, paint.accent)}{rim(71, 3, axis - 31)}</>
    case "threeVoices":
      return front ? <g transform={pose(offset(to, 5, 31), -10)}>
        {steps(3).map(i => <path key={i} d="M-9 3-4-8 7-10 12-1 4 9-7 10Z" transform={"translate(" + (i * 24 - 24) + " " + (-i * 7) + ")"}
          stroke={i === 1 ? paint.accent : paint.light} strokeWidth="2.6" fill={paint.metal} fillOpacity={.29 + .29 * unit(q * 2 - i * .37)} />)}
      </g> : <>{line(-53, 4.9)}{line(33, 2.8, paint.accent)}{rim(beat.cue === "heal" ? 58 : 76, 3, axis + q * 31)}</>
    case "timingLane":
      return front ? beat.cue === "shield" ? shield(2) : glyph(offset(to, 14, 28), 1.01, axis * .21)
        : <><Bars area={fx.area} paint={paint} q={.61 + .39 * q} lines={5} divisions={10} />
          {beat.kind === "step" ? <Notches from={from} to={to} paint={paint} q={q} count={6} slant={11} /> : line(14, 5.7)}</>
    case "refrain":
      return front ? glyph(offset(to, 0, 28), beat.cue === "release" ? 1.14 : .91, q * 22)
        : <>{burst(5)}{line(-23, 5.3)}{rim(beat.kind === "refrain" ? 80 : 62, beat.cue === "release" ? 5 : 2, axis + q * 24)}</>
    case "antiphon":
      return front ? glyph(offset(to, 17, 29), .96, axis * .28 + q * 13)
        : <>{burst(6)}{line(-48, 5.4)}{line(39, 2.3, paint.accent)}
          {beat.cue === "heal" && rim(69, 4, q * 25 + axis)}</>
    case "finalScore":
      if (beat.cue === "deploy") return front ? glyph(offset(to, 0, -40), 1.45, -5 + q * 10) : <>
        {fx.contacts?.map((unit, i) => <Rail key={i} from={from} to={unit} paint={paint} bend={i % 2 ? -61 : 52}
          width={3.8} end={unitProgress(q, i)} tint={spectrum[i % spectrum.length]} />)}
        {rim(87, 5, 45 * q, true)}
      </>
      if (beat.cue === "arm") return front ? glyph(offset(to, 28, 23), .74, -13 + q * 22) : line(32, 2.8, spectrum[3])
      if (beat.kind === "scorehit") {
        if (beat.cue === "hit") return front ? glyph(offset(to, 15, 29), .73, axis * .22) : null
        return front ? glyph(offset(to, 0, 26), 1.20, q * 22) : <>{burst(5, true)}{rim(60, 3, axis + q * 36, true)}</>
      }
      return front ? beat.kind === "shield" ? <>{shield(2)}{glyph(offset(to, 23, 26), .81)}</> : glyph(offset(to, 15, 32), .97)
        : <>{line(51, 7.1, spectrum[1])}{line(-29, 3.4, spectrum[3])}
          <Notches from={from} to={to} paint={paint} q={q} count={5} size={7} slant={8} /></>
    case "rescueSymphony":
      if (beat.cue === "deploy") return front ? glyph(offset(to, 0, -38), 1.23) : <g>
        {fx.contacts?.map((unit, i) => <Rail key={i} from={from} to={unit} paint={paint} bend={(i - 1.5) * 38}
          width={3.9} end={unitProgress(q, i)} tint={spectrum[i % spectrum.length]} />)}
        {rim(79, 3, -49 + q * 24, true)}
      </g>
      if (beat.cue === "arm") return front ? glyph(offset(to, 35, 22), .59) : null
      if (beat.cue === "break") return front ? shield(3, true) : <>{line(-28, 4.3, spectrum[2])}{rim(78, 4, axis + q * 29, true, true)}</>
      if (beat.cue === "shield") return front ? shield(2) : rim(63, 3, axis + q * 25, true)
      return front ? glyph(offset(to, 17, 23), .85, axis * .14) : line(-35, 4.4, spectrum[2])
    case "overture":
      return front ? beat.cue === "shield" ? shield(3) : glyph(offset(to, 0, 27), 1.09, axis * .25)
        : <>{line(-25, 5.5, spectrum[(count - 1) % spectrum.length])}
          <Notches from={from} to={to} paint={paint} q={q} count={6} slant={11} />{rim(66, 3, axis + q * 21, true)}</>
    case "spectrumDuel":
      return front ? glyph(offset(to, 4, 26), 1.08, axis * .38)
        : <>{burst(5, true)}{line(-42, 6.4, spectrum[3])}{line(37, 3.3, spectrum[1])}{rim(75, 5, axis + 44 * q, true)}</>
    case "shoreCoda": {
      const coast = isOutside(to) ? inside(to) : beat.cue === "release" ? to : inside(from)
      return front ? beat.cue === "shield" ? <>{shield(3)}{glyph(offset(to, 25, 26), .90)}</> : glyph(offset(to, 11, 29), 1.13)
        : <>{line(38, 5.5, spectrum[2])}{burst(4, true)}
          {beat.cue !== "shield" && <g transform={pose(coast, heading(outward(coast)), .73 + .39 * q)} fill="none">
            {steps(5).map(i => <path key={i} d={"M" + (i * 7 - 14) + " " + (-40 - i * 5) + "v" + (80 + i * 10)}
              stroke={spectrum[i]} strokeWidth={i === 2 ? 4.8 : 2.7} />)}
            <path d="M-23-47h46M-23 47h46m-28-94-8 12m45 82-8-12" stroke={paint.light} strokeWidth="3.3" />
          </g>}
          {rim(63, 3, axis, true)}</>
    }
  }
}

const unitProgress = (q: number, i: number) => unit(q * 1.55 - i * .16)

export function EdgeBardEffects({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden="true" pointerEvents="none">
    {battle.runtime.effects.map(fx => {
      const beat = fx.bard, art = bardChoreography(fx.skill)
      if (!beat || !art || battle.time < fx.start || battle.time >= fx.end) return null
      let t = unit((battle.time - fx.start) / (fx.end - fx.start))
      const route = beat.cue === "flight" && (beat.kind === "push" || beat.kind === "overture") ? beat.paths?.[0] : undefined
      if (route) {
        const mover = unitOf(battle, route.unit)
        if (!mover?.hp || edgeDistance(mover.force?.end ?? mover, route.to) > 3) return null
        t = unit(edgeDistance(route.from, mover) / Math.max(1, edgeDistance(route.from, route.to)))
      }
      const follow = beat.cue === "flight" && !beat.paths || beat.cue === "prepare"
      const target = follow ? unitOf(battle, fx.target) : undefined
      if (target && !target.hp) return null
      const scene = { fx, beat, art, t, layer, to: target ?? fx.to, paint: armorPaint[fx.rarity] }
      return <g key={fx.id} data-bard-skill={fx.skill} data-bard-cue={beat.cue} data-bard-kind={beat.kind}
        opacity={beat.cue === "flight" ? .94 : beat.cue === "prepare" ? .50 + .48 * t : 1 - t ** 1.38}>
        {beat.cue === "prepare" ? <Prelude scene={scene} /> : beat.cue === "flight" ? <Flight scene={scene} /> : <Resolving scene={scene} />}
      </g>
    })}
    {bardActiveReadiness(battle).map(({ id, skill, target, other, kind, until, count }) => {
      const art = bardChoreography(skill)
      if (!art) return null
      const paint = armorPaint[skill.split("/")[1] as Rarity]
      const q = .5 + Math.sin(battle.time * 5 + target.x * .023) * .5
      const gate = kind === "return" && isOutside(target) ? inside(target) : undefined
      return <g key={id} data-bard-ready={skill} opacity={unit((until - battle.time) / .25) * (.57 + q * .16)}>
        {layer === "floor" ? <>
          {other?.hp && <Rail from={target} to={other} paint={paint} bend={target.id < other.id ? -21 : 21} width={2.3} dash="5 8" />}
          {kind === "slow" && <Rings where={target} paint={paint} radius={43} q={q} count={3} turn={q * 22} close />}
          {gate && <>
            <Rail from={target} to={gate} paint={paint} bend={-15} width={3.6} dash="7 7" />
            <path d={bridgeGate} transform={pose(gate, heading(outward(gate)), .69 + .22 * q)}
              fill="none" stroke={spectrum[3]} strokeWidth="3.4" />
          </>}
        </> : <>
          <Crest where={offset(target, 45, -20 - q * 5)} art={art} paint={paint}
            size={kind === "score" ? .58 + q * .09 : .47 + q * .05} turn={q * 9 - 4} />
          {art.motif === "ensembleCall" && <path d={count === 2 ? "M-14 0h8m9 0h8" : "M-14 0h8"} transform={pose(offset(target, 46, -38))}
            fill="none" stroke={paint.light} strokeWidth="3.4" />}
        </>}
      </g>
    })}
  </g>
}

export function EdgeBardField({ battle, field }: { battle: EdgeBattle; field: FieldEffect }) {
  const { cast, area, until, seen } = field
  const art = bardChoreography(cast.skill?.id)
  const owner = unitOf(battle, cast.owner)
  if (!art || !owner || !isFighter(owner) || until <= battle.time) return null
  const paint = armorPaint[owner.card.rarity]
  const q = .5 + .5 * Math.sin((battle.time - field.time) * 6.5)
  const center = area.center, motif = art.motif
  const team = alliesOf(battle, owner.id)
  const fade = unit((until - battle.time) / .46)
  return <g data-bard-field={cast.skill?.id} opacity={fade} pointerEvents="none">
    <path d={areaPath(area)} stroke={paint.metal} strokeWidth="2.5" strokeOpacity=".68" strokeDasharray="11 7" fill={paint.ink} fillOpacity=".26" />
    {motif === "timingLane" && <Bars area={area} paint={paint} q={1} lines={5} divisions={10} />}
    {circlesOf(area).map(({ radius }, index) => <g key={index}>
      {motif === "bassCurtain" && <g transform={at(center)} fill="none">
        {steps(7).map(i => {
          const x = (i - 3) * radius * .25
          const extent = Math.sqrt(radius ** 2 - x ** 2)
          return <path key={i} d={"M" + x + " " + (-extent * .79) + "Q" + (x + 9 * q) + " -12 " + x + " " + (extent * .69)}
            stroke={i % 2 ? paint.accent : paint.metal} strokeOpacity={.22 + q * .20} strokeWidth={i === 3 ? 4.2 : 2.4} />
        })}
      </g>}
      {motif === "residency" && <>
        <Rings where={center} paint={paint} radius={radius * .90} q={.47 + .36 * q} count={3} turn={(battle.time - field.time) * 31} />
        <Rings where={center} paint={paint} radius={radius * .63} q={.42} count={4} turn={-(battle.time - field.time) * 21} />
      </>}
      {motif === "echoStage" && <g transform={at(center)}>
        {team.map((member, i) => <rect key={member.id} x={(i - (team.length - 1) / 2) * 25 - 8.5} y={-14 - q * 5} width="17" height={25 + q * 8} rx="3"
          fill={paint.metal} fillOpacity={seen.has(member.id) ? .57 : .10} stroke={seen.has(member.id) ? paint.light : paint.metal} strokeWidth="2.3" />)}
      </g>}
      {motif === "silenceCorner" && <g transform={pose(center, -8 + 6 * q)} fill="none">
        {steps(4).map(i => <path key={i} d="M-14-18v-19h28v19m-22 9h16" transform={"rotate(" + i * 90 + ") translate(0 " + (-radius * .57) + ")"}
          stroke={paint.accent} strokeWidth="3.1" strokeOpacity={.58 + q * .19} />)}
      </g>}
      {motif === "spectrumDuel" && <>
        <Rings where={center} paint={paint} radius={radius * .92} q={.37 + q * .51} count={5} turn={(battle.time - field.time) * 27} rainbow />
        <g transform={pose(center, -18)} fill="none" strokeWidth="3.5">
          {steps(5).map(i => <path key={i} d={"M" + (i * 17 - 36) + " 18v" + (-15 - (i + 1) * 6 * q)}
            stroke={spectrum[i]} opacity={i < seen.size ? .96 : .34} />)}
        </g>
      </>}
    </g>)}
    {motif !== "echoStage" && <Crest where={center} art={art} paint={paint} size={.62 + .08 * q} />}
  </g>
}
