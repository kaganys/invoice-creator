import { isUuid } from '../lib/ids.ts'
import type { MembershipView } from '../tenancy/types.ts'

export function canSwitchCompanies(memberships: MembershipView[]): boolean {
  return memberships.length > 1
}

export function resolveMembership(
  memberships: MembershipView[],
  options: {
    requestedCompanyId: string
    lastCompanyId: string | null
  },
): MembershipView | null {
  if (memberships.length === 0) {
    return null
  }

  const requested = options.requestedCompanyId.trim()
  if (requested && isUuid(requested)) {
    const match = memberships.find((entry) => entry.company.id === requested)
    if (match) {
      return match
    }
  }

  if (options.lastCompanyId) {
    const last = memberships.find(
      (entry) => entry.company.id === options.lastCompanyId,
    )
    if (last) {
      return last
    }
  }

  return memberships[0] ?? null
}
