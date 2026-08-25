import {
  absolutePublicAssetUrl,
  prepareInvoiceEmail,
} from '../../src/invoice/emailHtml.ts'
import {
  applyEmailTemplate,
  containsHeaderInjection,
  invoiceTemplateVars,
  MAX_EMAIL_BODY,
  MAX_EMAIL_SUBJECT,
} from '../../src/invoice/emailTemplates.ts'
import { serializeFormat } from '../settings/format.ts'
import { invoicePdfFilename } from '../../src/utils/invoiceFilename.ts'
import { errorJson, json } from '../http.ts'
import { bytesToBase64 } from '../lib/bytes.ts'
import { createEntityId, isUuid, nowIso } from '../lib/ids.ts'
import { asTrimmedString, isRecord, readJsonBody } from '../lib/json.ts'
import type { MailTransport } from '../mail/types.ts'
import { createSmtpTransport } from '../mail/smtpTransport.ts'
import { parseBrandingJson } from '../settings/branding.ts'
import { parseSmtpJson, smtpPasswordConfigured } from '../settings/smtp.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import type { SettingsKvStore } from '../settings/types.ts'
import { invoiceFromRecord } from './document.ts'
import { publicEmailLog, publicInvoice } from './public.ts'
import {
  renderInvoicePdfBytes,
  resolveInvoiceFormat,
  type PdfDeps,
} from './pdf.ts'
import { ensureCustomerPaymentUrl } from '../payments/paymentUrl.ts'
import {
  parsePublicPaymentBaseUrl,
  usesPaymentUrlPlaceholder,
} from '../payments/tokenCrypto.ts'
import type { PaymentTokenStore } from '../payments/types.ts'
import type { InvoiceStore } from './types.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type SendDeps = PdfDeps & {
  smtpPassword?: string
  idFactory?: () => string
  mailFactory?: (config: ReturnType<typeof parseSmtpJson>, password: string) => MailTransport
  tokens?: PaymentTokenStore
  paymentLinkKey?: string
  paymentBaseUrl?: string
}

function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value) && value.length <= 254 && !containsHeaderInjection(value)
}

function rejectHeader(value: string, label: string): string | null {
  if (containsHeaderInjection(value)) {
    return `${label} cannot contain line breaks.`
  }
  return null
}

export async function listInvoiceEmails(
  id: string,
  store: InvoiceStore,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid invoice id.', 400)
  }
  const invoice = await store.get(id)
  if (!invoice) {
    return errorJson('Invoice not found.', 404)
  }
  const logs = await store.listEmailLogs(id, 50)
  return json({
    firstSentAt: invoice.firstSentAt,
    lastSentAt: invoice.lastSentAt,
    sendCount: invoice.sendCount,
    emails: logs.map(publicEmailLog),
  })
}

async function loadSmtp(settings: SettingsKvStore) {
  return parseSmtpJson(await settings.get(SETTINGS_KEYS.smtp))
}

