import { useMemo, useState, type CSSProperties } from "react"

import { useFlat } from "@/flat/context"
import { RewardChips, rewardLines } from "@/flat/ui/Rewards"
import { RefetchWhenDue, formatLeft, useNow } from "@/flat/ui/time"
import type { MapKind } from "@choke/shared/expedition/content"
import type { ExpeditionView } from "@choke/shared/expedition/view"

import type { MapListing } from "./api"
import { layoutMap, stepCountOf, titleOf } from "./layout"
import { computeRunHp, formatMult, hpTone } from "./metrics"
import { Stars } from "./Stars"
import { endsWithinHour, remainingText } from "./util"

export { Stars }

const KIND_LABEL: Record<MapKind, string> = {
  main: "主线",
  daily: "日常",
  weekly: "周常",
  season: "赛季",
}
const KIND_ORDER: MapKind[] = ["main", "daily", "weekly", "season"]

interface LobbyProps {
  userId: string
  /** null = 还在读 */
  maps: MapListing[] | null
  mapsError: string | null
  onRetry: () => void
  /** 没结束的那一次（active / suspended） */
  current: ExpeditionView | null
  busy: boolean
  onResume: () => void
  onSettle: () => void
  /** 页面负责弹确认 */
  onAbandon: () => void
  onPick: (map: MapListing) => void
}

