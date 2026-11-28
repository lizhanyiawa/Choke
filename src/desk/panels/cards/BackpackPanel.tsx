import { useEffect, useMemo, useState } from "react"

import { playSfx } from "@/audio/sfx"
import { GameCardFace } from "@/card/GameCardFace"
import { RARITY_LABEL, battlePower } from "@/card/data"

import {
  fetchMe,
  fetchPackInventory,
  openMysteryPack,
  toFace,
  type ApiUserCard,
  type PackInventory,
} from "@/desk/session/api"
import { Pages } from "@/desk/shell/BookPages"
import { emitDeskData, onDeskData, onDeskHover } from "@/desk/session/events"
import { GuestLoginButton } from "@/desk/login/GuestLoginButton"
import { INVITE_OPEN_EVENT } from "@/desk/lib/invite"
import { PackArt } from "@/desk/opening/PackArt"
import { EVENT_POOLS } from "@/desk/lib/rarity"
import type { PackPool } from "@/desk/lib/types"
import { MysteryQuestionnaire } from "./MysteryQuestionnaire"
import { useGameConfig } from "@/desk/session/useGameConfig"
import "@/desk/panels/cards/backpack-panel.css"

interface PackMeta {
  id: string
  label: string
  note: string
  /** 服务端卡池 id，去抽卡时用 */
  pool?: string
  /** 卡包图用的桌面卡池；神秘卡包没有 */
  art?: PackPool
}

const MYSTERY_ID = "mystery"

/** 背包里的展示顺序是 UI 决定；名称、每包张数从 GET /config 读。 */
const PACK_ORDER = ["normal", "golden", "radiant", "sky", "prism"] as const

const PACK_TAGLINE: Record<PackPool, string> = {
  normal: "日常主力",
  golden: "任务产出",
  radiant: "周常奖励",
  sky: "月常奖励",
  prism: "赛季牌面",
  starter: "一次性 · 保底至少 1 张传奇",
}

