import { CardFace } from "@/card/CardFace"
import { DEMO_CARDS } from "@/card/data"

import "./about-panel.css"

const TOOLS = [
  {
    href: "/card-lab",
    label: "卡面实验室",
    sub: "CARD FACE LAB",
    note: "七档卡框材质、三档尺寸、战斗态和本体卡命座阶梯。",
  },
  {
    href: "/card-editor",
    label: "卡牌编辑器",
    sub: "CARD EDITOR",
    note: "手动拼一张卡，检查字段、卡面和技能排布。",
  },
  {
    href: "/pool-lab",
    label: "卡池实验室",
    sub: "POOL LAB",
    note: "导入排行榜数据，构建卡池并导出卡定义。",
  },
  {
    href: "/holo-lab.html",
    label: "全息参考",
    sub: "HOLO REFERENCE",
    note: "闪卡 / 箔面效果的视觉参考页。",
    external: true,
  },
]

export function AboutPanel() {
  return (
    <div className="about-panel">
      <section className="about-hero">
        <img src="/brand/choke-lockup-horizontal.svg" alt="Choke!" />
        <div>
          <span>CHOKE! · TRADING CARD SERIES 2026</span>
          <b>关于 Choke!</b>
          <p>
            把 osu! 玩家数据做成卡牌：开包、收藏、组卡、战斗。
            非官方粉丝作品；玩家数据来自 osu! 公开 API 与公开排行榜。
          </p>
        </div>
      </section>

      <section className="about-meta">
        <div>
          <span>版本</span>
          <b>M1 · Card Face Lab</b>
        </div>
        <div>
          <span>卡面</span>
          <b>2:3 竖版 · 七档材质</b>
        </div>
        <div>
          <span>数据</span>
          <b>osu! / Mutualify</b>
        </div>
      </section>

      <section className="about-tools">
        <div className="about-tools__head">
          <div>
            <span>DEV / REFERENCE</span>
            <b>卡面与开发工具</b>
            <p>这些页面暂时保留，入口先集中在这里，之后可能继续用一段时间。</p>
          </div>
          <div className="about-tools__preview" aria-hidden>
            <CardFace card={DEMO_CARDS[4]} />
          </div>
        </div>

        <div className="about-links">
          {TOOLS.map((tool) => (
            <a
              className="about-link"
              key={tool.href}
              href={tool.href}
              target={tool.external ? "_blank" : undefined}
              rel={tool.external ? "noreferrer" : undefined}
            >
              <span>{tool.sub}</span>
              <b>{tool.label}</b>
              <em>{tool.note}</em>
              <i aria-hidden>›</i>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
