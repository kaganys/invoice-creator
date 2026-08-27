import { asTrimmedString, isRecord } from '../lib/json.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type PersonWrite = {
  name: string
  email: string
  address: {
    line1: string
    line2: string
    city: string
    region: string
    postalCode: string
    country: string
  }
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }

export function validatePersonWrite(input: unknown): ValidationResult<PersonWrite> {
  if (!isRecord(input)) {
    return { ok: false, message: 'Person data must be a JSON object.' }
  }

  const name = asTrimmedString(input.name)
  if (!name) {
    return { ok: false, message: 'Name is required.' }
  }

  const email = asTrimmedString(input.email)
  if (email && !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: 'Email is not valid.' }
  }

  const addressInput = isRecord(input.address) ? input.address : {}

  return {
    ok: true,
    value: {
      name,
      email,
      address: {
        line1: asTrimmedString(addressInput.line1),
        line2: asTrimmedString(addressInput.line2),
        city: asTrimmedString(addressInput.city),
        region: asTrimmedString(addressInput.region),
        postalCode: asTrimmedString(addressInput.postalCode),
        country: asTrimmedString(addressInput.country),
      },
    },
  }
}

export function validateSettingsWrite(
  input: unknown,
): ValidationResult<{ defaultFromId: string | null }> {
  if (!isRecord(input)) {
    return { ok: false, message: 'Settings data must be a JSON object.' }
  }

  if (!('defaultFromId' in input)) {
    return { ok: false, message: 'defaultFromId is required.' }
  }

  const raw = input.defaultFromId
  if (raw === null || raw === '') {
    return { ok: true, value: { defaultFromId: null } }
  }

  if (typeof raw !== 'string') {
    return { ok: false, message: 'defaultFromId must be a string or null.' }
  }

  const defaultFromId = raw.trim()
  if (!defaultFromId) {
    return { ok: true, value: { defaultFromId: null } }
  }

  return { ok: true, value: { defaultFromId } }
}

export function resolveDefaultFromId(
  storedId: string | null,
  personExists: boolean,
): string | null {
  if (!storedId) {
    return null
  }
  return personExists ? storedId : null
}
