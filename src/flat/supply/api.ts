import type { SupplyBoxView, SupplyGain, SupplyResourceView, SupplyView } from "@choke/shared/supply"

import { request } from "@/desk/session/api"

export type { SupplyBoxView, SupplyGain, SupplyResourceView, SupplyView }

export interface SupplyFocusOption {
  id: string
  label: string
}

export interface SupplyOverview extends SupplyView {
  focus: string | null
  focusOptions: SupplyFocusOption[]
}

export interface SupplyClaimResult {
  gains: SupplyGain[]
  supply: SupplyOverview
}

const base = (userId: string) => `/api/users/${encodeURIComponent(userId)}/supply`

export function fetchSupply(userId: string, signal?: AbortSignal): Promise<SupplyOverview> {
  return request<SupplyOverview>(base(userId), { signal })
}

export function claimSupply(userId: string): Promise<SupplyClaimResult> {
  return request<SupplyClaimResult>(`${base(userId)}/claim`, { method: "POST" })
}

export function setSupplyFocus(userId: string, focus: string | null): Promise<SupplyOverview> {
  return request<SupplyOverview>(`${base(userId)}/focus`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ focus }),
  })
}
