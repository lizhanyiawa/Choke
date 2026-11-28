import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ApiError } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { FlatDialog } from "@/flat/ui/FlatDialog"
import { refreshQuests } from "@/flat/quests/store"
import { refreshSupply } from "@/flat/supply/store"
import { refreshProgress } from "@/tutorial/store"
import type { ExpeditionPoolCard, ExpeditionSettlement, ExpeditionView } from "@choke/shared/expedition/view"

import {
  abandonExpedition,
  fetchCurrentExpedition,
  fetchExpeditionMaps,
  resumeExpedition,
  settleExpedition,
  suspendExpedition,
  type MapListing,
} from "./api"
import { Fight } from "./Fight"
import { LineupPicker } from "./LineupPicker"
import { Lobby } from "./Lobby"
import { Prepare } from "./Prepare"
import { RunView, type RunMenu } from "./RunView"
import { Settlement } from "./Settlement"
import { errorText } from "./util"
import "./expedition.css"

type Screen =
  | { name: "lobby" }
  | { name: "prepare"; map: MapListing }
  | { name: "run"; view: ExpeditionView }
  | { name: "settled"; result: ExpeditionSettlement; mapName: string; pool: readonly ExpeditionPoolCard[] }

/** 扁平外壳内的远征状态机；未结束的远征始终留在大厅横幅里。 */
export function ExpeditionPage() {
  const { user, notify, refreshUser, refreshPacks } = useFlat()
  const [screen, setScreen] = useState<Screen>({ name: "lobby" })
  const [maps, setMaps] = useState<MapListing[] | null>(null)
  const [mapsError, setMapsError] = useState<string | null>(null)
  const [current, setCurrent] = useState<ExpeditionView | null>(null)
  const [inBattle, setInBattle] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [abandonTarget, setAbandonTarget] = useState<string | null>(null)
  const lobbyRequest = useRef(0)
  const hadCurrent = useRef(false)

  const refreshMapsAfterFinalization = useCallback(async () => {
    const requestId = ++lobbyRequest.current
    try {
      const nextMaps = await fetchExpeditionMaps(user.id)
      if (requestId !== lobbyRequest.current) return
      setMaps(nextMaps)
      setMapsError(null)
    } catch (reason) {
      if (requestId !== lobbyRequest.current) return
      setMaps(null)
      setMapsError(errorText(reason))
    }
  }, [user.id])

  /** 结算、放弃或到期后同步钱包、经验和任务，再取回最新地图进度。 */
  const refreshAfterFinalization = useCallback(async () => {
    refreshUser()
    refreshPacks()
    await Promise.allSettled([refreshProgress(user.id), refreshQuests(), refreshSupply()])
    await refreshMapsAfterFinalization()
  }, [refreshMapsAfterFinalization, refreshPacks, refreshUser, user.id])

  /** 进页和重试时一并读取当前远征与地图；序号阻止过期回包盖住较新的操作。 */
  const loadLobby = useCallback(async () => {
    const requestId = ++lobbyRequest.current
    let loadedCurrent: ExpeditionView | null = null
    let currentError: string | null = null
    try {
      loadedCurrent = await fetchCurrentExpedition(user.id)
    } catch (reason) {
      currentError = errorText(reason)
    }
    if (requestId !== lobbyRequest.current) return

    if (currentError === null) {
      const expired = hadCurrent.current && loadedCurrent === null
      hadCurrent.current = loadedCurrent !== null
      setCurrent(loadedCurrent)
      if (expired) {
        // 当前接口会顺便结算到期远征；其奖励走邮件，但经验和地图进度已经改变。
        await refreshAfterFinalization()
        return
      }
    }

    try {
      const nextMaps = await fetchExpeditionMaps(user.id)
      if (requestId !== lobbyRequest.current) return
      if (currentError !== null) throw new Error(currentError)
      setMaps(nextMaps)
      setMapsError(null)
    } catch (reason) {
      if (requestId !== lobbyRequest.current) return
      setMaps(null)
      setMapsError(errorText(reason))
    }
  }, [refreshAfterFinalization, user.id])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLobby(), 0)
    return () => {
      window.clearTimeout(timer)
      lobbyRequest.current += 1
    }
  }, [loadLobby])

  const screenKey = screen.name === "prepare"
    ? `prepare:${screen.map.id}`
    : screen.name === "run"
      ? `run:${inBattle ? screen.view.battle?.lineup.length === 0 ? "lineup" : "fight" : "map"}`
      : screen.name
  useLayoutEffect(() => {
    const main = document.querySelector(".flat-main")
    if (main) main.scrollTop = 0
  }, [screenKey])

  const finish = async (result: ExpeditionSettlement, mapName: string, pool: readonly ExpeditionPoolCard[]) => {
    setCurrent(null)
    hadCurrent.current = false
    setInBattle(false)
    setScreen({ name: "settled", result, mapName, pool })
    await refreshAfterFinalization()
  }

  const runAction = async (job: () => Promise<void>) => {
    setBusy(true)
    setActionError(null)
    try {
      await job()
    } catch (reason) {
      const message = errorText(reason)
      setActionError(message)
      notify(message, "error")
      if (reason instanceof ApiError && (reason.code === "expedition_expired" || reason.code === "no_expedition")) {
        setCurrent(null)
        hadCurrent.current = false
        setAbandonTarget(null)
        setInBattle(false)
        setScreen({ name: "lobby" })
        void refreshAfterFinalization()
      }
    } finally {
      setBusy(false)
    }
  }

  const resume = () => {
    if (!current) return
    const saved = current
    void runAction(async () => {
      const view = saved.status === "suspended" ? await resumeExpedition(user.id) : saved
      hadCurrent.current = true
      setCurrent(null)
      setActionError(null)
      setInBattle(false)
      setScreen({ name: "run", view })
    })
  }

  const suspend = () => {
    if (screen.name !== "run") return
    void runAction(async () => {
      const saved = await suspendExpedition(user.id)
      hadCurrent.current = true
      setCurrent(saved)
      setInBattle(false)
      setScreen({ name: "lobby" })
    })
  }

  const settle = () => {
    const mapName = screen.name === "run" ? screen.view.map.name : current?.map.name ?? "远征"
    const pool = screen.name === "run" ? screen.view.pool : current?.pool ?? []
    void runAction(async () => {
      await finish(await settleExpedition(user.id), mapName, pool)
    })
  }

  const requestAbandon = (mapName: string) => {
    setActionError(null)
    setAbandonTarget(mapName)
  }

  const confirmAbandon = () => {
    const mapName = abandonTarget ?? "远征"
    const pool = screen.name === "run" ? screen.view.pool : current?.pool ?? []
    void runAction(async () => {
      const result = await abandonExpedition(user.id)
      setAbandonTarget(null)
      await finish(result, mapName, pool)
    })
  }

  const onView = (view: ExpeditionView) => {
    setScreen({ name: "run", view })
  }

  const onDone = () => {
    setScreen({ name: "lobby" })
    setInBattle(false)
  }

  const abandonDialog = abandonTarget !== null && (
    <FlatDialog title="确认放弃？" onClose={() => setAbandonTarget(null)} busy={busy}>
      <p className="bk-note">
        放弃「{abandonTarget}」后不会得到任何奖励，已攒下的途中战利品也会清空，锁定卡牌将立即解除锁定。
      </p>
      {actionError && <p className="bk-error" role="alert">{actionError}</p>}
      <div className="xp-dialog-actions">
        <button type="button" className="bk-btn" disabled={busy} onClick={() => setAbandonTarget(null)}>
          再想想
        </button>
        <button type="button" className="bk-btn bk-btn--ghost xp-danger" disabled={busy} onClick={confirmAbandon}>
          {busy ? "正在放弃……" : "确认放弃"}
        </button>
      </div>
    </FlatDialog>
  )

  if (screen.name === "prepare") {
    return <Prepare userId={user.id} map={screen.map} onBack={() => setScreen({ name: "lobby" })} onStarted={(view) => {
      hadCurrent.current = true
      setCurrent(null)
      setActionError(null)
      setInBattle(false)
      setScreen({ name: "run", view })
    }} />
  }

  if (screen.name === "run" && inBattle && screen.view.battle) {
    if (screen.view.battle.lineup.length === 0) {
      return <LineupPicker userId={user.id} view={screen.view} onView={onView} onBack={() => setInBattle(false)} />
    }
    return <>
      <Fight
        key={`${screen.view.battle.nodeId}:${screen.view.battle.seed}`}
        userId={user.id}
        userName={user.username}
        view={screen.view}
        onView={onView}
        onExit={() => setInBattle(false)}
        onSettle={settle}
        onAbandon={() => requestAbandon(screen.view.map.name)}
      />
      {abandonDialog}
      {actionError && abandonTarget === null && (
        <FlatDialog title="远征操作未完成" onClose={() => setActionError(null)}>
          <p className="bk-error" role="alert">{actionError}</p>
          <div className="xp-dialog-actions">
            <button type="button" className="bk-btn" onClick={() => setActionError(null)}>知道了</button>
          </div>
        </FlatDialog>
      )}
    </>
  }

  if (screen.name === "run") {
    const menu: RunMenu = {
      busy,
      error: actionError,
      onSuspend: suspend,
      onSettle: settle,
      onAbandon: () => requestAbandon(screen.view.map.name),
    }
    return <>
      <RunView userId={user.id} view={screen.view} onView={onView} menu={menu} onEnterBattle={() => setInBattle(true)} />
      {abandonDialog}
    </>
  }

  if (screen.name === "settled") {
    return <Settlement result={screen.result} mapName={screen.mapName} pool={screen.pool} onDone={onDone} />
  }

  return <>
    {actionError && abandonTarget === null && (
      <FlatDialog title="远征操作未完成" onClose={() => setActionError(null)}>
        <p className="bk-error" role="alert">{actionError}</p>
        <div className="xp-dialog-actions">
          <button type="button" className="bk-btn" onClick={() => setActionError(null)}>知道了</button>
        </div>
      </FlatDialog>
    )}
    <Lobby
      userId={user.id}
      maps={maps}
      mapsError={mapsError}
      onRetry={() => void loadLobby()}
      current={current}
      busy={busy}
      onResume={resume}
      onSettle={settle}
      onAbandon={() => requestAbandon(current?.map.name ?? "远征")}
      onPick={(map) => {
        setActionError(null)
        setScreen({ name: "prepare", map })
      }}
    />
    {abandonDialog}
  </>
}
