import { issueEdgeOrder, moveEdgeFighter, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import { CENTER, FIELD, along, direction, inside, point, type EdgePoint } from "./geometry"
import type { EdgeActive } from "./catalog"
import { bulwarkChoreography, type BulwarkMotif } from "./bulwarkChoreo"
import { basicAttack, beforeBossBasic, bossTarget, damageUnit, history, newCast, shoveUnit, startMovement } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const east = { x: 1, y: 0 }
const withAlly = new Set<BulwarkMotif>([
  "pauldron", "catchstrap", "twochocks", "drum", "portal", "seal", "handoff", "bracewire", "twinhull", "rampart",
  "phalanx", "wake", "shoulders", "shore", "citadel", "bastions", "seawall", "accord", "island",
])

export function bulwarkPreviewPartner(active: EdgeActive) {
  const art = bulwarkChoreography(active.id)
  return art && withAlly.has(art.motif)
}

export function arrangeBulwarkPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const motif = bulwarkChoreography(active.id)!.motif
  const [actor, ally, healer] = battle.team
  const { boss } = battle
  const origin = { x: CENTER.x - 52, y: CENTER.y + 180 }
  const near = (dx: number, dy: number) => inside({ x: origin.x + dx, y: origin.y + dy })
  const place = (unit: EdgeUnit | undefined, dx: number, dy: number) => { if (unit) Object.assign(unit, near(dx, dy)) }
  const atPoint = (unit: EdgeUnit | undefined, p: EdgePoint) => { if (unit) Object.assign(unit, p) }
  const spare = (dx: number, dy: number) => {
    const target = { ...boss, ...near(dx, dy), id: "dummy-1" as const, once: new Set<string>() }
    battle.preview!.targets.push(target)
    return target
  }
  let end = 2.65
  const queue = (time: number, play: () => void) => {
    end = Math.max(end, time + 1)
    at(time, play)
  }
  const hit = (time: number, target: EdgeUnit, amount: number, source: EdgeUnit = boss, push = 0) => queue(time, () => {
    const cast = newCast(battle, source, "enemy", target, target)
    damageUnit(battle, cast, target, amount)
    if (push) shoveUnit(battle, cast, target, push)
  })
  const shove = (time: number, target: EdgeUnit, length: number, axis = east) => queue(time, () =>
    shoveUnit(battle, newCast(battle, boss, "enemy", target, target), target, length, "", undefined, false, axis))
  const walk = (time: number, target: EdgeFighter, landing: EdgePoint) => queue(time, () =>
    moveEdgeFighter(battle, target, landing))
  const telegraph = () => {
    const axis = direction(boss, actor)
    battle.telegraph = { from: point(boss), to: along(boss, axis, 240), direction: axis, until: 1.62 }
    at(1.62, () => { battle.telegraph = null })
  }
  battle.team.forEach((unit, index) => {
    unit.maxHp = 1100
    unit.hp = index === 0 ? 730 : 590 + index * 45
  })
  boss.maxHp = boss.hp = 1900
  place(actor, 0, 0)
  place(ally, 123, -31)
  place(healer, -152, 33)
  place(boss, 4, -156)
  let aim = near(18, -182)
  let picked: EdgeUnit | undefined

  switch (motif) {
    case "lockplate":
      place(boss, -86, -156)
      hit(.93, actor, 80)
      hit(1.88, actor, 255)
      break
    case "mantle":
      place(boss, 104, -135)
      hit(1.05, actor, 170)
      hit(2.01, actor, 115)
      break
    case "pauldron":
      place(boss, 146, -157)
      hit(1.12, ally, 210)
      break
    case "rimstrike": place(boss, 38, -105); break
    case "rivets":
      if (squad) history(battle, actor).standAt = -2
      break
    case "wedges":
      place(boss, -104, -108)
      place(ally, 145, 47)
      hit(.86, actor, 165)
      shove(1.48, actor, 100)
      break
    case "shieldstep":
      aim = near(58, -64)
      place(ally, 154, 38)
      break
    case "catchstrap":
      place(boss, 155, -172)
      hit(1.18, ally, 240)
      break
    case "anvil":
      aim = near(0, -154)
      place(boss, 13, -121)
      if (squad) spare(-21, -53)
      break
    case "axle":
      place(boss, -112, -86)
      place(ally, 130, 78)
      shove(1.16, actor, 100)
      break
    case "barbs": {
      place(boss, 0, -125)
      const second = squad ? spare(-112, -91) : boss
      hit(.94, actor, 105)
      hit(1.95, actor, 105, second)
      break
    }
    case "stakes":
      aim = near(21, -193)
      place(boss, 177, -216)
      queue(.69, () => {
        const landing = near(62, -181)
        if (!startMovement(battle, boss, landing, false)) boss.move = landing
      })
      break
    case "cracked":
      place(boss, 0, -96)
      if (squad) spare(-85, -45)
      hit(.86, actor, 72)
      hit(1.76, actor, 250)
      break
    case "twochocks":
      place(boss, 132, -184)
      place(ally, 112, 20)
      shove(.96, ally, 100)
      shove(1.92, ally, 100, { x: 0, y: -1 })
      break
    case "stomp":
      place(boss, -37, -89)
      place(ally, 131, 112)
      if (squad) spare(93, -20)
      break
    case "drum":
      place(boss, 10, -111)
      place(ally, 97, -119)
      if (squad) spare(-132, -44)
      queue(1.17, () => {
        const target = bossTarget(battle, true)
        if (target) {
          const provoked = beforeBossBasic(battle, target)
          basicAttack(battle, boss, target, true, provoked)
        }
      })
      break
    case "portal":
      place(ally, 179, -177)
      if (squad) place(healer, -54, -230)
      walk(1.16, ally, near(76, -173))
      break
    case "seal":
      place(boss, 44, -163)
      hit(.93, actor, 160)
      hit(1.64, ally, 195)
      hit(2.44, ally, 195)
      break
    case "handoff":
      actor.shield = 300
      actor.shieldUntil = 8
      break
    case "muffle":
      place(boss, -53, -43)
      place(ally, 124, 89)
      if (squad) spare(93, -57)
      telegraph()
      break
    case "bracewire":
      place(ally, 196, -49)
      place(boss, 157, -171)
      hit(1.26, ally, 340)
      break
    case "twinhull":
      place(ally, 168, -76)
      place(boss, 94, -174)
      hit(1.22, squad ? actor : ally, 370)
      break
    case "spareplate":
      if (squad) {
        actor.shield = 248
        actor.shieldUntil = 8
      }
      break
    case "rampart":
      aim = near(18, -174)
      place(ally, 103, -128)
      place(boss, -72, -180)
      if (squad) spare(134, -224)
      hit(1.15, ally, 240)
      break
    case "breach":
      aim = near(0, -202)
      place(boss, 12, -148)
      if (squad) spare(-26, -67)
      telegraph()
      break
    case "phalanx":
      place(ally, 108, 63)
      place(boss, 173, -54)
      hit(.86, ally, 220)
      walk(1.18, actor, near(-27, -113))
      hit(2.18, ally, 220)
      end = Math.max(end, 6.55)
      break
    case "wake":
      place(ally, 141, -153)
      place(healer, 151, -3)
      walk(1.15, ally, near(72, -58))
      break
    case "shoulders":
      place(ally, 112, -53)
      place(boss, 48, -173)
      hit(.97, ally, 220)
      hit(1.84, actor, 195)
      hit(2.38, ally, 220)
      break
    case "overhead":
      aim = near(53, -257)
      place(boss, -12, -271)
      if (squad) spare(124, -225)
      break
    case "shore": {
      atPoint(ally, { x: origin.x + 164, y: FIELD.top - 54 })
      atPoint(boss, { x: origin.x + 29, y: FIELD.top + 27 })
      shove(1.08, ally, 100)
      walk(2.08, ally, { x: ally.x + 45, y: FIELD.top + 66 })
      end = Math.max(end, 4.1)
      break
    }
    case "citadel":
      aim = near(38, -185)
      place(ally, 135, -164)
      place(boss, 48, -355)
      hit(.96, ally, 300)
      hit(1.72, actor, 410)
      hit(2.59, ally, 620)
      break
    case "bastions":
      aim = near(0, -191)
      place(boss, 224, -245)
      place(ally, -201, -49)
      place(healer, 145, -194)
      walk(1.14, ally, near(-155, -115))
      break
    case "seawall":
      aim = near(19, -202)
      place(boss, 107, -210)
      place(ally, 108, -85)
      if (squad) spare(-104, -210)
      hit(1.62, ally, 540)
      break
    case "accord":
      place(ally, 175, -551)
      place(boss, 29, -495)
      hit(1.33, ally, 410)
      hit(2.10, ally, 260)
      break
    case "island":
      aim = near(33, -187)
      place(boss, -55, -273)
      place(ally, 143, -151)
      place(healer, -80, -121)
      if (squad) spare(137, -258)
      shove(1.58, ally, 100)
      break
  }

  const { mode } = active.aim
  if (mode === "self") picked = actor
  else if (mode === "enemy") picked = boss
  else if (mode === "ally" || mode === "other") picked = ally
  const target = picked ?? null
  if (picked) aim = point(picked)
  at(.2, () => issueEdgeOrder(battle, actor, "skill", target, aim))
  if (squad && healer) {
    at(2.84, () => issueEdgeOrder(battle, healer, "skill", actor))
    end = Math.max(end, 3.85)
  }
  return { aim, picked, duration: Math.ceil(end * 10) / 10 }
}
