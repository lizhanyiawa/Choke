import type { Rarity } from "@/card/types"

interface BulwarkChoreography {
  motif: string
  design: string
  windup?: number
}

const art = <M extends string>(motif: M, design: string, windup?: number) => ({ motif, design, windup })

const repertoire = {
  C: [
    art("lockplate", "两扇白钢护板在脚前合缝。护盾受击时裂纹沿来向刻进钢板，破裂时最后一段扣片弹开"),
    art("mantle", "两片半透明夹板贴住身侧。第一击压扁夹板，底部的回气刻线把生命抬回去"),
    art("pauldron", "前臂小盾顺一条折线扣到友卡外肩。来袭点压亮凸沿，只在格挡用掉时向内翻转"),
    art("rimstrike", "先横持白钢盾缘，再沿单一方向扫中。被推者后方扫出的粉尘沿实际滑距拉开", .18),
    art("rivets", "三个铆眼从下向上扣紧，血线沿同一路径回升。站定的额外一口在末端扣第四枚钉"),
  ],
  UC: [
    art("wedges", "两枚斜楔从两侧插地。被推时楔尖只亮受力侧，实际落脚和被吃掉的推距用两段不同的刻线标出"),
    art("shieldstep", "斜持的蓝盾伴随真实短滑跨出。滑行途中留下两片擦痕，到位时蓝盾横扣"),
    art("catchstrap", "肉坦先扣小甲，再把狭窄皮带接到友卡肩上。命中时冲击分成较细的回传和受护者的一截余波"),
    art("anvil", "沿真实窄线敲下三节横铆片，最后一节落下才震出整条推线", .23),
    art("axle", "半圆轴扣翻正时回一口血。第一次受推后锁销脱出，短扇沿着实际受力方向散开"),
  ],
  R: [
    art("barbs", "肩部伸出两排可见的金属棘簧。真实反击时先弹一束楔刺，每次收掉一根待用棘簧"),
    art("stakes", "钉脚沿圆周向内收成一圈。敌人第一次走入时，只把临近几枚钉打进脚下"),
    art("cracked", "片甲以一条纵缝扣住自身，裂纹累积到断盾时，锯齿钢片沿圆周外翻"),
    art("twochocks", "友卡脚边压两枚蓝紫止退楔。每吃掉一次击退，就从被压的一侧抽走一枚"),
    art("stomp", "一脚压出错位地砖。外圈地砖向外顺次跳起，尘浪从每个实际命中点贴地推开", .21),
  ],
  E: [
    art("drum", "双手架鼓，沉环扫到谁就照出谁。被选中的两张敌卡各牵一条绷线，真正转火时绷线甩向肉坦", .24),
    art("portal", "紫色门柱钉在圈沿。友卡过门时由最近一侧拉下门叶，盾扣到这张卡脚边"),
    art("seal", "刃口压出一枚紫红钳印锁住敌方前手。一次对其他队友的攻击被压弱后钳印在两者之间折断", .23),
    art("handoff", "从真实剩余盾切出半片护甲，折过一段硬折线扣到友卡身侧。原持有者同时变薄", .18),
    art("muffle", "脚下先收进低压三角，随后崩开内外两道地缝。内圈只有在冲撞被实际打断时才闪一记白缝", .26),
  ],
  L: [
    art("bracewire", "双端金属扁带先搭起带滑轮的长护索。来袭在友卡端分流，粗金线向肉坦回收，细线落在原目标"),
    art("twinhull", "两块船舷盾用一根金弦合拢。先碎的一端释放向另一端的修复航迹，之后金弦落下"),
    art("spareplate", "待叠甲片先在现存盾外绕行。实际受盾者不同，甲片也改成贴身扣合或向旁侧递出"),
    art("rampart", "短金墙的垛口沿判定圈逐块升起。接住第一击时墙垛内弯，返震指向真正的攻击者"),
    art("breach", "整扇斜金盾沿窄道架起，再像攻城铲向前合。打断位置裂成两半，自身随后扣回短甲", .27),
  ],
  Radiant: [
    art("phalanx", "五段粉金盾面跟着肉坦移动，外缘留下三条短行军纹。接住来袭时只在受益友卡的朝向亮一段盾沿"),
    art("wake", "随行盾在友卡落脚前留一条贴身粉色折纹。普通移动确实到位后，旧位到新位的路面被掀成两侧扇甲"),
    art("shoulders", "三面错开的肩盾随肉坦行进。友卡各自首次受击时，近侧盾抬起并将回弹钩送回实际攻击者"),
    art("overhead", "地面先出现四角下坠标，厚盾以俯视短投影压进目标圆。着地那帧将实命中的卡逐张震开"),
    art("shore", "从界内向界外铺短折梯，边线交叉处压亮。桃色救援盾围在界外受护者，抵掉一次真实推击"),
  ],
  Prismatic: [
    art("citadel", "象牙城门先开，再立十二段墙。以共享盾余量渐次熄灭城墙，真实挡伤从来袭点沿内沿折光"),
    art("bastions", "左右两垒按真实落点各自翻出虹白角。中间交叠区收成双弧，一张卡只触发一次，入垒端亮起"),
    art("seawall", "先在整条受击带内铺三折虹脊，推开命中目标后原地留下折墙。第一次穿线伤害由实际交点劈开墙段", .34),
    art("accord", "先在远端扣半透明长盾。真正分担时索上出现双扣分叉，远端只留细脉，另一道粗波沿索回到肉坦"),
    art("island", "内陆先升起浅银地台，外缘数段虹堤合成一圈。震波向敌方扩张，同圈友卡脚下立起抗推堤口", .33),
  ],
} as const satisfies Record<Rarity, readonly BulwarkChoreography[]>

export type BulwarkMotif = (typeof repertoire)[Rarity][number]["motif"]

export function bulwarkChoreography(id?: string) {
  if (!id?.startsWith("bulwark/")) return
  const [, rarity, slot] = id.split("/")
  if (!slot?.startsWith("A")) return
  return repertoire[rarity as Rarity]?.[Number(slot.slice(1)) - 1]
}
