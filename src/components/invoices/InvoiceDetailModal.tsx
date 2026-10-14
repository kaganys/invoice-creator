import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/http.ts'
import {
  fetchInvoice,
  fetchInvoiceEmails,
  fetchPaymentLink,
  markInvoicePaid,
  regeneratePaymentLink,
  revokePaymentLink,
  sendInvoiceEmail,
  voidInvoice,
  type PaymentLinkPayload,
} from '../../api/invoices.ts'
import { prepareInvoiceEmail } from '../../invoice/emailHtml.ts'
import {
  applyEmailTemplate,
  invoiceTemplateVars,
} from '../../invoice/emailTemplates.ts'
import { EmailTemplateEditor } from '../settings/EmailTemplateEditor.tsx'
import { useSettings } from '../../settings/SettingsContext.tsx'
import { invoicePdfFilename } from '../../utils/invoiceFilename.ts'
import { downloadSavedInvoicePdf } from '../../utils/invoicePdf.ts'
import { printInvoiceElement } from '../../utils/invoicePrint.ts'
import { useFocusTrap } from '../../hooks/useFocusTrap.ts'
import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { useAppView } from '../../nav/AppViewContext.tsx'
import { formatMoney } from '../../utils/money.ts'
import type {
  InvoiceEmailLogItem,
  PaidMethod,
  SavedInvoice,
} from '../../types/invoice.ts'
import { PAID_METHODS } from '../../types/invoice.ts'
import { InvoiceDocument } from '../InvoiceDocument.tsx'
import { IconX } from '../icons.tsx'
import './InvoiceDetailModal.css'

