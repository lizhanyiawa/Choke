import { useEffect, useState } from "react"

import { DESK_ITEMS_EVENT } from "./drag"

const DESK_KEY = "choke.desk.v2"

export function readDeskCardIds(): number[] {
  try {
    const raw = localStorage.getItem(DESK_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as {
      items?: { kind?: string; card?: { userCardId?: number } }[]
    }
    return (parsed.items ?? []).flatMap((item) =>
      item.kind === "card" && typeof item.card?.userCardId === "number"
        ? [item.card.userCardId]
        : [],
    )
  } catch {
    return []
  }
}

/** 订阅桌面上的卡，卡册/卡组用它把“在桌面”的卡暂时变暗 */
export function useDeskCardIds(): Set<number> {
  const [ids, setIds] = useState<Set<number>>(() => new Set(readDeskCardIds()))

  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<number[] | undefined>).detail
      setIds(new Set(Array.isArray(detail) ? detail : readDeskCardIds()))
    }
    window.addEventListener(DESK_ITEMS_EVENT, onChanged)
    return () => window.removeEventListener(DESK_ITEMS_EVENT, onChanged)
  }, [])

  return ids
}
