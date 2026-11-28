import { Suspense, useEffect, useRef, useState, type ReactNode } from "react"

import {
  fetchDeck,
  fetchEncounter,
  fetchEncounters,
  fetchMe,
  fetchUserCards,
  toFace,
  type ApiDeck,
  type ApiUserCard,
} from "@/desk/session/api"
import { GuestLoginButton } from "@/desk/login/GuestLoginButton"
import { pickLineup } from "@/desk/lib/lineup"
import { advanceTutorial, flushTutorialQueue, useTutorialProgress } from "@/tutorial/store"

import { createBattle } from "@choke/shared/battle/engine"
import { BASE_SLOTS, FREE_ALLOCATION, apMaxOf } from "@choke/shared/expedition-points"
import { withAction, type BattleAction } from "@choke/shared/battle/actions"
import { TUTORIAL_ENCOUNTER_ID, type EncounterSpec, type EncounterSummary } from "@choke/shared/battle/content"
import type { BattleState } from "@choke/shared/battle/types"
import { randomSeed } from "@choke/shared/rng"
import { playSfx } from "@/audio/sfx"
import { DESK_BATTLE_EXIT } from "./host"
import { ClassicStage, ModernStage, readBattleUiMode, saveBattleUiMode, type BattleUiMode } from "./stages"
import type { BattleHostHooks } from "./host"
import "./battle-gate.css"

/** 进不了战斗时的整页提示（没登录、没卡、出错、加载中）：和战斗舞台同一套配色，都带回桌面的路 */
function Gate({ tag, title, text, children }: { tag: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="choke-gate-page">
      <div className="choke-gate">
        <small>{tag}</small>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        {children}
      </div>
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <Gate tag="CHOKE! · BATTLE" title={label}>
      <i className="choke-gate__spin" aria-hidden />
    </Gate>
  )
}

interface ApiUser {
  id: string
  username: string
}

