import { useEffect, useRef, useState } from "react"
import { RiArrowLeftLine, RiArrowRightSLine } from "@remixicon/react"

import { OpeningPreview } from "./OpeningPreview"
import "./developer-tools.css"

const tools = [
  { name: "卡牌编辑器", href: "/card-editor?from=developer" },
  { name: "卡面实验室", href: "/card-lab?from=developer" },
  { name: "卡池实验室", href: "/pool-lab?from=developer" },
  { name: "闪面参考", href: "/holo-lab.html" },
  { name: "战斗演练", href: "/battle?from=developer" },
]

const actions = [
  { id: "resources", name: "补齐资源" },
  { id: "deck", name: "补齐卡组" },
  { id: "market", name: "补充挂单" },
] as const

type Action = (typeof actions)[number]["id"]

interface PlaytestState {
  playtest: true
  coins: number
  essence: number
  packs: number
  cards: number
  deck: number
  listings: number
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: { message: string }
}

const desktop = window as Window & {
  chokeDesktopDeveloper?: boolean
  chrome?: { webview?: { postMessage: (message: string) => void } }
}

export function DeveloperTools() {
  const [health, setHealth] = useState<"pending" | "up" | "down">("pending")
  const [playtest, setPlaytest] = useState<PlaytestState | null>(null)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [preview, setPreview] = useState(false)
  const previewTrigger = useRef<HTMLButtonElement>(null)
  const inspector = desktop.chokeDesktopDeveloper ? desktop.chrome?.webview : undefined

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    fetch("/api/health", { signal })
      .then(async (response) => {
        const payload = await response.json() as ApiResponse<{ status: string }>
        if (!signal.aborted) setHealth(response.ok && payload.data?.status === "up" ? "up" : "down")
      })
      .catch(() => { if (!signal.aborted) setHealth("down") })
    fetch("/api/developer/state", { signal })
      .then(async (response) => {
        const payload = response.ok ? await response.json() as ApiResponse<PlaytestState> : null
        if (!signal.aborted) setPlaytest(payload?.data?.playtest ? payload.data : null)
      })
      .catch(() => { if (!signal.aborted) setPlaytest(null) })
    return () => controller.abort()
  }, [revision])

  async function replenish(action: Action) {
    if (busy) return
    setBusy(action)
    setError(null)
    try {
      const response = await fetch("/api/developer/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const result = await response.json() as ApiResponse<PlaytestState>
      if (!response.ok || !result.ok || !result.data?.playtest) {
        throw new Error(result.error?.message ?? "测试数据加载失败")
      }
      setPlaytest(result.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "测试数据加载失败")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="developer-tools">
      <header className="client-header" inert={preview}>
        <a className="client-back" href="/"><RiArrowLeftLine size={17} aria-hidden />牌桌</a>
        <h1>开发者工具</h1>
        {playtest && <span className="developer-tools__mode">测试沙盒</span>}
      </header>

      <main className="developer-tools__body" inert={preview}>
        <nav className="developer-tools__entries client-panel" aria-label="开发工具">
          {tools.map(({ href, name }) => (
            <a key={href} href={href} className="developer-tools__entry">
              <b>{name}</b><RiArrowRightSLine size={23} aria-hidden />
            </a>
          ))}
          <button ref={previewTrigger} className="developer-tools__entry" type="button" onClick={() => setPreview(true)}>
            <b>试开棱彩包</b><RiArrowRightSLine size={23} aria-hidden />
          </button>
          {inspector && (
            <button className="developer-tools__entry" type="button" onClick={() => inspector.postMessage("inspect")}>
              <b>检查器</b><kbd>F12</kbd>
            </button>
          )}
        </nav>

        <section className="developer-tools__bench client-panel" aria-label="客户端状态">
          <div className="developer-tools__status">
            <span>API <b data-online={health === "up"}>{health === "up" ? "已连接" : health === "down" ? "未连接" : "连接中…"}</b></span>
            <button
              className="client-key"
              type="button"
              disabled={busy !== null}
              onClick={() => { setHealth("pending"); setError(null); setRevision((value) => value + 1) }}
            >刷新</button>
          </div>

          {playtest && (
            <>
              <dl className="developer-tools__stats" aria-live="polite">
                <div><dt>金币</dt><dd>{playtest.coins.toLocaleString("zh-CN")}</dd></div>
                <div><dt>精华</dt><dd>{playtest.essence.toLocaleString("zh-CN")}</dd></div>
                <div><dt>卡包</dt><dd>{playtest.packs}</dd></div>
                <div><dt>卡册</dt><dd>{playtest.cards}</dd></div>
                <div><dt>卡组</dt><dd>{playtest.deck} / 7</dd></div>
                <div><dt>样例挂单</dt><dd>{playtest.listings}</dd></div>
              </dl>
              <div className="developer-tools__actions" aria-label="测试数据">
                {actions.map(({ id, name }) => (
                  <button
                    key={id}
                    className="client-key client-key--primary"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void replenish(id)}
                  >{busy === id ? "处理中…" : name}</button>
                ))}
              </div>
              <div className="developer-tools__actions" aria-label="测试场景">
                <a className="client-key" href="/?panel=deck">卡组</a>
                <a className="client-key" href="/?panel=market">市场</a>
              </div>
            </>
          )}
          {error && <p className="developer-tools__error" role="alert">{error}</p>}
        </section>
      </main>
      {preview && <OpeningPreview onClose={() => {
        setPreview(false)
        requestAnimationFrame(() => previewTrigger.current?.focus())
      }} />}
    </div>
  )
}
