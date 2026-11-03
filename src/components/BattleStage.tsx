import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"

import { BattleCard, type BattleCardData } from "@/components/BattleCard"
import { cn } from "@/lib/utils"

import "./battle-stage.css"

const MAX_AP = 6
const PLAYER_MAX = 8000

const ROSTER: BattleCardData[] = [
  {
    id: "neon",
    name: "霓虹疾驰",
    nameEn: "NEON VELOCITY",
    cost: 2,
    atk: 1620,
    bpm: 192,
    acc: "98.4",
    tint: "#ed5f9f",
    no: "001",
    trait: "STREAM · 连击",
  },
  {
    id: "offbeat",
    name: "断拍重击",
    nameEn: "OFFBEAT STRIKE",
    cost: 3,
    atk: 2480,
    bpm: 174,
    acc: "97.1",
    tint: "#1d5db5",
    no: "002",
    trait: "BURST · 重击",
  },
  {
    id: "slider",
    name: "滑条轨迹",
    nameEn: "SLIDER TRAIL",
    cost: 1,
    atk: 980,
    bpm: 208,
    acc: "99.2",
    tint: "#7cc4ff",
    no: "003",
    trait: "SLIDER · 贯通",
  },
  {
    id: "perfect",
    name: "完美判定",
    nameEn: "PERFECT JUDGE",
    cost: 2,
    atk: 1420,
    bpm: 186,
    acc: "99.6",
    tint: "#ed5f9f",
    no: "004",
    trait: "PERFECT · 精准",
  },
  {
    id: "double",
    name: "双押夹击",
    nameEn: "DOUBLE PRESS",
    cost: 2,
    atk: 1560,
    bpm: 200,
    acc: "98.0",
    tint: "#1d5db5",
    no: "005",
    trait: "DOUBLE · 夹击",
  },
  {
    id: "tempo",
    name: "节拍压制",
    nameEn: "TEMPO CRUSH",
    cost: 1,
    atk: 840,
    bpm: 160,
    acc: "96.5",
    tint: "#7cc4ff",
    no: "006",
    trait: "TEMPO · 压制",
  },
]

type EnemyDef = {
  id: string
  name: string
  nameEn: string
  maxHp: number
  atk: number
  tint: string
}

const ENEMY_DEFS: EnemyDef[] = [
  {
    id: "echo",
    name: "风暴·残响",
    nameEn: "STORM ECHO",
    maxHp: 4600,
    atk: 780,
    tint: "#ed5f9f",
  },
  {
    id: "undertow",
    name: "暗流·断点",
    nameEn: "UNDERTOW BREAK",
    maxHp: 5200,
    atk: 900,
    tint: "#1d5db5",
  },
  {
    id: "finale",
    name: "终章·扼杀",
    nameEn: "FINALE CHOKE",
    maxHp: 5800,
    atk: 1100,
    tint: "#7cc4ff",
  },
]

type EnemyState = EnemyDef & { hp: number }

type Popup = { id: number; enemyId: string; value: number }

type Banner = "clear" | "down" | null

const fmt = (value: number) => value.toLocaleString("en-US")

const makeEnemies = (): EnemyState[] =>
  ENEMY_DEFS.map((enemy) => ({ ...enemy, hp: enemy.maxHp }))

