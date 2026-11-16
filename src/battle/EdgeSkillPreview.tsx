import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import { RiArrowLeftLine, RiPauseFill, RiPlayFill, RiRepeat2Line, RiRestartLine } from "@remixicon/react"

import { RARITY_LABEL } from "@/card/data"
import { SUBJOBS, type SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { SearchField } from "@/client/SearchField"
import { RARITY_COLOR } from "@/desk/rarity"
import { EdgeBoard } from "./EdgeArena"
import { EdgeSkillStoryboard } from "./EdgeSkillStoryboard"
import { snapshotEdgeBattle } from "./edgeBattle"
import { EDGE_RARITIES, skillPool } from "./edgeSkills/catalog"
import { advanceSkillPreview, createSkillPreview, listSkillPreviews, type SkillPreviewEntry, type SkillPreviewRun, type SkillPreviewScene } from "./edgeSkills/preview"
import "./edge-skill-preview.css"

type Kind = SkillPreviewEntry["kind"]
const kinds = { all: "全部", active: "主动", passive: "被动", gold: "黄金" } as const
const rarityWords: Record<Rarity, string> = {
  C: "普通", UC: "非凡 罕见", R: "稀有", E: "史诗", L: "传说", Radiant: "璀璨 辉光", Prismatic: "棱彩",
}
const defaultSkill = "ranger/Prismatic/A1"
const rowHeight = 50
const overscan = 5

function tint(rarity: Rarity): CSSProperties {
  return { "--preview-rarity": RARITY_COLOR[rarity] } as CSSProperties
}

function SkillList({ results, selectedIndex, choose }: {
  results: SkillPreviewEntry[]; selectedIndex: number; choose: (entry: SkillPreviewEntry) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const selectedRow = useRef<HTMLButtonElement>(null)
  const focusSelection = useRef(false)
  const [{ first, end }, setWindow] = useState({ first: 0, end: overscan })

  const measure = useCallback((container: HTMLDivElement) => {
    const first = Math.max(0, Math.floor(container.scrollTop / rowHeight) - overscan)
    const end = Math.ceil((container.scrollTop + container.clientHeight) / rowHeight) + overscan
    setWindow((current) => current.first === first && current.end === end ? current : { first, end })
  }, [])

  useLayoutEffect(() => {
    const container = list.current
    if (!container) return
    const resize = new ResizeObserver(() => measure(container))
    resize.observe(container)
    return () => resize.disconnect()
  }, [measure])

  useLayoutEffect(() => {
    const container = list.current
    if (!container) return
    if (selectedIndex >= 0) {
      const top = selectedIndex * rowHeight
      const bottom = top + rowHeight
      if (top < container.scrollTop) container.scrollTop = top
      else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight
    }
    measure(container)
    if (focusSelection.current) {
      focusSelection.current = false
      selectedRow.current?.focus({ preventScroll: true })
    }
  }, [measure, results, selectedIndex])

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (selectedIndex < 0 || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const next = event.key === "Home" ? 0 : event.key === "End" ? results.length - 1
      : Math.max(0, Math.min(results.length - 1, selectedIndex + (event.key === "ArrowDown" ? 1 : -1)))
    if (next === selectedIndex) return
    focusSelection.current = true
    choose(results[next])
  }

  const rows = results.slice(first, end).map((entry, offset) => ({ entry, index: first + offset }))
  // Keep the selected button focusable even when the user scrolls it out of view.
  if (selectedIndex >= 0 && selectedIndex < first) rows.unshift({ entry: results[selectedIndex], index: selectedIndex })
  if (selectedIndex >= end) rows.push({ entry: results[selectedIndex], index: selectedIndex })
  return (
    <div className="edge-preview__results" ref={list} onScroll={(event) => measure(event.currentTarget)}
      onKeyDown={navigate} role="group" aria-label="技能列表">
      {results.length > 0 ? (
        <div className="edge-preview__rows" style={{ height: results.length * rowHeight }}>
          {rows.map(({ entry, index }) => {
            const active = index === selectedIndex
            return <button type="button" key={entry.skill.id} className="edge-preview__row"
              style={{ ...tint(entry.rarity), top: index * rowHeight, height: rowHeight }}
              aria-pressed={active} tabIndex={active ? 0 : -1} ref={active ? selectedRow : undefined}
              data-preview-index={index} onClick={() => choose(entry)}>
              <i aria-hidden />
              <span><b>{entry.skill.name}</b><small>{SUBJOBS[entry.job].label} · {RARITY_LABEL[entry.rarity]}</small></span>
              <small>{kinds[entry.kind]}</small>
            </button>
          })}
        </div>
      ) : <p role="status">没有匹配的技能</p>}
    </div>
  )
}

function SkillPlayback({ entry, speed, setSpeed, loop, setLoop, initialTime, scene, setScene }: {
  entry: SkillPreviewEntry; speed: number; setSpeed: (speed: number) => void; loop: boolean; setLoop: (loop: boolean) => void
  initialTime?: number
  scene: SkillPreviewScene; setScene: (scene: SkillPreviewScene) => void
}) {
  const [view, setView] = useState(() => {
    const run = createSkillPreview(entry, scene)
    const time = Math.max(0, Math.min(run.duration, initialTime ?? 0))
    if (time > 0) advanceSkillPreview(run, time)
    return { time, duration: run.duration, viewBox: run.viewBox, battle: snapshotEdgeBattle(run.battle) }
  })
  const live = useRef<SkillPreviewRun | null>(null)
  const clock = useRef(view.time)
  const [playing, setPlaying] = useState(initialTime === undefined)
  const { duration } = view
  const finished = view.time >= duration

  const seek = useCallback((time: number, explicit = true) => {
    const previous = live.current
    const run = !previous || time < clock.current ? createSkillPreview(entry, scene) : previous
    const frame = run.frame
    live.current = run
    clock.current = time
    advanceSkillPreview(run, time)
    if (explicit || run !== previous || run.frame !== frame || time >= run.duration) {
      setView({ time, duration: run.duration, viewBox: run.viewBox, battle: snapshotEdgeBattle(run.battle) })
    }
  }, [entry, scene])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      if (document.hidden) return
      const elapsed = Math.max(0, Math.min(.05, (now - last) / 1000))
      const time = Math.min(duration, clock.current + elapsed * speed)
      last = now
      seek(time === duration && loop ? 0 : time, false)
      if (time < duration || loop) frame = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    const syncVisibility = () => {
      cancelAnimationFrame(frame)
      if (document.hidden) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
    syncVisibility()
    document.addEventListener("visibilitychange", syncVisibility)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("visibilitychange", syncVisibility)
    }
  }, [duration, loop, playing, seek, speed])

  function replay() {
    seek(0)
    setPlaying(true)
  }

  const pool = entry.kind === "gold" ? skillPool(entry.job, entry.rarity) : null
  const pair = entry.kind === "gold" && pool ? pool.active[entry.skill.active].name + " + " + pool.passive[entry.skill.passive].name : ""
  return (
    <section className="edge-preview__viewer client-panel" aria-label="技能播放" style={tint(entry.rarity)}>
      <div className="edge-preview__details">
        <div className="edge-preview__title">
          <h1>{entry.skill.name}</h1>
          <span>{SUBJOBS[entry.job].label} · {RARITY_LABEL[entry.rarity]} · {kinds[entry.kind]}</span>
        </div>
        {pair && <div className="edge-preview__pair">{pair}</div>}
        <p>{entry.skill.description}</p>
      </div>
      <div className="edge-preview__canvas">
        <EdgeBoard battle={view.battle} selected={view.battle.team[0]} viewBox={view.viewBox} />
      </div>
      <div className="edge-preview__transport">
        <div className="edge-preview__timeline">
          <input type="range" aria-label="预览进度" aria-valuetext={view.time.toFixed(1) + " 秒"}
            min={0} max={duration} step={.01} value={view.time} onPointerDown={() => setPlaying(false)} onChange={(event) => {
              setPlaying(false)
              seek(event.target.valueAsNumber)
            }} />
          <span>{view.time.toFixed(1)} / {duration.toFixed(1)} 秒</span>
        </div>
        <div className="edge-preview__buttons">
          <button type="button" className="client-key client-key--primary" onClick={() => finished ? replay() : setPlaying(!playing)}>
            {playing ? <RiPauseFill size={16} aria-hidden /> : <RiPlayFill size={16} aria-hidden />}
            {playing ? "暂停" : "播放"}
          </button>
          <button type="button" className="client-key" onClick={replay}><RiRestartLine size={16} aria-hidden />重播</button>
          <button type="button" className="client-key edge-preview__repeat" aria-pressed={loop} aria-label="循环播放"
            title="循环播放" onClick={() => setLoop(!loop)}><RiRepeat2Line size={16} aria-hidden /></button>
          <select className="client-select" aria-label="预览场景" value={scene} onChange={(event) => setScene(event.target.value as SkillPreviewScene)}>
            <option value="sample">单招</option>
            <option value="squad">队友接招</option>
          </select>
          <select className="client-select" aria-label="播放速度" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            {[.5, 1, 2].map((rate) => <option value={rate} key={rate}>{rate}×</option>)}
          </select>
        </div>
      </div>
    </section>
  )
}

