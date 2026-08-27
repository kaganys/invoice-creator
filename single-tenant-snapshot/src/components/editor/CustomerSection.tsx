import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { Field, fieldErrorId } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'
import { AddressFields } from './AddressFields.tsx'
import { PersonPicker } from './PersonPicker.tsx'

export function CustomerSection() {
  const {
    invoice,
    errors,
    patchCustomer,
    patchCustomerAddress,
    setCustomerParty,
    touch,
    visibleError,
  } = useInvoiceDraft()
  const customerNameError = visibleError(
    'customerName',
    errors.customerName,
    invoice.customer.name,
  )
  const customerEmailError = visibleError(
    'customerEmail',
    errors.customerEmail,
    invoice.customer.email,
  )

  return (
    <InvoiceSection
      title="Customer"
      description="Select a saved person to auto-fill, or type the details below."
    >
      <div className="form-grid form-grid--2">
        <PersonPicker
          id="customer-person"
          label="Select person"
          party={invoice.customer}
          onSelect={setCustomerParty}
        />
        <Field
          label="Customer name"
          htmlFor="customer-name"
          error={customerNameError}
        >
          <input
            id="customer-name"
            className="field__input"
            value={invoice.customer.name}
            required
            aria-invalid={Boolean(customerNameError)}
            aria-describedby={
              customerNameError ? fieldErrorId('customer-name') : undefined
            }
            onChange={(event) =>
              patchCustomer({ name: event.target.value })
            }
            onBlur={() => touch('customerName')}
          />
        </Field>
        <Field
          label="Customer email"
          htmlFor="customer-email"
          error={customerEmailError}
        >
          <input
            id="customer-email"
            className="field__input"
            type="email"
            value={invoice.customer.email}
            aria-invalid={Boolean(customerEmailError)}
            aria-describedby={
              customerEmailError ? fieldErrorId('customer-email') : undefined
            }
            onChange={(event) =>
              patchCustomer({ email: event.target.value })
            }
            onBlur={() => touch('customerEmail')}
          />
        </Field>
        <AddressFields
          idPrefix="customer"
          address={invoice.customer.address}
          onChange={patchCustomerAddress}
        />
      </div>
    </InvoiceSection>
  )
}
