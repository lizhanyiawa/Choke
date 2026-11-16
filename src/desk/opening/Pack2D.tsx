import { useRef, useState, type CSSProperties, type PointerEvent } from "react"
import { RiArrowLeftLine } from "@remixicon/react"

import { BoosterArt } from "./BoosterArt"

interface Props {
  label: string
  accent: string
  committed: boolean
  onCommit: () => void
  onArmed: (armed: boolean) => void
}

const RELEASE_THRESHOLD = 0.62

export function Pack2D({ label, accent, committed, onCommit, onArmed }: Props) {
  const pointer = useRef<{ id: number; startX: number; span: number } | null>(
    null
  )
  const [progress, setProgress] = useState(0)
  const [pulling, setPulling] = useState(false)

  const distance = (event: PointerEvent<HTMLDivElement>) => {
    const grip = pointer.current
    return grip?.id === event.pointerId
      ? Math.min(1, Math.max(0, (grip.startX - event.clientX) / grip.span))
      : null
  }

  const release = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (pointer.current?.id !== event.pointerId) return
    pointer.current = null
    setPulling(false)
    setProgress(commit ? 1 : 0)
    onArmed(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (commit) onCommit()
  }

  return (
    <div className="pack-opening__flat-stage">
      <div
        className="pack-opening__flat"
        data-pulling={pulling}
        data-committed={committed}
        style={{ "--tear-progress": committed ? 1 : progress } as CSSProperties}
        role="button"
        aria-label="向左拖动卡包，或按回车撕开"
        tabIndex={committed ? -1 : 0}
        onKeyDown={(event) => {
          if (committed || (event.key !== "Enter" && event.key !== " ")) return
          event.preventDefault()
          onCommit()
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || pointer.current || committed) return
          pointer.current = {
            id: event.pointerId,
            startX: event.clientX,
            span: Math.max(
              56,
              event.currentTarget.getBoundingClientRect().width * 0.74
            ),
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          setPulling(true)
        }}
        onPointerMove={(event) => {
          const next = distance(event)
          if (next === null) return
          setProgress(next)
          onArmed(next >= RELEASE_THRESHOLD)
          if (next === 1) release(event, true)
        }}
        onPointerUp={(event) => {
          const next = distance(event)
          if (next !== null) release(event, next >= RELEASE_THRESHOLD)
        }}
        onPointerCancel={(event) => release(event, false)}
        onLostPointerCapture={(event) => release(event, false)}
      >
        <div className="pack-opening__flat-body">
          <BoosterArt label={label} accent={accent} />
        </div>
        <div className="pack-opening__flat-strip">
          <BoosterArt label={label} accent={accent} />
        </div>
        <div className="pack-opening__seam" aria-hidden />
        <span className="pack-opening__pull" aria-hidden>
          <RiArrowLeftLine size={21} />
        </span>
      </div>
    </div>
  )
}