export function EdgeSkillPreview({ backHref, backLabel = "战斗大厅", matchRarity = false }: {
  backHref: string; backLabel?: string; matchRarity?: boolean
}) {
  const [library] = useState(listSkillPreviews)
  const [initial] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const entry = library.find(({ skill }) => skill.id === params.get("skill"))
    const raw = params.get("t")
    const time = raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : undefined
    const scene: SkillPreviewScene = params.get("scene") === "squad" ? "squad" : "sample"
    return { entry, time, scene, sheet: params.get("sheet") === "1" }
  })
  const [kind, setKind] = useState<"all" | Kind>(initial.entry?.kind ?? "all")
  const [job, setJob] = useState<SubJobId | "">(initial.entry?.job ?? "")
  const [rarity, setRarity] = useState<Rarity | "">(matchRarity ? initial.entry?.rarity ?? "" : "")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState(initial.entry?.skill.id ?? defaultSkill)
  const [play, setPlay] = useState(0)
  const [scene, setScene] = useState<SkillPreviewScene>(initial.scene)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const { results, counts } = useMemo(() => {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    const matching = library.filter((entry) => {
      if ((job && job !== entry.job) || (rarity && rarity !== entry.rarity)) return false
      if (!words.length) return true
      const { skill, rarity: rank } = entry
      const label = [skill.id, skill.name, SUBJOBS[entry.job].label, RARITY_LABEL[rank], rarityWords[rank], kinds[entry.kind]].join(" ").toLocaleLowerCase()
      return words.every((word) => label.includes(word))
    })
    const counts = { all: matching.length, active: 0, passive: 0, gold: 0 }
    for (const entry of matching) counts[entry.kind]++
    return { counts, results: kind === "all" ? matching : matching.filter((entry) => entry.kind === kind) }
  }, [job, kind, library, query, rarity])
  const selectedIndex = results.length ? Math.max(0, results.findIndex((entry) => entry.skill.id === selectedId)) : -1
  const selected = results[selectedIndex]

  function choose(entry: SkillPreviewEntry) {
    setSelectedId(entry.skill.id)
    setPlay((value) => value + 1)
  }

  if (initial.sheet) return <EdgeSkillStoryboard library={library} focus={selected ?? library[0]} initialScene={initial.scene} />
  const sheet = new URLSearchParams(window.location.search)
  sheet.set("sheet", "1")
  sheet.set("skill", selected?.skill.id ?? defaultSkill)
  if (scene === "squad") sheet.set("scene", "squad")
  else sheet.delete("scene")
  sheet.delete("t")
  return (
    <div className="battle-page edge-preview">
      <header className="client-header battle-top">
        <a className="battle-back" href={backHref}><RiArrowLeftLine size={19} aria-hidden />{backLabel}</a>
        <b>技能预览</b>
        <a className="battle-back edge-preview__sheet-link" href={"?" + sheet}>分镜</a>
      </header>
      <main className="edge-preview__layout">
        <section className="edge-preview__library client-panel" aria-label="技能库">
          <div className="edge-preview__filters">
            <SearchField value={query} onChange={setQuery} label="搜索技能" />
            <div className="edge-preview__selects">
              <select className="client-select" aria-label="子职业" value={job} onChange={(event) => setJob(event.target.value as SubJobId | "")}>
                <option value="">全部职业</option>
                {Object.values(SUBJOBS).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
              </select>
              <select className="client-select" aria-label="稀有度" value={rarity} onChange={(event) => setRarity(event.target.value as Rarity | "")}>
                <option value="">全部稀有度</option>
                {EDGE_RARITIES.map((rank) => <option key={rank} value={rank}>{RARITY_LABEL[rank]}</option>)}
              </select>
            </div>
            <div className="edge-preview__kinds" role="group" aria-label="技能类型">
              {(Object.entries(kinds) as ["all" | Kind, string][]).map(([id, label]) => (
                <button key={id} type="button" className="client-key" aria-pressed={kind === id} onClick={() => setKind(id)}>
                  {label}<small>{counts[id]}</small>
                </button>
              ))}
            </div>
          </div>
          <SkillList results={results} selectedIndex={selectedIndex} choose={choose} />
        </section>
        {selected && <SkillPlayback key={selected.skill.id + ":" + scene + ":" + play} entry={selected} speed={speed} setSpeed={setSpeed} loop={loop}
          setLoop={setLoop} scene={scene} setScene={setScene}
          initialTime={scene === initial.scene && selected === initial.entry && play === 0 ? initial.time : undefined} />}
      </main>
    </div>
  )
}
