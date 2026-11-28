import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { FiChevronRight as ChevronRight, FiPlus as Plus } from "react-icons/fi"

import { GameCardFace } from "@/card/GameCardFace"
import { battlePower, JOB_LABEL, RARITY_LABEL } from "@/card/data"
import { CardDetail } from "@/desk/panels/cards/CardDetail"
import { fetchDeck, saveDeck, toFace, type ApiDeck, type ApiUserCard } from "@/desk/session/api"
import { useFlat } from "../context"
import { FlatDialog } from "../ui/FlatDialog"
import { CardPageTabs, CardPager, useCardPageSize, useOwnedCardGrid } from "./CardPages"
import { OwnedCardToolbar, useOwnedCardLibrary } from "./OwnedCardLibrary"
import "./deck.css"

type SlotIds = (number | null)[]
type SaveFailure = { slots: SlotIds; message: string }

const WIDE_DECK = "(min-width: 1200px)"
const wideDeck = () => window.matchMedia(WIDE_DECK).matches
function subscribeWideDeck(notify: () => void) {
  const media = window.matchMedia(WIDE_DECK)
  media.addEventListener("change", notify)
  return () => media.removeEventListener("change", notify)
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

const DeckCardFace = memo(function DeckCardFace({ card, eager }: { card: ApiUserCard; eager?: boolean }) {
  return <GameCardFace card={toFace(card)} eager={eager} thumbnail />
})

export function DeckPage() {
  const { user: { id: userId } } = useFlat()
  const [deck, setDeck] = useState<ApiDeck | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [failure, setFailure] = useState<SaveFailure | null>(null)
  const [saving, setSaving] = useState(false)
  const [target, setTarget] = useState<number | null>(null)
  const [sheet, setSheet] = useState<number | null>(null)
  const [detail, setDetail] = useState<ApiUserCard | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const inFlight = useRef(false)
  const mobile = useCardPageSize(false, true)
  const workspace = useSyncExternalStore(subscribeWideDeck, wideDeck)

  useEffect(() => {
    const controller = new AbortController()
    fetchDeck(userId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setDeck(next)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setLoadError(messageOf(reason, "加载卡组失败"))
    })
    return () => controller.abort()
  }, [userId, loadAttempt])

  const slots = deck?.slots ?? []
  const occupied = slots.filter(({ card }) => card != null).length
  const power = slots.reduce((sum, { card }) => sum + (card ? battlePower(toFace(card)) : 0), 0)
  const savedDate = deck?.updatedAt ? new Date(deck.updatedAt) : null
  const savedTime = savedDate && Number.isFinite(savedDate.getTime())
    ? savedDate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : null
  const locked = saving || failure !== null
  const slotIds = slots.map(({ card }) => card?.userCardId ?? null)

  async function commit(next: SlotIds) {
    if (!deck || inFlight.current || slotIds.every((id, index) => id === next[index])) return
    inFlight.current = true
    setSaving(true)
    setFailure(null)
    try {
      setDeck(await saveDeck(userId, next))
      setTarget(null)
    } catch (reason) {
      setFailure({ slots: next, message: messageOf(reason, "保存失败") })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  function assign(id: number) {
    if (target === null || locked) return
    const next = [...slotIds]
    const source = next.indexOf(id)
    if (source === target) return
    if (source >= 0) next[source] = next[target] ?? null
    next[target] = id
    void commit(next)
  }

  function remove(index: number) {
    const next = [...slotIds]
    next[index] = null
    setSheet(null)
    void commit(next)
  }

  const sheetCard = sheet === null ? null : slots[sheet]?.card
  const clearButton = (
    <button type="button" className="fl-deck__control fl-deck__clear" disabled={!occupied || locked} onClick={() => setConfirmClear(true)}>清空…</button>
  )
  const battleLabel = <><span className="fl-deck__wide">进入练习战</span><span className="fl-deck__phone">练习战 <ChevronRight size={16} aria-hidden="true" /></span></>

  return (
    <div className="fl-page fl-deck">
      <header className="fl-deck__head">
        <h1 className="fl-page__title">卡组</h1>
        {occupied > 0
          ? <a className="fl-deck__battle" href="/battle?from=deck">{battleLabel}</a>
          : <button type="button" className="fl-deck__battle" disabled>{battleLabel}</button>}
      </header>
      <CardPageTabs />
      {!deck ? (loadError ? (
        <div className="fl-card" role="alert">
          <span>加载卡组失败：{loadError}</span>
          <button type="button" className="fl-deck__control" onClick={() => { setLoadError(null); setLoadAttempt(loadAttempt + 1) }}>重新加载</button>
        </div>
      ) : <p role="status">正在加载卡组…</p>) : (
        <>
          <section className="fl-card fl-deck__formation" aria-label="主卡组">
            <header className="fl-deck__summary">
              <h2 className="fl-deck__wide">主卡组</h2>
              <strong>{occupied} / {slots.length} 已上阵</strong>
              <span><span className="fl-deck__wide">总</span>战力 {power.toLocaleString("en-US")}</span>
              <span className="fl-deck__saved" data-failed={failure ? "" : undefined} role="status">{saving ? "保存中…" : failure ? "未保存" : savedTime ? <>已保存 · <time dateTime={deck.updatedAt ?? undefined}>{savedTime}</time></> : "尚未保存"}</span>
              {!mobile && clearButton}
            </header>
            <div className="fl-deck__slots" data-no-light>
              {slots.map(({ card }, index) => {
                const selected = target === index
                const label = `第 ${index + 1} 槽`
                return (
                  <div className="fl-deck__slot" data-selected={selected || undefined} key={index}>
                    <span className="fl-deck__slot-label">{label}</span>
                    <button type="button" className={`fl-library-tile fl-deck__face${card ? "" : " fl-deck__empty"}`} aria-pressed={selected} aria-label={`${label}，${card ? `${card.name}，${mobile ? "槽位操作" : workspace ? "选中槽位" : "更换"}` : "添加卡牌"}`} aria-haspopup={card && mobile ? "dialog" : undefined} disabled={locked} onClick={() => card && mobile ? setSheet(index) : setTarget(workspace && selected ? null : index)}>
                      {card ? <DeckCardFace card={card} eager /> : <><Plus size={20} aria-hidden="true" />{selected && !workspace && <span>选卡中</span>}</>}
                      {workspace && !card && <span className="fl-deck__slot-name">{selected ? "选卡中" : "空槽位"}</span>}
                    </button>
                    {card && !workspace && <div className="fl-deck__slot-actions">
                      <button type="button" className="fl-deck__control" aria-label={`${label} ${card.name} 详情`} onClick={() => setDetail(card)}>详情</button>
                      <button type="button" className="fl-deck__control fl-deck__danger" aria-label={`${label} ${card.name} 移出`} disabled={locked} onClick={() => remove(index)}>移出</button>
                    </div>}
                  </div>
                )
              })}
              {mobile && clearButton}
            </div>
          </section>
          {failure && <div className="fl-deck__failure" role="alert">
            <span>保存失败：{failure.message}。仍显示上次确认的卡组。</span>
            <button type="button" className="fl-deck__control" onClick={() => void commit(failure.slots)}>重试保存</button>
            <button type="button" className="fl-deck__control" onClick={() => setFailure(null)}>放弃更改</button>
          </div>}
          <DeckCandidates userId={userId} target={target} slots={slotIds} locked={locked} workspace={workspace}
            targetCard={target === null ? null : slots[target]?.card ?? null}
            onCancel={() => setTarget(null)} onChoose={assign} onDetail={setDetail} onRemove={remove} />
        </>
      )}
      {sheet !== null && sheetCard && (
        <FlatDialog title={`第 ${sheet + 1} 槽 · ${sheetCard.name}`} onClose={() => setSheet(null)}>
          <div className="fl-deck__sheet-actions">
            <button type="button" className="bk-btn bk-btn--main" onClick={() => { setTarget(sheet); setSheet(null) }}>更换卡牌</button>
            <button type="button" className="bk-btn" onClick={() => { setDetail(sheetCard); setSheet(null) }}>查看详情</button>
            <button type="button" className="bk-btn bk-btn--ghost fl-deck__danger" onClick={() => remove(sheet)}>移出卡组</button>
          </div>
        </FlatDialog>
      )}
      {detail && <CardDetail card={detail} userId={userId} readOnly onClose={() => setDetail(null)} />}
      {confirmClear && <FlatDialog title="清空主卡组？" onClose={() => setConfirmClear(false)}>
        <p>将移出全部 {occupied} 张上阵卡牌，不会删除卡牌。</p>
        <div className="fl-deck__dialog-actions">
          <button type="button" className="fl-deck__control" onClick={() => setConfirmClear(false)}>取消</button>
          <button type="button" className="fl-deck__control fl-deck__danger" onClick={() => { setConfirmClear(false); void commit(slots.map(() => null)) }}>确认清空</button>
        </div>
      </FlatDialog>}
    </div>
  )
}

interface CandidatesProps {
  userId: string
  target: number | null
  slots: SlotIds
  locked: boolean
  workspace: boolean
  targetCard: ApiUserCard | null
  onCancel: () => void
  onChoose: (id: number) => void
  onDetail: (card: ApiUserCard) => void
  onRemove: (index: number) => void
}

function DeckCandidates({ userId, target, slots, locked, workspace, targetCard, onCancel, onChoose, onDetail, onRemove }: CandidatesProps) {
  const { results, limit } = useOwnedCardGrid(workspace ? 12 : undefined)
  const library = useOwnedCardLibrary(userId, limit, "pp", true)
  const { rows, error, shownPage, pageCount, retainingPage } = library
  const pending = retainingPage && !error
  const selected = target !== null
  const verb = target !== null && slots[target] != null ? "更换" : "上阵"
  const [highlight, setHighlight] = useState<{ card: ApiUserCard; target: number | null; page: typeof rows } | null>(null)
  const active = workspace && highlight && highlight.page === rows && (highlight.target === target || highlight.target === null) && !retainingPage ? highlight : null
  if (highlight !== active) setHighlight(null)
  else if (active && active.target !== target) setHighlight({ ...active, target })
  const candidate = active?.card
  const source = candidate ? slots.indexOf(candidate.userCardId) : -1
  const preview = candidate ?? targetCard
  const action = candidate && target !== null && source !== target
    ? `${source >= 0 ? (targetCard ? "交换到" : "移动到") : targetCard ? "替换" : "上阵到"}第 ${target + 1} 槽`
    : null

  return (
    <section className="fl-deck__candidates" aria-labelledby="deck-candidates-title">
      <div className="fl-deck__library">
        <div className="fl-deck__filters">
          <header className="fl-deck__head">
            <h2 id="deck-candidates-title"><span className="fl-deck__wide">候选卡牌</span><span className="fl-deck__phone">{target === null ? "候选卡牌" : `为第 ${target + 1} 槽选卡`}</span></h2>
            <span className="fl-deck__target">{target === null ? (workspace ? "可先查看卡牌" : "请先选择槽位") : `将${verb}到第 ${target + 1} 槽`}</span>
            {selected && <button className="fl-deck__cancel" type="button" disabled={locked} onClick={onCancel}><span className="fl-deck__wide">取消选槽</span><span className="fl-deck__phone">取消</span></button>}
          </header>
          <OwnedCardToolbar library={library} />
        </div>
        <div className="fl-owned-results" ref={results}>
          {!rows ? (error ? <div className="fl-deck__failure" role="alert">
            <span>加载候选卡牌失败：{error}</span>
            <button className="fl-deck__control" type="button" onClick={library.reload}>重新加载</button>
          </div> : <p role="status">正在加载候选卡牌…</p>) : rows.length === 0 ? (
            <p role="status">{library.filtered ? "没有符合条件的卡牌" : "卡册还是空的"}</p>
          ) : (
            <div className="fl-library-grid fl-deck__candidate-grid" aria-busy={pending} data-no-light>
              {rows.map((card) => {
                const source = slots.indexOf(card.userCardId)
                const action = workspace ? "预览" : target === null ? "请先选择槽位" : source === target ? "已在所选槽位" : source >= 0 && slots[target] != null ? "交换" : slots[target] != null ? "更换" : "上阵"
                return <button className="fl-library-tile fl-deck__face" type="button" key={card.userCardId} aria-label={`${card.name}，${RARITY_LABEL[card.rarity]}，Lv.${card.level}，${action}`} aria-pressed={workspace ? card === candidate : undefined}
                  disabled={retainingPage || (!workspace && (locked || target === null || source === target))}
                  onClick={() => workspace ? setHighlight(card === candidate ? null : { card, target, page: rows }) : onChoose(card.userCardId)}>
                  <DeckCardFace card={card} />
                  {source >= 0 && <span className="fl-deck__assigned">第 {source + 1} 槽</span>}
                </button>
              })}
              {/* 宽屏卡格预留两行高度；其它布局补足末页的空位。 */}
              {!workspace && pageCount > 1 && Array.from({ length: limit - rows.length }, (_, i) => (
                <span className="fl-deck__face fl-deck__candidate-space" key={`space-${i}`} aria-hidden="true" />
              ))}
            </div>
          )}
          {!!library.total && rows && <CardPager page={shownPage} pageCount={pageCount} onChange={library.changePage} disabled={locked} pending={pending} />}
          {rows && error && <div className="fl-deck__failure" role="alert">
            <span>加载候选卡牌失败：{error}</span>
            <button className="fl-deck__control" type="button" onClick={library.reload}>重新加载</button>
          </div>}
        </div>
      </div>
      {workspace && <aside className="fl-card fl-deck__preview" aria-label="卡牌预览">
        <h2>卡牌预览</h2>
        {preview ? <>
          {action && <button type="button" className="bk-btn bk-btn--main" disabled={locked || retainingPage} onClick={() => onChoose(preview.userCardId)}>{action}</button>}
          <DeckPreview card={preview} />
          {candidate && target === null && <p className="bk-note">要上阵，请先选择一个槽位。</p>}
          <button type="button" className="fl-deck__control" onClick={() => onDetail(preview)}>查看完整详情</button>
          {target !== null && preview.userCardId === targetCard?.userCardId && <button type="button" className="fl-deck__control fl-deck__danger" disabled={locked} onClick={() => onRemove(target)}>移出卡组</button>}
        </> : <p className="bk-note">{selected ? "这是空槽位。点击候选卡预览后即可上阵。" : "点击上阵槽位或候选卡，查看卡牌信息。"}</p>}
      </aside>}
    </section>
  )
}

function DeckPreview({ card }: { card: ApiUserCard }) {
  const face = toFace(card)
  return <>
    <div className="fl-deck__preview-card">
      <div className="fl-deck__preview-face" data-no-light><GameCardFace card={face} eager thumbnail /></div>
      <div>
        <strong className="fl-deck__preview-name">{card.name}</strong>
        <p className="bk-note">{RARITY_LABEL[card.rarity]} · {JOB_LABEL[card.job]}</p>
        <dl className="fl-deck__preview-stats">
          <div><dt>等级</dt><dd>Lv.{card.level}</dd></div>
          <div><dt>战力</dt><dd>{battlePower(face).toLocaleString("en-US")}</dd></div>
        </dl>
      </div>
    </div>
    {face.skills.length > 0 && <ul className="fl-deck__preview-skills" aria-label="技能">
      {face.skills.map((skill, index) => <li key={`${skill.id}-${index}`}><span>{skill.name}</span><small>{skill.passive ? "被动" : `${skill.ap} AP`}</small></li>)}
    </ul>}
  </>
}
