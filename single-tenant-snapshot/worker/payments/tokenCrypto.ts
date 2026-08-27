const TOKEN_BYTES = 32
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function generatePaymentToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

export function isWellFormedPaymentToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

export async function hashPaymentToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  )
  return bytesToHex(new Uint8Array(digest))
}

export function paymentLinkKeyConfigured(
  key: string | undefined,
): key is string {
  return typeof key === 'string' && key.length > 0
}

export async function encryptPaymentToken(
  raw: string,
  keyMaterial: string,
): Promise<string> {
  if (!paymentLinkKeyConfigured(keyMaterial)) {
    throw new Error(
      'PAYMENT_LINK_KEY is required to encrypt payment tokens. Set the same value in .dev.vars and as a Cloudflare Worker secret.',
    )
  }
  const key = await importAesKey(keyMaterial)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(raw),
  )
  const blob = `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`
  if (blob.startsWith('plain.') || blob.includes(raw)) {
    throw new Error('Refusing to persist a plaintext payment token.')
  }
  return blob
}

export async function decryptPaymentToken(
  blob: string,
  keyMaterial: string | undefined,
): Promise<string | null> {
  if (blob.startsWith('plain.')) {
    return null
  }
  if (!blob.startsWith('v1.') || !paymentLinkKeyConfigured(keyMaterial)) {
    return null
  }
  const parts = blob.split('.')
  if (parts.length !== 3) {
    return null
  }
  const iv = base64UrlToBytes(parts[1] ?? '')
  const data = base64UrlToBytes(parts[2] ?? '')
  if (!iv || !data) {
    return null
  }
  try {
    const key = await importAesKey(keyMaterial)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data as BufferSource,
    )
    const raw = new TextDecoder().decode(plain)
    return isWellFormedPaymentToken(raw) ? raw : null
  } catch {
    return null
  }
}

export type ParsedPublicBaseUrl =
  | { ok: true; value: string }
  | { ok: false; code: 'missing' | 'invalid'; message: string }

export function parsePublicPaymentBaseUrl(
  configured: string | undefined,
): ParsedPublicBaseUrl {
  const trimmed = (configured ?? '').trim()
  if (!trimmed) {
    return {
      ok: false,
      code: 'missing',
      message:
        'PUBLIC_PAYMENT_BASE_URL is not configured. Set it to the customer-facing origin such as https://pay.bitzdesigns.co.',
    }
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return {
      ok: false,
      code: 'invalid',
      message: 'PUBLIC_PAYMENT_BASE_URL must be a valid absolute HTTP or HTTPS URL.',
    }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      ok: false,
      code: 'invalid',
      message: 'PUBLIC_PAYMENT_BASE_URL must be an HTTP or HTTPS URL.',
    }
  }
  const localHost =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol === 'http:' && !localHost) {
    return {
      ok: false,
      code: 'invalid',
      message: 'PUBLIC_PAYMENT_BASE_URL must use HTTPS except for localhost.',
    }
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: 'invalid',
      message: 'PUBLIC_PAYMENT_BASE_URL must not include credentials.',
    }
  }
  return { ok: true, value: url.origin }
}

export function adminDisplayPaymentBaseUrl(
  configured: string | undefined,
  requestOrigin: string,
): string {
  const parsed = parsePublicPaymentBaseUrl(configured)
  if (parsed.ok) {
    return parsed.value
  }
  return requestOrigin.replace(/\/+$/, '')
}

export function usesPaymentUrlPlaceholder(template: string): boolean {
  return /\{\{\s*payment_url\s*\}\}/i.test(template)
}

export function paymentPagePath(rawToken: string): string {
  return `/i/${rawToken}`
}

export function paymentPageUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${paymentPagePath(rawToken)}`
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  )
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}
