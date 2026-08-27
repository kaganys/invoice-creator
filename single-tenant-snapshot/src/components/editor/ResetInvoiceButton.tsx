import { useState } from 'react'
import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'

export function ResetInvoiceButton() {
  const { resetDraft } = useInvoiceDraft()
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="reset-invoice">
        <p className="reset-invoice__prompt">Reset this draft to defaults?</p>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            resetDraft()
            setConfirming(false)
          }}
        >
          Confirm reset
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="btn btn--ghost"
      onClick={() => setConfirming(true)}
    >
      Reset Invoice
    </button>
  )
}
