import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { FiCheck, FiChevronDown } from "react-icons/fi"

import "./flat-controls.css"

export function FlatSelect<T extends string>({ label, value, options, onChange, className, disabled }: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
  className?: string
  disabled?: boolean
}) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: "", lastAt: 0 })
  const [active, setActive] = useState<number | null>(null)
  const selected = Math.max(0, options.findIndex(([key]) => key === value))
  const open = active !== null

  function show(index: number) {
    const trigger = button.current
    const list = menu.current
    if (!trigger || !list || !options.length) return
    const { left, top, bottom, width } = trigger.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.innerHeight
    const gap = 6
    const edge = 8
    const menuWidth = Math.min(Math.max(width, 168), viewportWidth - edge * 2)
    const below = viewportHeight - bottom - gap - edge
    const above = top - gap - edge
    const opensUp = below < Math.min(266, options.length * 36 + 10) && above > below
    Object.assign(list.style, {
      left: `${Math.max(edge, Math.min(left, viewportWidth - menuWidth - edge))}px`,
      width: `${menuWidth}px`,
      top: opensUp ? "auto" : `${bottom + gap}px`,
      bottom: opensUp ? `${viewportHeight - top + gap}px` : "auto",
      maxHeight: `${Math.max(0, Math.min(266, opensUp ? above : below))}px`,
    })
    if (!list.matches(":popover-open")) list.showPopover()
    setActive(index)
  }

  function choose(index: number) {
    const option = options[index]
    close()
    button.current?.focus({ preventScroll: true })
    if (option && option[0] !== value) onChange(option[0])
  }

  useLayoutEffect(() => {
    if (!open) return
    const list = menu.current
    function onScroll(event: Event) {
      if (event.target instanceof Node && list?.contains(event.target)) return
      close()
    }
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  useLayoutEffect(() => {
    const list = menu.current
    const option = active === null ? null : list?.children[active]
    if (!(option instanceof HTMLElement) || !list) return
    const top = option.offsetTop
    const bottom = top + option.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }, [active])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const { key } = event
    if (key === "Tab") { if (open) close(); return }
    if (key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); close() }
      return
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault()
      if (active === null) show(selected)
      else choose(active)
      return
    }
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      event.preventDefault()
      const index = key === "Home" ? 0 : key === "End" ? options.length - 1 : active === null ? selected :
        Math.max(0, Math.min(options.length - 1, active + (key === "ArrowDown" ? 1 : -1)))
      if (open) setActive(index)
      else show(index)
      return
    }
    if (key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey || !options.length) return
    const now = performance.now()
    const character = key.toLocaleLowerCase()
    const previous = now - typed.current.lastAt < 650 ? typed.current.text : ""
    const text = previous + character
    typed.current = { text, lastAt: now }
    const prefix = [...text].every((part) => part === character) ? character : text
    const start = (active ?? selected) + (prefix.length === 1 ? 1 : 0)
    for (let offset = 0; offset < options.length; offset++) {
      const index = (start + offset) % options.length
      const [code, name] = options[index]!
      if (!name.toLocaleLowerCase().startsWith(prefix) && !code.toLocaleLowerCase().startsWith(prefix)) continue
      event.preventDefault()
      if (open) setActive(index)
      else show(index)
      break
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className ? `bk-input fl-select ${className}` : "bk-input fl-select"}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        popoverTarget={id}
        aria-controls={id}
        aria-activedescendant={active === null ? undefined : `${id}-${active}`}
        disabled={disabled || options.length === 0}
        onClick={(event) => {
          event.preventDefault()
          if (menu.current?.matches(":popover-open")) close()
          else show(selected)
        }}
        onKeyDown={onKeyDown}
      >
        <span>{options[selected]?.[1] ?? label}</span>
        <FiChevronDown aria-hidden />
      </button>
      <div ref={menu} id={id} className="fl-select-menu" popover="auto" role="listbox" aria-label={label}
        onToggle={() => { if (!menu.current?.matches(":popover-open")) setActive(null) }}>
        {open && options.map(([key, name], index) => (
          <div key={key} id={`${id}-${index}`} role="option" aria-selected={index === selected}
            data-active={index === active || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
            <span>{name}</span>
            {index === selected && <FiCheck aria-hidden />}
          </div>
        ))}
      </div>
    </>
  )
}
