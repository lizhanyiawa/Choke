import assert from "node:assert/strict"

import { activeFor, CHARGE, COOLDOWN, createEdgeBattle as createBattle, issueEdgeOrder, moveEdgeFighter, SPARRING_STEP, startBossCharge, stepEdgeBattle, type EdgeBattle, type EdgeUnit } from "../src/battle/edgeBattle.ts"
import { basicCanFinish, chooseAiAttack, followUpApproach, interruptsLineAfterAdvance, pursueDuelFinish, waitForClearFinish } from "../src/battle/edgeSkills/ai.ts"
import { bestPortalAdvance, bulwarkEscort, canReturnFromShieldedShove, committedReturn, danceRailMove, defensiveThreat, delayCrowdedReturns, dodgeAreaDamage, dodgePortalFollowUp, escapeToEntryWard, escapeToGuard, future, islandReturnCover, leaveConcentratedFire, leaveLethalAreaReach, leaveLethalTargetRange, portalExitIsExposed, portalOpeningValue, retreatFromDive, returnCounterRisk, returnWalk, sharedDodgeWindow, sharedLineExposure, shortAreaThreats, sidestepBeforeEdgeLine, teamAdvanceScoring, walkAt, walksIntoAnnouncedArea, walksIntoLethalReach, walksIntoReadyFinish, walkTriggersLethalMark, warningEjection } from "../src/battle/edgeSkills/aiMovement.ts"
import { entryWards, overturePlacements, rescueFromAnnouncedStrike } from "../src/battle/edgeSkills/aiRescue.ts"
import { announcedHit, announcedShift, announcedStrikes, entryFieldContacts, lifeThroughStrikes, scheduledAid, summonDisruptsCast } from "../src/battle/edgeSkills/aiThreats.ts"
import { dancerPath, dancerRail } from "../src/battle/edgeSkills/dancerChoreo.ts"
import type { EdgeInputCard } from "../src/battle/edgeSkills/catalog.ts"
import { along, areaHits, direction, edgeDistance, FIELD, inside, isOutside, mirror } from "../src/battle/edgeSkills/geometry.ts"
import { attackRange, damageUnit, directHitForecast, estimateDirectHit, forceTo, history, movementSpeed, newCast, positionUnit, previewBasicShove, previewSkillAreas } from "../src/battle/edgeSkills/runtime.ts"
import { BULWARK_COVER, hasHealCut } from "../src/battle/edgeSkills/roles.ts"
import { portalExit } from "../src/battle/edgeSkills/summons.ts"
import type { SubJobId } from "../src/card/jobs.ts"
import type { Rarity } from "../src/card/types.ts"
import type { SkillEvent } from "../src/battle/edgeSkills/state.ts"
import { makeCard, pick, play, type Match } from "./audit-edge-combinations.mts"

type Member = [SubJobId, [number, number]?]
const cards = (members: Member[], rarity: Rarity) => members.map(([job, active], index) => makeCard(pick(job, active), rarity, index))

function createEdgeBattle(lineup: readonly EdgeInputCard[], opponents?: readonly EdgeInputCard[]) {
  return createBattle(lineup, opponents, () => 1)
}

function start(team: Member[], opponents?: Member[], rarity: Rarity = "Prismatic") {
  const battle = createEdgeBattle(cards(team, rarity), opponents && cards(opponents, rarity))
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.onSkillEvent = (event) => events.push({ ...event })
  if (battle.sparring) battle.sparring.sharedAt = Infinity
  return { battle, events, actor: battle.team[0], opponents: battle.sparring?.rivals ?? [] }
}

function advance(battle: EdgeBattle, until: number) {
  while (battle.time < until && battle.phase === "running") stepEdgeBattle(battle, SPARRING_STEP)
}

function place(unit: EdgeUnit, x: number, y: number, health = 1, move: EdgeUnit["move"] = null) {
  Object.assign(unit, { x, y, move, hp: Math.round(unit.maxHp * health) })
}

function impact(events: SkillEvent[], id: string, kind: SkillEvent["kind"]) {
  return new Set(events.filter(({ cast, kind: eventKind, amount, target }) =>
    cast.skill?.id === id && eventKind === kind && amount && typeof target === "number").map(({ target }) => target)).size
}

const observations: Record<string, number | string> = {}

for (const [job, slot] of [["ranger", 1], ["warlock", 2], ["paladin", 1], ["binder", 4]] as const) {
  const other = { ranger: 2, warlock: 4, paladin: 0, binder: 2 }[job]
  const { battle, actor, events, opponents: [enemy] } = start([[job, [slot, other]]], [["berserker"]])
  place(actor, 600, 930)
  place(enemy, 600, 580, 1, { x: 790, y: 580 })
  advance(battle, 1.12)
  const id = activeFor(actor, "skill").id
  observations[id] = impact(events, id, "hit")
}

{
  const { battle, actor, events, opponents: [left, right] } = start([["warden", [3, 2]]], [["ranger"], ["warlock"]])
  place(actor, 610, 940)
  place(left, 402, 650, 1, { x: 600, y: 650 })
  place(right, 818, 650, 1, { x: 615, y: 650 })
  advance(battle, .7)
  observations.hammer = impact(events, "warden/Prismatic/A4", "hit")
}

{
  const { battle, actor, events, opponents: [left, right] } = start([["lifebringer", [4, 0]], ["assassin"]], [["ranger"], ["warlock"]])
  place(actor, 610, 940)
  place(battle.team[1], 500, 669, .55)
  place(left, 421, 650, 1, { x: 600, y: 650 })
  place(right, 799, 650, 1, { x: 615, y: 650 })
  battle.team[1].actionAt = Infinity
  advance(battle, 1.24)
  observations.starbranch = impact(events, "lifebringer/Prismatic/A5", "hit")
  observations.bloom = impact(events, "lifebringer/Prismatic/A5", "heal")
}

{
  const { battle, actor, events, opponents: [enemy] } = start([["healer", [4, 2]], ["assassin"], ["warden"]], [["ranger"]])
  place(actor, 600, 945)
  place(battle.team[1], 395, 680, .46, { x: 580, y: 680 })
  place(battle.team[2], 805, 680, .46, { x: 620, y: 680 })
  for (const ally of battle.team.slice(1)) ally.actionAt = Infinity
  place(enemy, 600, 330)
  advance(battle, .7)
  observations.sanctuary = impact(events, "healer/Prismatic/A5", "heal")
}

for (const low of [false, true]) {
  const { battle, actor, opponents: [enemy] } = start([["berserker", [0, 2]], ["healer", [2, 4]]], [["bulwark"]], "C")
  const healer = battle.team[1]
  place(actor, 460, 826)
  place(healer, 620, 828)
  place(enemy, 620, 643, low ? .04 : 1)
  advance(battle, .24)
  const orders = battle.sparring!.actions.filter(({ side }) => side === "ally")
  observations[low ? "finishBeforeAdvance" : "advanceBeforeChip"] = orders[0]?.name ?? "idle"
  if (!low) {
    advance(battle, 2.5)
    observations.frontLineActed = Number(battle.sparring!.actions.some(({ actorId, name }) => actorId === actor.card.uid && name !== "移动"))
  }
}

{
  const { battle } = start([["ranger"], ["assassin"]])
  const { boss, team } = battle
  place(boss, 600, 500)
  place(team[0], 598, 698)
  place(team[1], 616, 733)
  advance(battle, .1)
  assert(battle.telegraph && boss.lastOrder === "charge")
  const chargeEnds = battle.telegraph.until
  const nextAttack = boss.actionAt
  assert(chargeEnds >= CHARGE.windup && nextAttack > chargeEnds && boss.sharedAt >= COOLDOWN.shared)
  advance(battle, chargeEnds + .12)
  assert(!battle.telegraph)
  place(team[0], 600, 540)
  place(team[1], 600, 820)
  team[0].force = null
  const hp = team[0].hp
  advance(battle, nextAttack - .06)
  assert.equal(team[0].hp, hp)
  advance(battle, nextAttack + .24)
  assert.equal(boss.lastOrder, "basic")
  assert(team[0].hp < hp)
  place(team[0], 625, 950)
  team[0].force = null
  advance(battle, boss.sharedAt + .25)
  const moveAt = boss.moveAt
  assert(boss.move && moveAt >= battle.time + COOLDOWN.move - .25)
  advance(battle, moveAt - .06)
  assert.equal(boss.moveAt, moveAt)
  observations.pve = "charge / basic / move cooldowns"
}

{
  const { battle, actor, opponents: [enemy], events } = start([["warlock"]], [["ranger", [1, 3]]])
  place(actor, 600, 910, .32)
  place(enemy, 600, 400)
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, actor), "共享冷却中")
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, actor), null)
  battle.sparring!.sharedAt = Infinity
  const hp = actor.hp
  advance(battle, .65)
  assert.equal(actor.hp, hp, "a doomed unit should sidestep the visible line")
  assert(!events.some(event => event.kind === "hit" && event.target === actor.id))
  observations.sidestep = battle.sparring!.actions.find(action => action.side === "ally")!.name
}

{
  const { battle, actor, opponents: [enemy], events } = start([["summoner", [1, 2]], ["warlock"]], [["warden", [3, 2]]])
  const ally = battle.team[1]
  place(actor, 880, 900)
  place(ally, 545, 900, .48)
  place(enemy, 620, 466)
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, { x: 562, y: 781 }), null)
  battle.sparring!.sharedAt = 0
  const [entry, exit] = battle.runtime.summons[0].deployment.bodies.toSorted((a, b) => edgeDistance(a, ally) - edgeDistance(b, ally))
  const landing = portalExit(entry, exit, 43)
  place(ally, entry.x + 34, entry.y, .48)
  battle.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, landing), null)
  const warning = battle.runtime.visuals.find(visual => visual.owner === enemy.id && visual.phase === "warning" && visual.effect === "damage")
  assert(warning && areaHits(warning.area, landing) && !areaHits(warning.area, ally), "hammer threat should cover the exit only")
  battle.sparring!.sharedAt = Infinity
  const hp = ally.hp
  advance(battle, .57)
  assert(!events.some(event => event.style === "portal" && event.target === ally.id && event.landing && areaHits(warning.area, event.landing)))
  assert.equal(ally.hp, hp, "AI should not route through the warned exit")
  observations.portalWarning = "avoided"
}

{
  const { battle, actor, opponents: [breaker] } = start([["summoner", [1, 2]], ["warlock", [1, 4]]], [
    ["spellbreaker", [0, 1]],
  ])
  const warlock = battle.team[1]
  place(actor, 528, 1012)
  place(warlock, 848, 1012)
  place(breaker, 608, 396)
  const choice = () => chooseAiAttack(battle, actor, battle.team, [breaker])
  battle.sparring!.sharedAt = 0
  assert.notEqual(choice()?.order, "skill", "do not invest in a gate an available global erase can remove before the first traveler")
  breaker.actionAt = 5
  assert.equal(choice()?.order, "skill", "use the movement window once the counter is cooling")
  battle.moveAt = 5.5
  assert.notEqual(choice()?.order, "skill", "account for the team's movement cooldown, even when the caster can act")
  observations.gateTiming = "accounted for movement and the ready counter"
}

for (const flipped of [false, true]) for (const gainsAttack of [false, true]) {
  const ours = cards([["summoner", [1, 4]], gainsAttack ? ["assassin", [1, 4]] : ["ranger", [1, 2]]], "Prismatic")
  const theirs = cards([["warlock", [0, 2]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? theirs : ours, flipped ? ours : theirs)
  const [team, foes] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [summoner, traveler] = team
  const [enemy] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  const opponentClock = flipped ? battle : battle.sparring!
  opponentClock.sharedAt = Infinity
  Object.assign(enemy, at(636, 513), { actionAt: Infinity })
  Object.assign(summoner, at(368, 1012))
  Object.assign(traveler, at(gainsAttack ? 848 : 688, 1012))
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(835, 906)), null)
  const gate = battle.runtime.summons[0]
  advance(battle, 5.6)
  Object.assign(summoner, at(325, 827))

  const route = bestPortalAdvance(battle, traveler, foes, battle.time + COOLDOWN.shared, summoner.id)
  assert(route && route.strike > 0)
  assert.equal(portalOpeningValue(route) > 0, gainsAttack)
  const intent = chooseAiAttack(battle, summoner, team, foes)
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  if (gainsAttack) {
    assert.equal(intent, undefined)
    battle.nextThinkAt = battle.time
    advance(battle, battle.time + 1.9)
    assert(events.some(event => event.style === "portal" && event.target === traveler.id))
    assert(events.some(event => event.kind === "hit" && event.cast.owner === traveler.id && event.target === enemy.id && event.amount))
  } else {
    assert(intent && intent.order === "skill2")
    assert.equal(issueEdgeOrder(battle, summoner, intent.order, intent.target ?? null, intent.at), null)
    assert(gate.dismissedAt !== undefined)
    advance(battle, battle.time + 2)
    assert(events.some(event => event.cast.skill?.deployment === "returnBeast" && event.kind === "push" && event.target === enemy.id))
  }
}
observations.gateRetentionOpening = "preserved a gate for an actual new attack; replaced an equivalent shot with a summon that connected"

for (const flipped of [false, true]) for (const mode of ["cover", "safe", "late", "no-ward", "warded", "extra-traveler"] as const) {
  const team: Member[] = [["bulwark", mode === "no-ward" ? [1, 4] : [0, 1]], ["summoner", [0, 1]]]
  if (mode === "extra-traveler") team.push(["warlock", [0, 1]])
  const ours = team.map(([job, active], i) => makeCard(pick(job, active, [6, 7]), "Prismatic", i))
  const theirs = (["warden", "spellbreaker", "ranger", "healer"] as const).map((job, i) =>
    makeCard(pick(job, [0, 1], [6, 7]), "Radiant", i))
  const battle = createEdgeBattle(flipped ? theirs : ours, flipped ? ours : theirs)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [tank, summoner, extra] = allies
  const [warden, breaker, ranger, healer] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  const clocks = flipped ? battle.sparring! : battle
  clocks.moveAt = .75
  Object.assign(tank, at(427, 1099), { hp: 159, shield: 70, shieldUntil: 5, actionAt: .98 })
  Object.assign(summoner, at(484, 1065), { hp: mode === "safe" ? 330 : 115, shield: mode === "warded" ? 310 : 36, shieldUntil: 5 })
  Object.assign(warden, at(459, 577), { hp: 566, actionAt: 2.283 })
  Object.assign(breaker, at(408, 598), { hp: 487, actionAt: mode === "late" ? 5 : 2.217 })
  Object.assign(ranger, at(647, 577), { hp: 243, actionAt: 3.15 })
  Object.assign(healer, at(400, 789), { hp: 401, actionAt: .417 })
  if (extra) Object.assign(extra, at(720, 1105))

  const intent = chooseAiAttack(battle, summoner, allies, enemies)
  assert.equal(intent?.order, mode === "cover" ? "skill" : "skill2", JSON.stringify({ flipped, mode, intent }))
}
observations.gateCover = "saved the only traveler's action for lifesaving cover, and kept the gate option when another traveler could use it"

for (const flipped of [false, true]) for (const mode of ["closing", "closing-cooling", "circle", "circle-cooling"] as const) {
  const closing = mode.startsWith("closing")
  const team: Member[] = [["bard", [0, 3]], ["ranger", [0, 1]], ["warlock", [0, 2]], ["healer", [1, 4]]]
  const threats: Member[] = closing ? [["warden", [1, 4]], ["summoner", [1, 2]], ["dancer", [2, 3]]] :
    [["warlock", [1, 4]], ["summoner", [1, 2]]]
  const { battle } = start(flipped ? threats : team, flipped ? team : threats)
  const ours = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [bard, ranger, warlock, healer] = ours
  const [foe, summoner, dancer] = enemies
  const side = flipped ? "enemy" : "ally"
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.sharedAt = battle.sparring!.sharedAt = 0
  Object.assign(bard, closing ? at(538, 1012) : at(777, 684), { actionAt: closing ? .15 : 2.95 })
  Object.assign(ranger, closing ? at(518, 1012) : at(690, 665), { actionAt: 4 })
  Object.assign(warlock, closing ? at(528, 1012) : at(690, 705), { actionAt: 2.7 })
  Object.assign(healer, at(880, 910), { actionAt: 2.3 })
  Object.assign(foe, closing ? at(848, 396) : at(240, 684), { actionAt: mode.endsWith("cooling") ? 5 : 0 })
  Object.assign(summoner, at(789, 649), { actionAt: 4 })
  if (dancer) Object.assign(dancer, at(386, 356), { actionAt: 2 })

  const compare = (foeActives: typeof foe.actives) => {
    foe.actives = foeActives
    const rate = teamAdvanceScoring(battle, side, ours, enemies)
    const options = closing ? [at(495, 827), at(646, 856)] : [at(611, 684), at(960, 684)]
    return options.map(landing => rate(bard, closing ? dancer : summoner, {
      landing, stop: landing, arrival: edgeDistance(bard, landing) / movementSpeed(battle, bard),
    }))
  }
  const kit = foe.actives
  const original = compare(kit)
  const control = compare([kit[1], kit[1]])
  if (mode.endsWith("cooling")) assert.deepEqual(original, control, mode)
  else assert(original[1] - original[0] > control[1] - control[0], JSON.stringify({ flipped, mode, original, control }))
}
observations.formationAdvance = "compared the resulting formation against a ready closing field or damage circle, with cold skills as controls"

for (const flipped of [false, true]) for (const mode of ["open", "unmarked", "spread", "cooling", "hammer"] as const) {
  const team: Member[] = [["warden", [1, 4]], ["dancer", [2, 3]], ["warlock", [1, 4]]]
  const foes: Member[] = [["warden", [0, 3]], ["ranger", [1, 3]], ["assassin", [0, 2]]]
  const { battle } = start(flipped ? foes : team, flipped ? team : foes)
  const ours = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [warden, dancer, warlock] = ours
  const [hammer, ranger, assassin] = enemies
  const side = flipped ? "enemy" : "ally"
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const enemyClock = flipped ? battle : battle.sparring!
  const ownClock = flipped ? battle.sparring! : battle
  battle.sharedAt = battle.sparring!.sharedAt = 0
  Object.assign(warden, at(370, 974), { actionAt: 5 })
  Object.assign(dancer, at(688, 1012))
  Object.assign(warlock, at(898, 1100), { hp: 229 })
  Object.assign(hammer, at(mode === "hammer" ? 793 : 848, mode === "hammer" ? 620 : 396), { actionAt: mode === "hammer" ? 1.016 : 6 })
  Object.assign(ranger, mode === "spread" ? at(368, 328) : at(528, 356), { actionAt: Infinity })
  Object.assign(assassin, mode === "spread" ? at(368, 730) : at(548, 356), { actionAt: Infinity })
  battle.nextThinkAt = Infinity
  if (mode !== "unmarked") assert.equal(issueEdgeOrder(battle, dancer, "skill2", null, warlock), null)
  advance(battle, 1.016)
  if (mode === "cooling") warlock.actionAt = 4.8
  enemyClock.sharedAt = battle.time
  const landing = at(768, 837)
  const path = { landing, stop: landing, arrival: battle.time + edgeDistance(warlock, landing) / movementSpeed(battle, warlock) }
  const rate = teamAdvanceScoring(battle, side, ours, enemies)
  const adjustment = rate(warlock, ranger, path, 250) - rate(warlock, ranger, path)
  assert(Math.abs(adjustment - (mode === "open" ? 250 : 0)) < 1e-6, JSON.stringify({ flipped, mode, adjustment }))
  if (mode !== "open") continue
  ownClock.sharedAt = battle.time
  assert.equal(moveEdgeFighter(battle, warlock, landing), null)
  advance(battle, path.arrival + .05)
  assert(warlock.hp > 229 && edgeDistance(warlock, landing) < 2)
}
observations.healingStepAdvance = "compared a real walk heal and ready area cast on both sides with absent mark, spread, cooldown and a reachable interrupting push"

{
  const { battle, actor, opponents: [breaker, enemy], events } = start([["summoner", [1, 2]], ["warlock", [1, 4]]], [
    ["spellbreaker", [0, 1]], ["berserker"],
  ])
  const warlock = battle.team[1]
  place(actor, 368, 356)
  place(warlock, 688, 356)
  place(breaker, 470, 1020)
  place(enemy, 530, 1040)
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, { x: 580.4, y: 512.6 }), null)
  const [entry, exit] = battle.runtime.summons[0].deployment.bodies.toSorted((a, b) => edgeDistance(a, warlock) - edgeDistance(b, warlock))
  place(warlock, entry.x + 132, entry.y - 35)
  const route = bestPortalAdvance(battle, warlock, [enemy])
  assert(route && route.opening > 0, "an available gate should put the caster in range")
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, exit), null)
  const warning = battle.runtime.visuals.find(visual => visual.clearsSummons)
  assert(warning && areaHits(warning.area, exit) && !areaHits(warning.area, warlock))
  // Let the warning almost finish while neither side can act.
  battle.sharedAt = battle.sparring!.sharedAt = Infinity
  advance(battle, warning.until - .08)
  assert.equal(bestPortalAdvance(battle, warlock, [enemy]), undefined, "do not walk to a gate that will be erased before arrival")
  advance(battle, warning.until + .1)
  assert(events.some(event => event.cast.owner === breaker.id && event.kind === "remove" && event.style === "zone"))
  observations.gateErasure = "read the telegraphed erase at the other end"
}

{
  const { battle, actor: summoner, opponents: [enemy], events } = start([
    ["summoner", [1, 0]], ["assassin", [0, 2]],
  ], [["berserker", [1, 0]]])
  const assassin = battle.team[1]
  place(summoner, 368, 356)
  place(assassin, 688, 356, .73)
  place(enemy, 528, 1061)
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 580.4, y: 512.6 }), null)
  const [entry, exit] = battle.runtime.summons[0].deployment.bodies.toSorted((a, b) => edgeDistance(a, assassin) - edgeDistance(b, assassin))
  const landing = portalExit(entry, exit, 43)
  assassin.actionAt = 1.27
  summoner.actionAt = Infinity
  assert.equal(battle.runtime.visuals.some(visual => visual.phase === "warning" && visual.effect === "damage"), false)
  assert(!portalExitIsExposed(battle, assassin, landing, battle.time + .5), "the enemy cannot attack while its team is cooling")
  battle.sparring!.sharedAt = 0
  assert(portalExitIsExposed(battle, assassin, landing, battle.time + .5), "a melee card can also walk into a prepared cross")
  battle.sharedAt = 0
  advance(battle, 1.15)
  assert(!events.some(event => event.style === "portal" && event.target === assassin.id))
  assert.equal(assassin.hp, Math.round(assassin.maxHp * .73))
  observations.portalCross = "avoided an exit covered by an enemy ready to cast"
}

{
  const { battle, actor, opponents: [warden, ranger] } = start([["warlock", [1, 4]]], [
    ["warden", [3, 2]], ["ranger", [1, 0]],
  ])
  place(actor, 540, 1098, .813)
  place(warden, 570, 308)
  place(ranger, 740, 260)
  actor.actionAt = .65
  warden.attack = 200
  const exit = { x: 600, y: 550 }
  const exposed = () => portalExitIsExposed(battle, actor, exit, .4, 0, false, true)
  battle.sparring!.sharedAt = 0
  assert(exposed(), "two ready opponents can hit before the next move")
  ranger.actionAt = 3
  assert(!exposed(), "one opponent cannot deliver both hits")
  ranger.actionAt = 0
  battle.sparring!.sharedAt = 1.15
  assert(!exposed(), "the second windup ends after the traveler's move is ready")
  battle.sparring!.sharedAt = 0
  actor.shield = 75
  actor.shieldUntil = .85
  assert(exposed(), "the shield expires before the first hit")
  actor.shieldUntil = 1.05
  assert(!exposed(), "a shield can absorb the first hit even if it expires before the second")
  observations.portalCrossfire = "checked the second cast's shared cooldown and shield expiry"
}

for (const slot of [0, 1] as const) {
  const { battle, actor, opponents: [tank, warrior, healer] } = start([["spellbreaker", [slot, 2]]], [
    ["bulwark"], ["berserker"], ["healer", [2, 4]],
  ])
  place(actor, 600, 940)
  place(tank, 600, 675)
  place(warrior, 670, 660)
  place(healer, 735, 630, .36)
  Object.assign(tank, { shield: 320, shieldUntil: 4, actionAt: 4 })
  Object.assign(warrior, { shield: 280, shieldUntil: 4, actionAt: 4 })
  healer.actionAt = 1.2
  battle.moveAt = Infinity
  const hp = healer.hp
  advance(battle, 1.16)
  assert(healer.hp < hp && hasHealCut(battle, healer), "take the opening on the wounded healer before it can recover")
  assert(!hasHealCut(battle, tank), "the tank should not take the only healing reduction through its shield")
  observations[slot === 0 ? "blankBeatHealCut" : "erasureHealCut"] = "wounded healer"
}

{
  const { battle, actor: breaker, opponents: [tank, guarded, bystander], events } = start([
    ["spellbreaker", [0, 1]], ["ranger"],
  ], [["bulwark", [0, 3]], ["warlock"], ["warlock"]])
  const ranger = battle.team[1]
  const placeDome = { x: 450, y: 680 }
  place(breaker, 600, 960)
  place(ranger, 610, 840)
  place(tank, 340, 680)
  place(guarded, 490, 679, .66)
  place(bystander, 750, 701, .66)
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, tank, "skill", null, placeDome), null)
  battle.sharedAt = Infinity
  battle.sparring!.sharedAt = Infinity
  advance(battle, .6)
  assert(battle.runtime.fields.some(field => field.mode === "guard" && field.capacity > 0 && areaHits(field.area, guarded)))
  battle.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, { x: 301, y: 680 }), null)
  const startAt = battle.time
  battle.sharedAt = Infinity
  advance(battle, startAt + 1.02)
  assert(events.some(event => event.kind === "remove" && event.cast.owner === breaker.id && event.clearedAreas?.length))
  assert(battle.runtime.histories.get(guarded.id)?.wardBroken)
  assert(!battle.runtime.histories.get(bystander.id)?.wardBroken)
  const skills = ranger.actives
  const passive = { ...skills[0], id: "test/no-active", steps: [], aim: { mode: "self" as const, insideOnly: false, range: 0 } }
  ranger.actives = [passive, passive]
  const target = () => chooseAiAttack(battle, ranger, [breaker, ranger], [guarded, bystander])?.target
  assert.equal(target(), guarded, "a ranged partner should follow up on the newly unprotected target")
  advance(battle, battle.time + 2.85)
  assert.equal(target(), bystander, "the opening expires")
  observations.wardFollowUp = "focused the newly unprotected target before the opening expired"
}

{
  const { battle, actor, opponents: [enemy], events } = start([["summoner", [1, 2]], ["warlock"]], [["berserker", [0, 1]]])
  const ally = battle.team[1]
  place(actor, 900, 900)
  place(ally, 650, 755, .28)
  place(enemy, 650, 550)
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, { x: 650, y: 1000 }), null)
  actor.actionAt = 0
  battle.sharedAt = 0
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, enemy, "skill2", null, ally), null)
  battle.sparring!.sharedAt = Infinity
  const intent = chooseAiAttack(battle, actor, battle.team, [enemy])
  assert.equal(intent?.order, "skill2", "keep the defensive summon available when the gate cannot save a focused ally")
  assert.equal(intent?.target, ally)
  assert.equal(issueEdgeOrder(battle, actor, "skill2", ally), null)
  advance(battle, .7)
  assert(ally.hp > 0)
  assert(events.some(event => event.style === "paperPack" && event.target === ally.id && (event.amount ?? 0) > 0))
  observations.paperGuard = "intercepted"
}

{
  const { battle, actor } = start([["ranger"]])
  place(battle.boss, 600, 490)
  place(actor, 600, 710, 1, { x: 845, y: 710 })
  advance(battle, .05)
  assert.equal(battle.telegraph, null, "boss should not charge the stale position of a unit leaving range")
  assert(battle.boss.move, "boss can approach when its charge is out of range")
  observations.pveRead = "approached"
}

{
  const { battle, actor } = start([["ranger"]])
  place(battle.boss, 600, 490)
  place(actor, 640, 645, 1, { x: 930, y: 740 })
  const hp = actor.hp
  advance(battle, .05)
  assert(battle.boss.move && battle.boss.move.x > 690, "the boss should lead a target whose current walk leaves charge reach")
  const destination = { ...battle.boss.move }
  advance(battle, .6)
  assert.deepEqual(battle.boss.move, destination, "the boss keeps the issued route during the move cooldown")
  assert.equal(actor.hp, hp)
  observations.pvePursuit = "led the current walk"
}

{
  const { battle } = start([["ranger"], ["assassin"]])
  const { boss, team } = battle
  boss.lastOrder = "charge"
  place(boss, 600, 500)
  place(team[0], 600, 709)
  place(team[1], 626, 730)
  advance(battle, .08)
  assert(battle.telegraph, "the boss should reuse its cooled charge when two targets line up again")
  const ready = boss.actionAt
  advance(battle, .5)
  assert.equal(boss.actionAt, ready)
  observations.pveFollowUp = "charged two lined-up cards"
}

{
  const { battle, events } = start([["ranger"], ["assassin"]])
  const { boss, team } = battle
  boss.lastOrder = "charge"
  place(boss, 600, 480)
  place(team[0], 562, 710)
  place(team[1], 638, 710)
  advance(battle, .08)
  assert(battle.telegraph && Math.abs(battle.telegraph.direction.x) < .01, "aim between targets whose individual rays miss each other")
  advance(battle, battle.telegraph.until + .08)
  const hit = new Set(events.filter(event => event.kind === "hit" && event.cast.used.has("bossCharge")).map(event => event.target))
  assert.equal(hit.size, 2)
  observations.pveChargeSpread = "hit both targets with the angle between them"
}

{
  const { battle, actor, opponents: [summoner] } = start([["ranger", [1, 3]]], [["summoner", [1, 2]]])
  place(actor, 610, 700)
  place(summoner, 610, 500)
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 610, y: 620 }), null)
  const pair = battle.runtime.summons[0].deployment.bodies
  pair[0].hp = 35
  pair[1].hp = 40
  const basicChoice = () => {
    const skills = actor.actives
    const silence = { ...skills[0], steps: [], aim: { mode: "self" as const, insideOnly: false, range: 0 } }
    actor.actives = [silence, silence]
    const intent = chooseAiAttack(battle, actor, battle.team, [summoner])
    actor.actives = skills
    return intent?.target
  }
  assert(pair.some(body => body === basicChoice()), "breaking a live gate can beat an ordinary hit")
  pair[1].hp = 0
  assert.equal(basicChoice(), summoner, "a broken route should not distract a basic attack")
  observations.disarmGate = "live only"
}

{
  const { battle, actor, opponents: [shooter], events } = start([["summoner", [4, 0]], ["ranger"]], [["ranger", [0, 2]]], "L")
  const ally = battle.team[1]
  place(actor, 590, 1050)
  ally.actionAt = 4.5
  place(ally, 600, 845, .62)
  place(shooter, 600, 540)
  battle.sparring!.sharedAt = 0
  shooter.actives = [{ ...shooter.actives[0], steps: [] }, { ...shooter.actives[1], steps: [] }]
  assert.notEqual(chooseAiAttack(battle, actor, battle.team, [shooter])?.order, "skill", "no basic shot can reach this line")
  place(ally, 600, 790, .62)
  const order = chooseAiAttack(battle, actor, battle.team, [shooter])
  assert.equal(order?.order, "skill", "prefer a mirror link across a reachable basic shot")
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, order.at), null)
  battle.sparring!.sharedAt = 0
  const hp = ally.hp
  assert.equal(issueEdgeOrder(battle, shooter, "basic", ally), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, .5)
  assert.equal(ally.hp, hp)
  assert(events.some(event => event.kind === "assist" && event.style === "mirrorWeave" && event.target === ally.id))
  observations.mirrorLane = "intercepted"
}

{
  const { battle, actor, opponents: [enemy], events } = start([["summoner", [0, 3]], ["ranger", [0, 4]]], [["bulwark"]], "L")
  const ally = battle.team[1]
  place(actor, 660, 907)
  place(ally, 600, 830)
  place(enemy, 600, 615)
  ally.actionAt = .84
  const inactive = { ...ally.actives[0], steps: [], aim: { mode: "self" as const, range: 0, insideOnly: false } }
  // The live trap kit has its own delayed benefits. Isolate the basic-attack partner.
  ally.actives = [inactive, inactive]
  const order = chooseAiAttack(battle, actor, battle.team, [enemy])
  assert.equal(order?.order, "skill", "attach the mirror to the ranger who can use it")
  assert.equal(order?.target?.id, ally.id)
  advance(battle, 1.7)
  assert(events.some(event => event.cast.skill?.id === "summoner/L/A1" && event.kind === "hit" && event.target === enemy.id))
  observations.mirrorFollow = "followed a basic attack"
}

for (const mode of ["alternative", "doomed", "warded", "spell"] as const) {
  const { battle, actor: summoner, opponents: [binder], events } = start(
    [["summoner", [0, 1]], ["bulwark"], ["ranger", [0, 4]]], [["binder", [1, 0]]], "L")
  const [, tank, ranger] = battle.team
  place(summoner, 660, 913)
  place(tank, 579, 630)
  place(binder, 555, 603)
  place(ranger, mode === "alternative" || mode === "spell" ? 618 : 960, mode === "alternative" || mode === "spell" ? 823 : 986)
  tank.hp = 66
  tank.actionAt = 2.83
  ranger.actionAt = .84
  if (mode !== "spell") ranger.actives = ranger.actives.map(skill => ({
    ...skill, steps: [], aim: { mode: "self", range: 0, insideOnly: false },
  })) as typeof ranger.actives
  if (mode === "warded") Object.assign(tank, { shield: 500, shieldUntil: 4 })
  battle.moveAt = battle.sparring!.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, binder, "skill", tank), null)
  battle.sparring!.sharedAt = Infinity
  const [incoming] = announcedStrikes(battle, tank)
  assert(incoming?.strike.cast.skill?.id === "binder/L/A2")
  const damage = announcedHit(battle, incoming, tank, tank, unit => unit)
  assert.equal(damage?.lethal, mode !== "warded")
  assert.equal(announcedHit(battle, incoming, tank, tank, unit => unit === binder ? { x: binder.x + 7, y: binder.y } : unit), undefined)
  const order = chooseAiAttack(battle, summoner, battle.team, [binder])
  if (mode === "alternative") assert.equal(order?.target?.id, ranger.id)
  if (mode === "doomed" || mode === "spell") assert.notEqual(order?.order, "skill")
  advance(battle, 1.8)
  assert.equal(tank.hp > 0, mode === "warded")
  assert.equal(events.some(event => event.kind === "hit" && event.cast.skill?.id === "summoner/L/A1"), mode === "alternative")
}
observations.mirrorPartner = "chose the ally whose basic could land instead of the doomed tank or a partner using a stronger skill"

for (const mode of ["queued", "late", "durable", "finisher", "released"] as const) {
  const { battle, actor: summoner, events } = start([["summoner", [0, 1]], ["ranger", [0, 4]]], undefined, "L")
  const [, ranger] = battle.team
  const { boss } = battle
  place(summoner, 507, 680)
  place(ranger, 700, 675)
  place(boss, 670, 620)
  boss.lastOrder = "charge"
  battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, summoner, "skill", ranger), null)
  advance(battle, .91)
  const [body] = battle.runtime.summons[0].deployment.bodies
  if (mode !== "durable") body.hp = 25
  if (mode === "finisher") ranger.hp = 10
  if (mode === "late") ranger.actionAt = 5
  else assert.equal(issueEdgeOrder(battle, ranger, "basic", boss), null)
  if (mode === "released") advance(battle, 1.15)
  battle.nextThinkAt = battle.time
  advance(battle, 1.65)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === boss.id)
  assert.equal(hit?.target, mode === "queued" ? body.id : ranger.id, mode)
  assert.equal(body.hp === 0, mode === "queued")
  assert.equal(events.some(event => event.kind === "hit" && event.cast.skill?.id === "summoner/L/A1" && event.target === boss.id),
    mode === "durable" || mode === "finisher" || mode === "released", mode)
  assert.equal(boss.actionAt, hit?.cast.issuedAt! + boss.actionCooldown)
}
observations.pveMirror = "broke the vulnerable mirror before a queued basic landed, attacked the card when the mirror could not be stopped or the card could be finished"

{
  const { battle, actor, opponents: [shooter], events } = start([["bulwark", [2, 4]], ["warlock"]], [["ranger", [1, 3]]])
  const ally = battle.team[1]
  place(actor, 705, 1050)
  place(ally, 600, 850, .32)
  place(shooter, 600, 380)
  ally.actionAt = Infinity
  battle.moveAt = .8
  assert.equal(chooseAiAttack(battle, actor, battle.team, [shooter]), undefined, "no nearby enemy or visible shot to block")
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, shooter, "skill", null, ally), null)
  battle.sparring!.sharedAt = Infinity
  const order = chooseAiAttack(battle, actor, battle.team, [shooter])
  assert.equal(order?.order, "skill", "set a wall even with no enemy in the strike band")
  const hp = ally.hp
  advance(battle, .62)
  assert(ally.hp > 0 && ally.hp <= hp, "the backline should survive the shot")
  assert(events.some(event => event.cast.skill?.id === "bulwark/Prismatic/A3" && event.kind === "protect" &&
    event.style === "wall" && event.target === ally.id && (event.amount ?? 0) > 0))
  observations.seawall = "intercepted"
}

{
  const { battle, actor, opponents: [attacker], events } = start([["paladin", [0, 2]], ["warlock"], ["healer"]], [["assassin", [0, 2]]])
  const [, first, second] = battle.team
  place(actor, 248, 1085)
  place(first, 820, 680, .38)
  place(second, 830, 810, .36)
  place(attacker, 665, 330)
  first.actionAt = second.actionAt = Infinity
  battle.moveAt = .9
  assert.notEqual(chooseAiAttack(battle, actor, battle.team, [attacker])?.order, "skill", "hold the team guard before a threat develops")
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, attacker, "skill2", null, { x: 825, y: 745 }), null)
  battle.sparring!.sharedAt = Infinity
  assert.equal(chooseAiAttack(battle, actor, battle.team, [attacker])?.order, "skill", "guard both distant allies before the shear")
  const attackerHp = attacker.hp
  advance(battle, .9)
  assert(first.hp > 0 && second.hp > 0 && attacker.hp < attackerHp)
  assert.equal(impact(events, "paladin/Prismatic/A1", "protect"), 2)
  observations.dawnAccord = "blocked and retaliated"
}

{
  const { battle, actor, opponents: [enemy], events } = start([["healer", [1, 4]], ["ranger"]], [["berserker", [1, 0]]])
  const ally = battle.team[1]
  place(actor, 880, 920)
  place(ally, 595, 815, .32)
  place(enemy, 595, 455)
  battle.moveAt = .9
  ally.actionAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, ally), null)
  battle.sparring!.sharedAt = Infinity
  assert.equal(chooseAiAttack(battle, actor, battle.team, [enemy])?.order, "skill2", "use the heal that lands before the cross")
  advance(battle, .8)
  assert(ally.hp > 0)
  assert.equal(impact(events, "healer/Prismatic/A5", "heal"), 1)
  observations.urgentHeal = "first beat"
}

{
  const { battle, actor, opponents: [enemy, tank, assassin], events } = start(
    [["warlock", [1, 4]], ["spellbreaker"]], [["berserker", [1, 0]], ["bulwark"], ["assassin", [2, 0]]],
  )
  const ally = battle.team[1]
  place(actor, 528, 356, .68)
  place(ally, 537, 472)
  place(enemy, 496, 873)
  place(tank, 536, 557)
  place(assassin, 753, 884)
  battle.moveAt = .8
  battle.sharedAt = .86
  ally.actionAt = 1
  tank.actionAt = 4
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, assassin, "skill", null, ally), null)
  // A committed first strike and a second enemy about to come off cooldown.
  battle.nextThinkAt = .86
  advance(battle, .91)
  assert(!battle.sparring!.actions.some(action => action.side === "ally"), "reserve the shared cooldown after the first hit")
  assert(actor.hp < actor.maxHp * .46)
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, ally), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, 1.6)
  assert(actor.hp > 0, "the wounded caster should move across the short side of the cross")
  assert(battle.sparring!.actions.some(action => action.actorId === actor.id && action.name === "移动" && action.time < 1.5))
  assert(!events.some(event => event.cast.skill?.id === "berserker/Prismatic/A2" && event.kind === "hit" && event.target === actor.id))
  observations.crossEscape = "avoided follow-up"
}

{
  const { battle, actor: warlock, opponents: [ranger], events } = start(
    [["warlock", [1, 4]], ["warden"]], [["ranger", [1, 3]]],
  )
  const warden = battle.team[1]
  place(warlock, 610, 750, .39)
  place(warden, 980, 936)
  place(ranger, 610, 420)
  warlock.actionAt = 5
  warden.actionAt = 5
  history(battle, warlock).wounds.push({ time: battle.time - .8, amount: warlock.maxHp * .3 })
  const ready = battle.time + .52
  ranger.actionAt = ready
  battle.sparring!.sharedAt = ready
  const before = battle.sparring!.actions.length
  advance(battle, ready - .03)
  assert.equal(battle.sparring!.actions.length, before, "leave movement ready while a follow-up can still be dodged")
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, warlock), "角色冷却中")
  battle.nextThinkAt = ready + .05
  advance(battle, ready + .01)
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, warlock), null)
  battle.sparring!.sharedAt = Infinity
  const hp = warlock.hp
  advance(battle, battle.time + .67)
  assert.equal(warlock.hp, hp)
  assert(battle.sparring!.actions.some(action => action.actorId === warlock.id && action.name === "移动"))
  assert(!events.some(event => event.cast.owner === ranger.id && event.kind === "hit" && event.target === warlock.id))
  observations.reservedMove = "saved movement for the wounded back line"
}

{
  const { battle, actor: tank, opponents: [ranger], events } = start(
    [["warden", [4, 0]], ["warlock", [1, 4]]], [["ranger", [1, 3]]],
  )
  const warlock = battle.team[1]
  place(tank, 460, 930)
  place(warlock, 660, 775, .2)
  place(ranger, 660, 420)
  battle.moveAt = Infinity
  warlock.actionAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, warlock), null)
  battle.sparring!.sharedAt = Infinity
  assert.equal(chooseAiAttack(battle, tank, battle.team, [ranger])?.target, warlock)
  const hp = warlock.hp
  advance(battle, .7)
  assert.equal(warlock.hp, hp, "the swap gets the wounded ally out before the shot")
  assert(events.some(event => event.cast.skill?.id === "warden/Prismatic/A5" && event.kind === "dash" && event.target === warlock.id))
  assert(events.some(event => event.cast.owner === ranger.id && event.kind === "hit" && event.target === tank.id))
  observations.swapRescue = "replaced the wounded ally with a tank that could survive"
}

{
  const { battle, actor: summoner, opponents: [ranger], events } = start(
    [["summoner", [1, 2]], ["warlock", [1, 4]], ["dancer"]], [["ranger", [1, 3]]],
  )
  const [, threatened, oldWard] = battle.team
  place(summoner, 910, 960)
  place(threatened, 610, 740, .26)
  place(oldWard, 920, 1040)
  place(ranger, 610, 400)
  threatened.actionAt = oldWard.actionAt = Infinity
  battle.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, summoner, "skill2", oldWard), null)
  advance(battle, summoner.actionAt + .02)
  assert(battle.runtime.summons.some(group => group.target === oldWard.id && group.dismissedAt === undefined))
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, threatened), null)
  battle.sparring!.sharedAt = Infinity
  const rescue = chooseAiAttack(battle, summoner, battle.team, [ranger])
  assert(rescue?.order === "skill2" && rescue.target === threatened, "replace an idle ward when its current link protects nobody in danger")
  advance(battle, battle.time + .61)
  assert(threatened.hp > 0)
  assert(events.some(event => event.style === "paperPack" && event.target === threatened.id && (event.amount ?? 0) > 0))
  observations.retargetGuard = "moved an idle summon to the ally under fire"
}

for (const flipped of [false, true]) for (const mode of ["open", "too-late", "shielded", "bodyguard-ready", "bodyguard-distant"] as const) {
  const kind = mode.startsWith("bodyguard") ? "bodyguard" : "paperPack"
  const defenders = cards([["summoner", kind === "bodyguard" ? [2, 3] : [1, 2]], ["warlock"], ["healer"]], kind === "bodyguard" ? "L" : "Prismatic")
  const attackers = cards([["assassin", [2, 4]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const [summoner, target, farAlly] = team
  const assassin = (flipped ? battle.team : battle.sparring!.rivals)[0]
  const clocks = flipped ? battle.sparring! : battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(assassin, at(550, 425), { attack: 176 })
  Object.assign(target, at(630, 735), { hp: 194, actionAt: Infinity })
  Object.assign(summoner, mode === "bodyguard-ready" ? at(674, 735) : at(918, 905))
  Object.assign(farAlly, at(900, 1050), { actionAt: Infinity })
  if (mode === "shielded") Object.assign(target, { shield: 330, shieldUntil: 4 })
  if (mode === "too-late") clocks.sharedAt = 1
  assert.equal(issueEdgeOrder(battle, assassin, "skill", null, target), null)
  advance(battle, mode === "bodyguard-distant" ? .57 : .24)
  const rescue = rescueFromAnnouncedStrike(battle, team)
  const saves = mode === "open" || mode === "bodyguard-ready"
  assert.equal(rescue?.intent.target?.id, saves ? target.id : undefined, `${flipped}/${mode}`)
  if (rescue) assert.equal(issueEdgeOrder(battle, rescue.actor, rescue.intent.order, target, rescue.intent.at), null)
  advance(battle, .91)
  assert.equal(target.hp > 0, saves || mode === "shielded", mode)
}
observations.linkedGuardRescue = "deployed a live linked guard before both blades, with cooldown, shield and travel controls"

for (const flipped of [false, true]) for (const mode of ["paper", "rewind", "late-rewind", "late-shield", "shield", "range-lip", "inside-range"] as const) {
  const defenders = cards([["summoner", [1, 2]], ["warlock", [1, 4]], ["dancer", [2, 3]]], "Prismatic")
  const attackers = cards([["assassin", [0, 2]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const home = flipped ? battle.sparring! : battle
  const away = flipped ? battle : battle.sparring!
  const [summoner, patient, dancer] = flipped ? battle.sparring!.rivals : battle.team
  const [assassin] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const walking = mode === "range-lip" || mode === "inside-range"
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  battle.phase = "running"
  away.moveAt = Infinity
  home.moveAt = walking ? 0 : Infinity
  Object.assign(summoner, at(918, 905), { actionAt: walking || mode === "late-rewind" ? Infinity : 0 })
  Object.assign(patient, at(walking ? 608 : 630, mode === "range-lip" ? 811 : 735),
    { hp: mode === "late-shield" ? 160 : 205, actionAt: Infinity })
  Object.assign(dancer, at(875, 845), { actionAt: mode === "rewind" || mode === "late-shield" ? 0 : mode === "late-rewind" ? .5 : Infinity })
  Object.assign(assassin, walking ? at(608, 425) : at(550, 425), { attack: 176 })
  if (mode === "shield" || mode === "late-shield") Object.assign(patient, { shield: 90, shieldUntil: .55 })
  assert.equal(issueEdgeOrder(battle, assassin, "skill", patient), null)
  const contacts = announcedStrikes(battle, patient)
  assert.equal(contacts.length, 2, mode)
  assert.equal(contacts[0].strike.cast, contacts[1].strike.cast)
  assert.equal(lifeThroughStrikes(battle, patient, contacts, unit => unit).hp, mode === "shield" ? 29 : 0)
  advance(battle, .94)

  const hit = events.filter(event => event.cast.skill?.id === "assassin/Prismatic/A1" &&
    event.kind === "hit" && event.target === patient.id)
  assert.equal(hit.length, mode === "range-lip" ? 0 : 2, mode)
  const action = battle.sparring!.actions.find(action => action.side === (flipped ? "enemy" : "ally"))
  if (mode === "rewind" || mode === "late-shield") {
    const first = events.indexOf(hit[0]), second = events.indexOf(hit[1])
    const ward = events.findIndex(event => event.kind === "shield" && event.cast.owner === dancer.id && event.target === patient.id)
    assert(ward > first && ward < second && hit[1].absorbed === 157, mode)
    assert.equal(action?.actorId, dancer.id, mode)
  }
  if (mode === "paper") {
    const deployment = battle.runtime.summons.find(group => group.deployment.kind === "paperPack")
    assert(deployment?.target === patient.id && deployment.start > contacts[0].at && deployment.start < contacts[1].at)
    assert.equal(hit[0].amount, 109)
    assert.equal(hit[1].amount, 88)
  }
  if (mode === "range-lip") assert(action?.actorId === patient.id && action.name === "移动")
  assert.equal(patient.hp, { paper: 8, rewind: 96, "late-rewind": 0, "late-shield": 141, shield: 29,
    "range-lip": 205, "inside-range": 0 }[mode], mode)
}
observations.lockedBladeAid = "picked an in-time rewind, a guard after the first blade, or a walk across the lock range, with late and shielded controls"

for (const flipped of [false, true]) for (const afterRelease of [false, true]) for (const disable of ["push", "down"] as const) {
  const attack = cards([["assassin", [0, 2]], ["warden"]], "Prismatic")
  const defense = cards([["warlock"]], "Prismatic")
  const battle = createEdgeBattle(flipped ? defense : attack, flipped ? attack : defense)
  const [assassin] = flipped ? battle.sparring!.rivals : battle.team
  const [patient] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(assassin, at(550, 425), { attack: 176 })
  Object.assign(patient, at(630, 735))
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  assert.equal(issueEdgeOrder(battle, assassin, "skill", patient), null)
  if (afterRelease) advance(battle, .18)
  if (disable === "down") assassin.hp = 0
  else forceTo(battle, assassin, at(550, 275), .4)
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
  const threats = announcedStrikes(battle, patient, .9, position)
  const hp = lifeThroughStrikes(battle, patient, threats, position).hp
  advance(battle, .94)
  assert.equal(patient.hp, hp)
  assert.equal(events.filter(event => event.kind === "hit" && event.cast.skill?.id === "assassin/Prismatic/A1").length,
    afterRelease ? 2 : 0, disable)
}
observations.lockedBladeRelease = "matched both real hits after release and discarded both when the assassin was moved or downed before the lock"

for (const flipped of [false, true]) for (const mode of ["stay", "return-before", "return-after"] as const) {
  const attack = cards([["assassin", [0, 2]]], "Prismatic")
  const defense = cards([["warlock"], ["healer"]], "Prismatic")
  const battle = createEdgeBattle(flipped ? defense : attack, flipped ? attack : defense)
  const [assassin] = flipped ? battle.sparring!.rivals : battle.team
  const [patient, neighbor] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(assassin, at(690, 425), { attack: 176 })
  Object.assign(patient, at(FIELD.left - 4, 735))
  Object.assign(neighbor, at(FIELD.left + 35, 736))
  assert(edgeDistance(assassin, patient) > activeFor(assassin, "skill").aim.range && isOutside(patient))
  assert.equal(issueEdgeOrder(battle, assassin, "skill", patient), null)
  if (mode === "return-after") advance(battle, .18)
  if (mode !== "stay") assert.equal(moveEdgeFighter(battle, patient, at(FIELD.left + 35, 735)), null)
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
  const contacts = announcedStrikes(battle, patient, .9, position)
  assert.equal(contacts.length, 2)
  const hp = lifeThroughStrikes(battle, patient, contacts, position).hp
  advance(battle, .85)
  const hits = events.filter(event => event.kind === "hit" && event.cast.skill?.id === "assassin/Prismatic/A1")
  assert.equal(hits.length, mode === "return-before" ? 0 : 2, mode)
  assert(hits.every(hit => hit.target === patient.id) && neighbor.hp === neighbor.maxHp)
  assert.equal(patient.hp, hp, mode)
}
observations.lockedBladeReturn = "applied the outside range exemption at release, and followed only the locked target after its return"

for (const flipped of [false, true]) for (const protectedWalk of [false, true]) {
  const defenders = cards([["summoner", [1, 2]], ["ranger"], ["warlock"]], "Prismatic")
  const attackers = cards([["assassin", [2, 4]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const side = flipped ? battle.sparring! : battle
  const team = flipped ? battle.sparring!.rivals : battle.team
  const [summoner, walker, patient] = team
  const assassin = (flipped ? battle.team : battle.sparring!.rivals)[0]
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(summoner, at(600, 990))
  Object.assign(assassin, at(550, 425), { attack: 176 })
  Object.assign(patient, at(718, 835), { hp: 194, actionAt: Infinity })
  Object.assign(walker, at(788, 740), { hp: 174, actionAt: Infinity })
  if (protectedWalk) Object.assign(walker, { shield: 330, shieldUntil: 14 })
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(600, 740)), null)
  const [gate] = battle.runtime.summons
  const entry = gate.deployment.bodies.find(body => edgeDistance(body, at(705, 740)) < 1)!
  assert(entry)
  advance(battle, 5.52)
  assert.equal(issueEdgeOrder(battle, assassin, "skill", null, at(713, 767)), null)
  assert.equal(moveEdgeFighter(battle, walker, entry), null)
  side.sharedAt = battle.time
  const rescue = rescueFromAnnouncedStrike(battle, team)
  assert.equal(rescue?.intent.target?.id, protectedWalk ? patient.id : undefined, `${flipped}/${protectedWalk}`)
  if (rescue) assert.equal(issueEdgeOrder(battle, rescue.actor, rescue.intent.order, patient, rescue.intent.at), null)
  advance(battle, 6.5)
  assert(walker.hp > 0)
  assert.equal(patient.hp > 0, protectedWalk)
  assert.equal(events.some(event => event.target === walker.id && event.style === "portal"), !protectedWalk)
}
observations.retainRescuePortal = "kept a committed portal escape unless the other traveler could take the hit on an existing shield"

{
  const { battle, actor: summoner, opponents: [ranger], events } = start(
    [["summoner", [4, 1]], ["warlock", [1, 4]]], [["ranger"]],
  )
  const exile = battle.team[1]
  place(summoner, 330, 720)
  place(exile, 259, 720, .23)
  place(ranger, 925, 560)
  exile.actionAt = Infinity
  battle.moveAt = Infinity
  forceTo(battle, exile, { x: 190, y: 720 }, .18, false, newCast(battle, ranger, "enemy", exile))
  assert.equal(chooseAiAttack(battle, summoner, battle.team, [ranger])?.order, "skill")
  advance(battle, .9)
  const rescue = events.find(event => event.cast.skill?.deployment === "returnBeast" &&
    event.kind === "pull" && event.target === exile.id)
  assert(rescue?.landing && rescue.landing.x > 208)
  assert(exile.shield > 0, "the beast must actually intercept the exile on its return")
  observations.returnBeast = "pulled an ally toward the field and shielded them"
}

{
  const { battle, events } = start([["ranger"], ["assassin"]])
  const { boss, team: [healthy, vulnerable] } = battle
  boss.lastOrder = "charge"
  place(boss, 600, 500)
  place(healthy, 550, 470)
  place(vulnerable, 670, 555, .06)
  advance(battle, .1)
  assert(!battle.telegraph)
  assert(!vulnerable.hp && healthy.hp === healthy.maxHp, "take the reachable finish over a hit on the closest healthy card")
  assert(events.some(event => event.cast.owner === "boss" && event.kind === "death" && event.target === vulnerable.id))
  observations.pveFinish = "took a reachable finishing basic"
}

{
  const { battle, events } = start([["ranger"], ["assassin"]])
  const { boss, team: [near, far] } = battle
  place(boss, 600, 500)
  place(near, 539, 535)
  place(far, 765, 685, .07)
  Object.assign(far, { shield: far.maxHp, shieldUntil: 1.4 })
  advance(battle, .1)
  assert(battle.telegraph, "the distant card's shield will expire before the charge lands")
  advance(battle, battle.telegraph.until + .1)
  assert.equal(far.hp, 0, "the boss should finish the distant vulnerable card")
  assert.equal(near.hp, near.maxHp)
  assert(events.some(event => event.cast.used.has("bossCharge") && event.kind === "death" && event.target === far.id))
  observations.pveChargeFinish = "charged a vulnerable card whose shield would expire before impact"
}

for (const protectedTarget of [false, true]) {
  const { battle, events } = start([["ranger"], ["assassin"], ["healer", [2, 3]]])
  const { boss, team: [near, exposed, medic] } = battle
  place(boss, 600, 500)
  place(near, 655, 500)
  place(exposed, 548, 544)
  place(medic, 800, 830)
  boss.actionAt = boss.moveAt = near.actionAt = exposed.actionAt = Infinity
  boss.lastOrder = "charge"
  if (protectedTarget) assert.equal(issueEdgeOrder(battle, medic, "skill", exposed, exposed), null)
  advance(battle, .88)
  near.hp = 39
  exposed.hp = 48
  boss.actionAt = 0
  battle.nextThinkAt = battle.time
  advance(battle, 1.02)
  const defeated = protectedTarget ? near : exposed
  const survivor = protectedTarget ? exposed : near
  assert(events.some(event => event.kind === "death" && event.cast.owner === boss.id && event.target === defeated.id))
  assert(survivor.hp > 0 && !battle.telegraph, "the active damage share changes which basic is a finish")
  observations.pveDamageShare = "finished the card that could actually be downed after damage sharing"
}

{
  const { battle } = start([["ranger"], ["assassin"]])
  const { boss, team: [near, far] } = battle
  place(boss, 600, 500)
  place(near, 539, 535)
  place(far, 765, 685, .07)
  Object.assign(far, { shield: far.maxHp, shieldUntil: 6 })
  advance(battle, .1)
  assert(!battle.telegraph && near.hp < near.maxHp, "the shield lasts through the charge, so take the nearby basic")
}

{
  const { battle, actor, opponents: [enemy], events } = start([["summoner", [0, 1]]], [["ranger"]], "E")
  place(actor, 600, 935)
  place(enemy, 600, 652, 1, { x: 800, y: 652 })
  battle.moveAt = 1.1
  const order = chooseAiAttack(battle, actor, battle.team, [enemy])
  assert.equal(order?.order, "skill", "aim the bow link across the known walk")
  advance(battle, 1)
  assert.equal(impact(events, "summoner/E/A1", "hit"), 1)
  observations.twinBows = "hit the moving target"
}

{
  const { battle, actor, opponents: [enemy], events } = start([["summoner", [1, 0]]], [["berserker"]], "L")
  place(actor, 600, 950)
  place(enemy, 600, 340)
  battle.moveAt = 1.4
  assert.equal(chooseAiAttack(battle, actor, battle.team, [enemy])?.order, undefined, "patrol cannot reach the far side")
  place(enemy, 690, 610, 1, { x: 450, y: 610 })
  assert.equal(chooseAiAttack(battle, actor, battle.team, [enemy])?.order, undefined, "a distant sideways push buys no time")
  place(enemy, FIELD.left + 35, 664, 1, { x: FIELD.left + 25, y: 713 })
  place(actor, FIELD.left + 65, 951)
  assert.equal(chooseAiAttack(battle, actor, battle.team, [enemy])?.order, "skill", "angle the patrol to eject an exposed enemy")
  advance(battle, 2.1)
  assert(events.some(event => event.cast.skill?.id === "summoner/L/A2" && event.kind === "exit" && event.target === enemy.id))
  observations.roadBeast = "saved the turn against a harmless distant walk, ejected an enemy exposed at the boundary"
}

{
  const { battle, actor, opponents: [shooter], events } = start([["dancer", [0, 1]], ["ranger"]], [["ranger", [2, 3]]], "E")
  const ally = battle.team[1]
  place(actor, 615, 900)
  place(ally, 615, 665, .24)
  place(shooter, 650, 400)
  battle.moveAt = .9
  ally.actionAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, shooter, "skill", null, { x: 662, y: 665 }), null)
  battle.sparring!.sharedAt = Infinity
  const order = chooseAiAttack(battle, actor, battle.team, [shooter])
  assert.equal(order?.order, "skill", "move the ally out of the visible blast")
  const hp = ally.hp
  advance(battle, .78)
  assert.equal(ally.hp, hp)
  assert.equal(impact(events, "dancer/E/A1", "shield"), 2)
  observations.pairedStep = "moved the ally out of the blast"
}

for (const folded of [false, true]) {
  const slot = folded ? 1 : 0
  const { battle, actor, opponents: [enemy], events } = start(
    [["dancer", [slot, 2]], ["berserker", [2, 4]]], [["bulwark"]],
  )
  const front = battle.team[1]
  place(actor, 606, 942)
  place(front, folded ? 555 : 606, folded ? 827 : 847)
  place(enemy, 606, folded ? 584 : 486)
  front.actionAt = .98
  battle.moveAt = 12
  assert.notEqual(chooseAiAttack(battle, actor, battle.team, [enemy])?.order, "skill", "do not place a rail after the movement window")
  battle.moveAt = 0
  assert.equal(chooseAiAttack(battle, actor, battle.team, [enemy])?.order, "skill")
  advance(battle, 2.2)
  const id = activeFor(actor, "skill").id
  const benefit = events.find(event => event.cast.skill?.id === id && event.target === front.id &&
    (folded ? event.kind === "shield" && (event.amount ?? 0) > 0 : event.kind === "assist" && event.style === "glide"))
  assert(benefit, "the ally must actually slide or trigger the hinge, using a real move order")
  const orders = battle.sparring!.actions.filter(action => action.side === "ally")
  assert(orders.some(action => action.actorId === front.id && action.name === "移动" && action.time >= COOLDOWN.shared))
  assert(orders.some(action => action.actorId === front.id && action.name !== "移动"))
  observations[folded ? "foldedRail" : "glideRail"] = "the ally used the rail and followed with an attack"
}

for (const shielded of [false, true]) {
  const { battle, actor: tank, opponents: [warden], events } = start(
    [["bulwark"], ["dancer"], ["assassin"], ["spellbreaker"]], [["warden"]],
  )
  const [, dancer, assassin, breaker] = battle.team
  place(tank, 683, 676)
  place(dancer, 467, 647, .42)
  place(assassin, 467, 647, .10)
  place(breaker, 395, 296)
  place(warden, 416, 788)
  for (const ally of battle.team) ally.actionAt = 2
  battle.sparring!.sharedAt = 0
  battle.sparring!.moveAt = 3
  warden.actionAt = .18
  if (shielded) Object.assign(assassin, { shield: 170, shieldUntil: 1.5 })
  advance(battle, 1.7)
  const firstMove = battle.sparring!.actions.find(action => action.side === "ally" && action.name === "移动")
  assert.equal(firstMove?.actorId, shielded ? dancer.id : assassin.id, "reserve movement only when it can prevent a lethal hit")
  assert.equal(assassin.hp, Math.round(assassin.maxHp * .10))
  assert(events.some(event => event.cast.skill?.id === "warden/Prismatic/A2" && event.kind === "hit" && event.target === tank.id))
  if (!shielded) assert(!events.some(event => event.kind === "hit" && event.target === assassin.id))
  observations.meleeDefensiveMove = "the wounded assassin dodged when unprotected and ceded the move when shielded"
}

for (const slot of [0, 1] as const) {
  const { battle, actor, opponents: [binder], events } = start([["assassin"]], [["binder"]])
  place(binder, 560, 635)
  place(actor, slot === 0 ? 630 : 720, 650, .12)
  actor.actionAt = 6
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, binder, slot === 0 ? "skill" : "skill2", null,
    slot === 0 ? { x: 470, y: 650 } : { x: 680, y: 754 }), null)
  battle.sparring!.sharedAt = Infinity
  const warning = battle.runtime.visuals.find(visual => visual.phase === "warning" && visual.owner === binder.id)
  assert(warning?.effect === "damage" && areaHits(warning.area, actor), "read the actual damaging area")
  advance(battle, warning.until + .12)
  assert.equal(actor.hp, Math.round(actor.maxHp * .12), "the wounded melee fighter should walk out before impact")
  assert(!events.some(event => event.kind === "hit" && event.target === actor.id))
  assert(battle.sparring!.actions.some(action => action.actorId === actor.id && action.name === "移动"))
  observations[slot === 0 ? "gravityDodge" : "binaryWellDodge"] = "escaped a damaging binder warning before it landed"
}

for (const mirrored of [false, true]) for (const protectedByWard of [false, true]) {
  const { battle, actor: medic, opponents: [warden], events } = start(
    [["healer"], ["bard"], ["bulwark"], ["summoner"]], [["warden", [1, 0]]], "Radiant",
  )
  const [,, tank] = battle.team
  const at = (x: number, y: number) => mirrored ? mirror({ x, y }) : { x, y }
  for (const [i, [x, y, health]] of [[275, 638, .21], [274, 500, .72], [289, 558, .72], [511, 856, 1]].entries()) {
    const ally = battle.team[i]
    Object.assign(ally, at(x, y), { hp: Math.round(ally.maxHp * health), actionAt: Infinity })
  }
  Object.assign(warden, at(640, 696))
  if (protectedByWard) battle.runtime.buffs.push({ id: "boundary-ward", kind: "exguard", cast: newCast(battle, tank, "skill"),
    target: medic.id, values: [18], style: "", until: 2 })
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, warden, "skill", null, at(360, 542)), null)
  battle.sparring!.sharedAt = battle.sparring!.moveAt = Infinity
  const warning = battle.runtime.visuals.find(visual => visual.owner === warden.id && visual.shove)
  assert(warning && warning.effect === "control")
  assert.equal(!!warningEjection(battle, warning, medic, medic), !protectedByWard)
  assert(!warningEjection(battle, warning, battle.team[3], battle.team[3]))
  advance(battle, .7)
  const dodge = battle.sparring!.actions.find(action => action.side === "ally" && action.name === "移动")
  assert(dodge && (protectedByWard ? dodge.actorId !== medic.id : dodge.actorId === medic.id))
  assert(!events.some(event => event.kind === "exit" && event.target === medic.id))
  assert(events.some(event => event.kind === "exit" && event.cast.owner === warden.id))
}
observations.rewindPush = "spent the shared move on the exposed healer and switched to an unprotected ally when a boundary ward was live"

for (const mirrored of [false, true]) {
  const { battle, actor: medic, opponents: [assassin], events } = start(
    [["healer"], ["bard"]], [["assassin", [2, 3]]], "Radiant",
  )
  const at = (x: number, y: number) => mirrored ? mirror({ x, y }) : { x, y }
  Object.assign(medic, at(264, 765), { hp: Math.round(medic.maxHp * .42), actionAt: Infinity })
  Object.assign(battle.team[1], at(248, 720), { actionAt: Infinity })
  Object.assign(assassin, at(605, 735))
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, assassin, "skill", null, at(242, 735)), null)
  battle.sparring!.sharedAt = battle.sparring!.moveAt = Infinity
  advance(battle, .69)
  assert.equal(medic.hp, Math.round(medic.maxHp * .42))
  assert(events.some(event => event.kind === "exit" && event.cast.owner === assassin.id && event.target === battle.team[1].id))
  assert.equal(battle.sparring!.actions.find(action => action.side === "ally")?.actorId, medic.id)
}
observations.sidewaysDodge = "stepped sideways out of an outward push line before impact"

for (const mirrored of [false, true]) for (const movementReady of [false, true]) {
  const { battle, opponents: [warden], events } = start(
    [["healer"], ["bard"], ["bulwark"], ["summoner"]], [["warden", [0, 1]]], "Radiant",
  )
  const at = (x: number, y: number) => mirrored ? mirror({ x, y }) : { x, y }
  for (const [i, [x, y, health]] of [[289, 746, .55], [278, 842, .85], [332, 813, .7], [732, 854, 1]].entries()) {
    const ally = battle.team[i]
    Object.assign(ally, at(x, y), { hp: Math.round(ally.maxHp * health), actionAt: Infinity })
  }
  Object.assign(warden, at(600, 800), { actionAt: .55 })
  battle.sparring!.sharedAt = 0
  battle.sparring!.moveAt = Infinity
  if (!movementReady) battle.moveAt = Infinity
  advance(battle, 1.58)
  const cast = battle.sparring!.actions.find(action => action.name === "借力清场")
  const move = battle.sparring!.actions.find(action => action.side === "ally" && action.name === "移动")
  assert(cast && (movementReady ? move && move.time < cast.time : !move))
  const exits = events.filter(event => event.kind === "exit" && event.cast.skill?.id === "warden/Radiant/A1")
  assert.equal(exits.length, movementReady ? 2 : 3, "spread before the pull, then let the enemy choose a fresh aim")
}
observations.spreadBeforePull = "split a vulnerable cluster before a ready gather, retaining the crowd-control payoff on the other cards"

for (const movementReady of [false, true]) {
  const { battle, actor: warden, events } = start([["warden", [1, 0]]], undefined, "Radiant")
  const { boss } = battle
  place(boss, 275, 638)
  place(warden, 640, 696)
  boss.actionAt = 5
  if (!movementReady) boss.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, warden, "skill", null, { x: 360, y: 542 }), null)
  advance(battle, .79)
  assert.equal(events.some(event => event.kind === "exit" && event.target === boss.id), !movementReady)
  if (movementReady) assert(boss.moveAt > COOLDOWN.move && boss.sharedAt > COOLDOWN.shared && boss.actionAt === 5)
}
observations.pveEdgeWarning = "escaped the delayed push when movement was available and was ejected with movement on cooldown"

{
  const { battle, actor: dancer, opponents: [binder], events } = start(
    [["dancer", [0, 1]], ["assassin"], ["spellbreaker"]], [["binder"]],
  )
  const [, assassin, breaker] = battle.team
  place(dancer, 500, 620)
  place(assassin, 552, 613, .15)
  place(breaker, 395, 296)
  place(binder, 681, 899)
  assassin.actionAt = breaker.actionAt = 9
  battle.sparring!.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  binder.actionAt = 1.20
  battle.moveAt = .95
  assert.equal(issueEdgeOrder(battle, dancer, "skill2", null, { x: 790, y: 544 }), null)
  advance(battle, 2.2)
  assert.equal(battle.sparring!.actions.find(action => action.name === "移动")?.actorId, assassin.id)
  const ward = events.findIndex(event => event.kind === "shield" && event.target === assassin.id && event.cast.skill?.id === "dancer/Prismatic/A2")
  const hit = events.findIndex(event => event.kind === "hit" && event.target === assassin.id && event.cast.owner === binder.id)
  assert(ward >= 0 && hit > ward, "step through the hinge before the incoming hit")
  assert((events[hit].absorbed ?? 0) > 0 && assassin.hp > 0)
  observations.foldedRailRescue = "gave the threatened ally the move and applied the rail's shield before impact"
}

for (const flipped of [false, true]) for (const late of [false, true]) {
  const { battle, actor: dancer, opponents: [binder], events } = start(
    [["dancer", [0, 1]], ["warlock", [2, 3]]], [["binder", [0, 3]]],
  )
  const caster = battle.team[1]
  const placeAt = (unit: EdgeUnit, x: number, y: number, health = 1) => {
    const at = flipped ? mirror({ x, y }) : { x, y }
    place(unit, at.x, at.y, health)
  }
  placeAt(dancer, 731, 841, .086)
  placeAt(caster, 688, 1012, .80)
  placeAt(binder, 666, 437)
  caster.actionAt = 5
  const sparring = battle.sparring!
  sparring.moveAt = Infinity
  sparring.sharedAt = 0
  binder.actionAt = 1.55
  battle.moveAt = late ? 1.85 : .75
  advance(battle, 2.42)
  const ward = events.findIndex(event => event.kind === "shield" && event.target === dancer.id && event.cast.skill?.id === "dancer/Prismatic/A2")
  const hit = events.findIndex(event => event.kind === "hit" && event.target === dancer.id && event.cast.owner === binder.id)
  if (late) {
    assert(ward === -1 || hit < ward)
  } else {
    assert(ward >= 0 && hit > ward, `folded rail did not shield before the hit (flipped=${flipped})`)
    assert((events[hit].absorbed ?? 0) > 0 && dancer.hp > 0)
  }
}
observations.foldedRailSelfRescue = "laid a retreat rail and stepped into the ward before impact, including after reflecting positions; late movement could not supply it"

{
  const { battle, actor: dancer, opponents: [binder, breaker] } = start(
    [["dancer", [0, 1]], ["spellbreaker", [0, 1]]], [["binder", [0, 3]], ["spellbreaker", [0, 1]]],
  )
  const friend = battle.team[1]
  place(dancer, 368, 356)
  place(friend, 648, 296, .191)
  place(binder, 688, 822)
  place(breaker, 377, 698)
  friend.actionAt = 4.08
  breaker.actionAt = 1.75
  battle.sparring!.sharedAt = .68
  const step = activeFor(dancer, "skill2").steps[0]
  const [length, width] = step.selector.size
  const rail = dancerRail(dancer, { x: 654, y: 349 }, length, width, true)
  const route = () => danceRailMove(battle, friend, [binder, breaker], { danceRail: rail, step, until: 9.46 }, .933)
  binder.actionAt = 1.31
  const press = route()
  binder.actionAt = 5
  const cooling = route()
  assert(press?.ward && cooling?.ward)
  assert(cooling.value > press.value + .7, "lower the ward route's value when a pull can set up the line on two cards")
  observations.foldedRailFollowUp = "discounted the same ward route while the opposing pull and follow-up line were both available"
}

for (const refreshFirst of [false, true]) {
  const { battle, actor: warden, opponents: [paladin], events } = start(
    [["warden", [0, 3]], ["spellbreaker", [0, 1]]], [["paladin", [1, 2]]],
  )
  const breaker = battle.team[1]
  place(paladin, 600, 650)
  place(warden, 690, 675)
  place(breaker, 680, 650)
  battle.moveAt = battle.sharedAt = battle.sparring!.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, paladin, "skill", null, { x: 600, y: 330 }), null)
  advance(battle, .65)
  assert(paladin.shield > 0)
  battle.sharedAt = 0
  warden.actionAt = battle.time + (refreshFirst ? 3.1 : .98)
  paladin.actionAt = battle.time + (refreshFirst ? .2 : 2.17)
  advance(battle, refreshFirst ? 1.65 : 2.35)
  const hits = events.filter(event => event.kind === "hit" && event.target === paladin.id)
  if (refreshFirst) {
    assert.equal(hits.length, 0, "hold damage when the next shield will erase the opening hit")
    assert.equal(events.filter(event => event.kind === "shield" && event.target === paladin.id).length, 2)
  } else {
    assert.deepEqual(hits.map(event => event.cast.skill?.id), ["spellbreaker/Prismatic/A2", "warden/Prismatic/A4"])
    assert((hits[0].absorbed ?? 0) > 0 && (hits[1].amount ?? 0) > 0, "two hits on the same shield must reach health")
    observations.shieldFocus = "spellbreaker opened the shield and warden hit before the refresh"
  }
}

for (const mirrored of [false, true]) for (const condition of ["follow-up", "out of reach", "new shield"] as const) {
  const { battle, actor: assassin, opponents: [tank, caster], events } = start(
    [["assassin", [4, 3]], ["spellbreaker", [1, 0]]], [["bulwark", [1, 4]], ["lifebringer", [0, 3]]], "Radiant",
  )
  const breaker = battle.team[1]
  for (const [unit, at] of [[assassin, { x: 600, y: 750 }], [tank, { x: 600, y: 650 }], [caster, { x: 815, y: 650 }],
    [breaker, condition === "out of reach" ? { x: 970, y: 1085 } : { x: 500, y: 775 }]] as const) {
    Object.assign(unit, mirrored ? mirror(at) : at)
  }
  tank.hp = 50
  battle.sharedAt = battle.moveAt = caster.actionAt = battle.sparring!.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, tank, "skill", tank, tank), null)
  advance(battle, .97)
  assert(tank.shield > 130)
  tank.shield = 130
  if (condition === "new shield") {
    caster.actionAt = 0
    assert.equal(issueEdgeOrder(battle, caster, "skill2", tank, tank), null)
  }
  battle.sparring!.sharedAt = Infinity
  breaker.actionAt = battle.time + COOLDOWN.shared
  battle.sharedAt = 0
  battle.nextThinkAt = battle.time
  advance(battle, 2.65)
  const first = events.find(event => event.kind === "hit" && event.cast.skill?.id === "assassin/Radiant/A5")
  assert(first, "the assassin must actually land the chosen skill")
  if (condition === "follow-up") {
    assert.equal(first.target, tank.id)
    assert.equal(first.absorbed, 130)
    assert(events.some(event => event.kind === "death" && event.cast.owner === breaker.id && event.target === tank.id))
  } else {
    assert.equal(first.target, caster.id)
    assert((first.amount ?? 0) > 0 && tank.hp > 0)
    if (condition === "new shield") assert(events.some(event => event.kind === "shield" && event.cast.owner === caster.id && event.target === tank.id))
  }
}
observations.teamShieldChoice = "finished after two hits, redirected when the second hit was out of reach or another ward was already casting"

for (const hp of [.52, .90]) {
  const { battle, actor, opponents: [dancer], events } = start([["healer"]], [["dancer", [2, 4]]], "L")
  place(actor, 600, 650, hp)
  place(dancer, 600, 800)
  advance(battle, .9)
  const triage = events.find(event => event.kind === "heal" && event.cast.skill?.id === "healer/L/A1")
  if (hp < .6) assert(triage && (triage.amount ?? 0) > actor.maxHp * .26, "take the real 28% triage dose against a basic-only enemy")
  else assert(!triage && dancer.hp < dancer.maxHp, "use the opening to attack when only a small amount of health is missing")
}
{
  const { battle, actor, opponents: [binder], events } = start([["healer"]], [["binder", [3, 4]]], "L")
  place(actor, 600, 650, .19)
  place(binder, 600, 910)
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, binder, "skill", null, actor), null)
  battle.sparring!.sharedAt = battle.moveAt = Infinity
  advance(battle, 1)
  const firstAid = events.findIndex(event => event.kind === "heal" && event.cast.skill?.id === "healer/L/A2")
  const guard = events.findIndex(event => event.kind === "protect" && event.cast.skill?.id === "healer/L/A2" && (event.amount ?? 0) > 0)
  assert(firstAid >= 0 && guard > firstAid && actor.hp > 0, "land both the heal and the ward before the telegraphed spell")
  observations.triageAndStopLoss = "chose a larger dose, a basic, or an on-time guard according to actual contact"
}

for (const flipped of [false, true]) {
  const { battle, actor, opponents: [healer], events } = start([["dancer", [2, 4]]], [["healer"]], "L")
  const own = { x: 250, y: 750 }
  const enemy = { x: 236, y: 590 }
  Object.assign(actor, flipped ? mirror(own) : own, { actionAt: 2 })
  Object.assign(healer, flipped ? mirror(enemy) : enemy)
  assert(!isOutside(previewBasicShove(battle, actor, healer).end), "the first angle only pushes along the boundary")
  advance(battle, 2.7)
  const orders = battle.sparring!.actions.filter(order => order.actorId === actor.id)
  assert.deepEqual(orders.map(order => order.name), ["移动", "普攻"])
  assert(orders[1].time >= 2 && orders[1].time - orders[0].time >= COOLDOWN.shared)
  assert(events.some(event => event.kind === "exit" && event.cast.owner === actor.id && event.target === healer.id))
}
{
  const { battle, actor, opponents: [dancer], events } = start([["healer"]], [["dancer", [2, 4]]], "L")
  place(actor, 237, 750, .48)
  place(dancer, 350, 750)
  actor.actionAt = 2
  dancer.actionAt = 1.2
  battle.sparring!.sharedAt = 0
  battle.sparring!.moveAt = Infinity
  assert(isOutside(previewBasicShove(battle, dancer, actor).end))
  advance(battle, 2.2)
  assert(events.some(event => event.kind === "hit" && event.target === actor.id && event.cast.owner === dancer.id))
  assert(!events.some(event => event.kind === "exit" && event.target === actor.id), "step inside before the shot can push the healer out")
  assert(battle.sparring!.actions.some(order => order.actorId === actor.id && order.name === "移动"))
  observations.duelEdge = "angled the next basic across the line and escaped the same threat on defense"
}

for (const ready of [0, 7]) {
  const { battle, actor, events } = start([["summoner", [3, 2]]], undefined, "C")
  const { boss } = battle
  place(boss, 600, 500)
  place(actor, 640, 739)
  boss.actionAt = ready
  boss.lastOrder = "charge"
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, { x: 640, y: 608 }), null)
  advance(battle, .12)
  if (ready) {
    assert(boss.move && Math.abs(boss.move.x - 600) > 80, "move around the wall while the attack cools down")
    const moveAt = boss.moveAt
    advance(battle, 1)
    assert.equal(boss.moveAt, moveAt)
    advance(battle, 7.3)
    assert(events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === actor.id),
      "after the detour, hit the player card before the wall")
    assert(!events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.target !== actor.id))
  } else {
    assert(battle.telegraph, "use a legal charge when it can reach the card behind the wall")
    advance(battle, battle.telegraph.until + .12)
    const hits = events.filter(event => event.kind === "hit" && event.cast.used.has("bossCharge"))
    assert(hits.some(event => event.target === actor.id) && hits.some(event => String(event.target).startsWith("summon-")))
  }
  observations.pveBarricade = "charged through a wall or walked around it while cooling down"
}

for (const shieldLasts of [true, false]) {
  const battle = createEdgeBattle(cards([["spellbreaker", [2, 4]]], "L"),
    cards([["paladin", [2, 4]], ["bard", [2, 4]]], "E"))
  const [breaker] = battle.team
  const [paladin, bard] = battle.sparring!.rivals
  place(breaker, 375, 284, .55)
  place(paladin, 471, 284, .115)
  place(bard, 536, 300, .50)
  breaker.shield = Math.round(breaker.maxHp * .12)
  breaker.shieldUntil = 8
  battle.phase = "running"
  battle.sharedAt = battle.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, paladin, "skill", null, paladin), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, .36)
  assert(paladin.shield > breaker.attack, "cast the real gate ward before taking the decision")
  if (!shieldLasts) paladin.shieldUntil = .62
  battle.sharedAt = 0
  const hits: SkillEvent[] = []
  battle.onSkillEvent = event => { if (event.kind === "hit" && event.cast.owner === breaker.id) hits.push(event) }
  advance(battle, 1.1)
  assert.equal(hits.length, 1)
  if (shieldLasts) {
    assert.equal(hits[0].cast.order, "basic", "chip the strong ward without giving up position")
    assert(hits[0].absorbed && breaker.x === 375 && paladin.hp > 0)
  } else {
    assert.equal(hits[0].cast.skill?.id, "spellbreaker/L/A5", "strike while the ward is expiring")
    assert.equal(paladin.hp, 0)
  }
  observations.retreatStrike = "kept position against a strong ward and finished when it expired before impact"
}

for (const near of [true, false]) {
  const { battle, actor: breaker, opponents: [binder], events } = start(
    [["spellbreaker", [2, 4]], ["ranger", [1, 3]]], [["binder", [2, 3]]], "L",
  )
  const ranger = battle.team[1]
  place(breaker, 530, 825)
  place(ranger, 600, 730)
  ranger.hp = 110
  ranger.actionAt = battle.moveAt = Infinity
  const casterY = near ? 610 : 459
  place(binder, 600, casterY)
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, binder, "skill", null, ranger), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, .85)
  const ward = events.find(event => event.kind === "protect" && event.cast.skill?.id === "spellbreaker/L/A3" && event.target === ranger.id)
  assert(ward && (ward.amount ?? 0) > 0 && ranger.hp > 0, "put the spell ward on the ally before the known lethal hit")
  assert(near ? binder.y < casterY - 60 : binder.y === casterY, "only counter-push a source in range")
  observations.deflector = "kept the ally alive and pushed the caster back within the skill's reach"
}

for (const guard of ["live", "expires"] as const) {
  const { battle, events } = start([["ranger", [1, 3]], ["warden", [2, 3]]])
  const [ranger, warden] = battle.team
  place(battle.boss, 600, 968)
  place(ranger, 600, 1065)
  place(warden, 690, 720)
  battle.boss.actionAt = .95
  battle.boss.moveAt = 7
  assert.equal(issueEdgeOrder(battle, warden, "skill", ranger), null)
  const ward = battle.runtime.buffs.find(buff => buff.kind === "exguard" && buff.target === ranger.id)
  assert(ward)
  if (guard === "expires") ward.until = 2
  advance(battle, 4.5)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === "boss" && event.target === ranger.id)
  assert(hit, "the boss should take a real attack in both cases")
  assert.equal(hit.cast.used.has("bossCharge"), guard === "expires")
  assert.equal(events.some(event => event.kind === "exit" && event.target === ranger.id), guard === "expires")
  observations.pveExileGuard = "used a basic into a live boundary ward and charged when it would expire before impact"
}

for (const top of [false, true]) {
  const battle = createEdgeBattle(cards([["bard", [0, 1]], ["ranger", [1, 3]]], "Prismatic"),
    cards([["summoner", [1, 0]]], "Radiant"))
  const [bard, ranger] = battle.team
  const [summoner] = battle.sparring!.rivals
  const point = top ? { x: 470, y: 283 } : { x: 254, y: 690 }
  place(bard, top ? 470 : 238, top ? 295 : 690)
  place(summoner, top ? 450 : 525, top ? 530 : 690)
  place(ranger, 925, 900)
  ranger.actionAt = bard.actionAt = Infinity
  battle.phase = "running"
  battle.sharedAt = battle.moveAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, point), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, 1.08)
  const returned = events.find(event => event.kind === "startMove" && event.target === bard.id && event.style === "return")
  assert(returned?.landing && (top ? Math.abs(returned.landing.x - 470) : Math.abs(returned.landing.y - 690)) > 130)
  assert.equal(battle.moveAt, Infinity)
  assert.equal(battle.sharedAt, Infinity)
  battle.sharedAt = battle.moveAt = 0
  advance(battle, 5.3)
  assert(!isOutside(bard) && edgeDistance(bard, point) > 137, "get back in and clear the next push")
  assert.equal(events.filter(event => event.kind === "exit" && event.target === bard.id && event.cast.skill?.deployment === "shoreBeast").length, 1)
  observations.shoreReturn = "took the diagonal re-entry and left the beast's radius before its second push"
}

{
  const battle = createEdgeBattle(cards([["summoner", [1, 0]], ["warlock", [1, 4]]], "Prismatic"),
    cards([["summoner", [1, 0]]], "Radiant"))
  const [summoner, traveler] = battle.team
  const [enemy] = battle.sparring!.rivals
  place(summoner, 405, 900)
  place(traveler, 650, 650)
  place(enemy, 330, 810)
  battle.phase = "running"
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 405, y: 650 }), null)
  const route = () => bestPortalAdvance(battle, traveler, [enemy])
  const open = route()
  assert(open, "the gate gives the traveler a shot on the enemy")
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, open.stop), null)
  assert.equal(route(), undefined, "a live shore beast covers the other end before the traveler can move again")
  battle.runtime.summons.find(group => group.deployment.kind === "shoreBeast")!.deployment.bodies[0].hp = 0
  assert(route(), "a broken beast no longer blocks the same portal route")
  observations.shorePortal = "checked the beast at the portal exit and took the route once the beast was gone"
}

for (const mode of ["finish", "combine", "safe", "expiring"] as const) {
  const battle = createEdgeBattle(cards([["bard"], ["ranger", [1, 3]], ["healer"]], "Prismatic"),
    cards([["summoner", [1, 0]]], "Radiant"))
  const [bard, ranger, healer] = battle.team
  const [summoner] = battle.sparring!.rivals
  place(bard, mode === "safe" ? 470 : 238, 690)
  place(ranger, 367, 822)
  place(healer, 408, 701)
  place(summoner, 525, 690)
  ranger.actionAt = healer.actionAt = bard.actionAt = Infinity
  battle.phase = "running"
  battle.sharedAt = battle.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 254, y: 690 }), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, 1.15)
  const [deployment] = battle.runtime.summons
  const [beast] = deployment.deployment.bodies
  if (mode !== "safe") Object.assign(bard, { x: 272, y: 690, move: null, force: null })
  Object.assign(summoner, { x: 445, y: 725, move: null, force: null })
  beast.hp = mode === "combine" ? ranger.attack + 55 : 80
  if (mode === "expiring") deployment.until = battle.time + .48
  const pushesAgain = beast.actionsAt[0]
  const hits: SkillEvent[] = []
  let hitSummoner = false
  battle.onSkillEvent = event => {
    if (event.kind !== "hit") return
    if (event.target === beast.id) hits.push(event)
    if (event.target === summoner.id) hitSummoner = true
  }
  battle.sharedAt = ranger.actionAt = 0
  if (mode === "combine") healer.actionAt = battle.time + .8
  advance(battle, mode === "finish" || mode === "combine" ? pushesAgain - .03 : battle.time + 2)
  if (mode === "finish" || mode === "combine") {
    assert.equal(beast.hp, 0, "kill the beast before it can push the teammate again")
    assert.equal(hits.length, mode === "finish" ? 1 : 2)
  } else assert(!hits.length && hitSummoner, "attack the enemy card when the beast is irrelevant")
  observations.shorePriority = "finished the threat with one or two basics and ignored a harmless or expiring beast"
}

for (const kill of [false, true]) {
  const { battle, actor: summoner, events } = start([["summoner", [1, 0]]], undefined, "Radiant")
  const boss = battle.boss
  place(summoner, 505, 690)
  place(boss, 238, 690)
  boss.actionAt = boss.moveAt = boss.sharedAt = Infinity
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 254, y: 690 }), null)
  advance(battle, .9)
  const [beast] = battle.runtime.summons[0].deployment.bodies
  if (kill) {
    Object.assign(boss, { x: 343, y: 690, move: null, force: null, actionAt: 0, sharedAt: 0 })
    beast.hp = 30
    advance(battle, 1.6)
    assert(beast.hp === 0 && events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === beast.id))
  } else {
    advance(battle, 8)
    assert(!isOutside(boss) && edgeDistance(boss, beast) > 137)
    assert.equal(events.filter(event => event.kind === "exit" && event.target === boss.id).length, 1)
    assert.equal(boss.moveAt, Infinity)
  }
  observations.pveShoreBeast = "returned by a safer route and broke a vulnerable shore beast in melee"
}

for (const mode of ["rescue", "covered", "shielded", "cooling"] as const) {
  const { battle, actor: tank, opponents: [enemy], events } = start([
    ["bulwark", [0, 1]], ["healer"],
  ], [["ranger", [1, 3]]])
  const [, medic] = battle.team
  place(tank, mode === "covered" ? 438 : 380, 720)
  place(medic, 610, 740, .14)
  place(enemy, 610, 410)
  tank.actionAt = medic.actionAt = Infinity
  medic.speed = 75
  if (mode === "cooling") tank.passiveAt[BULWARK_COVER.id] = 1.8
  if (mode === "shielded") Object.assign(medic, { shield: 250, shieldUntil: 2 })
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, medic), null)
  battle.sparring!.sharedAt = Infinity
  const route = bulwarkEscort(battle, tank, battle.team, [enemy])?.route
  if (mode === "rescue") assert.equal(route?.rescue, medic)
  else assert.equal(route, undefined, mode)
  if (mode === "rescue") {
    advance(battle, .12)
    assert(tank.move && battle.sharedAt >= COOLDOWN.shared,
      "step into cover through the normal shared cooldown: " + JSON.stringify(battle.sparring!.actions))
    advance(battle, .64)
    assert(medic.hp > 0 && events.some(event => event.kind === "protect" && event.style === BULWARK_COVER.id && event.target === medic.id))
  }
  observations.bulwarkEscort = "arrived before a lethal hit and skipped repositioning when covered, shielded, or cooling down"
}

{
  const { battle, actor: tank, opponents: [enemy], events } = start([
    ["bulwark", [0, 2]], ["healer"],
  ], [["ranger", [3, 0]]], "Radiant")
  const [, medic] = battle.team
  place(tank, 450, 720)
  place(medic, 610, 740, .42)
  place(enemy, 610, 430)
  assert.equal(issueEdgeOrder(battle, tank, "skill", tank), null)
  tank.passiveAt[BULWARK_COVER.id] = 8
  tank.actionAt = medic.actionAt = Infinity
  battle.sharedAt = Infinity
  advance(battle, 1)
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, medic), null)
  battle.sharedAt = 0
  battle.sparring!.sharedAt = Infinity
  battle.nextThinkAt = battle.time
  advance(battle, 1.52)
  assert(events.some(event => event.kind === "protect" && event.cast.skill?.id === "bulwark/Radiant/A1" && event.target === medic.id),
    "move the active march into range while the innate cover is still cooling")
  observations.bulwarkMarch = "moved the live march to a threatened ally during passive cooldown"
}

for (const protectedAlready of [false, true]) {
  const { battle, actor: tank, opponents: [enemy], events } = start([
    ["bulwark", [0, 1]], ["healer"], ["warden"],
  ], [["ranger", [1, 3]]])
  const [, medic, warden] = battle.team
  place(tank, 576, 810)
  place(medic, 863, 683, .12, { x: 947, y: 683 })
  place(warden, 400, 886, .35)
  place(enemy, 865, 410)
  medic.actionAt = warden.actionAt = Infinity
  battle.moveAt = Infinity
  if (protectedAlready) Object.assign(medic, { shield: 300, shieldUntil: 2 })
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, { x: 940, y: 683 }), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, .8)
  assert(medic.hp > 0)
  const blocked = events.find(event => event.kind === "protect" && event.cast.skill?.id === "bulwark/Prismatic/A1" && event.target === medic.id)
  if (!protectedAlready) assert(blocked && (blocked.amount ?? 0) > 150, "catch the first announced lethal hit at the ally's future position")
  else assert(!battle.sparring!.actions.some(order => order.actorId === tank.id && order.name === tank.actives[0].name),
    "keep the city when the ally can take the hit behind a personal shield")
  observations.citadelImpact = "placed the city for the announced impact when the ally needed it"
}

for (const flipped of [false, true]) for (const shielded of [false, true]) {
  const offense = cards([["spellbreaker", [0, 1]], ["ranger", [1, 0]]], "Prismatic")
  const defense = cards([["bulwark", [1, 0]], ["ranger", [1, 0]], ["warlock", [2, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(offense, defense) : createEdgeBattle(defense, offense)
  const [breaker, ranger] = flipped ? battle.team : battle.sparring!.rivals
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const [tank, first, second] = allies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(tank, at(612, 985))
  Object.assign(first, at(405, 665), { hp: 140, actionAt: Infinity })
  Object.assign(second, at(807, 665), { hp: 90, actionAt: Infinity })
  Object.assign(breaker, at(920, 320))
  Object.assign(ranger, at(402, 330))
  if (shielded) for (const unit of [first, second]) Object.assign(unit, { shield: 300, shieldUntil: 3 })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, ranger, "skill2", null, first), null)
  advance(battle, COOLDOWN.shared + SPARRING_STEP / 2)
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, second), null)
  advance(battle, battle.time + SPARRING_STEP / 2)
  battle.nextThinkAt = battle.time
  advance(battle, 1.94)
  const wards = events.filter(event => event.kind === "shield" && event.cast.skill?.id === "bulwark/Prismatic/A2")
  assert.deepEqual(wards.map(event => event.target), shielded ? [] : [first.id, second.id], `${flipped}/${shielded}`)
  assert(first.hp > 0 && second.hp > 0)
  if (!shielded) {
    const field = wards[0].area
    assert(field && field.parts.every(part => part.kind === "circle") && wards.every(event => event.cast === wards[0].cast))
    for (const unit of [first, second]) assert.equal(areaHits(field, at(unit === first ? 405 : 807, 665)), 1)
  }
}
observations.bastionSplit = "used one bastion for each threatened ally and let intact larger shields absorb the same attacks"

for (const flipped of [false, true]) for (const erased of [false, true]) {
  const offense = cards([["spellbreaker", [0, 1]]], "Prismatic")
  const defense = cards([["bulwark", [1, 0]], ["ranger", [1, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(offense, defense) : createEdgeBattle(defense, offense)
  const [breaker] = flipped ? battle.team : battle.sparring!.rivals
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const [tank, patient] = allies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(tank, at(612, 985))
  Object.assign(patient, at(300, 665), { hp: 500, move: at(474, 665) })
  Object.assign(breaker, at(920, 320))
  if (erased) {
    patient.move = null
    assert.equal(issueEdgeOrder(battle, breaker, "skill", null, at(606, 505)), null)
    advance(battle, .73)
    patient.move = at(474, 665)
  }
  const aim = at(606, 665)
  const skill = tank.actives[0]
  assert(!areaHits(previewSkillAreas(battle, tank, skill, aim)[0], patient))
  const arrival = entryWards(battle, tank, skill, allies).wards(aim).get(patient)
  assert.equal(!!arrival, !erased)
  if (arrival) assert(arrival.at > battle.time)
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, tank, "skill", null, aim), null)
  assert.equal(patient.shield, 0)
  advance(battle, 1.5)
  assert.equal(events.filter(event => event.kind === "shield" && event.target === patient.id && event.cast.skill === skill).length, erased ? 0 : 1)
  assert.equal(events.some(event => event.kind === "remove" && event.style === "zone"), erased)
}
observations.bastionEntry = "counted first entry on the current route only while the field would still be present"

for (const flipped of [false, true]) for (const mode of ["two-angles", "covered", "late"] as const) {
  const defenders = [makeCard(pick("bulwark", [1, 4], [6, 7]), "Prismatic", 0),
    makeCard(pick("warden", [0, 3]), "Prismatic", 1), makeCard(pick("warlock", [2, 4]), "Prismatic", 2),
    makeCard(pick("lifebringer", [0, 4]), "Prismatic", 3)]
  const attackers = cards([["paladin", [1, 2]], ["spellbreaker", [0, 1]], ["warlock", [2, 4]], ["dancer", [0, 1]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [tank, guard, patient, medic] = allies
  const [paladin, breaker, mage, dancer] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(tank, at(360.27, 1005.19))
  Object.assign(guard, at(528, 972), { shield: 234, shieldUntil: 4, actionAt: 4 })
  Object.assign(patient, at(688, 1012), { hp: 9, actionAt: 4 })
  Object.assign(medic, at(932.77, 1032.44), { hp: 663, shield: 49, shieldUntil: 4, actionAt: 4 })
  Object.assign(paladin, at(598.99, 654.09), { actionAt: mode === "late" ? 3.55 : 1.033, shield: 235, shieldUntil: 5 })
  Object.assign(breaker, at(688, 356), { actionAt: .1 })
  Object.assign(mage, at(429.88, 348.5), { hp: 409, actionAt: 3.4 })
  Object.assign(dancer, at(492.65, 759.76), { hp: 591, shield: 9, shieldUntil: 4, actionAt: 3.33 })
  if (mode === "covered") Object.assign(patient, { shield: 450, shieldUntil: 4 })
  forceTo(battle, paladin, at(419.54, 855.24), .317)
  const defending = flipped ? battle.sparring! : battle
  const attacking = flipped ? battle : battle.sparring!
  defending.moveAt = .73
  attacking.sharedAt = .66
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  const intent = chooseAiAttack(battle, tank, allies, enemies)
  assert.equal(intent?.order, mode === "two-angles" ? "skill" : "skill2", mode)
  assert.equal(issueEdgeOrder(battle, tank, intent.order, null, intent.at), null)
  advance(battle, .70)
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, at(808, 1010)), null)
  advance(battle, .95)
  if (mode === "two-angles") assert.equal(moveEdgeFighter(battle, patient, at(595, 1090)), null)
  advance(battle, 1.633)
  if (mode !== "late") assert.equal(issueEdgeOrder(battle, paladin, "skill", null, at(688, 1012)), null)
  advance(battle, 2.32)
  assert.equal(patient.hp, mode === "late" ? 0 : 9, mode)
  assert.equal(events.some(event => event.kind === "shield" && event.target === patient.id && event.cast.skill?.id === "bulwark/Prismatic/A2"),
    mode === "two-angles", mode)
}
observations.bastionBeforeReentry = "put shields on a critical ally before an enemy lands and can shoot, with movement, existing ward and late-attacker controls"

for (const flipped of [false, true]) {
  const { battle, actor: summoner, opponents: [enemy], events } = start([
    ["summoner", [2, 3]], ["healer"],
  ], [["berserker"]], "Radiant")
  const [, medic] = battle.team
  const position = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(summoner, position(414, 420))
  Object.assign(medic, position(415, 700), { actionAt: Infinity })
  Object.assign(enemy, position(260, 700), { actionAt: 1.48 })
  battle.sparring!.sharedAt = 0
  const ready = chooseAiAttack(battle, summoner, battle.team, [enemy])
  assert.equal(ready?.order, "skill", "place the three bodies when a real push and attack window exist")
  Object.assign(enemy, position(850, 610), { actionAt: 8 })
  medic.hp = Math.round(medic.maxHp * .31)
  const noWindow = chooseAiAttack(battle, summoner, battle.team, [enemy])
  assert.equal(noWindow?.order, "skill2", "switch to the wounded ally when the paper has no useful pulse")
  Object.assign(enemy, position(260, 700), { actionAt: 1.48 })
  medic.hp = medic.maxHp
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, ready!.at), null)
  battle.sharedAt = battle.sparring!.sharedAt = Infinity
  advance(battle, 2.4)
  const pushed = events.find(event => event.kind === "push" && event.cast.skill?.deployment === "paperBeat" && event.target === enemy.id)
  assert(pushed && (pushed.distance ?? 0) > 40 && events.some(event => event.kind === "exit" && event.target === enemy.id &&
    event.cast.skill?.deployment === "paperBeat"), "land the predicted paper push through the boundary")
  observations.paperPlacement = "placed the push doll on either edge, then picked the medic summon after the window changed"
}

for (const stillNeeded of [true, false]) {
  const { battle, actor: summoner, opponents: [enemy], events } = start([
    ["summoner", [3, 2]], ["healer"], ["warden"],
  ], [["berserker"]], "Radiant")
  const [, medic, warden] = battle.team
  place(summoner, 592, 720)
  place(medic, 431, 700, .19)
  place(warden, 670, 720, .49)
  place(enemy, 610, 385)
  medic.actionAt = warden.actionAt = Infinity
  assert.equal(issueEdgeOrder(battle, summoner, "skill", medic), null)
  advance(battle, .18)
  warden.hp = Math.round(warden.maxHp * .32)
  summoner.actionAt = 0
  if (!stillNeeded) medic.hp = medic.maxHp
  const intent = chooseAiAttack(battle, summoner, battle.team, [enemy])
  if (stillNeeded) {
    assert.notEqual(intent?.order, "skill", "keep a live rescue that is still due to land on the injured ally")
  } else {
    assert.equal(intent?.target, warden, "switch the summon when the previous target has recovered")
    assert.equal(intent?.order, "skill")
    battle.sharedAt = 0
    assert.equal(issueEdgeOrder(battle, summoner, "skill", warden), null)
  }
  battle.sharedAt = Infinity
  advance(battle, 1.1)
  assert(events.some(event => event.kind === "heal" && event.cast.skill?.deployment === "rescue" &&
    event.target === (stillNeeded ? medic.id : warden.id) && (event.amount ?? 0) > 0))
  observations.rescueRetarget = "kept the rescue already on its way and moved it to a new patient after recovery"
}

for (const dangerous of [false, true]) {
  const { battle, actor: tank, opponents: [summoner], events } = start([
    ["bulwark", [1, 4]],
  ], [["summoner", [2, 3]]], "Radiant")
  place(tank, dangerous ? 258 : 506, 690)
  place(summoner, dangerous ? 490 : 753, 690)
  Object.assign(tank, { shield: 260, shieldUntil: 6 })
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 595, y: 740 }), null)
  battle.sparring!.sharedAt = Infinity
  const [lantern, bell, doll] = battle.runtime.summons[0].deployment.bodies
  place(lantern, 870, 876)
  place(bell, 870, 886)
  place(doll, dangerous ? 338 : 595, 690)
  doll.hp = 36
  doll.actionsAt[2] = dangerous ? 1.2 : 5
  advance(battle, dangerous ? .3 : 2.4)
  const hit = events.find(event => event.kind === "hit" && event.cast.order === "basic" && event.cast.owner === tank.id)
  if (dangerous) assert(hit?.target === doll.id && doll.hp === 0, "break the doll that is about to push the tank outside")
  else assert(hit?.target === summoner.id && doll.hp > 0, "use the real opening instead of clearing an idle doll: " + JSON.stringify({
    orders: battle.sparring!.actions, target: hit?.target, hp: doll.hp, tank: [tank.x, tank.y], summoner: [summoner.x, summoner.y],
  }))
  observations.paperTarget = "broke the threatening doll and walked past the same summon when it had no useful push"
}

{
  const { battle, actor: summoner, events } = start([["summoner", [2, 3]]], undefined, "Radiant")
  const boss = battle.boss
  place(boss, 610, 610)
  place(summoner, 610, 835)
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 615, y: 680 }), null)
  const [lantern, bell, doll] = battle.runtime.summons[0].deployment.bodies
  place(lantern, 645, 649)
  place(bell, 440, 840)
  place(doll, 445, 840)
  boss.lastOrder = "charge"
  advance(battle, 2.8)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === boss.id)
  assert(hit?.target === summoner.id && boss.lastOrder === "basic" && boss.moveAt >= COOLDOWN.move && lantern.hp > 0,
    "the PvE boss should walk past the idle lamp and attack the caster")
  observations.pvePaper = "used the movement window to reach a player instead of attacking an idle lamp"
}

for (const situation of ["rally", "triage", "warded", "cooldown", "different-angle", "late-bard"] as const) {
  const { battle, actor: medic, events, opponents: [ranger] } = start([
    situation === "late-bard" ? ["bard", [1, 4]] : ["healer", [0, 1]], ["summoner"], ["warden"],
  ], [["ranger", situation === "triage" ? [2, 0] : [3, 0]]])
  const [, patient, teammate] = battle.team
  place(medic, 580, FIELD.top - 145)
  place(patient, 370, FIELD.top - 115, .17)
  place(teammate, 535, FIELD.top + 380)
  place(ranger, 777, FIELD.top + 235)
  if (situation === "triage") place(patient, 370, FIELD.top + 145, .17)
  if (situation === "warded") Object.assign(patient, { shield: 520, shieldUntil: 4 })
  if (situation === "cooldown") medic.actionAt = .90
  teammate.actionAt = patient.actionAt = Infinity
  battle.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  const at = situation === "different-angle" ? { x: 485, y: FIELD.top + 98 }
    : { x: patient.x, y: Math.max(FIELD.top + 1, patient.y) }
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, situation === "triage" ? 1.3 : .77)
  const cast = events.find(event => event.kind === "cast" && event.cast.owner === medic.id && event.cast.order === "skill" &&
    !!event.cast.skill && event.cast.used.has("manual"))
  if (situation === "rally") {
    assert.equal(cast?.cast.skill?.id, "healer/Prismatic/A1")
    assert(patient.hp > 0, "an exiled healer's on-time rally saves a returning ally")
    const landed = events.find(event => event.kind === "shield" && event.cast === cast.cast && event.target === patient.id)
    const resumed = events.filter(event => event.kind === "startMove" && event.target === medic.id && event.style === "return")
    assert(landed && resumed.length >= 2, "after casting the healer resumes its return")
    assert.equal(battle.moveAt, Infinity, "the return does not use movement cooldown")
    assert.equal(battle.sharedAt, cast.cast.issuedAt! + COOLDOWN.shared)
  } else if (situation === "triage") {
    assert.equal(cast?.cast.skill?.id, "healer/Prismatic/A2", "select the priority ward when rally cannot save an inside ally")
    assert(patient.hp > 0)
  } else {
    assert.equal(cast, undefined, situation + " must not spend a rescue")
    assert.equal(patient.hp > 0, situation === "warded" || situation === "different-angle")
  }
  observations.returnAid = "cast an on-time rescue while returning and kept the cooldown when aid was redundant or too late"
}

for (const pve of [false, true]) for (const aimedAtReturn of [false, true]) {
  const { battle, actor: ranger, events } = start([["ranger", [1, 0]]], pve ? undefined : [["summoner"]])
  const runner = pve ? battle.boss : battle.sparring!.rivals[0]
  place(ranger, 340, 620)
  place(runner, FIELD.left - 85, 620, .08)
  runner.actionAt = Infinity
  battle.moveAt = Infinity
  battle.nextThinkAt = Infinity
  assert.equal(moveEdgeFighter(battle, runner, { x: FIELD.left + 55, y: 620 }), null)
  const original = runner.move
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, { x: 130, y: aimedAtReturn ? 598 : 746 }), null)
  battle.nextThinkAt = 0
  advance(battle, .74)
  assert(runner.hp > 0, "dodge or keep the safe return according to the announced aim " + JSON.stringify({ pve, aimedAtReturn }))
  assert.equal(runner.move === original, !aimedAtReturn, "the same returning card only diverts for the lethal route")
  assert(!events.some(event => event.kind === "hit" && event.target === runner.id && event.cast.skill?.id === "ranger/Prismatic/A2"))
  observations.returnDodge = "both the boss and sparring AI changed only a return route that would be hit"
}

for (const nearEdge of [false, true]) {
  const { battle, actor: tank, events, opponents: [ranger] } = start([
    ["bulwark", [4, 0]], ["summoner"], ["warden"],
  ], [["ranger", [1, 0]]], "Radiant")
  const [, patient, teammate] = battle.team
  place(tank, 600, FIELD.top - 125)
  place(patient, 390, FIELD.top - (nearEdge ? 5 : 100), .13)
  place(teammate, 570, FIELD.top + 435)
  place(ranger, 410, FIELD.top + 125)
  teammate.actionAt = patient.actionAt = Infinity
  battle.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, { x: patient.x, y: FIELD.top + 1 }), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, .67)
  const rescue = events.find(event => event.kind === "shield" && event.target === patient.id && event.cast.skill?.id === "bulwark/Radiant/A5")
  assert(rescue && patient.hp > 0, "the instant ward protects a legal target both deep outside and about to cross")
}
observations.shoreWard = "used the instant shore ward before the direct hit even when the target was about to cross"

for (const assisted of [false, true]) {
  const { battle, events } = start([["ranger"], ["assassin"], ["healer", [0, 2]]], undefined, "Radiant")
  const { boss, team: [near, far, medic] } = battle
  place(boss, 600, 500)
  place(near, 536, 508)
  place(far, 760, 676, .08)
  place(medic, 960, 860)
  if (assisted) assert.equal(issueEdgeOrder(battle, medic, "skill2", null, far), null)
  advance(battle, .1)
  assert.equal(!!battle.telegraph, !assisted)
  assert.equal(boss.lastOrder, assisted ? "basic" : "charge")
  advance(battle, 3.17)
  if (assisted) {
    assert(far.hp > far.maxHp * .08 && events.some(event => event.kind === "shield" && event.target === far.id))
    assert(events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === near.id))
  } else assert.equal(far.hp, 0)
}
observations.pvePendingAid = "charged a finish when open and took a basic when the target already had a heal and ward coming"

for (const flipped of [false, true]) for (const mode of ["seed", "wheel", "wheel-small", "caster-pushed", "other-finish"] as const) {
  const { battle, events } = start([["ranger"], ["lifebringer", [3, 0]], ["spellbreaker"]])
  const { boss, team: [patient, lifebringer, alternative] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 530), { moveAt: Infinity })
  Object.assign(patient, at(600, 795), { hp: mode === "wheel-small" ? 18 : 51 })
  Object.assign(lifebringer, at(905, 852))
  Object.assign(alternative, mode === "other-finish" ? { ...at(819, 691), hp: 41 } : at(534, 575))
  const wheel = mode.startsWith("wheel")
  if (mode === "wheel") history(battle, patient).wounds.push({ time: 0, amount: 450 })
  assert.equal(issueEdgeOrder(battle, lifebringer, wheel ? "skill2" : "skill", wheel ? null : patient, wheel ? lifebringer : patient), null)
  if (mode === "caster-pushed") forceTo(battle, lifebringer, at(933, 928), .33)
  const follows = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const forecast = () => scheduledAid(battle, patient, 3, follows).map(beat => beat.heal)
  assert.equal(forecast().length, mode === "caster-pushed" ? 0 : wheel ? 3 : 1)
  advance(battle, .45)
  if (mode === "wheel") assert.deepEqual(forecast(), [65, 65])
  advance(battle, 3.12)
  const trade = events.find(event => event.kind === "hit" && event.cast.owner === boss.id)
  const finishesPatient = mode === "wheel-small" || mode === "caster-pushed"
  assert.equal(trade?.target, finishesPatient ? patient.id : alternative.id, mode)
  assert.equal(patient.hp === 0, finishesPatient, mode)
  assert.equal(alternative.hp === 0, mode === "other-finish", mode)
}
observations.pveFixedLifeAid = "forecast the actual Lifebringer pulses and retargeted when they could prevent a finish"

for (const flipped of [false, true]) for (const covered of [true, false]) {
  const allies: Member[] = [["bulwark"], ["assassin"], ["spellbreaker"]]
  const opponents: Member[] = [["binder"], ["ranger", [1, 0]], ["healer"]]
  const { battle, events } = start(flipped ? opponents : allies, flipped ? allies : opponents)
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const [tank, assassin, breaker] = flipped ? battle.sparring!.rivals : battle.team
  const [binder, ranger, healer] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(tank, at(832, 885))
  Object.assign(assassin, at(775, 822), { hp: 135, actionAt: 5 })
  Object.assign(breaker, at(609, 396), { hp: 194 })
  Object.assign(binder, at(528, 822), { actionAt: 1 })
  Object.assign(ranger, at(720, 919), { hp: 253, actionAt: 1.7, shield: 97, shieldUntil: 1.15 })
  Object.assign(healer, at(967, 894), { hp: 244, actionAt: 5 })
  ours.sharedAt = 0
  breaker.actionAt = 1
  theirs.sharedAt = Infinity
  assert.equal(issueEdgeOrder(battle, tank, "skill", null, assassin), null)
  advance(battle, 1)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "bulwark/Prismatic/A1")!
  assert(field.capacity > 0)
  if (!covered) field.capacity = 0
  ours.sharedAt = 0
  ours.moveAt = 0
  breaker.actionAt = 0
  theirs.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, binder, "skill2", null, tank), null)
  theirs.sharedAt = Infinity
  battle.nextThinkAt = battle.time
  advance(battle, 1.3)
  const actions = battle.sparring!.actions
  assert.equal(actions.some(action => action.actorId === assassin.id && action.name === "移动"), !covered,
    JSON.stringify({ flipped, covered, actions }))
  assert.equal(actions.some(action => action.actorId === breaker.id && action.name === "空拍"), covered,
    JSON.stringify({ flipped, covered, actions }))
  advance(battle, 1.65)
  if (covered) assert(events.some(event => event.kind === "protect" && event.cast === field.cast && event.target === assassin.id))
  assert.equal(assassin.hp, 135)
}
observations.coveredPullMovement = "saved movement and took a cast when the pull was covered, and dodged when the field was depleted"

for (const flipped of [false, true]) for (const shielded of [false, true]) {
  const allies: Member[] = [["spellbreaker"], ["bulwark", [0, 1]]]
  const opponents: Member[] = [["ranger", [1, 0]]]
  const { battle, events } = start(flipped ? opponents : allies, flipped ? allies : opponents)
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const [breaker, tank] = flipped ? battle.sparring!.rivals : battle.team
  const [ranger] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(breaker, at(609, 396), { hp: 194, shield: shielded ? 500 : 0, shieldUntil: 2 })
  Object.assign(tank, at(416, 773), { actionAt: Infinity })
  Object.assign(ranger, at(720, 919), { hp: 95 })
  ours.sharedAt = theirs.sharedAt = 0
  ours.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, breaker), null)
  theirs.sharedAt = Infinity
  advance(battle, 1.17)
  const order = battle.sparring!.actions.find(action => action.actorId === breaker.id)
  assert.equal(order?.name, shielded ? "抹迹长线" : undefined)
  assert.equal(breaker.hp > 0, shielded)
  if (shielded) assert(events.some(event => event.kind === "death" && event.target === ranger.id && event.cast.owner === breaker.id))
}
observations.breakerAliveAtImpact = "spent the action only when the stationary spell could resolve through the announced strike"

for (const flipped of [false, true]) for (const response of ["line", "separated", "warded", "cooling"] as const) {
  const allies: Member[] = [["warlock"], ["spellbreaker"]]
  const opponents: Member[] = [["ranger", [1, 3]]]
  const { battle } = start(flipped ? opponents : allies, flipped ? allies : opponents)
  const [team, threats] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [warlock, breaker] = team
  const [ranger] = threats
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(ranger, at(559, 266), { actionAt: response === "cooling" ? 2.8 : .67 })
  Object.assign(warlock, at(627, 916), { hp: 194 })
  Object.assign(breaker, at(647, 980), { hp: 257, shield: response === "warded" ? 400 : 0, shieldUntil: 5 })
  battle.sharedAt = battle.sparring!.sharedAt = 0
  const landing = response === "separated" ? at(801, 993) : at(718, 956)
  const risk = sharedLineExposure(battle, warlock, team, threats, .55, unit => unit === warlock ? landing : unit)
  assert.equal(risk > 0, response === "line", response)
}
observations.evasionTeamExposure = "priced a second exposed card on the same line using actual direction, aid and enemy cooldown"

for (const flipped of [false, true]) for (const keep of ["assassin", "spellbreaker", "cooling"] as const) {
  const allies: Member[] = [["bulwark"], ["spellbreaker"], ["assassin", [0, 4]]]
  const opponents: Member[] = [["warden", [1, 3]], ["binder"]]
  const { battle, events } = start(flipped ? opponents : allies, flipped ? allies : opponents)
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const [tank, breaker, assassin] = flipped ? battle.sparring!.rivals : battle.team
  const [warden, binder] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(tank, at(544, 624), { hp: 701, actionAt: .98 })
  Object.assign(breaker, at(714, 715), { hp: 45, actionAt: keep === "spellbreaker" ? .33 : 3.1 })
  Object.assign(assassin, at(714, 715), { hp: 45, actionAt: keep === "spellbreaker" ? 3.1 : .33 })
  Object.assign(warden, at(624, 556), { hp: 473 })
  Object.assign(binder, at(360, 572), { hp: 464 })
  tank.passiveAt[BULWARK_COVER.id] = Infinity
  ours.sharedAt = theirs.sharedAt = 0
  ours.moveAt = keep === "cooling" ? 2 : 0
  assert.equal(issueEdgeOrder(battle, warden, "skill2", null, at(656, 685)), null)
  theirs.sharedAt = Infinity
  advance(battle, .65)
  const saved = keep === "assassin" ? assassin : breaker
  const state = JSON.stringify({ flipped, keep, actions: battle.sparring!.actions, assassin: assassin.hp, breaker: breaker.hp })
  assert.equal(breaker.hp > 0, keep === "spellbreaker", state)
  assert.equal(assassin.hp > 0, keep === "assassin", state)
  if (keep === "cooling") continue
  assert.equal(battle.sparring!.actions.find(action => action.name === "移动")?.actorId, saved.id)
  advance(battle, 2.05)
  assert(events.some(event => event.kind === "hit" && event.cast.owner === saved.id && (event.amount ?? 0) > 0),
    JSON.stringify({ keep, actions: battle.sparring!.actions, events: events.filter(e => e.kind === "hit").map(e =>
      [e.cast.skill?.id, e.cast.owner, e.target, e.amount, e.absorbed]), hp: saved.hp, at: [saved.x, saved.y] }))
}
observations.sharedDodgeTriage = "used a narrow legal escape on the threatened card with a reachable follow-up, respecting movement cooldown"

for (const flipped of [false, true]) for (const mode of ["last-step", "safe-later", "move-cooling", "warded", "win"] as const) {
  const defenders = cards([["binder", [0, 1]], ["paladin", [1, 2]]], "Prismatic")
  const attackers = cards([["warden", [0, 3]], ["healer", [1, 4]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [patient, reserve] = flipped ? battle.sparring!.rivals : battle.team
  const [warden, medic] = flipped ? battle.team : battle.sparring!.rivals
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = 15 * SPARRING_STEP
  ours.sharedAt = 13 * SPARRING_STEP
  ours.moveAt = mode === "move-cooling" ? 2 : 0
  Object.assign(warden, at(620, 631), { attack: 235 })
  Object.assign(medic, at(827, 870), { hp: 43, actionAt: Infinity })
  Object.assign(reserve, at(975, 1030), { actionAt: 7 })
  Object.assign(patient, at(mode === "safe-later" ? 468 : 506, 870), {
    hp: 51, actionAt: .8, shield: mode === "warded" ? 320 : 0, shieldUntil: 3,
  })
  assert.equal(issueEdgeOrder(battle, warden, "skill2", null, at(620, 870)), null)
  if (mode === "win") {
    Object.assign(reserve, at(650, 660), { actionAt: 0 })
    warden.hp = 17
    medic.hp = 0
  }
  theirs.sharedAt = 6
  advance(battle, .61)
  const move = battle.sparring!.actions.find(action => action.name === "移动" && action.actorId === patient.id)
  assert.equal(patient.hp, mode === "move-cooling" ? 0 : 51, mode)
  assert.equal(!!move, mode === "last-step" || mode === "safe-later", mode)
  if (move) assert.equal(move.time < 15 * SPARRING_STEP, mode === "last-step", mode)
  if (mode === "win") assert.equal(battle.phase, flipped ? "lost" : "won")
}
observations.dodgeOnCooldown = "used the available travel window on both sides, kept an immediate win, and waited when the next regular action was sufficient"

for (const flipped of [false, true]) for (const reply of [false, true]) {
  const defenders = cards([["berserker"], ["paladin", [1, 2]]], "Prismatic")
  const attackers = cards([["warlock", [2, 4]], ["spellbreaker", [0, 1]], ["paladin", [1, 2]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [rage, paladin] = flipped ? battle.sparring!.rivals : battle.team
  const [mage, breaker, vanguard] = flipped ? battle.team : battle.sparring!.rivals
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = .6
  ours.moveAt = 31 * SPARRING_STEP
  theirs.moveAt = Infinity
  Object.assign(rage, at(380, 951), { hp: 181, actionAt: 1.2 })
  Object.assign(paladin, at(516, 714), { hp: 424, actionAt: .67, shield: 41, shieldUntil: 4 })
  Object.assign(mage, at(609, 467), { attack: 208 })
  Object.assign(breaker, at(702, 606), { attack: 195, actionAt: reply ? .92 : 4 })
  Object.assign(vanguard, at(717, 536), { hp: 895, actionAt: 1.3 })
  assert.equal(issueEdgeOrder(battle, mage, "skill", null, rage), null)
  advance(battle, 1.45)
  const actions = battle.sparring!.actions
  const moved = actions.some(action => action.actorId === rage.id && action.name === "移动" && action.time < .6)
  assert.equal(moved, !reply)
  assert.equal(rage.hp, reply ? 0 : 181)
  if (reply) assert(actions.some(action => action.actorId === paladin.id && action.name === "破晓横线" && action.time < .9))
}
observations.earlyDodgeAgainstPursuit = "kept the shared action for a teammate when every early escape allowed the next enemy to finish the mover"

for (const flipped of [false, true]) for (const mode of ["follow-up", "late", "warded", "move-cooling"] as const) {
  const defenders = cards([["binder", [0, 4]], ["warlock", [2, 4]]], "Prismatic")
  const attackers = cards([["warden", [0, 3]], ["ranger", [1, 3]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [patient, partner] = flipped ? battle.sparring!.rivals : battle.team
  const [warden, ranger] = flipped ? battle.team : battle.sparring!.rivals
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(warden, at(530, 540), { attack: 128 })
  Object.assign(ranger, at(958, 450), { attack: 251, actionAt: mode === "late" ? 3.5 : .8 })
  Object.assign(patient, at(655, mode === "move-cooling" ? 839 : 863), {
    hp: 365, actionAt: 2.05, shield: mode === "warded" ? 355 : 0, shieldUntil: 5,
  })
  Object.assign(partner, at(978, 427), { actionAt: 4 })
  assert.equal(issueEdgeOrder(battle, warden, "skill2", null, at(600, 812)), null)
  theirs.moveAt = Infinity
  if (mode === "move-cooling") ours.moveAt = 1.6
  advance(battle, 1.6)
  const dodged = events.some(event => event.kind === "startMove" && event.target === patient.id &&
    !events.some(hit => hit.kind === "hit" && hit.target === patient.id && hit.cast.owner === warden.id))
  assert.equal(dodged, mode === "follow-up", mode)
  assert.equal(patient.hp > 0, mode !== "move-cooling", mode)
  if (mode === "follow-up") assert.equal(patient.hp, 365)
  if (mode === "late") assert.equal(patient.hp, 232)
}
observations.dodgeBeforeDisplacement = "avoided a survivable shove that enabled a lethal follow-up, with slow, warded and unavailable movement controls"

for (const flipped of [false, true]) for (const mode of [
  "blades", "binder", "either", "shield", "late", "first-ready", "move-cooling", "short-range",
] as const) {
  const blue = cards([["summoner", [1, 2]], ["dancer", [2, 3]], ["warlock", [1, 4]], ["warden", [1, 3]]], "Prismatic")
  const red = cards([["berserker", [0, 1]], ["assassin", [0, 2]], ["binder", [1, 2]], ["healer"]], "Prismatic")
  red[2] = makeCard(pick("binder", [1, 2]), "Radiant", 2)
  const battle = createEdgeBattle(flipped ? blue : red, flipped ? red : blue)
  const { sparring } = battle
  const defending = flipped ? battle : sparring!
  const attacking = flipped ? sparring! : battle
  const [patient, dancer, mage, tank] = flipped ? battle.team : sparring!.rivals
  const [rage, assassin, binder, healer] = flipped ? sparring!.rivals : battle.team
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  battle.phase = "running"
  battle.nextThinkAt = .465
  Object.assign(rage, at(717, 984), { attack: 212 })
  Object.assign(patient, at(820, 636), { hp: 269, shield: mode === "shield" ? 355 : 205, shieldUntil: 4, actionAt: 5 })
  Object.assign(dancer, at(528, 356), { hp: 622, actionAt: 5 })
  Object.assign(mage, at(475, 687), { hp: 612, actionAt: 5 })
  Object.assign(tank, at(848, 396), { actionAt: 5 })
  Object.assign(healer, at(717, 1010), { actionAt: 5 })
  Object.assign(assassin, at(717, mode === "short-range" ? 1060 : 984), {
    attack: mode === "either" ? 90 : 156, actionAt: mode === "late" || mode === "binder" ? 4 : mode === "first-ready" ? 0 : 1.6,
  })
  Object.assign(binder, at(810, 870), {
    attack: mode === "either" ? 100 : 248, actionAt: mode === "binder" || mode === "either" ? 1.45 : Infinity,
  })
  attacking.moveAt = Infinity
  if (mode === "move-cooling") defending.moveAt = 2.5
  assert.equal(issueEdgeOrder(battle, rage, "skill2", null, at(810, 565)), null)
  advance(battle, 2.55)

  const moved = sparring!.actions.find(action => action.name === "移动" && action.time < 1)
  const shouldDodge = mode === "blades" || mode === "binder" || mode === "first-ready" || mode === "short-range"
  assert.equal(moved?.actorId === patient.id, shouldDodge, mode)
  assert.equal(events.some(event => event.kind === "hit" && event.cast.owner === rage.id && event.target === patient.id), !shouldDodge, mode)
  assert.equal(patient.hp, { blades: 250, binder: 215, either: 69, shield: 161, late: 196, "first-ready": 250,
    "move-cooling": 0, "short-range": 254 }[mode], mode)
  if (mode === "short-range") assert(events.some(event => event.kind === "hit" &&
    event.cast.skill?.id === "assassin/Prismatic/A3" && event.target === patient.id), mode)
  if (mode === "either") assert(moved && moved.actorId !== patient.id)
}
observations.sharedMoveFollowUp = "stepped out of an opener that exposed a lethal lock or fixed circle, with shield, cooldown and alternative attacks as controls"

for (const flipped of [false, true]) for (const mode of ["group-ward", "late", "out-of-range", "move-cooling"] as const) {
  const home = cards([["warden", [3, 0]], ["spellbreaker", [2, 4]], ["ranger", [1, 3]], ["healer", [1, 4]]], "Prismatic")
  const away = cards([["assassin", [0, 2]], ["ranger", [1, 3]], ["warlock"], ["summoner"]], "Prismatic")
  const battle = createEdgeBattle(flipped ? away : home, flipped ? home : away)
  const [tank, breaker, patient, medic] = flipped ? battle.sparring!.rivals : battle.team
  const [assassin, ranger, mage, summoner] = flipped ? battle.team : battle.sparring!.rivals
  const local = flipped ? battle.sparring! : battle
  const enemy = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  battle.phase = "running"
  Object.assign(tank, at(575, 585), { hp: 615, actionAt: 5 })
  Object.assign(breaker, mode === "out-of-range" ? at(956, 967) : at(688, 307), { hp: 694, actionAt: mode === "late" ? .45 : 0 })
  Object.assign(patient, at(594, 435), { hp: 433, actionAt: 1.267 })
  Object.assign(medic, at(513, 356), { hp: 756, actionAt: 5 })
  Object.assign(assassin, at(495, 550), { hp: 106, shield: 149, shieldUntil: 5 })
  Object.assign(ranger, at(553, 1065), { hp: 339, actionAt: .333 })
  Object.assign(mage, at(323, 1078), { actionAt: Infinity })
  Object.assign(summoner, at(906, 898), { actionAt: Infinity })
  if (mode === "move-cooling") local.moveAt = 4
  enemy.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, assassin, "skill2", null, patient), null)
  advance(battle, 1.64)
  const coverage = events.filter(event => event.kind === "shield" && event.cast.skill?.id === "spellbreaker/Prismatic/A5")
  const response = battle.sparring!.actions.find(action => action.side === (flipped ? "enemy" : "ally"))
  if (mode === "group-ward") {
    assert(response?.actorId === breaker.id && response.name === "合刃散印")
    assert.equal(new Set(coverage.map(event => event.target)).size, 4)
    assert(patient.hp > 0 && medic.hp > 0)
  } else if (mode === "late" || mode === "out-of-range") {
    assert.equal(response?.name, "移动", mode)
    assert(!coverage.some(event => event.target === patient.id), mode)
  } else {
    assert.equal(response?.name, "合刃散印", mode)
  }
}
observations.groupWardBeforeFollowUp = "kept a scattered party protected when a wide shield covered the next enemy action, with late and out-of-range controls"

for (const flipped of [false, true]) for (const late of [false, true]) {
  const home = [makeCard(pick("spellbreaker", [4, 2], [4, 5]), "Prismatic", 0),
    makeCard(pick("ranger", [1, 0]), "Prismatic", 1), makeCard(pick("healer", [0, 4]), "Prismatic", 2),
    makeCard(pick("warden", [0, 3]), "Prismatic", 3)]
  const away = cards([["warlock", [2, 4]], ["paladin", [1, 2]], ["warden", [0, 3]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? away : home, flipped ? home : away)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [breaker, first, medic, second] = allies
  const [mage, paladin, warden] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(breaker, at(603, 948))
  Object.assign(first, at(545, 786), { hp: late ? 125 : 151, actionAt: 1.15, move: late ? null : at(566, 794) })
  Object.assign(medic, at(649, 919), { hp: 530, actionAt: Infinity })
  Object.assign(second, late ? at(803, 660) : at(581, 765), { hp: 72, actionAt: Infinity })
  Object.assign(mage, at(682, 336), { attack: 190 })
  Object.assign(paladin, at(548, 562), { actionAt: 1.45 })
  Object.assign(warden, at(842, 570), { actionAt: Infinity })
  const cast = newCast(battle, paladin, "skill", paladin, paladin, paladin.actives[1])
  battle.runtime.buffs.push({ id: "fixture", cast, target: paladin.id, kind: "anti", values: [36], style: "", until: 5 })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, mage, "skill", null, first), null)
  advance(battle, late ? .29 : .034)
  const intent = chooseAiAttack(battle, breaker, allies, enemies)
  assert.equal(intent?.order, late ? "skill2" : "skill")
  assert.equal(issueEdgeOrder(battle, breaker, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, .88)
  const landed = events.filter(event => event.cast.skill?.id === "spellbreaker/Prismatic/A5")
  assert.deepEqual(landed.filter(event => event.kind === "shield").map(event => event.target), late ? [] : [first.id, second.id])
  assert.equal(landed.some(event => event.kind === "remove" && event.target === paladin.id), !late)
  assert.equal(landed.some(event => event.kind === "heal" && event.target === medic.id && event.cast.signature?.id === "spellbreaker/Prismatic/P5"), !late)
  assert.deepEqual([first.hp, second.hp], late ? [56, 72] : [12, 4])
}
observations.scatterSealsWardAndStrip = "protected both wounded units and removed a real enemy buff to trigger the allied heal, switching to the faster ward when late"

for (const mode of ["stall", "locked", "basic", "charging"] as const) {
  const { battle, actor: breaker, events } = start([["spellbreaker", [3, 1]], ["ranger"], ["dancer"]])
  const { boss, team: [, patient, dancer] } = battle
  Object.assign(breaker, { x: 440, y: 805 })
  Object.assign(patient, { x: 550, y: mode === "basic" ? 738 : 875, hp: 106 })
  Object.assign(dancer, { x: 582, y: 942, hp: 349 })
  Object.assign(boss, { x: 550, y: 651, attack: 220, moveAt: Infinity, actionAt: mode === "charging" ? 0 : 1 })
  if (mode === "locked") {
    const cast = newCast(battle, breaker, "skill", boss, boss, breaker.actives[0])
    battle.runtime.buffs.push({ id: "fixture", target: boss.id, cast, kind: "block", values: [1], style: "", until: 3.5 })
  }
  advance(battle, mode === "charging" ? .18 : .016)
  const intent = chooseAiAttack(battle, breaker, battle.team, [boss])
  assert.equal(intent?.order, mode === "stall" || mode === "charging" ? "skill" : "skill2", mode)
  assert.equal(issueEdgeOrder(battle, breaker, intent.order, null, intent.at), null)
  advance(battle, 2.71)
  const lock = events.filter(event => event.cast.skill?.id === "spellbreaker/Prismatic/A4")
  assert.equal(lock.filter(event => event.kind === "alter" && event.style === "stall").length, mode === "stall" ? 1 : 0, mode)
  assert.equal(lock.some(event => event.kind === "interrupt" && event.target === boss.id), mode === "charging")
  assert(!battle.telegraph && patient.hp === (mode === "basic" ? 0 : 106))
  if (mode === "stall") {
    advance(battle, 2.92)
    assert(battle.telegraph && boss.lastOrder === "charge")
  }
}
observations.scoreLockBoss = "placed the pre-charge field in time to delay the actual PvE boss, which resumed its charge after the lockout"

for (const flipped of [false, true]) for (const mode of ["wheel-saves-two", "seed-saves-one", "too-late", "shield", "shield-out-of-range"] as const) {
  const spellbreaker = mode.startsWith("shield")
  const allies: Member[] = [spellbreaker ? ["spellbreaker", [2, 3]] : ["lifebringer", [0, 3]], ["assassin"], ["warlock"]]
  const opponents: Member[] = [["ranger", [1, 3]], ["bulwark"]]
  const { battle, events } = start(flipped ? opponents : allies, flipped ? allies : opponents)
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const [caster, assassin, warlock] = flipped ? battle.sparring!.rivals : battle.team
  const [ranger, enemyTank] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(caster, mode === "shield-out-of-range" ? at(1030, 996) : at(776, 850))
  Object.assign(assassin, at(587, 773), { hp: mode === "seed-saves-one" ? 205 : 268, actionAt: Infinity })
  Object.assign(warlock, at(601, 872), { hp: spellbreaker ? warlock.maxHp : mode === "seed-saves-one" ? 120 : 257, actionAt: Infinity })
  Object.assign(ranger, at(590, 354))
  Object.assign(enemyTank, at(922, 405))
  if (mode === "wheel-saves-two" || mode === "too-late") for (const patient of [assassin, warlock]) {
    history(battle, patient).wounds.push({ time: 0, amount: 500 })
  }
  ours.sharedAt = theirs.sharedAt = 0
  ours.moveAt = mode === "wheel-saves-two" ? 0 : Infinity
  if (mode === "too-late") ours.sharedAt = .28
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, assassin), null)
  if (mode === "wheel-saves-two") {
    assert(dodgeAreaDamage(battle, assassin) && dodgeAreaDamage(battle, warlock), "either ally could also spend the shared move")
  }
  theirs.sharedAt = Infinity
  advance(battle, .69)
  const action = events.find(e => e.kind === "cast" && e.cast.owner === caster.id && e.cast.issuedAt !== undefined && !e.derived)
  const skill = mode === "wheel-saves-two" ? "lifebringer/Prismatic/A1" : mode === "seed-saves-one" ? "lifebringer/Prismatic/A4" :
    mode === "shield" ? "spellbreaker/Prismatic/A3" : undefined
  assert.equal(action?.cast.skill?.id, skill, mode)
  assert.equal(assassin.hp > 0, !!skill, mode)
  if (mode === "wheel-saves-two") assert(warlock.hp > 0)
  if (mode === "seed-saves-one") assert.equal(warlock.hp, 0)
}
observations.activeAidTriage = "chose one or two lives from heal and shield arrival, checking cooldown and range"

for (const flipped of [false, true]) for (const mode of ["finish", "ward", "late"] as const) {
  const { battle, actor, events } = start([["spellbreaker", [0, 1]]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 514), { hp: 100, actionAt: mode === "late" ? 1.3 : 0 })
  Object.assign(actor, at(600, 608), { hp: 30, shield: mode === "ward" ? 390 : 0, shieldUntil: 3 })
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, at(600, 370)), null)
  advance(battle, .2)
  const finish = mode === "finish"
  assert.equal(battle.phase, finish ? "lost" : "running", mode)
  assert.equal(events.some(e => e.kind === "startMove" && e.cast.owner === boss.id), !finish, mode)
  assert.equal(events.some(e => e.kind === "death" && e.target === actor.id && e.cast.order === "basic"), finish, mode)
}
observations.pveFinishBeforeDodge = "won with a ready lethal basic before dodging a spell, and respected a live ward or its own cooldown"

for (const mirrorPositions of [false, true]) for (const guard of ["open", "slow-ally", "incoming-heal"] as const) {
  const { battle, actor: tank, opponents: [enemyTank, blocker, patient], events } = start(
    [["bulwark", [2, 4]], ["healer"], ["paladin"]], [["bulwark"], ["healer", [0, 2]], ["warden"]],
  )
  const [, partner, paladin] = battle.team
  const transform = (x: number, y: number) => mirrorPositions ? mirror({ x, y }) : { x, y }
  const arrange = (unit: EdgeUnit, x: number, y: number, ratio = 1) => {
    const at = transform(x, y)
    place(unit, at.x, at.y, ratio)
  }
  arrange(tank, 827, 961)
  arrange(partner, 550, 941)
  arrange(paladin, 660, 895)
  arrange(enemyTank, 868, 910)
  arrange(blocker, 920, 834)
  arrange(patient, 688, 1041, .30)
  partner.attack = 165
  battle.moveAt = battle.sparring!.moveAt = Infinity
  battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, paladin, "basic", patient), null)
  paladin.actionAt = Infinity
  battle.sparring!.sharedAt = Infinity
  advance(battle, .91)
  partner.actionAt = guard === "slow-ally" ? 4 : 0
  if (guard === "incoming-heal") {
    // Keep a real cast in flight at the decision frame.
    blocker.actionAt = battle.sparring!.sharedAt = 0
    assert.equal(issueEdgeOrder(battle, blocker, "skill2", patient), null)
    battle.sparring!.sharedAt = Infinity
  }
  battle.nextThinkAt = battle.time
  advance(battle, 2.38)
  const tankHit = events.find(event => event.kind === "hit" && event.target === patient.id && event.cast.skill?.id === "bulwark/Prismatic/A5")
  const followed = events.some(event => event.kind === "hit" && event.target === patient.id && event.cast.owner === partner.id && event.cast.order === "basic")
  const exited = events.some(event => event.kind === "exit" && event.target === patient.id)
  assert(tankHit, "the tank's chosen cast must actually reach the patient")
  assert.equal(followed, guard === "open", JSON.stringify({ mirrorPositions, guard, hp: patient.hp, exited }))
  assert.equal(exited, guard !== "open", JSON.stringify({ mirrorPositions, guard, hp: patient.hp, followed }))
}
observations.shoveAngle = "kept a wounded target in a ready partner's reach and used the edge when support or cooldown closed the finish"

for (const canMove of [false, true]) {
  const { battle, actor: tank, opponents: [patient, warden], events } = start(
    [["bulwark", [2, 4]], ["healer", [0, 1]], ["paladin"]], [["healer", [0, 4]], ["warden"]],
  )
  const [, partner, medic] = battle.team
  place(tank, 827, 961)
  place(partner, 590, 867)
  place(medic, 931, 760)
  place(patient, 692, 1062, .13)
  place(warden, 985, 745)
  partner.actionAt = .90
  medic.actionAt = 2.4
  battle.moveAt = canMove ? 0 : Infinity
  battle.sparring!.moveAt = Infinity
  battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, tank, "skill2", null, tank), null)
  advance(battle, .84)
  assert(isOutside(patient) && patient.hp > 0)
  battle.nextThinkAt = battle.time + .07
  advance(battle, 2.53)
  const pursuit = events.find(event => event.kind === "startMove" && event.target === partner.id)
  const down = events.find(event => event.kind === "death" && event.target === patient.id)
  assert.equal(!!pursuit, canMove, "pursuit requires the actual movement cooldown")
  assert.equal(down?.cast.owner, canMove ? partner.id : undefined,
    "a useful pursuit converts to a real finish " + JSON.stringify({ canMove, hp: patient.hp, at: [patient.x, patient.y] }))
}
observations.pursuit = "moved toward the actual re-entry path after a shove and finished after the shared cooldown"

for (const mirrored of [false, true]) for (const mode of ["exposed", "shielded", "move-cooldown", "foe-cooldown"] as const) {
  const { battle, actor: patient, opponents: [shooter], events } = start([["summoner", [0, 2]]], [["ranger", [0, 2]]], "Radiant")
  const position = (x: number, y: number) => mirrored ? mirror({ x, y }) : { x, y }
  Object.assign(patient, position(600, 850), { hp: 28, actionAt: Infinity })
  Object.assign(shooter, position(600, 600), { actionAt: mode === "foe-cooldown" ? 3.5 : 1.10 })
  if (mode === "shielded") Object.assign(patient, { shield: 300, shieldUntil: 5 })
  if (mode === "move-cooldown") battle.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  battle.sparring!.moveAt = Infinity
  advance(battle, .25)
  const retreats = mode === "exposed"
  assert.equal(!!patient.move, retreats, "step out only when an available move averts a lethal ranged basic")
  // Issue the enemy's same planned basic in each replay, with the normal range and cooldown checks.
  battle.nextThinkAt = Infinity
  advance(battle, 1.12)
  const shot = issueEdgeOrder(battle, shooter, "basic", patient)
  if (retreats) assert.equal(shot, "超出射程")
  else if (mode === "foe-cooldown") assert.equal(shot, "角色冷却中")
  else assert.equal(shot, null)
  advance(battle, 1.7)
  assert.equal(patient.hp > 0, mode !== "move-cooldown")
  if (mode === "move-cooldown") assert(events.some(event => event.kind === "death" && event.target === patient.id))
}
observations.lethalShotRetreat = "left lethal basic range before launch on either side, respecting protection and both cooldowns"

for (const mirrored of [false, true]) for (const mode of ["ready", "patient-recovered", "partner-cooldown", "out-of-range"] as const) {
  const { battle, actor: tank, opponents: [summoner, patient], events } = start([
    ["bulwark", [2, 4]], ["assassin", [3, 4]],
  ], [["summoner", [3, 2]], ["healer"]], "Radiant")
  const [, finisher] = battle.team
  const position = (x: number, y: number) => mirrored ? mirror({ x, y }) : { x, y }
  Object.assign(tank, position(600, 710))
  Object.assign(finisher, position(852, 745), { actionAt: mode === "partner-cooldown" ? 4.2 : 1.0 })
  Object.assign(summoner, position(660, 700))
  Object.assign(patient, position(859, 578), { hp: 72 })
  Object.assign(summoner, { shield: 280, shieldUntil: 5 })
  tank.actives = tank.actives.map(skill => ({ ...skill, steps: [] })) as typeof tank.actives
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, summoner, "skill", patient), null)
  battle.sparring!.sharedAt = Infinity
  battle.moveAt = battle.sparring!.moveAt = Infinity
  const [body] = battle.runtime.summons[0].deployment.bodies
  Object.assign(body, mode === "out-of-range" ? position(696, 624) : position(644, 672), { hp: 38 })
  body.actionsAt[0] = .92
  if (mode === "patient-recovered") patient.hp = patient.maxHp
  advance(battle, 1.91)
  const cut = events.find(event => event.kind === "hit" && event.target === body.id)
  const treated = events.some(event => event.kind === "heal" && event.target === patient.id && event.cast.skill?.deployment === "rescue")
  if (mode === "ready") {
    assert.equal(cut?.cast.owner, tank.id, "break a reachable rescue when a teammate can finish through the resulting gap")
    assert.equal(body.hp, 0)
    assert.equal(patient.hp, 0)
    assert(!treated)
  } else {
    assert(!cut && body.hp > 0, "keep the real attack when the rescue is idle, unreachable, or the ally cannot capitalize " +
      JSON.stringify({ mode, mirrored, target: cut?.target, at: cut?.cast.issuedAt, source: cut?.cast.owner, body: [body.x, body.y] }))
    assert(patient.hp > 0)
    assert.equal(treated, mode !== "patient-recovered")
  }
}
observations.rescueDenial = "destroyed a reachable medic body before a decisive pulse, with position, health and cooldown controls"

for (const mode of ["open", "pulse", "weak-body", "late-pulse"] as const) {
  const { battle, actor: summoner, events } = start([["summoner", [3, 2]], ["healer"], ["bulwark"]], undefined, "Radiant")
  const { boss, team: [, patient, nearby] } = battle
  place(boss, 600, 580)
  place(summoner, 665, 620)
  place(patient, 770, 646)
  place(nearby, 556, 630)
  patient.hp = 43
  boss.attack = 100
  boss.moveAt = Infinity
  boss.lastOrder = "charge"
  summoner.shield = nearby.shield = 110
  summoner.shieldUntil = nearby.shieldUntil = 5
  let rescueBody: EdgeUnit | undefined
  if (mode !== "open") {
    assert.equal(issueEdgeOrder(battle, summoner, "skill", patient), null)
    const [body] = battle.runtime.summons[0].deployment.bodies
    place(body, 678, 630)
    body.actionsAt[0] = mode === "late-pulse" ? 4.5 : 1.04
    body.hp = mode === "weak-body" ? 38 : body.maxHp
    rescueBody = body
  }
  place(summoner, 961, 832)
  advance(battle, .12)
  const charge = mode === "open" || mode === "late-pulse"
  assert.equal(!!battle.telegraph, charge, mode)
  if (mode === "weak-body") assert.equal(rescueBody?.hp, 0)
  advance(battle, 3.12)
  if (charge) assert.equal(patient.hp, 0)
  else if (mode === "pulse") {
    assert(events.some(event => event.kind === "heal" && event.target === patient.id))
    assert(events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === nearby.id))
  } else assert(!events.some(event => event.kind === "heal" && event.target === patient.id))
}
observations.pveRescuePulse = "the boss chose between a finishing charge, a reachable rescue body, and a card it could hit immediately"

{
  const { battle, actor: summoner, opponents: [shooter] } = start([["summoner", [4, 2]], ["ranger"]], [["ranger"]], "L")
  const [, patient] = battle.team
  place(summoner, 600, 1000)
  place(patient, 680, 735)
  place(shooter, 680, 520)
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 600, y: 635 }), null)
  const [first, second] = battle.runtime.summons[0].deployment.bodies
  place(first, 608, 635)
  place(second, 698, 635)
  assert(edgeDistance(shooter, second) < edgeDistance(shooter, first))
  const spent = directHitForecast()
  assert.equal(estimateDirectHit(battle, shooter, patient, 1, "basic", patient, .33, 0, { spent }).hpLoss, 0)
  assert(estimateDirectHit(battle, shooter, patient, 1, "basic", patient, 1.32, 0, { spent }).hpLoss > 0,
    "a hit on the far mirror consumes the same interception cooldown as a hit on the first")
}
observations.sharedMirrorInterception = "did not reuse the line interception after the second mirror took the opening shot"

for (const mirrored of [false, true]) for (const mode of ["join", "shield-opening", "no-move"] as const) {
  const { battle, actor, opponents: [tank, exposed], events } = start([
    ["summoner", [0, 2]], ["warden"],
  ], [["bulwark"], ["healer"]], "Radiant")
  const [, teammate] = battle.team
  const position = (x: number, y: number) => mirrored ? mirror({ x, y }) : { x, y }
  Object.assign(actor, position(400, 900))
  Object.assign(tank, position(400, 990), { shield: 500, shieldUntil: 25 })
  Object.assign(exposed, position(690, 761))
  Object.assign(teammate, position(680, 670), { actionAt: Infinity })
  actor.actives = actor.actives.map(skill => ({ ...skill, deployment: undefined, steps: [] })) as typeof actor.actives
  battle.nextThinkAt = Infinity
  for (let shot = 0; shot < 2; shot++) {
    assert.equal(issueEdgeOrder(battle, actor, "basic", tank), null)
    advance(battle, actor.actionAt + SPARRING_STEP)
  }
  assert.equal(history(battle, actor).blockedBasic?.count, 2)
  if (mode === "shield-opening") tank.shield = 25
  if (mode === "no-move") battle.moveAt = Infinity
  const at = battle.time
  battle.nextThinkAt = at
  advance(battle, at + 2.4)
  const move = events.find(event => event.kind === "startMove" && event.target === actor.id && event.cast.issuedAt! >= at)
  const hit = events.filter(event => event.kind === "hit" && event.cast.owner === actor.id).at(-1)
  assert.equal(!!move, mode === "join")
  assert.equal(hit?.target, mode === "join" ? exposed.id : tank.id)
  if (mode === "no-move") assert.equal(hit?.amount, 0)
  else assert((hit?.amount ?? 0) > 0)
}
observations.rejoinAfterShield = "returned to an ally after two absorbed shots, or fired again when the shield or move cooldown changed"

for (const pve of [false, true]) for (const mode of ["leave", "covered", "too-close", "cooldown"] as const) {
  const { battle, events } = start([["assassin", [3, 4]]], pve ? undefined : [["summoner"]], "Radiant")
  const [assassin] = battle.team
  const patient = pve ? battle.boss : battle.sparring!.rivals[0]
  place(assassin, 580, 630)
  place(patient, 580, mode === "too-close" ? 876 : 988)
  patient.hp = 42
  patient.actionAt = Infinity
  if (mode === "covered") Object.assign(patient, { shield: 350, shieldUntil: 4 })
  if (pve) battle.boss.moveAt = mode === "cooldown" ? Infinity : 0
  else {
    battle.sparring!.moveAt = mode === "cooldown" ? Infinity : 0
    battle.sparring!.sharedAt = 0
  }
  assert.equal(issueEdgeOrder(battle, assassin, "skill2", patient), null)
  advance(battle, .85)
  const hit = events.find(event => event.kind === "hit" && event.cast.skill?.id === "assassin/Radiant/A5" && event.target === patient.id)
  assert.equal(!!hit, mode !== "leave", "step out before a real lock only when the route is open " + JSON.stringify({ pve, mode }))
  assert.equal(patient.hp > 0, mode === "leave" || mode === "covered")
  if (mode === "leave") assert(events.some(event => event.kind === "startMove" && event.target === patient.id))
}
observations.lockedStrikeRetreat = "escaped an actual windup in sparring and PvE, with protection, reach and cooldown controls"

for (const healerReady of [true, false]) {
  const { battle, actor: tank, opponents: [assassin], events } = start([
    ["bulwark", [1, 4]], ["summoner"],
  ], [["assassin", [3, 4]]], "Radiant")
  const [, patient] = battle.team
  place(assassin, 580, 620)
  place(patient, 580, 820)
  place(tank, 800, 820)
  patient.hp = 42
  tank.actionAt = healerReady ? 0 : 1.6
  patient.actionAt = battle.moveAt = battle.sparring!.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, assassin, "skill2", patient), null)
  battle.sparring!.sharedAt = Infinity
  advance(battle, .72)
  const ward = events.find(event => event.kind === "shield" && event.target === patient.id && event.cast.owner === tank.id)
  const hit = events.find(event => event.kind === "hit" && event.target === patient.id && event.cast.owner === assassin.id)
  assert(hit, "the lock stays in range until impact")
  assert.equal(!!ward, healerReady)
  assert.equal(patient.hp > 0, healerReady)
}
observations.lockedStrikeAid = "a ready tank warded the target before impact when it could not escape the lock"

for (const shielded of [false, true]) {
  const { battle, actor: patient, opponents: [assassin], events } = start([["summoner"]], [["assassin", [3, 4]]], "Radiant")
  place(assassin, 480, 582)
  place(patient, 693, 802, .37)
  battle.moveAt = battle.sparring!.moveAt = battle.nextThinkAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, assassin, "skill2", patient), null)
  advance(battle, .7)
  assert(patient.hp > 0 && patient.hp < patient.maxHp * .25)
  if (shielded) Object.assign(patient, { shield: 270, shieldUntil: 8 })
  patient.actionAt = Infinity
  const reactAt = assassin.actionAt - 2.3
  advance(battle, reactAt)
  battle.sparring!.sharedAt = 0
  battle.moveAt = 0
  battle.nextThinkAt = reactAt
  advance(battle, reactAt + .38)
  assert.equal(!!patient.move, !shielded, "avoid a repeat targeted hit before the next cast if it would leave single-digit health")
  battle.nextThinkAt = Infinity
  advance(battle, assassin.actionAt + SPARRING_STEP)
  assert.equal(issueEdgeOrder(battle, assassin, "skill2", patient), shielded ? null : "超出射程")
  advance(battle, battle.time + .6)
  assert.equal(events.filter(event => event.kind === "hit" && event.cast.skill?.id === "assassin/Radiant/A5" &&
    event.target === patient.id).length, shielded ? 2 : 1)
}
observations.repeatedLockedStrike = "retreated before the same lethal follow-up when open and held when the current ward could absorb it"

for (const [kind, slot] of [["lifebringer", 3], ["summoner", 3]] as const) {
  for (const mode of ["ready", "in-time-shield", "too-late"] as const) {
    const { battle, actor: supporter, opponents: [assassin], events } = start([
      [kind, [slot, 2]], ["ranger"],
    ], [["assassin", [3, 4]]], "Radiant")
    const [, patient] = battle.team
    place(assassin, 578, 630)
    place(patient, 578, 820)
    place(supporter, kind === "summoner" && mode === "too-late" ? 950 : 730, 820)
    patient.hp = 100
    patient.actionAt = Infinity
    battle.moveAt = battle.sparring!.moveAt = Infinity
    battle.sparring!.sharedAt = 0
    assassin.actionAt = .28
    if (mode === "in-time-shield") Object.assign(patient, { hp: Math.round(patient.maxHp * .53), shield: 250, shieldUntil: 5 })
    if (mode === "too-late" && kind === "lifebringer") supporter.actionAt = .4
    const alreadyCasting = mode === "too-late" && kind === "summoner"
    if (alreadyCasting) {
      assassin.actionAt = 0
      assert.equal(issueEdgeOrder(battle, assassin, "skill2", patient), null)
    }
    advance(battle, .18)
    const aid = events.find(event => event.kind === "cast" && event.cast.owner === supporter.id && event.target === patient.id)
    assert.equal(!!aid, mode === "ready", "use available aid only if it can arrive before the next threat " + JSON.stringify({ kind, mode }))
    battle.nextThinkAt = Infinity
    advance(battle, .29)
    if (!alreadyCasting) assert.equal(issueEdgeOrder(battle, assassin, "skill2", patient), null)
    advance(battle, 1.1)
    assert.equal(patient.hp > 0, mode !== "too-late", JSON.stringify({ kind, mode, events: events
      .filter(e => e.target === patient.id && ["cast", "heal", "shield", "hit", "death"].includes(e.kind))
      .map(e => [e.kind, e.cast.skill?.id, e.amount, e.absorbed]) }))
  }
}
observations.preemptiveAid = "gave a reachable ward or deployed a medic in time, respecting existing shields, range and cooldown"

for (const safeUntil of [1.62, 4]) {
  const { battle, actor: dancer, opponents: [assassin], events } = start([["dancer"]], [["assassin", [3, 4]]], "Radiant")
  place(dancer, 279, 790)
  place(assassin, 383, 629)
  Object.assign(dancer, { hp: 40, shield: 250, shieldUntil: safeUntil, actionAt: Infinity })
  battle.sparring!.sharedAt = 0
  battle.sparring!.moveAt = Infinity
  assassin.actionAt = 1.15
  advance(battle, .26)
  const retreat = safeUntil < 2
  assert.equal(!!dancer.move, retreat, "check the attack just after a shield will expire")
  battle.nextThinkAt = Infinity
  advance(battle, 1.53)
  const strike = issueEdgeOrder(battle, assassin, "skill2", dancer)
  if (retreat) assert.equal(strike, "超出射程")
  else assert.equal(strike, null)
  advance(battle, 2.07)
  assert(dancer.hp > 0)
  assert.equal(events.some(event => event.kind === "hit" && event.cast.owner === assassin.id), !retreat)
}
observations.wardExpiryRetreat = "left before a delayed targeted cast could exploit expiring protection, stayed under a longer ward"

for (const mode of ["windup", "dash", "covered-line", "missed-line"] as const) {
  const { battle, actor: mage, opponents: [assassin, guard], events } = start([["warlock", [1, 0]], ["warden"]], [
    ["assassin", [0, mode === "dash" ? 2 : 4]], ["bulwark"],
  ], "UC")
  place(mage, 600, 600, mode === "windup" ? .07 : 1)
  place(assassin, 600, 690)
  place(guard, mode === "covered-line" ? 600 : 850, 660)
  const [, rear] = battle.team
  place(rear, 890, 980)
  rear.actionAt = guard.actionAt = battle.moveAt = battle.sparring!.moveAt = Infinity
  battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, mage, "skill", null, { x: mode === "missed-line" ? 800 : 600, y: 825 }), null)
  if (mode !== "dash") advance(battle, .19)
  battle.sparring!.sharedAt = 0
  battle.nextThinkAt = battle.time
  advance(battle, .88)
  const expectedDash = mode === "covered-line" || mode === "missed-line"
  const order = battle.sparring!.actions.find(action => action.actorId === assassin.id)
  assert(order, mode)
  assert.equal(order.name, expectedDash ? "侧闪" : mode === "dash" ? "折匕" : "普攻", mode)
  assert(events.some(event => event.kind === "hit" && event.cast.owner === assassin.id && event.target === mage.id), mode)
  const pushed = events.find(event => event.kind === "push" && event.cast.skill?.id === "warlock/UC/A2")
  assert.equal(pushed?.target, mode === "dash" ? assassin.id : mode === "covered-line" ? guard.id : undefined)
  assert.equal(battle.sparring!.moveAt, Infinity)
}
observations.dashCommitment = "used a basic before a threatened launch or a shot that could leave in time, kept the dash when the push went elsewhere"

for (const mode of ["patrol", "other-target", "cooling"] as const) {
  const { battle, actor: summoner, opponents: [assassin, guard], events } = start([["summoner", [1, 0]]], [
    ["assassin", [3, 1]], ["warden"],
  ], "L")
  place(summoner, 600, 600, mode === "patrol" ? .25 : 1)
  place(assassin, 600, mode === "patrol" ? 690 : 726)
  place(guard, mode === "other-target" ? 600 : 800, 675)
  guard.actionAt = battle.moveAt = battle.sparring!.moveAt = Infinity
  battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 600, y: 840 }), null)
  const [group] = battle.runtime.summons
  const [body] = group.deployment.bodies
  if (mode === "cooling") body.actionsAt[0] = 2
  advance(battle, .16)
  battle.sparring!.sharedAt = 0
  battle.nextThinkAt = battle.time
  advance(battle, 1)
  const hand = events.find(event => event.kind === "hit" && event.cast.owner === assassin.id && event.target === summoner.id)
  assert(hand, mode + " should result in an actual hit")
  assert.equal(hand.cast.skill?.id, mode === "patrol" ? undefined : "assassin/L/A4", mode)
  const pushed = events.find(event => event.kind === "push" && event.cast.skill?.id === "summoner/L/A2")
  assert.equal(pushed?.target, mode === "patrol" ? assassin.id : mode === "other-target" ? guard.id : undefined)
}
observations.summonCastDisruption = "changed the attack according to the patrolling summon, its selected card and its cooldown"

for (const mode of ["threat", "away", "recovering"] as const) {
  const { battle, actor: summoner, events } = start([["summoner", [1, 0]]], undefined, "L")
  const { boss } = battle
  place(summoner, 605, 807)
  place(boss, 580, 500)
  boss.lastOrder = "charge"
  boss.actionAt = 8
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 605, y: mode === "away" ? 917 : 697 }), null)
  if (mode === "recovering") battle.runtime.summons[0].deployment.bodies[0].actionsAt[0] = 2.8
  advance(battle, .1)
  const firstMove = boss.move
  assert(firstMove)
  if (mode === "threat") assert(Math.abs(firstMove.x - boss.x) > 80, "detour before a moving beast cuts across the walk")
  if (mode === "away") assert(Math.abs(firstMove.x - boss.x) < 30, "walk directly when the patrol is moving away")
  const moveAt = boss.moveAt
  advance(battle, 2.3)
  assert.equal(boss.moveAt, moveAt)
  assert.equal(boss.actionAt, 8)
  assert(!events.some(event => event.kind === "push" && event.target === boss.id), mode)
  advance(battle, 9.1)
  assert(events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === summoner.id), mode)
}
observations.pveRoadBeast = "detoured around an intercepting patrol, walked straight when it moved away, and attacked after the legal cooldown"

for (const mode of ["lethal", "shielded", "out-of-lane"] as const) {
  const { battle, actor: summoner, opponents: [shooter], events } = start([["summoner", [4, 2]], ["ranger"]], [["ranger", [0, 2]]], "L")
  const [, patient] = battle.team
  place(summoner, mode === "out-of-lane" ? 925 : 590, mode === "out-of-lane" ? 1055 : 1050)
  place(patient, 600, 790, .04)
  place(shooter, 600, 540)
  if (mode === "shielded") Object.assign(patient, { shield: 900, shieldUntil: 3 })
  battle.sparring!.sharedAt = 0
  battle.sparring!.moveAt = battle.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, shooter, "basic", patient), null)
  battle.sparring!.sharedAt = Infinity
  patient.actionAt = Infinity
  advance(battle, .6)
  const blocked = events.find(event => event.kind === "assist" && event.style === "mirrorWeave" && event.target === patient.id)
  assert.equal(!!blocked, mode === "lethal", mode)
  assert.equal(patient.hp > 0, mode !== "out-of-lane", mode)
}
observations.mirrorQueuedShot = "intercepted a lethal basic already in flight only when the link could reach it and the patient needed it"

for (const mode of ["escape", "cooldown", "warded", "in-flight"] as const) {
  const { battle, actor: mage, events } = start([["warlock", [0, 1]]], undefined, "C")
  const { boss } = battle
  place(mage, 600, 600)
  place(boss, 600, mode === "in-flight" ? 853 : 850)
  boss.hp = 35
  boss.actionAt = Infinity
  if (mode === "warded") Object.assign(boss, { shield: 400, shieldUntil: 4 })
  battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, mage, "skill", boss), null)
  if (mode === "in-flight") {
    advance(battle, .22)
    const [contact] = announcedStrikes(battle, boss)
    assert(contact && "launchedFrom" in contact.strike && contact.strike.launchedFrom)
    assert.equal(moveEdgeFighter(battle, boss, { x: 600, y: 1010 }), null)
  }
  if (mode === "cooldown") boss.moveAt = Infinity
  battle.nextThinkAt = battle.time
  advance(battle, .85)
  const hit = events.find(event => event.kind === "hit" && event.cast.skill?.id === "warlock/C/A1" && event.target === boss.id)
  assert.equal(!!hit, mode !== "escape", mode)
  assert.equal(boss.hp > 0, mode === "escape" || mode === "warded")
  const earlyMove = events.find(event => event.kind === "startMove" && event.target === boss.id && (event.cast.issuedAt ?? Infinity) < .18)
  assert.equal((earlyMove?.landing?.y ?? 0) > 850, mode === "escape", mode)
  if (mode === "in-flight") assert(hit?.at && edgeDistance(mage, hit.at) > mage.actives[0].aim.range)
}
observations.pveProjectileLock = "left a lethal launch range when free, approached under a ward, and took a launched shot after walking out"

for (const warded of [false, true]) {
  const { battle, actor: mage, opponents: [primary, alternate], events } = start([
    ["warlock", [0, 2]], ["assassin", [1, 0]],
  ], [["healer"], ["warlock"]], "Radiant")
  const [, assassin] = battle.team
  place(mage, 600, 668)
  place(assassin, 600, 861)
  place(primary, 600, 530)
  place(alternate, 760, 550)
  Object.assign(primary, { hp: 40, shield: warded ? 132 : 0, shieldUntil: warded ? 6 : 0 })
  battle.moveAt = battle.sparring!.moveAt = battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, mage, "basic", primary), null)
  advance(battle, .05)
  damageUnit(battle, newCast(battle, alternate, "skill", mage, mage), mage, mage.maxHp * 4)
  assert.equal(mage.hp, 0)
  const [pending] = announcedStrikes(battle, primary)
  assert(pending && pending.source === mage, "a released shot stays in the queue after its caster falls")
  // Open the other unit's action window to test two orders close enough for
  // their shots to overlap. The next actual order still spends the cooldown.
  battle.sharedAt = 0
  battle.nextThinkAt = battle.time
  advance(battle, 1.16)
  const oldHit = events.find(event => event.kind === "hit" && event.cast.owner === mage.id && event.target === primary.id)
  const chosen = events.find(event => event.kind === "cast" && event.cast.owner === assassin.id)
  const expected = warded ? primary.id : alternate.id
  assert(oldHit && chosen?.cast.skill?.id === "assassin/Radiant/A2",
    JSON.stringify({ warded, oldHit: !!oldHit, chosen: chosen?.cast.skill?.id, actions: battle.sparring!.actions }))
  assert.equal(chosen.target, expected)
  assert(events.some(event => event.kind === "hit" && event.cast === chosen.cast && event.target === expected))
}
observations.committedProjectileFocus = "chose a different opening when a launched shot would finish, kept the projectile focus when a shield would absorb it"

for (const [mirrored, timing] of [[false, "wait"], [true, "wait"], [false, "fresh"], [false, "thin"], [false, "renewed"]] as const) {
  const { battle, actor: assassin, opponents: [paladin], events } = start([["assassin", [0, 3]]], [["paladin", [1, 3]]], "L")
  const at = (x: number, y: number) => mirrored ? mirror({ x, y }) : { x, y }
  Object.assign(assassin, at(600, 842))
  Object.assign(paladin, at(600, 650))
  battle.nextThinkAt = Infinity
  battle.moveAt = battle.sparring!.moveAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, paladin, "skill", null, paladin), null)
  advance(battle, .63)
  const startAt = battle.time
  assert.equal(battle.runtime.shieldCasts.get(paladin.id)?.skill?.id, "paladin/L/A2")
  const expires = startAt + (timing === "fresh" ? 3 : .74)
  paladin.shieldUntil = expires
  if (timing === "thin") paladin.shield = 12
  if (timing === "renewed") {
    paladin.actionAt = battle.sparring!.sharedAt = startAt + .14
    advance(battle, startAt + .16)
    assert.equal(issueEdgeOrder(battle, paladin, "skill", null, paladin), null)
  }
  battle.sparring!.sharedAt = Infinity
  battle.nextThinkAt = battle.time
  advance(battle, startAt + 1.5)
  const action = battle.sparring!.actions.find(action => action.actorId === assassin.id)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === assassin.id && event.target === paladin.id)
  assert(action && hit, timing)
  if (timing === "wait") {
    assert(action.time > startAt + .21 && action.time < expires, "wait only long enough for the attack to land after expiry")
    assert((hit.amount ?? 0) > 100 && !hit.absorbed)
  } else assert(action.time <= startAt + .21, timing)
}
observations.duelShieldExpiry = "timed a finishing window around actual expiry while acting immediately into a thin shield, lasting shield, or queued refresh"

for (const [pve, mode] of [[true, "escape"], [true, "covered"], [true, "cooling"], [false, "escape"]] as const) {
  const { battle, actor: paladin, events } = start([["paladin", [1, 3]]], pve ? undefined : [["ranger"]], "L")
  const patient = pve ? battle.boss : battle.sparring!.rivals[0]
  place(paladin, 602, 640)
  place(patient, 726, 740)
  patient.hp = 48
  patient.actionAt = Infinity
  if (mode === "covered") Object.assign(patient, { shield: 400, shieldUntil: 4 })
  if (pve) battle.boss.moveAt = mode === "cooling" ? Infinity : 0
  else battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, paladin, "skill", null, { x: 602, y: 740 }), null)
  advance(battle, .64)
  const impact = events.find(event => event.kind === "hit" && event.cast.skill?.id === "paladin/L/A2" && event.target === patient.id)
  assert.equal(!!impact, mode !== "escape", JSON.stringify({ pve, mode }))
  assert.equal(patient.hp > 0, mode !== "cooling")
  if (mode === "escape") assert(events.some(event => event.kind === "startMove" && event.target === patient.id))
}
observations.areaEscape = "both AI modes left an actual damage area when they could clear it and stayed with movement unavailable or enough protection"

for (const [pve, danger] of [[true, true], [true, false], [false, true], [false, false]] as const) {
  const { battle, actor: spell, events } = start([["spellbreaker", [1, 0]]], pve ? undefined : [["assassin", [0, 1]]], "Prismatic")
  const patient = pve ? battle.boss : battle.sparring!.rivals[0]
  place(spell, 605, 640)
  place(patient, 390, 710)
  patient.hp = 50
  patient.actionAt = .8
  if (!pve) battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, spell, "skill", null, { x: 390, y: danger ? 625 : 545 }), null)
  advance(battle, .64)
  assert.equal(patient.hp > 0, true)
  const entered = events.find(event => event.kind === "startMove" && event.target === patient.id && (event.cast.issuedAt ?? 1) < .16)
  if (!danger) assert(entered, JSON.stringify({ pve, danger }))
  if (entered) assert(!events.some(event => event.kind === "hit" && event.target === patient.id && event.cast.skill?.id === "spellbreaker/Prismatic/A2"))
}
observations.approachAreaCheck = "approached from the same starting point only when the known line would miss the route"

for (const mode of ["expiring", "lasting", "leaving"] as const) {
  const { battle, actor: paladin, events } = start([["paladin", [1, 3]]], undefined, "L")
  const { boss } = battle
  place(paladin, 600, 735)
  place(boss, 600, 640)
  boss.moveAt = Infinity
  boss.lastOrder = "charge"
  paladin.actionAt = Infinity
  paladin.shield = 400
  paladin.shieldUntil = mode === "lasting" ? 5 : .39
  if (mode === "leaving") paladin.move = { x: 600, y: 830 }
  advance(battle, .77)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === paladin.id)
  assert(hit && boss.lastOrder === "basic", mode)
  if (mode === "expiring") assert(hit.cast.issuedAt! > .39 && (hit.amount ?? 0) > 0)
  else assert(hit.cast.issuedAt! < .39 && (hit.amount ?? 0) === 0)
}
observations.pveShieldExpiry = "waited for an imminent opening in melee, kept the available attack against a lasting shield or a retreating player"

for (const flipped of [false, true]) for (const mode of ["ready", "cooling", "leaving", "in-range"] as const) {
  const allies: Member[] = [["bulwark"], ["binder", [0, 1]], ["ranger", [1, 0]]]
  const foes: Member[] = [["ranger", [1, 0]], ["warden", [0, 1]]]
  const { battle, events } = start(flipped ? foes : allies, flipped ? allies : foes, "L")
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [tank, binder, ranger] = team
  const [gun, warden] = enemies
  const ours = flipped ? battle.sparring! : battle
  const theirs = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(tank, at(392, 844))
  Object.assign(binder, at(712, mode === "in-range" ? 815 : 908))
  Object.assign(ranger, at(877, 817), { actionAt: mode === "cooling" ? 6 : 1.4 })
  Object.assign(gun, at(390, 490), { actionAt: .05 })
  Object.assign(warden, at(736, 528), { actionAt: 2.85 })
  theirs.moveAt = Infinity
  theirs.sharedAt = .05
  ours.sharedAt = 0
  if (mode === "leaving") {
    assert.equal(moveEdgeFighter(battle, ranger, at(895, 1000)), null)
    ours.sharedAt = ours.moveAt = 0
    events.length = 0
  }
  advance(battle, 4.65)
  const walks = events.filter(event => event.kind === "startMove" && team.some(unit => unit.id === event.cast.owner))
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === binder.id && event.target === warden.id && event.amount)
  assert(hit, mode)
  assert(walks[0], mode)
  if (mode === "ready") {
    assert.equal(walks[0].target, tank.id)
    assert(walks[0].landing && edgeDistance(walks[0].landing, at(736, 528)) < 290, "move the tank toward the shared fight")
    assert(events.some(event => event.kind === "hit" && event.cast.owner === ranger.id && event.target === warden.id && event.amount))
  } else if (mode === "in-range") {
    assert(hit.cast.issuedAt! < walks[0].cast.issuedAt!, "use the attack that already reaches")
  } else {
    assert.equal(walks[0].target, binder.id, "give the walk to the card that can open the fight now")
    assert(hit.cast.issuedAt! + 1e-6 >= walks[0].cast.issuedAt! + COOLDOWN.shared)
  }
  for (let i = 1; i < walks.length; i++) assert(walks[i].cast.issuedAt! + 1e-6 >= walks[i - 1].cast.issuedAt! + COOLDOWN.move)
}
observations.sharedAdvance = "chose an escorted fight, gave the move to the binder when the ranger could not follow, and used an available attack first"

for (const flipped of [false, true]) for (const mode of ["retreating", "alone", "closing"] as const) {
  const { battle, actor: ranger, events } = start([["ranger"], ["spellbreaker"]], undefined, "L")
  const { boss } = battle
  const [, breaker] = battle.team
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 500), { lastOrder: "charge", actionAt: .95 })
  Object.assign(ranger, at(615, 687))
  Object.assign(breaker, at(396, 669))
  if (mode !== "retreating") breaker.hp = 0
  assert.equal(moveEdgeFighter(battle, ranger, mode === "closing" ? at(640, 597) : at(825, 760)), null)
  advance(battle, 4.6)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === boss.id && event.amount)
  assert(hit?.cast.issuedAt !== undefined && hit.cast.issuedAt >= .95, mode)
  const walks = events.filter(event => event.kind === "startMove" && event.cast.owner === boss.id && event.cast.issuedAt! < hit.cast.issuedAt!)
  if (mode === "retreating") {
    assert.equal(hit.target, breaker.id)
    assert.equal(walks.length, 1)
    assert(hit.cast.issuedAt < 2.5)
  } else {
    assert.equal(hit.target, ranger.id)
    assert.equal(walks.length, mode === "closing" ? 0 : 2)
    if (mode === "alone") assert(walks[1].cast.issuedAt! >= walks[0].cast.issuedAt! + COOLDOWN.move)
  }
}
observations.pveApproachTarget = "took the one-walk target, led the last retreating player, or waited for a player already coming into range"

for (const flipped of [false, true]) for (const mode of ["returning", "cooling", "soon-ready", "covered"] as const) {
  const allies: Member[] = [["paladin", [1, 2]], ["spellbreaker", [0, 1]]]
  const foes: Member[] = [["paladin", [1, 2]]]
  const { battle, events } = start(flipped ? foes : allies, flipped ? allies : foes)
  const [team, rivals] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [guard, breaker] = team
  const [enemy] = rivals
  const ours = flipped ? battle.sparring! : battle
  const theirs = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(guard, at(521, 909), { hp: 1117, shield: 235, shieldUntil: 10, actionAt: 3.13 })
  Object.assign(breaker, at(404, 1000), { hp: 424, actionAt: mode === "soon-ready" ? 1.35 : 4.08 })
  Object.assign(enemy, at(634, 1230), { hp: 54, actionAt: mode === "cooling" ? 3.9 : 2.43 })
  if (mode === "covered") Object.assign(breaker, { shield: 320, shieldUntil: 8 })
  ours.sharedAt = theirs.sharedAt = 0
  assert.equal(moveEdgeFighter(battle, enemy, at(634, 1072)), null)
  const route = committedReturn(battle, enemy)
  assert(route)
  const path = (x: number, y: number) => {
    const landing = at(x, y)
    return { landing, stop: landing, arrival: edgeDistance(breaker, landing) / movementSpeed(battle, breaker) }
  }
  const exposed = returnCounterRisk(battle, breaker, enemy, route, theirs.sharedAt, path(523, 1084))
  const flank = returnCounterRisk(battle, breaker, enemy, route, theirs.sharedAt, path(542, 935))
  assert.equal(exposed > 60, mode === "returning", mode)
  assert.equal(flank, 0, mode)
  if (mode !== "returning") continue
  const ready = breaker.actionAt
  advance(battle, 4.75)
  const move = events.find(event => event.kind === "startMove" && event.target === breaker.id)
  assert(move?.landing && edgeDistance(move.landing, route.landing) > attackRange(battle, enemy, breaker) + 20)
  assert(move.cast.issuedAt! < route.arrival)
  assert(!events.some(event => event.target === breaker.id && event.kind === "hit" && event.cast.owner === enemy.id &&
    (event.amount ?? 0) > 0 && event.cast.issuedAt! < ready))
}
observations.returnCounter = "respected the returning card's real basic window, held a usable angle, and allowed approach when the reply was late or shielded"

{
  const { battle, actor } = start([["paladin"]])
  battle.boss.hp = 0
  Object.assign(actor, { x: 600, y: 1175 })
  assert.equal(moveEdgeFighter(battle, actor, { x: 600, y: 1040 }), null)
  advance(battle, .63)
  assert(!isOutside(actor) && actor.move)
  const route = committedReturn(battle, actor)
  assert(route)
  assert(edgeDistance(route.at(battle.time + .05), future(battle, actor, .05)) < .001)
}

for (const flipped of [false, true]) for (const mode of ["open", "fading", "warded", "ready", "stationary"] as const) {
  const { battle, actor: ranger, events } = start([["ranger", [1, 3]], ["spellbreaker"]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 1050))
  Object.assign(ranger, at(600, 1210), { hp: 54, actionAt: mode === "ready" ? 0 : 4 })
  battle.team[1].hp = 0
  if (mode !== "stationary") assert.equal(moveEdgeFighter(battle, ranger, at(600, 1070)), null)
  if (mode === "fading" || mode === "warded") {
    Object.assign(ranger, { shield: 250, shieldUntil: mode === "fading" ? .71 : 5 })
  }
  advance(battle, 3.18)
  const charge = events.find(event => event.kind === "charge" && event.cast.owner === boss.id)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === ranger.id)
  assert(hit, mode)
  assert.equal(!!charge, mode === "warded" || mode === "ready" || mode === "stationary", mode)
  if (mode === "warded") {
    assert.equal(hit.amount, 0)
    assert(events.some(event => event.kind === "exit" && event.target === ranger.id && event.cast.used.has("bossCharge")))
  } else {
    assert.equal(ranger.hp, 0)
    if (!charge) assert(hit.cast.order === "basic" && hit.cast.issuedAt! < 1 && hit.cast.issuedAt! >= (mode === "fading" ? .71 : 0))
  }
}
observations.pveReturnFinish = "intercepted a vulnerable returning card with a basic, waited out a short ward and kept the charge for the other openings"

for (const flipped of [false, true]) for (const mode of ["on-tip", "past-tip", "cooling"] as const) {
  const paladin: Member[] = [["paladin", [1, 2]]]
  const assassin: Member[] = [["assassin"]]
  const { battle, events } = start(flipped ? assassin : paladin, flipped ? paladin : assassin)
  const caster = flipped ? battle.sparring!.rivals[0] : battle.team[0]
  const target = flipped ? battle.team[0] : battle.sparring!.rivals[0]
  const attack = flipped ? battle.sparring! : battle
  const defense = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(caster, at(640, 680))
  Object.assign(target, at(752, 680), { hp: Math.round(target.maxHp * .21), actionAt: Infinity })
  attack.sharedAt = defense.sharedAt = 0
  if (mode === "cooling") defense.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, caster, "skill", null, at(mode === "past-tip" ? 751 : 752, 680)), null)
  attack.sharedAt = Infinity
  advance(battle, .75)
  assert.equal(events.some(event => event.kind === "startMove" && event.target === target.id), mode === "on-tip", mode)
  assert.equal(events.some(event => event.kind === "hit" && event.cast.owner === caster.id && event.target === target.id),
    mode === "cooling", mode)
}
observations.lineTipDodge = "matched the real hit boundary, dodged a line ending on the card and kept the move one pixel beyond it"

for (const flipped of [false, true]) for (const mode of ["spend", "walking", "cooling", "idle", "basic", "riposte", "two-hits", "pending-ward"] as const) {
  const ourCards = cards([["paladin", [1, 2]]], "Prismatic")
  const theirCards = cards([["bulwark", [0, 1]], ["spellbreaker", mode === "spend" ? [0, 1] : [2, 4]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? theirCards : ourCards, flipped ? ourCards : theirCards)
  const [actor] = flipped ? battle.sparring!.rivals : battle.team
  const [patient, partner] = flipped ? battle.team : battle.sparring!.rivals
  const attack = flipped ? battle.sparring! : battle
  const defense = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.sparring!.first = flipped ? "enemy" : "ally"
  Object.assign(actor, at(550, 670), { hp: mode === "riposte" ? 110 : 800, shield: mode === "riposte" ? 0 : 133, shieldUntil: 9 })
  Object.assign(patient, at(564, mode === "basic" ? 757 : 850), { hp: mode === "pending-ward" ? 45 : 17, actionAt: 4 })
  const partnerAt = mode === "riposte" ? at(450, 670) : mode === "two-hits" ? at(557, 815) :
    mode === "pending-ward" ? at(730, 740) : at(850, 776)
  Object.assign(partner, partnerAt, { actionAt: mode === "pending-ward" ? 0 : .69 })
  if (mode === "two-hits" || mode === "pending-ward") partner.hp = mode === "two-hits" ? 40 : 90
  attack.moveAt = Infinity
  if (mode === "cooling") defense.moveAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  if (mode === "walking") assert.equal(moveEdgeFighter(battle, patient, at(560, 920)), null)
  if (mode === "pending-ward") assert.equal(issueEdgeOrder(battle, partner, "skill", patient), null)
  if (mode === "idle") {
    // The first ready decision already passed without using the shared action.
    battle.nextThinkAt = 1.18
  }
  const intent = chooseAiAttack(battle, actor, [actor], [patient, partner])
  assert(intent)
  assert.equal(waitForClearFinish(battle, { actor, intent }, [patient, partner], true),
    mode === "spend" || mode === "idle" ? "wait" : undefined, mode)
  advance(battle, mode === "idle" ? 1.28 : 1.45)
  const cast = events.find(event => event.kind === "cast" && event.cast.owner === actor.id)
  const deaths = events.filter(event => event.kind === "death" && event.cast.owner === actor.id)
  if (mode === "spend") {
    const release = events.find(event => event.cast.owner === partner.id && (event.kind === "startMove" || event.kind === "cast"))
    assert(release && cast && release.cast.issuedAt! <= cast.cast.issuedAt! && cast.cast.issuedAt! > SPARRING_STEP)
    assert(deaths.some(event => event.target === patient.id && event.cast.id === cast.cast.id))
  } else if (mode === "pending-ward") {
    assert(events.some(event => event.kind === "shield" && event.target === patient.id && event.cast.owner === partner.id))
    assert(deaths.some(event => event.target === partner.id))
    assert.equal(patient.hp, 45)
  } else if (mode === "basic") {
    assert(deaths.some(event => event.target === patient.id && event.cast.order === "basic" && event.cast.issuedAt === SPARRING_STEP))
  } else if (mode === "idle") {
    assert(cast && cast.cast.issuedAt! < 1.22, "attack even if the other side never spends its ready turn")
  } else {
    assert.equal(cast?.cast.issuedAt, SPARRING_STEP, mode)
    if (mode !== "riposte") assert.equal(deaths.length, mode === "two-hits" ? 2 : 1, mode)
  }
}
observations.finishAccess = "took guaranteed and multi-target finishes, answered spent movement, aimed away from pending aid and bounded the wait"

for (const flipped of [false, true]) for (const mode of ["counter", "late", "thin", "healthy", "ready-foe", "missed-foe"] as const) {
  const { battle, events } = start([["paladin", [1, 2]]], [["paladin", [1, 2]]])
  const [actor, enemy] = flipped ? [battle.sparring!.rivals[0], battle.team[0]] : [battle.team[0], battle.sparring!.rivals[0]]
  const ours = flipped ? battle.sparring! : battle
  const theirs = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(actor, at(554, 800))
  Object.assign(enemy, at(728, 580))
  battle.nextThinkAt = Infinity
  ours.sharedAt = theirs.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, at(448, 910)), null)
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, at(844, 435)), null)
  advance(battle, .85)
  assert(actor.shield && enemy.shield, "both wards come from real casts")
  actor.hp = mode === "healthy" ? actor.maxHp : 650
  enemy.hp = 900
  if (mode === "thin") enemy.shield = 12
  actor.actionAt = ours.sharedAt = 0
  ours.moveAt = theirs.moveAt = Infinity
  const enemyReady = mode === "ready-foe" ? battle.time + 1.0 : 0
  enemy.actionAt = enemyReady
  theirs.sharedAt = 0
  if (mode === "counter" || mode === "late" || mode === "healthy") {
    assert.equal(issueEdgeOrder(battle, enemy, "skill", null, at(554, 800)), null)
    if (mode === "late") advance(battle, battle.time + .16)
  }
  if (mode !== "ready-foe" && mode !== "missed-foe") theirs.sharedAt = Infinity
  if (mode === "missed-foe") battle.sparring!.first = flipped ? "enemy" : "ally"
  const startAt = battle.time
  battle.nextThinkAt = startAt
  advance(battle, startAt + 1.3)
  const response = events.find(event => event.kind === "cast" && event.cast.owner === actor.id && event.cast.issuedAt! >= startAt)
  if (mode === "ready-foe") {
    assert(!response || response.cast.issuedAt! >= enemyReady, "leave the ready turn for an actual response")
  } else if (mode === "counter") {
    assert.equal(response?.cast.skill?.name, "并肩启誓")
    assert(events.some(event => event.kind === "heal" && event.cast === response?.cast && (event.amount ?? 0) > 100))
    assert(events.some(event => event.kind === "hit" && event.cast === response?.cast && event.target === enemy.id &&
      (event.absorbed ?? 0) + (event.amount ?? 0) > 40))
  } else {
    assert.equal(response?.cast.skill?.name, "破晓横线", mode)
    if (mode === "thin") assert(events.some(event => event.kind === "hit" && event.cast === response?.cast && (event.amount ?? 0) > 100))
    if (mode === "missed-foe") assert(response.cast.issuedAt! <= startAt + SPARRING_STEP * 1.01)
  }
}
observations.shieldExchangeCounter = "responded to a confirmed hit on time, kept the line when late or into a thin ward, and stopped waiting on an idle foe"

for (const flipped of [false, true]) for (const mode of ["heals", "no-heal-needed", "caught", "quick", "waiting", "no-reply", "exposed"] as const) {
  const { battle, events } = start([["paladin", [1, 2]]], [["paladin", [1, 2]]])
  const sparring = battle.sparring!
  const [actor, enemy] = flipped ? [sparring.rivals[0], battle.team[0]] : [battle.team[0], sparring.rivals[0]]
  const ours = flipped ? sparring : battle
  const theirs = flipped ? battle : sparring
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(actor, at(500, 685))
  Object.assign(enemy, at(595, 685))
  battle.nextThinkAt = Infinity
  ours.sharedAt = theirs.sharedAt = 0
  if (mode === "heals" || mode === "no-heal-needed" || mode === "exposed") battle.time = 255
  const issuedAt = battle.time
  assert.equal(issueEdgeOrder(battle, actor, "skill", enemy, at(780, 685)), null)
  advance(battle, issuedAt + .20)
  if (mode !== "caught") assert.equal(moveEdgeFighter(battle, enemy, at(595, 768)), null)
  advance(battle, issuedAt + 5.10)
  assert.equal(events.some(event => event.kind === "hit" && event.cast.owner === actor.id && event.target === enemy.id), mode === "caught")
  Object.assign(actor, at(540, 700), { hp: mode === "no-heal-needed" ? actor.maxHp : mode === "waiting" || mode === "no-reply" ? 550 : 54,
    shield: mode === "waiting" || mode === "no-reply" || mode === "quick" ? 235 : 88, shieldUntil: battle.time + 4, actionAt: battle.time })
  assert(battle.runtime.shieldCasts.has(actor.id))
  Object.assign(enemy, at(635, 700),
    { hp: 760, shield: mode === "quick" ? 0 : 235, shieldUntil: battle.time + 4, actionAt: battle.time + .74 })
  ours.sharedAt = theirs.sharedAt = 0
  ours.moveAt = Infinity
  theirs.moveAt = 0
  if (mode === "waiting") ours.moveAt = battle.time + .85
  if (mode === "exposed") enemy.attack = actor.attack * 1.55
  if (mode === "no-reply") {
    enemy.actives = [enemy.pool.active[0], enemy.pool.active[2]]
    enemy.range = 70
  }
  const startAt = battle.time
  battle.nextThinkAt = startAt
  advance(battle, startAt + (mode === "waiting" ? .43 : .68))
  const order = sparring.actions.find(action => action.actorId === actor.id && action.time >= startAt)
  if (mode === "waiting") assert.equal(order, undefined)
  else if (mode === "quick") assert.equal(order?.name, "普攻")
  else if (mode === "heals") {
    assert.equal(order?.name, "并肩启誓")
    assert(events.some(event => event.kind === "heal" && event.cast.owner === actor.id && event.cast.issuedAt! > startAt && (event.amount ?? 0) >= 40))
  } else assert.equal(order?.name, "破晓横线", mode)
}
observations.shieldAfterSidestep = "answered a recorded sidestep with safe healing, an immediate hit or a bounded wait; retained the line when defense or tempo required it"

for (const flipped of [false, true]) for (const cooling of [false, true]) {
  const { battle, events } = start([["paladin", [1, 2]]], [["paladin", [1, 2]]])
  const [actor, enemy] = flipped ? [battle.sparring!.rivals[0], battle.team[0]] : [battle.team[0], battle.sparring!.rivals[0]]
  const ours = flipped ? battle.sparring! : battle
  const theirs = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(actor, at(744, 287))
  Object.assign(enemy, at(577, 286))
  ours.sharedAt = theirs.sharedAt = 0
  battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, at(577, 395)), null)
  advance(battle, .7)
  assert(enemy.shield > 0)
  if (cooling) ours.moveAt = Infinity
  theirs.moveAt = Infinity
  const startAt = battle.time
  battle.nextThinkAt = startAt
  advance(battle, startAt + 2.3)
  const shove = events.find(event => event.kind === "exit" && event.cast.owner === actor.id && event.target === enemy.id)
  const movement = events.find(event => event.kind === "startMove" && event.target === actor.id)
  assert.equal(!!shove, !cooling, JSON.stringify({ flipped, cooling, actions: battle.sparring!.actions }))
  assert.equal(!!movement, !cooling, JSON.stringify({ flipped, cooling, actions: battle.sparring!.actions }))
  if (shove && movement) assert(shove.cast.issuedAt! + 1e-6 >= movement.cast.issuedAt! + COOLDOWN.shared)
}
observations.shieldExchangeAngle = "moved to a real outward shove before the warded foe could act, respected movement and shared cooldowns"

for (const flipped of [false, true]) for (const mode of ["open", "warded", "finish", "protect"] as const) {
  const allies: Member[] = [["warden", [2, 4]], ["ranger"]]
  const opponents: Member[] = [["bulwark", [0, 1]], ["healer"]]
  const { battle, events } = start(flipped ? opponents : allies, flipped ? allies : opponents, "L")
  const [team, foes] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [warden, partner] = team
  const [tank, medic] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(warden, at(608, 829))
  Object.assign(tank, at(730, 700), { hp: mode === "finish" ? 50 : 400, shield: mode === "finish" ? 0 : 500, shieldUntil: 10 })
  Object.assign(medic, at(846, 816), { hp: 500, shield: mode === "warded" ? 450 : 0, shieldUntil: 10 })
  if (mode === "open") tank.passiveAt[BULWARK_COVER.id] = 2
  Object.assign(partner, mode === "protect" ? at(669, 765) : at(460, 974), { actionAt: Infinity, hp: 100 })
  battle.sharedAt = flipped ? Infinity : 0
  battle.sparring!.sharedAt = flipped ? 0 : Infinity
  advance(battle, .85)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === warden.id && event.cast.skill?.id === "warden/L/A3")
  assert.equal(hit?.target, mode === "open" ? medic.id : tank.id,
    JSON.stringify({ flipped, mode, actions: battle.sparring!.actions }))
  if (mode === "open") assert((hit?.amount ?? 0) > 100)
  if (mode === "finish") assert.equal(tank.hp, 0)
  if (mode === "protect") assert(events.some(event => event.kind === "shield" && event.cast === hit?.cast && event.target === partner.id))
}
observations.shieldedAreaRedirect = "redirected a blocked line to an exposed healer, preserving a finish or a useful allied ward"

for (const flipped of [false, true]) for (const warded of [false, true]) {
  const ranger: Member[] = [["ranger", [1, 3]]]
  const paladin: Member[] = [["paladin", [1, 2]]]
  const { battle, events } = start(flipped ? paladin : ranger, flipped ? ranger : paladin)
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const [actor, enemy] = flipped ? [battle.sparring!.rivals[0], battle.team[0]] : [battle.team[0], battle.sparring!.rivals[0]]
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(actor, at(567, 726), { hp: Math.round(actor.maxHp * .48) })
  Object.assign(enemy, at(674, 649), { hp: 132, actionAt: 1.4 })
  ours.sharedAt = theirs.sharedAt = 0
  if (warded) {
    Object.assign(enemy, { shield: 110, shieldUntil: 10 })
    theirs.moveAt = 2
  }
  const hits = () => events.filter(event => event.kind === "hit" && event.cast.owner === actor.id &&
    event.cast.skill?.id === "ranger/Prismatic/A4" && event.target === enemy.id)
  advance(battle, .32)
  assert.equal(hits().length, 1, JSON.stringify({ flipped, warded, actions: battle.sparring!.actions }))
  assert.equal(enemy.hp === 0, !warded)
  if (warded) {
    assert.equal(hits()[0].absorbed, 110)
    advance(battle, 1.2)
    assert.equal(hits().length, 2)
    assert.equal(enemy.hp, 0)
  }
}
observations.reflectedArrowFinish = "finished the exposed card with the first circle, kept both contacts when a ward required the echo"

for (const flipped of [false, true]) for (const mode of ["finish", "ward", "moving", "keep", "relocate"] as const) {
  const ourCards = cards([["summoner", [0, 1]]], "Prismatic")
  const theirCards = cards([["bard", [0, 1]], ["paladin", [2, 4]]], "Radiant")
  const battle = createEdgeBattle(flipped ? theirCards : ourCards, flipped ? ourCards : theirCards)
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const [actor] = flipped ? battle.sparring!.rivals : battle.team
  const [patient, guard] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const near = mode === "finish" || mode === "ward"
  Object.assign(actor, near ? at(256, 867) : at(541, 713))
  Object.assign(patient, near ? at(243, 1097) : at(861, 713), { hp: 44, actionAt: Infinity })
  Object.assign(guard, near ? at(432, 1087) : at(927, 866), { actionAt: Infinity })
  battle.phase = "running"
  ours.moveAt = theirs.moveAt = Infinity
  theirs.sharedAt = Infinity
  if (mode === "ward") Object.assign(patient, { shield: 220, shieldUntil: 4 })
  if (near) assert.equal(basicCanFinish(battle, actor, patient), mode === "finish")
  if (mode === "moving") patient.move = at(978, 911)
  if (mode === "keep" || mode === "relocate") {
    assert.equal(issueEdgeOrder(battle, actor, "skill", null, at(775, 713)), null)
    const [body] = battle.runtime.summons[0].deployment.bodies
    body.actionsAt[0] = .19
    Object.assign(patient, mode === "keep" ? { x: body.x, y: body.y } : at(925, 575))
    ours.sharedAt = actor.actionAt = 0
  }
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  advance(battle, .75)
  const down = events.find(event => event.kind === "death" && event.target === patient.id)
  if (mode === "ward") assert.equal(down, undefined)
  else {
    assert.equal(down?.cast.owner, actor.id, JSON.stringify({ flipped, mode, actions: battle.sparring!.actions }))
    assert.equal(down.cast.order, mode === "finish" ? "basic" : "skill")
  }
  const casts = battle.sparring!.actions.filter(action => action.actorId === actor.id && action.name === "星兽合奏")
  if (mode === "keep") assert.equal(casts.length, 1)
  if (mode === "relocate") assert.equal(casts.length, 2)
}
observations.ensembleContact = "took a ready basic finish, led the moving target, kept an impending pulse and relocated stale beasts"

for (const flipped of [false, true]) for (const mode of ["open", "warded", "cooling", "deep", "destroyed"] as const) {
  const ourCards = cards([["summoner", [0, 1]]], "Prismatic")
  const theirCards = cards([["spellbreaker", [0, 1]], ["healer", [0, 1]]], "Radiant")
  const battle = createEdgeBattle(flipped ? theirCards : ourCards, flipped ? ourCards : theirCards)
  const [summoner] = flipped ? battle.sparring!.rivals : battle.team
  const [patient, healer] = flipped ? battle.team : battle.sparring!.rivals
  const defense = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(summoner, at(760, 920))
  Object.assign(healer, at(920, 823), { actionAt: Infinity })
  battle.phase = "running"
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(608, 650)), null)
  const [beast] = battle.runtime.summons[0].deployment.bodies
  const offset = mode === "deep" ? 25 : 110
  Object.assign(patient, { x: beast.x + (flipped ? -offset : offset), y: beast.y, hp: 70, actionAt: Infinity })
  if (mode === "warded") Object.assign(patient, { shield: 250, shieldUntil: 5 })
  if (mode === "cooling") defense.moveAt = Infinity
  if (mode === "destroyed") beast.hp = 0
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  advance(battle, .82)
  const hit = events.find(event => event.kind === "hit" && event.target === patient.id && event.cast.skill?.deployment === "ensemble")
  assert.equal(events.some(event => event.kind === "startMove" && event.target === patient.id), mode === "open", mode)
  assert.equal(!!hit, mode === "warded" || mode === "cooling" || mode === "deep", mode)
  assert.equal(patient.hp === 0, mode === "cooling" || mode === "deep", mode)
}
observations.ensembleEscape = "left a live attack circle before its pulse and kept movement for a covered, unreachable, or destroyed pulse"

for (const flipped of [false, true]) for (const mode of ["live", "destroyed", "spent", "pve"] as const) {
  const attackers = cards([["ranger", [1, 0]], ["summoner", [0, 1]]], "Prismatic")
  const defenders = cards([["warlock", [2, 4]], ["paladin", [1, 2]]], "Prismatic")
  const pve = mode === "pve"
  const battle = pve ? createEdgeBattle(attackers) : flipped ? createEdgeBattle(defenders, attackers) : createEdgeBattle(attackers, defenders)
  const offense = !pve && flipped ? battle.sparring! : battle
  const [ranger, summoner] = !pve && flipped ? battle.sparring!.rivals : battle.team
  const patient = pve ? battle.boss : flipped ? battle.team[0] : battle.sparring!.rivals[0]
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  Object.assign(ranger, at(688, 1012), { attack: 280 })
  Object.assign(summoner, at(777, 836))
  Object.assign(patient, at(613, 428), { hp: 150, speed: 179, actionAt: 3 })
  if (!pve) Object.assign(flipped ? battle.team[1] : battle.sparring!.rivals[1], at(848, 356), { actionAt: Infinity })
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(715, 454)), null)
  const [beast, , ram] = battle.runtime.summons[0].deployment.bodies
  beast.actionsAt[0] = 30
  Object.assign(ram, at(470, 335))
  ram.actionsAt[2] = mode === "spent" ? 4.9 : .56
  if (mode === "destroyed") ram.hp = 0
  offense.sharedAt = ranger.actionAt = 0
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, patient), null)
  offense.moveAt = offense.sharedAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, .97)
  const move = events.find(event => event.kind === "startMove" && event.target === patient.id)
  const home = at(613, 428)
  assert(move?.landing && (move.landing.x - home.x) * (flipped ? -1 : 1) * (mode === "live" || pve ? 1 : -1) > 40, mode)
  assert.equal(patient.hp, 150, mode)
  assert(!events.some(event => event.kind === "shove" && event.target === patient.id), mode)
}
observations.lineAndRam = "escaped the arrow on the side clear of the active ram in sparring and PvE, with destroyed and cooling controls"

for (const flipped of [false, true]) for (const warded of [false, true]) {
  const { battle, actor: summoner, events } = start([["summoner", [0, 1]]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(summoner, at(760, 920))
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(608, 650)), null)
  const [beast] = battle.runtime.summons[0].deployment.bodies
  Object.assign(boss, { x: beast.x + (flipped ? -121 : 121), y: beast.y, hp: 73, actionAt: Infinity })
  if (warded) Object.assign(boss, { shield: 250, shieldUntil: 5 })
  advance(battle, .8)
  assert.equal(boss.hp, 73)
  assert.equal(events.some(event => event.kind === "startMove" && event.target === boss.id), !warded)
  const hit = events.find(event => event.kind === "hit" && event.target === boss.id && event.cast.skill?.deployment === "ensemble")
  assert.equal(!!hit, warded)
  if (warded) assert((hit?.absorbed ?? 0) > 0)
}
observations.pveEnsembleEscape = "stepped out of the attack beast's first pulse when exposed and absorbed it under a sufficient ward"

for (const flipped of [false, true]) for (const mode of ["finish", "warded", "cooling", "another", "far"] as const) {
  const team: Member[] = [["summoner", [0, 1]]]
  if (mode === "another") team.push(["ranger"])
  const { battle, actor: summoner, events } = start(team)
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const sign = flipped ? -1 : 1
  Object.assign(summoner, at(760, 920))
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(608, 650)), null)
  const [beast] = battle.runtime.summons[0].deployment.bodies
  Object.assign(boss, { x: beast.x + sign * 121, y: beast.y, hp: 73 })
  Object.assign(summoner, { x: boss.x + sign * (mode === "far" ? 132 : 75), y: boss.y, hp: 26 })
  if (mode === "warded") Object.assign(summoner, { shield: 250, shieldUntil: 5 })
  if (mode === "cooling") boss.actionAt = Infinity
  if (mode === "another") Object.assign(battle.team[1], at(780, 1030), { actionAt: Infinity })
  assert.equal(announcedStrikes(battle, boss).length, 0)
  advance(battle, .8)
  const down = events.find(event => event.kind === "death" && event.target === summoner.id)
  assert.equal(battle.phase === "lost", mode === "finish", mode)
  assert.equal(down?.cast.order, mode === "finish" ? "basic" : undefined, mode)
  assert.equal(events.some(event => event.kind === "startMove" && event.target === boss.id), mode !== "finish", mode)
  assert.equal(boss.hp, 73, mode)
}
observations.pveEnsembleFinish = "finished the last summoner before the pulse with a legal lethal basic and dodged if the hit would not win"

for (const flipped of [false, true]) for (const mode of ["ejected", "warded-ejection", "inside", "intercepted", "miss"] as const) {
  const { battle, actor: paladin, events } = start([["paladin", [1, 2]], ["healer", [2, 4]]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const y = mode === "inside" || mode === "intercepted" ? 410 : mode === "warded-ejection" ? 330 : 286
  Object.assign(boss, at(608, y), { hp: 350, moveAt: Infinity })
  if (mode === "warded-ejection") Object.assign(boss, { shield: 500, shieldUntil: 10 })
  Object.assign(paladin, at(mode === "miss" ? 719 : 608, y + 190))
  const spread = mode === "inside" ? 63 : 7
  Object.assign(battle.team[1], at(608 + spread, y + 90))
  assert.equal(issueEdgeOrder(battle, paladin, "skill", null, at(mode === "miss" ? 815 : 608, y)), null)
  advance(battle, .72)
  const exits = mode === "ejected" || mode === "warded-ejection"
  assert.equal(events.some(event => event.kind === "charge" && event.cast.owner === boss.id), !exits && mode !== "intercepted", mode)
  assert.equal(events.some(event => event.kind === "exit" && event.target === boss.id), exits, mode)
  if (exits || mode === "intercepted") {
    assert(events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.cast.order === "basic"))
  }
}
observations.pveChargeCommitment = "took the basic before ejection or a scheduled ward and charged into an exposed lane"

for (const flipped of [false, true]) for (const mode of ["open", "warded", "cooling", "closed"] as const) {
  const team = cards([["dancer", [3, 1]], ["healer"]], "Prismatic")
  const foes = cards([["summoner", [1, 2]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? foes : team, flipped ? team : foes)
  const [dancer, medic] = flipped ? battle.sparring!.rivals : battle.team
  const [summoner] = flipped ? battle.team : battle.sparring!.rivals
  const defending = flipped ? battle.sparring! : battle
  const attacking = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(summoner, at(572, 427))
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(645, 492)), null)
  const [entry, exit] = battle.runtime.summons[0].deployment.bodies.toSorted((a, b) => edgeDistance(a, summoner) - edgeDistance(b, summoner))
  const out = portalExit(entry, exit, 43)
  const stand = along(out, direction(entry, out), attackRange(battle, summoner, dancer) - 60)
  const events: SkillEvent[] = []
  let dodgeAt = Infinity
  battle.onSkillEvent = event => {
    events.push({ ...event })
    if (event.kind === "startMove" && event.target === dancer.id) dodgeAt = Math.min(dodgeAt, battle.time)
  }
  Object.assign(dancer, stand, { hp: 66, actionAt: Infinity })
  Object.assign(medic, at(1006, 1100), { actionAt: Infinity })
  if (mode === "warded") Object.assign(dancer, { shield: 260, shieldUntil: 4 })
  if (mode === "cooling") defending.moveAt = Infinity
  if (mode === "closed") exit.hp = 0
  advance(battle, 1.01)
  Object.assign(summoner, along(entry, direction(out, entry), 134), { actionAt: battle.time + .9 })
  assert(edgeDistance(summoner, dancer) > attackRange(battle, summoner, dancer))
  assert.equal(moveEdgeFighter(battle, summoner, entry), null)
  assert.equal(!!dodgePortalFollowUp(battle, dancer, [summoner]), mode === "open", mode)
  battle.nextThinkAt = battle.time
  const early = battle.time + .76
  advance(battle, battle.time + 1.43)
  if (mode === "open" || mode === "cooling") assert.equal(dodgeAt < early, mode === "open", mode)
  assert.equal(events.some(event => event.target === summoner.id && event.style === "portal"), mode !== "closed", mode)
  assert.equal(dancer.hp === 0, mode === "cooling", mode)
  assert(attacking.sharedAt >= COOLDOWN.shared)
}
observations.portalAmbush = "read a live portal walk on either side, with ward, cooldown and broken gate controls"

for (const flipped of [false, true]) for (const mode of ["walk", "area-reply", "shielded", "cooling", "broken"] as const) {
  const defenders = cards([["warlock"], ["healer"]], "Prismatic")
  const attackers = cards([["summoner", [1, 2]], ["assassin", [0, mode === "area-reply" ? 2 : 4]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const defense = flipped ? battle.sparring! : battle
  const offense = flipped ? battle : battle.sparring!
  const [patient, healer] = flipped ? battle.sparring!.rivals : battle.team
  const [summoner, assassin] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(summoner, at(572, 427))
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(645, 492)), null)
  const [entry, exit] = battle.runtime.summons[0].deployment.bodies
    .toSorted((a, b) => edgeDistance(a, summoner) - edgeDistance(b, summoner))
  const out = portalExit(entry, exit, 43)
  const reach = activeFor(assassin, "skill").aim.range
  const stand = along(out, direction(entry, out), reach - 76)
  Object.assign(patient, stand, { hp: 92, actionAt: Infinity })
  Object.assign(healer, at(970, 1100), { actionAt: Infinity })
  if (mode === "shielded") Object.assign(patient, { shield: 560, shieldUntil: 5 })
  if (mode === "cooling") defense.moveAt = Infinity
  if (mode === "broken") exit.hp = 0
  advance(battle, 1.01)
  Object.assign(assassin, along(entry, direction(out, entry), 126), { actionAt: 0 })
  assert(edgeDistance(assassin, patient) > reach)
  assert.equal(moveEdgeFighter(battle, assassin, entry), null)
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  assert.equal(!!dodgePortalFollowUp(battle, patient, [assassin]), mode === "walk", mode)
  battle.nextThinkAt = battle.time
  advance(battle, 2.86)
  const dodged = events.some(event => event.kind === "startMove" && event.target === patient.id)
  assert.equal(dodged, mode === "walk", mode)
  const passage = events.findIndex(event => event.target === assassin.id && event.style === "portal")
  assert.equal(passage >= 0, mode !== "broken", mode)
  const hits = events.filter(event => event.kind === "hit" && event.target === patient.id)
  if (mode === "walk") {
    assert(events.findIndex(event => event.kind === "startMove" && event.target === patient.id) < passage)
    assert.equal(hits.length, 0)
  }
  if (mode === "cooling") assert.equal(hits.find(event => event.amount)?.cast.skill?.id, "assassin/Prismatic/A1")
  assert.equal(patient.hp === 0, mode === "cooling" || mode === "area-reply", mode)
  assert(offense.sharedAt >= COOLDOWN.shared)
}
observations.portalBoundaryBlades = "tested a retreat from the gate exit against both the blade and its area alternative, with cooldown, shield and broken gate controls"

for (const flipped of [false, true]) for (const mode of ["approaching", "uncommitted", "warded", "too-late", "no-lethal-reach", "area-reply"] as const) {
  const defenders = cards([["spellbreaker", [0, 1]], ["warlock"]], "Prismatic")
  const attackers = cards([["summoner", [1, 2]], ["assassin", [0, mode === "area-reply" ? 2 : 4]], ["warden"], ["berserker"]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const defense = flipped ? battle.sparring! : battle
  const offense = flipped ? battle : battle.sparring!
  const [breaker, patient] = flipped ? battle.sparring!.rivals : battle.team
  const rivals = flipped ? battle.team : battle.sparring!.rivals
  const [summoner, assassin, warden, berserker] = rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(breaker, at(670, 1065))
  Object.assign(summoner, at(380, 330))
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(380, 680)), null)
  const group = battle.runtime.summons[0]
  const [incoming, outgoing] = group.deployment.bodies.toSorted((a, b) => edgeDistance(a, at(275, 680)) - edgeDistance(b, at(275, 680)))
  const out = portalExit(incoming, outgoing, 43)
  Object.assign(patient, mode === "no-lethal-reach" ? at(920, 1060) : at(650, 934), { hp: 154, actionAt: Infinity })
  Object.assign(warden, at(420, 325), { actionAt: Infinity })
  Object.assign(berserker, at(488, 298), { actionAt: Infinity })
  if (mode === "warded") Object.assign(patient, { shield: 560, shieldUntil: 8 })
  defense.moveAt = Infinity
  advance(battle, 1.01)
  Object.assign(assassin, at(295, mode === "too-late" ? 606 : 501), { actionAt: 0 })
  if (mode !== "too-late") assassin.speed = 168
  assert(edgeDistance(out, patient) < activeFor(assassin, "skill").aim.range || mode === "no-lethal-reach")
  assert(edgeDistance(incoming, patient) > activeFor(assassin, "skill").aim.range)
  if (mode === "uncommitted") offense.moveAt = battle.time + .52
  else {
    const landing = mode === "too-late" ? incoming : along(incoming, direction(assassin, incoming), 24)
    assert.equal(moveEdgeFighter(battle, assassin, landing), null)
  }
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  battle.nextThinkAt = battle.time
  if (mode === "uncommitted") {
    advance(battle, offense.moveAt)
    assert.equal(moveEdgeFighter(battle, assassin, along(incoming, direction(incoming, assassin), 30)), null)
  }
  advance(battle, 4)
  const shouldErase = mode === "approaching" || mode === "uncommitted"
  const erase = events.find(event => event.kind === "remove" && event.cast.owner === breaker.id)
  const fell = events.find(event => event.kind === "death" && event.target === patient.id)
  const passage = events.find(event => event.target === assassin.id && event.style === "portal")
  assert.equal(!!erase, shouldErase, mode)
  if (shouldErase) assert(!passage && !fell, mode)
  if (mode === "too-late") assert(passage && fell, mode)
}
observations.portalDispelRescue = "cleared either endpoint ahead of a lethal gate-assisted lock, including an unused route and a viable area reply control"

for (const flipped of [false, true]) for (const mode of ["open", "broken", "cooling", "no-walk", "caught", "exit-in-reach"] as const) {
  const { battle, actor: summoner, events } = start([["summoner", [1, 2]], ["ranger"]])
  const { boss, team: [, ranger] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(summoner, at(600, 830))
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(600, 650)), null)
  const [first, second] = battle.runtime.summons[0].deployment.bodies
  const [entry, exit] = edgeDistance(first, at(705, 650)) < edgeDistance(second, at(705, 650)) ? [first, second] : [second, first]
  const out = portalExit(entry, exit, 43)
  Object.assign(ranger, along(entry, direction(exit, entry), 80), { hp: 51 })
  if (mode === "broken") exit.hp = 0
  if (mode === "cooling") first.actionAt = 1.6
  if (mode !== "no-walk") {
    battle.sharedAt = 0
    assert.equal(moveEdgeFighter(battle, ranger, entry), null)
  }
  const origin = mode === "caught" ? at(800, 728) : mode === "exit-in-reach" ? at(465, 447) : at(790, 432)
  Object.assign(boss, origin, { hp: 1400, moveAt: Infinity })
  advance(battle, 3.8)
  const charge = events.find(event => event.kind === "charge" && event.cast.owner === boss.id)
  assert.equal(!!charge, mode !== "open" && mode !== "caught", mode)
  if (mode === "exit-in-reach") assert.deepEqual(charge?.cast.aim, out)
  assert.equal(events.some(event => event.style === "portal" && event.target === ranger.id),
    mode === "open" || mode === "exit-in-reach", mode)
  const defeat = events.find(event => event.kind === "death" && event.target === ranger.id)
  assert.equal(defeat?.cast.order, mode === "open" ? undefined : mode === "caught" ? "basic" : "enemy", mode)
}
observations.pvePortalCharge = "read the committed traversal when aiming the charge, including a reachable exit and a basic before transit"

for (const flipped of [false, true]) for (const mode of ["closing", "standing", "passing", "warded", "ward-fades", "second-target"] as const) {
  const { battle, actor: ranger, events } = start([["ranger", [1, 3]], ["binder"]])
  const { boss, team: [, binder] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 540), { hp: mode === "closing" ? 75 : boss.maxHp })
  Object.assign(ranger, at(600, 760), { hp: 51 })
  Object.assign(binder, at(622, 800), { hp: mode === "second-target" ? binder.maxHp : 0, actionAt: 5 })
  if (mode === "warded" || mode === "ward-fades") {
    Object.assign(ranger, { shield: 430, shieldUntil: mode === "ward-fades" ? .62 : 5 })
  }
  if (mode !== "standing") {
    const destination = mode === "passing" ? at(758, 743) : at(600, 624)
    assert.equal(moveEdgeFighter(battle, ranger, destination), null)
  }
  advance(battle, .9)
  if (mode === "closing" && ranger.hp) assert.equal(issueEdgeOrder(battle, ranger, "basic", boss), null)
  advance(battle, 3.2)
  const charge = events.some(event => event.kind === "charge" && event.cast.owner === boss.id)
  const hit = events.find(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === ranger.id)
  assert.equal(charge, mode === "standing" || mode === "passing" || mode === "second-target", mode)
  assert.equal(hit?.cast.order, charge ? "enemy" : "basic", mode)
  assert.equal(ranger.hp, mode === "warded" ? 51 : 0, mode)
  if (mode === "closing") assert.equal(boss.hp, 75)
  if (mode === "second-target") {
    assert(events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.target === binder.id))
  }
}
observations.pveClosingIntercept = "took the lethal basic inside the player's movement cooldown and kept the charge for a passing or second target"

for (const flipped of [false, true]) for (const mode of ["break", "approach", "flank", "cooling", "out-of-reach", "finish"] as const) {
  const { battle, actor: summoner, events } = start([["summoner", [2, 4]], ["ranger"]], undefined, "R")
  const { boss, team: [, ranger] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const canMove = mode === "approach" || mode === "flank"
  Object.assign(boss, at(600, 530), { hp: 1500, moveAt: canMove ? 0 : Infinity })
  Object.assign(summoner, at(625, mode === "flank" ? 855 : 740))
  Object.assign(ranger, at(600, mode === "finish" ? 620 : mode === "flank" ? 850 : 742), { hp: 46 })
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(600, mode === "out-of-reach" ? 641 : mode === "flank" ? 625 : 579)), null)
  const [doll] = battle.runtime.summons[0].deployment.bodies
  if (!canMove) doll.hp = 24
  if (mode === "cooling") doll.actionsAt[0] = 1.32
  advance(battle, mode === "flank" ? 5.8 : 3.3)
  assert(!events.some(event => event.kind === "interrupt" && event.target === boss.id), mode)
  const charge = mode === "cooling" || mode === "out-of-reach" || mode === "flank"
  assert.equal(events.some(event => event.kind === "charge" && event.cast.owner === boss.id), charge, mode)
  const move = events.find(event => event.kind === "startMove" && event.target === boss.id)
  assert.equal(!!move, canMove, mode)
  if (mode === "flank") assert(move?.landing && edgeDistance(move.landing, doll) > 105)
  const first = events.find(event => event.kind === "hit" && event.cast.owner === boss.id)
  assert.equal(first?.target, mode === "break" ? doll.id : charge ? summoner.id : ranger.id, mode)
  if (mode === "break") {
    assert.equal(doll.hp, 0)
    advance(battle, 9.2)
    assert(events.some(event => event.kind === "charge" && event.cast.owner === boss.id))
  } else assert.equal(ranger.hp, 0, mode)
}
observations.pveArmedAmbush = "broke an interrupting doll, approached in melee if durable, and charged normally when the trap could not fire"

for (const mode of ["open", "warded", "interrupted"] as const) {
  const { battle, actor: caster, events } = start([["lifebringer", [4, 0]], ["ranger"]])
  const { boss } = battle
  Object.assign(caster, { x: 720, y: 675 })
  Object.assign(battle.team[1], { x: 920, y: 1000 })
  Object.assign(boss, { x: 724, y: 570, hp: 61, actionAt: Infinity })
  if (mode === "warded") Object.assign(boss, { shield: 480, shieldUntil: 4 })
  assert.equal(issueEdgeOrder(battle, caster, "skill", null, { x: 600, y: 570 }), null)
  if (mode === "interrupted") forceTo(battle, caster, { x: 724, y: 675 }, .05)
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
  const [hit] = announcedStrikes(battle, boss, undefined, position)
  assert(hit && "area" in hit.strike && areaHits(hit.strike.area, boss))
  assert.equal(announcedHit(battle, hit, boss, boss, position)?.lethal, mode === "interrupted" ? undefined : mode === "open")
  advance(battle, .64)
  assert.equal(events.some(event => event.kind === "startMove" && event.target === boss.id), mode === "open", mode)
  assert.equal(events.some(event => event.kind === "hit" && event.cast.skill?.id === "lifebringer/Prismatic/A5"), mode === "warded", mode)
  assert.equal(boss.hp, 61, mode)
}
observations.pveStarbranch = "left a real starbranch circle and kept movement when a ward or displacement made it safe"

for (const flipped of [false, true]) for (const mode of ["open", "warded", "ready", "no-partner"] as const) {
  const team = cards([["warden", [2, 4]], ["healer"]], "Prismatic")
  const foes = cards([["healer", [2, 4]], ["paladin"]], "Radiant")
  const battle = createEdgeBattle(flipped ? foes : team, flipped ? team : foes)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const [warden, partner] = allies
  const [patient, paladin] = flipped ? battle.team : battle.sparring!.rivals
  const attack = flipped ? battle.sparring! : battle
  const defense = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.time = 20
  defense.moveAt = Infinity
  Object.assign(warden, at(716, 555))
  Object.assign(partner, at(777, 540), { actionAt: Infinity })
  Object.assign(patient, at(737, FIELD.top - 5), { hp: 106, actionAt: battle.time + (mode === "ready" ? .70 : 1.67) })
  Object.assign(paladin, at(980, 562), { actionAt: Infinity })
  const track = history(battle, patient)
  track.pushAt = battle.time - 2
  track.pushBy = warden.id
  positionUnit(battle, patient, at(737, 296))
  const basic = estimateDirectHit(battle, warden, patient, 1, "basic", patient, battle.time + 1.2).hpLoss
  patient.hp = basic + 1
  if (mode === "warded") Object.assign(patient, { shield: 200, shieldUntil: battle.time + 3 })
  if (mode === "no-partner") Object.assign(partner, at(295, 800))
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  const route = followUpApproach(battle, allies, [patient], (actor, target, point, range) => {
    if (actor !== warden || range === undefined) return
    const stop = along(point, direction(target, actor), range)
    return { point: stop, stop, arrival: battle.time + edgeDistance(actor, stop) / actor.speed }
  })
  assert.equal(!!route, mode === "open", mode)
  advance(battle, battle.time + 1.75)
  if (mode === "open") {
    const death = events.find(event => event.kind === "death" && event.target === patient.id)
    assert.equal(death?.cast.skill?.id, "warden/Prismatic/A5", JSON.stringify({ flipped, actions: battle.sparring!.actions }))
    const orders = battle.sparring!.actions.filter(action => action.actorId === warden.id)
    assert.equal(orders[0]?.name, "移动")
    assert(orders[1].time - orders[0].time >= COOLDOWN.shared && attack.moveAt >= orders[0].time + COOLDOWN.move)
  }
}
observations.returnSwapFinish = "closed a real post-return window using an in-range partner, with ward, healing deadline and missing partner controls"

for (const mode of ["recent", "expired", "weak", "blocked-route"] as const) {
  const { battle, actor: dancer, opponents: [hammer], events } = start([["dancer", [2, 1]], ["healer"]], [["warden", [3, 2]]])
  const patient = battle.team[1]
  battle.time = 3
  battle.moveAt = Infinity
  Object.assign(dancer, { x: 910, y: 930 })
  Object.assign(patient, { x: 722, y: 691, maxHp: 600, hp: 30, actionAt: Infinity })
  Object.assign(hammer, { x: 612, y: 420, attack: 182 })
  battle.sparring!.sharedAt = battle.time
  const track = history(battle, patient)
  track.positions = mode === "weak" ? [] : [{ time: mode === "expired" ? 1.26 : 2.6, at: { x: mode === "blocked-route" ? 550 : 900, y: 691 } }]
  assert.equal(issueEdgeOrder(battle, hammer, "skill", null, { x: 565, y: 691 }), null)
  if (mode === "expired") patient.hp = 132
  const rescue = rescueFromAnnouncedStrike(battle, battle.team)
  assert.equal(rescue?.intent.target?.id, mode === "recent" || mode === "expired" ? patient.id : undefined, mode)
  if (mode === "weak" || mode === "blocked-route") battle.sharedAt = Infinity
  advance(battle, 4.05)
  assert.equal(patient.hp === 0, mode === "weak" || mode === "blocked-route", mode)
  assert.equal(events.some(event => event.kind === "dash" && event.target === patient.id && event.cast.skill?.id === "dancer/Prismatic/A3"), mode === "recent", mode)
  assert.equal(events.some(event => event.kind === "shield" && event.target === patient.id && event.cast.skill?.id === "dancer/Prismatic/A3"), mode === "recent" || mode === "expired", mode)
}
observations.dancerRewindRescue = "escaped via recent footprints or applied a stationary shield before the hit after the footprints expired"

for (const flipped of [false, true]) for (const priority of ["front", "back", "warded"] as const) {
  const lower = cards([["ranger", [1, 0]]], "Prismatic")
  const upper = cards([["dancer"], ["warlock"]], "Prismatic")
  const battle = createEdgeBattle(flipped ? upper : lower, flipped ? lower : upper)
  const attacker = flipped ? battle.sparring!.rivals[0] : battle.team[0]
  const defending = flipped ? battle : battle.sparring!
  const [dancer, warlock] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.sparring!.first = flipped ? "ally" : "enemy"
  Object.assign(attacker, at(608, 1064))
  Object.assign(dancer, at(610, 530), { hp: priority === "front" ? 85 : 490, actionAt: Infinity })
  Object.assign(warlock, at(606, 702), { hp: priority === "front" ? 440 : 172, actionAt: Infinity })
  if (priority === "warded") Object.assign(warlock, { shield: 370, shieldUntil: 3 })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  advance(battle, .7)
  const expected = priority === "back" ? warlock : dancer
  assert(events.some(event => event.cast.skill?.id === "ranger/Prismatic/A2" && event.kind === "hit" && event.target !== expected.id))
  assert.equal(events.find(event => event.kind === "startMove")?.target, expected.id, JSON.stringify({ flipped, priority, actions: battle.sparring!.actions }))
  assert(expected.hp > 0 && defending.moveAt > COOLDOWN.move && defending.sharedAt > .7)
}
observations.sharedEscapePriority = "compared both cards on the announced line before spending the one shared move, with mirrored position and a shield control"

for (const survives of [false, true]) {
  const { battle, actor: ranger, opponents: [near, far], events } = start([["ranger", [1, 0]]], [["warden"], ["healer"]])
  place(ranger, 600, 365)
  place(near, 600, 480, survives ? 1 : .02)
  place(far, 600, 885)
  battle.sparring!.moveAt = Infinity
  battle.nextThinkAt = Infinity
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, { x: 600, y: 950 }), null)
  const contact = announcedStrikes(battle, near)[0]
  const expected = survives ? near : far
  assert(announcedShift(battle, contact, expected, unit => unit))
  assert.equal(announcedShift(battle, contact, survives ? far : near, unit => unit), undefined)
  advance(battle, .87)
  assert.equal(events.find(event => event.kind === "push" && event.cast.skill?.id === "ranger/Prismatic/A2")?.target, expected.id)
}
observations.longChordPushTarget = "forecast the real surviving displacement target of the line instead of moving every hit card"

for (const flipped of [false, true]) for (const mode of ["live", "broken", "move-cooling", "shared-cooling", "spread"] as const) {
  const attack = cards([["summoner", [1, 2]], ["ranger", [1, 3]]], "Prismatic")
  const defense = cards([["dancer", [2, 3]], ["warlock"]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attack : defense, flipped ? defense : attack)
  const attacking = flipped ? battle : battle.sparring!
  const defending = flipped ? battle.sparring! : battle
  const attackers = flipped ? battle.team : battle.sparring!.rivals
  const defenders = flipped ? battle.sparring!.rivals : battle.team
  const [summoner, ranger] = attackers
  const [dancer, warlock] = defenders
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(summoner, at(844, 475))
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(844, 282)), null)
  const [entry, exit] = battle.runtime.summons[0].deployment.bodies.toSorted((a, b) =>
    edgeDistance(a, at(949, 282)) - edgeDistance(b, at(949, 282)))
  Object.assign(ranger, along(entry, direction(at(949, 200), entry), 186))
  advance(battle, 1.01)
  assert.equal(moveEdgeFighter(battle, ranger, entry), null)
  if (mode === "broken") exit.hp = 0
  if (mode === "move-cooling") defending.moveAt = Infinity
  if (mode === "shared-cooling") attacking.sharedAt += .7
  Object.assign(dancer, at(688, 1012))
  Object.assign(warlock, mode === "spread" ? at(480, 996) : at(665, 996))
  advance(battle, 1.82)
  assert(ranger.move)
  const route = sidestepBeforeEdgeLine(battle, defenders, attackers, false)
  assert.equal(route?.actor, mode === "live" ? dancer : undefined, `${flipped}/${mode}`)
  if (route) assert.equal(moveEdgeFighter(battle, route.actor, route.point), null)
  advance(battle, 2.07)
  assert.equal(events.some(event => event.target === ranger.id && event.style === "portal"), mode !== "broken")
  if (mode === "live" || mode === "move-cooling") {
    assert.equal(issueEdgeOrder(battle, ranger, "skill", null, warlock), null)
    advance(battle, 2.7)
    assert(events.some(event => event.kind === "hit" && event.cast.skill?.id === "ranger/Prismatic/A2" && event.target === warlock.id))
    assert.equal(events.some(event => event.kind === "exit" && event.target === dancer.id), mode === "move-cooling")
  }
}
observations.portalLineSidestep = "checked the ranged reply from a live gate exit, mirrored with broken gate, cooldown and split formation controls"

{
  const { battle, events } = start(
    [["warden", [1, 4]], ["summoner", [1, 2]], ["dancer", [2, 3]], ["warlock", [1, 4]]],
    [["warden", [0, 3]], ["spellbreaker"], ["ranger", [1, 3]], ["healer", [2, 4]]])
  const [, summoner, dancer, warlock] = battle.team
  battle.sparring!.sharedAt = 0
  advance(battle, 11.3)
  const opening = events.findIndex(event => event.kind === "cast" && event.cast.skill?.id === "ranger/Prismatic/A2"
    && event.cast.issuedAt > 7 && event.target === summoner.id)
  const movement = events.findIndex(event => event.kind === "startMove" && event.target === dancer.id && event.cast.issuedAt > 7)
  const recovery = events.findIndex(event => event.kind === "heal" && event.target === dancer.id && event.cast.skill?.id === "dancer/Prismatic/A4")
  const protect = events.findIndex(event => event.kind === "shield" && event.target === warlock.id && event.cast.skill?.id === "dancer/Prismatic/A3")
  assert(movement >= 0 && opening > movement && recovery > opening && protect > recovery)
  assert(!events.slice(opening).some(event => event.kind === "hit" && event.target === dancer.id && event.cast.skill?.id === "ranger/Prismatic/A2"))
  assert(events.slice(protect).some(event => event.kind === "hit" && event.target === warlock.id &&
    event.cast.skill?.id === "spellbreaker/Prismatic/A1" && event.amount === 0 && event.absorbed))
  advance(battle, 17.85)
  const curtain = events.findIndex((event, index) => index > protect && event.kind === "shield" && event.target === warlock.id &&
    event.cast.skill?.id === "warlock/Prismatic/A5")
  assert(curtain > protect)
  assert(events.slice(curtain).some(event => event.kind === "hit" && event.target === warlock.id &&
    event.cast.skill?.id === "spellbreaker/Prismatic/A1" && event.amount === 0 && event.absorbed))
}
observations.edgeLineCover = "sidestepped the double hit, completed the marked heal and refreshed the spent ward before the next strike"

for (const flipped of [false, true]) for (const damaged of [false, true]) {
  const defense = cards([["warlock", [1, 4]], ["dancer"]], "Prismatic")
  const attack = cards([["spellbreaker"]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attack : defense, flipped ? defense : attack)
  const [mage, dancer] = flipped ? battle.sparring!.rivals : battle.team
  const breaker = (flipped ? battle.team : battle.sparring!.rivals)[0]
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(breaker, at(260, 279), { attack: 264 })
  Object.assign(mage, at(720, 930), { shield: 175, shieldUntil: 10 })
  Object.assign(dancer, at(798, 808))
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, damaged ? at(753, 880) : at(798, 755)), null)
  advance(battle, .7)
  const intent = chooseAiAttack(battle, mage, [mage, dancer], [breaker])
  assert.equal(intent?.order, "skill2", `${flipped}/${damaged}`)
  assert.equal(issueEdgeOrder(battle, mage, "skill2", null, intent?.at), null)
  advance(battle, 1.25)
  const wards = events.filter(event => event.kind === "shield" && event.cast.skill?.id === "warlock/Prismatic/A5")
  assert(wards.some(event => event.target === dancer.id))
  const wasReplaced = wards.some(event => event.target === mage.id)
  assert.equal(wasReplaced, damaged, `${flipped}/${damaged}`)
  if (damaged) {
    const lost = events.findIndex(event => event.kind === "hit" && event.target === mage.id && (event.absorbed ?? 0) > 100)
    assert(lost >= 0 && events.indexOf(wards.find(event => event.target === mage.id)!) > lost)
  } else assert.equal(mage.shield, 175)
}
observations.curtainWardRefresh = "scored the ward at release after the previous hit, with a mirror and intact-shield control"

for (const mode of ["live", "warded", "broken", "exposed"] as const) {
  const { battle, actor: summoner, opponents: [bard, warlock], events } = start([["summoner", [1, 0]], ["warlock"]],
    [["bard", [3, 1]], ["warlock", [0, 2]]])
  const patient = battle.team[1]
  Object.assign(summoner, { x: 440, y: 760 })
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, { x: 596, y: 760 }), null)
  const [rear, front] = battle.runtime.summons[0].deployment.bodies.toSorted((a, b) => b.y - a.y)
  const exit = portalExit(front, rear, 43)
  place(patient, front.x, front.y)
  Object.assign(patient, { hp: 67, actionAt: Infinity })
  Object.assign(bard, { x: front.x, y: front.y - 322 })
  Object.assign(warlock, mode === "exposed" ? { x: exit.x + 284, y: exit.y } : { x: 969, y: 335 })
  if (mode === "warded") Object.assign(patient, { shield: 350, shieldUntil: 4 })
  if (mode === "broken") rear.hp = 0
  battle.sparring!.sharedAt = battle.sharedAt = 0
  summoner.actionAt = Infinity
  assert.equal(issueEdgeOrder(battle, bard, "skill", null, front), null)
  if (mode === "exposed") {
    battle.sparring!.sharedAt = 0
    assert.equal(issueEdgeOrder(battle, warlock, "skill", null, exit), null)
  }
  const position = (unit: EdgeUnit, at: number) => future(battle, unit, at - battle.time)
  assert(announcedStrikes(battle, patient, undefined, position).some(({ strike }) => strike.cast.skill?.id === "bard/Prismatic/A4"))
  assert.equal(!!dodgeAreaDamage(battle, patient), mode === "live", mode)
  advance(battle, .67)
  assert.equal(events.some(event => event.style === "portal" && event.target === patient.id), mode === "live", mode)
  assert.equal(patient.hp > 0, mode === "live" || mode === "warded", mode)
}
observations.announcedPortalEscape = "used a live escape gate out of the spectrum circle and checked the real exit, the gate body and the existing ward"

for (const flipped of [false, true]) for (const field of ["outward", "clear", "inward"] as const) {
  const offense = cards([["binder", [0, 4]], ["spellbreaker", [1, 0]]], "Prismatic")
  const defense = cards([["healer", [2, 4]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(offense, defense) : createEdgeBattle(defense, offense)
  const sparring = battle.sparring!
  const [binder, breaker] = flipped ? battle.team : sparring.rivals
  const [patient] = flipped ? sparring.rivals : battle.team
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(binder, at(550, 555))
  Object.assign(breaker, at(729.92, 492.32), { attack: 235 })
  Object.assign(patient, at(400, 1010))
  const center = field === "inward" ? at(375, 735) : at(558.31, 843.54)
  assert.equal(issueEdgeOrder(battle, binder, "skill", null, center), null)
  advance(battle, .49)
  assert.equal(battle.runtime.fields.length, 1)
  if (field === "clear") battle.runtime.fields.length = 0
  Object.assign(patient, at(476.48, 781.69), { hp: 340 })
  const enemyClocks = flipped ? battle : sparring
  const ownClocks = flipped ? sparring : battle
  enemyClocks.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, at(368, 972)), null)
  advance(battle, .5 + 27.5 * SPARRING_STEP)
  const dodge = dodgeAreaDamage(battle, patient)
  assert.equal(!!dodge, field !== "outward", `${flipped}/${field}`)
  if (dodge) assert.equal(moveEdgeFighter(battle, patient, dodge.point), null)
  advance(battle, 1.2)
  assert.equal(patient.hp === 340, field !== "outward", `${flipped}/${field}`)
  assert.equal(ownClocks.moveAt === 0, field === "outward", `${flipped}/${field}`)
}
observations.gravityDiskEscape = "kept the shared move when the outward slow prevented a sidestep and cleared the line at normal speed"

{
  const { battle, events, opponents: [ranger] } = start(
    [["warden", [1, 4]], ["summoner", [1, 2]], ["dancer", [2, 3]], ["warlock", [1, 4]]],
    [["ranger", [0, 1]], ["warlock", [0, 2]], ["bard", [0, 3]], ["healer", [1, 4]]])
  const [, , dancer, warlock] = battle.team
  battle.sparring!.sharedAt = 0
  advance(battle, 15.3)
  const ward = events.findIndex(event => event.kind === "shield" && event.cast.owner === dancer.id
    && event.cast.skill?.id === "dancer/Prismatic/A3" && event.target === warlock.id)
  const counter = events.findIndex(event => event.kind === "death" && event.cast.owner === warlock.id
    && event.cast.skill?.id === "warlock/Prismatic/A2" && event.target === ranger.id)
  assert(ward >= 0 && counter > ward)
  assert(events.slice(ward, counter).some(event => event.kind === "hit" && event.target === warlock.id
    && event.cast.skill?.id === "warlock/Prismatic/A1" && event.absorbed))
}
observations.doorCounterattack = "kept the advancing warlock in range, shielded the imminent fault hit, and landed the next starfall"

{
  const { battle, events, opponents: [, assassin, ranger, summoner] } = start(
    [["warden", [1, 4]], ["summoner", [1, 2]], ["dancer", [2, 3]], ["warlock", [1, 4]]],
    [["warden", [0, 3]], ["assassin", [0, 2]], ["ranger", [1, 3]], ["summoner", [1, 0]]])
  const warlock = battle.team[3]
  battle.sparring!.sharedAt = 0
  advance(battle, 4.8)
  const run = events.findIndex(event => event.kind === "startMove" && event.target === warlock.id)
  const recovery = events.findIndex(event => event.kind === "heal" && event.cast.skill?.id === "dancer/Prismatic/A4"
    && event.target === warlock.id && (event.amount ?? 0) > 90)
  assert(run >= 0 && recovery > run)
  for (const enemy of [assassin, ranger, summoner]) {
    assert(events.slice(recovery).some(event => event.kind === "hit" && event.cast.owner === warlock.id
      && event.cast.skill?.id === "warlock/Prismatic/A2" && event.target === enemy.id))
  }
}
observations.openingHealingStep = "spent the first advance on the caster who finished the marked walk, healed, and hit the three cards already gathered"

for (const mode of ["ring-edge", "ring-center", "warded", "fault", "fault-interrupted"] as const) {
  const ring = mode.startsWith("ring") || mode === "warded"
  const { battle, actor: caster, events } = start([["warlock", ring ? [1, 0] : [0, 2]]])
  const { boss } = battle
  place(caster, 715, 677)
  place(boss, mode === "ring-edge" || mode === "warded" ? 662 : 608, 596)
  boss.hp = 132
  boss.actionAt = Infinity
  if (mode === "warded") Object.assign(boss, { shield: 650, shieldUntil: 4 })
  assert.equal(issueEdgeOrder(battle, caster, "skill", null, { x: 608, y: 596 }), null)
  if (mode === "fault-interrupted") forceTo(battle, caster, { x: 758, y: 697 }, .36)
  if (mode === "fault") boss.moveAt = Infinity
  if (mode === "ring-edge" || mode === "ring-center") {
    advance(battle, .19)
    assert.equal(announcedStrikes(battle, boss).length, 2)
    boss.hp = announcedHit(battle, announcedStrikes(battle, boss)[0], boss, boss, unit => unit, boss.maxHp)!.hpLoss + 25
  }
  advance(battle, 1.17)
  const moved = events.some(event => event.target === boss.id && event.kind === "startMove")
  const hits = events.filter(event => event.target === boss.id && event.kind === "hit" && event.cast.owner === caster.id)
  assert.equal(moved, mode === "ring-edge", JSON.stringify({ mode, hp: boss.hp, hits: hits.map(hit => hit.amount) }))
  assert.equal(!!boss.hp, ["ring-edge", "warded", "fault-interrupted"].includes(mode), mode)
  if (mode === "ring-edge") assert.equal(hits.length, 1, "leave the lethal inner ring while taking the outer hit")
  if (mode === "fault-interrupted") assert.equal(hits.length, 0)
}
observations.pveAreaBeats = "survived the outer ring without taking the lethal inner hit, with center, ward and interrupted windup controls"

for (const flipped of [false, true]) for (const mode of ["ejected", "shielded", "inbounds", "no-ring", "melee", "interrupted"] as const) {
  const { battle, actor: caster, events } = start([["warlock", [1, 0]]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const y = mode === "inbounds" ? 428 : 302
  Object.assign(boss, at(608, y), { hp: 1000, moveAt: Infinity })
  Object.assign(caster, at(608, y + (mode === "melee" ? 98 : 223)), { hp: mode === "melee" ? 28 : 68 })
  if (mode === "shielded") Object.assign(boss, { shield: 800, shieldUntil: 5 })
  if (mode !== "no-ring") assert.equal(issueEdgeOrder(battle, caster, "skill", null, at(608, y + 81)), null)
  if (mode === "interrupted") forceTo(battle, caster, { x: caster.x + 8, y: caster.y }, .36)

  advance(battle, 3.5)
  const ejected = mode === "ejected" || mode === "shielded"
  assert.equal(events.some(event => event.kind === "charge" && event.cast.owner === boss.id), !ejected && mode !== "melee", mode)
  assert.equal(events.some(event => event.kind === "exit" && event.target === boss.id), ejected, mode)
  assert.equal(battle.phase, ejected ? "running" : "lost", mode)
  if (mode === "shielded") assert.equal(boss.hp, 1000)
  if (mode === "melee") assert.equal(boss.lastOrder, "basic")
}
observations.pveRingCharge = "forecast the visible windup and saved charge for an in-bounds finish even when a shield soaked the edge hit"

for (const flipped of [false, true]) for (const mode of ["hold", "shield", "dodge", "close-cut", "miss", "melee", "aborted", "ready"] as const) {
  const { battle, actor: assassin, events } = start([["assassin", [2, 4]]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const dodges = mode === "dodge" || mode === "close-cut"
  Object.assign(boss, at(608, 514), { hp: mode === "dodge" ? 150 : mode === "close-cut" ? 274 : 1020,
    moveAt: dodges ? 0 : Infinity })
  Object.assign(assassin, at(608, mode === "melee" ? 603 : 744), { hp: 52 })
  if (mode === "shield") Object.assign(boss, { shield: 1000, shieldUntil: 8 })
  const y = dodges ? 627 : 514
  if (mode !== "ready") assert.equal(issueEdgeOrder(battle, assassin, "skill", null, at(mode === "miss" ? 797 : 608, y)), null)
  if (mode === "aborted") forceTo(battle, assassin, at(620, 744), .42)
  const firstHp = boss.hp
  advance(battle, 1.21)
  const charge = events.find(event => event.kind === "charge" && event.cast.owner === boss.id)
  assert.equal(!!charge, !dodges && mode !== "melee", mode)
  const hit = events.findIndex(event => event.kind === "hit" && event.cast.owner === assassin.id)
  if (mode === "hold" || mode === "shield") assert(hit >= 0 && events.indexOf(charge!) > hit, mode)
  assert(!events.some(event => event.kind === "interrupt"))
  if (dodges) assert(boss.hp === firstHp && events.some(event => event.kind === "startMove" && event.target === boss.id), mode)
  advance(battle, 4)
  if (!dodges) assert.equal(battle.phase, "lost", mode)
}
observations.pveWindshear = "escaped a lethal forecast including the center cut, waited out the interrupt, and acted through a miss or cancelled release"

for (const flipped of [false, true]) for (const mode of ["lip", "cooling", "locked", "interruptible", "shielded", "hit", "finish", "aborted"] as const) {
  const { battle, actor: assassin, events } = start([["assassin", [0, 2]], ["healer", [1, 4]], ["summoner", [1, 2]]])
  const { boss, team: [, medic, summoner] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const lip = mode === "lip" || mode === "cooling" || mode === "locked"
  const melee = mode === "hit" || mode === "finish"
  Object.assign(boss, at(600, lip ? 811 : 620), {
    hp: mode === "interruptible" ? 410 : 255, moveAt: lip && mode !== "cooling" ? 0 : Infinity,
  })
  Object.assign(assassin, at(600, lip ? 425 : melee ? 694 : 850), {
    hp: mode === "finish" ? 38 : mode === "hit" ? 140 : assassin.maxHp, attack: 156,
  })
  Object.assign(medic, at(lip ? 600 : 620, lip ? 944 : 875), { hp: mode === "finish" ? 0 : 45 })
  if (melee) summoner.hp = 0
  if (mode === "shielded") Object.assign(boss, { shield: 600, shieldUntil: 5 })
  assert.equal(issueEdgeOrder(battle, assassin, "skill", boss), null)
  if (mode === "locked") battle.nextThinkAt = .24
  if (mode === "aborted") assassin.hp = 0
  advance(battle, 1.15)
  assert.equal(events.some(event => event.kind === "charge" && event.cast.owner === "boss"), mode === "aborted", mode)
  assert.equal(boss.hp, { lip: 255, cooling: 0, locked: 0, interruptible: 123, shielded: 255, hit: 255, finish: 255, aborted: 255 }[mode], mode)
  const bossHits = events.filter(event => event.kind === "hit" && event.cast.owner === "boss")
  assert.equal(bossHits[0]?.target, mode === "lip" ? medic.id : melee ? assassin.id : undefined, mode)
  if (mode === "hit") assert(assassin.hp > 0 && assassin.hp < 140)
  if (mode === "lip") assert.equal(medic.hp, 0)
  assert.equal(battle.phase, mode === "finish" ? "lost" : mode === "cooling" || mode === "locked" ? "won" : "running", mode)
}
observations.pveLockedBlades = "escaped the lock and followed with a basic, interrupted the release in melee, and charged through an aborted cast"

for (const flipped of [false, true]) for (const mode of ["counter", "alternate", "shielded", "late"] as const) {
  const { battle, actor: assassin, events } = start([["assassin", [0, 2]], ["healer", [1, 4]], ["ranger"]])
  const { boss, team: [, medic, unused] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 400), {
    hp: 230, actionAt: mode === "alternate" ? .47 : 0,
    shield: mode === "shielded" ? 440 : 0, shieldUntil: mode === "shielded" ? 5 : 0,
  })
  Object.assign(assassin, at(mode === "alternate" ? 470 : 600, 812),
    { attack: 156, actionAt: mode === "late" ? 2.4 : .04 })
  Object.assign(medic, at(760, 620), { hp: mode === "alternate" ? 46 : 0, actionAt: Infinity })
  unused.hp = 0
  let struck = false
  while (battle.time < 2.3 && battle.phase === "running") {
    if (!struck && battle.time >= .09) struck = issueEdgeOrder(battle, assassin, "skill", boss) === null
    stepEdgeBattle(battle, SPARRING_STEP)
  }
  assert.equal(boss.hp, 230, mode)
  assert.equal(battle.phase, "running")
  assert.equal(struck, mode === "shielded", mode)
  assert.equal(events.some(event => event.kind === "startMove" && event.target === boss.id), mode !== "counter", mode)
  assert.equal(events.some(event => event.kind === "death" && event.cast.owner === boss.id && event.target === medic.id), mode === "alternate", mode)
}
observations.pveApproachAgainstLock = "stayed out of a reachable player counter or took the safe flank to land a finishing basic"

for (const flipped of [false, true]) for (const mode of ["hammer", "reflection", "shield", "late", "one-card"] as const) {
  const { battle, actor, events } = start([
    mode === "reflection" ? ["ranger", [3, 0]] : ["warden", [3, 1]], ["healer", [1, 4]], ["ranger"],
  ])
  const { boss, team: [, medic, unused] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 390), {
    hp: 135, actionAt: .46, shield: mode === "shield" ? 360 : 0, shieldUntil: mode === "shield" ? 4.5 : 0,
  })
  Object.assign(actor, at(540, mode === "reflection" ? 1045 : 1030), {
    attack: 235, actionAt: mode === "late" ? 2.5 : .07,
  })
  Object.assign(medic, at(790, 520), { hp: mode === "one-card" ? 0 : 43, actionAt: Infinity })
  unused.hp = 0
  let issued = false
  while (battle.phase === "running" && battle.time < 2.35) {
    if (!issued && battle.time > .09) {
      const landing = future(battle, boss, .58)
      const distance = edgeDistance(actor, landing)
      const range = actor.actives[0].aim.range
      const radius = actor.actives[0].steps[0].selector.size[0]
      const aim = distance >= range ? along(actor, direction(actor, landing), range - .1) : landing
      if (distance < range + radius - 1) issued = issueEdgeOrder(battle, actor, "skill", null, aim) === null
    }
    stepEdgeBattle(battle, SPARRING_STEP)
  }
  assert.equal(boss.hp, 135, mode)
  assert.equal(issued, mode === "shield", mode)
  assert.equal(events.some(event => event.kind === "startMove" && event.target === boss.id), mode !== "one-card", mode)
  assert.equal(events.some(event => event.kind === "death" && event.target === medic.id && event.cast.owner === boss.id),
    mode !== "shield" && mode !== "one-card", mode)
  if (mode === "shield") assert(events.some(event => event.kind === "hit" && event.target === boss.id && event.absorbed))
}
observations.pveApproachAgainstArea = "flanked a ready hammer or arcing arrow to land a basic, with shield, cooldown and no safe route controls"

for (const flipped of [false, true]) for (const mode of ["early-line", "charge-counter", "late-line", "shielded"] as const) {
  const { battle, actor: warlock, events } = start([["warlock", [2, 0]], ["healer", [1, 4]]])
  const { boss, team: [, healer] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 390), { hp: 135, actionAt: .46 })
  Object.assign(warlock, at(540, 1030), { attack: 235, actionAt: mode === "late-line" ? 2.8 : .07 })
  Object.assign(healer, at(790, 520), { hp: 43, actionAt: Infinity })
  if (mode === "shielded") Object.assign(boss, { shield: 510, shieldUntil: 6 })
  const reach = warlock.actives[0].steps[0].selector.size[0]
  let issued = false
  let firstMove = Infinity
  const capture = battle.onSkillEvent!
  battle.onSkillEvent = event => {
    capture(event)
    if (event.kind === "startMove" && event.target === boss.id) firstMove = Math.min(firstMove, battle.time)
  }
  while (battle.phase === "running" && battle.time < 4.8) {
    if (!issued && battle.time > .1 && (mode !== "charge-counter" || battle.telegraph)) {
      const aim = future(battle, boss, .58)
      if (edgeDistance(warlock, aim) <= reach) issued = issueEdgeOrder(battle, warlock, "skill", null, aim) === null
    }
    stepEdgeBattle(battle, SPARRING_STEP)
  }
  const cautious = mode === "early-line" || mode === "charge-counter"
  assert.equal(firstMove > .1, cautious, mode)
  assert.equal(issued, mode !== "charge-counter", mode)
  assert.equal(boss.hp, 135, mode)
  const knockout = events.find(event => event.kind === "death" && event.target === healer.id)
  assert.equal(knockout?.cast.order, cautious ? "enemy" : "basic", mode)
}
observations.pveChargeAgainstLine = "saved movement for a fixed line or flanked before charging against a held line, with shield and cooldown controls"

for (const flipped of [false, true]) for (const mode of ["last-step", "safe-later", "move-cooling", "win"] as const) {
  const { battle, actor: warden, events } = start([["warden", [0, 3]], ["healer", [1, 4]]])
  const { boss, team: [, medic] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const x = mode === "safe-later" ? 468 : 481
  battle.nextThinkAt = 15 * SPARRING_STEP
  Object.assign(boss, at(x, 870), { hp: 51, actionAt: mode === "win" ? .16 : .8, sharedAt: 11 * SPARRING_STEP,
    moveAt: mode === "move-cooling" ? 2 : 0 })
  Object.assign(warden, at(620, 631), { attack: 235 })
  Object.assign(medic, at(827, 870), { hp: mode === "win" ? 0 : 43, actionAt: Infinity })
  assert.equal(issueEdgeOrder(battle, warden, "skill2", null, at(620, 870)), null)
  if (mode === "win") Object.assign(warden, at(x, 801), { hp: 17 })
  const moves: number[] = []
  battle.onSkillEvent = event => {
    events.push({ ...event })
    if (event.kind === "startMove" && event.target === boss.id) moves.push(battle.time)
  }
  advance(battle, .62)
  assert.equal(boss.hp, mode === "move-cooling" ? 0 : 51, mode)
  assert.equal(moves.length, mode === "last-step" || mode === "safe-later" ? 1 : 0, mode)
  if (moves.length) assert.equal(moves[0] < 15 * SPARRING_STEP, mode === "last-step", mode)
  if (mode === "win") {
    assert.equal(battle.phase, "lost")
    assert(events.some(event => event.kind === "death" && event.cast.owner === boss.id && event.cast.order === "basic"))
  }
}
observations.pveDodgeOnCooldown = "used a narrow escape before the next decision and took an immediate ending basic when available"

for (const flipped of [false, true]) for (const mode of ["announced", "already-moving", "move-cooling", "warded"] as const) {
  const { battle, actor: mage, events } = start([["warlock", [2, 4]], ["healer"]])
  const { boss, team: [, medic] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.nextThinkAt = .84
  Object.assign(mage, at(600, 1100), { attack: 230 })
  Object.assign(medic, at(652, 530), { hp: 45, actionAt: Infinity })
  Object.assign(boss, at(600, 490), { hp: 51, actionAt: .15, moveAt: mode === "move-cooling" ? 2 : 0,
    shield: mode === "warded" ? 640 : 0, shieldUntil: 5 })
  advance(battle, .249)
  const aim = at(mode === "already-moving" ? 540 : 600, 490)
  if (mode === "already-moving") boss.move = at(818, 490)
  assert.equal(issueEdgeOrder(battle, mage, "skill", null, aim), null)
  advance(battle, 1.14)
  assert.equal(boss.hp, mode === "move-cooling" ? 0 : 51, mode)
  const dodge = events.find(event => event.kind === "startMove" && event.target === boss.id)
  assert.equal(!!dodge, mode === "announced", mode)
  if (mode === "warded") assert(events.some(event => event.kind === "hit" && event.target === boss.id && event.absorbed))
}
observations.pveEarlyHorizonCut = "read the declared line during windup, kept a safe route or used protection where available"

for (const flipped of [false, true]) for (const mode of ["tip", "center", "ward", "cooling", "outside", "finish", "live"] as const) {
  const { battle, actor: warden, events } = start([["warden", [1, 3]]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const center = mode === "finish" ? 774 : 684
  Object.assign(warden, at(608, 930))
  assert.equal(issueEdgeOrder(battle, warden, "skill", null, at(608, center)), null)
  const offset = mode === "center" ? 0 : mode === "outside" ? -185 : mode === "finish" ? 95 : -121
  Object.assign(boss, at(608, center + offset), { hp: 30, actionAt: mode === "finish" ? 0 : 6 })
  if (mode === "ward") Object.assign(boss, { shield: 300, shieldUntil: 5 })
  if (mode === "cooling" || mode === "live") boss.moveAt = mode === "cooling" ? 4 : .85
  if (mode === "finish") warden.hp = 12

  advance(battle, 1.7)
  const hit = events.find(event => event.target === boss.id && event.kind === "hit")
  const walk = events.find(event => event.target === boss.id && event.kind === "startMove")
  assert.equal(!!boss.hp, ["tip", "ward", "outside", "finish"].includes(mode), mode)
  assert.equal(!!hit, ["center", "ward", "cooling", "live"].includes(mode), mode)
  assert.equal(!!walk, ["tip", "ward", "outside"].includes(mode), mode)
  if (mode === "ward") assert(hit?.absorbed)
  if (mode === "finish") assert.equal(battle.phase, "lost")
}
observations.pveClosingField = "escaped a reachable end of the closing walls, waited outside, and took a winning basic or held under protection"

for (const flipped of [false, true]) for (const warded of [false, true]) {
  const pursuer = cards([["paladin", [1, 2]]], "Prismatic")
  const survivor = cards([["bard", [3, 1]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? survivor : pursuer, flipped ? pursuer : survivor)
  const [paladin] = flipped ? battle.sparring!.rivals : battle.team
  const [bard] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.sparring!.first = flipped ? "enemy" : "ally"
  Object.assign(paladin, at(335, 529), { hp: 397, shield: 107, shieldUntil: 7 })
  Object.assign(bard, at(386, 474), { hp: 31, actionAt: .61 })
  if (warded) Object.assign(bard, { shield: 140, shieldUntil: 4 })
  assert.equal(basicCanFinish(battle, paladin, bard), !warded)
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push({ ...event })
  advance(battle, .74)
  if (!warded) {
    assert.equal(events.find(event => event.kind === "death" && event.target === bard.id)?.cast.order, "basic")
    assert(!events.some(event => event.kind === "startMove" && event.target === bard.id))
  } else assert(bard.hp > 0)
}
observations.meleeDuelFinish = "took the immediate melee finish against a mobile survivor and respected an active shield"

for (const flipped of [false, true]) for (const mode of ["escape", "one-warded", "spread", "four-hit", "four-warded", "cooling"] as const) {
  const ourCards = cards([["warlock", [1, 0]], ["summoner", [0, 2]], ["dancer", [0, 3]]], "Prismatic")
  const otherCards = cards([["ranger", [1, 0]], ["warden", [0, 1]], ["healer", [0, 1]], ["binder", [0, 1]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? otherCards : ourCards, flipped ? ourCards : otherCards)
  battle.phase = "running"
  const sparring = battle.sparring!
  const ours = flipped ? "enemy" : "ally"
  const [mage, summoner, dancer] = flipped ? sparring.rivals : battle.team
  const [bow, tank, healer, binder] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const grouped = mode === "four-hit" || mode === "four-warded"
  Object.assign(mage, at(770, 985))
  Object.assign(summoner, at(600, 852), { hp: 34, actionAt: Infinity })
  Object.assign(dancer, at(mode === "spread" ? 797 : 598, 1030), { hp: 34, actionAt: Infinity })
  Object.assign(bow, at(600, 488), { actionAt: mode === "cooling" ? Infinity : 0 })
  Object.assign(tank, at(532, grouped ? 550 : 315), { actionAt: Infinity })
  Object.assign(healer, at(640, grouped ? 542 : 324), { actionAt: Infinity })
  Object.assign(binder, at(690, grouped ? 555 : 309), { actionAt: Infinity })
  if (mode === "one-warded") Object.assign(dancer, { shield: 600, shieldUntil: 6 })
  if (mode === "four-warded") for (const unit of [tank, healer, binder]) Object.assign(unit, { shield: 600, shieldUntil: 6 })
  Object.assign(flipped ? battle : sparring, { sharedAt: .23, moveAt: Infinity })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, .88)
  const first = sparring.actions.find(action => action.side === ours)
  const reserved = mode === "escape" || mode === "four-warded"
  assert.equal(first?.name, reserved ? "移动" : "落星环", mode)
  if (reserved) {
    assert(first && first.time > .23 && first.time < .28, mode)
    assert.equal([summoner, dancer].filter(unit => unit.hp > 0).length, 1, mode)
  } else if (mode === "four-hit") {
    assert.equal(impact(events, "warlock/Prismatic/A2", "hit"), 4)
    assert(!summoner.hp && !dancer.hp)
  }
}
observations.lineExchange = "kept movement for an imminent double finish in both turn orders, with spread, shields, cooldown and profitable four-card hits"

for (const flipped of [false, true]) for (const mode of ["circle-then-line", "warded", "ward-in-time", "ward-too-late",
  "line-cooling", "opener-cooling", "same-caster", "unavoidable", "finish"] as const) {
  const defenders = cards([["warlock", [2, 4]], mode === "finish" ? ["bulwark", [1, 3]] : ["spellbreaker", [0, 1]]], "Prismatic")
  const attackers = cards([["assassin", [0, 2]], ["ranger", mode === "same-caster" ? [2, 1] : [1, 0]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const defense = flipped ? battle.sparring! : battle
  const offense = flipped ? battle : battle.sparring!
  const [patient, breaker] = flipped ? battle.sparring!.rivals : battle.team
  const [assassin, ranger] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.sparring!.first = flipped ? "enemy" : "ally"
  Object.assign(patient, at(620, 850), { hp: 420, actionAt: 2.2 })
  Object.assign(breaker, mode === "finish" ? at(800, 930) : at(610, 916), { actionAt: mode === "finish" ? 0 : .5 })
  Object.assign(assassin, mode === "finish" ? at(835, 960) : at(690, 367), {
    attack: 178, hp: mode === "finish" ? 12 : assassin.hp,
    actionAt: mode === "finish" || mode === "same-caster" || mode === "opener-cooling" ? 4.4 : .24,
  })
  Object.assign(ranger, at(600, 330), { attack: 206, actionAt: mode === "line-cooling" ? 3.1 : mode === "finish" ? .1 : 1.16 })
  if (mode !== "finish") offense.sharedAt = .28
  if (mode === "warded") Object.assign(patient, { shield: 260, shieldUntil: 5 })
  if (mode === "unavoidable") patient.speed = 42
  if (mode === "finish") Object.assign(patient, { hp: 93, actionAt: .85 })
  offense.moveAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  const home = { x: patient.x, y: patient.y }
  const after = at(645, 880)
  if (mode === "ward-in-time" || mode === "ward-too-late") {
    const ward = { at: mode === "ward-in-time" ? 1.3 : 2.5, shield: 400, shieldUntil: 6 }
    assert.equal(!!sharedDodgeWindow(battle, [patient, breaker], [assassin, ranger], "move", false,
      { actor: patient, landing: after, stop: after, arrival: edgeDistance(home, after) / movementSpeed(battle, patient), ward }),
    mode === "ward-too-late", mode)
    continue
  }
  const needMove = mode === "circle-then-line"
  assert.equal(!!sharedDodgeWindow(battle, [patient, breaker], [assassin, ranger], mode === "finish" ? "attack" : "move", false),
    needMove || mode === "finish", mode)
  if (mode === "finish") {
    assert(basicCanFinish(battle, breaker, assassin))
    assert.equal(chooseAiAttack(battle, breaker, [breaker, patient], [assassin, ranger])?.order, "basic")
  }
  advance(battle, .45)
  if (mode === "finish") {
    assert(events.some(event => event.target === assassin.id && event.kind === "death" && event.cast.order === "basic"),
      JSON.stringify({ mode, actions: battle.sparring!.actions }))
    continue
  }
  assert.equal(defense.moveAt > COOLDOWN.move, !needMove, JSON.stringify({ mode, flipped,
    actions: battle.sparring!.actions, hp: patient.hp, moves: [patient.move, breaker.move] }))
  if (!needMove) continue
  advance(battle, 1.39)
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, patient), null)
  advance(battle, 2.25)
  const open = events.find(event => event.cast.skill?.id === "assassin/Prismatic/A3" && event.kind === "hit" && event.target === patient.id)
  const arrow = events.find(event => event.cast.skill?.id === "ranger/Prismatic/A2" && event.kind === "cast")
  const dodge = events.find(event => event.kind === "startMove" && event.target === patient.id)
  assert(open && arrow && dodge && dodge.cast.issuedAt! >= arrow.cast.issuedAt!, JSON.stringify({
    mode, flipped, actions: battle.sparring!.actions, open: open?.cast.issuedAt, arrow: arrow?.cast.issuedAt, dodge: dodge?.cast.issuedAt }))
  assert(patient.hp > 0 && !events.some(event => event.kind === "hit" && event.cast.skill?.id === "ranger/Prismatic/A2" &&
    event.target === patient.id), mode)
}
observations.sharedDodgeWindow = "kept the shared action for a dodgeable lethal follow-up while allowing sorties with a ward, a late enemy or an immediate finish"

for (const flipped of [false, true]) for (const delayed of [false, true]) {
  const defenders = cards([["warden", [3, 0]], ["spellbreaker", [4, 2]], ["ranger", [1, 3]], ["healer", [2, 4]]], "Prismatic")
  const attackers = cards([["warden", [0, 3]], ["assassin", [0, 2]], ["ranger", [1, 3]], ["summoner", [1, 0]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [tank, breaker, patient, medic] = flipped ? battle.sparring!.rivals : battle.team
  const [warden, assassin, shooter, summoner] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.sparring!.first = flipped ? "enemy" : "ally"
  const offense = flipped ? battle : battle.sparring!
  offense.moveAt = Infinity
  Object.assign(tank, at(368, 972), { actionAt: 2 })
  Object.assign(breaker, at(528, 1012), { hp: 901, actionAt: 2 })
  Object.assign(patient, at(750.32, 1061), { hp: 268, actionAt: 4.1 })
  Object.assign(medic, at(703, 1012), { hp: 423, actionAt: 1 })
  Object.assign(warden, at(760.41, 564.61), { actionAt: 2.1 })
  Object.assign(assassin, at(688, 307), { hp: 390, actionAt: 4 })
  Object.assign(shooter, at(528, 356), { hp: 422, actionAt: delayed ? 3.4 : 0 })
  Object.assign(summoner, at(429, 113), { actionAt: 3.6 })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, .76)
  const side = flipped ? "enemy" : "ally"
  const move = battle.sparring!.actions.find(order => order.side === side && order.name === "移动")
  assert.equal(move?.actorId, delayed ? medic.id : patient.id)
  assert.equal(patient.hp, 268)
  const cast = events.findIndex(event => event.kind === "cast" && event.cast.skill?.id === "ranger/Prismatic/A2")
  const dodge = events.findIndex(event => event.kind === "startMove" && event.target === patient.id)
  if (!delayed) assert(cast >= 0 && dodge > cast)
}
observations.sharedMoveForLethalLine = "let a wounded ranger dodge a committed lethal shot before using the movement clock for the healer's sidestep"

for (const flipped of [false, true]) for (const withMine of [false, true]) {
  const attackers = cards([["warlock", withMine ? [0, 3] : [0, 2]], ["ranger", [2, 3]]], "R")
  const defenders = cards([["bulwark", [2, 4]], ["warden", [0, 2]]], "R")
  const battle = flipped ? createEdgeBattle(defenders, attackers) : createEdgeBattle(attackers, defenders)
  const [warlock, ranger] = flipped ? battle.sparring!.rivals : battle.team
  const [patient, mate] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  Object.assign(warlock, at(726, 672), { attack: 125 })
  Object.assign(ranger, at(848, 520), { actionAt: Infinity })
  Object.assign(patient, at(610, 877), { hp: 17, speed: 145, actionAt: 5 })
  Object.assign(mate, at(490, 809), { actionAt: 2 })
  assert.equal(!!sharedDodgeWindow(battle, [patient, mate], [warlock, ranger], "move", false), !withMine)
}
observations.lineOrEntry = "reserved movement for a dodgeable line only when the caster lacked a faster lethal trap"

for (const flipped of [false, true]) for (const mode of ["open", "unsafe", "alternate"] as const) {
  const attackers = cards([["spellbreaker", [4, 2]], ["spellbreaker", [4, 2]]], "E")
  const defenders = cards([["dancer", [0, 1]], ["paladin", [0, 2]]], "E")
  const battle = flipped ? createEdgeBattle(defenders, attackers) : createEdgeBattle(attackers, defenders)
  const [breaker, other] = flipped ? battle.sparring!.rivals : battle.team
  const [patient, mate] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  Object.assign(breaker, at(496, 363), { move: at(542, 547), actionAt: 1.5, attack: 140 })
  Object.assign(other, mode === "alternate" ? at(241, 435) : at(978, 525), {
    actionAt: mode === "alternate" ? 1.51 : Infinity, attack: 130,
  })
  Object.assign(patient, at(371, 762), { hp: 108, speed: 185 })
  Object.assign(mate, at(594, 751), { actionAt: 2 })
  const stop = mode === "unsafe" ? at(487, 608) : at(256, 661)
  const route = { actor: patient, landing: stop, stop, arrival: edgeDistance(patient, stop) / movementSpeed(battle, patient) }
  assert(sharedDodgeWindow(battle, [patient, mate], [breaker, other], "move", false), mode)
  assert.equal(!!sharedDodgeWindow(battle, [patient, mate], [breaker, other], "move", false, route), mode !== "open", mode)
}
observations.advanceOutOfLine = "allowed a walk only when its route lost neither the card to the line nor to a second available caster"

for (const mode of ["ready", "late", "guarded", "finish"] as const) {
  const { battle, actor, opponents: [enemy], events } = start([["paladin", [1, 2]]], [["paladin", [1, 2]]])
  place(actor, 600, 830, .60)
  place(enemy, 600, mode === "finish" ? 755 : 641)
  const health = actor.hp
  const sparring = battle.sparring!
  battle.moveAt = sparring.moveAt = Infinity
  sparring.sharedAt = 0
  if (mode === "late") battle.sharedAt = .12
  if (mode === "guarded") Object.assign(actor, { shield: 450, shieldUntil: 6 })
  if (mode === "finish") enemy.hp = 30
  assert.equal(issueEdgeOrder(battle, enemy, "skill", actor, actor), null)
  advance(battle, .86)
  const first = sparring.actions.find(action => action.side === "ally")
  assert.equal(first?.name, mode === "ready" ? "并肩启誓" : mode === "finish" ? "普攻" : "破晓横线", mode)
  const hit = events.find(event => event.cast.owner === enemy.id && event.kind === "hit" && event.target === actor.id)
  if (mode === "ready") {
    const heal = events.find(event => event.kind === "heal" && event.cast.skill?.id === "paladin/Prismatic/A3")
    assert(heal?.amount && actor.hp === health + heal.amount && hit?.amount === 0 && hit.absorbed)
  } else if (mode === "late") assert(hit?.amount && actor.hp < health)
  else if (mode === "finish") assert.equal(enemy.hp, 0)
}
observations.dawnlineCounter = "healed and blocked the announced hit before its simultaneous shield refresh, with timing, existing ward and melee finish controls"

for (const flipped of [false, true]) for (const mode of ["follow", "shielded", "slow-follow", "move-locked"] as const) {
  const attackers = cards([["warlock", [2, 4]], ["lifebringer", [0, 4]], ["warden", [0, 3]]], "Prismatic")
  const defenders = cards([["paladin", [1, 2]], ["spellbreaker", [0, 1]], ["warlock", [2, 4]], ["dancer", [4, 1]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const [mage, life, warden] = enemies
  const [paladin, breaker, patient, dancer] = allies
  const ourClocks = flipped ? battle.sparring! : battle
  const theirClocks = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(paladin, at(368, 1012), { actionAt: 4, shield: 235, shieldUntil: 5 })
  Object.assign(breaker, at(528, 1012), { hp: 811, actionAt: 4, shield: 132, shieldUntil: 5 })
  Object.assign(patient, at(543, 1012), { hp: 326, shield: mode === "shielded" ? 800 : 100, shieldUntil: 5, actionAt: .36 })
  Object.assign(dancer, at(848, 822))
  Object.assign(mage, at(528, 356), { actionAt: .366 })
  Object.assign(warden, at(688, 396), { actionAt: Infinity })
  Object.assign(life, at(460.28, 427.09), { actionAt: mode === "slow-follow" ? 3.15 : 1.30 })
  theirClocks.sharedAt = .433
  if (mode === "move-locked") ourClocks.moveAt = 1.7
  const escape = leaveConcentratedFire(battle, patient, allies, enemies)
  assert.equal(!!escape, mode === "follow", mode)
  if (escape) assert.equal(moveEdgeFighter(battle, patient, escape.point), null)
  advance(battle, .468)
  assert.equal(issueEdgeOrder(battle, mage, "skill", null, patient), null)
  advance(battle, 1.401)
  if (mode !== "slow-follow") {
    const aim = along(life, direction(life, patient), Math.min(479, edgeDistance(life, patient)))
    assert.equal(issueEdgeOrder(battle, life, "skill2", null, aim), null)
  }
  advance(battle, 2.2)
  assert.equal(patient.hp, mode === "move-locked" ? 0 : mode === "slow-follow" ? 165 : 326, mode)
}
observations.spreadBeforeFollowUp = "moved before two legal enemy attacks could combine to finish an ally, and kept movement behind a sufficient shield or a late follow-up"

for (const flipped of [false, true]) for (const mode of ["ready", "late", "warded"] as const) {
  const attackers = cards([["ranger", [1, 0]], ["spellbreaker", [0, 1]]], "Prismatic")
  const defenders = [
    makeCard(pick("paladin", [1, 2], [1, 2]), "Prismatic", 0),
    makeCard(pick("ranger", [1, 0]), "Prismatic", 1),
    makeCard(pick("healer", [0, 4]), "Prismatic", 2),
  ]
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const [paladin, patient, healer] = allies
  const [ranger, breaker] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(paladin, at(600, 950), { hp: 910 })
  Object.assign(patient, at(694, 804), { hp: 125, actionAt: Infinity })
  Object.assign(healer, at(774, 785), { hp: 650, actionAt: Infinity })
  Object.assign(ranger, at(704, 355), { attack: 140 })
  Object.assign(breaker, at(990, 605), { actionAt: Infinity })
  if (mode === "warded") Object.assign(patient, { shield: 340, shieldUntil: 6 })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, patient), null)
  const decision = mode === "late" ? .10 : .017
  advance(battle, decision)
  const intent = chooseAiAttack(battle, paladin, allies, enemies)
  assert.equal(intent?.order, mode === "ready" ? "skill2" : "skill", mode)
  assert.equal(issueEdgeOrder(battle, paladin, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, .81)
  const oath = events.filter(event => event.cast.skill?.id === "paladin/Prismatic/A3")
  assert.equal(oath.filter(event => event.kind === "hit" && event.target === ranger.id).length, mode === "ready" ? 1 : 0)
  assert.equal(patient.hp, mode === "ready" ? 120 : mode === "warded" ? 125 : 0)
}
observations.dawnOathAid = "gave the threatened ally a heal and shield before the hit, and spent the one retaliation against the incoming attacker"

for (const flipped of [false, true]) for (const moving of [false, true]) {
  const attackers = cards([["warlock", [2, 4]], ["spellbreaker", [0, 1]]], "Prismatic")
  const defenders = [
    makeCard(pick("paladin", [1, 4], [1, 2]), "Prismatic", 0),
    makeCard(pick("ranger", [1, 0]), "Prismatic", 1),
    makeCard(pick("healer", [0, 4]), "Prismatic", 2),
  ]
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const [paladin, patient, healer] = allies
  const [mage, breaker] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(paladin, at(600, 950), { hp: 910 })
  Object.assign(patient, at(548, 784), { hp: 125, actionAt: Infinity, move: moving ? at(561, 787) : null })
  Object.assign(healer, at(567, 714), { hp: 650, actionAt: Infinity })
  Object.assign(mage, at(682, 336), { attack: 190 })
  Object.assign(breaker, at(543, 431), { actionAt: Infinity })
  assert.equal(issueEdgeOrder(battle, mage, "skill", null, patient), null)
  advance(battle, .017)
  const intent = chooseAiAttack(battle, paladin, allies, enemies)
  assert.equal(intent?.order, "skill")
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, paladin, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, .88)
  const line = events.filter(event => event.cast.skill?.id === "paladin/Prismatic/A2")
  assert.deepEqual(line.filter(event => event.kind === "hit").map(event => event.target), [breaker.id])
  assert.deepEqual(line.filter(event => event.kind === "shield").map(event => event.target), allies.map(ally => ally.id))
  assert(line.some(event => event.kind === "heal" && event.cast.signature?.id === "paladin/Prismatic/P2" && event.target === paladin.id))
  assert.equal(patient.hp, 21, `${flipped}/${moving}`)
}
observations.horizonCover = "aimed the line through the endangered ally and an enemy, including the ally's moving position and the two-shield passive"

for (const flipped of [false, true]) for (const mode of ["unmarked", "queued", "armed", "used", "expired"] as const) {
  const { battle, events } = start([["ranger"], ["warlock"], ["healer", [0, 1]]], undefined, "Radiant")
  const { boss, team: [patient, other, healer] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const waits = mode === "armed" || mode === "expired"
  Object.assign(boss, at(600, 490), { attack: 220, actionAt: waits ? Infinity : .21, moveAt: Infinity })
  Object.assign(patient, at(530, 682), { hp: 30 })
  Object.assign(other, at(738, 724), { hp: 258 })
  Object.assign(healer, at(528, 962))
  if (mode === "used") patient.once.add("healer/Radiant/A1:defy")
  if (mode === "unmarked") patient.hp += Math.round(patient.maxHp * .21)
  else assert.equal(issueEdgeOrder(battle, healer, "skill", patient), null)
  if (waits) {
    advance(battle, mode === "expired" ? 8 : .45)
    boss.actionAt = battle.time
  }
  const protect = mode === "queued" || mode === "armed"
  advance(battle, battle.time + CHARGE.windup + .32)
  assert.equal(events.find(event => event.kind === "charge" && event.cast.owner === boss.id)?.cast.target,
    protect ? other.id : patient.id, mode)
  assert.equal(patient.hp > 0, protect, mode)
  if (protect) assert(other.hp < 30)
}
observations.bossRescueMark = "selected the exposed charge lane when a visible rescue mark would survive, including queued, spent and expired marks"

for (const marked of [true, false]) {
  const battle = createEdgeBattle(cards([["ranger"], ["healer", [0, 1]]], "Radiant"), cards([["warlock", [1, 0]]], "Prismatic"))
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  const [patient, medic] = battle.team
  const [mage] = battle.sparring!.rivals
  place(patient, 600, 700, .045)
  place(medic, 760, 890)
  place(mage, 600, 390)
  mage.attack = 185
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  if (marked) assert.equal(issueEdgeOrder(battle, medic, "skill", patient), null)
  else patient.hp += Math.round(patient.maxHp * .21)
  assert.equal(issueEdgeOrder(battle, mage, "skill", null, patient), null)
  advance(battle, .20)
  const contacts = announcedStrikes(battle, patient, 1)
  assert.equal(contacts.length, 2)
  const forecast = lifeThroughStrikes(battle, patient, contacts, unit => unit)
  advance(battle, .80)
  assert.equal(!!patient.hp, marked)
  assert.equal(!!forecast.hp, marked)
  assert(Math.abs(forecast.hp - patient.hp) <= 1)
  assert.equal(events.filter(event => event.kind === "save" && event.target === patient.id).length, Number(marked))
}
observations.rescueMarkBeats = "matched real health after a two-beat hit with the queued once-only save and its immediate heal"

for (const flipped of [false, true]) for (const mode of ["open", "warded", "ready-late"] as const) {
  const home = cards([["dancer", [0, 1]], ["paladin", [1, 2]]], "Prismatic")
  const away = cards([["paladin", [1, 2]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? away : home, flipped ? home : away)
  battle.phase = "running"
  const sparring = battle.sparring!
  const [patient, tank] = flipped ? sparring.rivals : battle.team
  const [foe] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(patient, at(470, 486), { hp: 73, actionAt: Infinity })
  Object.assign(tank, at(852, 475), { actionAt: 1.30 })
  Object.assign(foe, at(410, 1050), { actionAt: mode === "ready-late" ? 6 : .80 })
  if (mode === "warded") Object.assign(patient, { shield: 390, shieldUntil: 5 })
  const rivalClock = flipped ? battle : sparring
  rivalClock.moveAt = Infinity
  advance(battle, 1.5)
  const first = sparring.actions.find(action => action.side === (flipped ? "enemy" : "ally"))
  assert.equal(first?.name, "移动", mode)
  assert.equal(first?.actorId, mode === "open" ? patient.id : tank.id, mode)
  if (mode === "open") assert.equal(patient.hp, 73, "leave range before the paladin can aim")
}
observations.rangeWithdrawal = "used the shared move to leave a lethal line in both formations, while a ward or late enemy cooldown freed the tank to advance"

for (const flipped of [false, true]) for (const mode of ["same-caster", "second-caster", "late-line", "basic-only", "shielded"] as const) {
  const home = cards([["dancer", [0, 2]], ["warden", [1, 2]]], "E")
  const hasSecondCaster = mode === "second-caster" || mode === "late-line"
  const away = cards(hasSecondCaster ? [["binder", [0, 4]], ["warden", [0, 3]]]
    : [["binder", mode === "basic-only" ? [0, 4] : [2, 4]]], "E")
  const battle = createEdgeBattle(flipped ? away : home, flipped ? home : away)
  const [patient, guard] = flipped ? battle.sparring!.rivals : battle.team
  const [binder, warden] = flipped ? battle.team : battle.sparring!.rivals
  const offense = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  Object.assign(patient, at(485, 651), { hp: 108, actionAt: 2.63 })
  Object.assign(guard, at(698, 964), { hp: 236, actionAt: Infinity })
  Object.assign(binder, at(652, 556), { hp: 381, attack: 164, actionAt: .60 })
  if (warden) Object.assign(warden, at(562, 578), { attack: 181, actionAt: mode === "late-line" ? 3.30 : .89 })
  if (mode === "shielded") Object.assign(patient, { shield: 182, shieldUntil: 4 })
  offense.moveAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, 2.50)
  assert.equal(patient.hp, 108, mode)
  const walk = events.find(event => event.kind === "startMove" && event.cast.owner === patient.id)
  if (mode === "shielded") {
    assert.equal(walk, undefined, mode)
    assert(events.some(event => event.kind === "hit" && event.cast.skill?.id === "binder/E/A3" && event.target === patient.id))
  } else {
    assert(walk?.landing, mode)
    const length = edgeDistance(at(485, 651), walk.landing)
    assert(mode === "same-caster" || mode === "second-caster" ? length > 150 : length < 125, mode)
  }
}
observations.rangeWithdrawalReplies = "used a longer retreat when a lethal line could follow the first threat, with short moves for basic-only or late lines"

for (const flipped of [false, true]) for (const mode of ["open", "warded", "late"] as const) {
  const allies = cards([["healer", [0, 1]], ["ranger", [0, 1]]], "L")
  const opponents = cards([["warden", [0, 1]]], "E")
  const battle = createEdgeBattle(flipped ? opponents : allies, flipped ? allies : opponents)
  const [patient, ranger] = flipped ? battle.sparring!.rivals : battle.team
  const [enemy] = flipped ? battle.team : battle.sparring!.rivals
  const offense = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  Object.assign(patient, at(911, 805), { hp: 108, actionAt: .68 })
  Object.assign(ranger, at(343, 848), { actionAt: 1.3 })
  Object.assign(enemy, at(765, 687), { attack: 144, actionAt: mode === "late" ? 3.3 : .44 })
  if (mode === "warded") Object.assign(patient, { shield: 210, shieldUntil: 5 })
  offense.moveAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, 1.85)
  const move = events.find(event => event.kind === "startMove" && event.cast.owner === patient.id)
  assert.equal(!!move, mode === "open", mode)
  if (mode === "open") {
    assert(!events.some(event => event.cast.skill?.id === "warden/E/A1" && event.kind === "hit" && event.target === patient.id))
    assert(events.some(event => event.cast.skill?.id === "healer/L/A1" && event.kind === "heal" && event.target === patient.id))
    assert(patient.hp > 108)
  }
}
observations.withdrawBeforeShortWindup = "reserved the defender's walk for a wounded healer before a short shield line, letting the healer use triage"

for (const flipped of [false, true]) for (const pve of [false, true]) {
  const attackers = cards([["bard", [3, 4]], ["warden", [0, 2]]], "E")
  const defenders = cards([["warlock", [2, 4]]], "Prismatic")
  const battle = pve ? createEdgeBattle(attackers) : createEdgeBattle(flipped ? defenders : attackers, flipped ? attackers : defenders)
  const [bard, warden] = !pve && flipped ? battle.sparring!.rivals : battle.team
  const patient = pve ? battle.boss : flipped ? battle.team[0] : battle.sparring!.rivals[0]
  const offense = !pve && flipped ? battle.sparring! : battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  Object.assign(bard, at(600, 500), { attack: 150 })
  Object.assign(warden, at(380, 580), { attack: 150 })
  Object.assign(patient, at(689, 658), { hp: 63, actionAt: Infinity })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, bard, "skill", null, at(600, 658)), null)
  if (!pve) {
    offense.sharedAt = 0
    assert.equal(issueEdgeOrder(battle, warden, "skill", null, at(580, 658)), null)
  }
  const skills = announcedStrikes(battle, patient).map(contact => contact.strike.cast.skill?.id)
  assert.deepEqual(skills, pve ? ["bard/E/A4"] : ["warden/E/A1", "bard/E/A4"])
  offense.moveAt = offense.sharedAt = Infinity
  advance(battle, .7)
  if (pve) assert(patient.hp === 63 && events.some(event => event.kind === "startMove" && event.target === patient.id))
}
observations.shortAreaContacts = "tracked the committed shield line and bard circle, with the PvE boss using the real circle to dodge"

for (const flipped of [false, true]) for (const mode of ["pass", "donor-hit", "wasted", "late"] as const) {
  const allies = cards([["paladin", [3, 4]], ["dancer", [0, 2]]], "E")
  const opponents = cards([["bard", [3, 4]], ["ranger", [0, 1]]], "E")
  const battle = createEdgeBattle(flipped ? opponents : allies, flipped ? allies : opponents)
  const [donor, patient] = flipped ? battle.sparring!.rivals : battle.team
  const [bard, ranger] = flipped ? battle.team : battle.sparring!.rivals
  const offense = flipped ? battle : battle.sparring!, defense = flipped ? battle.sparring! : battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  Object.assign(donor, at(840, 775), { hp: 71, shield: 122, shieldUntil: 8 })
  Object.assign(patient, at(620, 690), { hp: mode === "wasted" ? 20 : 52, actionAt: Infinity })
  if (mode === "wasted") Object.assign(patient, { shield: 62, shieldUntil: 8 })
  Object.assign(bard, at(620, 470), { attack: mode === "wasted" ? 190 : 167 })
  Object.assign(ranger, at(880, 512), { attack: 162, actionAt: Infinity, passives: [], gold: null })
  if (mode === "late") donor.actionAt = .22
  defense.moveAt = offense.moveAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, bard, "skill", null, patient), null)
  if (mode === "donor-hit") {
    offense.sharedAt = ranger.actionAt = 0
    assert.equal(issueEdgeOrder(battle, ranger, "skill", null, donor), null)
  }
  offense.sharedAt = Infinity
  assert.equal(!!rescueFromAnnouncedStrike(battle, [donor, patient]), mode === "pass", `${mode}/${flipped}`)
  advance(battle, .8)
  const transfer = events.find(event => event.kind === "shield" && event.cast.skill?.id === "paladin/E/A5" && event.target === patient.id)
  if (mode === "pass") {
    assert.equal(transfer?.amount, 61)
    assert(patient.hp > 0)
    assert.equal(donor.shield, 61)
  } else if (mode === "donor-hit" || mode === "late") {
    assert(!transfer)
    if (mode === "donor-hit") assert(donor.hp > 0)
  }
}
observations.shieldHandoffRescue = "used the shield actually available after windup, keeping it on the donor when transferring would cause a knockout"

for (const mode of ["entry", "same-danger", "warded", "late", "reply-first", "escape"] as const) {
  const { battle, actor, opponents: [foe] } = start([["dancer"]], [["berserker", [1, 0]]])
  place(foe, 600, 360)
  place(actor, 600, mode === "same-danger" || mode === "escape" ? 810 : 970, .36)
  actor.actionAt = mode === "reply-first" ? 0 : 1.8
  foe.actionAt = mode === "late" ? 2.8 : .58
  battle.sparring!.sharedAt = 0
  if (mode === "warded") Object.assign(actor, { shield: 270, shieldUntil: 3 })
  const landing = { x: 600, y: mode === "escape" ? 990 : 785 }
  assert.equal(walksIntoLethalReach(battle, actor, [foe], { landing, stop: landing, arrival: 1.04 }), mode === "entry", mode)
}
observations.entryBeforeReply = "detected a new fatal cross before the dancer's next action, with coverage, cooldown and safe path controls"

for (const mode of ["binder", "binder-moved", "cross-center", "cross-arm"] as const) {
  const binding = mode.startsWith("binder")
  const { battle, actor: caster, opponents: [target], events } = start(
    binding ? [["binder", [0, 4]]] : [["berserker", [1, 0]]], [["dancer"]])
  place(caster, 600, 450)
  place(target, 600, mode === "cross-arm" ? 770 : 700)
  caster.attack = 125
  battle.nextThinkAt = Infinity
  const aim = { x: 600, y: 700 }
  const hp = target.hp
  assert.equal(issueEdgeOrder(battle, caster, "skill", null, aim), null)
  if (mode === "binder-moved") positionUnit(battle, caster, { x: 626, y: 450 })
  const [contact] = announcedStrikes(battle, target, .8)
  assert(contact)
  const estimate = announcedHit(battle, contact, target, target, unit => unit)
  advance(battle, .8)
  assert.equal(!!estimate, mode !== "binder-moved", mode)
  assert.equal(hp - target.hp, estimate?.hpLoss ?? 0, mode)
  assert.equal(events.some(event => event.kind === "hit" && event.target === target.id), mode !== "binder-moved")
}
observations.fixedWindupContacts = "read binder's actual origin requirement and the berserker cross center bonus from the announced hit"

for (const flipped of [false, true]) for (const mode of ["stationary", "leaving", "out-of-range", "warded", "close"] as const) {
  const { battle, actor: target, events } = start([["ranger"]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(boss, at(600, 540), { lastOrder: "charge", actionAt: .18, moveAt: mode === "close" ? 0 : 1.5 })
  Object.assign(target, at(600, mode === "out-of-range" ? 860 : 760))
  if (mode === "leaving") target.move = at(895, 760)
  if (mode === "warded") Object.assign(target, { shield: target.maxHp, shieldUntil: 12 })
  advance(battle, .35)
  assert.equal(!!battle.telegraph, mode === "stationary", mode)
  advance(battle, 3.5)
  if (mode === "stationary") {
    assert(events.some(event => event.cast.used.has("bossCharge") && event.kind === "hit" && event.target === target.id && event.amount))
  } else if (mode === "close") assert(events.some(event => event.kind === "hit" && event.cast.owner === boss.id && event.cast.order === "basic"))
}
observations.bossChargeAgain = "reused a meaningful charge against a stationary out-of-melee target, accounting for a ready walk, target movement and shield"

for (const mode of ["finish", "warded", "already-in-reach", "refresh-first", "moving-away"] as const) {
  const { battle, actor, opponents: [enemy], events } = start([["paladin", [1, 2]]], [["paladin", [1, 2]]])
  place(actor, 600, 520, .65)
  place(enemy, 600, mode === "already-in-reach" ? 575 : 650, .035)
  battle.nextThinkAt = Infinity
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, { x: 660, y: 650 }), null)
  advance(battle, .65)
  assert(enemy.shield)
  if (mode !== "warded") enemy.shield = 152
  actor.actionAt = 0
  battle.sharedAt = 0
  const aim = { x: 600, y: enemy.y + 50 }
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, aim), null)
  // Re-create the last part of the cooldown at the replay window.
  actor.actionAt = 1.53
  battle.sharedAt = battle.time
  battle.moveAt = battle.time
  const sparring = battle.sparring!
  sparring.moveAt = mode === "refresh-first" ? 1.53 : 4
  if (mode === "moving-away") enemy.move = { x: 750, y: 650 }
  battle.nextThinkAt = battle.time
  advance(battle, .90)
  const walk = events.find(event => event.kind === "startMove" && event.target === actor.id)
  if (mode === "finish") {
    assert(walk, mode)
    advance(battle, 2.55)
    assert.equal(events.find(event => event.kind === "death" && event.target === enemy.id)?.cast.order, "basic", mode)
  } else assert(!walk, mode)
}
observations.duelPushFollow = "advanced during the committed push for a legal finishing basic, with a large ward, short range, move cooldown and enemy movement controls"

for (const mode of ["holding", "crossing", "short-step", "held-runner"] as const) {
  const { battle, actor: summoner, opponents: [enemy], events } = start([["summoner", [0, 1]]], [["warlock", [0, 1]]], "R")
  place(summoner, 600, 910)
  place(enemy, 600, 684, mode === "crossing" ? .65 : .23)
  battle.moveAt = Infinity
  enemy.actionAt = 4.8
  if (mode === "crossing" || mode === "short-step") enemy.move = { x: mode === "crossing" ? 780 : 640, y: 684 }
  if (mode === "held-runner") {
    assert.equal(issueEdgeOrder(battle, summoner, "skill", enemy), null)
    const cast = events.find(event => event.kind === "cast")!.cast
    summoner.actionAt = battle.sharedAt = 0
    advance(battle, .48)
    const recast = events.find(event => event.kind === "cast" && event.cast.owner === summoner.id && event.cast !== cast)
    assert.notEqual(recast?.cast.skill?.deployment, "runner")
    assert.notEqual(recast?.cast.skill?.deployment, "lasso")
    advance(battle, 1.4)
    assert(events.some(event => event.kind === "hit" && event.cast.id === cast.id && event.amount))
    continue
  }
  advance(battle, 1.4)
  const cast = events.find(event => event.kind === "cast" && event.cast.owner === summoner.id)
  assert.equal(cast?.cast.skill?.deployment, mode === "crossing" ? "lasso" : "runner", mode)
  if (mode === "crossing") {
    assert(events.some(event => event.kind === "assist" && event.style === "lasso" && event.target === enemy.id))
    assert(enemy.x < 780)
  } else assert(events.some(event => event.kind === "hit" && event.cast.skill?.deployment === "runner" && event.amount))
}
observations.runnerOrLasso = "used a chase against standing or short paths, stopped an actual escape at the ring and retained a productive runner"

for (const guarded of [false, true]) {
  const { battle, actor: summoner, opponents: [enemy, guard], events } = start(
    [["summoner", [0, 1]]], [["warlock", [0, 1]], ["healer", [2, 1]]], "R",
  )
  place(summoner, 600, 910)
  summoner.range = 165
  place(enemy, 600, 684, .09, { x: 780, y: 684 })
  place(guard, 905, 684)
  battle.moveAt = Infinity
  enemy.actionAt = 4.8
  if (guarded) {
    battle.sparring!.sharedAt = 0
    assert.equal(issueEdgeOrder(battle, guard, "skill", enemy), null)
    battle.sparring!.sharedAt = Infinity
  }
  advance(battle, 1.4)
  const cast = events.find(event => event.kind === "cast" && event.cast.owner === summoner.id)
  assert.equal(cast?.cast.skill?.deployment, guarded ? "lasso" : "runner")
  assert.equal(!!enemy.hp, guarded)
}
observations.runnerAgainstAid = "used the lasso when an already-cast heal was due to save the moving target from the runner"

for (const [mode, ready, lethal, dash, disrupts] of [
  ["recovered before release", 0, false, undefined, false],
  ["knocked during the windup", .32, false, undefined, true],
  ["knocked after the dash begins", .32, false, .21, true],
  ["hit after release", .62, true, undefined, false],
  ["lethal early hit", 0, true, undefined, true],
] as const) {
  const { battle, actor, opponents: [summoner] } = start([["warlock"]], [["summoner", [0, 1]]], "R")
  place(actor, 600, 684, lethal ? .035 : .7)
  place(summoner, 600, 910)
  battle.sparring!.sharedAt = 0
  assert.equal(issueEdgeOrder(battle, summoner, "skill", actor), null)
  const [body] = battle.runtime.summons[0].deployment.bodies
  Object.assign(body, { x: 600, y: 730 })
  body.actionsAt[0] = ready
  assert.equal(summonDisruptsCast(battle, actor, .51, unit => unit, dash), disrupts, mode)
}
observations.runnerDisruption = "a runner's shove mattered during a windup or dash, and a lethal hit still mattered before a recovered shove"

for (const mode of ["finish", "counter", "shielded-target", "warded-pursuer"] as const) {
  const { battle, actor, opponents: [enemy], events } = start([["warlock", [0, 1]]], [["summoner", [0, 1]]], "UC")
  place(actor, 680, 692, .05)
  place(enemy, 973, 520, .08)
  const sparring = battle.sparring!
  actor.actionAt = .32
  enemy.actionAt = mode === "counter" || mode === "warded-pursuer" ? .35 : 2.80
  sparring.sharedAt = sparring.moveAt = 0
  if (mode === "shielded-target") Object.assign(enemy, { shield: 400, shieldUntil: 4 })
  if (mode === "warded-pursuer") Object.assign(actor, { shield: 310, shieldUntil: 4 })
  const chase = mode === "finish" || mode === "warded-pursuer"
  const pursuit = pursueDuelFinish(battle, actor, enemy, (target, range) => {
    const landing = along(target, direction(target, actor), range)
    return { point: landing, landing, stop: landing, arrival: edgeDistance(actor, landing) / movementSpeed(battle, actor) }
  })
  assert.equal(!!pursuit, chase, mode)
  advance(battle, 2.7)
  const walked = events.some(event => event.kind === "startMove" && event.target === actor.id)
  if (chase) {
    assert(walked, mode)
    assert.equal(enemy.hp, 0, mode)
  } else if (mode === "counter") assert(!walked, mode)
}
observations.duelReengagement = "closed a finishing gap when the reply was late or warded and held when the enemy could finish first"

for (const flipped of [false, true]) for (const mode of ["take-hit", "target-shield", "lethal-reply", "team-finish", "team-lethal-reply"] as const) {
  const paired = mode === "team-finish" || mode === "team-lethal-reply"
  const attackers = cards(paired ? [["warlock", [0, 1]], ["binder", [1, 4]]] : [["warlock", [2, 4]]], "UC")
  const defenders = cards(paired ? [["warlock", [2, 4]]] : [["binder", [4, 3]]], "UC")
  const battle = createEdgeBattle(flipped ? defenders : attackers, flipped ? attackers : defenders)
  const [actor, partner] = flipped ? battle.sparring!.rivals : battle.team
  const [enemy] = flipped ? battle.team : battle.sparring!.rivals
  const defense = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  if (paired) {
    Object.assign(actor, at(815, 382), { hp: 328, shield: 74, shieldUntil: 5 })
    Object.assign(enemy, at(515, 594), { hp: 101, attack: mode === "team-lethal-reply" ? 480 : 180 })
    Object.assign(partner, at(674, 988), { hp: 25, actionAt: Infinity })
  } else {
    Object.assign(actor, at(596, 780), { hp: mode === "lethal-reply" ? 115 : 156, actionAt: 1.40 })
    Object.assign(enemy, at(245, 625), { hp: 145, attack: mode === "lethal-reply" ? 260 : 156, actionAt: .35 })
  }
  if (mode === "target-shield") Object.assign(enemy, { shield: 220, shieldUntil: 8 })
  defense.moveAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  const wins = mode === "take-hit" || mode === "team-finish"
  const startingHealth = actor.hp
  advance(battle, 2.4)
  assert.equal(events.some(event => event.kind === "startMove" && event.cast.owner === actor.id), wins, mode)
  assert.equal(enemy.hp === 0, wins, mode)
  if (wins) {
    assert(actor.hp > 0 && actor.hp < startingHealth, mode)
    assert(events.some(event => event.kind === "death" && event.target === enemy.id &&
      event.cast.skill?.id === (paired ? "warlock/UC/A1" : "warlock/UC/A3")))
  } else assert.equal(actor.hp, startingHealth, mode)
}
observations.finishingWalkAfterReply = "accepted a survivable hit to finish the last opponent, with one or two allies left, and held against lethal replies or a target shield"

for (const flipped of [false, true]) for (const mode of ["refresh", "punch-through", "delayed-refresh"] as const) {
  const attackers = cards([["warlock", [0, 1]]], "UC")
  const defenders = cards([["paladin", [1, 2]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? defenders : attackers, flipped ? attackers : defenders)
  const [actor] = flipped ? battle.sparring!.rivals : battle.team
  const [enemy] = flipped ? battle.team : battle.sparring!.rivals
  const defense = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  Object.assign(actor, at(655, 840), { hp: 113, attack: mode === "punch-through" ? 700 : 181 })
  Object.assign(enemy, at(900, 560), { hp: mode === "punch-through" ? 15 : 54, attack: 12,
    actionAt: mode === "delayed-refresh" ? 3 : .40 })
  defense.moveAt = Infinity
  const pursuit = pursueDuelFinish(battle, actor, enemy, (target, range) => {
    const landing = along(target, direction(target, actor), range)
    return { point: landing, landing, stop: landing, arrival: edgeDistance(actor, landing) / movementSpeed(battle, actor) }
  })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  const wins = mode !== "refresh"
  assert.equal(!!pursuit, wins, mode)
  advance(battle, 2.40)
  assert.equal(enemy.hp === 0, wins, mode)
  assert.equal(events.some(event => event.kind === "shield" && event.cast.skill?.id === "paladin/Prismatic/A2"), mode !== "delayed-refresh", mode)
}
observations.finishingWalkAgainstRefresh = "excluded routes whose finishing hit would be stopped by a new shield, while keeping hits that beat its timing or size"

for (const mode of ["killable", "thick", "late", "healthy"] as const) {
  const { battle, actor: summoner, events } = start([["summoner", [0, 1]]], undefined, "R")
  const boss = battle.boss
  place(summoner, 600, 844)
  place(boss, 600, 570)
  boss.hp = mode === "healthy" ? 560 : 45
  boss.attack = 150
  boss.moveAt = Infinity
  assert.equal(issueEdgeOrder(battle, summoner, "skill", boss), null)
  const [body] = battle.runtime.summons[0].deployment.bodies
  Object.assign(body, { x: 600, y: 638, hp: mode === "thick" ? 350 : 70 })
  if (mode === "late") body.actionsAt[0] = 5
  advance(battle, .12)
  if (mode === "killable") {
    assert.equal(body.hp, 0)
    assert(events.some(event => event.kind === "hit" && event.target === body.id && event.cast.owner === boss.id))
    assert(events.some(event => event.kind === "assist" && event.style === "broken" && event.summon === body.id))
  } else {
    assert(body.hp > 0, mode)
    assert.equal(!!battle.telegraph, mode !== "thick", mode)
  }
}
observations.bossAnswersRunner = "removed a lethal runner in one hit and weighed durability, action timing and the boss's remaining health"

for (const flipped of [false, true]) for (const mode of ["in-range", "late", "remote", "moving-away"] as const) {
  const paladins = cards([["paladin", [4, 0]], ["warden", [0, 3]], ["dancer", [0, 1]]], "Prismatic")
  const opposition = cards([["ranger", [2, 4]], ["healer", [0, 1]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(opposition, paladins) : createEdgeBattle(paladins, opposition)
  const sparring = battle.sparring!
  const [paladin, warden, wounded] = flipped ? sparring.rivals : battle.team
  const [ranger, healer] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.moveAt = sparring.moveAt = Infinity
  Object.assign(paladin, at(600, 1090))
  Object.assign(warden, at(570, 685), { actionAt: mode === "late" ? 11 : 1 })
  Object.assign(wounded, at(625, 608), { hp: 178, actionAt: Infinity, move: mode === "moving-away" ? at(815, 608) : null })
  Object.assign(ranger, at(mode === "remote" ? 780 : 610, 630), { actionAt: Infinity })
  Object.assign(healer, mode === "remote" ? at(300, 510) : at(432, 588), { actionAt: Infinity })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, 2.4)
  const chorus = events.filter(event => event.cast.skill?.id === "paladin/Prismatic/A5")
  assert.equal(chorus.some(event => event.kind === "cast"), mode === "in-range", mode)
  assert.equal(chorus.some(event => event.kind === "heal" && event.target === wounded.id && event.amount === 77), mode === "in-range", mode)
}

for (const flipped of [false, true]) for (const mode of ["scheduled", "before-mark", "remote"] as const) {
  const paladins = cards([["paladin", [4, 0]], ["ranger", [0, 4]], ["dancer", [0, 1]]], "Prismatic")
  const opposition = cards([["warlock", [0, 3]], ["healer", [0, 1]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(opposition, paladins) : createEdgeBattle(paladins, opposition)
  const sparring = battle.sparring!
  const [paladin, ranger, wounded] = flipped ? sparring.rivals : battle.team
  const [warlock, healer] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.moveAt = sparring.moveAt = Infinity
  battle.nextThinkAt = mode === "before-mark" ? 1 : COOLDOWN.shared
  Object.assign(paladin, at(600, 1090))
  Object.assign(ranger, at(530, 850))
  Object.assign(warlock, at(650, 530), { actionAt: Infinity })
  Object.assign(healer, at(372, 408), { actionAt: Infinity })
  Object.assign(wounded, at(mode === "remote" ? 755 : 679, 550), { hp: 178, actionAt: Infinity })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(650, 530)), null)
  advance(battle, 2)
  const chorus = events.filter(event => event.cast.skill?.id === "paladin/Prismatic/A5")
  assert.equal(chorus.some(event => event.kind === "cast"), mode === "scheduled", mode)
  assert.equal(chorus.some(event => event.kind === "heal" && event.target === wounded.id && event.amount === 77), mode === "scheduled", mode)
}
observations.chorusContact = "armed a heal for a nearby next attack or a committed strike, and held it if that contact was too early, late or remote"

for (const flipped of [false, true]) for (const mode of ["finish", "edge", "moving-out", "warded", "basic-finish"] as const) {
  const assassinCards = cards([["assassin", [1, 2]]], "Prismatic")
  const opposition = cards([["ranger", [2, 4]], ["healer", [0, 1]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(opposition, assassinCards) : createEdgeBattle(assassinCards, opposition)
  const sparring = battle.sparring!
  const [assassin] = flipped ? sparring.rivals : battle.team
  const [target, healer] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.moveAt = sparring.moveAt = Infinity
  Object.assign(assassin, at(466, 850))
  Object.assign(target, at(590, 620), { hp: 230, actionAt: Infinity })
  Object.assign(healer, at(940, 360), { actionAt: Infinity })
  if (mode === "edge") {
    Object.assign(assassin, at(340, 815))
    Object.assign(target, at(235, 810), { hp: 490 })
  }
  if (mode === "moving-out") Object.assign(target, at(866, 775), { hp: 320, move: at(985, 775) })
  if (mode === "warded") Object.assign(target, { hp: 247, shield: 240, shieldUntil: 3 })
  if (mode === "basic-finish") {
    Object.assign(assassin, at(500, 700))
    Object.assign(target, at(585, 686), { hp: 55 })
  }
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, 1.7)
  const blades = events.filter(event => event.cast.skill?.id === "assassin/Prismatic/A2")
  assert.equal(blades.filter(event => event.kind === "hit" && event.target === target.id).length,
    mode === "finish" || mode === "edge" ? 2 : 0, mode)
  assert.equal(target.hp === 0, mode === "finish" || mode === "basic-finish", mode)
  if (mode !== "moving-out") assert.equal(isOutside(target), mode === "edge", mode)
  if (mode === "basic-finish") assert(events.some(event => event.kind === "hit" && event.cast.order === "basic" && event.target === target.id))
  if (mode === "edge") assert(blades.some(event => event.kind === "exit" && event.target === target.id))
}
observations.doubleEdgeContacts = "used both contacts to finish or ring out, with alternatives for a lost lock, a ward, or an immediate basic finish"

for (const flipped of [false, true]) for (const canDodge of [false, true]) {
  const offense = cards([["ranger", [1, 0]]], "Prismatic")
  const defense = cards([["warden"], ["warlock"], ["ranger"]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const sparring = battle.sparring!
  const [ranger] = flipped ? sparring.rivals : battle.team
  const [warden, warlock, otherRanger] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.moveAt = sparring.moveAt = Infinity
  if (canDodge) (flipped ? battle : sparring).moveAt = 0
  Object.assign(ranger, at(600, 840))
  Object.assign(warden, at(666, 650), { hp: 975, actionAt: Infinity })
  Object.assign(warlock, at(612, 275), { hp: 393, actionAt: Infinity })
  Object.assign(otherRanger, at(663, 470), { hp: 422, actionAt: Infinity })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, .77)
  const line = events.filter(event => event.cast.skill?.id === "ranger/Prismatic/A2")
  if (!canDodge) {
    assert.deepEqual(line.filter(event => event.kind === "hit").map(event => event.target), [warlock.id, otherRanger.id])
  } else {
    assert(events.some(event => event.kind === "startMove" && event.target === warlock.id))
    assert(!line.some(event => event.kind === "hit" && event.target === warlock.id))
  }
  assert.deepEqual(line.filter(event => event.kind === "exit").map(event => event.target), canDodge ? [] : [warlock.id])
}
observations.longStringAim = "found a line through two cards and accounted for a legal escape by the displacement target"

for (const flipped of [false, true]) {
  const offense = cards([["ranger", [1, 0]]], "Prismatic")
  const defense = cards([["spellbreaker"], ["lifebringer"]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const sparring = battle.sparring!
  const [ranger] = flipped ? sparring.rivals : battle.team
  const [breaker, life] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.moveAt = sparring.moveAt = Infinity
  Object.assign(ranger, at(669, 957))
  Object.assign(breaker, at(688, 307), { hp: 839, actionAt: .35 })
  Object.assign(life, at(323, 307), { hp: 258, actionAt: 5 })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, .79)
  assert(events.some(event => event.kind === "death" && event.target === life.id && event.cast.skill?.id === "ranger/Prismatic/A2"))
  assert(!events.some(event => event.kind === "exit" && event.target === breaker.id))
}

for (const flipped of [false, true]) for (const warded of [false, true]) {
  const offense = cards([["warden", [3, 0]]], "Prismatic")
  const defense = cards([["ranger"], ["warden"], ["dancer"]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const sparring = battle.sparring!
  const [actor] = flipped ? sparring.rivals : battle.team
  const [ranger, warden, dancer] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.moveAt = sparring.moveAt = Infinity
  Object.assign(actor, at(532, 940))
  Object.assign(ranger, at(295, 680), { hp: 540, actionAt: Infinity })
  Object.assign(warden, at(330, 655), { hp: 700, actionAt: Infinity })
  Object.assign(dancer, at(335, 642), { hp: 550, actionAt: Infinity })
  if (warded) battle.runtime.buffs.push({ id: "anti", kind: "anti", values: [80], target: ranger.id,
    until: 2, style: "", cast: newCast(battle, ranger, "skill") })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, .9)
  const hammer = events.filter(event => event.cast.skill?.id === "warden/Prismatic/A4")
  assert.equal(hammer.filter(event => event.kind === "hit").length, 3)
  assert.deepEqual(hammer.filter(event => event.kind === "exit").map(event => event.target).sort(),
    (warded ? [warden.id, dancer.id] : [ranger.id, warden.id, dancer.id]).sort())
}
observations.crossingHammerAim = "used the correct side of the hammer to eject three targets and recognized a protected target"

for (const flipped of [false, true]) for (const mode of ["ring-out", "two-cards", "walking-in", "late", "braced", "old-ward", "too-far"] as const) {
  const offense = cards([["warden", [3, 0]]], "Prismatic")
  const defense = cards([["warden", [0, 1]], ["ranger", [1, 0]], ["dancer", [3, 4]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(offense, defense) : createEdgeBattle(defense, offense)
  const sparring = battle.sparring!
  const [enemy] = flipped ? battle.team : sparring.rivals
  const allies = flipped ? sparring.rivals : battle.team
  const [guard, ranger, dancer] = allies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(enemy, at(532, 940))
  Object.assign(guard, mode === "too-far" ? at(901, 970) : at(430, 960))
  Object.assign(ranger, at(295, 680), { hp: 540, shield: mode === "braced" || mode === "old-ward" ? 420 : 0, shieldUntil: 8 })
  Object.assign(dancer, mode === "two-cards" ? at(335, 642) : at(953, 867), { hp: 550 })
  if (mode === "braced") battle.runtime.buffs.push({ id: "anti", kind: "anti", values: [80], target: ranger.id,
    until: 5, style: "", cast: newCast(battle, ranger, "skill") })
  if (mode === "old-ward") {
    assert.equal(issueEdgeOrder(battle, guard, "skill", null, ranger), null)
    advance(battle, .34)
    const clocks = flipped ? sparring : battle
    clocks.sharedAt = guard.actionAt = 0
  }
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, enemy, "skill", null, at(332, 663)), null)
  advance(battle, battle.time + (mode === "late" ? .32 : .08))
  if (mode === "walking-in") ranger.move = at(430, 680)
  const choosesWard = mode === "ring-out" || mode === "two-cards"
  const intent = chooseAiAttack(battle, guard, allies, [enemy])
  assert.equal(intent?.order, choosesWard ? "skill" : "skill2", `${flipped}/${mode}`)
  assert.equal(issueEdgeOrder(battle, guard, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, 1.22)
  const ward = events.filter(event => event.cast.skill?.id === "warden/Prismatic/A1")
  assert.deepEqual(ward.filter(event => event.kind === "shield").map(event => event.target),
    mode === "two-cards" ? [ranger.id, dancer.id] : choosesWard ? [ranger.id] : [], `${flipped}/${mode}`)
  assert.deepEqual(ward.filter(event => event.kind === "protect" && event.style === "exguard").map(event => event.target),
    choosesWard || mode === "old-ward" ? [ranger.id] : [], `${flipped}/${mode}`)
  assert.equal(isOutside(ranger), mode === "late" || mode === "too-far", `${flipped}/${mode}`)
}
observations.boundaryWardTiming = "placed the shield and boundary field before a predicted ring-out and recognized timely inward movement or existing protection"

for (const flipped of [false, true]) for (const mode of ["brace", "existing-brace", "late"] as const) {
  const offense = cards([["warden", [3, 0]], ["berserker", [0, 1]]], "Prismatic")
  const defense = cards([["bulwark", [4, 1]], ["ranger", [1, 0]], ["dancer", [3, 4]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(offense, defense) : createEdgeBattle(defense, offense)
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const [hammer, berserker] = enemies
  const [tank, ranger, dancer] = allies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(tank, at(510, 817), { attack: 180 })
  Object.assign(ranger, at(316, 672), { hp: 253 })
  Object.assign(dancer, at(880, 890))
  Object.assign(hammer, at(532, 940), { attack: 220 })
  Object.assign(berserker, at(470, 644))
  if (mode === "existing-brace") {
    Object.assign(ranger, { shield: 300, shieldUntil: 5 })
    battle.runtime.buffs.push({ id: "anti", kind: "anti", values: [50], target: ranger.id, until: 5,
      style: "", cast: newCast(battle, ranger, "skill") })
  }
  assert.equal(issueEdgeOrder(battle, hammer, "skill", null, at(365, 650)), null)
  advance(battle, mode === "late" ? .26 : .08)
  const intent = chooseAiAttack(battle, tank, allies, enemies)
  assert.equal(intent?.order, "skill")
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, tank, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, 1.05)
  const island = events.filter(event => event.cast.skill?.id === "bulwark/Prismatic/A5")
  assert.deepEqual(island.filter(event => event.kind === "hit").map(event => event.target), [hammer.id, berserker.id])
  assert.equal(island.some(event => event.kind === "shield" && event.target === ranger.id), mode === "brace")
  assert.equal(island.some(event => event.kind === "protect" && event.style === "anti" && event.target === ranger.id), mode === "brace")
  assert.equal(isOutside(ranger), mode === "late")
}
observations.islandBrace = "hit two enemies while warding the endangered ranger and skipped protection credit when braced or too late"

for (const flipped of [false, true]) for (const mode of ["threat", "off-line", "warded"] as const) {
  const { battle, actor: mage, events } = start([["warlock", [2, 4]], ["healer"]])
  const patient = battle.team[1]
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(mage, at(626, 818), { hp: 170 })
  Object.assign(patient, at(606, 765), { hp: 80, actionAt: Infinity })
  Object.assign(boss, at(601, 554), { armor: .75, hp: 1150, shield: 400, shieldUntil: 5, attack: 340, moveAt: Infinity })
  if (mode === "warded") for (const ally of battle.team) Object.assign(ally, { shield: 575, shieldUntil: 6 })
  assert(startBossCharge(battle, mode === "off-line" ? { ...mage, ...at(601, 284) } : mage))
  boss.actionAt = Infinity
  const intent = chooseAiAttack(battle, mage, battle.team, [boss])
  assert.equal(intent?.order, "skill")
  assert.equal(intent.value > 4, mode === "threat", mode)
  assert.equal(issueEdgeOrder(battle, mage, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, CHARGE.windup + .3)
  assert(events.some(event => event.kind === "interrupt" && event.cast.skill?.id === "warlock/Prismatic/A3" && event.target === boss.id))
  assert.equal(mage.hp, 170)
  assert.equal(patient.hp, 80)
}
observations.horizonChargePriority = "accounted for the threatened pair when a narrow line could cancel the boss charge"

for (const flipped of [false, true]) for (const mode of ["finish", "warded", "death-aid"] as const) {
  const offense = cards([["assassin", [2, 3]]], "Prismatic")
  const defense = cards([["warden"], ["ranger"], ["healer"]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const sparring = battle.sparring!
  const [assassin] = flipped ? sparring.rivals : battle.team
  const [warden, ranger, healer] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.moveAt = sparring.moveAt = Infinity
  Object.assign(assassin, at(606, 854))
  Object.assign(warden, at(612, 548), { hp: 80, actionAt: Infinity })
  Object.assign(ranger, at(578, 562), { hp: 228, actionAt: Infinity, shield: mode === "warded" ? 75 : 0, shieldUntil: 3 })
  Object.assign(healer, at(613, 555), { hp: 710, actionAt: Infinity })
  if (mode !== "death-aid") healer.once.add("healer/Prismatic/P8")
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, 1.05)
  const hits = events.filter(event => event.kind === "hit" && event.cast.skill?.id === "assassin/Prismatic/A3")
  assert.deepEqual(hits.map(event => event.target), [warden.id, ranger.id, healer.id, (mode === "finish" ? ranger : healer).id])
  assert.equal(warden.hp, 0)
  assert.equal(ranger.hp === 0, mode === "finish", mode)
  assert.equal(events.some(event => event.kind === "heal" && event.target === ranger.id &&
    event.cast.signature?.id === "healer/Prismatic/P8"), mode === "death-aid")
}
observations.windShearAim = "finished a fragile survivor and reprioritized the center when a ward or an ally's death heal could save it"

for (const flipped of [false, true]) for (const warned of [false, true]) {
  const offense = [makeCard(pick("berserker", [0, 3], [0, 3], 0), "Prismatic", 0), ...cards([["paladin", [1, 2]]], "Prismatic")]
  const defense = cards([["ranger", [1, 3]], ["warden", [3, 0]], ["spellbreaker"], ["warlock"]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const foes = flipped ? battle.team : battle.sparring!.rivals
  const [berserker, paladin] = team
  const [ranger, warden, breaker, mage] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(berserker, warned ? at(600, 854) : at(602, 889), { attack: 186, hp: warned ? 149 : 485 })
  Object.assign(paladin, at(506, 933), { hp: 985 })
  Object.assign(ranger, warned ? at(594, 655) : at(600, 695), { hp: warned ? 480 : 600 })
  Object.assign(warden, warned ? at(612, 490) : at(618, 649), { hp: warned ? warden.maxHp : 600 })
  Object.assign(breaker, at(404, 318))
  Object.assign(mage, at(817, 315))
  if (warned) assert.equal(issueEdgeOrder(battle, warden, "skill", null, at(568, 821)), null)
  advance(battle, .017)
  const intent = chooseAiAttack(battle, berserker, team, foes)
  assert(intent)
  assert.equal(intent.order, warned ? "skill2" : "skill")
  assert.equal(intent.target, ranger)
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, berserker, intent.order, intent.target, intent.at), null)
  advance(battle, 1.25)
  const hits = events.filter(event => event.cast.owner === berserker.id && event.kind === "hit")
  if (warned) {
    assert.equal(hits[0]?.cast.skill?.id, "berserker/Prismatic/A4")
    assert.equal(hits.length, 1)
    assert(berserker.hp > 0 && events.some(event => event.cast.owner === warden.id && event.kind === "hit" && event.target === berserker.id))
  } else {
    assert.deepEqual(hits.map(event => event.target), [ranger.id, ranger.id, ranger.id, warden.id])
    assert.equal(hits[3].cast.signature?.id, "berserker/Prismatic/G1")
  }
}
observations.trinityRoute = "completed the three strikes and gold follow-up on a clear route, switched to Furnace before the hammer"

for (const flipped of [false, true]) for (const mode of ["cross", "exit", "brace"] as const) {
  const cross = mode === "cross"
  const offense = [makeCard(pick("berserker", cross ? [1, 3] : [2, 3], cross ? [1, 3] : [2, 3]), "Prismatic", 0),
    ...cards([["paladin", [1, 2]], ["bulwark", [1, 4]]], "Prismatic")]
  const defense = cards([["ranger", [1, 3]], ["warden", [3, 0]], ["spellbreaker", [0, 1]], ["warlock", [2, 4]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const foes = flipped ? battle.team : battle.sparring!.rivals
  const [berserker, paladin, bulwark] = team
  const [ranger, warden, breaker, mage] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(berserker, cross ? at(613, 880) : at(747, 897), { attack: cross ? 180 : 186, hp: cross ? 360 : 353 })
  Object.assign(paladin, cross ? at(506, 933) : at(746, 1002), { hp: 985, actionAt: Infinity })
  Object.assign(bulwark, at(385, 988), { actionAt: Infinity })
  Object.assign(ranger, cross ? at(608, 606) : at(890, 851), { hp: cross ? 270 : 610, actionAt: Infinity })
  Object.assign(warden, cross ? at(690, 631) : at(651, 755), { hp: cross ? 730 : 855, actionAt: Infinity })
  Object.assign(breaker, cross ? at(665, 545) : at(404, 318), { hp: 640, actionAt: Infinity })
  Object.assign(mage, at(817, 315), { actionAt: Infinity })
  if (mode === "brace") battle.runtime.buffs.push({
    id: "brace", kind: "anti", cast: newCast(battle, ranger, "skill", ranger), target: ranger.id, values: [75], until: 2, style: "",
  })
  advance(battle, .017)
  const intent = chooseAiAttack(battle, berserker, team, foes)
  assert(intent)
  assert.equal(intent.order, mode === "brace" ? "skill2" : "skill")
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, berserker, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, 1.1)
  if (cross) {
    assert.deepEqual(events.filter(event => event.kind === "hit" && event.cast.owner === berserker.id)
      .map(event => event.target), [ranger.id, warden.id, breaker.id])
    assert.equal(ranger.hp, 0)
    assert(events.some(event => event.kind === "shield" && event.target === berserker.id && event.cast.signature?.id === "berserker/Prismatic/P2"))
  } else {
    assert.equal(isOutside(ranger), mode === "exit")
    assert.equal(events.some(event => event.kind === "heal" && event.cast.skill?.id === "berserker/Prismatic/A3" &&
      event.target === berserker.id && event.amount === 188), mode === "exit")
  }
}
observations.crossAndFrontier = "caught the priority target in the cross core and used the frontier shove when it could actually eject"

for (const flipped of [false, true]) for (const mode of ["stay", "dodge", "caster-falls"] as const) {
  const offense = cards([["berserker", [3, 1]], ["paladin"]], "Prismatic")
  const defense = cards([["ranger"], ["warden"]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const foes = flipped ? battle.team : battle.sparring!.rivals
  const [berserker] = team
  const [ranger] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(berserker, at(610, 895), { attack: 186 })
  Object.assign(ranger, at(610, 530), { hp: 80 })
  assert.equal(issueEdgeOrder(battle, berserker, "skill", ranger), null)
  const futurePosition = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const pending = () => announcedStrikes(battle, ranger, battle.time + .9, futurePosition)
  const windup = pending()[0]
  assert(windup && "target" in windup.strike && windup.strike.locksAt !== undefined)
  const fatal = () => lifeThroughStrikes(battle, ranger, pending(), futurePosition).hp === 0
  assert(fatal())
  advance(battle, .23)
  if (mode === "caster-falls") berserker.hp = 0
  const flight = pending()[0]
  assert(flight && "target" in flight.strike && flight.strike.launchedFrom && flight.strike.deliveryRange !== undefined)
  assert(fatal())
  if (mode === "dodge") {
    const exit = leaveLethalTargetRange(battle, ranger, team, "announced")
    assert(exit)
    assert.equal(moveEdgeFighter(battle, ranger, exit.point), null)
    assert(!fatal())
  }
  advance(battle, .85)
  assert.equal(ranger.hp, mode === "dodge" ? 80 : 0)
}
observations.furnaceRange = "forecast the pending throw and the launched projectile, and walked out of its fixed range before impact"

for (const flipped of [false, true]) for (const ready of [true, false]) {
  const offense = [makeCard(pick("binder", [2, 0], [2, 4], 1), "Prismatic", 0),
    ...cards([["ranger", [1, 3]], ["warden", [3, 0]], ["berserker", [2, 3]]], "Prismatic")]
  const defense = cards([["warlock", [2, 4]], ["spellbreaker", [0, 1]], ["bard", [0, 3]], ["warden", [3, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const foes = flipped ? battle.team : battle.sparring!.rivals
  const [binder, ranger, tank, berserker] = team
  const [mage, breaker, bard, warden] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(binder, at(490, 1093), { attack: 165, hp: 690 })
  Object.assign(ranger, at(537, 574), { hp: 305, attack: 197, actionAt: ready ? .92 : Infinity })
  Object.assign(tank, at(642, 679), { actionAt: ready ? 1.03 : Infinity })
  Object.assign(berserker, at(880, 916), { actionAt: Infinity })
  Object.assign(mage, at(778, 512), { hp: 720, armor: .05, actionAt: Infinity })
  Object.assign(breaker, at(289, 278), { hp: 720, actionAt: Infinity })
  Object.assign(bard, at(811, 466), { hp: 680, move: at(813, 468), actionAt: Infinity })
  Object.assign(warden, at(360, 325), { hp: 960, actionAt: Infinity })
  advance(battle, .018)
  const intent = chooseAiAttack(battle, binder, team, foes)
  assert.equal(intent?.order, "skill")
  assert.equal(issueEdgeOrder(battle, binder, "skill", null, intent.at), null)
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  advance(battle, 1.08)
  if (ready) {
    assert.equal(issueEdgeOrder(battle, ranger, "basic", mage), null)
    const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
    const contact = announcedStrikes(battle, mage, 1.7, position).find(hit => hit.strike.cast.owner === ranger.id)
    assert(contact)
    assert.equal(announcedShift(battle, contact, mage, position)?.push, false)
  }
  advance(battle, 2.2)
  assert.equal(events.some(event => event.binderBend === "inverse" && event.target === mage.id), ready)
  assert.equal(ranger.shield, ready ? 63 : 0)
  assert.equal(events.some(event => event.kind === "pull" && event.target === bard.id && event.cast.signature?.id === "binder/Prismatic/G2"), ready)
}
observations.inverseHook = "aimed for the ally push and gold pull, with direct damage still available during ally cooldowns"

for (const flipped of [false, true]) for (const mode of ["arrives", "existing-brace", "late"] as const) {
  const offense = [makeCard(pick("binder", [3, 0], [2, 3]), "Prismatic", 0),
    ...cards([["ranger", [1, 3]], ["warden", [3, 0]], ["berserker", [2, 3]]], "Prismatic")]
  const defense = cards([["warlock", [2, 4]], ["spellbreaker", [0, 1]], ["bard", [0, 3]], ["warden", [3, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const foes = flipped ? battle.team : battle.sparring!.rivals
  const [binder, ranger, tank, berserker] = team
  const [mage, breaker, bard, hammer] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(binder, at(536, 865), { attack: 165, hp: 690 })
  Object.assign(ranger, at(315, 673), { hp: 263, armor: .12, actionAt: Infinity })
  Object.assign(tank, at(611, 944), { actionAt: Infinity })
  Object.assign(berserker, at(813, 952), { actionAt: Infinity })
  Object.assign(mage, at(572, 680), { hp: 700, actionAt: Infinity })
  Object.assign(breaker, at(719, 620), { hp: 760, actionAt: Infinity })
  Object.assign(bard, at(444, 767), { hp: 700, actionAt: Infinity })
  Object.assign(hammer, at(532, 942), { attack: 220 })
  if (mode === "existing-brace") battle.runtime.buffs.push({
    id: "brace", kind: "anti", values: [60, 6], style: "once", cast: newCast(battle, ranger, "skill"), target: ranger.id, until: 6,
  })
  assert.equal(issueEdgeOrder(battle, hammer, "skill", null, at(365, 650)), null)
  advance(battle, mode === "late" ? .218 : .018)
  const intent = chooseAiAttack(battle, binder, team, foes)
  assert.equal(intent?.order, "skill")
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, binder, "skill", null, intent.at), null)
  advance(battle, 1.1)
  assert.equal(ranger.hp, mode === "late" ? 0 : 37)
  assert(!isOutside(ranger))
  assert.equal(events.some(event => event.target === ranger.id && event.kind === "heal" && event.cast.signature?.id === "binder/Prismatic/P4"),
    mode !== "late")
  assert.equal(events.some(event => event.target === ranger.id && event.kind === "protect" && event.cast.skill?.id === "binder/Prismatic/A4"),
    mode === "arrives")
}
observations.retreatSealBrace = "kept a living ranger on the board before the hammer and accounted for stronger existing brace and late casts"

for (const flipped of [false, true]) for (const interrupted of [false, true]) {
  const offense = [makeCard(pick("binder", [4, 0], [2, 4]), "Prismatic", 0),
    ...cards([["ranger", [1, 3]], ["warden", [3, 0]], ["berserker", [2, 3]]], "Prismatic")]
  const defense = cards([["warlock", [2, 4]], ["spellbreaker", [0, 1]], ["bard", [0, 3]], ["warden", [3, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const foes = flipped ? battle.team : battle.sparring!.rivals
  const [binder, ranger, tank, berserker] = team
  const [mage, breaker, bard, warden] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(binder, at(603, 950), { attack: 165, hp: 690 })
  Object.assign(ranger, at(402, 970), { hp: 305, actionAt: Infinity })
  Object.assign(tank, at(652, 836), { actionAt: Infinity })
  Object.assign(berserker, at(900, 1025), { actionAt: Infinity })
  Object.assign(mage, at(649, 716), { hp: 680, move: at(535, 710), actionAt: Infinity })
  Object.assign(breaker, at(704, 469), { hp: 715, armor: .08, move: at(582, 465), actionAt: Infinity })
  Object.assign(bard, at(525, 550), { hp: 695, move: at(610, 544), actionAt: Infinity })
  Object.assign(warden, at(594, 813), { hp: 900 })
  if (interrupted) {
    Object.assign(warden, at(579, 692), { attack: 150 })
    assert.equal(issueEdgeOrder(battle, warden, "skill", null, at(584, 921)), null)
  }
  advance(battle, .018)
  const intent = chooseAiAttack(battle, binder, team, foes)
  assert.equal(intent?.order, interrupted ? "skill2" : "skill")
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, binder, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, .64)
  if (!interrupted) {
    const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
    const contact = announcedStrikes(battle, bard, 1, position).find(({ strike }) => strike.cast.skill?.id === "binder/Prismatic/A5")
    assert(contact && "area" in contact.strike && contact.strike.excludedTarget === breaker.id)
    assert(announcedShift(battle, contact, bard, position))
    assert(!announcedShift(battle, contact, breaker, position))
    assert(!announcedHit(battle, contact, bard, position(bard, contact.at), position))
  }
  advance(battle, 1.3)
  if (!interrupted) {
    assert.deepEqual(events.filter(event => event.kind === "hit" && event.cast.skill?.id === "binder/Prismatic/A5" && !event.cast.signature)
      .map(event => event.target), [warden.id, mage.id, bard.id, breaker.id])
    assert(events.some(event => event.kind === "pull" && event.target === bard.id && event.cast.skill?.id === "binder/Prismatic/A5"))
    assert(events.some(event => event.kind === "hit" && event.target === breaker.id && event.cast.signature?.id === "binder/Prismatic/P5"))
  }
}
observations.pressurePinEcho = "aimed across moving targets, pulled toward the far hit's old position, and avoided a broken windup"

for (const flipped of [false, true]) for (const charging of [false, true]) {
  const { battle, actor, events } = start([["binder", [4, 0]], ["ranger", [1, 3]]])
  const ranger = battle.team[1], boss = battle.boss
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.nextThinkAt = Infinity
  Object.assign(actor, at(804, 697), { attack: 165, hp: 690 })
  Object.assign(ranger, at(830, 768), { hp: 125, actionAt: Infinity })
  Object.assign(boss, charging ? at(935, 564) : at(908, 435), { attack: 330, moveAt: Infinity, hp: 1400 })
  if (charging) assert(startBossCharge(battle, ranger))
  const intent = chooseAiAttack(battle, actor, battle.team, [boss])
  assert.equal(intent?.order, "skill")
  assert.equal(intent.value > 3.5, charging)
  assert.equal(issueEdgeOrder(battle, actor, intent.order, null, intent.at), null)
  advance(battle, 1.4)
  assert.equal(events.some(event => event.kind === "interrupt" && event.target === boss.id &&
    event.cast.skill?.id === "binder/Prismatic/A5"), charging)
  assert.equal(ranger.hp, 125)
}
observations.pressurePinCharge = "preferred the real ring-out that cancelled a threatening boss charge"

for (const flipped of [false, true]) for (const mode of ["danger", "cooling", "warded", "shorter"] as const) {
  const offense = [makeCard(pick("berserker", [0, 2], [0, 1], 0), "Prismatic", 0),
    ...cards([["paladin", [1, 2]], ["binder", [0, 4]], ["bard"]], "Prismatic")]
  const defense = cards([["warden", [1, 4]], ["summoner", [1, 2]], ["dancer", [2, 3]], ["warlock", [1, 4]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const [berserker, paladin, binder, bard] = flipped ? battle.sparring!.rivals : battle.team
  const [warden, summoner, dancer, mage] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.time = 3.75
  const enemy = flipped ? battle.sparring! : battle
  enemy.sharedAt = 4.65
  Object.assign(warden, at(807.79, 441.38), { hp: 854, actionAt: 6.017 })
  Object.assign(summoner, at(711.85, 422.82), { hp: 723, actionAt: 6.45 })
  Object.assign(dancer, at(528, 356), { actionAt: 7.317 })
  Object.assign(mage, at(368, 261), { hp: 538, actionAt: 7.383, shield: mode === "warded" ? 90 : 0, shieldUntil: 8 })
  Object.assign(paladin, at(518, 1012), { actionAt: 5.017 })
  Object.assign(berserker, at(528, 1012), { hp: 978, move: at(584.6, 830.63), actionAt: mode === "cooling" ? 7 : 0 })
  Object.assign(binder, at(668.87, 945.73), { hp: 462, actionAt: 8.317 })
  Object.assign(bard, at(848, 1012), { actionAt: 6.683 })
  const exit = mode === "shorter" ? at(447, 548) : at(538.80, 679.06)
  assert.equal(portalExitIsExposed(battle, mage, exit, 4.811, battle.time, false, true, at(374.67, 450.88)), mode === "danger")
}
observations.portalTrinity = "rejected the isolated exit under a legal trinity and next line, and kept safe exits open"

for (const flipped of [false, true]) for (const mode of ["route", "erased", "cooling"] as const) {
  const offense = [makeCard(pick("assassin", [3, 2], [3, 7]), "Prismatic", 0),
    ...cards([["warlock", [1, 2]], ["warden", [3, 0]], ["ranger", [1, 3]]], "Prismatic")]
  const defense = cards([["warlock", [2, 4]], ["spellbreaker", [0, 1]], ["bard", [0, 3]], ["warden", [3, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [assassin, mage, guard, ranger] = allies
  const [target, breaker, bard, hammer] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  Object.assign(assassin, at(625, 890), { attack: 186, hp: 545 })
  Object.assign(mage, at(620, 621), { attack: 156, hp: 278, range: 60, actionAt: mode === "cooling" ? 4.5 : mode === "erased" ? 1.7 : .91 })
  Object.assign(guard, at(485, 881), { actionAt: Infinity })
  Object.assign(ranger, at(776, 936), { actionAt: Infinity })
  Object.assign(target, at(620, 561), { move: at(620, 750), hp: 535, actionAt: Infinity })
  Object.assign(breaker, mode === "erased" ? at(846, 443) : at(968, 288), { hp: 540, actionAt: mode === "erased" ? 0 : Infinity })
  Object.assign(bard, at(239, 355), { hp: 620, actionAt: Infinity })
  Object.assign(hammer, at(918, 1042), { hp: 940, actionAt: Infinity })
  advance(battle, .018)
  const opening = chooseAiAttack(battle, assassin, allies, enemies)
  assert.equal(opening?.order, mode === "cooling" ? "skill2" : "skill")
  if (!opening || mode === "cooling") continue
  assert.equal(opening.target, target)
  assert.equal(issueEdgeOrder(battle, assassin, opening.order, target, opening.at), null)
  if (mode === "erased") {
    advance(battle, .60)
    assert.equal(issueEdgeOrder(battle, breaker, "skill", null, at(620, 595)), null)
  }
  advance(battle, mode === "erased" ? 1.75 : 1.02)
  const follow = chooseAiAttack(battle, mage, allies, enemies)
  assert.equal(follow?.order, "skill")
  assert.equal(issueEdgeOrder(battle, mage, follow.order, null, follow.at), null)
  advance(battle, 2.6)
  assert.equal(events.some(event => event.cast.skill?.id === "assassin/Prismatic/A4" && event.kind === "hit" && event.zone &&
    event.target === target.id && (event.amount ?? 0) > 0), mode === "route")
  assert.equal(events.some(event => event.cast.signature?.id === "assassin/Prismatic/P4" && event.kind === "shield" &&
    event.target === mage.id && (event.amount ?? 0) > 0), mode === "route")
}
observations.shadowPitRelay = "sent a second card's manual shove back through the marked ring and dropped the route after clear"

for (const flipped of [false, true]) for (const needed of ["pulse", "seed"] as const) {
  const offense = [makeCard(pick("lifebringer", needed === "pulse" ? [2, 4] : [2, 3], [2, 7]), "Prismatic", 0),
    ...cards([["ranger", [1, 3]], ["warden", [3, 0]], ["healer", [4, 2]]], "Prismatic")]
  const defense = cards([["warlock", [2, 4]], ["spellbreaker", [0, 1]], ["bard", [0, 3]], ["warden", [3, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const [actor, ranger, guard, healer] = allies
  const [mage, breaker, bard, hammer] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  Object.assign(actor, at(617, 909), { hp: 731, attack: 146 })
  Object.assign(ranger, at(427, 734), { hp: needed === "pulse" ? 104 : 30, actionAt: Infinity })
  Object.assign(guard, at(813, 855), { hp: 975, actionAt: Infinity })
  Object.assign(healer, at(524, 939), { hp: 728, actionAt: Infinity })
  Object.assign(mage, at(895, 393), { hp: 720, actionAt: Infinity })
  Object.assign(breaker, at(946, 557), { hp: 720, actionAt: Infinity })
  Object.assign(bard, at(441, 388), { hp: 760, actionAt: Infinity })
  Object.assign(hammer, at(566, 563), { attack: 135, hp: 975 })
  assert.equal(issueEdgeOrder(battle, hammer, "skill", null, at(338, 813)), null)
  advance(battle, .018)
  const rescue = rescueFromAnnouncedStrike(battle, allies)
  assert.equal(rescue?.actor, actor)
  assert(rescue)
  const { intent } = rescue
  assert.equal(intent.order, needed === "pulse" ? "skill" : "skill2")
  assert.equal(issueEdgeOrder(battle, actor, intent.order, intent.target ?? null, intent.at), null)
  const relevantHealing = (event: SkillEvent) => event.kind === "heal" && event.target === ranger.id && (event.amount ?? 0) > 0 &&
    event.cast.skill?.id === (needed === "pulse" ? "lifebringer/Prismatic/A3" : "lifebringer/Prismatic/A4")
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  if (needed === "pulse") assert(scheduledAid(battle, ranger, .5, position).some(effect => effect.heal === 42))
  advance(battle, .7)
  const wound = events.findIndex(event => event.kind === "hit" && event.cast.owner === hammer.id && event.target === ranger.id)
  const heal = events.findIndex(relevantHealing)
  assert(wound >= 0 && heal >= 0 && heal < wound && ranger.hp > 0)
  if (needed === "pulse") assert.equal(scheduledAid(battle, ranger, 2.7, position).filter(effect => effect.heal > 0).length, 2)
}
observations.reservoirRescue = "resolved the first pulse before the hammer and selected a larger heal when a pulse was too small"

{
  const { battle, actor, events, opponents: [guard] } = start([["lifebringer", [2, 3]], ["ranger"]], [["warden", [3, 0]]])
  battle.nextThinkAt = Infinity
  battle.sparring!.sharedAt = 0
  const ranger = battle.team[1]
  place(actor, 617, 909)
  place(ranger, 580, 840, .3)
  place(guard, 617, 520)
  assert.equal(issueEdgeOrder(battle, guard, "skill", null, actor), null)
  advance(battle, .25)
  assert.equal(issueEdgeOrder(battle, actor, "skill", null, ranger), null)
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  assert(!scheduledAid(battle, ranger, .9, position).some(effect => effect.heal))
  advance(battle, .95)
  assert(events.some(event => event.kind === "push" && event.target === actor.id && event.cast.owner === guard.id))
  assert(!events.some(event => event.kind === "deploy" && event.cast.skill?.id === "lifebringer/Prismatic/A3"))
}
observations.reservoirWindup = "dropped a queued pulse when the caster was about to be forced away before opening"

for (const flipped of [false, true]) {
  const offense = [makeCard(pick("lifebringer", [2, 3], [2, 7]), "Prismatic", 0),
    ...cards([["ranger", [1, 3]], ["warden", [3, 0]], ["healer", [4, 2]]], "Prismatic")]
  const defense = cards([["warlock", [2, 4]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [actor, ranger, guard, healer] = allies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  Object.assign(actor, at(510, 942), { hp: 802, attack: 146 })
  Object.assign(ranger, at(830, 630), { hp: 124, actionAt: Infinity })
  Object.assign(guard, at(623, 672), { hp: 825, actionAt: Infinity })
  Object.assign(healer, at(551, 665), { hp: 730 })
  Object.assign(enemies[0], at(895, 393), { hp: 720, actionAt: Infinity })
  advance(battle, .018)
  const intent = chooseAiAttack(battle, actor, allies, enemies)
  assert.equal(intent?.order, "skill")
  assert.equal(issueEdgeOrder(battle, actor, intent.order, null, intent.at), null)
  advance(battle, battle.time + 1)
  assert.equal(issueEdgeOrder(battle, healer, "skill", healer, healer), null)
  advance(battle, 2.6)
  const deposits = events.filter(event => event.cast.skill?.id === "lifebringer/Prismatic/A3" && event.kind === "assist" && event.style === "bank")
  assert.equal(deposits.reduce((sum, event) => sum + (event.amount ?? 0), 0), 159)
  assert(events.some(event => event.cast.signature?.id === "lifebringer/Prismatic/P3" && event.kind === "shield" && event.target === actor.id))
  advance(battle, 9.6)
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  assert(scheduledAid(battle, ranger, 10.3, position).some(effect => effect.noBank && effect.heal === 125))
  advance(battle, 10.3)
  assert(events.some(event => event.cast.skill?.id === "lifebringer/Prismatic/A3" && event.kind === "heal" && event.style === "bank" &&
    event.target === ranger.id && event.amount === 125))
}
observations.reservoirPayout = "took overhealing from both casts, queued the bank's actual flight, and delivered it to the lowest ally"

for (const flipped of [false, true]) for (const early of [false, true]) {
  const offense = [makeCard(pick("bard", [2, 3], [2, 3]), "Prismatic", 0),
    ...cards([["ranger", [1, 3]], ["warlock", [1, 2]], ["warden", [0, 3]]], "Prismatic")]
  const defense = cards([["warlock", early ? [1, 2] : [2, 1]], ["spellbreaker", [0, 1]], ["healer", [4, 2]], ["warden", [3, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [bard, ranger, mage, guard] = allies
  const [attacker, breaker, healer, hammer] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  Object.assign(bard, at(598, 960), { attack: 112, hp: 535 })
  Object.assign(ranger, at(623, 662), { hp: 103, actionAt: Infinity })
  Object.assign(mage, at(504, 909), { hp: 345, actionAt: 3.3 })
  Object.assign(guard, at(843, 798), { actionAt: 5.3 })
  Object.assign(attacker, at(600, 340), { attack: 260, hp: 640 })
  Object.assign(breaker, at(940, 510), { actionAt: Infinity })
  Object.assign(healer, at(448, 290), { actionAt: Infinity })
  Object.assign(hammer, at(971, 315), { actionAt: Infinity })
  assert.equal(issueEdgeOrder(battle, attacker, "skill", null, early ? ranger : at(661, 1001)), null)
  advance(battle, .032)
  const rescue = rescueFromAnnouncedStrike(battle, allies)
  const intent = rescue?.actor === bard ? rescue.intent : chooseAiAttack(battle, bard, allies, enemies)
  assert.equal(intent?.order, early ? "skill2" : "skill")
  assert.equal(!!rescue, !early)
  assert(intent)
  assert.equal(issueEdgeOrder(battle, bard, intent.order, null, intent.at), null)
  advance(battle, .84)
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  assert.equal(scheduledAid(battle, ranger, 1.3, position).some(aid => aid.shield === 132), !early)
  advance(battle, 1.3)
  assert.equal(ranger.hp, early ? 0 : 103)
  assert.equal(events.some(event => event.cast.skill?.id === "bard/Prismatic/A3" && event.kind === "shield" && event.target === ranger.id), !early)
}
observations.overtureDodge = "slid a dying ally clear of an announced line on both sides, and declined a rescue before the first seat could launch"

for (const flipped of [false, true]) {
  const { battle, actor: bard, events } = start([["bard", [2, 3]], ["ranger", [1, 3]], ["warlock", [1, 2]]])
  const [ranger, warlock] = battle.team.slice(1)
  const boss = battle.boss
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.nextThinkAt = Infinity
  Object.assign(bard, at(598, 960), { attack: 112, hp: 535 })
  Object.assign(ranger, at(623, 662), { hp: 103, actionAt: Infinity })
  Object.assign(warlock, at(504, 909), { hp: 345, actionAt: 3.3 })
  Object.assign(boss, at(602, 435), { hp: 1800, attack: 330, moveAt: Infinity })
  assert(startBossCharge(battle, ranger))
  advance(battle, 2.14)
  const intent = chooseAiAttack(battle, bard, battle.team, [boss])
  assert.equal(intent?.order, "skill")
  assert.equal(issueEdgeOrder(battle, bard, intent.order, null, intent.at), null)
  advance(battle, 3.3)
  assert.equal(ranger.hp, 103)
  assert(events.some(event => event.cast.skill?.id === "bard/Prismatic/A3" && event.kind === "shield" && event.target === ranger.id))
  assert(boss.force || edgeDistance(boss, at(602, 435)) > 85)
}
observations.overtureCharge = "used a legal formation slide across the boss's committed charge lane"

for (const flipped of [false, true]) for (const mode of ["relay", "cleared", "full"] as const) {
  const offense = [makeCard(pick("bard", [3, 1], [3, 2]), "Prismatic", 0),
    ...cards([["warlock", [1, 0]], ["ranger", [1, 3]], ["warden", [0, 3]]], "Prismatic")]
  const defense = cards([["warlock", [2, 1]], ["spellbreaker", [0, 1]], ["healer", [4, 2]], ["warden", [3, 0]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(defense, offense) : createEdgeBattle(offense, defense)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [bard, caster, patient, guard] = allies
  const [target, breaker, healer, hammer] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  Object.assign(bard, at(635, 926), { attack: 120, hp: 601 })
  Object.assign(caster, at(472, 733), { attack: 171, hp: 700, actionAt: .95 })
  Object.assign(patient, at(438, 817), { hp: 130, actionAt: Infinity })
  Object.assign(guard, at(351, 975), { hp: 970, actionAt: Infinity })
  Object.assign(target, at(781, 642), { move: at(781, 639), hp: 645, actionAt: Infinity })
  Object.assign(breaker, at(987, 283), { hp: 710, actionAt: mode === "cleared" ? 0 : Infinity })
  Object.assign(healer, at(875, 293), { hp: 690, actionAt: Infinity })
  Object.assign(hammer, at(1151, 337), { hp: 970, actionAt: Infinity })
  if (mode === "full") for (const unit of allies) unit.hp = unit.maxHp
  if (mode === "cleared") assert.equal(issueEdgeOrder(battle, breaker, "skill", null, at(638, 681)), null)
  advance(battle, .031)
  const opening = chooseAiAttack(battle, bard, allies, enemies)
  assert.equal(opening?.order, "skill")
  assert.equal(issueEdgeOrder(battle, bard, opening.order, null, opening.at), null)
  advance(battle, 1.02)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "bard/Prismatic/A4")
  assert.equal(!!field && !!areaHits(field.area, caster), mode === "relay")
  const follow = chooseAiAttack(battle, caster, allies, enemies)
  assert.equal(follow?.order, "skill")
  assert.equal(issueEdgeOrder(battle, caster, follow.order, null, follow.at), null)
  advance(battle, 1.72)
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  assert.equal(scheduledAid(battle, patient, 2, position).some(aid => aid.heal === 76), mode === "relay")
  advance(battle, 1.98)
  assert(events.some(event => event.cast.skill?.id === "bard/Prismatic/A4" && event.kind === "hit" && event.target === target.id))
  assert.equal(events.some(event => event.cast.skill?.id === "bard/Prismatic/A4" && event.kind === "assist" && event.style === "bardSpectrum" &&
    event.target === patient.id && event.amount === 111), mode === "relay")
}
observations.spectrumRelay = "placed the circle around both a real opening hit and a follow-up caster, with clear and full-health controls"

for (const flipped of [false, true]) {
  const team = cards([["bard", [2, 3]], ["summoner"]], "Prismatic")
  const foes = cards([["ranger", [4, 0]]], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, team) : createEdgeBattle(team, foes)
  const allies = flipped ? battle.sparring!.rivals : battle.team
  const enemies = flipped ? battle.team : battle.sparring!.rivals
  const [bard, runner] = allies
  const [ranger] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  const events: { at: number; event: SkillEvent }[] = []
  battle.onSkillEvent = event => events.push({ at: battle.time, event })
  Object.assign(bard, at(520, 950))
  Object.assign(runner, at(535, 700), { hp: 70 })
  Object.assign(ranger, at(390, 700), { attack: 300 })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(600, 700)), null)
  advance(battle, .12)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "ranger/Radiant/A5")!
  assert.equal(field.mode, "enter")
  const across = at(655, 700)
  const around = at(525, 790)
  const arrive = (point: typeof across) => battle.time + edgeDistance(runner, point) / movementSpeed(battle, runner)
  assert(!areaHits(field.area, runner) && !areaHits(field.area, across))
  assert(walksIntoAnnouncedArea(battle, runner, across, arrive(across)))
  assert(!walksIntoAnnouncedArea(battle, runner, around, arrive(around)))
  const seats = overturePlacements(battle, bard, activeFor(bard, "skill"), allies, enemies)!
  assert(!seats.evaluate(at(685, 700)))
  const clearSeats = seats.evaluate(at(525, 750))
  assert(clearSeats?.beats.has(runner))
  const start = battle.time, origin = { ...runner }, arrival = arrive(across)
  const walking = (unit: EdgeUnit, time: number) => unit === runner ? walkAt(origin, across, start, arrival, time) : unit
  const [contact] = entryFieldContacts(battle, runner, arrival, walking)
  assert(contact?.zone)
  assert.equal(moveEdgeFighter(battle, runner, across), null)
  advance(battle, arrival)
  assert.equal(runner.hp, 0)
  const hit = events.find(({ event }) => event.kind === "hit" && event.cast.id === field.cast.id && event.target === runner.id)
  assert(hit?.event.zone && Math.abs(hit.at - contact.at) <= SPARRING_STEP + 1e-6)
  assert(field.seen.has(runner.id))
  assert.equal(entryFieldContacts(battle, runner, battle.time + 1, walking).length, 0)
}
observations.armedEntryLine = "on both sides, rejected a deadly formation slide and a walk crossing an armed line, with a clean route and an actual first contact"

for (const armed of [false, true]) {
  const { battle, actor: ranger } = start([["ranger", [4, 0]]], undefined, "Radiant")
  const { boss } = battle
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  battle.nextThinkAt = Infinity
  Object.assign(ranger, { x: 810, y: 700, attack: 300 })
  Object.assign(boss, { x: 472, y: 700, hp: 200, actionAt: Infinity })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, { x: 600, y: 700 }), null)
  advance(battle, .12)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "ranger/Radiant/A5")!
  if (!armed) field.seen.add(boss.id)
  battle.nextThinkAt = battle.time
  advance(battle, 2.25)
  assert.equal(boss.hp, 200)
  assert.equal(events.some(event => event.kind === "startMove" && event.target === boss.id), !armed)
}
observations.bossArmedEntryLine = "PvE withheld a lethal advance while the line was armed and advanced after its entry hit had been spent on the boss"

for (const flipped of [false, true]) for (const imminent of [false, true]) {
  const formation: Member[] = [["ranger", [2, 4]], ["warlock", [2, 4]], ["bard", [2, 4]], ["healer", [2, 4]]]
  const rivals: Member[] = [["ranger", [4, 2]], ...formation.slice(1)]
  const allies = cards(formation, "Prismatic"), foes = cards(rivals, "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [ranger, mage, bard, healer] = team
  const [trap, foeMage, foeBard, foeHealer] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(ranger, at(848, 356), { actionAt: 4.08, hp: 695 })
  Object.assign(mage, at(688, 356), { actionAt: imminent ? .38 : 1.5, hp: 488 })
  Object.assign(bard, at(803.2, 848.21), { actionAt: 2.72, hp: 565, shield: 147, shieldUntil: 4 })
  Object.assign(healer, at(368, 356), { actionAt: 1.82 })
  Object.assign(trap, at(360.03, 670.22), { hp: 661 })
  Object.assign(foeMage, at(430, 1012), { hp: 305 })
  Object.assign(foeBard, at(806.26, 1001.96), { actionAt: .847, hp: 362 })
  Object.assign(foeHealer, at(946, 1012), { actionAt: 3.23, hp: 801 })
  assert.equal(issueEdgeOrder(battle, trap, "skill", null, at(703.9, 448.79)), null)
  advance(battle, .032)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "ranger/Radiant/A5")!
  const direct = at(688.25, 458.87)
  assert(walksIntoAnnouncedArea(battle, ranger, direct, battle.time + edgeDistance(ranger, direct) / movementSpeed(battle, ranger)))
  trap.actionAt = 4.3
  const enemyClocks = flipped ? battle : battle.sparring!
  Object.assign(enemyClocks, { moveAt: 2.6, sharedAt: .22 })
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  battle.nextThinkAt = battle.time
  advance(battle, .13)
  const move = events.find(event => event.kind === "startMove")!
  assert.equal(move.cast.owner, (imminent ? ranger : mage).id)
  battle.nextThinkAt = Infinity
  advance(battle, 1.35)
  assert(!events.some(event => event.kind === "hit" && event.cast.id === field.cast.id && event.target === move.target))
}
observations.advancePreservesReadyShot = "took the ranger's safe approach while preserving an imminent long cast, and let the mage walk while cooling"

for (const flipped of [false, true]) for (const mode of ["crossing", "flank", "cooling"] as const) {
  const allies = cards([["bulwark", [2, 4]], ["summoner", [2, 4]], ["bard", [2, 4]], ["healer", [2, 4]]], "Prismatic")
  const foes = cards([["warden", [4, 2]], ["spellbreaker", [2, 4]], ["ranger", [4, 2]], ["healer", [2, 4]]], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [guard, summoner, bard, medic] = team
  const [warden, breaker, ranger, healer] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(guard, at(668.13, 843.13), { actionAt: 1.68, hp: 1080, shield: 231, shieldUntil: 4 })
  Object.assign(summoner, at(752.99, 628.18), { hp: 853, shield: 162, shieldUntil: 4 })
  Object.assign(bard, at(625.85, 615.83), { actionAt: 2.75, hp: 814, shield: 155, shieldUntil: 4 })
  Object.assign(medic, at(571.59, 775.29), { actionAt: 5.1, shield: 171, shieldUntil: 4 })
  Object.assign(warden, at(716.18, 914.97), { actionAt: mode === "cooling" ? 3 : .21, hp: 902 })
  Object.assign(breaker, at(628.65, 923.96), { actionAt: 2.46 })
  Object.assign(ranger, at(795.58, 945.3), { actionAt: 1.54 })
  Object.assign(healer, at(773.13, 886.37), { actionAt: 1.4 })
  const crossing = at(671.08, 765.63), flank = at(787, 713)
  const score = teamAdvanceScoring(battle, flipped ? "enemy" : "ally", team, enemies)
  const path = (stop: typeof crossing) => ({ landing: stop, stop, arrival: edgeDistance(bard, stop) / movementSpeed(battle, bard) })
  const difference = score(bard, warden, path(flank)) - score(bard, warden, path(crossing))
  assert(mode === "cooling" ? difference < 0 : difference > 25)
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(moveEdgeFighter(battle, bard, mode === "flank" ? flank : crossing), null)
  advance(battle, .233)
  assert.equal(issueEdgeOrder(battle, warden, "skill", null, at(613.78, 745.44)), mode === "cooling" ? "角色冷却中" : null)
  advance(battle, .60)
  const pushed = events.filter(event => event.kind === "push" && event.cast.skill?.id === "warden/Radiant/A5")
  assert.equal(pushed.length, mode === "crossing" ? 3 : mode === "flank" ? 2 : 0)
}
observations.advanceAvoidsReadyPush = "discounted a walk that turns a ready line into a three-card hit, and kept the flank and the cooldown control"

for (const flipped of [false, true]) for (const mode of ["paper", "walk", "unguarded", "warded", "late"] as const) {
  const allies = cards([["summoner", [2, 4]], ["bard", [3, 4]]], "Prismatic")
  const foes = cards([["ranger", [4, 0]]], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [summoner, patient] = team
  const [ranger] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(ranger, at(963, 1142), { actionAt: mode === "late" ? 3 : .62, attack: 155 })
  Object.assign(summoner, at(820, 820), { actionAt: mode === "walk" || mode === "unguarded" ? 4 : 0 })
  Object.assign(patient, at(538.2, 936.04), { hp: 145, actionAt: 4, shield: mode === "warded" ? 160 : 0, shieldUntil: 5 })
  assert.equal(moveEdgeFighter(battle, ranger, at(953, 1069.27)), null)
  advance(battle, .032)
  assert(isOutside(ranger))
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const [threat] = shortAreaThreats(battle, patient, enemies, battle.time + 2 * COOLDOWN.shared, position, battle.time, undefined, "entry")
  assert.equal(!!threat?.zone, mode !== "late")
  const rescue = rescueFromAnnouncedStrike(battle, team, enemies)
  const retreat = leaveLethalAreaReach(battle, patient, enemies)
  assert.equal(!!rescue, mode === "paper")
  assert.equal(!!retreat, mode !== "warded" && mode !== "late")
  if (rescue) {
    assert.equal(rescue.actor, summoner)
    assert.equal(rescue.intent.target, patient)
    assert.equal(issueEdgeOrder(battle, summoner, rescue.intent.order, patient, rescue.intent.at), null)
  }
  if (mode === "walk") {
    assert(retreat && retreat.value > 3)
    assert.equal(moveEdgeFighter(battle, patient, retreat.point), null)
  }
  advance(battle, 1.45)
  const range = activeFor(ranger, "skill").aim.range
  const gap = edgeDistance(ranger, patient)
  const aim = gap > range ? along(ranger, direction(ranger, patient), range - .1) : patient
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, aim), mode === "late" ? "角色冷却中" : null)
  assert.equal(patient.hp, { paper: 45, walk: 145, unguarded: 0, warded: 127, late: 145 }[mode])
  assert.equal(battle.runtime.summons.some(group => group.deployment.kind === "paperPack" &&
    group.deployment.bodies.some(body => body.hp < body.maxHp)), mode === "paper")
}
observations.returningEntryResponse = "moved out or used real paper guards against an instant shot after a committed reentry, with late, prewarded and lethal controls"

for (const flipped of [false, true]) for (const mode of ["interrupt", "outside-line", "cooling"] as const) {
  const allies = cards([["bard", [2, 4]], ["summoner", [2, 4]], ["bulwark", [2, 4]], ["healer", [2, 4]]], "Prismatic")
  const foes = cards([["warden", [4, 2]]], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [bard, summoner, guard, healer] = team
  const [warden] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(bard, at(589.12, mode === "outside-line" ? 738 : 808.66), { hp: 521 })
  Object.assign(summoner, at(588.07, 779.58), { actionAt: 3 })
  Object.assign(guard, at(565.07, 908.8), { actionAt: 3 })
  Object.assign(healer, at(575.69, 962.82), { actionAt: 3, hp: 252 })
  Object.assign(warden, at(595.02, 1061), { actionAt: mode === "cooling" ? 1.5 : 0 })
  const intent = chooseAiAttack(battle, bard, team, enemies)
  assert.equal(intent?.order === "skill", mode !== "interrupt")
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  assert.equal(issueEdgeOrder(battle, bard, "skill", null, at(589.12, 808.66)), null)
  assert.equal(issueEdgeOrder(battle, warden, "skill", null, at(565.07, 908.8)), mode === "cooling" ? "角色冷却中" : null)
  advance(battle, 1.4)
  assert.equal(events.some(event => event.cast.skill?.id === "warden/Radiant/A5" && event.kind === "push" && event.target === bard.id),
    mode === "interrupt")
  assert.equal(impact(events, "bard/Prismatic/A3", "shield"), mode === "interrupt" ? 0 : 4)
}
observations.overtureReadyInterruption = "passed on a cast that a ready multi-target line cuts, and executed it outside the line or during cooldown"

for (const flipped of [false, true]) for (const mode of ["paper", "unguarded", "cooling", "healthy", "distant"] as const) {
  const allies = cards([["summoner", [2, 4]], ["bard", [3, 4]]], "Prismatic")
  const foes = cards([["spellbreaker", [4, 2]]], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [summoner, patient] = team
  const [breaker] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(summoner, at(682, 841), { actionAt: mode === "unguarded" ? 3 : 0 })
  Object.assign(patient, at(mode === "distant" ? 417 : 718.64, 783.18), { actionAt: 3, hp: mode === "healthy" ? 375 : 170 })
  Object.assign(breaker, at(819.28, 895.65), { actionAt: mode === "cooling" ? 1.5 : 0, attack: 155 })
  const rescue = rescueFromAnnouncedStrike(battle, team, enemies)
  assert.equal(!!rescue, mode === "paper")
  if (rescue) {
    assert.equal(rescue.actor, summoner)
    assert.equal(rescue.intent.target, patient)
    assert.equal(issueEdgeOrder(battle, summoner, rescue.intent.order, patient, rescue.intent.at), null)
  }
  assert.equal(issueEdgeOrder(battle, breaker, "skill", patient, patient),
    mode === "cooling" ? "角色冷却中" : mode === "distant" ? "超出射程" : null)
  advance(battle, .7)
  assert.equal(patient.hp, { paper: 70, unguarded: 0, cooling: 170, healthy: 197, distant: 170 }[mode])
  assert.equal(battle.runtime.summons.some(group => group.deployment.kind === "paperPack" &&
    group.deployment.bodies.some(body => body.hp < body.maxHp)), mode === "paper")
}
observations.readyBorrowInterception = "used paper dolls before a lethal lock, with range, cooldown and health controls for the live spell"

for (const flipped of [false, true]) for (const mode of ["ready", "cooling", "forced-walk", "healthy"] as const) {
  const allies = [makeCard(pick("spellbreaker", [4, 2]), "Radiant", 0),
    ...cards([["healer", [2, 4]], ["bard", [2, 4]]], "Prismatic").map((card, index) => ({ ...card, uid: index + 2 }))]
  const battle = createEdgeBattle(allies)
  const { boss, team: [breaker, near, flank] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(breaker, at(956, 690), { actionAt: mode === "cooling" ? 4 : .02, attack: 155 })
  Object.assign(near, at(775, 681), { actionAt: Infinity })
  Object.assign(flank, at(247, 956), { actionAt: Infinity })
  Object.assign(boss, at(491, 690), { hp: mode === "healthy" ? 370 : 140, actionAt: 1.74 })
  const stop = at(680, 690)
  const path = { landing: stop, stop, arrival: edgeDistance(boss, stop) / movementSpeed(battle, boss) }
  assert.equal(walksIntoReadyFinish(battle, boss, battle.team, path), mode === "ready" || mode === "forced-walk")
  const events: SkillEvent[] = []
  battle.onSkillEvent = event => events.push(event)
  if (mode === "forced-walk") assert.equal(moveEdgeFighter(battle, boss, stop), null)
  else battle.nextThinkAt = battle.time
  let cast = false
  while (battle.time < 1.7 && battle.phase === "running") {
    if (!cast && battle.time >= breaker.actionAt && edgeDistance(breaker, boss) <= activeFor(breaker, "skill").aim.range)
      cast = issueEdgeOrder(battle, breaker, "skill", boss, boss) === null
    stepEdgeBattle(battle, SPARRING_STEP)
  }
  const walk = events.find(event => event.kind === "startMove" && event.target === boss.id)?.landing
  assert(walk)
  assert.equal(edgeDistance(walk, flank) < edgeDistance(walk, near), mode === "ready")
  assert.equal(boss.hp, { ready: 140, cooling: 140, "forced-walk": 0, healthy: 142 }[mode])
}
observations.pveBorrowApproach = "the boss approached the safe target before a ready lethal lock, and confirmed the real loss and survivable paths"

for (const flipped of [false, true]) for (const mode of ["retreat", "stand", "cooling", "warded", "no-return"] as const) {
  const allies = [makeCard(pick("bard", [2, 4], [2, 5]), "Prismatic", 0), makeCard(pick("bulwark", [2, 4], [2, 5]), "Prismatic", 1)]
  const foes = [makeCard(pick("spellbreaker", [4, 2], [2, 5]), "Radiant", 0), makeCard(pick("warden", [4, 2], [2, 5]), "Radiant", 1)]
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [patient, tank] = team
  const [breaker, warden] = enemies
  const theirs = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push(event)
  Object.assign(patient, at(619.91, 946.21), { hp: 102, shield: mode === "warded" ? 350 : 98, shieldUntil: 5, actionAt: 2.4 })
  Object.assign(tank, at(581.8, 975.01), { actionAt: 4 })
  tank.passiveAt[BULWARK_COVER.id] = 4
  Object.assign(breaker, at(926.66, 871.77), { actionAt: .1 })
  Object.assign(warden, at(506.72, 1213.27), { actionAt: mode === "cooling" ? 4 : 0 })
  if (mode !== "no-return") assert.equal(moveEdgeFighter(battle, warden, at(506.72, 1063.42)), null)
  theirs.sharedAt = .20
  const route = leaveConcentratedFire(battle, patient, team, enemies)
  assert.equal(!!route, mode === "retreat" || mode === "stand")
  if (mode === "retreat") assert.equal(moveEdgeFighter(battle, patient, route!.point), null)
  advance(battle, .232)
  assert.equal(issueEdgeOrder(battle, breaker, "skill", patient, patient), null)
  advance(battle, 1.865)
  assert.equal(issueEdgeOrder(battle, warden, "skill", null, patient), mode === "cooling" ? "角色冷却中" : null)
  advance(battle, 2.32)
  const hits = events.filter(event => event.kind === "hit" && event.target === patient.id)
  assert.equal(hits.some(event => event.cast.skill?.id === "spellbreaker/Radiant/A5"), mode !== "retreat")
  if (mode === "retreat") assert.equal(hits.find(event => event.cast.skill?.id === "warden/Radiant/A5")?.absorbed, 98)
  assert.equal(patient.hp, { retreat: 60, stand: 0, cooling: 38, warded: 102, "no-return": 38 }[mode])
}
observations.withdrawBeforeLockAndReturn = "left release range to keep the ward for the returning warden, with live hits and shared cooldown controls on both sides"

for (const flipped of [false, true]) for (const mode of ["armed", "overrun", "spent", "warded"] as const) {
  const allies = [makeCard(pick("bard", [2, 4], [2, 5]), "Prismatic", 0), makeCard(pick("bulwark", [2, 4], [2, 5]), "Prismatic", 1)]
  const foes = [makeCard(pick("ranger", [4, 2], [2, 5]), "Radiant", 0), makeCard(pick("warden", [4, 2], [2, 5]), "Radiant", 1)]
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [patient, tank] = team
  const [ranger, warden] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(patient, at(509.39, 967.99), { hp: 275, actionAt: 2, shield: mode === "warded" ? 180 : 0, shieldUntil: 3 })
  Object.assign(tank, at(604.1, 845.92), { actionAt: 4 })
  Object.assign(ranger, at(907.06, 695.3))
  Object.assign(warden, at(449.14, 976.21), { actionAt: 1.567 })
  const direct = retreatFromDive(battle, patient, team, enemies)
  assert(direct)
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(661.65, 992.96)), null)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "ranger/Radiant/A5")
  assert(field)
  if (mode === "spent") field.seen.add(patient.id)
  const route = retreatFromDive(battle, patient, team, enemies)
  assert(route)
  assert.equal(edgeDistance(direct.point, route.point) > 35, mode === "armed" || mode === "overrun")
  assert.equal(moveEdgeFighter(battle, patient, (mode === "overrun" ? direct : route).point), null)
  advance(battle, 1.5)
  assert.equal(patient.hp, { armed: 275, overrun: 191, spent: 275, warded: 263 }[mode])
}
observations.retreatAroundLiveEntryField = "reached the tank without crossing a damaging field, and kept the trade when a ward covered it or the field had already triggered"

for (const flipped of [false, true]) for (const mode of ["ready", "standing", "committed", "close", "cooling", "warded"] as const) {
  const allies = cards([["bard", [2, 4]]], "Prismatic")
  const foes = cards([["spellbreaker", [4, 2]]], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [patient] = team
  const [breaker] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(patient, at(mode === "close" ? 744 : 548, 690), { hp: 50, actionAt: 4, shield: mode === "warded" ? 350 : 0, shieldUntil: 3 })
  Object.assign(breaker, at(936, 690), { actionAt: mode === "cooling" ? 3.2 : mode === "committed" ? 0 : .58 })
  if (mode === "committed") assert.equal(issueEdgeOrder(battle, breaker, "skill", patient, patient), null)
  const route = leaveLethalTargetRange(battle, patient, enemies, mode === "committed" ? "announced" : "all")
  assert.equal(!!route, mode === "ready" || mode === "standing" || mode === "committed")
  if (mode === "ready" || mode === "committed") assert.equal(moveEdgeFighter(battle, patient, route!.point), null)
  advance(battle, .60)
  if (mode !== "committed") assert.equal(issueEdgeOrder(battle, breaker, "skill", patient, patient),
    mode === "cooling" ? "角色冷却中" : mode === "ready" ? "超出射程" : null)
  advance(battle, 1.07)
  assert.equal(patient.hp, mode === "close" || mode === "standing" ? 0 : 50)
}
observations.breakSpellOnReleaseRange = "moved out before a lethal spell became ready or during its windup, with sufficient ward, cooldown and unreachable escape controls"

for (const flipped of [false, true]) for (const mode of ["edge", "move-locked", "too-close", "warded"] as const) {
  const battle = createEdgeBattle(cards([["spellbreaker", [4, 2]]], "Radiant"))
  const { boss, team: [breaker] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const origin = at(mode === "too-close" ? 704 : 548, 690)
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.onSkillEvent = event => events.push(event)
  Object.assign(boss, origin, { hp: 50, shield: mode === "warded" ? 350 : 0, shieldUntil: 3,
    moveAt: mode === "move-locked" ? 1.8 : 0, actionAt: 4 })
  Object.assign(breaker, at(936, 690), { attack: 155 })
  assert.equal(issueEdgeOrder(battle, breaker, "skill", boss, boss), null)
  advance(battle, .64)
  const move = events.find(event => event.kind === "startMove" && event.target === boss.id)?.landing
  const hit = events.find(event => event.kind === "hit" && event.target === boss.id && event.cast.skill?.id === "spellbreaker/Radiant/A5")
  assert.equal(!!move && edgeDistance(breaker, move) > activeFor(breaker, "skill").aim.range, mode === "edge")
  assert.equal(!!hit, mode !== "edge")
  assert.equal(boss.hp, mode === "edge" || mode === "warded" ? 50 : 0)
  if (mode === "edge") assert(Math.abs(boss.moveAt - boss.sharedAt - (COOLDOWN.move - COOLDOWN.shared)) < 1e-6)
}
observations.pveBorrowReleaseDodge = "the live boss escaped before the spell resolved when movement was ready and the necessary distance was reachable"

for (const flipped of [false, true]) for (const mode of ["bend", "straight", "cooling", "warded"] as const) {
  const kit = (jobs: SubJobId[], rarity: Rarity) => jobs.map((job, index) => makeCard(pick(job, [2, 4], [2, 5]), rarity, index))
  const allies = kit(["bulwark", "summoner", "bard", "healer"], "Prismatic")
  const foes = kit(["warden", "spellbreaker", "ranger", "healer"], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [ours, theirs] = flipped ? [battle.sparring!, battle] : [battle, battle.sparring!]
  const [tank, summoner, bard, healer] = team
  const [warden, breaker, ranger, medic] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push(event)
  Object.assign(tank, at(690.5, 659.17), { shield: 23, shieldUntil: 4 })
  Object.assign(summoner, at(1141.56, 824.76), { hp: 307 })
  Object.assign(bard, at(1142.7, 697.34), { hp: 60, shield: mode === "warded" ? 480 : 0, shieldUntil: 5 })
  Object.assign(healer, at(708.68, 633.07), { hp: 343, shield: 108, shieldUntil: 3 })
  Object.assign(warden, at(867.72, 741), { hp: 542, shield: 195, shieldUntil: 4, actionAt: 4 })
  Object.assign(breaker, at(788.38, 864.27), { hp: 730, shield: 135, shieldUntil: 4, actionAt: mode === "cooling" ? 4 : 0 })
  Object.assign(ranger, at(976.19, 710.19), { hp: 46, actionAt: 4 })
  Object.assign(medic, at(545.73, 671.09), { hp: 493, actionAt: 4 })
  assert.equal(moveEdgeFighter(battle, summoner, at(937.65, 824.76)), null)
  assert.equal(moveEdgeFighter(battle, bard, at(940, 697.34)), null)
  assert.equal(moveEdgeFighter(battle, breaker, at(871.89, 811.97)), null)
  theirs.sharedAt = .433
  ours.moveAt = 1.667
  const original = at(992, 818.37)
  const plan = islandReturnCover(battle, tank, activeFor(tank, "skill2"), original, team, enemies)
  assert.equal(!!plan, mode === "bend" || mode === "straight")
  if (mode === "bend") {
    assert.equal(plan?.patient, bard)
    assert.equal(moveEdgeFighter(battle, bard, plan!.point), null)
    assert.equal(ours.moveAt, 1.667)
    assert.equal(ours.sharedAt, 0)
  }
  assert.equal(issueEdgeOrder(battle, tank, "skill2", null, mode === "bend" ? plan!.aim : original), null)
  advance(battle, .699)
  assert.equal(ranger.hp, 0)
  const lock = issueEdgeOrder(battle, breaker, "skill2", bard, bard)
  assert.equal(lock, mode === "bend" ? "超出射程" : mode === "cooling" ? "角色冷却中" : null)
  if (mode === "bend") assert.equal(issueEdgeOrder(battle, breaker, "skill2", summoner, summoner), null)
  advance(battle, .932)
  assert.equal(issueEdgeOrder(battle, healer, "skill2", null, at(992, mode === "bend" ? 723 : 824.76)), null)
  advance(battle, 1.5)
  assert.equal(bard.hp, { bend: 190, straight: 0, cooling: 190, warded: 151 }[mode])
  if (mode === "bend") {
    assert(events.some(event => event.kind === "shield" && event.target === summoner.id && event.cast.skill?.id === "bulwark/Prismatic/A5"))
    assert(events.some(event => event.kind === "heal" && event.target === bard.id && event.amount === 130))
  }
}
observations.islandReturnCover = "rerouted the returning ally and aimed the same island to stop the lock, keep the other ward and finish the enemy"

for (const flipped of [false, true]) for (const mode of ["flank", "wait", "straight", "warded", "spent"] as const) {
  const battle = createEdgeBattle(cards([["ranger", [4, 2]]], "Radiant"))
  const { boss, team: [ranger] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const origin = at(mode === "flank" || mode === "straight" ? 1100 : 1042, 690)
  const returns: { event: SkillEvent; time: number }[] = []
  battle.phase = "running"
  battle.onSkillEvent = event => {
    if (event.kind === "startMove" && event.target === boss.id && event.style === "return") returns.push({ event, time: battle.time })
  }
  Object.assign(boss, origin, { hp: 50, shield: mode === "warded" ? 350 : 0, shieldUntil: 8, actionAt: 14 })
  Object.assign(ranger, at(740, 690), { attack: 155 })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(980, 690)), null)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "ranger/Radiant/A5")
  assert(field)
  if (mode === "spent") field.seen.add(boss.id)
  if (mode === "straight") {
    battle.nextThinkAt = Infinity
    assert.equal(moveEdgeFighter(battle, boss, inside(boss, 55)), null)
  }
  advance(battle, 12)
  const [first] = returns
  assert.equal(returns.length, 1)
  assert(first.event.landing)
  assert.equal(Math.abs(first.event.landing.y - origin.y) > 100, mode === "wait" || mode === "flank")
  assert.equal(first.time > 5, mode === "wait")
  assert.equal(boss.hp, mode === "straight" ? 0 : 50)
  if (mode !== "straight") assert(!isOutside(boss))
}
observations.pveReturnPastArmedField = "took one safe return around an armed field or waited for a legal opening, with real lethal, warded and spent-field controls"

for (const flipped of [false, true]) for (const mode of ["sidestep", "walk-in", "cooling", "warded", "out-of-range"] as const) {
  const kit = (jobs: SubJobId[], rarity: Rarity) => jobs.map((job, index) => makeCard(pick(job, [2, 4], [2, 5]), rarity, index))
  const allies = kit(["bulwark", "summoner", "bard", "healer"], "Prismatic")
  const foes = kit(["warden", "spellbreaker", "healer"], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const [team, enemies] = flipped ? [battle.sparring!.rivals, battle.team] : [battle.team, battle.sparring!.rivals]
  const [tank, summoner, bard, healer] = team
  const [warden, breaker, medic] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push(event)
  Object.assign(tank, at(868.84, 748.34), { shield: 146, shieldUntil: 4, actionAt: 4.7 })
  Object.assign(summoner, at(904.16, 768.71), { hp: 358, shield: 102, shieldUntil: 4, actionAt: 3.63 })
  Object.assign(bard, at(928.94, 704.82), { hp: 154, shield: mode === "warded" ? 350 : 98, shieldUntil: 4, actionAt: 3.86 })
  Object.assign(healer, at(704.51, 499.6), { hp: 449, shield: 153, shieldUntil: 4, actionAt: 2.25 })
  Object.assign(warden, at(817.68, 486.28), { hp: 778, shield: 48, shieldUntil: 4 })
  Object.assign(breaker, at(mode === "out-of-range" ? 285 : 777.03, 611.28), { hp: 490, actionAt: mode === "cooling" ? 3.1 : .1 })
  Object.assign(medic, at(626.3, 717), { hp: 612, actionAt: 3 })
  const route = leaveConcentratedFire(battle, bard, team, enemies)
  assert.equal(!!route, mode === "sidestep" || mode === "walk-in")
  assert.equal(moveEdgeFighter(battle, bard, mode === "sidestep" ? route!.point : at(770.28, 809.35)), null)
  assert.equal(issueEdgeOrder(battle, warden, "skill2", null, at(886.5, 758.53)), null)
  advance(battle, .51)
  assert.equal(issueEdgeOrder(battle, breaker, "skill2", bard, bard), mode === "cooling" ? "角色冷却中" : "共享冷却中")
  advance(battle, .931)
  assert.equal(issueEdgeOrder(battle, breaker, "skill2", bard, bard),
    mode === "cooling" ? "角色冷却中" : mode === "out-of-range" ? "超出射程" : null)
  advance(battle, 1.5)
  assert.equal(events.some(event => event.kind === "push" && event.target === bard.id), mode !== "sidestep")
  assert.equal(bard.hp, { sidestep: 90, "walk-in": 0, cooling: 137, warded: 154, "out-of-range": 137 }[mode])
}
observations.sidestepBeforePushAndLock = "escaped the opening push, with mirrored controls for the shared clock, safe shield and out-of-range reply"

for (const pve of [false, true]) {
  for (const flipped of [false, true]) for (const mode of ["unsafe", "safe", "cooling", "warded"] as const) {
    const allies = cards([["bard", [2, 4]]], "Prismatic")
    const foes = cards([["warden", [4, 2]], ["spellbreaker", [4, 2]], ["healer", [4, 2]]], "Radiant")
    const battle = pve ? createEdgeBattle(foes) : flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
    const foesInBattle = pve || flipped ? battle.team : battle.sparring!.rivals
    const patient = pve ? battle.boss : flipped ? battle.sparring!.rivals[0] : battle.team[0]
    const [warden, breaker, healer] = foesInBattle
    const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
    const events: SkillEvent[] = []
    battle.phase = "running"
    battle.nextThinkAt = Infinity
    battle.onSkillEvent = event => events.push(event)
    Object.assign(patient, at(908, 690), { hp: pve ? 330 : 154, actionAt: 2.3, shield: mode === "warded" ? 400 : pve ? 0 : 98, shieldUntil: 4 })
    Object.assign(warden, at(570, 690), { actionAt: .62 })
    Object.assign(breaker, at(650, 1063), { actionAt: mode === "cooling" ? 4 : 0 })
    Object.assign(healer, at(917, 1071), { actionAt: 4 })
    if (pve) warden.attack = breaker.attack = 155
    const direct = at(718, 690), flank = at(918, 879)
    const path = (point: typeof direct) => ({ landing: point, stop: point, arrival: edgeDistance(patient, point) / movementSpeed(battle, patient) })
    const rejects = pve ? walksIntoReadyFinish : walksIntoLethalReach
    assert.equal(rejects(battle, patient, foesInBattle, path(direct)), mode === "safe" || mode === "unsafe")
    assert(!rejects(battle, patient, foesInBattle, path(flank)))
    if (pve && mode === "safe") battle.nextThinkAt = 0
    else assert.equal(moveEdgeFighter(battle, patient, mode === "safe" ? flank : direct), null)
    advance(battle, .65)
    const contact = future(battle, patient, .333)
    const aim = { x: contact.x + (flipped ? -12 : 12), y: contact.y + (flipped ? 24 : -24) }
    assert.equal(issueEdgeOrder(battle, warden, "skill", null, aim), null)
    advance(battle, 1.57)
    assert.equal(issueEdgeOrder(battle, breaker, "skill", patient, patient), mode === "cooling" ? "角色冷却中" : null)
    advance(battle, 2.16)
    const first = events.find(event => event.kind === "startMove" && event.target === patient.id)?.landing
    assert(first)
    assert.equal(edgeDistance(first, healer) < edgeDistance(first, warden), mode === "safe")
    assert.equal(events.some(event => event.kind === "push" && event.target === patient.id), mode !== "safe")
    assert.equal(patient.hp, (pve ? { unsafe: 0, safe: 102, cooling: 108, warded: 230 } :
      { unsafe: 0, safe: 90, cooling: 112, warded: 154 })[mode])
    if (pve && mode === "safe") {
      advance(battle, 6.15)
      assert(events.some(event => event.kind === "hit" && event.cast.owner === patient.id &&
        event.target === healer.id && (event.amount ?? 0) > 0))
    }
  }
  observations[pve ? "pveApproachAgainstPushAndLock" : "approachAgainstPushAndLock"] =
    "preferred a route away from a real shove and follow-up, with mirrored lethal, warded and cooling controls"
}

for (const flipped of [false, true]) for (const mode of ["smart", "stacked", "warded", "cooling", "advance", "advance-stacked", "advance-locked"] as const) {
  const kit = (jobs: SubJobId[], rarity: Rarity) => jobs.map((job, index) => makeCard(pick(job, [0, 1], [6, 7]), rarity, index))
  const allies = kit(["bulwark", "summoner", "bard", "healer"], "Prismatic")
  const foes = kit(["warden", "spellbreaker", "ranger", "healer"], "Radiant")
  const battle = flipped ? createEdgeBattle(foes, allies) : createEdgeBattle(allies, foes)
  const sparring = battle.sparring!
  const [team, enemies] = flipped ? [sparring.rivals, battle.team] : [battle.team, sparring.rivals]
  const [ours, theirs] = flipped ? [sparring, battle] : [battle, sparring]
  const [tank, summoner, bard, medic] = team
  const [warden, breaker, ranger, healer] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const far = mode.startsWith("advance")
  const patient = far ? summoner : medic
  const returns = new Map<EdgeUnit["id"], number>()
  const events: SkillEvent[] = []
  battle.phase = "running"
  sparring.first = flipped ? "enemy" : "ally"
  battle.onSkillEvent = event => {
    events.push(event)
    if (event.kind === "startMove" && event.style === "return" && event.target !== undefined && !returns.has(event.target))
      returns.set(event.target, battle.time)
  }
  if (far) {
    Object.assign(tank, at(342.99, 1312), { hp: 490, shield: 80, shieldUntil: 5 })
    Object.assign(summoner, at(351.43, 1302.46), { hp: 200 })
    Object.assign(bard, at(292.86, 1312), { hp: 296 })
    Object.assign(medic, at(342.99, 1312), { hp: 372, shield: 126, shieldUntil: 5 })
    Object.assign(warden, at(374.38, 701.49))
    Object.assign(breaker, at(291.68, 561.68), { actionAt: .1 })
    Object.assign(ranger, at(638.92, 758.18))
    Object.assign(healer, at(268.81, 792.3))
  } else {
    Object.assign(tank, at(1003.49, 78.48), { hp: 628 })
    Object.assign(summoner, at(1009.6, 92.05), { hp: 223, shield: 102, shieldUntil: 5 })
    Object.assign(bard, at(1047.13, 74.19), { hp: 420 })
    Object.assign(medic, at(1019.09, 85.28), { hp: 200, shield: mode === "warded" ? 600 : 0, shieldUntil: 5 })
    Object.assign(warden, at(724.82, 633.76))
    Object.assign(breaker, at(734.48, 508.92), { actionAt: mode === "cooling" ? 2.4 : 0 })
    Object.assign(ranger, at(697.69, 773.15))
    Object.assign(healer, at(767.02, 554.85))
  }
  for (const unit of [...team, warden, ranger, healer]) unit.actionAt = 4
  if (mode === "advance-locked") theirs.moveAt = 2.6
  ours.moveAt = 5
  const predicted = mode === "smart" || mode === "stacked" || mode === "advance" || mode === "advance-stacked"
  assert.deepEqual([...(delayCrowdedReturns(battle, team, enemies) ?? [])], predicted ? [patient] : [])
  if (far) assert.equal(moveEdgeFighter(battle, breaker, at(309.37, 750.86)), mode === "advance-locked" ? "移动冷却中" : null)
  const stacked = mode === "stacked" || mode === "advance-stacked"
  if (stacked) for (const unit of team) assert.equal(moveEdgeFighter(battle, unit, inside(unit, 55)), null)
  advance(battle, 2.1)
  assert.equal(returns.size, 4)
  const delayed = mode === "smart" || mode === "advance"
  assert.equal(returns.get(patient.id)! > .35, delayed)
  assert(team.every(unit => unit === patient || returns.get(unit.id)! < .06))
  const hits = events.filter(event => event.kind === "hit" && event.cast.skill?.id === "spellbreaker/Radiant/A2")
  assert.equal(hits.length, mode === "cooling" ? 0 : mode === "advance-locked" ? 2 : delayed ? 3 : 4)
  assert.equal(patient.hp, stacked ? 0 : 200)
  assert.equal(ours.moveAt, 5)
  assert.equal(ours.sharedAt, 0)
}
observations.staggerReturnAgainstArea = "kept a vulnerable card back while three allies returned, including an opponent able to walk into range and shared-clock controls"

for (const flipped of [false, true]) for (const mode of ["smart", "forced", "warded", "lethal-still"] as const) {
  const battle = createEdgeBattle(cards([["spellbreaker", [1, 0]]], "Radiant"))
  const { boss, team: [breaker] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  let startedAt: number | undefined
  battle.phase = "running"
  battle.onSkillEvent = event => {
    if (event.kind === "startMove" && event.target === boss.id && event.style === "return") startedAt ??= battle.time
  }
  Object.assign(boss, at(mode === "lethal-still" ? 1139 : 1147, 690), { hp: 50, shield: mode === "warded" ? 600 : 0, shieldUntil: 5, actionAt: 4 })
  Object.assign(breaker, at(640, 690), { attack: 155 })
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, at(992, 690)), null)
  if (mode === "forced") {
    battle.nextThinkAt = Infinity
    assert.equal(moveEdgeFighter(battle, boss, inside(boss, 55)), null)
  }
  advance(battle, 1.08)
  assert(startedAt !== undefined)
  assert.equal(startedAt > .4, mode === "smart")
  assert.equal(boss.hp, mode === "smart" || mode === "warded" ? 50 : 0)
  assert.equal(boss.moveAt + boss.sharedAt, 0)
}
observations.pveReturnWaitForCommittedStrike = "waited at a safe point until the announced strike could no longer catch the return, preserving the existing clocks"

for (const flipped of [false, true]) for (const mode of ["ready", "announced", "cooling", "shielded"] as const) {
  const patients = cards([["healer", [0, 1]], ["summoner"], ["bard"]], "Prismatic")
  const attackers = cards([["spellbreaker", [0, 1]]], "Radiant")
  const battle = flipped ? createEdgeBattle(attackers, patients) : createEdgeBattle(patients, attackers)
  const sparring = battle.sparring!
  const team = flipped ? sparring.rivals : battle.team
  const foes = flipped ? battle.team : sparring.rivals
  const [medic, summoner, bard] = team
  const [breaker] = foes
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.moveAt = sparring.moveAt = 3
  battle.onSkillEvent = event => events.push(event)
  Object.assign(medic, at(602, 867), { hp: 100 })
  Object.assign(summoner, at(550, 850), { hp: 17, actionAt: 3 })
  Object.assign(bard, at(656, 850), { hp: 81, actionAt: 3 })
  Object.assign(breaker, at(602, 550), { actionAt: mode === "announced" ? 0 : mode === "cooling" ? 2 : .55, attack: 96 })
  if (mode === "shielded") for (const unit of team) Object.assign(unit, { shield: 300, shieldUntil: 5 })
  if (mode === "announced") assert.equal(issueEdgeOrder(battle, breaker, "skill2", null, at(600, 850)), null)
  const rescue = rescueFromAnnouncedStrike(battle, team, foes)
  assert.equal(rescue?.intent.order, mode === "ready" ? "skill2" : mode === "announced" ? "skill" : undefined)
  advance(battle, 1.35)
  if (mode === "ready") {
    assert(events.some(event => event.kind === "shield" && event.cast.skill?.id === "healer/Prismatic/A2" && event.target === summoner.id))
    assert(summoner.hp > 300)
  } else if (mode === "announced") {
    assert.equal(impact(events, "healer/Prismatic/A1", "heal"), 3)
    assert(medic.hp > 0 && bard.hp > 0)
  }
}
observations.rescueAgainstAlternativeLocks = "valued one hypothetical lock per attacker and still counted each actual recipient of an announced area strike"

for (const flipped of [false, true]) for (const living of [false, true]) {
  const { battle, actor: ranger, opponents: [patient, first, second], events } =
    start([["ranger", [1, 0]]], [["bard"], ["warlock"], ["dancer"]], "Radiant")
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.nextThinkAt = Infinity
  Object.assign(ranger, at(640, 690), { attack: 155 })
  Object.assign(patient, at(1141, 690), { hp: 130, passives: [] })
  Object.assign(first, at(1118, 675), { hp: living ? first.maxHp : 1, passives: [] })
  Object.assign(second, at(1118, 707), { hp: living ? second.maxHp : 1, passives: [] })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(992, 690)), null)
  const path = (unit: EdgeUnit) => unit
  const contacts = announcedStrikes(battle, patient, 1.3, path)
  assert.equal(contacts.length, 1)
  assert.equal(lifeThroughStrikes(battle, patient, contacts, path, [], undefined, contacts[0].at).hp, 130)
  const forecast = lifeThroughStrikes(battle, patient, contacts, path)
  assert.equal(forecast.hp < 130, living)
  advance(battle, .68)
  assert.equal(patient.hp, 130)
  assert.equal(announcedStrikes(battle, patient).length, living ? 1 : 0)
  advance(battle, .87)
  assert.equal(patient.hp, forecast.hp)
  assert.equal(events.filter(e => e.kind === "hit" && e.target === patient.id && e.cast.skill?.id === "ranger/Radiant/A2").length, Number(living))
}
observations.rangerSplinterForecast = "projected one secondary hit from overlapping living targets on the rim and none from targets killed by the first hit"

for (const flipped of [false, true]) for (const mode of ["ready", "forced", "warded", "cooling"] as const) {
  const returners = cards([["bulwark", [0, 1]], ["healer", [0, 1]]], "Prismatic")
  const attackers = cards([["ranger", [1, 0]]], "Radiant")
  const battle = flipped ? createEdgeBattle(attackers, returners) : createEdgeBattle(returners, attackers)
  const sparring = battle.sparring!
  const team = flipped ? sparring.rivals : battle.team
  const enemies = flipped ? battle.team : sparring.rivals
  const [tank, medic] = team
  const [ranger] = enemies
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const starts = new Map<EdgeUnit["id"], number>()
  battle.phase = "running"
  sparring.first = flipped ? "enemy" : "ally"
  battle.moveAt = sparring.moveAt = 3
  battle.onSkillEvent = event => {
    if (event.kind === "startMove" && event.target !== undefined && event.style === "return" && !starts.has(event.target))
      starts.set(event.target, battle.time)
  }
  Object.assign(tank, at(1170.85, 566.94), { hp: 246, shield: mode === "warded" ? 550 : 122, shieldUntil: 8, actionAt: 3, passives: [] })
  Object.assign(medic, at(1149.67, 614.72), { hp: 373, shield: mode === "warded" ? 550 : 42, shieldUntil: 8, actionAt: 3, passives: [] })
  Object.assign(ranger, at(755.62, 642.43), { actionAt: mode === "cooling" ? 3 : 0, attack: 210 })
  assert.deepEqual([...(delayCrowdedReturns(battle, team, enemies) ?? [])], mode === "ready" || mode === "forced" ? [medic] : [])
  if (mode === "forced") {
    battle.nextThinkAt = Infinity
    for (const unit of team) assert.equal(moveEdgeFighter(battle, unit, inside(unit, 55)), null)
    assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(992, 566.94)), null)
    advance(battle, .68)
    assert(tank.hp > 0 && medic.hp > 0)
  }
  advance(battle, 1.25)
  assert(starts.has(tank.id) && starts.has(medic.id))
  assert.equal(starts.get(medic.id)! > starts.get(tank.id)!, mode === "ready")
  assert.deepEqual([tank.hp, medic.hp], mode === "forced" ? [0, 0] : [246, 373])
}
observations.staggerTwoReturnsAgainstSplinters = "staggered two returners before a legal shared aim and preserved both units with their normal return orders"

for (const flipped of [false, true]) for (const mode of ["smart", "forced", "warded", "inner"] as const) {
  const battle = createEdgeBattle(cards([["ranger", [1, 0]]], "Radiant"))
  const { boss, team: [ranger] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  let startedAt: number | undefined
  battle.phase = "running"
  battle.onSkillEvent = event => {
    if (event.kind === "startMove" && event.target === boss.id) startedAt ??= battle.time
  }
  Object.assign(boss, at(mode === "inner" ? 1054 : 1150, 690), { hp: 350, shield: mode === "warded" ? 550 : 0, shieldUntil: 5, actionAt: 4 })
  Object.assign(ranger, at(640, 690), { attack: 155 })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(992, 690)), null)
  const destination = inside(boss, 55)
  const route = returnWalk(battle, boss, destination)
  const position = (unit: EdgeUnit, time: number) => unit === boss && mode !== "inner" ? route.at(time) : unit
  const contacts = announcedStrikes(battle, boss, 1.3, position)
  const expected = mode === "warded" ? 350 : mode === "inner" ? 34 : 0
  assert.equal(lifeThroughStrikes(battle, boss, contacts, position, [], undefined, contacts[0].at).hp, mode === "warded" ? 350 : 34)
  assert.equal(lifeThroughStrikes(battle, boss, contacts, position).hp, expected)
  if (mode === "forced" || mode === "inner") {
    battle.nextThinkAt = Infinity
    if (mode === "forced") assert.equal(moveEdgeFighter(battle, boss, destination), null)
  }
  advance(battle, .88)
  assert.equal(boss.hp, mode === "smart" ? 350 : expected)
  if (mode !== "inner") assert.equal(startedAt! > .1, mode === "smart")
  assert.equal(boss.moveAt + boss.sharedAt, 0)
}
observations.pveAvoidsLandscapeSplinters = "kept the boss safe from the second hit on return and continued immediately with enough shield"

for (const flipped of [false, true]) for (const mode of ["smart", "forced", "warded", "caster-cooling", "enemy-cooling", "shared-cooling"] as const) {
  const squad = cards([["bulwark", [0, 1]], ["summoner", [0, 1]], ["bard", [0, 1]], ["healer", [0, 1]]], "Prismatic")
  const breakers = cards([["spellbreaker", [1, 0]]], "Radiant")
  const battle = flipped ? createEdgeBattle(breakers, squad) : createEdgeBattle(squad, breakers)
  const sparring = battle.sparring!
  const [tank, summoner, bard, medic] = flipped ? sparring.rivals : battle.team
  const [breaker] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const theirs = flipped ? battle : sparring
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const starts = new Map<EdgeUnit["id"], number>()
  let ralliedAt: number | undefined
  let enemyCastAt: number | undefined
  battle.phase = "running"
  sparring.first = flipped ? "enemy" : "ally"
  ours.moveAt = theirs.moveAt = 3
  ours.sharedAt = mode === "shared-cooling" ? .83 : 0
  theirs.sharedAt = .9
  battle.onSkillEvent = event => {
    if (event.kind === "startMove" && event.target !== undefined && event.style === "return" && !starts.has(event.target))
      starts.set(event.target, battle.time)
    if (event.kind === "cast" && event.cast.skill?.id === "healer/Prismatic/A1") ralliedAt ??= battle.time
    if (event.kind === "cast" && event.cast.owner === breaker.id) enemyCastAt ??= battle.time
  }
  const ward = mode === "warded" ? 900 : 0
  Object.assign(tank, at(392.34, 1312), { hp: 218, shield: ward, shieldUntil: 8, actionAt: 4, passives: [] })
  Object.assign(summoner, at(421.08, 1312), { hp: 106, shield: ward, shieldUntil: 8, actionAt: 4, passives: [] })
  Object.assign(bard, at(524.47, 925.76), { hp: 77, shield: 98, shieldUntil: 8, actionAt: 4, passives: [] })
  Object.assign(medic, at(392.34, 1312), { hp: 73, shield: ward, shieldUntil: 8, actionAt: mode === "caster-cooling" ? 3 : 0, passives: [] })
  Object.assign(breaker, at(309.37, 750.86), { actionAt: mode === "enemy-cooling" ? 3 : .1, attack: 180 })

  if (mode === "forced") {
    battle.nextThinkAt = Infinity
    assert.equal(issueEdgeOrder(battle, medic, "skill", null, medic), null)
    assert.equal(moveEdgeFighter(battle, tank, inside(tank, 44)), null)
    advance(battle, .458)
    for (const unit of [summoner, medic]) assert.equal(moveEdgeFighter(battle, unit, inside(unit, 44)), null)
    advance(battle, .929)
    assert.equal(issueEdgeOrder(battle, breaker, "skill", null, at(383.41, 1116)), null)
  } else {
    advance(battle, .74)
    const expectedMoving = mode === "warded" || mode === "enemy-cooling"
    assert.equal(starts.has(summoner.id) && starts.has(medic.id), expectedMoving)
    if (mode === "smart") {
      assert(ralliedAt! < .05)
      assert.deepEqual([summoner.shield, medic.shield], [188, 198])
    } else if (mode !== "warded") assert.equal(ralliedAt, undefined)
  }
  advance(battle, 1.49)
  if (mode === "smart" || mode === "shared-cooling") {
    assert(starts.get(tank.id)! < enemyCastAt! && starts.get(medic.id)! > enemyCastAt! && starts.get(summoner.id)! > enemyCastAt!)
    assert.deepEqual([summoner.hp, medic.hp, summoner.shield, medic.shield], [277, 253, 188, 198])
    assert(Math.abs(ours.sharedAt - ralliedAt! - COOLDOWN.shared) < 1e-6)
    if (mode === "shared-cooling") assert(ralliedAt! >= .83)
  }
  if (mode === "forced") assert.deepEqual([summoner.hp, medic.hp, summoner.shield, medic.shield], [192, 175, 0, 0])
  assert.equal(ours.moveAt, 3)
}
observations.returnAidAndWardPreservation = "used a held medic's legal support window and carried both wards past the first committed circle on each side"

for (const flipped of [false, true]) for (const mode of ["open", "cooling", "warded", "single-target", "medic-ready"] as const) {
  const squad = cards([["bulwark", [0, 1]], ["summoner", [0, 1]], ["healer", [0, 1]]], "Prismatic")
  const attackers = cards([["warden", [0, 1]], ["spellbreaker", mode === "single-target" ? [0, 4] : [0, 1]],
    ["ranger", [0, 1]], ["healer", [0, 1]]], "Radiant")
  const battle = flipped ? createEdgeBattle(attackers, squad) : createEdgeBattle(squad, attackers)
  const sparring = battle.sparring!
  const [tank, summoner, medic] = flipped ? sparring.rivals : battle.team
  const [warden, breaker, ranger, healer] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  let firstMove: { at: number; actor: EdgeUnit["id"] } | undefined
  let castAt: number | undefined
  const struck = new Set<EdgeUnit["id"]>()
  battle.phase = "running"
  sparring.first = flipped ? "enemy" : "ally"
  battle.onSkillEvent = event => {
    if (event.kind === "startMove" && (event.target === tank.id || event.target === medic.id))
      firstMove ??= { at: battle.time, actor: event.target }
    if (event.cast.skill?.id === "spellbreaker/Radiant/A2") {
      if (event.kind === "cast") castAt ??= battle.time
      if (event.kind === "hit" && event.target !== undefined) struck.add(event.target)
    }
  }
  Object.assign(tank, at(912.99, 520.43), { hp: 280, shield: 122, shieldUntil: 8, actionAt: .267, passives: [] })
  Object.assign(summoner, at(556.87, 890.97), { hp: 297, actionAt: 3.167, passives: [] })
  Object.assign(medic, at(990.87, 515.12), { hp: 289, shield: mode === "warded" ? 680 : 42, shieldUntil: 8,
    actionAt: mode === "medic-ready" ? .73 : 2.733, passives: [] })
  Object.assign(warden, at(607.75, 794.58), { hp: 273, actionAt: 5.067 })
  Object.assign(breaker, at(842.06, 701.91), { hp: 332, actionAt: mode === "cooling" ? .65 : 0, attack: 180 })
  Object.assign(ranger, at(755.62, 642.43), { hp: 100, actionAt: 2.433 })
  Object.assign(healer, at(653.43, 908.11), { hp: 727, actionAt: 2.5 })
  advance(battle, .82)
  assert(firstMove)
  assert.equal(firstMove.actor, mode === "open" ? tank.id : medic.id)
  assert.equal(firstMove.at > .2, mode === "open")
  if (mode === "open") {
    assert(castAt! < firstMove.at)
    assert(struck.has(tank.id) && struck.has(medic.id))
    assert(tank.move && edgeDistance(tank.move, at(824.38, 589.13)) < .5)
  }
  assert(Math.abs(ours.sharedAt - firstMove.at - COOLDOWN.shared) < 1e-6)
  assert(Math.abs(ours.moveAt - firstMove.at - COOLDOWN.move) < 1e-6)
}
observations.reserveAdvanceUntilGroupAim = "waited for a ready area attack before spending a low-payoff shared move and chose the next eligible fighter on both sides"

for (const flipped of [false, true]) for (const mode of ["leaves", "stays", "out-of-reach"] as const) {
  const squad = [
    makeCard(pick("assassin", [3, 2], [3, 7]), "Prismatic", 0),
    makeCard(pick("bulwark", [0, 1]), "Prismatic", 1),
  ]
  const opponents = cards([["bulwark", [0, 1]], ["ranger", [1, 3]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(opponents, squad) : createEdgeBattle(squad, opponents)
  const sparring = battle.sparring!
  const [assassin, guard] = flipped ? sparring.rivals : battle.team
  const [target, ranger] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.onSkillEvent = event => events.push({ ...event })
  sparring.first = flipped ? "enemy" : "ally"
  ours.moveAt = 3
  Object.assign(assassin, at(625, 890), { attack: 186, hp: 545 })
  Object.assign(guard, at(620, mode === "out-of-reach" ? 846 : 834), { hp: 278 })
  Object.assign(target, at(620, 560), { hp: 620, actionAt: 4, passives: [] })
  Object.assign(ranger, at(960, 294), { actionAt: 4, passives: [] })
  assert.equal(moveEdgeFighter(battle, target, at(620, mode === "stays" ? 700 : 730)), null)
  advance(battle, 2.55)
  const chosen = events.find(event => event.kind === "cast" && event.cast.owner === assassin.id)
  assert.equal(chosen?.cast.skill?.id, mode === "leaves" ? "assassin/Prismatic/A4" : "assassin/Prismatic/A3")
  const push = events.findIndex(event => event.kind === "push" && event.cast.owner === guard.id && event.target === target.id)
  const marked = events.findIndex(event => event.kind === "hit" && event.target === target.id && event.style === "zone" &&
    event.cast.skill?.id === "assassin/Prismatic/A4")
  if (mode === "leaves") {
    assert(push >= 0 && marked > push)
    assert.equal(events[push].cast.order, "basic")
    assert.equal(events[marked].amount, 59)
    assert(events.some(event => event.kind === "shield" && event.target === guard.id && event.style === "shadowpit"))
  } else assert.equal(marked, -1)
}
observations.shadowPitAfterOrdinaryWalk = "marked a walking enemy before its exit, followed with a legal basic shove, and skipped the relay without a reachable crossing"

for (const flipped of [false, true]) for (const mode of ["rim", "inside", "finish"] as const) {
  const squad = [
    makeCard(pick("assassin", [3, 2], [3, 7]), "Prismatic", 0),
    makeCard(pick("ranger", [2, 0]), "Prismatic", 1),
    makeCard(pick("warlock", [1, 2]), "Prismatic", 2),
  ]
  const opponents = cards([["warden", [0, 3]], ["ranger", [1, 3]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(opponents, squad) : createEdgeBattle(squad, opponents)
  const sparring = battle.sparring!
  const fighters = flipped ? sparring.rivals : battle.team
  const rivals = flipped ? battle.team : sparring.rivals
  const theirs = flipped ? battle : sparring
  const [assassin, ranger, mage] = fighters
  const [target, other] = rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  theirs.sharedAt = Infinity
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(assassin, at(625, 890), { attack: 186, hp: 545 })
  Object.assign(ranger, at(620, 905), { attack: 186 })
  Object.assign(mage, at(580, 655), { attack: 150, hp: 275 })
  Object.assign(target, at(620, 690), { hp: mode === "finish" ? 340 : 925, passives: [] })
  Object.assign(other, at(970, 294), { passives: [] })
  assert.equal(issueEdgeOrder(battle, assassin, "skill", target, target), null)
  advance(battle, .93)
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(620, mode === "inside" ? 690 : 831)), null)
  advance(battle, 1.864)
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const announced = announcedStrikes(battle, target, 2.3, position).find(contact => contact.source === ranger)
  assert(announced)
  const shift = announcedShift(battle, announced, target, position)
  if (mode === "rim") assert(shift?.push && edgeDistance(shift.end, at(620, 592)) < .1)
  else assert.equal(shift, undefined)
  const intent = chooseAiAttack(battle, mage, fighters, rivals)
  assert(intent && intent.order === "skill")
  const aim = mode === "rim" ? at(574.86, 495.21) : mode === "inside" ? target : at(938.86, 322.82)
  assert(edgeDistance(aim, intent.at) < .1)
  assert.equal(issueEdgeOrder(battle, mage, intent.order, intent.target ?? null, intent.at), null)
  advance(battle, 2.95)
  const extra = events.find(event => event.kind === "hit" && event.target === target.id && event.style === "zone" &&
    event.cast.skill?.id === "assassin/Prismatic/A4")
  const ward = events.find(event => event.kind === "shield" && event.target === mage.id && event.style === "shadowpit")
  assert.deepEqual([extra?.amount ?? 0, ward?.amount ?? 0], mode === "rim" ? [61, 64] : [0, 0])
  if (mode === "finish") {
    assert(events.some(event => event.kind === "death" && event.cast.owner === ranger.id && event.target === target.id))
    assert(events.some(event => event.kind === "hit" && event.cast.owner === mage.id && event.target === other.id))
    assert(!events.some(event => event.kind === "hit" && event.cast.owner === mage.id && event.target === target.id))
  }
}
observations.shadowPitAfterAnnouncedRim = "aimed at the outer shove's future landing, kept the centered hit without a shove, and retargeted a secured kill"

for (const flipped of [false, true]) for (const mode of ["curtain", "bastion", "warded", "late", "ready-move"] as const) {
  const defenders = cards([["warlock", [2, 4]], ["bulwark", [1, 4]]], "Prismatic")
  const attackers = cards([["warlock", [2, 4]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const sparring = battle.sparring!
  const [mage, tank] = flipped ? sparring.rivals : battle.team
  const [enemy] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const theirs = flipped ? battle : sparring
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.onSkillEvent = event => events.push({ ...event })
  sparring.first = flipped ? "enemy" : "ally"
  ours.moveAt = mode === "ready-move" ? 0 : 1.7
  theirs.moveAt = 3
  Object.assign(mage, at(688, 1012), { hp: 245, shield: mode === "warded" ? 290 : 0, shieldUntil: 5, passives: [] })
  Object.assign(tank, at(368, 972), { actionAt: mode === "bastion" ? 0 : 4, passives: [] })
  Object.assign(enemy, at(574.47, 359.46), { actionAt: mode === "late" ? 3 : .7, passives: [] })
  advance(battle, 1.7)
  const first = events.find(event => event.kind === "cast" && (event.cast.owner === mage.id || event.cast.owner === tank.id))
  const opening = mode === "bastion" ? "bulwark/Prismatic/A2" : mode === "curtain" ? "warlock/Prismatic/A5" : "warlock/Prismatic/A3"
  assert.equal(first?.cast.skill?.id, opening, mode)
  const shield = events.find(event => event.kind === "shield" && event.target === mage.id && event.cast.skill?.id === opening)
  const landed = events.find(event => event.kind === "hit" && event.target === mage.id && event.cast.owner === enemy.id)
  assert.equal(shield?.amount, mode === "bastion" ? 171 : mode === "curtain" ? 128 : undefined)
  assert.equal(landed?.absorbed, shield?.amount)
  assert.equal(mage.hp, mode === "bastion" ? 155 : mode === "curtain" ? 112 : 245)
  if (mode === "ready-move") assert(sparring.actions.some(action => action.actorId === mage.id && action.name === "移动"))
}
observations.wardBeforeUnavoidableArea = "chose the strongest legal ward before a lethal line and took the shot when ready movement or existing protection sufficed"

for (const flipped of [false, true]) for (const mode of ["shield-lost", "chip", "thick-ward", "late-line"] as const) {
  const defenders = cards([["warlock", [2, 4]], ["lifebringer", [0, 4]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]], ["spellbreaker", [0, 1]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const sparring = battle.sparring!
  const [mage, medic] = flipped ? sparring.rivals : battle.team
  const [paladin, breaker] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const theirs = flipped ? battle : sparring
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = .7
  battle.onSkillEvent = event => events.push({ ...event })
  sparring.first = flipped ? "enemy" : "ally"
  ours.sharedAt = .65
  ours.moveAt = .55
  theirs.moveAt = 3
  const shield = mode === "thick-ward" ? 400 : mode === "shield-lost" ? 146 : 128
  Object.assign(mage, at(791.89, 1061), { hp: 65, shield, shieldUntil: 4, actionAt: 4, passives: [] })
  Object.assign(medic, at(932.77, 1032.44), { hp: 735, actionAt: 4, passives: [] })
  Object.assign(paladin, at(390.45, 961.32), { actionAt: mode === "late-line" ? 4 : 0, passives: [] })
  Object.assign(breaker, at(688, 356), { passives: [] })
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, mage), null)
  advance(battle, 1.55)
  const retained = mode === "chip" || mode === "shield-lost"
  const move = sparring.actions.find(action => action.name === "移动" && (action.actorId === mage.id || action.actorId === medic.id))
  const line = events.findIndex(event => event.kind === "cast" && event.cast.skill?.id === "paladin/Prismatic/A2")
  assert.equal(move?.actorId, retained ? mage.id : medic.id, mode)
  if (retained) {
    const step = events.findIndex(event => event.kind === "startMove" && event.target === mage.id)
    assert(line >= 0 && step > line)
    assert(!events.some(event => event.kind === "hit" && event.target === mage.id && event.cast.owner === paladin.id))
  } else assert(move && move.time < .85)
  assert.equal(mage.hp, mode === "chip" || mode === "late-line" ? 47 : 65)
}
observations.keepDodgeAfterExpendedShield = "saved the shared move for the next line even when the circle only removed the ward and kept routine dodges when the follow-up was survivable or cooling"

for (const flipped of [false, true]) for (const mode of ["open", "cooling", "warded", "partner-ready"] as const) {
  const defenders = cards([["warlock", [2, 4]], ["warden", [0, 3]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]], ["spellbreaker", [0, 1]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const sparring = battle.sparring!
  const [mage, tank] = flipped ? sparring.rivals : battle.team
  const [paladin, breaker] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const theirs = flipped ? battle : sparring
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = .23
  battle.onSkillEvent = event => events.push({ ...event })
  sparring.first = flipped ? "enemy" : "ally"
  ours.moveAt = mode === "cooling" ? .083 : .05
  theirs.moveAt = 4
  Object.assign(mage, at(966, 1090), { hp: 84, shield: mode === "warded" ? 240 : 0,
    shieldUntil: 4, actionAt: 3, passives: [] })
  Object.assign(tank, at(670, 982), { hp: 920, actionAt: mode === "partner-ready" ? .4 : 3, passives: [] })
  Object.assign(paladin, at(390.45, 961.32), { actionAt: .9, passives: [] })
  Object.assign(breaker, at(688, 356), { passives: [] })
  assert.equal(issueEdgeOrder(battle, breaker, "skill", null, mage), null)
  advance(battle, .983)
  const early = sparring.actions.find(action => action.name === "移动" && action.actorId === mage.id && action.time < .23)
  assert.equal(early?.time, mode === "open" ? .05 : undefined)
  assert.equal(mage.hp, mode === "cooling" ? 0 : mode === "partner-ready" ? 30 : 84)
  if (mode === "open") {
    assert(edgeDistance(at(966, 1090), mage) > 160)
    assert(Math.abs(ours.moveAt - early!.time - COOLDOWN.move) < 1e-6)
    assert(!events.some(event => event.kind === "hit" && event.target === mage.id && event.cast.owner === breaker.id))
  }
  if (mode === "partner-ready") assert(events.some(event => event.kind === "shield" && event.target === mage.id && event.cast.owner === tank.id))
}
observations.cornerCircleOnMoveUnlock = "walked inward on the last available tick and kept the shared order when a teammate could cover the circle"

for (const flipped of [false, true]) for (const mode of ["ready", "forced-inward", "cooling", "out-of-reach", "warded"] as const) {
  const defenders = cards([["bulwark", [1, 4]], ["warden", [0, 3]], ["warlock", [2, 4]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]], ["spellbreaker", [0, 1]], ["warlock", [2, 4]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const sparring = battle.sparring!
  const [bulwark, warden, mage] = flipped ? sparring.rivals : battle.team
  const [paladin, breaker, enemyMage] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  sparring.first = flipped ? "enemy" : "ally"
  battle.phase = "running"
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(bulwark, at(433.95, 1051.22), { hp: 819, actionAt: 2.833, shield: 122, shieldUntil: 10 })
  Object.assign(warden, at(937, 1061), { hp: 710, actionAt: 5.067, shield: 98, shieldUntil: 10 })
  Object.assign(mage, at(966, 1072.47), { hp: 103, actionAt: 1.767, shield: mode === "warded" ? 340 : 71, shieldUntil: 10 })
  Object.assign(paladin, at(390.45, 961.32), { hp: 1028, shield: 235, shieldUntil: 7.45 })
  Object.assign(breaker, at(486.69, mode === "out-of-reach" ? 510 : 659.77), { hp: 313, actionAt: mode === "cooling" ? 3 : 0 })
  Object.assign(enemyMage, at(352.77, 716.77), { hp: 21, actionAt: 2.933 })
  assert.equal(issueEdgeOrder(battle, paladin, "skill", mage, mage), null)
  const inward = at(917.04, 991.77)
  if (mode === "forced-inward") assert.equal(moveEdgeFighter(battle, mage, inward), null)
  advance(battle, .1)
  const move = sparring.actions.find(action => action.name === "移动" && action.actorId === mage.id)
  const expected = mode === "ready" ? at(968, 1092) : inward
  assert(move && mage.move && edgeDistance(mage.move, expected) < .15, mode)
  assert(Math.abs(ours.moveAt - move.time - COOLDOWN.move) < 1e-6)
  assert(Math.abs(ours.sharedAt - move.time - COOLDOWN.shared) < 1e-6)
  advance(battle, 1.95)
  assert(!events.some(event => event.kind === "hit" && event.target === mage.id && event.cast.owner === paladin.id))
  const reply = events.find(event => event.kind === "cast" && event.cast.owner === breaker.id)
  assert.equal(reply?.cast.skill?.id, mode === "cooling" ? undefined
    : mode === "forced-inward" ? "spellbreaker/Prismatic/A2" : "spellbreaker/Prismatic/A1")
  assert.equal(mage.hp, mode === "forced-inward" ? 0 : mode === "ready" || mode === "out-of-reach" ? 28 : 103)
}
observations.keepEscapePastReadyFollowUp = "changed the warning dodge only when its path raised a lethal reply, preserving the ordinary step with range, cooldown or ward cover"

for (const flipped of [false, true]) for (const mode of ["ready", "late", "warded", "self-ward", "finish", "move-cooling"] as const) {
  const defenders = cards([["bulwark", [1, 4]], ["warden", [0, 3]], ["warlock", mode === "finish" ? [2, 0] : [2, 4]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const sparring = battle.sparring!
  const [bulwark, warden, mage] = flipped ? sparring.rivals : battle.team
  const [paladin] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const theirs = flipped ? battle : sparring
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  sparring.first = flipped ? "enemy" : "ally"
  battle.phase = "running"
  battle.onSkillEvent = event => events.push({ ...event })
  ours.moveAt = mode === "move-cooling" ? 2 : .266
  theirs.sharedAt = .666
  theirs.moveAt = 2.367
  Object.assign(bulwark, at(398.4, 1009.56), { hp: 570, actionAt: 6.566, shield: 219, shieldUntil: .583 })
  Object.assign(warden, at(668.33, 990.18), { hp: 174, actionAt: 2.033 })
  Object.assign(mage, at(978, 1083.81), { hp: mode === "self-ward" ? 60 : 28, shield: mode === "warded" ? 205 : 0, shieldUntil: 4 })
  Object.assign(paladin, at(503.74, 887.98), { hp: mode === "finish" ? 120 : 648, shield: 4, shieldUntil: 6,
    move: at(567.66, 927.67), actionAt: mode === "late" ? 2.2 : 0 })
  advance(battle, 2.25)
  const first = sparring.actions.find(action => action.actorId === mage.id)
  const line = events.findIndex(event => event.kind === "cast" && event.cast.skill?.id === "paladin/Prismatic/A2")
  assert.equal(first?.name, mode === "ready" ? "移动" : mode === "finish" ? "断层爆裂" : "裂幕援火", mode)
  if (mode === "ready") {
    const move = events.findIndex(event => event.kind === "startMove" && event.target === mage.id)
    assert(line >= 0 && move > line)
    assert(sparring.actions.some(action => action.actorId === mage.id && action.name === "翻天窄线"))
    assert(!events.some(event => event.kind === "hit" && event.target === mage.id && event.cast.owner === paladin.id))
  } else assert(first && first.time < .05)
  if (mode === "self-ward") assert(events.some(event => event.kind === "shield" && event.target === mage.id && event.amount === 128))
  if (mode === "finish") {
    const finish = events.findIndex(event => event.kind === "death" && event.target === paladin.id && event.cast.owner === mage.id)
    assert(line >= 0 && finish > line)
    assert.equal(battle.phase, flipped ? "lost" : "won")
  }
  assert.equal(mage.hp, mode === "move-cooling" ? 0 : mode === "self-ward" ? 60 : 28)
}
observations.lastEnemyLineReservation = "kept the shared turn for a lethal line from the last enemy and acted immediately for a confirmed finish or sufficient ward"

for (const flipped of [false, true]) for (const mode of ["can-wait", "route-needed", "warded", "enemy-late"] as const) {
  const defenders = cards([["bulwark", [1, 4]], ["warden", [0, 3]], ["warlock", [2, 4]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const sparring = battle.sparring!
  const [bulwark, warden, mage] = flipped ? sparring.rivals : battle.team
  const [paladin] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  sparring.first = flipped ? "enemy" : "ally"
  battle.phase = "running"
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(bulwark, at(674.33, 1050.73), { hp: 422, actionAt: mode === "route-needed" ? 5.32 : 5.633,
    shield: 207, shieldUntil: 10.467 })
  bulwark.passiveAt[BULWARK_COVER.id] = 5
  Object.assign(warden, at(674.96, 980.82), { hp: 420, actionAt: 5.067, shield: 166, shieldUntil: 10.467 })
  Object.assign(mage, at(789.71, 1085.36), { hp: 196, actionAt: .367, shield: mode === "warded" ? 310 : 25, shieldUntil: 10.467 })
  Object.assign(paladin, at(600.99, 710.98), { hp: 180, attack: 260, shield: 22, shieldUntil: 8.85,
    actionAt: mode === "enemy-late" ? 4.3 : 1.267 })
  advance(battle, 3)
  const first = sparring.actions.find(action => action.side === (flipped ? "enemy" : "ally"))
  if (mode === "can-wait") {
    assert(first && first.actorId === mage.id && first.name === "翻天窄线" && first.time < .6)
    const shot = events.findIndex(event => event.kind === "cast" && event.cast.skill?.id === "paladin/Prismatic/A2")
    const dodge = events.findIndex(event => event.kind === "startMove" && event.target === mage.id)
    assert(shot >= 0 && dodge > shot)
    assert.equal(mage.hp, 196)
  } else {
    assert(first && first.name === "移动" && first.actorId !== mage.id && first.time < .05, mode)
  }
}
observations.deferAdvancePastDefensiveMove = "deferred a cooling tank's advance only when it could still arrive after paying for a teammate's dodge"

for (const flipped of [false, true]) for (const mode of ["endpoint", "shielded", "late"] as const) {
  const defenders = cards([["warlock", [2, 4]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const [mage] = flipped ? battle.sparring!.rivals : battle.team
  const [paladin] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(mage, at(789.71, 1085.36), { hp: 6, shield: mode === "shielded" ? 310 : 121, shieldUntil: 10.46 })
  Object.assign(paladin, at(600.99, 710.98), { actionAt: mode === "late" ? 2.3 : 1.267 })
  const forecast = defensiveThreat(battle, mage, [paladin])
  if (mode === "endpoint") assert(forecast?.line && Math.abs(forecast.hitAt - 1.837) < 1e-5)
  else assert(!forecast)
  advance(battle, paladin.actionAt)
  assert.equal(issueEdgeOrder(battle, paladin, "skill", mage, mage), null)
  advance(battle, battle.time + .62)
  assert.equal(mage.hp, mode === "shielded" ? 6 : 0)
}
observations.lineEndpointMatchesImpact = "forecast the lethal hit at the horizontal line's selected endpoint on either side, with shield and late-cast controls"

for (const flipped of [false, true]) for (const mode of ["available", "ally-cooling", "enemy-early"] as const) {
  const defenders = cards([["bulwark", [1, 4]], ["warden", [0, 3]], ["warlock", [2, 4]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const [tank, warden, mage] = team
  const [paladin] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  Object.assign(tank, at(511.63, 996.54), { actionAt: 2.133, hp: 570 })
  Object.assign(warden, at(967.48, 1057.71), { actionAt: mode === "ally-cooling" ? 1.35 : 0, move: at(940, 1057.71) })
  Object.assign(mage, at(978, 1026.99), { actionAt: 4.567, hp: 28 })
  Object.assign(paladin, at(372.37, 1092.58), { actionAt: mode === "enemy-early" ? 1.16 : 1.733, shield: 235, shieldUntil: 3 })
  const landing = at(398.4, 1009.56)
  const route = { actor: tank, landing, stop: landing, arrival: .708 }
  assert.equal(interruptsLineAfterAdvance(battle, team, paladin, route, paladin.actionAt), mode === "available")
}
observations.advanceWithTimeToInterrupt = "counted a legal shove before the last enemy's cast after spending a shared movement, with both cooldown controls"

for (const flipped of [false, true]) for (const mode of ["covered", "cover-cooling", "escort-in-line"] as const) {
  const defenders = cards([["bulwark", [1, 4]], ["warden", [0, 3]], ["warlock", [2, 4]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const team = flipped ? battle.sparring!.rivals : battle.team
  const [tank, warden, mage] = team
  const [paladin] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const linedUp = mode === "escort-in-line"
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(tank, linedUp ? at(702.06, 630.94) : at(537.72, 1031.45), { hp: 422, shield: 207, shieldUntil: 4 })
  tank.passiveAt[BULWARK_COVER.id] = mode === "cover-cooling" ? 3 : 0
  Object.assign(warden, linedUp ? at(579.98, 769.78) : at(749.03, 1040.3), { hp: 21, shield: 166, shieldUntil: 4 })
  Object.assign(mage, linedUp ? at(893.15, 697.41) : at(833.46, 1084), { hp: linedUp ? 151 : 28, shield: linedUp ? 0 : 121, shieldUntil: 4 })
  Object.assign(paladin, linedUp ? at(497.74, 741.39) : at(543.23, 911.03), { actionAt: linedUp ? 1.033 : 1.733 })
  assert(defensiveThreat(battle, mage, [paladin])?.line)
  const route = escapeToGuard(battle, mage, team, [paladin])
  assert.equal(!!route, mode === "covered", mode)
  if (route) {
    assert.equal(moveEdgeFighter(battle, mage, route.point), null)
    advance(battle, paladin.actionAt)
    assert.equal(issueEdgeOrder(battle, paladin, "skill", mage, mage), null)
    advance(battle, battle.time + .62)
    assert.equal(mage.hp, 7)
    assert.equal(tank.shield, 187)
  }
}
observations.refugeWithEscortOffLine = "used single-hit cover when the escort could share the line damage without being in the line itself"

for (const flipped of [false, true]) for (const mode of ["side", "tip", "late", "center"] as const) {
  const defenders = cards([["warlock", [0, 2]]], "Prismatic")
  const attackers = cards([["paladin", [1, 2]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const sparring = battle.sparring!
  const [mage] = flipped ? sparring.rivals : battle.team
  const [paladin] = flipped ? battle.team : sparring.rivals
  const ours = flipped ? sparring : battle
  const theirs = flipped ? battle : sparring
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const tip = mode === "tip" || mode === "late"
  battle.phase = "running"
  battle.nextThinkAt = tip ? .8 : .455
  ours.sharedAt = mode === "late" ? .55 : .44
  ours.moveAt = .25
  theirs.moveAt = 4
  const start = tip ? at(273.35, 410.25) : mode === "center" ? at(683.42, 985.72) : at(709.55, 1023.92)
  Object.assign(mage, start, { hp: 170, actionAt: 4, passives: [] })
  Object.assign(paladin, tip ? at(261.04, 542.2) : at(726.77, 908.93), { passives: [] })
  assert.equal(issueEdgeOrder(battle, paladin, "skill", tip ? mage : null, tip ? mage : at(640.07, 1062.51)), null)
  advance(battle, .62)
  const move = sparring.actions.find(action => action.actorId === mage.id && action.name === "移动")
  if (mode === "side" || mode === "tip") {
    assert(move && move.time >= .44 && move.time < .49)
    assert(edgeDistance(start, mage) < 27)
    assert.equal(mage.hp, 170)
  } else {
    assert(!move)
    assert.equal(mage.hp, 0)
  }
}
observations.committedLineShortDodge = "escaped a locked line's edge or endpoint as shared cooldown ended, with centerline and late controls"

for (const flipped of [false, true]) for (const late of [false, true]) {
  const { battle, actor: paladin, events } = start([["paladin", [1, 2]]])
  const { boss } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.nextThinkAt = .8
  Object.assign(paladin, at(261.04, 542.2), { passives: [] })
  Object.assign(boss, at(273.35, 410.25), { hp: 50, moveAt: late ? .55 : .44, actionAt: 4 })
  assert.equal(issueEdgeOrder(battle, paladin, "skill", boss, boss), null)
  advance(battle, .62)
  assert.equal(boss.hp, late ? 0 : 50)
  const move = events.find(event => event.kind === "startMove" && event.target === boss.id)
  assert.equal(!!move, !late)
}
observations.pveLineShortDodge = "used the boss's own movement cooldown to escape a committed line's endpoint in either orientation"

for (const flipped of [false, true]) for (const mode of ["direct", "diagonal", "warded"] as const) {
  const defenders = cards([["warlock", [2, 4]]], "Prismatic")
  const attackers = cards([["warden", [0, 3]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const [mage] = flipped ? battle.sparring!.rivals : battle.team
  const [warden] = flipped ? battle.team : battle.sparring!.rivals
  const theirs = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const side = flipped ? "enemy" : "ally"
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(mage, at(750.32, 1061), { hp: 208, actionAt: 2.467, shield: mode === "warded" ? 310 : 0, shieldUntil: 5, passives: [] })
  Object.assign(warden, at(915.45, 329.1), { actionAt: .866, passives: [] })

  const pathTo = (landing: { x: number; y: number }) =>
    ({ landing, stop: landing, arrival: edgeDistance(mage, landing) / movementSpeed(battle, mage) })
  const direct = pathTo(at(733.59, 871.74))
  const exposed = pathTo(at(652.39, 898.18))
  const farther = pathTo(at(612.84, 929.85))
  const compare = () => {
    const score = teamAdvanceScoring(battle, side, [mage], [warden])
    return [direct, exposed, farther].map(path => score(mage, warden, path))
  }
  theirs.moveAt = 4
  const [closeStaying, middleStaying, farStaying] = compare()
  theirs.moveAt = 0
  const [, middleAfterStep, farAfterStep] = compare()
  if (mode === "warded") {
    assert.equal(middleAfterStep, middleStaying)
    assert.equal(farAfterStep, farStaying)
  } else {
    assert(closeStaying < middleStaying)
    assert(middleStaying - middleAfterStep > farStaying - farAfterStep)
  }
  assert.equal(moveEdgeFighter(battle, mage, mode === "diagonal" ? farther.landing : direct.landing), null)
  advance(battle, .933)
  assert.equal(issueEdgeOrder(battle, warden, "skill2", null, at(717.34, 737.6)), null)
  advance(battle, 1.6)
  assert(battle.time < mage.actionAt)
  if (mode === "direct") assert(mage.hp > 0 && mage.hp < 208)
  else assert.equal(mage.hp, 208)
}
observations.advanceAcrossShoveRange = "compared a pre-action shove after landing with the enemy's legal move-then-cast reach, with shield and cooldown controls"

for (const flipped of [false, true]) for (const mode of ["ward", "weak-shield", "ready-soon", "pursued", "recut", "spent-rail"] as const) {
  const defenders = cards([["warlock", [2, 4]], ["dancer", [0, 1]]], "Prismatic")
  const attackers = cards([["warden", [0, 3]], ["assassin", [mode === "pursued" || mode === "recut" ? 0 : 3, 2]]], "Prismatic")
  const battle = flipped ? createEdgeBattle(attackers, defenders) : createEdgeBattle(defenders, attackers)
  const sparring = battle.sparring!
  const [mage, dancer] = flipped ? sparring.rivals : battle.team
  const [warden, assassin] = flipped ? battle.team : sparring.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = .933
  battle.onSkillEvent = event => events.push({ ...event })
  sparring.first = flipped ? "ally" : "enemy"
  Object.assign(mage, at(775.55, 1067.3), { hp: 91, actionAt: 1.766, passives: [] })
  Object.assign(dancer, at(942.25, 942.94), { hp: mode === "pursued" ? 70 : 288, shield: mode === "weak-shield" ? 50 : 223,
    shieldUntil: 9.6, passives: [] })
  Object.assign(warden, at(915.45, 329.1), { hp: 591, passives: [] })
  Object.assign(assassin, at(496.6, 677.31), { actionAt: 2.433, passives: [] })
  assert.equal(issueEdgeOrder(battle, dancer, "skill2", null, at(795.82, 1102)), null)
  advance(battle, .7)
  assert.equal(issueEdgeOrder(battle, warden, "skill2", null, at(892.47, 782.52)), null)
  if (mode === "ready-soon") dancer.actionAt = 1.75
  const rail = battle.runtime.fields.find(field => field.danceRail?.corner)
  assert(rail)
  if (mode === "spent-rail") rail.seen.add(mage.id)
  assert.equal(canReturnFromShieldedShove(battle, dancer, [warden, assassin]), mode === "ward" || mode === "spent-rail", mode)
  advance(battle, 1.7)
  const move = sparring.actions.find(action => action.name === "移动")
  assert.equal(move?.actorId, mode === "ward" ? mage.id : dancer.id, mode)
  const ward = events.find(event => event.kind === "shield" && event.target === mage.id && event.cast.skill?.id === "dancer/Prismatic/A2")
  assert.equal(ward?.amount, mode === "ward" ? 128 : undefined, mode)
  if (mode === "ward") assert(events.some(event => event.kind === "hit" && event.target === dancer.id &&
    event.cast.owner === warden.id && event.amount === 0 && (event.absorbed ?? 0) > 0))
}
observations.wardMoveOverShieldedEjection = "gave the shared walk to the ward recipient when the shielded fighter could still act after returning, including lethal pursuit and a second ejection"

for (const flipped of [false, true]) for (const mode of ["live", "warded", "already-crossing", "late-return", "entry-in-reach"] as const) {
  const defenders = cards([["spellbreaker", [0, 1]], ["dancer", [0, 1]]], "Prismatic")
  const attackers = cards([["summoner", [1, 2]], ["ranger", [1, 3]], ["warden"], ["berserker"]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [breaker, dancer] = flipped ? battle.sparring!.rivals : battle.team
  const [summoner, ranger, warden, berserker] = flipped ? battle.team : battle.sparring!.rivals
  const ourClocks = flipped ? battle.sparring! : battle
  const theirClocks = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(breaker, at(528, 1072), { passives: [] })
  Object.assign(summoner, at(390.16, 539.82), { passives: [] })
  // Give the breaker a competing shot that can hit both opponents.
  Object.assign(warden, at(660, 960), { hp: 180, actionAt: 8 })
  Object.assign(berserker, at(949, 722), { hp: 600, actionAt: 8 })
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, at(619.55, 448.83)), null)
  const group = battle.runtime.summons[0]
  assert(group)
  const [entry] = group.deployment.bodies.toSorted((first, second) => edgeDistance(first, at(528, 356)) - edgeDistance(second, at(528, 356)))
  advance(battle, 1.01)
  Object.assign(ranger, at(mode === "already-crossing" ? 515 : 371, 356), { speed: 166, passives: [] })
  Object.assign(dancer, mode === "entry-in-reach" ? at(780, 835) : at(mode === "late-return" ? 1146.96 : 1090, 1007.04), { hp: 13, actionAt: 5,
    shield: mode === "warded" ? 510 : 0, shieldUntil: 7, passives: [] })
  if (mode !== "entry-in-reach") assert.equal(moveEdgeFighter(battle, dancer, at(937, 1007.04)), null)
  assert.equal(moveEdgeFighter(battle, ranger, along(entry, direction(entry, ranger), 30)), null)
  ourClocks.moveAt = Infinity
  theirClocks.moveAt = Infinity
  battle.nextThinkAt = battle.time
  advance(battle, 3.15)
  const cleared = events.some(event => event.kind === "remove" && event.cast.owner === breaker.id)
  const crossed = events.some(event => event.style === "portal" && event.target === ranger.id)
  assert.equal(cleared, mode === "live", mode)
  assert.equal(crossed, mode !== "live", mode)
  if (mode === "live" || mode === "warded" || mode === "late-return") assert.equal(dancer.hp, 13, mode)
  if (mode === "entry-in-reach") assert.equal(dancer.hp, 0, mode)
}
observations.portalsBeforeRangedFinish = "dispelled a gate that enabled a ranged finish after a known return, with ward, traversal, free return and near-side reach controls"

for (const flipped of [false, true]) for (const mode of ["exposed", "warded-partner", "late-repeat"] as const) {
  const defenders = cards([["paladin", [1, 2]], ["spellbreaker", [4, 2]], ["warlock", [2, 4]], ["dancer", [0, 1]]], "Prismatic")
  const attackers = cards([["warden", [0, 3]], ["assassin", [0, 2]], ["ranger", [1, 3]], ["summoner", [1, 0]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [paladin, breaker, warlock, dancer] = flipped ? battle.sparring!.rivals : battle.team
  const [warden, assassin, ranger, summoner] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(paladin, at(415, 849), { actionAt: 5 })
  Object.assign(breaker, at(528, 1061), { hp: 455, shield: mode === "warded-partner" ? 220 : 0, shieldUntil: 9, actionAt: 5 })
  Object.assign(warlock, at(750.32, 1061), { hp: 208, shield: 128, shieldUntil: 9, actionAt: 5 })
  Object.assign(dancer, at(942, 943), { hp: 288, shield: 223, shieldUntil: 9, actionAt: 5 })
  Object.assign(assassin, at(473.56, 622.86))
  Object.assign(ranger, at(528, 356))
  Object.assign(warden, at(892, 782), { actionAt: 8 })
  Object.assign(summoner, at(398, 635), { actionAt: 8 })
  assert.equal(issueEdgeOrder(battle, assassin, "skill2", null, at(658.83, 978.57)), null)
  if (mode === "late-repeat") assassin.actionAt = 9
  advance(battle, .69)
  const dodge = dodgeAreaDamage(battle, warlock)
  assert(dodge?.anticipatesFollowUp, mode)
  assert.equal(edgeDistance(dodge.landing, breaker) > 320, mode === "exposed", mode)
  assert.equal(moveEdgeFighter(battle, warlock, dodge.point), null)
  advance(battle, 1.35)
  assert.equal(edgeDistance(warlock, breaker) > 320, mode === "exposed", mode)
}
observations.spacingAfterSharedArea = "kept the immediate escape and split two wounded cards beyond the next reachable circle"

for (const flipped of [false, true]) for (const mode of ["paired", "spaced", "strong-ward", "late-caster"] as const) {
  const defenders = cards([["paladin", [1, 2]], ["spellbreaker", [4, 2]], ["warlock", [2, 4]], ["dancer", [0, 1]]], "Prismatic")
  const attackers = cards([["warden", [0, 3]], ["assassin", [0, 2]], ["ranger", [1, 3]], ["summoner", [1, 0]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [paladin, breaker, warlock, dancer] = flipped ? battle.sparring!.rivals : battle.team
  const [warden, assassin, ranger, summoner] = flipped ? battle.team : battle.sparring!.rivals
  const theirClocks = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const actions: { at: number; actor: EdgeUnit["id"]; kind: SkillEvent["kind"]; skill?: string }[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = ({ kind, cast }) => {
    if (kind === "cast" || kind === "startMove") actions.push({ at: battle.time, actor: cast.owner, kind, skill: cast.skill?.id })
  }
  Object.assign(paladin, at(415, 849), { actionAt: 5 })
  Object.assign(breaker, at(mode === "spaced" ? 440 : 583.21, 1072), { hp: 3, actionAt: 5 })
  Object.assign(warlock, at(850, 1061), { hp: 31, shield: mode === "strong-ward" ? 460 : 185, shieldUntil: 9, actionAt: 5 })
  Object.assign(dancer, at(890.07, 955.93), { hp: 288, shield: 25, shieldUntil: 1.05, actionAt: 4 })
  Object.assign(assassin, at(671.43, 649.59), { actionAt: mode === "late-caster" ? 2 : 0 })
  Object.assign(ranger, at(549.25, 263.41))
  Object.assign(warden, at(915.45, 329.1), { actionAt: 6 })
  Object.assign(summoner, at(390.16, 539.82), { actionAt: 5 })
  assert.equal(issueEdgeOrder(battle, ranger, "skill2", null, at(366, 307)), null)
  theirClocks.moveAt = Infinity
  battle.sparring!.first = flipped ? "ally" : "enemy"
  advance(battle, .69)
  battle.nextThinkAt = battle.time
  advance(battle, 1.83)
  const circle = actions.find(action => action.skill === "assassin/Prismatic/A3")
  const movement = actions.find(action => action.kind === "startMove" && (action.actor === dancer.id || action.actor === breaker.id || action.actor === warlock.id))
  if (mode === "paired") {
    assert(circle && movement)
    assert(movement.at >= circle.at)
    assert(actions.indexOf(circle) < actions.indexOf(movement))
    assert(breaker.hp > 0 && dancer.hp > 0)
  } else {
    assert(movement && movement.at < (circle?.at ?? Infinity), mode)
  }
}
observations.reserveMovementForPairedCircle = "absorbed the queued shot and kept the shared walk for the circle threatening two cards"

for (const flipped of [false, true]) for (const mode of ["live", "hold-position", "strong-ward", "late-reply"] as const) {
  const defenders = cards([["warlock", [2, 4]]], "Prismatic")
  const attackers = cards([["ranger", [1, 3]], ["spellbreaker", [0, 1]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [warlock] = flipped ? battle.sparring!.rivals : battle.team
  const [ranger, breaker] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(warlock, at(850, 1061), { hp: 72, shield: mode === "strong-ward" ? 450 : 185, shieldUntil: 9, passives: [] })
  Object.assign(ranger, at(549.25, 263.41), { passives: [] })
  Object.assign(breaker, at(640, 530), { actionAt: mode === "late-reply" ? 5 : 0, passives: [] })
  assert.equal(issueEdgeOrder(battle, ranger, "skill2", null, at(366, 307)), null)
  advance(battle, .69)
  const stay = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const forecast = lifeThroughStrikes(battle, warlock, announcedStrikes(battle, warlock, 1.35, stay), stay)
  assert.equal(forecast.hp, 72)
  assert(forecast.shield < warlock.shield)
  const dodge = dodgeAreaDamage(battle, warlock)
  assert.equal(!!dodge?.anticipatesFollowUp, mode === "live" || mode === "hold-position", mode)
  if (dodge && mode === "live") {
    assert.equal(moveEdgeFighter(battle, warlock, dodge.point), null)
    advance(battle, dodge.arrival + SPARRING_STEP)
    assert(edgeDistance(warlock, breaker) > 620)
  }
  if (mode === "live" || mode === "hold-position") {
    advance(battle, 1.42)
    assert.equal(issueEdgeOrder(battle, breaker, "skill2", null, warlock), null)
    advance(battle, 2.06)
    assert.equal(warlock.hp > 0, mode === "live", mode)
  }
}
observations.shieldOnlyOpening = "accounted for shield depletion before a ready ranged finish while leaving protected cards in place"

for (const rarity of ["E", "L"] as const) for (const flipped of [false, true]) {
  for (const mode of ["live", "late", "covered", "edge-stop"] as const) {
    const defenders = cards([["dancer", [rarity === "E" ? 0 : 2, 1]], ["warden"]], rarity)
    const attackers = cards([["ranger", [2, 3]]], rarity)
    const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
    const [dancer, patient] = flipped ? battle.sparring!.rivals : battle.team
    const [ranger] = flipped ? battle.team : battle.sparring!.rivals
    const ourClocks = flipped ? battle.sparring! : battle
    const theirClocks = flipped ? battle : battle.sparring!
    const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
    const events: SkillEvent[] = []
    battle.phase = "running"
    battle.nextThinkAt = Infinity
    battle.onSkillEvent = event => events.push({ ...event })
    const x = mode === "edge-stop" ? FIELD.left : 615
    const shield = mode === "covered" ? 475 : 0
    Object.assign(dancer, at(x, 880), { hp: 62, shield, shieldUntil: 8, passives: [] })
    Object.assign(patient, at(x, 736), { hp: 31, shield, shieldUntil: 8, actionAt: Infinity, passives: [] })
    Object.assign(ranger, at(x + 45, 535), { passives: [] })
    assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(x + (rarity === "E" ? 50 : 75), 808)), null)
    ourClocks.moveAt = theirClocks.moveAt = Infinity
    if (mode === "late") advance(battle, .31)
    const rescue = rescueFromAnnouncedStrike(battle, [dancer, patient], [ranger])
    assert.equal(rescue?.actor.id, mode === "live" ? dancer.id : undefined, `${rarity}/${mode}`)
    if (mode === "live") {
      assert.equal(rescue?.intent.target?.id, patient.id)
      battle.nextThinkAt = battle.time
      advance(battle, .86)
      assert.equal(dancer.hp, 62)
      assert.equal(patient.hp, 31)
      assert.equal(impact(events, dancer.actives[0].id, "shield"), 2)
    }
  }
}
observations.pairedSlideRescue = "moved both cards through the actual rescue paths and applied their landing wards"

for (const flipped of [false, true]) {
  const defenders = cards([["dancer", [0, 1]], ["warden", [1, 2]], ["paladin", [4, 0]]], "E")
  const attackers = cards([["ranger", [2, 1]]], "Prismatic")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [dancer, patient, paladin] = flipped ? battle.sparring!.rivals : battle.team
  const [ranger] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(dancer, at(615, 880), { hp: 120, passives: [] })
  Object.assign(patient, at(615, 736), { hp: 107, actionAt: Infinity, passives: [] })
  Object.assign(paladin, at(830, 810), { shield: 400, shieldUntil: 8, passives: [] })
  Object.assign(ranger, at(680, 500), { passives: [] })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", null, at(561, 808)), null)
  battle.moveAt = battle.sparring!.moveAt = Infinity
  const choose = rescueFromAnnouncedStrike(battle, [dancer, patient, paladin], [ranger])
  assert.equal(choose?.actor.id, dancer.id)
  advance(battle, 1.27)
  assert.equal(impact(events, "dancer/E/A1", "shield"), 2)
  assert.equal(impact(events, "paladin/E/A5", "cast"), 0)
  assert(dancer.hp > 0 && patient.hp > 0)
}
observations.pairedWardPriority = "picked the paired wards when two cards needed protection before the same announced hit"

for (const flipped of [false, true]) for (const mode of ["landing", "cancelled", "shift-only"] as const) {
  const { battle, actor: dancer, events } = start([["dancer", [0, 1]], ["ranger", [0, 1]], ["binder", [0, 2]]], undefined, "E")
  const { boss, team: [, patient, other] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.nextThinkAt = Infinity
  Object.assign(boss, at(600, 500), { attack: 122, moveAt: Infinity })
  Object.assign(dancer, at(550, 930), { hp: 440, passives: [] })
  Object.assign(patient, at(550, 745), { hp: 111, passives: [] })
  Object.assign(other, at(748, 738), { hp: 51, passives: [] })
  if (mode === "shift-only") {
    advance(battle, 1 / 3)
    for (const unit of [dancer, patient]) {
      const end = at(445, unit === patient ? 745 : 930)
      forceTo(battle, unit, end, .34, false, undefined, dancerPath([unit, end]))
    }
  } else {
    assert.equal(issueEdgeOrder(battle, dancer, "skill", patient), null)
  }
  advance(battle, .38)
  if (mode === "cancelled") {
    const end = at(445, 745)
    assert(forceTo(battle, patient, end, .23, false, undefined, dancerPath([patient, end])))
  }
  const position = (unit: EdgeUnit, time: number) => future(battle, unit, time - battle.time)
  const promised = scheduledAid(battle, patient, battle.time + CHARGE.windup, position)
  assert.equal(promised.length, mode === "landing" ? 1 : 0)
  battle.nextThinkAt = battle.time
  advance(battle, 3.6)
  const charge = events.find(event => event.kind === "charge" && event.cast.owner === boss.id)
  assert(charge && edgeDistance(charge.cast.aim, mode === "landing" ? at(748, 738) : at(445, 745)) < 2)
  assert.equal(other.hp, mode === "landing" ? 0 : 51)
  assert.equal(patient.hp, mode === "landing" ? 111 : 0)
  if (mode === "landing") assert.equal(events.find(event => event.kind === "shield" && event.target === patient.id)?.amount, promised[0].shield)
}
observations.pvePairedLandingWard = "used the landing shield of a committed pair movement when choosing the boss charge target"

for (const flipped of [false, true]) for (const mode of ["deep", "shallow", "warded", "late-caster", "action-locked"] as const) {
  const defenders = cards([["summoner", [2, 4]]], "E")
  const attackers = cards([["ranger", [0, 1]], ["healer"]], "E")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [summoner] = flipped ? battle.sparring!.rivals : battle.team
  const [ranger, healer] = flipped ? battle.team : battle.sparring!.rivals
  const ourClocks = flipped ? battle.sparring! : battle
  const theirClocks = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(summoner, at(388, 526), { hp: 136, shield: mode === "warded" ? 260 : 0, shieldUntil: 9,
    actionAt: mode === "action-locked" ? 4 : 0, passives: [] })
  Object.assign(ranger, at(674, 665), { actionAt: mode === "late-caster" ? 2.9 : 2.2, passives: [] })
  Object.assign(healer, at(683, 405), { actionAt: Infinity })
  theirClocks.moveAt = Infinity
  const point = mode === "shallow" ? at(435, 343) : at(484.5, 362.5)
  const arrival = edgeDistance(summoner, point) / summoner.speed
  assert.equal(walksIntoLethalReach(battle, summoner, [ranger, healer], { landing: point, stop: point, arrival }),
    mode === "deep" || mode === "action-locked", mode)
  if (mode === "deep" || mode === "shallow") {
    assert.equal(moveEdgeFighter(battle, summoner, point), null)
    summoner.actionAt = Infinity
    advance(battle, 2.33)
    const aim = along(ranger, direction(ranger, summoner), 329)
    assert.equal(issueEdgeOrder(battle, ranger, "skill", null, aim), null)
    assert(ourClocks.moveAt > battle.time)
    battle.nextThinkAt = battle.time + .19
    advance(battle, 2.88)
    assert.equal(summoner.hp, mode === "deep" ? 0 : 136, mode)
  }
}
observations.advanceThroughMoveRecovery = "checked lethal circle clearance after movement unlock, with close edge, shield and cooldown controls"

for (const flipped of [false, true]) for (const mode of ["finishing", "early", "covered", "shielded", "walk-ready"] as const) {
  const summoners = cards([["summoner", [2, 4]]], "E")
  const retreating = cards([["healer", [1, 3]], ["ranger"]], "E")
  const battle = createEdgeBattle(flipped ? retreating : summoners, flipped ? summoners : retreating)
  const [summoner] = flipped ? battle.sparring!.rivals : battle.team
  const [healer, ranger] = flipped ? battle.team : battle.sparring!.rivals
  const ourClocks = flipped ? battle.sparring! : battle
  const theirClocks = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(summoner, at(467, 560), { hp: 136 })
  Object.assign(healer, mode === "early" ? at(938, 500) : at(924, 459), {
    hp: 60, move: at(891, 361), shield: mode === "shielded" ? 160 : 0, shieldUntil: 5,
  })
  Object.assign(ranger, at(969, 584))
  theirClocks.moveAt = mode === "walk-ready" ? .6 : 3
  const original = mode === "covered" ? at(770, 418) : at(801, 576)
  assert.equal(issueEdgeOrder(battle, summoner, "skill", null, original), null)
  const old = events.find(event => event.kind === "cast" && event.cast.skill?.id === "summoner/E/A3")!.cast
  summoner.actionAt = ourClocks.sharedAt = 0
  let intent = chooseAiAttack(battle, summoner, [summoner], [healer, ranger])
  if (mode === "early") {
    assert.equal(intent, undefined, "waited until the opening pulse could also reach")
    advance(battle, .24)
    intent = chooseAiAttack(battle, summoner, [summoner], [healer, ranger])
  }
  if (mode === "finishing" || mode === "early") {
    assert.equal(intent?.order, "skill", mode)
    assert.equal(issueEdgeOrder(battle, summoner, intent!.order, intent!.target ?? null, intent!.at), null)
  } else {
    assert.equal(intent, undefined, mode)
  }
  advance(battle, 1.6)
  const hits = events.filter(event => event.kind === "hit" && event.target === healer.id && event.cast.skill?.id === "summoner/E/A3")
  if (mode === "finishing" || mode === "early" || mode === "covered") {
    assert.equal(healer.hp, 0, mode)
    assert.equal(hits.length, 2, mode)
    assert.equal(hits.every(event => event.cast.id === old.id), mode === "covered", mode)
  } else {
    assert.equal(healer.hp, 60, mode)
    assert.equal(hits.length, 0, mode)
  }
}
observations.bellIntercept = "led both pulses onto a committed retreat, with pre-contact, productive bell, shield and new move controls"

for (const flipped of [false, true]) for (const mode of ["save", "warded", "late", "outside-range", "dodge"] as const) {
  const defenders = cards([["bulwark"], ["summoner", [2, 4]]], "E")
  const attackers = cards([["binder"], ["ranger"], ["healer"]], "E")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const ours = flipped ? battle.sparring!.rivals : battle.team
  const theirs = flipped ? battle.team : battle.sparring!.rivals
  const [tank, summoner] = ours
  const [binder, ranger, healer] = theirs
  const ourClocks = flipped ? battle.sparring! : battle
  const theirClocks = flipped ? battle : battle.sparring!
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(tank, at(483, 535), { hp: 83, shield: mode === "warded" ? 170 : 0, shieldUntil: 4, actionAt: 0 })
  Object.assign(summoner, at(573, 661), { actionAt: 2.7 })
  const spot = mode === "outside-range" ? at(991, 535) : mode === "dodge" ? at(939, 535) : at(537, 471)
  Object.assign(binder, spot, { actionAt: mode === "late" ? 1.6 : mode === "dodge" ? .92 : .60 })
  Object.assign(ranger, at(573, 541), { hp: 343, shield: 57, shieldUntil: 6, actionAt: 3.36 })
  Object.assign(healer, at(425, 537), { actionAt: 3.43 })
  ourClocks.moveAt = .735
  theirClocks.moveAt = Infinity
  const attack = chooseAiAttack(battle, tank, ours, theirs)!
  assert.equal(attack.order, "skill", mode)
  const rescue = rescueFromAnnouncedStrike(battle, ours, theirs, undefined, { attack: { actor: tank, intent: attack }, afterOpponent: false })
  assert.equal(rescue?.intent.order, mode === "save" ? "skill2" : undefined, mode)
  if (mode === "save") {
    advance(battle, 1.28)
    const opening = events.find(event => event.kind === "cast" && event.cast.owner === tank.id)
    assert.equal(opening?.cast.skill?.id, "bulwark/E/A2")
    assert.equal(events.find(event => event.kind === "shield" && event.cast === opening?.cast && event.target === tank.id)?.amount,
      Math.round(tank.maxHp * .15))
    const hit = events.find(event => event.kind === "hit" && event.cast.skill?.id === "binder/E/A2" && event.target === tank.id)
    assert((hit?.absorbed ?? 0) > 83)
    assert(tank.hp > 0)
  }
}
observations.wardBeforeCircle = "preserved an immediate circle shield for a possible lethal cast, with existing ward, timing, reach and live dodge controls"

for (const flipped of [false, true]) for (const mode of ["enter", "miss", "expires", "used"] as const) {
  const { battle, actor: tank, events } = start([["bulwark"], ["ranger"], ["binder"]], undefined, "E")
  const { boss, team: [, patient, other] } = battle
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.nextThinkAt = Infinity
  Object.assign(boss, at(600, 500), { attack: 122, moveAt: Infinity })
  Object.assign(tank, at(450, 965), { hp: 440, passives: [] })
  Object.assign(patient, at(mode === "used" ? 410 : 317, 745), { hp: 111, passives: [] })
  Object.assign(other, at(748, 738), { hp: 51, passives: [] })
  assert.equal(issueEdgeOrder(battle, tank, "skill2", null, at(mode === "miss" ? 580 : 500, 745)), null)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "bulwark/E/A2")!
  assert.equal(field.seen.has(patient.id), mode === "used")
  if (mode === "used") Object.assign(patient, at(317, 745), { shield: 0, shieldUntil: 0 })
  advance(battle, .93)
  assert.equal(moveEdgeFighter(battle, patient, at(445, 745)), null)
  if (mode === "expires") field.until = battle.time + .12
  battle.nextThinkAt = battle.time
  advance(battle, 4.15)
  const charge = events.find(event => event.kind === "charge" && event.cast.owner === boss.id)
  assert(charge && edgeDistance(charge.cast.aim, mode === "enter" ? at(748, 738) : at(445, 745)) < 2,
    JSON.stringify({ mode, flipped, aim: charge?.cast.aim, patient: patient.hp, other: other.hp }))
  assert.equal(patient.hp, mode === "enter" ? 111 : 0, mode)
  assert.equal(other.hp, mode === "enter" ? 0 : 51, mode)
  if (mode === "enter") {
    assert(events.some(event => event.kind === "shield" && event.cast === field.cast && event.target === patient.id))
  }
}
observations.pveEntryWard = "used a shield on a committed route when ranking charge targets, with out-of-path, expiry and spent field controls"

for (const flipped of [false, true]) for (const mode of ["lethal", "shielded", "expires", "collateral"] as const) {
  const defenders = cards([["bulwark"], ["assassin"]], "E")
  const attackers = cards([["ranger", [4, 0]]], "E")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [mover, ally] = flipped ? battle.sparring!.rivals : battle.team
  const [ranger] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  Object.assign(mover, at(600, 700))
  Object.assign(ranger, at(600, 500))
  Object.assign(ally, mode === "collateral" ? at(720, 700) : at(820, 820), { hp: 1 })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", mover), null)
  advance(battle, .75)
  const mark = battle.runtime.watches.find(watch => watch.target === mover.id && watch.cast.skill?.id === "ranger/E/A5")!
  assert(mark)
  mover.hp = mode === "collateral" ? 400 : 13
  if (mode === "shielded") Object.assign(mover, { shield: 100, shieldUntil: 5 })
  if (mode === "expires") mark.until = battle.time + .25
  const point = at(720, 700)
  assert.equal(walkTriggersLethalMark(battle, mover, point), mode === "lethal" || mode === "collateral", mode)
  assert.equal(moveEdgeFighter(battle, mover, point), null)
  advance(battle, 1.7)
  assert.equal(mover.hp === 0, mode === "lethal", mode)
  assert.equal(ally.hp === 0, mode === "collateral", mode)
}
observations.lethalWalkMark = "checked a marked walk against the actual arrival, shield, expiry and splash on a fragile ally"

for (const mode of ["lethal", "shielded", "expires"] as const) {
  const { battle, actor: ranger, events } = start([["ranger", [4, 0]]], undefined, "E")
  const { boss } = battle
  battle.nextThinkAt = Infinity
  Object.assign(boss, { x: 600, y: 512, actionAt: 12 })
  Object.assign(ranger, { x: 600, y: 710 })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", boss), null)
  advance(battle, .75)
  const mark = battle.runtime.watches.find(watch => watch.target === boss.id && watch.cast.skill?.id === "ranger/E/A5")!
  assert(mark)
  ranger.actionAt = Infinity
  boss.hp = 13
  if (mode === "shielded") Object.assign(boss, { shield: 100, shieldUntil: 9 })
  if (mode === "expires") mark.until = battle.time + .25
  battle.nextThinkAt = battle.time
  advance(battle, 2.4)
  const moving = events.filter(event => event.kind === "startMove" && event.target === boss.id)
  assert.equal(moving.length > 0, mode !== "lethal", mode)
  assert.equal(boss.hp, 13, mode)
  if (mode === "lethal") {
    advance(battle, mark.until + .7)
    assert(events.some(event => event.kind === "startMove" && event.target === boss.id))
  }
}
observations.pveLethalWalkMark = "boss held a lethal marked walk and resumed after expiry, with shield and long walk controls"

for (const flipped of [false, true]) for (const mode of ["available", "used", "expires", "late-attacker"] as const) {
  const defenders = cards([["bulwark"], ["binder", [1, 4]]], "E")
  const attackers = cards([["lifebringer", [0, 1]]], "E")
  const battle = createEdgeBattle(flipped ? attackers : defenders, flipped ? defenders : attackers)
  const [tank, ally] = flipped ? battle.sparring!.rivals : battle.team
  const [enemy] = flipped ? battle.team : battle.sparring!.rivals
  const at = (x: number, y: number) => flipped ? mirror({ x, y }) : { x, y }
  const events: SkillEvent[] = []
  battle.phase = "running"
  battle.nextThinkAt = Infinity
  battle.onSkillEvent = event => events.push({ ...event })
  Object.assign(tank, mode === "used" ? at(640, 670) : at(464, 694), { hp: 78 })
  Object.assign(ally, at(748, 648), { actionAt: Infinity })
  Object.assign(enemy, at(655, 386))
  assert.equal(issueEdgeOrder(battle, tank, "skill2", null, at(730, 651)), null)
  const field = battle.runtime.fields.find(field => field.cast.skill?.id === "bulwark/E/A2")!
  assert.equal(field.seen.has(tank.id), mode === "used")
  if (mode === "used") Object.assign(tank, at(464, 694), { shield: 0, shieldUntil: 0 })
  advance(battle, .72)
  assert.equal(moveEdgeFighter(battle, enemy, at(588, 494)), null)
  advance(battle, .94)
  enemy.actionAt = mode === "late-attacker" ? battle.time + 4 : battle.time + .7
  if (mode === "expires") field.until = battle.time + .55
  const route = escapeToEntryWard(battle, tank, [enemy])
  assert.equal(!!route, mode === "available", mode)
  if (route) {
    battle.nextThinkAt = battle.time
    advance(battle, 1.01)
    assert(events.some(event => event.kind === "startMove" && event.target === tank.id), mode)
    advance(battle, 2.7)
    assert(events.some(event => event.kind === "shield" && event.cast === field.cast && event.target === tank.id))
    assert(events.some(event => event.kind === "hit" && event.cast.order === "basic" && event.target === tank.id && event.absorbed))
    assert.equal(tank.hp, 78)
  }
}
observations.retreatIntoEntryWard = "preferred a real entry ward before an approaching opponent's first shot, with expiry, used ward and later attack controls"

for (const mode of ["three-targets", "two-targets"] as const) {
  const { battle, actor: tank, opponents: [ranger] } = start(
    [["bulwark", [1, 3]], ["dancer", [1, 4]], ["binder"], ["healer"]], [["ranger", [2, 4]]], "E",
  )
  battle.sparring!.sharedAt = 0
  const [, dancer, binder, healer] = battle.team
  place(tank, 551, 547)
  tank.hp = 641
  place(dancer, 700, 712)
  Object.assign(dancer, { hp: 310, shield: 70, shieldUntil: 3 })
  place(binder, 636, mode === "three-targets" ? 761 : 926)
  Object.assign(binder, { hp: 459, shield: 110, shieldUntil: 3 })
  place(healer, 838, 589)
  place(ranger, 470, 724)
  const escort = bulwarkEscort(battle, tank, battle.team, [ranger])
  assert.equal(!!escort?.route, mode === "two-targets", mode)
}
observations.escortAddedCircleTargets = "priced the additional third target in a viable enemy circle while retaining the two-target protection route"

for (const lethal of [false, true]) {
  const { battle, actor: ranger, events } = start([["ranger", [4, 0]], ["healer"]], undefined, "E")
  const { boss, team: [, near] } = battle
  battle.nextThinkAt = Infinity
  Object.assign(boss, { x: 600, y: 500, hp: lethal ? 80 : 600, attack: 122, moveAt: Infinity })
  Object.assign(ranger, { x: 800, y: 680, hp: 16 })
  Object.assign(near, { x: 600, y: 600, passives: [] })
  assert.equal(issueEdgeOrder(battle, ranger, "skill", boss), null)
  const position = (unit: EdgeUnit) => unit
  const impact = announcedStrikes(battle, boss, .75, position).find(contact => contact.strike.cast.skill?.id === "ranger/E/A5")!
  assert(impact && impact.at > 0)
  assert.equal(lifeThroughStrikes(battle, boss, [impact], position).hp === 0, lethal)
  battle.nextThinkAt = battle.time
  advance(battle, .8)
  assert.equal(events.some(event => event.kind === "charge" && event.source === boss.id), !lethal)
  assert.equal(events.some(event => event.kind === "hit" && event.cast.order === "basic" && event.source === boss.id), lethal)
  const actual = events.find(event => event.kind === "hit" && event.target === boss.id && event.cast === impact.strike.cast)
  assert(actual && (boss.hp === 0) === lethal)
}
observations.bossReadsLockedRangerShot = "boss compared an actual locked ranger projectile with a charge and used an available basic when the flight was lethal"

for (const [job, rarity] of [["warden", "C"], ["spellbreaker", "UC"]] as const) {
  for (const mode of ["ready", "late", "out-of-range"] as const) {
    const { battle, actor, events } = start([[job], ["ranger"]], undefined, rarity)
    const { boss, team: [, ranger] } = battle
    battle.nextThinkAt = Infinity
    place(boss, 600, 540)
    place(actor, 600, 640)
    place(ranger, 614, 743)
    assert(startBossCharge(battle, actor))
    assert.equal(issueEdgeOrder(battle, actor, "skill", boss), null)
    advance(battle, boss.actionAt + SPARRING_STEP)
    assert(events.some(event => event.kind === "interrupt" && event.target === boss.id))
    assert.equal(battle.telegraph, null)

    Object.assign(boss, { x: 600, y: 540, moveAt: Infinity })
    if (mode === "late") actor.actionAt = battle.time + CHARGE.windup
    actor.y = mode === "out-of-range" ? boss.y + activeFor(actor, "skill").aim.range + 15 : 640
    battle.nextThinkAt = battle.time
    advance(battle, battle.time + SPARRING_STEP)
    assert.equal(boss.lastOrder, mode === "ready" ? "basic" : "charge", job + "/" + mode)
  }
}
observations.pveRepeatInterrupt = "used melee after a known direct interrupt could repeat, and kept a charge against late or out-of-range counters"

console.log(JSON.stringify(observations))
if (!process.argv.includes("--report-only")) {
  for (const [label, value] of Object.entries(observations)) {
    if (label.includes("/") || label === "bloom" || label === "frontLineActed") assert.equal(value, 1, label)
    if (label === "hammer" || label === "starbranch" || label === "sanctuary") assert.equal(value, 2, label)
  }
  assert.equal(observations.advanceBeforeChip, "移动")
  assert.equal(observations.finishBeforeAdvance, "普攻")
  assert.equal(observations.sidestep, "移动")
}

if (process.argv.includes("--lineups")) {
  const teams: SubJobId[][] = [
    ["bulwark", "warden", "warlock", "lifebringer"], ["warden", "spellbreaker", "ranger", "healer"],
    ["bulwark", "berserker", "assassin", "healer"], ["paladin", "berserker", "binder", "bard"],
    ["paladin", "spellbreaker", "warlock", "dancer"], ["warden", "assassin", "ranger", "summoner"],
    ["bulwark", "spellbreaker", "binder", "lifebringer"],
  ]
  const kits: Record<"C" | "L" | "Prismatic", Partial<Record<SubJobId, [number, number]>>> = {
    C: {}, L: {}, Prismatic: { warden: [0, 3], ranger: [1, 3], warlock: [2, 4], lifebringer: [0, 4],
      paladin: [1, 2], berserker: [0, 1], assassin: [0, 2], binder: [0, 4], healer: [2, 4] },
  }
  const games = (Object.keys(kits) as Array<keyof typeof kits>).flatMap((rarity, rank) => teams.map((team, index) => {
    const kit = (job: SubJobId) => pick(job, kits[rarity][job] ?? (rank % 2 ? [1, 4] : [0, 1]))
    const match: Match = { id: `${rarity}/${index}`, kind: "lineup", rarity, formation: index % 2 ? "close" : "open",
      a: team.map(kit), b: teams[(index + 2) % teams.length].map(kit) }
    return { id: match.id, games: [play(match, false), play(match, true)].map(({ scoreA, time, a, b, opposingAid }) => {
      assert(!opposingAid.length, match.id)
      const actions = [...a, ...b].map(({ casts, basic }) => basic + casts[0] + casts[1])
      return { scoreA, time: Math.round(time * 10) / 10, actions }
    }) }
  }))
  console.log(JSON.stringify(games))
}
