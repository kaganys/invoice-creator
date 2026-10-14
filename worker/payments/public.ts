import { invoiceLogoPath } from '../../src/branding.ts'
import { successRedirectTarget } from '../../src/payments/successRedirect.ts'
import { formatInvoiceDate } from '../../src/utils/dates.ts'
import { calculateInvoiceTotals } from '../../src/utils/invoiceCalculations.ts'
import { formatMoney } from '../../src/utils/money.ts'
import { json } from '../http.ts'
import { invoiceFromRecord } from '../invoices/document.ts'
import type { InvoiceStore } from '../invoices/types.ts'
import {
  achPaymentsReady,
  anyStripePaymentReady,
  cardPaymentsReady,
  publicPaymentMethodTypes,
  type PaymentsConfig,
} from '../settings/payments.ts'
import { hashPaymentToken, isWellFormedPaymentToken } from './tokenCrypto.ts'
import type {
  PaymentTokenStore,
  PublicInvoicePayload,
  PublicInvoiceState,
} from './types.ts'

export type PublicInvoiceResponse = {
  state: PublicInvoiceState
  invoice: PublicInvoicePayload | null
}

const INVALID: PublicInvoiceResponse = { state: 'invalid', invoice: null }

function invalidResponse(): Response {
  return json(INVALID, { status: 404 })
}

export async function getPublicInvoiceByToken(
  rawToken: string,
  deps: {
    tokens: PaymentTokenStore
    invoices: InvoiceStore
    payments?: PaymentsConfig
    stripeSecretConfigured?: boolean
    resolveStripeSecret?: (companyId: string) => Promise<string | undefined>
    loadPaymentsForCompany?: (companyId: string) => Promise<PaymentsConfig>
  },
): Promise<Response> {
  if (!isWellFormedPaymentToken(rawToken)) {
    return invalidResponse()
  }

  const tokenHash = await hashPaymentToken(rawToken)
  const token = await deps.tokens.getByHash(tokenHash)
  if (!token) {
    return invalidResponse()
  }

  const record = await deps.invoices.get(token.invoiceId)
  if (!record) {
    return invalidResponse()
  }

  const payments =
    record.companyId && deps.loadPaymentsForCompany
      ? await deps.loadPaymentsForCompany(record.companyId)
      : deps.payments
  const stripeReady = deps.resolveStripeSecret && record.companyId
    ? Boolean(await deps.resolveStripeSecret(record.companyId))
    : Boolean(deps.stripeSecretConfigured)
  const invoice = toPublicPayload(record, payments, stripeReady)

  if (record.status === 'paid' || token.revokedReason === 'paid') {
    return json({
      state: 'paid',
      invoice: {
        ...invoice,
        lineItems: [],
        cardPaymentAvailable: false,
        achPaymentAvailable: false,
        paymentMethodTypes: [],
        stripePublishableKey: null,
        pendingKind: null,
      } satisfies PublicInvoicePayload,
    } satisfies PublicInvoiceResponse)
  }

  if (record.status === 'void' || token.revokedReason === 'void') {
    return json({
      state: 'void',
      invoice: {
        ...invoice,
        lineItems: [],
        cardPaymentAvailable: false,
        achPaymentAvailable: false,
        paymentMethodTypes: [],
        stripePublishableKey: null,
        pendingKind: null,
      } satisfies PublicInvoicePayload,
    } satisfies PublicInvoiceResponse)
  }

  if (
    record.status === 'sent' &&
    isPendingStripeStatus(record.stripePaymentStatus)
  ) {
    return json({
      state: 'processing',
      invoice: {
        ...invoice,
        cardPaymentAvailable: false,
        achPaymentAvailable: false,
        paymentMethodTypes: [],
        stripePublishableKey: null,
        pendingKind:
          record.stripePaymentMethod === 'us_bank_account' ? 'ach' : 'card',
      } satisfies PublicInvoicePayload,
    } satisfies PublicInvoiceResponse)
  }

  if (token.status !== 'active' || record.status !== 'sent') {
    return invalidResponse()
  }

  return json({
    state: 'payable',
    invoice,
  } satisfies PublicInvoiceResponse)
}

function isPendingStripeStatus(status: string | null | undefined): boolean {
  return (
    status === 'processing' ||
    status === 'confirming' ||
    status === 'requires_action' ||
    status === 'succeeded'
  )
}

function toPublicPayload(
  record: Parameters<typeof invoiceFromRecord>[0] & {
    stripePaymentStatus?: string | null
  },
  payments: PaymentsConfig | undefined,
  stripeSecretConfigured: boolean | undefined,
): PublicInvoicePayload {
  const invoice = invoiceFromRecord(record)
  const totals = calculateInvoiceTotals(invoice)
  const secret = Boolean(stripeSecretConfigured)
  const cardReady = payments ? cardPaymentsReady(payments, secret) : false
  const achReady = payments ? achPaymentsReady(payments, secret) : false
  const stripeReady = payments ? anyStripePaymentReady(payments, secret) : false
  return {
    number: invoice.number,
    customerName: invoice.customer.name.trim(),
    businessName: invoice.from.name.trim() || 'Bitz Designs',
    issueDate: formatInvoiceDate(invoice.issueDate) || invoice.issueDate,
    dueDate: formatInvoiceDate(invoice.dueDate) || invoice.dueDate,
    currency: invoice.currency,
    lineItems: invoice.lineItems.map((line, index) => {
      const amountCents = totals.lineAmountsCents[index]
      return {
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount:
          amountCents == null
            ? ''
            : formatMoney(amountCents, invoice.currency),
      }
    }),
    amountDue: formatMoney(totals.amountDueCents, invoice.currency),
    amountDueCents: totals.amountDueCents,
    cardFeeCents: totals.cardFeeCents,
    cardTotalCents: totals.cardTotalCents,
    cardFee: formatMoney(totals.cardFeeCents, invoice.currency),
    cardTotal: formatMoney(totals.cardTotalCents, invoice.currency),
    cardPaymentAvailable: cardReady,
    achPaymentAvailable: achReady,
    paymentMethodTypes: payments
      ? publicPaymentMethodTypes(payments, secret)
      : [],
    stripePublishableKey: stripeReady ? payments?.publishableKey ?? null : null,
    successRedirectUrl: successRedirectTarget(payments?.successRedirectUrl ?? '') ?? '',
    logoPath: invoiceLogoPath(invoice.invoiceLogo),
    pendingKind: null,
  }
}
