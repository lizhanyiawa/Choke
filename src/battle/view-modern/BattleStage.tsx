import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import gsap from "gsap"
import {
  GiBroadsword,
  GiBrokenShield,
  GiCrackedShield,
  GiCrossedSwords,
  GiCrown,
  GiCycle,
  GiDrop,
  GiFireball,
  GiFlame,
  GiHornedSkull,
  GiHourglass,
  GiIceBolt,
  GiLightningBow,
  GiMagicPortal,
  GiRoundStar,
  GiShield,
  GiSkullCrossedBones,
  GiSleepy,
  GiStarSwirl,
  GiStoneBlock,
  GiStunGrenade,
  GiTargetLaser,
  GiThornyVine,
  GiTrophy,
  GiTrumpetFlag,
} from "react-icons/gi"

import { ElementGlyph, JobGlyph } from "@/card/CardFace"
import { GameCardFace } from "@/card/GameCardFace"
import { BattleLog, ReadoutTip, SkillHint, SupportReadout, TriggerReadout } from "../BattleReadouts"
import { ELEMENT_COLOR, ELEMENT_LABEL, JOB_LABEL, battlePower } from "@/card/data"
import { pointerCommand, useSkillRows } from "../useSkillRows"
import { usePlaybackSpeed } from "../usePlaybackSpeed"
import { useAutoEndTurn } from "../useAutoEndTurn"
import { DESK_BATTLE_EXIT, tutorialBattleHint, type BattleExit, type BattleHostHooks } from "../host"
import { impact, reducedImpactMotion, sustainHurtTint } from "../impact"
import type { CardFaceData, Element } from "@/card/types"

import {
  comboMultiplier,
  enemyDamageTier,
  evaluateStars,
  hasTankAlive,
  teamHpOf,
  healEfficiency,
} from "@choke/shared/battle/engine"
import type { EncounterSpec, EncounterSummary } from "@choke/shared/battle/content"
import { describeStar, starProgress } from "@choke/shared/battle/stars"
import { HpBar, type HpFlash } from "./HpBar"
import { playHit, playLose, playSfx, playTurn, playWin } from "../sfx"
import { TestEnemyPicker } from "../view/TestEnemyPicker"
import type { BattleState, EnemyIntent, SideSupportUnit } from "@choke/shared/battle/types"
import stageCss from "./choke-battle.css?inline"

const AP_SLOTS = 10
/** 结算层亮起后，第一颗星盖下去的时刻和每颗星的间隔（毫秒）；choke-battle.css 里的延时与之对应 */
const RESULT_STAR_DELAY = 620
const RESULT_STAR_GAP = 260

interface Props {
  battle: BattleState | null
  playerName: string
  deck: CardFaceData[]
  /** 当前选中的遭遇（战前画面展示用） */
  encounter: EncounterSpec
  /** 可选的讨伐目标 */
  encounters: EncounterSummary[]
  tutorial: boolean
  /** 战斗测试：可选所有敌人，不发奖励、不记发现；只在开发模式传入 onToggleTest */
  testMode?: boolean
  onToggleTest?: () => void
  actionError: string | null
  onSelectStage: (stageId: string) => void
  onStart: () => void
  onPlay: (cardIndex: number, skillId: string) => void
  onDefend: (tier?: number) => void
  onSwap: (activeSlotIndex: number, benchUid: number) => void
  onEndTurn: () => void
  onRestart: () => void
  onSwitchUi?: () => void
  /** 嵌在别的流程里时由宿主接管退出和结算按钮；不传是独立战斗页 */
  host?: BattleHostHooks
  exit?: BattleExit
}

function bossBgStyle(background: string): CSSProperties {
  return { "--boss-bg": `url(/battle-bg/${background}.jpg)` } as CSSProperties
}

function elementColor(element: string) {
  return ELEMENT_COLOR[element as Element] ?? "#8a9099"
}

function elementLabel(element: string) {
  return ELEMENT_LABEL[element as Element] ?? element
}

/**
 * 弱点条。公开弱点一直显示；隐藏弱点没打中过只显示「？」，打中后显示属性；
 * 窗口弱点（破绽）只在对应回合显示。界面只显示这三类里该显示的，数据本身在接口里都查得到。
 */
function WeaknessRibbon({
  open,
  found,
  exposed,
  unknown,
}: {
  open: readonly Element[]
  found: readonly Element[]
  exposed: readonly Element[]
  unknown: number
}) {
  const chip = (el: Element, title: string, variant?: "found" | "window") => (
    <span
      key={`${variant ?? "open"}-${el}`}
      className="choke-weak-el"
      data-variant={variant}
      title={title}
      style={{ "--el": elementColor(el) } as CSSProperties}
    >
      <ElementGlyph element={el} />
      <em>{variant === "window" ? `${elementLabel(el)} 破绽` : elementLabel(el)}</em>
    </span>
  )
  return (
    <div className="choke-weakness-ribbon">
      <span>弱点</span>
      <div className="choke-weakness-icons">
        {open.map((el) => chip(el, `弱点：${elementLabel(el)} (+30% 伤害)`))}
        {found.map((el) => chip(el, `已发现的隐藏弱点：${elementLabel(el)}`, "found"))}
        {exposed.map((el) => chip(el, `本回合露出破绽：${elementLabel(el)}（只在这一回合有效）`, "window"))}
        {Array.from({ length: unknown }, (_, i) => (
          <span
            key={`unknown-${i}`}
            className="choke-weak-el"
            data-variant="unknown"
            title="还有一个隐藏弱点：用对应属性打中一次就能揭开"
          >
            <em>？</em>
          </span>
        ))}
      </div>
    </div>
  )
}


function IntentIcon({ kind }: { kind: EnemyIntent["kind"] }) {
  switch (kind) {
    case "attack":
      return <GiBroadsword />
    case "magic":
      return <GiFireball />
    case "heavy_phys":
      return <GiCrossedSwords />
    case "heavy_magic":
      return <GiStarSwirl />
    case "debuff":
      return <GiHornedSkull />
    case "buff":
      return <GiCrown />
    case "add_support":
      return <GiMagicPortal />
    case "break_support":
      return <GiBrokenShield />
    default:
      return <GiBroadsword />
  }
}

function SupportKindIcon({ unit }: { unit: SideSupportUnit }) {
  switch (unit.kind) {
    case "defense":
    case "armor":
      return <GiShield />
    case "thorns":
      return <GiThornyVine />
    case "charge":
      return <GiFlame />
    case "shell":
      return <GiStoneBlock />
    case "aura":
      return <GiTrumpetFlag />
    case "attack":
    default:
      return unit.job ? <JobGlyph job={unit.job} /> : <GiCrossedSwords />
  }
}

