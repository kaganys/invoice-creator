import { describe, expect, it } from 'vitest'
import { DEFAULT_EMAIL_BODY } from '../../src/invoice/emailTemplates.ts'
import { defaultInvoiceFormat } from '../../src/invoice/format.ts'
import { lineAmountCents } from '../../src/utils/money.ts'
import { sendInvoice } from './send.ts'
import type { EmailLogRecord, InvoiceRecord, InvoiceStore } from './types.ts'
import type { PdfRenderer } from '../pdf/types.ts'
import type { SettingsKvStore } from '../settings/types.ts'
import type { MailTransport } from '../mail/types.ts'
import type { PaymentTokenRecord, PaymentTokenStore } from '../payments/types.ts'
import { serializeFormat } from '../settings/format.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = '2026-08-25T15:00:00.000Z'
const LATER = '2026-08-26T15:00:00.000Z'

function record(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: ID_A,
    number: 'BD2026-0051',
    status: 'draft',
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
        country: 'United States',
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
    notes: '',
    invoiceLogo: { path: '/branding/bitz-designs-icon.png' },
    createdAt: NOW,
    updatedAt: NOW,
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

function createStore(seed?: InvoiceRecord): InvoiceStore & {
  logs: EmailLogRecord[]
  invoices: Map<string, InvoiceRecord>
} {
  const invoices = new Map<string, InvoiceRecord>()
  if (seed) {
    invoices.set(seed.id, structuredClone(seed))
  }
  const logs: EmailLogRecord[] = []
  return {
    invoices,
    logs,
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
    async create(next) {
      invoices.set(next.id, structuredClone(next))
      return structuredClone(next)
    },
    async replace(next) {
      invoices.set(next.id, structuredClone(next))
      return structuredClone(next)
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
    async insertEmailLog(entry) {
      if (
        entry.idempotencyKey &&
        logs.some((item) => item.idempotencyKey === entry.idempotencyKey)
      ) {
        return 'duplicate'
      }
      logs.push(structuredClone(entry))
      return 'ok'
    },
    async updateEmailLog(id, fields) {
      const existing = logs.find((item) => item.id === id)
      if (!existing) {
        return
      }
      existing.completedAt = fields.completedAt
      existing.success = fields.success
      existing.smtpMessageId = fields.smtpMessageId
      existing.errorCategory = fields.errorCategory
      existing.errorMessage = fields.errorMessage
    },
    async getEmailLogByIdempotency(invoiceId, key) {
      return (
        logs.find(
          (item) => item.invoiceId === invoiceId && item.idempotencyKey === key,
        ) ?? null
      )
    },
    async listEmailLogs(invoiceId) {
      return logs.filter((item) => item.invoiceId === invoiceId)
    },
  }
}

function settingsStore(values: Record<string, string | null> = {}): SettingsKvStore {
  const kv = new Map<string, string | null>(Object.entries(values))
  return {
    async get(key) {
      return kv.get(key) ?? null
    },
    async set(key, value) {
      kv.set(key, value)
    },
  }
}

function pdfMock(captured: { html: string }): PdfRenderer {
  return {
    async renderHtml(html) {
      captured.html = html
      return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    },
  }
}

function smtpConfig() {
  return JSON.stringify({
    host: 'smtp.example.com',
    port: 587,
    username: 'user',
    security: 'starttls',
    fromName: 'Bitz Designs',
    fromEmail: 'billing@bitzdesigns.co',
    replyTo: '',
    subjectTemplate: 'Invoice {{invoice_number}} from {{business_name}}',
    bodyTemplate: 'Hello {{customer_name}} {{amount}} {{zelle_email}}',
  })
}

function jsonRequest(payload: unknown): Request {
  return new Request('https://example.test/api/invoices/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

describe('invoice send', () => {
  it('sends a draft, attaches the base-total PDF, and marks the invoice sent', async () => {
    const store = createStore(record())
    const captured = { html: '' }
    let sent: { to: string; filename?: string; html?: string; text?: string } = {
      to: '',
    }
    const mail: MailTransport = {
      async send(message) {
        sent = {
          to: message.to,
          filename: message.attachments?.[0]?.filename,
          html: message.html,
          text: message.text,
        }
        expect(message.attachments?.[0]?.filename).toBe('Invoice-BD2026-0051.pdf')
        return { messageId: 'msg-1' }
      },
    }
    const response = await sendInvoice(ID_A, jsonRequest({
      recipient: 'ada@example.com',
      subject: 'Invoice BD2026-0051 from Bitz Designs',
      body: 'Please find the invoice attached.',
      idempotencyKey: 'key-1',
    }), {
      store,
      settings: settingsStore({
        [SETTINGS_KEYS.smtp]: smtpConfig(),
        [SETTINGS_KEYS.format]: serializeFormat(defaultInvoiceFormat()),
      }),
      pdf: pdfMock(captured),
      origin: 'https://example.test',
      smtpPassword: 'not-returned',
      clock: () => NOW,
      idFactory: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      mailFactory: () => mail,
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      invoice: { status: string; sendCount: number; firstSentAt: string }
    }
    expect(payload.invoice.status).toBe('sent')
    expect(payload.invoice.sendCount).toBe(1)
    expect(payload.invoice.firstSentAt).toBe(NOW)
    expect(captured.html).toContain('$50.00')
    expect(captured.html).not.toContain('$51.80')
    expect(sent.filename).toBe('Invoice-BD2026-0051.pdf')
    expect(sent.html).toContain('width=device-width')
    expect(sent.html).toContain('Please find the invoice attached.')
    expect(sent.text).toContain('Please find the invoice attached.')
    expect(store.logs[0]?.success).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('not-returned')
  })

  it('resends without changing first_sent_at and increments send_count', async () => {
    const store = createStore(
      record({
        status: 'sent',
        firstSentAt: NOW,
        lastSentAt: NOW,
        sendCount: 1,
        format: defaultInvoiceFormat(),
      }),
    )
    const mail: MailTransport = {
      async send() {
        return {}
      },
    }
    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'other@example.com',
        subject: 'Resend',
        body: 'Again',
        idempotencyKey: 'key-2',
      }),
      {
        store,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        clock: () => LATER,
        idFactory: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        mailFactory: () => mail,
      },
    )
    expect(response.status).toBe(200)
    const latest = await store.get(ID_A)
    expect(latest?.status).toBe('sent')
    expect(latest?.sendCount).toBe(2)
    expect(latest?.firstSentAt).toBe(NOW)
    expect(latest?.lastSentAt).toBe(LATER)
  })

  it('keeps a failed first send as draft and records history', async () => {
    const store = createStore(record())
    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Hi',
        idempotencyKey: 'fail-1',
      }),
      {
        store,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        clock: () => NOW,
        idFactory: () => '11111111-1111-4111-8111-111111111111',
        mailFactory: () => ({
          async send() {
            throw new Error('SMTP rejected')
          },
        }),
      },
    )
    expect(response.status).toBe(502)
    const latest = await store.get(ID_A)
    expect(latest?.status).toBe('draft')
    expect(latest?.sendCount).toBe(0)
    expect(store.logs[0]?.success).toBe(false)
    expect(store.logs[0]?.errorMessage).toMatch(/SMTP rejected/)
  })

  it('keeps sent status when a resend fails', async () => {
    const store = createStore(
      record({
        status: 'sent',
        firstSentAt: NOW,
        lastSentAt: NOW,
        sendCount: 1,
        format: defaultInvoiceFormat(),
      }),
    )
    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Hi',
        idempotencyKey: 'fail-2',
      }),
      {
        store,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        clock: () => LATER,
        idFactory: () => '22222222-2222-4222-8222-222222222222',
        mailFactory: () => ({
          async send() {
            throw new Error('timeout')
          },
        }),
      },
    )
    expect(response.status).toBe(502)
    const latest = await store.get(ID_A)
    expect(latest?.status).toBe('sent')
    expect(latest?.sendCount).toBe(1)
  })

  it('rejects void invoices, missing SMTP secret, and header injection', async () => {
    const voided = createStore(record({ status: 'void' }))
    const voidResponse = await sendInvoice(
      ID_A,
      jsonRequest({ recipient: 'ada@example.com', subject: 'x', body: 'y' }),
      {
        store: voided,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        mailFactory: () => ({ async send() { return {} } }),
      },
    )
    expect(voidResponse.status).toBe(409)

    const noSecret = await sendInvoice(
      ID_A,
      jsonRequest({ recipient: 'ada@example.com', subject: 'x', body: 'y' }),
      {
        store: createStore(record()),
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
      },
    )
    expect(noSecret.status).toBe(400)

    const injected = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Hello\nBcc: evil@x.com',
        body: 'y',
      }),
      {
        store: createStore(record()),
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        mailFactory: () => ({ async send() { return {} } }),
      },
    )
    expect(injected.status).toBe(400)
  })

  it('does not revert a paid invoice to sent', async () => {
    const store = createStore(
      record({
        status: 'paid',
        paidAt: NOW,
        paidMethod: 'zelle',
        sendCount: 0,
      }),
    )
    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Receipt',
        body: 'Paid',
        idempotencyKey: 'paid-1',
      }),
      {
        store,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        clock: () => LATER,
        idFactory: () => '33333333-3333-4333-8333-333333333333',
        mailFactory: () => ({ async send() { return {} } }),
      },
    )
    expect(response.status).toBe(200)
    const latest = await store.get(ID_A)
    expect(latest?.status).toBe('paid')
    expect(latest?.sendCount).toBe(1)
  })

  it('replays an idempotent request instead of sending twice', async () => {
    const store = createStore(record())
    let sends = 0
    const deps = {
      store,
      settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
      pdf: pdfMock({ html: '' }),
      origin: 'https://example.test',
      smtpPassword: 'secret',
      clock: () => NOW,
      idFactory: () => '44444444-4444-4444-8444-444444444444',
      mailFactory: () => ({
        async send() {
          sends += 1
          return {}
        },
      }),
    }
    const first = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Hi',
        idempotencyKey: 'same-key',
      }),
      deps,
    )
    const second = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Hi',
        idempotencyKey: 'same-key',
      }),
      deps,
    )
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(sends).toBe(1)
    expect((await store.get(ID_A))?.sendCount).toBe(1)
  })

  it('allows a recipient override without changing the invoice snapshot', async () => {
    const store = createStore(record())
    await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'other@example.com',
        subject: 'Invoice {{invoice_number}} from {{business_name}}',
        body: 'Hello {{customer_name}}',
        idempotencyKey: 'override-1',
      }),
      {
        store,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        clock: () => NOW,
        idFactory: () => '55555555-5555-4555-8555-555555555555',
        mailFactory: () => ({
          async send(message) {
            expect(message.to).toBe('other@example.com')
            return {}
          },
        }),
      },
    )
    const latest = await store.get(ID_A)
    expect(latest?.customer.email).toBe('ada@example.com')
  })

  it('creates a payment token on first send and reuses it on resend', async () => {
    const store = createStore(record())
    const rows: PaymentTokenRecord[] = []
    const tokens: PaymentTokenStore = {
      async getActiveByInvoiceId(invoiceId) {
        return rows.find((row) => row.invoiceId === invoiceId && row.status === 'active') ?? null
      },
      async getByHash(tokenHash) {
        return rows.find((row) => row.tokenHash === tokenHash) ?? null
      },
      async insert(record) {
        rows.push(record)
      },
      async revokeActive(invoiceId, reason, revokedAt) {
        let count = 0
        for (const row of rows) {
          if (row.invoiceId === invoiceId && row.status === 'active') {
            row.status = 'revoked'
            row.revokedReason = reason
            row.revokedAt = revokedAt
            count += 1
          }
        }
        return count
      },
    }
    const urls: string[] = []
    const deps = {
      store,
      settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
      pdf: pdfMock({ html: '' }),
      origin: 'https://example.test',
      smtpPassword: 'secret',
      clock: () => NOW,
      idFactory: () => 'abababab-abab-4aba-8aba-abababababab',
      tokens,
      paymentLinkKey: 'test-payment-link-key',
      paymentBaseUrl: 'https://pay.example.com',
      mailFactory: () => ({
        async send(message) {
          const match = /https:\/\/pay\.example\.com\/i\/[A-Za-z0-9_-]+/.exec(
            `${message.text}\n${message.html ?? ''}`,
          )
          if (match) {
            urls.push(match[0])
          }
          return {}
        },
      }),
    }
    const first = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Pay at {{payment_url}}',
        idempotencyKey: 'pay-1',
      }),
      deps,
    )
    expect(first.status).toBe(200)
    expect(rows.filter((row) => row.status === 'active')).toHaveLength(1)
    const second = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Pay at {{payment_url}}',
        idempotencyKey: 'pay-2',
      }),
      { ...deps, clock: () => LATER, idFactory: () => 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd' },
    )
    expect(second.status).toBe(200)
    expect(rows.filter((row) => row.status === 'active')).toHaveLength(1)
    expect(urls[0]).toBe(urls[1])
    expect(urls[0]).toMatch(/^https:\/\/pay\.example\.com\/i\/[A-Za-z0-9_-]{43}$/)
    expect(urls[0]).not.toContain('localhost')
    expect(JSON.stringify(rows)).not.toMatch(/plain\./)
  })

  it('uses the default email template payment URL in both email and PDF output', async () => {
    const store = createStore(record())
    const rows: PaymentTokenRecord[] = []
    const tokens: PaymentTokenStore = {
      async getActiveByInvoiceId(invoiceId) {
        return rows.find((row) => row.invoiceId === invoiceId && row.status === 'active') ?? null
      },
      async getByHash(tokenHash) {
        return rows.find((row) => row.tokenHash === tokenHash) ?? null
      },
      async insert(record) {
        rows.push(record)
      },
      async revokeActive(invoiceId, reason, revokedAt) {
        let count = 0
        for (const row of rows) {
          if (row.invoiceId === invoiceId && row.status === 'active') {
            row.status = 'revoked'
            row.revokedReason = reason
            row.revokedAt = revokedAt
            count += 1
          }
        }
        return count
      },
    }
    let emailHtml = ''
    let emailText = ''
    const captured = { html: '' }

    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice {{invoice_number}} from {{business_name}}',
        body: DEFAULT_EMAIL_BODY,
        idempotencyKey: 'default-payment-url',
      }),
      {
        store,
        settings: settingsStore({
          [SETTINGS_KEYS.smtp]: JSON.stringify({
            host: 'smtp.example.com',
            port: 587,
            username: 'user',
            security: 'starttls',
            fromName: 'Bitz Designs',
            fromEmail: 'billing@bitzdesigns.co',
            replyTo: '',
            subjectTemplate: 'Invoice {{invoice_number}} from {{business_name}}',
            bodyTemplate: DEFAULT_EMAIL_BODY,
          }),
        }),
        pdf: pdfMock(captured),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        clock: () => NOW,
        idFactory: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        tokens,
        paymentLinkKey: 'test-payment-link-key',
        paymentBaseUrl: 'https://pay.example.com',
        mailFactory: () => ({
          async send(message) {
            emailHtml = message.html ?? ''
            emailText = message.text
            return {}
          },
        }),
      },
    )

    expect(response.status).toBe(200)
    const match = /https:\/\/pay\.example\.com\/i\/[A-Za-z0-9_-]{43}/.exec(
      emailText,
    )
    expect(match?.[0]).toBeTruthy()
    expect(emailHtml).toContain(`href="${match?.[0]}"`)
    expect(emailHtml).toContain('Pay Online')
    expect(emailText).toContain(match?.[0] ?? '')
    expect(captured.html).toContain(`href="${match?.[0]}"`)
    expect(captured.html).toContain('Pay Online')
    expect(JSON.stringify({ emailHtml, emailText, pdfHtml: captured.html })).not.toContain(
      rows[0]?.tokenHash ?? '',
    )
    expect(JSON.stringify({ emailHtml, emailText, pdfHtml: captured.html })).not.toContain(
      rows[0]?.encryptedToken ?? '',
    )
  })

  it('sends older templates that lack payment_url without inventing a payment CTA', async () => {
    const store = createStore(
      record({
        status: 'sent',
        firstSentAt: NOW,
        lastSentAt: NOW,
        sendCount: 1,
        format: defaultInvoiceFormat(),
      }),
    )
    const rows: PaymentTokenRecord[] = []
    const tokens: PaymentTokenStore = {
      async getActiveByInvoiceId(invoiceId) {
        return rows.find((row) => row.invoiceId === invoiceId && row.status === 'active') ?? null
      },
      async getByHash(tokenHash) {
        return rows.find((row) => row.tokenHash === tokenHash) ?? null
      },
      async insert(record) {
        rows.push(record)
      },
      async revokeActive(invoiceId, reason, revokedAt) {
        let count = 0
        for (const row of rows) {
          if (row.invoiceId === invoiceId && row.status === 'active') {
            row.status = 'revoked'
            row.revokedReason = reason
            row.revokedAt = revokedAt
            count += 1
          }
        }
        return count
      },
    }
    let emailHtml = ''
    let emailText = ''

    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice {{invoice_number}}',
        body: '<p>Custom intro only.</p>',
        idempotencyKey: 'legacy-template-payment-cta',
      }),
      {
        store,
        settings: settingsStore({
          [SETTINGS_KEYS.smtp]: JSON.stringify({
            host: 'smtp.example.com',
            port: 587,
            username: 'user',
            security: 'starttls',
            fromName: 'Bitz Designs',
            fromEmail: 'billing@bitzdesigns.co',
            replyTo: '',
            subjectTemplate: 'Invoice {{invoice_number}}',
            bodyTemplate: '<p>Custom intro only.</p>',
          }),
        }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        clock: () => NOW,
        idFactory: () => '12121212-1212-4212-8212-121212121212',
        tokens,
        paymentLinkKey: 'test-payment-link-key',
        paymentBaseUrl: 'https://pay.example.com',
        mailFactory: () => ({
          async send(message) {
            emailHtml = message.html ?? ''
            emailText = message.text
            return {}
          },
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(emailHtml).toContain('Custom intro only.')
    expect(emailText).toContain('Custom intro only.')
    expect(emailHtml).not.toContain('Pay Online')
    expect(emailHtml).not.toMatch(/https:\/\/pay\.example\.com\/i\//)
  })

  it('does not email a localhost payment URL when PUBLIC_PAYMENT_BASE_URL is missing', async () => {
    const store = createStore(record())
    let sent = false
    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Pay at {{payment_url}}',
        idempotencyKey: 'pay-missing-base',
      }),
      {
        store,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'http://localhost:5173',
        smtpPassword: 'secret',
        clock: () => NOW,
        idFactory: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
        tokens: {
          async getActiveByInvoiceId() {
            return null
          },
          async getByHash() {
            return null
          },
          async insert() {},
          async revokeActive() {
            return 0
          },
        },
        paymentLinkKey: 'test-payment-link-key',
        paymentBaseUrl: undefined,
        mailFactory: () => ({
          async send() {
            sent = true
            return {}
          },
        }),
      },
    )
    expect(response.status).toBe(400)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toMatch(/PUBLIC_PAYMENT_BASE_URL/)
    expect(payload.error).not.toMatch(/localhost/)
    expect(sent).toBe(false)
  })

  it('rejects a malformed PUBLIC_PAYMENT_BASE_URL before SMTP', async () => {
    const store = createStore(record())
    let sent = false
    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Pay at {{payment_url}}',
        idempotencyKey: 'pay-bad-base',
      }),
      {
        store,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'https://example.test',
        smtpPassword: 'secret',
        clock: () => NOW,
        idFactory: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12',
        tokens: {
          async getActiveByInvoiceId() {
            return null
          },
          async getByHash() {
            return null
          },
          async insert() {},
          async revokeActive() {
            return 0
          },
        },
        paymentLinkKey: 'test-payment-link-key',
        paymentBaseUrl: 'pay.bitzdesigns.co',
        mailFactory: () => ({
          async send() {
            sent = true
            return {}
          },
        }),
      },
    )
    expect(response.status).toBe(400)
    expect(sent).toBe(false)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toMatch(/PUBLIC_PAYMENT_BASE_URL|absolute/i)
  })

  it('does not create a payment token when PAYMENT_LINK_KEY is missing', async () => {
    const store = createStore(record())
    const inserted: unknown[] = []
    let sent = false
    const response = await sendInvoice(
      ID_A,
      jsonRequest({
        recipient: 'ada@example.com',
        subject: 'Invoice',
        body: 'Hello',
        idempotencyKey: 'pay-missing-key',
      }),
      {
        store,
        settings: settingsStore({ [SETTINGS_KEYS.smtp]: smtpConfig() }),
        pdf: pdfMock({ html: '' }),
        origin: 'http://localhost:5173',
        smtpPassword: 'secret',
        clock: () => NOW,
        idFactory: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13',
        tokens: {
          async getActiveByInvoiceId() {
            return null
          },
          async getByHash() {
            return null
          },
          async insert(record) {
            inserted.push(record)
          },
          async revokeActive() {
            return 0
          },
        },
        paymentLinkKey: undefined,
        paymentBaseUrl: 'https://pay.bitzdesigns.co',
        mailFactory: () => ({
          async send() {
            sent = true
            return {}
          },
        }),
      },
    )
    expect(response.status).toBe(400)
    expect(sent).toBe(false)
    expect(inserted).toHaveLength(0)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toMatch(/PAYMENT_LINK_KEY/)
    expect(JSON.stringify(inserted)).not.toMatch(/plain\./)
  })
})
