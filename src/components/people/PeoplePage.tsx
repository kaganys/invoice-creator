import { useMemo, useState } from 'react'
import { useDirectory } from '../../directory/DirectoryContext.tsx'
import type { Person, PersonInput } from '../../types/person.ts'
import { formatAddressLines } from '../../utils/address.ts'
import { emptyPersonInput } from '../../utils/person.ts'
import { AddressFields } from '../editor/AddressFields.tsx'
import { Field, fieldErrorId } from '../Field.tsx'
import { IconPlus, IconTrash } from '../icons.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'
import './PeoplePage.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validatePerson(input: PersonInput): {
  name?: string
  email?: string
} {
  const errors: { name?: string; email?: string } = {}
  if (!input.name.trim()) {
    errors.name = 'Name is required.'
  }
  if (input.email.trim() && !EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  return errors
}

export function PeoplePage() {
  const {
    people,
    defaultFromId,
    loading,
    saving,
    error,
    addPerson,
    updatePerson,
    removePerson,
  } = useDirectory()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PersonInput>(emptyPersonInput())
  const [showErrors, setShowErrors] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const errors = useMemo(() => validatePerson(draft), [draft])
  const editingPerson = editingId
    ? people.find((person) => person.id === editingId)
    : undefined

  function startCreate() {
    setEditingId(null)
    setDraft(emptyPersonInput())
    setShowErrors(false)
    setPendingDeleteId(null)
  }

  function startEdit(person: Person) {
    setEditingId(person.id)
    setDraft({
      name: person.name,
      email: person.email,
      address: { ...person.address },
    })
    setShowErrors(false)
    setPendingDeleteId(null)
  }

  async function save() {
    if (errors.name || errors.email) {
      setShowErrors(true)
      return
    }
    const input: PersonInput = {
      name: draft.name.trim(),
      email: draft.email.trim(),
      address: { ...draft.address },
    }
    try {
      if (editingId) {
        await updatePerson(editingId, input)
      } else {
        await addPerson(input)
      }
      startCreate()
    } catch {
      // DirectoryContext already records the API error.
    }
  }

  async function confirmDelete(person: Person) {
    try {
      await removePerson(person.id)
      if (editingId === person.id) {
        startCreate()
      }
      setPendingDeleteId(null)
    } catch {
      // Keep the person visible; DirectoryContext records the error.
    }
  }

  return (
    <div className="app-page">
      {error ? <p className="api-banner api-banner--error">{error}</p> : null}
      {loading ? <p className="api-banner">Loading people…</p> : null}

      <InvoiceSection
        title={editingPerson ? `Edit ${editingPerson.name}` : 'Add person'}
        description="Saved people can be selected on the invoice From and Customer sections."
      >
        <form
          className="form-grid form-grid--2"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <Field
            label="Name"
            htmlFor="person-name"
            error={showErrors ? errors.name : undefined}
          >
            <input
              id="person-name"
              className="field__input"
              value={draft.name}
              required
              disabled={saving}
              aria-invalid={Boolean(showErrors && errors.name)}
              aria-describedby={
                showErrors && errors.name
                  ? fieldErrorId('person-name')
                  : undefined
              }
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </Field>
          <Field
            label="Email"
            htmlFor="person-email"
            error={showErrors ? errors.email : undefined}
          >
            <input
              id="person-email"
              className="field__input"
              type="email"
              value={draft.email}
              disabled={saving}
              aria-invalid={Boolean(showErrors && errors.email)}
              aria-describedby={
                showErrors && errors.email
                  ? fieldErrorId('person-email')
                  : undefined
              }
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </Field>
          <AddressFields
            idPrefix="person"
            address={draft.address}
            onChange={(patch) =>
              setDraft((current) => ({
                ...current,
                address: { ...current.address, ...patch },
              }))
            }
          />
          <div className="people-form__actions form-grid__full">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              <IconPlus />
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save person'
                  : 'Add person'}
            </button>
            {editingId ? (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={saving}
                onClick={startCreate}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </InvoiceSection>

      <InvoiceSection
        title="Saved people"
        description={
          loading
            ? 'Loading…'
            : people.length === 0
              ? 'No people yet.'
              : `${people.length} saved ${people.length === 1 ? 'person' : 'people'}.`
        }
      >
        {!loading && people.length === 0 ? (
          <p className="people-empty">
            Add a person above to use them on invoices.
          </p>
        ) : (
          <ul className="people-list">
            {people.map((person) => {
              const address = formatAddressLines(person.address).join(', ')
              const deleting = pendingDeleteId === person.id
              return (
                <li className="people-card" key={person.id}>
                  <div className="people-card__body">
                    <div className="people-card__title">
                      <strong>{person.name.trim() || 'Untitled person'}</strong>
                      {defaultFromId === person.id ? (
                        <span className="badge">Default from</span>
                      ) : null}
                    </div>
                    {person.email.trim() ? <p>{person.email.trim()}</p> : null}
                    {address ? <p>{address}</p> : null}
                  </div>
                  <div className="people-card__actions">
                    {deleting ? (
                      <>
                        <span className="people-card__confirm">Delete this person?</span>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={saving}
                          onClick={() => setPendingDeleteId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          disabled={saving}
                          onClick={() => void confirmDelete(person)}
                        >
                          {saving ? 'Deleting…' : 'Confirm'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={saving}
                          onClick={() => startEdit(person)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn--icon"
                          aria-label={`Delete ${person.name || 'person'}`}
                          disabled={saving}
                          onClick={() => setPendingDeleteId(person.id)}
                        >
                          <IconTrash />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </InvoiceSection>
    </div>
  )
}
