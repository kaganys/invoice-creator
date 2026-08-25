import { createDefaultInvoice, createEmptyLineItem } from '../data/defaultInvoice.ts'
import type {
  Address,
  Invoice,
  InvoiceLineItem,
  InvoiceParty,
  InvoicePayment,
  InvoiceStatus,
} from '../types/invoice.ts'
import { INVOICE_STATUSES } from '../types/invoice.ts'

export const INVOICE_DRAFT_STORAGE_KEY = 'bitz-designs-invoice-draft'
export const INVOICE_DRAFT_VERSION = 3

export type WorkingDraft = {
  invoice: Invoice
  savedId: string | null
  status: InvoiceStatus
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function sanitizeAddress(value: unknown, fallback: Address): Address {
  if (!isRecord(value)) {
    return { ...fallback }
  }

  return {
    line1: asString(value.line1, fallback.line1),
    line2: asString(value.line2, fallback.line2),
    city: asString(value.city, fallback.city),
    region: asString(value.region, fallback.region),
    postalCode: asString(value.postalCode, fallback.postalCode),
    country: asString(value.country, fallback.country),
  }
}

function sanitizeParty(value: unknown, fallback: InvoiceParty): InvoiceParty {
  if (!isRecord(value)) {
    return {
      ...fallback,
      address: { ...fallback.address },
    }
  }

  return {
    name: asString(value.name, fallback.name),
    email: asString(value.email, fallback.email),
    address: sanitizeAddress(value.address, fallback.address),
  }
}

function sanitizeLineItem(value: unknown): InvoiceLineItem | null {
  if (!isRecord(value)) {
    return null
  }

  const item = createEmptyLineItem({
    id: asString(value.id) || undefined,
    description: asString(value.description),
    quantity: asString(value.quantity),
    unitPrice: asString(value.unitPrice),
  })

  return item
}

function sanitizeLineItems(value: unknown): InvoiceLineItem[] {
  if (!Array.isArray(value)) {
    return createDefaultInvoice().lineItems
  }

  const items: InvoiceLineItem[] = []
  const seen = new Set<string>()

  for (const entry of value) {
    const item = sanitizeLineItem(entry)
    if (!item) {
      continue
    }
    if (seen.has(item.id)) {
      item.id = createEmptyLineItem().id
    }
    seen.add(item.id)
    items.push(item)
  }

  return items.length > 0 ? items : [createEmptyLineItem()]
}

function sanitizePayment(
  value: unknown,
  fallback: InvoicePayment,
): InvoicePayment {
  if (!isRecord(value)) {
    return { ...fallback }
  }

  return {
    memo: asString(value.memo, fallback.memo),
    zelleEmail: asString(value.zelleEmail, fallback.zelleEmail),
    cardFeePercent: asString(value.cardFeePercent, fallback.cardFeePercent),
    cardFeeFixed: asString(value.cardFeeFixed, fallback.cardFeeFixed),
  }
}

export function sanitizeInvoice(value: unknown): Invoice | null {
  if (!isRecord(value)) {
    return null
  }

  const fallback = createDefaultInvoice()

  return {
    number: asString(value.number, fallback.number),
    issueDate: asString(value.issueDate, fallback.issueDate),
    dueDate: asString(value.dueDate, fallback.dueDate),
    currency: asString(value.currency, fallback.currency) || 'USD',
    from: sanitizeParty(value.from, fallback.from),
    customer: sanitizeParty(value.customer, fallback.customer),
    lineItems: sanitizeLineItems(value.lineItems),
    payment: sanitizePayment(value.payment, fallback.payment),
    notes: asString(value.notes, fallback.notes),
  }
}

function extractStoredInvoice(parsed: unknown): unknown {
  if (!isRecord(parsed)) {
    return null
  }

  if (isRecord(parsed.invoice)) {
    return parsed.invoice
  }

  if ('number' in parsed || 'lineItems' in parsed) {
    return parsed
  }

  return null
}

function asStatus(value: unknown): InvoiceStatus {
  return typeof value === 'string' &&
    (INVOICE_STATUSES as readonly string[]).includes(value)
    ? (value as InvoiceStatus)
    : 'draft'
}

export function loadWorkingDraft(): WorkingDraft {
  const empty = {
    invoice: createDefaultInvoice(),
    savedId: null,
    status: 'draft' as const,
  }

  try {
    const raw = localStorage.getItem(INVOICE_DRAFT_STORAGE_KEY)
    if (!raw) {
      return empty
    }

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return empty
    }

    const version = parsed.version
    if (version !== 2 && version !== 3) {
      return empty
    }

    const sanitized = sanitizeInvoice(extractStoredInvoice(parsed))
    if (!sanitized) {
      return empty
    }

    return {
      invoice: sanitized,
      savedId:
        version === 3 && typeof parsed.savedId === 'string' && parsed.savedId
          ? parsed.savedId
          : null,
      status: version === 3 ? asStatus(parsed.status) : 'draft',
    }
  } catch {
    return empty
  }
}

export function loadInvoiceDraft(): Invoice {
  return loadWorkingDraft().invoice
}

export function saveWorkingDraft(draft: WorkingDraft): void {
  try {
    const payload = JSON.stringify({
      version: INVOICE_DRAFT_VERSION,
      savedId: draft.savedId,
      status: draft.status,
      invoice: draft.invoice,
    })
    localStorage.setItem(INVOICE_DRAFT_STORAGE_KEY, payload)
  } catch {
    // Quota or private mode — editing can continue without persistence.
  }
}

export function saveInvoiceDraft(invoice: Invoice): void {
  const current = loadWorkingDraft()
  saveWorkingDraft({
    ...current,
    invoice,
  })
}

export function clearInvoiceDraft(): void {
  try {
    localStorage.removeItem(INVOICE_DRAFT_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}
