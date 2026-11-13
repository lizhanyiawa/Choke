import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"

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
