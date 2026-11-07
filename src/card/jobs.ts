import type { CardSkill, Element, Job, Rarity } from "./types"

export type SubJobId =
  | "bulwark"
  | "warden"
  | "berserker"
  | "paladin"
  | "spellbreaker"
  | "ranger"
  | "assassin"
  | "warlock"
  | "lifebringer"
  | "binder"
  | "summoner"
  | "dancer"
  | "healer"
  | "bard"

export type SkillKind = "damage" | "heal" | "guard" | "taunt" | "buff" | "debuff" | "control" | "ap" | "summon" | "passive"

export interface SkillDef {
  id: string
  name: string
  element: Element
  ap: number
  mp?: number
  kind: SkillKind
  power?: number
  hits?: number
  target?: "enemy" | "self" | "ally" | "team"
  stat?: "atk" | "int" | "def"
  amount?: number
  turns?: number
  once?: boolean
  passive?: boolean
  desc: string
}

export interface SubJob {
  id: SubJobId
  label: string
  archetype: Job
  hp: number
  atk: number
  def: number
  int: number
  tags: string[]
  skills: string[]
}

export const ARCHETYPE_COEF: Record<Job, number> = {
  tank: 0.9,
  warrior: 1.1,
  mage: 1.05,
  support: 0.95,
}

export const POISE_COEF: Record<Job, number> = {
  tank: 1.4,
  warrior: 1.2,
  mage: 0.8,
  support: 0.9,
}

const S = (skill: SkillDef) => skill

