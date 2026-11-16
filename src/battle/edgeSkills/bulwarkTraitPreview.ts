import {
  issueEdgeOrder, moveEdgeFighter, moveLanding, type EdgeBattle, type EdgeFighter, type EdgeUnit,
} from "../edgeBattle"
import type { SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, along, direction, edgeDistance, inside, point, type EdgePoint } from "./geometry"
import { basicAttack, beforeBossBasic, bossTarget, damageUnit, newCast, shoveUnit, startMovement } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const east = { x: 1, y: 0 }
const north = { x: 0, y: -1 }
const slots: Record<Rarity, readonly number[]> = {
  C: [0, -1, -1, 3, -1, -1, -1, -1],
  UC: [0, 1, 2, 3, 2, 4, -1, 2],
  R: [0, 1, 2, 3, 4, -1, 2, -1],
  E: [0, 1, 2, 3, 4, -1, -1, 0],
  L: [0, 1, 2, 3, 4, 0, -1, -1],
  Radiant: [0, 1, -1, 3, 4, -1, -1, 2],
  Prismatic: [0, 1, 2, 3, 4, -1, -1, -1],
}

const needPartner = new Set([
  "C/P3", "C/G2", "UC/P3", "UC/P5", "UC/P8", "UC/G1", "UC/G2",
  "R/P2", "R/P3", "R/P4", "R/P8", "R/G1", "R/G2", "E/P1", "E/P2", "E/P4", "E/P7", "E/P8", "E/G1", "E/G2",
  "L/P1", "L/P2", "L/P3", "L/P4", "L/P5", "L/P6", "L/P8", "L/G1", "L/G2",
  "Radiant/P1", "Radiant/P2", "Radiant/P3", "Radiant/P4", "Radiant/P5", "Radiant/P7", "Radiant/G1", "Radiant/G2",
  "Prismatic/P1", "Prismatic/P3", "Prismatic/P4", "Prismatic/P5", "Prismatic/P7", "Prismatic/G1", "Prismatic/G2",
])

const short = (id: string) => id.slice("bulwark/".length)
export const bulwarkPassiveSlot = (rarity: Rarity, index: number) => slots[rarity][index]
export function bulwarkTraitPartners(id: string): SubJobId[] {
  const key = short(id)
  if (key === "E/P6" || key === "Prismatic/P8") return ["warden", "healer"]
  if (key === "C/P5") return ["healer"]
  return needPartner.has(key) ? ["warden"] : []
}

