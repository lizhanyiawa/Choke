import { Fragment, useEffect, useMemo, useState } from "react"

import { useFlat } from "@/flat/context"
import { featureLockHint } from "@/tutorial/unlocks"
import type { QuestsOverview, QuestView } from "@choke/shared/quests"

import { useQuestActions } from "./actions"
import { OsuDailyCard } from "./OsuDailyCard"
import { OSU_DAILY_SLOT, QuestRow, SIGN_IN_SLOT, compareQuests, useSlotJump } from "./QuestRow"
import { SignInCard } from "./SignInCard"
import { refreshQuests, refreshQuestsUnlessPending, useQuests } from "./store"

import "./quests.css"

const num = (value: number) => value.toLocaleString("en-US")

const ALL_GROUP = "__all__"

interface QuestGroup {
  title: string
  quests: QuestView[]
  claimable: number
  claimed: number
}

/** 成就按 group 分栏，栏的先后照服务端给的出现顺序 */
function groupQuests(quests: readonly QuestView[]): QuestGroup[] {
  if (quests.length === 0) return []
  const groups = new Map<string, QuestView[]>()
  for (const quest of quests) {
    const title = quest.group ?? "其他"
    const list = groups.get(title)
    if (list) list.push(quest)
    else groups.set(title, [quest])
  }
  return [...groups].map(([title, list]) => {
    const sorted = [...list].sort(compareQuests)
    let claimable = 0
    let claimed = 0
    for (const q of sorted) {
      if (q.claimable) claimable += 1
      if (q.claimed) claimed += 1
    }
    return { title, quests: sorted, claimable, claimed }
  })
}

/** 成就页：按分类页签切换的一次性成就列表，旁边是签到和今日推荐谱面 */
export function QuestsPage() {
  const { progress } = useFlat()
  const { data, error } = useQuests()
  const [retrying, setRetrying] = useState(false)
  const lock = featureLockHint("quests", progress)

  // 外壳里那份可能是几分钟前取的，进页面先对一次；外壳的首次请求还在路上就等它，不重复发。
  // 没解锁时不会发请求
  useEffect(() => {
    void refreshQuestsUnlessPending()
  }, [])

  const retry = () => {
    setRetrying(true)
    void refreshQuests().then(() => setRetrying(false))
  }

  return (
    <div className="fl-page quests-page">
      {lock === null && data !== null ? (
        <QuestsBoard data={data} />
      ) : (
        <>
          <div className="fl-page__head">
            <h1 className="fl-page__title">成就</h1>
          </div>
          {lock !== null ? (
            <div className="fl-lock">{lock}</div>
          ) : error !== null ? (
            <div className="bk-empty" role="alert">
              <span className="bk-error">{error}</span>
              <button type="button" className="bk-btn" disabled={retrying} onClick={retry}>
                {retrying ? "重试中…" : "重试"}
              </button>
            </div>
          ) : (
            <div className="bk-empty" role="status" aria-live="polite">
              正在读取成就……
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 数据取回来之后的整页：页头、分类页签、左栏成就列表、右栏签到和推荐谱面 */
function QuestsBoard({ data }: { data: QuestsOverview }) {
  const actions = useQuestActions()
  const jump = useSlotJump()
  const groups = useMemo(() => groupQuests(data.quests), [data.quests])
  const [activeGroup, setActiveGroup] = useState<string>(ALL_GROUP)

  const totalClaimed = useMemo(
    () => data.quests.reduce((sum, q) => sum + (q.claimed ? 1 : 0), 0),
    [data.quests],
  )

  // 当前选中的分组已不存在时自动回到「全部」
  const resolvedGroup =
    activeGroup === ALL_GROUP || groups.some((g) => g.title === activeGroup)
      ? activeGroup
      : ALL_GROUP
  const visibleGroups =
    resolvedGroup === ALL_GROUP ? groups : groups.filter((g) => g.title === resolvedGroup)

  const signedToday = data.signIn.signedToday

  return (
    <>
      <div className="fl-page__head">
        <h1 className="fl-page__title">成就</h1>
        <span className="quests-page__summary bk-num">
          已完成 {num(totalClaimed)} / {num(data.quests.length)}
        </span>
        <span className="fl-page__spacer" />
        <button
          type="button"
          className="bk-btn fl-claim quests-page__claim-all"
          disabled={data.claimable === 0 || actions.busy !== null}
          onClick={() => void actions.claimAll()}
        >
          {actions.busy === "claim-all" ? (
            "领取中…"
          ) : data.claimable > 0 ? (
            <span>
              一键领取 <span className="bk-num">{num(data.claimable)}</span> 项
            </span>
          ) : (
            "没有可领的"
          )}
        </button>
      </div>
      {groups.length > 1 && (
        <div className="bk-chips quests-page__tabs" role="tablist" aria-label="成就分类">
          <button
            type="button"
            role="tab"
            className="bk-chip"
            aria-selected={resolvedGroup === ALL_GROUP}
            data-sfx="toggle"
            onClick={() => setActiveGroup(ALL_GROUP)}
          >
            全部
            <em className="bk-num">
              {totalClaimed}/{data.quests.length}
            </em>
            {data.claimable > 0 && <small className="bk-num">+{data.claimable}</small>}
          </button>
          {groups.map((group) => (
            <button
              key={group.title}
              type="button"
              role="tab"
              className="bk-chip"
              aria-selected={resolvedGroup === group.title}
              data-sfx="toggle"
              onClick={() => setActiveGroup(group.title)}
            >
              {group.title}
              <em className="bk-num">
                {group.claimed}/{group.quests.length}
              </em>
              {group.claimable > 0 && <small className="bk-num">+{group.claimable}</small>}
            </button>
          ))}
        </div>
      )}
      <div className="quests-page__body">
        <div className="quests-page__main">
          {visibleGroups.length > 0 ? (
            <section className="fl-card quests-list" aria-label="成就列表">
              {visibleGroups.map((group) => (
                <Fragment key={group.title}>
                  {resolvedGroup === ALL_GROUP && (
                    <h2 className="quests-list__group">
                      {group.title}
                      <span className="bk-num">
                        {group.claimed}/{group.quests.length}
                      </span>
                    </h2>
                  )}
                  <ul className="quests-list__rows">
                    {group.quests.map((quest) => (
                      <QuestRow
                        key={quest.id}
                        quest={quest}
                        actions={actions}
                        onJump={jump}
                        signedToday={signedToday}
                      />
                    ))}
                  </ul>
                </Fragment>
              ))}
            </section>
          ) : (
            <div className="bk-empty">暂时没有成就。</div>
          )}
          <p className="bk-note">成就不会过期，没领的会一直留着。</p>
        </div>
        <div className="quests-page__side">
          <div className="quests-page__slot" id={SIGN_IN_SLOT}>
            <SignInCard actions={actions} />
          </div>
          <div className="quests-page__slot" id={OSU_DAILY_SLOT}>
            <OsuDailyCard key={data.signIn.today} />
          </div>
        </div>
      </div>
    </>
  )
}
