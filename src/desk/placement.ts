import { ITEM_INSET, ITEM_SIZE, newId, sizeOf } from "./store"
import type { CardData, DeskItem } from "./types"

interface Point {
  x: number
  y: number
}

interface Size {
  w: number
  h: number
}

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export type DeskPlacement = Omit<DeskItem, "x" | "y" | "z"> & { near: Point }

const ITEM_GAP = 14
const SPILL_SHAPE = [
  { x: -.84, y: .07, tilt: -14 },
  { x: .40, y: -.25, tilt: 12 },
  { x: -.32, y: .44, tilt: -8 },
  { x: .93, y: .19, tilt: 16 },
  { x: .06, y: -.08, tilt: -3 },
]
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const distance = (point: Point, near: Point) => (point.x - near.x) ** 2 + (point.y - near.y) ** 2

function limits(stage: Size, size: Size): Bounds {
  const right = Math.max(0, stage.w - size.w - ITEM_INSET)
  const bottom = Math.max(0, stage.h - size.h - ITEM_INSET)
  return { left: Math.min(ITEM_INSET, right), top: Math.min(ITEM_INSET, bottom), right, bottom }
}

export function stagePosition(item: DeskItem, width: number, height: number) {
  if (item.kind === "object") return { left: item.x * width, top: item.y * height }
  const bounds = limits({ w: width, h: height }, sizeOf(item))
  return {
    left: clamp(item.x * width, bounds.left, bounds.right),
    top: clamp(item.y * height, bounds.top, bounds.bottom),
  }
}

export function randomNear(point: Point, spreadX: number, spreadY: number): Point {
  return { x: point.x + (Math.random() * 2 - 1) * spreadX, y: point.y + (Math.random() * 2 - 1) * spreadY }
}

function occupiedBounds(existing: readonly DeskItem[], stage: Size) {
  return existing.filter((item) => !item.stowed).map((item) => {
    const { left, top } = stagePosition(item, stage.w, stage.h)
    const size = sizeOf(item)
    return { left, top, right: left + size.w, bottom: top + size.h }
  })
}

function coveredArea(x: number, y: number, size: Size, occupied: Bounds[]) {
  return occupied.reduce((area, rect) => area +
    Math.max(0, Math.min(x + size.w, rect.right) - Math.max(x, rect.left)) *
    Math.max(0, Math.min(y + size.h, rect.bottom) - Math.max(y, rect.top)), 0)
}

function findOpenPosition(near: Point, bounds: Bounds, size: Size, occupied: Bounds[], gap: number): Point | null {
  // Blocking intervals only change when a card passes an occupied top or bottom edge.
  const rows = new Set([near.y, bounds.top, bounds.bottom])
  for (const rect of occupied) {
    rows.add(rect.top - size.h - gap)
    rows.add(rect.bottom + gap)
  }

  let best: Point | null = null
  let bestDistance = Infinity
  for (const y of rows) {
    if (y < bounds.top || y > bounds.bottom) continue
    const blocked = occupied
      .filter((rect) => y < rect.bottom + gap && y + size.h + gap > rect.top)
      .map((rect) => ({ left: rect.left - size.w - gap, right: rect.right + gap }))
      .sort((a, b) => a.left - b.left)

    let left = bounds.left
    const consider = (right: number) => {
      if (left > right) return
      const point = { x: clamp(near.x, left, right), y }
      const offset = distance(point, near)
      if (offset < bestDistance) {
        best = point
        bestDistance = offset
      }
    }

    for (const interval of blocked) {
      consider(Math.min(bounds.right, interval.left))
      left = Math.max(left, interval.right)
      if (left > bounds.right) break
    }
    consider(bounds.right)
    if (bestDistance === 0) break
  }
  return best
}

function leastCoveredPosition(near: Point, bounds: Bounds, size: Size, occupied: Bounds[]) {
  const columns = [near.x, bounds.right]
  const rows = [near.y, bounds.bottom]
  for (let x = bounds.left; x < bounds.right; x += size.w / 3) columns.push(x)
  for (let y = bounds.top; y < bounds.bottom; y += size.h / 3) rows.push(y)

  let best = near
  let leastOverlap = Infinity
  for (const y of rows) {
    for (const x of columns) {
      const overlap = coveredArea(x, y, size, occupied)
      const point = { x, y }
      if (overlap < leastOverlap || (overlap === leastOverlap && distance(point, near) < distance(best, near))) {
        best = point
        leastOverlap = overlap
      }
    }
  }
  return best
}

