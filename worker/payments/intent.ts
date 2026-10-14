import { errorJson, json } from '../http.ts'
import { createEntityId, nowIso } from '../lib/ids.ts'
import { isRecord } from '../lib/json.ts'
import type { InvoiceStore } from '../invoices/types.ts'
import {
  anyStripePaymentReady,
  achPaymentsReady,
  cardPaymentsReady,
  publicPaymentMethodTypes,
  type PaymentsConfig,
} from '../settings/payments.ts'
import { calculateCardCharge, stripeCurrencyError, toStripeAmount } from './cardAmount.ts'
import {
  paymentIntentDescription,
  paymentIntentMetadata,
  paymentIntentReceiptEmail,
} from './paymentIntentFields.ts'
import { createStripeGateway } from './stripeClient.ts'
import {
  classifyStripePaymentMethod,
  paidMethodFor,
  quoteForCategory,
  type PaymentCategory,
} from '../../src/payments/surcharge.ts'
import { hashPaymentToken, isWellFormedPaymentToken } from './tokenCrypto.ts'
import type { StripeGateway } from './stripeClient.ts'
import type { StripeIntentStore } from './intentStore.ts'
import type { PaymentLedger } from './ledger.ts'
import type { PaymentTokenStore } from './types.ts'

export type PaymentIntentDeps = {
  tokens: PaymentTokenStore
  invoices: InvoiceStore
  intents: StripeIntentStore
  stripe?: StripeGateway
  payments: PaymentsConfig
  loadPaymentsForCompany?: (companyId: string) => Promise<PaymentsConfig>
  loadCompanyName?: (companyId: string) => Promise<string | null>
  stripeSecret?: string
  resolveStripeSecret?: (companyId: string) => Promise<string | undefined>
  paymentBaseUrl?: string
  ledger?: PaymentLedger
  clock?: () => string
  idFactory?: () => string
}

const BLOCKING_STRIPE_STATUSES = new Set([
  'confirming',
  'processing',
  'requires_action',
  'succeeded',
])

export const CONFIRMING_TTL_MS = 15 * 60 * 1000

export function sanitizePaymentReturnUrl(
  raw: string,
  options: { requestUrl: string; configuredBase?: string },
): string {
  const allowed = new Set<string>(['https://pay.vrfnw.com'])
  const configured = (options.configuredBase ?? '').trim().replace(/\/+$/, '')
  if (configured.startsWith('https://') || configured.startsWith('http://')) {
    try {
      allowed.add(new URL(configured).origin)
    } catch {
      // Ignore a bad configured origin and keep the public host.
    }
  }
  try {
    const request = new URL(options.requestUrl)
    if (request.hostname === 'localhost' || request.hostname === '127.0.0.1') {
      allowed.add(request.origin)
    }
  } catch {
    // Request URL is only used to allow local returns.
  }
  if (raw) {
    try {
      const url = new URL(raw)
      if (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        allowed.has(url.origin)
      ) {
        return url.toString()
      }
    } catch {
      // Fall through to the public payment host.
    }
  }
  if (allowed.has('https://pay.vrfnw.com')) {
    return 'https://pay.vrfnw.com/'
  }
  return 'https://pay.vrfnw.com/'
}

async function stripeContext(
  companyId: string | null | undefined,
  deps: PaymentIntentDeps,
): Promise<{ secret?: string; stripe?: StripeGateway }> {
  if (deps.resolveStripeSecret && companyId) {
    const secret = await deps.resolveStripeSecret(companyId)
    return {
      secret,
      stripe: secret ? createStripeGateway(secret) : undefined,
    }
  }
  return { secret: deps.stripeSecret, stripe: deps.stripe }
}

function confirmingIsFresh(updatedAt: string, nowIso: string): boolean {
  const updated = Date.parse(updatedAt)
  const now = Date.parse(nowIso)
  if (!Number.isFinite(updated) || !Number.isFinite(now)) {
    return true
  }
  return now - updated < CONFIRMING_TTL_MS
}

