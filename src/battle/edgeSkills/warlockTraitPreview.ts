import type { Rarity } from "@/card/types"
import type { SubJobId } from "@/card/jobs"
import { finishBossCharge, issueEdgeOrder, moveEdgeFighter, moveLanding, startBossCharge, type EdgeBattle, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { BOARD, CENTER, FIELD, along, direction, edgeDistance, inside, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, runSteps, shoveUnit, startMovement } from "./runtime"
import { parseSelector } from "./program"
import { unitOf } from "./state"
import { arrangeWarlockPreview } from "./warlockPreview"

type Schedule = (time: number, play: () => void) => void
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, 3, -1, -1], UC: [0, 1, 2, 3, 4, -1, -1, -1],
  R: [0, 1, 2, 3, 4, -1, -1, -1], E: [0, 1, 2, 3, 4, -1, 4, 2],
  L: [0, 1, 2, 3, 4, 4, 0, -1], Radiant: [0, 1, 2, 3, 4, 3, -1, -1],
  Prismatic: [0, 1, 2, 3, 4, 2, 1, 0],
}
export const warlockTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]
const assisted = new Set(["C/P8", "UC/P6", "R/P5", "L/P3", "L/P8", "Radiant/P5", "Radiant/P7", "Prismatic/P5", "Prismatic/P7", "Prismatic/P8", "Prismatic/G2"])
export function warlockTraitPartners(id: string, squad: boolean) {
  const key = id.slice("warlock/".length), count = squad || ["Prismatic/P5", "Prismatic/G2"].includes(key) ? 2 : assisted.has(key) ? 1 : 0
  return Array.from({ length: count }, (_, i): { job: SubJobId; rarity: Rarity; active: [number, number] } =>
    i === 0 && key === "R/P5" ? { job: "warlock", rarity: "UC", active: [0, 2] } : { job: "ranger", rarity: "C", active: [0, 1] })
}

