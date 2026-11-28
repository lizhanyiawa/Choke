import { lazy, Suspense } from "react"

import { installUiSfx } from "@/audio/ui-sfx"
import { BackToDesk } from "@/components/BackToDesk"
import { PageLoading } from "@/components/PageLoading"
import { DeskPage } from "@/desk/DeskPage"
import { hasBindReturn } from "@/desk/panels/player/bind-return"
import { matchFlatRoute } from "@/flat/router"
import "@/ui/motion.css"

// 任何按钮被点到都至少有一声反馈；各面板自己的专属音效优先
installUiSfx()

const BattlePage = lazy(() =>
  import("@/battle/BattlePage").then((m) => ({ default: m.BattlePage }))
)

const CardEditor = lazy(() =>
  import("@/lab/CardEditor").then((m) => ({ default: m.CardEditor }))
)
const CardLab = lazy(() =>
  import("@/lab/CardLab").then((m) => ({ default: m.CardLab }))
)
const PoolLab = lazy(() =>
  import("@/pool/PoolLab").then((m) => ({ default: m.PoolLab }))
)
// 仅开发模式：正式版打包时这一行整个被摘掉，不会生成 chunk
const SfxLab = import.meta.env.DEV
  ? lazy(() => import("@/lab/SfxLab").then((m) => ({ default: m.SfxLab })))
  : null
const LoginPage = lazy(() =>
  import("@/desk/login/LoginPage").then((m) => ({ default: m.LoginPage }))
)
// 管理后台：单独的 chunk，普通玩家不会下载；权限在服务端校验
const AdminPage = lazy(() =>
  import("@/admin/AdminPage").then((m) => ({ default: m.AdminPage }))
)
// 扁平界面：单独的 chunk，留在桌面上的玩家不会下载
const FlatApp = lazy(() =>
  import("@/flat/FlatApp").then((m) => ({ default: m.FlatApp }))
)

const FALLBACK = <PageLoading />

// 在挂载前收拢旧入口，保留深链参数与锚点；绑定结果已由 bind-return 捕获。
function normalizeEntry() {
  const url = new URL(window.location.href)
  const path = url.pathname.replace(/\/+$/, "")
  if (
    path === "/desk" ||
    path === "/intro" ||
    path === "/gacha" ||
    (path === "" && (hasBindReturn() || url.searchParams.has("panel")))
  ) {
    url.pathname = "/home"
    if (path === "/gacha") url.searchParams.set("panel", "packs")
    window.history.replaceState(null, "", url)
  }
}
normalizeEntry()

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "")
  if (path.endsWith("login")) {
    return (
      <Suspense fallback={FALLBACK}>
        <LoginPage />
      </Suspense>
    )
  }
  if (path.endsWith("admin")) {
    return (
      <Suspense fallback={FALLBACK}>
        <AdminPage />
      </Suspense>
    )
  }
  if (path.endsWith("battle")) {
    // 战斗舞台自己带「桌面」按钮，不再叠一个悬浮的返回键（会压住左下角的战报）
    return (
      <Suspense fallback={FALLBACK}>
        <BattlePage />
      </Suspense>
    )
  }
  if (path.endsWith("card-editor")) {
    return (
      <>
        <Suspense fallback={FALLBACK}>
          <CardEditor />
        </Suspense>
        <BackToDesk />
      </>
    )
  }
  if (path.endsWith("pool-lab")) {
    return (
      <>
        <Suspense fallback={FALLBACK}>
          <PoolLab />
        </Suspense>
        <BackToDesk />
      </>
    )
  }
  if (SfxLab && path.endsWith("sfx-lab")) {
    return (
      <>
        <Suspense fallback={FALLBACK}>
          <SfxLab />
        </Suspense>
        <BackToDesk />
      </>
    )
  }
  if (path.endsWith("card-lab")) {
    return (
      <>
        <Suspense fallback={FALLBACK}>
          <CardLab />
        </Suspense>
        <BackToDesk />
      </>
    )
  }
  if (matchFlatRoute(path) !== null) {
    return (
      <Suspense fallback={FALLBACK}>
        <FlatApp />
      </Suspense>
    )
  }
  return <DeskPage />
}

export default App
