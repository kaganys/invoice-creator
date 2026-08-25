export const BRAND = {
  icon: '/branding/bitz-designs-icon.png',
  wordmark: '/branding/bitz-designs-wordmark.png',
} as const

export const BRANDING_KINDS = [
  'site-wordmark',
  'site-icon',
  'invoice-logo',
] as const

export type BrandingKind = (typeof BRANDING_KINDS)[number]

export const BUILTIN_BRANDING_PATHS: Record<BrandingKind, string> = {
  'site-wordmark': BRAND.wordmark,
  'site-icon': BRAND.icon,
  'invoice-logo': BRAND.icon,
}

const SAFE_OBJECT_KEY =
  /^branding\/(site-wordmark|site-icon|invoice-logo)\/[0-9a-f-]{36}\.(png|jpg|webp)$/i

export function isSafeObjectKey(key: string): boolean {
  return SAFE_OBJECT_KEY.test(key) && !key.includes('..') && !key.includes('\\')
}

export function brandingFileUrl(objectKey: string): string {
  return `/api/branding/file/${encodeURIComponent(objectKey)}`
}

export function objectKeyFromFileUrl(path: string): string | null {
  const match = /^\/api\/branding\/file\/(.+)$/.exec(path)
  if (!match) {
    return null
  }
  try {
    const key = decodeURIComponent(match[1] ?? '')
    return isSafeObjectKey(key) ? key : null
  } catch {
    return null
  }
}

export function isAllowedBrandingPath(path: string): boolean {
  if (path === BRAND.wordmark || path === BRAND.icon) {
    return true
  }
  return objectKeyFromFileUrl(path) !== null
}

export function invoiceLogoPath(
  snapshot: { path?: string } | undefined,
): string {
  const path = snapshot?.path?.trim() ?? ''
  if (isAllowedBrandingPath(path)) {
    return path
  }
  return BRAND.icon
}
