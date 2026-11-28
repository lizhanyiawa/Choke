import { useEffect, useSyncExternalStore } from "react"

import { fetchQuests } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { featureLockHint } from "@/tutorial/unlocks"
import type { QuestsOverview } from "@choke/shared/quests"

/**
 * 任务总览的共用缓存：侧栏的角标、首页的「今日」卡和任务页读的是同一份。
 * 服务端不推送，所以谁改了数据（领奖、签到、检查成绩、倒计时归零）谁调一次 refreshQuests()。
 */
export interface QuestsState {
  /** 这份数据是谁的；null = 没在取（任务功能没解锁） */
  owner: string | null
  /** 还没取回来是 null */
  data: QuestsOverview | null
  /** 服务器时间 − 本机时间（毫秒）。倒计时拿 Date.now() + clockOffset 当「现在」，不信本机的钟 */
  clockOffset: number
  /** 最近一次没取回来的原因；取成功就清掉 */
  error: string | null
}

const EMPTY: QuestsState = { owner: null, data: null, clockOffset: 0, error: null }

let state = EMPTY
/** 只采纳最后发出的那次请求：领完奖马上刷新时，更早发出的请求带回来的是旧数据 */
let seq = 0
/** 最后发出、还没回来的那次请求 */
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()

function set(next: QuestsState) {
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
    const data = await fetchQuests(owner)
    if (id !== seq) return
    set({ owner, data, clockOffset: Date.parse(data.now) - Date.now(), error: null })
  } catch (reason) {
    if (id !== seq) return
    set({ ...state, error: reason instanceof Error ? reason.message : "任务取不回来，请稍后再试" })
  }
}

/** 重新取一次任务总览。改了数据之后调：一定发新请求，不沿用正在路上的那次（它可能是改之前发出的） */
export function refreshQuests(): Promise<void> {
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

/** 进页面时对一次表用：正好有一次请求在路上就等它，不再多发一次 */
export function refreshQuestsUnlessPending(): Promise<void> {
  return pending ?? refreshQuests()
}


/** 任务总览。必须用在扁平界面的页面里；任务功能没解锁时不请求，data 一直是 null */
export function useQuests(): QuestsState {
  const { user, progress } = useFlat()
  const owner = featureLockHint("quests", progress) === null ? user.id : null
  useEffect(() => {
    if (state.owner === owner) return
    seq += 1
    set({ ...EMPTY, owner })
    void refreshQuests()
  }, [owner])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return snapshot.owner === owner ? snapshot : EMPTY
}
