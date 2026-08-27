import { describe, expect, it } from 'vitest'
import { createDefaultInvoice } from '../data/defaultInvoice.ts'
import { hasMeaningfulDraftContent } from './invoiceStorage.ts'

describe('hasMeaningfulDraftContent', () => {
  it('treats a blank new invoice as not meaningful', () => {
    const invoice = createDefaultInvoice()
    invoice.payment.memo = ''
    invoice.payment.zelleEmail = ''
    expect(hasMeaningfulDraftContent(invoice)).toBe(false)
  })

  it('treats payment defaults as meaningful recovered content', () => {
    const invoice = createDefaultInvoice()
    invoice.payment.memo = 'Looking forward to continued work together.'
    invoice.payment.zelleEmail = 'billing@bitzdesigns.co'
    expect(hasMeaningfulDraftContent(invoice)).toBe(true)
  })

  it('treats customer or from content as meaningful', () => {
    const invoice = createDefaultInvoice()
    invoice.customer.name = 'Ada'
    expect(hasMeaningfulDraftContent(invoice)).toBe(true)
  })
})
