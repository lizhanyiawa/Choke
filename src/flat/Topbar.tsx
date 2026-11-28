import { useRef, useState } from "react"
import { GiCutDiamond, GiTwoCoins } from "react-icons/gi"

import { getSfxVolume, playSfx, setSfxVolume } from "@/audio/sfx"
import { useTheme } from "@/components/theme-provider"
import { MailBox } from "@/desk/panels/mail/MailBox"
import { LedgerBox } from "@/desk/panels/player/LedgerBox"
import { LevelMeter } from "@/desk/shell/DeskBits"
import { refreshProgress } from "@/tutorial/store"

import { useFlat } from "./context"
import { useDismiss } from "./ui/useDismiss"

const num = (value: number) => value.toLocaleString("en-US")

/** 顶栏：等级、金币、精华、流水、邮箱、头像菜单 */
export function Topbar() {
  const { user, progress, notify, refreshUser, refreshPacks } = useFlat()
  return (
    <header className="flat-top">
      <LevelMeter level={progress.level} exp={progress.exp} />
      <span className="flat-top__spacer" />
      <span className="fl-pill fl-pill--coins" title={`金币：${num(user.coins)}`}>
        <GiTwoCoins className="fl-pill__icon" aria-hidden />
        <span className="fl-pill__label">金币</span>
        <b>{num(user.coins)}</b>
      </span>
      <span className="fl-pill fl-pill--essence" title={`精华：${num(user.essence)}（给卡镀闪用）`}>
        <GiCutDiamond className="fl-pill__icon" aria-hidden />
        <span className="fl-pill__label">精华</span>
        <b>{num(user.essence)}</b>
      </span>
      <LedgerBox userId={user.id} />
      <MailBox
        userId={user.id}
        notify={notify}
        // 邮件里什么都可能有：金币、卡包、玩家经验（远征到期结算）
        onGranted={() => {
          refreshUser()
          refreshPacks()
          void refreshProgress(user.id)
        }}
      />
      <AvatarMenu />
    </header>
  )
}


function AvatarMenu() {
  const { user, logout } = useFlat()
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [muted, setMuted] = useState(() => getSfxVolume() === 0)
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  /** 静音前的音量，恢复时用回去 */
  const unmutedVolume = useRef(getSfxVolume() || 0.8)
  const root = useRef<HTMLDivElement>(null)
  useDismiss(root, open, () => setOpen(false))

  const toggleMute = () => {
    const current = getSfxVolume()
    if (current > 0) {
      unmutedVolume.current = current
      setSfxVolume(0)
    } else {
      setSfxVolume(unmutedVolume.current)
      // 恢复声音时响一下，听得到「开了」
      playSfx("tab")
    }
    setMuted(getSfxVolume() === 0)
  }

  const avatar = user.avatarUrl && user.avatarUrl !== failedAvatar ? user.avatarUrl : null

  return (
    <div className="fl-pop-anchor" ref={root}>
      <button
        type="button"
        className="fl-avatar"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${user.username} 的菜单`}
        onClick={() => setOpen((value) => !value)}
      >
        {avatar ? (
          <img src={avatar} alt="" onError={() => setFailedAvatar(avatar)} />
        ) : (
          user.username.slice(0, 1).toUpperCase()
        )}
      </button>
      {open && (
        <div className="fl-pop fl-pop--menu" role="menu">
          <div className="fl-menu__who">
            {user.username}
            {user.publicId !== null && <small>#{user.publicId}</small>}
          </div>
          <a className="fl-menu__item" role="menuitem" href="/home?panel=account">
            账号
          </a>
          <span className="fl-menu__sep" aria-hidden />
          <button
            type="button"
            className="fl-menu__item"
            role="menuitem"
            data-sfx="toggle"
            onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
          >
            配色 <small>{resolvedTheme === "light" ? "亮色" : "暗色"}</small>
          </button>
          <button type="button" className="fl-menu__item" role="menuitem" data-sfx="none" onClick={toggleMute}>
            音效 <small>{muted ? "已静音" : "开着"}</small>
          </button>
          <a className="fl-menu__item" role="menuitem" href="/home">
            家园 <small>原来的桌面</small>
          </a>
          <span className="fl-menu__sep" aria-hidden />
          <button type="button" className="fl-menu__item" role="menuitem" onClick={logout}>
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}
