import { errorJson, json } from '../http.ts'
import type { Router } from '../router.ts'

export function registerHealthRoutes(router: Router): void {
  router.get('/api/health', () => json({ ok: true }))

  router.get('/api/health/db', async (_request, env) => {
    try {
      const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
      if (!row || Number(row.ok) !== 1) {
        return errorJson('D1 query did not return the expected result', 503)
      }

      return json({ ok: true, db: true })
    } catch {
      return errorJson('D1 is unreachable', 503)
    }
  })
}
