import { formatAddressLines, hasPartyContent } from '../utils/address.ts'
import { formatInvoiceDate } from '../utils/dates.ts'
import { calculateInvoiceTotals } from '../utils/invoiceCalculations.ts'
import {
  formatMoney,
  parseMoneyToCents,
  parseQuantityScaled,
} from '../utils/money.ts'
import type { Invoice, InvoiceParty } from '../types/invoice.ts'
import {
  cssVarsToStyle,
  formatToCssVars,
  type InvoiceFormat,
} from './format.ts'
import { INVOICE_DOCUMENT_CSS } from './invoiceDocumentCss.ts'
import { invoiceFontFaceCss } from './invoiceFonts.ts'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function displayQuantity(raw: string): string {
  const scaled = parseQuantityScaled(raw)
  if (scaled === null || scaled <= 0) {
    return '—'
  }
  return escapeHtml(raw.trim())
}

function displayUnitPrice(raw: string, currency: string): string {
  const cents = parseMoneyToCents(raw)
  if (cents === null || cents < 0) {
    return '—'
  }
  return escapeHtml(formatMoney(cents, currency))
}

function partyHtml(party: InvoiceParty, heading: string | null, bill: boolean): string {
  const name = party.name.trim()
  const email = party.email.trim()
  const addressLines = formatAddressLines(party.address)
  if (!heading && !name && !email && addressLines.length === 0) {
    return ''
  }
  const cls = bill ? 'invoice-sheet__party invoice-sheet__party--bill' : 'invoice-sheet__party'
  const lines: string[] = []
  if (heading) {
    lines.push(`<p class="invoice-sheet__label">${escapeHtml(heading)}</p>`)
    if (name) {
      lines.push(`<p class="invoice-sheet__name">${escapeHtml(name)}</p>`)
    }
  } else if (name) {
    lines.push(`<p class="invoice-sheet__name">${escapeHtml(name)}</p>`)
  }
  for (const line of addressLines) {
    lines.push(`<p>${escapeHtml(line)}</p>`)
  }
  if (email) {
    lines.push(`<p>${escapeHtml(email)}</p>`)
  }
  return `<div class="${cls}">${lines.join('')}</div>`
}

function memoHtml(text: string): string {
  const paragraphs = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) {
    return ''
  }
  return `<div class="invoice-sheet__memo">${paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('')}</div>`
}

export function fontFaceCss(origin: string): string {
  return invoiceFontFaceCss(origin)
}

export function renderInvoiceHtml(
  invoice: Invoice,
  format: InvoiceFormat,
  options: { origin: string; logoSrc: string; paymentUrl?: string },
): string {
  const totals = calculateInvoiceTotals(invoice)
  const vars = cssVarsToStyle(formatToCssVars(format))
  const invoiceNumber = invoice.number.trim() || '—'
  const issueDate = formatInvoiceDate(invoice.issueDate)
  const dueDate = formatInvoiceDate(invoice.dueDate)
  const showFrom = hasPartyContent(invoice.from)
  const showBillTo = hasPartyContent(invoice.customer)
  const amount = formatMoney(totals.amountDueCents, invoice.currency)
  const dueLine = dueDate
    ? `${amount} ${invoice.currency} due ${dueDate}`
    : `${amount} ${invoice.currency}`
  const payUrl = options.paymentUrl?.trim() ?? ''

  const parties =
    showFrom || showBillTo
      ? `<section class="${showFrom && showBillTo ? 'invoice-sheet__parties' : 'invoice-sheet__parties invoice-sheet__parties--single'}">${
          showFrom ? partyHtml(invoice.from, null, false) : ''
        }${showBillTo ? partyHtml(invoice.customer, 'Bill to', true) : ''}</section>`
      : ''

  const dueBlock = totals.lineAmountsCents.some((value) => value !== null)
    ? `<p class="invoice-sheet__due-line">${escapeHtml(dueLine)}</p>`
    : ''

  const rows = invoice.lineItems
    .map((item, index) => {
      const lineAmount = totals.lineAmountsCents[index]
      const amountCell =
        lineAmount === null || lineAmount === undefined
          ? '—'
          : escapeHtml(formatMoney(lineAmount, invoice.currency))
      return `<tr>
        <td>${escapeHtml(item.description.trim())}</td>
        <td>${displayQuantity(item.quantity)}</td>
        <td>${displayUnitPrice(item.unitPrice, invoice.currency)}</td>
        <td>${amountCell}</td>
      </tr>`
    })
    .join('')

  const notes = invoice.notes.trim()
  const notesHtml = notes
    ? `<section class="invoice-sheet__notes"><p class="invoice-sheet__notes-title">Notes</p><p class="invoice-sheet__notes-body">${escapeHtml(notes)}</p></section>`
    : ''

  const payBlock = payUrl
    ? `<p class="invoice-sheet__pay"><a class="invoice-sheet__pay-link" href="${escapeHtml(payUrl)}" target="_blank" rel="noreferrer noopener">Pay Online</a></p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${escapeHtml(invoiceNumber)}</title>
<style>
${fontFaceCss(options.origin)}
html, body { margin: 0; background: #ffffff; }
${INVOICE_DOCUMENT_CSS}
</style>
</head>
<body>
<article class="invoice-sheet" style="${vars}" aria-label="Invoice document">
  <header class="invoice-sheet__header">
    <h1 class="invoice-sheet__title">Invoice</h1>
    <div class="invoice-sheet__icon-wrap"><img src="${escapeHtml(options.logoSrc)}" alt="" width="48" height="48" /></div>
  </header>
  <dl class="invoice-sheet__meta">
    <dt>Invoice number</dt><dd>${escapeHtml(invoiceNumber)}</dd>
    ${issueDate ? `<dt>Date of issue</dt><dd>${escapeHtml(issueDate)}</dd>` : ''}
    ${dueDate ? `<dt>Date due</dt><dd>${escapeHtml(dueDate)}</dd>` : ''}
  </dl>
  ${parties}
  ${dueBlock}
  ${payBlock}
  ${memoHtml(invoice.payment.memo)}
  <table class="invoice-sheet__table">
    <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="invoice-sheet__totals">
    <div class="invoice-sheet__totals-row"><span>Subtotal</span><span>${escapeHtml(formatMoney(totals.subtotalCents, invoice.currency))}</span></div>
    <div class="invoice-sheet__totals-row"><span>Total</span><span>${escapeHtml(formatMoney(totals.totalCents, invoice.currency))}</span></div>
    <div class="invoice-sheet__totals-row invoice-sheet__totals-row--due"><span>Amount due</span><span>${escapeHtml(formatMoney(totals.amountDueCents, invoice.currency))} ${escapeHtml(invoice.currency)}</span></div>
  </div>
  ${notesHtml}
  <footer class="invoice-sheet__page">Page 1 of 1</footer>
</article>
</body>
</html>`
}
