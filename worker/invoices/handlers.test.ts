import { describe, expect, it } from 'vitest'
import { lineAmountCents } from '../../src/utils/money.ts'
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  markInvoicePaid,
  updateInvoice,
  voidInvoice,
} from './handlers.ts'
import type { InvoiceRecord, InvoiceStore } from './types.ts'

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LINE_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const LINE_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW = '2026-08-25T15:00:00.000Z'

function body(overrides: Record<string, unknown> = {}) {
  return {
    number: 'BD2026-0100',
    issueDate: '2026-08-25',
    dueDate: '2026-09-24',
    currency: 'USD',
    from: {
      name: 'Bitz Designs',
      email: 'billing@bitzdesigns.co',
      address: { country: 'United States' },
    },
    customer: {
      name: 'Shaul Kagen',
      email: 'skagan@example.com',
      address: { city: 'New York' },
    },
    payment: {
      memo: 'Please pay by Zelle',
      zelleEmail: 'billing@bitzdesigns.co',
      cardFeePercent: '3',
      cardFeeFixed: '0.30',
    },
    notes: 'Snapshot notes',
    lineItems: [
      {
        description: 'Design services',
        quantity: '1',
        unitPrice: '50.00',
      },
    ],
    ...overrides,
  }
}

function jsonRequest(payload: unknown, method = 'POST'): Request {
  return new Request('https://example.test/api/invoices', {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

function createMemoryStore(): InvoiceStore {
  const invoices = new Map<string, InvoiceRecord>()

  return {
    async list() {
      return [...invoices.values()].map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        customerName: invoice.customer.name,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        amountCents: invoice.lineItems.reduce(
          (sum, line) =>
            sum + lineAmountCents(line.quantityScaled, line.unitPriceCents),
          0,
        ),
        currency: invoice.currency,
        status: invoice.status,
        createdAt: invoice.createdAt,
      }))
    },
    async get(id) {
      const record = invoices.get(id)
      return record ? structuredClone(record) : null
    },
    async findIdByNumber(number) {
      for (const record of invoices.values()) {
        if (record.number === number) {
          return record.id
        }
      }
      return null
    },
    async create(record) {
      invoices.set(record.id, structuredClone(record))
      return structuredClone(record)
    },
    async replace(record) {
      if (!invoices.has(record.id)) {
        return null
      }
      invoices.set(record.id, structuredClone(record))
      return structuredClone(record)
    },
    async deleteDraft(id) {
      const existing = invoices.get(id)
      if (!existing) {
        return 'not_found'
      }
      if (existing.status !== 'draft') {
        return 'not_draft'
      }
      invoices.delete(id)
      return 'deleted'
    },
    async markPaid(id, fields) {
      const existing = invoices.get(id)
      if (!existing) {
        return 'not_found'
      }
      if (existing.status === 'paid') {
        return 'already_paid'
      }
      if (existing.status === 'void') {
        return 'void'
      }
      existing.status = 'paid'
      existing.paidAt = fields.paidAt
      existing.paidMethod = fields.paidMethod
      existing.updatedAt = fields.updatedAt
      return 'ok'
    },
    async voidInvoice(id, fields) {
      const existing = invoices.get(id)
      if (!existing) {
        return 'not_found'
      }
      if (existing.status === 'void') {
        return 'already_void'
      }
      if (existing.status === 'paid') {
        return 'paid'
      }
      existing.status = 'void'
      existing.voidedAt = fields.voidedAt
      existing.voidReason = fields.voidReason
      existing.updatedAt = fields.updatedAt
      return 'ok'
    },
    async snapshotFormat(id, formatJson, updatedAt) {
      const existing = invoices.get(id)
      if (!existing || existing.format) {
        return
      }
      existing.format = JSON.parse(formatJson)
      existing.updatedAt = updatedAt
    },
    async applySendSuccess(id, fields) {
      const existing = invoices.get(id)
      if (!existing) {
        return
      }
      existing.status = fields.status
      existing.firstSentAt = existing.firstSentAt ?? fields.firstSentAt
      existing.lastSentAt = fields.lastSentAt
      existing.sendCount = fields.sendCount
      existing.format = existing.format ?? JSON.parse(fields.formatJson)
      existing.updatedAt = fields.updatedAt
    },
    async insertEmailLog() {
      return 'ok'
    },
    async updateEmailLog() {},
    async getEmailLogByIdempotency() {
      return null
    },
    async listEmailLogs() {
      return []
    },
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe('invoice API handlers', () => {
  it('creates an invoice with integer cents on line items', async () => {
    const store = createMemoryStore()
    const response = await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    expect(response.status).toBe(201)
    const created = await store.get(ID_A)
    expect(created?.lineItems[0]?.unitPriceCents).toBe(5000)
    expect(created?.lineItems[0]?.quantityScaled).toBe(10_000)
    expect(created?.status).toBe('draft')
    expect(created?.payment.cardFeePercentScaled).toBe(300)
    expect(created?.payment.cardFeeFixedCents).toBe(30)
    const payload = await readJson(response)
    const invoice = payload.invoice as { lineItems: Array<{ unitPrice: string }> }
    expect(invoice.lineItems[0]?.unitPrice).toBe('50.00')
  })

  it('stores multiple line items in order and computes the invoice total from them', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(
        body({
          lineItems: [
            { id: LINE_A, description: 'A', quantity: '2', unitPrice: '10.00' },
            { id: LINE_B, description: 'B', quantity: '1', unitPrice: '5.50' },
          ],
        }),
      ),
      store,
      () => NOW,
      (() => {
        const ids = [ID_A, LINE_A, LINE_B]
        return () => ids.shift() ?? ID_B
      })(),
    )
    const record = await store.get(ID_A)
    expect(record?.lineItems.map((line) => line.description)).toEqual(['A', 'B'])
    const listed = await readJson(await listInvoices(store))
    const rows = listed.invoices as Array<{ amountCents: number }>
    expect(rows[0]?.amountCents).toBe(2550)
  })

  it('retrieves a saved invoice snapshot', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    const response = await getInvoice(ID_A, store)
    expect(response.status).toBe(200)
    const payload = await readJson(response)
    const invoice = payload.invoice as {
      customer: { name: string; address: { city: string } }
      from: { name: string }
    }
    expect(invoice.customer.name).toBe('Shaul Kagen')
    expect(invoice.customer.address.city).toBe('New York')
    expect(invoice.from.name).toBe('Bitz Designs')
  })

  it('does not keep a person id, so later people edits cannot mutate the snapshot', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    const record = await store.get(ID_A)
    expect(record).not.toHaveProperty('personId')
    expect(record).not.toHaveProperty('customerPersonId')
    expect(JSON.stringify(record)).not.toMatch(/personId/)
  })

  it('updates an invoice', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    const response = await updateInvoice(
      ID_A,
      jsonRequest(
        body({
          number: 'BD2026-0100',
          customer: { name: 'Updated Customer' },
          lineItems: [{ description: 'Revised', quantity: '1', unitPrice: '80.00' }],
        }),
        'PUT',
      ),
      store,
      () => '2026-08-25T16:00:00.000Z',
      () => LINE_B,
    )
    expect(response.status).toBe(200)
    const updated = await store.get(ID_A)
    expect(updated?.customer.name).toBe('Updated Customer')
    expect(updated?.lineItems[0]?.unitPriceCents).toBe(8000)
  })

  it('rejects a duplicate invoice number', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    const response = await createInvoice(
      jsonRequest(body({ number: 'BD2026-0100' })),
      store,
      () => NOW,
      () => ID_B,
    )
    expect(response.status).toBe(409)
  })

  it('deletes a draft and refuses to delete a non-draft', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body({ number: 'DRAFT-1' })),
      store,
      () => NOW,
      () => ID_A,
    )
    await createInvoice(
      jsonRequest(body({ number: 'SENT-1', status: 'sent' })),
      store,
      () => NOW,
      () => ID_B,
    )
    const deleted = await deleteInvoice(ID_A, store)
    expect(deleted.status).toBe(200)
    const refused = await deleteInvoice(ID_B, store)
    expect(refused.status).toBe(409)
    expect(await store.get(ID_A)).toBeNull()
    expect(await store.get(ID_B)).not.toBeNull()
  })

  it('rejects invalid line items and malformed JSON', async () => {
    const store = createMemoryStore()
    const invalidLine = await createInvoice(
      jsonRequest(body({ lineItems: [{ description: 'Bad', quantity: '0', unitPrice: '10.00' }] })),
      store,
    )
    expect(invalidLine.status).toBe(400)
    const malformed = await createInvoice(jsonRequest('{nope', 'POST'), store)
    expect(malformed.status).toBe(400)
  })

  it('marks an invoice paid with method and timestamp', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    const paid = await markInvoicePaid(
      ID_A,
      jsonRequest({ method: 'zelle' }, 'POST'),
      store,
      () => '2026-08-26T10:00:00.000Z',
    )
    expect(paid.status).toBe(200)
    const record = await store.get(ID_A)
    expect(record?.status).toBe('paid')
    expect(record?.paidMethod).toBe('zelle')
    expect(record?.paidAt).toBe('2026-08-26T10:00:00.000Z')
    expect(record?.payment.cardFeePercentScaled).toBe(300)
  })

  it('rejects marking paid twice and marking a void invoice paid', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    await createInvoice(
      jsonRequest(body({ number: 'VOID-1' })),
      store,
      () => NOW,
      () => ID_B,
    )
    await markInvoicePaid(
      ID_A,
      jsonRequest({ method: 'manual' }, 'POST'),
      store,
    )
    const twice = await markInvoicePaid(
      ID_A,
      jsonRequest({ method: 'other' }, 'POST'),
      store,
    )
    expect(twice.status).toBe(409)
    await voidInvoice(ID_B, jsonRequest({ reason: 'cancelled' }, 'POST'), store)
    const paidVoid = await markInvoicePaid(
      ID_B,
      jsonRequest({ method: 'zelle' }, 'POST'),
      store,
    )
    expect(paidVoid.status).toBe(409)
  })

  it('voids an invoice and keeps it in the store', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    const voided = await voidInvoice(
      ID_A,
      jsonRequest({ reason: 'Duplicate' }, 'POST'),
      store,
      () => '2026-08-26T11:00:00.000Z',
    )
    expect(voided.status).toBe(200)
    const record = await store.get(ID_A)
    expect(record?.status).toBe('void')
    expect(record?.voidReason).toBe('Duplicate')
    expect(record?.voidedAt).toBe('2026-08-26T11:00:00.000Z')
  })

  it('rejects voiding a paid invoice and editing a void invoice', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    await markInvoicePaid(
      ID_A,
      jsonRequest({ method: 'zelle' }, 'POST'),
      store,
    )
    const voidPaid = await voidInvoice(
      ID_A,
      jsonRequest({ reason: 'nope' }, 'POST'),
      store,
    )
    expect(voidPaid.status).toBe(409)

    await createInvoice(
      jsonRequest(body({ number: 'VOID-2' })),
      store,
      () => NOW,
      () => ID_B,
    )
    await voidInvoice(ID_B, jsonRequest({ reason: '' }, 'POST'), store)
    const edited = await updateInvoice(
      ID_B,
      jsonRequest(body({ number: 'VOID-2', customer: { name: 'X' } }), 'PUT'),
      store,
    )
    expect(edited.status).toBe(409)
  })

  it('updates an existing invoice rather than creating a duplicate', async () => {
    const store = createMemoryStore()
    await createInvoice(
      jsonRequest(body()),
      store,
      () => NOW,
      () => ID_A,
    )
    await updateInvoice(
      ID_A,
      jsonRequest(
        body({ customer: { name: 'Updated Customer' } }),
        'PUT',
      ),
      store,
      () => '2026-08-25T16:00:00.000Z',
      () => LINE_B,
    )
    expect(await store.get(ID_A)).toMatchObject({
      id: ID_A,
      customer: { name: 'Updated Customer' },
    })
    expect(await store.findIdByNumber('BD2026-0100')).toBe(ID_A)
    const listed = await readJson(await listInvoices(store))
    expect((listed.invoices as unknown[]).length).toBe(1)
  })
})
