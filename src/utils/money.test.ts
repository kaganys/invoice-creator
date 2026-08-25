import { describe, expect, it } from 'vitest'
import {
  centsToInputString,
  divideAndRound,
  formatMoney,
  lineAmountCents,
  parseMoneyToCents,
  parsePercentScaled,
  parseQuantityScaled,
  percentOfCents,
  QUANTITY_SCALE,
  scaledToInputString,
} from './money.ts'

describe('parseMoneyToCents', () => {
  it('parses whole dollars', () => {
    expect(parseMoneyToCents('50')).toBe(5000)
  })

  it('parses two decimal places', () => {
    expect(parseMoneyToCents('50.00')).toBe(5000)
    expect(parseMoneyToCents('50.16')).toBe(5016)
  })

  it('parses one decimal place', () => {
    expect(parseMoneyToCents('50.1')).toBe(5010)
  })

  it('rounds extra fractional digits instead of producing 49.999999', () => {
    expect(parseMoneyToCents('49.999')).toBe(5000)
    expect(parseMoneyToCents('0.015')).toBe(2)
  })

  it('parses cents without floating-point residue', () => {
    expect(parseMoneyToCents('0.10')).toBe(10)
    expect(parseMoneyToCents('0.20')).toBe(20)
    expect(parseMoneyToCents('0.10')! + parseMoneyToCents('0.20')!).toBe(30)
  })

  it('returns null for invalid input', () => {
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents('abc')).toBeNull()
    expect(parseMoneyToCents('12.3.4')).toBeNull()
  })
})

describe('quantity and line amounts', () => {
  it('stores quantity with a 4-decimal integer scale', () => {
    expect(parseQuantityScaled('1')).toBe(QUANTITY_SCALE)
    expect(parseQuantityScaled('1.5')).toBe(15_000)
  })

  it('multiplies quantity by unit price in cents', () => {
    expect(lineAmountCents(QUANTITY_SCALE, 5000)).toBe(5000)
    expect(lineAmountCents(2 * QUANTITY_SCALE, 2500)).toBe(5000)
    expect(lineAmountCents(15_000, 1000)).toBe(1500)
  })

  it('rounds fractional cent line amounts', () => {
    expect(lineAmountCents(3 * QUANTITY_SCALE, 1667)).toBe(5001)
  })
})

describe('percentOfCents', () => {
  it('calculates a whole-percent fee', () => {
    expect(percentOfCents(5000, parsePercentScaled('3')!)).toBe(150)
  })

  it('calculates a fractional percent fee', () => {
    expect(percentOfCents(5000, parsePercentScaled('2.9')!)).toBe(145)
  })
})

describe('formatting', () => {
  it('formats USD with two decimal places', () => {
    expect(formatMoney(5000, 'USD')).toBe('$50.00')
    expect(formatMoney(1, 'USD')).toBe('$0.01')
  })

  it('converts cents back to an input string without float noise', () => {
    expect(centsToInputString(5000)).toBe('50.00')
    expect(centsToInputString(1)).toBe('0.01')
  })

  it('converts scaled integers back to compact decimal strings', () => {
    expect(scaledToInputString(10_000, 4)).toBe('1')
    expect(scaledToInputString(15_000, 4)).toBe('1.5')
    expect(scaledToInputString(300, 2)).toBe('3')
  })
})

describe('divideAndRound', () => {
  it('rounds halves away from zero using integer math', () => {
    expect(divideAndRound(1, 2)).toBe(1)
    expect(divideAndRound(1, 3)).toBe(0)
  })
})
