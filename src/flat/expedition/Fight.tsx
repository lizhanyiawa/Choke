import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { ClassicStage, ModernStage, readBattleUiMode, saveBattleUiMode, type BattleUiMode } from "@/battle/stages"
import type { BattleHostHooks } from "@/battle/host"
import { ApiError } from "@/desk/session/api"
import { FlatDialog } from "@/flat/ui/FlatDialog"
import { MAX_ACTIONS_PER_UPLOAD, replayBattle, withAction, type BattleAction } from "@choke/shared/battle/actions"
import type { BattleInputCard } from "@choke/shared/battle/engine"
import type { BattleState } from "@choke/shared/battle/types"
import type { ExpeditionView } from "@choke/shared/expedition/view"

import { fetchCurrentExpedition, retryBattle, uploadBattleActions } from "./api"
import { errorText } from "./util"
import "./run.css"

/** 这些错误说明本地操作和服务端已经分叉，直接按服务端进度恢复 */
const RESYNC_CODES = new Set(["out_of_sync", "invalid_action", "too_many_actions", "no_battle", "pool_mismatch"])

function inputsOf(view: ExpeditionView, ids: number[]): BattleInputCard[] {
  const byId = new Map(view.pool.map((entry) => [entry.userCardId, entry.face]))
  return ids.flatMap((uid) => {
    const face = byId.get(uid)
    return face ? [{ uid, cardId: face.id, face }] : []
  })
}

/** 按服务端确认的操作重放，恢复刷新或断线前的局面。 */
function replayFrom(view: ExpeditionView): BattleState {
  const battle = view.battle!
  return replayBattle(
    {
      encounter: battle.encounter,
      cards: inputsOf(view, battle.lineup),
      bench: inputsOf(view, battle.bench),
      seed: battle.seed,
      apMax: battle.apMax,
      hpRatio: battle.hpRatioStart,
    },
    battle.actions,
  ).state
}

interface FightProps {
  userId: string
  userName: string
  view: ExpeditionView
  onView: (view: ExpeditionView) => void
  onExit: () => void
  onSettle: () => void
  onAbandon: () => void
}

