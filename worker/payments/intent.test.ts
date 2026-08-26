import { describe, expect, it } from 'vitest'
import { lineAmountCents } from '../../src/utils/money.ts'
import type { InvoiceRecord, InvoiceStore } from '../invoices/types.ts'
import { DEFAULT_PAYMENTS } from '../settings/payments.ts'
import { calculateCardCharge } from './cardAmount.ts'
import {
  confirmPublicPayment,
  createPublicPaymentIntent,
} from './intent.ts'
import type { StripeIntentStore, StoredStripeIntent } from './intentStore.ts'
import { generatePaymentToken, hashPaymentToken } from './tokenCrypto.ts'
import type { PaymentTokenRecord, PaymentTokenStore } from './types.ts'
import type { ConfirmWithTokenInput, StripeGateway } from './stripeClient.ts'

const INVOICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TOKEN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = '2026-08-25T15:00:00.000Z'

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
    notes: 'Internal notes',
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
      invoices.set(record.id, record)
      return record
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
    async updateStripeProgress(id, fields) {
      const existing = invoices.get(id)
      if (!existing) {
        return
      }
      if (fields.stripePaymentIntentId) {
        existing.stripePaymentIntentId = fields.stripePaymentIntentId
      }
      if (fields.stripePaymentMethod !== undefined) {
        existing.stripePaymentMethod = fields.stripePaymentMethod ?? null
      }
      if (fields.stripeWalletType !== undefined) {
        existing.stripeWalletType = fields.stripeWalletType ?? null
      }
      existing.stripePaymentStatus = fields.stripePaymentStatus ?? null
      existing.updatedAt = fields.updatedAt
    },
    async claimStripeAttempt(id, fields) {
      const existing = invoices.get(id)
      if (!existing || existing.status !== 'sent') {
        return false
      }
      const status = existing.stripePaymentStatus
      if (
        status &&
        status !== 'failed' &&
        status !== 'canceled' &&
        status !== 'requires_payment_method'
      ) {
        return false
      }
      existing.stripePaymentMethod = fields.stripePaymentMethod ?? existing.stripePaymentMethod
      existing.stripeWalletType = fields.stripeWalletType ?? existing.stripeWalletType
      existing.stripePaymentStatus = fields.stripePaymentStatus
      existing.updatedAt = fields.updatedAt
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
  return {
    async getActiveByInvoiceId() {
      return row.status === 'active' ? row : null
    },
    async getByHash(tokenHash) {
      return row.tokenHash === tokenHash ? row : null
    },
    async insert() {},
    async revokeActive() {
      return 0
    },
  }
}

function intentStore(): StripeIntentStore & { rows: StoredStripeIntent[] } {
  const rows: StoredStripeIntent[] = []
  return {
    rows,
    async getByTokenId(tokenId) {
      return rows.find((row) => row.tokenId === tokenId) ?? null
    },
    async upsert(record) {
      const index = rows.findIndex((row) => row.tokenId === record.tokenId)
      if (index >= 0) {
        rows[index] = record
      } else {
        rows.push(record)
      }
    },
  }
}

async function setup(overrides: Partial<InvoiceRecord> = {}, tokenStatus: PaymentTokenRecord['status'] = 'active') {
  const raw = generatePaymentToken()
  const row: PaymentTokenRecord = {
    id: TOKEN_ID,
    invoiceId: INVOICE_ID,
    tokenHash: await hashPaymentToken(raw),
    encryptedToken: 'v1.not-used',
    createdAt: NOW,
    revokedAt: tokenStatus === 'revoked' ? NOW : null,
    revokedReason: tokenStatus === 'revoked' ? 'manual' : null,
    status: tokenStatus,
  }
  return { raw, row, invoice: invoiceRecord(overrides) }
}

const paymentsOn = {
  ...DEFAULT_PAYMENTS,
  stripeEnabled: true,
  cardPaymentsEnabled: true,
  achPaymentsEnabled: true,
  publishableKey: 'pk_test_51ABC',
}

