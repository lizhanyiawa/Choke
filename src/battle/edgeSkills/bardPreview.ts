import type { SubJobId } from "@/card/jobs"
import { issueEdgeOrder, moveEdgeFighter, startBossCharge, type EdgeBattle, type EdgeFighter, type EdgeUnit } from "../edgeBattle"
import { bardChoreography } from "./bardChoreo"
import type { EdgeActive } from "./catalog"
import { CENTER, FIELD, along, direction, inside, left, type EdgePoint } from "./geometry"
import { damageUnit, newCast } from "./runtime"
import { createUnit } from "./state"

type Schedule = (time: number, play: () => void) => void
const splitParts = new Set(["passingHeal", "echoStage", "ensembleCall", "longLead", "shieldRelay", "threeVoices",
  "timingLane", "antiphon", "finalScore", "rescueSymphony", "overture", "spectrumDuel", "shoreCoda"])

export function bardPreviewPartners(active: EdgeActive, squad: boolean): SubJobId[] {
  const motif = bardChoreography(active.id)!.motif
  const first = motif === "refrain" ? "warden" : "ranger"
  const second = motif === "spectrumDuel" ? "ranger" : "healer"
  if (squad) return [first, second, "healer"]
  return splitParts.has(motif) ? [first, second] : motif === "triplet" || motif === "silenceCorner" ? [] : [first]
}

