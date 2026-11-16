import type { Rarity } from "@/card/types"
import { along, areaOf, clamp, direction, edgeDistance, fieldCrossing, inside, isOutside, left, point, rotate, type EdgeArea, type EdgePoint } from "./geometry"

export const REVERSE_PRINT_TRAVEL = .43

const art = <M extends string>(motif: M, windup: number, design: string, pairedTravel = 0) => ({ motif, windup, design, pairedTravel })
const repertoire = {
  C: [
    art("leadRibbon", .16, "一对错开的白色脚跟先从舞者指向受益卡。队友真正走起来时亮纹交替落脚，停止后留一小截织带。"),
    art("heelStamp", .19, "给脚边钉上一枚方拍。下一步的原 190 刻度停在地面，超出的鞋尖迹与实际到位的扣声连成一拍。"),
    art("footCradle", .2, "两扇薄白鞋翼从下向上扣住护盾，发盾与加速有各自的反馈。边走时只从翼尖抽出两根短带。"),
    art("halfTurn", .21, "旧脚点先打一个半扣，舞者滑开时拉出一抹翻身月牙，实际到位才从背后翻出护面。"),
    art("sideSweep", .22, "一长一短的两把拍板沿窄线合扫，敌人实受击退时，各自侧向扬起一枚白刻。"),
  ],
  UC: [
    art("leadSide", .23, "一枚蓝指向锚住队友旧脚，细带沿它真实滑步伸开。受益者落地时两道不对称的鞋扣先后闭合。"),
    art("braceSash", .22, "浅蓝腰带先绕成盾，脚下单独留一根抵住地面的拉带。真正耗掉抗推时拉带向受力方向绷断。"),
    art("landingLamp", .28, "圆内压着半开的低灯，第一张走到位的友卡把圆边灯芯踩亮，光线从实落脚点收拢。"),
    art("threadCut", .24, "舞者拖着贴地的蓝刃切过窄道。命中只沿舞者已经走过的线亮起，旧段很快暗下。"),
    art("lightPost", .27, "一枚琥珀底的蓝刻留在受益者旧位，与其脚下连尺。真正走够 95 后尺端开花成盾。"),
  ],
  R: [
    art("longMeter", .26, "一串逐级加长的蓝紫尺沿实走方向亮起，原上限刻线和新脚点分开，末端折出一面短旗。"),
    art("entryLace", .29, "四条蓝紫缝线分守圆缘，友卡实际从外步入时，经过的那段边先开，再将一根回线扣到它脚边。"),
    art("oldStep", .28, "原脚印锁成一枚反拍，受益者走完后从新位回望旧位，护光沿旧圈分别给仍留在那里的队友。"),
    art("clearLane", .3, "蓝紫长带沿施法方向展平，随后每个敌人自己的推向从最近友卡向外展开，像一列不同角度的路标。"),
    art("stopDrum", .25, "开场一口治疗从扁鼓中央落下。实际走到位才翻出鼓盖，下一次直击从来向压响鼓皮。"),
  ],
  E: [
    art("pairedRibbon", .32, "紫白拍线连住两张卡，侧移时两道平行脚线和拍线一起移动。着地后两端各翻一片护翼。", .34),
    art("reboundAnchor", .31, "一枚楔形锚钉留在友卡原脚点。等原击退走完，回线再从实际落点绷到锚边，回位才亮治疗拍。"),
    art("wakeFan", .3, "舞者抬脚时旧脚点留下扇骨，扇面向身后展开，把原位周围的敌人推出去。前方只留低矮滑步尾。"),
    art("stillRing", .36, "一圈三刻拍灯保持低亮。每张友卡真正站定才从自己的脚点数三格，数完各自落下疗光和护面。"),
    art("partedLane", .33, "一条紫绸在同一拍劈成两半。敌侧绸刃外翻，友侧薄绸反扣到沿施法方向遇到的第一张友卡。"),
  ],
  L: [
    art("hopNote", .35, "金色跳印贴在队友脚下。下一步的抛弧连着原脚点和真落点，只有跳到位才把圆周向外敲开。"),
    art("doubleJump", .34, "旧脚点与落脚点各立一排不对称的金色踏片，中间用短抛弧相连。第一排在离地时拍下，另一排在到位时才落。"),
    art("goldRailPair", .39, "两张卡同向侧移时并排打开带齿金轨，侧移进度共用一条横杠。两端各立一块带暗纹的护板。", .40),
    art("borrowStep", .39, "地面留一圈缺拍。合格的普通落点踩中后，沿来向多铺一格金阶，到额外脚点才锁成盾。"),
    art("guardRail", .36, "窄金轨两边留可踩的断节。友卡在轨中实走时节线流动，原击退从轨内出去后，护尾顺实推路径回到落脚处。"),
  ],
  Radiant: [
    art("quarterOrbit", .41, "桃白轴环先预画每名友卡自己的四分之一圆。实际转动时白芯追着脚点，旋停后各自扣成半透减伤披肩。"),
    art("inwardFans", .4, "从各个初始站位向场心张开不对称扇道，三角脚尖向同一内圈收拢。每张卡抵达时各留下朝心的折盾。"),
    art("retreatFlash", .39, "后跟留一枚朝外的桃箭。首个有效直击先点亮来向，真实受推落点再甩出一条倒扇，滑停时光沿地面回到血格。"),
    art("threeBeat", .42, "三条薄桃拍轨中两枚节珠代表两次发盾。第一、第二张实走过轨的卡各取一枚，轨道的加速节奏持续到消散。"),
    art("counterSwing", .43, "逆时针的半开回摆像两截拧开的粉绸。每张卡旋停时旧弧反卷成治疗片，敌人的命中从它们的真实落点亮起。"),
  ],
  Prismatic: [
    art("finaleSlider", .49, "一道半透明棱彩滑条从头圈铺到尾圈。每张友卡首次上条时，判定圈按真实速度前行，实落点同时锁住三层虹片。"),
    art("foldSlider", .46, "两条浅虹轨在可踩的实折点各自转向。友卡脚点到拐角时，一道短棱镜才折开，把速度和护光分成两拍。"),
    art("reversePrint", .45, "真实两秒内的鞋印从新到旧依次倒亮，角色沿可回放的一段退行。最后真正落定的历史点拼成透明盾。"),
    art("rushCrests", .5, "同一圆内每张受益友卡各有一枚独立的三片脚印。各自长步使用后，印片沿实走方向散开，到自己的终点才合成疗光。"),
    art("coastRelay", .52, "几条相互错开的棱彩弧按顺序发令。每张卡从自己的实际落点撞开一扇薄门，周围实击敌人的外推轨迹紧随其后。"),
  ],
} as const satisfies Record<Rarity, readonly { motif: string; windup: number; design: string }[]>

