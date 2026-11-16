import { issueEdgeOrder, moveEdgeFighter, moveLanding, type EdgeBattle, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, inside, point, type EdgePoint } from "./geometry"
import { basicAttack, damageUnit, movementStopped, newCast, previewSkillDisplacements, startMovement } from "./runtime"
import { binderChoreography } from "./binderChoreo"

type Schedule = (time: number, play: () => void) => void

const partnerSkills = new Set(["mistPane", "ballast", "inwardRail", "relayCuff", "crossWind", "pivotGear",
  "slantTide", "coupled", "windExchange", "inverseField", "retreatSeal"])
export const binderPreviewPartner = (active: EdgeActive) => partnerSkills.has(binderChoreography(active.id)?.motif ?? "")

export function arrangeBinderPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const [actor, ally, spare] = battle.team
  const boss = battle.boss
  const motif = binderChoreography(active.id)?.motif
  const origin = { x: CENTER.x, y: CENTER.y + 177 }
  if (motif === "shoreHitch") origin.x = FIELD.left + 171
  if (motif === "slantTide") origin.x = FIELD.right - 200
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const dummy = (x: number, y: number) => {
    const target = { ...boss, ...near(x, y), id: ("dummy-" + (battle.preview!.targets.length + 1)) as typeof boss.id,
      hp: 2600, maxHp: 2600, once: new Set<string>(), move: null, force: null, telegraph: null }
    battle.preview!.targets.push(target)
    return target
  }
  const focus: EdgePoint[] = []
  let aim = near(0, -215)
  let duration = 4.0
  const walk = (time: number, to: EdgePoint, who = boss) => {
    focus.push(to)
    at(time, () => {
      if (!who.hp || who.force || movementStopped(battle, who) || who.moveAt > battle.time) return
      const landing = moveLanding(who, to, battle, false)
      if (landing && !startMovement(battle, who, landing, false, to)) who.move = landing
      who.moveAt = battle.time + 3.5
      who.sharedAt = battle.time + .9
    })
  }
  const walkFriend = (time: number, to: EdgePoint, unit = ally) => {
    focus.push(to)
    at(time, () => { if (unit) moveEdgeFighter(battle, unit, to) })
  }
  const push = (time: number, target = boss) => at(time, () => {
    if (ally) issueEdgeOrder(battle, ally, "skill", target)
  })
  const hurt = (time: number, unit: EdgeUnit = actor) => at(time, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, 210))
  for (const [index, unit] of battle.team.entries()) {
    unit.maxHp = 1100
    unit.hp = 860 - index * 115
  }
  if (ally) ally.actives[0] = ally.pool.active[motif === "inverseField" ? 2 : 3]
  boss.hp = boss.maxHp = 4600
  boss.moveAt = 0
  boss.sharedAt = 0
  place(actor, 0, 0)
  place(ally, 123, -77)
  place(spare, -128, -67)
  place(boss, 22, -191)

  switch (motif) {
    case "rimeCuff": walk(.97, near(146, -200)); break
    case "cordDart": place(boss, 17, -217); walk(.48, near(89, -224)); break
    case "iceTiles":
      place(boss, 43, -202); if (squad) dummy(-49, -231)
      walk(1.18, near(139, -170))
      break
    case "stepKnot": walk(.95, near(211, -185)); break
    case "cuffWard": place(boss, 50, -99); hurt(1.12); duration = 10.8; break
    case "fixedTether":
      place(boss, 26, -214); walk(.93, near(222, -211)); duration = 4.8
      break
    case "shoreHitch":
      place(boss, -142, -148); place(spare, -85, -26); focus.push({ x: FIELD.left - 41, y: boss.y })
      break
    case "printLock":
      place(boss, 127, -216); walk(1.13, near(-11, -212)); if (squad) dummy(-117, -254)
      break
    case "zipLine":
      aim = near(0, -269); place(boss, 24, -207); dummy(-23, -102)
      break
    case "mistPane":
      place(boss, 45, -232); place(ally, -54, -205)
      break
    case "windSpool":
      aim = near(0, -245); place(boss, 91, -216); if (squad) dummy(-91, -262)
      break
    case "splitReins":
      aim = near(0, -233); place(boss, 87, -246); dummy(-89, -211)
      break
    case "ballast":
      place(boss, -15, -221); place(ally, 42, -117); push(1.24)
      break
    case "burstWheel":
      aim = near(0, -223); place(boss, 70, -204); if (squad) dummy(-71, -242)
      break
    case "shear":
      aim = near(0, -293); place(boss, 13, -210); walk(.13, near(-15, -66))
      if (squad) dummy(-25, -266)
      break
    case "paperFold":
      aim = near(0, -271); place(boss, 16, -204); walk(1.15, near(212, -221))
      if (squad) dummy(-38, -135)
      break
    case "lostStep":
      place(boss, 81, -217); walk(1.06, near(272, -210)); walk(4.73, near(43, -164)); duration = 9.2
      break
    case "inwardRail":
      aim = near(0, -315); place(boss, 21, -236); place(ally, 106, -168); push(1.23)
      if (squad) dummy(-29, -93)
      break
    case "iceJaws":
      aim = near(0, -233); place(boss, 48, -210)
      if (squad) { const escaping = dummy(-93, -231); walk(.35, near(-216, -252), escaping) }
      break
    case "relayCuff":
      place(ally, -43, -148); place(boss, 36, -225); hurt(1.20, ally); duration = 10.9
      break
    case "shadowPlate":
      place(boss, 33, -229); walk(.91, near(168, -238))
      if (squad) dummy(-49, -248)
      break
    case "oldAnchor":
      place(boss, 39, -227); walk(.76, near(55, -75)); walkFriend(1.23, near(-156, 26), actor)
      break
    case "turnstile":
      aim = near(0, -236); place(boss, -75, -260); walk(.97, near(-255, -238))
      walk(4.73, near(-26, -184))
      if (squad) { const second = dummy(68, -207); walk(2.02, near(224, -201), second) }
      duration = 10.1
      break
    case "sinkBasin":
      aim = near(0, -257); place(boss, 81, -236)
      if (squad) dummy(-131, -279)
      break
    case "crossWind":
      aim = near(0, -219); place(boss, 74, -225); place(ally, -56, -191)
      if (squad) place(spare, 29, -136)
      break
    case "pivotGear":
      aim = near(-30, -251); place(boss, 57, -228); place(ally, 54, -126); push(1.31)
      if (squad) dummy(-102, -246)
      focus.push(near(136, -211)); duration = 10.2
      break
    case "slantTide":
      aim = near(83, -229); place(boss, 168, -223); place(ally, 134, -117); push(1.37)
      focus.push({ x: FIELD.right + 184, y: boss.y - 30 })
      break
    case "coupled": {
      place(boss, -61, -216)
      const second = dummy(69, -238)
      place(ally, 89, -124); push(1.32, second)
      if (squad) dummy(-19, -343)
      break
    }
    case "foldPlate":
      aim = near(0, -372); place(boss, 32, -181); dummy(-31, -288)
      walk(1.43, near(-289, -194))
      focus.push(near(-147, -288))
      break
    case "windExchange":
      aim = near(0, -246); place(ally, -76, -224); place(boss, 76, -266)
      walkFriend(1.23, near(34, -211)); walk(1.02, near(-38, -293))
      duration = 6.1
      break
    case "gravityDisk":
      aim = near(0, -250); place(boss, 177, -217); dummy(-176, -255)
      if (squad) dummy(5, -437)
      walk(1.23, near(232, -196)); duration = 5.4
      break
    case "binaryWell":
      aim = near(0, -250); place(boss, 146, -204); dummy(-149, -283)
      if (squad) dummy(-16, -400)
      break
    case "inverseField":
      aim = near(0, -232); place(boss, 116, -232); place(ally, -68, -86); place(spare, -185, -49); push(1.39)
      if (squad) dummy(-88, -245)
      break
    case "retreatSeal":
      aim = near(0, -223); place(boss, 69, -217); place(ally, -38, -177)
      at(1.08, () => { if (ally) basicAttack(battle, boss, ally, true) })
      walk(1.62, near(261, -215)); duration = 5.1
      break
    case "pressurePin":
      aim = near(0, -466); place(boss, 14, -410); dummy(77, -431); dummy(-17, -217)
      focus.push(near(16, -517))
      break
  }
  const picked = active.aim.mode === "enemy" ? boss : active.aim.mode === "ally" ? ally : undefined
  const location = picked ? point(picked) : active.aim.mode === "self" ? point(actor) : aim
  for (const { to } of previewSkillDisplacements(battle, actor, active, location, picked)) focus.push(to)
  at(.28, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, location))
  return { aim: location, picked, focus, duration }
}
