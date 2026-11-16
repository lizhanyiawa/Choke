import assert from "node:assert/strict"
import { DEMO_CARDS } from "../src/card/data.ts"
import { SUBJOBS, type SubJobId } from "../src/card/jobs.ts"
import { JOBS } from "../src/card/cultivation.ts"
import { FOUR_JOB_COMBAT, type CombatVersion } from "../src/card/combatRules.ts"
import type { Job, Rarity } from "../src/card/types.ts"
import { createEdgeBattle, issueEdgeOrder, moveEdgeFighter, SPARRING_STEP, stepEdgeBattle, type EdgeFighter } from "../src/battle/edgeBattle.ts"
import { combatHasRole, equippedCombatRoles } from "../src/battle/combatRules.ts"
import { EDGE_RARITIES, curatedPool, normalizeLoadout, skillPool, type EdgeInputCard } from "../src/battle/edgeSkills/catalog.ts"
import { nearbyBulwark, roleDamageScale, hasHealCut } from "../src/battle/edgeSkills/roles.ts"
import { damageUnit, newCast } from "../src/battle/edgeSkills/runtime.ts"

let checks=0, comparisons=0
const check=(name:string,run:()=>void)=>{run();checks++;console.log("PASS",name)}
function input(job:Job, origin:SubJobId, version:CombatVersion="four-v2", rarity:Rarity="R", level=1, rank=0, uid=1):EdgeInputCard {
  return {uid,cardId:"four-job-test-"+uid,edgeSubjob:origin,edgePool:"curated-v1",combatVersion:version,
    face:{...DEMO_CARDS[0],id:"pool-four-job-"+uid,name:job,job,rarity,level,constellation:rank,isHero:false,mods:[],cultivation:{mods:["drive","core"]}},
    edge:{active:[0,1],passive:[0,1],gold:null}}
}
const origins=(job:Job)=>Object.values(SUBJOBS).filter(tag=>tag.archetype===job).map(tag=>tag.id)
function signature(unit:EdgeFighter){return{stats:unit.card.stats,template:unit.card.subjob,skills:unit.card.skills.map(skill=>skill.id),
  hp:unit.maxHp,attack:unit.attack,armor:unit.armor,range:unit.range,speed:unit.speed,cooldown:unit.actionCooldown,
  growth:unit.growth,tactics:equippedCombatRoles(unit),actives:unit.actives.map(skill=>skill.id),passives:unit.passives.map(skill=>skill.id),gold:unit.gold?.id??null}}
function neutral(unit:EdgeFighter){unit.passives.splice(0);unit.gold=null;Object.assign(unit,{hp:1000,maxHp:1000,armor:0,attack:100,x:600,y:700,shield:0,shieldUntil:0})}
function equip(unit:EdgeFighter, role:SubJobId, rarity:Rarity="R") {const p=skillPool(role,rarity);unit.actives=[p.active[0],p.active[1]];unit.passives=[p.passive[0],p.passive[1]];unit.gold=null}

