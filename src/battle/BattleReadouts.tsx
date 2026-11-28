import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { SideSupportUnit } from "@choke/shared/battle/types"
import { ELEMENT_LABEL } from "@/card/data"
import type { SkillPreview } from "./useSkillRows"
import "./battle-readouts.css"

export function BattleLog({ lines }: { lines: string[] }) {
  const list = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  useLayoutEffect(() => {
    if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [lines])
  return <section className="battle-readout-log" aria-label="战报">
    <h3>战报</h3>
    <div ref={list} className="battle-log-lines" tabIndex={0} aria-label="战报记录" onScroll={event => {
      const el = event.currentTarget
      follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 3
    }}>
      {lines.slice().reverse().map((line, i) => <p key={`${i}-${line}`}>{line}</p>)}
    </div>
  </section>
}

export function ReadoutTip({ anchor, pointer, children, id }: {
  anchor: HTMLElement; pointer?: SkillPreview["pointer"]; children: ReactNode; id?: string
}) {
  const tip = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = tip.current!
    const bound = (n: number, max: number) => Math.max(6, Math.min(n, max - 6))
    let x = pointer?.x, y = pointer?.y
    const place = () => {
      const source = anchor.getBoundingClientRect()
      const px = x ?? source.right, py = y ?? source.top
      const w = el.offsetWidth, h = el.offsetHeight
      const left = px + 12 + w <= innerWidth - 6 ? px + 12 : (x ?? source.left) - w - 12
      el.style.left = `${bound(left, innerWidth - w)}px`
      const top = py - h - 10 >= 6 ? py - h - 10 : (y ?? source.bottom) + 10
      el.style.top = `${bound(top, innerHeight - h)}px`
    }
    place()
    // Only the open tooltip tracks the mouse. Combat state and card faces stay untouched.
    const move = (event: MouseEvent) => {
      x = event.clientX
      y = event.clientY
      place()
    }
    if (pointer) anchor.addEventListener("mousemove", move)
    const observer = new ResizeObserver(place)
    observer.observe(anchor)
    observer.observe(el)
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      if (pointer) anchor.removeEventListener("mousemove", move)
      observer.disconnect()
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [anchor, pointer])
  // 远征战斗有独立的全屏层；提示放在战斗视口内，避免挂到 body 后被全屏层盖住。
  const viewport = anchor.closest(".choke-viewport") ?? anchor.ownerDocument.body
  return createPortal(<div className="battle-readout-tip" role="tooltip" id={id} ref={tip}>{children}</div>, viewport)
}

export function SkillHint({ hint }: { hint: SkillPreview | null }) {
  if (!hint) return null
  return <ReadoutTip key={hint.text} anchor={hint.anchor} pointer={hint.pointer}>
    <b>{hint.heading}</b>{hint.reason && <strong>{hint.reason}</strong>}
    <span>{hint.description}</span>
    {hint.effects.map(effect => <div className="battle-readout-effect" key={effect.name}>
      <b>【{effect.name}】：</b>{effect.description}
    </div>)}
  </ReadoutTip>
}

const TRIGGER_READOUTS = {
  boost: { title: "BOOST", description: "这张卡本回合首次使用的主动技能伤害 ×1.5。" },
  critical_art: { title: "必杀 3.0×", description: "这张卡本回合首次使用的主动技能伤害 ×3.0。" },
  double_cast: { title: "连击 ×2", description: "这张卡本回合首次使用的主动技能发动两次。" },
} as const

export function TriggerReadout({ trigger, label }: { trigger: keyof typeof TRIGGER_READOUTS; label: string }) {
  const id = useId()
  const [hover, setHover] = useState<{ anchor: HTMLElement; pointer: { x: number; y: number } } | null>(null)
  const [focus, setFocus] = useState<HTMLElement | null>(null)
  const anchor = hover?.anchor ?? focus
  const readout = TRIGGER_READOUTS[trigger]
  return <div className="choke-center-trigger" data-trigger={trigger}>
    <span tabIndex={0} aria-describedby={anchor ? id : undefined}
      onMouseEnter={event => setHover({ anchor: event.currentTarget, pointer: { x: event.clientX, y: event.clientY } })}
      onMouseLeave={() => setHover(null)} onFocus={event => setFocus(event.currentTarget)} onBlur={() => setFocus(null)}>
      {label}
    </span>
    {anchor && <ReadoutTip id={id} anchor={anchor} pointer={hover?.pointer}>
      <b>{readout.title}</b><span>{readout.description}</span>
    </ReadoutTip>}
  </div>
}


export function SupportReadout({ unit, side, icon, description = unit.roleText }: { unit: SideSupportUnit; side: "enemy" | "party"; icon: ReactNode; description?: string }) {
  const id = useId()
  const [hover, setHover] = useState<{ anchor: HTMLElement; pointer: { x: number; y: number } } | null>(null)
  const [focus, setFocus] = useState<HTMLElement | null>(null)
  const anchor = hover?.anchor ?? focus
  const charge = unit.stacks != null ? `蓄力 ${unit.stacks}/${unit.maxStacks ?? 3}` : null
  const tier = unit.tier ?? 1
  const strength = unit.kind === "shell" ? "不可拆除" : `强度 ${tier}`
  return <div className="battle-support" data-side={side} data-active={unit.triggered || undefined} tabIndex={0}
    aria-describedby={anchor ? id : undefined}
    onMouseEnter={event => setHover({ anchor: event.currentTarget, pointer: { x: event.clientX, y: event.clientY } })}
    onMouseLeave={() => setHover(null)}
    onFocus={event => setFocus(event.currentTarget)} onBlur={() => setFocus(null)}>
    <span className="battle-support-icon" aria-hidden>{icon}</span>
    <div className="battle-support-copy"><b>{unit.name} <em>{strength}</em></b><small>{charge ?? unit.roleText}</small></div>
    {anchor && <ReadoutTip id={id} anchor={anchor} pointer={hover?.pointer}>
      <b>{unit.name} · {ELEMENT_LABEL[unit.element]}{charge && ` · ${charge}`}</b><span>{description}</span>
      <small>{unit.kind === "shell" ? "无法拆除" : `支援强度 ${tier} · 需要强度 ${tier} 或以上的拆除技能`}</small>
    </ReadoutTip>}
  </div>
}
