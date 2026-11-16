import { snapshotEdgeBattle } from "../edgeBattle"
import type { BardBeat, BulwarkBeat, HealerBeat, SkillVisual, WardenBeat } from "./presentation"
import { bardActiveReadiness, bardTraitReadiness } from "./runtime"
import { bardChoreography } from "./bardChoreo"
import { advanceSkillPreview, createSkillPreview, type SkillPreviewEntry, type SkillPreviewRun, type SkillPreviewScene } from "./preview"
import { rangerChoreography } from "./rangerChoreo"
import { bulwarkChoreography, type BulwarkMotif } from "./bulwarkChoreo"
import { assassinTraitReadiness, berserkerTraitReadiness, binderTraitReadiness, bulwarkTraitReadiness, dancerTraitReadiness, healerTraitReadiness, lifebringerTraitReadiness, paladinTraitReadiness, rangerPassiveReadiness, spellbreakerTraitReadiness, summonTraitReadiness, wardenTraitReadiness, warlockTraitReadiness } from "./runtime"
import { wardenChoreography, type WardenMotif } from "./wardenChoreo"
import { berserkerChoreography, type BerserkerMotif } from "./berserkerChoreo"
import { paladinChoreography, type PaladinMotif } from "./paladinChoreo"
import { spellbreakerChoreography } from "./spellbreakerChoreo"
import { assassinChoreography } from "./assassinChoreo"
import { warlockChoreography } from "./warlockChoreo"
import { lifebringerChoreography } from "./lifebringerChoreo"
import { binderChoreography } from "./binderChoreo"
import { dancerChoreography } from "./dancerChoreo"
import { healerChoreography } from "./healerChoreo"
import { areaHits, movingOutward } from "./geometry"
import { battleUnits } from "./state"

const frames = ["起手", "过程", "命中", "收尾"] as const
const summonFrames = ["部署", "站场", "交互", "退场"] as const

function captureFrames(run: SkillPreviewRun, labels: readonly string[], times: number[]) {
  const snapshots = times.map((time, index) => ({ name: labels[index], time: Math.min(run.duration, Math.round(time * 100) / 100) }))
    .sort((a, b) => a.time - b.time)
    .map((frame) => {
      advanceSkillPreview(run, frame.time)
      return { ...frame, battle: snapshotEdgeBattle(run.battle), viewBox: run.viewBox }
    })
  return labels.map((name) => snapshots.find((frame) => frame.name === name)!)
}

function reviewSummonFrames(entry: Extract<SkillPreviewEntry, { kind: "active" }>, scene: SkillPreviewScene) {
  const trace = createSkillPreview(entry, scene)
  let deployedAt = .2
  let dismissedAt: number | undefined
  let firstDamage: number | undefined
  const beats = new Map<number, SkillVisual>()
  for (let frame = 1; frame <= Math.round(trace.duration * 60); frame++) {
    advanceSkillPreview(trace, frame / 60)
    const group = trace.battle.runtime.summons[0]
    if (!group) continue
    deployedAt = group.start
    dismissedAt ??= group.dismissedAt
    firstDamage ??= trace.battle.impacts.find((impact) => impact.kind === "hit" &&
      group.deployment.bodies.some(({ id }) => id === impact.target))?.time
    for (const fx of trace.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.summon) beats.set(fx.id, fx)
  }
  const { deployment } = entry.skill
  const moments = [...beats.values()].sort((a, b) => a.start - b.start)
  const shot = moments.find((fx) => fx.summon?.cue === "shot")
  const actions = moments.filter((fx) => fx.summon?.cue !== "deploy" && fx.summon?.cue !== "shot")
  const primary = actions.find((fx) => {
    switch (deployment) {
      case "ensemble": case "paperBeat": return fx.summon?.slot === 2
      case "paperPack": return fx.beat === 3
      case "rail": return (fx.contacts?.length ?? 0) > 1
      case "roadBeast": return fx.summon?.cue === "stop"
      case "armorBeast": return fx.summon?.cue === "cover"
      case "bell": case "rescue": case "bridge": case "returnBeast": return fx.beat === 2
      default: return false
    }
  }) ?? actions[0]
  const interact = primary ? primary.start + .24 * (primary.end - primary.start) : deployedAt + .62
  const stand = shot ? shot.start + .58 * (shot.end - shot.start)
    : firstDamage !== undefined && deployment === "decoy" ? firstDamage + .16
      : deployment === "rail" ? Math.min(1.02, interact - .02)
      : Math.max(deployedAt + .17, Math.min(interact - .14, (actions[0]?.start ?? interact) - .14, deployedAt + 1.5))
  return captureFrames(createSkillPreview(entry, scene), summonFrames,
    [deployedAt + .12, stand, interact, (dismissedAt ?? trace.duration) + (deployment === "decoy" ? .26 : .14)])
}

