import { createD1InvoiceStore } from '../invoices/d1Store.ts'
import { consistentDb } from '../lib/d1Session.ts'
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
import type { PaymentIntentContact } from '../payments/paymentIntentFields.ts'
import { createD1TenantStore } from '../tenancy/d1Store.ts'
import { stripeSecretKey } from '../settings/env.ts'
import {
  createD1CompanySecretStore,
  resolveCompanyOrPlatformSecret,
} from '../secrets/d1Store.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import { parsePaymentsJson } from '../settings/payments.ts'

function stripeResolver(env: Env) {
  const secrets = createD1CompanySecretStore(env.DB)
  return (companyId: string) =>
    resolveCompanyOrPlatformSecret(
      secrets,
      companyId,
      'stripe_secret',
      env,
      stripeSecretKey(env),
    ).then((resolved) => resolved.value)
}

async function loadPayments(env: Env, companyId: string) {
  const raw = await createD1SettingsStore(env.DB, companyId).get(
    SETTINGS_KEYS.payments,
  )
  return parsePaymentsJson(raw)
}

function customerPersonLoader(db: D1Database) {
  return async (
    companyId: string,
    email: string,
  ): Promise<PaymentIntentContact | null> => {
    const row = await db
      .prepare(
        `SELECT name, email, address_line1, address_line2, city, state_region, postal_code, country
         FROM people
         WHERE company_id = ? AND lower(email) = lower(?)
         LIMIT 1`,
      )
      .bind(companyId, email)
      .first<{
        name: string
        email: string
        address_line1: string
        address_line2: string
        city: string
        state_region: string
        postal_code: string
        country: string
      }>()
    if (!row) {
      return null
    }
    return {
      name: row.name,
      email: row.email,
      address: {
        line1: row.address_line1,
        line2: row.address_line2,
        city: row.city,
        region: row.state_region,
        postalCode: row.postal_code,
        country: row.country,
      },
    }
  }
}

function companyNameLoader(db: D1Database) {
  const tenants = createD1TenantStore(db)
  return async (companyId: string) => {
    const company = await tenants.getCompany(companyId)
    return company?.name ?? null
  }
}

export function registerPublicRoutes(router: Router): void {
  router.get('/api/public/invoices/:token', async (_request, env, _ctx, params) => {
    const db = consistentDb(env.DB)
    const secret = stripeSecretKey(env)
    return getPublicInvoiceByToken(params.token ?? '', {
      tokens: createD1PaymentTokenStore(db),
      invoices: createD1InvoiceStore(db),
      loadPaymentsForCompany: (companyId) => loadPayments(env, companyId),
      stripeSecretConfigured: Boolean(secret),
      resolveStripeSecret: stripeResolver(env),
    })
  })

  router.post(
    '/api/public/invoices/:token/payment-intent',
    async (request, env, _ctx, params) => {
      const db = consistentDb(env.DB)
      const secret = stripeSecretKey(env)
      return createPublicPaymentIntent(params.token ?? '', request, {
        tokens: createD1PaymentTokenStore(db),
        invoices: createD1InvoiceStore(db),
        intents: createD1StripeIntentStore(db),
        stripe: secret ? createStripeGateway(secret) : undefined,
        payments: parsePaymentsJson(null),
        loadPaymentsForCompany: (companyId) => loadPayments(env, companyId),
        loadCompanyName: companyNameLoader(db),
        loadCustomerPerson: customerPersonLoader(db),
        stripeSecret: secret,
        resolveStripeSecret: stripeResolver(env),
        ledger: createD1PaymentLedger(db),
      })
    },
  )

  router.post(
    '/api/public/invoices/:token/confirm',
    async (request, env, _ctx, params) => {
      const db = consistentDb(env.DB)
      const secret = stripeSecretKey(env)
      return confirmPublicPayment(params.token ?? '', request, {
        tokens: createD1PaymentTokenStore(db),
        invoices: createD1InvoiceStore(db),
        intents: createD1StripeIntentStore(db),
        stripe: secret ? createStripeGateway(secret) : undefined,
        payments: parsePaymentsJson(null),
        loadPaymentsForCompany: (companyId) => loadPayments(env, companyId),
        loadCompanyName: companyNameLoader(db),
        loadCustomerPerson: customerPersonLoader(db),
        stripeSecret: secret,
        resolveStripeSecret: stripeResolver(env),
        ledger: createD1PaymentLedger(db),
      })
    },
  )
}
