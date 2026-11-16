import type { CSSProperties, ReactNode } from "react"

import { POOL_META } from "../rarity"
import { ITEM_SIZE } from "../store"
import type { PackPool } from "../types"
import { PackArt } from "./PackArt"
import "./tabletop-reveal.css"

export const PACK_BURST_MS = 550
export const CARD_FLIGHT_MS = 620

interface PackBurstProps {
  position: { left: number; top: number }
  pool: PackPool
  tilt: number
  delay: number
  zIndex: number
}

export function TabletopPackBurst({ position, pool, tilt, delay, zIndex }: PackBurstProps) {
  const meta = POOL_META[pool]
  const art = <PackArt pool={pool} />
  const style = {
    ...position,
    width: ITEM_SIZE.pack.w,
    height: ITEM_SIZE.pack.h,
    transform: `rotate(${tilt}deg)`,
    zIndex,
    "--burst-color": meta.color,
    "--burst-delay": `${delay}ms`,
    "--burst-time": `${PACK_BURST_MS}ms`,
  } as CSSProperties

  return (
    <div className="tabletop-burst" style={style} aria-hidden>
      <div className="tabletop-burst__body">{art}</div>
      <div className="tabletop-burst__seal">{art}</div>
      <div className="tabletop-burst__edge" />
      <svg className="tabletop-burst__sparks" viewBox="0 0 220 128" aria-hidden>
        <ellipse cx="110" cy="65" rx="67" ry="24" strokeDasharray="19 11 6 13" />
        <path d="M37 60 13 52M64 44 51 24M88 39 83 12M127 40 135 14M152 49 169 32M181 61 207 54M57 77 33 87M164 80 189 93" />
        <path className="tabletop-burst__chips" d="m32 33 10 3-7 7zm64-22 7-7 4 11zm55 7 12-3-5 10zm41 23 11-3-8 11zM17 76l11-4-4 10zm185 3 13 1-9 8z" />
      </svg>
    </div>
  )
}

interface CardMotion {
  x: number
  y: number
  rise: number
  delay: number
  shine?: string
}

export function TabletopCard({ motion, children }: { motion?: CardMotion; children: ReactNode }) {
  const style = motion && {
    "--flight-x": `${motion.x}px`,
    "--flight-y": `${motion.y}px`,
    "--flight-rise": `${motion.rise}px`,
    "--flight-bank": motion.x > 0 ? "-11deg" : "11deg",
    "--flight-delay": `${motion.delay}ms`,
    "--flight-time": `${CARD_FLIGHT_MS}ms`,
    "--flight-shine": motion.shine,
  } as CSSProperties | undefined

  return (
    <div className={`tabletop-card${motion ? " is-in-flight" : ""}`} style={style}>
      <div className="tabletop-card__front">
        {children}
        {motion?.shine && <span className="tabletop-card__shine" aria-hidden />}
      </div>
      {motion && <span className="tabletop-card__back" aria-hidden>CHOKE!</span>}
    </div>
  )
}
