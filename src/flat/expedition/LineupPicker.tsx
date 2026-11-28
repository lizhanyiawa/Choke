import { useCallback, useMemo, useState, type CSSProperties } from "react"

import { battlePower } from "@/card/data"
import { GameCardFace } from "@/card/GameCardFace"
import { describeStar } from "@choke/shared/battle/stars"
import { recommendText } from "@choke/shared/lineup"
import type { ExpeditionView } from "@choke/shared/expedition/view"

import { submitLineup } from "./api"
import { titleOf } from "./layout"
import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  cardBattleStats,
  cardElementsOf,
  computeLineupHp,
  enemyTierLabel,
  formatMult,
  hpTone,
} from "./metrics"
import { PickTile } from "./Prepare"
import { errorText } from "./util"
import "./prepare.css"

const elementName = (element: string) => ELEMENT_LABEL[element] ?? element

function ElementChip({ element, matched = false }: { element: string; matched?: boolean }) {
  return (
    <span className="xp-line__el" data-matched={matched || undefined}>
      <i style={{ "--c": ELEMENT_COLOR[element] ?? "var(--bk-dim)" } as CSSProperties} aria-hidden />
      {elementName(element)}
      {matched && <em aria-hidden>✓</em>}
    </span>
  )
}

/** 战前选阵：VS 对峙情报双卡（我方实时真实 HP + 弱点覆盖 vs 敌方缩放后真实 HP）+ 上场槽位单卡 HP 贡献 */
export function LineupPicker({
  userId,
  view,
  onView,
  onBack,
}: {
  userId: string
  view: ExpeditionView
  onView: (view: ExpeditionView) => void
  onBack: () => void
}) {
  const battle = view.battle!
  const slots = view.allocation.slots
  const rows = useMemo(
    () =>
      view.pool
        .map((entry) => {
          const stats = cardBattleStats(entry.face, entry.userCardId)
          return {
            id: entry.userCardId,
            face: entry.face,
            power: battlePower(entry.face),
            hp: stats.hpContribution,
            elements: cardElementsOf(entry.face),
          }
        })
        .sort((a, b) => b.power - a.power || a.id - b.id),
    [view.pool],
  )

  const [picked, setPicked] = useState<number[]>(() => rows.slice(0, slots).map((r) => r.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const node = view.map.nodes[view.position]
  const { enemy, stars, summary } = battle.encounter
  const left = slots - picked.length
  const order = useMemo(() => new Map(picked.map((id, i) => [id, i + 1])), [picked])
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  const pickedRows = useMemo(
    () => picked.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => r !== undefined),
    [byId, picked],
  )

  // 实时随选阵重算开场精确 HP（与进入 Fight 后 battle/types.ts 的 calcTeamHpMax 逐位一致）
  const teamHp = useMemo(
    () =>
      computeLineupHp(
        pickedRows.map((r) => r.face),
        battle.hpRatioStart,
      ),
    [battle.hpRatioStart, pickedRows],
  )
  const teamPower = useMemo(() => pickedRows.reduce((sum, r) => sum + r.power, 0), [pickedRows])
  const tone = hpTone(teamHp.pct)

  // 实时弱点覆盖检查
  const weaknessSet = useMemo(() => new Set<string>(enemy.weaknesses), [enemy.weaknesses])
  const teamElements = useMemo(() => {
    const set = new Set<string>()
    for (const r of pickedRows) {
      for (const el of r.elements) set.add(el)
    }
    return set
  }, [pickedRows])
  const coveredWeaknesses = useMemo(
    () => enemy.weaknesses.filter((el) => teamElements.has(el)),
    [enemy.weaknesses, teamElements],
  )

  const benchCount = Math.max(0, rows.length - picked.length)
  const goLabel =
    left > 0
      ? `还差 ${left} 张`
      : `进入战斗（${teamHp.current.toLocaleString("en-US")} / ${teamHp.max.toLocaleString("en-US")} HP）`

  const toggle = useCallback(
    (id: number) =>
      setPicked((current) => {
        if (current.includes(id)) return current.filter((x) => x !== id)
        return current.length >= slots ? current : [...current, id]
      }),
    [slots],
  )

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      onView(await submitLineup(userId, picked))
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const hpMult = view.difficulty.hpMult

  return (
    <div className="fl-page xp-prep xp-line">
      <header className="xp-prep__head">
        <button type="button" className="xp-prep__back" onClick={onBack}>
          ‹ 回地图
        </button>
        <h1 className="fl-page__title">{node ? titleOf(node) : "战前选阵"}</h1>
        <p className="bk-note">
          从 {rows.length} 张出征卡中选 {slots} 张上场，余下 {benchCount} 张自动进入替补席。
        </p>
      </header>

      {/* 顶部 VS 对峙情报双卡 */}
      <section className="xp-line__vs" aria-label="敌我开场对峙情报">
        <div className="fl-card xp-line__side xp-line__side--ally">
          <div className="xp-line__side-head">
            <span className="xp-line__side-eyebrow">我方开场状态 · 随选阵实时重算</span>
            <span className="xp-line__side-badge bk-num">AP 上限 {battle.apMax}</span>
          </div>
          <div className="xp-line__hp-hero">
            <strong className="bk-num">
              {pickedRows.length > 0
                ? `${teamHp.current.toLocaleString("en-US")} / ${teamHp.max.toLocaleString("en-US")} HP`
                : "请先选择上场卡牌"}
            </strong>
            <span className="bk-num">{teamHp.pct}%</span>
          </div>
          <div
            className="xp-meter"
            style={{ "--p": teamHp.pct } as CSSProperties}
            data-tone={tone}
            role="progressbar"
            aria-label="我方开场生命"
            aria-valuemin={0}
            aria-valuemax={teamHp.max || 100}
            aria-valuenow={teamHp.current}
          />
          <div className="xp-line__ally-stats">
            <span>
              上场战力 <b className="bk-num">{teamPower.toLocaleString("en-US")} BP</b>
            </span>
            <span>
              威胁档位 <b className="bk-num">{view.difficulty.tier} 档</b>
            </span>
          </div>
          <div
            className="xp-line__coverage"
            data-state={
              enemy.weaknesses.length === 0
                ? "none"
                : coveredWeaknesses.length > 0
                  ? "hit"
                  : "miss"
            }
          >
            {enemy.weaknesses.length === 0 ? (
              <span>对手无公开弱点，可按职业与爆发自由编队。</span>
            ) : coveredWeaknesses.length > 0 ? (
              <span>
                ✓ 已覆盖敌方弱点：{coveredWeaknesses.map((el) => elementName(el)).join("、")}
              </span>
            ) : (
              <span>
                尚未携带敌方公开弱点（{enemy.weaknesses.map((el) => elementName(el)).join(" / ")}）
              </span>
            )}
          </div>
        </div>

        <div className="fl-card xp-line__side xp-line__side--foe">
          <div className="xp-line__side-head">
            <div className="xp-line__foe-title">
              <h2>{enemy.name}</h2>
              {enemy.title && <span className="bk-note">{enemy.title}</span>}
            </div>
            <span className="xp-line__tier" data-tier={enemy.tier}>
              {enemyTierLabel(enemy.tier)}
            </span>
          </div>
          <div className="xp-line__foe-hero">
            <strong className="bk-num xp-line__hp">
              {enemy.stats.hp.toLocaleString("en-US")} HP
            </strong>
            {hpMult > 1 && <span className="xp-line__mult bk-num">威胁 {formatMult(hpMult)}</span>}
            <ElementChip element={enemy.element} />
          </div>
          <div className="xp-line__weak">
            <span className="xp-line__weak-label">公开弱点</span>
            {enemy.weaknesses.length > 0 ? (
              enemy.weaknesses.map((el) => (
                <ElementChip key={el} element={el} matched={teamElements.has(el)} />
              ))
            ) : (
              <span className="bk-note">无</span>
            )}
            {enemy.hiddenWeaknesses.length > 0 && (
              <span className="xp-line__hidden">另有 {enemy.hiddenWeaknesses.length} 个隐藏弱点</span>
            )}
          </div>
          {summary && <p className="xp-line__summary">{summary}</p>}
          <p className="xp-line__rec">
            <b>推荐：</b>
            {recommendText(battle.encounter.recommend)}
          </p>
          {stars.length > 0 && (
            <ul className="xp-line__stars">
              {stars.map((cond, i) => {
                const { title, target } = describeStar(cond)
                return (
                  <li key={`${cond.type}-${i}`}>
                    <span className="xp-line__star-no" aria-hidden>
                      ★{i + 1}
                    </span>
                    <b>{title}</b>
                    <span>{target}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* 上场槽位与出征卡池 */}
      <section className="fl-card xp-line__team" aria-label="上场阵容">
        <div className="fl-card__head">
          <h2 className="fl-card__title">上场槽位</h2>
          <span className="xp-prep__count" aria-live="polite">
            已选 <b className="bk-num">{picked.length} / {slots}</b> · 替补{" "}
            <b className="bk-num">{benchCount}</b> 张
          </span>
        </div>
        <div className="xp-line__slots" style={{ "--n": slots } as CSSProperties} data-no-light>
          {Array.from({ length: slots }, (_, i) => {
            const id = picked[i]
            const r = id === undefined ? undefined : byId.get(id)
            return r ? (
              <div className="xp-line__slot-wrap" key={id}>
                <button
                  type="button"
                  className="xp-prep__mini xp-line__slot"
                  aria-label={`第 ${i + 1} 槽 ${r.face.name}，点一下取消`}
                  onClick={() => toggle(id)}
                >
                  <GameCardFace card={r.face} thumbnail />
                  <span className="xp-pick__order bk-num">{i + 1}</span>
                </button>
                <span className="xp-line__slot-hp bk-num">+{r.hp.toLocaleString("en-US")} HP</span>
              </div>
            ) : (
              <div className="xp-line__slot-wrap" key={`empty-${i}`}>
                <div className="bk-slot xp-line__slot" aria-label={`第 ${i + 1} 槽，空`}>
                  {i + 1}
                </div>
                <span className="xp-line__slot-hp is-empty">空槽位</span>
              </div>
            )
          })}
        </div>

        {error && (
          <p className="bk-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="bk-btn bk-btn--main bk-btn--block xp-prep__go"
          disabled={busy || left > 0}
          onClick={go}
        >
          {busy ? "出战中……" : goLabel}
        </button>
      </section>

      <section className="xp-prep__pool" aria-label="出征卡池">
        <div className="xp-prep__tools">
          <div className="xp-prep__actions">
            <button
              type="button"
              className="bk-btn bk-btn--sm"
              onClick={() => setPicked(rows.slice(0, slots).map((r) => r.id))}
            >
              自动选最强
            </button>
            <button
              type="button"
              className="bk-btn bk-btn--sm bk-btn--ghost"
              disabled={picked.length === 0}
              onClick={() => setPicked([])}
            >
              清空
            </button>
          </div>
          <span className="bk-note">点卡上阵，顺序即槽位顺序，余下 {benchCount} 张自动进入替补席</span>
        </div>
        <div className="xp-pick" data-no-light>
          {rows.map((r) => (
            <PickTile
              key={r.id}
              id={r.id}
              face={r.face}
              power={r.power}
              hpContribution={r.hp}
              elements={r.elements}
              weaknesses={weaknessSet}
              order={order.get(r.id) ?? 0}
              full={picked.length >= slots}
              onToggle={toggle}
            />
          ))}
        </div>
      </section>

      <div className="xp-prep__bar">
        <div className="xp-prep__bar-info">
          <span>开场 HP</span>
          <b className="bk-num">
            {teamHp.current.toLocaleString("en-US")}/{teamHp.max.toLocaleString("en-US")}
          </b>
          {error && <small className="xp-danger">出战失败</small>}
        </div>
        <button type="button" className="bk-btn bk-btn--main" disabled={busy || left > 0} onClick={go}>
          {busy ? "出战中……" : left > 0 ? `还差 ${left} 张` : "进入战斗"}
        </button>
      </div>
    </div>
  )
}
