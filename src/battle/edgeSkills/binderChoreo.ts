import type { Rarity } from "@/card/types"

const art = <M extends string>(motif: M, windup: number, design: string) => ({ motif, windup, design })

const repertoire = {
  C: [
    art("rimeCuff", .17, "几枚细霜爪在敌卡脚边咬合，开口随受限步伐拖出短冰痕，减速结束后从原脚点碎开。"),
    art("cordDart", .18, "短钩先从施术者手边飞出，钩头抵达才绷直绳芯，敌卡沿绷紧的线被拉向实际落点。"),
    art("iceTiles", .24, "窄白冰纹从落点织成错位的三角格，真正踩在面上的敌人各带走一角冰片。"),
    art("stepKnot", .19, "一枚双折步印扣在敌卡后跟，下次迈步时旧箭尾断开，实际短步的终点落下一枚碎扣。"),
    art("cuffWard", .22, "两片薄霜甲从两肩合住，近处攻击实际落在受护者身上时，一根短刺带着冰丝逆向飞回。"),
  ],
  UC: [
    art("fixedTether", .24, "锚扣钉在命中时的敌方脚点，细丝越走越直，跨到实际圆边才断开并留下收脚点。"),
    art("shoreHitch", .26, "最近边线一侧亮出三枚斜扣，从该边向场内收紧，牵引方向与地上蓝尺平行。"),
    art("printLock", .29, "空印由两对脚趾状折片守住圆区，第一名敌人接触时折片跳到它脚下扣紧。"),
    art("zipLine", .31, "两条交错链齿沿长带拉开，敌人从各自侧面被拽向中轴，每根短链落在真实终点。"),
    art("mistPane", .28, "六片半透明雾板在落点折成扇面，敌侧冰棱压低，友侧雾缘翻到实际受盾者身上。"),
  ],
  R: [
    art("windSpool", .34, "四列低位风梭绕过圈边再向内抽紧，敌人脚下各有一条随实际牵引距离收短的线。"),
    art("splitReins", .36, "落点左右各翻出一枚鞍扣，两束交错短绳分别找到各自一侧的敌人，最多两条。"),
    art("ballast", .28, "一个链坠在受击者脚边悬住，受推时余程先被截掉，等原推程落地才由链坠砸出第二口伤害。"),
    art("burstWheel", .31, "中心的闭涡先缩一下，再分四片曲刃扫向圆缘，实际敌卡的外推脚线穿出涡片。"),
    art("shear", .30, "窄带的横风掠过后，一道斜闩只压在首名实走敌卡的脚点，原来那段步迹折在闩外。"),
  ],
  E: [
    art("paperFold", .40, "长带两边的折痕逐步压向中线，敌人下次发出长步时，原路线像折纸一样在短落点处扣起。"),
    art("lostStep", .35, "一圈断脚印固定留场，敌人真正走出时，圆边缺掉的一块接在它脚后等待下一步。"),
    art("inwardRail", .39, "两道斜箭在长线里交错，实际改向的敌卡脚边先露出原推箭，再折向沙盘场心。"),
    art("iceJaws", .55, "两列紫白霜闸沿真圆的两侧逼近，在预警结束的那拍合咬，冷锋跟着实际受限者留在脚侧。"),
    art("relayCuff", .34, "窄肩甲斜架在友卡外侧，第一道合格来袭把一枚紫色楔锁从受护者位置甩向攻击源。"),
  ],
  L: [
    art("shadowPlate", .36, "金色影盘刻下第一次命中的位置，一秒内旧影逐格填满，停在影里的原敌人才被纵扣锁住。"),
    art("oldAnchor", .39, "一座带刻度的金锚留在出手脚点，原敌尚近时，第二拍的索从旧锚收紧，到近侧刻线即停。"),
    art("turnstile", .41, "金色多段窄门围住判定区，敌卡首次走出时仅脚下门扇翻转，余门继续守各自的出圈口。"),
    art("sinkBasin", .62, "同心金板先后下沉，外层把敌人拖向凹底；实际收进内圈的敌人才被中央锁钉扣住。"),
    art("crossWind", .42, "一圈风窗沿两条相反斜槽打开，外侧风叶赶走敌卡，内侧金膜折成友卡各自的盾。"),
  ],
  Radiant: [
    art("pivotGear", .46, "轴心先升起一片桃白齿盘，受推时只亮起该敌对应的径向齿口，并把新箭钉在真实推程上。"),
    art("slantTide", .48, "弧潮在圈内存一拍扭力，首个合格推程发生时沿原箭转过六十度，余弧顺新终点泼出。"),
    art("coupled", .43, "两名实际相扣的敌人之间形成一条悬空双绳，任一端被击退后，两端各亮一段同方向轨迹。"),
    art("foldPlate", .41, "一排错开的桃白板沿长带侧翻，向左扫出的真实推线并排落下，第一张敌卡还留一枚缺角步印。"),
    art("windExchange", .45, "同一个风圈里内层桃白风带向前，外层冷纹逆行，加速和减速脚印分别跟住正在移动的两边。"),
  ],
  Prismatic: [
    art("gravityDisk", .45, "宽大的虹白等高线从圆缘坍向中心，敌卡沿自己的牵引坡道下滑。存续时只在外逃的脚点升起逆流格。"),
    art("binaryWell", .55, "两座分开的浅棱井各自打开井壁，重叠处留一条干净的分界线，每个敌人只被更近的一座井收走。"),
    art("inverseField", .90, "四块倾斜镜片把场心留空，外推箭穿过镜缘时翻折成内向牵引，真实落点合出一枚反向菱片。"),
    art("retreatSeal", .49, "一半虹线折进敌人的短步印，另一半拉出友卡脚下的稳步楔；折步和抗推各在真正使用时散片。"),
    art("pressurePin", .57, "两列刻度沿长线急收成细针，最远接触点的针头钉在旧脚印上，第二拍从那里压低半径内的牵引圈。"),
  ],
} as const satisfies Record<Rarity, readonly { motif: string; windup: number; design: string }[]>

export type BinderMotif = (typeof repertoire)[Rarity][number]["motif"]

export function binderChoreography(id?: string) {
  if (!id?.startsWith("binder/")) return
  const [, rarity, slot = ""] = id.split("/")
  if (slot.startsWith("A")) return repertoire[rarity as Rarity]?.[Number(slot.slice(1)) - 1]
}
