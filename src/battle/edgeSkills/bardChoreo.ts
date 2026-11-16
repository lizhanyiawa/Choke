import type { Rarity } from "@/card/types"
import { along, clamp, direction, edgeDistance, inside, left, type EdgePoint } from "./geometry"

type Delivery = "none" | "note" | "needle"
const art = <M extends string>(motif: M, windup: number, crest: string, design: string, delivery: Delivery = "none") =>
  ({ motif, windup, crest, design, delivery })

const score = {
  C: [
    art("pulseNote", .14, "M-23 6h11l5-12 6 22 8-17 6 7h12M-21-14h13m16 0h12",
      "两截白拍板合向受益卡脚边。第一次带着鼓舞命中的普攻，从真实出手点拖出一段短重拍。"),
    art("tuningFork", .16, "M-21 14H21M-18-14v20h36v-20M-9-9V6M9-9V6M0 6v14",
      "一枚短音叉拉长受益者原射程。远端实际命中时，尾音正好跨过原射程刻线。"),
    art("mutedDrum", .16, "M-23-10Q0-20 23-10v20Q0 20-23 10Zm0 0q23 11 46 0m-34 5v12m22-12v12",
      "一面白扁鼓贴在卡边。真正挡伤时鼓皮朝来向凹下，缩进去的那拍给出挡伤值。"),
    art("triplet", .19, "M-24 9h48M-19-3v12m19-18v18M19-15V9M-24-13l5 4 5-4",
      "敌卡脚下三枚刻点依次停住。打中的那一拍压扁脚线，残留节拍显示实际减速。"),
    art("returnVerse", .16, "M-24-4Q-10-22 2-7T24-4M-18 5Q0 22 18 5m-25 4h14M0 2v14",
      "第一片白音回补血条，折余的小半弧贴着脚边。受益卡真正命中时，音轨从敌人脚下回到它。", "note"),
  ],
  UC: [
    art("warDrum", .20, "M-28-8-17-20H17L28-8V12L17 22H-17L-28 12ZM-28-3q28 12 56 0M-14 3v13M0 5v13m14-15v13",
      "青白鼓沿先撑起三片护页。来袭实际被挡时三片同向收缩，内鼓再沿攻击来向回弹。"),
    art("downbeat", .20, "M-29-15h18L6 0l-17 15h-18L-13 0ZM3-15h13L31 0 16 15H3L18 0Z",
      "一根蓝拍杵钉在队友脚边。普攻推力真正加上后，两枚短楔沿实际击退路径逐个打亮。"),
    art("bassCurtain", .27, "M-27 17v-31h54v31M-20-9v22m10-22v28M0-9v30m10-30v28m10-28v22",
      "七道低弦贴着圆缘垂落。第一张进入并实际领盾的友卡，沿自己的入场侧掀开蓝色幕帘。"),
    art("retreatBeat", .21, "M-28 15h18L8-17h21M-9 13l17 5 16-25M-24 5l10-4M20-18l7 8",
      "低鼓贴着待用卡的旧脚点。走完整步后实落脚处敲开鼓沿，疗光沿那段脚线回收。"),
    art("harmonyNeedle", .24, "M-30 0-15-12 25-6 31 0 25 6-15 12ZM-17 0h36m-14 12 9 9 11-8",
      "青音针先直线钉到目标，再从真实命中点折向另一侧的近友，第二段抵达后展开小盾。", "needle"),
  ],
  R: [
    art("echoArrow", .25, "M-33-11H6l12 11L6 11h-39m11-22 14 11-14 11M19-16l13 7v18l-13 7",
      "受益卡身旁两道反向弦留待用。打中后第一声停在命中点，另一声沿横弧转去实际接到回响的敌人。"),
    art("bowString", .26, "M-31-19Q0-9 31-19M-31 19Q0 9 31 19M-22 0h45l-8-7m8 7-8 7M0-10v20",
      "两条蓝紫弦等待队友出手。实际首击使中弦绷直，附加推力以一条斜弧延伸到真实落点。"),
    art("tuningMark", .30, "M-29-23v15q0 18 29 18t29-18v-15M-18-23v15q0 8 18 8t18-8v-15M0 9v16",
      "两根叉齿对称压入地面。真命中的敌人脚下保留叉痕，队友的第一发普攻合上其中一枚缺口。"),
    art("passingHeal", .25, "M-32-8Q-21-26-4-7t36-1M-31 10q18 16 31 1T31 10M-8 5H8m-8-8v16",
      "首针是一道直短音。实际出手者的下一发普攻点亮中继，短音从出手卡弯向收到治疗的第三点。", "note"),
    art("crossMeter", .31, "M-32-17H32M-32 0H32m-64 17h64M-18-24v47m36-47v47M-8 17 0 8 8 17",
      "斜线先铺三根短谱线。实命中向侧方拔出推拍，沿谱首位受护者的盾从另一侧翻起。"),
  ],
  E: [
    art("residency", .33, "M-32 14a33 33 0 1 1 64 0M-26 8a27 27 0 1 1 52 0M0 0l22-17M-22-5v12m11-20v10m11-15v8",
      "圆形唱片落地后，站入圈的卡出现实际射程刻线。超过原射程的命中从最外沿亮起一次拨弦。"),
    art("echoStage", .35, "M-35 18v-32l35-12 35 12v32L0 26ZM-23 5h10v10h-10m18-22h10v22H-5m18-28h10v28H13",
      "紫色台板有分开的音格。每张卡从圈内出手并实际命中时，只点亮自己的那格并打出额外音。"),
    art("restCloak", .31, "M-36 5-26-20H26L36 5 20 24H-20ZM-23 7 0 18 23 7M-10-3H10",
      "紫色披片在受益卡周围形成护罩，脚下留收声的短折。走到位时，旧护音沿实走方向收成治疗。"),
    art("stoppedString", .34, "M-36 13H-11L-4-10H5l7 23h24M-28-12-14-20M14-20l14 8M-5-12v35m10-35v35",
      "短弦钉在真实命中的敌脚下。队友下一发普攻推起目标时，弦从命中处被扯开，扫到实际落点。"),
    art("duet", .34, "M-36 0Q-17-33 0 0T36 0Q17 33 0 0T-36 0M-32-9v18m64-18v18",
      "两张卡各戴半枚紫音。哪张卡先实际命中，哪一端的弦就沿相反方向卷去另一端给药。"),
  ],
  L: [
    art("ensembleCall", .39, "M-40 19H40M-33-15h23v27h-23Zm43 0h23v27H10ZM-28-4h13m30 0h13M0-24v36",
      "金框在目标身侧留下两个空拍位。每次来自新出手者的合格命中点亮一格，第二格响完才合上。", "note"),
    art("battleStaff", .39, "M-41-20H41m-82 13h82m-82 14h82m-82 13h82M-24-26v52m44-52v52M-12 0l12-13 12 13-12 13Z",
      "金谱线分成朝敌的长音和朝友的护面。每条击退刻沿真实推向展开，护盾从同一谱线上扣到友卡。"),
    art("longLead", .39, "M-40 17Q-23-16-8 3 5 20 22-10L40-21M-16 20h12m12-4h12m6-35 14-2-2 14",
      "长音隔着场地接到指定友卡。该卡真正打中时，金芯沿出手方向折入命中圆，外圈亮出疗区。", "note"),
    art("silenceCorner", .40, "M-40-8v-18h18m44 0h18v18m0 16v18H22m-44 0h-18V8M-20-11 20 11m-40 0 40-22",
      "金色静音角有内外两拍。铺场先敲低音，敌方在里面开始蓄力时，从实际预警来向合上静音框。"),
    art("coda", .37, "M-40-16h80v17Q27 23 0 27-27 23-40 1ZM-31 0h27l5-12 9 18 8-6h12m-20 11h16",
      "礼成盾的右缘留一道斜拍。受护者命中实际处于低血线的敌人后，尾印才从敌卡折回原受益者。"),
  ],
  Radiant: [
    art("shieldRelay", .41, "M-43-16-20-27 0-18 20-27 43-16 35 8 0 28-35 8ZM-28 0h48l-9-8m9 8-9 8M0-17v35",
      "第一张卡的桃色盾弧停在原位。它打中后从盾边飞出一枚反向音符，抵达另一张卡时扩成同量盾。"),
    art("threeVoices", .42, "M-42 16h15l12-15H1l13-18h26m-65 6 6-7 6 7m16 21 6-7 6 7m14-21 6-7 6 7",
      "第一声压进主卡血条。真实出手时第二声跨过战线，第三声从接收者的盾下托起生命。", "note"),
    art("timingLane", .44, "M-44-19H44m-88 38h88M-29-23v11m28-11v11m28-11v11M-30 5l10-7 10 7m11 0 10-7 10 7m11 0 10-7",
      "桃色五线谱留在实际走道。每个合格落脚点沿来向铺短尾，护盾和射程刻度在脚点分两拍亮。"),
    art("refrain", .45, "M-42-8q20-26 42-10t42 10M-42 8q20 26 42 10t42-10M-16 0H16m-8-9 8 9-8 9M0-21v9m0 24v9",
      "首击给敌卡留下桃色副歌纹。队友真正把它推到位才沿实际击退线接一拍，落点唱片向外爆开。", "needle"),
    art("antiphon", .44, "M-44 0q13-22 29-16l15 12 15-12q16-6 29 16-13 22-29 16L0 4l-15 12Q-31 22-44 0ZM-15-4h11m8 8h11",
      "圆场先向每张伤员开出一叶。各自第一发实中普攻从敌人位置折回治疗师，队友的回唱依次消灯。"),
  ],
  Prismatic: [
    art("finalScore", .54, "M-50-19h100m-100 13h100m-100 13h100m-100 13h100M-35-26v52m70-52v52M-20 0-9-12 1 0l11-16L23 0 12 14 1 0-9 12Z",
      "虹白谱架先逐张授印。攻击的谱页从实际打点张开重音圈，救援的谱页沿受益连线加亮，逐张灭自己的拍位。"),
    art("rescueSymphony", .51, "M-51 1Q-41-23-23-19L0-8l23-11q18-4 28 20-10 24-28 20L0 9l-23 12Q-41 25-51 1ZM-34 3h12l8-14 11 26 11-22 10 10h16",
      "折叠的虹白弦乐从场心依次救人。低血卡的盾先挂住侧面，真正受击时第二层外壳沿来向折响。"),
    art("overture", .53, "M-49 16h14L-15-1 0-18 15-1l20 17h14M-44-15l22 5 22-8 22 8 22-5M-7-22 0-30 7-22M-21 19h42",
      "四条交错的滑条从真实脚点汇向近邻席位。每张卡随自己的到位判定亮盾，再把余拍留给下一次普攻。"),
    art("spectrumDuel", .56, "M-51-9-26-27-8-12 12-27 51-9 34 15 0 28-34 15ZM-33 0h15l9-14 13 29 10-20 9 5h10",
      "虹芯频谱先在选定圈内打出一拍。场内每名队友以战技实际命中后，从该卡身侧向另一张友卡传回一支亮频。"),
    art("shoreCoda", .53, "M-52-23h23l10 12-9 11 9 11-10 12h-23m104-46H29L19-11l9 11-9 11 10 12h23M-13 0H13M0-15v30",
      "界外卡和最近实边线之间保留断奏谱。只有手动跨线才合拢边闸，从真实过线点把余拍分给近友。", "note"),
  ],
} as const satisfies Record<Rarity, readonly { motif: string; windup: number; crest: string; design: string; delivery: Delivery }[]>

