import type { Person, PersonInput } from '../types/person.ts'
import { apiRequest } from './http.ts'

type PersonPayload = Person & {
  createdAt?: string
  updatedAt?: string
}

function asPerson(payload: PersonPayload): Person {
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    address: {
      line1: payload.address.line1,
      line2: payload.address.line2,
      city: payload.address.city,
      region: payload.address.region,
      postalCode: payload.address.postalCode,
      country: payload.address.country,
    },
  }
}

export async function fetchPeople(): Promise<Person[]> {
  const payload = await apiRequest<{ people: PersonPayload[] }>('/api/people')
  return payload.people.map(asPerson)
}

export async function createPerson(input: PersonInput): Promise<Person> {
  const payload = await apiRequest<{ person: PersonPayload }>('/api/people', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return asPerson(payload.person)
}

export async function updatePerson(
  id: string,
  input: PersonInput,
): Promise<Person> {
  const payload = await apiRequest<{ person: PersonPayload }>(
    `/api/people/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  )
  return asPerson(payload.person)
}

export async function deletePerson(id: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/people/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchSettings(): Promise<{ defaultFromId: string | null }> {
  return apiRequest<{ defaultFromId: string | null }>('/api/settings')
}

export async function updateSettings(defaultFromId: string | null): Promise<{
  defaultFromId: string | null
}> {
  return apiRequest<{ defaultFromId: string | null }>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ defaultFromId }),
  })
}
