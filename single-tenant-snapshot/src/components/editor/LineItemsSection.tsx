import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { formatMoney } from '../../utils/money.ts'
import { Field, fieldErrorId } from '../Field.tsx'
import { IconPlus, IconTrash } from '../icons.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function LineItemsSection() {
  const {
    invoice,
    totals,
    errors,
    updateLineItem,
    addLineItem,
    removeLineItem,
    touch,
    visibleError,
  } = useInvoiceDraft()
  const canRemove = invoice.lineItems.length > 1

  return (
    <InvoiceSection
      title="Line items"
      description="Each amount is quantity × unit price."
    >
      <div className="line-items">
        <div className="line-items__head" aria-hidden="true">
          <span>Description</span>
          <span>Qty</span>
          <span>Unit price</span>
          <span>Amount</span>
          <span />
        </div>
        {invoice.lineItems.map((item, index) => {
          const itemErrors = errors.lineItems[item.id]
          const quantityError = visibleError(
            `quantity:${item.id}`,
            itemErrors?.quantity,
            item.quantity,
          )
          const unitPriceError = visibleError(
            `unitPrice:${item.id}`,
            itemErrors?.unitPrice,
            item.unitPrice,
          )
          const amount = totals.lineAmountsCents[index]
          return (
            <div className="line-items__row" key={item.id}>
              <Field
                label="Description"
                htmlFor={`line-description-${item.id}`}
                className="line-items__description"
              >
                <input
                  id={`line-description-${item.id}`}
                  className="field__input"
                  value={item.description}
                  onChange={(event) =>
                    updateLineItem(item.id, {
                      description: event.target.value,
                    })
                  }
                />
              </Field>
              <Field
                label="Quantity"
                htmlFor={`line-quantity-${item.id}`}
                error={quantityError}
              >
                <input
                  id={`line-quantity-${item.id}`}
                  className="field__input"
                  inputMode="decimal"
                  value={item.quantity}
                  aria-invalid={Boolean(quantityError)}
                  aria-describedby={
                    quantityError
                      ? fieldErrorId(`line-quantity-${item.id}`)
                      : undefined
                  }
                  onChange={(event) =>
                    updateLineItem(item.id, { quantity: event.target.value })
                  }
                  onBlur={() => touch(`quantity:${item.id}`)}
                />
              </Field>
              <Field
                label="Unit price"
                htmlFor={`line-price-${item.id}`}
                error={unitPriceError}
              >
                <input
                  id={`line-price-${item.id}`}
                  className="field__input"
                  inputMode="decimal"
                  value={item.unitPrice}
                  aria-invalid={Boolean(unitPriceError)}
                  aria-describedby={
                    unitPriceError
                      ? fieldErrorId(`line-price-${item.id}`)
                      : undefined
                  }
                  onChange={(event) =>
                    updateLineItem(item.id, { unitPrice: event.target.value })
                  }
                  onBlur={() => touch(`unitPrice:${item.id}`)}
                />
              </Field>
              <div className="line-items__amount">
                <span className="line-items__amount-label">Amount</span>
                <span className="line-items__amount-value">
                  {amount === null || amount === undefined
                    ? '—'
                    : formatMoney(amount, invoice.currency)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--icon line-items__remove"
                aria-label="Remove line item"
                disabled={!canRemove}
                onClick={() => removeLineItem(item.id)}
              >
                <IconTrash />
              </button>
            </div>
          )
        })}
        <div className="line-items__actions">
          <button
            type="button"
            className="btn btn--ghost line-items__add"
            onClick={addLineItem}
          >
            <IconPlus />
            Add line item
          </button>
          <div className="line-items__totals">
            <div>
              <span>Subtotal</span>
              <strong>
                {formatMoney(totals.subtotalCents, invoice.currency)}
              </strong>
            </div>
            <div className="line-items__totals-due">
              <span>Amount due</span>
              <strong>
                {formatMoney(totals.amountDueCents, invoice.currency)}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </InvoiceSection>
  )
}
