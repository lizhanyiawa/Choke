import type { BattleAction } from "../battle/actions"
import type { EncounterSpec, EncounterSummary } from "../battle/content"
import type { ExpeditionAllocation } from "../expedition-points"
import type { CardFaceData } from "../types"
import type { EventOption, MapDef, MapNode, Reward, StoryLine } from "./content"
import type { DifficultyStatus } from "./difficulty"

/** 接口返回的出征视图：前端只靠它画界面，规则全在服务端 */

/** 进行中 / 挂起（保存并退出）算「未结束」；其余是终态 */
export type ExpeditionStatus = "active" | "suspended" | "settled" | "abandoned" | "expired"

/** 怎么结束的 */
export type ExpeditionEnd = "cleared" | "early" | "abandoned" | "expired"

export interface ExpeditionPoolCard {
  userCardId: number
  face: CardFaceData
  /** 出征开始时该卡的当前经验快照；旧记录缺省时前端按 0 展示 */
  exp?: number
}

export type BattleStatus = "preparing" | "fighting" | "won" | "lost"

export interface ExpeditionBattleView {
  nodeId: string
  status: BattleStatus
  encounter: EncounterSpec
  /** 这场战斗的种子：重试不换 */
  seed: string
  apMax: number
  /** 开场时队伍血量占最大生命的比例 */
  hpRatioStart: number
  /** 上场卡的 userCardId，按槽位顺序；还没选阵容时为空 */
  lineup: number[]
  bench: number[]
  /** 到现在为止服务端认可的全部操作；前端拿它重放出当前局面 */
  actions: BattleAction[]
  retries: number
  /** 通关后的星数；没打赢是 null */
  stars: number | null
}

export interface ExpeditionStoryView {
  nodeId: string
  title: string
  lines: StoryLine[]
}

/** 事件节点：选项的效果公开给玩家看（事件不是靠蒙的） */
export interface ExpeditionEventView {
  nodeId: string
  title: string
  text: string
  options: EventOption[]
}

/** 地图每个格子的公开详情，与是否已到达或处理完无关 */
export interface ExpeditionNodePreview {
  nodeId: string
  title: string
  type: MapNode["type"]
  hint?: string
  threat?: number
  /** hp 是未按威胁档位放大的基础生命；弱点只包含公开属性 */
  encounter?: Pick<
    EncounterSummary,
    "name" | "title" | "tier" | "element" | "weaknesses" | "hp" | "summary"
  >
  event?: ExpeditionEventView
  story?: ExpeditionStoryView
  /** 只提示奖励何时确定，不包含掉落结果 */
  rewardHint?: string
}

/** 通关目标在结算时的达成情况 */
export interface ObjectiveResult {
  text: string
  met: boolean
}

export interface ExpeditionSettlement {
  end: ExpeditionEnd
  /** 实际发到账上的奖励（到期结算时附件走邮件，playerExp 直接加） */
  rewards: Reward
  stars: number
  maxStars: number
  /** 通关时的档位（没通关也记，方便统计） */
  tier: number
  /** 地图写了通关目标时才有；达成几个就是几颗通关星 */
  objectives: ObjectiveResult[]
  /** 到期结算时，奖励是通过邮件发的 */
  viaMail: boolean
}

export interface ExpeditionView {
  id: number
  status: ExpeditionStatus
  mapId: string
  map: MapDef
  /** 只含当前格、前方一步、身后一步的详情；更远的格子服务端不下发 */
  nodePreviews: Record<string, ExpeditionNodePreview>
  seed: string
  allocation: ExpeditionAllocation
  pool: ExpeditionPoolCard[]
  /** 现在站在哪个节点 */
  position: string
  /** 这个节点处理完了没有（打赢了 / 剧情看完了）；没处理完不能往下走 */
  nodeDone: boolean
  /** 能走的下一步（已经按标记过滤） */
  availableNext: string[]
  /** 走到了终点并且处理完：可以按「通关结算」 */
  atEnd: boolean
  flags: string[]
  /** 队伍血量占最大生命的比例，跨战斗保留 */
  hpRatio: number
  /** 到现在攒下的奖励（结算时一次性发） */
  pending: Reward
  stars: number
  maxStars: number
  startedAt: string
  expiresAt: string
  battle: ExpeditionBattleView | null
  story: ExpeditionStoryView | null
  event: ExpeditionEventView | null
  /** 当前难度：威胁值、档位、这一档的血量和掉落倍率、下一档要多少威胁值；前端直接展示，不用自己算 */
  difficulty: DifficultyStatus
  settlement: ExpeditionSettlement | null
}
