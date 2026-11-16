import type { Rarity } from "@/card/types"

interface Timing { windup?: number; travel?: number; delivery?: boolean }
const art = <M extends string>(motif: M, design: string, timing: Timing = {}) => ({ motif, design, ...timing })
const repertoire = {
  C: [
    art("backstab", "手腕先低扣，短刃绕到目标背侧挑起一条白痕，背面的缺口向内收住", { windup: .16 }),
    art("thrust", "准星挤成一线，细长直刃由自己这一侧刺入，刃尖点亮后沿原路拔出", { windup: .18 }),
    art("scar", "斜切只留一条贴着敌卡移动的细伤口，延后的一拍从伤口内部裂开", { windup: .19 }),
    art("sidestep", "短刀先向内挑，角色沿实走的侧向小步绕开，旧脚点与新脚点间留下弯钩", { windup: .14, travel: .18 }),
    art("retreat", "刃口从贴身点向外拔出，角色朝主目标反向退开，最后一块擦痕停在真实脚点", { windup: .17, travel: .20 }),
  ],
  UC: [
    art("sideflash", "先标合法侧点，两片蓝影在旧位合拢，再从实际新侧点横剪敌卡", { windup: .20, travel: .18 }),
    art("shadowrush", "刀尖贴地拉一段蓝黑滑轨，随真实冲刺走到末端，再从落脚处扇开三枚短刃", { windup: .16, travel: .23 }),
    art("foldedknife", "折柄匕首飞入目标外沿，留下半枚蓝折角；敌人真的走到新位置时折角再合一刀", { windup: .20, delivery: true }),
    art("stopneedle", "逆向尖刃扎在实际移动路线前方，截停成功才用横钉截住剩余脚线", { windup: .22 }),
    art("mask", "两半薄面从左右盖住轮廓，脚点始终保留；待选锁定圈从面边滑开", { windup: .24 }),
  ],
  R: [
    art("brokenbeat", "轻刺在敌侧留下缺口拍签；队友真实出手方向接上拍签，额外推程再从命中点伸长", { windup: .25 }),
    art("returningdagger", "双刃匕首先正飞，越过目标后翻面；回来的短弧从另一侧落第二个接触点", { windup: .24, delivery: true }),
    art("crossshadow", "原位影像被拉成前后两层，真实身位越到敌人远侧，后层折回时才落刀", { windup: .23, travel: .24 }),
    art("sightmark", "刀口钉下一枚偏心准星，另一友卡命中时准星收紧，针刃沿队友来向补进缺口", { windup: .26 }),
    art("windreveal", "一刀割断真实蓄力线，再沿主目标反方向退出，预警碎片留在原处慢慢落下", { windup: .25, travel: .22 }),
  ],
  E: [
    art("shimmer", "紫刃斜掠过卡侧，出刀者的轮廓裂成两片错位薄影，实心脚点继续显示位置", { windup: .29 }),
    art("shadowpin", "三枚紫钉先压进实际埋伏区；敌人进入时对应方向的钉突然翻起，扣住真实停脚处", { windup: .31 }),
    art("seamrun", "窄长刀缝从近处向远端切开，遇到首个实际命中者便折成一条侧滑路径", { windup: .30, travel: .25 }),
    art("conceal", "交错的紫布沿卡边闭合，把强化短刃藏在身侧；普攻真正打出时再翻开那片布", { windup: .28 }),
    art("offhand", "离手刃钉中后把影子留在命中原点，第二把匕首沿标出的原点落下，敌人可走开", { windup: .28, delivery: true }),
  ],
  L: [
    art("deathchase", "金刃沿目标血线下压，出手前已低于阈值时先亮第二刃脊，命中落成双层斩口", { windup: .38 }),
    art("chasecircle", "金色追迹圈贴住刚被推的敌人，刀尖顺真实落点追到，符合条件时反向补一段折锋", { windup: .34 }),
    art("fallingneedle", "几根长金针悬在固定落区上方，按预告收向地面，实际打断者的蓄力线被针脚穿断", { windup: .16 }),
    art("backmark", "反握匕首沿低弧飞出，留下金色背手印；队友真正推动目标后，印沿该推向反转并追击", { windup: .33, delivery: true }),
    art("wrappedstep", "金影沿真实接近路线收窄，到近侧脚点后先落一刀，残影从脚边卷成护片", { windup: .28, travel: .26 }),
  ],
  Radiant: [
    art("turnaround", "起点留清楚的回程影，贴身第一刀短促落下；稍停后沿真实回路横拖宽刃，刀光最后收回起点", { windup: .25, travel: .24 }),
    art("mirroredge", "第一片桃白刃掠过近侧，另一侧的倒影反扣，隔一拍形成方向相反的双切面", { windup: .32, delivery: true }),
    art("bordercut", "一条长桃白切面先沿场内铺开，各个实际命中者脚下另亮朝最近边线的推向", { windup: .43 }),
    art("borrowstep", "友卡旁先亮可抵达的接应位，角色沿真实路线靠近，到位再合友盾并切开脚边近敌", { windup: .32, travel: .30 }),
    art("blankstep", "白粉刀尖穿断咏唱，断线折成两层薄影盖住自身，最后在实心脚点上合出护片", { windup: .39 }),
  ],
  Prismatic: [
    art("boundaryexec", "两道隔场虹刃在目标两侧各自起拍，先交错浅切，再由场心向外张开末刃，越界交点才亮起断岸光", { windup: .12 }),
    art("doubleedge", "第一把宽虹刃正向穿过，另一端保留反握的刃影；第二拍沿反向长切面返回并推出实际落点", { windup: .36, delivery: true }),
    art("windshear", "两面巨大白刃悬在固定区域的两侧，沿预告剪合；最靠近中心的实际敌人独自吃到中缝细刀", { windup: .12 }),
    art("shadowpit", "重刃在真实命中处钉出一块凹影阵，只有原目标被队友从外面推回时，阵边才翻成收紧的刃门", { windup: .46 }),
    art("shoreward", "刀光从场内切向目标，真实推程和边线交点各留一段虹痕；原本就在界外的命中才把尾刃折回近友护盾", { windup: .44 }),
  ],
} as const satisfies Record<Rarity, readonly (Timing & { motif: string; design: string })[]>

export type AssassinMotif = (typeof repertoire)[Rarity][number]["motif"]
export function assassinChoreography(id?: string) {
  if (!id?.startsWith("assassin/")) return
  const [, rarity, slot = ""] = id.split("/")
  const entry = slot.startsWith("A") ? repertoire[rarity as Rarity]?.[Number(slot.slice(1)) - 1] : undefined
  return entry ? { windup: 0, travel: 0, delivery: false, ...entry } : undefined
}
