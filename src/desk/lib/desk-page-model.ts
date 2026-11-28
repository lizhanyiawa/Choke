import type { ApiUserCard, ItemWallet } from "@/desk/session/api"
import type { DeskObjectId } from "@/desk/lib/objects"
import { EVENT_POOLS, POOL_META } from "@/desk/lib/rarity"
import type { DeskItem, PackPool } from "@/desk/lib/types"

export const POOL_KEY = "choke.pool"

/** 桌面卡池 → 服务端卡池 id（现在两边同名，保留映射方便以后改名） */
export const SERVER_POOL: Record<PackPool, string> = {
  normal: "normal",
  golden: "golden",
  radiant: "radiant",
  sky: "sky",
  prism: "prism",
  starter: "starter",
}

/** 读上次选的卡池；旧存档里的 quest 统一迁移到 golden。 */
export function readSavedPool(): PackPool {
  const saved = localStorage.getItem(POOL_KEY)
  const normalized = saved === "quest" ? "golden" : saved
  // 活动包可能已经开完，不作为记住的卡池
  return normalized && normalized in POOL_META && !EVENT_POOLS.includes(normalized as PackPool)
    ? (normalized as PackPool)
    : "normal"
}

export type CardRow = Omit<
  ApiUserCard,
  "userCardId" | "level" | "constellation" | "exp" | "foil"
>

export interface DeskUser {
  id: string
  username: string
  publicId: number | null
  avatarUrl: string | null
  essence: number
  coins: number
  expPool?: number
  items?: ItemWallet
  hero: ApiUserCard | null
  onboarded: boolean
}

/** 松手那一刻物件的位置和姿态，飞行动画从这里接手 */
export interface FlightSource {
  left: number
  top: number
  viewportLeft: number
  viewportTop: number
  transform: string
  transformOrigin: string
}

/** 飞行落点：物件左上角在桌面里的坐标；scale 是落地时的缩放，fade 为 true 时边飞边淡出 */
export interface FlightSlot {
  left: number
  top: number
  scale?: number
  fade?: boolean
}

/** 每个物件一个轻微的固定角度，让桌面看起来是随手摆放的 */
export function tiltOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ((h % 7) - 3) * 0.8
}

/** 卡只能收进卡册，卡包只能放回纸盒 */
export function acceptsDrop(target: DeskObjectId | undefined, item: DeskItem) {
  return (
    (target === "album" && item.kind === "card") ||
    (target === "backpack" && item.kind === "pack")
  )
}
