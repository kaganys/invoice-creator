import type {
  Invoice,
  InvoiceEmailLogItem,
  InvoiceListItem,
  InvoiceStatus,
  PaidMethod,
  SavedInvoice,
} from '../types/invoice.ts'
import { apiRequest } from './http.ts'

type SavedInvoicePayload = SavedInvoice

export async function fetchInvoices(): Promise<InvoiceListItem[]> {
  const payload = await apiRequest<{ invoices: InvoiceListItem[] }>(
    '/api/invoices',
  )
  return payload.invoices
}

export async function fetchInvoice(id: string): Promise<SavedInvoice> {
  const payload = await apiRequest<{ invoice: SavedInvoicePayload }>(
    `/api/invoices/${id}`,
  )
  return payload.invoice
}

export async function createInvoice(
  invoice: Invoice,
  status: InvoiceStatus = 'draft',
): Promise<SavedInvoice> {
  const payload = await apiRequest<{ invoice: SavedInvoicePayload }>(
    '/api/invoices',
    {
      method: 'POST',
      body: JSON.stringify({ ...invoice, status }),
    },
  )
  return payload.invoice
}

export async function updateInvoice(
  id: string,
  invoice: Invoice,
  status: InvoiceStatus,
): Promise<SavedInvoice> {
  const payload = await apiRequest<{ invoice: SavedInvoicePayload }>(
    `/api/invoices/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify({ ...invoice, status }),
    },
  )
  return payload.invoice
}

export async function deleteInvoice(id: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/invoices/${id}`, {
    method: 'DELETE',
  })
}

export async function markInvoicePaid(
  id: string,
  method: PaidMethod,
): Promise<SavedInvoice> {
  const payload = await apiRequest<{ invoice: SavedInvoice }>(
    `/api/invoices/${id}/mark-paid`,
    {
      method: 'POST',
      body: JSON.stringify({ method }),
    },
  )
  return payload.invoice
}

export async function voidInvoice(
  id: string,
  reason = '',
): Promise<SavedInvoice> {
  const payload = await apiRequest<{ invoice: SavedInvoice }>(
    `/api/invoices/${id}/void`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  )
  return payload.invoice
}

export async function fetchInvoiceEmails(id: string): Promise<{
  firstSentAt: string | null
  lastSentAt: string | null
  sendCount: number
  emails: InvoiceEmailLogItem[]
}> {
  return apiRequest(`/api/invoices/${id}/emails`)
}

export async function sendInvoiceEmail(
  id: string,
  payload: {
    recipient: string
    subject: string
    body: string
    idempotencyKey: string
  },
): Promise<{ invoice: SavedInvoice }> {
  return apiRequest(`/api/invoices/${id}/send`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export type PaymentLinkPayload = {
  url: string | null
  createdAt: string
  status: 'active' | 'revoked'
}

export async function fetchPaymentLink(
  id: string,
): Promise<{ paymentLink: PaymentLinkPayload | null }> {
  return apiRequest(`/api/invoices/${id}/payment-link`)
}

export async function regeneratePaymentLink(
  id: string,
): Promise<{ paymentLink: PaymentLinkPayload }> {
  return apiRequest(`/api/invoices/${id}/payment-link/regenerate`, {
    method: 'POST',
  })
}

export async function revokePaymentLink(
  id: string,
): Promise<{ paymentLink: null; revoked: boolean }> {
  return apiRequest(`/api/invoices/${id}/payment-link/revoke`, {
    method: 'POST',
  })
}
