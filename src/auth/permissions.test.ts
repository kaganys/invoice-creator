import { describe, expect, it } from 'vitest'
import {
  hasPermission,
  isPermission,
  normalizePermissions,
  PRESET_ROLES,
} from './permissions.ts'

describe('permissions', () => {
  it('accepts only catalog permissions', () => {
    expect(isPermission('invoices.send')).toBe(true)
    expect(isPermission('invoices.explode')).toBe(false)
    expect(
      normalizePermissions(['invoices.view', 'nope', 'invoices.view', 3]),
    ).toEqual(['invoices.view'])
  })

  it('gives owners every catalog permission', () => {
    const owner = PRESET_ROLES.find((role) => role.key === 'owner')
    expect(owner).toBeTruthy()
    expect(hasPermission(owner?.permissions, 'users.manage')).toBe(true)
    expect(hasPermission(owner?.permissions, 'companies.create')).toBe(true)
    expect(hasPermission(['invoices.view'], 'invoices.send')).toBe(false)
  })
})