export async function sendInvoice(
  id: string,
  request: Request,
  deps: SendDeps,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorJson('Invalid invoice id.', 400)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('Send data must be a JSON object.', 400)
  }

  const record = await deps.store.get(id)
  if (!record) {
    return errorJson('Invoice not found.', 404)
  }
  if (record.status === 'void') {
    return errorJson('A voided invoice cannot be sent.', 409)
  }

  const smtp = await loadSmtp(deps.settings)
  if (!smtp.host || !smtp.fromEmail) {
    return errorJson(
      'SMTP is not configured. Add a host and From email in Settings → Email / SMTP.',
      400,
    )
  }
  if (!smtpPasswordConfigured(deps.smtpPassword)) {
    return errorJson(
      'SMTP password is not configured. Set the SMTP_PASSWORD Worker secret.',
      400,
    )
  }
  if (smtp.port === 25) {
    return errorJson('Outbound SMTP on port 25 is not supported.', 400)
  }

  const invoice = invoiceFromRecord(record)
  const subjectTemplate =
    asTrimmedString(body.value.subject) || smtp.subjectTemplate
  const bodyTemplate =
    typeof body.value.body === 'string' && body.value.body.trim()
      ? body.value.body
      : smtp.bodyTemplate
  const needsPaymentUrl =
    usesPaymentUrlPlaceholder(subjectTemplate) ||
    usesPaymentUrlPlaceholder(bodyTemplate)
  const customerBase = parsePublicPaymentBaseUrl(deps.paymentBaseUrl)
  if (needsPaymentUrl && !customerBase.ok) {
    return errorJson(customerBase.message, 400)
  }

  let paymentUrl = ''
  if (deps.tokens && record.status !== 'paid') {
    const ensured = await ensureCustomerPaymentUrl(id, {
      tokens: deps.tokens,
      paymentLinkKey: deps.paymentLinkKey,
      baseUrl: customerBase.ok ? customerBase.value : '',
      clock: deps.clock,
      idFactory: deps.idFactory,
    })
    if (!ensured.ok) {
      return errorJson(ensured.message, 400)
    }
    if (customerBase.ok) {
      paymentUrl = ensured.url
    }
  }
  if (needsPaymentUrl && !paymentUrl) {
    return errorJson(
      'Cannot send this email because {{payment_url}} is used but no customer-facing payment URL could be built. Set PUBLIC_PAYMENT_BASE_URL and PAYMENT_LINK_KEY.',
      400,
    )
  }

  const vars = invoiceTemplateVars(invoice, { paymentUrl })
  const branding = parseBrandingJson(
    await deps.settings.get(SETTINGS_KEYS.branding),
  )
  // Prefer the public payment origin so Access on invoice.vrfnw.com does not
  // block logo/wordmark images in email clients.
  const assetOrigin = customerBase.ok ? customerBase.value : ''
  const recipient = asTrimmedString(body.value.recipient) || invoice.customer.email
  const subject = applyEmailTemplate(subjectTemplate, vars)
  const prepared = prepareInvoiceEmail(bodyTemplate, vars, {
    logoUrl: absolutePublicAssetUrl(assetOrigin, branding.siteIcon.path),
    wordmarkUrl: absolutePublicAssetUrl(
      assetOrigin,
      branding.siteWordmark.path,
    ),
  })
  const text = prepared.text
  const html = prepared.html
  const idempotencyKey = asTrimmedString(body.value.idempotencyKey)

  if (!isEmail(recipient)) {
    return errorJson('Recipient email is not valid.', 400)
  }
  if (!isEmail(smtp.fromEmail)) {
    return errorJson('SMTP From email is not valid.', 400)
  }
  if (smtp.replyTo && !isEmail(smtp.replyTo)) {
    return errorJson('SMTP Reply-To email is not valid.', 400)
  }
  for (const [label, value] of [
    ['Recipient', recipient],
    ['Subject', subject],
    ['From name', smtp.fromName],
    ['From email', smtp.fromEmail],
    ['Reply-To', smtp.replyTo],
  ] as const) {
    const injected = rejectHeader(value, label)
    if (injected) {
      return errorJson(injected, 400)
    }
  }
  if (subject.length > MAX_EMAIL_SUBJECT) {
    return errorJson('Subject is too long.', 400)
  }
  if (bodyTemplate.length > MAX_EMAIL_BODY) {
    return errorJson('Email body is too long.', 400)
  }

  if (idempotencyKey) {
    if (idempotencyKey.length > 80) {
      return errorJson('Idempotency key is too long.', 400)
    }
    const existing = await deps.store.getEmailLogByIdempotency(idempotencyKey)
    if (existing) {
      const latest = await deps.store.get(id)
      return json(
        {
          invoice: latest ? publicInvoice(latest) : publicInvoice(record),
          email: publicEmailLog(existing),
          idempotent: true,
        },
        { status: existing.success ? 200 : 409 },
      )
    }
  }

  const clock = deps.clock ?? nowIso
  const idFactory = deps.idFactory ?? createEntityId
  const attemptedAt = clock()
  const logId = idFactory()
  const insert = await deps.store.insertEmailLog({
    id: logId,
    invoiceId: id,
    attemptedAt,
    completedAt: null,
    recipient,
    subject,
    success: false,
    smtpMessageId: null,
    errorCategory: null,
    errorMessage: null,
    idempotencyKey: idempotencyKey || null,
  })
  if (insert === 'duplicate' && idempotencyKey) {
    const existing = await deps.store.getEmailLogByIdempotency(idempotencyKey)
    const latest = await deps.store.get(id)
    return json(
      {
        invoice: latest ? publicInvoice(latest) : publicInvoice(record),
        email: existing ? publicEmailLog(existing) : null,
        idempotent: true,
      },
      { status: existing?.success ? 200 : 409 },
    )
  }

  const format = await resolveInvoiceFormat(record, deps)
  const filename = invoicePdfFilename(invoice.number)
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await renderInvoicePdfBytes(invoice, format, deps, {
      paymentUrl,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not generate the invoice PDF.'
    await deps.store.updateEmailLog(logId, {
      completedAt: clock(),
      success: false,
      smtpMessageId: null,
      errorCategory: 'pdf',
      errorMessage: message,
    })
    return errorJson(message, 502)
  }

  const mailFactory =
    deps.mailFactory ??
    ((config, password) => createSmtpTransport(config, password))
  const transport = mailFactory(smtp, deps.smtpPassword ?? '')

  try {
    const result = await transport.send({
      fromName: smtp.fromName || invoice.from.name || 'Bitz Designs',
      fromEmail: smtp.fromEmail,
      replyTo: smtp.replyTo || undefined,
      to: recipient,
      subject,
      text,
      html,
      attachments: [
        {
          filename,
          contentBase64: bytesToBase64(pdfBytes),
          mimeType: 'application/pdf',
        },
      ],
    })
    const completedAt = clock()
    await deps.store.updateEmailLog(logId, {
      completedAt,
      success: true,
      smtpMessageId: result.messageId ?? null,
      errorCategory: null,
      errorMessage: null,
    })

    const nextStatus = record.status === 'draft' ? 'sent' : record.status
    const sendCount = record.sendCount + 1
    const firstSentAt = record.firstSentAt ?? completedAt
    await deps.store.applySendSuccess(id, {
      status: nextStatus,
      firstSentAt,
      lastSentAt: completedAt,
      sendCount,
      formatJson: serializeFormat(format),
      updatedAt: completedAt,
    })
    const latest = await deps.store.get(id)
    return json({
      invoice: latest ? publicInvoice(latest) : publicInvoice(record),
      email: {
        id: logId,
        attemptedAt,
        completedAt,
        recipient,
        subject,
        success: true,
        smtpMessageId: result.messageId ?? null,
        errorCategory: null,
        errorMessage: null,
        filename,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'SMTP delivery failed.'
    await deps.store.updateEmailLog(logId, {
      completedAt: clock(),
      success: false,
      smtpMessageId: null,
      errorCategory: 'smtp',
      errorMessage: message,
    })
    const latest = await deps.store.get(id)
    return errorJson(message, 502, {
      invoice: latest ? publicInvoice(latest) : publicInvoice(record),
    })
  }
}
