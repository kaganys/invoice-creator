-- Static invoice logo path (no R2). Historical rows default to the built-in icon.
-- Payment / void metadata for invoice management. Unpaid/unvoided rows stay NULL.
-- Existing logo snapshot columns from 0003 are left in place and ignored.

ALTER TABLE invoices ADD COLUMN invoice_logo_path TEXT NOT NULL DEFAULT '/branding/bitz-designs-icon.png';
ALTER TABLE invoices ADD COLUMN paid_at TEXT;
ALTER TABLE invoices ADD COLUMN paid_method TEXT;
ALTER TABLE invoices ADD COLUMN voided_at TEXT;
ALTER TABLE invoices ADD COLUMN void_reason TEXT;
