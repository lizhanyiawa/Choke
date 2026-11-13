import { memo, useEffect, useRef, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  JOB_LABEL,
  MOD_COLOR,
  RARITY_LABEL,
  battlePower,
  bpColor,
  flagUrl,
  formatNo,
  hashOf,
  nameSizeOf,
  starStates,
} from "./data"
import { trackCardLight } from "./light"
import type { CardFaceData, CardFaceMode, Element, Job } from "./types"
import "./card-face.css"

interface Props {
  card: CardFaceData
  mode?: CardFaceMode
  className?: string
  /** 书里的邻页提前加载，避免翻过去时才开始请求插画 */
  eager?: boolean
}

/**
 * 纸质卡面。分区从上到下：
 * 顶栏（品阶徽记 / 品阶名 / Lv / MOD 三槽）→ 插画窗（banner，右下压一块头像，左下命座星）
 * → 卡名条（名字 / 排名 / pp）→ 技能行（1–3 行，行数少时插画窗自动拉高）→ 底栏（职业 / BP / 编号）。
 * 战斗态只留插画窗和技能行。材质、压印、闪卡膜全在 card-face.css。
 */
export const CardFace = memo(function CardFace({ card, mode = "collection", className, eager = false }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(trackCardLight, [])

  useEffect(() => {
    if (!card.foil || !cardRef.current) return

    const element = cardRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) element.dataset.sweepVisible = ""
        else delete element.dataset.sweepVisible
      },
      { rootMargin: "100px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [card.foil])

  const bp = battlePower(card)
  const flag = flagUrl(card.country)
  // 三个 MOD 槽；装得更多时第三格改成 +N
  const modOverflow = card.mods.length > 3
  const mods = modOverflow ? card.mods.slice(0, 2) : card.mods
  const nameStyle = {
    "--name-size": `${nameSizeOf(card.name)}cqw`,
  } as CSSProperties

  return (
    <div
      ref={cardRef}
      className={cn("cf", className)}
      data-rarity={card.rarity}
      data-mode={mode}
      data-foil={card.foil ? "true" : undefined}
    >
      <div className="cf__stock" aria-hidden />
      <div className="cf__sheen" aria-hidden />
      <div className="cf__bezel" aria-hidden />

      <div className="cf__content">
        <header className="cf__head">
          <span className="cf__seal" title={RARITY_LABEL[card.rarity]}>
            <i className="cf__emblem" />
          </span>

          <div className="cf__grade">
            <span className="cf__rarity">{RARITY_LABEL[card.rarity]}</span>
            <span className="cf__lv">
              <i>Lv</i>
              <b>{card.level}</b>
              {card.isHero && <em className="cf__hero">HERO</em>}
            </span>
          </div>

          <div className="cf__mods">
            {[0, 1, 2].map((slot) => {
              if (modOverflow && slot === 2) {
                return (
                  <span className="cf__mod cf__mod--more" key={slot}>
                    +{card.mods.length - 2}
                  </span>
                )
              }
              const mod = mods[slot]
              return mod ? (
                <span
                  className="cf__mod cf__mod--on"
                  key={slot}
                  style={{ "--mod": MOD_COLOR[mod] } as CSSProperties}
                >
                  {mod}
                </span>
              ) : (
                <span className="cf__mod" key={slot} aria-hidden />
              )
            })}
          </div>
        </header>

        <div className="cf__art">
          <div className="cf__window">
            {/* 没有 banner 时用头像放大虚化垫底；两样都没有就是一扇空窗 */}
            {(card.banner || card.art) && (
              <img
                className={cn(
                  "cf__banner",
                  !card.banner && "cf__banner--blur"
                )}
                src={card.banner || card.art}
                alt=""
                draggable={false}
                loading={eager ? "eager" : "lazy"}
                decoding="async"
                fetchPriority="low"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="cf__stars" aria-label={`命座 ${card.constellation}`}>
              {starStates(card).map((state, i) => (
                <i className="cf__star" data-state={state} key={i} />
              ))}
            </div>
          </div>

          <div className="cf__avatar">
            {card.art && (
              <img
                src={card.art}
                alt=""
                draggable={false}
                loading={eager ? "eager" : "lazy"}
                decoding="async"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </div>

        <div className="cf__title">
          <div className="cf__name-wrap">
            {card.profileUrl ? (
              <a
                className="cf__name"
                href={card.profileUrl}
                title={card.name}
                target="_blank"
                rel="noreferrer"
                style={nameStyle}
              >
                {card.name}
              </a>
            ) : (
              <h3 className="cf__name" title={card.name} style={nameStyle}>
                {card.name}
              </h3>
            )}
            <span className="cf__name-rule" aria-hidden />
          </div>

          {(card.country || card.globalRank != null || card.pp != null) && (
            <div className="cf__stats">
              {(card.country || card.globalRank != null) && (
                <span className="cf__stat">
                  {flag && (
                    <img
                      className="cf__flag"
                      src={flag}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <b>
                    {card.globalRank != null
                      ? `#${card.globalRank.toLocaleString("en-US")}`
                      : card.country}
                  </b>
                </span>
              )}
              {card.pp != null && (
                <span className="cf__stat">
                  <b>{Math.round(card.pp).toLocaleString("en-US")}</b>
                  <i>pp</i>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="cf__skills">
          {card.skills.slice(0, 3).map((skill, i) => (
            <div className="cf__skill" key={i}>
              <span
                className="cf__el"
                style={
                  { "--el": ELEMENT_COLOR[skill.element] } as CSSProperties
                }
                title={ELEMENT_LABEL[skill.element]}
              >
                <ElementGlyph element={skill.element} />
              </span>
              <span className="cf__skill-name">{skill.name}</span>
              <span className="cf__cost">
                {skill.mp !== undefined && (
                  <span className="cf__mp" title="MP">
                    {skill.mp}
                  </span>
                )}
                {skill.passive ? (
                  <span className="cf__passive">PAS</span>
                ) : (
                  <span className="cf__ap" title="AP">
                    {skill.ap}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        <footer className="cf__foot">
          <span className="cf__job" title={JOB_LABEL[card.job]}>
            <JobGlyph job={card.job} />
          </span>
          <span
            className="cf__bp"
            style={{ "--bp": bpColor(bp) } as CSSProperties}
          >
            <i>BP</i>
            <b>{bp.toLocaleString("en-US")}</b>
          </span>
          <span className="cf__imprint" aria-hidden>
            Choke!
            <br />
            Trading Card
            <br />
            Series 2026
          </span>
          <span className="cf__no">{formatNo(card.no, card.total)}</span>
        </footer>
      </div>

      {card.foil && (
        <div
          className="cf__foil"
          // 每张闪卡的扫光错开，不会整页一起闪
          style={{ "--seed": hashOf(card.id) % 97 } as CSSProperties}
          aria-hidden
        >
          <i className="cf__foil-film" />
          <i className="cf__foil-dodge" />
          <i className="cf__foil-glitter" />
          <i className="cf__foil-glitter cf__foil-glitter--b" />
          <i className="cf__foil-glare" />
          <i className="cf__foil-sweep" />
        </div>
      )}
    </div>
  )
})

function JobGlyph({ job }: { job: Job }) {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const

  switch (job) {
    case "tank":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3.4l7 2.3v6.1c0 4-3 7.2-7 8.8-4-1.6-7-4.8-7-8.8V5.7z" {...line} />
        </svg>
      )
    case "warrior":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M14.5 4.2l5.3 5.3-9.8 9.8-5.3-5.3z" {...line} />
          <path d="M18.2 5.8l2-2M4.2 19.8l2.5-2.5" {...line} />
        </svg>
      )
    case "mage":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3.6l1.8 6 6.6 1.8-6.6 1.8-1.8 6-1.8-6L3.6 11.4l6.6-1.8z" {...line} />
        </svg>
      )
    case "support":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M9.6 3.6h4.8v6h6v4.8h-6v6h-4.8v-6h-6v-4.8h6z" {...line} />
        </svg>
      )
  }
}

function ElementGlyph({ element }: { element: Element }) {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const

  switch (element) {
    case "metal":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M5 9h14l-2.4 9H7.4z" {...line} />
          <path d="M9 9V6h6v3" {...line} />
        </svg>
      )
    case "wood":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M5 19c1.6-8 6-12.6 14-14-.8 8.6-5 12.6-14 14z" {...line} />
          <path d="M8 16c2-3.6 4.4-6 7.6-8" {...line} />
        </svg>
      )
    case "earth":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M3 19h18l-6.4-11-4 7-2.8-3.6z" {...line} />
        </svg>
      )
    case "ice":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" {...line} />
          <path d="M12 3l-2.2 2.4M12 3l2.2 2.4M12 21l-2.2-2.4M12 21l2.2-2.4" {...line} />
        </svg>
      )
    case "fire":
      return (
        <svg viewBox="0 0 24 24">
          <path
            d="M12 3.4c2.6 3.8 5.6 5.8 5.6 9.4a5.6 5.6 0 0 1-11.2 0c0-2.4 1.4-3.9 2.8-5.6.4 1.6 1.1 2.4 1.9 2.4-.9-2.4-.3-4.8 1-6.2z"
            {...line}
          />
        </svg>
      )
    case "thunder":
      return (
        <svg viewBox="0 0 24 24">
          <path
            d="M4 9.5h11.5a2.5 2.5 0 1 0-2.3-3.5M3 13h14.5a2.5 2.5 0 1 1-2.3 3.5M5 16.5h6.5"
            {...line}
          />
        </svg>
      )
    case "light":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4.2" {...line} />
          <path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.4 5.4l2 2M16.6 16.6l2 2M18.6 5.4l-2 2M7.4 16.6l-2 2" {...line} />
        </svg>
      )
    case "dark":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M15.2 4.2a8.2 8.2 0 1 0 4.8 11.4A6.8 6.8 0 0 1 15.2 4.2z" {...line} />
        </svg>
      )
    case "physical":
      return (
        <svg viewBox="0 0 24 24">
          <path
            d="M18.8 4.2l1 1-9.2 9.2-2-2z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M6.4 14.2l3.4 3.4M4.8 19.2l3-3" {...line} />
        </svg>
      )
  }
}
