const VERSION = 'v1'

export async function encryptSecret(
  plain: string,
  keyMaterial: string,
): Promise<string> {
  if (!keyMaterial) {
    throw new Error('TENANT_SECRETS_KEY is required to store a company secret.')
  }
  const key = await importAesKey(keyMaterial)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  )
  return `${VERSION}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`
}

export async function decryptSecret(
  blob: string,
  keyMaterial: string | undefined,
): Promise<string | null> {
  if (!keyMaterial || !blob.startsWith(`${VERSION}.`)) {
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
    const value = new TextDecoder().decode(plain)
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function tenantSecretsKey(env: Env): string | undefined {
  const value = (env as Env & { TENANT_SECRETS_KEY?: string }).TENANT_SECRETS_KEY
  return typeof value === 'string' && value.length > 0 ? value : undefined
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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
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
