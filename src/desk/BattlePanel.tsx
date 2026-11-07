import { useEffect, useState } from "react"

import { battlePower } from "@/card/data"

import { fetchDeck, toFace, type ApiDeck } from "./api"

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
      <div className="album-panel__empty">
        <p>登录后开始战斗</p>
        <a href="/auth/osu">用 osu! 登录</a>
      </div>
    )
  }
  if (error) return <div className="album-panel__empty">{error}</div>
  if (!deck) return <div className="album-panel__empty">加载卡组…</div>

  const cards = deck.slots.flatMap((slot) => (slot.card ? [slot.card] : []))
  const totalBp = cards.reduce((sum, card) => sum + battlePower(toFace(card)), 0)

  if (cards.length < 7) {
    return (
      <div className="album-panel__empty">
        <p>卡组还差 {7 - cards.length} 张</p>
        <button type="button" className="command-link" onClick={onOpenDeck}>
          去卡组
        </button>
      </div>
    )
  }

  return (
    <div className="battle-panel">
      <div className="battle-intro">
        <span className="battle-intro__tag">PVE · PROTOTYPE</span>
        <b>练习对手 · 谱面幽灵</b>
        <p>
          进入独立战斗界面：7 张卡、2 AP 起始、Combo、防御档位、敌方意图预告，
          以及按 14 子职业分池的技能。
        </p>
        <div className="battle-intro__stats">
          <div>
            <span>卡组</span>
            <b>{cards.length} / 7</b>
          </div>
          <div>
            <span>总战力</span>
            <b>{totalBp.toLocaleString("en-US")}</b>
          </div>
          <div>
            <span>敌人 HP</span>
            <b>24,000</b>
          </div>
        </div>
        <a className="battle-start" href="/battle">
          进入战斗
        </a>
      </div>
    </div>
  )
}
