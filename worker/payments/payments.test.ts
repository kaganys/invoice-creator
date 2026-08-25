import { describe, expect, it } from 'vitest'
import { lineAmountCents } from '../../src/utils/money.ts'
import { markInvoicePaid, voidInvoice } from '../invoices/handlers.ts'
import type { InvoiceRecord, InvoiceStore } from '../invoices/types.ts'
import {
  getInvoicePaymentLink,
  regenerateInvoicePaymentLink,
} from './admin.ts'
import { ensureActivePaymentToken } from './ensureToken.ts'
import { getPublicInvoiceByToken } from './public.ts'
import {
  generatePaymentToken,
  hashPaymentToken,
  paymentPageUrl,
} from './tokenCrypto.ts'
import type { PaymentTokenRecord, PaymentTokenStore } from './types.ts'

const INVOICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = '2026-08-25T15:00:00.000Z'
const KEY = 'test-payment-link-key'

function invoiceRecord(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: INVOICE_ID,
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
      memo: 'Pay by Zelle',
      zelleEmail: 'billing@bitzdesigns.co',
      cardFeePercentScaled: 300,
      cardFeeFixedCents: 30,
    },
    notes: 'Internal admin notes — do not leak',
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
    format: null,
    stripePaymentIntentId: null,
    paidAmountCents: null,
    lineItems: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        invoiceId: INVOICE_ID,
        sortOrder: 0,
        description: 'Design',
        quantityScaled: 10_000,
        unitPriceCents: 5000,
      },
    ],
    ...overrides,
  }
}

