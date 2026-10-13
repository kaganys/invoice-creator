import { describe, expect, it } from 'vitest'
import { parseAccessIdentity } from './identity.ts'
import { verifyAccessJwtWithKeys } from './accessJwt.ts'

function env(email?: string): Env {
  return { DEV_ACCESS_EMAIL: email } as unknown as Env
}

describe('parseAccessIdentity', () => {
  it('does not trust an email header on the admin host', async () => {
    const identity = await parseAccessIdentity(
      new Request('https://invoice.vrfnw.com/api/session', {
        headers: {
          'cf-access-authenticated-user-email': 'Saul@BitzDesigns.co',
        },
      }),
      env(),
    )
    expect(identity).toBeNull()
  })

  it('accepts the documented dev@localhost fallback', async () => {
    const identity = await parseAccessIdentity(
      new Request('http://127.0.0.1:5173/api/session'),
      env(),
    )
    expect(identity?.email).toBe('dev@localhost')
  })

  it('uses the local development email only on localhost', async () => {
    const identity = await parseAccessIdentity(
      new Request('https://localhost/api/session'),
      env('owner@example.com'),
    )
    expect(identity?.email).toBe('owner@example.com')

    const production = await parseAccessIdentity(
      new Request('https://invoice.vrfnw.com/api/session'),
      env('owner@example.com'),
    )
    expect(production).toBeNull()
  })
})

describe('verifyAccessJwtWithKeys', () => {
  it('accepts a signed Access token and rejects a bad audience', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
    const key = await crypto.subtle.importKey(
      'jwk',
      { ...jwk, alg: 'RS256', kid: 'test-key' },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const keys = new Map([['test-key', key]])
    const now = 1_700_000_000
    const token = await signJwt(pair.privateKey, {
      email: 'Saul@BitzDesigns.co',
      name: 'Saul',
      aud: 'aud-tag',
      iss: 'https://team.cloudflareaccess.com',
      exp: now + 60,
      nbf: now - 10,
    })
    const verified = await verifyAccessJwtWithKeys(token, keys, {
      teamDomain: 'team.cloudflareaccess.com',
      audience: 'aud-tag',
      nowSeconds: now,
    })
    expect(verified?.email).toBe('saul@bitzdesigns.co')
    expect(verified?.name).toBe('Saul')

    const wrongAudience = await verifyAccessJwtWithKeys(token, keys, {
      teamDomain: 'team.cloudflareaccess.com',
      audience: 'other',
      nowSeconds: now,
    })
    expect(wrongAudience).toBeNull()
  })
})

async function signJwt(
  key: CryptoKey,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'RS256', kid: 'test-key' }))
  const body = base64Url(JSON.stringify(payload))
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(`${header}.${body}`),
  )
  return `${header}.${body}.${base64Url(signature)}`
}

function base64Url(value: string | ArrayBuffer): string {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
