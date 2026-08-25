import { createD1InvoiceStore } from '../invoices/d1Store.ts'
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
} from '../invoices/handlers.ts'
import type { Router } from '../router.ts'

export function registerInvoiceRoutes(router: Router): void {
  router.get('/api/invoices', (_request, env) =>
    listInvoices(createD1InvoiceStore(env.DB)),
  )

  router.post('/api/invoices', (request, env) =>
    createInvoice(request, createD1InvoiceStore(env.DB)),
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
}
