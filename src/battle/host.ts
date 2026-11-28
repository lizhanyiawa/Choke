import type { ReactNode } from "react"
import type { BattleState } from "@choke/shared/battle/types"

/**
 * 战斗舞台被别的流程（比如远征）嵌进去时，由宿主接管的几件事。
 * 舞台本身不知道宿主是谁：不传就是原来的独立战斗页（回桌面、再来一场）。
 */
export interface BattleHostHooks {
  /** 左上角"桌面"按钮的文字和点击行为 */
  exitLabel: string
  onExit: () => void
  /** 顶栏的"重开"按钮；远征里战斗存档在服务端，不能重开。缺省显示 */
  canRestart?: boolean
  /** 结算层里的按钮，整体替换掉"再来一场 / 返回桌面" */
  resultActions?: ReactNode
  /** 结算层标题下面多说一句（比如远征里的星数、缺什么） */
  resultNote?: ReactNode
  /** 战斗中持续同步状态（远征里上传失败时显示在舞台顶部的横幅）；不传不显示 */
  syncNote?: ReactNode
}

export interface BattleExit {
  href: string
  label: string
}

export const DESK_BATTLE_EXIT: BattleExit = { href: "/home", label: "桌面" }
/** 教学战顶部实时 4 步战术教练提示，随战局自动切换 */
export function tutorialBattleHint(battle: BattleState): string | null {
  if (battle.phase !== "player") return null
  if (battle.ap === 0) {
    return "💡 教学提示 [4/4]：AP 用完了，点右下角「结束回合」让敌方行动，下回合会自动恢复 AP。"
  }
  const hasIncomingAttack = battle.enemy.intents.some(
    (intent) =>
      intent.kind === "attack" ||
      intent.kind === "magic" ||
      intent.kind === "heavy_phys" ||
      intent.kind === "heavy_magic",
  )
  if (hasIncomingAttack && battle.defenseTier === 0 && battle.turn >= 1 && battle.combo >= 1) {
    return "💡 教学提示 [3/4]：敌方本回合有攻击意图！可点「防御」消耗 1 AP 抬高防御档位（全队减伤并防击倒）。"
  }
  if ((battle.enemy.shield ?? 0) > 0 && battle.hiddenFound.length === 0) {
    return "💡 教学提示 [2/4]：用克制属性技能打掉敌方弱点盾可大幅增伤；弱点里的“？”是隐藏弱点（幽灵怕火），打中一次就会揭开。"
  }
  if (battle.combo === 0) {
    return "💡 教学提示 [1/4]：先点下方卡牌选技能出招！每次命中会叠加 Combo 增伤，注意左上角 AP 消耗。"
  }
  return "💡 教学提示：继续出招或抬防，击破幽灵即可完成教学！"
}
