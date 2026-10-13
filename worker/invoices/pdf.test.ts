import { describe, expect, it } from 'vitest'
import { defaultInvoiceFormat } from '../../src/invoice/format.ts'
import { getInvoicePdf, previewInvoicePdf } from './pdf.ts'
import { serializeFormat } from '../settings/format.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import type { InvoiceRecord, InvoiceStore } from './types.ts'
import type { SettingsKvStore } from '../settings/types.ts'
import type { PaymentTokenRecord, PaymentTokenStore } from '../payments/types.ts'
import { ensureActivePaymentToken } from '../payments/ensureToken.ts'

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = '2026-08-25T15:00:00.000Z'
const KEY = 'test-payment-link-key'

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
    stripePaymentIntentId: null,
    paidAmountCents: null,
    stripePaymentMethod: null,
    stripeWalletType: null,
    stripePaymentStatus: null,
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
    async attachStripeReceipt() {},
    async updateStripeProgress() {},
    async claimStripeAttempt() {
      return true
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

function createTokenStore(): PaymentTokenStore & { rows: PaymentTokenRecord[] } {
  const rows: PaymentTokenRecord[] = []
  return {
    rows,
    async getActiveByInvoiceId(invoiceId) {
      return rows.find((row) => row.invoiceId === invoiceId && row.status === 'active') ?? null
    },
    async getByHash(tokenHash) {
      return rows.find((row) => row.tokenHash === tokenHash) ?? null
    },
    async insert(record) {
      rows.push(structuredClone(record))
    },
    async revokeActive(invoiceId, reason, revokedAt) {
      let count = 0
      for (const row of rows) {
        if (row.invoiceId === invoiceId && row.status === 'active') {
          row.status = 'revoked'
          row.revokedAt = revokedAt
          row.revokedReason = reason
          count += 1
        }
      }
      return count
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

  it('renders the existing active payment URL as a clickable hyperlink in saved PDFs', async () => {
    const tokens = createTokenStore()
    const ensured = await ensureActivePaymentToken(ID_A, {
      tokens,
      paymentLinkKey: KEY,
      clock: () => NOW,
      idFactory: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    })
    if (!ensured.ok) {
      throw new Error(ensured.message)
    }

    let html = ''
    const response = await getInvoicePdf(ID_A, {
      store: emptyStore(async () => record()),
      settings: settings(),
      origin: 'https://example.test',
      tokens,
      paymentLinkKey: KEY,
      paymentBaseUrl: 'https://pay.example.com',
      pdf: {
        async renderHtml(value) {
          html = value
          return new Uint8Array([0x25, 0x50, 0x44, 0x46])
        },
      },
    })

    expect(response.status).toBe(200)
    expect(html).toContain(`href="https://pay.example.com/i/${ensured.rawToken}"`)
    expect(html).toContain('Pay Online')
  })

  it('omits the Pay Online button in saved PDFs when no active payment URL exists', async () => {
    let html = ''
    const response = await getInvoicePdf(ID_A, {
      store: emptyStore(async () => record()),
      settings: settings(),
      origin: 'https://example.test',
      tokens: createTokenStore(),
      paymentLinkKey: KEY,
      paymentBaseUrl: 'https://pay.example.com',
      pdf: {
        async renderHtml(value) {
          html = value
          return new Uint8Array([0x25, 0x50, 0x44, 0x46])
        },
      },
    })

    expect(response.status).toBe(200)
    expect(html).not.toContain('<p class="invoice-sheet__pay">')
    expect(html).not.toContain('>Pay Online<')
    expect(html).not.toContain('/i/')
  })

  it('omits the payment CTA for paid and void invoices even when a token store is present', async () => {
    for (const status of ['paid', 'void'] as const) {
      let html = ''
      const response = await getInvoicePdf(ID_A, {
        store: emptyStore(async () =>
          record(
            status === 'paid'
              ? { status, paidAt: NOW }
              : { status, voidedAt: NOW },
          ),
        ),
        settings: settings(),
        origin: 'https://example.test',
        tokens: createTokenStore(),
        paymentLinkKey: KEY,
        paymentBaseUrl: 'https://pay.example.com',
        pdf: {
          async renderHtml(value) {
            html = value
            return new Uint8Array([0x25, 0x50, 0x44, 0x46])
          },
        },
      })

      expect(response.status).toBe(200)
      expect(html).not.toContain('<p class="invoice-sheet__pay">')
      expect(html).not.toContain('/i/')
    }
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
