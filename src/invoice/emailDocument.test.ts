import { describe, expect, it } from 'vitest'
import { defaultGraphicalEmailBody } from './emailBlocks.ts'
import { defaultRichEmailBody } from './emailCompose.ts'
import { caretAfterLastChip, ensureTrailingEditableGap } from './emailCaret.ts'
import {
  canonicalizeEmailBody,
  defaultEmailBlocks,
  defaultEmailDocumentHtml,
  documentToEditorHtml,
  editorHtmlToDocument,
  readEmailBlocks,
  renderEmailBlocks,
  writeEmailBlocks,
} from './emailDocument.ts'
import {
  prepareInvoiceEmail,
  SAMPLE_EMAIL_BRAND,
  SAMPLE_EMAIL_VARS,
} from './emailHtml.ts'
import { applyEmailTemplate, DEFAULT_EMAIL_SUBJECT } from './emailTemplates.ts'

const BRAND = {
  logoUrl: 'https://pay.example.com/branding/bitz-designs-icon.png',
  wordmarkUrl: 'https://pay.example.com/branding/bitz-designs-wordmark.png',
}

function prepared(body: string) {
  return prepareInvoiceEmail(body, SAMPLE_EMAIL_VARS, BRAND, {
    preheader: applyEmailTemplate(DEFAULT_EMAIL_SUBJECT, SAMPLE_EMAIL_VARS),
  })
}