export type DancerMotif = (typeof repertoire)[Rarity][number]["motif"]
export function dancerChoreography(id?: string) {
  if (!id?.startsWith("dancer/")) return
  const [, rank, slot] = id.split("/")
  if (slot?.startsWith("A")) return repertoire[rank as Rarity]?.[Number(slot.slice(1)) - 1]
}

export interface DancerPath {
  points: readonly EdgePoint[]
  stops: readonly number[]
  length: number
}

export function dancerPath(points: readonly EdgePoint[]): DancerPath {
  const stops = [0]
  for (let i = 1; i < points.length; i++) stops.push(stops[i - 1] + edgeDistance(points[i - 1], points[i]))
  return { points: points.map(point), stops, length: stops.at(-1)! }
}

export function dancerPointAt(route: DancerPath, progress: number) {
  const { stops, points, length } = route
  const distance = length * clamp(progress, 0, 1)
  if (distance >= length) return points.at(-1)!
  const end = stops.findIndex(stop => stop > distance)
  return along(points[end - 1], direction(points[end - 1], points[end]), distance - stops[end - 1])
}

export function trimDancerPath(route: DancerPath, limit: number) {
  if (limit >= route.length) return route
  return dancerPath([...route.points.filter((_, i) => route.stops[i] < limit), dancerPointAt(route, limit / route.length)])
}

export function dancerClippedEnd(from: EdgePoint, to: EdgePoint) {
  return isOutside(to) ? inside(fieldCrossing(from, to), 0) : point(to)
}

export function dancerOrbit(from: EdgePoint, center: EdgePoint, degrees: number) {
  const radius = edgeDistance(from, center)
  const steps = Math.max(1, Math.ceil(Math.abs(degrees) / 6))
  const axis = direction(center, from)
  const points = [point(from)]
  for (let i = 1; i <= steps; i++) {
    const next = along(center, rotate(axis, degrees * i / steps), radius)
    points.push(dancerClippedEnd(points.at(-1)!, next))
    if (isOutside(next)) break
  }
  return dancerPath(points)
}

export function dancerHistory(from: EdgePoint, samples: readonly { time: number; at: EdgePoint }[], now: number, limit: number) {
  const points = [point(from)]
  for (let i = samples.length - 1; i >= 0; i--) {
    const { time, at } = samples[i]
    if (now - time > 2 || isOutside(at)) break
    if (edgeDistance(points.at(-1)!, at) >= 5) points.push(at)
  }
  const route = trimDancerPath(dancerPath(points), limit)
  const last = route.points.findLastIndex(at => edgeDistance(from, at) >= 6)
  return last >= 1 ? dancerPath(route.points.slice(0, last + 1)) : undefined
}

export interface DancerRail {
  path: DancerPath
  area: EdgeArea
  width: number
  corner?: EdgePoint
}

export function dancerRail(from: EdgePoint, aim: EdgePoint, length: number, width: number, folded: boolean): DancerRail {
  const head = inside(from, 0)
  const tail = inside(aim, 0)
  const axis = direction(head, tail)
  const gap = edgeDistance(head, tail)
  const offset = folded ? Math.min(94, gap * .29) : 0
  const center = along(head, axis, gap * .49)
  const side = left(axis)
  const leftCorner = inside(along(center, side, offset), 0)
  const rightCorner = inside(along(center, side, -offset), 0)
  const bend = edgeDistance(center, leftCorner) >= edgeDistance(center, rightCorner) ? leftCorner : rightCorner
  const initial = dancerPath(folded ? [head, bend, tail] : [head, tail])
  const path = dancerPath(initial.points.map(at => along(head, direction(head, at), edgeDistance(head, at) * Math.min(1, length / Math.max(.01, initial.length)))))
  const corner = folded ? path.points[1] : undefined
  const parts = path.points.slice(1).flatMap((to, i) => {
    const from = path.points[i]
    return areaOf("L", from, direction(from, to), edgeDistance(from, to), width).parts
  })
  if (corner) parts.push({ kind: "circle", center: corner, radius: width / 2 })
  return { path, width, corner, area: { center: dancerPointAt(path, .5), parts } }
}

export function dancerRailContains(rail: DancerRail, at: EdgePoint) {
  const { path, width, corner } = rail
  if (corner && edgeDistance(corner, at) <= width / 2) return true
  return path.points.slice(1).some((to, i) => {
    const from = path.points[i]
    const axis = direction(from, to)
    const offset = { x: at.x - from.x, y: at.y - from.y }
    const along = offset.x * axis.x + offset.y * axis.y
    const across = offset.x * axis.y - offset.y * axis.x
    return along >= -.001 && along <= edgeDistance(from, to) + .001 && Math.abs(across) <= width / 2 + .001
  })
}
