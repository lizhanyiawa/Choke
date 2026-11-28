import { FiChevronRight } from "react-icons/fi"

import { POOL_META } from "@/desk/lib/rarity"
import type { PackPool } from "@/desk/lib/types"
import { PackArt } from "@/desk/opening/PackArt"
import type { GameConfig, PackCatalogEntry } from "@/desk/session/api"
import { MYSTERY_PACK_ID } from "@choke/shared/content"

export type PackEntry = PackCatalogEntry & { id: PackPool }
export type PackChoice = PackPool | typeof MYSTERY_PACK_ID

export function visiblePacks(config: GameConfig | null, counts: Record<string, number> | null) {
  return config?.packs.filter((pack): pack is PackEntry =>
    Object.hasOwn(POOL_META, pack.id) && (!pack.event || (counts?.[pack.id] ?? 0) > 0),
  ) ?? []
}

export function packTotal(counts: Record<string, number> | null) {
  return counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : null
}

export function PackImage({ id, className = "" }: { id: PackChoice; className?: string }) {
  return (
    <span className={`fl-pack-art ${className}`} aria-hidden>
      {id === MYSTERY_PACK_ID ? <i className="backpack-mystery" /> : <PackArt pool={id} />}
    </span>
  )
}

export function PackList({ title, total, choices, selected, onSelect, disabled, inventory }: {
  title: string
  total: number | null
  choices: readonly { id: PackChoice; name: string; count: number | null; bound?: boolean; claimed?: boolean }[]
  selected: PackChoice | undefined
  onSelect: (id: PackChoice) => void
  disabled?: boolean
  inventory?: boolean
}) {
  return (
    <section className={`fl-card fl-pack-list${inventory ? " fl-pack-list--inventory" : ""}`}>
      <header className="fl-card__head">
        <h2 className="fl-card__title">{title}</h2>
        {total !== null && <span className={inventory ? "fl-info" : "fl-card__meta"}>{inventory ? "共" : "库存"} {total.toLocaleString()} 包</span>}
      </header>
      <div className="fl-pack-list__rows" role="group" aria-label={title}>
        {choices.map(({ id, name, count, bound, claimed }) => (
          <button type="button" className="fl-pack-list__row" key={id} disabled={disabled} aria-pressed={id === selected} onClick={() => onSelect(id)}>
            <PackImage id={id} />
            <b>{name}</b>
            {bound && <small>绑定</small>}
            {claimed ? <span className="fl-pack-list__count fl-good">本体卡已获得</span> : (
              <span className="fl-pack-list__count">{count === null ? "—" : `×${count.toLocaleString()}`}</span>
            )}
            {inventory && <FiChevronRight size={14} aria-hidden />}
          </button>
        ))}
      </div>
    </section>
  )
}

export function PackLoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="fl-card fl-pack-error" role="alert">
      <span>{message}</span>
      <button type="button" className="bk-btn bk-btn--sm" onClick={retry}>重试</button>
    </div>
  )
}
