import type { CardFaceData } from "@/card/types"

import {
  createBattleCard,
  teamHp,
  type BattleCard,
  type BattleState,
  type Enemy,
  type EnemyIntent,
  type StatusEffect,
  type SupportUnit,
} from "./types"

const ELEMENT_CYCLE = ["metal", "wood", "earth", "ice", "fire", "thunder", "light", "dark"] as const

const COMBO_BONUS = [1, 1, 1, 1.12, 1.26, 1.51, 1.77, 2.03, 2.29, 2.54, 2.8]

const ENEMY_ACTIONS: EnemyIntent[] = [
  { id: "claw", kind: "attack", label: "爪击", element: "physical", power: 0.95, hits: 1 },
  { id: "bolt", kind: "magic", label: "暗影弹", element: "dark", power: 1.1, hits: 1 },
  { id: "crush", kind: "heavy", label: "重压", element: "physical", power: 1.6, hits: 1 },
  { id: "corrupt", kind: "debuff", label: "腐化", element: "dark", power: 0, hits: 0 },
  { id: "roar", kind: "buff", label: "咆哮", element: "dark", power: 0, hits: 0 },
]

function random(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function elementMultiplier(attack: string, defend: string): number {
  if (attack === "physical" || defend === "physical") return 1
  const ai = ELEMENT_CYCLE.indexOf(attack as (typeof ELEMENT_CYCLE)[number])
  const di = ELEMENT_CYCLE.indexOf(defend as (typeof ELEMENT_CYCLE)[number])
  if (ai < 0 || di < 0) return 1
  const diff = (ai - di + ELEMENT_CYCLE.length) % ELEMENT_CYCLE.length
  if (diff === 0) return 0.9
  if (diff === 1) return 1.25
  if (diff === 2) return 1.1
  if (diff === ELEMENT_CYCLE.length - 1) return 0.8
  if (diff === ELEMENT_CYCLE.length - 2) return 0.9
  return 1
}

function comboMultiplier(combo: number): number {
  const capped = Math.min(Math.max(combo, 0), 10)
  return COMBO_BONUS[capped] ?? 2.8
}

function mitigation(defence: number): number {
  return Math.min(defence / (defence + 10000), 0.7)
}

function defenseMultiplier(tier: number): number {
  return [0, 0.2, 0.4, 0.7, 0.9][Math.min(Math.max(tier, 0), 4)] ?? 0
}

function statusBonus(card: BattleCard, stat: "atk" | "int" | "def"): number {
  return card.statuses
    .filter((status) => status.stat === stat)
    .reduce((sum, status) => sum + status.amount, 0)
}

function statOf(card: BattleCard, stat: "atk" | "int" | "def"): number {
  let value = card.stats[stat]
  if (stat !== "def" && card.subjob.tags.includes("lowhp") && card.stats.hp / card.stats.hpMax < 0.3) {
    value *= 1.2
  }
  if (stat === "def" && card.subjob.tags.includes("tank")) {
    value *= 1.05
  }
  return Math.max(1, Math.round(value * (1 + statusBonus(card, stat))))
}

function alive(cards: BattleCard[]): BattleCard[] {
  return cards.filter((card) => !card.down && card.stats.hp > 0)
}

function log(state: BattleState, line: string) {
  state.log.unshift(line)
  state.log = state.log.slice(0, 16)
}

function enemyIntentsFor(turn: number): EnemyIntent[] {
  const first = ENEMY_ACTIONS[turn % ENEMY_ACTIONS.length]
  const second = ENEMY_ACTIONS[(turn + 2) % ENEMY_ACTIONS.length]
  const intents = [first, second]
  if (turn % 3 === 0) intents.push(ENEMY_ACTIONS[(turn + 4) % ENEMY_ACTIONS.length])
  return intents.map((intent, i) => ({ ...intent, id: `${intent.id}-${turn}-${i}` }))
}

function makeEnemy(): Enemy {
  return {
    name: "谱面幽灵",
    element: "dark",
    hp: 24000,
    hpMax: 24000,
    atk: 650,
    int: 700,
    def: 1200,
    intents: enemyIntentsFor(1),
    statuses: [],
    stun: 0,
    buff: 0,
  }
}

export interface BattleInputCard {
  uid: number
  cardId: string
  face: CardFaceData
}

export function createBattle(inputs: BattleInputCard[]): BattleState {
  const cards = inputs.map((input) => createBattleCard(input.face, input.uid, input.cardId))
  return {
    turn: 1,
    phase: "player",
    ap: 2,
    apMax: 7,
    combo: 0,
    defenseTier: 0,
    cards,
    supports: [],
    enemy: makeEnemy(),
    log: ["战斗开始", "敌方：谱面幽灵"],
    selectedCard: null,
  }
}

function enemyDefence(state: BattleState, magic: boolean): number {
  const base = magic ? state.enemy.int : state.enemy.def
  const bonus = state.enemy.statuses
    .filter((status) => status.stat === (magic ? "int" : "def"))
    .reduce((sum, status) => sum + status.amount, 0)
  return Math.max(1, Math.round(base * (1 + bonus)))
}

function applyDamageToEnemy(state: BattleState, card: BattleCard, skillPower: number, hits: number, element: string) {
  const magic = element !== "physical"
  const attack = statOf(card, magic ? "int" : "atk")
  const enemyDef = enemyDefence(state, magic)
  let total = 0

  for (let i = 0; i < hits; i += 1) {
    state.combo += 1
    const hitChance = card.stats.hit
    if (Math.random() * 100 > hitChance) {
      state.combo = Math.floor(state.combo / 2)
      log(state, `${card.name} 未命中，Combo 减半`)
      continue
    }
    const crit = Math.random() * 100 < card.stats.crit
    const damage = Math.round(
      attack *
        skillPower *
        comboMultiplier(state.combo) *
        elementMultiplier(element, state.enemy.element) *
        (1 - mitigation(enemyDef)) *
        random(0.95, 1.05) *
        (crit ? 1.5 : 1),
    )
    total += damage
    state.enemy.hp = Math.max(0, state.enemy.hp - damage)
    log(
      state,
      `${card.name} ${crit ? "暴击" : "命中"} ${damage.toLocaleString("en-US")}（Combo ${state.combo}）`,
    )
    if (state.enemy.hp <= 0) break
  }

  if (total > 0 && card.subjob.tags.includes("lifesteal")) {
    const heal = Math.round(total * 0.2)
    card.stats.hp = Math.min(card.stats.hpMax, card.stats.hp + heal)
    log(state, `${card.name} 吸血回复 ${heal.toLocaleString("en-US")}`)
  }

  if (state.enemy.hp <= 0) {
    state.phase = "won"
    log(state, "战斗胜利")
  }
}

function healCards(state: BattleState, cards: BattleCard[], amount: number) {
  let healed = 0
  for (const card of cards) {
    if (card.down) continue
    const before = card.stats.hp
    card.stats.hp = Math.min(card.stats.hpMax, card.stats.hp + amount)
    healed += card.stats.hp - before
  }
  if (healed > 0) log(state, `回复 ${healed.toLocaleString("en-US")} HP`)
}

function addStatus(card: BattleCard, status: StatusEffect) {
  const existing = card.statuses.find((item) => item.id === status.id && item.stat === status.stat)
  if (existing) {
    existing.turns = Math.max(existing.turns, status.turns)
    existing.amount = Math.max(existing.amount, status.amount)
  } else {
    card.statuses.push({ ...status })
  }
}

export function playSkill(state: BattleState, cardIndex: number, skillId: string): string | null {
  if (state.phase !== "player") return "战斗已经结束"
  const card = state.cards[cardIndex]
  if (!card || card.down) return "这张卡已经下场"
  if (card.acted) return "这张卡本回合已经行动过"
  const skill = card.skills.find((item) => item.id === skillId)
  if (!skill || skill.passive) return "这不是主动技能"
  if (skill.once && card.usedOnce.includes(skill.id)) return "这个技能本场已经用过"
  if (state.ap < skill.ap) return `AP 不足（需要 ${skill.ap}）`

  state.ap -= skill.ap
  card.acted = true
  if (skill.once) card.usedOnce.push(skill.id)
  if (skill.mp) {
    // MP 资源先简化成不影响本回合行动，只记录在日志
    log(state, `${card.name} 消耗 ${skill.mp} MP`)
  }

  const magic = skill.element !== "physical"
  const attack = statOf(card, magic ? "int" : "atk")

  switch (skill.kind) {
    case "damage":
      applyDamageToEnemy(state, card, skill.power ?? 1, skill.hits ?? 1, skill.element)
      break
    case "heal": {
      if (skill.id.includes("revive")) {
        const downed = state.cards.find((item) => item.down)
        if (downed) {
          downed.down = false
          downed.stats.hp = Math.round(downed.stats.hpMax * 0.5)
          log(state, `${card.name} 救回了 ${downed.name}`)
          break
        }
      }
      const targetCard =
        skill.target === "ally"
          ? [...alive(state.cards)].sort((a, b) => a.stats.hp / a.stats.hpMax - b.stats.hp / b.stats.hpMax)[0] ?? card
          : card
      const targets = skill.target === "team" ? alive(state.cards) : [targetCard]
      const amount = Math.round(attack * (skill.power ?? 0.5))
      healCards(state, targets, amount)
      break
    }
    case "guard": {
      const tier = Math.min(4, state.defenseTier + (skill.power ?? 1))
      state.defenseTier = tier
      log(state, `${card.name} 提升防御档位至 ${["0", "I", "II", "III", "IV"][tier]}`)
      break
    }
    case "taunt":
      card.taunt = true
      log(state, `${card.name} 嘲讽敌方单体攻击`)
      break
    case "buff": {
      const targets = skill.target === "team" ? alive(state.cards) : [card]
      for (const target of targets) {
        addStatus(target, {
          id: skill.id,
          name: skill.name,
          stat: skill.stat ?? "atk",
          amount: skill.amount ?? 0.1,
          turns: skill.turns ?? 1,
        })
      }
      log(state, `${card.name} 施放 ${skill.name}`)
      break
    }
    case "debuff": {
      state.enemy.statuses.push({
        id: skill.id,
        name: skill.name,
        stat: skill.stat,
        amount: skill.amount ?? 0.1,
        turns: skill.turns ?? 2,
      })
      log(state, `${card.name} 对敌方施放 ${skill.name}`)
      break
    }
    case "control":
      state.enemy.stun = Math.max(state.enemy.stun, skill.turns ?? 1)
      log(state, `${card.name} 控制住敌方，下一次行动被取消`)
      break
    case "ap":
      state.ap = Math.min(state.apMax, state.ap + (skill.amount ?? 1))
      log(state, `${card.name} 回复 ${skill.amount ?? 1} AP`)
      break
    case "summon": {
      const support: SupportUnit = {
        id: `support-${state.supports.length + 1}`,
        name: `${card.name} 的召唤物`,
        element: skill.element,
        atk: attack,
        power: skill.power ?? 0.5,
        hits: 1,
      }
      state.supports.push(support)
      log(state, `${card.name} 召唤了侧面支援`)
      break
    }
    case "passive":
      break
  }

  if (state.enemy.hp <= 0) {
    state.phase = "won"
  }
  return null
}

export function raiseDefense(state: BattleState, targetTier: number): string | null {
  if (state.phase !== "player") return "战斗已经结束"
  const hasTank = alive(state.cards).some((card) => card.subjob.tags.includes("tank"))
  const maxTier = hasTank ? 4 : 3
  if (targetTier <= state.defenseTier) return "只能升档"
  if (targetTier > maxTier) return hasTank ? "最高 IV 档" : "非坦克最高 III 档"
  const cost = targetTier - state.defenseTier
  if (state.ap < cost) return `AP 不足（需要 ${cost}）`
  state.ap -= cost
  state.defenseTier = targetTier
  log(state, `防御档位提升至 ${["0", "I", "II", "III", "IV"][targetTier]}`)
  return null
}

function runSupports(state: BattleState) {
  for (const support of state.supports) {
    state.combo += 1
    const damage = Math.round(
      support.atk *
        support.power *
        comboMultiplier(state.combo) *
        elementMultiplier(support.element, state.enemy.element) *
        (1 - mitigation(state.enemy.int)) *
        random(0.95, 1.05),
    )
    state.enemy.hp = Math.max(0, state.enemy.hp - damage)
    log(state, `${support.name} 支援攻击 ${damage.toLocaleString("en-US")}（Combo ${state.combo}）`)
    if (state.enemy.hp <= 0) {
      state.phase = "won"
      return
    }
  }
}

function runPreemptive(state: BattleState) {
  for (const card of alive(state.cards)) {
    if (!card.subjob.tags.includes("swift")) continue
    if (Math.random() > 0.04) continue
    state.combo += 1
    const damage = Math.round(
      statOf(card, "atk") *
        0.7 *
        comboMultiplier(state.combo) *
        elementMultiplier("physical", state.enemy.element) *
        (1 - mitigation(state.enemy.def)) *
        random(0.95, 1.05),
    )
    state.enemy.hp = Math.max(0, state.enemy.hp - damage)
    log(state, `${card.name} 抢攻 ${damage.toLocaleString("en-US")}（Combo ${state.combo}）`)
    if (state.enemy.hp <= 0) {
      state.phase = "won"
      return
    }
  }
}

function enemyAttack(
  state: BattleState,
  intent: EnemyIntent,
  target: BattleCard,
) {
  const magic = intent.element !== "physical"
  const attack = (magic ? state.enemy.int : state.enemy.atk) * (1 + state.enemy.buff)
  const defence = statOf(target, magic ? "int" : "def")
  let total = 0
  for (let i = 0; i < intent.hits; i += 1) {
    const damage = Math.round(
      attack *
        intent.power *
        elementMultiplier(intent.element, "physical") *
        (1 - mitigation(defence)) *
        (1 - defenseMultiplier(state.defenseTier)) *
        random(0.95, 1.05),
    )
    total += damage
    target.stats.hp = Math.max(0, target.stats.hp - damage)
    target.stats.poise = Math.max(0, target.stats.poise - Math.round(damage * 0.6))
    if (target.stats.hp <= 0) break
  }
  log(state, `${intent.label} 命中 ${target.name} ${total.toLocaleString("en-US")}`)
  if (target.stats.hp <= 0) {
    target.down = true
    log(state, `${target.name} 下场`)
  }
}

export function endTurn(state: BattleState): string | null {
  if (state.phase !== "player") return "战斗已经结束"

  state.combo = 0

  if (state.enemy.stun > 0) {
    state.enemy.stun -= 1
    log(state, "敌方被控制，本回合无法行动")
  } else {
    for (const intent of state.enemy.intents) {
      if ((state.phase as string) === "lost") break
      if (intent.kind === "buff") {
        state.enemy.buff = Math.min(0.6, state.enemy.buff + 0.2)
        log(state, "敌方攻击力提升")
        continue
      }
      if (intent.kind === "debuff") {
        const targets = alive(state.cards)
        const target = targets[Math.floor(Math.random() * targets.length)]
        if (target) {
          addStatus(target, {
            id: intent.id,
            name: "腐化",
            stat: "def",
            amount: -0.15,
            turns: 2,
          })
          log(state, `${target.name} 被腐化，DEF 下降`)
        }
        continue
      }
      const targets = alive(state.cards)
      const taunt = targets.find((card) => card.taunt)
      const target = taunt ?? targets[Math.floor(Math.random() * targets.length)]
      if (!target) break
      enemyAttack(state, intent, target)
    }
  }

  // 防御只保护本回合，结算完敌方行动后清空
  state.defenseTier = 0

  // 我方 DOT / 状态结算
  for (const card of state.cards) {
    if (card.down) continue
    for (const status of card.statuses) {
      if (status.id.startsWith("poison") || status.id.startsWith("burn")) {
        const loss = Math.round(card.stats.hpMax * 0.03)
        card.stats.hp = Math.max(0, card.stats.hp - loss)
        log(state, `${card.name} 受到 ${loss.toLocaleString("en-US")} 持续伤害`)
        if (card.stats.hp <= 0) {
          card.down = true
          log(state, `${card.name} 下场`)
        }
      }
      status.turns -= 1
    }
    card.statuses = card.statuses.filter((status) => status.turns > 0)
    if (card.subjob.tags.includes("regen") && !card.down) {
      card.stats.hp = Math.min(card.stats.hpMax, card.stats.hp + Math.round(card.stats.hpMax * 0.03))
    }
  }

  const living = alive(state.cards)
  if (living.length === 0) {
    state.phase = "lost"
    log(state, "战斗失败")
    return null
  }

  state.turn += 1
  const dancerBonus = living.some((card) => card.subjob.tags.includes("ap")) ? 1 : 0
  state.ap = Math.min(state.apMax, state.ap + 2 + dancerBonus)
  state.enemy.intents = enemyIntentsFor(state.turn)
  state.enemy.buff = Math.max(0, state.enemy.buff - 0.05)
  for (const status of state.enemy.statuses) status.turns -= 1
  state.enemy.statuses = state.enemy.statuses.filter((status) => status.turns > 0)
  for (const card of state.cards) {
    card.acted = false
    card.taunt = false
  }

  runSupports(state)
  if ((state.phase as string) !== "won") runPreemptive(state)
  if (state.phase === "player") {
    log(state, `第 ${state.turn} 回合开始`)
  }
  return null
}

export function cloneBattle(state: BattleState): BattleState {
  return structuredClone(state)
}

export function enemyDamageTier(intent: EnemyIntent): "低" | "中" | "高" {
  if (intent.kind === "heavy") return "高"
  if (intent.kind === "magic") return "中"
  if (intent.kind === "attack") return "低"
  return "中"
}

export function teamHpOf(state: BattleState) {
  return teamHp(state.cards)
}
