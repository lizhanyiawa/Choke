import { useEffect, useState } from "react"

import { CardFace } from "@/card/CardFace"
import { battlePower } from "@/card/data"

import {
  fetchDeck,
  fetchUserCards,
  saveDeck,
  toFace,
  type ApiDeck,
  type ApiUserCard,
} from "./api"

interface Picker {
  slotIndex: number
  rows: ApiUserCard[]
  loading: boolean
  error: string | null
}

export function DeckPanel({ userId }: { userId: string | null }) {
  const [deck, setDeck] = useState<ApiDeck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [picker, setPicker] = useState<Picker | null>(null)

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

  const persist = async (slots: ApiDeck["slots"]) => {
    if (saving) return
    setSaving(true)
    try {
      const next = await saveDeck(
        userId,
        slots.map((slot) => slot.card?.userCardId ?? null),
      )
      setDeck(next)
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const openPicker = async (slotIndex: number) => {
    setPicker({ slotIndex, rows: [], loading: true, error: null })
    try {
      const data = await fetchUserCards(userId, { limit: 24, sort: "pp" })
      setPicker((prev) =>
        prev && prev.slotIndex === slotIndex ? { ...prev, rows: data.rows, loading: false } : prev,
      )
    } catch (reason) {
      setPicker((prev) =>
        prev && prev.slotIndex === slotIndex
          ? {
              ...prev,
              loading: false,
              error: reason instanceof Error ? reason.message : "加载卡册失败",
            }
          : prev,
      )
    }
  }

  const choose = (card: ApiUserCard) => {
    if (!picker) return
    if (deck.slots.some((slot) => slot.card?.userCardId === card.userCardId)) return
    const slots = deck.slots.map((slot, index) =>
      index === picker.slotIndex ? { slot: index + 1, card } : slot,
    )
    setDeck({ ...deck, slots })
    setPicker(null)
    void persist(slots)
  }

  const remove = (slotIndex: number) => {
    const slots = deck.slots.map((slot, index) =>
      index === slotIndex ? { slot: index + 1, card: null } : slot,
    )
    setDeck({ ...deck, slots })
    void persist(slots)
  }

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

      <p className="command-note">
        主队 7 张 · 总战力 {totalBp.toLocaleString("en-US")}；侧面支援之后另开一栏，不占这 7 个槽。
      </p>

      <div className="deck-grid">
        {deck.slots.map((slot, index) => (
          <div
            className={`deck-slot ${slot.card ? "" : "is-empty"}`}
            key={index}
            role="button"
            tabIndex={0}
            onClick={() => void openPicker(index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                void openPicker(index)
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
          </div>
        ))}
      </div>

      {picker && (
        <div className="deck-picker" role="dialog" aria-modal="true" aria-label="选择卡牌" onClick={() => setPicker(null)}>
          <div className="deck-picker__panel" onClick={(event) => event.stopPropagation()}>
            <header className="deck-picker__head">
              <div>
                <span>SELECT CARD</span>
                <b>第 {picker.slotIndex + 1} 槽</b>
              </div>
              <button type="button" className="card-detail__close" onClick={() => setPicker(null)} aria-label="关闭">
                ×
              </button>
            </header>

            {picker.loading ? (
              <div className="album-panel__empty">加载卡册…</div>
            ) : picker.error ? (
              <div className="album-panel__empty">{picker.error}</div>
            ) : picker.rows.length === 0 ? (
              <div className="album-panel__empty">还没有卡，先去开包</div>
            ) : (
              <div className="deck-picker__grid">
                {picker.rows.map((row) => {
                  const used = deck.slots.some((slot) => slot.card?.userCardId === row.userCardId)
                  return (
                    <div
                      key={row.userCardId}
                      className={`deck-pick ${used ? "is-used" : ""}`}
                      role="button"
                      tabIndex={used ? -1 : 0}
                      aria-disabled={used}
                      onClick={() => {
                        if (!used) choose(row)
                      }}
                      onKeyDown={(event) => {
                        if (!used && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault()
                          choose(row)
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

            <p className="command-note">显示战力最高的 24 张；更多卡后面用卡册筛选。</p>
          </div>
        </div>
      )}
    </div>
  )
}
