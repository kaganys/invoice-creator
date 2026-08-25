import type { InvoiceParty } from '../types/invoice.ts'
import type { Person, PersonInput } from '../types/person.ts'
import { addressesEqual, emptyAddress } from './address.ts'

export function emptyPersonInput(): PersonInput {
  return {
    name: '',
    email: '',
    address: emptyAddress(),
  }
}

export function matchingPersonId(
  people: Person[],
  party: InvoiceParty,
): string {
  const match = people.find(
    (person) =>
      person.name.trim() === party.name.trim() &&
      person.email.trim() === party.email.trim() &&
      addressesEqual(person.address, party.address),
  )
  return match?.id ?? ''
}