check("same class and loadout ignore all 14 hidden origins across seven rarities, levels, ranks and mods",()=>{
  for(const job of JOBS)for(const rarity of EDGE_RARITIES)for(const level of [1,18,80])for(const rank of [0,1,2,3,4,5]){
    const expected=signature(createEdgeBattle([input(job,origins(job)[0],"four-v2",rarity,level,rank)]).team[0])
    for(const origin of origins(job)){const candidate=createEdgeBattle([input(job,origin,"four-v2",rarity,level,rank)]).team[0];assert.deepEqual(signature(candidate),expected,`${job}/${origin}/${rarity}/${level}/${rank}`);comparisons++}
  }
  for(const job of JOBS)for(const origin of Object.keys(SUBJOBS) as SubJobId[]) {
    const candidate=createEdgeBattle([input(job,origin)]).team[0],expected=createEdgeBattle([input(job,origins(job)[0])]).team[0]
    assert.deepEqual(signature(candidate),signature(expected),"even inconsistent archive metadata cannot change v2 identity")
  }
})
check("v1 and unversioned snapshots retain exact old templates, range and cooldown",()=>{
  for(const [origin,expected] of [["bulwark",[1077,395,1005,116,7.5]],["warden",[862,682,898,116,6]],["ranger",[614,1317,614,274,5]]] as const){
    const card=input(SUBJOBS[origin].archetype,origin,"legacy-v1");card.face.cultivation=undefined
    const before=structuredClone(card), old=createEdgeBattle([card]).team[0]
    assert.deepEqual([old.maxHp,old.card.stats.atk,old.card.stats.def,old.range,old.actionCooldown],expected)
    const raw={...card};delete raw.combatVersion
    assert.deepEqual(signature(createEdgeBattle([raw]).team[0]),signature(old))
    assert.deepEqual(card,before,"migration never mutates input/save snapshots")
    const modern=createEdgeBattle([{...card,combatVersion:"four-v2"}]).team[0]
    const restored=createEdgeBattle([card]).team[0]
    assert.equal(modern.combatVersion,"four-v2");assert.deepEqual(signature(restored),signature(old))
  }
})
check("canonical IDs are only four asset adapters; base action cooldown never comes from an old tag",()=>{
  const ids=new Set<string>()
  for(const job of JOBS)for(const origin of origins(job)){
    const fighter=createEdgeBattle([input(job,origin)]).team[0];ids.add(fighter.card.subjob.id)
    assert.equal(fighter.actionCooldown,FOUR_JOB_COMBAT[job].actionCooldown)
    assert.equal(fighter.card.stats.int,fighter.card.stats.atk,"INT is a legacy alias, never a hidden second growth stat in v2")
    assert.equal(fighter.legacySubjobId,origin)
  }
  assert.equal(ids.size,4)
})
check("ranged play comes from visible equipped ranger skills, never the old ranger identity",()=>{
  for(const origin of origins("warrior")){
    const close=input("warrior",origin), ranged=input("warrior",origin);ranged.edge={active:[5,6],passive:[8,9],gold:null}
    const melee=createEdgeBattle([close]).team[0], bow=createEdgeBattle([ranged]).team[0]
    assert.equal(melee.range,158);assert.equal(combatHasRole(melee,"ranger"),false)
    assert.equal(bow.range,274);assert.equal(combatHasRole(bow,"ranger"),true)
    assert.equal(bow.actionCooldown,melee.actionCooldown)
  }
})
check("bulwark cover is earned by equipped kit, including a former warden; unequipping removes it",()=>{
  for(const origin of origins("tank")){
    const tank=input("tank",origin), ally=input("mage","binder","four-v2","R",1,0,2)
    const battle=createEdgeBattle([tank,ally]);const [protector,target]=battle.team
    Object.assign(protector,{x:600,y:700});Object.assign(target,{x:650,y:700})
    assert.equal(nearbyBulwark(battle,target),protector)
    equip(protector,"warden");assert.equal(nearbyBulwark(battle,target),undefined);assert(!combatHasRole(protector,"bulwark"))
  }
})
check("assassin and spellbreaker advantages follow their visible skills, not former identity",()=>{
  for(const origin of origins("warrior")){
    const battle=createEdgeBattle([input("warrior",origin)],[input("mage","warlock","four-v2","R",1,0,2)],()=>1);battle.phase="running"
    const actor=battle.team[0],enemy=battle.sparring!.rivals[0];neutral(actor);neutral(enemy);enemy.x=650
    assert.equal(roleDamageScale(battle,actor,enemy),1)
    equip(actor,"assassin");assert.equal(roleDamageScale(battle,actor,enemy),1.18)
    equip(actor,"spellbreaker");const cast=newCast(battle,actor,"basic",enemy,enemy);cast.used.add("manual")
    damageUnit(battle,cast,enemy,40);assert.equal(hasHealCut(battle,enemy),true)
    battle.runtime.buffs=[];equip(actor,"berserker");const next=newCast(battle,actor,"basic",enemy,enemy);next.used.add("manual")
    damageUnit(battle,next,enemy,40);assert.equal(hasHealCut(battle,enemy),false)
  }
})
check("modern manual PvE is deterministic and runnable with canonical classes",()=>{
  const cards=[input("tank","warden"),input("warrior","assassin","four-v2","R",18,2,2),input("support","bard","four-v2","R",18,2,3)]
  cards[0].face.level=18;cards[0].cultivationRun={userId:"test",id:"test",seed:42}
  const fight=()=>{const battle=createEdgeBattle(cards);battle.phase="running"
    for(let frame=0;frame<18000&&String(battle.phase)==="running";frame++){
      for(const actor of battle.team){if(!actor.hp||actor.force)continue
        const distance=Math.hypot(actor.x-battle.boss.x,actor.y-battle.boss.y)
        if(distance<=actor.range)issueEdgeOrder(battle,actor,"basic",battle.boss)
        else moveEdgeFighter(battle,actor,{x:battle.boss.x,y:battle.boss.y+65})
      }
      // Put the combatants in melee once to isolate canonical damage/cooldowns from path planning.
      if(frame===0)battle.team.forEach((unit,i)=>Object.assign(unit,{x:battle.boss.x+(i-1)*20,y:battle.boss.y+65}))
      stepEdgeBattle(battle,SPARRING_STEP)
    }
    assert.equal(battle.phase,"won")
    return {phase:battle.phase,time:battle.time,hp:battle.team.map(unit=>unit.hp),commands:battle.commands}}
  assert.deepEqual(fight(),fight())
})
check("curated pool IDs and golden prerequisites remain stable under both rule versions",()=>{
  for(const job of JOBS)for(const rarity of EDGE_RARITIES){const pool=curatedPool(job,rarity)
    for(let g=0;g<pool.gold.length;g++){const gold=pool.gold[g],loadout=normalizeLoadout(pool,{active:[gold.active,gold.active===0?1:0],passive:[gold.passive,gold.passive===0?1:0],gold:g})
      const modern=input(job,origins(job)[0],"four-v2",rarity),old={...modern,combatVersion:"legacy-v1" as const};modern.edge=old.edge=loadout
      const a=createEdgeBattle([modern]).team[0],b=createEdgeBattle([old]).team[0]
      assert.deepEqual(a.actives.map(s=>s.id),b.actives.map(s=>s.id));assert.deepEqual(a.passives.map(s=>s.id),b.passives.map(s=>s.id));assert.equal(a.gold?.id,b.gold?.id)
    }
  }
})
check("modern AI decisions depend on equipped mechanics rather than archive origin",()=>{
  for(const job of JOBS){
    const play=(origin:SubJobId)=>{const battle=createEdgeBattle([input(job,origin)],[input("mage","binder","four-v2","R",1,0,2)],()=>.5);battle.phase="running"
      for(let i=0;i<600&&String(battle.phase)==="running";i++)stepEdgeBattle(battle,SPARRING_STEP)
      return {phase:battle.phase,time:battle.time,team:battle.team.map(({hp,x,y,actionAt})=>({hp,x,y,actionAt})),enemy:battle.sparring!.rivals.map(({hp,x,y,actionAt})=>({hp,x,y,actionAt})),actions:battle.sparring!.actions}}
    const expected=play(origins(job)[0]);for(const origin of origins(job).slice(1))assert.deepEqual(play(origin),expected,`${job}/${origin} AI parity`)
  }
})
console.log(`Four-job checks: ${checks} groups passed; ${comparisons} same-condition origin comparisons.`)
