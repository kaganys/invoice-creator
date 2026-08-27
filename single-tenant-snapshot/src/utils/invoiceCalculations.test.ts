import { describe, expect, it } from 'vitest'
import { createDefaultInvoice, createEmptyLineItem } from '../data/defaultInvoice.ts'
import type { Invoice } from '../types/invoice.ts'
import { calculateInvoiceTotals } from './invoiceCalculations.ts'
import { formatMoney } from './money.ts'

function invoiceWith(
  overrides: Partial<Invoice> & {
    lineItems?: Invoice['lineItems']
    payment?: Partial<Invoice['payment']>
  } = {},
): Invoice {
  const base = createDefaultInvoice()
  return {
    ...base,
    ...overrides,
    payment: {
      ...base.payment,
      ...overrides.payment,
    },
    lineItems: overrides.lineItems ?? base.lineItems,
  }
}

describe('calculateInvoiceTotals', () => {
  it('calculates a one-item subtotal', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
        ],
      }),
    )

    expect(totals.subtotalCents).toBe(5000)
    expect(totals.totalCents).toBe(5000)
    expect(totals.amountDueCents).toBe(5000)
    expect(totals.zelleTotalCents).toBe(5000)
    expect(formatMoney(totals.totalCents, 'USD')).toBe('$50.00')
  })

  it('sums multiple line items', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '20.00' }),
          createEmptyLineItem({ quantity: '1', unitPrice: '30.00' }),
        ],
      }),
    )

    expect(totals.subtotalCents).toBe(5000)
    expect(totals.lineAmountsCents).toEqual([2000, 3000])
  })

  it('multiplies quantity by unit price', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '2', unitPrice: '25.00' }),
        ],
      }),
    )

    expect(totals.subtotalCents).toBe(5000)
  })

  it('handles decimal money values without float residue', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '0.10' }),
          createEmptyLineItem({ quantity: '1', unitPrice: '0.20' }),
        ],
      }),
    )

    expect(totals.subtotalCents).toBe(30)
    expect(formatMoney(totals.totalCents, 'USD')).toBe('$0.30')
  })

  it('applies a percentage card fee without changing the invoice total', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
        ],
        payment: {
          cardFeePercent: '3',
          cardFeeFixed: '0',
        },
      }),
    )

    expect(totals.totalCents).toBe(5000)
    expect(totals.zelleTotalCents).toBe(5000)
    expect(totals.cardFeeCents).toBe(150)
    expect(totals.cardTotalCents).toBe(5150)
  })

  it('applies a fixed card fee without changing the invoice total', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
        ],
        payment: {
          cardFeePercent: '0',
          cardFeeFixed: '0.30',
        },
      }),
    )

    expect(totals.totalCents).toBe(5000)
    expect(totals.cardFeeCents).toBe(30)
    expect(totals.cardTotalCents).toBe(5030)
  })

  it('applies percentage plus fixed card fees together', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
        ],
        payment: {
          cardFeePercent: '2.9',
          cardFeeFixed: '0.30',
        },
      }),
    )

    expect(totals.totalCents).toBe(5000)
    expect(totals.cardFeeCents).toBe(175)
    expect(totals.cardTotalCents).toBe(5175)
    expect(formatMoney(totals.cardTotalCents, 'USD')).toBe('$51.75')
  })

  it('treats a zero fee as equal invoice, Zelle, and card totals', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
        ],
        payment: {
          cardFeePercent: '0',
          cardFeeFixed: '0.00',
        },
      }),
    )

    expect(totals.cardFeeCents).toBe(0)
    expect(totals.cardTotalCents).toBe(5000)
    expect(totals.zelleTotalCents).toBe(5000)
    expect(totals.totalCents).toBe(5000)
  })

  it('does not include invalid line items in the subtotal', () => {
    const totals = calculateInvoiceTotals(
      invoiceWith({
        lineItems: [
          createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
          createEmptyLineItem({ quantity: '0', unitPrice: '20.00' }),
        ],
      }),
    )

    expect(totals.hasInvalidLines).toBe(true)
    expect(totals.subtotalCents).toBe(5000)
    expect(totals.lineAmountsCents[1]).toBeNull()
  })
})
