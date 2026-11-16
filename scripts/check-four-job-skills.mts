import assert from "node:assert/strict"
import { DEMO_CARDS } from "../src/card/data.ts"
import { SUBJOBS, type SubJobId } from "../src/card/jobs.ts"
import type { CombatVersion } from "../src/card/combatRules.ts"
import { createEdgeBattle, type EdgeFighter } from "../src/battle/edgeBattle.ts"
import { EDGE_RARITIES, normalizeLoadout, skillPool, type EdgeInputCard } from "../src/battle/edgeSkills/catalog.ts"
import { castSkill, newCast, tickSkills } from "../src/battle/edgeSkills/runtime.ts"

let checked=0, meaningful=0
function input(role:SubJobId,rarity:typeof EDGE_RARITIES[number],version:CombatVersion,uid:number):EdgeInputCard{
  return {uid,cardId:"skill-parity-"+uid,edgeSubjob:role,edgePool:"legacy-v1",combatVersion:version,
    face:{...DEMO_CARDS[0],id:"pool-skill-parity-"+uid,name:role,job:SUBJOBS[role].archetype,rarity,level:1,constellation:0,isHero:false,mods:[]}}
}
function normalize(unit:EdgeFighter,x:number,y:number){
  Object.assign(unit,{x,y,hp:3500,maxHp:5000,attack:100,armor:.15,range:250,speed:180,actionCooldown:5})
  Object.assign(unit.card.stats,{hp:3500,hpMax:5000,atk:1000,def:1000,int:1000,crit:0,critDamage:1.5})
}
function play(role:SubJobId,rarity:typeof EDGE_RARITIES[number],activeIndex:number,gold:number|null,version:CombatVersion){
  const pool=skillPool(role,rarity), actor=input(role,rarity,version,1)
  const passive=gold===null?[0,1]:[pool.gold[gold].passive,pool.gold[gold].passive===0?1:0]
  actor.edge=normalizeLoadout(pool,{active:[activeIndex,activeIndex===0?1:0],passive,gold})
  const battle=createEdgeBattle([actor,input("warlock",rarity,version,2)],[input("warlock",rarity,version,3),input("ranger",rarity,version,4)],()=>1)
  battle.phase="running";const [caster,ally]=battle.team, [enemy,second]=battle.sparring!.rivals
  normalize(caster,600,850);normalize(ally,650,850);normalize(enemy,600,770);normalize(second,660,770)
  const skill=caster.actives[0],mode=skill.aim.mode
  const target=mode==="self"?caster:mode==="ally"||mode==="other"||mode==="outside"?ally:enemy
  if(mode==="outside")target.x=90
  const cast=newCast(battle,caster,"skill",target,target,skill);cast.used.add("manual");castSkill(battle,cast,skill)
  for(let i=0;i<240&&String(battle.phase)==="running";i++){battle.time+=1/60;tickSkills(battle,1/60)}
  const units=[...battle.team,...battle.sparring!.rivals]
  return {phase:battle.phase,units:units.map(unit=>({hp:unit.hp,shield:unit.shield,x:unit.x,y:unit.y})),
    impacts:battle.impacts.map(({target,amount,kind})=>({target,amount,kind})),
    buffs:battle.runtime.buffs.map(({target,kind,values,style})=>({target,kind,values,style})),
    fields:battle.runtime.fields.map(field=>({mode:field.mode,capacity:field.capacity})),
    summons:battle.runtime.summons.map(group=>({kind:group.deployment.kind,bodies:group.deployment.bodies.map(body=>({hp:body.hp,x:body.x,y:body.y}))}))}
}
for(const role of Object.keys(SUBJOBS) as SubJobId[])for(const rarity of EDGE_RARITIES){
  const pool=skillPool(role,rarity)
  for(let index=0;index<pool.active.length;index++){
    const old=play(role,rarity,index,null,"legacy-v1"), modern=play(role,rarity,index,null,"four-v2")
    assert.deepEqual(modern,old,`${role}/${rarity}/A${index+1}: skill mechanics must not depend on old origin`)
    checked++;if(old.impacts.length||old.buffs.length||old.fields.length||old.summons.length)meaningful++
  }
  for(let gold=0;gold<pool.gold.length;gold++){
    const old=play(role,rarity,pool.gold[gold].active,gold,"legacy-v1"), modern=play(role,rarity,pool.gold[gold].active,gold,"four-v2")
    assert.deepEqual(modern,old,`${role}/${rarity}/G${gold+1}: golden prerequisites and first effects preserved`)
    checked++;if(old.impacts.length||old.buffs.length||old.fields.length||old.summons.length)meaningful++
  }
}
console.log(JSON.stringify({checks:checked,meaningfulScenarios:meaningful,scope:"all 14 archive kits x 7 rarities; active and golden casts; normalized combat stats; first four seconds; no AI simulation"}))
