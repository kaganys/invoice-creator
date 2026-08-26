import { createD1InvoiceStore } from '../invoices/d1Store.ts'
import { createD1PaymentTokenStore } from '../payments/d1Store.ts'
import {
  confirmPublicPayment,
  createPublicPaymentIntent,
} from '../payments/intent.ts'
import { createD1StripeIntentStore } from '../payments/intentStore.ts'
import { createD1PaymentLedger } from '../payments/ledger.ts'
import { getPublicInvoiceByToken } from '../payments/public.ts'
import { createStripeGateway } from '../payments/stripeClient.ts'
import type { Router } from '../router.ts'
import { createD1SettingsStore } from '../settings/d1Store.ts'
import { stripeSecretKey } from '../settings/env.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import { parsePaymentsJson } from '../settings/payments.ts'

async function loadPayments(env: Env) {
  const raw = await createD1SettingsStore(env.DB).get(SETTINGS_KEYS.payments)
  return parsePaymentsJson(raw)
}

export function registerPublicRoutes(router: Router): void {
  router.get('/api/public/invoices/:token', async (_request, env, _ctx, params) => {
    const payments = await loadPayments(env)
    const secret = stripeSecretKey(env)
    return getPublicInvoiceByToken(params.token ?? '', {
      tokens: createD1PaymentTokenStore(env.DB),
      invoices: createD1InvoiceStore(env.DB),
      payments,
      stripeSecretConfigured: Boolean(secret),
    })
  })

  router.post(
    '/api/public/invoices/:token/payment-intent',
    async (request, env, _ctx, params) => {
      const payments = await loadPayments(env)
      const secret = stripeSecretKey(env)
      return createPublicPaymentIntent(params.token ?? '', request, {
        tokens: createD1PaymentTokenStore(env.DB),
        invoices: createD1InvoiceStore(env.DB),
        intents: createD1StripeIntentStore(env.DB),
        stripe: secret ? createStripeGateway(secret) : undefined,
        payments,
        stripeSecret: secret,
        ledger: createD1PaymentLedger(env.DB),
      })
    },
  )

  router.post(
    '/api/public/invoices/:token/confirm',
    async (request, env, _ctx, params) => {
      const payments = await loadPayments(env)
      const secret = stripeSecretKey(env)
      return confirmPublicPayment(params.token ?? '', request, {
        tokens: createD1PaymentTokenStore(env.DB),
        invoices: createD1InvoiceStore(env.DB),
        intents: createD1StripeIntentStore(env.DB),
        stripe: secret ? createStripeGateway(secret) : undefined,
        payments,
        stripeSecret: secret,
        ledger: createD1PaymentLedger(env.DB),
      })
    },
  )
}
