import type { SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { finishBossCharge, issueEdgeOrder, moveEdgeFighter, startBossCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { arrangeDancerPreview } from "./dancerPreview"
import { CENTER, FIELD, along, edgeDistance, inside, type EdgePoint } from "./geometry"
import { parseStep } from "./program"
import { damageUnit, newCast, positionUnit, previewSkillDisplacements, runSteps, shoveUnit } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, -1, -1, -1],
  UC: [0, 1, 2, 3, 4, -1, -1, -1],
  R: [0, 1, 2, 3, 4, -1, -1, -1],
  E: [0, 1, 2, 3, 4, 2, -1, -1],
  L: [0, 1, 2, 3, 4, -1, 2, -1],
  Radiant: [0, 1, 2, 3, 4, 3, 1, 1],
  Prismatic: [0, 1, 2, 3, 4, 0, -1, -1],
}
export const dancerTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]
const twoPartners = new Set(["C/P8", "C/G1", "UC/G2", "R/G1", "E/G1", "L/G1", "Prismatic/G1", "Prismatic/P8"])

export function dancerTraitPartners(id: string, squad: boolean) {
  const key = id.slice("dancer/".length)
  const count = squad || twoPartners.has(key) ? 2 : 1
  return Array.from({ length: count }, (_, i): { job: SubJobId; rarity: Rarity } => {
    if (i === 0 && key === "R/P8") return { job: "dancer", rarity: "UC" }
    return { job: i === 0 ? "warden" : "ranger", rarity: "C" }
  })
}

