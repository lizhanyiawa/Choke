import { memo, useCallback, useEffect, useRef, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { RARITY_LABEL, battlePower } from "@/card/data"
import type { Rarity } from "@/card/types"

import {
  fetchDeck,
  fetchUserCards,
  saveDeck,
  toFace,
  type ApiDeck,
  type ApiUserCard,
} from "./api"
import {
  DECK_ASSIGN_EVENT,
  DECK_HOVER_EVENT,
  CARD_POINTER_DROP_EVENT,
  startCardPointerDrag,
  toDeskCard,
  type CardPointerDrop,
} from "./drag"
import { Pages, useBook, usePageCache } from "./BookPages"
import { FitArea } from "./FitArea"
import { useDeskCardIds } from "./presence"
import "./deck-panel.css"

const RARITIES: (Rarity | "")[] = ["", "C", "UC", "R", "E", "L", "Radiant", "Prismatic"]
/** 右页候选卡：一页 4 列 × 3 排，用书的翻页，不滚动 */
const PICK_COLS = 4
const PICK_ROWS = 3
const PICK_SIZE = PICK_COLS * PICK_ROWS

interface PickerResult {
  rows: ApiUserCard[]
  total: number
  error: string | null
}

export const DeckPanel = memo(function DeckPanel({ userId }: { userId: string | null }) {
  const book = useBook()
  const [deck, setDeck] = useState<ApiDeck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dropSlot, setDropSlot] = useState<number | null>(null)
  const deskIds = useDeskCardIds()

  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [query, setQuery] = useState("")
  const [deferredQuery, setDeferredQuery] = useState("")
  const [rarity, setRarity] = useState<Rarity | "">("")
  const [pickPage, setPickPage] = useState(0)

  const assignRef = useRef<(userCardId: number, slotIndex: number, fromSlot?: number) => void>(
    () => {},
  )
  const removeRef = useRef<(slotIndex: number) => void>(() => {})

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    fetchDeck(userId, controller.signal)
      .then((data) => { setDeck(data); setError(null) })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError(reason instanceof Error ? reason.message : "加载卡组失败")
      })
    return () => controller.abort()
  }, [userId, book.revision])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeferredQuery(query.trim())
      setPickPage(0)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [query])

  const pickerKey = userId ? `${userId}|${deferredQuery}|${rarity}|${book.revision}` : ""
  const loadPage = useCallback(async (index: number, signal: AbortSignal): Promise<PickerResult> => {
    try {
      const data = await fetchUserCards(userId!, {
        q: deferredQuery || undefined,
        rarity: rarity || undefined,
        sort: "pp",
        limit: PICK_SIZE,
        page: index,
        signal,
      })
      return { rows: data.rows, total: data.total, error: null }
    } catch (reason) {
      if (signal.aborted) throw reason
      return { rows: [], total: 0, error: reason instanceof Error ? reason.message : "加载卡册失败" }
    }
  }, [userId, deferredQuery, rarity])
  const cachedPages = usePageCache(pickerKey, pickPage, PICK_SIZE, loadPage)
  const currentResult = cachedPages.find(([index]) => index === pickPage)?.[1]
  if (currentResult && !currentResult.error) {
    const lastPage = Math.max(0, Math.ceil(currentResult.total / PICK_SIZE) - 1)
    if (pickPage > lastPage) setPickPage(lastPage)
  }

  const commit = async (slots: (number | null)[]) => {
    if (!userId || !deck || saving) return
    setSaving(true)
    setNotice(null)
    try {
      const next = await saveDeck(userId, slots)
      setDeck(next)
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }))
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const assign = (userCardId: number, slotIndex: number, fromSlot?: number) => {
    if (!deck || saving) return
    const slots = deck.slots.map((slot) => slot.card?.userCardId ?? null)
    if (fromSlot != null) {
      const target = slots[slotIndex] ?? null
      slots[fromSlot] = target
      slots[slotIndex] = userCardId
    } else {
      const existing = slots.indexOf(userCardId)
      if (existing === slotIndex) return
      if (existing >= 0) slots[existing] = slots[slotIndex] ?? null
      slots[slotIndex] = userCardId
    }
    setPickerSlot(null)
    void commit(slots)
  }
  useEffect(() => {
    assignRef.current = assign
  })

  const remove = (slotIndex: number) => {
    if (!deck || saving) return
    const slots = deck.slots.map((slot) => slot.card?.userCardId ?? null)
    slots[slotIndex] = null
    setPickerSlot(null)
    void commit(slots)
  }
  useEffect(() => {
    removeRef.current = remove
  })

  const clear = () => {
    if (!deck || saving) return
    setPickerSlot(null)
    void commit(Array.from({ length: 7 }, () => null))
  }

  useEffect(() => {
    const onHover = (event: Event) => {
      setDropSlot((event as CustomEvent<number | null>).detail)
    }
    const onAssign = (event: Event) => {
      const detail = (event as CustomEvent<{ userCardId: number; slot: number }>).detail
      if (detail) assignRef.current(detail.userCardId, detail.slot)
    }
    window.addEventListener(DECK_HOVER_EVENT, onHover)
    window.addEventListener(DECK_ASSIGN_EVENT, onAssign)
    return () => {
      window.removeEventListener(DECK_HOVER_EVENT, onHover)
      window.removeEventListener(DECK_ASSIGN_EVENT, onAssign)
    }
  }, [])

  // 卡组槽接住指针拖卡；槽内卡拖到右页则移出卡组，左页空白不接。
  const bindRoot = useCallback((root: HTMLDivElement | null) => {
    if (!root) return
    const onDrop = (event: Event) => {
      const { payload } = (event as CustomEvent<CardPointerDrop>).detail
      const hit = event.target instanceof Element ? event.target : null
      const slot = hit?.closest<HTMLElement>(".deck-slot[data-slot]")
      if (slot && payload.userCardId != null) {
        event.preventDefault()
        assignRef.current(payload.userCardId, Number(slot.dataset.slot), payload.fromSlot)
      } else if (payload.fromSlot != null && hit === root) {
        event.preventDefault()
        removeRef.current(payload.fromSlot)
      }
    }
    root.addEventListener(CARD_POINTER_DROP_EVENT, onDrop)
    return () => root.removeEventListener(CARD_POINTER_DROP_EVENT, onDrop)
  }, [])

  if (!userId) {
    return (
      <Pages
        className="deck-panel"
        left={<p className="bk-note">登录后可以编 7 张卡的出战卡组。</p>}
        right={
          <div className="bk-empty">
            <span>登录后编辑卡组</span>
            <a className="bk-btn bk-btn--main" href="/auth/osu">
              用 osu! 登录
            </a>
          </div>
        }
      />
    )
  }

  if (error || !deck) {
    return (
      <Pages
        className="deck-panel"
        ready={!!error}
        left={<p className="bk-note">出战卡组最多 7 张，改动自动保存。</p>}
        right={<div className={`bk-empty ${error ? "bk-error" : ""}`}>{error ?? "加载中…"}</div>}
      />
    )
  }

  const filled = deck.slots.filter((slot) => slot.card).length
  const totalBp = deck.slots.reduce(
    (sum, slot) => (slot.card ? sum + battlePower(toFace(slot.card)) : sum),
    0,
  )
  const usedIds = new Set(
    deck.slots.flatMap((slot) => (slot.card ? [slot.card.userCardId] : [])),
  )
  // 没点槽位时，点右页的卡放进第一个空槽
  const firstEmpty = deck.slots.findIndex((slot) => !slot.card)
  const targetSlot = pickerSlot ?? (firstEmpty >= 0 ? firstEmpty : null)
  const renderPage = (index: number, pickerResult: PickerResult | null) => {
  const ready = pickerResult !== null
  const pickTotalPages = Math.max(1, Math.ceil((pickerResult?.total ?? 0) / PICK_SIZE))

  return (
    <Pages
      key={index}
      rootRef={index === pickPage ? bindRoot : undefined}
      preload={index !== pickPage}
      className="deck-panel"
      ready={ready}
      pager={
        pickTotalPages > 1
          ? { page: Math.min(index + 1, pickTotalPages), pages: pickTotalPages, onPage: (next) => setPickPage(next - 1) }
          : undefined
      }
      left={
        <>
          <div className="deck-summary">
            <div className="bk-stat">
              <b>
                {filled} <small>/ 7</small>
              </b>
              <span>已上阵</span>
            </div>
            <div className="bk-stat">
              <b>{totalBp.toLocaleString("en-US")}</b>
              <span>总战力</span>
            </div>
            <span className="deck-summary__saved bk-note">
              {saving ? "保存中…" : savedAt ? `已保存 ${savedAt}` : "改动自动保存"}
            </span>
          </div>

          {notice && <div className="bk-box bk-error">{notice}</div>}

          <div className="deck-grid">
            {deck.slots.map((slot, index) => {
              const isDropTarget = dropSlot === index
              const onDesk = !!slot.card && deskIds.has(slot.card.userCardId)
              return (
                <div
                  className={`deck-slot ${slot.card ? "has-card" : "bk-slot"} ${isDropTarget ? "is-drop-target" : ""} ${pickerSlot === index ? "is-picked" : ""} ${onDesk ? "is-on-desk" : ""}`}
                  key={index}
                  data-slot={index}
                  role="button"
                  tabIndex={0}
                  aria-pressed={pickerSlot === index}
                  onPointerDown={(event) => {
                    if (!slot.card) return
                    startCardPointerDrag(event, {
                      userCardId: slot.card.userCardId,
                      fromSlot: index,
                      card: toDeskCard(toFace(slot.card), slot.card.userCardId),
                    })
                  }}
                  onClick={() => setPickerSlot(pickerSlot === index ? null : index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setPickerSlot(pickerSlot === index ? null : index)
                    }
                  }}
                  aria-label={
                    slot.card ? `第 ${index + 1} 槽 ${slot.card.name}，点击更换` : `第 ${index + 1} 槽，空`
                  }
                >
                  {slot.card ? <DeckFace row={slot.card} /> : <span aria-hidden>+</span>}
                  <span className="deck-slot__no">{index + 1}</span>
                  {slot.card && (
                    <button
                      type="button"
                      className="deck-slot__remove"
                      onClick={(event) => {
                        event.stopPropagation()
                        remove(index)
                      }}
                      aria-label={`移出第 ${index + 1} 槽`}
                    >
                      ×
                    </button>
                  )}
                  {isDropTarget ? (
                    <span className="deck-slot__flag">松开放入</span>
                  ) : (
                    onDesk && <span className="deck-slot__flag">在桌面</span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="deck-actions">
            <button
              type="button"
              className="bk-btn bk-btn--ghost bk-btn--danger"
              onClick={clear}
              disabled={saving || filled === 0}
            >
              清空
            </button>
            {filled === 0 ? (
              <button type="button" className="bk-btn bk-btn--main" disabled>
                进入战斗
              </button>
            ) : (
              <a className="bk-btn bk-btn--main" href="/battle">
                进入战斗
              </a>
            )}
          </div>

          <p className="bk-note">
            不必满 7 张也能出战，但至少要 1 张。桌面上的卡可以直接拖进槽位。
          </p>
        </>
      }
      right={
        <>
          <div className="deck-target">
            <span className="bk-label">
              {targetSlot == null ? "卡组已满 · 先点左页要换的槽" : `放进第 ${targetSlot + 1} 槽`}
            </span>
            {pickerSlot != null && (
              <button type="button" className="bk-btn bk-btn--ghost bk-btn--sm" onClick={() => setPickerSlot(null)}>
                取消选槽
              </button>
            )}
          </div>

          <div className="deck-filters">
            <input
              className="bk-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索玩家名"
              aria-label="搜索卡牌"
            />
            <select
              className="bk-select"
              value={rarity}
              onChange={(event) => {
                setRarity(event.target.value as Rarity | "")
                setPickPage(0)
              }}
              aria-label="按品质筛选"
            >
              {RARITIES.map((item) => (
                <option key={item || "all"} value={item}>
                  {item ? RARITY_LABEL[item] : "全部品质"}
                </option>
              ))}
            </select>
          </div>

          {!pickerResult ? (
            <div className="bk-empty">加载卡册…</div>
          ) : pickerResult.error ? (
            <div className="bk-empty bk-error">{pickerResult.error}</div>
          ) : pickerResult.rows.length === 0 ? (
            <div className="bk-empty">没有符合条件的卡</div>
          ) : (
            <>
              <FitArea className="deck-picks" cols={PICK_COLS} rows={PICK_ROWS} gapX={10} gapY={12}>
                <div
                  className="deck-picks__grid"
                  aria-busy={!ready}
                  style={{ visibility: ready ? undefined : "hidden" }}
                >
                  {pickerResult.rows.map((row) => {
                    const used = usedIds.has(row.userCardId)
                    const blocked = used || targetSlot == null
                    return (
                      <div
                        key={row.userCardId}
                        className={`deck-pick ${used ? "is-used" : ""}`}
                        role="button"
                        tabIndex={blocked ? -1 : 0}
                        aria-disabled={blocked}
                        onPointerDown={(event) => {
                          if (!used) startCardPointerDrag(event, { userCardId: row.userCardId })
                        }}
                        onClick={() => {
                          if (!blocked) assign(row.userCardId, targetSlot)
                        }}
                        onKeyDown={(event) => {
                          if (!blocked && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault()
                            assign(row.userCardId, targetSlot)
                          }
                        }}
                      >
                        <DeckFace row={row} />
                        {used && <span className="deck-pick__used">已在卡组</span>}
                      </div>
                    )
                  })}
                </div>
                <div
                  className="deck-picks__grid deck-picks__loading"
                  style={{ visibility: ready ? "hidden" : undefined }}
                  aria-hidden
                >
                  {Array.from({ length: PICK_SIZE }, (_, i) => <div className="bk-slot" key={i} />)}
                </div>
              </FitArea>
              <p className="bk-note">点一下放入，或拖到左页的槽位。按战力排序，共 {pickerResult.total} 张。</p>
            </>
          )}
        </>
      }
    />
  )
  }
  return cachedPages.map(([index, result]) => renderPage(index, result))
})

// 卡面只跟随卡实例变化，输入、选槽和拖放高亮不重新生成卡面树。
const DeckFace = memo(function DeckFace({ row }: { row: ApiUserCard }) {
  return <CardFace card={toFace(row)} eager />
})
