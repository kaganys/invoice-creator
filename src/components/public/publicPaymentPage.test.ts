import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

describe('public card payment page source', () => {
  it('has no Zelle option or payment-method selector', () => {
    const page = readFileSync(join(here, 'PublicInvoicePage.tsx'), 'utf8')
    const checkout = readFileSync(join(here, 'CardCheckout.tsx'), 'utf8')
    const css = readFileSync(join(here, 'PublicInvoicePage.css'), 'utf8')

    expect(page).not.toMatch(/zelle/i)
    expect(page).not.toMatch(/payment method/i)
    expect(page).not.toMatch(/role="tablist"/)
    expect(page).toContain('CardCheckout')
    expect(page).toContain('fetchInvoiceWhenReady')
    expect(checkout).toContain('Total charged')
    expect(checkout).toContain('Invoice amount')
    expect(checkout).toContain('Card processing fee')
    expect(checkout).toContain('Pay ${amountLabel}')
    expect(checkout).toContain("mode: 'payment'")
    expect(checkout).toContain('createConfirmationToken')
    expect(checkout).toContain('Bank payment submitted')
    expect(checkout).toContain('ExpressCheckoutElement')
    expect(checkout).toContain('expressWalletOptions')
    expect(checkout).toContain('cardWalletLineItems')
    expect(checkout).toContain('await queueAmountUpdate(total)')
    expect(checkout).toContain('checkoutPaymentMethodTypes')
    expect(checkout).toContain('allowedPaymentMethodTypes')
    expect(checkout).not.toContain('allowedStripeTypes')
    expect(checkout).toContain('financial_connections')
    expect(checkout).not.toMatch(/paymentMethodTypes: types/)
    expect(checkout).not.toMatch(/Please pay by Zelle/i)
    expect(css).not.toContain('public-pay__methods')
    expect(css).not.toContain('public-pay__zelle')
  })
})
