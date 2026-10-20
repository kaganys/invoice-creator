import { useEffect, useMemo, useState } from 'react'
import { testSmtp } from '../../api/settings.ts'
import { ApiError } from '../../api/http.ts'
import {
  prepareInvoiceEmail,
  SAMPLE_EMAIL_BRAND,
  SAMPLE_EMAIL_VARS,
} from '../../invoice/emailHtml.ts'
import { canonicalizeEmailBody } from '../../invoice/emailDocument.ts'
import { applyEmailTemplate, defaultEmailTemplates } from '../../invoice/emailTemplates.ts'
import { useSettings } from '../../settings/SettingsContext.tsx'
import type { SmtpSecurity, SmtpSettingsPayload } from '../../types/settings.ts'
import { Field } from '../Field.tsx'
import { EmailMessageEditor } from './EmailMessageEditor.tsx'
import { SettingsWorkbench } from './SettingsWorkbench.tsx'
import { smtpFieldsChanged } from './settingsDraft.ts'

function withCanonicalBody<T extends { bodyTemplate: string }>(value: T): T {
  return {
    ...value,
    bodyTemplate: canonicalizeEmailBody(value.bodyTemplate),
  }
}

const SECURITY_OPTIONS: Array<{ value: SmtpSecurity; label: string }> = [
  { value: 'starttls', label: 'STARTTLS (port 587)' },
  { value: 'ssl', label: 'SSL (port 465)' },
  { value: 'none', label: 'None' },
]

