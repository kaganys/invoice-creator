-- Multi-company tenancy, Cloudflare Access users, and granular roles.
-- Existing rows are assigned to the Bitz Designs company.

CREATE TABLE companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  last_company_id TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  key TEXT,
  name TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE UNIQUE INDEX idx_roles_company_name ON roles (company_id, name COLLATE NOCASE);
CREATE INDEX idx_roles_company ON roles (company_id);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE UNIQUE INDEX idx_memberships_company_user ON memberships (company_id, user_id);
CREATE INDEX idx_memberships_user ON memberships (user_id);

CREATE TABLE company_settings (
  company_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, key),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

INSERT INTO companies (id, name, slug, created_at, updated_at)
VALUES (
  'c0a1b1e0-0000-4000-8000-000000000001',
  'Bitz Designs',
  'bitz-designs',
  '2026-08-27T00:00:00.000Z',
  '2026-08-27T00:00:00.000Z'
);

INSERT INTO company_settings (company_id, key, value, updated_at)
SELECT
  'c0a1b1e0-0000-4000-8000-000000000001',
  key,
  value,
  updated_at
FROM app_settings;

ALTER TABLE people ADD COLUMN company_id TEXT NOT NULL DEFAULT 'c0a1b1e0-0000-4000-8000-000000000001';
CREATE INDEX idx_people_company ON people (company_id);

ALTER TABLE invoices ADD COLUMN company_id TEXT NOT NULL DEFAULT 'c0a1b1e0-0000-4000-8000-000000000001';
CREATE INDEX idx_invoices_company ON invoices (company_id);

CREATE TABLE invoice_sequences_v2 (
  company_id TEXT PRIMARY KEY NOT NULL,
  next_number INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

INSERT INTO invoice_sequences_v2 (company_id, next_number)
SELECT
  'c0a1b1e0-0000-4000-8000-000000000001',
  COALESCE((SELECT next_number FROM invoice_sequences WHERE id = 1), 1);

DROP TABLE invoice_sequences;
ALTER TABLE invoice_sequences_v2 RENAME TO invoice_sequences;
