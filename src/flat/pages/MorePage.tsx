import { useFlat } from "@/flat/context"
import { NavEntry, useBadges } from "@/flat/Nav"
import { MORE_ITEMS } from "@/flat/nav-items"
import { featureLockHint } from "@/tutorial/unlocks"

import "./more.css"

/** 「更多」：窄屏底部标签放不下的入口都在这里；宽屏从地址也能进来 */
export function MorePage() {
  const { progress } = useFlat()
  const badges = useBadges()
  return (
    <div className="fl-page more-page">
      <div className="fl-page__head">
        <h1 className="fl-page__title">更多</h1>
      </div>
      <div className="more-grid">
        {MORE_ITEMS.map((item) => {
          const badge = badges[item.id]
          const lock = item.feature ? featureLockHint(item.feature, progress) : null
          return (
            <NavEntry key={item.id} item={item} className="fl-card more-entry">
              <span className="more-entry__head">
                <b>{item.label}</b>
                {badge && (
                  <span className={`fl-nav__badge ${badge.good ? "fl-nav__badge--good" : ""}`}>
                    {badge.text}
                  </span>
                )}
              </span>
              <span className="bk-note">{lock ?? item.hint}</span>
            </NavEntry>
          )
        })}
      </div>
    </div>
  )
}
