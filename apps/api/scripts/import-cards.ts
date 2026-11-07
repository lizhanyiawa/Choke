import fs from "node:fs"
import path from "node:path"

import { db } from "../src/db/client"
import { cards } from "../src/db/schema"
import { invalidateCardCache } from "../src/gacha/open"

interface CardDefRow {
  id: string
  osuId: number | null
  name: string
  rarity: string
  job: string
  no: number
  total: number
  country?: string
  globalRank?: number | null
  pp?: number | null
  profileUrl?: string
  art?: string
  banner?: string
  skills: unknown[]
}

const file = path.resolve(process.argv[2] ?? "data/choke-cards.json")

if (!fs.existsSync(file)) {
  console.error(`找不到 ${file}`)
  console.error("先用 /pool-lab 的「导出卡定义」生成，或传一个 JSON 路径。")
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown
if (!Array.isArray(raw)) {
  console.error("输入必须是 CardDefRow[] 数组")
  process.exit(1)
}

const rows = (raw as CardDefRow[]).filter((row) => row && row.id && row.rarity && row.name)
console.log(`读取 ${rows.length} 条卡定义`)

const BATCH = 500
let done = 0

if (process.argv.includes("--replace")) {
  console.log("清空 cards 表")
  await db.delete(cards)
}

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH).map((row) => ({
    id: row.id,
    osuId: row.osuId ?? null,
    name: row.name,
    rarity: row.rarity,
    job: row.job,
    no: row.no,
    total: row.total,
    country: row.country ?? null,
    globalRank: row.globalRank ?? null,
    pp: row.pp == null ? null : String(row.pp),
    profileUrl: row.profileUrl ?? null,
    art: row.art ?? null,
    banner: row.banner ?? null,
    skills: row.skills,
    version: 1,
  }))

  await db.insert(cards).values(batch).onConflictDoNothing()

  done += batch.length
  console.log(`已导入 ${done}/${rows.length}`)
}

invalidateCardCache()
console.log("完成")
process.exit(0)
