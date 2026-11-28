import { useCallback, useId, useRef, useState } from "react"
import { FiFilter } from "react-icons/fi"

import { GameCardFace } from "@/card/GameCardFace"
import { ELEMENT_LABEL, JOB_LABEL, battlePower, formatNo } from "@/card/data"
import {
  defToFace,
  fetchCodexPage,
  fetchUserCodexStats,
  type ApiCardDef,
  type CodexStats,
} from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { FlatDialog } from "@/flat/ui/FlatDialog"
import { FlatSelect } from "@/flat/ui/FlatSelect"
import { FlatSwitch } from "@/flat/ui/FlatSwitch"
import { useResource } from "@/flat/ui/useResource"
import { describeSkill } from "@choke/shared/skill-check"
import { SKILLS, skillById, skillDealtTo, type SkillDef } from "@choke/shared/skills"

import {
  CardPageTabs,
  CardPager,
  CardSearch,
  CountrySelect,
  useCardPageSize,
  useCardSearch,
} from "./CardPages"
import "./codex.css"

const RARITIES = [
  ["C", "C"], ["UC", "UC"], ["R", "R"], ["E", "E"], ["L", "L"],
  ["Mythic", "神话"], ["Prismatic", "棱彩"],
] as const
const SORTS = { rarity: "稀有度", pp: "pp", name: "名字" } as const
const OWNED = [["all", "全部"], ["owned", "已收集"], ["unseen", "未收集"]] as const

type Filters = { country: string; rarity: string; sort: keyof typeof SORTS }
const SORT_OPTIONS: readonly (readonly [Filters["sort"], string])[] = [["rarity", "按稀有度"], ["pp", "按 pp"], ["name", "按名字"]]
type Owned = (typeof OWNED)[number][0]
const DEFAULT_FILTERS: Filters = { country: "", rarity: "", sort: "rarity" }
const NO_COUNTRIES: CodexStats["countries"] = []
const number = new Intl.NumberFormat("en-US")
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 })

function rarityCount(stats: CodexStats, rarity: string) {
  const entry = stats.byRarity[rarity]
  return `${number.format(entry?.owned ?? 0)} / ${number.format(entry?.total ?? 0)}`
}

function CodexSort({ value, onChange }: { value: Filters["sort"]; onChange: (value: Filters["sort"]) => void }) {
  return <FlatSelect label="排序" value={value} options={SORT_OPTIONS} onChange={onChange} />
}

function FilterDialog({ filters, stats, onApply, onClose }: {
  filters: Filters
  stats: CodexStats | null
  onApply: (filters: Filters) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(filters)
  return (
    <FlatDialog title="筛选图鉴" onClose={onClose}>
      <form className="fl-codex-filter" onSubmit={(event) => { event.preventDefault(); onApply(draft) }}>
        <div>
          <span>国家 / 地区</span>
          <CountrySelect value={draft.country} onChange={(country) => setDraft({ ...draft, country })} countries={stats?.countries ?? NO_COUNTRIES} />
        </div>
        <div>
          <span>品质</span>
          <FlatSelect label="品质" value={draft.rarity}
            options={[["", "全部品质"], ...RARITIES.map(([key, label]) => [key, stats ? `${label} · ${rarityCount(stats, key)}` : label] as const)]}
            onChange={(rarity) => setDraft({ ...draft, rarity })} />
        </div>
        <div>
          <span>排序</span>
          <CodexSort value={draft.sort} onChange={(sort) => setDraft({ ...draft, sort })} />
        </div>
        <div className="fl-codex-filter__actions">
          <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setDraft(DEFAULT_FILTERS)}>清除条件</button>
          <button type="submit" className="bk-btn bk-btn--main">应用筛选</button>
        </div>
      </form>
    </FlatDialog>
  )
}

function SkillList({ skills }: { skills: readonly SkillDef[] }) {
  return <ul className="fl-codex-skill-list">
    {skills.map((skill) => <li key={skill.id}>
      <b>{skill.name}</b>
      <span>{ELEMENT_LABEL[skill.element]} · {skill.passive ? "被动" : `${skill.ap} AP`}</span>
      <p>{describeSkill(skill)}</p>
    </li>)}
  </ul>
}

