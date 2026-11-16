import type { SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { issueEdgeOrder, moveEdgeFighter, moveLanding, startBossCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import { CENTER, FIELD, along, direction, inside, isOutside, type EdgePoint } from "./geometry"
import { basicAttack, damageUnit, movementStopped, newCast, positionUnit, shoveUnit, startMovement } from "./runtime"
import type { EdgeActive } from "./catalog"
import { arrangeBinderPreview } from "./binderPreview"

type Schedule = (time: number, play: () => void) => void
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, -1, 0, -1],
  UC: [0, 1, 2, 3, 4, 2, -1, -1],
  R: [0, 1, 2, 3, 4, -1, -1, -1],
  E: [0, 1, 2, 3, 4, 3, 1, 3],
  L: [0, 1, 2, 3, 4, 2, -1, -1],
  Radiant: [0, 1, 2, 3, 4, 0, -1, 0],
  Prismatic: [0, 1, 2, 3, 4, -1, 0, -1],
}
export const binderTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]

const fieldPushers = new Set(["Prismatic/P3", "Prismatic/G2"])
const allyPull = new Set(["R/P6", "Radiant/P6"])
export function binderTraitPartners(id: string, squad: boolean) {
  const key = id.slice("binder/".length)
  const count = squad || key === "Radiant/P7" || key === "Prismatic/P8" ? 2 : 1
  return Array.from({ length: count }, (_, i): { job: SubJobId; rarity: Rarity } => {
    if (i === 0 && fieldPushers.has(key)) return { job: "ranger", rarity: "UC" }
    if (i === 0 && allyPull.has(key)) return { job: "binder", rarity: "C" }
    return { job: i === 0 ? "bulwark" : "warden", rarity: "C" }
  })
}

