import type { SubJobId } from "@/card/jobs"

// Each rarity has five cast programs, eight passives and two gold effects,
// in the same slot order as the corresponding design table.
export const recipes: Record<SubJobId, string> = {
  bard: `
a275|t b8 ampq38,10
a265|t qr52,8
a275|t guard20,8
e250|t d1.10 slow18,2.4
a275|t h9;w8/hit.from.handattack.direct.healContact t t h4
assist.me.bardRally.bardAllyActor|u h4
strike.bardGuided|v add.13
protect.me.guard.bardMuted.effective|v b5
alter.me.slow.bardSlow.foe|s q.17,8
mend.me.bardVerse|v addh3
always.bardNearCard110|s res8
move.on.danceWalk|s b4
death.other.card.once|s q.18,9
assist.me.bardRally.bardAllyActor|aC70@u#l1!u?card+notfull h6
protect.me.guard.bardMuted.effective|u d.32
---
a300|t guard28,8
a305|t qp48,9
p290|z8/bardentry aC92 b14
a305|w8/move.to.danceWalk t t h12
e300|t d1.18;aC125@t#1 b9
protect.me.guard.bardWarDrum.effective|v h5
assist.me.bardDownbeat.bardAllyActor|u b5
shield.me.bardCurtain|v speed14,3~inside
heal.me.bardRetreat.effective|v anti16,8~once
ward.me.bardHarmony|v addh3
always.selflow45|s res10
move.on.danceWalk|s qr32,8
always.bardProtected110|s anti15
proc.proc1|v b7
proc.proc4|aC80@v#l1!v?card+notfull h6
---
a315|w10/hit.from.handattack.direct.healContact t eC120@v#1!v d.70
a320|w9/strike.from.handattack.direct t v add.23 addp30
p320|eC101 d1.25;w8/strike.friend.q.to.handattack.direct k v add.28
a330|t h13;w9/hit.from.q.handattack.direct.healContact t aC110@u#1!u?card h7
l280|eL280,62 d1.24 p64~side;aL280,62#1 b12
assist.me.bardAccent.bardAllyActor|u b5
assist.me.bardBowPush.bardAllyActor|v d.17
assist.me.bardFork.bardAllyActor|s h5
mend.me.bardPassing|v addh4
ward.me.bardCross|v addh4
always.bardNearHeal120|s healamp10
move.on.danceWalk|s q.19,8
death.other.card.once|s b9
assist.me.bardLoneEcho|v d.52
assist.me.bardBowPush.bardTurned|v p30~from
---
p340|z9/hold aC135 range70
p350|aC125 b10;z8/strike aC125 add.46
a350|t b17;w8/move.to.danceWalk t t h10
p340|eC110 d1.32;w8/shove.friend.q.to.handattack k v addp55
o350|w9/hit.from.handattack.direct.healContact t s h9;w9/hit.from.handattack.direct.healContact s t h9
strike.bardFieldGuided|v add.20
assist.me.bardStage.bardAllyActor|u b6
heal.me.bardCloak.effective|v anti20,8~once
assist.me.bardStopped.bardAllyActor|u h5
heal.me.bardDuet.effective|v b6
always.bardOwnField|s res11
move.on.danceWalk.bardNearCard120|s qr42,8
return.on.manualReturn|oC135@s#1?card b7
assist.me.bardFieldRange.bardEarnedRange|eC75@v!v d.38
heal.me.bardDuet.effective|z3/hold aC82@p?card res16
---
e375|t d1.38;w9/hit.team.to.handattack.direct.healContact/2 t v d.46
l340|eL340,84 d1.43 p86;aL340,84 b15
a*|w9/strike.from.handattack.direct t v add.62;w9/hit.from.handattack.direct.healContact t aC85@v?card h9
p375|eC133 d.40;z8/charge eC133 d1.35 i
a375|t b20;w9/hit.from.skill.handattack.direct.healContact t t h12
assist.me.bardSecondVoice|u h6
ward.me.bardStaff|v addh5
assist.me.bardLead.bardAllyActor.bardLong320|s b7
interrupt.me.bardCorner.zone|w8/strike.team.q.to.handattack.direct v v add.25
mend.me.bardCoda|v addh4
always.bardTwoCards140|s anti17
strike.me.q.handattack.direct.bardTwoAttackers|v take15
death.other.card.once|w9/mend.me.from.bardActive s v addh6
assist.me.bardSecondVoice|aC88@u!u?card b10
assist.me.bardLead.bardAllyActor.out|u b12
---
a395|t b22,12;w10/hit.from.handattack.direct.healContact t a@u#1!u?card b22,12
a415|t h14;w9/hit.from.handattack.direct.healContact t a@u#1!u?card b19 h9
l410|z9/move aL410,95 b17 qr64,8
e415|t d1.50;w9/pushland.friend.to t eC90@l d.49
p420|aC155 h16;w9/hit.from.q.handattack.direct.healContact aC155 s h8
shield.me.bardShieldRelay|v h6
ward.me.bardHandoff|v addh5
shield.me.bardLane|v anti24,8~once
assist.me.bardRefrain.bardAllyActor|u b8
mend.me.on.bardAntiphon|v addh4
always.bardProtected140|s res12
return.other.card.manualReturn.nearself180|v q.24,9
death.other.card.once|o?card b9
shield.me.bardShieldRelay|aC150@v?card b11
proc.proc3|w8/hit.from.q.handattack.direct.healContact v eC78@v!v d.46
---
s|a?card score10,10,.62,90
s|a?card h5 guard20,7;a?card+low45 b12
p*!|a?inside+card dash140 b19 q.41,9
p490|eC170 d1.62;z9/hit aC170 h11
a*|t?out h25 b24;w10/return.to.manualReturn t aC100@l!v?card b12
assist.me.bardFirstScore|v b9
protect.me.guard.bardSymphony.bardHostileSkill.effective|v h6
assist.me.bardOverture|v anti26,8~once
mend.me.bardSpectrum|v addh5
assist.me.bardShore|v h9
always.bardEmpowered145|s anti18
death.other.card.once|o?card b11
assist.me.bardDistant.bardAllyActor.bardLong320|s h7
assist.me.scorehit|aC115@u!u?card h9
proc.proc5.bardCodaCrossing|z3/hold aC100@p?card+inside speed26
`,
  healer: `
a295|t h14
a280|t h12;w8/hurt.to.direct.enemy.healContact t t h4
a275|t b12
a290|t h10,5,45~lowhealth
a285|t h11 speed15,3~inside
heal.me.healerSingle.amount10|v h3
heal.me.healerWound.effective|v b5
shield.me.healerActive|v anti14,8~once
mend.me.healerActive.low45|v take10
heal.me.healerSteady.effective|v guard14,8
mend.me.healerActive.nearself100|v take9
heal.me.healerActive.over|v overshield4
heal.me.healerActive.out.effective.once|v h5
proc.proc1|v anti24,8~once
break.me.guardbreak|v h7
---
a315|t h15 clean1~dotslow
a315|t h14 clean1~short
a315|t h12 guard25,8~skill
a315|t h13;aC95@t#1!t h6
a315|t h12;w8/move.to.danceWalk.recede85 t t h6~moved
cleanse.me.healerActive|v b5
cleanse.me.healerActive.healerShortClean|v speed16,3~inside
protect.me.healerActive.guard.effective|v h5
heal.me.healerRelay.effective|v h3
heal.me.healerWalkHeal.effective|v b6
move.on.danceWalk.healerApproach90|w8/mend.me.from.healerActive s v addh4
mend.me.healerActive.healerStill|v take10
heal.friend.on.effective|u b5
proc.proc1|aC100@v#1!v?slow clean1~slow
proc.proc3|v anti26,8~once
---
a330|t missing20,26,8
a335|t h16 returnhp25,8,8
o335|t h15;s h9
p330|aC98#l1 h16;aC98 h7
a345|t h14;w8/move.to.danceWalk t t b12
heal.me.healerActive.healerOver20|v b6
heal.me.healerActive.historic.effective|v anti23,8~once
heals.me.healerReciprocal|v h4
heal.me.healerPriority.effective|v b6
ward.me.healerWalkWard|v addh4
always.selfshield.other|s healamp10
life.other.ally.card.healerCrossLow30.nearself230.once|v h7
death.ally.card.once|w9/mend.me.from.healerActive s v addh5
proc.proc1|v guard25,8
proc.proc5|aC86@v#1!v?lifewounded h7
---
p345|aC112 h17
l330|aL330,80 h16;aL330,80?low45 b9
a355|t h17,9~overflow clean1~dot
p355|aC115#l1 h23;aC115 h11
a350|t h14 b15;w8/hurt.to.direct.enemy.healContact t t h5
heals.me.healerAreaGroup|v h4
heal.me.healerLineFront.effective|v anti25,8~once
cleanse.me.healerActive|v guard18,8
heal.me.healerActive.delayed.amount18|v b7
ward.me.healerWardAfterHeal|v addh5
always.nearally115|s res10
move.on.danceWalk.healerEnter115|w8/mend.me.from.healerActive s v addh4
death.ally.card.once|s h8
heals.me.healerAreaGroup|eC95@v#1 p60~circle
proc.proc3|v anti28,8~once
---
s|aC365@s poolheal60,28
a385|t h21 guard34,9~skill
a380|t h19;aC170@t#l1!t h13 b10
p380|aC142 h16 clean1~dot;aC142 b11
p385|z8 aC148 h18;aC148?low35 b15
heals.me.healerPoolGroup|v b8
protect.me.healerActive.guard.effective|v h6
heals.me.healerDualGroup|v h4
ward.me.healerCleanWard|v addh5
heal.me.healerStation.low35.effective|v speed20,3~inside
ward.me.healerActive.low40|v addh5
mend.me.healerActive.farself310|v addh4
death.ally.card.once|a anti23,9~once
proc.proc1|w8/hurt.to.direct.enemy.healContact v v h8
proc.proc5|aC148@v#1!v b11
---
a405|t h21 defy0,10,18
a420|t h23;.65 aC135@t#l1!t h15
p420|aC158 h17;aC158?low45 b16
a425|t h20 returnhp45,9,16
a*|t h21 clean2~dotslow
save.me.healerActive|v b9
mend.me.healerRelay.low45|v addh4
ward.me.healerUrgentWard|v addh5
heal.me.healerActive.historic.effective|v anti26,8~once
cleanse.me.healerActive.healerCleanCount2|v b9
mend.me.healerActive.out|v take12
always.lowally145|s res12
death.ally.card.once|a b10
save.me.healerActive|aC100@v!v h10
proc.proc5|v guard30,8~skill
---
s|a h7;a?out h13 b22,12 anti35,10~once
s|a#l2 h7;a#l1?low55 h17 b14
a*|t h23;t?other split45,9,18
p485|aC170 h15;aN270,100 b14
p485|aC175 h16 clean2;aC175 b12
shield.me.healerRally|v h6
assist.me.healerWindLock|v anti28,8~once
redirect.me.healerActive.effective|s h6;v h6
shield.me.healerNet|v h6
ward.me.healerCleanWard|v addh5
return.ally.card.danceFirstReturn.nearself250.perally|v h10
always.healerBloodLamp|s healamp11
death.ally.card.once|a h8
assist.me.healerRallyDone|w10/return.to.healerManualReturn v v h11;aC100@v#1!v b9
proc.proc3|v b13
`,
  dancer: `
a270|t speed25,6~inside
a250|t extend55,8,8
a255|t b15 speed15,4~inside
p90|s dash90 b12
l205|eL205,62 d1.10 p44~side
assist.me.danceLead|v h4
assist.me.extend.danceActive|v b5
ward.me.danceCradle|v addh3
dash.me.on.danceActive|s anti18,8~once
push.me.side.danceActive|s q.16,8
always.nearally100|s res8
move.on.danceWalk|s b4
death.ally.card.once|a speed15,4~inside
proc.proc1|aC70@l#1!v?danceWounded h6
proc.proc4|z4/dancelamp aC72@r b7
---
o285|t dash88~out
a280|t b12 anti32,8~once
p280|z8/dancefinish aC88 h12
p115|s dash115;eL115,54 d1.17~dash p55~axis
a290|w8/move.to t t b14
dash.me.other.danceLeadSide|v b5
protect.me.anti.danceSash|v h4
heal.me.danceFinish.danceHeal|v speed15,3~inside
hit.me.danceCut.danceHit|s q.17,8
shield.me.danceLight|v qr34,8
always.nearally105|s anti14
move.on.danceWalk.recede85|s b6
always.selfshield.inside|s speed11
proc.proc1|s dash42~eventaxis
proc.proc3|aC100@l#1!v b8
---
a310|t extend90,8,12
p315|z8/danceentry aC100 h13~dancewalk
a315|w8/move.to t aC78@r!t b12;w8/dash.to t aC78@r!t b12
l270|eL270,66 d1.22 p63~avoidally;oL270,86#1 b14
a320|t h17;w8/move.to t t guard34,8
assist.me.extend.danceActive|v b6
heal.me.danceEntry.danceHeal|v q.19,8
shield.me.danceOld.danceFirstWard|v h5
assist.me.danceExtraPush.perally|v signal20
protect.me.guard.danceDrum|v b6
move.on.danceWalk.escapedWarning|s res12,3
always.nearally105|s res10~ranged
dash.on.danceAllySkill.recede80|s qr40,8
proc.proc1|aC90@l#1!v?danceWounded h7
proc.proc2|eC70@l d.38
---
o325|g dash105~left b12
a340|w8/forcedland.to.inside t t dash80~back h10
p135|s dash135;eC92@o d1.32~dash p70~circle
p340|z8/dancestill aC128 h13 b8
l305|eL305,80 d1.30 p76~side;oL305,80#1 b14
ward.me.dancePair.danceGroup2.perally|v addh3
dash.me.danceAnchor|v anti22,8~once
hit.me.danceWake.danceHit|s q.23,8
mend.me.danceStill.healroom.perally|v addh4
shield.me.danceSplit.dancePushed|v speed18,3~inside
dash.on.danceAllySkill|s res13,2.5
move.other.danceWalk.nearself105|v b6
return.on.danceFirstReturn.once|s extend65,8
proc.proc1|aC68 b7
proc.proc2|eC75@l p62~circle
---
a350|t hop265,8,.25,1.12,90,60,15
p180|s dash180;eC80@o d.76~dash;eC80@l d.76~dash
o355|g dash120~left b16
p370|z8/danceborrow aC130 dash65 b12
p375|z8/dancerail aL310,86 speed28 h9
assist.me.hop.danceActive|v b7
hit.me.danceDouble.danceHit.danceDoublePair.perally|v p54~circle
shield.me.danceEscort.danceFirstWard.danceGroup2|v h6
dash.me.danceBorrow|v guard23,8
assist.me.danceRailWalk|v b6
always.nearally135.inside|s speed15
shield.me.danceActive|s qp28,8
death.ally.card.once|s extend75,9
proc.proc1|eC78@r p55~circle;aC78@r b7
proc.proc3|g anti28,8~once
---
p380|aC145?inside rot90 res30,2
p390|aC148?inside dash94 b19
a395|w10/hurt.to.direct.inside t t dash108~away h14
l390|z9/dancepasses aL390,92 speed24 b12
p390|aC145?inside rot-55 h13;eC62@l d1.46
assist.me.danceOrbitGroup|v b6
assist.me.danceGather|v h6
dash.me.danceRetreat|v b8
shield.me.dancePasses.danceFirstWard|v anti24,8~once
hit.me.danceSwing.danceHit.danceFirstHit|s b8
always.danceRail|s anti18
move.ally.danceWalk.recede120.danceProtected|v h5
ward.me.danceActive.danceRecentReturn|v addh5
proc.proc1|z3/hold aL1,65 res18
proc.proc5|v p75~eventaxis
---
p*!|z10/track aL620,100 glide620,.55,40
p*!|z9/dancehinge aL660,92 b18 speed38,3~inside
a*|t dash210~history b24
p465|aC170?inside extend120,10,15
p475|aC160?inside rot105 b19;eC78@l d1.52 p102~circle
assist.me.glide.danceActive.perally|v h7
ward.me.danceHinge.perally|v addh5
dash.me.danceReverse|v anti30,8~once
assist.me.extend.danceActive.perally|v b8
after.me.danceCoast|t h6
always.danceSlider|s anti20
return.other.danceFirstReturn.nearself210.perally|v h9
death.ally.card.once|s b11;o@s#1 b11
assist.me.glide.danceFirstGlide|aC95@l!v b12
proc.proc3|eC100@r d.51 p65~circle
`,
  summoner: `
p225|deploy:sentry
p225|deploy:kiln
a235|deploy:escort
p240|deploy:barricade
e260|deploy:kite
hit.me.sentry|s q.16,8
hit.me.kiln|s h4
shield.me.summon.other|v anti14,8~once
assist.me.barricade|s b5
assist.me.kite|s b5
always.nearsummon115|s res8
hit.me.summon|w9/strike.me.q.to v v take10
after.me.deployed|s qr26,8
hit.me.sentry|eC120@v#1!v d.37
shield.me.escort.other|v h5
---
p245|deploy:decoy
p260|deploy:lantern
e275|deploy:twinBirds
a270|deploy:medic
p275|deploy:mist
shield.me.decoy|s h5
assist.me.lantern|v extend32,4
assist.me.twinBirds|v slow20,2
heal.me.medic|v b5
alter.me.mist.slow|w8/strike.me.q.to v v add.18
cast.me.deployed|s anti14,3
always.selfedge90|s res10
move.on.leavesummon110|s qr32,8
assist.me.decoy.broken|aC128@v speed27,3
proc.proc4|v anti24,8~once
---
e285|deploy:runner
e285|deploy:lasso
p292|deploy:ambush
a295|deploy:shadow
p295|deploy:plate
hit.me.runner|s b7
assist.me.lasso|w8/strike.team.q.to v v add.21
interrupt.me.ambush|aC140@o#1 h5
assist.me.shadow|s h5
ward.me.plate|v addh4
always.nearsummon100|s anti16
push.me.summon|w9/strike.me.q.to v v add.19
death.ally.once|w9/strike.me.summon.from s v add.22
hit.me.runner|eC75@v!v p55~axis
proc.proc5|v anti25,8~once
---
p315|deploy:twinBows
p328|deploy:rail
p335|deploy:bell
a340|deploy:paperGuard
p340|deploy:frostHook
hit.me.twinBows.second|w8/strike.team.q.to v v add.22
assist.me.rail|s b7
hit.me.bell.second|v slow26,2.2
ward.me.paperGuard|v addh5
pull.me.frostHook|s anti21,8~once
cast.me.deployed|s q.22,8
always.awaysummon200|s res10
move.on.entersummon105|s h5
assist.me.twinBows.stage3|eC68@o d.37;eC68@y d.37
proc.proc3|v root.85
---
a340|deploy:mirror
l345|deploy:roadBeast
a368|deploy:bodyguard
p370|deploy:hexWard
p370|deploy:mirrorWeave
assist.me.mirror|t b6,5
shove.me.roadBeast.first|v addp25
assist.me.bodyguard|v h6
ward.me.hexWard|v addh5
assist.me.mirrorWeave|v b12,5
always.nearsummon145|s anti16
hit.me.summon|w9/strike.me.q.to v v take15
assist.me.broken|s b8
assist.me.mirror|v p48~left
proc.proc4|v anti30,8~once
---
p375|deploy:orbitBeast
p405|deploy:shoreBeast
p395|deploy:paperBeat
a400|deploy:rescue
p405|deploy:bridge
shove.me.orbitBeast|v addp28
push.me.shoreBeast.out|aC160@s#1 b8
assist.me.paperBeat.body3|s q.26,9
ward.me.rescue|v addh7
mend.me.bridge|v addh5
always.nearsummon140|s res12
hit.me.summon.farsummon320|s h6
death.ally.once|w9/strike.me.summon.from s v add.30
assist.me.orbitBeast|eC78@v!v p48~eventaxis
proc.proc4|aC110@v#1!v h9
---
p475|deploy:ensemble
p480|deploy:gates
a*|deploy:paperPack
p470|deploy:armorBeast
p490|deploy:returnBeast
shield.me.ensemble.damage|v h6
assist.me.portal|v b10
assist.me.paperPack.stage3|v b12,5
shield.me.armorBeast|v anti23,8~once
shield.me.returnBeast|v anti25,5
cast.me.deployed.farsummon310|s guard23,8~ranged
push.me.summon.out|s b9
death.ally.once|s h11
assist.me.ensemble.body3.protect.damage|aC100@o b11
shield.me.returnBeast|aC102@v#1!v b13
`,
  binder: `
e260|t d1.05 slow24,2.2
e250|t d1.08 l48~self
p255|eC70 d1.04 slow20,2
e250|t d1.07 short38,6
s|s b12;w8/hurt.to.direct s u slow20,2
alter.me.slow.binderActive|w8/strike.team.q.to v v add.15
pull.me.binderActive|s h4
alter.me.slow.binderArea|s b5
alter.me.short.binderActive|w7/strike.q.from v v take-12
absorbshield.me.on.binderAbsorb|s q.17,8
always.faraway220|s res9~ranged
alter.me.slow.stand15.binderActive|v slow.5~extend
move.on.normalwalk.escapedWarning|s qr30,8
proc.proc1|w8/strike.team.q.to v v addp40
proc.proc3|z2/hold eC65@l slow15
---
e275|t d1.11 tether96,5
e275|t d1.13 l65~shore
p280|z7/first eC87 d1.11 root.65 slow16,2.2
l270|eL270,55 d1.14 l54~spine
p265|eC92 d1.10;aC92 b12
alter.me.tether.binderActive|s q.19,8
assist.me.binderShore|v signal
alter.me.root.binderActive|aC135@v#1 b5
pull.me.line.binderActive|w8/strike.team.q.to v v add.17
ward.me.damage.binderMist|v addh4
always.binderOwnedSlow|s range24
always.selfedge95|s anti15
move.on.normalwalk|w8/strike.q.from s v take11
proc.proc1|v l45
proc.proc3|eC70@v!v slow25,2.4
---
p305|eC100 d1.20 l80
p315|eC110 d1.21;eC110#2 l72~banks
e310|t d1.23;w8/shove.team.to t v addp-35~pct d.31
p310|eC105 d1.22 p68
l295|eL295,68 d1.21;eL295,68#1?walking halt
pull.me.binderArea|w8/strike.team.q.to v v add.20
pull.me.binderMulti|s b7
alter.me.bindercatch|u b6
assist.me.binderSpread|v signal
alter.me.halt.binderActive|v d.19
strike.me.q.otherpull2|v take14
move.on.normalwalk.recede85|s qr40,8
always.stand15|s anti15
proc.proc1|eC65!v l40
alter.me.bindercatch.binderTangent|v signal
---
l275|.4 eL275,105 d1.30 short50,6~pct
p335|eC125 d1.31;z8/leave eC125 short52,6
l320|eL320,78 d1.30 aimp0,8~in
p335|.55 eC110 d1.36 slow30,2.8
a335|t b17;w8/hurt.to.direct t u slow28,3
alter.me.short.binderActive|w8/strike.team.q.to v v add.23
alter.me.binderLeave|s b7
alter.me.binderRail|u h5
alter.me.slow.binderJaws|s q.25,8
alter.me.slow.binderCounter|t anti20,8~once
always.binderControl130|s res11
assist.me.binderEntry|v b6
return.on|w9/alter.from.slow.binderArea s v slow.65~extend
proc.proc1.edge90|eC70@l d.36
proc.proc3.binderLongRail|v signal
---
e335|t d1.39;1 tC110 root1.1
e360|t d1.41;1 tC175@o l105,70~oldself
p365|eC134 d1.40;z9/leave eC134 short38,7~pct
p365|.62 eC120 d1.48 l82;.86 eC55 root1
p375|eC138 d1.38 p75;aC138 b17
alter.me.root.delayed.binderActive|w8/strike.team.q.to v v add.26
pull.me.binderOld|s h6
alter.me.short.binderGate|aC150@v#1 b7
alter.me.root.binderBasin|v d.21
after.me.binderCross|t h5
strike.me.q.far220.binderControlTarget|v take12
always.selfedge105|s anti17
move.other.card.low40.nearself175.perally.once.normalwalk|v b7
proc.proc1|eC110@p#1!v l60
proc.proc4|v p75~anchor
---
p375|eC145 d1.47;z9/shove eC145 addp35~anchor
p410|eC152 d1.49;z9/shove eC152 addp25~rotate
e400|t d1.45;w8/push.team.to t eC150@v#1!v p45~pct
l395|eL395,105 d1.52 p105~left;eL395,105#1 short58,8
p400|eC145 d1.46;z5/hold aC145?inside speed24;z5/hold eC145 slow23
alter.me.binderChanged|u b8
pushland.me.binderTide|v d.30
push.me.binderLink|aC145@l#l1?lifewounded h6
after.me.binderFold|s b8
assist.me.binderWind|v b7
strike.me.binderFieldHit.otherpull2|v add.25
always.twoallies155|s anti18
deploy.me.binderFar305|s guard19,8~ranged
proc.proc1|eC75@l#1!v p60~eventaxis
proc.proc2|aC165@r#1 b11
---
p440|.45 eC190 d1 l112,96;.45 z4/hold eC190 slow45~out
p470|.55 eJ128,220 d1.34 l108~well
p*!|eC177 d1.08;z9/shove eC177 addp0~pull
p460|eC174 d1.60 short50,8~pct;aC174 anti33,9~once
l520|eL520,98 d1.66 p105~axis;.28 eC90@f l70
pull.me.binderGravity|w8/strike.team.q.to v v add.29
pull.me.binderWells|s b10
alter.me.binderInverse|u b9
after.me.binderRetreat|t h7
after.me.binderHeadTail|t d.26
always.selfedge110|s anti19
strike.team.handattack.binderOverlap|v add.28
death.ally.card.once|a guard25,9
proc.proc1|v short60,8~binderout
proc.proc3|eC75@l!v l55
`,
  lifebringer: `
a300|t regen4,1,3
a280|t h8;1.4 t h5
p270|z7/first aC78 h12
a285|t b11;w10/break.to.sameShield t t h5
e250|t d1.12;aC105@t#1 h6
heal.me.renewFinal.effective|v h3
mend.me.lifeSprigFirst.low45|v addh3
heal.me.lifeDew.effective|v speed13,3
break.me.lifeGuard|v anti18,8~once
after.me.lifeDamageHeal|s h3
mend.me.lifeActive.nearself105|v take9
move.on.normalwalk|w8/mend.me.from.lifeActive s v addh3
always.selflow50|s anti12
heal.me.renewFinal|aC110@v#l1!v?lifewounded h5
break.me.lifeGuard|z4/first aC65@v!v?lifewounded h6
---
a315|t h5;w8/hurt.to.direct t t h14
a310|t h5;w8/move.to.normalwalk t t h14
s|aC95@s h6;1.4 aC95@s h6
a315|t b13;w8/hit.from.direct.handattack.effective t t conserve70~life
p305|eC92 d1.19;1 aC92 h10
heal.me.lifeBud.effective|v b5
heal.me.lifeStep.effective|aC80@v#1!v?lifewounded h4
heals.me.lifeGrove.lifeMulti|v h3
mend.me.lifeConvert|v addh3
heal.me.lifeArrowHeal.lifeDamageHeal.lifeFirst.effective|v b5
always.lifeGroveNear100|s speed13
always.selfshield|s healamp8
heal.on.low45.effective|s h5
proc.proc1|z4/first aC72@v!v?lifewounded h7
proc.proc2|v anti24,8~once
---
a325|t h15;.7 aC165@t#l1!t h10
a330|t h13;2 aC115@t!t h6
p325|z8/hurt aC100 h8
a335|1.8 aC105 h13
l290|eL290,66 d1.24;oL290,66#1 h10
heal.me.lifeVineSecond.effective|v b5
heals.me.lifeCluster.lifeMulti|v h4
heal.me.lifeBorrow.effective|v b6
heal.me.lifeFootleaf.lifeFirst.effective|v anti20,8~once
after.me.lifeBlade.lifeDamageHeal|s h5
mend.me.lifeActive.low35|v take12
heal.me.lifeActive.over|v signal
move.on.normalwalk.nearally100|s h4
heal.me.lifeVineSecond.effective|aL165,50#1!v?lifewounded h8
proc.proc4|t h6
---
p340|.9 aC125 h4.5;1.8 aC125 h4.5;2.7 aC125 h4.5;3.6 aC125 h4.5
p350|z8/move aC128 h16
l330|aL330,76 h9;1.2 aL330,76 h8
a350|t b17 regen3,.9,3~after
p345|eC123 d1.32;aC123 returnhp35,8,10
heal.me.lifeLichenThird.effective|v h4
heal.me.lifeLanding.effective|v b6
heal.me.lifeLineSecond.effective|v h3
ward.me.lifeActive.lifeRootWard|v addh5
heal.me.lifeScar.effective|v anti25,8~once
mend.me.lifeActive.nearself130.low45|v take12
heal.friend.on.effective|s speed17,3
death.ally.card.once|s h7;oC140@s#1?lifewounded h7
heal.me.lifeLichenFourth.effective|v h7
proc.proc2|aC80@v!v?lifewounded h7
---
a365|1 g shareheal5.5;2 g shareheal5.5;3 g shareheal5.5;4 g shareheal5.5
o375|g b18;w8/break.to.sameShield.oncecast g v h13
p375|z8/leave aC143 h17 b9
a380|t h12 rewind0,35,14,2,2,1
p385|eC130 d1.42;aC130#l1 b15 regen5,1,2~after
heal.me.share.effective|v b6
break.me.lifeTwinBreak|g!v h5
heal.me.lifeForest.effective|v speed18,3
heal.me.historic.effective|v guard18,8
mend.me.lifeSharedBranch.lifeGrantedWard|v addh4
always.lifeOwnHealingArea|s anti17
mend.me.lifeActive.out|v take12
death.ally.card.once|w9/mend.me.from.lifeActive s v addh6
proc.proc1|g anti25,8~once
heal.me.historic.historicHealed10.effective|v b9
---
p385|aC165#l1 h11;1 aC165#l1 h11;2 aC165#l1 h11
a405|.8 aC130@t h6;1.6 aC130@t h6;2.4 aC130@t h6
p410|z8 aC155 h17;3 aC155 h7
a405|t b23;w12/break.to.sameShield t aC110@v h10
p405|eC148 d1.51;aC148#l1 h15;1.2 aC148#l1 h9
heal.me.lifeCircuitRepeat.effective|v h5
heal.me.lifeRoamOther.effective|v b7
heal.me.lifeSoilAgain.effective|v res15,2.5
heal.me.lifeMirror.lifeFirst.effective|v h4
heal.me.lifeDewneedle.effective|v q.22,9
always.lifeHasHot|s res11
heal.me.out.effective|v anti22,8~once
heal.friend.on.low40.effective|oC130@s#1?lifewounded h6
heal.me.lifeCircuitThird|v h9
heals.me.lifeMirror|v b12
---
s|a rewind8,45,28,3,3,.7
p470|aC175 bloom110,20,.4,1.8~history
p465|z9/reservoir aC175 bank50,35,18;aC175 h6;1 aC175 h6;2 aC175 h6
a*|t h19 returnhp50,10,19~refund
p480|eC150 d1.34;s bloom78,14,.75~hits
heal.me.historic.crossheal15.effective|v b8
heal.me.oldstep.lifeFirst.effective|v anti25,8~once
assist.me.bank.effective|s b6
heal.me.refund.effective|v speed20,3
heal.me.lifeStarbranch.lifeFirst.effective|v b8
return.ally.card.once|v h12
always.lowally145|s anti18
death.ally.card.once|w9/mend.me.from.lifeActive.lifeOther s v addh6
proc.proc1|v h10
proc.proc4.out|v b15
`,
  warlock: `
e255|t d1.23
s|eC75@s d1.10 p40
e245|t d1.12 slow18,2
p235|.55 eC65 d1.18
p70|s dash70;eC65@o d1.05
hit.me.singleactive.skill.direct.effective|s q.16,8
push.me.skill.area.foe|s h4
alter.me.slow|w8/strike.team.q.direct.to v v add.16
hit.me.mageDelay.effective|s b5
dash.on.mageStep|s anti18,8~once
cast.me.mageSteady|s signal
always.selflow50|s ampq10
always.nearally110|s res8
hit.me.effective|eC65@v!v d.36
after.me|eC65#1?ownhit short35,7
---
e270|t d1.06 dot.14,1,2
l275|eL275,46 d1.27;eL275,46#1 p38
p280|eC78 d1.24 slow20,2.5
e265|t d1.25;eC100@t#1!t d.41
s|s b15;w10/break.to.sameShield s eC75@s d.76
hit.me.mageLastBurn.effective|s h5
shove.me.line.first.skill.foe|v addp22
alter.me.slow.mageTwoSlow|s b6
hit.me.mageArc.effective|s q.19,9
hit.me.mageRetort.effective|s h5
always.nearally135|s anti15
move.on.normalwalk|s qr35,8
always.mageChilled|s res10
hit.me.mageLastBurn.effective|eC95@v#1!v d.38
hit.me.mageRetort.effective|eC75@s p58
---
l310|eL310,64 d1.37;eL310,64#1 p50
p320|.6 eC90 d1.38 p58
e305|t d.92;.55 t d.54
p310|z8 eC92 d1.38 i
l305|eL305,68 d1.33;eL305,68?burned d.24
push.me.line.skill.foe|s q.20,8
push.me.mageDelay.area.foe|s b7
hit.me.mageRepeat.direct.effective|v p24
interrupt.me.zone|v slow16,3
hit.me.direct.burned.effective|s h5
receive.on.direct.enemy.ranged.mageStill|s take-18
move.on.normalwalk.recede80|s q.18,8
always.nearenemy100|s anti13
push.me.first|eC95@v#1!v d.42
interrupt.me.zone|eC75@v!v p55
---
p345|.8 eC120 d1.57 p70
p345|.55 eC115 d1.43;.55 eN115,42 p85
p320|eX295,56 d1.37;eX295,56?cross d.28
p335|eC108 d.86;.65 eC108@p+70 d.73
s|eC118@s d1.37 p74;s b17
push.me.mageDelay.skill.foe|s q.25,9
shove.me.rim.foe|v addp24
hit.me.mageCross.effective|s h6
strike.me.mageMovingNew.direct|v add.22
always.selfshield.near120|s res11
move.on.normalwalk.escapedWarning|s qr48,9
push.me.foe|v short35,7
hit.me.mageMulti.effective|s b7
after.me|.55 eC76 d.44
push.me.rim.mageRimPaid|eC70@l!v d.36
---
p365|.5 eX250,68 d1.55;.5 eX250,68?cross d.24
l395|eL395,83 d1.54;eC75 d.29
p395|.65 eC145 d1.58 p90~edge
p370|eC120 d.94;1 eC85@j d.70
p380|z8 eC125 d1.53 slow26,3
hit.me.cross.direct.effective|s q.27,9
hit.me.mageCometBoth.effective|v p44
exit.me.skill.foe|oC150@s#1 b8
hit.me.mageReflection.effective|s b8
alter.me.slow.zone.mageFirstSlow|w8/strike.team.q.direct.to v v add.23
always.mageFieldNear115|s res12
strike.me.skill.direct.far310|v add.22
death.other.card.once|s q.28,9
proc.proc1|z3/hold eC85 slow24
after.me|eC85@j l58
---
p410|.8 eC155 d.60;1.6 eC155 d.60;2.4 eC155 d.60
p435|.55 eC160 d1.60;.55 eN160,58 p98
p425|eC148 d.88;.75 eC148@j d.91
l435|eL435,92 d1.62 i short30,8~pct
p405|eC145 d1.50;aC145 b20
strike.me.mageStormLast.first|v add.23
shove.me.rim.foe|v addp28
hit.me.mageCloudShift.effective|s h7
interrupt.me|w8/strike.team.q.direct.to v v add.28
ward.me.mageFlameFirst|v addh4
hit.me.skill.direct.far320.effective|s b8
always.nearally125|s anti18
strike.me.q.direct.selfin.out|v add.23
hit.me.mageStormLast.first.mageStarPaid.effective|v p90~anchor
after.me.mageCloudShift|eL90,60@p d.45
---
p465|.60 eC165 d1.46;.95 eC66@f d.42
p490|.43 eC178 d1.53 p113;.43 eC75 d.57
l*|.62 eL680,78 d1.76 i
p475|eC154 d1.32;.65 eC112@h d.61
p460|eC170 d1.34;aC170 b18;w8/strike.direct.handattack.from aC170 v add.37
hit.me.mageFissure.effective|s b10
shove.me.mageStarCore|v addp31
interrupt.me.line|w8/strike.team.q.direct.to v v add.31
strike.me.mageFrequencyRepeat.direct|v add.24
assist.me.mageAid.perally|v h7
cast.me.faraway310|s guard24,8
exit.me.skill.foe|oC170@s#1 b10
death.other.card.once|w10/strike.me.skill.direct.handattack.from s v add.38
hit.me.mageFissure.effective|z3 eC72 d.36
assist.me.mageAid|v b10
`,
  assassin: `
e130|t d1.35
e155|t d1.24
e145|t d1.10;1.1 t d.18
e135|t d1.19;s dash48~left
e145|t d1.12;s dash62~away
hit.me.singleactive.melee.skill.direct.effective|s q.14,8
strike.me.q.foe.direct.near110|v take10
hit.me.delayed.effective|s h4
dash.on.shadowSide|s anti18,8~once
dash.on.shadowBack|s b5
strike.me.q.foe.direct.low40|v take10
move.on.normalwalk.approach75|s qp20,8
always.nearally105|s res8
hit.me.effective|w8/strike.me.q.shadowEdgeLoaded.to v v addp40~side
dash.on.shadowBack|z6/first eC65@o short35,6
---
e195|s dash70~side;t d1.38
p115|s dash115;eC60@s d1.31
e205|t d1.28;w8/move.to t v d.24
e182|t d1.37;t?moving halt
s|s b13 phase2.5
dash.on.shadowSide|s b6
hit.me.shadowLanding.effective|s q.20,9
hit.me.shadowMarkMove.effective|s h5
alter.me.halt|w8/strike.team.q.direct.to v v add.16
alter.on.phase|s anti20,2.5
strike.me.q.foe.direct.moved|v take12
shield.friend.on|w8/strike.me.melee.direct.handattack.from s v add.16
always.selfin.selfedge90|s speed12
dash.on.shadowSide|.45 eC70 d.40
alter.me.halt|v armor7,4
---
e192|t d1.24;w9/strike.friend.direct.handattack.to t v addp62
e235|t d.95;.55 t d.50
e235|s dash75~far;t d1.38
e250|t d1.29;w8/hit.friend.direct.handattack.to t v d.36
e235|t d1.39 i;s dash65~away
assist.me.shadowrelay.effective|s q.22,9
hit.me.repeat.effective|v p25
dash.on.shadowCross|s res12,3
assist.me.shadowmark.effective|v b5
interrupt.me|v slow18,3
shove.me.q.near95|v addp19
break.me.foe.primarybreak|s h6
dash.on|s guard18,8
after.me|w9/strike.friend.direct.handattack.to t v addp62~left
hit.me.second.effective|v l52
---
e205|t d1.50;s phase2.2
p310|z8 eC85 d1.48 root.8
l250|eL250,63 d1.49;s?damage dash75~side
s|s b16 phase2.8 q.31,9
e315|t d1.48;.65 eC78 d.34
alter.on.phase|s qp29,9
alter.me.root.shadowPin|s b7
hit.me.line.effective|s guard18,8
always.selfin.shadowPhase|s speed18
strike.me.direct.shadowOffhandNew|v add.21
strike.me.q.foe.direct.otherinterrupt|v add.23
dash.on.shadowEscape100|s h6
move.on.normalwalk.inside|s anti16,3
after.me|w9/shove.me.q.shadowPushLoaded.from s v d.36
alter.me.root.shadowPin|eC80@v#1!v slow28,3
---
e315|t d1.52;t?assassinLow d.38
e330|t d1.52;t?assassinPushed d.33
p340|.55 eC110 d1.58 i
e320|t d1.47;w9/push.friend.handattack.to t v d.49
e285|s dash84~near;t d1.54;s b17
hit.me.direct.effective.low35|s h6
hit.me.skill.direct.effective.pushed|v p34
interrupt.me.shadowDelay|w8/strike.team.q.direct.to v v add.24
assist.me.shadowchase.effective|v b7
always.shadowWrap|s res12
strike.me.direct.handattack.shadowSwitch|v add.22
move.on.normalwalk.escapedWarning.once|s b8
always.selfin.out|s range40
hit.me.shadowExecute.effective|eC85@v!v d.45
assist.me.shadowchase.effective|v p74~out
---
e275|s dash72~near;t d.78;.65 eL275,78@s d.94
e380|t d1.14;.45 t d.62
l385|eL385,76 d1.58 p115~edge
o*|s dash300,82~escort;t b19;eC90@s d1.39
e365|t d1.60 i;s phase2.8 b15
hit.me.shadowReturnBoth.effective|s h8
hit.me.shadowTwoSides.effective|v p42
shove.me.shadowEdgePush|v addp27
shield.me.other.shadowBorrow|s b8
alter.on.phase.shadowCut|s anti26,8~once
strike.me.q.foe.direct.near115|v take14
dash.friend.card|w8/strike.me.q.direct.shadowLandingNear140 v v add.24
return.on|s q.27,9~manual
hit.me.shadowReturnBoth.effective|v p80~eventaxis
shield.me.other.shadowBorrow|s guard24,8;t guard24,8
---
x390|.25 t d.82;.65 t d1.18 p135~out i
e440|t d1.20;.6 t d.71 p112
p*|.7 eC160 d1.65 i;.7 eC160#1 d.31
e450|t d1.76;z9/shadowpush eC85 d.49
x430|t d1.70 p114~out;oC180@s#1?card+assassinOutsideHit b13
hit.me.skill.foe.out.effective|s h8
shove.me.shadowTwoSides|v addp28
interrupt.me.area|s q.29,9
assist.me.shadowpit.effective|v b9
ward.me.shadowShore|v addh5
always.selfedge110|s anti18
assist.me.shadowclear.effective|v q.25,9
death.other.card.once|s b12
hit.me.skill.foe.out.effective|oC160@s#1?card+notFull h9
proc.proc5|v anti35,8~once
`,
  ranger: `
e280|t d1.20
e245|t d1.22 p34
e310|.45 t d1.16
l265|eL265,32#1 d1.17 slow18,2
e240|t d1.09;s dash55~away
hit.me.skill.notArea|s qr28,8
push.me.skill|s h4
strike.me.skill.notArea.stand15|v take9
alter.me.slow|w8/strike.me.q.to v v take12
dash.me.on|s b5
strike.me.q.far200|v take9
move.on.notReturning|s res10,3~ranged
death.ally.once|s q.18,9
hit.me|.12 eL105,32@o#1!t d.42
proc.proc5|eC72@r p44
---
l300|eL300,34#2 d1.27/.65
p305|eL305,32@o^-15 d.71;eL305,32@o^15 d.71
e295|t d1.28 p62
p100|s dash100;.30 eC270@s#1 d1.25
p310|z8/first eC75 d1.23 p48
hit.me.line.notFirst|s b5
hit.me.second|s ampq16,9
push.me.skill|s qp22,8
dash.me.on|w8/strike.me.direct.from s v add.16
hit.me.zone|aC130@s#1 b5
move.on.dist90.recede.notReturning|s qr34,8
strike.me.far245|v add.16
always.selfshield.selfin|s speed12
hit.me.line.notFirst|v p54~out
proc.proc5|.14 eC75@p!v d.38
---
e310|t d1.34;.18 eC140@t#1!t?landed d.80
p330|eC92 d1.31;.6 k#1 d.28
l320|eL320,42 d.91;.55 eL320,42 d.56
e330|t d1.35 p70~edge
e315|t d1.28;w8/move.to t v d.34
hit.me.ricochet|v p27
hit.me.delayed.notArea|s q.22,8
hit.me.second|v p42
shove.me.edgepush|v addp24
hit.me.footfall|s qr46,9
strike.me.q.switchq|v take12
always.selfin.out|s qr40
move.on.dist85.noapproach.selfin.notReturning|s b6
hit.me.ricochet|.16 eC105@v#1!v?notPicked d.42
proc.proc3|v p42~from
---
p330|.45 eC90 d1.44
l355|eL355,76 d1.43;eL355,24 d.17
p345|.55 eC105 d1.45 p78
p340|eC110 d.82;.7 eC110@p+65 d.72
e345|t d1.42;w8/move.to t eC72@v d.38
hit.me.ground.rim|v p30
hit.me.line.centerlane|s q.23,9
hit.me.ground.area.timed|s b7
strike.me.ground.stage2.notRepeat|v add.20
hit.me.footfall|v slow18,3
hit.me.skill.far255|s h5
hit.me.multi.flankhit|w8/strike.team.q.to v v add.20
hurt.on.direct.melee|s qr42,9
proc.proc1|.26 eC70@l!v d.41
proc.proc4|z2.8/hold eC80@z slow25
---
p360|z8 eB240,52 d1.50 p70~side
l370|eL370,85 d1.51 p90~side
p380|.55 eC122 d1.60 p94
p375|eC125 d1.00;2 eC125 d.67
p365|z8 eC140 d1.43;z8 aC140 b14
push.me.zone|v short50,7
shove.me.side|v addp22
push.me.skill.timed.out|s b9
strike.me.skill.repeatgap10|v add.22
ward.me.zone|v addh4
always.faraway260|s ampq12
move.on.dist90.recede.notReturning|s guard20,8
push.team.skill|w9/shove.me.q.to v v addp30
proc.proc1|.26 eC78@l d.47
hit.me.second|v p85~out
---
e380|.4 eC95@t d.54;.8 eC95@t d.54;1.2 eC95@t d.54
p425|.65 eC140 d1.64;.65 eN140,50 splinter55,.40,.14
a405|.22 eC250@t#1 d.46;w9/hit.from.q t v d1.28
l430|.28 eL430,105 d1.62 p95~edge
p410|z9 eB260,75 d1.60 i
hit.me.stage3.picked.third|w8/shove.team.to v v addp35
strike.me.ground.delayed.notRepeat|v add.22
hit.me.relay|t b7
shove.me.edgepush|v addp24
interrupt.me.zone|w8/strike.team.q.to v v add.25
hit.me.skill|w9/strike.me.q.to v v take14
always.selfin.selfedge110|s anti18
receive.on.direct.twoenemies160|s take-22
hit.me.stage3.picked.out|eC90@v!v d.53
proc.proc3|t anti35,8~once
---
p*|1.40 eS165,75 d1.43
l*|.55 eL750,84 d1.77;.55 eL750,84#f1 p115
p*|1.15 eC174 d1.31;1.15 eN174,55 p98
p490|eC153 d1.34;.8 eC118@m d.70
p475|.9 eM340,53,82 d1.40 p112~side
hit.me.ground.aimfar420|s q.27,9
hit.me.line.longhit|s b9
shove.me.rim|v addp29
strike.me.mirrorhit.second|v add.27
strike.me.secondlane|v add.21
move.on.notReturning|s qr60,8
push.friend.out|w8/strike.me.q.to v v add.30
death.ally.once|w10/strike.me.skill.from s v add.38
after.me.landed|.45 k#b1 p95~anchor
after.me.both|aC118@m b11
`,
  spellbreaker: `
e170|t strip.40;.15 t d1.12
e160|t d1.15
l170|eL170,52 d1.07 i
e180|t d.98 armor6,6
s|s b12 guard18,8~skill
break.me.skill.foe.primarybreak|v d.18
hit.me.singleactive.foe.direct.effective.notAbsorbed|s b4
interrupt.me|s ampq12,9
strike.me.q.foe.armored|v take10
absorbshield.me.on.spellabsorb|s h4
charge.enemy.nearself110|s anti12,4
move.on.normalwalk.once|s qr24,4
death.other.card.once|s b9
break.me.skill.foe.primarybreak|w8/strike.team.q.direct.to v v add.21
absorbshield.me.on.spellabsorb|uC250@v d.38~reflect
---
e210|t d1.18 i
l210|eL210,58 d1.20;w6/startMove.to k v slow20,3
e205|t d1.18;w8/strike.from.q.enemy.ally.direct t v take-22~spellbasic
a255|t guard30,8~skill
p118|s dash118;eC78@s d1.20 strip.34
interrupt.me|oC135@s#1?card b6
alter.me.slow|s qr30,9
protect.me.spellbasic.effective|u d.18
protect.me.guard.effective.card|v h5
break.me.spellwedge.foe.primarybreak|v p38
strike.me.q.charge|v take12
forcedland.on.enemy|s b6
receive.on.enemy.direct.ranged|s take-10
interrupt.me|eC105@v!v d.36
protect.me.guard.effective|u short20,6~pct
---
e245|t d1.25 armor12,8
p295|eC95 d1.32 strip.30
a290|t guard38,8,.38~spellranged
e235|t d1.26 stall.9,8
l260|eL260,60 d1.29 p70;k?spellfirst i
strike.me.direct.foe.ownarmor|v add.22
break.me.skill.area.foe.primarybreak|s b7
assist.me.reflect.effective|v h4
alter.me.stall|s q.20,9
interrupt.me.linecast|v short35,7
receive.on.enemy.direct.skill.selfshield|s take-12
break.on.enemy.primarybreak.once|eC90@s d.31
strike.me.q.otherinterrupt|v add.18
alter.me.armor|w8/strike.friend.direct.to v v add.26
assist.me.reflect.effective|v b9
---
l270|eL270,72 d1.35;z8/wall aL270,72 guard40
p315|eC112 d1.37;eC112#1?charge l62 i
a325|t b17;w8/break.to.primarybreak.enemy.sameShield t u d.54~reflect
e310|t d1.37 short45,8~spellmove
l285|eL285,74 d1.38 shed1
protect.me.wall.effective|v b7
interrupt.me.ownpull|v d.23
break.ally.enemy.primarybreak.ownshield|v h5
alter.me.skillshort.effective|oC145@s#1?card b7
remove.me.notZone.foe.effective|v armor8,5
always.nearcast135|s res11
shove.me.q.charge|v addp36
deploy.me.zone|s q.25,9
protect.me.wall.effective|eC85 d.46
remove.me.notZone.foe.effective|w9/strike.team.skill.direct.handattack.to v v add.30
---
e310|t d1.44 stall1.8,8
p355|eC135 d1.49 erase1
a360|t guard48,9,75,260~spellpush
l325|eL325,85 d1.47;k?spellfirst armor13,8;k?spellsecond p88
e300|t d1.46 i;s dash70~away;s b12
alter.me.stall|s b9
remove.me.zone.effective|oC150@s#1?card+notFull h6
shove.me.spellrepel|v addp25
after.me.splitetch|w8/strike.team.q.direct.to k?splitpartner v add.22
ward.me.retreatcut|v addh5
strike.me.q.foe.foedash20|v add.20
always.selfin.hostilezone|s speed17
interrupt.me.skill|oC150@s#1?card anti20,8~once
alter.me.stall|v l62~in
after.me.retreatcut|eL70,60@o!t d.40
---
e360|t d1.56;w8/strike.from.skill.enemy.ally.direct.unreversed t v take-55~spellreverse
p420|eC152 d1.56;eC152?charge i;aC152#1 b21
a415|t guard54,9,.52,85~spellburst
p400|eC154 d1.40;z9/charge eC154 root.8
e410|t d1.60 shed1~borrowed
protect.me.hostileSkill.effective.card|v b8
interrupt.me.area|s h6
assist.me.countergroup.multi|v h6
alter.me.root.foe|w8/strike.team.q.direct.to v v add.27
ward.me.borrowed|v addh5
always.spellcut140|s res13
protect.me.effective.card|v speed19,3
interrupt.me.doubleinterrupt|s q.30,9
protect.me.spellreverse.effective|uC350@v p85~eventaxis
proc.proc5|aC125@v#1!v?card b10
---
p*|eC160 d1.22 i erase
l*|eL620,95 d1.67 i erase
a480|t b26 reflect60,10,.85~spellshield
p480|eC175 d1.63 i;z9/precharge eC175 stall1.5,1
p465|eC170 d1.35 shed1;aC170 b16
remove.me.zone.effective|oC190@s#1?card b10
interrupt.me.linecast|v p44
assist.me.reflect.effective|v anti28,8~once
alter.me.stall|w8/strike.team.q.to v v add.30
remove.me.notZone.foe.effective|oC155@s#1?card+notFull h6
remove.me.zone.clearedZone|s res15,4~reclaimed
interrupt.me.differentcut|s ampq20,8~lasting
death.other.card.once|a?card b10
remove.me.zone.effective|aC95@p?card h10
assist.me.reflect.effective|eL320,56!u d.42
`,
  paladin: `
e164|t d1.18 p36
a225|t h11
a210|t b12
e160|t d1.09 p64
s|z5/hold aC110@s res12
push.me.singleactive.foe|oC120@s#1?card+notFull h4
heal.me.singleactive.other.card.effective|v guard10,8
shield.me.other.card|s h3
push.me.skill.foe|w9/strike.me.q.direct.to v v take10
always.banneranti|v anti10
mend.me.skill.stand15.healroom|v addh3
move.on.inside.normalwalk|s b4
always.nearcard105|s res8
proc.proc1|v b6
proc.proc3|v h4
---
a245|t b16,10
l215|eL215,68 d1.24;oL215,68#1 h7
e190|t strip.30;.13 t d1.28
a270|t h8 anti32,8~once
s|s b16;w10/break.to.primarybreak.enemy.sameShield s eC86@s d.58~reflect
shield.me.other.card|v speed16,3
mend.me.palhit.other.healroom|v addh3
break.me.skill.foe.primarybreak|s q.22,8
protect.me.anti.other.card.effective|v b5
break.on.enemy.primarybreak|eC130@s#1 d.18~reflect
always.nearcard115|s anti15
move.on.normalwalk.nearcard95|s h3;oC95@s#1?card h3
heal.friend.on.effective|s b4
proc.proc1|w8/hit.from.direct.effectivehit.handattack.foe v aC80@u?card h6
break.on.guardbreak|eC86@s p50;oC100@s#1?card b7
---
e220|t d1.27;w8/strike.from.skill.direct.enemy.ally.unbound t v take-25~vow
e230|t d1.30;w9/hit.team.to.direct.effectivehit t u h9
o270|s dash105,64~escort;t b16
p280|eC95 d1.29;aC95 h9
a280|t guard34,8,0,.35~votive
assist.me.vow|oC125@s#1?card b6
assist.me.burning.other.card|v q.18,8
dash.me.on.escortdash|s b6
mend.me.area.healroom|v addh3
protect.me.guard.effective|u d.18~reflect
heal.friend.effective.card|w9/shove.me.q.melee.foe s v addp22
receive.on.enemy.direct.ranged.nearenemy120|s take-10
move.on.nearcard120.normalwalk|w9/mend.me.skill.healroom s v take12
protect.me.vow.effective|u d.38~reflect
protect.me.guard.effective|v anti30,8~once
---
p135|s dash135;eC125@s d1.34;aC125@s h9
e290|t d1.35;aC140@t#l1?notFull h12
p315|z8 aC125 b18;z8/leave aC125 h7
s|eC125@s d1.34 p78;aC125@s anti30,8~once
o310|t h13 conserve50
after.me.sanctuary.palhit.palhealed|s b7
heal.me.chainheal.effective|v speed18,3
ward.me.zone.other.card|v addh4
push.me.skill.foe|oC135@s#1?card b6
assist.me.share.effective|s h6
strike.me.q.foe.targetnearally120|v take12
always.ownwardmate|s anti14
life.on.crossed35.once|oC150@s#1?card h8
proc.proc1|oC155@s#l1?card+notFull+sanctuaryrim h7
proc.proc2|eC78@z!t d.37
---
p310|z8 aC145 b20;z8 eC145 d1.43
p345|.60 eC135 d1.55 p92;.60 aC135 b17
o350|t b21;w9/life.to.enemy.loss t g h10
l275|eL275,90 d1.45 p100~side;aL275,90 h14
s|aC155@s h15,12~fullward
shield.me.zone.other.card|s h5
after.me.sweptshield|t anti22,8~once
assist.me.bond.other|s b7
after.me.pallineheal|t d.20~reflect
ward.me.full.other.card|v addh5
always.selfshield.nearcard105|s res11
heal.me.other.card.effective|w8/move.to.normalwalk v s h4
shove.me.q.foe.inside.targetnearally100|v addp28
shield.me.zone.other.card|z5/first oC75@v!v?card b10
assist.me.bond.other|v anti40,1~bondpush
---
l370|eL370,94 d1.42;aL370,94 h12 anti35,8~once
p375|eC140 d1.34;aC140 h8 b7
o375|t swap;t b20;eD95 d1.50
e390|t d1.57;w9/hurt.from.ally.direct.effectivehit t v b13;w9/hurt.from.ally.direct.effectivehit t u d.57~reflect
a395|t b22 returnhp45,9,10~ownabsorb
mend.me.line.palhit.healroom|v addh4
ward.me.palhealedtarget|v addh4
dash.me.swap|s anti18,8~once;t anti18,8~once
assist.me.reflect.effective|oC145@s#1?card+notFull h6
heal.me.historic.effective|s b7
always.twowarded125|s res12
heal.me.low35.other.card.effective|v speed18,3
return.other.card.nearself190|v b8
proc.proc1|oC96@p!v?card h8
heal.me.historic.effective|uC330@v d.45~reflect
---
s|a?card guard55,10,22,.62~accord
p*!|eL670,108 d1.67 p95;aL670,108 b21
p465|aC175 h12 b14;w8/hurt.to.enemy.direct.effectivehit.oncecast aC175 u d.64~reflect
o*|t swap;eD128 d1.64;s h13;t h13
s|w9/hit.from.direct.effectivehit.handattack a?card aC82@v h9
protect.me.guard.other.card.direct.effective|v b6
after.me.horizonward|t h6
shield.me.other.card.palhealedtarget|v anti20,8~once
dash.me.swap.closerswap|s b9
assist.me.chorus.card|v b7
hurt.ally.card.enemy.direct.effectivehit.paltwinwound|s h5;oC145@s#1?paltouched h5
exit.other.card.palpushed.once|v b12
death.other.card|s ampq14,10~lasting
proc.proc1|aC115@v#1!v?card b12
proc.proc5|z3/hold aL180,68@v?card res16
`,
  berserker: `
e165|t d1.28
e150|t d1.14 p58
s|w8/hurt.to.direct.enemy.nearfrom150 s u d.94~reflect
p95|s dash95;eC66@s d1.08
s|s h11 ampq15,8
strike.me.skill.direct.melee.picked.foe|v addp22
push.me.skill.foe|s h4
hurt.on.direct.enemy.loss|s ampq14,9
dash.me.on.dist3|s b5
always.selflow50|s healrecv12
strike.me.q.near100.foe|v take10
always.nearcard110|s res8
life.on.crossed35.loss.once|s h8
proc.proc1.edgeAt105|v addp32
proc.proc4|eC66@s p52
---
e172|t d1.24;s leech28,8
e175|t d1.15;1.2 t d.20~dot
s|eC105@s d1.25;s leech4,12~perhit
e185|t d1.18 l58~self
s|s b15 qp45,8
heal.me.on.leech|s h3
hit.me.skill.timed.foe.effectivehit|s q.18,9
after.me.skill.twohits|s anti17,3
pullland.me.foe|w9/strike.me.q.to v v take14
shove.me.q.selfshield.foe|v addp24
heal.friend.on.loss|s q.17,8~manual
always.selflow55|s res8
strike.me.melee.foe.otherpush|v add.16
heal.me.on.leech.over|s overshield8
proc.proc3|kC105@s?effectiveContact p58
---
e185|s cost8;t d1.58 p82
l195|s cost10~current;eL195,70 d1.45 p92
e190|t d1.27,.34~wound
p125|s dash125;eC82@s d1.34 l62
s|s missing28 qp42,8
life.me.on.cost.loss|s b6
strike.me.skill.line.laneFirst.foe|v add.17
hit.me.woundBonus.foe.effectivehit|s h5
pullland.me.foe.nearlanding110|s ampq18,9
heal.on.amount12|s anti20,3
strike.me.melee.selflow45.low45.foe|v take9
shove.me.q.charge|v addp24
break.on.primarybreak|s h6
push.me.foe.rageProc1|v p40~side
pullland.me.twoDraws.rageProc4|w9/hit.me.q.from.foe s eC78@v d.36
---
s|eC132@o d.74;.55 eC132@o d.74 p65
l235|eL235,78 d1.36;kL235,78#f1 p70
p235|.65 eC115 d1.32;.65 kC60 p95
e220|s dash75~side;t d1.47 p103~from
s|s h12 guard36,6
strike.me.skill.rageSecond.foe|v add.20
hit.me.skill.edgeHit.foe.effectivehit|s qr48,9
hit.me.timed.ground.foe.effectivehit|s b8
shove.me.flankStrike.foe|v addp25
heal.me.on.skill.loss|s anti18,8~once
strike.me.skill.area.twoenemies130.foe|v take10
move.on.notReturning.approach80|s ampq15,8
pushland.on.enemy|s q.22,9
swing.me|eN162,30@o d.52 p55
absorbshield.on|eC78@s d.45
---
p175|s dash175;eL175,96 d1.66 p88~side
p180|s dash180;eC122@s d1.44 p116
e225|t strip.65;.14 t d1.60 p90
l310|eL310,78 d.78;.75 eL310,78 d.86
s|eC130@s d1.52;s leech5,15~perhit
hit.me.chargeLine.foe.effectivehit|s b9
strike.me.fall.core65.foe|v add.23
break.me.primarybreak.foe.skill|w8/strike.team.q.to v v add.30
hit.me.skill.rageSecond.foe.effectivehit|v p62~returnaxe
heal.me.on.skill.rise65|s res15,3
strike.me.q.selfin.out|v take14
return.on.once|s b10
life.on.crossed25.loss.once|s h10
proc.proc1|oC85@o b10
proc.proc4|v p62~side
---
s|s h14 choose200,8,90,1.76,90;eC105@s p64
p215|s dash215;eL215,82 d1.70;s h10
e325|t d1.66 p124;s?pickedout h15
s|eC155@s d.88;.55 eC155@s d.88 p115
s|s h18;w8/life.to.crossed45 s eC108@s d.86 p72
heal.me.on.skill.loss|s q.22,9
hit.me.chargeLine.foe.effectivehit|oC140@s#1?card h6
hit.me.skill.out.foe.effectivehit|s b9
shove.me.skill.rageSecond.foe|v addp28
always.selflow45|s res12
shield.friend.on|s qp31,8
after.me.skill.twohits|s b8
death.other.once|s h12
hit.me.q.foe.effectivehit|eC75@v!v d.45
proc.proc2|oC100@s?card b10
---
e270|s dash68~far;t d.48;s leech25,20~each;.35 s dash68~flip;.35 t d.60;.35 s leech25,20~each;.75 s dash68~flip;.75 t d.92 p145~from;.75 s leech25,20~each
p430|.65 eX250,72 d1.82,.24~crosscore
p235|s dash235;w1/exit.me.foe.owncast s s h18;eL235,90 d1.80 p145~axis
e390|t d1.78;s leech30,22,12~overflow
s|s defy20,8,0,1.22
shove.me.skill.rageThird.foe|v addp36
hit.me.skill.cross.foe.effectivehit|s b10
exit.me.foe.knocked|oC190@s#1?card b10
heal.me.on.leech.over|s ampq18,9
save.on.once|s h8
hurt.on.direct.enemy.amount15|eC105@s d.34
strike.me.selflow40.melee.foe|v take12
heal.me.on.loss|oC120@s#1?card+nowlow45 h5
push.me.rageThird.rageProc1|eC105@s!v d.52 p70
heal.me.on.leech.over|oC145@s#1?card overshield12,12
`,
  warden: `
e154|t d1.08 p108 i
l145|eL145,55 d1.02 p68~side
p90|s dash90;s b12
a185|t anti33,8~once
e160|t d1.06 slow20,2.2
interrupt.me.skill|s b6
shove.me.side|v addp18
dash.on|s res12,2
protect.me.anti.other|v h4
alter.me.slow|s ampq12,9
always.selfedge100|s anti12
strike.me.q.otherpush|v add.16
death.ally.once|s h9
interrupt.me|eC80@v!v p45~event
protect.me.anti|v b7
---
p105|s dash105;eC65@s d1.12 p100~axis
a230|t guard30,8~skill
e170|t d1.18 p98~side
p120|s dash120;s b15;eC74@s i
e195|t d1.10 l75,70~self
hit.me.fall|oC145@s#1 b5
protect.me.guard|v speed16,3
push.me.side|s anti16,3
dash.on|s ampq15,9
pull.me|s h5
always.recentwalk105|s res9
shove.me.q.edgeAt90|v addp18
break.on|oC145@s#1 b6
proc.proc1|oC80@o b8
pull.me|s dash42,.20~slide
---
e220|t d1.22 l100,72~self
e195|t d1.27 p110~in
p275|z8 eC95 d1.18 i
o270|s dash75~near;t b16
e205|t d1.25 p105;w8/strike.friend.to.direct t v addp26
pull.me|s b8
shove.me.centerward|v addp22
interrupt.me.zone|oC150@s#1 b6
dash.me.on.partner90|s anti18,3;t anti18,3
strike.relayowner|v add.22
always.twoenemies130|s res12
strike.me.q.pulled|v take16
move.on.enteredge80.once|s b5
pull.me.nearlanding90|z4/anchor eC75@v short55
proc.proc4.partneredge100|eC85@s p65
---
l230|eL230,120 d1.33 p108~side i
p300|eB215,80 d.90 p65~axis;z8/cross eB215,80 halt d1.32 p65~opposite
e240|t d1.35 l45~self;.45 t p125~axis
o300|t dash115,76~in;t b18
p150|s dash150;eC105@s d1.31 p60 i
sweep.me.side.multi|s b9
alter.me.zone.halt|v slow20,2.5
shove.me.ownpull1|v addp30
ward.me.skillmoved|v addh5
interrupt.me|w8/strike.team.q.to v v add.24
shove.me.q.edgeAt100.nearself125|v addp30
dash.on.skill|s speed18,3
return.other.nearself160.once.perally|v b7
proc.proc1.opposed|v p35~eventaxis
push.me.delayed|eC72@v!v p55~event
---
o310|t swap;t b24,12;eC100@s d1.40 p110
p170|s dash170;eL170,60#1 d1.46 l170,82~trail
l270|eL270,108 d1.44 p126~side;aL270,108 b16
o320|t dash140~away;t b20
p185|s dash185;z8 aC110@o b18
dash.me.swap|s b10
pull.me.nearself120|s q.24,9
after.me.sweptshield|t h5
dash.me.other.recede100|v anti25,8~once
shield.me.zone.other|v speed20,3
strike.friend.owninterrupt.nearfrom140|v add.21
strike.me.wardchain|v addp26
move.on.notreturning.forward|s guard16,8
dash.me.swap|t anti30,8~once
proc.proc5|eL130,70 d.55
---
p320|eC135 l70;.45 eC135 d1.52 p145~axis i
p390|eC145 d1.12;.55 kC145 p142~rewind
o365|s dash85~near;t b24;eC130@s d1.48 i
p385|eC155 d1.28;z9/charge eC155 l90 i
l280|eL280,112 d1.56 p132~side;eL280,112?rightlane slow28,3
drawgroup.me.multi|s b12
push.me.retraced|v short45,8
dash.me.on.partner90|s h5;t h5
interrupt.me.zone|aC155@z b8
push.me.side|s q.26,9
shield.me.other|w10/hit.from.foe.effectivehit v s h7
always.nearwindup145|s res13
dash.me.on.skill|s extend52,8
proc.proc1|v p40~eventaxis
interrupt.me.zone|aC155@z anti35,8~once
---
p460|aC175 b13;z10/hold aC175 exguard18
p*!|z.65/closing eK330,70,240 d1.13 p150~toward
o470|t b26 exguard18,9;w9/protect.me.exguard.to.owncast t uC320@v?foe p125~opposite
p455|.55 eC168 d1.42 p145~side i
o430|t swap;s b21;t b21;eD108 d1.61 p122~circle
protect.me.exguard|v b8~stack
push.me.pushpair110|w9/strike.team.q.to e?wardpair v add.30
shove.me.opposite|v addp28
interrupt.me.area|v vuln12,4
shield.me.pairedshield|m anti16,3
exit.me.foe|aC140@s#l1 h8
return.other.nearself170|s b9
death.ally.once|a b10
proc.proc1|uC260@v?foe p95~opposite
proc.proc5|z4/hold aC95@o res20;z4/hold aC95 res20
`,
  bulwark: `
s|s b18,10
s|s res18,5;w5/hurt.to.direct s s h6
a200|t guard24,8
e130|t d1.04 p70
s|s?notStand15 h10;s?stand15 h14~riveted
break.on.primarybreak|eC120@s#1 d.22
always|s anti12
always.nearally100|s res8
push.me.skill.foe|s b5
always|s healrecv12
receive.on.direct.setbrace|s take-12
hurt.on.direct.enemy.ranged|s b4
life.on.crossed40.once|s h7
break.on.guardbreak|eC100@s d.22 p46
protect.me.shoulder.nearself100.other|v b7
---
s|s res20,4.5 anti40,4.5
p135|s dash135,.22~slide;.22 s?arrived b15;.22 oC145@s#1?card+arrived b19
o225|s b9;t b14 split35,8
l160|eL160,60 d1.12 p85~axis
s|s h12 anti35,8~once
always.antiup|s res8~layer
ward.me.on.arrived|v addh6
redirect.me|s h6
push.me.skill.foe|s q.18,9
always.selfshield|oC95@s#1 anti12~tail
heal.me.on.skill.over|s overshield5
move.on.inside.notReturn|s anti16,4
hurt.on.absorbed|s qr34,9
protect.me.anti.on|oC135@s#1 anti40,8~once
proc.proc3|v b8
---
s|w8/hurt.to.direct.enemy.nearfrom160.notReflect.attackonce/2 s u d.72~reflect p28
p240|z7 eC105 d1.16 slow24,3
s|s b17;w10/break.to.owncast s eC105@s d.68
a260|t anti30,8,2~once
s|eC105@s d1.18 p92
hit.me.reflect|s h5
hit.me.zone|w9/strike.team.q.to v v add.20
break.on.primarybreak|oC110@s#1 b6
protect.me.anti.edgeAt100.other|v b5
push.me.skill.foe|v short25,6~pct
hurt.on.direct.enemy.melee|u slow18,2.5
protect.on.halfshield|s h5
always.nearally115|s anti16
hit.me.reflect.secondtotal|aC120@s#l1 b10
protect.me.anti.edgeAt100.firstbrace.other|v res18,2
---
s|eC180@s d1.10;eC180@s#2 taunt1,8
p270|z8 aC125 b15
e205|t d1.30 weak28,8~other
o260|t conserve50,7
s|eC122@s d1.28 p90;eC70@s i
protect.me.taunt|s b7
ward.me.zone|v addh4
alter.me.foe.weak|v slow16,3
assist.me.share|s h6
interrupt.me|v d.24
always.twoallies120|s res11
life.other.crossed40.nearself150|v b6
hurt.on.direct.provoked|s qp35,9
protect.me.taunt|eC85@u d.44
shield.me.zone|v anti30,8~once
---
o300|s b20,10;t split65,8
o310|s b16;t b16;w8/break.to.owncast.oncecast s t h9;w8/break.to.owncast.oncecast t s h9
s|oC165@s#1?selfshield b19;s?notSelfshield b19
p345|z8 aC150 guard35,8,65~parapet
l205|eL205,95 d1.42 p102 i;s b10
redirect.me|s q.25,9
always.selfshield.shieldmate|s anti16
shield.me.other|s h5
protect.me.zone|v b5
exit.me.skill.foe|oC150@s#1 b8
always.selfabove70|s res10~transfer
hurt.on.skill.enemy|s res13,3
death.other.once|s b14
redirect.me|w9/shove.me.q.from s v addp55;w9/hit.me.q.from s eC90@v!v p55
protect.me.guard.zone.pushprepared|u addp40~event
---
s|s b26,12;z6/hold aC145@s res22 anti30
a365|t b23;w8/move.to.notReturn t aC105@v b9
s|z6/cover aC148@s guard38 d.43~reflect
p370|.55 eC145 d1.52 p115;.55 s b20
a*|t?out b26 anti42,10~once
protect.me.march.other|v b6
move.other.ownshield.shielded.notReturn|v h5
always.nearally120|s res11~skill
hit.me.ground|oC150@s#1 b7
ward.me.out|v addh5
return.on|s b8
shove.me.q.nearally135|v addp32
cast.me.deployfield|s anti20,4
protect.me.march.other|z3/hold aC82@v res18
shield.me.out|w10/return.to.from v aC100@v b12
---
p420|z6/guard aC200 wall85
p470|z8 aJ165,190 b24
p460|eB320,84 d1.65 p125;z9/wall aB320,84 wall35
o*|t b40 split70,8,0,50 anti45,8~once;s b17
p440|eC185 d1.62 p110;aC185 b17 anti38,9~once
protect.me.citadel|eC90@v d.40
always.overlapzone|s res13
protect.me.wallafter|v b8
redirect.me|s h6;v h6
ward.me.area.landed|v addh5
always.selfin.selfedge120|s anti30~carry
hurt.ally.direct.enemy.cohit|s b10
life.other.crossed35.nearself200.once.perally|v b12
proc.proc1|eC90@v p95~anchor
proc.proc4|z3/hold aC84@s anti30;z3/hold aC84@v anti30
`,
}
