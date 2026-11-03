import type { PanelRow } from "./SidePanel"

export interface FeatureLink {
  fe: string
  label: string
}

interface Props {
  features: FeatureLink[]
  rows: PanelRow[]
  onFeature: (feature: FeatureLink) => void
}

/** 右侧大卡片：游戏的主简化版操作界面 */
export function CommandPanel({ features, rows, onFeature }: Props) {
  return (
    <aside className="command-panel" aria-label="快捷操作">
      <header className="command-panel__head">
        <div>
          <div className="command-panel__eyebrow">MAIN CONSOLE</div>
          <h2 className="command-panel__title">快捷操作</h2>
          <p className="command-panel__sub">桌面 / 卡池 / 收藏</p>
        </div>
        <div className="command-panel__badge">PVE</div>
      </header>

      <nav className="command-panel__nav" aria-label="功能入口（占位）">
        {features.map((feature) => (
          <button
            key={feature.fe}
            type="button"
            className="command-nav__btn"
            onClick={() => onFeature(feature)}
            title={`${feature.fe} · 待实现`}
          >
            <span>{feature.fe}</span>
            {feature.label}
          </button>
        ))}
      </nav>

      <div className="command-panel__divider">
        <span>收藏 / 交易</span>
      </div>

      <div className="command-panel__body">
        {rows.map((row, i) => {
          const pct = Math.max(0, Math.min(100, row.progress))
          return (
            <div className="side-row" key={i}>
              <div className="side-row__label">{row.label}</div>
              <div className="side-row__track">
                <div className="side-row__bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="side-row__detail">{row.detail}</div>
            </div>
          )
        })}
      </div>

      <footer className="command-panel__foot">Choke! · PVE 内测 · M1</footer>
    </aside>
  )
}
