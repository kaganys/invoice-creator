import { asTrimmedString, isRecord } from '../lib/json.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type VerifiedAccessIdentity = {
  email: string
  name: string
}

type AccessJwk = JsonWebKey & { kid?: string }

const CERT_TTL_MS = 60 * 60 * 1000

let cachedKeys: { team: string; expires: number; keys: Map<string, CryptoKey> } | null =
  null

export function accessTeamDomain(env: Env): string | undefined {
  const value = (env as Env & { ACCESS_TEAM_DOMAIN?: string }).ACCESS_TEAM_DOMAIN
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  return trimmed || undefined
}

export function accessAudience(env: Env): string | undefined {
  const value = (env as Env & { ACCESS_AUD?: string }).ACCESS_AUD
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export async function verifyAccessJwt(
  token: string | null,
  env: Env,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifiedAccessIdentity | null> {
  const team = accessTeamDomain(env)
  const audience = accessAudience(env)
  if (!token || !team || !audience) {
    return null
  }
  const keys = await loadAccessKeys(team)
  return verifyAccessJwtWithKeys(token, keys, {
    teamDomain: team,
    audience,
    nowSeconds,
  })
}

export async function verifyAccessJwtWithKeys(
  token: string,
  keys: Map<string, CryptoKey>,
  options: { teamDomain: string; audience: string; nowSeconds: number },
): Promise<VerifiedAccessIdentity | null> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }
  let header: Record<string, unknown>
  let payload: Record<string, unknown>
  try {
    const parsedHeader: unknown = JSON.parse(decodeBase64Url(parts[0] ?? ''))
    const parsedPayload: unknown = JSON.parse(decodeBase64Url(parts[1] ?? ''))
    if (!isRecord(parsedHeader) || !isRecord(parsedPayload)) {
      return null
    }
    header = parsedHeader
    payload = parsedPayload
  } catch {
    return null
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return null
  }
  const key = keys.get(header.kid)
  const signature = base64UrlToBytes(parts[2] ?? '')
  if (!key || !signature) {
    return null
  }
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature as BufferSource,
    signed,
  )
  if (!valid) {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < options.nowSeconds) {
    return null
  }
  if (typeof payload.nbf === 'number' && payload.nbf > options.nowSeconds + 60) {
    return null
  }
  const expectedIss = `https://${options.teamDomain}`
  if (payload.iss !== expectedIss) {
    return null
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(options.audience)) {
    return null
  }
  const emailRaw = asTrimmedString(payload.email)
  if (!emailRaw || !EMAIL_PATTERN.test(emailRaw.trim())) {
    return null
  }
  const email = emailRaw.trim().toLowerCase()
  const name =
    asTrimmedString(payload.name) ||
    asTrimmedString(payload.given_name) ||
    email.split('@')[0] ||
    email
  return { email, name }
}

async function loadAccessKeys(team: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now()
  if (cachedKeys && cachedKeys.team === team && cachedKeys.expires > now) {
    return cachedKeys.keys
  }
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`)
  if (!response.ok) {
    return new Map()
  }
  const body: unknown = await response.json()
  if (!isRecord(body) || !Array.isArray(body.keys)) {
    return new Map()
  }
  const keys = new Map<string, CryptoKey>()
  for (const entry of body.keys) {
    if (!isRecord(entry) || typeof entry.kid !== 'string') {
      continue
    }
    if (entry.kty !== 'RSA') {
      continue
    }
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      entry as unknown as AccessJwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    keys.set(entry.kid, cryptoKey)
  }
  cachedKeys = { team, expires: now + CERT_TTL_MS, keys }
  return keys
}

function decodeBase64Url(value: string): string {
  const bytes = base64UrlToBytes(value)
  if (!bytes) {
    throw new Error('Invalid base64url')
  }
  return new TextDecoder().decode(bytes)
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!value) {
    return null
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  try {
    const binary = atob(padded + pad)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}
