import { PRESET_ROLES } from '../../src/auth/permissions.ts'
import { createEntityId, nowIso } from '../lib/ids.ts'
import type { AccessIdentity } from '../auth/identity.ts'
import type { CompanyRecord, TenantStore, UserRecord } from './types.ts'

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

export async function allocateCompanySlug(
  store: TenantStore,
  name: string,
  exceptCompanyId?: string,
): Promise<string> {
  const slugBase = slugifyCompanyName(name)
  const used = new Set(
    (await store.listCompanies())
      .filter((row) => row.id !== exceptCompanyId)
      .map((row) => row.slug),
  )
  let slug = slugBase
  let attempt = 1
  while (used.has(slug)) {
    attempt += 1
    slug = `${slugBase}-${attempt}`
  }
  return slug
}

export async function bootstrapAccessUser(
  store: TenantStore,
  identity: AccessIdentity,
): Promise<UserRecord> {
  const timestamp = nowIso()
  const existing = await store.getUserByEmail(identity.email)
  return store.upsertUser({
    id: existing?.id ?? createEntityId(),
    email: identity.email,
    name: identity.name || existing?.name || identity.email,
    lastCompanyId: existing?.lastCompanyId ?? null,
    lastSeenAt: timestamp,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  })
}
