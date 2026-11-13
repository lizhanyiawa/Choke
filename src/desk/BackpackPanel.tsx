import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { CardFace } from "@/card/CardFace"
import { RARITY_LABEL, battlePower } from "@/card/data"

import {
  fetchPackInventory,
  openMysteryPack,
  toFace,
  type ApiUserCard,
  type PackInventory,
} from "./api"
import { Pages } from "./BookPages"
import { PACKS_CHANGED_EVENT, BACKPACK_HOVER_EVENT } from "./drag"
import { INVITE_OPEN_EVENT } from "./invite"
import { PackArt } from "./opening/PackArt"
import type { PackPool } from "./types"
import "./backpack-panel.css"

interface PackMeta {
  id: string
  label: string
  note: string
  /** 服务端卡池 id，去抽卡时用 */
  pool?: string
  /** 卡包图用的桌面卡池（服务端的 golden 在桌面叫 quest）；神秘卡包没有 */
  art?: PackPool
}

const MYSTERY_ID = "mystery"

const PACKS: PackMeta[] = [
  { id: MYSTERY_ID, label: "神秘卡包", note: "只有 1 张卡：你的本体卡" },
  { id: "idle", label: "挂机卡包", note: "低稀有度 · 每包 5 张", pool: "idle", art: "idle" },
  { id: "normal", label: "普通卡包", note: "日常主力 · 每包 5 张", pool: "normal", art: "normal" },
  { id: "golden", label: "黄金卡包", note: "任务产出 · 每包 5 张", pool: "golden", art: "quest" },
  { id: "radiant", label: "璀璨卡包", note: "周常奖励 · 每包 5 张", pool: "radiant", art: "radiant" },
  { id: "sky", label: "天穹卡包", note: "月常奖励 · 每包 5 张", pool: "sky", art: "sky" },
  { id: "prism", label: "棱彩卡包", note: "赛季牌面 · 每包 5 张", pool: "prism", art: "prism" },
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
  const [dropHover, setDropHover] = useState(false)
  const [revision, setRevision] = useState(0)
  /** 没点过就默认选第一个有库存的 */
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    const onHover = (event: Event) => {
      setDropHover(!!(event as CustomEvent<boolean>).detail)
    }
    const onPacksChanged = () => setRevision((value) => value + 1)
    window.addEventListener(BACKPACK_HOVER_EVENT, onHover)
    window.addEventListener(PACKS_CHANGED_EVENT, onPacksChanged)
    return () => {
      window.removeEventListener(BACKPACK_HOVER_EVENT, onHover)
      window.removeEventListener(PACKS_CHANGED_EVENT, onPacksChanged)
    }
  }, [])

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
  }, [userId, revision])

  const counts = inventory?.packs ?? {}
  const heroClaimed = inventory?.heroClaimed ?? !!hero
  const totalPacks = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0)
  const heroFace = useMemo(() => (hero ? toFace(hero) : result ? toFace(result) : null), [hero, result])
  const selected =
    PACKS.find((pack) => pack.id === picked) ??
    PACKS.find((pack) => (counts[pack.id] ?? 0) > 0) ??
    PACKS[0]
  const selectedCount = counts[selected.id] ?? 0
  const isMystery = selected.id === MYSTERY_ID
  const showHero = isMystery && heroFace

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
      // 开完留在神秘卡包这一栏，右页直接看到本体卡
      setPicked(MYSTERY_ID)
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
      <Pages
        left={
          <>
            <p className="bk-note">卡包库存、神秘卡包和你的本体卡都放在这里。</p>
            <a className="bk-btn bk-btn--main" href="/auth/osu">
              用 osu! 登录
            </a>
          </>
        }
        right={<div className="bk-empty">登录后查看背包</div>}
      />
    )
  }

  const step = questionStep

  return (
    <Pages
      className={`backpack-panel ${dropHover ? "is-drop-target" : ""}`}
      left={
        <>
          <span className="bk-label">库存 · 共 {totalPacks} 包</span>
          <div className="bk-list">
            {PACKS.map((pack) => {
              const count = counts[pack.id] ?? 0
              const on = pack.id === selected.id
              return (
                <button
                  type="button"
                  key={pack.id}
                  className={`bk-row backpack-row ${on ? "is-on" : ""} ${count <= 0 ? "is-empty" : ""}`}
                  aria-pressed={on}
                  onClick={() => setPicked(pack.id)}
                >
                  {/* 普通卡包用 PackArt，神秘卡包是一个粉色问号包 */}
                  <span className="backpack-row__art" aria-hidden>
                    {pack.art ? <PackArt pool={pack.art} /> : <i className="backpack-mystery" />}
                  </span>
                  <span className="backpack-row__text">
                    <b>{pack.label}</b>
                    <small>{pack.note}</small>
                  </span>
                  <em className="bk-num">×{count}</em>
                </button>
              )
            })}
          </div>
        </>
      }
      right={
        <>
          <div className="backpack-detail">
            {showHero ? (
              <div className="backpack-detail__card">
                <CardFace card={showHero} />
              </div>
            ) : (
              <span className="backpack-detail__art" aria-hidden>
                {selected.art ? <PackArt pool={selected.art} /> : <i className="backpack-mystery" />}
              </span>
            )}
            <div className="backpack-detail__text">
              {showHero ? (
                <>
                  <span className="bk-label">{result ? "神秘卡包已开启" : "你的本体卡"}</span>
                  <b className="backpack-detail__name">{showHero.name}</b>
                  <span className="bk-note bk-num">
                    {RARITY_LABEL[showHero.rarity]} · BP {battlePower(showHero).toLocaleString("en-US")}
                  </span>
                  <p className="bk-note">本体卡稀有度来自公开排行榜；osu! 数据只提供个人数值加成。</p>
                </>
              ) : (
                <>
                  <span className="bk-label">库存 ×{selectedCount}</span>
                  <b className="backpack-detail__name">{selected.label}</b>
                  <p className="bk-note">{selected.note}</p>
                  <p className="bk-note">
                    {isMystery ? "神秘卡包只出你的本体卡。" : "卡包在开包时消耗。"}
                  </p>
                </>
              )}
            </div>
          </div>

          {error && <p className="bk-note bk-error">{error}</p>}

          {isMystery ? (
            heroClaimed ? (
              <span className="bk-tag backpack-done">本体卡已获得</span>
            ) : !onboarded ? (
              <button
                type="button"
                className="bk-btn bk-btn--main bk-btn--block"
                onClick={() => window.dispatchEvent(new Event(INVITE_OPEN_EVENT))}
              >
                打开邀请函领新手礼包
              </button>
            ) : (
              <button
                type="button"
                className="bk-btn bk-btn--main bk-btn--block"
                onClick={() => {
                  setAnswers([])
                  setQuestionStep(0)
                  setResult(null)
                }}
                disabled={selectedCount <= 0 || opening}
              >
                {selectedCount > 0 ? "开启神秘卡包" : "没有神秘卡包"}
              </button>
            )
          ) : (
            <button
              type="button"
              className="bk-btn bk-btn--main bk-btn--block"
              onClick={() => onOpenGacha(selected.pool ?? "normal")}
              disabled={selectedCount <= 0}
            >
              {selectedCount > 0 ? `去抽${selected.label.replace("卡包", "")}` : "没有卡包"}
            </button>
          )}

          {step !== null && createPortal(
            <div className="backpack-modal" role="dialog" aria-modal="true" aria-label="神秘卡包问卷">
              <div className="backpack-modal__panel">
                <div className="backpack-modal__head">
                  <span className="bk-label">
                    神秘卡包 · {step + 1} / {QUESTIONS.length}
                  </span>
                  <button
                    type="button"
                    className="bk-btn bk-btn--ghost bk-btn--sm"
                    onClick={() => setQuestionStep(null)}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>
                <div
                  className="bk-bar"
                  style={{ "--p": ((step + 1) / QUESTIONS.length) * 100 } as CSSProperties}
                  aria-hidden
                >
                  <i />
                </div>
                <h3>{QUESTIONS[step]?.title}</h3>
                <div className="backpack-modal__options">
                  {QUESTIONS[step]?.options.map((option) => (
                    <button
                      type="button"
                      key={option}
                      aria-pressed={answers[step] === option}
                      onClick={() => {
                        const next = answers.slice()
                        next[step] = option
                        setAnswers(next)
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {error && <p className="bk-note bk-error">{error}</p>}
                <div className="backpack-modal__actions">
                  <button
                    type="button"
                    className="bk-btn bk-btn--ghost"
                    onClick={() =>
                      setQuestionStep((value) => (value === null ? null : Math.max(0, value - 1)))
                    }
                    disabled={step === 0 || opening}
                  >
                    上一步
                  </button>
                  {step < QUESTIONS.length - 1 ? (
                    <button
                      type="button"
                      className="bk-btn bk-btn--main"
                      onClick={() => setQuestionStep((value) => (value === null ? null : value + 1))}
                      disabled={!answers[step]}
                    >
                      下一步
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="bk-btn bk-btn--main"
                      onClick={() => void submitAnswers()}
                      disabled={opening || answers.length < QUESTIONS.length || !answers[step]}
                    >
                      {opening ? "开启中…" : "开启卡包"}
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}
        </>
      }
    />
  )
}
