export interface EdgePoint { x: number; y: number }

export const GRID_STEP = 96
const marginX = 224
const marginY = 252
export const BOARD = { width: GRID_STEP * 8 + marginX * 2, height: GRID_STEP * 9 + marginY * 2 }
export const FIELD = { left: marginX, right: BOARD.width - marginX, top: marginY, bottom: BOARD.height - marginY }
export const CENTER = { x: BOARD.width / 2, y: BOARD.height / 2 }
export const point = ({ x, y }: EdgePoint): EdgePoint => ({ x, y })
export const edgeDistance = (a: EdgePoint, b: EdgePoint) => Math.hypot(a.x - b.x, a.y - b.y)
export function movingOutward(from: EdgePoint, to: EdgePoint, center: EdgePoint) {
  if (edgeDistance(from, center) < .01) return edgeDistance(from, to) > .01
  return (from.x - center.x) * (to.x - from.x) + (from.y - center.y) * (to.y - from.y) > .01
}
export const isOutside = ({ x, y }: EdgePoint) => x < FIELD.left || x > FIELD.right || y < FIELD.top || y > FIELD.bottom
export const isOnBoard = ({ x, y }: EdgePoint) => x >= 0 && y >= 0 && x <= BOARD.width && y <= BOARD.height
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const inside = ({ x, y }: EdgePoint, margin = 14): EdgePoint => ({
  x: clamp(x, FIELD.left + margin, FIELD.right - margin),
  y: clamp(y, FIELD.top + margin, FIELD.bottom - margin),
})

export function direction(from: EdgePoint, to: EdgePoint): EdgePoint {
  const length = edgeDistance(from, to)
  return length > 0.01 ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length } : { x: 1, y: 0 }
}

export const along = (p: EdgePoint, axis: EdgePoint, length: number): EdgePoint => ({ x: p.x + axis.x * length, y: p.y + axis.y * length })
export const left = ({ x, y }: EdgePoint): EdgePoint => ({ x: y, y: -x })
export const mirror = ({ x, y }: EdgePoint): EdgePoint => ({ x: BOARD.width - x, y: BOARD.height - y })
export const borderGap = ({ x, y }: EdgePoint) => Math.min(Math.abs(x - FIELD.left), Math.abs(x - FIELD.right), Math.abs(y - FIELD.top), Math.abs(y - FIELD.bottom))

export function outward(p: EdgePoint): EdgePoint {
  const edges = [
    { gap: Math.abs(p.x - FIELD.left), vector: { x: -1, y: 0 } },
    { gap: Math.abs(p.x - FIELD.right), vector: { x: 1, y: 0 } },
    { gap: Math.abs(p.y - FIELD.top), vector: { x: 0, y: -1 } },
    { gap: Math.abs(p.y - FIELD.bottom), vector: { x: 0, y: 1 } },
  ]
  return edges.reduce((nearest, edge) => edge.gap < nearest.gap ? edge : nearest).vector
}

export function rotate(vector: EdgePoint, degrees: number): EdgePoint {
  const angle = degrees * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos }
}

export function fieldCrossing(from: EdgePoint, to: EdgePoint): EdgePoint {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const x = dx === 0 ? Infinity : ((dx < 0 ? FIELD.left : FIELD.right) - from.x) / dx
  const y = dy === 0 ? Infinity : ((dy < 0 ? FIELD.top : FIELD.bottom) - from.y) / dy
  const t = clamp(Math.min(x, y), 0, 1)
  return { x: from.x + dx * t, y: from.y + dy * t }
}

export type AreaPart =
  | { kind: "circle"; center: EdgePoint; radius: number; inner?: number }
  | { kind: "polygon"; points: EdgePoint[] }

export interface EdgeArea {
  center: EdgePoint
  parts: AreaPart[]
  star?: EdgePoint[]
}

export type ShapeCode = "C" | "L" | "B" | "S" | "F" | "X" | "M" | "J" | "N" | "D" | "K"

function box(center: EdgePoint, axis: EdgePoint, length: number, width: number): AreaPart {
  const side = left(axis)
  return { kind: "polygon", points: [
    along(along(center, axis, -length / 2), side, -width / 2),
    along(along(center, axis, length / 2), side, -width / 2),
    along(along(center, axis, length / 2), side, width / 2),
    along(along(center, axis, -length / 2), side, width / 2),
  ] }
}

export function areaOf(code: ShapeCode, anchor: EdgePoint, axis: EdgePoint, a: number, b = 0, c = 0): EdgeArea {
  switch (code) {
    case "C": return { center: anchor, parts: [{ kind: "circle", center: anchor, radius: a }] }
    case "N": return { center: anchor, parts: [{ kind: "circle", center: anchor, radius: a, inner: Math.max(0, a - b) }] }
    case "L": return { center: along(anchor, axis, a / 2), parts: [box(along(anchor, axis, a / 2), axis, a, b)] }
    case "B": return { center: anchor, parts: [box(anchor, left(axis), a, b)] }
    case "K": return { center: anchor, parts: [-1, 1].map((n) => box(along(anchor, left(axis), c * n / 2), axis, a, b)) }
    case "X": return { center: anchor, parts: [box(anchor, axis, a, b), box(anchor, left(axis), a, b)] }
    case "M": return { center: anchor, parts: [-1, 0, 1].map((n) => box(along(anchor, left(axis), c * n), axis, a, b)) }
    case "J": return { center: anchor, parts: [-1, 1].map((n) => ({ kind: "circle", center: along(anchor, left(axis), b * n / 2), radius: a })) }
    case "D": return { center: along(anchor, axis, b / 2), parts: [anchor, along(anchor, axis, b)].map((center) => ({ kind: "circle", center, radius: a })) }
    case "F": return { center: anchor, parts: [{ kind: "polygon", points: [
      anchor, ...Array.from({ length: 17 }, (_, i) => along(anchor, rotate(axis, b * (i / 16 - 0.5)), a)),
    ] }] }
    case "S": {
      const points = Array.from({ length: 10 }, (_, i) => along(anchor, rotate({ x: 0, y: -1 }, i * 36), i % 2 ? b : a))
      const star = [0, 4, 8, 2, 6].map((i) => points[i])
      return { center: anchor, parts: [{ kind: "polygon", points }], star }
    }
  }
}

function contains(part: AreaPart, p: EdgePoint) {
  if (part.kind === "circle") {
    const gap = edgeDistance(part.center, p)
    return gap <= part.radius && gap >= (part.inner ?? 0)
  }
  let hit = false
  for (let i = 0, j = part.points.length - 1; i < part.points.length; j = i++) {
    const a = part.points[i]
    const b = part.points[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

export const areaHits = (area: EdgeArea, p: EdgePoint) => area.parts.reduce((n, part) => n + Number(contains(part, p)), 0)

export function areaPath(area: EdgeArea) {
  const circle = (p: EdgePoint, r: number) => `M${p.x - r} ${p.y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
  return area.parts.map((part) => part.kind === "circle"
    ? circle(part.center, part.radius) + (part.inner ? " " + circle(part.center, part.inner) : "")
    : "M" + part.points.map(({ x, y }) => x + " " + y).join("L") + "Z").join(" ")
}
