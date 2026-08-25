import { describe, expect, it } from 'vitest'
import { lineAmountCents } from '../../src/utils/money.ts'
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
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
})
