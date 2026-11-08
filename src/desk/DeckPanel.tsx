import { useEffect, useRef, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { battlePower } from "@/card/data"
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
  USER_CARD_MIME,
} from "./drag"

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

  const pickerKey = `${pickerSlot ?? "none"}|${deferredQuery}|${rarity}`

  useEffect(() => {
    if (!userId || pickerSlot == null) return
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
  }, [pickerKey, userId, pickerSlot, deferredQuery, rarity])

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
      <div className="album-panel__empty">
        <p>登录后编辑卡组</p>
        <a href="/auth/osu">用 osu! 登录</a>
      </div>
    )
  }

  if (error) return <div className="album-panel__empty">{error}</div>
  if (!deck) return <div className="album-panel__empty">加载中…</div>

  const filled = deck.slots.filter((slot) => slot.card).length
  const totalBp = deck.slots.reduce(
    (sum, slot) => (slot.card ? sum + battlePower(toFace(slot.card)) : sum),
    0,
  )
  const ready = pickerResult?.key === pickerKey
  const usedIds = new Set(
    deck.slots.flatMap((slot) => (slot.card ? [slot.card.userCardId] : [])),
  )

  const trayTitle = pickerSlot == null ? "选择卡牌" : `第 ${pickerSlot + 1} 槽`

  return (
    <div className="deck-panel">
      <div className="deck-head">
        <div>
          <span>MAIN DECK · 7 SLOTS</span>
          <b>
            {filled} / 7
          </b>
        </div>
        <em>{saving ? "保存中…" : savedAt ? `已保存 ${savedAt}` : "改动自动保存"}</em>
      </div>

      <div className="deck-meta">
        <p className="command-note">
          总战力 {totalBp.toLocaleString("en-US")} · 不必满 7 张也能出战，但至少要 1 张。
        </p>
        <div className="deck-meta__actions">
          <button type="button" onClick={clear} disabled={saving || filled === 0}>
            清空
          </button>
          <a
            className={`deck-battle ${filled === 0 ? "is-disabled" : ""}`}
            href={filled === 0 ? undefined : "/battle"}
            aria-disabled={filled === 0}
            onClick={(event) => {
              if (filled === 0) event.preventDefault()
            }}
          >
            进入战斗
          </a>
        </div>
      </div>

      {notice && <div className="deck-notice">{notice}</div>}

      <div className="deck-grid">
        {deck.slots.map((slot, index) => {
          const isDropTarget = dropSlot === index
          return (
            <div
              className={`deck-slot ${slot.card ? "has-card" : "is-empty"} ${isDropTarget ? "is-drop-target" : ""}`}
              key={index}
              data-slot={index}
              role="button"
              tabIndex={0}
              draggable={!!slot.card}
              onDragStart={(event) => {
                if (!slot.card) return
                setUserCardDrag(event.nativeEvent, {
                  userCardId: slot.card.userCardId,
                  fromSlot: index,
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
              onClick={() => setPickerSlot(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  setPickerSlot(index)
                }
              }}
              aria-label={slot.card ? `第 ${index + 1} 槽 ${slot.card.name}，点击更换` : `第 ${index + 1} 槽，空`}
            >
              <span className="deck-slot__no">{index + 1}</span>
              {slot.card ? (
                <CardFace card={toFace(slot.card)} />
              ) : (
                <>
                  <span className="deck-slot__plus">+</span>
                  <span className="deck-slot__hint">空槽</span>
                </>
              )}
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
              {isDropTarget && <span className="deck-slot__drop">松开放入</span>}
            </div>
          )
        })}
      </div>

      {pickerSlot != null && (
        <section className="deck-tray" aria-label={`为第 ${pickerSlot + 1} 槽选择卡牌`}>
          <header className="deck-tray__head">
            <div>
              <span>SELECT CARD</span>
              <b>{trayTitle}</b>
            </div>
            <div className="deck-tray__filters">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索玩家名"
                aria-label="搜索卡牌"
              />
              <select
                value={rarity}
                onChange={(event) => setRarity(event.target.value as Rarity | "")}
                aria-label="按品质筛选"
              >
                {RARITIES.map((item) => (
                  <option key={item || "all"} value={item}>
                    {item || "全部品质"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="deck-tray__close"
                onClick={() => setPickerSlot(null)}
                aria-label="收起选卡"
              >
                ×
              </button>
            </div>
          </header>

          {!ready ? (
            <div className="deck-tray__empty">加载卡册…</div>
          ) : pickerResult.error ? (
            <div className="deck-tray__empty">{pickerResult.error}</div>
          ) : pickerResult.rows.length === 0 ? (
            <div className="deck-tray__empty">没有符合条件的卡</div>
          ) : (
            <div className="deck-tray__grid">
              {pickerResult.rows.map((row) => {
                const used = usedIds.has(row.userCardId)
                return (
                  <div
                    key={row.userCardId}
                    className={`deck-pick ${used ? "is-used" : ""}`}
                    role="button"
                    tabIndex={used ? -1 : 0}
                    aria-disabled={used}
                    draggable={!used}
                    onDragStart={(event) => {
                      if (used) return
                      setUserCardDrag(event.nativeEvent, { userCardId: row.userCardId })
                    }}
                    onClick={() => {
                      if (!used) assign(row.userCardId, pickerSlot)
                    }}
                    onKeyDown={(event) => {
                      if (!used && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault()
                        assign(row.userCardId, pickerSlot)
                      }
                    }}
                  >
                    <CardFace card={toFace(row)} />
                    {used && <span className="deck-pick__used">已在卡组</span>}
                  </div>
                )
              })}
            </div>
          )}

          <p className="deck-tray__hint">
            点击直接放入，或把卡拖到上面的槽位。显示战力最高的 {pickerResult?.rows.length ?? 0} 张
            {pickerResult ? ` / 共 ${pickerResult.total} 张` : ""}。
          </p>
        </section>
      )}
    </div>
  )
}
