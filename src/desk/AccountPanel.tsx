import { useState } from "react"

import { CardFace } from "@/card/CardFace"
import { RARITY_LABEL } from "@/card/data"
import { faceFromDef } from "@/card/def"

import type { ApiUserCard } from "./api"
import { Pages } from "./BookPages"
import "./account-panel.css"

export function AccountPanel({
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
      <Pages
        left={
          <>
            <p className="account-text">用 osu! 登录后，抽到的卡和保底进度都会绑定到你的账号。</p>
            <a className="bk-btn bk-btn--main account-action" href="/auth/osu">
              用 osu! 登录
            </a>
          </>
        }
        right={<div className="bk-empty">登录后，这里会显示你的本体卡。</div>}
      />
    )
  }

  return (
    <Pages
      left={
        <>
          <div className="account-id">
            <div className="account-id__avatar">
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
            <div className="account-id__text">
              <b>{username}</b>
              <span className="bk-num">
                {publicId != null ? `CHOKE ID #${String(publicId).padStart(6, "0")}` : userId}
              </span>
            </div>
          </div>

          <div className="account-stats">
            <div className="bk-box bk-stat">
              <b>{essence.toLocaleString("en-US")}</b>
              <span>闪卡精华</span>
            </div>
            <div className="bk-box bk-stat">
              <b>{coins.toLocaleString("en-US")}</b>
              <span>金币</span>
            </div>
          </div>

          <div className="bk-list">
            <div className="bk-row account-row">
              <span>登录状态</span>
              <b>已连接 osu!</b>
            </div>
            <div className="bk-row account-row">
              <span>osu! 主页</span>
              {userId?.startsWith("osu-") ? (
                <a
                  href={`https://osu.ppy.sh/users/${userId.replace("osu-", "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开 ›
                </a>
              ) : (
                <b>演示账号</b>
              )}
            </div>
          </div>

          <button type="button" className="bk-btn bk-btn--danger account-action account-logout" onClick={onLogout}>
            退出登录
          </button>
        </>
      }
      right={
        hero ? (
          <div className="account-hero">
            <span className="bk-label">我的本体卡</span>
            <div className="account-hero__face">
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
            <b className="account-hero__name">{hero.name}</b>
            <span className="account-hero__meta">
              {RARITY_LABEL[hero.rarity]} · Lv.{hero.level}
            </span>
            <p className="bk-note">本体卡已绑定，抽到自己的镜像卡会单独记进卡册。</p>
          </div>
        ) : (
          <div className="account-hero">
            <span className="bk-label">我的本体卡</span>
            <div className="account-hero__face bk-slot">?</div>
            <b className="account-hero__name">还没有获得</b>
            <p className="bk-note">本体卡在背包的「神秘卡包」里。开启后才会进入卡册和桌面。</p>
            <button type="button" className="bk-btn bk-btn--main" onClick={onOpenBackpack}>
              去背包开神秘卡包
            </button>
          </div>
        )
      }
    />
  )
}
