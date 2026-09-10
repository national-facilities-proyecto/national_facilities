import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './index'
export function Modal({
  open,
  title,
  children,
  onClose,
  busy = false,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [open])
  return open ? (
    <dialog
      ref={ref}
      className="nf-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="nf-modal__header">
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="secondary"
          aria-label={`Cerrar ${title}`}
          disabled={busy}
          onClick={onClose}
        >
          ×
        </Button>
      </div>
      {children}
    </dialog>
  ) : null
}
