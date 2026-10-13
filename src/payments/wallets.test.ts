import { describe, expect, it } from 'vitest'
import { quoteForCategory } from './surcharge.ts'
import {
  cardWalletLineItems,
  expressWalletLayout,
  expressWalletOptions,
  walletAvailabilityFromChange,
  walletButtonsVisible,
  walletLineTotal,
} from './wallets.ts'

describe('cardWalletLineItems', () => {
  it('quotes Apple Pay and Google Pay at the card total', () => {
    const lines = cardWalletLineItems({
      invoiceNumber: 'BD2026-0051',
      invoiceAmountCents: 50_000,
      cardFeeCents: 1_500,
    })
    expect(lines).toEqual([
      { name: 'Invoice BD2026-0051', amount: 50_000 },
      { name: 'Card processing fee', amount: 1_500 },
    ])
    expect(walletLineTotal(lines)).toBe(
      quoteForCategory(50_000, 1_500, 'card').totalCents,
    )
  })

  it('omits a zero card fee', () => {
    const lines = cardWalletLineItems({
      invoiceNumber: 'BD2026-0052',
      invoiceAmountCents: 2_000,
      cardFeeCents: 0,
    })
    expect(lines).toEqual([{ name: 'Invoice BD2026-0052', amount: 2_000 }])
    expect(walletLineTotal(lines)).toBe(2_000)
  })

  it('ignores negative amounts', () => {
    const lines = cardWalletLineItems({
      invoiceNumber: 'BD2026-0053',
      invoiceAmountCents: -10,
      cardFeeCents: -5,
    })
    expect(walletLineTotal(lines)).toBe(0)
  })
})

describe('expressWalletOptions', () => {
  it('offers Apple Pay and Google Pay only when cards are enabled', () => {
    expect(expressWalletOptions(true)).toEqual({
      applePay: 'always',
      googlePay: 'always',
      link: 'never',
      paypal: 'never',
      amazonPay: 'never',
      klarna: 'never',
    })
    expect(expressWalletOptions(false).applePay).toBe('never')
    expect(expressWalletOptions(false).googlePay).toBe('never')
  })
})

describe('expressWalletLayout', () => {
  it('uses one column on a narrow screen and two on desktop', () => {
    expect(expressWalletLayout(true).maxColumns).toBe(1)
    expect(expressWalletLayout(false).maxColumns).toBe(2)
  })
})

describe('walletButtonsVisible', () => {
  it('shows the row for Apple Pay or Google Pay, not Link alone', () => {
    expect(walletButtonsVisible({ applePay: true, googlePay: false })).toBe(
      true,
    )
    expect(walletButtonsVisible({ applePay: false, googlePay: true })).toBe(
      true,
    )
    expect(walletButtonsVisible({ applePay: false, googlePay: false })).toBe(
      false,
    )
    expect(walletButtonsVisible(undefined)).toBe(false)
  })

  it('reads Stripe availability-change payloads', () => {
    expect(
      walletButtonsVisible(
        walletAvailabilityFromChange({
          applePay: { available: false },
          googlePay: { available: true },
          link: { available: true },
        }),
      ),
    ).toBe(true)
    expect(
      walletButtonsVisible(
        walletAvailabilityFromChange({
          link: { available: true },
        }),
      ),
    ).toBe(false)
  })
})
