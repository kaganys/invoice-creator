export type InvoicePaymentStatus =
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'mismatch'
  | 'review'
  | 'processing'

export type InvoicePaymentRecord = {
  id: string
  invoiceId: string
  provider: string
  providerPaymentId: string
  amountCents: number
  currency: string
  status: InvoicePaymentStatus
  paidAt: string | null
  createdAt: string
  stripeEventId: string | null
  reviewReason: string | null
  paymentCategory: string | null
  paymentMethodType: string | null
  walletType: string | null
  surchargeCents: number | null
}

export interface PaymentLedger {
  hasEvent(eventId: string): Promise<boolean>
  insertEvent(
    eventId: string,
    eventType: string,
    processedAt: string,
    result: string,
  ): Promise<'ok' | 'duplicate'>
  insertPayment(record: InvoicePaymentRecord): Promise<'ok' | 'duplicate'>
  markPaymentSucceeded(
    provider: string,
    providerPaymentId: string,
    fields: {
      amountCents: number
      currency: string
      paidAt: string
      stripeEventId: string
      paymentCategory?: string | null
      paymentMethodType?: string | null
      walletType?: string | null
      surchargeCents?: number | null
    },
  ): Promise<void>
  updatePaymentStatus(
    provider: string,
    providerPaymentId: string,
    fields: {
      status: InvoicePaymentStatus
      stripeEventId: string | null
      reviewReason?: string | null
      paidAt?: string | null
    },
  ): Promise<void>
  listByInvoiceId(invoiceId: string): Promise<InvoicePaymentRecord[]>
  getByProviderPaymentId(
    provider: string,
    providerPaymentId: string,
  ): Promise<InvoicePaymentRecord | null>
}

type EventRow = { event_id: string }
type PaymentRow = {
  id: string
  invoice_id: string
  provider: string
  provider_payment_id: string
  amount_cents: number
  currency: string
  status: InvoicePaymentStatus
  paid_at: string | null
  created_at: string
  stripe_event_id: string | null
  review_reason: string | null
  payment_category: string | null
  payment_method_type: string | null
  wallet_type: string | null
  surcharge_cents: number | null
}

export function createD1PaymentLedger(db: D1Database): PaymentLedger {
  return {
    async hasEvent(eventId) {
      const row = await db
        .prepare('SELECT event_id FROM stripe_webhook_events WHERE event_id = ?')
        .bind(eventId)
        .first<EventRow>()
      return Boolean(row)
    },

    async insertEvent(eventId, eventType, processedAt, result) {
      try {
        await db
          .prepare(
            `INSERT INTO stripe_webhook_events (event_id, event_type, processed_at, result)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(eventId, eventType, processedAt, result)
          .run()
        return 'ok'
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/unique/i.test(message)) {
          return 'duplicate'
        }
        throw error
      }
    },

    async insertPayment(record) {
      try {
        await db
          .prepare(
            `INSERT INTO invoice_payments (
              id, invoice_id, provider, provider_payment_id, amount_cents, currency,
              status, paid_at, created_at, stripe_event_id, review_reason,
              payment_category, payment_method_type, wallet_type, surcharge_cents
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            record.id,
            record.invoiceId,
            record.provider,
            record.providerPaymentId,
            record.amountCents,
            record.currency,
            record.status,
            record.paidAt,
            record.createdAt,
            record.stripeEventId,
            record.reviewReason,
            record.paymentCategory,
            record.paymentMethodType,
            record.walletType,
            record.surchargeCents,
          )
          .run()
        return 'ok'
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/unique/i.test(message)) {
          return 'duplicate'
        }
        throw error
      }
    },

    async markPaymentSucceeded(provider, providerPaymentId, fields) {
      await db
        .prepare(
          `UPDATE invoice_payments
           SET status = 'succeeded',
               amount_cents = ?,
               currency = ?,
               paid_at = ?,
               stripe_event_id = ?,
               review_reason = NULL,
               payment_category = COALESCE(?, payment_category),
               payment_method_type = COALESCE(?, payment_method_type),
               wallet_type = COALESCE(?, wallet_type),
               surcharge_cents = COALESCE(?, surcharge_cents)
           WHERE provider = ? AND provider_payment_id = ?`,
        )
        .bind(
          fields.amountCents,
          fields.currency,
          fields.paidAt,
          fields.stripeEventId,
          fields.paymentCategory ?? null,
          fields.paymentMethodType ?? null,
          fields.walletType ?? null,
          fields.surchargeCents ?? null,
          provider,
          providerPaymentId,
        )
        .run()
    },

    async updatePaymentStatus(provider, providerPaymentId, fields) {
      await db
        .prepare(
          `UPDATE invoice_payments
           SET status = ?,
               stripe_event_id = COALESCE(?, stripe_event_id),
               review_reason = COALESCE(?, review_reason),
               paid_at = COALESCE(?, paid_at)
           WHERE provider = ? AND provider_payment_id = ?`,
        )
        .bind(
          fields.status,
          fields.stripeEventId,
          fields.reviewReason ?? null,
          fields.paidAt ?? null,
          provider,
          providerPaymentId,
        )
        .run()
    },

    async listByInvoiceId(invoiceId) {
      const rows = await db
        .prepare(
          `SELECT * FROM invoice_payments
           WHERE invoice_id = ?
           ORDER BY created_at DESC`,
        )
        .bind(invoiceId)
        .all<PaymentRow>()
      return (rows.results ?? []).map(mapPayment)
    },

    async getByProviderPaymentId(provider, providerPaymentId) {
      const row = await db
        .prepare(
          `SELECT * FROM invoice_payments
           WHERE provider = ? AND provider_payment_id = ?
           LIMIT 1`,
        )
        .bind(provider, providerPaymentId)
        .first<PaymentRow>()
      return row ? mapPayment(row) : null
    },
  }
}

function mapPayment(row: PaymentRow): InvoicePaymentRecord {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    stripeEventId: row.stripe_event_id,
    reviewReason: row.review_reason,
    paymentCategory: row.payment_category ?? null,
    paymentMethodType: row.payment_method_type ?? null,
    walletType: row.wallet_type ?? null,
    surchargeCents: row.surcharge_cents ?? null,
  }
}

export function publicPayment(record: InvoicePaymentRecord) {
  return {
    id: record.id,
    provider: record.provider,
    providerPaymentId: record.providerPaymentId,
    amountCents: record.amountCents,
    currency: record.currency,
    status: record.status,
    paidAt: record.paidAt,
    createdAt: record.createdAt,
    reviewReason: record.reviewReason,
    paymentCategory: record.paymentCategory,
    paymentMethodType: record.paymentMethodType,
    walletType: record.walletType,
    surchargeCents: record.surchargeCents,
  }
}
