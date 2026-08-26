import { describe, expect, it } from 'vitest'
import { lineAmountCents } from '../../src/utils/money.ts'
import type { InvoiceRecord, InvoiceStore } from '../invoices/types.ts'
import { getPublicInvoiceByToken } from './public.ts'
import { createPublicPaymentIntent } from './intent.ts'
import type { StripeIntentStore } from './intentStore.ts'
import { generatePaymentToken, hashPaymentToken } from './tokenCrypto.ts'
import { signStripeWebhookPayload } from './stripeSignature.ts'
import { handleStripeWebhook } from './webhook.ts'
import type {
  InvoicePaymentRecord,
  PaymentLedger,
} from './ledger.ts'
import type { PaymentTokenRecord, PaymentTokenStore } from './types.ts'
import { DEFAULT_PAYMENTS } from '../settings/payments.ts'
import type { StripeGateway } from './stripeClient.ts'

const INVOICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TOKEN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = '2026-08-25T15:00:00.000Z'
const SECRET = 'whsec_test_secret'
const TIMESTAMP = 1_777_000_000

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
    notes: 'Internal',
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
    stripePaymentMethod: null,
    stripeWalletType: null,
    stripePaymentStatus: null,
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

function invoiceStore(seed: InvoiceRecord): InvoiceStore {
  const invoices = new Map([[seed.id, structuredClone(seed)]])
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
    async findIdByNumber() {
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
      existing.stripePaymentIntentId = fields.stripePaymentIntentId ?? null
      existing.paidAmountCents = fields.paidAmountCents ?? null
      existing.stripePaymentMethod = fields.stripePaymentMethod ?? null
      existing.stripeWalletType = fields.stripeWalletType ?? null
      existing.stripePaymentStatus = fields.stripePaymentStatus ?? 'succeeded'
      return 'ok'
    },
    async updateStripeProgress(id, fields) {
      const existing = invoices.get(id)
      if (!existing) {
        return
      }
      existing.stripePaymentIntentId =
        existing.stripePaymentIntentId ?? fields.stripePaymentIntentId ?? null
      existing.stripePaymentMethod =
        existing.stripePaymentMethod ?? fields.stripePaymentMethod ?? null
      existing.stripeWalletType =
        existing.stripeWalletType ?? fields.stripeWalletType ?? null
      existing.stripePaymentStatus = fields.stripePaymentStatus ?? null
      existing.updatedAt = fields.updatedAt
    },
    async attachStripeReceipt(id, fields) {
      const existing = invoices.get(id)
      if (!existing) {
        return
      }
      existing.stripePaymentIntentId =
        existing.stripePaymentIntentId ?? fields.stripePaymentIntentId
      existing.paidAmountCents = existing.paidAmountCents ?? fields.paidAmountCents
      existing.stripePaymentMethod =
        existing.stripePaymentMethod ?? fields.stripePaymentMethod ?? null
      existing.stripeWalletType =
        existing.stripeWalletType ?? fields.stripeWalletType ?? null
      existing.stripePaymentStatus =
        fields.stripePaymentStatus ?? existing.stripePaymentStatus
      existing.updatedAt = fields.updatedAt
    },
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

function tokenStore(row: PaymentTokenRecord): PaymentTokenStore {
  const rows = [row]
  return {
    async getActiveByInvoiceId(invoiceId) {
      return rows.find((item) => item.invoiceId === invoiceId && item.status === 'active') ?? null
    },
    async getByHash(tokenHash) {
      return rows.find((item) => item.tokenHash === tokenHash) ?? null
    },
    async insert() {},
    async revokeActive(invoiceId, reason, revokedAt) {
      let count = 0
      for (const item of rows) {
        if (item.invoiceId === invoiceId && item.status === 'active') {
          item.status = 'revoked'
          item.revokedAt = revokedAt
          item.revokedReason = reason
          count += 1
        }
      }
      return count
    },
  }
}

function ledger(): PaymentLedger & {
  events: string[]
  payments: InvoicePaymentRecord[]
} {
  const events: string[] = []
  const payments: InvoicePaymentRecord[] = []
  return {
    events,
    payments,
    async hasEvent(eventId) {
      return events.includes(eventId)
    },
    async insertEvent(eventId) {
      if (events.includes(eventId)) {
        return 'duplicate'
      }
      events.push(eventId)
      return 'ok'
    },
    async insertPayment(record) {
      if (
        payments.some(
          (item) =>
            item.provider === record.provider &&
            item.providerPaymentId === record.providerPaymentId,
        )
      ) {
        return 'duplicate'
      }
      payments.push(structuredClone(record))
      return 'ok'
    },
    async updatePaymentStatus(provider, providerPaymentId, fields) {
      const existing = payments.find(
        (item) =>
          item.provider === provider &&
          item.providerPaymentId === providerPaymentId,
      )
      if (!existing) {
        return
      }
      existing.status = fields.status
      existing.stripeEventId = fields.stripeEventId ?? existing.stripeEventId
      existing.reviewReason = fields.reviewReason ?? existing.reviewReason
      existing.paidAt = fields.paidAt ?? existing.paidAt
    },
    async markPaymentSucceeded(provider, providerPaymentId, fields) {
      const existing = payments.find(
        (item) =>
          item.provider === provider &&
          item.providerPaymentId === providerPaymentId,
      )
      if (!existing) {
        return
      }
      existing.status = 'succeeded'
      existing.amountCents = fields.amountCents
      existing.currency = fields.currency
      existing.paidAt = fields.paidAt
      existing.stripeEventId = fields.stripeEventId
      existing.reviewReason = null
    },
    async listByInvoiceId(invoiceId) {
      return payments.filter((item) => item.invoiceId === invoiceId)
    },
    async getByProviderPaymentId(provider, providerPaymentId) {
      return (
        payments.find(
          (item) =>
            item.provider === provider &&
            item.providerPaymentId === providerPaymentId,
        ) ?? null
      )
    },
  }
}

function intentEvent(
  type: string,
  overrides: Record<string, unknown> = {},
  eventId = 'evt_1',
) {
  return {
    id: eventId,
    type,
    data: {
      object: {
        id: 'pi_123',
        amount: 5180,
        amount_received: 5180,
        currency: 'usd',
        status: type === 'payment_intent.succeeded' ? 'succeeded' : 'failed',
        metadata: {
          invoice_id: INVOICE_ID,
          invoice_number: 'BD2026-0051',
          payment_token_id: TOKEN_ID,
        },
        ...overrides,
      },
    },
  }
}

async function signedRequest(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body)
  const header = await signStripeWebhookPayload(secret, TIMESTAMP, raw)
  return new Request('https://example.test/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Stripe-Signature': header,
    },
    body: raw,
  })
}

