import "./back-to-desk.css"

export function BackToDesk() {
  return (
    <a className="back-to-desk" href="/home" data-sfx="close">
      <span aria-hidden>‹</span>
      桌面
    </a>
  )
}
