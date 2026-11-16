import { issueEdgeOrder, moveEdgeFighter, moveLanding, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, along, direction, inside, left, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit, startMovement } from "./runtime"
import { paladinChoreography } from "./paladinChoreo"

type Schedule = (time: number, play: () => void) => void

const partners = new Set([
  "lamp", "smallguard", "vigil", "lightline", "shoulder", "burning", "approach", "prayer", "mirrorward",
  "sanctuary", "chain", "gate", "uplift", "handoff", "circle", "verdict", "bond", "sideline", "rally",
  "twinbeam", "wings", "swapwing", "spear", "bloomward", "horizon", "dawn", "doublehalo", "chorus",
])
export const paladinPreviewPartner = (active: EdgeActive) => partners.has(paladinChoreography(active.id)?.motif ?? "")

export function arrangePaladinPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const motif = paladinChoreography(active.id)!.motif
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const origin = { x: CENTER.x - 46, y: CENTER.y + 172 }
  const focus: EdgePoint[] = []
  const near = (dx: number, dy: number) => inside({ x: origin.x + dx, y: origin.y + dy })
  const place = (unit: EdgeUnit | undefined, dx: number, dy: number) => { if (unit) Object.assign(unit, near(dx, dy)) }
  const dummy = (dx: number, dy: number) => {
    const id = ("dummy-" + (battle.preview!.targets.length + 1)) as `dummy-${number}`
    const unit = { ...boss, ...near(dx, dy), id, once: new Set<string>() }
    battle.preview!.targets.push(unit)
    return unit
  }
  let aim = near(0, -186)
  let duration = 3.2
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.2)
    at(time, play)
  }
  const attack = (time: number, raw: number, targets: EdgeUnit[], order: "basic" | "enemy" = "enemy", style = "") => queue(time, () => {
    const cast = newCast(battle, boss, order, targets[0] ?? boss, targets[0])
    for (const target of targets) damageUnit(battle, cast, target, raw, undefined, false, style)
  })
  const hit = (time: number, raw: number, target: EdgeUnit = actor) => attack(time, raw, [target])
  const shove = (time: number, target: EdgeUnit, length: number, axis: EdgePoint = { x: 1, y: 0 }) => queue(time, () =>
    shoveUnit(battle, newCast(battle, boss, "enemy", target, target), target, length, "", undefined, false, axis))
  const walk = (time: number, target: EdgeFighter, end: EdgePoint) => queue(time, () => moveEdgeFighter(battle, target, end))
  const walkFoe = (time: number, end: EdgePoint) => queue(time, () => {
    const landing = moveLanding(boss, end, battle)
    if (landing && !startMovement(battle, boss, landing, false, end)) boss.move = landing
  })
  const basic = (time: number, member: EdgeFighter) => queue(time, () => issueEdgeOrder(battle, member, "basic", boss))
  const lend = (unit: EdgeUnit, value: number) => { unit.shield = unit.shieldStart = value; unit.shieldUntil = 10 }

  for (const [i, member] of battle.team.entries()) {
    member.maxHp = 1100
    member.hp = i ? 604 - i * 47 : 644
  }
  boss.hp = boss.maxHp = 3200
  place(actor, 0, 0)
  place(boss, 35, -138)
  place(ally, 140, 38)
  place(spare, -142, 52)

  switch (motif) {
    case "sunedge":
      place(boss, 42, -117); focus.push(near(59, -179))
      break
    case "lamp":
      place(ally, 137, -78); place(boss, 23, -199)
      break
    case "smallguard":
      place(ally, 116, -90); hit(1.15, 117, ally)
      break
    case "swordpress":
      place(boss, -42, -126); focus.push(near(-87, -207))
      break
    case "banner": {
      const wearer = ally ?? actor
      place(ally, 77, -45); place(boss, -36, -145)
      hit(.94, 196, wearer)
      walk(1.51, wearer, near(145, 45))
      hit(2.57, 196, wearer)
      focus.push(near(164, 43))
      duration = 5.55
      break
    }
    case "vigil":
      place(ally, -147, -135); place(boss, 4, -204)
      hit(1.16, 123, ally)
      break
    case "lightline":
      aim = near(0, -211); place(ally, -25, -82); place(boss, 21, -142)
      if (squad) place(spare, -22, -201)
      break
    case "cleanse":
      place(boss, -45, -149); lend(boss, squad ? 26 : 67)
      break
    case "shoulder":
      place(ally, -116, -77); place(boss, -55, -168)
      shove(1.19, ally, 104, { x: -.8, y: -.6 })
      focus.push(near(-202, -137))
      break
    case "oathshield":
      place(boss, 37, -71)
      if (squad) dummy(-61, -39)
      hit(.95, 90); hit(1.68, 231)
      break
    case "vow":
      place(boss, 56, -169); place(ally, 118, -66); place(spare, -122, 49)
      attack(.79, 110, [actor], "basic")
      attack(1.46, 249, battle.team)
      break
    case "burning":
      place(boss, 35, -170); place(ally, -42, -121)
      basic(1.21, ally)
      focus.push(near(83, -209))
      break
    case "approach":
      place(ally, 121, -135); place(boss, 66, -228)
      hit(1.3, 137, ally)
      break
    case "prayer":
      aim = near(22, -184); place(boss, 57, -210); place(ally, -52, -160)
      if (squad) dummy(95, -133)
      break
    case "mirrorward":
      place(ally, 112, -113); place(boss, -32, -201)
      hit(1.07, 270, ally); hit(2.09, 148, ally)
      break
    case "sanctuary":
      aim = near(8, -128); place(boss, -59, -179); place(ally, 96, -128)
      if (squad) { dummy(15, -232); place(spare, -86, -66) }
      break
    case "chain":
      place(boss, 33, -188); place(ally, -77, -163); ally.hp = 393
      if (squad) { place(spare, 106, -211); spare.hp = 541 }
      break
    case "gate":
      aim = near(0, -187); place(ally, -151, -158); place(boss, 87, -236)
      if (squad) place(spare, 54, -223)
      walk(1.19, ally, near(-63, -145))
      walk(3.92, ally, near(-157, -136))
      walk(6.59, ally, near(-64, -149))
      duration = 8.68
      break
    case "uplift":
      place(boss, -44, -91); place(ally, 86, -28)
      if (squad) dummy(87, -81)
      shove(1.3, ally, 100)
      focus.push(near(173, -24), near(-97, -171), near(151, -139))
      break
    case "handoff":
      place(ally, 149, -117); place(boss, -34, -198)
      lend(actor, 310)
      hit(1.19, 122, ally)
      break
    case "circle":
      aim = near(0, -195); place(boss, 45, -374); place(ally, -65, -158)
      if (squad) dummy(82, -205)
      walkFoe(1.07, near(39, -252))
      duration = 8.77
      break
    case "verdict":
      aim = near(31, -218); place(boss, 56, -260); place(ally, -72, -190)
      if (squad) dummy(-23, -304)
      focus.push(near(103, -364), near(-95, -397))
      break
    case "bond":
      place(ally, 138, -101); place(boss, 21, -205)
      hit(.98, 133, ally); hit(1.65, 273, ally); hit(2.32, 144, ally)
      break
    case "sideline":
      aim = near(0, -266); place(boss, 32, -171); place(ally, -26, -85)
      if (squad) { dummy(-34, -232); place(spare, 27, -238) }
      focus.push(near(151, -171), near(-156, -232))
      break
    case "rally":
      place(ally, 116, -52); ally.hp = ally.maxHp
      if (spare) { place(spare, -114, -56); spare.hp = spare.maxHp - 65 }
      break
    case "twinbeam":
      aim = near(0, -308); place(boss, 22, -238); place(ally, -24, -133)
      if (squad) place(spare, 29, -308)
      shove(1.42, ally, 100); focus.push(near(118, -133))
      break
    case "wings":
      aim = near(17, -237); place(boss, 50, -265); place(ally, -84, -187)
      if (squad) { dummy(-54, -327); place(spare, 118, -208) }
      break
    case "swapwing":
      place(ally, 128, -129); place(boss, 65, -63)
      if (squad) dummy(188, -159)
      break
    case "spear":
      place(boss, 44, -269); place(ally, 116, -118)
      hit(1.19, 175, ally); hit(2.1, 152, ally)
      break
    case "bloomward":
      place(ally, 126, -119); place(boss, 22, -223)
      hit(1.22, 222, ally); hit(2.13, 150, ally)
      break
    case "accord":
      place(boss, 15, -249); place(ally, 166, -126); place(spare, -157, -99)
      attack(.96, 69, [actor], "enemy", "dot")
      attack(1.46, 672, battle.team)
      break
    case "horizon": {
      aim = { x: actor.x + 257, y: FIELD.top + 41 }
      const axis = direction(actor, aim)
      const onLane = (depth: number, offset: number) => along(along(actor, axis, depth), left(axis), offset)
      Object.assign(boss, onLane(386, 31)); Object.assign(ally, onLane(173, -25))
      if (squad) {
        Object.assign(dummy(0, 0), onLane(271, -29))
        Object.assign(spare, onLane(517, -39))
      }
      break
    }
    case "dawn":
      aim = near(12, -234); place(boss, 12, -380); place(ally, 103, -224)
      if (squad) place(spare, -91, -182)
      attack(1.22, 191, spare ? [ally, spare] : [ally])
      break
    case "doublehalo":
      place(ally, 161, -175); place(boss, 81, -88)
      if (squad) { dummy(-64, -48); dummy(215, -241); place(spare, 104, 28) }
      break
    case "chorus":
      place(boss, 26, -105); place(ally, -43, -96); place(spare, 80, -147)
      basic(1.27, ally)
      if (squad) basic(2.31, spare)
      walkFoe(3.31, near(12, -102))
      basic(5.38, actor)
      focus.push(near(68, -181))
      break
  }

  const picked = active.aim.mode === "enemy" ? boss : active.aim.mode === "ally" || active.aim.mode === "other" ? ally : undefined
  if (picked) aim = point(picked)
  at(.2, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, aim))
  return { aim, picked, focus, duration: Math.ceil(duration * 100) / 100 }
}
