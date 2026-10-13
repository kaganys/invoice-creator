import { classifyHostname } from '../hosting/hostRole.ts'
import { verifyAccessJwt } from './accessJwt.ts'

export type AccessIdentity = {
  email: string
  name: string
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export async function parseAccessIdentity(
  request: Request,
  env: Env,
): Promise<AccessIdentity | null> {
  const hostname = new URL(request.url).hostname
  if (classifyHostname(hostname) === 'dev') {
    return devIdentity(request, env)
  }
  const verified = await verifyAccessJwt(
    request.headers.get('cf-access-jwt-assertion'),
    env,
  )
  if (!verified) {
    return null
  }
  return verified
}

function devIdentity(request: Request, env: Env): AccessIdentity | null {
  const headerEmail = parseDevEmail(
    request.headers.get('cf-access-authenticated-user-email'),
  )
  const email = headerEmail ?? parseDevEmail(devAccessEmail(env))
  if (!email) {
    return null
  }
  const name =
    request.headers.get('cf-access-authenticated-user-name')?.trim() ||
    nameFromEmail(email)
  return { email, name }
}

function devAccessEmail(env: Env): string | undefined {
  const value = (env as Env & { DEV_ACCESS_EMAIL?: string }).DEV_ACCESS_EMAIL
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  return 'dev@localhost'
}

function parseEmail(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const email = normalizeEmail(value)
  return EMAIL_PATTERN.test(email) ? email : null
}

function parseDevEmail(value: string | null | undefined): string | null {
  const email = parseEmail(value)
  if (email) {
    return email
  }
  if (!value) {
    return null
  }
  const local = normalizeEmail(value)
  return /^[^\s@]+@localhost$/.test(local) ? local : null
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}