describe('email block document', () => {
  it('migrates the previous default message into the same blocks as the new default', () => {
    const migrated = writeEmailBlocks(readEmailBlocks(defaultRichEmailBody()))
    expect(migrated).toBe(defaultEmailDocumentHtml())
    expect(writeEmailBlocks(readEmailBlocks(migrated))).toBe(migrated)
  })

  it('stabilizes a legacy graphical template', () => {
    const once = canonicalizeEmailBody(defaultGraphicalEmailBody())
    expect(canonicalizeEmailBody(once)).toBe(once)
    expect(once).toContain('<!--email-doc:v3-->')
    expect(once).toContain('Hello {{customer_name}},')
    expect(once).not.toContain('{{zelle_email}}')
  })

  it('renders the settings preview and the sent email as the same html', () => {
    const legacy = defaultGraphicalEmailBody()
    const saved = canonicalizeEmailBody(legacy)
    const preview = prepared(legacy)
    const sent = prepared(saved)
    expect(sent.html).toBe(preview.html)
    expect(sent.text).toBe(preview.text)
    expect(sent.html).not.toContain('email-doc:v2')
    expect(sent.html).not.toContain('email-doc:v3')
    expect(sent.html).not.toContain('email-block')
    expect(sent.html).not.toContain('border-radius:999px')
    expect(sent.html).not.toContain('data-email-var')
    expect(preview.html).toContain('Hello Ada Lovelace,')
    expect(preview.html).toContain('A PDF copy of this invoice is attached to this email.')
    expect(preview.html).toContain('Sent by Bitz Designs')
    expect(preview.html).toContain('class="email-logo"')
  })

  it('omits a block from the sent html when it is hidden', () => {
    const hidden = (type: string) =>
      prepared(
        writeEmailBlocks(
          defaultEmailBlocks().map((block) =>
            block.type === type ? { ...block, enabled: false } : block,
          ),
        ),
      ).html

    expect(hidden('header')).not.toContain('class="email-logo"')
    expect(hidden('header')).not.toContain('bitz-designs-icon')
    expect(hidden('amount')).not.toContain('Amount due')
    expect(hidden('amount')).not.toContain('$50.00')
    expect(hidden('button')).not.toContain('Pay Online')
    expect(hidden('link')).not.toContain('If the button does not work')
    expect(hidden('attachment')).not.toContain('A PDF copy of this invoice is attached')
    expect(hidden('footer')).not.toContain('Sent by')
    const withoutZelle = prepared(defaultEmailDocumentHtml()).html
    expect(withoutZelle).not.toContain('billing@bitzdesigns.co')
    expect(withoutZelle).toContain('Please pay by Zelle using your invoice number as the memo.')
  })

  it('keeps a custom note from gaining a pay button, and still migrates the old chrome', () => {
    const html = prepared('<p>Custom intro only.</p>').html
    expect(html).toContain('Custom intro only.')
    expect(html).not.toContain('Pay Online')
    expect(html).toContain('A PDF copy of this invoice is attached to this email.')
    expect(html).toContain('Sent by Bitz Designs')
    expect(html).toContain('class="email-logo"')
  })

  it('follows block order and drops pasted chip styling', () => {
    const blocks = defaultEmailBlocks()
    const footer = blocks.find((block) => block.type === 'footer')
    const rest = blocks.filter((block) => block.type !== 'footer')
    const html = renderEmailBlocks(footer ? [footer, ...rest] : rest, SAMPLE_EMAIL_BRAND)
    expect(html.indexOf('Sent by')).toBeLessThan(html.indexOf('email-logo'))
    const pasted = writeEmailBlocks(
      readEmailBlocks(
        `<p style="color:#111111"><span style="color:#000;background:#ecfdf5;border-radius:999px">Hello</span> {{customer_name}}</p>`,
      ),
    )
    const sent = prepared(pasted).html
    expect(sent).toContain('Hello')
    expect(sent).not.toContain('border-radius:999px')
    expect(sent).not.toContain('#ecfdf5')
  })

  it('edits the whole letter as one document and round-trips it', () => {
    const editor = documentToEditorHtml(defaultEmailDocumentHtml(), BRAND)
    expect(editor).toContain('Hello')
    expect(editor).toContain('Pay Online')
    expect(editor).toContain('Amount due')
    expect(editor).toContain('If the button does not work')
    expect(editor).toContain('A PDF copy of this invoice is attached to this email.')
    expect(editor).toContain('Sent by')
    expect(editor).toContain('class="email-logo"')
    expect(editor).not.toContain('email-block')
    expect(editorHtmlToDocument(editor)).toBe(defaultEmailDocumentHtml())
    const withChrome = editor.replace(
      'Hello',
      '<button data-email-chrome="grip" type="button"><i></i></button><span data-email-chrome="outline"></span>Hello',
    )
    expect(editorHtmlToDocument(withChrome)).toBe(defaultEmailDocumentHtml())

    const withoutButton = editor.replace(/<p data-email-part="button"[\s\S]*?<\/p>/, '')
    const sent = prepared(editorHtmlToDocument(withoutButton)).html
    expect(sent).not.toContain('Pay Online')
    expect(sent).toContain('Hello Ada Lovelace,')
    expect(sent).toContain('Sent by Bitz Designs')
  })

  it('paints paragraph and email spacing inline, the same in preview and the sent html', () => {
    const editor = [
      '<div data-email-part="spacing" data-line-height="1.15" data-space-before="small" data-space-after="large"></div>',
      '<p data-line-height="2" data-space-after="none">Tight lines stay put.</p>',
      '<p>Hello {{customer_name}},</p>',
    ].join('')
    const saved = editorHtmlToDocument(editor)
    expect(saved).toContain('data-line-height="1.15"')
    expect(saved).toContain('data-line-height="2"')
    expect(saved).toContain('data-space-after="none"')
    const roundTrip = editorHtmlToDocument(documentToEditorHtml(saved))
    expect(roundTrip).toBe(saved)

    const preview = prepared(saved)
    const sent = prepared(roundTrip)
    expect(sent.html).toBe(preview.html)
    expect(sent.html).toContain(
      'style="margin:8px 0 0;font-size:16px;line-height:2;color:#111111;"',
    )
    expect(sent.html).toContain(
      'style="margin:8px 0 28px;font-size:16px;line-height:1.15;color:#111111;"',
    )
    expect(sent.html).toContain('Hello Ada Lovelace,')
    expect(sent.html).not.toContain('data-email-var')
  })

  it('deletes a trailing payment-link chip and leaves it out after save, reload, and send', () => {
    const editor = documentToEditorHtml(defaultEmailDocumentHtml(), BRAND)
    expect(editor).toContain('data-email-var="payment_url"')
    const removed = editor.replace(
      /<br><span\b[^>]*data-email-var="payment_url"[^>]*>[\s\S]*?<\/span>/i,
      '',
    )
    expect(removed).not.toContain('data-email-var="payment_url"')

    const saved = editorHtmlToDocument(removed)
    const link = readEmailBlocks(saved).find((block) => block.type === 'link')
    expect(link).toMatchObject({
      showUrl: false,
      lead: 'If the button does not work, open this secure link:',
    })

    const reloaded = documentToEditorHtml(saved, BRAND)
    expect(reloaded).not.toContain('data-email-var="payment_url"')
    expect(reloaded).not.toContain('Payment link')
    expect(editorHtmlToDocument(reloaded)).toBe(saved)

    const sent = prepared(saved).html
    const fallback = sent.slice(sent.indexOf('If the button does not work'))
    expect(fallback.startsWith('If the button does not work')).toBe(true)
    expect(fallback).not.toContain('pay.example.com')
    expect(fallback).not.toContain('{{payment_url}}')
    expect(sent).toContain('Pay Online')
  })

  it('keeps a removed payment-link chip out when that chip was the last line', () => {
    const html = [
      '<p data-email-part="attachment">A PDF copy of this invoice is attached to this email.</p>',
      '<p data-email-part="footer">Sent by <span data-email-var="business_name" contenteditable="false">Business name</span></p>',
      '<p data-email-part="link" data-lead="If the button does not work, open this secure link:" data-url="1">If the button does not work, open this secure link:<br><span data-email-var="payment_url" contenteditable="false">Payment link</span></p>',
    ].join('')
    const removed = html.replace(
      /<br><span\b[^>]*data-email-var="payment_url"[^>]*>[\s\S]*?<\/span>/i,
      '',
    )
    const saved = editorHtmlToDocument(removed)
    const reloaded = documentToEditorHtml(saved)
    expect(reloaded).not.toContain('payment_url')
    expect(reloaded).not.toContain('Payment link')
    expect(prepared(saved).html).not.toContain('pay.example.com')
    expect(prepared(saved).html).not.toContain('{{payment_url}}')
    expect(prepared(saved).html).toContain('Sent by Bitz Designs')
  })

  it('places an editable caret after the last chip, including a payment link at the end', () => {
    const editor = documentToEditorHtml(defaultEmailDocumentHtml(), BRAND)
    const placed = caretAfterLastChip(editor)
    expect(placed).not.toBeNull()
    const chipEnd = placed!.html.lastIndexOf('</span>') + '</span>'.length
    expect(placed!.index).toBeGreaterThan(chipEnd)
    expect(placed!.html.slice(placed!.index - 20, placed!.index)).toContain('data-email-gap')
    expect(placed!.html.slice(placed!.index)).toBe('<br></p>')
    expect(editorHtmlToDocument(ensureTrailingEditableGap(editor))).toBe(defaultEmailDocumentHtml())

    const trailingLink = [
      '<p data-email-part="footer">Sent by <span data-email-var="business_name" contenteditable="false">Business name</span></p>',
      '<p data-email-part="link" data-url="1">Open this secure link:<br><span data-email-var="payment_url" contenteditable="false">Payment link</span></p>',
    ].join('')
    const afterLink = caretAfterLastChip(trailingLink)
    expect(afterLink).not.toBeNull()
    const linkChip = afterLink!.html.lastIndexOf('data-email-var="payment_url"')
    expect(afterLink!.index).toBeGreaterThan(linkChip)
    expect(afterLink!.html.slice(afterLink!.index)).toBe('<br></p>')
    expect(afterLink!.html.slice(0, afterLink!.index)).toContain('Payment link')
  })
})
