import type { Rarity } from "@/card/types"

export type RangerMotif =
  | "feather" | "lowDraw" | "singleBeat" | "skimmer" | "retreat"
  | "pierce" | "fork" | "pressure" | "slide" | "pad"
  | "relay" | "hinge" | "boomerang" | "edgePin" | "footMark"
  | "bomb" | "bundle" | "crater" | "offset" | "suspended"
  | "tripwire" | "shear" | "heavyFall" | "reprise" | "beacon"
  | "starRain" | "landscape" | "followShot" | "edgeSweep" | "interruptLine"
  | "pentagram" | "longString" | "sunset" | "reflection" | "parallel"
  | "followThrough" | "kickback" | "piercingHook" | "sentryFeather" | "thirdKink" | "counterArc"
  | "rimWake" | "detourSeal" | "wireLoop" | "repriseMark" | "runoffRain" | "coverWing" | "fifthRefraction" | "mirrorWard"

export interface RangerChoreography {
  motif: RangerMotif
  opening: number
  windup: number
  flight: number
  settle: number
  design: string
}

function sequence(motif: RangerMotif, opening: number, windup: number, flight: number, settle: number, design: string): RangerChoreography {
  return { motif, opening, windup, flight, settle, design }
}

const active: Record<Rarity, readonly [RangerChoreography, RangerChoreography, RangerChoreography, RangerChoreography, RangerChoreography]> = {
  C: [
    sequence("feather", .18, 0, .32, .24, "手边短拉弦，羽箭留一截直线，命中只开一记短星芒"),
    sequence("lowDraw", .21, 0, .30, .34, "低位侧拉弦，带倒钩的短箭贴地，受击沿实际推向掀短尘"),
    sequence("singleBeat", .20, .45, .16, .28, "目标的单个判定圈收拢，末段针箭切中心，命中线折成十字"),
    sequence("skimmer", .16, .22, .32, .31, "一线低扫保持狭长判定，首个命中点留下贴脚减速刻痕"),
    sequence("retreat", .21, 0, .31, .32, "正面羽箭和后撤分层，移动发生时旧位留下脚印、落脚留下刹线"),
  ],
  UC: [
    sequence("pierce", .24, .23, .36, .35, "窄蓝贯穿线上留一根中轴，实际命中处向两侧分出断线"),
    sequence("fork", .22, .22, .32, .32, "一弦分叉成两束实线，沿两条实际夹角射出，重叠处可见两道命中"),
    sequence("pressure", .27, .16, .32, .44, "箭头逐格上压，重命中压出折板，后方用方向碎屑标出击退"),
    sequence("slide", .22, 0, .18, .33, "先沿真实滑步铺贴地弧，再从滑步终点抬弓，箭落留短斜切"),
    sequence("pad", .30, 0, 0, .39, "放置时箭垫折叠入地，待用时只留竖起的箭簇，触发时向首敌弹开"),
  ],
  R: [
    sequence("relay", .26, .19, .29, .38, "第一发是细蓝直射，实际首击点留下折线节点，第二段从节点折向新目标"),
    sequence("hinge", .24, .54, .22, .43, "第一拍地面镜片翻开，第二拍只在原命中者身上倒翻折光"),
    sequence("boomerang", .26, .30, .46, .39, "外弧和返回沿判定带两侧走，回程反向点亮并留下月刃回线"),
    sequence("edgePin", .24, .20, .31, .38, "重箭入靶时亮最近边线刻度，单独画真实击退的落点向量"),
    sequence("footMark", .22, .19, .27, .37, "初针落在脚边，待用针跟着目标，实际移动到位才扣下第二针"),
  ],
  E: [
    sequence("bomb", .25, .45, .40, .52, "紫色高弧投向渐收的落点，撞地后外沿先亮、圆内余波向外扩"),
    sequence("bundle", .26, .33, .34, .43, "双肩蓄弦形成宽束，中心 24 判定与外带分层亮起，收尾逆向抽线"),
    sequence("crater", .28, .55, .43, .58, "高处压下一枚重箭，地面先收圈再裂开，碎块沿外圈弹离"),
    sequence("offset", .24, .63, .24, .43, "第一轮短旋，第二个实际偏移落点翻面后落下，双印相连但分拍读"),
    sequence("suspended", .25, .24, .30, .48, "首针留一个高位悬针，目标移动终点触发低位环形破裂"),
  ],
  L: [
    sequence("tripwire", .37, 0, 0, .56, "先铺横索两端锚，线在真实判定带中绷住，命中一侧的尘浪横翻"),
    sequence("shear", .30, .24, .37, .56, "金线沿实宽开一条走廊，两边裁口错向打开，实际侧推另有刃迹"),
    sequence("heavyFall", .32, .55, .41, .66, "粗箭从高处压准心，命中瞬间圆边震一圈，金属碎片折出击退方向"),
    sequence("reprise", .30, 1.85, .36, .59, "首波落地后保留倒弦和接下来一拍，第二波箭尾反向回落"),
    sequence("beacon", .43, 0, 0, .53, "信标从地面升起，敌方碰撞开金刃，友方进入时把光折成盾"),
  ],
  Radiant: [
    sequence("starRain", .28, .37, .31, .55, "三轮判定环跟着锁定单位，第一轮校点、第二轮交错、第三轮合击"),
    sequence("landscape", .36, .65, .39, .72, "外圈先出现裂边，双色箭击穿场面，外缘伤害有独立开裂脉冲"),
    sequence("followShot", .28, .22, .28, .51, "先标接力友卡，从友卡一侧发出短箭，真正跟枪时才有另一道羽尾"),
    sequence("edgeSweep", .34, .24, .38, .59, "宽带箭浪由下向上扫过，边侧加重，命中后推向各自最近边线"),
    sequence("interruptLine", .40, 0, 0, .57, "高弦和地面阴影成双线，敌人过线时从接触点剪断蓄力"),
  ],
  Prismatic: [
    sequence("pentagram", .40, 1.40, 1.40, .94, "五个实体判定点依次收圈，折线接完才引爆真实星形，断面逐片谢幕"),
    sequence("longString", .35, .55, .27, .77, "长弦从两端收紧，在同一拍横穿整条 750 长度，最远目标单独落重推"),
    sequence("sunset", .40, 1.15, .50, .88, "落日前先展开内外分层，白芯坠入中心，外缘翻出虹色环和边推"),
    sequence("reflection", .33, .69, .38, .70, "原点和场心镜像分别亮圈，第一拍破镜，第二拍从镜面逆向落箭"),
    sequence("parallel", .38, .90, .40, .78, "三条实际轨道分别点灯、并行落箭，外轨各向外侧翻折"),
  ],
}

