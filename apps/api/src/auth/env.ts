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
export const SESSION_SECRET = process.env.SESSION_SECRET ?? CLIENT_SECRET ?? "choke-dev"
export const COOKIE_NAME = "choke_session"
