import { ensureActivePaymentToken } from './ensureToken.ts'
import { decryptPaymentToken, paymentPageUrl } from './tokenCrypto.ts'
import type { PaymentTokenStore } from './types.ts'

export type CustomerPaymentUrlDeps = {
  tokens: PaymentTokenStore
  paymentLinkKey?: string
  baseUrl: string
}

export type EnsureCustomerPaymentUrlDeps = CustomerPaymentUrlDeps & {
  clock?: () => string
  idFactory?: () => string
}

export async function recoverCustomerPaymentUrl(
  invoiceId: string,
  deps: CustomerPaymentUrlDeps,
): Promise<string | null> {
  const active = await deps.tokens.getActiveByInvoiceId(invoiceId)
  if (!active) {
    return null
  }
  const raw = await decryptPaymentToken(active.encryptedToken, deps.paymentLinkKey)
  return raw ? paymentPageUrl(deps.baseUrl, raw) : null
}

export type EnsureCustomerPaymentUrlResult =
  | { ok: true; url: string; created: boolean }
  | { ok: false; message: string }

export async function ensureCustomerPaymentUrl(
  invoiceId: string,
  deps: EnsureCustomerPaymentUrlDeps,
): Promise<EnsureCustomerPaymentUrlResult> {
  const ensured = await ensureActivePaymentToken(invoiceId, deps)
  if (!ensured.ok) {
    return ensured
  }
  return {
    ok: true,
    url: paymentPageUrl(deps.baseUrl, ensured.rawToken),
    created: ensured.created,
  }
}
