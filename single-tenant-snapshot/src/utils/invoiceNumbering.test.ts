import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NUMBERING,
  formatInvoiceNumber,
} from './invoiceNumbering.ts'

describe('formatInvoiceNumber', () => {
  it('glues prefix and year, then separator and padded sequence', () => {
    expect(
      formatInvoiceNumber(
        { prefix: 'BD', includeYear: true, separator: '-', padding: 4 },
        51,
        2026,
      ),
    ).toBe('BD2026-0051')
  })

  it('puts a dash around the year when the prefix includes one', () => {
    expect(
      formatInvoiceNumber(
        { prefix: 'BD-', includeYear: true, separator: '-', padding: 4 },
        51,
        2026,
      ),
    ).toBe('BD-2026-0051')
  })

  it('omits the year when includeYear is false', () => {
    expect(
      formatInvoiceNumber(
        { prefix: 'BD', includeYear: false, separator: '-', padding: 4 },
        51,
        2026,
      ),
    ).toBe('BD-0051')
  })

  it('does not reset or reuse a sequence when the year changes', () => {
    const config = DEFAULT_NUMBERING
    const in2026 = formatInvoiceNumber(config, 51, 2026)
    const in2027 = formatInvoiceNumber(config, 52, 2027)
    expect(in2026).toBe('BD2026-0051')
    expect(in2027).toBe('BD2027-0052')
    expect(in2026).not.toBe(in2027)
  })

  it('pads according to the configured length', () => {
    expect(
      formatInvoiceNumber(
        { prefix: 'BD', includeYear: false, separator: '', padding: 3 },
        7,
        2026,
      ),
    ).toBe('BD007')
  })
})
