import { useEffect, useMemo, type CSSProperties } from "react"

import { CardFace } from "@/card/CardFace"
import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  JOB_LABEL,
  RARITY_LABEL,
  battlePower,
  formatNo,
} from "@/card/data"

import { toFace, type ApiUserCard } from "./api"

interface Props {
  card: ApiUserCard
  onClose: () => void
}

export function CardDetail({ card, onClose }: Props) {
  const face = useMemo(() => toFace(card), [card])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const bp = battlePower(face)

  return (
    <div className="card-detail" role="dialog" aria-modal="true" aria-label={card.name} onClick={onClose}>
      <div className="card-detail__panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="card-detail__close" onClick={onClose} aria-label="关闭">
          ×
        </button>

        <div className="card-detail__face">
          <CardFace card={face} />
        </div>

        <div className="card-detail__info">
          <div className="card-detail__eyebrow">
            {RARITY_LABEL[card.rarity]} · {JOB_LABEL[card.job] ?? card.job}
          </div>
          <h2 className="card-detail__name">{card.name}</h2>

          <div className="card-detail__stats">
            <div>
              <span>等级</span>
              <b>Lv.{card.level}</b>
            </div>
            <div>
              <span>命座</span>
              <b>{card.constellation} / {card.id.startsWith("hero-") ? 12 : 6}</b>
            </div>
            <div>
              <span>战力</span>
              <b>{bp.toLocaleString("en-US")}</b>
            </div>
          </div>

          <div className="card-detail__meta">
            <span>ID: {formatNo(card.no, card.total).replace("/", " / ")}</span>
            {card.country && <span>{card.country}</span>}
            {card.globalRank != null && <span>#{card.globalRank}</span>}
            {card.pp != null && <span>{Math.round(Number(card.pp)).toLocaleString("en-US")}pp</span>}
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

          <p className="card-detail__note">升级与命座材料接入经济系统后开放。</p>

          {card.profileUrl && (
            <a className="card-detail__link" href={card.profileUrl} target="_blank" rel="noreferrer">
              查看 osu! 主页
              <i aria-hidden>›</i>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
