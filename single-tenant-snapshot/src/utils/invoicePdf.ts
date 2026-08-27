import { ApiError } from '../api/http.ts'
import type { Invoice } from '../types/invoice.ts'
import { invoicePdfFilename } from './invoiceFilename.ts'

function triggerDownload(blob: Blob, filename: string): void {
  if (blob.size < 100) {
    throw new Error('PDF generation produced an empty file.')
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback
  }
  const match = /filename="([^"]+)"/i.exec(header)
  return match?.[1] || fallback
}

async function downloadPdfResponse(
  response: Response,
  fallbackName: string,
): Promise<void> {
  if (!response.ok) {
    let message = response.statusText || `Request failed (${response.status})`
    try {
      const payload: unknown = await response.json()
      if (
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof payload.error === 'string' &&
        payload.error.trim()
      ) {
        message = payload.error
      }
    } catch {
      // Keep status text.
    }
    throw new ApiError(message, response.status)
  }
  const blob = await response.blob()
  if (blob.type && !blob.type.includes('pdf') && blob.size < 100) {
    throw new Error('The server did not return a PDF.')
  }
  triggerDownload(
    blob,
    filenameFromDisposition(
      response.headers.get('content-disposition'),
      fallbackName,
    ),
  )
}

/** High-quality PDF from the saved D1 invoice snapshot. Never uses html2canvas. */
export async function downloadSavedInvoicePdf(id: string): Promise<void> {
  const response = await fetch(`/api/invoices/${id}/pdf`)
  await downloadPdfResponse(response, 'Invoice.pdf')
}

/** High-quality PDF of the unsaved editor draft, using current Format settings. */
export async function downloadPreviewInvoicePdf(invoice: Invoice): Promise<void> {
  const response = await fetch('/api/invoices/preview-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...invoice, status: 'draft' }),
  })
  await downloadPdfResponse(
    response,
    invoicePdfFilename(invoice.number, { draft: true }),
  )
}

export { invoicePdfFilename }
