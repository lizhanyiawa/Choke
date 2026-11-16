import type { CSSProperties } from "react"

interface Props {
  label: string
  accent: string
}

export function BoosterArt({ label, accent }: Props) {
  return (
    <div
      className="booster"
      style={{ "--booster-accent": accent } as CSSProperties}
      aria-hidden
    >
      <span className="booster__seal" />
      <span className="booster__seal booster__seal--bottom" />
      <div className="booster__header">
        <span>CHOKE!</span>
      </div>
      <div className="booster__signal" />
      <div className="booster__footer">
        <b>{label}</b>
      </div>
    </div>
  )
}