export const SKILLS: Record<string, SkillDef> = {
  /* 坦克 */
  bulwark_guard: S({ id: "bulwark_guard", name: "铁壁", element: "earth", ap: 1, kind: "guard", target: "self", power: 1, desc: "本回合防御档位 +1" }),
  bulwark_taunt: S({ id: "bulwark_taunt", name: "嘲讽", element: "physical", ap: 1, kind: "taunt", target: "self", turns: 1, desc: "本回合单体攻击强制打自己" }),
  bulwark_quake: S({ id: "bulwark_quake", name: "震地", element: "earth", ap: 2, kind: "damage", power: 1.2, target: "enemy", desc: "1.2× 土属性伤害" }),
  bulwark_thorns: S({ id: "bulwark_thorns", name: "反震", element: "metal", ap: 0, kind: "passive", passive: true, desc: "受击时反弹少量固定伤害" }),

  warden_bash: S({ id: "warden_bash", name: "盾击", element: "physical", ap: 1, kind: "damage", power: 0.9, target: "enemy", desc: "0.9× 物理伤害" }),
  warden_armor: S({ id: "warden_armor", name: "重装甲", element: "metal", ap: 1, kind: "guard", target: "self", power: 2, desc: "本回合防御档位 +2" }),
  warden_stun: S({ id: "warden_stun", name: "击晕", element: "physical", ap: 3, kind: "control", target: "enemy", turns: 1, desc: "硬控，取消目标下一次行动" }),
  warden_hold: S({ id: "warden_hold", name: "坚守", element: "earth", ap: 0, kind: "passive", passive: true, desc: "常驻 DEF 提升" }),

  /* 战士 */
  berserker_cleave: S({ id: "berserker_cleave", name: "裂空斩", element: "physical", ap: 2, kind: "damage", power: 1.6, target: "enemy", desc: "1.6× 物理伤害" }),
  berserker_wind: S({ id: "berserker_wind", name: "追风", element: "thunder", ap: 1, kind: "damage", power: 0.9, target: "enemy", desc: "0.9× 雷属性伤害" }),
  berserker_blood: S({ id: "berserker_blood", name: "血怒", element: "dark", ap: 0, kind: "passive", passive: true, desc: "生命低于 30% 时 ATK 提升" }),
  berserker_rage: S({ id: "berserker_rage", name: "吸血", element: "dark", ap: 0, kind: "passive", passive: true, desc: "造成伤害时回复少量生命" }),

  paladin_smite: S({ id: "paladin_smite", name: "圣光斩", element: "light", ap: 2, kind: "damage", power: 1.2, target: "enemy", desc: "1.2× 光属性伤害" }),
  paladin_protect: S({ id: "paladin_protect", name: "庇护", element: "light", ap: 1, kind: "heal", power: 0.6, target: "team", desc: "为全队回复少量生命" }),
  paladin_judgment: S({ id: "paladin_judgment", name: "审判", element: "light", ap: 3, kind: "damage", power: 2, target: "enemy", desc: "2.0× 光属性伤害" }),
  paladin_aura: S({ id: "paladin_aura", name: "守护光环", element: "light", ap: 0, kind: "passive", passive: true, desc: "全队 DEF 小幅提升" }),

  breaker_break: S({ id: "breaker_break", name: "破盾", element: "physical", ap: 1, kind: "damage", power: 1, target: "enemy", desc: "1.0× 伤害并削 DEF" }),
  breaker_counter: S({ id: "breaker_counter", name: "法术反制", element: "dark", ap: 2, kind: "control", target: "enemy", turns: 1, desc: "打断目标下一次施法" }),
  breaker_rift: S({ id: "breaker_rift", name: "裂法", element: "dark", ap: 2, kind: "damage", power: 1.4, target: "enemy", desc: "1.4× 暗属性伤害" }),
  breaker_swift: S({ id: "breaker_swift", name: "迅捷", element: "thunder", ap: 0, kind: "passive", passive: true, desc: "命中 +5%，可参与抢攻" }),

  ranger_pierce: S({ id: "ranger_pierce", name: "穿甲箭", element: "physical", ap: 2, kind: "damage", power: 1.5, target: "enemy", desc: "1.5× 物理伤害，无视部分 DEF" }),
  ranger_volley: S({ id: "ranger_volley", name: "连射", element: "physical", ap: 1, kind: "damage", power: 0.55, hits: 2, target: "enemy", desc: "2 段 × 0.55×，快速铺 Combo" }),
  ranger_harvest: S({ id: "ranger_harvest", name: "收割", element: "physical", ap: 3, kind: "damage", power: 2.2, target: "enemy", desc: "2.2× 伤害，低血目标额外增伤" }),
  ranger_swift: S({ id: "ranger_swift", name: "迅捷", element: "thunder", ap: 0, kind: "passive", passive: true, desc: "命中 +5%，可参与抢攻" }),

  assassin_backstab: S({ id: "assassin_backstab", name: "背刺", element: "dark", ap: 2, kind: "damage", power: 1.8, target: "enemy", desc: "1.8× 暗属性伤害" }),
  assassin_interrupt: S({ id: "assassin_interrupt", name: "打断", element: "dark", ap: 2, kind: "control", target: "enemy", turns: 1, desc: "取消目标一个已预告行动" }),
  assassin_execute: S({ id: "assassin_execute", name: "暗杀", element: "dark", ap: 3, kind: "damage", power: 2.4, target: "enemy", desc: "2.4× 伤害，斩杀低血目标" }),
  assassin_swift: S({ id: "assassin_swift", name: "迅捷", element: "thunder", ap: 0, kind: "passive", passive: true, desc: "命中 +5%，可参与抢攻" }),

  /* 法师 */
  warlock_starfire: S({ id: "warlock_starfire", name: "星火", element: "fire", ap: 2, kind: "damage", power: 1.6, target: "enemy", desc: "1.6× 火属性魔法伤害" }),
  warlock_frost: S({ id: "warlock_frost", name: "霜缚", element: "ice", ap: 1, kind: "damage", power: 1, target: "enemy", desc: "1.0× 冰属性伤害并降速" }),
  warlock_meteor: S({ id: "warlock_meteor", name: "陨石", element: "fire", ap: 3, kind: "damage", power: 2.4, target: "enemy", desc: "2.4× 火属性魔法伤害" }),
  warlock_lowhp: S({ id: "warlock_lowhp", name: "残血增幅", element: "fire", ap: 0, kind: "passive", passive: true, desc: "生命低于 30% 时 INT 提升" }),

  life_renew: S({ id: "life_renew", name: "回春", element: "wood", ap: 1, kind: "heal", power: 0.8, target: "ally", desc: "回复单体生命" }),
  life_mass: S({ id: "life_mass", name: "群体治疗", element: "wood", ap: 2, kind: "heal", power: 0.6, target: "team", desc: "回复全队生命" }),
  life_revive: S({ id: "life_revive", name: "复苏", element: "light", ap: 3, kind: "heal", power: 1.2, target: "ally", desc: "大幅回复并尝试救回 down 的卡" }),
  life_regen: S({ id: "life_regen", name: "生生不息", element: "wood", ap: 0, kind: "passive", passive: true, desc: "每回合回复少量生命" }),

  binder_sleep: S({ id: "binder_sleep", name: "眠咒", element: "dark", ap: 3, kind: "control", target: "enemy", turns: 1, desc: "硬控，取消目标下一次行动" }),
  binder_charm: S({ id: "binder_charm", name: "魅惑", element: "dark", ap: 2, kind: "debuff", target: "enemy", stat: "atk", amount: 0.2, turns: 2, desc: "目标 ATK −20%，持续 2 回合" }),
  binder_bind: S({ id: "binder_bind", name: "束缚", element: "wood", ap: 1, kind: "debuff", target: "enemy", stat: "def", amount: 0.2, turns: 2, desc: "目标 DEF −20%，持续 2 回合" }),
  binder_focus: S({ id: "binder_focus", name: "专注", element: "light", ap: 0, kind: "passive", passive: true, desc: "控制类技能命中提升" }),

  summoner_call: S({ id: "summoner_call", name: "召唤", element: "dark", ap: 2, kind: "summon", power: 0.5, target: "self", desc: "增加一个自动攻击的侧面支援" }),
  summoner_poison: S({ id: "summoner_poison", name: "毒藤", element: "wood", ap: 1, kind: "debuff", target: "enemy", stat: "def", amount: 0.15, turns: 3, desc: "目标 DEF −15%，持续 3 回合" }),
  summoner_ward: S({ id: "summoner_ward", name: "守护召唤", element: "earth", ap: 1, kind: "guard", target: "self", power: 1, desc: "本回合防御档位 +1" }),
  summoner_aura: S({ id: "summoner_aura", name: "召唤共鸣", element: "dark", ap: 0, kind: "passive", passive: true, desc: "侧面支援伤害提升" }),

  /* 辅助 */
  dancer_step: S({ id: "dancer_step", name: "舞步", element: "light", ap: 1, kind: "ap", amount: 1, target: "team", desc: "本回合 AP +1" }),
  dancer_frenzy: S({ id: "dancer_frenzy", name: "狂热之舞", element: "light", ap: 2, kind: "ap", amount: 3, once: true, target: "team", desc: "本场限 1 次：AP +3" }),
  dancer_grace: S({ id: "dancer_grace", name: "舞者增幅", element: "light", ap: 0, kind: "passive", passive: true, desc: "每回合 AP 恢复 +1" }),
  dancer_veil: S({ id: "dancer_veil", name: "回旋", element: "light", ap: 1, kind: "buff", stat: "def", amount: 0.15, turns: 1, target: "team", desc: "全队 DEF +15%，持续 1 回合" }),

  healer_heal: S({ id: "healer_heal", name: "治疗", element: "light", ap: 1, kind: "heal", power: 1, target: "ally", desc: "回复单体生命" }),
  healer_cleanse: S({ id: "healer_cleanse", name: "净化", element: "light", ap: 1, kind: "heal", power: 0.3, target: "team", desc: "回复少量生命并清除负面" }),
  healer_revive: S({ id: "healer_revive", name: "抬人", element: "light", ap: 3, kind: "heal", power: 1.5, target: "ally", desc: "救回一张 down 的卡" }),
  healer_plus: S({ id: "healer_plus", name: "医者仁心", element: "wood", ap: 0, kind: "passive", passive: true, desc: "治疗量提升" }),

  bard_inspire: S({ id: "bard_inspire", name: "鼓舞", element: "light", ap: 1, kind: "buff", stat: "atk", amount: 0.2, turns: 2, target: "team", desc: "全队 ATK +20%，持续 2 回合" }),
  bard_ward: S({ id: "bard_ward", name: "战歌", element: "light", ap: 1, kind: "buff", stat: "def", amount: 0.2, turns: 2, target: "team", desc: "全队 DEF +20%，持续 2 回合" }),
  bard_anthem: S({ id: "bard_anthem", name: "英勇颂", element: "light", ap: 2, kind: "buff", stat: "int", amount: 0.25, turns: 2, target: "team", desc: "全队 INT +25%，持续 2 回合" }),
  bard_aura: S({ id: "bard_aura", name: "余音", element: "light", ap: 0, kind: "passive", passive: true, desc: "全队增益效果延长" }),
}

