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

export async function createPublicPaymentIntent(
  token: string,
): Promise<PublicPaymentIntentResponse> {
  const response = await fetch(
    `/api/public/invoices/${encodeURIComponent(token)}/payment-intent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    },
  )
  const payload: unknown = await response.json()
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
): Promise<PublicInvoiceResponse> {
  const response = await fetch(`/api/public/invoices/${encodeURIComponent(token)}`)
  const payload = (await response.json()) as PublicInvoiceResponse
  if (!payload || typeof payload.state !== 'string') {
    return { state: 'invalid', invoice: null }
  }
  return payload
}
