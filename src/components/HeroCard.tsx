import * as React from "react"
import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
  type MotionStyle,
} from "framer-motion"

import { cn } from "@/lib/utils"

import "./hero-card.css"

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(Math.max(value, min), max)

const round = (value: number, precision = 3) =>
  parseFloat(value.toFixed(precision))

/* 把 0–100 的指针位置重映射到一段区间（移植自参考实现的 adjust） */
const adjust = (
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
) => round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin))

export type HeroCardProps = {
  /** 整卡正面图，建议 734×1024（63:88） */
  front?: string
  alt?: string
  /** 与参考实现一致：rare holo 时启用标准卡的全息箔 */
  rarity?: string
  className?: string
}

const SPRING = { stiffness: 220, damping: 27, mass: 0.7 }

export function HeroCard({
  front = "/img/demo-front.png",
  alt = "示例卡牌（图片待替换）",
  rarity = "rare holo",
  className,
}: HeroCardProps) {
  const rotatorRef = React.useRef<HTMLButtonElement>(null)
  const dragging = React.useRef(false)
  const reduced = useReducedMotion()

  /* 与参考实现同名的两组旋转：rotate.x 写入 --rotate-x（rotateY），
     rotate.y 写入 --rotate-y（rotateX） */
  const tiltA = useSpring(0, SPRING)
  const tiltB = useSpring(0, SPRING)

  const glareX = useSpring(50, SPRING)
  const glareY = useSpring(50, SPRING)
  const foil = useSpring(0, { stiffness: 260, damping: 30, mass: 0.6 })

  const bgX = useSpring(50, SPRING)
  const bgY = useSpring(50, SPRING)

  const pointerX = useMotionTemplate`${glareX}%`
  const pointerY = useMotionTemplate`${glareY}%`
  const rotateX = useMotionTemplate`${tiltA}deg`
  const rotateY = useMotionTemplate`${tiltB}deg`
  const backgroundX = useMotionTemplate`${bgX}%`
  const backgroundY = useMotionTemplate`${bgY}%`

  const cardStyle = React.useMemo(
    () =>
      ({
        "--pointer-x": pointerX,
        "--pointer-y": pointerY,
        "--rotate-x": rotateX,
        "--rotate-y": rotateY,
        "--background-x": backgroundX,
        "--background-y": backgroundY,
        "--card-opacity": foil,
      }) as unknown as MotionStyle,
    [backgroundX, backgroundY, foil, pointerX, pointerY, rotateX, rotateY]
  )

  const aim = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch" && !dragging.current) return

    const el = rotatorRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const px = clamp(round((100 / rect.width) * (event.clientX - rect.left)))
    const py = clamp(round((100 / rect.height) * (event.clientY - rect.top)))
    const center = { x: px - 50, y: py - 50 }

    if (!reduced) {
      tiltA.set(round(-(center.x / 3.5)))
      tiltB.set(round(center.y / 3.5))
    }

    bgX.set(adjust(px, 0, 100, 37, 63))
    bgY.set(adjust(py, 0, 100, 33, 67))
    glareX.set(px)
    glareY.set(py)
    foil.set(1)
  }

  const reset = () => {
    tiltA.set(0)
    tiltB.set(0)
    bgX.set(50)
    bgY.set(50)
    glareX.set(50)
    glareY.set(50)
    foil.set(0)
  }

  const endDrag = () => {
    if (!dragging.current) return
    dragging.current = false
    reset()
  }

  return (
    <div className={cn("holo-card-scene", className)}>
      <motion.div
        className="holo-card"
        data-rarity={rarity}
        style={cardStyle}
        initial={reduced ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="holo-card__translater">
          <button
            ref={rotatorRef}
            type="button"
            className="holo-card__rotator"
            aria-label="移动或拖拽指针查看全息箔效果"
            onPointerMove={aim}
            onPointerDown={(event) => {
              if (event.pointerType !== "touch") return
              dragging.current = true
              aim(event)
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={() => {
              if (!dragging.current) reset()
            }}
          >
            <div className="holo-card__back" aria-hidden />

            <div className="holo-card__front">
              <img
                src={front}
                alt={alt}
                width={734}
                height={1024}
                draggable={false}
                fetchPriority="high"
              />
              <div className="holo-card__shine" aria-hidden />
              <div className="holo-card__glare" aria-hidden />
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default HeroCard
