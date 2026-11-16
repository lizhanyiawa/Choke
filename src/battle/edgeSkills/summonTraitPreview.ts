import { issueEdgeOrder, moveEdgeFighter, moveLanding, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { Rarity } from "@/card/types"
import { FIELD, along, direction, edgeDistance, inside, rotate, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit, startMovement } from "./runtime"
import { isFighter, unitOf, type SkillCast } from "./state"
import { summonSpawns } from "./summons"

type Schedule = (time: number, play: () => void) => void
const up = { x: 0, y: -1 }
const side = { x: 1, y: 0 }
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, 0, 0, 0],
  UC: [0, 1, 2, 3, 4, 0, 4, 4],
  R: [0, 1, 2, 3, 4, 2, 0, 0],
  E: [0, 1, 2, 3, 4, 4, 0, 4],
  L: [0, 1, 2, 3, 4, 1, 0, 4],
  Radiant: [0, 1, 2, 3, 4, 2, 0, 0],
  Prismatic: [0, 1, 2, 3, 4, 1, 4, 0],
}
const shortId = (id: string) => id.slice("summoner/".length)

export const summonPassiveSlot = (rarity: Rarity, index: number) => slots[rarity][index]
const withPartner = new Set([
  "C/P3", "UC/P1", "UC/P2", "UC/P4", "UC/P6", "R/P2", "R/P3", "R/P4", "R/P5", "R/P8",
  "E/P1", "E/P2", "E/P4", "L/P1", "L/P3", "L/P4", "L/P5", "L/P7", "L/P8",
  "Radiant/P3", "Radiant/P4", "Radiant/P5", "Radiant/P6", "Radiant/P8",
  "Prismatic/P1", "Prismatic/P3", "Prismatic/P4", "Prismatic/P5", "Prismatic/P7", "Prismatic/P8",
])
export const summonPassivePartner = (id: string) => withPartner.has(shortId(id))

export function summonTraitCaster(id: string | undefined, origin: EdgePoint, aim: EdgePoint) {
  if (!id) return origin
  switch (shortId(id)) {
    case "C/P6": return inside(along(aim, up, -93))
    case "UC/P7": return { x: aim.x, y: FIELD.top + 62 }
    case "UC/P8": return inside(along(aim, up, -81))
    case "R/P6": return inside(along(aim, up, -92))
    case "E/P8": return inside(along(aim, up, -181))
    case "Radiant/P6": return inside(along(aim, up, -99))
    case "Radiant/P7": return inside(along(aim, up, -352))
    case "Prismatic/P6": return inside(along(aim, up, -338))
    default: return origin
  }
}

export function stageSummonTrait(battle: EdgeBattle, actor: EdgeFighter, cast: SkillCast, id: string) {
  const { aim } = cast
  const { boss } = battle
  const [, ally, spare] = battle.team
  const where = (x: number, y: number) => inside({ x: aim.x + x, y: aim.y + y })
  switch (shortId(id)) {
    case "UC/P7":
      Object.assign(boss, { x: actor.x + 87, y: actor.y + 59 })
      break
    case "UC/P2":
      if (spare) Object.assign(spare, inside({ x: actor.x - 113, y: actor.y + 48 }))
      break
    case "R/P2": Object.assign(ally, where(-62, 155)); break
    case "R/P3": Object.assign(ally, where(62, 47)); break
    case "E/P1": Object.assign(ally, where(67, 52)); break
    case "Radiant/P7":
      Object.assign(boss, along(inside(aim, 119), rotate(direction(actor, aim), 334), 105))
      break
    case "Radiant/G1": {
      const outward = direction(inside(aim, 119), boss)
      battle.preview!.targets.push({ ...boss, ...inside(along(boss, outward, 67)), id: "dummy-6", once: new Set() })
      break
    }
    case "Radiant/G2": Object.assign(spare, inside({ x: ally.x + 71, y: ally.y + 62 })); break
    case "Prismatic/P6": boss.range = 250; break
    case "Prismatic/P7":
      Object.assign(boss, { x: aim.x + 21, y: FIELD.top + 51 })
      break
    case "C/G1":
      // The second target stays behind the nearer one until the actual first shot lands.
      battle.preview!.targets.push({ ...boss, x: boss.x + 102, y: boss.y - 21, id: "dummy-6", once: new Set() })
      break
    case "E/G1": {
      const [, other] = summonSpawns("twinBows", actor, aim)
      battle.preview!.targets.push({ ...boss, ...inside({ x: other.x - 8, y: other.y + 44 }), id: "dummy-6", once: new Set() })
      break
    }
    case "Prismatic/G1": {
      const [, shield, ram] = summonSpawns("ensemble", actor, aim)
      Object.assign(ally, inside({ x: shield.x + 70, y: shield.y + 29 }))
      Object.assign(spare, inside(along(ram, rotate(direction(shield, ram), -60), 88)))
      Object.assign(boss, where(31, -27))
      break
    }
  }
}

