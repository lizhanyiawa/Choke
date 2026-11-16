import type { Rarity } from "@/card/types"

interface WardenChoreography {
  motif: string
  design: string
  windup?: number
  travel?: number
}

const art = <M extends string>(motif: M, design: string, timing?: Pick<WardenChoreography, "windup" | "travel">) =>
  ({ motif, design, windup: timing?.windup, travel: timing?.travel })

const repertoire = {
  C: [
    art("knocker", "盾心先竖，再从近身正面短扣一拍。命中后以盾缘和粉尘标出实推路线，冲撞确实被断时从中间折开", { windup: .18 }),
    art("rake", "白盾斜立后擦过窄带，落下时三段划痕向实际侧推的一边掀起", { windup: .21 }),
    art("step", "两枚短步刻随战坦前移依次落下，到位才让一块贴地白盾翻立", { travel: .21 }),
    art("rearhook", "楔片从施术端扣到友卡背后，受推时沿实际受力方向翻转，在落脚位置解扣"),
    art("spear", "先收矛尾，窄矛扫过敌人脚下。矛尖落下一排刹车纹，随真实减速计时", { windup: .18 }),
  ],
  UC: [
    art("ram", "厚蓝盾先行，脚下两道刮痕随真实突进伸展。到位后由盾前放出一圈带方向的碎板", { travel: .25 }),
    art("sling", "蓝盾吊在友卡一侧，只在挡到一记主动伤害时向来袭方向垂摆，再卸下吊索"),
    art("deflect", "盾身前端翻成角板，贴着目标转向横推。两道短轨指向真实终点", { windup: .23 }),
    art("stamp", "落点先亮四角，短冲到位时四角夹住脚点并扣盾，真打断时切开敌方冲撞线", { travel: .27 }),
    art("winch", "三节短拉索从盾沿搭向敌人，收线跟随实际牵引，到规定停距时给出一道钩口", { windup: .24 }),
  ],
  R: [
    art("grapple", "带折钩的紫钢盾沿打开，命中后粗索从实地接触点收紧，末端留下被拉者实际停脚的铆扣", { windup: .25 }),
    art("compass", "两枚紫钢矢从敌人两侧指向场心，前矢只沿实际向心位移展开", { windup: .23 }),
    art("beacon", "哨点先竖三根标尺，敌卡真正落进圆内时亮距它最近的一节并合上断招闸", { windup: .24 }),
    art("escort", "两张友卡间先铺一条弯折援步线。战坦沿真实近侧路线进位，停下才向友卡扣盾", { travel: .25 }),
    art("relay", "第一记重盾推过后在受击敌脚边留一节短接头，队友下一记直击沿实际追加推向拆掉接头", { windup: .22 }),
  ],
  E: [
    art("divider", "紫盾先画出直带中线，带中命中后向两侧翻开不同的碎翼，标出每个敌人的实际侧移", { windup: .29 }),
    art("gate", "两端门榫从地面逐格合成横墙，敌卡主动走进时只有实际接触那一格闭锁并弹回", { windup: .26 }),
    art("spring", "先向内收短索，敌卡确实被拉近后有一拍空隙。第二拍从当前位置掀起弹舌向外送", { windup: .16 }),
    art("stretcher", "紫色托板贴在被救卡脚下沿实际内移路线收回，托板到位后两侧折起来成为盾", { travel: .27 }),
    art("breaker", "战坦向选点压进，脚下亮三角落位尺，停下那帧脚印炸成裂带，实际打断另亮一记白缺口", { travel: .29 }),
  ],
  L: [
    art("exchange", "两张卡脚下各压一枚金色定位框。弧线对向穿过后，友卡落安全一端扣盾，战坦在危险一端击出碎片", { windup: .32 }),
    art("borrow", "窄金路线随战坦推进，落定后首个经过的敌卡亮出锁节。短索回折到实地标出的后侧停点", { travel: .29 }),
    art("bastionSweep", "长带先亮双层甲骨，外沿往两侧推敌，内沿按路径给友卡贴盾", { windup: .31 }),
    art("carry", "从敌方压力侧抬起一片金托架，沿真实送离方向分节滑行，边界截住托架才合盾", { travel: .31 }),
    art("advance", "起点旧盾沿落脚位置展开，战坦到前方后原位竖起留队金墙。队友首次踏入时从墙内接甲", { travel: .34 }),
  ],
  Radiant: [
    art("gather", "第一拍把多根粉白牵引线向中心收紧，第二拍把真实命中的敌卡沿同一轴同时掀开"),
    art("rewind", "入圈命中时在各目标来路留折返点，等一拍后沿各自的进场反向回推，静止目标沿施术者来向分开"),
    art("overlap", "战坦沿友卡近侧实进，两片桃盾在抵达点错叠。冲击环从战坦实落处扩出，友卡肩边单独合甲", { travel: .30 }),
    art("tripwire", "桃金警戒环先开阵打一下，敌方真正开始蓄力时地面三节索由警戒环收紧，切断这一次冲撞", { windup: .24 }),
    art("twinlane", "左右两片盾翼沿共同中线打开，冷色右翼在实际推开后落一条刹车栅，暖色左翼只标推向", { windup: .33 }),
  ],
  Prismatic: [
    art("boundary", "八段虹白刻度按真半径立阵，真正拦下一次出界时只有交点旁的边线合闸，原目标的阵印消耗", { windup: .28 }),
    art("pincer", "两条虹白长墙每帧跟随真实收拢的判定带，接触敌卡时从该侧向中心扣一枚移位箭，合线后余辉从中缝退掉", { windup: .65 }),
    art("ricochet", "友卡身侧扣住界外保险闩。真的将越线时在边线截住目标，第二条反向轨只朝范围内的真实攻击者亮起"),
    art("hammer", "四角在地面锁定落槌圆，一整片多层虹锤由高处压下，接触那一拍沿左右真实位移劈出不对称的裂纹"),
    art("parallel", "两张场内卡各撑一枚虹棱，双弧交换后两端各开一圈反推，交叠处的敌卡只留一次命中点", { windup: .38 }),
  ],
} as const satisfies Record<Rarity, readonly WardenChoreography[]>

export type WardenMotif = (typeof repertoire)[Rarity][number]["motif"]

export function wardenChoreography(id?: string) {
  if (!id?.startsWith("warden/")) return
  const [, rarity, slot] = id.split("/")
  return slot?.startsWith("A") ? repertoire[rarity as Rarity]?.[Number(slot.slice(1)) - 1] : undefined
}
