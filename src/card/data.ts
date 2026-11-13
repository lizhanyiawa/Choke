import { cardSkillsFor } from "./jobs"
import type { CardFaceData, CardSkill, Job, Mod, Rarity, StarState } from "./types"

/** 十二种 MOD；卡面只显示前三个，多余的收进 +N */
export const MOD_LIST: Mod[] = [
  "HD",
  "HR",
  "DT",
  "FL",
  "NC",
  "EZ",
  "HT",
  "NF",
  "SD",
  "PF",
  "SO",
  "CL",
]

export const MOD_COLOR: Record<Mod, string> = {
  HD: "#d4a64a",
  HR: "#d4574a",
  DT: "#9b78de",
  FL: "#5b6ee1",
  NC: "#e06aa8",
  EZ: "#4fa86a",
  HT: "#3fa6a0",
  NF: "#8a8f98",
  SD: "#b33a3a",
  PF: "#b8c4d4",
  SO: "#a87b4a",
  CL: "#4a8fd4",
}

/** 卡名越长字号越小；8 字符以内保持 8.2cqw */
export function nameSizeOf(name: string): number {
  const len = name.length
  if (len <= 8) return 8.2
  if (len <= 12) return 7.2
  if (len <= 16) return 6.4
  if (len <= 20) return 5.6
  return 5
}

export function flagUrl(code: string | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null
  return `https://flagcdn.com/${code.toLowerCase()}.svg`
}


/** 七档品质基础值；压缩比固定 3.5×（C 400 → Prismatic 1,400） */
export const RARITY_BASE: Record<Rarity, number> = {
  C: 400,
  UC: 480,
  R: 600,
  E: 740,
  L: 960,
  Radiant: 1160,
  Prismatic: 1400,
}

/** 命座单颗收益率：品阶越低越高，满命 E ≈ 4 命 L */
export const CONSTELLATION_BONUS: Record<Rarity, number> = {
  C: 0.1,
  UC: 0.09,
  R: 0.08,
  E: 0.07,
  L: 0.05,
  Radiant: 0.04,
  Prismatic: 0.03,
}

export const RARITY_LABEL: Record<Rarity, string> = {
  C: "COMMON",
  UC: "UNCOMMON",
  R: "RARE",
  E: "EPIC",
  L: "LEGENDARY",
  Radiant: "RADIANT",
  Prismatic: "PRISMATIC",
}

export const ELEMENT_LABEL: Record<string, string> = {
  metal: "金",
  wood: "木",
  earth: "土",
  ice: "冰",
  fire: "火",
  thunder: "雷",
  light: "光",
  dark: "暗",
  physical: "物",
}

export const ELEMENT_COLOR: Record<string, string> = {
  metal: "#B49744",
  wood: "#4C8F55",
  earth: "#9B7147",
  ice: "#6FAFD6",
  fire: "#C94F3B",
  thunder: "#C9A62F",
  light: "#D8C979",
  dark: "#7A63A8",
  physical: "#8A9099",
}

export const JOB_LABEL: Record<string, string> = {
  tank: "坦克",
  warrior: "战士",
  mage: "法师",
  support: "辅助",
}

export const JOB_COLOR: Record<string, string> = {
  tank: "#5E7A8C",
  warrior: "#B23F35",
  mage: "#7B5AA6",
  support: "#3A8C8C",
}

const BP_TIER = [
  { min: 2000, color: "#8A5BC0" },
  { min: 1700, color: "#3E62AE" },
  { min: 1400, color: "#2C8A9E" },
  { min: 1100, color: "#3C8552" },
  { min: 800, color: "#B39227" },
  { min: 500, color: "#BC7327" },
  { min: 0, color: "#B34733" },
]

export function bpColor(bp: number): string {
  const tier = BP_TIER.find((t) => bp >= t.min) ?? BP_TIER[BP_TIER.length - 1]
  return tier.color
}