export function queueSummonTrait(battle: EdgeBattle, actor: EdgeFighter, cast: SkillCast, id: string, at: Schedule) {
  const { boss } = battle
  const ally = battle.team[1]
  const { aim } = cast
  let end = 2.9
  const time = (moment: number, play: () => void) => {
    end = Math.max(end, moment + 1.25)
    at(moment, play)
  }
  const incoming = (moment: number, amount: number, target: EdgeUnit = actor) => time(moment, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", target, target), target, amount))
  const push = (moment: number, distance: number, target = actor, axis = side) => time(moment, () =>
    shoveUnit(battle, newCast(battle, boss, "enemy", target, target), target, distance, "", undefined, false, axis))
  const q = (moment: number, source = actor) => time(moment, () => issueEdgeOrder(battle, source, "basic", boss))
  const close = (moment: number, distance: number) => time(moment, () => {
    if (edgeDistance(actor, boss) > actor.range - 15)
      moveEdgeFighter(battle, actor, inside(along(actor, direction(actor, boss), distance)))
  })
  const openGap = (moment: number, distance: number) => time(moment, () => {
    const wanted = inside(along(actor, direction(actor, boss), distance))
    const landing = moveLanding(boss, wanted, battle)
    if (landing && !startMovement(battle, boss, landing, false, wanted)) boss.move = landing
  })
  const allyDown = (moment: number) => incoming(moment, ally.maxHp * 3, ally)
  const destroy = (moment: number, slot = 0) => time(moment, () => {
    const body = cast.summon?.deployment.bodies[slot]
    if (body?.hp) damageUnit(battle, newCast(battle, boss, "enemy", body, body), body, body.maxHp * 2)
  })

  switch (shortId(id)) {
    case "C/P1": close(1.92, 110); q(5.9); break
    case "C/P3": push(2.74, 100, ally); break
    case "C/P6":
      incoming(1.43, 100)
      destroy(2.63)
      incoming(3.08, 100)
      break
    case "C/P7": close(1.92, 110); q(5.9); break
    case "C/P8": close(1.85, 54); q(10.82); break
    case "UC/P2":
      time(1.63, () => {
        const buff = battle.runtime.buffs.find((item) => item.cast.signature?.id === id && item.kind === "extend")
        const holder = unitOf(battle, buff?.target)
        if (holder && isFighter(holder)) moveEdgeFighter(battle, holder, inside(along(holder, side, 222)))
      })
      break
    case "UC/P5": close(1.46, 130); q(5.86); break
    case "UC/P6": push(1.49, 100); break
    case "UC/P7": incoming(1.14, 100); break
    case "UC/P8":
      time(.62, () => moveEdgeFighter(battle, actor, inside(along(actor, side, 139))))
      openGap(2.78, 278)
      q(5.91)
      break
    case "R/P2": q(2.53, ally); break
    case "R/P6":
      push(1.57, 100, actor, up)
      destroy(2.47)
      push(3.24, 100)
      break
    case "R/P7": close(1.59, 183); q(5.91); break
    case "R/P8": allyDown(.10); break
    case "E/P1": q(4.76, ally); break
    case "E/P5": push(1.61, 100); break
    case "E/P6": close(1.81, 120); q(5.92); break
    case "E/P7":
      incoming(1.51, 100)
      time(2.27, () => moveEdgeFighter(battle, actor, inside(along(actor, direction(actor, aim), 171))))
      incoming(3.61, 100)
      break
    case "E/P8":
      time(1.21, () => moveEdgeFighter(battle, actor, inside(along(aim, up, -67))))
      break
    case "L/P6": push(.63, 100); break
    case "L/P7": close(2.14, 167); q(5.94); break
    case "L/P8": destroy(1.09); break
    case "Radiant/P3": close(2.89, 155); q(5.94); break
    case "Radiant/P6":
      incoming(1.18, 100)
      time(1.75, () => moveEdgeFighter(battle, actor, inside(along(actor, side, -190))))
      incoming(3.39, 100)
      break
    case "Radiant/P8": allyDown(.10); break
    case "Prismatic/P4":
      time(1.28, () => moveEdgeFighter(battle, ally, inside(along(aim, side, 202))))
      push(2.74, 100, ally)
      break
    case "Prismatic/P5": push(2.43, 100, ally); break
    case "Prismatic/P6": incoming(2.35, 100); break
    case "Prismatic/P8": allyDown(1.26); break
    case "UC/G2": push(2.52, 100, ally); break
    case "R/G2": push(2.58, 100, ally); break
    case "L/G2":
      time(1.69, () => moveEdgeFighter(battle, ally, inside(along(aim, side, 190))))
      push(2.91, 100, ally)
      break
    case "Prismatic/G1": {
      const [, shield, ram] = summonSpawns("ensemble", actor, aim)
      const landing = inside(along(ram, rotate(direction(shield, ram), 60), 88))
      time(1.85, () => moveEdgeFighter(battle, actor, landing))
      break
    }
  }
  if (shortId(id) === "Prismatic/G2") {
    const receiver = battle.team[2]
    if (receiver && edgeDistance(receiver, ally) > 102) Object.assign(receiver, inside({ x: ally.x + 58, y: ally.y + 60 }))
  }
  return end
}
