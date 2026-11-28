import { useCallback, useEffect, useRef, useState } from "react"

import { Link } from "@/flat/Link"
import { fetchCurrentExpedition } from "@/flat/expedition/api"
import { computeRunHp } from "@/flat/expedition/metrics"
import { RewardChips, rewardLines } from "@/flat/ui/Rewards"
import { RefetchWhenDue, formatLeft, useNow } from "@/flat/ui/time"
import { refreshProgress } from "@/tutorial/store"
import type { ExpeditionView } from "@choke/shared/expedition/view"

export type ExpeditionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** current 是还没结束的那一次（进行中，或者保存退出了）；没有就是 null */
  | { status: "ready"; current: ExpeditionView | null }

const LOADING: ExpeditionState = { status: "loading" }

/**
 * 现在有没有没结束的远征。这份状态由首页拿着：远征卡要画它，
 * 这一页的粉色主按钮给谁也看它。
 */
export function useCurrentExpedition(userId: string) {
  const [state, setState] = useState<ExpeditionState>(LOADING)
  /** 还没回来的那次读取 */
  const inFlight = useRef<AbortController | null>(null)
  /** 上一次读到的时候有没有没结束的远征 */
  const had = useRef(false)

  // state 只在回包里改，所以 effect 里可以直接调
  const reload = useCallback(() => {
    // 上一次还没回来就作废：晚到的旧数据不能盖住新的
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    fetchCurrentExpedition(userId, controller.signal)
      .then((current) => {
        if (controller.signal.aborted) return
        // 上一次还有、这一次没了：到时间被服务端自动结算了。奖励走邮件，玩家经验直接加，等级条对一次
        if (had.current && current === null) {
          void refreshProgress()
        }
        had.current = current !== null
        setState({ status: "ready", current })
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        const message = reason instanceof Error ? reason.message : "远征取不回来，请稍后再试"
        // 手上已经有结果时（到点重取）取不回来就先留着旧的，不把卡片换成报错
        setState((last) => (last.status === "ready" ? last : { status: "error", message }))
      })
  }, [userId])

  useEffect(() => {
    reload()
    return () => inFlight.current?.abort()
  }, [reload])

  /** 报错之后点「重试」：先回到「正在读」再取 */
  const retry = useCallback(() => {
    setState(LOADING)
    reload()
  }, [reload])

  return { state, reload, retry }
}

interface ExpeditionCardProps {
  state: ExpeditionState
  /** 到点重取用：不动现在画着的东西，取回来再换 */
  reload: () => void
  retry: () => void
  /** 这一页的粉色主按钮是不是在这张卡上 */
  primary: boolean
}

/**
 * 首页的远征卡：有没结束的远征就写走到哪了、还剩多久，按钮回远征页接着打；没有就只给去远征的按钮。
 * 结算和放弃都留在远征页做（那边有确认和结算画面），这里不放。
 */
export function ExpeditionCard({ state, reload, retry, primary }: ExpeditionCardProps) {
  const current = state.status === "ready" ? state.current : null
  const pending = current ? rewardLines(current.pending) : []
  const runHp = current ? computeRunHp(current) : null
  const button = `bk-btn ${primary ? "bk-btn--main" : ""}`
  return (
    <section
      className={`fl-card home-expedition ${primary ? "fl-card--accent" : ""}`}
      aria-busy={state.status === "loading"}
    >
      <div className="fl-card__head">
        <h2 className="fl-card__title">远征</h2>
        {current && <TimeLeft view={current} reload={reload} />}
      </div>
      {state.status === "loading" ? (
        <p className="bk-note" role="status">
          正在看有没有没打完的远征……
        </p>
      ) : state.status === "error" ? (
        <div className="bk-empty" role="alert">
          <span className="bk-error">{state.message}</span>
          <button type="button" className="bk-btn bk-btn--sm" onClick={retry}>
            重试
          </button>
        </div>
      ) : current ? (
        <>
          <b className="home-expedition__map">{current.map.name}</b>
          <div className="home-expedition__stats">
            <span>
              队伍血量{" "}
              <span className="bk-num">
                {runHp ? `${runHp.current.toLocaleString("en-US")}/${runHp.max.toLocaleString("en-US")} HP (${runHp.pct}%)` : `${Math.round(current.hpRatio * 100)}%`}
              </span>
            </span>
            {current.maxStars > 0 && (
              <span>
                已得{" "}
                <span className="bk-num">
                  {current.stars}/{current.maxStars}
                </span>{" "}
                星
              </span>
            )}
          </div>
          <div className="home-expedition__pending">
            <span>已攒下：</span>
            {pending.length > 0 ? <RewardChips lines={pending} /> : <span>还没有</span>}
          </div>
          <Link className={button} to="/expedition">
            {current.atEnd ? "去结算" : "继续远征"}
          </Link>
        </>
      ) : (
        <>
          <p className="bk-note">现在没有进行中的远征。</p>
          <Link className={button} to="/expedition">
            去远征
          </Link>
        </>
      )}
    </section>
  )
}

/**
 * 「进行中 · 还剩 18 小时 12 分」。每秒走一格的秒表关在这里面，整张卡不用跟着重画。
 * 到点了就让首页重取一次：服务端读的时候顺便做到期结算，取回来的就是「没有了」。
 * 远征接口不带服务器时间，只能按本机的钟走。
 */
function TimeLeft({ view, reload }: { view: ExpeditionView; reload: () => void }) {
  const now = useNow(1000)
  const expiresAt = Date.parse(view.expiresAt)
  const left = expiresAt - now
  return (
    <span className="fl-card__meta">
      <RefetchWhenDue dueAt={expiresAt} refetch={reload} />
      {view.status === "suspended" ? "已保存退出" : "进行中"} ·{" "}
      {left >= 1000 ? `还剩 ${formatLeft(left)}` : "正在结算"}
    </span>
  )
}