export function arrangeBinderTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const key = id.slice("binder/".length)
  const [actor, ally, spare] = battle.team
  const boss = battle.boss
  const origin = { x: CENTER.x, y: CENTER.y + 177 }
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const skip: Record<string, readonly number[]> = {
    "C/G2": [1.18],
    "C/P7": [.97],
    "UC/P6": [1.13],
    "E/G1": [1.15],
    "E/P7": [1.06, 4.73],
    "L/P6": [.97, 4.73, 2.02],
    "Radiant/P6": [1.31],
    "Radiant/P8": [1.31],
  }
  const castAt: Record<string, number> = { "C/P7": 1.63, "E/P8": 1.57, "Radiant/P6": 1.38 }
  const plan = active ? arrangeBinderPreview(battle, active, squad, (time, play) => {
    if (skip[key]?.includes(time)) return
    at(time === .28 ? castAt[key] ?? time : time, play)
  }) : { aim: near(0, -220), picked: undefined, duration: 4, focus: [] as EdgePoint[] }
  const focus = plan.focus
  let duration = plan.duration
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.5)
    at(time, play)
  }
  const hurt = (unit: EdgeUnit, time: number, amount: number, source: EdgeUnit = boss) => queue(time, () =>
    damageUnit(battle, newCast(battle, source, "enemy", unit, unit), unit, amount))
  const enemyWalk = (unit: EdgeUnit, time: number, where: EdgePoint) => {
    focus.push(where)
    queue(time, () => {
      if (!unit.hp || unit.force || movementStopped(battle, unit)) return
      const returning = isOutside(unit)
      const end = moveLanding(unit, where, battle, false)
      if (end && !startMovement(battle, unit, end, returning, where)) unit.move = end
    })
  }
  const walk = (unit: EdgeFighter, time: number, where: EdgePoint) => {
    focus.push(where)
    queue(time, () => moveEdgeFighter(battle, unit, where))
  }
  const hit = (unit: EdgeFighter, time: number, target: EdgeUnit = boss) => queue(time, () => issueEdgeOrder(battle, unit, "basic", target))
  const push = (unit: EdgeUnit, time: number, amount: number, axis: EdgePoint = { x: -1, y: 0 }) => {
    focus.push(along(unit, axis, amount))
    queue(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, amount, "", undefined, false, axis))
  }
  const dummy = (where: EdgePoint) => {
    const target = { ...boss, ...where, id: ("dummy-" + (battle.preview!.targets.length + 1)) as typeof boss.id,
      hp: 3900, maxHp: 3900, once: new Set<string>(), move: null, force: null, telegraph: null }
    battle.preview!.targets.push(target)
    focus.push(where)
    return target
  }
  if (!active) {
    for (const [index, unit] of battle.team.entries()) { unit.maxHp = 1100; unit.hp = 770 - index * 94 }
    boss.hp = boss.maxHp = 5400
    place(actor, 0, 0)
    place(ally, 125, -73)
    place(spare, -131, -40)
    place(boss, 8, -224)
  }
  switch (key) {
    case "C/P1": case "C/G1":
      place(ally, 80, -144); hit(ally, 1.27)
      break
    case "C/G2": {
      Object.assign(boss, { x: plan.aim.x + 17, y: plan.aim.y + 1 })
      const pocket = { x: plan.aim.x + 151, y: plan.aim.y - 5 }
      enemyWalk(boss, .16, pocket)
      const visitor = dummy({ x: pocket.x + 7, y: pocket.y - 92 })
      enemyWalk(visitor, .94, { x: pocket.x - 4, y: pocket.y + 25 })
      break
    }
    case "C/P4":
      place(ally, 199, -122)
      queue(2.67, () => basicAttack(battle, boss, ally, true))
      break
    case "C/P5":
      hit(actor, 6.11)
      break
    case "C/P6":
      place(boss, 11, -257); boss.range = 255
      hurt(actor, .88, 220)
      queue(1.92, () => positionUnit(battle, boss, near(38, -151)))
      break
    case "C/P7":
      enemyWalk(boss, 3.76, near(198, -194))
      break
    case "C/P8":
      place(boss, 0, -269)
      queue(.18, () => startBossCharge(battle, actor))
      walk(actor, .51, near(137, -48))
      hit(actor, 2.76)
      break
    case "UC/P1":
      hit(actor, 6.02)
      break
    case "UC/P3": case "UC/G2": {
      place(ally, 131, -124)
      if (key === "UC/G2") {
        battle.preview!.targets = []
        const peer = dummy({ x: plan.aim.x + 127, y: plan.aim.y + 46 })
        enemyWalk(peer, 1.80, { x: plan.aim.x + 214, y: plan.aim.y + 56 })
      }
      break
    }
    case "UC/P4":
      place(ally, 88, -66); hit(ally, 1.36, battle.preview!.targets[0])
      break
    case "UC/P6":
      plan.aim.y = actor.y - 266
      place(boss, 159, -266)
      enemyWalk(boss, 5.15, near(12, -266))
      hit(actor, 6.15)
      break
    case "UC/P7": case "L/P7": case "Prismatic/P6":
      Object.assign(actor, { x: FIELD.left + 72, y: origin.y })
      place(ally, -45, -103)
      push(actor, .82, 66)
      break
    case "UC/P8":
      place(boss, 46, -227); walk(actor, .23, near(66, -23)); hit(actor, 1.78)
      break
    case "R/P1": case "R/G1":
      place(ally, 65, -166)
      if (key === "R/G1" && !battle.preview!.targets.length) dummy(near(-91, -264))
      if (key === "R/P1") hit(ally, 1.39)
      break
    case "R/P6":
      place(boss, 10, -218); place(ally, 83, -85)
      ally.actives[0] = ally.pool.active[1]
      queue(.30, () => issueEdgeOrder(battle, ally, "skill", boss))
      hit(actor, 1.30)
      break
    case "R/P7":
      place(boss, 5, -184)
      walk(actor, .26, near(-16, 104))
      hit(actor, 1.66)
      break
    case "R/P8":
      push(actor, 1.92, 102)
      break
    case "E/P1":
      place(ally, 158, -155)
      hit(ally, 2.54)
      break
    case "E/G1":
      Object.assign(actor, { x: FIELD.right - 175, y: origin.y })
      Object.assign(boss, { x: FIELD.right - 153, y: origin.y - 196 })
      plan.aim.x = actor.x
      place(ally, 132, -156); place(spare, 55, -88)
      enemyWalk(boss, 1.15, { x: FIELD.right - 14, y: boss.y })
      break
    case "E/P4":
      hit(actor, 6.06)
      break
    case "E/P5":
      push(ally, 2.04, 110, { x: -1, y: 0 })
      break
    case "E/P6":
      Object.assign(plan.aim, near(-4, -120))
      place(boss, -33, -112)
      hurt(actor, 1.21, 220)
      break
    case "E/P7":
      Object.assign(boss, { x: plan.aim.x + 151, y: plan.aim.y + 13 })
      Object.assign(ally, { x: plan.aim.x + 200, y: plan.aim.y + 47 })
      queue(1.31, () => issueEdgeOrder(battle, ally, "skill", boss))
      break
    case "E/P8":
      Object.assign(actor, { x: FIELD.left - 55, y: origin.y + 12 })
      Object.assign(plan.aim, { x: FIELD.left + 190, y: origin.y - 150 })
      Object.assign(boss, { x: plan.aim.x + 32, y: plan.aim.y + 13 })
      walk(actor, .22, { x: FIELD.left + 75, y: origin.y - 9 })
      enemyWalk(boss, 4.99, { x: boss.x + 168, y: boss.y + 9 })
      break
    case "L/P1": case "L/G1":
      place(ally, 119, -150)
      if (key === "L/G1" && !battle.preview!.targets.length) dummy(near(-47, -265))
      if (key === "L/P1") hit(ally, 2.22)
      break
    case "L/P3":
      place(ally, -194, -199)
      break
    case "L/P6":
      place(actor, -72, 0); place(boss, -73, -247)
      enemyWalk(boss, 1.02, near(-155, -231))
      hit(actor, 6.04)
      break
    case "L/P8":
      ally.hp = 375
      walk(ally, .33, near(65, -41))
      break
    case "Radiant/G1": {
      const land = along(boss, direction(plan.aim, boss), 105)
      dummy({ x: land.x + 31, y: land.y - 39 })
      focus.push(along(land, direction(plan.aim, boss), 84))
      break
    }
    case "Radiant/P3":
      place(ally, 8, -165)
      break
    case "Radiant/P6":
      place(ally, 83, -116)
      ally.actives[0] = ally.pool.active[1]
      queue(.30, () => issueEdgeOrder(battle, ally, "skill", boss))
      break
    case "Radiant/P7":
      place(ally, 105, -63); place(spare, -104, -61)
      push(actor, .87, 110)
      break
    case "Radiant/P8":
      Object.assign(plan.aim, near(-20, -356)); place(boss, 35, -360)
      boss.range = 260
      hurt(actor, 1.39, 290)
      break
    case "Prismatic/P1": case "Prismatic/P7":
      place(ally, 109, -158); hit(ally, 1.41)
      break
    case "Prismatic/G2": {
      battle.preview!.targets = []
      const expected = along(boss, direction(boss, ally), 62)
      dummy({ x: expected.x - 22, y: expected.y - 53 })
      break
    }
    case "Prismatic/P5": {
      const nearHead = battle.preview!.targets[1]
      place(nearHead, -15, -132)
      break
    }
    case "Prismatic/P8":
      hurt(spare, .51, 4800)
      hurt(actor, 1.33, 244)
      hurt(ally, 1.94, 230)
      break
  }
  return { ...plan, duration, focus }
}
