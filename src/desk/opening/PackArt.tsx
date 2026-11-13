import type { CSSProperties } from "react"

import { POOL_META } from "../rarity"
import type { PackPool } from "../types"
import "./pack.css"

/**
 * 卡包：顶部一条卡池色的撕条（中间一个挂孔，撕线右端一个缺口），下面是深色包身。
 * 尺寸全部用 cqw，桌上的小包、开包时的大包、展架上的迷你包共用这一份。
 * 撕线高度见 pack.css 的 --tear，开包层按它把卡包切成上下两半。
 */
export function PackArt({ pool }: { pool: PackPool }) {
  const meta = POOL_META[pool]
  return (
    <div className="pk" data-pool={pool} style={{ "--pool": meta.color } as CSSProperties}>
      <div className="pk__strip">
        <span>CHOKE!</span>
        <span>‹ TEAR</span>
      </div>
      <i className="pk__frame" />
      <img className="pk__logo" src="/brand/choke-icon.svg" alt="" draggable={false} />
      <div className="pk__title">
        <b>{meta.short}</b>
        <span>卡包</span>
      </div>
      <div className="pk__meta">TRADING CARD · 5 CARDS</div>
      <i className="pk__sheen" />
    </div>
  )
}
