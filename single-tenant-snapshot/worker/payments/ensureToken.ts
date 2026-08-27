import { createEntityId, nowIso } from '../lib/ids.ts'
import {
  decryptPaymentToken,
  encryptPaymentToken,
  generatePaymentToken,
  hashPaymentToken,
  paymentLinkKeyConfigured,
} from './tokenCrypto.ts'
import type { PaymentTokenStore } from './types.ts'

const MISSING_KEY_MESSAGE =
  'PAYMENT_LINK_KEY is not configured. Set the same secret in local .dev.vars and as a Cloudflare Worker secret. Tokens cannot be created or recovered without it.'

export type EnsureTokenResult =
  | { ok: true; rawToken: string; created: boolean }
  | { ok: false; message: string }

export async function ensureActivePaymentToken(
  invoiceId: string,
  deps: {
    tokens: PaymentTokenStore
    paymentLinkKey?: string
    clock?: () => string
    idFactory?: () => string
  },
): Promise<EnsureTokenResult> {
  const existing = await deps.tokens.getActiveByInvoiceId(invoiceId)
  if (existing && paymentLinkKeyConfigured(deps.paymentLinkKey)) {
    const raw = await decryptPaymentToken(
      existing.encryptedToken,
      deps.paymentLinkKey,
    )
    if (raw) {
      return { ok: true, rawToken: raw, created: false }
    }
  }

  if (!paymentLinkKeyConfigured(deps.paymentLinkKey)) {
    return { ok: false, message: MISSING_KEY_MESSAGE }
  }

  const rawToken = generatePaymentToken()
  const tokenHash = await hashPaymentToken(rawToken)
  const encryptedToken = await encryptPaymentToken(rawToken, deps.paymentLinkKey)
  if (
    encryptedToken.startsWith('plain.') ||
    encryptedToken.includes(rawToken)
  ) {
    return {
      ok: false,
      message: 'Refusing to store a plaintext payment token.',
    }
  }

  const clock = deps.clock ?? nowIso
  const idFactory = deps.idFactory ?? createEntityId
  const createdAt = clock()

  if (existing) {
    await deps.tokens.revokeActive(invoiceId, 'regenerated', createdAt)
  }

  await deps.tokens.insert({
    id: idFactory(),
    invoiceId,
    tokenHash,
    encryptedToken,
    createdAt,
    revokedAt: null,
    revokedReason: null,
    status: 'active',
  })

  return { ok: true, rawToken, created: true }
}
