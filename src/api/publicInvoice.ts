export type PublicInvoiceState = 'payable' | 'paid' | 'void' | 'invalid'

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
  stripePublishableKey: string | null
  logoPath: string
}

export type PublicPaymentIntentResponse = {
  clientSecret: string
  paymentIntentId: string
  currency: string
  invoiceAmountCents: number
  cardFeeCents: number
  chargeAmountCents: number
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

export async function createPublicPaymentIntent(
  token: string,
): Promise<PublicPaymentIntentResponse> {
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
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'Could not start card payment.'
    throw new Error(message)
  }
  return payload as PublicPaymentIntentResponse
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
