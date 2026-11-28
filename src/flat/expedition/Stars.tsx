import type { CSSProperties } from "react"

/** 星星一排：got 颗亮、其余暗。--i 是第几颗，结算画面按它错开点亮的时间 */
export function Stars({ got, total }: { got: number; total: number }) {
  return (
    <span className="xp-stars" role="img" aria-label={`${got} / ${total} 星`}>
      {Array.from({ length: total }, (_, index) => (
        <i key={index} className={index < got ? "is-on" : undefined} style={{ "--i": index } as CSSProperties} aria-hidden>
          ★
        </i>
      ))}
    </span>
  )
}
