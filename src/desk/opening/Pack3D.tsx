import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { CardData } from "../types"

export interface OriginRect {
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  cards: CardData[]
  label: string
  accent: string
  originRect?: OriginRect
  onCommit: () => void
  onArmed: (armed: boolean) => void
  onSkip: () => void
  onFallback: () => void
}

function encodeCards(cards: CardData[]) {
  const preview = cards.map(({ name, rarity, foil }) => ({
    name,
    rarity,
    foil,
  }))
  const bytes = new TextEncoder().encode(JSON.stringify(preview))
  return btoa(String.fromCharCode(...bytes))
}

export function Pack3D({
  cards,
  label,
  accent,
  originRect,
  onCommit,
  onArmed,
  onSkip,
  onFallback,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [entered, setEntered] = useState(false)

  const src = useMemo(() => {
    const query = new URLSearchParams({
      embed: "1",
      cards: encodeCards(cards),
      label,
      accent,
    })
    return `/pack3d/index.html?${query}`
  }, [cards, label, accent])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow
      )
        return
      switch (event.data?.type) {
        case "choke-pack-ready":
          onArmed(false)
          break
        case "choke-pack-armed":
          onArmed(true)
          break
        case "choke-pack-burst":
          onCommit()
          break
        case "choke-pack-skip":
          onSkip()
          break
        case "choke-pack-error":
          onFallback()
          break
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [onArmed, onCommit, onFallback, onSkip])

  const scale = originRect
    ? Math.max(0.32, Math.min(0.78, originRect.width / 300))
    : 0.74
  const dx = originRect
    ? originRect.left + originRect.width / 2 - window.innerWidth / 2
    : 0
  const dy = originRect
    ? originRect.top + originRect.height / 2 - window.innerHeight / 2
    : 0

  return (
    <div
      className="pack-opening__frame"
      style={{
        transform: entered
          ? undefined
          : `translate(${dx}px, ${dy}px) scale(${scale})`,
      }}
    >
      <iframe ref={iframeRef} src={src} title="Choke! 3D 开包" />
    </div>
  )
}
