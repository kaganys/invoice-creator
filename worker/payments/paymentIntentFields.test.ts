import { describe, expect, it } from 'vitest'
import {
  paymentIntentDescription,
  paymentIntentMetadata,
  paymentIntentReceiptEmail,
} from './paymentIntentFields.ts'

describe('payment intent dashboard fields', () => {
  it('names the invoice and the business on the Stripe description', () => {
    expect(paymentIntentDescription('BD2026-0051', 'Bitz Designs')).toBe(
      'Invoice BD2026-0051 · Bitz Designs',
    )
  })

  it('leaves the business off when the invoice has no name', () => {
    expect(paymentIntentDescription('BD2026-0051', '  ')).toBe('Invoice BD2026-0051')
  })

  it('includes company and customer metadata and skips blanks', () => {
    expect(
      paymentIntentMetadata({
        invoiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        invoiceNumber: 'BD2026-0051',
        companyId: 'company-1',
        companyName: 'Northwind Studio',
        customerName: 'Ada',
        paymentTokenId: 'token-1',
        paymentCategory: 'card',
      }),
    ).toEqual({
      invoice_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      invoice_number: 'BD2026-0051',
      company_id: 'company-1',
      company_name: 'Northwind Studio',
      customer_name: 'Ada',
      payment_token_id: 'token-1',
      payment_category: 'card',
    })
    expect(
      paymentIntentMetadata({
        invoiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        invoiceNumber: 'BD2026-0051',
        companyId: '',
        companyName: '',
        customerName: '',
      }),
    ).toEqual({
      invoice_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      invoice_number: 'BD2026-0051',
    })
  })

  it('uses the customer email for the receipt only when one is known', () => {
    expect(paymentIntentReceiptEmail('ada@example.com')).toBe('ada@example.com')
    expect(paymentIntentReceiptEmail('  ada@example.com  ')).toBe('ada@example.com')
    expect(paymentIntentReceiptEmail('')).toBeUndefined()
    expect(paymentIntentReceiptEmail('not-an-email')).toBeUndefined()
  })
})