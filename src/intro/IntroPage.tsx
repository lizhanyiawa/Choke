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
    tag: "STEP 01",
    title: "你的 osu! 账号，就是你的本体卡",
    body: "登录后我们会读取 /me/osu，准备你的本体卡数据。它不会直接出现在桌面上，而是封在背包的「神秘卡包」里。",
  },
  {
    tag: "STEP 02",
    title: "开包、卡册、图鉴",
    body: "六个卡池、服务端 RNG、60 抽保底；抽到的卡会进入卡册。图鉴可以浏览全卡池，按品质筛选。",
  },
  {
    tag: "STEP 03",
    title: "组 7 张卡，去打一场",
    body: "点桌上的卡组卡套槽可以编辑主队 7 槽，卡册里可以升级、升命座。战斗使用 AP、Combo、属性克制和防御档位。",
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
          if (user.onboarded) setStep(3)
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
      setStep(3)
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
          <span>osu! 玩家卡牌 · 抽卡 · 卡册 · 战斗</span>
        </header>
        <main className="intro-landing">
          <div className="intro-landing__copy">
            <span className="intro__eyebrow">CHOKE! · OOBE</span>
            <h1>
              把 osu! 玩家
              <br />
              做成一张卡
            </h1>
            <p>
              用 osu! 账号登录，读取你的公开排名与游玩数据，生成你的本体卡。
              开包、收藏、组卡，然后带 7 张卡上桌。
            </p>
            <a className="intro__cta" href="/auth/osu">
              用 osu! 登录
              <i aria-hidden>›</i>
            </a>
            <div className="intro-landing__facts">
              <div>
                <b>19 万+</b>
                <span>玩家卡池</span>
              </div>
              <div>
                <b>7</b>
                <span>品质档位</span>
              </div>
              <div>
                <b>60</b>
                <span>抽保底</span>
              </div>
            </div>
          </div>
          <div className="intro-landing__art">
            <div className="intro-landing__orb intro-landing__orb--cyan" />
            <div className="intro-landing__orb intro-landing__orb--pink" />
            <div className="intro-landing__card">
              <div className="intro-landing__card-empty">
                <img src="/brand/choke-icon.svg" alt="" />
                <span>登录后生成你的本体卡</span>
              </div>
            </div>
          </div>
        </main>
        <footer className="intro__foot">Choke! · 非盈利同人项目 · 与 osu! 官方无关</footer>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="intro">
        <header className="intro__top">
          <img src="/brand/choke-lockup-horizontal.svg" alt="Choke!" />
          <span>{me.username}</span>
        </header>
        <main className="intro-done">
          <div className="intro-done__card">
            <div className="intro-mystery-pack">
              <span>MYSTERY PACK</span>
              <img src="/brand/choke-icon.svg" alt="" />
              <b>神秘卡包</b>
              <em>内有你的本体卡</em>
            </div>
          </div>
          <div className="intro-done__copy">
            <span className="intro__eyebrow">OOBE COMPLETE</span>
            <h1>新手奖励已发放</h1>
            <p>
              获得 30 个普通卡包和 1 个神秘卡包。本体卡不再随登录直接发放，需要去背包开启神秘卡包。
            </p>
            <div className="intro-done__stats">
              <div>
                <span>普通卡包</span>
                <b>×30</b>
              </div>
              <div>
                <span>神秘卡包</span>
                <b>×1</b>
              </div>
              <div>
                <span>本体卡</span>
                <b>待开启</b>
              </div>
            </div>
            <div className="intro-done__actions">
              <a className="intro__cta" href="/?panel=backpack">
                去背包开神秘卡包
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
        <span>{me.username} · 新手引导</span>
      </header>
      <main className="intro-tutorial">
        <div className="intro-tutorial__card">
          <div className="intro-mystery-pack intro-mystery-pack--small">
            <span>MYSTERY PACK</span>
            <img src="/brand/choke-icon.svg" alt="" />
            <b>神秘卡包</b>
            <em>内有你的本体卡</em>
          </div>
          <div className="intro-tutorial__card-meta">
            <span>MYSTERY</span>
            <b>本体卡 ×1</b>
            <em>完成引导后去背包开启</em>
          </div>
        </div>
        <div className="intro-tutorial__copy">
          <div className="intro-progress" aria-label={`第 ${step + 1} / ${STEPS.length} 步`}>
            {STEPS.map((item, index) => (
              <span key={item.tag} className={index <= step ? "is-on" : ""} />
            ))}
          </div>
          <span className="intro__eyebrow">{current.tag}</span>
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
          <p className="intro-tutorial__hint">
            完成引导会发 30 普通卡包 + 1 神秘卡包；本体卡在神秘卡包中开启。
          </p>
        </div>
      </main>
    </div>
  )
}
