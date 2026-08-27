export type PaymentCategory = 'card' | 'ach'

export type PaymentQuote = {
  category: PaymentCategory
  baseCents: number
  surchargeCents: number
  totalCents: number
}

const CARD_TYPES = new Set(['card', 'link', 'card_present'])

const CARD_WALLETS = new Set([
  'apple_pay',
  'google_pay',
  'samsung_pay',
  'link',
])

const ACH_TYPES = new Set(['us_bank_account', 'ach_debit'])

/**
 * Server-authoritative classification of a Stripe payment-method type.
 * Wallets backed by cards (Apple Pay / Google Pay) are card-like.
 */
export function classifyStripePaymentMethod(
  type?: string | null,
  walletType?: string | null,
): PaymentCategory | null {
  const method = (type ?? '').trim().toLowerCase()
  const wallet = (walletType ?? '').trim().toLowerCase()
  if (!method && !wallet) {
    return null
  }
  if (ACH_TYPES.has(method)) {
    return 'ach'
  }
  if (CARD_WALLETS.has(wallet) || CARD_WALLETS.has(method)) {
    return 'card'
  }
  if (CARD_TYPES.has(method)) {
    return 'card'
  }
  return null
}

export function quoteForCategory(
  baseCents: number,
  cardFeeCents: number,
  category: PaymentCategory,
): PaymentQuote {
  const base = Math.max(0, Math.trunc(baseCents))
  const fee = Math.max(0, Math.trunc(cardFeeCents))
  if (category === 'ach') {
    return {
      category,
      baseCents: base,
      surchargeCents: 0,
      totalCents: base,
    }
  }
  return {
    category,
    baseCents: base,
    surchargeCents: fee,
    totalCents: base + fee,
  }
}

export function displayQuote(
  baseCents: number,
  cardFeeCents: number,
  selectedType: string | null | undefined,
  fallback: PaymentCategory,
): PaymentQuote {
  const category =
    classifyStripePaymentMethod(selectedType) ?? fallback
  return quoteForCategory(baseCents, cardFeeCents, category)
}

export function paidMethodFor(
  category: PaymentCategory,
  walletType?: string | null,
): 'card' | 'ach' | 'apple_pay' | 'google_pay' {
  if (category === 'ach') {
    return 'ach'
  }
  const wallet = (walletType ?? '').trim().toLowerCase()
  if (wallet === 'apple_pay') {
    return 'apple_pay'
  }
  if (wallet === 'google_pay') {
    return 'google_pay'
  }
  return 'card'
}
