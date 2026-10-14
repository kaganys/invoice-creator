import { describe, expect, it } from 'vitest'
import {
  STRIPE_SECRET_KEY_MESSAGE,
  isStripeSecretKey,
  stripeSecretKeyError,
} from './stripeKey.ts'

describe('stripe secret key', () => {
  it('accepts standard and restricted test and live keys', () => {
    expect(isStripeSecretKey('sk_test_51abc')).toBe(true)
    expect(isStripeSecretKey('sk_live_51abc')).toBe(true)
    expect(isStripeSecretKey('rk_test_51restricted')).toBe(true)
    expect(isStripeSecretKey('rk_live_51restricted')).toBe(true)
    expect(isStripeSecretKey('  rk_live_51restricted  ')).toBe(true)
  })

  it('rejects publishable keys, webhook secrets, and other prefixes', () => {
    expect(isStripeSecretKey('')).toBe(false)
    expect(isStripeSecretKey('sk_')).toBe(false)
    expect(isStripeSecretKey('rk_')).toBe(false)
    expect(isStripeSecretKey('sk_live_')).toBe(false)
    expect(isStripeSecretKey('pk_live_51abc')).toBe(false)
    expect(isStripeSecretKey('pk_test_51abc')).toBe(false)
    expect(isStripeSecretKey('whsec_abc')).toBe(false)
    expect(isStripeSecretKey('rk_live_has space')).toBe(false)
  })

  it('returns the shared error only when a key was pasted', () => {
    expect(stripeSecretKeyError('')).toBeNull()
    expect(stripeSecretKeyError('   ')).toBeNull()
    expect(stripeSecretKeyError('rk_test_51restricted')).toBeNull()
    expect(stripeSecretKeyError('pk_live_51abc')).toBe(STRIPE_SECRET_KEY_MESSAGE)
  })
})
