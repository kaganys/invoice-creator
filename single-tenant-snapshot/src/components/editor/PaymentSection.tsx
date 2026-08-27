import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { formatMoney } from '../../utils/money.ts'
import { Field, fieldErrorId } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function PaymentSection() {
  const { invoice, totals, errors, patchPayment, touch, visibleError } =
    useInvoiceDraft()
  const currency = invoice.currency
  const zelleError = visibleError(
    'zelleEmail',
    errors.zelleEmail,
    invoice.payment.zelleEmail,
  )
  const percentError = visibleError(
    'cardFeePercent',
    errors.cardFeePercent,
    invoice.payment.cardFeePercent,
  )
  const fixedFeeError = visibleError(
    'cardFeeFixed',
    errors.cardFeeFixed,
    invoice.payment.cardFeeFixed,
  )

  return (
    <InvoiceSection
      title="Payment"
      description="Invoice and Zelle totals stay at the invoice amount. A card fee only affects the credit-card total."
    >
      <div className="form-grid form-grid--2">
        <Field
          label="Payment memo"
          htmlFor="payment-memo"
          className="form-grid__full"
        >
          <textarea
            id="payment-memo"
            className="field__textarea"
            rows={4}
            value={invoice.payment.memo}
            onChange={(event) => patchPayment({ memo: event.target.value })}
          />
        </Field>
        <Field
          label="Zelle / payment email"
          htmlFor="zelle-email"
          className="form-grid__full"
          error={zelleError}
        >
          <input
            id="zelle-email"
            className="field__input"
            type="email"
            value={invoice.payment.zelleEmail}
            aria-invalid={Boolean(zelleError)}
            aria-describedby={
              zelleError ? fieldErrorId('zelle-email') : undefined
            }
            onChange={(event) =>
              patchPayment({ zelleEmail: event.target.value })
            }
            onBlur={() => touch('zelleEmail')}
          />
        </Field>
        <Field
          label="Credit-card fee %"
          htmlFor="card-fee-percent"
          error={percentError}
        >
          <input
            id="card-fee-percent"
            className="field__input"
            inputMode="decimal"
            value={invoice.payment.cardFeePercent}
            aria-invalid={Boolean(percentError)}
            aria-describedby={
              percentError ? fieldErrorId('card-fee-percent') : undefined
            }
            onChange={(event) =>
              patchPayment({ cardFeePercent: event.target.value })
            }
            onBlur={() => touch('cardFeePercent')}
          />
        </Field>
        <Field
          label="Fixed credit-card fee"
          htmlFor="card-fee-fixed"
          error={fixedFeeError}
        >
          <input
            id="card-fee-fixed"
            className="field__input"
            inputMode="decimal"
            value={invoice.payment.cardFeeFixed}
            aria-invalid={Boolean(fixedFeeError)}
            aria-describedby={
              fixedFeeError ? fieldErrorId('card-fee-fixed') : undefined
            }
            onChange={(event) =>
              patchPayment({ cardFeeFixed: event.target.value })
            }
            onBlur={() => touch('cardFeeFixed')}
          />
        </Field>
      </div>

      <dl className="payment-summary">
        <div>
          <dt>Invoice / Zelle total</dt>
          <dd>{formatMoney(totals.zelleTotalCents, currency)}</dd>
        </div>
        {totals.cardFeeCents > 0 ? (
          <div>
            <dt>Card fee</dt>
            <dd>{formatMoney(totals.cardFeeCents, currency)}</dd>
          </div>
        ) : null}
        <div className="payment-summary__card">
          <dt>Credit card total</dt>
          <dd>{formatMoney(totals.cardTotalCents, currency)}</dd>
        </div>
      </dl>
      <p className="payment-summary__note">
        The invoice preview shows the Invoice / Zelle total. The credit-card
        total is for card payments only and is not added to the invoice.
      </p>
    </InvoiceSection>
  )
}
