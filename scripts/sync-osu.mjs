#!/usr/bin/env node
/**
 * 从 osu! API v2 同步玩家资料，输出给 /pool-lab 用的 JSON。
 *
 *   node scripts/sync-osu.mjs --from mutualify-pool.json
 *   node scripts/sync-osu.mjs --ids ids.txt --limit 500
 *
 * 需要在项目根目录的 .env 里放：
 *   OSU_CLIENT_ID=...
 *   OSU_CLIENT_SECRET=...
 *
 * 只有 client credentials，不需要玩家的 OAuth。scope 用 public。
 */

import fs from "node:fs"
import path from "node:path"

const API = "https://osu.ppy.sh/api/v2"
const TOKEN_URL = "https://osu.ppy.sh/oauth/token"
const TOKEN_CACHE = path.resolve(".cache/osu-token.json")
const DEFAULT_OUT = path.resolve("data/osu-players.json")
const DEFAULT_RATE = 1100

loadEnv()

const opts = parseArgs(process.argv.slice(2))

if (opts.help) {
  console.log(`用法:
  node scripts/sync-osu.mjs --from <file> [选项]
  node scripts/sync-osu.mjs --ids <file>  [选项]

选项:
  --from <file>   输入 JSON（Mutualify 导出 / gacha 导出）或纯文本 id 列表
  --ids <file>    额外 id 列表，每行一个
  --out <file>    输出文件，默认 data/osu-players.json
  --limit <n>     本次最多处理 n 个输入
  --rankings <n>  从 osu! 表现排行榜补充前 n 个玩家 id
  --rankings-page <n> 从排行榜第 n 页开始取，默认 1
  --rate <ms>     每次请求间隔，默认 ${DEFAULT_RATE}ms（官方建议约 1 次/秒）
  --refresh       不跳过输出里已有的玩家
  --no-cache      忽略 .cache/osu-token.json
  --help          显示这段

没有 --from 也没有 --ids 时，从 stdin 读 id。
`)
  process.exit(0)
}

const clientId = process.env.OSU_CLIENT_ID
const clientSecret = process.env.OSU_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error("缺少 OSU_CLIENT_ID / OSU_CLIENT_SECRET。复制 .env.example 为 .env 再填。")
  process.exit(1)
}

const ids = await collectIds()

let token
try {
  token = await getToken()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

if (opts.rankings) {
  const ranked = await fetchRankings(opts.rankings, token, opts.rankingsPage ?? 1)
  ids.push(...ranked)
  console.log(`排行榜第 ${opts.rankingsPage ?? 1} 页起补充 ${ranked.length} 个 id`)
}

const uniqueIds = [...new Set(ids)]
if (uniqueIds.length === 0) {
  console.error("没有可处理的玩家 id。")
  process.exit(1)
}

const outFile = path.resolve(opts.out)
const existing = await readOutput(outFile)
const done = new Set(existing.map((row) => row.osuId))
const todo = opts.refresh ? uniqueIds : uniqueIds.filter((id) => !done.has(id))
const batch = opts.limit ? todo.slice(0, opts.limit) : todo

console.log(
  `输入 ${uniqueIds.length} 个，已完成 ${uniqueIds.length - todo.length} 个，本次处理 ${batch.length} 个，输出 ${outFile}`,
)
console.log(`间隔 ${opts.rate}ms，预计 ${formatDuration(batch.length * opts.rate)}`)

let ok = 0
let skipped = 0
let failed = 0
let fresh = [...existing]
const freshIndex = new Map(fresh.map((row, i) => [row.osuId, i]))

process.on("SIGINT", () => {
  flush()
  console.log(`\n已中断，写盘 ${fresh.length} 条。`)
  process.exit(130)
})

for (let i = 0; i < batch.length; i += 1) {
  const id = batch[i]
  try {
    const result = await fetchUser(id, () => token, (next) => (token = next))
    if (result === "gone") {
      skipped += 1
    } else {
      const row = toRow(result)
      const at = freshIndex.get(row.osuId)
      if (at == null) {
        freshIndex.set(row.osuId, fresh.length)
        fresh.push(row)
      } else {
        fresh[at] = row
      }
      ok += 1
    }
  } catch (error) {
    failed += 1
    console.error(`\n[${i + 1}/${batch.length}] ${id} 失败: ${error.message}`)
    if (error.fatal) {
      flush()
      process.exit(1)
    }
  }

  if ((i + 1) % 25 === 0) flush()
  progress(i + 1, batch.length, ok, skipped, failed)
  if (i < batch.length - 1) await sleep(opts.rate)
}

flush()
console.log(`\n完成：新增/更新 ${ok}，跳过 ${skipped}，失败 ${failed}，文件共 ${fresh.length} 条。`)
console.log(`下一步：在 /pool-lab 导入 ${outFile}`)

/* ------------------------------------------------------------------ */

function loadEnv(file = path.resolve(".env")) {
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    let value = match[2]
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value
  }
}

function parseArgs(argv) {
  const opts = { rate: DEFAULT_RATE, out: DEFAULT_OUT, limit: 0, refresh: false, cache: true }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value == null) {
        console.error(`${arg} 需要参数`)
        process.exit(1)
      }
      i += 1
      return value
    }
    switch (arg) {
      case "--from":
        opts.from = next()
        break
      case "--ids":
        opts.ids = next()
        break
      case "--out":
        opts.out = next()
        break
      case "--limit":
        opts.limit = Number(next()) || 0
        break
      case "--rankings":
        opts.rankings = Number(next()) || 0
        break
      case "--rankings-page":
        opts.rankingsPage = Math.max(1, Number(next()) || 1)
        break
      case "--rate":
        opts.rate = Math.max(0, Number(next()) || DEFAULT_RATE)
        break
      case "--refresh":
        opts.refresh = true
        break
      case "--no-cache":
        opts.cache = false
        break
      case "--help":
      case "-h":
        opts.help = true
        break
      default:
        if (arg.startsWith("-")) {
          console.error(`未知参数 ${arg}`)
          process.exit(1)
        }
        opts.from ??= arg
    }
  }
  return opts
}

