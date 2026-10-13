import { useEffect, useState } from 'react'
import { useSettings } from '../../settings/SettingsContext.tsx'
import type { PaymentsSettingsPayload } from '../../types/settings.ts'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function PaymentsPanel() {
  const { payments, loading, saving, error, savePayments } = useSettings()
  const [draft, setDraft] = useState(payments)
  const [success, setSuccess] = useState<string | null>(null)
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  useEffect(() => {
    setDraft(payments)
  }, [payments])

  function patch(partial: Partial<PaymentsSettingsPayload>) {
    setDraft((current) => ({ ...current, ...partial }))
    setSuccess(null)
  }

  async function onSave() {
    setSuccess(null)
    try {
      await savePayments({
        stripeEnabled: draft.stripeEnabled,
        cardPaymentsEnabled: draft.cardPaymentsEnabled,
        achPaymentsEnabled: draft.achPaymentsEnabled,
        publishableKey: draft.publishableKey,
        statementDescriptor: draft.statementDescriptor,
        secretKey: secretKey.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
      })
      setSecretKey('')
      setWebhookSecret('')
      setSuccess('Payment settings saved.')
    } catch {
      // Context error.
    }
  }

  return (
    <InvoiceSection
      title="Payments"
      description="Card and bank payments for this company. Secret keys are encrypted and are not shown again. Leave them blank to keep the current values."
    >
      {loading ? <p className="settings-status">Loading payments settings…</p> : null}
      <div className="form-grid form-grid--2">
        <Field label="Enable Stripe" htmlFor="payments-stripe-enabled">
          <select
            id="payments-stripe-enabled"
            className="field__select"
            value={draft.stripeEnabled ? 'yes' : 'no'}
            disabled={saving || loading}
            onChange={(event) =>
              patch({ stripeEnabled: event.target.value === 'yes' })
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Enable card / wallet payments" htmlFor="payments-card-enabled">
          <select
            id="payments-card-enabled"
            className="field__select"
            value={draft.cardPaymentsEnabled ? 'yes' : 'no'}
            disabled={saving || loading}
            onChange={(event) =>
              patch({ cardPaymentsEnabled: event.target.value === 'yes' })
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Enable ACH / US bank account" htmlFor="payments-ach-enabled">
          <select
            id="payments-ach-enabled"
            className="field__select"
            value={draft.achPaymentsEnabled ? 'yes' : 'no'}
            disabled={saving || loading}
            onChange={(event) =>
              patch({ achPaymentsEnabled: event.target.value === 'yes' })
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Publishable key" htmlFor="payments-pk" className="form-grid__full">
          <input
            id="payments-pk"
            className="field__input"
            value={draft.publishableKey}
            disabled={saving || loading}
            placeholder="pk_live_... or pk_test_..."
            autoComplete="off"
            onChange={(event) => patch({ publishableKey: event.target.value })}
          />
        </Field>
        <Field label="Statement descriptor" htmlFor="payments-descriptor">
          <input
            id="payments-descriptor"
            className="field__input"
            value={draft.statementDescriptor}
            disabled={saving || loading}
            maxLength={22}
            onChange={(event) =>
              patch({ statementDescriptor: event.target.value })
            }
          />
        </Field>
        <Field label="Secret key" htmlFor="payments-secret">
          <input
            id="payments-secret"
            className="field__input"
            type="password"
            autoComplete="off"
            value={secretKey}
            disabled={saving || loading}
            placeholder={
              payments.secretConfigured
                ? 'Leave blank to keep the current secret key'
                : 'sk_test_... or sk_live_...'
            }
            onChange={(event) => {
              setSecretKey(event.target.value)
              setSuccess(null)
            }}
          />
        </Field>
        <Field label="Webhook signing secret" htmlFor="payments-webhook">
          <input
            id="payments-webhook"
            className="field__input"
            type="password"
            autoComplete="off"
            value={webhookSecret}
            disabled={saving || loading}
            placeholder={
              payments.webhookSecretConfigured
                ? 'Leave blank to keep the current webhook secret'
                : 'whsec_...'
            }
            onChange={(event) => {
              setWebhookSecret(event.target.value)
              setSuccess(null)
            }}
          />
        </Field>
      </div>
      <p className="settings-help">
        {payments.secretConfigured
          ? payments.secretSource === 'platform'
            ? 'Using the platform Stripe secret. A key saved here is used for this company only.'
            : 'A Stripe secret key is saved for this company.'
          : 'No Stripe secret key yet. Save one here, or set STRIPE_SECRET_KEY on the Worker as a fallback.'}
        {payments.webhookSecretConfigured
          ? ' Webhook signing secret is set.'
          : ' Webhook signing secret is not set.'}
      </p>
      <p className="settings-help">
        For local card testing, forward Stripe events with:
      </p>
      <p className="settings-example">
        stripe listen --forward-to localhost:5173/api/webhooks/stripe
      </p>
      <p className="settings-help">
        Use the CLI-printed webhook signing secret locally. Cloudflare Access must
        allow unauthenticated POST /api/webhooks/stripe (and /i/*,
        /api/public/*). Paid state is set only by the verified webhook, never by the
        customer browser.
      </p>
      <p className="settings-help">
        The pay page shows Apple Pay and Google Pay above the card form when
        the browser supports them. Safari on a Mac, iPhone, or iPad shows
        Apple Pay. Chrome on a computer or Android shows Google Pay. Those
        wallet payments use the card total, including the card processing fee.
        ACH uses Stripe Financial Connections when it is enabled, and is not
        surcharged.
      </p>
      <p className="settings-help">
        Enable Apple Pay and Google Pay under Stripe → Settings → Payment
        methods. Register <code>pay.vrfnw.com</code> under Payment method
        domains so Apple Pay domain verification can finish. The pay site
        already serves the association file. If this company uses its own
        Stripe secret key, enable the wallets and register that domain on that
        Stripe account as well.
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
        {success ? (
          <p className="settings-status settings-status--success">{success}</p>
        ) : null}
        {error ? (
          <p className="settings-status settings-status--error">{error}</p>
        ) : null}
      </div>
    </InvoiceSection>
  )
}
