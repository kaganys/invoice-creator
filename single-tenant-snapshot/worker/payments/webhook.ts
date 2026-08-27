import { errorJson, json } from '../http.ts'
import { createEntityId, isUuid, nowIso } from '../lib/ids.ts'
import { isRecord } from '../lib/json.ts'
import type { InvoiceStore, PaidMethod } from '../invoices/types.ts'
import { calculateCardCharge, toStripeAmount } from './cardAmount.ts'
import type { PaymentLedger } from './ledger.ts'
import { verifyStripeWebhookSignature } from './stripeSignature.ts'
import type { PaymentTokenStore } from './types.ts'
import {
  classifyStripePaymentMethod,
  paidMethodFor,
  quoteForCategory,
  type PaymentCategory,
} from '../../src/payments/surcharge.ts'

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

  if (eventType === 'payment_intent.processing') {
    const result = await recordProcessing(event, eventId, timestamp, deps)
    await deps.ledger.insertEvent(eventId, eventType, timestamp, 'processing')
    return json(result)
  }

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

async function recordProcessing(
  event: Record<string, unknown>,
  eventId: string,
  timestamp: string,
  deps: StripeWebhookDeps,
): Promise<Record<string, unknown>> {
  const paymentIntent = getPaymentIntent(event)
  const invoiceId = paymentIntent?.metadata.invoice_id
  if (!paymentIntent || !invoiceId || !isUuid(invoiceId)) {
    return { ok: true, applied: false }
  }
  const invoice = await deps.invoices.get(invoiceId)
  if (!invoice || invoice.status === 'paid' || invoice.status === 'void') {
    return { ok: true, applied: false }
  }
  const method = methodFromIntent(paymentIntent)
  await deps.ledger.insertPayment({
    id: (deps.idFactory ?? createEntityId)(),
    invoiceId,
    provider: 'stripe',
    providerPaymentId: paymentIntent.id,
    amountCents: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: 'processing',
    paidAt: null,
    createdAt: timestamp,
    stripeEventId: eventId,
    reviewReason: null,
    paymentCategory: method.category,
    paymentMethodType: method.type,
    walletType: method.wallet,
    surchargeCents: 0,
  })
  await deps.invoices.updateStripeProgress(invoiceId, {
    stripePaymentIntentId: paymentIntent.id,
    stripePaymentMethod: method.type,
    stripeWalletType: method.wallet,
    stripePaymentStatus: 'processing',
    updatedAt: timestamp,
  })
  return { ok: true, applied: true, status: 'processing' }
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
  const method = methodFromIntent(paymentIntent)
  const status = eventType === 'payment_intent.canceled' ? 'canceled' : 'failed'
  const inserted = await deps.ledger.insertPayment({
    id: (deps.idFactory ?? createEntityId)(),
    invoiceId,
    provider: 'stripe',
    providerPaymentId: paymentIntent.id,
    amountCents: paymentIntent.amount,
    currency: paymentIntent.currency,
    status,
    paidAt: null,
    createdAt: timestamp,
    stripeEventId: eventId,
    reviewReason: null,
    paymentCategory: method.category,
    paymentMethodType: method.type,
    walletType: method.wallet,
    surchargeCents: 0,
  })
  if (inserted === 'duplicate') {
    await deps.ledger.updatePaymentStatus('stripe', paymentIntent.id, {
      status,
      stripeEventId: eventId,
      paidAt: null,
    })
  }
  if (invoice.status === 'sent') {
    await deps.invoices.updateStripeProgress(invoiceId, {
      stripePaymentIntentId: paymentIntent.id,
      stripePaymentMethod: method.type,
      stripeWalletType: method.wallet,
      stripePaymentStatus: status,
      updatedAt: timestamp,
    })
  }
}

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

  const method = methodFromIntent(paymentIntent)
  const category: PaymentCategory = method.category ?? 'card'
  const snapshot = calculateCardCharge(invoice)
  const quote = quoteForCategory(snapshot.baseCents, snapshot.feeCents, category)
  const expectedAmount = toStripeAmount(quote.totalCents, snapshot.currency)
  const paidAmount = paymentIntent.amountReceived || paymentIntent.amount
  const currency = paymentIntent.currency.toLowerCase()
  const expectedCurrency = snapshot.currency.toLowerCase()
  const amountMatches = paidAmount === expectedAmount
  const currencyMatches = currency === expectedCurrency

  if (!amountMatches || !currencyMatches) {
    const reviewReason = `Expected ${expectedAmount} ${expectedCurrency} (${category}), received ${paidAmount} ${currency}.`
    console.error(`Stripe payment mismatch for invoice ${invoiceId}: ${reviewReason}`)
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
      paymentCategory: category,
      paymentMethodType: method.type,
      walletType: method.wallet,
      surchargeCents: quote.surchargeCents,
    })
    if (category === 'card') {
      await deps.tokens.revokeActive(invoiceId, 'mismatch', timestamp)
    }
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
    paymentCategory: category,
    paymentMethodType: method.type,
    walletType: method.wallet,
    surchargeCents: quote.surchargeCents,
  })
  if (inserted === 'duplicate') {
    await deps.ledger.markPaymentSucceeded('stripe', paymentIntent.id, {
      amountCents: paidAmount,
      currency,
      paidAt: timestamp,
      stripeEventId: eventId,
      paymentCategory: category,
      paymentMethodType: method.type,
      walletType: method.wallet,
      surchargeCents: quote.surchargeCents,
    })
  }

  const paidMethod: PaidMethod = paidMethodFor(category, method.wallet)

  if (invoice.status === 'void') {
    await deps.tokens.revokeActive(invoiceId, 'void', timestamp)
    return { ok: true, applied: false, reason: 'void' }
  }

  if (invoice.status === 'paid') {
    await deps.invoices.attachStripeReceipt(invoiceId, {
      stripePaymentIntentId: paymentIntent.id,
      paidAmountCents: paidAmount,
      updatedAt: timestamp,
      stripePaymentMethod: method.type,
      stripeWalletType: method.wallet,
      stripePaymentStatus: 'succeeded',
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
    paidMethod,
    updatedAt: timestamp,
    stripePaymentIntentId: paymentIntent.id,
    paidAmountCents: paidAmount,
    stripePaymentMethod: method.type,
    stripeWalletType: method.wallet,
    stripePaymentStatus: 'succeeded',
  })
  if (marked === 'already_paid') {
    await deps.invoices.attachStripeReceipt(invoiceId, {
      stripePaymentIntentId: paymentIntent.id,
      paidAmountCents: paidAmount,
      updatedAt: timestamp,
      stripePaymentMethod: method.type,
      stripeWalletType: method.wallet,
      stripePaymentStatus: 'succeeded',
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
  return { ok: true, applied: true, paidMethod }
}

type ParsedPaymentIntent = {
  id: string
  amount: number
  amountReceived: number
  currency: string
  paymentMethodType: string | null
  walletType: string | null
  metadata: { invoice_id?: string; invoice_number?: string; payment_token_id?: string; payment_category?: string }
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
        payment_category:
          typeof object.metadata.payment_category === 'string'
            ? object.metadata.payment_category
            : undefined,
      }
    : {}
  const extracted = extractMethod(object)
  return {
    id: object.id,
    amount,
    amountReceived,
    currency,
    paymentMethodType: extracted.type,
    walletType: extracted.wallet,
    metadata,
  }
}

function extractMethod(object: Record<string, unknown>): {
  type: string | null
  wallet: string | null
} {
  const details = paymentMethodDetails(object)
  const type = typeof details?.type === 'string' ? details.type : null
  const card = details && isRecord(details.card) ? details.card : null
  const walletObj = card && isRecord(card.wallet) ? card.wallet : null
  const wallet = typeof walletObj?.type === 'string' ? walletObj.type : null
  if (type) {
    return { type, wallet }
  }
  const types = object.payment_method_types
  if (Array.isArray(types) && typeof types[0] === 'string') {
    return { type: types[0], wallet }
  }
  return { type: null, wallet }
}

function paymentMethodDetails(
  object: Record<string, unknown>,
): Record<string, unknown> | null {
  const charges = isRecord(object.charges) ? object.charges : null
  const data = charges && Array.isArray(charges.data) ? charges.data : []
  const first = data[0]
  if (isRecord(first) && isRecord(first.payment_method_details)) {
    return first.payment_method_details
  }
  if (isRecord(object.payment_method_details)) {
    return object.payment_method_details
  }
  return null
}

function methodFromIntent(paymentIntent: ParsedPaymentIntent): {
  category: PaymentCategory | null
  type: string | null
  wallet: string | null
} {
  const classified = classifyStripePaymentMethod(
    paymentIntent.paymentMethodType,
    paymentIntent.walletType,
  )
  const fallback =
    paymentIntent.metadata.payment_category === 'ach' ||
    paymentIntent.metadata.payment_category === 'card'
      ? paymentIntent.metadata.payment_category
      : null
  return {
    category: classified ?? fallback,
    type: paymentIntent.paymentMethodType,
    wallet: paymentIntent.walletType,
  }
}
