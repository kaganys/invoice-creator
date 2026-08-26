import { asTrimmedString, isRecord, readJsonBody } from '../lib/json.ts'
import { errorJson, json } from '../http.ts'
import { createEntityId, isUuid, nowIso } from '../lib/ids.ts'
import { publicInvoice } from './public.ts'
import type {
  InvoiceLineRecord,
  InvoiceRecord,
  InvoiceStore,
  PaidMethod,
} from './types.ts'
import { validateInvoiceWrite, type InvoiceWrite } from './validation.ts'

const PAID_METHODS: PaidMethod[] = ['zelle', 'manual', 'other']

function emptyPaymentState() {
  return {
    paidAt: null,
    paidMethod: null,
    voidedAt: null,
    voidReason: null,
    firstSentAt: null,
    lastSentAt: null,
    sendCount: 0,
    format: null,
    stripePaymentIntentId: null,
    paidAmountCents: null,
    stripePaymentMethod: null,
    stripeWalletType: null,
    stripePaymentStatus: null,
  } as const
}

function toRecord(
  id: string,
  parsed: InvoiceWrite,
  createdAt: string,
  updatedAt: string,
  idFactory: () => string,
  extras: Pick<
    InvoiceRecord,
    | 'paidAt'
    | 'paidMethod'
    | 'voidedAt'
    | 'voidReason'
    | 'firstSentAt'
    | 'lastSentAt'
    | 'sendCount'
    | 'format'
    | 'stripePaymentIntentId'
    | 'paidAmountCents'
    | 'stripePaymentMethod'
    | 'stripeWalletType'
    | 'stripePaymentStatus'
  > = emptyPaymentState(),
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
    invoiceLogo: parsed.invoiceLogo,
    createdAt,
    updatedAt,
    paidAt: extras.paidAt,
    paidMethod: extras.paidMethod,
    voidedAt: extras.voidedAt,
    voidReason: extras.voidReason,
    firstSentAt: extras.firstSentAt,
    lastSentAt: extras.lastSentAt,
    sendCount: extras.sendCount,
    format: extras.format,
    stripePaymentIntentId: extras.stripePaymentIntentId,
    paidAmountCents: extras.paidAmountCents,
    stripePaymentMethod: extras.stripePaymentMethod,
    stripeWalletType: extras.stripeWalletType,
    stripePaymentStatus: extras.stripePaymentStatus,
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
  if (current.status === 'paid' || current.status === 'void') {
    return errorJson(
      `A ${current.status} invoice cannot be edited.`,
      409,
    )
  }
  if (parsed.value.status === 'paid' || parsed.value.status === 'void') {
    return errorJson(
      'Use the mark-paid or void endpoints to change this status.',
      400,
    )
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
    {
      paidAt: current.paidAt,
      paidMethod: current.paidMethod,
      voidedAt: current.voidedAt,
      voidReason: current.voidReason,
      firstSentAt: current.firstSentAt,
      lastSentAt: current.lastSentAt,
      sendCount: current.sendCount,
      format: current.format,
      stripePaymentIntentId: current.stripePaymentIntentId ?? null,
      paidAmountCents: current.paidAmountCents ?? null,
      stripePaymentMethod: current.stripePaymentMethod ?? null,
      stripeWalletType: current.stripeWalletType ?? null,
      stripePaymentStatus: current.stripePaymentStatus ?? null,
    },
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

export async function markInvoicePaid(
  id: string,
  request: Request,
  store: InvoiceStore,
  clock: () => string = nowIso,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('Payment data must be a JSON object.', 400)
  }
  const methodRaw = asTrimmedString(body.value.method)
  if (!PAID_METHODS.includes(methodRaw as PaidMethod)) {
    return errorJson(
      'Payment method must be zelle, manual, or other.',
      400,
    )
  }
  const timestamp = clock()
  const result = await store.markPaid(id, {
    paidAt: timestamp,
    paidMethod: methodRaw as PaidMethod,
    updatedAt: timestamp,
  })
  if (result === 'not_found') {
    return errorJson('Invoice not found.', 404)
  }
  if (result === 'already_paid') {
    return errorJson('Invoice is already marked paid.', 409)
  }
  if (result === 'void') {
    return errorJson('A voided invoice cannot be marked paid.', 409)
  }
  const invoice = await store.get(id)
  return json({ invoice: invoice ? publicInvoice(invoice) : null })
}

export async function voidInvoice(
  id: string,
  request: Request,
  store: InvoiceStore,
  clock: () => string = nowIso,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('Void data must be a JSON object.', 400)
  }
  const reason = asTrimmedString(body.value.reason)
  if (reason.length > 200) {
    return errorJson('Void reason must be 200 characters or fewer.', 400)
  }
  const timestamp = clock()
  const result = await store.voidInvoice(id, {
    voidedAt: timestamp,
    voidReason: reason,
    updatedAt: timestamp,
  })
  if (result === 'not_found') {
    return errorJson('Invoice not found.', 404)
  }
  if (result === 'already_void') {
    return errorJson('Invoice is already void.', 409)
  }
  if (result === 'paid') {
    return errorJson('A paid invoice cannot be voided.', 409)
  }
  const invoice = await store.get(id)
  return json({ invoice: invoice ? publicInvoice(invoice) : null })
}
