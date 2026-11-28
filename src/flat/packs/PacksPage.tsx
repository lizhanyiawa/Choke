import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { playSfx } from "@/audio/sfx"
import { RARITIES } from "@/card/types"
import { toDeskCard } from "@/desk/lib/drag"
import type { CardData, PackPool } from "@/desk/lib/types"
import { resolvePulledCards } from "@/desk/opening/cards"
import { PackOpener, type OriginRect } from "@/desk/opening/PackOpener"
import { ApiError, fetchGameConfig, openPack } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { Link } from "@/flat/Link"
import { refreshQuests } from "@/flat/quests/store"
import { FLAT_ROUTES, navigate, useRouteSearch } from "@/flat/router"
import { FlatSelect } from "@/flat/ui/FlatSelect"
import { FlatSwitch } from "@/flat/ui/FlatSwitch"
import { useResource } from "@/flat/ui/useResource"
import { refreshProgress } from "@/tutorial/store"
import { featureLockHint } from "@/tutorial/unlocks"

import { PackImage, PackList, PackLoadError, visiblePacks, type PackEntry } from "./packCatalog"
import "./packs.css"

const SKIP_KEY = "choke.flat.skip-pack-animation"
const PERCENT = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 4 })

type Settlement = { id: number; cards: CardData[]; bonus?: CardData; pool: PackPool; skip: boolean; origin?: OriginRect }

