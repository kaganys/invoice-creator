import { useEffect, useMemo, useState } from 'react'
import { useDirectory } from '../../directory/DirectoryContext.tsx'
import { useSettings } from '../../settings/SettingsContext.tsx'
import { CURRENCY_OPTIONS } from '../../types/invoice.ts'
import type { InvoiceDefaultsPayload } from '../../types/settings.ts'
import { personLabel } from '../../types/person.ts'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function DefaultsPanel() {
  const { people } = useDirectory()
  const { defaults, loading, saving, error, saveDefaults } = useSettings()
  const [draft, setDraft] = useState<InvoiceDefaultsPayload>(defaults)
  const [success, setSuccess] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(defaults)
  }, [defaults])

  const currencyOptions = useMemo(() => {
    if ((CURRENCY_OPTIONS as readonly string[]).includes(draft.currency)) {
      return CURRENCY_OPTIONS
    }
    return [draft.currency, ...CURRENCY_OPTIONS]
  }, [draft.currency])

  function patch(partial: Partial<InvoiceDefaultsPayload>) {
    setDraft((current) => ({ ...current, ...partial }))
    setSuccess(null)
  }

  async function onSave() {
    setLocalError(null)
    setSuccess(null)
    if (draft.dueDays < 0 || !Number.isInteger(Number(draft.dueDays))) {
      setLocalError('Due period must be a whole number of days.')
      return
    }
    try {
      await saveDefaults({
        ...draft,
        dueDays: Number(draft.dueDays),
      })
      setSuccess('Defaults saved.')
    } catch {
      // SettingsContext stores the API error.
    }
  }

  return (
    <InvoiceSection
      title="Defaults"
      description="Copied onto a new or reset invoice only. Changing these values does not rewrite invoices that already exist."
    >
      {loading ? <p className="settings-status">Loading defaults…</p> : null}
      <div className="form-grid form-grid--2">
        <Field label="Default From person" htmlFor="default-from" className="form-grid__full">
          <select
            id="default-from"
            className="field__select"
            value={draft.defaultFromId ?? ''}
            disabled={saving || loading}
            onChange={(event) =>
              patch({ defaultFromId: event.target.value || null })
            }
          >
            <option value="">None</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default Zelle / payment email" htmlFor="default-zelle">
          <input
            id="default-zelle"
            className="field__input"
            type="email"
            value={draft.zelleEmail}
            disabled={saving || loading}
            onChange={(event) => patch({ zelleEmail: event.target.value })}
          />
        </Field>
        <Field label="Default currency" htmlFor="default-currency">
          <select
            id="default-currency"
            className="field__select"
            value={draft.currency}
            disabled={saving || loading}
            onChange={(event) => patch({ currency: event.target.value })}
          >
            {currencyOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default credit-card fee %" htmlFor="default-cc-percent">
          <input
            id="default-cc-percent"
            className="field__input"
            inputMode="decimal"
            value={draft.cardFeePercent}
            disabled={saving || loading}
            onChange={(event) => patch({ cardFeePercent: event.target.value })}
          />
        </Field>
        <Field label="Default fixed credit-card fee" htmlFor="default-cc-fixed">
          <input
            id="default-cc-fixed"
            className="field__input"
            inputMode="decimal"
            value={draft.cardFeeFixed}
            disabled={saving || loading}
            onChange={(event) => patch({ cardFeeFixed: event.target.value })}
          />
        </Field>
        <Field label="Default due period (days)" htmlFor="default-due-days">
          <input
            id="default-due-days"
            className="field__input"
            inputMode="numeric"
            value={String(draft.dueDays)}
            disabled={saving || loading}
            onChange={(event) =>
              patch({ dueDays: Number(event.target.value) || 0 })
            }
          />
        </Field>
        <Field label="Default country" htmlFor="default-country">
          <input
            id="default-country"
            className="field__input"
            value={draft.country}
            disabled={saving || loading}
            onChange={(event) => patch({ country: event.target.value })}
          />
        </Field>
        <Field
          label="Default payment memo"
          htmlFor="default-memo"
          className="form-grid__full"
        >
          <textarea
            id="default-memo"
            className="field__textarea"
            rows={4}
            value={draft.paymentMemo}
            disabled={saving || loading}
            onChange={(event) => patch({ paymentMemo: event.target.value })}
          />
        </Field>
        <Field
          label="Default notes"
          htmlFor="default-notes"
          className="form-grid__full"
        >
          <textarea
            id="default-notes"
            className="field__textarea"
            rows={3}
            value={draft.notes}
            disabled={saving || loading}
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </Field>
      </div>
      <p className="settings-help">
        Default From copies that person’s current details into a new invoice.
        Later edits or deletion of the person do not change invoices that were
        already created. A deleted default person is cleared here.
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
        {localError || error ? (
          <p className="settings-status settings-status--error">
            {localError || error}
          </p>
        ) : null}
      </div>
    </InvoiceSection>
  )
}
