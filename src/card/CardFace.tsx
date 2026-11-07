import { useId, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  JOB_COLOR,
  JOB_LABEL,
  MOD_COLOR,
  RARITY_LABEL,
  battlePower,
  bpColor,
  flagUrl,
  formatNo,
  nameSizeOf,
  starStates,
} from "./data"
import type { CardFaceData, CardFaceMode, CardSkill, Element, Job, Rarity, StarState } from "./types"
import "./card-face.css"

const STAR_PATH =
  "M12 2.2l2.9 5.9 6.5.92-4.7 4.56 1.12 6.46L12 17.02l-5.82 3.02 1.12-6.46L2.6 9.02l6.5-.92z"

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
        <div className="cf__frame">
          {/* 统一异形骨架 SVG（92 × 142 等比 cqw 坐标系，无拉伸变形） */}
          <svg className="cf__frame-svg" viewBox="0 0 92 142" aria-hidden>
            {/* 1. 顶部左上异形深色分块 */}
            <path
              d="M 0 25.5 L 0 3.6 A 3.6 3.6 0 0 1 3.6 0 L 67.5 0 C 64.2 0 63.4 6.2 59.8 6.2 L 22 6.2 L 8.5 16.5 L 0 25.5 Z"
              fill="var(--panel)"
            />

            {/* 2. 底部左下异形深色分块（含品牌凹槽左侧平滑斜肩） */}
            <path
              d="M 0 124.2 L 53.6 124.2 A 3.6 3.6 0 0 1 57.2 127.8 L 57.2 134.2 A 3.4 3.4 0 0 1 53.8 137.6 L 23.6 137.6 C 20.4 137.6 20.0 142 16.8 142 L 3.6 142 A 3.6 3.6 0 0 1 0 138.4 Z"
              fill="var(--panel)"
            />

            {/* 3. 连续外围内框线（在底部品牌缺口 x=16.8..75.2 处对称断开） */}
            <path
              d="M 16.8 141.72 L 3.6 141.72 A 3.32 3.32 0 0 1 0.28 138.4 L 0.28 3.6 A 3.32 3.32 0 0 1 3.6 0.28 L 88.4 0.28 A 3.32 3.32 0 0 1 91.72 3.6 L 91.72 138.4 A 3.32 3.32 0 0 1 88.4 141.72 L 75.2 141.72"
              fill="none"
              stroke="var(--panel)"
              strokeWidth="0.56"
              strokeLinecap="round"
            />
          </svg>

          <header className="cf__head">
            <span className="cf__rank-name">{RARITY_LABEL[card.rarity]}</span>

            <span className="cf__lv">
              <i>Lv.</i>
              <b>{card.level}</b>
            </span>

            <span className="cf__badge" aria-hidden>
              <RarityGlyph rarity={card.rarity} uid={rawId} />
            </span>

            <div className="cf__head-info">
              <div className="cf__name-card">
                {card.profileUrl ? (
                  <a
                    className="cf__name"
                    href={card.profileUrl}
                    title={card.name}
                    target="_blank"
                    rel="noreferrer"
                    style={{ "--name-size": `${nameSizeOf(card.name)}cqw` } as CSSProperties}
                  >
                    {card.name}
                  </a>
                ) : (
                  <h3
                    className="cf__name"
                    title={card.name}
                    style={{ "--name-size": `${nameSizeOf(card.name)}cqw` } as CSSProperties}
                  >
                    {card.name}
                  </h3>
                )}

                <div className="cf__meta-row">
                  <span className="cf__identity">
                    {card.country && (
                      <span className="cf__country">
                        {flagUrl(card.country) && (
                          <img
                            className="cf__flag"
                            src={flagUrl(card.country)!}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        {card.country}
                      </span>
                    )}
                    {card.globalRank != null && (
                      <span className="cf__grank">#{card.globalRank}</span>
                    )}
                    {card.pp != null && (
                      <span className="cf__ppnum">
                        {Math.round(card.pp).toLocaleString("en-US")}pp
                      </span>
                    )}
                  </span>
                </div>

                <div className="cf__sub-row">
                  {/*
                    [预留槽位 - 头部左下]
                    位置：玩家身份行（国家/排名/pp）正下方左侧，与右侧 MOD 标签同行。
                    用途：后续可在此放置玩家头衔、赛区徽章、或附加词条图标。
                    容器类名建议：.cf__head-slot（已在 card-face.css 预留 flex 占位）
                  */}
                  <span className="cf__head-slot" aria-hidden />

                  {card.mods.length > 0 && (
                    <span className="cf__mods">
                      {card.mods.slice(0, 3).map((mod) => (
                        <span
                          key={mod}
                          className="cf__mod"
                          style={{ "--mod": MOD_COLOR[mod] } as CSSProperties}
                        >
                          {mod}
                        </span>
                      ))}
                      {card.mods.length > 3 && (
                        <span className="cf__mod cf__mod--more">+{card.mods.length - 3}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </header>

          <div className="cf__art">
            {/*
              [立绘层结构说明]
              1. 背景层 (.cf__art-banner)：渲染玩家的个人主页横幅 card.banner（铺满立绘窗）
              2. 中央层 (.cf__art-avatar)：渲染玩家的头像 card.art（居中于立绘窗正中央）
              3. 若无数据进行预览，底色保持纯净暗色，不渲染任何音符/判定圈占位符
            */}
            <div className="cf__art-screen">
              {card.banner ? (
                <img
                  className="cf__art-banner"
                  src={card.banner}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  referrerPolicy="no-referrer"
                />
              ) : (
                card.art && (
                  <img
                    className="cf__art-blur"
                    src={card.art}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    referrerPolicy="no-referrer"
                  />
                )
              )}
              {card.art && (
                <img
                  className="cf__art-avatar"
                  src={card.art}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="cf__art-vignette" aria-hidden />
            </div>

            {/*
              一体化插画内框与底部梯形命座凹槽 SVG（88.4 × 50 等比坐标系）：
              用单条连续闭合路径同时绘制四周金线与底部梯形台阶，彻底消除不同缩放尺寸下的拼接凸出问题
            */}
            <svg
              className="cf__art-frame"
              viewBox="0 0 88.4 50"
              preserveAspectRatio="none"
              aria-hidden
            >
              {/* 外围深色遮罩（含底部抬起的梯形命座台） */}
              <path
                fillRule="evenodd"
                d="M 0 0 H 88.4 V 50 H 0 Z M 3.0 1.5 H 85.4 A 1.5 1.5 0 0 1 86.9 3.0 V 45.8 A 1.5 1.5 0 0 1 85.4 47.3 H 69.2 Q 67.2 47.3 66.0 45.8 L 63.2 42.2 Q 62.0 40.8 59.8 40.8 H 28.6 Q 26.4 40.8 25.2 42.2 L 22.4 45.8 Q 21.2 47.3 19.2 47.3 H 3.0 A 1.5 1.5 0 0 1 1.5 45.8 V 3.0 A 1.5 1.5 0 0 1 3.0 1.5 Z"
                fill="var(--panel)"
              />
              {/* 单根连续闭合描边：四周框线 + 底部梯形台阶一次成型 */}
              <path
                d="M 3.0 1.5 H 85.4 A 1.5 1.5 0 0 1 86.9 3.0 V 45.8 A 1.5 1.5 0 0 1 85.4 47.3 H 69.2 Q 67.2 47.3 66.0 45.8 L 63.2 42.2 Q 62.0 40.8 59.8 40.8 H 28.6 Q 26.4 40.8 25.2 42.2 L 22.4 45.8 Q 21.2 47.3 19.2 47.3 H 3.0 A 1.5 1.5 0 0 1 1.5 45.8 V 3.0 A 1.5 1.5 0 0 1 3.0 1.5 Z"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="0.52"
                strokeLinejoin="round"
              />
            </svg>

            <div className="cf__stars-strip">
              <div className="cf__stars" aria-label={`命座 ${card.constellation}`}>
                {stars.map((state, i) => (
                  <Star key={i} state={state} gid={prismId} />
                ))}
              </div>
            </div>
          </div>

          <div className="cf__skills">
            {skills.map((skill, i) =>
              skill ? (
                <div
                  className={cn("cf__skill", skill.mp !== undefined && "cf__skill--mp")}
                  key={i}
                >
                  <div className="cf__skill-track">
                    <div className="cf__skill-body">
                      <span
                        className="cf__el"
                        style={{ "--el": ELEMENT_COLOR[skill.element] } as CSSProperties}
                        title={ELEMENT_LABEL[skill.element]}
                      >
                        <ElementGlyph element={skill.element} />
                      </span>
                      <span className="cf__el-sep" aria-hidden />
                      <span className="cf__skill-name">{skill.name}</span>
                    </div>
                    <span className="cf__cost">
                      {skill.passive ? (
                        <span className="cf__passive">PAS</span>
                      ) : (
                        <span className="cf__ap">
                          <i>AP</i>
                          <b>{skill.ap}</b>
                          <svg className="cf__ap-gem" viewBox="0 0 14 20" aria-hidden>
                            <path d="M7 0.8L13.2 10L7 19.2L0.8 10Z" fill="currentColor" />
                          </svg>
                        </span>
                      )}
                      {skill.mp !== undefined && (
                        <span className="cf__mp">
                          <i>MP</i>
                          <b>{skill.mp}</b>
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="cf__skill cf__skill--empty" key={i} aria-hidden>
                  <div className="cf__skill-track">
                    <div className="cf__skill-body" />
                  </div>
                </div>
              )
            )}
          </div>

          <footer className="cf__foot">
            <div className="cf__foot-main">
              <span
                className="cf__job"
                style={{ "--job": JOB_COLOR[card.job] } as CSSProperties}
                title={JOB_LABEL[card.job]}
                aria-hidden
              >
                <JobGlyph job={card.job} />
              </span>
              <span className="cf__foot-sep" aria-hidden />
              <span className="cf__bp" style={{ "--bp": bpColor(bp) } as CSSProperties}>
                <i>BP:</i>
                <b>{bp.toLocaleString("en-US")}</b>
              </span>
              {/*
                [预留槽位 - 底部深色块 BP 右侧]
                位置：左下深色异形块内，紧跟 BP 数值右侧（原三枚小图标位置）。
                用途：后续可在此放置赛季标记、流派小图标或战力增幅徽章。
                容器类名建议：.cf__foot-slot
              */}
            </div>

            <span className="cf__no">ID: {formatNo(card.no, card.total).replace("/", " / ")}</span>

            <span className="cf__brand" aria-hidden>
              Choke! Trading Card Series 2026
            </span>
          </footer>
        </div>
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

function RarityGlyph({ rarity, uid }: { rarity: Rarity; uid: string }) {
  const ringGrad = `ring-${uid}`
  const starLight = `slight-${uid}`
  const starDark = `sdark-${uid}`

  return (
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient id={ringGrad} x1="0.15" y1="0.08" x2="0.85" y2="0.92">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--accent) 60%, #fff9e2)" />
          <stop offset="50%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="color-mix(in srgb, var(--accent) 52%, #1d1508)" />
        </linearGradient>
        <linearGradient id={starLight} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--accent) 42%, #fffdf0)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
        <linearGradient id={starDark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--accent) 78%, #281c08)" />
          <stop offset="100%" stopColor="color-mix(in srgb, var(--accent) 44%, #140e04)" />
        </linearGradient>
      </defs>

      {/* 外黑边 + 宽金属环 + 深色内底盘 + 内细金圈 */}
      <circle cx="50" cy="50" r="49" fill="#0d0c14" />
      <circle cx="50" cy="50" r="46" fill={`url(#${ringGrad})`} stroke="#14121d" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="35.5" fill="#0d0c15" stroke="#14121d" strokeWidth="1.8" />
      <circle
        cx="50"
        cy="50"
        r="31.5"
        fill="none"
        stroke={`url(#${ringGrad})`}
        strokeWidth="1.5"
        opacity="0.88"
      />

      {/* C：同心圆环 */}
      {rarity === "C" && (
        <g>
          <circle
            cx="50"
            cy="50"
            r="17"
            fill="none"
            stroke={`url(#${starLight})`}
            strokeWidth="5.5"
          />
          <circle cx="50" cy="50" r="6" fill={`url(#${starLight})`} />
        </g>
      )}

      {/* UC（原 Epic 图标）：3D 棱面三角徽记 */}
      {rarity === "UC" && (
        <g>
          <polygon points="50,9 14,74 50,53" fill={`url(#${starLight})`} />
          <polygon points="50,9 86,74 50,53" fill={`url(#${starDark})`} />
          <polygon points="14,74 86,74 50,53" fill={`url(#${starDark})`} opacity="0.85" />
          <polygon
            points="50,9 86,74 14,74"
            fill="none"
            stroke="#14121d"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <polygon points="50,27 67,63 33,63" fill="#0e0d18" opacity="0.48" />
        </g>
      )}

      {/* R（原 Uncommon 图标）：3D 切面四方宝石菱形 */}
      {rarity === "R" && (
        <g>
          <polygon points="50,10 18,50 50,50" fill={`url(#${starLight})`} />
          <polygon points="50,10 82,50 50,50" fill={`url(#${starDark})`} />
          <polygon points="50,90 82,50 50,50" fill={`url(#${starLight})`} />
          <polygon points="50,90 18,50 50,50" fill={`url(#${starDark})`} />
          <line x1="50" y1="10" x2="50" y2="90" stroke="#14121d" strokeWidth="0.9" opacity="0.45" />
          <line x1="18" y1="50" x2="82" y2="50" stroke="#14121d" strokeWidth="0.9" opacity="0.45" />
          <polygon
            points="50,10 82,50 50,90 18,50"
            fill="none"
            stroke="#14121d"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* E（原 Rare 图标）：3D 切面四角星芒 */}
      {rarity === "E" && (
        <g>
          {[0, 90, 180, 270].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 50 50)`}>
              <polygon points="50,6 50,50 37,37" fill={`url(#${starLight})`} />
              <polygon points="50,6 63,37 50,50" fill={`url(#${starDark})`} />
              <line x1="50" y1="50" x2="50" y2="6" stroke="#14121d" strokeWidth="0.7" opacity="0.4" />
            </g>
          ))}
          <polygon
            points="50,6 63,37 94,50 63,63 50,94 37,63 6,50 37,37"
            fill="none"
            stroke="#14121d"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </g>
      )}

      {(rarity === "L" || rarity === "Radiant" || rarity === "Prismatic") && (
        <g>
          {/* 3D 切面大五角星（尖角压上外环，带中心棱线） */}
          {[0, 72, 144, 216, 288].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 50 50)`}>
              <polygon points="50,2.5 50,50 38.8,34.6" fill={`url(#${starLight})`} />
              <polygon points="50,2.5 61.2,34.6 50,50" fill={`url(#${starDark})`} />
              <line
                x1="50"
                y1="50"
                x2="50"
                y2="2.5"
                stroke="#14121d"
                strokeWidth="0.7"
                opacity="0.45"
              />
              <line
                x1="50"
                y1="50"
                x2="38.8"
                y2="34.6"
                stroke="#14121d"
                strokeWidth="0.6"
                opacity="0.35"
              />
            </g>
          ))}
          <polygon
            points="50,2.5 61.2,34.6 95.2,35.3 68.1,55.9 77.9,88.4 50,69 22.1,88.4 31.9,55.9 4.8,35.3 38.8,34.6"
            fill="none"
            stroke="#14121d"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  )
}

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
