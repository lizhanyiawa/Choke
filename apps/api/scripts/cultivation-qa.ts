import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { createPlaytestApi } from "../src/playtest"
import { createEdgeBattle, issueEdgeOrder, moveEdgeFighter, SPARRING_STEP, stepEdgeBattle } from "../../../src/battle/edgeBattle"
import { normalizeLoadout, poolForCard, type EdgeInputCard } from "../../../src/battle/edgeSkills/catalog"
import { edgeDistance } from "../../../src/battle/edgeSkills/geometry"
import type { CultivationProfile } from "../../../src/card/cultivation"
import type { CardFaceData } from "../../../src/card/types"

const app = await createPlaytestApi("cultivation-qa-" + randomUUID())
const { db } = await import("../src/db/client")
const { cultivationProfiles, cultivationRuns, userCards } = await import("../src/db/schema")
const user = "playtest-player", base = `/users/${user}/cultivation`
let checks = 0
async function call(path: string, payload?: unknown, expected = 200) {
  const res = await app.inject({ method: payload === undefined ? "GET" : "POST", url: path,
    headers: { host: "127.0.0.1:3320" }, payload: payload as Record<string, unknown> })
  assert.equal(res.statusCode, expected, `${path}: ${res.body}`); checks++; return res.json().data
}
try {
  const before = await db.select().from(userCards).where(eq(userCards.userId,user))
  const state = await call(base) as CultivationProfile
  assert.equal(state.training,120); assert.equal(state.title,null)
  assert.deepEqual(await db.select().from(userCards).where(eq(userCards.userId,user)),before)
  await call(base,{action:"title",title:"tank"},400)
  await call(base,{action:"title",title:["tank","mage"]},400)
  await call(base,{action:"equip",uid:before[0].id,mod:"stride",slot:0},400)
  await call(base,{action:"equip",uid:before[0].id,mod:"drive",slot:-1},400)
  await call(base,{action:"rank",uid:1.2},400)
  await call(base,{action:"rank",uid:99999999},400)
  await call("/users/foreign/cultivation",undefined,403)
  await call(base,{action:"buy",mod:"fang"},400)
  const [a,b,c] = before
  await call(base,{action:"equip",uid:a.id,mod:"drive",slot:0})
  let changed = await call(base,{action:"equip",uid:b.id,mod:"drive",slot:1}) as CultivationProfile
  assert(!changed.equipment[a.id].includes("drive")); assert.equal(changed.equipment[b.id][1],"drive"); assert.equal(changed.equipment[b.id][0],""); assert(changed.inventory.includes("drive"))
  changed=await call(base,{action:"unequip",uid:b.id,slot:1}); assert.equal(changed.equipment[b.id].filter(Boolean).length,0)
  await call(base,{action:"rank",uid:a.id})
  const parallel = await Promise.all([0,1].map(()=>app.inject({method:"POST",url:base,headers:{host:"127.0.0.1:3320"},payload:{action:"rank",uid:a.id}})))
  assert.deepEqual(parallel.map((x: { statusCode: number })=>x.statusCode).sort(),[200,400]); checks++
  assert.equal((await call(base)).training,10)
  await db.update(userCards).set({exp:1000}).where(eq(userCards.id,a.id))
  await call(base,{action:"level",uid:a.id})
  const [leveled]=await db.select().from(userCards).where(eq(userCards.id,a.id)); assert.equal(leveled.level,a.level+1); assert(leveled.exp<1000)
  await db.update(userCards).set({constellation:12,mods:["HD","custom-legacy"]}).where(eq(userCards.id,c.id))
  await call(base,{action:"rank",uid:c.id},400)
  const [legacy]=await db.select().from(userCards).where(eq(userCards.id,c.id)); assert.equal(legacy.constellation,12); assert.deepEqual(legacy.mods,["HD","custom-legacy"])
  const deck = await call(`/users/${user}/deck`)
  const picks=deck.slots.filter((slot:{card:unknown})=>slot.card).slice(0,3).map((slot:{card:Record<string,unknown>})=>{
    const row=slot.card, input:EdgeInputCard={uid:row.userCardId as number,cardId:row.id as string,edgePool:"curated-v1",face:{...row,id:row.id,isHero:false,mods:[]} as unknown as CardFaceData}
    return {uid:input.uid,edgePool:"curated-v1",combatVersion:"four-v2",edge:normalizeLoadout(poolForCard(input),null)}
  })
  await call(base+"/start",{lineup:[picks[0],picks[0]]},400)
  await call(base+"/start",{lineup:[{...picks[0],edge:{active:[100,1],passive:[0,1],gold:null}}]},400)
  const abandoned=await call(base+"/start",{lineup:picks})
  const started=await call(base+"/start",{lineup:picks}) as {lineup:EdgeInputCard[]}
  await call(base+"/settle",{id:abandoned.lineup[0].cultivationRun.id,commands:[]},400)
  const run=started.lineup[0].cultivationRun!, battle=createEdgeBattle(started.lineup)
  battle.phase="running"
  for(let frame=0;frame<18000 && String(battle.phase)==="running";frame++){
    for(const actor of battle.team) {
      if(!actor.hp || actor.force) continue
      if(edgeDistance(actor,battle.boss)<=actor.range) issueEdgeOrder(battle,actor,"basic",battle.boss)
      else moveEdgeFighter(battle,actor,{x:battle.boss.x,y:battle.boss.y})
    }
    stepEdgeBattle(battle,SPARRING_STEP)
  }
  assert.equal(battle.phase,"won",`manual-command PvE ended ${battle.phase} at ${battle.time}`)
  assert(battle.commands!.length>0)
  await db.update(cultivationRuns).set({createdAt:new Date(Date.now()-Math.ceil(battle.time*1000)-3000)}).where(eq(cultivationRuns.id,run.id))
  await call(base+"/settle",{id:run.id,commands:[{frame:0,unit:999999,type:"basic",target:"boss"}]},400)
  await call(base+"/settle",{id:run.id,commands:[{frame:-1,unit:a.id,type:"basic",target:"boss"}]},400)
  const reward=await call(base+"/settle",{id:run.id,commands:battle.commands})
  assert.equal(reward.won,true); assert.equal(reward.training,30); assert.equal(reward.profile.clears,1)
  const duplicate=await call(base+"/settle",{id:run.id,commands:battle.commands})
  assert.equal(duplicate.duplicate,true); assert.deepEqual(duplicate.profile,reward.profile)
  const [stored]=await db.select().from(userCards).where(and(eq(userCards.userId,user),eq(userCards.id,a.id)))
  assert.equal(stored.exp,leveled.exp+100)
  const trained: CultivationProfile={...reward.profile,training:1000,clears:5,mastery:{warrior:1000,tank:1000,mage:1000,support:1000}}
  await db.update(cultivationProfiles).set({state:trained}).where(eq(cultivationProfiles.userId,user))
  await call(base,{action:"buy",mod:"fang"}); await call(base,{action:"buy",mod:"fang"},400)
  for(const title of ["warrior","tank","mage","support",null]) { const next=await call(base,{action:"title",title}); assert.equal(next.title,title) }
  console.log(JSON.stringify({checks,manualPve:{time:battle.time,commands:battle.commands!.length,phase:battle.phase},reward,repeatedReward:duplicate.duplicate,isolatedData:process.env.PG_DATA_DIR},null,2))
} finally { await app.close() }
