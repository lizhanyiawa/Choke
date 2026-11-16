import { mkdirSync, writeFileSync } from "node:fs"

import { DEMO_CARDS } from "../src/card/data.ts"
import { SUBJOBS, type SubJobId } from "../src/card/jobs.ts"
import type { Rarity } from "../src/card/types.ts"
import { COOLDOWN, createEdgeBattle, SPARRING_DURATION, stepEdgeBattle, type EdgeActionLog, type EdgeBattle, type EdgeUnitId } from "../src/battle/edgeBattle.ts"
import { tacticFor } from "../src/battle/edgeSkills/aiTactics.ts"
import { EDGE_RARITIES, skillPool, type EdgeInputCard, type EdgeLoadout } from "../src/battle/edgeSkills/catalog.ts"
import { mirror, type EdgePoint } from "../src/battle/edgeSkills/geometry.ts"
import { battleFighters, sideOf, unitOf, type EdgeSide, type FieldEffect, type SkillCast, type SkillEvent } from "../src/battle/edgeSkills/state.ts"

interface Trial {
  kind: "active" | "gold" | "mirror"
  job: SubJobId
  rarity: Rarity
  index: number
  formation: "open" | "close"
  side: EdgeSide
  first: EdgeSide
}

interface Outcome {
  hits: number
  damage: number
  shieldDamage: number
  heals: number
  overheal: number
  shield: number
  protectedHits: number
  displacements: number
  distance: number
  ringOuts: number
  interrupts: number
  removes: number
  alliedTravel: number
  terrainStops: number
}

const dt = 1 / 60
const jobs = Object.keys(SUBJOBS) as SubJobId[]
const sides = ["ally", "enemy"] as const
const formations = ["open", "close"] as const
const closePositions: (EdgePoint & { hp: number })[] = [
  { x: 478, y: 748, hp: .62 }, { x: 599, y: 810, hp: .84 },
  { x: 727, y: 744, hp: .70 }, { x: 794, y: 849, hp: 1 },
]
const outcome = (): Outcome => ({
  hits: 0, damage: 0, shieldDamage: 0, heals: 0, overheal: 0, shield: 0, protectedHits: 0,
  displacements: 0, distance: 0, ringOuts: 0, interrupts: 0, removes: 0, alliedTravel: 0, terrainStops: 0,
})

function template(job: SubJobId, rarity: Rarity, index: number, edge?: EdgeLoadout): EdgeInputCard {
  const id = `audit/${job}/${rarity}/${index}`
  return {
    uid: index + 1, cardId: id, edgeSubjob: job, edge: edge ?? { active: [0, 1], passive: [6, 7], gold: null },
    face: { ...DEMO_CARDS[0], id, art: undefined, job: SUBJOBS[job].archetype, name: SUBJOBS[job].label,
      rarity, level: 1, constellation: 0, mods: [] },
  }
}

function lineups(trial: Trial) {
  const { job, rarity, index, kind, formation } = trial
  const pool = skillPool(job, rarity)
  const pair = kind === "gold" ? pool.gold[index] : undefined
  const active = pair?.active ?? index
  const partner = (active + 2) % pool.active.length
  const reference = kind === "active" ? (active + 1) % pool.active.length : active
  const passive: [number, number] = pair ? [pair.passive, (pair.passive + 3) % pool.passive.length] : [6, 7]
  const roles: SubJobId[] = formation === "open" ? ["warden", job, "ranger", "healer"] : ["bulwark", job, "warlock", "bard"]
  const cards = (test: boolean) => roles.map((role, i) => template(role, rarity, i, i === 1 ? {
    active: [test ? active : reference, partner], passive, gold: test && pair ? index : null,
  } : undefined))
  return {
    lower: cards(trial.side === "ally"), upper: cards(trial.side === "enemy"),
    focus: pool.active[active], gold: pair, partner: pool.active[partner].id, reference: pool.active[reference].id,
  }
}

