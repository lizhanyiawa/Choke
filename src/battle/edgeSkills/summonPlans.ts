import { parseStep, type DeploymentKind, type Step } from "./program"

export type SummonForm = "sentry" | "beast" | "ward" | "stake" | "wall" | "bird" | "decoy" | "lantern" | "medic" | "mist"
  | "doll" | "spool" | "bow" | "bell" | "mirror" | "bridge" | "gate" | "ram"

export type SummonMotion =
  | { kind: "follow" | "chase"; speed: number; gap: number }
  | { kind: "orbit"; radius: number; seconds: number }
  | { kind: "patrol" | "outBack" | "leap"; speed: number; reach?: number }

type ActionEvent = "move" | "hit" | "strike" | "charge" | "return" | "destroy"
type Reaction = { on: ActionEvent; who: "linked" | "ally" | "foe" | "basic"; reach: number }
export interface SummonAction {
  step: Step
  cooldown: number
  delay?: number
  slot?: number
  at?: "link" | "ownerLine"
  phase?: "out" | "back" | "landed"
  reach?: number
  shot?: boolean
  reaction?: Reaction
}

export interface SummonPlan {
  form: SummonForm
  duration: number
  health: number
  spawn?: "caster" | "target"
  offset?: number
  formation?: { spacing: number; forms: readonly SummonForm[] }
  motion?: SummonMotion
  actions?: readonly SummonAction[]
  terrain?: { type: "block" | "leash"; radius: number; cooldown?: number }
  aura?: { side: "ally" | "enemy"; stat: "anti" | "res" | "healrecv"; value: number; radius: number; phase?: "landed" }
  guard?: { type: "linked" | "line" | "dome"; share: number; reach: number; cooldown: number; basicOnly?: boolean }
  gate?: { radius: number; cooldown: number }
  lure?: number
}

function act(text: string, cooldown: number, options: Omit<SummonAction, "step" | "cooldown"> = {}): SummonAction {
  return { step: parseStep(text), cooldown, ...options }
}

function plan(form: SummonForm, duration: number, health: number, options: Omit<SummonPlan, "form" | "duration" | "health"> = {}): SummonPlan {
  return { form, duration, health, ...options }
}

