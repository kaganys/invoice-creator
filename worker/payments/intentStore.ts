export type StoredStripeIntent = {
  id: string
  invoiceId: string
  tokenId: string
  stripePaymentIntentId: string
  clientSecret: string
  amountCents: number
  currency: string
  createdAt: string
  updatedAt: string
}

export interface StripeIntentStore {
  getByTokenId(tokenId: string): Promise<StoredStripeIntent | null>
  upsert(record: StoredStripeIntent): Promise<void>
}

type IntentRow = {
  id: string
  invoice_id: string
  token_id: string
  stripe_payment_intent_id: string
  client_secret: string
  amount_cents: number
  currency: string
  created_at: string
  updated_at: string
}

export function createD1StripeIntentStore(db: D1Database): StripeIntentStore {
  return {
    async getByTokenId(tokenId) {
      const row = await db
        .prepare(
          `SELECT * FROM invoice_stripe_intents WHERE token_id = ? LIMIT 1`,
        )
        .bind(tokenId)
        .first<IntentRow>()
      if (!row) {
        return null
      }
      return {
        id: row.id,
        invoiceId: row.invoice_id,
        tokenId: row.token_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        clientSecret: row.client_secret,
        amountCents: row.amount_cents,
        currency: row.currency,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    },

    async upsert(record) {
      await db
        .prepare(
          `INSERT INTO invoice_stripe_intents (
            id, invoice_id, token_id, stripe_payment_intent_id, client_secret,
            amount_cents, currency, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(token_id) DO UPDATE SET
            stripe_payment_intent_id = excluded.stripe_payment_intent_id,
            client_secret = excluded.client_secret,
            amount_cents = excluded.amount_cents,
            currency = excluded.currency,
            updated_at = excluded.updated_at`,
        )
        .bind(
          record.id,
          record.invoiceId,
          record.tokenId,
          record.stripePaymentIntentId,
          record.clientSecret,
          record.amountCents,
          record.currency,
          record.createdAt,
          record.updatedAt,
        )
        .run()
    },
  }
}
