import { useEffect, useRef } from "react"

const loadOnEntry = new WeakMap<Element, () => void>()
let observer: IntersectionObserver | undefined

function watch(canvas: HTMLCanvasElement, load: () => void) {
  observer ??= new IntersectionObserver((entries, io) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue
      io.unobserve(target)
      const callback = loadOnEntry.get(target)
      loadOnEntry.delete(target)
      callback?.()
    }
  }, { rootMargin: "160px" })
  loadOnEntry.set(canvas, load)
  observer.observe(canvas)
  return () => {
    observer?.unobserve(canvas)
    loadOnEntry.delete(canvas)
  }
}

/** Draw once, including for GIFs. No pixel reads or CORS-enabled image request needed. */
export function StaticCardArt({ src, eager, onError }: {
  src: string
  eager: boolean
  onError: (src: string) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const width = 128
  const height = 128

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) { onError(src); return }
    let active = true
    let image: HTMLImageElement | undefined
    delete canvas.dataset.ready
    context.clearRect(0, 0, width, height)

    function load() {
      const art = new Image()
      image = art
      art.referrerPolicy = "no-referrer"
      art.src = src
      void art.decode().then(() => {
        if (!active || !canvas || !context) return
        const scale = Math.max(width / art.naturalWidth, height / art.naturalHeight)
        const w = art.naturalWidth * scale
        const h = art.naturalHeight * scale
        context.drawImage(art, (width - w) / 2, (height - h) / 2, w, h)
        canvas.dataset.ready = ""
      }).catch(() => {
        if (active) onError(src)
      }).finally(() => {
        art.removeAttribute("src")
        image = undefined
      })
    }

    const stop = eager ? (load(), undefined) : watch(canvas, load)
    return () => {
      active = false
      stop?.()
      image?.removeAttribute("src")
    }
  }, [src, eager, onError, width, height])

  return <canvas ref={ref} width={width} height={height} aria-hidden="true" />
}
