import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkoutPaymentMethodTypes } from '../../src/payments/paymentMethodTypes.ts'
import { createStripeGateway } from './stripeClient.ts'

function stubStripe() {
  const calls: Array<{ url: string; body: string }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body ?? '') })
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
  return calls
}

describe('Stripe PaymentIntent requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the checkout list in the same order Elements sends', async () => {
    const types = checkoutPaymentMethodTypes({ card: true, ach: true })
    const calls = stubStripe()

    await createStripeGateway('sk_test_secret').confirmWithToken({
      amount: 5180,
      currency: 'usd',
      confirmationTokenId: 'ctoken_link',
      idempotencyKey: 'bitz-ct-test',
      returnUrl: 'https://pay.vrfnw.com/',
      metadata: { invoice_id: 'inv' },
      paymentMethodTypes: types,
    })

    const params = new URLSearchParams(calls[0]?.body)
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.stripe.com/v1/payment_intents',
    ])
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

  it('sets description, metadata, and receipt email on create and confirm', async () => {
    const calls = stubStripe()
    const gateway = createStripeGateway('rk_test_restricted')
    const identity = {
      description: 'Invoice BD2026-0051 · Bitz Designs',
      receiptEmail: 'ada@example.com',
      metadata: {
        invoice_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        invoice_number: 'BD2026-0051',
        company_id: 'company-1',
        company_name: 'Northwind Studio',
        customer_name: 'Ada',
      },
    }

    await gateway.createPaymentIntent({
      amount: 5180,
      currency: 'usd',
      idempotencyKey: 'bitz-create',
      ...identity,
    })
    await gateway.confirmWithToken({
      amount: 5180,
      currency: 'usd',
      confirmationTokenId: 'ctoken_card',
      idempotencyKey: 'bitz-confirm',
      returnUrl: 'https://pay.vrfnw.com/',
      ...identity,
    })

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.stripe.com/v1/payment_intents',
      'https://api.stripe.com/v1/payment_intents',
    ])
    for (const call of calls) {
      const params = new URLSearchParams(call.body)
      expect(params.get('description')).toBe('Invoice BD2026-0051 · Bitz Designs')
      expect(params.get('receipt_email')).toBe('ada@example.com')
      expect(params.get('metadata[invoice_id]')).toBe(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      )
      expect(params.get('metadata[invoice_number]')).toBe('BD2026-0051')
      expect(params.get('metadata[company_id]')).toBe('company-1')
      expect(params.get('metadata[company_name]')).toBe('Northwind Studio')
      expect(params.get('metadata[customer_name]')).toBe('Ada')
      expect(call.body).not.toContain('/v1/customers')
      expect(call.body).not.toContain('/v1/charges')
    }
  })

  it('omits receipt_email when the customer has no email', async () => {
    const calls = stubStripe()
    await createStripeGateway('rk_test_restricted').confirmWithToken({
      amount: 5000,
      currency: 'usd',
      confirmationTokenId: 'ctoken_card',
      idempotencyKey: 'bitz-confirm',
      returnUrl: 'https://pay.vrfnw.com/',
      description: 'Invoice BD2026-0051 · Bitz Designs',
      metadata: { invoice_number: 'BD2026-0051' },
    })
    const params = new URLSearchParams(calls[0]?.body)
    expect(params.get('description')).toBe('Invoice BD2026-0051 · Bitz Designs')
    expect(params.get('receipt_email')).toBeNull()
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.stripe.com/v1/payment_intents',
    ])
  })
})
