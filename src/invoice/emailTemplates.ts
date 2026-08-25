import { formatInvoiceDate } from '../utils/dates.ts'
import { calculateInvoiceTotals } from '../utils/invoiceCalculations.ts'
import { formatMoney } from '../utils/money.ts'
import type { Invoice } from '../types/invoice.ts'

export const DEFAULT_EMAIL_SUBJECT =
  'Invoice {{invoice_number}} from {{business_name}}'

export const DEFAULT_EMAIL_BODY = `Hello {{customer_name}},

Please find invoice {{invoice_number}} attached.

Amount due: {{amount}}
Due date: {{due_date}}

{{payment_memo}}

If you prefer Zelle, send payment to {{zelle_email}}.

Thank you,
{{business_name}}`

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/gi

export type TemplateVars = {
  invoice_number: string
  customer_name: string
  business_name: string
  amount: string
  due_date: string
  zelle_email: string
  payment_memo: string
}

export function invoiceTemplateVars(invoice: Invoice): TemplateVars {
  const totals = calculateInvoiceTotals(invoice)
  return {
    invoice_number: invoice.number.trim() || 'invoice',
    customer_name: invoice.customer.name.trim() || 'there',
    business_name: invoice.from.name.trim() || 'Bitz Designs',
    amount: `${formatMoney(totals.amountDueCents, invoice.currency)} ${invoice.currency}`,
    due_date: formatInvoiceDate(invoice.dueDate) || 'upon receipt',
    zelle_email: invoice.payment.zelleEmail.trim() || 'billing@bitzdesigns.co',
    payment_memo: invoice.payment.memo.trim(),
  }
}

export function applyEmailTemplate(template: string, vars: TemplateVars): string {
  return template.replace(TOKEN, (_full, key: string) => {
    const value = vars[key as keyof TemplateVars]
    return value == null ? '' : value
  })
}

export function containsHeaderInjection(value: string): boolean {
  return /[\r\n]/.test(value)
}

export type EmailTemplateSettings = {
  subject: string
  body: string
}

export function defaultEmailTemplates(): EmailTemplateSettings {
  return {
    subject: DEFAULT_EMAIL_SUBJECT,
    body: DEFAULT_EMAIL_BODY,
  }
}

const MAX_SUBJECT = 200
const MAX_BODY = 8000

export function validateEmailTemplates(
  input: unknown,
): { ok: true; value: EmailTemplateSettings } | { ok: false; message: string } {
  const defaults = defaultEmailTemplates()
  if (input == null) {
    return { ok: true, value: defaults }
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'Email templates must be a JSON object.' }
  }
  const record = input as Record<string, unknown>
  const subjectRaw =
    typeof record.subject === 'string' ? record.subject : defaults.subject
  const bodyRaw = typeof record.body === 'string' ? record.body : defaults.body
  const subject = subjectRaw.trim() || defaults.subject
  const body = bodyRaw.trim() || defaults.body
  if (subject.length > MAX_SUBJECT) {
    return { ok: false, message: 'Email subject template is too long.' }
  }
  if (body.length > MAX_BODY) {
    return { ok: false, message: 'Email body template is too long.' }
  }
  if (containsHeaderInjection(subject)) {
    return { ok: false, message: 'Email subject template cannot contain line breaks.' }
  }
  return { ok: true, value: { subject, body } }
}
