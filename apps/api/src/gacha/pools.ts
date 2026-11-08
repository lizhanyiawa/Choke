export type PoolId = "normal" | "idle" | "golden" | "radiant" | "sky" | "prism"

export const POOL_WEIGHTS: Record<PoolId, Record<string, number>> = {
  normal: { C: 45, UC: 24, R: 15, E: 10, L: 4, Radiant: 1.92, Prismatic: 0.08 },
  idle: { C: 62, UC: 26, R: 9, E: 2.8, L: 0.2 },
  golden: { C: 12, UC: 32, R: 28, E: 18, L: 8, Radiant: 1.92, Prismatic: 0.08 },
  radiant: { UC: 15, R: 25, E: 30, L: 22, Radiant: 7.8, Prismatic: 0.2 },
  sky: { R: 15, E: 30, L: 35, Radiant: 19.2, Prismatic: 0.8 },
  prism: { E: 10, L: 34, Radiant: 50, Prismatic: 6 },
}

export const POOL_NAMES: Record<PoolId, string> = {
  normal: "普通卡包",
  idle: "挂机卡包",
  golden: "黄金卡包",
  radiant: "璀璨卡包",
  sky: "天穹卡包",
  prism: "棱彩卡包",
}

/** 每个卡包的单抽闪卡概率。低概率，但任何稀有度都可能闪。 */
export const FOIL_RATE: Record<PoolId, number> = {
  normal: 0.03,
  idle: 0.012,
  golden: 0.05,
  radiant: 0.08,
  sky: 0.1,
  prism: 0.15,
}

/** 每抽的保底阈值：连续 N 抽没出 L 及以上，第 N 抽强制 L */
export const PITY_THRESHOLD = 60

/** 60 抽保底给的最低档 */
export const PITY_RARITY = "L"

export const RARITY_ORDER = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"] as const

export function rollRarity(pool: PoolId, random: () => number): string {
  const weights = POOL_WEIGHTS[pool]
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0)
  let pick = random() * total
  for (const rarity of RARITY_ORDER) {
    const weight = weights[rarity] ?? 0
    if (weight <= 0) continue
    pick -= weight
    if (pick <= 0) return rarity
  }
  return "C"
}

/** 确定性 RNG，回放和审计用得到 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
