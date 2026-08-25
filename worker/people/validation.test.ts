import { describe, expect, it } from 'vitest'
import {
  resolveDefaultFromId,
  validatePersonWrite,
  validateSettingsWrite,
} from './validation.ts'

describe('validatePersonWrite', () => {
  it('requires a name', () => {
    const result = validatePersonWrite({ name: '   ', email: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/name/i)
    }
  })

  it('rejects an invalid email when one is supplied', () => {
    const result = validatePersonWrite({ name: 'Ada', email: 'not-an-email' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/email/i)
    }
  })

  it('allows a missing email', () => {
    const result = validatePersonWrite({ name: 'Ada' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.email).toBe('')
    }
  })

  it('trims fields and fills missing address parts', () => {
    const result = validatePersonWrite({
      name: '  Ada Lovelace  ',
      email: ' ada@example.com ',
      address: { line1: ' 11 Street ' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        address: {
          line1: '11 Street',
          line2: '',
          city: '',
          region: '',
          postalCode: '',
          country: '',
        },
      })
    }
  })

  it('rejects a non-object body', () => {
    expect(validatePersonWrite('Ada').ok).toBe(false)
  })
})

describe('validateSettingsWrite', () => {
  it('accepts null and empty defaultFromId', () => {
    expect(validateSettingsWrite({ defaultFromId: null })).toEqual({
      ok: true,
      value: { defaultFromId: null },
    })
    expect(validateSettingsWrite({ defaultFromId: '' })).toEqual({
      ok: true,
      value: { defaultFromId: null },
    })
  })

  it('requires defaultFromId to be present', () => {
    const result = validateSettingsWrite({})
    expect(result.ok).toBe(false)
  })
})

describe('resolveDefaultFromId', () => {
  it('returns the stored id when the person still exists', () => {
    expect(resolveDefaultFromId('person-1', true)).toBe('person-1')
  })

  it('clears the default when the person is missing', () => {
    expect(resolveDefaultFromId('person-1', false)).toBeNull()
  })

  it('returns null when no default is stored', () => {
    expect(resolveDefaultFromId(null, true)).toBeNull()
  })
})
