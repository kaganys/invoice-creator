import { invoiceLogoPath } from '../../src/branding.ts'
import { formatInvoiceDate } from '../../src/utils/dates.ts'
import { calculateInvoiceTotals } from '../../src/utils/invoiceCalculations.ts'
import { formatMoney } from '../../src/utils/money.ts'
import { json } from '../http.ts'
import { invoiceFromRecord } from '../invoices/document.ts'
import type { InvoiceStore } from '../invoices/types.ts'
import {
  cardPaymentsReady,
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

  const invoice = toPublicPayload(record, deps.payments, deps.stripeSecretConfigured)

  if (record.status === 'paid' || token.revokedReason === 'paid') {
    return json({
      state: 'paid',
      invoice: {
        ...invoice,
        lineItems: [],
        paymentMemo: '',
        zelleEmail: '',
        cardPaymentAvailable: false,
        stripePublishableKey: null,
      } satisfies PublicInvoicePayload,
    } satisfies PublicInvoiceResponse)
  }

  if (record.status === 'void' || token.revokedReason === 'void') {
    return json({
      state: 'void',
      invoice: {
        ...invoice,
        lineItems: [],
        paymentMemo: '',
        zelleEmail: '',
        cardPaymentAvailable: false,
        stripePublishableKey: null,
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

function toPublicPayload(
  record: Parameters<typeof invoiceFromRecord>[0],
  payments: PaymentsConfig | undefined,
  stripeSecretConfigured: boolean | undefined,
): PublicInvoicePayload {
  const invoice = invoiceFromRecord(record)
  const totals = calculateInvoiceTotals(invoice)
  const cardReady = payments
    ? cardPaymentsReady(payments, Boolean(stripeSecretConfigured))
    : false
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
    paymentMemo: invoice.payment.memo,
    zelleEmail: invoice.payment.zelleEmail,
    cardPaymentAvailable: cardReady,
    stripePublishableKey: cardReady ? payments?.publishableKey ?? null : null,
    logoPath: invoiceLogoPath(invoice.invoiceLogo),
  }
}
