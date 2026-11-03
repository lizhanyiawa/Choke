import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CardData } from "../types"

export interface OriginRect {
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  cards: CardData[]
  onDone: () => void
  onQuick: () => void
  onCancel: () => void
  /** 桌面上卡包的屏幕矩形，用来做进入/退出时的原地放大 */
  originRect?: OriginRect
}

function encodeCards(cards: CardData[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(cards))
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/**
 * 3D 开包层。开包本身跑在 public/pack3d 的独立 WebGL 页面里，
 * 这里负责：从桌面卡包原位放大、接收抽卡完成事件、结束后缩回桌面。
 */
export function Pack3D({ cards, onDone, onQuick, onCancel, originRect }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [done, setDone] = useState(false)
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)

  const payload = useMemo(() => encodeCards(cards), [cards])
  const src = useMemo(
    () => `/pack3d/index.html?embed=1&cards=${encodeURIComponent(payload)}`,
    [payload]
  )

  const zoom = useMemo(() => {
    if (!originRect) return { scale: 0.55, dx: 0, dy: 0 }
    const scale = Math.max(0.28, Math.min(0.82, originRect.width / 300))
    return {
      scale,
      dx: originRect.left + originRect.width / 2 - window.innerWidth / 2,
      dy: originRect.top + originRect.height / 2 - window.innerHeight / 2,
    }
  }, [originRect])

  useLayoutEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      if (e.data?.type === "choke-pack-done") setDone(true)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !done) onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [done, onCancel])

  const finishTo = useCallback(
    (next: () => void) => {
      if (!done || closing) return
      setClosing(true)
      window.setTimeout(next, 320)
    },
    [closing, done]
  )

  const collect = useCallback(() => finishTo(onDone), [finishTo, onDone])
  const quick = useCallback(() => finishTo(onQuick), [finishTo, onQuick])

  const style = {
    transform: entered && !closing
      ? "translate(0px, 0px) scale(1)"
      : `translate(${zoom.dx}px, ${zoom.dy}px) scale(${closing ? zoom.scale * 0.55 : zoom.scale})`,
    opacity: closing ? 0 : entered ? 1 : 0.35,
  }

  return (
    <div className={`opener3d ${closing ? "is-closing" : ""}`}>
      <div className="opener3d__backdrop" />
      <div className="opener3d__frame" style={style}>
        <iframe
          ref={iframeRef}
          className="opener3d__frame-inner"
          src={src}
          title="Choke! 3D 开包"
          allow="fullscreen"
        />
      </div>

      <div className="opener3d__hint">
        {done ? "卡牌已抽完，收入桌面后会留在桌上" : "点击卡包 · 拖动拉片向左撕开"}
      </div>

      {!done && (
        <button type="button" className="opener3d__close" onClick={onCancel} aria-label="返回桌面">
          ×
        </button>
      )}

      {done && (
        <div className="opener3d__actions">
          <button type="button" className="desk-button opener3d__quick" onClick={quick}>
            快速存入卡册
          </button>
          <button type="button" className="desk-button" onClick={collect}>
            收入桌面
          </button>
        </div>
      )}
    </div>
  )
}
