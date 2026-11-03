import { useMemo, useState, type CSSProperties, type PointerEvent } from "react"
import { RARITY_COLOR } from "./rarity"
import type { CardData } from "./types"

const CREAM = "#F4F4F6"

/** 不同品质的覆膜强度：C 哑光，UC 轻亮膜，R 以上全息，Prismatic 最强 */
const FOIL_LEVEL: Record<string, number> = {
  C: 0,
  UC: 0.22,
  R: 0.55,
  E: 0.75,
  L: 0.95,
  Radiant: 1.08,
  Prismatic: 1.3,
}

const FOIL =
  "repeating-linear-gradient(110deg, #c929f1, #0dbde9, #21e985, #eedf10, #f80e35, #c929f1, #0dbde9, #21e985, #eedf10, #f80e35)"

interface Props {
  card: CardData
  width: number
  height: number
  /** 指针跟随倾斜；拖拽物件时关闭，避免和拖动冲突 */
  tilt?: boolean
  style?: CSSProperties
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function rainbowGradient(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  ;["#c929f1", "#0dbde9", "#21e985", "#eedf10", "#f80e35", "#c929f1"].forEach((c, i, arr) =>
    g.addColorStop(i / (arr.length - 1), c)
  )
  return g
}

/** 把卡片数据画成一张完整卡图，交给 CSS 全息层去叠光和倾斜 */
function cardImage(card: CardData) {
  const W = 512
  const H = 716
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  const accent = RARITY_COLOR[card.rarity] || "#3CBADB"
  const prismatic = card.rarity === "Prismatic"
  const starOf: Record<string, number> = {
    C: 5.0, UC: 5.5, R: 6.2, E: 7.0, L: 7.6, Radiant: 8.0, Prismatic: 8.5,
  }
  const star = starOf[card.rarity] ?? 6.0
  let hue = 0
  const seed = card.name + card.rarity
  for (let i = 0; i < seed.length; i++) hue = (hue * 31 + seed.charCodeAt(i)) >>> 0
  hue %= 360

  // 卡底
  ctx.fillStyle = "#0b0c12"
  ctx.fillRect(0, 0, W, H)

  // 外框：Prismatic 用彩虹，其他用品级色
  ctx.lineWidth = 12
  ctx.strokeStyle = prismatic ? rainbowGradient(ctx, 0, 0, W, H) : accent
  roundRect(ctx, 6, 6, W - 12, H - 12, 22)
  ctx.stroke()

  // 画框
  const ax = 26
  const ay = 26
  const aw = W - 52
  const ah = 452
  const g = ctx.createLinearGradient(ax, ay, ax + aw, ay + ah)
  g.addColorStop(0, `hsl(${hue} 55% 26%)`)
  g.addColorStop(0.55, `hsl(${(hue + 35) % 360} 60% 18%)`)
  g.addColorStop(1, `hsl(${(hue + 70) % 360} 55% 12%)`)
  ctx.fillStyle = g
  roundRect(ctx, ax, ay, aw, ah, 14)
  ctx.fill()

  // 判定圈 + 大字形
  ctx.save()
  roundRect(ctx, ax, ay, aw, ah, 14)
  ctx.clip()
  ctx.strokeStyle = "rgba(255,255,255,0.16)"
  ctx.lineWidth = 1
  for (let r = 36; r < 470; r += 26) {
    ctx.beginPath()
    ctx.arc(W / 2, ay + ah / 2, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.textAlign = "center"
  ctx.font = card.isHero ? '800 104px "Inter", "Segoe UI", sans-serif' : '800 150px "Inter", "Segoe UI", sans-serif'
  ctx.fillText(card.isHero ? "NO.1" : (card.name.trim()[0] || "?").toUpperCase(), W / 2, ay + ah / 2 + 52)
  ctx.restore()

  // 星等徽章
  ctx.fillStyle = "rgba(0,0,0,0.45)"
  roundRect(ctx, W - 148, 40, 108, 38, 8)
  ctx.fill()
  ctx.fillStyle = "#fff"
  ctx.font = "600 21px Consolas, monospace"
  ctx.textAlign = "center"
  ctx.fillText("★ " + star.toFixed(1), W - 94, 66)

  // 名称 / 作者 / 品级
  ctx.textAlign = "left"
  ctx.fillStyle = "#fff"
  ctx.font = '600 34px "Inter", "Segoe UI", sans-serif'
  const name = card.name.length > 21 ? card.name.slice(0, 20) + "…" : card.name
  ctx.fillText(card.isHero ? "你的本体卡" : name, 30, 540)

  ctx.fillStyle = "rgba(255,255,255,0.45)"
  ctx.font = "17px Consolas, monospace"
  ctx.fillText(card.mapper || "CHOKE!", 30, 576)

  ctx.fillStyle = accent
  ctx.font = "600 18px Consolas, monospace"
  ctx.fillText(card.rarity.toUpperCase(), 30, 678)

  ctx.fillStyle = "rgba(255,255,255,0.9)"
  ctx.textAlign = "right"
  ctx.font = '700 24px "Inter", "Segoe UI", sans-serif'
  ctx.fillText(String(Math.round(star * 120)), W - 30, 680)

  return canvas.toDataURL("image/png")
}

export function HoloCard2D({ card, width, height, tilt = true, style }: Props) {
  const [p, setP] = useState({ x: 50, y: 50, active: false })
  const src = useMemo(() => cardImage(card), [card])
  const level = FOIL_LEVEL[card.rarity] ?? 0
  const k = p.active && tilt ? 1 : 0
  const rotY = ((p.x - 50) / 50) * 8 * k
  const rotX = ((50 - p.y) / 50) * 8 * k
  const x = p.x.toFixed(1)
  const y = p.y.toFixed(1)

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!tilt) return
    const r = e.currentTarget.getBoundingClientRect()
    setP({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
      active: true,
    })
  }

  return (
    <div
      onPointerMove={onMove}
      onPointerLeave={() => setP({ x: 50, y: 50, active: false })}
      style={{ width, height, perspective: 900, ...style }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
          transition: p.active ? "transform 0.08s linear" : "transform 0.5s ease",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 14,
            overflow: "hidden",
            background: CREAM,
            boxShadow: "8px 8px 0 0 #0B0D10, 0 18px 30px -18px rgba(0,0,0,.6)",
            border: "3px solid #0B0D10",
          }}
        >
          <img
            src={src}
            alt={card.name}
            draggable={false}
            style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
          />

          {/* 全息箔：只盖住画框 */}
          {level > 0 && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: FOIL,
                backgroundSize: "320% 320%",
                backgroundPosition: `${x}% ${y}%`,
                mixBlendMode: "color-dodge",
                opacity: (0.16 + 0.44 * k) * level,
                clipPath: "inset(3.4% 4.7% 34.4% 4.7% round 10px)",
                pointerEvents: "none",
              }}
            />
          )}

          {/* 光斑 / 亮膜反射 */}
          {level > 0.15 && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,.92) 0%, rgba(255,255,255,.25) 32%, rgba(0,0,0,.36) 100%)`,
                mixBlendMode: "overlay",
                opacity: (0.14 + 0.5 * k) * level,
                pointerEvents: "none",
              }}
            />
          )}

          {/* Prismatic 再加一层很轻的虹彩边 */}
          {card.rarity === "Prismatic" && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: `conic-gradient(from ${p.x * 3.6}deg at 50% 50%, rgba(201,41,241,.35), rgba(13,189,233,.35), rgba(33,233,133,.3), rgba(238,223,16,.3), rgba(248,14,53,.35), rgba(201,41,241,.35))`,
                mixBlendMode: "soft-light",
                opacity: 0.35 + 0.25 * k,
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
