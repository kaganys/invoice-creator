import { describe, expect, it } from 'vitest'
import { PRESET_ROLES } from '../../src/auth/permissions.ts'
import { decideCompanyRemoval, decideCompanyRename } from './companyAdmin.ts'

const owner = PRESET_ROLES.find((role) => role.key === 'owner')?.permissions ?? []
const admin = PRESET_ROLES.find((role) => role.key === 'admin')?.permissions ?? []
const viewer = PRESET_ROLES.find((role) => role.key === 'viewer')?.permissions ?? []

describe('company admin decisions', () => {
  it('renames only a company the user belongs to, using that membership', () => {
    expect(
      decideCompanyRename({
        isMember: false,
        permissions: owner,
        name: 'Harbor Studio',
      }),
    ).toEqual({ ok: false, status: 404, message: 'Company not found.' })
    expect(
      decideCompanyRename({
        isMember: true,
        permissions: viewer,
        name: 'Harbor Studio',
      }).ok,
    ).toBe(false)
    expect(
      decideCompanyRename({
        isMember: true,
        permissions: admin,
        name: '  Harbor Studio  ',
      }),
    ).toEqual({ ok: true, name: 'Harbor Studio' })
    expect(
      decideCompanyRename({
        isMember: true,
        permissions: owner,
        name: 'A',
      }).status,
    ).toBe(400)
  })

  it('blocks removal when the company has invoices or the role cannot create companies', () => {
    expect(
      decideCompanyRemoval({
        isMember: false,
        permissions: owner,
        invoiceCount: 0,
      }).status,
    ).toBe(404)
    expect(
      decideCompanyRemoval({
        isMember: true,
        permissions: admin,
        invoiceCount: 0,
      }),
    ).toMatchObject({ ok: false, status: 403 })
    expect(
      decideCompanyRemoval({
        isMember: true,
        permissions: owner,
        invoiceCount: 3,
      }),
    ).toEqual({
      ok: false,
      status: 409,
      message: 'This company has invoices, so it cannot be removed.',
    })
    expect(
      decideCompanyRemoval({
        isMember: true,
        permissions: owner,
        invoiceCount: 0,
      }),
    ).toEqual({ ok: true })
  })
})
