-- Persisted Stripe PaymentIntents for public card payments.
-- client_secret is returned to the browser by Stripe design; the secret API key is never stored.

CREATE TABLE invoice_stripe_intents (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL,
  token_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE INDEX idx_invoice_stripe_intents_invoice
  ON invoice_stripe_intents (invoice_id);
