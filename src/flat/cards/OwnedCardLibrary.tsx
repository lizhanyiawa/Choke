import { useCallback, useMemo, useState } from "react"
import { FiFilter } from "react-icons/fi"

import { JOB_LABEL } from "@/card/data"
import { RARITIES, type Job } from "@/card/types"
import { fetchCardCountries, fetchUserCards, type ApiUserCard, type CardPage, type CardSort } from "@/desk/session/api"
import { FlatDialog } from "@/flat/ui/FlatDialog"
import { FlatSelect } from "@/flat/ui/FlatSelect"
import { FlatSwitch } from "@/flat/ui/FlatSwitch"
import { useResource } from "@/flat/ui/useResource"
import { JOB_ORDER } from "@choke/shared/skills"

import { CardSearch, CountrySelect, useCardSearch } from "./CardPages"

const RARITY_OPTIONS = RARITIES.map((rarity) => [rarity, rarity === "Mythic" ? "神话" : rarity === "Prismatic" ? "棱彩" : rarity] as const)
const SORT_OPTIONS: readonly (readonly [CardSort, string])[] = [["recent", "最近获得"], ["rarity", "按品质"], ["pp", "按 pp"], ["name", "按名称"]]
const TYPE_OPTIONS = [["", "全部类型"], ["pool", "公共卡"], ["hero", "本体卡"], ["mirror", "镜像卡"]] as const
const JOB_OPTIONS: readonly (readonly [Job | "", string])[] = [["", "全部职业"], ...JOB_ORDER.map((job) => [job, JOB_LABEL[job]] as const)]
const NO_COUNTRIES: readonly { code: string }[] = []

type Filters = { type: (typeof TYPE_OPTIONS)[number][0]; country: string; job: Job | ""; foil: boolean; rarity: string; sort: CardSort }
const defaults = (sort: CardSort): Filters => ({ type: "", country: "", job: "", foil: false, rarity: "", sort })

interface OwnedCardLibrary {
  search: string
  filters: Filters
  page: number
  shownPage: number
  retainingPage: boolean
  pageCount: number
  rows: ApiUserCard[] | undefined
  total: number | undefined
  error: string | null
  filtered: boolean
  initialSort: CardSort
  reload: () => void
  changeSearch: (query: string) => void
  changeFilters: (filters: Filters) => void
  changePage: (page: number) => void
}

export function useOwnedCardLibrary(userId: string, limit: number, initialSort: CardSort, keepPage = false): OwnedCardLibrary {
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState(() => defaults(initialSort))
  const [position, setPosition] = useState({ page: 0, limit })
  const query = useCardSearch(search)
  const page = position.limit === limit ? position.page : 0
  const settling = search.trim() !== query
  const scope = useMemo(() => ({ userId, limit, query, filters }), [userId, limit, query, filters])
  const [lastPage, setLastPage] = useState<{ scope: typeof scope; data: CardPage } | null>(null)
  const load = useCallback((signal: AbortSignal) => fetchUserCards(userId, {
    q: query || undefined, limit, page, signal, sort: filters.sort,
    rarity: filters.rarity || undefined, type: filters.type || undefined,
    country: filters.country || undefined, job: filters.job || undefined,
    foil: filters.foil || undefined,
  }), [userId, query, limit, page, filters])
  const { data, error, reload } = useResource(settling ? null : load)
  // 卡组翻页时，上一次成功页继续占位；筛选、尺寸或账号变化不能复用旧卡。
  if (keepPage && data && data !== lastPage?.data) setLastPage({ scope, data })
  const retained = keepPage && !data && !settling && lastPage?.scope === scope ? lastPage.data : null
  const visible = data ?? retained
  const pageCount = Math.max(1, Math.ceil((visible?.total ?? 0) / limit))
  if (position.limit !== limit) setPosition({ page: 0, limit })
  else if (data && page >= pageCount) setPosition({ page: pageCount - 1, limit })

  return {
    search, filters, page, pageCount, error, reload, total: visible?.total,
    shownPage: retained ? Math.floor(retained.offset / limit) : page,
    retainingPage: retained !== null,
    rows: page < pageCount ? visible?.rows : undefined,
    filtered: Boolean(query || filters.rarity || filters.type || filters.country || filters.job || filters.foil),
    initialSort,
    changeSearch(next: string) {
      if (next.trim() !== search.trim()) setPosition({ page: 0, limit })
      setSearch(next)
    },
    changeFilters(next: Filters) {
      if (next.sort === filters.sort && next.type === filters.type && next.country === filters.country &&
          next.job === filters.job && next.foil === filters.foil && next.rarity === filters.rarity) return
      setFilters(next)
      setPosition({ page: 0, limit })
    },
    changePage(next: number) { setPosition({ page: next, limit }) },
  }
}