function settle(sum: Outcome, event: Readonly<SkillEvent>, friendly: boolean) {
  const amount = event.amount ?? 0
  switch (event.kind) {
    case "hit":
      if (!friendly && amount + (event.absorbed ?? 0) > 0) {
        sum.hits++
        sum.damage += amount
        sum.shieldDamage += event.absorbed ?? 0
      }
      break
    case "heal":
      if (friendly) {
        sum.heals += amount
        sum.overheal += event.overheal ?? 0
      }
      break
    case "shield": if (friendly) sum.shield += amount; break
    case "protect":
    case "redirect":
    case "save":
      if (friendly && amount > 0 && event.style !== "halfshield") sum.protectedHits++
      break
    case "assist":
      if (friendly && (event.style === "glide" || event.style === "portal")) sum.alliedTravel++
      if (friendly && event.summon && amount > 0 && ["bodyguard", "mirrorWeave", "paperPack", "armorBeast"].includes(event.style ?? "")) {
        sum.protectedHits++
      }
      if (!friendly && event.summon && ["barricade", "roadBeast", "lasso"].includes(event.style ?? "")) sum.terrainStops++
      break
    case "push":
    case "pull":
      if ((event.distance ?? 0) >= 8) {
        sum.displacements++
        sum.distance += event.distance ?? 0
      }
      break
    case "exit": if (!friendly) sum.ringOuts++; break
    case "interrupt": if (!friendly) sum.interrupts++; break
    case "remove": sum.removes += event.clearedAreas?.length ?? (event.cleansed?.length ?? 0); break
  }
}

const measured = (sum: Outcome) => sum.hits + sum.heals + sum.shield + sum.protectedHits + sum.displacements +
  sum.ringOuts + sum.interrupts + sum.removes + sum.alliedTravel + sum.terrainStops > 0

function sustainLog(battle: EdgeBattle) {
  const skills = new Map<string, { casts: number; damage: number; healing: number; shield: number; fieldBlocked: number }>()
  const fields = new Map<FieldEffect, number>()
  const issued = new Set<number>()
  const fighters = battleFighters(battle)
  const lineup = fighters.map(unit => ({ id: unit.id, job: unit.card.subjob.id, actives: unit.actives.map(skill => skill.id) }))
  const health = () => fighters.map(unit => ({ hp: unit.hp, maxHp: unit.maxHp }))
  const samples = [{ time: 0, health: health() }]
  let nextSample = 60
  let firstDown: number | null = null

  function entry(cast: SkillCast) {
    const key = sideOf(battle, cast.owner) + "/" + (cast.signature?.id ?? cast.skill?.id ?? cast.order)
    let value = skills.get(key)
    if (!value) {
      value = { casts: 0, damage: 0, healing: 0, shield: 0, fieldBlocked: 0 }
      skills.set(key, value)
    }
    return value
  }

  return {
    event(event: Readonly<SkillEvent>, friendly: boolean) {
      const { kind, cast, target } = event
      if (kind === "cast" && cast.used.has("manual") && !event.derived && !cast.signature && !issued.has(cast.id)) {
        issued.add(cast.id)
        entry(cast).casts++
      }
      if (kind === "deploy") {
        for (const field of battle.runtime.fields) {
          if (field.cast === cast && (field.mode === "guard" || field.mode === "wall") && Number.isFinite(field.capacity) && !fields.has(field)) {
            fields.set(field, field.capacity)
          }
        }
      }
      if (typeof target !== "number") return
      if (kind === "death") firstDown ??= battle.time
      const amount = event.amount ?? 0
      if (amount <= 0) return
      if (kind === "hit" && !friendly) entry(cast).damage += amount
      else if (kind === "heal" && friendly) entry(cast).healing += amount
      else if (kind === "shield" && friendly) entry(cast).shield += amount
    },
    tick() {
      if (battle.time < nextSample) return
      samples.push({ time: nextSample, health: health() })
      nextSample += 60
    },
    finish() {
      for (const [field, initial] of fields) entry(field.cast).fieldBlocked += initial - field.capacity
      if (samples.at(-1)?.time !== battle.finishedAt) samples.push({ time: battle.finishedAt!, health: health() })
      return { lineup, firstDown, samples, skills: Object.fromEntries(skills) }
    },
  }
}

