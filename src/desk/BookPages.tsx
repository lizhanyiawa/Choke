import { createContext, use, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react"

import { onIdle } from "@/lib/idle"

/** 书壳提供给面板的东西：标题、合上、翻页动画 */
export interface BookApi {
  eyebrow: string
  title: string
  active: boolean
  revision: number
  invalidate: () => void
  close: () => void
  /** 翻页：拍下当前两页，执行 update 换内容，等面板内容就绪后把真实页面翻过去。1 往后翻，-1 往前翻 */
  turn: (dir: 1 | -1, update: () => void) => void
  /** 面板内容是否就绪（加载中为 false）；翻页动画等它变 true */
  setReady: (ready: boolean) => void
  /** 预渲染只在翻页结束后进行，不抢动画帧 */
  whenIdle: () => Promise<void>
}

export const BookContext = createContext<BookApi | null>(null)

export function useBook(): BookApi {
  const book = use(BookContext)
  if (!book) throw new Error("useBook 只能用在 DeskBook 里面")
  return book
}

export interface PagerState {
  /** 从 1 开始 */
  page: number
  pages: number
  onPage: (page: number) => void
}

interface PagesProps {
  /** 加在跨页根元素上，桌面拖放靠它识别面板（如 album-panel、backpack-panel） */
  className?: string
  rootRef?: Ref<HTMLDivElement>
  left: ReactNode
  right: ReactNode
  /** 有分页时传：左页左下角"上一页"，右页右下角"下一页"，翻页带动画 */
  pager?: PagerState
  /** 内容还在加载时传 false：翻页动画等它变 true 才翻，翻过去的是加载好的页面 */
  ready?: boolean
  /** 邻页已挂载并完成布局，但不显示、不接收输入 */
  preload?: boolean
}

/**
 * 每个面板的根：一个跨页，左页顶上是标题（也是拖书的把手），右页顶上是合上按钮。
 * 两页各自滚动；内容尽量排成不用滚。
 */
export function Pages({ className, rootRef, left, right, pager, ready = true, preload = false }: PagesProps) {
  const book = useBook()
  const element = useRef<HTMLDivElement>(null)
  const prepared = useRef(false)
  useImperativeHandle(rootRef, () => element.current!, [])
  const go = (dir: 1 | -1) => {
    if (!pager) return
    const next = pager.page + dir
    if (next < 1 || next > pager.pages) return
    book.turn(dir, () => pager.onPage(next))
  }

  // 邻页预布局并解码插画；只有当前页报告就绪，图片失败仍保留正常的空图外观。
  // 翻页只等已经下载好的图解码；还在从 osu! 下载的头像 / 横幅不挡翻页（否则网慢时点了要干等 1.5 秒），下好后自己显示。
  useLayoutEffect(() => {
    const root = element.current
    if (!root) return
    if (!preload) book.setReady(false)
    if (!ready) {
      prepared.current = false
      return
    }
    let cancelled = false
    if (!prepared.current) {
      if (preload || !book.active) void root.querySelector<HTMLElement>(".cf")?.offsetWidth
      prepared.current = true
    }
    void Promise.all(Array.from(root.querySelectorAll("img")).filter((image) => image.complete && (image.loading !== "lazy" || image.offsetWidth > 0)).map((image) => image.decode().catch(() => {}))).then(() => {
      if (!cancelled && !preload) book.setReady(true)
    })
    return () => { cancelled = true }
  }, [ready, preload, book])

  return (
    <div ref={element} className={`book__spread ${className ?? ""}`} data-no-light data-preload={preload ? "" : undefined} inert={preload} aria-hidden={preload || undefined}>
      <section className="book__page book__page--left">
        <header className="book__head" data-book-grip>
          <span className="book__eyebrow">{book.eyebrow}</span>
          <h2 className="book__title">{book.title}</h2>
        </header>
        <div className="book__body">{left}</div>
        {pager && (
          <footer className="book__foot">
            <button type="button" className="book__turn" disabled={pager.page <= 1} onClick={() => go(-1)}>
              ‹ 上一页
            </button>
          </footer>
        )}
      </section>
      <section className="book__page book__page--right">
        <header className="book__head book__head--right" data-book-grip>
          <button type="button" className="book__close" onClick={book.close} aria-label="合上">
            ×
          </button>
        </header>
        <div className="book__body">{right}</div>
        {pager && (
          <footer className="book__foot">
            <span className="book__folio">
              {pager.page} <em>/ {Math.max(1, pager.pages)}</em>
            </span>
            <button
              type="button"
              className="book__turn"
              disabled={pager.page >= pager.pages}
              onClick={() => go(1)}
            >
              下一页 ›
            </button>
          </footer>
        )}
      </section>
    </div>
  )
}

/** 只保留当前跨页及相邻跨页；卡面在空闲时挂载，点击翻页只切换已布局的 DOM。 */
export function usePageCache<T extends { total: number }>(
  key: string,
  page: number,
  pageSize: number,
  load: (page: number, signal: AbortSignal) => Promise<T>,
): [number, T | null][] {
  const { whenIdle } = useBook()
  const [cache, setCache] = useState<{ key: string; pages: Map<number, T> }>(() => ({ key: "", pages: new Map() }))
  const latest = useRef(cache)
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    if (latest.current.key !== key) latest.current = { key, pages: new Map() }
    const get = async (index: number) => {
      const cached = latest.current.pages.get(index)
      if (cached) return cached
      const result = await load(index, controller.signal)
      if (controller.signal.aborted) return null
      const pages = new Map(latest.current.pages)
      pages.set(index, result)
      for (const index of pages.keys()) if (Math.abs(index - page) > 1) pages.delete(index)
      latest.current = { key, pages }
      setCache(latest.current)
      return result
    }
    void get(page).then(async (current) => {
      if (!current) return
      await whenIdle()
      if (controller.signal.aborted) return
      const count = Math.max(1, Math.ceil(current.total / pageSize))
      const preload = () => {
        void whenIdle().then(async () => {
          if (controller.signal.aborted) return
          await Promise.all([page - 1, page + 1].filter((index) => index >= 0 && index < count).map(get))
        }).catch((error: unknown) => {
          if (!controller.signal.aborted) throw error
        })
      }
      onIdle(preload, 1000)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) throw error
    })
    return () => controller.abort()
  }, [key, page, pageSize, load, whenIdle])
  const pages = cache.key === key ? cache.pages : new Map<number, T>()
  const entries: [number, T | null][] = [[page, pages.get(page) ?? null], ...Array.from(pages).filter(([index]) => index !== page && Math.abs(index - page) <= 1)]
  return entries.sort(([a], [b]) => a - b)
}
