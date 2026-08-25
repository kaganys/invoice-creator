import { lineAmountCents } from '../../src/utils/money.ts'
import type {
  InvoiceLineRecord,
  InvoiceListRecord,
  InvoiceRecord,
  InvoiceStatus,
  InvoiceStore,
} from './types.ts'

type InvoiceRow = {
  id: string
  invoice_number: string
  status: InvoiceStatus
  issue_date: string
  due_date: string
  currency: string
  from_name: string
  from_email: string
  from_address_line1: string
  from_address_line2: string
  from_city: string
  from_state_region: string
  from_postal_code: string
  from_country: string
  customer_name: string
  customer_email: string
  customer_address_line1: string
  customer_address_line2: string
  customer_city: string
  customer_state_region: string
  customer_postal_code: string
  customer_country: string
  payment_memo: string
  zelle_email: string
  card_fee_percent_scaled: number
  card_fee_fixed_cents: number
  notes: string
  created_at: string
  updated_at: string
}

type LineRow = {
  id: string
  invoice_id: string
  sort_order: number
  description: string
  quantity_scaled: number
  unit_price_cents: number
}

function mapParty(
  prefix: 'from' | 'customer',
  row: InvoiceRow,
): InvoiceRecord['from'] {
  if (prefix === 'from') {
    return {
      name: row.from_name,
      email: row.from_email,
      address: {
        line1: row.from_address_line1,
        line2: row.from_address_line2,
        city: row.from_city,
        region: row.from_state_region,
        postalCode: row.from_postal_code,
        country: row.from_country,
      },
    }
  }
  return {
    name: row.customer_name,
    email: row.customer_email,
    address: {
      line1: row.customer_address_line1,
      line2: row.customer_address_line2,
      city: row.customer_city,
      region: row.customer_state_region,
      postalCode: row.customer_postal_code,
      country: row.customer_country,
    },
  }
}

function mapLine(row: LineRow): InvoiceLineRecord {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    sortOrder: row.sort_order,
    description: row.description,
    quantityScaled: row.quantity_scaled,
    unitPriceCents: row.unit_price_cents,
  }
}

function mapInvoice(row: InvoiceRow, lines: InvoiceLineRecord[]): InvoiceRecord {
  return {
    id: row.id,
    number: row.invoice_number,
    status: row.status,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    currency: row.currency,
    from: mapParty('from', row),
    customer: mapParty('customer', row),
    payment: {
      memo: row.payment_memo,
      zelleEmail: row.zelle_email,
      cardFeePercentScaled: row.card_fee_percent_scaled,
      cardFeeFixedCents: row.card_fee_fixed_cents,
    },
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lineItems: [...lines].sort((a, b) => a.sortOrder - b.sortOrder),
  }
}

function invoiceBinds(record: InvoiceRecord): unknown[] {
  return [
    record.number,
    record.status,
    record.issueDate,
    record.dueDate,
    record.currency,
    record.from.name,
    record.from.email,
    record.from.address.line1,
    record.from.address.line2,
    record.from.address.city,
    record.from.address.region,
    record.from.address.postalCode,
    record.from.address.country,
    record.customer.name,
    record.customer.email,
    record.customer.address.line1,
    record.customer.address.line2,
    record.customer.address.city,
    record.customer.address.region,
    record.customer.address.postalCode,
    record.customer.address.country,
    record.payment.memo,
    record.payment.zelleEmail,
    record.payment.cardFeePercentScaled,
    record.payment.cardFeeFixedCents,
    record.notes,
    record.updatedAt,
    record.id,
  ]
}

