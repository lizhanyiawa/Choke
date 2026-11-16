import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { createPlaytestApi } from "../src/playtest"
import type { CultivationProfile } from "../../../src/card/cultivation"
import type { CombatVersion } from "../../../src/card/combatRules"
import { toFace, type ApiDeck } from "../../../src/desk/api"
import { createEdgeBattle, issueEdgeOrder, moveEdgeFighter, SPARRING_STEP, stepEdgeBattle } from "../../../src/battle/edgeBattle"
import { normalizeLoadout, poolForCard, type EdgeInputCard } from "../../../src/battle/edgeSkills/catalog"

const app=await createPlaytestApi("four-jobs-qa-"+randomUUID())
const {db}=await import("../src/db/client")
const {cultivationProfiles,cultivationRuns,userCards,users}=await import("../src/db/schema")
const user="playtest-player",base=`/users/${user}/cultivation`;let checks=0
async function call<T>(path:string,payload?:unknown,expected=200):Promise<T>{
  const res=await app.inject({method:payload===undefined?"GET":"POST",url:path,headers:{host:"127.0.0.1:3320"},payload:payload as Record<string,unknown>})
  assert.equal(res.statusCode,expected,res.body);checks++;return (res.json() as {data:T}).data
}
try{
  const fresh=await call<CultivationProfile>(base);assert.equal(fresh.combatVersion,"four-v2")
  await db.update(users).set({createdAt:new Date("2020-01-01T00:00:00Z")}).where(eq(users.id,user))
  await db.delete(cultivationProfiles).where(eq(cultivationProfiles.userId,user))
  const originalAccount=await call<CultivationProfile>(base);assert.equal(originalAccount.combatVersion,"legacy-v1")
  const old={...fresh};delete old.combatVersion
  old.training=451;old.mastery.warrior=1000;old.title="warrior"
  await db.update(cultivationProfiles).set({state:old}).where(eq(cultivationProfiles.userId,user))
  assert.equal((await call<CultivationProfile>(base)).combatVersion,"legacy-v1")
  const [unmodified]=await db.select().from(cultivationProfiles).where(eq(cultivationProfiles.userId,user));assert.equal(unmodified.state.combatVersion,undefined)
  const cards=await db.select().from(userCards).where(eq(userCards.userId,user))
  await db.update(userCards).set({level:18,constellation:4,exp:1234,mods:["HD","legacy-custom"]}).where(eq(userCards.id,cards[0].id))
  await call(base,{action:"equip",uid:cards[0].id,slot:1,mod:"drive"})
  const legacy=await call<CultivationProfile>(base);assert.equal(legacy.combatVersion,"legacy-v1")
  const beforeCards=await db.select().from(userCards).where(eq(userCards.userId,user))
  const modern=await call<CultivationProfile>(base,{action:"rules",combatVersion:"four-v2"})
  assert.deepEqual({...modern,combatVersion:undefined},{...legacy,combatVersion:undefined})
  assert.deepEqual(await db.select().from(userCards).where(eq(userCards.userId,user)),beforeCards)
  await call(base,{action:"rules",combatVersion:"unknown"},400)
  const restored=await call<CultivationProfile>(base,{action:"rules",combatVersion:"legacy-v1"})
  assert.deepEqual(restored,legacy)
  const deck=await call<ApiDeck>(`/users/${user}/deck`)
  const picks=(version:CombatVersion)=>deck.slots.flatMap(slot=>slot.card?[slot.card]:[]).slice(0,3).map(row=>{
    const input:EdgeInputCard={uid:row.userCardId,cardId:row.id,face:toFace(row),edgePool:"curated-v1",combatVersion:version}
    return {uid:input.uid,edgePool:"curated-v1",combatVersion:version,edge:normalizeLoadout(poolForCard(input),null)}
  })
  await call(base+"/start",{lineup:picks("four-v2")},400)
  const started=await call<{lineup:EdgeInputCard[]}>(base+"/start",{lineup:picks("legacy-v1")})
  const archive=structuredClone(started.lineup);for(const card of archive)delete card.combatVersion
  const id=archive[0].cultivationRun!.id
  await db.update(cultivationRuns).set({lineup:archive}).where(eq(cultivationRuns.id,id))
  // Switching the account never rewrites an already started/unversioned v1 battle.
  await call(base,{action:"rules",combatVersion:"four-v2"})
  async function win(lineup:EdgeInputCard[]){
    const battle=createEdgeBattle(lineup);battle.phase="running"
    for(let frame=0;frame<18000&&String(battle.phase)==="running";frame++){
      for(const actor of battle.team){if(!actor.hp||actor.force)continue
        if(Math.hypot(actor.x-battle.boss.x,actor.y-battle.boss.y)<=actor.range)issueEdgeOrder(battle,actor,"basic",battle.boss)
        else moveEdgeFighter(battle,actor,{x:battle.boss.x,y:battle.boss.y+70})
      }
      stepEdgeBattle(battle,SPARRING_STEP)
    }
    assert.equal(battle.phase,"won")
    const run=lineup[0].cultivationRun!
    await db.update(cultivationRuns).set({createdAt:new Date(Date.now()-Math.ceil(battle.time*1000)-3000)}).where(eq(cultivationRuns.id,run.id))
    const result=await call<{won:boolean;duplicate:boolean;profile:CultivationProfile}>(base+"/settle",{id:run.id,commands:battle.commands})
    assert(result.won);assert.equal(result.profile.combatVersion,"four-v2");return {result,time:battle.time,commands:battle.commands}
  }
  const oldWin=await win(archive);assert.equal(oldWin.result.profile.clears,1)
  const repeated=await call<{duplicate:boolean;profile:CultivationProfile}>(base+"/settle",{id,commands:oldWin.commands})
  assert(repeated.duplicate);assert.equal(repeated.profile.clears,1)
  const noVersion=picks("four-v2").map(pick=>({uid:pick.uid,edgePool:pick.edgePool,edge:pick.edge}))
  await call(base+"/start",{lineup:noVersion},400)
  const next=await call<{lineup:EdgeInputCard[]}>(base+"/start",{lineup:picks("four-v2")})
  assert(next.lineup.every(card=>card.combatVersion==="four-v2"))
  const newWin=await win(next.lineup);assert.equal(newWin.result.profile.clears,2);assert.equal(newWin.result.profile.training,511)
  const [after]=await db.select().from(userCards).where(eq(userCards.id,cards[0].id))
  assert.equal(after.level,18);assert.equal(after.constellation,4);assert.equal(after.exp,1434);assert.deepEqual(after.mods,["HD","legacy-custom"])
  await call(base,{action:"rules",combatVersion:"legacy-v1"})
  const rollback=await call<CultivationProfile>(base);assert.equal(rollback.training,511);assert.equal(rollback.clears,2);assert.deepEqual(rollback.equipment,legacy.equipment)
  console.log(JSON.stringify({checks,oldUnversionedBattle:{won:true,time:oldWin.time},modernBattle:{won:true,time:newWin.time},rollbackPreservedInvestment:true,isolatedData:process.env.PG_DATA_DIR},null,2))
}finally{await app.close()}
