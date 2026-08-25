-- Extensible settings: invoice sequence (atomic), branding snapshot columns.
-- Non-secret settings continue to live in app_settings (JSON values per category).
-- SMTP password is NOT stored in D1.

-- Year strategy: the sequence is monotonic and NEVER resets on January 1.
-- Include-year only changes the formatted string (prefix + year + separator + padded
-- sequence). Resetting yearly would risk collisions if include-year is later turned
-- off, or if two years formatted the same sequence without a year component.
-- Example: BD2026-0051 then BD2027-0052 (sequence continues). Assigned invoice
-- numbers are immutable; changing numbering settings does not rewrite existing rows.

CREATE TABLE invoice_sequences (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  next_number INTEGER NOT NULL CHECK (next_number >= 1)
);

INSERT INTO invoice_sequences (id, next_number) VALUES (1, 1);

ALTER TABLE invoices ADD COLUMN invoice_logo_source TEXT NOT NULL DEFAULT 'builtin';
ALTER TABLE invoices ADD COLUMN invoice_logo_object_key TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN invoice_logo_content_type TEXT NOT NULL DEFAULT 'image/png';
