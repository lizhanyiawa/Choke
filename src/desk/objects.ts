import type { PanelId } from "./DeskBook"

/** 桌上的固定物件：九个面板入口 + 发牌按钮 */
export type DeskObjectId = PanelId | "button"

export interface DeskObjectMeta {
  label: string
  sub: string
  /** 物件名，用在提示和无障碍标签里 */
  thing: string
  w: number
  h: number
  /** 默认位置：相对桌面宽高的比例 */
  x: number
  y: number
}

export const OBJECT_META: Record<DeskObjectId, DeskObjectMeta> = {
  codex: { label: "图鉴", sub: "CODEX", thing: "厚书", w: 150, h: 196, x: 0.03, y: 0.05 },
  album: { label: "卡册", sub: "COLLECTION", thing: "活页夹", w: 172, h: 214, x: 0.15, y: 0.08 },
  about: { label: "关于", sub: "ABOUT", thing: "便签", w: 128, h: 128, x: 0.72, y: 0.06 },
  account: { label: "账号", sub: "ACCOUNT", thing: "工作证", w: 118, h: 176, x: 0.87, y: 0.04 },
  market: { label: "市场", sub: "MARKET", thing: "价签盒", w: 156, h: 128, x: 0.8, y: 0.38 },
  backpack: { label: "背包", sub: "BACKPACK", thing: "纸盒", w: 188, h: 140, x: 0.03, y: 0.66 },
  packs: { label: "抽卡", sub: "GACHA", thing: "卡包展架", w: 176, h: 150, x: 0.17, y: 0.64 },
  button: { label: "发牌", sub: "DEAL", thing: "按钮", w: 124, h: 150, x: 0.45, y: 0.68 },
  deck: { label: "卡组", sub: "DECK", thing: "卡套槽", w: 284, h: 118, x: 0.58, y: 0.76 },
  battle: { label: "战斗", sub: "BATTLE", thing: "对战垫", w: 236, h: 148, x: 0.8, y: 0.66 },
}

export const OBJECT_ORDER: DeskObjectId[] = [
  "codex",
  "album",
  "deck",
  "backpack",
  "packs",
  "battle",
  "market",
  "account",
  "about",
  "button",
]