/** 选图大厅：顶部标题+经验池提示+分段切换；进行中横幅展示精确 HP 与已行进步数（不剧透总步数）；2 列宽卡网格 */
export function Lobby({
  maps,
  mapsError,
  onRetry,
  current,
  busy,
  onResume,
  onSettle,
  onAbandon,
  onPick,
}: LobbyProps) {
  const { user } = useFlat()
  const now = useNow(30_000)
  const [kind, setKind] = useState<MapKind>("main")

  const kinds = KIND_ORDER.filter((k) => maps?.some((m) => m.kind === k))
  const active = kinds.includes(kind) ? kind : kinds[0]
  const shown = maps && active ? maps.filter((m) => m.kind === active) : []
  // 这一屏唯一的粉色主按钮：有横幅时在横幅上；没有横幅时给第一张能开始的图
  const primaryId = current ? null : (shown.find((m) => m.startable)?.id ?? null)
  const expPool = user.expPool ?? 0

  return (
    <div className="fl-page xp-lobby">
      <header className="xp-lobby__head">
        <div className="xp-lobby__intro">
          <h1 className="fl-page__title">远征</h1>
          <p className="bk-note">组建编队，步步深入未知前路，无体力消耗。</p>
        </div>
        <div className="xp-lobby__meta">
          <div className="xp-exp-pool" title="远征产出的经验池可在卡册里自由分配给任意卡牌">
            <i aria-hidden />
            <span>经验池</span>
            <b className="bk-num">{expPool.toLocaleString("en-US")}</b>
          </div>
          {active !== undefined && maps && (
            <div className="bk-seg xp-tabs" role="group" aria-label="地图分类">
              {kinds.map((k) => (
                <button key={k} type="button" aria-pressed={k === active} onClick={() => setKind(k)}>
                  {KIND_LABEL[k]}
                  <small>{maps.filter((m) => m.kind === k).length}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {current && (
        <Banner view={current} busy={busy} onResume={onResume} onSettle={onSettle} onAbandon={onAbandon} onDue={onRetry} />
      )}

      {maps === null ? (
        mapsError !== null ? (
          <div className="bk-empty" role="alert">
            <span className="bk-error">{mapsError}</span>
            <button type="button" className="bk-btn" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : (
          <div className="xp-lobby__loading" role="status" aria-label="正在读取地图">
            <div className="xp-skeleton xp-skeleton--tabs" />
            <div className="xp-maps">
              {[0, 1, 2, 3].map((index) => (
                <div className="xp-skeleton" key={index} />
              ))}
            </div>
          </div>
        )
      ) : active === undefined ? (
        <div className="bk-empty">现在还没有可以出征的地图。</div>
      ) : (
        <>
          {current && (
            <p className="bk-note xp-lobby__lock-note">有一次远征尚未结束，请先继续或结算它，再开启新的远征。</p>
          )}
          <div className="xp-maps">
            {shown.map((map) => (
              <MapCard
                key={map.id}
                map={map}
                now={now}
                primary={map.id === primaryId}
                blocked={current !== null}
                busy={busy}
                onPick={onPick}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MapCard({
  map,
  now,
  primary,
  blocked,
  busy,
  onPick,
}: {
  map: MapListing
  now: number
  primary: boolean
  blocked: boolean
  busy: boolean
  onPick: (map: MapListing) => void
}) {
  const periodic = map.kind === "daily" || map.kind === "weekly"
  const cleared = map.clears > 0
  return (
    <article className="fl-card xp-map" data-kind={map.kind} data-locked={map.startable ? undefined : ""}>
      <div className="xp-map__head">
        <span className="xp-map__kind">{KIND_LABEL[map.kind]}</span>
        {map.maxStars > 0 && <Stars got={map.bestStars} total={map.maxStars} />}
      </div>
      <div className="xp-map__text">
        <h2 className="xp-map__name">{map.name}</h2>
        {map.summary && <p className="bk-note xp-map__sum">{map.summary}</p>}
      </div>
      <div className="xp-map__facts">
        <div className="xp-stat">
          <span>卡池上限</span>
          <b className="bk-num">{map.deckSize} 张</b>
        </div>
        <div className="xp-stat">
          <span>战斗场数</span>
          <b className="bk-num">{map.fights} 场</b>
        </div>
        <div className="xp-stat">
          <span>{map.objectiveCount > 0 ? "通关目标" : "通关次数"}</span>
          <b className="bk-num">
            {map.objectiveCount > 0 ? `${map.bestObjectives}/${map.objectiveCount}` : `${map.clears} 次`}
          </b>
        </div>
      </div>
      <div className="xp-map__status">
        <span className={cleared ? "xp-map__badge is-clear" : "xp-map__badge is-first"}>
          {cleared ? `已首通（共 ${map.clears} 次）· 无体力消耗` : "首通奖励待领取 · 无体力消耗"}
        </span>
        {periodic && (
          <span className="xp-map__reset" data-soon={endsWithinHour(map.endsAt, now) ? "" : undefined}>
            本期还剩 {remainingText(map.endsAt, now)}
          </span>
        )}
      </div>
      {!map.startable && <p className="xp-map__lock">{map.lockedReason ?? "暂时不能出征"}</p>}
      <div className="xp-map__foot">
        <button
          type="button"
          className={`bk-btn ${primary ? "bk-btn--main" : ""}`}
          disabled={!map.startable || blocked || busy}
          title={blocked ? "先处理进行中的远征" : undefined}
          onClick={() => onPick(map)}
        >
          出征准备
        </button>
      </div>
    </article>
  )
}

function Banner({
  view,
  busy,
  onResume,
  onSettle,
  onAbandon,
  onDue,
}: {
  view: ExpeditionView
  busy: boolean
  onResume: () => void
  onSettle: () => void
  onAbandon: () => void
  onDue: () => void
}) {
  const layout = useMemo(() => layoutMap(view.map), [view.map])
  const here = layout.nodes[view.position]
  const step = stepCountOf(layout, view.position)
  const hereTitle = here ? titleOf(here.node) : "未知区域"
  const runHp = useMemo(() => computeRunHp(view), [view])
  const pending = rewardLines(view.pending)
  const diff = view.difficulty

  return (
    <section className="fl-card fl-card--accent xp-banner" aria-label="进行中的远征">
      <div className="xp-banner__body">
        <div className="xp-banner__top">
          <span className="xp-banner__state" data-state={view.status}>
            {view.status === "suspended" ? "已保存退出" : "进行中"}
          </span>
          <Clock view={view} onDue={onDue} />
        </div>
        <h2 className="xp-banner__name">{view.map.name}</h2>
        <div className="xp-banner__stats">
          <div className="xp-stat">
            <span>行进状态</span>
            <b>
              已行进 第 {step} 步 <small>· {hereTitle}</small>
            </b>
          </div>
          {view.maxStars > 0 && (
            <div className="xp-stat">
              <span>已得星数</span>
              <b>
                <Stars got={view.stars} total={view.maxStars} />
              </b>
            </div>
          )}
          <div className="xp-stat">
            <span>威胁</span>
            <b>
              {diff.tier} 档{" "}
              <small className="bk-num">
                {diff.nextTierAt === null ? "最高" : `${diff.threat}/${diff.nextTierAt}`} · 敌HP{" "}
                {formatMult(diff.hpMult)} · 掉落 {formatMult(diff.lootMult)}
              </small>
            </b>
          </div>
        </div>
        <div className="xp-banner__hp">
          <div className="xp-banner__hp-head">
            <span>队伍血量</span>
            <b className="bk-num">
              {runHp.current.toLocaleString("en-US")} / {runHp.max.toLocaleString("en-US")} HP
            </b>
            <small className="bk-num">
              {runHp.pct}% · 按当前 {runHp.slotCount} 槽计
            </small>
          </div>
          <div
            className="xp-meter"
            style={{ "--p": runHp.pct } as CSSProperties}
            data-tone={hpTone(runHp.pct)}
            role="progressbar"
            aria-label="队伍血量"
            aria-valuemin={0}
            aria-valuemax={runHp.max || 100}
            aria-valuenow={runHp.current}
          />
        </div>
        <div className="xp-banner__pending">
          <span>已攒奖励</span>
          {pending.length > 0 ? <RewardChips lines={pending} /> : <em>还没有</em>}
        </div>
        <p className="bk-note">到时间还没结算会自动结算，攒下的奖励通过邮箱发放。</p>
      </div>
      <div className="xp-banner__actions">
        <button type="button" className="bk-btn bk-btn--main" disabled={busy} onClick={onResume}>
          继续远征
        </button>
        <button type="button" className="bk-btn" disabled={busy} onClick={onSettle}>
          {view.atEnd ? "通关结算" : "到此结算"}
        </button>
        <button type="button" className="bk-btn bk-btn--ghost xp-danger" disabled={busy} onClick={onAbandon}>
          放弃
        </button>
      </div>
    </section>
  )
}

/**
 * 「还剩 18 小时 12 分」。每秒走一格的秒表关在这里面，整张横幅不用跟着重画。
 * 到点让页面重取：服务端读的时候顺便做到期结算，取回来就是「没有了」。
 */
function Clock({ view, onDue }: { view: ExpeditionView; onDue: () => void }) {
  const now = useNow(1000)
  const expiresAt = Date.parse(view.expiresAt)
  const left = expiresAt - now
  return (
    <span className="xp-banner__clock">
      <RefetchWhenDue dueAt={expiresAt} refetch={onDue} />
      {left >= 1000 ? `还剩 ${formatLeft(left)}` : "正在结算"}
    </span>
  )
}
