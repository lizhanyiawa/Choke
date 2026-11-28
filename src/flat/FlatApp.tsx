import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { playSfx } from "@/audio/sfx"
import { PageLoading } from "@/components/PageLoading"
import { useTheme } from "@/components/theme-provider"
import { useDeskSession } from "@/desk/session/useDeskSession"
import { refreshProgress, useProgressSynced, useTutorialProgress } from "@/tutorial/store"
import { featureLockHint } from "@/tutorial/unlocks"

import { AlbumPage } from "./cards/AlbumPage"
import { CardPageTabs } from "./cards/CardPages"
import { CodexPage } from "./cards/CodexPage"
import { DeckPage } from "./cards/DeckPage"
import { MarketPage } from "./market/MarketPage"
import { ExpeditionPage } from "./expedition/ExpeditionPage"
import { RAIL_EXTRA, RAIL_MAIN } from "./nav-items"
import { BackpackPage } from "./packs/BackpackPage"
import { PacksPage } from "./packs/PacksPage"
import { FlatContext, type FlatContextValue, type Notify } from "./context"
import { Sidebar, TabBar } from "./Nav"
import { HomePage } from "./pages/HomePage"
import { MorePage } from "./pages/MorePage"
import { QuestsPage } from "./quests/QuestsPage"
import { useRoute, type FlatRouteId } from "./router"
import { ShopPage } from "./shop/ShopPage"
import { SupplyPage } from "./supply/SupplyPage"
import { Topbar } from "./Topbar"

// 顶栏的等级条和邮箱按钮是桌面的（desk.css），控件是 bk-*（book.css），亮色的取值在 light.css。
// 现在它们跟着桌面一起进了主包；这里写明依赖，哪天桌面改成懒加载也不会丢样式。
import "@/desk/desk.css"
import "@/desk/book.css"
import "@/desk/light.css"
import "./flat.css"

const PAGES: Record<FlatRouteId, ComponentType> = {
  home: HomePage,
  packs: PacksPage,
  supply: SupplyPage,
  album: AlbumPage,
  deck: DeckPage,
  codex: CodexPage,
  backpack: BackpackPage,
  quests: QuestsPage,
  shop: ShopPage,
  market: MarketPage,
  expedition: ExpeditionPage,
  more: MorePage,
}

const PAGE_ITEMS = [...RAIL_MAIN, ...RAIL_EXTRA]

/** 进度多久取不回来就给「重试」 */
const SLOW_MS = 8000

/**
 * 扁平界面的入口。只给走完新手引导的玩家用：
 * 没登录、没领新手礼包、引导没走完的，都送回原来的桌面（登录、礼包和引导都在那边）。
 */
export function FlatApp() {
  const { user, userReady, userError, packState, packError, setPackState, refreshUser, refreshPacks, logout } = useDeskSession()
  const userId = user?.id ?? null
  const activeUserId = useRef<string | null>(null)
  useLayoutEffect(() => {
    activeUserId.current = userId
    return () => { activeUserId.current = null }
  }, [userId])
  const setPacks = useCallback((counts: Record<string, number>) => {
    if (userId && activeUserId.current === userId) setPackState({ userId, data: counts })
  }, [userId, setPackState])
  const reloadPacks = useCallback(() => {
    if (userId && activeUserId.current === userId) refreshPacks()
  }, [userId, refreshPacks])
  const progress = useTutorialProgress(userId)
  // 进度是本机缓存还是服务端给的，决定了要不要把人送回桌面，所以必须等到服务端那份
  const synced = useProgressSynced(userId)

  const leave = user === null
    ? userReady && userError === null
    : !user.onboarded || (synced && !progress.tutorialDone)
  useEffect(() => {
    if (leave) window.location.replace("/home")
  }, [leave])

  // 断网时进度会一直等不到，等久了给个出口
  const waiting = user !== null && user.onboarded && !synced
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!waiting || slow) return
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(timer)
  }, [waiting, slow])

  if (user !== null && user.onboarded && synced && progress.tutorialDone) {
    return (
      <FlatShell
        key={user.id}
        user={user}
        progress={progress}
        packs={packState?.userId === user.id ? packState.data : null}
        packError={packError}
        refreshUser={refreshUser}
        refreshPacks={reloadPacks}
        setPacks={setPacks}
        logout={logout}
      />
    )
  }
  return (
    <>
      <PageLoading />
      {((user === null && userError) || (waiting && slow)) && (
        <div className="flat-gate" role="status">
          <span>{user === null ? userError : "进度一直没取回来，可能是网络不通。"}</span>
          <button
            type="button"
            className="bk-btn bk-btn--sm"
            onClick={() => {
              if (user === null) refreshUser()
              else {
                setSlow(false)
                void refreshProgress(userId)
              }
            }}
          >
            重试
          </button>
          <a className="bk-btn bk-btn--sm bk-btn--ghost" href="/home">
            回原来的桌面
          </a>
        </div>
      )}
    </>
  )
}

