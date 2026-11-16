import type { Rarity } from "@/card/types"
import type { SubJobId } from "@/card/jobs"
import { finishBossCharge, issueEdgeOrder, moveEdgeFighter, moveLanding, startUnitCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { BOARD, CENTER, FIELD, along, direction, inside, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, shoveUnit, startMovement } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const short = (id: string) => id.slice("assassin/".length)
const slots: Record<Rarity, readonly number[]> = {
  C: [0, -1, 2, 3, 4, -1, -1, -1], UC: [0, 1, 2, 3, 4, -1, -1, -1],
  R: [0, 1, 2, 3, 4, -1, 1, 2], E: [0, 1, 2, 0, 4, -1, 2, -1],
  L: [0, 1, 2, 3, 4, -1, -1, -1], Radiant: [0, 1, 2, 3, 4, -1, -1, -1],
  Prismatic: [0, 1, 2, 3, 4, -1, 0, -1],
}
const assisted = new Set(["C/P8", "UC/P7", "UC/G2", "R/P1", "R/P4", "R/G1", "E/P6", "L/P2", "L/P4", "L/G2",
  "Radiant/P4", "Radiant/P7", "Radiant/G2", "Prismatic/P4", "Prismatic/P5", "Prismatic/P7", "Prismatic/P8", "Prismatic/G1", "Prismatic/G2"])
export const assassinTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]
export function assassinTraitPartners(id: string, squad: boolean) {
  const key = short(id), count = squad ? 2 : assisted.has(key) ? 1 : 0
  return Array.from({ length: count }, (_, i): { job: SubJobId; rarity: Rarity; active: [number, number] } => {
    if (i === 0 && key === "E/P6") return { job: "spellbreaker", rarity: "UC", active: [0, 1] }
    if (i === 0 && key === "Radiant/P7") return { job: "assassin", rarity: "UC", active: [0, 1] }
    return { job: "healer", rarity: "C", active: [0, 2] }
  })
}

