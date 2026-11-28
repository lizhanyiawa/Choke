import type { ExpeditionPoolCard, ExpeditionSettlement } from "@choke/shared/expedition/view"
import { mapStarTier } from "@choke/shared/expedition/loot"

import { RewardChips, rewardLines } from "@/flat/ui/Rewards"

import { CardExpStrip } from "./CardExpStrip"
import { Stars } from "./Stars"

const END_TEXT: Record<ExpeditionSettlement["end"], string> = {
  cleared: "通关结算",
  early: "到此结算",
  abandoned: "已放弃",
  expired: "到期结算",
}

export function Settlement({
  result,
  mapName,
  pool,
  onDone,
}: {
  result: ExpeditionSettlement
  mapName: string | null
  pool: readonly ExpeditionPoolCard[]
  onDone: () => void
}) {
  const rewards = rewardLines(result.rewards)
  const gainedCardExp = result.rewards.cardExp ?? 0

  return (
    <div className="fl-page xp-settlement">
      <section className="fl-card xp-settlement__card" aria-labelledby="xp-settlement-title">
        <div className="xp-settlement__eyebrow">远征结束</div>
        <h1 id="xp-settlement-title" className="xp-settlement__title">
          {END_TEXT[result.end]}
        </h1>
        {mapName && <p className="xp-settlement__map">{mapName}</p>}

        <div className="xp-settlement__score">
          {result.maxStars > 0 && <Stars got={mapStarTier(result.stars, result.maxStars)} total={3} />}
          <div className="xp-settlement__meta">
            <span>
              {result.stars} / {result.maxStars} 星
            </span>
            <span>威胁 {result.tier > 0 ? `${result.tier} 档` : "未达档位"}</span>
          </div>
        </div>

        {result.objectives.length > 0 && (
          <section className="xp-settlement__section" aria-labelledby="xp-settlement-objectives">
            <h2 id="xp-settlement-objectives">通关目标</h2>
            <ul className="xp-settlement__objectives">
              {result.objectives.map((objective) => (
                <li key={objective.text} data-met={objective.met || undefined}>
                  <span aria-hidden>{objective.met ? "✓" : "—"}</span>
                  <span>{objective.text}</span>
                  <b>{objective.met ? "达成" : "未达成"}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="xp-settlement__section" aria-labelledby="xp-settlement-rewards">
          <h2 id="xp-settlement-rewards">获得奖励</h2>
          {rewards.length > 0 ? (
            <RewardChips lines={rewards} className="xp-settlement__rewards" />
          ) : (
            <p className="xp-settlement__empty">这次没有拿到奖励。</p>
          )}
          {result.viaMail && <p className="xp-settlement__mail">奖励已通过邮件发放。</p>}
        </section>

        {pool.length > 0 && gainedCardExp > 0 && (
          <section className="xp-settlement__section" aria-label="出征卡牌经验成长">
            <CardExpStrip cards={pool} gainedExp={gainedCardExp} />
          </section>
        )}

        <button type="button" className="bk-btn bk-btn--main xp-settlement__done" onClick={onDone}>
          回到远征大厅
        </button>
      </section>
    </div>
  )
}
