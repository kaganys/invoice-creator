import {
  defaultInvoiceFormat,
  validateInvoiceFormat,
  type InvoiceFormat,
} from '../../src/invoice/format.ts'

export function parseFormatJson(raw: string | null): InvoiceFormat {
  if (!raw) {
    return defaultInvoiceFormat()
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = validateInvoiceFormat(parsed)
    return result.ok ? result.value : defaultInvoiceFormat()
  } catch {
    return defaultInvoiceFormat()
  }
}

export function serializeFormat(format: InvoiceFormat): string {
  return JSON.stringify(format)
}

export function publicFormat(format: InvoiceFormat): InvoiceFormat {
  return format
}
