import { useEffect, useState } from 'react'
import { useSettings } from '../../settings/SettingsContext.tsx'
import type { PaymentsSettingsPayload } from '../../types/settings.ts'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function PaymentsPanel() {
  const { payments, loading, saving, error, savePayments } = useSettings()
  const [draft, setDraft] = useState(payments)
  const [success, setSuccess] = useState<string | null>(null)

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
        publishableKey: draft.publishableKey,
        statementDescriptor: draft.statementDescriptor,
      })
      setSuccess('Payments settings saved. The Stripe secret key is never stored in D1.')
    } catch {
      // Context error.
    }
  }

  return (
    <InvoiceSection
      title="Payments"
      description="Stripe configuration for the public customer payment page. Invoice totals stay at the base amount; card fees are applied only when the customer pays by card."
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
        <Field label="Enable card payments" htmlFor="payments-card-enabled">
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
        <div>
          <p className="field__label">Secret key</p>
          <div className="password-state">
            {payments.secretConfigured ? (
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
        Stripe secrets are Worker secrets. Never paste them here. Configure the
        secret key and webhook signing secret with Wrangler.
      </p>
      <p className="settings-help">
        Local development: keep both Stripe secrets only in your gitignored local
        Worker secret file. Forward Stripe events with:
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