export const SUBJOBS: Record<SubJobId, SubJob> = {
  bulwark: { id: "bulwark", label: "肉坦", archetype: "tank", hp: 1.5, atk: 0.55, def: 1.4, int: 0.55, tags: ["tank", "taunt", "thorns"], skills: ["bulwark_guard", "bulwark_taunt", "bulwark_quake", "bulwark_thorns"] },
  warden: { id: "warden", label: "战坦", archetype: "tank", hp: 1.2, atk: 0.95, def: 1.25, int: 0.6, tags: ["tank", "taunt", "control"], skills: ["warden_bash", "warden_armor", "warden_stun", "warden_hold"] },
  berserker: { id: "berserker", label: "狂战士", archetype: "warrior", hp: 1.05, atk: 1.55, def: 0.75, int: 0.65, tags: ["lowhp", "lifesteal"], skills: ["berserker_cleave", "berserker_wind", "berserker_blood", "berserker_rage"] },
  paladin: { id: "paladin", label: "圣骑士", archetype: "warrior", hp: 1.25, atk: 1.0, def: 1.15, int: 0.6, tags: ["tank", "protect"], skills: ["paladin_smite", "paladin_protect", "paladin_judgment", "paladin_aura"] },
  spellbreaker: { id: "spellbreaker", label: "破法者", archetype: "warrior", hp: 0.95, atk: 1.15, def: 0.85, int: 1.05, tags: ["swift", "break"], skills: ["breaker_break", "breaker_counter", "breaker_rift", "breaker_swift"] },
  ranger: { id: "ranger", label: "游侠", archetype: "warrior", hp: 0.7, atk: 1.5, def: 0.7, int: 1.1, tags: ["swift", "pierce", "execute"], skills: ["ranger_pierce", "ranger_volley", "ranger_harvest", "ranger_swift"] },
  assassin: { id: "assassin", label: "刺客", archetype: "warrior", hp: 0.75, atk: 1.2, def: 0.7, int: 1.35, tags: ["swift", "interrupt", "execute"], skills: ["assassin_backstab", "assassin_interrupt", "assassin_execute", "assassin_swift"] },
  warlock: { id: "warlock", label: "咒术师", archetype: "mage", hp: 0.75, atk: 0.7, def: 0.7, int: 1.85, tags: ["lowhp"], skills: ["warlock_starfire", "warlock_frost", "warlock_meteor", "warlock_lowhp"] },
  lifebringer: { id: "lifebringer", label: "生术师", archetype: "mage", hp: 0.95, atk: 0.55, def: 0.8, int: 1.7, tags: ["heal", "regen"], skills: ["life_renew", "life_mass", "life_revive", "life_regen"] },
  binder: { id: "binder", label: "缚术师", archetype: "mage", hp: 0.85, atk: 0.65, def: 0.8, int: 1.7, tags: ["control"], skills: ["binder_sleep", "binder_charm", "binder_bind", "binder_focus"] },
  summoner: { id: "summoner", label: "召唤师", archetype: "mage", hp: 0.9, atk: 0.6, def: 0.85, int: 1.65, tags: ["summon"], skills: ["summoner_call", "summoner_poison", "summoner_ward", "summoner_aura"] },
  dancer: { id: "dancer", label: "舞者", archetype: "support", hp: 1.0, atk: 0.55, def: 0.9, int: 1.55, tags: ["ap"], skills: ["dancer_step", "dancer_frenzy", "dancer_veil", "dancer_grace"] },
  healer: { id: "healer", label: "治疗师", archetype: "support", hp: 1.05, atk: 0.5, def: 0.9, int: 1.55, tags: ["heal", "cleanse"], skills: ["healer_heal", "healer_cleanse", "healer_revive", "healer_plus"] },
  bard: { id: "bard", label: "吟游诗人", archetype: "support", hp: 0.95, atk: 0.6, def: 0.95, int: 1.5, tags: ["buff"], skills: ["bard_inspire", "bard_ward", "bard_anthem", "bard_aura"] },
}

