export type PublicInvoiceState =
  | 'payable'
  | 'paid'
  | 'void'
  | 'invalid'
  | 'processing'

export type PublicInvoiceLine = {
  description: string
  quantity: string
  unitPrice: string
  amount: string
}

export type PublicInvoice = {
  number: string
  customerName: string
  businessName: string
  issueDate: string
  dueDate: string
  currency: string
  lineItems: PublicInvoiceLine[]
  amountDue: string
  amountDueCents: number
  cardFeeCents: number
  cardTotalCents: number
  cardFee: string
  cardTotal: string
  cardPaymentAvailable: boolean
  achPaymentAvailable: boolean
  paymentMethodTypes: string[]
  stripePublishableKey: string | null
  logoPath: string
  pendingKind: 'ach' | 'card' | null
}

export type PublicPaymentSession = {
  mode?: 'payment'
  status?: 'processing' | 'requires_action'
  currency: string
  invoiceAmountCents: number
  cardFeeCents: number
  cardTotalCents?: number
  chargeAmountCents: number
  paymentMethodTypes: string[]
  cardPaymentAvailable?: boolean
  achPaymentAvailable?: boolean
  clientSecret?: string | null
}

export type PublicPaymentConfirmResponse = {
  paymentIntentId: string
  clientSecret: string
  status: string
  currency: string
  invoiceAmountCents: number
  surchargeCents: number
  chargeAmountCents: number
  category: 'card' | 'ach'
  paidMethod?: string
}

const PUBLIC_FETCH: RequestInit = {
  // Do not send Cloudflare Access cookies from invoice.vrfnw.com to pay.vrfnw.com.
  credentials: 'omit',
  cache: 'no-store',
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(
      'Payment service returned a non-JSON response. Check that pay.vrfnw.com bypasses Cloudflare Access for /api/public/*.',
    )
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error
  }
  return fallback
}

export async function createPublicPaymentIntent(
  token: string,
): Promise<PublicPaymentSession> {
  const response = await fetch(
    `/api/public/invoices/${encodeURIComponent(token)}/payment-intent`,
    {
      ...PUBLIC_FETCH,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    },
  )
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(errorMessage(payload, 'Could not start payment.'))
  }
  return payload as PublicPaymentSession
}

export async function confirmPublicPayment(
  token: string,
  confirmationTokenId: string,
  returnUrl: string,
): Promise<PublicPaymentConfirmResponse> {
  const response = await fetch(
    `/api/public/invoices/${encodeURIComponent(token)}/confirm`,
    {
      ...PUBLIC_FETCH,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmationTokenId, returnUrl }),
    },
  )
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(errorMessage(payload, 'Could not complete payment.'))
  }
  return payload as PublicPaymentConfirmResponse
}

export type PublicInvoiceResponse = {
  state: PublicInvoiceState
  invoice: PublicInvoice | null
}

export async function fetchPublicInvoice(
  token: string,
  options: { signal?: AbortSignal } = {},
): Promise<PublicInvoiceResponse> {
  const response = await fetch(
    `/api/public/invoices/${encodeURIComponent(token)}`,
    {
      ...PUBLIC_FETCH,
      method: 'GET',
      signal: options.signal,
    },
  )
  const payload = await readJson(response)
  if (!payload || typeof payload !== 'object' || !('state' in payload)) {
    return { state: 'invalid', invoice: null }
  }
  const state = (payload as { state: unknown }).state
  if (typeof state !== 'string') {
    return { state: 'invalid', invoice: null }
  }
  return payload as PublicInvoiceResponse
}
