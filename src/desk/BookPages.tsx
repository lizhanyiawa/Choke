import { createContext, use, type ReactNode } from "react"

/** 书壳提供给面板的东西：标题、合上、翻页动画 */
export interface BookApi {
  eyebrow: string
  title: string
  close: () => void
  /** 播一次翻页动画：1 往后翻（右页翻到左边），-1 往前翻。和换页的 setState 写在同一个事件里 */
  turn: (dir: 1 | -1) => void
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
  left: ReactNode
  right: ReactNode
  /** 有分页时传：左页左下角"上一页"，右页右下角"下一页"，翻页带动画 */
  pager?: PagerState
}

/**
 * 每个面板的根：一个跨页，左页顶上是标题（也是拖书的把手），右页顶上是合上按钮。
 * 两页各自滚动；内容尽量排成不用滚。
 */
export function Pages({ className, left, right, pager }: PagesProps) {
  const book = useBook()
  const go = (dir: 1 | -1) => {
    if (!pager) return
    const next = pager.page + dir
    if (next < 1 || next > pager.pages) return
    book.turn(dir)
    pager.onPage(next)
  }

  return (
    <div className={`book__spread ${className ?? ""}`}>
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
