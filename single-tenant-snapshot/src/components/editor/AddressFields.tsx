import type { Address } from '../../types/invoice.ts'
import { Field } from '../Field.tsx'

type AddressFieldsProps = {
  idPrefix: string
  address: Address
  onChange: (patch: Partial<Address>) => void
}

export function AddressFields({
  idPrefix,
  address,
  onChange,
}: AddressFieldsProps) {
  return (
    <>
      <Field label="Address line 1" htmlFor={`${idPrefix}-line1`}>
        <input
          id={`${idPrefix}-line1`}
          className="field__input"
          value={address.line1}
          onChange={(event) => onChange({ line1: event.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field label="Address line 2" htmlFor={`${idPrefix}-line2`}>
        <input
          id={`${idPrefix}-line2`}
          className="field__input"
          value={address.line2}
          onChange={(event) => onChange({ line2: event.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field label="City" htmlFor={`${idPrefix}-city`}>
        <input
          id={`${idPrefix}-city`}
          className="field__input"
          value={address.city}
          onChange={(event) => onChange({ city: event.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field label="State / region" htmlFor={`${idPrefix}-region`}>
        <input
          id={`${idPrefix}-region`}
          className="field__input"
          value={address.region}
          onChange={(event) => onChange({ region: event.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field label="Postal code" htmlFor={`${idPrefix}-postal`}>
        <input
          id={`${idPrefix}-postal`}
          className="field__input"
          value={address.postalCode}
          onChange={(event) => onChange({ postalCode: event.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field label="Country" htmlFor={`${idPrefix}-country`}>
        <input
          id={`${idPrefix}-country`}
          className="field__input"
          value={address.country}
          onChange={(event) => onChange({ country: event.target.value })}
          autoComplete="off"
        />
      </Field>
    </>
  )
}
