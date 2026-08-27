import type { BrandingKind } from '../../src/branding.ts'
import { createEntityId } from '../lib/ids.ts'
import {
  BRANDING_KINDS,
  BUILTIN_BRANDING,
  isBrandingKind,
  putBrandingObject,
  serializeBranding,
  withAsset,
} from '../settings/branding.ts'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import {
  createD1SequenceStore,
  createD1SettingsStore,
} from '../settings/d1Store.ts'
import type { ObjectStore } from '../settings/types.ts'
import { allocateCompanySlug, seedPresetRoles } from './bootstrap.ts'
import type { CompanyRecord, TenantStore, UserRecord } from './types.ts'
import { seedCompanyWorkspace } from './workspace.ts'

export type BrandingUpload = {
  kind: BrandingKind
  bytes: Uint8Array
  contentType: string
}

export type ProvisionCompanyInput = {
  store: TenantStore
  db: D1Database
  objects?: ObjectStore
  user: UserRecord
  name: string
  ownerName?: string
  fromName?: string
  fromEmail?: string
  zelleEmail?: string
  brandingUploads?: BrandingUpload[]
  timestamp: string
  idFactory?: () => string
}

export async function provisionCompany(
  input: ProvisionCompanyInput,
): Promise<CompanyRecord> {
  const idFactory = input.idFactory ?? createEntityId
  const slug = await allocateCompanySlug(input.store, input.name)
  const company = await input.store.createCompany({
    id: idFactory(),
    name: input.name,
    slug,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  })
  await seedPresetRoles(input.store, company.id, input.timestamp)
  const settings = createD1SettingsStore(input.db, company.id)
  const sequences = createD1SequenceStore(input.db, company.id)
  await seedCompanyWorkspace({
    settings,
    sequences,
    company,
    timestamp: input.timestamp,
    extras: {
      fromName: input.fromName || input.ownerName || input.name,
      fromEmail: input.fromEmail,
      zelleEmail: input.zelleEmail,
    },
  })

  if (input.objects && input.brandingUploads && input.brandingUploads.length > 0) {
    let branding = {
      siteWordmark: { ...BUILTIN_BRANDING.siteWordmark },
      siteIcon: { ...BUILTIN_BRANDING.siteIcon },
      invoiceLogo: { ...BUILTIN_BRANDING.invoiceLogo },
    }
    for (const upload of input.brandingUploads) {
      const stored = await putBrandingObject(
        input.objects,
        company.id,
        upload.kind,
        upload.bytes,
        upload.contentType,
        idFactory(),
      )
      if (!stored.ok) {
        throw new Error(stored.message)
      }
      branding = withAsset(branding, upload.kind, stored.value.path)
    }
    await settings.set(
      SETTINGS_KEYS.branding,
      serializeBranding(branding),
      input.timestamp,
    )
  }

  const owner = (await input.store.listRoles(company.id)).find(
    (role) => role.key === 'owner',
  )
  if (owner) {
    await input.store.createMembership({
      id: idFactory(),
      companyId: company.id,
      userId: input.user.id,
      roleId: owner.id,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    })
  }

  const ownerName = input.ownerName?.trim()
  await input.store.upsertUser({
    ...input.user,
    name: ownerName || input.user.name,
    lastCompanyId: company.id,
    updatedAt: input.timestamp,
  })

  return company
}

export async function brandingUploadsFromForm(
  form: FormData,
): Promise<BrandingUpload[]> {
  const uploads: BrandingUpload[] = []
  for (const kind of BRANDING_KINDS) {
    if (!isBrandingKind(kind)) {
      continue
    }
    const file = form.get(kind)
    if (!(file instanceof File) || file.size === 0) {
      continue
    }
    uploads.push({
      kind,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || '',
    })
  }
  return uploads
}
