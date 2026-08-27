import { PRESET_ROLES } from '../../src/auth/permissions.ts'
import { createEntityId, nowIso } from '../lib/ids.ts'
import type { AccessIdentity } from '../auth/identity.ts'
import type { CompanyRecord, TenantStore, UserRecord } from './types.ts'
import { DEFAULT_COMPANY_ID } from './types.ts'

export async function seedPresetRoles(
  store: TenantStore,
  companyId: string,
  timestamp = nowIso(),
): Promise<void> {
  const existing = await store.listRoles(companyId)
  if (existing.length > 0) {
    return
  }
  for (const preset of PRESET_ROLES) {
    await store.createRole({
      id: createEntityId(),
      companyId,
      key: preset.key,
      name: preset.name,
      permissions: preset.permissions,
      isSystem: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
}

export function slugifyCompanyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'company'
}

export async function ensureCompanyReady(
  store: TenantStore,
  company: CompanyRecord,
): Promise<void> {
  await seedPresetRoles(store, company.id)
}

export async function bootstrapAccessUser(
  store: TenantStore,
  identity: AccessIdentity,
): Promise<UserRecord> {
  const timestamp = nowIso()
  const existing = await store.getUserByEmail(identity.email)
  const user = await store.upsertUser({
    id: existing?.id ?? createEntityId(),
    email: identity.email,
    name: identity.name || existing?.name || identity.email,
    lastCompanyId: existing?.lastCompanyId ?? null,
    lastSeenAt: timestamp,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  })

  const companies = await store.listCompanies()
  if (companies.length === 0) {
    const company = await store.createCompany({
      id: DEFAULT_COMPANY_ID,
      name: 'Bitz Designs',
      slug: 'bitz-designs',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await seedPresetRoles(store, company.id, timestamp)
    const owner = (await store.listRoles(company.id)).find(
      (role) => role.key === 'owner',
    )
    if (owner) {
      await store.createMembership({
        id: createEntityId(),
        companyId: company.id,
        userId: user.id,
        roleId: owner.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
    return { ...user, lastCompanyId: company.id }
  }

  await seedPresetRoles(store, DEFAULT_COMPANY_ID, timestamp)

  const userCount = await store.countUsers()
  const memberships = await store.listMembershipsForUser(user.id)
  if (memberships.length === 0 && userCount <= 1) {
    const owner = (await store.listRoles(DEFAULT_COMPANY_ID)).find(
      (role) => role.key === 'owner',
    )
    if (owner) {
      await store.createMembership({
        id: createEntityId(),
        companyId: DEFAULT_COMPANY_ID,
        userId: user.id,
        roleId: owner.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  }

  return user
}
