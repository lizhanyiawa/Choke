import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError, checkOsuDaily, claimQuest, fetchOsuDaily } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { RewardChips, rewardText } from "@/flat/ui/Rewards"
import { useNow } from "@/flat/ui/time"
import { refreshProgress } from "@/tutorial/store"
import { featureLockHint } from "@/tutorial/unlocks"
import type { OsuDailyView } from "@choke/shared/osu-daily"
import type { QuestEvent } from "@choke/shared/quests"

import { refreshQuests, useQuests } from "./store"

import "./osu-daily-card.css"

/** 通过今天的推荐谱面记的是这个任务事件；奖励和「能不能领」都看带这个事件的那条日常任务 */
const PASS_EVENT: QuestEvent = "osu-daily-pass"

const UNKNOWN_ERROR = "出了点问题，请稍后再试"

interface Loaded {
  /** 这份数据是谁的：换了账号，旧的不能接着显示 */
  userId: string
  view: OsuDailyView
  /** 冷却结束的本机时间；没在冷却是 0 */
  cooldownUntil: number
}

/**
 * 今日推荐谱面：去 osu! 打完，回来点「检查」，通过后领奖。
 * 自己取数据、自己管冷却，放在哪一页都能用。
 * 任务功能没解锁、数据还没取回来或取不到、今天没有谱面时，什么都不画。
 */
export function OsuDailyCard() {
  const { user, progress, notify, refreshUser, refreshPacks } = useFlat()
  const { data } = useQuests()
  const userId = user.id
  const locked = featureLockHint("quests", progress) !== null
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState<"check" | "claim" | null>(null)
  const now = useNow(1000)
  /** 卸载之后才回来的响应，不再动这张卡的状态 */
  const mounted = useRef(false)
  /** 只认最后发出的那次读取：更早发出的带回来的是旧数据 */
  const loadSeq = useRef(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** 取今天的谱面、通过没有、还要冷却多久 */
  const load = useCallback(() => {
    loadSeq.current += 1
    const id = loadSeq.current
    return fetchOsuDaily(userId).then(
      (view) => {
        if (!mounted.current || id !== loadSeq.current) return
        setLoaded({
          userId,
          view,
          cooldownUntil: view.cooldownSeconds > 0 ? Date.now() + view.cooldownSeconds * 1000 : 0,
        })
      },
      () => {
        // 取不到就保持原样：第一次取不到，这张卡就不出现；之后取不到，接着显示上一次的
      },
    )
  }, [userId])

  useEffect(() => {
    // 任务功能没解锁时这张卡不出现，请求也不用发
    if (!locked) void load()
  }, [locked, load])

  const check = async () => {
    if (busy !== null) return
    setBusy("check")
    try {
      const result = await checkOsuDaily(userId)
      if (result.passed) {
        notify("通过了！奖励可以领了", "success")
        await refreshQuests()
      } else if (result.reason === "no-score") {
        notify("还没找到你今天在这张谱面上的成绩，打完后稍等一会儿再检查")
      } else {
        notify("找到了成绩，但没达到条件")
      }
      // 通过了要换成「已通过」，没通过要拿新的冷却。等它回来再松开按钮，免得旧状态下又被点一次
      if (mounted.current) await load()
    } catch (error) {
      notify(error instanceof Error ? error.message : UNKNOWN_ERROR, "error")
      if (
        mounted.current &&
        error instanceof ApiError &&
        (error.code === "cooldown" || error.code === "osu_busy")
      ) {
        const seconds = error.extra.cooldownSeconds
        if (typeof seconds === "number") {
          const until = Date.now() + seconds * 1000
          setLoaded((last) => last && { ...last, cooldownUntil: until })
        }
      }
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const claim = async (questId: string) => {
    if (busy !== null) return
    setBusy("claim")
    try {
      const { rewards } = await claimQuest(userId, questId)
      notify(rewards.length > 0 ? `获得：${rewardText(rewards)}` : "已领取", "success")
      refreshUser()
      refreshPacks()
      void refreshProgress()
      await refreshQuests()
    } catch (error) {
      notify(error instanceof Error ? error.message : UNKNOWN_ERROR, "error")
      // 多半是在别处已经领过了：对一次表，这里才会换成「奖励已领」
      await refreshQuests()
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const current = !locked && loaded?.userId === userId ? loaded : null
  const beatmap = current?.view.beatmap
  if (!current || !beatmap) return null

  const quest = data?.quests.find((entry) => entry.event === PASS_EVENT)
  const rules: string[] = []
  if (beatmap.minAccuracy !== undefined) rules.push(`准度 ≥ ${beatmap.minAccuracy}%`)
  if (beatmap.minRank !== undefined) rules.push(`评级 ≥ ${beatmap.minRank}`)
  // useNow 一秒才走一格，只会比收到响应的时刻早：向上取整的话 60 秒的冷却会先闪一下 61。
  // 所以向下取整，最后不满一秒的那一小段按 1 显示——按钮不能提前亮，服务端会拒绝
  const cooldownLeft = current.cooldownUntil - now
  const cooldown = cooldownLeft > 0 ? Math.max(1, Math.floor(cooldownLeft / 1000)) : 0

  return (
    <section className="fl-card osu-daily">
      <div className="fl-card__head">
        <h2 className="osu-daily__label">今日推荐谱面</h2>
        {quest && <RewardChips lines={quest.rewards} />}
      </div>
      <div className="osu-daily__map">
        <b className="osu-daily__title">{beatmap.title}</b>
        <span className="osu-daily__rule">
          {rules.length > 0 ? rules.join(" · ") : "Pass 就算，挂 NF 也行"}
        </span>
      </div>
      {current.view.passed ? (
        <div className="osu-daily__passed" aria-live="polite">
          <b className="fl-good">今天已通过</b>
          {quest?.claimable ? (
            <button
              type="button"
              className="bk-btn fl-claim"
              disabled={busy !== null}
              onClick={() => void claim(quest.id)}
            >
              {busy === "claim" ? "领取中…" : "领取奖励"}
            </button>
          ) : quest?.claimed ? (
            <span className="osu-daily__claimed">奖励已领</span>
          ) : null}
        </div>
      ) : !progress.linkedAccount ? (
        <>
          <p className="bk-note">绑定 osu! 账号后才能检查成绩</p>
          <div className="osu-daily__links">
            <a className="fl-link" href="/home?panel=account">
              去绑定
            </a>
            <a className="fl-link" href={beatmap.url} target="_blank" rel="noreferrer">
              去 osu! 看谱面
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="osu-daily__actions">
            <a className="bk-btn" href={beatmap.url} target="_blank" rel="noreferrer">
              去 osu! 打
            </a>
            <button
              type="button"
              className="bk-btn"
              disabled={busy !== null || cooldown > 0}
              onClick={() => void check()}
            >
              {busy === "check" ? (
                "检查中…"
              ) : cooldown > 0 ? (
                <span>
                  检查（<span className="bk-num">{cooldown}s</span>）
                </span>
              ) : (
                "检查成绩"
              )}
            </button>
          </div>
          <p className="bk-note">打完回来点检查；通过后就能领奖。</p>
        </>
      )}
    </section>
  )
}
