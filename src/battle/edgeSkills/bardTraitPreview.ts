import type { SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { issueEdgeOrder, moveEdgeFighter, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import { bardPreviewPartners, arrangeBardPreview } from "./bardPreview"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, inside, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit } from "./runtime"
import { createUnit } from "./state"

const activeSlots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, -1, -1, -1],
  UC: [0, 1, 2, 3, 4, -1, -1, 0],
  R: [0, 1, 2, 3, 4, 3, -1, -1],
  E: [0, 1, 2, 3, 4, 0, -1, -1],
  L: [0, 1, 2, 3, 4, -1, -1, 4],
  Radiant: [0, 1, 2, 3, 4, 0, -1, -1],
  Prismatic: [0, 1, 2, 3, 4, 0, -1, 0],
}

export const bardPassiveSlot = (rarity: Rarity, index: number) => activeSlots[rarity][index] ?? -1

const twoPartners = new Set([
  "bard/C/G1", "bard/UC/G2", "bard/L/P6", "bard/L/P7", "bard/L/P8", "bard/Radiant/P8", "bard/Prismatic/P7",
])
const onePartner = new Set([
  "bard/C/P6", "bard/C/P8", "bard/R/P8", "bard/E/P7", "bard/E/P8", "bard/L/P4", "bard/Radiant/P7",
])

export function bardTraitLineup(id: string, active: EdgeActive | undefined, squad: boolean): SubJobId[] {
  const partners = active ? bardPreviewPartners(active, squad) : []
  const required = squad ? 3 : twoPartners.has(id) ? 2 : onePartner.has(id) ? 1 : 0
  const defaults: SubJobId[] = ["ranger", "healer", "warden"]
  while (partners.length < required) partners.push(defaults[partners.length])
  return partners
}

type Schedule = (time: number, play: () => void) => void

