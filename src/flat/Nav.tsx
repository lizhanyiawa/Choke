import type { ReactNode } from "react"

import { playSfx } from "@/audio/sfx"
import { featureLockHint, featureLockTag } from "@/tutorial/unlocks"

import { useFlat } from "./context"
import { Link } from "./Link"
// 导航表的文件名不能只和这个文件差大小写：Windows 和 macOS 的文件系统不分大小写，"./Nav" 会解析到它头上
import { CARD_PAGES, MORE_ITEMS, RAIL_EXTRA, RAIL_FOOT, RAIL_MAIN, TABS, hrefOf, type NavItem } from "./nav-items"
import { useQuests } from "./quests/store"
import { useSupply } from "./supply/store"
import { useRoute } from "./router"

export interface Badge {
  text: string
  /** 绿色：有东西可以领。其余是中性的数量 */
  good?: boolean
}

/** 入口上的角标，按导航项的 id 给 */
export function useBadges(): Partial<Record<string, Badge>> {
  const { packs } = useFlat()
  const quests = useQuests().data
  const supply = useSupply().data
  const packTotal = packs ? Object.values(packs).reduce((sum, count) => sum + count, 0) : 0
  return {
    packs: packTotal > 0 ? { text: packTotal > 999 ? "999+" : String(packTotal) } : undefined,
    supply: supply?.canClaim
      ? { text: supply.boxes.some((b) => !b.locked && b.full) ? "已满" : "可领", good: true }
      : undefined,
    quests: quests && quests.claimable > 0 ? { text: String(quests.claimable), good: true } : undefined,
  }
}

/**
 * 一个入口，侧栏、底部标签、「更多」页共用。三种去法：
 * 壳内换页、整页跳到还没搬过来的旧页面、或者功能没解锁（点了只弹提示）。
 */
export function NavEntry({
  item,
  className,
  current,
  children,
}: {
  item: NavItem
  className: string
  /** 不传就按地址判断是不是当前页；底部的「更多」要把标签上没有的页面也算作自己的 */
  current?: boolean
  children: ReactNode
}) {
  const { progress, notify } = useFlat()
  const route = useRoute()
  const lock = item.feature ? featureLockHint(item.feature, progress) : null
  if (lock) {
    return (
      <button
        type="button"
        className={className}
        data-locked
        data-sfx="none"
        title={lock}
        onClick={() => {
          playSfx("deny")
          notify(lock)
        }}
      >
        {children}
      </button>
    )
  }
  if (item.route) {
    return (
      <Link
        to={hrefOf(item)}
        className={className}
        aria-current={(current ?? item.route === route) ? "page" : undefined}
        data-sfx="tab"
      >
        {children}
      </Link>
    )
  }
  return (
    <a href={hrefOf(item)} className={className}>
      {children}
    </a>
  )
}

function RailEntry({ item, badge, hint }: { item: NavItem; badge?: Badge; hint?: boolean }) {
  const { progress } = useFlat()
  // 锁着的入口不显示数量，改写还差什么
  const lockTag = item.feature ? featureLockTag(item.feature, progress) : null
  return (
    <NavEntry item={item} className="fl-nav">
      <span className="fl-nav__text">
        {item.label}
        {hint && <small>{item.hint}</small>}
      </span>
      {lockTag ? (
        <span className="fl-nav__badge">{lockTag}</span>
      ) : (
        badge && (
          <span className={`fl-nav__badge ${badge.good ? "fl-nav__badge--good" : ""}`}>{badge.text}</span>
        )
      )}
    </NavEntry>
  )
}

/** 宽屏左边的侧栏 */
export function Sidebar({ brand }: { brand: string }) {
  const badges = useBadges()
  return (
    <nav className="flat-rail" aria-label="主导航">
      <img className="flat-rail__brand" src={brand} alt="Choke!" />
      {RAIL_MAIN.map((item) => (
        <RailEntry key={item.id} item={item} badge={badges[item.id]} />
      ))}
      <span className="flat-rail__sep" aria-hidden />
      {RAIL_EXTRA.map((item) => (
        <RailEntry key={item.id} item={item} badge={badges[item.id]} />
      ))}
      <div className="flat-rail__foot">
        <RailEntry item={RAIL_FOOT} hint />
      </div>
    </nav>
  )
}

/** 窄屏底部的标签栏 */
export function TabBar() {
  const route = useRoute()
  const badges = useBadges()
  // 标签上没有的页面（从「更多」进去的那些）都算在「更多」名下
  const inCards = CARD_PAGES.some((item) => item.route === route)
  const offTabs = !inCards && !TABS.some((item) => item.route === route)
  // 「更多」里有东西可以领：标签上亮一个绿点
  const moreHasGood = MORE_ITEMS.some((item) => badges[item.id]?.good)
  return (
    <nav className="flat-tabs" aria-label="主导航">
      {TABS.map((item) => {
        const isMore = item.route === "more"
        return (
          <NavEntry
            key={item.id}
            item={item}
            className="fl-tab"
            current={isMore ? offTabs || route === "more" : item.route === "album" ? inCards : undefined}
          >
            {item.tabLabel ?? item.label}
            {isMore && moreHasGood && <i className="fl-tab__dot" role="img" aria-label="有可以领的" />}
          </NavEntry>
        )
      })}
    </nav>
  )
}
