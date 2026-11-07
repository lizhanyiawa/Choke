export type Rarity = "C" | "UC" | "R" | "E" | "L" | "Radiant" | "Prismatic"

/** 职业四大类；十四子职业后续在此扩展 */
export type Job = "tank" | "warrior" | "mage" | "support"

/** 九属性，挂在技能上，不挂在卡上 */
export type Element =
  | "metal"
  | "wood"
  | "earth"
  | "ice"
  | "fire"
  | "thunder"
  | "light"
  | "dark"
  | "physical"

export type Mod = "HD" | "SD" | "DT"

export interface CardSkill {
  name: string
  element: Element
  /** 行动点消耗 */
  ap: number
  /** 法系才有的 MP 消耗 */
  mp?: number
  /** 被动技能：AP 恒 0，且不显示 MP */
  passive?: boolean
}

export interface CardFaceData {
  id: string
  name: string
  rarity: Rarity
  job: Job
  level: number
  mods: Mod[]
  /** 普通卡 0–6；本体卡 0–12（每颗星两档） */
  constellation: number
  no: number
  total: number
  skills: CardSkill[]
  /** 立绘；缺省时使用占位图。玩家卡用头像地址，由浏览器随看随载。 */
  art?: string
  /** 个人主页 banner。没有地址就不要请求。 */
  banner?: string
  /** 卡面名字链到本人 osu! 主页 */
  profileUrl?: string
  /** 玩家卡身份信息 */
  country?: string
  globalRank?: number | null
  pp?: number | null
  isHero?: boolean
}

/** 卡面显示层：收藏态全显，战斗态只留立绘 + 技能 */
export type CardFaceMode = "collection" | "battle"

export type StarState = "empty" | "copper" | "prism"
