import type { Job } from "@/card/types"

import { BOARD, CHARGE, FX_TIME, type EdgeBattle, type EdgeCue, type EdgeImpact, type EdgePoint, type EdgeUnitId } from "./edgeBattle"
import { clamp } from "./edgeSkills/geometry"
import { battleFighters } from "./edgeSkills/state"

export const EDGE_TINT: Record<Job, string> = {
  tank: "#ffd19a", warrior: "#ff8fbb", mage: "#b7a6ff", support: "#8de3f7",
}

const BOSS_TINT = "#ff708f"
const CRITICAL_TINT = "#ffe09b"
const HIT_BEAT = 0.016
const HIT_FLASH = 0.41
const sparks = [-2.6, -1.65, -0.85, -0.25, 0.4, 1.15, 2.05]
const fraction = (age: number, duration: number) => Math.min(1, Math.max(0, age / duration))

function direction(from: EdgePoint, to: EdgePoint) {
  const x = to.x - from.x
  const y = to.y - from.y
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length, angle: Math.atan2(y, x) }
}

function between(from: EdgePoint, to: EdgePoint, progress: number): EdgePoint {
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }
}

function tone(battle: EdgeBattle, cue: EdgeCue) {
  if (cue.kind === "charge" || cue.kind === "exit") return BOSS_TINT
  if (cue.kind === "heal") return "#97f5d1"
  if (cue.kind === "shield" || cue.kind === "return") return "#8ce6ff"
  const actor = battleFighters(battle).find(({ id }) => id === cue.actor)
  return actor ? EDGE_TINT[actor.card.job] : BOSS_TINT
}

export function tokenFeedback(battle: EdgeBattle, id: EdgeUnitId) {
  const cast = battle.cues.findLast((cue) => cue.actor === id && battle.time - cue.time < 0.32 &&
    cue.kind !== "move" && cue.kind !== "exit" && cue.kind !== "return")
  const impact = battle.impacts.findLast((hit) => hit.target === id &&
    battle.time - hit.time >= HIT_BEAT && battle.time - hit.time < HIT_BEAT + HIT_FLASH)
  let x = 0
  let y = 0
  let castLight = 0
  let hitLight = 0
  let tint = "#fff"
  if (cast) {
    const age = battle.time - cast.time
    const vector = direction(cast.from, cast.to)
    const reach = cast.kind === "melee" ? 27 : cast.kind === "charge" ? 9 : 15
    const lunge = age < 0.065 ? -8 * Math.sin(age / 0.065 * Math.PI) : reach * Math.sin(fraction(age - 0.065, 0.25) * Math.PI)
    x = vector.x * lunge
    y = vector.y * lunge
    castLight = 1 - fraction(age, 0.32)
    tint = tone(battle, cast)
  }
  if (impact) {
    const progress = fraction(battle.time - impact.time - HIT_BEAT, HIT_FLASH)
    hitLight = 1 - progress ** 0.7
    tint = impact.critical ? CRITICAL_TINT : impact.kind === "hit" ? "#ff9eb6" : impact.kind === "heal" ? "#97f5d1" : "#8ce6ff"
    if (impact.kind === "hit") {
      const vector = direction(impact.from, impact.at)
      const recoil = Math.sin(fraction(battle.time - impact.time - HIT_BEAT, 0.22) * Math.PI) * 15
      x += vector.x * recoil
      y += vector.y * recoil
    }
  }
  return { x, y, castLight, hitLight, tint }
}

