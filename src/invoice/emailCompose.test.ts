import { describe, expect, it } from 'vitest'
import { defaultGraphicalEmailBody, emailBlockHtml } from './emailBlocks.ts'
import {
  defaultRichEmailBody,
  editorHtmlToSubject,
  editorHtmlToTemplate,
  emailSectionEnabled,
  emptyEmailSections,
  readEmailDocument,
  setEmailSection,
  subjectToEditorHtml,
  templateToEditorHtml,
  writeEmailDocument,
} from './emailCompose.ts'
import { prepareInvoiceEmail, SAMPLE_EMAIL_VARS } from './emailHtml.ts'

describe('email compose document', () => {
  it('round-trips the default message with one payment memo and no extra Zelle line', () => {
    const body = defaultRichEmailBody()
    const again = writeEmailDocument(readEmailDocument(body))
    expect(emailSectionEnabled(again, 'amount')).toBe(true)
    expect(emailSectionEnabled(again, 'payment-memo')).toBe(true)
    expect(emailSectionEnabled(again, 'pay-button')).toBe(true)
    expect(emailSectionEnabled(again, 'zelle')).toBe(false)
    expect(again).toContain('{{customer_name}}')
    expect(again).toContain('{{payment_memo}}')
    expect(again).not.toContain('{{zelle_email}}')
    expect(again.match(/email-section:pay-button/g)).toHaveLength(1)
    const prepared = prepareInvoiceEmail(again, {
      ...SAMPLE_EMAIL_VARS,
      payment_memo: 'Please pay by Zelle using your invoice number as the memo.',
    })
    expect(prepared.html.match(/Please pay by Zelle/g)).toHaveLength(1)
    expect(prepared.html).not.toContain('Zelle:')
    expect(again).toBe(body)
  })

  it('turns Zelle on and off without leaving a second copy', () => {
    const withZelle = setEmailSection(defaultRichEmailBody(), 'zelle', true)
    expect(withZelle.match(/\{\{zelle_email\}\}/g)).toHaveLength(1)
    const prepared = prepareInvoiceEmail(withZelle, SAMPLE_EMAIL_VARS)
    expect(prepared.html.match(/billing@bitzdesigns.co/g)?.length).toBe(1)
    const without = setEmailSection(withZelle, 'zelle', false)
    expect(without).not.toContain('zelle_email')
    expect(emailSectionEnabled(without, 'payment-memo')).toBe(true)
  })

  it('stabilizes a legacy graphical message after one pass', () => {
    const once = writeEmailDocument(readEmailDocument(defaultGraphicalEmailBody()))
    expect(writeEmailDocument(readEmailDocument(once))).toBe(once)
    expect(emailSectionEnabled(once, 'zelle')).toBe(false)
    expect(emailSectionEnabled(once, 'payment-memo')).toBe(true)
  })

  it('folds a legacy payment block into separate toggles', () => {
    const legacy = `<!--email-block:payment-->${emailBlockHtml('payment')}<!--/email-block-->
<p>Hello {{customer_name}}</p>`
    const saved = writeEmailDocument(readEmailDocument(legacy))
    expect(emailSectionEnabled(saved, 'payment-memo')).toBe(true)
    expect(emailSectionEnabled(saved, 'zelle')).toBe(false)
    expect(saved.match(/\{\{payment_memo\}\}/g)).toHaveLength(1)
    expect(saved).not.toContain('{{zelle_email}}')
    expect(writeEmailDocument(readEmailDocument(saved))).toBe(saved)
  })

  it('keeps bold, italic, links, lists, and alignment in email-safe HTML', () => {
    const dirty = [
      '<div align="center"><b>Hello</b> <i>there</i></div>',
      '<ul><li>One</li><li>Two</li></ul>',
      '<p><a href="https://example.com">Site</a></p>',
      '<p><a href="javascript:alert(1)">bad</a></p>',
      '<script>alert(1)</script>',
    ].join('')
    const saved = editorHtmlToTemplate(dirty, emptyEmailSections())
    expect(saved).toContain('<strong>Hello</strong>')
    expect(saved).toContain('<em>there</em>')
    expect(saved).toContain('text-align:center')
    expect(saved).toContain('<ul')
    expect(saved).toContain('<li>One</li>')
    expect(saved).toContain('href="https://example.com"')
    expect(saved).not.toContain('javascript:')
    expect(saved).not.toContain('<script')
  })

  it('shows variable chips in the editor and saves merge fields', () => {
    const editor = templateToEditorHtml(
      '<p>Invoice {{invoice_number}} for {{customer_name}}</p>',
    )
    expect(editor).toContain('data-email-var="invoice_number"')
    expect(editor).toContain('Invoice number')
    expect(editor).not.toContain('{{invoice_number}}')
    const saved = editorHtmlToTemplate(editor, emptyEmailSections())
    expect(saved).toContain('{{invoice_number}}')
    expect(saved).toContain('{{customer_name}}')
    expect(saved).not.toContain('data-email-var')
  })

  it('edits the subject with chips and rejects line breaks', () => {
    const editor = subjectToEditorHtml('Invoice {{invoice_number}} from {{business_name}}')
    expect(editor).toContain('data-email-var="business_name"')
    expect(editorHtmlToSubject(`${editor}<br>bcc: evil@example.com`)).toBe(
      'Invoice {{invoice_number}} from {{business_name}} bcc: evil@example.com',
    )
    expect(editorHtmlToSubject(editor)).not.toMatch(/[\r\n]/)
  })
})