export function SmtpPanel() {
  const { smtp, branding, loading, saving, error, saveSmtp } = useSettings()
  const [draft, setDraft] = useState(() => withCanonicalBody(smtp))
  const [success, setSuccess] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [testOk, setTestOk] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [password, setPassword] = useState('')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [pane, setPane] = useState<'edit' | 'preview'>('edit')
  const [resetSignal, setResetSignal] = useState(0)

  useEffect(() => {
    setDraft(withCanonicalBody(smtp))
  }, [smtp])

  function patch(partial: Partial<SmtpSettingsPayload>) {
    setDraft((current) => ({ ...current, ...partial }))
    setSuccess(null)
  }

  const dirty = smtpFieldsChanged(smtp, draft, password)

  async function onSave() {
    setSuccess(null)
    setTestMessage(null)
    try {
      await saveSmtp({
        host: draft.host,
        port: Number(draft.port),
        username: draft.username,
        security: draft.security,
        fromName: draft.fromName,
        fromEmail: draft.fromEmail,
        replyTo: draft.replyTo,
        subjectTemplate: draft.subjectTemplate,
        bodyTemplate: draft.bodyTemplate,
        password: password.trim() || undefined,
      })
      setPassword('')
      setSuccess('Email settings saved.')
    } catch {
      // The settings context stores the error.
    }
  }

  async function onTest() {
    setTestBusy(true)
    setTestMessage(null)
    setTestOk(false)
    try {
      const result = await testSmtp(testTo)
      setTestOk(true)
      setTestMessage(result.message)
    } catch (caught) {
      const message =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : 'SMTP test failed.'
      setTestMessage(message)
    } finally {
      setTestBusy(false)
    }
  }

  const previewAsset = (url: string | undefined) => {
    const value = url?.trim() ?? ''
    if (!value || /^https?:\/\//i.test(value)) {
      return value
    }
    if (value.startsWith('/') && typeof window !== 'undefined') {
      return `${window.location.origin}${value}`
    }
    return value
  }
  const previewVars = useMemo(
    () => ({
      ...SAMPLE_EMAIL_VARS,
      business_name: draft.fromName.trim() || SAMPLE_EMAIL_VARS.business_name,
    }),
    [draft.fromName],
  )
  const previewBrand = {
    logoUrl: previewAsset(branding.siteIcon.url || SAMPLE_EMAIL_BRAND.logoUrl),
    wordmarkUrl: previewAsset(branding.siteWordmark.url || SAMPLE_EMAIL_BRAND.wordmarkUrl),
  }
  const subjectPreview = applyEmailTemplate(
    draft.subjectTemplate || defaultEmailTemplates().subject,
    previewVars,
  )
  const preview = prepareInvoiceEmail(
    draft.bodyTemplate || defaultEmailTemplates().body,
    previewVars,
    previewBrand,
    { preheader: subjectPreview },
  )
  const passwordHint = smtp.passwordConfigured
    ? smtp.passwordSource === 'platform'
      ? 'Using the shared password. A password saved here is used for this company only.'
      : 'A password is saved. Leave this blank to keep it.'
    : 'No password yet. Leave this blank to use the shared SMTP password, if one is set.'

  return (
    <>
      <fieldset className="settings-group" disabled={saving || loading}>
              <legend>Mail server</legend>
              <p className="settings-help">
                Port 587 with STARTTLS is the usual choice. Port 25 is not accepted.
              </p>
              <div className="form-grid form-grid--2">
                <Field label="Host" htmlFor="smtp-host">
                  <input
                    id="smtp-host"
                    className="field__input"
                    value={draft.host}
                    placeholder="smtp.example.com"
                    onChange={(event) => patch({ host: event.target.value })}
                  />
                </Field>
                <Field label="Port" htmlFor="smtp-port">
                  <input
                    id="smtp-port"
                    className="field__input"
                    inputMode="numeric"
                    value={String(draft.port)}
                    onChange={(event) =>
                      patch({ port: Number(event.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Username" htmlFor="smtp-username">
                  <input
                    id="smtp-username"
                    className="field__input"
                    autoComplete="off"
                    value={draft.username}
                    onChange={(event) => patch({ username: event.target.value })}
                  />
                </Field>
                <Field label="Security" htmlFor="smtp-security">
                  <select
                    id="smtp-security"
                    className="field__select"
                    value={draft.security}
                    onChange={(event) =>
                      patch({ security: event.target.value as SmtpSecurity })
                    }
                  >
                    {SECURITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Password" htmlFor="smtp-password" className="form-grid__full">
                  <input
                    id="smtp-password"
                    className="field__input"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    placeholder={
                      smtp.passwordConfigured
                        ? 'Leave blank to keep the current password'
                        : 'SMTP password'
                    }
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setSuccess(null)
                    }}
                  />
                </Field>
              </div>
              <p className="settings-help">{passwordHint}</p>
            </fieldset>

            <fieldset className="settings-group" disabled={saving || loading}>
              <legend>From</legend>
              <p className="settings-help">Shown on the messages this company sends.</p>
              <div className="form-grid form-grid--2">
                <Field label="Email" htmlFor="smtp-from-email" className="form-grid__full">
                  <input
                    id="smtp-from-email"
                    className="field__input"
                    type="email"
                    value={draft.fromEmail}
                    onChange={(event) => patch({ fromEmail: event.target.value })}
                  />
                </Field>
              </div>
      </fieldset>

      <div className="email-device-switch" role="tablist" aria-label="Email editor">
        <button
          type="button"
          role="tab"
          className={pane === 'edit' ? 'is-on' : undefined}
          aria-selected={pane === 'edit'}
          onClick={() => setPane('edit')}
        >
          Edit
        </button>
        <button
          type="button"
          role="tab"
          className={pane === 'preview' ? 'is-on' : undefined}
          aria-selected={pane === 'preview'}
          onClick={() => setPane('preview')}
        >
          Preview
        </button>
      </div>
      <SettingsWorkbench
        className={`settings-workbench--compose is-${pane}`}
        previewTitle=""
        saving={saving}
        dirty={dirty}
        success={success}
        error={error}
        onSave={() => void onSave()}
        saveLabel="Save"
        extra={
          <button
            type="button"
            className="btn btn--ghost"
            disabled={saving || loading}
            onClick={() => setResetSignal((current) => current + 1)}
          >
            Reset to default
          </button>
        }
        form={
          <>
            <fieldset className="settings-group" disabled={saving || loading}>
              <legend>Message</legend>
              <p className="settings-help">
                Write the email as one letter. Drag a block by its handle to reorder it.
                Drag a merge field from the list into the text. The preview is the
                message that will be sent.
              </p>
              <EmailMessageEditor
                subject={draft.subjectTemplate}
                html={draft.bodyTemplate || defaultEmailTemplates().body}
                subjectPreview={subjectPreview}
                disabled={saving || loading}
                brand={{
                  logoUrl: previewAsset(branding.siteIcon.url || SAMPLE_EMAIL_BRAND.logoUrl),
                  wordmarkUrl: previewAsset(
                    branding.siteWordmark.url || SAMPLE_EMAIL_BRAND.wordmarkUrl,
                  ),
                  senderName: draft.fromName.trim() || previewVars.business_name,
                }}
                envelope={{
                  fromName: draft.fromName,
                  replyTo: draft.replyTo,
                  onFromName: (fromName) => patch({ fromName }),
                  onReplyTo: (replyTo) => patch({ replyTo }),
                }}
                resetSignal={resetSignal}
                onChange={({ subject, html }) =>
                  patch({ subjectTemplate: subject, bodyTemplate: html })
                }
              />
            </fieldset>

            <fieldset className="settings-group" disabled={saving || loading || testBusy}>
              <legend>Send a test</legend>
              <p className="settings-help">
                Sends a real message with the saved settings, not the unsaved draft.
              </p>
              <Field label="To" htmlFor="smtp-test-to">
                <input
                  id="smtp-test-to"
                  className="field__input"
                  type="email"
                  value={testTo}
                  placeholder="you@example.com"
                  onChange={(event) => setTestTo(event.target.value)}
                />
              </Field>
              <div className="settings-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={testBusy}
                  onClick={() => void onTest()}
                >
                  {testBusy ? 'Sending…' : 'Send test'}
                </button>
                {testMessage ? (
                  <p
                    className={
                      testOk
                        ? 'settings-status settings-status--success'
                        : 'settings-status settings-status--error'
                    }
                  >
                    {testMessage}
                  </p>
                ) : null}
              </div>
            </fieldset>
          </>
        }
        preview={
          <div className="email-preview">
            <div className="email-preview__bar">
              <strong>
                Preview{' '}
                <small>
                  · sample data: {previewVars.customer_name}, {previewVars.invoice_number}
                </small>
              </strong>
              <div className="email-preview__seg" role="group" aria-label="Preview width">
                <button
                  type="button"
                  className={previewDevice === 'desktop' ? 'is-on' : undefined}
                  aria-pressed={previewDevice === 'desktop'}
                  onClick={() => setPreviewDevice('desktop')}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className={previewDevice === 'mobile' ? 'is-on' : undefined}
                  aria-pressed={previewDevice === 'mobile'}
                  onClick={() => setPreviewDevice('mobile')}
                >
                  Mobile
                </button>
              </div>
            </div>
            <div className="email-preview__mail">
              <div className="email-preview__meta">
                <b>{subjectPreview}</b>
                <span>
                  {draft.fromName.trim() || previewVars.business_name}
                  {draft.fromEmail.trim() ? ` <${draft.fromEmail.trim()}>` : ''} · to{' '}
                  {previewVars.customer_name}
                </span>
              </div>
              <div className={previewDevice === 'mobile' ? 'email-preview__frame is-mobile' : 'email-preview__frame'}>
                <iframe
                  title="Invoice email preview"
                  srcDoc={preview.html}
                />
              </div>
            </div>
          </div>
        }
      />
    </>
  )
}
