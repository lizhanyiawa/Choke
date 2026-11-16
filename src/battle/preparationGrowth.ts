import { GROWTH_MODS, JOBS, JOB_LABEL, newCultivation, type CultivationProfile } from "@/card/cultivation"
import { combatVersionOf } from "@/card/combatRules"
import { SUBJOBS, type SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { normalizeLoadout, poolForCard, readLoadout, type EdgeInputCard, type EdgeLoadout } from "./edgeSkills/catalog"

export interface PreparationEntry { card: EdgeInputCard; equipped: EdgeLoadout }
export function preparationEntry(input: EdgeInputCard, sparring: boolean): PreparationEntry {
  const combatVersion = input.combatVersion ?? "four-v2"
  const card: EdgeInputCard = sparring && !input.edgePool
    ? { ...input, combatVersion, edgePool: combatVersion === "four-v2" ? "curated-v1" : "legacy-v1" }
    : { ...input, combatVersion }
  const pool = poolForCard(card)
  return { card: { ...card, edgePool: pool.version === 2 ? "curated-v1" : "legacy-v1" },
    equipped: sparring ? normalizeLoadout(pool, card.edge) : readLoadout(card, pool) }
}
/** Independent transient inventory per team; no account API or localStorage writes. */
export function sandboxProfile(cards: readonly EdgeInputCard[]): CultivationProfile {
  const state = newCultivation()
  state.combatVersion = cards[0]?.combatVersion ?? "four-v2"
  state.training = 1000; state.clears = 10
  state.inventory = GROWTH_MODS.map(mod => mod.id)
  for (const job of JOBS) state.mastery[job] = 1000
  const title = cards[0]?.face.cultivation?.title
  if (title) { state.title = title.title; state.mastery = { ...title.mastery } }
  for (const card of cards) state.equipment[card.uid] = [...(card.face.cultivation?.mods ?? [])]
  return state
}
export function applyTeamCultivation(team: PreparationEntry[], state: CultivationProfile, faces?: Map<number, EdgeInputCard["face"]>): PreparationEntry[] {
  return team.map(item => ({ ...item, card: { ...item.card, combatVersion: combatVersionOf(state),
    face: { ...(faces?.get(item.card.uid) ?? item.card.face), cultivation: {
      mods: (state.equipment[item.card.uid] ?? []).filter(Boolean),
      title: { title: state.title, mastery: { ...state.mastery } },
    } },
  } }))
}
/** Main class/rarity controls keep the current rules and pool. Legacy selection is explicit. */
export function preparationTemplate(current: PreparationEntry, subjob: SubJobId, rarity: Rarity, sparring: boolean): PreparationEntry {
  const base = current.card, definition = SUBJOBS[subjob]
  const card: EdgeInputCard = { ...base, edge: undefined, edgeSubjob: subjob,
    edgePool: base.edgePool ?? (base.combatVersion === "legacy-v1" ? "legacy-v1" : "curated-v1"),
    face: { ...base.face, name: base.combatVersion === "four-v2" ? JOB_LABEL[definition.archetype] : definition.label,
      job: definition.archetype, rarity },
  }
  return preparationEntry(card, sparring)
}
