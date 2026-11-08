import { useEffect, useMemo, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { battlePower } from "@/card/data"

import {
  fetchPackInventory,
  openMysteryPack,
  toFace,
  type ApiUserCard,
  type PackInventory,
} from "./api"
import { PACKS_CHANGED_EVENT } from "./drag"
import "./backpack-panel.css"

interface PackMeta {
  id: string
  label: string
  note: string
  color: string
  pool?: string
  mystery?: boolean
}

const PACKS: PackMeta[] = [
  {
    id: "mystery",
    label: "神秘卡包",
    note: "只有 1 张卡：你的本体卡",
    color: "#ed5f9f",
    mystery: true,
  },
  { id: "normal", label: "普通卡包", note: "日常主力 · 每包 5 张", color: "#e5484d", pool: "normal" },
  { id: "idle", label: "挂机卡包", note: "低稀有度 · 每包 5 张", color: "#3cbadb", pool: "idle" },
  { id: "golden", label: "黄金卡包", note: "任务产出 · 每包 5 张", color: "#ffc24b", pool: "golden" },
  { id: "radiant", label: "璀璨卡包", note: "周常奖励 · 每包 5 张", color: "#b98cff", pool: "radiant" },
  { id: "sky", label: "天穹卡包", note: "月常奖励 · 每包 5 张", color: "#21e985", pool: "sky" },
  { id: "prism", label: "棱彩卡包", note: "赛季牌面 · 每包 5 张", color: "#f4f4f6", pool: "prism" },
]

const QUESTIONS = [
  {
    title: "抽到一张新卡时，你最先看什么？",
    options: ["数值和技能", "卡面好不好看", "能不能进当前卡组"],
  },
  {
    title: "你更喜欢哪种战斗节奏？",
    options: ["稳稳站场", "连击滚起来", "关键回合爆发"],
  },
  {
    title: "你的本体卡想成为什么位置？",
    options: ["主 C", "副 C / 功能位", "辅助 / 救场"],
  },
]

export function BackpackPanel({
  userId,
  onOpenGacha,
  onHeroClaimed,
}: {
  userId: string | null
  onOpenGacha: (pool: string) => void
  onHeroClaimed?: () => void
}) {
  const [inventory, setInventory] = useState<PackInventory | null>(null)
  const [hero, setHero] = useState<ApiUserCard | null>(null)
  const [onboarded, setOnboarded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [questionStep, setQuestionStep] = useState<number | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [opening, setOpening] = useState(false)
  const [result, setResult] = useState<ApiUserCard | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchPackInventory(userId)
      .then((data) => {
        if (!cancelled) setInventory(data)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "加载背包失败")
      })
    fetch("/auth/me", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !data.ok) return
        setHero((data.data.hero as ApiUserCard | null) ?? null)
        setOnboarded(!!data.data.onboarded)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  const counts = inventory?.packs ?? {}
  const heroClaimed = inventory?.heroClaimed ?? !!hero
  const totalPacks = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0)
  const mysteryCount = counts.mystery ?? 0
  const heroFace = useMemo(() => (hero ? toFace(hero) : result ? toFace(result) : null), [hero, result])

  async function submitAnswers() {
    if (!userId || opening) return
    setOpening(true)
    setError(null)
    try {
      const data = await openMysteryPack(userId, answers)
      setResult(data.hero)
      setHero(data.hero)
      setInventory((current) =>
        current
          ? { ...current, heroClaimed: true, packs: { ...current.packs, ...data.packs } }
          : current,
      )
      setQuestionStep(null)
      window.dispatchEvent(new Event(PACKS_CHANGED_EVENT))
      onHeroClaimed?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "开启神秘卡包失败")
    } finally {
      setOpening(false)
    }
  }

  if (!userId) {
    return (
      <div className="album-panel__empty">
        <p>登录后查看背包</p>
        <a href="/auth/osu">用 osu! 登录</a>
      </div>
    )
  }

  return (
    <div className="backpack-panel">
      <div className="backpack-head">
        <div>
          <span>BACKPACK · PACKS</span>
          <b>卡包库存</b>
        </div>
        <p>卡包在开包时消耗；神秘卡包只出你的本体卡。</p>
      </div>

      <div className="backpack-summary">
        <div>
          <span>卡包总数</span>
          <b>{totalPacks}</b>
        </div>
        <div>
          <span>神秘卡包</span>
          <b>{mysteryCount}</b>
        </div>
        <div>
          <span>本体卡</span>
          <b>{heroClaimed ? "已获得" : "待开启"}</b>
        </div>
      </div>

      {error && <div className="backpack-error">{error}</div>}

      <div className="backpack-grid">
        {PACKS.map((pack) => {
          const count = counts[pack.id] ?? 0
          const isMystery = !!pack.mystery
          const disabled = isMystery
            ? count <= 0 || heroClaimed || !onboarded || opening
            : count <= 0

          return (
            <article
              className={`backpack-pack ${isMystery ? "is-mystery" : ""} ${count <= 0 ? "is-empty" : ""}`}
              key={pack.id}
            >
              <div className="backpack-pack__art" aria-hidden>
                <img src="/brand/choke-icon.svg" alt="" />
                <em>×{count}</em>
              </div>
              <div className="backpack-pack__top">
                <span className="backpack-pack__dot" style={{ background: pack.color }} aria-hidden />
                <b>{pack.label}</b>
              </div>
              <p>{pack.note}</p>
              <div className="backpack-pack__foot">
                {isMystery ? (
                  heroClaimed ? (
                    <span className="backpack-pack__done">本体卡已获得</span>
                  ) : !onboarded ? (
                    <a className="backpack-pack__link" href="/intro">
                      先完成引导
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="backpack-pack__open"
                      onClick={() => {
                        setAnswers([])
                        setQuestionStep(0)
                        setResult(null)
                      }}
                      disabled={disabled}
                    >
                      {count > 0 ? "开启神秘卡包" : "没有神秘卡包"}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="backpack-pack__open"
                    onClick={() => onOpenGacha(pack.pool ?? "normal")}
                    disabled={disabled}
                  >
                    {count > 0 ? `去抽${pack.label.replace("卡包", "")}` : "没有卡包"}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {heroFace && (
        <div className="backpack-hero">
          <div className="backpack-hero__face">
            <CardFace card={heroFace} />
          </div>
          <div className="backpack-hero__text">
            <span>{result ? "神秘卡包已开启" : "你的本体卡"}</span>
            <b>{heroFace.name}</b>
            <em>
              {heroFace.rarity} · BP {battlePower(heroFace).toLocaleString("en-US")}
            </em>
            <p>本体卡稀有度来自公开排行榜；osu! 数据只提供个人数值加成。</p>
          </div>
        </div>
      )}

      {questionStep !== null && (
        <div className="backpack-modal" role="dialog" aria-modal="true" aria-label="神秘卡包问卷">
          <div className="backpack-modal__panel">
            <div className="backpack-modal__head">
              <span>
                MYSTERY PACK · {questionStep + 1} / {QUESTIONS.length}
              </span>
              <button type="button" onClick={() => setQuestionStep(null)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="backpack-modal__progress" aria-hidden>
              {QUESTIONS.map((item, index) => (
                <span key={item.title} className={index <= questionStep ? "is-on" : ""} />
              ))}
            </div>
            <h3>{QUESTIONS[questionStep]?.title}</h3>
            <div className="backpack-modal__options">
              {QUESTIONS[questionStep]?.options.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={answers[questionStep] === option ? "is-selected" : ""}
                  onClick={() => {
                    const next = answers.slice()
                    next[questionStep] = option
                    setAnswers(next)
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="backpack-modal__actions">
              <button
                type="button"
                className="backpack-modal__ghost"
                onClick={() =>
                  setQuestionStep((step) => (step === null ? null : Math.max(0, step - 1)))
                }
                disabled={questionStep === 0 || opening}
              >
                上一步
              </button>
              {questionStep < QUESTIONS.length - 1 ? (
                <button
                  type="button"
                  className="backpack-modal__next"
                  onClick={() => setQuestionStep((step) => (step === null ? null : step + 1))}
                  disabled={!answers[questionStep]}
                >
                  下一步
                </button>
              ) : (
                <button
                  type="button"
                  className="backpack-modal__next"
                  onClick={() => void submitAnswers()}
                  disabled={opening || answers.length < QUESTIONS.length || !answers[questionStep]}
                >
                  {opening ? "开启中…" : "开启卡包"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
