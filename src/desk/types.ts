export type Rarity = "C" | "UC" | "R" | "E" | "L" | "Radiant" | "Prismatic"

export type ItemKind = "album" | "pack" | "card" | "mainline" | "market"

export type PackPool = "normal" | "idle" | "quest" | "radiant" | "sky" | "prism"

export interface CardData {
  /** 服务端卡牌 id；桌面本地原型卡没有 */
  cardId?: string
  /** user_cards 实例 id；有它才能直接拖进卡组 */
  userCardId?: number
  name: string
  mapper: string
  rarity: Rarity
  /** 立绘地址；缺省时使用占位图 */
  art?: string
  /** 个人主页 banner */
  banner?: string
  foil?: boolean
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
  /** 从背包拿到桌面时的一次性 token；旧存档可能没有 */
  token?: string
  card?: CardData
}

export interface DeskState {
  items: DeskItem[]
  version: 2
}
