import type { EdgePoint, EdgeUnitId } from "./edgeBattle"
export interface GrowthCommand { frame: number; unit: number; type: "move" | "basic" | "skill" | "skill2"; target?: EdgeUnitId; at?: EdgePoint }
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => { state += 0x6D2B79F5; let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value); return ((value ^ value >>> 14) >>> 0) / 4294967296 }
}