function Trail({ cue, age, tint }: { cue: EdgeCue; age: number; tint: string }) {
  const { from, to, kind } = cue
  if (kind === "skill") return null
  if (kind === "exit" || kind === "return" || kind === "move") {
    const progress = fraction(age, 0.58)
    if (progress === 1) return null
    const radius = kind === "move" ? 9 + progress * 27 : 22 + progress * 65
    return (
      <g className="edge-fx-detail" transform={"translate(" + to.x + " " + to.y + ")"} opacity={1 - progress} fill="none" stroke={tint}>
        <circle r={radius} strokeWidth="2.8" />
        <circle r={radius * 0.74} strokeWidth="1.5" strokeDasharray="7 6" />
        {kind !== "move" && <path d={"M-" + radius + " 0H" + radius + " M0 -" + radius + "V" + radius} strokeWidth="1.5" opacity="0.6" />}
      </g>
    )
  }

  const aim = direction(from, to)
  const angle = aim.angle * 180 / Math.PI
  if (kind === "shot") {
    const progress = fraction(age, 0.21)
    const muzzle = { x: from.x + aim.x * 38, y: from.y + aim.y * 38 }
    return progress < 1 && <g transform={`translate(${muzzle.x} ${muzzle.y}) rotate(${angle})`} opacity={1 - progress}>
      <path d="M-24 0 3-6 12-21 13-5 32 0 13 5 12 21 3 6Z" fill={tint} fillOpacity=".55" stroke={tint} strokeWidth="3" />
      <path d="M-16 0H23M5-10v20" stroke="#fff4fb" strokeWidth="2.8" strokeLinecap="round" />
    </g>
  }
  if (kind === "heal" || kind === "shield") {
    const progress = fraction(age, 0.59)
    if (progress === 1) return null
    const shield = kind === "shield"
    return (
      <g opacity={1 - progress ** 1.5} fill="none" stroke={tint} className="edge-fx-trail">
        <g transform={`translate(${to.x} ${to.y})`}>
          <circle r={36 + progress * 38} strokeWidth="2.2" strokeDasharray={shield ? "18 7" : "5 8"} opacity=".58" />
          <path d={shield ? "M0-21 17-13V2Q16 13 0 22-16 13-17 2V-13Z" : "M-15 0H15M0-15V15"}
            stroke="#edfbff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    )
  }
  if (kind === "melee") {
    const progress = fraction(age, 0.36)
    if (progress === 1) return null
    return (
      <g opacity={1 - progress ** 1.8}>
        <line className="edge-fx-detail" x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={tint} strokeWidth="3" opacity="0.45" />
        <g className="edge-fx-swing" transform={"translate(" + to.x + " " + to.y + ") rotate(" + (angle + progress * 28) + ")"}>
          <path d="M-56-41Q15-56 62 0 29 53-47 55 8 22 15-1-3-26-56-41Z" fill={tint} opacity="0.66" />
          <path d="M-56-41Q15-56 62 0 29 53-47 55" fill="none" stroke={tint} strokeWidth="12" opacity="0.38" />
          <path d="M-48-42Q19-50 57 0 23 47-38 51" fill="none" stroke="#fff0fa" strokeWidth="4" />
        </g>
      </g>
    )
  }

  const progress = fraction(age, 0.62)
  if (progress === 1) return null
  const travel = fraction(age + 0.06, 0.2)
  const head = between(from, to, travel)
  return (
    <g className="edge-fx-trail" opacity={1 - progress ** 1.4} strokeLinecap="round">
      <line x1={from.x} y1={from.y} x2={head.x} y2={head.y} stroke={tint} strokeWidth={CHARGE.halfWidth * 1.65} opacity={0.34} />
      <line x1={from.x} y1={from.y} x2={head.x} y2={head.y} stroke={tint} strokeWidth={18} />
      <line x1={from.x} y1={from.y} x2={head.x} y2={head.y} stroke="#fff2fb" strokeWidth={5} />
      <g className="edge-fx-detail" transform={"translate(" + head.x + " " + head.y + ") rotate(" + angle + ")"}>
        <path d="M-36-15 20 0-36 15-19 0Z" fill="#fff0f9" />
        <path d="M-77-25-34-12 M-89 0H-42 M-66 22-28 10" fill="none" stroke={tint} strokeWidth="3" />
      </g>
    </g>
  )
}

const impactScale = (age: number, critical?: boolean) => 1 + (critical ? .42 : .24) * (1 - fraction(age, critical ? .23 : .16))
const impactFade = (age: number) => Math.min(1, (1 - fraction(age, FX_TIME - HIT_BEAT)) * 3.1)
const impactKind = (hit: EdgeImpact) => hit.critical ? hit.kind + "/critical" : hit.kind

interface ImpactBox extends EdgePoint { width: number; height: number }
interface ImpactLabel extends ImpactBox { opacity: number }
type LabelObstacle = ImpactLabel & { unit?: true }
type Bounds = { left: number; right: number; top: number; bottom: number }

function impactBounds(viewBox?: string): Bounds {
  const [left, top, width, height] = viewBox ? viewBox.trim().split(/\s+/).map(Number) : [0, 0, BOARD.width, BOARD.height]
  return { left, top, right: left + width, bottom: top + height }
}

function clearRows(y: number, height: number, neighbors: readonly ImpactLabel[]) {
  let below = y, above = y
  for (const other of neighbors) {
    const gap = (height + other.height) / 2
    if (Math.abs(other.y - below) < gap) below = other.y + gap
  }
  for (let i = neighbors.length - 1; i >= 0; i--) {
    const other = neighbors[i]
    const gap = (height + other.height) / 2
    if (Math.abs(other.y - above) < gap) above = other.y - gap
  }
  return { above, below }
}

function placeImpactLabel(hit: EdgeImpact, age: number, lane: number | undefined, placed: LabelObstacle[], view: Bounds): ImpactLabel {
  const scale = impactScale(age, hit.critical)
  const digits = String(hit.amount).length
  const hasSign = hit.kind === "heal" || hit.kind === "hit"
  const width = (hit.critical ? Math.max(58, digits * 31 + (hasSign ? 34 : 67)) : digits * 22 + (hasSign ? 22 : 47)) * scale + 8
  const height = (hit.critical ? 82 : 42) * scale + 7
  const padX = width / 2 + 8, padY = height / 2 + 8
  const minX = view.left + padX, maxX = view.right - padX
  const minY = view.top + padY, maxY = view.bottom - padY
  const drift = fraction(age, FX_TIME - HIT_BEAT) * 45
  const sign = hit.at.y - view.top < 108 ? 1 : -1
  const x0 = clamp(hit.at.x + (lane === undefined ? 10 : lane % 2 ? 37 : -29), minX, maxX)
  const y0 = clamp(hit.at.y + sign * (54 + drift + (lane ?? 0) * 33), minY, maxY)
  const opacity = impactFade(age)
  let best = { x: x0, y: y0, width, height, opacity }
  let cost = Infinity

  for (const column of [0, -1, 1, -2, 2]) {
    const x = clamp(x0 + column * width * .74, minX, maxX)
    const neighbors = placed.filter(other => Math.abs(other.x - x) < (width + other.width) / 2)
      .sort((a, b) => a.y - b.y)
    const { above, below } = clearRows(y0, height, neighbors)
    const labels = clearRows(y0, height, neighbors.filter(other => !other.unit))
    const rows = sign < 0 ? [above, below, labels.above, labels.below] : [below, above, labels.below, labels.above]
    for (const row of rows) {
      const y = clamp(row, minY, maxY)
      let score = Math.abs(x - x0) * 1.1 + Math.abs(y - y0)
      for (const other of neighbors) {
        const overlapX = (width + other.width) / 2 - Math.abs(x - other.x)
        const overlapY = Math.max(0, (height + other.height) / 2 - Math.abs(y - other.y))
        const weight = other.unit ? 180 : 1200
        score += weight * overlapX * overlapY / Math.min(width * height, other.width * other.height)
      }
      if (score < cost) {
        best = { x, y, width, height, opacity }
        cost = score
      }
    }
    if (cost === 0) break
  }
  return best
}

function Impact({ hit, age, label }: { hit: EdgeImpact; age: number; label?: ImpactLabel }) {
  if (age < 0) return null
  const damage = hit.kind === "hit"
  const block = hit.kind === "block"
  const color = hit.critical ? CRITICAL_TINT : damage ? "#ffb9bd" : hit.kind === "heal" ? "#9df7d4" : "#a9eaff"
  const shock = fraction(age, hit.critical ? .53 : .43)
  const burst = (1 - shock) ** 1.2
  const heading = direction(hit.from, hit.at).angle
  const dx = label ? label.x - hit.at.x : 0
  const dy = label ? label.y - hit.at.y : 0
  const reach = Math.hypot(dx, dy)
  const leader = label && (Math.abs(dx) > 74 || Math.abs(dy) > 127) ? direction(hit.at, label) : undefined
  return (
    <g transform={"translate(" + hit.at.x + " " + hit.at.y + ")"}>
      {shock < 1 && (
        <g className="edge-fx-burst" fill="none" stroke={color} opacity={burst}>
          {!damage && <circle r={16 + shock * (block ? 47 : 62)} strokeWidth={block ? 5 : 3} />}
          {damage && <path className="edge-fx-detail" d="M-49 0H49M0-30V30" transform={`rotate(${heading * 180 / Math.PI + 27}) scale(${0.7 + shock * 0.6})`}
            stroke="#fff1f3" strokeWidth="3" opacity={1 - shock} />}
          {sparks.map((offset, i) => {
            const angle = heading + offset
            const travel = 24 + shock * (37 + (i % 3) * 12)
            const end = travel + (1 - shock) * (13 + (i % 2) * 9)
            return <line className="edge-fx-detail" key={offset} x1={Math.cos(angle) * travel} y1={Math.sin(angle) * travel}
              x2={Math.cos(angle) * end} y2={Math.sin(angle) * end} strokeWidth={i % 2 ? 2.3 : 3.5} strokeLinecap="round" />
          })}
        </g>
      )}
      {leader && label && <line x1={leader.x * 39} y1={leader.y * 39}
        x2={dx * (1 - 28 / reach)} y2={dy * (1 - 28 / reach)} stroke={color} strokeWidth="1.7" strokeOpacity={label.opacity * .36} />}
      {label && <g transform={`translate(${dx} ${dy})`} opacity={label.opacity}>
        <text className={hit.critical ? "edge-impact edge-impact--critical" : "edge-impact"} fill={color}
          dominantBaseline="central" transform={`scale(${impactScale(age, hit.critical)})`}>
          {hit.critical && <tspan className="edge-impact__critical-label" x="0" y="-28">暴击</tspan>}
          <tspan x="0" y={hit.critical ? 14 : 0}>{damage ? "−" : block ? "挡 " : hit.kind === "heal" ? "+" : "盾 "}{hit.amount}</tspan>
        </text>
      </g>}
    </g>
  )
}

export function EdgeEffects({ battle, viewBox, occluders }: { battle: EdgeBattle; viewBox?: string; occluders: readonly ImpactBox[] }) {
  const simultaneous = new Map<string, EdgeImpact[]>()
  const latestLabel = new Map<string, number>()
  for (const hit of battle.impacts) {
    const key = hit.target + "/" + hit.time
    const group = simultaneous.get(key)
    if (group) {
      const matching = group.findIndex(part => impactKind(part) === impactKind(hit))
      if (matching < 0) group.push(hit)
      else if (hit.kind === "shield") group[matching] = hit
      else group[matching] = { ...group[matching], amount: group[matching].amount + hit.amount }
    } else simultaneous.set(key, [hit])
    if (battle.time - hit.time >= HIT_BEAT) latestLabel.set(hit.target + "/" + impactKind(hit), hit.time)
  }
  const groups = [...simultaneous.values()]
  const labels = new Map<number, ImpactLabel>()
  if (latestLabel.size) {
    const view = impactBounds(viewBox)
    const placed: LabelObstacle[] = occluders.map(box => ({ ...box, opacity: 1, unit: true }))
    for (const group of groups.slice().reverse()) for (const [lane, hit] of group.entries()) {
      const age = battle.time - hit.time - HIT_BEAT
      if (latestLabel.get(hit.target + "/" + impactKind(hit)) !== hit.time || impactFade(age) <= 0) continue
      const label = placeImpactLabel(hit, age, group.length > 1 ? lane : undefined, placed, view)
      labels.set(hit.id, label)
      placed.push(label)
    }
  }
  return (
    <g className="edge-fx" aria-hidden="true">
      {battle.cues.map((cue) => <Trail key={cue.id} cue={cue} age={battle.time - cue.time} tint={tone(battle, cue)} />)}
      {groups.flatMap(group => group.map(hit =>
        <Impact key={hit.id} hit={hit} age={battle.time - hit.time - HIT_BEAT} label={labels.get(hit.id)} />))}
    </g>
  )
}
