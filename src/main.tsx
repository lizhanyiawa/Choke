import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

/** 战斗页还没做亮色，固定暗色；index.html 的首帧脚本用同一条规则 */
const BATTLE_ROUTE = /battle(-sim)?\/*$/

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider forcedTheme={BATTLE_ROUTE.test(location.pathname) ? "dark" : undefined}>
      <App />
    </ThemeProvider>
  </StrictMode>
)
