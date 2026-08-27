import { CURRENCY_OPTIONS } from '../../src/types/invoice.ts'
import { calculateInvoiceTotals } from '../../src/utils/invoiceCalculations.ts'
import { invoiceFromRecord } from '../invoices/document.ts'
import type { InvoiceRecord } from '../invoices/types.ts'

const STRIPE_TWO_DECIMAL = new Set<string>([...CURRENCY_OPTIONS])
const STRIPE_ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

export type CardCharge = {
  currency: string
  baseCents: number
  feeCents: number
  cardCents: number
  stripeAmount: number
}

export function calculateCardCharge(record: InvoiceRecord): CardCharge {
  const invoice = invoiceFromRecord(record)
  const totals = calculateInvoiceTotals(invoice)
  const currency = invoice.currency.trim().toUpperCase()
  return {
    currency,
    baseCents: totals.amountDueCents,
    feeCents: totals.cardFeeCents,
    cardCents: totals.cardTotalCents,
    stripeAmount: toStripeAmount(totals.cardTotalCents, currency),
  }
}

export function isSupportedStripeCurrency(currency: string): boolean {
  return STRIPE_TWO_DECIMAL.has(currency.toUpperCase())
}

export function toStripeAmount(amountCents: number, currency: string): number {
  const code = currency.toUpperCase()
  if (STRIPE_ZERO_DECIMAL.has(code)) {
    return Math.round(amountCents / 100)
  }
  return amountCents
}

export function stripeCurrencyError(currency: string): string | null {
  if (!isSupportedStripeCurrency(currency)) {
    return `Card payments are not enabled for ${currency}. Supported currencies: ${CURRENCY_OPTIONS.join(', ')}.`
  }
  return null
}
