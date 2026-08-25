import type { InvoiceStatus, InvoiceWrite, InvoiceWriteLine } from './validation.ts'

export type InvoiceLineRecord = {
  id: string
  invoiceId: string
  sortOrder: number
  description: string
  quantityScaled: number
  unitPriceCents: number
}

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
  createdAt: string
  updatedAt: string
  lineItems: InvoiceLineRecord[]
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

export interface InvoiceStore {
  list(): Promise<InvoiceListRecord[]>
  get(id: string): Promise<InvoiceRecord | null>
  findIdByNumber(number: string): Promise<string | null>
  create(record: InvoiceRecord): Promise<InvoiceRecord>
  replace(record: InvoiceRecord): Promise<InvoiceRecord | null>
  deleteDraft(id: string): Promise<'deleted' | 'not_found' | 'not_draft'>
}

export type { InvoiceWrite, InvoiceWriteLine, InvoiceStatus }
