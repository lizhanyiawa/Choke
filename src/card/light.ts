/**
 * 卡面受光：把光标在卡面上的相对位置写进 --mx / --my（0–1）。
 * 烫印线条、珠光纸、镭射纸和闪卡膜都按这两个变量移动反光。
 * 全局只挂一个 pointermove 监听，每帧最多写一次，不触发 React 重渲染。
 * 系统开了"减少动态效果"时不跟踪，卡面停在默认的左上受光。
 */

let installed = false
let lit: HTMLElement | null = null
let pending: PointerEvent | null = null
let frame = 0

function release() {
  if (!lit) return
  lit.style.removeProperty("--mx")
  lit.style.removeProperty("--my")
  delete lit.dataset.lit
  lit = null
}

export function trackCardLight() {
  if (installed) return
  installed = true

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

  const flush = () => {
    frame = 0
    const event = pending
    pending = null
    if (!event || reduceMotion.matches) {
      release()
      return
    }

    const card =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(".cf")
        : null
    if (card !== lit) {
      release()
      lit = card
      if (lit) lit.dataset.lit = ""
    }
    if (!lit) return

    const rect = lit.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    lit.style.setProperty("--mx", Math.min(Math.max(x, 0), 1).toFixed(3))
    lit.style.setProperty("--my", Math.min(Math.max(y, 0), 1).toFixed(3))
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      pending = event
      frame ||= requestAnimationFrame(flush)
    },
    { passive: true }
  )
  document.documentElement.addEventListener("pointerleave", () => {
    pending = null
    release()
  })
}
