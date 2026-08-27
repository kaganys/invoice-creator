import type { Invoice, InvoiceLineItem } from '../types/invoice.ts'
import {
  lineAmountCents,
  parseMoneyToCents,
  parsePercentScaled,
  parseQuantityScaled,
  percentOfCents,
} from './money.ts'

export type InvoiceTotals = {
  lineAmountsCents: Array<number | null>
  subtotalCents: number
  totalCents: number
  amountDueCents: number
  zelleTotalCents: number
  cardFeeCents: number
  cardTotalCents: number
  hasInvalidLines: boolean
}

export function calculateLineAmountCents(
  item: InvoiceLineItem,
): number | null {
  const quantityScaled = parseQuantityScaled(item.quantity)
  const unitPriceCents = parseMoneyToCents(item.unitPrice)

  if (quantityScaled === null || unitPriceCents === null) {
    return null
  }
  if (quantityScaled <= 0 || unitPriceCents < 0) {
    return null
  }

  return lineAmountCents(quantityScaled, unitPriceCents)
}

function parseNonNegativeFeePercent(raw: string): number {
  const parsed = parsePercentScaled(raw)
  if (parsed === null || parsed < 0) {
    return 0
  }
  return parsed
}

function parseNonNegativeFixedFeeCents(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return 0
  }
  const parsed = parseMoneyToCents(trimmed)
  if (parsed === null || parsed < 0) {
    return 0
  }
  return parsed
}

export function calculateInvoiceTotals(invoice: Invoice): InvoiceTotals {
  const lineAmountsCents = invoice.lineItems.map(calculateLineAmountCents)
  const hasInvalidLines = lineAmountsCents.some((amount) => amount === null)

  let subtotalCents = 0
  for (const amount of lineAmountsCents) {
    if (amount !== null) {
      subtotalCents += amount
    }
  }

  const totalCents = subtotalCents
  const amountDueCents = totalCents
  const zelleTotalCents = totalCents

  const percentScaled = parseNonNegativeFeePercent(
    invoice.payment.cardFeePercent,
  )
  const fixedFeeCents = parseNonNegativeFixedFeeCents(
    invoice.payment.cardFeeFixed,
  )
  const cardFeeCents = percentOfCents(totalCents, percentScaled) + fixedFeeCents
  const cardTotalCents = totalCents + cardFeeCents

  return {
    lineAmountsCents,
    subtotalCents,
    totalCents,
    amountDueCents,
    zelleTotalCents,
    cardFeeCents,
    cardTotalCents,
    hasInvalidLines,
  }
}
