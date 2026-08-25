import type { InvoiceFormat } from '../../src/invoice/format.ts'
import type { InvoiceStatus, InvoiceWrite, InvoiceWriteLine } from './validation.ts'

export type InvoiceLineRecord = {
  id: string
  invoiceId: string
  sortOrder: number
  description: string
  quantityScaled: number
  unitPriceCents: number
}

export type PaidMethod = 'zelle' | 'manual' | 'other' | 'card'

export type InvoiceRecord = {
  id: string
  number: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  currency: string
  from: InvoiceWrite['from']
  customer: InvoiceWrite['customer']
  payment: InvoiceWrite['payment']
  notes: string
  invoiceLogo: InvoiceWrite['invoiceLogo']
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
  lineItems: InvoiceLineRecord[]
}

export type EmailLogRecord = {
  id: string
  invoiceId: string
  attemptedAt: string
  completedAt: string | null
  recipient: string
  subject: string
  success: boolean
  smtpMessageId: string | null
  errorCategory: string | null
  errorMessage: string | null
  idempotencyKey: string | null
}

export type SendSuccessFields = {
  status: InvoiceStatus
  firstSentAt: string
  lastSentAt: string
  sendCount: number
  formatJson: string
  updatedAt: string
}

export type InvoiceListRecord = {
  id: string
  number: string
  customerName: string
  issueDate: string
  dueDate: string
  amountCents: number
  currency: string
  status: InvoiceStatus
  createdAt: string
}

export type MarkPaidResult = 'ok' | 'not_found' | 'already_paid' | 'void'
export type VoidResult = 'ok' | 'not_found' | 'already_void' | 'paid'

export interface InvoiceStore {
  list(): Promise<InvoiceListRecord[]>
  get(id: string): Promise<InvoiceRecord | null>
  findIdByNumber(number: string): Promise<string | null>
  create(record: InvoiceRecord): Promise<InvoiceRecord>
  replace(record: InvoiceRecord): Promise<InvoiceRecord | null>
  deleteDraft(id: string): Promise<'deleted' | 'not_found' | 'not_draft'>
  markPaid(
    id: string,
    fields: {
      paidAt: string
      paidMethod: PaidMethod
      updatedAt: string
      stripePaymentIntentId?: string | null
      paidAmountCents?: number | null
    },
  ): Promise<MarkPaidResult>
  attachStripeReceipt(
    id: string,
    fields: {
      stripePaymentIntentId: string
      paidAmountCents: number
      updatedAt: string
    },
  ): Promise<void>
  voidInvoice(
    id: string,
    fields: { voidedAt: string; voidReason: string; updatedAt: string },
  ): Promise<VoidResult>
  snapshotFormat(id: string, formatJson: string, updatedAt: string): Promise<void>
  applySendSuccess(id: string, fields: SendSuccessFields): Promise<void>
  insertEmailLog(record: EmailLogRecord): Promise<'ok' | 'duplicate'>
  updateEmailLog(
    id: string,
    fields: {
      completedAt: string
      success: boolean
      smtpMessageId: string | null
      errorCategory: string | null
      errorMessage: string | null
    },
  ): Promise<void>
  getEmailLogByIdempotency(key: string): Promise<EmailLogRecord | null>
  listEmailLogs(invoiceId: string, limit?: number): Promise<EmailLogRecord[]>
}

export type { InvoiceWrite, InvoiceWriteLine, InvoiceStatus }
