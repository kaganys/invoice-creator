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
  absolutePublicAssetUrl,
  prepareInvoiceEmail,
  SAMPLE_EMAIL_BRAND,
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

  it('substitutes payment_url only when provided', () => {
    const invoice = createDefaultInvoice()
    const blank = invoiceTemplateVars(invoice)
    expect(blank.payment_url).toBe('')
    expect(applyEmailTemplate('Pay {{payment_url}}', blank)).toBe('Pay ')
    const withUrl = invoiceTemplateVars(invoice, {
      paymentUrl: 'https://pay.example.com/i/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
    })
    expect(applyEmailTemplate('Pay {{payment_url}}', withUrl)).toContain(
      'https://pay.example.com/i/',
    )
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
        payment_url: '',
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

  it('does not inject a header, attachment note, or footer around arbitrary html', () => {
    const html = wrapInvoiceEmailHtml('<p>Hello</p>', {
      businessName: 'Bitz Designs',
      logoUrl: 'https://pay.example.com/branding/bitz-designs-icon.png',
      wordmarkUrl: 'https://pay.example.com/branding/bitz-designs-wordmark.png',
    })
    expect(html).toContain('<p>Hello</p>')
    expect(html).not.toContain('class="email-logo"')
    expect(html).not.toContain('A PDF copy of this invoice is attached')
    expect(html).not.toContain('Sent by')
  })

  it('puts the site logo and wordmark in the default header block', () => {
    const html = prepareInvoiceEmail(
      DEFAULT_EMAIL_BODY,
      {
        invoice_number: 'BD2026-0051',
        customer_name: 'Ada',
        business_name: 'Bitz Designs',
        amount: '$50.00 USD',
        due_date: 'soon',
        zelle_email: 'a@b.co',
        payment_memo: 'memo',
        payment_url: 'https://pay.example.com/i/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      },
      {
        logoUrl: 'https://pay.example.com/branding/bitz-designs-icon.png',
        wordmarkUrl: 'https://pay.example.com/branding/bitz-designs-wordmark.png',
      },
    ).html
    expect(html).toContain(
      'src="https://pay.example.com/branding/bitz-designs-icon.png"',
    )
    expect(html).toContain(
      'src="https://pay.example.com/branding/bitz-designs-wordmark.png"',
    )
    expect(html.indexOf('bitz-designs-icon.png')).toBeLessThan(html.indexOf('Hello'))
    expect(html.indexOf('bitz-designs-wordmark.png')).toBeLessThan(html.indexOf('Hello'))
    expect(html).toContain('bgcolor="#111111"')
    expect(html).toContain('class="email-logo"')
    expect(html).toContain('class="email-wordmark"')
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
    expect(DEFAULT_EMAIL_BODY).toContain('{{payment_url}}')
    expect(DEFAULT_EMAIL_BODY).toContain('Pay Online')
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

  it('renders a clickable Pay Online button and visible fallback URL in the default email', () => {
    const invoice = createDefaultInvoice()
    invoice.number = 'BD2026-0051'
    invoice.customer.name = 'Ada'
    invoice.lineItems = [
      createEmptyLineItem({ quantity: '1', unitPrice: '50.00' }),
    ]
    const paymentUrl =
      'https://pay.example.com/i/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'

    const prepared = prepareInvoiceEmail(
      DEFAULT_EMAIL_BODY,
      invoiceTemplateVars(invoice, { paymentUrl }),
      {
        logoUrl: absolutePublicAssetUrl(
          'https://pay.example.com',
          SAMPLE_EMAIL_BRAND.logoUrl ?? '',
        ),
        wordmarkUrl: absolutePublicAssetUrl(
          'https://pay.example.com',
          SAMPLE_EMAIL_BRAND.wordmarkUrl ?? '',
        ),
      },
    )

    expect(prepared.html).toContain(`href="${paymentUrl}"`)
    expect(prepared.html).toContain('Pay Online')
    expect(prepared.html).toContain('background:#24352c')
    expect(prepared.html).toContain(paymentUrl)
    expect(prepared.html).toContain(
      'src="https://pay.example.com/branding/bitz-designs-icon.png"',
    )
    expect(prepared.html).toContain(
      'src="https://pay.example.com/branding/bitz-designs-wordmark.png"',
    )
    expect(prepared.text).toContain('Pay Online')
    expect(prepared.text).toContain(paymentUrl)
  })

  it('absolutizes branding asset paths for email clients', () => {
    expect(
      absolutePublicAssetUrl(
        'https://pay.vrfnw.com',
        '/branding/bitz-designs-icon.png',
      ),
    ).toBe('https://pay.vrfnw.com/branding/bitz-designs-icon.png')
    expect(
      absolutePublicAssetUrl(
        'https://pay.vrfnw.com/',
        '/api/branding/file/branding%2Fsite-wordmark%2Faaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
      ),
    ).toBe(
      'https://pay.vrfnw.com/api/branding/file/branding%2Fsite-wordmark%2Faaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
    )
  })

  it('hides the default payment CTA block when no payment URL is available', () => {
    const invoice = createDefaultInvoice()
    const prepared = prepareInvoiceEmail(
      DEFAULT_EMAIL_BODY,
      invoiceTemplateVars(invoice),
    )

    expect(prepared.html).not.toContain('href=""')
    expect(prepared.html).not.toContain('Pay Online')
    expect(prepared.html).not.toContain('/i/')
  })
})