export function arrangeBulwarkTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, at: Schedule) {
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const key = short(id)
  const focus: EdgePoint[] = []
  const origin = { x: CENTER.x - 65, y: CENTER.y + 163 }
  const near = (dx: number, dy: number) => inside({ x: origin.x + dx, y: origin.y + dy })
  const place = (unit: EdgeUnit | undefined, dx: number, dy: number) => { if (unit) Object.assign(unit, near(dx, dy)) }
  const edge = (unit: EdgeUnit, dx: number, gap: number) => Object.assign(unit, { x: origin.x + dx, y: FIELD.top + gap })
  const dummy = (dx: number, dy: number) => {
    const target = { ...boss, ...near(dx, dy), id: "dummy-1" as const, once: new Set<string>() }
    battle.preview!.targets.push(target)
    return target
  }
  let duration = 3.1
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + .95)
    at(time, play)
  }
  const hit = (time: number, target: EdgeUnit, amount: number, source: EdgeUnit = boss, order: "enemy" | "basic" = "enemy") =>
    queue(time, () => damageUnit(battle, newCast(battle, source, order, target, target), target, amount))
  const shove = (time: number, target: EdgeUnit, length = 100, axis = east) => queue(time, () =>
    shoveUnit(battle, newCast(battle, boss, "enemy", target, target), target, length, "", undefined, false, axis))
  const walk = (time: number, unit: EdgeFighter, landing: EdgePoint) => queue(time, () => moveEdgeFighter(battle, unit, landing))
  const q = (time: number, unit = actor, target: EdgeUnit = boss) => queue(time, () => issueEdgeOrder(battle, unit, "basic", target))
  const close = (time: number) => queue(time, () => {
    const gap = edgeDistance(actor, boss)
    if (gap > 105) moveEdgeFighter(battle, actor, inside(along(actor, direction(actor, boss), gap - 101)))
  })
  const moveEnemy = (time: number, wanted: EdgePoint) => queue(time, () => {
    const landing = moveLanding(boss, wanted, battle)
    if (landing && !startMovement(battle, boss, landing, false, wanted)) boss.move = landing
  })
  const provoke = () => {
    place(boss, -7, -106)
    place(ally, 82, -116)
    queue(1.12, () => {
      const target = bossTarget(battle, true)
      if (target) basicAttack(battle, boss, target, true, beforeBossBasic(battle, target))
    })
  }
  const entry = () => {
    place(ally, 177, -173)
    place(spare, -154, 42)
    walk(1.18, ally, near(76, -173))
  }
  const sea = () => {
    place(boss, 99, -205)
    place(ally, 104, -76)
    hit(1.43, ally, 520)
  }

  for (const [i, unit] of battle.team.entries()) {
    unit.maxHp = 1100
    unit.hp = i ? 650 - 34 * i : 740
  }
  boss.hp = boss.maxHp = 1900
  place(actor, 0, 0)
  place(ally, 133, -22)
  place(spare, -146, 42)
  place(boss, -12, -155)
  let aim = near(18, -174)

  switch (key) {
    case "C/P1": case "C/G1":
      place(boss, -78, -52)
      if (key.endsWith("G1")) dummy(77, -49)
      hit(1.14, actor, 310)
      break
    case "C/P2": shove(1.02, actor); break
    case "C/P3":
      place(ally, 83, -33)
      hit(.86, actor, 200)
      walk(1.44, ally, near(186, -49))
      hit(2.61, actor, 200)
      break
    case "C/P4": place(boss, 29, -103); break
    case "C/P5": {
      const healer = spare ?? ally
      place(healer, 103, -46)
      queue(.76, () => issueEdgeOrder(battle, healer, spare ? "skill2" : "skill", actor))
      break
    }
    case "C/P6":
      hit(1.69, actor, 200)
      hit(2.48, actor, 200)
      break
    case "C/P7":
      boss.range = 260
      place(boss, 37, -226)
      hit(1.08, actor, 175)
      break
    case "C/P8":
      hit(.98, actor, 410)
      hit(2.03, actor, 160)
      break
    case "C/G2":
      place(ally, 89, -14)
      place(boss, 159, -127)
      hit(1.17, ally, 220)
      break
    case "UC/P1":
      hit(.98, actor, 190)
      hit(5.11, actor, 160)
      break
    case "UC/P2": aim = near(59, -62); break
    case "UC/P3": case "UC/G2": hit(1.16, ally, 240); break
    case "UC/P4":
      aim = near(0, -148)
      place(boss, 8, -119)
      close(1.68)
      q(7.86)
      break
    case "UC/P5":
      place(ally, 88, -12)
      place(boss, -104, -160)
      shove(1.08, ally, 100, north)
      shove(2.02, actor, 100, north)
      break
    case "UC/P6": actor.hp = actor.maxHp - 105; break
    case "UC/P7":
      walk(.44, actor, near(-84, -53))
      shove(1.51, actor)
      break
    case "UC/P8":
      place(boss, -89, -110)
      hit(.95, actor, 82)
      q(7.87)
      break
    case "UC/G1":
      place(ally, 108, -31)
      shove(.99, actor, 100, north)
      shove(2.14, ally, 100, north)
      break
    case "R/P1": case "R/G1":
      place(boss, 1, -124)
      if (key.endsWith("G1")) {
        place(ally, 102, 12)
        hit(1.89, actor, 110, dummy(-116, -76))
      }
      hit(.92, actor, 115)
      break
    case "R/P2":
      aim = near(11, -164)
      place(boss, 165, -177)
      place(ally, 105, -73)
      moveEnemy(.69, near(53, -165))
      q(2.07, ally)
      break
    case "R/P3":
      place(boss, -81, -68)
      place(ally, 87, -42)
      hit(1.01, actor, 335)
      break
    case "R/P4": case "R/G2":
      edge(actor, -44, 153)
      edge(ally, 64, 64)
      edge(boss, 116, 188)
      if (spare) edge(spare, -162, 151)
      shove(1.11, ally, 100)
      if (key.endsWith("G2")) hit(1.93, ally, 190)
      break
    case "R/P5":
      place(boss, 42, -88)
      moveEnemy(1.18, near(215, -254))
      break
    case "R/P6":
      place(boss, -32, -99)
      hit(1.02, actor, 145)
      break
    case "R/P7":
      hit(.91, actor, 72)
      hit(1.76, actor, 107)
      break
    case "R/P8":
      place(ally, 96, -37)
      shove(1.16, actor, 100, north)
      break
    case "E/P1": case "E/G1": provoke(); break
    case "E/P2": case "E/G2":
      entry()
      if (key.endsWith("G2")) shove(2.20, ally, 100, north)
      break
    case "E/P3": place(boss, 11, -173); break
    case "E/P4": actor.shield = 300; actor.shieldUntil = 7; break
    case "E/P5": {
      place(boss, -51, -45)
      const vector = direction(boss, actor)
      battle.telegraph = { from: point(boss), to: along(boss, vector, 230), direction: vector, until: 1.36 }
      break
    }
    case "E/P6":
      place(ally, 104, -29)
      place(spare, -96, 37)
      hit(1.02, actor, 200)
      walk(1.61, ally, near(204, -57))
      hit(2.53, actor, 200)
      break
    case "E/P7":
      place(ally, 110, -28)
      ally.hp = 540
      hit(1.07, ally, 185)
      break
    case "E/P8":
      provoke()
      close(1.99)
      q(7.86)
      break
    case "L/P1": case "L/G1":
      place(boss, 5, -101)
      place(ally, 148, -49)
      if (key.endsWith("G1")) dummy(-80, -100)
      hit(1.13, ally, 280)
      q(7.88)
      break
    case "L/P2":
      place(ally, 149, -36)
      shove(1.03, actor, 100, north)
      hit(2.03, ally, 365)
      shove(2.51, actor, 100, north)
      break
    case "L/P3":
      place(ally, 126, -37)
      actor.shield = 280
      actor.shieldUntil = 7
      break
    case "L/P4": case "L/G2":
      place(boss, -76, -188)
      place(ally, 91, -123)
      hit(1.18, ally, 228)
      break
    case "L/P5":
      edge(actor, 0, 182)
      edge(boss, 19, 42)
      edge(ally, -87, 116)
      if (spare) edge(spare, 135, 204)
      focus.push({ x: boss.x + 34, y: 56 })
      aim = point(boss)
      break
    case "L/P6":
      place(ally, 169, -37)
      actor.hp = 1010
      hit(1.03, ally, 500)
      break
    case "L/P7":
      hit(.94, actor, 130)
      hit(1.83, actor, 170)
      break
    case "L/P8": hit(1.08, ally, 3000); break
    case "Radiant/P1": case "Radiant/G1":
      place(ally, 108, -59)
      place(boss, 121, -191)
      hit(.86, ally, 215)
      if (key.endsWith("G1")) {
        walk(1.17, actor, near(-87, 108))
        hit(2.25, ally, 215)
        duration = 4.30
      }
      break
    case "Radiant/P2":
      place(ally, 155, -111)
      walk(1.16, ally, near(81, -37))
      break
    case "Radiant/P3":
      place(ally, 99, -29)
      hit(.85, actor, 170, boss, "basic")
      hit(1.72, actor, 170)
      break
    case "Radiant/P4":
      place(boss, 61, -205)
      place(ally, -96, -64)
      aim = near(44, -194)
      break
    case "Radiant/P5": case "Radiant/G2":
      edge(actor, -43, 81)
      edge(ally, 45, -57)
      edge(boss, 168, 77)
      if (spare) edge(spare, -147, 134)
      if (key.endsWith("G2")) {
        edge(actor, -45, 39)
        walk(1.17, ally, { x: ally.x, y: FIELD.top + 78 })
        duration = 3.35
      }
      break
    case "Radiant/P6":
      edge(actor, -32, -67)
      edge(boss, 126, 103)
      walk(.49, actor, { x: actor.x + 21, y: FIELD.top + 62 })
      break
    case "Radiant/P7":
      place(ally, 112, 2)
      place(boss, 16, -103)
      q(.97)
      break
    case "Radiant/P8": shove(1.12, actor, 100, north); break
    case "Prismatic/P1": case "Prismatic/G1":
      place(ally, 114, -154)
      place(boss, 65, -218)
      if (key.endsWith("G1")) dummy(167, -96)
      hit(.97, ally, 295)
      break
    case "Prismatic/P2":
      aim = near(0, -94)
      hit(.91, actor, 160)
      walk(1.19, actor, near(-176, 21))
      hit(2.56, actor, 170)
      break
    case "Prismatic/P3": sea(); break
    case "Prismatic/P4": case "Prismatic/G2":
      place(ally, 196, -362)
      place(boss, 125, -474)
      hit(1.18, ally, 340)
      if (key.endsWith("G2")) {
        shove(1.99, ally, 100)
        shove(2.43, actor, 100, north)
        duration = 4.55
      }
      break
    case "Prismatic/P5":
      actor.shield = 530
      actor.shieldUntil = 8
      place(ally, 119, -97)
      place(spare, -105, -162)
      place(boss, 21, -259)
      aim = near(8, -173)
      break
    case "Prismatic/P6":
      edge(actor, 25, 74)
      edge(boss, 91, 173)
      if (ally) edge(ally, 144, 62)
      if (spare) edge(spare, -130, 164)
      focus.push(along(actor, north, 204))
      shove(1.02, actor, 100, north)
      break
    case "Prismatic/P7":
      place(ally, 86, -27)
      queue(1.16, () => {
        const incoming = newCast(battle, boss, "enemy", actor)
        damageUnit(battle, incoming, actor, 165)
        damageUnit(battle, incoming, ally, 165)
      })
      break
    case "Prismatic/P8":
      place(ally, 124, -36)
      place(spare, -132, -49)
      ally.hp = spare.hp = 545
      hit(1.07, ally, 240)
      hit(1.79, spare, 245)
      break
  }

  const mode = active?.aim.mode
  const picked = mode === "enemy" ? boss : mode === "ally" || mode === "other" ? ally : mode === "self" ? actor : undefined
  if (picked) aim = point(picked)
  if (active) at(.20, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, aim))
  return { aim, picked, duration: Math.ceil(duration * 10) / 10, focus }
}