interface Toast {
  id: number
  text: string
  error: boolean
}

type ShellProps = Pick<
  FlatContextValue,
  "user" | "progress" | "packs" | "packError" | "refreshUser" | "refreshPacks" | "setPacks" | "logout"
>

/** 外壳本体：侧栏（窄屏是底部标签）、顶栏、主区和提示条，并把共用的数据交给页面 */
function FlatShell({ user, progress, packs, packError, refreshUser, refreshPacks, setPacks, logout }: ShellProps) {
  const route = useRoute()
  const { resolvedTheme } = useTheme()

  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    [],
  )
  /** kind 不传：只显示不出声。错误多停一会儿；字多的（一长串奖励）按字数多停一会儿 */
  const notify = useCallback<Notify>((text, kind) => {
    setToast((last) => ({ id: (last?.id ?? 0) + 1, text, error: kind === "error" }))
    if (kind) playSfx(kind === "error" ? "error" : kind === "success" ? "success" : "tick")
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    const stay = kind === "error" ? 4000 : Math.min(6000, Math.max(1800, 900 + text.length * 80))
    toastTimer.current = window.setTimeout(() => setToast(null), stay)
  }, [])

  const value = useMemo<FlatContextValue>(
    () => ({ user, progress, packs, packError, notify, refreshUser, refreshPacks, setPacks, logout }),
    [user, progress, packs, packError, notify, refreshUser, refreshPacks, setPacks, logout],
  )

  const Page = PAGES[route]
  const item = PAGE_ITEMS.find((entry) => entry.route === route)
  // 任务页自己管理锁定状态；新页面直接访问也要遵守导航上的同一套条件。
  const lock = item?.feature && route !== "quests" ? featureLockHint(item.feature, progress) : null
  return (
    <FlatContext.Provider value={value}>
      <div className="flat-app">
        <Sidebar
          brand={
            resolvedTheme === "light"
              ? "/brand/choke-lockup-horizontal.svg"
              : "/brand/choke-lockup-horizontal-light.svg"
          }
        />
        <Topbar />
        {/* key：换页时主区重新挂载，滚动回到顶上 */}
        <main className="flat-main" key={route}>
          {lock ? (
            <div className="fl-page">
              <h1 className="fl-page__title">{item?.label}</h1>
              {(route === "album" || route === "deck" || route === "codex") && <CardPageTabs />}
              <div className="fl-lock">{lock}</div>
            </div>
          ) : <Page />}
        </main>
        <TabBar />
        {toast && (
          <div
            // key：连着两条提示时，第二条重新走一遍进场动画
            key={toast.id}
            className={`flat-toast ${toast.error ? "is-error" : ""}`}
            role={toast.error ? "alert" : "status"}
            aria-live={toast.error ? "assertive" : "polite"}
          >
            {toast.text}
          </div>
        )}
      </div>
    </FlatContext.Provider>
  )
}
