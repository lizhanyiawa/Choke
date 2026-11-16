import { useState } from "react"

import { DEMO_CARDS, makeCard, skillsFor } from "@/card/data"
import { PackOpening } from "@/desk/opening/PackOpening"
import { prefersPackWebGL } from "@/desk/opening/renderer"
import { POOL_META } from "@/desk/rarity"
import type { CardData } from "@/desk/types"

const sample = makeCard({
  id: "preview-prismatic",
  name: "棱彩样卡",
  rarity: "Prismatic",
  job: "mage",
  level: 1,
  mods: ["HD", "DT"],
  constellation: 0,
  foil: true,
  art: "/collector/toke/art.png",
  skills: skillsFor("mage", "Prismatic"),
})

const cards: CardData[] = [...DEMO_CARDS.slice(1, 5), sample].map((face) => ({
  cardId: face.id,
  name: face.name,
  mapper: face.name,
  rarity: face.rarity,
  foil: face.foil,
  face,
}))

export function OpeningPreview({ onClose }: { onClose: () => void }) {
  const [replay, setReplay] = useState(0)
  const [useWebGL, setUseWebGL] = useState(prefersPackWebGL)

  return (
    <PackOpening
      key={replay}
      cards={cards}
      label={`${POOL_META.prism.short}卡包`}
      accent={POOL_META.prism.color}
      useWebGL={useWebGL}
      onCancel={onClose}
      onReplay={() => setReplay((value) => value + 1)}
      onFallback={() => setUseWebGL(false)}
    />
  )
}
