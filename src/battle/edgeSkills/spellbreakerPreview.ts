import { finishBossCharge, issueEdgeOrder, moveLanding, startBossCharge, type EdgeBattle, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, areaOf, inside, point, type EdgePoint } from "./geometry"
import { parseStep } from "./program"
import { basicAttack, damageUnit, newCast, startMovement } from "./runtime"
import { spellbreakerChoreography } from "./spellbreakerChoreo"
import { deploySummon } from "./summons"

type Schedule = (time: number, play: () => void) => void
const assisted = new Set(["returnveil", "refraction", "curtain", "hollow", "deflector", "reverseScore",
  "clearcut", "doubleRebuttal", "borrowScore", "antiphase", "scatterseals"])
export const spellbreakerPartner = (skill: EdgeActive) => assisted.has(spellbreakerChoreography(skill.id)?.motif ?? "")

export function arrangeSpellbreakerPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const [actor, ally, spare] = battle.team
  const { boss } = battle
  const motif = spellbreakerChoreography(active.id)!.motif
  const origin = { x: CENTER.x - 38, y: CENTER.y + 171 }
  const focus: EdgePoint[] = []
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const dummy = (x: number, y: number) => {
    const unit = { ...boss, ...near(x, y), id: ("dummy-" + (battle.preview!.targets.length + 1)) as `dummy-${number}`, once: new Set<string>() }
    battle.preview!.targets.push(unit)
    return unit
  }
  let aim = near(0, -198)
  let duration = 3.3
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.2)
    at(time, play)
  }
  const hit = (time: number, amount: number, target: EdgeUnit, order: "enemy" | "basic" = "enemy", source = boss) =>
    queue(time, () => damageUnit(battle, newCast(battle, source, order, target, target), target, amount))
  const charge = (time: number) => queue(time, () => startBossCharge(battle, actor))
  const walk = (time: number, end: EdgePoint) => {
    focus.push(end)
    queue(time, () => {
      const landing = moveLanding(boss, end, battle)
      if (landing && !startMovement(battle, boss, landing, false, end)) boss.move = landing
      boss.moveAt = battle.time + 3.5
      boss.sharedAt = battle.time + .9
    })
  }
  const shield = (unit: EdgeUnit, amount: number) => {
    unit.shield = unit.shieldStart = amount
    unit.shieldUntil = 13
    battle.runtime.shieldCasts.set(unit.id, newCast(battle, unit, "enemy", unit))
  }
  const boon = (unit: EdgeUnit, kind: "amp" | "speed", value: number, duration: number) => {
    const cast = newCast(battle, unit, "enemy", unit)
    battle.runtime.buffs.push({ id: "fixture-" + cast.id, cast, target: unit.id, kind, values: [value], style: "", until: duration })
  }
  const ground = (x: number, y: number, radius: number, hostile = true) => {
    const center = near(x, y)
    const cast = newCast(battle, hostile ? boss : actor, "enemy", center)
    const step = parseStep("z12/hold aC" + radius + " res10")
    battle.runtime.fields.push({ id: ++battle.nextFx, cast, step, area: areaOf("C", center, { x: 1, y: 0 }, radius),
      mode: "hold", seen: new Set(), previous: new Set(), time: 0, until: 12, next: 0, capacity: 0, derived: false })
    focus.push(center)
  }
  for (const [i, unit] of battle.team.entries()) {
    unit.maxHp = 1100
    unit.hp = i === 0 ? 668 : 503 - 44 * i
  }
  boss.hp = boss.maxHp = 4200
  place(actor, 0, 0); place(boss, 28, -123); place(ally, -124, -63); place(spare, 147, 61)

  switch (motif) {
    case "shieldpick": shield(boss, Math.round(actor.attack * .65)); break
    case "pinpoint": place(boss, -37, -107); break
    case "crosscut":
      aim = near(0, -167); place(boss, 15, -125); charge(.05)
      if (squad) dummy(-18, -61)
      break
    case "chisel": boss.armor = .23; break
    case "waveglass":
      hit(.94, 71, actor, "basic"); hit(1.69, 227, actor)
      break
    case "sunderchant": place(boss, -43, -163); charge(.05); break
    case "cutoff":
      aim = near(0, -201); place(boss, 19, -154)
      if (squad) dummy(-22, -75)
      walk(1.07, near(-129, -222))
      duration = 4.5
      break
    case "blademark":
      place(boss, 48, -111)
      queue(1.19, () => basicAttack(battle, boss, ally ?? actor, true))
      break
    case "returnveil":
      place(ally, -155, -110); hit(.95, 96, ally, "basic"); hit(1.73, 246, ally)
      break
    case "wedgejump":
      aim = near(6, -105); place(boss, 26, -156); shield(boss, Math.round(actor.attack * 2))
      if (squad) { const second = dummy(-58, -120); shield(second, Math.round(actor.attack * 1.8)) }
      break
    case "etch": boss.armor = .29; place(boss, -41, -189); break
    case "rivets":
      aim = near(12, -202); place(boss, 44, -237); shield(boss, Math.round(actor.attack * 2))
      if (squad) { const other = dummy(-53, -178); shield(other, Math.round(actor.attack * 1.7)) }
      break
    case "refraction":
      place(ally, 134, -113); place(boss, 46, -167)
      hit(.93, 102, ally, "basic")
      queue(1.67, () => { boss.range = 260; damageUnit(battle, newCast(battle, boss, "enemy", ally, ally), ally, 242) })
      break
    case "delayseal":
      place(boss, -34, -182); charge(1.09); charge(2.05)
      duration = 4.3
      break
    case "foldblade":
      aim = near(0, -256); place(boss, 18, -96); dummy(-19, -212); charge(.05)
      focus.push(near(24, -291))
      break
    case "curtain":
      aim = near(0, -264); place(ally, -126, -131); place(boss, 145, -151)
      hit(1.12, 96, ally, "basic"); hit(1.94, 223, ally); hit(2.76, 173, ally)
      break
    case "cutanchor":
      aim = near(0, -193); place(boss, 82, -215); charge(.05)
      if (squad) dummy(-65, -139)
      break
    case "hollow":
      place(ally, -152, -111)
      hit(1.08, 95, ally, "basic"); hit(1.83, 265, ally)
      break
    case "misprint":
      place(boss, 22, -174)
      walk(1.12, near(-39, -207)); charge(2.22)
      queue(5.3, () => finishBossCharge(battle))
      focus.push(near(-9, -80), near(70, 245))
      break
    case "unspool":
      aim = near(0, -281); place(boss, 18, -141); boon(boss, "amp", 24, 12); boon(boss, "speed", 16, 6)
      if (squad) { const other = dummy(-23, -237); boon(other, "speed", 20, 14) }
      break
    case "padlock":
      place(boss, 33, -217); charge(1.11); charge(3.03)
      duration = 5
      break
    case "pressmat":
      aim = near(0, -220); place(boss, 61, -187)
      ground(-57, -245, 73); ground(105, -185, 59); ground(-55, -320, 44, false)
      duration = 3.5
      break
    case "deflector":
      place(ally, 142, -96); place(boss, 45, -177)
      hit(.99, 86, ally, "basic"); hit(1.82, 247, ally)
      focus.push(near(-23, -248))
      break
    case "armorlane":
      aim = near(0, -321); place(boss, 19, -86); boss.armor = .24
      dummy(-21, -178); dummy(20, -274)
      focus.push(near(-38, -278))
      break
    case "sidestep":
      place(boss, 39, -191); charge(.05)
      focus.push(near(-14, 71))
      break
    case "reverseScore": {
      place(boss, 34, -231); place(ally, -138, -77)
      hit(.99, 105, actor, "basic")
      let spell: ReturnType<typeof newCast>
      queue(1.62, () => {
        spell = newCast(battle, boss, "enemy", actor, actor)
        for (const target of battle.team) damageUnit(battle, spell, target, 205)
      })
      queue(2.39, () => damageUnit(battle, spell, ally, 161))
      break
    }
    case "clearcut":
      aim = near(0, -249); place(boss, 68, -271); place(ally, -93, -221); charge(.05)
      if (squad) dummy(-46, -349)
      break
    case "doubleRebuttal":
      place(ally, -134, -122); place(boss, 68, -216)
      dummy(135, -246); dummy(37, -285)
      hit(1.1, 88, ally, "basic"); hit(1.89, 260, ally)
      break
    case "offbeat":
      aim = near(0, -218); place(boss, 43, -225)
      charge(1.16); walk(1.29, near(-115, -255))
      duration = 3.6
      break
    case "borrowScore":
      place(boss, 34, -274); place(ally, -117, -85)
      boon(boss, "amp", 32, 14); boon(boss, "speed", 16, 5)
      break
    case "blankbeat": {
      aim = near(0, -364); place(boss, 194, -172)
      ground(-62, -385, 65); ground(89, -329, 54); ground(143, -458, 42, false)
      const cast = newCast(battle, boss, "enemy", near(-79, -278))
      deploySummon(battle, cast, boss, "twinBirds", "敌方纸鸟", "UC")
      break
    }
    case "erasure":
      aim = near(0, -601); place(boss, -25, -274); charge(.05)
      ground(28, -391, 70); ground(-24, -513, 62); ground(107, -427, 45)
      if (squad) dummy(21, -494)
      break
    case "antiphase":
      place(ally, 162, -112); place(boss, 38, -247)
      hit(1.04, 74, ally, "basic"); hit(1.86, 467, ally)
      break
    case "scorelock":
      aim = near(0, -266); place(boss, 75, -261); charge(.05)
      charge(1.39); charge(2.99)
      duration = 4.8
      break
    case "scatterseals":
      aim = near(0, -236); place(boss, 63, -296); place(ally, -105, -210)
      boon(boss, "amp", 28, 12)
      if (squad) { const other = dummy(-65, -348); boon(other, "speed", 18, 10); place(spare, 116, -153) }
      break
  }
  const picked = active.aim.mode === "enemy" ? boss : active.aim.mode === "ally" ? ally : undefined
  if (picked) aim = point(picked)
  at(.22, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, aim))
  return { aim, picked, focus, duration }
}
