import type { Rarity } from "@/card/types"
import { finishBossCharge, issueEdgeOrder, moveEdgeFighter, moveLanding, startUnitCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, areaOf, inside, point, type EdgePoint } from "./geometry"
import { parseStep } from "./program"
import { basicAttack, damageUnit, newCast, shoveUnit, startMovement } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const short = (id: string) => id.slice("spellbreaker/".length)
const slots: Record<Rarity, readonly number[]> = {
  C: [0, 1, 2, 3, 4, -1, -1, -1],
  UC: [0, 1, 2, 3, 4, -1, -1, -1],
  R: [0, 1, 2, 3, 4, -1, -1, -1],
  E: [0, 1, 2, 3, 4, -1, -1, 0],
  L: [0, 1, 2, 3, 4, -1, -1, 4],
  Radiant: [0, 1, 2, 3, 4, 1, 2, 1],
  Prismatic: [0, 1, 2, 3, 4, 0, 0, -1],
}
const assisted = new Set(["C/P8", "C/G1", "UC/P1", "UC/P3", "UC/P4", "UC/G1", "UC/G2", "R/P3", "R/P8", "R/G1", "R/G2",
  "E/P1", "E/P3", "E/P4", "E/G1", "E/G2", "L/P2", "L/P3", "L/P4", "L/P6", "L/P8",
  "Radiant/P1", "Radiant/P3", "Radiant/P4", "Radiant/P5", "Radiant/P7", "Radiant/G1", "Radiant/G2",
  "Prismatic/P1", "Prismatic/P3", "Prismatic/P5", "Prismatic/P8", "Prismatic/G1", "Prismatic/G2"])
export const spellbreakerTraitSlot = (rarity: Rarity, index: number) => slots[rarity][index]
export const spellbreakerTraitPartners = (id: string, squad: boolean) => squad || short(id) === "Radiant/G2" ? 2 : assisted.has(short(id)) ? 1 : 0

