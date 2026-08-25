import type { InvoiceLogoSnapshot } from '../../src/types/invoice.ts'
import type { InvoiceDefaults } from '../../src/utils/invoiceDefaults.ts'
import type { NumberingConfig } from '../../src/utils/invoiceNumbering.ts'

export type SmtpSecurity = 'none' | 'starttls' | 'ssl'

export type SmtpConfig = {
  host: string
  port: number
  username: string
  security: SmtpSecurity
  fromName: string
  fromEmail: string
  replyTo: string
  subjectTemplate: string
  bodyTemplate: string
}

export type BrandingKind = 'site-wordmark' | 'site-icon' | 'invoice-logo'

export type BrandingAsset = { path: string }

export type BrandingConfig = {
  siteWordmark: BrandingAsset
  siteIcon: BrandingAsset
  invoiceLogo: BrandingAsset
}

export type NumberingRecord = NumberingConfig

export type DefaultsRecord = InvoiceDefaults

export interface SettingsKvStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string | null, updatedAt: string): Promise<void>
}

export interface SequenceStore {
  getNextSequence(): Promise<number>
  setNextSequence(next: number): Promise<void>
  allocateSequence(): Promise<number>
}

export interface ObjectStore {
  put(
    key: string,
    data: ArrayBuffer | Uint8Array,
    contentType: string,
  ): Promise<void>
  get(
    key: string,
  ): Promise<{ body: ArrayBuffer; contentType: string } | null>
}

export type { InvoiceDefaults, NumberingConfig, InvoiceLogoSnapshot }
