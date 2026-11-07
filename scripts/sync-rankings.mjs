#!/usr/bin/env node
/**
 * 叠加各国表现排行榜，按 pp 阈值截断，输出可直接导入 /pool-lab 的 JSON。
 *
 *   node scripts/sync-rankings.mjs --min-pp 2000
 *   node scripts/sync-rankings.mjs --countries CN,US,JP --min-pp 3000
 *   node scripts/sync-rankings.mjs --min-pp 2000 --followers data/mutualify.json
 *
 * 排行榜每行自带头像、封面、pp、排名、等级分布，不需要再逐个调 /users。
 * 缺的粉丝数用 --followers 从 Mutualify 导出里合并。
 */

import fs from "node:fs"
import path from "node:path"

const API = "https://osu.ppy.sh/api/v2"
const TOKEN_URL = "https://osu.ppy.sh/oauth/token"
const TOKEN_CACHE = path.resolve(".cache/osu-token.json")
const DEFAULT_OUT = path.resolve("data/rankings.json")

const COUNTRIES = (
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU " +
  "RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA " +
  "UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ")

loadEnv()
const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
  console.log(`用法:
  node scripts/sync-rankings.mjs [选项]

选项:
  --min-pp <n>       pp 下限，低于它的行停止翻页，默认 2000
  --countries <list> 国家代码，逗号分隔；all 表示全部，默认 all
  --active           只保留 is_active 为 true 的账号
  --max-pages <n>    每个国家最多翻多少页，默认 200
  --followers <file> Mutualify 导出，用于合并 followerCount
  --out <file>       输出文件，默认 data/rankings.json
  --rate <ms>        请求间隔，默认 1100ms
  --help             显示这段
`)
  process.exit(0)
}

const clientId = process.env.OSU_CLIENT_ID
const clientSecret = process.env.OSU_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error("缺少 OSU_CLIENT_ID / OSU_CLIENT_SECRET。先配置 .env。")
  process.exit(1)
}

const countries =
  opts.countries === "all" ? COUNTRIES : opts.countries.split(",").map((c) => c.trim().toUpperCase())
const token = await getToken()
const outFile = path.resolve(opts.out)
const doneFile = `${outFile}.progress.json`

const players = new Map()
const doneCountries = new Set()
let requests = 0
let pages = 0
let finishedCountries = 0

if (fs.existsSync(outFile)) {
  try {
    const rows = JSON.parse(fs.readFileSync(outFile, "utf8"))
    for (const row of rows) if (typeof row.osuId === "number") players.set(row.osuId, row)
    console.log(`续跑：已恢复 ${players.size} 人`)
  } catch {
    console.error(`${outFile} 读取失败，从空开始。`)
  }
}
if (fs.existsSync(doneFile)) {
  try {
    for (const code of JSON.parse(fs.readFileSync(doneFile, "utf8"))) doneCountries.add(code)
    console.log(`续跑：已完成 ${doneCountries.size} 个国家`)
  } catch {
    /* ignore */
  }
}

function flush() {
  const rows = [...players.values()].sort((a, b) => (b.pp ?? 0) - (a.pp ?? 0))
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(rows, null, 2))
  fs.writeFileSync(doneFile, JSON.stringify([...doneCountries]))
}

for (const country of countries) {
  if (doneCountries.has(country)) continue
  let page = 1
  let stop = false
  let complete = true
  while (!stop && page <= opts.maxPages) {
    const data = await fetchPage(country, page)
    requests += 1
    if (!data) {
      complete = false
      break
    }
    const rows = data.ranking ?? []
    if (rows.length === 0) break
    pages += 1

    for (const row of rows) {
      const user = row.user
      if (!user?.id) continue
      if (opts.active && user.is_active === false) continue
      const pp = row.pp ?? 0
      if (pp < opts.minPp) {
        stop = true
        break
      }
      players.set(user.id, toRow(row, country))
    }

    const tailPp = rows.at(-1)?.pp ?? 0
    if (tailPp < opts.minPp) stop = true
    page += 1
    if (!stop) await sleep(opts.rate)
  }
  const gained = [...players.values()].filter((p) => p.country === country).length
  if (complete) {
    doneCountries.add(country)
    finishedCountries += 1
  }
  if (finishedCountries % 10 === 0) flush()
  console.log(`\r${country}: ${gained} 人 · 累计 ${players.size} · ${requests} 次请求`)
}

