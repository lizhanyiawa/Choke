import type { MapDef, MapNode } from "@choke/shared/expedition/content"

/** 水平展开 2.5D 立体圆台步距与岔路间距 */
export const COL_STEP = 196
export const LANE_STEP = 132

export interface Placed {
  id: string
  node: MapNode
  /** 第几步（从 0 开始，可能是小数） */
  col: number
  /** 岔路上的哪一条：0 是中线，负数偏上，正数偏下 */
  lane: number
  x: number
  y: number
}

export interface MapLayout {
  nodes: Record<string, Placed>
  maxCol: number
  /** 谁能走到我 */
  preds: Record<string, string[]>
}

export function layoutMap(map: MapDef): MapLayout {
  const reachable: string[] = []
  const seen = new Set<string>()
  const queue = [map.start]
  const depth: Record<string, number> = { [map.start]: 0 }
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    if (!map.nodes[id]) continue
    reachable.push(id)
    for (const next of map.nodes[id].next) {
      if (!(next in depth)) depth[next] = depth[id]! + 1
      queue.push(next)
    }
  }

  const allPlaced = reachable.length > 0 && reachable.every((id) => map.nodes[id]?.pos)
  const coords: Record<string, [number, number]> = {}
  if (allPlaced) {
    for (const id of reachable) coords[id] = map.nodes[id]!.pos!
  } else {
    const byDepth = new Map<number, string[]>()
    for (const id of reachable) {
      const list = byDepth.get(depth[id]!) ?? []
      list.push(id)
      byDepth.set(depth[id]!, list)
    }
    for (const [d, ids] of byDepth) ids.forEach((id, i) => (coords[id] = [d, i - (ids.length - 1) / 2]))
  }

  const nodes: Record<string, Placed> = {}
  const preds: Record<string, string[]> = {}
  let maxCol = 0
  for (const id of reachable) {
    const [col, lane] = coords[id]!
    maxCol = Math.max(maxCol, col)
    nodes[id] = {
      id,
      node: map.nodes[id]!,
      col,
      lane,
      x: col * COL_STEP,
      y: lane * LANE_STEP,
    }
  }
  for (const id of reachable) {
    for (const next of map.nodes[id]!.next) if (nodes[next]) (preds[next] ??= []).push(id)
  }
  return { nodes, maxCol, preds }
}

/** 从 from 出发，沿着 edges 走，每个能到的格子要几步 */
export function distances(from: string, edges: (id: string) => readonly string[]): Record<string, number> {
  const dist: Record<string, number> = { [from]: 0 }
  const queue = [from]
  while (queue.length) {
    const id = queue.shift()!
    for (const next of edges(id)) {
      if (!(next in dist)) {
        dist[next] = dist[id]! + 1
        queue.push(next)
      }
    }
  }
  return dist
}

export type NodeVisibility = "past" | "current" | "next" | "horizon"

export interface FogNode {
  placed: Placed
  visibility: NodeVisibility
  /** 前方 1 步存在但受 requires.flag 阻断不可进入 */
  locked: boolean
}

export interface FogEdge {
  from: string
  to: string
  kind: "past" | "next" | "horizon"
  locked: boolean
}

export interface FogWindow {
  nodes: FogNode[]
  byId: Record<string, FogNode>
  edges: FogEdge[]
  /** 前方 2 步之后是否还有未知前路（用于绘制伸入迷雾的短尾迹） */
  hasBeyond: Set<string>
}

/**
 * 四层推进视野迷雾窗口：
 * - past: 身后 1 步（behind === 1）
 * - current: 当前格（step 0）
 * - next: 前方 1 步（ahead === 1），区分可走与条件未满足 locked
 * - horizon: 前方 2 步（ahead === 2），仅露类别轮廓、不可点击详情
 * 其余节点（behind > 1 / ahead >= 3 / 已错过的平行分支）完全不渲染，绝不剧透总长。
 */
export function computeFogWindow(
  layout: MapLayout,
  position: string,
  availableNext: readonly string[],
): FogWindow {
  const ahead = distances(position, (id) => layout.nodes[id]?.node.next ?? [])
  const behind = distances(position, (id) => layout.preds[id] ?? [])
  const openNext = new Set(availableNext)

  const byId: Record<string, FogNode> = {}
  const nodes: FogNode[] = []

  const add = (id: string, visibility: NodeVisibility, locked = false) => {
    const placed = layout.nodes[id]
    if (!placed || byId[id]) return
    const entry: FogNode = { placed, visibility, locked }
    byId[id] = entry
    nodes.push(entry)
  }

  for (const [id, d] of Object.entries(behind)) {
    if (d === 1) add(id, "past")
  }
  add(position, "current")
  for (const [id, d] of Object.entries(ahead)) {
    if (d === 1) add(id, "next", !openNext.has(id))
  }
  for (const [id, d] of Object.entries(ahead)) {
    if (d === 2) add(id, "horizon")
  }

  // 稳定绘制顺序：先远景/后方，后当前格，避免光柱与铭牌被其他节点遮挡
  const order: Record<NodeVisibility, number> = { past: 0, horizon: 1, next: 2, current: 3 }
  nodes.sort((a, b) => order[a.visibility] - order[b.visibility] || a.placed.y - b.placed.y || a.placed.x - b.placed.x)

  const edges: FogEdge[] = []
  const hasBeyond = new Set<string>()
  for (const entry of nodes) {
    const fromId = entry.placed.id
    for (const toId of entry.placed.node.next) {
      if (entry.visibility === "horizon") {
        if (layout.nodes[toId]) hasBeyond.add(fromId)
        continue
      }
      const target = byId[toId]
      if (!target) continue
      if (entry.visibility === "past" && target.visibility === "current") {
        edges.push({ from: fromId, to: toId, kind: "past", locked: false })
      } else if (entry.visibility === "current" && target.visibility === "next") {
        edges.push({ from: fromId, to: toId, kind: "next", locked: target.locked })
      } else if (entry.visibility === "next" && target.visibility === "horizon") {
        edges.push({ from: fromId, to: toId, kind: "horizon", locked: entry.locked })
      }
    }
  }

  return { nodes, byId, edges, hasBeyond }
}

/** 仅返回「已行进第 N 步」，绝不向 UI 暴露地图总步数。 */
export function stepCountOf(layout: MapLayout, position: string): number {
  const here = layout.nodes[position]
  return here ? Math.max(1, Math.round(here.col) + 1) : 1
}

export type NodeKind = "battle" | "danger" | "boss" | "story" | "event" | "rest" | "treasure" | "branch" | "empty"

/** 格子的颜色和图标类别：带威胁的战斗显示成「危险」 */
export function kindOf(node: MapNode): NodeKind {
  switch (node.type) {
    case "battle":
      return (node.threat ?? 0) > 0 ? "danger" : "battle"
    case "slot":
      return "battle"
    default:
      return node.type
  }
}

export const KIND_LABEL: Record<NodeKind, string> = {
  battle: "战斗",
  danger: "危险战斗",
  boss: "首领",
  story: "剧情",
  event: "事件",
  rest: "休整",
  treasure: "宝箱",
  branch: "岔路",
  empty: "空地",
}

export function titleOf(node: MapNode): string {
  return node.title ?? KIND_LABEL[kindOf(node)]
}
