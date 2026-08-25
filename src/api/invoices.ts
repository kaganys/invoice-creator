import type {
  Invoice,
  InvoiceListItem,
  InvoiceStatus,
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
