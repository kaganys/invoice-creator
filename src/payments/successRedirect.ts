/** Merchant URL to open after the pay page has confirmed success or processing. */
export function successRedirectTarget(
  raw: string,
  invoiceNumber = '',
): string | null {
  const trimmed = raw.trim()
  if (!trimmed || /[\s]/.test(trimmed)) {
    return null
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') {
    return null
  }
  if (url.username || url.password) {
    return null
  }
  const invoice = invoiceNumber.trim()
  if (invoice) {
    url.searchParams.set('invoice', invoice)
  }
  return url.toString()
}

export function payPageExitUrl(input: {
  successRedirectUrl: string
  invoiceNumber: string
  paid: boolean
  processing: boolean
  failed: boolean
}): string | null {
  if (input.paid) {
    return successRedirectTarget(input.successRedirectUrl, input.invoiceNumber)
  }
  if (input.processing && !input.failed) {
    return successRedirectTarget(input.successRedirectUrl, input.invoiceNumber)
  }
  return null
}
