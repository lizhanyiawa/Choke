import { mkdirSync, writeFileSync } from "node:fs"

import { DEMO_CARDS, hashOf } from "../src/card/data.ts"
import { SUBJOBS, type SubJobId } from "../src/card/jobs.ts"
import type { Rarity } from "../src/card/types.ts"
import { COOLDOWN, SPARRING_DURATION, createEdgeBattle, stepEdgeBattle, type EdgeActionLog, type EdgeBattle, type EdgeFighter } from "../src/battle/edgeBattle.ts"
import { EDGE_RARITIES, eligibleGold, skillPool, type EdgeInputCard, type EdgeLoadout } from "../src/battle/edgeSkills/catalog.ts"
import { mirror } from "../src/battle/edgeSkills/geometry.ts"
import { BULWARK_COVER, WARDEN_CONTROL } from "../src/battle/edgeSkills/roles.ts"
import { battleFighters, isSummonId, sideOf, type EdgeSide } from "../src/battle/edgeSkills/state.ts"

type Slots = [number, number]
type MatchKind = "replacement" | "lineup" | "loadout" | "passive" | "gold"
type Formation = "open" | "close"

export interface Pick {
  job: SubJobId
  active: Slots
  passive: Slots
  gold: number | null
}

export interface Match {
  id: string
  kind: MatchKind
  rarity: Rarity
  formation: Formation
  a: Pick[]
  b: Pick[]
  probe?: number
}

const jobs = Object.keys(SUBJOBS) as SubJobId[]
const activePairs: Slots[] = []
for (let first = 0; first < 5; first++) {
  for (let second = first + 1; second < 5; second++) activePairs.push([first, second])
}
const reference: Slots = [0, 1]
const probePairs: Slots[] = [reference, [2, 3], [1, 4]]
const passivePairs: Slots[] = [[6, 7], [2, 5], [0, 1]]
const cores = [
  { jobs: ["warden", "ranger", "healer"] as const, formation: "open" as const },
  { jobs: ["bulwark", "warlock", "bard"] as const, formation: "close" as const },
]
const closePositions = [
  { x: 478, y: 748 }, { x: 599, y: 810 }, { x: 727, y: 744 }, { x: 794, y: 849 },
]

export function pick(job: SubJobId, active: Slots = reference, passive: Slots = passivePairs[0], gold: number | null = null): Pick {
  return { job, active, passive, gold }
}

function withCore(core: readonly SubJobId[], job: SubJobId, active: Slots) {
  return [pick(core[0]), pick(job, active), pick(core[1]), pick(core[2])]
}

function *replacementCases(): Generator<Match> {
  for (const rarity of EDGE_RARITIES) for (const [left, job] of jobs.entries()) {
    for (const other of jobs.slice(left + 1)) for (const core of cores) {
      for (const [preset, active] of probePairs.entries()) {
        yield { id: `replace/${rarity}/${core.formation}/${job}/${other}/${preset}`, kind: "replacement",
          rarity, formation: core.formation, a: withCore(core.jobs, job, active), b: withCore(core.jobs, other, active), probe: 1 }
      }
    }
  }
}

function *loadoutCases(): Generator<Match> {
  for (const rarity of EDGE_RARITIES) for (const job of jobs) for (const core of cores) {
    for (const [pair, active] of activePairs.entries()) {
      yield { id: `loadout/${rarity}/${core.formation}/${job}/${pair}`, kind: "loadout",
        rarity, formation: core.formation, a: withCore(core.jobs, job, active), b: withCore(core.jobs, job, reference), probe: 1 }
    }
  }
}

function *passiveCases(): Generator<Match> {
  for (const rarity of EDGE_RARITIES) for (const job of jobs) for (const core of cores) {
    const active = core.formation === "open" ? reference : probePairs[1]
    for (let first = 0; first < 8; first++) for (let second = first + 1; second < 8; second++) {
      const a = withCore(core.jobs, job, active)
      const b = withCore(core.jobs, job, active)
      a[1] = pick(job, active, [first, second])
      yield { id: `passive/${rarity}/${core.formation}/${job}/${first}-${second}`, kind: "passive",
        rarity, formation: core.formation, a, b, probe: 1 }
    }
  }
}

