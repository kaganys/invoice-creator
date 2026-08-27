import { describe, expect, it } from 'vitest'
import { validateNextSequence, validateNumberingWrite } from './numbering.ts'

describe('validateNumberingWrite', () => {
  it('accepts a typical Bitz Designs format', () => {
    const result = validateNumberingWrite({
      prefix: 'BD',
      includeYear: true,
      separator: '-',
      padding: 4,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects padding of zero', () => {
    const result = validateNumberingWrite({
      prefix: 'BD',
      includeYear: true,
      separator: '-',
      padding: 0,
    })
    expect(result.ok).toBe(false)
  })
})

describe('validateNextSequence', () => {
  it('rejects zero, negatives, and non-integers', () => {
    expect(validateNextSequence({ nextSequence: 0 }).ok).toBe(false)
    expect(validateNextSequence({ nextSequence: -3 }).ok).toBe(false)
    expect(validateNextSequence({ nextSequence: 1.4 }).ok).toBe(false)
    expect(validateNextSequence({ nextSequence: 'nope' }).ok).toBe(false)
  })

  it('accepts a positive integer', () => {
    expect(validateNextSequence({ nextSequence: 51 })).toEqual({
      ok: true,
      value: 51,
    })
  })
})
