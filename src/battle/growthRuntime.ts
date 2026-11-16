import type { EdgeBattle, EdgeFighter, EdgeUnit } from "./edgeBattle"
import { battleFighters, battleUnits, isFighter, isSummonId, sameSide, unitOf, type SkillCast } from "./edgeSkills/state"
import { activeDeployments } from "./edgeSkills/summons"
import { edgeDistance, isOutside } from "./edgeSkills/geometry"
import { healingReceived } from "./edgeSkills/roles"
import { newCast, shield } from "./edgeSkills/runtime"
import { modCombos } from "@/card/cultivation"

const has = (unit: EdgeUnit, tier: number) => isFighter(unit) && (unit.growth?.effects ?? 0) >= tier
const mod = (unit: EdgeUnit, id: string) => isFighter(unit) && unit.growth?.mods.includes(id)
const combo = (unit: EdgeUnit, id: string) => isFighter(unit) && modCombos(unit.growth?.mods ?? []).some(value => value.id === id)
export function growthReady(battle: EdgeBattle, unit: EdgeUnit, key: string, seconds: number) {
  if (!isFighter(unit) || (unit.passiveAt["growth/" + key] ?? 0) > battle.time) return false
  unit.passiveAt["growth/" + key] = battle.time + seconds
  return true
}
export function growthShield(battle: EdgeBattle, unit: EdgeUnit, fraction: number, duration = 5) {
  if (!unit.hp) return
  const value = Math.round(unit.maxHp * fraction)
  if (unit.shieldUntil > battle.time && unit.shield >= value) return
  // Use the existing shield replacement path, including old golden-watch cleanup.
  shield(battle, newCast(battle, unit, "skill", unit, unit), unit, value, duration, undefined, true)
}
export function growthMend(battle: EdgeBattle, unit: EdgeUnit, amount: number, received = false) {
  if (!unit.hp || isOutside(unit)) return 0
  const gain = Math.min(unit.maxHp - unit.hp, Math.round(amount * (received ? 1 : healingReceived(battle, unit))))
  if (gain <= 0) return 0
  unit.hp += gain
  battle.impacts.push({ id: battle.nextFx++, target: unit.id, from: { x: unit.x, y: unit.y }, at: { x: unit.x, y: unit.y }, amount: gain, kind: "heal", time: battle.time })
  return gain
}
function partner(battle: EdgeBattle, actor: EdgeFighter, range: number, wounded = false) {
  return battleFighters(battle).filter(unit => unit !== actor && unit.hp > 0 && !isOutside(unit) && sameSide(battle, actor.id, unit.id) && edgeDistance(unit, actor) <= range)
    .sort((a, b) => wounded ? a.hp / a.maxHp - b.hp / b.maxHp : edgeDistance(actor, a) - edgeDistance(actor, b))[0]
}
export function growthCleanse(battle: EdgeBattle, target: EdgeUnit) {
  battle.runtime.buffs = battle.runtime.buffs.filter(buff => buff.target !== target.id || !["root", "slow"].includes(buff.kind))
}
export function growthCanCleanseMove(battle: EdgeBattle, unit: EdgeUnit) {
  return isFighter(unit) && (unit.card.job === "mage" && has(unit, 4) || mod(unit, "spring")) &&
    (unit.passiveAt["growth/cleanseMove"] ?? 0) <= battle.time
}
export function growthMove(battle: EdgeBattle, unit: EdgeUnit) {
  if (growthCanCleanseMove(battle, unit) && growthReady(battle, unit, "cleanseMove", 10)) growthCleanse(battle, unit)
  if (!isFighter(unit)) return
  if (mod(unit, "stride") && growthReady(battle, unit, "momentumMove", 6)) unit.passiveAt["growth/momentumUntil"] = battle.time + 4
  if (combo(unit, "overload") && growthReady(battle, unit, "overloadMove", 8)) unit.passiveAt["growth/overloadUntil"] = battle.time + 4
  const ally = combo(unit, "tempo") ? partner(battle, unit, 250) : undefined
  if (ally && growthReady(battle, unit, "comboTempo", 10)) ally.actionAt = Math.max(battle.time, ally.actionAt - 1.25)
}
export function growthCast(battle: EdgeBattle, actor: EdgeFighter) {
  if (actor.card.job === "mage" && has(actor, 3) && growthReady(battle, actor, "castShield", 8)) growthShield(battle, actor, .12)
  const ally = partner(battle, actor, 250)
  if (ally && mod(actor, "balance") && growthReady(battle, actor, "handoff", 8)) growthShield(battle, ally, .06)
  if (ally && mod(actor, "overtone") && growthReady(battle, actor, "cadence", 8)) ally.actionAt = Math.max(battle.time, ally.actionAt - .6)
}
export function growthHeal(battle: EdgeBattle, source: EdgeUnit, target: EdgeUnit, gain: number, derived: boolean) {
  if (derived || gain <= 0 || !isFighter(source)) return
  const support = source.card.job === "support"
  if ((support && has(source, 1) || mod(source, "medic")) && growthReady(battle, source, "healShield", support && has(source, 1) ? 4 : 6)) growthShield(battle, target, .08)
  if (support && has(source, 3) && growthReady(battle, source, "healCleanse", 8)) growthCleanse(battle, target)
  if (support && has(source, 5) && source !== target && growthReady(battle, source, "healRelay", 8)) target.actionAt = Math.max(battle.time, target.actionAt - 1.5)
  if (source !== target && combo(source, "rescue") && sameSide(battle, source.id, target.id) && growthReady(battle, source, "comboRescue", 8)) {
    growthCleanse(battle, target)
    const ally = battleFighters(battle).filter(unit => unit !== target && unit.hp > 0 && unit.hp < unit.maxHp && !isOutside(unit) &&
      sameSide(battle, target.id, unit.id) && edgeDistance(unit, target) <= 180).sort((a,b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
    if (ally) growthMend(battle, ally, ally.maxHp * .06)
  }
}
/** Called before death resolution. One life per battle, shared by rank sources. */
export function growthSurvive(battle: EdgeBattle, target: EdgeUnit) {
  if (target.hp > 0 || !isFighter(target) || !has(target, 4) || !["tank", "support"].includes(target.card.job) || target.once.has("growth/survive")) return
  target.once.add("growth/survive"); target.hp = Math.round(target.maxHp * .20)
  growthShield(battle, target, .10, 2)
}
export function growthHurt(battle: EdgeBattle, target: EdgeUnit, lost: number) {
  if (lost <= 0 || target.hp <= 0 || !isFighter(target)) return
  if (lost > 0 && target.hp > 0 && mod(target, "aegis") && growthReady(battle, target, "modBarrier", 8)) growthShield(battle, target, .10)
  if (mod(target, "plate") && target.hp < target.maxHp * .4 && growthReady(battle, target, "brace", 10)) growthShield(battle, target, .12)
  if (mod(target, "core") && target.hp < target.maxHp * .45 && !target.once.has("growth/secondWind")) {
    target.once.add("growth/secondWind"); growthMend(battle, target, target.maxHp * .12)
  }
  if (combo(target, "bastion") && target.hp < target.maxHp * .6 && growthReady(battle, target, "comboBastion", 8)) {
    growthShield(battle, target, .14)
    const ally = partner(battle, target, 210, true)
    if (ally) growthShield(battle, ally, .08)
  }
}
/** Defender-owned response: Bosses and summon bodies can be attackers without owning growth effects. */
export function growthRetaliate(battle: EdgeBattle, attacker: EdgeUnit | undefined, target: EdgeUnit, damage: number, direct: boolean,
  extraDamage: (source: EdgeUnit, victim: EdgeUnit, raw: number) => void) {
  if (!direct || damage <= 0 || battle.phase !== "running" || battle.finishedAt !== null || !attacker || attacker.hp <= 0 || target.hp <= 0 ||
    unitOf(battle, attacker.id) !== attacker || sameSide(battle, attacker.id, target.id) ||
    !isFighter(target) || target.card.job !== "tank" || !has(target, 3)) return
  if (isSummonId(attacker.id) && !activeDeployments(battle).some(({ deployment }) => deployment.bodies.some(body => body === attacker))) return
  if (growthReady(battle, target, "reflect", 5)) extraDamage(target, attacker, target.attack * .35)
}
/** Offensive growth belongs to the actual fighter's own hit, never a summon or a Boss. */
export function growthHit(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit, cast: SkillCast, damage: number, direct: boolean,
  extraDamage: (source: EdgeUnit, victim: EdgeUnit, raw: number) => void, push: (amount: number) => void) {
  if (!direct || damage <= 0 || !isFighter(actor) || cast.summon || sameSide(battle, actor.id, target.id)) return
  const job = actor.card.job
  if (mod(actor, "drive") && cast.skill && cast.used.has("manual") && target.hp > 0 && growthReady(battle, actor, "overdrive", 6)) extraDamage(actor, target, actor.attack * .20)
  if ((actor.passiveAt["growth/momentumUntil"] ?? -1) >= battle.time) {
    actor.passiveAt["growth/momentumUntil"] = -1; push(24)
  }
  if ((actor.passiveAt["growth/overloadUntil"] ?? -1) >= battle.time && target.hp > 0) {
    actor.passiveAt["growth/overloadUntil"] = -1; extraDamage(actor, target, actor.attack * .45)
  }
  if (job === "warrior" && has(actor, 1)) growthMend(battle, actor, damage * .12)
  if (mod(actor, "fang") && growthReady(battle, actor, "modLeech", 4)) growthMend(battle, actor, damage * .10)
  if (job === "warrior") {
    if (has(actor, 2) && growthReady(battle, actor, "push", 6)) push(32)
    if (has(actor, 3) && !target.hp && growthReady(battle, actor, "killMend", 8)) growthMend(battle, actor, actor.maxHp * .25)
    if (has(actor, 4) && actor.hp < actor.maxHp * .4 && growthReady(battle, actor, "lowShield", 12)) growthShield(battle, actor, .18)
  }
  if (job === "tank" && has(actor, 5) && growthReady(battle, actor, "push", 6)) push(65)
  if (job === "mage") {
    if (has(actor, 1) && target.hp && growthReady(battle, actor, "frost", 6)) battle.runtime.buffs.push({ id: "growth/frost/" + actor.id + "/" + battle.time,
      cast, target: target.id, kind: "slow", values: [30], style: "growth", until: battle.time + 2 })
    if (has(actor, 2) && growthReady(battle, actor, "splash", 7)) for (const other of battleUnits(battle)) {
      if (other !== target && other.hp && !sameSide(battle, actor.id, other.id) && edgeDistance(other, target) <= 130) extraDamage(actor, other, actor.attack * .45)
    }
  }
  if ((job === "warrior" || job === "mage") && has(actor, 5) && growthReady(battle, actor, "relay", 8)) {
    const ally = partner(battle, actor, 250)
    if (ally) ally.actionAt = Math.max(battle.time, ally.actionAt - 1.5)
  }
}
export function tickGrowth(battle: EdgeBattle, dt: number) {
  for (const unit of battleFighters(battle)) {
    if (!unit.hp || isOutside(unit) || !unit.growth) continue
    if (unit.card.job === "tank" && has(unit, 1) && !unit.once.has("growth/open")) {
      unit.once.add("growth/open"); growthShield(battle, unit, .22, 10)
    }
    const regen = (unit.passiveAt["growth/regenBank"] ?? 0) + unit.maxHp * unit.growth.regen * dt * healingReceived(battle, unit)
    if (regen >= 1) growthMend(battle, unit, Math.floor(regen), true)
    unit.passiveAt["growth/regenBank"] = regen % 1
    if (has(unit, 2) && ["tank", "support"].includes(unit.card.job) && growthReady(battle, unit, "aid", unit.card.job === "tank" ? 5 : 6)) {
      const ally = partner(battle, unit, unit.card.job === "tank" ? 210 : 230, true)
      if (ally) {
        if (unit.card.job === "tank") growthShield(battle, ally, .08)
        else growthMend(battle, ally, ally.maxHp * .08)
      }
    }
  }
}
