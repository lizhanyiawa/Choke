import { useState } from "react"

import { AlbumPanel } from "./AlbumPanel"
import { POOL_META, POOL_ORDER } from "./rarity"

export type PanelId = "album" | "packs" | "mainline" | "market" | "account"

interface Entry {
  id: PanelId
  label: string
  sub: string
}

const ENTRIES: Entry[] = [
  { id: "album", label: "卡册", sub: "COLLECTION" },
  { id: "packs", label: "卡包", sub: "PACKS" },
  { id: "mainline", label: "主线", sub: "STORY" },
  { id: "market", label: "市场", sub: "MARKET" },
  { id: "account", label: "账号", sub: "ACCOUNT" },
]

type Stage = "closed" | "rail" | "open"

export interface PanelRequest {
  id: PanelId
  n: number
}

interface Props {
  userId: string | null
  username: string | null
  /** 桌面物件双击时直接进入的子界面（配合 key 重新挂载） */
  initialStage?: Stage
  initialPanel?: PanelId
  onLogout?: () => void
}

/** 右侧两级抽屉：收起 → 一列大按钮 → 双击进入子界面 */
export function CommandPanel({
  userId,
  username,
  initialStage = "closed",
  initialPanel = "album",
  onLogout,
}: Props) {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [selected, setSelected] = useState<PanelId>(initialPanel)
  const [panel, setPanel] = useState<PanelId>(initialPanel)

  const openPanel = (id: PanelId) => {
    setSelected(id)
    setPanel(id)
    setStage("open")
  }

  const entry = ENTRIES.find((item) => item.id === panel) ?? ENTRIES[0]

  return (
    <>
      <button
        type="button"
        className={`command-tab ${stage === "closed" ? "" : "is-hidden"}`}
        onClick={() => setStage("rail")}
        aria-label="拉开快捷菜单"
        aria-expanded={stage !== "closed"}
      >
        <span className="command-tab__word">快捷</span>
        <span className="command-tab__arrow" aria-hidden>
          ‹
        </span>
      </button>

      <aside className={`command-panel command-panel--${stage}`} aria-label="快捷菜单" aria-hidden={stage === "closed"}>
        {stage === "rail" && (
          <div className="command-rail">
            <header className="command-rail__head">
              <div>
                <div className="command-rail__eyebrow">MAIN CONSOLE</div>
                <div className="command-rail__title">快捷</div>
              </div>
              <button
                type="button"
                className="command-panel__close"
                onClick={() => setStage("closed")}
                aria-label="收起菜单"
              >
                ×
              </button>
            </header>

            <nav className="command-rail__list" aria-label="快捷入口">
              {ENTRIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`command-rail__btn ${selected === item.id ? "is-selected" : ""}`}
                  onClick={() => setSelected(item.id)}
                  onDoubleClick={() => openPanel(item.id)}
                  aria-label={`${item.label}（双击展开）`}
                >
                  <span className="command-rail__glyph" aria-hidden>
                    <PanelGlyph id={item.id} />
                  </span>
                  <span className="command-rail__text">
                    <b>{item.label}</b>
                    <em>{item.sub}</em>
                  </span>
                </button>
              ))}
            </nav>

            <footer className="command-rail__foot">
              <span>双击按钮展开</span>
              <button type="button" className="command-rail__open" onClick={() => openPanel(selected)}>
                打开 · {ENTRIES.find((item) => item.id === selected)?.label}
                <i aria-hidden>›</i>
              </button>
            </footer>
          </div>
        )}

        {stage === "open" && (
          <div className="command-drawer">
            <header className="command-drawer__head">
              <button
                type="button"
                className="command-drawer__back"
                onClick={() => setStage("rail")}
                aria-label="返回快捷菜单"
              >
                ‹
              </button>
              <div className="command-drawer__titles">
                <span className="command-drawer__eyebrow">{entry.sub}</span>
                <h2 className="command-drawer__title">{entry.label}</h2>
              </div>
              <button
                type="button"
                className="command-panel__close"
                onClick={() => setStage("closed")}
                aria-label="收起菜单"
              >
                ×
              </button>
            </header>

            <div className="command-drawer__body">
              {panel === "album" && <AlbumPanel userId={userId} />}
              {panel === "packs" && <PacksPanel />}
              {panel === "mainline" && <MainlinePanel />}
              {panel === "market" && <MarketPanel />}
              {panel === "account" && (
                <AccountPanel userId={userId} username={username} onLogout={onLogout} />
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

function PanelGlyph({ id }: { id: PanelId }) {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const

  switch (id) {
    case "album":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 1 5 17z" {...line} />
          <path d="M5 17V6.5A2 2 0 0 1 7 4.5M9 8h6M9 11.5h6" {...line} />
        </svg>
      )
    case "packs":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3.5l7.5 4v9l-7.5 4-7.5-4v-9z" {...line} />
          <path d="M4.5 7.5L12 11.5l7.5-4M12 11.5v9" {...line} />
        </svg>
      )
    case "mainline":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M5 4.5v15M5 5.5h11l-2 3.5 2 3.5H5" {...line} />
          <circle cx="18.5" cy="17.5" r="2" {...line} />
        </svg>
      )
    case "market":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M4.5 9h15l-1.2 9.5H5.7z" {...line} />
          <path d="M9 9V6.5a3 3 0 0 1 6 0V9M9.5 13.5h5" {...line} />
        </svg>
      )
    case "account":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8.5" r="3.5" {...line} />
          <path d="M5 20c.6-4 3.4-6 7-6s6.4 2 7 6" {...line} />
        </svg>
      )
  }
}

