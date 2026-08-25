const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

/** Quantity is stored as an integer with 4 decimal places. 1.5 → 15000 */
export const QUANTITY_SCALE = 10_000

/** Percent is stored as an integer with 2 decimal places. 2.9 → 290 */
export const PERCENT_SCALE = 100

export function divideAndRound(numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new Error('Division by zero')
  }

  const negative = numerator < 0 !== denominator < 0
  const absNumerator = Math.abs(numerator)
  const absDenominator = Math.abs(denominator)
  const quotient = Math.floor(absNumerator / absDenominator)
  const remainder = absNumerator % absDenominator
  const rounded = remainder * 2 >= absDenominator ? quotient + 1 : quotient
  return negative ? -rounded : rounded
}

export function parseDecimalToScaled(
  raw: string,
  fractionDigits: number,
): number | null {
  let trimmed = raw.trim().replace(/,/g, '')
  if (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed === '.' ||
    trimmed === '-.'
  ) {
    return null
  }

  if (trimmed.startsWith('.')) {
    trimmed = `0${trimmed}`
  } else if (trimmed.startsWith('-.')) {
    trimmed = `-0${trimmed.slice(1)}`
  }

  if (trimmed.endsWith('.')) {
    trimmed = trimmed.slice(0, -1)
  }

  if (!DECIMAL_PATTERN.test(trimmed)) {
    return null
  }

  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.')
  const whole = Number.parseInt(wholeRaw || '0', 10)
  if (!Number.isSafeInteger(whole)) {
    return null
  }

  const scale = 10 ** fractionDigits
  let fractionDigitsStr = fractionRaw
  let roundUp = false

  if (fractionDigitsStr.length > fractionDigits) {
    const extra = fractionDigitsStr.slice(fractionDigits)
    fractionDigitsStr = fractionDigitsStr.slice(0, fractionDigits)
    roundUp = extra.charCodeAt(0) >= 53
  } else {
    fractionDigitsStr = fractionDigitsStr.padEnd(fractionDigits, '0')
  }

  const fraction = Number.parseInt(fractionDigitsStr || '0', 10)
  if (!Number.isSafeInteger(fraction)) {
    return null
  }

  let scaled = whole * scale + fraction
  if (roundUp) {
    scaled += 1
  }

  return negative ? -scaled : scaled
}

export function parseMoneyToCents(raw: string): number | null {
  return parseDecimalToScaled(raw, 2)
}

export function parseQuantityScaled(raw: string): number | null {
  return parseDecimalToScaled(raw, 4)
}

export function parsePercentScaled(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return 0
  }
  return parseDecimalToScaled(trimmed, 2)
}

export function scaledToInputString(
  scaled: number,
  fractionDigits: number,
): string {
  const scale = 10 ** fractionDigits
  const negative = scaled < 0
  const absolute = Math.abs(scaled)
  const whole = Math.floor(absolute / scale)
  const fraction = String(absolute % scale)
    .padStart(fractionDigits, '0')
    .replace(/0+$/, '')
  const value = fraction.length > 0 ? `${whole}.${fraction}` : String(whole)
  return negative ? `-${value}` : value
}

export function centsToInputString(cents: number): string {
  const negative = cents < 0
  const absolute = Math.abs(cents)
  const whole = Math.floor(absolute / 100)
  const fraction = String(absolute % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

export function formatMoney(cents: number, currency = 'USD'): string {
  const amount = Number(centsToInputString(cents))
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount)
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }
}

export function percentOfCents(
  cents: number,
  percentScaled: number,
): number {
  return divideAndRound(cents * percentScaled, PERCENT_SCALE * 100)
}

export function lineAmountCents(
  quantityScaled: number,
  unitPriceCents: number,
): number {
  return divideAndRound(quantityScaled * unitPriceCents, QUANTITY_SCALE)
}
