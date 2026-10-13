import type { StripeExpressCheckoutElementOptions } from '@stripe/stripe-js'

export type WalletLineItem = {
  name: string
  amount: number
}

export type WalletAvailability = {
  applePay?: boolean
  googlePay?: boolean
}

type ExpressPaymentMethods = NonNullable<
  StripeExpressCheckoutElementOptions['paymentMethods']
>

/**
 * Apple Pay and Google Pay are card payments. Line items must sum to the
 * card quote (invoice amount plus the card processing fee) so the wallet
 * sheet matches the amount the server will charge.
 */
export function cardWalletLineItems(input: {
  invoiceNumber: string
  invoiceAmountCents: number
  cardFeeCents: number
}): WalletLineItem[] {
  const amount = Math.max(0, Math.trunc(input.invoiceAmountCents))
  const fee = Math.max(0, Math.trunc(input.cardFeeCents))
  const lines: WalletLineItem[] = [
    { name: `Invoice ${input.invoiceNumber}`, amount },
  ]
  if (fee > 0) {
    lines.push({ name: 'Card processing fee', amount: fee })
  }
  return lines
}

export function walletLineTotal(lines: readonly WalletLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0)
}

/**
 * `'always'` asks Stripe to show a wallet only when this browser supports it.
 * Safari (Mac, iPhone, iPad) offers Apple Pay. Chrome (desktop and Android)
 * offers Google Pay. Link, PayPal, Amazon Pay, and Klarna stay off this row.
 */
export function expressWalletOptions(
  cardPaymentsEnabled: boolean,
): ExpressPaymentMethods {
  const wallet = cardPaymentsEnabled ? 'always' : 'never'
  return {
    applePay: wallet,
    googlePay: wallet,
    link: 'never',
    paypal: 'never',
    amazonPay: 'never',
    klarna: 'never',
  }
}

export function expressWalletLayout(narrow: boolean): {
  maxColumns: number
  maxRows: number
  overflow: 'auto'
} {
  return {
    maxColumns: narrow ? 1 : 2,
    maxRows: 1,
    overflow: 'auto',
  }
}

export const EXPRESS_WALLET_BUTTON_TYPE = {
  applePay: 'plain',
  googlePay: 'plain',
} as const

/** True only when Apple Pay or Google Pay can actually render. Link does not count. */
export function walletButtonsVisible(
  methods: WalletAvailability | null | undefined,
): boolean {
  return Boolean(methods?.applePay || methods?.googlePay)
}

export function walletAvailabilityFromChange(
  paymentMethods:
    | {
        applePay?: { available?: boolean }
        googlePay?: { available?: boolean }
        [method: string]: { available?: boolean } | undefined
      }
    | null
    | undefined,
): WalletAvailability {
  return {
    applePay: Boolean(paymentMethods?.applePay?.available),
    googlePay: Boolean(paymentMethods?.googlePay?.available),
  }
}
