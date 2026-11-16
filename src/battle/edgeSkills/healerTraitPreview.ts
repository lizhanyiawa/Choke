import type { SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { issueEdgeOrder, moveEdgeFighter, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, along, inside, type EdgePoint } from "./geometry"
import { arrangeHealerPreview, healerPreviewPartners } from "./healerPreview"
import { parseStep } from "./program"
import { damageUnit, newCast, positionUnit, runSteps, shoveUnit } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, 0, 0, 0],
  UC: [0, 1, 2, 3, 4, 0, 0, -1],
  R: [0, 1, 2, 3, 4, 0, -1, 0],
  E: [0, 1, 2, 3, 4, -1, 0, -1],
  L: [0, 1, 2, 3, 4, 2, 1, -1],
  Radiant: [0, 1, 2, 3, 4, 4, -1, -1],
  Prismatic: [0, 1, 2, 3, 4, -1, 2, -1],
}
export const healerTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]
const short = (id: string) => id.slice("healer/".length)
const needsTwo = new Set(["UC/G1", "R/G2", "R/P8", "E/P8", "L/P8", "Radiant/G1", "Radiant/P8", "Prismatic/P8"])

export function healerTraitLineup(id: string, active: EdgeActive | undefined, squad: boolean): SubJobId[] {
  const key = short(id)
  const count = squad || needsTwo.has(key) ? 2 : active ? healerPreviewPartners(active, false) : 1
  return Array.from({ length: count }, (_, i) => i === 0 ? key === "UC/P8" ? "healer" : "warden" : "ranger")
}

