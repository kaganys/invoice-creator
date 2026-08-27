import { describe, expect, it } from 'vitest'
import { parseAccessIdentity } from './identity.ts'

function env(email?: string): Env {
  return { DEV_ACCESS_EMAIL: email } as unknown as Env
}

describe('parseAccessIdentity', () => {
  it('uses the Cloudflare Access email header as the username', () => {
    const identity = parseAccessIdentity(
      new Request('https://invoice.vrfnw.com/api/session', {
        headers: {
          'cf-access-authenticated-user-email': 'Saul@BitzDesigns.co',
        },
      }),
      env(),
    )
    expect(identity?.email).toBe('saul@bitzdesigns.co')
    expect(identity?.name).toBe('Saul')
  })

  it('falls back to the local development email', () => {
    const identity = parseAccessIdentity(
      new Request('https://localhost/api/session'),
      env('owner@example.com'),
    )
    expect(identity?.email).toBe('owner@example.com')
  })
})
