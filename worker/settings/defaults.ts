import { asTrimmedString, isRecord } from '../lib/json.ts'
import { parseMoneyToCents, parsePercentScaled } from '../../src/utils/money.ts'
import {
  BUILTIN_INVOICE_DEFAULTS,
  type InvoiceDefaults,
} from '../../src/utils/invoiceDefaults.ts'
import type { ValidationResult } from '../invoices/validation.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/

export function parseDefaultsJson(raw: string | null): InvoiceDefaults {
  if (!raw) {
    return { ...BUILTIN_INVOICE_DEFAULTS }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return { ...BUILTIN_INVOICE_DEFAULTS }
    }
    const dueDaysRaw = parsed.dueDays
    const dueDays =
      typeof dueDaysRaw === 'number' && Number.isInteger(dueDaysRaw)
        ? dueDaysRaw
        : BUILTIN_INVOICE_DEFAULTS.dueDays
    const percent =
      typeof parsed.cardFeePercentScaled === 'number'
        ? parsed.cardFeePercentScaled
        : BUILTIN_INVOICE_DEFAULTS.cardFeePercentScaled
    const fixed =
      typeof parsed.cardFeeFixedCents === 'number'
        ? parsed.cardFeeFixedCents
        : BUILTIN_INVOICE_DEFAULTS.cardFeeFixedCents
    const currency = asTrimmedString(parsed.currency).toUpperCase()
    return {
      defaultFromId: BUILTIN_INVOICE_DEFAULTS.defaultFromId,
      zelleEmail:
        typeof parsed.zelleEmail === 'string'
          ? asTrimmedString(parsed.zelleEmail)
          : BUILTIN_INVOICE_DEFAULTS.zelleEmail,
      cardFeePercentScaled: percent >= 0 ? percent : 0,
      cardFeeFixedCents: fixed >= 0 ? fixed : 0,
      currency: CURRENCY_PATTERN.test(currency)
        ? currency
        : BUILTIN_INVOICE_DEFAULTS.currency,
      paymentMemo:
        typeof parsed.paymentMemo === 'string' && parsed.paymentMemo.trim()
          ? parsed.paymentMemo
          : BUILTIN_INVOICE_DEFAULTS.paymentMemo,
      dueDays: dueDays >= 0 && dueDays <= 3650 ? dueDays : BUILTIN_INVOICE_DEFAULTS.dueDays,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      country: asTrimmedString(parsed.country),
    }
  } catch {
    return { ...BUILTIN_INVOICE_DEFAULTS }
  }
}

export function serializeDefaults(defaults: InvoiceDefaults): string {
  return JSON.stringify({
    zelleEmail: defaults.zelleEmail,
    cardFeePercentScaled: defaults.cardFeePercentScaled,
    cardFeeFixedCents: defaults.cardFeeFixedCents,
    currency: defaults.currency,
    paymentMemo: defaults.paymentMemo,
    dueDays: defaults.dueDays,
    notes: defaults.notes,
    country: defaults.country,
  })
}

function percentInput(scaled: number): string {
  if (scaled === 0) {
    return ''
  }
  const whole = Math.trunc(scaled / 100)
  const frac = Math.abs(scaled % 100)
  if (frac === 0) {
    return String(whole)
  }
  return `${whole}.${String(frac).padStart(2, '0').replace(/0+$/, '')}`
}

function centsInput(cents: number): string {
  if (cents === 0) {
    return ''
  }
  const whole = Math.trunc(cents / 100)
  const frac = Math.abs(cents % 100)
  return `${whole}.${String(frac).padStart(2, '0')}`
}

export function publicDefaultsForApi(defaults: InvoiceDefaults) {
  return {
    defaultFromId: defaults.defaultFromId,
    zelleEmail: defaults.zelleEmail,
    cardFeePercent: percentInput(defaults.cardFeePercentScaled),
    cardFeeFixed: centsInput(defaults.cardFeeFixedCents),
    currency: defaults.currency,
    paymentMemo: defaults.paymentMemo,
    dueDays: defaults.dueDays,
    notes: defaults.notes,
    country: defaults.country,
  }
}

export function validateDefaultsWrite(
  input: unknown,
): ValidationResult<InvoiceDefaults> {
  if (!isRecord(input)) {
    return { ok: false, message: 'Defaults must be a JSON object.' }
  }

  let defaultFromId: string | null = null
  if ('defaultFromId' in input) {
    const raw = input.defaultFromId
    if (raw === null || raw === '') {
      defaultFromId = null
    } else if (typeof raw !== 'string') {
      return { ok: false, message: 'defaultFromId must be a string or null.' }
    } else {
      defaultFromId = raw.trim() || null
    }
  }

  const zelleEmail = asTrimmedString(input.zelleEmail)
  if (zelleEmail && !EMAIL_PATTERN.test(zelleEmail)) {
    return { ok: false, message: 'Default Zelle/payment email is not valid.' }
  }

  const cardFeePercentScaled = parsePercentScaled(
    typeof input.cardFeePercent === 'string' ? input.cardFeePercent : '',
  )
  if (cardFeePercentScaled === null || cardFeePercentScaled < 0) {
    return { ok: false, message: 'Default credit-card fee percentage is invalid.' }
  }
  if (cardFeePercentScaled > 10000) {
    return {
      ok: false,
      message: 'Default credit-card fee percentage cannot exceed 100.',
    }
  }

  const fixedRaw = asTrimmedString(input.cardFeeFixed)
  const cardFeeFixedCents = fixedRaw === '' ? 0 : parseMoneyToCents(fixedRaw)
  if (cardFeeFixedCents === null || cardFeeFixedCents < 0) {
    return { ok: false, message: 'Default fixed credit-card fee is invalid.' }
  }

  const currency = asTrimmedString(input.currency).toUpperCase() || 'USD'
  if (!CURRENCY_PATTERN.test(currency)) {
    return { ok: false, message: 'Default currency must be a 3-letter code.' }
  }

  let dueDays = BUILTIN_INVOICE_DEFAULTS.dueDays
  if ('dueDays' in input) {
    if (typeof input.dueDays === 'string' && input.dueDays.trim() !== '') {
      const parsed = Number(input.dueDays)
      if (!Number.isInteger(parsed)) {
        return { ok: false, message: 'Default due period must be a whole number of days.' }
      }
      dueDays = parsed
    } else if (typeof input.dueDays === 'number') {
      if (!Number.isInteger(input.dueDays)) {
        return { ok: false, message: 'Default due period must be a whole number of days.' }
      }
      dueDays = input.dueDays
    } else if (input.dueDays === null || input.dueDays === '') {
      dueDays = 0
    } else {
      return { ok: false, message: 'Default due period must be a whole number of days.' }
    }
  }
  if (dueDays < 0 || dueDays > 3650) {
    return { ok: false, message: 'Default due period must be between 0 and 3650 days.' }
  }

  const paymentMemoRaw =
    typeof input.paymentMemo === 'string' ? input.paymentMemo : ''
  const paymentMemo = paymentMemoRaw.trim()
    ? paymentMemoRaw
    : BUILTIN_INVOICE_DEFAULTS.paymentMemo
  const notes = typeof input.notes === 'string' ? input.notes : ''

  return {
    ok: true,
    value: {
      defaultFromId,
      zelleEmail: zelleEmail || BUILTIN_INVOICE_DEFAULTS.zelleEmail,
      cardFeePercentScaled,
      cardFeeFixedCents,
      currency,
      paymentMemo,
      dueDays,
      notes,
      country: asTrimmedString(input.country),
    },
  }
}