export const SUMMON_PLANS = {
  sentry: plan("sentry", 10, .24, { actions: [act("eC190#1 d.55~summon", 2.9, { delay: .35, shot: true })] }),
  kiln: plan("beast", 9, .30, { actions: [act("eF142,78 d.42~summon", 2.2, { delay: .55 })] }),
  escort: plan("ward", 10, .32, {
    spawn: "caster", motion: { kind: "follow", speed: 170, gap: 57 }, actions: [act("t?notshielded b11,4.5", 3.5, { reach: 88 })],
  }),
  barricade: plan("wall", 9, .45, { terrain: { type: "block", radius: 61 } }),
  kite: plan("bird", 10, .23, {
    spawn: "caster", motion: { kind: "follow", speed: 236, gap: 61 }, actions: [act("t armor18,2.6", 2.5, { reach: 98 })],
  }),
  decoy: plan("decoy", 8, .19, {
    lure: 160, actions: [act("aC115 b8,4", 0, { reaction: { on: "destroy", who: "foe", reach: Infinity } })],
  }),
  lantern: plan("lantern", 10, .28, {
    motion: { kind: "orbit", radius: 68, seconds: 3.8 }, actions: [act("aC61 speed27,2.3", 2.15)],
  }),
  twinBirds: plan("bird", 10, .22, {
    formation: { spacing: 82, forms: ["bird", "bird"] },
    actions: [act("eL1,66#1 root.75", 3.4, { at: "link", slot: 0, delay: .65 })],
  }),
  medic: plan("medic", 11, .34, {
    spawn: "caster", motion: { kind: "follow", speed: 185, gap: 56 }, actions: [act("t?low50 h13", 4.1, { reach: 95 })],
  }),
  mist: plan("mist", 10, .37, { actions: [act("eC96 slow24,2.3", 2.1, { delay: .3 })] }),
  runner: plan("doll", 10, .36, {
    spawn: "caster", motion: { kind: "chase", speed: 300, gap: 38 },
    actions: [act("t d.64~summon p65", 2.8, { reach: 52 })],
  }),
  lasso: plan("spool", 10, .38, { offset: 54, terrain: { type: "leash", radius: 116, cooldown: 3.2 } }),
  ambush: plan("doll", 11, .38, {
    actions: [act("u i", 4, { reaction: { on: "charge", who: "foe", reach: 105 } })],
  }),
  shadow: plan("mirror", 11, .35, {
    spawn: "caster", motion: { kind: "follow", speed: 208, gap: 56 },
    actions: [act("v addp38", 3.6, { reaction: { on: "strike", who: "basic", reach: 95 } })],
  }),
  plate: plan("stake", 11, .46, { actions: [act("aC108#1?notshielded b17,6", 3.8)] }),
  twinBows: plan("bow", 12, .30, {
    formation: { spacing: 100, forms: ["bow", "bow"] },
    actions: [act("eL1,60 d.50~summon", 2.9, { at: "link", slot: 0, delay: .85 })],
  }),
  rail: plan("spool", 11, .42, { actions: [act("aL315,66 speed22,2.7 extend52,4", 3.1, { at: "ownerLine" })] }),
  bell: plan("bell", 11, .47, {
    actions: [
      act("eC135 d.36~summon slow18,1.5", 4.3, { delay: .45 }),
      act("eC135 d.49~summon p65", 4.3, { delay: 1.12 }),
    ],
  }),
  paperGuard: plan("ward", 11, .44, {
    spawn: "caster", motion: { kind: "follow", speed: 224, gap: 51 },
    actions: [act("v clean1 b16,6", 3.8, { reaction: { on: "move", who: "linked", reach: 116 } })],
  }),
  frostHook: plan("stake", 12, .47, {
    actions: [act("eC116#1 l63,37 slow18,1.7", 3.4, { delay: .52 })],
  }),
  mirror: plan("mirror", 12, .42, {
    spawn: "caster", motion: { kind: "follow", speed: 232, gap: 54 },
    actions: [act("v d.66~summon", 3.3, { shot: true, reach: 255, reaction: { on: "hit", who: "basic", reach: 105 } })],
  }),
  roadBeast: plan("beast", 12, .61, {
    spawn: "caster", motion: { kind: "patrol", speed: 171, reach: 345 }, terrain: { type: "block", radius: 54 },
    actions: [act("eC67#1 p64~side", 3.1, { delay: .35 })],
  }),
  bodyguard: plan("ward", 12, .53, {
    spawn: "caster", motion: { kind: "follow", speed: 219, gap: 58 }, guard: { type: "linked", share: .36, reach: 105, cooldown: 2.7 },
  }),
  hexWard: plan("stake", 12, .58, {
    aura: { side: "ally", stat: "anti", value: 22, radius: 139 },
    actions: [act("aC139#1?notshielded b22,6", 3.6)],
  }),
  mirrorWeave: plan("mirror", 12, .35, {
    formation: { spacing: 86, forms: ["mirror", "mirror"] }, guard: { type: "line", share: 1, reach: 32, cooldown: 3.6, basicOnly: true },
  }),
  orbitBeast: plan("beast", 12, .63, {
    motion: { kind: "orbit", radius: 105, seconds: 3.8 },
    actions: [act("eC80#1 d.62~summon p78~eventaxis", 2.75)],
  }),
  shoreBeast: plan("beast", 12, .58, {
    spawn: "caster", motion: { kind: "leap", speed: 670 },
    actions: [act("eC137#1 p96~edge", 3.5, { phase: "landed" })],
  }),
  paperBeat: plan("doll", 12, .31, {
    formation: { spacing: 84, forms: ["lantern", "bell", "doll"] },
    actions: [
      act("aC119 speed25,2.5", 4.5, { slot: 0, delay: .45 }),
      act("eC112 weak22,2.6", 4.5, { slot: 1, delay: 1.30 }),
      act("eC112 p64", 4.5, { slot: 2, delay: 2.15 }),
    ],
  }),
  rescue: plan("medic", 13, .55, {
    spawn: "caster", motion: { kind: "follow", speed: 275, gap: 48 },
    actions: [
      act("t?low40 h16 b19,7", 5.0, { reach: 112 }),
      act("v anti28,4 clean1", 5.4, { reaction: { on: "return", who: "linked", reach: 155 } }),
    ],
  }),
  bridge: plan("bridge", 13, .59, {
    motion: { kind: "orbit", radius: 90, seconds: 4.2 },
    actions: [
      act("aC74#l1?notfull h9", 3.6),
      act("v h12 clean1", 4.1, { reaction: { on: "return", who: "ally", reach: 125 } }),
    ],
  }),
  ensemble: plan("gate", 14, .37, {
    formation: { spacing: 91, forms: ["beast", "ward", "ram"] },
    actions: [
      act("eC145 d.75~summon", 4.9, { slot: 0, delay: .5 }),
      act("aC149 b20,8", 4.9, { slot: 1, delay: 1.55 }),
      act("eC144 p108", 4.9, { slot: 2, delay: 2.65 }),
    ],
  }),
  gates: plan("gate", 12, .20, {
    formation: { spacing: 105, forms: ["gate", "gate"] }, gate: { radius: 43, cooldown: 2.4 },
  }),
  paperPack: plan("doll", 14, .23, {
    spawn: "target", formation: { spacing: 82, forms: ["doll", "ward", "mirror"] },
    motion: { kind: "follow", speed: 252, gap: 82 }, guard: { type: "linked", share: .44, reach: 118, cooldown: 1.75 },
  }),
  armorBeast: plan("ward", 14, .75, {
    spawn: "caster", motion: { kind: "leap", speed: 730 }, aura: { side: "ally", stat: "anti", value: 28, radius: 144, phase: "landed" },
    guard: { type: "dome", share: .56, reach: 144, cooldown: 2.7 },
    actions: [act("aC144?notshielded b19,7", 4.2, { phase: "landed" })],
  }),
  returnBeast: plan("beast", 13, .63, {
    spawn: "caster", motion: { kind: "outBack", speed: 308 },
    actions: [
      act("eC69 p84~eventaxis", 2.4, { phase: "out" }),
      act("aC93#1?out l148,24 b13,6", 3.3, { phase: "back" }),
    ],
  }),
} satisfies Record<DeploymentKind, SummonPlan>
