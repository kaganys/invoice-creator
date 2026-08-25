import { createD1InvoiceStore } from '../invoices/d1Store.ts'
import { createD1PaymentTokenStore } from '../payments/d1Store.ts'
import { createD1PaymentLedger } from '../payments/ledger.ts'
import { handleStripeWebhook } from '../payments/webhook.ts'
import type { Router } from '../router.ts'
import { stripeWebhookSecret } from '../settings/env.ts'

export function registerWebhookRoutes(router: Router): void {
  router.post('/api/webhooks/stripe', (request, env) =>
    handleStripeWebhook(request, {
      invoices: createD1InvoiceStore(env.DB),
      tokens: createD1PaymentTokenStore(env.DB),
      ledger: createD1PaymentLedger(env.DB),
      webhookSecret: stripeWebhookSecret(env),
    }),
  )
}
