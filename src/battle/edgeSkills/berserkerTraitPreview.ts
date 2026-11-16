import type { SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"

import { issueEdgeOrder, moveEdgeFighter, moveLanding, startBossCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, inside, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit, startMovement } from "./runtime"

type Schedule = (time: number, play: () => void) => void
type Partner = { job: SubJobId; rarity?: Rarity; active?: [number, number] }
const short = (id: string) => id.slice("berserker/".length)
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, -1, 3, 4, -1, -1, -1],
  UC: [0, 1, 2, 3, 4, 0, -1, -1],
  R: [0, 1, 2, 3, 4, -1, -1, -1],
  E: [0, 1, 2, 3, 4, 0, -1, -1],
  L: [0, 1, 2, 3, 4, -1, -1, -1],
  Radiant: [0, 1, 2, 3, -1, -1, 3, -1],
  Prismatic: [0, 1, 2, 3, 4, -1, -1, 3],
}
const withPartner = new Set([
  "C/P7", "UC/P6", "UC/P8", "R/P8", "L/G1", "Radiant/P2", "Radiant/P6", "Radiant/P8",
  "Radiant/G2", "Prismatic/P3", "Prismatic/P8", "Prismatic/G2",
])

export const berserkerTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]

export function berserkerTraitPartners(id: string, squad: boolean): Partner[] {
  const key = short(id)
  const partner: Partner = key === "UC/P8" ? { job: "warden" } : { job: "healer", active: [0, 2] }
  if (squad) return [partner, { job: "warden" }]
  return withPartner.has(key) ? [partner] : []
}

