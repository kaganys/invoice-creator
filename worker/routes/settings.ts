import { requireAdmin } from '../auth/admin.ts'
import type { Permission } from '../../src/auth/permissions.ts'
import { createD1InvoiceStore } from '../invoices/d1Store.ts'
import { createD1DirectoryStore } from '../people/d1Store.ts'
import { updateSettings } from '../people/handlers.ts'
import type { Router } from '../router.ts'
import {
  createD1SequenceStore,
  createD1SettingsStore,
  createR2ObjectStore,
} from '../settings/d1Store.ts'
import {
  brandingBucket,
  smtpPasswordSecret,
  stripeSecretKey,
} from '../settings/env.ts'
import {
  allocateInvoiceNumber,
  changeNextSequence,
  getAllSettings,
  getBrandingSettings,
  getDefaults,
  restoreBrandingAsset,
  serveBrandingFile,
  getNumberingSettings,
  getFormatSettings,
  getPaymentsSettings,
  getSmtpSettings,
  testSmtpSettings,
  updateDefaults,
  updateFormatSettings,
  updatePaymentsSettings,
  updateNumberingSettings,
  updateSmtpSettings,
  uploadBrandingAsset,
  type SettingsDeps,
} from '../settings/handlers.ts'
import { DEFAULT_COMPANY_ID } from '../tenancy/types.ts'

function deps(env: Env, companyId: string): SettingsDeps {
  const bucket = brandingBucket(env)
  return {
    settings: createD1SettingsStore(env.DB, companyId),
    sequences: createD1SequenceStore(env.DB, companyId),
    people: createD1DirectoryStore(env.DB, companyId),
    invoices: createD1InvoiceStore(env.DB, companyId),
    objects: bucket ? createR2ObjectStore(bucket) : undefined,
    smtpPassword: smtpPasswordSecret(env),
    stripeSecret: stripeSecretKey(env),
    companyId,
  }
}

async function settingsRoute(
  request: Request,
  env: Env,
  permission: Permission,
  run: (companyDeps: SettingsDeps) => Response | Promise<Response>,
) {
  const auth = await requireAdmin(request, env, permission)
  if (!auth.ok) {
    return auth.response
  }
  return run(deps(env, auth.ctx.company.id))
}

export function registerSettingsRoutes(router: Router): void {
  router.get('/api/settings', (request, env) =>
    settingsRoute(request, env, 'settings.view', (companyDeps) =>
      getAllSettings(companyDeps),
    ),
  )

  router.put('/api/settings', async (request, env) => {
    const auth = await requireAdmin(request, env, 'settings.defaults')
    if (!auth.ok) {
      return auth.response
    }
    return updateSettings(
      request,
      createD1DirectoryStore(env.DB, auth.ctx.company.id),
    )
  })

  router.get('/api/settings/defaults', (request, env) =>
    settingsRoute(request, env, 'settings.view', getDefaults),
  )
  router.put('/api/settings/defaults', (request, env) =>
    settingsRoute(request, env, 'settings.defaults', (companyDeps) =>
      updateDefaults(request, companyDeps),
    ),
  )

  router.get('/api/settings/numbering', (request, env) =>
    settingsRoute(request, env, 'settings.view', getNumberingSettings),
  )
  router.put('/api/settings/numbering', (request, env) =>
    settingsRoute(request, env, 'settings.numbering', (companyDeps) =>
      updateNumberingSettings(request, companyDeps),
    ),
  )
  router.post('/api/settings/numbering/next', (request, env) =>
    settingsRoute(request, env, 'settings.numbering', (companyDeps) =>
      changeNextSequence(request, companyDeps),
    ),
  )

  router.post('/api/invoices/allocate-number', (request, env) =>
    settingsRoute(request, env, 'invoices.create', allocateInvoiceNumber),
  )

  router.get('/api/settings/branding', (request, env) =>
    settingsRoute(request, env, 'settings.view', getBrandingSettings),
  )
  router.post('/api/settings/branding/:kind', (request, env, _ctx, params) =>
    settingsRoute(request, env, 'settings.branding', (companyDeps) =>
      uploadBrandingAsset(request, params.kind ?? '', companyDeps),
    ),
  )
  router.post(
    '/api/settings/branding/:kind/restore',
    (request, env, _ctx, params) =>
      settingsRoute(request, env, 'settings.branding', (companyDeps) =>
        restoreBrandingAsset(params.kind ?? '', companyDeps),
      ),
  )
  router.get('/api/branding/file/:key', (_request, env, _ctx, params) =>
    serveBrandingFile(params.key ?? '', deps(env, DEFAULT_COMPANY_ID)),
  )

  router.get('/api/settings/smtp', (request, env) =>
    settingsRoute(request, env, 'settings.view', getSmtpSettings),
  )
  router.put('/api/settings/smtp', (request, env) =>
    settingsRoute(request, env, 'settings.email', (companyDeps) =>
      updateSmtpSettings(request, companyDeps),
    ),
  )
  router.post('/api/settings/smtp/test', (request, env) =>
    settingsRoute(request, env, 'settings.email', (companyDeps) =>
      testSmtpSettings(request, companyDeps),
    ),
  )

  router.get('/api/settings/format', (request, env) =>
    settingsRoute(request, env, 'settings.view', getFormatSettings),
  )
  router.put('/api/settings/format', (request, env) =>
    settingsRoute(request, env, 'settings.format', (companyDeps) =>
      updateFormatSettings(request, companyDeps),
    ),
  )

  router.get('/api/settings/payments', (request, env) =>
    settingsRoute(request, env, 'settings.view', getPaymentsSettings),
  )
  router.put('/api/settings/payments', (request, env) =>
    settingsRoute(request, env, 'settings.payments', (companyDeps) =>
      updatePaymentsSettings(request, companyDeps),
    ),
  )
}
