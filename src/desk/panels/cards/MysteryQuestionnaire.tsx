import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { playSfx } from "@/audio/sfx"
import { useModal } from "@/ui/useModal"
import "./backpack-panel.css"

const QUESTIONS = [
  { title: "抽到一张新卡时，你最先看什么？", options: ["数值和技能", "卡面好不好看", "能不能进当前卡组"] },
  { title: "你更喜欢哪种战斗节奏？", options: ["稳稳站场", "连击滚起来", "关键回合爆发"] },
  { title: "你的本体卡想成为什么位置？", options: ["主 C", "副 C / 功能位", "辅助 / 救场"] },
] as const

interface Props {
  onSubmit: (answers: string[]) => Promise<void>
  onClose: () => void
  onError?: (message: string) => void
}

export function MysteryQuestionnaire({ onSubmit, onClose, onError }: Props) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const mounted = useRef(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useModal(modalRef, { onClose: () => { if (!pending.current) onClose() } })

  async function submit() {
    if (pending.current || QUESTIONS.some((_, index) => !answers[index])) return
    pending.current = true
    setOpening(true)
    setError(null)
    try {
      await onSubmit(answers)
      if (mounted.current) onClose()
    } catch (reason) {
      if (!mounted.current) return
      const message = reason instanceof Error ? reason.message : "开启神秘卡包失败"
      playSfx("error")
      setError(message)
      onError?.(message)
    } finally {
      pending.current = false
      if (mounted.current) setOpening(false)
    }
  }

  const question = QUESTIONS[step]!
  return createPortal(
    <div className="backpack-modal" role="dialog" aria-modal="true" aria-label="神秘卡包问卷" ref={modalRef}>
      <div className="backpack-modal__panel">
        <div className="backpack-modal__head">
          <span className="bk-label">神秘卡包 · {step + 1} / {QUESTIONS.length}</span>
          <button type="button" className="bk-btn bk-btn--ghost bk-btn--sm" onClick={onClose} disabled={opening} aria-label="关闭">×</button>
        </div>
        <div className="bk-bar" style={{ "--p": ((step + 1) / QUESTIONS.length) * 100 } as CSSProperties} aria-hidden><i /></div>
        <h3>{question.title}</h3>
        <div className="backpack-modal__options">
          {question.options.map((option) => (
            <button
              type="button"
              key={option}
              aria-pressed={answers[step] === option}
              disabled={opening}
              onClick={() => {
                playSfx("tick")
                setAnswers((current) => {
                  const next = current.slice()
                  next[step] = option
                  return next
                })
              }}
            >
              {option}
            </button>
          ))}
        </div>
        {error && <p className="bk-note bk-error" role="alert">{error}</p>}
        <div className="backpack-modal__actions">
          <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || opening}>上一步</button>
          {step < QUESTIONS.length - 1 ? (
            <button type="button" className="bk-btn bk-btn--main" onClick={() => setStep(step + 1)} disabled={!answers[step]}>下一步</button>
          ) : (
            <button type="button" className="bk-btn bk-btn--main" onClick={() => void submit()} disabled={opening || !answers[step]}>
              {opening ? "开启中…" : "开启卡包"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
