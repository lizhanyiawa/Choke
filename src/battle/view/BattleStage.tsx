import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import gsap from "gsap"
import { FiChevronLeft, FiRefreshCw, FiRepeat } from "react-icons/fi"
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
import { BattleLog, SkillHint, SupportReadout, TriggerReadout } from "../BattleReadouts"
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
import { BentGauge } from "./BentGauge"
import { playHit, playLose, playSfx, playTurn, playWin } from "../sfx"
import { TestEnemyPicker } from "./TestEnemyPicker"
import type { BattleState, EnemyIntent, SideSupportUnit } from "@choke/shared/battle/types"
import stageCss from "./choke-battle.css?inline"

const AP_SLOTS = 10
/** 结算层亮起后，第一颗星盖下去的时刻和每颗星的间隔（毫秒）；choke-battle.css 里的延时与之对应 */
const RESULT_STAR_DELAY = 620
const RESULT_STAR_GAP = 260

/**
 * 兰斯10 标志性「外低内高」阶梯折线血条 SVG 路径（viewBox="0 0 460 54"）
 * - BOSS 血条（左）：外侧左段处于下方 (y=26..50)，在 x=250..278 处向上 45° 折起，内侧右段处于上方 (y=6..30) 贴合中央 Round 盾章
 * - 我方血条（右）：内侧左段处于上方 (y=6..30)，在 x=182..210 处向下 45° 折落，外侧右段处于下方 (y=26..50)
 */
const BOSS_GAUGE_POLYGON = "4,26 250,26 278,6 456,6 448,30 286,30 258,50 14,50"
const PARTY_GAUGE_POLYGON = "4,6 182,6 210,26 456,26 446,50 202,50 174,30 12,30"

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
      <span>弱点属性 ▶▶</span>
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

