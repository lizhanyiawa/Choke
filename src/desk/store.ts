import { useCallback, useEffect, useReducer } from "react"
import type { CardData, DeskItem, DeskState } from "./types"

const KEY = "choke.desk.v2"

export const ITEM_SIZE: Record<DeskItem["kind"], { w: number; h: number }> = {
  album: { w: 150, h: 200 },
  pack: { w: 170, h: 240 },
  card: { w: 168, h: 252 },
  mainline: { w: 170, h: 170 },
  market: { w: 150, h: 150 },
}

const DEFAULT_ITEMS: DeskItem[] = [
  { id: "hero", kind: "card", x: 0.4, y: 0.06, z: 1, card: { name: "你的本体卡", mapper: "No.1", rarity: "Prismatic", isHero: true } },
  { id: "album", kind: "album", x: 0.25, y: 0.46, z: 2 },
  { id: "mainline", kind: "mainline", x: 0.6, y: 0.12, z: 4 },
  { id: "market", kind: "market", x: 0.6, y: 0.58, z: 5 },
]

type Action =
  | { type: "move"; id: string; x: number; y: number }
  | { type: "front"; id: string }
  | { type: "spawn"; items: DeskItem[] }
  | { type: "consumePack"; id: string }
  | { type: "collect"; id: string }
  | { type: "reset" }

function initial(): DeskState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DeskState
      if (parsed.version === 2 && Array.isArray(parsed.items)) return parsed
    }
  } catch {
    // 忽略损坏的存档，回退到默认布局
  }
  return { version: 2, items: DEFAULT_ITEMS }
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
    case "consumePack":
      return { ...state, items: state.items.filter((it) => it.id !== action.id) }
    case "collect":
      return { ...state, items: state.items.filter((it) => it.id !== action.id) }
    case "reset":
      return { version: 2, items: DEFAULT_ITEMS }
  }
}

export function newId(prefix: string) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9)
}

export function useDesk() {
  const [state, dispatch] = useReducer(reducer, undefined, initial)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // 存储已满时忽略
    }
  }, [state])

  const move = useCallback(
    (id: string, x: number, y: number) => dispatch({ type: "move", id, x, y }),
    [],
  )
  const front = useCallback((id: string) => dispatch({ type: "front", id }), [])
  const spawn = useCallback(
    (items: DeskItem[]) => dispatch({ type: "spawn", items }),
    [],
  )
  const consumePack = useCallback(
    (id: string) => dispatch({ type: "consumePack", id }),
    [],
  )
  const collect = useCallback((id: string) => dispatch({ type: "collect", id }), [])
  const reset = useCallback(() => dispatch({ type: "reset" }), [])

  return { items: state.items, move, front, spawn, consumePack, collect, reset }
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
