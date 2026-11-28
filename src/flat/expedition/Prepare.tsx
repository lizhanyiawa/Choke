import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { FiArrowDown, FiArrowUp, FiChevronDown, FiSearch } from "react-icons/fi"

import { JOB_ORDER, battlePower } from "@/card/data"
import { GameCardFace } from "@/card/GameCardFace"
import type { CardFaceData } from "@/card/types"
import { RARITY_COLOR } from "@/desk/lib/rarity"
import { fetchDeck, toFace, type ApiUserCard } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { FlatDialog } from "@/flat/ui/FlatDialog"
import { FlatSelect } from "@/flat/ui/FlatSelect"
import {
  BASE_AP_MAX,
  BASE_SLOTS,
  FREE_MAX_RARITY,
  GATED_RARITIES,
  MAX_SLOTS,
  UPGRADED_AP_MAX,
  allocationCost,
  cardAllowed,
  totalPoints,
  type ExpeditionAllocation,
} from "@choke/shared/expedition-points"
import { RARITIES, type Element, type Job, type Rarity } from "@choke/shared/types"
import type { ExpeditionView } from "@choke/shared/expedition/view"

import { startExpedition, type MapListing } from "./api"
import { loadAllCards } from "./cards"
import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  JOB_COLOR,
  JOB_LABEL,
  cardBattleStats,
  computeLineupHp,
} from "./metrics"
import { endsWithinHour, errorText, remainingText } from "./util"
import "./prepare.css"

/** 选稀有度权限时能点的几档：免费档，再加上要花点数的三档 */
const RARITY_STEPS: Rarity[] = [FREE_MAX_RARITY, ...GATED_RARITIES]

const LOCK_TEXT = "本次出征锁定当前卡组与卡牌状态，期间强化不会生效，参战的卡不能出售或分解。"

const rarityText = (rarity: Rarity) => (rarity === "Mythic" ? "神话" : rarity === "Prismatic" ? "棱彩" : rarity)

type SortKey = "power" | "level" | "rarity" | "hp" | "pp"

const SORT_OPTIONS: readonly (readonly [SortKey, string])[] = [
  ["power", "战力"],
  ["hp", "HP 贡献"],
  ["level", "等级"],
  ["rarity", "稀有度"],
  ["pp", "PP"],
]

const MIN_LEVEL_STEPS = [0, 10, 20, 30] as const

const RARITY_RANK: Record<Rarity, number> = Object.fromEntries(
  RARITIES.map((rarity, index) => [rarity, index]),
) as Record<Rarity, number>

interface Row {
  row: ApiUserCard
  face: CardFaceData
  power: number
  hp: number
  isHero: boolean
}

export interface PickTileProps {
  id: number
  face: CardFaceData
  power: number
  hpContribution?: number
  elements?: readonly Element[]
  /** 敌方公开弱点集合：命中时属性胶囊高亮并打勾 */
  weaknesses?: ReadonlySet<string>
  inDeck?: boolean
  /** 在已选里排第几（从 1 开始）；0 = 没选 */
  order: number
  /** 稀有度权限不够 */
  locked?: boolean
  /** 不可用原因（已上架 / 出征中）；服务端开战时会拒，编队页优先展示 */
  unavailableReason?: string
  /** 已经选满，没选的卡不能再点 */
  full?: boolean
  onToggle: (id: number) => void
}

