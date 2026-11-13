import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react"

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
import { OBJECT_META } from "./objects"
import "./desk-sheet.css"

export type PanelId = "codex" | "album" | "deck" | "backpack" | "battle" | "packs" | "market" | "about" | "account"

export const PANEL_IDS: PanelId[] = ["codex", "album", "deck", "backpack", "packs", "battle", "market", "account", "about"]

export interface DeskSheetHandle {
  /** 播完收起动画再通知外面关掉 */
  close: () => void
}

interface Props {
  ref?: Ref<DeskSheetHandle>
  panel: PanelId
  /** 打开时从哪里展开（视口坐标，通常是被点的物件中心） */
  origin?: { x: number; y: number } | null
  userId: string | null
  username: string | null
  publicId?: number | null
  avatarUrl?: string | null
  essence?: number
  coins?: number
  hero?: ApiUserCard | null
  onSelect: (id: PanelId) => void
  onClose: () => void
  onLogout?: () => void
  onHeroClaimed?: () => void
}

/**
 * 桌上物件被翻开后的样子：一张铺在桌面右侧的材质页，左边缘伸出一排索引签切换。
 * 材质跟着物件走（data-object），里面的功能面板不变。
 */
export function DeskSheet({
  ref,
  panel,
  origin,
  userId,
  username,
  publicId = null,
  avatarUrl = null,
  essence = 0,
  coins = 0,
  hero,
  onSelect,
  onClose,
  onLogout,
  onHeroClaimed,
}: Props) {
  const [gachaPool, setGachaPool] = useState<PoolId>("normal")
  const [leaving, setLeaving] = useState(false)
  const sheetRef = useRef<HTMLElement>(null)
  const leaveTimer = useRef<number | null>(null)
  const [from, setFrom] = useState<string>("100% 50%")

  const close = () => {
    if (leaveTimer.current) return
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null
      onClose()
    }, 170)
  }

  useImperativeHandle(ref, () => ({ close }))

  useEffect(
    () => () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    },
    [],
  )

  // 展开动画的原点放在物件上
  useEffect(() => {
    const el = sheetRef.current
    if (!el || !origin) return
    const rect = el.getBoundingClientRect()
    setFrom(`${origin.x - rect.left}px ${origin.y - rect.top}px`)
  }, [origin])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".card-detail")) close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const meta = OBJECT_META[panel]

  return (
    <aside
      ref={sheetRef}
      className={`sheet ${leaving ? "is-leaving" : ""}`}
      data-object={panel}
      style={{ "--sheet-from": from } as CSSProperties}
      aria-label={meta.label}
    >
      <nav className="sheet__tabs" aria-label="切换">
        {PANEL_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="sheet__tab"
            data-object={id}
            aria-current={panel === id ? "page" : undefined}
            onClick={() => onSelect(id)}
          >
            {OBJECT_META[id].label}
          </button>
        ))}
      </nav>

      <div className="sheet__frame">
        <header className="sheet__head">
          <div className="sheet__titles">
            <span className="sheet__eyebrow">
              {meta.sub} · {meta.thing}
            </span>
            <h2 className="sheet__title">{meta.label}</h2>
          </div>
          <button type="button" className="sheet__close" onClick={close} aria-label="合上">
            ×
          </button>
        </header>

        <div className="sheet__page">
          {panel === "codex" && <CodexPanel userId={userId} />}
          {panel === "album" && <AlbumPanel userId={userId} />}
          {panel === "deck" && <DeckPanel userId={userId} />}
          {panel === "backpack" && (
            <BackpackPanel
              userId={userId}
              onOpenGacha={(pool) => {
                setGachaPool(pool as PoolId)
                onSelect("packs")
              }}
              onHeroClaimed={onHeroClaimed}
            />
          )}
          {panel === "battle" && <BattlePanel userId={userId} onOpenDeck={() => onSelect("deck")} />}
          {panel === "packs" && <GachaPanel userId={userId} initialPool={gachaPool} />}
          {panel === "market" && <MarketPanel userId={userId} onOpenAlbum={() => onSelect("album")} />}
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
              onOpenBackpack={() => onSelect("backpack")}
            />
          )}
        </div>
      </div>
    </aside>
  )
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
