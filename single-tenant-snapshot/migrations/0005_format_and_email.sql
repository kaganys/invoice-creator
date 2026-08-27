-- Invoice format snapshots, send tracking, email history, and email templates.
-- Format JSON lives in app_settings (key = format) and per-invoice format_json.

ALTER TABLE invoices ADD COLUMN format_json TEXT;
ALTER TABLE invoices ADD COLUMN first_sent_at TEXT;
ALTER TABLE invoices ADD COLUMN last_sent_at TEXT;
ALTER TABLE invoices ADD COLUMN send_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE invoice_email_log (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  completed_at TEXT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  smtp_message_id TEXT,
  error_category TEXT,
  error_message TEXT,
  idempotency_key TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE INDEX idx_invoice_email_log_invoice ON invoice_email_log (invoice_id, attempted_at);
CREATE UNIQUE INDEX idx_invoice_email_log_idempotency
  ON invoice_email_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
