import { useEffect, useMemo, useState, type CSSProperties } from "react"

import { CardFace } from "@/card/CardFace"
import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  RARITY_LABEL,
  battlePower,
  formatNo,
} from "@/card/data"
import { skillSeed, subjobFor } from "@/card/jobs"
import {
  constellationCap,
  expToNext,
  isHeroCardId,
  levelCap,
  meltExpOf,
} from "@/card/progression"

import {
  ascendCard,
  fetchFuel,
  levelUpCard,
  meltCard,
  toFace,
  type ApiUserCard,
} from "./api"

interface Props {
  card: ApiUserCard
  userId: string
  onClose: () => void
  onChanged: () => void
}

export function CardDetail({ card, userId, onClose, onChanged }: Props) {
  const [current, setCurrent] = useState(card)
  const [fuel, setFuel] = useState<ApiUserCard[]>([])
  const [fuelOpen, setFuelOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const face = useMemo(() => toFace(current), [current])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetchFuel(userId, card.userCardId, undefined)
      .then((data) => {
        if (!cancelled) setFuel(data.rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, card.userCardId])

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
    setBusy(label)
    setMessage(null)
    try {
      const result = await action()
      setCurrent(result.card)
      setMessage(done(result))
      onChanged()
      fetchFuel(userId, result.card.userCardId)
        .then((data) => setFuel(data.rows))
        .catch(() => {})
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败")
    } finally {
      setBusy(null)
    }
  }

  const levelUp = () =>
    run("level", () => levelUpCard(userId, current.userCardId), (result) => `升级成功，消耗 ${result.spent} EXP`)

  const ascend = () =>
    run("ascend", () => ascendCard(userId, current.userCardId), () => "命座 +1")

  const melt = (source: ApiUserCard) =>
    run(
      `melt-${source.userCardId}`,
      () => meltCard(userId, current.userCardId, source.userCardId),
      (result) => `熔入 ${result.gained} EXP`,
    )

  return (
    <div className="card-detail" role="dialog" aria-modal="true" aria-label={current.name} onClick={onClose}>
      <div className="card-detail__panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="card-detail__close" onClick={onClose} aria-label="关闭">
          ×
        </button>

        <div className="card-detail__face">
          <CardFace card={face} />
        </div>

        <div className="card-detail__info">
          <div className="card-detail__eyebrow">
            {RARITY_LABEL[current.rarity]} · {subjobFor(skillSeed(current.id), current.job).label}
          </div>
          <h2 className="card-detail__name">{current.name}</h2>

          <div className="card-detail__stats">
            <div>
              <span>等级</span>
              <b>
                Lv.{current.level} / {cap}
              </b>
            </div>
            <div>
              <span>命座</span>
              <b>
                {current.constellation} / {conCap}
              </b>
            </div>
            <div>
              <span>战力</span>
              <b>{bp.toLocaleString("en-US")}</b>
            </div>
          </div>

          <div className="card-detail__level">
            <div className="card-detail__level-head">
              <span>{maxed ? "MAX LEVEL" : `EXP ${current.exp} / ${need}`}</span>
              <em>{maxed ? "已满级" : `${Math.round(expPct)}%`}</em>
            </div>
            <div className="card-detail__exp">
              <div style={{ width: `${expPct}%` }} />
            </div>
            <div className="card-detail__actions">
              <button
                type="button"
                className="card-detail__action card-detail__action--primary"
                onClick={() => void levelUp()}
                disabled={!canLevel || busy !== null}
              >
                {busy === "level" ? "升级中…" : maxed ? "已满级" : `升级 · ${need} EXP`}
              </button>
              <button
                type="button"
                className="card-detail__action"
                onClick={() => void ascend()}
                disabled={!canAscend || busy !== null}
                title={sameCardFuel > 0 ? `消耗 1 张同名卡（剩余 ${sameCardFuel}）` : "没有同名卡"}
              >
                {busy === "ascend" ? "升命中…" : `升命座 ${current.constellation}/${conCap}`}
              </button>
              <button
                type="button"
                className="card-detail__action"
                onClick={() => setFuelOpen((open) => !open)}
                disabled={maxed || busy !== null}
              >
                熔卡换经验
              </button>
            </div>
            {message && <p className="card-detail__message">{message}</p>}
          </div>

          {fuelOpen && !maxed && (
            <div className="card-detail__fuel">
              <div className="card-detail__section-title">
                可熔重复卡 · 同名卡 {sameCardFuel} 张
              </div>
              {fuel.length === 0 ? (
                <p className="card-detail__note">没有重复卡。再抽到同一张卡后才能熔。</p>
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

          <div className="card-detail__meta">
            <span>ID: {formatNo(current.no, current.total).replace("/", " / ")}</span>
            {current.country && <span>{current.country}</span>}
            {current.globalRank != null && <span>#{current.globalRank}</span>}
            {current.pp != null && (
              <span>{Math.round(Number(current.pp)).toLocaleString("en-US")}pp</span>
            )}
          </div>

          <div className="card-detail__skills">
            <div className="card-detail__section-title">技能</div>
            {face.skills.map((skill, i) => (
              <div className="card-detail__skill" key={i}>
                <span
                  className="card-detail__element"
                  style={{ "--el": ELEMENT_COLOR[skill.element] } as CSSProperties}
                  title={ELEMENT_LABEL[skill.element]}
                />
                <b>{skill.name}</b>
                <em>{ELEMENT_LABEL[skill.element]}</em>
                <span className="card-detail__cost">
                  {skill.passive ? "被动" : `${skill.ap} AP${skill.mp ? ` · ${skill.mp} MP` : ""}`}
                </span>
              </div>
            ))}
          </div>

          <p className="card-detail__note">
            当前原型：升级只消耗经验，经验来自熔入重复卡；进阶材料、金币和阀门后续接入。
          </p>

          {current.profileUrl && (
            <a className="card-detail__link" href={current.profileUrl} target="_blank" rel="noreferrer">
              查看 osu! 主页
              <i aria-hidden>›</i>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
