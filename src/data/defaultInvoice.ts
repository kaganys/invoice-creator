import type { Invoice, InvoiceLineItem, InvoiceParty } from '../types/invoice.ts'
import { emptyAddress } from '../utils/address.ts'
import { toIsoDate } from '../utils/dates.ts'
import { createId } from '../utils/id.ts'

export { createId }

export function createEmptyLineItem(
  overrides: Partial<InvoiceLineItem> = {},
): InvoiceLineItem {
  return {
    id: overrides.id || createId(),
    description: overrides.description ?? '',
    quantity: overrides.quantity ?? '',
    unitPrice: overrides.unitPrice ?? '',
  }
}

function createParty(overrides: Partial<InvoiceParty> = {}): InvoiceParty {
  const { address, ...rest } = overrides
  return {
    name: '',
    email: '',
    ...rest,
    address: {
      ...emptyAddress(),
      ...address,
    },
  }
}

export function createDefaultInvoice(): Invoice {
  return {
    number: '',
    issueDate: toIsoDate(new Date()),
    dueDate: '',
    currency: 'USD',
    from: createParty(),
    customer: createParty(),
    lineItems: [createEmptyLineItem()],
    payment: {
      memo: '',
      zelleEmail: '',
      cardFeePercent: '',
      cardFeeFixed: '',
    },
    notes: '',
  }
}
