import { useEffect, useRef, useState } from 'react'
import { useInvoiceDraft } from '../invoice/InvoiceDraftContext.tsx'
import { useFocusTrap } from '../hooks/useFocusTrap.ts'
import {
  downloadPreviewInvoicePdf,
  downloadSavedInvoicePdf,
} from '../utils/invoicePdf.ts'
import { printInvoiceElement } from '../utils/invoicePrint.ts'
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
  const documentRef = useRef<HTMLElement>(null)
  const { invoice, savedId } = useInvoiceDraft()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const isDraftPreview = !savedId

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
              {isDraftPreview
                ? 'Preview of the invoice in the editor. It is not saved yet.'
                : 'Live preview of the invoice currently in the editor.'}
            </p>
          </div>
          <div className="preview-modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={exporting}
              onClick={() => {
                if (!documentRef.current) {
                  setExportError('Invoice is not ready to print.')
                  return
                }
                setExportError(null)
                printInvoiceElement(documentRef.current)
              }}
            >
              Print
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={exporting}
              onClick={() => {
                if (!documentRef.current) {
                  setExportError('Invoice is not ready to download.')
                  return
                }
                setExporting(true)
                setExportError(null)
                void (savedId
                  ? downloadSavedInvoicePdf(savedId)
                  : downloadPreviewInvoicePdf(invoice)
                )
                  .catch((caught: unknown) => {
                    setExportError(
                      caught instanceof Error
                        ? caught.message
                        : 'Could not generate the PDF.',
                    )
                  })
                  .finally(() => setExporting(false))
              }}
            >
              {exporting ? 'Generating PDF…' : 'Download PDF'}
            </button>
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
        </div>
        {exportError ? (
          <p className="api-banner api-banner--error preview-modal__error">
            {exportError}
          </p>
        ) : null}
        <div
          className="preview-modal__canvas"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose()
            }
          }}
        >
          <InvoicePreview documentRef={documentRef} />
        </div>
      </div>
    </div>
  )
}
