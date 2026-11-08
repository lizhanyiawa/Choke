import { useEffect, useState } from "react"

import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  RARITY_LABEL,
} from "@/card/data"
import { fetchDeck, toFace, type ApiDeck } from "@/desk/api"

import { cloneBattle, createBattle, endTurn, enemyDamageTier, playSkill, raiseDefense, teamHpOf } from "./engine"
import type { BattleState } from "./types"
import "./battle.css"

interface ApiUser {
  id: string
  username: string
}

export function BattlePage() {
  const [user, setUser] = useState<ApiUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [deck, setDeck] = useState<ApiDeck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [battle, setBattle] = useState<BattleState | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/auth/me", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok) setUser({ id: data.data.id, username: data.data.username })
        else setUser(null)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchDeck(user.id)
      .then((data) => {
        if (!cancelled) setDeck(data)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "加载卡组失败")
      })
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) return <div className="battle-page battle-page--center">加载中…</div>
  if (!user) {
    return (
      <div className="battle-page battle-page--center">
        <div className="battle-gate">
          <span>CHOKE! · BATTLE</span>
          <h1>需要先登录</h1>
          <p>战斗读取你账号里保存的 7 张主队卡。</p>
          <a href="/auth/osu">用 osu! 登录</a>
        </div>
      </div>
    )
  }
  if (error) return <div className="battle-page battle-page--center">{error}</div>
  if (!deck) return <div className="battle-page battle-page--center">加载卡组…</div>

  const cards = deck.slots.flatMap((slot) => (slot.card ? [slot.card] : []))

  if (cards.length < 7) {
    return (
      <div className="battle-page battle-page--center">
        <div className="battle-gate">
          <span>CHOKE! · BATTLE</span>
          <h1>卡组还差 {7 - cards.length} 张</h1>
          <p>先回桌面把 7 个槽位填满。</p>
          <a href="/">回桌面</a>
        </div>
      </div>
    )
  }

  const start = () => {
    setActionError(null)
    setBattle(
      createBattle(
        cards.map((card) => ({
          uid: card.userCardId,
          cardId: card.id,
          face: toFace(card),
        })),
      ),
    )
  }

  if (!battle) {
    const totalBp = cards.reduce((sum, card) => sum + card.level, 0)
    return (
      <div className="battle-page battle-page--center">
        <div className="battle-gate">
          <span>PVE · PROTOTYPE</span>
          <h1>练习对手 · 谱面幽灵</h1>
          <p>7 张主队卡、AP 2 起始、Combo、防御档位和敌方意图预告。</p>
          <div className="battle-gate__stats">
            <div>
              <span>卡组</span>
              <b>{cards.length} / 7</b>
            </div>
            <div>
              <span>敌人 HP</span>
              <b>24,000</b>
            </div>
            <div>
              <span>总等级</span>
              <b>{totalBp}</b>
            </div>
          </div>
          <button type="button" onClick={start}>
            开始战斗
          </button>
          <a href="/">回桌面</a>
        </div>
      </div>
    )
  }

  const team = teamHpOf(battle)
  const enemyPct = (battle.enemy.hp / battle.enemy.hpMax) * 100
  const teamPct = (team.hp / team.max) * 100
  const hasTank = battle.cards.some((card) => !card.down && card.subjob.tags.includes("tank"))

  const play = (index: number, skillId: string) => {
    const next = cloneBattle(battle)
    const message = playSkill(next, index, skillId)
    setBattle(next)
    setActionError(message)
  }

  const defend = (tier: number) => {
    const next = cloneBattle(battle)
    const message = raiseDefense(next, tier)
    setBattle(next)
    setActionError(message)
  }

  const finishTurn = () => {
    const next = cloneBattle(battle)
    const message = endTurn(next)
    setBattle(next)
    setActionError(message)
  }

  return (
    <div className="battle-page">
      <header className="battle-top">
        <a className="battle-top__back" href="/">
          ‹ 桌面
        </a>
        <div className="battle-top__title">
          <span>PVE · 练习对手</span>
          <b>谱面幽灵</b>
        </div>
        <div className="battle-top__stats">
          <div className="battle-stat">
            <span>TURN</span>
            <b>{battle.turn}</b>
          </div>
          <div className="battle-stat">
            <span>COMBO</span>
            <b>{battle.combo}</b>
          </div>
          <div className="battle-stat">
            <span>防御</span>
            <b>{["0", "I", "II", "III", "IV"][battle.defenseTier]}</b>
          </div>
          <div className="battle-ap">
            <span>AP</span>
            {Array.from({ length: battle.apMax }, (_, i) => (
              <i key={i} className={i < battle.ap ? "is-on" : ""} />
            ))}
          </div>
        </div>
      </header>

      <main className="battle-main">
        <aside className="battle-side battle-side--enemy">
          <div className="battle-enemy">
            <span className="battle-enemy__tag">ENEMY · {ELEMENT_LABEL[battle.enemy.element]}</span>
            <b>{battle.enemy.name}</b>
            <em>
              {battle.enemy.hp.toLocaleString("en-US")} / {battle.enemy.hpMax.toLocaleString("en-US")}
            </em>
            <div className="battle-hp">
              <div className="battle-hp__fill battle-hp__fill--enemy" style={{ width: `${enemyPct}%` }} />
            </div>
          </div>

          <div className="battle-panel">
            <div className="battle-panel__title">意图预告</div>
            <div className="battle-intents">
              {battle.enemy.intents.map((intent) => (
                <div className="battle-intent" key={intent.id}>
                  <span
                    className="battle-intent__dot"
                    style={{ background: ELEMENT_COLOR[intent.element] ?? "#8a9099" }}
                  />
                  <div>
                    <b>{intent.label}</b>
                    <em>
                      {ELEMENT_LABEL[intent.element] ?? intent.element} · {enemyDamageTier(intent)}
                    </em>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {battle.supports.length > 0 && (
            <div className="battle-panel">
              <div className="battle-panel__title">侧面支援</div>
              <div className="battle-supports">
                {battle.supports.map((support) => (
                  <div className="battle-support" key={support.id}>
                    <span style={{ background: ELEMENT_COLOR[support.element] ?? "#8a9099" }} />
                    <b>{support.name}</b>
                    <em>自动攻击 50%</em>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="battle-center">
          <div className="battle-team">
            <div className="battle-team__head">
              <span>YOUR TEAM · {battle.cards.filter((card) => !card.down).length} / 7</span>
              <em>
                {team.hp.toLocaleString("en-US")} / {team.max.toLocaleString("en-US")}
              </em>
            </div>
            <div className="battle-hp battle-hp--team">
              <div className="battle-hp__fill battle-hp__fill--team" style={{ width: `${teamPct}%` }} />
            </div>
          </div>

          <div className="battle-cards">
            {battle.cards.map((card, index) => {
              const hpPct = (card.stats.hp / card.stats.hpMax) * 100
              const canAct = battle.phase === "player" && !card.acted && !card.down
              return (
                <div
                  className={`battle-card ${card.acted ? "is-acted" : ""} ${card.down ? "is-down" : ""}`}
                  key={card.uid}
                >
                  <div className="battle-card__top">
                    <span>{card.subjob.label}</span>
                    <em>{RARITY_LABEL[card.rarity]}</em>
                  </div>
                  <div
                    className="battle-card__art"
                    style={card.art ? { backgroundImage: `url(${card.art})` } : undefined}
                  >
                    <span className="battle-card__lv">Lv.{card.level}</span>
                  </div>
                  <div className="battle-card__name" title={card.name}>
                    {card.name}
                  </div>
                  <div className="battle-card__hp">
                    <div className="battle-hp">
                      <div className="battle-hp__fill battle-hp__fill--card" style={{ width: `${hpPct}%` }} />
                    </div>
                    <em>
                      {card.stats.hp.toLocaleString("en-US")} / {card.stats.hpMax.toLocaleString("en-US")}
                    </em>
                  </div>
                  <div className="battle-card__stats">
                    <span>ATK {card.stats.atk.toLocaleString("en-US")}</span>
                    <span>DEF {card.stats.def.toLocaleString("en-US")}</span>
                    <span>INT {card.stats.int.toLocaleString("en-US")}</span>
                  </div>
                  <div className="battle-card__skills">
                    {card.skills
                      .filter((skill) => !skill.passive)
                      .map((skill) => {
                        const used = skill.once && card.usedOnce.includes(skill.id)
                        const disabled = !canAct || battle.ap < skill.ap || used
                        return (
                          <button
                            type="button"
                            key={skill.id}
                            className="battle-skill"
                            onClick={() => play(index, skill.id)}
                            disabled={disabled}
                            title={skill.desc}
                          >
                            <span
                              className="battle-skill__el"
                              style={{ background: ELEMENT_COLOR[skill.element] ?? "#8a9099" }}
                            />
                            <b>{skill.name}</b>
                            <em>
                              {used ? "已用" : `${skill.ap} AP`}
                              {skill.hits && skill.hits > 1 ? ` ×${skill.hits}` : ""}
                            </em>
                          </button>
                        )
                      })}
                    {card.skills
                      .filter((skill) => skill.passive)
                      .map((skill) => (
                        <span className="battle-passive" key={skill.id} title={skill.desc}>
                          {skill.name}
                        </span>
                      ))}
                  </div>
                  {card.down && <div className="battle-card__overlay">DOWN</div>}
                  {!card.down && card.acted && <div className="battle-card__overlay">已行动</div>}
                </div>
              )
            })}
          </div>

          {battle.phase === "player" ? (
            <div className="battle-actions">
              <div className="battle-defense">
                <span>防御</span>
                {[1, 2, 3, 4].map((tier) => (
                  <button
                    type="button"
                    key={tier}
                    onClick={() => defend(tier)}
                    disabled={
                      tier <= battle.defenseTier ||
                      battle.ap < tier - battle.defenseTier ||
                      (tier === 4 && !hasTank)
                    }
                  >
                    {["I", "II", "III", "IV"][tier - 1]}
                  </button>
                ))}
              </div>
              <button type="button" className="battle-end" onClick={finishTurn}>
                结束回合
              </button>
            </div>
          ) : (
            <div className="battle-result">
              <b>{battle.phase === "won" ? "战斗胜利" : "战斗失败"}</b>
              <div>
                <button type="button" onClick={start}>
                  再来一场
                </button>
                <a href="/">回桌面</a>
              </div>
            </div>
          )}
          {actionError && <div className="battle-action-error">{actionError}</div>}
        </section>

        <aside className="battle-side battle-side--log">
          <div className="battle-panel battle-panel--log">
            <div className="battle-panel__title">战斗记录</div>
            <div className="battle-log">
              {battle.log.map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
          </div>
          <div className="battle-panel">
            <div className="battle-panel__title">规则摘要</div>
            <p className="battle-note">
              开局 2 AP，每回合 +2，未用 AP 累积，上限 7。Combo 每次命中 +1，回合结束清零。
              防御档位独立乘算，非坦克最高 III，坦克可到 IV。
            </p>
          </div>
        </aside>
      </main>
    </div>
  )
}
