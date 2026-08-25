import { describe, expect, it } from 'vitest'
import { createDefaultInvoice, createEmptyLineItem } from '../data/defaultInvoice.ts'
import type { Invoice } from '../types/invoice.ts'
import { calculateInvoiceTotals } from './invoiceCalculations.ts'
import { formatInvoiceDate } from './dates.ts'
import { formatMoney } from './money.ts'

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  const base = createDefaultInvoice()
  return {
    ...base,
    ...overrides,
    payment: { ...base.payment, ...overrides.payment },
    lineItems: overrides.lineItems ?? base.lineItems,
    from: overrides.from ?? base.from,
    customer: overrides.customer ?? base.customer,
  }
}

describe('saved invoice mapping for PDF/print', () => {
  it('uses snapshot sender, customer, memo, notes, and line items', () => {
    const saved = invoice({
      number: 'BD2026-0051',
      issueDate: '2026-08-25',
      dueDate: '2026-09-24',
      from: {
        name: 'Bitz Designs',
        email: 'billing@bitzdesigns.co',
        address: {
          line1: '',
          line2: '',
          city: '',
          region: '',
          postalCode: '',
          country: '',
        },
      },
      customer: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        address: {
          line1: '',
          line2: '',
          city: 'London',
          region: '',
          postalCode: '',
          country: '',
        },
      },
      notes: 'Thank you',
      payment: {
        memo: 'Pay by Zelle',
        zelleEmail: 'billing@bitzdesigns.co',
        cardFeePercent: '3',
        cardFeeFixed: '0.30',
      },
      lineItems: [
        createEmptyLineItem({
          description: 'Design',
          quantity: '2',
          unitPrice: '100.00',
        }),
        createEmptyLineItem({
          description: 'Revision',
          quantity: '1',
          unitPrice: '50.00',
        }),
      ],
    })

    expect(saved.from.name).toBe('Bitz Designs')
    expect(saved.customer.name).toBe('Ada Lovelace')
    expect(saved.payment.memo).toBe('Pay by Zelle')
    expect(saved.notes).toBe('Thank you')
    expect(saved.lineItems).toHaveLength(2)
    expect(formatInvoiceDate(saved.issueDate)).toBe('August 25, 2026')
  })

  it('excludes the credit-card fee from the printed amount due', () => {
    const totals = calculateInvoiceTotals(
      invoice({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
        ],
        payment: {
          memo: '',
          zelleEmail: '',
          cardFeePercent: '3',
          cardFeeFixed: '0.30',
        },
      }),
    )
    expect(totals.amountDueCents).toBe(5000)
    expect(totals.totalCents).toBe(5000)
    expect(totals.cardFeeCents).toBeGreaterThan(0)
    expect(formatMoney(totals.amountDueCents, 'USD')).toBe('$50.00')
  })

  it('handles optional empty fields and many line items', () => {
    const lines = Array.from({ length: 25 }, (_, index) =>
      createEmptyLineItem({
        description: `Item ${index + 1}`,
        quantity: '1',
        unitPrice: '10.00',
      }),
    )
    const saved = invoice({
      number: 'BD2026-0100',
      notes: '',
      from: {
        name: '',
        email: '',
        address: {
          line1: '',
          line2: '',
          city: '',
          region: '',
          postalCode: '',
          country: '',
        },
      },
      lineItems: lines,
    })
    const totals = calculateInvoiceTotals(saved)
    expect(totals.amountDueCents).toBe(25000)
    expect(saved.notes).toBe('')
    expect(saved.from.name).toBe('')
  })
})
