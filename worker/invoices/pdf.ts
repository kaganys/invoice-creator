import { invoiceLogoPath } from '../../src/branding.ts'
import { type InvoiceFormat } from '../../src/invoice/format.ts'
import { renderInvoiceHtml } from '../../src/invoice/invoiceHtml.ts'
import { invoicePdfFilename } from '../../src/utils/invoiceFilename.ts'
import type { Invoice } from '../../src/types/invoice.ts'
import {
  centsToInputString,
  scaledToInputString,
} from '../../src/utils/money.ts'
import { errorJson } from '../http.ts'
import { isUuid, nowIso } from '../lib/ids.ts'
import type { PdfRenderer } from '../pdf/types.ts'
import { parseFormatJson, serializeFormat } from '../settings/format.ts'
import type { SettingsKvStore } from '../settings/types.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import { invoiceFromRecord } from './document.ts'
import { validateInvoiceWrite } from './validation.ts'
import { readJsonBody } from '../lib/json.ts'
import type { InvoiceRecord, InvoiceStore } from './types.ts'

export type PdfDeps = {
  store: InvoiceStore
  settings: SettingsKvStore
  pdf: PdfRenderer
  origin: string
  clock?: () => string
}

export async function loadCurrentFormat(
  settings: SettingsKvStore,
): Promise<InvoiceFormat> {
  const raw = await settings.get(SETTINGS_KEYS.format)
  return parseFormatJson(raw)
}

export async function resolveInvoiceFormat(
  record: InvoiceRecord,
  deps: Pick<PdfDeps, 'settings' | 'store' | 'clock'>,
): Promise<InvoiceFormat> {
  if (record.format) {
    return record.format
  }
  const current = await loadCurrentFormat(deps.settings)
  if (record.status !== 'draft') {
    const clock = deps.clock ?? nowIso
    await deps.store.snapshotFormat(
      record.id,
      serializeFormat(current),
      clock(),
    )
  }
  return current
}

export function invoiceHtmlForPdf(
  invoice: Invoice,
  format: InvoiceFormat,
  origin: string,
): string {
  const logoPath = invoiceLogoPath(invoice.invoiceLogo)
  const logoSrc = logoPath.startsWith('http')
    ? logoPath
    : `${origin.replace(/\/$/, '')}${logoPath}`
  return renderInvoiceHtml(invoice, format, { origin, logoSrc })
}

function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export async function renderInvoicePdfBytes(
  invoice: Invoice,
  format: InvoiceFormat,
  deps: Pick<PdfDeps, 'pdf' | 'origin'>,
): Promise<Uint8Array> {
  const html = invoiceHtmlForPdf(invoice, format, deps.origin)
  try {
    return await deps.pdf.renderHtml(html)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF generation failed.'
    throw new Error(message)
  }
}

export async function getInvoicePdf(
  id: string,
  deps: PdfDeps,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const record = await deps.store.get(id)
  if (!record) {
    return errorJson('Invoice not found.', 404)
  }
  const format = await resolveInvoiceFormat(record, deps)
  const invoice = invoiceFromRecord(record)
  try {
    const bytes = await renderInvoicePdfBytes(invoice, format, deps)
    return pdfResponse(
      bytes,
      invoicePdfFilename(invoice.number, { draft: record.status === 'draft' }),
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not generate a high-quality PDF.'
    return errorJson(message, 502)
  }
}

export async function previewInvoicePdf(
  request: Request,
  deps: PdfDeps,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  const parsed = validateInvoiceWrite(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }
  const format = await loadCurrentFormat(deps.settings)
  const invoice: Invoice = {
    number: parsed.value.number,
    issueDate: parsed.value.issueDate,
    dueDate: parsed.value.dueDate,
    currency: parsed.value.currency,
    from: parsed.value.from,
    customer: parsed.value.customer,
    payment: {
      memo: parsed.value.payment.memo,
      zelleEmail: parsed.value.payment.zelleEmail,
      cardFeePercent:
        parsed.value.payment.cardFeePercentScaled === 0
          ? ''
          : scaledToInputString(parsed.value.payment.cardFeePercentScaled, 2),
      cardFeeFixed:
        parsed.value.payment.cardFeeFixedCents === 0
          ? ''
          : centsToInputString(parsed.value.payment.cardFeeFixedCents),
    },
    notes: parsed.value.notes,
    invoiceLogo: parsed.value.invoiceLogo,
    lineItems: parsed.value.lineItems.map((line, index) => ({
      id: line.id ?? `preview-${index}`,
      description: line.description,
      quantity: scaledToInputString(line.quantityScaled, 4),
      unitPrice: centsToInputString(line.unitPriceCents),
    })),
  }
  try {
    const bytes = await renderInvoicePdfBytes(invoice, format, deps)
    return pdfResponse(bytes, invoicePdfFilename(invoice.number, { draft: true }))
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not generate a high-quality PDF.'
    return errorJson(message, 502)
  }
}


