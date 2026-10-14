/**
 * The ordered payment method list for one checkout.
 *
 * Stripe requires Elements `allowedPaymentMethodTypes` and the PaymentIntent
 * confirm `payment_method_types` to be the same list, including order.
 * Apple Pay and Google Pay are card payments and do not add a type. Link is
 * included whenever cards are available.
 */
export function checkoutPaymentMethodTypes(input: {
  card: boolean
  ach: boolean
}): string[] {
  const types: string[] = []
  if (input.card) {
    types.push('card')
  }
  if (input.ach) {
    types.push('us_bank_account')
  }
  if (input.card) {
    types.push('link')
  }
  return types
}
