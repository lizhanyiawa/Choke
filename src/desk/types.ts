export type Rarity = "C" | "UC" | "R" | "E" | "L" | "Radiant" | "Prismatic"

export type ItemKind = "album" | "pack" | "card" | "mainline" | "market"

export type PackPool = "normal" | "idle" | "quest" | "radiant" | "sky" | "prism"

export interface CardData {
  name: string
  mapper: string
  rarity: Rarity
  isHero?: boolean
}

export interface DeskItem {
  id: string
  kind: ItemKind
  /** 左上角位置，相对桌面宽高的比例（0–1），窗口缩放后位置不变 */
  x: number
  y: number
  z: number
  /** 单个卡包所属卡池；卡包不再叠加数量 */
  pool?: PackPool
  card?: CardData
}

export interface DeskState {
  items: DeskItem[]
  version: 2
}
