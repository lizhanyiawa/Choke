import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react"

import { onIdle } from "@/lib/idle"

import { OBJECT_META, OBJECT_ORDER, type DeskObjectId } from "./objects"
import type { CardData, DeskItem, DeskState } from "./types"

const KEY = "choke.desk.v2"

const CARD_SIZE = { w: 168, h: 252 }
const PACK_SIZE = { w: 170, h: 240 }

export const ITEM_SIZE = { card: CARD_SIZE, pack: PACK_SIZE }

export function sizeOf(item: DeskItem): { w: number; h: number } {
  if (item.kind === "object" && item.object) return OBJECT_META[item.object]
  return item.kind === "pack" ? PACK_SIZE : CARD_SIZE
}

function objectItem(id: DeskObjectId, z: number): DeskItem {
  const meta = OBJECT_META[id]
  return { id: `obj-${id}`, kind: "object", object: id, x: meta.x, y: meta.y, z }
}

function defaultItems(): DeskItem[] {
  return [
    ...OBJECT_ORDER.map((id, index) => objectItem(id, index + 1)),
    {
      id: "hero",
      kind: "card",
      x: 0.4,
      y: 0.06,
      z: OBJECT_ORDER.length + 1,
      card: { name: "你的本体卡", mapper: "No.1", rarity: "Prismatic", isHero: true },
    },
  ]
}

type Action =
  | { type: "move"; id: string; x: number; y: number }
  | { type: "front"; id: string }
  | { type: "spawn"; items: DeskItem[] }
  | { type: "remove"; id: string }
  | { type: "stow"; id: string }
  | { type: "unstow"; id: string; x: number; y: number }
  | { type: "reset" }

/** 旧存档里的卡册 / 市场方块换成新物件；缺的物件补到默认位置；只认物件上的 stowed === true */
function migrate(items: DeskItem[]): DeskItem[] {
  const kept = items.flatMap((item): DeskItem[] => {
    if (!item || typeof item.kind !== "string") return []
    const legacy = item.kind as string
    if (legacy === "album" || legacy === "market") return []
    if (item.kind === "object") {
      if (!item.object || !(item.object in OBJECT_META)) return []
      const { stowed, ...rest } = item
      return [stowed === true ? { ...rest, stowed } : rest]
    }
    return item.kind === "card" || item.kind === "pack" ? [item] : []
  })
  if (kept.length === 0) return defaultItems()
  const present = new Set(kept.flatMap((item) => (item.object ? [item.object] : [])))
  const missing = OBJECT_ORDER.filter((id) => !present.has(id)).map((id, index) =>
    objectItem(id, index + 1 - OBJECT_ORDER.length),
  )
  return [...missing, ...kept]
}

function initial(): DeskState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DeskState
      if (parsed.version === 2 && Array.isArray(parsed.items)) {
        return { version: 2, items: migrate(parsed.items) }
      }
    }
  } catch {
    // 忽略损坏的存档，回退到默认布局
  }
  return { version: 2, items: defaultItems() }
}

function reducer(state: DeskState, action: Action): DeskState {
  switch (action.type) {
    case "move":
      return { ...state, items: state.items.map((it) => (it.id === action.id ? { ...it, x: action.x, y: action.y } : it)) }
    case "front": {
      const top = Math.max(0, ...state.items.map((it) => it.z)) + 1
      return { ...state, items: state.items.map((it) => (it.id === action.id ? { ...it, z: top } : it)) }
    }
    case "spawn":
      return { ...state, items: [...state.items, ...action.items] }
    case "remove":
      return { ...state, items: state.items.filter((it) => it.id !== action.id) }
    case "stow":
      return {
        ...state,
        items: state.items.map((it) => (it.id === action.id && it.kind === "object" ? { ...it, stowed: true } : it)),
      }
    case "unstow": {
      const top = Math.max(0, ...state.items.map((it) => it.z)) + 1
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id ? { ...it, stowed: undefined, x: action.x, y: action.y, z: top } : it,
        ),
      }
    }
    case "reset":
      return { version: 2, items: defaultItems() }
  }
}

export function newId(prefix: string) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9)
}

export function useDesk() {
  const [state, dispatch] = useReducer(reducer, undefined, initial)

  const latest = useRef(state)
  useLayoutEffect(() => {
    latest.current = state
  }, [state])
  const save = useCallback(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(latest.current))
    } catch {
      // 存储已满时忽略
    }
  }, [])

  // 拖动提交先绘制，连续操作只保存最新布局；离开页面时补齐。
  useEffect(() => {
    return onIdle(save, 1000)
  }, [state, save])
  useEffect(() => {
    window.addEventListener("pagehide", save)
    return () => {
      window.removeEventListener("pagehide", save)
      save()
    }
  }, [save])

  const move = useCallback(
    (id: string, x: number, y: number) => dispatch({ type: "move", id, x, y }),
    [],
  )
  const front = useCallback((id: string) => dispatch({ type: "front", id }), [])
  const spawn = useCallback(
    (items: DeskItem[]) => dispatch({ type: "spawn", items }),
    [],
  )
  /** 卡包用掉 / 卡收进卡册 / 卡放进卡组，都是把它从桌面拿走 */
  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), [])
  const reset = useCallback(() => dispatch({ type: "reset" }), [])
  /** 物件收进抽屉 / 从抽屉拖回桌面（落在 x, y，放到最上面） */
  const stow = useCallback((id: string) => dispatch({ type: "stow", id }), [])
  const unstow = useCallback(
    (id: string, x: number, y: number) => dispatch({ type: "unstow", id, x, y }),
    [],
  )

  return { items: state.items, move, front, spawn, remove, reset, stow, unstow }
}

export function cardsToItems(cards: CardData[], originX: number, originY: number): DeskItem[] {
  const n = cards.length
  const step = 0.065
  const startX = originX - ((n - 1) * step) / 2
  return cards.map((card, i) => ({
    id: newId("card"),
    kind: "card",
    x: Math.min(0.82, Math.max(0.03, startX + i * step)),
    y: Math.min(0.72, Math.max(0.04, originY + 0.05 + Math.abs(i - (n - 1) / 2) * 0.012)),
    z: 100 + i,
    card,
  }))
}
