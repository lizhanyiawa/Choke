import { useEffect, useRef, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { RARITY_LABEL } from "@/card/data"
import { faceFromDef } from "@/card/def"

import { AlbumPanel } from "./AlbumPanel"
import { AboutPanel } from "./AboutPanel"
import type { ApiUserCard } from "./api"
import { BackpackPanel } from "./BackpackPanel"
import { BattlePanel } from "./BattlePanel"
import { CodexPanel } from "./CodexPanel"
import { DeckPanel } from "./DeckPanel"
import { GachaPanel, type PoolId } from "./GachaPanel"
import { MarketPanel } from "./MarketPanel"

export type PanelId = "codex" | "album" | "deck" | "backpack" | "battle" | "packs" | "market" | "about" | "account"

interface Entry {
  id: PanelId
  label: string
  sub: string
}

const ENTRIES: Entry[] = [
  { id: "codex", label: "图鉴", sub: "CODEX" },
  { id: "album", label: "卡册", sub: "COLLECTION" },
  { id: "deck", label: "卡组", sub: "DECK" },
  { id: "backpack", label: "背包", sub: "BACKPACK" },
  { id: "battle", label: "战斗", sub: "BATTLE" },
  { id: "packs", label: "抽卡", sub: "GACHA" },
  { id: "market", label: "市场", sub: "MARKET" },
  { id: "about", label: "关于", sub: "ABOUT" },
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
  publicId?: number | null
  avatarUrl?: string | null
  essence?: number
  coins?: number
  hero?: ApiUserCard | null
  /** 桌面物件双击时直接进入的子界面（配合 key 重新挂载） */
  initialStage?: Stage
  initialPanel?: PanelId
  onLogout?: () => void
  onHeroClaimed?: () => void
}

/** 右侧两级抽屉：收起 → 一列大按钮 → 双击进入子界面 */
export function CommandPanel({
  userId,
  username,
  publicId = null,
  avatarUrl = null,
  essence = 0,
  coins = 0,
  hero,
  initialStage = "closed",
  initialPanel = "album",
  onLogout,
  onHeroClaimed,
}: Props) {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [selected, setSelected] = useState<PanelId>(initialPanel)
  const [panel, setPanel] = useState<PanelId>(initialPanel)
  const [gachaPool, setGachaPool] = useState<PoolId>("normal")
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    },
    [],
  )

  const openPanel = (id: PanelId) => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    setLeaving(false)
    setSelected(id)
    setPanel(id)
    setStage("open")
  }

  /** 二次展开 → 一次展开：先播 180ms 退场动画，再切回 rail */
  const backToRail = () => {
    if (leaveTimer.current) return
    setLeaving(true)
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null
      setLeaving(false)
      setStage("rail")
    }, 180)
  }

  const closePanel = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    setLeaving(false)
    setStage("closed")
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
                onClick={closePanel}
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
          <div className={`command-drawer ${leaving ? "is-leaving" : ""}`}>
            <nav className="command-drawer__nav" aria-label="侧栏入口">
              <button
                type="button"
                className="command-drawer__collapse"
                onClick={backToRail}
                aria-label="收起为快捷栏"
              >
                ‹
              </button>
              <div className="command-drawer__navlist">
                {ENTRIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`command-drawer__navbtn ${panel === item.id ? "is-active" : ""}`}
                    onClick={() => {
                      setSelected(item.id)
                      setPanel(item.id)
                    }}
                    aria-current={panel === item.id ? "page" : undefined}
                  >
                    <span className="command-drawer__navglyph" aria-hidden>
                      <PanelGlyph id={item.id} />
                    </span>
                    <span className="command-drawer__navtext">
                      <b>{item.label}</b>
                      <em>{item.sub}</em>
                    </span>
                  </button>
                ))}
              </div>
            </nav>

            <div className="command-drawer__content">
              <header className="command-drawer__head">
                <div className="command-drawer__titles">
                  <span className="command-drawer__eyebrow">{entry.sub}</span>
                  <h2 className="command-drawer__title">{entry.label}</h2>
                </div>
                <button
                  type="button"
                  className="command-panel__close"
                  onClick={closePanel}
                  aria-label="收起菜单"
                >
                  ×
                </button>
              </header>

              <div className="command-drawer__body">
                {panel === "codex" && <CodexPanel userId={userId} />}
                {panel === "album" && <AlbumPanel userId={userId} />}
                {panel === "deck" && <DeckPanel userId={userId} />}
                {panel === "backpack" && (
                  <BackpackPanel
                    userId={userId}
                    onOpenGacha={(pool) => {
                      setGachaPool(pool as PoolId)
                      openPanel("packs")
                    }}
                    onHeroClaimed={onHeroClaimed}
                  />
                )}
                {panel === "battle" && <BattlePanel userId={userId} onOpenDeck={() => openPanel("deck")} />}
                {panel === "packs" && <GachaPanel userId={userId} initialPool={gachaPool} />}
                {panel === "market" && (
                  <MarketPanel userId={userId} onOpenAlbum={() => openPanel("album")} />
                )}
                {panel === "about" && <AboutPanel />}
                {panel === "account" && (
                  <AccountPanel
                    userId={userId}
                    username={username}
                    publicId={publicId}
                    avatarUrl={avatarUrl}
                    essence={essence}
                    coins={coins}
                    hero={hero}
                    onLogout={onLogout}
                    onOpenBackpack={() => openPanel("backpack")}
                  />
                )}
              </div>
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
    case "codex":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M5 4.5h6.5A2.5 2.5 0 0 1 14 7v13H7.5A2.5 2.5 0 0 1 5 17.5z" {...line} />
          <path d="M14 7a2.5 2.5 0 0 1 2.5-2.5H19v13h-2.5A2.5 2.5 0 0 0 14 20M8 8.5h3M8 12h3" {...line} />
        </svg>
      )
    case "album":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 1 5 17z" {...line} />
          <path d="M5 17V6.5A2 2 0 0 1 7 4.5M9 8h6M9 11.5h6" {...line} />
        </svg>
      )
    case "deck":
      return (
        <svg viewBox="0 0 24 24">
          <rect x="4.5" y="6.5" width="9" height="13" rx="1.5" {...line} />
          <path d="M8 4.5h9.5A1.5 1.5 0 0 1 19 6v12M7 10h4M7 13.5h4" {...line} />
        </svg>
      )
    case "backpack":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M6 8.5h12l1 11.5H5z" {...line} />
          <path d="M9 8.5V6a3 3 0 0 1 6 0v2.5M9 13h6" {...line} />
        </svg>
      )
    case "battle":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M14.8 4.2l5 5-9.3 9.3-5-5z" {...line} />
          <path d="M18.3 6l1.9-1.9M5.5 18.8l2.4-2.4M9.8 8.2l6 6" {...line} />
        </svg>
      )
    case "packs":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3.5l7.5 4v9l-7.5 4-7.5-4v-9z" {...line} />
          <path d="M4.5 7.5L12 11.5l7.5-4M12 11.5v9" {...line} />
        </svg>
      )
    case "market":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M4.5 9h15l-1.2 9.5H5.7z" {...line} />
          <path d="M9 9V6.5a3 3 0 0 1 6 0V9M9.5 13.5h5" {...line} />
        </svg>
      )
    case "about":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" {...line} />
          <path d="M12 11v5M12 7.5v.5" {...line} />
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