export function arrangeSpellbreakerTraitPreview(battle: EdgeBattle, id: string, active: EdgeActive | undefined, squad: boolean, at: Schedule) {
  const key = short(id)
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const origin = { x: CENTER.x - 38, y: CENTER.y + 155 }
  const focus: EdgePoint[] = []
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  let aim = near(0, -182)
  let duration = 3.5
  const orderAt = .22
  const picked = active?.aim.mode === "enemy" ? boss : ["ally", "other"].includes(active?.aim.mode ?? "") ? ally ?? actor : undefined
  const queue = (time: number, play: () => void) => { duration = Math.max(duration, time + 1.2); at(time, play) }
  const dummy = (x: number, y: number) => {
    const unit = { ...boss, ...near(x, y), id: ("dummy-" + (battle.preview!.targets.length + 1)) as `dummy-${number}`,
      telegraph: null, once: new Set<string>(), force: null, move: null }
    battle.preview!.targets.push(unit)
    return unit
  }
  const hit = (time: number, amount: number, target: EdgeUnit = actor, source: EdgeUnit = boss, order: "enemy" | "basic" = "enemy") =>
    queue(time, () => damageUnit(battle, newCast(battle, source, order, target, target), target, amount))
  const basic = (time: number, who: EdgeFighter = actor, target: EdgeUnit = boss) =>
    queue(time, () => issueEdgeOrder(battle, who, "basic", target))
  const charge = (time: number, source: EdgeUnit = boss, target: EdgeUnit = actor) => {
    queue(time, () => startUnitCharge(battle, source, target))
    if (source === boss) queue(time + 3.02, () => finishBossCharge(battle))
  }
  const walk = (time: number, who: EdgeFighter, to: EdgePoint) => {
    focus.push(to); queue(time, () => moveEdgeFighter(battle, who, to))
  }
  const enemyWalk = (time: number, to: EdgePoint) => {
    focus.push(to)
    queue(time, () => {
      const landing = moveLanding(boss, to, battle)
      if (landing && !startMovement(battle, boss, landing, false, to)) boss.move = landing
      boss.moveAt = battle.time + 3.5; boss.sharedAt = battle.time + .9
    })
  }
  const push = (time: number, who: EdgeUnit = actor, amount = 100) => {
    focus.push(near(who.x - origin.x + amount, who.y - origin.y))
    queue(time, () => shoveUnit(battle, newCast(battle, boss, "enemy", who, who), who, amount, "", undefined, false, { x: 1, y: 0 }))
  }
  const shield = (who: EdgeUnit, amount: number) => {
    who.shield = who.shieldStart = amount; who.shieldUntil = 12
    battle.runtime.shieldCasts.set(who.id, newCast(battle, who, "enemy", who, who))
  }
  const boon = (who: EdgeUnit) => {
    const cast = newCast(battle, who, "enemy", who)
    battle.runtime.buffs.push({ id: "fixture-boon-" + cast.id, cast, target: who.id, kind: "amp", values: [15], style: "", until: 12 })
  }
  const ground = (x: number, y: number, radius: number) => {
    const center = near(x, y)
    const cast = newCast(battle, boss, "enemy", center)
    const step = parseStep("z12/hold aC" + radius + " res10")
    battle.runtime.fields.push({ id: ++battle.nextFx, cast, step, area: areaOf("C", center, { x: 1, y: 0 }, radius), mode: "hold",
      seen: new Set(), previous: new Set(), time: 0, until: 12, next: 0, capacity: 0, derived: false })
    focus.push(center)
  }
  for (const [i, unit] of battle.team.entries()) { unit.maxHp = 1100; unit.hp = i === 0 ? 609 : 503 - i * 37 }
  boss.hp = boss.maxHp = 4200
  place(actor, 0, 0); place(boss, 16, -101); place(ally, 87, -28); place(spare, -103, 59)

  switch (key) {
    case "C/P1": case "C/G1":
      shield(boss, 67)
      if (key === "C/G1") basic(1.3, ally)
      break
    case "C/P2": break
    case "C/P3": charge(.04); basic(5.5); break
    case "C/P4": basic(5.5); break
    case "C/P5": case "C/G2": hit(1.05, 95); break
    case "C/P6": place(boss, 17, -83); charge(.16); push(.95); duration = 4.65; break
    case "C/P7": place(boss, -38, -194); walk(.22, actor, near(-38, -16)); basic(1.4); break
    case "C/P8": hit(.45, 2000, ally); break
    case "UC/P1": case "UC/G1":
      charge(.04); if (key === "UC/G1" || squad) dummy(65, -154)
      break
    case "UC/P2": enemyWalk(1.1, near(-60, -175)); basic(5.5); break
    case "UC/P3": queue(1.12, () => basicAttack(battle, boss, ally, true)); break
    case "UC/P4": case "UC/G2":
      hit(1.05, 240, ally); if (key === "UC/G2") enemyWalk(1.52, near(-270, -365))
      break
    case "UC/P5": aim = near(0, -62); shield(boss, 80); focus.push(near(22, -180)); break
    case "UC/P6": charge(.05); basic(.35); break
    case "UC/P7": push(.4); break
    case "UC/P8": boss.range = 280; hit(.45, 200); break
    case "R/P1": basic(5.5); break
    case "R/P2": aim = point(boss); shield(boss, 90); break
    case "R/P3": case "R/G2": boss.range = 280; hit(1.05, 240, ally); break
    case "R/P4": charge(1.1); basic(5.5); break
    case "R/P5": charge(.04); enemyWalk(1.27, near(-108, -249)); break
    case "R/P6": shield(actor, 150); hit(.4, 300); break
    case "R/P7": place(boss, 0, -73); shield(actor, 51); hit(.4, 160); break
    case "R/P8": charge(.04); queue(.3, () => issueEdgeOrder(battle, ally, "skill", boss)); basic(1.4); break
    case "R/G1": basic(1.4, ally); break
    case "E/P1": case "E/G1":
      aim = near(0, -225); place(boss, -72, -125); place(ally, 80, -125)
      dummy(-14, -88); hit(1.16, 270, ally)
      break
    case "E/P2": aim = near(8, -52); charge(.04); break
    case "E/P3": hit(1.12, 400, ally); break
    case "E/P4":
      place(boss, 0, -210); place(ally, 71, 19); charge(1.1, boss, ally)
      focus.push(near(72, -50), near(140, 238)); duration = 5.5
      break
    case "E/P5": case "E/G2":
      boon(boss)
      if (key === "E/P5") basic(5.5)
      if (key === "E/G2") queue(1.45, () => issueEdgeOrder(battle, ally, "skill", boss))
      break
    case "E/P6": charge(.06); hit(1.1, 210); focus.push(near(-45, 242)); duration = 4.4; break
    case "E/P7": charge(.05); basic(.35); focus.push(near(16, -172)); break
    case "E/P8": basic(5.5); break
    case "L/P1": case "L/G1": charge(1.1); focus.push(CENTER); break
    case "L/P2": ground(0, -130, 70); aim = near(0, -130); break
    case "L/P3": hit(1.13, 270, ally); focus.push(near(-50, -213)); break
    case "L/P4": {
      place(boss, 12, -73); const second = dummy(-17, -151)
      place(ally, -23, -156); basic(1.45, ally, second); basic(5.5)
      focus.push(near(-40, -260)); break
    }
    case "L/P5": case "L/G2": case "L/P8":
      charge(.04); if (key === "L/G2") dummy(-10, 43)
      if (key === "L/P8") push(1.2, ally)
      focus.push(near(-12, 93)); break
    case "L/P6": place(boss, 0, -210); place(ally, 140, 0); charge(.05, boss, ally); basic(3.8); focus.push(near(280, 180)); break
    case "L/P7": ground(0, 0, 83); walk(.35, actor, near(-165, -31)); break
    case "Radiant/P1": case "Radiant/G1":
      hit(1.16, 260, ally); focus.push(near(-40, -190)); break
    case "Radiant/P2": case "Radiant/P6":
      aim = point(boss); charge(.04)
      if (key === "Radiant/P6") { hit(1.3, 200); hit(4.1, 200); duration = 4.8 }
      break
    case "Radiant/P3":
      dummy(72, -133); dummy(-51, -101); hit(1.15, 300, ally)
      break
    case "Radiant/P4":
      aim = point(boss); charge(1.02); queue(2.1, () => issueEdgeOrder(battle, ally, "skill", boss)); basic(5.5); break
    case "Radiant/P5": case "Radiant/G2": boon(boss); place(ally, 50, -23); place(spare, -40, -49); break
    case "Radiant/P7": hit(1.05, 260, ally); walk(1.5, ally, near(183, 18)); break
    case "Radiant/P8": aim = point(boss); charge(.04); charge(.05, dummy(-41, -147)); basic(5.5); break
    case "Prismatic/P1": case "Prismatic/G1": ground(-27, -44, 78); aim = near(-27, -44); break
    case "Prismatic/P2": charge(.04); focus.push(near(16, -187)); break
    case "Prismatic/P3": case "Prismatic/G2":
      place(ally, 96, -8); place(boss, 0, -176); hit(1.15, 230, ally)
      if (key === "Prismatic/G2") { place(boss, 0, -270); dummy(47, -140) }
      if (key === "Prismatic/P3") push(1.6, ally)
      break
    case "Prismatic/P4": aim = point(boss); charge(1.2); basic(5.5); break
    case "Prismatic/P5": aim = near(0, -45); boon(boss); break
    case "Prismatic/P6":
      ground(0, -10, 75); aim = near(0, -10); hit(1.4, 200); walk(1.9, actor, near(-173, 24)); hit(3.4, 200); duration = 5.4
      break
    case "Prismatic/P7":
      aim = point(boss); charge(.04); charge(.05, dummy(-48, -139)); basic(5.5); duration = 9.5
      break
    case "Prismatic/P8": hit(.45, 2000, ally); break
  }
  if (active) queue(orderAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, picked ? point(picked) : aim))
  return { aim, picked, focus, duration }
}
