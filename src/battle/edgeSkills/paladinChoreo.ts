import type { Rarity } from "@/card/types"

interface Choreography {
  motif: string
  design: string
  windup?: number
  travel?: number
  delivery?: boolean
  swap?: boolean
}

const art = <M extends string>(motif: M, design: string, timing?: Omit<Choreography, "motif" | "design">) =>
  ({ motif, design, windup: timing?.windup, travel: timing?.travel, delivery: timing?.delivery, swap: timing?.swap })

const repertoire = {
  C: [
    art("sunedge", "乳白短刃从盾侧抬过半拍，在实击处先落一笔斜痕，再扣成一枚短十字", { windup: .17 }),
    art("lamp", "手灯先聚成细小灯芯，弯着走向实际受疗者，灯滴抵达后拉起实回的生命格", { windup: .11, delivery: true }),
    art("smallguard", "受护卡两侧先各露一片薄板，发盾时合上窄扣，真实受击只亮受力的一侧", { windup: .15 }),
    art("swordpress", "剑脊先压向目标，短刃平推。白色木楔贴着实际推程走，终点留下一截擦痕", { windup: .22 }),
    art("banner", "小旗扎在实际施放点，暗线标出护圈。友卡受击时只有挡到伤害的那段旗边翻起", { windup: .26 }),
  ],
  UC: [
    art("vigil", "薄蓝盾先在手中斜起，再沿队友位置飞出。到达扣住护盾，挡伤时沿来向弯一次", { windup: .14, delivery: true }),
    art("lightline", "沿同一窄带扫出青白双刃，敌侧留硬切痕，首位实回生命的友卡则托起一条软光", { windup: .27 }),
    art("cleanse", "剑尖先从敌盾上抽下真实剥掉的一层，隔一拍换另一面刃落刀，碎甲和命中各有轮廓", { windup: .18 }),
    art("shoulder", "短灯沿实回血点落在受护者身后，首推时灯架压下，亮出缩短后的实际落点", { windup: .20 }),
    art("oathshield", "一面内凹的誓盾扣回自身，只有这面盾被敌人击碎才把盾瓣向近敌反掷", { windup: .22 }),
  ],
  R: [
    art("vow", "剑击之后把三折印扣在敌人脚下。一次真实主动来袭时，印沿攻击方向分向各个受护点", { windup: .24 }),
    art("burning", "斩后给敌卡留一片金红炭签，首个实际接刀的友卡从命中点收到一条回生火", { windup: .26 }),
    art("approach", "圣骑士沿实际短步护到友卡旁，护盾只在到位后从脚印处跨到受护者身上", { windup: .12, travel: .26 }),
    art("prayer", "定点竖下十字剑，命中时从同一圆心分别压向敌卡、向实际受疗的友卡回抬", { windup: .34 }),
    art("mirrorward", "友卡肩侧扣一面斜镜，真实直击压到镜上时，反向折线从受击者飞回攻击者", { windup: .24 }),
  ],
  E: [
    art("sanctuary", "短冲走完才把地面斧锋掀起来。近敌落一排紫剑痕，友卡的回血从反向缝隙升起", { windup: .13, travel: .28 }),
    art("chain", "先落一记直剑，只有真命中点伸出回折圣链。链梢追着选定的伤员，到达后才回复", { windup: .23 }),
    art("gate", "两根紫门楔锁住同一地圈。实际入门时扣盾，首次离开时门楔从反面抬起血光", { windup: .33 }),
    art("uplift", "剑从自己脚前整圈抬起，敌人沿真实推线退，友卡脚边留下可挡一次击退的垫脚", { windup: .29 }),
    art("handoff", "受护者先得到一口血，随后一片实际盾量从圣骑士肩上拆下，沿折角扣到对方", { windup: .21 }),
  ],
  L: [
    art("circle", "金环落地分成四枚边钉，入环的友卡合出甲片，敌卡在自己的实击点亮向内压的火针", { windup: .43 }),
    art("verdict", "金剑在实际判定圆上方对焦，压到地面才击退敌人并发盾，落痕从圆心分四面裂开"),
    art("bond", "两端各扣一半誓印。受护者首次实扣血时，誓印沿两端同时回卷成各自的回血", { windup: .29 }),
    art("sideline", "一条细金轴立起来，敌人在两侧实际滑向线外，友卡的治疗沿中轴收向血条", { windup: .35 }),
    art("rally", "几片金色花冠从脚前合围，伤员亮回生瓣，结算前已满血的友卡各扣一片硬盾", { windup: .31 }),
  ],
  Radiant: [
    art("twinbeam", "两层粉白长刃前后叠起，沿真实光带同时扫过敌我，给受护友卡留下独立的足扣", { windup: .44 }),
    art("wings", "桃白翼从上方压到落点，内侧扫开敌人，外侧的羽片在友卡身上折成治疗与护甲", { windup: .48 }),
    art("swapwing", "两张卡的位置先被粉白绶带扣住，真实换位后两端各展开翼圈，交叠处只结算一次", { windup: .39, swap: true }),
    art("spear", "长枪一击留下回敬标。该敌第一次打中友卡时，先在受击点扣出护盾，再折回一束枪线", { windup: .35 }),
    art("bloomward", "大盾先以花窗扣合，实际替友卡吸下一击时，裂口把挡住的那一部分折回生命", { windup: .38 }),
  ],
  Prismatic: [
    art("accord", "持剑竖起白芯日轮，实领公约的友卡各亮一枚虹纹。受击时纹章先截光，再从该卡反射回攻击者", { windup: .55 }),
    art("horizon", "两个横向剑脊在真实光带两边合拢，虹白幕沿实际长度打开，敌方实退与友方获盾各亮一面", { windup: .57 }),
    art("dawn", "场心先垂下三面分层誓盾，落地后治疗并结甲。第一位真受击者的纹章翻出贯穿来路的回击", { windup: .49 }),
    art("doublehalo", "两座虹日轮沿真实换位路线交换正反面。到位后两端同步落斩，回生光只抬起参与交换的两人", { windup: .48, swap: true }),
    art("chorus", "每张实领联光的卡带一枚会跟随的拍点，首次手动实击时拍点在命中处翻成一圈回生合奏", { windup: .47 }),
  ],
} as const satisfies Record<Rarity, readonly Choreography[]>

export type PaladinMotif = (typeof repertoire)[Rarity][number]["motif"]

export function paladinChoreography(id?: string) {
  if (!id?.startsWith("paladin/")) return
  const [, rarity, slot] = id.split("/")
  return slot?.startsWith("A") ? repertoire[rarity as Rarity]?.[Number(slot.slice(1)) - 1] : undefined
}
