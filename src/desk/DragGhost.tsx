import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"

import {
  CARD_POINTER_DROP_EVENT,
  CARD_POINTER_START_EVENT,
  DECK_HOVER_EVENT,
  type CardPointerDrop,
  type CardPointerStart,
} from "./drag"

interface Props {
  w: number
  h: number
  /** 物件左上角的视口坐标，拖动时由外面每次 pointermove 写入 */
  pointer: RefObject<{ x: number; y: number }>
  /** 抓的位置相对物件中心，-0.5–0.5 */
  grab: { u: number; v: number }
  /** 物件平放时的固定角度 */
  tilt: number
  children: ReactNode
}

const MAX_TILT = 16

/**
 * 被拿在手里的物件。光源在左上，所以抬得越高影子越往右下、越虚。
 * - 抓哪里哪里离手近：抓上边就上边翘起来，抓左边就左边翘起来。
 * - 拖得越快越往前倾，松手前的速度决定最后一下的倾斜。
 * 每帧直接写 style，不走 React。系统开了"减少动态效果"时只平移不倾斜。
 */
export function DragGhost({ w, h, pointer, grab, tilt, children }: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const body = bodyRef.current
    if (!outer || !body) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const clamp = (value: number) => Math.min(Math.max(value, -MAX_TILT), MAX_TILT)

    let last = { ...pointer.current }
    let prev = performance.now()
    let vx = 0
    let vy = 0
    let lift = still ? 1 : 0
    const angle = [0, 0, 0]
    const speed = [0, 0, 0]
    let frame = 0

    outer.style.transform = `translate3d(${pointer.current.x}px, ${pointer.current.y}px, 0)`
    body.style.transform = `rotate(${tilt}deg)`

    const step = (now: number) => {
      const dt = Math.min(Math.max(now - prev, 1), 50) / 16.67
      prev = now
      const p = pointer.current
      // 每帧位移（px），平滑一下免得抖
      vx += ((p.x - last.x) / dt - vx) * 0.35
      vy += ((p.y - last.y) / dt - vy) * 0.35
      last = { ...p }
      lift += (1 - lift) * Math.min(0.22 * dt, 1)

      if (!still) {
        const target = [
          clamp(grab.v * 14 - vy * 0.55),
          clamp(-grab.u * 14 + vx * 0.55),
          clamp(vx * 0.45) * 0.6,
        ]
        // 分小步积分，避免掉帧时弹簧发散，把卡甩出视口。
        const steps = Math.ceil(dt)
        const stepDt = dt / steps
        for (let step = 0; step < steps; step += 1) {
          for (let i = 0; i < 3; i += 1) {
            speed[i] += (target[i] - angle[i]) * 0.16 * stepDt
            speed[i] *= Math.pow(0.66, stepDt)
            angle[i] += speed[i] * stepDt
          }
        }
      }

      outer.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
      outer.style.setProperty("--lift", lift.toFixed(3))
      body.style.transform =
        `perspective(900px) rotateX(${angle[0].toFixed(2)}deg) rotateY(${angle[1].toFixed(2)}deg) ` +
        `rotate(${(tilt + angle[2]).toFixed(2)}deg) scale(${(1 + 0.06 * lift).toFixed(4)})`
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [pointer, grab, tilt])

  return (
    <div ref={outerRef} className="desk-ghost" style={{ width: w, height: h }}>
      <div
        ref={bodyRef}
        className="desk-ghost__body"
        style={{ transformOrigin: `${(grab.u + 0.5) * 100}% ${(grab.v + 0.5) * 100}%` }}
      >
        {children}
      </div>
    </div>
  )
}

