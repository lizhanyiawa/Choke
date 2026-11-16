import { moveEdgeFighter, type EdgeBattle, type EdgeFighter } from "../edgeBattle"
import { FIELD, along, direction, edgeDistance, inside, point, rotate } from "./geometry"
import type { DeploymentKind } from "./program"
import { basicAttack, bossTarget, emit, forceTo, newCast, positionUnit } from "./runtime"
import { isFighter, unitOf, type SkillCast } from "./state"
import { SUMMON_PLANS } from "./summonPlans"
import { SUMMON_DISMISS_TIME, summonSpawns } from "./summons"

export function arrangeSummonPreview(battle: EdgeBattle, actor: EdgeFighter, cast: SkillCast, kind: DeploymentKind) {
  const { aim } = cast
  const plan = SUMMON_PLANS[kind]
  const ally = battle.team[1] ?? actor
  const spare = battle.team[2]
  const axis = direction(actor, aim)
  const [spawn, second, third] = summonSpawns(kind, actor, aim)
  const near = (dx: number, dy: number) => inside({ x: aim.x + dx, y: aim.y + dy })
  const placeBoss = (dx: number, dy: number) => Object.assign(battle.boss, near(dx, dy))
  if (cast.target !== "boss") placeBoss(54, -76)
  if (plan.motion?.kind === "orbit") {
    const center = inside(aim, plan.motion.radius + 14)
    const perch = along(center, rotate(axis, kind === "lantern" ? 310 : 240), plan.motion.radius)
    if (kind === "orbitBeast") Object.assign(battle.boss, inside(perch))
    else Object.assign(ally, inside(perch))
  }
  switch (kind) {
    case "sentry": placeBoss(-73, -136); break
    case "kiln": placeBoss(18, -99); break
    case "barricade": placeBoss(0, -157); break
    case "gates": placeBoss(64, -148); break
    case "decoy": placeBoss(58, -68); Object.assign(ally, near(64, 39)); break
    case "twinBows": placeBoss(3, -16); break
    case "rail": Object.assign(ally, near(87, 82)); break
    case "shadow": case "mirror": placeBoss(33, -91); break
    case "medic": case "rescue": ally.hp = Math.round(ally.maxHp * .28); break
    case "plate": case "hexWard":
      Object.assign(ally, near(164, 32))
      if (spare) Object.assign(spare, near(-179, 45))
      break
    case "paperBeat":
      Object.assign(ally, inside({ x: spawn.x - 36, y: spawn.y + 32 }))
      Object.assign(battle.boss, inside({ x: second.x + 37, y: (second.y + third.y) / 2 }))
      break
    case "roadBeast": placeBoss(22, 12); break
    case "shoreBeast": placeBoss(44, -28); break
    case "ensemble":
      placeBoss(46, 4)
      Object.assign(ally, near(32, 28))
      if (spare) Object.assign(spare, near(109, 31))
      break
    case "mirrorWeave":
      placeBoss(5, -59)
      Object.assign(ally, near(7, 54))
      if (spare) Object.assign(spare, near(148, 64))
      break
    case "paperPack": placeBoss(-104, 0); break
    case "armorBeast": placeBoss(30, -169); Object.assign(ally, near(24, 46)); break
    case "returnBeast": {
      Object.assign(ally, { x: aim.x + 17, y: FIELD.top - 32 })
      if (spare) Object.assign(spare, near(64, 28))
      placeBoss(22, 70)
      break
    }
  }
  if (kind === "twinBows" && battle.preview?.loadoutFor !== undefined) {
    battle.preview.targets.push({ ...battle.boss, ...inside({ x: spawn.x + 9, y: spawn.y - 42 }), id: "dummy-3", once: new Set() })
  }
}

export function queueSummonPreview(battle: EdgeBattle, actor: EdgeFighter, cast: SkillCast, kind: DeploymentKind, at: (time: number, play: () => void) => void) {
  const { aim } = cast
  const linked = unitOf(battle, cast.target)
  const ally = linked && isFighter(linked) ? linked : battle.team[1] ?? actor
  const boss = battle.boss
  const walkAlly = () => moveEdgeFighter(battle, ally, inside({ x: ally.x + 116, y: ally.y - 28 }))
  const meet = (dx: number, dy: number) => moveEdgeFighter(battle, ally, inside({ x: aim.x + dx, y: aim.y + dy }))
  switch (kind) {
    case "escort": at(.65, walkAlly); break
    case "barricade": case "lasso":
      at(.46, () => { boss.move = inside({ x: aim.x, y: aim.y + 176 }) })
      if (kind === "barricade") at(1.88, () => {
        const wall = cast.summon?.deployment.bodies[0]
        if (wall?.hp && edgeDistance(wall, boss) <= boss.range) basicAttack(battle, boss, wall, true)
      })
      break
    case "decoy":
      for (const time of [.87, 2.31]) at(time, () => {
        const target = bossTarget(battle, true)
        if (target && target.id !== ally.id) basicAttack(battle, boss, target, true)
      })
      break
    case "ambush":
      at(.92, () => {
        const axis = direction(boss, ally)
        battle.telegraph = { from: point(boss), to: along(boss, axis, 286), direction: axis, until: battle.time + 1.4 }
        emit(battle, { kind: "charge", cast: newCast(battle, boss, "enemy", ally, ally), source: boss.id, target: ally.id, at: point(boss) })
      })
      break
    case "shadow": case "mirror":
      at(1.48, () => basicAttack(battle, ally, boss))
      break
    case "rail": at(.7, () => meet(12, 106)); break
    case "plate": case "hexWard": at(.6, () => meet(69, 32)); break
    case "roadBeast": at(1.91, () => { boss.move = inside({ x: aim.x - 118, y: boss.y }) }); break
    case "paperGuard": at(.97, walkAlly); break
    case "bodyguard": case "mirrorWeave": case "armorBeast":
      at(1.61, () => basicAttack(battle, boss, ally, true))
      break
    case "gates":
      at(.69, () => {
        const entry = cast.summon?.deployment.bodies[0]
        if (entry) moveEdgeFighter(battle, actor, entry)
      })
      break
    case "bridge":
      at(1.75, () => {
        const body = cast.summon?.deployment.bodies[0]
        if (!body) return
        positionUnit(battle, ally, { x: body.x, y: FIELD.top - 44 })
        moveEdgeFighter(battle, ally, inside({ x: body.x, y: FIELD.top + 43 }))
      })
      break
    case "rescue":
      at(1.35, () => forceTo(battle, ally, { x: ally.x, y: FIELD.top - 61 }, .32))
      at(2.25, () => moveEdgeFighter(battle, ally, { x: ally.x + 29, y: FIELD.top + 58 }))
      break
    case "paperPack":
      at(1.05, () => basicAttack(battle, boss, ally, true))
      for (const [slot, moveAt, strikeAt] of [[1, 1.45, 3.88], [2, 4.16, 6.65]]) {
        at(moveAt, () => {
          const body = cast.summon?.deployment.bodies[slot]
          if (body) boss.move = inside(along(ally, direction(ally, body), 102))
        })
        at(strikeAt, () => {
          if (edgeDistance(boss, ally) <= boss.range) basicAttack(battle, boss, ally, true)
        })
      }
      break
  }
}

export function summonPreviewDuration(kind: DeploymentKind) {
  const actionTime = kind === "decoy" ? 2.85 : SUMMON_PLANS[kind].duration
  return actionTime + SUMMON_DISMISS_TIME
}
