import crypto from "node:crypto"

import {
  CLIENT_ID,
  CLIENT_SECRET,
  COOKIE_NAME,
  REDIRECT_URI,
  SESSION_SECRET,
} from "./env"

const AUTHORIZE = "https://osu.ppy.sh/oauth/authorize"
const TOKEN = "https://osu.ppy.sh/oauth/token"
const ME = "https://osu.ppy.sh/api/v2/me/osu"

const states = new Set<string>()

export function createState(): string {
  const state = crypto.randomBytes(16).toString("hex")
  states.add(state)
  if (states.size > 500) {
    const first = states.values().next().value
    if (first) states.delete(first)
  }
  return state
}

export function consumeState(state: string | undefined): boolean {
  if (!state || !states.has(state)) return false
  states.delete(state)
  return true
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state,
  })
  return `${AUTHORIZE}?${params.toString()}`
}

export interface OsuMe {
  id: number
  username: string
  avatar_url: string
  country_code: string
}

export async function exchangeCode(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  })
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    throw new Error(`换 token 失败 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export async function fetchMe(accessToken: string): Promise<OsuMe> {
  const res = await fetch(ME, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`读 /me 失败 ${res.status}`)
  return (await res.json()) as OsuMe
}

export function sign(value: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex").slice(0, 32)
}

export function makeSession(userId: string): string {
  return `${userId}.${sign(userId)}`
}

export function readSession(raw: string | undefined): string | null {
  if (!raw) return null
  const dot = raw.lastIndexOf(".")
  if (dot <= 0) return null
  const userId = raw.slice(0, dot)
  const signature = raw.slice(dot + 1)
  return sign(userId) === signature ? userId : null
}

export { COOKIE_NAME }