export const SUBJOBS_BY_ARCHETYPE: Record<Job, SubJobId[]> = {
  tank: ["bulwark", "warden"],
  warrior: ["berserker", "paladin", "spellbreaker", "ranger", "assassin"],
  mage: ["warlock", "lifebringer", "binder", "summoner"],
  support: ["dancer", "healer", "bard"],
}

function hashOf(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export function subjobFor(seed: string, job: Job): SubJob {
  const pool = SUBJOBS_BY_ARCHETYPE[job]
  return SUBJOBS[pool[hashOf(`${seed}|subjob`) % pool.length]]
}

/** 池卡/本体卡的技能种子：pool-123 / hero-123 → 123 */
export function skillSeed(cardId: string): string {
  return cardId.replace(/^(pool|hero)-/, "")
}

/** 卡面/战斗共用的技能池：按子职业 + 稀有度取 2–3 个，至少 1 主动 */
export function skillDefsFor(seed: string, job: Job, rarity: Rarity, wantThree = false): SkillDef[] {
  const subjob = subjobFor(seed, job)
  const pool = subjob.skills.map((id) => SKILLS[id])
  const actives = pool.filter((skill) => !skill.passive)
  const passives = pool.filter((skill) => skill.passive)
  const count = wantThree || rarity === "Radiant" || rarity === "Prismatic" ? 3 : 2
  const activeCount = Math.min(actives.length, Math.max(1, count - 1))
  const picked = [
    ...actives.slice(0, activeCount),
    ...passives.slice(0, Math.max(1, count - activeCount)),
  ]
  return picked.slice(0, count)
}

export function cardSkillsFor(seed: string, job: Job, rarity: Rarity, wantThree = false): CardSkill[] {
  return skillDefsFor(seed, job, rarity, wantThree).map((skill) => ({
    name: skill.name,
    element: skill.element,
    ap: skill.ap,
    mp: skill.mp,
    passive: skill.passive,
  }))
}
