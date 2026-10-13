import { errorJson } from '../http.ts'
import { isUuid } from '../lib/ids.ts'
import { createD1InvoiceStore } from '../invoices/d1Store.ts'
import { createD1PaymentTokenStore } from '../payments/d1Store.ts'
import { createD1PaymentLedger } from '../payments/ledger.ts'
import { handleStripeWebhook } from '../payments/webhook.ts'
import type { Router } from '../router.ts'
import { stripeWebhookSecret } from '../settings/env.ts'
import {
  createD1CompanySecretStore,
  resolveCompanyOrPlatformSecret,
} from '../secrets/d1Store.ts'

export function registerWebhookRoutes(router: Router): void {
  router.post('/api/webhooks/stripe', (request, env) =>
    handleStripeWebhook(request, {
      invoices: createD1InvoiceStore(env.DB),
      tokens: createD1PaymentTokenStore(env.DB),
      ledger: createD1PaymentLedger(env.DB),
      webhookSecret: stripeWebhookSecret(env),
    }),
  )

  router.post('/api/webhooks/stripe/:companyId', async (request, env, _ctx, params) => {
    const companyId = params.companyId ?? ''
    if (!isUuid(companyId)) {
      return errorJson('Not found', 404)
    }
    const resolved = await resolveCompanyOrPlatformSecret(
      createD1CompanySecretStore(env.DB),
      companyId,
      'stripe_webhook_secret',
      env,
      stripeWebhookSecret(env),
    )
    return handleStripeWebhook(request, {
      invoices: createD1InvoiceStore(env.DB),
      tokens: createD1PaymentTokenStore(env.DB),
      ledger: createD1PaymentLedger(env.DB),
      webhookSecret: resolved.value,
    })
  })
}
