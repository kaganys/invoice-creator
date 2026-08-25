export type NumberingConfig = {
  prefix: string
  includeYear: boolean
  separator: string
  padding: number
}

export const DEFAULT_NUMBERING: NumberingConfig = {
  prefix: 'BD',
  includeYear: true,
  separator: '-',
  padding: 4,
}

/**
 * Format an invoice number from numbering settings.
 *
 * Major components:
 * 1. prefix, with the calendar year appended when includeYear is on
 *    (no extra separator between prefix and year — set prefix to "BD-"
 *    if you want BD-2026-0051)
 * 2. padded sequence
 *
 * The configured separator is inserted between those two components.
 *
 * Sequence is global and never resets by year. The year is display-only.
 */
export function formatInvoiceNumber(
  config: NumberingConfig,
  sequence: number,
  year: number,
): string {
  const pad = Math.min(12, Math.max(1, Math.trunc(config.padding)))
  const padded = String(sequence).padStart(pad, '0')
  const prefix = config.prefix
  const head = config.includeYear ? `${prefix}${year}` : prefix
  if (!head) {
    return padded
  }
  return `${head}${config.separator}${padded}`
}

export function currentUtcYear(now: Date = new Date()): number {
  return now.getUTCFullYear()
}
