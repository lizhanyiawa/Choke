import type { Rarity } from "@/card/types"
import { issueEdgeOrder, moveEdgeFighter, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, inside, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const short = (id: string) => id.slice("paladin/".length)
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 0, 4, 1, -1, -1],
  UC: [0, 1, 2, 3, 4, -1, -1, -1],
  R: [0, 1, 2, 3, 4, -1, -1, 3],
  E: [0, 1, 2, 3, 4, -1, 2, -1],
  L: [0, 1, 2, 3, 4, 4, 4, -1],
  Radiant: [0, 1, 2, 3, 4, 1, 1, -1],
  Prismatic: [0, 1, 2, 3, 4, -1, -1, -1],
}
const solo = new Set(["C/P4", "C/P6", "C/P7", "UC/P3", "UC/P5", "R/P7", "E/P1"])
const twoPartners = new Set(["E/G1", "L/G1", "Radiant/P6", "Radiant/G1", "Prismatic/G1", "Prismatic/G2"])

export const paladinTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]
export const paladinTraitPartners = (id: string, squad: boolean) =>
  squad || twoPartners.has(short(id)) ? 2 : solo.has(short(id)) ? 0 : 1

export function arrangePaladinTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const key = short(id)
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const origin = { x: CENTER.x - 45, y: CENTER.y + 172 }
  const focus: EdgePoint[] = []
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  let aim = near(0, -175)
  const picked = active?.aim.mode === "enemy" ? boss : ["ally", "other"].includes(active?.aim.mode ?? "") ? ally ?? actor : undefined
  let duration = 3.15
  let orderAt = .22
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.18)
    at(time, play)
  }
  const walk = (time: number, unit: EdgeFighter, end: EdgePoint) => {
    focus.push(end)
    queue(time, () => moveEdgeFighter(battle, unit, end))
  }
  const hit = (time: number, raw: number, ...targets: EdgeUnit[]) => queue(time, () => {
    const cast = newCast(battle, boss, "enemy", targets[0], targets[0])
    for (const target of targets) damageUnit(battle, cast, target, raw)
  })
  const push = (time: number, target: EdgeUnit, length: number, axis: EdgePoint = { x: 1, y: 0 }) => queue(time, () =>
    shoveUnit(battle, newCast(battle, boss, "enemy", target, target), target, length, "", undefined, false, axis))
  const basic = (time: number, fighter: EdgeFighter = actor) => queue(time, () => issueEdgeOrder(battle, fighter, "basic", boss))
  const help = (time: number, shield: boolean) => queue(time, () => issueEdgeOrder(battle, ally, shield ? "skill2" : "skill", actor))
  const dummy = (x: number, y: number) => {
    const unit = { ...boss, ...near(x, y), id: "dummy-1" as const, once: new Set<string>() }
    battle.preview!.targets.push(unit)
  }

  for (const [i, member] of battle.team.entries()) {
    member.maxHp = 1100
    member.hp = i === 0 ? 609 : 523 - i * 37
  }
  boss.hp = boss.maxHp = 3200
  place(actor, 0, 0); place(boss, 32, -107); place(ally, 99, 30); place(spare, -150, 65)

  switch (key) {
    case "C/P1": case "C/G1":
      place(ally, -86, -39)
      focus.push(near(59, -169))
      break
    case "C/P2":
      place(ally, 132, -71)
      hit(1.16, 223, ally)
      break
    case "C/P3": case "C/G2":
      place(ally, -139, -76)
      break
    case "C/P4":
      place(boss, 7, -76)
      basic(5.36)
      break
    case "C/P5":
      place(ally, 23, -27)
      push(1.01, ally, 82); walk(1.48, ally, near(203, -21)); push(2.52, ally, 86)
      focus.push(near(291, -21))
      break
    case "C/P6":
      orderAt = 1.75
      break
    case "C/P7":
      walk(.27, actor, near(-110, -57))
      break
    case "C/P8":
      place(ally, 78, 2)
      hit(.49, 214, actor); walk(.91, ally, near(228, 63)); hit(2.09, 214, actor)
      break
    case "UC/P1": case "UC/G1":
      place(ally, 108, -34)
      place(spare, 147, -71)
      if (key === "UC/G1") basic(1.29, ally)
      else walk(1.25, ally, near(191, -104))
      break
    case "UC/P2":
      aim = near(0, -182); place(ally, -18, -80); place(boss, 23, -142)
      break
    case "UC/P3":
      boss.shield = boss.shieldStart = 22
      boss.shieldUntil = 6.5
      basic(5.37)
      break
    case "UC/P4":
      place(ally, -104, -60)
      push(1.14, ally, 102, { x: -1, y: 0 })
      focus.push(near(-211, -60))
      break
    case "UC/P5": case "UC/G2":
      place(boss, 36, -65); place(ally, 68, 24)
      if (squad) dummy(-57, -22)
      hit(1.05, 325, actor)
      focus.push(near(94, -135))
      break
    case "UC/P6":
      place(ally, -80, 13)
      push(.58, actor, 103); push(1.58, actor, 84)
      focus.push(near(185, 0))
      break
    case "UC/P7":
      place(ally, -147, 14)
      walk(.26, actor, near(-77, 29))
      break
    case "UC/P8":
      place(ally, 117, 59)
      help(.32, false)
      break
    case "R/P1": case "R/G1":
      place(boss, 32, -154); place(ally, 89, -66)
      if (key === "R/G1") hit(1.22, 218, ally, actor)
      break
    case "R/P2":
      place(boss, 6, -147); place(ally, -73, -101)
      basic(1.24, ally); basic(7.39, ally)
      break
    case "R/P3":
      place(ally, -149, -124)
      focus.push(near(-82, -77))
      break
    case "R/P4":
      aim = near(-22, -154); place(boss, 36, -173); place(ally, -67, -134)
      break
    case "R/P5": case "R/G2":
      place(ally, 122, -103); place(boss, 46, -149)
      hit(1.02, 258, ally)
      if (key === "R/G2") push(1.65, ally, 113)
      focus.push(near(226, -103))
      break
    case "R/P6":
      place(boss, 15, -88); place(ally, 86, 65)
      help(.27, false); basic(1.29)
      focus.push(near(26, -151))
      break
    case "R/P7":
      boss.range = 260
      place(boss, -21, -98)
      hit(.62, 210, actor)
      break
    case "R/P8":
      place(ally, 150, -37)
      walk(.23, actor, near(85, -12))
      aim = near(117, -36); orderAt = 1.28
      break
    case "E/P1": case "E/G1":
      aim = near(0, -119); place(boss, -56, -174); place(ally, 73, -123)
      if (key === "E/G1") place(spare, 144, -129)
      break
    case "E/P2": case "E/G2":
      place(boss, 28, -156); place(ally, -69, -175)
      dummy(87, -164)
      if (key === "E/P2") walk(1.28, ally, near(-220, -110))
      break
    case "E/P3":
      aim = near(0, -182); place(ally, -151, -160)
      walk(1.25, ally, near(-67, -157))
      break
    case "E/P4":
      place(boss, -31, -85); place(ally, 99, 24)
      focus.push(near(-64, -168))
      break
    case "E/P5":
      place(ally, 155, -114)
      help(.24, true); orderAt = 1.28
      break
    case "E/P6":
      place(boss, -29, -109); place(ally, 57, -142)
      basic(.36)
      break
    case "E/P7":
      aim = near(-22, -199); place(ally, -58, -169)
      push(.95, actor, 103); push(10.76, actor, 81)
      focus.push(near(187, 0))
      break
    case "E/P8":
      actor.hp = 442
      hit(.48, 172, actor); hit(1.51, 101, actor)
      break
    case "L/P1": case "L/G1":
      aim = near(0, -158); place(ally, -105, -120); place(spare, -198, -175)
      if (key === "L/G1") walk(1.23, spare, near(-160, -121))
      break
    case "L/P2":
      aim = near(19, -203); place(boss, 53, -235); place(ally, -58, -177)
      push(1.58, ally, 103, { x: -1, y: 0 })
      focus.push(near(-156, -177))
      break
    case "L/P3": case "L/G2":
      place(ally, 136, -81); place(boss, 39, -158)
      queue(1.09, () => {
        const cast = newCast(battle, boss, "enemy", ally, ally)
        damageUnit(battle, cast, ally, 412)
        shoveUnit(battle, cast, ally, 110, "", undefined, false, { x: 1, y: 0 })
      })
      if (key === "L/G2") push(2.05, ally, 90)
      focus.push(near(330, -81))
      break
    case "L/P4":
      aim = near(0, -245); place(boss, 24, -165); place(ally, -29, -93)
      break
    case "L/P5":
      ally.hp = ally.maxHp
      place(ally, -124, -48)
      break
    case "L/P6":
      actor.hp = actor.maxHp
      place(ally, 78, -40)
      hit(.99, 188, actor); walk(1.39, ally, near(204, -49)); hit(2.49, 188, actor)
      break
    case "L/P7":
      place(ally, -99, 12)
      walk(1.24, ally, near(-185, -49))
      break
    case "L/P8":
      place(boss, -14, -96); place(ally, -89, -141)
      basic(.44)
      focus.push(near(-28, -161))
      break
    case "Radiant/P1": case "Radiant/G1":
      aim = near(0, -303); place(boss, 22, -226); place(ally, -19, -130); place(spare, 72, -352)
      actor.hp = actor.maxHp
      break
    case "Radiant/P2": case "Radiant/P7":
      aim = near(18, -215); place(boss, 62, -249); place(ally, -61, -182)
      if (key === "Radiant/P7") {
        ally.hp = 320
        walk(1.28, ally, near(-152, -125))
      }
      break
    case "Radiant/P3":
      place(ally, 139, -122); place(boss, 15, -192)
      push(1.18, ally, 87, { x: -1, y: 0 }); push(1.77, actor, 98)
      focus.push(near(228, -122))
      break
    case "Radiant/P4":
      place(boss, 40, -213); place(ally, 103, -62)
      hit(1.17, 164, actor)
      break
    case "Radiant/P5": case "Radiant/G2":
      place(ally, 137, -121); place(boss, 12, -231)
      hit(1.21, 210, ally)
      break
    case "Radiant/P6":
      aim = near(0, -70); place(ally, 78, -52); place(spare, -79, -46)
      hit(1.03, 206, actor); walk(1.41, spare, near(-221, -72)); hit(2.63, 206, actor)
      break
    case "Radiant/P8":
      actor.y = FIELD.bottom - 66
      Object.assign(ally, { x: actor.x - 48, y: FIELD.bottom + 73 })
      place(boss, -45, 84)
      walk(.25, ally, { x: actor.x - 71, y: FIELD.bottom - 40 })
      break
    case "Prismatic/P1": case "Prismatic/G1":
      place(ally, 136, -35); place(spare, 216, -103); place(boss, 47, -267)
      hit(1.08, 268, ally)
      break
    case "Prismatic/P2":
      aim = near(0, -538); place(boss, 28, -311); place(ally, -23, -174)
      if (squad) place(spare, 22, -407)
      break
    case "Prismatic/P3":
      aim = near(18, -229); place(ally, 77, -178)
      push(1.33, ally, 106)
      focus.push(near(177, -178))
      break
    case "Prismatic/P4":
      place(ally, 112, -132); place(boss, 93, -176)
      break
    case "Prismatic/P5": case "Prismatic/G2":
      place(actor, 56, 114); place(boss, -3, -139); place(ally, -147, -26); place(spare, -75, -83)
      if (key === "Prismatic/G2") {
        place(actor, 140, 135); place(boss, 48, -136); place(ally, -160, 48); place(spare, -56, -44)
        queue(1.31, () => issueEdgeOrder(battle, ally, "skill", boss))
        hit(2.68, 193, spare); hit(5.36, 193, spare)
      } else basic(1.31, ally)
      break
    case "Prismatic/P6":
      place(ally, 83, -72)
      hit(.52, 191, actor); hit(1.14, 206, ally, actor)
      break
    case "Prismatic/P7":
      actor.y = FIELD.bottom - 114
      Object.assign(ally, { x: actor.x + 48, y: FIELD.bottom - 18 })
      push(.48, ally, 102, { x: 0, y: 1 })
      focus.push({ x: ally.x, y: FIELD.bottom + 238 })
      break
    case "Prismatic/P8":
      place(boss, 12, -82); place(ally, -117, -48)
      hit(.56, 1910, ally); basic(1.39); basic(6.55); basic(11.73)
      break
  }

  if (picked) aim = point(picked)
  if (active) queue(orderAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, aim))
  return { aim, picked, duration: Math.ceil(duration * 100) / 100, focus }
}
