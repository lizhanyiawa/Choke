import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

function findEnv(start: string): string | null {
  let dir = start
  for (let i = 0; i < 4; i += 1) {
    const file = path.join(dir, ".env")
    if (fs.existsSync(file)) return file
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const file = findEnv(process.cwd())
if (file) {
  for (const line of fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const value = match[2].replace(/^["']|["']$/g, "")
    if (!(match[1] in process.env)) process.env[match[1]] = value
  }
}

export const CLIENT_ID = process.env.OSU_CLIENT_ID ?? ""
export const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET ?? ""
export const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3100"
export const WEB_BASE = process.env.WEB_BASE_URL ?? "http://localhost:5173"
export const REDIRECT_URI = `${API_BASE}/auth/osu/callback`

/**
 * session 签名密钥：显式配置 > osu! client secret > 本次进程的随机值。
 * 不能落到空串或写死的常量上，否则任何人都能自己签出别人的 cookie。
 */
function sessionSecret(): string {
  const explicit = process.env.SESSION_SECRET?.trim()
  if (explicit) return explicit
  if (CLIENT_SECRET) return CLIENT_SECRET
  console.warn(
    "[auth] SESSION_SECRET 和 OSU_CLIENT_SECRET 都没有配置：本次进程使用随机签名密钥，重启后登录态全部失效。",
  )
  return crypto.randomBytes(32).toString("hex")
}

export const SESSION_SECRET = sessionSecret()
export const COOKIE_NAME = "choke_session"
