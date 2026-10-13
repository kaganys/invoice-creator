import { createDefaultInvoice } from '../../data/defaultInvoice.ts'
import type { Invoice } from '../../types/invoice.ts'

export function previewInvoice(logoPath: string): Invoice {
  const invoice = createDefaultInvoice()
  invoice.number = 'BD2026-0051'
  invoice.issueDate = '2026-10-13'
  invoice.dueDate = '2026-11-12'
  invoice.from = {
    ...invoice.from,
    name: 'Northwind Studio',
    email: 'billing@northwind.example',
  }
  invoice.customer = {
    ...invoice.customer,
    name: 'Harbor & Co',
    email: 'ap@harbor.example',
  }
  invoice.lineItems = [
    {
      id: 'preview-line',
      description: 'Design retainer',
      quantity: '1',
      unitPrice: '1200.00',
    },
  ]
  invoice.payment = {
    ...invoice.payment,
    memo: 'Pay from the link in this invoice, or by Zelle.',
    zelleEmail: 'billing@northwind.example',
  }
  invoice.notes = 'March design work.'
  invoice.invoiceLogo = { path: logoPath }
  return invoice
}
