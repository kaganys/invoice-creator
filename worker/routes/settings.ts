import { createD1DirectoryStore } from '../people/d1Store.ts'
import { getSettings, updateSettings } from '../people/handlers.ts'
import type { Router } from '../router.ts'

export function registerSettingsRoutes(router: Router): void {
  router.get('/api/settings', (_request, env) =>
    getSettings(createD1DirectoryStore(env.DB)),
  )

  router.put('/api/settings', (request, env) =>
    updateSettings(request, createD1DirectoryStore(env.DB)),
  )
}