const INSERT_SQL = `INSERT INTO invoices (
  id, invoice_number, status, issue_date, due_date, currency,
  from_name, from_email, from_address_line1, from_address_line2, from_city, from_state_region, from_postal_code, from_country,
  customer_name, customer_email, customer_address_line1, customer_address_line2, customer_city, customer_state_region, customer_postal_code, customer_country,
  payment_memo, zelle_email, card_fee_percent_scaled, card_fee_fixed_cents, notes, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

const UPDATE_SQL = `UPDATE invoices SET
  invoice_number = ?, status = ?, issue_date = ?, due_date = ?, currency = ?,
  from_name = ?, from_email = ?, from_address_line1 = ?, from_address_line2 = ?, from_city = ?, from_state_region = ?, from_postal_code = ?, from_country = ?,
  customer_name = ?, customer_email = ?, customer_address_line1 = ?, customer_address_line2 = ?, customer_city = ?, customer_state_region = ?, customer_postal_code = ?, customer_country = ?,
  payment_memo = ?, zelle_email = ?, card_fee_percent_scaled = ?, card_fee_fixed_cents = ?, notes = ?, updated_at = ?
  WHERE id = ?`

const LINE_INSERT_SQL = `INSERT INTO invoice_line_items (
  id, invoice_id, sort_order, description, quantity_scaled, unit_price_cents
) VALUES (?, ?, ?, ?, ?, ?)`

export function createD1InvoiceStore(db: D1Database): InvoiceStore {
  return {
    async list() {
      const invoices = await db
        .prepare(
          `SELECT * FROM invoices ORDER BY created_at DESC`,
        )
        .all<InvoiceRow>()
      const lines = await db
        .prepare(
          `SELECT id, invoice_id, sort_order, description, quantity_scaled, unit_price_cents FROM invoice_line_items`,
        )
        .all<LineRow>()

      const linesByInvoice = new Map<string, LineRow[]>()
      for (const line of lines.results ?? []) {
        const list = linesByInvoice.get(line.invoice_id) ?? []
        list.push(line)
        linesByInvoice.set(line.invoice_id, list)
      }

      return (invoices.results ?? []).map((row) => {
        const invoiceLines = linesByInvoice.get(row.id) ?? []
        const amountCents = invoiceLines.reduce(
          (sum, line) =>
            sum + lineAmountCents(line.quantity_scaled, line.unit_price_cents),
          0,
        )
        return {
          id: row.id,
          number: row.invoice_number,
          customerName: row.customer_name,
          issueDate: row.issue_date,
          dueDate: row.due_date,
          amountCents,
          currency: row.currency,
          status: row.status,
          createdAt: row.created_at,
        } satisfies InvoiceListRecord
      })
    },

    async get(id) {
      const row = await db
        .prepare('SELECT * FROM invoices WHERE id = ?')
        .bind(id)
        .first<InvoiceRow>()
      if (!row) {
        return null
      }
      const lines = await db
        .prepare(
          `SELECT id, invoice_id, sort_order, description, quantity_scaled, unit_price_cents
           FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order ASC`,
        )
        .bind(id)
        .all<LineRow>()
      return mapInvoice(row, (lines.results ?? []).map(mapLine))
    },

    async findIdByNumber(number) {
      const row = await db
        .prepare('SELECT id FROM invoices WHERE invoice_number = ?')
        .bind(number)
        .first<{ id: string }>()
      return row?.id ?? null
    },

    async create(record) {
      const statements = [
        db.prepare(INSERT_SQL).bind(
          record.id,
          record.number,
          record.status,
          record.issueDate,
          record.dueDate,
          record.currency,
          record.from.name,
          record.from.email,
          record.from.address.line1,
          record.from.address.line2,
          record.from.address.city,
          record.from.address.region,
          record.from.address.postalCode,
          record.from.address.country,
          record.customer.name,
          record.customer.email,
          record.customer.address.line1,
          record.customer.address.line2,
          record.customer.address.city,
          record.customer.address.region,
          record.customer.address.postalCode,
          record.customer.address.country,
          record.payment.memo,
          record.payment.zelleEmail,
          record.payment.cardFeePercentScaled,
          record.payment.cardFeeFixedCents,
          record.notes,
          record.createdAt,
          record.updatedAt,
        ),
        ...record.lineItems.map((line) =>
          db
            .prepare(LINE_INSERT_SQL)
            .bind(
              line.id,
              line.invoiceId,
              line.sortOrder,
              line.description,
              line.quantityScaled,
              line.unitPriceCents,
            ),
        ),
      ]
      await db.batch(statements)
      return record
    },

    async replace(record) {
      const existing = await db
        .prepare('SELECT id FROM invoices WHERE id = ?')
        .bind(record.id)
        .first<{ id: string }>()
      if (!existing) {
        return null
      }

      const statements = [
        db.prepare(UPDATE_SQL).bind(...invoiceBinds(record)),
        db
          .prepare('DELETE FROM invoice_line_items WHERE invoice_id = ?')
          .bind(record.id),
        ...record.lineItems.map((line) =>
          db
            .prepare(LINE_INSERT_SQL)
            .bind(
              line.id,
              line.invoiceId,
              line.sortOrder,
              line.description,
              line.quantityScaled,
              line.unitPriceCents,
            ),
        ),
      ]
      await db.batch(statements)
      return record
    },

    async deleteDraft(id) {
      const row = await db
        .prepare('SELECT status FROM invoices WHERE id = ?')
        .bind(id)
        .first<{ status: InvoiceStatus }>()
      if (!row) {
        return 'not_found'
      }
      if (row.status !== 'draft') {
        return 'not_draft'
      }
      await db.batch([
        db.prepare('DELETE FROM invoice_line_items WHERE invoice_id = ?').bind(id),
        db.prepare('DELETE FROM invoices WHERE id = ?').bind(id),
      ])
      return 'deleted'
    },
  }
}
