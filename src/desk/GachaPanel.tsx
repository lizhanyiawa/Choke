import type { CSSProperties } from "react"

import { Pages } from "./BookPages"
import { PackArt } from "./opening/PackArt"
import { POOL_META, POOL_ORDER, RARITY_COLOR, SERVER_POOL } from "./rarity"
import type { PackPool } from "./types"
import "./gacha-panel.css"

interface Props {
  userId: string | null
  pool: PackPool
  packCounts?: Record<string, number>
  onPool: (pool: PackPool) => void
  onLogin: () => void
}

export function GachaPanel({ userId, pool, packCounts, onPool, onLogin }: Props) {
  const current = POOL_META[pool]
  const odds = current.weights.filter(([, weight]) => weight > 0)

  return (
    <Pages
      left={
        <div className="bk-list" role="group" aria-label="卡池选择">
          {POOL_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`bk-row gacha-pool ${pool === id ? "is-on" : ""}`}
              aria-pressed={pool === id}
              onClick={() => onPool(id)}
            >
              <span className="gacha-pool__art" aria-hidden><PackArt pool={id} /></span>
              <span className="gacha-pool__text"><b>{POOL_META[id].short}</b></span>
              {packCounts && <em className="bk-num">×{packCounts[SERVER_POOL[id]] ?? 0}</em>}
            </button>
          ))}
        </div>
      }
      right={
        <>
          <div className="gacha-current">
            <span className="gacha-current__art" aria-hidden><PackArt pool={pool} /></span>
            <div className="gacha-current__text">
              <b className="gacha-current__name">{current.label}</b>
              <p className="bk-note">每包 5 张</p>
            </div>
          </div>
          <div className="gacha-odds" aria-label="概率">
            {odds.map(([rarity, weight]) => (
              <span key={rarity} style={{ "--c": RARITY_COLOR[rarity] } as CSSProperties}>
                <i aria-hidden />
                {rarity}
                <b className="bk-num">{weight}%</b>
              </span>
            ))}
          </div>
          {!userId && (
            <button type="button" className="bk-btn bk-btn--main bk-btn--block" onClick={onLogin}>登录</button>
          )}
        </>
      }
    />
  )
}
