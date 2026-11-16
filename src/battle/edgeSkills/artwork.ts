import type { SubJobId } from "@/card/jobs"

// Per rarity: five actives, two gold effects, and eight passive glyphs.
// Each named row directs the windup, the path (if any), and the landing.
export const artwork: Record<SubJobId, string> = {
  ranger: `
射击 draw.feather shot.arrow flash.spark
短弓 bend.barb shot.barb shove.barb
瞄一拍 lock.eye shot.needle snap.cross
低平箭 step.feather beam.arrow slash.feather
后撤射 fold.bow shot.arrow echo.step
顺羽 flash.feather beam.arrow split.feather
撤线反光 step.arrow wave.feather fold.barb
@ eye feather cross step blade lantern ribbon arrow
---
贯穿箭 draw.arrow beam.arrow split.spark
并头箭 split.bow split.arrow cross.feather
压弓 stamp.barb shot.barb crack.plate
滑铲发箭 step.step dash.arrow slash.barb
箭垫 stamp.needle - snap.arrow
回扣箭 coil.feather cross.arrow shove.barb
哨羽 lock.needle split.feather flash.arrow
@ arrow bow barb step needle ribbon eye shield
---
折线箭 draw.prism chain.arrow snap.prism
镜折 fold.prism cross.shard fold.feather
反弧 bend.sickle return.arrow slash.sickle
推杆箭 draw.barb shot.barb gate.arrow
追脚针 lock.step chase.needle pin.needle
折线三点 split.prism chain.prism cross.arrow
反弧拒近 bend.barb return.barb shove.feather
@ prism eye sickle barb needle chain arrow step
---
爆矢 draw.bow lob.barb ripple.spark
箭束 lock.bow beam.barb pulse.feather
弹坑 coil.arrow lob.meteor crack.shard
绕点 split.eye cross.arrow echo.eye
悬针 orbit.needle chase.needle pin.eye
爆矢洄浪 coil.spark wave.barb ripple.prism
绕点截路 lock.eye cross.feather gate.arrow
@ spark barb shard eye needle banner blade arrow
---
封步索 lock.chain tether.arrow snap.chain
切路弓 bend.bow beam.blade gate.feather
重矢落地 rise.arrow rain.barb crack.arrow
返阵 draw.barb lob.arrow echo.barb
开路信标 rise.lantern tether.feather pulse.lantern
封索回扣 draw.chain return.needle fold.chain
返阵加标 stamp.feather wave.barb shove.arrow
@ chain blade arrow barb shield eye bow cross
---
追星雨 lock.star rain.star pulse.star
裂景 bend.shard split.barb crack.prism
跟锋 draw.wing chase.arrow echo.wing
掠边扫 coil.feather rain.arrow fan.barb
竖线瞄点 draw.eye beam.feather snap.bow
星雨游离 fan.star rain.feather shove.star
跟锋护返 fold.wing return.feather shield.wing
@ star spark wing barb chain loop eye cross
---
五角跳打击 draw.star star.star shatter.prism
长弦一瞬 bend.bow beam.prism snap.arrow
落日环 rise.orb rain.orb ripple.prism
倒影落箭 fold.eye lob.arrow echo.prism
平行箭轨 split.prism lanes.arrow slash.prism
第五拍折射 flash.star shot.prism shove.star
倒影重合 fold.prism cross.eye shield.prism
@ star bow loop eye arrow step fire blade
`,
  assassin: `
背刺 fold.mask dash.blade slash.blade
直刺 lock.blade shot.blade snap.needle
割痕 flash.claw - echo.claw
侧刀 step.mask dash.sickle fold.step
退刃 bend.blade return.blade trail.step
收影 fold.blade split.blade shove.mask
留空 step.needle - pin.mask
@ blade needle claw step mask eye sickle chain
---
侧闪 lock.step blink.blade slash.mask
短影冲 step.mask dash.needle trail.blade
折匕 fold.blade shot.needle pin.step
逆刺 bend.blade dash.barb snap.chain
遮面 fold.mask - veil.mask
双向侧闪 split.mask cross.blade slash.cross
停步破防 lock.step - crack.plate
@ mask eye needle chain claw step shield anchor
---
破拍 lock.cross shot.blade pin.cross
回匕 bend.needle return.blade echo.blade
对角换影 split.step swap.mask cross.blade
定点记 draw.needle shot.needle pin.needle
揭风 fold.wing dash.sickle shatter.mask
破拍侧刃 flash.cross cross.blade shove.blade
回匕牵角 bend.hook return.hook tether.mask
@ cross blade mask chain wing anchor thorn shield
---
掠影 fold.mask dash.blade veil.step
影钉 stamp.needle - pin.shard
掠线 lock.blade bend.blade crack.blade
短藏 coil.mask - veil.eye
离手刺 step.needle lob.blade snap.mask
掠影替刀 veil.mask blink.blade slash.claw
钉影接力 snap.shard split.needle pin.cross
@ mask needle blade orb step cross loop wing
---
追命 lock.claw shot.blade slash.claw
追圈 coil.sickle chase.blade ripple.sickle
倒影针 fold.eye rain.needle pin.prism
反手标 bend.blade shot.shard flip.blade
走影刀 step.wing dash.claw shield.mask
斩首余影 snap.blade split.sickle slash.spark
返手出界 flip.blade shot.barb gate.blade
@ blade loop needle chain shield cross step eye
---
回身刃 fold.step return.sickle echo.mask
映刃 split.blade cross.blade slash.prism
断行 lock.sickle beam.blade shove.step
借位 step.shield tether.mask shield.blade
空掠 rise.mask dash.wing shatter.blade
回身封角 fold.sickle return.barb gate.mask
借位护手 split.shield swap.mask shield.wing
@ step blade barb shield mask chain wing loop
---
跨界斩首 split.prism cross.blade gate.prism
双向回斩 draw.blade return.prism cross.mask
破风剪 bend.sickle split.blade slash.wing
陷影瞬返 stamp.mask blink.needle coil.chain
斩岸回护 lock.shield return.blade shield.prism
界刃回赠 fold.prism return.wing pulse.blade
岸护回光 rise.shield beam.prism trail.shield
@ gate blade wing chain shield step shard heart
`,
  warlock: `
星火 coil.ember shot.fire flash.ember
近焰 draw.fire - ripple.fire
霜弹 draw.ice shot.ice shatter.ice
落烬 lock.ember rain.ember stamp.fire
火步 step.fire dash.ember trail.ember
余星落地 stamp.ember - pulse.spark
落烬压脚 lock.fire - pin.ember
@ ember fire ice spark step eye lantern flame
---
余烬 coil.ember shot.ember tick.ember
折炎 bend.fire beam.fire split.ember
冰棱 draw.ice rain.ice rise.ice
电弧 draw.bolt chain.bolt snap.bolt
守焰 shield.fire - veil.fire
余烬分焰 flash.ember split.ember bloom.fire
心火反推 shield.ice wave.fire shove.ice
@ ember fire ice bolt shield eye step shard
---
奔雷 lock.bolt bend.bolt shove.bolt
爆霜点 coil.ice lob.ice shatter.shard
双火星 split.ember lob.fire echo.fire
陷雷 stamp.bolt - pin.bolt
热镰 draw.sickle beam.fire slash.sickle
奔雷斜折 flash.bolt split.bolt cross.bolt
陷雷回震 snap.bolt wave.bolt crack.spark
@ bolt ice star needle sickle wall step lantern
---
陨石 rise.meteor rain.meteor crack.meteor
环火 draw.loop - rise.fire
交雷 split.bolt cross.bolt cross.spark
移烬 step.ember tether.ember echo.ember
火层 coil.fire - shield.ember
陨石回潮 crack.meteor - rise.shard
环刃合口 coil.loop wave.fire slash.fire
@ meteor loop bolt ember shield gate fire spark
---
交错雷场 split.bolt lanes.bolt cross.bolt
彗线 draw.meteor beam.meteor snap.meteor
压界火 lock.fire wave.fire gate.fire
反影雷 fold.bolt chase.bolt echo.bolt
金陷 stamp.ember - grid.fire
交错成幕 cross.bolt - wall.bolt
反影牵回 fold.bolt return.bolt tether.spark
@ bolt meteor fire loop rune shard lantern shield
---
星火风暴 draw.star rain.fire tick.star
砂火风轮 coil.gear orbit.fire shatter.gear
移星云 rise.star chase.star trail.star
断路雷 lock.step bend.bolt crack.step
焰帘 split.fire wave.ember veil.shield
星暴崩边 tick.star rain.ember shove.star
移星拖尾 echo.star tether.star trail.ember
@ star gear meteor step fire gate shield ember
---
断层爆裂 lock.shard rise.meteor crack.prism
落星环 draw.loop rain.star ripple.star
翻天窄线 bend.prism beam.bolt gate.prism
双落同频 split.star rain.meteor echo.star
裂幕援火 split.shield wave.fire stamp.prism
断层重写 crack.prism - echo.rune
援火接盾 flip.fire return.ember shield.fire
@ shard loop bolt star fire eye drop ember
`,
  warden: `
盾击 stamp.plate dash.shield shove.dust
斜盾 bend.shield wave.plate slash.shield
踏前 step.shield dash.plate trail.step
掩后 fold.shield tether.plate pin.shield
拂矛 draw.needle beam.dust slash.step
断势 snap.plate - ripple.shield
落脚 stamp.shield - shield.step
@ shield barb step wall needle anchor blade flag
---
前顶 bend.plate dash.shield crack.dust
卸力 rise.shield tether.shield drop.shield
拨锋 fold.plate wave.shield shove.plate
抢落 step.eye dash.step stamp.eye
拖盾 draw.hook return.chain tether.plate
随盾而入 fold.shield split.shield shield.plate
带回半步 draw.chain return.hook cross.step
@ plate shield barb step hook shield gate flag
---
钩盾 draw.hook shot.hook tether.anchor
靠盾推 bend.barb wave.shield shove.arrow
近哨 stamp.lantern - pulse.dust
援步 step.step tether.step shield.plate
递冲 stamp.barb dash.shield pin.barb
锚盾 coil.anchor return.chain pin.anchor
掩护落点 fold.plate dash.shield shove.shield
@ hook arrow bell shield barb wall blade gate
---
横截 bend.plate beam.shield split.dust
斜门 lock.gate wave.plate gate.shield
上挑 draw.hook return.shield rise.plate
担架 step.plate dash.plate shield.step
断阵踏 step.plate dash.plate ripple.dust
分流 split.plate wave.shield cross.arrow
抛接 rise.shield lob.plate shatter.plate
@ wing gate hook plate shard chain step wall
---
救援换位 lock.shield swap.plate drop.shield
借路 step.plate cross.step cross.shield
护城斜推 bend.wall wave.shield shove.wall
带位 draw.step dash.plate trail.shield
分进 split.shield cross.shield wall.plate
换防冲击 split.plate swap.shield pulse.shield
进退有据 stamp.plate shot.shield shield.wall
@ shield barb wall step eye flag plate anchor
---
借力清场 coil.dust wave.shield shove.plate
拍回 lock.step return.plate echo.step
同屏护位 split.plate tether.shield wall.shield
截域 lock.shield - snap.loop
双横路 draw.plate lanes.shield split.wall
满场借力 coil.dust return.plate echo.shield
锁域贴边 lock.loop - gate.plate
@ dust loop shield chain plate wing flag step
---
压线 lock.gate - grid.prism
两线合围 split.wall cross.plate gate.prism
接回斜盾 fold.plate return.shield flip.shield
交点落槌 lock.cross rain.hammer crack.prism
并排换防 lock.plate swap.shield split.dust
压线回扣 snap.gate shot.prism shove.plate
双城换防 split.shield swap.prism wall.prism
@ gate hook loop cross plate barb hammer shield
`,
  bulwark: `
架盾 shield.shield - fold.plate
屏身 veil.shield - stamp.wall
护肩 fold.plate tether.shield shield.plate
盾缘击 draw.plate dash.shield slash.dust
整备 tick.gear - snap.plate
破盾回响 crack.shield - shatter.plate
肩并肩 split.plate tether.shield fold.shield
@ shield anchor plate barb heart gear fire flag
---
扎根 draw.anchor - pin.needle
移盾步 step.shield dash.shield trail.plate
接拳 stamp.chain tether.plate snap.chain
横铆 tick.plate lanes.needle wall.plate
护轴 orbit.gear - flip.plate
地钉护脚 pin.needle tether.chain tether.step
双肩接拳 fold.chain split.shield drop.plate
@ anchor shield chain barb feather plate step gear
---
刺甲 rise.thorn split.needle fan.plate
钉阵 lock.needle rise.needle grid.anchor
裂甲护身 crack.plate lob.shard shatter.shield
守前线 split.gate tether.plate tick.gate
震脚 stamp.step wave.dust ripple.anchor
棘甲接力 rise.thorn shot.plate shield.thorn
边桩 pin.anchor - gate.needle
@ thorn needle plate gate dust ice shield anchor
---
挑衅号令 draw.bell tether.bolt ripple.bell
定门 grid.gate - gate.wall
迎击令 draw.flag shot.rune pin.flag
递甲 fold.plate dash.plate fold.wall
闷雷 stamp.bell - pulse.dust
应战 tether.chain wave.bolt pulse.rune
两扇门 split.gate cross.plate fold.gate
@ bell gate rune plate step shield flag wall
---
接招 stamp.chain split.chain tether.plate
同舟 split.plate tether.ribbon shield.chain
叠甲 shield.plate shot.plate fold.anchor
回城墙 lock.wall wave.shield wall.plate
断步拦截 bend.shield dash.plate crack.wall
两肩承重 split.chain return.ribbon ripple.chain
还盾门 wall.plate wave.plate shove.gate
@ chain ribbon plate wall step spark arrow gate
---
壁垒行军 shield.wall dash.plate wall.shield
随行盾 step.plate chase.shield trail.plate
肩并盾 split.plate tether.shield tick.shield
壁上砸落 rise.wall rain.plate crack.plate
靠岸 lock.gate rain.shield shield.anchor
并肩壁垒 shield.plate - echo.wall
靠岸回响 lock.anchor wave.shield ripple.anchor
@ wall step plate gate anchor arrow eye gear
---
不落城 grid.crown rise.wall wall.prism
双垒 split.plate cross.wall fold.prism
拦海 bend.wall bend.prism wall.shard
全图接护 lock.chain tether.prism snap.plate
铸岛 draw.wall rise.plate grid.wall
城门反攻 gate.prism wave.wall shatter.crown
并命 split.chain tether.prism shield.loop
@ crown plate wall chain wave anchor shield gate
`,
  berserker: `
劈斩 bend.blade - slash.dust
短劈 draw.sickle dash.blade flash.dust
挨刀反砍 fold.claw return.blade flip.blade
贴冲 step.blade dash.step stamp.dust
止痛 draw.heart - pulse.heart
劈到头 bend.sickle - snap.blade
落脚硬斧 stamp.step - crack.sickle
@ hammer claw heart step drop blade flame wing
---
汲血斩 bend.sickle return.drop bloom.drop
撕伤 draw.claw - echo.drop
喝战 rise.bell wave.sickle pulse.blade
断钩 draw.hook bend.sickle tether.hook
厚肩 shield.plate dash.plate shove.plate
回牙 fold.drop return.claw shield.plate
余吼 rise.bell wave.dust echo.bell
@ drop claw bell hook shield cross plate mask
---
血价 pulse.drop dash.blade crack.drop
顶血 draw.drop dash.claw trail.drop
伤口转攻 lock.claw - fold.blade
倒钩跳 step.hook return.sickle slash.hook
战后补血 draw.cross return.drop rise.heart
血价反掌 shield.drop - flip.claw
聚斧 coil.sickle split.blade snap.sickle
@ shield blade drop sickle step claw eye heart
---
回旋斩 coil.sickle orbit.blade echo.sickle
直切 draw.blade beam.blade slash.needle
裂圈 split.sickle wave.shard shatter.sickle
偏锋 lock.eye bend.sickle shove.claw
咬牙 fold.claw - cross.drop
收刀外环 coil.blade orbit.sickle slash.blade
裂盾 crack.shard shot.plate crack.shield
@ loop blade shard eye claw gate plate sickle
---
破阵冲 draw.claw dash.blade split.dust
冲落 step.hammer dash.hammer crack.step
撼盾 stamp.sickle - shatter.plate
后刃 bend.sickle return.blade flip.sickle
截流 lock.drop return.heart fold.sickle
护尾重斧 step.sickle dash.plate shield.blade
折回分岔 fold.blade return.sickle shove.claw
@ blade hammer plate loop claw drop wall ember
---
血沸 rise.drop wave.fire snap.sickle
奔火 step.fire dash.fire trail.claw
怒边 lock.barb wave.blade gate.drop
脉斧 coil.blade orbit.sickle cross.sickle
热续 pulse.fire - pin.sickle
沸刃重击 bend.fire shot.blade echo.claw
拖火护送 step.ember dash.fire shield.fire
@ fire flame gate loop heart bell plate cross
---
绝境三连 split.blade cross.sickle shatter.claw
血线十字 split.drop cross.blade cross.sickle
切疆 lock.gate beam.blade gate.claw
吞焰 draw.fire return.fire fold.plate
不退 lock.heart rise.prism crack.shield
第三角 split.prism split.sickle fan.blade
吞焰再铸 fold.ember split.plate shield.ember
@ claw cross fire heart shield plate drop chain
`,
  paladin: `
圣光斩 bend.cross dash.blade slash.cross
持灯 rise.lantern rain.orb drop.lantern
轻庇 draw.shield - fold.cross
推剑 shield.plate dash.blade shove.cross
领旗 stamp.flag - pin.lantern
斩光溅护 flash.cross return.wing bloom.cross
分灯 split.lantern split.orb shield.lantern
@ blade lantern shield anchor flag eye step bell
---
守望 shield.eye shot.shield flip.cross
扫光 bend.wing cross.blade slash.wing
净刃 draw.cross shot.blade shatter.cross
肩灯 step.lantern - pin.plate
自誓 shield.rune - crack.plate
守望旗 rise.flag tether.shield stamp.flag
碎面照路 crack.shield wave.orb shatter.cross
@ wing feather spark lantern shield chain step leaf
---
誓约印记 stamp.rune shot.rune snap.shield
灼誓 draw.flame tether.rune flip.rune
护近 shield.lantern tether.shield trail.plate
祈剑 split.cross wave.blade cross.cross
抵光 bend.plate dash.blade snap.lantern
守誓还击 fold.rune return.blade slash.cross
倒盾 fold.shield lob.shield drop.cross
@ rune fire step cross blade chain shield note
---
圣域踏斩 step.cross dash.blade split.cross
圣链斩 bend.chain return.blade tether.cross
护门印 lock.gate - grid.cross
抬剑 draw.lantern rise.blade rise.cross
移光 split.orb tether.lantern echo.cross
圣域分光 draw.cross split.wing bloom.wing
绕剑护身 coil.blade return.orb shield.cross
@ cross sun gate blade lantern eye shield leaf
---
宣誓之环 draw.rune - tick.flag
裁决落点 lock.cross rain.blade stamp.cross
陪护誓 split.rune tether.cross pulse.rune
反转骑线 fold.cross lanes.blade split.shield
聚誓 draw.heart rain.lantern bloom.shield
圈外继旗 tick.rune shot.flag pin.flag
陪护分幕 split.rune tether.shield wall.cross
@ flag blade rune wing shield chain step arrow
---
双辉裁决 split.cross beam.prism split.wing
晨翼 rise.wing lob.wing bloom.lantern
争位 lock.rune swap.ribbon drop.rune
回敬圣枪 lock.bolt return.blade shove.cross
展辉 crack.shield rain.cross wash.lantern
照线分支 draw.wing split.prism slash.wing
返照盾 crack.lantern return.orb pin.cross
@ cross wing shield blade lantern heart ember flag
---
黎明公约 rise.crown rain.rune tick.prism
破晓横线 draw.lantern beam.prism wall.wing
并肩启誓 split.rune rise.shield grid.prism
换幕 fold.orb swap.prism flip.orb
联光 lock.rune chain.spark pin.prism
黎明反辉 crack.rune split.prism shield.crown
回廊 trail.rune beam.orb grid.cross
@ shield prism flag mask crown wing wall orb
`,
  spellbreaker: `
破盾 crack.plate dash.blade shatter.plate
点刃 lock.needle dash.needle snap.blade
横反 bend.blade wave.blade cross.needle
削扣 draw.gear - crack.gear
避波 shield.shard - veil.plate
碎盾余刃 crack.shard - pin.blade
薄幕回声 veil.shield return.shard snap.spark
@ shard needle cross gear shield eye step plate
---
断咏 lock.bolt dash.blade slash.bolt
截响 step.bolt beam.blade trail.needle
刃印 stamp.blade shot.needle pin.blade
回护 fold.plate tether.shield veil.shard
跃楔 step.shard dash.needle crack.shard
断咏护圈 crack.bolt wave.spark shield.needle
挡后反印 flip.plate return.step stamp.step
@ bolt step blade shield needle eye wing arrow
---
蚀刻 lock.rune shot.blade crack.rune
落铆 draw.needle rain.needle shatter.gear
反纹 fold.rune return.shard flip.plate
震令 stamp.bell wave.rune tick.bolt
折刃 bend.shard bend.blade snap.rune
同裂 crack.rune chain.shard flip.rune
反纹再撑 fold.plate return.shard shield.shard
@ rune shard plate bell blade shield spark wing
---
破法帘 draw.ribbon rise.shard veil.prism
斩术位 lock.rune shot.blade slash.rune
空洞盾 draw.loop - shield.shard
错谱 lock.step beam.ribbon fold.step
返刃波 coil.shard wave.blade shatter.rune
翻帘 fold.ribbon wave.shard slash.prism
断续 crack.rune - pin.shard
@ ribbon blade shield step note eye bell rune
---
扣锁 lock.chain shot.rune tick.chain
清垫 draw.shard rain.plate shatter.anchor
偏挡 fold.shard wave.shield flip.plate
穿甲路 draw.rune beam.blade crack.plate
侧回 step.blade return.shard slash.mask
锁印脱壳 pin.chain return.needle fold.step
回身净途 step.rune return.blade trail.shard
@ chain shard plate rune step blade wing shield
---
反谱 fold.note return.blade slash.note
净空返斩 draw.loop return.prism shatter.rune
双抵 split.plate split.shard pulse.shield
倒拍域 lock.note - tick.step
借谱 draw.note tether.shield flip.note
反谱分弦 fold.bolt split.blade shove.note
借谱留光 split.note tether.shield fold.plate
@ shield loop plate note wing blade step shard
---
空拍 draw.loop - shatter.rune
抹迹长线 lock.shard beam.prism slash.rune
反相成盾 fold.shard return.prism shield.prism
封谱区 grid.note - lock.chain
合刃散印 split.blade cross.prism bloom.shard
空拍落光 fold.rune rain.prism shatter.loop
盾反折线 flip.shield beam.shard slash.prism
@ loop blade shield chain spark step shard heart
`,
  binder: `
霜缚 draw.ice shot.ice pin.ice
绳点 lock.chain shot.chain tether.anchor
冰面 stamp.ice - grid.ice
迟步 lock.step shot.needle fold.step
缚身甲 shield.ice - veil.chain
霜脚记 pin.ice wave.ice shatter.step
薄冰延路 step.ice wave.shard trail.ice
@ ice chain shard step shield eye anchor rune
---
牵丝 lock.chain tether.chain snap.needle
束边 bend.chain wave.ice gate.arrow
锁脚印 lock.step - pin.chain
拖链 split.chain return.chain tether.rune
雾墙 rise.ice wave.ribbon wall.ribbon
断丝回扣 snap.chain return.needle tether.ice
锁脚次点 pin.step - echo.needle
@ anchor arrow step chain ribbon ice eye wing
---
横风牵引 draw.ribbon wave.ribbon coil.anchor
双牵 split.hook cross.chain tether.hook
坠链 lock.chain rain.chain stamp.anchor
散涡 coil.loop orbit.ribbon ripple.ribbon
停风 lock.ribbon - wall.anchor
横风小涡 coil.ribbon wave.ribbon echo.loop
坠链偏折 stamp.anchor split.chain shove.hook
@ loop chain anchor ribbon step knot wing gate
---
折路 lock.step bend.chain shatter.step
失步阵 grid.step - crack.step
反向线 fold.arrow beam.chain shove.arrow
夹霜 split.ice cross.ice snap.ice
护缚 shield.chain tether.hook shield.ice
折路再折 crack.step shot.shard pin.step
线返标 fold.arrow return.chain trail.arrow
@ step needle arrow ice shield eye chain plate
---
定影 stamp.mask - pin.anchor
拴心 draw.chain chase.hook snap.chain
狭门 lock.gate - grid.gate
下坠 lock.orb rain.anchor coil.dust
退风窗 split.ribbon lanes.ribbon gate.ribbon
影印余钉 echo.mask rain.needle pin.mask
坠门反升 fold.anchor wave.dust flip.gate
@ mask chain gate anchor shield eye rune key
---
折轴 draw.gear bend.arrow snap.anchor
偏潮 lock.arrow bend.ribbon shove.prism
相扣 split.hook tether.chain snap.hook
折地 fold.step wave.plate wall.step
换风 split.step cross.ribbon flip.step
折轴标尾 bend.arrow split.chain shove.anchor
偏潮护岸 lock.gate return.ribbon shield.gate
@ gear arrow chain step ribbon loop anchor eye
---
重力定盘 lock.anchor orbit.prism coil.prism
双心引力 split.orb cross.prism coil.orb
逆场 fold.arrow wave.prism flip.arrow
撤路印 split.step wave.ribbon grid.step
压阵针 lock.needle beam.prism pin.anchor
定盘翻边 fold.anchor shot.prism fold.arrow
逆场回钩 flip.arrow return.hook tether.prism
@ anchor hook shield step needle gate loop plate
`,
  lifebringer: `
回春 draw.leaf rain.leaf tick.leaf
小枝 bloom.branch tether.leaf echo.branch
露点 stamp.drop - pulse.drop
护叶 shield.leaf - rise.leaf
生针 draw.needle return.seed cross.branch
回春分叶 tick.leaf split.leaf bloom.leaf
护叶再生 crack.leaf rain.seed rise.seed
@ leaf branch drop shield seed eye step plate
---
护芽 shield.seed - bloom.seed
含露 draw.drop chase.drop stamp.leaf
近林 draw.branch - ripple.leaf
结种 fold.leaf tether.seed wash.leaf
枝箭 draw.branch shot.arrow ripple.drop
护芽旁根 bloom.seed - pin.branch
露返 fold.drop return.leaf shield.drop
@ seed drop branch shield arrow loop wall heart
---
生机蔓延 bloom.branch tether.branch fan.branch
团枝 draw.seed split.branch bloom.petal
借根 pin.branch - rise.drop
痕叶 step.leaf return.seed trail.leaf
补芽斩 bend.branch wave.leaf slash.branch
双端生枝 split.seed tether.branch cross.leaf
留痕回路 step.leaf return.branch pulse.seed
@ step drop heart leaf branch seed shield cross
---
疗愈地衣 draw.leaf - tick.loop
接露 lock.step rain.drop snap.seed
回根线 split.branch lanes.branch pulse.leaf
长芽盾 shield.seed rain.seed tick.shield
续壳 split.leaf wave.leaf fold.plate
地衣送叶 tick.loop wave.leaf bloom.branch
落露双芽 split.drop rain.seed bloom.drop
@ loop drop ribbon shield heart leaf step seed
---
共根 split.branch tether.seed tick.branch
同命芽 split.seed tether.leaf shield.branch
退林 lock.gate wave.branch flip.shield
借白 fold.clock return.drop echo.heart
同根枝 draw.branch split.seed bloom.leaf
共根护阶 tether.branch rise.plate shield.seed
借白护住 echo.clock return.leaf pin.shield
@ branch seed leaf clock petal eye shield heart
---
生命回路 orbit.seed rain.seed tick.petal
移根 step.branch chase.leaf trail.loop
息壤 draw.petal wave.seed ripple.leaf
镜芽 fold.prism lob.seed shatter.leaf
引露针 lock.drop shot.needle tether.drop
回路余芽 split.seed rain.petal bloom.seed
镜芽再撑 fold.prism - shield.leaf
@ petal loop branch prism needle shield step seed
---
时轮返青 coil.clock return.leaf echo.clock
逆年轮 fold.clock return.step trail.clock
共生堤 grid.wall wave.drop wall.branch
救生芽 draw.seed shot.seed pin.branch
星枝落 rise.branch rain.star bloom.star
返青接枝 split.clock tether.branch bloom.prism
救芽护岸 rise.seed wave.shield shield.branch
@ clock step drop seed star branch shield leaf
`,
  summoner: `
哨偶 stamp.mask rise.needle pin.mask
纸火 draw.mask shot.fire flash.fire
小盾偶 fold.plate tether.shield shield.mask
钉哨 stamp.bell rain.needle snap.mask
折鸟 fold.wing shot.wing slash.wing
哨声双点 tick.bell split.needle echo.mask
挡盾回纸 fold.mask return.plate bloom.plate
@ bell fire plate needle wing shield eye mask
---
纸替身 fold.mask rise.plate shatter.mask
巡灯 draw.lantern orbit.lantern trail.lantern
双纸箭 split.wing split.arrow tick.wing
看护偶 stamp.heart tether.mask pulse.heart
雾偶 veil.mask wave.ribbon bloom.mask
纸替炸尾 crack.mask wave.shard shatter.plate
看护添脚 lock.heart - pin.step
@ shard lantern wing heart ribbon bell shield step
---
奔偶 step.mask chase.claw crack.mask
绳偶 draw.chain tether.hook pin.chain
蹲守偶 lock.mask dash.mask snap.bolt
影纸 veil.mask chase.arrow echo.mask
地甲桩 stamp.anchor - grid.plate
奔偶后背 step.claw wave.mask shove.claw
桩守退 pin.anchor return.step fold.plate
@ step chain bolt arrow plate eye shield flag
---
双弦机 lock.bow lanes.ribbon tick.bow
回线偶 fold.mask return.chain tether.mask
吊钟偶 rise.bell rain.bell echo.bell
纸卫 fold.shield dash.mask shield.wing
霜钩桩 coil.ice shot.hook pin.ice
双弦端点 split.bow cross.ribbon pulse.bell
钟落定步 stamp.bell - pin.bell
@ bow ribbon bell mask hook rune gate plate
---
镜手 fold.prism chase.shard flash.prism
押路兽 draw.claw beam.claw slash.dust
连盾偶 shield.mask tether.plate snap.shield
六面桩 grid.anchor rise.prism tick.plate
双镜弦 split.prism lanes.shard cross.bow
镜手改角 fold.prism split.shard flip.prism
六面回护 shield.prism return.shard tether.plate
@ prism claw shield anchor bow wall wing mask
---
巡轨兽 coil.claw orbit.claw shove.dust
扑岸兽 lock.claw dash.claw gate.dust
三拍纸阵 split.mask rain.mask tick.mask
援尾偶 draw.shield return.heart wash.plate
回旋桥 coil.plate orbit.ribbon wall.loop
轨兽分身 step.claw split.claw echo.claw
援尾接护 fold.heart tether.shield shield.heart
@ claw barb mask heart ribbon shield eye loop
---
星兽合奏 draw.crown rain.claw tick.prism
双星门 split.gate cross.prism gate.star
全场纸偶 lock.mask chain.mask flip.mask
投甲兽 split.claw lob.plate shield.prism
折空回兽 fold.claw return.prism slash.claw
合奏回席 tick.prism return.claw ripple.crown
折兽归线 fold.plate return.prism shield.claw
@ star gate mask shield loop eye bell anchor
`,
  dancer: `
领步 step.step tether.ribbon tick.step
拍脚 stamp.step shot.note pin.step
扶步 fold.step - shield.ribbon
小回身 fold.step return.ribbon echo.step
扫节 split.note cross.ribbon slash.note
领步落拍 tick.step split.note stamp.step
回身留灯 step.lantern return.ribbon pin.lantern
@ step arrow shield loop note wing anchor bell
---
侧步引导 draw.ribbon bend.step trail.ribbon
偏步 stamp.ribbon - pin.ribbon
交接线 lock.note tether.ribbon snap.note
小切入 step.needle dash.ribbon slash.step
照位 lock.lantern beam.lantern pulse.step
双脚侧带 split.step lanes.ribbon step.ribbon
蓝灯对拍 stamp.lantern - echo.lantern
@ shield ribbon note blade lantern chain step drop
---
延拍 draw.step tether.step tick.ribbon
引线 lock.ribbon beam.step pin.note
回舞脚 step.note return.step trail.note
顺推 bend.step wave.ribbon shove.step
停步鼓 stamp.bell - pulse.step
延拍换气 step.note - ripple.ribbon
引线回声 pin.note return.step flash.step
@ shield eye step wing bell arrow plate loop
---
对舞 split.ribbon lanes.step shield.step
换步锚 lock.anchor return.step snap.anchor
撩步 fold.ribbon dash.step slash.ribbon
对点环 draw.note orbit.lantern tick.note
侧移线 split.step return.ribbon echo.ribbon
对舞落盾 split.step tether.shield shield.ribbon
锚后再拍 stamp.anchor return.note pulse.anchor
@ ribbon anchor blade note cross shield step loop
---
落点跳 draw.loop lob.step ripple.step
反身跳 fold.step lob.ribbon echo.note
斜掩步 split.step lanes.step trail.plate
借点 lock.step tether.note pin.step
留轨 draw.ribbon beam.ribbon shield.ribbon
落点双拍 split.note lob.step tick.loop
掩步回护 step.plate return.step shield.plate
@ bell ribbon shield step plate eye note mask
---
环步 coil.step orbit.ribbon trail.step
合步摆位 draw.step cross.ribbon snap.step
急退落点 lock.arrow return.step stamp.ribbon
三拍道 draw.note beam.ribbon tick.lantern
回摆 coil.ribbon return.step slash.ribbon
环步站定 split.step tether.ribbon trail.ribbon
回摆外圈 coil.ribbon wave.step shove.ribbon
@ loop step arrow note plate ribbon wing bell
---
终幕滑条 draw.loop beam.prism trail.star
双段滑线 split.prism bend.step tick.loop
回放脚印 fold.clock return.step echo.step
急场移步 lock.star split.step pin.prism
双岸舞步 coil.gate cross.step flip.ribbon
尾圈护送 snap.loop wave.prism shield.loop
旧点屏 echo.step return.ribbon pulse.bell
@ loop shield clock step gate ribbon wing bell
`,
  healer: `
治疗 draw.cross - bloom.cross
压伤口 fold.ribbon tether.cross snap.heart
小纱盾 fold.shield - veil.ribbon
先看伤 lock.heart - tick.cross
扶稳 rise.cross rain.cross pin.step
贴药护足 bloom.cross - shield.step
纱盾回针 crack.shield shot.needle wash.cross
@ needle shield ribbon heart step eye drop cross
---
止血 draw.ribbon wave.ribbon fold.heart
轻抬 draw.cross return.step rise.ribbon
挡痛 shield.ribbon tether.cross veil.heart
邻针 split.needle split.needle bloom.drop
后撤包 step.cross dash.plate trail.cross
净纱护线 fold.ribbon wave.cross wash.ribbon
痛转护 snap.heart return.plate shield.cross
@ ribbon cross shield needle step wing eye chain
---
强心针 lock.heart shot.needle bloom.heart
截伤针 draw.needle shot.cross pin.heart
双向救 split.cross cross.cross pulse.heart
撑线 lock.ribbon beam.cross wash.cross
急步 step.needle dash.cross shield.needle
强心续命线 pulse.heart tether.needle ripple.cross
急步分针 step.cross split.needle snap.needle
@ heart needle cross ribbon step shield wing orb
---
广域急救 rise.cross rain.cross pulse.cross
斜线包扎 draw.ribbon beam.cross trail.cross
破盾清伤 crack.shield wave.ribbon shield.cross
同点抢救 lock.heart lob.cross snap.cross
护援 shield.needle - pin.cross
广急回弹 pulse.cross wave.cross ripple.cross
净后踏稳 fold.cross - gate.step
@ cross ribbon shield heart needle lantern step clock
---
分诊 draw.lantern chain.cross tick.heart
止损单 stamp.rune shot.plate pin.heart
双路处置 split.cross lanes.cross wash.cross
加压止血 coil.drop wave.heart shield.ribbon
急救标台 grid.cross - tick.lantern
分诊调头 flip.plate return.cross echo.heart
标台侧门 tick.lantern split.orb gate.cross
@ lantern rune cross ribbon eye heart wing anchor
---
急救窗口 lock.heart tether.bolt snap.heart
救火双针 split.needle shot.needle tether.needle
紧护角 draw.shield wave.cross gate.cross
止痛返伤 pin.needle return.heart echo.cross
远端净光 rise.lantern rain.prism wash.heart
急救外圈 snap.heart wave.bolt ripple.heart
远光接壳 wash.cross rain.plate shield.lantern
@ heart needle shield drop prism gate eye clock
---
回场应援 split.lantern rain.prism gate.shield
逆风急救 rise.cross rain.wing bloom.prism
全图分护 split.heart tether.cross split.shield
并网回声 coil.cross chain.prism echo.cross
净场救护 draw.ribbon wave.prism shield.cross
回场接诊 lock.gate return.lantern pulse.prism
全图分护留线 fold.heart tether.prism shield.heart
@ gate drop shield cross prism anchor lantern heart
`,
  bard: `
鼓舞 stamp.note - pulse.note
引音 draw.note shot.note rise.note
护拍 shield.note - snap.note
慢拍 lock.note shot.bell pin.step
落歌 draw.note rain.note bloom.note
鼓舞合拍 tick.note split.note echo.note
护拍返响 shield.bell return.note ripple.note
@ note ribbon shield bell cross lantern step flag
---
战歌 draw.bell wave.note fold.note
正拍 stamp.note shot.note shove.note
低音幕 veil.note - wall.ribbon
退拍 step.bell return.note pulse.bell
和声针 split.needle split.note cross.note
战歌回护 fold.note wave.note shield.bell
退拍换调 stamp.bell - echo.bell
@ shield arrow ribbon bell needle note step chain
---
回声箭 draw.note chain.arrow echo.note
引弦 draw.bow tether.note trail.bow
音叉 split.note cross.bolt cross.bell
疗音 draw.note tether.note bloom.cross
斜节 bend.ribbon lanes.note split.shield
单敌回声 fold.note return.note pulse.note
远弦倒向 flip.bow wave.note shove.bow
@ shield bow bell cross ribbon anchor step eye
---
驻场曲 draw.note orbit.note tick.lantern
回音台 stamp.plate - pulse.lantern
避声 fold.note chase.shield shield.ribbon
空弦落点 lock.bow rain.note pin.bow
双人音 split.note tether.bell echo.note
驻曲侧弦 bend.bow split.ribbon trail.note
双音护场 split.note wave.shield ripple.bell
@ note shield step bow bell anchor ribbon loop
---
合奏令 lock.note split.note tick.note
战线拍 draw.bell beam.note split.note
同调起手 rise.note rain.bell snap.note
封音角 lock.rune - pin.bell
礼成 fold.shield tether.note shield.note
合奏落旗 tick.note shot.flag stamp.flag
同调再返 fold.note return.bell shield.ribbon
@ note ribbon eye bell shield chain step flag
---
接拍 shield.note chain.note fold.shield
三声交接 draw.note chain.bell tick.bell
齐拍路 step.ribbon lanes.note trail.note
副歌攻击 lock.note shot.note snap.bell
对唱阵 split.note cross.note bloom.note
第三位接拍 split.shield split.note shield.note
齐拍回音 trail.note shot.arrow snap.note
@ note shield step bell cross anchor loop wing
---
终章全奏 rise.prism rain.note tick.rune
全曲救场 draw.bell wave.prism bloom.note
换位序曲 coil.step cross.ribbon step.note
光谱对拍 split.prism chain.note pulse.prism
归音边线 lock.gate tether.note pin.star
终章并声 split.rune cross.prism echo.bell
归音转台 stamp.note beam.prism trail.loop
@ rune cross step prism gate anchor bell wing
`,
}