function jsonRequest(body: unknown = {}) {
  return new Request('https://pay.example.com/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('card charge from invoice snapshot', () => {
  it('keeps the invoice at the base total and adds snapshotted fees', () => {
    const combined = calculateCardCharge(invoiceRecord())
    expect(combined.baseCents).toBe(5000)
    expect(combined.feeCents).toBe(180)
    expect(combined.cardCents).toBe(5180)

    const percent = calculateCardCharge(
      invoiceRecord({ payment: { ...invoiceRecord().payment, cardFeeFixedCents: 0 } }),
    )
    expect(percent.feeCents).toBe(150)
    expect(percent.cardCents).toBe(5150)

    const fixed = calculateCardCharge(
      invoiceRecord({ payment: { ...invoiceRecord().payment, cardFeePercentScaled: 0 } }),
    )
    expect(fixed.feeCents).toBe(30)
    expect(fixed.cardCents).toBe(5030)

    const mixed = calculateCardCharge(
      invoiceRecord({
        payment: {
          ...invoiceRecord().payment,
          cardFeePercentScaled: 290,
          cardFeeFixedCents: 30,
        },
      }),
    )
    expect(mixed.feeCents).toBe(175)
    expect(mixed.cardCents).toBe(5175)

    const zero = calculateCardCharge(
      invoiceRecord({
        payment: {
          ...invoiceRecord().payment,
          cardFeePercentScaled: 0,
          cardFeeFixedCents: 0,
        },
      }),
    )
    expect(zero.feeCents).toBe(0)
    expect(zero.cardCents).toBe(5000)
  })

  it('does not change an existing invoice fee when Settings would differ', () => {
    const createdAt3Percent = invoiceRecord({
      payment: {
        ...invoiceRecord().payment,
        cardFeePercentScaled: 300,
        cardFeeFixedCents: 0,
      },
    })
    const laterSettingsPercentScaled = 250
    expect(createdAt3Percent.payment.cardFeePercentScaled).toBe(300)
    expect(createdAt3Percent.payment.cardFeePercentScaled).not.toBe(
      laterSettingsPercentScaled,
    )
    expect(calculateCardCharge(createdAt3Percent).cardCents).toBe(5150)
  })
})

function stripeMock(
  preview: { paymentMethodType: string; walletType: string | null } = {
    paymentMethodType: 'card',
    walletType: null,
  },
): StripeGateway & { confirms: ConfirmWithTokenInput[] } {
  const confirms: ConfirmWithTokenInput[] = []
  return {
    confirms,
    async createPaymentIntent() {
      throw new Error('deferred intent flow must not create a PaymentIntent first')
    },
    async retrieveConfirmationToken(id) {
      return { id, ...preview }
    },
    async confirmWithToken(input) {
      confirms.push(input)
      return {
        id: `pi_${confirms.length}`,
        clientSecret: `secret_${confirms.length}`,
        amount: input.amount,
        currency: input.currency,
        status: preview.paymentMethodType === 'us_bank_account' ? 'processing' : 'succeeded',
      }
    },
  }
}

describe('public payment session', () => {
  it('uses the ACH base amount when cards are disabled', async () => {
    const { raw, row, invoice } = await setup()
    const response = await createPublicPaymentIntent(raw, jsonRequest(), {
      tokens: tokenStore(row),
      invoices: invoiceStore(invoice),
      intents: intentStore(),
      stripe: stripeMock(),
      payments: { ...paymentsOn, cardPaymentsEnabled: false },
      stripeSecret: 'sk_test_secret',
    })
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.chargeAmountCents).toBe(5000)
    expect(payload.paymentMethodTypes).toEqual(['us_bank_account'])
    expect(payload.clientSecret).toBeUndefined()
  })

  it('returns snapshot amounts without creating a PaymentIntent', async () => {
    const { raw, row, invoice } = await setup()
    const stripe = stripeMock()
    const response = await createPublicPaymentIntent(
      raw,
      jsonRequest({ amount: 1, fee: 0 }),
      {
        tokens: tokenStore(row),
        invoices: invoiceStore(invoice),
        intents: intentStore(),
        stripe,
        payments: paymentsOn,
        stripeSecret: 'sk_test_secret',
      },
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.mode).toBe('payment')
    expect(payload.invoiceAmountCents).toBe(5000)
    expect(payload.cardFeeCents).toBe(180)
    expect(payload.chargeAmountCents).toBe(5180)
    expect(payload.paymentMethodTypes).toEqual(['card', 'us_bank_account'])
    expect(payload.clientSecret).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('sk_test_secret')
    expect(stripe.confirms).toHaveLength(0)
  })
})

