import * as React from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  disableTransitionOnChange?: boolean
  /** 固定用这个主题，忽略玩家选择（战斗页只有暗色） */
  forcedTheme?: ResolvedTheme
}

type ThemeProviderState = {
  theme: Theme
  /** 实际生效的主题："system" 时取系统当前配色 */
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: Theme[] = ["dark", "light", "system"]

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is Theme {
  return value !== null && THEME_VALUES.includes(value as Theme)
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light"
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

/** 主题写在 <html> 的 light / dark class 上；index.html 里的内联脚本在首帧前先按同一规则设好。 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  forcedTheme,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey)
    return isTheme(storedTheme) ? storedTheme : defaultTheme
  })
  const [systemTheme, setSystemTheme] =
    React.useState<ResolvedTheme>(getSystemTheme)
  const resolvedTheme =
    forcedTheme ?? (theme === "system" ? systemTheme : theme)

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey]
  )

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => setSystemTheme(getSystemTheme())
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  React.useEffect(() => {
    const root = document.documentElement
    if (root.classList.contains(resolvedTheme)) return
    const restoreTransitions = disableTransitionOnChange
      ? disableTransitionsTemporarily()
      : null
    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)
    restoreTransitions?.()
  }, [resolvedTheme, disableTransitionOnChange])

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== storageKey) {
        return
      }
      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme)
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [defaultTheme, storageKey])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
