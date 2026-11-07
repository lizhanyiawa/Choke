import { defFromFace, type CardDef } from "@/card/def"
import { faceFromPool } from "@/pool/face"
import type { PoolCard } from "@/pool/types"

/** 池卡 → 静态卡定义 */
export function defFromPool(card: PoolCard, version = 1): CardDef {
  const face = faceFromPool(card)
  return { ...defFromFace(face, version), osuId: card.osuId }
}
