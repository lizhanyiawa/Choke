import { useEffect, useRef, useState } from "react"

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
  hasDragType,
  readUserCardDrag,
  setUserCardDrag,
  toDeskCard,
  USER_CARD_MIME,
} from "./drag"
import { Pages } from "./BookPages"
import { useDeskCardIds } from "./presence"
import "./deck-panel.css"

const RARITIES: (Rarity | "")[] = ["", "C", "UC", "R", "E", "L", "Radiant", "Prismatic"]

interface PickerResult {
  key: string
  rows: ApiUserCard[]
  total: number
  error: string | null
}

export function DeckPanel({ userId }: { userId: string | null }) {
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
  const [pickerResult, setPickerResult] = useState<PickerResult | null>(null)

  const assignRef = useRef<(userCardId: number, slotIndex: number, fromSlot?: number) => void>(
    () => {},
  )

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    fetchDeck(userId, controller.signal)
      .then((data) => setDeck(data))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError(reason instanceof Error ? reason.message : "加载卡组失败")
      })
    return () => controller.abort()
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredQuery(query.trim()), 260)
    return () => window.clearTimeout(timer)
  }, [query])

  const pickerKey = `${deferredQuery}|${rarity}`

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    fetchUserCards(userId, {
      q: deferredQuery || undefined,
      rarity: rarity || undefined,
      sort: "pp",
      limit: 60,
      signal: controller.signal,
    })
      .then((data) => {
        setPickerResult({ key: pickerKey, rows: data.rows, total: data.total, error: null })
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setPickerResult({
          key: pickerKey,
          rows: [],
          total: 0,
          error: reason instanceof Error ? reason.message : "加载卡册失败",
        })
      })
    return () => controller.abort()
  }, [pickerKey, userId, deferredQuery, rarity])

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
  const ready = pickerResult?.key === pickerKey
  const usedIds = new Set(
    deck.slots.flatMap((slot) => (slot.card ? [slot.card.userCardId] : [])),
  )
  // 没点槽位时，点右页的卡放进第一个空槽
  const firstEmpty = deck.slots.findIndex((slot) => !slot.card)
  const targetSlot = pickerSlot ?? (firstEmpty >= 0 ? firstEmpty : null)

  return (
    <Pages
      className="deck-panel"
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
                  draggable={!!slot.card}
                  onDragStart={(event) => {
                    if (!slot.card) return
                    setUserCardDrag(event.nativeEvent, {
                      userCardId: slot.card.userCardId,
                      fromSlot: index,
                      card: toDeskCard(toFace(slot.card), slot.card.userCardId),
                    })
                  }}
                  onDragOver={(event) => {
                    if (!hasDragType(event.nativeEvent, USER_CARD_MIME)) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "move"
                    if (dropSlot !== index) setDropSlot(index)
                  }}
                  onDragLeave={() => {
                    if (dropSlot === index) setDropSlot(null)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const payload = readUserCardDrag(event.nativeEvent)
                    setDropSlot(null)
                    if (payload) assign(payload.userCardId, index, payload.fromSlot)
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
                  {slot.card ? <CardFace card={toFace(slot.card)} /> : <span aria-hidden>+</span>}
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
              onChange={(event) => setRarity(event.target.value as Rarity | "")}
              aria-label="按品质筛选"
            >
              {RARITIES.map((item) => (
                <option key={item || "all"} value={item}>
                  {item ? RARITY_LABEL[item] : "全部品质"}
                </option>
              ))}
            </select>
          </div>

          {!ready ? (
            <div className="bk-empty">加载卡册…</div>
          ) : pickerResult.error ? (
            <div className="bk-empty bk-error">{pickerResult.error}</div>
          ) : pickerResult.rows.length === 0 ? (
            <div className="bk-empty">没有符合条件的卡</div>
          ) : (
            <>
              <div className="deck-picks">
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
                      draggable={!used}
                      onDragStart={(event) => {
                        if (used) return
                        setUserCardDrag(event.nativeEvent, { userCardId: row.userCardId })
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
                      <CardFace card={toFace(row)} />
                      {used && <span className="deck-pick__used">已在卡组</span>}
                    </div>
                  )
                })}
              </div>
              <p className="bk-note">
                点一下放入，或拖到左页的槽位。按战力排序，显示 {pickerResult.rows.length} 张 / 共{" "}
                {pickerResult.total} 张。
              </p>
            </>
          )}
        </>
      }
    />
  )
}
