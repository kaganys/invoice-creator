-- Invoice numbers and email idempotency keys are per company / per invoice.
-- Stripe and SMTP secrets are stored encrypted, one row per company.

DROP INDEX IF EXISTS idx_invoices_number;

CREATE UNIQUE INDEX idx_invoices_company_number
  ON invoices (company_id, invoice_number);

DROP INDEX IF EXISTS idx_invoice_email_log_idempotency;

CREATE UNIQUE INDEX idx_invoice_email_log_invoice_idempotency
  ON invoice_email_log (invoice_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

CREATE TABLE company_secrets (
  company_id TEXT NOT NULL,
  key TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, key),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
