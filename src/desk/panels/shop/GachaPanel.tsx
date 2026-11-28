import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"

import { playSfx } from "@/audio/sfx"
import { GameCardFace } from "@/card/GameCardFace"
import { RARITY_LABEL } from "@/card/data"
import { RARITIES, type CardFaceData, type Rarity } from "@/card/types"
import type { PackId } from "@choke/shared/content"
import { emitTutorialEvent, requestTutorialStarter } from "@/tutorial/events"
import { useTutorialProgress } from "@/tutorial/store"

import {
  ApiError,
  fetchPackInventory,
  openPack as apiOpenPack,
} from "@/desk/session/api"
import { emitDeskData, onDeskData } from "@/desk/session/events"
import { Pages } from "@/desk/shell/BookPages"
import {
  GACHA_OPEN_EVENT,
  startCardPointerDrag,
  toDeskCard,
  type GachaOpenDetail,
} from "@/desk/lib/drag"
import { GuestLoginButton } from "@/desk/login/GuestLoginButton"
import { resolvePulledCards } from "@/desk/opening/cards"
import { PackArt } from "@/desk/opening/PackArt"
import { RARITY_COLOR } from "@/desk/lib/rarity"
import { useGameConfig } from "@/desk/session/useGameConfig"
import "@/desk/panels/shop/gacha-panel.css"

/** 「跳过动画」：开出的卡直接摆在面板里，方便连抽 */
const SKIP_KEY = "choke.gacha.skipAnim"

export type PoolId = PackId

interface Pool {
  id: PoolId
  name: string
  note: string
  /** 活动包：库存为 0 时整行隐藏 */
  event?: boolean
}

const POOLS: Pool[] = [
  { id: "starter", name: "新手", note: "一次性 · 必出传奇", event: true },
  { id: "normal", name: "普通", note: "日常主力" },
  { id: "golden", name: "黄金", note: "任务产出" },
  { id: "radiant", name: "璀璨", note: "周常奖励" },
  { id: "sky", name: "天穹", note: "月常奖励" },
  { id: "prism", name: "棱彩", note: "赛季牌面" },
]

