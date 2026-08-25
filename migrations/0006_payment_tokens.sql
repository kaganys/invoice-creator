-- Public payment-link tokens.
-- Lookup uses token_hash (SHA-256). encrypted_token is a recoverable copy for
-- admin display and resend of the same URL (AES-GCM when PAYMENT_LINK_KEY is set).

CREATE TABLE invoice_payment_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE UNIQUE INDEX idx_invoice_payment_tokens_hash
  ON invoice_payment_tokens (token_hash);

CREATE UNIQUE INDEX idx_invoice_payment_tokens_active_invoice
  ON invoice_payment_tokens (invoice_id)
  WHERE status = 'active';

CREATE INDEX idx_invoice_payment_tokens_invoice
  ON invoice_payment_tokens (invoice_id, created_at);
