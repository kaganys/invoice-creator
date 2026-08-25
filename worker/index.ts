import { errorJson } from './http.ts'
import { Router } from './router.ts'
import { registerHealthRoutes } from './routes/health.ts'
import { registerInvoiceRoutes } from './routes/invoices.ts'
import { registerPeopleRoutes } from './routes/people.ts'
import { registerSettingsRoutes } from './routes/settings.ts'

const router = new Router()
registerHealthRoutes(router)
registerPeopleRoutes(router)
registerSettingsRoutes(router)
registerInvoiceRoutes(router)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (!url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 404 })
    }

    const match = router.match(request)
    if (match.type === 'none') {
      return errorJson('Not found', 404)
    }
    if (match.type === 'method') {
      return errorJson('Method not allowed', 405)
    }

    try {
      return await match.handler(request, env, ctx, match.params)
    } catch {
      return errorJson('Internal server error', 500)
    }
  },
} satisfies ExportedHandler<Env>
