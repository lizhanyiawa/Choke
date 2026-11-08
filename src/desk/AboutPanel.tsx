import { CardLab } from "@/card/CardLab"

import "./about-panel.css"

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

      <section className="about-showcase">
        <div className="about-showcase__title">
          <span>CARD FACE SHOWCASE</span>
          <b>卡面展示</b>
          <p>卡面实验室暂时保留在这里，后续做正式卡面规范时可以直接对照。</p>
        </div>
        <CardLab />
      </section>
    </div>
  )
}