function fight(trial: Trial) {
  const { lower, upper, focus, gold, partner, reference } = lineups(trial)
  const battle = createEdgeBattle(lower, upper)
  const sparring = battle.sparring!
  const probe = (trial.side === "ally" ? battle.team : sparring.rivals)[1]
  const fighters = battleFighters(battle)
  sparring.first = trial.first
  if (trial.formation === "close") {
    for (const side of sides) {
      const team = side === "ally" ? battle.team : sparring.rivals
      for (const [index, fighter] of team.entries()) {
        const { x, y, hp } = closePositions[index]
        Object.assign(fighter, side === "ally" ? { x, y } : mirror({ x, y }))
        fighter.hp = Math.round(fighter.maxHp * hp)
      }
    }
  }
  battle.phase = "running"
  const sustain = detail === "sustain" ? sustainLog(battle) : undefined
  const focusOut = outcome()
  const sideOut = { ally: outcome(), enemy: outcome() }
  const casts = new Map<number, { time: number; outcome: Outcome }>()
  const exits = new Map<EdgeUnitId, number>()
  const exileTime = { ally: 0, enemy: 0 }
  const crossSide: { skill: string; type: string; style?: string; amount: number; time: number }[] = []
  let goldProcs = 0
  let observedNotice = 0
  let deathAt: number | null = null
  let firstHitAt: number | null = null
  const totals = { attacks: 0, basics: 0, moves: 0, returns: 0, probeAttacks: 0 }
  const last = { ally: { order: -Infinity, move: -Infinity }, enemy: { order: -Infinity, move: -Infinity } }
  const lastAttack = new Map<number, number>()
  let previousAction: EdgeActionLog | undefined

  battle.onSkillEvent = (event) => {
    const { cast, target, kind } = event
    const subject = typeof target === "number" ? unitOf(battle, target) : undefined
    const source = sideOf(battle, cast.owner)
    const friendly = target === undefined || sideOf(battle, target) === source
    sustain?.event(event, friendly)
    if (kind === "hit" && subject && !friendly && ((event.amount ?? 0) + (event.absorbed ?? 0)) > 0) firstHitAt ??= battle.time
    if ((kind === "heal" || kind === "shield") && subject && !friendly && (event.amount ?? 0) > 0 && crossSide.length < 8) {
      crossSide.push({ skill: cast.signature?.id ?? cast.skill?.id ?? cast.order, type: kind, style: event.style,
        amount: event.amount!, time: battle.time })
    }
    if (subject) {
      settle(sideOut[source], event, friendly)
      if (kind === "exit" && !exits.has(subject.id)) exits.set(subject.id, battle.time)
      if (kind === "return" || kind === "death") {
        const began = exits.get(subject.id)
        if (began !== undefined) {
          exileTime[sideOf(battle, subject.id)] += battle.time - began
          exits.delete(subject.id)
        }
        if (kind === "death" && subject === probe) deathAt = battle.time
      }
    }
    if (cast.owner !== probe.id) return
    const original = cast.berserkerFollowCast ?? cast
    if (original.skill?.id !== focus.id) return
    if (kind === "cast" && !event.derived && !cast.signature && cast.order === "skill" && cast.used.has("manual") && !casts.has(original.id)) {
      casts.set(original.id, { time: battle.time, outcome: outcome() })
    }
    const issued = casts.get(original.id)
    if (!issued || cast.signature && cast.signature.id !== gold?.id) return
    settle(issued.outcome, event, friendly)
    settle(focusOut, event, friendly)
  }

  for (let frame = 0; frame < SPARRING_DURATION * 60 + 2 && battle.phase === "running"; frame++) {
    stepEdgeBattle(battle, dt)
    sustain?.tick()
    const recent = sparring.actions.at(-1)
    if (recent && recent !== previousAction) {
      const from = previousAction ? sparring.actions.indexOf(previousAction) + 1 : 0
      for (const action of sparring.actions.slice(from)) {
        if (action.name === "回场") { totals.returns++; continue }
        const state = last[action.side]
        if (action.time < state.order + COOLDOWN.shared - .00001) throw new Error("Shared cooldown breached")
        state.order = action.time
        if (action.name === "移动") {
          if (action.time < state.move + COOLDOWN.move - .00001) throw new Error("Movement cooldown breached")
          state.move = action.time
          totals.moves++
          continue
        }
        const actor = fighters.find(({ id }) => id === action.actorId)!
        const earlier = lastAttack.get(action.actorId)
        if (earlier !== undefined && action.time < earlier + actor.actionCooldown - .00001) throw new Error("Action cooldown breached")
        lastAttack.set(action.actorId, action.time)
        totals.attacks++
        if (action.name === "普攻") totals.basics++
        if (action.actorId === probe.id) totals.probeAttacks++
      }
      previousAction = recent
    }
    if (gold) {
      for (const notice of battle.runtime.notices) {
        if (notice.id <= observedNotice) continue
        observedNotice = notice.id
        if (notice.owner === probe.id && notice.gold && notice.name === gold.name) goldProcs++
      }
    }
  }
  if (battle.finishedAt === null) throw new Error("Match failed to settle")
  const end = battle.finishedAt
  for (const [unit, began] of exits) exileTime[sideOf(battle, unit)] += end - began
  const attempts = [...casts.values()]
  const observable = attempts.filter(({ time }) => time + 3 <= end)
  return {
    ...trial, skill: focus.id, tested: gold?.id ?? focus.id, name: gold?.name ?? focus.name, partner, reference,
    customized: !!tacticFor(focus), phase: battle.phase as EdgeBattle["phase"], end, firstHitAt, deathAt,
    probeHp: probe.hp, probeMaxHp: probe.maxHp, attackStat: probe.attack, totals, exileTime, sideOut, crossSide,
    casts: attempts.length, observable: observable.length, measured: observable.filter(({ outcome }) => measured(outcome)).length,
    firstCast: attempts[0]?.time ?? null, goldProcs, focusOut, sustain: sustain?.finish(),
  }
}

