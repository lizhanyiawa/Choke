import { useCallback, useRef, useState } from "react"
import { RARITY_LABEL } from "@/card/data"
import { GameCardFace } from "@/card/GameCardFace"
import { CardDetail } from "@/desk/panels/cards/CardDetail"
import { dismantleCardsBatch, fetchRecycleQuota, fetchUserCards, recycleCards, toFace, type ApiUserCard } from "@/desk/session/api"
import { fetchCurrentExpedition } from "@/flat/expedition/api"
import { useFlat } from "@/flat/context"
import { Link } from "@/flat/Link"
import { ListCardDialog } from "@/flat/market/ListCardDialog"
import { refreshQuests } from "@/flat/quests/store"
import { OWN_LISTINGS_PATH, useRouteSearch } from "@/flat/router"
import { FlatDialog } from "@/flat/ui/FlatDialog"
import { useResource } from "@/flat/ui/useResource"
import { featureLockHint } from "@/tutorial/unlocks"
import { essenceOf, npcRecycleValue, NPC_RECYCLE_DAILY_LIMIT } from "@choke/shared/economy"
import { ITEMS, SHARDS_PER_DISMANTLE, shardItemId, type ItemStack } from "@choke/shared/items"
import { isHeroCardId } from "@choke/shared/progression"
import { CardPageTabs, CardPager, useOwnedCardGrid } from "./CardPages"
import { OwnedCardToolbar, useOwnedCardLibrary } from "./OwnedCardLibrary"
import "./album.css"

type Operation = "dismantle" | "recycle"
const VERB = { dismantle: "分解", recycle: "NPC 回收" }
const BATCH_MAX = 60

function rewardText(stacks: readonly ItemStack[], essence: number) {
  const counts = new Map<ItemStack["itemId"], number>()
  for (const { itemId, count } of stacks) {
    counts.set(itemId, (counts.get(itemId) ?? 0) + count)
  }
  const labels = [...counts].map(([id, count]) => `${ITEMS[id].name} ×${count}`)
  if (essence) labels.push(`${essence} 精华`)
  return labels.join(" · ")
}

function estimate(operation: Operation, rows: readonly ApiUserCard[]) {
  if (operation === "recycle") return `${rows.reduce((sum, row) => sum + npcRecycleValue(row.rarity, row.level, row.exp, false), 0)} 金币`
  return rewardText(
    rows.map(({ rarity }) => ({ itemId: shardItemId(rarity), count: SHARDS_PER_DISMANTLE })),
    rows.reduce((sum, row) => sum + essenceOf(row.rarity, row.foil), 0),
  )
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请重试。"
}

