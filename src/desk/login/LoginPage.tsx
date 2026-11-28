import { EmailAuthForm } from "@/desk/login/EmailAuthForm"
import { GuestLoginButton } from "@/desk/login/GuestLoginButton"
import "@/desk/book.css"
import "@/desk/login/login-page.css"

/** 独立登录页：osu! / 邮箱 / 游客三条入口。osu! 是主入口，只有它带本体卡。
 * 玩家从桌面上的邀请函登录，这一页留给直达链接和管理后台的「去登录」 */
export function LoginPage() {
  return (
    <div className="login-page">
      <main className="login-card">
        <header className="login-head">
          <img className="login-logo login-logo--dark" src="/brand/choke-lockup-horizontal-light.svg" alt="Choke!" />
          <img className="login-logo login-logo--light" src="/brand/choke-lockup-horizontal.svg" alt="" aria-hidden />
          <p className="login-sub">把 osu! 玩家数据做成卡牌</p>
        </header>

        <section className="login-block">
          <a className="bk-btn bk-btn--main login-big" href="/auth/osu" data-sfx="send">
            用 osu! 登录
          </a>
          <p className="bk-note login-hint">首次登录会自动建号，并拿到你自己的本体卡。</p>
        </section>

        <div className="login-divider" role="separator">
          <span>或者用邮箱</span>
        </div>

        <EmailAuthForm />

        <footer className="login-foot">
          <GuestLoginButton className="bk-btn bk-btn--ghost login-big" label="先以游客试玩" />
          <p className="bk-note login-hint">游客可以开包和战斗，但不能用市场；邮箱或 osu! 账号才可以交易。</p>
          <a className="login-back" href="/home">
            <span aria-hidden>‹</span> 返回桌面
          </a>
        </footer>
      </main>
    </div>
  )
}
