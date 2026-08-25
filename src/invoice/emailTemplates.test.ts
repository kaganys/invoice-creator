import { describe, expect, it } from 'vitest'
import { createDefaultInvoice, createEmptyLineItem } from '../data/defaultInvoice.ts'
import { EMAIL_BLOCKS } from './emailBlocks.ts'
import {
  applyEmailTemplate,
  applyEmailTemplateHtml,
  containsHeaderInjection,
  DEFAULT_EMAIL_BODY,
  invoiceTemplateVars,
} from './emailTemplates.ts'
import {
  htmlToPlainText,
  prepareInvoiceEmail,
  sanitizeEmailHtml,
  wrapInvoiceEmailHtml,
} from './emailHtml.ts'

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

  it('escapes HTML when substituting into an HTML template', () => {
    const html = applyEmailTemplateHtml(
      '<p>Hello {{customer_name}}</p><p>{{payment_memo}}</p>',
      {
        invoice_number: '1',
        customer_name: '<script>alert(1)</script>',
        business_name: 'Bitz',
        amount: '$1.00 USD',
        due_date: 'soon',
        zelle_email: 'a@b.co',
        payment_memo: 'Line 1\nLine 2',
      },
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('Line 1<br>Line 2')
  })
})

describe('HTML invoice email', () => {
  it('wraps content in a mobile-friendly HTML document', () => {
    const html = wrapInvoiceEmailHtml('<p>Hello</p>', {
      businessName: 'Bitz Designs',
      preheader: 'Invoice BD2026-0051',
    })
    expect(html).toContain('width=device-width')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('@media only screen and (max-width: 620px)')
    expect(html).toContain('<p>Hello</p>')
  })

  it('strips scripts from custom HTML', () => {
    expect(sanitizeEmailHtml('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>')
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')).not.toContain(
      'javascript:',
    )
  })

  it('ships graphical default blocks that still use merge fields', () => {
    expect(EMAIL_BLOCKS.length).toBeGreaterThanOrEqual(8)
    expect(DEFAULT_EMAIL_BODY).toContain('Amount due')
    expect(DEFAULT_EMAIL_BODY).toContain('{{invoice_number}}')
    expect(DEFAULT_EMAIL_BODY).toContain('{{amount}}')
  })

  it('prepares multipart HTML and text from a template', () => {
    const invoice = createDefaultInvoice()
    invoice.number = 'BD2026-0051'
    invoice.customer.name = 'Ada'
    invoice.lineItems = [
      createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
    ]
    const prepared = prepareInvoiceEmail(
      '<p>Invoice {{invoice_number}} is {{amount}}</p>',
      invoiceTemplateVars(invoice),
    )
    expect(prepared.html).toContain('BD2026-0051')
    expect(prepared.html).toContain('$50.00')
    expect(prepared.html).toContain('width=device-width')
    expect(prepared.text).toContain('BD2026-0051')
    expect(htmlToPlainText('<p>Hello <strong>Ada</strong></p>')).toContain('Hello Ada')
  })
})