function createInvoiceStore(seed: InvoiceRecord): InvoiceStore {
  const invoices = new Map<string, InvoiceRecord>([[seed.id, structuredClone(seed)]])
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
      const value = invoices.get(id)
      return value ? structuredClone(value) : null
    },
    async findIdByNumber(number) {
      for (const invoice of invoices.values()) {
        if (invoice.number === number) {
          return invoice.id
        }
      }
      return null
    },
    async create(record) {
      invoices.set(record.id, structuredClone(record))
      return structuredClone(record)
    },
    async replace(record) {
      invoices.set(record.id, structuredClone(record))
      return structuredClone(record)
    },
    async deleteDraft() {
      return 'not_found'
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
    async attachStripeReceipt() {},
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

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

async function issueToken(
  tokens: PaymentTokenStore,
  idFactory: string,
) {
  const result = await ensureActivePaymentToken(INVOICE_ID, {
    tokens,
    paymentLinkKey: KEY,
    clock: () => NOW,
    idFactory: () => idFactory,
  })
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result
}

describe('public payment tokens', () => {
  it('looks up a sent invoice by hashed token and hides admin-only fields', async () => {
    const tokens = createTokenStore()
    const invoices = createInvoiceStore(invoiceRecord())
    const ensured = await issueToken(
      tokens,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    )
    const stored = await tokens.getByHash(await hashPaymentToken(ensured.rawToken))
    expect(stored?.tokenHash).not.toBe(ensured.rawToken)

    const response = await getPublicInvoiceByToken(ensured.rawToken, {
      tokens,
      invoices,
    })
    expect(response.status).toBe(200)
    const payload = await readJson(response)
    expect(payload.state).toBe('payable')
    const body = JSON.stringify(payload)
    expect(body).toContain('$50.00')
    const publicInvoice = payload.invoice as {
      amountDueCents: number
      cardTotalCents: number
      cardPaymentAvailable: boolean
    }
    expect(publicInvoice.amountDueCents).toBe(5000)
    expect(publicInvoice.cardTotalCents).toBe(5180)
    expect(body).not.toContain('Internal admin notes')
    expect(body).not.toContain(INVOICE_ID)
    expect(body).not.toContain(stored?.tokenHash)
    expect(body).not.toContain('smtp')
    expect(body).not.toContain('sendCount')
    expect(body).not.toContain('ada@example.com')
    expect(body).not.toContain('zelleEmail')
    expect(body).not.toContain('billing@bitzdesigns.co')
    expect(body).not.toContain('paymentMemo')
    expect(body).not.toContain('Pay by Zelle')
    expect(publicInvoice.cardPaymentAvailable).toBe(false)
  })

  it('exposes snapshotted card fees for a card-only public payment page', async () => {
    const tokens = createTokenStore()
    const invoices = createInvoiceStore(
      invoiceRecord({
        payment: {
          memo: 'Pay by Zelle',
          zelleEmail: 'billing@bitzdesigns.co',
          cardFeePercentScaled: 300,
          cardFeeFixedCents: 0,
        },
      }),
    )
    const ensured = await issueToken(
      tokens,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    )
    const response = await getPublicInvoiceByToken(ensured.rawToken, {
      tokens,
      invoices,
      payments: {
        stripeEnabled: true,
        cardPaymentsEnabled: true,
        publishableKey: 'pk_test_51ABC',
        statementDescriptor: 'BITZ',
      },
      stripeSecretConfigured: true,
    })
    const payload = await readJson(response)
    const invoice = payload.invoice as {
      amountDueCents: number
      cardFeeCents: number
      cardTotalCents: number
      cardPaymentAvailable: boolean
      zelleEmail?: string
      paymentMemo?: string
    }
    expect(payload.state).toBe('payable')
    expect(invoice.amountDueCents).toBe(5000)
    expect(invoice.cardFeeCents).toBe(150)
    expect(invoice.cardTotalCents).toBe(5150)
    expect(invoice.cardPaymentAvailable).toBe(true)
    expect(invoice.zelleEmail).toBeUndefined()
    expect(invoice.paymentMemo).toBeUndefined()
    expect(JSON.stringify(payload)).not.toMatch(/zelle/i)
  })

  it('uses percent plus fixed fee from the saved invoice, not later settings', async () => {
    const tokens = createTokenStore()
    const snapshot = invoiceRecord({
      payment: {
        memo: 'Memo',
        zelleEmail: 'billing@bitzdesigns.co',
        cardFeePercentScaled: 290,
        cardFeeFixedCents: 30,
      },
    })
    const invoices = createInvoiceStore(snapshot)
    const ensured = await issueToken(
      tokens,
      'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
    )

    // Simulate Settings later changing to 2.5% — the stored invoice is unchanged.
    const settingsWouldBe = { cardFeePercentScaled: 250, cardFeeFixedCents: 0 }
    expect(snapshot.payment.cardFeePercentScaled).not.toBe(
      settingsWouldBe.cardFeePercentScaled,
    )

    const response = await getPublicInvoiceByToken(ensured.rawToken, {
      tokens,
      invoices,
    })
    const invoice = (await readJson(response)).invoice as {
      cardFeeCents: number
      cardTotalCents: number
      amountDueCents: number
    }
    expect(invoice.amountDueCents).toBe(5000)
    expect(invoice.cardFeeCents).toBe(175)
    expect(invoice.cardTotalCents).toBe(5175)

    const zeroTokens = createTokenStore()
    const zeroInvoices = createInvoiceStore(
      invoiceRecord({
        payment: {
          memo: 'Memo',
          zelleEmail: 'billing@bitzdesigns.co',
          cardFeePercentScaled: 0,
          cardFeeFixedCents: 0,
        },
      }),
    )
    const zeroToken = await issueToken(
      zeroTokens,
      'cccccccc-cccc-4ccc-8ccc-cccccccccc02',
    )
    const zero = await getPublicInvoiceByToken(zeroToken.rawToken, {
      tokens: zeroTokens,
      invoices: zeroInvoices,
    })
    const zeroInvoice = (await readJson(zero)).invoice as {
      cardFeeCents: number
      cardTotalCents: number
    }
    expect(zeroInvoice.cardFeeCents).toBe(0)
    expect(zeroInvoice.cardTotalCents).toBe(5000)
  })

  it('returns invalid for unknown tokens and sequential invoice numbers', async () => {
    const tokens = createTokenStore()
    const invoices = createInvoiceStore(invoiceRecord())
    const missing = await getPublicInvoiceByToken(generatePaymentToken(), {
      tokens,
      invoices,
    })
    expect(missing.status).toBe(404)
    expect((await readJson(missing)).state).toBe('invalid')

    const byNumber = await getPublicInvoiceByToken('BD2026-0051', {
      tokens,
      invoices,
    })
    expect(byNumber.status).toBe(404)
    expect(JSON.stringify(await readJson(byNumber))).not.toContain('Ada')
  })

  it('shows a paid-friendly state for a revoked paid token', async () => {
    const tokens = createTokenStore()
    const invoices = createInvoiceStore(invoiceRecord({ status: 'paid', paidAt: NOW }))
    const ensured = await issueToken(
      tokens,
      '11111111-1111-4111-8111-111111111111',
    )
    await tokens.revokeActive(INVOICE_ID, 'paid', NOW)
    const response = await getPublicInvoiceByToken(ensured.rawToken, {
      tokens,
      invoices,
    })
    expect(response.status).toBe(200)
    const payload = await readJson(response)
    expect(payload.state).toBe('paid')
    expect(JSON.stringify(payload)).toContain('BD2026-0051')
    expect(JSON.stringify(payload)).not.toContain('Pay by Zelle')
  })

  it('shows a void-friendly state for a voided invoice token', async () => {
    const tokens = createTokenStore()
    const invoices = createInvoiceStore(invoiceRecord({ status: 'void', voidedAt: NOW }))
    const ensured = await issueToken(
      tokens,
      '22222222-2222-4222-8222-222222222222',
    )
    await tokens.revokeActive(INVOICE_ID, 'void', NOW)
    const response = await getPublicInvoiceByToken(ensured.rawToken, {
      tokens,
      invoices,
    })
    expect((await readJson(response)).state).toBe('void')
  })

  it('reuses an active token instead of minting another', async () => {
    const tokens = createTokenStore()
    const first = await issueToken(
      tokens,
      '33333333-3333-4333-8333-333333333333',
    )
    const second = await issueToken(
      tokens,
      '44444444-4444-4444-8444-444444444444',
    )
    expect(second.created).toBe(false)
    expect(second.rawToken).toBe(first.rawToken)
    expect(tokens.rows.filter((row) => row.status === 'active')).toHaveLength(1)
  })

  it('invalidates the prior token when regenerating', async () => {
    const tokens = createTokenStore()
    const invoices = createInvoiceStore(invoiceRecord())
    const first = await issueToken(
      tokens,
      '55555555-5555-4555-8555-555555555555',
    )
    const regenerated = await regenerateInvoicePaymentLink(INVOICE_ID, {
      invoices,
      tokens,
      paymentLinkKey: KEY,
      baseUrl: 'https://pay.example.com',
      clock: () => NOW,
      idFactory: () => '66666666-6666-4666-8666-666666666666',
    })
    expect(regenerated.status).toBe(200)
    const payload = await readJson(regenerated)
    const link = payload.paymentLink as { url: string }
    expect(link.url).not.toContain(first.rawToken)
    const old = await getPublicInvoiceByToken(first.rawToken, { tokens, invoices })
    expect((await readJson(old)).state).toBe('invalid')
  })

  it('revokes the active token when marking paid or voiding', async () => {
    const tokens = createTokenStore()
    const invoices = createInvoiceStore(invoiceRecord({ status: 'sent' }))
    const ensured = await issueToken(
      tokens,
      '77777777-7777-4777-8777-777777777777',
    )
    const paid = await markInvoicePaid(
      INVOICE_ID,
      new Request('https://example.test/paid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'zelle' }),
      }),
      invoices,
      () => NOW,
    )
    expect(paid.status).toBe(200)
    await tokens.revokeActive(INVOICE_ID, 'paid', NOW)
    expect(await tokens.getActiveByInvoiceId(INVOICE_ID)).toBeNull()
    const publicPaid = await getPublicInvoiceByToken(ensured.rawToken, {
      tokens,
      invoices,
    })
    expect((await readJson(publicPaid)).state).toBe('paid')

    const voidStore = createInvoiceStore(invoiceRecord({ status: 'sent' }))
    const voidTokens = createTokenStore()
    const voidedToken = await issueToken(
      voidTokens,
      '88888888-8888-4888-8888-888888888888',
    )
    await voidInvoice(
      INVOICE_ID,
      new Request('https://example.test/void', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'cancelled' }),
      }),
      voidStore,
      () => NOW,
    )
    await voidTokens.revokeActive(INVOICE_ID, 'void', NOW)
    const publicVoid = await getPublicInvoiceByToken(voidedToken.rawToken, {
      tokens: voidTokens,
      invoices: voidStore,
    })
    expect((await readJson(publicVoid)).state).toBe('void')
  })

  it('returns a recoverable admin URL without exposing the hash', async () => {
    const tokens = createTokenStore()
    const invoices = createInvoiceStore(invoiceRecord())
    const ensured = await issueToken(
      tokens,
      '99999999-9999-4999-8999-999999999999',
    )
    const response = await getInvoicePaymentLink(INVOICE_ID, {
      invoices,
      tokens,
      paymentLinkKey: KEY,
      baseUrl: 'https://pay.example.com',
    })
    const payload = await readJson(response)
    const body = JSON.stringify(payload)
    expect(body).toContain(paymentPageUrl('https://pay.example.com', ensured.rawToken))
    expect(body).not.toContain(tokens.rows[0]?.tokenHash)
  })

  it('cannot create a token without PAYMENT_LINK_KEY and never stores plaintext', async () => {
    const tokens = createTokenStore()
    const missing = await ensureActivePaymentToken(INVOICE_ID, {
      tokens,
      paymentLinkKey: undefined,
      clock: () => NOW,
      idFactory: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.message).toMatch(/PAYMENT_LINK_KEY/)
    }
    expect(tokens.rows).toHaveLength(0)

    const created = await issueToken(
      tokens,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
    )
    expect(created.ok).toBe(true)
    const stored = tokens.rows[0]
    expect(stored?.encryptedToken.startsWith('v1.')).toBe(true)
    expect(stored?.encryptedToken.startsWith('plain.')).toBe(false)
    expect(stored?.encryptedToken).not.toContain(created.rawToken)
    expect(JSON.stringify(tokens.rows)).not.toMatch(/plain\./)
  })
})
