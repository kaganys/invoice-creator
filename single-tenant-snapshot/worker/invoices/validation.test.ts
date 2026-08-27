import { describe, expect, it } from 'vitest'
import { validateInvoiceWrite } from './validation.ts'

const valid = {
  number: 'BD-1',
  customer: { name: 'Ada' },
  lineItems: [{ description: 'Work', quantity: '1', unitPrice: '10.00' }],
}

describe('validateInvoiceWrite', () => {
  it('requires an invoice number and customer name', () => {
    expect(validateInvoiceWrite({ ...valid, number: '' }).ok).toBe(false)
    expect(validateInvoiceWrite({ ...valid, customer: { name: '' } }).ok).toBe(
      false,
    )
  })

  it('rejects invalid dates and due-before-issue', () => {
    expect(
      validateInvoiceWrite({ ...valid, issueDate: '2026-13-01' }).ok,
    ).toBe(false)
    expect(
      validateInvoiceWrite({
        ...valid,
        issueDate: '2026-08-25',
        dueDate: '2026-08-24',
      }).ok,
    ).toBe(false)
  })

  it('rejects a negative unit price', () => {
    expect(
      validateInvoiceWrite({
        ...valid,
        lineItems: [{ quantity: '1', unitPrice: '-1.00' }],
      }).ok,
    ).toBe(false)
  })
})