export function AlbumPage() {
  const { user, progress, notify, refreshUser, refreshPacks } = useFlat()
  const userId = user.id
  const { results, limit } = useOwnedCardGrid()
  const library = useOwnedCardLibrary(userId, limit, "recent")
  const { rows, error, page, pageCount } = library
  const [detail, setDetail] = useState<ApiUserCard | null>(null)
  const listingMode = new URLSearchParams(useRouteSearch()).get("mode") === "list"

  const [operation, setOperation] = useState<Operation | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [preview, setPreview] = useState<ApiUserCard[] | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [notice, setNotice] = useState("")
  const dismantleLock = featureLockHint("dismantle", progress)
  const recycleLock = featureLockHint("npc-recycle", progress)
  const operationLock = operation === "recycle" ? recycleLock : dismantleLock
  const loadQuota = useCallback((signal: AbortSignal) => fetchRecycleQuota(userId, signal), [userId])
  const quota = useResource(operation === "recycle" && !recycleLock ? loadQuota : null)
  const loadExpedition = useCallback((signal: AbortSignal) => fetchCurrentExpedition(userId, signal), [userId])
  const expedition = useResource(operation ? loadExpedition : null)
  const locked = new Set(expedition.data?.pool.map((card) => card.userCardId))
  const cap = operation === "recycle" ? Math.min(quota.data?.remaining ?? 0, NPC_RECYCLE_DAILY_LIMIT) : BATCH_MAX
  const eligibleOnPage = rows?.filter((row) => !isHeroCardId(row.id) && !locked.has(row.userCardId)) ?? []
  const allOnPage = eligibleOnPage.length > 0 && eligibleOnPage.every((row) => selected.includes(row.userCardId))
  const cancelPage = allOnPage || (selected.length >= cap && eligibleOnPage.some((row) => selected.includes(row.userCardId)))

  function switchOperation(next: Operation | null) {
    setOperation(next)
    if (next === "recycle") quota.reload()
    if (next) expedition.reload()
    setSelected([])
    setPreview(null)
    setNotice("")
  }

  function refresh() {
    library.reload()
    refreshUser()
    refreshPacks()
    void refreshQuests()
  }

  // Resolve selected IDs again without page filters, then check quota and expedition locks.
  async function validateSelection() {
    const [fresh, active, currentQuota] = await Promise.all([
      fetchUserCards(userId, { ids: selected, limit: BATCH_MAX }),
      fetchCurrentExpedition(userId),
      operation === "recycle" ? fetchRecycleQuota(userId) : Promise.resolve(null),
    ])
    const activeIds = new Set(active?.pool.map((card) => card.userCardId))
    const owned = new Map(fresh.rows.map((row) => [row.userCardId, row]))
    const valid = selected.flatMap((id) => {
      const row = owned.get(id)
      return row && !isHeroCardId(row.id) && !activeIds.has(id) ? [row] : []
    })
    if (valid.length !== selected.length) {
      setSelected(valid.map((row) => row.userCardId))
      library.reload()
      expedition.reload()
      throw new Error("部分卡牌已不在卡册、正在出征或不可处理。已保留其余选择，请重新预览。")
    }
    if (currentQuota && valid.length > currentQuota.remaining) {
      throw new Error(`今日仅剩 ${currentQuota.remaining} 张回收额度，请减少选择。`)
    }
    return valid
  }

  async function handleBatch(confirm: boolean) {
    if (!operation || operationLock || inFlight.current || !selected.length || selected.length > cap || (confirm && !preview)) return
    inFlight.current = true
    setBusy(true)
    setNotice("")
    try {
      const fresh = await validateSelection()
      if (!confirm) {
        setPreview(fresh)
        return
      }
      if (preview && estimate(operation, fresh) !== estimate(operation, preview)) {
        setPreview(fresh)
        setNotice("预计获得的奖励已变动，请核对后再次确认。")
        return
      }
      const ids = fresh.map((row) => row.userCardId)
      let message: string
      if (operation === "recycle") {
        const result = await recycleCards(userId, ids)
        message = `已回收 ${result.recycledCount} 张 · +${result.coinsGained} 金币`
        quota.reload()
      } else {
        const result = await dismantleCardsBatch(userId, ids)
        message = `已分解 ${result.removedUserCardIds.length} 张 · ${rewardText(result.itemsGained, result.essenceGained)}`
      }
      setSelected([])
      setPreview(null)
      refresh()
      notify(message, "success")
    } catch (error) {
      setPreview(null)
      setNotice(errorText(error))
      if (operation === "recycle") quota.reload()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return <div className="fl-page fl-album">
    <header className="fl-page__head">
      <h1 className="fl-page__title">卡册</h1>
      <span className="fl-page__spacer" />
      <button className="bk-btn" type="button" disabled={busy || Boolean(dismantleLock && recycleLock)} title={dismantleLock && recycleLock ? dismantleLock : undefined}
        aria-pressed={Boolean(operation)} onClick={() => switchOperation(operation ? null : dismantleLock ? "recycle" : "dismantle")}>{operation ? "退出批量" : "批量处理"}</button>
    </header>
    <CardPageTabs />
    {listingMode && <div className="fl-card__head">
      <strong>选择要上架的卡牌</strong>
      <Link className="fl-link" to={OWN_LISTINGS_PATH}>返回市场</Link>
    </div>}
    <section className="fl-album-panel" aria-label="我的卡牌">
      <OwnedCardToolbar library={library} />
      {operation && <div className="fl-album-batch" aria-label="批量处理">
        <div className="fl-album-actions">
          {(["dismantle", "recycle"] as const).map((op) => {
            const lock = op === "dismantle" ? dismantleLock : recycleLock
            return <button key={op} className="bk-btn" type="button" aria-pressed={operation === op} disabled={busy || Boolean(lock)} title={lock ?? undefined} onClick={() => { if (operation !== op) switchOperation(op) }}>{VERB[op]}</button>
          })}
          <span>已选 {selected.length} / {cap} 张</span>
          {operation === "recycle" && quota.data && <span>今日剩余 {quota.data.remaining} / {quota.data.dailyLimit} 张</span>}
        </div>
        {operationLock && <span role="status">{operationLock}</span>}
        {operation === "recycle" && !operationLock && !quota.data && !quota.error && <span role="status">正在读取回收额度…</span>}
        {operation === "recycle" && quota.error && <div role="alert">{quota.error} <button type="button" className="bk-btn" onClick={quota.reload}>重试额度</button></div>}
        {expedition.error && <div role="alert">出征状态读取失败：{expedition.error} <button type="button" className="bk-btn" onClick={expedition.reload}>重试</button></div>}
        <div className="fl-album-actions">
          <button type="button" className="bk-btn" disabled={busy || Boolean(operationLock) || !eligibleOnPage.length || (!cancelPage && selected.length >= cap)} onClick={() => {
            setNotice("")
            const visible = new Set(eligibleOnPage.map((row) => row.userCardId))
            setSelected(cancelPage ? selected.filter((id) => !visible.has(id)) : [...new Set([...selected, ...visible])].slice(0, cap))
          }}>{cancelPage ? "取消本页" : "选择本页"}</button>
          <button type="button" className="bk-btn" disabled={busy || !selected.length} onClick={() => { setSelected([]); setNotice("") }}>清空选择</button>
          <button type="button" className="bk-btn bk-btn--main" disabled={busy || Boolean(operationLock) || !selected.length || selected.length > cap} onClick={() => void handleBatch(false)}>{busy ? "核对中…" : `预览${VERB[operation]}`}</button>
        </div>
        {notice && !preview && <div role="alert">{notice}</div>}
      </div>}
      <div className="fl-owned-results" data-listing={listingMode || undefined} ref={results}>
      {error ? <div className="fl-album-state" role="alert">{error} <button className="bk-btn" type="button" onClick={library.reload}>重试</button></div>
        : !rows ? <p className="fl-album-state" role="status">正在加载卡牌…</p>
          : rows.length === 0 ? <p className="fl-album-state" role="status">{library.filtered ? "没有符合条件的卡牌" : "卡册还是空的"}</p>
            : <div className="fl-library-grid">
              {rows.map((row) => {
                const checked = selected.includes(row.userCardId)
                const hero = isHeroCardId(row.id)
                const reason = hero ? "本体卡不可处理" : locked.has(row.userCardId) ? "正在出征" : ""
                const listingLabel = listingMode && !operation
                  ? hero ? "本体卡不可交易" : `${row.id.startsWith("mirror-") ? "镜像卡" : "公共卡"}${row.serial ? ` #${row.serial}` : ""}`
                  : ""
                const disabled = operation ? Boolean(busy || operationLock || (!checked && (reason || selected.length >= cap))) : listingMode && hero
                return <button key={row.userCardId} type="button" className="fl-library-tile fl-album-tile"
                  aria-label={`${row.name} · ${RARITY_LABEL[row.rarity]} · Lv.${row.level}${operation && reason ? ` · ${reason}` : ""}${listingLabel ? ` · ${listingLabel}` : ""}`}
                  aria-pressed={operation ? checked : undefined} disabled={disabled} onClick={() => {
                    if (!operation) setDetail(row)
                    else {
                      setNotice("")
                      setSelected(checked ? selected.filter((id) => id !== row.userCardId) : [...selected, row.userCardId])
                    }
                  }}>
                  <GameCardFace card={toFace(row)} />
                  {operation && (reason || checked) && <span className="fl-album-mark">{reason || "✓"}</span>}
                  {listingLabel && <span className="fl-album-listing-label">{listingLabel}</span>}
                </button>
              })}
            </div>}
      {!!library.total && rows && <CardPager page={page} pageCount={pageCount} onChange={library.changePage} disabled={busy} />}
      </div>
    </section>
    {preview && operation && <FlatDialog title={`${VERB[operation]}预览`} onClose={() => setPreview(null)} busy={busy}>
      <p>将{VERB[operation]} {preview.length} 张卡。卡牌会从卡册和卡组移除，相关市场挂单也会取消。此操作不可撤销。</p>
      <p>预计获得：{estimate(operation, preview)}</p>
      <details>
        <summary>查看将移除的卡牌</summary>
        <ul>{preview.map((row) => <li key={row.userCardId}>{row.name} · {RARITY_LABEL[row.rarity]} · Lv.{row.level}{row.foil ? " · 闪卡" : ""}</li>)}</ul>
      </details>
      {notice && <p role="alert">{notice}</p>}
      <div className="fl-album-dialog-actions">
        <button className="bk-btn" type="button" disabled={busy} onClick={() => setPreview(null)}>取消</button>
        <button className="bk-btn bk-btn--main" type="button" disabled={busy || Boolean(operationLock) || selected.length > cap} onClick={() => void handleBatch(true)}>{busy ? "处理中…" : `确认${VERB[operation]}`}</button>
      </div>
    </FlatDialog>}
    {detail && (listingMode ? (
      <ListCardDialog card={detail} onClose={() => setDetail(null)} onListed={() => { setDetail(null); refresh() }} />
    ) : (
      <CardDetail card={detail} userId={userId} onClose={() => setDetail(null)} onChanged={refresh} />
    ))}
  </div>
}
