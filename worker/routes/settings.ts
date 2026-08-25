import { createD1InvoiceStore } from '../invoices/d1Store.ts'
import { createD1DirectoryStore } from '../people/d1Store.ts'
import { updateSettings } from '../people/handlers.ts'
import type { Router } from '../router.ts'
import {
  createD1SequenceStore,
  createD1SettingsStore,
  createR2ObjectStore,
} from '../settings/d1Store.ts'
import { brandingBucket, smtpPasswordSecret } from '../settings/env.ts'
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
  getSmtpSettings,
  testSmtpSettings,
  updateDefaults,
  updateFormatSettings,
  updateNumberingSettings,
  updateSmtpSettings,
  uploadBrandingAsset,
  type SettingsDeps,
} from '../settings/handlers.ts'

function deps(env: Env): SettingsDeps {
  const bucket = brandingBucket(env)
  return {
    settings: createD1SettingsStore(env.DB),
    sequences: createD1SequenceStore(env.DB),
    people: createD1DirectoryStore(env.DB),
    invoices: createD1InvoiceStore(env.DB),
    objects: bucket ? createR2ObjectStore(bucket) : undefined,
    smtpPassword: smtpPasswordSecret(env),
  }
}

export function registerSettingsRoutes(router: Router): void {
  router.get('/api/settings', (_request, env) => getAllSettings(deps(env)))

  router.put('/api/settings', (request, env) =>
    updateSettings(request, createD1DirectoryStore(env.DB)),
  )

  router.get('/api/settings/defaults', (_request, env) => getDefaults(deps(env)))
  router.put('/api/settings/defaults', (request, env) =>
    updateDefaults(request, deps(env)),
  )

  router.get('/api/settings/numbering', (_request, env) =>
    getNumberingSettings(deps(env)),
  )
  router.put('/api/settings/numbering', (request, env) =>
    updateNumberingSettings(request, deps(env)),
  )
  router.post('/api/settings/numbering/next', (request, env) =>
    changeNextSequence(request, deps(env)),
  )

  router.post('/api/invoices/allocate-number', (_request, env) =>
    allocateInvoiceNumber(deps(env)),
  )

  router.get('/api/settings/branding', (_request, env) =>
    getBrandingSettings(deps(env)),
  )
  router.post('/api/settings/branding/:kind', (request, env, _ctx, params) =>
    uploadBrandingAsset(request, params.kind ?? '', deps(env)),
  )
  router.post(
    '/api/settings/branding/:kind/restore',
    (_request, env, _ctx, params) =>
      restoreBrandingAsset(params.kind ?? '', deps(env)),
  )
  router.get('/api/branding/file/:key', (_request, env, _ctx, params) =>
    serveBrandingFile(params.key ?? '', deps(env)),
  )

  router.get('/api/settings/smtp', (_request, env) => getSmtpSettings(deps(env)))
  router.put('/api/settings/smtp', (request, env) =>
    updateSmtpSettings(request, deps(env)),
  )
  router.post('/api/settings/smtp/test', (request, env) =>
    testSmtpSettings(request, deps(env)),
  )

  router.get('/api/settings/format', (_request, env) =>
    getFormatSettings(deps(env)),
  )
  router.put('/api/settings/format', (request, env) =>
    updateFormatSettings(request, deps(env)),
  )
}