async function collectIds() {
  const list = []
  if (opts.from) list.push(...readIds(opts.from))
  if (opts.ids) list.push(...readIds(opts.ids))
  if (!opts.from && !opts.ids) {
    const text = await readStdin()
    list.push(...text.split(/\s+/).map(toId).filter((id) => id != null))
  }
  return [...new Set(list)]
}

function readIds(file) {
  const text = fs.readFileSync(path.resolve(file), "utf8").replace(/^\uFEFF/, "")
  try {
    const data = JSON.parse(text)
    const rows = Array.isArray(data) ? data : (data.players ?? data.items ?? data.rows ?? [])
    return rows.map((row) => (typeof row === "number" ? row : (row.osuId ?? row.id))).map(toId).filter((id) => id != null)
  } catch {
    return text.split(/\s+/).map(toId).filter((id) => id != null)
  }
}

function toId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(/^@/, "")
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return null
}

async function readStdin() {
  if (process.stdin.isTTY) return ""
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

async function readOutput(file) {
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"))
    return Array.isArray(data) ? data : (data.players ?? [])
  } catch {
    console.error(`${file} 不是合法 JSON，本次会覆盖它。`)
    return []
  }
}

function flush() {
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(fresh, null, 2))
}

async function getToken(force = false) {
  if (!force && opts.cache && fs.existsSync(TOKEN_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, "utf8"))
      if (cached.access_token && cached.expires_at > Date.now() + 60_000) return cached.access_token
    } catch {
      /* ignore */
    }
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "public",
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    const error = new Error(`取 token 失败 ${res.status}: ${text.slice(0, 200)}`)
    error.fatal = true
    throw error
  }
  const data = await res.json()
  if (opts.cache) {
    fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true })
    fs.writeFileSync(
      TOKEN_CACHE,
      JSON.stringify(
        { access_token: data.access_token, expires_at: Date.now() + (data.expires_in ?? 3600) * 1000 },
        null,
        2,
      ),
    )
  }
  return data.access_token
}

async function fetchUser(id, getCurrentToken, setToken, attempt = 0) {  const token = await getCurrentToken()
  const res = await fetch(`${API}/users/${id}/osu`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  })

  if (res.status === 404) return "gone"

  if (res.status === 401 && attempt === 0) {
    const next = await getToken(true)
    setToken(next)
    return fetchUser(id, getCurrentToken, setToken, attempt + 1)
  }

  if (res.status === 429 && attempt < 4) {
    const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1)
    await sleep(Math.min(wait, 60_000))
    return fetchUser(id, getCurrentToken, setToken, attempt + 1)
  }

  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`)
    if (res.status === 403) error.fatal = true
    throw error
  }

  return res.json()
}

async function fetchRankings(limit, token, page = 1, collected = [], seen = new Set()) {
  if (collected.length >= limit) return collected.slice(0, limit)
  const res = await fetch(`${API}/rankings/osu/performance?page=${page}&filter=all`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  })
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after")) * 1000 || 5000
    await sleep(Math.min(wait, 60_000))
    return fetchRankings(limit, token, page, collected, seen)
  }
  if (!res.ok) {
    console.error(`排行榜拉取失败 HTTP ${res.status}，跳过这一部分。`)
    return collected.slice(0, limit)
  }
  const data = await res.json()
  const rows = data.ranking ?? []
  let added = 0
  for (const row of rows) {
    const id = row.user?.id
    if (typeof id === "number" && !seen.has(id)) {
      seen.add(id)
      collected.push(id)
      added += 1
    }
    if (collected.length >= limit) break
  }
  // 超过约 200 页后接口会重复返回最后一页，added 为 0 就停。
  if (added === 0 || page >= 200) return collected.slice(0, limit)
  if (collected.length >= limit) return collected.slice(0, limit)
  await sleep(opts.rate)
  return fetchRankings(limit, token, page + 1, collected, seen)
}

function toRow(user) {
  const stats = user.statistics ?? {}
  const grades = stats.grade_counts
  return {
    osuId: user.id,
    username: user.username,
    country: user.country_code ?? "",
    title: user.title ?? null,
    followerCount: user.follower_count ?? 0,
    globalRank: stats.global_rank ?? null,
    mappingFollowers: user.mapping_follower_count ?? null,
    rankedMaps: user.ranked_beatmapset_count ?? null,
    guestMaps: user.guest_beatmapset_count ?? null,
    lovedMaps: user.loved_beatmapset_count ?? null,
    pp: stats.pp ?? null,
    rankedSetCount: user.ranked_beatmapset_count ?? null,
    grades: grades
      ? {
          ssh: grades.ssh ?? 0,
          ss: grades.ss ?? 0,
          sh: grades.sh ?? 0,
          s: grades.s ?? 0,
          a: grades.a ?? 0,
        }
      : null,
    avatarUrl: user.avatar_url ?? null,
    coverUrl: user.cover?.url ?? null,
    lastSyncedAt: new Date().toISOString(),
  }
}

function progress(done, total, ok, skipped, failed) {
  const percent = ((done / total) * 100).toFixed(1)
  process.stdout.write(
    `\r[${done}/${total}] ${percent}%  ok ${ok} · gone ${skipped} · fail ${failed}   `,
  )
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 90) return `${seconds} 秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes} 分钟`
  return `${(minutes / 60).toFixed(1)} 小时`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
