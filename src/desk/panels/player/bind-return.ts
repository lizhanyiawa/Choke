/**
 * 绑定 osu! 走完授权后，服务端把浏览器带回 `/home?bind=linked|choose|error&reason=…`。
 * 页面一加载就把结果记下来并从地址栏抹掉（刷新不会重复提示），账号面板打开时取一次。
 */
export interface BindReturn {
  result: "linked" | "choose" | "error"
  reason: string | null
}

function capture(): BindReturn | null {
  if (typeof window === "undefined") return null
  const url = new URL(window.location.href)
  const result = url.searchParams.get("bind")
  if (result !== "linked" && result !== "choose" && result !== "error") return null
  const reason = url.searchParams.get("reason")
  url.searchParams.delete("bind")
  url.searchParams.delete("reason")
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  return { result, reason }
}

const captured = capture()
let consumed = false

/** 这次页面加载是不是从绑定授权回来的（桌面据此直接翻开账号面板） */
export function hasBindReturn(): boolean {
  return captured !== null
}

/** 账号面板读一次；之后不再返回 */
export function peekBindReturn(): BindReturn | null {
  return consumed ? null : captured
}

export function markBindReturnConsumed() {
  consumed = true
}

const ERROR_REASONS: Record<string, string> = {
  already_linked: "这个账号已经绑定过 osu! 了",
  session_changed: "授权回来时登录的账号变了，为了安全这次绑定已取消，请重新绑定",
  unknown_user: "找不到当前账号，请重新登录后再试",
  unauthorized: "请先登录，再绑定 osu!",
}

export function bindErrorText(reason: string | null): string {
  return (reason && ERROR_REASONS[reason]) || "绑定没有成功，请稍后再试"
}