export async function createPublicPaymentIntent(
  rawToken: string,
  request: Request,
  deps: PaymentIntentDeps,
): Promise<Response> {
  const parsedBody = await readOptionalJsonObject(request)
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const loaded = await loadPayableInvoice(rawToken, deps)
  if (!loaded.ok) {
    return loaded.response
  }
  const { record, token } = loaded
  const payments =
    record.companyId && deps.loadPaymentsForCompany
      ? await deps.loadPaymentsForCompany(record.companyId)
      : deps.payments
  const resolvedStripe = await stripeContext(record.companyId, deps)
  const secret = resolvedStripe.secret
  if (!anyStripePaymentReady(payments, Boolean(secret)) || !secret) {
    return errorJson('Online payment is not available for this invoice.', 409)
  }

  const charge = calculateCardCharge(record)
  const currencyError = stripeCurrencyError(charge.currency)
  if (currencyError) {
    return errorJson(currencyError, 400)
  }
  if (charge.baseCents <= 0) {
    return errorJson('This invoice has no amount due.', 400)
  }

  const types = publicPaymentMethodTypes(payments, Boolean(secret))
  const initialCategory: PaymentCategory = cardPaymentsReady(
    payments,
    Boolean(secret),
  )
    ? 'card'
    : 'ach'
  const quote = quoteForCategory(charge.baseCents, charge.feeCents, initialCategory)
  if (charge.currency === 'USD' && quote.totalCents < 50 && initialCategory === 'card') {
    return errorJson('Card payments must be at least $0.50.', 400)
  }

  if (await hasBlockingPayment(record.id, deps)) {
    const existing = await deps.intents.getByTokenId(token.id)
    return json({
      status:
        record.stripePaymentStatus === 'requires_action'
          ? 'requires_action'
          : 'processing',
      currency: charge.currency,
      invoiceAmountCents: charge.baseCents,
      cardFeeCents: charge.feeCents,
      chargeAmountCents: quote.totalCents,
      paymentMethodTypes: types,
      clientSecret:
        record.stripePaymentStatus === 'requires_action'
          ? existing?.clientSecret ?? null
          : null,
    })
  }

  return json({
    mode: 'payment',
    currency: charge.currency,
    invoiceAmountCents: charge.baseCents,
    cardFeeCents: charge.feeCents,
    cardTotalCents: charge.cardCents,
    chargeAmountCents: quote.totalCents,
    paymentMethodTypes: types,
    cardPaymentAvailable: cardPaymentsReady(payments, Boolean(secret)),
    achPaymentAvailable: achPaymentsReady(payments, Boolean(secret)),
  })
}

