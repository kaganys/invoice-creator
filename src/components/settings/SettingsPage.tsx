import { useDirectory } from '../../directory/DirectoryContext.tsx'
import { personLabel } from '../../types/person.ts'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function SettingsPage() {
  const {
    people,
    defaultFromId,
    loading,
    saving,
    error,
    setDefaultFromId,
  } = useDirectory()

  return (
    <div className="app-page">
      {error ? <p className="api-banner api-banner--error">{error}</p> : null}
      {loading ? <p className="api-banner">Loading settings…</p> : null}

      <InvoiceSection
        title="Default From"
        description="Used when you reset an invoice. Fields stay editable after they fill in. If that person is later deleted, the default is cleared."
      >
        {loading ? null : people.length === 0 ? (
          <p className="people-empty">
            Add someone in People before choosing a default From.
          </p>
        ) : (
          <Field label="Default From person" htmlFor="default-from">
            <select
              id="default-from"
              className="field__select"
              value={defaultFromId ?? ''}
              disabled={saving}
              onChange={(event) => {
                void setDefaultFromId(event.target.value || null)
              }}
            >
              <option value="">None</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {personLabel(person)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {saving ? <p className="people-empty">Saving…</p> : null}
      </InvoiceSection>
    </div>
  )
}
