import type { CardFaceData } from "@/card/types"

import type { CardData } from "./types"

/** 抽屉/开包结果 → 桌面 */
export const CARD_MIME = "application/x-choke-card"
/** 桌面/卡册/卡组之间移动 user_card 实例 */
export const USER_CARD_MIME = "application/x-choke-usercard"
/** 桌面卡拖到卡组槽位时广播 */
export const DECK_HOVER_EVENT = "choke:deck-hover"
export const DECK_ASSIGN_EVENT = "choke:deck-assign"
/** 卡包库存变化，让桌面的发牌按钮刷新 */
export const PACKS_CHANGED_EVENT = "choke:packs-changed"
/** 把卡片直接发到桌面（按钮快捷方式） */
export const DESK_ADD_CARDS_EVENT = "choke:desk-add-cards"

export function toDeskCard(card: CardFaceData, userCardId?: number): CardData {
  return {
    cardId: card.id,
    userCardId,
    name: card.name,
    mapper: card.name,
    rarity: card.rarity,
    art: card.art,
    banner: card.banner,
  }
}

export function setCardDrag(event: DragEvent, card: CardData) {
  event.dataTransfer?.setData(CARD_MIME, JSON.stringify(card))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy"
}

export function readCardDrag(event: DragEvent): CardData | null {
  const raw = event.dataTransfer?.getData(CARD_MIME)
  if (!raw) return null
  try {
    const card = JSON.parse(raw) as CardData
    return card && typeof card.name === "string" ? card : null
  } catch {
    return null
  }
}

export interface DeckDragPayload {
  userCardId: number
  fromSlot?: number
}

export function setUserCardDrag(event: DragEvent, payload: DeckDragPayload) {
  event.dataTransfer?.setData(USER_CARD_MIME, JSON.stringify(payload))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
}

export function readUserCardDrag(event: DragEvent): DeckDragPayload | null {
  const raw = event.dataTransfer?.getData(USER_CARD_MIME)
  if (!raw) return null
  try {
    const payload = JSON.parse(raw) as DeckDragPayload
    return typeof payload.userCardId === "number" ? payload : null
  } catch {
    return null
  }
}

export function hasDragType(event: DragEvent, type: string): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(type)
}
