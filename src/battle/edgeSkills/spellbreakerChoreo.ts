import type { Rarity } from "@/card/types"

interface Timing { windup?: number; travel?: number }
const art = <M extends string>(motif: M, design: string, timing: Timing = {}) => ({ motif, design, ...timing })

const repertoire = {
  C: [
    art("shieldpick", "细刀先挑出真实剥掉的盾层，断口停半拍，第二刀沿缺口切进卡面", { windup: .16 }),
    art("pinpoint", "手中三根短准线收向一点，针刃在真实接触处打出紧凑的白色星钉", { windup: .19 }),
    art("crosscut", "一片横刃贴地扫过窄带，遇到实际蓄力者便把预警中线切成两截", { windup: .24 }),
    art("chisel", "钝侧先敲到敌人外肩，细凿从护甲刻度上刮下一角，缺口随破甲保留", { windup: .21 }),
    art("waveglass", "向内凹的白玻璃扣在身前，实际敌技压上时薄片先弯后卸力", { windup: .23 }),
  ],
  UC: [
    art("sunderchant", "蓝色长尺从敌方蓄力圈一侧划过，命中时剪断正在变亮的咏唱刻线", { windup: .28 }),
    art("cutoff", "低位刃线扫过敌脚，在实际命中者脚后留半个声环，下次开始移动时声环拖长并减速", { windup: .27 }),
    art("blademark", "窄刀翻面留下一枚斜蓝刃印，敌人的下一次普攻沿印口失去一截锋线", { windup: .24 }),
    art("returnveil", "两片蓝幕从受护卡肩侧斜拉到正面，真正挡下敌技时沿来向对折", { windup: .22 }),
    art("wedgejump", "蓝白短楔沿真实冲刺路线低掠，到位后楔头砸成三块，盾碎从落点内侧翻起", { windup: .14, travel: .26 }),
  ],
  R: [
    art("etch", "刻刀绕实际敌卡外缘转过半圈，留下三段有缺口的蓝紫护甲刻线", { windup: .28 }),
    art("rivets", "三枚长铆钉在判定圆上错拍压低，落地同拍击敌并咬掉各自剩余盾层", { windup: .43 }),
    art("refraction", "受护点竖起一面斜纹镜，远程直击在镜面压出折角，回击从受击位置返回攻击源", { windup: .27 }),
    art("delayseal", "敲下刻有空格的震令签，敌人下一次尝试蓄力时把待亮的一格向后挤开", { windup: .29 }),
    art("foldblade", "窄带先亮折痕再整片弹开，敌人沿各自实际推程滑开，首敌的蓄力线被剪断", { windup: .32 }),
  ],
  E: [
    art("curtain", "挥出的刃线展开紫色竖帘，敌技穿过时只在真正交点压出折纹，接住一次后收帘", { windup: .37 }),
    art("cutanchor", "紫色切面落在圈内，把正在蓄力者脚下的准星抓向中心，到真实终点拆掉预警", { windup: .42 }),
    art("hollow", "空心盾沿卡的边缘套起，自己的盾被打穿时空洞反转，缺口对着原攻击者闪出返光", { windup: .31 }),
    art("misprint", "斜刻刀划掉敌人半段谱线，下一招冲刺真正开始时，长轨收短成实走的轨迹", { windup: .34 }),
    art("unspool", "刃波沿长带向外翻卷，被实际剥下的增益化成各自一段脱落的纸条", { windup: .38 }),
  ],
  L: [
    art("padlock", "两枚金扣从反方向咬住敌方技能刻度，下一次尝试蓄力时扣住空拍，延后再松开", { windup: .42 }),
    art("pressmat", "金色重楔压进大圈，圈内敌阵的真实中心被钉出缩短后的余辉，随后按剩余时限熄灭", { windup: .47 }),
    art("deflector", "友卡侧前方支起斜金幕，敌技撞上后幕沿转向实际攻击者，把近处攻击者推离受护点", { windup: .35 }),
    art("armorlane", "金尺沿长带先开槽，第一名实击者被凿开护甲，第二名沿另一路硬刃推出", { windup: .41 }),
    art("sidestep", "起点先落一记中断斩，再沿真实后撤路线拖出反侧刃，退到终点时盾板才合上", { windup: .25, travel: .28 }),
  ],
  Radiant: [
    art("reverseScore", "反写的桃白谱线扣在敌方出手刻度上，下一招实际来袭时全招被折弱，第一道返光沿来路刺回", { windup: .46 }),
    art("clearcut", "桃白大切面在落点交叉合拢，真实打断的刻线碎开，近处友卡从切面背后领盾", { windup: .49 }),
    art("doubleRebuttal", "两层粉白偏振膜护住友卡，敌技撞碎外层后，内层在攻击源处向近敌折出一圈短浪", { windup: .40 }),
    art("offbeat", "桃白谱点沿圈内铺开，敌人实起蓄力时该脚点被一枚横闩扣住半拍，蓄力刻线继续走", { windup: .45 }),
    art("borrowScore", "剑尖抽走敌人实际存在的增益，剥下的谱条绕一个折角变成最低血友卡的肩盾", { windup: .41 }),
  ],
  Prismatic: [
    art("blankbeat", "大白圈从落点内侧展开，圈内敌阵和召唤实体沿原轮廓折成彩片，留一拍空白后只剩真实命中痕", { windup: .95 }),
    art("erasure", "两根虹白刃脊在长线两侧错开，整条光带逐段抹过去，实际被清除的阵心留下短暂白缺口", { windup: .59 }),
    art("antiphase", "暗面的棱镜盾先合上六片边缘，自己的盾实吸收敌技后暗面翻亮，按实际吸收量折回一束细虹光", { windup: .48 }),
    art("scorelock", "宽大的彩谱框落到沙盘，先剪断当前蓄力，之后每个首次尝试起招的敌人各留一个被锁住的空格", { windup: .58 }),
    art("scatterseals", "几把虹刃在落点合成向内的星缝，真正剥下的敌印向外碎开，友卡在另一侧各扣一枚护片", { windup: .56 }),
  ],
} as const satisfies Record<Rarity, readonly (Timing & { motif: string; design: string })[]>

export type SpellbreakerMotif = (typeof repertoire)[Rarity][number]["motif"]

export function spellbreakerChoreography(id?: string) {
  if (!id?.startsWith("spellbreaker/")) return
  const [, rarity, slot = ""] = id.split("/")
  const entry = slot.startsWith("A") ? repertoire[rarity as Rarity]?.[Number(slot.slice(1)) - 1] : undefined
  return entry ? { windup: 0, travel: 0, ...entry } : undefined
}
