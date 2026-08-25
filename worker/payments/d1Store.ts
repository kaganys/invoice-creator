import type {
  PaymentTokenRecord,
  PaymentTokenStore,
  PaymentTokenStatus,
} from './types.ts'

type TokenRow = {
  id: string
  invoice_id: string
  token_hash: string
  encrypted_token: string
  created_at: string
  revoked_at: string | null
  revoked_reason: string | null
  status: PaymentTokenStatus
}

function mapToken(row: TokenRow): PaymentTokenRecord {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    tokenHash: row.token_hash,
    encryptedToken: row.encrypted_token,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    status: row.status,
  }
}

export const REVOKE_ACTIVE_TOKENS_SQL = `UPDATE invoice_payment_tokens
SET status = 'revoked', revoked_at = ?, revoked_reason = ?
WHERE invoice_id = ? AND status = 'active'`

export function createD1PaymentTokenStore(db: D1Database): PaymentTokenStore {
  return {
    async getActiveByInvoiceId(invoiceId) {
      const row = await db
        .prepare(
          `SELECT * FROM invoice_payment_tokens
           WHERE invoice_id = ? AND status = 'active'
           LIMIT 1`,
        )
        .bind(invoiceId)
        .first<TokenRow>()
      return row ? mapToken(row) : null
    },

    async getByHash(tokenHash) {
      const row = await db
        .prepare(
          `SELECT * FROM invoice_payment_tokens WHERE token_hash = ? LIMIT 1`,
        )
        .bind(tokenHash)
        .first<TokenRow>()
      return row ? mapToken(row) : null
    },

    async insert(record) {
      await db
        .prepare(
          `INSERT INTO invoice_payment_tokens (
            id, invoice_id, token_hash, encrypted_token, created_at,
            revoked_at, revoked_reason, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.invoiceId,
          record.tokenHash,
          record.encryptedToken,
          record.createdAt,
          record.revokedAt,
          record.revokedReason,
          record.status,
        )
        .run()
    },

    async revokeActive(invoiceId, reason, revokedAt) {
      const result = await db
        .prepare(REVOKE_ACTIVE_TOKENS_SQL)
        .bind(revokedAt, reason, invoiceId)
        .run()
      return result.meta.changes ?? 0
    },
  }
}
