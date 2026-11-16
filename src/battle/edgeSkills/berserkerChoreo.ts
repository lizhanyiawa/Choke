import type { Rarity } from "@/card/types"

interface Choreography {
  motif: string
  design: string
  windup?: number
  travel?: number
  line?: boolean
}

const art = <M extends string>(motif: M, design: string, timing?: Omit<Choreography, "motif" | "design">) =>
  ({ motif, design, windup: timing?.windup, travel: timing?.travel, line: timing?.line })

const repertoire = {
  C: [
    art("chop", "厚刃斜抬半拍，在实际受击点落成一条深斫痕，刀背只弹起一次", { windup: .16 }),
    art("hack", "短斧贴地侧扫，受击点与实际推距之间留一条分节擦痕", { windup: .13 }),
    art("answer", "收刀横在身后待用，真正挨到近身直击时沿来袭的反向回斩一刀"),
    art("pounce", "一高一低的两步刻跟着实际短冲，落点的鞋印踩平后刀锋才扫开", { travel: .20 }),
    art("numb", "抚平实回的血格后在手边扣一枚短火种，下一记普攻命中时把它压灭"),
  ],
  UC: [
    art("siphon", "镰口由外向内咬合，只沿实际扣血点抽回一缕红线，抵手后碎成回血刻", { windup: .18 }),
    art("scar", "爪痕留在命中的敌卡身侧，随它移动。下一拍从旧裂口向两边绽开", { windup: .15 }),
    art("roar", "先向胸口收束，刃口从脚下绕一整圈，命中者各自回流一枚热签", { windup: .21 }),
    art("hook", "短斧背后的勾尖先露出，真实牵引落点拉出两节打滑的斜齿", { windup: .18 }),
    art("shoulder", "两片粗甲相扣，上肩后保留一枚推楔，普攻实际追加击退时沿推向崩开"),
  ],
  R: [
    art("bloodprice", "出手先在自己脚边扣掉一格，滴痕挂上重刃。落刀与敌卡真正滑行的尘线分两拍", { windup: .25 }),
    art("redline", "血价点亮整条窄带的头端，逐段烧到远端。命中后再沿实际推向甩出单向赤痕", { windup: .24 }),
    art("wound", "留有近期实伤时，旧伤折成一枚刃齿并入同一刀。两种刀痕和命中形状能一眼区分", { windup: .20 }),
    art("hookdrop", "倒挂的钩斧跟随真实跳步，落点先插三枚钩尖，再沿每个敌人的实拉路线收索", { travel: .26 }),
    art("triage", "沿实际缺口补起一段生命刻线，备用的钩形推楔在下一记普攻把目标推出时抬头"),
  ],
  E: [
    art("wheel", "原地先掠过半扇紫刃，隔一拍后在同一中心反向扫第二扇，末圈的落点各有推痕"),
    art("needle", "刀脊从近到远沿窄线亮起，仍在场的最远受击者独自吃到末端楔推", { windup: .23 }),
    art("fracture", "定点圆从外向内合拢，最后一拍由内圈向外碎开。只有中心实际击退处挂飞片"),
    art("flank", "狂战士从实走的侧边切入，斜轨在落脚后折成一记反向侧劈", { travel: .26 }),
    art("grit", "药线闭合后留下交叉带，下一记直击被挡掉一部分时，交叉带沿来袭压紧并断开"),
  ],
  L: [
    art("breach", "冲锋身侧撑出金红长刀脊，刀脊随实际走过的路伸长。到位后沿线两侧分开敌卡", { travel: .30, line: true }),
    art("crater", "斧柄沿真实冲步先抬高，落脚时从坑心推出不齐的石片和实际推痕", { travel: .32 }),
    art("armorbreak", "第一拍敲盾，只有真的剥下护盾才碎甲。隔一拍的重刃另留一道与碎甲方向不同的裂线", { windup: .23 }),
    art("backedge", "金边沿正向窄带扫出，远端翻面，反刃沿同一带折回。去程与回程使用两种方向可读的刃形", { windup: .20 }),
    art("converge", "半圈宽镰贴地展开，每一个命中点各牵回一条流线，线头在斧柄汇成一次回血", { windup: .24 }),
  ],
  Radiant: [
    art("boil", "实回生命后先向外推一圈热浪，火种留在持刀侧。强化普攻发出时展开实际扇形红刃"),
    art("wildfire", "火舌从真实起步点一路追随狂战士，到位后整段火迹从尾向首烧尽并回一口血", { travel: .32, line: true }),
    art("rimrage", "斧尖从场内划向界外敌人，界线只在真实交点断开，确实吸到回血才有回折的热线", { windup: .25 }),
    art("pulseaxe", "第一拍把内弧压在脚下，第二拍随狂战士新位置反向打出脉冲，放开真实的外推"),
    art("emberwatch", "回复时在脚边续三根热斧齿，第一次跌过血线时让齿从实际站位开成锯形反震"),
  ],
  Prismatic: [
    art("trinity", "三段真实换侧各有不同刃口。第一段压入、第二段横折、第三段宽刃从实际落脚侧砸下，逐刀回收实伤", { travel: .16 }),
    art("crossfire", "两组折片沿各自判定轴合进十字，交点合出棱彩核。只在实际双线覆盖者身上打出双纹"),
    art("frontier", "整条刀锋沿真实冲锋带展开，受击者真正越界的交点才劈开虹色界锁并回流回血", { travel: .35, line: true }),
    art("furnace", "厚焰从手边抬起再抛出可见火团，命中后把实际吸回的火拆成生命与溢出护甲两层", { windup: .18 }),
    art("laststand", "待用时脚下留一段百分比刻线。伤害真正被钳在血线时虹闸合住，白芯扇刃从实际周围反打"),
  ],
} as const satisfies Record<Rarity, readonly Choreography[]>

export type BerserkerMotif = (typeof repertoire)[Rarity][number]["motif"]

export function berserkerChoreography(id?: string) {
  if (!id?.startsWith("berserker/")) return
  const [, rarity, slot] = id.split("/")
  return slot?.startsWith("A") ? repertoire[rarity as Rarity]?.[Number(slot.slice(1)) - 1] : undefined
}
