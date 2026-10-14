import {
  centsToInputString,
  lineAmountCents,
  scaledToInputString,
} from '../../src/utils/money.ts'
import { isWellFormedPaymentToken } from './tokenCrypto.ts'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DESCRIPTION_MAX = 1000
export const STRIPE_METADATA_KEY_MAX = 40
export const STRIPE_METADATA_VALUE_MAX = 500
export const STRIPE_METADATA_MAX_KEYS = 50

const BLOCKED_KEY =
  /(^|_)(secret|token|password|webhook|api_key|client_secret)($|_)/

export type PaymentIntentContact = {
  name?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  taxId?: string | null
  address?: {
    line1?: string | null
    line2?: string | null
    city?: string | null
    region?: string | null
    postalCode?: string | null
    country?: string | null
  } | null
  customFields?: Record<string, string | null | undefined> | null
}

export type PaymentIntentShipping = {
  name?: string
  phone?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
}

type LineInput = {
  description: string
  quantityScaled: number
  unitPriceCents: number
}

export type PaymentIntentDetailsInput = {
  invoiceId: string
  invoiceNumber: string
  issueDate?: string | null
  dueDate?: string | null
  currency?: string | null
  invoiceAmountCents: number
  totalCents: number
  companyId?: string | null
  companyName?: string | null
  paymentCategory?: string | null
  notes?: string | null
  paymentMemo?: string | null
  customer: PaymentIntentContact
  person?: PaymentIntentContact | null
  from?: PaymentIntentContact | null
  lineItems: readonly LineInput[]
}

