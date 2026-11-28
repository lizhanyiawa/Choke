import { useMemo, useRef, useState, type CSSProperties } from "react"
import { FiChevronDown, FiRotateCcw } from "react-icons/fi"
import { battlePower } from "@/card/data"
import { GameCardFace } from "@/card/GameCardFace"
import { useFlat } from "@/flat/context"
import { RewardChips, rewardLines } from "@/flat/ui/Rewards"
import { useDismiss } from "@/flat/ui/useDismiss"
import { describeStar } from "@choke/shared/battle/stars"
import { BASE_AP_MAX, UPGRADED_AP_MAX } from "@choke/shared/expedition-points"
import { objectiveMet, objectiveText } from "@choke/shared/expedition/difficulty"
import type { ExpeditionView } from "@choke/shared/expedition/view"

import { moveExpedition, submitEvent, submitStory } from "./api"
import { KIND_LABEL, computeFogWindow, kindOf, layoutMap, stepCountOf, titleOf } from "./layout"
import { MapStage } from "./MapStage"
import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  JOB_COLOR,
  JOB_LABEL,
  baselineLineupOf,
  cardBattleStats,
  computeRunHp,
  enemyTierLabel,
  formatMult,
  hpTone,
} from "./metrics"
import { KindBadge } from "./NodeIcon"
import { EventPanel, StoryPanel } from "./Panels"
import { Stars } from "./Stars"
import { errorText } from "./util"
import "./run.css"

export interface RunMenu {
  busy: boolean
  error: string | null
  onSuspend: () => void
  onSettle: () => void
  onAbandon: () => void
}

type SideTab = "action" | "loot" | "objectives"

function ElementDot({ element }: { element: string }) {
  return (
    <span className="xp-el-pill">
      <i style={{ "--c": ELEMENT_COLOR[element] ?? "var(--bk-dim)" } as CSSProperties} aria-hidden />
      {ELEMENT_LABEL[element] ?? element}
    </span>
  )
}

