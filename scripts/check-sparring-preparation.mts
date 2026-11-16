import assert from "node:assert/strict"
import { DEMO_CARDS } from "../src/card/data.ts"
import { GROWTH_MODS } from "../src/card/cultivation.ts"
import { preparationEntry, sandboxProfile, applyTeamCultivation, preparationTemplate } from "../src/battle/preparationGrowth.ts"
import { createEdgeBattle, SPARRING_STEP, stepEdgeBattle } from "../src/battle/edgeBattle.ts"
import { poolForCard, type EdgeInputCard } from "../src/battle/edgeSkills/catalog.ts"
import { readFileSync } from "node:fs"
const input = (uid:number):EdgeInputCard => ({ uid, cardId:`sandbox-${uid}`, edgeSubjob:"ranger", face:{...DEMO_CARDS[0], id:`sandbox-${uid}`,job:"warrior",rarity:"Prismatic",level:18,constellation:3,isHero:false,mods:[]} })
let localReads=0
Object.defineProperty(globalThis,"localStorage",{value:{getItem:()=>{localReads++;throw new Error("sandbox must not read account loadout")}},configurable:true})
const a=preparationEntry(input(-1),true), e=preparationEntry(input(-2),true)
const alternate=preparationEntry({...a.card,edgePool:"legacy-v1",edge:undefined},true)
preparationEntry({...alternate.card,edgePool:"curated-v1",edge:undefined},true)
assert.equal(localReads,0)
assert.equal(a.card.combatVersion,"four-v2");assert.equal(a.card.edgePool,"curated-v1");assert.equal(poolForCard(a.card).version,2)
const changed=preparationTemplate(a,"warlock","L",true)
assert.equal(changed.card.combatVersion,"four-v2");assert.equal(changed.card.edgePool,"curated-v1")
assert.equal(changed.card.face.level,18);assert.equal(changed.card.face.constellation,3);assert.equal(changed.card.face.job,"mage")
const left=sandboxProfile([a.card]),right=sandboxProfile([e.card]);assert.equal(left.inventory.length,GROWTH_MODS.length)
left.title="warrior";left.equipment[-1]=["stride","drive"]
right.title="tank";right.equipment[-2]=["stride","plate"]
const ally=applyTeamCultivation([a],left),enemy=applyTeamCultivation([e],right)
assert.deepEqual(ally[0].card.face.cultivation?.mods,["stride","drive"])
assert.deepEqual(enemy[0].card.face.cultivation?.mods,["stride","plate"])
assert.equal(ally[0].card.face.cultivation?.title?.title,"warrior");assert.equal(enemy[0].card.face.cultivation?.title?.title,"tank")
const run=createEdgeBattle(ally.map(x=>({...x.card,edge:x.equipped})),enemy.map(x=>({...x.card,edge:x.equipped})),()=>.5)
assert.equal(run.team[0].combatVersion,"four-v2");assert.equal(run.sparring!.rivals[0].combatVersion,"four-v2")
assert(run.team[0].growth!.crit>0);assert.equal(run.team[0].growth!.reduction,0)
assert(run.sparring!.rivals[0].growth!.reduction>0);assert.equal(run.sparring!.rivals[0].growth!.crit,0)
assert.equal(run.team[0].growth!.spd,45)
run.phase="running";for(let i=0;i<3600&&run.phase==="running";i++)stepEdgeBattle(run,SPARRING_STEP)
assert(run.time>0);assert(run.sparring!.actions.length>0)
const legacy=preparationEntry({...input(-3),combatVersion:"legacy-v1",edgePool:"legacy-v1",edge:{active:[2,3],passive:[4,5],gold:null}},true)
assert.equal(legacy.card.combatVersion,"legacy-v1");assert.equal(legacy.card.edgePool,"legacy-v1");assert.deepEqual(legacy.equipped.active,[2,3])
assert.deepEqual(sandboxProfile(ally.map(x=>x.card)).equipment,left.equipment)
const view=readFileSync("src/battle/EdgePreparation.tsx","utf8"),lobby=readFileSync("src/battle/BattlePage.tsx","utf8")
assert(!view.includes("growthReady && !sparring && <CultivationPanel"))
assert(view.includes('<details className="cultivation__compat">'))
assert(lobby.includes('edgeSubjob, combatVersion: "four-v2", edgePool: "curated-v1"'))
console.log(JSON.stringify({defaultV2:true,curatedAfterClassChange:true,sideProfilesIndependent:true,legacyPreserved:true,battleSeconds:run.time,actions:run.sparring!.actions.length}))