/** 出征战斗运行在 body 的全屏层中；操作仍由同一引擎重放并按队列上传。 */
export function Fight({ userId, userName, view, onView, onExit, onSettle, onAbandon }: FightProps) {
  const battleView = view.battle!
  const [state, setState] = useState<BattleState>(() => replayFrom(view))
  const stateRef = useRef(state)
  const confirmed = useRef(battleView.actions.length)
  const queue = useRef<BattleAction[]>([])
  const inflight = useRef<Promise<void> | null>(null)
  const onViewRef = useRef(onView)
  useEffect(() => {
    onViewRef.current = onView
  }, [onView])

  const [pending, setPending] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [uiMode, setUiMode] = useState<BattleUiMode>(() => readBattleUiMode())

  /** 进度冲突时丢弃未确认操作，并恢复服务端权威局面。 */
  const resyncing = useRef(false)
  const resync = useCallback(async () => {
    resyncing.current = true
    try {
      const fresh = await fetchCurrentExpedition(userId)
      if (!fresh?.battle) throw new Error("服务端已经没有这场战斗了，请返回地图重新进入")
      confirmed.current = fresh.battle.actions.length
      queue.current = []
      const next = replayFrom(fresh)
      stateRef.current = next
      setState(next)
      setPending(0)
      setSyncError(null)
      setActionError("操作和服务端进度对不上，已按服务端的进度恢复")
      onViewRef.current(fresh)
    } finally {
      resyncing.current = false
    }
  }, [userId])

  const pump = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current
    const run = async () => {
      while (queue.current.length > 0) {
        const batch = queue.current.slice(0, MAX_ACTIONS_PER_UPLOAD)
        try {
          const next = await uploadBattleActions(userId, { base: confirmed.current, actions: batch })
          confirmed.current += batch.length
          queue.current.splice(0, batch.length)
          setPending(queue.current.length)
          setSyncError(null)
          onViewRef.current(next)
        } catch (reason) {
          const code = reason instanceof ApiError ? reason.code : undefined
          if (code === "battle_missing") {
            // 服务端已经没有这场战斗：丢掉本地队列，别让「重试上传」一直撞同一个错误
            queue.current = []
            setPending(0)
            setSyncError("这场战斗在服务器上已经不存在，请返回地图重新进入")
            return
          }
          if (code && RESYNC_CODES.has(code)) {
            await resync().catch((again) => setSyncError(errorText(again)))
          } else {
            setSyncError(errorText(reason))
          }
          return
        }
      }
    }
    const job = run().finally(() => {
      inflight.current = null
    })
    inflight.current = job
    return job
  }, [userId, resync])

  const act = (action: BattleAction) => {
    if (resyncing.current) {
      setActionError("正在同步服务器进度，稍等一下再出招")
      return
    }
    if (syncError) {
      setActionError("有操作还没保存到服务器，先点上方横幅的「重试上传」")
      return
    }
    const { state: next, error } = withAction(stateRef.current, action)
    if (!error) {
      stateRef.current = next
      setState(next)
      queue.current.push(action)
      setPending(queue.current.length)
      void pump()
    }
    setActionError(error)
  }
  const leave = async () => {
    await pump()
    if (queue.current.length > 0) {
      setConfirmLeave(true)
      return
    }
    onExit()
  }

  const guard = async (job: () => Promise<void>) => {
    setWorking(true)
    try {
      await job()
    } catch (reason) {
      setSyncError(errorText(reason))
    } finally {
      setWorking(false)
    }
  }

  /** 服务端卡池缺卡时本地复算会少人：停在提示页，避免两边局面静默分叉 */
  const missingPoolCards = useMemo(() => {
    const inPool = new Set(view.pool.map((entry) => entry.userCardId))
    return [...battleView.lineup, ...battleView.bench].filter((uid) => !inPool.has(uid))
  }, [view.pool, battleView.lineup, battleView.bench])

  const serverStatus = battleView.status
  const synced = pending === 0 && !syncError
  const won = state.phase === "won"
  const host: BattleHostHooks = {
    exitLabel: "返回地图",
    onExit: () => void leave(),
    canRestart: false,
    syncNote:
      syncError ? (
        <>
          <b>{pending > 0 ? "操作未保存" : "战斗状态异常"}</b>
          <span>
            {syncError}
            {pending > 0 ? `（还有 ${pending} 步没传到服务器）` : ""}
          </span>
          {pending > 0 && (
            <button type="button" onClick={() => void pump()} data-sfx="none">
              重试上传
            </button>
          )}
        </>
      ) : undefined,
    resultNote: won ? (
      serverStatus === "won" && synced ? <>本场 ★ {battleView.stars ?? 0}，战果已记录</> : <>{syncError ?? "正在记录战果……"}</>
    ) : (
      <>{syncError ?? (serverStatus === "lost" ? "战败了。同种子重来不会惩罚，队伍血量回到进入本场前。" : "正在记录战果……")}</>
    ),
    resultActions: won ? (
      <>
        {syncError && <button type="button" onClick={() => void pump()} data-sfx="none">重试上传</button>}
        <button type="button" disabled={serverStatus !== "won" || !synced} onClick={onExit} data-sfx="none">继续前进</button>
      </>
    ) : (
      <>
        {syncError && <button type="button" onClick={() => void pump()} data-sfx="none">重试上传</button>}
        <button type="button" disabled={working || serverStatus !== "lost" || !synced} onClick={() => void guard(async () => onView(await retryBattle(userId)))} data-sfx="none">同种子重试</button>
        <button type="button" disabled={working || serverStatus !== "lost" || !synced} onClick={onSettle} data-sfx="none">到此结算</button>
        <button type="button" disabled={working} onClick={onAbandon} data-sfx="none">放弃出征</button>
      </>
    ),
  }

  const switchUi = () => {
    const next: BattleUiMode = uiMode === "classic" ? "modern" : "classic"
    saveBattleUiMode(next)
    setUiMode(next)
  }
  const Stage = uiMode === "modern" ? ModernStage : ClassicStage
  const noop = () => undefined

  if (missingPoolCards.length > 0) {
    return createPortal(
      <div className="xp-fight-screen">
        <div className="xp-fight-loading" role="alert">
          <p>出征卡池缺少 {missingPoolCards.length} 张阵容卡，本地局面可能和服务端不一致。</p>
          <p className="bk-note">请返回地图后重新进入这场战斗；如果仍然出现，请刷新页面。</p>
          <button type="button" className="bk-btn" onClick={onExit}>
            ‹ 返回地图
          </button>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="xp-fight-screen">
      <Suspense fallback={<div className="xp-fight-loading" role="status">正在载入战斗舞台…</div>}>
        <Stage
          battle={state}
          playerName={userName}
          deck={inputsOf(view, battleView.lineup).map((input) => input.face)}
          encounter={battleView.encounter}
          encounters={[]}
          tutorial={false}
          actionError={actionError}
          onSelectStage={noop}
          onStart={noop}
          onPlay={(card, skill) => act({ type: "skill", card, skill })}
          onDefend={(tier) => act({ type: "defend", tier })}
          onSwap={(slot, benchUid) => act({ type: "swap", slot, benchUid })}
          onEndTurn={() => act({ type: "endTurn" })}
          onRestart={noop}
          onSwitchUi={switchUi}
          host={host}
        />
      </Suspense>
      {confirmLeave && <FlatDialog title="离开战斗？" onClose={() => setConfirmLeave(false)}>
        <p>有几步操作还没存到服务端。现在离开会丢掉这些操作。</p>
        <div className="xp-dialog-actions">
          <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setConfirmLeave(false)}>继续战斗</button>
          <button type="button" className="bk-btn bk-btn--main" onClick={onExit}>确认离开</button>
        </div>
      </FlatDialog>}
    </div>,
    document.body,
  )
}
