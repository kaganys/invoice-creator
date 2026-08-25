import {
  centsToInputString,
  scaledToInputString,
} from '../../src/utils/money.ts'
import type { InvoiceLineRecord, InvoiceRecord } from './types.ts'

export function publicInvoice(record: InvoiceRecord) {
  return {
    id: record.id,
    number: record.number,
    status: record.status,
    issueDate: record.issueDate,
    dueDate: record.dueDate,
    currency: record.currency,
    from: record.from,
    customer: record.customer,
    payment: {
      memo: record.payment.memo,
      zelleEmail: record.payment.zelleEmail,
      cardFeePercent:
        record.payment.cardFeePercentScaled === 0
          ? ''
          : scaledToInputString(record.payment.cardFeePercentScaled, 2),
      cardFeeFixed:
        record.payment.cardFeeFixedCents === 0
          ? ''
          : centsToInputString(record.payment.cardFeeFixedCents),
    },
    notes: record.notes,
    invoiceLogo: record.invoiceLogo,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    paidAt: record.paidAt,
    paidMethod: record.paidMethod,
    voidedAt: record.voidedAt,
    voidReason: record.voidReason,
    firstSentAt: record.firstSentAt,
    lastSentAt: record.lastSentAt,
    sendCount: record.sendCount,
    format: record.format,
    stripePaymentIntentId: record.stripePaymentIntentId ?? null,
    paidAmountCents: record.paidAmountCents ?? null,
    lineItems: record.lineItems.map(publicLine),
  }
}

export function publicEmailLog(record: {
  id: string
  attemptedAt: string
  completedAt: string | null
  recipient: string
  subject: string
  success: boolean
  smtpMessageId: string | null
  errorCategory: string | null
  errorMessage: string | null
}) {
  return {
    id: record.id,
    attemptedAt: record.attemptedAt,
    completedAt: record.completedAt,
    recipient: record.recipient,
    subject: record.subject,
    success: record.success,
    smtpMessageId: record.smtpMessageId,
    errorCategory: record.errorCategory,
    errorMessage: record.errorMessage,
  }
}

function publicLine(line: InvoiceLineRecord) {
  return {
    id: line.id,
    description: line.description,
    quantity: scaledToInputString(line.quantityScaled, 4),
    unitPrice: centsToInputString(line.unitPriceCents),
  }
}
