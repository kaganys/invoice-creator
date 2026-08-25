import type { Address, InvoiceParty } from '../types/invoice.ts'

export function emptyAddress(): Address {
  return {
    line1: '',
    line2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
  }
}

export function formatAddressLines(address: Address): string[] {
  const lines: string[] = []
  const line1 = address.line1.trim()
  const line2 = address.line2.trim()
  const city = address.city.trim()
  const region = address.region.trim()
  const postalCode = address.postalCode.trim()
  const country = address.country.trim()

  if (line1) {
    lines.push(line1)
  }
  if (line2) {
    lines.push(line2)
  }

  const locality = [city, region].filter(Boolean).join(', ')
  const localityWithPostal = [locality, postalCode].filter(Boolean).join(' ')
  if (localityWithPostal) {
    lines.push(localityWithPostal)
  }
  if (country) {
    lines.push(country)
  }

  return lines
}

export function hasAddressContent(address: Address): boolean {
  return formatAddressLines(address).length > 0
}

export function hasPartyContent(party: InvoiceParty): boolean {
  return Boolean(
    party.name.trim() ||
      party.email.trim() ||
      hasAddressContent(party.address),
  )
}

export function addressesEqual(a: Address, b: Address): boolean {
  return (
    a.line1.trim() === b.line1.trim() &&
    a.line2.trim() === b.line2.trim() &&
    a.city.trim() === b.city.trim() &&
    a.region.trim() === b.region.trim() &&
    a.postalCode.trim() === b.postalCode.trim() &&
    a.country.trim() === b.country.trim()
  )
}
