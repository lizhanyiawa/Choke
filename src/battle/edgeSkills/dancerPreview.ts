import { issueEdgeOrder, moveEdgeFighter, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { dancerChoreography, dancerOrbit, dancerRail } from "./dancerChoreo"
import { CENTER, along, direction, inside, point, type EdgePoint } from "./geometry"
import { basicAttack, damageUnit, newCast, previewSkillDisplacements, shoveUnit } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const groupMotifs = new Set(["landingLamp", "entryLace", "stillRing", "partedLane", "borrowStep", "guardRail", "quarterOrbit",
  "inwardFans", "threeBeat", "counterSwing", "finaleSlider", "foldSlider", "rushCrests", "coastRelay", "clearLane"])
export function dancerPreviewPartner(active: EdgeActive) {
  return active.aim.mode === "ally" || active.aim.mode === "other" || groupMotifs.has(dancerChoreography(active.id)?.motif ?? "")
}

export function arrangeDancerPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const [actor, ally, spare] = battle.team
  const boss = battle.boss
  const motif = dancerChoreography(active.id)?.motif
  const origin = { x: CENTER.x - 58, y: CENTER.y + 182 }
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const focus: EdgePoint[] = []
  const walk = (unit: EdgeFighter | undefined, time: number, end: EdgePoint) => {
    if (!unit) return
    focus.push(end)
    at(time, () => moveEdgeFighter(battle, unit, end))
  }
  const push = (unit: EdgeUnit, time: number, length: number, axis: EdgePoint) => at(time, () => {
    shoveUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, length, "", undefined, false, axis)
  })
  const dummy = (at: EdgePoint) => {
    const clone = { ...boss, ...at, id: ("dummy-" + (battle.preview!.targets.length + 1)) as typeof boss.id,
      hp: 3200, maxHp: 3200, shield: 0, once: new Set<string>(), move: null, force: null, telegraph: null }
    battle.preview!.targets.push(clone)
    focus.push(at)
  }
  for (const [i, unit] of battle.team.entries()) {
    unit.hp = 770 - i * 97
    unit.maxHp = 1100
  }
  boss.hp = boss.maxHp = 5400
  place(actor, 0, 0)
  place(ally, 110, -94)
  place(spare, -161, -35)
  place(boss, -136, -221)
  let aim = near(0, -215)
  let castAt = .28
  let duration = 4.5

  switch (motif) {
    case "leadRibbon":
      walk(ally, 1.26, near(142, -236))
      break
    case "heelStamp":
      place(ally, 81, -51); walk(ally, 1.27, near(175, -281))
      break
    case "footCradle":
      place(ally, 51, -117); walk(ally, 1.26, near(170, -205))
      break
    case "halfTurn":
      aim = near(-82, -24); place(spare, -199, -108)
      break
    case "sideSweep":
      aim = near(0, -205); place(boss, 21, -106)
      if (squad) dummy(near(-26, -195))
      break
    case "leadSide":
      place(ally, 80, -129)
      break
    case "braceSash":
      place(ally, 107, -143); place(boss, 191, -207)
      push(ally, 1.39, 132, { x: -1, y: .0 })
      break
    case "landingLamp":
      aim = near(17, -180); place(ally, -120, -116); place(boss, 130, -226); place(spare, -206, -40)
      walk(ally, 1.24, near(6, -176)); duration = 8.7
      break
    case "threadCut":
      aim = near(18, -109); place(boss, 22, -82)
      if (squad) dummy(near(-21, -199))
      break
    case "lightPost":
      place(ally, 103, -79)
      walk(ally, 1.27, near(209, -177))
      break
    case "longMeter":
      place(ally, 70, -49); walk(ally, 1.24, near(180, -336))
      break
    case "entryLace":
      aim = near(4, -228); place(ally, 147, -171); place(boss, -173, -256); place(spare, -173, -117)
      walk(ally, 1.24, near(60, -210)); walk(spare, 3.91, near(-45, -270)); duration = 8.8
      break
    case "oldStep":
      place(ally, 46, -53); place(spare, 117, -51)
      walk(ally, 1.28, near(164, -152))
      break
    case "clearLane":
      aim = near(0, -268); place(boss, 18, -179); place(ally, 101, -162)
      if (squad) { place(spare, -114, -232); dummy(near(-22, -249)) }
      break
    case "stopDrum":
      place(ally, 76, -85); place(boss, 197, -200)
      walk(ally, 1.27, near(105, -171))
      at(2.18, () => damageUnit(battle, newCast(battle, boss, "enemy", ally, ally), ally, 221))
      break
    case "pairedRibbon":
      place(ally, 98, -123)
      break
    case "reboundAnchor":
      place(ally, 107, -122); place(boss, -26, -198)
      push(ally, 1.31, 132, { x: 1, y: 0 })
      focus.push(along(ally, { x: 1, y: 0 }, 132))
      break
    case "wakeFan":
      aim = near(-121, -55); place(boss, 64, -37); place(ally, 157, -190); place(spare, -214, -180)
      if (squad) dummy(near(-10, 77))
      break
    case "stillRing":
      aim = near(26, -190); place(ally, -34, -204); place(spare, 105, -143)
      walk(spare, 1.27, near(98, -246)); duration = 8.9
      break
    case "partedLane":
      aim = near(0, -303); place(ally, -33, -101); place(boss, 21, -182)
      if (squad) { place(spare, 111, -265); dummy(near(-20, -285)) }
      break
    case "hopNote":
      place(ally, -64, -63); place(boss, 111, -230)
      walk(ally, 1.27, near(82, -261))
      if (squad) dummy(near(22, -309))
      break
    case "doubleJump":
      aim = near(139, -15); place(boss, 68, -38)
      if (squad) dummy(near(185, -54))
      break
    case "goldRailPair":
      place(ally, 119, -138); place(spare, 179, -168)
      break
    case "borrowStep":
      aim = near(12, -214); place(ally, -121, -94)
      walk(ally, 1.25, near(-29, -188)); walk(spare, 3.91, near(-91, -245)); duration = 8.9
      break
    case "guardRail":
      aim = near(0, -315); place(ally, 17, -125); place(boss, -71, -204)
      walk(ally, 1.26, near(22, -253)); push(ally, 1.94, 133, { x: 1, y: 0 }); duration = 8.8
      break
    case "quarterOrbit":
      aim = near(14, -126); place(ally, 106, -166); place(spare, -67, -222); place(boss, -184, -213)
      break
    case "inwardFans":
      aim = near(12, -130); place(ally, 127, -158); place(spare, -95, -213); place(boss, -157, -241)
      break
    case "retreatFlash":
      place(ally, 80, -152); place(boss, -13, -188)
      at(1.40, () => basicAttack(battle, boss, ally, true))
      focus.push(along(ally, direction(boss, ally), 133))
      break
    case "threeBeat":
      aim = near(0, -390); place(ally, 137, -117); place(spare, -137, -268); place(boss, -173, -162)
      walk(ally, 1.28, near(-21, -105)); walk(spare, 3.92, near(20, -282))
      if (squad) walk(actor, 6.56, near(0, -192))
      duration = 9.9
      break
    case "counterSwing":
      aim = near(0, -131); place(ally, 98, -154); place(spare, -77, -233)
      Object.assign(boss, along(dancerOrbit(ally, aim, -55).points.at(-1)!, { x: .89, y: -.45 }, 60))
      if (squad) dummy(along(dancerOrbit(actor, aim, -55).points.at(-1)!, { x: .84, y: .54 }, 60))
      break
    case "finaleSlider":
      aim = near(-24, -575); place(ally, -4, -79); place(boss, -112, -321)
      walk(ally, 1.29, near(-20, -509))
      at(1.57, () => damageUnit(battle, newCast(battle, boss, "enemy", ally, ally), ally, 190))
      if (squad) walk(actor, 3.96, near(-19, -340))
      duration = 10.9
      break
    case "foldSlider": {
      aim = near(188, -514)
      const rail = dancerRail(actor, aim, 660, 92, true), corner = rail.corner!
      place(boss, -144, -272)
      Object.assign(ally, along(corner, direction(corner, actor), 132))
      walk(ally, 1.29, corner)
      focus.push(...rail.path.points)
      duration = 9.9
      break
    }
    case "reversePrint":
      castAt = 1.92
      place(ally, -94, -63); place(boss, -92, -224); place(spare, -205, -28)
      walk(ally, .21, near(40, -158))
      push(ally, 1.31, 64, { x: 0, y: -.99 })
      focus.push(near(40, -227))
      break
    case "rushCrests":
      aim = near(10, -135); place(ally, 107, -174); place(spare, -97, -157); place(boss, -5, -303)
      walk(ally, 1.31, near(255, -427)); walk(spare ?? actor, 3.97, near(-191, -355))
      duration = 8.4
      break
    case "coastRelay": {
      aim = near(12, -136); place(ally, 119, -176); place(spare, -69, -240)
      const landing = dancerOrbit(ally, aim, 105).points.at(-1)!
      Object.assign(boss, along(landing, { x: .5, y: -.87 }, 72))
      focus.push(along(boss, direction(landing, boss), 102))
      if (squad) {
        const first = dancerOrbit(actor, aim, 105).points.at(-1)!
        const other = along(first, { x: -.97, y: -.25 }, 70)
        dummy(other)
        focus.push(along(other, direction(first, other), 102))
      }
      break
    }
  }
  const picked = active.aim.mode === "ally" || active.aim.mode === "other" ? ally : undefined
  const location = picked ? point(picked) : aim
  for (const { to, path } of previewSkillDisplacements(battle, actor, active, location, picked))
    focus.push(...(path?.points ?? [to]))
  at(castAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, picked ?? location))
  return { aim: location, picked, duration, focus }
}