export function BattleStage() {
  const [ap, setAp] = React.useState(MAX_AP)
  const [round, setRound] = React.useState(1)
  const [playerHp, setPlayerHp] = React.useState(PLAYER_MAX)
  const [enemies, setEnemies] = React.useState<EnemyState[]>(makeEnemies)
  const [acted, setActed] = React.useState<string[]>([])
  const [striking, setStriking] = React.useState<string | null>(null)
  const [shakeId, setShakeId] = React.useState<string | null>(null)
  const [apShake, setApShake] = React.useState(0)
  const [defending, setDefending] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)
  const [popups, setPopups] = React.useState<Popup[]>([])
  const [banner, setBanner] = React.useState<Banner>(null)

  const hitTimer = React.useRef<number | null>(null)
  const popupSeq = React.useRef(0)
  const toastTimer = React.useRef<number | null>(null)

  React.useEffect(
    () => () => {
      if (hitTimer.current) window.clearTimeout(hitTimer.current)
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    []
  )

  const showToast = (text: string, duration = 1000) => {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), duration)
  }

  const target = enemies.find((enemy) => enemy.hp > 0)
  const enemyHp = enemies.reduce((sum, enemy) => sum + enemy.hp, 0)
  const enemyMax = enemies.reduce((sum, enemy) => sum + enemy.maxHp, 0)

  const playCard = (card: BattleCardData) => {
    if (banner || striking || acted.includes(card.id)) return
    if (!target) return

    if (ap < card.cost) {
      setShakeId(card.id)
      setApShake((n) => n + 1)
      showToast("AP 不足")
      window.setTimeout(() => setShakeId(null), 460)
      return
    }

    setAp((current) => current - card.cost)
    setStriking(card.id)

    hitTimer.current = window.setTimeout(() => {
      const next = enemies.map((enemy) =>
        enemy.id === target.id
          ? { ...enemy, hp: Math.max(0, enemy.hp - card.atk) }
          : enemy
      )
      setEnemies(next)

      popupSeq.current += 1
      const popupId = popupSeq.current
      setPopups((list) => [
        ...list,
        { id: popupId, enemyId: target.id, value: card.atk },
      ])
      window.setTimeout(() => {
        setPopups((list) => list.filter((item) => item.id !== popupId))
      }, 950)

      if (next.every((enemy) => enemy.hp <= 0)) {
        window.setTimeout(() => setBanner("clear"), 720)
      }
    }, 330)
  }

  const finishStrike = (id: string) => {
    setActed((list) => (list.includes(id) ? list : [...list, id]))
    setStriking(null)
  }

  const defend = () => {
    if (banner || striking) return
    if (ap < 1) {
      setApShake((n) => n + 1)
      showToast("AP 不足")
      return
    }
    setAp((current) => current - 1)
    setDefending(true)
    showToast("进入防御姿态", 1400)
  }

  const endRound = () => {
    if (banner || striking) return

    const alive = enemies.filter((enemy) => enemy.hp > 0)
    const raw = alive.reduce((sum, enemy) => sum + enemy.atk, 0)
    const damage = Math.round(raw * (defending ? 0.3 : 1))

    if (damage > 0) {
      const nextHp = Math.max(0, playerHp - damage)
      setPlayerHp(nextHp)
      showToast(`敌方反击 -${fmt(damage)}`, 1800)
      if (nextHp <= 0) {
        setBanner("down")
        return
      }
    }

    setRound((current) => current + 1)
    setAp(MAX_AP)
    setActed([])
    setDefending(false)
    setShakeId(null)
  }

  const restart = () => {
    setAp(MAX_AP)
    setRound(1)
    setPlayerHp(PLAYER_MAX)
    setEnemies(makeEnemies())
    setActed([])
    setStriking(null)
    setShakeId(null)
    setDefending(false)
    setPopups([])
    setToast(null)
    setBanner(null)
  }

  const playerPct = (playerHp / PLAYER_MAX) * 100
  const enemyPct = (enemyHp / enemyMax) * 100

  return (
    <div className="battle-stage">
      <header className="battle-hud">
        <span className="battle-hud__brand">
          CHOKE<span>!</span> <i>BATTLE SIM</i>
        </span>
        <span className="battle-hud__hint">
          SELECT FRONT ROW CARD · SPEND AP TO STRIKE
        </span>
        <span className="battle-hud__meta">STAGE 01 · RHYTHM PROTOCOL</span>
      </header>

      <section className="battle-field">
        <div className="battle-enemies">
          {enemies.map((enemy, index) => (
            <EnemyToken
              key={enemy.id}
              enemy={enemy}
              index={index}
              isTarget={target?.id === enemy.id}
              hits={popups.filter((popup) => popup.enemyId === enemy.id)}
            />
          ))}
        </div>
      </section>

      <section className="battle-ribbon">
        <div className="battle-hp battle-hp--player">
          <div className="battle-hp__head">
            <span>CHOKE! SIDE</span>
            <b>{fmt(playerHp)}</b>
          </div>
          <div className="battle-hp__track">
            <span style={{ width: `${playerPct}%` }} />
          </div>
        </div>

        <div className="battle-round">
          <span className="battle-round__label">ROUND</span>
          <span className="battle-round__num">{round}</span>
          <span className="battle-round__vs">VS</span>
        </div>

        <div className="battle-hp battle-hp--enemy">
          <div className="battle-hp__head">
            <b>{fmt(enemyHp)}</b>
            <span>ENEMY SIDE</span>
          </div>
          <div className="battle-hp__track">
            <span style={{ width: `${enemyPct}%` }} />
          </div>
        </div>
      </section>

      <section
        key={apShake}
        className={cn("battle-ap", apShake > 0 && "is-shaking")}
      >
        <span className="battle-ap__label">AP</span>
        <div className="battle-ap__pips">
          {Array.from({ length: MAX_AP }).map((_, index) => (
            <span
              key={index}
              className={cn("battle-ap__pip", index < ap && "is-on")}
            />
          ))}
        </div>
        <span className="battle-ap__count">
          {ap}
          <i>/ {MAX_AP}</i>
        </span>

        <AnimatePresence>
          {toast && (
            <motion.span
              className="battle-toast"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              {toast}
            </motion.span>
          )}
        </AnimatePresence>
      </section>

      <section className="battle-dock">
        <div className="battle-rail battle-rail--left">
          <button type="button" className="battle-mini" disabled>
            更换人员
          </button>
          <button type="button" className="battle-mini" disabled>
            MENU
          </button>
        </div>

        <div className="battle-handp">
          <div className="battle-hand__caption">
            <span>FRONT ROW</span>
            <i>前排 · 点击卡牌消耗 AP 前冲</i>
          </div>

          <div className={cn("battle-hand", striking && "is-striking")}>
            {ROSTER.map((card) => (
              <BattleCard
                key={card.id}
                data={card}
                status={acted.includes(card.id) ? "acted" : "ready"}
                striking={striking === card.id}
                shaking={shakeId === card.id}
                onPlay={() => playCard(card)}
                onStrikeEnd={() => finishStrike(card.id)}
              />
            ))}
          </div>
        </div>

        <div className="battle-rail battle-rail--right">
          <button
            type="button"
            className={cn("battle-act", defending && "is-active")}
            onClick={defend}
            disabled={!!banner || !!striking}
          >
            <span className="battle-act__icon">◈</span>
            <span className="battle-act__body">
              <b>{defending ? "防御中" : "防御"}</b>
              <i>GUARD · 1 AP</i>
            </span>
          </button>

          <button
            type="button"
            className="battle-act battle-act--end"
            onClick={endRound}
            disabled={!!banner || !!striking}
          >
            <span className="battle-act__body">
              <b>结束该轮</b>
              <i>END ROUND</i>
            </span>
            <span className="battle-act__arrow">→</span>
          </button>
        </div>
      </section>

      <AnimatePresence>
        {banner && (
          <motion.div
            className="battle-banner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="battle-banner__plate">
              <span className="battle-banner__title">
                {banner === "clear" ? "STAGE CLEAR" : "HP DOWN"}
              </span>
              <span className="battle-banner__sub">
                {banner === "clear" ? "敌方全灭 · 判定通过" : "本局结束 · 防线崩溃"}
              </span>
              <button type="button" onClick={restart}>
                重新开始
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EnemyToken({
  enemy,
  index,
  isTarget,
  hits,
}: {
  enemy: EnemyState
  index: number
  isTarget: boolean
  hits: Popup[]
}) {
  const damage = enemy.maxHp - enemy.hp
  const pct = (enemy.hp / enemy.maxHp) * 100

  return (
    <div
      className={cn("enemy", enemy.hp <= 0 && "is-dead", isTarget && "is-target")}
      style={{ "--tint": enemy.tint } as React.CSSProperties}
    >
      <div className="enemy__visual">
        <motion.div
          key={damage}
          className="enemy__target"
          initial={
            damage > 0 ? { scale: 1.08, filter: "brightness(1.9)" } : false
          }
          animate={{ scale: 1, filter: "brightness(1)" }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        >
          <span className="enemy__ring" />
          <span className="enemy__ring enemy__ring--mid" />
          <span className="enemy__core">
            <span className="enemy__glyph" />
            <span className="enemy__idx">
              {String(index + 1).padStart(2, "0")}
            </span>
          </span>
        </motion.div>

        {isTarget && enemy.hp > 0 && (
          <span className="enemy__flag">TARGET</span>
        )}

        <AnimatePresence>
          {hits.map((hit) => (
            <motion.span
              key={hit.id}
              className="enemy__pop"
              initial={{ opacity: 0, y: 4, scale: 0.8 }}
              animate={{ opacity: 1, y: -26, scale: 1 }}
              exit={{ opacity: 0, y: -44 }}
            >
              -{fmt(hit.value)}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <div className="enemy__name">
        {enemy.name}
        <i>{enemy.nameEn}</i>
      </div>

      <div className="enemy__bar">
        <span style={{ width: `${pct}%` }} />
      </div>

      <div className="enemy__hp">
        {fmt(enemy.hp)}
        <i>/ {fmt(enemy.maxHp)}</i>
      </div>
    </div>
  )
}
