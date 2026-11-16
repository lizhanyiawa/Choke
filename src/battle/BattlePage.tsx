import { lazy, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { RiArrowLeftLine, RiShieldLine } from "@remixicon/react"

import { CardFace } from "@/card/CardFace"
import { DEMO_CARDS, ELEMENT_COLOR, ELEMENT_LABEL } from "@/card/data"
import { SUBJOBS } from "@/card/jobs"
import { JOB_LABEL } from "@/card/cultivation"
import { fetchDeck, toFace } from "@/desk/api"

import { EdgeArena } from "./EdgeArena"
import { EdgePreparation } from "./EdgePreparation"
import { EDGE_LIMIT } from "./edgeBattle"
import type { EdgeInputCard } from "./edgeSkills/catalog"
import { cloneBattle, createBattle, endTurn, enemyDamageTier, playSkill, raiseDefense, teamHpOf } from "./engine"
import type { BattleState } from "./types"
import "./battle.css"

const EdgeSkillPreview = lazy(() => import("./EdgeSkillPreview").then(({ EdgeSkillPreview }) => ({ default: EdgeSkillPreview })))

type Lineup = Parameters<typeof createBattle>[0]
type DeckLoad = { status: "guest" | "error" | "ready"; lineup: Lineup; message?: string }
type EdgeLineups = { lineup: EdgeInputCard[]; rivals?: EdgeInputCard[] }

const practiceLineup: Lineup = DEMO_CARDS.slice(0, 4).map((face, index) => ({
  uid: index + 1,
  cardId: face.id,
  face,
}))
const practiceEdge: EdgeInputCard[] = (["warden", "bard", "ranger"] as const).map((edgeSubjob, i) => ({
  uid: -i - 1,
  cardId: "edge-rehearsal-" + i,
  edgeSubjob,
  face: {
    ...DEMO_CARDS[i], name: ["战坦", "吟游诗人", "游侠"][i], job: i === 0 ? "tank" : i === 1 ? "support" : "warrior",
    rarity: i === 2 ? "Prismatic" : i === 1 ? "Radiant" : "C", level: 1, constellation: 0, mods: [],
  },
}))
const sparringCards: EdgeInputCard[] = (["ranger", "warlock"] as const).map((edgeSubjob, index) => {
  const { archetype } = SUBJOBS[edgeSubjob]
  const id = "edge-sparring-" + index
  return { uid: -index - 1, cardId: id, edgeSubjob, combatVersion: "four-v2", edgePool: "curated-v1", face: {
    ...DEMO_CARDS[0], id, art: undefined, name: JOB_LABEL[archetype], job: archetype, rarity: "R", level: 1, constellation: 0, mods: [],
  } }
})
const defenseLabels = ["0", "I", "II", "III", "IV"]
const number = new Intl.NumberFormat("zh-CN")

interface Feedback {
  id: number
  actor: number | null
  enemy: number
  allies: { uid: number; delta: number }[]
  guard: boolean
}

function makeFeedback(before: BattleState, after: BattleState, actor: number | null, id: number): Feedback {
  return {
    id,
    actor,
    enemy: after.enemy.hp - before.enemy.hp,
    allies: after.cards.flatMap((card, index) => {
      const delta = card.stats.hp - before.cards[index].stats.hp
      return delta === 0 ? [] : [{ uid: card.uid, delta }]
    }),
    guard: after.defenseTier > before.defenseTier,
  }
}

function Ghost() {
  return (
    <svg className="battle-ghost" viewBox="0 0 320 210" aria-hidden>
      <defs>
        <linearGradient id="battle-ghost-body" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fde4f6" />
          <stop offset="1" stopColor="#a77bd6" />
        </linearGradient>
        <linearGradient id="battle-ghost-line">
          <stop stopColor="#f3b8ed" stopOpacity="0" />
          <stop offset=".5" stopColor="#f3b8ed" />
          <stop offset="1" stopColor="#f3b8ed" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="160" cy="108" rx="129" ry="78" fill="none" stroke="#d29ae8" strokeOpacity=".24" />
      <ellipse cx="160" cy="108" rx="110" ry="62" fill="none" stroke="#f2b2eb" strokeOpacity=".38" strokeDasharray="6 9" />
      <path d="M7 108h71m164 0h71M160 10v29m0 142v23" stroke="url(#battle-ghost-line)" strokeWidth="2" />
      <path d="M91 139l23-22-9-27 31-38 24-13 24 13 31 38-9 27 23 22-51-11-18 38-18-38z" fill="url(#battle-ghost-body)" stroke="#ffe8f9" strokeWidth="2" />
      <path d="M128 92l25 8-21 12zm64 0-25 8 21 12zM153 123l7-7 7 7-7 11z" fill="#301d41" />
      <path d="M73 67l27-21m120 0l27 21M79 148l26 16m110 0l26-16" stroke="#dda4ee" strokeOpacity=".65" strokeWidth="3" />
      <circle cx="55" cy="115" r="4" fill="#f0b6ed" />
      <circle cx="265" cy="115" r="4" fill="#f0b6ed" />
    </svg>
  )
}

function Health({ value, max, label, type }: { value: number; max: number; label: string; type: "enemy" | "ally" }) {
  return (
    <div className={`battle-health battle-health--${type}`}>
      <div
        className="battle-health__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <i style={{ width: `${max ? Math.max(0, Math.min(100, value / max * 100)) : 0}%` }} />
      </div>
      <span>{number.format(value)} / {number.format(max)}</span>
    </div>
  )
}

function Delta({ value, delay = 0 }: { value: number; delay?: number }) {
  return (
    <span
      className={`battle-delta ${value > 0 ? "is-heal" : "is-hit"}`}
      style={{ "--delta-delay": `${delay}ms` } as CSSProperties}
      aria-hidden
    >
      {value > 0 ? "+" : "−"}{number.format(Math.abs(value))}
    </span>
  )
}

export function BattlePage() {
  const search = new URLSearchParams(window.location.search)
  if (search.get("view") === "skills") {
    const from = search.get("from")
    if (from === "album" || from === "codex") {
      return <EdgeSkillPreview backHref={"/?panel=" + from} backLabel={from === "album" ? "卡册" : "图鉴"} matchRarity />
    }
    for (const param of ["view", "skill", "t", "scene", "sheet"]) search.delete(param)
    const query = search.toString()
    return <EdgeSkillPreview backHref={query ? "/battle?" + query : "/battle"} />
  }
  search.set("view", "skills")
  return <BattleLobby previewHref={"/battle?" + search.toString()} />
}

function BattleLobby({ previewHref }: { previewHref: string }) {
  const [load, setLoad] = useState<DeckLoad | null>(null)
  const [lineup, setLineup] = useState<Lineup | null>(null)
  const [edgeRun, setEdgeRun] = useState<EdgeLineups | null>(null)
  const [preparation, setPreparation] = useState<(EdgeLineups & { practice: boolean }) | null>(null)
  const [mode, setMode] = useState<"edge" | "turn">("edge")
  const [picked, setPicked] = useState<number[] | null>(null)
  const from = new URLSearchParams(window.location.search).get("from")
  const backTo = from === "developer" ? "/developer"
    : from === "deck" ? "/?panel=deck"
      : from === "lobby" ? "/?panel=battle" : "/"

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    fetch("/auth/me", { credentials: "include", signal })
      .then((response) => response.json())
      .then(async (response) => {
        if (!response.ok) {
          if (!signal.aborted) setLoad({ status: "guest", lineup: [] })
          return
        }
        const deck = await fetchDeck(response.data.id, signal)
        if (!signal.aborted) {
          setLoad({
            status: "ready",
            lineup: deck.slots.flatMap(({ card }) => card ? [{
              uid: card.userCardId, cardId: card.id, face: toFace(card),
            }] : []),
          })
        }
      })
      .catch((error: unknown) => {
        if (!signal.aborted) setLoad({
          status: "error",
          lineup: [],
          message: error instanceof Error ? error.message : "加载卡组失败",
        })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const back = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !event.repeat) window.location.assign(backTo)
    }
    window.addEventListener("keydown", back)
    return () => window.removeEventListener("keydown", back)
  }, [backTo])

  if (edgeRun) return <EdgeArena {...edgeRun} onBack={() => setEdgeRun(null)} />
  if (preparation) return <EdgePreparation {...preparation}
    onBack={() => setPreparation(null)} onStart={(cards, rivals) => {
      const run = { lineup: cards, rivals }
      setPreparation({ ...run, practice: preparation.practice })
      setEdgeRun(run)
    }} />
  if (lineup) return <BattleArena lineup={lineup} backTo={backTo} />

  const available = load?.lineup ?? []
  const selected = picked ?? available.slice(0, EDGE_LIMIT).map(({ uid }) => uid)
  const edgeLineup = available.filter(({ uid }) => selected.includes(uid))

  return (
    <div className="battle-page">
      <header className="client-header battle-top">
        <BattleBack href={backTo} />
        <b>战斗</b>
      </header>
      <main className="battle-lobby">
        <div className="battle-lobby__portrait"><Ghost /></div>
        <section className="battle-lobby__ready">
          <h1>谱面幽灵</h1>
          {load?.message && <p role="alert">{load.message}</p>}
          {!load && <p role="status">加载中…</p>}
          <div className="edge-lobby-modes" role="group" aria-label="战斗方式">
            <button type="button" className="client-key" aria-pressed={mode === "edge"} onClick={() => setMode("edge")}>边线试战</button>
            <button type="button" className="client-key" aria-pressed={mode === "turn"} onClick={() => setMode("turn")}>经典回合 · 旧规则</button>
          </div>
          {mode === "edge" && available.length > 0 && (
            <div className="edge-pick">
              <p>出战 {edgeLineup.length} / {EDGE_LIMIT}</p>
              <div className="edge-pick__cards" role="group" aria-label="边线出战卡牌">
                {available.map(({ uid, face }) => {
                  const active = selected.includes(uid)
                  return (
                    <button type="button" key={uid} className="client-key" aria-pressed={active}
                      disabled={!active && edgeLineup.length >= EDGE_LIMIT} title={face.name}
                      onClick={() => setPicked(active ? selected.filter((id) => id !== uid) : [...selected, uid])}>
                      {face.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="battle-lobby__actions">
            {load?.status === "guest" && <a className="client-key" href="/auth/osu">用 osu! 登录</a>}
            {load?.status === "ready" && (
              load.lineup.length
                ? <button type="button" className="client-key client-key--primary" disabled={mode === "edge" && !edgeLineup.length}
                    onClick={() => mode === "edge" ? setPreparation({ lineup: edgeLineup, practice: false }) : setLineup(load.lineup)}>
                    {mode === "edge" ? "战斗配装" : "开始战斗"}</button>
                : <a className="client-key" href="/?panel=deck">选择出战卡牌</a>
            )}
            <button type="button" className="client-key" onClick={() => mode === "edge"
              ? setPreparation({ lineup: practiceEdge, practice: true }) : setLineup(practiceLineup)}>演练</button>
            <button type="button" className="client-key" onClick={() =>
              setPreparation({ lineup: [sparringCards[0]], rivals: [sparringCards[1]], practice: true })}>斗蛐蛐</button>
            <a className="client-key" href={previewHref}>技能预览</a>
          </div>
        </section>
      </main>
    </div>
  )
}

function BattleBack({ href }: { href: string }) {
  const label = href === "/developer" ? "开发者工具" : href === "/?panel=deck" ? "卡组" : "牌桌"
  return <a className="battle-back" href={href}><RiArrowLeftLine size={19} aria-hidden />{label}</a>
}

function BattleArena({ lineup, backTo }: { lineup: Lineup; backTo: string }) {
  const [battle, setBattle] = useState(() => createBattle(lineup))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scene = useRef<HTMLDivElement>(null)
  const nextEffect = useRef(0)
  const active = battle.phase === "player"
  const team = teamHpOf(battle)
  const selected = battle.cards.find((card) => card.uid === selectedId)
    ?? battle.cards.find((card) => !card.down && !card.acted)
    ?? battle.cards[0]
  const selectedIndex = battle.cards.indexOf(selected)
  const canAct = active && !selected.acted && !selected.down
  const hasTank = battle.cards.some((card) => !card.down && card.subjob.tags.includes("tank"))

  useLayoutEffect(() => {
    const root = scene.current
    if (!feedback || !root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const animations: Animation[] = []
    const animate = (selector: string, frames: Keyframe[], duration: number, delay = 0) => {
      const target = root.querySelector(selector)
      if (target) animations.push(target.animate(frames, { duration, delay, easing: "cubic-bezier(.2,.65,.25,1)" }))
    }
    if (feedback.actor != null) {
      animate(`[data-fighter="${feedback.actor}"] .battle-fighter__portrait`, [
        { transform: "translateY(0)" },
        { transform: "translateY(-24px) scale(1.055)", offset: 0.37 },
        { transform: "translateY(0)" },
      ], 330)
    }
    if (feedback.allies.some(({ delta }) => delta < 0)) {
      animate(".battle-boss__shape", [
        { transform: "translateY(0)" },
        { transform: "translateY(20px) scale(1.1)", offset: 0.4 },
        { transform: "translateY(0)" },
      ], 330)
    }
    if (feedback.enemy < 0) {
      animate(".battle-boss__body", [
        { transform: "translateX(0)", filter: "brightness(1)" },
        { transform: "translateX(13px)", filter: "brightness(2.2)", offset: 0.17 },
        { transform: "translateX(-5px)", filter: "brightness(1.2)", offset: 0.49 },
        { transform: "translateX(0)", filter: "brightness(1)" },
      ], 270, feedback.actor == null ? 0 : 104)
    }
    for (const { uid, delta } of feedback.allies) {
      if (delta >= 0) continue
      animate(`[data-fighter="${uid}"] .battle-fighter__portrait`, [
        { transform: "translateX(0)", filter: "brightness(1)" },
        { transform: "translateX(-8px)", filter: "brightness(1.8)", offset: 0.22 },
        { transform: "translateX(0)", filter: "brightness(1)" },
      ], 260, 100)
    }
    return () => animations.forEach((animation) => animation.cancel())
  }, [feedback])

  const apply = (perform: (next: BattleState) => string | null, actor: number | null = null) => {
    const next = cloneBattle(battle)
    const message = perform(next)
    setBattle(next)
    setError(message)
    if (!message) setFeedback(makeFeedback(battle, next, actor, ++nextEffect.current))
  }

  const retry = () => {
    setBattle(createBattle(lineup))
    setSelectedId(null)
    setFeedback(null)
    setError(null)
  }

  return (
    <div className="battle-page battle-page--arena" ref={scene}>
      <header className="client-header battle-top">
        <BattleBack href={backTo} />
        <div className="battle-top__turn">回合 <b>{battle.turn}</b></div>
        <div className="battle-top__meter">
          <span>COMBO <b>{battle.combo}</b></span>
          <span><RiShieldLine size={15} aria-hidden /><b>{defenseLabels[battle.defenseTier]}</b></span>
        </div>
      </header>

      <main className="battle-field">
        <aside className="battle-intent-strip">
          <h2>意图</h2>
          {battle.enemy.intents.map((intent) => (
            <div key={intent.id} className="battle-intent" style={{ "--intent": ELEMENT_COLOR[intent.element] ?? "#c4afcd" } as CSSProperties}>
              <b>{intent.label}</b>
              <span>{ELEMENT_LABEL[intent.element] ?? intent.element} · {enemyDamageTier(intent)}</span>
            </div>
          ))}
          {battle.supports.length > 0 && <h2>支援</h2>}
          {battle.supports.map((support) => <span className="battle-support" key={support.id}>{support.name}</span>)}
        </aside>

        <section className="battle-boss" aria-label="敌人">
          <h1>{battle.enemy.name}</h1>
          <Health value={battle.enemy.hp} max={battle.enemy.hpMax} label="敌人生命" type="enemy" />
          <div className="battle-boss__shape">
            <div className="battle-boss__body"><Ghost /></div>
            {feedback && feedback.enemy !== 0 && <Delta key={feedback.id} value={feedback.enemy} delay={feedback.actor == null ? 0 : 104} />}
          </div>
        </section>

        <aside className="battle-record">
          <h2>战斗记录</h2>
          <div className="battle-record__entries" role="log">
            {battle.log.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
          </div>
        </aside>

        {feedback?.guard && <div key={feedback.id} className="battle-guard-flash" aria-hidden />}
        {!active && (
          <div className="battle-outcome" role="status">
            <strong>{battle.phase === "won" ? "战斗胜利" : "战斗失败"}</strong>
            <button type="button" className="client-key client-key--primary" onClick={retry}>再来一场</button>
          </div>
        )}
      </main>

      <section className="battle-lineup" aria-label="出战卡牌">
        <div className="battle-lineup__team">
          <span>队伍</span>
          <Health value={team.hp} max={team.max} label="队伍生命" type="ally" />
        </div>
        <div className="battle-hand">
          {battle.cards.map((card) => {
            const delta = feedback?.allies.find((hit) => hit.uid === card.uid)?.delta ?? 0
            return (
              <div className="battle-fighter" key={card.uid} data-fighter={card.uid} data-state={card.down ? "down" : card.acted ? "acted" : "ready"}>
                <div className="battle-fighter__portrait" inert>
                  <CardFace card={card.face} />
                </div>
                <Health value={card.stats.hp} max={card.stats.hpMax} label={`${card.name} 生命`} type="ally" />
                <button
                  type="button"
                  className="battle-fighter__select"
                  aria-label={card.name}
                  aria-pressed={selected.uid === card.uid}
                  onClick={() => setSelectedId(card.uid)}
                />
                {delta !== 0 && feedback && <Delta key={feedback.id} value={delta} delay={delta < 0 ? 100 : 0} />}
              </div>
            )
          })}
        </div>
      </section>

      <footer className="battle-controls">
        <div className="battle-controls__ap">
          <span>AP <b>{battle.ap}</b></span>
          <div className="battle-ap-blocks" aria-hidden>
            {Array.from({ length: battle.apMax }, (_, index) => <i key={index} data-full={index < battle.ap} />)}
          </div>
        </div>
        <div className="battle-controls__skills" aria-label="技能">
          <div className="battle-controls__identity">
            <b>{selected.name}</b><span>{selected.subjob.label}</span>
            <span>ATK {number.format(selected.stats.atk)} · DEF {number.format(selected.stats.def)} · INT {number.format(selected.stats.int)}</span>
          </div>
          <div className="battle-skills">
            {selected.skills.filter((skill) => !skill.passive).map((skill) => {
              const spent = skill.once && selected.usedOnce.includes(skill.id)
              return (
                <button
                  key={skill.id}
                  className="battle-skill"
                  type="button"
                  title={skill.desc}
                  disabled={!canAct || spent || battle.ap < skill.ap}
                  style={{ "--skill": ELEMENT_COLOR[skill.element] ?? "#c4afcd" } as CSSProperties}
                  onClick={() => apply((next) => playSkill(next, selectedIndex, skill.id), selected.uid)}
                >
                  <b>{skill.name}</b><span>{spent ? "已用" : `${skill.ap} AP`}</span>
                </button>
              )
            })}
          </div>
          <div className="battle-passives">
            {selected.skills.filter((skill) => skill.passive).map((skill) => <span key={skill.id} title={skill.desc}>{skill.name}</span>)}
          </div>
        </div>
        <div className="battle-controls__end">
          <div className="battle-defense" role="group" aria-label="防御">
            <RiShieldLine size={17} aria-hidden />
            {defenseLabels.slice(1).map((label, index) => {
              const tier = index + 1
              return (
                <button
                  key={label}
                  type="button"
                  className="client-key"
                  aria-label={`防御 ${label}`}
                  aria-pressed={battle.defenseTier === tier}
                  disabled={!active || tier <= battle.defenseTier || battle.ap < tier - battle.defenseTier || (tier === 4 && !hasTank)}
                  onClick={() => apply((next) => raiseDefense(next, tier))}
                >{label}</button>
              )
            })}
          </div>
          <button type="button" className="client-key client-key--primary battle-end" disabled={!active} onClick={() => apply(endTurn)}>
            结束回合
          </button>
        </div>
        {error && <p className="battle-action-error" role="alert">{error}</p>}
      </footer>
    </div>
  )
}
