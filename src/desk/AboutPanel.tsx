import { Pages } from "./BookPages"
import "./about-panel.css"

const TOOLS = [
  {
    href: "/card-lab",
    label: "卡面实验室",
    note: "七档卡框材质、三档尺寸、战斗态和本体卡命座阶梯。",
  },
  {
    href: "/card-editor",
    label: "卡牌编辑器",
    note: "手动拼一张卡，检查字段、卡面和技能排布。",
  },
  {
    href: "/pool-lab",
    label: "卡池实验室",
    note: "导入排行榜数据，构建卡池并导出卡定义。",
  },
  {
    href: "/holo-lab.html",
    label: "全息参考",
    note: "闪卡 / 箔面效果的视觉参考页。",
    external: true,
  },
]

const META = [
  { label: "版本", value: "M1 · Card Face Lab" },
  { label: "卡面", value: "2:3 竖版 · 七档材质" },
  { label: "数据", value: "osu! / Mutualify" },
]

export function AboutPanel() {
  return (
    <Pages
      left={
        <>
          <img className="about-logo" src="/brand/choke-lockup-horizontal.svg" alt="Choke!" />
          <p className="about-text">把 osu! 玩家数据做成卡牌：开包、收藏、组卡、战斗。</p>
          <p className="bk-note">非官方粉丝作品；玩家数据来自 osu! 公开 API 与公开排行榜。</p>
          <hr className="bk-divider" />
          <div className="bk-list">
            {META.map((item) => (
              <div className="bk-row about-meta" key={item.label}>
                <span>{item.label}</span>
                <b>{item.value}</b>
              </div>
            ))}
          </div>
        </>
      }
      right={
        <>
          <span className="bk-label">实验室工具</span>
          <p className="bk-note">卡面与开发用的页面，入口先集中在这里。</p>
          <div className="bk-list">
            {TOOLS.map((tool) => (
              <a
                className="bk-row about-link"
                key={tool.href}
                href={tool.href}
                target={tool.external ? "_blank" : undefined}
                rel={tool.external ? "noreferrer" : undefined}
              >
                <span className="about-link__text">
                  <b>{tool.label}</b>
                  <em>{tool.note}</em>
                </span>
                <i aria-hidden>›</i>
              </a>
            ))}
          </div>
        </>
      }
    />
  )
}
