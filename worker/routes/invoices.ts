import { requireAdmin } from '../auth/admin.ts'
import { createD1InvoiceStore } from '../invoices/d1Store.ts'
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  markInvoicePaid,
  updateInvoice,
  voidInvoice,
} from '../invoices/handlers.ts'
import { getInvoicePdf, loadCurrentFormat, previewInvoicePdf } from '../invoices/pdf.ts'
import { listInvoiceEmails, sendInvoice } from '../invoices/send.ts'
import {
  getInvoicePaymentLink,
  regenerateInvoicePaymentLink,
  revokeInvoicePaymentLink,
} from '../payments/admin.ts'
import { createD1PaymentTokenStore } from '../payments/d1Store.ts'
import { adminDisplayPaymentBaseUrl } from '../payments/tokenCrypto.ts'
import { createBrowserPdfRenderer } from '../pdf/browserPdf.ts'
import type { Router } from '../router.ts'
import { createD1SettingsStore } from '../settings/d1Store.ts'
import {
  browserBinding,
  paymentLinkKeySecret,
  publicPaymentBaseUrlConfig,
  smtpPasswordSecret,
} from '../settings/env.ts'
import { serializeFormat } from '../settings/format.ts'
import { nowIso } from '../lib/ids.ts'
import {
  createD1CompanySecretStore,
  resolveCompanyOrPlatformSecret,
} from '../secrets/d1Store.ts'

function pdfDeps(env: Env, request: Request, companyId: string) {
  return {
    store: createD1InvoiceStore(env.DB, companyId),
    settings: createD1SettingsStore(env.DB, companyId),
    pdf: createBrowserPdfRenderer(browserBinding(env)),
    origin: new URL(request.url).origin,
    tokens: createD1PaymentTokenStore(env.DB),
    paymentLinkKey: paymentLinkKeySecret(env),
    paymentBaseUrl: publicPaymentBaseUrlConfig(env),
  }
}

function paymentLinkDeps(env: Env, request: Request, companyId: string) {
  return {
    invoices: createD1InvoiceStore(env.DB, companyId),
    tokens: createD1PaymentTokenStore(env.DB),
    paymentLinkKey: paymentLinkKeySecret(env),
    baseUrl: adminDisplayPaymentBaseUrl(
      publicPaymentBaseUrlConfig(env),
      new URL(request.url).origin,
    ),
  }
}

export function registerInvoiceRoutes(router: Router): void {
  router.get('/api/invoices', async (request, env) => {
    const auth = await requireAdmin(request, env, 'invoices.view')
    if (!auth.ok) {
      return auth.response
    }
    return listInvoices(createD1InvoiceStore(env.DB, auth.ctx.company.id))
  })

  router.post('/api/invoices', async (request, env) => {
    const auth = await requireAdmin(request, env, 'invoices.create')
    if (!auth.ok) {
      return auth.response
    }
    return createInvoice(request, createD1InvoiceStore(env.DB, auth.ctx.company.id))
  })

  router.post('/api/invoices/preview-pdf', async (request, env) => {
    const auth = await requireAdmin(request, env, 'invoices.view')
    if (!auth.ok) {
      return auth.response
    }
    return previewInvoicePdf(request, pdfDeps(env, request, auth.ctx.company.id))
  })

  router.get('/api/invoices/:id', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.view')
    if (!auth.ok) {
      return auth.response
    }
    return getInvoice(
      params.id ?? '',
      createD1InvoiceStore(env.DB, auth.ctx.company.id),
    )
  })

  router.put('/api/invoices/:id', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.edit')
    if (!auth.ok) {
      return auth.response
    }
    return updateInvoice(
      params.id ?? '',
      request,
      createD1InvoiceStore(env.DB, auth.ctx.company.id),
    )
  })

  router.delete('/api/invoices/:id', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.delete')
    if (!auth.ok) {
      return auth.response
    }
    return deleteInvoice(
      params.id ?? '',
      createD1InvoiceStore(env.DB, auth.ctx.company.id),
    )
  })

  router.get('/api/invoices/:id/pdf', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.view')
    if (!auth.ok) {
      return auth.response
    }
    return getInvoicePdf(
      params.id ?? '',
      pdfDeps(env, request, auth.ctx.company.id),
    )
  })

  router.get('/api/invoices/:id/emails', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.view')
    if (!auth.ok) {
      return auth.response
    }
    return listInvoiceEmails(
      params.id ?? '',
      createD1InvoiceStore(env.DB, auth.ctx.company.id),
    )
  })

  router.post('/api/invoices/:id/send', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.send')
    if (!auth.ok) {
      return auth.response
    }
    const smtp = await resolveCompanyOrPlatformSecret(
      createD1CompanySecretStore(env.DB),
      auth.ctx.company.id,
      'smtp_password',
      env,
      smtpPasswordSecret(env),
    )
    return sendInvoice(params.id ?? '', request, {
      ...pdfDeps(env, request, auth.ctx.company.id),
      smtpPassword: smtp.value,
      tokens: createD1PaymentTokenStore(env.DB),
      paymentLinkKey: paymentLinkKeySecret(env),
      paymentBaseUrl: publicPaymentBaseUrlConfig(env),
    })
  })

  router.get('/api/invoices/:id/payment-link', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.view')
    if (!auth.ok) {
      return auth.response
    }
    return getInvoicePaymentLink(
      params.id ?? '',
      paymentLinkDeps(env, request, auth.ctx.company.id),
    )
  })

  router.post(
    '/api/invoices/:id/payment-link/regenerate',
    async (request, env, _ctx, params) => {
      const auth = await requireAdmin(request, env, 'invoices.send')
      if (!auth.ok) {
        return auth.response
      }
      return regenerateInvoicePaymentLink(
        params.id ?? '',
        paymentLinkDeps(env, request, auth.ctx.company.id),
      )
    },
  )

  router.post(
    '/api/invoices/:id/payment-link/revoke',
    async (request, env, _ctx, params) => {
      const auth = await requireAdmin(request, env, 'invoices.void')
      if (!auth.ok) {
        return auth.response
      }
      return revokeInvoicePaymentLink(
        params.id ?? '',
        paymentLinkDeps(env, request, auth.ctx.company.id),
      )
    },
  )

  router.post('/api/invoices/:id/mark-paid', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.mark_paid')
    if (!auth.ok) {
      return auth.response
    }
    const store = createD1InvoiceStore(env.DB, auth.ctx.company.id)
    const response = await markInvoicePaid(params.id ?? '', request, store)
    if (response.ok) {
      const format = await loadCurrentFormat(
        createD1SettingsStore(env.DB, auth.ctx.company.id),
      )
      await store.snapshotFormat(params.id ?? '', serializeFormat(format), nowIso())
    }
    return response
  })

  router.post('/api/invoices/:id/void', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'invoices.void')
    if (!auth.ok) {
      return auth.response
    }
    const store = createD1InvoiceStore(env.DB, auth.ctx.company.id)
    const response = await voidInvoice(params.id ?? '', request, store)
    if (response.ok) {
      const format = await loadCurrentFormat(
        createD1SettingsStore(env.DB, auth.ctx.company.id),
      )
      await store.snapshotFormat(params.id ?? '', serializeFormat(format), nowIso())
    }
    return response
  })
}
