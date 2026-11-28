import { useEffect, useSyncExternalStore } from "react"

import {
  ApiError,
  advanceTutorialStep,
  fetchProgress,
  skipTutorialRemote,
  type ServerProgress,
} from "@/desk/session/api"
import { PLAYER_MAX_LEVEL, nextTutorialStep } from "@choke/shared/player"

import { TUTORIAL_STEPS, type PlayerProgress, type TutorialStep } from "./types"

export { expToNextPlayerLevel as expToNextLevel } from "@choke/shared/player"

/**
 * 玩家等级 / 经验 / 教程进度的客户端缓存。
 *
 * 服务端是唯一权威：等级和经验只从服务端回包里来，客户端不自己加。
 * 教程推进先在本地乐观切到下一步（台词不用等网络），请求排队串行发送，
 * 回包后用服务端结果覆盖；失败就重新拉取服务端进度。
 * localStorage 只是首屏缓存。
 */

function createDefault(ownerId: string | null): PlayerProgress {
  return {
    version: 1,
    ownerId,
    level: 1,
    exp: 0,
    tutorialStep: "idle",
    tutorialDone: false,
    linkedAccount: false,
    updatedAt: 0,
  }
}

const EMPTY = createDefault(null)
const STORAGE_PREFIX = "choke.progress.v2:"

function isStep(value: unknown): value is TutorialStep {
  return (
    typeof value === "string" &&
    (TUTORIAL_STEPS as readonly string[]).includes(value)
  )
}

function normalize(
  raw: Partial<PlayerProgress> | ServerProgress,
  ownerId: string | null
): PlayerProgress {
  const tutorialStep = isStep(raw.tutorialStep) ? raw.tutorialStep : "idle"
  return {
    version: 1,
    ownerId,
    level: Math.min(
      PLAYER_MAX_LEVEL,
      Math.max(1, Math.round(typeof raw.level === "number" ? raw.level : 1))
    ),
    exp: Math.max(0, Math.round(typeof raw.exp === "number" ? raw.exp : 0)),
    tutorialStep,
    tutorialDone: raw.tutorialDone === true || tutorialStep === "done",
    linkedAccount: raw.linkedAccount === true,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  }
}

function storageKey(ownerId: string | null) {
  return STORAGE_PREFIX + (ownerId ?? "anon")
}

function read(ownerId: string | null): PlayerProgress {
  try {
    const raw = localStorage.getItem(storageKey(ownerId))
    if (!raw) return createDefault(ownerId)
    return normalize(JSON.parse(raw) as Partial<PlayerProgress>, ownerId)
  } catch {
    return createDefault(ownerId)
  }
}

function write(ownerId: string | null, state: PlayerProgress) {
  try {
    localStorage.setItem(storageKey(ownerId), JSON.stringify(state))
  } catch {
    // 隐私模式 / 存储已满：继续用内存状态
  }
}

const listeners = new Set<() => void>()
let current: PlayerProgress = EMPTY
let owner: string | null = null
let loaded = false
/** 哪个账号的进度已经从服务端取回来过；换账号时清掉 */
let syncedOwner: string | null = null

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return current
}

/** 排队中的推进请求数；还有请求在路上时，回包只同步等级经验，不把步骤拉回去 */
let inFlight = 0
let queue: Promise<void> = Promise.resolve()

function enqueue(task: () => Promise<void>) {
  inFlight += 1
  queue = queue.then(task).finally(() => {
    inFlight -= 1
  })
}

/** 等待当前排队中的教程推进请求落库（硬跳转回桌面前调用，避免页面卸载中止请求） */
export async function flushTutorialQueue(): Promise<void> {
  await queue
}

function applyServer(ownerId: string, remote: ServerProgress) {
  if (owner !== ownerId) return
  const next = normalize(remote, ownerId)
  const settled = inFlight > 1
    ? { ...next, tutorialStep: current.tutorialStep, tutorialDone: current.tutorialDone }
    : next
  current = settled
  syncedOwner = ownerId
  write(ownerId, next)
  emit()
}

/** 从服务端拉最新进度；副本结算等会改等级的操作之后调用 */
export async function refreshProgress(ownerId: string | null = owner) {
  if (!ownerId) return
  try {
    const remote = await fetchProgress(ownerId)
    if (!remote || owner !== ownerId) return
    current = normalize(remote, ownerId)
    syncedOwner = ownerId
    write(ownerId, current)
    emit()
  } catch {
    // 保留本地缓存进度
  }
}

function hydrate(ownerId: string | null) {
  const nextOwner = ownerId ?? null
  if (loaded && owner === nextOwner) return
  owner = nextOwner
  syncedOwner = null
  loaded = true
  current = read(nextOwner)
  emit()
  void refreshProgress(nextOwner)
}

function optimisticStep(step: TutorialStep) {
  current = {
    ...current,
    tutorialStep: step,
    tutorialDone: current.tutorialDone || step === "done",
  }
  emit()
}

/** 把教程从 from 推进一步；经验由服务端发放 */
export function advanceTutorial(from: TutorialStep) {
  const ownerId = owner
  const to = nextTutorialStep(from)
  if (!ownerId || !to || current.tutorialStep !== from) return
  optimisticStep(to)
  enqueue(async () => {
    try {
      applyServer(ownerId, await advanceTutorialStep(ownerId, from))
    } catch (error) {
      // 409 多半是同时到账的副本经验改了等级：服务端仍停在 from 就重试一次
      if (error instanceof ApiError && error.code === "step_mismatch") {
        const remote = await fetchProgress(ownerId).catch(() => null)
        if (remote?.tutorialStep === from) {
          try {
            applyServer(ownerId, await advanceTutorialStep(ownerId, from))
            return
          } catch {
            // 落到下面统一回滚
          }
        }
      }
      await refreshProgress(ownerId)
    }
  })
}

export function startTutorial() {
  advanceTutorial("idle")
}

/** 跳过：服务端补到 Lv.3 + 毕业；新手礼包由 DeskPage 的 onFinish 负责补齐 */
export function skipTutorial() {
  const ownerId = owner
  if (!ownerId || current.tutorialDone) return
  optimisticStep("done")
  enqueue(async () => {
    try {
      applyServer(ownerId, await skipTutorialRemote(ownerId))
    } catch {
      await refreshProgress(ownerId)
    }
  })
}

export function useTutorialProgress(ownerId: string | null) {
  useEffect(() => {
    hydrate(ownerId)

    const onStorage = (event: StorageEvent) => {
      if (!ownerId || event.key !== storageKey(ownerId) || !event.newValue) return
      try {
        const next = normalize(
          JSON.parse(event.newValue) as Partial<PlayerProgress>,
          ownerId,
        )
        if (inFlight === 0 && next.updatedAt > current.updatedAt) {
          current = next
          emit()
        }
      } catch {
        // 忽略其他标签页写坏的缓存
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [ownerId])

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return snapshot.ownerId === (ownerId ?? null) ? snapshot : EMPTY
}

/**
 * 现在手上的进度是不是服务端给的（而不是本机缓存或默认值）。
 * 新浏览器上缓存是空的，tutorialDone 默认 false；要按它决定去留的地方得先等这个变成 true。
 * 和 useTutorialProgress 配合用：那边负责发起请求。
 */
export function useProgressSynced(ownerId: string | null): boolean {
  return useSyncExternalStore(subscribe, () => ownerId !== null && syncedOwner === ownerId)
}