export function arrangeBerserkerTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const key = short(id)
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const origin = { x: CENTER.x - 48, y: CENTER.y + 160 }
  const focus: EdgePoint[] = []
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
  let duration = 3.15
  let orderAt = .20
  let aim = near(0, -164)
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.18)
    at(time, play)
  }
  const hit = (time: number, amount: number, target: EdgeUnit = actor, source: EdgeUnit = boss, style = "") => queue(time, () =>
    damageUnit(battle, newCast(battle, source, "enemy", target, target), target, amount, undefined, false, style))
  const shove = (time: number, length: number, target: EdgeUnit = actor, axis: EdgePoint = { x: 1, y: 0 }) => queue(time, () =>
    shoveUnit(battle, newCast(battle, boss, "enemy", target, target), target, length, "", undefined, false, axis))
  const basic = (time: number, fighter: EdgeFighter = actor) => queue(time, () => issueEdgeOrder(battle, fighter, "basic", boss))
  const support = (time: number, shield: boolean) => queue(time, () => issueEdgeOrder(battle, ally, shield ? "skill2" : "skill", actor))
  const walk = (time: number, fighter: EdgeFighter, to: EdgePoint) => queue(time, () => moveEdgeFighter(battle, fighter, to))
  const walkFoe = (time: number, to: EdgePoint) => queue(time, () => {
    const landing = moveLanding(boss, to, battle)
    if (landing && !startMovement(battle, boss, landing, false, to)) boss.move = landing
  })
  for (const [i, member] of battle.team.entries()) {
    member.maxHp = 1100
    member.hp = i === 0 ? 638 : 590 - i * 37
  }
  boss.hp = boss.maxHp = 2800
  place(actor, 0, 0)
  place(boss, 34, -118)
  place(ally, 155, 43)
  place(spare, -160, 67)

  switch (key) {
    case "C/P1": place(boss, 41, -98); break
    case "C/G1":
      rim(actor, -25, 144); rim(boss, 12, 49); rim(ally, 168, 194); rim(spare, -170, 220)
      focus.push({ x: boss.x + 86, y: 74 })
      break
    case "C/P2":
      place(boss, -45, -106)
      focus.push(near(-84, -185))
      break
    case "C/P3":
      place(boss, 51, -101)
      hit(.38, 174); basic(1.37)
      break
    case "C/P4": case "C/G2":
      aim = near(18, -87); place(boss, 54, -125)
      if (squad) dummy(-32, -102)
      focus.push(near(103, -177))
      break
    case "C/P5":
      actor.hp = 435
      break
    case "C/P6":
      place(boss, -29, -91); basic(.38)
      break
    case "C/P7":
      place(ally, 84, -16); place(boss, -25, -114)
      hit(.44, 238); walk(.86, ally, near(182, 50)); hit(2.12, 238)
      focus.push(near(182, 50))
      break
    case "C/P8":
      actor.hp = 442
      hit(.39, 167); hit(1.48, 101)
      break
    case "UC/P1": case "UC/G1":
      place(boss, 54, -133)
      if (key === "UC/G1") actor.hp = 1098
      break
    case "UC/P2":
      place(boss, -21, -115); basic(5.36)
      break
    case "UC/P3": case "UC/G2":
      place(boss, 65, -53); dummy(-55, -61)
      if (squad) dummy(33, 86)
      focus.push(near(-101, -107), near(111, -103), near(59, 135))
      if (key === "UC/P3") { shove(1.29, 100); focus.push(near(109, 0)) }
      break
    case "UC/P4":
      place(boss, -48, -157); basic(5.36)
      break
    case "UC/P5":
      place(boss, 34, -103); basic(5.36); focus.push(near(67, -214))
      break
    case "UC/P6":
      place(ally, 106, 19); place(boss, -38, -101)
      support(.24, false)
      if (squad) orderAt = 1.28
      else basic(1.29)
      break
    case "UC/P7":
      actor.hp = 540
      hit(.46, 201)
      break
    case "UC/P8":
      place(ally, 129, -72); place(boss, 27, -72)
      queue(.24, () => issueEdgeOrder(battle, ally, "skill", boss)); basic(1.26)
      focus.push(near(-128, -100))
      break
    case "R/P1": case "R/G1":
      place(boss, -19, -147)
      focus.push(near(-74, -245), near(49, -239))
      break
    case "R/P2":
      place(boss, 23, -156); dummy(-24, -75)
      aim = near(0, -192)
      focus.push(near(-65, -265), near(45, -256))
      break
    case "R/P3":
      place(boss, -39, -154)
      hit(.12, 194); orderAt = .40
      break
    case "R/P4": case "R/G2":
      aim = near(0, -113); place(boss, 48, -173)
      if (key === "R/G2" || squad) dummy(-69, -128)
      basic(5.36)
      break
    case "R/P5":
      actor.hp = 534; shove(1.04, 110)
      focus.push(near(131, 0))
      break
    case "R/P6":
      actor.hp = 405; boss.hp = 1120; place(boss, 45, -96); basic(.42)
      break
    case "R/P7":
      place(boss, 31, -102)
      queue(.34, () => startBossCharge(battle, actor)); basic(.74)
      break
    case "R/P8":
      place(ally, 106, -17); support(.22, true); hit(1.24, 364)
      break
    case "E/P1": case "E/G1":
      place(boss, 45, -90)
      if (key === "E/G1") dummy(-128, -65)
      else if (squad) dummy(-70, -74)
      focus.push(near(-178, -105), near(103, -165))
      break
    case "E/P2":
      place(boss, 33, -174); aim = near(0, -231)
      walkFoe(1.13, near(28, -174)); basic(5.39)
      focus.push(near(68, -259))
      break
    case "E/P3": case "E/G2":
      aim = near(38, -186); place(boss, 26, -204)
      if (key === "E/G2") {
        const raider = dummy(-38, -51)
        if (squad) dummy(53, 24)
        hit(1.35, 73, actor, raider); hit(2.11, 118, actor, raider)
      }
      focus.push(near(58, -290))
      break
    case "E/P4":
      place(boss, 52, -178)
      focus.push(near(189, -192), near(-51, -217))
      break
    case "E/P5":
      shove(1.18, 100); focus.push(near(116, 0))
      break
    case "E/P6":
      place(boss, 59, -82); dummy(-72, -59); break
    case "E/P7":
      place(boss, 1, -217); walk(.24, actor, near(0, -110)); basic(1.51)
      break
    case "E/P8":
      place(boss, 87, -102); shove(.29, 105); basic(1.28)
      focus.push(near(111, 0))
      break
    case "L/P1": case "L/G1":
      aim = near(0, -157); place(boss, 30, -109)
      if (key === "L/G1") {
        place(ally, 68, 40)
        if (squad) place(spare, -69, -31)
      }
      focus.push(near(143, -110))
      break
    case "L/P2":
      aim = near(45, -145); place(boss, 66, -186)
      if (squad) dummy(-52, -168)
      focus.push(near(149, -298), near(-166, -197))
      break
    case "L/P3":
      place(boss, 32, -164); boss.shield = boss.shieldStart = 96; boss.shieldUntil = 8
      walkFoe(1.18, near(33, -123)); basic(5.36)
      focus.push(near(56, -256))
      break
    case "L/P4": case "L/G2":
      place(boss, 25, -158); aim = near(0, -280)
      if (squad) dummy(-24, -238)
      focus.push(near(105, -157))
      break
    case "L/P5":
      actor.hp = 592; place(boss, 45, -104); dummy(-84, -43)
      if (squad) dummy(73, 59)
      hit(.99, 240)
      break
    case "L/P6":
      rim(actor, -27, 64); rim(boss, 6, -41); rim(ally, 175, 103); rim(spare, -163, 194)
      focus.push({ x: boss.x + 54, y: 102 }); basic(.43)
      break
    case "L/P7":
      rim(actor, -28, -56); rim(boss, -67, 191); rim(ally, 161, 145); rim(spare, -172, 176)
      walk(.25, actor, { x: actor.x + 33, y: FIELD.top + 92 })
      focus.push({ x: actor.x - 32, y: 116 })
      break
    case "L/P8":
      actor.hp = 364; hit(.40, 173); hit(1.47, 129)
      break
    case "Radiant/P1": case "Radiant/G1":
      place(boss, 18, -98)
      if (key === "Radiant/G1") dummy(86, -183)
      if (squad) dummy(-95, -181)
      basic(5.36); focus.push(near(17, -285), near(147, -243), near(-140, -254))
      break
    case "Radiant/P2": case "Radiant/G2":
      aim = near(22, -179); place(boss, 6, -110); place(ally, 108, -158)
      if (squad) place(spare, -58, -149)
      break
    case "Radiant/P3":
      rim(actor, -50, 144); rim(boss, 24, -45); rim(ally, 158, 126); rim(spare, -165, 238)
      focus.push({ x: boss.x + 60, y: 72 })
      break
    case "Radiant/P4": case "Radiant/P7":
      place(boss, 45, -99)
      if (key === "Radiant/P7" || squad) dummy(-99, -68)
      focus.push(near(116, -233), near(-200, -144))
      break
    case "Radiant/P5":
      actor.hp = 419; hit(.44, 197)
      break
    case "Radiant/P6":
      place(boss, -21, -98); place(ally, 101, 19)
      support(.24, true); basic(1.32)
      focus.push(near(-43, -183))
      break
    case "Radiant/P8":
      place(ally, 70, -101); place(boss, 67, -216)
      hit(.61, 1400, ally)
      break
    case "Prismatic/P1": case "Prismatic/G1":
      place(boss, 136, -143); place(ally, 134, 62)
      if (key === "Prismatic/G1") dummy(239, -232)
      if (squad && key === "Prismatic/G1") dummy(118, -255)
      focus.push(near(283, -299), near(37, 18))
      break
    case "Prismatic/P2":
      aim = near(38, -215); place(boss, 45, -211)
      if (squad) dummy(51, -307)
      break
    case "Prismatic/P3":
      rim(actor, 0, 297); rim(boss, 8, 108); rim(ally, 124, 146); rim(spare, -164, 205)
      aim = { x: actor.x, y: FIELD.top + 84 }
      focus.push({ x: boss.x, y: 65 })
      break
    case "Prismatic/P4": case "Prismatic/G2":
      actor.hp = 1081; place(boss, 34, -112); place(ally, 119, -17)
      if (key === "Prismatic/P4") basic(5.36)
      break
    case "Prismatic/P5":
      actor.hp = 679; place(boss, -31, -93); if (squad) dummy(87, -32)
      hit(.79, 1150)
      break
    case "Prismatic/P6":
      place(boss, -43, -91); if (squad) dummy(76, -54)
      hit(.45, 412)
      break
    case "Prismatic/P7":
      actor.hp = 381; place(boss, 31, -103); basic(.43)
      break
    case "Prismatic/P8":
      place(boss, -43, -143); place(ally, 102, 18); ally.hp = 382
      if (spare) { place(spare, -108, 32); spare.hp = 310 }
      break
  }

  const picked = active?.aim.mode === "enemy" ? boss : undefined
  if (picked) aim = point(picked)
  if (active && (key !== "UC/P6" || squad)) queue(orderAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, aim))
  return { aim, picked, focus, duration: Math.ceil(duration * 10) / 10 }
}