function reviewTrait(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  const run = createSkillPreview(entry, scene)
  const id = entry.skill.id
  const warden = entry.job === "warden"
  const rage = entry.job === "berserker"
  const holy = entry.job === "paladin"
  const breaker = entry.job === "spellbreaker"
  const shadow = entry.job === "assassin"
  const mage = entry.job === "warlock"
  const life = entry.job === "lifebringer"
  const binding = entry.job === "binder"
  const dance = entry.job === "dancer"
  const medic = entry.job === "healer"
  const bard = entry.job === "bard"
  const custom = warden || rage || holy || breaker || shadow || mage || life || binding || dance || medic || bard
  const readiness = entry.job === "summoner" ? summonTraitReadiness : entry.job === "bulwark" ? bulwarkTraitReadiness
    : warden ? wardenTraitReadiness : rage ? berserkerTraitReadiness : holy ? paladinTraitReadiness : breaker ? spellbreakerTraitReadiness
      : shadow ? assassinTraitReadiness : mage ? warlockTraitReadiness : life ? lifebringerTraitReadiness
        : binding ? binderTraitReadiness : dance ? dancerTraitReadiness : medic ? healerTraitReadiness : bard ? bardTraitReadiness : rangerPassiveReadiness
  const events = new Map<number, SkillVisual>()
  let readyFrom: number | undefined
  let readyUntil = 0
  let speedAt: number | undefined
  let armorFieldUntil = 0
  let firstQ: SkillVisual | undefined
  for (let frame = 0; frame <= Math.round(run.duration * 60); frame++) {
    const time = frame / 60
    advanceSkillPreview(run, time)
    for (const fx of run.battle.runtime.effects) if (fx.skill === id && fx.passive && time >= fx.start) events.set(fx.id, fx)
    if (id === "ranger/R/P6" || id === "ranger/Prismatic/P8")
      firstQ ??= run.battle.runtime.effects.find((fx) => fx.skill === "Q/ranger" && fx.phase === "impact")
    const marks = readiness(run.battle, id)
    if (marks.length) {
      readyFrom ??= time
      readyUntil = time
    }
    if (medic && speedAt === undefined && marks.some(mark => "movingFaster" in mark && mark.movingFaster)) speedAt = time
    if (entry.job === "bulwark" || warden || holy || breaker || shadow || mage || life || binding || dance || bard) for (const field of run.battle.runtime.fields) {
      if (field.cast.signature?.id === id) armorFieldUntil = shadow ? field.until : Math.max(armorFieldUntil, field.until)
    }
  }
  const moments = [...events.values()]
  const travel = moments.find((fx) => fx.passive?.mode === "travel")
  const consumed = moments.find((fx) => fx.passive?.mode === "consume")
  const opening = moments.find((fx) => fx.passive?.mode === "proc" || fx.passive?.mode === "stance") ??
    (custom ? consumed : undefined)
  const showing = (fx: SkillVisual, portion: number) => fx.start + (fx.end - fx.start) * portion
  if (!opening) return captureFrames(createSkillPreview(entry, scene), ["条件", "触发", "效果", "收尾"], [0, .3, .65, 1])
  if (bard) {
    const replay = () => createSkillPreview(entry, scene)
    const end = Math.max(...moments.map(fx => fx.end), armorFieldUntil) + .12
    if (armorFieldUntil > opening.start) return captureFrames(replay(), ["条件", "成场", "生效", "消散"],
      [Math.max(0, opening.start - .17), showing(opening, .24), Math.min(opening.start + 1.5, armorFieldUntil - .13), end])
    if (travel) {
      const resolved = moments.findLast(fx => fx.passive?.mode !== "travel" && fx.start >= travel.end - .025) ?? opening
      const start = Math.min(opening.start, travel.start)
      return captureFrames(replay(), ["条件", "传拍", "落拍", "收尾"],
        [Math.max(0, start - .16), showing(travel, .55), showing(resolved, .25), end])
    }
    if (consumed && consumed !== opening) {
      const waiting = Math.max(opening.start, Math.min(consumed.start - .10, readyFrom === undefined ? opening.start + .20 : readyFrom + .30))
      return captureFrames(replay(), ["触发", "待用", "兑现", "收尾"],
        [showing(opening, .21), Math.max(showing(opening, .26), waiting), showing(consumed, .23), end])
    }
    return captureFrames(replay(), ["条件", "触发", "结算", "收尾"],
      [Math.max(0, opening.start - .17), showing(opening, .26), showing(opening, .58), end])
  }
  if (medic) {
    const replay = () => createSkillPreview(entry, scene)
    if (id === "healer/Prismatic/G1" && consumed && travel) {
      const arrival = moments.findLast(fx => fx.passive?.mode === "proc" && fx.start >= travel.end - .02)
      if (arrival) return captureFrames(replay(), ["应援留印", "界外待用", "跨线接诊", "侧桥护盾"],
        [showing(opening, .24), consumed.start - .25, showing(travel, .49), showing(arrival, .27)])
    }
    if (id === "healer/L/P8" || id === "healer/Radiant/P8") {
      const guards = moments.filter(fx => fx.passive?.mode === "consume")
      if (guards.length >= 2) return captureFrames(replay(), ["退场", "待用", "首位受力", "另一位受力"],
        [Math.max(0, opening.start - .13), showing(opening, .31), showing(guards[0], .25), showing(guards[1], .28)])
    }
    if (id === "healer/Prismatic/P6") {
      const nextReturn = moments.find(fx => fx.start > opening.start && fx.passive?.mode === "proc")
      if (nextReturn) return captureFrames(replay(), ["界外", "首位回场", "另一位回场", "收尾"],
        [Math.max(0, opening.start - .21), showing(opening, .26), showing(nextReturn, .29), showing(nextReturn, .82)])
    }
    if (id === "healer/UC/P7" && readyFrom !== undefined) return captureFrames(replay(), ["站定", "针已备好", "实疗", "收针"],
      [Math.max(0, readyFrom - .19), readyFrom + .09, showing(opening, .25), showing(opening, .83)])
    if (speedAt !== undefined) return captureFrames(replay(), ["条件", "触发", "加速步行", "解除"],
      [Math.max(0, opening.start - .20), showing(opening, .23), Math.max(showing(opening, .30), speedAt + .16), readyUntil + .21])
  }
  if (id === "binder/C/G2" && armorFieldUntil > opening.start)
    return captureFrames(createSkillPreview(entry, scene), ["条件", "铺冰", "减速", "消散"],
      [Math.max(0, opening.start - .16), showing(opening, .23), opening.start + 1.10, armorFieldUntil + .10])
  if (id === "dancer/C/G2" || id === "dancer/Radiant/G1") {
    const payoff = moments.find(fx => fx !== opening && fx.passive?.mode !== "travel")
    if (payoff) return captureFrames(createSkillPreview(entry, scene), ["条件", "布场", "兑现", "消散"],
      [Math.max(0, opening.start - .14), showing(opening, .23), showing(payoff, .27), Math.max(armorFieldUntil + .10, payoff.end + .07)])
  }
  if (id === "dancer/C/P8") return captureFrames(createSkillPreview(entry, scene), ["条件", "退场", "加速", "解除"],
    [opening.start - .13, showing(opening, .23), showing(opening, .80), readyUntil + .25])
  if (id === "binder/Prismatic/P8" || id === "dancer/Prismatic/P8") {
    const guards = moments.filter(fx => fx.passive?.mode === "consume")
    if (guards.length >= 2) return captureFrames(createSkillPreview(entry, scene), ["退场", "待用", "首位受击", "另一位受击"],
      [Math.max(0, opening.start - .20), showing(opening, .41), showing(guards[0], .31), showing(guards[1], .31)])
  }
  if (id === "dancer/L/G2") {
    const braces = moments.filter(fx => fx.passive?.mode === "consume")
    if (braces.length >= 2) return captureFrames(createSkillPreview(entry, scene), ["条件", "就位", "第一段抗推", "第二段抗推"],
      [Math.max(0, opening.start - .16), showing(opening, .24), showing(braces[0], .23), showing(braces[1], .23)])
  }
  if ((binding || dance || medic) && entry.kind === "gold" && travel) {
    const lastTravel = moments.findLast(fx => fx.passive?.mode === "travel") ?? travel
    const hold = id === "binder/E/G1" && readyUntil > lastTravel.end
      ? Math.min(readyUntil - .12, travel.start + .30) : showing(lastTravel, .62)
    const payoff = showing(opening, id === "binder/Prismatic/G2" ? .09 : .25)
    return captureFrames(createSkillPreview(entry, scene), ["条件", "过程", "兑现", "收尾"],
      [Math.max(0, travel.start - .13), hold, payoff, showing(opening, .84)])
  }
  if (life && (id === "lifebringer/C/G2" || id === "lifebringer/UC/G1")) {
    const awarded = moments.filter(fx => fx.passive?.mode === "proc").at(-1)
    if (awarded && awarded !== opening) return captureFrames(createSkillPreview(entry, scene), ["条件", "扎根", "接触", "消散"],
      [travel ? showing(travel, .55) : Math.max(0, opening.start - .18), showing(opening, .20), showing(awarded, .27), awarded.end + .11])
  }
  if (id === "warlock/Prismatic/P5" || id === "warlock/Prismatic/G2") {
    const awards = moments.filter(fx => fx.passive?.mode === "proc")
    if (awards.length >= 2) return captureFrames(createSkillPreview(entry, scene), ["发印", "首位", "另一位", "收尾"],
      [Math.max(.7, awards[0].start - .38), showing(awards[0], .20), showing(awards[1], .20), showing(awards[1], .80)])
  }
  if (id === "warden/L/P7" && readyFrom !== undefined) return captureFrames(createSkillPreview(entry, scene),
    ["第一击", "待用", "第二击", "收尾"], [readyFrom + .055, (readyFrom + opening.start) / 2, showing(opening, .22), showing(opening, .78)])
  const before = (id === "bulwark/C/P6" || custom && opening.passive?.mode === "stance") && readyFrom !== undefined
    ? Math.max(readyFrom + .025, opening.start - .11)
    : travel ? showing(travel, .53) : id === "ranger/R/P6" && firstQ
    ? showing(firstQ, .28) : Math.max(0, opening.start - (id === "warden/L/P2" ? .29 : .22))
  const trigger = showing(opening, .15)
  if (consumed && (readyFrom !== undefined || custom) && consumed.start > opening.start + .10) {
    const waiting = id === "ranger/Prismatic/P8" && firstQ ? showing(firstQ, .36) : trigger + .28
    const holding = Math.max(trigger + .04, Math.min(consumed.start - .045, Math.max((readyFrom ?? opening.start) + .18, waiting)))
    return captureFrames(createSkillPreview(entry, scene), ["条件", "触发", "待用", "兑现"],
      [before, trigger, holding, showing(consumed, .31)])
  }
  const reaction = moments.find((fx) => fx !== opening && fx.passive?.mode === "stance")
  const middle = reaction ? showing(reaction, .33) : showing(opening, .48)
  if (armorFieldUntil > middle && armorFieldUntil < run.duration - .08) return captureFrames(createSkillPreview(entry, scene),
    ["条件", "触发", "效果", "消散"], [before, trigger, middle, armorFieldUntil + .10])
  const release = shadow || mage || life || binding || dance || medic || ["summoner/C/P6", "summoner/R/P6", "summoner/E/P7", "summoner/Radiant/P6",
    "bulwark/C/P3", "bulwark/E/P6", "bulwark/L/P2", "bulwark/Prismatic/P2",
    "warden/C/P6", "warden/UC/P6", "warden/R/P6", "warden/E/P2", "warden/Radiant/P7", "berserker/C/P5", "berserker/C/P7",
    "paladin/C/P5", "paladin/C/P8", "paladin/UC/P6", "paladin/E/P7", "paladin/L/P6", "paladin/Radiant/P6",
    "spellbreaker/C/P6", "spellbreaker/E/P6", "spellbreaker/L/P7", "spellbreaker/Radiant/P6", "spellbreaker/Prismatic/P7"].includes(id)
  if (release && readyUntil > middle && readyUntil < run.duration - .2) return captureFrames(createSkillPreview(entry, scene),
    ["条件", "触发", "效果", "解除"], [before, trigger, middle, readyUntil + .31])
  const tail = readyUntil > middle + .24 ? readyUntil - .06 : Math.max(middle + .10, showing(reaction ?? opening, .82))
  return captureFrames(createSkillPreview(entry, scene), ["条件", "触发", "效果", "收尾"],
    [before, trigger, middle, tail])
}

