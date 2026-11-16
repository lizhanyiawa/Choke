import type { Job, Rarity } from "./types"
import type { CombatVersion } from "./combatRules"

/** Shared by API, preparation UI and the real-time battle. Percentages are fractions. */
export const JOBS = ["warrior", "tank", "mage", "support"] as const
export const JOB_LABEL: Record<Job, string> = { warrior: "战斗", tank: "坦克", mage: "法师", support: "辅助" }
export const GROWTH = {
  rankCap: 5, rankCosts: [40, 70, 110, 160, 220],
  spdPerRank: 9, spdCap: 100,
  actionPerSpd: .004, actionCap: .30,
  reachPerSpd: .0025, reachCap: .20,
  movePerSpd: .003, moveCap: .25,
  modSlots: 3, statPercentCap: 1, critCap: 60, critDamageCap: 3,
  armorDivisor: 2200, armorKnee: .38, armorTail: .18,
  healFlatCap: 100, healPercentCap: .75, regenCap: .025,
  starterTraining: 120, winTraining: 30, winExp: 100, masteryPerWin: 25,
  pveSeconds: 300, pveMaxCommands: 1500,
  masteryStep: 100, masteryCap: 10,
} as const

export const RANK_UNLOCKS: Record<Rarity, readonly number[]> = {
  C: [5], UC: [5], R: [1, 3, 5], E: [1, 3, 5],
  L: [1, 2, 4, 5], Radiant: [1, 2, 4, 5], Prismatic: [1, 2, 3, 4, 5],
}
export const bounded = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min))
export const rankOf = (value: number) => Math.floor(bounded(value, 0, GROWTH.rankCap))
export const rankEffects = (rarity: Rarity, rank: number) => RANK_UNLOCKS[rarity].filter(step => step <= rankOf(rank)).length
export const RANK_EFFECT_NAMES: Record<Job, readonly string[]> = {
  warrior: ["吸血：直接命中恢复伤害的 12%", "追击：每 6 秒首击追加 32 距离击退", "斩势：击杀后回复 25% 生命（每 8 秒）", "护锋：生命低于 40% 时获得 18% 护盾（每 12 秒）", "连携：每 8 秒命中为最近队友重置 1.5 秒行动冷却"],
  tank: ["开盾：开场获得 22% 生命护盾", "护邻：每 5 秒为 210 范围内最低血量队友提供 8% 护盾", "反震：每 5 秒受击反弹 35% 攻击力", "不屈：每局一次，致命伤后保留 20% 生命", "震退：每 6 秒直接命中额外击退 65 距离"],
  mage: ["霜印：每 6 秒首击减速 30%，持续 2 秒", "回响：每 7 秒首击溅射附近敌人，造成 45% 攻击力伤害", "法盾：每 8 秒施放技能获得 12% 生命护盾", "破缚：每 10 秒移动解除自身定身和减速", "双星：每 8 秒命中为最近队友重置 1.5 秒行动冷却"],
  support: ["余温：有效治疗附赠 8% 生命护盾（每 4 秒）", "急救：每 6 秒恢复 230 范围内最低血量队友 8% 生命", "净化：每 8 秒有效治疗清除目标定身和减速", "续命：每局一次，致命伤后保留 20% 生命", "接力：每 8 秒有效治疗为队友重置 1.5 秒行动冷却"],
}

