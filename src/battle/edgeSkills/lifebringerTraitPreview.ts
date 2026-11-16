import type { SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { issueEdgeOrder, moveEdgeFighter, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, inside, type EdgePoint } from "./geometry"
import { parseStep } from "./program"
import { damageUnit, newCast, runSteps, shoveUnit } from "./runtime"
import { arrangeLifebringerPreview } from "./lifebringerPreview"

type Schedule = (time: number, play: () => void) => void
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, 0, 0, -1],
  UC: [0, 1, 2, 3, 4, 2, 0, -1],
  R: [0, 1, 2, 3, 4, 0, 0, -1],
  E: [0, 1, 2, 3, 4, 3, -1, -1],
  L: [0, 1, 2, 3, 4, 2, 3, 3],
  Radiant: [0, 1, 2, 3, 4, 1, 4, -1],
  Prismatic: [0, 1, 2, 3, 4, -1, -1, 0],
}
export const lifebringerTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]
const two = new Set([
  "C/G1", "C/G2", "UC/P2", "UC/G1", "UC/G2", "R/P1", "R/P2", "R/P4", "R/P6", "R/P7", "R/G1", "R/G2",
  "E/P3", "E/P8", "E/G1", "E/G2", "L/P1", "L/P8", "L/G1", "Radiant/P2", "Radiant/P8", "Radiant/G1",
  "Radiant/G2", "Prismatic/P1", "Prismatic/P2", "Prismatic/P3", "Prismatic/G1",
])
const healers = new Set(["C/P8", "UC/P8", "R/P3", "E/P7", "Radiant/P8"])
export function lifebringerTraitPartners(id: string, squad: boolean) {
  const key = id.slice("lifebringer/".length)
  const count = key === "Prismatic/P8" ? 3 : squad || two.has(key) ? 2 : 1
  return Array.from({ length: count }, (_, i): SubJobId => i === 0 && healers.has(key) ? "healer" : "ranger")
}

