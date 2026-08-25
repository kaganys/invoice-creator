import type { ObjectStore, SequenceStore, SettingsKvStore } from './types.ts'

export function createD1SettingsStore(db: D1Database): SettingsKvStore {
  return {
    async get(key) {
      const row = await db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .bind(key)
        .first<{ value: string | null }>()
      return row?.value ?? null
    },

    async set(key, value, updatedAt) {
      await db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(key, value, updatedAt)
        .run()
    },
  }
}

export function createD1SequenceStore(db: D1Database): SequenceStore {
  return {
    async getNextSequence() {
      const row = await db
        .prepare('SELECT next_number FROM invoice_sequences WHERE id = 1')
        .first<{ next_number: number }>()
      return row?.next_number ?? 1
    },

    async setNextSequence(next) {
      const result = await db
        .prepare('UPDATE invoice_sequences SET next_number = ? WHERE id = 1')
        .bind(next)
        .run()
      if ((result.meta.changes ?? 0) === 0) {
        await db
          .prepare(
            'INSERT INTO invoice_sequences (id, next_number) VALUES (1, ?)',
          )
          .bind(next)
          .run()
      }
    },

    async allocateSequence() {
      const row = await db
        .prepare(
          `UPDATE invoice_sequences
           SET next_number = next_number + 1
           WHERE id = 1
           RETURNING next_number`,
        )
        .first<{ next_number: number }>()

      if (row) {
        return row.next_number - 1
      }

      await db
        .prepare(
          'INSERT INTO invoice_sequences (id, next_number) VALUES (1, 2)',
        )
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
