import { useEffect, useState, type ReactNode } from "react"

import { LabHeader } from "@/client/LabHeader"

import { CardFace } from "./CardFace"
import { DEMO_CARDS, makeCard } from "./data"
import type { CardFaceData } from "./types"
import "./card-lab.css"

const HERO_SKILLS = [
  { name: "起手式", element: "physical", ap: 1 },
  { name: "破空", element: "thunder", ap: 2 },
  { name: "回响", element: "light", ap: 2, mp: 4 },
] as const

const HEROES: CardFaceData[] = [1, 4, 7, 10, 12].map((level) =>
  makeCard({
    id: `hero-${level}`,
    name: "No.1",
    rarity: "Prismatic",
    job: "warrior",
    level,
    constellation: level,
    mods: ["HD"],
    no: 1,
    isHero: true,
    skills: [...HERO_SKILLS],
  })
)

const SOLO_SKILL: CardFaceData = makeCard({
  id: "solo-skill",
  name: "Sotarks",
  rarity: "E",
  job: "tank",
  level: 33,
  constellation: 0,
  mods: [],
  no: 1533,
  skills: [{ name: "铁壁", element: "earth", ap: 1 }],
})

export function CardLab() {
  const [bg, setBg] = useState<"dark" | "light">("dark")
  const params = new URLSearchParams(window.location.search)
  const embed = params.get("embed") === "1"

  useEffect(() => {
    if (!embed) return
    const prev = document.body.style.background
    document.body.style.background = "transparent"
    return () => {
      document.body.style.background = prev
    }
  }, [embed])

  const solo = params.get("solo")
  if (solo !== null) {
    const index = Number(solo)
    const card = DEMO_CARDS[index] ?? DEMO_CARDS[4]
    const width = Math.min(Math.max(Number(params.get("w")) || 480, 240), 960)
    const battle = params.get("mode") === "battle"
    const guides = params.get("guides") === "1"

    if (embed) {
      return (
        <div style={{ width: "100%", padding: 0 }}>
          <CardFace card={card} mode={battle ? "battle" : "collection"} />
        </div>
      )
    }

    return (
      <>
        <LabHeader title="卡面实验室" />
        <main className="lab lab--solo" data-bg="dark">
          <div style={{ width, maxWidth: "100%" }}>
            <CardFace
              card={card}
              mode={battle ? "battle" : "collection"}
              className={guides ? "cf--guides" : undefined}
            />
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <LabHeader title="卡面实验室">
        <button
          type="button"
          className="client-key"
          onClick={() => setBg((v) => (v === "dark" ? "light" : "dark"))}
        >
          {bg === "dark" ? "浅色底" : "深色底"}
        </button>
      </LabHeader>
      <main className="lab" data-bg={bg}>
        <Section label="卡框材质">
          <div className="lab__rarities">
            {DEMO_CARDS.map((card) => (
              <div className="lab__slot" key={card.id}>
                <CardFace card={card} />
              </div>
            ))}
          </div>
        </Section>

        <Section label="尺寸">
          <div className="lab__row lab__row--baseline">
            <div className="lab__slot" style={{ width: 100 }}>
              <CardFace card={DEMO_CARDS[4]} mode="battle" />
              <span className="lab__tag">100 · 战斗态</span>
            </div>
            <div className="lab__slot" style={{ width: 140 }}>
              <CardFace card={DEMO_CARDS[4]} />
              <span className="lab__tag">140 · 卡册</span>
            </div>
            <div className="lab__slot" style={{ width: 220 }}>
              <CardFace card={DEMO_CARDS[4]} />
              <span className="lab__tag">220 · 网格</span>
            </div>
            <div className="lab__slot" style={{ width: 360 }}>
              <CardFace card={DEMO_CARDS[4]} />
              <span className="lab__tag">360 · 详情</span>
            </div>
          </div>
        </Section>

        <Section label="战斗态">
          <div className="lab__row">
            <div className="lab__slot" style={{ width: 120 }}>
              <CardFace card={DEMO_CARDS[3]} mode="battle" />
              <span className="lab__tag">120</span>
            </div>
            <div className="lab__slot" style={{ width: 200 }}>
              <CardFace card={DEMO_CARDS[3]} mode="battle" />
              <span className="lab__tag">200</span>
            </div>
          </div>
        </Section>

        <Section label="本体卡命座">
          <div className="lab__row">
            {HEROES.map((card) => (
              <div className="lab__slot" style={{ width: 160 }} key={card.id}>
                <CardFace card={card} />
                <span className="lab__tag">{card.constellation} 命</span>
              </div>
            ))}
          </div>
        </Section>

        <Section label="字段示例">
          <div className="lab__row">
            <div className="lab__slot" style={{ width: 200 }}>
              <CardFace card={SOLO_SKILL} />
              <span className="lab__tag">单技能</span>
            </div>
            <div className="lab__slot" style={{ width: 200 }}>
              <CardFace card={DEMO_CARDS[3]} />
              <span className="lab__tag">法系 MP</span>
            </div>
            <div className="lab__slot" style={{ width: 200 }}>
              <CardFace card={DEMO_CARDS[2]} />
              <span className="lab__tag">被动 + 三技能</span>
            </div>
            <div className="lab__slot" style={{ width: 200 }}>
              <CardFace card={DEMO_CARDS[0]} />
              <span className="lab__tag">无 MOD</span>
            </div>
          </div>
        </Section>
      </main>
    </>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <section className="lab__section">
      <div className="lab__section-head">
        <h2>{label}</h2>
      </div>
      {children}
    </section>
  )
}
