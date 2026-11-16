import { useEffect, useState } from "react"

import { battlePower } from "@/card/data"

import { fetchDeck, toFace, type ApiDeck } from "./api"
import { Pages } from "./BookPages"
import "./battle-panel.css"

export function BattlePanel({
  userId,
  onOpenDeck,
}: {
  userId: string | null
  onOpenDeck: () => void
}) {
  const [deck, setDeck] = useState<ApiDeck | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    fetchDeck(userId, controller.signal)
      .then((data) => setDeck(data))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError(reason instanceof Error ? reason.message : "加载卡组失败")
      })
    return () => controller.abort()
  }, [userId])

  if (!userId) {
    return (
      <Pages
        left={<p className="bk-note">带上卡组，和练习对手打一场。</p>}
        right={
          <div className="bk-empty">
            <span>登录后开始战斗</span>
            <a className="bk-btn bk-btn--main" href="/auth/osu">
              用 osu! 登录
            </a>
          </div>
        }
      />
    )
  }
  if (error || !deck) {
    return (
      <Pages
        left={<p className="bk-note">带上卡组，和练习对手打一场。</p>}
        right={<div className={`bk-empty ${error ? "bk-error" : ""}`}>{error ?? "加载卡组…"}</div>}
      />
    )
  }

  const cards = deck.slots.flatMap((slot) => (slot.card ? [slot.card] : []))
  const totalBp = cards.reduce((sum, card) => sum + battlePower(toFace(card)), 0)

  const arena = (
    <div className="bk-box battle-enemy">
      <span className="bk-label">4 对 4</span>
      <b className="battle-enemy__name">边线试战</b>
    </div>
  )

  if (cards.length === 0) {
    return (
      <Pages
        left={
          <div className="bk-empty">
            <span>卡组里还没有卡</span>
            <button type="button" className="bk-btn bk-btn--main" onClick={onOpenDeck}>
              去卡组
            </button>
          </div>
        }
        right={arena}
      />
    )
  }

  return (
    <Pages
      left={
        <>
          <div className="battle-stats">
            <div className="bk-stat">
              <b>
                {cards.length} <small>/ 7</small>
              </b>
              <span>出战卡牌</span>
            </div>
            <div className="bk-stat">
              <b>{totalBp.toLocaleString("en-US")}</b>
              <span>总战力</span>
            </div>
          </div>
          <div className="bk-list">
            {cards.map((card, index) => (
              <div className="bk-row" key={card.userCardId}>
                <span className="battle-row__no bk-num">{index + 1}</span>
                <span className="battle-row__name">{card.name}</span>
                <span className="bk-num">{battlePower(toFace(card)).toLocaleString("en-US")}</span>
              </div>
            ))}
          </div>
          <button type="button" className="bk-btn bk-btn--ghost battle-edit" onClick={onOpenDeck}>
            调整卡组
          </button>
        </>
      }
      right={
        <>
          {arena}
          <a className="bk-btn bk-btn--main bk-btn--block battle-start" href="/battle?from=lobby">
            进入战斗
          </a>
        </>
      }
    />
  )
}
