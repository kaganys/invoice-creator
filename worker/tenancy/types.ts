import type { Permission } from '../../src/auth/permissions.ts'

export const DEFAULT_COMPANY_ID = 'c0a1b1e0-0000-4000-8000-000000000001'

export type CompanyRecord = {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
}

export type UserRecord = {
  id: string
  email: string
  name: string
  lastCompanyId: string | null
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export type RoleRecord = {
  id: string
  companyId: string
  key: string | null
  name: string
  permissions: Permission[]
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export type MembershipRecord = {
  id: string
  companyId: string
  userId: string
  roleId: string
  createdAt: string
  updatedAt: string
}

export type MembershipView = {
  company: CompanyRecord
  role: RoleRecord
  membership: MembershipRecord
}

export interface TenantStore {
  listCompanies(): Promise<CompanyRecord[]>
  getCompany(id: string): Promise<CompanyRecord | null>
  createCompany(record: CompanyRecord): Promise<CompanyRecord>
  updateCompany(
    id: string,
    fields: { name: string; slug: string; updatedAt: string },
  ): Promise<CompanyRecord | null>
  getUserByEmail(email: string): Promise<UserRecord | null>
  getUser(id: string): Promise<UserRecord | null>
  upsertUser(record: UserRecord): Promise<UserRecord>
  listUsersByCompany(companyId: string): Promise<
    { user: UserRecord; role: RoleRecord; membership: MembershipRecord }[]
  >
  listMembershipsForUser(userId: string): Promise<MembershipView[]>
  getMembership(
    companyId: string,
    userId: string,
  ): Promise<MembershipView | null>
  createMembership(record: MembershipRecord): Promise<MembershipRecord>
  updateMembershipRole(
    id: string,
    roleId: string,
    updatedAt: string,
  ): Promise<void>
  deleteMembership(id: string): Promise<boolean>
  listRoles(companyId: string): Promise<RoleRecord[]>
  getRole(id: string): Promise<RoleRecord | null>
  createRole(record: RoleRecord): Promise<RoleRecord>
  updateRole(
    id: string,
    fields: { name: string; permissions: Permission[]; updatedAt: string },
  ): Promise<RoleRecord | null>
  deleteRole(id: string): Promise<boolean>
  countMembershipsForRole(roleId: string): Promise<number>
  countUsers(): Promise<number>
}
