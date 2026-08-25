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
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lineItems: record.lineItems.map(publicLine),
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