const [shardArg = "0", countArg = "1", limitArg = "Infinity", scope = "all", label = "run", detail] = process.argv.slice(2)
const filter = scope === "all" ? undefined : scope
const shard = Number(shardArg)
const count = Number(countArg)
const limit = Number(limitArg)
if (!Number.isInteger(shard) || !Number.isInteger(count) || shard < 0 || shard >= count || !(limit > 0) || !/^[a-z0-9-]+$/.test(label)) {
  throw new Error("Expected shard, shard count, and an optional case limit")
}
const trials: Trial[] = []
for (const job of jobs) for (const rarity of EDGE_RARITIES) {
  const pool = skillPool(job, rarity)
  for (const [index] of pool.active.entries()) for (const formation of formations) for (const side of sides) {
    trials.push({ kind: "active", job, rarity, index, formation, side, first: "ally" })
  }
  for (const [index] of pool.gold.entries()) for (const side of sides) {
    trials.push({ kind: "gold", job, rarity, index, formation: "close", side, first: "ally" })
  }
  if (rarity === "C" || rarity === "Prismatic") for (const first of sides) {
    trials.push({ kind: "mirror", job, rarity, index: 0, formation: "open", side: "ally", first })
  }
}
const selected = trials.filter((trial) => !filter || trial.rarity === filter || `${trial.job}/${trial.rarity}` === filter)
  .filter((_, index) => index % count === shard).slice(0, limit)
if (!selected.length) throw new Error("No matching trials")
const rows: ReturnType<typeof fight>[] = []
const errors: { trial: Trial; error: string }[] = []
for (const [index, trial] of selected.entries()) {
  try { rows.push(fight(trial)) }
  catch (error) { errors.push({ trial, error: String(error) }) }
  if ((index + 1) % 100 === 0) console.log(JSON.stringify({ shard, completed: index + 1, selected: selected.length, errors: errors.length }))
}
const directory = new URL("../.cache/developer/edge-sparring-audit/", import.meta.url)
mkdirSync(directory, { recursive: true })
const prefix = label !== "run" ? label : filter ? "recheck-" + filter.replace("/", "-") : Number.isFinite(limit) ? "pilot" : label
const output = new URL(`${prefix}-${shard}-of-${count}.json`, directory)
writeFileSync(output, JSON.stringify({ rows, errors }))
console.log(JSON.stringify({ shard, selected: selected.length, completed: rows.length, errors: errors.length, output: output.pathname }))