function CodexDetail({ row, onClose }: { row: ApiCardDef; onClose: () => void }) {
  const sample = row.ownedPreview
  const face = defToFace(row, sample)
  const actual = face.skills.flatMap(({ id }) => skillById(id) ?? [])
  const possible = Object.values(SKILLS).filter((skill) => skill.job === row.job && skillDealtTo(skill, row.rarity))
  const rarity = RARITIES.find(([id]) => id === row.rarity)?.[1] ?? row.rarity
  return (
    <FlatDialog title={row.name} onClose={onClose}>
      <div className="fl-codex-detail">
        <div className="fl-codex-detail__face"><GameCardFace card={face} /></div>
        <div className="fl-codex-detail__info">
          <p>{rarity} · {JOB_LABEL[row.job]} · {row.owned ? "已收集" : "未收集"}</p>
          <dl>
            <div><dt>基础战力</dt><dd>{number.format(battlePower(face))}</dd></div>
            <div><dt>图鉴编号</dt><dd>{formatNo(row.no, row.total).replace("/", " / ")}</dd></div>
          </dl>
          <p>图鉴只读，实际养成数据以卡册为准。</p>
        </div>
      </div>
      <section className="fl-codex-skills" aria-label="技能">
        {row.owned && <>
          <h3>持有实例技能{sample?.serial ? ` · 第 ${number.format(sample.serial)} 张` : ""}</h3>
          {actual.length ? <SkillList skills={actual} /> : <p className="bk-note">这个实例没有技能记录。</p>}
        </>}
        <details open={!row.owned}>
          <summary>可能抽到的技能（{possible.length} 项）</summary>
          <p className="bk-note">技能在发卡时按职业和品质抽取，同名卡的技能也可能不同。</p>
          {possible.length ? <SkillList skills={possible} /> : <p className="bk-note">该职业与品质暂无技能记录。</p>}
        </details>
      </section>
    </FlatDialog>
  )
}

