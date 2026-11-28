import type { CSSProperties } from "react"

import { useFlat } from "@/flat/context"
import { expToNextPlayerLevel } from "@choke/shared/player"
import { FEATURE_IDS, featureName, lockReason, unlockLevelOf } from "@choke/shared/unlocks"

/**
 * 首页的「下一个解锁」：离现在最近的那一级会开什么功能、还差多少经验。
 * 全部按 content/unlocks.json 现算；没有更高的解锁等级时不显示。
 */
export function NextUnlockCard() {
  const { progress } = useFlat()
  const upcoming = FEATURE_IDS.filter((id) => unlockLevelOf(id) > progress.level)
  // 市场的等级早就到了，卡在没绑定 osu! 上：单独提一句
  const marketNeedsAccount =
    lockReason("market", {
      level: progress.level,
      tutorialDone: progress.tutorialDone,
      linkedAccount: progress.linkedAccount,
    })?.kind === "account"

  if (upcoming.length === 0 && !marketNeedsAccount) return null

  const level = upcoming.length > 0 ? Math.min(...upcoming.map(unlockLevelOf)) : null
  const names = upcoming.filter((id) => unlockLevelOf(id) === level).map(featureName)
  // 可能隔着好几级：把中间每一级要的经验都加起来
  let need = 0
  for (let at = progress.level; level !== null && at < level; at += 1) need += expToNextPlayerLevel(at)
  const left = Math.max(0, need - progress.exp)

  return (
    <section className="fl-card home-unlock">
      <div className="fl-card__head">
        <h2 className="fl-card__title">下一个解锁</h2>
      </div>
      {level !== null && (
        <>
          <div className="home-unlock__row">
            <b>
              Lv.{level} · {names[0]}
            </b>
            <span className="bk-note">
              还差 <span className="bk-num">{left.toLocaleString("en-US")}</span> 经验
            </span>
          </div>
          {names.length > 1 && <p className="bk-note">同时解锁 {names.slice(1).join("、")}</p>}
          <div
            className="bk-bar"
            style={
              {
                "--p": need > 0 ? Math.min(100, (progress.exp / need) * 100) : 0,
                "--c": "var(--fl-info)",
              } as CSSProperties
            }
          >
            <i />
          </div>
        </>
      )}
      {marketNeedsAccount && (
        <p className="bk-note">
          市场要绑定 osu! 账号才能买卖，现在只能看。{" "}
          <a className="fl-link" href="/home?panel=account">
            去绑定
          </a>
        </p>
      )}
    </section>
  )
}
