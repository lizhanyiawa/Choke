import assert from "node:assert/strict"
import { DEMO_CARDS } from "../src/card/data.ts"
import { createEdgeBattle, finishBossCharge, startBossCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../src/battle/edgeBattle.ts"
import { skillPool, type EdgeInputCard } from "../src/battle/edgeSkills/catalog.ts"
import { basicAttack, damageUnit, newCast, tickSkills } from "../src/battle/edgeSkills/runtime.ts"
import { deploySummon, dismissSummon } from "../src/battle/edgeSkills/summons.ts"
import type { SkillCast } from "../src/battle/edgeSkills/state.ts"
import type { CombatVersion } from "../src/card/combatRules.ts"
const combatVersion: CombatVersion = process.argv.includes("--four-v2") ? "four-v2" : "legacy-v1"

let checks = 0
const check = (name: string, fn: () => void) => { fn(); checks++; console.log("PASS", name) }
function card(uid: number, rank = 3, job: "tank" | "warrior" | "mage" = "tank"): EdgeInputCard {
  return { uid, cardId: "retaliation-" + uid, edgePool: "curated-v1", combatVersion, face: { ...DEMO_CARDS[0], id: "pool-" + uid,
    name: "retaliation-" + uid, job, rarity: "Prismatic", isHero: false, level: 1, constellation: rank, mods: [] } }
}
function prepare(unit: EdgeUnit) {
  Object.assign(unit, { hp: 1000, maxHp: 1000, armor: 0, attack: 100, x: 600, y: 700, shield: 0, shieldUntil: 0 })
  // Isolate growth responses from equipped legacy thorns/guard passives in these fixtures.
  if (typeof unit.id === "number") { const fighter = unit as EdgeFighter; fighter.passives.splice(0); fighter.gold = null }
}
function pve(rank = 3) {
  const battle = createEdgeBattle([card(1, rank)], undefined, () => 1)
  battle.phase = "running"; const tank = battle.team[0]; prepare(tank); prepare(battle.boss)
  Object.assign(battle.boss, { x: 600, y: 620, attack: 40 })
  return { battle, tank, boss: battle.boss }
}
const reflectedHits = (battle: EdgeBattle, target: EdgeUnit) => battle.impacts.filter(impact => impact.kind === "hit" && impact.target === target.id)
function summonScene(rank = 3, friendly = false, ownerJob: "warrior" | "mage" = "mage") {
  const battle = createEdgeBattle(friendly ? [card(1, rank), card(2, 5, ownerJob)] : [card(1, rank)], friendly ? undefined : [card(2, 5, ownerJob)], () => 1)
  battle.phase = "running"; const tank = battle.team[0], owner = friendly ? battle.team[1] : battle.sparring!.rivals[0]
  prepare(tank); prepare(owner); Object.assign(owner, { x: 760, y: 700, attack: 40 })
  const cast = newCast(battle, owner, "skill", tank, tank, skillPool("summoner", "C").active[0])
  const group = deploySummon(battle, cast, owner, "sentry", "retaliation sentry", "C"), body = group.deployment.bodies[0]
  return { battle, tank, owner, cast, group, body }
}
function shoot(scene: ReturnType<typeof summonScene>) {
  const { battle, tank, cast, body } = scene
  const local: SkillCast = { ...cast, summonBody: body.id, from: { x: body.x, y: body.y } }
  return damageUnit(battle, local, tank, 40, { kind: "cast", cast: local, summon: body.id, from: local.from })
}

check("real player PvE: Boss basic attack triggers defender retaliation", () => {
  const { battle, tank, boss } = pve()
  assert.equal(battle.sparring, undefined)
  basicAttack(battle, boss, tank, true)
  assert.equal(tank.hp, 960); assert.equal(boss.hp, 965)
  assert.equal(tank.passiveAt["growth/reflect"], 5); assert.equal(reflectedHits(battle, boss).length, 1)
})
check("real player PvE: Boss charge also reaches the same retaliation path", () => {
  const { battle, tank, boss } = pve()
  assert.equal(startBossCharge(battle, tank), true)
  battle.time = battle.telegraph!.until; finishBossCharge(battle)
  for (let i = 0; i < 30; i++) { battle.time += 1 / 60; tickSkills(battle, 1 / 60) }
  assert(tank.hp < 1000); assert(boss.hp < 1000); assert.equal(reflectedHits(battle, boss).length, 1)
})
check("Boss retaliation observes five-second cooldown and rank unlock", () => {
  const { battle, tank, boss } = pve()
  basicAttack(battle, boss, tank, true); basicAttack(battle, boss, tank, true)
  assert.equal(boss.hp, 965)
  battle.time = 4.999; basicAttack(battle, boss, tank, true); assert.equal(boss.hp, 965)
  battle.time = 5; basicAttack(battle, boss, tank, true); assert.equal(boss.hp, 930)
  const lower = pve(2); basicAttack(lower.battle, lower.boss, lower.tank, true)
  assert.equal(lower.boss.hp, 1000); assert.equal(lower.tank.passiveAt["growth/reflect"], undefined)
})
check("no retaliation for shield-only, zero, derived, dot or reflected damage", () => {
  for (const kind of ["shield", "zero", "derived", "dot", "reflect"] as const) {
    const { battle, tank, boss } = pve(), cast = newCast(battle, boss, "basic", tank, tank)
    if (kind === "shield") { tank.shield = 100; tank.shieldUntil = 100 }
    damageUnit(battle, cast, tank, kind === "zero" ? 0 : 40, undefined, kind === "derived", kind === "dot" || kind === "reflect" ? kind : "")
    assert.equal(boss.hp, 1000, kind); assert.equal(tank.passiveAt["growth/reflect"], undefined, kind)
  }
})
check("fatal damage does not retaliate from a dead tank; existing once-save can survive and respond", () => {
  const killed = pve(); killed.tank.hp = 1; basicAttack(killed.battle, killed.boss, killed.tank, true)
  assert.equal(killed.tank.hp, 0); assert.equal(killed.battle.phase, "lost"); assert.equal(killed.boss.hp, 1000)
  const saved = pve(4); saved.tank.hp = 1; basicAttack(saved.battle, saved.boss, saved.tank, true)
  assert(saved.tank.hp > 0); assert.equal(saved.boss.hp, 965); assert.equal(saved.battle.phase, "running")
})
check("retaliation can finish a living Boss once, without revival or post-finish effects", () => {
  const { battle, tank, boss } = pve(); boss.hp = 1; basicAttack(battle, boss, tank, true)
  assert.equal(boss.hp, 0); assert.equal(battle.phase, "won"); assert.equal(reflectedHits(battle, boss).length, 1)
  const expired = pve(), cast = newCast(expired.battle, expired.boss, "basic", expired.tank, expired.tank)
  expired.boss.hp = 0; damageUnit(expired.battle, cast, expired.tank, 40)
  assert.equal(expired.boss.hp, 0); assert.equal(expired.tank.passiveAt["growth/reflect"], undefined)
})
check("actual summon deployment tick reflects into the firing body, not its caster", () => {
  const scene = summonScene(), { battle, tank, owner, body } = scene
  const hp = body.hp
  for (let i = 0; i < 90; i++) { battle.time += 1 / 60; tickSkills(battle, 1 / 60) }
  assert(tank.hp < 1000); assert.equal(body.hp, hp - 35); assert.equal(owner.hp, 1000)
  assert.equal(reflectedHits(battle, body).length, 1); assert.equal(reflectedHits(battle, owner).length, 0)
  assert(!battle.runtime.buffs.some(buff => buff.kind === "slow"), "summoned hit must not inherit mage frost")
  assert.equal(owner.passiveAt["growth/frost"], undefined)
})
check("native body-owned hit and legacy event metadata fallback both retaliate safely", () => {
  for (const bodyOwned of [true, false]) {
    const scene = summonScene(), { battle, tank, cast, body, owner } = scene, hp = body.hp
    const strike = bodyOwned ? newCast(battle, body, "basic", tank, tank) : cast
    damageUnit(battle, strike, tank, 40, bodyOwned ? undefined : { kind: "cast", cast, summon: body.id })
    assert.equal(body.hp, hp - 35); assert.equal(owner.hp, 1000)
  }
})
check("summons cannot inherit warrior leech, fang, shove or relay", () => {
  const scene = summonScene(3, false, "warrior"), { owner, tank } = scene
  owner.hp = 500; owner.growth!.mods = ["fang"]; shoot(scene)
  assert.equal(owner.hp, 500); assert.equal(tank.force, null)
  assert.equal(owner.passiveAt["growth/modLeech"], undefined); assert.equal(owner.passiveAt["growth/push"], undefined)
  assert.equal(owner.passiveAt["growth/relay"], undefined)
})
check("friendly summons, dead/dismissed bodies and missing physical sources do not consume retaliation", () => {
  for (const kind of ["friendly", "dead", "dismissed", "removed", "unknown"] as const) {
    const scene = summonScene(3, kind === "friendly"), { battle, tank, owner, body, group, cast } = scene
    if (kind === "dead") body.hp = 0
    if (kind === "dismissed") dismissSummon(group, battle.time)
    if (kind === "removed") battle.runtime.summons = []
    const before = body.hp
    if (kind === "unknown") damageUnit(battle, cast, tank, 40)
    else shoot(scene)
    assert.equal(body.hp, before, kind); assert.equal(owner.hp, 1000, kind)
    assert.equal(tank.passiveAt["growth/reflect"], undefined, kind)
  }
})
check("derived retaliation never bounces between two tanks", () => {
  const battle = createEdgeBattle([card(1)], [card(2)], () => 1); battle.phase = "running"
  const tank = battle.team[0], attacker = battle.sparring!.rivals[0]; prepare(tank); prepare(attacker)
  damageUnit(battle, newCast(battle, attacker, "basic", tank, tank), tank, 40)
  assert.equal(tank.hp, 960); assert.equal(attacker.hp, 965)
  assert.equal(battle.impacts.filter(impact => impact.kind === "hit").length, 2)
  assert.equal(attacker.passiveAt["growth/reflect"], undefined)
})
check("a dying summon can be destroyed by retaliation without damaging its owner", () => {
  const scene = summonScene(), { body, owner, battle } = scene; body.hp = 1; shoot(scene)
  assert.equal(body.hp, 0); assert.equal(owner.hp, 1000); assert.equal(battle.phase, "running")
  assert.equal(reflectedHits(battle, body).length, 1)
})
console.log(`Retaliation checks: ${checks} groups passed (${combatVersion}; real PvE Boss + live summon paths and safety boundaries).`)
