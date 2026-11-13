import { startTransition, useEffect, useState } from "react"

import { DESK_ITEMS_EVENT } from "./drag"

const DESK_KEY = "choke.desk.v2"

let currentIds: number[] | null = null

/** 归属与存档写入分开，打开面板时也能立即读到刚落桌的卡。 */
export function publishDeskCardIds(ids: number[]) {
  if (currentIds && currentIds.length === ids.length && ids.every((id, index) => id === currentIds![index])) return
  currentIds = ids
  window.dispatchEvent(new CustomEvent(DESK_ITEMS_EVENT, { detail: ids }))
}

export function readDeskCardIds(): number[] {
  if (currentIds) return currentIds
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
      const next = new Set(Array.isArray(detail) ? detail : readDeskCardIds())
      // 坐标和层级变化不改变归属；收卡提示让位给拖拽影子的卸载。
      startTransition(() => {
        setIds((previous) =>
          previous.size === next.size && [...next].every((id) => previous.has(id))
            ? previous
            : next,
        )
      })
    }
    window.addEventListener(DESK_ITEMS_EVENT, onChanged)
    return () => window.removeEventListener(DESK_ITEMS_EVENT, onChanged)
  }, [])

  return ids
}
