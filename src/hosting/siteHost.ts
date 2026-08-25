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
  if (host.endsWith('.workers.dev')) {
    return 'locked'
  }
  return 'locked'
}

export function publicPaymentTokenFromPath(
  pathname = window.location.pathname,
): string | null {
  const match = /^\/i\/([^/]+)$/.exec(pathname)
  return match?.[1] ?? null
}
