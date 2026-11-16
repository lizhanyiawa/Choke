import type { EdgeBattle, EdgeUnit } from "./edgeBattle"
import { attackRange } from "./edgeSkills/runtime"
import type { Buff } from "./edgeSkills/state"

type Tone = "attack" | "guard" | "move" | "control"
type Indicator = { kind: string; text: string; tone: Tone }

const colors: Record<Tone, string> = {
  attack: "#ffadca", guard: "#a7e7ff", move: "#d5b6ff", control: "#ffd49d",
}

function indicator(buff: Buff): Indicator | undefined {
  const { kind, values, style, cast } = buff
  const value = Math.round(values[0] ?? 0)
  const percent = value + "%"
  switch (kind) {
    case "q": return { kind, text: "普攻 +" + Math.round((values[0] ?? 0) * cast.basis), tone: "attack" }
    case "ampq": return { kind, text: "普攻 +" + percent, tone: "attack" }
    case "amp": return { kind, text: "伤害 +" + percent, tone: "attack" }
    case "qp": return { kind, text: "推距 +" + value, tone: "attack" }
    case "qr": case "range": return { kind, text: "射程 +" + value, tone: "attack" }
    case "choose": return { kind, text: "普攻扩散", tone: "attack" }
    case "score": return { kind, text: "谱印", tone: "attack" }
    case "guard": case "res": return { kind, text: "减伤 " + percent, tone: "guard" }
    case "anti": return { kind, text: "抗推 " + percent, tone: "guard" }
    case "split": return { kind, text: "分担 " + percent, tone: "guard" }
    case "defy": return { kind, text: "急救", tone: "guard" }
    case "returnhp": return { kind, text: "返还 " + percent, tone: "guard" }
    case "reflect": return { kind, text: "反击", tone: "guard" }
    case "exguard": return { kind, text: "挡出界", tone: "guard" }
    case "healamp": case "healrecv": return { kind, text: "治疗 +" + percent, tone: "guard" }
    case "phase": return { kind, text: "掠影", tone: "guard" }
    case "extend": return { kind, text: "移动距离 +" + value, tone: "move" }
    case "speed": return { kind, text: "移速 +" + percent, tone: "move" }
    case "hop": return { kind, text: "跳点", tone: "move" }
    case "slow": return { kind, text: "移速 −" + percent, tone: "control" }
    case "short": return { kind, text: "移动距离 −" + (style === "pct" ? percent : value), tone: "control" }
    case "root": return { kind, text: "定身", tone: "control" }
    case "tether": return { kind, text: "牵制", tone: "control" }
    case "armor": return { kind, text: "破甲 " + percent, tone: "control" }
    case "vuln": return { kind, text: "承伤 +" + percent, tone: "control" }
    case "weak": return { kind, text: "伤害 −" + percent, tone: "control" }
    case "dot": return { kind, text: "持续伤害", tone: "control" }
    case "taunt": return { kind, text: "挑衅", tone: "control" }
    case "stall": return { kind, text: "蓄力延后", tone: "control" }
    case "aimp": return { kind, text: "改变推向", tone: "control" }
  }
}

export function EdgePreviewFeedback({ battle, unit, radius }: { battle: EdgeBattle; unit: EdgeUnit; radius: number }) {
  if (!unit.hp) return null
  const buffs = battle.runtime.buffs.filter(({ target, until }) => target === unit.id && until > battle.time)
  const byKind = new Map<string, Indicator>()
  for (const buff of buffs) {
    const show = indicator(buff)
    if (show) byKind.set(show.kind, show)
  }
  if (unit.shield > 0 && unit.shieldUntil > battle.time) byKind.set("shield", { kind: "shield", text: "护盾 " + Math.round(unit.shield), tone: "guard" })
  if (battle.runtime.watches.some(({ target, until, uses }) => target === unit.id && until > battle.time && uses > 0)) {
    byKind.set("mark", { kind: "mark", text: "待触发", tone: "attack" })
  }
  const range = attackRange(battle, unit)
  const labels = [...byKind.values()].slice(-2)
  if (!labels.length && range <= unit.range) return null
  const dominant = labels.at(-1)
  const edge = radius + 16
  const tone = dominant?.tone
  return <g aria-hidden="true">
    {range > unit.range && <g fill="none" stroke={colors.attack} data-preview-range={range} opacity=".57">
      <circle r={unit.range} strokeWidth="2" strokeDasharray="5 11" />
      <circle r={range} strokeWidth="3.4" strokeDasharray="15 7" />
    </g>}
    {tone === "guard" && <path d={`M${-edge} -18v36l13 12 M${edge} -18v36l-13 12`}
      stroke={colors.guard} strokeWidth="4" fill="none" strokeLinecap="round" />}
    {tone === "attack" && <path d={`M${-edge + 8} -26v-15l11 9 M${edge - 8} -26v-15l-11 9`}
      stroke={colors.attack} strokeWidth="4" fill="none" strokeLinecap="round" />}
    {tone === "move" && <path d={`M${-edge} 21l13 10-13 10 M${edge} 21l-13 10 13 10`}
      stroke={colors.move} strokeWidth="3.5" fill="none" />}
    {tone === "control" && <circle r={edge} stroke={colors.control} strokeWidth="2.8" strokeDasharray="6 8" fill="none" />}
    {labels.map(({ kind, text, tone: color }, index) => {
      const width = Math.max(68, text.length * 15 + 10)
      const y = radius + 50 + index * 24
      return <g key={kind} data-preview-buff={kind} transform={`translate(0 ${y})`}>
        <rect x={-width / 2} y={-13} width={width} height={22} rx={5} fill="#24182e" stroke={colors[color]} strokeOpacity=".66" />
        <text className="edge-preview-unit-status" y={3} style={{ fill: colors[color] }}>{text}</text>
      </g>
    })}
  </g>
}
