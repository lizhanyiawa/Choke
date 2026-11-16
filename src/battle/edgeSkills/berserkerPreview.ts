import { issueEdgeOrder, moveLanding, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, along, direction, inside, left, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit, startMovement } from "./runtime"
import { berserkerChoreography } from "./berserkerChoreo"

type Schedule = (time: number, play: () => void) => void
const east = { x: 1, y: 0 }

export function arrangeBerserkerPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const motif = berserkerChoreography(active.id)!.motif
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const origin = { x: CENTER.x - 61, y: CENTER.y + 172 }
  const focus: EdgePoint[] = []
  const near = (dx: number, dy: number) => inside({ x: origin.x + dx, y: origin.y + dy })
  const place = (unit: EdgeUnit | undefined, dx: number, dy: number) => { if (unit) Object.assign(unit, near(dx, dy)) }
  const rim = (unit: EdgeUnit | undefined, dx: number, depth: number) => {
    if (unit) Object.assign(unit, { x: origin.x + dx, y: FIELD.top + depth })
  }
  const dummy = (dx: number, dy: number) => {
    const id = ("dummy-" + (battle.preview!.targets.length + 1)) as `dummy-${number}`
    const unit = { ...boss, ...near(dx, dy), id, once: new Set<string>() }
    battle.preview!.targets.push(unit)
    return unit
  }
  let duration = 2.85
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1)
    at(time, play)
  }
  const hit = (time: number, amount: number, source = boss) =>
    queue(time, () => damageUnit(battle, newCast(battle, source, "enemy", actor, actor), actor, amount))
  const shove = (time: number, distance: number) => queue(time, () =>
    shoveUnit(battle, newCast(battle, boss, "enemy", actor, actor), actor, distance, "", undefined, false, east))
  const walk = (time: number, unit: EdgeUnit, requested: EdgePoint) => queue(time, () => {
    const landing = moveLanding(unit, requested, battle)
    if (landing && !startMovement(battle, unit, landing, false, requested)) unit.move = landing
  })
  const basic = (time: number, unit: EdgeFighter = actor) =>
    queue(time, () => issueEdgeOrder(battle, unit, "basic", boss))
  const setupQ = () => {
    place(boss, 37, -128)
    basic(5.36)
  }
  const placeShield = (amount: number) => { boss.shield = boss.shieldStart = amount; boss.shieldUntil = 5 }
  for (const [i, unit] of battle.team.entries()) {
    unit.maxHp = 1100
    unit.hp = i ? 652 - i * 44 : 635
  }
  boss.hp = boss.maxHp = 2800
  place(actor, 0, 0)
  place(ally, 155, -43)
  place(spare, -149, 41)
  place(boss, 30, -141)
  let aim = near(0, -184)
  let orderAt = .20

  switch (motif) {
    case "chop":
      place(boss, 55, -129)
      break
    case "hack":
      place(boss, -51, -113)
      focus.push(near(-89, -193))
      break
    case "answer":
      place(boss, 38, -105)
      if (squad) hit(.62, 112, dummy(-158, -141))
      hit(1.16, 184)
      break
    case "pounce":
      aim = near(43, -78)
      place(boss, 17, -126)
      if (squad) dummy(96, -90)
      break
    case "numb":
      setupQ()
      break
    case "siphon":
      place(boss, 59, -147)
      if (squad) placeShield(46)
      break
    case "scar":
      place(boss, -36, -151)
      walk(.67, boss, near(-133, -254))
      focus.push(near(-155, -263))
      break
    case "roar":
      place(boss, 31, -82)
      dummy(-85, -39)
      if (squad) dummy(86, -28)
      break
    case "hook":
      place(boss, -55, -161)
      break
    case "shoulder":
      setupQ()
      break
    case "bloodprice":
      place(boss, -35, -168)
      break
    case "redline":
      aim = near(0, -190)
      place(boss, 21, -98)
      if (squad) dummy(-27, -171)
      focus.push(near(-15, -278))
      break
    case "wound":
      orderAt = .40
      place(boss, 50, -159)
      hit(.13, 161)
      break
    case "hookdrop":
      aim = near(-42, -115)
      place(boss, -89, -164)
      if (squad) dummy(23, -155)
      break
    case "triage":
      actor.hp = 472
      setupQ()
      break
    case "wheel":
      place(boss, -68, -89)
      if (squad) dummy(88, -42)
      shove(.40, 65)
      break
    case "needle":
      aim = near(0, -226)
      place(boss, 24, -106)
      dummy(-24, -197)
      focus.push(near(17, -275))
      break
    case "fracture":
      aim = near(33, -198)
      place(boss, 9, -170)
      dummy(110, -219)
      if (squad) dummy(-113, -237)
      break
    case "flank":
      place(boss, 60, -182)
      focus.push(near(164, -163))
      break
    case "grit":
      place(boss, 93, -131)
      hit(1.10, 281)
      break
    case "breach":
      aim = near(0, -156)
      place(boss, 30, -128)
      if (squad) dummy(-37, -52)
      focus.push(near(148, -129), near(-150, -58))
      break
    case "crater":
      aim = near(46, -158)
      place(boss, 104, -200)
      if (squad) dummy(-32, -186)
      focus.push(near(212, -257), near(-151, -230))
      break
    case "armorbreak":
      place(boss, 42, -191)
      placeShield(squad ? 161 : 69)
      break
    case "backedge": {
      aim = near(0, -291)
      place(boss, 19, -126)
      const late = dummy(-82, -225)
      walk(.48, late, near(-17, -231))
      if (squad) dummy(29, -272)
      break
    }
    case "converge":
      place(boss, -51, -96)
      dummy(93, -62)
      if (squad) dummy(-97, 53)
      break
    case "boil":
      place(boss, 0, -94)
      if (squad) dummy(95, -115)
      basic(5.36)
      focus.push(near(0, -284), near(108, -221))
      break
    case "wildfire":
      aim = near(31, -184)
      place(boss, -10, -124)
      if (squad) dummy(43, -60)
      break
    case "rimrage":
      rim(actor, -69, 158)
      rim(boss, 43, -67)
      rim(ally, 159, 102)
      rim(spare, -179, 217)
      focus.push({ x: boss.x + 43, y: 53 })
      break
    case "pulseaxe":
      place(boss, 47, -106)
      if (squad) dummy(-111, -72)
      shove(.44, 67)
      break
    case "emberwatch":
      actor.hp = 514
      place(boss, -33, -91)
      if (squad) dummy(85, -48)
      hit(.78, 134)
      hit(1.43, 282)
      break
    case "trinity":
      place(boss, 145, -145)
      place(ally, 132, 64)
      focus.push(near(207, -222), near(37, 18))
      break
    case "crossfire": {
      aim = near(36, -216)
      const axis = direction(actor, aim)
      const flank = left(axis)
      Object.assign(boss, along(aim, flank, 14))
      Object.assign(dummy(0, 0), along(aim, axis, 94))
      if (squad) {
        Object.assign(dummy(0, 0), along(aim, flank, 101))
        Object.assign(dummy(0, 0), along(along(aim, flank, -90), axis, 93))
      }
      break
    }
    case "frontier":
      rim(actor, 0, 303)
      rim(boss, 9, 105)
      rim(ally, 169, 221)
      rim(spare, -154, 271)
      aim = { x: actor.x, y: FIELD.top + 87 }
      if (squad) rim(dummy(0, 0), -37, 166)
      focus.push({ x: boss.x, y: 55 })
      break
    case "furnace":
      actor.hp = 1081
      place(boss, 112, -312)
      walk(.53, boss, near(181, -309))
      focus.push(near(193, -309))
      break
    case "laststand":
      place(boss, -56, -101)
      if (squad) dummy(87, -59)
      hit(.82, 124)
      hit(1.42, 680)
      hit(2.33, 114)
      break
  }

  const picked = active.aim.mode === "enemy" ? boss : undefined
  if (picked) aim = point(picked)
  at(orderAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, aim))
  return { aim, picked, focus, duration: Math.ceil(duration * 10) / 10 }
}
