/** Standard secret keys (sk_) and restricted keys (rk_), test or live. */
const STRIPE_SECRET_KEY = /^(?:sk|rk)_(?:test|live)_\S+$/

export const STRIPE_SECRET_KEY_MESSAGE =
  'Stripe secret key must start with sk_ or rk_.'

export function isStripeSecretKey(value: string): boolean {
  return STRIPE_SECRET_KEY.test(value.trim())
}

/** Empty input means "leave the saved key". A pasted key must be sk_ or rk_. */
export function stripeSecretKeyError(value: string): string | null {
  const key = value.trim()
  if (!key || isStripeSecretKey(key)) {
    return null
  }
  return STRIPE_SECRET_KEY_MESSAGE
}
