import type { ShapeCode } from "./geometry"

export interface Selector {
  units: string
  shape?: ShapeCode
  size: number[]
  anchor?: string
  offset: number
  turn?: number
  order?: "farthest" | "low" | "edge"
  limit?: number
  exclude?: string
  flags: string[]
}

export interface Operation { kind: string; args: number[]; style: string }
export interface Rule { event: string; flags: string[] }
export interface Step {
  delay: number
  selector: Selector
  operations: Operation[]
  zone?: { duration: number; event: string; period: number; holder?: Selector }
  watch?: { duration: number; rule: Rule; holder: Selector; uses: number }
}

export type TargetMode = "self" | "enemy" | "ally" | "other" | "point" | "direction" | "outside"
export interface Aim { mode: TargetMode; range: number; insideOnly: boolean }
const deployments = [
  "sentry", "kiln", "escort", "barricade", "kite",
  "decoy", "lantern", "twinBirds", "medic", "mist",
  "runner", "lasso", "ambush", "shadow", "plate",
  "twinBows", "rail", "bell", "paperGuard", "frostHook",
  "mirror", "roadBeast", "bodyguard", "hexWard", "mirrorWeave",
  "orbitBeast", "shoreBeast", "paperBeat", "rescue", "bridge",
  "ensemble", "gates", "paperPack", "armorBeast", "returnBeast",
] as const
export type DeploymentKind = typeof deployments[number]
export interface CastProgram { aim: Aim; steps: Step[]; deployment?: DeploymentKind }
export interface EffectProgram { rule: Rule; steps: Step[] }

const modes: Record<string, TargetMode> = {
  s: "self", e: "enemy", a: "ally", o: "other", p: "point", l: "direction", x: "outside",
}

const shapeLengths: Record<ShapeCode, number> = { C: 1, L: 2, B: 2, S: 2, F: 2, X: 2, M: 3, J: 2, N: 2, D: 1, K: 3 }
const events = new Set([
  "heals",
  "always", "cast", "strike", "receive", "hit", "hurt", "heal", "shield", "break", "push", "pull", "move", "startMove",
  "dash", "exit", "return", "interrupt", "charge", "cleanse", "redirect", "save", "alter", "assist", "spawn", "end",
  "death", "after", "life", "remove", "protect", "expire", "proc", "shove", "ward", "mend", "sweep", "drawgroup",
  "pushland", "pullland", "absorbshield", "swing",
  "precharge", "forcedland", "deploy", "shadowpush",
])
const operations = new Set([
  "d", "h", "b", "p", "l", "i", "dash", "swap", "rot", "back", "speed", "slow", "root", "anti", "res", "armor",
  "amp", "ampq", "add", "addp", "guard", "split", "wall", "halt", "clean", "strip", "erase", "shed", "leech",
  "missing", "rewind", "cost", "q", "qp", "qr", "take", "extend", "hop", "trace", "phase", "taunt", "stall",
  "defy", "returnhp", "reflect", "exguard", "short", "aimp", "choose", "decoy", "orbit", "seek", "change",
  "range", "block", "allyshield", "regen", "poolheal", "shareheal", "conserve", "absorb", "freeze", "signal", "dot",
  "weak", "vuln", "healamp", "healrecv", "addh", "tether", "score", "glide", "bloom", "splinter", "bank", "overshield",
])

