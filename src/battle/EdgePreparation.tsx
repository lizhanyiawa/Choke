import { useEffect, useState } from "react"
import { RiArrowLeftLine } from "@remixicon/react"

import { RARITY_LABEL } from "@/card/data"
import { SUBJOBS, type SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { bounded, JOB_LABEL, JOBS, newCultivation, type CultivationProfile } from "@/card/cultivation"
import { fetchDeck, fetchMe, toFace } from "@/desk/api"
import { CultivationPanel } from "./CultivationPanel"
import { CombatRulesPanel } from "./CombatRulesPanel"
import { changeCultivation, fetchCultivation, startCultivation, type GrowthAction } from "./cultivationApi"

import { preparationEntry as entry, sandboxProfile, applyTeamCultivation, preparationTemplate } from "./preparationGrowth"

import { SPARRING_LIMIT } from "./edgeBattle"
import {
  EDGE_RARITIES, edgeJobOf, eligibleGold, equipSlot, poolForCard, saveLoadout, type EdgeInputCard, type EdgeLoadout,
} from "./edgeSkills/catalog"
import { EDGE_ROLE_DETAILS } from "./edgeSkills/roles"
import type { EdgeSide } from "./edgeSkills/state"
import "./edge-preparation.css"

type Slot = 0 | 1
type Entry = { card: EdgeInputCard; equipped: EdgeLoadout }


export function EdgePreparation({ lineup, practice, rivals, onBack, onStart }: {
  lineup: EdgeInputCard[]
  practice: boolean
  rivals?: EdgeInputCard[]
  onBack: () => void
  onStart: (lineup: EdgeInputCard[], rivals?: EdgeInputCard[]) => void
}) {
  const sparring = rivals !== undefined
  const [teams, setTeams] = useState(() => ({
    ally: lineup.map((card) => entry(card, sparring)),
    enemy: rivals?.map((card) => entry(card, sparring)) ?? [],
  }))
  const [nextSandboxUid, setNextSandboxUid] = useState(() => Math.min(0, ...lineup.map(card => card.uid), ...(rivals ?? []).map(card => card.uid)) - 1)
  const [{ side, index }, select] = useState<{ side: EdgeSide; index: number }>({ side: "ally", index: 0 })
  const [activeSlot, setActiveSlot] = useState<Slot>(0)
  const [passiveSlot, setPassiveSlot] = useState<Slot>(0)
  const current = teams[side][index]
  const pool = poolForCard(current.card)
  const job = edgeJobOf(current.card)
  const [profiles, setProfiles] = useState<Record<EdgeSide, CultivationProfile>>(() => ({
    ally: practice ? sandboxProfile(lineup) : newCultivation(),
    enemy: sandboxProfile(rivals ?? []),
  }))
  const profile = profiles[side]
  const [userId, setUserId] = useState<string | null>(null)
  const [growthReady, setGrowthReady] = useState(practice)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [experience, setExperience] = useState<Record<number, number>>({})

  function applyProfile(state: CultivationProfile, faces?: Map<number, EdgeInputCard["face"]>) {
    const target = sparring ? side : "ally"
    setProfiles(previous => ({ ...previous, [target]: state }))
    setTeams(previous => ({ ...previous, [target]: applyTeamCultivation(previous[target], state, faces) }))
  }
  async function refresh(id: string, state: CultivationProfile) {
    const deck = await fetchDeck(id)
    const cards = deck.slots.flatMap(slot => slot.card ? [slot.card] : [])
    setExperience(Object.fromEntries(cards.map(card => [card.userCardId, card.exp])))
    applyProfile(state, new Map(cards.map(card => [card.userCardId, toFace(card)])))
  }
  useEffect(() => {
    if (practice) return
    let cancelled = false
    fetchMe().then(async me => {
      const state = await fetchCultivation(me.id)
      if (cancelled) return
      setUserId(me.id); await refresh(me.id, state)
      if (!cancelled) setGrowthReady(true)
    }).catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : "培养数据加载失败") })
    return () => { cancelled = true }
    // Initial account load; subsequent updates use explicit refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practice])
  async function growthAction(action: GrowthAction) {
    if (busy) return
    setMessage(""); setBusy(true)
    try {
      if (!practice && userId) await refresh(userId, await changeCultivation(userId, action))
      else if (practice) {
        const next = structuredClone(profile)
        if (action.action === "rules") next.combatVersion = action.combatVersion
        else if (action.action === "title") next.title = action.title
        else if (action.action === "buy") { next.inventory.push(action.mod); next.training -= 100 }
        else if (action.action === "equip") {
          for (const [uid, mods] of Object.entries(next.equipment)) next.equipment[uid] = mods.map(id => id === action.mod ? "" : id)
          const mods = [...(next.equipment[action.uid] ?? ["", ""])]; mods[action.slot] = action.mod
          next.equipment[action.uid] = mods
        } else if (action.action === "unequip") {
          const mods = [...(next.equipment[action.uid] ?? ["", ""])]; mods[action.slot] = ""; next.equipment[action.uid] = mods
        }
        applyProfile(next)
      }
      setMessage("培养配置已保存")
    } catch (error) { setMessage(error instanceof Error ? error.message : "培养保存失败") }
    finally { setBusy(false) }
  }

  function replace(next: Entry) {
    setTeams((previous) => ({ ...previous, [side]: previous[side].map((item, i) => i === index ? next : item) }))
  }

  function change(next: EdgeLoadout) {
    if (!sparring) saveLoadout(current.card, next)
    replace({ ...current, equipped: next })
  }

  function template(subjob: SubJobId, rarity: Rarity, legacy = false) {
    const source = legacy ? { ...current, card: { ...current.card, edgePool: "legacy-v1" as const } } : current
    replace(preparationTemplate(source, subjob, rarity, sparring))
  }

  function addCard(to: EdgeSide) {
    if (teams[to].length >= SPARRING_LIMIT) return
    const index = teams[to].length
    const uid = nextSandboxUid
    setNextSandboxUid(uid - 1)
    const base = teams[to][0].card
    const card = { ...base, uid, cardId: "edge-sparring-" + uid, edge: undefined,
      face: { ...base.face, cultivation: { mods: [], title: { title: profiles[to].title, mastery: profiles[to].mastery } } } }
    setTeams((previous) => ({ ...previous, [to]: [...previous[to], entry(card, true)] }))
    select({ side: to, index })
  }

  function removeCard() {
    if (teams[side].length <= 1) return
    const removedUid = current.card.uid
    setProfiles(previous => {
      const equipment = { ...previous[side].equipment }
      delete equipment[removedUid]
      return { ...previous, [side]: { ...previous[side], equipment } }
    })
    setTeams((previous) => ({ ...previous, [side]: previous[side].filter((_, i) => i !== index) }))
    select({ side, index: Math.max(0, index - 1) })
  }

  async function start() {
    if (busy || !growthReady) return
    const cards = (team: Entry[]) => team.map(({ card, equipped }) => {
      if (!sparring && !practice) saveLoadout(card, equipped)
      return { ...card, edge: equipped }
    })
    if (practice || sparring) { onStart(cards(teams.ally), sparring ? cards(teams.enemy) : undefined); return }
    if (!userId) return
    setBusy(true); setMessage("")
    try { const result = await startCultivation(userId, cards(teams.ally)); onStart(result.lineup) }
    catch (error) { setMessage(error instanceof Error ? error.message : "战斗准备失败") }
    finally { setBusy(false) }
  }

  function members(team: EdgeSide) {
    return teams[team].map(({ card, equipped }, i) => (
      <button key={card.uid} type="button" className="edge-prep__member" aria-pressed={side === team && i === index}
        onClick={() => select({ side: team, index: i })}>
        <span className="edge-prep__avatar">{card.face.art && !practice ? <img src={card.face.art} alt="" /> : card.combatVersion === "four-v2" ? JOB_LABEL[card.face.job][0] : SUBJOBS[edgeJobOf(card)].label[0]}</span>
        <span title={card.combatVersion === "four-v2" ? "统一职业模板；战术由已装备技能激活" : EDGE_ROLE_DETAILS[edgeJobOf(card)]}><b>{card.face.name}</b><small>{practice ? "" : JOB_LABEL[card.face.job] + " · "}{RARITY_LABEL[card.face.rarity]}</small></span>
        {equipped.gold !== null && <i aria-label="已启用黄金搭配">✦</i>}
      </button>
    ))
  }

  return (
    <div className="battle-page edge-prep">
      <header className="client-header battle-top">
        <button type="button" className="battle-back" onClick={onBack}><RiArrowLeftLine size={19} aria-hidden />战斗大厅</button>
        <b>{sparring ? "斗蛐蛐" : practice ? "演练配装" : "战斗配装"}</b>
        <button type="button" className="client-key client-key--primary edge-prep__start" disabled={busy || !growthReady} onClick={() => void start()}>进入战场</button>
      </header>
      <main className="edge-prep__shell">
        <div className={"edge-prep__team client-panel" + (sparring ? " edge-prep__team--sparring" : "")} role="group" aria-label="出战卡牌">
          {sparring ? (["enemy", "ally"] as const).map((team) => {
            const label = team === "ally" ? "蓝方" : "粉方"
            return <section key={team} className="edge-prep__side" data-side={team} aria-label={label}>
              <div className="edge-prep__side-title">
                <h2>{label}</h2>
                <button type="button" className="client-key" aria-label={label + "加卡"} title="加卡"
                  disabled={teams[team].length >= SPARRING_LIMIT} onClick={() => addCard(team)}>＋</button>
              </div>
              {members(team)}
            </section>
          }) : members("ally")}
        </div>
        <div className="edge-prep__body">
          {practice && (
            <div className="edge-prep__template">
              <label title={EDGE_ROLE_DETAILS[job]}>职业<select className="client-select" value={current.card.face.job} onChange={(event) => template(({ warrior: "berserker", tank: "bulwark", mage: "warlock", support: "healer" } as const)[event.target.value as keyof typeof JOB_LABEL], current.card.face.rarity)}>
                {JOBS.map(id => <option key={id} value={id}>{JOB_LABEL[id]}</option>)}
              </select></label>
              <label>稀有度<select className="client-select" value={current.card.face.rarity} onChange={(event) => template(job, event.target.value as Rarity)}>
                {EDGE_RARITIES.map((rarity) => <option key={rarity} value={rarity}>{RARITY_LABEL[rarity]}</option>)}
              </select></label>
              {sparring && teams[side].length > 1 && <button type="button" className="client-key" onClick={removeCard}>移除卡牌</button>}
            </div>
          )}
          {message && <p className="cultivation-status" role="status">{message}</p>}
          {growthReady && <CombatRulesPanel card={{ ...current.card, edge: current.equipped }} busy={busy} onAction={action => void growthAction(action)} />}
          {sparring && <details className="cultivation__compat"><summary>高级兼容调试（旧技能资料）</summary><label className="cultivation__actions">{current.card.combatVersion === "four-v2" ? "技能档案来源（不改变新版职业模板）" : "旧战术模板（回退规则）"}
            <select className="client-select" value={job} onChange={event => template(event.target.value as SubJobId, current.card.face.rarity, true)}>
              {Object.values(SUBJOBS).map(tag => <option key={tag.id} value={tag.id}>{JOB_LABEL[tag.archetype]} · {tag.label}</option>)}
            </select>
          </label></details>}
          {sparring && <p>正在配置{side === "ally" ? "我方" : "敌方"}；称号和 Mod 库按双方独立计算，仅本次沙盒生效。</p>}
          {growthReady && <CultivationPanel card={{ ...current.card, edge: current.equipped }} profile={profile} exp={experience[current.card.uid] ?? 0}
            practice={practice} busy={busy} onAction={action => void growthAction(action)}
            onDemo={(level, rank) => replace({ ...current, card: { ...current.card, face: { ...current.card.face,
              level: Math.floor(bounded(level, 1, current.card.face.isHero ? 12 : 80)), constellation: Math.floor(bounded(rank, 0, 5)) } } })} />}
          <div className="cultivation__actions">
            <b>{JOB_LABEL[current.card.face.job]} · {pool.version === 2 ? "精选技能" : "旧配装兼容"}</b>
            <button type="button" className="client-key" onClick={() => {
              const card: EdgeInputCard = { ...current.card, edge: undefined, edgePool: pool.version === 2 ? "legacy-v1" : "curated-v1" }
              replace(entry(card, sparring))
            }}>{pool.version === 2 ? "查看旧配装" : "使用四职业精选池"}</button>
          </div>
          <div className="edge-prep__columns">
            {(["active", "passive"] as const).map((kind) => {
              const active = kind === "active"
              const slot = active ? activeSlot : passiveSlot
              const setSlot = active ? setActiveSlot : setPassiveSlot
              return (
                <section key={kind} className="edge-prep__column client-panel" aria-label={active ? "主动技能" : "被动技能"}>
                  <h2>{active ? "战技" : "被动"}</h2>
                  <div className="edge-prep__slots" role="group" aria-label={active ? "战技槽位" : "被动槽位"}>
                    {current.equipped[kind].map((chosen, i) => (
                      <button key={i} type="button" className="client-key" aria-pressed={i === slot} onClick={() => setSlot(i as Slot)}>
                        <kbd>{active ? ["E", "R"][i] : i + 1}</kbd>{pool[kind][chosen].name}
                      </button>
                    ))}
                  </div>
                  <div className="edge-prep__pool">
                    {pool[kind].map((skill, i) => {
                      const equippedSlot = current.equipped[kind].indexOf(i)
                      return (
                        <button key={skill.id} type="button" className="edge-prep__skill" aria-pressed={equippedSlot >= 0}
                          onClick={() => change(equipSlot(pool, current.equipped, kind, slot, i))}>
                          <span><b>{skill.name}</b>{equippedSlot >= 0 && <kbd>{active ? ["E", "R"][equippedSlot] : equippedSlot + 1}</kbd>}</span>
                          <small>{skill.description}</small>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
          <section className="edge-prep__gold client-panel" aria-label="黄金搭配">
            <h2>黄金搭配</h2>
            <div className="edge-prep__gold-grid">
              {pool.gold.map((gold, i) => (
                <button key={gold.id} type="button" className="edge-prep__skill" aria-pressed={current.equipped.gold === i}
                  disabled={!eligibleGold(pool, current.equipped, i)}
                  onClick={() => change({ ...current.equipped, gold: current.equipped.gold === i ? null : i })}>
                  <b>✦ {gold.name}</b>
                  <span>{pool.active[gold.active].name} + {pool.passive[gold.passive].name}</span>
                  <small>{gold.description}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
