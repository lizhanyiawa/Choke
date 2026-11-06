import { useState, type ReactNode } from "react"

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
  const solo = params.get("solo")
  if (solo !== null) {
    const index = Number(solo)
    const card = DEMO_CARDS[index] ?? DEMO_CARDS[4]
    const width = Math.min(Math.max(Number(params.get("w")) || 480, 240), 960)
    const battle = params.get("mode") === "battle"
    return (
      <div className="lab lab--solo" data-bg="dark">
        <div style={{ width }}>
          <CardFace card={card} mode={battle ? "battle" : "collection"} />
        </div>
      </div>
    )
  }

  return (
    <div className="lab" data-bg={bg}>
      <header className="lab__bar">
        <div>
          <div className="lab__eyebrow">CHOKE! · CARD FACE</div>
          <h1 className="lab__title">卡面实验室 v0.1</h1>
          <p className="lab__sub">
            2:3 竖版 · 一套模板两层可见性 · 卡面只出现 Lv / AP / MP 三个数字
          </p>
        </div>
        <button
          type="button"
          className="lab__toggle"
          onClick={() => setBg((v) => (v === "dark" ? "light" : "dark"))}
        >
          {bg === "dark" ? "浅色底" : "深色底"}
        </button>
      </header>

      <Section label="七档卡框材质" note="主识别来自卡框：纸 / 压印 / 烫金 / 银箔 / 珠光 / 绿松 / 镭射箔">
        <div className="lab__row">
          {DEMO_CARDS.map((card) => (
            <div className="lab__slot" style={{ width: 200 }} key={card.id}>
              <CardFace card={card} />
              <span className="lab__tag">{card.rarity}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section label="三档尺寸" note="100px 上场 / 200px 卡册 / 360px 全屏详情">
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

      <Section label="战斗态" note="顶栏与底栏淡出，只留立绘与技能行；血量条在卡牌下方单独渲染">
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

      <Section label="本体卡 · 命座阶梯" note="六颗星 × 两档 = 12 级；空心 → 铜色 → 虹彩">
        <div className="lab__row">
          {HEROES.map((card) => (
            <div className="lab__slot" style={{ width: 160 }} key={card.id}>
              <CardFace card={card} />
              <span className="lab__tag">Lv {card.level}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section label="字段取舍" note="单技能留空位；被动不显示 AP；法系才有 MP；无 MOD 则 MOD 槽留空">
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
    </div>
  )
}

function Section({
  label,
  note,
  children,
}: {
  label: string
  note: string
  children: ReactNode
}) {
  return (
    <section className="lab__section">
      <div className="lab__section-head">
        <h2>{label}</h2>
        <p>{note}</p>
      </div>
      {children}
    </section>
  )
}
