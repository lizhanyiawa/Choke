import { finishBossCharge, issueEdgeOrder, moveLanding, startBossCharge, type EdgeBattle, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { BOARD, CENTER, FIELD, inside, point, type EdgePoint } from "./geometry"
import { damageUnit, newCast, startMovement } from "./runtime"
import { warlockChoreography } from "./warlockChoreo"

type Schedule = (time: number, play: () => void) => void
const assisted = new Set(["hotscythe", "flamecurtain", "riftcurtain"])
export const warlockPreviewPartner = (skill: EdgeActive) => assisted.has(warlockChoreography(skill.id)?.motif ?? "")

export function arrangeWarlockPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const [actor, ally, spare] = battle.team, boss = battle.boss
  const motif = warlockChoreography(active.id)!.motif
  const origin = { x: CENTER.x - 36, y: CENTER.y + 204 }, focus: EdgePoint[] = []
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (u: EdgeUnit | undefined, x: number, y: number) => { if (u) Object.assign(u, near(x, y)) }
  const dummy = (x: number, y: number) => {
    const t: typeof boss = { ...boss, ...near(x, y), id: ("dummy-" + (battle.preview!.targets.length + 1)) as typeof boss.id,
      once: new Set<string>(), move: null, force: null, telegraph: null }
    battle.preview!.targets.push(t); return t
  }
  let aim = near(0, -210), duration = 3.8, orderAt = .22
  const picked = active.aim.mode === "enemy" ? boss : undefined
  const queue = (time: number, run: () => void) => { duration = Math.max(duration, time + 1.3); at(time, run) }
  const walk = (time: number, to: EdgePoint, who: typeof boss = boss) => {
    focus.push(to)
    queue(time, () => {
      const landing = moveLanding(who, to, battle)
      if (landing && !startMovement(battle, who, landing, false, to)) who.move = landing
      who.moveAt = battle.time + 3.5; who.sharedAt = battle.time + .9
    })
  }
  const hit = (time: number, amount: number, who: EdgeUnit = actor) =>
    queue(time, () => damageUnit(battle, newCast(battle, boss, "enemy", who, who), who, amount))
  const charge = (time: number) => { queue(time, () => startBossCharge(battle, actor)); queue(time + 3.02, () => finishBossCharge(battle)) }
  for (const [i, u] of battle.team.entries()) { u.maxHp = 1100; u.hp = i ? 510 - 30 * i : 690 }
  boss.hp = boss.maxHp = 4200
  place(actor, 0, 0); place(boss, 15, -205); place(ally, 113, -83); place(spare, -139, -43)
  switch (motif) {
    case "spark": place(boss, 18, -215); break
    case "closeflame": place(boss, 37, -42); if (squad) dummy(-43, -31); break
    case "frost": walk(1, near(150, -215)); break
    case "cinderfall": aim = near(0, -192); place(boss, 18, -190); if (squad) dummy(-43, -173); break
    case "firestep": aim = near(66, -10); place(boss, 24, -49); focus.push(near(95, 40)); break
    case "ember": walk(.95, near(143, -233)); duration = 4.1; break
    case "heatline": aim = near(0, -255); place(boss, 13, -225); dummy(-9, -112); break
    case "icecrown": aim = near(0, -211); place(boss, 11, -191); if (squad) dummy(-49, -224); walk(1.3, near(142, -224)); break
    case "arc": place(boss, 20, -180); dummy(92, -213); if (squad) dummy(-74, -169); break
    case "flameward": place(boss, 43, -41); hit(.95, 90); hit(1.7, 340); break
    case "thunder": aim = near(0, -290); place(boss, 12, -260); dummy(-17, -108); break
    case "frostburst": aim = near(0, -221); place(boss, 55, -204); if (squad) dummy(-52, -239); break
    case "twinspark": place(boss, -18, -241); walk(.95, near(112, -237)); break
    case "stormmine": {
      aim = near(0, -220); place(boss, 9, -208); charge(.05)
      const late = dummy(148, -220); walk(1.2, near(23, -220), late); duration = 9
      break
    }
    case "hotscythe":
      aim = near(0, -280); place(boss, 12, -208); place(ally, 107, -113)
      if (ally) { ally.actives[0] = ally.pool.active[0]; queue(.06, () => issueEdgeOrder(battle, ally, "skill", boss)) }
      if (squad) dummy(-17, -108)
      orderAt = 1.3; break
    case "meteor": aim = near(31, -252); place(boss, 62, -231); dummy(-41, -274); break
    case "firering": aim = near(0, -231); place(boss, 96, -226); dummy(8, -230); if (squad) dummy(-99, -215); break
    case "crossbolt": aim = near(0, -237); place(boss, 4, -234); dummy(8, -119); dummy(113, -233); break
    case "movingash": aim = near(-85, -265); place(boss, -130, -265); dummy(12, -161); if (squad) dummy(-155, -290); break
    case "firecoat": place(boss, 47, -70); if (squad) dummy(-76, -38); hit(1.4, 210); break
    case "lattice": aim = near(0, -282); place(boss, 4, -279); dummy(105, -278); if (squad) dummy(-10, -172); break
    case "comet": aim = near(0, -260); place(boss, 8, -384); dummy(-17, -158); focus.push(near(0, -470)); break
    case "boundaryfire":
      Object.assign(actor, { x: FIELD.left + 195, y: origin.y - 60 }); aim = { x: FIELD.left + 81, y: origin.y - 245 }
      Object.assign(boss, { x: FIELD.left + 44, y: aim.y + 17 }); if (squad) dummy(-225, -271)
      focus.push({ x: Math.max(36, FIELD.left - 196), y: boss.y }); break
    case "reflectionbolt": {
      aim = near(0, -241); place(boss, 14, -237)
      const outer = dummy(101, -245); walk(.83, near(232, -279), outer); if (squad) dummy(-46, -226)
      break
    }
    case "goldtrap": aim = near(0, -231); place(boss, 149, -232); walk(.95, near(5, -236)); if (squad) dummy(-41, -235); duration = 9.1; break
    case "firestorm": aim = near(0, -255); place(boss, 34, -242); if (squad) { const escaping = dummy(-100, -254); walk(1.3, near(-267, -265), escaping) } duration = 4.3; break
    case "sandwheel": aim = near(0, -239); place(boss, 137, -234); dummy(-12, -231); if (squad) dummy(-134, -270); break
    case "starcloud": aim = near(-60, -240); place(boss, 38, -166); dummy(60, -198); focus.push(near(100, -98)); break
    case "roadbreak": aim = near(0, -399); place(boss, 16, -260); charge(.05); walk(1.5, near(198, -269)); if (squad) dummy(-20, -146); duration = 4.2; break
    case "flamecurtain": aim = near(10, -208); place(boss, 48, -235); place(ally, -70, -183); hit(1.4, 180, ally); break
    case "fault": aim = near(0, -275); place(boss, -55, -276); dummy(54, -276); dummy(-127, -294); if (squad) dummy(-181, -292); break
    case "starfallring": aim = near(0, -280); place(boss, 44, -270); dummy(131, -255); if (squad) dummy(-121, -284); break
    case "horizonline": aim = near(0, -620); place(boss, 6, -440); dummy(-14, -221); dummy(13, -625); charge(.05); focus.push({ x: actor.x, y: Math.max(60, actor.y - 755) }); break
    case "dualfrequency": aim = near(0, -246); place(boss, 20, -235); dummy(-81, -222); walk(.65, near(154, -184)); if (squad) dummy(77, -300); duration = 3.9; break
    case "riftcurtain":
      aim = near(0, -212); place(boss, -23, -230); place(ally, 73, -207); place(spare, -114, -195)
      queue(1.5, () => issueEdgeOrder(battle, ally, "basic", boss)); hit(2.1, 180, ally); duration = 3.8
      break
  }
  if (["frostburst", "meteor", "starfallring", "sandwheel"].includes(motif))
    focus.push({ x: Math.max(36, Math.min(BOARD.width - 36, boss.x + 170)), y: boss.y - 100 })
  queue(orderAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, picked ? point(picked) : aim))
  return { aim, picked, duration, focus }
}

