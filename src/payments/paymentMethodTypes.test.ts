import { describe, expect, it } from 'vitest'
import { checkoutPaymentMethodTypes } from './paymentMethodTypes.ts'

describe('checkoutPaymentMethodTypes', () => {
  it('uses the list Stripe Elements expects when card and ACH are both on', () => {
    expect(checkoutPaymentMethodTypes({ card: true, ach: true })).toEqual([
      'card',
      'us_bank_account',
      'link',
    ])
  })

  it('pairs Link with card and leaves wallets as card', () => {
    expect(checkoutPaymentMethodTypes({ card: true, ach: false })).toEqual([
      'card',
      'link',
    ])
    expect(checkoutPaymentMethodTypes({ card: true, ach: false })).not.toContain(
      'apple_pay',
    )
    expect(checkoutPaymentMethodTypes({ card: true, ach: false })).not.toContain(
      'google_pay',
    )
  })

  it('offers only a bank account when cards are off', () => {
    expect(checkoutPaymentMethodTypes({ card: false, ach: true })).toEqual([
      'us_bank_account',
    ])
  })

  it('returns nothing when neither method is ready', () => {
    expect(checkoutPaymentMethodTypes({ card: false, ach: false })).toEqual([])
  })
})