export function CodexPage() {
  const { user: { id: userId } } = useFlat()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [search, setSearch] = useState("")
  const [owned, setOwned] = useState<Owned>("all")
  const [darken, setDarken] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [detail, setDetail] = useState<ApiCardDef | null>(null)
  const [paging, setPaging] = useState({ index: 0, size: 12 })
  const limit = useCardPageSize(12, 6)
  const query = useCardSearch(search)
  const searching = search.trim() !== query
  const pageIndex = paging.size === limit ? paging.index : 0
  const progressRef = useRef<HTMLHeadingElement>(null)
  const resultsRef = useRef<HTMLParagraphElement>(null)
  const resultsId = useId()

  const loadStats = useCallback((signal: AbortSignal) => fetchUserCodexStats(userId, signal), [userId])
  const stats = useResource(loadStats)
  const { country, rarity, sort } = filters
  const loadPage = useCallback((signal: AbortSignal) => fetchCodexPage({
    userId, country, rarity, sort, q: query, owned, limit, offset: pageIndex * limit, signal,
  }), [userId, country, rarity, sort, query, owned, limit, pageIndex])
  const result = useResource(searching ? null : loadPage)
  const data = searching ? null : result.data
  const pageCount = data ? Math.max(1, Math.ceil(data.total / limit)) : 0
  const needsClamp = data !== null && pageIndex >= pageCount
  // A narrower layout starts at page one; a shrinking result set lands on its last page.
  if (paging.size !== limit || needsClamp) {
    setPaging({ index: needsClamp ? pageCount - 1 : 0, size: limit })
  }

  function changeFilters(next: Filters) {
    if (next.country === country && next.rarity === rarity && next.sort === sort) return
    setFilters(next)
    setPaging({ index: 0, size: limit })
  }

  const progress = stats.data && (stats.data.total > 0 ? stats.data.owned / stats.data.total : 0)
  const mobileRarity = RARITIES.find(([key]) => key === rarity)?.[1]
  const ready = needsClamp ? null : data
  const loading = !ready && (searching || !result.error)
  return (
    <section className="fl-page fl-codex" aria-label="图鉴">
      <h1 className="fl-page__title">图鉴</h1>
      <CardPageTabs />
      <div className="fl-card fl-codex-progress">
        <div>
          <h2 ref={progressRef} tabIndex={-1}>收集进度</h2>
          <p><strong>{stats.data ? number.format(stats.data.owned) : "—"}</strong> / {stats.data ? number.format(stats.data.total) : "—"} 种</p>
        </div>
        <div className="fl-codex-progress__meter">
          <strong>{progress === null ? "—" : percent.format(progress)}</strong>
          {progress !== null
            ? <progress aria-label="收集进度" value={progress} max={1} />
            : <div className="fl-codex-progress__track" aria-hidden="true" />}
        </div>
        {stats.error ? (
          <div className="fl-codex-state" role="alert">
            {stats.error} <button type="button" className="bk-btn bk-btn--ghost" onClick={() => {
              progressRef.current?.focus({ preventScroll: true })
              stats.reload()
            }}>重试统计</button>
          </div>
        ) : !stats.data && <span className="sr-only" role="status">正在加载收集统计…</span>}
      </div>

      <div className="fl-codex-tools">
        <CardSearch value={search} onChange={(value) => {
          if (value.trim() !== search.trim()) setPaging({ index: 0, size: limit })
          setSearch(value)
        }} />
        <div className="fl-library-desktop fl-codex-tools__selects">
          <CountrySelect value={country} onChange={(value) => changeFilters({ ...filters, country: value })} countries={stats.data?.countries ?? NO_COUNTRIES} />
          <CodexSort value={sort} onChange={(value) => changeFilters({ ...filters, sort: value })} />
        </div>
        <button type="button" className="fl-library-mobile fl-codex-tools__open" aria-haspopup="dialog" onClick={() => setShowFilters(true)}>
          <FiFilter aria-hidden="true" /> 筛选
        </button>
        <div className="fl-codex-owned" role="group" aria-label="收集状态">
          {OWNED.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={owned === key} onClick={() => {
              if (owned === key) return
              setOwned(key)
              setPaging({ index: 0, size: limit })
            }}>{label}</button>
          ))}
        </div>
        <FlatSwitch className="fl-codex-darken" label="暗化未收集" checked={darken} onChange={setDarken} />
      </div>

      <div className="fl-library-desktop fl-codex-rarities" role="group" aria-label="品质">
        <button type="button" aria-pressed={!rarity} onClick={() => changeFilters({ ...filters, rarity: "" })}>全部</button>
        {RARITIES.map(([key, label]) => (
          <button type="button" key={key} aria-pressed={rarity === key} onClick={() => changeFilters({ ...filters, rarity: key })}>
            <strong>{label}</strong><span>{stats.data ? rarityCount(stats.data, key) : "— / —"}</span>
          </button>
        ))}
      </div>

      <div className="fl-codex-results" aria-labelledby={resultsId} role="region" aria-busy={loading}>
        <div className="fl-codex-results__head">
          <p id={resultsId} tabIndex={-1} ref={resultsRef} role="status">
            {ready ? `共 ${number.format(ready.total)} 种` : loading ? "正在加载图鉴…" : "图鉴结果"}
          </p>
          <span className="fl-library-mobile">{mobileRarity && `${mobileRarity} · `}按{SORTS[sort]}排序</span>
        </div>
        {!searching && result.error ? (
          <div className="fl-codex-state" role="alert">
            {result.error} <button type="button" className="bk-btn bk-btn--ghost" onClick={() => {
              resultsRef.current?.focus({ preventScroll: true })
              result.reload()
            }}>重试</button>
          </div>
        ) : loading ? (
          <div className="fl-library-grid" aria-hidden="true">
            {Array.from({ length: limit }, (_, index) => <div key={index} className="fl-codex-placeholder" />)}
          </div>
        ) : ready && (ready.rows.length ? (
          <div className="fl-library-grid">
            {ready.rows.map((row) => {
              const hidden = darken && !row.owned
              return (
                <button type="button" key={row.id} className="fl-library-tile fl-codex-tile" aria-haspopup="dialog"
                  aria-label={hidden ? "未收集卡牌，查看详情" : `${row.name}，${row.owned ? "已收集" : "未收集"}，查看详情`}
                  onClick={() => setDetail(row)}>
                  {hidden ? <ShadowFace /> : <GameCardFace card={defToFace(row, row.ownedPreview)} />}
                </button>
              )
            })}
          </div>
        ) : <p className="fl-codex-state">没有符合条件的卡牌。</p>)}
        {ready && ready.total > 0 && (
          <CardPager page={pageIndex} pageCount={pageCount} onChange={(index) => {
            resultsRef.current?.focus()
            setPaging({ index, size: limit })
          }} />
        )}
      </div>

      {showFilters && <FilterDialog filters={filters} stats={stats.data} onClose={() => setShowFilters(false)} onApply={(next) => {
        changeFilters(next)
        setShowFilters(false)
      }} />}
      {detail && <CodexDetail row={detail} onClose={() => setDetail(null)} />}
    </section>
  )
}

function ShadowFace() {
  return (
    <span className="fl-codex-shadow" aria-hidden="true">
      <svg viewBox="0 0 112 151" preserveAspectRatio="none" fill="none">
        <path d="M11 28 56 7l45 21v94l-45 21-45-21Z M17 33l39-19 39 19v85l-39 18-39-18Z" />
      </svg>
      <b>?</b>
      <small>未收集</small>
    </span>
  )
}