export function arrangeAssassinTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const key = short(id), [actor, ally, spare] = battle.team, { boss } = battle
  const origin = { x: CENTER.x - 36, y: CENTER.y + 158 }
  const focus: EdgePoint[] = []
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  let aim = near(0, -210), duration = 3.5, orderAt = .22
  const picked = ["enemy", "outside"].includes(active?.aim.mode ?? "") ? boss : ["ally", "other"].includes(active?.aim.mode ?? "") ? ally ?? actor : undefined
  const queue = (time: number, play: () => void) => { duration = Math.max(duration, time + 1.2); at(time, play) }
  const dummy = (x: number, y: number) => {
    const unit: typeof boss = { ...boss, ...near(x, y), id: ("dummy-" + (battle.preview!.targets.length + 1)) as `dummy-${number}`,
      once: new Set<string>(), force: null, move: null, telegraph: null }
    battle.preview!.targets.push(unit); return unit
  }
  const basic = (time: number, who: EdgeFighter = actor, target: EdgeUnit = boss) => queue(time, () => issueEdgeOrder(battle, who, "basic", target))
  const walk = (time: number, who: EdgeFighter, to: EdgePoint) => { focus.push(to); queue(time, () => moveEdgeFighter(battle, who, to)) }
  const enemyWalk = (time: number, to: EdgePoint) => {
    focus.push(to)
    queue(time, () => {
      const landing = moveLanding(boss, to, battle)
      if (landing && !startMovement(battle, boss, landing, false, to)) boss.move = landing
      boss.moveAt = battle.time + 3.5; boss.sharedAt = battle.time + .9
    })
  }
  const hit = (time: number, raw: number, target: EdgeUnit = actor) => queue(time, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", target, target), target, raw))
  const push = (time: number, target: EdgeUnit = actor, length = 100) => {
    const carry = target.x <= FIELD.right && target.x + length > FIELD.right ? 148 : 0
    focus.push({ x: Math.min(BOARD.width - 36, target.x + length + carry) + 60, y: target.y })
    queue(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", target, target), target, length, "", undefined, false, { x: 1, y: 0 }))
  }
  const charge = (time: number) => { queue(time, () => startUnitCharge(battle, boss, actor)); queue(time + 3.02, () => finishBossCharge(battle)) }
  const shield = (unit: EdgeUnit, amount: number) => {
    unit.shield = unit.shieldStart = amount; unit.shieldUntil = 12
    battle.runtime.shieldCasts.set(unit.id, newCast(battle, unit, "enemy", unit, unit))
  }
  for (const [i, unit] of battle.team.entries()) { unit.maxHp = 1100; unit.hp = i === 0 ? 609 : 505 - i * 37 }
  boss.hp = boss.maxHp = 4200
  place(actor, 0, 0); place(boss, 14, -99); place(ally, 104, -29); place(spare, -139, 69)

  switch (key) {
    case "C/P1": case "C/G1": basic(5.5); break
    case "C/P2": basic(.3); break
    case "C/P3": enemyWalk(.8, near(110, -130)); break
    case "C/P4": push(1.1); break
    case "C/P5": focus.push(near(-10, 88)); break
    case "C/P6": boss.hp = 1400; basic(.3); break
    case "C/P7": place(boss, 0, -225); walk(.22, actor, near(0, -100)); basic(1.5); break
    case "C/P8": place(ally, 89, 0); hit(.45, 200); walk(.8, ally, near(240, 28)); hit(2.4, 200); break
    case "C/G2": enemyWalk(1.3, near(0, -16)); enemyWalk(5.0, near(229, 69)); duration = 7; break
    case "UC/P1": case "UC/G1": place(boss, 27, -150); focus.push(near(110, -210)); break
    case "UC/P2": aim = near(-18, -101); place(boss, -16, -145); basic(5.5); break
    case "UC/P3": place(boss, -18, -155); enemyWalk(1.2, near(103, -163)); break
    case "UC/P4": case "UC/G2":
      place(boss, -80, -113); boss.armor = .3; enemyWalk(.05, near(89, -103)); basic(5.5)
      if (key === "UC/G2") basic(1.6, ally)
      break
    case "UC/P5": push(1.05); push(3.7); break
    case "UC/P6": enemyWalk(.06, near(29, -110)); basic(.45); break
    case "UC/P7": queue(.2, () => issueEdgeOrder(battle, ally, "skill2", actor)); basic(1.3); break
    case "UC/P8":
      Object.assign(actor, { x: FIELD.left + 46, y: origin.y }); Object.assign(boss, { x: actor.x + 20, y: actor.y - 110 })
      walk(.22, actor, { x: actor.x + 150, y: actor.y - 40 }); break
    case "R/P1": case "R/G1":
      basic(1.4, ally); queue(4, () => moveEdgeFighter(battle, actor, along(boss, direction(boss, actor), 105))); basic(5.5)
      focus.push(near(-95, -218)); break
    case "R/P2": case "R/G2": enemyWalk(.85, near(102, -116)); focus.push(near(140, -163)); break
    case "R/P3": place(boss, -18, -185); hit(1.2, 230); hit(4.2, 230); break
    case "R/P4": place(ally, -94, -125); place(boss, -12, -163); basic(1.45, ally); break
    case "R/P5": charge(.05); enemyWalk(1.1, near(157, -172)); break
    case "R/P6": place(boss, 4, -82); basic(.3); break
    case "R/P7": shield(boss, 60); break
    case "R/P8": place(boss, 17, -170); hit(1.2, 230); break
    case "E/P1": case "E/G1": basic(5.5); break
    case "E/P2": case "E/G2": {
      aim = near(0, -128); place(boss, 14, -130)
      if (key === "E/G2" || squad) {
        const side = dummy(58, -125), to = near(205, -177)
        if (key === "E/G2") {
          focus.push(to)
          queue(1.55, () => {
            const landing = moveLanding(side, to, battle)
            if (landing && !startMovement(battle, side, landing, false, to)) side.move = landing
          })
          duration = 4.5
        }
      }
      break
    }
    case "E/P3": hit(1.1, 240); break
    case "E/P4": walk(1.3, actor, near(136, -32)); walk(4.2, actor, near(0, 0)); break
    case "E/P5": place(boss, 14, -161); boss.speed = 185; dummy(-43, -158); enemyWalk(.83, near(195, -146)); break
    case "E/P6": charge(.05); queue(.2, () => issueEdgeOrder(battle, ally, "skill", boss)); basic(1.3); break
    case "E/P7": place(boss, 12, -215); aim = near(0, -240); dummy(-98, 25); focus.push(near(-75, -230)); break
    case "E/P8": walk(.2, actor, near(-95, -40)); push(1.25); push(4.4); break
    case "L/P1": case "L/G1": boss.hp = 1350; if (key === "L/G1" || squad) dummy(69, -142); break
    case "L/P2": basic(.06, ally); orderAt = 1.3; break
    case "L/P3": aim = point(boss); charge(.05); basic(5.5); break
    case "L/P4": place(boss, -14, -145); place(ally, 80, -24); basic(1.6, ally); break
    case "L/P5": place(boss, 22, -211); hit(1.2, 250); break
    case "L/P6": basic(.2); basic(5.5, actor, dummy(-75, -45)); break
    case "L/P7": place(boss, 0, -160); charge(.05); walk(.3, actor, near(150, 20)); break
    case "L/P8":
      Object.assign(actor, { x: FIELD.left + 40, y: origin.y }); Object.assign(boss, { x: FIELD.left - 138, y: actor.y - 18 })
      focus.push({ x: boss.x - 65, y: boss.y }); basic(.3); break
    case "L/G2":
      Object.assign(actor, { x: CENTER.x, y: FIELD.top + 130 }); Object.assign(boss, { x: CENTER.x, y: FIELD.top + 14 })
      Object.assign(ally, { x: boss.x, y: boss.y + 80 }); if (spare) Object.assign(spare, { x: actor.x + 100, y: actor.y + 80 })
      focus.push({ x: boss.x, y: FIELD.top - 220 }); basic(1.6, ally); break
    case "Radiant/P1": case "Radiant/G1": place(boss, -10, -210); focus.push(near(-130, -225)); break
    case "Radiant/P2": place(boss, -12, -188); break
    case "Radiant/P3":
      Object.assign(actor, { x: FIELD.right - 155, y: origin.y }); Object.assign(boss, { x: FIELD.right - 130, y: actor.y - 160 })
      aim = { x: boss.x, y: boss.y - 171 }; focus.push({ x: FIELD.right + 98, y: boss.y }); break
    case "Radiant/P4": case "Radiant/G2": place(ally, -130, -205); if (key === "Radiant/G2") { hit(1.3, 240, ally); hit(1.45, 240) } break
    case "Radiant/P5": charge(.05); push(1.1); break
    case "Radiant/P6": basic(.3); break
    case "Radiant/P7": queue(.2, () => issueEdgeOrder(battle, ally, "skill", boss)); basic(1.4); break
    case "Radiant/P8":
      Object.assign(actor, { x: FIELD.left - 60, y: origin.y }); Object.assign(boss, { x: FIELD.left + 78, y: origin.y - 38 })
      walk(.22, actor, { x: FIELD.left + 42, y: actor.y }); basic(2.4); break
    case "Prismatic/P1": case "Prismatic/G1":
      Object.assign(boss, { x: FIELD.right + 50, y: origin.y - 145 }); focus.push({ x: boss.x + 147, y: boss.y - 65 }); break
    case "Prismatic/P2": place(boss, -26, -180); focus.push(near(-44, -350)); break
    case "Prismatic/P3": aim = point(boss); charge(.05); basic(5.5); break
    case "Prismatic/P4":
      place(boss, -12, -166); place(ally, 179, -166); enemyWalk(1.17, near(83, -166)); basic(2.5, ally); duration = 4.7; break
    case "Prismatic/P5": case "Prismatic/G2":
      Object.assign(actor, { x: FIELD.right - 82, y: origin.y + 35 }); Object.assign(boss, { x: FIELD.right + 57, y: origin.y - 105 })
      Object.assign(ally, { x: actor.x - 44, y: actor.y - 34 }); focus.push({ x: boss.x + 140, y: boss.y - 90 })
      if (key === "Prismatic/G2") push(1.5, ally)
      break
    case "Prismatic/P6":
      Object.assign(actor, { x: FIELD.right - 45, y: origin.y }); Object.assign(boss, { x: FIELD.right + 5, y: origin.y - 115 })
      push(.45); break
    case "Prismatic/P7": {
      place(boss, 16, -190); const axis = direction(CENTER, boss); Object.assign(ally, along(boss, axis, -80))
      focus.push(along(boss, axis, 160)); queue(1.4, () => moveEdgeFighter(battle, ally, along(boss, direction(boss, ally), 170)))
      basic(2.55, ally); break
    }
    case "Prismatic/P8": hit(.45, 3000, ally); break
  }
  if (active) queue(orderAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, picked ? point(picked) : aim))
  return { aim, picked, duration, focus }
}
