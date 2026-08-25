import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { Field, fieldErrorId } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'
import { AddressFields } from './AddressFields.tsx'
import { PersonPicker } from './PersonPicker.tsx'

export function FromSection() {
  const {
    invoice,
    errors,
    patchFrom,
    patchFromAddress,
    setFromParty,
    touch,
    visibleError,
  } = useInvoiceDraft()
  const fromEmailError = visibleError(
    'fromEmail',
    errors.fromEmail,
    invoice.from.email,
  )

  return (
    <InvoiceSection
      title="From"
      description="Select a saved person to auto-fill, or type the details below."
    >
      <div className="form-grid form-grid--2">
        <PersonPicker
          id="from-person"
          label="Select person"
          party={invoice.from}
          onSelect={setFromParty}
        />
        <Field label="Business name" htmlFor="from-name">
          <input
            id="from-name"
            className="field__input"
            value={invoice.from.name}
            onChange={(event) => patchFrom({ name: event.target.value })}
          />
        </Field>
        <Field
          label="Billing / contact email"
          htmlFor="from-email"
          error={fromEmailError}
        >
          <input
            id="from-email"
            className="field__input"
            type="email"
            value={invoice.from.email}
            aria-invalid={Boolean(fromEmailError)}
            aria-describedby={
              fromEmailError ? fieldErrorId('from-email') : undefined
            }
            onChange={(event) => patchFrom({ email: event.target.value })}
            onBlur={() => touch('fromEmail')}
          />
        </Field>
        <AddressFields
          idPrefix="from"
          address={invoice.from.address}
          onChange={patchFromAddress}
        />
      </div>
    </InvoiceSection>
  )
}