const bulwarkContacts: Partial<Record<BulwarkMotif, BulwarkBeat["cue"]>> = {
  lockplate: "absorb", mantle: "brace", pauldron: "brace", wedges: "brace", catchstrap: "share", axle: "brace",
  cracked: "absorb", twochocks: "brace", drum: "taunt", seal: "weak", muffle: "interrupt", bracewire: "share",
  twinhull: "heal", rampart: "brace", breach: "interrupt", phalanx: "brace", shoulders: "brace", shore: "brace",
  citadel: "crossing", seawall: "crossing", accord: "share", island: "strike",
}

function reviewBulwarkFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene, motif: BulwarkMotif) {
  const trace = createSkillPreview(entry, scene)
  const effects = new Map<number, SkillVisual>()
  for (let i = 1; i <= Math.round(trace.duration * 60); i++) {
    advanceSkillPreview(trace, i / 60)
    for (const fx of trace.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.bulwark) effects.set(fx.id, fx)
  }
  const moments = [...effects.values()].sort((a, b) => a.start - b.start)
  const opening = moments.find((fx) => fx.bulwark?.cue === "setup")
  const path = moments.find((fx) => fx.bulwark?.cue === "step")
  const reaction = moments.find((fx) => fx.bulwark?.cue === bulwarkContacts[motif])
  const contact = reaction ?? (motif === "wake" || motif === "portal" || motif === "bastions"
    ? moments.find((fx) => fx.bulwark?.cue === "shield" && fx.start > .25) : undefined)
    ?? moments.find((fx) => fx.bulwark?.cue !== "setup" && fx.bulwark?.cue !== "step")
  if (!opening || !contact) return captureFrames(createSkillPreview(entry, scene), frames, [.2, .38, .65, 1.1])
  const at = (fx: SkillVisual, progress: number) => fx.start + (fx.end - fx.start) * progress
  const first = at(opening, .19)
  const armed = motif === "seawall" ? opening.end + .32 : motif === "drum" || motif === "seal" ? opening.end + .20 : undefined
  const middle = armed ?? (path ? at(path, .63) : opening.phase === "windup" ? at(opening, .73)
    : contact.start > opening.end ? at(opening, .73) : first + .13)
  const hit = Math.max(middle + .055, at(contact, .26))
  const tail = moments.at(-1) ?? contact
  const last = motif === "shore" ? trace.duration - .16 : motif === "phalanx" ? 2.43
    : Math.max(hit + .12, tail.start > contact.start + .26 ? at(tail, .44) : at(tail, .86))
  return captureFrames(createSkillPreview(entry, scene), frames, [first, middle, hit, last])
}

const wardenContacts: Partial<Record<WardenMotif, WardenBeat["cue"]>> = {
  step: "shield", rearhook: "brace", sling: "brace", stamp: "interrupt", escort: "shield", relay: "relay",
  stretcher: "shield", breaker: "interrupt", exchange: "swap", carry: "shield", advance: "shield",
  overlap: "interrupt", tripwire: "interrupt", boundary: "stop", hammer: "interrupt", parallel: "swap",
}

function reviewWardenFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene, motif: WardenMotif) {
  const trace = createSkillPreview(entry, scene)
  const effects = new Map<number, SkillVisual>()
  let fieldUntil: number | undefined
  for (let i = 1; i <= Math.round(trace.duration * 60); i++) {
    advanceSkillPreview(trace, i / 60)
    for (const fx of trace.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.warden) effects.set(fx.id, fx)
    const field = trace.battle.runtime.fields.find(({ cast, derived }) => !derived && cast.skill?.id === entry.skill.id)
    if (field) fieldUntil = field.until
  }
  const moments = [...effects.values()]
  const opening = moments.find((fx) => fx.warden?.cue === "prepare")
  const second = moments.find((fx) => fx.warden?.cue === "prepare" && fx.beat === 2)
  const travel = moments.find((fx) => fx.warden?.cue === "travel")
  const deploy = moments.find((fx) => fx.warden?.cue === "deploy")
  const armed = moments.find((fx) => fx.warden?.cue === "arm")
  const hits = moments.filter((fx) => fx.warden?.cue === "hit" && fx.warden.paths?.length)
  const firstHit = hits[0]
  const reaction = moments.find((fx) => fx.warden?.cue === wardenContacts[motif] && fx.start > (opening?.start ?? 0) + .03)
  const contact = reaction ?? (second || motif === "pincer" ? hits.at(-1) : firstHit)
  if (!opening || !contact) return captureFrames(createSkillPreview(entry, scene), frames, [.23, .39, .65, 1.2])
  const at = (fx: SkillVisual, t: number) => fx.start + (fx.end - fx.start) * t
  const first = at(opening, motif === "pincer" ? .04 : .14)
  const setting = travel ? at(travel, .59) : second ? at(second, .54) : motif === "pincer" && deploy ? deploy.start + .23
    : deploy && deploy.start < contact.start - .13 ? deploy.start + .18
      : armed && armed.start < contact.start - .19 ? at(armed, .55)
      : opening.phase === "windup" ? at(opening, .72) : Math.min(opening.end, contact.start - .09)
  const process = Math.max(first + .03, Math.min(setting, contact.start - .018))
  const impact = Math.max(process + .045, at(contact, .22))
  const last = moments.at(-1) ?? contact
  const expires = fieldUntil !== undefined && fieldUntil + .12 < trace.duration && fieldUntil + .12 > impact &&
    (motif === "gate" || motif === "beacon" || motif === "advance")
  const tail = expires ? fieldUntil! + .12 : motif === "boundary" ? Math.max(impact + .15, 2.48)
    : Math.max(impact + .14, at(last, .77), motif === "pincer" ? (fieldUntil ?? 0) + .10 : 0)
  const title = contact.warden?.cue === "swap" ? "换位" : contact.warden?.cue === "shield" ? "护盾"
    : contact.warden?.cue === "stop" || contact.warden?.cue === "brace" ? "拦截" : "命中"
  return captureFrames(createSkillPreview(entry, scene), ["起手", "过程", title, expires ? "消散" : "收尾"],
    [first, process, impact, tail])
}

function reviewBerserkerFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene, motif: BerserkerMotif) {
  const trace = createSkillPreview(entry, scene)
  const effects = new Map<number, SkillVisual>()
  for (let i = 1; i <= Math.round(trace.duration * 60); i++) {
    advanceSkillPreview(trace, i / 60)
    for (const fx of trace.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.berserker) effects.set(fx.id, fx)
  }
  const moments = [...effects.values()]
  const opening = moments.find(({ berserker }) => berserker?.cue === "prepare")
  const hits = moments.filter(({ berserker }) => berserker?.cue === "strike" && berserker.paths?.length && berserker.kind !== "force")
  const motion = moments.find(({ berserker }) => berserker?.cue === "travel" || berserker?.cue === "flight")
  const ready = moments.find(({ berserker }) => berserker?.cue === "arm")
  const reaction = moments.find(({ berserker }) => ["cash", "guard", "save", "boundary"].includes(berserker?.cue ?? ""))
  const contact = reaction ?? hits.at(-1)
  const at = (fx: SkillVisual, f: number) => fx.start + (fx.end - fx.start) * f
  const make = (labels: readonly string[], times: number[]) => captureFrames(createSkillPreview(entry, scene), labels, times)
  if (!opening || !contact) return make(frames, [.21, .37, .65, 1.12])
  const first = at(opening, .17)
  if (motif === "trinity" && hits.length === 3) return make(["起手", "第一刀", "第二刀", "第三刀"], [
    motion ? at(motion, .51) : first, at(hits[0], .16), at(hits[1], .16), at(hits[2], .34),
  ])
  const follow = moments.find(({ berserker, beat }) => berserker?.cue === "prepare" && beat === 2)
  if (hits.length === 2 && follow && ["scar", "wheel", "backedge", "pulseaxe"].includes(motif))
    return make(["首击", "待续", "再击", "收尾"], [at(hits[0], .17), at(follow, .60), at(hits[1], .19), at(hits[1], .79)])
  if (ready && (motif === "boil" || contact.berserker?.cue === "cash")) return make(
    ["起手", "待用", motif === "boil" ? "扇斩" : "兑现", "收尾"],
    [first, Math.min(contact.start - .14, ready.start + 1.48), at(contact, .24), at(contact, .78)],
  )
  const stripped = moments.find(({ berserker }) => berserker?.cue === "strip")
  const middle = motion ? at(motion, .59) : stripped ? at(stripped, .09)
    : ready ? Math.min(contact.start - .14, ready.start + .48) : at(opening, .72)
  const impact = Math.max(middle + .045, at(contact, .22))
  const tail = Math.max(impact + .16, at(contact, .81))
  const title = contact.berserker?.cue === "boundary" ? "越界" : contact.berserker?.cue === "save" ? "锁血"
    : contact.berserker?.cue === "guard" ? "挡伤" : "命中"
  return make(["起手", "过程", title, "收尾"], [first, middle, impact, tail])
}

function reviewPaladinFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene, motif: PaladinMotif) {
  const trace = createSkillPreview(entry, scene)
  const effects = new Map<number, SkillVisual>()
  let fieldUntil = 0
  for (let i = 1; i <= Math.round(trace.duration * 60); i++) {
    advanceSkillPreview(trace, i / 60)
    for (const fx of trace.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.paladin) effects.set(fx.id, fx)
    for (const field of trace.battle.runtime.fields) if (field.cast.skill?.id === entry.skill.id) fieldUntil = Math.max(fieldUntil, field.until)
  }
  const moments = [...effects.values()]
  const find = (cue: NonNullable<SkillVisual["paladin"]>["cue"]) => moments.find(({ paladin }) => paladin?.cue === cue)
  const first = find("prepare")
  const sample = (fx: SkillVisual, p: number) => fx.start + (fx.end - fx.start) * p
  const play = (labels: readonly string[], times: number[]) => captureFrames(createSkillPreview(entry, scene), labels, times)
  if (!first) return play(frames, [.21, .33, .62, 1.08])
  const opening = sample(first, .20)
  const strike = find("strike")
  const heal = find("heal")
  const shield = find("shield")
  const ward = find("ward")
  const arm = find("arm")
  const travel = find("travel")
  const flight = find("flight")
  const swap = find("swap")
  const retort = find("retort")
  const strip = find("strip")
  const deploy = find("deploy")
  if (deploy && fieldUntil > 0) {
    const contact = motif === "circle" ? strike : motif === "gate" ? heal : ward
    if (contact) return play(["起手", "立阵", motif === "gate" ? "离门" : motif === "circle" ? "越环" : "承伤", "消散"],
      [opening, shield ? sample(shield, .17) : sample(deploy, .24), sample(contact, .25), fieldUntil - .21])
  }
  if (swap && strike) return play(["起手", "扣位", "换位", "双端"],
    [opening, sample(first, .72), sample(swap, .17), sample(strike, .66)])
  if (strip && strike) return play(["起手", "剥盾", "落刃", "收尾"],
    [opening, strip.start + .075, sample(strike, .22), sample(strike, .78)])
  if (motif === "chorus" && arm) {
    const pulses = moments.filter(({ paladin }) => paladin?.cue === "release")
    if (pulses.length >= 2) return play(["起手", "持印", "接奏", "终拍"],
      [opening, sample(arm, .32), sample(pulses[0], .26), sample(pulses.at(-1)!, .36)])
  }
  const result = motif === "bloomward" ? heal : retort ?? ward ?? strike ?? heal ?? shield ?? arm
  if (!result) return play(frames, [opening, sample(first, .72), first.end + .13, first.end + .55])
  const delivery = travel ?? flight
  const state = arm ?? (result === ward ? shield : undefined)
  const middle = delivery ? sample(delivery, .57) : state && state.start < result.start - .09
    ? Math.min(result.start - .055, sample(state, .42)) : sample(first, .74)
  const answer = result === ward ? "抵挡" : result === retort ? "回敬" : result === shield ? "成盾" : result === heal ? "回血" : "命中"
  const tail = Math.max(sample(result, .81), sample(result, .22) + .14)
  return play(["起手", delivery ? travel ? "行进" : "飞行" : state ? "待用" : "过程", answer, "收尾"],
    [opening, middle, sample(result, .22), tail])
}

function reviewSpellbreakerFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  const run = createSkillPreview(entry, scene)
  const effects = new Map<number, SkillVisual>()
  for (let frame = 1; frame <= Math.round(run.duration * 60); frame++) {
    advanceSkillPreview(run, frame / 60)
    for (const fx of run.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.spellbreaker) effects.set(fx.id, fx)
  }
  const moments = [...effects.values()].sort((a, b) => a.start - b.start)
  const opening = moments.find(fx => fx.spellbreaker?.cue === "prepare")
  const reaction = moments.find(fx => ["retort", "delay", "erase"].includes(fx.spellbreaker?.cue ?? ""))
    ?? moments.find(fx => fx.spellbreaker?.cue === "release")
    ?? moments.find(fx => fx.spellbreaker?.cue === "ward" && fx.spellbreaker?.kind !== "absorb")
  const contact = reaction ?? moments.find(fx => fx.spellbreaker?.cue === "interrupt") ??
    moments.find(fx => fx.spellbreaker?.cue === "strike" || fx.spellbreaker?.cue === "shield")
  if (!opening || !contact) return captureFrames(createSkillPreview(entry, scene), frames, [.22, .45, .72, 1.12])
  const showing = (fx: SkillVisual, fraction: number) => fx.start + (fx.end - fx.start) * fraction
  const waiting = moments.find(fx => fx.spellbreaker?.cue === "travel") ??
    moments.find(fx => fx.spellbreaker?.cue === "arm") ?? moments.find(fx => fx.spellbreaker?.cue === "strip") ?? opening
  const second = Math.min(contact.start - .04, waiting !== opening ? showing(waiting, .25) : showing(opening, .84))
  const label = contact.spellbreaker?.cue === "erase" ? "清除" : contact.spellbreaker?.cue === "retort" ? "回击"
    : contact.spellbreaker?.cue === "delay" ? "延后" : contact.spellbreaker?.cue === "interrupt" ? "打断" : "结算"
  return captureFrames(createSkillPreview(entry, scene), ["起手", "过程", label, "收尾"],
    [showing(opening, .42), Math.max(showing(opening, .57), second), showing(contact, .26), showing(contact, .83)])
}

function reviewAssassinFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  const run = createSkillPreview(entry, scene)
  const seen = new Map<number, SkillVisual>()
  let fieldUntil = 0
  for (let frame = 1; frame <= Math.round(run.duration * 60); frame++) {
    advanceSkillPreview(run, frame / 60)
    for (const fx of run.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.assassin) seen.set(fx.id, fx)
    for (const field of run.battle.runtime.fields) if (field.cast.skill?.id === entry.skill.id) fieldUntil = field.until
  }
  const cues = [...seen.values()].sort((a, b) => a.start - b.start)
  const prepare = cues.find(f => f.assassin?.cue === "prepare")
  const attacks = cues.filter(f => f.assassin?.cue === "strike")
  const release = cues.find(f => ["release", "stop", "ward"].includes(f.assassin?.cue ?? ""))
  const hit = release ?? attacks.at(-1) ?? cues.find(f => f.assassin?.cue === "shield" || f.assassin?.cue === "phase") ?? prepare
  const process = cues.find(f => f.assassin?.cue === "travel") ?? cues.find(f => f.assassin?.cue === "flight")
    ?? cues.find(f => f.assassin?.cue === "arm" || f.assassin?.cue === "phase") ?? attacks[0] ?? prepare
  const showing = (fx: SkillVisual | undefined, t: number) => fx ? fx.start + (fx.end - fx.start) * t : t
  const expiry = fieldUntil > showing(hit, .5) && fieldUntil + .12 <= run.duration
  const openingTime = showing(prepare, .54)
  const contactTime = Math.max(openingTime + .12, showing(hit, .28))
  const processTime = Math.max(openingTime + .05, Math.min(contactTime - .05, showing(process, process?.assassin?.cue === "strike" ? .1 : .55)))
  return captureFrames(createSkillPreview(entry, scene), ["起手", "过程", "结算", expiry ? "消散" : "收尾"],
    [openingTime, processTime, contactTime, expiry ? fieldUntil + .12 : Math.max(contactTime + .1, showing(hit, .83))])
}


function reviewWarlockFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  const run = createSkillPreview(entry, scene), seen = new Map<number, SkillVisual>()
  let fieldUntil = 0
  for (let frame = 1; frame <= Math.round(run.duration * 60); frame++) {
    advanceSkillPreview(run, frame / 60)
    for (const fx of run.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.warlock) seen.set(fx.id, fx)
    for (const field of run.battle.runtime.fields) if (field.cast.skill?.id === entry.skill.id && !field.cast.signature) fieldUntil = field.until
  }
  const moments = [...seen.values()].sort((a, b) => a.start - b.start)
  const opening = moments.find(fx => fx.warlock?.cue === "prepare")
  const reprise = moments.find(fx => fx.warlock?.cue === "prepare" && (fx.beat ?? 0) > 1)
  const flights = moments.filter(fx => fx.warlock?.cue === "flight")
  const travel = moments.find(fx => fx.warlock?.cue === "travel")
  const watch = moments.find(fx => fx.warlock?.cue === "arm")
  const contacts = moments.filter(fx => fx.warlock?.cue === "strike")
  const release = moments.find(fx => fx.warlock?.cue === "release")
  const ward = moments.find(fx => fx.warlock?.cue === "ward")
  const contact = release ?? contacts.at(-1) ?? ward ?? moments.find(fx => fx.warlock?.cue === "shield") ?? opening
  const sample = (fx: SkillVisual | undefined, portion: number) => fx ? fx.start + (fx.end - fx.start) * portion : portion
  const first = sample(opening, .28), end = Math.max(first + .2, sample(contact, .20))
  const process = travel ?? flights.at(-1) ?? reprise ?? ward ?? watch ?? opening
  const middle = Math.max(first + .05, Math.min(end - .05, sample(process, .57)))
  const expire = fieldUntil > end && fieldUntil + .12 <= run.duration
  return captureFrames(createSkillPreview(entry, scene), ["起手", "过程", "结算", expire ? "消散" : "收尾"],
    [first, middle, end, expire ? fieldUntil + .12 : Math.max(end + .14, sample(contact, .78))])
}

function reviewLifebringerFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  const run = createSkillPreview(entry, scene)
  const moments = new Map<number, SkillVisual>()
  let expiry = 0
  for (let frame = 1; frame <= Math.round(run.duration * 60); frame++) {
    advanceSkillPreview(run, frame / 60)
    for (const fx of run.battle.runtime.effects) if (fx.skill === entry.skill.id && fx.lifebringer && !moments.has(fx.id)) moments.set(fx.id, fx)
    const field = run.battle.runtime.fields.find(field => field.cast.skill?.id === entry.skill.id)
    if (field) expiry = field.until
  }
  const all = [...moments.values()]
  const art = lifebringerChoreography(entry.skill.id)!
  const cue = (kind: NonNullable<SkillVisual["lifebringer"]>["cue"]) => all.find(fx => fx.lifebringer?.cue === kind)
  const heals = all.filter(fx => fx.lifebringer?.cue === "heal" && (fx.lifebringer.amount ?? 0) > 0)
  const sample = (fx: SkillVisual, part: number) => fx.start + (fx.end - fx.start) * part
  const opening = cue("prepare")
  const result = heals.at(-1) ?? cue("release") ?? cue("strike")
  const replay = () => createSkillPreview(entry, scene)
  if (!opening || !result) return captureFrames(replay(), frames, [.25, .55, 1.3, 3])
  if (art.motif === "chronowheel" && heals.length > 3) {
    const first = heals[0]
    return captureFrames(replay(), ["锁定伤量", "首拍", "末拍", "收尾"],
      [sample(opening, .61), sample(first, .28), sample(result, .23), result.end + .09])
  }
  if (art.motif === "borrowroot" && cue("release")) {
    const released = cue("release")!
    return captureFrames(replay(), ["起手", "候伤", "恢复", "接续"],
      [sample(opening, .47), result.start - .17, sample(result, .25), sample(released, .29)])
  }
  const flight = cue("flight"), arm = cue("arm"), shield = cue("shield"), deploy = cue("deploy")
  const imprint = all.find(fx => fx.lifebringer?.cue === "prepare" && (fx.beat ?? 0) > 1)
  const stored = art.motif === "reservoir" ? all.filter(fx => fx.lifebringer?.cue === "transfer").at(-1) : undefined
  const overflow = art.motif === "rootbond" ? cue("transfer") : undefined
  const process = stored ?? overflow ?? flight ?? imprint ?? shield ?? (arm && arm.start < result.start - .14 ? arm : undefined)
    ?? deploy ?? heals.find(fx => fx.start < result.start - .14) ?? opening
  const after = sample(result, .30)
  const middle = process === shield ? process.start + .18 : sample(process, process === arm ? .24 : process === opening ? .79 : .53)
  const label = stored ? "蓄积" : overflow ? "转交" : flight ? "飞行" : imprint ? "落点" : shield ? "护盾"
    : process === arm ? "待用" : process === deploy ? "阵地" : "过程"
  const fading = expiry > after && expiry + .10 <= run.duration
  const tail = fading ? expiry + .13 : Math.min(run.duration, result.end + .13)
  return captureFrames(replay(), ["起手", label, "兑现", fading ? "消散" : "收尾"],
    [sample(opening, process === opening ? .26 : .49), Math.max(opening.start + .075, Math.min(middle, result.start - .035)), after, tail])
}

function reviewBinderFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  const replay = () => createSkillPreview(entry, scene)
  const run = replay()
  const motif = binderChoreography(entry.skill.id)?.motif
  const effects = new Map<number, SkillVisual>()
  let fieldEnd = 0, movingAt = 0, readyAt = 0
  for (let frame = 1; frame <= Math.round(run.duration * 60); frame++) {
    const time = frame / 60
    advanceSkillPreview(run, time)
    const runtime = run.battle.runtime
    for (const fx of runtime.effects) if (fx.skill === entry.skill.id && fx.binder) effects.set(fx.id, fx)
    const field = runtime.fields.find(field => field.cast.skill?.id === entry.skill.id && field.until > time)
    if (field) {
      fieldEnd = time
      if (!movingAt && (motif === "gravityDisk" || motif === "windExchange") && battleUnits(run.battle).some(unit =>
        unit.hp && unit.move && !unit.force && areaHits(field.area, unit) && (motif !== "gravityDisk" ||
          movingOutward(unit, unit.move, field.area.center)))) movingAt = time
    }
    if (!readyAt && (runtime.buffs.some(buff => buff.cast.skill?.id === entry.skill.id) ||
      runtime.watches.some(watch => watch.cast.skill?.id === entry.skill.id && watch.uses > 0))) readyAt = time
  }
  const moments = [...effects.values()]
  const opening = moments.find(fx => fx.binder?.cue === "prepare")
  if (!opening) return captureFrames(replay(), frames, [.36, .55, .80, 1.3])
  const laterWarning = moments.find(fx => fx.binder?.cue === "prepare" && fx !== opening)
  const flight = moments.find(fx => fx.binder?.cue === "flight")
  const deploy = moments.find(fx => fx.binder?.cue === "deploy")
  const strikes = moments.filter(fx => fx.binder?.cue === "strike")
  const releases = moments.filter(fx => fx.binder?.cue === "release")
  const cross = strikes.find(fx => fx.binder?.kind === "cross")
  const primary = strikes[0]
  const finish = strikes.at(-1) ?? deploy ?? opening
  const point = (fx: SkillVisual, fraction: number) => fx.start + (fx.end - fx.start) * fraction
  const first = point(opening, .38)
  const result = releases.at(-1) ?? finish
  const inMotion = result.binder?.kind !== "halt" && result.binder?.paths?.some(path => path.end)
  const actionAt = movingAt ? movingAt + .24 : point(motif === "ballast" ? finish : result, inMotion ? .15 : .31)
  const action = movingAt ? "行进" : result.binder?.kind === "short" ? "折步" : result.binder?.kind === "tether" ? "截停"
    : result.binder?.kind === "invert" ? "反向牵引" : motif === "ballast" ? "落地" : motif === "sinkBasin" ? "定身" : releases.length ? "触发" : "命中"
  const process = flight ? { label: "飞行", time: point(flight, .54) }
    : laterWarning ? { label: laterWarning.binder?.kind === "head" ? "钉住旧点" : "倒数", time: point(laterWarning, .56) }
    : motif === "ballast" && releases[0] ? { label: "截程", time: point(releases[0], .38) }
    : motif === "sinkBasin" && primary ? { label: "下沉", time: point(primary, .21) }
    : motif === "retreatSeal" && releases.length > 1 ? { label: "抗推", time: point(releases[0], .36) }
    : cross ? { label: "出圈", time: point(cross, .39) }
    : deploy ? { label: motif === "coupled" ? "连位" : "留场", time: Math.min(deploy.start + .21, actionAt - .1) }
    : readyAt && releases.length && readyAt < actionAt - .2 ? { label: "待用", time: Math.min(readyAt + .31, actionAt - .16) }
    : { label: "蓄力", time: point(opening, .83) }
  const tail = fieldEnd > actionAt + .65 ? fieldEnd - .07 : Math.max(actionAt + .2, result.end - .07, finish.end - .07)
  const impactAt = motif === "sinkBasin" && primary ? Math.max(actionAt, primary.start + .3) : actionAt
  return captureFrames(replay(), ["起手", process.label, action, "收尾"], [first, process.time, impactAt, tail])
}

function reviewDancerFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  const replay = () => createSkillPreview(entry, scene)
  const run = replay()
  const id = entry.skill.id
  const motif = dancerChoreography(id)?.motif
  const events = new Map<number, SkillVisual>()
  let fieldEnd = 0, movingAt = 0
  for (let frame = 1; frame <= Math.round(run.duration * 60); frame++) {
    const time = frame / 60
    advanceSkillPreview(run, time)
    for (const fx of run.battle.runtime.effects) if (fx.skill === id && fx.dancer) events.set(fx.id, fx)
    for (const field of run.battle.runtime.fields) if (field.cast.skill?.id === id) fieldEnd = Math.max(fieldEnd, field.until)
    if (!movingAt && ["leadRibbon", "footCradle", "guardRail"].includes(motif ?? "") &&
      run.battle.team.some(unit => unit.move && !unit.force && (run.battle.runtime.buffs.some(buff =>
        buff.cast.skill?.id === id && buff.target === unit.id && buff.kind === "speed") ||
        run.battle.runtime.fields.some(field => field.cast.skill?.id === id && areaHits(field.area, unit))))) movingAt = time
  }
  const all = [...events.values()]
  const cues = (kind: NonNullable<SkillVisual["dancer"]>["cue"]) => all.filter(fx => fx.dancer?.cue === kind)
  const opening = cues("prepare")[0]
  if (!opening) return captureFrames(replay(), frames, [.31, .53, .92, 1.55])
  const travel = cues("travel"), deploy = cues("deploy")[0], mark = cues("mark")[0]
  const hit = cues("strike").findLast(fx => fx.contacts?.length)
  const release = cues("release").at(-1)
  const landed = cues("land").at(-1)
  const benefit = cues("benefit").at(-1)
  const result = motif === "threadCut" || motif === "doubleJump" || motif === "coastRelay" || motif === "counterSwing"
    ? hit ?? landed : motif === "retreatFlash" ? landed ?? release : release ?? landed ?? hit ?? benefit ?? deploy ?? mark
  const finish = result ?? opening
  const sample = (fx: SkillVisual, progress: number) => fx.start + (fx.end - fx.start) * progress
  const motion = travel.findLast(fx => fx.start <= finish.start)
  const process = motion ? sample(motion, .51)
    : movingAt ? movingAt + .19
      : deploy && deploy.start < finish.start - .2 ? deploy.start + .24
        : mark && mark.start < finish.start - .2 ? mark.start + .26 : sample(opening, .82)
  const label = motion?.dancer?.kind === "glide" ? "滑行" : motion?.dancer?.kind === "hop" ? "跳点"
    : motion?.dancer?.kind === "orbit" ? "旋转" : motion ? "行进" : movingAt ? "实走"
      : deploy ? "留场" : mark ? "待用" : "蓄势"
  const impact = sample(finish, finish.dancer?.cue === "strike" ? .23 : .26)
  const resolution = finish.dancer?.cue === "land" ? "落脚" : finish.dancer?.cue === "strike" ? "命中" : "兑现"
  const expiry = fieldEnd > impact + .75 && fieldEnd < run.duration
  const tail = expiry ? fieldEnd - .07 : Math.max(impact + .10, finish.end - .062)
  return captureFrames(replay(), ["起手", label, resolution, "收尾"],
    [sample(opening, .37), Math.max(opening.start + .055, Math.min(impact - .038, process)), impact, tail])
}

function reviewHealerFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  const replay = () => createSkillPreview(entry, scene)
  const run = replay()
  const id = entry.skill.id
  const motif = healerChoreography(id)?.motif
  const events = new Map<number, SkillVisual>()
  let fieldUntil = 0
  let walking: number | undefined
  for (let frame = 1; frame <= Math.round(run.duration * 60); frame++) {
    advanceSkillPreview(run, frame / 60)
    for (const fx of run.battle.runtime.effects) if (fx.skill === id && fx.healer) events.set(fx.id, fx)
    for (const field of run.battle.runtime.fields) if (field.cast.skill?.id === id) fieldUntil = Math.max(fieldUntil, field.until)
    if (motif === "steadyStep" && walking === undefined && run.battle.team.some(unit => unit.move)) walking = frame / 60
  }
  const cues = (...kinds: HealerBeat["cue"][]) => [...events.values()].filter(fx => fx.healer && kinds.includes(fx.healer.cue))
  const start = cues("prepare")[0]
  if (!start) return captureFrames(replay(), frames, [.25, .65, 1.2, 2.1])
  const at = (fx: SkillVisual, portion: number) => fx.start + (fx.end - fx.start) * portion
  const opening = at(start, .48)
  const field = cues("field")[0], arm = cues("arm")[0]
  const heals = cues("heal"), flights = cues("flight"), initial = cues("heal", "shield", "cleanse")[0] ?? field ?? start
  const reaction = cues("save", "split")[0] ?? cues("release").at(-1)
  if (motif === "aidStation" && field && reaction) return captureFrames(replay(), ["起手", "首位", "接应", "熄灯"],
    [opening, at(heals[0] ?? field, .27), at(reaction, .23), fieldUntil + .08])
  if (motif === "rally" && field && reaction) return captureFrames(replay(), ["起手", "应援", "抗推", "回场"],
    [opening, at(field, .31), at(reaction, .28), Math.min(run.duration, reaction.end + .96)])
  if (reaction) {
    const ready = arm ? Math.min(reaction.start - .10, arm.end + .19) : at(initial, .29)
    const labels = reaction.healer?.cue === "save" ? ["起手", "心电待用", "保命", "救回"]
      : reaction.healer?.cue === "split" ? ["起手", "连护", "分流", "收尾"]
        : ["起手", arm ? "待用" : "护面", "兑现", "收尾"]
    return captureFrames(replay(), labels, [opening, Math.max(at(initial, .18), ready),
      at(reaction, reaction.healer?.cue === "split" ? .37 : .22), at(reaction, .81)])
  }
  const relay = flights.findLast(fx => fx.healer?.kind && ["relay", "priority", "net", "pool"].includes(fx.healer.kind))
  const finish = cues("heal", "shield", "cleanse").at(-1) ?? initial
  if (relay && relay.end > initial.start + .08) {
    const first = Math.min(at(initial, .19), relay.start + .065)
    return captureFrames(replay(), ["起手", "首拍", "转送", "兑现"],
      [opening, first, Math.max(first + .028, at(relay, .62)), at(finish, .36)])
  }
  if (walking !== undefined) return captureFrames(replay(), ["起手", "疗效", "加速步行", "收尾"],
    [opening, at(initial, .25), walking + .24, Math.min(run.duration, walking + 2.60)])
  const middle = flights[0] ? at(flights[0], .53) : at(start, .87)
  return captureFrames(replay(), ["起手", flights[0] ? "送出" : "蓄势", "结算", "收尾"],
    [opening, middle, at(initial, .29), at(finish, .86)])
}

function reviewBardFrames(entry: Extract<SkillPreviewEntry, { kind: "active" }>, scene: SkillPreviewScene) {
  const replay = () => createSkillPreview(entry, scene)
  const run = replay()
  const id = entry.skill.id
  const motif = bardChoreography(id)!.motif
  const trace = new Map<number, SkillVisual>()
  let fieldUntil = 0
  let readyAt: number | undefined
  for (let frame = 1; frame <= Math.round(run.duration * 60); frame++) {
    const time = frame / 60
    advanceSkillPreview(run, time)
    for (const fx of run.battle.runtime.effects) if (fx.skill === id && fx.bard) trace.set(fx.id, fx)
    if (readyAt === undefined && bardActiveReadiness(run.battle).some(mark => mark.skill === id)) readyAt = time
    for (const field of run.battle.runtime.fields) if (field.cast.skill?.id === id) fieldUntil = field.until
  }
  const sequence = [...trace.values()].sort((a, b) => a.start - b.start)
  const cues = (...kinds: BardBeat["cue"][]) => sequence.filter(fx => fx.bard && kinds.includes(fx.bard.cue))
  const showing = (fx: SkillVisual, q: number) => fx.start + (fx.end - fx.start) * q
  const prepare = cues("prepare")[0]
  if (!prepare) return captureFrames(replay(), frames, [.28, .50, .80, 1.15])
  const opening = showing(prepare, .48)
  const flights = cues("flight"), release = cues("release"), arms = cues("arm"), landed = cues("land")
  const impact = cues("hit", "heal", "shield", "break")
  const deploy = cues("deploy")[0]
  const take = (labels: string[], times: number[]) => captureFrames(replay(), labels, times)

  if (motif === "finalScore") {
    const burst = impact.find(fx => fx.bard?.kind === "scorehit")
    const support = release.find(fx => fx.bard?.kind === "heal")
    if (burst && support) return take(["起拍", "授谱", "攻拍", "援拍"],
      [opening, showing(arms.at(-1) ?? prepare, .20), showing(burst, .24), showing(release.find(fx => fx.bard?.kind === "shield") ?? support, .26)])
  }
  if (motif === "rescueSymphony" && impact.length > 2) {
    const breaks = cues("break")
    return take(["起拍", "多卡救援", "来袭护拍", "护壳收尾"], [opening,
      showing(impact.find(fx => fx.bard?.cue === "shield") ?? impact[0], .24),
      showing(breaks[0] ?? impact.at(-1)!, .25), showing(breaks.at(-1) ?? impact.at(-1)!, .85)])
  }
  if (motif === "overture" && flights.length && landed.length) return take(["起拍", "归位滑条", "到位领盾", "余拍普攻"],
    [opening, showing(flights[0], .58), showing(landed.at(-1)!, .33), showing(release.at(-1) ?? landed.at(-1)!, .62)])
  if (motif === "shoreCoda" && release[0]) {
    const crossing = release[0], payoff = impact.findLast(fx => fx.bard?.kind === "return") ?? crossing
    return take(["起拍", "界外留音", "实过线", "侧席护盾"],
      [opening, Math.max((readyAt ?? crossing.start) + .09, crossing.start - .39),
        showing(crossing, .13), showing(payoff, .57)])
  }
  if (motif === "timingLane" && deploy && landed[0] && release[0]) {
    return take(["起拍", "铺设节线", "到位护盾", "延距普攻"], [opening,
      showing(deploy, .28), showing(landed[0], .26), showing(release[0], .29)])
  }
  if (motif === "ensembleCall" || motif === "duet" || motif === "antiphon") {
    const paid = impact.filter(fx => motif === "ensembleCall" ? fx.bard?.kind === "ensembleCall" : fx.bard?.kind === "hit")
    if (paid.length >= 2) return take(["起拍", motif === "ensembleCall" ? "双拍待用" : motif === "duet" ? "双端挂音" : "留音", "首位接拍", "另一位接拍"],
      [opening, showing(arms.at(-1) ?? prepare, .28), showing(paid[0], .23), showing(paid[1], .27)])
  }
  const trigger = release[0] ?? landed[0] ?? cues("break")[0]
  if (deploy && trigger && fieldUntil > trigger.start + .32) return take(["起拍", "铺曲", "兑现", "消散"],
    [opening, showing(deploy, .29), showing(trigger, .30), Math.min(run.duration, fieldUntil - .09)])
  const follow = flights.find(fx => fx.bard?.kind !== "note" && fx.bard?.kind !== "needle")
  if (follow) {
    const hit = impact.find(fx => fx.start >= follow.end - .02) ?? landed[0] ?? trigger ?? impact.at(-1) ?? follow
    const hold = arms[0] ?? impact[0] ?? deploy ?? prepare
    return take(["起拍", hold.bard?.cue === "arm" ? "留拍" : "首拍", "接续", "兑现"],
      [opening, Math.min(showing(follow, .32) - .04, Math.max(opening + .08, showing(hold, .20))),
        showing(follow, .63), Math.max(showing(follow, .63) + .05, showing(hit, .24))])
  }
  if (trigger && (arms.length || deploy)) {
    const held = arms.at(-1) ?? deploy!
    const response = impact.find(fx => fx.start >= trigger.start - .01) ?? trigger
    return take(["起拍", deploy ? "待用曲域" : "待用", "兑现", "余音"],
      [opening, Math.min(trigger.start - .045, showing(held, .33)), showing(trigger, .24),
        Math.max(showing(trigger, .71), showing(response, .71))])
  }
  const first = impact[0] ?? arms[0] ?? deploy ?? prepare
  const last = impact.at(-1) ?? arms.at(-1) ?? first
  return take(["起拍", flights.length ? "送音" : "落拍", "结算", "余音"],
    [opening, flights.length ? showing(flights[0], .64) : showing(first, .15),
      Math.max(showing(first, .39), showing(last, .27)), showing(last, .85)])
}

