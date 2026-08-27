import type { ObjectStore, SequenceStore, SettingsKvStore } from './types.ts'

export function createD1SettingsStore(
  db: D1Database,
  companyId: string,
): SettingsKvStore {
  return {
    async get(key) {
      const row = await db
        .prepare(
          'SELECT value FROM company_settings WHERE company_id = ? AND key = ?',
        )
        .bind(companyId, key)
        .first<{ value: string | null }>()
      return row?.value ?? null
    },

    async set(key, value, updatedAt) {
      await db
        .prepare(
          `INSERT INTO company_settings (company_id, key, value, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(company_id, key) DO UPDATE SET
             value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(companyId, key, value, updatedAt)
        .run()
    },
  }
}

export function createD1SequenceStore(
  db: D1Database,
  companyId: string,
): SequenceStore {
  return {
    async getNextSequence() {
      const row = await db
        .prepare(
          'SELECT next_number FROM invoice_sequences WHERE company_id = ?',
        )
        .bind(companyId)
        .first<{ next_number: number }>()
      return row?.next_number ?? 1
    },

    async setNextSequence(next) {
      const result = await db
        .prepare(
          'UPDATE invoice_sequences SET next_number = ? WHERE company_id = ?',
        )
        .bind(next, companyId)
        .run()
      if ((result.meta.changes ?? 0) === 0) {
        await db
          .prepare(
            'INSERT INTO invoice_sequences (company_id, next_number) VALUES (?, ?)',
          )
          .bind(companyId, next)
          .run()
      }
    },

    async allocateSequence() {
      const row = await db
        .prepare(
          `UPDATE invoice_sequences
           SET next_number = next_number + 1
           WHERE company_id = ?
           RETURNING next_number`,
        )
        .bind(companyId)
        .first<{ next_number: number }>()

      if (row) {
        return row.next_number - 1
      }

      await db
        .prepare(
          'INSERT INTO invoice_sequences (company_id, next_number) VALUES (?, 2)',
        )
        .bind(companyId)
        .run()
      return 1
    },
  }
}

export function createR2ObjectStore(bucket: R2Bucket): ObjectStore {
  return {
    async put(key, data, contentType) {
      await bucket.put(key, data, {
        httpMetadata: { contentType },
      })
    },
    async get(key) {
      const object = await bucket.get(key)
      if (!object) {
        return null
      }
      return {
        body: await object.arrayBuffer(),
        contentType: object.httpMetadata?.contentType || 'application/octet-stream',
      }
    },
  }
}
