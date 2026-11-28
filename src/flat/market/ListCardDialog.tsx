import { useCallback, useRef, useState } from "react"

import { fetchMarketHistory, listMarketCard } from "@/desk/session/api"
import type { ApiUserCard } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { FlatDialog } from "@/flat/ui/FlatDialog"
import { useResource } from "@/flat/ui/useResource"
import { featureLockHint } from "@/tutorial/unlocks"
import { MARKET_MAX_PRICE, marketListingFees } from "@choke/shared/economy"

export function ListCardDialog({ card, onClose, onListed }: {
  card: ApiUserCard
  onClose: () => void
  onListed: () => void
}) {
  const { user, progress, notify } = useFlat()
  const lock = featureLockHint("market", progress)
  const loadHistory = useCallback((signal: AbortSignal) => fetchMarketHistory(card.id, signal), [card.id])
  const history = useResource(lock ? null : loadHistory)
  const band = history.data?.priceBand
  const [price, setPrice] = useState("30")
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const inFlight = useRef(false)
  const value = Number(price)
  const valid = Number.isInteger(value) && value >= 1 && value <= MARKET_MAX_PRICE
    && (!band || (value >= band.minPrice && value <= band.maxPrice))
  const fees = valid ? marketListingFees(value) : null
  const canList = !lock && fees !== null && user.coins >= fees.upfrontTotal

  async function submit() {
    if (!canList || inFlight.current) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      await listMarketCard(user.id, card.userCardId, value)
      notify(`已上架 ${card.name} · ${value} 金币`, "success")
      onListed()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "上架失败")
      setConfirming(false)
      history.reload()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <FlatDialog title={`上架 ${card.name}`} onClose={onClose} busy={busy}>
      {lock ? <p>{lock}</p> : <>
        <p>余额 {user.coins} 金币。挂单有效期 7 天，成交时另扣 5% 成交税。</p>
        {band && <p>参考均价 {band.avgPrice} 金币，可挂 {band.minPrice}–{band.maxPrice} 金币。</p>}
        {history.error && <p>参考价读取失败。 <button type="button" className="bk-btn" onClick={history.reload}>重试</button></p>}
        <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <label>上架价格（金币） <input className="bk-input" type="number" min={band?.minPrice ?? 1} max={band?.maxPrice ?? MARKET_MAX_PRICE} step={1} required value={price} disabled={busy} onChange={(event) => { setPrice(event.target.value); setConfirming(false); setError("") }} /></label>
          {fees && <p>预扣 {fees.upfrontTotal} 金币：上架税 {fees.listTax}（不退） · 押金 {fees.deposit}（成交、下架或到期时退回）。</p>}
          {fees && user.coins < fees.upfrontTotal && <p>金币不足，无法支付上架税和押金。</p>}
          {error && <p role="alert">{error}</p>}
          <button className="bk-btn bk-btn--main" type="submit" disabled={!canList || busy}>{busy ? "上架中…" : confirming ? `确认以 ${value} 金币上架` : "预览上架"}</button>
        </form>
      </>}
    </FlatDialog>
  )
}
