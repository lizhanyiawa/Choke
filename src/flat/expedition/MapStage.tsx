import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { ExpeditionNodePreview } from "@choke/shared/expedition/view"

import {
  KIND_LABEL,
  computeFogWindow,
  kindOf,
  titleOf,
  type FogNode,
  type MapLayout,
  type NodeKind,
} from "./layout"
import { KindBadge, NodeEffects, NodeIcon } from "./NodeIcon"

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value))
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text
}

/** 2.5D 立体圆台侧壁路径：沿底椭圆弧挤出厚度 depth */
function wallPath(rx: number, ry: number, depth: number): string {
  return `M ${-rx} 0 L ${-rx} ${depth} A ${rx} ${ry} 0 0 0 ${rx} ${depth} L ${rx} 0 A ${rx} ${ry} 0 0 1 ${-rx} 0 Z`
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

interface PedestalGeometry {
  rx: number
  ry: number
  depth: number
  lift: number
  doubleTier: boolean
}

function geometryOf(entry: FogNode, kind: NodeKind): PedestalGeometry {
  if (kind === "boss" && (entry.visibility === "current" || entry.visibility === "next" || entry.visibility === "horizon")) {
    return {
      rx: entry.visibility === "horizon" ? 36 : 40,
      ry: entry.visibility === "horizon" ? 18 : 20,
      depth: entry.visibility === "horizon" ? 10 : 14,
      lift: entry.visibility === "current" ? -6 : 0,
      doubleTier: true,
    }
  }
  if (kind === "empty") {
    return {
      rx: entry.visibility === "current" ? 28 : 18,
      ry: entry.visibility === "current" ? 15 : 10,
      depth: entry.visibility === "current" ? 11 : 7,
      lift: entry.visibility === "current" ? -4 : 0,
      doubleTier: false,
    }
  }
  switch (entry.visibility) {
    case "current":
      return { rx: 46, ry: 24, depth: 18, lift: -6, doubleTier: false }
    case "next":
      return { rx: 40, ry: 21, depth: 15, lift: 0, doubleTier: false }
    case "past":
    case "horizon":
      return { rx: 32, ry: 17, depth: 11, lift: 0, doubleTier: false }
  }
}

/**
 * 水平展开 2.5D 立体圆台推进地图：
 * - 锁定自动跟拍镜头：当前格固定在画布 (33%, 50%)，无缩放、无拖拽、无全图剧透；
 * - 四层视野迷雾：身后 1 步 / 当前格 / 前方 1 步明牌 / 前方 2 步仅类别轮廓，其余隐入右侧迷雾；
 * - 前方 2 步 (horizon) 不可点击详情，防止剧透剧情/事件/敌情。
 */
export function MapStage({
  layout,
  position,
  availableNext,
  pickable,
  selected,
  previews,
  onSelect,
}: {
  layout: MapLayout
  position: string
  /** 服务端给出的可通行下一步（用于区分前方 1 步是否受 flag 锁定） */
  availableNext: readonly string[]
  /** 当前格已完成后真正可立即前往的下一步 */
  pickable: readonly string[]
  selected: string
  previews: Record<string, ExpeditionNodePreview>
  onSelect: (id: string) => void
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "-")
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 760, h: 390 })
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const element = stageRef.current
    if (!element) return
    const measure = () => {
      const next = { w: element.clientWidth || 760, h: element.clientHeight || 390 }
      setSize((current) => (current.w === next.w && current.h === next.h ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  const here = layout.nodes[position]
  const fog = useMemo(
    () => computeFogWindow(layout, position, availableNext),
    [availableNext, layout, position],
  )
  const pickSet = useMemo(() => new Set(pickable), [pickable])

  if (!here) return <div className="xp-stage" ref={stageRef} />

  const scale = clamp(0.68, 1.08, Math.min(size.w / 760, size.h / 370))
  const anchorX = size.w < 540 ? size.w * 0.28 : size.w * 0.33
  const anchorY = size.h * 0.5
  const tx = anchorX - here.x * scale
  const ty = anchorY - here.y * scale
  const worldTransform = `translate(${tx}px, ${ty}px) scale(${scale})`

  const selectedIsNext = fog.byId[selected]?.visibility === "next"
  const hasAnyFogAhead = fog.nodes.some((entry) => entry.visibility === "horizon") || fog.hasBeyond.size > 0
  const beamId = `${uid}-beam`
  const bossBeamId = `${uid}-boss-beam`
  const beamFadeId = `${uid}-beam-fade`
  const beamMaskId = `${uid}-beam-mask`
  /** 提灯光晕中心：跟着当前圆台所在列走(33% 或窄屏 28%) */
  const lanternX = `${Math.round((anchorX / Math.max(1, size.w)) * 100)}%`

  return (
    <div className="xp-stage" ref={stageRef} data-animate={animate} style={{ "--xp-lantern-x": lanternX } as CSSProperties}>
      {/* 提灯光晕与左右迷雾：用 CSS 层而不是 SVG 整幅渐变，
          整幅 SVG 渐变在悬停重绘时会被逐块重新栅格化（窗口透明/带模糊时表现为闪屏） */}
      <div className="xp-atmosphere" aria-hidden />
      <svg
        className="xp-svgmap"
        viewBox={`0 0 ${size.w} ${size.h}`}
        role="group"
        aria-label="远征 2.5D 推进地图（仅显示周围视野）"
      >
        <defs>
          <linearGradient id={beamId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" className="xp-svg-beam-0" />
            <stop offset="55%" className="xp-svg-beam-1" />
            <stop offset="100%" className="xp-svg-beam-2" />
          </linearGradient>
          <linearGradient id={bossBeamId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" className="xp-svg-boss-0" />
            <stop offset="100%" className="xp-svg-boss-1" />
          </linearGradient>
          {/* 光柱左右两侧羽化：硬边矩形在深色底上会露出明显的方块 */}
          <linearGradient id={beamFadeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000" stopOpacity="0" />
            <stop offset="26%" stopColor="#000" stopOpacity="1" />
            <stop offset="74%" stopColor="#000" stopOpacity="1" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </linearGradient>
          <mask id={beamMaskId}>
            <rect x="0" y="0" width="1" height="1" fill={`url(#${beamFadeId})`} />
          </mask>
        </defs>

        <g className="xp-world" style={{ transform: worldTransform }}>
          {/* 连线层 */}
          <g className="xp-roads">
            {fog.edges.map((edge) => {
              const from = layout.nodes[edge.from]!
              const to = layout.nodes[edge.to]!
              const isChosen = edge.kind === "next" && selected === edge.to
              const isMuted = edge.kind === "next" && selectedIsNext && selected !== edge.to
              const d = bezierPath(from.x, from.y, to.x, to.y)
              const cls = [
                "xp-road",
                `xp-road--${edge.kind}`,
                isChosen ? "is-sel" : "",
                isMuted ? "is-muted" : "",
                edge.locked ? "is-locked" : "",
              ]
                .filter(Boolean)
                .join(" ")
              return (
                <g key={`${edge.from}>${edge.to}`}>
                  {isChosen && <path className="xp-road__glow" d={d} />}
                  <path className={cls} d={d} />
                </g>
              )
            })}
            {/* 前方 2 步右侧延伸进入未知迷雾的短尾迹 */}
            {Array.from(fog.hasBeyond).map((fromId) => {
              const from = layout.nodes[fromId]!
              return (
                <path
                  key={`beyond:${fromId}`}
                  className="xp-road xp-road--beyond"
                  d={`M ${from.x + 28} ${from.y} L ${from.x + 112} ${from.y}`}
                />
              )
            })}
          </g>

          {/* 2.5D 圆台层 */}
          <g className="xp-nodes">
            {fog.nodes.map((entry, index) => {
              const { placed, visibility, locked } = entry
              const kind = kindOf(placed.node)
              const geom = geometryOf(entry, kind)
              const clipId = `${uid}-clip-${index}`
              const preview = previews[placed.id]
              const canMove = pickSet.has(placed.id)
              const clickable = visibility !== "horizon"
              const isSelected = selected === placed.id
              const isDimmedBranch = visibility === "next" && selectedIsNext && !isSelected

              const displayName =
                preview?.encounter && preview.title === KIND_LABEL[kind]
                  ? preview.encounter.name
                  : preview?.title ?? titleOf(placed.node)
              const hintText = preview?.hint ?? (locked ? "条件未满足" : undefined)
              const threatDelta = preview?.threat ?? placed.node.threat ?? 0

              const className = [
                "xp-node",
                `xp-k-${kind}`,
                `xp-vis-${visibility}`,
                isSelected ? "is-sel" : "",
                canMove ? "is-pick" : "",
                locked ? "is-locked" : "",
                isDimmedBranch ? "is-dimmed" : "",
              ]
                .filter(Boolean)
                .join(" ")

              const ariaLabel =
                visibility === "horizon"
                  ? `前方两步，${KIND_LABEL[kind]}轮廓`
                  : `${displayName}，${KIND_LABEL[kind]}${
                      visibility === "current"
                        ? "，当前位置"
                        : visibility === "past"
                          ? "，已通过"
                          : locked
                            ? "，条件未满足"
                            : canMove
                              ? "，可前往"
                              : "，前方路线"
                    }`

              return (
                <g
                  key={placed.id}
                  className={className}
                  transform={`translate(${placed.x} ${placed.y})`}
                  onClick={
                    clickable
                      ? (event) => {
                          event.stopPropagation()
                          onSelect(placed.id)
                        }
                      : undefined
                  }
                  role={clickable ? "button" : "presentation"}
                  tabIndex={clickable ? 0 : -1}
                  aria-label={ariaLabel}
                  aria-pressed={clickable ? isSelected : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            onSelect(placed.id)
                          }
                        }
                      : undefined
                  }
                >
                  {/* 地面投影 */}
                  <ellipse
                    className="xp-pedestal__shadow"
                    cx="0"
                    cy={geom.depth + 8}
                    rx={geom.doubleTier ? geom.rx + 14 : geom.rx + 6}
                    ry={geom.doubleTier ? geom.ry + 6 : geom.ry + 3}
                  />

                  <g transform={geom.lift ? `translate(0 ${geom.lift})` : undefined}>
                    {/* 当前格垂直光柱 / Boss 金色光柱 */}
                    {visibility === "current" && (
                      <rect
                        className="xp-pedestal__beam"
                        x={-geom.rx * 0.82}
                        y={-124}
                        width={geom.rx * 1.64}
                        height={124}
                        fill={`url(#${kind === "boss" ? bossBeamId : beamId})`}
                        mask={`url(#${beamMaskId})`}
                        pointerEvents="none"
                      />
                    )}
                    {kind === "boss" && visibility !== "current" && (
                      <rect
                        className="xp-pedestal__beam"
                        x={-geom.rx * 0.8}
                        y={-76}
                        width={geom.rx * 1.6}
                        height={76}
                        fill={`url(#${bossBeamId})`}
                        mask={`url(#${beamMaskId})`}
                        pointerEvents="none"
                      />
                    )}

                    {/* 选中/悬停贴地虚线环：位于圆台底平面（cy = depth），左右及前弧自然绕出底边，后弧被圆台遮挡 */}
                    {visibility === "next" && (
                      <ellipse
                        className="xp-pedestal__ring"
                        cx="0"
                        cy={geom.doubleTier ? geom.depth + 8 : geom.depth}
                        rx={(geom.doubleTier ? geom.rx + 12 : geom.rx) + 7}
                        ry={(geom.doubleTier ? geom.ry + 5 : geom.ry) + 4}
                      />
                    )}

                    {/* Boss 双层阶梯底层 */}
                    {geom.doubleTier && (
                      <g transform="translate(0 7)">
                        <path className="xp-pedestal__wall xp-pedestal__wall--base" d={wallPath(geom.rx + 10, geom.ry + 5, 11)} />
                        <ellipse className="xp-pedestal__top xp-pedestal__top--base" cx="0" cy="0" rx={geom.rx + 10} ry={geom.ry + 5} />
                      </g>
                    )}

                    {/* 主圆台侧壁 + 顶面 */}
                    <path className="xp-pedestal__wall" d={wallPath(geom.rx, geom.ry, geom.depth)} />
                    <ellipse className="xp-pedestal__top" cx="0" cy="0" rx={geom.rx} ry={geom.ry} />

                    {/* 顶面双刻环（当前格） */}
                    {visibility === "current" && (
                      <ellipse className="xp-pedestal__inner-ring" cx="0" cy="0" rx={geom.rx * 0.7} ry={geom.ry * 0.68} />
                    )}

                    {/* 节点类型动效 */}
                    <clipPath id={clipId}>
                      <ellipse cx="0" cy="0" rx={geom.rx} ry={geom.ry} />
                    </clipPath>
                    {visibility !== "past" && <NodeEffects kind={kind} clipId={clipId} rx={geom.rx} ry={geom.ry} />}

                    {/* 台面中心图标 */}
                    {visibility === "past" ? (
                      <text className="xp-pedestal__check" x="0" y="5" textAnchor="middle">
                        ✓
                      </text>
                    ) : visibility === "current" ? (
                      <>
                        <g className="xp-node__icon" transform="scale(0.86 0.64)">
                          <NodeIcon kind={kind} />
                        </g>
                        {/* 悬浮圆形光核信标：位于台面图标正上方留足间距 */}
                        <g className="xp-beacon" transform="translate(0 -40)">
                          <circle className="xp-beacon__halo" cx="0" cy="0" r="15" />
                          <circle className="xp-beacon__outer" cx="0" cy="0" r="10" />
                          <circle className="xp-beacon__core" cx="0" cy="0" r="4.2" />
                        </g>
                      </>
                    ) : visibility === "next" ? (
                      <>
                        {/* 上方竖立圆形徽章 */}
                        <g className="xp-crest" transform="translate(0 -28)">
                          <circle className="xp-crest__bg" cx="0" cy="0" r="14" />
                          <g className="xp-node__icon" transform="scale(0.76)">
                            <NodeIcon kind={kind} />
                          </g>
                        </g>
                        {threatDelta !== 0 && (
                          <g
                            className={`xp-threat-tag ${threatDelta > 0 ? "is-warn" : "is-good"}`}
                            transform={`translate(${geom.rx - 4} -44)`}
                          >
                            <rect x="-24" y="-9" width="48" height="18" rx="9" />
                            <text x="0" y="3.5" textAnchor="middle">
                              威胁 {threatDelta > 0 ? `+${threatDelta}` : threatDelta}
                            </text>
                          </g>
                        )}
                      </>
                    ) : (
                      /* horizon (+2): 仅显示柔和类别图标 */
                      <g className="xp-node__icon xp-node__icon--horizon" transform="scale(0.78 0.58)">
                        <NodeIcon kind={kind} />
                      </g>
                    )}
                  </g>

                  {/* 底部标签区 */}
                  {visibility === "current" && (
                    <g className="xp-label xp-label--current" transform={`translate(0 ${geom.depth + 25})`}>
                      <rect x="-54" y="-11" width="108" height="22" rx="11" />
                      <text x="0" y="3.5" textAnchor="middle">
                        当前 · {KIND_LABEL[kind]}
                      </text>
                    </g>
                  )}
                  {visibility === "next" && (
                    <g className="xp-label xp-label--next" transform={`translate(0 ${geom.depth + 22})`}>
                      <text className="xp-label__title" x="0" y="0" textAnchor="middle">
                        {truncate(displayName, 11)}
                      </text>
                      {hintText && (
                        <text className="xp-label__hint" x="0" y="15" textAnchor="middle">
                          {truncate(hintText, 13)}
                        </text>
                      )}
                    </g>
                  )}
                  {visibility === "horizon" && (
                    <g className="xp-label xp-label--horizon" transform={`translate(0 ${geom.depth + 20})`}>
                      <text x="0" y="0" textAnchor="middle">
                        {KIND_LABEL[kind]}
                      </text>
                    </g>
                  )}
                  {visibility === "past" && (
                    <g className="xp-label xp-label--past" transform={`translate(0 ${geom.depth + 20})`}>
                      <text x="0" y="0" textAnchor="middle">
                        {truncate(displayName, 9)}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      {hasAnyFogAhead && (
        <div
          className="xp-fog-copy"
          style={
            {
              "--xp-fog-x": `${size.w - Math.min(86, size.w * 0.11)}px`,
              "--xp-fog-y": `${size.h * 0.5}px`,
            } as CSSProperties
          }
          aria-hidden
        >
          <b>未知前路</b>
          <span>步步揭晓…</span>
        </div>
      )}

      <div className="xp-legend" aria-hidden>
        {(["battle", "event", "rest", "danger", "treasure", "boss"] as NodeKind[]).map((kind) => (
          <span key={kind}>
            <KindBadge kind={kind} />
            {KIND_LABEL[kind]}
          </span>
        ))}
      </div>
    </div>
  )
}
