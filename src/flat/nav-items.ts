import type { FeatureId } from "@choke/shared/unlocks"

import { FLAT_ROUTES, type FlatRouteId } from "./router"

export interface NavItem {
  id: string
  label: string
  /** 底部标签上用的短名字；不写就用 label */
  tabLabel?: string
  /** 一句话说明：「更多」页的卡片上写，侧栏里只有家园写 */
  hint: string
  /** 新界面自己的页面：壳内换页 */
  route?: FlatRouteId
  /** 还没搬过来的功能：整页跳到原来的桌面 */
  href?: string
  /** 有解锁条件的功能：没解锁时入口显示成锁着的，点了只弹提示 */
  feature?: FeatureId
}

const desk = (panel: string) => `/home?panel=${panel}`

const ITEMS = {
  home: { id: "home", label: "首页", hint: "今天能做什么都在这里", route: "home" },
  expedition: { id: "expedition", label: "远征", hint: "带上卡组出门闯地图", route: "expedition" },
  packs: { id: "packs", label: "开包", hint: "开卡包拿新卡", route: "packs", feature: "packs" },
  supply: { id: "supply", label: "补给箱", hint: "离线自动攒物资、选倾向、一键领取", route: "supply" },
  album: {
    id: "album",
    label: "卡册",
    tabLabel: "卡牌",
    hint: "看卡、养卡、分解和回收",
    route: "album",
    feature: "album",
  },
  deck: { id: "deck", label: "卡组", hint: "排出战的七张卡", route: "deck", feature: "deck" },
  quests: { id: "quests", label: "成就", hint: "成就进度、每日签到与推荐谱面", route: "quests", feature: "quests" },
  // 商店不设解锁条件（《养成与经济前端对接清单》§9），所以没有 feature
  shop: { id: "shop", label: "商店", hint: "每天每周限购的补给和碎片箱", route: "shop" },
  codex: { id: "codex", label: "图鉴", hint: "全部卡牌和收集进度", route: "codex", feature: "codex" },
  // 市场没绑定 osu! 也能进去看，只是不能交易，所以入口不上锁
  market: { id: "market", label: "市场", hint: "和别的玩家买卖卡牌", route: "market" },
  backpack: {
    id: "backpack",
    label: "背包",
    hint: "卡包、碎片与经验池",
    route: "backpack",
    feature: "backpack",
  },
  account: { id: "account", label: "账号", hint: "绑定 osu!、签到、退出登录", href: desk("account") },
  more: { id: "more", label: "更多", hint: "其余的入口", route: "more" },
  desk: { id: "desk", label: "家园", hint: "原来的桌面", href: "/home" },
} satisfies Record<string, NavItem>

/** 侧栏上半：常用的 */
export const RAIL_MAIN: readonly NavItem[] = [
  ITEMS.home,
  ITEMS.expedition,
  ITEMS.packs,
  ITEMS.supply,
  ITEMS.album,
  ITEMS.deck,
  ITEMS.quests,
  ITEMS.shop,
  ITEMS.codex,
]
/** 侧栏下半：不常用的 */
export const RAIL_EXTRA: readonly NavItem[] = [ITEMS.market, ITEMS.backpack]
export const RAIL_FOOT: NavItem = ITEMS.desk

/** 窄屏的底部标签：最多五个，放不下的都在「更多」里 */
export const TABS: readonly NavItem[] = [ITEMS.home, ITEMS.expedition, ITEMS.packs, ITEMS.album, ITEMS.more]

/** 手机「卡牌」标签下的三个子页，共用侧栏的解锁规则。 */
export const CARD_PAGES: readonly NavItem[] = [ITEMS.album, ITEMS.deck, ITEMS.codex]

/** 「更多」页：底部标签里没有的全部入口 */
export const MORE_ITEMS: readonly NavItem[] = [
  ITEMS.supply,
  ITEMS.quests,
  ITEMS.shop,
  ITEMS.deck,
  ITEMS.codex,
  ITEMS.market,
  ITEMS.backpack,
  ITEMS.account,
  ITEMS.desk,
]

export const hrefOf = (item: NavItem) => (item.route ? FLAT_ROUTES[item.route] : (item.href ?? "/home"))
