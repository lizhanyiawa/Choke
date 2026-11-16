import assert from "node:assert/strict"
import { DEMO_CARDS } from "../src/card/data.ts"
import { LEGACY_SUBJOB_MAP, SUBJOBS, subjobFor, skillSeed } from "../src/card/jobs.ts"
import { armorForDef, GROWTH, JOBS, JOB_LABEL, RANK_UNLOCKS, combatGrowth, composeAttributes, masteryLevel, modTotals, newCultivation, rankEffects, titleBonus } from "../src/card/cultivation.ts"
import { constellationCap, expToNext, levelCap } from "../src/card/progression.ts"
import { createEdgeBattle, issueEdgeOrder, moveEdgeFighter, MOVE_REACH, SPARRING_STEP, stepEdgeBattle, type EdgeBattle } from "../src/battle/edgeBattle.ts"
import { curatedPool, curatedStorageKey, EDGE_RARITIES, eligibleGold, normalizeLoadout, poolForCard, readLoadout, saveLoadout, skillPool, storageKey, type EdgeInputCard } from "../src/battle/edgeSkills/catalog.ts"
import { damageUnit, heal as healUnit, movementAllowance, movementSpeed, newCast } from "../src/battle/edgeSkills/runtime.ts"
import { growthCast, growthCleanse, growthHeal, growthMove, growthShield, growthSurvive, tickGrowth } from "../src/battle/growthRuntime.ts"
import { seededRandom } from "../src/battle/cultivationReplay.ts"

const memory = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) }, configurable: true })
let checks = 0
const check = (name: string, fn: () => void) => { fn(); checks++; console.log("PASS", name) }
function card(job: typeof JOBS[number], rarity: typeof EDGE_RARITIES[number] = "R", rank = 0, mods: string[] = [], uid = 1): EdgeInputCard {
  return { uid, cardId: "cultivation-test-" + uid, edgePool: "curated-v1", face: { ...DEMO_CARDS[0], id: "pool-" + (40 + uid), name: JOB_LABEL[job], job, rarity, isHero: false, level: 1, constellation: rank, mods: [], cultivation: { mods } } }
}
function fight(job: typeof JOBS[number], rank = 0, mods: string[] = []) {
  const battle = createEdgeBattle([card(job, "Prismatic", rank, mods)], [card("tank", "R", 0, [], 2)], () => 1)
  battle.phase = "running"; battle.sharedAt = battle.moveAt = Infinity; battle.sparring!.sharedAt = battle.sparring!.moveAt = Infinity
  const actor = battle.team[0], target = battle.sparring!.rivals[0]
  Object.assign(actor, { x: 500, y: 700 }); Object.assign(target, { x: 560, y: 700, hp: 10000, maxHp: 10000 })
  return { battle, actor, target }
}
function hit(battle: EdgeBattle, raw = 80, derived = false) {
  const actor = battle.team[0], target = battle.sparring!.rivals[0], cast = newCast(battle, actor, "basic", target, target)
  cast.used.add("manual"); return damageUnit(battle, cast, target, raw, undefined, derived)
}

