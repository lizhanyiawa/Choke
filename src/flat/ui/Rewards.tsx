import type { CSSProperties } from "react"
import type { IconType } from "react-icons"
import {
  GiCardRandom,
  GiCrystalShine,
  GiCutDiamond,
  GiOpenTreasureChest,
  GiTwoCoins,
  GiUpgrade,
} from "react-icons/gi"

import { RARITY_COLOR } from "@/desk/lib/rarity"
import { CONTENT, MYSTERY_PACK_ID, type ItemStack, type PackId } from "@choke/shared/content"
import type { Reward } from "@choke/shared/expedition/content"
import { ITEMS, isItemId } from "@choke/shared/items"
import type { MailAttachmentLine } from "@choke/shared/mail"

const LINE_ICON: Record<MailAttachmentLine["kind"], IconType> = {
  coins: GiTwoCoins,
  essence: GiCutDiamond,
  playerExp: GiUpgrade,
  item: GiCrystalShine,
  pack: GiOpenTreasureChest,
  card: GiCardRandom,
}

const count = (n: number) => n.toLocaleString("en-US")

/** 物品的名字；内容表里没有的 id 原样显示 */
export function itemName(itemId: string): string {
  return isItemId(itemId) ? ITEMS[itemId].name : itemId
}

/** 卡包的名字（普通卡包、挂机卡包、神秘卡包……）；内容表里没有的 id 原样显示 */
export function packName(pool: string): string {
  if (pool === MYSTERY_PACK_ID) return CONTENT.packs.mystery.name
  return Object.hasOwn(CONTENT.packs.packs, pool) ? CONTENT.packs.packs[pool as PackId].name : pool
}

/** 「金币 ×50、普通卡包 ×2」：提示条里写拿到了什么 */
export function rewardText(lines: readonly MailAttachmentLine[]): string {
  return lines.map((line) => `${line.label} ×${count(line.count)}`).join("、")
}

/** 同上，给物品堆用（商店的产出） */
export function stackText(stacks: readonly ItemStack[]): string {
  return stacks.map((stack) => `${itemName(stack.itemId)} ×${count(stack.count)}`).join("、")
}

/**
 * 一份还没发到账上的奖励（远征路上攒下的那种）排成和服务端一样的奖励行，好交给 RewardChips。
 * 名字和服务端写的是同一批；卡牌的名字要查卡池，这里只说张数。
 */
export function rewardLines(reward: Reward): MailAttachmentLine[] {
  const lines: MailAttachmentLine[] = []
  if (reward.coins) lines.push({ kind: "coins", label: "金币", count: reward.coins })
  if (reward.essence) lines.push({ kind: "essence", label: "闪卡精华", count: reward.essence })
  if (reward.playerExp) lines.push({ kind: "playerExp", label: "玩家经验", count: reward.playerExp })
  if (reward.cardExp) lines.push({ kind: "playerExp", label: "出战卡经验", count: reward.cardExp })
  if (reward.expPool) lines.push({ kind: "playerExp", label: "经验池", count: reward.expPool })
  for (const stack of reward.items ?? []) {
    lines.push({ kind: "item", label: itemName(stack.itemId), count: stack.count })
  }
  for (const pack of reward.packs ?? []) {
    lines.push({ kind: "pack", label: packName(pack.pool), count: pack.count })
  }
  const cards = (reward.cards ?? []).reduce((sum, card) => sum + card.count, 0)
  if (cards > 0) lines.push({ kind: "card", label: "卡牌", count: cards })
  return lines
}

/**
 * 服务端解析好的奖励行排成一排小签。任务、活跃度宝箱、签到的奖励都是这个形状，
 * 名字已经在 label 里，这里只配图标。
 */
export function RewardChips({
  lines,
  className,
}: {
  lines: readonly MailAttachmentLine[]
  className?: string
}) {
  if (lines.length === 0) return null
  return (
    <span className={`fl-chips ${className ?? ""}`}>
      {lines.map((line, index) => {
        const Icon = LINE_ICON[line.kind]
        return (
          <span className="fl-chip" key={`${line.kind}-${line.label}-${index}`}>
            <Icon className="fl-chip__icon" aria-hidden />
            {line.foil ? `${line.label}（闪）` : line.label}
            <b>×{count(line.count)}</b>
          </span>
        )
      })}
    </span>
  )
}

/** 物品堆排成一排小签；碎片前面带它那个品质的色点。商店的价格和产出用 */
export function StackChips({
  stacks,
  className,
}: {
  stacks: readonly ItemStack[]
  className?: string
}) {
  if (stacks.length === 0) return null
  return (
    <span className={`fl-chips ${className ?? ""}`}>
      {stacks.map((stack) => {
        const rarity = isItemId(stack.itemId) ? ITEMS[stack.itemId].rarity : undefined
        return (
          <span className="fl-chip" key={stack.itemId}>
            {rarity && <i style={{ "--c": RARITY_COLOR[rarity] } as CSSProperties} aria-hidden />}
            {itemName(stack.itemId)}
            <b>×{count(stack.count)}</b>
          </span>
        )
      })}
    </span>
  )
}