function PacksPanel() {
  return (
    <div className="command-section">
      <p className="command-note">开包走服务端 RNG，结果和保底直接写进你的账号。</p>

      <div className="command-packs">
        {POOL_ORDER.map((pool) => {
          const meta = POOL_META[pool]
          return (
            <div className="command-pack" key={pool}>
              <span className="command-pack__dot" style={{ background: meta.color }} aria-hidden />
              <div className="command-pack__text">
                <b>{meta.label}</b>
                <em>{meta.short} · 5 张一包</em>
              </div>
            </div>
          )
        })}
      </div>

      <a className="command-link" href="/gacha">
        去开包
        <i aria-hidden>›</i>
      </a>
    </div>
  )
}

function MainlinePanel() {
  return (
    <div className="command-section">
      <div className="command-hero command-hero--story">
        <span className="command-hero__tag">CHAPTER 01</span>
        <b>第一拍</b>
        <p>从新手村的第一张卡开始，沿着 osu! 的谱面线一路打到主舞台。</p>
      </div>
      <div className="command-status">
        <span>状态</span>
        <em>剧本制作中</em>
      </div>
    </div>
  )
}

function MarketPanel() {
  return (
    <div className="command-section">
      <div className="command-hero command-hero--market">
        <span className="command-hero__tag">TRADE</span>
        <b>交易行</b>
        <p>用重复卡换缺失卡，或把高命座卡挂出去。</p>
      </div>
      <div className="command-status">
        <span>状态</span>
        <em>未开放</em>
      </div>
    </div>
  )
}

function AccountPanel({
  userId,
  username,
  onLogout,
}: {
  userId: string | null
  username: string | null
  onLogout?: () => void
}) {
  if (!username) {
    return (
      <div className="command-section">
        <p className="command-note">用 osu! 登录后，抽到的卡和保底进度都会绑定到你的账号。</p>
        <a className="command-link" href="/auth/osu">
          用 osu! 登录
          <i aria-hidden>›</i>
        </a>
      </div>
    )
  }

  return (
    <div className="command-section">
      <div className="command-account">
        <div className="command-account__avatar" aria-hidden>
          {username.slice(0, 1).toUpperCase()}
        </div>
        <div className="command-account__text">
          <b>{username}</b>
          <em>{userId}</em>
        </div>
      </div>
      <div className="command-status">
        <span>登录状态</span>
        <em>已连接 osu!</em>
      </div>
      <button type="button" className="command-link command-link--button" onClick={onLogout}>
        退出登录
      </button>
    </div>
  )
}
