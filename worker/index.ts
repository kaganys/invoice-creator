import { errorJson } from './http.ts'
import {
  apiAllowedForRole,
  isPublicPaymentPagePath,
  isPublicStaticAssetPath,
} from './hosting/access.ts'
import {
  isApplePayDomainFilePath,
  serveApplePayAssociationFile,
} from './payments/applePayDomain.ts'
import { classifyHostname } from './hosting/hostRole.ts'
import {
  hostNotFoundHtml,
  lockedWorkersDevHtml,
  publicLandingHtml,
} from './hosting/responses.ts'
import { Router } from './router.ts'
import { registerHealthRoutes } from './routes/health.ts'
import { registerInvoiceRoutes } from './routes/invoices.ts'
import { registerPeopleRoutes } from './routes/people.ts'
import { registerPublicRoutes } from './routes/public.ts'
import { registerSettingsRoutes } from './routes/settings.ts'
import { registerWebhookRoutes } from './routes/webhooks.ts'

const router = new Router()
registerHealthRoutes(router)
registerPeopleRoutes(router)
registerSettingsRoutes(router)
registerInvoiceRoutes(router)
registerPublicRoutes(router)
registerWebhookRoutes(router)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const role = classifyHostname(url.hostname)
    const path = url.pathname

    if (isApplePayDomainFilePath(path)) {
      return serveApplePayAssociationFile()
    }

    if (path.startsWith('/api/')) {
      if (!apiAllowedForRole(role, path)) {
        return errorJson('Not found', 404)
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
    }

    if (role === 'locked') {
      return lockedWorkersDevHtml()
    }

    if (role === 'public') {
      if (path === '/' || path === '') {
        return publicLandingHtml()
      }
      // Tolerate bare /:token links by sending them to /i/:token.
      const bareToken = barePaymentTokenPath(path)
      if (bareToken) {
        const target = new URL(`/i/${bareToken}`, request.url).toString()
        return Response.redirect(target, 302)
      }
      if (isPublicPaymentPagePath(path)) {
        return servePaymentSpa(env, request)
      }
      // Favicon / rare Worker-first static hits only. /assets /branding /fonts are asset-first.
      if (isPublicStaticAssetPath(path)) {
        return serveAssets(env, request)
      }
      return hostNotFoundHtml(
        'This payment site only serves customer payment links.',
      )
    }

    // admin + local dev: full SPA (Cloudflare Access protects invoice.vrfnw.com)
    return serveAssets(env, request)
  },
} satisfies ExportedHandler<Env>

async function servePaymentSpa(env: Env, request: Request): Promise<Response> {
  const assets = env.ASSETS
  if (!assets) {
    return hostNotFoundHtml('Payment page assets are unavailable.')
  }
  // Load the SPA shell explicitly. ASSETS may 302 /index.html → / under html_handling;
  // follow that internally and return 200 HTML so the browser stays on /i/:token.
  let assetResponse = await assets.fetch(new URL('/index.html', request.url))
  if (assetResponse.status >= 300 && assetResponse.status < 400) {
    const location = assetResponse.headers.get('Location')
    if (location) {
      assetResponse = await assets.fetch(new URL(location, request.url))
    }
  }
  if (!assetResponse.ok) {
    return hostNotFoundHtml('Payment page assets are unavailable.')
  }
  const headers = new Headers(assetResponse.headers)
  headers.delete('Location')
  headers.set('cache-control', 'no-store')
  return new Response(assetResponse.body, {
    status: 200,
    headers,
  })
}

async function serveAssets(env: Env, request: Request): Promise<Response> {
  const assets = env.ASSETS
  if (!assets) {
    return new Response(null, { status: 404 })
  }
  return assets.fetch(request)
}

/** Match a root path that is only a well-formed payment token (no /i/ prefix). */
function barePaymentTokenPath(pathname: string): string | null {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname
  const match = /^\/([A-Za-z0-9_-]{43})$/.exec(normalized)
  return match?.[1] ?? null
}
