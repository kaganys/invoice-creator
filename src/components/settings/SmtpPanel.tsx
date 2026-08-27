import { useEffect, useState } from 'react'
import { testSmtp } from '../../api/settings.ts'
import { ApiError } from '../../api/http.ts'
import {
  prepareInvoiceEmail,
  SAMPLE_EMAIL_BRAND,
  SAMPLE_EMAIL_VARS,
} from '../../invoice/emailHtml.ts'
import { defaultEmailTemplates } from '../../invoice/emailTemplates.ts'
import { useSettings } from '../../settings/SettingsContext.tsx'
import type { SmtpSecurity, SmtpSettingsPayload } from '../../types/settings.ts'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'
import { EmailTemplateEditor } from './EmailTemplateEditor.tsx'

type EmailTab = 'connection' | 'customize'

const SECURITY_OPTIONS: Array<{ value: SmtpSecurity; label: string }> = [
  { value: 'none', label: 'None (unencrypted)' },
  { value: 'starttls', label: 'STARTTLS (upgrade to TLS)' },
  { value: 'ssl', label: 'SSL / implicit TLS' },
]

export function SmtpPanel() {
  const { smtp, loading, saving, error, saveSmtp } = useSettings()
  const [draft, setDraft] = useState(smtp)
  const [success, setSuccess] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [testOk, setTestOk] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [tab, setTab] = useState<EmailTab>('connection')
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    setDraft(smtp)
  }, [smtp])

  function patch(partial: Partial<SmtpSettingsPayload>) {
    setDraft((current) => ({ ...current, ...partial }))
    setSuccess(null)
  }

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
      })
      setSuccess('This company’s SMTP settings saved. The password is never stored in D1.')
    } catch {
      // Context error.
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

  const preview = prepareInvoiceEmail(
    draft.bodyTemplate || defaultEmailTemplates().body,
    SAMPLE_EMAIL_VARS,
    SAMPLE_EMAIL_BRAND,
  )

  return (
    <InvoiceSection
      title="Email / SMTP"
      description="Host, from-address, and email design are stored for this company only. The Worker SMTP password secret is shared infrastructure and is never stored in D1."
    >
      {loading ? <p className="settings-status">Loading SMTP settings…</p> : null}
      <nav className="format-subnav" aria-label="Email settings">
        <button
          type="button"
          className={
            tab === 'connection'
              ? 'settings-nav__button is-active'
              : 'settings-nav__button'
          }
          onClick={() => setTab('connection')}
        >
          Connection
        </button>
        <button
          type="button"
          className={
            tab === 'customize'
              ? 'settings-nav__button is-active'
              : 'settings-nav__button'
          }
          onClick={() => setTab('customize')}
        >
          Customize
        </button>
      </nav>
      {tab === 'connection' ? (
      <>
      <div className="form-grid form-grid--2">
        <Field label="SMTP host / server" htmlFor="smtp-host">
          <input
            id="smtp-host"
            className="field__input"
            value={draft.host}
            disabled={saving || loading}
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
            disabled={saving || loading}
            onChange={(event) => patch({ port: Number(event.target.value) || 0 })}
          />
        </Field>
        <Field label="Username" htmlFor="smtp-username">
          <input
            id="smtp-username"
            className="field__input"
            autoComplete="off"
            value={draft.username}
            disabled={saving || loading}
            onChange={(event) => patch({ username: event.target.value })}
          />
        </Field>
        <Field label="Connection security" htmlFor="smtp-security">
          <select
            id="smtp-security"
            className="field__select"
            value={draft.security}
            disabled={saving || loading}
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
        <Field label="Default From name" htmlFor="smtp-from-name">
          <input
            id="smtp-from-name"
            className="field__input"
            value={draft.fromName}
            disabled={saving || loading}
            onChange={(event) => patch({ fromName: event.target.value })}
          />
        </Field>
        <Field label="Default From email" htmlFor="smtp-from-email">
          <input
            id="smtp-from-email"
            className="field__input"
            type="email"
            value={draft.fromEmail}
            disabled={saving || loading}
            onChange={(event) => patch({ fromEmail: event.target.value })}
          />
        </Field>
        <Field label="Reply-To address" htmlFor="smtp-reply-to">
          <input
            id="smtp-reply-to"
            className="field__input"
            type="email"
            value={draft.replyTo}
            disabled={saving || loading}
            onChange={(event) => patch({ replyTo: event.target.value })}
          />
        </Field>
        <div>
          <p className="field__label">Password</p>
          <div className="password-state">
            {smtp.passwordConfigured ? (
              <>
                <span className="badge">Configured</span>
                <code aria-hidden="true">••••••••</code>
              </>
            ) : (
              <span className="settings-help">Not configured</span>
            )}
          </div>
        </div>
      </div>
      <p className="settings-help">
        This application never returns, logs, or stores the SMTP password in D1.
        Set or replace it as a Worker secret with Wrangler.
      </p>
      <p className="settings-help">
        For local development, keep the SMTP password only in your gitignored
        local Worker secret file. Do not commit credentials. Port 25 is rejected.
      </p>
      <Field label="Send a real test email to" htmlFor="smtp-test-to">
        <input
          id="smtp-test-to"
          className="field__input"
          type="email"
          value={testTo}
          disabled={saving || loading || testBusy}
          placeholder="you@example.com"
          onChange={(event) => setTestTo(event.target.value)}
        />
      </Field>
      <p className="settings-help">
        Test configuration sends a real message using the current SMTP settings and
        Worker secret. Successful authentication alone is not enough.
      </p>
      <div className="settings-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || loading}
          onClick={() => void onSave()}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={saving || loading || testBusy}
          onClick={() => void onTest()}
        >
          {testBusy ? 'Sending test…' : 'Send test email'}
        </button>
        {success ? (
          <p className="settings-status settings-status--success">{success}</p>
        ) : null}
        {error ? (
          <p className="settings-status settings-status--error">{error}</p>
        ) : null}
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
      </>
      ) : (
        <>
          <Field label="Default email subject" htmlFor="smtp-subject">
            <input
              id="smtp-subject"
              className="field__input"
              value={draft.subjectTemplate}
              disabled={saving || loading}
              onChange={(event) => patch({ subjectTemplate: event.target.value })}
            />
          </Field>
          <p className="settings-help">
            The invoice email is HTML and is wrapped in a mobile-friendly layout when
            sent. Open the editor to format text and insert variables.
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setEditorOpen(true)}
            >
              Open customize editor
            </button>
          </div>
          <div className="email-customize-preview">
            <iframe
              title="Invoice email preview"
              className="email-customize-preview__frame"
              srcDoc={preview.html}
            />
          </div>
        </>
      )}
      {tab === 'customize' ? (
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || loading}
            onClick={() => void onSave()}
          >
            {saving ? 'Saving…' : 'Save email'}
          </button>
          {success ? (
            <p className="settings-status settings-status--success">{success}</p>
          ) : null}
          {error ? (
            <p className="settings-status settings-status--error">{error}</p>
          ) : null}
        </div>
      ) : null}
      <EmailTemplateEditor
        open={editorOpen}
        subject={draft.subjectTemplate}
        html={draft.bodyTemplate || defaultEmailTemplates().body}
        onClose={() => setEditorOpen(false)}
        onApply={({ subject, html }) => {
          patch({ subjectTemplate: subject, bodyTemplate: html })
          setEditorOpen(false)
        }}
      />
    </InvoiceSection>
  )
}