export function BackpackPanel({
  userId,
  onOpenGacha,
  onHeroClaimed,
}: {
  userId: string | null
  onOpenGacha: (pool: string) => void
  onHeroClaimed?: () => void
}) {
  const [inventory, setInventory] = useState<PackInventory | null>(null)
  const config = useGameConfig()
  const [hero, setHero] = useState<ApiUserCard | null>(null)
  const [onboarded, setOnboarded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [questionnaire, setQuestionnaire] = useState(false)
  const [result, setResult] = useState<ApiUserCard | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const [revision, setRevision] = useState(0)
  /** 没点过就默认选第一个有库存的 */
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    const offHover = onDeskHover("backpack", (value) => setDropHover(Boolean(value)))
    const offPacks = onDeskData("packs", () => setRevision((value) => value + 1))
    return () => {
      offHover()
      offPacks()
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchPackInventory(userId)
      .then((data) => {
        if (cancelled) return
        setInventory(data)
        setLoadError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(reason instanceof Error ? reason.message : "加载背包失败")
      })
    fetchMe()
      .then((data) => {
        if (cancelled) return
        setHero((data.hero as ApiUserCard | null) ?? null)
        setOnboarded(!!data.onboarded)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, revision])

  const counts = inventory?.packs ?? {}
  const heroClaimed = inventory?.heroClaimed ?? !!hero
  const totalPacks = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0)
  const heroFace = useMemo(() => (hero ? toFace(hero) : result ? toFace(result) : null), [hero, result])
  const packSize = config?.packSize ?? 5
  const packList = useMemo<PackMeta[]>(() => {
    const list: PackMeta[] = [
      { id: MYSTERY_ID, label: "神秘卡包", note: "只有 1 张卡：你的本体卡" },
    ]
    // 活动包只在还有库存时出现
    const events = EVENT_POOLS.filter((id) => (inventory?.packs[id] ?? 0) > 0)
    for (const id of [...events, ...PACK_ORDER]) {
      const meta = config?.packs.find((pack) => pack.id === id)
      list.push({
        id,
        label: meta?.name ?? id,
        note: `${PACK_TAGLINE[id]} · 每包 ${packSize} 张`,
        pool: id,
        art: id,
      })
    }
    return list
  }, [config, packSize, inventory])
  const selected =
    packList.find((pack) => pack.id === picked) ??
    packList.find((pack) => (counts[pack.id] ?? 0) > 0) ??
    packList[0]!
  const selectedCount = counts[selected.id] ?? 0
  const isMystery = selected.id === MYSTERY_ID
  const showHero = isMystery && heroFace

  async function submitAnswers(answers: string[]) {
    if (!userId) return
    const data = await openMysteryPack(userId, answers)
    setResult(data.hero)
    setHero(data.hero)
    setInventory((current) =>
      current
        ? { ...current, heroClaimed: true, packs: { ...current.packs, ...data.packs } }
        : current,
    )
    setError(null)
    // 开完留在神秘卡包这一栏，右页直接看到本体卡
    setPicked(MYSTERY_ID)
    playSfx("success")
    emitDeskData("packs")
    onHeroClaimed?.()
  }

  if (!userId) {
    return (
      <Pages
        left={
          <>
            <p className="bk-note">卡包库存、神秘卡包和你的本体卡都放在这里。</p>
            <div className="login-actions">
              <a className="bk-btn bk-btn--main" href="/auth/osu">
                用 osu! 登录
              </a>
              <GuestLoginButton className="bk-btn bk-btn--ghost" />
            </div>
          </>
        }
        right={<div className="bk-empty">登录后查看背包</div>}
      />
    )
  }

  if (!inventory) {
    return (
      <Pages
        className="backpack-panel"
        left={
          loadError ? (
            <div className="bk-box bk-error backpack-retry" role="alert">
              <span>{loadError}</span>
              <button
                type="button"
                className="bk-btn bk-btn--sm"
                onClick={() => {
                  setLoadError(null)
                  setRevision((value) => value + 1)
                }}
              >
                重试
              </button>
            </div>
          ) : (
            <div className="bk-empty" role="status">
              加载背包…
            </div>
          )
        }
        right={<div className="bk-empty" aria-hidden />}
      />
    )
  }

  return (
    <Pages
      className={`backpack-panel ${dropHover ? "is-drop-target" : ""}`}
      left={
        <>
          <span className="bk-label">库存 · 共 {totalPacks} 包</span>
          {loadError && (
            <div className="bk-box bk-error backpack-retry" role="alert">
              <span>{loadError}</span>
              <button
                type="button"
                className="bk-btn bk-btn--sm"
                onClick={() => {
                  setLoadError(null)
                  setRevision((value) => value + 1)
                }}
              >
                重试
              </button>
            </div>
          )}
          <div className="bk-list">
            {packList.map((pack) => {
              const count = counts[pack.id] ?? 0
              const on = pack.id === selected.id
              return (
                <button
                  type="button"
                  key={pack.id}
                  className={`bk-row backpack-row ${on ? "is-on" : ""} ${count <= 0 ? "is-empty" : ""}`}
                  aria-pressed={on}
                  onClick={() => {
                    if (!on) playSfx("tick")
                    setPicked(pack.id)
                  }}
                >
                  {/* 普通卡包用 PackArt，神秘卡包是一个粉色问号包 */}
                  <span className="backpack-row__art" aria-hidden>
                    {pack.art ? <PackArt pool={pack.art} /> : <i className="backpack-mystery" />}
                  </span>
                  <span className="backpack-row__text">
                    <b>{pack.label}</b>
                    <small>{pack.note}</small>
                  </span>
                  <em className="bk-num">×{count}</em>
                </button>
              )
            })}
          </div>
        </>
      }
      right={
        <>
          <div className="backpack-detail">
            {showHero ? (
              <div className="backpack-detail__card">
                <GameCardFace card={showHero} />
              </div>
            ) : (
              <span className="backpack-detail__art" aria-hidden>
                {selected.art ? <PackArt pool={selected.art} /> : <i className="backpack-mystery" />}
              </span>
            )}
            <div className="backpack-detail__text">
              {showHero ? (
                <>
                  <span className="bk-label">{result ? "神秘卡包已开启" : "你的本体卡"}</span>
                  <b className="backpack-detail__name">{showHero.name}</b>
                  <span className="bk-note bk-num">
                    {RARITY_LABEL[showHero.rarity]} · BP {battlePower(showHero).toLocaleString("en-US")}
                  </span>
                  <p className="bk-note">本体卡稀有度来自公开排行榜；osu! 数据只提供个人数值加成。</p>
                </>
              ) : (
                <>
                  <span className="bk-label">库存 ×{selectedCount}</span>
                  <b className="backpack-detail__name">{selected.label}</b>
                  <p className="bk-note">{selected.note}</p>
                  <p className="bk-note">
                    {isMystery ? "神秘卡包只出你的本体卡。" : "卡包在开包时消耗。"}
                  </p>
                </>
              )}
            </div>
          </div>

          {error && !questionnaire && (
            <p className="bk-note bk-error" role="alert">
              {error}
            </p>
          )}

          {isMystery ? (
            heroClaimed ? (
              <span className="bk-tag backpack-done">本体卡已获得</span>
            ) : !onboarded ? (
              <button
                type="button"
                className="bk-btn bk-btn--main bk-btn--block"
                onClick={() => window.dispatchEvent(new Event(INVITE_OPEN_EVENT))}
              >
                打开邀请函领新手礼包
              </button>
            ) : (
              <button
                type="button"
                className="bk-btn bk-btn--main bk-btn--block"
                onClick={() => {
                  playSfx("click")
                  setError(null)
                  setQuestionnaire(true)
                  setResult(null)
                }}
                disabled={selectedCount <= 0 || questionnaire}
              >
                {selectedCount > 0 ? "开启神秘卡包" : "没有神秘卡包"}
              </button>
            )
          ) : (
            <button
              type="button"
              className="bk-btn bk-btn--main bk-btn--block"
              onClick={() => onOpenGacha(selected.pool ?? "normal")}
              disabled={selectedCount <= 0}
            >
              {selectedCount > 0 ? `去抽${selected.label.replace("卡包", "")}` : "没有卡包"}
            </button>
          )}

          {questionnaire && (
            <MysteryQuestionnaire
              onSubmit={submitAnswers}
              onClose={() => setQuestionnaire(false)}
              onError={setError}
            />
          )}
        </>
      }
    />
  )
}