function AccountPanel({
  userId,
  username,
  publicId,
  avatarUrl,
  essence = 0,
  coins = 0,
  hero,
  onLogout,
  onOpenBackpack,
}: {
  userId: string | null
  username: string | null
  publicId?: number | null
  avatarUrl?: string | null
  essence?: number
  coins?: number
  hero?: ApiUserCard | null
  onLogout?: () => void
  onOpenBackpack?: () => void
}) {
  const [avatarError, setAvatarError] = useState(false)

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
        <div className="command-account__avatar">
          {avatarUrl && !avatarError ? (
            <img
              src={avatarUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
            />
          ) : (
            username.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="command-account__text">
          <b>{username}</b>
          <em>
            {publicId != null ? `CHOKE ID #${String(publicId).padStart(6, "0")}` : userId}
          </em>
        </div>
      </div>

      <div className="command-account__meta">
        <span className="command-account__essence">闪卡精华 {essence.toLocaleString("en-US")}</span>
        <span className="command-account__coins">金币 {coins.toLocaleString("en-US")}</span>
        {userId?.startsWith("osu-") ? (
          <a
            className="command-account__link"
            href={`https://osu.ppy.sh/users/${userId.replace("osu-", "")}`}
            target="_blank"
            rel="noreferrer"
          >
            osu! 主页
          </a>
        ) : (
          <span className="command-account__link">演示账号</span>
        )}
      </div>

      {hero ? (
        <div className="command-hero-card">
          <div className="command-hero-card__face">
            <CardFace
              card={faceFromDef(
                {
                  id: hero.id,
                  osuId: null,
                  name: hero.name,
                  rarity: hero.rarity,
                  job: hero.job,
                  no: hero.no,
                  total: hero.total,
                  country: hero.country ?? undefined,
                  globalRank: hero.globalRank,
                  pp: hero.pp == null ? null : Number(hero.pp),
                  profileUrl: hero.profileUrl ?? undefined,
                  art: hero.art ?? undefined,
                  banner: hero.banner ?? undefined,
                  skills: hero.skills,
                  version: 1,
                },
                { level: hero.level, constellation: hero.constellation },
              )}
            />
          </div>
          <div className="command-hero-card__text">
            <span>YOUR HERO CARD</span>
            <b>{hero.name}</b>
            <em>
              {RARITY_LABEL[hero.rarity]} · Lv.{hero.level}
            </em>
            <p>本体卡已绑定，抽到自己的镜像卡会单独记进卡册。</p>
          </div>
        </div>
      ) : (
        <div className="command-hero-claim">
          <span>本体卡</span>
          <em>还没有获得</em>
          <p>本体卡在背包的「神秘卡包」里。开启后才会进入卡册和桌面。</p>
          <button type="button" className="command-link" onClick={onOpenBackpack}>
            去背包开神秘卡包
            <i aria-hidden>›</i>
          </button>
        </div>
      )}

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
