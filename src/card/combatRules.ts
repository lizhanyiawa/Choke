import { SKILLS, type SkillDef, type SubJob } from "./jobs"
import type { Job } from "./types"

export const COMBAT_VERSIONS = ["legacy-v1", "four-v2"] as const
export type CombatVersion = typeof COMBAT_VERSIONS[number]
export const combatVersionOf = (input: { combatVersion?: CombatVersion }): CombatVersion => input.combatVersion ?? "legacy-v1"

interface CommonCombat {
  template: SubJob; range: number; speed: number; actionCooldown: number; power: number; mechanic: string
}
/** Four actual combat templates. Legacy IDs here are asset adapters, never the card's old hash identity. */
export const FOUR_JOB_COMBAT: Record<Job, CommonCombat> = {
  tank: { template: { id: "bulwark", label: "坦克", archetype: "tank", hp: 1.35, atk: .8, def: 1.32, int: .8,
    tags: ["tank"], skills: ["bulwark_guard", "warden_bash", "bulwark_thorns", "warden_hold"] },
    range: 116, speed: 161, actionCooldown: 6.5, power: .17, mechanic: "坦克在后排队友 165 范围内提供护卫，阻止切入战术的额外增伤；伤害分担仍需装备援护技能。" },
  warrior: { template: { id: "berserker", label: "战斗", archetype: "warrior", hp: 1, atk: 1.30, def: .85, int: 1.30,
    tags: [], skills: ["berserker_cleave", "ranger_volley", "berserker_blood", "berserker_rage"] },
    range: 158, speed: 196, actionCooldown: 5, power: .13, mechanic: "统一近战模板。远射、切入、断法和控制追击由当前配装提供，不由旧来源赠送。" },
  mage: { template: { id: "warlock", label: "法师", archetype: "mage", hp: .87, atk: 1.72, def: .78, int: 1.72,
    tags: [], skills: ["warlock_starfire", "binder_bind", "warlock_lowhp", "binder_focus"] },
    range: 258, speed: 179, actionCooldown: 5.5, power: .105, mechanic: "攻击统一随 ATK 成长，范围与控制由技能决定。法师属于后排，可由近处坦克或护卫战术保护。" },
  support: { template: { id: "healer", label: "辅助", archetype: "support", hp: 1.03, atk: 1.52, def: .92, int: 1.52,
    tags: [], skills: ["healer_heal", "bard_inspire", "healer_plus", "bard_aura"] },
    range: 208, speed: 185, actionCooldown: 5.3, power: .09, mechanic: "治疗和增益由技能决定，基础攻击随 ATK 成长。辅助属于后排，自然恢复由培养和装备提供。" },
}
export const commonSkills = (job: Job): SkillDef[] => FOUR_JOB_COMBAT[job].template.skills.map(id => SKILLS[id])
/** A visible ranged-kit effect, rather than a hidden ranger identity stat. */
export const RANGED_KIT_REACH = 116
