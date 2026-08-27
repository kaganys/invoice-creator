import { errorJson, json } from '../http.ts'
import { createEntityId, isUuid, nowIso } from '../lib/ids.ts'
import { readJsonBody } from '../lib/json.ts'
import { resolveDefaultFromId, validatePersonWrite, validateSettingsWrite } from './validation.ts'
import type { DirectoryStore, PersonRecord } from './types.ts'

function publicPerson(record: PersonRecord) {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    address: record.address,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export async function listPeople(store: DirectoryStore): Promise<Response> {
  const people = await store.listPeople()
  return json({ people: people.map(publicPerson) })
}

export async function getPerson(
  id: string,
  store: DirectoryStore,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid person id.', 400)
  }
  const person = await store.getPerson(id)
  if (!person) {
    return errorJson('Person not found.', 404)
  }
  return json({ person: publicPerson(person) })
}

export async function createPerson(
  request: Request,
  store: DirectoryStore,
  clock: () => string = nowIso,
  idFactory: () => string = createEntityId,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }

  const parsed = validatePersonWrite(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }

  const timestamp = clock()
  const record: PersonRecord = {
    id: idFactory(),
    name: parsed.value.name,
    email: parsed.value.email,
    address: parsed.value.address,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const created = await store.createPerson(record)
  return json({ person: publicPerson(created) }, { status: 201 })
}

export async function updatePerson(
  id: string,
  request: Request,
  store: DirectoryStore,
  clock: () => string = nowIso,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid person id.', 400)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }

  const parsed = validatePersonWrite(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }

  const updated = await store.updatePerson(id, parsed.value, clock())
  if (!updated) {
    return errorJson('Person not found.', 404)
  }
  return json({ person: publicPerson(updated) })
}

export async function deletePerson(
  id: string,
  store: DirectoryStore,
  clock: () => string = nowIso,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid person id.', 400)
  }

  const deleted = await store.deletePerson(id)
  if (!deleted) {
    return errorJson('Person not found.', 404)
  }

  const currentDefault = await store.getDefaultFromId()
  if (currentDefault === id) {
    await store.setDefaultFromId(null, clock())
  }

  return json({ ok: true })
}

export async function getSettings(store: DirectoryStore): Promise<Response> {
  const storedId = await store.getDefaultFromId()
  if (!storedId) {
    return json({ defaultFromId: null })
  }

  const person = await store.getPerson(storedId)
  const defaultFromId = resolveDefaultFromId(storedId, Boolean(person))
  if (defaultFromId !== storedId) {
    await store.setDefaultFromId(null, nowIso())
  }

  return json({ defaultFromId })
}

export async function updateSettings(
  request: Request,
  store: DirectoryStore,
  clock: () => string = nowIso,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }

  const parsed = validateSettingsWrite(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }

  if (parsed.value.defaultFromId) {
    if (!isUuid(parsed.value.defaultFromId)) {
      return errorJson('Invalid defaultFromId.', 400)
    }
    const person = await store.getPerson(parsed.value.defaultFromId)
    if (!person) {
      return errorJson('defaultFromId must refer to an existing person.', 400)
    }
  }

  await store.setDefaultFromId(parsed.value.defaultFromId, clock())
  return json({ defaultFromId: parsed.value.defaultFromId })
}
