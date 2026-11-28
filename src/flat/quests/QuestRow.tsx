import type { CSSProperties } from "react"

import { useFlat } from "@/flat/context"
import { Link } from "@/flat/Link"
import { FLAT_ROUTES, type FlatRouteId } from "@/flat/router"
import { RewardChips } from "@/flat/ui/Rewards"
import type { QuestEvent, QuestView } from "@choke/shared/quests"

import type { QuestActions } from "./actions"

import "./quests.css"

const num = (value: number) => value.toLocaleString("en-US")

/**
 * 签到和推荐谱面外面那层容器的 id：「前往」留在本页时滚到这里。
 * 任务页和首页都有这两样，各自把容器标上这两个 id。
 */
export const SIGN_IN_SLOT = "quests-slot-sign-in"
export const OSU_DAILY_SLOT = "quests-slot-osu-daily"

/**
 * 「前往」：route 是壳内换页，href 是整页跳到原来的桌面或远征页，
 * slot 是留在本页、滚到那张卡；null = 没有专门的去处，不给「前往」。
 */
type QuestGoal = { route: FlatRouteId } | { href: string } | { slot: string } | null

const PACKS: QuestGoal = { route: "packs" }
const ALBUM: QuestGoal = { route: "album" }
const MARKET: QuestGoal = { route: "market" }
const EXPEDITION: QuestGoal = { route: "expedition" }

/** 每种事件都要写一行：服务端加了新事件而这里漏了，编译就过不去 */
const QUEST_GOAL: Record<QuestEvent, QuestGoal> = {
  "sign-in": { slot: SIGN_IN_SLOT },
  "pack-open": PACKS,
  fuse: ALBUM,
  dismantle: ALBUM,
  "market-buy": MARKET,
  "market-sell": MARKET,
  "expedition-win": EXPEDITION,
  "expedition-clear": EXPEDITION,
  "expedition-perfect": EXPEDITION,
  "expedition-tier": EXPEDITION,
  "card-obtain": PACKS,
  "card-level": ALBUM,
  constellation: ALBUM,
  "player-level": null,
  "osu-daily-pass": { slot: OSU_DAILY_SLOT },
}

/** 可领的排最前，其次是进行中的（离完成越近越靠前），已领的沉底；同一档里保持服务端给的顺序 */
export function compareQuests(a: QuestView, b: QuestView): number {
  const rankA = a.claimable ? 0 : a.claimed ? 2 : 1
  const rankB = b.claimable ? 0 : b.claimed ? 2 : 1
  if (rankA !== rankB) return rankA - rankB
  return rankA === 1 ? b.progress / b.target - a.progress / a.target : 0
}

/** 「前往」留在本页的那两种：滚到签到或推荐谱面那张卡，并闪一下边框和聚焦按钮 */
export function useSlotJump(): (slotId: string) => void {
  const { notify } = useFlat()
  return (slotId) => {
    const slot = document.getElementById(slotId)
    // 推荐谱面卡没东西可画时（今天没有谱面，或者没取回来）容器是空的，滚过去也没东西可看
    if (!slot || slot.childElementCount === 0) {
      notify("今天的推荐谱面现在看不了")
      return
    }
    // 系统开了「减少动态效果」就直接跳过去，不滑
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    slot.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" })
    // 已经在视口内时给一次脉冲高亮，避免看起来毫无反应
    slot.classList.remove("is-slot-ping")
    void slot.offsetWidth
    slot.classList.add("is-slot-ping")
    window.setTimeout(() => slot.classList.remove("is-slot-ping"), 1100)
    const action = slot.querySelector<HTMLButtonElement>("button:not(:disabled)")
    if (action) action.focus({ preventScroll: true })
  }
}

/**
 * 一条成就：名字、说明和奖励、进度，右边是领取 / 已领 / 前往。
 * compact（首页的「今日」卡）只留名字、进度的数字和右边那个按钮，说明放在悬停提示里。
 */
export function QuestRow({
  quest,
  actions,
  onJump,
  compact = false,
  signedToday = false,
}: {
  quest: QuestView
  actions: QuestActions
  onJump: (slotId: string) => void
  compact?: boolean
  /** 今天是否已经签到：已签时 sign-in 成就不再给误导性的「前往」，改显「明日 4:00 可签」 */
  signedToday?: boolean
}) {
  const goal = QUEST_GOAL[quest.event]
  const waitNextSignIn = quest.event === "sign-in" && signedToday
  const done = quest.claimable || quest.claimed
  const count = (
    <span className="bk-num">
      {num(quest.progress)}/{num(quest.target)}
    </span>
  )
  return (
    <li className={`quests-row ${quest.claimed ? "is-claimed" : ""} ${compact ? "is-compact" : ""}`}>
      <div className="quests-row__body">
        <b className="quests-row__name" title={compact ? quest.desc : undefined}>
          {quest.name}
        </b>
        {compact ? (
          <span className="quests-row__count">{count}</span>
        ) : (
          <>
            <div className="quests-row__info">
              <span className="quests-row__desc">{quest.desc}</span>
              <RewardChips lines={quest.rewards} />
            </div>
            <div className="quests-row__progress">
              <div
                className="bk-bar"
                style={
                  {
                    "--p": Math.min(100, (quest.progress / quest.target) * 100),
                    "--c": done ? "var(--bk-good)" : "var(--fl-info)",
                  } as CSSProperties
                }
              >
                <i />
              </div>
              {count}
            </div>
          </>
        )}
      </div>
      {quest.claimable ? (
        <button
          type="button"
          className="bk-btn bk-btn--sm fl-claim"
          disabled={actions.busy !== null}
          aria-label={`领取：${quest.name}`}
          onClick={() => void actions.claimQuest(quest.id)}
        >
          {actions.busy === `quest:${quest.id}` ? "领取中…" : "领取"}
        </button>
      ) : quest.claimed ? (
        <span className="quests-row__done">已领 ✓</span>
      ) : waitNextSignIn ? (
        <span className="quests-row__wait">明日 4:00 可签</span>
      ) : goal === null ? null : "route" in goal ? (
        <Link className="fl-link" to={FLAT_ROUTES[goal.route]} aria-label={`前往：${quest.name}`}>
          前往
        </Link>
      ) : "href" in goal ? (
        <a className="fl-link" href={goal.href} aria-label={`前往：${quest.name}`}>
          前往
        </a>
      ) : (
        <button
          type="button"
          className="fl-link"
          aria-label={`前往：${quest.name}`}
          onClick={() => onJump(goal.slot)}
        >
          前往
        </button>
      )}
    </li>
  )
}
