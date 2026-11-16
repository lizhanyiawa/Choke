import { combatHasRole } from "../combatRules"
import type { EdgeBattle, EdgeUnit, EdgeUnitId } from "../edgeBattle"
import type { SubJobId } from "@/card/jobs"
import { areaHits, clamp, edgeDistance, isOutside, type EdgePoint } from "./geometry"
import { alliesOf, isFighter, isSummonId, sameSide, unitOf } from "./state"

export const HEAL_CUT = { amount: 30, duration: 4 }
export const SPARRING_HEALING = { start: 120, fullDecay: 240, minimum: .30 }
export const BULWARK_COVER = { name: "贴身护卫", id: "bulwark/cover", range: 190, share: 60, cooldown: 3.6 }
export const WARDEN_CONTROL = { style: "warden-control", distance: 40, slow: 28, follow: 22, duration: 4, cooldown: 6 }
export const DEBUFFS = new Set(["slow", "root", "armor", "dot", "short", "vuln", "weak", "taunt", "stall", "healcut"])
export const matchesCleanse = (kind: string, style: string) =>
  !style || style === "borrowed" || kind === style || style === "dotslow" && (kind === "dot" || kind === "slow")
export const GUARD_REACH = 165
const ASSASSIN_REACH = 230
const ASSASSIN_BONUS = 18
const SUMMON_BONUS = 30
const CONTROL_BONUS = 16
const CONTROL_WINDOW = 2.8

const escort = `在场内且距法师、游侠或辅助队友 ${GUARD_REACH} 内时，挡住刺客的切后排增伤。`
const controlFollow = `队友战坦或缚术师在 ${CONTROL_WINDOW} 秒内推拉敌人，或敌人仍被他们定身时，下一次出手对该敌首次有效命中伤害 +${CONTROL_BONUS}%。`
const wardenFollow = `战坦压制期间，队友的普攻和战技每次出手对其首次有效命中伤害 +${WARDEN_CONTROL.follow}%，同类增伤取较高值。`
export const EDGE_ROLE_DETAILS: Partial<Record<SubJobId, string>> = {
  bulwark: `在场内，每 ${BULWARK_COVER.cooldown} 秒可替 ${BULWARK_COVER.range} 内一张场内友卡分担一次敌方直击，代挡护盾吸收后剩余伤害的 ${BULWARK_COVER.share}%。` + escort,
  warden: `战技推拉敌人实际位移至少 ${WARDEN_CONTROL.distance} 后，减速 ${WARDEN_CONTROL.slow}%，持续 ${WARDEN_CONTROL.duration} 秒。` + wardenFollow + escort,
  paladin: escort,
  binder: "推拉或定身可接游侠、咒术师的增伤。",
  ranger: controlFollow + wardenFollow,
  warlock: controlFollow + wardenFollow,
  assassin: `在 ${ASSASSIN_REACH} 内攻击法师、游侠或辅助时，若对方 ${GUARD_REACH} 内没有场内坦克或圣骑士，本次出手对其首次有效命中伤害 +${ASSASSIN_BONUS}%。`,
  spellbreaker: `每次出手首个有效命中的存活敌卡重伤 ${HEAL_CUT.duration} 秒，受治疗 −${HEAL_CUT.amount}%。每次出手对召唤物首次有效命中伤害 +${SUMMON_BONUS}%。`,
}

export function hasHealCut(battle: EdgeBattle, unit: EdgeUnit, at = battle.time) {
  return battle.runtime.buffs.some((buff) => buff.target === unit.id && buff.kind === "healcut" && buff.until > at)
}

export function sparringHealingMultiplier(time: number) {
  const { start, fullDecay, minimum } = SPARRING_HEALING
  const progress = clamp((time - start) / (fullDecay - start), 0, 1)
  return 1 - (1 - minimum) * progress
}

export function healingReceived(battle: EdgeBattle, unit: EdgeUnit, at = battle.time) {
  const healCut = hasHealCut(battle, unit, at) ? 1 - HEAL_CUT.amount / 100 : 1
  return battle.sparring ? healCut * sparringHealingMultiplier(at) : healCut
}

export function exposedBackline(battle: EdgeBattle, unit: EdgeUnit) {
  if (!isFighter(unit) || (unit.card.job !== "mage" && unit.card.job !== "support" && !combatHasRole(unit, "ranger"))) return false
  return !alliesOf(battle, unit.id).some((ally) => ally.id !== unit.id && ally.hp && !isOutside(ally) &&
    (ally.card.job === "tank" || combatHasRole(ally, "paladin")) && edgeDistance(ally, unit) <= GUARD_REACH)
}

