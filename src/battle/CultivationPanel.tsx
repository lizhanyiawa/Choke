import { useMemo, useState } from "react"
import { GROWTH, GROWTH_MODS, JOBS, JOB_LABEL, masteryLevel, MOD_COMBOS, modCombos, modSlots, RANK_EFFECT_NAMES, RANK_UNLOCKS, rankOf, titleDescription, type CultivationProfile } from "@/card/cultivation"
import { expToNext, levelCap } from "@/card/progression"
import { RARITY_LABEL } from "@/card/data"
import { createEdgeBattle, MOVE_REACH } from "./edgeBattle"
import type { EdgeInputCard } from "./edgeSkills/catalog"
import type { GrowthAction } from "./cultivationApi"
import "./cultivation.css"

export function CultivationPanel({ card, profile, exp, practice, busy, onAction, onDemo }: {
  card: EdgeInputCard; profile: CultivationProfile; exp: number; practice: boolean; busy: boolean
  onAction: (action: GrowthAction) => void; onDemo: (level: number, rank: number) => void
}) {
  const [slot, setSlot] = useState(0)
  const fighter = useMemo(() => createEdgeBattle([card]).team[0], [card])
  const growth = fighter.growth!, rank = rankOf(card.face.constellation), hero = !!card.face.isHero
  const mods = modSlots(profile.equipment[card.uid])
  const title = profile.title
  const effectStages = RANK_UNLOCKS[card.face.rarity]
  let effect = 0
  return <section className="cultivation client-panel" aria-label="卡牌培养">
    <div className="cultivation__heading"><div><small>GROWTH / {JOB_LABEL[card.face.job]}</small><h2>卡牌培养</h2></div><b>训练点 {profile.training} · PvE 胜利 {profile.clears}</b></div>
    {practice && <p>练习沙盒：自由试配，无培养奖励。正式卡组的培养数据保存在账号中。</p>}
    <div className="cultivation__stats" aria-label="实战属性">
      <span>ATK <b>{fighter.card.stats.atk}</b></span><span>DEF <b>{fighter.card.stats.def}</b></span><span>HP <b>{fighter.maxHp}</b></span>
      <span>SPD <b>{growth.spd.toFixed(1)}</b></span><span>行动间隔 <b>{fighter.actionCooldown.toFixed(2)} s</b></span>
      <span>移动上限 <b>{Math.round(MOVE_REACH * (1 + growth.reach))}</b></span><span>移动速度 <b>{fighter.speed.toFixed(0)} /s</b></span>
      <span>暴击 <b>{fighter.card.stats.crit.toFixed(1)}%</b></span><span>暴伤 <b>{(fighter.card.stats.critDamage * 100).toFixed(0)}%</b></span>
      <span>治疗 <b>+{growth.heal} / +{(growth.healPct * 100).toFixed(0)}%</b></span><span>自然恢复 <b>{(growth.regen * 100).toFixed(2)}% HP/s</b></span>
    </div>
    <div className="cultivation__actions">
      <label>等级 {practice ? <input aria-label="练习等级" type="number" min={1} max={levelCap(hero)} value={card.face.level}
        onChange={event => onDemo(Number(event.target.value), rank)} /> : <b>{card.face.level} / {levelCap(hero)}</b>}</label>
      {!practice && <button type="button" className="client-key" disabled={busy || card.face.level >= levelCap(hero) || exp < expToNext(card.face.level, card.face.rarity, hero)} onClick={() => onAction({ action: "level", uid: card.uid })}>升级 · {exp} / {expToNext(card.face.level, card.face.rarity, hero)} EXP</button>}
      <label>阶数 {practice ? <select aria-label="练习阶数" value={rank} onChange={event => onDemo(card.face.level, Number(event.target.value))}>
        {[0, 1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} 阶</option>)}</select> : <b>{rank} / 5</b>}</label>
      {!practice && <button type="button" className="client-key" disabled={busy || rank >= 5 || profile.training < GROWTH.rankCosts[rank]} onClick={() => onAction({ action: "rank", uid: card.uid })}>进阶 · {rank >= 5 ? "MAX" : GROWTH.rankCosts[rank] + " 训练点"}</button>}
    </div>
    {card.face.constellation > 5 && <p>旧存档 {card.face.constellation} 星已保留；新机制按五阶生效，旧数值加成继续保留。</p>}
    <ol className="cultivation__ranks" aria-label="五阶成长路线">{[1, 2, 3, 4, 5].map(step => {
      const text = effectStages.includes(step) ? RANK_EFFECT_NAMES[card.face.job][effect++] : "数值阶：SPD +9，保留阶数属性收益"
      return <li key={step} data-unlocked={rank >= step}><b>{step} 阶</b><span>{text}</span></li>
    })}</ol>
    <div className="cultivation__title">
      <label>全队称号<select aria-label="全队称号" value={title ?? ""} disabled={busy} onChange={event => onAction({ action: "title", title: event.target.value as typeof title || null })}>
        <option value="">不装备</option>{JOBS.map(job => <option key={job} value={job} disabled={!practice && !masteryLevel(profile.mastery[job])}>{JOB_LABEL[job]} · Lv.{masteryLevel(profile.mastery[job])} ({profile.mastery[job]} EXP)</option>)}
      </select></label><b>{titleDescription(profile)}</b>
      <small>同时只装备一个，影响所有队员。每次正式 PvE 胜利为每个出战职业 +25 熟练度（不按同职业卡数重复）。满级：战斗 +18% 暴击 / +45% 暴伤，坦克 18% 免伤，法师 +24% 移速，辅助 0.8% HP/s。</small>
    </div>
    <h3>战斗 Mod · 三槽 / 拆卸 / 转移</h3>
    <p>每种 Mod 是一件独立物品，同卡不能重复；普通词条为 ATK / DEF / HP，稀有 Mod 才提供暴击、治疗、SPD 或自然恢复。H 为受益者最大生命，D 为出手者技能基值。</p>
    <div className="cultivation__actions" role="group" aria-label="Mod 装备槽">{mods.map((_, i) => <button type="button" key={i} className="client-key" aria-pressed={slot === i} onClick={() => setSlot(i)}>槽 {i + 1} · {GROWTH_MODS.find(mod => mod.id === mods[i])?.name ?? "空"}</button>)}
      <button type="button" className="client-key" disabled={busy || !mods[slot]} onClick={() => onAction({ action: "unequip", uid: card.uid, slot })}>拆下所选 Mod</button></div>
    <div className="cultivation__mods">{GROWTH_MODS.map(mod => {
      const owned = profile.inventory.includes(mod.id), equipped = mods.includes(mod.id)
      const holder = Object.entries(profile.equipment).find(([uid, ids]) => Number(uid) !== card.uid && ids.includes(mod.id))?.[0]
      return <button key={mod.id} type="button" className="edge-prep__skill" data-rare={mod.rare} aria-pressed={equipped}
        disabled={busy || !owned && (profile.clears < mod.clears || profile.training < mod.cost)}
        onClick={() => onAction(owned ? { action: "equip", uid: card.uid, mod: mod.id, slot } : { action: "buy", mod: mod.id })}>
        <b><i className="cultivation__mod-code">{mod.code}</i> {mod.rare ? "稀有 · " : ""}{mod.name}</b><small>{mod.description}</small>
        <span>{equipped ? "已装备" : holder ? "从另一张卡转移" : owned ? "装备到槽 " + (slot + 1) : `${mod.clears} 次胜利解锁 · ${mod.cost} 训练点`}</span>
      </button>
    })}</div>
    <h3>三件联动</h3>
    <div className="cultivation__combos">{MOD_COMBOS.map(combo => <article key={combo.id} data-active={modCombos(mods).includes(combo)}>
      <b>{modCombos(mods).includes(combo) ? "已激活 · " : ""}{combo.name}</b>
      <small>{combo.mods.map(id => GROWTH_MODS.find(mod => mod.id === id)!.code).join(" + ")}</small><p>{combo.description}</p>
    </article>)}</div>
    <details><summary>规则与稀有度：{RARITY_LABEL[card.face.rarity]}</summary><p>等级沿用原曲线与经验；属性先计算等级和阶数，再加固定 Mod，最后乘百分比之和。ATK Mod 同时作用于魔法攻击。治疗固定值按每次非衍生治疗添加，再乘 Heal%，最后计算战斗中的治疗修正。自然恢复按最大生命 / 秒计算，受禁疗和场外限制。</p>
      <p>SPD = (阶数 × 9 + 固定 SPD) × (1 + SPD%)，上限 100。行动加速上限 30%，移动距离加成上限 20%，移动速度加成上限 25%；称号移速另计，公共冷却不缩短。只保留两主动、两被动和可选黄金搭配。</p></details>
  </section>
}