export function arrangeBardTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const beats: { time: number; play: () => void }[] = []
  const review = active && arrangeBardPreview(battle, active, squad, (time, play) => beats.push({ time, play }))
  const [actor, ally, other, reserve] = battle.team
  const boss = battle.boss
  const near = (x: number, y: number) => inside({ x: CENTER.x + x, y: CENTER.y + 214 + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const focus = review?.focus ?? []
  let duration = review?.duration ?? 4.4
  const schedule: Schedule = (time, play) => {
    duration = Math.max(duration, time + 1.65)
    at(time, play)
  }
  const attack = (time: number, unit: EdgeFighter) =>
    schedule(time, () => issueEdgeOrder(battle, unit, "basic", boss))
  const hurt = (time: number, unit: EdgeUnit, raw: number) =>
    schedule(time, () => damageUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, raw))
  const push = (unit: EdgeUnit) => shoveUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, 88)
  const knock = (time: number, unit: EdgeUnit) => schedule(time, () => push(unit))
  const walk = (time: number, unit: EdgeFighter, destination: EdgePoint) => {
    focus.push(destination)
    schedule(time, () => moveEdgeFighter(battle, unit, destination))
  }
  const dummy = (x: number, y: number) => {
    const targets = battle.preview!.targets
    const target = createUnit(`dummy-${targets.length + 1}`, { x, y }, 4200, 95, .12, 150, 155, 7)
    targets.push(target)
    return target
  }

  if (!review) {
    for (const [index, unit] of battle.team.entries()) {
      unit.maxHp = 1100
      unit.hp = [670, 510, 570, 650][index]
    }
    boss.hp = boss.maxHp = 5000
    place(actor, 0, 0)
    place(ally, -91, -39)
    place(other, 80, -61)
    place(reserve, 186, -105)
    place(boss, -12, -Math.min(actor.range - 35, 168))
  }
  switch (id) {
    case "bard/C/P4":
      place(boss, -33, -Math.min(actor.range - 24, 164))
      attack(6.64, actor)
      break
    case "bard/C/P6":
      hurt(1.08, actor, 318)
      break
    case "bard/C/P7":
      walk(.53, actor, near(103, -60))
      break
    case "bard/C/P8":
    case "bard/R/P8":
    case "bard/Radiant/P8":
    case "bard/Prismatic/P7":
      hurt(.82, ally, 5600)
      if (id === "bard/C/P8") attack(2.12, actor)
      break
    case "bard/C/G1":
      place(other, -54, -151)
      break
    case "bard/C/G2":
      dummy(ally.x + 73, ally.y - 8)
      break
    case "bard/UC/P4":
      knock(2.73, ally)
      break
    case "bard/UC/P6":
      actor.hp = 421
      hurt(1.08, actor, 220)
      break
    case "bard/UC/P7":
    case "bard/E/P7": {
      const end = near(-96, -56)
      const added = id === "bard/UC/P7" ? 18 : 25
      if (ally) Object.assign(ally, { x: end.x - 65, y: end.y - 25 })
      Object.assign(boss, { x: end.x, y: end.y - actor.range - added })
      walk(.53, actor, end)
      attack(2.38, actor)
      break
    }
    case "bard/UC/P8":
      place(ally, -91, -31)
      knock(.99, actor)
      break
    case "bard/UC/G2":
      place(other, -170, -82)
      break
    case "bard/R/P6":
      place(ally, -54, -79)
      break
    case "bard/R/P7":
      walk(.53, actor, near(32, -82))
      attack(2.34, actor)
      break
    case "bard/R/G1":
      battle.preview!.targets.length = 0
      break
    case "bard/R/G2":
      place(actor, -194, -22)
      break
    case "bard/E/P3":
      knock(2.78, ally)
      break
    case "bard/E/P6":
      place(actor, -38, -72)
      hurt(1.16, actor, 338)
      break
    case "bard/E/P8":
    case "bard/Radiant/P7": {
      const returning = id === "bard/E/P8" ? actor : ally
      const partner = returning === actor ? ally : actor
      Object.assign(returning, { x: FIELD.left - 60, y: CENTER.y + 62 })
      Object.assign(partner, { x: FIELD.left + 69, y: CENTER.y + 104 })
      Object.assign(boss, { x: FIELD.left + 158, y: CENTER.y - 40 })
      walk(.68, returning, { x: FIELD.left + 67, y: returning.y })
      if (returning === ally) attack(2.83, ally)
      break
    }
    case "bard/E/G1":
      dummy(boss.x + 43, boss.y + 26)
      break
    case "bard/E/G2":
      hurt(2.43, actor, 236)
      break
    case "bard/L/P4":
      attack(2.64, ally)
      break
    case "bard/L/P6":
      knock(1.06, actor)
      break
    case "bard/L/P7":
      attack(.47, ally)
      attack(1.59, other)
      attack(2.78, actor)
      break
    case "bard/L/P8":
      hurt(.95, other, 5600)
      break
    case "bard/L/G1":
      place(other, -40, -173)
      break
    case "bard/L/G2":
      Object.assign(ally, { x: FIELD.left + 70, y: CENTER.y + 3 })
      Object.assign(boss, { x: FIELD.left - 46, y: CENTER.y - 88 })
      break
    case "bard/Radiant/P3":
      knock(3.41, ally)
      break
    case "bard/Radiant/P6":
      place(ally, -65, -89)
      hurt(1.09, actor, 284)
      break
    case "bard/Radiant/G1":
      place(actor, 24, -59)
      place(reserve, 76, -180)
      break
    case "bard/Radiant/G2":
      dummy(boss.x + 53, boss.y + 18)
      break
    case "bard/Prismatic/P6":
      place(ally, -72, -73)
      knock(1.19, actor)
      break
    case "bard/Prismatic/P3":
      schedule(1.94, () => {
        const first = [...battle.runtime.shieldCasts.values()].find(cast => cast.skill === active)?.firstWard
        const warded = battle.team.find(unit => unit.id === first)
        if (warded) push(warded)
      })
      break
    case "bard/Prismatic/P8":
      place(ally, -331, -155)
      place(boss, -305, -289)
      break
    case "bard/Prismatic/G1":
      place(other, -8, -162)
      break
    case "bard/Prismatic/G2":
      walk(3.36, other, { x: FIELD.left + 24, y: ally.y + 88 })
      duration = Math.max(duration, 6.05)
      break
  }
  for (const { time, play } of beats) if (id !== "bard/C/P4" || time !== .78) at(time, play)
  return {
    aim: review?.aim ?? point(boss), picked: review?.picked, focus, duration,
  }
}
