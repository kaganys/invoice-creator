export type Address = {
  line1: string
  line2: string
  city: string
  region: string
  postalCode: string
  country: string
}

export type InvoiceParty = {
  name: string
  email: string
  address: Address
}

export type InvoiceLineItem = {
  id: string
  description: string
  quantity: string
  unitPrice: string
}

export type InvoicePayment = {
  memo: string
  zelleEmail: string
  cardFeePercent: string
  cardFeeFixed: string
}

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export type Invoice = {
  number: string
  issueDate: string
  dueDate: string
  currency: string
  from: InvoiceParty
  customer: InvoiceParty
  lineItems: InvoiceLineItem[]
  payment: InvoicePayment
  notes: string
}

export type SavedInvoice = Invoice & {
  id: string
  status: InvoiceStatus
  createdAt: string
  updatedAt: string
}

export type InvoiceListItem = {
  id: string
  number: string
  customerName: string
  issueDate: string
  dueDate: string
  amountCents: number
  currency: string
  status: InvoiceStatus
}

export const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const

export type LineItemErrors = {
  description?: string
  quantity?: string
  unitPrice?: string
}

export type InvoiceErrors = {
  number?: string
  issueDate?: string
  dueDate?: string
  fromEmail?: string
  customerName?: string
  customerEmail?: string
  zelleEmail?: string
  cardFeePercent?: string
  cardFeeFixed?: string
  lineItems: Record<string, LineItemErrors>
}
