import { useEffect, useState } from "react"

import "./intro.css"

interface Me {
  id: string
  username: string
  osuId: number | null
  onboarded: boolean
  heroBonus: number
  hero: unknown
}

const STEPS = [
  {
    title: "本体卡",
    body: "完成引导后，在背包开启神秘卡包领取本体卡。",
  },
  {
    title: "开包",
    body: "发卡包后，在牌桌上点开它。抽到的卡会进入卡册。",
  },
  {
    title: "卡组",
    body: "在卡组里点「＋」选卡，再进入战斗。",
  },
]

export function IntroPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/auth/me", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok) {
          const user = data.data as Me
          setMe(user)
          if (user.onboarded) setStep(STEPS.length)
        } else {
          setMe(null)
        }
      })
      .catch(() => {
        if (!cancelled) setMe(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function finish() {
    if (finishing) return
    setFinishing(true)
    setError(null)
    try {
      const response = await fetch("/auth/onboard", {
        method: "POST",
        credentials: "include",
      })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error?.message ?? "完成引导失败")

      const refreshed = await fetch("/auth/me", { credentials: "include" }).then((res) => res.json())
      if (refreshed.ok) setMe(refreshed.data as Me)
      setStep(STEPS.length)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "完成引导失败")
    } finally {
      setFinishing(false)
    }
  }

  if (loading) return <div className="intro intro--center">加载中…</div>

  if (!me) {
    return (
      <div className="intro">
        <header className="intro__top">
          <img src="/brand/choke-lockup-horizontal.svg" alt="Choke!" />
        </header>
        <main className="intro-landing">
          <div className="intro-landing__copy">
            <h1>osu! 玩家卡牌</h1>
            <p>使用你的 osu! 公开数据生成本体卡。</p>
            <a className="intro__cta" href="/auth/osu">
              用 osu! 登录
              <i aria-hidden>›</i>
            </a>
          </div>
          <div className="intro-landing__art">
            <div className="intro-landing__orb intro-landing__orb--cyan" />
            <div className="intro-landing__orb intro-landing__orb--pink" />
            <div className="intro-landing__card">
              <div className="intro-landing__card-empty">
                <img src="/brand/choke-icon.svg" alt="" />
              </div>
            </div>
          </div>
        </main>
        <footer className="intro__foot">非官方 osu! 同人项目</footer>
      </div>
    )
  }

  if (step === STEPS.length) {
    return (
      <div className="intro">
        <header className="intro__top">
          <img src="/brand/choke-lockup-horizontal.svg" alt="Choke!" />
          <span>{me.username}</span>
        </header>
        <main className="intro-done">
          <div className="intro-done__card">
            <div className="intro-mystery-pack">
              <img src="/brand/choke-icon.svg" alt="" />
            </div>
          </div>
          <div className="intro-done__copy">
            <h1>新手奖励已发放</h1>
            <div className="intro-done__stats">
              <div>
                <span>普通卡包</span>
                <b>×30</b>
              </div>
              <div>
                <span>神秘卡包</span>
                <b>×1</b>
              </div>
            </div>
            <div className="intro-done__actions">
              <a className="intro__cta" href="/?panel=backpack">
                {me.hero ? "去背包" : "去背包开神秘卡包"}
                <i aria-hidden>›</i>
              </a>
              <a className="intro__ghost" href="/">
                回桌面
              </a>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const current = STEPS[step] ?? STEPS[0]

  return (
    <div className="intro">
      <header className="intro__top">
        <img src="/brand/choke-lockup-horizontal.svg" alt="Choke!" />
        <span>新手引导</span>
      </header>
      <main className="intro-tutorial">
        <div className="intro-tutorial__card">
          <div className="intro-mystery-pack intro-mystery-pack--small">
            <img src="/brand/choke-icon.svg" alt="" />
            <b>神秘卡包</b>
          </div>
        </div>
        <div className="intro-tutorial__copy">
          <div className="intro-progress" aria-label={`第 ${step + 1} / ${STEPS.length} 步`}>
            {STEPS.map((item, index) => (
              <span key={item.title} className={index <= step ? "is-on" : ""} />
            ))}
          </div>
          <h1>{current.title}</h1>
          <p>{current.body}</p>
          <div className="intro-tutorial__actions">
            <button
              type="button"
              className="intro__ghost"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0}
            >
              上一步
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" className="intro__cta" onClick={() => setStep((value) => value + 1)}>
                下一步
                <i aria-hidden>›</i>
              </button>
            ) : (
              <button type="button" className="intro__cta" onClick={() => void finish()} disabled={finishing}>
                {finishing ? "发放中…" : "完成引导"}
                <i aria-hidden>›</i>
              </button>
            )}
          </div>
          {error && <p className="intro__error">{error}</p>}
        </div>
      </main>
    </div>
  )
}
