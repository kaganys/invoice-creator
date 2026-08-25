import { errorJson, json } from '../http.ts'
import { createEntityId, isUuid, nowIso } from '../lib/ids.ts'
import { isRecord } from '../lib/json.ts'
import type { InvoiceStore } from '../invoices/types.ts'
import { calculateCardCharge } from './cardAmount.ts'
import type { PaymentLedger } from './ledger.ts'
import { verifyStripeWebhookSignature } from './stripeSignature.ts'
import type { PaymentRevokeReason, PaymentTokenStore } from './types.ts'

export type StripeWebhookDeps = {
  invoices: InvoiceStore
  tokens: PaymentTokenStore
  ledger: PaymentLedger
  webhookSecret?: string
  clock?: () => string
  idFactory?: () => string
  nowSeconds?: () => number
}

export async function handleStripeWebhook(
  request: Request,
  deps: StripeWebhookDeps,
): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get('Stripe-Signature')
  const secret = deps.webhookSecret
  if (!secret) {
    return errorJson('Stripe webhook secret is not configured.', 500)
  }
  const verified = await verifyStripeWebhookSignature(
    rawBody,
    signature,
    secret,
    (deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))(),
  )
  if (!verified.ok) {
    return errorJson(verified.message, 400)
  }

  let event: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!isRecord(parsed)) {
      return errorJson('Invalid Stripe event.', 400)
    }
    event = parsed
  } catch {
    return errorJson('Invalid Stripe event JSON.', 400)
  }

  const eventId = typeof event.id === 'string' ? event.id : ''
  const eventType = typeof event.type === 'string' ? event.type : ''
  if (!eventId || !eventType) {
    return errorJson('Stripe event is missing id or type.', 400)
  }

  if (await deps.ledger.hasEvent(eventId)) {
    return json({ ok: true, duplicate: true })
  }

  const clock = deps.clock ?? nowIso
  const timestamp = clock()

  if (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') {
    await recordNonSuccess(event, eventType, eventId, timestamp, deps)
    await deps.ledger.insertEvent(eventId, eventType, timestamp, 'recorded')
    return json({ ok: true, processed: eventType })
  }

  if (eventType !== 'payment_intent.succeeded') {
    await deps.ledger.insertEvent(eventId, eventType, timestamp, 'ignored')
    return json({ ok: true, ignored: eventType })
  }

  const result = await finalizeSucceededPayment(event, eventId, timestamp, deps)
  await deps.ledger.insertEvent(
    eventId,
    eventType,
    timestamp,
    result.ok ? 'succeeded' : 'review',
  )
  return json(result)
}

async function recordNonSuccess(
  event: Record<string, unknown>,
  eventType: string,
  eventId: string,
  timestamp: string,
  deps: StripeWebhookDeps,
): Promise<void> {
  const paymentIntent = getPaymentIntent(event)
  const invoiceId = paymentIntent?.metadata.invoice_id
  if (!paymentIntent || !invoiceId || !isUuid(invoiceId)) {
    return
  }
  const invoice = await deps.invoices.get(invoiceId)
  if (!invoice) {
    return
  }
  await deps.ledger.insertPayment({
    id: (deps.idFactory ?? createEntityId)(),
    invoiceId,
    provider: 'stripe',
    providerPaymentId: paymentIntent.id,
    amountCents: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: eventType === 'payment_intent.canceled' ? 'canceled' : 'failed',
    paidAt: null,
    createdAt: timestamp,
    stripeEventId: eventId,
    reviewReason: null,
  })
}

/**
 * Stripe is authoritative for card paid-state. The browser success page only polls.
 *
 * Amount/currency are recomputed from the saved invoice snapshot, not Stripe metadata.
 *
 * Race with admin Mark Paid (chosen behavior):
 * - If Stripe succeeds first, the invoice is marked paid via card, paid_at is set,
 *   and the public token is revoked.
 * - If admin already marked the invoice paid (Zelle/manual/other), a later verified
 *   Stripe success does not change paid_method or paid_at. The Stripe payment is still
 *   written to invoice_payments, Stripe PI id / amount paid are attached with COALESCE,
 *   and any remaining token is revoked so a second charge cannot start.
 * - Void invoices are never un-voided. A matching Stripe success is still audited.
 * - Amount/currency mismatches never mark the invoice paid. The token is revoked with
 *   reason "mismatch" so another PaymentIntent cannot be created; the public page does
 *   not claim the invoice is paid.
 */