const gold: Record<Rarity, readonly [RangerChoreography, RangerChoreography]> = {
  C: [
    sequence("followThrough", .16, 0, .12, .30, "首击点把羽尾折短，余箭沿原方向穿出，二次接触才点亮收尾"),
    sequence("kickback", .26, 0, 0, .42, "后撤原地翻起折羽，薄波向外弹开，边缘画实际推向"),
  ],
  UC: [
    sequence("piercingHook", .27, 0, 0, .45, "第二敌的贯穿断线向外扣成钩，落点以折钩收住"),
    sequence("sentryFeather", .24, 0, .14, .44, "箭垫弹开侧羽，短弧从预置点跨到另一敌脚下"),
  ],
  R: [
    sequence("thirdKink", .22, 0, .16, .48, "第二个命中点点亮转轴，第三段沿折角跳出，终点留下三道细刻"),
    sequence("counterArc", .25, 0, 0, .46, "回弧在同一命中点转向，地面只留一条从游侠现站位推出的轨迹"),
  ],
  E: [
    sequence("rimWake", .23, .26, .21, .60, "爆边的碎线追着真实落点掠过地面，抵达时在外侧再荡出一圈"),
    sequence("detourSeal", .30, 0, 0, .47, "第二落点沉成扇形障带，脚下斜纹一直保留到减速区消失"),
  ],
  L: [
    sequence("wireLoop", .30, .26, .22, .65, "索尾卷向敌人的真实落点，金色短线收紧再从落点反扣"),
    sequence("repriseMark", .32, 0, 0, .58, "第二拍翻出压在脚下的金色尾标，标尖朝场外后掀"),
  ],
  Radiant: [
    sequence("runoffRain", .32, 0, 0, .68, "第三拍在边线外压出向外的扇形星尾，额外命中独立亮点"),
    sequence("coverWing", .31, 0, 0, .61, "跟枪光回到队友身边，两片反扣羽甲合住其脚步，待用时留护片"),
  ],
  Prismatic: [
    sequence("fifthRefraction", .35, .45, .31, .72, "第五个判定点留一段蓄光，虹线折向最靠边的首轮命中敌，再落真实推向"),
    sequence("mirrorWard", .38, 0, 0, .72, "两处命中后第一圈倒转，把光沿场心对角送到镜像区，友卡上逐张合盾"),
  ],
}

const scenes = new Map<string, RangerChoreography>([
  ...Object.entries(active).flatMap(([rarity, skills]) => skills.map((skill, i) => [`ranger/${rarity}/A${i + 1}`, skill] as const)),
  ...Object.entries(gold).flatMap(([rarity, skills]) => skills.map((skill, i) => [`ranger/${rarity}/G${i + 1}`, skill] as const)),
])

export const rangerChoreography = (id: string) => scenes.get(id)
