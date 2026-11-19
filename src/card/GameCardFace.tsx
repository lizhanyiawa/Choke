import { useTheme } from "@/components/theme-provider"
import { CardFaceB2 } from "./CardFaceB2"
import type { CardFaceData } from "./types"

interface Props {
  card: CardFaceData
  className?: string
  /** 书里的邻页提前加载，避免翻过去时才开始请求插画 */
  eager?: boolean
}

/**
 * 游戏里所有显示卡面的地方（卡册、图鉴、卡组、桌面、开包、背包、详情、市场、战斗、账号）都用这一张：
 * 当前是 B v3 · Gemini 修版（本体徽章 / 断图回退 / 100px 容器查询），卡纸跟随亮 / 暗主题，MOD 摆在名字后面。
 * 换游戏卡面改这里，同时把 faces/ 里对应版本的 faceMeta.inGame 挪过去（实验室靠它排第一）。
 */
export function GameCardFace(props: Props) {
  const { resolvedTheme } = useTheme()
  return <CardFaceB2 {...props} tone={resolvedTheme} mods="name" version="v2" />
}
