import { issueEdgeOrder, moveEdgeFighter, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, along, inside, type EdgePoint } from "./geometry"
import { healerChoreography, type HealerMotif } from "./healerChoreo"
import { parseStep } from "./program"
import { damageUnit, newCast, runSteps, shoveUnit } from "./runtime"

type Schedule = (time: number, play: () => void) => void

const groups = new Set<HealerMotif>(["neighborNeedle", "priority", "areaTriage", "sutureLane", "samePoint", "triage",
  "dualRoute", "compress", "aidStation", "doubleNeedle", "urgentCorners", "rally", "reverseTriage", "net", "sanctuary"])

export function healerPreviewPartners(active: EdgeActive, squad: boolean) {
  const motif = healerChoreography(active.id)?.motif
  return squad || motif && groups.has(motif) ? 2 : 1
}

export function arrangeHealerPreview(battle: EdgeBattle, active: EdgeActive, at: Schedule) {
  const [actor, ally, spare] = battle.team
  const boss = battle.boss
  const motif = healerChoreography(active.id)?.motif
  const origin = { x: CENTER.x, y: CENTER.y + 209 }
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const focus: EdgePoint[] = []
  let duration = 4.7
  let aim = near(-28, -192)
  const hurt = (unit: EdgeUnit, time: number, raw: number, basic = false) => at(time, () =>
    damageUnit(battle, newCast(battle, boss, basic ? "basic" : "enemy", unit, unit), unit, raw))
  const status = (unit: EdgeUnit, time: number, ops: string) => at(time, () =>
    runSteps(battle, newCast(battle, boss, "enemy", unit, unit), [parseStep("t " + ops)]))
  const walk = (unit: EdgeFighter, time: number, to: EdgePoint) => {
    focus.push(to)
    at(time, () => moveEdgeFighter(battle, unit, to))
  }
  const push = (unit: EdgeUnit, time: number, length: number, axis: EdgePoint) => {
    focus.push(along(unit, axis, length))
    at(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, length, "", undefined, false, axis))
  }
  for (const [i, unit] of battle.team.entries()) {
    unit.maxHp = 1100
    unit.hp = [780, 530, 660][i] ?? 625
  }
  boss.hp = boss.maxHp = 4800
  place(actor, 0, 0)
  place(ally, -104, -134)
  place(spare, 145, -90)
  place(boss, 126, -293)
  switch (motif) {
    case "stitches":
      place(boss, 24, -266)
      hurt(ally, 1.37, 232)
      hurt(ally, 2.31, 142)
      break
    case "gauze":
      place(boss, 11, -273)
      hurt(ally, 1.25, 70)
      hurt(ally, 2.21, 164)
      break
    case "assessment":
      ally.hp = 412
      break
    case "steadyStep":
      walk(ally, 1.19, near(-38, -278))
      break
    case "unwind":
      status(ally, .12, "dot.18,1.1,6 slow24,5 root.84")
      break
    case "unclip":
      status(ally, .12, "short70,6")
      walk(ally, 1.19, near(-34, -325))
      break
    case "painPatch":
      place(boss, -54, -272)
      hurt(ally, 1.03, 120, true)
      hurt(ally, 1.91, 318)
      break
    case "neighborNeedle":
      place(spare, -178, -185)
      break
    case "retreatKit":
      place(boss, -84, -299)
      walk(ally, 1.22, near(-230, -33))
      break
    case "cardiacNeedle":
      ally.hp = 254
      break
    case "refund":
      place(boss, -59, -269)
      hurt(ally, 1.34, 490)
      break
    case "twoWay":
      actor.hp = 574
      break
    case "priority":
      aim = near(-45, -222)
      place(ally, -104, -244); place(spare, 39, -205)
      ally.hp = 280
      break
    case "quickStep":
      walk(ally, 1.21, near(-47, -306))
      break
    case "areaTriage":
      aim = near(-55, -186)
      place(ally, -119, -224); place(spare, 30, -159)
      break
    case "sutureLane":
      aim = near(0, -313)
      place(ally, 27, -151); place(spare, -29, -274)
      ally.hp = 464; spare.hp = 291
      break
    case "overflowWard":
      ally.hp = 1050
      status(ally, .12, "dot.19,1.1,6")
      break
    case "samePoint":
      aim = near(-5, -233)
      place(ally, -64, -198); place(spare, 137, -236)
      ally.hp = 440; spare.hp = 260
      push(spare, .43, 68, { x: -1, y: 0 })
      break
    case "underPatch":
      place(boss, -53, -272)
      hurt(ally, 1.29, 278)
      break
    case "triage":
      ally.hp = 156; spare.hp = 383; actor.hp = 735
      place(ally, -138, -190); place(spare, 140, -233)
      break
    case "stopLoss":
      place(boss, -65, -272)
      hurt(ally, 1.03, 150, true)
      hurt(ally, 1.95, 440)
      break
    case "dualRoute":
      place(ally, -118, -158); place(spare, 24, -228)
      spare.hp = 300
      break
    case "compress":
      aim = near(-18, -217)
      place(ally, -102, -251); place(spare, 69, -170)
      status(ally, .13, "dot.18,1.1,6")
      status(spare, .15, "slow24,5")
      break
    case "aidStation":
      aim = near(-7, -251)
      place(ally, -115, -124); place(spare, 145, -159)
      ally.hp = 286; spare.hp = 280
      walk(ally, 1.23, near(-39, -210))
      walk(spare, 3.90, near(71, -244))
      duration = 9.25
      break
    case "rescueWindow":
      place(boss, 42, -268)
      ally.hp = 305
      hurt(ally, 1.55, 1800)
      hurt(ally, 2.46, 93)
      break
    case "doubleNeedle":
      place(ally, -110, -120); place(spare, 37, -167)
      spare.hp = 300
      walk(ally, 1.18, near(-49, -129))
      break
    case "urgentCorners":
      aim = near(-35, -226)
      place(ally, -104, -260); place(spare, 67, -189)
      ally.hp = 402
      break
    case "recoilDose":
      place(boss, -67, -284)
      hurt(ally, 1.51, 570)
      break
    case "farBeam":
      Object.assign(ally, { x: FIELD.left + 83, y: FIELD.top + 101 })
      focus.push({ x: ally.x, y: ally.y - 123 })
      status(ally, .12, "dot.18,1.1,6 slow24,6 root1.5")
      break
    case "rally":
      Object.assign(ally, { x: FIELD.left - 65, y: origin.y - 265 })
      place(spare, 213, -212)
      focus.push({ x: FIELD.left, y: FIELD.top }, { x: FIELD.right, y: FIELD.bottom })
      push(ally, 1.46, 104, { x: -1, y: 0 })
      walk(ally, 2.07, { x: FIELD.left + 80, y: ally.y })
      duration = 5.1
      break
    case "reverseTriage":
      ally.hp = 310
      spare.hp = 560
      focus.push({ x: ally.x, y: ally.y - 130 })
      break
    case "partition":
      Object.assign(ally, { x: FIELD.left + 72, y: FIELD.top + 199 })
      place(boss, -177, -506)
      hurt(ally, 1.57, 590)
      break
    case "net":
      aim = near(-70, -217)
      place(ally, 54, -217); place(spare, 151, -218)
      place(boss, 144, -325)
      break
    case "sanctuary":
      aim = near(-24, -230)
      place(ally, -94, -253); place(spare, 82, -193)
      place(boss, 170, -299)
      status(ally, .12, "dot.18,1.1,6 slow26,6 root1.8")
      break
  }
  const picked = active.aim.mode === "ally" || active.aim.mode === "other" ? ally : undefined
  const location = picked ? { x: picked.x, y: picked.y } : aim
  at(.25, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, picked ?? location))
  return { aim: location, picked, focus, duration }
}
