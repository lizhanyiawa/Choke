import {
  issueEdgeOrder, moveEdgeFighter, moveLanding, startBossCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit,
} from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, inside, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit, startMovement } from "./runtime"
import { wardenChoreography, type WardenMotif } from "./wardenChoreo"

type Schedule = (time: number, play: () => void) => void
const north = { x: 0, y: -1 }
const partners = new Set<WardenMotif>([
  "rearhook", "sling", "escort", "relay", "stretcher", "exchange", "bastionSweep", "carry", "advance",
  "overlap", "boundary", "ricochet", "parallel",
])

export function wardenPreviewPartner(active: EdgeActive) {
  const scene = wardenChoreography(active.id)
  return scene && partners.has(scene.motif)
}

export function arrangeWardenPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const motif = wardenChoreography(active.id)!.motif
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const origin = { x: CENTER.x - 58, y: CENTER.y + 170 }
  const focus: EdgePoint[] = []
  const near = (dx: number, dy: number) => inside({ x: origin.x + dx, y: origin.y + dy })
  const place = (unit: EdgeUnit | undefined, dx: number, dy: number) => { if (unit) Object.assign(unit, near(dx, dy)) }
  const edge = (unit: EdgeUnit | undefined, dx: number, depth: number) => {
    if (unit) Object.assign(unit, { x: origin.x + dx, y: FIELD.top + depth })
  }
  const dummy = (dx: number, dy: number) => {
    const id = ("dummy-" + (battle.preview!.targets.length + 1)) as `dummy-${number}`
    const enemy = { ...boss, ...near(dx, dy), id, once: new Set<string>() }
    battle.preview!.targets.push(enemy)
    return enemy
  }
  let end = 2.75
  const queue = (time: number, play: () => void) => {
    end = Math.max(end, time + 1)
    at(time, play)
  }
  const charge = (time: number) => at(time, () => startBossCharge(battle, actor))
  const hit = (time: number, unit: EdgeUnit, amount: number, order: "enemy" | "basic" = "enemy") =>
    queue(time, () => damageUnit(battle, newCast(battle, boss, order, unit, unit), unit, amount))
  const shove = (time: number, unit: EdgeUnit, amount: number, axis = north) =>
    queue(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, amount, "", undefined, false, axis))
  const walk = (time: number, unit: EdgeFighter, wanted: EdgePoint) => queue(time, () => moveEdgeFighter(battle, unit, wanted))
  const moveFoe = (time: number, unit: EdgeUnit, wanted: EdgePoint) => queue(time, () => {
    const landing = moveLanding(unit, wanted, battle)
    if (landing && !startMovement(battle, unit, landing, false, wanted)) unit.move = landing
  })
  battle.team.forEach((unit, i) => { unit.maxHp = 1100; unit.hp = i ? 590 + i * 45 : 745 })
  boss.hp = boss.maxHp = 1900
  place(actor, 0, 0)
  place(ally, 132, -26)
  place(spare, -151, 32)
  place(boss, 8, -165)
  let aim = near(0, -180)
  let orderTime = .20

  switch (motif) {
    case "knocker":
      place(boss, 28, -114)
      charge(.12)
      break
    case "rake":
      aim = near(0, -140)
      place(boss, 18, -124)
      if (squad) dummy(-19, -46)
      break
    case "step": aim = near(54, -68); break
    case "rearhook":
      place(boss, 212, -169)
      shove(1.13, ally, 100)
      break
    case "spear": place(boss, -28, -136); break
    case "ram":
      aim = near(0, -102)
      place(boss, 43, -128)
      if (squad) dummy(-47, -135)
      break
    case "sling":
      place(ally, 151, -45)
      place(boss, 164, -177)
      hit(.86, ally, 125, "basic")
      hit(1.66, ally, 210)
      break
    case "deflect":
      place(boss, 55, -140)
      focus.push(near(165, -123))
      break
    case "stamp":
      aim = near(20, -116)
      place(boss, -32, -160)
      charge(.10)
      break
    case "winch": place(boss, 51, -173); break
    case "grapple": place(boss, -52, -201); break
    case "compass": {
      Object.assign(actor, { x: FIELD.right - 167, y: CENTER.y + 106 })
      Object.assign(boss, { x: FIELD.right - 35, y: CENTER.y - 19 })
      if (ally) Object.assign(ally, inside({ x: actor.x - 109, y: actor.y + 53 }))
      if (spare) Object.assign(spare, inside({ x: actor.x - 226, y: actor.y + 44 }))
      break
    }
    case "beacon":
      aim = near(20, -180)
      if (squad) {
        place(boss, 35, -206)
        charge(.12)
        const other = dummy(173, -115)
        moveFoe(1.02, other, near(66, -108))
      } else {
        place(boss, 174, -211)
        moveFoe(.66, boss, near(65, -174))
      }
      end = 8.87
      break
    case "escort":
      place(ally, 75, -213)
      place(boss, -85, -205)
      break
    case "relay":
      place(boss, 7, -164)
      place(ally, 94, -244)
      queue(1.23, () => issueEdgeOrder(battle, ally, "basic", boss))
      break
    case "divider":
      aim = near(0, -225)
      place(boss, -43, -147)
      dummy(45, -185)
      if (squad) charge(.12)
      focus.push(near(-151, -148), near(153, -186))
      break
    case "gate":
      aim = near(0, -187)
      place(boss, 47, -93)
      moveFoe(.65, boss, near(45, -230))
      if (squad) {
        const other = dummy(-58, -283)
        moveFoe(1.02, other, near(-61, -167))
      }
      end = 8.94
      break
    case "spring": place(boss, 17, -218); break
    case "stretcher":
      place(ally, 147, -88)
      place(boss, 121, -210)
      break
    case "breaker":
      aim = near(-31, -145)
      place(boss, 43, -166)
      if (squad) dummy(-105, -200)
      charge(.11)
      break
    case "exchange":
      place(ally, 174, -180)
      place(boss, 103, -237)
      if (squad) {
        dummy(232, -228)
        focus.push(near(316, -296))
      }
      break
    case "borrow":
      aim = near(0, -168)
      place(boss, -17, -134)
      if (squad) dummy(21, -56)
      break
    case "bastionSweep":
      aim = near(0, -260)
      place(ally, 36, -191)
      place(boss, -45, -228)
      if (squad) {
        place(spare, -32, -77)
        dummy(46, -112)
      }
      focus.push(near(-179, -231), near(180, -112))
      break
    case "carry":
      place(ally, 119, -132)
      place(boss, 105, -279)
      focus.push(near(134, 10))
      break
    case "advance":
      aim = near(8, -179)
      place(ally, -159, -53)
      place(boss, 92, -232)
      walk(1.18, ally, near(-80, -33))
      end = 8.95
      break
    case "gather":
      aim = near(16, -205)
      place(boss, -91, -227)
      dummy(75, -105)
      if (squad) charge(.12)
      focus.push(near(-14, -418), near(105, -333))
      break
    case "rewind":
      aim = near(0, -212)
      place(boss, -103, -192)
      moveFoe(.06, boss, near(55, -192))
      if (squad) dummy(93, -231)
      orderTime = .39
      focus.push(near(-183, -192), near(165, -348))
      break
    case "overlap":
      place(ally, -78, -251)
      place(boss, 45, -228)
      if (squad) dummy(-151, -233)
      charge(.12)
      break
    case "tripwire":
      aim = near(30, -222)
      place(boss, 104, -250)
      charge(1.18)
      break
    case "twinlane":
      aim = near(0, -271)
      place(boss, -43, -160)
      dummy(42, -201)
      focus.push(near(-175, -161), near(175, -204))
      break
    case "boundary":
      edge(actor, 0, 316)
      edge(ally, 103, 64)
      edge(spare, -96, 83)
      edge(boss, 137, 193)
      aim = { x: origin.x + 12, y: FIELD.top + 103 }
      shove(1.11, ally, 100)
      if (squad) shove(1.57, spare, 113)
      shove(2.16, ally, 100)
      focus.push({ x: ally.x, y: 56 })
      end = 10.83
      break
    case "pincer":
      aim = near(0, -288)
      place(boss, -57, -258)
      dummy(66, -346)
      if (squad) dummy(-25, -434)
      break
    case "ricochet":
      edge(actor, -44, 267)
      edge(ally, 54, 58)
      edge(boss, 113, 163)
      if (squad) {
        edge(spare, -130, 195)
        const watcher = dummy(13, 0)
        edge(watcher, -32, 103)
      }
      shove(1.14, ally, 100)
      focus.push({ x: boss.x, y: FIELD.top + 294 })
      break
    case "hammer":
      aim = near(-25, -253)
      place(boss, -114, -229)
      dummy(89, -274)
      charge(.12)
      focus.push(near(-260, -205), near(232, -304))
      break
    case "parallel":
      place(ally, 184, -56)
      place(boss, 92, -28)
      if (squad) {
        dummy(-66, 47)
        dummy(249, -108)
      }
      focus.push(near(-186, 111), near(357, -178))
      break
  }

  const mode = active.aim.mode
  const picked = mode === "enemy" ? boss : mode === "ally" || mode === "other" ? ally : undefined
  if (picked) aim = point(picked)
  at(orderTime, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, aim))
  if (squad && spare) {
    at(2.81, () => issueEdgeOrder(battle, spare, "skill", actor))
    end = Math.max(end, 3.8)
  }
  return { aim, picked, focus, duration: Math.ceil(end * 10) / 10 }
}