export function arrangeHealerTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, at: Schedule) {
  const key = short(id)
  const [actor, ally, spare] = battle.team
  const boss = battle.boss
  const origin = { x: CENTER.x, y: CENTER.y + 209 }
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const castLater: Record<string, number> = { "UC/P6": 2.92, "UC/P7": 1.82, "R/P8": 1.51, "E/P7": 2.12 }
  const stage = active ? arrangeHealerPreview(battle, active, (time, play) => {
    if (castLater[key] && time !== .25) return
    at(time === .25 ? castLater[key] ?? time : time, play)
  }) : { aim: near(0, -181), picked: undefined, focus: [] as EdgePoint[], duration: 4.7 }
  const { focus } = stage
  let duration = stage.duration
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.7)
    at(time, play)
  }
  const hurt = (unit: EdgeUnit, time: number, raw: number) => queue(time, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, raw))
  const push = (unit: EdgeUnit, time: number, amount: number, axis: EdgePoint = { x: 1, y: 0 }) => {
    focus.push(along(unit, axis, amount))
    queue(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, amount, "", undefined, false, axis))
  }
  const walk = (unit: EdgeFighter, time: number, end: EdgePoint) => {
    focus.push(end)
    queue(time, () => moveEdgeFighter(battle, unit, end))
  }
  const leave = (unit: EdgeUnit, time: number, end: EdgePoint) => {
    focus.push(end)
    queue(time, () => positionUnit(battle, unit, end))
  }
  const apply = (source: EdgeUnit, target: EdgeUnit, time: number, ops: string) =>
    queue(time, () => runSteps(battle, newCast(battle, source, "enemy", target, target), [parseStep("t " + ops)]))
  if (!active) {
    for (const [i, unit] of battle.team.entries()) { unit.maxHp = 1100; unit.hp = [770, 535, 660][i] ?? 625 }
    boss.hp = boss.maxHp = 5200
    place(actor, 0, 0); place(ally, -89, -111); place(spare, 157, -113); place(boss, 63, -244)
  }
  switch (key) {
    case "C/G1":
      push(ally, 1.38, 109)
      break
    case "C/P3":
      push(ally, .92, 104)
      break
    case "C/P5":
      hurt(ally, 1.71, 244)
      break
    case "C/P6":
      place(ally, -65, -65)
      break
    case "C/P7":
      ally.hp = 1080
      break
    case "C/P8":
      Object.assign(actor, { x: FIELD.left + 136, y: origin.y })
      Object.assign(ally, { x: FIELD.left - 55, y: origin.y - 115 })
      place(boss, -152, -275)
      break
    case "UC/G1":
      place(spare, -186, -96)
      apply(boss, spare, .16, "slow31,5")
      walk(spare, 1.29, near(-270, -207))
      break
    case "UC/G2":
      push(ally, 2.36, 110)
      break
    case "UC/P6":
      walk(actor, .28, near(-62, -100))
      break
    case "UC/P8":
      queue(.34, () => issueEdgeOrder(battle, ally, "skill", actor))
      break
    case "R/G1":
      hurt(ally, 1.61, 298)
      break
    case "R/G2":
      place(spare, 22, -340)
      break
    case "R/P2":
      push(ally, 1.91, 112)
      break
    case "R/P6":
      apply(ally, actor, .12, "b17")
      break
    case "R/P7":
      hurt(ally, .91, 380)
      break
    case "R/P8":
      hurt(spare, .44, 4800)
      break
    case "E/G1":
      place(boss, -174, -284)
      break
    case "E/P2":
      push(ally, 1.38, 110)
      break
    case "E/P3": case "E/G2":
      hurt(ally, 1.42, 274)
      if (key === "E/G2") push(ally, 2.13, 127)
      break
    case "E/P6":
      place(ally, -76, -61); hurt(actor, .91, 290)
      leave(ally, 1.92, near(-171, -104))
      break
    case "E/P7":
      walk(actor, .28, near(-75, -158))
      break
    case "E/P8":
      hurt(ally, .55, 4800)
      break
    case "L/G1":
      hurt(ally, 1.56, 292)
      break
    case "L/G2":
      place(spare, -215, -85)
      break
    case "L/P6":
      spare.hp = 200
      break
    case "L/P7":
      place(ally, -113, -323)
      break
    case "L/P8":
      hurt(spare, .51, 4900)
      push(actor, 1.22, 116)
      push(ally, 1.81, 110, { x: -1, y: 0 })
      break
    case "Radiant/G1":
      place(spare, -190, -96)
      break
    case "Radiant/G2":
      hurt(ally, 1.54, 305)
      break
    case "Radiant/P4":
      push(ally, 1.99, 120)
      break
    case "Radiant/P6":
      Object.assign(ally, { x: FIELD.left - 47, y: FIELD.top + 142 })
      focus.push({ x: ally.x, y: ally.y - 125 })
      break
    case "Radiant/P7":
      place(ally, -84, -57); ally.hp = 390
      hurt(actor, .95, 305)
      leave(ally, 1.92, near(-178, -115))
      break
    case "Radiant/P8":
      hurt(spare, .48, 4800)
      hurt(ally, 1.43, 238); hurt(actor, 1.97, 251)
      break
    case "Prismatic/P1": case "Prismatic/G1":
      focus.length = 0
      Object.assign(actor, { x: FIELD.left + 239, y: ally.y + 201 })
      Object.assign(spare, { x: FIELD.left + 74, y: ally.y + 56 })
      Object.assign(boss, { x: FIELD.left + 254, y: ally.y - 94 })
      if (key === "Prismatic/G1") duration += .4
      break
    case "Prismatic/G2":
      focus.push({ x: ally.x, y: ally.y - 160 })
      break
    case "Prismatic/P2":
      push(ally, 1.56, 129)
      break
    case "Prismatic/P6":
      Object.assign(actor, { x: FIELD.left + 107, y: origin.y })
      Object.assign(ally, { x: FIELD.left - 57, y: origin.y - 101 })
      walk(ally, .32, { x: FIELD.left + 78, y: ally.y })
      if (spare) {
        Object.assign(spare, { x: FIELD.left - 42, y: origin.y - 172 })
        walk(spare, 1.52, { x: FIELD.left + 66, y: spare.y })
      }
      break
    case "Prismatic/P7":
      place(ally, -107, -91); ally.hp = 314
      place(boss, 35, -259)
      break
    case "Prismatic/P8":
      hurt(spare, .49, 4700)
      break
  }
  return { ...stage, duration, focus }
}