export function PacksPage() {
  // FlatShell 在账号变化时重新挂载页面。
  const { user, progress, packs, packError, setPacks, refreshPacks, notify } = useFlat()
  const config = useResource(fetchGameConfig)
  const search = useRouteSearch()
  const packsList = visiblePacks(config.data, packs)
  const wanted = new URLSearchParams(search).get("pool")
  const selected = packsList.find((pack) => pack.id === wanted)
    ?? (wanted === null ? packsList.find((pack) => pack.event) : undefined)
    ?? packsList.find((pack) => pack.id === "normal")
    ?? packsList[0]
  const backpackLock = featureLockHint("backpack", progress)
  const [skip, setSkip] = useState(() => localStorage.getItem(SKIP_KEY) === "1")
  const [busy, setBusy] = useState<"open" | null>(null)
  const [settlement, setSettlement] = useState<Settlement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uncertainStock, setUncertainStock] = useState<{ counts: typeof packs; pool: PackPool } | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const number = useRef(0)
  const artRef = useRef<HTMLDivElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const stock = (pool: PackPool) => uncertainStock && uncertainStock.counts === packs && uncertainStock.pool === pool ? 0 : packs?.[pool] ?? 0

  function select(pool: string) {
    if (inFlight.current || pool === selected?.id) return
    playSfx("tick")
    setError(null)
    navigate(`${FLAT_ROUTES.packs}?${new URLSearchParams({ pool })}`, { replace: true })
  }

  async function draw(pool: PackPool, repeating = false) {
    if (inFlight.current || !config.data || stock(pool) <= 0) return
    inFlight.current = true
    setBusy("open")
    setError(null)
    playSfx(repeating ? "open" : "pick")
    const rect = repeating || skip ? null : artRef.current?.getBoundingClientRect()
    const origin = rect?.width ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined
    try {
      const result = await openPack(pool, config.data.packSize)
      void refreshQuests()
      void refreshProgress(user.id)
      if (!mounted.current) {
        refreshPacks()
        return
      }
      if (result.packs) setPacks(result.packs)
      else {
        setUncertainStock({ counts: packs, pool })
        refreshPacks()
      }
      const pulled = result.bonus ? [...result.results, result.bonus] : result.results
      const faces = await resolvePulledCards(pulled)
      if (!mounted.current) return
      const cards = faces.map((face, index) => toDeskCard(face, pulled[index]!.userCardId))
      const bonus = result.bonus ? cards.pop() : undefined
      setSettlement({ id: ++number.current, cards, bonus, pool, skip, origin })
    } catch (reason) {
      if (!mounted.current) return
      const message = reason instanceof Error ? reason.message : "开包失败"
      const code = reason instanceof ApiError ? reason.code : undefined
      if (!code || code === "no_packs" || code === "network" || code === "timeout") {
        setUncertainStock({ counts: packs, pool })
        refreshPacks()
      }
      setError(message)
      if (repeating) playSfx("error")
      else notify(message, "error")
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(null)
    }
  }

  const total = packs ? packsList.reduce((sum, pack) => sum + (packs[pack.id] ?? 0), 0) : null
  const count = selected ? stock(selected.id) : 0

  return (
    <div className="fl-page fl-packs">
      <header className="fl-page__head">
        <h1 className="fl-page__title" ref={headingRef} tabIndex={-1}>开包</h1>
        <span className="fl-page__spacer" />
        {!backpackLock && <Link className="fl-link" to={FLAT_ROUTES.backpack}>查看背包</Link>}
      </header>
      {config.error && <PackLoadError message={config.error} retry={config.reload} />}
      {packError && <PackLoadError message={packError} retry={refreshPacks} />}
      {!selected && !config.error && <p role="status">{config.data ? "没有可用的卡包类型" : "加载卡包配置…"}</p>}
      <div className="fl-packs__layout">
        <div className="fl-packs__side">
          {selected && <div className="fl-packs__picker">
              <PackList title="选择卡包" total={total}
                choices={packsList.map((pack) => ({ ...pack, count: packs ? stock(pack.id) : null }))}
                selected={selected.id} onSelect={select} disabled={busy !== null} />
              <FlatSelect className="fl-packs__select" label="选择卡包" value={selected.id} disabled={busy !== null} onChange={select}
                options={packsList.map((pack) => [pack.id, `${pack.name}${packs ? ` · 库存 ${stock(pack.id)} 包` : ""}`])} />
          </div>}
        </div>
        {selected && (
          <div className="fl-packs__main">
            <section className="fl-card fl-packs__detail" aria-busy={busy === "open"}>
              <div className="fl-packs__art" ref={artRef}><PackImage id={selected.id} /></div>
              <div className="fl-pack-detail__text">
                <h2>{selected.name}</h2>
                <p>{packs ? `库存 ${count} 包` : packError ? "库存读取失败" : "加载库存…"} · 每包 {config.data?.packSize} 张</p>
                <FlatSwitch className="fl-packs__skip" label="跳过动画" checked={skip} disabled={busy !== null} onChange={(checked) => {
                  setSkip(checked)
                  localStorage.setItem(SKIP_KEY, checked ? "1" : "0")
                }} />
              </div>
              <button type="button" ref={openRef} className="bk-btn bk-btn--main fl-packs__open" disabled={busy !== null || count <= 0} onClick={() => void draw(selected.id)}>
                {busy === "open" ? "开启中…" : !packs ? "库存未就绪" : count <= 0 ? "没有卡包" : "开 1 包"}
              </button>
              {!settlement && error && <p className="bk-error fl-packs__error" role="alert">{error}</p>}
            </section>
            <PackOdds pack={selected} />
          </div>
        )}
      </div>
      {settlement && createPortal(
        <PackOpener key={settlement.id} mode="flat" cards={settlement.cards} bonus={settlement.bonus} pool={settlement.pool} origin={settlement.origin} skip={settlement.skip}
          busy={busy === "open"} error={error} remaining={stock(settlement.pool)}
          onOpenNext={() => void draw(settlement.pool, true)}
          onClose={() => {
            setSettlement(null)
            window.requestAnimationFrame(() => {
              const button = openRef.current
              const target = button && !button.disabled ? button : headingRef.current
              target?.focus({ preventScroll: true })
            })
          }} />,
        document.body,
      )}
    </div>
  )
}

function PackOdds({ pack }: { pack: PackEntry }) {
  const weight = RARITIES.reduce((sum, rarity) => sum + Math.max(0, pack.weights[rarity] ?? 0), 0)
  const odds = weight > 0 ? RARITIES.map((rarity) => ({ label: rarity, chance: (pack.weights[rarity] ?? 0) / weight })) : []
  return (
    <section className="fl-card fl-packs__odds" aria-label="单张概率">
      <h2 className="fl-card__title">{pack.event ? "单张基础概率" : "单张概率"}</h2>
      <dl>
        {[...odds, { label: "闪卡", chance: pack.foilRate }].map(({ label, chance }) => (
          <div key={label}><dt>{label}</dt><dd>{PERCENT.format(chance)}</dd></div>
        ))}
      </dl>
    </section>
  )
}
