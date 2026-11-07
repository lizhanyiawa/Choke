import { useId, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  JOB_COLOR,
  JOB_LABEL,
  RARITY_LABEL,
  battlePower,
  bpColor,
  formatNo,
  starStates,
} from "./data"
import type { CardFaceData, CardFaceMode, CardSkill, Element, Job, Rarity, StarState } from "./types"
import "./card-face.css"

const STAR_PATH =
  "M12 2.6l2.8 6 6.6.8-4.9 4.5 1.3 6.5-5.8-3.2-5.8 3.2 1.3-6.5-4.9-4.5 6.6-.8z"

interface Props {
  card: CardFaceData
  mode?: CardFaceMode
  className?: string
}

export function CardFace({ card, mode = "collection", className }: Props) {
  const rawId = useId().replace(/:/g, "")
  const prismId = `star-prism-${rawId}`

  const stars = starStates(card)
  const bp = battlePower(card)
  const skills: (CardSkill | null)[] = [0, 1, 2].map((i) => card.skills[i] ?? null)

  return (
    <div className={cn("cf", className)} data-rarity={card.rarity} data-mode={mode}>
      <div className="cf__body">
        <header className="cf__head">
          <span className="cf__badge" aria-hidden>
            <RarityGlyph rarity={card.rarity} />
          </span>
          <div className="cf__head-info">
            <div className="cf__rank-row">
              <span className="cf__rank-name">{RARITY_LABEL[card.rarity]}</span>
              <span className="cf__rule" aria-hidden />
              <span className="cf__lv">
                Lv <b>{card.level}</b>
              </span>
            </div>

            {card.profileUrl ? (
              <a
                className="cf__name"
                href={card.profileUrl}
                title={card.name}
                target="_blank"
                rel="noreferrer"
              >
                {card.name}
              </a>
            ) : (
              <h3 className="cf__name" title={card.name}>
                {card.name}
              </h3>
            )}

            <div className="cf__meta-row">
              <span className="cf__identity">
                {card.country && <span className="cf__country">{card.country}</span>}
                {card.globalRank != null && <span className="cf__grank">#{card.globalRank}</span>}
                {card.pp != null && (
                  <span className="cf__ppnum">
                    {Math.round(card.pp).toLocaleString("en-US")}pp
                  </span>
                )}
              </span>
              {card.mods.length > 0 && (
                <span className="cf__mods">
                  {card.mods.map((mod) => (
                    <span key={mod} className="cf__mod">
                      {mod}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        </header>

        <div className="cf__art">
          {card.banner && (
            <img
              className="cf__art-banner"
              src={card.banner}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
            />
          )}
          {card.art ? (
            <img
              className={card.banner ? "cf__art-avatar" : "cf__art-img"}
              src={card.art}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
            />
          ) : (
            !card.banner && <CardArt seed={card.id} color={JOB_COLOR[card.job]} />
          )}
          <div className="cf__art-vignette" aria-hidden />
          <div className="cf__stars" aria-label={`命座 ${card.constellation}`}>
            {stars.map((state, i) => (
              <Star key={i} state={state} gid={prismId} />
            ))}
            <span className="cf__stars-count">{card.constellation}/6</span>
          </div>
        </div>

        <div className="cf__skills">
          {skills.map((skill, i) =>
            skill ? (
              <div className="cf__skill" key={i}>
                <span
                  className="cf__el"
                  style={{ "--el": ELEMENT_COLOR[skill.element] } as CSSProperties}
                  title={ELEMENT_LABEL[skill.element]}
                >
                  <ElementGlyph element={skill.element} />
                </span>
                <span className="cf__el-sep" aria-hidden />
                <span className="cf__skill-name">{skill.name}</span>
                <span className="cf__cost">
                  {skill.passive ? (
                    <span className="cf__passive">被动</span>
                  ) : (
                    <span className="cf__ap">
                      <i>AP</i>
                      <b>{skill.ap}</b>
                      <em />
                    </span>
                  )}
                  {skill.mp !== undefined && (
                    <span className="cf__mp">
                      <i>MP</i>
                      <b>{skill.mp}</b>
                      <em />
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <div className="cf__skill cf__skill--empty" key={i} aria-hidden />
            )
          )}
        </div>

        <footer className="cf__foot">
          <span
            className="cf__job"
            style={{ "--job": JOB_COLOR[card.job] } as CSSProperties}
            title={JOB_LABEL[card.job]}
            aria-hidden
          >
            <JobGlyph job={card.job} />
          </span>
          <span className="cf__bp" style={{ "--bp": bpColor(bp) } as CSSProperties}>
            <i>BP</i>
            <b>{bp.toLocaleString("en-US")}</b>
          </span>
          <span className="cf__no">{formatNo(card.no, card.total)}</span>
        </footer>
      </div>

      <div className="cf__sheen" aria-hidden />

      <svg className="cf__defs" aria-hidden>
        <defs>
          <linearGradient id={prismId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A8E8C8" />
            <stop offset="48%" stopColor="#B6C9F2" />
            <stop offset="100%" stopColor="#EAB6DF" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

function Star({ state, gid }: { state: StarState; gid: string }) {
  return (
    <svg className={`cf__star cf__star--${state}`} viewBox="0 0 24 24" aria-hidden>
      <path d={STAR_PATH} {...(state === "prism" ? { fill: `url(#${gid})` } : null)} />
    </svg>
  )
}

function RarityGlyph({ rarity }: { rarity: Rarity }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const

  switch (rarity) {
    case "C":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="6" {...line} />
        </svg>
      )
    case "UC":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7" {...line} />
          <path d="M8 12h8" {...line} />
        </svg>
      )
    case "R":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 4l8 8-8 8-8-8z" {...line} />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
      )
    case "E":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 4.5l7 13h-14z" {...line} />
          <path d="M12 10l3.2 6h-6.4z" fill="currentColor" opacity="0.55" />
        </svg>
      )
    case "L":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3.8l2.5 5.2 5.7.7-4.2 4 1.1 5.7-5.1-2.8-5.1 2.8 1.1-5.7-4.2-4 5.7-.7z" {...line} />
        </svg>
      )
    case "Radiant":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3l1.9 5.9L20 12l-6.1 3.1L12 21l-1.9-5.9L4 12l6.1-3.1z" {...line} />
          <path d="M12 7.4l1 3.1 3.2 1.5-3.2 1.5L12 16.6l-1-3.1-3.2-1.5 3.2-1.5z" fill="currentColor" opacity="0.5" />
        </svg>
      )
    case "Prismatic":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" {...line} />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" opacity="0.6" />
        </svg>
      )
  }
}

function JobGlyph({ job }: { job: Job }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const

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
          <path d="M14.6 4l5.4 5.4-9.4 9.4-5.4-5.4z" {...line} />
          <path d="M5 19l2-2M8.2 15.8l2 2" {...line} />
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
  // 所有技能图标共用同一描边权重，避免「闪电偏细、月亮偏粗」的观感差
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
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
          <path d="M13 3L6 13.4h4.8L10.4 21 18 10.2h-4.8z" {...line} />
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
          <path d="M15 4.4a8 8 0 1 0 4.8 11.2A7 7 0 0 1 15 4.4z" {...line} />
        </svg>
      )
    case "physical":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M5 19l14-14 1 1L6 20z" {...line} />
          <path d="M8.6 15.4l2 2" {...line} />
        </svg>
      )
  }
}

/* ------------------------------------------------------------------
   占位立绘：osu! 判定圈 + 滑条，颜色取自职业
   ------------------------------------------------------------------ */
function CardArt({ seed, color }: { seed: string; color: string }) {
  const rawId = useId().replace(/:/g, "")
  const g = (name: string) => `${name}-${rawId}`

  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const cx = 40 + (h % 5) * 4
  const cy = 68 + ((h >> 3) % 4) * 4
  const num = (h % 9) + 1

  return (
    <svg className="cf__art-svg" viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id={g("glow")} cx="50%" cy="46%" r="58%">
          <stop offset="0%" stopColor={color} stopOpacity="0.7" />
          <stop offset="58%" stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g("slide")} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="58%" stopColor={color} stopOpacity="0.85" />
          <stop offset="100%" stopColor="#d9e6ef" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <rect width="100" height="150" fill="#151517" />
      <ellipse cx="50" cy="66" rx="62" ry="58" fill={`url(#${g("glow")})`} />

      <g stroke={color} fill="none" opacity="0.28">
        <circle cx={cx} cy={cy} r="30" strokeWidth="0.4" strokeDasharray="1.4 4" />
        <circle cx={cx} cy={cy} r="20" strokeWidth="0.7" />
        <circle cx={cx} cy={cy} r="44" strokeWidth="0.3" opacity="0.5" />
      </g>

      <g transform={`translate(${cx} ${cy})`}>
        <circle r="14" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.4" />
        <circle r="10" fill="none" stroke="#ffffff" strokeOpacity="0.26" strokeWidth="0.6" />
        <circle r="3.4" fill={color} fillOpacity="0.9" />
        <text
          x="0"
          y="3"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill="#ffffff"
          fillOpacity="0.92"
          fontFamily="JetBrains Mono Variable, monospace"
        >
          {num}
        </text>
      </g>

      <path
        d="M14 132 C 34 108, 56 116, 88 42"
        fill="none"
        stroke={`url(#${g("slide")})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="88" cy="42" r="3" fill="#e8f0f6" fillOpacity="0.8" />
      <circle cx="14" cy="132" r="2.2" fill="#ffffff" fillOpacity="0.45" />

      <g fill="#ffffff" opacity="0.35">
        <circle cx="82" cy="118" r="0.9" />
        <circle cx="70" cy="20" r="0.8" />
        <circle cx="16" cy="30" r="0.7" />
      </g>

      <rect y="136" width="100" height="14" fill="#0c0c0e" opacity="0.62" />
    </svg>
  )
}
