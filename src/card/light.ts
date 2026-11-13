/**
 * 卡面受光：把光标在卡面上的相对位置写进 --mx / --my（0–1）。
 * 烫印线条、珠光纸、镭射纸和闪卡膜都按这两个变量移动反光。
 * 全局只挂一个 pointermove 监听，每帧最多写一次，不触发 React 重渲染。
 * 系统开了"减少动态效果"时不跟踪，卡面停在默认的左上受光。
 */

let installed = false
let lit: HTMLElement | null = null
let litSurfaces: HTMLElement[] = []
let pending: PointerEvent | null = null
let frame = 0

function release() {
  if (!lit) return
  for (const surface of litSurfaces) {
    surface.style.removeProperty("--mx")
    surface.style.removeProperty("--my")
  }
  litSurfaces = []
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

    let card =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(".cf")
        : null
    // 小卡格里看不出反光，每帧重绘整张卡却很贵：最近的 data-no-light 祖先里不跟踪，data-light 可以重新打开
    if (card?.closest("[data-light], [data-no-light]")?.hasAttribute("data-no-light")) card = null
    if (card !== lit) {
      release()
      lit = card
      if (lit) {
        lit.dataset.lit = ""
        litSurfaces = Array.from(
          lit.querySelectorAll<HTMLElement>(
            ".cf__bezel, .cf__sheen, .cf__seal, .cf__emblem, .cf__rarity, .cf__name-rule, .cf__foil > i:not(.cf__foil-sweep)"
          )
        )
      }
    }
    if (!lit) return

    const rect = lit.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    const mx = Math.min(Math.max(x, 0), 1).toFixed(3)
    const my = Math.min(Math.max(y, 0), 1).toFixed(3)
    for (const surface of litSurfaces) {
      surface.style.setProperty("--mx", mx)
      surface.style.setProperty("--my", my)
    }
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