describe('public confirm', () => {
  it('charges the server-side card amount and ignores the client amount', async () => {
    const { raw, row, invoice } = await setup()
    const stripe = stripeMock({ paymentMethodType: 'card', walletType: null })
    const response = await confirmPublicPayment(
      raw,
      jsonRequest({
        confirmationTokenId: 'ctoken_card',
        amount: 1,
        total: 9999,
        returnUrl: 'https://pay.example.com/i/tok',
      }),
      {
        tokens: tokenStore(row),
        invoices: invoiceStore(invoice),
        intents: intentStore(),
        stripe,
        payments: paymentsOn,
        stripeSecret: 'sk_test_secret',
        clock: () => NOW,
        idFactory: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.chargeAmountCents).toBe(5180)
    expect(payload.invoiceAmountCents).toBe(5000)
    expect(payload.surchargeCents).toBe(180)
    expect(payload.category).toBe('card')
    expect(stripe.confirms[0]?.amount).toBe(5180)
    expect(JSON.stringify(payload)).not.toContain('sk_test_secret')
  })

  it('applies no surcharge for ACH and does not mark the invoice paid', async () => {
    const { raw, row, invoice } = await setup()
    const invoices = invoiceStore(invoice)
    const stripe = stripeMock({
      paymentMethodType: 'us_bank_account',
      walletType: null,
    })
    const response = await confirmPublicPayment(
      raw,
      jsonRequest({ confirmationTokenId: 'ctoken_ach' }),
      {
        tokens: tokenStore(row),
        invoices,
        intents: intentStore(),
        stripe,
        payments: paymentsOn,
        stripeSecret: 'sk_test_secret',
        clock: () => NOW,
        idFactory: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.chargeAmountCents).toBe(5000)
    expect(payload.surchargeCents).toBe(0)
    expect(payload.status).toBe('processing')
    expect(stripe.confirms[0]?.amount).toBe(5000)
    expect((await invoices.get(INVOICE_ID))?.status).toBe('sent')
    expect((await invoices.get(INVOICE_ID))?.stripePaymentStatus).toBe(
      'processing',
    )
  })

  it('treats Apple Pay as card-like for surcharge', async () => {
    const { raw, row, invoice } = await setup()
    const stripe = stripeMock({
      paymentMethodType: 'card',
      walletType: 'apple_pay',
    })
    const response = await confirmPublicPayment(
      raw,
      jsonRequest({ confirmationTokenId: 'ctoken_apple' }),
      {
        tokens: tokenStore(row),
        invoices: invoiceStore(invoice),
        intents: intentStore(),
        stripe,
        payments: paymentsOn,
        stripeSecret: 'sk_test_secret',
        clock: () => NOW,
        idFactory: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    )
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.chargeAmountCents).toBe(5180)
    expect(payload.paidMethod).toBe('apple_pay')
  })

  it('reuses a confirmation token PaymentIntent instead of creating another', async () => {
    const { raw, row, invoice } = await setup()
    const stripe = stripeMock()
    const intents = intentStore()
    const deps = {
      tokens: tokenStore(row),
      invoices: invoiceStore(invoice),
      intents,
      stripe,
      payments: paymentsOn,
      stripeSecret: 'sk_test_secret',
      clock: () => NOW,
      idFactory: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    }
    const first = await confirmPublicPayment(
      raw,
      jsonRequest({ confirmationTokenId: 'ctoken_card' }),
      deps,
    )
    const second = await confirmPublicPayment(
      raw,
      jsonRequest({ confirmationTokenId: 'ctoken_card' }),
      deps,
    )
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(stripe.confirms).toHaveLength(1)
  })

  it('rejects ACH when bank payments are disabled', async () => {
    const { raw, row, invoice } = await setup()
    const stripe = stripeMock({
      paymentMethodType: 'us_bank_account',
      walletType: null,
    })
    const response = await confirmPublicPayment(
      raw,
      jsonRequest({ confirmationTokenId: 'ctoken_ach' }),
      {
        tokens: tokenStore(row),
        invoices: invoiceStore(invoice),
        intents: intentStore(),
        stripe,
        payments: { ...paymentsOn, achPaymentsEnabled: false },
        stripeSecret: 'sk_test_secret',
      },
    )
    expect(response.status).toBe(409)
    expect(stripe.confirms).toHaveLength(0)
  })

  it('treats Google Pay as card-like for surcharge', async () => {
    const { raw, row, invoice } = await setup()
    const stripe = stripeMock({
      paymentMethodType: 'card',
      walletType: 'google_pay',
    })
    const response = await confirmPublicPayment(
      raw,
      jsonRequest({ confirmationTokenId: 'ctoken_google' }),
      {
        tokens: tokenStore(row),
        invoices: invoiceStore(invoice),
        intents: intentStore(),
        stripe,
        payments: paymentsOn,
        stripeSecret: 'sk_test_secret',
        clock: () => NOW,
        idFactory: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    )
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.chargeAmountCents).toBe(5180)
    expect(payload.paidMethod).toBe('google_pay')
  })

  it('rejects a second attempt while ACH is processing', async () => {
    const { raw, row, invoice } = await setup()
    const invoices = invoiceStore(invoice)
    const stripe = stripeMock({
      paymentMethodType: 'us_bank_account',
      walletType: null,
    })
    const deps = {
      tokens: tokenStore(row),
      invoices,
      intents: intentStore(),
      stripe,
      payments: paymentsOn,
      stripeSecret: 'sk_test_secret',
      clock: () => NOW,
      idFactory: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    }
    const first = await confirmPublicPayment(
      raw,
      jsonRequest({ confirmationTokenId: 'ctoken_ach' }),
      deps,
    )
    expect(first.status).toBe(200)
    const second = await confirmPublicPayment(
      raw,
      jsonRequest({ confirmationTokenId: 'ctoken_card' }),
      deps,
    )
    expect(second.status).toBe(409)
    expect((await invoices.get(INVOICE_ID))?.status).toBe('sent')
    expect(stripe.confirms).toHaveLength(1)
  })

  it('rejects paid, void, and revoked invoices', async () => {
    const stripe = stripeMock()
    const paid = await setup({ status: 'paid', paidAt: NOW })
    const paidResponse = await createPublicPaymentIntent(paid.raw, jsonRequest(), {
      tokens: tokenStore({ ...paid.row, revokedReason: 'paid', status: 'revoked', revokedAt: NOW }),
      invoices: invoiceStore(paid.invoice),
      intents: intentStore(),
      stripe,
      payments: paymentsOn,
      stripeSecret: 'sk_test_secret',
    })
    expect(paidResponse.status).toBe(409)

    const voided = await setup({ status: 'void', voidedAt: NOW })
    const voidResponse = await createPublicPaymentIntent(voided.raw, jsonRequest(), {
      tokens: tokenStore({ ...voided.row, revokedReason: 'void', status: 'revoked', revokedAt: NOW }),
      invoices: invoiceStore(voided.invoice),
      intents: intentStore(),
      stripe,
      payments: paymentsOn,
      stripeSecret: 'sk_test_secret',
    })
    expect(voidResponse.status).toBe(409)

    const revoked = await setup()
    const revokedResponse = await createPublicPaymentIntent(revoked.raw, jsonRequest(), {
      tokens: tokenStore({ ...revoked.row, status: 'revoked', revokedReason: 'manual', revokedAt: NOW }),
      invoices: invoiceStore(revoked.invoice),
      intents: intentStore(),
      stripe,
      payments: paymentsOn,
      stripeSecret: 'sk_test_secret',
    })
    expect(revokedResponse.status).toBe(404)
  })
})