export function parseSelector(source: string): Selector {
  const match = /^([seabotvukwgm])(?:([CLBSFXMJNDK])([\d.,]+))?(?:@([a-z])([+-]\d+(?:\.\d+)?)?)?(?:\^([+-]?\d+))?(?:#([flb]?)(\d+))?(?:!([tsvu]))?(?:\?([\w+.]+))?$/.exec(source)
  if (!match) throw new Error("Invalid selector " + source)
  const [, units, code, size, anchor, offset, turn, order, limit, exclude, flags] = match
  const shape = code as ShapeCode | undefined
  const numbers = size ? size.split(",").map(Number) : []
  if (shape && (numbers.length !== shapeLengths[shape] || numbers.some((n) => !Number.isFinite(n) || n <= 0))) {
    throw new Error("Invalid shape " + source)
  }
  return {
    units, shape, size: numbers, anchor, offset: Number(offset ?? 0), turn: turn ? Number(turn) : undefined,
    order: order === "f" ? "farthest" : order === "l" ? "low" : order === "b" ? "edge" : undefined,
    limit: limit ? Number(limit) : undefined, exclude, flags: flags?.split("+") ?? [],
  }
}

function parseOperation(source: string): Operation {
  const [operation, style = ""] = source.split("~")
  const match = /^([a-z]+)([-+\d.,/]*)$/.exec(operation)
  if (!match || !operations.has(match[1])) throw new Error("Invalid operation " + source)
  const args = match[2] ? match[2].split(/[,/]/).map(Number) : []
  if (args.some((n) => !Number.isFinite(n))) throw new Error("Invalid value in " + source)
  return { kind: match[1], args, style }
}

export function parseRule(source: string): Rule {
  const [event, ...flags] = source.split(".")
  if (!events.has(event)) throw new Error("Invalid event " + source)
  return { event, flags }
}

export function parseStep(source: string): Step {
  const tokens = source.trim().split(/\s+/)
  let delay = 0
  let zone: Step["zone"]
  let watch: Step["watch"]
  if (/^\d*\.?\d+$/.test(tokens[0])) delay = Number(tokens.shift())
  const area = /^z([\d.]+)(?:\/([a-z]+))?(?:\/([\d.]+))?$/.exec(tokens[0])
  const listener = /^w([\d.]+)\/([\w.]+)(?:\/(\d+))?$/.exec(tokens[0])
  if (area) {
    tokens.shift()
    zone = { duration: Number(area[1]), event: area[2] ?? "enter", period: Number(area[3] ?? 0) }
  }
  if (listener) {
    tokens.shift()
    watch = { duration: Number(listener[1]), rule: parseRule(listener[2]), holder: parseSelector(tokens.shift() ?? ""), uses: Number(listener[3] ?? 1) }
  }
  let selector = parseSelector(tokens.shift() ?? "")
  if (zone && tokens[0] && /^[seabotvukwgm][CLBSFXMJNDK]/.test(tokens[0])) {
    zone.holder = selector
    selector = parseSelector(tokens.shift() ?? "")
  }
  if (!tokens.length || (zone && !(zone.holder ?? selector).shape)) throw new Error("Incomplete step " + source)
  return { delay, selector, operations: tokens.map(parseOperation), zone, watch }
}

function readProgram(source: string) {
  const separator = source.indexOf("|")
  if (separator < 0) throw new Error("Missing program " + source)
  return { header: source.slice(0, separator).trim(), steps: source.slice(separator + 1).split(";").filter((line) => line.trim()).map(parseStep) }
}

export function compileCast(source: string): CastProgram {
  const deployed = /\|deploy:([a-zA-Z]+)$/.exec(source)
  const deployment = deployments.find((name) => name === deployed?.[1])
  if (deployed && !deployment) throw new Error("Unknown deployment " + deployed[1])
  const { header, steps } = deployed ? { header: source.slice(0, deployed.index).trim(), steps: [] } : readProgram(source)
  const match = /^([seaoplx])(\d+|\*)?(!)?$/.exec(header)
  if (!match || !steps.length && !deployed) throw new Error("Invalid cast " + source)
  const range = match[2] === "*" ? Infinity : Number(match[2] ?? 0)
  return {
    aim: { mode: modes[match[1]], range, insideOnly: match[1] === "p" && (!!match[3] || range !== Infinity) },
    steps, deployment,
  }
}

export function compileEffect(source: string): EffectProgram {
  const { header, steps } = readProgram(source)
  if (!steps.length) throw new Error("Missing effects " + source)
  return { rule: parseRule(header), steps }
}