/** 选卡格：卡面缩略图，选中描粉边并标序号，底部清晰标注 HP 贡献与战力。出征准备和战前阵容共用 */
export const PickTile = memo(function PickTile({
  id,
  face,
  power,
  hpContribution,
  elements,
  weaknesses,
  inDeck = false,
  order,
  locked = false,
  unavailableReason,
  full = false,
  onToggle,
}: PickTileProps) {
  const on = order > 0
  const disabledReason = unavailableReason ?? (locked ? "超出稀有度权限" : undefined)
  const unavailable = Boolean(unavailableReason)
  const title =
    unavailableReason === "已上架"
      ? "这张卡正在市场挂单，先下架再加入编队"
      : unavailableReason === "出征中"
        ? "这张卡正在出征中，结束出征后才能再次使用"
        : undefined
  return (
    <button
      type="button"
      className="xp-pick__tile"
      aria-pressed={on}
      aria-label={`${face.name}，${hpContribution !== undefined ? `生命 ${hpContribution}，` : ""}战力 ${power}${disabledReason ? `，${disabledReason}` : ""}`}
      disabled={(locked || unavailable || full) && !on}
      data-locked={locked || unavailable || undefined}
      data-full={(full && !on && !locked && !unavailable) || undefined}
      title={title}
      onClick={() => onToggle(id)}
    >
      <GameCardFace card={face} thumbnail />
      {on && <span className="xp-pick__order bk-num">{order}</span>}
      {inDeck && !on && <span className="xp-pick__deck-tag">卡组</span>}
      {disabledReason && <span className="xp-pick__lock">{disabledReason}</span>}
      <div className="xp-pick__meta bk-num">
        {hpContribution !== undefined && (
          <span className="xp-pick__hp">HP {hpContribution.toLocaleString("en-US")}</span>
        )}
        <span className="xp-pick__power">BP {power.toLocaleString("en-US")}</span>
      </div>
      {elements && elements.length > 0 && (
        <div className="xp-pick__els" aria-label={`技能属性：${elements.map((el) => ELEMENT_LABEL[el] ?? el).join("、")}`}>
          {elements.slice(0, 3).map((el) => {
            const matched = weaknesses?.has(el) ?? false
            return (
              <span
                key={el}
                className="xp-pick__el"
                data-matched={matched || undefined}
                title={`技能属性：${ELEMENT_LABEL[el] ?? el}${matched ? "（命中弱点）" : ""}`}
                style={{ "--c": ELEMENT_COLOR[el] ?? "var(--bk-dim)" } as CSSProperties}
              >
                <i aria-hidden />
                {ELEMENT_LABEL[el] ?? el}
                {matched && <em aria-hidden>✓</em>}
              </span>
            )
          })}
        </div>
      )}
    </button>
  )
})

