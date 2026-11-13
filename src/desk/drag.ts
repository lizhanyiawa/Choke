import type { PointerEvent } from "react"
import type { CardFaceData } from "@/card/types"

import type { CardData, PackPool } from "./types"

/** 书页和开包层共用指针拖卡；桌面拖卡仍使用已有的指针路径。 */
export const CARD_POINTER_START_EVENT = "choke:card-pointer-start"
export const CARD_POINTER_DROP_EVENT = "choke:card-pointer-drop"
/** 桌面卡拖到卡组槽位时广播 */
export const DECK_HOVER_EVENT = "choke:deck-hover"
export const DECK_ASSIGN_EVENT = "choke:deck-assign"
/** 卡包库存变化，让桌面的发牌按钮刷新 */
export const PACKS_CHANGED_EVENT = "choke:packs-changed"
/** 把卡片直接发到桌面（按钮快捷方式） */
export const DESK_ADD_CARDS_EVENT = "choke:desk-add-cards"
/** 桌面上的 user_card id 列表变化 */
export const DESK_ITEMS_EVENT = "choke:desk-items"
/** 桌面卡拖到卡册面板 */
export const ALBUM_HOVER_EVENT = "choke:album-hover"
/** 桌面卡包拖到背包面板 */
export const BACKPACK_HOVER_EVENT = "choke:backpack-hover"
/** 抽卡面板开出卡后交给桌面播放开包动画（rect 是卡包图在视口里的位置） */
export const GACHA_OPEN_EVENT = "choke:gacha-open"

export interface GachaOpenDetail {
  /** 开包结果只属于发起请求时的账号；桌面必须拒绝其他账号的迟到事件 */
  userId: string
  cards: CardData[]
  pool: PackPool
  rect?: { left: number; top: number; width: number; height: number }
}

export function toDeskCard(card: CardFaceData, userCardId?: number): CardData {
  return {
    cardId: card.id,
    userCardId,
    face: card,
    name: card.name,
    mapper: card.name,
    rarity: card.rarity,
    art: card.art,
    banner: card.banner,
    foil: card.foil,
    isHero: card.id.startsWith("hero-"),
  }
}

export interface CardDragPayload {
  userCardId?: number
  fromSlot?: number
  card?: CardData
}

export interface CardPointerStart {
  source: HTMLElement
  pointerId: number
  x: number
  y: number
  payload: CardDragPayload
  onStart?: () => void
  onFinish?: () => void
  onDrop?: () => void
}

export interface CardPointerDrop {
  payload: CardDragPayload
  x: number
  y: number
}

/** 按下先记住来源，越过阈值才抬卡；普通点击仍交给原来的详情/选槽处理。 */
export function startCardPointerDrag(
  event: PointerEvent<HTMLElement>,
  payload: CardDragPayload,
  callbacks: Pick<CardPointerStart, "onStart" | "onFinish" | "onDrop"> = {},
) {
  if (event.button !== 0 || !event.isPrimary) return
  if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) return
  event.preventDefault()
  event.stopPropagation()
  event.currentTarget.dispatchEvent(new CustomEvent<CardPointerStart>(CARD_POINTER_START_EVENT, {
    bubbles: true,
    detail: {
      source: event.currentTarget,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      payload,
      ...callbacks,
    },
  }))
}
