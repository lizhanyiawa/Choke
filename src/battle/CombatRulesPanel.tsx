import { combatVersionOf, FOUR_JOB_COMBAT } from "@/card/combatRules"
import { JOB_LABEL } from "@/card/cultivation"
import { SUBJOBS, type SubJobId } from "@/card/jobs"
import { createEdgeBattle } from "./edgeBattle"
import { equippedCombatRoles } from "./combatRules"
import type { EdgeInputCard } from "./edgeSkills/catalog"
import { EDGE_ROLE_DETAILS } from "./edgeSkills/roles"
import type { GrowthAction } from "./cultivationApi"
import "./cultivation.css"

const TACTIC_NAMES: Partial<Record<SubJobId, string>> = { bulwark: "援护", warden: "压制", paladin: "护卫", spellbreaker: "断法",
  ranger: "远射", warlock: "法术追击", binder: "控制协作", assassin: "切入", bard: "回场合奏" }
export function CombatRulesPanel({ card, busy, onAction }: { card: EdgeInputCard; busy: boolean; onAction: (action: GrowthAction) => void }) {
  const current = combatVersionOf(card), next = current === "four-v2" ? "legacy-v1" : "four-v2"
  const fighter = createEdgeBattle([card]).team[0]
  const preview = createEdgeBattle([{ ...card, combatVersion: next }]).team[0]
  const metrics = (unit: typeof fighter) => [unit.maxHp, unit.card.stats.atk, unit.card.stats.def, unit.attack, unit.range, unit.actionCooldown.toFixed(2)]
  const before = metrics(fighter), after = metrics(preview)
  const tactics = equippedCombatRoles(fighter).filter(role => TACTIC_NAMES[role])
  return <section className="cultivation client-panel combat-rules" aria-label="战斗规则与迁移预览">
    <div className="cultivation__heading"><div><small>COMBAT RULES</small><h2>{current === "four-v2" ? "四职业新版 · V2" : "旧规则存档 · V1"}</h2></div><b>{JOB_LABEL[card.face.job]}</b></div>
    <p>{current === "four-v2" ? "同职业使用统一基础模板。战术效果只由已装备技能激活，旧职业来源不再提供额外属性或免费天赋。"
      : "已保留原属性模板、射程、冷却与原生天赋。可查看以下变化，再把全队切换到四职业新版；随时可恢复旧规则。"}</p>
    {current === "four-v2" && <p>职业机制：{FOUR_JOB_COMBAT[card.face.job].mechanic}</p>}
    <div className="combat-rules__compare" role="table" aria-label="规则切换属性预览">
      <div role="row"><b role="columnheader">切换预览</b>{["HP", "ATK", "DEF", "技能基值 D", "普攻射程", "行动间隔 / 秒"].map(label => <b key={label} role="columnheader">{label}</b>)}</div>
      <div role="row"><span role="rowheader">当前</span>{before.map((value,i) => <span role="cell" key={i}>{value}</span>)}</div>
      <div role="row"><span role="rowheader">{next === "four-v2" ? "新版" : "旧版"}</span>{after.map((value,i) => <span role="cell" key={i} data-changed={value !== before[i]}>{value}</span>)}</div>
    </div>
    <small>新版统一以 ATK 成长结算；D 显示技能说明中的实际伤害/治疗基值，便于比较旧版术攻差异。</small>
    <div className="cultivation__actions"><button className="client-key" type="button" disabled={busy} onClick={() => onAction({ action: "rules", combatVersion: next })}>
      {next === "four-v2" ? "全队应用四职业新版" : "全队恢复旧规则"}</button><small>保留等级、经验、阶数、Mod 和技能配装。已开始的战斗沿用开局规则。</small></div>
    <h3>{current === "four-v2" ? "当前配装激活的战术" : "当前原生战术"}</h3>
    {tactics.length ? <ul className="combat-rules__tactics">{tactics.map(role => <li key={role}>
      <b>{TACTIC_NAMES[role]}</b><span>{role === "ranger" && current === "four-v2" ? "装备远射战技或被动：战斗职业普攻射程 +116，并视为可被切入的后排；近处坦克/护卫可保护。" : ""}{EDGE_ROLE_DETAILS[role] ?? "棱彩合奏的回场响应由已装备的吟游技能触发。"}</span>
      {current === "four-v2" && <small>来自：{[...fighter.actives, ...fighter.passives, ...(fighter.gold ? [fighter.gold] : [])].filter(skill => skill.id.startsWith(role + "/")).map(skill => skill.name).join("、")}</small>}
    </li>)}</ul> : <p>没有额外原生战术；已装备技能按各自说明生效。</p>}
    {current === "legacy-v1" && <small>保留模板：{SUBJOBS[fighter.card.subjob.id].label}。这项旧规则信息用于迁移兼容，不新增培养层。</small>}
  </section>
}