/** 退出按钮：独立战斗页是回桌面的链接；被宿主嵌入时换成宿主给的文字和动作 */
function ExitLink({
  host,
  exit,
  className,
  sfx,
  children,
}: {
  host?: BattleHostHooks
  exit: BattleExit
  className: string
  sfx?: string
  children: ReactNode
}) {
  if (host) {
    return (
      <button type="button" className={className} onClick={host.onExit} data-sfx={sfx}>
        {host.exitLabel}
      </button>
    )
  }
  return (
    <a className={className} href={exit.href} data-sfx={sfx}>
      {children}
    </a>
  )
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
  const [hoveredIntent, setHoveredIntent] = useState<EnemyIntent | null>(null)
  const [previewAp, setPreviewAp] = useState(0)
  const [logOpen, setLogOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapOutIdx, setSwapOutIdx] = useState(0)
  const { label, hint, cycle, stepGap } = usePlaybackSpeed()
  const [turnAnimating, setTurnAnimating] = useState(false)
  const autoEnd = useAutoEndTurn({ battle, allowed: !tutorial && !turnAnimating, onEndTurn })
  /** 胜负已定后，等最后一击演完才亮结算层 */
  const [resultShown, setResultShown] = useState(battle?.phase === "won" || battle?.phase === "lost")
  const [pickerOpen, setPickerOpen] = useState(false)

  // 兰斯10 实时演出横幅与扣血垂直光柱状态
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
  const [guardChipSlot, setGuardChipSlot] = useState<number | null>(null)
  // 血条演出投影：由事件逐段推进；为空时回落到引擎的真实值
  const [hpView, setHpView] = useState<{ party?: number; enemy?: number }>({})
  // 引擎真实血量。事件播完后落到这里，而不是清空：清空会让下一轮一开始就先显示最终值，再被首个事件拉高
  const hpTruth = useRef<{ party?: number; enemy?: number }>({})
  const liveHp = useRef<{ party: number; enemy: number }>({ party: 0, enemy: 0 })
  const [lossPillars, setLossPillars] = useState<
    { id: number; side: "boss" | "party"; left: number; width: number }[]
  >([])
  const pillarId = useRef(1)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const hurtTintRef = useRef<HTMLDivElement | null>(null)
  const bossRef = useRef<HTMLElement | null>(null)
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

  // 扣血光柱：从实际掉血的那一段血条位置垂直冲顶（位置以 .choke-bent-gauges 宽度的百分比计）
  const spawnLossPillar = useCallback(
    (side: "boss" | "party", beforePct: number, afterPct: number) => {
      if (beforePct <= afterPct) return
      const id = pillarId.current++
      const start = side === "boss" ? 0.407 + 0.4598 * afterPct : 53.607 + 0.4598 * (100 - beforePct)
      const end = side === "boss" ? 0.407 + 0.4598 * beforePct : 53.607 + 0.4598 * (100 - afterPct)
      const raw = end - start
      const width = Math.max(0.85, raw)
      const left = raw < 0.85 ? (side === "boss" ? start : end) - width / 2 : start
      setLossPillars((prev) => [...prev, { id, side, left, width }])
      later(() => setLossPillars((prev) => prev.filter((p) => p.id !== id)), 520)
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
        node.style.setProperty("--px", `${side * Math.ceil(n / 2) * 6.5}cqw`)
        node.style.setProperty("--py", `${-(n % 3) * 2.2}cqw`)
        popupLive.current = n + 1
      }
      const life = 820
      node.style.animationDuration = `${life}ms`
      parent.appendChild(node)
      later(() => {
        node.remove()
        if (variant === "enemy") popupLive.current = Math.max(0, popupLive.current - 1)
      }, life)
    },
    [later],
  )

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

      if (reducedImpactMotion()) return
      const amp = 3 + tier * 4
      gsap.fromTo(
        parent,
        { x: 0, y: 0 },
        {
          x: amp,
          y: -amp * 0.6,
          duration: 0.035,
          repeat: 3 + tier * 2,
          yoyo: true,
          ease: "power1.inOut",
          onComplete: () => gsap.set(parent, { x: 0, y: 0 }),
        },
      )
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

  /** 横扫屏幕的大字：回合切换、开战 */
  const sweepBanner = useCallback(
    (text: string, tone: "player" | "enemy" | "start") => {
      const parent = stageRef.current
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
      later(() => setHpView({}), 0)
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
          if (event.guardedSlot != null) {
            setGuardChipSlot(event.guardedSlot)
          }
          later(() => {
            setLaserTargets([])
            setGuardChipSlot(null)
          }, 650)
          return
        }

        if (event.type === "damage") {
          if (event.target === "enemy") {
            if (event.enemyHpAfter != null) {
              const before = liveHp.current.enemy
              impact(stageRef.current?.querySelector(".choke-bent-svg--boss"), (before - event.enemyHpAfter) / enemyMax, "gauge")
              liveHp.current.enemy = event.enemyHpAfter
              spawnLossPillar("boss", (before / enemyMax) * 100, (event.enemyHpAfter / enemyMax) * 100)
              setHpView((prev) => ({ ...prev, enemy: event.enemyHpAfter }))
            }
            setSlashKey((k) => k + 1)
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
              impact(stageRef.current?.querySelector(".choke-bent-svg--party"), ratio, "gauge")
              spawnLossPillar("party", (before / partyMax) * 100, (event.hpAfter / partyMax) * 100)
              setHpView((prev) => ({ ...prev, party: event.hpAfter }))
            }
            const targetNode = cardRefs.current[event.cardIndex ?? -1] ?? stageRef.current
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
          popup(stageRef.current, `+${event.amount.toLocaleString("en-US")}`, "card", event.source, "heal")
          playSfx("heal")
          return
        }

        if (event.type === "miss") {
          popup(
            cardRefs.current[event.cardIndex ?? -1] ?? stageRef.current,
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
          popup(cardRefs.current[event.cardIndex] ?? stageRef.current, "DOWN!", "card", event.cardName, "miss")
          playSfx("down")
          return
        }

        if (event.type === "revive") {
          popup(cardRefs.current[event.cardIndex] ?? stageRef.current, "REVIVE!", "card", event.cardName, "heal")
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
      setTurnAnimating(false)
    }, battle.events.length * stepGap + 520)
  }, [battle, hitBurst, hurt, later, popup, spawnLossPillar, stepGap, sweepBanner])

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

  // ==================== 1. 战前准备画面 ====================
  if (!battle) {
    const foe = encounter.enemy
    const enemyName = foe.name
    const enemyHp = foe.stats.hp
    const weaknesses = foe.weaknesses
    const totalBp = deck.reduce((sum, card) => sum + battlePower(card), 0)

    return (
      <div className="choke-viewport">
        <style>{stageCss}</style>
        <div className="choke-stage" data-phase="prepare" data-production="true">
          <section className="choke-boss-zone" style={bossBgStyle(encounter.background)}>
            <div className="choke-boss-backdrop" aria-hidden />
            {/* 左侧构图：大号衬线 VS 在后，深红敌名斜带跨过 VS 右下延伸至上沿 */}
            <div className="choke-vs-giant" aria-hidden>
              VS
            </div>
            <div className="choke-prep-ribbon" key={encounter.id}>
              <span className="choke-prep-ribbon__name">{enemyName}</span>
              <small className="choke-prep-ribbon__sub">
                {tutorial ? "TUTORIAL STAGE" : foe.title}
              </small>
            </div>

            {/* 右侧构图：两条平行斜向 WARNING 警戒带夹着中空描边「准备战斗」 */}
            <div className="choke-prep-warn" aria-hidden>
              <span className="choke-prep-warn__tape">
                WARNING &nbsp; WARNING &nbsp; WARNING &nbsp; WARNING &nbsp; WARNING
              </span>
              <b className="choke-prep-warn__stamp">
                {tutorial ? "教学战斗" : testMode ? "战斗测试" : "准备战斗"}
              </b>
              <span className="choke-prep-warn__tape">
                WARNING &nbsp; WARNING &nbsp; WARNING &nbsp; WARNING &nbsp; WARNING
              </span>
            </div>

            <div className="choke-top-tools">
              {onSwitchUi && (
                <button
                  type="button"
                  className="choke-tool-btn"
                  onClick={onSwitchUi}
                  title="切换到新版五段式战斗界面"
                >
                  <FiRepeat aria-hidden />
                  <span>新版界面</span>
                </button>
              )}
              <ExitLink host={host} exit={exit} className="choke-tool-btn" sfx="close">
                <FiChevronLeft aria-hidden />
                <span>{exit.label}</span>
              </ExitLink>
            </div>

            {!tutorial && (
              <div
                className="choke-stage-selector"
                data-open={pickerOpen || testMode ? "true" : undefined}
                data-test={testMode ? "true" : undefined}
              >
                <div className="choke-stage-selector__bar">
                  <button
                    type="button"
                    className="choke-stage-selector__trigger"
                    aria-expanded={pickerOpen || testMode}
                    onClick={() => {
                      playSfx(pickerOpen ? "close" : "open")
                      setPickerOpen((open) => !open)
                    }}
                  >
                    <GiTargetLaser />
                    <span>讨伐目标</span>
                    <b>{enemyName}</b>
                    <small>
                      {foe.tier === "boss" ? "BOSS" : foe.tier === "elite" ? "高T精英" : "常规"} · HP{" "}
                      {enemyHp.toLocaleString("en-US")}
                    </small>
                    <em>{pickerOpen || testMode ? "收起 ▾" : `切换 (${encounters.length}) ▴`}</em>
                  </button>
                  {onToggleTest && (
                    <button
                      type="button"
                      className="choke-test-toggle"
                      data-active={testMode ? "true" : undefined}
                      title="开发模式：可选所有敌人，不发奖励、不记弱点发现"
                      onClick={() => {
                        playSfx("toggle")
                        if (!testMode) setPickerOpen(true)
                        onToggleTest()
                      }}
                    >
                      战斗测试
                    </button>
                  )}
                </div>

                {(pickerOpen || testMode) && (
                  <div className="choke-stage-selector__body">
                    {testMode ? (
                      <TestEnemyPicker
                        encounters={encounters}
                        activeId={encounter.id}
                        onSelect={(id) => {
                          onSelectStage(id)
                        }}
                      />
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
                              setPickerOpen(false)
                            }}
                          >
                            <b>{st.name}</b>
                            <small>
                              {st.tier === "boss" ? "BOSS" : st.tier === "elite" ? "高T精英" : "常规"} · HP{" "}
                              {st.hp.toLocaleString("en-US")}
                            </small>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="choke-stage-selector__desc" key={encounter.id}>
                      {encounter.summary}
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="choke-outcome-box">
              <div className="choke-outcome-head">战斗评价与路线条件</div>
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

          {/* 准备画面同样采用兰斯10阶梯折线双血条 */}
          <section className="choke-hud-band">
            <div className="choke-hud-upper">
              <div className="choke-side-info choke-side-info--boss">
                <div className="choke-side-name">{enemyName}</div>
                <div className="choke-hp-num">
                  <i>Hp</i>
                  <b>{enemyHp.toLocaleString("en-US")}</b>
                </div>
              </div>

              <div className="choke-shelf-left">
                <WeaknessRibbon open={weaknesses} found={[]} exposed={[]} unknown={foe.hiddenWeaknesses.length} />
              </div>

              <div className="choke-shelf-right" />

              <div className="choke-side-info choke-side-info--party">
                <div className="choke-side-name">{playerName}</div>
                <div className="choke-hp-num">
                  <i>BP</i>
                  <b>{totalBp.toLocaleString("en-US")}</b>
                </div>
              </div>
            </div>

            <div className="choke-bent-gauges">
              <BentGauge side="boss" polygon={BOSS_GAUGE_POLYGON} pct={100} fillX={4} fillWidth={452} />

              <button type="button" className="choke-center-orb" onClick={startBattle}>
                <span className="choke-orb-start">战斗开始</span>
              </button>

              <BentGauge side="party" polygon={PARTY_GAUGE_POLYGON} pct={100} fillX={4} fillWidth={452} />

              <div className="choke-ap-pocket">
                <span className="choke-ap-label">Ap</span>
                <div className="choke-ap-gems">
                  {Array.from({ length: 7 }, (_, i) => (
                    <span className="choke-ap-gem" data-active={i < 2 ? "true" : undefined} key={i}>
                      {i + 1}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="choke-deck">
            <aside className="choke-wing choke-wing--left">
              <button type="button" className="choke-btn-panel" disabled>
                <div className="choke-btn-panel__top">
                  <GiCycle />
                  <span>{tutorial ? "教学编队" : "出战编队"}</span>
                </div>
                <div className="choke-btn-panel__pill">{deck.length} / 7 张</div>
              </button>
              <div className="choke-wing-toggles">
                <button
                  type="button"
                  className="choke-btn-mini"
                  aria-label={hint}
                  title={hint}
                  onClick={cycle}
                  data-sfx="toggle"
                >
                  <GiHourglass aria-hidden />
                  <span>{label}</span>
                </button>
              </div>
              <ExitLink host={host} exit={exit} className="choke-btn-menu">
                {exit.label}
              </ExitLink>
            </aside>
            <div className="choke-party-grid">
              {deck.map((card, slot) => (
                <div className="choke-card-slot" key={card.id} style={{ "--slot": slot } as CSSProperties}>
                  <div className="choke-card-frame">
                    <GameCardFace card={card} eager />
                  </div>
                </div>
              ))}
            </div>
            <aside className="choke-wing choke-wing--right">
              <button type="button" className="choke-btn-defend" disabled>
                <div className="choke-defend-top">
                  <GiShield />
                  <b>防御</b>
                </div>
                <span className="choke-defend-ap">1 Ap</span>
              </button>
            </aside>
          </section>

          <footer className="choke-footer">
            <span className="choke-ticker">
              {tutorial
                ? "教学战：熟悉连击 Combo、AP 继承与右侧【防御】侧面支援；弱点条上的“？”是隐藏弱点。"
                : testMode
                  ? "战斗测试：不发奖励、不记弱点发现。"
                  : "确认讨伐目标与编队后，点击中央【战斗开始】。"}
            </span>
          </footer>
        </div>
      </div>
    )
  }

  // ==================== 2. 正式战斗画面（1:1 兰斯10 折线血条 + 垂直红白扣血光柱） ====================
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
  const tutorialHint = tutorial ? tutorialBattleHint(battle) : null
  const ticker = actionError
    ? `⚠️ ${actionError}`
    : tutorialHint
      ? tutorialHint
      : (battle.log[0] ?? "战斗开始")

  const skillHint = swapOpen ? null : skillRows.hint
  const shownApCost = skillHint?.ap ?? previewAp
  const bossFillWidth = (452 * bossPct) / 100
  const partyFillWidth = (452 * partyPct) / 100
  const partyFillX = 4 + (452 - partyFillWidth)

  return (
    <div className="choke-viewport">
      <style>{stageCss}</style>
      <div
        className="choke-stage"
        data-phase={battle.phase === "player" ? "battle" : battle.phase}
        data-danger={partyPct > 0 && partyPct <= 25 ? "true" : undefined}
        data-production="true"
        ref={stageRef}
      >
        <div className="choke-hurt-vignette" ref={hurtTintRef} aria-hidden />
        {host?.syncNote && (
          <div className="choke-sync-note" role="alert">
            {host.syncNote}
          </div>
        )}
        {/* ================= 1. 上半区：BOSS 舞台 + 梯形侧面支援铭牌（仅在有支援时显示，无空表框） ================= */}
        <section className="choke-boss-zone" ref={bossRef} style={bossBgStyle(encounter.background)}>
          <div
            className="choke-boss-backdrop"
            key={slashKey}
            data-slashed={slashKey > 0 ? "true" : undefined}
            data-dead={battle.enemy.hp <= 0 ? "true" : undefined}
            aria-hidden
          />

          {slashKey > 0 && <div className="choke-slash-fx" key={`slash-${slashKey}`} aria-hidden />}

          {/* 敌人本体：战区属性印记与光晕（谱面背景图存在时叠加其上） */}
          <div
            className="choke-boss-figure"
            style={{ "--el": elementColor(battle.enemy.element) } as CSSProperties}
            aria-hidden
          >
            <div className="choke-boss-aura" />
            <div className="choke-boss-core">
              <ElementGlyph element={battle.enemy.element} />
            </div>
          </div>

          {/* 敌方攻击红激光靶线 */}
          {laserTargets.length > 0 && (
            <svg className="choke-laser-svg" viewBox="0 0 100 56.25" preserveAspectRatio="none" aria-hidden>
              {laserTargets.map((slotIdx) => {
                const targetX = 11.4 + (slotIdx + 0.5) * (77.2 / Math.max(1, battle.cards.length))
                return (
                  <g key={slotIdx}>
                    <line x1="50" y1="18" x2={targetX} y2="42" className="choke-laser-glow" />
                    <line x1="50" y1="18" x2={targetX} y2="42" className="choke-laser-core" />
                  </g>
                )
              })}
            </svg>
          )}

          {battle.enemy.hardControl && (
            <div className="choke-boss-cc-banner">
              {battle.enemy.hardControl === "sleep" ? <GiSleepy /> : <GiStunGrenade />}
              <div>
                <b>{battle.enemy.hardControl === "sleep" ? "眠咒催眠中" : "粉碎击晕中"}</b>
                <small>敌方行动全部作废 · 任何攻击命中将立刻将其【打醒】！</small>
              </div>
            </div>
          )}

          {/* 右上角快捷工具 */}
          <div className="choke-top-tools">
            {onSwitchUi && (
              <button
                type="button"
                className="choke-tool-btn"
                onClick={onSwitchUi}
                title="切换到新版五段式战斗界面"
              >
                <FiRepeat aria-hidden />
                <span>新版界面</span>
              </button>
            )}
            {host?.canRestart !== false && (
              <button
                type="button"
                className="choke-tool-btn"
                onClick={() => begin(onRestart)}
                title="重新开始本场战斗"
              >
                <FiRefreshCw aria-hidden />
                <span>重开</span>
              </button>
            )}
            <ExitLink host={host} exit={exit} className="choke-tool-btn" sfx="close">
              <FiChevronLeft aria-hidden />
              <span>{exit.label}</span>
            </ExitLink>
          </div>

          <div className="choke-classic-readouts">
            {logOpen && <BattleLog lines={battle.log} />}
            <div className="choke-rance-supports choke-rance-supports--enemy">
              {battle.enemySupports.map(unit => <SupportReadout key={unit.id} side="enemy" unit={unit} description={encounter.supports.find(s => s.id === unit.id)?.roleText} icon={<SupportKindIcon unit={unit} />} />)}
            </div>
          </div>
          <div className="choke-rance-supports choke-rance-supports--party">
            {battle.playerSupports.map(unit => <SupportReadout key={unit.id} side="party" unit={unit} icon={<SupportKindIcon unit={unit} />} />)}
          </div>

          {/* 技能 / 支援 / 抢攻 Cut-in 横幅 */}
          {cutinBanner && (
            <div
              key={cutinBanner.seq}
              className={`choke-skill-banner ${cutinBanner.actor === "support" || cutinBanner.actor === "preemptive" ? "choke-skill-banner--support" : ""}`}
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
        </section>

        {/* ================= 2. 中轴区：兰斯10 阶梯折线双血条 + 弱点/意图台阶 + COMBO 台阶 + 底部内嵌 AP ================= */}
        <section className="choke-hud-band">
          {/* 折线血条上方的四段信息区：左外(BOSS名+HP) | 左内高台(意图+弱点) | 右内高台(COMBO!) | 右外(讨伐队名+HP) */}
          <div className="choke-hud-upper">
            {/* 左外低段上方：红军剪影 + 敌方名 + 大号衬线 HP */}
            <div className="choke-side-info choke-side-info--boss">
              <div className="choke-side-name">{battle.enemy.name}</div>
              <div className="choke-hp-num">
                <i>Hp</i>
                <b>{shownEnemyHp.toLocaleString("en-US")}</b>
              </div>
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

            {/* 左内高台上方（紧贴折线抬高段）：上层是黄色方框敌方意图，下层是蓝色弱点属性条 */}
            <div className="choke-shelf-left">
              <div className="choke-intents">
                {battle.enemy.intents.map((intent, idx) => {
                  const tierLabel = enemyDamageTier(intent)
                  const disabledByCC = Boolean(battle.enemy.hardControl)
                  return (
                    <div
                      key={intent.id}
                      className="choke-intent-box"
                      data-interrupted={intent.interrupted ? "true" : undefined}
                      data-hard-to-interrupt={intent.hardToInterrupt ? "true" : undefined}
                      data-cc={disabledByCC ? "true" : undefined}
                      data-down={intent.causesDown ? "true" : undefined}
                      style={{ "--el": elementColor(intent.element) } as CSSProperties}
                      onMouseEnter={() => setHoveredIntent(intent)}
                      onMouseLeave={() => setHoveredIntent(null)}
                    >
                      <span className="choke-intent-box__icon">
                        <IntentIcon kind={intent.kind} />
                      </span>
                      <i className="choke-intent-box__order">{idx + 1}</i>
                      <em className="choke-intent-box__tier">{tierLabel}</em>
                      {intent.hardToInterrupt && (
                        <b className="choke-intent-box__lock" title="难以打断">
                          !
                        </b>
                      )}
                      {intent.interrupted && <span className="choke-intent-box__break">✕</span>}
                    </div>
                  )
                })}

                {hoveredIntent && (
                  <div className="choke-tooltip choke-tooltip--intent">
                    <div className="choke-tooltip-title">
                      {hoveredIntent.label}
                      {hoveredIntent.interrupted && "（已打断取消）"}
                    </div>
                    <div className="choke-tooltip-sub">
                      {elementLabel(hoveredIntent.element)}属性 · 伤害档位：{enemyDamageTier(hoveredIntent)}
                      {hoveredIntent.causesDown ? " · ⚠️ 附带 DOWN" : ""}
                      {hoveredIntent.hardToInterrupt ? " · 🔒 难以打断（打断、硬控成功率 ×0.4）" : " · 可被刺客打断"}
                    </div>
                    <div className="choke-tooltip-desc">{hoveredIntent.desc}</div>
                  </div>
                )}
              </div>

              <WeaknessRibbon
                open={battle.enemy.weaknesses}
                found={battle.hiddenFound}
                exposed={battle.enemy.exposed}
                unknown={battle.enemy.hiddenWeaknesses.length - battle.hiddenFound.length}
              />
            </div>

            {/* 右内高台上方（紧贴右折线抬高段）：兰斯10 大号斜体 1 COMBO! */}
            <div className="choke-shelf-right">
              {battle.combo > 0 && (
                <div className="choke-combo-counter" ref={comboRef}>
                  <b>{battle.combo}</b>
                  <div className="choke-combo-meta">
                    <span>COMBO!</span>
                    {comboPct > 0 && <em>+{comboPct}%</em>}
                  </div>
                </div>
              )}
              {battle.teamStatuses.length > 0 && (
                <div className="choke-mini-statuses choke-mini-statuses--party">
                  {battle.teamStatuses.map((status) => (
                    <span
                      className={`choke-buff-pill ${status.isDebuff ? "choke-buff-pill--bad" : ""}`}
                      key={status.id}
                    >
                      {status.name}
                      <i>{status.turns}</i>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 右外低段上方：讨伐队 + 大号衬线 HP */}
            <div className="choke-side-info choke-side-info--party">
              <div className="choke-side-name">{playerName}</div>
              <div className="choke-hp-num">
                <i>Hp</i>
                <b>{shownPartyHp.toLocaleString("en-US")}</b>
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
          </div>

          {/* 兰斯10 阶梯折线双血条 + 中央盾形 Round/VS + 折线凹槽下的 AP 齿轮宝石栏 */}
          <div className="choke-bent-gauges">
            {lossPillars.map((p) => (
              <div
                key={p.id}
                className={`choke-hp-loss-pillar choke-hp-loss-pillar--${p.side}`}
                style={{ left: `${p.left}%`, width: `${p.width}%` }}
                aria-hidden
              />
            ))}
            {/* 左：BOSS 阶梯折线血条 */}
            <BentGauge side="boss" polygon={BOSS_GAUGE_POLYGON} pct={bossPct} fillX={4} fillWidth={bossFillWidth} />
            {(battle.enemy.shieldMax ?? 0) > 0 && (
              <div
                className="choke-shield-bar--classic"
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

            <button type="button" className="choke-center-orb" disabled>
              <i className="choke-orb-round">Round</i>
              <b className="choke-orb-num" key={battle.turn}>
                {battle.turn}
              </b>
              <span className="choke-orb-vs">VS</span>
            </button>

            <BentGauge side="party" polygon={PARTY_GAUGE_POLYGON} pct={partyPct} fillX={partyFillX} fillWidth={partyFillWidth} />

            <div className="choke-ap-pocket">
              <span className="choke-ap-label">Ap</span>
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
          </div>
        </section>

        {/* ================= 3. 下半区：7 卡指令台（1:1 兰斯10 左右翼 + 卡面中央 BOOST/行動終了 + 主动被动同款技能条） ================= */}
        <section className="choke-deck">
          <aside className="choke-wing choke-wing--left">
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
                  ? `${battle.swapCooldown} Round后`
                  : `替补 ${battle.bench.filter((b) => !b.down).length} 张`}
              </div>
            </button>

            <div className="choke-wing-toggles">
              <button
                type="button"
                className="choke-btn-mini"
                aria-label={hint}
                title={hint}
                onClick={cycle}
                data-sfx="toggle"
              >
                <GiHourglass aria-hidden />
                <span>{label}</span>
              </button>
              <button
                type="button"
                className="choke-btn-mini"
                aria-pressed={logOpen}
                onClick={() => setLogOpen((open) => !open)}
                data-sfx="paper"
              >
                <span>战报</span>
              </button>
              {autoEnd.allowed && (
                <button
                  type="button"
                  className="choke-btn-mini"
                  aria-pressed={autoEnd.on}
                  title="没有能做的操作时，3 秒后自动结束回合；倒计时里点任何地方可取消"
                  onClick={autoEnd.toggle}
                  data-sfx="toggle"
                >
                  <span>自动结束</span>
                </button>
              )}
            </div>

            <ExitLink host={host} exit={exit} className="choke-btn-menu" sfx="close">
              {exit.label}
            </ExitLink>
          </aside>

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

                    {/* 兰斯10 风格：覆盖在未行动卡片中央的炫光艺术大字 BOOST / 必殺 / 連撃（见参考图第2张卡） */}
                    {card.trigger && !card.acted && !card.down && (
                      <TriggerReadout trigger={card.trigger} label={card.trigger === "critical_art" ? "必殺 3.0×" : card.trigger === "double_cast" ? "連撃 ×2" : "BOOST"} />
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

                    {/* 兰斯10 风格：已行动卡片中央红色禁止环 + 「行動終了」印章（见参考图第3张卡） */}
                    {!card.down && card.acted && (
                      <div className="choke-acted-stamp">
                        <div className="choke-acted-circle" />
                        <div className="choke-stamp-text">
                          <b>行動終了</b>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )
            })}
          </div>

          {/* 右翼：1:1 兰斯10 单个蓝色【防御 / 1 Ap】大按键 + 底部红色【结束该轮】按键 */}
          <aside className="choke-wing choke-wing--right">
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
                  : `点击追加/升级右侧侧面支援【防御 Lv${battle.defenseTier + 1}】（消耗 1 AP）`
              }
            >
              <div className="choke-defend-top">
                <GiShield />
                <b>{battle.defenseTier > 0 ? `防御 Lv${battle.defenseTier}` : "防御"}</b>
              </div>
              <span className="choke-defend-ap">
                {battle.defenseTier >= maxDefenseTier ? "MAX" : "1 Ap"}
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
              结束该轮
            </button>
          </aside>
        </section>

        {/* ================= 4. 战中替补席换人抽屉 ================= */}
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

        {/* 最底栏只显示即时战况 */}
        <footer className="choke-footer">
          {/* key 用文字本身：战况换了一句，就重新顶上来一次 */}
          <span className="choke-ticker" key={ticker} data-error={actionError ? "true" : undefined}>
            {ticker}
          </span>
        </footer>

        <SkillHint hint={skillHint} />

        {/* ================= 6. 战后结算层（三星评价） ================= */}
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
