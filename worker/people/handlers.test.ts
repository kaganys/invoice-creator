import { describe, expect, it } from 'vitest'
import {
  createPerson,
  deletePerson,
  getSettings,
  listPeople,
  updatePerson,
  updateSettings,
} from './handlers.ts'
import type { DirectoryStore, PersonRecord } from './types.ts'

const PERSON_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-08-25T12:00:00.000Z'

function jsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.test/api/people', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createMemoryStore(): DirectoryStore {
  const people = new Map<string, PersonRecord>()
  let defaultFromId: string | null = null

  return {
    async listPeople() {
      return [...people.values()].sort((a, b) => a.name.localeCompare(b.name))
    },
    async getPerson(id) {
      return people.get(id) ?? null
    },
    async createPerson(record) {
      people.set(record.id, record)
      return record
    },
    async updatePerson(id, fields, updatedAt) {
      const existing = people.get(id)
      if (!existing) {
        return null
      }
      const next = {
        ...existing,
        ...fields,
        address: { ...fields.address },
        updatedAt,
      }
      people.set(id, next)
      return next
    },
    async deletePerson(id) {
      return people.delete(id)
    },
    async getDefaultFromId() {
      return defaultFromId
    },
    async setDefaultFromId(id) {
      defaultFromId = id
    },
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe('people API handlers', () => {
  it('creates a person', async () => {
    const store = createMemoryStore()
    const response = await createPerson(
      jsonRequest({ name: 'Ada Lovelace', email: 'ada@example.com' }),
      store,
      () => NOW,
      () => PERSON_ID,
    )
    expect(response.status).toBe(201)
    const payload = await readJson(response)
    expect(payload.person).toMatchObject({
      id: PERSON_ID,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })

  it('rejects malformed JSON', async () => {
    const response = await createPerson(
      new Request('https://example.test/api/people', {
        method: 'POST',
        body: '{not json',
      }),
      createMemoryStore(),
    )
    expect(response.status).toBe(400)
    const payload = await readJson(response)
    expect(payload.error).toMatch(/malformed json/i)
  })

  it('rejects a person without a name', async () => {
    const response = await createPerson(
      jsonRequest({ email: 'ada@example.com' }),
      createMemoryStore(),
    )
    expect(response.status).toBe(400)
  })

  it('lists people after create', async () => {
    const store = createMemoryStore()
    await createPerson(
      jsonRequest({ name: 'Ada' }),
      store,
      () => NOW,
      () => PERSON_ID,
    )
    const response = await listPeople(store)
    const payload = await readJson(response)
    expect(payload.people).toHaveLength(1)
  })

  it('updates a person', async () => {
    const store = createMemoryStore()
    await createPerson(
      jsonRequest({ name: 'Ada' }),
      store,
      () => NOW,
      () => PERSON_ID,
    )
    const response = await updatePerson(
      PERSON_ID,
      jsonRequest({ name: 'Ada Lovelace' }, 'PUT'),
      store,
      () => '2026-08-25T13:00:00.000Z',
    )
    expect(response.status).toBe(200)
    const payload = await readJson(response)
    expect(payload.person).toMatchObject({ name: 'Ada Lovelace' })
  })

  it('returns 404 when updating a missing person', async () => {
    const response = await updatePerson(
      OTHER_ID,
      jsonRequest({ name: 'Ada' }, 'PUT'),
      createMemoryStore(),
    )
    expect(response.status).toBe(404)
  })
})

describe('default From setting', () => {
  it('rejects a default From that does not exist', async () => {
    const response = await updateSettings(
      jsonRequest({ defaultFromId: PERSON_ID }, 'PUT'),
      createMemoryStore(),
    )
    expect(response.status).toBe(400)
  })

  it('stores a default From for an existing person', async () => {
    const store = createMemoryStore()
    await createPerson(
      jsonRequest({ name: 'Bitz Designs' }),
      store,
      () => NOW,
      () => PERSON_ID,
    )
    const response = await updateSettings(
      jsonRequest({ defaultFromId: PERSON_ID }, 'PUT'),
      store,
    )
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ defaultFromId: PERSON_ID })
  })

  it('clears the default From when that person is deleted', async () => {
    const store = createMemoryStore()
    await createPerson(
      jsonRequest({ name: 'Bitz Designs' }),
      store,
      () => NOW,
      () => PERSON_ID,
    )
    await updateSettings(
      jsonRequest({ defaultFromId: PERSON_ID }, 'PUT'),
      store,
    )
    const deleted = await deletePerson(PERSON_ID, store)
    expect(deleted.status).toBe(200)
    const settings = await getSettings(store)
    expect(await readJson(settings)).toEqual({ defaultFromId: null })
  })

  it('self-heals a dangling default From on read', async () => {
    const store = createMemoryStore()
    await store.setDefaultFromId(PERSON_ID, NOW)
    const settings = await getSettings(store)
    expect(await readJson(settings)).toEqual({ defaultFromId: null })
    expect(await store.getDefaultFromId()).toBeNull()
  })
})
