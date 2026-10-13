import type { HostRole } from './hostRole.ts'

const PUBLIC_PAYMENT_PATH = /^\/i\/[^/]+\/?$/

export function isPublicPaymentPagePath(pathname: string): boolean {
  return PUBLIC_PAYMENT_PATH.test(normalizePath(pathname))
}

export function isPublicStaticAssetPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return (
    path.startsWith('/assets/') ||
    path.startsWith('/branding/') ||
    path.startsWith('/fonts/') ||
    path === '/favicon.ico' ||
    path === '/index.html'
  )
}

/**
 * API routes allowed on the public payment hostname.
 * Everything else under /api is admin-only.
 */
export function isPublicApiPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  if (path.startsWith('/api/public/')) {
    return true
  }
  if (path === '/api/webhooks/stripe' || path.startsWith('/api/webhooks/stripe/')) {
    return true
  }
  // Read-only uploaded branding bytes used by the payment page logo.
  if (path.startsWith('/api/branding/file/')) {
    return true
  }
  return false
}

export function isAdminApiPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path.startsWith('/api/') && !isPublicApiPath(path)
}

export function apiAllowedForRole(role: HostRole, pathname: string): boolean {
  const path = normalizePath(pathname)
  if (!path.startsWith('/api/')) {
    return false
  }
  if (role === 'dev' || role === 'admin') {
    return true
  }
  if (role === 'public') {
    return isPublicApiPath(path)
  }
  // locked (workers.dev): no API surface — use pay.vrfnw.com / invoice.vrfnw.com
  return false
}

export function pageAllowedForRole(role: HostRole, pathname: string): boolean {
  const path = normalizePath(pathname)
  if (role === 'dev' || role === 'admin') {
    return true
  }
  if (role === 'public') {
    return (
      path === '/' ||
      isPublicPaymentPagePath(path) ||
      isPublicStaticAssetPath(path) ||
      path === '/.well-known/apple-developer-merchantid-domain-association'
    )
  }
  return false
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname || '/'
}
