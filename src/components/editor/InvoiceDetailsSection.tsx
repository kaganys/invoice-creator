import { CURRENCY_OPTIONS, INVOICE_STATUSES } from '../../types/invoice.ts'
import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { Field, fieldErrorId } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function InvoiceDetailsSection() {
  const {
    invoice,
    errors,
    status,
    savedId,
    setStatus,
    patchInvoice,
    touch,
    visibleError,
  } = useInvoiceDraft()
  const numberError = visibleError('number', errors.number, invoice.number)
  const dueDateError = visibleError('dueDate', errors.dueDate, invoice.dueDate)
  const currencyOptions = (CURRENCY_OPTIONS as readonly string[]).includes(
    invoice.currency,
  )
    ? CURRENCY_OPTIONS
    : [invoice.currency, ...CURRENCY_OPTIONS]

  return (
    <InvoiceSection
      title="Invoice details"
      description="Number, dates, and currency for this invoice."
    >
      <div className="form-grid form-grid--4">
        <Field
          label="Invoice number"
          htmlFor="invoice-number"
          error={numberError}
        >
          <input
            id="invoice-number"
            className="field__input"
            value={invoice.number}
            required
            aria-invalid={Boolean(numberError)}
            aria-describedby={
              numberError ? fieldErrorId('invoice-number') : undefined
            }
            onChange={(event) => patchInvoice({ number: event.target.value })}
            onBlur={() => touch('number')}
          />
        </Field>
        <Field label="Date of issue" htmlFor="issue-date" error={errors.issueDate}>
          <input
            id="issue-date"
            className="field__input"
            type="date"
            value={invoice.issueDate}
            aria-invalid={Boolean(errors.issueDate)}
            onChange={(event) =>
              patchInvoice({ issueDate: event.target.value })
            }
          />
        </Field>
        <Field label="Due date" htmlFor="due-date" error={dueDateError}>
          <input
            id="due-date"
            className="field__input"
            type="date"
            value={invoice.dueDate}
            aria-invalid={Boolean(dueDateError)}
            aria-describedby={
              dueDateError ? fieldErrorId('due-date') : undefined
            }
            onChange={(event) => patchInvoice({ dueDate: event.target.value })}
            onBlur={() => touch('dueDate')}
          />
        </Field>
        <Field label="Status" htmlFor="invoice-status">
          <select
            id="invoice-status"
            className="field__select"
            value={status}
            disabled={!savedId}
            onChange={(event) =>
              setStatus(event.target.value as (typeof INVOICE_STATUSES)[number])
            }
          >
            {INVOICE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Currency" htmlFor="invoice-currency">
          <select
            id="invoice-currency"
            className="field__select"
            value={invoice.currency}
            onChange={(event) =>
              patchInvoice({ currency: event.target.value })
            }
          >
            {currencyOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </InvoiceSection>
  )
}
