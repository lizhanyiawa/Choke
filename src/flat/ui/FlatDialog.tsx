import { useEffect, useId, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { FiX } from "react-icons/fi"

import "./flat-dialog.css"

export function FlatDialog({ title, onClose, children, busy = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const scrimPress = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return createPortal(
    <dialog
      ref={ref}
      className="fl-dialog"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onPointerDown={(event) => { scrimPress.current = event.target === event.currentTarget }}
      onClick={(event) => {
        if (scrimPress.current && event.target === event.currentTarget && !busy) onClose()
        scrimPress.current = false
      }}
    >
      <div className="fl-dialog__body">
        <header className="fl-dialog__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="bk-btn bk-btn--ghost fl-dialog__close" aria-label="关闭" data-sfx="close" disabled={busy} onClick={onClose}>
            <FiX aria-hidden />
          </button>
        </header>
        {children}
      </div>
    </dialog>,
    document.body,
  )
}
