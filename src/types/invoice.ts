import type { InvoiceFormat } from '../invoice/format.ts'

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

export type InvoiceLogoSnapshot = {
  path: string
}

export const BUILTIN_INVOICE_LOGO: InvoiceLogoSnapshot = {
  path: '/branding/bitz-designs-icon.png',
}

export const PAID_METHODS = ['zelle', 'manual', 'other'] as const

export type PaidMethod =
  | (typeof PAID_METHODS)[number]
  | 'card'
  | 'ach'
  | 'apple_pay'
  | 'google_pay'

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
  invoiceLogo: InvoiceLogoSnapshot
}

export type SavedInvoice = Invoice & {
  id: string
  status: InvoiceStatus
  createdAt: string
  updatedAt: string
  paidAt: string | null
  paidMethod: PaidMethod | null
  voidedAt: string | null
  voidReason: string | null
  firstSentAt: string | null
  lastSentAt: string | null
  sendCount: number
  format: InvoiceFormat | null
  stripePaymentIntentId: string | null
  paidAmountCents: number | null
  stripePaymentMethod: string | null
  stripeWalletType: string | null
  stripePaymentStatus: string | null
}

export type InvoiceEmailLogItem = {
  id: string
  attemptedAt: string
  completedAt: string | null
  recipient: string
  subject: string
  success: boolean
  smtpMessageId: string | null
  errorCategory: string | null
  errorMessage: string | null
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
