import type { ReactNode } from "react"
import { RiArrowLeftLine } from "@remixicon/react"

export function LabHeader({ title, children }: { title: string; children?: ReactNode }) {
  const fromDeveloper = new URLSearchParams(window.location.search).get("from") === "developer"
  return (
    <header className="client-header">
      <a className="client-back" href={fromDeveloper ? "/developer" : "/"}>
        <RiArrowLeftLine size={17} aria-hidden />
        {fromDeveloper ? "开发者工具" : "牌桌"}
      </a>
      <h1>{title}</h1>
      {children && <div className="client-header__actions">{children}</div>}
    </header>
  )
}
