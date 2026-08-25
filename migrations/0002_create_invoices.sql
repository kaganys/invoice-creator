-- Saved invoices and line items.
-- Monetary values are integer cents (or scaled integers). Totals are computed from line items.

CREATE TABLE invoices (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  issue_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',

  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  from_address_line1 TEXT NOT NULL DEFAULT '',
  from_address_line2 TEXT NOT NULL DEFAULT '',
  from_city TEXT NOT NULL DEFAULT '',
  from_state_region TEXT NOT NULL DEFAULT '',
  from_postal_code TEXT NOT NULL DEFAULT '',
  from_country TEXT NOT NULL DEFAULT '',

  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  customer_address_line1 TEXT NOT NULL DEFAULT '',
  customer_address_line2 TEXT NOT NULL DEFAULT '',
  customer_city TEXT NOT NULL DEFAULT '',
  customer_state_region TEXT NOT NULL DEFAULT '',
  customer_postal_code TEXT NOT NULL DEFAULT '',
  customer_country TEXT NOT NULL DEFAULT '',

  payment_memo TEXT NOT NULL DEFAULT '',
  zelle_email TEXT NOT NULL DEFAULT '',
  card_fee_percent_scaled INTEGER NOT NULL DEFAULT 0,
  card_fee_fixed_cents INTEGER NOT NULL DEFAULT 0,

  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_invoices_number ON invoices (invoice_number);
CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_created_at ON invoices (created_at);

CREATE TABLE invoice_line_items (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity_scaled INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX idx_invoice_line_items_invoice_id
  ON invoice_line_items (invoice_id, sort_order);