export async function confirmPublicPayment(
  rawToken: string,
  request: Request,
  deps: PaymentIntentDeps,
): Promise<Response> {
  const parsedBody = await readOptionalJsonObject(request)
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const confirmationTokenId =
    typeof parsedBody.value.confirmationTokenId === 'string'
      ? parsedBody.value.confirmationTokenId.trim()
      : ''
  const returnUrl =
    typeof parsedBody.value.returnUrl === 'string'
      ? parsedBody.value.returnUrl.trim()
      : ''
  if (!confirmationTokenId.startsWith('ctoken_') && !confirmationTokenId.startsWith('ct_')) {
    return errorJson('A Stripe confirmation token is required.', 400)
  }

  const loaded = await loadPayableInvoice(rawToken, deps)
  if (!loaded.ok) {
    return loaded.response
  }
  const { record, token } = loaded
  const payments =
    record.companyId && deps.loadPaymentsForCompany
      ? await deps.loadPaymentsForCompany(record.companyId)
      : deps.payments

  const resolvedStripe = await stripeContext(record.companyId, deps)
  const secret = resolvedStripe.secret
  const stripe = resolvedStripe.stripe
  if (!anyStripePaymentReady(payments, Boolean(secret)) || !secret || !stripe) {
    return errorJson('Online payment is not available for this invoice.', 409)
  }

  let preview
  try {
    preview = await stripe.retrieveConfirmationToken(confirmationTokenId)
  } catch (caught) {
    return errorJson(
      caught instanceof Error
        ? caught.message
        : 'Could not read the selected payment method.',
      400,
    )
  }
  const category = classifyStripePaymentMethod(
    preview.paymentMethodType,
    preview.walletType,
  )
  if (!category) {
    return errorJson('That payment method is not supported for this invoice.', 400)
  }
  if (category === 'card' && !cardPaymentsReady(payments, true)) {
    return errorJson('Card payment is not available for this invoice.', 409)
  }
  if (category === 'ach' && !achPaymentsReady(payments, true)) {
    return errorJson('Bank payment is not available for this invoice.', 409)
  }

  const charge = calculateCardCharge(record)
  const quote = quoteForCategory(charge.baseCents, charge.feeCents, category)
  const stripeAmount = toStripeAmount(quote.totalCents, charge.currency)
  const currencyError = stripeCurrencyError(charge.currency)
  if (currencyError) {
    return errorJson(currencyError, 400)
  }
  if (category === 'card' && charge.currency === 'USD' && stripeAmount < 50) {
    return errorJson('Card payments must be at least $0.50.', 400)
  }

  const existing = await deps.intents.getByTokenId(token.id)
  if (
    existing?.confirmationTokenId === confirmationTokenId &&
    existing.stripePaymentIntentId
  ) {
    return json({
      paymentIntentId: existing.stripePaymentIntentId,
      clientSecret: existing.clientSecret,
      status: existing.status,
      currency: existing.currency,
      invoiceAmountCents: charge.baseCents,
      surchargeCents: quote.surchargeCents,
      chargeAmountCents: quote.totalCents,
      category,
    })
  }

  if (await hasBlockingPayment(record.id, deps)) {
    return errorJson('A payment is already processing for this invoice.', 409)
  }

  const timestamp = (deps.clock ?? nowIso)()
  const claimed = await deps.invoices.claimStripeAttempt(record.id, {
    stripePaymentMethod: preview.paymentMethodType,
    stripeWalletType: preview.walletType,
    stripePaymentStatus: 'confirming',
    updatedAt: timestamp,
    staleConfirmingBefore: new Date(
      Date.parse(timestamp) - CONFIRMING_TTL_MS,
    ).toISOString(),
  })
  if (!claimed) {
    return errorJson('A payment is already processing for this invoice.', 409)
  }

  let created
  try {
    created = await stripe.confirmWithToken({
      amount: stripeAmount,
      currency: charge.currency,
      confirmationTokenId,
      idempotencyKey: `bitz-ct-${token.id}-${confirmationTokenId}`,
      returnUrl: sanitizePaymentReturnUrl(returnUrl, {
        requestUrl: request.url,
        configuredBase: deps.paymentBaseUrl,
      }),
      ...(await paymentIntentIdentity(record, token.id, category, deps)),
      statementDescriptor: payments.statementDescriptor || undefined,
      paymentMethodTypes: publicPaymentMethodTypes(payments, Boolean(secret)),
    })
  } catch (caught) {
    await deps.invoices.updateStripeProgress(record.id, {
      stripePaymentMethod: preview.paymentMethodType,
      stripeWalletType: preview.walletType,
      stripePaymentStatus: 'failed',
      updatedAt: (deps.clock ?? nowIso)(),
    })
    return errorJson(
      caught instanceof Error ? caught.message : 'Could not complete payment.',
      502,
    )
  }

  await deps.intents.upsert({
    id: existing?.id ?? (deps.idFactory ?? createEntityId)(),
    invoiceId: record.id,
    tokenId: token.id,
    stripePaymentIntentId: created.id,
    clientSecret: created.clientSecret,
    amountCents: stripeAmount,
    currency: charge.currency.toLowerCase(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    confirmationTokenId,
    status: created.status,
    paymentCategory: category,
    paymentMethodType: preview.paymentMethodType,
  })

  await deps.invoices.updateStripeProgress(record.id, {
    stripePaymentIntentId: created.id,
    stripePaymentMethod: preview.paymentMethodType,
    stripeWalletType: preview.walletType,
    stripePaymentStatus: created.status,
    updatedAt: timestamp,
  })

  return json({
    paymentIntentId: created.id,
    clientSecret: created.clientSecret,
    status: created.status,
    currency: charge.currency,
    invoiceAmountCents: charge.baseCents,
    surchargeCents: quote.surchargeCents,
    chargeAmountCents: quote.totalCents,
    category,
    paidMethod: paidMethodFor(category, preview.walletType),
  })
}

async function paymentIntentIdentity(
  record: NonNullable<Awaited<ReturnType<InvoiceStore['get']>>>,
  tokenId: string,
  category: PaymentCategory,
  deps: PaymentIntentDeps,
): Promise<{
  description: string
  metadata: Record<string, string>
  receiptEmail?: string
}> {
  let companyName = ''
  if (record.companyId && deps.loadCompanyName) {
    companyName = (await deps.loadCompanyName(record.companyId))?.trim() ?? ''
  }
  const letterhead = record.from.name.trim()
  return {
    description: paymentIntentDescription(
      record.number,
      letterhead || companyName,
    ),
    metadata: paymentIntentMetadata({
      invoiceId: record.id,
      invoiceNumber: record.number,
      companyId: record.companyId,
      companyName: companyName || letterhead,
      customerName: record.customer.name,
      paymentTokenId: tokenId,
      paymentCategory: category,
    }),
    receiptEmail: paymentIntentReceiptEmail(record.customer.email),
  }
}

async function loadPayableInvoice(
  rawToken: string,
  deps: PaymentIntentDeps,
): Promise<
  | { ok: true; record: NonNullable<Awaited<ReturnType<InvoiceStore['get']>>>; token: NonNullable<Awaited<ReturnType<PaymentTokenStore['getByHash']>>> }
  | { ok: false; response: Response }
> {
  if (!isWellFormedPaymentToken(rawToken)) {
    return {
      ok: false,
      response: errorJson('This payment link is invalid or expired.', 404),
    }
  }
  const token = await deps.tokens.getByHash(await hashPaymentToken(rawToken))
  if (!token) {
    return {
      ok: false,
      response: errorJson('This payment link is invalid or expired.', 404),
    }
  }
  const record = await deps.invoices.get(token.invoiceId)
  if (!record) {
    return {
      ok: false,
      response: errorJson('This payment link is invalid or expired.', 404),
    }
  }
  if (record.status === 'paid' || token.revokedReason === 'paid') {
    return {
      ok: false,
      response: errorJson('This invoice has already been paid.', 409),
    }
  }
  if (record.status === 'void' || token.revokedReason === 'void') {
    return {
      ok: false,
      response: errorJson('This invoice is no longer payable.', 409),
    }
  }
  if (token.status !== 'active' || record.status !== 'sent') {
    return {
      ok: false,
      response: errorJson('This payment link is invalid or expired.', 404),
    }
  }
  return { ok: true, record, token }
}

async function hasBlockingPayment(
  invoiceId: string,
  deps: PaymentIntentDeps,
): Promise<boolean> {
  const invoice = await deps.invoices.get(invoiceId)
  const nowIso = (deps.clock ?? (() => new Date().toISOString()))()
  if (
    invoice?.stripePaymentStatus &&
    BLOCKING_STRIPE_STATUSES.has(invoice.stripePaymentStatus)
  ) {
    const staleConfirming =
      invoice.stripePaymentStatus === 'confirming' &&
      !confirmingIsFresh(invoice.updatedAt, nowIso)
    if (!staleConfirming) {
      return true
    }
  }
  if (!deps.ledger) {
    return false
  }
  const rows = await deps.ledger.listByInvoiceId(invoiceId)
  return rows.some(
    (row) => row.status === 'processing' || row.status === 'succeeded',
  )
}

async function readOptionalJsonObject(
  request: Request,
): Promise<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  const rawBody = await request.text()
  if (!rawBody.trim()) {
    return { ok: true, value: {} }
  }
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!isRecord(parsed)) {
      return {
        ok: false,
        response: errorJson('Payment data must be a JSON object.', 400),
      }
    }
    return { ok: true, value: parsed }
  } catch {
    return { ok: false, response: errorJson('Malformed JSON', 400) }
  }
}
