import { RARITY_BASE } from "@/card/data"

import { gradePoints } from "./rarity"
import type { GradeCounts, HeroIndex } from "./types"

export interface HeroStats {
  /** play count */
  playCount: number
  /** total hits */
  totalHits: number
  level: number
  achievements: number
  rankedSetCount?: number | null
  grades?: GradeCounts | null
  pp?: number | null
}

/** /me/osu 里用得到的那一块。多出来的字段忽略。 */
export interface OsuSelf {
  username?: string
  cover?: { url?: string | null } | null
  ranked_beatmapset_count?: number
  user_achievements?: readonly unknown[]
  statistics?: {
    play_count?: number
    total_hits?: number
    pp?: number
    level?: { current?: number }
    grade_counts?: Partial<GradeCounts>
  }
}

const BANDS: { band: HeroIndex["band"]; min: number }[] = [
  { band: "L", min: 105 },
  { band: "E", min: 75 },
  { band: "R", min: 45 },
  { band: "UC", min: 0 },
]

function log10p(value: number): number {
  return Math.log10(1 + Math.max(0, value))
}

function gradesFromPartial(grades: Partial<GradeCounts> | undefined): GradeCounts | null {
  if (!grades) return null
  return {
    ssh: grades.ssh ?? 0,
    ss: grades.ss ?? 0,
    sh: grades.sh ?? 0,
    s: grades.s ?? 0,
    a: grades.a ?? 0,
  }
}

export function heroStatsFromOsu(user: OsuSelf): HeroStats {
  const statistics = user.statistics
  return {
    playCount: statistics?.play_count ?? 0,
    totalHits: statistics?.total_hits ?? 0,
    level: statistics?.level?.current ?? 1,
    achievements: user.user_achievements?.length ?? 0,
    rankedSetCount: user.ranked_beatmapset_count ?? null,
    grades: gradesFromPartial(statistics?.grade_counts),
    pp: statistics?.pp ?? null,
  }
}

/**
 * 本人卡指数。权重是起点，不是定稿。
 * PC / TTH / 等级 / 成就是主项；ranked set、等级分布、pp 有则加。
 */
export function heroIndex(stats: HeroStats): HeroIndex {
  let index =
    18 * log10p(stats.playCount) +
    14 * log10p(stats.totalHits) +
    1.2 * Math.max(0, stats.level) +
    8 * log10p(stats.achievements)
  if (stats.rankedSetCount != null && stats.rankedSetCount > 0) {
    index += 6 * log10p(stats.rankedSetCount)
  }
  if (stats.grades) index += 4 * log10p(gradePoints(stats.grades))
  if (stats.pp != null && stats.pp > 0) index += 5 * log10p(stats.pp)

  const band = BANDS.find((item) => index >= item.min)?.band ?? "UC"
  const bandIndex = BANDS.findIndex((item) => item.band === band)
  const upper = bandIndex === 0 ? index + 20 : BANDS[bandIndex - 1].min
  const lower = BANDS[bandIndex].min
  const t = Math.min(1, Math.max(0, (index - lower) / Math.max(1, upper - lower)))
  const power = Math.round(RARITY_BASE[band] * (0.9 + 0.2 * t))
  return { index: Math.round(index * 10) / 10, band, power }
}
