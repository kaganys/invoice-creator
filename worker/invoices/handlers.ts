import { errorJson, json } from '../http.ts'
import { createEntityId, isUuid, nowIso } from '../lib/ids.ts'
import { readJsonBody } from '../lib/json.ts'
import { publicInvoice } from './public.ts'
import type { InvoiceLineRecord, InvoiceRecord, InvoiceStore } from './types.ts'
import { validateInvoiceWrite, type InvoiceWrite } from './validation.ts'

function toRecord(
  id: string,
  parsed: InvoiceWrite,
  createdAt: string,
  updatedAt: string,
  idFactory: () => string,
): InvoiceRecord {
  const lineItems: InvoiceLineRecord[] = parsed.lineItems.map((line, index) => ({
    id: line.id && isUuid(line.id) ? line.id : idFactory(),
    invoiceId: id,
    sortOrder: index,
    description: line.description,
    quantityScaled: line.quantityScaled,
    unitPriceCents: line.unitPriceCents,
  }))

  return {
    id,
    number: parsed.number,
    status: parsed.status,
    issueDate: parsed.issueDate,
    dueDate: parsed.dueDate,
    currency: parsed.currency,
    from: parsed.from,
    customer: parsed.customer,
    payment: parsed.payment,
    notes: parsed.notes,
    createdAt,
    updatedAt,
    lineItems,
  }
}

export async function listInvoices(store: InvoiceStore): Promise<Response> {
  const invoices = await store.list()
  return json({ invoices })
}

export async function getInvoice(
  id: string,
  store: InvoiceStore,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const invoice = await store.get(id)
  if (!invoice) {
    return errorJson('Invoice not found.', 404)
  }
  return json({ invoice: publicInvoice(invoice) })
}

export async function createInvoice(
  request: Request,
  store: InvoiceStore,
  clock: () => string = nowIso,
  idFactory: () => string = createEntityId,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }

  const parsed = validateInvoiceWrite(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }

  const existing = await store.findIdByNumber(parsed.value.number)
  if (existing) {
    return errorJson('Invoice number already exists.', 409)
  }

  const timestamp = clock()
  const record = toRecord(
    idFactory(),
    parsed.value,
    timestamp,
    timestamp,
    idFactory,
  )
  const created = await store.create(record)
  return json({ invoice: publicInvoice(created) }, { status: 201 })
}

export async function updateInvoice(
  id: string,
  request: Request,
  store: InvoiceStore,
  clock: () => string = nowIso,
  idFactory: () => string = createEntityId,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid invoice id.', 400)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }

  const parsed = validateInvoiceWrite(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }

  const current = await store.get(id)
  if (!current) {
    return errorJson('Invoice not found.', 404)
  }

  const existingNumberId = await store.findIdByNumber(parsed.value.number)
  if (existingNumberId && existingNumberId !== id) {
    return errorJson('Invoice number already exists.', 409)
  }

  const timestamp = clock()
  const record = toRecord(
    id,
    parsed.value,
    current.createdAt,
    timestamp,
    idFactory,
  )
  const updated = await store.replace(record)
  if (!updated) {
    return errorJson('Invoice not found.', 404)
  }
  return json({ invoice: publicInvoice(updated) })
}

export async function deleteInvoice(
  id: string,
  store: InvoiceStore,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const result = await store.deleteDraft(id)
  if (result === 'not_found') {
    return errorJson('Invoice not found.', 404)
  }
  if (result === 'not_draft') {
    return errorJson('Only draft invoices can be deleted.', 409)
  }
  return json({ ok: true })
}
