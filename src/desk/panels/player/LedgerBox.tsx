import { Fragment, useCallback, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import {
  GiCardRandom,
  GiCrystalShine,
  GiCutDiamond,
  GiNotebook,
  GiOpenTreasureChest,
  GiTwoCoins,
} from "react-icons/gi"

import { LEDGER_KIND_LABEL, type LedgerEntryView, type LedgerKind } from "@choke/shared/ledger"

import { playSfx } from "@/audio/sfx"
import { RARITY_LABEL } from "@/card/data"
import { useModal } from "@/ui/useModal"
import { usePresence } from "@/ui/usePresence"

import { fetchLedger } from "@/desk/session/api"

import "@/desk/book.css"
import "@/desk/panels/mail/mail-box.css"
import "@/desk/panels/player/ledger-box.css"

/** 和 mail-box.css 里弹层离场动画的时长一致 */
const EXIT_MS = 170

const FILTERS: readonly { kind: LedgerKind | null; label: string }[] = [
  { kind: null, label: "全部" },
  { kind: "coins", label: LEDGER_KIND_LABEL.coins },
  { kind: "expPool", label: LEDGER_KIND_LABEL.expPool },
  { kind: "essence", label: LEDGER_KIND_LABEL.essence },
  { kind: "item", label: LEDGER_KIND_LABEL.item },
  { kind: "pack", label: LEDGER_KIND_LABEL.pack },
  { kind: "card", label: LEDGER_KIND_LABEL.card },
]

const KIND_ICON: Record<LedgerKind, typeof GiTwoCoins> = {
  coins: GiTwoCoins,
  expPool: GiNotebook,
  essence: GiCutDiamond,
  item: GiCrystalShine,
  pack: GiOpenTreasureChest,
  card: GiCardRandom,
}

const pad = (n: number) => String(n).padStart(2, "0")

/** 按天分组用的小标题：今天 / 昨天 / 月-日 */
function dayLabel(date: Date, today: Date): string {
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000,
  )
  if (days === 0) return "今天"
  if (days === 1) return "昨天"
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

export function LedgerBox({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<LedgerKind | null>(null)
  const [entries, setEntries] = useState<LedgerEntryView[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const panelRef = useRef<HTMLElement>(null)
  const { mounted, leaving } = usePresence(open, EXIT_MS)

  const load = useCallback(
    async (kind: LedgerKind | null, before?: number) => {
      const mine = ++seq.current
      setLoading(true)
      try {
        const page = await fetchLedger(userId, { kind: kind ?? undefined, before })
        if (mine !== seq.current) return
        setEntries((prev) => (before ? [...prev, ...page.entries] : page.entries))
        setHasMore(page.hasMore)
        setError(null)
      } catch (reason) {
        if (mine !== seq.current) return
        setError(reason instanceof Error ? reason.message : "流水加载失败")
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    },
    [userId],
  )

  const close = useCallback(() => {
    playSfx("close")
    setOpen(false)
  }, [])

  // Esc 关闭、Tab 留在弹层里、关掉后焦点还给「流水」按钮
  useModal(panelRef, { active: open, onClose: close })

  const openPanel = () => {
    playSfx("open")
    setOpen(true)
    setEntries([])
    void load(filter)
  }

  const pick = (kind: LedgerKind | null) => {
    if (kind === filter) return
    setFilter(kind)
    setEntries([])
    setHasMore(false)
    void load(kind)
  }

  const last = entries[entries.length - 1]
  const today = new Date()
  const days = entries.map((entry) => dayLabel(new Date(entry.createdAt), today))

  return (
    <>
      <button type="button" className="desk-button desk-ledger-button" onClick={openPanel} title="货币、道具、卡包、卡牌的增减记录">
        <GiNotebook className="desk-ledger-button__icon" aria-hidden />
        流水
      </button>

      {mounted &&
        createPortal(
          <div
            className={`mail-backdrop ${leaving ? "is-leaving" : ""}`}
            onPointerDown={(event) => event.target === event.currentTarget && close()}
          >
            <section
              ref={panelRef}
              className="mail-panel ledger-panel"
              role="dialog"
              aria-modal="true"
              aria-label="流水"
            >
              <header className="mail-panel__head">
                <div>
                  <span className="bk-label">LEDGER</span>
                  <h2 className="mail-panel__title">流水</h2>
                </div>
                <div className="mail-panel__actions">
                  <button type="button" className="bk-btn bk-btn--ghost bk-btn--sm" onClick={close} aria-label="关闭流水">
                    关闭
                  </button>
                </div>
              </header>

              <div className="ledger-tabs" role="tablist" aria-label="按类别筛选">
                {FILTERS.map((item) => {
                  const Icon = item.kind ? KIND_ICON[item.kind] : null
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="tab"
                      aria-selected={item.kind === filter}
                      className={`bk-chip ${item.kind === filter ? "is-on" : ""}`}
                      onClick={() => pick(item.kind)}
                    >
                      {Icon && <Icon aria-hidden />}
                      {item.label}
                    </button>
                  )
                })}
              </div>

              <div className="ledger-body">
                {error && (
                  <div className="ledger-empty bk-note">
                    {error}
                    <button type="button" className="bk-btn bk-btn--ghost bk-btn--sm" onClick={() => void load(filter)}>
                      重试
                    </button>
                  </div>
                )}
                {!error && loading && entries.length === 0 && (
                  <div className="ledger-empty bk-note" role="status">
                    <i className="mail-empty__spin" aria-hidden />
                    加载中
                  </div>
                )}
                {!error && !loading && entries.length === 0 && (
                  <div className="ledger-empty bk-note">
                    <GiNotebook className="mail-empty__icon" aria-hidden />
                    {filter ? `还没有${LEDGER_KIND_LABEL[filter]}的记录` : "还没有记录"}
                    <span>开包、战斗、市场买卖之后会记在这里。</span>
                  </div>
                )}
                {entries.length > 0 && (
                  // key 用筛选项：换一类，列表重新落一遍
                  <ul key={filter ?? "all"} className="ledger-list" aria-label="流水列表">
                    {entries.map((entry, index) => {
                      const date = new Date(entry.createdAt)
                      const day = days[index]
                      // 和上一条不是同一天：先放一行日期
                      const head = day !== days[index - 1]
                      const Icon = KIND_ICON[entry.kind]
                      return (
                        <Fragment key={entry.id}>
                          {head && <li className="ledger-day bk-label">{day}</li>}
                          <li className="ledger-row" style={{ "--i": Math.min(index, 14) } as CSSProperties}>
                            <span className="ledger-row__time">
                              {pad(date.getHours())}:{pad(date.getMinutes())}:{pad(date.getSeconds())}
                            </span>
                            <span className="ledger-row__kind">
                              <Icon aria-hidden />
                              {LEDGER_KIND_LABEL[entry.kind]}
                            </span>
                            <span className="ledger-row__label">
                              {entry.label}
                              {entry.rarity && <i className="ledger-row__rarity">{(RARITY_LABEL as Record<string, string>)[entry.rarity] ?? entry.rarity}</i>}
                            </span>
                            <span className="ledger-row__source">{entry.sourceLabel}</span>
                            <b className={`ledger-row__delta ${entry.delta > 0 ? "is-gain" : "is-loss"}`}>
                              {entry.delta > 0 ? "+" : "−"}
                              {Math.abs(entry.delta).toLocaleString("en-US")}
                            </b>
                          </li>
                        </Fragment>
                      )
                    })}
                  </ul>
                )}
                {hasMore && last && (
                  <div className="ledger-more">
                    <button
                      type="button"
                      className="bk-btn bk-btn--sm"
                      disabled={loading}
                      onClick={() => void load(filter, last.id)}
                      data-sfx="paper"
                    >
                      {loading ? "加载中…" : "加载更早的记录"}
                    </button>
                  </div>
                )}
              </div>

              <footer className="mail-panel__foot bk-note">
                只记录上线之后的变化。
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}
