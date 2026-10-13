import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './cipher.ts'

describe('company secret cipher', () => {
  it('round-trips a secret and does not store it in the clear', async () => {
    const plain = 'sk_test_51example'
    const blob = await encryptSecret(plain, 'tenant-key')
    expect(blob.startsWith('v1.')).toBe(true)
    expect(blob).not.toContain(plain)
    expect(await decryptSecret(blob, 'tenant-key')).toBe(plain)
    expect(await decryptSecret(blob, 'other-key')).toBeNull()
  })
})
