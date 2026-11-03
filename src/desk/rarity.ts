import type { CardData, PackPool, Rarity } from "./types"

export const RARITY_COLOR: Record<Rarity, string> = {
  C: "#8E97A6",
  UC: "#3CBADB",
  R: "#D9488A",
  E: "#FFC24B",
  L: "#B98CFF",
  Radiant: "#21E985",
  Prismatic: "#F4F4F6",
}

type WeightTable = [Rarity, number][]

/** 抽卡规则 v0.1：普通包 */
const NORMAL_WEIGHTS: WeightTable = [
  ["C", 45],
  ["UC", 24],
  ["R", 15],
  ["E", 10],
  ["L", 4],
  ["Radiant", 1.92],
  ["Prismatic", 0.08],
]

/** 挂机包 */
const IDLE_WEIGHTS: WeightTable = [
  ["C", 62],
  ["UC", 26],
  ["R", 9],
  ["E", 2.8],
  ["L", 0.2],
  ["Radiant", 0],
  ["Prismatic", 0],
]

/** 任务 / 黄金包 */
const QUEST_WEIGHTS: WeightTable = [
  ["C", 12],
  ["UC", 32],
  ["R", 28],
  ["E", 18],
  ["L", 8],
  ["Radiant", 1.92],
  ["Prismatic", 0.08],
]

/** 璀璨包 */
const RADIANT_WEIGHTS: WeightTable = [
  ["C", 0],
  ["UC", 15],
  ["R", 25],
  ["E", 30],
  ["L", 22],
  ["Radiant", 7.8],
  ["Prismatic", 0.2],
]

/** 天穹包 */
const SKY_WEIGHTS: WeightTable = [
  ["C", 0],
  ["UC", 0],
  ["R", 15],
  ["E", 30],
  ["L", 35],
  ["Radiant", 19.2],
  ["Prismatic", 0.8],
]

/** 棱彩包 */
const PRISM_WEIGHTS: WeightTable = [
  ["C", 0],
  ["UC", 0],
  ["R", 0],
  ["E", 10],
  ["L", 34],
  ["Radiant", 50],
  ["Prismatic", 6],
]

export interface PoolMeta {
  label: string
  short: string
  color: string
  weights: WeightTable
}

export const POOL_META: Record<PackPool, PoolMeta> = {
  normal: { label: "普通卡池", short: "普通", color: "#E5484D", weights: NORMAL_WEIGHTS },
  idle: { label: "挂机卡池", short: "挂机", color: "#3CBADB", weights: IDLE_WEIGHTS },
  quest: { label: "任务卡池", short: "任务", color: "#FFC24B", weights: QUEST_WEIGHTS },
  radiant: { label: "璀璨卡池", short: "璀璨", color: "#B98CFF", weights: RADIANT_WEIGHTS },
  sky: { label: "天穹卡池", short: "天穹", color: "#21E985", weights: SKY_WEIGHTS },
  prism: { label: "棱彩卡池", short: "棱彩", color: "#F4F4F6", weights: PRISM_WEIGHTS },
}

export const POOL_ORDER: PackPool[] = ["normal", "idle", "quest", "radiant", "sky", "prism"]

const NAMES = [
  "Freedom Dive",
  "Blue Zenith",
  "The Big Black",
  "Disconnected",
  "Hypermind",
  "Rrtyui Flow",
  "Galaxy Collapse",
  "Kaleidoscope",
  "Seiren",
  "Cirno's Perfect",
]

const MAPPERS = ["Cookiezi", "Mrekk", "Rafis", "Sotarks", "Hydra", "Tatsujin"]

function rollRarity(weights: WeightTable): Rarity {
  const total = weights.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [rarity, w] of weights) {
    r -= w
    if (r <= 0) return rarity
  }
  return "C"
}

export function rollPack(size = 5, pool: PackPool = "normal"): CardData[] {
  const weights = POOL_META[pool].weights
  return Array.from({ length: size }, () => {
    const rarity = rollRarity(weights)
    return {
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      mapper: MAPPERS[Math.floor(Math.random() * MAPPERS.length)],
      rarity,
    }
  })
}

export function isHoloRarity(r: Rarity): boolean {
  return r !== "C" && r !== "UC"
}
