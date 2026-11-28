import { useEffect, useState } from "react"

import type { SupplyBoxView, SupplyGain } from "./api"
import { refreshSupply, refreshSupplyUnlessPending, useSupply } from "./store"
import {
  SupplyGainsDialog,
  formatHours,
  formatPerDay,
  supplyIcon,
  useSupplyActions,
} from "./supplyUi"
import "./supply.css"

export function SupplyPage() {
  const { data, error } = useSupply()
  const { claiming, focusing, claim, chooseFocus } = useSupplyActions()
  const [gains, setGains] = useState<SupplyGain[] | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    void refreshSupplyUnlessPending()
  }, [])

  const onClaim = async () => {
    const res = await claim()
    if (res && res.length > 0) setGains(res)
  }

  const retry = () => {
    setRetrying(true)
    void refreshSupply().then(() => setRetrying(false))
  }

  const focusShare = data?.boxes.find((b) => !b.locked)?.focusSharePercent
  const busy = claiming || focusing

  return (
    <div className="fl-page supply-page">
      <header className="fl-page__head supply-head">
        <div className="supply-head__intro">
          <h1 className="fl-page__title">补给箱</h1>
          <p className="bk-note">离线也会按小时自动累计物资；切换倾向立即生效，已攒下的存货不会损失。</p>
        </div>
        {data && (
          <button
            type="button"
            className="bk-btn bk-btn--main"
            disabled={!data.canClaim || claiming}
            onClick={() => void onClaim()}
          >
            {claiming ? "领取中…" : "一键领取"}
          </button>
        )}
      </header>

      {data === null ? (
        error !== null ? (
          <div className="fl-card bk-empty" role="alert">
            <span className="bk-error">{error}</span>
            <button type="button" className="bk-btn bk-btn--sm" disabled={retrying} onClick={retry}>
              {retrying ? "重试中…" : "重试"}
            </button>
          </div>
        ) : (
          <div className="fl-card">
            <p className="bk-note" role="status">
              正在读取补给箱…
            </p>
          </div>
        )
      ) : (
        <>
          {error !== null && (
            <div className="bk-error" role="alert">
              {error}
            </div>
          )}

          {data.focusOptions.length > 0 && (
            <section className="fl-card supply-focus" aria-label="产出倾向">
              <div className="fl-card__head">
                <h2 className="fl-card__title">产出倾向</h2>
                {focusing && <span className="fl-card__meta">正在切换…</span>}
              </div>
              <p className="bk-note">
                {focusShare !== undefined
                  ? `选定后该资源占约 ${focusShare}% 价值，其余仍保底产出；切换即时生效，已攒存货不变。`
                  : "选定后对应资源产出提高，其余仍保底产出；切换即时生效，已攒存货不变。"}
              </p>
              <div className="bk-chips" role="group" aria-label="选择产出倾向">
                <button
                  type="button"
                  className="bk-chip"
                  aria-pressed={data.focus === null}
                  disabled={busy}
                  onClick={() => {
                    if (data.focus !== null) void chooseFocus(null)
                  }}
                >
                  不偏（均衡）
                </button>
                {data.focusOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="bk-chip"
                    aria-pressed={data.focus === opt.id}
                    disabled={busy}
                    onClick={() => {
                      if (data.focus !== opt.id) void chooseFocus(opt.id, opt.label)
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {data.boxes.length === 0 ? (
            <div className="fl-card bk-empty">目前还没有可用的补给箱。</div>
          ) : (
            <div className="supply-boxes">
              {data.boxes.map((box) => (
                <SupplyBoxCard key={box.id} box={box} />
              ))}
            </div>
          )}
        </>
      )}

      {gains && <SupplyGainsDialog gains={gains} onClose={() => setGains(null)} />}
    </div>
  )
}

function SupplyBoxCard({ box }: { box: SupplyBoxView }) {
  if (box.locked) {
    return (
      <article className="fl-card supply-box is-locked">
        <div className="fl-card__head">
          <h2 className="fl-card__title">{box.name}</h2>
          <span className="supply-box__lock">{box.lockedReason ?? "尚未解锁"}</span>
        </div>
        {box.summary && <p className="bk-note">{box.summary}</p>}
        <ul className="supply-res">
          {box.resources.map((r) => {
            const Icon = supplyIcon(r.kind)
            return (
              <li key={r.id} className="supply-res__row">
                <span className="supply-res__left">
                  <Icon className="supply-res__icon" aria-hidden />
                  <span className="supply-res__label">{r.label}</span>
                </span>
                <span className="supply-res__sub bk-num">约 {formatPerDay(r.perDay)}/天</span>
              </li>
            )
          })}
        </ul>
      </article>
    )
  }

  const pct = box.capHours > 0 ? Math.min(100, (box.hours / box.capHours) * 100) : 0

  return (
    <article className="fl-card supply-box" data-full={box.full || undefined}>
      <div className="fl-card__head">
        <h2 className="fl-card__title">{box.name}</h2>
        <span className={box.full ? "supply-box__status is-full" : "supply-box__status bk-num"}>
          {box.full
            ? "已满，再攒也不会多"
            : `已攒 ${formatHours(box.hours)} / ${box.capHours} 小时`}
        </span>
      </div>
      {box.summary && <p className="bk-note">{box.summary}</p>}
      <div className="supply-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <ul className="supply-res">
        {box.resources.map((r) => {
          const Icon = supplyIcon(r.kind)
          const focused = box.focus === r.id
          return (
            <li key={r.id} className="supply-res__row">
              <div className="supply-res__main">
                <span className="supply-res__left">
                  <Icon className="supply-res__icon" aria-hidden />
                  <span className="supply-res__label">{r.label}</span>
                  {focused && <span className="supply-res__tag">倾向</span>}
                </span>
                <span className={r.amount > 0 ? "supply-res__amt bk-num fl-good" : "supply-res__amt is-zero"}>
                  {r.amount > 0 ? `×${r.amount.toLocaleString("en-US")}` : "未满 1 个"}
                </span>
              </div>
              <div className="supply-res__sub bk-num">
                约 {formatPerDay(r.perDay)}/天 · 占比 {r.sharePercent}%
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
