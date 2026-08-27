import type { Address, InvoiceParty } from './invoice.ts'

export type Person = {
  id: string
  name: string
  email: string
  address: Address
}

export type PersonInput = Omit<Person, 'id'>

export type AppSettings = {
  defaultFromId: string | null
}

export type AppView = 'invoice' | 'invoices' | 'people' | 'settings' | 'users'

export function partyFromPerson(person: Person): InvoiceParty {
  return {
    name: person.name,
    email: person.email,
    address: { ...person.address },
  }
}

export function personLabel(person: Person): string {
  const name = person.name.trim()
  const email = person.email.trim()
  if (name && email) {
    return `${name} (${email})`
  }
  return name || email || 'Untitled person'
}