type InvoiceDetailModalProps = {
  invoiceId: string | null
  onClose: () => void
  onChanged: () => void
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function methodLabel(method: PaidMethod | null): string {
  if (!method) {
    return '—'
  }
  if (method === 'zelle') {
    return 'Zelle'
  }
  if (method === 'manual') {
    return 'Manual'
  }
  if (method === 'card') {
    return 'Paid via Card'
  }
  if (method === 'apple_pay') {
    return 'Paid via Apple Pay'
  }
  if (method === 'google_pay') {
    return 'Paid via Google Pay'
  }
  if (method === 'ach') {
    return 'Paid via ACH'
  }
  return 'Other'
}

function stripeProgressLabel(invoice: SavedInvoice): string | null {
  if (invoice.status === 'paid') {
    return null
  }
  if (invoice.stripePaymentStatus === 'processing') {
    return 'ACH Processing'
  }
  if (invoice.stripePaymentStatus === 'failed') {
    return invoice.stripePaymentMethod === 'us_bank_account'
      ? 'ACH Failed'
      : 'Payment failed'
  }
  if (invoice.stripePaymentStatus === 'requires_action') {
    return 'Payment authentication required'
  }
  if (
    invoice.stripePaymentStatus === 'confirming' ||
    invoice.stripePaymentStatus === 'succeeded'
  ) {
    return 'Confirming payment'
  }
  return null
}

export function InvoiceDetailModal({
  invoiceId,
  onClose,
  onChanged,
}: InvoiceDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const { setView } = useAppView()
  const { loadSavedInvoice } = useInvoiceDraft()
  const { format, smtp, branding } = useSettings()
  const [invoice, setInvoice] = useState<SavedInvoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emails, setEmails] = useState<InvoiceEmailLogItem[]>([])
  const [sendOpen, setSendOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [sending, setSending] = useState(false)
  const [emailEditorOpen, setEmailEditorOpen] = useState(false)
  const [paymentLink, setPaymentLink] = useState<PaymentLinkPayload | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmPaid, setConfirmPaid] = useState(false)
  const [paidMethod, setPaidMethod] = useState<PaidMethod>('zelle')
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'print' | null>(null)
  const documentRef = useRef<HTMLElement>(null)

  const open = Boolean(invoiceId)
  useFocusTrap(open, dialogRef, onClose)

  useEffect(() => {
    if (!invoiceId) {
      setInvoice(null)
      setError(null)
      setEmails([])
      setSendOpen(false)
      setConfirmPaid(false)
      setConfirmVoid(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchInvoice(invoiceId)
      .then(async (loaded) => {
        if (cancelled) {
          return
        }
        setInvoice(loaded)
        setError(null)
        try {
          const history = await fetchInvoiceEmails(invoiceId)
          if (!cancelled) {
            setEmails(history.emails)
          }
        } catch {
          if (!cancelled) {
            setEmails([])
          }
        }
        try {
          const link = await fetchPaymentLink(invoiceId)
          if (!cancelled) {
            setPaymentLink(link.paymentLink)
          }
        } catch {
          if (!cancelled) {
            setPaymentLink(null)
          }
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Could not load invoice.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [invoiceId])

  useEffect(() => {
    if (!open) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) {
    return null
  }

  const status = invoice?.status ?? 'draft'
  const canEdit = status === 'draft' || status === 'sent'
  const canPay = status === 'draft' || status === 'sent'
  const canVoid = status === 'draft' || status === 'sent'
  const canSend = status !== 'void' && Boolean(invoice)
  const isResend = Boolean(
    invoice && (invoice.sendCount > 0 || status === 'sent' || status === 'paid'),
  )
  const documentFormat = invoice?.format ?? format

  async function onEdit() {
    if (!invoiceId || !canEdit) {
      return
    }
    try {
      await loadSavedInvoice(invoiceId)
      onClose()
      setView('invoice')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not edit invoice.')
    }
  }

  async function onMarkPaid() {
    if (!invoiceId) {
      return
    }
    setBusy(true)
    try {
      const next = await markInvoicePaid(invoiceId, paidMethod)
      setInvoice(next)
      setPaymentLink(null)
      setConfirmPaid(false)
      onChanged()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not mark paid.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function onDownloadPdf() {
    if (!invoice) {
      setError('Invoice is not ready to download.')
      return
    }
    setExporting('pdf')
    setError(null)
    try {
      await downloadSavedInvoicePdf(invoice.id)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not generate the PDF.',
      )
    } finally {
      setExporting(null)
    }
  }

  function openSend() {
    if (!invoice) {
      return
    }
    setRecipient(invoice.customer.email)
    setSubject(smtp.subjectTemplate)
    setEmailBody(smtp.bodyTemplate)
    setIdempotencyKey(crypto.randomUUID())
    setSendOpen(true)
    setConfirmPaid(false)
    setConfirmVoid(false)
  }

  async function onSend() {
    if (!invoiceId) {
      return
    }
    setSending(true)
    setError(null)
    try {
      const result = await sendInvoiceEmail(invoiceId, {
        recipient,
        subject,
        body: emailBody,
        idempotencyKey,
      })
      setInvoice(result.invoice)
      setSendOpen(false)
      const history = await fetchInvoiceEmails(invoiceId)
      setEmails(history.emails)
      try {
        const link = await fetchPaymentLink(invoiceId)
        setPaymentLink(link.paymentLink)
      } catch {
        setPaymentLink(null)
      }
      onChanged()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not send invoice.',
      )
    } finally {
      setSending(false)
    }
  }

  function onPrint() {
    if (!documentRef.current) {
      setError('Invoice is not ready to print.')
      return
    }
    setError(null)
    printInvoiceElement(documentRef.current)
  }

  async function onVoid() {
    if (!invoiceId) {
      return
    }
    setBusy(true)
    try {
      const next = await voidInvoice(invoiceId, voidReason)
      setInvoice(next)
      setPaymentLink(null)
      setConfirmVoid(false)
      onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not void invoice.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="invoice-detail-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="invoice-detail-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-detail-title"
        tabIndex={-1}
      >
        <header className="invoice-detail-modal__header">
          <div>
            <h2 id="invoice-detail-title" className="invoice-detail-modal__title">
              {invoice?.number || 'Invoice'}
            </h2>
            <span className={`badge badge--${status}`}>{status}</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
          >
            <IconX />
            Close
          </button>
        </header>

        <div className="invoice-detail-modal__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canEdit || loading}
            onClick={() => void onEdit()}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!canSend || loading || sending}
            onClick={openSend}
          >
            {isResend ? 'Resend' : 'Send'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!invoice || loading || exporting === 'pdf'}
            onClick={() => void onDownloadPdf()}
          >
            {exporting === 'pdf' ? 'Generating PDF…' : 'Download PDF'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!invoice || loading || exporting === 'pdf'}
            onClick={onPrint}
          >
            Print
          </button>
          {canPay ? (
            confirmPaid ? (
              <div className="invoice-detail-modal__confirm">
                <select
                  className="field__select"
                  value={paidMethod}
                  disabled={busy}
                  onChange={(event) =>
                    setPaidMethod(event.target.value as PaidMethod)
                  }
                >
                  {PAID_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {methodLabel(method)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => setConfirmPaid(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => void onMarkPaid()}
                >
                  Confirm paid
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={loading}
                onClick={() => {
                  setConfirmVoid(false)
                  setConfirmPaid(true)
                }}
              >
                Mark paid
              </button>
            )
          ) : null}
          {canVoid ? (
            confirmVoid ? (
              <div className="invoice-detail-modal__confirm">
                <input
                  className="field__input"
                  placeholder="Reason (optional)"
                  value={voidReason}
                  disabled={busy}
                  onChange={(event) => setVoidReason(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => setConfirmVoid(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy}
                  onClick={() => void onVoid()}
                >
                  Confirm void
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={loading}
                onClick={() => {
                  setConfirmPaid(false)
                  setConfirmVoid(true)
                }}
              >
                Void
              </button>
            )
          ) : null}
        </div>

        {invoice ? (
          <dl className="invoice-detail-modal__meta">
            <div>
              <dt>Created</dt>
              <dd>{formatTimestamp(invoice.createdAt)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatTimestamp(invoice.updatedAt)}</dd>
            </div>
            <div>
              <dt>Paid via</dt>
              <dd>{methodLabel(invoice.paidMethod)}</dd>
            </div>
            {stripeProgressLabel(invoice) ? (
              <div>
                <dt>Payment status</dt>
                <dd>{stripeProgressLabel(invoice)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Paid</dt>
              <dd>{formatTimestamp(invoice.paidAt)}</dd>
            </div>
            {invoice.paidMethod === 'card' ||
            invoice.paidMethod === 'ach' ||
            invoice.paidMethod === 'apple_pay' ||
            invoice.paidMethod === 'google_pay' ||
            invoice.stripePaymentIntentId ||
            invoice.stripePaymentStatus ? (
              <>
                <div>
                  <dt>Amount paid</dt>
                  <dd>
                    {invoice.paidAmountCents != null
                      ? `${formatMoney(invoice.paidAmountCents, invoice.currency)} ${invoice.currency}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Stripe PaymentIntent</dt>
                  <dd>{invoice.stripePaymentIntentId || '—'}</dd>
                </div>
              </>
            ) : null}
            {invoice.voidedAt ? (
              <div>
                <dt>Voided</dt>
                <dd>
                  {formatTimestamp(invoice.voidedAt)}
                  {invoice.voidReason ? ` · ${invoice.voidReason}` : ''}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>First sent</dt>
              <dd>{formatTimestamp(invoice.firstSentAt)}</dd>
            </div>
            <div>
              <dt>Last sent</dt>
              <dd>{formatTimestamp(invoice.lastSentAt)}</dd>
            </div>
            <div>
              <dt>Send count</dt>
              <dd>{invoice.sendCount}</dd>
            </div>
          </dl>
        ) : null}

        {invoice && (status === 'sent' || paymentLink) ? (
          <div className="invoice-payment-link">
            <h3>Payment link</h3>
            {paymentLink?.url && paymentLink.status === 'active' ? (
              <>
                <p className="invoice-payment-link__url">{paymentLink.url}</p>
                <div className="invoice-detail-modal__confirm">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(paymentLink.url ?? '')
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={linkBusy || status === 'paid' || status === 'void'}
                    onClick={() => {
                      if (
                        !invoiceId ||
                        !window.confirm(
                          'Regenerate this payment link? The previous link will stop working.',
                        )
                      ) {
                        return
                      }
                      setLinkBusy(true)
                      void regeneratePaymentLink(invoiceId)
                        .then((result) => setPaymentLink(result.paymentLink))
                        .catch((caught: unknown) =>
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : 'Could not regenerate the payment link.',
                          ),
                        )
                        .finally(() => setLinkBusy(false))
                    }}
                  >
                    Regenerate link
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={linkBusy}
                    onClick={() => {
                      if (!invoiceId) {
                        return
                      }
                      setLinkBusy(true)
                      void revokePaymentLink(invoiceId)
                        .then(() => setPaymentLink(null))
                        .catch((caught: unknown) =>
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : 'Could not revoke the payment link.',
                          ),
                        )
                        .finally(() => setLinkBusy(false))
                    }}
                  >
                    Revoke link
                  </button>
                </div>
              </>
            ) : (
              <p className="settings-help">
                {status === 'sent'
                  ? 'No active payment link. Send the invoice or regenerate a link.'
                  : 'This invoice does not have an active payment link.'}
              </p>
            )}
          </div>
        ) : null}

        {sendOpen && invoice ? (
          <div className="invoice-send">
            <h3>Send invoice</h3>
            <p className="settings-help">
              From {smtp.fromName || invoice.from.name} &lt;{smtp.fromEmail || invoice.from.email}&gt;
              · Attachment {invoicePdfFilename(invoice.number)}
            </p>
            <label className="field__label" htmlFor="send-recipient">
              Recipient
            </label>
            <input
              id="send-recipient"
              className="field__input"
              value={recipient}
              disabled={sending}
              onChange={(event) => setRecipient(event.target.value)}
            />
            <label className="field__label" htmlFor="send-subject">
              Subject
            </label>
            <input
              id="send-subject"
              className="field__input"
              value={subject}
              disabled={sending}
              onChange={(event) => setSubject(event.target.value)}
            />
            <div className="invoice-send__body-bar">
              <label className="field__label">Email preview</label>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={sending}
                onClick={() => setEmailEditorOpen(true)}
              >
                Customize
              </button>
            </div>
            <iframe
              className="invoice-send__preview"
              title="Invoice email preview"
              srcDoc={
                prepareInvoiceEmail(
                  emailBody,
                  invoiceTemplateVars(invoice, {
                    paymentUrl: paymentLink?.url ?? '',
                  }),
                  {
                    logoUrl:
                      branding.siteIcon.url ||
                      '/branding/bitz-designs-icon.png',
                    wordmarkUrl:
                      branding.siteWordmark.url ||
                      '/branding/bitz-designs-wordmark.png',
                  },
                  {
                    preheader: applyEmailTemplate(
                      subject,
                      invoiceTemplateVars(invoice, {
                        paymentUrl: paymentLink?.url ?? '',
                      }),
                    ),
                  },
                ).html
              }
            />
            <div className="invoice-detail-modal__confirm">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={sending}
                onClick={() => setSendOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={sending}
                onClick={() => void onSend()}
              >
                {sending ? 'Sending…' : isResend ? 'Send again' : 'Send invoice'}
              </button>
            </div>
            <EmailTemplateEditor
              open={emailEditorOpen}
              subject={subject}
              html={emailBody}
              previewVars={invoiceTemplateVars(invoice, {
                paymentUrl: paymentLink?.url ?? '',
              })}
              brand={{
                logoUrl:
                  branding.siteIcon.url || '/branding/bitz-designs-icon.png',
                wordmarkUrl:
                  branding.siteWordmark.url ||
                  '/branding/bitz-designs-wordmark.png',
                senderName: smtp.fromName || invoice.from.name,
              }}
              onClose={() => setEmailEditorOpen(false)}
              onApply={({ subject: nextSubject, html }) => {
                setSubject(nextSubject)
                setEmailBody(html)
                setEmailEditorOpen(false)
              }}
            />
          </div>
        ) : null}

        {emails.length > 0 ? (
          <details className="invoice-email-history">
            <summary>Email history</summary>
            <ul>
              {emails.map((entry) => (
                <li key={entry.id}>
                  {formatTimestamp(entry.attemptedAt)} · {entry.recipient} ·{' '}
                  {entry.success ? 'sent' : `failed${entry.errorMessage ? ` (${entry.errorMessage})` : ''}`}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {error ? <p className="api-banner api-banner--error">{error}</p> : null}
        {loading ? <p className="api-banner">Loading invoice…</p> : null}

        <div className="invoice-detail-modal__canvas">
          {invoice ? (
            <InvoiceDocument
              ref={documentRef}
              invoice={invoice}
              format={documentFormat}
              paymentUrl={paymentLink?.status === 'active' ? paymentLink.url ?? '' : ''}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
