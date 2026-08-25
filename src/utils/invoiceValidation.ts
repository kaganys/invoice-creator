import type { Invoice, InvoiceErrors, LineItemErrors } from '../types/invoice.ts'
import { parseMoneyToCents, parsePercentScaled, parseQuantityScaled } from './money.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isBlank(value: string): boolean {
  return value.trim() === ''
}

function invalidEmail(value: string): boolean {
  return !isBlank(value) && !EMAIL_PATTERN.test(value.trim())
}

export function validateInvoice(invoice: Invoice): InvoiceErrors {
  const errors: InvoiceErrors = {
    lineItems: {},
  }

  if (isBlank(invoice.number)) {
    errors.number = 'Invoice number is required.'
  }

  if (
    invoice.issueDate &&
    invoice.dueDate &&
    invoice.dueDate < invoice.issueDate
  ) {
    errors.dueDate = 'Due date cannot be before the issue date.'
  }

  if (invalidEmail(invoice.from.email)) {
    errors.fromEmail = 'Enter a valid email address.'
  }

  if (isBlank(invoice.customer.name)) {
    errors.customerName = 'Customer name is required.'
  }

  if (invalidEmail(invoice.customer.email)) {
    errors.customerEmail = 'Enter a valid email address.'
  }

  if (invalidEmail(invoice.payment.zelleEmail)) {
    errors.zelleEmail = 'Enter a valid email address.'
  }

  const percent = parsePercentScaled(invoice.payment.cardFeePercent)
  if (percent === null) {
    errors.cardFeePercent = 'Enter a valid percentage.'
  } else if (percent < 0) {
    errors.cardFeePercent = 'Fee percentage cannot be negative.'
  }

  const fixedFeeRaw = invoice.payment.cardFeeFixed.trim()
  if (fixedFeeRaw !== '') {
    const fixedFee = parseMoneyToCents(fixedFeeRaw)
    if (fixedFee === null) {
      errors.cardFeeFixed = 'Enter a valid amount.'
    } else if (fixedFee < 0) {
      errors.cardFeeFixed = 'Fixed fee cannot be negative.'
    }
  }

  for (const item of invoice.lineItems) {
    const itemErrors: LineItemErrors = {}
    const quantityScaled = parseQuantityScaled(item.quantity)

    if (quantityScaled === null) {
      itemErrors.quantity = 'Enter a valid quantity.'
    } else if (quantityScaled <= 0) {
      itemErrors.quantity = 'Quantity must be greater than zero.'
    }

    const unitPriceCents = parseMoneyToCents(item.unitPrice)
    if (unitPriceCents === null) {
      itemErrors.unitPrice = 'Enter a valid unit price.'
    } else if (unitPriceCents < 0) {
      itemErrors.unitPrice = 'Unit price cannot be negative.'
    }

    if (itemErrors.quantity || itemErrors.unitPrice) {
      errors.lineItems[item.id] = itemErrors
    }
  }

  return errors
}

export function hasInvoiceErrors(errors: InvoiceErrors): boolean {
  return Boolean(
    errors.number ||
      errors.issueDate ||
      errors.dueDate ||
      errors.fromEmail ||
      errors.customerName ||
      errors.customerEmail ||
      errors.zelleEmail ||
      errors.cardFeePercent ||
      errors.cardFeeFixed ||
      Object.keys(errors.lineItems).length > 0,
  )
}
