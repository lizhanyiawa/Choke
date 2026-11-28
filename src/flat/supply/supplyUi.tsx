import { useCallback, useMemo, useState } from "react"
import type { IconType } from "react-icons"
import { GiCrystalShine, GiNotebook, GiOpenTreasureChest, GiTwoCoins } from "react-icons/gi"

import { playSfx } from "@/audio/sfx"
import { ApiError } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { FlatDialog } from "@/flat/ui/FlatDialog"

import { claimSupply, setSupplyFocus, type SupplyGain } from "./api"
import { applySupplyData, refreshSupply } from "./store"

const KIND_ICON: Record<string, IconType> = {
  coins: GiTwoCoins,
  pack: GiOpenTreasureChest,
  expPool: GiNotebook,
  item: GiCrystalShine,
}

/** 按资源 kind 选图标；不认识的 kind 用通用宝箱兜底，兼容未来新增种类。 */
export function supplyIcon(kind: string): IconType {
  return KIND_ICON[kind] ?? GiOpenTreasureChest
}

/** 格式化服务端返回的已攒小时数（严禁使用本机时钟或倒计时）。 */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** 格式化每日预期产出：整数千分位，小数保留最多两位并去尾零。 */
export function formatPerDay(perDay: number): string {
  const rounded = Math.round(perDay * 100) / 100
  if (Number.isInteger(rounded)) return rounded.toLocaleString("en-US")
  const [intPart, fracPart] = rounded.toFixed(2).replace(/0+$/, "").split(".")
  return `${Number(intPart).toLocaleString("en-US")}.${fracPart}`
}

export interface MergedSupplyGain {
  resourceId: string
  kind: string
  label: string
  count: number
}

/** 将多个箱子领出的同种资源按 resourceId 合并汇总。 */
export function mergeSupplyGains(gains: readonly SupplyGain[]): MergedSupplyGain[] {
  const byId = new Map<string, MergedSupplyGain>()
  for (const gain of gains) {
    const prev = byId.get(gain.resourceId)
    if (prev) {
      prev.count += gain.count
    } else {
      byId.set(gain.resourceId, {
        resourceId: gain.resourceId,
        kind: gain.kind,
        label: gain.label,
        count: gain.count,
      })
    }
  }
  return [...byId.values()]
}

export function supplyGainsText(gains: readonly MergedSupplyGain[]): string {
  return gains.map((g) => `${g.label} ×${g.count.toLocaleString("en-US")}`).join("、")
}

export function SupplyGainsDialog({
  gains,
  onClose,
}: {
  gains: readonly SupplyGain[]
  onClose: () => void
}) {
  const merged = useMemo(() => mergeSupplyGains(gains), [gains])
  return (
    <FlatDialog title="已领取补给" onClose={onClose}>
      <ul className="supply-gains">
        {merged.map((item) => {
          const Icon = supplyIcon(item.kind)
          return (
            <li key={item.resourceId} className="supply-gains__row">
              <span className="supply-gains__name">
                <Icon className="supply-gains__icon" aria-hidden />
                {item.label}
              </span>
              <b className="bk-num fl-good">×{item.count.toLocaleString("en-US")}</b>
            </li>
          )
        })}
      </ul>
      <div className="supply-gains__foot">
        <button type="button" className="bk-btn bk-btn--main" onClick={onClose}>
          知道了
        </button>
      </div>
    </FlatDialog>
  )
}

export function useSupplyActions() {
  const { user, notify, refreshUser, refreshPacks } = useFlat()
  const [claiming, setClaiming] = useState(false)
  const [focusing, setFocusing] = useState(false)

  const claim = useCallback(async (): Promise<SupplyGain[] | null> => {
    if (claiming) return null
    setClaiming(true)
    try {
      const res = await claimSupply(user.id)
      applySupplyData(user.id, res.supply)
      playSfx("success")
      refreshUser()
      refreshPacks()
      const summary = supplyGainsText(mergeSupplyGains(res.gains))
      if (summary) notify(`已领取：${summary}`, "success")
      return res.gains
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "nothing_to_claim") {
        notify("还没攒到东西，过一会儿再来", "info")
        void refreshSupply()
      } else {
        notify(reason instanceof Error ? reason.message : "领取失败，请稍后再试", "error")
      }
      return null
    } finally {
      setClaiming(false)
    }
  }, [claiming, notify, refreshPacks, refreshUser, user.id])

  const chooseFocus = useCallback(
    async (focus: string | null, label?: string): Promise<boolean> => {
      if (focusing) return false
      setFocusing(true)
      try {
        const next = await setSupplyFocus(user.id, focus)
        applySupplyData(user.id, next)
        playSfx("tick")
        const resolvedLabel = label ?? next.focusOptions.find((o) => o.id === focus)?.label ?? focus
        notify(focus ? `已将倾向调整为「${resolvedLabel}」` : "已取消倾向，按均衡产出", "info")
        return true
      } catch (reason) {
        notify(reason instanceof Error ? reason.message : "切换倾向失败，请稍后再试", "error")
        void refreshSupply()
        return false
      } finally {
        setFocusing(false)
      }
    },
    [focusing, notify, user.id],
  )

  return { claiming, focusing, claim, chooseFocus }
}