export function BattlePage() {
  const [user, setUser] = useState<ApiUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [deck, setDeck] = useState<ApiDeck | null>(null)
  const [extraCards, setExtraCards] = useState<ApiUserCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [battle, setBattle] = useState<BattleState | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [returning, setReturning] = useState(false)

  const searchParams = new URLSearchParams(window.location.search)
  const [uiMode, setUiMode] = useState(() => readBattleUiMode(searchParams))
  useEffect(() => saveBattleUiMode(uiMode), [uiMode])
  const tutorialMode = searchParams.get("tutorial") === "1"
  const fromDeck = !tutorialMode && searchParams.get("from") === "deck"
  const exit = fromDeck ? { href: "/deck", label: "卡组" } : DESK_BATTLE_EXIT
  const [stageId, setStageId] = useState<string | null>(searchParams.get("stage"))
  const [encounters, setEncounters] = useState<EncounterSummary[] | null>(null)
  const [encounter, setEncounter] = useState<EncounterSpec | null>(null)

  const progress = useTutorialProgress(user?.id ?? null)
  const tutorialRun = tutorialMode && progress.tutorialStep === "battle-view"
  const tutorialFinished = tutorialMode && progress.tutorialStep === "battle-result"
  const rewarded = useRef(false)
  /** 本场已执行的合法操作；第 4 步上传给服务端复算 */
  const actions = useRef<BattleAction[]>([])

  // 链接里的 stage 不存在时回落到列表第一场；战斗测试（仅开发模式）可选所有遭遇，含没上架的
  const [testMode, setTestMode] = useState(false)
  const pool = (testMode && import.meta.env.DEV ? encounters : encounters?.filter((e) => e.listed)) ?? []
  const encounterId = tutorialRun
    ? TUTORIAL_ENCOUNTER_ID
    : (pool.find((e) => e.id === stageId) ?? pool[0])?.id ?? null

  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((data) => {
        if (cancelled) return
        setUser({ id: data.id, username: data.username })
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    Promise.all([
      fetchDeck(user.id),
      fetchUserCards(user.id, { sort: "rarity", limit: 20 }).catch(() => ({
        rows: [] as ApiUserCard[],
        total: 0,
        limit: 20,
        offset: 0,
      })),
    ])
      .then(([deckData, cardPage]) => {
        if (cancelled) return
        setDeck(deckData)
        setExtraCards(cardPage.rows)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "加载卡组失败")
      })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    fetchEncounters()
      .then((list) => {
        if (!cancelled) setEncounters(list)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "加载关卡失败")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!encounterId) return
    let cancelled = false
    fetchEncounter(encounterId)
      .then((spec) => {
        if (!cancelled) setEncounter(spec)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "加载关卡失败")
      })
    return () => {
      cancelled = true
    }
  }, [encounterId])

  // 教学战结束（胜负都算）后直接把教程推进到“结算”步骤
  useEffect(() => {
    if (!tutorialRun || !battle || rewarded.current) return
    if (battle.phase !== "won" && battle.phase !== "lost") return
    rewarded.current = true
    advanceTutorial("battle-view")
  }, [battle, tutorialRun])

  // 普通 PvE 暂不发玩家经验：战斗还在客户端结算，服务端无法校验（第 3 步战斗引擎进 shared 后由服务端复算发放）

  if (loading) return <Loading label="加载中" />
  if (!user) {
    return (
      <Gate tag="CHOKE! · BATTLE" title="需要先登录" text="战斗读取你账号里保存的出战卡组与替补席。">
        <div className="choke-gate__actions">
          <a href="/auth/osu" data-sfx="send">
            用 osu! 登录
          </a>
          <GuestLoginButton className="choke-gate__guest" label="以游客身份进入" />
          <a href="/home">回桌面</a>
        </div>
      </Gate>
    )
  }
  if (error) {
    return (
      <Gate tag="CHOKE! · BATTLE" title="战斗没能加载" text={error}>
        <div className="choke-gate__actions">
          <button type="button" onClick={() => window.location.reload()}>
            再试一次
          </button>
          <a href={exit.href}>返回{exit.label}</a>
        </div>
      </Gate>
    )
  }
  if (!deck) return <Loading label="加载卡组" />
  // 战前切关时等新遭遇到手再渲染，避免用旧关卡开战；已开战则不受影响（如教学战结束后教程步骤变化）
  if (!encounter || (!battle && encounter.id !== encounterId)) return <Loading label="加载关卡" />

  const deckCards = deck.slots.flatMap((slot) => (slot.card ? [slot.card] : []))
  // 教学战最多 4 张：若玩家还没组卡组则直接从卡册里按推荐挑，不改动存着的卡组；教学战没有替补
  const tutorialPool = deckCards.length > 0 ? deckCards : extraCards
  const cards = tutorialRun
    ? pickLineup(tutorialPool, encounter.recommend, BASE_SLOTS).rows
    : deckCards
  const deckCardUids = new Set(cards.map((c) => c.userCardId))
  const benchCards = tutorialRun
    ? []
    : extraCards.filter((c) => !deckCardUids.has(c.userCardId)).slice(0, 8)

  if (cards.length === 0) {
    return (
      <Gate tag="CHOKE! · BATTLE" title="卡组里还没有卡" text="至少上阵 1 张卡才能出战。">
        <div className="choke-gate__actions">
          <a href={fromDeck ? exit.href : "/home?panel=deck"}>去组卡</a>
          {!fromDeck && <a href="/home">回桌面</a>}
        </div>
      </Gate>
    )
  }

  const start = () => {
    setActionError(null)
    actions.current = []
    setBattle(
      createBattle(
        encounter,
        cards.map((card) => ({
          uid: card.userCardId,
          cardId: card.id,
          face: toFace(card),
        })),
        {
          // 第 4 步改为服务端下发种子；现在本地试玩先在前端生成
          seed: randomSeed(),
          // 本机练习不花远征点数，用免费分配（AP 上限 6）
          apMax: apMaxOf(FREE_ALLOCATION),
          bench: benchCards.map((card) => ({
            uid: card.userCardId,
            cardId: card.id,
            face: toFace(card),
          })),
        },
      ),
    )
  }

  if (tutorialFinished && !battle) {
    return (
      <Gate tag="TUTORIAL · CLEARED" title="教学战已经完成了" text="回桌面继续教程结算吧。">
        <div className="choke-gate__actions">
          <a href="/home">回桌面</a>
        </div>
      </Gate>
    )
  }

  const act = (action: BattleAction) => {
    if (!battle) return
    const { state: next, error } = withAction(battle, action)
    if (!error) {
      actions.current.push(action)
      setBattle(next)
    }
    setActionError(error)
  }

  const play = (card: number, skill: string) => act({ type: "skill", card, skill })
  const defend = (tier?: number) => act({ type: "defend", tier })
  const swap = (slot: number, benchUid: number) => act({ type: "swap", slot, benchUid })
  const finishTurn = () => act({ type: "endTurn" })

  const finishTutorialAndReturn = async () => {
    if (returning) return
    setReturning(true)
    try {
      if (progress.tutorialStep === "battle-view") {
        advanceTutorial("battle-view")
      }
      await flushTutorialQueue()
    } finally {
      window.location.href = "/"
    }
  }

  const tutorialDoneInStage =
    tutorialFinished || (tutorialMode && (battle?.phase === "won" || battle?.phase === "lost"))
  const tutorialHost: BattleHostHooks | undefined =
    tutorialMode && (tutorialRun || tutorialDoneInStage)
      ? {
        exitLabel: "返回桌面",
        onExit: () => {
          if (tutorialDoneInStage) {
            void finishTutorialAndReturn()
          } else {
            window.location.href = "/"
          }
        },
        canRestart: !tutorialDoneInStage,
        resultNote: (
          <p style={{ margin: 0, opacity: 0.85, fontSize: "0.9em" }}>
            教学战已完成，回桌面找阿图领取 Lv.3 毕业结算。
          </p>
        ),
        resultActions: (
          <button
            type="button"
            disabled={returning}
            onClick={() => void finishTutorialAndReturn()}
          >
            {returning ? "正在同步进度…" : "完成教学 · 返回桌面"}
          </button>
        ),
      }
      : undefined

  const StageComponent = uiMode === "modern" ? ModernStage : ClassicStage

  const switchUi = () => {
    const nextMode: BattleUiMode = uiMode === "classic" ? "modern" : "classic"
    playSfx("toggle")
    setUiMode(nextMode)
    const url = new URL(window.location.href)
    url.searchParams.set("ui", nextMode)
    if (encounterId && !tutorialRun) {
      url.searchParams.set("stage", encounterId)
    }
    window.history.replaceState(null, "", url)
  }

  return (
    <Suspense fallback={<Loading label="加载战斗舞台" />}>
      <StageComponent
        battle={battle}
        playerName={user?.username ?? "玩家"}
        deck={cards.map(toFace)}
        encounter={encounter}
        encounters={pool}
        tutorial={tutorialRun}
        host={tutorialHost}
        testMode={testMode && import.meta.env.DEV}
        onToggleTest={import.meta.env.DEV ? () => setTestMode((on) => !on) : undefined}
        actionError={actionError}
        onSelectStage={(nextId) => setStageId(nextId)}
        onStart={start}
        onPlay={play}
        onDefend={defend}
        onSwap={swap}
        onEndTurn={finishTurn}
        onRestart={start}
        onSwitchUi={switchUi}
        exit={exit}
      />
    </Suspense>
  )
}
