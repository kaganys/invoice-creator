import { describe, expect, it } from 'vitest'
import { formatInvoiceDate } from './dates.ts'

describe('formatInvoiceDate', () => {
  it('formats an ISO date without timezone shift', () => {
    expect(formatInvoiceDate('2026-08-25')).toBe('August 25, 2026')
    expect(formatInvoiceDate('2026-09-24')).toBe('September 24, 2026')
    expect(formatInvoiceDate('2026-01-01')).toBe('January 1, 2026')
  })

  it('returns an empty string for invalid or incomplete values', () => {
    expect(formatInvoiceDate('')).toBe('')
    expect(formatInvoiceDate('not-a-date')).toBe('')
    expect(formatInvoiceDate('2026-13-01')).toBe('')
    expect(formatInvoiceDate('2026-02-31')).toBe('')
  })
})
