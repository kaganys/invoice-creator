import { describe, expect, it } from 'vitest'
import {
  adminDisplayPaymentBaseUrl,
  decryptPaymentToken,
  encryptPaymentToken,
  generatePaymentToken,
  hashPaymentToken,
  isWellFormedPaymentToken,
  parsePublicPaymentBaseUrl,
  paymentPageUrl,
} from './tokenCrypto.ts'

describe('payment token crypto', () => {
  it('generates a URL-safe 256-bit token', async () => {
    const token = generatePaymentToken()
    expect(isWellFormedPaymentToken(token)).toBe(true)
    expect(token).toHaveLength(43)
    expect(token).not.toMatch(/[+/=]/)
    const another = generatePaymentToken()
    expect(another).not.toBe(token)
    expect(token).not.toBe('BD2026-0051')
  })

  it('hashes the same token consistently for lookup', async () => {
    const token = generatePaymentToken()
    const first = await hashPaymentToken(token)
    const second = await hashPaymentToken(token)
    expect(first).toBe(second)
    expect(first).toHaveLength(64)
    expect(first).not.toBe(token)
  })

  it('round-trips AES-GCM encryption when a key is configured', async () => {
    const token = generatePaymentToken()
    const blob = await encryptPaymentToken(token, 'test-payment-link-key')
    expect(blob.startsWith('v1.')).toBe(true)
    expect(blob.startsWith('plain.')).toBe(false)
    expect(blob).not.toContain(token)
    const raw = await decryptPaymentToken(blob, 'test-payment-link-key')
    expect(raw).toBe(token)
  })

  it('refuses to encrypt without PAYMENT_LINK_KEY and ignores plaintext blobs', async () => {
    const token = generatePaymentToken()
    await expect(encryptPaymentToken(token, '')).rejects.toThrow(/PAYMENT_LINK_KEY/)
    expect(await decryptPaymentToken(`plain.${token}`, undefined)).toBeNull()
    expect(await decryptPaymentToken(`plain.${token}`, 'test-payment-link-key')).toBeNull()
  })

  it('builds payment URLs from an explicit public base', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
    expect(isWellFormedPaymentToken(token)).toBe(true)
    expect(parsePublicPaymentBaseUrl('https://pay.bitzdesigns.co/')).toEqual({
      ok: true,
      value: 'https://pay.bitzdesigns.co',
    })
    expect(paymentPageUrl('https://pay.bitzdesigns.co', token)).toBe(
      `https://pay.bitzdesigns.co/i/${token}`,
    )
  })

  it('does not fall back to localhost for customer-facing URLs', () => {
    const missing = parsePublicPaymentBaseUrl('')
    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.code).toBe('missing')
    }
    expect(adminDisplayPaymentBaseUrl('', 'http://localhost:5173')).toBe(
      'http://localhost:5173',
    )
  })

  it('rejects a malformed public payment base URL', () => {
    const notUrl = parsePublicPaymentBaseUrl('pay.bitzdesigns.co')
    expect(notUrl.ok).toBe(false)
    const ftp = parsePublicPaymentBaseUrl('ftp://pay.bitzdesigns.co')
    expect(ftp.ok).toBe(false)
    const httpProd = parsePublicPaymentBaseUrl('http://pay.bitzdesigns.co')
    expect(httpProd.ok).toBe(false)
    const local = parsePublicPaymentBaseUrl('http://localhost:5173')
    expect(local).toEqual({ ok: true, value: 'http://localhost:5173' })
  })
})