export function BattleStage({
  battle,
  playerName,
  deck,
  encounter,
  encounters,
  tutorial,
  testMode = false,
  onToggleTest,
  actionError,
  onSelectStage,
  onStart,
  onPlay,
  onDefend,
  onSwap,
  onEndTurn,
  onRestart,
  onSwitchUi,
  host,
  exit = DESK_BATTLE_EXIT,
}: Props) {
  const [intentHover, setIntentHover] = useState<{ id: string; anchor: HTMLElement; pointer: { x: number; y: number } } | null>(null)
  const [previewAp, setPreviewAp] = useState(0)
  const [logOpen, setLogOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapOutIdx, setSwapOutIdx] = useState(0)
  const { label, hint, cycle, stepGap } = usePlaybackSpeed()
  const [turnAnimating, setTurnAnimating] = useState(false)
  const autoEnd = useAutoEndTurn({ battle, allowed: !tutorial && !turnAnimating, onEndTurn })
  /** 胜负已定后，等最后一击演完才亮结算层 */
  const [resultShown, setResultShown] = useState(battle?.phase === "won" || battle?.phase === "lost")

  // 出招横幅、敌方瞄准线、掉血闪段这些演出用的状态
  const [cutinBanner, setCutinBanner] = useState<{
    seq: number
    actor: "card" | "support" | "preemptive" | "enemy"
    title: string
    subtitle: string
    element: Element
  } | null>(null)
  const cutinSeq = useRef(0)
  const [slashKey, setSlashKey] = useState(0)
  const [laserTargets, setLaserTargets] = useState<number[]>([])
  /** 瞄准线的起点（敌人印记）和各落点（被瞄准的卡），都是舞台宽高的百分比 */
  const [laserLines, setLaserLines] = useState<{
    from: { x: number; y: number }
    to: { x: number; y: number }[]
  } | null>(null)
  const [guardChipSlot, setGuardChipSlot] = useState<number | null>(null)
  // 顶栏的回合也跟着演出走：敌方回合是服务端一次算完的，事件还在播的时候状态已经是下一回合了
  const [turnView, setTurnView] = useState<{ owner: "player" | "enemy"; round: number } | null>(null)
  // 血条演出投影：由事件逐段推进；为空时回落到引擎的真实值
  const [hpView, setHpView] = useState<{ party?: number; enemy?: number }>({})
  // 引擎真实血量。事件播完后落到这里，而不是清空：清空会让下一轮一开始就先显示最终值，再被首个事件拉高
  const hpTruth = useRef<{ party?: number; enemy?: number }>({})
  const liveHp = useRef<{ party: number; enemy: number }>({ party: 0, enemy: 0 })
  const [hpFlashes, setHpFlashes] = useState<HpFlash[]>([])
  const flashId = useRef(1)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const hurtTintRef = useRef<HTMLDivElement | null>(null)
  /** 敌人区正中的打击区：伤害数字、爆光都挂在这里，震动也只震这一块，两边的信息不跟着晃 */
  const bossRef = useRef<HTMLDivElement | null>(null)
  const sigilRef = useRef<HTMLDivElement | null>(null)
  /** 播报条：一句话战况、出招横幅、回合切换都在这一条里，不盖别的内容 */
  const laneRef = useRef<HTMLDivElement | null>(null)
  /** 队伍血量块：没有具体哪张卡可挂的数字（治疗、全队受击）挂在这里 */
  const partyRef = useRef<HTMLDivElement | null>(null)
  const comboRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastSeq = useRef(battle?.actionSeq ?? 0)
  const fxTimers = useRef(new Set<number>())
  /** 同时飘着几个伤害数字：新数字按这个数错开位置，连击时不会叠成一团 */
  const popupLive = useRef(0)

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      fxTimers.current.delete(id)
      fn()
    }, ms)
    fxTimers.current.add(id)
    return id
  }, [])

  useEffect(() => {
    const timers = fxTimers.current
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      timers.clear()
    }
  }, [])

  // 掉血闪段：刚掉的那一截在血条上亮一下
  const flashLoss = useCallback(
    (side: HpFlash["side"], from: number, to: number) => {
      if (from <= to) return
      const id = flashId.current++
      setHpFlashes((prev) => [...prev, { id, side, from, to }])
      later(() => setHpFlashes((prev) => prev.filter((f) => f.id !== id)), 460)
    },
    [later],
  )

  const popup = useCallback(
    (
      parent: HTMLElement | null,
      text: string,
      variant: "enemy" | "card",
      subLabel?: string,
      kind?: "heal" | "miss" | "wake" | "interrupt",
      crit?: boolean,
      isWeak?: boolean,
    ) => {
      if (!parent) return
      const node = document.createElement("div")
      node.className = `choke-popup choke-popup--${variant}`
      node.textContent = text
      if (kind) node.dataset.kind = kind
      if (crit) node.dataset.crit = "true"
      if (isWeak) node.dataset.weak = "true"
      if (subLabel) {
        const em = document.createElement("em")
        em.textContent = subLabel
        node.appendChild(em)
      }
      // 打在敌人身上的数字：第 n 个还没消失的数字往旁边、往上错开，连击时每一段都看得清
      if (variant === "enemy") {
        const n = popupLive.current
        const side = n % 2 === 0 ? 1 : -1
        node.style.setProperty("--px", `${side * Math.ceil(n / 2) * 11}cqw`)
        node.style.setProperty("--py", `${-(n % 3) * 1.3}cqw`)
        popupLive.current = n + 1
      }
      const life = 820
      node.style.animationDuration = `${life}ms`
      // 同一处只留最新一个：多段攻击连着打时，后一段顶掉前一段，不叠成一团
      if (variant === "card") parent.querySelectorAll(":scope > .choke-popup--card").forEach((old) => old.remove())
      parent.appendChild(node)
      later(() => {
        node.remove()
        if (variant === "enemy") popupLive.current = Math.max(0, popupLive.current - 1)
      }, life)
    },
    [later],
  )

  const flash = useCallback(() => {
    const parent = bossRef.current
    if (!parent) return
    const node = document.createElement("div")
    node.className = "choke-hit-flash"
    parent.appendChild(node)
    later(() => node.remove(), 150)
  }, [later])

  // 受击演出：属性色爆光 + 放射线 + 斩痕，规模随伤害占敌方血量的比例放大
  const hitBurst = useCallback(
    (element: Element, ratio: number, crit: boolean) => {
      const parent = bossRef.current
      if (!parent) return
      const tier = crit || ratio > 0.08 ? 3 : ratio > 0.03 ? 2 : 1
      const color = elementColor(element)
      const jitter = () => `${(Math.random() - 0.5) * 8}cqw`
      const root = document.createElement("div")
      root.className = "choke-burst"
      root.dataset.tier = String(tier)
      root.style.setProperty("--el", color)
      root.style.setProperty("--jx", jitter())
      root.style.setProperty("--rot", `${-30 + Math.random() * 60}deg`)
      root.innerHTML = '<i class="choke-burst-glow"></i><i class="choke-burst-rays"></i><i class="choke-burst-slash"></i>'
      parent.appendChild(root)
      later(() => root.remove(), 520)

    },
    [later],
  )

  // 多段受击只保留一层底边红晕，不叠亮；卡牌仍逐段回弹。
  const hurt = useCallback(
    (target: HTMLElement | undefined, ratio: number) => {
      if (ratio <= 0) return
      const parent = stageRef.current
      sustainHurtTint(hurtTintRef.current)
      impact(target, ratio, "card")
      impact(parent?.querySelector(".choke-party-grid"), ratio, "row")
    },
    [],
  )

  /** 播报条里横扫的大字：回合切换、开战 */
  const sweepBanner = useCallback(
    (text: string, tone: "player" | "enemy" | "start") => {
      const parent = laneRef.current
      if (!parent) return
      const life = tone === "start" ? 900 : 780
      const node = document.createElement("div")
      node.className = "choke-turn-banner"
      node.dataset.owner = tone
      node.style.animationDuration = `${life}ms`
      const label = document.createElement("span")
      label.textContent = text
      node.appendChild(label)
      parent.appendChild(node)
      later(() => node.remove(), life)
    },
    [later],
  )

  useEffect(() => {
    if (!battle) {
      lastSeq.current = 0
      hpTruth.current = {}
      later(() => {
        setHpView({})
        setTurnView(null)
        setTurnAnimating(false)
      }, 0)
      return
    }
    const truth = { enemy: battle.enemy.hp, party: teamHpOf(battle).hp }
    if (hpTruth.current.enemy === undefined) {
      hpTruth.current = truth
      setHpView(truth)
    }
    if (battle.actionSeq === lastSeq.current) return
    lastSeq.current = battle.actionSeq
    liveHp.current = {
      enemy: hpTruth.current.enemy ?? truth.enemy,
      party: hpTruth.current.party ?? truth.party,
    }
    hpTruth.current = truth
    const partyMax = Math.max(1, teamHpOf(battle).max)
    const enemyMax = Math.max(1, battle.enemy.hpMax)

    battle.events.forEach((event, idx) => {
      const delay = idx * stepGap
      later(() => {
        if (event.type === "cutin") {
          // 敌人出招是预警的低音，我方出招是一道风声
          playSfx(event.actor === "enemy" ? "warn" : "cutin")
          const seq = ++cutinSeq.current
          setCutinBanner({
            seq,
            actor: event.actor,
            title: event.title,
            subtitle: event.subtitle,
            element: event.element,
          })
          if (event.cardIndex != null) {
            const node = cardRefs.current[event.cardIndex]
            if (node && !reducedImpactMotion()) {
              gsap.fromTo(
                node,
                { y: 0, scale: 1 },
                {
                  y: -10,
                  scale: 1.04,
                  duration: 0.12,
                  yoyo: true,
                  repeat: 1,
                  ease: "power2.out",
                  onComplete: () => gsap.set(node, { clearProps: "transform" }),
                },
              )
            }
          }
          // 只收自己这一条：连着两次出招时，前一条的定时器不会把后一条提前收掉
          later(() => setCutinBanner((cur) => (cur?.seq === seq ? null : cur)), 750)
          return
        }

        if (event.type === "laser") {
          playSfx("laser")
          setLaserTargets(event.targetSlots)
          const stage = stageRef.current?.getBoundingClientRect()
          const origin = sigilRef.current?.getBoundingClientRect()
          if (stage && origin) {
            const at = (x: number, y: number) => ({
              x: ((x - stage.left) / stage.width) * 100,
              y: ((y - stage.top) / stage.height) * 100,
            })
            setLaserLines({
              from: at(origin.left + origin.width / 2, origin.top + origin.height / 2),
              to: event.targetSlots.flatMap((slot) => {
                const rect = cardRefs.current[slot]?.getBoundingClientRect()
                return rect ? [at(rect.left + rect.width / 2, rect.top + rect.height * 0.1)] : []
              }),
            })
          }
          if (event.guardedSlot != null) {
            setGuardChipSlot(event.guardedSlot)
          }
          later(() => {
            setLaserTargets([])
            setLaserLines(null)
            setGuardChipSlot(null)
          }, 650)
          return
        }

        if (event.type === "damage") {
          if (event.target === "enemy") {
            if (event.enemyHpAfter != null) {
              const before = liveHp.current.enemy
              const ratio = (before - event.enemyHpAfter) / enemyMax
              impact(bossRef.current, ratio, "enemy")
              impact(stageRef.current?.querySelector('.choke-hpbar[data-side="enemy"]'), ratio, "gauge")
              liveHp.current.enemy = event.enemyHpAfter
              flashLoss("enemy", (before / enemyMax) * 100, (event.enemyHpAfter / enemyMax) * 100)
              setHpView((prev) => ({ ...prev, enemy: event.enemyHpAfter }))
            }
            setSlashKey((k) => k + 1)
            flash()
            const tag = event.crit ? "CRITICAL!" : event.isWeak ? "WEAK!" : undefined
            popup(
              bossRef.current,
              `${event.amount.toLocaleString("en-US")}`,
              "enemy",
              tag,
              undefined,
              Boolean(event.crit),
              Boolean(event.isWeak),
            )
            hitBurst(event.element, event.amount / Math.max(1, battle.enemy.hpMax), Boolean(event.crit))
            const attacker = cardRefs.current[event.cardIndex ?? -1]
            if (attacker && !reducedImpactMotion()) {
              gsap.fromTo(
                attacker,
                { y: 0 },
                {
                  y: -18,
                  duration: 0.07,
                  yoyo: true,
                  repeat: 1,
                  ease: "power2.out",
                  onComplete: () => gsap.set(attacker, { clearProps: "transform" }),
                },
              )
            }
            if (comboRef.current && !reducedImpactMotion()) {
              gsap.fromTo(
                comboRef.current,
                { scale: 1.38 },
                { scale: 1, duration: 0.2, ease: "back.out(2)" },
              )
            }
            playHit(event.combo ?? battle.combo, Boolean(event.crit), event.element)
          } else {
            const ratio = event.hpAfter == null ? 0 : (liveHp.current.party - event.hpAfter) / partyMax
            if (event.hpAfter != null) {
              const before = liveHp.current.party
              liveHp.current.party = event.hpAfter
              impact(stageRef.current?.querySelector('.choke-hpbar[data-side="party"]'), ratio, "gauge")
              flashLoss("party", (before / partyMax) * 100, (event.hpAfter / partyMax) * 100)
              setHpView((prev) => ({ ...prev, party: event.hpAfter }))
            }
            const targetNode = cardRefs.current[event.cardIndex ?? -1] ?? partyRef.current
            popup(targetNode, `-${event.amount.toLocaleString("en-US")}`, "card", event.source)
            const heavy = ratio >= 0.1
            hurt(cardRefs.current[event.cardIndex ?? -1] ?? undefined, ratio)
            // 挨打和打人不是一个声音：被挡下是金属声，吃满是闷响
            if (event.blocked) playSfx("guard", { rate: 1.15 })
            else {
              playSfx("thud", { rate: heavy ? 0.85 : 1 })
              playSfx("hit", { rate: 0.8, volume: 0.6 })
            }
          }
          return
        }

        if (event.type === "heal") {
          if (event.hpAfter != null) {
            liveHp.current.party = event.hpAfter
            setHpView((prev) => ({ ...prev, party: event.hpAfter }))
          }
          popup(partyRef.current, `+${event.amount.toLocaleString("en-US")}`, "card", event.source, "heal")
          playSfx("heal")
          return
        }

        if (event.type === "miss") {
          popup(
            cardRefs.current[event.cardIndex ?? -1] ?? partyRef.current,
            "MISS",
            "card",
            "COMBO -50%",
            "miss",
          )
          playSfx("miss")
          return
        }

        if (event.type === "interrupt_roll") {
          popup(
            bossRef.current,
            event.success ? "BREAK!" : "RESIST",
            "enemy",
            `${event.intentLabel}${event.reason ? ` (${event.reason})` : ""}`,
            "interrupt",
            event.success,
          )
          playSfx(event.success ? "break" : "miss")
          return
        }

        if (event.type === "wake_up") {
          popup(bossRef.current, "WAKE UP!", "enemy", "受击解除硬控", "wake")
          playSfx("guard")
          return
        }

        if (event.type === "weakness_found") {
          popup(bossRef.current, "发现弱点！", "enemy", `${elementLabel(event.element)}属性`, "interrupt", true)
          playSfx("break")
          return
        }

        if (event.type === "down") {
          popup(cardRefs.current[event.cardIndex] ?? partyRef.current, "DOWN!", "card", event.cardName, "miss")
          playSfx("down")
          return
        }

        if (event.type === "revive") {
          popup(cardRefs.current[event.cardIndex] ?? partyRef.current, "REVIVE!", "card", event.cardName, "heal")
          playSfx("heal")
          return
        }

        if (event.type === "guard") {
          playSfx("guard")
          return
        }

        if (event.type === "ap") {
          playSfx("ap")
          return
        }

        if (event.type === "turn") {
          setTurnView({ owner: event.owner, round: event.round })
          sweepBanner(event.owner === "player" ? `ROUND ${event.round} · PLAYER TURN` : "ENEMY TURN", event.owner)
          playTurn()
          return
        }

        if (event.type === "shield_break") {
          sweepBanner("SHIELD BREAK", "player")
          hitBurst("light", 0.25, true)
          return
        }

        // 胜负：等最后一击的演出收完再亮结算；三星一颗一颗盖上去
        if (event.type === "won" || event.type === "lost") {
          const won = event.type === "won"
          later(() => {
            if (won) playWin()
            else playLose()
            setResultShown(true)
            if (!won) return
            evaluateStars(battle).stars.forEach(({ met }, i) => {
              if (met) later(() => playSfx("star", { rate: 1 + i * 0.12 }), RESULT_STAR_DELAY + i * RESULT_STAR_GAP)
            })
          }, 480)
        }
      }, delay)
    })

    if (battle.events.some((event) => event.type === "turn")) {
      later(() => setTurnAnimating(true), 0)
    }

    // 事件全部播完后回落到引擎真实值，保证长时间挂机也不会和状态脱节
    later(() => {
      setHpView(hpTruth.current)
      setTurnView(null)
      setTurnAnimating(false)
    }, battle.events.length * stepGap + 520)
  }, [battle, flash, flashLoss, hitBurst, hurt, later, popup, stepGap, sweepBanner])

  // 操作被拒（AP 不够、已经行动过……）：底栏会出提示，这里补一声
  useEffect(() => {
    if (actionError) playSfx("deny")
  }, [actionError])

  const skillRows = useSkillRows(battle, onPlay)

  /** 开战 / 重开：鼓点 + 横扫的 BATTLE START；run 是页面给的 onStart 或 onRestart */
  const begin = (run: () => void) => {
    playSfx("start")
    setResultShown(false)
    setSwapOpen(false)
    run()
    // 等战斗画面挂上去再扫字
    later(() => sweepBanner("BATTLE START", "start"), 30)
  }
  const startBattle = () => begin(onStart)

  // 两个画面共用同一副骨架，从上到下五条，互不叠压：
  // 顶栏（工具、回合）→ 敌人区（血条在上，两侧是支援和行动预告，正中留给打击演出）
  // → 播报条（战况、出招、回合切换）→ 队伍状态栏 → 卡牌区（右边一列指令）
  const backToDesk = host ? (
    <button type="button" className="choke-tool-btn" onClick={host.onExit} data-sfx="close">
      <b>‹</b>
      <span>{host.exitLabel}</span>
    </button>
  ) : (
    <a className="choke-tool-btn" href={exit.href} data-sfx="close">
      <b>‹</b>
      <span>{exit.label}</span>
    </a>
  )

  // ==================== 1. 战前准备画面 ====================
  if (!battle) {
    const foe = encounter.enemy
    const totalBp = deck.reduce((sum, card) => sum + battlePower(card), 0)

    return (
      <div className="choke-viewport">
        <style>{stageCss}</style>
        <div className="choke-stage" data-phase="prepare">
          <header className="choke-topbar">
            <div className="choke-topbar__side">{backToDesk}</div>
            <div className="choke-topbar__mid">
              <b>{tutorial ? "教学战斗" : testMode ? "战斗测试" : "讨伐准备"}</b>
            </div>
            <div className="choke-topbar__side choke-topbar__side--end">
              {onToggleTest && !tutorial && (
                <button
                  type="button"
                  className="choke-tool-btn"
                  aria-pressed={testMode}
                  title="开发模式：可选所有敌人，不发奖励、不记弱点发现"
                  onClick={onToggleTest}
                  data-sfx="toggle"
                >
                  <span>战斗测试</span>
                </button>
              )}
              {onSwitchUi && (
                <button
                  type="button"
                  className="choke-tool-btn"
                  onClick={onSwitchUi}
                  title="切换到原版折线血条战斗界面"
                >
                  <b>⇄</b>
                  <span>经典界面</span>
                </button>
              )}
            </div>
          </header>

          <section className="choke-boss-zone choke-prep" style={bossBgStyle(encounter.background)}>
            {!tutorial && (
              <div className="choke-panel choke-stage-selector" data-test={testMode ? "true" : undefined}>
                <h3 className="choke-panel__head">
                  <GiTargetLaser /> {testMode ? "选择测试对象" : "选择讨伐目标"}
                </h3>
                {testMode ? (
                  <TestEnemyPicker encounters={encounters} activeId={encounter.id} onSelect={onSelectStage} />
                ) : (
                  <div className="choke-stage-selector__btns">
                    {encounters.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        className="choke-stage-pill"
                        data-active={st.id === encounter.id ? "true" : undefined}
                        onClick={() => {
                          playSfx("select")
                          onSelectStage(st.id)
                        }}
                      >
                        <b>{st.name}</b>
                        <small>
                          {tierLabel(st.tier)} · HP {st.hp.toLocaleString("en-US")}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 节点带 key：换一个目标，这一块重新入场 */}
            <div
              className="choke-prep-foe"
              key={encounter.id}
              style={{ "--el": elementColor(foe.element) } as CSSProperties}
            >
              <div className="choke-sigil" aria-hidden>
                <i className="choke-sigil__approach" />
                <ElementGlyph element={foe.element} />
              </div>
              <small>{tutorial ? "TUTORIAL STAGE" : `${tierLabel(foe.tier)} · ${foe.title}`}</small>
              <h2>{foe.name}</h2>
              <div className="choke-hp-num">
                <i>HP</i>
                <b>{foe.stats.hp.toLocaleString("en-US")}</b>
              </div>
              <WeaknessRibbon
                open={foe.weaknesses}
                found={[]}
                exposed={[]}
                unknown={foe.hiddenWeaknesses.length}
              />
              <p>{encounter.summary}</p>
            </div>

            <div className="choke-panel choke-outcome-box">
              <h3 className="choke-panel__head">
                <GiRoundStar /> 评价条件
              </h3>
              {encounter.stars.map((cond, i) => {
                const { title, target } = describeStar(cond)
                return (
                  <div className="choke-outcome-row" key={cond.type}>
                    <span>
                      ★{i + 1} {title}
                    </span>
                    <b>{target}</b>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="choke-lane">
            <span className="choke-ticker">
              {tutorial
                ? "教学战：熟悉连击、AP 继承和右侧的【防御】；弱点里的“？”是隐藏弱点。"
                : testMode
                  ? "战斗测试：不发奖励、不记弱点发现。"
                  : "选好讨伐目标、确认编队后，点右侧【战斗开始】。"}
            </span>
          </div>

          <footer className="choke-hud">
            <div className="choke-hud__party">
              <div className="choke-hud__line">
                <b className="choke-side-name">{playerName}</b>
                <div className="choke-hp-num">
                  <i>队伍 BP</i>
                  <b>{totalBp.toLocaleString("en-US")}</b>
                </div>
              </div>
            </div>
          </footer>
          <section className="choke-deck">
            <div className="choke-party-grid">
              {deck.map((card, slot) => (
                <div className="choke-card-slot" key={card.id} style={{ "--slot": slot } as CSSProperties}>
                  <div className="choke-card-frame">
                    <GameCardFace card={card} eager />
                  </div>
                </div>
              ))}
            </div>
            <aside className="choke-command">
              <div className="choke-command__info">
                <span>{tutorial ? "教学编队" : "出战编队"}</span>
                <b>
                  {deck.length} <i>/ 7 张</i>
                </b>
              </div>
              <button type="button" className="choke-btn-start" onClick={startBattle} data-sfx="none">
                战斗开始
              </button>
            </aside>
          </section>

        </div>
      </div>
    )
  }

  // ==================== 2. 正式战斗画面 ====================
  const team = teamHpOf(battle)
  const healEff = healEfficiency(battle)
  // 演出投影：血条与数字跟随「已播放到的事件」推进，而不是直接读引擎的终值
  const shownEnemyHp = hpView.enemy ?? battle.enemy.hp
  const shownPartyHp = hpView.party ?? team.hp
  const bossPct = Math.max(0, Math.min(100, (shownEnemyHp / Math.max(1, battle.enemy.hpMax)) * 100))
  const partyPct = Math.max(0, Math.min(100, (shownPartyHp / Math.max(1, team.max)) * 100))
  const tankPresent = hasTankAlive(battle.cards)
  const maxDefenseTier = tankPresent ? 4 : 2
  const canRaiseDefense =
    battle.phase === "player" &&
    battle.defenseTier < maxDefenseTier &&
    battle.ap >= 1
  const playerTurn = battle.phase === "player"
  const apMax = battle.apMax
  const comboPct = Math.round((comboMultiplier(battle.combo) - 1) * 100)
  const stars = evaluateStars(battle)
  const shownRound = turnView?.round ?? battle.turn
  // 引擎没有「敌方回合」这个阶段，只有演出里的 turn 事件说得出现在轮到谁
  const shownOwner = turnView?.owner ?? "player"
  const tutorialHint = tutorial ? tutorialBattleHint(battle) : null
  const ticker = actionError
    ? `⚠️ ${actionError}`
    : tutorialHint
      ? tutorialHint
      : turnView?.owner === "enemy"
        ? "敌方行动中…"
        : (battle.log[0] ?? "战斗开始")

  const skillHint = swapOpen ? null : skillRows.hint
  const shownApCost = skillHint?.ap ?? previewAp

  return (
    <div className="choke-viewport">
      <style>{stageCss}</style>
      <div
        className="choke-stage"
        data-phase={battle.phase === "player" ? "battle" : battle.phase}
        data-danger={partyPct > 0 && partyPct <= 25 ? "true" : undefined}
        ref={stageRef}
      >
        <div className="choke-hurt-vignette" ref={hurtTintRef} aria-hidden />
        {host?.syncNote && (
          <div className="choke-sync-note" role="alert">
            {host.syncNote}
          </div>
        )}
        {/* ================= 1. 顶栏：工具在两头，回合在正中 ================= */}
        <header className="choke-topbar">
          <div className="choke-topbar__side">
            {backToDesk}
            {host?.canRestart !== false && (
              <button
                type="button"
                className="choke-tool-btn"
                onClick={() => begin(onRestart)}
                title="重新开始本场战斗"
                data-sfx="none"
              >
                <b>↻</b>
                <span>重开</span>
              </button>
            )}
            <button
              type="button"
              className="choke-tool-btn"
              aria-pressed={logOpen}
              onClick={() => setLogOpen((open) => !open)}
              data-sfx="paper"
            >
              <span>战报</span>
            </button>
          </div>
          <div className="choke-topbar__mid" data-owner={shownOwner}>
            <span className="choke-round">
              ROUND <b key={shownRound}>{shownRound}</b>
            </span>
            <b>
              {resultShown && battle.phase === "won"
                ? "讨伐成功"
                : resultShown && battle.phase === "lost"
                  ? "讨伐失败"
                  : shownOwner === "player"
                    ? "你的回合"
                    : "敌方行动"}
            </b>
          </div>
          <div className="choke-topbar__side choke-topbar__side--end">
            {onSwitchUi && (
              <button
                type="button"
                className="choke-tool-btn"
                onClick={onSwitchUi}
                title="切换到原版折线血条战斗界面"
              >
                <b>⇄</b>
                <span>经典界面</span>
              </button>
            )}
            <button
              type="button"
              className="choke-tool-btn"
              aria-label={hint}
              title={hint}
              onClick={cycle}
              data-sfx="toggle"
            >
              <GiHourglass />
              <span>{label}</span>
            </button>
            {autoEnd.allowed && (
              <button
                type="button"
                className="choke-tool-btn"
                aria-pressed={autoEnd.on}
                title="没有能做的操作时，3 秒后自动结束回合；倒计时里点任何地方可取消"
                onClick={autoEnd.toggle}
                data-sfx="toggle"
              >
                <span>自动结束</span>
              </button>
            )}
          </div>
        </header>

        {/* ================= 2. 敌人区：血条在上，左支援、右行动预告，正中是打击区 ================= */}
        <section className="choke-boss-zone" style={bossBgStyle(encounter.background)}>
          <div
            className="choke-hitzone"
            ref={bossRef}
            style={{ "--el": elementColor(battle.enemy.element) } as CSSProperties}
          >
            {/* 敌人没有立绘，用一个属性色的打击圈代表；key 跟着受击次数走，每挨一下重新缩一次圈 */}
            <div
              className="choke-sigil"
              key={slashKey}
              ref={sigilRef}
              data-hit={slashKey > 0 ? "true" : undefined}
              data-dead={battle.enemy.hp <= 0 ? "true" : undefined}
              data-cc={battle.enemy.hardControl ? "true" : undefined}
              aria-hidden
            >
              <i className="choke-sigil__approach" />
              <ElementGlyph element={battle.enemy.element} />
            </div>
          </div>

          <div className="choke-boss-head">
            <div className="choke-boss-head__row">
              <span className="choke-boss-tier" data-tier={encounter.enemy.tier}>
                {tierLabel(encounter.enemy.tier)}
              </span>
              <b className="choke-side-name">{battle.enemy.name}</b>
              <small>{encounter.enemy.title}</small>
              <div className="choke-hp-num">
                <b>{shownEnemyHp.toLocaleString("en-US")}</b>
                <i>/ {battle.enemy.hpMax.toLocaleString("en-US")}</i>
              </div>
            </div>
            <HpBar side="enemy" pct={bossPct} flashes={hpFlashes} />
            {(battle.enemy.shieldMax ?? 0) > 0 && (
              <div
                className="choke-shield-bar"
                role="img"
                aria-label={`弱点护盾 ${battle.enemy.shield ?? 0} / ${battle.enemy.shieldMax}`}
              >
                {Array.from({ length: battle.enemy.shieldMax ?? 0 }, (_, i) => (
                  <span
                    key={i}
                    className="choke-shield-seg"
                    data-active={i < (battle.enemy.shield ?? 0) ? "true" : undefined}
                  />
                ))}
              </div>
            )}
            <div className="choke-boss-head__row choke-boss-head__row--sub">
              <WeaknessRibbon
                open={battle.enemy.weaknesses}
                found={battle.hiddenFound}
                exposed={battle.enemy.exposed}
                unknown={battle.enemy.hiddenWeaknesses.length - battle.hiddenFound.length}
              />
              {battle.enemy.statuses.length > 0 && (
                <div className="choke-mini-statuses">
                  {battle.enemy.statuses.map((status) => (
                    <span
                      className={`choke-buff-pill ${status.isDebuff !== false ? "choke-buff-pill--bad" : ""}`}
                      key={status.id}
                    >
                      {status.id === "armor_break" && <GiCrackedShield />}
                      {status.id === "burn" && <GiFlame />}
                      {status.id === "poison" && <GiDrop />}
                      {status.id === "freeze" && <GiIceBolt />}
                      {status.id === "shock" && <GiLightningBow />}
                      {status.name}
                      {status.stacks && status.stacks > 1 ? `×${status.stacks}` : ""}
                      <i>{status.turns}</i>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {battle.enemy.hardControl && (
            <div className="choke-boss-cc-banner">
              {battle.enemy.hardControl === "sleep" ? <GiSleepy /> : <GiStunGrenade />}
              <div>
                <b>{battle.enemy.hardControl === "sleep" ? "眠咒催眠中" : "粉碎击晕中"}</b>
                <small>敌方行动全部作废 · 任何攻击命中会立刻把它打醒</small>
              </div>
            </div>
          )}

          <div className="choke-side-col choke-side-col--left">
            {battle.enemySupports.length > 0 && <>
              <h3 className="choke-col-head">敌方支援</h3>
              <div className="choke-enemy-support-stack">
                {battle.enemySupports.map(unit => <SupportReadout key={unit.id} side="enemy" unit={unit} description={encounter.supports.find(s => s.id === unit.id)?.roleText} icon={<SupportKindIcon unit={unit} />} />)}
              </div>
            </>}
            {logOpen && <BattleLog lines={battle.log} />}
          </div>

          {/* 右列：敌方下一步。招式名、属性、段数、威胁直接写出来，不用悬停才看得到 */}
          <div className="choke-side-col choke-side-col--right">
            <h3 className="choke-col-head">敌方下一步</h3>
            <div className="choke-intents">
              {battle.enemy.intents.map((intent, idx) => (
                <div
                  key={intent.id}
                  className="choke-intent"
                  data-interrupted={intent.interrupted ? "true" : undefined}
                  data-hard-to-interrupt={intent.hardToInterrupt ? "true" : undefined}
                  data-cc={battle.enemy.hardControl ? "true" : undefined}
                  data-down={intent.causesDown ? "true" : undefined}
                  style={{ "--el": elementColor(intent.element) } as CSSProperties}
                  onMouseEnter={e => setIntentHover({ id: intent.id, anchor: e.currentTarget, pointer: { x: e.clientX, y: e.clientY } })}
                  onMouseLeave={() => setIntentHover(null)}
                >
                  <i className="choke-intent__order">{idx + 1}</i>
                  <span className="choke-intent__icon">
                    <IntentIcon kind={intent.kind} />
                  </span>
                  <div className="choke-intent__text">
                    <b>{intent.label}</b>
                    <small>
                      {elementLabel(intent.element)}
                      {intent.hits > 1 ? ` · ${intent.hits} 段` : ""}
                      {intent.causesDown && <em data-tone="down">DOWN</em>}
                      {intent.hardToInterrupt && <em data-tone="lock">难打断</em>}
                    </small>
                  </div>
                  <em className="choke-intent__tier">
                    {intent.interrupted ? "已打断" : enemyDamageTier(intent)}
                  </em>
                  {intentHover?.id === intent.id && (
                    <ReadoutTip anchor={intentHover.anchor} pointer={intentHover.pointer}>
                      <b>{intent.label}{intent.interrupted && "（已打断取消）"}</b>
                      <small>{elementLabel(intent.element)}属性 · 伤害档位：{enemyDamageTier(intent)}
                        {intent.causesDown ? " · ⚠️ 附带 DOWN" : ""}
                        {intent.hardToInterrupt ? " · 🔒 难以打断（打断、硬控成功率 ×0.4）" : " · 可被刺客打断"}
                      </small>
                      <span>{intent.desc}</span>
                    </ReadoutTip>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 3. 播报条：平时是一句话战况，出招时换成横幅，回合切换的大字也在这一条里扫过 ================= */}
        <div className="choke-lane" ref={laneRef}>
          {/* key 用文字本身：战况换了一句，就重新顶上来一次 */}
          <span className="choke-ticker" key={ticker} data-error={actionError ? "true" : undefined}>
            {ticker}
          </span>
          {cutinBanner && (
            <div
              key={cutinBanner.seq}
              className="choke-skill-banner"
              data-actor={cutinBanner.actor}
              style={
                {
                  "--el": elementColor(cutinBanner.element),
                  animationDuration: "750ms",
                } as CSSProperties
              }
            >
              <span className="choke-banner-tag">
                {cutinBanner.actor === "support"
                  ? "SUPPORT"
                  : cutinBanner.actor === "preemptive"
                    ? "SWIFT"
                    : cutinBanner.actor === "enemy"
                      ? "ENEMY"
                      : "SKILL"}
              </span>
              <b>{cutinBanner.title}</b>
              <span>{cutinBanner.subtitle}</span>
            </div>
          )}
        </div>

        <footer className="choke-hud">
          <div className="choke-hud__party" ref={partyRef}>
            <div className="choke-hud__line">
              <b className="choke-side-name">{playerName}</b>
              <div className="choke-hp-num">
                <b>{shownPartyHp.toLocaleString("en-US")}</b>
                <i>/ {team.max.toLocaleString("en-US")}</i>
              </div>
              <div
                className="choke-heal-left"
                data-empty={healEff < 0.5 ? "true" : undefined}
                title="本场回血越多，之后每次治疗越弱（回过软上限那么多血时减半）"
              >
                <i>治疗效率</i>
                <b>{battle.healSoftCap === null ? "100%" : `${Math.round(healEff * 100)}%`}</b>
              </div>
            </div>
            <HpBar side="party" pct={partyPct} flashes={hpFlashes} />
          </div>

          <div className="choke-ap-pocket">
            <span className="choke-ap-label">AP</span>
            <div className="choke-ap-gems">
              {Array.from({ length: AP_SLOTS }, (_, i) => {
                const n = i + 1
                const active = n <= battle.ap
                const locked = n > apMax
                const previewConsume = active && shownApCost > 0 && n > battle.ap - shownApCost
                return (
                  <span
                    key={n}
                    className="choke-ap-gem"
                    data-active={active ? "true" : undefined}
                    data-locked={locked ? "true" : undefined}
                    data-preview={previewConsume ? "true" : undefined}
                  >
                    {n}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="choke-hud__state">
            {battle.teamStatuses.map((status) => (
              <span className={`choke-buff-pill ${status.isDebuff ? "choke-buff-pill--bad" : ""}`} key={status.id}>
                {status.name}
                <i>{status.turns}</i>
              </span>
            ))}
            {battle.playerSupports.map((unit) => (
              <SupportReadout key={unit.id} unit={unit} side="party" icon={<SupportKindIcon unit={unit} />} />
            ))}
            {battle.combo > 0 && (
              <div className="choke-combo-counter" ref={comboRef}>
                <b>{battle.combo}</b>
                <div className="choke-combo-meta">
                  <span>COMBO</span>
                  {comboPct > 0 && <em>+{comboPct}%</em>}
                </div>
              </div>
            )}
          </div>
        </footer>
        {/* 卡牌区：7 张卡 + 右边一列指令（换人 / 防御 / 结束回合） */}
        <section className="choke-deck">
          <div className="choke-party-grid">
            {battle.cards.map((card, index) => {
              const row = skillRows.cards[index]

              return (
                <div
                  className="choke-card-slot"
                  key={card.uid}
                  ref={(node) => {
                    cardRefs.current[index] = node
                  }}
                  data-acted={card.acted ? "true" : undefined}
                  data-down={card.down ? "true" : undefined}
                  data-boost={card.trigger && !card.acted && !card.down ? card.trigger : undefined}
                  data-guarding={guardChipSlot === index ? "true" : undefined}
                  data-bursting={laserTargets.includes(index) ? "true" : undefined}
                  data-swap-target={swapOpen && swapOutIdx === index ? "true" : undefined}
                  onClick={swapOpen ? () => { playSfx("tick"); setSwapOutIdx(index) } : undefined}
                >

                  {guardChipSlot === index && <span className="choke-guard-chip">嘲讽援护!</span>}

                  <div className="choke-card-frame">
                    <GameCardFace card={row.face} skillActions={swapOpen ? undefined : row.actions} eager />

                    {/* 还没行动的卡触发了增益时，盖在卡面上部的标签 */}
                    {card.trigger && !card.acted && !card.down && (
                      <TriggerReadout trigger={card.trigger} label={card.trigger === "critical_art" ? "必杀 3.0×" : card.trigger === "double_cast" ? "连击 ×2" : "BOOST"} />
                    )}

                    {/* DOWN 遮罩 */}
                    {card.down && (
                      <div className="choke-acted-stamp" data-down="true">
                        <div className="choke-acted-circle">
                          <GiSkullCrossedBones />
                        </div>
                        <div className="choke-stamp-text">
                          <b>DOWN</b>
                          <small>{card.downTurns} 回合苏醒</small>
                        </div>
                      </div>
                    )}

                    {/* 已经行动过的卡：压暗，盖一条「已行动」 */}
                    {!card.down && card.acted && (
                      <div className="choke-acted-stamp">
                        <div className="choke-stamp-text">
                          <b>已行动</b>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )
            })}
          </div>

          <aside className="choke-command">
            <button
              {...pointerCommand}
              type="button"
              className="choke-btn-panel"
              disabled={!playerTurn || battle.bench.length === 0}
              onClick={() => {
                playSfx(swapOpen ? "close" : "open")
                setSwapOpen((v) => !v)
              }}
              title="从替补席更换场上人员"
            >
              <div className="choke-btn-panel__top">
                <GiCycle />
                <span>{swapOpen ? "关闭替补" : "更换人员"}</span>
              </div>
              <div className="choke-btn-panel__pill">
                {battle.swapCooldown > 0
                  ? `${battle.swapCooldown} 回合后可换`
                  : `替补 ${battle.bench.filter((b) => !b.down).length} 张`}
              </div>
            </button>

            <button
              {...pointerCommand}
              type="button"
              className="choke-btn-defend"
              disabled={!canRaiseDefense}
              onMouseEnter={() => canRaiseDefense && setPreviewAp(1)}
              onMouseLeave={() => setPreviewAp(0)}
              onClick={() => {
                setPreviewAp(0)
                onDefend()
              }}
              // 架盾的金属声由 guard 事件出，这里不叠默认按键音
              data-sfx="none"
              title={
                battle.defenseTier >= maxDefenseTier
                  ? tankPresent
                    ? "防御支援已达最高 Lv4（−90%）"
                    : "无坦克在场最高只能升至 Lv2（−35%）"
                  : `追加 / 升级防御支援到 Lv${battle.defenseTier + 1}（消耗 1 AP）`
              }
            >
              <div className="choke-defend-top">
                <GiShield />
                <b>{battle.defenseTier > 0 ? `防御 Lv${battle.defenseTier}` : "防御"}</b>
              </div>
              <span className="choke-defend-ap">
                {battle.defenseTier >= maxDefenseTier ? "MAX" : "1 AP"}
              </span>
            </button>

            <button
              {...pointerCommand}
              type="button"
              className="choke-btn-end"
              data-auto-end={autoEnd.pending ? "true" : undefined}
              onClick={() => {
                if (turnAnimating) return
                playSfx("whoosh")
                onEndTurn()
              }}
              disabled={!playerTurn || turnAnimating}
            >
              结束回合
            </button>
          </aside>
        </section>


        {/* 敌方瞄准线：从敌人印记连到被瞄准的卡，盖在整个舞台上，半秒就收 */}
        {laserLines && (
          <svg className="choke-laser-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {laserLines.to.map((to, i) => (
              <g key={i}>
                <line x1={laserLines.from.x} y1={laserLines.from.y} x2={to.x} y2={to.y} className="choke-laser-glow" />
                <line x1={laserLines.from.x} y1={laserLines.from.y} x2={to.x} y2={to.y} className="choke-laser-core" />
              </g>
            ))}
          </svg>
        )}

        {/* ================= 替补席换人抽屉 ================= */}
        {swapOpen && playerTurn && (
          <div className="choke-swap-drawer">
            <div className="choke-swap-head">
              <div>
                <b>
                  <GiCycle /> 部队替补席换人
                </b>
                <span>
                  点击下方备战卡牌，替换当前选中槽位 #{swapOutIdx + 1} 【{battle.cards[swapOutIdx]?.name}
                  {battle.cards[swapOutIdx]?.down ? " (DOWN 救援)" : ""}】
                </span>
              </div>
              <button
                {...pointerCommand}
                type="button"
                className="choke-swap-close"
                onClick={() => {
                  playSfx("close")
                  setSwapOpen(false)
                }}
              >
                返回战斗 ✕
              </button>
            </div>

            <div className="choke-swap-targets">
              {battle.cards.map((c, idx) => (
                <button
                  {...pointerCommand}
                  key={c.uid}
                  type="button"
                  className="choke-swap-slot-pill"
                  data-active={swapOutIdx === idx ? "true" : undefined}
                  data-down={c.down ? "true" : undefined}
                  onClick={() => setSwapOutIdx(idx)}
                >
                  <span>#{idx + 1}</span>
                  <b>{c.name}</b>
                  <small>{c.down ? "DOWN" : JOB_LABEL[c.job]}</small>
                </button>
              ))}
            </div>

            <div className="choke-swap-grid">
              {battle.bench.map((b) => (
                <button
                  {...pointerCommand}
                  key={b.uid}
                  type="button"
                  className="choke-bench-item"
                  disabled={
                    b.down ||
                    battle.swapCooldown > 0 ||
                    (battle.hasActedThisTurn && !battle.cards[swapOutIdx]?.down)
                  }
                  onClick={() => {
                    playSfx("whoosh")
                    onSwap(swapOutIdx, b.uid)
                    setSwapOpen(false)
                  }}
                >
                  <div className="choke-bench-card">
                    <GameCardFace card={b.face} />
                  </div>
                  <span className="choke-bench-meta">
                    {JOB_LABEL[b.job]} · LV{b.level}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <SkillHint hint={skillHint} />

        {/* ================= 战后结算层（三星评价） ================= */}
        {(battle.phase === "won" || battle.phase === "lost") && resultShown && (
          <div className="choke-result-layer" data-outcome={battle.phase}>
            <div className="choke-result-card">
              <div className="choke-result-badge">
                {battle.phase === "won" ? <GiTrophy /> : <GiSkullCrossedBones />}
              </div>
              <b>{battle.phase === "won" ? "讨伐胜利 · STAGE CLEAR" : "讨伐失败 · DEFEATED"}</b>
              <p>
                {battle.phase === "won"
                  ? `在第 ${battle.turn} 回合击败了【${battle.enemy.name}】（最高 ${battle.maxCombo} Combo）`
                  : `${playerName} 的队伍在第 ${battle.turn} 回合生命归零。`}
              </p>

              {battle.phase === "won" && (
                <div className="choke-stars-grid">
                  {stars.stars.map(({ condition, met }, i) => (
                    <div
                      className="choke-star-item"
                      data-achieved={met ? "true" : undefined}
                      key={condition.type}
                      style={{ "--star-at": `${RESULT_STAR_DELAY + i * RESULT_STAR_GAP}ms` } as CSSProperties}
                    >
                      <GiRoundStar />
                      <b>
                        ★{i + 1} {describeStar(condition).title}
                      </b>
                      <small>{starProgress(condition, battle)}</small>
                    </div>
                  ))}
                </div>
              )}

              {host?.resultNote}

              <div className="choke-result-actions">
                {host?.resultActions ?? (
                  <>
                    <button type="button" onClick={() => begin(onRestart)} data-sfx="none">
                      再来一场
                    </button>
                    <a href={exit.href}>返回{exit.label}</a>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function tierLabel(tier: EncounterSummary["tier"]) {
  return tier === "boss" ? "BOSS" : tier === "elite" ? "精英" : "常规"
}

