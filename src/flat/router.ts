import { useSyncExternalStore } from "react"

/**
 * 扁平界面自己的页面，路径都只有一段。
 * 还没搬过来的入口整页跳到家园（/home?panel=…）或远征页。
 */
export const FLAT_ROUTES = {
  home: "/",
  packs: "/packs",
  supply: "/supply",
  album: "/cards",
  deck: "/deck",
  codex: "/codex",
  backpack: "/backpack",
  quests: "/quests",
  shop: "/shop",
  market: "/market",
  more: "/more",
  expedition: "/expedition",
} as const

export const OWN_LISTINGS_PATH = `${FLAT_ROUTES.market}?view=own`

export type FlatRouteId = keyof typeof FLAT_ROUTES

export function matchFlatRoute(pathname: string): FlatRouteId | null {
  const path = pathname.replace(/\/+$/, "") || "/"
  for (const id of Object.keys(FLAT_ROUTES) as FlatRouteId[]) {
    if (FLAT_ROUTES[id] === path) return id
  }
  return null
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("popstate", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("popstate", listener)
  }
}

const currentPath = () => window.location.pathname
const currentSearch = () => window.location.search

/** 壳内换页：只换地址和主区的内容，不重新加载 */
export function navigate(to: string, options: { replace?: boolean } = {}) {
  const url = new URL(to, window.location.origin)
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash === window.location.hash) return
  if (options.replace) window.history.replaceState(null, "", url)
  else window.history.pushState(null, "", url)
  for (const listener of listeners) listener()
}

/** 现在在哪一页；地址对不上任何一页时按首页算 */
export function useRoute(): FlatRouteId {
  const path = useSyncExternalStore(subscribe, currentPath, currentPath)
  return matchFlatRoute(path) ?? "home"
}

/** 选包等同页地址变化也要响应浏览器前进 / 后退。 */
export function useRouteSearch() {
  return useSyncExternalStore(subscribe, currentSearch, currentSearch)
}
