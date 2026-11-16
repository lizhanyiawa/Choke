import { COOLDOWN, actionProblem, issueEdgeOrder, moveEdgeFighter, moveLanding, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive, EdgePassive, EdgePool } from "./catalog"
import { CENTER, FIELD, along, direction, edgeDistance, point, type EdgePoint } from "./geometry"
import { attackRange, basicAttack, damageUnit, newCast, previewSkillAreas, startMovement } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const up = { x: 0, y: -1 }
const side = { x: 1, y: 0 }
const slotOf = (passive: EdgePassive) => passive.id.slice("ranger/".length)

export function rangerPassivePartner(passive: EdgePassive) {
  const slot = slotOf(passive)
  if (slot === "UC/P8") return "healer"
  if (["C/P8", "UC/P5", "E/P7", "L/P5", "L/P8", "Radiant/P1", "Radiant/P3", "Radiant/P5", "Prismatic/P7", "Prismatic/P8"].includes(slot)) return "warden"
}

export function arrangeRangerPassive(
  battle: EdgeBattle, pool: EdgePool, passive: EdgePassive, at: Schedule, squad: boolean,
) {
  const [actor, ally, healer] = battle.team
  const { boss } = battle
  const slot = slotOf(passive)
  Object.assign(actor, { x: CENTER.x, y: CENTER.y + 160, hp: 725, maxHp: 1100, attack: 115, armor: 0 })
  Object.assign(boss, { ...along(actor, up, 220), hp: 2100, maxHp: 2100, attack: 115, armor: 0 })
  if (ally) Object.assign(ally, { x: actor.x + 111, y: actor.y - 38, hp: 650, maxHp: 1100, attack: 115, armor: 0 })
  if (healer) Object.assign(healer, { x: actor.x - 112, y: actor.y + 24, hp: 700, maxHp: 1100, attack: 115, armor: 0 })
  let end = 2.5
  let aim: EdgePoint = point(boss)
  let active: EdgeActive | undefined
  const time = (atTime: number, play: () => void) => {
    end = Math.max(end, atTime + 1.2)
    at(atTime, play)
  }
  const setup = (position: EdgePoint, ...extras: EdgePoint[]) => {
    Object.assign(boss, position)
    aim = point(boss)
    battle.preview!.targets = extras.map((where, i): EdgeUnit => ({ ...boss, ...where, id: `dummy-${i + 1}`, once: new Set() }))
    return battle.preview!.targets
  }
  const distance = (gap: number) => setup(along(actor, up, gap))
  const runSkill = (source: EdgeFighter, selected: EdgeActive, target: EdgeUnit | null, place?: EdgePoint) => {
    source.actives = [selected, source.actives[1]]
    issueEdgeOrder(battle, source, "skill", target, place)
  }
  const cast = (index: number, atTime = .22, location?: EdgePoint | (() => EdgePoint), target?: EdgeUnit) => {
    const chosen = pool.active[index - 1]
    active = chosen
    const picked = target ?? (chosen.aim.mode === "enemy" || chosen.aim.mode === "outside" ? boss : undefined)
    if (location && typeof location !== "function") aim = point(location)
    time(atTime, () => runSkill(actor, chosen, picked ?? null, typeof location === "function" ? location() : location))
  }
  const q = (atTime: number, target: EdgeUnit = boss, source = actor) => time(atTime, () => {
    if (target === boss) {
      issueEdgeOrder(battle, source, "basic", target)
    } else if (target.hp && !actionProblem(battle, source) && edgeDistance(source, target) <= attackRange(battle, source, target)) {
      source.actionAt = battle.time + source.actionCooldown
      battle.sharedAt = battle.time + COOLDOWN.shared
      basicAttack(battle, source, target)
    }
  })
  const move = (atTime: number, place: EdgePoint, unit = actor) => time(atTime, () => moveEdgeFighter(battle, unit, place))
  const foeMove = (atTime: number, place: EdgePoint | (() => EdgePoint)) => time(atTime, () => {
    const where = typeof place === "function" ? place() : place
    const landing = moveLanding(boss, where, battle)
    if (landing && !boss.force && !startMovement(battle, boss, landing, false, where)) boss.move = landing
  })
  const incoming = (atTime: number, raw: number, receiver = actor) => time(atTime, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", receiver, receiver), receiver, raw))
  const downAlly = (atTime: number) => {
    Object.assign(ally, along(boss, side, 101))
    incoming(atTime, ally.maxHp * 2, ally)
  }
  const allyPush = (atTime: number, gap = 91) => {
    Object.assign(ally, along(boss, up, -gap))
    time(atTime, () => runSkill(ally, ally.pool.active[0], boss))
  }
  const nearEdge = (gap: number, sourceY: number) => {
    actor.y = FIELD.top + sourceY
    setup({ x: actor.x, y: FIELD.top + gap })
  }

  switch (slot) {
    case "C/P1":
      cast(1)
      foeMove(1.12, along(actor, up, 288))
      q(5.4)
      break
    case "C/P2": cast(2); break
    case "C/P3": cast(3, 1.68); break
    case "C/P4": cast(4, .22, aim); q(5.4); break
    case "C/P5": distance(103); cast(5); incoming(1.45, 145); break
    case "C/P6": distance(242); q(.24); break
    case "C/P7":
      boss.range = 250
      move(.22, along(actor, side, 131))
      incoming(1.39, 100)
      end = Math.max(end, 4.24)
      break
    case "C/P8": downAlly(.36); q(1.12); break

    case "UC/P1":
      setup(along(actor, up, 122), along(actor, up, 237))
      cast(1, .22, aim)
      incoming(1.52, 150)
      break
    case "UC/P2": distance(59); cast(2, .22, aim); q(5.42); break
    case "UC/P3": distance(172); cast(3); q(5.42); break
    case "UC/P4": cast(4, .22, along(actor, side, 96)); break
    case "UC/P5": {
      const pad = aim
      setup(along(pad, up, 122))
      cast(5, .22, pad)
      foeMove(.48, pad)
      break
    }
    case "UC/P6": distance(149); move(.22, along(actor, up, -148)); q(1.43); break
    case "UC/P7": distance(258); q(.23); break
    case "UC/P8": {
      const medic = squad ? healer : ally
      time(.22, () => runSkill(medic, medic.pool.active[2], actor))
      move(1.18, along(actor, side, 157))
      incoming(2.54, 240)
      break
    }

    case "R/P1":
      setup(along(actor, up, 206), { x: actor.x + 103, y: actor.y - 248 })
      cast(1)
      break
    case "R/P2": cast(2, .22, aim); q(5.43); break
    case "R/P3": cast(3, .22, aim); break
    case "R/P4": nearEdge(137, 339); cast(4); break
    case "R/P5":
      cast(5)
      foeMove(.92, along(boss, side, 174))
      q(5.43)
      break
    case "R/P6": {
      const [second] = setup(along(actor, up, 210), { x: actor.x + 118, y: actor.y - 197 })
      q(.22)
      q(5.43, second)
      break
    }
    case "R/P7": nearEdge(-26, 271); q(.24); break
    case "R/P8": distance(186); move(.24, along(actor, side, 147)); incoming(1.56, 170); break

    case "E/P1": {
      const center = aim
      setup(along(center, side, 72))
      cast(1, .22, center)
      break
    }
    case "E/P2": {
      const center = aim
      setup(along(center, side, 27), along(actor, up, 180))
      cast(2, .22, center)
      q(5.43)
      break
    }
    case "E/P3": cast(3, .22, aim); incoming(1.65, 178); break
    case "E/P4": {
      const center = aim
      const [, second] = previewSkillAreas(battle, actor, pool.active[3], center)
      setup(center, along(second.center, direction(center, second.center), 84))
      cast(4, .22, center)
      break
    }
    case "E/P5":
      cast(5)
      foeMove(.9, along(boss, side, 83))
      foeMove(2.12, () => along(boss, side, 110))
      end = Math.max(end, 4.88)
      break
    case "E/P6": distance(292); cast(1, .22, aim); break
    case "E/P7": {
      const center = aim
      const [flank] = setup(along(center, up, 19), along(center, side, 76))
      Object.assign(ally, { x: flank.x + 57, y: flank.y + 74 })
      cast(1, .22, center)
      q(1.53, flank, ally)
      break
    }
    case "E/P8":
      distance(115)
      incoming(.31, 100)
      foeMove(.7, along(actor, up, 300))
      q(2.91)
      break

    case "L/P1": {
      const trap = aim
      setup(along(trap, up, 112))
      cast(1, .22, trap)
      foeMove(.48, trap)
      foeMove(2.34, () => along(boss, side, 190))
      break
    }
    case "L/P2": {
      const center = aim
      setup(along(center, side, 28))
      cast(2, .22, center)
      break
    }
    case "L/P3": nearEdge(57, 311); cast(3, .22, along(boss, up, -56)); break
    case "L/P4": cast(4, .22, aim); end = Math.max(end, 3.18); break
    case "L/P5":
      Object.assign(ally, { x: aim.x + 66, y: aim.y + 61 })
      cast(5, .22, aim)
      break
    case "L/P6": distance(267); q(.26); break
    case "L/P7": distance(157); move(.22, along(actor, up, -129)); incoming(1.48, 100); break
    case "L/P8": distance(142); allyPush(.25); q(1.51); break

    case "Radiant/P1":
      cast(1)
      allyPush(1.69)
      break
    case "Radiant/P2": {
      const center = aim
      setup(along(center, side, 117), along(center, side, 158))
      cast(2, .22, center)
      break
    }
    case "Radiant/P3":
      Object.assign(ally, along(boss, up, -94))
      cast(3, .22, undefined, ally)
      q(1.25, boss, ally)
      break
    case "Radiant/P4": nearEdge(131, 347); cast(4, .22, aim); break
    case "Radiant/P5": {
      Object.assign(ally, along(boss, up, -92))
      time(.14, () => {
        const axis = direction(boss, ally)
        battle.telegraph = { from: point(boss), to: along(boss, axis, 265), direction: axis, until: battle.time + 2.5 }
      })
      cast(5, .43, aim)
      q(1.55, boss, ally)
      break
    }
    case "Radiant/P6": cast(1); q(5.43); break
    case "Radiant/P7":
      nearEdge(180, 66)
      time(.72, () => basicAttack(battle, boss, actor, true))
      break
    case "Radiant/P8":
      setup({ x: actor.x - 92, y: actor.y - 66 }, { x: actor.x + 91, y: actor.y - 71 })
      incoming(.46, 100)
      incoming(1.51, 100)
      break

    case "Prismatic/P1":
      distance(454)
      cast(1, .22, aim)
      move(1.43, along(actor, up, 188))
      q(5.45)
      break
    case "Prismatic/P2":
      actor.y = FIELD.bottom - 119
      setup(along(actor, up, 599), along(actor, up, 286))
      cast(2, .22, aim)
      break
    case "Prismatic/P3": {
      const center = aim
      setup(along(center, side, 146))
      cast(3, .22, center)
      break
    }
    case "Prismatic/P4":
      setup(CENTER)
      cast(4, .22, { x: CENTER.x - 59, y: CENTER.y - 40 })
      break
    case "Prismatic/P5": {
      const center = aim
      const [area] = previewSkillAreas(battle, actor, pool.active[4], center)
      const [a, b, c] = area.parts.map((part) => part.kind === "polygon" ?
        part.points.reduce((sum, p) => ({ x: sum.x + p.x / part.points.length, y: sum.y + p.y / part.points.length }), { x: 0, y: 0 })
        : part.center)
      const axis = direction(actor, center)
      setup(c, a, along(b, axis, 51), along(b, axis, -49))
      cast(5, .22, center)
      break
    }
    case "Prismatic/P6": distance(161); move(.22, along(actor, up, -154)); q(1.48); break
    case "Prismatic/P7":
      nearEdge(58, 37)
      actor.x += 83
      allyPush(.25, 84)
      q(1.57)
      break
    case "Prismatic/P8":
      downAlly(.36)
      q(1.17)
      cast(1, 6.36, () => point(boss))
      break
  }
  if (healer && edgeDistance(healer, actor) > 270) Object.assign(healer, { x: actor.x - 107, y: actor.y + 83 })
  if (squad && ally && !rangerPassivePartner(passive) && edgeDistance(ally, actor) > 270)
    Object.assign(ally, { x: actor.x + 107, y: actor.y + 48 })
  if (squad && healer && slot !== "UC/P8") {
    at(end - .24, () => runSkill(healer, healer.pool.active[0], actor))
    end += .45
  }
  return { active, aim, duration: Math.ceil(end * 10) / 10 }
}
