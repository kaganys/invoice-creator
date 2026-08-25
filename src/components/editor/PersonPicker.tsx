import { useDirectory } from '../../directory/DirectoryContext.tsx'
import type { InvoiceParty } from '../../types/invoice.ts'
import { partyFromPerson, personLabel } from '../../types/person.ts'
import { matchingPersonId } from '../../utils/person.ts'
import { Field } from '../Field.tsx'

type PersonPickerProps = {
  id: string
  label: string
  party: InvoiceParty
  onSelect: (party: InvoiceParty) => void
}

export function PersonPicker({ id, label, party, onSelect }: PersonPickerProps) {
  const { people, loading } = useDirectory()
  const selectedId = matchingPersonId(people, party)

  if (loading) {
    return (
      <p className="person-picker__hint form-grid__full">Loading people…</p>
    )
  }

  if (people.length === 0) {
    return (
      <p className="person-picker__hint form-grid__full">
        No saved people yet. Add someone in People, then you can select them
        here to auto-fill these fields.
      </p>
    )
  }

  return (
    <Field label={label} htmlFor={id} className="form-grid__full">
      <select
        id={id}
        className="field__select"
        value={selectedId}
        onChange={(event) => {
          const person = people.find((entry) => entry.id === event.target.value)
          if (person) {
            onSelect(partyFromPerson(person))
          }
        }}
      >
        <option value="">Type manually</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {personLabel(person)}
          </option>
        ))}
      </select>
    </Field>
  )
}
