import { finishBossCharge, issueEdgeOrder, moveLanding, startBossCharge, type EdgeBattle, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, inside, point, type EdgePoint } from "./geometry"
import { basicAttack, damageUnit, newCast, startMovement } from "./runtime"
import { assassinChoreography } from "./assassinChoreo"

type Schedule = (time: number, play: () => void) => void
const assisted = new Set(["mask", "brokenbeat", "sightmark", "shimmer", "chasecircle", "backmark", "borrowstep", "blankstep", "shadowpit", "shoreward"])
export const assassinPreviewPartner = (skill: EdgeActive) => assisted.has(assassinChoreography(skill.id)?.motif ?? "")

export function arrangeAssassinPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const [actor, ally, spare] = battle.team, boss = battle.boss
  const motif = assassinChoreography(active.id)!.motif
  const origin = { x: CENTER.x - 36, y: CENTER.y + 147 }
  const focus: EdgePoint[] = []
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (u: EdgeUnit | undefined, x: number, y: number) => { if (u) Object.assign(u, near(x, y)) }
  const dummy = (x: number, y: number) => {
    const t = { ...boss, ...near(x, y), id: ("dummy-" + (battle.preview!.targets.length + 1)) as `dummy-${number}`, once: new Set<string>() }
    battle.preview!.targets.push(t); return t
  }
  let aim = near(0, -198), duration = 3.6, orderAt = .22
  const picked = ["enemy", "outside"].includes(active.aim.mode) ? boss : ["ally", "other"].includes(active.aim.mode) ? ally ?? actor : undefined
  const queue = (t: number, run: () => void) => { duration = Math.max(duration, t + 1.3); at(t, run) }
  const basic = (t: number, who = actor) => queue(t, () => issueEdgeOrder(battle, who, "basic", boss))
  const hit = (t: number, amount: number, target: EdgeUnit = actor) => queue(t, () =>
    damageUnit(battle, newCast(battle, boss, "enemy", target, target), target, amount))
  const walk = (t: number, to: EdgePoint) => {
    focus.push(to)
    queue(t, () => {
      const landing = moveLanding(boss, to, battle)
      if (landing && !startMovement(battle, boss, landing, false, to)) boss.move = landing
      boss.moveAt = battle.time + 3.5; boss.sharedAt = battle.time + .9
    })
  }
  const charge = (t: number) => { queue(t, () => startBossCharge(battle, actor)); queue(t + 3.02, () => finishBossCharge(battle)) }
  for (const [i, u] of battle.team.entries()) { u.maxHp = 1100; u.hp = i === 0 ? 670 : 512 - 35 * i }
  boss.hp = boss.maxHp = 4200
  place(actor, 0, 0); place(boss, 14, -99); place(ally, 109, -36); place(spare, -124, 73)
  switch (motif) {
    case "backstab": place(boss, -19, -86); break
    case "thrust": place(boss, 24, -126); break
    case "scar": walk(.85, near(103, -142)); break
    case "sidestep": focus.push(near(-71, 0)); break
    case "retreat": focus.push(near(-8, 79)); break
    case "sideflash": place(boss, 27, -151); focus.push(near(115, -151)); break
    case "shadowrush": aim = near(-24, -105); place(boss, -29, -143); if (squad) dummy(22, -91); break
    case "foldedknife": place(boss, -22, -170); walk(1.25, near(111, -180)); break
    case "stopneedle": place(boss, -83, -116); walk(.03, near(119, -101)); break
    case "mask":
      hit(1.1, 100); queue(1.7, () => basicAttack(battle, boss, ally ?? actor, true)); duration = 4
      break
    case "brokenbeat": basic(1.48, ally); focus.push(near(-94, -213)); break
    case "returningdagger": place(boss, 35, -181); walk(1.0, near(80, -198)); break
    case "crossshadow": place(boss, -18, -175); focus.push(near(-32, -267)); break
    case "sightmark": place(boss, -31, -188); place(ally, -95, -155); basic(1.48, ally); break
    case "windreveal": charge(.05); focus.push(near(-17, 83)); break
    case "shimmer": hit(1.22, 135); duration = 3.7; break
    case "shadowpin":
      aim = near(0, -174); place(boss, 140, -174); walk(1.05, near(10, -174))
      if (squad) dummy(-55, -169)
      duration = 9.5
      break
    case "seamrun":
      aim = near(0, -238); place(boss, 16, -187); dummy(-17, -88); focus.push(near(96, -88))
      break
    case "conceal": basic(5.5); duration = 6.7; break
    case "offhand":
      place(boss, 9, -207); boss.speed = 185; dummy(-31, -193); walk(.8, near(221, -211)); duration = 3.7
      break
    case "deathchase": place(boss, 28, -239); boss.hp = 1350; break
    case "chasecircle": place(ally, -26, -37); basic(.08, ally); orderAt = 1.22; break
    case "fallingneedle": aim = near(17, -210); place(boss, -13, -205); charge(.05); if (squad) dummy(74, -180); break
    case "backmark": place(boss, -16, -177); place(ally, -84, -106); basic(1.48, ally); focus.push(near(-46, -241)); break
    case "wrappedstep": place(boss, 36, -236); hit(1.2, 135); break
    case "turnaround": place(boss, -16, -233); if (squad) dummy(15, -118); duration = 3.9; break
    case "mirroredge": place(boss, -26, -281); break
    case "bordercut":
      aim = near(0, -340); place(actor, 212, -80); place(boss, 201, -232); aim = near(194, -420)
      if (squad) dummy(219, -333); focus.push({ x: FIELD.right + 71, y: boss.y })
      break
    case "borrowstep": place(ally, -139, -285); place(boss, -122, -218); aim = point(ally); if (squad) dummy(-194, -235); break
    case "blankstep": place(boss, 30, -256); charge(.05); hit(1.2, 190); duration = 4.1; break
    case "boundaryexec":
      Object.assign(boss, { x: FIELD.right + 73, y: CENTER.y - 178 }); focus.push({ x: boss.x + 148, y: boss.y - 87 }); charge(.05)
      break
    case "doubleedge": place(boss, -54, -299); focus.push(near(-79, -427)); break
    case "windshear": aim = near(29, -302); place(boss, 25, -309); charge(.05); dummy(-79, -266); if (squad) dummy(96, -273); break
    case "shadowpit":
      place(boss, -13, -167); place(ally, 179, -167); walk(1.17, near(82, -167)); basic(2.5, ally); duration = 4.7
      break
    case "shoreward":
      place(actor, 235, -63); place(ally, 196, -124); Object.assign(boss, { x: FIELD.right + 57, y: origin.y - 184 })
      focus.push({ x: boss.x + 130, y: boss.y - 65 }); break
  }
  queue(orderAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, picked ? point(picked) : aim))
  return { aim, picked, duration, focus }
}
