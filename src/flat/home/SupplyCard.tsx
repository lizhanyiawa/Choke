import { useEffect, useState } from "react"

import { Link } from "@/flat/Link"
import { FLAT_ROUTES } from "@/flat/router"
import type { SupplyGain } from "@/flat/supply/api"
import { refreshSupply, refreshSupplyUnlessPending, useSupply } from "@/flat/supply/store"
import {
  SupplyGainsDialog,
  formatHours,
  supplyIcon,
  useSupplyActions,
} from "@/flat/supply/supplyUi"
import "@/flat/supply/supply.css"

/** 首页的「补给箱」卡：紧凑展示已攒时长、当前倾向、可领小签与一键领取。 */
export function SupplyCard() {
  const { data, error } = useSupply()
  const { claiming, claim } = useSupplyActions()
  const [gains, setGains] = useState<SupplyGain[] | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    void refreshSupplyUnlessPending()
  }, [])

  const retry = () => {
    setRetrying(true)
    void refreshSupply().then(() => setRetrying(false))
  }

  const onClaim = async () => {
    const res = await claim()
    if (res && res.length > 0) setGains(res)
  }

  if (data === null) {
    return (
      <section className="fl-card home-supply">
        <div className="fl-card__head">
          <h2 className="fl-card__title">补给箱</h2>
          <Link className="fl-link" to={FLAT_ROUTES.supply}>
            详情与倾向
          </Link>
        </div>
        {error !== null ? (
          <div className="bk-empty" role="alert">
            <span className="bk-error">{error}</span>
            <button type="button" className="bk-btn bk-btn--sm" disabled={retrying} onClick={retry}>
              {retrying ? "重试中…" : "重试"}
            </button>
          </div>
        ) : (
          <p className="bk-note" role="status">
            正在读取补给箱…
          </p>
        )}
      </section>
    )
  }

  const unlocked = data.boxes.filter((b) => !b.locked)
  const anyFull = unlocked.some((b) => b.full)
  const leadBox = unlocked.reduce<(typeof unlocked)[number] | null>(
    (best, box) => (!best || box.hours > best.hours ? box : best),
    null,
  )

  const focusLabel =
    data.focus === null
      ? "不偏"
      : (data.focusOptions.find((o) => o.id === data.focus)?.label ?? data.focus)

  // 按 resourceId 合并各已解锁箱子里的可领数量
  const readyMap = new Map<string, { id: string; kind: string; label: string; amount: number }>()
  for (const box of unlocked) {
    for (const r of box.resources) {
      if (r.amount <= 0) continue
      const prev = readyMap.get(r.id)
      if (prev) prev.amount += r.amount
      else readyMap.set(r.id, { id: r.id, kind: r.kind, label: r.label, amount: r.amount })
    }
  }
  const ready = [...readyMap.values()]

  return (
    <section className="fl-card home-supply" data-full={anyFull || undefined}>
      <div className="fl-card__head">
        <h2 className="fl-card__title">补给箱</h2>
        <Link className="fl-link" to={FLAT_ROUTES.supply}>
          详情与倾向
        </Link>
        <button
          type="button"
          className="bk-btn bk-btn--sm fl-claim"
          disabled={!data.canClaim || claiming}
          onClick={() => void onClaim()}
        >
          {claiming ? "领取中…" : data.canClaim ? "一键领取" : "暂无可领"}
        </button>
      </div>

      {unlocked.length === 0 ? (
        <p className="bk-note">{data.boxes[0]?.lockedReason ?? "补给箱尚未解锁"}</p>
      ) : (
        <>
          <div className="home-supply__meta">
            <span className={anyFull ? "home-supply__hours is-full" : "home-supply__hours bk-num"}>
              {anyFull
                ? "已满，再攒也不会多"
                : leadBox
                  ? `已攒 ${formatHours(leadBox.hours)} / ${leadBox.capHours} 小时`
                  : "已解锁"}
            </span>
            <span className="home-supply__focus">倾向：{focusLabel}</span>
          </div>

          {ready.length > 0 ? (
            <div className="fl-chips">
              {ready.map((item) => {
                const Icon = supplyIcon(item.kind)
                return (
                  <span key={item.id} className="fl-chip">
                    <Icon className="fl-chip__icon" aria-hidden />
                    {item.label}
                    <b className="fl-good">×{item.amount.toLocaleString("en-US")}</b>
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="bk-note">还没攒满 1 个，过一会儿再来</p>
          )}
        </>
      )}

      {gains && <SupplyGainsDialog gains={gains} onClose={() => setGains(null)} />}
    </section>
  )
}
