import type { SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import {
  finishBossCharge, issueEdgeOrder, moveEdgeFighter, moveLanding, startBossCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit,
} from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, along, direction, edgeDistance, inside, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit, startMovement } from "./runtime"

type Schedule = (time: number, play: () => void) => void
type Partner = { job: SubJobId; rarity?: Rarity; active?: [number, number] }
const east = { x: 1, y: 0 }
const north = { x: 0, y: -1 }
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, -1, -1, -1],
  UC: [0, 1, 2, 3, 4, -1, -1, 3],
  R: [0, 1, 2, 3, 4, -1, -1, -1],
  E: [0, 1, 2, 3, 4, -1, 4, -1],
  L: [0, 1, 2, 3, 4, 2, -1, -1],
  Radiant: [0, 1, 2, 3, 4, 2, -1, 2],
  Prismatic: [0, 1, 2, 3, 4, 3, -1, -1],
}

const withPartner = new Set([
  "C/P4", "C/P7", "C/P8", "C/G2", "UC/P1", "UC/P2", "UC/P6", "UC/P8",
  "R/P3", "R/P4", "R/P5", "R/P7", "R/G2", "E/P4", "E/P5", "E/P8",
  "L/P1", "L/P3", "L/P4", "L/P5", "L/P6", "L/G1", "L/G2",
  "Radiant/P3", "Radiant/P4", "Radiant/P6", "Radiant/P8", "Radiant/G2",
  "Prismatic/P1", "Prismatic/P2", "Prismatic/P3", "Prismatic/P4", "Prismatic/P5",
  "Prismatic/P6", "Prismatic/P7", "Prismatic/G1", "Prismatic/G2",
])

const short = (id: string) => id.slice("warden/".length)
export const wardenTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]

export function wardenTraitPartners(id: string, squad: boolean): Partner[] {
  const key = short(id)
  const first: Partner = key === "R/P7" ? { job: "warden", rarity: "UC", active: [4, 0] }
    : ["L/P6", "Prismatic/P2", "Prismatic/P4"].includes(key) ? { job: "binder" } : { job: "warden" }
  if (squad || key === "UC/G1" || key === "Prismatic/P8") return [first, { job: "healer" }]
  return withPartner.has(key) ? [first] : []
}