/** Dashboard description, for example "Invoice BD2026-0051 · Bitz Designs". */
export function paymentIntentDescription(
  invoiceNumber: string,
  businessName: string,
): string {
  const number = invoiceNumber.trim()
  const business = businessName.trim()
  const text = business ? `Invoice ${number} · ${business}` : `Invoice ${number}`
  return clipChars(text, DESCRIPTION_MAX)
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

/**
 * Flat metadata for one PaymentIntent. Invoice values win over the People
 * record. Empty values, secrets, and payment-link tokens are left out.
 * Stripe allows 50 keys, 40-character keys, and 500-character values.
 */
export function buildPaymentIntentDetails(input: PaymentIntentDetailsInput): {
  description: string
  metadata: Record<string, string>
  receiptEmail?: string
  shipping?: PaymentIntentShipping
} {
  const customer = mergeContact(input.customer, input.person)
  const letterhead = text(input.from?.name)
  const companyName = text(input.companyName) || letterhead
  const description = paymentIntentDescription(
    input.invoiceNumber,
    letterhead || companyName,
  )
  const entries: Array<[string, string]> = []
  const put = (key: string, value: string | null | undefined) => {
    const safeKey = metadataKey(key)
    const safeValue = metadataValue(value)
    if (!safeKey || !safeValue || entries.some(([existing]) => existing === safeKey)) {
      return
    }
    entries.push([safeKey, safeValue])
  }

  put('invoice_id', input.invoiceId)
  put('invoice_number', input.invoiceNumber)
  put('issue_date', input.issueDate)
  put('due_date', input.dueDate)
  put('invoice_amount', centsToInputString(input.invoiceAmountCents))
  put('total', centsToInputString(input.totalCents))
  put('currency', input.currency)
  put('company_id', input.companyId)
  put('company_name', companyName)
  put('payment_category', input.paymentCategory)

  put('customer_name', customer.name)
  put('customer_company', customer.company)
  put('customer_email', customer.email)
  put('customer_phone', customer.phone)
  put('customer_tax_id', customer.taxId)
  putAddress('billing_address', customer.address, put)

  put('from_name', input.from?.name)
  put('from_email', input.from?.email)
  putAddress('from_address', input.from?.address, put)

  put('line_items', lineItemsSummary(input.lineItems))
  put('invoice_notes', input.notes)
  put('payment_memo', input.paymentMemo)

  for (const [rawKey, rawValue] of Object.entries(customer.customFields ?? {})) {
    if (entries.length >= STRIPE_METADATA_MAX_KEYS) {
      break
    }
    put(`customer_${rawKey}`, rawValue)
  }

  const metadata: Record<string, string> = {}
  for (const [key, value] of entries.slice(0, STRIPE_METADATA_MAX_KEYS)) {
    metadata[key] = value
  }

  return {
    description,
    metadata,
    receiptEmail: paymentIntentReceiptEmail(customer.email),
    shipping: shippingFor(customer),
  }
}

function mergeContact(
  invoice: PaymentIntentContact,
  person: PaymentIntentContact | null | undefined,
): PaymentIntentContact {
  const extra = person ?? {}
  return {
    name: firstText(invoice.name, extra.name),
    company: firstText(invoice.company, extra.company),
    email: firstText(invoice.email, extra.email),
    phone: firstText(invoice.phone, extra.phone),
    taxId: firstText(invoice.taxId, extra.taxId),
    address: {
      line1: firstText(invoice.address?.line1, extra.address?.line1),
      line2: firstText(invoice.address?.line2, extra.address?.line2),
      city: firstText(invoice.address?.city, extra.address?.city),
      region: firstText(invoice.address?.region, extra.address?.region),
      postalCode: firstText(invoice.address?.postalCode, extra.address?.postalCode),
      country: firstText(invoice.address?.country, extra.address?.country),
    },
    customFields: extra.customFields ?? null,
  }
}

function putAddress(
  prefix: string,
  address: PaymentIntentContact['address'],
  put: (key: string, value: string | null | undefined) => void,
): void {
  put(`${prefix}_line1`, address?.line1)
  put(`${prefix}_line2`, address?.line2)
  put(`${prefix}_city`, address?.city)
  put(`${prefix}_region`, address?.region)
  put(`${prefix}_postal_code`, address?.postalCode)
  put(`${prefix}_country`, address?.country)
}

function shippingFor(contact: PaymentIntentContact): PaymentIntentShipping | undefined {
  const name = text(contact.name)
  const phone = text(contact.phone)
  const line1 = text(contact.address?.line1)
  const line2 = text(contact.address?.line2)
  const city = text(contact.address?.city)
  const state = text(contact.address?.region)
  const postalCode = text(contact.address?.postalCode)
  const countryCode = isoCountry(contact.address?.country)
  const address = {
    ...(line1 ? { line1 } : {}),
    ...(line2 ? { line2 } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(countryCode ? { country: countryCode } : {}),
  }
  const shipping: PaymentIntentShipping = {
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(Object.keys(address).length > 0 ? { address } : {}),
  }
  if (!shipping.name && !shipping.phone && !shipping.address) {
    return undefined
  }
  return shipping
}

function lineItemsSummary(lines: readonly LineInput[]): string {
  const parts = lines.map((line) => {
    const name = text(line.description) || 'Item'
    const quantity = scaledToInputString(line.quantityScaled, 4)
    const price = centsToInputString(line.unitPriceCents)
    const amount = centsToInputString(
      lineAmountCents(line.quantityScaled, line.unitPriceCents),
    )
    return `${name} × ${quantity} @ ${price} = ${amount}`
  })
  return joinLimited(parts, STRIPE_METADATA_VALUE_MAX)
}

function joinLimited(parts: string[], max: number): string {
  const kept: string[] = []
  for (const part of parts) {
    const next = kept.length === 0 ? part : `${kept.join('; ')}; ${part}`
    if (charLength(next) <= max) {
      kept.push(part)
      continue
    }
    if (kept.length === 0) {
      return truncate(part, max)
    }
    const withMark = `${kept.join('; ')}; …`
    if (charLength(withMark) <= max) {
      return withMark
    }
    return truncate(kept.join('; '), max)
  }
  return kept.join('; ')
}

function metadataKey(raw: string): string | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized || BLOCKED_KEY.test(normalized)) {
    return null
  }
  const clipped = clipChars(normalized, STRIPE_METADATA_KEY_MAX).replace(/_+$/g, '')
  if (!clipped || BLOCKED_KEY.test(clipped)) {
    return null
  }
  return clipped
}

function metadataValue(raw: string | null | undefined): string | null {
  const cleaned = redactSecrets(text(raw))
  if (!cleaned) {
    return null
  }
  return truncate(cleaned, STRIPE_METADATA_VALUE_MAX)
}

function redactSecrets(value: string): string {
  return value
    .replace(/https?:\/\/\S*\/i\/[A-Za-z0-9_-]+/gi, '[redacted]')
    .replace(/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/\bwhsec_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/\b[A-Za-z0-9_-]{43}\b/g, (part) =>
      isWellFormedPaymentToken(part) ? '[redacted]' : part,
    )
    .trim()
}

function isoCountry(value: string | null | undefined): string | undefined {
  const code = text(value)
  if (!/^[A-Za-z]{2}$/.test(code)) {
    return undefined
  }
  return code.toUpperCase()
}

function firstText(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string {
  return text(primary) || text(fallback)
}

function text(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function charLength(value: string): number {
  return [...value].length
}

function clipChars(value: string, max: number): string {
  return [...value].slice(0, max).join('')
}

function truncate(value: string, max: number): string {
  const chars = [...value]
  if (chars.length <= max) {
    return chars.join('')
  }
  if (max <= 1) {
    return '…'
  }
  return `${chars.slice(0, max - 1).join('')}…`
}