export function arrangeBardPreview(battle: EdgeBattle, active: EdgeActive, squad: boolean, at: Schedule) {
  const art = bardChoreography(active.id)!
  const [actor, ally, other, reserve] = battle.team
  const boss = battle.boss
  const focus: EdgePoint[] = []
  const origin = { x: CENTER.x, y: CENTER.y + 214 }
  const near = (x: number, y: number) => inside({ x: origin.x + x, y: origin.y + y })
  const place = (unit: EdgeUnit | undefined, x: number, y: number) => { if (unit) Object.assign(unit, near(x, y)) }
  const zone = active.steps.find(step => step.zone)?.zone
  let duration = zone ? .25 + art.windup + zone.duration + .68 : 4.8
  let aim = near(-28, -220)
  const event = (time: number, play: () => void, tail = 1.56) => {
    duration = Math.max(duration, time + tail)
    at(time, play)
  }
  const hit = (time: number, unit: EdgeFighter, target: EdgeUnit = boss, order: "basic" | "skill" | "skill2" = "basic") =>
    event(time, () => issueEdgeOrder(battle, unit, order, target))
  const hurt = (time: number, unit: EdgeUnit, damage: number, basic = false) =>
    event(time, () => damageUnit(battle, newCast(battle, boss, basic ? "basic" : "enemy", unit, unit), unit, damage))
  const walk = (time: number, unit: EdgeFighter, to: EdgePoint) => {
    focus.push(to)
    event(time, () => moveEdgeFighter(battle, unit, to), 2.25)
  }
  const dummy = (x: number, y: number) => {
    const targets = battle.preview!.targets
    const target = createUnit(`dummy-${targets.length + 1}`, near(x, y), 4100, 95, .12, 150, 155, 7)
    targets.push(target)
    return target
  }

  for (const [index, unit] of battle.team.entries()) {
    unit.maxHp = 1100
    unit.hp = [760, 472, 600, 636][index]
  }
  boss.hp = boss.maxHp = 5000
  place(actor, 0, 0)
  place(ally, -103, -132)
  place(other, 92, -161)
  place(reserve, 153, -37)
  place(boss, -48, -260)

  switch (art.motif) {
    case "pulseNote":
      hit(1.34, ally)
      break
    case "tuningFork":
      place(boss, -99, -132 - ally.range - 34)
      hit(1.36, ally)
      break
    case "mutedDrum":
      place(boss, 38, -243)
      hurt(1.35, ally, 258)
      break
    case "triplet":
      place(boss, -47, -216)
      event(.78, () => { boss.move = near(99, -289) }, 3.9)
      focus.push(near(99, -289))
      break
    case "returnVerse":
      hit(1.36, ally)
      break
    case "warDrum":
      hurt(1.41, ally, 335, true)
      hurt(2.34, ally, 162)
      break
    case "downbeat":
      hit(1.37, ally)
      focus.push(along(boss, direction(ally, boss), 70))
      break
    case "bassCurtain":
      aim = near(-42, -238)
      place(ally, -157, -106)
      place(other, 8, -269)
      place(boss, 147, -266)
      walk(1.32, ally, near(-64, -225))
      break
    case "retreatBeat":
      walk(1.34, ally, near(-217, -63))
      break
    case "harmonyNeedle":
      place(boss, -41, -223)
      place(ally, -104, -155)
      break
    case "echoArrow":
      if (squad) dummy(54, -308)
      hit(1.35, ally)
      break
    case "bowString":
      hit(1.37, ally, boss, squad ? "skill" : "basic")
      focus.push(along(boss, direction(ally, boss), 52))
      break
    case "tuningMark":
      aim = near(-53, -252)
      if (squad) dummy(19, -229)
      hit(1.41, ally)
      break
    case "passingHeal":
      place(other, -20, -159)
      hit(1.35, ally)
      break
    case "crossMeter":
      aim = near(0, -278)
      place(ally, 23, -126)
      place(boss, -15, -203)
      if (squad) dummy(18, -252)
      focus.push(near(-94, -205))
      break
    case "residency":
      aim = near(-84, -156)
      place(boss, -98, -132 - ally.range - 49)
      hit(1.43, ally)
      walk(2.61, ally, near(-267, -117))
      break
    case "echoStage":
      aim = near(-34, -173)
      place(other, 44, -192)
      place(boss, -35, -273)
      hit(1.43, ally)
      hit(2.61, other)
      break
    case "restCloak":
      walk(1.33, ally, near(-178, -243))
      break
    case "stoppedString":
      aim = near(-48, -260)
      hit(1.47, ally)
      focus.push(along(boss, direction(ally, boss), 77))
      break
    case "duet":
      place(boss, -62, -181)
      hit(1.39, ally)
      hit(6.69, actor)
      break
    case "ensembleCall":
      place(other, 45, -207)
      hit(1.41, ally)
      hit(2.59, other)
      break
    case "battleStaff": {
      aim = near(129, -307)
      const axis = direction(actor, aim)
      const lane = (depth: number, side: number) => along(along(actor, axis, depth), left(axis), side)
      Object.assign(ally, lane(105, -23))
      if (other) Object.assign(other, lane(185, 26))
      Object.assign(boss, lane(276, -19))
      if (squad) Object.assign(dummy(0, -200), lane(318, 27))
      focus.push(lane(410, 12))
      break
    }
    case "longLead":
      place(ally, -335, -183)
      place(boss, -375, -300)
      place(other, -293, -300)
      hit(1.52, ally)
      break
    case "silenceCorner":
      aim = near(-59, -264)
      event(1.66, () => startBossCharge(battle, actor))
      focus.push(near(-31, -90))
      break
    case "coda":
      boss.hp = 1815
      hit(1.43, ally, boss, "skill")
      break
    case "shieldRelay":
      place(other, -19, -162)
      hit(1.40, ally)
      break
    case "threeVoices":
      place(other, 49, -156)
      hit(1.51, ally)
      break
    case "timingLane":
      aim = near(-17, -365)
      place(ally, -141, -183)
      place(other, 106, -222)
      place(boss, -27, -224 - ally.range - 29)
      walk(1.43, ally, near(-17, -224))
      walk(4.2, other, near(-13, -308))
      hit(5.34, ally)
      break
    case "refrain":
      place(boss, -53, -242)
      if (squad) dummy(8, -342)
      hit(1.47, ally, boss, "skill")
      focus.push(along(boss, direction(ally, boss), 111), near(-49, -460))
      break
    case "antiphon":
      aim = near(-24, -170)
      place(other, 45, -207)
      hit(1.44, ally)
      hit(2.61, other)
      break
    case "finalScore":
      place(other, 86, -126)
      if (squad) dummy(36, -232)
      other.actives = [other.pool.active[0], other.pool.active[2]]
      hit(1.45, ally)
      event(2.61, () => issueEdgeOrder(battle, other, "skill", actor))
      if (reserve) {
        reserve.actives = [reserve.pool.active[2], reserve.pool.active[0]]
        event(3.82, () => issueEdgeOrder(battle, reserve, "skill", other))
      }
      break
    case "rescueSymphony":
      actor.hp = 475
      other.hp = 365
      hurt(1.48, ally, 285)
      hurt(2.48, other, 310)
      break
    case "overture":
      aim = near(13, -212)
      place(ally, -178, -105)
      place(other, 140, -274)
      place(reserve, 156, -76)
      place(boss, -52, -313)
      hit(2.35, ally)
      break
    case "spectrumDuel":
      aim = near(-46, -187)
      place(other, 54, -162)
      hit(1.48, ally)
      hit(2.65, other, boss, squad ? "skill2" : "skill")
      if (squad) dummy(-123, -274)
      break
    case "shoreCoda": {
      Object.assign(actor, { x: FIELD.left + 224, y: origin.y - 20 })
      Object.assign(ally, { x: FIELD.left - 69, y: origin.y - 205 })
      Object.assign(other, { x: FIELD.left + 77, y: ally.y + 57 })
      if (reserve) Object.assign(reserve, { x: FIELD.left + 292, y: ally.y + 133 })
      Object.assign(boss, { x: FIELD.left + 181, y: ally.y - 121 })
      walk(1.51, ally, { x: FIELD.left + 76, y: ally.y })
      break
    }
  }

  const picked = active.aim.mode === "ally" || active.aim.mode === "other" ? ally : active.aim.mode === "enemy" ? boss : undefined
  const location = picked ?? (active.aim.mode === "self" ? actor : aim)
  at(.25, () => issueEdgeOrder(battle, actor, "skill", picked ?? null, location))
  return { aim: location, picked, duration, focus }
}
