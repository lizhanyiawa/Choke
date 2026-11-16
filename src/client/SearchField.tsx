import { useRef } from "react"
import { RiCloseLine, RiSearchLine } from "@remixicon/react"

interface Props {
  value: string
  onChange: (value: string) => void
  label?: string
}

export function SearchField({ value, onChange, label = "搜索玩家名" }: Props) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="client-search" role="search">
      <RiSearchLine size={19} aria-hidden />
      <input
        ref={input}
        data-client-search
        type="search"
        value={value}
        aria-label={label}
        placeholder={label}
        maxLength={100}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault()
            onChange("")
          }
        }}
      />
      {value && (
        <button type="button" aria-label="清除搜索" onClick={() => { onChange(""); input.current?.focus() }}>
          <RiCloseLine size={17} aria-hidden />
        </button>
      )}
    </div>
  )
}
