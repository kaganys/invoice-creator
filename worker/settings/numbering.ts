import { asTrimmedString, isRecord } from '../lib/json.ts'
import {
  DEFAULT_NUMBERING,
  formatInvoiceNumber,
  currentUtcYear,
  type NumberingConfig,
} from '../../src/utils/invoiceNumbering.ts'
import type { ValidationResult } from '../invoices/validation.ts'

const PREFIX_PATTERN = /^[A-Za-z0-9_-]{0,20}$/
const SEPARATOR_PATTERN = /^[-_./ ]{0,5}$/

export function parseNumberingJson(raw: string | null): NumberingConfig {
  if (!raw) {
    return { ...DEFAULT_NUMBERING }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return { ...DEFAULT_NUMBERING }
    }
    const padding =
      typeof parsed.padding === 'number' && Number.isInteger(parsed.padding)
        ? parsed.padding
        : DEFAULT_NUMBERING.padding
    const prefix = asTrimmedString(parsed.prefix)
    const separator =
      typeof parsed.separator === 'string'
        ? parsed.separator
        : DEFAULT_NUMBERING.separator
    return {
      prefix: PREFIX_PATTERN.test(prefix) ? prefix : DEFAULT_NUMBERING.prefix,
      includeYear:
        typeof parsed.includeYear === 'boolean'
          ? parsed.includeYear
          : DEFAULT_NUMBERING.includeYear,
      separator: SEPARATOR_PATTERN.test(separator)
        ? separator
        : DEFAULT_NUMBERING.separator,
      padding: padding >= 1 && padding <= 12 ? padding : DEFAULT_NUMBERING.padding,
    }
  } catch {
    return { ...DEFAULT_NUMBERING }
  }
}

export function serializeNumbering(config: NumberingConfig): string {
  return JSON.stringify(config)
}

export function publicNumbering(
  config: NumberingConfig,
  nextSequence: number,
  now: Date = new Date(),
) {
  const year = currentUtcYear(now)
  return {
    prefix: config.prefix,
    includeYear: config.includeYear,
    separator: config.separator,
    padding: config.padding,
    nextSequence,
    example: formatInvoiceNumber(config, nextSequence, year),
  }
}

export function validateNumberingWrite(
  input: unknown,
): ValidationResult<NumberingConfig> {
  if (!isRecord(input)) {
    return { ok: false, message: 'Numbering settings must be a JSON object.' }
  }

  const prefix = asTrimmedString(input.prefix)
  if (!PREFIX_PATTERN.test(prefix)) {
    return {
      ok: false,
      message:
        'Prefix may use letters, numbers, hyphen, or underscore (max 20 characters).',
    }
  }

  if (typeof input.includeYear !== 'boolean') {
    return { ok: false, message: 'includeYear must be true or false.' }
  }

  if (typeof input.separator !== 'string' || !SEPARATOR_PATTERN.test(input.separator)) {
    return {
      ok: false,
      message:
        'Separator must be empty or one of - _ . / space (max 5 characters).',
    }
  }

  let padding: number
  if (typeof input.padding === 'number') {
    padding = input.padding
  } else if (typeof input.padding === 'string' && input.padding.trim()) {
    padding = Number(input.padding)
  } else {
    return { ok: false, message: 'Sequence padding is required.' }
  }
  if (!Number.isInteger(padding) || padding < 1 || padding > 12) {
    return {
      ok: false,
      message: 'Sequence padding must be an integer from 1 to 12.',
    }
  }

  return {
    ok: true,
    value: {
      prefix,
      includeYear: input.includeYear,
      separator: input.separator,
      padding,
    },
  }
}

export function validateNextSequence(input: unknown): ValidationResult<number> {
  if (!isRecord(input) || !('nextSequence' in input)) {
    return { ok: false, message: 'nextSequence is required.' }
  }
  const raw = input.nextSequence
  let value: number
  if (typeof raw === 'number') {
    value = raw
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    if (!/^[0-9]+$/.test(raw.trim())) {
      return {
        ok: false,
        message: 'Next sequence must be a positive whole number.',
      }
    }
    value = Number(raw.trim())
  } else {
    return { ok: false, message: 'Next sequence must be a positive whole number.' }
  }

  if (!Number.isInteger(value) || value < 1 || value > 1_000_000_000) {
    return {
      ok: false,
      message: 'Next sequence must be an integer of at least 1.',
    }
  }

  return { ok: true, value }
}

export { formatInvoiceNumber, currentUtcYear, DEFAULT_NUMBERING }
