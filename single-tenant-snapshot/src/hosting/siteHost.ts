/** Mirrors Worker host roles for client-side defense-in-depth (Worker is authoritative). */

export type SiteKind = 'admin' | 'public' | 'dev' | 'locked'

export function classifyBrowserHostname(hostname = window.location.hostname): SiteKind {
  const host = hostname.trim().toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return 'dev'
  }
  if (host.endsWith('.localhost')) {
    return 'dev'
  }
  if (host === 'invoice.vrfnw.com') {
    return 'admin'
  }
  if (host === 'pay.vrfnw.com') {
    return 'public'
  }
  // Any other host (including *.workers.dev) is locked.
  return 'locked'
}

export function publicPaymentTokenFromPath(
  pathname = window.location.pathname,
): string | null {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname
  const withPrefix = /^\/i\/([^/]+)$/.exec(normalized)
  if (withPrefix?.[1]) {
    try {
      return decodeURIComponent(withPrefix[1])
    } catch {
      return withPrefix[1]
    }
  }
  // Bare /:token (some older/misconfigured links)
  const bare = /^\/([A-Za-z0-9_-]{43})$/.exec(normalized)
  return bare?.[1] ?? null
}
