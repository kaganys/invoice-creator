import { defaultInvoiceFormat } from '../../src/invoice/format.ts'
import { BUILTIN_INVOICE_DEFAULTS } from '../../src/utils/invoiceDefaults.ts'
import { DEFAULT_NUMBERING } from '../../src/utils/invoiceNumbering.ts'
import { BUILTIN_BRANDING, serializeBranding } from '../settings/branding.ts'
import { serializeDefaults } from '../settings/defaults.ts'
import { serializeFormat } from '../settings/format.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import { serializeNumbering } from '../settings/numbering.ts'
import { DEFAULT_PAYMENTS, serializePayments } from '../settings/payments.ts'
import { DEFAULT_SMTP, serializeSmtp } from '../settings/smtp.ts'
import type { SequenceStore, SettingsKvStore } from '../settings/types.ts'
import type { CompanyRecord } from './types.ts'

export function statementDescriptorFromName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9 .]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
  return (cleaned || 'INVOICE').slice(0, 22)
}

export function numberingPrefixFromName(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)
  return letters || 'INV'
}

export async function seedCompanyWorkspace(input: {
  settings: SettingsKvStore
  sequences: SequenceStore
  company: Pick<CompanyRecord, 'id' | 'name'>
  timestamp: string
  extras?: {
    fromName?: string
    fromEmail?: string
    zelleEmail?: string
  }
}): Promise<void> {
  const { settings, sequences, company, timestamp, extras } = input
  await sequences.setNextSequence(1)
  await settings.set(
    SETTINGS_KEYS.branding,
    serializeBranding({
      siteWordmark: { ...BUILTIN_BRANDING.siteWordmark },
      siteIcon: { ...BUILTIN_BRANDING.siteIcon },
      invoiceLogo: { ...BUILTIN_BRANDING.invoiceLogo },
    }),
    timestamp,
  )
  await settings.set(
    SETTINGS_KEYS.smtp,
    serializeSmtp({
      ...DEFAULT_SMTP,
      fromName: extras?.fromName?.trim() || '',
      fromEmail: extras?.fromEmail?.trim() || '',
    }),
    timestamp,
  )
  await settings.set(
    SETTINGS_KEYS.payments,
    serializePayments({
      ...DEFAULT_PAYMENTS,
      stripeEnabled: false,
      cardPaymentsEnabled: false,
      achPaymentsEnabled: false,
      publishableKey: '',
      statementDescriptor: statementDescriptorFromName(company.name),
    }),
    timestamp,
  )
  await settings.set(
    SETTINGS_KEYS.numbering,
    serializeNumbering({
      ...DEFAULT_NUMBERING,
      prefix: numberingPrefixFromName(company.name),
    }),
    timestamp,
  )
  await settings.set(
    SETTINGS_KEYS.format,
    serializeFormat(defaultInvoiceFormat()),
    timestamp,
  )
  await settings.set(
    SETTINGS_KEYS.defaults,
    serializeDefaults({
      ...BUILTIN_INVOICE_DEFAULTS,
      zelleEmail: extras?.zelleEmail?.trim() || '',
      paymentMemo: 'Please submit payment using the secure payment link.',
    }),
    timestamp,
  )
}
