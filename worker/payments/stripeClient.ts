export type StripePaymentIntent = {
  id: string
  clientSecret: string
  amount: number
  currency: string
  status: string
}

export type StripeConfirmationPreview = {
  id: string
  paymentMethodType: string
  walletType: string | null
}

export type CreatePaymentIntentInput = {
  amount: number
  currency: string
  idempotencyKey: string
  metadata: Record<string, string>
  description?: string
  receiptEmail?: string
  statementDescriptor?: string
  paymentMethodTypes?: string[]
}

export type ConfirmWithTokenInput = {
  amount: number
  currency: string
  confirmationTokenId: string
  idempotencyKey: string
  returnUrl: string
  metadata: Record<string, string>
  description?: string
  receiptEmail?: string
  statementDescriptor?: string
  paymentMethodTypes?: string[]
}

export interface StripeGateway {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<StripePaymentIntent>
  retrieveConfirmationToken(id: string): Promise<StripeConfirmationPreview>
  confirmWithToken(input: ConfirmWithTokenInput): Promise<StripePaymentIntent>
}

const STRIPE_API_VERSION = '2024-11-20.acacia'

export function createStripeGateway(secretKey: string): StripeGateway {
  return {
    async createPaymentIntent(input) {
      const body = new URLSearchParams()
      body.set('amount', String(input.amount))
      body.set('currency', input.currency.toLowerCase())
      if (input.paymentMethodTypes && input.paymentMethodTypes.length > 0) {
        for (const type of input.paymentMethodTypes) {
          body.append('payment_method_types[]', type)
        }
      } else {
        body.set('automatic_payment_methods[enabled]', 'true')
      }
      writePaymentIntentIdentity(body, input)
      return stripePaymentIntent(
        await stripeRequest(secretKey, '/v1/payment_intents', body, input.idempotencyKey),
        input.amount,
        input.currency,
      )
    },

    async retrieveConfirmationToken(id) {
      const payload = await stripeRequest(
        secretKey,
        `/v1/confirmation_tokens/${encodeURIComponent(id)}`,
      )
      const preview = isRecord(payload.payment_method_preview)
        ? payload.payment_method_preview
        : {}
      const type =
        typeof preview.type === 'string' ? preview.type : ''
      const card = isRecord(preview.card) ? preview.card : {}
      const wallet = isRecord(card.wallet) ? card.wallet : {}
      const walletType = typeof wallet.type === 'string' ? wallet.type : null
      if (!payload.id || !type) {
        throw new Error('Stripe confirmation token is missing a payment method.')
      }
      return {
        id: String(payload.id),
        paymentMethodType: type,
        walletType,
      }
    },

    async confirmWithToken(input) {
      const body = new URLSearchParams()
      body.set('amount', String(input.amount))
      body.set('currency', input.currency.toLowerCase())
      body.set('confirm', 'true')
      body.set('confirmation_token', input.confirmationTokenId)
      body.set('return_url', input.returnUrl)
      body.set('use_stripe_sdk', 'true')
      const types = input.paymentMethodTypes ?? []
      if (types.length > 0) {
        for (const type of types) {
          body.append('payment_method_types[]', type)
        }
      } else {
        body.set('automatic_payment_methods[enabled]', 'true')
      }
      if (types.includes('us_bank_account') || types.length === 0) {
        body.set(
          'payment_method_options[us_bank_account][verification_method]',
          'automatic',
        )
        body.append(
          'payment_method_options[us_bank_account][financial_connections][permissions][]',
          'payment_method',
        )
      }
      writePaymentIntentIdentity(body, input)
      return stripePaymentIntent(
        await stripeRequest(
          secretKey,
          '/v1/payment_intents',
          body,
          input.idempotencyKey,
        ),
        input.amount,
        input.currency,
      )
    },
  }
}

/**
 * Description, metadata, and receipt_email are parameters of
 * POST /v1/payment_intents. Stripe's restricted-key permission for that
 * request is PaymentIntents write. They do not call Customers, Charges,
 * or any other resource.
 */
function writePaymentIntentIdentity(
  body: URLSearchParams,
  input: {
    metadata: Record<string, string>
    description?: string
    receiptEmail?: string
    statementDescriptor?: string
  },
): void {
  const description = input.description?.trim()
  if (description) {
    body.set('description', description)
  }
  const receiptEmail = input.receiptEmail?.trim()
  if (receiptEmail) {
    body.set('receipt_email', receiptEmail)
  }
  for (const [key, value] of Object.entries(input.metadata)) {
    const trimmed = value.trim()
    if (trimmed) {
      body.set(`metadata[${key}]`, trimmed)
    }
  }
  if (input.statementDescriptor) {
    body.set(
      'statement_descriptor_suffix',
      input.statementDescriptor.slice(0, 22),
    )
  }
}

async function stripeRequest(
  secretKey: string,
  path: string,
  body?: URLSearchParams,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Version': STRIPE_API_VERSION,
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body
      ? { ...headers, 'content-type': 'application/x-www-form-urlencoded' }
      : headers,
    body,
  })
  const payload = (await response.json()) as Record<string, unknown> & {
    error?: { message?: string }
  }
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Stripe request failed.')
  }
  return payload
}

function stripePaymentIntent(
  payload: Record<string, unknown>,
  fallbackAmount: number,
  fallbackCurrency: string,
): StripePaymentIntent {
  const id = typeof payload.id === 'string' ? payload.id : ''
  const clientSecret =
    typeof payload.client_secret === 'string' ? payload.client_secret : ''
  if (!id || !clientSecret) {
    throw new Error('Stripe PaymentIntent creation failed.')
  }
  return {
    id,
    clientSecret,
    amount: typeof payload.amount === 'number' ? payload.amount : fallbackAmount,
    currency:
      typeof payload.currency === 'string' ? payload.currency : fallbackCurrency,
    status: typeof payload.status === 'string' ? payload.status : 'requires_payment_method',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
