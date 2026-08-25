export type StripePaymentIntent = {
  id: string
  clientSecret: string
  amount: number
  currency: string
  status: string
}

export type CreatePaymentIntentInput = {
  amount: number
  currency: string
  idempotencyKey: string
  metadata: Record<string, string>
  statementDescriptor?: string
}

export interface StripeGateway {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<StripePaymentIntent>
}

const STRIPE_API_VERSION = '2024-11-20.acacia'

export function createStripeGateway(secretKey: string): StripeGateway {
  return {
    async createPaymentIntent(input) {
      const body = new URLSearchParams()
      body.set('amount', String(input.amount))
      body.set('currency', input.currency.toLowerCase())
      body.set('automatic_payment_methods[enabled]', 'true')
      for (const [key, value] of Object.entries(input.metadata)) {
        body.set(`metadata[${key}]`, value)
      }
      if (input.statementDescriptor) {
        body.set(
          'statement_descriptor_suffix',
          input.statementDescriptor.slice(0, 22),
        )
      }
      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Stripe-Version': STRIPE_API_VERSION,
          'Idempotency-Key': input.idempotencyKey,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      })
      const payload = (await response.json()) as {
        id?: string
        client_secret?: string
        amount?: number
        currency?: string
        status?: string
        error?: { message?: string }
      }
      if (!response.ok || !payload.id || !payload.client_secret) {
        throw new Error(payload.error?.message || 'Stripe PaymentIntent creation failed.')
      }
      return {
        id: payload.id,
        clientSecret: payload.client_secret,
        amount: payload.amount ?? input.amount,
        currency: payload.currency ?? input.currency,
        status: payload.status ?? 'requires_payment_method',
      }
    },
  }
}
