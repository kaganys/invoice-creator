import { describe, expect, it } from 'vitest'
import {
  classifyStripePaymentMethod,
  displayQuote,
  paidMethodFor,
  quoteForCategory,
} from './surcharge.ts'

describe('classifyStripePaymentMethod', () => {
  it('treats cards and card wallets as card-like', () => {
    expect(classifyStripePaymentMethod('card')).toBe('card')
    expect(classifyStripePaymentMethod('card', 'apple_pay')).toBe('card')
    expect(classifyStripePaymentMethod('card', 'google_pay')).toBe('card')
    expect(classifyStripePaymentMethod('link')).toBe('card')
    expect(classifyStripePaymentMethod(null, 'apple_pay')).toBe('card')
  })

  it('treats US bank account as ACH', () => {
    expect(classifyStripePaymentMethod('us_bank_account')).toBe('ach')
    expect(classifyStripePaymentMethod('ach_debit')).toBe('ach')
  })

  it('returns null for unknown types', () => {
    expect(classifyStripePaymentMethod('crypto')).toBeNull()
    expect(classifyStripePaymentMethod('')).toBeNull()
  })
})

describe('quoteForCategory', () => {
  it('applies the saved card fee only for card-like methods', () => {
    expect(quoteForCategory(50_000, 1500, 'card')).toEqual({
      category: 'card',
      baseCents: 50_000,
      surchargeCents: 1500,
      totalCents: 51_500,
    })
    expect(quoteForCategory(50_000, 1500, 'ach')).toEqual({
      category: 'ach',
      baseCents: 50_000,
      surchargeCents: 0,
      totalCents: 50_000,
    })
  })

  it('uses percent+fixed fee already baked into cardFeeCents', () => {
    const percentAndFixed = 1450 + 30
    expect(quoteForCategory(50_000, percentAndFixed, 'card').totalCents).toBe(
      51_480,
    )
    expect(quoteForCategory(50_000, percentAndFixed, 'ach').totalCents).toBe(
      50_000,
    )
  })
})

describe('displayQuote', () => {
  it('updates the displayed total when the selected method changes', () => {
    expect(displayQuote(50_000, 1500, 'card', 'card').totalCents).toBe(51_500)
    expect(displayQuote(50_000, 1500, 'apple_pay', 'card').totalCents).toBe(
      51_500,
    )
    expect(displayQuote(50_000, 1500, 'google_pay', 'card').totalCents).toBe(
      51_500,
    )
    expect(
      displayQuote(50_000, 1500, 'us_bank_account', 'card').totalCents,
    ).toBe(50_000)
    expect(displayQuote(50_000, 1500, 'us_bank_account', 'card')).toEqual({
      category: 'ach',
      baseCents: 50_000,
      surchargeCents: 0,
      totalCents: 50_000,
    })
  })
})

describe('paidMethodFor', () => {
  it('maps wallets when Stripe exposes them', () => {
    expect(paidMethodFor('card', 'apple_pay')).toBe('apple_pay')
    expect(paidMethodFor('card', 'google_pay')).toBe('google_pay')
    expect(paidMethodFor('card', null)).toBe('card')
    expect(paidMethodFor('ach')).toBe('ach')
  })
})
