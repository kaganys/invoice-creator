import type { BrandingKind } from '../branding.ts'
import type { InvoiceFormat } from '../invoice/format.ts'
import type {
  AppSettingsPayload,
  BrandingSettingsPayload,
  InvoiceDefaultsPayload,
  NumberingSettingsPayload,
  PaymentsSettingsPayload,
  SmtpSettingsPayload,
} from '../types/settings.ts'
import { ApiError, apiRequest } from './http.ts'

export async function fetchAppSettings(): Promise<AppSettingsPayload> {
  return apiRequest<AppSettingsPayload>('/api/settings')
}

export async function updateDefaults(
  defaults: InvoiceDefaultsPayload,
): Promise<{ defaultFromId: string | null; defaults: InvoiceDefaultsPayload }> {
  return apiRequest('/api/settings/defaults', {
    method: 'PUT',
    body: JSON.stringify(defaults),
  })
}

export async function updateNumbering(
  numbering: Pick<
    NumberingSettingsPayload,
    'prefix' | 'includeYear' | 'separator' | 'padding'
  >,
): Promise<{ numbering: NumberingSettingsPayload }> {
  return apiRequest('/api/settings/numbering', {
    method: 'PUT',
    body: JSON.stringify(numbering),
  })
}

export async function changeNextSequence(
  nextSequence: number,
): Promise<{ numbering: NumberingSettingsPayload }> {
  return apiRequest('/api/settings/numbering/next', {
    method: 'POST',
    body: JSON.stringify({ nextSequence }),
  })
}

export async function allocateInvoiceNumber(): Promise<{
  number: string
  sequence: number
}> {
  return apiRequest('/api/invoices/allocate-number', { method: 'POST' })
}

export async function updateSmtp(
  smtp: Omit<SmtpSettingsPayload, 'passwordConfigured' | 'passwordSource'> & {
    password?: string
    clearPassword?: boolean
  },
): Promise<{ smtp: SmtpSettingsPayload }> {
  return apiRequest('/api/settings/smtp', {
    method: 'PUT',
    body: JSON.stringify(smtp),
  })
}

export async function testSmtp(to: string): Promise<{ message: string; to: string }> {
  return apiRequest('/api/settings/smtp/test', {
    method: 'POST',
    body: JSON.stringify({ to }),
  })
}

export async function updatePayments(
  payments: Omit<
    PaymentsSettingsPayload,
    'secretConfigured' | 'webhookSecretConfigured' | 'secretSource'
  > & {
    secretKey?: string
    webhookSecret?: string
    clearSecret?: boolean
    clearWebhookSecret?: boolean
  },
): Promise<{ payments: PaymentsSettingsPayload }> {
  return apiRequest('/api/settings/payments', {
    method: 'PUT',
    body: JSON.stringify(payments),
  })
}

export async function updateFormat(
  format: InvoiceFormat,
): Promise<{ format: InvoiceFormat }> {
  return apiRequest('/api/settings/format', {
    method: 'PUT',
    body: JSON.stringify(format),
  })
}

async function readError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string' &&
      payload.error.trim()
    ) {
      return payload.error
    }
  } catch {
    // Fall through.
  }
  return response.statusText || `Request failed (${response.status})`
}

export async function uploadBrandingAsset(
  kind: BrandingKind,
  file: File,
): Promise<{ branding: BrandingSettingsPayload }> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`/api/settings/branding/${kind}`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    throw new ApiError(await readError(response), response.status)
  }
  return (await response.json()) as { branding: BrandingSettingsPayload }
}

export async function restoreBrandingAsset(
  kind: BrandingKind,
): Promise<{ branding: BrandingSettingsPayload }> {
  return apiRequest(`/api/settings/branding/${kind}/restore`, {
    method: 'POST',
  })
}