export interface ModStats {
  atk?: number; def?: number; hp?: number
  atkPct?: number; defPct?: number; hpPct?: number
  crit?: number; critDamage?: number; heal?: number; healPct?: number
  spd?: number; spdPct?: number; regen?: number
}
export interface GrowthMod {
  id: string; code: string; name: string; rare: boolean; cost: number; clears: number
  stats: ModStats; effect: string
  description: string
}
export const GROWTH_MODS: readonly GrowthMod[] = [
  { id: "drive", code: "HR", name: "驱动片", rare: false, cost: 25, clears: 0, stats: { atk: 70, atkPct: .08 }, effect: "overdrive", description: "ATK +70、+8%。每 6 秒首次战技直击追加 20% D 的衍生伤害。" },
  { id: "plate", code: "HT", name: "装甲片", rare: false, cost: 25, clears: 0, stats: { def: 90, defPct: .10 }, effect: "brace", description: "DEF +90、+10%。生命低于 40% 时受击获得 12% H 护盾，每 10 秒一次。" },
  { id: "core", code: "NF", name: "生命核", rare: false, cost: 25, clears: 0, stats: { hp: 120, hpPct: .10 }, effect: "secondWind", description: "HP +120、+10%。每局首次受击后生命低于 45% 且仍存活，回复 12% H。不能复活。" },
  { id: "balance", code: "EZ", name: "平衡桥", rare: false, cost: 35, clears: 0, stats: { atk: 35, def: 45, hp: 65 }, effect: "handoff", description: "ATK +35、DEF +45、HP +65。施放战技为 250 内最近队友提供 6% H 护盾，每 8 秒一次。" },
  { id: "fang", code: "HD", name: "回声齿", rare: true, cost: 100, clears: 3, stats: { crit: 10, critDamage: .25 }, effect: "leech", description: "暴击率 +10 个百分点，暴伤 +25 个百分点。每 4 秒直接命中吸血 10%。" },
  { id: "aegis", code: "SD", name: "承压棱镜", rare: true, cost: 100, clears: 3, stats: { hpPct: .14, defPct: .14 }, effect: "barrier", description: "HP、DEF +14%。每 8 秒受击获得 10% H 护盾。" },
  { id: "medic", code: "RX", name: "余音针", rare: true, cost: 100, clears: 3, stats: { heal: 24, healPct: .20 }, effect: "relay", description: "每次非衍生治疗 +24，然后治疗量 +20%。每 6 秒有效治疗给予 8% H 护盾。" },
  { id: "stride", code: "DT", name: "节拍器", rare: true, cost: 100, clears: 3, stats: { spd: 18 }, effect: "momentum", description: "SPD +18。合法移动指令后 4 秒内首次直击额外击退 24，每 6 秒一次。" },
  { id: "overtone", code: "NC", name: "倍频晶", rare: true, cost: 130, clears: 5, stats: { spdPct: .25, healPct: .12 }, effect: "cadence", description: "SPD +25%、Heal +12%。施放战技让 250 内最近队友行动冷却减少 0.6 秒，每 8 秒一次；不清公共冷却。" },
  { id: "spring", code: "SO", name: "复苏环", rare: true, cost: 130, clears: 5, stats: { regen: .004 }, effect: "cleanse", description: "每秒自然恢复 0.4% H。每 10 秒合法移动清除自身定身和减速。" },
]
export const modById = (id: string) => GROWTH_MODS.find(mod => mod.id === id)
/** Pads old two-slot saves without reordering, transferring or dropping their items. Unknown IDs stay inert. */
export const modSlots = (ids: readonly string[] = []) => Array.from({ length: GROWTH.modSlots }, (_, i) => typeof ids[i] === "string" ? ids[i] : "")
export const equippedMods = (ids: readonly string[] = []) => [...new Set(modSlots(ids).filter(id => !!modById(id)))]
export const MOD_COMBOS = [
  { id: "overload", name: "压线超载", mods: ["drive", "fang", "stride"], description: "移动后 4 秒内首个直击追加 45% D 衍生伤害，每 8 秒一次。适合走位爆发。" },
  { id: "bastion", name: "不落守线", mods: ["plate", "core", "aegis"], description: "低于 60% 生命时受击，为自己盖 14% H 护盾，并为 210 内最低血量队友盖 8% H 护盾，每 8 秒一次。" },
  { id: "rescue", name: "救援回路", mods: ["balance", "medic", "spring"], description: "有效治疗另一张友卡后，净化其定身/减速，并为该卡 180 内另一名伤员回复 6% H，每 8 秒一次。" },
  { id: "tempo", name: "转拍接力", mods: ["stride", "overtone", "balance"], description: "合法移动让 250 内最近队友的行动冷却减少 1.25 秒，每 10 秒一次。不会清空公共冷却。" },
] as const
export const modCombos = (ids: readonly string[]) => MOD_COMBOS.filter(combo => combo.mods.every(id => equippedMods(ids).includes(id)))
/** Preserve the old low-level curve; give DEF a diminishing return above its former hard cap. */
export function armorForDef(def: number) {
  const value = bounded(def, 0, 1e9), ratio = value / (value + GROWTH.armorDivisor)
  return Math.min(GROWTH.armorKnee, ratio) + GROWTH.armorTail * Math.max(0, ratio - GROWTH.armorKnee) / (1 - GROWTH.armorKnee)
}
export interface CultivationProfile {
  combatVersion?: CombatVersion
  version: 1; training: number; clears: number; title: Job | null
  mastery: Record<Job, number>; inventory: string[]; equipment: Record<string, string[]>
}
export function newCultivation(): CultivationProfile {
  return { version: 1, combatVersion: "four-v2", training: GROWTH.starterTraining, clears: 0, title: null,
    mastery: { warrior: 0, tank: 0, mage: 0, support: 0 }, inventory: ["drive", "plate", "core", "balance"], equipment: {} }
}
export function masteryLevel(xp: number) { return Math.min(GROWTH.masteryCap, Math.floor(bounded(xp, 0, 1e8) / GROWTH.masteryStep)) }
export function titleBonus(profile?: Pick<CultivationProfile, "title" | "mastery">) {
  const job = profile?.title
  const level = job ? masteryLevel(profile.mastery[job]) : 0
  const power = level ? .35 + .65 * level / GROWTH.masteryCap : 0
  return { crit: job === "warrior" ? 18 * power : 0, critDamage: job === "warrior" ? .45 * power : 0,
    reduction: job === "tank" ? .18 * power : 0, movement: job === "mage" ? .24 * power : 0,
    regen: job === "support" ? .008 * power : 0 }
}
export function titleDescription(profile: Pick<CultivationProfile, "title" | "mastery">) {
  const b = titleBonus(profile)
  if (!profile.title) return "未装备称号"
  if (!masteryLevel(profile.mastery[profile.title])) return "熟练度达到 100 解锁；每场胜利培养所有出战职业"
  return profile.title === "warrior" ? `全队暴击 +${b.crit.toFixed(1)}%，暴伤 +${(b.critDamage * 100).toFixed(1)}%`
    : profile.title === "tank" ? `全队免伤 ${(b.reduction * 100).toFixed(1)}%`
      : profile.title === "mage" ? `全队移动速度 +${(b.movement * 100).toFixed(1)}%` : `全队每秒恢复 ${(b.regen * 100).toFixed(2)}% 最大生命`
}
export interface CultivationInput { mods: string[]; title?: Pick<CultivationProfile, "title" | "mastery"> }
export interface CombatGrowth {
  spd: number; action: number; reach: number; movement: number; crit: number; critDamage: number
  reduction: number; heal: number; healPct: number; regen: number; effects: number; mods: string[]
}
export function modTotals(ids: readonly string[]): Required<ModStats> {
  const sum: Required<ModStats> = { atk: 0, def: 0, hp: 0, atkPct: 0, defPct: 0, hpPct: 0,
    crit: 0, critDamage: 0, heal: 0, healPct: 0, spd: 0, spdPct: 0, regen: 0 }
  for (const id of equippedMods(ids)) {
    const mod = modById(id)
    if (mod) for (const key of Object.keys(mod.stats) as (keyof ModStats)[]) sum[key] += mod.stats[key] ?? 0
  }
  return sum
}
export function combatGrowth(rarity: Rarity, rank: number, input?: CultivationInput): CombatGrowth {
  const m = modTotals(input?.mods ?? [])
  const title = titleBonus(input?.title)
  const spd = bounded((rankOf(rank) * GROWTH.spdPerRank + m.spd) * (1 + bounded(m.spdPct, 0, 1)), 0, GROWTH.spdCap)
  return { spd, action: Math.min(GROWTH.actionCap, spd * GROWTH.actionPerSpd),
    reach: Math.min(GROWTH.reachCap, spd * GROWTH.reachPerSpd),
    movement: Math.min(GROWTH.moveCap, spd * GROWTH.movePerSpd) + title.movement,
    crit: m.crit + title.crit, critDamage: m.critDamage + title.critDamage, reduction: title.reduction,
    heal: bounded(m.heal, 0, GROWTH.healFlatCap), healPct: bounded(m.healPct, 0, GROWTH.healPercentCap),
    regen: bounded(m.regen + title.regen, 0, GROWTH.regenCap), effects: rankEffects(rarity, rank), mods: equippedMods(input?.mods) }
}
export function composeAttributes(base: { atk: number; def: number; hp: number; int: number }, ids: readonly string[]) {
  const m = modTotals(ids)
  const stat = (value: number, flat: number, pct: number) => Math.round((value + flat) * (1 + bounded(pct, 0, GROWTH.statPercentCap)))
  return { atk: stat(base.atk, m.atk, m.atkPct), int: stat(base.int, m.atk, m.atkPct),
    def: stat(base.def, m.def, m.defPct), hp: stat(base.hp, m.hp, m.hpPct) }
}
