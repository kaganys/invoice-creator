import { describe, expect, it } from 'vitest'
import { validateDefaultsWrite } from './defaults.ts'

describe('validateDefaultsWrite', () => {
  it('accepts built-in style defaults', () => {
    const result = validateDefaultsWrite({
      defaultFromId: null,
      zelleEmail: 'billing@bitzdesigns.co',
      cardFeePercent: '3',
      cardFeeFixed: '0.30',
      currency: 'usd',
      paymentMemo: 'Thanks',
      dueDays: 30,
      notes: '',
      country: '',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.currency).toBe('USD')
      expect(result.value.cardFeePercentScaled).toBe(300)
      expect(result.value.cardFeeFixedCents).toBe(30)
      expect(result.value.dueDays).toBe(30)
    }
  })

  it('rejects an invalid Zelle email', () => {
    const result = validateDefaultsWrite({
      zelleEmail: 'not-an-email',
      dueDays: 30,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a negative due period', () => {
    const result = validateDefaultsWrite({ dueDays: -1 })
    expect(result.ok).toBe(false)
  })

  it('rejects a non-integer due period', () => {
    const result = validateDefaultsWrite({ dueDays: 1.5 })
    expect(result.ok).toBe(false)
  })
})