if (opts.followers) {
  const byId = readFollowers(opts.followers)
  let matched = 0
  for (const row of players.values()) {
    const followers = byId.get(row.osuId)
    if (followers != null) {
      row.followerCount = followers
      matched += 1
    }
  }
  console.log(`\n粉丝数合并：${matched} / ${players.size} 匹配`)
}

const rows = [...players.values()].sort((a, b) => (b.pp ?? 0) - (a.pp ?? 0))
flush()

const withCover = rows.filter((r) => r.coverUrl).length
console.log(
  `完成：${rows.length} 人，${pages} 页，${requests} 次请求；有封面 ${withCover}，有粉丝数 ${rows.filter((r) => r.followerCount > 0).length}`,
)
console.log(`输出 ${outFile}`)

/* ------------------------------------------------------------------ */

function loadEnv(file = path.resolve(".env")) {
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value
  }
}

function parseArgs(argv) {
  const opts = {
    minPp: 2000,
    countries: "all",
    active: false,
    maxPages: 200,
    out: DEFAULT_OUT,
    rate: 1100,
  }
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
      case "--min-pp":
        opts.minPp = Number(next()) || 0
        break
      case "--countries":
        opts.countries = next()
        break
      case "--active":
        opts.active = true
        break
      case "--max-pages":
        opts.maxPages = Math.max(1, Number(next()) || 200)
        break
      case "--followers":
        opts.followers = next()
        break
      case "--out":
        opts.out = next()
        break
      case "--rate":
        opts.rate = Math.max(0, Number(next()) || 1100)
        break
      case "--help":
      case "-h":
        opts.help = true
        break
      default:
        console.error(`未知参数 ${arg}`)
        process.exit(1)
    }
  }
  return opts
}

async function getToken() {
  if (fs.existsSync(TOKEN_CACHE)) {
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
    console.error(`取 token 失败 ${res.status}: ${(await res.text()).slice(0, 200)}`)
    process.exit(1)
  }
  const data = await res.json()
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true })
  fs.writeFileSync(
    TOKEN_CACHE,
    JSON.stringify(
      { access_token: data.access_token, expires_at: Date.now() + (data.expires_in ?? 3600) * 1000 },
      null,
      2,
    ),
  )
  return data.access_token
}

async function fetchPage(country, page, attempt = 0) {
  let res
  try {
    res = await fetch(
      `${API}/rankings/osu/performance?country=${country}&page=${page}&filter=all`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
    )
  } catch (error) {
    if (attempt < 3) {
      await sleep(1500 * (attempt + 1))
      return fetchPage(country, page, attempt + 1)
    }
    console.error(`\n${country} page ${page} 连接失败: ${error.message}`)
    return null
  }
  if (res.status === 404) return null
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("retry-after")) * 1000 || 5000
    await sleep(Math.min(wait, 60_000))
    return fetchPage(country, page, attempt + 1)
  }
  if (!res.ok) {
    console.error(`\n${country} page ${page} 失败 HTTP ${res.status}`)
    return null
  }
  try {
    return await res.json()
  } catch {
    if (attempt < 3) {
      await sleep(1500 * (attempt + 1))
      return fetchPage(country, page, attempt + 1)
    }
    return null
  }
}

function toRow(row, country) {
  const user = row.user ?? {}
  const grades = row.grade_counts
  return {
    osuId: user.id,
    username: user.username,
    country: user.country_code ?? country,
    followerCount: null,
    globalRank: row.global_rank ?? null,
    pp: row.pp ?? null,
    mappingFollowers: null,
    rankedMaps: null,
    guestMaps: null,
    lovedMaps: null,
    rankedSetCount: null,
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
    isActive: user.is_active ?? null,
    lastVisit: user.last_visit ?? null,
    playCount: row.play_count ?? null,
    totalHits: row.total_hits ?? null,
    level: row.level?.current ?? null,
    snapshotAt: new Date().toISOString(),
  }
}

function readFollowers(file) {
  const data = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"))
  const rows = Array.isArray(data) ? data : (data.players ?? data.items ?? [])
  const map = new Map()
  for (const row of rows) {
    const id = typeof row === "number" ? row : (row.osuId ?? row.id)
    const count = typeof row === "number" ? null : (row.followerCount ?? row.follower_count)
    if (typeof id === "number" && typeof count === "number") map.set(id, count)
  }
  return map
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