async function finalizeSucceededPayment(
  event: Record<string, unknown>,
  eventId: string,
  timestamp: string,
  deps: StripeWebhookDeps,
): Promise<Record<string, unknown>> {
  const paymentIntent = getPaymentIntent(event)
  if (!paymentIntent) {
    return { ok: false, error: 'PaymentIntent missing from event.' }
  }

  const invoiceId = paymentIntent.metadata.invoice_id
  if (!invoiceId || !isUuid(invoiceId)) {
    return { ok: false, error: 'PaymentIntent is missing a valid invoice id.' }
  }

  const invoice = await deps.invoices.get(invoiceId)
  if (!invoice) {
    return { ok: false, error: 'Invoice not found for PaymentIntent.' }
  }

  const expected = calculateCardCharge(invoice)
  const paidAmount = paymentIntent.amountReceived || paymentIntent.amount
  const currency = paymentIntent.currency.toLowerCase()
  const expectedCurrency = expected.currency.toLowerCase()
  const amountMatches = paidAmount === expected.stripeAmount
  const currencyMatches = currency === expectedCurrency

  if (!amountMatches || !currencyMatches) {
    const reviewReason = `Expected ${expected.stripeAmount} ${expectedCurrency}, received ${paidAmount} ${currency}.`
    console.error(
      `Stripe payment mismatch for invoice ${invoiceId}: ${reviewReason}`,
    )
    await deps.ledger.insertPayment({
      id: (deps.idFactory ?? createEntityId)(),
      invoiceId,
      provider: 'stripe',
      providerPaymentId: paymentIntent.id,
      amountCents: paidAmount,
      currency,
      status: 'mismatch',
      paidAt: timestamp,
      createdAt: timestamp,
      stripeEventId: eventId,
      reviewReason,
    })
    await deps.tokens.revokeActive(invoiceId, 'mismatch', timestamp)
    return {
      ok: false,
      review: true,
      error: 'Stripe payment amount or currency does not match the invoice.',
    }
  }

  const inserted = await deps.ledger.insertPayment({
    id: (deps.idFactory ?? createEntityId)(),
    invoiceId,
    provider: 'stripe',
    providerPaymentId: paymentIntent.id,
    amountCents: paidAmount,
    currency,
    status: 'succeeded',
    paidAt: timestamp,
    createdAt: timestamp,
    stripeEventId: eventId,
    reviewReason: null,
  })
  if (inserted === 'duplicate') {
    await deps.ledger.markPaymentSucceeded('stripe', paymentIntent.id, {
      amountCents: paidAmount,
      currency,
      paidAt: timestamp,
      stripeEventId: eventId,
    })
  }

  const revokeReason: PaymentRevokeReason =
    invoice.status === 'void' ? 'void' : 'paid'

  if (invoice.status === 'void') {
    await deps.tokens.revokeActive(invoiceId, revokeReason, timestamp)
    return { ok: true, applied: false, reason: 'void' }
  }

  if (invoice.status === 'paid') {
    await deps.invoices.attachStripeReceipt(invoiceId, {
      stripePaymentIntentId: paymentIntent.id,
      paidAmountCents: paidAmount,
      updatedAt: timestamp,
    })
    await deps.tokens.revokeActive(invoiceId, 'paid', timestamp)
    return {
      ok: true,
      applied: false,
      reason: 'already_paid',
      duplicatePayment: inserted === 'duplicate',
    }
  }

  const marked = await deps.invoices.markPaid(invoiceId, {
    paidAt: timestamp,
    paidMethod: 'card',
    updatedAt: timestamp,
    stripePaymentIntentId: paymentIntent.id,
    paidAmountCents: paidAmount,
  })
  if (marked === 'already_paid') {
    await deps.invoices.attachStripeReceipt(invoiceId, {
      stripePaymentIntentId: paymentIntent.id,
      paidAmountCents: paidAmount,
      updatedAt: timestamp,
    })
    await deps.tokens.revokeActive(invoiceId, 'paid', timestamp)
    return { ok: true, applied: false, reason: 'already_paid' }
  }
  if (marked === 'void') {
    await deps.tokens.revokeActive(invoiceId, 'void', timestamp)
    return { ok: true, applied: false, reason: 'void' }
  }
  if (marked !== 'ok') {
    return { ok: false, error: 'Could not mark invoice paid.' }
  }
  await deps.tokens.revokeActive(invoiceId, 'paid', timestamp)
  return { ok: true, applied: true }
}

type ParsedPaymentIntent = {
  id: string
  amount: number
  amountReceived: number
  currency: string
  metadata: { invoice_id?: string; invoice_number?: string; payment_token_id?: string }
}

function getPaymentIntent(event: Record<string, unknown>): ParsedPaymentIntent | null {
  const data = isRecord(event.data) ? event.data : null
  const object = data && isRecord(data.object) ? data.object : null
  if (!object || typeof object.id !== 'string') {
    return null
  }
  const amount = typeof object.amount === 'number' ? object.amount : 0
  const amountReceived =
    typeof object.amount_received === 'number' ? object.amount_received : amount
  const currency = typeof object.currency === 'string' ? object.currency : ''
  const metadata = isRecord(object.metadata)
    ? {
        invoice_id:
          typeof object.metadata.invoice_id === 'string'
            ? object.metadata.invoice_id
            : undefined,
        invoice_number:
          typeof object.metadata.invoice_number === 'string'
            ? object.metadata.invoice_number
            : undefined,
        payment_token_id:
          typeof object.metadata.payment_token_id === 'string'
            ? object.metadata.payment_token_id
            : undefined,
      }
    : {}
  return {
    id: object.id,
    amount,
    amountReceived,
    currency,
    metadata,
  }
}