export function reviewFrames(entry: SkillPreviewEntry, scene: SkillPreviewScene) {
  if (entry.kind === "active" && bardChoreography(entry.skill.id)) return reviewBardFrames(entry, scene)
  if (entry.kind === "active" && healerChoreography(entry.skill.id)) return reviewHealerFrames(entry, scene)
  if (entry.kind === "active" && dancerChoreography(entry.skill.id)) return reviewDancerFrames(entry, scene)
  if (entry.kind === "active" && binderChoreography(entry.skill.id)) return reviewBinderFrames(entry, scene)
  if (entry.kind === "active" && lifebringerChoreography(entry.skill.id)) return reviewLifebringerFrames(entry, scene)
  if (entry.kind === "active" && warlockChoreography(entry.skill.id)) return reviewWarlockFrames(entry, scene)
  if (entry.kind === "active" && assassinChoreography(entry.skill.id)) return reviewAssassinFrames(entry, scene)
  if (entry.kind === "active" && spellbreakerChoreography(entry.skill.id)) return reviewSpellbreakerFrames(entry, scene)
  const holy = entry.kind === "active" && paladinChoreography(entry.skill.id)
  if (holy) return reviewPaladinFrames(entry, scene, holy.motif)
  const berserker = entry.kind === "active" && berserkerChoreography(entry.skill.id)
  if (berserker) return reviewBerserkerFrames(entry, scene, berserker.motif)
  const bulwark = entry.kind === "active" && bulwarkChoreography(entry.skill.id)
  if (bulwark) return reviewBulwarkFrames(entry, scene, bulwark.motif)
  const warden = entry.kind === "active" && wardenChoreography(entry.skill.id)
  if (warden) return reviewWardenFrames(entry, scene, warden.motif)
  if (entry.kind === "active" && entry.skill.deployment) return reviewSummonFrames(entry, scene)
  if (entry.kind === "passive" && entry.job === "ranger" ||
    entry.kind !== "active" && (entry.job === "summoner" || entry.job === "bulwark" || entry.job === "warden" || entry.job === "berserker" || entry.job === "paladin" || entry.job === "spellbreaker" || entry.job === "assassin" || entry.job === "warlock" || entry.job === "lifebringer" || entry.job === "binder" || entry.job === "dancer" || entry.job === "healer" || entry.job === "bard"))
    return reviewTrait(entry, scene)
  const trace = createSkillPreview(entry, scene)
  const effects = new Map<number, SkillVisual>()
  const matchesSkill = ({ cast }: { cast: { signature?: { id: string }; skill?: { id: string } } }) =>
    (cast.signature?.id ?? cast.skill?.id) === entry.skill.id
  let armed: number | undefined
  let fieldUntil: number | undefined
  for (let frame = 1; frame <= Math.round(trace.duration * 60); frame++) {
    const time = frame / 60
    advanceSkillPreview(trace, time)
    for (const fx of trace.battle.runtime.effects) {
      if (fx.skill === entry.skill.id && time >= fx.start && time < fx.end) effects.set(fx.id, fx)
    }
    if (entry.skill.id === "ranger/E/G2") fieldUntil ??= trace.battle.runtime.fields.find(matchesSkill)?.until
    if (time > .45 && armed === undefined && (trace.battle.runtime.fields.some(matchesSkill) ||
      trace.battle.runtime.watches.some((watch) => watch.uses > 0 && matchesSkill(watch)) ||
      trace.battle.runtime.buffs.some((buff) => buff.until > time && matchesSkill(buff)))) armed = time
  }
  const events = [...effects.values()].sort((a, b) => a.start - b.start)
  const opening = events.find(({ phase }) => phase === "start" || phase === "passive")
  const hits = events.filter(({ phase }) => phase === "impact")
  const hitWithContacts = hits.filter(({ contacts }) => contacts?.length)
  const hitList = hitWithContacts.length ? hitWithContacts : hits
  const motif = rangerChoreography(entry.skill.id)?.motif
  const paths = events.filter(({ phase }) => phase === (motif === "singleBeat" ? "windup" : "travel"))
  const flight = motif === "relay" || motif === "starRain" || motif === "reflection" ? paths.at(-1) : paths[0]
  const path = events.find(({ phase }) => phase === "windup" || phase === "motion")
  const last = hits.at(-1) ?? events.at(-1)
  const sample = (fx: SkillVisual | undefined, progress: number, fallback: number) =>
    fx ? fx.start + (fx.end - fx.start) * progress : fallback
  const openingAt = Math.min(sample(opening, entry.kind === "gold" && flight ? .14 : .32, .28),
    hitList[0]?.start ?? Infinity, armed ?? Infinity)
  const process = flight ? sample(flight, .55, openingAt) : armed === undefined
    ? sample(path, .55, openingAt + .21) : Math.max(openingAt + .08, armed + .08)
  const contact = hitList.find((hit) => hit.start >= process - .02) ?? hitList.at(-1)
  if (entry.kind === "gold" && motif && !flight && opening && contact && contact.start - opening.start < .04) {
    const openingFrame = sample(opening, .15, openingAt)
    const motionFrame = Math.max(openingFrame + .04, sample(path ?? contact, .29, openingFrame))
    const contactFrame = Math.max(motionFrame + .06, sample(contact, .43, motionFrame))
    return captureFrames(createSkillPreview(entry, scene), frames,
      [openingFrame, motionFrame, contactFrame, Math.max(contactFrame + .08, sample(last, .79, contactFrame))])
  }
  const travelAt = Math.min(process, contact?.start ?? Infinity)
  const hitAt = sample(contact, .17, travelAt + .18)
  const tailAt = fieldUntil ? Math.min(trace.duration, fieldUntil - .11) : Math.max(hitAt, sample(last, .77, hitAt + .3))
  return captureFrames(createSkillPreview(entry, scene), frames, [openingAt, travelAt, hitAt, tailAt])
}
