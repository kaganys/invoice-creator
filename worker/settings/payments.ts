import { asTrimmedString, isRecord } from '../lib/json.ts'
import type { ValidationResult } from '../invoices/validation.ts'

export type PaymentsConfig = {
  stripeEnabled: boolean
  cardPaymentsEnabled: boolean
  publishableKey: string
  statementDescriptor: string
}

export const DEFAULT_PAYMENTS: PaymentsConfig = {
  stripeEnabled: false,
  cardPaymentsEnabled: false,
  publishableKey: '',
  statementDescriptor: 'BITZ DESIGNS',
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
      publishableKey: asTrimmedString(parsed.publishableKey),
      statementDescriptor:
        asTrimmedString(parsed.statementDescriptor) ||
        DEFAULT_PAYMENTS.statementDescriptor,
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
) {
  return {
    stripeEnabled: config.stripeEnabled,
    cardPaymentsEnabled: config.cardPaymentsEnabled,
    publishableKey: config.publishableKey,
    statementDescriptor: config.statementDescriptor,
    secretConfigured,
  }
}

export function cardPaymentsReady(
  config: PaymentsConfig,
  secretConfigured: boolean,
): boolean {
  return (
    config.stripeEnabled &&
    config.cardPaymentsEnabled &&
    secretConfigured &&
    isPublishableKey(config.publishableKey)
  )
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
  if (publishableKey && !isPublishableKey(publishableKey)) {
    return {
      ok: false,
      message:
        'Publishable key must start with pk_test_ or pk_live_. Never paste a secret key here.',
    }
  }
  if (publishableKey.startsWith('sk_')) {
    return { ok: false, message: 'A Stripe secret key cannot be used as the publishable key.' }
  }
  const statementDescriptor = asTrimmedString(input.statementDescriptor)
  if (statementDescriptor.length > 22) {
    return {
      ok: false,
      message: 'Statement descriptor must be 22 characters or fewer.',
    }
  }
  return {
    ok: true,
    value: {
      stripeEnabled: input.stripeEnabled === true,
      cardPaymentsEnabled: input.cardPaymentsEnabled === true,
      publishableKey,
      statementDescriptor: statementDescriptor || DEFAULT_PAYMENTS.statementDescriptor,
    },
  }
}