function *goldCases(): Generator<Match> {
  for (const rarity of EDGE_RARITIES) for (const job of jobs) for (const core of cores) {
    const pool = skillPool(job, rarity)
    for (const [index, gold] of pool.gold.entries()) {
      const otherActive = (core.formation === "open" ? reference : probePairs[1]).find(slot => slot !== gold.active)!
      const otherPassive = passivePairs[0].find(slot => slot !== gold.passive)!
      const active: Slots = [gold.active, otherActive]
      const passive: Slots = [gold.passive, otherPassive]
      const a = withCore(core.jobs, job, active)
      const b = withCore(core.jobs, job, active)
      a[1] = pick(job, active, passive, index)
      b[1] = pick(job, active, passive)
      yield { id: `gold/${rarity}/${core.formation}/${job}/${index}`, kind: "gold",
        rarity, formation: core.formation, a, b, probe: 1 }
    }
  }
}

function combinations(): SubJobId[][] {
  const teams: SubJobId[][] = []
  for (let a = 0; a < jobs.length - 3; a++) {
    for (let b = a + 1; b < jobs.length - 2; b++) {
      for (let c = b + 1; c < jobs.length - 1; c++) {
        for (let d = c + 1; d < jobs.length; d++) teams.push([jobs[a], jobs[b], jobs[c], jobs[d]])
      }
    }
  }
  return teams
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function shuffled<T>(values: readonly T[], random: () => number) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const value = result[index]
    result[index] = result[other]
    result[other] = value
  }
  return result
}

function *lineupCases(): Generator<Match> {
  const all = combinations()
  for (const [rank, rarity] of EDGE_RARITIES.entries()) {
    const random = seededRandom(8149 + rank * 1013)
    const schedule = shuffled(all, random)
    const team = (members: SubJobId[]) => shuffled(members, random).map(job => {
      const active = activePairs[Math.floor(random() * activePairs.length)]
      const passive = passivePairs[Math.floor(random() * passivePairs.length)]
      const loadout: EdgeLoadout = { active, passive, gold: null }
      const pool = skillPool(job, rarity)
      const gold = pool.gold.findIndex((_, index) => eligibleGold(pool, loadout, index))
      return pick(job, active, passive, gold === -1 ? null : gold)
    })
    for (let offset = 0; offset < schedule.length; offset += 2) {
      const opponent = schedule[offset + 1] ?? schedule[0]
      yield { id: `lineup/${rarity}/${offset / 2}`, kind: "lineup", rarity,
        formation: random() < .5 ? "open" : "close", a: team(schedule[offset]), b: team(opponent) }
    }
  }
}

export function makeCard(member: Pick, rarity: Rarity, index: number): EdgeInputCard {
  const id = `combination/${member.job}/${rarity}/${index}`
  return {
    uid: index + 1, cardId: id, edgeSubjob: member.job,
    edge: { active: member.active, passive: member.passive, gold: member.gold },
    face: { ...DEMO_CARDS[0], id, name: SUBJOBS[member.job].label, job: SUBJOBS[member.job].archetype,
      art: undefined, isHero: false, level: 1, constellation: 0, rarity, mods: [] },
  }
}

function record() {
  return { damage: 0, shieldDamage: 0, summonDamage: 0, healing: 0, shields: 0, firstTwelveDamage: 0,
    coverHits: 0, coveredDamage: 0, controlLandings: 0,
    downs: 0, forcedExits: 0, basic: 0, casts: [0, 0] as Slots }
}