/** 远征推进主视图：顶部战术 HUD + 左 2.5D 圆台推进地图 / 右 356px 常驻指挥栏 + 底部紧凑队伍条 */
export function RunView({
  userId,
  view,
  onView,
  menu,
  onEnterBattle,
}: {
  userId: string
  view: ExpeditionView
  onView: (view: ExpeditionView) => void
  menu: RunMenu
  onEnterBattle: () => void
}) {
  const { notify } = useFlat()
  const layout = useMemo(() => layoutMap(view.map), [view.map])
  const fog = useMemo(
    () => computeFogWindow(layout, view.position, view.availableNext),
    [layout, view.availableNext, view.position],
  )

  const [selected, setSelected] = useState(view.position)
  const [branchChoice, setBranchChoice] = useState<string | null>(null)
  const [sideTab, setSideTab] = useState<SideTab>("action")
  const [previousPosition, setPreviousPosition] = useState(view.position)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismiss(menuRef, menuOpen, () => setMenuOpen(false))

  if (previousPosition !== view.position) {
    setPreviousPosition(view.position)
    setSelected(view.position)
    setBranchChoice(null)
    setSideTab("action")
    setError(null)
  }

  const choices = useMemo(
    () => (view.nodeDone ? view.availableNext.filter((id) => Boolean(layout.nodes[id])) : []),
    [layout, view.availableNext, view.nodeDone],
  )

  // 确保选中的节点仍在视野内，且不可停留在 horizon 节点上
  const safeSelected =
    fog.byId[selected] && fog.byId[selected]!.visibility !== "horizon" ? selected : view.position
  const selectedVisibility = fog.byId[safeSelected]?.visibility ?? "current"

  // 当前处于可推进分叉状态时的默认高亮目标
  const activeBranchTarget =
    selectedVisibility === "next" && choices.includes(safeSelected)
      ? safeSelected
      : branchChoice && choices.includes(branchChoice)
        ? branchChoice
        : choices[0] ?? null

  // 地图上高亮的节点：当右侧处于「当前格分叉抉择」时，同步高亮当前选定的前路圆台
  const stageSelected =
    selectedVisibility === "current" && view.nodeDone && !view.atEnd && activeBranchTarget
      ? activeBranchTarget
      : safeSelected

  const act = async (
    job: () => Promise<ExpeditionView>,
    after?: (next: ExpeditionView, previousTier: number) => void,
  ) => {
    const previousTier = view.difficulty.tier
    setBusy(true)
    setError(null)
    try {
      const next = await job()
      onView(next)
      after?.(next, previousTier)
      if (!after && next.difficulty.tier > previousTier) notify(`威胁升到 ${next.difficulty.tier} 档`, "info")
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const moveTo = (targetId: string) => {
    if (!choices.includes(targetId) || busy) return
    void act(
      () => moveExpedition(userId, targetId),
      (next, previousTier) => {
        const node = next.map.nodes[next.position]
        if (!node) return
        const message = `抵达：${titleOf(node)}`
        notify(
          next.difficulty.tier > previousTier ? `${message} · 威胁升到 ${next.difficulty.tier} 档` : message,
          next.difficulty.tier > previousTier ? "info" : "success",
        )
      },
    )
  }

  const step = stepCountOf(layout, view.position)
  const diff = view.difficulty
  const runHp = useMemo(() => computeRunHp(view), [view])
  const tone = hpTone(runHp.pct)
  const pending = useMemo(() => rewardLines(view.pending), [view.pending])

  const objectives = useMemo(() => {
    const list = view.map.objectives ?? []
    return list.map((objective) => ({
      text: objectiveText(objective),
      met: objectiveMet(objective, { tier: diff.tier, flags: view.flags }),
    }))
  }, [diff.tier, view.flags, view.map.objectives])
  const metObjectives = objectives.filter((item) => item.met).length

  const squadCards = useMemo(() => {
    const mainIds = new Set(baselineLineupOf(view).map((entry) => entry.userCardId))
    return view.pool.map((entry) => {
      const stats = cardBattleStats(entry.face, entry.userCardId)
      const bp = battlePower(entry.face)
      return {
        ...entry,
        hp: stats.hpContribution,
        bp,
        isMain: mainIds.has(entry.userCardId),
      }
    })
  }, [view])
  const totalPower = useMemo(() => squadCards.reduce((sum, item) => sum + item.bp, 0), [squadCards])

  const inspectedPlaced = layout.nodes[safeSelected]
  const inspectedKind = inspectedPlaced ? kindOf(inspectedPlaced.node) : "empty"
  const inspectedPreview = view.nodePreviews[safeSelected]
  const inspectedTitle =
    inspectedPreview?.encounter && inspectedPreview.title === KIND_LABEL[inspectedKind]
      ? inspectedPreview.encounter.name
      : inspectedPreview?.title ?? (inspectedPlaced ? titleOf(inspectedPlaced.node) : "当前位置")
  const inspectedLocked = Boolean(fog.byId[safeSelected]?.locked)
  const canMoveToSelected = choices.includes(safeSelected)

  const battle = selectedVisibility === "current" ? view.battle : null
  const encounter = battle?.encounter
  const activeBranchPreview = activeBranchTarget ? view.nodePreviews[activeBranchTarget] : undefined
  const activeBranchNode = activeBranchTarget ? layout.nodes[activeBranchTarget]?.node : undefined
  const activeBranchTitle = activeBranchTarget
    ? activeBranchPreview?.encounter &&
      activeBranchNode &&
      activeBranchPreview.title === KIND_LABEL[kindOf(activeBranchNode)]
      ? activeBranchPreview.encounter.name
      : activeBranchPreview?.title ?? (activeBranchNode ? titleOf(activeBranchNode) : "下一站")
    : ""

  const hpBasisTitle = runHp.fromActiveBattle
    ? `按当前战斗上阵 ${runHp.slotCount} 槽精确计算`
    : `按卡池主力前 ${runHp.slotCount} 槽精确计算`

  return (
    <section className="xp-run" aria-label={`${view.map.name} · 远征进行中`}>
      {/* 顶部战术 HUD（单行紧凑 58px） */}
      <header className="xp-run__top">
        <div className="xp-run__heading">
          <div className="xp-run__title">
            <b title={view.map.name}>{view.map.name}</b>
            <span className="xp-run__step">已行进 第 {step} 步</span>
          </div>
          {view.maxStars > 0 && (
            <div className="xp-run__stars" title={`战斗星数 ${view.stars} / ${view.maxStars}`}>
              <Stars got={view.stars} total={view.maxStars} />
              <small className="bk-num">
                {view.stars}/{view.maxStars}
              </small>
            </div>
          )}
        </div>

        <div
          className="xp-threat"
          aria-label={`威胁 ${diff.tier} 档，威胁值 ${diff.threat}，敌HP ${formatMult(diff.hpMult)}，掉落 ${formatMult(diff.lootMult)}`}
        >
          <div className="xp-threat__row">
            <span className="xp-threat__tier">
              威胁 <strong className="bk-num">{diff.tier}</strong> 档
            </span>
            <small className="xp-threat__value bk-num">
              {diff.threat}/{diff.nextTierAt === null ? "MAX" : diff.nextTierAt}
            </small>
          </div>
          <div className="xp-threat__steps" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} data-on={i < diff.tier} data-current={i + 1 === diff.tier} />
            ))}
          </div>
          <span className="xp-threat__mult">
            敌HP <b className="bk-num">{formatMult(diff.hpMult)}</b> · 掉落{" "}
            <b className="bk-num">{formatMult(diff.lootMult)}</b>
          </span>
        </div>

        <div className="xp-run__hp" title={hpBasisTitle}>
          <div className="xp-run__hp-label">
            <span>队伍 HP</span>
            <b className="bk-num">
              {runHp.current.toLocaleString("en-US")} / {runHp.max.toLocaleString("en-US")} HP
            </b>
            <small className="bk-num">{runHp.pct}%</small>
          </div>
          <div
            className="xp-meter"
            style={{ "--p": runHp.pct } as CSSProperties}
            data-tone={tone}
            role="progressbar"
            aria-label="队伍血量"
            aria-valuemin={0}
            aria-valuemax={runHp.max || 100}
            aria-valuenow={runHp.current}
          />
        </div>

        <div className="xp-menu" ref={menuRef}>
          <button
            type="button"
            className="bk-btn bk-btn--ghost xp-menu__trigger"
            aria-label="打开远征菜单"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span>菜单</span>
            <FiChevronDown aria-hidden />
          </button>
          {menuOpen && (
            <div className="xp-menu__list" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={menu.busy}
                onClick={() => {
                  setMenuOpen(false)
                  menu.onSuspend()
                }}
              >
                保存并退出
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={menu.busy}
                onClick={() => {
                  setMenuOpen(false)
                  menu.onSettle()
                }}
              >
                {view.atEnd ? "通关结算" : "到此结算"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="xp-danger"
                disabled={menu.busy}
                onClick={() => {
                  setMenuOpen(false)
                  menu.onAbandon()
                }}
              >
                放弃远征
              </button>
            </div>
          )}
        </div>
      </header>

      {(error ?? menu.error) && (
        <div className="bk-error xp-run__error" role="alert">
          {error ?? menu.error}
        </div>
      )}

      {/* 中部双栏：左 2.5D 圆台推进地图 + 右 356px 常驻战术指挥侧栏 */}
      <div className="xp-run__body">
        <section className="xp-run__stage" aria-label="远征 2.5D 推进地图">
          <MapStage
            layout={layout}
            position={view.position}
            availableNext={view.availableNext}
            pickable={choices}
            selected={stageSelected}
            previews={view.nodePreviews}
            onSelect={(id) => {
              setSelected(id)
              if (choices.includes(id)) setBranchChoice(id)
              setSideTab("action")
            }}
          />
        </section>

        <aside className="xp-cmd fl-card" aria-label="战术指挥侧栏">
          <div className="xp-cmd__tabs" role="tablist" aria-label="指挥侧栏标签">
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === "action"}
              onClick={() => setSideTab("action")}
            >
              节点行动
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === "loot"}
              onClick={() => setSideTab("loot")}
            >
              战利品 <small className="bk-num">({pending.length})</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === "objectives"}
              onClick={() => setSideTab("objectives")}
            >
              目标{" "}
              <small className="bk-num">
                ({objectives.length > 0 ? `${metObjectives}/${objectives.length}` : "星数"})
              </small>
            </button>
          </div>

          {sideTab === "action" && (
            <div className={`xp-cmd__panel xp-k-${inspectedKind}`} key={`${safeSelected}:${view.nodeDone ? 1 : 0}`}>
              <header className="xp-cmd__head">
                <KindBadge kind={inspectedKind} />
                <div className="xp-cmd__title">
                  <span className="xp-run__eyebrow">
                    {selectedVisibility === "current"
                      ? "当前所在"
                      : selectedVisibility === "next"
                        ? inspectedLocked
                          ? "条件未满足"
                          : "前方路线预览"
                        : "已通过节点"}{" "}
                    · {KIND_LABEL[inspectedKind]}
                  </span>
                  <h2>{inspectedTitle}</h2>
                </div>
                {selectedVisibility !== "current" && (
                  <button
                    type="button"
                    className="xp-cmd__back"
                    onClick={() => setSelected(view.position)}
                    title="返回当前格"
                  >
                    <FiRotateCcw aria-hidden />
                    <span>当前格</span>
                  </button>
                )}
              </header>

              <div className="xp-cmd__scroll">
                {/* 1) 当前格视图 */}
                {selectedVisibility === "current" && (
                  <>
                    {inspectedPreview?.hint && <p className="xp-prose">{inspectedPreview.hint}</p>}

                    {/* 当前格：未完成的战斗 / 危险战 / 首领 */}
                    {!view.nodeDone && encounter && (
                      <div className="xp-foe-card">
                        <div className="xp-foe-card__top">
                          <div>
                            <b>{encounter.enemy.name}</b>
                            {encounter.enemy.title && <small>{encounter.enemy.title}</small>}
                          </div>
                          <span className="xp-foe-card__tier" data-tier={encounter.enemy.tier}>
                            {enemyTierLabel(encounter.enemy.tier)}
                          </span>
                        </div>
                        <dl className="xp-foe-card__stats">
                          <div>
                            <dt>属性</dt>
                            <dd>
                              <ElementDot element={encounter.enemy.element} />
                            </dd>
                          </div>
                          <div>
                            <dt>敌方生命</dt>
                            <dd className="bk-num">
                              <strong>{encounter.enemy.stats.hp.toLocaleString("en-US")}</strong>
                              {inspectedPreview?.encounter &&
                                inspectedPreview.encounter.hp !== encounter.enemy.stats.hp && (
                                  <small>
                                    基础 {inspectedPreview.encounter.hp.toLocaleString("en-US")} ·{" "}
                                    {formatMult(diff.hpMult)}
                                  </small>
                                )}
                            </dd>
                          </div>
                        </dl>
                        <div className="xp-foe-card__weak">
                          <span>弱点</span>
                          <div className="xp-foe-card__weak-list">
                            {encounter.enemy.weaknesses.length > 0 ? (
                              encounter.enemy.weaknesses.map((el) => <ElementDot key={el} element={el} />)
                            ) : (
                              <em>无公开弱点</em>
                            )}
                            {encounter.enemy.hiddenWeaknesses.length > 0 && (
                              <span className="xp-chip">
                                另有 {encounter.enemy.hiddenWeaknesses.length} 个隐藏弱点
                              </span>
                            )}
                          </div>
                        </div>
                        {encounter.summary && <p className="xp-prose">{encounter.summary}</p>}
                        {encounter.stars.length > 0 && (
                          <ul className="xp-foe-card__stars">
                            {encounter.stars.map((cond, i) => {
                              const { title, target } = describeStar(cond)
                              return (
                                <li key={`${cond.type}-${i}`}>
                                  <span aria-hidden>★{i + 1}</span>
                                  <b>{title}</b>
                                  <small>{target}</small>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        {battle?.status === "lost" && (
                          <p className="xp-note">本场战败；可用相同种子重新挑战或调整阵容。</p>
                        )}
                      </div>
                    )}

                    {/* 当前格：未完成的事件 */}
                    {!view.nodeDone && view.event && (
                      <EventPanel
                        key={view.event.nodeId}
                        event={view.event}
                        busy={busy}
                        teamMaxHp={runHp.max}
                        onPick={(choice) => void act(() => submitEvent(userId, choice))}
                      />
                    )}

                    {/* 当前格：未完成的剧情 */}
                    {!view.nodeDone && view.story && (
                      <StoryPanel
                        key={view.story.nodeId}
                        story={view.story}
                        busy={busy}
                        onDone={(picked) => void act(() => submitStory(userId, picked))}
                      />
                    )}

                    {/* 当前格已完成：展示前路抉择卡片或终点提示 */}
                    {view.nodeDone && view.atEnd && (
                      <div className="xp-cmd__end">
                        <p className="xp-prose">已抵达本次远征终点，所有途中收获已整理完毕，可立即通关结算。</p>
                      </div>
                    )}

                    {view.nodeDone && !view.atEnd && choices.length > 0 && (
                      <div className="xp-branches">
                        <div className="xp-branches__head">
                          <span>{choices.length > 1 ? "选择下一步前路" : "前方唯一通道"}</span>
                          <small>{choices.length} 条可选</small>
                        </div>
                        {choices.map((nextId) => {
                          const nextPlaced = layout.nodes[nextId]
                          if (!nextPlaced) return null
                          const nextKind = kindOf(nextPlaced.node)
                          const nextPreview = view.nodePreviews[nextId]
                          const nextTitle =
                            nextPreview?.encounter && nextPreview.title === KIND_LABEL[nextKind]
                              ? nextPreview.encounter.name
                              : nextPreview?.title ?? titleOf(nextPlaced.node)
                          const delta = nextPreview?.threat ?? nextPlaced.node.threat ?? 0
                          const pickedHere = activeBranchTarget === nextId
                          return (
                            <button
                              key={nextId}
                              type="button"
                              className={`xp-branch xp-k-${nextKind}`}
                              data-on={pickedHere}
                              disabled={busy}
                              onClick={() => setBranchChoice(nextId)}
                            >
                              <div className="xp-branch__top">
                                <KindBadge kind={nextKind} />
                                <b>{nextTitle}</b>
                                <span className="xp-branch__kind">{KIND_LABEL[nextKind]}</span>
                                {delta !== 0 && (
                                  <span className={`xp-chip ${delta > 0 ? "xp-chip--warn" : "xp-chip--good"}`}>
                                    威胁 {delta > 0 ? `+${delta}` : delta}
                                  </span>
                                )}
                              </div>
                              {nextPreview?.hint && <p className="xp-branch__hint">{nextPreview.hint}</p>}
                              {nextPreview?.encounter && (
                                <div className="xp-branch__meta">
                                  <ElementDot element={nextPreview.encounter.element} />
                                  {nextPreview.encounter.weaknesses.length > 0 && (
                                    <span>
                                      弱点：
                                      {nextPreview.encounter.weaknesses
                                        .map((el) => ELEMENT_LABEL[el] ?? el)
                                        .join(" / ")}
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {view.nodeDone && !view.atEnd && choices.length === 0 && (
                      <p className="xp-prose">前方暂未满足继续推进的条件。可从菜单到此结算，或保存并退出。</p>
                    )}
                  </>
                )}

                {/* 2) 前方 1 步预览（严格不剧透事件选项全文、剧情台词与敌方技能） */}
                {selectedVisibility === "next" && (
                  <div className="xp-preview-card">
                    {inspectedLocked && (
                      <p className="xp-note">该路径存在前置条件标记，当前尚不可进入。</p>
                    )}
                    {inspectedPreview?.hint && <p className="xp-prose">{inspectedPreview.hint}</p>}
                    {inspectedPreview?.threat !== undefined && inspectedPreview.threat !== 0 && (
                      <div className="xp-preview-card__chips">
                        <span
                          className={`xp-chip ${inspectedPreview.threat > 0 ? "xp-chip--warn" : "xp-chip--good"}`}
                        >
                          进入后威胁 {inspectedPreview.threat > 0 ? `+${inspectedPreview.threat}` : inspectedPreview.threat}
                        </span>
                      </div>
                    )}
                    {inspectedPreview?.encounter && (
                      <div className="xp-foe-card xp-foe-card--brief">
                        <div className="xp-foe-card__top">
                          <div>
                            <b>{inspectedPreview.encounter.name}</b>
                            {inspectedPreview.encounter.title && <small>{inspectedPreview.encounter.title}</small>}
                          </div>
                          <span className="xp-foe-card__tier" data-tier={inspectedPreview.encounter.tier}>
                            {enemyTierLabel(inspectedPreview.encounter.tier)}
                          </span>
                        </div>
                        <div className="xp-foe-card__weak">
                          <span>属性 / 公开弱点</span>
                          <div className="xp-foe-card__weak-list">
                            <ElementDot element={inspectedPreview.encounter.element} />
                            {inspectedPreview.encounter.weaknesses.length > 0 ? (
                              inspectedPreview.encounter.weaknesses.map((el) => (
                                <ElementDot key={`w-${el}`} element={el} />
                              ))
                            ) : (
                              <em>无公开弱点</em>
                            )}
                          </div>
                        </div>
                        <p className="bk-note">抵达后揭晓实时缩放生命值、三星条件与完整战前选阵。</p>
                      </div>
                    )}
                    {!inspectedPreview?.encounter && (
                      <p className="bk-note">
                        {inspectedKind === "event"
                          ? "前方存在遭遇事件，抵达该格后展开抉择选项。"
                          : inspectedKind === "story"
                            ? "前方存在剧情节点，抵达该格后触发对话。"
                            : inspectedPreview?.rewardHint ?? "抵达该格后立即触发节点效果。"}
                      </p>
                    )}
                  </div>
                )}

                {/* 3) 身后 1 步归档卡 */}
                {selectedVisibility === "past" && (
                  <div className="xp-preview-card">
                    <p className="xp-prose">该节点已顺利通过，无法折返。</p>
                    {inspectedPreview?.hint && <p className="bk-note">{inspectedPreview.hint}</p>}
                  </div>
                )}
              </div>

              {/* 置底主操作按钮 */}
              {selectedVisibility === "current" && !view.nodeDone && view.battle && (
                <div className="xp-cmd__foot">
                  <button
                    type="button"
                    className="bk-btn bk-btn--main xp-panel__action"
                    disabled={busy}
                    onClick={onEnterBattle}
                  >
                    {view.battle.lineup.length > 0 ? "继续战斗" : "进入战斗"}
                  </button>
                </div>
              )}

              {selectedVisibility === "current" && view.nodeDone && view.atEnd && (
                <div className="xp-cmd__foot">
                  <button
                    type="button"
                    className="bk-btn bk-btn--main xp-panel__action"
                    disabled={menu.busy}
                    onClick={menu.onSettle}
                  >
                    通关结算
                  </button>
                </div>
              )}

              {selectedVisibility === "current" && view.nodeDone && !view.atEnd && activeBranchTarget && (
                <div className="xp-cmd__foot">
                  <button
                    type="button"
                    className="bk-btn bk-btn--main xp-panel__action"
                    disabled={busy}
                    onClick={() => moveTo(activeBranchTarget)}
                  >
                    {choices.length > 1 ? `前往「${activeBranchTitle}」` : `前进至「${activeBranchTitle}」`}
                  </button>
                </div>
              )}

              {selectedVisibility === "next" && (
                <div className="xp-cmd__foot">
                  {canMoveToSelected ? (
                    <button
                      type="button"
                      className="bk-btn bk-btn--main xp-panel__action"
                      disabled={busy}
                      onClick={() => moveTo(safeSelected)}
                    >
                      前往「{inspectedTitle}」
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="bk-btn xp-panel__action"
                      onClick={() => setSelected(view.position)}
                    >
                      {inspectedLocked ? "前置条件未满足 · 返回当前格" : "先处理当前格"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {sideTab === "loot" && (
            <div className="xp-cmd__panel xp-cmd__panel--list">
              <div className="xp-cmd__scroll">
                <p className="bk-note">本次远征途中累计的战利品将在结算时统一发放（放弃不会获得）。</p>
                {pending.length > 0 ? (
                  <RewardChips lines={pending} className="xp-run__reward-chips" />
                ) : (
                  <p className="xp-cmd__empty">还没有收获，继续探索吧。</p>
                )}
              </div>
            </div>
          )}

          {sideTab === "objectives" && (
            <div className="xp-cmd__panel xp-cmd__panel--list">
              <div className="xp-cmd__scroll">
                {objectives.length > 0 ? (
                  <ul className="xp-obj-list">
                    {objectives.map((item, index) => (
                      <li key={index} data-met={item.met}>
                        <span className="xp-obj-list__badge">{item.met ? "已达成 ✓" : "进行中"}</span>
                        <p>{item.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="xp-cmd__empty">本图以战斗总星数评星，无需额外达成目标。</p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* 底部紧凑出征队伍栏（108px，展示单卡真实 HP 贡献与 BP，移除假血条） */}
      <footer className="xp-run__squad" aria-label="出征队伍">
        <div className="xp-run__squad-summary">
          <div className="xp-run__squad-title">
            <span className="xp-run__eyebrow">出征队伍</span>
            <b className="bk-num">{view.pool.length} 张</b>
          </div>
          <div className="xp-run__squad-meta">
            <span>
              基准 HP <strong className="bk-num">{runHp.max.toLocaleString("en-US")}</strong>
            </span>
            <span>
              上场 <b className="bk-num">{view.allocation.slots}</b> 槽 · AP{" "}
              <b className="bk-num">{view.allocation.apUpgrade ? UPGRADED_AP_MAX : BASE_AP_MAX}</b>
            </span>
            <span>
              总战力 <b className="bk-num">{totalPower.toLocaleString("en-US")}</b>
            </span>
          </div>
        </div>

        <div className="xp-run__cards" data-no-light>
          {squadCards.map(({ userCardId, face, hp, bp, isMain }) => (
            <article className="xp-squad-chip" key={userCardId} data-main={isMain || undefined}>
              <div className="xp-squad-chip__art">
                <GameCardFace card={face} thumbnail />
              </div>
              <div className="xp-squad-chip__info">
                <div className="xp-squad-chip__name">
                  <b title={face.name}>{face.name}</b>
                  <span className="xp-squad-chip__role" data-main={isMain || undefined}>
                    {isMain ? "主力" : "备选"}
                  </span>
                </div>
                <span className="xp-squad-chip__sub">
                  <i style={{ "--c": JOB_COLOR[face.job] ?? "var(--bk-dim)" } as CSSProperties} aria-hidden />
                  {JOB_LABEL[face.job] ?? face.job} · Lv.{face.level}
                </span>
                <div className="xp-squad-chip__nums bk-num">
                  <span className="xp-squad-chip__hp">HP +{hp.toLocaleString("en-US")}</span>
                  <span className="xp-squad-chip__bp">BP {bp.toLocaleString("en-US")}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </footer>
    </section>
  )
}
