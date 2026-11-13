/** 邀请函：召唤事件 + 本地记忆（拆过没有、放在哪、收没收进抽屉、解锁过的成就）。成就只存在本机，没有后端。 */

/** 背包等处请求把邀请函从桌面底边重新弹出来 */
export const INVITE_OPEN_EVENT = "choke:invite-open"

const OPENED_KEY = "choke.invite.opened"
const POS_KEY = "choke.invite.pos"
const STOWED_KEY = "choke.invite.stowed"
const ACHIEVEMENTS_KEY = "choke.achievements"

export const ACHIEVEMENTS = {
  "invite-toss": "扔不掉的邀请函",
} as const

export type AchievementId = keyof typeof ACHIEVEMENTS

export function readInviteOpened() {
  return localStorage.getItem(OPENED_KEY) === "1"
}

export function markInviteOpened() {
  localStorage.setItem(OPENED_KEY, "1")
}

/** 信封左上角在桌面里的位置，按桌面宽高的比例存 */
export function readInvitePos(): { x: number; y: number } | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(POS_KEY) ?? "null")
    if (
      value &&
      typeof value === "object" &&
      "x" in value &&
      "y" in value &&
      typeof value.x === "number" &&
      typeof value.y === "number" &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y)
    ) {
      return { x: value.x, y: value.y }
    }
  } catch {
    // 坏数据当没存过
  }
  return null
}

export function saveInvitePos(pos: { x: number; y: number } | null) {
  if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos))
  else localStorage.removeItem(POS_KEY)
}

/** 信收在桌沿的抽屉里：收着时不再从底边自动弹出 */
export function readInviteStowed() {
  return localStorage.getItem(STOWED_KEY) === "1"
}

export function saveInviteStowed(stowed: boolean) {
  if (stowed) localStorage.setItem(STOWED_KEY, "1")
  else localStorage.removeItem(STOWED_KEY)
}

function readAchievements(): AchievementId[] {
  try {
    const value = JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) ?? "[]") as unknown
    return Array.isArray(value)
      ? value.filter((id): id is AchievementId => typeof id === "string" && id in ACHIEVEMENTS)
      : []
  } catch {
    return []
  }
}

export function hasAchievement(id: AchievementId) {
  return readAchievements().includes(id)
}

/** 解锁成就；第一次解锁返回 true */
export function unlockAchievement(id: AchievementId) {
  const list = readAchievements()
  if (list.includes(id)) return false
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify([...list, id]))
  return true
}
