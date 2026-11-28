import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { FiChevronLeft, FiChevronRight, FiSearch } from "react-icons/fi"

import { NavEntry } from "@/flat/Nav"
import { CARD_PAGES } from "@/flat/nav-items"
import { FlatSelect } from "@/flat/ui/FlatSelect"

import "./card-pages.css"

const PHONE = "(max-width: 619px)"
const DESKTOP = "(min-width: 900px)"
const phone = () => window.matchMedia(PHONE).matches
function subscribePhone(notify: () => void) {
  const media = window.matchMedia(PHONE)
  media.addEventListener("change", notify)
  return () => media.removeEventListener("change", notify)
}

export function useCardPageSize<T>(desktop: T, mobile: T) {
  return useSyncExternalStore(subscribePhone, phone) ? mobile : desktop
}

export function useOwnedCardGrid(fixedLimit?: number) {
  const results = useRef<HTMLDivElement>(null)
  const baseLimit = useCardPageSize(24, 9)
  const [desktopLimit, setDesktopLimit] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (fixedLimit !== undefined) return
    const area = results.current
    if (!area) return
    const desktop = window.matchMedia(DESKTOP)
    const measure = () => {
      if (!desktop.matches) {
        setDesktopLimit(null)
        return
      }
      const style = getComputedStyle(area)
      const columns = Number(style.getPropertyValue("--library-columns"))
      const gap = parseFloat(style.getPropertyValue("--library-row-gap"))
      const columnGap = parseFloat(style.getPropertyValue("--library-column-gap"))
      const tileCap = parseFloat(style.getPropertyValue("--owned-tile-width"))
      const caption = parseFloat(style.getPropertyValue("--owned-caption-height"))
      const pager = parseFloat(style.getPropertyValue("--library-pager-height")) + parseFloat(style.rowGap)
      const available = area.clientHeight - pager
      const columnWidth = (area.clientWidth - (columns - 1) * columnGap) / columns
      const fit = (rows: number) => Math.min(tileCap, columnWidth, ((available - gap * (rows - 1)) / rows - caption) / 1.5)
      // 行数优先：尽量排满多行（卡面不小于 150px），再让卡宽去适配剩下的高度
      const maxRows = Math.max(1, Math.floor(24 / columns))
      let rows = maxRows
      while (rows > 1 && fit(rows) < 150) rows--
      area.style.setProperty("--owned-tile-fit", `${Math.max(0, Math.floor(fit(rows)))}px`)
      setDesktopLimit(columns * rows)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    desktop.addEventListener("change", measure)
    return () => { observer.disconnect(); desktop.removeEventListener("change", measure) }
  }, [fixedLimit])

  return { results, limit: fixedLimit ?? desktopLimit ?? baseLimit }
}

export function useCardSearch(value: string) {
  const [query, setQuery] = useState(() => value.trim())
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value.trim()), 240)
    return () => window.clearTimeout(timer)
  }, [value])
  return query
}

export function CardPageTabs() {
  return (
    <nav className="fl-library-tabs bk-seg" aria-label="卡牌页面">
      {CARD_PAGES.map((item) => (
        <NavEntry key={item.id} item={item} className="fl-library-tab">{item.label}</NavEntry>
      ))}
    </nav>
  )
}

export function CardSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="fl-library-search">
      <FiSearch aria-hidden />
      <input
        className="bk-input"
        type="search"
        aria-label="搜索玩家名"
        placeholder="搜索玩家名"
        maxLength={64}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

const regions = new Intl.DisplayNames(["zh-CN"], { type: "region" })
function countryName(code: string) {
  try {
    return regions.of(code) ?? code
  } catch {
    return code
  }
}

export function CountrySelect({ value, onChange, countries }: {
  value: string
  onChange: (value: string) => void
  countries: readonly { code: string }[]
}) {
  return <FlatSelect
    label="国家或地区"
    value={value}
    options={[["", "全部国家 / 地区"], ...countries.map(({ code }) => [code, `${countryName(code)}（${code}）`] as const)]}
    onChange={onChange}
  />
}

const number = new Intl.NumberFormat("en-US")
export function CardPager({ page, pageCount, onChange, disabled = false, pending = false }: {
  page: number
  pageCount: number
  onChange: (next: number) => void
  disabled?: boolean
  pending?: boolean
}) {
  const here = Math.min(page, Math.max(0, pageCount - 1))
  return (
    <nav className="fl-library-pager" aria-label="分页">
      <button type="button" className="bk-btn bk-btn--ghost" aria-label="上一页" disabled={disabled || here === 0} aria-disabled={pending || undefined} onClick={() => { if (!pending) onChange(here - 1) }}>
        <FiChevronLeft aria-hidden />
      </button>
      <span className="bk-note" aria-live="polite">第 <b className="bk-num">{number.format(here + 1)} / {number.format(Math.max(1, pageCount))}</b> 页</span>
      <button type="button" className="bk-btn bk-btn--ghost" aria-label="下一页" disabled={disabled || here + 1 >= pageCount} aria-disabled={pending || undefined} onClick={() => { if (!pending) onChange(here + 1) }}>
        <FiChevronRight aria-hidden />
      </button>
    </nav>
  )
}