export function arrangeWardenTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const key = short(id)
  const focus: EdgePoint[] = []
  const origin = { x: CENTER.x - 49, y: CENTER.y + 177 }
  const near = (dx: number, dy: number) => inside({ x: origin.x + dx, y: origin.y + dy })
  const place = (unit: EdgeUnit | undefined, dx: number, dy: number) => { if (unit) Object.assign(unit, near(dx, dy)) }
  const rim = (unit: EdgeUnit | undefined, dx: number, depth: number) => {
    if (unit) Object.assign(unit, { x: origin.x + dx, y: FIELD.top + depth })
  }
  const dummy = (dx: number, dy: number) => {
    const id = ("dummy-" + (battle.preview!.targets.length + 1)) as `dummy-${number}`
    const unit = { ...boss, ...near(dx, dy), id, once: new Set<string>() }
    battle.preview!.targets.push(unit)
    return unit
  }
  let duration = 3
  let orderTime = .20
  let aim = near(0, -181)
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.03)
    at(time, play)
  }
  const hit = (time: number, unit: EdgeUnit, amount: number, order: "enemy" | "basic" = "enemy") =>
    queue(time, () => damageUnit(battle, newCast(battle, boss, order, unit, unit), unit, amount))
  const shove = (time: number, unit: EdgeUnit, length = 100, axis = east) => queue(time, () =>
    shoveUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, length, "", undefined, false, axis))
  const walk = (time: number, unit: EdgeFighter, wanted: EdgePoint) => queue(time, () => moveEdgeFighter(battle, unit, wanted))
  const foeWalk = (time: number, unit: EdgeUnit, wanted: EdgePoint) => queue(time, () => {
    const landing = moveLanding(unit, wanted, battle)
    if (landing && !startMovement(battle, unit, landing, false, wanted)) unit.move = landing
  })
  const q = (time: number, unit = actor) => queue(time, () => issueEdgeOrder(battle, unit, "basic", boss))
  const charge = (time: number) => at(time, () => startBossCharge(battle, actor))
  const loss = (unit: EdgeFighter) => hit(.66, unit, 1400)
  const keepClose = (time: number) => queue(time, () => {
    const gap = edgeDistance(actor, boss)
    if (gap > 103) moveEdgeFighter(battle, actor, inside(along(actor, direction(actor, boss), gap - 94)))
  })
  const rightRim = () => {
    const y = CENTER.y + 16
    Object.assign(actor, { x: FIELD.right - 165, y: y + 20 })
    Object.assign(boss, { x: FIELD.right - 65, y })
    if (ally) Object.assign(ally, { x: FIELD.right - 208, y: y - 103 })
    if (spare) Object.assign(spare, { x: FIELD.right - 247, y: y + 86 })
  }
  const returnScene = () => {
    rim(actor, 0, 107)
    rim(ally, 82, -78)
    rim(spare, -101, 163)
    rim(boss, 145, 225)
    walk(.23, ally, { x: ally.x, y: FIELD.top + 51 })
    focus.push({ x: ally.x, y: 48 })
  }
  const rescue = () => {
    place(ally, -71, -225)
    place(boss, 30, -227)
    place(spare, 115, -51)
  }

  for (const [i, unit] of battle.team.entries()) {
    unit.maxHp = 1100
    unit.hp = i === 0 ? 749 : 610 - 54 * i
  }
  boss.hp = boss.maxHp = 3000
  place(actor, 0, 0)
  place(ally, 148, -36)
  place(spare, -151, 36)
  place(boss, 19, -157)

  switch (key) {
    case "C/P1": case "C/G1":
      place(boss, 28, -119)
      charge(.11)
      if (key === "C/G1") dummy(-44, -130)
      break
    case "C/P2":
      aim = near(0, -135)
      place(boss, 22, -106)
      if (squad) dummy(-23, -132)
      break
    case "C/P3":
      aim = near(62, -58)
      hit(.91, actor, 272)
      break
    case "C/P4": case "C/G2":
      place(boss, 166, -189)
      shove(1.05, ally, 100, north)
      break
    case "C/P5":
      place(boss, 26, -96)
      q(7.87)
      break
    case "C/P6":
      rim(actor, 0, 69)
      rim(boss, -115, 172)
      rim(ally, 155, 98)
      rim(spare, -180, 116)
      shove(.42, actor)
      walk(1.25, actor, { x: actor.x + 88, y: FIELD.top + 200 })
      shove(2.61, actor)
      break
    case "C/P7":
      place(boss, 0, -109)
      place(ally, 64, -172)
      q(.21, ally)
      q(1.22)
      break
    case "C/P8": loss(ally); break
    case "UC/P1": case "UC/G1":
      aim = near(0, -105)
      place(boss, 36, -141)
      place(ally, 103, -112)
      place(spare, -65, 28)
      if (squad) dummy(-44, -149)
      break
    case "UC/P2":
      place(boss, 152, -176)
      hit(.86, ally, 125, "basic")
      hit(1.34, ally, 246)
      walk(1.91, ally, near(82, -153))
      break
    case "UC/P3":
      place(boss, 42, -151)
      shove(1.12, actor)
      break
    case "UC/P4":
      aim = near(46, -94)
      place(boss, 61, -184)
      q(7.84)
      break
    case "UC/P5": case "UC/G2":
      place(boss, 169, -88)
      break
    case "UC/P6":
      place(ally, 167, -47)
      walk(.21, ally, near(74, -36))
      hit(.47, actor, 238)
      hit(1.07, actor, 238)
      hit(3.31, actor, 238)
      break
    case "UC/P7":
      rightRim()
      q(.24)
      break
    case "UC/P8":
      aim = near(55, -91)
      place(ally, 124, -94)
      hit(1.01, actor, 480)
      break
    case "R/P1": case "R/G1":
      place(boss, 159, -71)
      if (key === "R/G1") foeWalk(1.04, boss, near(122, -194))
      break
    case "R/P2":
      rightRim()
      Object.assign(boss, { x: FIELD.right - 51, y: actor.y - 111 })
      break
    case "R/P3":
      aim = near(-22, -160)
      place(boss, -31, -182)
      place(ally, 104, -77)
      charge(.12)
      break
    case "R/P4": case "R/G2":
      rim(actor, 0, 223)
      rim(ally, 69, 77)
      rim(boss, 94, 202)
      rim(spare, -130, 246)
      if (key === "R/P4") shove(1.25, actor)
      break
    case "R/P5":
      place(boss, 5, -152)
      place(ally, 75, -254)
      q(1.22, ally)
      break
    case "R/P6":
      place(boss, -97, -25)
      dummy(112, -44)
      hit(.79, actor, 262)
      foeWalk(1.17, boss, near(-270, -39))
      hit(2.76, actor, 262)
      break
    case "R/P7":
      place(ally, -66, -24)
      place(boss, 0, -155)
      queue(.21, () => issueEdgeOrder(battle, ally, "skill", boss))
      q(1.23)
      break
    case "R/P8":
      rim(actor, 0, 154)
      rim(boss, 107, 235)
      rim(ally, -158, 186)
      rim(spare, 141, 122)
      walk(.21, actor, { x: actor.x + 31, y: FIELD.top + 59 })
      break
    case "E/P1": case "E/G1":
      aim = near(0, -225)
      place(boss, -43, -143)
      dummy(45, -194)
      focus.push(near(-208, -143), near(211, -192))
      break
    case "E/P2":
      aim = near(0, -191)
      place(boss, 43, -92)
      foeWalk(.71, boss, near(43, -233))
      foeWalk(1.90, boss, near(217, -64))
      focus.push(near(228, -66))
      duration = 4.16
      break
    case "E/P3": case "E/G2":
      place(boss, 8, -212)
      if (key === "E/G2") dummy(57, -322)
      focus.push(near(12, -356))
      break
    case "E/P4":
      place(ally, 148, -82)
      break
    case "E/P5":
      aim = near(0, -129)
      place(boss, 46, -176)
      place(ally, 102, -236)
      charge(.11)
      q(1.27, ally)
      break
    case "E/P6":
      rightRim()
      q(.23)
      break
    case "E/P7":
      aim = near(12, -138)
      place(boss, -86, -187)
      walk(1.28, actor, near(147, -133))
      break
    case "E/P8":
      returnScene()
      break
    case "L/P1": case "L/G1":
      place(ally, 165, -172)
      place(boss, 103, -238)
      if (key === "L/G1") shove(1.34, ally)
      break
    case "L/P2":
      aim = near(153, -60)
      place(boss, 101, -45)
      q(7.85)
      break
    case "L/P3":
      aim = near(0, -264)
      place(boss, -44, -222)
      place(ally, 36, -162)
      place(spare, -41, -76)
      break
    case "L/P4":
      place(ally, 115, -134)
      place(boss, 96, -292)
      shove(1.22, ally, 100, north)
      break
    case "L/P5": case "L/G2":
      aim = near(0, -183)
      place(boss, 8, -73)
      place(ally, -151, -26)
      place(spare, 138, 66)
      walk(1.19, ally, near(-67, -24))
      break
    case "L/P6":
      Object.assign(actor, { x: FIELD.left + 173, y: origin.y })
      Object.assign(boss, { x: FIELD.left + 124, y: origin.y - 145 })
      Object.assign(ally, { x: FIELD.left + 46, y: origin.y - 45 })
      place(spare, -155, 106)
      aim = { x: actor.x, y: actor.y - 241 }
      focus.push({ x: 62, y: boss.y })
      charge(.11)
      q(1.25, ally)
      break
    case "L/P7":
      place(boss, 0, -83)
      q(.20)
      q(7.86)
      break
    case "L/P8":
      place(boss, 0, -206)
      walk(.22, actor, near(37, -111))
      hit(1.26, actor, 248)
      break
    case "Radiant/P1": case "Radiant/G1":
      aim = near(14, -210)
      place(boss, -92, -231)
      dummy(78, -109)
      focus.push(near(14, -426))
      break
    case "Radiant/P2":
      aim = near(0, -209)
      place(boss, -102, -184)
      orderTime = .39
      foeWalk(.06, boss, near(65, -184))
      foeWalk(1.58, boss, near(76, -239))
      focus.push(near(-230, -178))
      duration = 4.05
      break
    case "Radiant/P3":
      rescue()
      break
    case "Radiant/P4": case "Radiant/G2":
      aim = near(0, -183)
      place(boss, 69, -209)
      place(ally, -87, -174)
      place(spare, 109, -202)
      charge(1.18)
      if (key === "Radiant/G2") shove(1.82, ally)
      break
    case "Radiant/P5":
      aim = near(0, -208)
      place(boss, 27, -99)
      keepClose(6.66)
      q(7.86)
      break
    case "Radiant/P6":
      rescue()
      q(1.24, ally)
      break
    case "Radiant/P7":
      place(boss, 31, -132)
      charge(.21)
      hit(1.12, actor, 241)
      queue(3.23, () => finishBossCharge(battle))
      focus.push(near(-70, 210))
      break
    case "Radiant/P8":
      rescue()
      walk(1.25, actor, near(216, -101))
      focus.push(near(224, -88))
      break
    case "Prismatic/P1": case "Prismatic/G1":
      rim(actor, 0, 320)
      rim(ally, 81, 68)
      rim(boss, 157, 175)
      rim(spare, -108, 157)
      aim = { x: origin.x + 7, y: FIELD.top + 111 }
      if (squad) rim(dummy(0, 0), -20, 125)
      shove(1.16, ally, 106, north)
      focus.push({ x: ally.x, y: 63 })
      break
    case "Prismatic/P2": {
      aim = near(0, -285)
      place(boss, -133, -145)
      const other = dummy(129, -425)
      place(ally, 148, -231)
      place(spare, -164, -94)
      foeWalk(.91, other, near(-82, -367))
      q(1.24, ally)
      break
    }
    case "Prismatic/P3":
      rim(actor, -48, 267)
      rim(ally, 52, 58)
      rim(boss, 118, 169)
      rim(spare, -123, 194)
      shove(1.12, ally, 100, north)
      focus.push({ x: boss.x, y: FIELD.top + 343 })
      break
    case "Prismatic/P4":
      aim = near(-4, -215)
      place(boss, -57, -211)
      place(ally, -121, -126)
      charge(.12)
      q(1.24, ally)
      focus.push(near(-222, -209))
      break
    case "Prismatic/P5": case "Prismatic/G2":
      place(ally, 187, -88)
      place(boss, 62, -62)
      if (key === "Prismatic/G2") {
        hit(1.19, actor, 370)
        hit(1.54, ally, 340)
        duration = 5.2
      } else {
        shove(1.19, actor)
        shove(1.54, ally, 100, north)
      }
      break
    case "Prismatic/P6":
      rim(actor, -145, 184)
      rim(boss, 16, 67)
      rim(ally, -172, 263)
      rim(spare, -30, 271)
      aim = { x: origin.x + 41, y: FIELD.top + 174 }
      focus.push({ x: boss.x, y: 54 })
      break
    case "Prismatic/P7":
      returnScene()
      break
    case "Prismatic/P8":
      loss(ally)
      break
  }

  const mode = active?.aim.mode
  const picked = mode === "enemy" ? boss : mode === "ally" || mode === "other" ? ally : mode === "self" ? actor : undefined
  if (picked) aim = point(picked)
  if (active) at(orderTime, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, aim))
  return { aim, picked, focus, duration: Math.ceil(duration * 10) / 10 }
}
