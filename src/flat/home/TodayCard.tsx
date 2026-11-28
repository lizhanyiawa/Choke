import { useEffect, useState } from "react"

import { useFlat } from "@/flat/context"
import { Link } from "@/flat/Link"
import { useQuestActions } from "@/flat/quests/actions"
import { QuestRow, SIGN_IN_SLOT, compareQuests, useSlotJump } from "@/flat/quests/QuestRow"
import { SignInDay } from "@/flat/quests/SignInCard"
import {
  refreshQuests,
  refreshQuestsUnlessPending,
  useQuests,
} from "@/flat/quests/store"
import { FLAT_ROUTES } from "@/flat/router"
import { featureLockHint } from "@/tutorial/unlocks"

/** 签到那一排放几天，今天前面留几天：前四天、今天、后两天。月初月底不够就顺着往另一头挪 */
const STRIP_DAYS = 7
const STRIP_BEFORE = 4
/** 最多列几条成就；全部的在成就页 */
const QUEST_ROWS = 3

/**
 * 首页的「今日」卡：每日签到和最接近完成的几条成就。
 * 读的是成就页那一份总览，领取也是同一套动作；要看全部就去成就页。
 */
export function TodayCard() {
  const { progress } = useFlat()
  const { data, error } = useQuests()
  // 这张卡上的签到、宝箱、任务和一键领取共用一个「正在进行」
  const actions = useQuestActions()
  const jump = useSlotJump()
  const [retrying, setRetrying] = useState(false)
  const lock = featureLockHint("quests", progress)

  // 外壳里那份可能是几分钟前取的，进页面先对一次；正好有一次在路上就等它。没解锁时不会发请求
  useEffect(() => {
    void refreshQuestsUnlessPending()
  }, [])

  if (lock !== null || data === null) {
    const retry = () => {
      setRetrying(true)
      void refreshQuests().then(() => setRetrying(false))
    }
    return (
      <section className="fl-card home-today">
        <div className="fl-card__head">
          <h2 className="fl-card__title">今日</h2>
        </div>
        {lock !== null ? (
          <p className="bk-note">{lock}</p>
        ) : error !== null ? (
          <div className="bk-empty" role="alert">
            <span className="bk-error">{error}</span>
            <button type="button" className="bk-btn bk-btn--sm" disabled={retrying} onClick={retry}>
              {retrying ? "重试中…" : "重试"}
            </button>
          </div>
        ) : (
          <p className="bk-note" role="status">
            正在读取成就……
          </p>
        )}
      </section>
    )
  }

  const { today, signedToday, days } = data.signIn
  const todayIndex = Math.max(
    0,
    days.findIndex((day) => day.day === today),
  )
  const stripStart = Math.max(0, Math.min(todayIndex - STRIP_BEFORE, days.length - STRIP_DAYS))
  const strip = days.slice(stripStart, stripStart + STRIP_DAYS)

  // 可领的在前，其次是离完成最近的；领过的不占地方
  const rows = data.quests
    .filter((quest) => !quest.claimed)
    .sort(compareQuests)
    .slice(0, QUEST_ROWS)

  return (
    <section className="fl-card home-today">
      <div className="fl-card__head">
        <h2 className="fl-card__title">今日</h2>
        <Link className="fl-link" to={FLAT_ROUTES.quests}>
          全部成就
        </Link>
        {data.claimable > 0 && (
          <button
            type="button"
            className="bk-btn bk-btn--sm fl-claim"
            disabled={actions.busy !== null}
            onClick={() => void actions.claimAll()}
          >
            {actions.busy === "claim-all" ? (
              "领取中…"
            ) : (
              <span>
                一键领取 <span className="bk-num">{data.claimable.toLocaleString("en-US")}</span> 项
              </span>
            )}
          </button>
        )}
      </div>
      <div className="home-today__signin" id={SIGN_IN_SLOT}>
        <ol className="quests-signin__cal" aria-label="这几天的签到">
          {strip.map((day) => (
            <SignInDay key={day.day} day={day} today={today} />
          ))}
        </ol>
        <button
          type="button"
          className="bk-btn bk-btn--sm fl-claim"
          disabled={signedToday || actions.busy !== null}
          onClick={() => void actions.signIn()}
        >
          {actions.busy === "sign-in" ? "签到中…" : signedToday ? "今日已签" : "签到"}
        </button>
      </div>
      {rows.length > 0 ? (
        <ul className="quests-list__rows">
          {rows.map((quest) => (
            <QuestRow
              key={quest.id}
              quest={quest}
              actions={actions}
              onJump={jump}
              signedToday={signedToday}
              compact
            />
          ))}
        </ul>
      ) : (
        data.quests.length > 0 && <p className="bk-note">成就都做完、领完了。</p>
      )}
    </section>
  )
}
