import { successRedirectTarget } from '../../src/payments/successRedirect.ts'
import { isStripeSecretKey } from '../../src/payments/stripeKey.ts'
import { asTrimmedString, isRecord } from '../lib/json.ts'
import type { ValidationResult } from '../invoices/validation.ts'

export type PaymentsConfig = {
  stripeEnabled: boolean
  cardPaymentsEnabled: boolean
  achPaymentsEnabled: boolean
  publishableKey: string
  statementDescriptor: string
  successRedirectUrl: string
}

export const DEFAULT_PAYMENTS: PaymentsConfig = {
  stripeEnabled: false,
  cardPaymentsEnabled: false,
  achPaymentsEnabled: false,
  publishableKey: '',
  statementDescriptor: 'BITZ DESIGNS',
  successRedirectUrl: '',
}

function storedSuccessRedirect(raw: unknown): string {
  const value = asTrimmedString(raw)
  if (!value) {
    return ''
  }
  return successRedirectTarget(value) ?? ''
}

export function parsePaymentsJson(raw: string | null): PaymentsConfig {
  if (!raw) {
    return { ...DEFAULT_PAYMENTS }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return { ...DEFAULT_PAYMENTS }
    }
    return {
      stripeEnabled: parsed.stripeEnabled === true,
      cardPaymentsEnabled: parsed.cardPaymentsEnabled === true,
      achPaymentsEnabled: parsed.achPaymentsEnabled === true,
      publishableKey: asTrimmedString(parsed.publishableKey),
      statementDescriptor:
        asTrimmedString(parsed.statementDescriptor) ||
        DEFAULT_PAYMENTS.statementDescriptor,
      successRedirectUrl: storedSuccessRedirect(parsed.successRedirectUrl),
    }
  } catch {
    return { ...DEFAULT_PAYMENTS }
  }
}

export function serializePayments(config: PaymentsConfig): string {
  return JSON.stringify(config)
}

export function publicPayments(
  config: PaymentsConfig,
  secretConfigured: boolean,
  extra: {
    webhookSecretConfigured?: boolean
    secretSource?: 'company' | 'platform' | 'none'
  } = {},
) {
  return {
    stripeEnabled: config.stripeEnabled,
    cardPaymentsEnabled: config.cardPaymentsEnabled,
    achPaymentsEnabled: config.achPaymentsEnabled,
    publishableKey: config.publishableKey,
    statementDescriptor: config.statementDescriptor,
    successRedirectUrl: config.successRedirectUrl,
    secretConfigured,
    webhookSecretConfigured: extra.webhookSecretConfigured ?? false,
    secretSource: extra.secretSource ?? (secretConfigured ? 'platform' : 'none'),
  }
}

export function stripeConfigured(
  config: PaymentsConfig,
  secretConfigured: boolean,
): boolean {
  return (
    config.stripeEnabled &&
    secretConfigured &&
    isPublishableKey(config.publishableKey)
  )
}

export function cardPaymentsReady(
  config: PaymentsConfig,
  secretConfigured: boolean,
): boolean {
  return stripeConfigured(config, secretConfigured) && config.cardPaymentsEnabled
}

export function achPaymentsReady(
  config: PaymentsConfig,
  secretConfigured: boolean,
): boolean {
  return stripeConfigured(config, secretConfigured) && config.achPaymentsEnabled
}

export function anyStripePaymentReady(
  config: PaymentsConfig,
  secretConfigured: boolean,
): boolean {
  return (
    cardPaymentsReady(config, secretConfigured) ||
    achPaymentsReady(config, secretConfigured)
  )
}

export function publicPaymentMethodTypes(
  config: PaymentsConfig,
  secretConfigured: boolean,
): string[] {
  const types: string[] = []
  if (cardPaymentsReady(config, secretConfigured)) {
    types.push('card')
  }
  if (achPaymentsReady(config, secretConfigured)) {
    types.push('us_bank_account')
  }
  return types
}

export function isPublishableKey(value: string): boolean {
  return /^(pk_test_|pk_live_)[A-Za-z0-9_]+$/.test(value)
}

export function validatePaymentsWrite(
  input: unknown,
): ValidationResult<PaymentsConfig> {
  if (!isRecord(input)) {
    return { ok: false, message: 'Payments settings must be a JSON object.' }
  }
  if ('secretKey' in input || 'stripeSecretKey' in input || 'webhookSecret' in input) {
    return {
      ok: false,
      message:
        'Stripe secret keys cannot be sent or stored through this API. Set STRIPE_SECRET_KEY with Wrangler.',
    }
  }
  const publishableKey = asTrimmedString(input.publishableKey)
  if (isStripeSecretKey(publishableKey)) {
    return { ok: false, message: 'A Stripe secret key cannot be used as the publishable key.' }
  }
  if (publishableKey && !isPublishableKey(publishableKey)) {
    return {
      ok: false,
      message:
        'Publishable key must start with pk_test_ or pk_live_. Never paste a secret key here.',
    }
  }
  const statementDescriptor = asTrimmedString(input.statementDescriptor)
  if (statementDescriptor.length > 22) {
    return {
      ok: false,
      message: 'Statement descriptor must be 22 characters or fewer.',
    }
  }
  const successRedirectRaw = asTrimmedString(input.successRedirectUrl)
  if (successRedirectRaw && !successRedirectTarget(successRedirectRaw)) {
    return {
      ok: false,
      message: 'Redirect after successful payment must be an https URL.',
    }
  }
  return {
    ok: true,
    value: {
      stripeEnabled: input.stripeEnabled === true,
      cardPaymentsEnabled: input.cardPaymentsEnabled === true,
      achPaymentsEnabled: input.achPaymentsEnabled === true,
      publishableKey,
      statementDescriptor: statementDescriptor || DEFAULT_PAYMENTS.statementDescriptor,
      successRedirectUrl: successRedirectRaw
        ? (successRedirectTarget(successRedirectRaw) ?? '')
        : '',
    },
  }
}