function verifyActions(actions: EdgeActionLog[], previous: EdgeActionLog | undefined, lastOrder: Record<EdgeSide, number>,
  lastMove: Record<EdgeSide, number>, lastAttack: Map<number, number>, fighters: EdgeFighter[], stats: ReturnType<typeof record>[]) {
  const recent = actions.at(-1)
  if (!recent || previous === recent) return previous
  const start = previous ? actions.indexOf(previous) + 1 : 0
  for (const order of actions.slice(start)) {
    if (order.name === "回场") continue
    const side = order.side
    if (order.time < lastOrder[side] + COOLDOWN.shared - 1e-5) throw Error("Shared cooldown breached")
    lastOrder[side] = order.time
    if (order.name === "移动") {
      if (order.time < lastMove[side] + COOLDOWN.move - 1e-5) throw Error("Movement cooldown breached")
      lastMove[side] = order.time
      continue
    }
    const actor = fighters[order.actorId - 1]
    if (order.time < (lastAttack.get(order.actorId) ?? -Infinity) + actor.actionCooldown - 1e-5) {
      throw Error("Action cooldown breached")
    }
    lastAttack.set(order.actorId, order.time)
    if (order.name === "普攻") stats[order.actorId - 1].basic++
  }
  return recent
}

export function play(match: Match, swapped: boolean, setup?: (battle: EdgeBattle, a: EdgeFighter[], b: EdgeFighter[]) => void) {
  const a = match.a.map((member, index) => makeCard(member, match.rarity, index))
  const b = match.b.map((member, index) => makeCard(member, match.rarity, index))
  const random = seededRandom(hashOf(match.id))
  const battle = swapped ? createEdgeBattle(b, a, random) : createEdgeBattle(a, b, random)
  const sparring = battle.sparring!
  const fighters = battleFighters(battle)
  const byFighter = fighters.map(record)
  if (match.formation === "close") {
    for (const [index, point] of closePositions.entries()) {
      Object.assign(battle.team[index], point)
      Object.assign(sparring.rivals[index], mirror(point))
    }
  }
  if (setup) setup(battle, swapped ? sparring.rivals : battle.team, swapped ? battle.team : sparring.rivals)
  const seen = new Set<number>()
  const opposingAid: { time: number; actor: SubJobId; target: SubJobId; skill?: string;
    signature?: string; source: number; recipient: number; kind: string; amount: number; proc?: string; style?: string }[] = []
  let firstDown: number | null = null
  let previous: EdgeActionLog | undefined
  const lastOrder = { ally: -Infinity, enemy: -Infinity }
  const lastMove = { ally: -Infinity, enemy: -Infinity }
  const lastAttack = new Map<number, number>()
  battle.phase = "running"
  const observe = battle.onSkillEvent
  battle.onSkillEvent = event => {
    observe?.(event)
    const { cast, kind, target } = event
    if (typeof cast.owner !== "number") return
    const owner = fighters[cast.owner - 1]
    if (!owner) return
    const value = byFighter[cast.owner - 1]
    if (kind === "protect" && event.style === BULWARK_COVER.id) {
      value.coverHits++
      value.coveredDamage += event.amount ?? 0
    }
    if (kind === "alter" && event.proc === WARDEN_CONTROL.style) value.controlLandings++
    if (kind === "cast" && cast.used.has("manual") && !event.derived && !cast.signature && !seen.has(cast.id)) {
      seen.add(cast.id)
      const slot = cast.skill?.id === owner.actives[0].id ? 0 : cast.skill?.id === owner.actives[1].id ? 1 : undefined
      if (slot !== undefined) value.casts[slot]++
    }
    if (target === undefined) return
    if (kind === "death" && typeof target === "number") firstDown ??= battle.time
    if (!["hit", "heal", "shield", "death", "exit"].includes(kind)) return
    const friendly = sideOf(battle, owner.id) === sideOf(battle, target)
    const amount = event.amount ?? 0
    if (kind === "hit" && !friendly) {
      if (isSummonId(target)) value.summonDamage += amount
      else if (typeof target === "number") {
        value.damage += amount
        value.shieldDamage += event.absorbed ?? 0
        if (battle.time <= 12) value.firstTwelveDamage += amount
      }
    }
    if (typeof target !== "number") return
    if (kind === "heal" && friendly) value.healing += amount
    if (kind === "shield" && friendly) value.shields += amount
    if (kind === "exit" && !friendly) value.forcedExits++
    if (kind === "death" && !friendly) value.downs++
    if ((kind === "heal" || kind === "shield") && !friendly && amount > 0) {
      opposingAid.push({ time: battle.time, actor: owner.card.subjob.id, target: fighters[target - 1].card.subjob.id,
        skill: cast.skill?.id, signature: cast.signature?.id, source: cast.owner, recipient: target,
        kind, amount, proc: event.proc, style: event.style })
    }
  }
  for (let frame = 0; frame <= SPARRING_DURATION * 60 + 1 && battle.finishedAt === null; frame++) {
    stepEdgeBattle(battle, 1 / 60)
    previous = verifyActions(sparring.actions, previous, lastOrder, lastMove, lastAttack, fighters, byFighter)
  }
  if (battle.finishedAt === null) throw Error("Match did not finish")
  const allyWon = String(battle.phase) === "won"
  const scoreA = String(battle.phase) === "draw" ? .5 : Number(allyWon !== swapped)
  const stats = fighters.map((unit, index) => ({ ...byFighter[index], hp: unit.hp, maxHp: unit.maxHp }))
  return { scoreA, swapped, time: battle.finishedAt, firstDown,
    a: stats.slice(swapped ? 4 : 0, swapped ? 8 : 4), b: stats.slice(swapped ? 0 : 4, swapped ? 4 : 8), opposingAid }
}

