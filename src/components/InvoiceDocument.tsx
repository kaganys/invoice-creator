import { forwardRef, type CSSProperties } from 'react'
import { invoiceLogoPath } from '../branding.ts'
import {
  defaultInvoiceFormat,
  formatToCssVars,
  type InvoiceFormat,
} from '../invoice/format.ts'
import { INVOICE_DOCUMENT_CSS } from '../invoice/invoiceDocumentCss.ts'
import type { Invoice, InvoiceParty } from '../types/invoice.ts'
import { formatAddressLines, hasPartyContent } from '../utils/address.ts'
import { formatInvoiceDate } from '../utils/dates.ts'
import { calculateInvoiceTotals } from '../utils/invoiceCalculations.ts'
import {
  formatMoney,
  parseMoneyToCents,
  parseQuantityScaled,
} from '../utils/money.ts'
import './InvoicePreview.css'

function PartyLines({
  party,
  heading,
  bill = false,
}: {
  party: InvoiceParty
  heading?: string
  bill?: boolean
}) {
  const name = party.name.trim()
  const email = party.email.trim()
  const addressLines = formatAddressLines(party.address)

  if (!heading && !name && !email && addressLines.length === 0) {
    return null
  }

  return (
    <div
      className={
        bill
          ? 'invoice-sheet__party invoice-sheet__party--bill'
          : 'invoice-sheet__party'
      }
    >
      {heading ? <p className="invoice-sheet__label">{heading}</p> : null}
      {name ? <p className="invoice-sheet__name">{name}</p> : null}
      {addressLines.map((line, index) => (
        <p key={`${name}-${index}`}>{line}</p>
      ))}
      {email ? <p>{email}</p> : null}
    </div>
  )
}

function displayQuantity(raw: string): string {
  const scaled = parseQuantityScaled(raw)
  if (scaled === null || scaled <= 0) {
    return '—'
  }
  return raw.trim()
}

function displayUnitPrice(raw: string, currency: string): string {
  const cents = parseMoneyToCents(raw)
  if (cents === null || cents < 0) {
    return '—'
  }
  return formatMoney(cents, currency)
}

function dueAmountLine(
  amountDueCents: number,
  currency: string,
  dueDate: string,
): string {
  const amount = formatMoney(amountDueCents, currency)
  const due = formatInvoiceDate(dueDate)
  const withCurrency = `${amount} ${currency}`
  return due ? `${withCurrency} due ${due}` : withCurrency
}

function Memo({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return null
  }

  return (
    <div className="invoice-sheet__memo">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}

type InvoiceDocumentProps = {
  invoice: Invoice
  format?: InvoiceFormat
}

export const InvoiceDocument = forwardRef<HTMLElement, InvoiceDocumentProps>(
  function InvoiceDocument({ invoice, format = defaultInvoiceFormat() }, ref) {
  const totals = calculateInvoiceTotals(invoice)
  const logoSrc = invoiceLogoPath(invoice.invoiceLogo)
  const cssVars = formatToCssVars(format)
  const notes = invoice.notes.trim()
  const invoiceNumber = invoice.number.trim()
  const issueDate = formatInvoiceDate(invoice.issueDate)
  const dueDate = formatInvoiceDate(invoice.dueDate)
  const showFrom = hasPartyContent(invoice.from)
  const showBillTo = hasPartyContent(invoice.customer)

  return (
    <article
      ref={ref}
      className="invoice-sheet"
      aria-label="Invoice document"
      style={cssVars as CSSProperties}
    >
      <style>{INVOICE_DOCUMENT_CSS}</style>
      <header className="invoice-sheet__header">
        <h1 className="invoice-sheet__title">Invoice</h1>
        <div className="invoice-sheet__icon-wrap">
          <img src={logoSrc} alt="" width={48} height={48} />
        </div>
      </header>

      <dl className="invoice-sheet__meta">
        <dt>Invoice number</dt>
        <dd>{invoiceNumber || '—'}</dd>
        {issueDate ? (
          <>
            <dt>Date of issue</dt>
            <dd>{issueDate}</dd>
          </>
        ) : null}
        {dueDate ? (
          <>
            <dt>Date due</dt>
            <dd>{dueDate}</dd>
          </>
        ) : null}
      </dl>

      {showFrom || showBillTo ? (
        <section
          className={
            showFrom && showBillTo
              ? 'invoice-sheet__parties'
              : 'invoice-sheet__parties invoice-sheet__parties--single'
          }
        >
          {showFrom ? <PartyLines party={invoice.from} /> : null}
          {showBillTo ? (
            <PartyLines party={invoice.customer} heading="Bill to" bill />
          ) : null}
        </section>
      ) : null}

      {totals.lineAmountsCents.some((amount) => amount !== null) ? (
        <p className="invoice-sheet__due-line">
          {dueAmountLine(
            totals.amountDueCents,
            invoice.currency,
            invoice.dueDate,
          )}
        </p>
      ) : null}

      <p className="invoice-sheet__pay">
        <span className="invoice-sheet__pay-link">Pay online</span>
      </p>

      <Memo text={invoice.payment.memo} />

      <table className="invoice-sheet__table">
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col">Qty</th>
            <th scope="col">Unit price</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((item, index) => {
            const amount = totals.lineAmountsCents[index]
            return (
              <tr key={item.id}>
                <td>{item.description.trim()}</td>
                <td>{displayQuantity(item.quantity)}</td>
                <td>{displayUnitPrice(item.unitPrice, invoice.currency)}</td>
                <td>
                  {amount === null || amount === undefined
                    ? '—'
                    : formatMoney(amount, invoice.currency)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="invoice-sheet__totals">
        <div className="invoice-sheet__totals-row">
          <span>Subtotal</span>
          <span>{formatMoney(totals.subtotalCents, invoice.currency)}</span>
        </div>
        <div className="invoice-sheet__totals-row">
          <span>Total</span>
          <span>{formatMoney(totals.totalCents, invoice.currency)}</span>
        </div>
        <div className="invoice-sheet__totals-row invoice-sheet__totals-row--due">
          <span>Amount due</span>
          <span>
            {formatMoney(totals.amountDueCents, invoice.currency)}{' '}
            {invoice.currency}
          </span>
        </div>
      </div>

      {notes ? (
        <section className="invoice-sheet__notes">
          <p className="invoice-sheet__notes-title">Notes</p>
          <p className="invoice-sheet__notes-body">{notes}</p>
        </section>
      ) : null}

      <footer className="invoice-sheet__page">Page 1 of 1</footer>
    </article>
  )
  },
)
