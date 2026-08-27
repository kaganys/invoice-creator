-- Stripe webhook idempotency and payment audit.
-- Card numbers/CVC/secrets are never stored.

ALTER TABLE invoices ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE invoices ADD COLUMN paid_amount_cents INTEGER;

CREATE TABLE stripe_webhook_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  result TEXT NOT NULL
);

CREATE TABLE invoice_payments (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  stripe_event_id TEXT,
  review_reason TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE UNIQUE INDEX idx_invoice_payments_provider_id
  ON invoice_payments (provider, provider_payment_id);

CREATE INDEX idx_invoice_payments_invoice
  ON invoice_payments (invoice_id, created_at);