export function GachaPanel({
  userId,
  initialPool = "normal",
}: {
  userId: string | null
  initialPool?: PoolId
}) {
  /** null = 还没手动选过：有活动包时默认停在活动包上 */
  const [picked, setPool] = useState<PoolId | null>(initialPool === "normal" ? null : initialPool)
  const [ownerId, setOwnerId] = useState(userId)
  const [cards, setCards] = useState<(CardFaceData & { userCardId: number })[]>(
    []
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [packs, setPacks] = useState<{
    userId: string
    data: Record<string, number>
  } | null>(null)
  const [packsFailed, setPacksFailed] = useState(false)
  const config = useGameConfig()
  const [skipAnim, setSkipAnim] = useState(
    () => localStorage.getItem(SKIP_KEY) === "1"
  )
  const tutorial = useTutorialProgress(userId)
  /** 选中卡池那一行的卡包图，开包动画从这里长出来 */
  const artRef = useRef<HTMLSpanElement>(null)
  const ownerRef = useRef<{ userId: string | null } | null>(null)
  const requestRef = useRef<object | null>(null)

  // 账号切换不能沿用上一位玩家的结果或加载状态。
  if (ownerId !== userId) {
    setOwnerId(userId)
    setCards([])
    setLoading(false)
    setError(null)
    setPacksFailed(false)
  }

  useLayoutEffect(() => {
    ownerRef.current = { userId }
    requestRef.current = null
    return () => {
      ownerRef.current = null
      requestRef.current = null
    }
  }, [userId])

  const loadPacks = useCallback(
    (isCurrent: () => boolean = () => true) => {
      if (!userId) return
      fetchPackInventory(userId)
        .then((data) => {
          if (!isCurrent()) return
          setPacks({ userId, data: data.packs })
          setPacksFailed(false)
        })
        .catch(() => {
          if (isCurrent()) setPacksFailed(true)
        })
    },
    [userId],
  )

  useEffect(() => {
    let cancelled = false
    loadPacks(() => !cancelled)
    return () => {
      cancelled = true
    }
  }, [loadPacks])

  // 桌面补发新手卡包后，面板里的库存数字要跟上
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const off = onDeskData("packs", () => loadPacks(() => !cancelled))
    return () => {
      cancelled = true
      off()
    }
  }, [userId, loadPacks])

  const packSize = config?.packSize ?? 5
  const currentPacks = packs && packs.userId === userId ? packs.data : null
  const visiblePools = POOLS.filter(
    (item) => !item.event || (currentPacks?.[item.id] ?? 0) > 0,
  )
  const fallbackPool = visiblePools.find((item) => item.event)?.id ?? initialPool
  const wanted = picked ?? fallbackPool
  // 活动包开完就隐藏，选中的行消失时回到普通包
  const pool: PoolId = visiblePools.some((item) => item.id === wanted) ? wanted : "normal"
  const current = POOLS.find((item) => item.id === pool) ?? POOLS[0]!
  const odds = Object.entries(
    config?.packs.find((item) => item.id === pool)?.weights ?? {}
  ).filter(([, weight]) => weight > 0)
  const packCount = currentPacks?.[pool] ?? 0
  const inventoryUnknown = packsFailed && !currentPacks

  function selectPool(id: PoolId) {
    if (id === pool) return
    setPool(id)
    setCards([])
    setError(null)
  }

  function toggleSkip() {
    const next = !skipAnim
    setSkipAnim(next)
    localStorage.setItem(SKIP_KEY, next ? "1" : "0")
  }

  async function handleOpenPack() {
    const owner = ownerRef.current
    if (!userId || owner?.userId !== userId || requestRef.current) return

    // 对写请求只放弃过期的展示结果，不中止可能已经消耗卡包的 POST。
    const request = {}
    requestRef.current = request
    const isCurrent = () =>
      ownerRef.current === owner && requestRef.current === request
    let consumed = false
    setLoading(true)
    setError(null)
    setCards([])

    try {
      let result
      try {
        result = await apiOpenPack(pool, packSize)
      } catch (reason) {
        // 没库存了或请求没有明确结果：库存数字以服务端为准重新读一次
        const code = reason instanceof ApiError ? reason.code : undefined
        if (isCurrent() && (code === "no_packs" || code === "timeout" || code === "network")) {
          loadPacks(() => ownerRef.current === owner)
        }
        throw new Error(reason instanceof Error ? reason.message : "开包失败", {
          cause: reason,
        })
      }

      consumed = true
      if (!isCurrent()) return
      if (result.packs) setPacks({ userId, data: result.packs })
      emitDeskData("packs")
      if (!isCurrent()) return

      // 卡包已核销：详情拿不到的卡用结果里的字段兜底，保证每张都展示（含额外第 6 张镜像卡）
      const allPulled = result.bonus ? [...result.results, result.bonus] : result.results
      const pulled = await resolvePulledCards(allPulled)
      const faces = pulled.map((face, index) => ({
        ...face,
        userCardId: allPulled[index]!.userCardId,
      }))

      if (!isCurrent()) return
      if (skipAnim) {
        setCards(faces)
        emitTutorialEvent("pack-opened")
        return
      }
      const art = artRef.current?.getBoundingClientRect()
      const event = new CustomEvent<GachaOpenDetail>(GACHA_OPEN_EVENT, {
        cancelable: true,
        detail: {
          userId,
          cards: faces.map((card) => toDeskCard(card, card.userCardId)),
          pool,
          rect:
            art && art.width > 0
              ? {
                  left: art.left,
                  top: art.top,
                  width: art.width,
                  height: art.height,
                }
              : undefined,
        },
      })
      // 桌面已有另一场开包时保留本次结果，不覆盖它，也不丢弃已经入库的卡。
      if (!window.dispatchEvent(event) && isCurrent()) {
        setCards(faces)
        // 轻量模式没有开包层：撕一声，卡一张张拍到页面上，最后按这一包里最好的那张收个尾
        playSfx("tear", { volume: 0.7 })
        faces.forEach((_, i) => playSfx("deal", { delay: 0.16 + i * 0.09, rate: 0.92 + i * 0.05 }))
        const best = Math.max(...faces.map((card) => RARITIES.indexOf(card.rarity)))
        playSfx(best >= RARITIES.indexOf("L") ? "levelup" : best >= RARITIES.indexOf("E") ? "success" : "tab", {
          delay: 0.2 + faces.length * 0.09,
        })
        if (faces.some((card) => card.foil)) playSfx("shine", { delay: 0.3 + faces.length * 0.09 })
        emitTutorialEvent("pack-opened")
      }
    } catch (reason) {
      if (!isCurrent()) return
      playSfx("error")
      const message = reason instanceof Error ? reason.message : "开包失败"
      if (consumed) emitTutorialEvent("pack-opened")
      setError(
        consumed
          ? `卡包已开启，卡牌已收入卡册；${message}。请到卡册查看。`
          : message
      )
    } finally {
      if (isCurrent()) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }

  const sendAllToDesk = () => {
    if (!cards.length) return
    playSfx("whoosh")
    cards.forEach((_, i) => playSfx("deal", { delay: 0.3 + i * 0.07, rate: 0.92 + i * 0.05, volume: 0.75 }))
    const payload = cards.map((card) => toDeskCard(card, card.userCardId))
    emitDeskData("cards", payload)
    setCards([])
  }

  const needsStarter =
    !loading &&
    !!userId &&
    !inventoryUnknown &&
    packCount <= 0 &&
    tutorial.tutorialStep === "gacha-open"
  const retryInventory = () => {
    playSfx("click")
    loadPacks()
  }
  const openButton = needsStarter ? (
    <button
      type="button"
      className="bk-btn bk-btn--main bk-btn--block"
      data-tutorial-id="gacha-restock"
      onClick={() => {
        playSfx("click")
        requestTutorialStarter()
      }}
    >
      领取新手卡包
    </button>
  ) : inventoryUnknown ? (
    <button
      type="button"
      className="bk-btn bk-btn--main bk-btn--block"
      onClick={retryInventory}
    >
      库存读取失败，点击重试
    </button>
  ) : (
    <button
      type="button"
      className="bk-btn bk-btn--main bk-btn--block"
      data-tutorial-id="gacha-open-button"
      disabled={loading || !userId || packCount <= 0}
      onClick={() => {
        playSfx("pick")
        void handleOpenPack()
      }}
    >
      {loading ? "开启中…" : packCount > 0 ? `开 ${packSize} 张` : "没有卡包"}
    </button>
  )
  const inventoryNote =
    packsFailed && currentPacks ? (
      <p className="bk-note bk-error" role="alert">
        库存刷新失败，数量可能不是最新的{" "}
        <button type="button" className="bk-chip" onClick={retryInventory}>
          点击重试
        </button>
      </p>
    ) : null

  return (
    <Pages
      left={
        <>
          <div className="bk-list" role="group" aria-label="卡池选择">
            {visiblePools.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`bk-row gacha-pool ${pool === item.id ? "is-on" : ""}`}
                aria-pressed={pool === item.id}
                disabled={loading}
                onClick={() => selectPool(item.id)}
              >
                <span
                  className="gacha-pool__art"
                  ref={pool === item.id ? artRef : undefined}
                  aria-hidden
                >
                  <PackArt pool={item.id} />
                </span>
                <span className="gacha-pool__text">
                  <b>{item.name}</b>
                  <small>{item.note}</small>
                </span>
                <em className="bk-num">
                  ×{currentPacks?.[item.id] ?? (inventoryUnknown ? "?" : 0)}
                </em>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="bk-chip gacha-skip"
            aria-pressed={skipAnim}
            onClick={toggleSkip}
            title="开启后开出的卡直接摆在右页，适合连抽"
          >
            跳过动画
          </button>
        </>
      }
      right={
        !userId ? (
          <div className="bk-empty">
            <b>登录后开包</b>
            <span>抽到的卡和保底进度会直接写入你的账号。</span>
            <div className="login-actions">
              <a className="bk-btn bk-btn--main" href="/auth/osu">
                用 osu! 登录
              </a>
              <GuestLoginButton className="bk-btn bk-btn--ghost" />
            </div>
          </div>
        ) : loading || cards.length > 0 ? (
          <>
            <div
              className="bk-cards gacha-results"
              aria-busy={loading}
              aria-live="polite"
            >
              {loading
                ? Array.from({ length: packSize }, (_, index) => (
                    <div
                      className="bk-slot gacha-results__loading"
                      key={index}
                      aria-hidden
                    >
                      …
                    </div>
                  ))
                : cards.map((card, index) => (
                    <div
                      className="gacha-results__card"
                      // key 用卡实例：拖走一张时，剩下的不会重新挂载、再翻一遍
                      key={card.userCardId}
                      role="group"
                      aria-label={card.name}
                      data-rarity={card.rarity}
                      style={{ "--i": index, "--glow": RARITY_COLOR[card.rarity] } as CSSProperties}
                      onPointerDown={(event) =>
                        startCardPointerDrag(
                          event,
                          {
                            card: toDeskCard(card, card.userCardId),
                          },
                          {
                            onDrop: () =>
                              setCards((current) =>
                                current.filter(
                                  (item) => item.userCardId !== card.userCardId
                                )
                              ),
                          }
                        )
                      }
                      title="拖到桌面"
                    >
                      <GameCardFace card={card} />
                    </div>
                  ))}
            </div>
            {error && (
              <p className="bk-note bk-error" role="alert">
                {error}
              </p>
            )}
            {inventoryNote}
            {cards.length > 0 && (
              <p className="bk-note gacha-hint">
                把卡拖到桌面，或一次全部发过去。
              </p>
            )}
            <div className="gacha-actions">
              <button
                type="button"
                className="bk-btn"
                disabled={cards.length === 0}
                onClick={sendAllToDesk}
              >
                全部发到桌面
              </button>
              {openButton}
            </div>
          </>
        ) : (
          <>
            <div className="gacha-current">
              <span className="gacha-current__art" aria-hidden>
                <PackArt pool={pool} />
              </span>
              <div className="gacha-current__text">
                <span className="bk-label">{current.note}</span>
                <b className="gacha-current__name">{current.name}卡池</b>
                <p className="bk-note">一次开 {packSize} 张 · 库存 ×{packCount}</p>
              </div>
            </div>
            <div className="gacha-odds" role="group" aria-label="概率">
              {odds.map(([rarity, weight]) => (
                <span
                  key={rarity}
                  style={{ "--c": RARITY_COLOR[rarity as Rarity] } as CSSProperties}
                >
                  <i aria-hidden />
                  {RARITY_LABEL[rarity as Rarity]}
                  <b className="bk-num">{weight}%</b>
                </span>
              ))}
            </div>
            {error && (
              <p className="bk-note bk-error" role="alert">
                {error}
              </p>
            )}
            {inventoryNote}
            {openButton}
          </>
        )
      }
    />
  )
}
