import { useState } from "react"

import { RewardChips, rewardLines } from "@/flat/ui/Rewards"
import type { ExpeditionEventView, ExpeditionStoryView } from "@choke/shared/expedition/view"

/** 剧情台词按顺序呈现，所有选项选完后才能继续。 */
export function StoryPanel({
  story,
  busy,
  onDone,
}: {
  story: ExpeditionStoryView
  busy: boolean
  onDone: (choices: number[]) => void
}) {
  const menus = story.lines.filter((line) => "choice" in line).length
  const [choices, setChoices] = useState<(number | undefined)[]>(() => Array.from({ length: menus }))
  const incomplete = choices.some((choice) => choice === undefined)

  return (
    <>
      <div className="xp-story">
        {story.lines.map((line, index) => {
          if ("choice" in line) {
            const at = story.lines.slice(0, index).filter((item) => "choice" in item).length
            return (
              <div className="xp-story__choices" key={index}>
                {line.choice.map((option, optionIndex) => (
                  <button
                    key={optionIndex}
                    type="button"
                    className="xp-choice"
                    data-on={choices[at] === optionIndex}
                    disabled={busy}
                    onClick={() => setChoices((current) => current.map((value, choiceIndex) => choiceIndex === at ? optionIndex : value))}
                  >
                    <span className="xp-choice__mark" aria-hidden />
                    <span>{option.text}</span>
                  </button>
                ))}
              </div>
            )
          }
          return <p className="xp-story__line" key={index}>{line.speaker && <b>{line.speaker}</b>}{line.text}</p>
        })}
      </div>
      <button type="button" className="bk-btn bk-btn--main xp-panel__action" disabled={busy || incomplete} onClick={() => onDone(choices as number[])}>
        {incomplete ? "请先做出选择" : "继续"}
      </button>
    </>
  )
}

/** 事件选项公开血量、威胁与奖励效果，选定后提交。 */
export function EventPanel({
  event,
  busy,
  teamMaxHp,
  onPick,
}: {
  event: ExpeditionEventView
  busy: boolean
  teamMaxHp?: number
  onPick: (choice: number) => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  return (
    <>
      <p className="xp-prose">{event.text}</p>
      <div className="xp-event-options">
        {event.options.map((option, index) => (
          <button
            key={index}
            type="button"
            className="xp-choice xp-choice--event"
            data-on={selected === index}
            disabled={busy}
            onClick={() => setSelected(index)}
          >
            <span className="xp-choice__mark" aria-hidden />
            <span className="xp-choice__body">
              <b>{option.text}</b>
              <span className="xp-choice__effects">
                {option.threat ? <span className={`xp-chip${option.threat > 0 ? " xp-chip--warn" : " xp-chip--good"}`}>威胁 {option.threat > 0 ? "+" : ""}{option.threat}</span> : null}
                {option.hpLossPct ? (
                  <span className="xp-chip xp-chip--warn">
                    队伍失去 {Math.round(option.hpLossPct * 100)}%
                    {teamMaxHp && teamMaxHp > 0
                      ? `（≈ -${Math.max(1, Math.round(teamMaxHp * option.hpLossPct)).toLocaleString("en-US")} HP）`
                      : " 血量"}
                  </span>
                ) : null}
                {option.reward && <RewardChips lines={rewardLines(option.reward)} />}
                {!option.threat && !option.hpLossPct && !option.reward && <span className="xp-chip">没有直接效果</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="bk-btn bk-btn--main xp-panel__action" disabled={busy || selected === null} onClick={() => selected !== null && onPick(selected)}>
        {selected === null ? "请先选择" : "确认选择"}
      </button>
    </>
  )
}
