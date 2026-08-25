import { errorJson, json } from '../http.ts'
import { createEntityId, nowIso } from '../lib/ids.ts'
import { isRecord } from '../lib/json.ts'
import type { InvoiceStore } from '../invoices/types.ts'
import { cardPaymentsReady, type PaymentsConfig } from '../settings/payments.ts'
import { calculateCardCharge, stripeCurrencyError } from './cardAmount.ts'
import { hashPaymentToken, isWellFormedPaymentToken } from './tokenCrypto.ts'
import type { StripeGateway } from './stripeClient.ts'
import type { StripeIntentStore } from './intentStore.ts'
import type { PaymentTokenStore } from './types.ts'

export type PaymentIntentDeps = {
  tokens: PaymentTokenStore
  invoices: InvoiceStore
  intents: StripeIntentStore
  stripe?: StripeGateway
  payments: PaymentsConfig
  stripeSecret?: string
  clock?: () => string
  idFactory?: () => string
}

export async function createPublicPaymentIntent(
  rawToken: string,
  request: Request,
  deps: PaymentIntentDeps,
): Promise<Response> {
  const rawBody = await request.text()
  if (rawBody.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawBody)
      if (!isRecord(parsed)) {
        return errorJson('Payment data must be a JSON object.', 400)
      }
    } catch {
      return errorJson('Malformed JSON', 400)
    }
  }

  if (!isWellFormedPaymentToken(rawToken)) {
    return errorJson('This payment link is invalid or expired.', 404)
  }

  const token = await deps.tokens.getByHash(await hashPaymentToken(rawToken))
  if (!token) {
    return errorJson('This payment link is invalid or expired.', 404)
  }

  const record = await deps.invoices.get(token.invoiceId)
  if (!record) {
    return errorJson('This payment link is invalid or expired.', 404)
  }

  if (record.status === 'paid' || token.revokedReason === 'paid') {
    return errorJson('This invoice has already been paid.', 409)
  }
  if (record.status === 'void' || token.revokedReason === 'void') {
    return errorJson('This invoice is no longer payable.', 409)
  }
  if (token.status !== 'active' || record.status !== 'sent') {
    return errorJson('This payment link is invalid or expired.', 404)
  }

  const secret = deps.stripeSecret
  if (!cardPaymentsReady(deps.payments, Boolean(secret)) || !secret) {
    return errorJson('Card payment is not available for this invoice.', 409)
  }
  if (!deps.stripe) {
    return errorJson('Card payment is not available for this invoice.', 409)
  }

  const charge = calculateCardCharge(record)
  const currencyError = stripeCurrencyError(charge.currency)
  if (currencyError) {
    return errorJson(currencyError, 400)
  }
  if (charge.baseCents <= 0) {
    return errorJson('This invoice has no amount due.', 400)
  }
  if (charge.currency === 'USD' && charge.stripeAmount < 50) {
    return errorJson('Card payments must be at least $0.50.', 400)
  }

  const existing = await deps.intents.getByTokenId(token.id)
  if (
    existing &&
    existing.amountCents === charge.stripeAmount &&
    existing.currency === charge.currency.toLowerCase()
  ) {
    return json(publicIntent(existing.clientSecret, charge, existing.stripePaymentIntentId))
  }

  const clock = deps.clock ?? nowIso
  const created = await deps.stripe.createPaymentIntent({
    amount: charge.stripeAmount,
    currency: charge.currency,
    idempotencyKey: `bitz-pi-${token.id}-${charge.stripeAmount}`,
    metadata: {
      invoice_id: record.id,
      invoice_number: record.number,
      payment_token_id: token.id,
    },
    statementDescriptor: deps.payments.statementDescriptor || undefined,
  })

  const timestamp = clock()
  await deps.intents.upsert({
    id: existing?.id ?? (deps.idFactory ?? createEntityId)(),
    invoiceId: record.id,
    tokenId: token.id,
    stripePaymentIntentId: created.id,
    clientSecret: created.clientSecret,
    amountCents: charge.stripeAmount,
    currency: charge.currency.toLowerCase(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  })

  return json(publicIntent(created.clientSecret, charge, created.id))
}

function publicIntent(
  clientSecret: string,
  charge: ReturnType<typeof calculateCardCharge>,
  paymentIntentId: string,
) {
  return {
    clientSecret,
    paymentIntentId,
    currency: charge.currency,
    invoiceAmountCents: charge.baseCents,
    cardFeeCents: charge.feeCents,
    chargeAmountCents: charge.cardCents,
  }
}
