import { describe, expect, it } from 'vitest'
import { defaultInvoiceFormat } from '../../src/invoice/format.ts'
import { getInvoicePdf, previewInvoicePdf } from './pdf.ts'
import { serializeFormat } from '../settings/format.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import type { InvoiceRecord, InvoiceStore } from './types.ts'
import type { SettingsKvStore } from '../settings/types.ts'
import type { PdfRenderer } from '../pdf/types.ts'

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = '2026-08-25T15:00:00.000Z'

function record(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: ID_A,
    number: 'BD2026-0051',
    status: 'sent',
    issueDate: '2026-08-25',
    dueDate: '2026-09-24',
    currency: 'USD',
    from: {
      name: 'Bitz Designs',
      email: 'billing@bitzdesigns.co',
      address: {
        line1: '',
        line2: '',
        city: '',
        region: '',
        postalCode: '',
        country: '',
      },
    },
    customer: {
      name: 'Ada',
      email: 'ada@example.com',
      address: {
        line1: '',
        line2: '',
        city: '',
        region: '',
        postalCode: '',
        country: '',
      },
    },
    payment: {
      memo: 'Pay',
      zelleEmail: 'billing@bitzdesigns.co',
      cardFeePercentScaled: 300,
      cardFeeFixedCents: 30,
    },
    notes: '',
    invoiceLogo: { path: '/branding/bitz-designs-icon.png' },
    createdAt: NOW,
    updatedAt: NOW,
    paidAt: null,
    paidMethod: null,
    voidedAt: null,
    voidReason: null,
    firstSentAt: NOW,
    lastSentAt: NOW,
    sendCount: 1,
    format: defaultInvoiceFormat(),
    lineItems: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        invoiceId: ID_A,
        sortOrder: 0,
        description: 'Design',
        quantityScaled: 10_000,
        unitPriceCents: 5000,
      },
    ],
    ...overrides,
  }
}

function emptyStore(getImpl: InvoiceStore['get']): InvoiceStore {
  return {
    async list() {
      return []
    },
    get: getImpl,
    async findIdByNumber() {
      return null
    },
    async create(next) {
      return next
    },
    async replace() {
      return null
    },
    async deleteDraft() {
      return 'not_found'
    },
    async markPaid() {
      return 'not_found'
    },
    async voidInvoice() {
      return 'not_found'
    },
    async snapshotFormat() {},
    async applySendSuccess() {},
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

function settings(): SettingsKvStore {
  const kv = new Map<string, string | null>([
    [SETTINGS_KEYS.format, serializeFormat(defaultInvoiceFormat())],
  ])
  return {
    async get(key) {
      return kv.get(key) ?? null
    },
    async set(key, value) {
      kv.set(key, value)
    },
  }
}

describe('invoice PDF endpoint', () => {
  it('returns 404 for a missing invoice', async () => {
    const response = await getInvoicePdf(ID_A, {
      store: emptyStore(async () => null),
      settings: settings(),
      origin: 'https://example.test',
      pdf: {
        async renderHtml() {
          return new Uint8Array([1])
        },
      },
    })
    expect(response.status).toBe(404)
  })

  it('uses the base invoice total and a sanitized filename', async () => {
    let html = ''
    const response = await getInvoicePdf(ID_A, {
      store: emptyStore(async () => record()),
      settings: settings(),
      origin: 'https://example.test',
      pdf: {
        async renderHtml(value) {
          html = value
          return new Uint8Array([0x25, 0x50, 0x44, 0x46])
        },
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain(
      'Invoice-BD2026-0051.pdf',
    )
    expect(html).toContain('$50.00')
    expect(html).not.toContain('$51.80')
  })

  it('fails loudly instead of falling back to html2canvas', async () => {
    const response = await getInvoicePdf(ID_A, {
      store: emptyStore(async () => record()),
      settings: settings(),
      origin: 'https://example.test',
      pdf: {
        async renderHtml() {
          throw new Error('Browser Rendering unavailable')
        },
      },
    })
    expect(response.status).toBe(502)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toMatch(/Browser Rendering/)
    expect(payload.error).not.toMatch(/html2canvas/i)
  })

  it('uses the saved format snapshot, not the live settings', async () => {
    const snapshot = defaultInvoiceFormat()
    snapshot.global.primaryFont = 'lora'
    const live = defaultInvoiceFormat()
    live.global.primaryFont = 'inter'
    let html = ''
    await getInvoicePdf(ID_A, {
      store: emptyStore(async () => record({ format: snapshot })),
      settings: {
        async get() {
          return serializeFormat(live)
        },
        async set() {},
      },
      origin: 'https://example.test',
      pdf: {
        async renderHtml(value) {
          html = value
          return new Uint8Array([0x25, 0x50, 0x44, 0x46])
        },
      },
    })
    expect(html).toContain('Lora')
  })
})

describe('preview PDF', () => {
  it('validates client JSON instead of trusting arbitrary HTML', async () => {
    const response = await previewInvoicePdf(
      new Request('https://example.test/api/invoices/preview-pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ html: '<script>alert(1)</script>' }),
      }),
      {
        store: emptyStore(async () => null),
        settings: settings(),
        origin: 'https://example.test',
        pdf: {
          async renderHtml() {
            throw new Error('should not render')
          },
        },
      },
    )
    expect(response.status).toBe(400)
  })
})


