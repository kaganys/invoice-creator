import type { Invoice } from '../../src/types/invoice.ts'
import {
  centsToInputString,
  scaledToInputString,
} from '../../src/utils/money.ts'
import type { InvoiceRecord } from './types.ts'

export function invoiceFromRecord(record: InvoiceRecord): Invoice {
  return {
    number: record.number,
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
    lineItems: record.lineItems.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: scaledToInputString(line.quantityScaled, 4),
      unitPrice: centsToInputString(line.unitPriceCents),
    })),
  }
}
