import { describe, expect, it } from 'vitest'
import { calculateInvoiceTotals } from '../utils/invoiceCalculations.ts'
import { createDefaultInvoice, createEmptyLineItem } from '../data/defaultInvoice.ts'
import { renderInvoiceHtml } from './invoiceHtml.ts'
import {
  defaultInvoiceFormat,
  resolveElementStyle,
  resolveFontId,
  resetSection,
  validateInvoiceFormat,
} from './format.ts'

describe('invoice HTML for PDF', () => {
  it('includes the base invoice total and excludes the card fee', () => {
    const invoice = createDefaultInvoice()
    invoice.number = 'BD2026-0051'
    invoice.payment.cardFeePercent = '3'
    invoice.payment.cardFeeFixed = '0.30'
    invoice.lineItems = [
      createEmptyLineItem({
        description: 'Design',
        quantity: '1',
        unitPrice: '50.00',
      }),
    ]
    const totals = calculateInvoiceTotals(invoice)
    const html = renderInvoiceHtml(invoice, defaultInvoiceFormat(), {
      origin: 'https://example.test',
      logoSrc: '/branding/bitz-designs-icon.png',
    })
    expect(html).toContain('$50.00')
    expect(html).not.toContain('$51.80')
    expect(html).not.toContain('$51.50')
    expect(totals.amountDueCents).toBe(5000)
    expect(totals.cardFeeCents).toBeGreaterThan(0)
    expect(html).toContain('BD2026-0051')
  })
})

describe('format settings', () => {
  it('validates global primary and secondary fonts', () => {
    const result = validateInvoiceFormat({
      global: { primaryFont: 'lora', secondaryFont: 'inter' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.global.primaryFont).toBe('lora')
      expect(result.value.global.secondaryFont).toBe('inter')
      expect(resolveFontId(result.value, 'primary')).toBe('lora')
      expect(resolveFontId(result.value, 'secondary')).toBe('inter')
    }
  })

  it('rejects invalid colors', () => {
    const result = validateInvoiceFormat({
      global: { primaryColor: 'red' },
    })
    expect(result.ok).toBe(false)
    const element = validateInvoiceFormat({
      elements: { headerTitle: { font: 'primary', sizePx: 28, weight: 700, color: '#fff' } },
    })
    expect(element.ok).toBe(false)
  })

  it('resolves per-element overrides', () => {
    const format = defaultInvoiceFormat()
    format.global.primaryFont = 'inter'
    format.global.secondaryFont = 'georgia'
    format.elements.fromName = {
      ...format.elements.fromName,
      font: 'secondary',
      sizePx: 18,
      weight: 700,
      color: '#222222',
    }
    const resolved = resolveElementStyle(format, 'fromName')
    expect(resolved.fontFamily).toContain('Georgia')
    expect(resolved.fontSize).toBe('18px')
    expect(resolved.color).toBe('#222222')
  })

  it('resets a section without wiping other sections', () => {
    const format = defaultInvoiceFormat()
    format.global.primaryColor = '#ff0000'
    format.elements.headerTitle.sizePx = 40
    format.elements.notesText.sizePx = 20
    const afterHeader = resetSection(format, 'header')
    expect(afterHeader.elements.headerTitle.sizePx).toBe(28)
    expect(afterHeader.elements.notesText.sizePx).toBe(20)
    expect(afterHeader.global.primaryColor).toBe('#ff0000')
    const afterGlobal = resetSection(afterHeader, 'global')
    expect(afterGlobal.global.primaryColor).toBe('#111111')
    expect(afterGlobal.elements.notesText.sizePx).toBe(20)
  })

  it('keeps a stored format snapshot stable when current settings change', () => {
    const snapshot = defaultInvoiceFormat()
    snapshot.global.primaryFont = 'lora'
    snapshot.global.primaryColor = '#1a1a1a'
    const stored = JSON.stringify(snapshot)
    const current = defaultInvoiceFormat()
    current.global.primaryFont = 'inter'
    current.global.primaryColor = '#ff00ff'
    const restored = validateInvoiceFormat(JSON.parse(stored))
    expect(restored.ok).toBe(true)
    if (restored.ok) {
      const html = renderInvoiceHtml(createDefaultInvoice(), restored.value, {
        origin: 'https://example.test',
        logoSrc: '/branding/bitz-designs-icon.png',
      })
      expect(html).toContain('Lora')
      expect(html).toContain('#1a1a1a')
      expect(html).not.toContain('#ff00ff')
    }
  })
})
