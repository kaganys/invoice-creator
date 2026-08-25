import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function NotesSection() {
  const { invoice, patchInvoice } = useInvoiceDraft()

  return (
    <InvoiceSection
      title="Notes"
      description="Optional message shown on the invoice. Leave blank to hide it."
    >
      <Field label="Notes" htmlFor="invoice-notes">
        <textarea
          id="invoice-notes"
          className="field__textarea"
          rows={5}
          value={invoice.notes}
          onChange={(event) => patchInvoice({ notes: event.target.value })}
        />
      </Field>
    </InvoiceSection>
  )
}
