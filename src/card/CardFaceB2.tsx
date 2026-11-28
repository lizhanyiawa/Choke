import { memo, useEffect, useMemo, useState, type ButtonHTMLAttributes, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

import { ElementGlyph, JobGlyph } from "./CardFace"
import { CardFoil } from "./CardFoil"
import { StaticCardArt } from "./StaticCardArt"
import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  JOB_LABEL,
  MOD_COLOR,
  RARITY_LABEL,
  battlePower,
  bpColor,
  flagUrl,
  isCustomBanner,
  nameSizeOf,
  starStates,
} from "./data"
import { trackCardLight } from "./light"
import { motifTriangles } from "./motif"
import type { CardFaceData } from "./types"
import "./card-face-b2.css"

/** MOD 的三种摆法：侧栏六边形 / 头像右上角 / 名字后面的胶囊 */
export type ModPlacement = "spine" | "portrait" | "name"

interface Props {
  card: CardFaceData
  tone?: "dark" | "light"
  mods?: ModPlacement
  version?: "v1" | "v2"
  className?: string
  eager?: boolean
  thumbnail?: boolean
  skillActions?: readonly ButtonHTMLAttributes<HTMLButtonElement>[]
}

/**
 * 卡面 B（侧栏版）。左边一条稀有度色竖栏，全部横排：稀有度图标、MOD，底部 Lv、命座；
 * 右边从上到下：banner（世界排名水印 + 本体卡徽章 + 稀有度牌）→ 头像压 banner 下沿
 * + 国旗排名 / pp / 大号 BP → 名字 → 技能 → 底标。类名前缀 cfb2（cb 已被开包卡背占用）。
 * 闪卡膜是和肖像版共用的 CardFoil，跟着光标反光。
 * 卡组候选缩略图不加载横幅动图，头像绘制为静态小图；卡册、详情和开包保留完整效果。
 */
