import { useEffect, useMemo, useState } from "react"

import { playSfx } from "@/audio/sfx"
import { applyExp, expToNext, isHeroCardId } from "@choke/shared/progression"
import type { ExpeditionPoolCard } from "@choke/shared/expedition/view"

const MAX_LEVEL_UP_ANIMATIONS = 5
const STEP_MS = 340

interface CardProgress {
  card: ExpeditionPoolCard
  beforePct: number
  afterLevel: number
  afterPct: number
  levelsGained: number
}

function pctOf(level: number, exp: number, card: ExpeditionPoolCard): number {
  const hero = isHeroCardId(card.face.id)
  const need = expToNext(level, card.face.rarity, hero)
  if (need <= 0) return 100
  return Math.max(0, Math.min(100, (exp / need) * 100))
}

function computeProgress(cards: readonly ExpeditionPoolCard[], gainedExp: number): CardProgress[] {
  return cards.map((card) => {
    const hero = isHeroCardId(card.face.id)
    const baseExp = card.exp ?? 0
    const after = applyExp(card.face.level, baseExp, gainedExp, card.face.rarity, hero)
    return {
      card,
      beforePct: pctOf(card.face.level, baseExp, card),
      afterLevel: after.level,
      afterPct: pctOf(after.level, after.exp, card),
      levelsGained: Math.max(0, after.level - card.face.level),
    }
  })
}

/**
 * 远征结算的出征卡牌经验增长条：
 * - 优先读取 ExpeditionPoolCard.exp 快照（旧记录缺省按 0 展示）；
 * - 服务端仅累加经验（玩家在卡册手动突破/升级），跨过升级线时高亮提示「可升至 Lv.Y（+N 级）」。
 */
export function CardExpStrip({
  cards,
  gainedExp,
}: {
  cards: readonly ExpeditionPoolCard[]
  gainedExp: number
}) {
  const items = useMemo(() => computeProgress(cards, gainedExp), [cards, gainedExp])
  const maxLoops = useMemo(
    () => items.reduce((max, item) => Math.max(max, Math.min(MAX_LEVEL_UP_ANIMATIONS, item.levelsGained)), 0),
    [items],
  )

  const [phase, setPhase] = useState(-1)
  const [flashKey, setFlashKey] = useState(-1)

  useEffect(() => {
    const timers: number[] = []
    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    if (reduced || gainedExp <= 0 || maxLoops === 0) {
      timers.push(window.setTimeout(() => setPhase(maxLoops), reduced ? 0 : 120))
      return () => timers.forEach((id) => window.clearTimeout(id))
    }

    for (let loop = 0; loop < maxLoops; loop += 1) {
      const at = 120 + loop * STEP_MS
      timers.push(
        window.setTimeout(() => {
          setPhase(loop)
          setFlashKey(loop)
          playSfx("levelup")
        }, at),
      )
    }
    timers.push(
      window.setTimeout(() => {
        setPhase(maxLoops)
        setFlashKey(-1)
      }, 120 + maxLoops * STEP_MS),
    )
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [gainedExp, maxLoops])

  if (items.length === 0) return null

  return (
    <div className="xp-exp-wrap">
      <div className="xp-exp-head">
        <span>出征卡牌经验成长</span>
        <b className="bk-num">每张 +{gainedExp.toLocaleString("en-US")} EXP</b>
      </div>
      <div className="xp-exp-strip">
        {items.map((item) => {
          const loops = Math.min(MAX_LEVEL_UP_ANIMATIONS, item.levelsGained)
          let width = item.beforePct
          let flashing = false

          if (loops === 0) {
            width = phase >= 0 ? item.afterPct : item.beforePct
          } else if (phase >= 0 && phase < loops) {
            width = 100
            flashing = flashKey === phase
          } else if (phase >= loops) {
            width = item.afterPct
          }

          const finished = phase >= maxLoops
          const canUpgrade = item.levelsGained > 0

          return (
            <div
              className="xp-exp-card"
              key={item.card.userCardId}
              data-levelup={flashing || (finished && canUpgrade) ? "true" : undefined}
            >
              <div className="xp-exp-card__head">
                <span className="xp-exp-card__name" title={item.card.face.name}>
                  {item.card.face.name}
                </span>
                <span className="xp-exp-card__lv bk-num">
                  Lv.{item.card.face.level}
                  {finished && canUpgrade && (
                    <span className="xp-exp-card__lvup">
                      可升至 Lv.{item.afterLevel}（+{item.levelsGained} 级）
                    </span>
                  )}
                </span>
              </div>
              <div className="xp-exp-bar" aria-label={`${item.card.face.name} 经验进度 ${Math.round(width)}%`}>
                <i style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
