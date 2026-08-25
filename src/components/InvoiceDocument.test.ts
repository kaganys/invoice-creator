import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { invoiceLogoPath } from '../branding.ts'
import { InvoiceDocument } from './InvoiceDocument.tsx'
import { createDefaultInvoice } from '../data/defaultInvoice.ts'
import { DEFAULT_PAYMENT_MEMO } from '../utils/invoiceDefaults.ts'
import { calculateInvoiceTotals } from '../utils/invoiceCalculations.ts'

describe('canonical invoice document data', () => {
  it('uses the static icon path for invoice logos', () => {
    expect(invoiceLogoPath({ path: '/branding/bitz-designs-icon.png' })).toBe(
      '/branding/bitz-designs-icon.png',
    )
    expect(invoiceLogoPath({ path: 'branding/invoice-logo/secret.png' })).toBe(
      '/branding/bitz-designs-icon.png',
    )
    expect(
      invoiceLogoPath({
        path: '/api/branding/file/branding%2Finvoice-logo%2Faaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
      }),
    ).toBe(
      '/api/branding/file/branding%2Finvoice-logo%2Faaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
    )
  })

  it('includes the default payment memo on a new invoice snapshot', () => {
    const invoice = createDefaultInvoice()
    expect(invoice.payment.memo).toBe(DEFAULT_PAYMENT_MEMO)
    const totals = calculateInvoiceTotals(invoice)
    expect(totals.amountDueCents).toBe(0)
  })

  it('renders a real Pay Online hyperlink when a payment URL is provided', () => {
    const invoice = createDefaultInvoice()
    const paymentUrl =
      'https://pay.example.com/i/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'

    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, { invoice, paymentUrl }),
    )

    expect(html).toContain(`href="${paymentUrl}"`)
    expect(html).toContain('Pay this invoice')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })

  it('omits the Pay Online button when no payment URL is available', () => {
    const invoice = createDefaultInvoice()
    const html = renderToStaticMarkup(createElement(InvoiceDocument, { invoice }))

    expect(html).not.toContain('<p class="invoice-sheet__pay">')
    expect(html).not.toContain('>Pay this invoice<')
  })
})
