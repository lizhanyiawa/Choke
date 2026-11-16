import { request } from "@/desk/api"
import type { CultivationProfile } from "@/card/cultivation"
import type { Job } from "@/card/types"
import type { CombatVersion } from "@/card/combatRules"
import type { EdgeInputCard } from "./edgeSkills/catalog"
import type { GrowthCommand } from "./cultivationReplay"
export type GrowthAction = { action: "title"; title: Job | null } | { action: "buy"; mod: string }
  | { action: "rules"; combatVersion: CombatVersion }
  | { action: "equip"; uid: number; mod: string; slot: number } | { action: "unequip"; uid: number; slot: number }
  | { action: "rank" | "level"; uid: number }
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
export const fetchCultivation = (userId: string) => request<CultivationProfile>(`/api/users/${encodeURIComponent(userId)}/cultivation`)
export const changeCultivation = (userId: string, body: GrowthAction) => request<CultivationProfile>(`/api/users/${encodeURIComponent(userId)}/cultivation`, post(body))
export const startCultivation = (userId: string, lineup: EdgeInputCard[]) => request<{ lineup: EdgeInputCard[] }>(`/api/users/${encodeURIComponent(userId)}/cultivation/start`, post({
  lineup: lineup.map(card => ({ uid: card.uid, edge: card.edge, edgePool: card.edgePool, combatVersion: card.combatVersion })),
}))
export const settleCultivation = (userId: string, id: string, commands: GrowthCommand[]) =>
  request<{ won: boolean; training: number; exp: number; mastery: number; duplicate: boolean; profile: CultivationProfile }>(`/api/users/${encodeURIComponent(userId)}/cultivation/settle`, post({ id, commands }))
