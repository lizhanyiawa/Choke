import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { CardFace } from "@/card/CardFace"
import {
  RARITY_LABEL,
  battlePower,
  formatNo,
} from "@/card/data"
import { skillSeed, subjobFor } from "@/card/jobs"
import { JOB_LABEL } from "@/card/cultivation"
import {
  FOIL_COST,
} from "@/card/economy"
import {
  constellationCap,
  expToNext,
  isHeroCardId,
  levelCap,
  meltExpOf,
} from "@/card/progression"

import {
  ascendCard,
  enhanceCard,
  fetchFuel,
  fetchMe,
  levelUpCard,
  listMarketCard,
  meltCard,
  toFace,
  type ApiUserCard,
} from "./api"
import "./book.css"
import "./card-detail.css"

interface Props {
  card: ApiUserCard
  userId: string | null
  readOnly?: boolean
  focusMarket?: boolean
  onClose: () => void
  onChanged?: () => void
  onPlaceOnDesk?: (row: ApiUserCard) => void
}

export function CardDetail({ card, userId, readOnly = false, focusMarket = false, onClose, onChanged, onPlaceOnDesk }: Props) {
  const [current, setCurrent] = useState(card)
  const [fuel, setFuel] = useState<ApiUserCard[]>([])
  const [fuelOpen, setFuelOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [essence, setEssence] = useState<number | null>(null)
  const [coins, setCoins] = useState<number | null>(null)
  const [price, setPrice] = useState("30")

  const face = useMemo(() => toFace(current), [current])
  const subjob = subjobFor(skillSeed(current.id), current.job)
  const skillPreview = new URLSearchParams({
    from: readOnly ? "codex" : "album",
    view: "skills",
    skill: `${subjob.id}/${face.rarity}/A1`,
  })

  useEffect(() => {
    if (readOnly || !userId) return
    let cancelled = false
    fetchMe()
      .then((data) => {
        if (!cancelled) {
          setEssence(data.essence)
          setCoins(data.coins)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [readOnly, userId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    if (readOnly || !userId) return
    let cancelled = false
    fetchFuel(userId, card.userCardId, undefined)
      .then((data) => {
        if (!cancelled) setFuel(data.rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [readOnly, userId, card.userCardId])

  const hero = isHeroCardId(current.id)
  const cap = levelCap(hero)
  const conCap = constellationCap(hero)
  const need = expToNext(current.level, current.rarity, hero)
  const maxed = current.level >= cap
  const canLevel = !maxed && current.exp >= need
  const sameCardFuel = fuel.filter((row) => row.id === current.id).length
  const canAscend = current.constellation < conCap && sameCardFuel > 0
  const expPct = maxed ? 100 : Math.min(100, (current.exp / Math.max(1, need)) * 100)
  const bp = battlePower(face)

  async function run<T extends { card: ApiUserCard }>(
    label: string,
    action: () => Promise<T>,
    done: (result: T) => string,
  ) {
    if (!userId) return
    setBusy(label)
    setMessage(null)
    try {
      const result = await action()
      setCurrent(result.card)
      const maybeWallet = result as { essence?: number }
      if (typeof maybeWallet.essence === "number") setEssence(maybeWallet.essence)
      setMessage(done(result))
      onChanged?.()
      fetchFuel(userId, result.card.userCardId)
        .then((data) => setFuel(data.rows))
        .catch(() => {})
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败")
    } finally {
      setBusy(null)
    }
  }

  const levelUp = () => {
    if (!userId) return
    return run("level", () => levelUpCard(userId, current.userCardId), (result) => `升级成功，消耗 ${result.spent} EXP`)
  }

  const ascend = () => {
    if (!userId) return
    return run("ascend", () => ascendCard(userId, current.userCardId), () => "命座 +1")
  }

  const melt = (source: ApiUserCard) => {
    if (!userId) return
    return run(
      `melt-${source.userCardId}`,
      () => meltCard(userId, current.userCardId, source.userCardId),
      (result) => `熔入 ${result.gained} EXP · +${result.essenceGained} 精华`,
    )
  }

  const enhance = () => {
    if (!userId) return
    return run(
      "foil",
      () => enhanceCard(userId, current.userCardId, "foil"),
      () => "已镀闪，卡面获得闪卡外观",
    )
  }

  const list = async () => {
    if (!userId || busy !== null) return
    const value = Number(price)
    if (!Number.isInteger(value) || value <= 0) {
      setMessage("价格必须是正整数")
      return
    }
    setBusy("list")
    setMessage(null)
    try {
      await listMarketCard(userId, current.userCardId, value)
      setMessage(`已上架市场 · ${value} 金币`)
      onChanged?.()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上架失败")
    } finally {
      setBusy(null)
    }
  }

  return createPortal(
    <div className="card-detail" role="dialog" aria-modal="true" aria-label={current.name} onClick={onClose}>
      <div className="card-detail__panel" data-light onClick={(event) => event.stopPropagation()}>
        <button type="button" className="card-detail__close" onClick={onClose} aria-label="关闭" autoFocus={!focusMarket}>
          ×
        </button>

        <div className="card-detail__face">
          <CardFace card={face} />
          {onPlaceOnDesk && (
            <button className="bk-btn bk-btn--ghost card-detail__desk" type="button" onClick={() => onPlaceOnDesk(current)} disabled={busy !== null}>
              放到牌桌
            </button>
          )}
        </div>

        <div className="card-detail__info">
          <div className="card-detail__eyebrow">
            {RARITY_LABEL[current.rarity]} · {JOB_LABEL[current.job]}
            {current.foil ? " · ✦ FLASH" : ""}
          </div>
          <h2 className="card-detail__name">{current.name}</h2>

          <div className="card-detail__stats">
            {readOnly ? (
              <>
                <div className="bk-stat">
                  <span>品质</span>
                  <b>{RARITY_LABEL[current.rarity]}</b>
                </div>
                <div className="bk-stat">
                  <span>战力</span>
                  <b>{bp.toLocaleString("en-US")}</b>
                </div>
                <div className="bk-stat">
                  <span>图鉴编号</span>
                  <b>{formatNo(current.no, current.total).replace("/", " / ")}</b>
                </div>
              </>
            ) : (
              <>
                <div className="bk-stat">
                  <span>等级</span>
                  <b>
                    Lv.{current.level} / {cap}
                  </b>
                </div>
                <div className="bk-stat">
                  <span>命座</span>
                  <b>
                    {current.constellation} / {conCap}
                  </b>
                </div>
                <div className="bk-stat">
                  <span>战力</span>
                  <b>{bp.toLocaleString("en-US")}</b>
                </div>
              </>
            )}
          </div>

          {!readOnly && (
            <div className="bk-box card-detail__level">
              <div className="card-detail__level-head">
                <span>{maxed ? "MAX LEVEL" : `EXP ${current.exp} / ${need}`}</span>
                <em>{maxed ? "已满级" : `${Math.round(expPct)}%`}</em>
              </div>
              <div className="bk-bar card-detail__exp" style={{ "--p": expPct } as CSSProperties}>
                <i />
              </div>
              <div className="card-detail__actions">
                <button
                  type="button"
                  className="bk-btn bk-btn--main"
                  onClick={() => void levelUp()}
                  disabled={!canLevel || busy !== null}
                >
                  {busy === "level" ? "升级中…" : maxed ? "已满级" : `升级 · ${need} EXP`}
                </button>
                <button
                  type="button"
                  className="bk-btn"
                  onClick={() => void ascend()}
                  disabled={!canAscend || busy !== null}
                  title={sameCardFuel > 0 ? `消耗 1 张同名卡（剩余 ${sameCardFuel}）` : "没有同名卡"}
                >
                  {busy === "ascend" ? "升命中…" : `升命座 ${current.constellation}/${conCap}`}
                </button>
                <button
                  type="button"
                  className="bk-btn"
                  onClick={() => setFuelOpen((open) => !open)}
                  disabled={maxed || busy !== null}
                >
                  熔卡换经验
                </button>
              </div>
              <div className="card-detail__wallet">
                <span>闪卡精华</span>
                <b className="bk-num">{essence ?? "—"}</b>
                <em>只能用于给卡镀闪</em>
              </div>
              <div className="card-detail__actions">
                <button
                  type="button"
                  className="bk-btn"
                  onClick={() => void enhance()}
                  disabled={current.foil || busy !== null || (essence ?? 0) < FOIL_COST}
                >
                  {current.foil ? "已是闪卡" : `精华镀闪 · ${FOIL_COST}`}
                </button>
              </div>
            </div>
          )}

          {!readOnly && fuelOpen && !maxed && (
            <div className="card-detail__fuel">
              <div className="bk-label">可熔重复卡 · 同名卡 {sameCardFuel} 张</div>
              {fuel.length === 0 ? (
                <p className="bk-note">没有重复卡。再抽到同一张卡后才能熔。</p>
              ) : (
                <div className="card-detail__fuel-grid">
                  {fuel.map((row) => (
                    <div
                      key={row.userCardId}
                      className={`card-detail__fuel-card ${busy === `melt-${row.userCardId}` ? "is-busy" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (busy === null) void melt(row)
                      }}
                      onKeyDown={(event) => {
                        if (busy === null && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault()
                          void melt(row)
                        }
                      }}
                    >
                      <CardFace card={toFace(row)} />
                      <span>+{meltExpOf(row.rarity)} EXP</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!readOnly && !hero && (
            <div className="card-detail__market">
              <div className="bk-label">市场 · 金币 {coins ?? "—"}</div>
              <div className="card-detail__market-row">
                <input
                  className="bk-input bk-num"
                  type="number"
                  min={1}
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  aria-label="上架价格"
                  autoFocus={focusMarket}
                />
                <span>金币</span>
                <button
                  type="button"
                  className="bk-btn"
                  onClick={() => void list()}
                  disabled={busy !== null}
                >
                  {busy === "list" ? "上架中…" : "上架市场"}
                </button>
              </div>
            </div>
          )}

          {message && <p className="card-detail__message" role="status">{message}</p>}

          <div className="card-detail__meta">
            <span>ID: {formatNo(current.no, current.total).replace("/", " / ")}</span>
            {current.country && <span>{current.country}</span>}
            {current.globalRank != null && <span>#{current.globalRank}</span>}
            {current.pp != null && (
              <span>{Math.round(Number(current.pp)).toLocaleString("en-US")}pp</span>
            )}
          </div>

          <a className="bk-btn bk-btn--ghost card-detail__link" href={"/battle?" + skillPreview}>
            技能预览 <i aria-hidden>›</i>
          </a>

          {current.profileUrl && (
            <a className="bk-btn bk-btn--ghost card-detail__link" href={current.profileUrl} target="_blank" rel="noreferrer">
              查看 osu! 主页
              <i aria-hidden>›</i>
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
