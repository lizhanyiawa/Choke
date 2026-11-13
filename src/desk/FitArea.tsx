import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react"

interface Props {
  className: string
  cols: number
  rows: number
  gapX: number
  gapY: number
  /** 高度方向额外留的余量（px） */
  slack?: number
  style?: CSSProperties
  children: ReactNode
}

/**
 * 卡格区域：占满页面剩下的高度，整排整排放下不用滚。卡宽取"按宽排满"和"按高排满"里小的那个，
 * 写进本元素的 --w（px），只在区域尺寸变化时重算。
 * 不用 size 容器查询：那样每次换页新挂的卡都要先布局、按容器尺寸重算样式、再布局一遍，翻页一次多 100ms 以上。
 * CSS 里这个元素要 flex 撑开 + contain: size layout style，尺寸不看内容。
 */
export function FitArea({ className, cols, rows, gapX, gapY, slack = 0, style, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = (width: number, height: number) => {
      const byWidth = (width - (cols - 1) * gapX) / cols
      const byHeight = ((height - slack - (rows - 1) * gapY) / rows) * (2 / 3)
      const w = Math.max(0, Math.floor(Math.min(byWidth, byHeight) * 100) / 100)
      el.style.setProperty("--w", `${w}px`)
    }
    // clientWidth 不受书展开时的缩放动画影响；它含 padding，要扣掉，和 ResizeObserver 的 contentRect 口径一致
    const pad = getComputedStyle(el)
    apply(
      el.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight),
      el.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom),
    )
    const observer = new ResizeObserver(([entry]) => apply(entry.contentRect.width, entry.contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [cols, rows, gapX, gapY, slack])

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}
