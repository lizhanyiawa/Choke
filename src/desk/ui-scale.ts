import { useCallback, useEffect, useState } from "react"

/**
 * 界面缩放：桌面按 1600×900 设计，大窗口自动等比放大（2560 宽、系统缩放 100% 时不再显得小），
 * 玩家还能在此基础上手动调大调小。实际倍率 = 自动倍率 × 手动档位，写在 <html> 的 CSS zoom 上，
 * 所以经 portal 挂到 body 的弹窗、拖拽影子、教程也一起缩放。
 *
 * CSS zoom 下，浏览器给的 clientX、getBoundingClientRect、innerWidth 是屏幕像素，
 * 而 style 里写的 left/top/width 是缩放前的 CSS 像素。桌面代码到处把两者混着算，
 * 所以这里统一把这几个读数换算回缩放前的坐标：倍率为 1 时完全不改变行为。
 */

const BASE_W = 1600
const BASE_H = 900
const AUTO_MIN = 1
const AUTO_MAX = 1.75
/** 手动档位：70% 到 150%，每点一下变 5% */
export const UI_SCALE_STEPS: readonly number[] = Array.from({ length: 17 }, (_, i) => (70 + i * 5) / 100)
const STORAGE_KEY = "ui-scale"

let zoom = 1

const innerWidthGet = (
  Object.getOwnPropertyDescriptor(window, "innerWidth") ??
  Object.getOwnPropertyDescriptor(Window.prototype, "innerWidth")
)!.get!
const innerHeightGet = (
  Object.getOwnPropertyDescriptor(window, "innerHeight") ??
  Object.getOwnPropertyDescriptor(Window.prototype, "innerHeight")
)!.get!

let patched = false
function patchCoordinates() {
  if (patched) return
  patched = true

  for (const key of ["clientX", "clientY", "x", "y"] as const) {
    const get = Object.getOwnPropertyDescriptor(MouseEvent.prototype, key)!.get!
    Object.defineProperty(MouseEvent.prototype, key, {
      configurable: true,
      get() {
        return get.call(this) / zoom
      },
    })
  }

  const rectOf = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function () {
    const r = rectOf.call(this)
    return zoom === 1 ? r : new DOMRect(r.x / zoom, r.y / zoom, r.width / zoom, r.height / zoom)
  }

  const fromPoint = Document.prototype.elementFromPoint
  Document.prototype.elementFromPoint = function (x: number, y: number) {
    return fromPoint.call(this, x * zoom, y * zoom)
  }
  const allFromPoint = Document.prototype.elementsFromPoint
  Document.prototype.elementsFromPoint = function (x: number, y: number) {
    return allFromPoint.call(this, x * zoom, y * zoom)
  }

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => innerWidthGet.call(window) / zoom,
  })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => innerHeightGet.call(window) / zoom,
  })
}

function readStep(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY))
  return UI_SCALE_STEPS.includes(saved) ? saved : 1
}

/** 桌面专用：挂载时接管 <html> 的缩放，卸载时还原 */
export function useUiScale() {
  const [step, setStepState] = useState(readStep)

  const setStep = useCallback((next: number) => {
    localStorage.setItem(STORAGE_KEY, String(next))
    setStepState(next)
  }, [])

  useEffect(() => {
    patchCoordinates()
    const root = document.documentElement
    const apply = () => {
      const fit = Math.min(innerWidthGet.call(window) / BASE_W, innerHeightGet.call(window) / BASE_H)
      const auto = Math.min(AUTO_MAX, Math.max(AUTO_MIN, fit))
      zoom = Math.round(auto * step * 100) / 100
      root.style.zoom = zoom === 1 ? "" : String(zoom)
    }
    apply()
    window.addEventListener("resize", apply)
    return () => {
      window.removeEventListener("resize", apply)
      zoom = 1
      root.style.zoom = ""
    }
  }, [step])

  return { step, setStep }
}
