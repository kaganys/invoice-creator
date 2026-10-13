import { describe, expect, it } from 'vitest'
import { inviteAllowsOnboard } from './invite.ts'

function env(code?: string): Env {
  return { ONBOARD_INVITE_CODE: code } as unknown as Env
}

describe('onboard invites', () => {
  it('allows localhost when no invite is configured', () => {
    expect(inviteAllowsOnboard('localhost', env(), '')).toBe(true)
    expect(inviteAllowsOnboard('invoice.vrfnw.com', env(), '')).toBe(false)
  })

  it('requires the configured code on every host', () => {
    expect(inviteAllowsOnboard('invoice.vrfnw.com', env('let-me-in'), 'let-me-in')).toBe(
      true,
    )
    expect(inviteAllowsOnboard('localhost', env('let-me-in'), 'wrong')).toBe(false)
    expect(inviteAllowsOnboard('invoice.vrfnw.com', env('let-me-in'), '')).toBe(false)
  })
})