describe('Stripe webhook finalization', () => {
  it('marks a payable invoice paid, stores the payment, and revokes the token', async () => {
    const rawToken = generatePaymentToken()
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: await hashPaymentToken(rawToken),
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const invoices = invoiceStore(invoiceRecord())
    const books = ledger()
    const response = await handleStripeWebhook(await signedRequest(intentEvent('payment_intent.succeeded')), {
      invoices,
      tokens,
      ledger: books,
      webhookSecret: SECRET,
      clock: () => NOW,
      nowSeconds: () => TIMESTAMP,
      idFactory: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    })
    expect(response.status).toBe(200)
    const invoice = await invoices.get(INVOICE_ID)
    expect(invoice?.status).toBe('paid')
    expect(invoice?.paidMethod).toBe('card')
    expect(invoice?.paidAt).toBe(NOW)
    expect(invoice?.stripePaymentIntentId).toBe('pi_123')
    expect(invoice?.paidAmountCents).toBe(5180)
    expect(books.payments).toHaveLength(1)
    expect(books.payments[0]?.status).toBe('succeeded')
    expect(await tokens.getActiveByInvoiceId(INVOICE_ID)).toBeNull()
    const publicPaid = await getPublicInvoiceByToken(rawToken, { tokens, invoices })
    expect((await publicPaid.json() as { state: string }).state).toBe('paid')

    const secondIntent = await createPublicPaymentIntent(
      rawToken,
      new Request('https://pay.example.com/intent', { method: 'POST', body: '{}' }),
      {
        tokens,
        invoices,
        intents: {
          async getByTokenId() {
            return null
          },
          async upsert() {},
        } satisfies StripeIntentStore,
        stripe: {
          async createPaymentIntent() {
            throw new Error('should not create')
          },
          async retrieveConfirmationToken() {
            throw new Error('should not create')
          },
          async confirmWithToken() {
            throw new Error('should not create')
          },
        },
        payments: {
          ...DEFAULT_PAYMENTS,
          stripeEnabled: true,
          cardPaymentsEnabled: true,
          achPaymentsEnabled: false,
          publishableKey: 'pk_test_51ABC',
        },
        stripeSecret: 'sk_test_secret',
      },
    )
    expect(secondIntent.status).toBe(409)
  })

  it('rejects unsigned webhook JSON', async () => {
    const response = await handleStripeWebhook(
      new Request('https://example.test/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(intentEvent('payment_intent.succeeded')),
      }),
      {
        invoices: invoiceStore(invoiceRecord()),
        tokens: tokenStore({
          id: TOKEN_ID,
          invoiceId: INVOICE_ID,
          tokenHash: 'abc',
          encryptedToken: 'v1.x',
          createdAt: NOW,
          revokedAt: null,
          revokedReason: null,
          status: 'active',
        }),
        ledger: ledger(),
        webhookSecret: SECRET,
        nowSeconds: () => TIMESTAMP,
      },
    )
    expect(response.status).toBe(400)
    expect((await response.json() as { error: string }).error).toMatch(/signature/i)
  })

  it('rejects an invalid signature', async () => {
    const request = new Request('https://example.test/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': 't=1,v1=deadbeef' },
      body: JSON.stringify(intentEvent('payment_intent.succeeded')),
    })
    const response = await handleStripeWebhook(request, {
      invoices: invoiceStore(invoiceRecord()),
      tokens: tokenStore({
        id: TOKEN_ID,
        invoiceId: INVOICE_ID,
        tokenHash: 'abc',
        encryptedToken: 'v1.x',
        createdAt: NOW,
        revokedAt: null,
        revokedReason: null,
        status: 'active',
      }),
      ledger: ledger(),
      webhookSecret: SECRET,
      nowSeconds: () => TIMESTAMP,
    })
    expect(response.status).toBe(400)
  })

  it('is idempotent for duplicate events and provider payment ids', async () => {
    const invoices = invoiceStore(invoiceRecord())
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: 'abc',
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const books = ledger()
    const deps = {
      invoices,
      tokens,
      ledger: books,
      webhookSecret: SECRET,
      clock: () => NOW,
      nowSeconds: () => TIMESTAMP,
      idFactory: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    }
    const first = await handleStripeWebhook(
      await signedRequest(intentEvent('payment_intent.succeeded')),
      deps,
    )
    const second = await handleStripeWebhook(
      await signedRequest(intentEvent('payment_intent.succeeded')),
      deps,
    )
    expect(first.status).toBe(200)
    expect((await second.json() as { duplicate?: boolean }).duplicate).toBe(true)
    expect(books.payments).toHaveLength(1)
    expect((await invoices.get(INVOICE_ID))?.status).toBe('paid')
  })

  it('is idempotent for a duplicate provider payment id with a new event id', async () => {
    const invoices = invoiceStore(invoiceRecord())
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: 'abc',
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const books = ledger()
    const deps = {
      invoices,
      tokens,
      ledger: books,
      webhookSecret: SECRET,
      clock: () => NOW,
      nowSeconds: () => TIMESTAMP,
      idFactory: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
    }
    await handleStripeWebhook(
      await signedRequest(intentEvent('payment_intent.succeeded', {}, 'evt_a')),
      deps,
    )
    const replay = await handleStripeWebhook(
      await signedRequest(intentEvent('payment_intent.succeeded', {}, 'evt_b')),
      deps,
    )
    expect(replay.status).toBe(200)
    expect(books.payments).toHaveLength(1)
    expect(books.payments[0]?.status).toBe('succeeded')
    expect((await invoices.get(INVOICE_ID))?.status).toBe('paid')
    expect((await invoices.get(INVOICE_ID))?.paidMethod).toBe('card')
  })

  it('does not mark paid on amount or currency mismatch', async () => {
    const invoices = invoiceStore(invoiceRecord())
    const books = ledger()
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: 'abc',
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const amount = await handleStripeWebhook(
      await signedRequest(
        intentEvent('payment_intent.succeeded', { amount: 100, amount_received: 100 }),
      ),
      {
        invoices,
        tokens,
        ledger: books,
        webhookSecret: SECRET,
        clock: () => NOW,
        nowSeconds: () => TIMESTAMP,
        idFactory: () => '11111111-1111-4111-8111-111111111111',
      },
    )
    expect((await amount.json() as { review?: boolean }).review).toBe(true)
    expect((await invoices.get(INVOICE_ID))?.status).toBe('sent')
    expect(books.payments[0]?.status).toBe('mismatch')
    expect(await tokens.getActiveByInvoiceId(INVOICE_ID)).toBeNull()

    const currency = await handleStripeWebhook(
      await signedRequest(
        intentEvent('payment_intent.succeeded', { currency: 'eur' }, 'evt_2'),
      ),
      {
        invoices: invoiceStore(invoiceRecord()),
        tokens: tokenStore({
          id: TOKEN_ID,
          invoiceId: INVOICE_ID,
          tokenHash: 'abc',
          encryptedToken: 'v1.x',
          createdAt: NOW,
          revokedAt: null,
          revokedReason: null,
          status: 'active',
        }),
        ledger: ledger(),
        webhookSecret: SECRET,
        clock: () => NOW,
        nowSeconds: () => TIMESTAMP,
        idFactory: () => '22222222-2222-4222-8222-222222222222',
      },
    )
    expect((await currency.json() as { review?: boolean }).review).toBe(true)
  })

  it('keeps a manual paid invoice paid and still records the Stripe payment', async () => {
    const invoices = invoiceStore(
      invoiceRecord({
        status: 'paid',
        paidAt: NOW,
        paidMethod: 'zelle',
      }),
    )
    const books = ledger()
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: 'abc',
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const response = await handleStripeWebhook(
      await signedRequest(intentEvent('payment_intent.succeeded')),
      {
        invoices,
        tokens,
        ledger: books,
        webhookSecret: SECRET,
        clock: () => NOW,
        nowSeconds: () => TIMESTAMP,
        idFactory: () => '33333333-3333-4333-8333-333333333333',
      },
    )
    expect(response.status).toBe(200)
    const invoice = await invoices.get(INVOICE_ID)
    expect(invoice?.status).toBe('paid')
    expect(invoice?.paidMethod).toBe('zelle')
    expect(invoice?.stripePaymentIntentId).toBe('pi_123')
    expect(books.payments[0]?.status).toBe('succeeded')
    expect(await tokens.getActiveByInvoiceId(INVOICE_ID)).toBeNull()
  })

  it('does not mark paid for failed events', async () => {
    const invoices = invoiceStore(invoiceRecord())
    const books = ledger()
    await handleStripeWebhook(
      await signedRequest(intentEvent('payment_intent.payment_failed', { status: 'requires_payment_method' })),
      {
        invoices,
        tokens: tokenStore({
          id: TOKEN_ID,
          invoiceId: INVOICE_ID,
          tokenHash: 'abc',
          encryptedToken: 'v1.x',
          createdAt: NOW,
          revokedAt: null,
          revokedReason: null,
          status: 'active',
        }),
        ledger: books,
        webhookSecret: SECRET,
        clock: () => NOW,
        nowSeconds: () => TIMESTAMP,
        idFactory: () => '44444444-4444-4444-8444-444444444444',
      },
    )
    expect((await invoices.get(INVOICE_ID))?.status).toBe('sent')
    expect(books.payments[0]?.status).toBe('failed')
  })

  it('rejects a second PaymentIntent after the invoice is paid', async () => {
    const raw = generatePaymentToken()
    const row: PaymentTokenRecord = {
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: await hashPaymentToken(raw),
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: NOW,
      revokedReason: 'paid',
      status: 'revoked',
    }
    const stripe: StripeGateway = {
      async createPaymentIntent() {
        throw new Error('should not create')
      },
      async retrieveConfirmationToken() {
        throw new Error('should not create')
      },
      async confirmWithToken() {
        throw new Error('should not create')
      },
    }
    const response = await createPublicPaymentIntent(
      raw,
      new Request('https://pay.example.com/intent', { method: 'POST', body: '{}' }),
      {
        tokens: tokenStore(row),
        invoices: invoiceStore(
          invoiceRecord({
            status: 'paid',
            paidMethod: 'card',
            paidAt: NOW,
            stripePaymentIntentId: 'pi_123',
            paidAmountCents: 5180,
          }),
        ),
        intents: {
          async getByTokenId() {
            return null
          },
          async upsert() {},
        } satisfies StripeIntentStore,
        stripe,
        payments: {
          ...DEFAULT_PAYMENTS,
          stripeEnabled: true,
          cardPaymentsEnabled: true,
          achPaymentsEnabled: false,
          publishableKey: 'pk_test_51ABC',
        },
        stripeSecret: 'sk_test_secret',
      },
    )
    expect(response.status).toBe(409)
  })

  it('records ACH processing without marking paid or revoking the token', async () => {
    const rawToken = generatePaymentToken()
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: await hashPaymentToken(rawToken),
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const invoices = invoiceStore(invoiceRecord())
    const books = ledger()
    const response = await handleStripeWebhook(
      await signedRequest(
        intentEvent('payment_intent.processing', {
          amount: 5000,
          amount_received: 0,
          status: 'processing',
          metadata: {
            invoice_id: INVOICE_ID,
            invoice_number: 'BD2026-0051',
            payment_token_id: TOKEN_ID,
            payment_category: 'ach',
          },
          payment_method_types: ['us_bank_account'],
        }),
      ),
      {
        invoices,
        tokens,
        ledger: books,
        webhookSecret: SECRET,
        clock: () => NOW,
        nowSeconds: () => TIMESTAMP,
        idFactory: () => '55555555-5555-4555-8555-555555555555',
      },
    )
    expect(response.status).toBe(200)
    const invoice = await invoices.get(INVOICE_ID)
    expect(invoice?.status).toBe('sent')
    expect(invoice?.stripePaymentStatus).toBe('processing')
    expect(books.payments[0]?.status).toBe('processing')
    expect(await tokens.getActiveByInvoiceId(INVOICE_ID)).not.toBeNull()
    const publicState = await getPublicInvoiceByToken(rawToken, { tokens, invoices })
    expect((await publicState.json() as { state: string }).state).toBe('processing')
  })

  it('marks a successful ACH payment paid and revokes the token', async () => {
    const rawToken = generatePaymentToken()
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: await hashPaymentToken(rawToken),
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const invoices = invoiceStore(
      invoiceRecord({
        stripePaymentStatus: 'processing',
        stripePaymentMethod: 'us_bank_account',
      }),
    )
    const books = ledger()
    const response = await handleStripeWebhook(
      await signedRequest(
        intentEvent('payment_intent.succeeded', {
          amount: 5000,
          amount_received: 5000,
          payment_method_types: ['us_bank_account'],
          metadata: {
            invoice_id: INVOICE_ID,
            invoice_number: 'BD2026-0051',
            payment_token_id: TOKEN_ID,
            payment_category: 'ach',
          },
        }),
      ),
      {
        invoices,
        tokens,
        ledger: books,
        webhookSecret: SECRET,
        clock: () => NOW,
        nowSeconds: () => TIMESTAMP,
        idFactory: () => '66666666-6666-4666-8666-666666666666',
      },
    )
    expect(response.status).toBe(200)
    const invoice = await invoices.get(INVOICE_ID)
    expect(invoice?.status).toBe('paid')
    expect(invoice?.paidMethod).toBe('ach')
    expect(invoice?.paidAmountCents).toBe(5000)
    expect(books.payments[0]?.status).toBe('succeeded')
    expect(books.payments[0]?.surchargeCents).toBe(0)
    expect(await tokens.getActiveByInvoiceId(INVOICE_ID)).toBeNull()
  })

  it('leaves the invoice payable after a failed ACH payment', async () => {
    const rawToken = generatePaymentToken()
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: await hashPaymentToken(rawToken),
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const invoices = invoiceStore(
      invoiceRecord({
        stripePaymentStatus: 'processing',
        stripePaymentMethod: 'us_bank_account',
      }),
    )
    const books = ledger()
    await handleStripeWebhook(
      await signedRequest(
        intentEvent('payment_intent.payment_failed', {
          amount: 5000,
          amount_received: 0,
          status: 'requires_payment_method',
          payment_method_types: ['us_bank_account'],
          metadata: {
            invoice_id: INVOICE_ID,
            invoice_number: 'BD2026-0051',
            payment_token_id: TOKEN_ID,
            payment_category: 'ach',
          },
        }),
      ),
      {
        invoices,
        tokens,
        ledger: books,
        webhookSecret: SECRET,
        clock: () => NOW,
        nowSeconds: () => TIMESTAMP,
        idFactory: () => '77777777-7777-4777-8777-777777777777',
      },
    )
    const invoice = await invoices.get(INVOICE_ID)
    expect(invoice?.status).toBe('sent')
    expect(invoice?.stripePaymentStatus).toBe('failed')
    expect(books.payments[0]?.status).toBe('failed')
    expect(await tokens.getActiveByInvoiceId(INVOICE_ID)).not.toBeNull()
    const publicState = await getPublicInvoiceByToken(rawToken, { tokens, invoices })
    expect((await publicState.json() as { state: string }).state).toBe('payable')
  })

  it('treats Apple Pay webhook success as card-like', async () => {
    const invoices = invoiceStore(invoiceRecord())
    const tokens = tokenStore({
      id: TOKEN_ID,
      invoiceId: INVOICE_ID,
      tokenHash: 'abc',
      encryptedToken: 'v1.x',
      createdAt: NOW,
      revokedAt: null,
      revokedReason: null,
      status: 'active',
    })
    const books = ledger()
    await handleStripeWebhook(
      await signedRequest(
        intentEvent('payment_intent.succeeded', {
          charges: {
            data: [
              {
                payment_method_details: {
                  type: 'card',
                  card: { wallet: { type: 'apple_pay' } },
                },
              },
            ],
          },
        }),
      ),
      {
        invoices,
        tokens,
        ledger: books,
        webhookSecret: SECRET,
        clock: () => NOW,
        nowSeconds: () => TIMESTAMP,
        idFactory: () => '88888888-8888-4888-8888-888888888888',
      },
    )
    expect((await invoices.get(INVOICE_ID))?.paidMethod).toBe('apple_pay')
    expect((await invoices.get(INVOICE_ID))?.paidAmountCents).toBe(5180)
  })
})
