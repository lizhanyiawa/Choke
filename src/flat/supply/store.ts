import { useEffect, useSyncExternalStore } from "react"

import { useFlat } from "@/flat/context"

import { fetchSupply, type SupplyOverview } from "./api"

/**
 * 补给箱状态的共用缓存：侧栏角标、首页补给箱卡片与独立 /supply 页面共享同一份数据。
 * 领取或切换倾向后直接写入回包（applySupplyData）；远征结算后主动刷新以同步新解锁箱子。
 */
export interface SupplyState {
  owner: string | null
  data: SupplyOverview | null
  error: string | null
}

const EMPTY: SupplyState = { owner: null, data: null, error: null }

let state = EMPTY
let seq = 0
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()

function set(next: SupplyState) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state

async function load(owner: string, id: number): Promise<void> {
  try {
    const data = await fetchSupply(owner)
    if (id !== seq) return
    set({ owner, data, error: null })
  } catch (reason) {
    if (id !== seq) return
    set({ ...state, error: reason instanceof Error ? reason.message : "补给箱取不回来，请稍后再试" })
  }
}

/** 强制重新拉取一次补给箱现状；丢弃更早发出的在途请求结果。 */
export function refreshSupply(): Promise<void> {
  const owner = state.owner
  if (!owner) return Promise.resolve()
  seq += 1
  const request = load(owner, seq)
  pending = request
  void request.then(() => {
    if (pending === request) pending = null
  })
  return request
}

/** 进页对表用：若已有请求在路上就复用，不重复发 GET。 */
export function refreshSupplyUnlessPending(): Promise<void> {
  return pending ?? refreshSupply()
}

/** 领取或切换倾向回包直接写入缓存，并使更早发出的旧 GET 失效。 */
export function applySupplyData(owner: string, data: SupplyOverview): void {
  if (state.owner !== owner) return
  seq += 1
  pending = null
  set({ owner, data, error: null })
}

/** 读取当前玩家的补给箱总览；不设前端等级/功能锁，完全信任服务端各箱子的 locked/lockedReason。 */
export function useSupply(): SupplyState {
  const { user } = useFlat()
  const owner = user.id
  useEffect(() => {
    if (state.owner === owner) return
    seq += 1
    pending = null
    set({ ...EMPTY, owner })
    void refreshSupply()
  }, [owner])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return snapshot.owner === owner ? snapshot : EMPTY
}
