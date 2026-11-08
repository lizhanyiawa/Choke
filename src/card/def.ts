import { makeCard } from "./data"
import type { CardFaceData, CardSkill, Job, Rarity } from "./types"

/**
 * 卡的静态定义：只放不会随玩家等级/命座变化的东西。
 * 等级、命座、MOD 属于实例状态，不进 CardDef。
 */
export interface CardDef {
  id: string
  /** 玩家卡对应的 osu! id；手工卡为 null */
  osuId: number | null
  name: string
  rarity: Rarity
  job: Job
  no: number
  total: number
  country?: string
  globalRank?: number | null
  pp?: number | null
  profileUrl?: string
  art?: string
  banner?: string
  skills: CardSkill[]
  /** 本体卡个人加成，单位 basis point */
  heroBonus?: number
  /** 定义版本，用于热更和回滚 */
  version: number
}

/** 卡定义转运行期卡面：等级、命座由实例决定 */
export function faceFromDef(
  def: CardDef,
  state: {
    level?: number
    constellation?: number
    mods?: CardFaceData["mods"]
    foil?: boolean
  } = {},
): CardFaceData {
  return makeCard({
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    job: def.job,
    level: state.level ?? 1,
    mods: state.mods ?? [],
    constellation: state.constellation ?? 0,
    isHero: def.id.startsWith("hero-"),
    heroBonus: def.heroBonus ?? 0,
    foil: state.foil,
    no: def.no,
    total: def.total,
    country: def.country,
    globalRank: def.globalRank,
    pp: def.pp,
    profileUrl: def.profileUrl,
    art: def.art,
    banner: def.banner,
    skills: def.skills,
  })
}

/** 从编辑器/卡面反向提取定义；用于把单卡存进卡池 */
export function defFromFace(face: CardFaceData, version = 1): CardDef {
  return {
    id: face.id,
    osuId: null,
    name: face.name,
    rarity: face.rarity,
    job: face.job,
    no: face.no,
    total: face.total,
    country: face.country,
    globalRank: face.globalRank,
    pp: face.pp,
    profileUrl: face.profileUrl,
    art: face.art,
    banner: face.banner,
    skills: face.skills,
    heroBonus: face.heroBonus,
    version,
  }
}

/** 批量导出时用的紧凑格式，省掉重复的技能字段 */
export interface CardDefRow {
  id: string
  osuId: number | null
  name: string
  rarity: Rarity
  job: Job
  no: number
  total: number
  country?: string
  globalRank?: number | null
  pp?: number | null
  profileUrl?: string
  art?: string
  banner?: string
  skills: CardSkill[]
}

export function defRow(def: CardDef): CardDefRow {
  return {
    id: def.id,
    osuId: def.osuId,
    name: def.name,
    rarity: def.rarity,
    job: def.job,
    no: def.no,
    total: def.total,
    country: def.country,
    globalRank: def.globalRank,
    pp: def.pp,
    profileUrl: def.profileUrl,
    art: def.art,
    banner: def.banner,
    skills: def.skills,
  }
}
