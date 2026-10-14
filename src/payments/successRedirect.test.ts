import { describe, expect, it } from 'vitest'
import { payPageExitUrl, successRedirectTarget } from './successRedirect.ts'

describe('success redirect', () => {
  it('accepts https and appends the invoice number', () => {
    expect(
      successRedirectTarget('https://shop.example/thanks', 'BD2026-0051'),
    ).toBe('https://shop.example/thanks?invoice=BD2026-0051')
    expect(
      successRedirectTarget(
        'https://shop.example/thanks?src=email',
        'BD2026-0051',
      ),
    ).toBe('https://shop.example/thanks?src=email&invoice=BD2026-0051')
  })

  it('rejects blank, http, and non-http schemes', () => {
    expect(successRedirectTarget('', 'BD2026-0051')).toBeNull()
    expect(successRedirectTarget('   ', 'BD2026-0051')).toBeNull()
    expect(successRedirectTarget('http://shop.example/thanks', '1')).toBeNull()
    expect(successRedirectTarget('javascript:alert(1)', '1')).toBeNull()
    expect(successRedirectTarget('https://user:pass@shop.example/thanks', '1')).toBeNull()
  })

  it('leaves the pay page only after success or async processing', () => {
    const base = {
      successRedirectUrl: 'https://shop.example/thanks',
      invoiceNumber: 'BD2026-0051',
    }
    expect(
      payPageExitUrl({ ...base, paid: true, processing: false, failed: false }),
    ).toBe('https://shop.example/thanks?invoice=BD2026-0051')
    expect(
      payPageExitUrl({ ...base, paid: false, processing: true, failed: false }),
    ).toBe('https://shop.example/thanks?invoice=BD2026-0051')
    expect(
      payPageExitUrl({ ...base, paid: false, processing: false, failed: false }),
    ).toBeNull()
    expect(
      payPageExitUrl({ ...base, paid: false, processing: true, failed: true }),
    ).toBeNull()
    expect(
      payPageExitUrl({
        ...base,
        successRedirectUrl: '',
        paid: true,
        processing: false,
        failed: false,
      }),
    ).toBeNull()
  })
})