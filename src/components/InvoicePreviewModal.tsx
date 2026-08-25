import { useEffect, useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap.ts'
import { IconX } from './icons.tsx'
import { InvoicePreview } from './InvoicePreview.tsx'
import './InvoicePreviewModal.css'

type InvoicePreviewModalProps = {
  open: boolean
  onClose: () => void
}

export function InvoicePreviewModal({ open, onClose }: InvoicePreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useFocusTrap(open, dialogRef, onClose)

  useEffect(() => {
    if (!open) {
      return
    }

    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus()
    })

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      previousFocus.current?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div
      className="preview-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="preview-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-preview-title"
        aria-describedby="invoice-preview-description"
        tabIndex={-1}
      >
        <div className="preview-modal__toolbar">
          <div>
            <h2 id="invoice-preview-title" className="preview-modal__title">
              Invoice preview
            </h2>
            <p id="invoice-preview-description" className="preview-modal__description">
              Live preview of the current draft.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
          >
            <IconX />
            Close
          </button>
        </div>
        <div
          className="preview-modal__canvas"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose()
            }
          }}
        >
          <InvoicePreview />
        </div>
      </div>
    </div>
  )
}
