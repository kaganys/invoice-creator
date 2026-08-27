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

function pdfDeps(env: Env, request: Request) {
  return {
    store: createD1InvoiceStore(env.DB),
    settings: createD1SettingsStore(env.DB),
    pdf: createBrowserPdfRenderer(browserBinding(env)),
    origin: new URL(request.url).origin,
    tokens: createD1PaymentTokenStore(env.DB),
    paymentLinkKey: paymentLinkKeySecret(env),
    paymentBaseUrl: publicPaymentBaseUrlConfig(env),
  }
}

function paymentLinkDeps(env: Env, request: Request) {
  return {
    invoices: createD1InvoiceStore(env.DB),
    tokens: createD1PaymentTokenStore(env.DB),
    paymentLinkKey: paymentLinkKeySecret(env),
    baseUrl: adminDisplayPaymentBaseUrl(
      publicPaymentBaseUrlConfig(env),
      new URL(request.url).origin,
    ),
  }
}

export function registerInvoiceRoutes(router: Router): void {
  router.get('/api/invoices', (_request, env) =>
    listInvoices(createD1InvoiceStore(env.DB)),
  )

  router.post('/api/invoices', (request, env) =>
    createInvoice(request, createD1InvoiceStore(env.DB)),
  )

  router.post('/api/invoices/preview-pdf', (request, env) =>
    previewInvoicePdf(request, pdfDeps(env, request)),
  )

  router.get('/api/invoices/:id', (_request, env, _ctx, params) =>
    getInvoice(params.id ?? '', createD1InvoiceStore(env.DB)),
  )

  router.put('/api/invoices/:id', (request, env, _ctx, params) =>
    updateInvoice(params.id ?? '', request, createD1InvoiceStore(env.DB)),
  )

  router.delete('/api/invoices/:id', (_request, env, _ctx, params) =>
    deleteInvoice(params.id ?? '', createD1InvoiceStore(env.DB)),
  )

  router.get('/api/invoices/:id/pdf', (request, env, _ctx, params) =>
    getInvoicePdf(params.id ?? '', pdfDeps(env, request)),
  )

  router.get('/api/invoices/:id/emails', (_request, env, _ctx, params) =>
    listInvoiceEmails(params.id ?? '', createD1InvoiceStore(env.DB)),
  )

  router.post('/api/invoices/:id/send', (request, env, _ctx, params) =>
    sendInvoice(params.id ?? '', request, {
      ...pdfDeps(env, request),
      smtpPassword: smtpPasswordSecret(env),
      tokens: createD1PaymentTokenStore(env.DB),
      paymentLinkKey: paymentLinkKeySecret(env),
      paymentBaseUrl: publicPaymentBaseUrlConfig(env),
    }),
  )

  router.get('/api/invoices/:id/payment-link', (request, env, _ctx, params) =>
    getInvoicePaymentLink(params.id ?? '', paymentLinkDeps(env, request)),
  )

  router.post(
    '/api/invoices/:id/payment-link/regenerate',
    (request, env, _ctx, params) =>
      regenerateInvoicePaymentLink(params.id ?? '', paymentLinkDeps(env, request)),
  )

  router.post(
    '/api/invoices/:id/payment-link/revoke',
    (request, env, _ctx, params) =>
      revokeInvoicePaymentLink(params.id ?? '', paymentLinkDeps(env, request)),
  )

  router.post('/api/invoices/:id/mark-paid', async (request, env, _ctx, params) => {
    const store = createD1InvoiceStore(env.DB)
    const response = await markInvoicePaid(params.id ?? '', request, store)
    if (response.ok) {
      const format = await loadCurrentFormat(createD1SettingsStore(env.DB))
      await store.snapshotFormat(params.id ?? '', serializeFormat(format), nowIso())
    }
    return response
  })

  router.post('/api/invoices/:id/void', async (request, env, _ctx, params) => {
    const store = createD1InvoiceStore(env.DB)
    const response = await voidInvoice(params.id ?? '', request, store)
    if (response.ok) {
      const format = await loadCurrentFormat(createD1SettingsStore(env.DB))
      await store.snapshotFormat(params.id ?? '', serializeFormat(format), nowIso())
    }
    return response
  })
}
