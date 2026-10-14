const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DESCRIPTION_MAX = 1000
const METADATA_VALUE_MAX = 500

/** Dashboard description, for example "Invoice BD2026-0051 · Bitz Designs". */
export function paymentIntentDescription(
  invoiceNumber: string,
  businessName: string,
): string {
  const number = invoiceNumber.trim()
  const business = businessName.trim()
  const text = business ? `Invoice ${number} · ${business}` : `Invoice ${number}`
  return text.slice(0, DESCRIPTION_MAX)
}

export function paymentIntentMetadata(input: {
  invoiceId: string
  invoiceNumber: string
  companyId?: string | null
  companyName?: string | null
  customerName?: string | null
  paymentTokenId?: string | null
  paymentCategory?: string | null
}): Record<string, string> {
  const metadata: Record<string, string> = {}
  const put = (key: string, value: string | null | undefined) => {
    const trimmed = (value ?? '').trim().slice(0, METADATA_VALUE_MAX)
    if (trimmed) {
      metadata[key] = trimmed
    }
  }
  put('invoice_id', input.invoiceId)
  put('invoice_number', input.invoiceNumber)
  put('company_id', input.companyId)
  put('company_name', input.companyName)
  put('customer_name', input.customerName)
  put('payment_token_id', input.paymentTokenId)
  put('payment_category', input.paymentCategory)
  return metadata
}

/** Receipts are a PaymentIntent field. Omit the address when none is known. */
export function paymentIntentReceiptEmail(
  email: string | null | undefined,
): string | undefined {
  const trimmed = (email ?? '').trim()
  if (!trimmed || !EMAIL.test(trimmed)) {
    return undefined
  }
  return trimmed
}