/** 取消抬卡不等于松手；屏蔽独立于来源和飞回动画，直到这次手势结束。 */
function suppressCardDragClick(pointerId: number) {
  let timer = 0
  let disposed = false
  const cleanup = () => {
    if (disposed) return
    disposed = true
    window.clearTimeout(timer)
    window.removeEventListener("click", onClick, true)
    window.removeEventListener("pointerup", onUp, true)
    window.removeEventListener("pointermove", onMove, true)
    window.removeEventListener("pointerdown", cleanup, true)
  }
  const released = () => {
    if (disposed || timer) return
    // 真正的 pointerup 后还会发 click；没有 click 也要在本轮事件后清理。
    timer = window.setTimeout(cleanup, 0)
  }
  const onClick = (event: MouseEvent) => {
    if (event.detail === 0) return
    if (event instanceof PointerEvent && event.pointerId !== pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    cleanup()
  }
  const onUp = (event: PointerEvent) => {
    if (event.pointerId === pointerId) released()
  }
  const onMove = (event: PointerEvent) => {
    if (event.pointerId === pointerId && event.buttons === 0) cleanup()
  }
  window.addEventListener("click", onClick, true)
  window.addEventListener("pointerup", onUp, true)
  window.addEventListener("pointermove", onMove, true)
  // blur / pointercancel 后可能收不到松手；新一次按下不再属于旧手势。
  window.addEventListener("pointerdown", cleanup, true)
  return released
}

/** 书页/开包层只负责声明来源；捕获、命中、飞回和清理共用一条路径。 */
export function CardDragLayer({ root }: { root: RefObject<HTMLElement | null> }) {
  const pointer = useRef({ x: 0, y: 0 })
  const [carried, setCarried] = useState<{
    face: HTMLElement
    w: number
    h: number
    grab: { u: number; v: number }
  } | null>(null)

  useEffect(() => {
    const host = root.current
    if (!host) return
    let cleanup: (() => void) | null = null
    const onStart = (event: Event) => {
      cleanup?.()
      const drag = (event as CustomEvent<CardPointerStart>).detail
      const { source, pointerId, payload } = drag
      const face = source.querySelector<HTMLElement>(".cf") ?? source
      const rect = face.getBoundingClientRect()
      const offX = drag.x - rect.left
      const offY = drag.y - rect.top
      let moved = false
      let ended = false
      let frame = 0
      let finishClickSuppression: (() => void) | null = null
      let x = drag.x
      let y = drag.y
      let target: HTMLElement | null = null

      const hover = (next: HTMLElement | null) => {
        if (next === target) return
        target?.classList.remove("is-card-drop", "is-return-target")
        target = next
        const slot = next?.matches(".deck-slot") ? Number(next.dataset.slot) : null
        window.dispatchEvent(new CustomEvent(DECK_HOVER_EVENT, { detail: slot }))
        if (next?.matches(".desk-stage")) next.classList.add("is-card-drop")
        if (next?.matches(".deck-panel")) next.classList.add("is-return-target")
      }
      const hitTest = () => {
        frame = 0
        const hit = document.elementFromPoint(x, y)
        if (!hit || hit.closest("[inert], [data-preload]")) return hover(null)
        const slot = payload.userCardId == null ? null : hit.closest<HTMLElement>(".deck-slot[data-slot]")
        const right = payload.fromSlot == null || !hit.closest(".book__page--right")
          ? null : hit.closest<HTMLElement>(".deck-panel")
        const drop = source.closest(".op") ? hit.closest<HTMLElement>("[data-card-drop]") : null
        const desk = payload.card && !hit.closest(".book, .op") ? hit.closest<HTMLElement>(".desk-stage") : null
        hover(slot ?? right ?? drop ?? desk)
      }
      const removeListeners = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onCancel)
        window.removeEventListener("blur", cancel)
        window.removeEventListener("keydown", onKey, true)
        window.removeEventListener("pointerout", onOut)
        host.removeEventListener("lostpointercapture", onCancel)
        if (host.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId)
        cancelAnimationFrame(frame)
        frame = 0
        hover(null)
      }
      const finish = () => {
        delete source.dataset.cardDragSource
        setCarried(null)
        cleanup = null
      }
      const end = (released: boolean, accept?: () => boolean) => {
        if (ended) return
        ended = true
        if (released) finishClickSuppression?.()
        removeListeners()
        const accepted = accept?.() ?? false
        if (moved) drag.onFinish?.()
        if (!moved || accepted || !face.isConnected) return finish()
        const fromX = pointer.current.x
        const fromY = pointer.current.y
        const to = face.getBoundingClientRect()
        const start = performance.now()
        const step = (now: number) => {
          const k = Math.min((now - start) / 220, 1)
          const ease = 1 - (1 - k) ** 3
          pointer.current.x = fromX + (to.left - fromX) * ease
          pointer.current.y = fromY + (to.top - fromY) * ease
          if (k < 1) frame = requestAnimationFrame(step)
          else finish()
        }
        frame = requestAnimationFrame(step)
      }
      const cancel = () => end(false)
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return
        ev.preventDefault()
        ev.stopImmediatePropagation()
        cancel()
      }
      const onOut = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId && !ev.relatedTarget) cancel()
      }
      const onCancel = (ev: PointerEvent) => {
        if (ev.type === "lostpointercapture" && ev.target !== host) return
        if (ev.pointerId === pointerId) cancel()
      }
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || ended) return
        x = ev.clientX
        y = ev.clientY
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return cancel()
        if (!moved && Math.hypot(x - drag.x, y - drag.y) < 4) return
        if (!moved) {
          moved = true
          // 越过阈值才捕获，普通点击的 pointerup 仍落在原卡上。
          // 面板切换会把来源设为 inert；捕获留在稳定的书/开包根上。
          host.setPointerCapture(pointerId)
          const clone = face.cloneNode(true) as HTMLElement
          Object.assign(clone.style, { width: "100%", height: "100%", margin: "0", opacity: "1" })
          // 选槽高亮会重渲染 className；data 标记保留来源的压暗状态。
          source.dataset.cardDragSource = ""
          finishClickSuppression = suppressCardDragClick(pointerId)
          setCarried({ face: clone, w: rect.width, h: rect.height, grab: { u: offX / rect.width - 0.5, v: offY / rect.height - 0.5 } })
          drag.onStart?.()
        }
        pointer.current.x = x - offX
        pointer.current.y = y - offY
        if (!frame) frame = requestAnimationFrame(hitTest)
      }
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || ended) return
        onMove(ev)
        if (ended) return
        cancelAnimationFrame(frame)
        if (moved) hitTest()
        const drop = target
        // 先放开捕获，来源被接收方卸载也不会把本次落点误判成取消。
        end(true, () => {
          if (!drop) return false
          const accepted = !drop.dispatchEvent(new CustomEvent<CardPointerDrop>(CARD_POINTER_DROP_EVENT, {
            bubbles: true,
            cancelable: true,
            detail: { payload, x, y },
          }))
          if (accepted) drag.onDrop?.()
          return accepted
        })
      }
      cleanup = () => {
        const wasEnded = ended
        ended = true
        removeListeners()
        if (moved && !wasEnded) drag.onFinish?.()
        delete source.dataset.cardDragSource
        setCarried(null)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onCancel)
      window.addEventListener("blur", cancel)
      window.addEventListener("keydown", onKey, true)
      window.addEventListener("pointerout", onOut)
      host.addEventListener("lostpointercapture", onCancel)
    }
    host.addEventListener(CARD_POINTER_START_EVENT, onStart)
    return () => {
      host.removeEventListener(CARD_POINTER_START_EVENT, onStart)
      cleanup?.()
    }
  }, [root])

  return carried && createPortal(
    <DragGhost w={carried.w} h={carried.h} pointer={pointer} grab={carried.grab} tilt={0}>
      <div className="book-carry" ref={(el) => {
        if (el && el.firstChild !== carried.face) el.replaceChildren(carried.face)
      }} />
    </DragGhost>,
    document.body,
  )
}