export function placeDeskItems(
  placements: DeskPlacement[],
  existing: readonly DeskItem[],
  stage: Size,
  firstZ = existing.reduce((top, item) => Math.max(top, item.z), 0) + 1,
): DeskItem[] {
  const occupied = occupiedBounds(existing, stage)

  return placements.map(({ near, ...item }, index) => {
    const size = sizeOf(item)
    const bounds = limits(stage, size)
    const desired = {
      x: clamp(near.x - size.w / 2, bounds.left, bounds.right),
      y: clamp(near.y - size.h / 2, bounds.top, bounds.bottom),
    }
    const { x, y } = findOpenPosition(desired, bounds, size, occupied, ITEM_GAP)
      ?? findOpenPosition(desired, bounds, size, occupied, 0)
      ?? leastCoveredPosition(desired, bounds, size, occupied)

    occupied.push({ left: x, top: y, right: x + size.w, bottom: y + size.h })
    return { ...item, x: x / stage.w, y: y / stage.h, z: firstZ + index }
  })
}

function fitSpillAxis(offsets: number[], low: number, high: number, edgePadding: number) {
  const pad = Math.min(edgePadding, (high - low) / 6)
  const min = Math.min(...offsets)
  const max = Math.max(...offsets)
  const scale = max === min ? 1 : Math.min(1, (high - low - 2 * pad) / (max - min))
  return { scale, low: low + pad - min * scale, high: high - pad - max * scale }
}

export function scatterPackCards(
  cards: CardData[],
  pack: DeskItem,
  existing: readonly DeskItem[],
  stage: Size,
  firstZ: number,
): DeskItem[] {
  if (!cards.length) return []
  const size = ITEM_SIZE.card
  const side = Math.random() < .5 ? -1 : 1
  const lean = (Math.random() - .5) * 5
  const offsets = cards.map((card, index) => {
    const pose = SPILL_SHAPE[cards.length === 1 ? 4 : index % SPILL_SHAPE.length]
    return {
      card,
      ...randomNear({ x: pose.x * size.w * side, y: pose.y * size.h }, 8, 10),
      tilt: pose.tilt * side + lean + (Math.random() - .5) * 4,
    }
  })

  const bounds = limits(stage, size)
  const xFit = fitSpillAxis(offsets.map(({ x }) => x), bounds.left, bounds.right, 22)
  const yFit = fitSpillAxis(offsets.map(({ y }) => y), bounds.top, bounds.bottom, 10)
  const packPosition = stagePosition(pack, stage.w, stage.h)
  const near = {
    x: packPosition.left + (ITEM_SIZE.pack.w - size.w) / 2 + 12 * side,
    y: packPosition.top + ITEM_SIZE.pack.h * .56 - size.h / 2 + 18,
  }
  const occupied = occupiedBounds(existing, stage)

  // Nudge the whole spill around nearby items without separating its cards.
  let anchor = near
  let best = Infinity
  for (const dx of [0, -size.w * .52, size.w * .52]) {
    for (const dy of [0, -size.h * .24, size.h * .24]) {
      const x = clamp(near.x + dx, xFit.low, xFit.high)
      const y = clamp(near.y + dy, yFit.low, yFit.high)
      const overlap = offsets.reduce((sum, offset) => sum +
        coveredArea(x + offset.x * xFit.scale, y + offset.y * yFit.scale, size, occupied), 0)
      const score = Math.hypot(x - near.x, y - near.y) + (overlap / (size.w * size.h)) * 74
      if (score < best) {
        anchor = { x, y }
        best = score
      }
    }
  }

  return offsets.map(({ card, x, y, tilt }, index) => ({
    id: newId("card"),
    kind: "card",
    card,
    x: (anchor.x + x * xFit.scale) / stage.w,
    y: (anchor.y + y * yFit.scale) / stage.h,
    z: firstZ + index,
    tilt,
  }))
}
