#!/usr/bin/env node
/**
 * 把 data/rankings.json 变成 apps/api/data/choke-cards.json
 *
 *   npx esbuild src/pool/index.ts --bundle --format=esm --platform=node \
 *     --outfile=.cache/pool.mjs --alias:@=./src
 *   node scripts/build-cards.mjs
 */

import fs from "node:fs"
import path from "node:path"

const { buildPool, defFromPool } = await import("../src/pool/index.ts")

const root = path.resolve(import.meta.dirname, "..")
const input = path.resolve(root, process.argv[2] ?? "data/rankings.json")
const output = path.resolve(root, process.argv[3] ?? "apps/api/data/choke-cards.json")

if (!fs.existsSync(input)) {
  console.error(`找不到 ${input}`)
  process.exit(1)
}

console.log(`读取 ${input}`)
const rows = JSON.parse(fs.readFileSync(input, "utf8"))
console.log(`玩家 ${rows.length} 条`)

const pool = buildPool(rows, { seed: 20261106 })
console.log("分池完成：", pool.assigned)

const cards = pool.cards.map((card) => {
  const def = defFromPool(card)
  return {
    id: def.id,
    osuId: def.osuId,
    name: def.name,
    rarity: def.rarity,
    job: def.job,
    no: def.no,
    total: def.total,
    country: def.country,
    globalRank: def.globalRank,
    pp: def.pp,
    profileUrl: def.profileUrl,
    art: def.art,
    banner: def.banner,
    skills: def.skills,
  }
})

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(cards))
console.log(`写出 ${cards.length} 张卡 → ${output}`)
