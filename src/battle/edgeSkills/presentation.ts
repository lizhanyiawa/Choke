import type { Rarity } from "@/card/types"
import type { EdgeUnitId } from "../edgeBattle"
import type { DancerPath } from "./dancerChoreo"
import type { EdgeArea, EdgePoint } from "./geometry"
import type { DeploymentKind } from "./program"

export const glyphs = [
  "anchor", "arrow", "barb", "bell", "blade", "bolt", "bow", "branch", "chain", "claw", "clock", "cross", "crown",
  "drop", "dust", "ember", "eye", "feather", "fire", "flag", "flame", "gate", "gear", "heart", "hammer", "hook", "hour",
  "ice", "lantern", "leaf", "loop", "mask", "meteor", "needle", "note", "orb", "petal", "plate", "prism", "ribbon", "rune",
  "seed", "shard", "shield", "sickle", "spark", "star", "step", "thorn", "wall", "wing", "banner", "wave", "sun", "knot", "key",
] as const
export const gestures = [
  "bend", "bloom", "coil", "crack", "cross", "draw", "drop", "echo", "fan", "flash", "flip", "fold", "gate",
  "grid", "lock", "orbit", "pin", "pulse", "ripple", "rise", "shatter", "shield", "shove", "slash", "snap",
  "split", "stamp", "step", "tether", "tick", "trail", "veil", "wall", "wash", "weave",
] as const
const routes = [
  "beam", "bend", "blink", "chain", "chase", "cross", "dash", "lanes", "lob", "orbit", "rain", "return", "rise",
  "shot", "split", "star", "swap", "tether", "wave",
] as const

export type Glyph = typeof glyphs[number]
export type Gesture = typeof gestures[number]
export type Route = typeof routes[number]
export interface Mark { motion: Gesture; glyph: Glyph }
export interface Flight { motion: Route; glyph: Glyph }
export interface SkillArtwork {
  start: Mark
  path?: Flight
  end: Mark
}

export interface SummonBeat {
  kind: DeploymentKind
  cue: "deploy" | "shot" | "act" | "cover" | "stop" | "warp"
  slot: number
  axis: EdgePoint
  other?: EdgePoint
  intercept?: EdgePoint
  landings?: readonly (EdgePoint | undefined)[]
}

export interface BulwarkBeat {
  cue: "setup" | "strike" | "shield" | "heal" | "brace" | "absorb" | "share" | "crossing" | "step" | "taunt" | "interrupt" | "weak"
  owner: EdgeUnitId
  axis: EdgePoint
  other?: EdgePoint
  landings?: readonly (EdgePoint | undefined)[]
  amount?: number
  remaining?: number
  count?: number
}

export interface WardenContact {
  at: EdgePoint
  end?: EdgePoint
  past?: EdgePoint
}

export interface WardenBeat {
  cue: "prepare" | "travel" | "arrival" | "swap" | "hit" | "shield" | "arm" | "brace" | "deploy" | "interrupt" | "stop" | "relay" | "slow"
  owner: EdgeUnitId
  axis: EdgePoint
  paths?: readonly WardenContact[]
  other?: EdgePoint
}

export interface BerserkerBeat {
  cue: "prepare" | "travel" | "flight" | "arrival" | "strike" | "heal" | "cost" | "arm" | "shield" | "guard" | "strip" | "save" | "cash" | "boundary"
  owner: EdgeUnitId
  axis: EdgePoint
  paths?: readonly { at: EdgePoint; end?: EdgePoint; bonus?: boolean }[]
  other?: EdgePoint
  amount?: number
  kind?: string
}

export interface PaladinBeat {
  cue: "prepare" | "flight" | "travel" | "arrival" | "strike" | "heal" | "shield" | "strip"
    | "deploy" | "arm" | "ward" | "retort" | "share" | "swap" | "release"
  owner: EdgeUnitId
  axis: EdgePoint
  other?: EdgePoint
  amount?: number
  reach?: number
  kind?: string
  paths?: readonly { at: EdgePoint; end?: EdgePoint; unit?: EdgeUnitId }[]
}

export interface SpellbreakerBeat {
  cue: "prepare" | "strike" | "strip" | "shield" | "arm" | "ward" | "retort" | "interrupt"
    | "travel" | "arrival" | "deploy" | "release" | "delay" | "remove" | "erase"
  owner: EdgeUnitId
  axis: EdgePoint
  kind?: string
  amount?: number
  other?: EdgePoint
  paths?: readonly { at: EdgePoint; end?: EdgePoint }[]
  fragments?: readonly EdgeArea[]
}

export interface AssassinBeat {
  cue: "prepare" | "flight" | "travel" | "arrival" | "strike" | "arm" | "release" | "shield" | "ward" | "phase" | "interrupt" | "stop" | "deploy" | "cancel"
  owner: EdgeUnitId
  axis: EdgePoint
  other?: EdgePoint
  kind?: string
  amount?: number
  paths?: readonly { at: EdgePoint; end?: EdgePoint; bonus?: boolean }[]
}

