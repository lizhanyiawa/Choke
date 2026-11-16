import type { EdgeFighter, EdgeUnit } from "./edgeBattle"
import { isFighter } from "./edgeSkills/state"
import { RANGED_KIT_REACH } from "@/card/combatRules"
import { SUBJOBS, type SubJobId } from "@/card/jobs"
import type { Job } from "@/card/types"

type Kit = Pick<EdgeFighter, "actives" | "passives" | "gold">
export function kitHasRole(kit: Kit, role: string) {
  const prefix = role + "/"
  return kit.actives.some(skill => skill.id.startsWith(prefix)) || kit.passives.some(skill => skill.id.startsWith(prefix)) || !!kit.gold?.id.startsWith(prefix)
}
/** All v2 role mechanics are earned by visible equipped skill IDs; origin/subjob is ignored. */
export function combatHasRole(unit: EdgeUnit, role: string) {
  return isFighter(unit) && (unit.combatVersion === "four-v2" ? kitHasRole(unit, role) : unit.card.subjob.id === role)
}
export const equippedCombatRoles = (unit: EdgeFighter): SubJobId[] =>
  (Object.keys(SUBJOBS) as SubJobId[]).filter(role => combatHasRole(unit, role))
export const kitRangeBonus = (job: Job, kit: Kit) => job === "warrior" && kitHasRole(kit, "ranger") ? RANGED_KIT_REACH : 0