function SortSelect({ filters, change }: { filters: Filters; change: (filters: Filters) => void }) {
  return <FlatSelect label="排序" value={filters.sort} options={SORT_OPTIONS} onChange={(sort) => change({ ...filters, sort })} />
}

function FilterFields({ filters, change, countries }: { filters: Filters; change: (filters: Filters) => void; countries: readonly { code: string }[] }) {
  return <>
    <SortSelect filters={filters} change={change} />
    <FlatSelect label="卡牌类型" value={filters.type} options={TYPE_OPTIONS} onChange={(type) => change({ ...filters, type })} />
    <CountrySelect value={filters.country} countries={countries} onChange={(country) => change({ ...filters, country })} />
    <FlatSelect label="职业" value={filters.job} options={JOB_OPTIONS} onChange={(job) => change({ ...filters, job })} />
    <FlatSwitch label="仅闪卡" checked={filters.foil} onChange={(foil) => change({ ...filters, foil })} />
  </>
}

export function OwnedCardToolbar({ library }: { library: OwnedCardLibrary }) {
  const { filters, changeFilters } = library
  const [draft, setDraft] = useState<Filters | null>(null)
  const countries = useResource(fetchCardCountries)
  const options = countries.data ?? NO_COUNTRIES
  const fieldError = countries.error && <div className="fl-library-filter-error" role="alert">
    {countries.error} <button type="button" className="bk-btn bk-btn--ghost" onClick={countries.reload}>重试地区列表</button>
  </div>

  return <>
    <div className="fl-library-toolbar">
      <CardSearch value={library.search} onChange={library.changeSearch} />
      <div className="fl-library-desktop fl-library-fields">
        <FilterFields filters={filters} change={changeFilters} countries={options} />
      </div>
      <button type="button" className="bk-btn fl-library-filter-trigger" aria-haspopup="dialog" onClick={() => setDraft(filters)}>
        <FiFilter aria-hidden /> 筛选
      </button>
    </div>
    {fieldError}
    <div className="fl-library-rarity">
      <div className="fl-library-chips" role="group" aria-label="品质">
        {[["", "全部"], ...RARITY_OPTIONS].map(([rarity, label]) => (
          <button type="button" key={rarity} className="bk-chip" aria-pressed={filters.rarity === rarity} onClick={() => changeFilters({ ...filters, rarity })}>{label}</button>
        ))}
      </div>
      <div className="fl-library-results">
        <span className="bk-note" role="status">{library.rows && library.total !== undefined ? `共 ${library.total.toLocaleString("en-US")} 张卡` : ""}</span>
        <div className="fl-library-mobile"><SortSelect filters={filters} change={changeFilters} /></div>
      </div>
    </div>
    {draft && <FlatDialog title="筛选卡牌" onClose={() => setDraft(null)}>
      <div className="fl-library-filter-sheet">
        <FlatSelect label="品质" value={draft.rarity} options={[["", "全部品质"], ...RARITY_OPTIONS]} onChange={(rarity) => setDraft({ ...draft, rarity })} />
        <FilterFields filters={draft} change={setDraft} countries={options} />
        {fieldError}
      </div>
      <div className="fl-library-filter-actions">
        <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setDraft(defaults(library.initialSort))}>清除条件</button>
        <button type="button" className="bk-btn bk-btn--main" onClick={() => { changeFilters(draft); setDraft(null) }}>应用筛选</button>
      </div>
    </FlatDialog>}
  </>
}
