import type { Rarity } from "@/card/types"

interface Timing { windup: number; travel?: number; delivery?: boolean }
const art = <M extends string>(motif: M, design: string, timing: Timing) => ({ motif, design, ...timing })
const repertoire = {
  C: [
    art("spark", "细炭屑绕掌压成一枚偏心火籽，沿弧线飞出；接触时先收成亮芯，再展开三瓣短焰", { windup: .18, delivery: true }),
    art("closeflame", "脚边六瓣短白火先向内伏低，再由近及远翻开；推移箭尖从各个真实接触处伸出", { windup: .22 }),
    art("frost", "一根窄霜棱在掌前拼合，旋转飞出；命中后裂成不对称冰角，慢速脚线留在目标脚下", { windup: .20, delivery: true }),
    art("cinderfall", "固定落点上方吊起一撮炭屑，细柱指向投影；炭屑坠落后碎成低矮灰扇", { windup: .08 }),
    art("firestep", "原脚点留半枚燃着的脚印，角色沿真实短步挪开；到位后旧脚印才从内向外燃穿", { windup: .14, travel: .22 }),
  ],
  UC: [
    art("ember", "一块带两道炭缝的火核飞入敌卡，两枚待燃炭片贴住目标；每次真灼烧各点燃并消掉一枚", { windup: .23, delivery: true }),
    art("heatline", "两根导热线在脚前合拢成窄长蓝白切缝，首个接触点另折出一枚向前顶的热楔", { windup: .30 }),
    art("icecrown", "圆边五枚冰柱依次从地缝升起，内侧的霜齿向中心扣住；受影响目标脚边留独立冰角", { windup: .34 }),
    art("arc", "三节电珠按折线飞到首敌，实际命中后另一条短电鞭才转向附近第二敌，两个接触点分拍炸亮", { windup: .21, delivery: true }),
    art("flameward", "两块折面炉壳绕卡身合拢，受击在来向裂出炭缝；自己的壳被真正击碎才向外翻成火瓣", { windup: .27 }),
  ],
  R: [
    art("thunder", "地面先伸出一根断续引雷导线，雷头从近端逐节连通；首敌脚下的叉齿沿真实推程展开", { windup: .36 }),
    art("frostburst", "落区的薄冰穹顶向内结晶，收紧后从中心撑碎；霜片沿每名受击者的径向推出去", { windup: .10 }),
    art("twinspark", "第一颗火星拖长细尾，第二颗留在手边绕半圈，延后独立发射；两次飞行与爆点各占一拍", { windup: .26, delivery: true }),
    art("stormmine", "三角雷钉埋进固定圆区，间歇电线贴地伏着；敌人踏入时只有它脚下的钉簇竖起并剪断蓄力", { windup: .31 }),
    art("hotscythe", "一条扁热镰贴地横过光带；命中已有炭火的敌人时，镰口内层另外亮起一圈咬火齿", { windup: .33 }),
  ],
  E: [
    art("meteor", "一块有层状裂缝的紫橙陨体悬在固定影区上方，逐渐压低；砸落先压出暗坑，随后碎石沿真实推向飞散", { windup: .12 }),
    art("firering", "一条缺口火环先伏在地面，中央先亮薄焰；外缘的火墙独立向外翻起，清楚分开伤害区与推移边缘", { windup: .12 }),
    art("crossbolt", "第一条紫雷带先由纵向穿入，第二条横带隔一拍从两侧合上；两段都接触的目标处单独迸出交点结晶", { windup: .34 }),
    art("movingash", "第一口紫炉在旧点喷火，炉芯沿朝场心的短滑条搬向第二点，落稳后炉口再次向上打开", { windup: .30 }),
    art("firecoat", "脚下火层向外抖开推离近敌，剩余三块热片沿卡身翻起成为盾；受击时对应热片内弯", { windup: .35 }),
  ],
  L: [
    art("lattice", "两道金雷从十字四端同时推进，交点上方悬一枚空心晶核；四端闭合时晶核落进十字眼，交点伤害另闪一拍", { windup: .12 }),
    art("comet", "一颗金色彗核沿固定长线疾驰，狭长尾焰依次扫过沿途；真正飞到末端才开出一枚圆形尾爆", { windup: .28, travel: .40 }),
    art("boundaryfire", "宽阔火盘先压低一侧，朝每名受击者最近边线竖起不同方向的金火帆，火浪顺各自推程倒下", { windup: .16 }),
    art("reflectionbolt", "第一道金雷在原圆区落下，最靠外缘的实际受击者头顶留倒挂雷镜；第二道雷跟到该目标真实位置再落下", { windup: .35 }),
    art("goldtrap", "六枚金色细框在固定阵地内扣成透空地印，保持低亮；每个新进入者脚下各翻一枚金钩，阵地保留清楚的外边", { windup: .40 }),
  ],
  Radiant: [
    art("firestorm", "三层桃白星盘错相悬在同一落区，按三次真实结算逐层坠下；每轮使用不同旋转角，第三轮把剩余碎星向外掀开", { windup: .12 }),
    art("sandwheel", "环形砂刃先平伏转动，中心火芯压亮后，外缘轮齿翻成斜立的桃白扇叶；只有边缘受击者接上推轨", { windup: .17 }),
    art("starcloud", "旧星云先开一轮软边星爆，随后整团沿锁定短路径平移；新中心落定时散开第二轮更宽的星瓣", { windup: .35 }),
    art("roadbreak", "一排桃色断路柱按施术方向先后合闸，宽雷带撕开后留下真正附在受击者脚边的断尺，下一步走出时尺子折短", { windup: .46 }),
    art("flamecurtain", "一面桃白火帘从圆区下缘升起，敌侧翻出锋利火舌，友侧分离成弯曲护片；护片只落到实际受盾者身边", { windup: .45 }),
  ],
  Prismatic: [
    art("fault", "白紫地壳分成错层大板向上顶开，每个首波真实命中点留下独立裂口；下一拍各裂口喷出虹白晶柱，重叠处不重复结算", { windup: .16 }),
    art("starfallring", "两道倾斜虹环从高处套落，外环标出击退边界，中心小环标出重击区", { windup: .16 }),
    art("horizonline", "长线两端架起白虹门框，中间的窄缝逐段压成一线；蓄满后沿全长掀起垂直切幕，仍保留场地与单位轮廓", { windup: .18 }),
    art("dualfrequency", "第一轮三瓣虹波打出群体接触，数条细弦再连向仍存活的命中者；第二落点锁在群体新中心，巨型共鸣晶核随后落定", { windup: .38 }),
    art("riftcurtain", "一面分成七片的虹色折幕从地面升起，敌侧沿缝爆开，友侧拆成护盾与一枚独立待用火印；友卡真实接招才让火印飞出并碎开", { windup: .48 }),
  ],
} as const satisfies Record<Rarity, readonly (Timing & { motif: string; design: string })[]>

export type WarlockMotif = (typeof repertoire)[Rarity][number]["motif"]
export function warlockChoreography(id?: string) {
  if (!id?.startsWith("warlock/")) return
  const [, rarity, slot = ""] = id.split("/")
  const scene = slot.startsWith("A") ? repertoire[rarity as Rarity]?.[Number(slot.slice(1)) - 1] : undefined
  return scene ? { travel: 0, delivery: false, ...scene } : undefined
}

