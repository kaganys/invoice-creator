import {
  parseMoneyToCents,
  parsePercentScaled,
  parseQuantityScaled,
} from '../../src/utils/money.ts'
import { asTrimmedString, isRecord } from '../lib/json.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const STATUSES = ['draft', 'sent', 'paid', 'void'] as const

export type InvoiceStatus = (typeof STATUSES)[number]

export type InvoiceWriteLine = {
  id?: string
  description: string
  quantityScaled: number
  unitPriceCents: number
}

export type InvoiceWrite = {
  number: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  currency: string
  from: {
    name: string
    email: string
    address: {
      line1: string
      line2: string
      city: string
      region: string
      postalCode: string
      country: string
    }
  }
  customer: {
    name: string
    email: string
    address: {
      line1: string
      line2: string
      city: string
      region: string
      postalCode: string
      country: string
    }
  }
  payment: {
    memo: string
    zelleEmail: string
    cardFeePercentScaled: number
    cardFeeFixedCents: number
  }
  notes: string
  lineItems: InvoiceWriteLine[]
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }

function parseParty(value: unknown, label: string) {
  const record = isRecord(value) ? value : {}
  const email = asTrimmedString(record.email)
  if (email && !EMAIL_PATTERN.test(email)) {
    return { ok: false as const, message: `${label} email is not valid.` }
  }
  const address = isRecord(record.address) ? record.address : {}
  return {
    ok: true as const,
    value: {
      name: asTrimmedString(record.name),
      email,
      address: {
        line1: asTrimmedString(address.line1),
        line2: asTrimmedString(address.line2),
        city: asTrimmedString(address.city),
        region: asTrimmedString(address.region),
        postalCode: asTrimmedString(address.postalCode),
        country: asTrimmedString(address.country),
      },
    },
  }
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) {
    return false
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function validateInvoiceWrite(
  input: unknown,
): ValidationResult<InvoiceWrite> {
  if (!isRecord(input)) {
    return { ok: false, message: 'Invoice data must be a JSON object.' }
  }

  const number = asTrimmedString(input.number)
  if (!number) {
    return { ok: false, message: 'Invoice number is required.' }
  }

  const statusRaw = asTrimmedString(input.status) || 'draft'
  if (!STATUSES.includes(statusRaw as InvoiceStatus)) {
    return { ok: false, message: 'Invalid invoice status.' }
  }
  const status = statusRaw as InvoiceStatus

  const issueDate = asTrimmedString(input.issueDate)
  if (issueDate && !isValidIsoDate(issueDate)) {
    return { ok: false, message: 'Issue date is invalid.' }
  }
  const dueDate = asTrimmedString(input.dueDate)
  if (dueDate && !isValidIsoDate(dueDate)) {
    return { ok: false, message: 'Due date is invalid.' }
  }
  if (issueDate && dueDate && dueDate < issueDate) {
    return { ok: false, message: 'Due date cannot be before the issue date.' }
  }

  const currency = asTrimmedString(input.currency) || 'USD'
  const from = parseParty(input.from, 'Sender')
  if (!from.ok) {
    return from
  }
  const customer = parseParty(input.customer, 'Customer')
  if (!customer.ok) {
    return customer
  }
  if (!customer.value.name) {
    return { ok: false, message: 'Customer name is required.' }
  }

  const paymentInput = isRecord(input.payment) ? input.payment : {}
  const zelleEmail = asTrimmedString(paymentInput.zelleEmail)
  if (zelleEmail && !EMAIL_PATTERN.test(zelleEmail)) {
    return { ok: false, message: 'Zelle/payment email is not valid.' }
  }

  const cardFeePercentScaled = parsePercentScaled(
    typeof paymentInput.cardFeePercent === 'string'
      ? paymentInput.cardFeePercent
      : '',
  )
  if (cardFeePercentScaled === null || cardFeePercentScaled < 0) {
    return { ok: false, message: 'Card fee percent is invalid.' }
  }

  const fixedRaw = asTrimmedString(paymentInput.cardFeeFixed)
  const cardFeeFixedCents =
    fixedRaw === '' ? 0 : parseMoneyToCents(fixedRaw)
  if (cardFeeFixedCents === null || cardFeeFixedCents < 0) {
    return { ok: false, message: 'Fixed card fee is invalid.' }
  }

  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    return { ok: false, message: 'At least one line item is required.' }
  }

  const lineItems: InvoiceWriteLine[] = []
  for (const [index, entry] of input.lineItems.entries()) {
    if (!isRecord(entry)) {
      return { ok: false, message: `Line item ${index + 1} is invalid.` }
    }
    const quantityScaled = parseQuantityScaled(asTrimmedString(entry.quantity))
    if (quantityScaled === null || quantityScaled <= 0) {
      return {
        ok: false,
        message: `Line item ${index + 1} quantity must be greater than zero.`,
      }
    }
    const unitPriceCents = parseMoneyToCents(asTrimmedString(entry.unitPrice))
    if (unitPriceCents === null || unitPriceCents < 0) {
      return {
        ok: false,
        message: `Line item ${index + 1} unit price cannot be negative.`,
      }
    }
    const id = asTrimmedString(entry.id) || undefined
    lineItems.push({
      id,
      description: asTrimmedString(entry.description),
      quantityScaled,
      unitPriceCents,
    })
  }

  return {
    ok: true,
    value: {
      number,
      status,
      issueDate,
      dueDate,
      currency,
      from: from.value,
      customer: customer.value,
      payment: {
        memo: asTrimmedString(paymentInput.memo),
        zelleEmail,
        cardFeePercentScaled,
        cardFeeFixedCents,
      },
      notes: asTrimmedString(input.notes),
      lineItems,
    },
  }
}
