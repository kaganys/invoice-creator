import { describe, expect, it } from 'vitest'
import {
  parsePaymentsJson,
  publicPayments,
  validatePaymentsWrite,
} from './payments.ts'

describe('payments settings', () => {
  it('accepts a publishable key and never includes a secret', () => {
    const result = validatePaymentsWrite({
      stripeEnabled: true,
      cardPaymentsEnabled: true,
      achPaymentsEnabled: true,
      publishableKey: 'pk_test_51ABC',
      statementDescriptor: 'BITZ DESIGNS',
    })
    expect(result.ok).toBe(true)
    const publicValue = publicPayments(
      {
        stripeEnabled: true,
        cardPaymentsEnabled: true,
        achPaymentsEnabled: true,
        publishableKey: 'pk_test_51ABC',
        statementDescriptor: 'BITZ DESIGNS',
        successRedirectUrl: '',
      },
      true,
    )
    expect(publicValue.achPaymentsEnabled).toBe(true)
    expect(publicValue.secretConfigured).toBe(true)
    expect(JSON.stringify(publicValue)).not.toMatch(/sk_/)
    expect(publicValue).not.toHaveProperty('secretKey')
  })

  it('rejects a secret key pasted into the publishable field', () => {
    const result = validatePaymentsWrite({
      publishableKey: 'sk_test_51secret',
      stripeEnabled: true,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a secret key field on the write API', () => {
    const result = validatePaymentsWrite({
      stripeEnabled: true,
      secretKey: 'sk_live_hidden',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toContain('sk_live_hidden')
    }
  })

  it('stores a blank redirect for older settings and accepts only https', () => {
    expect(parsePaymentsJson(JSON.stringify({ stripeEnabled: true })).successRedirectUrl).toBe(
      '',
    )
    const saved = validatePaymentsWrite({
      stripeEnabled: true,
      successRedirectUrl: 'https://shop.example/thanks',
    })
    expect(saved.ok).toBe(true)
    if (saved.ok) {
      expect(saved.value.successRedirectUrl).toBe('https://shop.example/thanks')
    }
    expect(
      validatePaymentsWrite({
        stripeEnabled: true,
        successRedirectUrl: 'http://shop.example/thanks',
      }).ok,
    ).toBe(false)
    expect(validatePaymentsWrite({ stripeEnabled: true, successRedirectUrl: '' }).ok).toBe(
      true,
    )
  })
})
