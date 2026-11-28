import { battlePower, ELEMENT_COLOR, ELEMENT_LABEL, JOB_COLOR, JOB_LABEL } from "@/card/data"
import { createBattleCard, calcTeamHpMax, type BattleStats } from "@choke/shared/battle/types"
import type { ExpeditionPoolCard, ExpeditionView } from "@choke/shared/expedition/view"
import type { CardFaceData, Element } from "@choke/shared/types"

export { ELEMENT_COLOR, ELEMENT_LABEL, JOB_COLOR, JOB_LABEL }

/** 队伍血量条的颜色档：低于 45% 红、低于 70% 黄 */
export function hpTone(pct: number): "low" | "mid" | undefined {
  return pct < 45 ? "low" : pct < 70 ? "mid" : undefined
}

/** 复用战斗共享层计算单卡精确属性（含本体卡 heroLevelFactor 与被动命中加成）。 */
export function cardBattleStats(face: CardFaceData, uid = 0): BattleStats {
  return createBattleCard(face, uid, face.id).stats
}

/** 复用 calcTeamHpMax 计算给定上场阵容在 hpRatio 下的实时当前/最大 HP。 */
export function computeLineupHp(
  faces: readonly CardFaceData[],
  hpRatio: number,
): { current: number; max: number; pct: number } {
  const pct = Math.round(Math.max(0, Math.min(1, hpRatio)) * 100)
  if (faces.length === 0) return { current: 0, max: 0, pct }
  const cards = faces.map((face, index) => createBattleCard(face, index + 1, face.id))
  const max = calcTeamHpMax(cards)
  const clamped = Math.max(0, Math.min(1, hpRatio))
  const current = clamped > 0 ? Math.max(1, Math.min(max, Math.round(max * clamped))) : 0
  return { current, max, pct }
}

/**
 * 确定用于显示队伍血量基准的主力阵容：
 * - 若当前处于已选阵的战斗，直接按 view.battle.lineup 顺序映射；
 * - 否则按战力降序取卡池前 view.allocation.slots 张作为主力基准。
 */
export function baselineLineupOf(view: ExpeditionView): ExpeditionPoolCard[] {
  if (view.battle && view.battle.lineup.length > 0) {
    const byId = new Map(view.pool.map((entry) => [entry.userCardId, entry]))
    const active = view.battle.lineup
      .map((id) => byId.get(id))
      .filter((entry): entry is ExpeditionPoolCard => entry !== undefined)
    if (active.length > 0) return active
  }
  const slots = Math.max(1, view.allocation.slots)
  return [...view.pool]
    .sort((a, b) => battlePower(b.face) - battlePower(a.face) || a.userCardId - b.userCardId)
    .slice(0, slots)
}

/** 计算进行中远征的实时队伍血量（用于大厅横幅、首页远征卡与推进顶部 HUD）。 */
export function computeRunHp(view: ExpeditionView): {
  current: number
  max: number
  pct: number
  slotCount: number
  fromActiveBattle: boolean
} {
  const fromActiveBattle = Boolean(view.battle && view.battle.lineup.length > 0)
  const lineup = baselineLineupOf(view)
  const { current, max, pct } = computeLineupHp(
    lineup.map((entry) => entry.face),
    view.hpRatio,
  )
  return {
    current,
    max,
    pct,
    slotCount: lineup.length,
    fromActiveBattle,
  }
}

/** 从卡面主动/触发攻击技能中去重收集元素（用于战前选阵弱点覆盖提示）。 */
export function cardElementsOf(face: CardFaceData): Element[] {
  const seen = new Set<Element>()
  const result: Element[] = []
  for (const skill of face.skills) {
    if (!skill.element || skill.passive) continue
    if (seen.has(skill.element)) continue
    seen.add(skill.element)
    result.push(skill.element)
  }
  return result
}

/** 敌方阶位中文名 */
export const ENEMY_TIER_LABEL: Record<string, string> = {
  normal: "普通",
  elite: "精英",
  boss: "首领",
}

export function enemyTierLabel(tier: string): string {
  return ENEMY_TIER_LABEL[tier] ?? tier
}

/** 倍率格式化：整数显示 ×1 / ×2，小数去尾零 */
export function formatMult(mult: number): string {
  const rounded = Math.round(mult * 100) / 100
  return `×${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, "")}`
}
