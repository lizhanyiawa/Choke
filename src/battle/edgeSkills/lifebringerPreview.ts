import { issueEdgeOrder, moveEdgeFighter, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, inside, point, type EdgePoint } from "./geometry"
import { lifebringerChoreography } from "./lifebringerChoreo"
import { damageUnit, newCast, shoveUnit } from "./runtime"

type Schedule = (time: number, play: () => void) => void
const twoPartners = new Set(["vine", "cluster", "footleaf", "rootline", "rootbond", "chronowheel", "oldrings", "reservoir"])

export function lifebringerPreviewPartners(active: EdgeActive, squad: boolean) {
  return squad || twoPartners.has(lifebringerChoreography(active.id)?.motif ?? "") ? 2 : 1
}

export function arrangeLifebringerPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const [actor, ally, spare] = battle.team
  const boss = battle.boss
  const motif = lifebringerChoreography(active.id)!.motif
  const origin = { x: CENTER.x - 24, y: CENTER.y + 205 }
  const focus: EdgePoint[] = []
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => {
    if (unit) Object.assign(unit, near(x, y))
  }
  let aim = near(0, -188)
  let castAt = .25
  let duration = 4
  const picked = active.aim.mode === "ally" || active.aim.mode === "other" ? ally
    : active.aim.mode === "enemy" ? boss : undefined
  const queue = (time: number, play: () => void) => {
    duration = Math.max(duration, time + 1.4)
    at(time, play)
  }
  const walk = (unit: EdgeFighter | undefined, time: number, end: EdgePoint) => {
    if (!unit) return
    focus.push(end)
    queue(time, () => moveEdgeFighter(battle, unit, end))
  }
  const hit = (unit: EdgeUnit | undefined, time: number, amount: number) => {
    if (!unit) return
    queue(time, () => damageUnit(battle, newCast(battle, boss, "enemy", unit, unit), unit, amount))
  }
  const dummy = (x: number, y: number) => {
    battle.preview!.targets.push({
      ...boss, ...near(x, y), id: `dummy-${battle.preview!.targets.length + 1}`,
      once: new Set(), force: null, move: null, telegraph: null,
    })
  }
  const around = (center: EdgePoint, radius: number) => {
    focus.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius })
  }
  for (const [i, unit] of battle.team.entries()) {
    unit.maxHp = 1100
    unit.hp = [680, 455, 560][i] ?? 520
  }
  boss.hp = boss.maxHp = 6200
  place(actor, 0, 0)
  place(ally, 67, -145)
  place(spare, -83, -174)
  place(boss, 0, -238)

  switch (motif) {
    case "renew":
      walk(ally, 1.21, near(146, -190))
      break
    case "sprig":
      hit(ally, 1.12, 126)
      break
    case "dew":
      place(boss, -101, -260)
      place(ally, 139, -186)
      place(spare, -158, -173)
      walk(ally, 1.2, near(20, -173))
      walk(spare, 3.91, near(-16, -190))
      break
    case "leafward":
      hit(ally, 1.12, 75)
      hit(ally, 1.91, 270)
      break
    case "needle":
      place(boss, 0, -218)
      place(ally, 89, -193)
      place(spare, -146, -196)
      break
    case "bud":
      hit(ally, 1.48, 233)
      break
    case "stepdew":
      walk(ally, 1.2, near(150, -177))
      break
    case "grove":
      place(ally, -46, -54)
      place(spare, 103, -38)
      walk(actor, 1.19, near(79, -12))
      break
    case "seed":
      place(boss, 48, -220)
      hit(ally, 1.05, 68)
      queue(1.58, () => issueEdgeOrder(battle, ally, "basic", boss))
      break
    case "branchshot":
      place(ally, 48, -179)
      place(spare, -49, -175)
      place(boss, 20, -223)
      if (squad) dummy(-53, -222)
      break
    case "vine":
      place(ally, 9, -177)
      place(spare, -123, -169)
      if (spare) spare.hp = 330
      walk(ally, 1.18, near(30, -220))
      break
    case "cluster":
      place(ally, -38, -174)
      place(spare, 108, -162)
      walk(ally, 1.2, near(63, -182))
      around(near(63, -182), 115)
      break
    case "borrowroot":
      place(ally, 32, -178)
      hit(ally, 1.34, 245)
      queue(2.04, () => issueEdgeOrder(battle, ally, "skill", ally))
      if (spare) {
        place(spare, -67, -172)
        hit(spare, 2.32, 200)
      }
      break
    case "footleaf":
      place(ally, 35, -178)
      place(spare, -52, -143)
      walk(ally, 1.19, near(171, -190))
      break
    case "budblade":
      aim = near(0, -276)
      place(ally, 14, -120)
      place(spare, -21, -185)
      place(boss, 0, -237)
      if (squad) dummy(-13, -86)
      break
    case "lichen":
      aim = near(0, -175)
      place(ally, 59, -176)
      place(spare, -57, -196)
      walk(spare, 2.13, near(-164, -215))
      duration = 5.2
      break
    case "landingdew":
      aim = near(0, -176)
      place(ally, 155, -183)
      place(spare, -157, -155)
      walk(ally, 1.2, near(64, -169))
      walk(spare, 3.91, near(-48, -134))
      duration = 9.4
      break
    case "rootline":
      aim = near(0, -291)
      place(ally, 11, -162)
      place(spare, -22, -221)
      walk(ally, 1.19, near(110, -163))
      break
    case "sapward":
      hit(ally, 1.85, 340)
      duration = 4.7
      break
    case "scarward":
      place(ally, 64, -189)
      place(boss, 9, -223)
      place(spare, -61, -173)
      hit(ally, 1.31, 261)
      hit(spare, 2.16, 200)
      break
    case "rootbond":
      place(ally, 83, -171)
      if (ally) ally.hp = 280
      actor.hp = actor.maxHp - 20
      walk(ally, 1.47, near(154, -151))
      duration = 5.6
      break
    case "twinbud":
      hit(ally, 1.28, 310)
      hit(actor, 2.32, 360)
      break
    case "forestexit":
      aim = near(0, -181)
      place(ally, 52, -151)
      place(spare, -53, -180)
      walk(ally, 1.2, near(179, -144))
      walk(spare, 3.91, near(-176, -189))
      duration = 9.4
      break
    case "rewind":
      hit(ally, .32, 247)
      hit(ally, .93, 159)
      if (ally) ally.hp = 830
      castAt = 1.16
      duration = 4.7
      break
    case "sharedbranch":
      place(ally, 66, -186)
      place(spare, -54, -167)
      if (ally) ally.hp = 320
      if (squad) dummy(-62, -240)
      walk(ally, 1.21, near(173, -150))
      hit(ally, 1.93, 150)
      break
    case "circuit":
      place(ally, 61, -163)
      place(spare, -58, -148)
      if (ally) ally.hp = 345
      hit(spare, 1.14, 315)
      break
    case "roamingroot":
      place(ally, 2, -199)
      place(spare, 188, -152)
      walk(ally, 1.27, near(121, -187))
      around(near(121, -187), 130)
      break
    case "soil":
      aim = near(0, -179)
      place(ally, 174, -169)
      place(spare, -48, -171)
      walk(ally, 1.2, near(62, -160))
      if (spare) queue(2.19, () => shoveUnit(battle, newCast(battle, boss, "enemy", spare, spare),
        spare, 147, "", undefined, false, { x: -1, y: 0 }))
      duration = 9.4
      break
    case "mirrorbud":
      place(ally, 63, -166)
      place(spare, -21, -172)
      walk(ally, 1.22, near(31, -110))
      hit(ally, 1.5, 96)
      hit(ally, 2.24, 360)
      break
    case "dewneedle":
      place(ally, 62, -177)
      place(spare, -78, -171)
      place(boss, -16, -224)
      if (ally) ally.hp = 310
      if (squad) dummy(63, -223)
      walk(ally, 1.16, near(201, -179))
      hit(spare, 1.68, 270)
      break
    case "chronowheel":
      place(ally, 131, -121)
      place(spare, -136, -104)
      for (const unit of battle.team) unit.hp = 1040
      hit(ally, .36, 420)
      hit(spare, .82, 283)
      hit(actor, 1.19, 193)
      castAt = 1.52
      duration = 4.6
      break
    case "oldrings": {
      const [radius] = active.steps[0].operations[0].args
      aim = near(0, -204)
      place(boss, -15, -345)
      place(ally, -83, -234)
      place(spare, 94, -218)
      around(near(-83, -234), radius)
      around(near(94, -218), radius)
      walk(ally, .91, near(21, -176))
      walk(spare, 1.88, near(113, -165))
      castAt = 3.18
      duration = 5.9
      break
    }
    case "reservoir":
      place(ally, 65, -177)
      place(spare, -61, -163)
      if (ally) ally.hp = ally.maxHp
      if (spare) spare.hp = spare.maxHp
      actor.hp = 440
      duration = 11
      break
    case "lifebud":
      if (ally) Object.assign(ally, { x: FIELD.left - 77, y: origin.y - 243 })
      hit(ally, 1.54, 332)
      break
    case "starbranch":
      aim = near(0, -190)
      place(boss, -52, -209)
      place(ally, 72, -140)
      place(spare, -77, -145)
      dummy(51, -209)
      if (squad) dummy(5, -264)
      break
  }
  queue(castAt, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, picked ? point(picked) : aim))
  return { aim, picked, duration, focus }
}

