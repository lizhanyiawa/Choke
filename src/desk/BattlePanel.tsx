import { useEffect, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { battlePower } from "@/card/data"
import type { CardSkill } from "@/card/types"

import { fetchDeck, toFace, type ApiDeck, type ApiUserCard } from "./api"

const AP_PER_TURN = 3
const ENEMY_MAX_HP = 30000
const PLAYER_MAX_HP = 80000
const ENEMY_BASE_DAMAGE = 7000

interface BattleState {
  enemyHp: number
  playerHp: number
  ap: number
  turn: number
  acted: boolean[]
  log: string[]
  status: "fighting" | "won" | "lost"
}

function activeSkill(card: ApiUserCard): CardSkill | undefined {
  return card.skills.find((skill) => !skill.passive)
}

function costOf(card: ApiUserCard): number {
  return activeSkill(card)?.ap ?? 0
}

export function BattlePanel({
  userId,
  onOpenDeck,
}: {
  userId: string | null
  onOpenDeck: () => void
}) {
  const [deck, setDeck] = useState<ApiDeck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<BattleState | null>(null)

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

  const cards = deck.slots.map((slot) => slot.card).filter((card): card is ApiUserCard => card != null)

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

  const start = () => {
    setState({
      enemyHp: ENEMY_MAX_HP,
      playerHp: PLAYER_MAX_HP,
      ap: AP_PER_TURN,
      turn: 1,
      acted: Array(7).fill(false),
      log: ["战斗开始"],
      status: "fighting",
    })
  }

  const play = (index: number) => {
    setState((current) => {
      if (!current || current.status !== "fighting") return current
      if (current.acted[index]) return current
      const card = cards[index]
      if (!card) return current
      const cost = costOf(card)
      if (current.ap < cost) return current

      const damage = battlePower(toFace(card))
      const enemyHp = Math.max(0, current.enemyHp - damage)
      const acted = current.acted.slice()
      acted[index] = true
      const log = [`${card.name} 出手，造成 ${damage.toLocaleString("en-US")} 伤害`, ...current.log].slice(0, 8)

      if (enemyHp <= 0) {
        return {
          ...current,
          enemyHp,
          ap: current.ap - cost,
          acted,
          log: ["战斗胜利", ...log].slice(0, 8),
          status: "won",
        }
      }

      return { ...current, enemyHp, ap: current.ap - cost, acted, log }
    })
  }

  const endTurn = () => {
    setState((current) => {
      if (!current || current.status !== "fighting") return current
      const damage = ENEMY_BASE_DAMAGE + (current.turn - 1) * 400
      const playerHp = Math.max(0, current.playerHp - damage)
      const nextTurn = current.turn + 1

      if (playerHp <= 0) {
        return {
          ...current,
          playerHp,
          log: ["战斗失败", `对手反击 ${damage.toLocaleString("en-US")}`, ...current.log].slice(0, 8),
          status: "lost",
        }
      }

      return {
        ...current,
        playerHp,
        ap: AP_PER_TURN,
        turn: nextTurn,
        acted: Array(7).fill(false),
        log: [`对手反击 ${damage.toLocaleString("en-US")}`, ...current.log].slice(0, 8),
      }
    })
  }

  if (!state) {
    const totalBp = cards.reduce((sum, card) => sum + battlePower(toFace(card)), 0)
    return (
      <div className="battle-panel">
        <div className="battle-intro">
          <span className="battle-intro__tag">PVE PROTOTYPE</span>
          <b>练习对手 · 谱面幽灵</b>
          <p>用保存的 7 张卡打一场原型战斗：每回合 {AP_PER_TURN} AP，每张卡每回合行动一次。</p>
          <div className="battle-intro__stats">
            <div>
              <span>敌方 HP</span>
              <b>{ENEMY_MAX_HP.toLocaleString("en-US")}</b>
            </div>
            <div>
              <span>我方 HP</span>
              <b>{PLAYER_MAX_HP.toLocaleString("en-US")}</b>
            </div>
            <div>
              <span>卡组总战力</span>
              <b>{totalBp.toLocaleString("en-US")}</b>
            </div>
          </div>
          <button type="button" className="battle-start" onClick={start}>
            开始战斗
          </button>
          <p className="command-note">原型数值不落库，只验证 AP、出牌、伤害和回合。</p>
        </div>
      </div>
    )
  }

  const enemyPct = (state.enemyHp / ENEMY_MAX_HP) * 100
  const playerPct = (state.playerHp / PLAYER_MAX_HP) * 100

  return (
    <div className="battle-panel">
      <div className="battle-enemy">
        <div className="battle-enemy__head">
          <div>
            <span>ENEMY · TURN {state.turn}</span>
            <b>谱面幽灵</b>
          </div>
          <em>
            {state.enemyHp.toLocaleString("en-US")} / {ENEMY_MAX_HP.toLocaleString("en-US")}
          </em>
        </div>
        <div className="battle-bar">
          <div className="battle-bar__fill battle-bar__fill--enemy" style={{ width: `${enemyPct}%` }} />
        </div>
      </div>

      <div className="battle-status">
        <div className="battle-player">
          <div className="battle-player__head">
            <span>YOU</span>
            <em>
              {state.playerHp.toLocaleString("en-US")} / {PLAYER_MAX_HP.toLocaleString("en-US")}
            </em>
          </div>
          <div className="battle-bar">
            <div className="battle-bar__fill battle-bar__fill--player" style={{ width: `${playerPct}%` }} />
          </div>
        </div>
        <div className="battle-ap" aria-label={`${state.ap} AP`}>
          <span>AP</span>
          {Array.from({ length: AP_PER_TURN }, (_, i) => (
            <i key={i} className={i < state.ap ? "is-on" : ""} />
          ))}
        </div>
      </div>

      <div className="battle-cards">
        {deck.slots.map((slot, index) => {
          if (!slot.card) return null
          const cost = costOf(slot.card)
          const acted = state.acted[index]
          const canPlay = state.status === "fighting" && !acted && state.ap >= cost
          return (
            <button
              type="button"
              key={index}
              className={`battle-card ${acted ? "is-acted" : ""} ${canPlay ? "" : "is-locked"}`}
              onClick={() => play(index)}
              disabled={!canPlay}
            >
              <CardFace card={toFace(slot.card)} />
              <span className="battle-card__cost">{cost} AP</span>
              {acted && <span className="battle-card__acted">已行动</span>}
            </button>
          )
        })}
      </div>

      {state.status === "fighting" ? (
        <button type="button" className="battle-end" onClick={endTurn}>
          结束回合
        </button>
      ) : (
        <div className={`battle-result battle-result--${state.status}`}>
          <b>{state.status === "won" ? "胜利" : "失败"}</b>
          <button type="button" onClick={start}>
            再来一场
          </button>
        </div>
      )}

      <div className="battle-log">
        {state.log.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    </div>
  )
}
