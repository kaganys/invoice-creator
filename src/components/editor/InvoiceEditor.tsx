import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { useAppView } from '../../nav/AppViewContext.tsx'
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
  const { openInvoiceDetail } = useAppView()

  return (
    <form
      className="invoice-editor"
      autoComplete="off"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="editor-toolbar">
        <p className="editor-toolbar__hint">
          {savedId
            ? 'Edits stay in this browser until you save again.'
            : 'This invoice is only in this browser until you save it.'}
        </p>
        <div className="editor-toolbar__actions">
          <ResetInvoiceButton />
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => {
              void saveInvoice().then((id) => {
                if (id) {
                  openInvoiceDetail(id)
                }
              })
            }}
          >
            {saving ? 'Saving…' : 'Save invoice'}
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
