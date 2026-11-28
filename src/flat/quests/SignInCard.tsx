import { useId, useState } from "react"
import { GiCheckMark } from "react-icons/gi"

import { RewardChips, rewardText } from "@/flat/ui/Rewards"
import type { SignInDayView } from "@choke/shared/quests"

import type { QuestActions } from "./actions"
import { useQuests } from "./store"

import "./quests.css"

/** 月历七格一行。只是排版，不对星期 */
const PER_ROW = 7

/**
 * 这一格画成什么样。签过的不管是不是特别日子都是绿勾；今天还没签的最显眼；
 * 其余的里面，金框（特别奖励）和调暗（已经漏签）可以叠在一起。
 */
function dayClass(day: SignInDayView, today: number): string {
  if (day.signed) return "is-signed"
  if (day.day === today) return "is-today"
  return `${day.special ? "is-special" : ""} ${day.day < today ? "is-missed" : ""}`
}

/** 读屏用：把颜色和勾说的那件事换成字 */
function dayStatus(day: SignInDayView, today: number): string {
  if (day.signed) return "已签"
  if (day.day === today) return "今天，还没签"
  return day.day < today ? "漏签" : "还没到"
}

/** 月历上的一格。首页「今日」卡的那一排也用它 */
export function SignInDay({
  day,
  today,
  inTodayRow = false,
}: {
  day: SignInDayView
  /** 今天是本月第几天 */
  today: number
  /** 和今天在同一行：窄屏的签到卡收起来时只露出这一行 */
  inTodayRow?: boolean
}) {
  return (
    <li
      className={`quests-signin__day ${dayClass(day, today)} ${inTodayRow ? "is-today-row" : ""}`}
      title={`${day.day} 号：${rewardText(day.rewards)}`}
      aria-label={`${day.day} 号，${dayStatus(day, today)}${day.special ? "，有特别奖励" : ""}`}
    >
      {day.signed ? <GiCheckMark aria-hidden /> : day.day === today ? "今" : day.day}
    </li>
  )
}

/**
 * 签到卡：本月月历、今天和下一个特别日子的奖励、签到按钮。
 * actions 由页面传进来，和页面上别的领取按钮共用一个「正在进行」的状态。
 * 窄屏先只露出今天所在的那一行，点「看整月」再展开（收放在 quests.css 的媒体查询里）。
 */
export function SignInCard({ actions }: { actions: QuestActions }) {
  const { data } = useQuests()
  const [open, setOpen] = useState(false)
  const calendarId = useId()
  if (!data) return null

  const { monthKey, today, signedToday, signedDays, days } = data.signIn
  const todayIndex = days.findIndex((day) => day.day === today)
  const todayView = todayIndex >= 0 ? days[todayIndex] : null
  const todayRow = Math.floor(Math.max(0, todayIndex) / PER_ROW)
  const nextSpecial = days.find((day) => day.special && day.day > today)

  return (
    <section className={`fl-card quests-signin ${open ? "is-open" : ""}`}>
      <div className="fl-card__head">
        <h2 className="fl-card__title">签到 · {Number(monthKey.slice(-2))} 月</h2>
        <span className="fl-card__meta" aria-live="polite">
          已签 <span className="bk-num">{signedDays}</span> 天
        </span>
      </div>
      <ol className="quests-signin__cal" id={calendarId}>
        {days.map((day, index) => (
          <SignInDay
            key={day.day}
            day={day}
            today={today}
            inTodayRow={Math.floor(index / PER_ROW) === todayRow}
          />
        ))}
      </ol>
      <button
        type="button"
        className="quests-signin__toggle"
        aria-expanded={open}
        aria-controls={calendarId}
        data-sfx="toggle"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "收起" : "看整月"}
      </button>
      {todayView && (
        <div className="quests-signin__line">
          <span>今天：</span>
          <RewardChips lines={todayView.rewards} />
        </div>
      )}
      <div className="quests-signin__more">
        {nextSpecial && (
          <div className="quests-signin__line">
            <span>
              <span className="bk-num">{nextSpecial.day}</span> 号：
            </span>
            <RewardChips lines={nextSpecial.rewards} />
          </div>
        )}
        <p className="bk-note">金框是有特别奖励的日子。漏签不能补。</p>
      </div>
      <button
        type="button"
        className="bk-btn bk-btn--main bk-btn--block"
        disabled={signedToday || actions.busy !== null}
        onClick={() => void actions.signIn()}
      >
        {actions.busy === "sign-in" ? "签到中…" : signedToday ? "今日已签" : "签到"}
      </button>
    </section>
  )
}