export type BardMotif = (typeof score)[Rarity][number]["motif"]

export function bardFlight(motif: BardMotif, delivery: Delivery, gap: number) {
  if (delivery === "none" || gap < 18) return 0
  const limit = motif === "longLead" || motif === "shoreCoda" ? .52 : .31
  return clamp(gap / (delivery === "needle" ? 1250 : 960), .12, limit)
}

export const bardRecipientDelay = (index: number) => .095 * (index + 1)

export const BARD_SEAT_TRAVEL = .35
export const BARD_SPECTRUM_FLIGHT = .25
export const bardSeatDelay = (index: number) => .065 * (index + 1)

export function overtureSeats<T>(from: EdgePoint, aim: EdgePoint, cards: readonly T[], position: (card: T) => EdgePoint) {
  const axis = left(direction(from, aim))
  const lateral = (card: T) => {
    const at = position(card)
    return at.x * axis.x + at.y * axis.y
  }
  return cards.slice().sort((a, b) => lateral(a) - lateral(b)).map((unit, index) => ({
    unit, index, seat: inside(along(aim, axis, (index - (cards.length - 1) / 2) * 70), 18),
  }))
}

export const overtureLanding = (from: EdgePoint, seat: EdgePoint, reach: number) =>
  along(from, direction(from, seat), Math.min(reach, edgeDistance(from, seat)))

export function spectrumRecipient<T>(cards: readonly T[], source: T, position: (card: T) => EdgePoint, available: (card: T) => boolean) {
  const from = position(source)
  let receiver: T | undefined
  let distance = Infinity
  for (const card of cards) {
    if (card === source) continue
    const gap = edgeDistance(from, position(card))
    if (gap >= distance || !available(card)) continue
    distance = gap
    receiver = card
  }
  return receiver
}

export function bardChoreography(id?: string) {
  if (!id?.startsWith("bard/")) return
  const [, rank, slot] = id.split("/")
  if (slot?.startsWith("A")) return score[rank as Rarity]?.[Number(slot.slice(1)) - 1]
}
