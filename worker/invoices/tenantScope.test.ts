import { describe, expect, it } from 'vitest'
import { createD1InvoiceStore } from './d1Store.ts'
import type { InvoiceRecord } from './types.ts'

const COMPANY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const COMPANY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INVOICE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type Call = { sql: string; binds: unknown[] }

function recordingDb(status: 'draft' | 'sent' = 'sent') {
  const calls: Call[] = []
  function prepare(sql: string) {
    let binds: unknown[] = []
    const statement = {
      bind(...args: unknown[]) {
        binds = args
        return statement
      },
      async first() {
        calls.push({ sql, binds: [...binds] })
        if (sql.includes('SELECT status')) {
          return { status }
        }
        if (sql.includes('SELECT id')) {
          return { id: INVOICE_ID }
        }
        return null
      },
      async run() {
        calls.push({ sql, binds: [...binds] })
        return { meta: { changes: 1 } }
      },
      async all() {
        calls.push({ sql, binds: [...binds] })
        return { results: [] }
      },
    }
    return statement
  }
  return {
    calls,
    prepare,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      for (const statement of statements) {
        await statement.run()
      }
      return []
    },
  }
}

function record(): InvoiceRecord {
  return {
    id: INVOICE_ID,
    companyId: COMPANY_A,
    number: 'BD2026-0001',
    status: 'sent',
    issueDate: '2026-08-25',
    dueDate: '2026-09-24',
    currency: 'USD',
    from: {
      name: 'A',
      email: '',
      address: { line1: '', line2: '', city: '', region: '', postalCode: '', country: '' },
    },
    customer: {
      name: 'Customer',
      email: '',
      address: { line1: '', line2: '', city: '', region: '', postalCode: '', country: '' },
    },
    payment: {
      memo: '',
      zelleEmail: '',
      cardFeePercentScaled: 0,
      cardFeeFixedCents: 0,
    },
    notes: '',
    invoiceLogo: { path: '/branding/bitz-designs-icon.png' },
    lineItems: [],
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
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
  }
}

function writesFor(companyId: string) {
  const db = recordingDb('draft')
  const store = createD1InvoiceStore(db as unknown as D1Database, companyId)
  return { db, store }
}

describe('invoice writes stay inside the company', () => {
  it('delete, mark paid, void, and replace all bind company_id', async () => {
    const db = recordingDb('draft')
    const store = createD1InvoiceStore(db as unknown as D1Database, COMPANY_A)

    await store.deleteDraft(INVOICE_ID)
    await store.markPaid(INVOICE_ID, {
      paidAt: '2026-08-25T00:00:00.000Z',
      paidMethod: 'manual',
      updatedAt: '2026-08-25T00:00:00.000Z',
    })
    await store.voidInvoice(INVOICE_ID, {
      voidedAt: '2026-08-25T00:00:00.000Z',
      voidReason: 'Duplicate',
      updatedAt: '2026-08-25T00:00:00.000Z',
    })
    await store.replace(record())
    await store.snapshotFormat(INVOICE_ID, '{}', '2026-08-25T00:00:00.000Z')

    const mutating = db.calls.filter(
      (call) =>
        call.sql.includes('DELETE FROM invoices') ||
        call.sql.includes("SET status = 'paid'") ||
        call.sql.includes("SET status = 'void'") ||
        call.sql.includes('UPDATE invoices SET') ||
        call.sql.includes('SELECT status') ||
        call.sql.includes('SELECT id FROM invoices') ||
        call.sql.includes('format_json'),
    )
    expect(mutating.length).toBeGreaterThan(0)
    for (const call of mutating) {
      expect(call.sql).toContain('company_id')
      expect(call.binds).toContain(COMPANY_A)
      expect(call.binds).not.toContain(COMPANY_B)
    }
  })

  it('does not add a company filter when the store is global', async () => {
    const { db, store } = writesFor('')
    const globalStore = createD1InvoiceStore(db as unknown as D1Database)
    await globalStore.markPaid(INVOICE_ID, {
      paidAt: '2026-08-25T00:00:00.000Z',
      paidMethod: 'zelle',
      updatedAt: '2026-08-25T00:00:00.000Z',
    })
    const update = db.calls.find((call) => call.sql.includes("SET status = 'paid'"))
    expect(update?.sql).not.toContain('company_id')
    expect(store).toBeTruthy()
  })
})
