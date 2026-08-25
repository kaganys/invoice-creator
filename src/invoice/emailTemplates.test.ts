import { describe, expect, it } from 'vitest'
import { createDefaultInvoice, createEmptyLineItem } from '../data/defaultInvoice.ts'
import {
  applyEmailTemplate,
  containsHeaderInjection,
  invoiceTemplateVars,
} from './emailTemplates.ts'

describe('email templates', () => {
  it('replaces known variables and blanks unknown ones', () => {
    const invoice = createDefaultInvoice()
    invoice.number = 'BD2026-0051'
    invoice.from.name = 'Bitz Designs'
    invoice.customer.name = 'Ada'
    invoice.lineItems = [
      createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
    ]
    const vars = invoiceTemplateVars(invoice)
    const text = applyEmailTemplate(
      'Invoice {{invoice_number}} for {{customer_name}} {{unknown_token}} {{amount}}',
      vars,
    )
    expect(text).toContain('BD2026-0051')
    expect(text).toContain('Ada')
    expect(text).toContain('$50.00')
    expect(text).not.toContain('unknown_token')
  })

  it('detects header injection', () => {
    expect(containsHeaderInjection('hello\nbcc: evil@x.com')).toBe(true)
    expect(containsHeaderInjection('hello\r\nSubject: x')).toBe(true)
    expect(containsHeaderInjection('Ada Lovelace')).toBe(false)
  })
})
