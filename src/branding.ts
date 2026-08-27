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

const KIND_GROUP = 'site-wordmark|site-icon|invoice-logo'
const UUID36 = '[0-9a-f-]{36}'
const LEGACY_OBJECT_KEY = new RegExp(
  `^branding/(${KIND_GROUP})/${UUID36}\\.(png|jpg|webp)$`,
  'i',
)
const TENANT_OBJECT_KEY = new RegExp(
  `^branding/(${UUID36})/(${KIND_GROUP})/${UUID36}\\.(png|jpg|webp)$`,
  'i',
)

export function isSafeObjectKey(key: string): boolean {
  if (key.includes('..') || key.includes('\\')) {
    return false
  }
  return LEGACY_OBJECT_KEY.test(key) || TENANT_OBJECT_KEY.test(key)
}

export function companyIdFromObjectKey(key: string): string | null {
  const match = TENANT_OBJECT_KEY.exec(key)
  return match?.[1] ?? null
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