export function arrangeLifebringerTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const key = id.slice("lifebringer/".length)
  const [actor, ally, spare, fourth] = battle.team
  const boss = battle.boss
  const origin = { x: CENTER.x - 24, y: CENTER.y + 205 }
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (u: EdgeUnit | undefined, x: number, y: number) => { if (u) Object.assign(u, near(x, y)) }
  const skip = new Set<number>()
  if (key === "C/P7") skip.add(1.21)
  if (key === "UC/G1") skip.add(1.48)
  if (key === "R/G1") skip.add(1.18)
  if (key === "E/G1") skip.add(2.13)
  if (key === "L/P6") { skip.add(1.2); skip.add(3.91) }
  if (key === "Radiant/P1" || key === "Radiant/G1") skip.add(1.14)
  if (key === "Radiant/P7") skip.add(1.16)
  const plan = active ? arrangeLifebringerPreview(battle, active, squad, (time, play) => {
    if (skip.has(time)) return
    at(key === "C/P7" && time === .25 ? 1.28 : time, play)
  }) : { aim: near(0, -184), picked: undefined, duration: 4, focus: [] as EdgePoint[] }
  const focus = plan.focus
  let duration = plan.duration
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.4)
    at(time, play)
  }
  const walk = (u: EdgeFighter, time: number, to: EdgePoint) => {
    focus.push(to)
    queue(time, () => moveEdgeFighter(battle, u, to))
  }
  const hurt = (u: EdgeUnit, time: number, amount: number) => queue(time, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", u, u), u, amount))
  const push = (u: EdgeUnit, time: number, amount: number, axis: EdgePoint = { x: 1, y: 0 }) => {
    focus.push({ x: u.x + axis.x * amount, y: u.y + axis.y * amount })
    queue(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", u, u), u, amount, "", undefined, false, axis))
  }
  const receive = (time: number) => queue(time, () => issueEdgeOrder(battle, ally, "skill", actor))
  if (!active) {
    for (const [i, u] of battle.team.entries()) { u.maxHp = 1100; u.hp = i ? 450 : 620 }
    place(actor, 0, 0)
    place(ally, 78, -51)
    place(spare, -100, -49)
    place(boss, 11, -220)
    boss.hp = boss.maxHp = 6200
  }
  switch (key) {
    case "C/P4":
      push(ally, 2.36, 108)
      break
    case "C/P6":
      place(ally, 70, -61)
      break
    case "C/P7":
      walk(actor, .21, near(62, -18))
      duration = 5
      break
    case "C/P8":
      actor.hp = 450
      push(actor, .52, 96)
      receive(1.84)
      break
    case "C/G1":
      place(spare, 80, -120)
      break
    case "C/G2":
      place(spare, -67, -163)
      walk(spare, 2.35, near(38, -112))
      duration = 6.3
      break
    case "UC/P2": case "UC/G2":
      place(spare, 92, -129)
      if (key === "UC/G2") push(spare, 2.35, 103)
      break
    case "UC/P7":
      queue(.13, () => runSteps(battle, newCast(battle, ally, "skill", actor, actor), [parseStep("t b14")]))
      hurt(actor, 2.18, 230)
      break
    case "UC/P5":
      place(ally, 55, -151)
      place(spare, -57, -150)
      place(boss, 23, -241)
      break
    case "UC/P8":
      actor.hp = 358
      receive(.37)
      break
    case "UC/G1":
      place(spare, 203, -36)
      queue(1.37, () => {
        const incoming = newCast(battle, boss, "enemy", ally, ally)
        damageUnit(battle, incoming, ally, 233)
        shoveUnit(battle, incoming, ally, 118, "", undefined, false, { x: 1, y: 0 })
      })
      walk(spare, 2.22, near(198, -143))
      duration = 6.1
      break
    case "R/P2":
      place(actor, 8, -108)
      place(spare, 154, -217)
      break
    case "R/P4":
      push(spare, 3.03, 110, { x: -1, y: 0 })
      break
    case "R/P5":
      battle.preview!.targets.length = 0
      break
    case "R/P6":
      ally.hp = 320
      break
    case "R/P7":
      ally.hp = 970
      break
    case "R/P8":
      place(ally, 127, -26)
      walk(actor, .24, near(76, -12))
      break
    case "R/G1":
      place(ally, -81, -16)
      place(spare, 81, -14)
      spare.hp = 305
      break
    case "E/P2":
      hurt(ally, 2.52, 160)
      break
    case "E/P5":
      push(ally, 1.96, 113)
      break
    case "E/P6":
      place(ally, 76, -52)
      ally.hp = 338
      break
    case "E/P7":
      receive(.42)
      walk(actor, 1.49, near(144, -65))
      break
    case "E/P8":
      place(ally, 89, -18)
      hurt(spare, .61, 3200)
      break
    case "E/G1":
      place(ally, 65, -166)
      place(spare, 149, -174)
      duration = 5.6
      break
    case "E/G2":
      place(spare, 114, -119)
      break
    case "L/P4":
      hurt(ally, 2.91, 170)
      break
    case "L/P6":
      place(actor, 0, -113)
      push(actor, 1.07, 103, { x: 0, y: 1 })
      break
    case "L/P7":
      Object.assign(actor, { x: FIELD.left + 183, y: origin.y })
      Object.assign(ally, { x: FIELD.left - 48, y: origin.y - 62 })
      break
    case "L/P8":
      hurt(spare, .27, 4100)
      break
    case "L/G1":
      push(actor, 2.28, 110, { x: -1, y: 0 })
      push(ally, 2.95, 90)
      break
    case "Radiant/P1": case "Radiant/G1":
      ally.hp = 280
      if (spare) place(spare, -41, -164)
      break
    case "Radiant/P3":
      hurt(ally, 4.05, 188)
      break
    case "Radiant/P5":
      queue(2.22, () => issueEdgeOrder(battle, ally, "basic", boss))
      break
    case "Radiant/P6":
      hurt(actor, 1.51, 180)
      hurt(actor, 3.65, 180)
      break
    case "Radiant/P7":
      Object.assign(actor, { x: FIELD.left + 197, y: origin.y })
      Object.assign(plan.aim, { x: FIELD.left + 28, y: origin.y - 181 })
      Object.assign(boss, { x: FIELD.left + 46, y: plan.aim.y - 22 })
      Object.assign(ally, { x: FIELD.left - 73, y: plan.aim.y + 33 })
      if (spare) Object.assign(spare, { x: FIELD.left + 230, y: plan.aim.y + 65 })
      push(ally, 1.64, 85, { x: -1, y: 0 })
      break
    case "Radiant/P8":
      actor.hp = 325
      ally.hp = ally.maxHp
      receive(.45)
      break
    case "Radiant/G2":
      if (spare) spare.hp = 267
      break
    case "Prismatic/P2":
      push(ally, 5.24, 102)
      duration = 6.75
      break
    case "Prismatic/P4":
      walk(ally, 1.78, { x: FIELD.left + 70, y: ally.y - 18 })
      break
    case "Prismatic/P6":
      Object.assign(ally, { x: FIELD.left - 54, y: origin.y - 102 })
      walk(ally, .3, { x: FIELD.left + 81, y: ally.y + 27 })
      duration = 4.2
      break
    case "Prismatic/P7":
      place(ally, 81, -35)
      ally.hp = 376
      push(actor, .62, 105, { x: -1, y: 0 })
      walk(ally, 2.08, near(232, -108))
      break
    case "Prismatic/P8":
      place(fourth, 43, 91)
      hurt(fourth, .93, 4600)
      break
    case "Prismatic/G1":
      place(actor, 53, -48)
      break
  }
  return { ...plan, duration, focus }
}
