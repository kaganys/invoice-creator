import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { CustomerSection } from './CustomerSection.tsx'
import { FromSection } from './FromSection.tsx'
import { InvoiceDetailsSection } from './InvoiceDetailsSection.tsx'
import { LineItemsSection } from './LineItemsSection.tsx'
import { NotesSection } from './NotesSection.tsx'
import { PaymentSection } from './PaymentSection.tsx'
import { ResetInvoiceButton } from './ResetInvoiceButton.tsx'
import './InvoiceEditor.css'

export function InvoiceEditor() {
  const { savedId, saving, saveError, saveInvoice } = useInvoiceDraft()

  return (
    <form
      className="invoice-editor"
      autoComplete="off"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="editor-toolbar">
        <p className="editor-toolbar__hint">
          {savedId
            ? 'This browser keeps a working copy. Save writes the invoice to D1.'
            : 'Unsaved working copy in this browser only. Save to store it in D1.'}
        </p>
        <div className="editor-toolbar__actions">
          <ResetInvoiceButton />
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void saveInvoice()}
          >
            {saving ? 'Saving…' : savedId ? 'Save invoice' : 'Save to D1'}
          </button>
        </div>
      </div>
      {saveError ? (
        <p className="api-banner api-banner--error">{saveError}</p>
      ) : null}
      <InvoiceDetailsSection />
      <FromSection />
      <CustomerSection />
      <LineItemsSection />
      <PaymentSection />
      <NotesSection />
    </form>
  )
}