check("four jobs preserve every legacy hash bucket and card seed", () => {
  assert.deepEqual(JOBS, ["warrior", "tank", "mage", "support"])
  for (const job of JOBS) for (let seed = 0; seed < 1000; seed++) {
    let h = 0; for (const c of `${seed}|subjob`) h = (h * 31 + c.charCodeAt(0)) >>> 0
    const old = LEGACY_SUBJOB_MAP[job][h % LEGACY_SUBJOB_MAP[job].length]
    assert.equal(subjobFor(String(seed), job), SUBJOBS[old]); assert.equal(subjobFor(String(seed), job).archetype, job)
  }
  assert.equal(skillSeed("pool-123"), skillSeed("hero-123"))
})
check("all seven rarities x five steps follow the exact unlock matrix; rank zero works", () => {
  const expected = [[0,0,0,0,1], [0,0,0,0,1], [1,1,2,2,3], [1,1,2,2,3], [1,2,2,3,4], [1,2,2,3,4], [1,2,3,4,5]]
  EDGE_RARITIES.forEach((rarity, i) => { assert.equal(rankEffects(rarity, 0), 0); assert.deepEqual([1,2,3,4,5].map(rank => rankEffects(rarity, rank)), expected[i]) })
  assert.equal(rankEffects("Prismatic", 500), 5); assert.equal(rankEffects("R", NaN), 0)
  assert.equal(constellationCap(false), 5); assert.equal(constellationCap(true), 5)
})
check("curated pools stay small, retain real IDs and have valid signature prerequisites", () => {
  const ids = new Set<string>()
  for (const job of JOBS) for (const rarity of EDGE_RARITIES) {
    const pool = curatedPool(job, rarity)
    assert(pool.active.length >= 7 && pool.active.length <= 9); assert(pool.passive.length <= 12)
    pool.active.forEach(skill => ids.add(skill.id)); pool.passive.forEach(skill => ids.add(skill.id)); pool.gold.forEach(skill => ids.add(skill.id))
    for (let i = 0; i < pool.gold.length; i++) {
      const gold = pool.gold[i], loadout = normalizeLoadout(pool, { active: [gold.active, gold.active === 0 ? 1 : 0], passive: [gold.passive, gold.passive === 0 ? 1 : 0], gold: i })
      assert.equal(eligibleGold(pool, loadout, i), true); assert.equal(loadout.gold, i)
      assert.equal(eligibleGold(pool, { ...loadout, active: [100,101] }, i), false)
    }
    assert.equal(pool.gold.length, rarity === "Prismatic" ? 4 : ["L", "Radiant"].includes(rarity) ? 3 : 2)
  }
  console.log("Unique curated skill assets:", ids.size)
})
check("v1 loadout keys, indices, gold and old asset catalog remain readable without writes", () => {
  const input = card("warrior"); delete input.edgePool
  const job = subjobFor(skillSeed(input.face.id), input.face.job).id, old = skillPool(job, input.face.rarity)
  const loadout = normalizeLoadout(old, { active: [2,3], passive: [5,7], gold: null })
  memory.set(storageKey(input), JSON.stringify(loadout)); const before = new Map(memory)
  assert.equal(poolForCard(input), old); assert.deepEqual(readLoadout(input, old), loadout); assert.deepEqual(memory, before)
  input.edgePool = "curated-v1"; const pool = poolForCard(input), chosen = normalizeLoadout(pool, { active: [6,2], passive: [9,1], gold: null })
  saveLoadout(input, chosen); assert.deepEqual(readLoadout(input, pool), chosen)
  assert.equal(typeof JSON.parse(memory.get(curatedStorageKey(input))!).active[0], "string")
  assert.equal(memory.get(storageKey(input)), before.get(storageKey(input)))
  input.edgePool = "legacy-v1"; assert.deepEqual(readLoadout(input, old), loadout)
})
check("invalid skill inputs fall back and never equip invalid gold", () => {
  const pool = curatedPool("mage", "C")
  for (const raw of [null, {}, { active: [-1,2], passive: [0,0], gold: 999 }, { active: [Infinity,NaN] }]) {
    const result = normalizeLoadout(pool, raw); assert.deepEqual(result.active, [0,1]); assert(result.gold === null || eligibleGold(pool, result, result.gold))
  }
})
check("level, old stars and mod flat/percentage composition preserve progress", () => {
  assert.deepEqual(composeAttributes({ atk: 200, int: 100, def: 150, hp: 800 }, ["drive", "core"]), { atk: 292, int: 184, def: 150, hp: 1012 })
  const input = card("mage", "Prismatic", 5), normal = createEdgeBattle([input]).team[0]
  const enhanced = createEdgeBattle([{ ...input, face: { ...input.face, cultivation: { mods: ["drive", "core"] } } }]).team[0]
  assert.equal(enhanced.maxHp, Math.round((normal.maxHp + 120) * 1.10))
  assert.equal(enhanced.card.stats.atk, Math.round((normal.card.stats.atk + 70) * 1.08))
  assert(enhanced.attack > normal.attack)
  const old = createEdgeBattle([{ ...input, face: { ...input.face, level: 35, constellation: 12 } }]).team[0]
  assert.equal(old.card.level, 35); assert.equal(old.card.constellation, 12); assert.equal(old.growth!.effects, 5); assert(old.maxHp > normal.maxHp)
  assert.equal(levelCap(false), 80); assert.equal(levelCap(true), 12); assert(expToNext(1,"C",false) > 0)
  assert.deepEqual(modTotals(["drive", "drive"]), modTotals(["drive"])); assert.equal(modTotals(["unknown"]).spd, 0)
  assert.equal(armorForDef(1000),1000/3200)
  assert(armorForDef(8000)>armorForDef(7000)); assert(armorForDef(1e9)<.56)
})
check("SPD independently affects action speed, movement reach and movement speed; shared cooldown stays fixed", () => {
  const baseline = fight("warrior"), boosted = fight("warrior", 5, ["stride", "overtone"])
  const b = boosted.actor.growth!
  assert.equal(b.spd, 78.75); assert.equal(b.action, .30); assert.equal(b.reach, .196875); assert(Math.abs(b.movement - .23625) < 1e-10)
  assert(boosted.actor.actionCooldown < baseline.actor.actionCooldown)
  assert(movementAllowance(boosted.battle, boosted.actor, MOVE_REACH) > movementAllowance(baseline.battle, baseline.actor, MOVE_REACH))
  assert(movementSpeed(boosted.battle, boosted.actor) > movementSpeed(baseline.battle, baseline.actor))
  assert(combatGrowth("C", 1e9, { mods: ["stride", "overtone"] }).spd <= GROWTH.spdCap)
  assert.equal(combatGrowth("C", -100).spd, 0)
  boosted.battle.sharedAt = 0; assert.equal(issueEdgeOrder(boosted.battle, boosted.actor, "basic", boosted.target), null)
  assert.equal(boosted.battle.sharedAt, .9)
})
check("one equipped title buffs every class and switching/removing has no residue", () => {
  const state = newCultivation(); for (const job of JOBS) state.mastery[job] = 1000
  const build = () => createEdgeBattle(JOBS.slice(0,3).map((job,i) => { const input = card(job,"C",0,[],i+1); input.face.cultivation!.title = { title: state.title, mastery: state.mastery }; return input })).team
  const baseline = build(); state.title = "warrior"; const combat = build()
  combat.forEach((unit,i) => { assert.equal(unit.card.stats.crit - baseline[i].card.stats.crit,18); assert.equal(unit.growth!.reduction,0) })
  state.title = "tank"; build().forEach((unit,i) => { assert.equal(unit.card.stats.crit,baseline[i].card.stats.crit); assert.equal(unit.growth!.reduction,.18) })
  state.title = "mage"; build().forEach((unit,i) => { assert.equal(unit.growth!.reduction,0); assert.equal(unit.speed,baseline[i].speed*1.24) })
  state.title = "support"; build().forEach((unit,i) => { assert.equal(unit.speed,baseline[i].speed); assert.equal(unit.growth!.regen,.008) })
  state.title = null; assert.deepEqual(build().map(x=>x.growth), baseline.map(x=>x.growth))
  assert.equal(masteryLevel(99),0); assert.equal(masteryLevel(100),1); assert.equal(masteryLevel(100000),10)
  assert(titleBonus({ title: "tank", mastery: { ...state.mastery,tank:100 } }).reduction > .07)
})
check("real combat title mitigation, regen and removable mod stats", () => {
  const original = fight("warrior"), protectedFight = fight("warrior")
  protectedFight.target.growth!.reduction = .18
  const normal = hit(original.battle,100), reduced = hit(protectedFight.battle,100)
  assert(reduced < normal * .84 && reduced > normal * .79)
  original.actor.hp = original.actor.maxHp/2; original.actor.growth!.regen = .008
  const before = original.actor.hp; tickGrowth(original.battle, 1); assert(original.actor.hp > before)
  const cut = fight("warrior"); cut.actor.hp=500; cut.actor.maxHp=1000; cut.actor.growth!.regen=.01
  const cutCast=newCast(cut.battle,cut.target,"skill",cut.actor,cut.actor)
  cut.battle.runtime.buffs.push({id:"regen-cut",cast:cutCast,target:cut.actor.id,kind:"healcut",values:[30],style:"",until:100})
  for(let i=0;i<600;i++)tickGrowth(cut.battle,1/60)
  assert(cut.actor.hp>=569 && cut.actor.hp<=570, "regen must apply heal cut before rounding small frame amounts")
  const enhanced = fight("warrior",0,["drive"]); assert(enhanced.actor.attack > original.actor.attack)
  const removed = fight("warrior"); assert.equal(removed.actor.attack,original.actor.attack)
})
check("rank mechanics and mod procs change actual combat and have cooldown guards", () => {
  const leech = fight("warrior",1); leech.actor.hp = leech.actor.maxHp/2; const hp = leech.actor.hp; hit(leech.battle); assert(leech.actor.hp > hp)
  const fang = fight("warrior",0,["fang"]); fang.actor.hp = fang.actor.maxHp/2; const initial = fang.actor.hp; hit(fang.battle); const after=fang.actor.hp; hit(fang.battle); assert(after>initial); assert.equal(fang.actor.hp,after)
  const frost = fight("mage",1); hit(frost.battle); assert(frost.battle.runtime.buffs.some(buff=>buff.target===frost.target.id && buff.kind==="slow"))
  const tank = fight("tank",1); tickGrowth(tank.battle,SPARRING_STEP); assert(tank.actor.shield>0)
  const mage = fight("mage",3); growthCast(mage.battle,mage.actor); assert(mage.actor.shield>0)
  const heal = fight("support",3); const cast=newCast(heal.battle,heal.target,"skill",heal.actor,heal.actor)
  heal.battle.runtime.buffs.push({id:"test",cast,target:heal.actor.id,kind:"root",values:[],style:"",until:20})
  growthHeal(heal.battle,heal.actor,heal.actor,10,false); assert(heal.actor.shield>0); assert.equal(heal.battle.runtime.buffs.length,0)
  const cleanse = fight("mage",4); cleanse.battle.runtime.buffs.push({id:"test",cast,target:cleanse.actor.id,kind:"slow",values:[20],style:"",until:20}); growthMove(cleanse.battle,cleanse.actor); assert.equal(cleanse.battle.runtime.buffs.length,0)
  const rooted = fight("mage",4); rooted.battle.sharedAt=rooted.battle.moveAt=0
  rooted.battle.runtime.buffs.push({id:"rooted-move",cast,target:rooted.actor.id,kind:"root",values:[],style:"",until:20})
  assert.equal(moveEdgeFighter(rooted.battle,rooted.actor,{x:550,y:750}),null); assert.equal(rooted.battle.runtime.buffs.length,0)
  const survive = fight("tank",4); survive.actor.hp=0; growthSurvive(survive.battle,survive.actor); assert(survive.actor.hp>0); survive.actor.hp=0; growthSurvive(survive.battle,survive.actor); assert.equal(survive.actor.hp,0)
  const medic = fight("warrior",0,["medic"]); medic.actor.hp=100
  assert.equal(healUnit(medic.battle,newCast(medic.battle,medic.actor,"skill",medic.actor,medic.actor),medic.actor,100,"test"),149)
  assert(medic.actor.shield>0)
  const combined = fight("warrior",0,["medic","overtone"]); combined.actor.hp=100
  assert.equal(healUnit(combined.battle,newCast(combined.battle,combined.actor,"skill",combined.actor,combined.actor),combined.actor,100,"test"),164)
  const aegis = fight("warrior"); aegis.target.growth!.mods=["aegis"]; hit(aegis.battle); assert(aegis.target.shield>0)
  growthShield(aegis.battle,aegis.target,.01); growthCleanse(aegis.battle,aegis.target)
})
check("deterministic manual PvE replay records accepted commands only", () => {
  const input = card("warrior"); input.cultivationRun={userId:"test",id:"test",seed:42}
  const a=createEdgeBattle([input]), b=createEdgeBattle([input]); a.phase=b.phase="running"
  // Browser DOMPoint coordinates live on accessors, not enumerable own properties.
  assert.equal(moveEdgeFighter(a,a.team[0],Object.create({x:600,y:850})),null)
  assert.deepEqual(a.commands?.[0].at,{x:600,y:850})
  assert.equal(moveEdgeFighter(b,b.team[0],{x:600,y:850}),null)
  for(let i=0;i<1200;i++){stepEdgeBattle(a,SPARRING_STEP);stepEdgeBattle(b,SPARRING_STEP)}
  assert.equal(a.boss.hp,b.boss.hp); assert.equal(a.team[0].hp,b.team[0].hp); assert.deepEqual(a.commands,b.commands)
  assert.deepEqual(Array.from({length:10},seededRandom(8)),Array.from({length:10},seededRandom(8)))
  const timeout=createEdgeBattle([input]);timeout.phase="running";timeout.time=299.99;timeout.nextThinkAt=Infinity
  stepEdgeBattle(timeout,SPARRING_STEP);assert.equal(timeout.phase,"lost");assert.equal(timeout.time,300)
})
console.log(`Cultivation checks: ${checks} groups passed; ${Object.keys(RANK_UNLOCKS).length * 5} rank cells covered.`)
