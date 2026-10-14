import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkoutPaymentMethodTypes } from '../../src/payments/paymentMethodTypes.ts'
import { createStripeGateway } from './stripeClient.ts'

describe('confirmWithToken payment method types', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the checkout list in the same order Elements sends', async () => {
    const types = checkoutPaymentMethodTypes({ card: true, ach: true })
    let posted = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        posted = String(init.body)
        return new Response(
          JSON.stringify({
            id: 'pi_test',
            client_secret: 'pi_test_secret',
            amount: 5180,
            currency: 'usd',
            status: 'succeeded',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }),
    )

    await createStripeGateway('sk_test_secret').confirmWithToken({
      amount: 5180,
      currency: 'usd',
      confirmationTokenId: 'ctoken_link',
      idempotencyKey: 'bitz-ct-test',
      returnUrl: 'https://pay.vrfnw.com/',
      metadata: { invoice_id: 'inv' },
      paymentMethodTypes: types,
    })

    const params = new URLSearchParams(posted)
    expect(params.getAll('payment_method_types[]')).toEqual([
      'card',
      'us_bank_account',
      'link',
    ])
    expect(params.get('automatic_payment_methods[enabled]')).toBeNull()
    expect(
      params.get('payment_method_options[us_bank_account][verification_method]'),
    ).toBe('automatic')
  })
})