export function arrangeWarlockTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const key = id.slice("warlock/".length), [actor, ally, spare] = battle.team, boss = battle.boss
  const origin = { x: CENTER.x - 36, y: CENTER.y + 204 }
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (u: EdgeUnit | undefined, x: number, y: number) => { if (u) Object.assign(u, near(x, y)) }
  const mainAt = key === "C/P6" ? 2.0 : key === "Prismatic/P8" ? 1.6 : .22
  const plan = active ? arrangeWarlockPreview(battle, active, squad, (time, play) => {
    if (key === "L/G2" && Math.abs(time - .83) < .001) return
    at(Math.abs(time - .22) < .001 ? mainAt : time, play)
  }) : {
      aim: near(0, -200), picked: undefined as EdgeUnit | undefined, duration: 3.8, focus: [] as EdgePoint[],
    }
  let duration = Math.max(plan.duration, mainAt + 2)
  const { focus } = plan
  const queue = (time: number, play: () => void) => { duration = Math.max(duration, time + 1.3); at(time, play) }
  const dummy = (x: number, y: number) => {
    const u: typeof boss = { ...boss, ...near(x, y), id: ("dummy-" + (battle.preview!.targets.length + 1)) as typeof boss.id,
      once: new Set<string>(), force: null, move: null, telegraph: null }
    battle.preview!.targets.push(u); return u
  }
  if (!active) {
    for (const [i, u] of battle.team.entries()) { u.maxHp = 1100; u.hp = i ? 510 - i * 30 : 690 }
    boss.hp = boss.maxHp = 4200
    place(actor, 0, 0); place(boss, 14, -185); place(ally, 93, -30); place(spare, -130, -45)
  }
  const walk = (time: number, to: EdgePoint, who = actor) => {
    focus.push(to); queue(time, () => moveEdgeFighter(battle, who, to))
  }
  const enemyWalk = (time: number, to: EdgePoint | (() => EdgePoint), who = boss) => {
    if (typeof to !== "function") focus.push(to)
    queue(time, () => {
      const goal = typeof to === "function" ? to() : to, landing = moveLanding(who, goal, battle)
      if (landing && !startMovement(battle, who, landing, false, goal)) who.move = landing
      who.moveAt = battle.time + 3.5; who.sharedAt = battle.time + .9
    })
  }
  const hit = (time: number, raw: number, target: EdgeUnit = actor) => queue(time, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", target, target), target, raw))
  const push = (time: number, amount = 100) => {
    const carry = actor.x <= FIELD.right && actor.x + amount > FIELD.right ? 148 : 0
    focus.push({ x: Math.min(BOARD.width - 36, actor.x + amount + carry) + 48, y: actor.y })
    queue(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", actor, actor), actor, amount, "", undefined, false, { x: 1, y: 0 }))
  }
  const nextQ = (target: () => EdgeUnit = () => boss) => {
    for (const time of [2.9, 6.5]) queue(time, () => {
      const t = target()
      if (edgeDistance(actor, t) > actor.range - 20) moveEdgeFighter(battle, actor, along(t, direction(t, actor), 180))
    })
    queue(7.6, () => issueEdgeOrder(battle, actor, "basic", target()))
  }
  const marked = () => unitOf(battle, battle.runtime.watches.find(w => w.cast.signature?.id === id && w.uses > 0)?.target) ?? boss
  const charge = (time: number) => { queue(time, () => startBossCharge(battle, actor)); queue(time + 3.02, () => finishBossCharge(battle)) }

  switch (key) {
    case "C/P1": case "C/P3": case "UC/P4": case "R/P1": case "E/P1": case "L/P1": case "Radiant/P4": case "Prismatic/P3": nextQ(); break
    case "C/P5": push(1.05); break
    case "C/P7": actor.hp = 440; queue(.3, () => issueEdgeOrder(battle, actor, "basic", boss)); break
    case "C/P8": place(ally, 88, 0); hit(.55, 180); walk(1.4, near(242, 40), ally); hit(3.4, 180); break
    case "C/G1": dummy(62, -210); break
    case "C/G2": enemyWalk(2, () => ({ x: boss.x + 190, y: boss.y })); duration = 4.6; break
    case "UC/P2": break
    case "UC/P3": if (!battle.preview!.targets.length) dummy(-45, -219); break
    case "UC/P6": place(ally, 86, -39); push(.6); walk(2.1, near(250, -140), ally); break
    case "UC/P7": place(boss, 0, -230); walk(.2, near(0, 40)); queue(1.4, () => issueEdgeOrder(battle, actor, "basic", boss)); break
    case "UC/P8":
      queue(.2, () => runSteps(battle, newCast(battle, boss, "enemy", actor, actor), [{
        delay: 0, selector: parseSelector("t"), operations: [{ kind: "slow", args: [25, 3.5], style: "" }],
      }]))
      hit(.7, 200); hit(4.3, 200); break
    case "UC/G1": dummy(181, -196); break
    case "R/P4": enemyWalk(2.2, near(154, -216)); break
    case "R/P6":
      boss.range = 300; place(boss, 0, -280); hit(1.8, 170); hit(3.1, 170); walk(3.6, near(80, 0)); hit(6.4, 170); break
    case "R/P7": place(boss, 0, -105); walk(.2, near(0, 108)); queue(1.5, () => issueEdgeOrder(battle, actor, "basic", boss)); break
    case "R/P8": place(boss, 0, -88); push(.6); break
    case "R/G1": dummy(61, -139); break
    case "R/G2": dummy(58, -211); break
    case "E/P5": place(boss, -10, -38); enemyWalk(2, near(179, -173)); hit(3.6, 210); break
    case "E/P6": place(boss, 0, -220); charge(.05); walk(.3, near(150, 0)); queue(1.6, () => issueEdgeOrder(battle, actor, "basic", boss)); break
    case "E/P7": enemyWalk(1.4, () => ({ x: boss.x + 190, y: boss.y })); break
    case "E/G1": Object.assign(boss, { x: plan.aim.x + 3, y: plan.aim.y + 1 }); break
    case "E/G2":
      // This target receives the passive extension. A farther neighbour waits by its completed landing.
      Object.assign(boss, { x: plan.aim.x + 81, y: plan.aim.y })
      dummy(207, -233); focus.push(near(255, -233)); break
    case "L/P3":
      if (ally) Object.assign(ally, { x: actor.x + 80, y: actor.y + 20 })
      if (spare) Object.assign(spare, { x: actor.x + 165, y: actor.y + 80 })
      break
    case "L/P5": nextQ(marked); break
    case "L/P6": hit(1.3, 180); walk(2, near(-120, 130)); hit(3.7, 180); break
    case "L/P7": Object.assign(plan.aim, near(0, -345)); place(boss, 9, -345); break
    case "L/P8": hit(.45, 3000, ally); queue(1.4, () => issueEdgeOrder(battle, actor, "basic", boss)); break
    case "L/G1": enemyWalk(1.15, near(160, -282)); duration = 5; break
    case "L/G2":
      place(boss, 34, -237)
      focus.length = 0
      break
    case "Radiant/P5": if (spare) place(spare, 50, -210); break
    case "Radiant/P6": Object.assign(plan.aim, near(0, -400)); place(boss, 15, -350); break
    case "Radiant/P7": place(ally, 86, -39); push(.6); walk(2.1, near(250, -140), ally); break
    case "Radiant/P8":
      Object.assign(actor, { x: FIELD.left + 48, y: origin.y })
      Object.assign(boss, { x: FIELD.left - 140, y: origin.y }); focus.push({ x: boss.x - 70, y: boss.y })
      queue(.3, () => issueEdgeOrder(battle, actor, "basic", boss)); break
    case "Radiant/G2": dummy(-24, -213); break
    case "Prismatic/P5": case "Prismatic/G2": queue(2.5, () => issueEdgeOrder(battle, spare, "basic", boss)); break
    case "Prismatic/P6":
      place(boss, 7, -410); if (battle.preview!.targets[0]) place(battle.preview!.targets[0], -14, -358)
      hit(1.8, 200); break
    case "Prismatic/P7":
      Object.assign(actor, { x: FIELD.left + 140, y: origin.y - 30 })
      Object.assign(plan.aim, { x: FIELD.left + 60, y: origin.y - 210 })
      Object.assign(boss, { x: FIELD.left + 25, y: plan.aim.y })
      if (ally) Object.assign(ally, { x: actor.x + 70, y: actor.y + 30 })
      if (spare) Object.assign(spare, { x: actor.x + 160, y: actor.y + 100 })
      focus.push({ x: 38, y: boss.y }); break
    case "Prismatic/P8": hit(.45, 3000, ally); duration = 4.8; break
    case "Prismatic/G1":
      enemyWalk(2.1, () => point(battle.runtime.fields.find(f => f.cast.signature?.id === id)?.area.center ?? boss))
      duration = 5.2; break
  }
  return { ...plan, duration, focus }
}

