import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS } from '../../src/auth/permissions.ts'
import { DEFAULT_COMPANY_ID } from '../tenancy/types.ts'
import type { MembershipView } from '../tenancy/types.ts'
import { canSwitchCompanies, resolveMembership } from './companyAccess.ts'

const OTHER_COMPANY = 'c0a1b1e0-0000-4000-8000-000000000002'

function membership(
  companyId: string,
  permissions: string[],
  roleKey = 'member',
): MembershipView {
  const now = '2026-08-27T00:00:00.000Z'
  return {
    company: {
      id: companyId,
      name: companyId === DEFAULT_COMPANY_ID ? 'Bitz Designs' : 'Other Co',
      slug: 'slug',
      createdAt: now,
      updatedAt: now,
    },
    role: {
      id: `role-${companyId}`,
      companyId,
      key: roleKey,
      name: roleKey,
      permissions: permissions as MembershipView['role']['permissions'],
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    },
    membership: {
      id: `mem-${companyId}`,
      companyId,
      userId: 'user-1',
      roleId: `role-${companyId}`,
      createdAt: now,
      updatedAt: now,
    },
  }
}

describe('company access', () => {
  it('shows a switcher only when the email belongs to more than one tenant', () => {
    expect(
      canSwitchCompanies([membership(OTHER_COMPANY, ['invoices.view'])]),
    ).toBe(false)
    expect(
      canSwitchCompanies([
        membership(DEFAULT_COMPANY_ID, ALL_PERMISSIONS, 'owner'),
        membership(OTHER_COMPANY, ['invoices.view']),
      ]),
    ).toBe(true)
  })

  it('locks a single-membership user to that company even if another id is requested', () => {
    const rows = [membership(OTHER_COMPANY, ['invoices.view'], 'viewer')]
    const current = resolveMembership(rows, {
      requestedCompanyId: DEFAULT_COMPANY_ID,
      lastCompanyId: DEFAULT_COMPANY_ID,
    })
    expect(current?.company.id).toBe(OTHER_COMPANY)
  })

  it('lets a multi-tenant email honor X-Company-Id when they belong to it', () => {
    const rows = [
      membership(DEFAULT_COMPANY_ID, ['invoices.view'], 'viewer'),
      membership(OTHER_COMPANY, ['invoices.view'], 'viewer'),
    ]
    const current = resolveMembership(rows, {
      requestedCompanyId: OTHER_COMPANY,
      lastCompanyId: DEFAULT_COMPANY_ID,
    })
    expect(current?.company.id).toBe(OTHER_COMPANY)
  })

  it('falls back to lastCompanyId then first membership', () => {
    const rows = [
      membership(DEFAULT_COMPANY_ID, ['invoices.view'], 'viewer'),
      membership(OTHER_COMPANY, ['invoices.view'], 'viewer'),
    ]
    expect(
      resolveMembership(rows, {
        requestedCompanyId: '',
        lastCompanyId: OTHER_COMPANY,
      })?.company.id,
    ).toBe(OTHER_COMPANY)
    expect(
      resolveMembership(rows, {
        requestedCompanyId: '',
        lastCompanyId: null,
      })?.company.id,
    ).toBe(DEFAULT_COMPANY_ID)
  })
})