function run() {
  const [shardArg = "0", countArg = "1", scope = "all", label = "run", limitArg = "Infinity"] = process.argv.slice(2)
  const shard = Number(shardArg)
  const count = Number(countArg)
  const limit = Number(limitArg)
  const factories = { replacement: replacementCases, lineup: lineupCases, loadout: loadoutCases, passive: passiveCases, gold: goldCases }
  const bundles = { all: [replacementCases, lineupCases, loadoutCases], traits: [passiveCases, goldCases] }
  if (!Number.isInteger(shard) || !Number.isInteger(count) || shard < 0 || shard >= count ||
    !(limit > 0) || !/^[a-z0-9-]+$/.test(label) || !Object.hasOwn(bundles, scope) && !Object.hasOwn(factories, scope)) {
    throw Error("Expected shard, shard count, scope, label and optional case limit")
  }
  const selected = Object.hasOwn(bundles, scope) ? bundles[scope as keyof typeof bundles] : [factories[scope as MatchKind]]
  const schedule = selected.flatMap(make => [...make()])
  const cases = schedule.filter((_, index) => index % count === shard).slice(0, limit)
  if (!cases.length) throw Error("No matching cases")
  const rows: { match: Match; games: ReturnType<typeof play>[] }[] = []
  const errors: { id: string; error: string }[] = []
  for (const [index, match] of cases.entries()) {
    try {
      rows.push({ match, games: [play(match, false), play(match, true)] })
    } catch (error) {
      errors.push({ id: match.id, error: String(error) })
    }
    if ((index + 1) % 250 === 0) console.log(JSON.stringify({ shard, completed: index + 1, total: cases.length, errors: errors.length }))
  }
  const directory = new URL("../.cache/developer/edge-combination-audit/", import.meta.url)
  mkdirSync(directory, { recursive: true })
  writeFileSync(new URL(`${label}-${shard}-of-${count}.json`, directory), JSON.stringify({ rows, errors }))
  console.log(JSON.stringify({ shard, cases: rows.length, games: rows.length * 2, errors }))
  if (errors.length) process.exitCode = 1
}

if (import.meta.main) run()
