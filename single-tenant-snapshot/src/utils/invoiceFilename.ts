const UNSAFE = /[^A-Za-z0-9._-]+/g

export function sanitizeInvoiceFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(UNSAFE, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80)
  return cleaned || 'draft'
}

export function invoicePdfFilename(
  number: string,
  options: { draft?: boolean } = {},
): string {
  const part = sanitizeInvoiceFilenamePart(number)
  return options.draft ? `Invoice-${part}-DRAFT.pdf` : `Invoice-${part}.pdf`
}
