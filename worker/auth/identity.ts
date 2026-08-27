import { asTrimmedString, isRecord } from '../lib/json.ts'

export type AccessIdentity = {
  email: string
  name: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function parseAccessIdentity(
  request: Request,
  env: Env,
): AccessIdentity | null {
  const headerEmail = request.headers.get('cf-access-authenticated-user-email')
  const jwt = request.headers.get('cf-access-jwt-assertion')
  const fromHeader = parseEmail(headerEmail)
  const fromJwt = parseJwtIdentity(jwt)
  const email = fromHeader ?? fromJwt?.email ?? parseEmail(devAccessEmail(env))
  if (!email) {
    return null
  }
  const name =
    fromJwt?.name ||
    request.headers.get('cf-access-authenticated-user-name')?.trim() ||
    nameFromEmail(email)
  return { email, name }
}

function devAccessEmail(env: Env): string | undefined {
  const value = (env as Env & { DEV_ACCESS_EMAIL?: string }).DEV_ACCESS_EMAIL
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  // Local wrangler/vite has no Access gateway. Seed a stable login.
  return 'dev@localhost'
}

function parseEmail(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const email = normalizeEmail(value)
  return EMAIL_PATTERN.test(email) ? email : null
}

function parseJwtIdentity(
  token: string | null,
): { email: string | null; name: string } | null {
  if (!token) {
    return null
  }
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const payload: unknown = JSON.parse(json)
    if (!isRecord(payload)) {
      return null
    }
    const email = parseEmail(asTrimmedString(payload.email))
    const name =
      asTrimmedString(payload.name) ||
      asTrimmedString(payload.given_name) ||
      (email ? nameFromEmail(email) : '')
    return { email, name }
  } catch {
    return null
  }
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}
