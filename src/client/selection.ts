import type { KeyboardEvent } from "react"

export function moveRowSelection(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
  event.preventDefault()
  const next = event.key === "ArrowUp"
    ? event.currentTarget.previousElementSibling
    : event.currentTarget.nextElementSibling
  if (next instanceof HTMLButtonElement) {
    next.focus()
    next.click()
  }
}