/** 出征准备页：卡组套用、多维筛选排序、分配点数、实时主力基准 HP 预估与确认开始 */
export function Prepare({
  userId,
  map,
  onBack,
  onStarted,
}: {
  userId: string
  map: MapListing
  onBack: () => void
  onStarted: (view: ExpeditionView) => void
}) {
  const { progress, notify } = useFlat()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [cardsTotal, setCardsTotal] = useState<number | null>(null)
  const [cardsTruncated, setCardsTruncated] = useState(false)
  const [deckIds, setDeckIds] = useState<number[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [alloc, setAlloc] = useState<ExpeditionAllocation>({
    slots: Math.min(BASE_SLOTS, map.deckSize),
    apUpgrade: false,
    maxRarity: FREE_MAX_RARITY,
  })
  const [picked, setPicked] = useState<number[]>([])
  const [query, setQuery] = useState("")
  const [jobFilter, setJobFilter] = useState<Job | null>(null)
  const [rarityFilter, setRarityFilter] = useState<Rarity[]>([])
  const [minLevel, setMinLevel] = useState<(typeof MIN_LEVEL_STEPS)[number]>(0)
  const [onlyDeck, setOnlyDeck] = useState(false)
  const [onlyAllowed, setOnlyAllowed] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("power")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    Promise.all([
      loadAllCards(userId, ctl.signal),
      fetchDeck(userId, ctl.signal).catch(() => null),
    ])
      .then(([cards, deck]) => {
        if (ctl.signal.aborted) return
        setCardsTotal(cards.total)
        setCardsTruncated(cards.truncated)
        setRows(
          cards.rows.map((row) => {
            const face = toFace(row)
            const stats = cardBattleStats(face, row.userCardId)
            return {
              row,
              face,
              power: battlePower(face),
              hp: stats.hpContribution,
              isHero: !!face.isHero,
            }
          }),
        )
        const ids = (deck?.slots ?? [])
          .map((slot) => slot.card?.userCardId)
          .filter((id): id is number => typeof id === "number")
        setDeckIds(ids)
      })
      .catch((reason: unknown) => {
        if (!ctl.signal.aborted) setLoadError(errorText(reason))
      })
    return () => ctl.abort()
  }, [userId])

  const deckSet = useMemo(() => new Set(deckIds), [deckIds])
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.row.userCardId, r])), [rows])
  const allowedBy = (a: ExpeditionAllocation, r: Row) => cardAllowed(a, { rarity: r.row.rarity, isHero: r.isHero })
  /** 正在市场挂单或出征中的卡：服务端开战时会拒，编队页直接标出来 */
  const unavailable = (r: Row) => r.row.listed === true || r.row.locked === true

  /** 改点数分配；稀有度权限降低后，已选的卡里没权限的要拿掉 */
  const changeAlloc = (patch: Partial<ExpeditionAllocation>) => {
    const next = { ...alloc, ...patch }
    setAlloc(next)
    if (!rows) return
    setPicked((current) => {
      const kept = current.filter((id) => {
        const r = byId.get(id)
        return r !== undefined && allowedBy(next, r)
      })
      return kept.length === current.length ? current : kept
    })
  }

  const points = totalPoints(progress.level)
  const cost = allocationCost(alloc)
  const overBudget = cost > points
  const costOf = (patch: Partial<ExpeditionAllocation>) => allocationCost({ ...alloc, ...patch })
  const apMax = alloc.apUpgrade ? UPGRADED_AP_MAX : BASE_AP_MAX

  const maxSlots = Math.min(MAX_SLOTS, map.deckSize)
  const minSlots = Math.min(BASE_SLOTS, maxSlots)
  const slotChoices = Array.from({ length: maxSlots - minSlots + 1 }, (_, i) => minSlots + i)

  const rarityCounts = useMemo(() => {
    const counts = new Map<Rarity, number>()
    for (const r of rows ?? []) counts.set(r.row.rarity, (counts.get(r.row.rarity) ?? 0) + 1)
    return counts
  }, [rows])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (rows ?? []).filter(
      (r) =>
        (!q || r.row.name.toLowerCase().includes(q)) &&
        (!jobFilter || r.row.job === jobFilter) &&
        (rarityFilter.length === 0 || rarityFilter.includes(r.row.rarity)) &&
        (minLevel === 0 || r.row.level >= minLevel) &&
        (!onlyDeck || deckSet.has(r.row.userCardId)) &&
        (!onlyAllowed || (cardAllowed(alloc, { rarity: r.row.rarity, isHero: r.isHero }) && !unavailable(r))),
    )
    const dir = sortDir === "desc" ? -1 : 1
    return [...filtered].sort((a, b) => {
      let diff = 0
      switch (sortKey) {
        case "power":
          diff = a.power - b.power
          break
        case "hp":
          diff = a.hp - b.hp
          break
        case "level":
          diff = a.row.level - b.row.level
          break
        case "rarity":
          diff = RARITY_RANK[a.row.rarity] - RARITY_RANK[b.row.rarity]
          break
        case "pp":
          diff = Number(a.row.pp ?? 0) - Number(b.row.pp ?? 0)
          break
      }
      if (diff !== 0) return diff * dir
      return b.power - a.power || a.row.userCardId - b.row.userCardId
    })
  }, [rows, query, jobFilter, rarityFilter, minLevel, onlyDeck, deckSet, onlyAllowed, alloc, sortKey, sortDir])

  const order = useMemo(() => new Map(picked.map((id, i) => [id, i + 1])), [picked])

  // 实时计算预计主力基准 HP（按已选卡中战力前 alloc.slots 张计算）与已选总战力
  const previewMetrics = useMemo(() => {
    const pickedRows = picked
      .map((id) => byId.get(id))
      .filter((r): r is Row => r !== undefined)
    const totalPower = pickedRows.reduce((sum, r) => sum + r.power, 0)
    const mainFaces = [...pickedRows]
      .sort((a, b) => b.power - a.power || a.row.userCardId - b.row.userCardId)
      .slice(0, alloc.slots)
      .map((r) => r.face)
    const { max: baseHp } = computeLineupHp(mainFaces, 1)
    return {
      totalPower,
      baseHp,
      mainCount: mainFaces.length,
    }
  }, [alloc.slots, byId, picked])

  const toggle = useCallback(
    (id: number) => {
      const row = byId.get(id)
      if (row && (row.row.listed === true || row.row.locked === true)) {
        notify(
          row.row.listed
            ? "这张卡正在市场挂单，先下架再加入编队"
            : "这张卡正在出征中，结束出征后才能再次使用",
          "info",
        )
        return
      }
      setPicked((current) => {
        if (current.includes(id)) return current.filter((x) => x !== id)
        if (current.length >= map.deckSize) return current
        return [...current, id]
      })
    },
    [byId, map.deckSize, notify],
  )

  const autoPick = () => {
    const best = [...(rows ?? [])]
      .filter((r) => allowedBy(alloc, r) && !unavailable(r))
      .sort((a, b) => b.power - a.power || a.row.userCardId - b.row.userCardId)
      .slice(0, map.deckSize)
    setPicked(best.map((r) => r.row.userCardId))
  }

  const applyCurrentDeck = () => {
    if (!rows || deckIds.length === 0) return
    const valid: number[] = []
    let skippedByRarity = 0
    let skippedByBusy = 0
    for (const id of deckIds) {
      if (valid.length >= map.deckSize) break
      const row = byId.get(id)
      if (!row) continue
      if (unavailable(row)) {
        skippedByBusy += 1
        continue
      }
      if (!allowedBy(alloc, row)) {
        skippedByRarity += 1
        continue
      }
      if (!valid.includes(id)) valid.push(id)
    }
    setPicked(valid)
    if (valid.length === 0) {
      const reasons: string[] = []
      if (skippedByRarity > 0) reasons.push(`${skippedByRarity} 张超出稀有度权限`)
      if (skippedByBusy > 0) reasons.push(`${skippedByBusy} 张已上架或出征中`)
      notify(
        reasons.length > 0
          ? `当前卡组暂无法带入（${reasons.join("、")}），请调整配置或手动选卡`
          : "当前卡组中的卡牌暂无法带入，请手动选卡",
        "info",
      )
    } else if (skippedByRarity > 0 || skippedByBusy > 0 || valid.length < map.deckSize) {
      const reasons: string[] = []
      if (skippedByRarity > 0) reasons.push(`跳过 ${skippedByRarity} 张超稀有度权限卡牌`)
      if (skippedByBusy > 0) reasons.push(`${skippedByBusy} 张已上架或出征中`)
      if (valid.length < map.deckSize) reasons.push(`还差 ${map.deckSize - valid.length} 张可继续补选`)
      notify(`已套用卡组 ${valid.length} 张（${reasons.join("，")}）`, "info")
    } else {
      notify(`已套用当前卡组 ${valid.length} 张`, "success")
    }
  }
  const toggleRarity = (rarity: Rarity) =>
    setRarityFilter((current) => (current.includes(rarity) ? current.filter((x) => x !== rarity) : [...current, rarity]))

  const full = picked.length === map.deckSize
  const canStart = full && !overBudget && map.startable && !busy
  const startLabel = full ? "开始出征" : `还差 ${map.deckSize - picked.length} 张`
  const nearEnd = endsWithinHour(map.endsAt)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const view = await startExpedition(userId, { mapId: map.id, cardIds: picked, allocation: alloc })
      onStarted(view)
    } catch (reason) {
      const text = errorText(reason)
      setError(text)
      notify(text, "error")
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  const meterTone = overBudget ? "low" : cost / Math.max(1, points) >= 0.85 ? "mid" : undefined
  const pointPct = Math.min(100, (cost / Math.max(1, points)) * 100)

  return (
    <div className="fl-page xp-prep">
      <header className="xp-prep__head">
        <button type="button" className="xp-prep__back" onClick={onBack}>
          ‹ 返回远征大厅
        </button>
        <h1 className="fl-page__title">{map.name}</h1>
        <p className="bk-note">先分配点数，再选出要带的 {map.deckSize} 张卡。战斗时从这些卡里挑上场的卡。</p>
      </header>

      {loadError && (
        <p className="bk-error" role="alert">
          {loadError}
        </p>
      )}

      <div className="xp-prep__layout">
        <section className="xp-prep__pool" aria-label="卡池">
          <div className="xp-prep__tools">
            <label className="xp-prep__search">
              <FiSearch aria-hidden />
              <input
                className="bk-input"
                type="search"
                aria-label="按名字找卡"
                placeholder="按名字找卡"
                maxLength={64}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="xp-prep__actions">
              <button
                type="button"
                className="bk-btn bk-btn--sm"
                onClick={applyCurrentDeck}
                disabled={!rows || deckIds.length === 0}
                title={deckIds.length === 0 ? "当前尚未配置卡组" : `套用当前卡组（${deckIds.length} 张）`}
              >
                套用当前卡组
              </button>
              <button type="button" className="bk-btn bk-btn--sm" onClick={autoPick} disabled={!rows}>
                自动选最强
              </button>
              <button
                type="button"
                className="bk-btn bk-btn--sm bk-btn--ghost"
                onClick={() => setPicked([])}
                disabled={picked.length === 0}
              >
                清空
              </button>
              <div className="xp-prep__sort">
                <FlatSelect label="排序方式" value={sortKey} options={SORT_OPTIONS} onChange={setSortKey} />
                <button
                  type="button"
                  className="bk-btn bk-btn--sm bk-btn--ghost xp-prep__dir"
                  aria-label={sortDir === "desc" ? "当前降序，切换为升序" : "当前升序，切换为降序"}
                  title={sortDir === "desc" ? "降序" : "升序"}
                  onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                >
                  {sortDir === "desc" ? <FiArrowDown aria-hidden /> : <FiArrowUp aria-hidden />}
                </button>
              </div>
              <span className="xp-prep__count" aria-live="polite">
                已选 <b className="bk-num">{picked.length} / {map.deckSize}</b>
              </span>
            </div>
          </div>

          <div className="xp-prep__filters">
            <div className="bk-chips" role="group" aria-label="按职业筛选">
              <button
                type="button"
                className="bk-chip"
                aria-pressed={jobFilter === null}
                onClick={() => setJobFilter(null)}
              >
                全部职业
              </button>
              {JOB_ORDER.map((job) => (
                <button
                  key={job}
                  type="button"
                  className="bk-chip"
                  aria-pressed={jobFilter === job}
                  onClick={() => setJobFilter((cur) => (cur === job ? null : job))}
                >
                  <i style={{ "--c": JOB_COLOR[job] } as CSSProperties} aria-hidden />
                  {JOB_LABEL[job]}
                </button>
              ))}
            </div>

            <div className="bk-chips" role="group" aria-label="按稀有度与条件筛选">
              {RARITIES.filter((r) => rarityCounts.has(r)).map((r) => (
                <button
                  key={r}
                  type="button"
                  className="bk-chip"
                  aria-pressed={rarityFilter.includes(r)}
                  onClick={() => toggleRarity(r)}
                >
                  <i style={{ "--c": RARITY_COLOR[r] } as CSSProperties} aria-hidden />
                  {rarityText(r)}
                  <small>{rarityCounts.get(r)}</small>
                </button>
              ))}
              {MIN_LEVEL_STEPS.map((lv) => (
                <button
                  key={lv}
                  type="button"
                  className="bk-chip"
                  aria-pressed={minLevel === lv}
                  onClick={() => setMinLevel(lv)}
                >
                  {lv === 0 ? "不限等级" : `Lv.≥${lv}`}
                </button>
              ))}
              {deckIds.length > 0 && (
                <button
                  type="button"
                  className="bk-chip"
                  aria-pressed={onlyDeck}
                  onClick={() => setOnlyDeck((v) => !v)}
                >
                  仅看卡组
                </button>
              )}
              <button
                type="button"
                className="bk-chip"
                aria-pressed={onlyAllowed}
                onClick={() => setOnlyAllowed((v) => !v)}
              >
                仅看可带
              </button>
            </div>
          </div>

          {!rows && !loadError && (
            <div className="xp-pick" aria-busy="true" aria-label="正在读取你的卡">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="xp-pick__skel" />
              ))}
            </div>
          )}
          {rows && rows.length === 0 && <div className="bk-empty">你还没有卡，先去开包。</div>}
          {rows && rows.length > 0 && shown.length === 0 && <div className="bk-empty">没有符合条件的卡。</div>}
          {cardsTruncated && (
            <p className="bk-note">
              卡太多，只加载了前 {rows?.length ?? 0} 张（共 {cardsTotal ?? "?"} 张），筛选和自动编队可能不完整。
            </p>
          )}
          {shown.length > 0 && (
            <div className="xp-pick" data-no-light>
              {shown.map((r) => {
                const id = r.row.userCardId
                const unavailableReason = r.row.listed ? "已上架" : r.row.locked ? "出征中" : undefined
                return (
                  <PickTile
                    key={id}
                    id={id}
                    face={r.face}
                    power={r.power}
                    hpContribution={r.hp}
                    inDeck={deckSet.has(id)}
                    order={order.get(id) ?? 0}
                    locked={!allowedBy(alloc, r)}
                    unavailableReason={unavailableReason}
                    full={picked.length >= map.deckSize}
                    onToggle={toggle}
                  />
                )
              })}
            </div>
          )}
        </section>

        <aside className="fl-card xp-prep__side" data-open={open} aria-label="出征配置">
          <button
            type="button"
            className="xp-prep__fold"
            aria-expanded={open}
            aria-controls="xp-prep-config"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="xp-prep__fold-main">
              <b>出征配置</b>
              <small className={overBudget ? "xp-danger" : undefined}>
                点数 {cost}/{points} · 上场 {alloc.slots} · AP {apMax} · 基准 HP {previewMetrics.baseHp.toLocaleString("en-US")}
              </small>
            </span>
            <FiChevronDown aria-hidden />
          </button>
          <h2 className="fl-card__title xp-prep__side-title">出征配置</h2>

          <div id="xp-prep-config" className="xp-prep__config">
            <div className="xp-prep__budget">
              <div className="xp-prep__budget-line">
                <span>点数</span>
                <b className={`bk-num${overBudget ? " xp-danger" : ""}`}>
                  {cost} / {points}
                </b>
              </div>
              <div
                className="xp-meter"
                style={{ "--p": pointPct } as CSSProperties}
                data-tone={meterTone}
                role="progressbar"
                aria-label="点数花费"
                aria-valuemin={0}
                aria-valuemax={points}
                aria-valuenow={cost}
              />
              {overBudget && (
                <p className="xp-danger" role="alert">
                  点数不够：需要 {cost}，现有 {points}。
                </p>
              )}
            </div>

            {/* 实时预计主力基准 HP 与总战力预览 */}
            <div className="xp-prep__preview">
              <div className="xp-prep__preview-row">
                <span>预计主力基准 HP（前 {alloc.slots} 槽）</span>
                <b className="bk-num xp-prep__preview-hp">
                  {previewMetrics.mainCount > 0 ? `${previewMetrics.baseHp.toLocaleString("en-US")} HP` : "—"}
                </b>
              </div>
              <div className="xp-prep__preview-row">
                <span>已选卡池总战力</span>
                <b className="bk-num">{previewMetrics.totalPower.toLocaleString("en-US")} BP</b>
              </div>
            </div>

            <div className="xp-prep__field" role="group" aria-labelledby="xp-f-slots">
              <span id="xp-f-slots">上场卡槽</span>
              <div className="bk-seg xp-prep__seg">
                {slotChoices.map((n) => {
                  const c = costOf({ slots: n })
                  return (
                    <button key={n} type="button" aria-pressed={alloc.slots === n} onClick={() => changeAlloc({ slots: n })}>
                      {n} 张
                      <small data-over={c > points || undefined}>{c} 点</small>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="xp-prep__field" role="group" aria-labelledby="xp-f-ap">
              <span id="xp-f-ap">AP 上限</span>
              <div className="bk-seg xp-prep__seg">
                {[false, true].map((up) => {
                  const c = costOf({ apUpgrade: up })
                  return (
                    <button key={String(up)} type="button" aria-pressed={alloc.apUpgrade === up} onClick={() => changeAlloc({ apUpgrade: up })}>
                      {up ? UPGRADED_AP_MAX : BASE_AP_MAX}
                      <small data-over={c > points || undefined}>{c} 点</small>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="xp-prep__field" role="group" aria-labelledby="xp-f-rarity">
              <span id="xp-f-rarity">能带的最高稀有度</span>
              <div className="bk-seg xp-prep__seg">
                {RARITY_STEPS.map((r) => {
                  const c = costOf({ maxRarity: r })
                  return (
                    <button key={r} type="button" aria-pressed={alloc.maxRarity === r} onClick={() => changeAlloc({ maxRarity: r })}>
                      {rarityText(r)}
                      <small data-over={c > points || undefined}>{c} 点</small>
                    </button>
                  )
                })}
              </div>
              <p className="bk-note">每个选项下面的数字，是选它之后总共要花的点数。本体卡不受稀有度限制。</p>
            </div>

            <div className="xp-prep__facts">
              <div className="xp-stat">
                <span>本期剩余</span>
                <b>{remainingText(map.endsAt)}</b>
              </div>
              <div className="xp-stat">
                <span>AP 上限</span>
                <b className="bk-num">{apMax}</b>
              </div>
            </div>

            <div className="xp-prep__team">
              <div className="xp-prep__budget-line">
                <span>带的卡</span>
                <b className="bk-num">
                  {picked.length} / {map.deckSize}
                </b>
              </div>
              <div className="xp-prep__strip" data-no-light>
                {Array.from({ length: map.deckSize }, (_, i) => {
                  const id = picked[i]
                  const r = id === undefined ? undefined : byId.get(id)
                  return r ? (
                    <button
                      key={id}
                      type="button"
                      className="xp-prep__mini"
                      aria-label={`${r.face.name}，点一下取消`}
                      onClick={() => toggle(id)}
                    >
                      <GameCardFace card={r.face} thumbnail />
                    </button>
                  ) : (
                    <div key={`empty-${i}`} className="bk-slot xp-prep__mini-slot" aria-hidden />
                  )
                })}
              </div>
            </div>

            {nearEnd && <p className="xp-prep__warn">离这一期结束不足 1 小时，来不及打完的话，到期会自动结算。</p>}
            {!map.startable && map.lockedReason && <p className="xp-danger">{map.lockedReason}</p>}
            {error && (
              <p className="bk-error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="bk-btn bk-btn--main bk-btn--block xp-prep__go" disabled={!canStart} onClick={() => setConfirming(true)}>
              {startLabel}
            </button>
          </div>
        </aside>
      </div>

      <div className="xp-prep__bar">
        <div className="xp-prep__bar-info">
          <span>已选</span>
          <b className="bk-num">
            {picked.length} / {map.deckSize}
          </b>
          {(overBudget || error) && <small className="xp-danger">{overBudget ? "点数不够" : "出征失败"}</small>}
        </div>
        <button type="button" className="bk-btn bk-btn--main" disabled={!canStart} onClick={() => setConfirming(true)}>
          {startLabel}
        </button>
      </div>

      {confirming && (
        <FlatDialog title="确认出征？" onClose={() => setConfirming(false)} busy={busy}>
          <p className="bk-note">{LOCK_TEXT}</p>
          <dl className="xp-prep__confirm">
            <div>
              <dt>地图</dt>
              <dd>{map.name}</dd>
            </div>
            <div>
              <dt>带卡</dt>
              <dd>
                {picked.length} 张（上场 {alloc.slots} 槽 · 预计主力基准 {previewMetrics.baseHp.toLocaleString("en-US")} HP）
              </dd>
            </div>
            <div>
              <dt>点数</dt>
              <dd>
                {cost} / {points}
              </dd>
            </div>
          </dl>
          {nearEnd && <p className="xp-prep__warn">离这一期结束不足 1 小时，到期没打完会自动结算，奖励通过邮件发放。</p>}
          <div className="xp-dialog-actions">
            <button type="button" className="bk-btn" onClick={() => setConfirming(false)} disabled={busy}>
              再想想
            </button>
            <button type="button" className="bk-btn bk-btn--main" onClick={start} disabled={busy}>
              {busy ? "出发中……" : "确认出征"}
            </button>
          </div>
        </FlatDialog>
      )}
    </div>
  )
}
