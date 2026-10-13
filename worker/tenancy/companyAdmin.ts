import { hasPermission, type Permission } from '../../src/auth/permissions.ts'

export type CompanyDecision =
  | { ok: true; name?: string }
  | { ok: false; status: 400 | 403 | 404 | 409; message: string }

export function decideCompanyRename(input: {
  isMember: boolean
  permissions: readonly string[]
  name: string
}): CompanyDecision {
  if (!input.isMember) {
    return { ok: false, status: 404, message: 'Company not found.' }
  }
  if (!hasPermission(input.permissions, 'companies.edit')) {
    return {
      ok: false,
      status: 403,
      message: 'You do not have permission to rename this company.',
    }
  }
  const name = input.name.trim()
  if (name.length < 2 || name.length > 80) {
    return {
      ok: false,
      status: 400,
      message: 'Company name must be 2 to 80 characters.',
    }
  }
  return { ok: true, name }
}

export function decideCompanyRemoval(input: {
  isMember: boolean
  permissions: readonly string[]
  invoiceCount: number
}): CompanyDecision {
  if (!input.isMember) {
    return { ok: false, status: 404, message: 'Company not found.' }
  }
  if (!hasPermission(input.permissions, 'companies.create')) {
    return {
      ok: false,
      status: 403,
      message: 'You do not have permission to remove this company.',
    }
  }
  if (input.invoiceCount > 0) {
    return {
      ok: false,
      status: 409,
      message: 'This company has invoices, so it cannot be removed.',
    }
  }
  return { ok: true }
}

export function canOpenCompanies(permissions: readonly Permission[] | undefined): boolean {
  return hasPermission(permissions, 'companies.create')
}
