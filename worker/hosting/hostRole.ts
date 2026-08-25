export type HostRole = 'admin' | 'public' | 'dev' | 'locked'

export const ADMIN_HOSTNAME = 'invoice.vrfnw.com'
export const PUBLIC_HOSTNAME = 'pay.vrfnw.com'

/**
 * Classify the request host for access control.
 *
 * Production:
 * - invoice.vrfnw.com → private admin (Cloudflare Access)
 * - pay.vrfnw.com → public card payment only
 * - *.workers.dev → locked (must not bypass Access)
 *
 * Local development (localhost / 127.0.0.1) stays fully usable.
 */
export function classifyHostname(hostname: string): HostRole {
  const host = hostname.trim().toLowerCase()
  if (!host) {
    return 'locked'
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return 'dev'
  }
  // Vite / wrangler may use localhost with a port in Host; URL.hostname strips the port.
  if (host.endsWith('.localhost')) {
    return 'dev'
  }
  if (host === ADMIN_HOSTNAME) {
    return 'admin'
  }
  if (host === PUBLIC_HOSTNAME) {
    return 'public'
  }
  if (host.endsWith('.workers.dev')) {
    return 'locked'
  }
  return 'locked'
}