export interface WarlockBeat {
  cue: "prepare" | "flight" | "travel" | "strike" | "shield" | "ward" | "deploy" | "arm" | "release" | "interrupt" | "cancel"
  owner: EdgeUnitId
  axis: EdgePoint
  other?: EdgePoint
  kind?: string
  amount?: number
  paths?: readonly { at: EdgePoint; end?: EdgePoint; unit?: EdgeUnitId }[]
}

export interface LifebringerBeat {
  cue: "prepare" | "flight" | "strike" | "heal" | "shield" | "ward" | "arm" | "deploy" | "release" | "transfer" | "cancel"
  owner: EdgeUnitId
  axis: EdgePoint
  other?: EdgePoint
  kind?: string
  amount?: number
  remaining?: number
  count?: number
  paths?: readonly { at: EdgePoint; end?: EdgePoint; unit?: EdgeUnitId; amount?: number }[]
}

export interface BinderBeat {
  cue: "prepare" | "flight" | "strike" | "deploy" | "release" | "miss"
  kind?: string
  other?: EdgePoint
  paths?: readonly { at: EdgePoint; end?: EdgePoint; unit?: EdgeUnitId }[]
}

export interface DancerBeat {
  cue: "prepare" | "mark" | "deploy" | "travel" | "land" | "strike" | "benefit" | "release" | "miss"
  kind?: string
  other?: EdgePoint
  amount?: number
  paths?: readonly { unit?: EdgeUnitId; route: DancerPath }[]
}

export interface SkillVisual {
  id: number
  skill: string
  phase: "start" | "windup" | "travel" | "impact" | "motion" | "passive"
  mark: Mark | Flight
  rarity: Rarity
  gold?: boolean
  start: number
  end: number
  from: EdgePoint
  to: EdgePoint
  target?: EdgeUnitId
  area?: EdgeArea
  cast?: number
  beat?: number
  contacts?: readonly EdgePoint[]
  outcome?: "damage" | "shield" | "heal" | "control"
  summon?: SummonBeat
  bulwark?: BulwarkBeat
  warden?: WardenBeat
  berserker?: BerserkerBeat
  paladin?: PaladinBeat
  spellbreaker?: SpellbreakerBeat
  assassin?: AssassinBeat
  warlock?: WarlockBeat
  lifebringer?: LifebringerBeat
  binder?: BinderBeat
  dancer?: DancerBeat
  healer?: HealerBeat
  bard?: BardBeat
  passive?: {
    mode: "proc" | "consume" | "stance" | "travel"
    owner: EdgePoint
    receiver: EdgePoint
    landing?: EdgePoint
    corner?: EdgePoint
    anchor?: EdgePoint
    trigger?: EdgePoint
    partners?: readonly EdgePoint[]
    landings?: readonly (EdgePoint | undefined)[]
    amount?: number
    statuses?: readonly string[]
  }
}

export interface HealerBeat {
  cue: "prepare" | "flight" | "field" | "heal" | "shield" | "cleanse" | "arm" | "release" | "save" | "split" | "pool"
  kind?: string
  amount?: number
  remaining?: number
  before?: number
  other?: EdgePoint
  statuses?: readonly string[]
}

export interface BardBeat {
  cue: "prepare" | "flight" | "arm" | "hit" | "release" | "land" | "heal" | "shield" | "deploy" | "break" | "rest"
  kind?: string
  count?: number
  amount?: number
  other?: EdgePoint
  paths?: readonly { from: EdgePoint; to: EdgePoint; unit?: EdgeUnitId }[]
}

function readMark<M extends string>(text: string, motions: readonly M[]): { motion: M; glyph: Glyph } {
  const [name, icon, extra] = text.split(".")
  const motion = motions.find((choice) => choice === name)
  const glyph = glyphs.find((choice) => choice === icon)
  if (!motion || !glyph || extra) throw new Error("Invalid skill effect " + text)
  return { motion, glyph }
}

export function readArtwork(line: string, name: string): SkillArtwork {
  if (!line.startsWith(name + " ")) throw new Error("Missing artwork for " + name)
  const [start, path, end, extra] = line.slice(name.length + 1).split(/\s+/)
  if (!start || !path || !end || extra) throw new Error("Incomplete artwork for " + name)
  return {
    start: readMark(start, gestures),
    path: path === "-" ? undefined : readMark(path, routes),
    end: readMark(end, gestures),
  }
}

export function readPassiveGlyphs(line: string) {
  const [marker, ...names] = line.split(/\s+/)
  if (marker !== "@" || names.length !== 8) throw new Error("Missing passive glyphs")
  return names.map((name) => readMark("flash." + name, gestures).glyph)
}

export const isShot = (flight?: Flight) => !!flight && ["shot", "chain", "chase"].includes(flight.motion)
