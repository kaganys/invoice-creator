import { errorJson, json } from '../http.ts'
import { isUuid, nowIso } from '../lib/ids.ts'
import type { InvoiceStore } from '../invoices/types.ts'
import { ensureActivePaymentToken } from './ensureToken.ts'
import { paymentPageUrl } from './tokenCrypto.ts'
import { recoverCustomerPaymentUrl } from './paymentUrl.ts'
import type { PaymentTokenStore } from './types.ts'

export type PaymentLinkAdminDeps = {
  invoices: InvoiceStore
  tokens: PaymentTokenStore
  paymentLinkKey?: string
  baseUrl: string
  clock?: () => string
  idFactory?: () => string
}

export async function getActivePaymentLink(
  invoiceId: string,
  deps: Pick<PaymentLinkAdminDeps, 'tokens' | 'paymentLinkKey' | 'baseUrl'>,
): Promise<{
  createdAt: string
  status: 'active'
  url: string | null
} | null> {
  const active = await deps.tokens.getActiveByInvoiceId(invoiceId)
  if (!active) {
    return null
  }
  const url = await recoverCustomerPaymentUrl(invoiceId, deps)
  return {
    createdAt: active.createdAt,
    status: 'active',
    url,
  }
}

export async function getInvoicePaymentLink(
  invoiceId: string,
  deps: PaymentLinkAdminDeps,
): Promise<Response> {
  if (!isUuid(invoiceId)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const invoice = await deps.invoices.get(invoiceId)
  if (!invoice) {
    return errorJson('Invoice not found.', 404)
  }
  const active = await getActivePaymentLink(invoiceId, deps)
  if (!active) {
    return json({
      paymentLink: null,
    })
  }
  return json({
    paymentLink: active,
  })
}

export async function regenerateInvoicePaymentLink(
  invoiceId: string,
  deps: PaymentLinkAdminDeps,
): Promise<Response> {
  if (!isUuid(invoiceId)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const invoice = await deps.invoices.get(invoiceId)
  if (!invoice) {
    return errorJson('Invoice not found.', 404)
  }
  if (invoice.status === 'void' || invoice.status === 'paid') {
    return errorJson(
      `A ${invoice.status} invoice cannot receive a new payment link.`,
      409,
    )
  }
  const clock = deps.clock ?? nowIso
  await deps.tokens.revokeActive(invoiceId, 'regenerated', clock())
  const ensured = await ensureActivePaymentToken(invoiceId, deps)
  if (!ensured.ok) {
    return errorJson(ensured.message, 400)
  }
  return json({
    paymentLink: {
      url: paymentPageUrl(deps.baseUrl, ensured.rawToken),
      createdAt: clock(),
      status: 'active' as const,
    },
  })
}

export async function revokeInvoicePaymentLink(
  invoiceId: string,
  deps: PaymentLinkAdminDeps,
): Promise<Response> {
  if (!isUuid(invoiceId)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const invoice = await deps.invoices.get(invoiceId)
  if (!invoice) {
    return errorJson('Invoice not found.', 404)
  }
  const clock = deps.clock ?? nowIso
  await deps.tokens.revokeActive(invoiceId, 'manual', clock())
  return json({ paymentLink: null, revoked: true })
}