export function arrangeDancerTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const key = id.slice("dancer/".length)
  const [actor, ally, spare] = battle.team
  const boss = battle.boss
  const origin = { x: CENTER.x - 58, y: CENTER.y + 182 }
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const plan = active ? arrangeDancerPreview(battle, active, squad, (time, play) => {
    at(time === .28 && key === "Radiant/P8" ? 1.68 : time, play)
  }) : { aim: near(0, -215), picked: undefined, duration: 4, focus: [] as EdgePoint[] }
  const { focus } = plan
  let duration = plan.duration
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.7)
    at(time, play)
  }
  const walk = (unit: EdgeFighter, time: number, where: EdgePoint) => {
    focus.push(where)
    queue(time, () => moveEdgeFighter(battle, unit, where))
  }
  const push = (unit: EdgeUnit, time: number, amount: number, axis: EdgePoint = { x: 1, y: 0 }) => {
    focus.push(along(unit, axis, amount))
    queue(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, amount, "", undefined, false, axis))
  }
  const hurt = (unit: EdgeUnit, time: number, amount: number) => queue(time, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, amount))
  const leave = (unit: EdgeUnit, time: number, where: EdgePoint) => {
    focus.push(where)
    queue(time, () => positionUnit(battle, unit, where))
  }
  const hit = (unit: EdgeFighter, time: number, target: EdgeUnit = boss) =>
    queue(time, () => issueEdgeOrder(battle, unit, "basic", target))
  const dummy = (where: EdgePoint) => {
    const other = { ...boss, ...where, id: ("dummy-" + (battle.preview!.targets.length + 1)) as typeof boss.id,
      hp: 3200, maxHp: 3200, shield: 0, once: new Set<string>(), move: null, force: null, telegraph: null }
    battle.preview!.targets.push(other)
    focus.push(where)
  }
  if (!active) {
    for (const [i, unit] of battle.team.entries()) { unit.maxHp = 1100; unit.hp = 770 - i * 97 }
    boss.hp = boss.maxHp = 5400
    place(actor, 0, 0); place(ally, -84, -42); place(spare, 148, -105); place(boss, 15, -215)
  }
  switch (key) {
    case "C/G1":
      place(spare, 175, -296)
      break
    case "C/P4":
      push(actor, 1.32, 110)
      break
    case "C/G2":
      place(ally, 142, -14); walk(ally, 1.30, near(43, -9))
      break
    case "C/P5":
      hit(actor, 6.48)
      break
    case "C/P6":
      hurt(actor, .94, 220)
      leave(ally, 1.68, near(-172, -81))
      break
    case "C/P7":
      walk(actor, .32, near(65, -75))
      break
    case "C/P8":
      hurt(spare, .48, 4800); walk(actor, .97, near(132, 68))
      duration = 4.85
      break
    case "UC/P3":
      walk(ally, 3.94, near(66, -262))
      break
    case "UC/G2":
      place(spare, -57, -239)
      break
    case "UC/P4":
      hit(actor, 6.46)
      break
    case "UC/P5":
      place(boss, 346, -177); hit(ally, 2.39)
      break
    case "UC/P6":
      push(actor, .85, 112)
      leave(ally, 2.04, near(-188, -80))
      break
    case "UC/P7":
      place(boss, 0, -182); walk(actor, .32, near(-15, 111))
      break
    case "UC/P8":
      queue(.28, () => runSteps(battle, newCast(battle, ally, "skill", actor, actor), [parseStep("t b14")]))
      walk(actor, 1.25, near(107, 43))
      break
    case "R/G1":
      place(spare, 210, -372)
      break
    case "R/P2":
      place(boss, 130, -246); hit(ally, 2.60)
      break
    case "R/G2":
      place(boss, 127, -251)
      break
    case "R/P6":
      place(boss, 0, -255)
      queue(.13, () => startBossCharge(battle, actor))
      walk(actor, .45, near(132, 24))
      hurt(actor, 1.55, 247)
      queue(3.16, () => finishBossCharge(battle))
      break
    case "R/P7":
      boss.range = 255
      hurt(actor, .87, 260)
      leave(ally, 1.70, near(-187, -86))
      break
    case "R/P8":
      place(ally, -115, -7); place(boss, -140, -35)
      queue(.28, () => issueEdgeOrder(battle, ally, "skill", actor))
      hit(actor, 1.43)
      break
    case "E/G1":
      place(spare, -138, -53)
      break
    case "E/P2":
      push(ally, 2.18, 112)
      break
    case "E/G2":
      place(boss, 220, -143)
      break
    case "E/P3":
      place(boss, -20, -75); hit(actor, 6.45)
      break
    case "E/P5":
      walk(ally, 1.28, near(-128, -186))
      break
    case "E/P6":
      hurt(actor, 1.30, 244)
      break
    case "E/P7":
      place(ally, -150, -72); walk(ally, .34, near(-43, -72))
      break
    case "E/P8":
      Object.assign(actor, { x: FIELD.left - 55, y: origin.y })
      walk(actor, .32, { x: FIELD.left + 75, y: origin.y })
      walk(actor, 1.86, { x: FIELD.left + 405, y: origin.y })
      break
    case "L/G1":
      dummy(near(-91, -6)); place(spare, -108, -23)
      break
    case "L/G2":
      push(actor, 1.44, 130); push(ally, 2.02, 130, { x: -1, y: 0 })
      break
    case "L/P4":
      hurt(ally, 2.68, 257)
      break
    case "L/P6":
      walk(actor, .32, near(-45, -100))
      break
    case "L/P7":
      place(boss, 33, -126); hit(actor, 6.45)
      break
    case "L/P8":
      hurt(ally, .44, 4700); walk(actor, .98, near(250, 120))
      break
    case "Radiant/G1": {
      const ends = previewSkillDisplacements(battle, actor, active!, plan.aim).map(({ to }) => to)
      const pairs = ends.flatMap((a, i) => ends.slice(i + 1).map(b => ({ a, b, length: edgeDistance(a, b) })))
      const band = pairs.sort((a, b) => b.length - a.length)[0]
      if (band) walk(ally, 1.31, { x: (band.a.x + band.b.x) / 2, y: (band.a.y + band.b.y) / 2 })
      hurt(ally, 3.36, 300)
      break
    }
    case "Radiant/P4":
      push(ally, 2.27, 126)
      break
    case "Radiant/P6":
      push(actor, 1.37, 116)
      break
    case "Radiant/P7":
      place(boss, 14, -175); walk(ally, 1.28, near(271, -150))
      break
    case "Radiant/P8":
      Object.assign(actor, { x: FIELD.left + 145, y: origin.y })
      Object.assign(ally, { x: FIELD.left - 52, y: origin.y - 127 })
      Object.assign(plan.aim, { x: FIELD.left + 100, y: origin.y - 121 })
      walk(ally, .27, { x: FIELD.left + 40, y: ally.y })
      break
    case "Prismatic/G1":
      place(spare, 45, -507)
      break
    case "Prismatic/P3":
      push(ally, 3.15, 128)
      break
    case "Prismatic/G2":
      place(boss, 93, -244)
      break
    case "Prismatic/P6":
      push(actor, 1.56, 129)
      break
    case "Prismatic/P7":
      Object.assign(actor, { x: FIELD.left + 91, y: origin.y })
      Object.assign(ally, { x: FIELD.left - 52, y: origin.y - 70 })
      walk(ally, .35, { x: FIELD.left + 36, y: ally.y })
      if (spare) {
        Object.assign(spare, { x: FIELD.left - 54, y: origin.y - 154 })
        walk(spare, 1.48, { x: FIELD.left + 49, y: spare.y })
      }
      break
    case "Prismatic/P8":
      hurt(spare, .48, 4800); hurt(ally, 1.26, 225); hurt(actor, 1.92, 247)
      break
  }
  return { ...plan, duration, focus }
}