/** 本体卡：lv1–6 每级 +3%，lv7–12 每级 +20% 复利，满级 ≈ 1,409 */
export function battlePower(card: CardFaceData): number {
  if (card.isHero) {
    const lv = Math.min(Math.max(card.level, 1), 12)
    const factor = lv <= 6 ? 1 + 0.03 * (lv - 1) : 1.18 * 1.2 ** (lv - 6)
    const bonus = 1 + (card.heroBonus ?? 0) / 10000
    return Math.round(400 * factor * bonus)
  }
  const levelFactor = 1 + 0.06 * (Math.max(card.level, 1) - 1)
  const starFactor = 1 + CONSTELLATION_BONUS[card.rarity] * card.constellation
  return Math.round(RARITY_BASE[card.rarity] * levelFactor * starFactor)
}

/** 六颗星；本体卡每颗两档（铜 → 虹彩） */
export function starStates(card: CardFaceData): StarState[] {
  if (card.isHero) {
    const lv = Math.min(card.constellation, 12)
    return Array.from({ length: 6 }, (_, i) => {
      const step = lv - i * 2
      return step >= 2 ? "prism" : step >= 1 ? "copper" : "empty"
    })
  }
  return Array.from({ length: 6 }, (_, i) =>
    i < Math.min(card.constellation, 6) ? "copper" : "empty"
  )
}

export function formatNo(no: number, total: number): string {
  const width = String(total).length
  return `${String(no).padStart(width, "0")}/${total}`
}

type CardInit = Omit<CardFaceData, "no" | "total"> & { no?: number; total?: number }

export function makeCard(init: CardInit): CardFaceData {
  return { no: 1, total: 100000, ...init }
}

export const JOB_ORDER: Job[] = ["tank", "warrior", "mage", "support"]

const SKILL_SETS: Record<Job, CardSkill[]> = {
  tank: [
    { name: "铁壁", element: "earth", ap: 1 },
    { name: "反震", element: "metal", ap: 0, passive: true },
    { name: "震地", element: "earth", ap: 2 },
  ],
  warrior: [
    { name: "裂空斩", element: "physical", ap: 2 },
    { name: "追风", element: "thunder", ap: 1 },
    { name: "血怒", element: "dark", ap: 0, passive: true },
  ],
  mage: [
    { name: "霜缚", element: "ice", ap: 1, mp: 3 },
    { name: "星火", element: "fire", ap: 2, mp: 5 },
    { name: "静默", element: "light", ap: 2, mp: 4 },
  ],
  support: [
    { name: "回响", element: "light", ap: 1 },
    { name: "庇护", element: "wood", ap: 1, mp: 2 },
    { name: "共鸣", element: "light", ap: 0, passive: true },
  ],
}

/** 按职业/子职业 + 稀有度取技能；seed 相同则结果恒定 */
export function skillsFor(job: Job, rarity: Rarity, wantThree = false, seed?: string): CardSkill[] {
  if (seed) return cardSkillsFor(seed, job, rarity, wantThree)

  const pool = SKILL_SETS[job]
  const count = rarity === "Radiant" || rarity === "Prismatic" || wantThree ? 3 : 2
  return pool.slice(0, count)
}