export function nearbyBulwark(battle: EdgeBattle, target: EdgeUnit, at: EdgePoint = target, time = battle.time,
  spent?: ReadonlyMap<EdgeUnitId, number>) {
  if (!isFighter(target) || isOutside(at)) return undefined
  let protector
  let bestGap = Infinity
  for (const ally of alliesOf(battle, target.id)) {
    if (ally === target || !ally.hp || !combatHasRole(ally, "bulwark") || isOutside(ally) ||
      Math.max(ally.passiveAt[BULWARK_COVER.id] ?? 0, spent?.get(ally.id) ?? 0) > time) continue
    const gap = edgeDistance(ally, at)
    if (gap > BULWARK_COVER.range || gap >= bestGap) continue
    protector = ally
    bestGap = gap
  }
  return protector
}

function controlledByPartner(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit, time: number) {
  const controller = (id?: EdgeUnitId) => {
    if (id === undefined || id === actor.id || !sameSide(battle, actor.id, id)) return false
    const unit = unitOf(battle, id)
    return unit && isFighter(unit) && (combatHasRole(unit, "warden") || combatHasRole(unit, "binder"))
  }
  const history = battle.runtime.histories.get(target.id)
  if (history && (
    (time - history.pushAt <= CONTROL_WINDOW && controller(history.pushBy)) ||
    (time - history.pullAt <= CONTROL_WINDOW && controller(history.pullBy))
  )) return true
  return battle.runtime.buffs.some((buff) => buff.kind === "root" && buff.target === target.id &&
    buff.until > time && controller(buff.cast.owner))
}

export function roleDamageScale(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit, time = battle.time) {
  if (!isFighter(actor)) return 1
  const warden = battle.runtime.buffs.some((buff) => buff.target === target.id && buff.kind === "slow" &&
    buff.style === WARDEN_CONTROL.style && buff.until > time && buff.cast.owner !== actor.id &&
    sameSide(battle, actor.id, buff.cast.owner)) ? 1 + WARDEN_CONTROL.follow / 100 : 1
  let scale = warden
  if (combatHasRole(actor, "assassin") && edgeDistance(actor, target) <= ASSASSIN_REACH && exposedBackline(battle, target)) scale = Math.max(scale, 1 + ASSASSIN_BONUS / 100)
  if (combatHasRole(actor, "spellbreaker") && isSummonId(target.id)) scale = Math.max(scale, 1 + SUMMON_BONUS / 100)
  if ((combatHasRole(actor, "ranger") || combatHasRole(actor, "warlock")) && controlledByPartner(battle, actor, target, time)) scale = Math.max(scale, 1 + CONTROL_BONUS / 100)
  return scale
}

export function attackFocus(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit) {
  const history = battle.runtime.histories.get(target.id)
  const follow = history && history.hitBy !== actor.id && sameSide(battle, actor.id, history.hitBy) &&
    battle.time - history.hitAt <= 3 ? .24 : 0
  const wound = isFighter(actor) && combatHasRole(actor, "spellbreaker") && isFighter(target) && target.hp < target.maxHp * .85 &&
    !hasHealCut(battle, target)
  const ward = history?.wardBroken
  const opening = ward && ward.by !== actor.id && battle.time - ward.at <= 2.8 && sameSide(battle, actor.id, ward.by) &&
    target.hp < target.maxHp * .86 && (target.shieldUntil <= battle.time + .4 || target.shield < actor.attack * .65) &&
    !battle.runtime.fields.some(field => field.mode === "guard" && field.until > battle.time + .3 && field.capacity >= actor.attack * .55 &&
      sameSide(battle, field.cast.owner, target.id) && areaHits(field.area, target))
    ? Math.min(.42, ward.capacity / target.maxHp * 1.65) : 0
  return follow + opening + (wound ? .17 : 0)
}

export function damageScore(battle: EdgeBattle, actor: EdgeUnit, target: EdgeUnit, power: number) {
  const outside = isOutside(target)
  const vulnerability = .35 * (1 - target.hp / target.maxHp) + (outside ? .22 : 0)
  const scale = roleDamageScale(battle, actor, target)
  const hit = actor.attack * power * scale * (1 - target.armor) * (outside ? 1.35 : 1)
  const shield = target.shieldUntil > battle.time + .15 ? target.shield : 0
  const excess = hit - target.hp - shield
  const lethal = excess >= 0 && !battle.runtime.fields.some((field) => field.mode === "guard" && field.capacity > excess &&
    field.until > battle.time + .3 && sameSide(battle, target.id, field.cast.owner) && areaHits(field.area, target)) &&
    !battle.runtime.buffs.some((buff) => buff.kind === "defy" && buff.target === target.id && buff.until > battle.time + .15)
  const echo = !lethal && isFighter(actor) ? battle.runtime.watches.reduce((value, watch) => {
    const { cast } = watch
    if (watch.target !== target.id || watch.until <= battle.time + .45 || watch.uses <= 0 ||
      cast.skill?.id !== "bard/L/A1" || !sameSide(battle, actor.id, cast.owner) || cast.used.has("bardVoice/" + actor.id)) return value
    return value + watch.step.operations[0].args[0] * cast.basis / actor.attack
  }, 0) : 0
  return power * (1 + vulnerability + attackFocus(battle, actor, target)) * scale + (lethal ? .8 : echo * .8)
}
