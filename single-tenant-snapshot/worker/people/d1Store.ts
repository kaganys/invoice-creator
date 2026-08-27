import { DEFAULT_FROM_SETTING_KEY, type DirectoryStore, type PersonRecord, type PersonWriteFields } from './types.ts'

type PersonRow = {
  id: string
  name: string
  email: string
  address_line1: string
  address_line2: string
  city: string
  state_region: string
  postal_code: string
  country: string
  created_at: string
  updated_at: string
}

function mapRow(row: PersonRow): PersonRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    address: {
      line1: row.address_line1,
      line2: row.address_line2,
      city: row.city,
      region: row.state_region,
      postalCode: row.postal_code,
      country: row.country,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createD1DirectoryStore(db: D1Database): DirectoryStore {
  return {
    async listPeople() {
      const result = await db
        .prepare(
          `SELECT id, name, email, address_line1, address_line2, city, state_region, postal_code, country, created_at, updated_at
           FROM people
           ORDER BY name COLLATE NOCASE ASC, email COLLATE NOCASE ASC`,
        )
        .all<PersonRow>()
      return (result.results ?? []).map(mapRow)
    },

    async getPerson(id) {
      const row = await db
        .prepare(
          `SELECT id, name, email, address_line1, address_line2, city, state_region, postal_code, country, created_at, updated_at
           FROM people
           WHERE id = ?`,
        )
        .bind(id)
        .first<PersonRow>()
      return row ? mapRow(row) : null
    },

    async createPerson(record) {
      await db
        .prepare(
          `INSERT INTO people (
             id, name, email, address_line1, address_line2, city, state_region, postal_code, country, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.name,
          record.email,
          record.address.line1,
          record.address.line2,
          record.address.city,
          record.address.region,
          record.address.postalCode,
          record.address.country,
          record.createdAt,
          record.updatedAt,
        )
        .run()
      return record
    },

    async updatePerson(id, fields: PersonWriteFields, updatedAt: string) {
      const result = await db
        .prepare(
          `UPDATE people
           SET name = ?, email = ?, address_line1 = ?, address_line2 = ?, city = ?, state_region = ?, postal_code = ?, country = ?, updated_at = ?
           WHERE id = ?
           RETURNING id, name, email, address_line1, address_line2, city, state_region, postal_code, country, created_at, updated_at`,
        )
        .bind(
          fields.name,
          fields.email,
          fields.address.line1,
          fields.address.line2,
          fields.address.city,
          fields.address.region,
          fields.address.postalCode,
          fields.address.country,
          updatedAt,
          id,
        )
        .first<PersonRow>()
      return result ? mapRow(result) : null
    },

    async deletePerson(id) {
      const result = await db.prepare('DELETE FROM people WHERE id = ?').bind(id).run()
      return (result.meta.changes ?? 0) > 0
    },

    async getDefaultFromId() {
      const row = await db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .bind(DEFAULT_FROM_SETTING_KEY)
        .first<{ value: string | null }>()
      return row?.value ?? null
    },

    async setDefaultFromId(id, updatedAt) {
      await db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(DEFAULT_FROM_SETTING_KEY, id, updatedAt)
        .run()
    },
  }
}