export function hashOf(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export const DEMO_CARDS: CardFaceData[] = [
  makeCard({
    id: "demo-common",
    name: "Cookiezi",
    country: "KR",
    globalRank: 104,
    pp: 18670,
    profileUrl: "https://osu.ppy.sh/users/124493",
    art: "https://a.ppy.sh/124493",
    banner:
      "https://assets.ppy.sh/user-cover-presets/6/a7d51a05cb3c08a43531dfa8dc99c2fc7fe0d8cfce2756c340f11b3683b5d3bf.jpeg",
    rarity: "C",
    job: "tank",
    level: 12,
    mods: [],
    constellation: 0,
    no: 12,
    skills: [...SKILL_SETS.tank.slice(0, 2)],
  }),
  makeCard({
    id: "demo-uncommon",
    name: "Vaxei",
    country: "US",
    globalRank: 115,
    pp: 18594,
    profileUrl: "https://osu.ppy.sh/users/4787150",
    art: "https://a.ppy.sh/4787150",
    banner:
      "https://assets.ppy.sh/user-cover-presets/7/4a0ccb7b7fdd5c4238b11f0e7c686760fe2c99c6472b19400e82d1a8ff503e31.jpeg",
    rarity: "UC",
    job: "support",
    level: 24,
    mods: ["HD"],
    constellation: 1,
    no: 208,
    skills: [...SKILL_SETS.support.slice(0, 2)],
  }),
  makeCard({
    id: "demo-rare",
    name: "Rafis",
    country: "PL",
    globalRank: 240,
    pp: 16388,
    profileUrl: "https://osu.ppy.sh/users/2558286",
    art: "https://a.ppy.sh/2558286",
    banner:
      "https://assets.ppy.sh/user-profile-covers/2558286/96b3a5d690f24889e4c3adb3b8eb1bde1df3a60de0f2866f6d19629d255b8dc6.jpeg",
    rarity: "R",
    job: "warrior",
    level: 40,
    mods: ["SD"],
    constellation: 2,
    no: 1471,
    skills: [...SKILL_SETS.warrior],
  }),
  makeCard({
    id: "demo-epic",
    name: "WhiteCat",
    country: "DE",
    globalRank: 53,
    pp: 20212,
    profileUrl: "https://osu.ppy.sh/users/4504101",
    art: "https://a.ppy.sh/4504101",
    banner:
      "https://assets.ppy.sh/user-profile-covers/4504101/1072f8933a2ca39f2eec43fbc9bcbdeeec11dd7288a5679c55a5c6b61b470eb8.png",
    rarity: "E",
    job: "mage",
    level: 56,
    mods: ["HD", "DT"],
    constellation: 3,
    no: 8320,
    skills: [...SKILL_SETS.mage],
  }),
  makeCard({
    id: "demo-legendary",
    name: "Mrekk",
    country: "AU",
    globalRank: 1,
    pp: 32269,
    profileUrl: "https://osu.ppy.sh/users/7562902",
    art: "https://a.ppy.sh/7562902",
    banner:
      "https://assets.ppy.sh/user-cover-presets/3/32ddb3eb261e38a82067f9ef4ea96c12f6abf8bd228e6413330f9d351420301b.jpeg",
    rarity: "L",
    job: "warrior",
    level: 68,
    mods: ["HD", "SD", "DT"],
    constellation: 4,
    no: 20155,
    skills: [...SKILL_SETS.warrior],
  }),
  makeCard({
    id: "demo-radiant",
    name: "Sotarks",
    country: "FR",
    globalRank: 50458,
    pp: 6512,
    profileUrl: "https://osu.ppy.sh/users/4452992",
    art: "https://a.ppy.sh/4452992",
    banner:
      "https://assets.ppy.sh/user-profile-covers/4452992/6930dde80f0cbe68e142f403e551493b83c74f1f58e3e35f81cfc3944d24fd65.jpeg",
    rarity: "Radiant",
    job: "support",
    level: 74,
    mods: ["DT"],
    constellation: 5,
    no: 48207,
    skills: [...SKILL_SETS.support],
  }),
  makeCard({
    id: "demo-prismatic",
    name: "Toke",
    country: "JP",
    globalRank: 12000,
    pp: 9800,
    profileUrl: "https://osu.ppy.sh/users/13211727",
    art: "https://a.ppy.sh/13211727",
    banner:
      "https://assets.ppy.sh/user-profile-covers/13211727/ec423b7ed5525d44df091c164f2f3546943ae68ec5a8febd2a463c3479ab7018.png",
    rarity: "Prismatic",
    job: "mage",
    level: 80,
    mods: ["HD", "DT"],
    constellation: 6,
    no: 99999,
    skills: [...SKILL_SETS.mage],
  }),
]
