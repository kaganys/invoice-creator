import type { BrandingKind } from '../branding.ts'
import type { InvoiceFormat } from '../invoice/format.ts'

export type { BrandingKind }

export const SETTINGS_CATEGORIES = [
  { id: 'defaults', label: 'Defaults' },
  { id: 'email', label: 'Email / SMTP' },
  { id: 'payments', label: 'Payments' },
  { id: 'branding', label: 'Branding' },
  { id: 'numbering', label: 'Invoice Numbering' },
  { id: 'format', label: 'Format' },
] as const

export type SettingsCategoryId = (typeof SETTINGS_CATEGORIES)[number]['id']

export type InvoiceDefaultsPayload = {
  defaultFromId: string | null
  zelleEmail: string
  cardFeePercent: string
  cardFeeFixed: string
  currency: string
  paymentMemo: string
  dueDays: number
  notes: string
  country: string
}

export type NumberingSettingsPayload = {
  prefix: string
  includeYear: boolean
  separator: string
  padding: number
  nextSequence: number
  example: string
}

export type SmtpSecurity = 'none' | 'starttls' | 'ssl'

export type SmtpSettingsPayload = {
  host: string
  port: number
  username: string
  security: SmtpSecurity
  fromName: string
  fromEmail: string
  replyTo: string
  subjectTemplate: string
  bodyTemplate: string
  passwordConfigured: boolean
}

export type BrandingAssetPayload = {
  kind: BrandingKind
  path: string
  url: string
  isDefault: boolean
}

export type BrandingSettingsPayload = {
  siteWordmark: BrandingAssetPayload
  siteIcon: BrandingAssetPayload
  invoiceLogo: BrandingAssetPayload
}

export type PaymentsSettingsPayload = {
  stripeEnabled: boolean
  cardPaymentsEnabled: boolean
  achPaymentsEnabled: boolean
  publishableKey: string
  statementDescriptor: string
  secretConfigured: boolean
}

export type AppSettingsPayload = {
  defaultFromId: string | null
  defaults: InvoiceDefaultsPayload
  numbering: NumberingSettingsPayload
  branding: BrandingSettingsPayload
  smtp: SmtpSettingsPayload
  format: InvoiceFormat
  payments: PaymentsSettingsPayload
}