export const CardFaceB2 = memo(function CardFaceB2({
  card,
  tone = "dark",
  mods: placement = "spine",
  version = "v2",
  className,
  eager = false,
  thumbnail = false,
  skillActions,
}: Props) {
  useEffect(trackCardLight, [])

  const [brokenBanner, setBrokenBanner] = useState<string | null>(null)
  const [brokenArt, setBrokenArt] = useState<string | null>(null)
  const [brokenFlag, setBrokenFlag] = useState<string | null>(null)

  const bp = battlePower(card)
  const rawFlag = flagUrl(card.country)
  const flag = rawFlag && brokenFlag !== rawFlag ? rawFlag : null

  const rawBanner = isCustomBanner(card.banner) ? card.banner : null
  const banner = rawBanner && brokenBanner !== rawBanner ? rawBanner : null
  const art = card.art && brokenArt !== card.art ? card.art : null

  const bpLabel = bp.toLocaleString("en-US")
  const bpDigits = bpLabel.replaceAll(",", "").length
  const bpFontSize = Math.max(6.5, 9.5 - Math.max(0, bpDigits - 4) * 1.1)
  const triangles = useMemo(() => thumbnail || banner ? null : motifTriangles(card.id), [banner, card.id, thumbnail])
  const loading = eager ? "eager" : "lazy"

  const modBlock = (where: ModPlacement) =>
    placement === where && card.mods.length > 0 ? (
      <div className="cfb2__mods" data-at={where}>
        {card.mods.map((mod) => (
          <span className="cfb2__mod" key={mod} style={{ "--mod": MOD_COLOR[mod] } as CSSProperties}>
            {mod}
          </span>
        ))}
      </div>
    ) : null

  return (
    <div
      className={cn("cfb2 card-face", className)}
      data-rarity={card.rarity}
      data-tone={tone}
      data-version={version}
      data-hero={card.isHero ? "true" : undefined}
      data-foil={card.foil ? "true" : undefined}
      // 镜像卡视觉等美术 PR；先留数据钩子，不做临时样式
      data-mirror={card.isMirror ? "true" : undefined}
      data-thumbnail={thumbnail || undefined}
      style={{ "--name-size": `${nameSizeOf(card.name) * (version === "v1" ? 1.05 : 1.22)}cqw` } as CSSProperties}
    >
      <div className="cfb2__frame" aria-hidden />

      <aside className="cfb2__spine">
        {/* 侧栏顶端：按稀有度区分形状的图标；英文全名在 banner 右上角 */}
        <i className="cfb2__emblem" title={RARITY_LABEL[card.rarity]} />
        {modBlock("spine")}
        <span className="cfb2__lv">
          <i>LV</i>
          <b>{card.level}</b>
        </span>
        <span className="cfb2__stars" aria-label={`命座 ${card.constellation}`}>
          {starStates(card).map((state, i) => (
            <i data-state={state} key={i} />
          ))}
        </span>
      </aside>

      <div className="cfb2__main">
        <div className="cfb2__banner">
          {banner && !thumbnail ? (
            <img
              src={banner}
              alt=""
              draggable={false}
              loading={loading}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setBrokenBanner(banner)}
            />
          ) : !thumbnail ? (
            <svg className="cfb2__motif" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid slice" aria-hidden>
              {triangles?.map((t, i) => (
                <path key={i} d={t.d} data-fill={t.filled ? "" : undefined} />
              ))}
            </svg>
          ) : null}
          {card.globalRank != null && (
            <b className="cfb2__watermark" aria-hidden>
              #{card.globalRank.toLocaleString("en-US")}
            </b>
          )}
          {card.isHero && (
            <span className="cfb2__hero-badge" title="本体卡">
              <i className="cfb2__hero-spark" aria-hidden />
              HERO
            </span>
          )}
          <span className="cfb2__tag">{RARITY_LABEL[card.rarity]}</span>
        </div>

        <div className="cfb2__id">
          <div className="cfb2__avatar">
            {art && thumbnail ? (
              <StaticCardArt src={art} eager={eager} onError={setBrokenArt} />
            ) : art ? (
              <img
                src={art}
                alt=""
                draggable={false}
                loading={loading}
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setBrokenArt(art)}
              />
            ) : (
              <span className="cfb2__avatar-fallback" aria-hidden>
                <JobGlyph job={card.job} />
              </span>
            )}
            {modBlock("portrait")}
          </div>
          <div className="cfb2__stats">
            <span className="cfb2__rank">
              {flag && (
                <img
                  src={flag}
                  alt={card.country}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setBrokenFlag(flag)}
                />
              )}
              {card.globalRank != null ? `#${card.globalRank.toLocaleString("en-US")}` : card.country}
            </span>
            {card.pp != null && (
              <span className="cfb2__pp">
                {Math.round(card.pp).toLocaleString("en-US")}
                <i>pp</i>
              </span>
            )}
            <span className="cfb2__bp" style={{ "--bp": bpColor(bp) } as CSSProperties}>
              <i>BP</i>
              <b style={{ "--bp-size": `${bpFontSize}cqw` } as CSSProperties}>{bpLabel}</b>
            </span>
          </div>
        </div>

        <div className="cfb2__title">
          <h3 className="cfb2__name" title={card.name}>
            {card.name}
          </h3>
          {modBlock("name")}
        </div>

        <div className="cfb2__skills">
          {card.skills.slice(0, 3).map((skill, i) => {
            const action = skillActions?.[i]
            const content = <>
              <span
                className="cfb2__el"
                style={{ "--el": ELEMENT_COLOR[skill.element] } as CSSProperties}
                title={ELEMENT_LABEL[skill.element]}
              >
                <ElementGlyph element={skill.element} />
              </span>
              <span className="cfb2__skill-name">{skill.name}</span>
              {skill.passive ? (
                <span className="cfb2__passive">被动</span>
              ) : (
                <span className="cfb2__ap" data-surcharged={skill.surcharged ? "true" : undefined}>
                  {skill.ap}
                </span>
              )}
            </>
            const props = { className: "cfb2__skill", "data-surcharged": skill.surcharged ? "true" : undefined }
            return action
              ? <button key={skill.id ?? i} {...props} {...action}>{content}</button>
              : <div key={skill.id ?? i} {...props}>{content}</div>
          })}
          {/* 不足三行补空槽，所有卡的技能区一样高 */}
          {Array.from({ length: 3 - Math.min(card.skills.length, 3) }, (_, i) => (
            <div className="cfb2__skill cfb2__skill--empty" key={`empty-${i}`} aria-hidden />
          ))}
        </div>

        <footer className="cfb2__foot">
          <span className="cfb2__job">
            <JobGlyph job={card.job} />
            {JOB_LABEL[card.job]}
          </span>
          {/* 图鉴、预览这类没有实例的卡不显示序号 */}
          {card.serial ? (
            <span className="cfb2__serial" title={`第 ${card.serial} 张 / 共抽出 ${card.pulled ?? card.serial} 张`}>
              #{card.serial}
              <i>/{Math.max(card.pulled ?? 0, card.serial)}</i>
            </span>
          ) : null}
        </footer>
      </div>

      {card.foil && (thumbnail ? <div className="card-foil card-foil--static" aria-hidden /> : <CardFoil seed={card.id} />)}
    </div>
  )
})