import { describe, expect, it } from 'vitest'
import { invoicePdfFilename, sanitizeInvoiceFilenamePart } from './invoiceFilename.ts'

describe('invoice PDF filenames', () => {
  it('uses a sensible Invoice-NUMBER.pdf name', () => {
    expect(invoicePdfFilename('BD2026-0051')).toBe('Invoice-BD2026-0051.pdf')
  })

  it('marks unsaved drafts clearly', () => {
    expect(invoicePdfFilename('BD2026-0051', { draft: true })).toBe(
      'Invoice-BD2026-0051-DRAFT.pdf',
    )
  })

  it('sanitizes unsafe characters and empty numbers', () => {
    expect(sanitizeInvoiceFilenamePart('BD 2026/0051')).toBe('BD-2026-0051')
    expect(sanitizeInvoiceFilenamePart('../etc/passwd')).toBe('etc-passwd')
    expect(sanitizeInvoiceFilenamePart('   ')).toBe('draft')
    expect(invoicePdfFilename('')).toBe('Invoice-draft.pdf')
  })
})
